/* ==========================================================================
   Données partagées entre la vue desktop et la vue mobile
   ========================================================================== */
const MODULES = [
    { page: 'lunettes', icon: 'ic-glasses', title: 'Suivi des lunettes', desc: 'Répartition des montures entre le stock central et les magasins.', available: true },
    { page: 'enregistrement', icon: 'ic-plus', title: 'Enregistrer une monture', desc: "Ouvrir l'assistant d'enregistrement d'une nouvelle monture en stock.", available: true },
    { page: 'ca', icon: 'ic-chart-bar', title: "Chiffre d'affaires", desc: 'Statistiques de CA par période, magasin et vendeur.' },
    { page: 'employes', icon: 'ic-users', title: 'Suivi des employés', desc: 'Vue consolidée des employés et de leur activité.' },
    { page: 'paiements', icon: 'ic-credit-card', title: 'Demandes de paiement', desc: 'Demandes de paiement des employés et fournisseurs.' },
    { page: 'commandes', icon: 'ic-cart', title: 'Suivi des commandes', desc: 'Envois vers les sous-stations par date, pays et nombre de montures.', available: true },
    { page: 'compta', icon: 'ic-briefcase', title: 'Comptabilité', desc: 'Tableaux comptables, charges et bilans.' },
    { page: 'planning', icon: 'ic-calendar', title: 'Plannings', desc: 'Plannings des employés par poste et par semaine.' },
    { page: 'reclamations', icon: 'ic-exclamation-triangle', title: 'Réclamations', desc: 'Réclamations clients et suivi de leur résolution.' },
    { page: 'messagerie', icon: 'ic-message', title: 'Messagerie générale', desc: "Messagerie interne entre les postes et l'administration." }
];

// STORES est alimenté par loadDashboardData() à partir des vraies stations/montures
// (table stations + glasses). Tant que les données ne sont pas chargées, ces listes
// restent vides et les vues affichent un état de chargement/vide plutôt que de planter.
let STORES = [];
let STOCK_CENTRAL = 0;
let TOTAL_MAGASIN = 0;
let TOTAL_GLOBAL = 0;
function storeTotal(store) { return store.stockLocal + store.presentoir + store.labo + store.reserve; }

let stationsList = [];
function stationNameById(id) {
    const station = stationsList.find(function (s) { return Number(s.id) === Number(id); });
    return station ? station.name : 'Non assigné';
}

function formatNumber(value) { return Number(value).toLocaleString('fr-FR'); }
function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
}

const roles = [
    { id: 1, name: 'SUPER_ADMIN', label: 'Super administrateur' },
    { id: 2, name: 'ADMIN', label: 'Administrateur' },
    { id: 3, name: 'MAGASINIER', label: 'Magasinier' },
    { id: 4, name: 'VENDEUR', label: 'Vendeur' },
    { id: 5, name: 'LABORATOIRE', label: 'Laboratoire' },
    { id: 6, name: 'RESPONSABLE_STATION', label: 'Responsable de station' },
    { id: 7, name: 'DIRECTION', label: 'Direction' }
];
const roleIdToName = Object.fromEntries(roles.map(function (r) { return [r.id, r.name]; }));
const roleLabels = Object.fromEntries(roles.map(function (r) { return [r.name, r.label]; }));
function getRoleName(user) { return user.role_name || roleIdToName[user.role_id] || 'ADMIN'; }
function formatRole(roleName) { return roleLabels[roleName] || roleName || 'Employé'; }

const avatarColors = ['#2c4055', '#c9a84c', '#2ecc71', '#e74c3c', '#3498db', '#9b59b6', '#e67e22', '#1abc9c'];
function getInitials(name) { return String(name || '').split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2); }
function getAvatarColor(name) {
    let hash = 0;
    const str = String(name || '');
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
}

/* ==========================================================================
   CONNEXION AU BACKEND (table stations + glasses réelles)
   ========================================================================== */
const API_URL = 'https://api-lunetterie.universearch.com/api/v1';
const STOCK_STATUSES = ['EN_STOCK_GENERAL', 'EN_STOCK_SOUS_STATION', 'EN_PRESENTOIR', 'EN_LABORATOIRE', 'RESERVEE', 'VENDUE'];

function getAuthUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { return null; }
}
function authHeaders(extra) {
    const token = localStorage.getItem('token');
    return Object.assign({}, extra || {}, { 'Authorization': `Bearer ${token}` });
}

// Compte les montures d'une station par statut (stockLocal/présentoir/labo/réserve/vendues)
async function fetchStationBreakdown(station) {
    const breakdown = { id: String(station.id), label: station.name, stockLocal: 0, presentoir: 0, labo: 0, reserve: 0, vendues: 0, enTransit: 0 };
    try {
        const response = await fetch(`${API_URL}/inventory/glasses?station_id=${station.id}&status=${STOCK_STATUSES.join(',')}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        const glasses = (response.ok && json.success && Array.isArray(json.data && json.data.glasses)) ? json.data.glasses : [];
        glasses.forEach(function (glass) {
            if (glass.status === 'EN_STOCK_GENERAL' || glass.status === 'EN_STOCK_SOUS_STATION') breakdown.stockLocal++;
            else if (glass.status === 'EN_PRESENTOIR') breakdown.presentoir++;
            else if (glass.status === 'EN_LABORATOIRE') breakdown.labo++;
            else if (glass.status === 'RESERVEE') breakdown.reserve++;
            else if (glass.status === 'VENDUE') breakdown.vendues++;
        });
    } catch (error) {
        console.error('Erreur chargement montures station #' + station.id, error);
    }
    return breakdown;
}

// Compte, par station de destination, les montures actuellement en transit vers elle.
// glasses.station_id reste sur la station d'ORIGINE tant que le transfert n'est pas
// réceptionné : on passe donc par la table transferts (to_station_id) plutôt que par
// /inventory/glasses.
let inTransitTransfers = [];
async function fetchInTransitCounts() {
    const counts = {};
    try {
        const response = await fetch(`${API_URL}/inventory/transfers?status=IN_TRANSIT`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        const transfers = (response.ok && json.success && Array.isArray(json.data)) ? json.data : [];
        inTransitTransfers = transfers;
        transfers.forEach(function (transfer) {
            const items = Array.isArray(transfer.items) ? transfer.items : [];
            const pending = items.filter(function (item) { return item.status === 'IN_TRANSIT'; }).length;
            counts[transfer.to_station_id] = (counts[transfer.to_station_id] || 0) + pending;
        });
    } catch (error) {
        console.error('Erreur chargement transferts en transit', error);
        inTransitTransfers = [];
    }
    return counts;
}

async function loadDashboardData() {
    let stations = [];
    try {
        const response = await fetch(`${API_URL}/auth/stations`);
        const json = await response.json().catch(function () { return {}; });
        if (json.success && Array.isArray(json.data && json.data.stations)) stations = json.data.stations;
    } catch (error) {
        console.error('Erreur chargement stations', error);
    }

    stationsList = stations;

    const centralStations = stations.filter(function (s) { return s.type === 'STOCK_GENERAL'; });
    // "Détail par magasin" = les villes (sous-stations) uniquement — le présentoir
    // et le laboratoire ne sont pas des magasins et sont suivis séparément.
    const shopStations = stations.filter(function (s) { return s.type === 'SOUS_STATION'; });

    const [centralBreakdowns, shopBreakdowns, inTransitCounts] = await Promise.all([
        Promise.all(centralStations.map(fetchStationBreakdown)),
        Promise.all(shopStations.map(fetchStationBreakdown)),
        fetchInTransitCounts()
    ]);
    shopBreakdowns.forEach(function (breakdown) {
        breakdown.enTransit = inTransitCounts[breakdown.id] || 0;
    });

    STOCK_CENTRAL = centralBreakdowns.reduce(function (sum, b) { return sum + storeTotal(b); }, 0);
    STORES = shopBreakdowns;
    TOTAL_MAGASIN = STORES.reduce(function (sum, s) { return sum + storeTotal(s); }, 0);
    TOTAL_GLOBAL = TOTAL_MAGASIN + STOCK_CENTRAL;

    if (!dSelectedStoreId || !STORES.some(function (s) { return s.id === dSelectedStoreId; })) {
        dSelectedStoreId = STORES.length ? STORES[0].id : null;
    }
    if (!mSelectedStoreId || !STORES.some(function (s) { return s.id === mSelectedStoreId; })) {
        mSelectedStoreId = STORES.length ? STORES[0].id : null;
    }
}

/* ==========================================================================
   EMPLOYÉS — vue globale par groupe de station (miroir de admin.js, sans les
   actions d'édition/empreinte réservées à l'administration).
   ========================================================================== */
let employees = [];
async function loadEmployees() {
    try {
        const response = await fetch(`${API_URL}/auth/users`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        if (response.ok && json.success && Array.isArray(json.data && json.data.users)) {
            employees = json.data.users.map(function (u) {
                return {
                    id: `EMP-${String(u.id).padStart(3, '0')}`,
                    fullName: `${u.first_name} ${u.last_name}`.trim(),
                    phone: u.phone || '',
                    email: u.email || '',
                    role: getRoleName(u),
                    poste: stationNameById(u.station_id),
                    status: u.is_active ? 'Actif' : 'Inactif'
                };
            });
        } else {
            console.error('Réponse inattendue /auth/users', json);
        }
    } catch (error) {
        console.error('Erreur réseau lors du chargement des utilisateurs', error);
    }
}

/* ==========================================================================
   STOCK — données brutes des mouvements, utilisées par l'activité quotidienne
   et par le suivi des commandes (voir plus bas).
   ========================================================================== */
let stockMovements = [];

function formatDayLabel(key) {
    return new Date(key + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function stockStageOf(stationName) {
    const name = String(stationName || '').toLowerCase();
    if (!name) return null;
    if (name.includes('général') || name.includes('general') || name.includes('principal')) return 'general';
    if (name.includes('présentoir') || name.includes('presentoir')) return 'presentoir';
    if (name.includes('laboratoire') || name.includes('labo')) return 'laboratoire';
    return 'local';
}

async function loadStockMovements() {
    try {
        const response = await fetch(`${API_URL}/inventory/movements?limit=300&offset=0`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        stockMovements = (response.ok && json.success && Array.isArray(json.data && json.data.movements)) ? json.data.movements : [];
    } catch (error) {
        console.error('Erreur chargement mouvements (stock)', error);
        stockMovements = [];
    }
}

function dedupeMovementsByMonture(movements) {
    const byBarcode = new Map();
    movements.forEach(function (m) {
        const existing = byBarcode.get(m.barcode);
        if (!existing || new Date(m.created_at) > new Date(existing.created_at)) byBarcode.set(m.barcode, m);
    });
    return Array.from(byBarcode.values());
}

/* ==========================================================================
   MONTURES — nécessaire uniquement pour la répartition circulaire (forme/
   gamme) du raccourci Présentoir sur l'Accueil.
   ========================================================================== */
let montures = [];
async function loadMonturesFromServer() {
    try {
        const response = await fetch(`${API_URL}/inventory/glasses?status=EN_STOCK_GENERAL,EN_STOCK_SOUS_STATION,EN_PRESENTOIR,EN_LABORATOIRE`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        if (!response.ok || !json.success || !Array.isArray(json.data && json.data.glasses)) {
            console.warn('Réponse inattendue pour les montures', json);
            return;
        }
        montures = json.data.glasses.map(function (g) {
            const status = g.status || 'EN_STOCK_GENERAL';
            const stockLabel = status === 'EN_STOCK_GENERAL' ? 'Stock Général'
                : status === 'EN_STOCK_SOUS_STATION' ? 'Stock local'
                : status === 'EN_PRESENTOIR' ? 'Présentoir'
                : status === 'EN_LABORATOIRE' ? 'Laboratoire' : String(status).replaceAll('_', ' ');
            return {
                reference: g.reference || g.barcode || '',
                marque: g.brand || '',
                forme: g.shape || '',
                couleur: g.color || '',
                prix: g.price || 0,
                stockLabel: stockLabel,
                stockLocation: g.station_name || (g.station && g.station.name) || g.location_code || stockLabel
            };
        });
    } catch (error) {
        console.error('Erreur lors du chargement des montures depuis le serveur', error);
    }
}

function gammeOf(m) {
    const prix = Number(m.prix) || 0;
    if (prix <= 50000) return 'Classique';
    if (prix <= 100000) return 'Moyenne gamme';
    return 'Luxe';
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#c026d3', '#65a30d'];

function computeChartSegments(items, groupBy) {
    const getValue = groupBy === 'gamme' ? gammeOf : function (m) { return m.forme || 'Forme inconnue'; };
    const counts = new Map();
    items.forEach(function (m) { const key = getValue(m); counts.set(key, (counts.get(key) || 0) + 1); });
    const total = items.length;
    const entries = Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1]; });
    let cursor = 0;
    return entries.map(function (entry, i) {
        const label = entry[0], count = entry[1];
        const pct = total ? (count / total * 100) : 0;
        const start = cursor;
        cursor += pct;
        return { label: label, count: count, pct: pct, start: start, end: cursor, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
}

function buildDonutHtml(scoped, groupBy) {
    if (!scoped.length) {
        return `<div class="track-empty"><svg class="i" style="width:28px;height:28px;"><use href="#ic-glasses"/></svg><p>Aucune monture en présentoir pour cette sélection.</p></div>`;
    }
    const segments = computeChartSegments(scoped, groupBy);
    const gradient = segments.map(function (s) { return `${s.color} ${s.start.toFixed(1)}% ${s.end.toFixed(1)}%`; }).join(', ');
    return `<div class="donut-wrap">
        <div class="donut-chart" style="background:conic-gradient(${gradient});">
            <div class="donut-center"><strong>${scoped.length}</strong><span>${scoped.length > 1 ? 'montures' : 'monture'}</span></div>
        </div>
        <div class="donut-legend">${segments.map(function (s) { return `<div class="donut-legend-item"><span class="dot" style="background:${s.color};"></span>${escapeHtml(s.label)}<strong>${s.pct.toFixed(1)}%</strong><span class="muted">(${s.count})</span></div>`; }).join('')}</div>
    </div>`;
}

/* ==========================================================================
   ACCUEIL — raccourci Présentoir (choix du magasin puis répartition circulaire
   par forme/gamme), ouvert dans le panneau glissant existant (dDetailModal).
   ========================================================================== */
let dashPresentoirCity = null;
let dashPresentoirChartBy = 'forme';

function dOpenDashPresentoir() {
    dashPresentoirCity = null;
    dashPresentoirChartBy = 'forme';
    document.getElementById('dDetailModalTitle').textContent = 'Présentoir';
    document.getElementById('dDetailModal').classList.add('active');
    dRenderDashPresentoirModal();
}

function dRenderDashPresentoirModal() {
    const body = document.getElementById('dDetailModalBody');
    if (!body) return;

    if (!dashPresentoirCity) {
        const stageMovements = stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'presentoir'; });
        const latest = dedupeMovementsByMonture(stageMovements);
        const counts = new Map();
        latest.forEach(function (m) { const name = m.to_station_name || 'Ville inconnue'; counts.set(name, (counts.get(name) || 0) + 1); });
        const names = Array.from(counts.keys()).sort(function (a, b) { return counts.get(b) - counts.get(a); });
        body.innerHTML = names.length ? `<div class="date-block-grid stage-grid">${names.map(function (name) {
            return `<button class="date-block" type="button" data-dash-presentoir-city="${escapeHtml(name)}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-map-pin"/></svg></div>
                <div class="date-block-value">${counts.get(name)}</div>
                <div class="date-block-label">${escapeHtml(name)}</div>
                <div class="date-block-sub">${counts.get(name) > 1 ? 'montures' : 'monture'}</div>
            </button>`;
        }).join('')}</div>` : `<div class="track-empty"><p>Aucun magasin avec du présentoir pour le moment.</p></div>`;
        body.querySelectorAll('[data-dash-presentoir-city]').forEach(function (btn) {
            btn.addEventListener('click', function () { dashPresentoirCity = btn.dataset.dashPresentoirCity; dRenderDashPresentoirModal(); });
        });
        return;
    }

    const scoped = montures.filter(function (m) { return m.stockLabel === 'Présentoir' && m.stockLocation === dashPresentoirCity; });
    body.innerHTML = `
        <div class="table-toolbar" style="padding:0 0 14px;">
            <button class="btn btn-ghost" type="button" id="dashPresentoirBack"><svg class="i"><use href="#ic-arrow-left"/></svg><span>Présentoir</span></button>
            <span class="date-detail-label">${escapeHtml(dashPresentoirCity)}</span>
        </div>
        <div class="catalogue-filter-group" style="margin-bottom:14px;">
            <span class="catalogue-filter-label">Par</span>
            <button class="catalogue-filter-block ${dashPresentoirChartBy === 'forme' ? 'active' : ''}" type="button" data-dash-chart-by="forme">Forme</button>
            <button class="catalogue-filter-block ${dashPresentoirChartBy === 'gamme' ? 'active' : ''}" type="button" data-dash-chart-by="gamme">Gamme</button>
        </div>
        ${buildDonutHtml(scoped, dashPresentoirChartBy)}
    `;
    document.getElementById('dashPresentoirBack').addEventListener('click', function () {
        dashPresentoirCity = null;
        dRenderDashPresentoirModal();
    });
    body.querySelectorAll('[data-dash-chart-by]').forEach(function (btn) {
        btn.addEventListener('click', function () { dashPresentoirChartBy = btn.dataset.dashChartBy; dRenderDashPresentoirModal(); });
    });
}

/* ==========================================================================
   EMPLOYÉS — blocs par groupe de station (miroir de admin.js).
   ========================================================================== */
let dEmployeeStationScope = null;
let dEmployeeStationLevel = 'groups';

function employeeStationKind(poste) {
    const name = String(poste || '').toLowerCase();
    if (name.includes('général') || name.includes('general') || name.includes('principal')) return 'general';
    if (name.includes('présentoir') || name.includes('presentoir')) return 'presentoir';
    if (name.includes('laboratoire') || name.includes('labo')) return 'laboratoire';
    return 'local';
}

function dOpenEmployeeStationDetail(scope, label) {
    dEmployeeStationScope = scope;
    document.getElementById('dEmployeeStationGrid').style.display = 'none';
    document.getElementById('dEmployeesDetail').style.display = 'block';
    document.querySelector('#dEmployeesDetail #dEmployeeStationBack span').textContent = label || "Groupes d'employés";
    dRenderEmployeesTable();
}

function dRenderEmployeeStationBlocks() {
    const grid = document.getElementById('dEmployeeStationGrid');
    if (!grid) return;
    const items = [
        { key: 'general', label: 'Station Générale', icon: 'ic-warehouse' },
        { key: 'local', label: 'Sous-stations', icon: 'ic-map-pin' },
        { key: 'presentoir', label: 'Présentoir', icon: 'ic-store' },
        { key: 'laboratoire', label: 'Laboratoire', icon: 'ic-flask' }
    ];
    if (dEmployeeStationLevel === 'cities') {
        const cities = [...new Set(employees.filter(function (e) { return employeeStationKind(e.poste) === 'local'; }).map(function (e) { return e.poste || 'Non assigné'; }))];
        grid.innerHTML = `<button class="date-block" type="button" data-d-employee-back="1"><div class="date-block-icon"><svg class="i"><use href="#ic-arrow-left"/></svg></div><div class="date-block-label">Sous-stations</div><div class="date-block-sub">Retour aux groupes</div></button>` + cities.map(function (city) {
            const total = employees.filter(function (e) { return e.poste === city; }).length;
            return `<button class="date-block" type="button" data-d-employee-city="${escapeHtml(city)}"><div class="date-block-icon"><svg class="i"><use href="#ic-map-pin"/></svg></div><div class="date-block-value">${total}</div><div class="date-block-label">${escapeHtml(city)}</div><div class="date-block-sub">employé${total > 1 ? 's' : ''}</div></button>`;
        }).join('');
        grid.querySelector('[data-d-employee-back]').addEventListener('click', function () { dEmployeeStationLevel = 'groups'; dRenderEmployeeStationBlocks(); });
        grid.querySelectorAll('[data-d-employee-city]').forEach(function (btn) {
            btn.addEventListener('click', function () { dOpenEmployeeStationDetail(btn.dataset.dEmployeeCity, 'Sous-stations · ' + btn.dataset.dEmployeeCity); });
        });
        return;
    }
    grid.innerHTML = items.map(function (item) {
        const total = employees.filter(function (e) { return employeeStationKind(e.poste) === item.key; }).length;
        return `<button class="date-block" type="button" data-d-employee-kind="${item.key}"><div class="date-block-icon"><svg class="i"><use href="#${item.icon}"/></svg></div><div class="date-block-value">${total}</div><div class="date-block-label">${item.label}</div><div class="date-block-sub">${item.key === 'local' ? 'cliquer pour choisir une ville' : 'employé' + (total > 1 ? 's' : '')}</div></button>`;
    }).join('');
    grid.querySelectorAll('[data-d-employee-kind]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (btn.dataset.dEmployeeKind === 'local') { dEmployeeStationLevel = 'cities'; dRenderEmployeeStationBlocks(); return; }
            const item = items.find(function (i) { return i.key === btn.dataset.dEmployeeKind; });
            dOpenEmployeeStationDetail('kind:' + item.key, item.label);
        });
    });
}

function dRenderEmployeesTable() {
    const tbody = document.getElementById('dEmployeesTable');
    if (!tbody) return;
    const search = document.getElementById('dEmployeeSearch').value.toLowerCase();
    const filtered = employees.filter(function (e) {
        const matchScope = !dEmployeeStationScope || (dEmployeeStationScope.startsWith('kind:')
            ? employeeStationKind(e.poste) === dEmployeeStationScope.slice(5)
            : e.poste === dEmployeeStationScope);
        const matchSearch = e.fullName.toLowerCase().includes(search) || e.phone.includes(search) || e.email.toLowerCase().includes(search);
        return matchScope && matchSearch;
    });

    document.getElementById('dEmployeeCount').textContent = `${filtered.length} employés`;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><svg class="i" style="font-size:32px;"><use href="#ic-users"/></svg><p>Aucun employé trouvé</p></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(function (e) {
        return `<tr>
            <td>
                <div class="user-cell">
                    <div class="avatar-sm" style="background:${getAvatarColor(e.fullName)};">${getInitials(e.fullName)}</div>
                    <div class="info">
                        <div class="name">${escapeHtml(e.fullName)}</div>
                        <div class="sub">${escapeHtml(e.email || 'Email non renseigné')}</div>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(e.phone)}</td>
            <td>${escapeHtml(formatRole(e.role))}</td>
            <td><span class="poste-badge"><svg class="i"><use href="#ic-map-pin"/></svg> ${escapeHtml(e.poste || 'Non assigné')}</span></td>
            <td><span class="status-badge ${e.status === 'Actif' ? 'active' : 'inactive'}"><span class="dot"></span>${e.status}</span></td>
        </tr>`;
    }).join('');
}

/* ==========================================================================
   ACTIVITÉ QUOTIDIENNE — montures enregistrées (mouvements de type réception/
   rangement) et vendues, par jour, sur les 7 derniers jours.
   ========================================================================== */
let soldGlasses = [];
async function loadSoldGlasses() {
    try {
        const response = await fetch(`${API_URL}/inventory/glasses?status=VENDUE`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        soldGlasses = (response.ok && json.success && Array.isArray(json.data && json.data.glasses)) ? json.data.glasses : [];
    } catch (error) {
        console.error('Erreur chargement montures vendues', error);
        soldGlasses = [];
    }
}

// Le backend n'expose pas de champ de date de vente dédié et confirmé : on
// retient la première date plausible trouvée sur l'objet (mêmes conventions
// défensives que imageUrlOf() dans historique.js).
function soldDateOf(glass) {
    return glass.sold_at || glass.updated_at || glass.date_vente || glass.created_at || null;
}

function dayKey(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
}

function dRenderDailyStats() {
    const container = document.getElementById('dDailyStats');
    if (!container) return;

    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }

    const registeredByDay = {};
    stockMovements.forEach(function (m) {
        if (m.action !== 'RANGEMENT' && m.action !== 'RECEPTION_FOURNISSEUR') return;
        const key = dayKey(m.created_at);
        if (!key) return;
        registeredByDay[key] = (registeredByDay[key] || 0) + 1;
    });

    const soldByDay = {};
    soldGlasses.forEach(function (g) {
        const key = dayKey(soldDateOf(g));
        if (!key) return;
        soldByDay[key] = (soldByDay[key] || 0) + 1;
    });

    container.innerHTML = days.map(function (key) {
        const label = new Date(key + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const registered = registeredByDay[key] || 0;
        const sold = soldByDay[key] || 0;
        return `<div class="activity-row">
            <div class="glass-photo"><svg class="i"><use href="#ic-calendar"/></svg></div>
            <div class="activity-main">
                <div class="activity-title"><strong>${escapeHtml(label)}</strong></div>
                <div class="activity-meta"><span class="badge">${registered} enregistrée${registered > 1 ? 's' : ''}</span><span class="badge">${sold} vendue${sold > 1 ? 's' : ''}</span></div>
            </div>
        </div>`;
    }).join('');
}

/* ==========================================================================
   VUE DESKTOP
   ========================================================================== */
let dSelectedStoreId = null;

const D_TITLES = {
    home: { icon: 'ic-chart-pie', title: "Vue d'ensemble", sub: 'Accès rapide à tous les modules de pilotage' },
    ca: { icon: 'ic-chart-bar', title: "Chiffre d'affaires", sub: 'Statistiques par période, magasin et vendeur' },
    employes: { icon: 'ic-users', title: 'Suivi des employés', sub: 'Vue consolidée des employés et de leur activité' },
    paiements: { icon: 'ic-credit-card', title: 'Demandes de paiement', sub: 'Employés et fournisseurs' },
    commandes: { icon: 'ic-cart', title: 'Suivi des commandes', sub: 'Fournisseurs et clients' },
    compta: { icon: 'ic-briefcase', title: 'Comptabilité', sub: 'Charges et bilans' },
    planning: { icon: 'ic-calendar', title: 'Plannings', sub: 'Par poste et par semaine' },
    reclamations: { icon: 'ic-exclamation-triangle', title: 'Réclamations', sub: 'Suivi et résolution' },
    messagerie: { icon: 'ic-message', title: 'Messagerie générale', sub: "Entre les postes et l'administration" },
    lunettes: { icon: 'ic-glasses', title: 'Suivi des lunettes', sub: "Répartition des montures entre l'entrepôt central et les magasins" },
    enregistrement: { icon: 'ic-plus', title: 'Enregistrer une monture', sub: 'Sessions précédentes par jour, ou nouvel enregistrement' }
};

function dRenderModuleGrid() {
    const grid = document.getElementById('dModuleGrid');
    grid.innerHTML = MODULES.map(function (m) {
        return '<button class="module-card" type="button" data-page="' + m.page + '">' +
            '<div class="module-icon"><svg class="i"><use href="#' + m.icon + '"/></svg></div>' +
            '<h4>' + escapeHtml(m.title) + '</h4>' +
            '<p>' + escapeHtml(m.desc) + '</p>' +
            '<span class="module-tag">' + (m.available ? 'Voir le suivi' : 'Bientôt disponible') + '</span>' +
            '</button>';
    }).join('');
    grid.querySelectorAll('[data-page]').forEach(function (card) {
        card.addEventListener('click', function () { dNavigateTo(card.dataset.page); });
    });
}

function dNavigateTo(page) {
    document.querySelectorAll('#dPageContent > section').forEach(function (section) { section.style.display = 'none'; });
    const section = document.getElementById(page + 'Section');
    if (section) section.style.display = 'block';

    document.querySelectorAll('#desktopShell .sidebar-menu .menu-item[data-page]').forEach(function (item) {
        item.classList.toggle('active', item.dataset.page === page);
    });

    const info = D_TITLES[page] || D_TITLES.home;
    document.getElementById('dPageTitle').innerHTML = '<svg class="i" style="vertical-align:-3px;margin-right:6px;"><use href="#' + info.icon + '"/></svg>' + escapeHtml(info.title);
    document.getElementById('dPageSubtitle').textContent = info.sub;

    if (page === 'lunettes') {
        dRenderGlobalStats(); dRenderStorePicker(); dRenderStoreDetail();
        dRenderDailyStats();
    }
    if (page === 'employes') {
        dEmployeeStationScope = null;
        dEmployeeStationLevel = 'groups';
        document.getElementById('dEmployeesDetail').style.display = 'none';
        document.getElementById('dEmployeeStationGrid').style.display = 'grid';
        dRenderEmployeeStationBlocks();
    }
    if (page === 'commandes') dRenderCommandes();
    if (page === 'enregistrement') dCloseRegDetail();
}

/* ==========================================================================
   ENREGISTRER UNE MONTURE — sessions précédentes par jour (réceptions
   fournisseur), avant de lancer un nouvel enregistrement dans scan.html.
   ========================================================================== */
function dRenderRegDateBlocks() {
    const grid = document.getElementById('dRegDateGrid');
    if (!grid) return;
    const regs = stockMovements.filter(function (m) { return m.action === 'RECEPTION_FOURNISSEUR'; });
    const counts = new Map();
    regs.forEach(function (m) {
        const key = dayKey(m.created_at);
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    const keys = Array.from(counts.keys()).sort(function (a, b) { return b.localeCompare(a); });
    grid.innerHTML = keys.length ? keys.map(function (key) {
        return `<button class="date-block" type="button" data-reg-date="${key}">
            <div class="date-block-icon"><svg class="i"><use href="#ic-calendar"/></svg></div>
            <div class="date-block-value">${counts.get(key)}</div>
            <div class="date-block-label">${formatDayLabel(key)}</div>
            <div class="date-block-sub">${counts.get(key) > 1 ? 'montures' : 'monture'}</div>
        </button>`;
    }).join('') : `<div class="empty-state"><svg class="i"><use href="#ic-plus"/></svg><p>Aucun enregistrement pour le moment</p></div>`;
    grid.querySelectorAll('[data-reg-date]').forEach(function (btn) {
        btn.addEventListener('click', function () { dOpenRegDate(btn.dataset.regDate); });
    });
}

function dOpenRegDate(dateKey) {
    document.getElementById('dRegDateGrid').style.display = 'none';
    document.getElementById('dRegDetail').style.display = 'block';
    document.getElementById('dRegDetailTitle').textContent = formatDayLabel(dateKey);
    const rows = stockMovements
        .filter(function (m) { return m.action === 'RECEPTION_FOURNISSEUR' && dayKey(m.created_at) === dateKey; })
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    dRenderRegActivity(rows);
}

function dCloseRegDetail() {
    document.getElementById('dRegDetail').style.display = 'none';
    document.getElementById('dRegDateGrid').style.display = 'grid';
    dRenderRegDateBlocks();
}

function dRenderRegActivity(rows) {
    const container = document.getElementById('dRegActivityList');
    if (!rows.length) {
        container.innerHTML = `<div class="track-empty"><svg class="i" style="width:28px;height:28px;"><use href="#ic-plus"/></svg><p>Aucun enregistrement pour cette date.</p></div>`;
        return;
    }
    container.innerHTML = rows.map(function (m) {
        const label = ((m.brand || '') + ' ' + (m.reference || '')).trim();
        return `<div class="activity-row">
            <div class="glass-photo"><svg class="i"><use href="#ic-glasses"/></svg></div>
            <div class="activity-main">
                <div class="activity-title"><strong>${escapeHtml(m.barcode)}</strong>${label ? `<span class="activity-sub">${escapeHtml(label)}</span>` : ''}</div>
                <div class="activity-meta"><span class="badge">${escapeHtml(m.to_station_name || '')}</span><span class="activity-date">${new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
        </div>`;
    }).join('');
}

/* ==========================================================================
   SUIVI DES COMMANDES — envois vers les sous-stations (regroupés par jour et
   ville d'arrivée), avec le pays déduit du nom de la ville, et la date
   d'enregistrement = première réception fournisseur connue pour ces montures.
   ========================================================================== */
const COUNTRY_BY_CITY = {
    'pointe-noire': 'Congo',
    'brazzaville': 'Congo',
    'kinshasa': 'RD Congo',
    'lubumbashi': 'RD Congo',
    'lumumbashi': 'RD Congo'
};
function countryOfCity(cityName) {
    const name = String(cityName || '').toLowerCase();
    for (const key in COUNTRY_BY_CITY) { if (name.includes(key)) return COUNTRY_BY_CITY[key]; }
    return '—';
}

function buildCommandesRows() {
    const shipments = stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'local'; });
    const groups = new Map();
    shipments.forEach(function (m) {
        const day = dayKey(m.created_at);
        if (!day) return;
        const city = m.to_station_name || 'Ville inconnue';
        const key = day + '|' + city;
        if (!groups.has(key)) groups.set(key, { day: day, city: city, barcodes: [] });
        groups.get(key).barcodes.push(m.barcode);
    });

    const registrationByBarcode = new Map();
    stockMovements.filter(function (m) { return m.action === 'RECEPTION_FOURNISSEUR'; }).forEach(function (m) {
        const existing = registrationByBarcode.get(m.barcode);
        if (!existing || new Date(m.created_at) < new Date(existing)) registrationByBarcode.set(m.barcode, m.created_at);
    });

    return Array.from(groups.values()).map(function (g) {
        const regDates = g.barcodes.map(function (bc) { return registrationByBarcode.get(bc); }).filter(Boolean).sort();
        return {
            day: g.day,
            city: g.city,
            country: countryOfCity(g.city),
            count: g.barcodes.length,
            registeredDate: regDates.length ? regDates[0] : null
        };
    }).sort(function (a, b) { return b.day.localeCompare(a.day); });
}

function dRenderCommandes() {
    const tbody = document.getElementById('dCommandesTable');
    if (!tbody) return;
    const rows = buildCommandesRows();
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><svg class="i" style="font-size:32px;"><use href="#ic-cart"/></svg><p>Aucun envoi vers une sous-station pour le moment</p></td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(function (r) {
        return `<tr>
            <td>${formatDayLabel(r.day)}</td>
            <td>${escapeHtml(r.country)}</td>
            <td>${r.count}</td>
            <td>${formatDayLabel(r.day)}</td>
            <td>${r.registeredDate ? new Date(r.registeredDate).toLocaleDateString('fr-FR') : '—'}</td>
        </tr>`;
    }).join('');
}

function dRenderGlobalStats() {
    const cards = [
        { icon: 'ic-glasses', color: 'blue', label: 'Lunettes total', value: TOTAL_GLOBAL, detail: 'total' },
        { icon: 'ic-store', color: 'gold', label: 'Lunettes en magasin', value: TOTAL_MAGASIN, detail: 'magasin' },
        { icon: 'ic-warehouse', color: 'purple', label: 'Lunettes en stock central', value: STOCK_CENTRAL, detail: 'stock' }
    ];
    document.getElementById('dGlobalStats').innerHTML = cards.map(function (card) {
        return '<button class="stat-card stat-card-link" type="button" data-detail="' + card.detail + '">' +
            '<div class="stat-header"><div class="stat-icon ' + card.color + '"><svg class="i"><use href="#' + card.icon + '"/></svg></div></div>' +
            '<div class="stat-value">' + formatNumber(card.value) + '</div>' +
            '<div class="stat-label">' + card.label + '</div>' +
            '</button>';
    }).join('');
    document.getElementById('dGlobalStats').querySelectorAll('[data-detail]').forEach(function (btn) {
        btn.addEventListener('click', function () { dOpenGlobalDetail(btn.dataset.detail); });
    });
}

function dRenderStorePicker() {
    document.getElementById('dStorePicker').innerHTML = STORES.map(function (store) {
        const active = store.id === dSelectedStoreId;
        return '<button class="btn ' + (active ? 'btn-primary' : 'btn-outline') + ' store-btn" type="button" data-store="' + store.id + '">' + store.label + '</button>';
    }).join('');
    document.getElementById('dStorePicker').querySelectorAll('[data-store]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            dSelectedStoreId = btn.dataset.store;
            dRenderStorePicker();
            dRenderStoreDetail();
        });
    });
}

function dRenderStoreDetail() {
    const store = STORES.find(function (s) { return s.id === dSelectedStoreId; });
    if (!store) {
        document.getElementById('dStoreStats').innerHTML = '';
        document.getElementById('dSplitLabel').textContent = 'Répartition';
        document.getElementById('dSplitBar').innerHTML = '';
        document.getElementById('dSplitLegend').innerHTML = '<p class="empty-history">Aucune monture trouvée.</p>';
        document.getElementById('dPendingStats').innerHTML = '';
        return;
    }
    const total = storeTotal(store);

    const cards = [
        { icon: 'ic-warehouse', color: 'blue', label: 'Stock local', value: store.stockLocal, detail: 'stockLocal' },
        { icon: 'ic-display', color: 'green', label: 'Présentoir', value: store.presentoir, detail: 'presentoir' },
        { icon: 'ic-flask', color: 'orange', label: 'Labo', value: store.labo, detail: 'labo' },
        { icon: 'ic-archive', color: 'purple', label: 'Réserve', value: store.reserve, detail: 'reserve' }
    ];
    document.getElementById('dStoreStats').innerHTML = cards.map(function (card) {
        return '<button class="stat-card stat-card-link" type="button" data-store-detail="' + card.detail + '">' +
            '<div class="stat-header"><div class="stat-icon ' + card.color + '"><svg class="i"><use href="#' + card.icon + '"/></svg></div></div>' +
            '<div class="stat-value">' + formatNumber(card.value) + '</div>' +
            '<div class="stat-label">' + card.label + ' · ' + store.label + '</div>' +
            '</button>';
    }).join('');
    document.getElementById('dStoreStats').querySelectorAll('[data-store-detail]').forEach(function (btn) {
        btn.addEventListener('click', function () { dOpenStoreDetail(btn.dataset.storeDetail, store); });
    });

    document.getElementById('dSplitLabel').textContent = 'Répartition · ' + store.label + ' (' + formatNumber(total) + ' montures)';

    const segments = [
        { label: 'Stock local', value: store.stockLocal, cls: 'seg-blue' },
        { label: 'Présentoir', value: store.presentoir, cls: 'seg-green' },
        { label: 'Labo', value: store.labo, cls: 'seg-orange' },
        { label: 'Réserve', value: store.reserve, cls: 'seg-purple' }
    ];
    document.getElementById('dSplitBar').innerHTML = segments.map(function (s) {
        const pct = total ? (s.value / total * 100) : 0;
        return '<div class="split-seg ' + s.cls + '" style="width:' + pct.toFixed(1) + '%" title="' + s.label + ' · ' + pct.toFixed(1) + '%"></div>';
    }).join('');
    document.getElementById('dSplitLegend').innerHTML = segments.map(function (s) {
        const pct = total ? (s.value / total * 100) : 0;
        return '<div class="split-legend-item"><span class="dot ' + s.cls + '"></span>' + s.label + '<strong>' + pct.toFixed(1) + '%</strong><span class="muted">(' + formatNumber(s.value) + ')</span></div>';
    }).join('');

    document.getElementById('dPendingStats').innerHTML =
        '<button class="stat-card stat-card-link" type="button" data-store-detail="vendues"><div class="stat-header"><div class="stat-icon blue"><svg class="i"><use href="#ic-store"/></svg></div></div><div class="stat-value">' + formatNumber(store.vendues) + '</div><div class="stat-label">Montures vendues · ' + store.label + '</div></button>' +
        '<button class="stat-card stat-card-link" type="button" data-store-detail="transit"><div class="stat-header"><div class="stat-icon green"><svg class="i"><use href="#ic-warehouse"/></svg></div></div><div class="stat-value">' + formatNumber(store.enTransit) + '</div><div class="stat-label">En transit vers ' + store.label + '</div></button>';
    document.getElementById('dPendingStats').querySelectorAll('[data-store-detail]').forEach(function (btn) {
        btn.addEventListener('click', function () { dOpenStoreDetail(btn.dataset.storeDetail, store); });
    });
}

function dCloseDetailModal() {
    document.getElementById('dDetailModal').classList.remove('active');
    dLunettesDrill = null;
}

/* ==========================================================================
   SUIVI DES LUNETTES — chaque bloc ouvre le même parcours : Ville (sauf si
   déjà fixée par le contexte) → Date → Liste, sur la base des mouvements.
   ========================================================================== */
let dLunettesDrill = null;

function dOpenLunettesDrill(title, movements, cityFixed) {
    dLunettesDrill = { movements: movements, city: cityFixed || null, cityFixed: !!cityFixed, date: null };
    document.getElementById('dDetailModalTitle').textContent = title;
    document.getElementById('dDetailModal').classList.add('active');
    dRenderLunettesDrill();
}

function dOpenGlobalDetail(detail) {
    const titles = { total: 'Lunettes total', magasin: 'Lunettes en magasin', stock: 'Lunettes en stock central' };
    const filters = {
        total: function () { return stockMovements; },
        magasin: function () { return stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'local'; }); },
        stock: function () { return stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'general'; }); }
    };
    const getMovements = filters[detail] || function () { return []; };
    dOpenLunettesDrill(titles[detail] || 'Détail', getMovements(), null);
}

function dOpenStoreDetail(detail, store) {
    if (detail === 'vendues') { dOpenVenduesDrill(store); return; }
    if (detail === 'transit') { dOpenTransitDrill(store); return; }
    const titles = { stockLocal: 'Stock local · ' + store.label, presentoir: 'Présentoir', labo: 'Laboratoire', reserve: 'Réserve · ' + store.label };
    if (detail === 'stockLocal') {
        dOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'local' && m.to_station_name === store.label; }), store.label);
    } else if (detail === 'presentoir') {
        dOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'presentoir'; }), null);
    } else if (detail === 'labo') {
        dOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'laboratoire'; }), null);
    } else if (detail === 'reserve') {
        dOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return m.action === 'RESERVATION' && m.to_station_name === store.label; }), store.label);
    }
}

function dRenderLunettesDrill() {
    const body = document.getElementById('dDetailModalBody');
    if (!body || !dLunettesDrill) return;
    const drill = dLunettesDrill;

    if (!drill.city) {
        const latest = dedupeMovementsByMonture(drill.movements);
        const counts = new Map();
        latest.forEach(function (m) { const name = m.to_station_name || 'Ville inconnue'; counts.set(name, (counts.get(name) || 0) + 1); });
        const names = Array.from(counts.keys()).sort(function (a, b) { return counts.get(b) - counts.get(a); });
        body.innerHTML = names.length ? `<div class="date-block-grid stage-grid">${names.map(function (name) {
            return `<button class="date-block" type="button" data-lunettes-city="${escapeHtml(name)}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-map-pin"/></svg></div>
                <div class="date-block-value">${counts.get(name)}</div>
                <div class="date-block-label">${escapeHtml(name)}</div>
                <div class="date-block-sub">${counts.get(name) > 1 ? 'montures' : 'monture'}</div>
            </button>`;
        }).join('')}</div>` : `<div class="track-empty"><p>Aucune ville pour cette sélection.</p></div>`;
        body.querySelectorAll('[data-lunettes-city]').forEach(function (btn) {
            btn.addEventListener('click', function () { drill.city = btn.dataset.lunettesCity; drill.date = null; dRenderLunettesDrill(); });
        });
        return;
    }

    const cityScoped = drill.movements.filter(function (m) { return m.to_station_name === drill.city; });

    if (!drill.date) {
        const latest = dedupeMovementsByMonture(cityScoped);
        const counts = new Map();
        latest.forEach(function (m) { const key = dayKey(m.created_at); if (!key) return; counts.set(key, (counts.get(key) || 0) + 1); });
        const keys = Array.from(counts.keys()).sort(function (a, b) { return b.localeCompare(a); });
        const backBtn = !drill.cityFixed ? `<div class="table-toolbar" style="padding:0 0 14px;"><button class="btn btn-ghost" type="button" id="dLunettesBack"><svg class="i"><use href="#ic-arrow-left"/></svg><span>Villes</span></button><span class="date-detail-label">${escapeHtml(drill.city)}</span></div>` : '';
        body.innerHTML = backBtn + (keys.length ? `<div class="date-block-grid stage-grid">${keys.map(function (key) {
            return `<button class="date-block" type="button" data-lunettes-date="${key}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-calendar"/></svg></div>
                <div class="date-block-value">${counts.get(key)}</div>
                <div class="date-block-label">${formatDayLabel(key)}</div>
                <div class="date-block-sub">${counts.get(key) > 1 ? 'montures' : 'monture'}</div>
            </button>`;
        }).join('')}</div>` : `<div class="track-empty"><p>Aucune date pour cette sélection.</p></div>`);
        if (!drill.cityFixed) document.getElementById('dLunettesBack').addEventListener('click', function () { drill.city = null; dRenderLunettesDrill(); });
        body.querySelectorAll('[data-lunettes-date]').forEach(function (btn) {
            btn.addEventListener('click', function () { drill.date = btn.dataset.lunettesDate; dRenderLunettesDrill(); });
        });
        return;
    }

    const rows = dedupeMovementsByMonture(cityScoped.filter(function (m) { return dayKey(m.created_at) === drill.date; }))
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    body.innerHTML = `<div class="table-toolbar" style="padding:0 0 14px;">
            <button class="btn btn-ghost" type="button" id="dLunettesBack"><svg class="i"><use href="#ic-arrow-left"/></svg><span>Dates</span></button>
            <span class="date-detail-label">${escapeHtml(drill.city)} <span class="date-detail-sep">›</span> ${formatDayLabel(drill.date)}</span>
        </div>` +
        (rows.length ? `<div class="activity-list">${rows.map(function (m) {
            const label = ((m.brand || '') + ' ' + (m.reference || '')).trim();
            const route = [m.from_station_name, m.to_station_name].filter(Boolean).join(' → ');
            return `<div class="activity-row">
                <div class="glass-photo"><svg class="i"><use href="#ic-glasses"/></svg></div>
                <div class="activity-main">
                    <div class="activity-title"><strong>${escapeHtml(m.barcode)}</strong>${label ? `<span class="activity-sub">${escapeHtml(label)}</span>` : ''}</div>
                    <div class="activity-meta"><span class="badge">${escapeHtml(m.action || '')}</span>${route ? `<span class="activity-where">${escapeHtml(route)}</span>` : ''}<span class="activity-date">${new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                </div>
            </div>`;
        }).join('')}</div>` : `<div class="track-empty"><p>Aucun mouvement pour cette date.</p></div>`);
    document.getElementById('dLunettesBack').addEventListener('click', function () { drill.date = null; dRenderLunettesDrill(); });
}

/* Montures vendues — Date → Liste (soldGlasses, déjà scopé au magasin). */
let dVenduesDrill = null;
function dOpenVenduesDrill(store) {
    const items = soldGlasses.filter(function (g) { return (g.station_name || (g.station && g.station.name)) === store.label; });
    dVenduesDrill = { store: store, items: items, date: null };
    document.getElementById('dDetailModalTitle').textContent = 'Montures vendues · ' + store.label;
    document.getElementById('dDetailModal').classList.add('active');
    dRenderVenduesDrill();
}
function dRenderVenduesDrill() {
    const body = document.getElementById('dDetailModalBody');
    if (!body || !dVenduesDrill) return;
    const drill = dVenduesDrill;

    if (!drill.date) {
        const counts = new Map();
        drill.items.forEach(function (g) { const key = dayKey(soldDateOf(g)); if (!key) return; counts.set(key, (counts.get(key) || 0) + 1); });
        const keys = Array.from(counts.keys()).sort(function (a, b) { return b.localeCompare(a); });
        body.innerHTML = keys.length ? `<div class="date-block-grid stage-grid">${keys.map(function (key) {
            return `<button class="date-block" type="button" data-vendues-date="${key}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-calendar"/></svg></div>
                <div class="date-block-value">${counts.get(key)}</div>
                <div class="date-block-label">${formatDayLabel(key)}</div>
                <div class="date-block-sub">${counts.get(key) > 1 ? 'montures' : 'monture'}</div>
            </button>`;
        }).join('')}</div>` : `<div class="track-empty"><p>Aucune monture vendue pour ce magasin.</p></div>`;
        body.querySelectorAll('[data-vendues-date]').forEach(function (btn) {
            btn.addEventListener('click', function () { drill.date = btn.dataset.venduesDate; dRenderVenduesDrill(); });
        });
        return;
    }

    const rows = drill.items.filter(function (g) { return dayKey(soldDateOf(g)) === drill.date; });
    body.innerHTML = `<div class="table-toolbar" style="padding:0 0 14px;">
            <button class="btn btn-ghost" type="button" id="dVenduesBack"><svg class="i"><use href="#ic-arrow-left"/></svg><span>Dates</span></button>
            <span class="date-detail-label">${formatDayLabel(drill.date)}</span>
        </div>` +
        `<div class="activity-list">${rows.map(function (g) {
            const label = ((g.brand || '') + ' ' + (g.reference || '')).trim();
            return `<div class="activity-row">
                <div class="glass-photo"><svg class="i"><use href="#ic-glasses"/></svg></div>
                <div class="activity-main">
                    <div class="activity-title"><strong>${escapeHtml(g.barcode || '')}</strong>${label ? `<span class="activity-sub">${escapeHtml(label)}</span>` : ''}</div>
                    <div class="activity-meta"><span class="badge">VENTE</span>${g.price ? `<span class="activity-where">${formatNumber(g.price)} FCFA</span>` : ''}</div>
                </div>
            </div>`;
        }).join('')}</div>`;
    document.getElementById('dVenduesBack').addEventListener('click', function () { drill.date = null; dRenderVenduesDrill(); });
}

/* En transit — liste des envois en cours (pas de détail par date : seule la
   date d'envoi du lot est connue, pas de mouvement individuel confirmé). */
function dOpenTransitDrill(store) {
    document.getElementById('dDetailModalTitle').textContent = 'En transit vers ' + store.label;
    const relevant = inTransitTransfers.filter(function (t) { return String(t.to_station_id) === String(store.id); });
    const body = document.getElementById('dDetailModalBody');
    if (!relevant.length) {
        body.innerHTML = `<div class="track-empty"><p>Aucun envoi en cours vers ${escapeHtml(store.label)}.</p></div>`;
    } else {
        body.innerHTML = `<div class="activity-list">${relevant.map(function (t) {
            const pending = (Array.isArray(t.items) ? t.items : []).filter(function (item) { return item.status === 'IN_TRANSIT'; }).length;
            const date = t.created_at ? new Date(t.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            return `<div class="activity-row">
                <div class="glass-photo"><svg class="i"><use href="#ic-warehouse"/></svg></div>
                <div class="activity-main">
                    <div class="activity-title"><strong>${pending} monture${pending > 1 ? 's' : ''}</strong></div>
                    <div class="activity-meta"><span class="activity-date">Envoyé le ${date}</span></div>
                </div>
            </div>`;
        }).join('')}</div>`;
    }
    document.getElementById('dDetailModal').classList.add('active');
}

/* ==========================================================================
   VUE MOBILE
   ========================================================================== */
let mActiveTab = 'home';
let mHomeDetailOpen = false;
let mSelectedStoreId = null;

function mSetTopbar(title, showBack) {
    document.getElementById('mTopbarTitle').textContent = title;
    document.getElementById('mBackBtn').style.visibility = showBack ? 'visible' : 'hidden';
}

const M_TAB_TITLES = { home: 'Espace Gérant', lunettes: 'Suivi des lunettes', messagerie: 'Messagerie générale' };
function mSwitchTab(tab) {
    mActiveTab = tab;
    document.querySelectorAll('#mobileShell .tab-panel').forEach(function (panel) { panel.classList.toggle('active', panel.dataset.panel === tab); });
    document.querySelectorAll('#mTabBar .tab-btn').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.tab === tab); });
    mCloseHomeDetail();
    mSetTopbar(M_TAB_TITLES[tab] || M_TAB_TITLES.home, false);
}

function mRenderModuleList() {
    document.getElementById('mModuleList').innerHTML = MODULES.map(function (m) {
        return '<button class="mobile-card" type="button" data-page="' + m.page + '">' +
            '<span class="card-icon"><svg class="i"><use href="#' + m.icon + '"/></svg></span>' +
            '<span class="card-text"><h4>' + escapeHtml(m.title) + '</h4><p>' + escapeHtml(m.desc) + '</p></span>' +
            '<span class="card-chevron"><svg class="i"><use href="#ic-arrow-right"/></svg></span>' +
            '</button>';
    }).join('');
    document.querySelectorAll('#mModuleList [data-page]').forEach(function (card) {
        card.addEventListener('click', function () {
            if (card.dataset.page === 'lunettes') mSwitchTab('lunettes');
            else mOpenHomeDetail(card.dataset.page);
        });
    });
}

function mOpenHomeDetail(page) {
    const module = MODULES.find(function (m) { return m.page === page; });
    if (!module) return;
    const detail = document.getElementById('mHomeDetailScreen');
    if (page === 'commandes') {
        const rows = buildCommandesRows();
        detail.innerHTML = rows.length ? '<div style="padding:4px 2px;">' + rows.map(function (r) {
            return '<div style="display:flex;flex-direction:column;gap:4px;padding:14px 0;border-bottom:1px solid var(--line-soft);">' +
                '<strong>' + formatDayLabel(r.day) + ' · ' + escapeHtml(r.city) + '</strong>' +
                '<span>' + escapeHtml(r.country) + ' · ' + r.count + ' monture' + (r.count > 1 ? 's' : '') + '</span>' +
                '<span style="color:var(--ink-soft);font-size:12px;">Enregistrée le ' + (r.registeredDate ? new Date(r.registeredDate).toLocaleDateString('fr-FR') : '—') + '</span>' +
                '</div>';
        }).join('') + '</div>' : '<p class="mobile-empty">Aucun envoi vers une sous-station pour le moment</p>';
    } else if (page === 'enregistrement') {
        const regs = stockMovements.filter(function (m) { return m.action === 'RECEPTION_FOURNISSEUR'; });
        const counts = new Map();
        regs.forEach(function (m) {
            const key = dayKey(m.created_at);
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        const keys = Array.from(counts.keys()).sort(function (a, b) { return b.localeCompare(a); });
        detail.innerHTML = '<button class="mobile-action-btn" type="button" id="mGoToScanBtn"><svg class="i"><use href="#ic-plus"/></svg> Nouvel enregistrement</button>' +
            (keys.length ? '<div style="padding:4px 2px;">' + keys.map(function (key) {
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--line-soft);">' +
                    '<strong>' + formatDayLabel(key) + '</strong>' +
                    '<span>' + counts.get(key) + ' monture' + (counts.get(key) > 1 ? 's' : '') + '</span>' +
                    '</div>';
            }).join('') + '</div>' : '<p class="mobile-empty">Aucun enregistrement pour le moment</p>');
    } else {
        detail.innerHTML = '<div class="detail-empty">' +
            '<div class="empty-icon"><svg class="i"><use href="#' + module.icon + '"/></svg></div>' +
            '<h4>Module en développement</h4>' +
            '<p>' + escapeHtml(module.desc) + '</p>' +
            '<span class="tag">Bientôt disponible</span>' +
            '</div>';
    }
    const goToScanBtn = document.getElementById('mGoToScanBtn');
    if (goToScanBtn) goToScanBtn.addEventListener('click', function () { window.location.href = 'scan.html'; });
    detail.classList.add('show');
    mHomeDetailOpen = true;
    mSetTopbar(module.title, true);
}
function mCloseHomeDetail() {
    document.getElementById('mHomeDetailScreen').classList.remove('show');
    mHomeDetailOpen = false;
    if (mActiveTab === 'home') mSetTopbar('Espace Gérant', false);
}

function mRenderStatCarousel() {
    const tiles = [
        { icon: 'ic-glasses', color: 'blue', value: TOTAL_GLOBAL, label: 'Lunettes total', detail: 'total' },
        { icon: 'ic-store', color: 'gold', value: TOTAL_MAGASIN, label: 'Lunettes en magasin', detail: 'magasin' },
        { icon: 'ic-warehouse', color: 'purple', value: STOCK_CENTRAL, label: 'Lunettes en stock central', detail: 'stock' }
    ];
    document.getElementById('mStatCarousel').innerHTML = tiles.map(function (t) {
        return '<div class="stat-tile-m">' +
            '<div class="stat-icon-m ' + t.color + '"><svg class="i"><use href="#' + t.icon + '"/></svg></div>' +
            '<div class="stat-value-m">' + formatNumber(t.value) + '</div>' +
            '<div class="stat-label-m">' + t.label + '</div>' +
            '<button class="stat-detail-m" type="button" data-detail="' + t.detail + '">Voir détail</button>' +
            '</div>';
    }).join('');
    document.querySelectorAll('#mStatCarousel [data-detail]').forEach(function (btn) {
        btn.addEventListener('click', function () { mOpenStatSheet(btn.dataset.detail); });
    });
}

function mRenderStoreSegmented() {
    document.getElementById('mStoreSegmented').innerHTML = STORES.map(function (s) {
        return '<button class="seg-btn' + (s.id === mSelectedStoreId ? ' active' : '') + '" type="button" data-store="' + s.id + '">' + s.label + '</button>';
    }).join('');
    document.querySelectorAll('#mStoreSegmented [data-store]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            mSelectedStoreId = btn.dataset.store;
            mRenderStoreSegmented();
            mRenderStoreDetail();
        });
    });
}

function mRenderStoreDetail() {
    const store = STORES.find(function (s) { return s.id === mSelectedStoreId; });
    if (!store) {
        document.getElementById('mStoreMiniGrid').innerHTML = '';
        document.getElementById('mSplitLabel').textContent = 'Répartition';
        document.getElementById('mSplitBarM').innerHTML = '';
        document.getElementById('mSplitLegendM').innerHTML = '<p class="empty-history">Aucune monture trouvée.</p>';
        document.getElementById('mPendingRow').innerHTML = '';
        return;
    }
    const total = storeTotal(store);

    const tiles = [
        { icon: 'ic-warehouse', color: 'blue', value: store.stockLocal, label: 'Stock local' },
        { icon: 'ic-display', color: 'green', value: store.presentoir, label: 'Présentoir' },
        { icon: 'ic-flask', color: 'orange', value: store.labo, label: 'Labo' },
        { icon: 'ic-archive', color: 'purple', value: store.reserve, label: 'Réserve' }
    ];
    document.getElementById('mStoreMiniGrid').innerHTML = tiles.map(function (t) {
        return '<div class="mini-tile">' +
            '<div class="mini-icon ' + t.color + '"><svg class="i"><use href="#' + t.icon + '"/></svg></div>' +
            '<div class="mini-value">' + formatNumber(t.value) + '</div>' +
            '<div class="mini-label">' + t.label + '</div>' +
            '</div>';
    }).join('');

    document.getElementById('mSplitLabel').textContent = 'Répartition · ' + store.label + ' (' + formatNumber(total) + ' montures)';

    const segments = [
        { label: 'Stock local', value: store.stockLocal, cls: 'seg-blue' },
        { label: 'Présentoir', value: store.presentoir, cls: 'seg-green' },
        { label: 'Labo', value: store.labo, cls: 'seg-orange' },
        { label: 'Réserve', value: store.reserve, cls: 'seg-purple' }
    ];
    document.getElementById('mSplitBarM').innerHTML = segments.map(function (s) {
        const pct = total ? (s.value / total * 100) : 0;
        return '<div class="split-seg-m ' + s.cls + '" style="width:' + pct.toFixed(1) + '%"></div>';
    }).join('');
    document.getElementById('mSplitLegendM').innerHTML = segments.map(function (s) {
        const pct = total ? (s.value / total * 100) : 0;
        return '<div class="item"><span class="dot ' + s.cls + '"></span>' + s.label + '<strong>' + pct.toFixed(1) + '%</strong><span class="muted">(' + formatNumber(s.value) + ')</span></div>';
    }).join('');

    document.getElementById('mPendingRow').innerHTML =
        '<div class="pending-card"><div class="pending-value">' + formatNumber(store.vendues) + '</div><div class="pending-label">Vendues · ' + store.label + '</div></div>' +
        '<div class="pending-card"><div class="pending-value">' + formatNumber(store.enTransit) + '</div><div class="pending-label">En transit</div></div>';
}

function mOpenStatSheet(detail) {
    const titles = { total: 'Lunettes total', magasin: 'Lunettes en magasin', stock: 'Lunettes en stock central' };
    document.getElementById('mSheetTitle').textContent = titles[detail] || 'Détail';
    let body;
    if (detail === 'magasin') {
        body = '<p style="margin-bottom:10px;">Répartition des ' + formatNumber(TOTAL_MAGASIN) + ' montures en magasin, par point de vente.</p>' +
            STORES.map(function (s) { return '<div class="sheet-row"><span>' + s.label + '</span><strong>' + formatNumber(storeTotal(s)) + '</strong></div>'; }).join('');
    } else {
        body = '<div class="detail-empty" style="margin-top:0;padding:24px 10px;"><div class="empty-icon"><svg class="i"><use href="#ic-file-alt"/></svg></div><h4>Détail en développement</h4><p>La ventilation par référence/modèle sera disponible ici.</p></div>';
    }
    document.getElementById('mSheetBody').innerHTML = body;
    mOpenSheet();
}
function mOpenSheet() { document.getElementById('mSheetBackdrop').classList.add('show'); document.getElementById('mBottomSheet').classList.add('show'); }
function mCloseSheet() { document.getElementById('mSheetBackdrop').classList.remove('show'); document.getElementById('mBottomSheet').classList.remove('show'); }

/* ==========================================================================
   THÈME (partagé desktop + mobile)
   ========================================================================== */
const THEME_KEY = 'lunetterie-theme';
function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('#dThemeIcon use, #mThemeIcon use').forEach(function (use) {
        use.setAttribute('href', isDark ? '#ic-moon' : '#ic-sun');
    });
}
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
}

/* ==========================================================================
   INITIALISATION
   La bascule desktop ↔ mobile est automatique (voir direction.css), selon
   la largeur d'écran uniquement — pas de bouton manuel.
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async function () {
    const token = localStorage.getItem('token');
    const user = getAuthUser();
    if (!token || !user) {
        window.location.href = 'index.html';
        return;
    }

    applyTheme(localStorage.getItem(THEME_KEY));

    // Desktop
    dRenderModuleGrid();
    document.getElementById('dThemeToggle').addEventListener('click', toggleTheme);
    document.querySelectorAll('#desktopShell .sidebar-menu .menu-item').forEach(function (item) {
        item.addEventListener('click', function (e) {
            if (!this.dataset.page) return;
            e.preventDefault();
            dNavigateTo(this.dataset.page);
        });
    });
    document.getElementById('dCloseDetailModal').addEventListener('click', dCloseDetailModal);
    document.getElementById('dCloseDetailModalFooter').addEventListener('click', dCloseDetailModal);
    document.getElementById('dDetailModal').addEventListener('click', function (e) { if (e.target === this) dCloseDetailModal(); });
    document.getElementById('dashPresentoirCard').addEventListener('click', dOpenDashPresentoir);
    document.getElementById('dRegDetailBack').addEventListener('click', dCloseRegDetail);
    document.getElementById('dGoToScanBtn').addEventListener('click', function () { window.location.href = 'scan.html'; });

    document.getElementById('dEmployeeStationBack').addEventListener('click', function () {
        dEmployeeStationScope = null;
        dEmployeeStationLevel = 'groups';
        document.getElementById('dEmployeesDetail').style.display = 'none';
        document.getElementById('dEmployeeStationGrid').style.display = 'grid';
        dRenderEmployeeStationBlocks();
    });
    document.getElementById('dEmployeeSearch').addEventListener('input', dRenderEmployeesTable);

    // Mobile
    mRenderModuleList();
    mSetTopbar('Espace Gérant', false);
    document.getElementById('mThemeToggle').addEventListener('click', toggleTheme);
    document.querySelectorAll('#mTabBar .tab-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { mSwitchTab(btn.dataset.tab); });
    });
    document.getElementById('mBackBtn').addEventListener('click', function () {
        if (mActiveTab === 'home' && mHomeDetailOpen) mCloseHomeDetail();
    });
    document.getElementById('mSheetClose').addEventListener('click', mCloseSheet);
    document.getElementById('mSheetBackdrop').addEventListener('click', mCloseSheet);

    // Données réelles (stations + montures) : chargées une fois, puis les vues
    // desktop ("lunettes" si déjà active) et mobile (toujours visible) sont rendues.
    await loadDashboardData();
    await Promise.all([loadEmployees(), loadStockMovements(), loadSoldGlasses(), loadMonturesFromServer()]);
    const presentoirTotalEl = document.getElementById('dStatPresentoirTotal');
    if (presentoirTotalEl) presentoirTotalEl.textContent = dedupeMovementsByMonture(stockMovements).filter(function (m) { return stockStageOf(m.to_station_name) === 'presentoir'; }).length;
    mRenderStatCarousel();
    mRenderStoreSegmented();
    mRenderStoreDetail();
    const activePage = document.querySelector('#desktopShell .sidebar-menu .menu-item.active')?.dataset.page;
    if (activePage === 'lunettes') {
        dRenderGlobalStats();
        dRenderStorePicker();
        dRenderStoreDetail();
        dRenderDailyStats();
    } else if (activePage === 'employes') {
        dRenderEmployeeStationBlocks();
    }
});

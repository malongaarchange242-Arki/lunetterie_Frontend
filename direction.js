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
    { page: 'fournisseur', icon: 'ic-store', title: 'Commandes Fournisseur', desc: 'Quantités commandées (ex. Dubai), comparées à ce qui est envoyé au stock général.', available: true },
    { page: 'compta', icon: 'ic-briefcase', title: 'Comptabilité', desc: 'Tableaux comptables, charges et bilans.' },
    { page: 'planning', icon: 'ic-calendar', title: 'Plannings', desc: 'Plannings des employés par poste et par semaine.' },
    { page: 'reclamations', icon: 'ic-exclamation-triangle', title: 'Réclamations', desc: 'Réclamations clients et suivi de leur résolution.' },
    { page: 'messagerie', icon: 'ic-message', title: 'Messagerie générale', desc: "Messagerie interne entre les postes et l'administration." },
    { page: 'historique', icon: 'ic-history', title: 'Historique des mouvements', desc: 'Traçabilité complète des montures par étape.', available: true, href: 'historique.html?from=direction' }
];

// STORES est alimenté par computeDashboardTotals() à partir des vraies stations et
// des mouvements/ventes/transferts. Tant que les données ne sont pas chargées, ces
// listes restent vides et les vues affichent un état de chargement/vide plutôt que de planter.
let STORES = [];
let STOCK_CENTRAL = 0;
let STOCK_AUTRES = 0; // Laboratoire, Présentoir... : exclus du picker "par magasin" (ce ne sont pas des villes) mais toujours comptés dans le total.
let TOTAL_MAGASIN = 0;
let TOTAL_GLOBAL = 0;
function storeTotal(store) { return store.stockLocal + store.presentoir + store.labo + store.reserve; }

let stationsList = [];
function stationNameById(id) {
    const station = stationsList.find(function (s) { return Number(s.id) === Number(id); });
    return station ? displayStationName(station.name) : 'Non assigné';
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

function getAuthUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { return null; }
}
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}
function authHeaders(extra) {
    const token = localStorage.getItem('token');
    const headers = Object.assign({}, extra || {});
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

// "Station Pointe-Noire" → "Pointe-Noire" (détail par magasin = noms de ville),
// mais "Stock Principal" (nom hérité côté backend) → "Station Générale" partout.
function displayStationName(name) {
    const value = String(name || '');
    const lower = value.toLowerCase();
    if (lower.includes('stock principal') || lower.includes('reception generale') || lower.includes('réception générale')) return 'Station Générale';
    return value.replace(/^Station\s+/i, '').trim();
}

function normalizeStationName(name) {
    const label = displayStationName(name);
    return label || 'Ville inconnue';
}

async function loadStations() {
    let stations = [];
    try {
        const response = await fetch(`${API_URL}/auth/stations`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        if (json.success && Array.isArray(json.data && json.data.stations)) stations = json.data.stations;
    } catch (error) {
        console.error('Erreur chargement stations', error);
    }
    stationsList = stations;
}

// glasses.station_id reste sur la station d'ORIGINE tant qu'un transfert n'est
// pas réceptionné : on passe par la table transferts (to_station_id) plutôt
// que par /inventory/glasses pour savoir ce qui est en route vers une station.
let inTransitTransfers = [];
async function loadInTransitTransfers() {
    try {
        const response = await fetch(`${API_URL}/inventory/transfers?status=IN_TRANSIT`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        inTransitTransfers = (response.ok && json.success && Array.isArray(json.data)) ? json.data : [];
    } catch (error) {
        console.error('Erreur chargement transferts en transit', error);
        inTransitTransfers = [];
    }
}

// Compte les montures d'une station (stockLocal/présentoir/labo/réserve/vendues/
// enTransit) à partir des mêmes sources et des mêmes filtres que les panneaux de
// détail (dOpenStoreDetail, dOpenVenduesDrill, dOpenTransitDrill) : /inventory/
// glasses?station_id=X ne reflète pas toujours l'état réel (station_id peut ne
// pas être synchronisé avec les mouvements), d'où des écarts entre le chiffre
// affiché et ce qu'on voyait en cliquant dessus.
function computeStoreBreakdown(station) {
    const label = displayStationName(station.name);
    const latest = dedupeMovementsByMonture(stockMovements);
    let stockLocal = 0, presentoir = 0, labo = 0;
    latest.forEach(function (m) {
        const stage = stockStageOf(m.to_station_name);
        if (stage === 'local' && normalizeStationName(m.to_station_name) === label) stockLocal++;
        else if (stage === 'presentoir') presentoir++;
        else if (stage === 'laboratoire') labo++;
    });
    const reserve = latest.filter(function (m) { return m.action === 'RESERVATION' && normalizeStationName(m.to_station_name) === label; }).length;
    const vendues = soldGlasses.filter(function (g) { return normalizeStationName(g.station_name || (g.station && g.station.name)) === label; }).length;
    const enTransit = inTransitTransfers.reduce(function (sum, t) {
        if (String(t.to_station_id) !== String(station.id)) return sum;
        const items = Array.isArray(t.items) ? t.items : [];
        return sum + items.filter(function (item) { return item.status === 'IN_TRANSIT'; }).length;
    }, 0);
    return { id: String(station.id), label: label, stockLocal: stockLocal, presentoir: presentoir, labo: labo, reserve: reserve, vendues: vendues, enTransit: enTransit };
}

// À appeler une fois stations, mouvements, ventes et transferts chargés.
function computeDashboardTotals() {
    const centralStations = stationsList.filter(function (s) { return s.type === 'STOCK_GENERAL'; });
    // "Détail par magasin" = les villes (sous-stations) uniquement — le présentoir
    // et le laboratoire ne sont pas des magasins et sont suivis séparément. Ils sont
    // actuellement mal typés "SOUS_STATION" côté backend, donc le type seul ne
    // suffit pas à les exclure : on filtre aussi sur le nom, comme stockStageOf().
    const shopStations = stationsList.filter(function (s) {
        if (s.type !== 'SOUS_STATION') return false;
        const name = String(s.name || '').toLowerCase();
        return !name.includes('présentoir') && !name.includes('presentoir') && !name.includes('laboratoire') && !name.includes('labo');
    });
    // Tout ce qui n'est ni "stock général" ni une vraie ville (laboratoire, présentoir,
    // etc.) : pas affiché dans le picker "par magasin", mais doit quand même compter
    // dans le total pour que les chiffres reflètent réellement la base.
    const otherStations = stationsList.filter(function (s) {
        return centralStations.indexOf(s) === -1 && shopStations.indexOf(s) === -1;
    });

    const centralBreakdowns = centralStations.map(computeStoreBreakdown);
    const shopBreakdowns = shopStations.map(computeStoreBreakdown);
    const otherBreakdowns = otherStations.map(computeStoreBreakdown);

    STOCK_CENTRAL = centralBreakdowns.reduce(function (sum, b) { return sum + storeTotal(b); }, 0);
    STOCK_AUTRES = otherBreakdowns.reduce(function (sum, b) { return sum + storeTotal(b); }, 0);
    STORES = shopBreakdowns;
    TOTAL_MAGASIN = STORES.reduce(function (sum, s) { return sum + storeTotal(s); }, 0);
    TOTAL_GLOBAL = TOTAL_MAGASIN + STOCK_CENTRAL + STOCK_AUTRES;

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

// Liste brute (champs API tels quels : shape/color/brand/status..., pas le remappage
// français ci-dessus) de TOUTES les montures, tous statuts confondus — dédiée au chatbot,
// pour qu'il puisse chercher sur toute la base (y compris en transit, réservées, perdues...
// pas seulement le sous-ensemble de statuts affiché sur le tableau de bord).
const ALL_GLASS_STATUSES = [
    'RECU_FOURNISSEUR', 'EN_STOCK_GENERAL', 'EN_TRANSIT', 'EN_STOCK_SOUS_STATION',
    'EN_PRESENTOIR', 'RESERVEE', 'EN_LABORATOIRE', 'PRETE_A_LIVRER', 'VENDUE',
    'PERDUE', 'CASSEE', 'RETOURNEE'
];
let allGlassesCache = [];
async function loadAllGlassesForAssistant() {
    try {
        const response = await fetch(`${API_URL}/inventory/glasses?status=${ALL_GLASS_STATUSES.join(',')}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        allGlassesCache = (response.ok && json.success && Array.isArray(json.data && json.data.glasses)) ? json.data.glasses : [];
    } catch (error) {
        console.error('Erreur chargement complet des montures (assistant)', error);
        allGlassesCache = [];
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
   MONTURES VENDUES — chargées pour les statistiques et les listes de suivi.
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

// Vignette d'une ligne (mouvement ou monture) : plusieurs noms de champ
// possibles selon la source (mêmes conventions défensives que imageUrlOf()
// dans historique.js), avec repli sur l'icône lunettes si absente.
function imageUrlOf(m) {
    if (!m) return null;
    return m.photo_monture_url || m.image_url || m.photo_url || m.image || m.monture_image || m.frame_image
        || (m.monture && (m.monture.photo_monture_url || m.monture.image_url || m.monture.photo_url)) || null;
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
    fournisseur: { icon: 'ic-store', title: 'Commandes Fournisseur', sub: 'Quantités commandées, envoyées et restantes' },
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
        card.addEventListener('click', function () {
            const module = MODULES.find(function (m) { return m.page === card.dataset.page; });
            if (module && module.href) { window.location.href = module.href; return; }
            dNavigateTo(card.dataset.page);
        });
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
        refreshActiveReceptionSessions();
    }
    if (page === 'employes') {
        dEmployeeStationScope = null;
        dEmployeeStationLevel = 'groups';
        document.getElementById('dEmployeesDetail').style.display = 'none';
        document.getElementById('dEmployeeStationGrid').style.display = 'grid';
        dRenderEmployeeStationBlocks();
    }
    if (page === 'commandes') dRenderCommandes();
    if (page === 'fournisseur') dRenderSupplierOrders();
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

/* ==========================================================================
   COMMANDES FOURNISSEUR — commandes passées aux fournisseurs (ex. Dubai),
   persistées côté serveur (table supplier_orders, voir backend/migrations).
   La direction enregistre ici la quantité commandée ; l'administration
   (admin.html, création d'une session de réception) affiche la dernière
   commande comme référence. "Envoyé au stock général" = somme de
   registered_count des sessions liées (colonne supplier_order_id sur
   reception_commands) — le même décompte en direct que le bandeau "sessions
   en cours" d'admin.html, pas une copie locale qui peut désynchroniser.
   ========================================================================== */
let supplierOrdersCache = [];
let receptionCommandsCache = [];

async function loadReceptionCommands() {
    try {
        const response = await fetch(`${API_URL}/inventory/reception-commands`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        receptionCommandsCache = (response.ok && json.success && Array.isArray(json.data && json.data.commands)) ? json.data.commands : [];
    } catch (error) {
        console.error('Erreur chargement des sessions de réception', error);
        receptionCommandsCache = [];
    }
    return receptionCommandsCache;
}

function sentCountForSupplierOrder(orderId) {
    // "Envoyé" = ce que la direction a décidé d'envoyer en créant la session
    // (target_count), pas ce qui a déjà été scanné (registered_count) — ce
    // dernier progrès se lit dans le bandeau "Sessions en cours" lui-même.
    return receptionCommandsCache
        .filter(function (c) { return c.supplier_order_id != null && String(c.supplier_order_id) === String(orderId); })
        .reduce(function (sum, c) { return sum + (Number(c.target_count) || 0); }, 0);
}

async function loadSupplierOrders() {
    try {
        const response = await fetch(`${API_URL}/inventory/supplier-orders`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        supplierOrdersCache = (response.ok && json.success && Array.isArray(json.data && json.data.orders)) ? json.data.orders : [];
    } catch (error) {
        console.error('Erreur chargement commandes fournisseur', error);
        supplierOrdersCache = [];
    }
    return supplierOrdersCache;
}

async function addSupplierOrder(supplier, quantity, orderDate, note) {
    const response = await fetch(`${API_URL}/inventory/supplier-orders`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ supplier: supplier, quantity: quantity, order_date: orderDate, note: note || '' })
    });
    const json = await response.json().catch(function () { return {}; });
    if (!response.ok || !json.success) {
        throw new Error((json && json.error) || `Erreur serveur (${response.status})`);
    }
    return json.data && json.data.order;
}

async function deleteSupplierOrder(orderId) {
    const response = await fetch(`${API_URL}/inventory/supplier-orders/${orderId}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    const json = await response.json().catch(function () { return {}; });
    if (!response.ok || !json.success) {
        throw new Error((json && json.error) || `Erreur serveur (${response.status})`);
    }
}

function sortedSupplierOrders() {
    return supplierOrdersCache.slice().sort(function (a, b) {
        return (b.order_date || '').localeCompare(a.order_date || '') || (b.created_at || '').localeCompare(a.created_at || '');
    });
}

function lastDubaiSupplierOrder() {
    const orders = sortedSupplierOrders().filter(function (o) { return String(o.supplier || '').toLowerCase().includes('dubai'); });
    return orders.length ? orders[0] : null;
}

async function dHandleAddSupplierOrder() {
    const nameInput = document.getElementById('fSupplierName');
    const qtyInput = document.getElementById('fSupplierQty');
    const dateInput = document.getElementById('fSupplierDate');
    const noteInput = document.getElementById('fSupplierNote');

    const supplier = nameInput.value.trim() || 'Dubai';
    const quantity = Number(qtyInput.value);
    if (!Number.isInteger(quantity) || quantity < 1) {
        alert('Indiquez une quantité entière supérieure à zéro.');
        return;
    }
    const orderDate = dateInput.value || new Date().toISOString().slice(0, 10);
    const addBtn = document.getElementById('fSupplierAddBtn');
    addBtn.disabled = true;
    try {
        await addSupplierOrder(supplier, quantity, orderDate, noteInput.value.trim());
        qtyInput.value = '';
        noteInput.value = '';
        await dRenderSupplierOrders();
    } catch (error) {
        console.error('Erreur création commande fournisseur', error);
        alert(error.message || "Impossible d'enregistrer la commande fournisseur");
    } finally {
        addBtn.disabled = false;
    }
}

// Version mobile de la page "Commandes Fournisseur" : avant, lecture seule
// (« utilisez la vue bureau pour en ajouter une ») — la direction doit
// pouvoir ajouter une commande depuis son téléphone aussi.
function mRenderFournisseurDetail(container) {
    const orders = sortedSupplierOrders();
    const listHtml = orders.length ? orders.map(function (o) {
        const sent = sentCountForSupplierOrder(o.id);
        const rest = o.quantity - sent;
        return '<div style="display:flex;flex-direction:column;gap:4px;padding:14px 0;border-bottom:1px solid var(--line-soft);">' +
            '<strong>' + escapeHtml(o.supplier) + ' · ' + new Date(o.order_date).toLocaleDateString('fr-FR') + '</strong>' +
            '<span>Commandé : ' + o.quantity + ' · Envoyé au stock général : ' + sent + '</span>' +
            '<span style="font-weight:700;color:' + (rest > 0 ? 'var(--danger)' : 'var(--success)') + ';">Reste : ' + rest + '</span>' +
            (o.note ? '<span style="color:var(--ink-soft);font-size:12px;">' + escapeHtml(o.note) + '</span>' : '') +
            '</div>';
    }).join('') : '<p class="mobile-empty">Aucune commande fournisseur enregistrée.</p>';

    container.innerHTML =
        '<div class="form-group"><label for="mfSupplierName">Fournisseur</label><input type="text" id="mfSupplierName" placeholder="Dubai" value="Dubai" /></div>' +
        '<div class="form-group"><label for="mfSupplierQty">Quantité commandée</label><input type="number" id="mfSupplierQty" min="1" step="1" placeholder="Ex. 500" /></div>' +
        '<div class="form-group"><label for="mfSupplierDate">Date de commande</label><input type="date" id="mfSupplierDate" /></div>' +
        '<div class="form-group"><label for="mfSupplierNote">Note (optionnel)</label><input type="text" id="mfSupplierNote" placeholder="Référence, transporteur..." /></div>' +
        '<button class="mobile-action-btn" type="button" id="mfSupplierAddBtn"><svg class="i"><use href="#ic-plus"/></svg> Enregistrer la commande</button>' +
        '<div style="padding:4px 2px;margin-top:6px;">' + listHtml + '</div>';

    document.getElementById('mfSupplierAddBtn').addEventListener('click', mHandleAddSupplierOrder);
}

async function mHandleAddSupplierOrder() {
    const nameInput = document.getElementById('mfSupplierName');
    const qtyInput = document.getElementById('mfSupplierQty');
    const dateInput = document.getElementById('mfSupplierDate');
    const noteInput = document.getElementById('mfSupplierNote');

    const supplier = nameInput.value.trim() || 'Dubai';
    const quantity = Number(qtyInput.value);
    if (!Number.isInteger(quantity) || quantity < 1) {
        alert('Indiquez une quantité entière supérieure à zéro.');
        return;
    }
    const orderDate = dateInput.value || new Date().toISOString().slice(0, 10);
    const addBtn = document.getElementById('mfSupplierAddBtn');
    addBtn.disabled = true;
    try {
        await addSupplierOrder(supplier, quantity, orderDate, noteInput.value.trim());
        await loadSupplierOrders();
        mRenderFournisseurDetail(document.getElementById('mHomeDetailScreen'));
    } catch (error) {
        console.error('Erreur création commande fournisseur', error);
        alert(error.message || "Impossible d'enregistrer la commande fournisseur");
    } finally {
        const btnAgain = document.getElementById('mfSupplierAddBtn');
        if (btnAgain) btnAgain.disabled = false;
    }
}

function supplierOrdersTableRows() {
    const orders = sortedSupplierOrders();
    if (!orders.length) {
        return `<tr><td colspan="7" class="empty-state"><svg class="i" style="font-size:32px;"><use href="#ic-store"/></svg><p>Aucune commande fournisseur enregistrée</p></td></tr>`;
    }
    return orders.map(function (o) {
        const sent = sentCountForSupplierOrder(o.id);
        const rest = o.quantity - sent;
        return `<tr>
            <td>${new Date(o.order_date).toLocaleDateString('fr-FR')}</td>
            <td>${escapeHtml(o.supplier)}</td>
            <td>${o.quantity}</td>
            <td>${sent}</td>
            <td style="font-weight:700;color:${rest > 0 ? 'var(--danger)' : 'var(--success)'};">${rest}</td>
            <td>${escapeHtml(o.note || '—')}</td>
            <td><button class="icon-btn" type="button" data-del-order="${o.id}" title="Supprimer"><svg class="i"><use href="#ic-trash"/></svg></button></td>
        </tr>`;
    }).join('');
}

async function dRenderSupplierOrders() {
    const tbody = document.getElementById('fSupplierTable');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><p>Chargement…</p></td></tr>`;
    await Promise.all([loadSupplierOrders(), loadReceptionCommands()]);
    tbody.innerHTML = supplierOrdersTableRows();
    tbody.querySelectorAll('[data-del-order]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
            if (!confirm('Supprimer cette commande fournisseur ?')) return;
            try {
                await deleteSupplierOrder(btn.dataset.delOrder);
                await dRenderSupplierOrders();
            } catch (error) {
                console.error('Erreur suppression commande fournisseur', error);
                alert(error.message || 'Impossible de supprimer la commande');
            }
        });
    });
}

/* ==========================================================================
   SESSION DE RÉCEPTION — la direction peut aussi générer une session (avant,
   seul admin.html le pouvait). Même API que admin.html (reception-commands),
   même comparaison à la dernière commande Dubai, même ticket PNG téléchargé
   avant impression ; un seul jeu d'éléments/fonctions partagé entre le bouton
   desktop (lunettesSection) et le bouton mobile (onglet Lunettes).
   ========================================================================== */
function buildTicketPng(barcodeValue, heading, lines) {
    return new Promise(function (resolve) {
        const barcodeCanvas = document.createElement('canvas');
        JsBarcode(barcodeCanvas, barcodeValue, {
            format: 'CODE128', lineColor: '#0f172a', background: '#ffffff',
            width: 2, height: 60, fontSize: 13, margin: 8, displayValue: true
        });

        const padding = 24;
        const lineHeight = 22;
        const headingHeight = heading ? 30 : 0;
        const width = Math.max(360, barcodeCanvas.width + padding * 2);
        const height = padding + headingHeight + barcodeCanvas.height + 16 + lines.length * lineHeight + padding;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0f172a';

        let y = padding;
        if (heading) {
            ctx.font = 'bold 17px Arial, sans-serif';
            ctx.fillText(heading, width / 2, y + 17);
            y += headingHeight;
        }

        ctx.drawImage(barcodeCanvas, (width - barcodeCanvas.width) / 2, y);
        y += barcodeCanvas.height + 20;

        ctx.font = '13px Arial, sans-serif';
        lines.forEach(function (line) { ctx.fillText(line, width / 2, y); y += lineHeight; });

        resolve(canvas.toDataURL('image/png'));
    });
}

function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function openReceptionSessionModal() {
    document.getElementById('dReceptionSessionForm').style.display = 'block';
    document.getElementById('dReceptionSessionResult').style.display = 'none';
    document.getElementById('dSaveReceptionSession').style.display = 'inline-flex';
    document.getElementById('dPrintReceptionSession').style.display = 'none';
    document.getElementById('dSessionMountCount').value = '';

    document.getElementById('dReceptionSessionModal').classList.add('active');
    setTimeout(function () { document.getElementById('dSessionMountCount').focus(); }, 200);

    await loadSupplierOrders();
    const infoBox = document.getElementById('dLastSupplierOrderInfo');
    const lastOrder = lastDubaiSupplierOrder();
    if (lastOrder) {
        infoBox.style.display = 'block';
        infoBox.textContent = 'Dernière commande Fournisseur Dubai : ' + lastOrder.quantity + ' monture(s) commandée(s) le ' + new Date(lastOrder.order_date).toLocaleDateString('fr-FR');
    } else {
        infoBox.style.display = 'none';
        infoBox.textContent = '';
    }
}

function closeReceptionSessionModal() {
    document.getElementById('dReceptionSessionModal').classList.remove('active');
}

async function createReceptionSession() {
    const target = Number(document.getElementById('dSessionMountCount').value);
    if (!Number.isInteger(target) || target < 1) {
        alert('Indiquez un nombre entier de montures supérieur à zéro.');
        return;
    }
    const lastOrder = lastDubaiSupplierOrder();
    try {
        const response = await fetch(`${API_URL}/inventory/reception-commands`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ target_count: target, supplier_order_id: lastOrder ? lastOrder.id : null })
        });
        const json = await response.json().catch(function () { return {}; });
        if (!response.ok || !json.success) {
            throw new Error((json && json.error) || 'Erreur serveur (' + response.status + ')');
        }
        const command = json.data && (json.data.command || json.data);

        refreshActiveReceptionSessions();
        loadReceptionCommands();

        const compareText = document.getElementById('dSessionCompareText');
        if (lastOrder) {
            const rest = lastOrder.quantity - target;
            compareText.style.display = 'block';
            compareText.innerHTML = 'Commande Dubai : <strong>' + lastOrder.quantity + '</strong> · Envoyé au stock général : <strong>' + target + '</strong> · Reste à comparer : <strong style="color:' + (rest > 0 ? 'var(--danger)' : 'var(--success)') + '">' + rest + '</strong>';
        } else {
            compareText.style.display = 'none';
            compareText.textContent = '';
        }

        document.getElementById('dSessionCodeText').textContent = command.code;
        document.getElementById('dSessionTargetText').textContent = command.target_count;
        document.getElementById('dReceptionSessionForm').style.display = 'none';
        document.getElementById('dReceptionSessionResult').style.display = 'block';
        document.getElementById('dSaveReceptionSession').style.display = 'none';
        document.getElementById('dPrintReceptionSession').style.display = 'inline-flex';
        if (typeof JsBarcode !== 'undefined') JsBarcode('#dSessionBarcode', command.code, { format: 'CODE128', width: 2, height: 72, displayValue: true, margin: 10 });
    } catch (error) {
        console.error('Erreur création session', error);
        alert(error.message || 'Impossible de créer la session');
    }
}

async function printReceptionSession() {
    const svg = document.getElementById('dSessionBarcode').outerHTML;
    const code = document.getElementById('dSessionCodeText').textContent;
    const target = document.getElementById('dSessionTargetText').textContent;

    const dataUrl = await buildTicketPng(code, 'La Lunetterie', ["Session d'enregistrement · " + target + ' monture(s)']);
    downloadDataUrl(dataUrl, 'session-' + code + '.png');

    const popup = window.open('', '_blank', 'width=500,height=400');
    if (!popup) { alert('Autorisez les fenêtres surgissantes pour imprimer l’étiquette.'); return; }
    popup.document.write('<html><head><title>Session d\'enregistrement</title><style>body{font-family:Arial;text-align:center;padding:28px}svg{max-width:100%}strong{display:block;letter-spacing:.08em}p{color:#475569}</style></head><body><h2>La Lunetterie</h2><p>Session d\'enregistrement · ' + target + ' monture(s)</p>' + svg + '<strong>' + code + '</strong></body></html>');
    popup.document.close();
    popup.onafterprint = function () { popup.close(); };
    popup.focus();
    popup.print();
}

// Bandeau "sessions en cours" : toutes les sessions actives côté serveur,
// tous postes/utilisateurs confondus (admin.html comme direction.html).
async function loadActiveReceptionSessions() {
    try {
        const response = await fetch(`${API_URL}/inventory/reception-commands?status=active`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        return (response.ok && json.success && Array.isArray(json.data && json.data.commands)) ? json.data.commands : [];
    } catch (error) {
        console.error('Erreur chargement des sessions actives', error);
        return [];
    }
}

function activeSessionRowsHtml(sessions) {
    return sessions.map(function (command) {
        const registered = Number(command.registered_count) || 0;
        const target = Number(command.target_count) || 0;
        const rest = Math.max(target - registered, 0);
        // "En cours" seulement une fois que scan.html a commencé à enregistrer
        // des montures pour cette session (registered > 0) ; sinon "En attente".
        const statusLabel = registered > 0 ? '● En cours' : '● En attente';
        return '<div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line-soft);">' +
            '<div class="stat-icon blue" style="width:40px;height:40px;flex-shrink:0;"><svg class="i"><use href="#ic-tag"/></svg></div>' +
            '<div>' +
                '<div style="font-weight:700;">Session ' + escapeHtml(command.code) + ' <span style="margin-left:6px;padding:3px 9px;border-radius:999px;font-size:11px;background:var(--primary-tint);color:var(--primary);">' + statusLabel + '</span></div>' +
                '<div style="color:var(--ink-soft);font-size:13px;">' + registered + ' / ' + target + ' monture(s) enregistrée(s) · reste ' + rest + ' à soumettre</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

function renderActiveSessionBanner(sessions) {
    const banner = document.getElementById('dActiveSessionBanner');
    const list = document.getElementById('dActiveSessionList');
    if (banner && list) {
        banner.style.display = sessions.length ? 'block' : 'none';
        list.innerHTML = sessions.length ? activeSessionRowsHtml(sessions) : '';
    }
    const mList = document.getElementById('mActiveSessionList');
    if (mList) mList.innerHTML = sessions.length ? activeSessionRowsHtml(sessions) : '';
}

async function refreshActiveReceptionSessions() {
    renderActiveSessionBanner(await loadActiveReceptionSessions());
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
            '<div class="stat-label">' + card.label + '</div>' +
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
        dOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'local' && normalizeStationName(m.to_station_name) === store.label; }), store.label);
    } else if (detail === 'presentoir') {
        dOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'presentoir'; }), null);
    } else if (detail === 'labo') {
        dOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'laboratoire'; }), null);
    } else if (detail === 'reserve') {
        dOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return m.action === 'RESERVATION' && normalizeStationName(m.to_station_name) === store.label; }), store.label);
    }
}

// Générique (utilisé par la modale desktop ET le bottom sheet mobile) : le
// bouton "retour" est ciblé par classe et querySelector-scopé au conteneur
// plutôt que par ID fixe, pour que la même fonction serve les deux vues.
function renderLunettesDrillInto(body, drill) {
    if (!body || !drill) return;

    if (!drill.city) {
        const latest = dedupeMovementsByMonture(drill.movements);
        const counts = new Map();
        latest.forEach(function (m) {
            const name = normalizeStationName(m.to_station_name);
            counts.set(name, (counts.get(name) || 0) + 1);
        });
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
            btn.addEventListener('click', function () { drill.city = btn.dataset.lunettesCity; drill.date = null; renderLunettesDrillInto(body, drill); });
        });
        return;
    }

    const cityScoped = drill.movements.filter(function (m) { return normalizeStationName(m.to_station_name) === drill.city; });

    if (!drill.date) {
        const latest = dedupeMovementsByMonture(cityScoped);
        const counts = new Map();
        latest.forEach(function (m) { const key = dayKey(m.created_at); if (!key) return; counts.set(key, (counts.get(key) || 0) + 1); });
        const keys = Array.from(counts.keys()).sort(function (a, b) { return b.localeCompare(a); });
        const backBtn = !drill.cityFixed ? `<div class="table-toolbar" style="padding:0 0 14px;"><button class="btn btn-ghost lunettes-back-btn" type="button"><svg class="i"><use href="#ic-arrow-left"/></svg><span>Villes</span></button><span class="date-detail-label">${escapeHtml(drill.city)}</span></div>` : '';
        body.innerHTML = backBtn + (keys.length ? `<div class="date-block-grid stage-grid">${keys.map(function (key) {
            return `<button class="date-block" type="button" data-lunettes-date="${key}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-calendar"/></svg></div>
                <div class="date-block-value">${counts.get(key)}</div>
                <div class="date-block-label">${formatDayLabel(key)}</div>
                <div class="date-block-sub">${counts.get(key) > 1 ? 'montures' : 'monture'}</div>
            </button>`;
        }).join('')}</div>` : `<div class="track-empty"><p>Aucune date pour cette sélection.</p></div>`);
        const backEl = body.querySelector('.lunettes-back-btn');
        if (backEl) backEl.addEventListener('click', function () { drill.city = null; renderLunettesDrillInto(body, drill); });
        body.querySelectorAll('[data-lunettes-date]').forEach(function (btn) {
            btn.addEventListener('click', function () { drill.date = btn.dataset.lunettesDate; renderLunettesDrillInto(body, drill); });
        });
        return;
    }

    const rows = dedupeMovementsByMonture(cityScoped.filter(function (m) { return dayKey(m.created_at) === drill.date; }))
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    body.innerHTML = `<div class="table-toolbar" style="padding:0 0 14px;">
            <button class="btn btn-ghost lunettes-back-btn" type="button"><svg class="i"><use href="#ic-arrow-left"/></svg><span>Dates</span></button>
            <span class="date-detail-label">${escapeHtml(drill.city)} <span class="date-detail-sep">›</span> ${formatDayLabel(drill.date)}</span>
        </div>` +
        (rows.length ? `<div class="activity-list">${rows.map(function (m) {
            const label = ((m.brand || '') + ' ' + (m.reference || '')).trim();
            const route = [m.from_station_name, m.to_station_name].filter(Boolean).map(displayStationName).join(' → ');
            const photoUrl = imageUrlOf(m);
            return `<div class="activity-row" data-monture-barcode="${escapeHtml(m.barcode)}" style="cursor:pointer;">
                <div class="glass-photo">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="" loading="lazy" />` : '<svg class="i"><use href="#ic-glasses"/></svg>'}</div>
                <div class="activity-main">
                    <div class="activity-title"><strong>${escapeHtml(m.barcode)}</strong>${label ? `<span class="activity-sub">${escapeHtml(label)}</span>` : ''}</div>
                    <div class="activity-meta"><span class="badge">${escapeHtml(m.action || '')}</span>${route ? `<span class="activity-where">${escapeHtml(route)}</span>` : ''}<span class="activity-date">${new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                </div>
            </div>`;
        }).join('')}</div>` : `<div class="track-empty"><p>Aucun mouvement pour cette date.</p></div>`);
    const backEl2 = body.querySelector('.lunettes-back-btn');
    if (backEl2) backEl2.addEventListener('click', function () { drill.date = null; renderLunettesDrillInto(body, drill); });
    body.querySelectorAll('[data-monture-barcode]').forEach(function (row) {
        row.addEventListener('click', function () { dOpenMontureDetail(row.dataset.montureBarcode); });
    });
}

function dRenderLunettesDrill() { renderLunettesDrillInto(document.getElementById('dDetailModalBody'), dLunettesDrill); }

/* Montures vendues — Date → Liste (soldGlasses, déjà scopé au magasin). */
let dVenduesDrill = null;
function dOpenVenduesDrill(store) {
    const items = soldGlasses.filter(function (g) {
        return normalizeStationName(g.station_name || (g.station && g.station.name)) === store.label;
    });
    dVenduesDrill = { store: store, items: items, date: null };
    document.getElementById('dDetailModalTitle').textContent = 'Montures vendues · ' + store.label;
    document.getElementById('dDetailModal').classList.add('active');
    dRenderVenduesDrill();
}
function renderVenduesDrillInto(body, drill) {
    if (!body || !drill) return;

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
            btn.addEventListener('click', function () { drill.date = btn.dataset.venduesDate; renderVenduesDrillInto(body, drill); });
        });
        return;
    }

    const rows = drill.items.filter(function (g) { return dayKey(soldDateOf(g)) === drill.date; });
    body.innerHTML = `<div class="table-toolbar" style="padding:0 0 14px;">
            <button class="btn btn-ghost vendues-back-btn" type="button"><svg class="i"><use href="#ic-arrow-left"/></svg><span>Dates</span></button>
            <span class="date-detail-label">${formatDayLabel(drill.date)}</span>
        </div>` +
        `<div class="activity-list">${rows.map(function (g) {
            const label = ((g.brand || '') + ' ' + (g.reference || '')).trim();
            const photoUrl = imageUrlOf(g);
            return `<div class="activity-row" data-monture-barcode="${escapeHtml(g.barcode || '')}" style="cursor:pointer;">
                <div class="glass-photo">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="" loading="lazy" />` : '<svg class="i"><use href="#ic-glasses"/></svg>'}</div>
                <div class="activity-main">
                    <div class="activity-title"><strong>${escapeHtml(g.barcode || '')}</strong>${label ? `<span class="activity-sub">${escapeHtml(label)}</span>` : ''}</div>
                    <div class="activity-meta"><span class="badge">VENTE</span>${g.price ? `<span class="activity-where">${formatNumber(g.price)} FCFA</span>` : ''}</div>
                </div>
            </div>`;
        }).join('')}</div>`;
    const backEl = body.querySelector('.vendues-back-btn');
    if (backEl) backEl.addEventListener('click', function () { drill.date = null; renderVenduesDrillInto(body, drill); });
    body.querySelectorAll('[data-monture-barcode]').forEach(function (row) {
        row.addEventListener('click', function () { dOpenMontureDetail(row.dataset.montureBarcode); });
    });
}

function dRenderVenduesDrill() { renderVenduesDrillInto(document.getElementById('dDetailModalBody'), dVenduesDrill); }

/* ==========================================================================
   FICHE MONTURE — photos + infos, ouverte au clic sur une ligne du Suivi des
   lunettes ou des Montures vendues. Les lignes viennent de /inventory/movements
   (pas de photo ni caractéristiques dessus) ou déjà de /inventory/glasses (a
   priori complet) : dans les deux cas on recharge la fiche par code-barres
   pour être sûr d'avoir les photos et le détail à jour (même logique que
   scan.js pour « Mes enregistrements »).
   ========================================================================== */
let dMontureModalToken = 0;
function dRenderMontureDetail(glass) {
    const photoEntries = [
        ['Monture', glass.photo_monture_url],
        ['Branche', glass.photo_branche_url]
    ].filter(function (entry) { return entry[1]; });
    document.getElementById('dMontureModalPhotos').innerHTML = photoEntries.length
        ? photoEntries.map(function (entry) {
            return '<div class="frame-photo-box"><img class="frame-photo" src="' + escapeHtml(entry[1]) + '" alt="Photo ' + entry[0].toLowerCase() + ' de la monture" loading="lazy" /><span class="tag-float">' + entry[0] + '</span></div>';
        }).join('')
        : '';

    const fields = [
        ['Référence', glass.reference], ['Marque', glass.brand], ['Genre', glass.gender],
        ['Forme', glass.shape], ['Couleur', glass.color], ['Matière', glass.material],
        ['Taille', glass.size], ['Prix', glass.price ? formatNumber(glass.price) + ' FCFA' : null],
        ['Statut', glass.status], ['Station', displayStationName(glass.station_name || '')]
    ].filter(function (f) { return f[1]; });
    document.getElementById('dMontureModalDetails').innerHTML = fields.map(function (f) {
        return '<div class="detail"><label>' + escapeHtml(f[0]) + '</label><span>' + escapeHtml(String(f[1])) + '</span></div>';
    }).join('');

    document.getElementById('dMontureModalTitle').textContent = ((glass.brand || 'Monture') + ' ' + (glass.reference || glass.barcode || '')).trim();
    const barcodeText = document.getElementById('dMontureModalBarcodeText');
    if (barcodeText) barcodeText.textContent = glass.barcode || '';
    if (typeof JsBarcode !== 'undefined' && glass.barcode) {
        JsBarcode('#dMontureModalBarcode', glass.barcode, {
            format: 'CODE128', lineColor: '#0f172a', background: '#ffffff',
            width: 2, height: 46, fontSize: 13, margin: 8, displayValue: false
        });
        const svgEl = document.getElementById('dMontureModalBarcode');
        const w = svgEl.getAttribute('width'), h = svgEl.getAttribute('height');
        if (w && h) svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
}

async function dOpenMontureDetail(barcode) {
    if (!barcode) return;
    const myToken = ++dMontureModalToken;
    document.getElementById('dMontureModalTitle').textContent = 'Chargement…';
    document.getElementById('dMontureModalPhotos').innerHTML = '';
    document.getElementById('dMontureModalDetails').innerHTML = '';
    const barcodeTextEl = document.getElementById('dMontureModalBarcodeText');
    if (barcodeTextEl) barcodeTextEl.textContent = '';
    document.getElementById('dMontureModal').classList.add('active');
    try {
        const response = await fetch(`${API_URL}/inventory/glasses/${encodeURIComponent(barcode)}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        if (myToken !== dMontureModalToken) return; // fermé ou une autre fiche ouverte entre-temps
        if (response.ok && json.success && json.data && json.data.glass) {
            dRenderMontureDetail(json.data.glass);
        } else {
            document.getElementById('dMontureModalTitle').textContent = 'Monture introuvable';
        }
    } catch (error) {
        console.error('Erreur chargement fiche monture', error);
        if (myToken === dMontureModalToken) document.getElementById('dMontureModalTitle').textContent = 'Erreur de chargement';
    }
}
function dCloseMontureModal() { document.getElementById('dMontureModal').classList.remove('active'); dMontureModalToken++; }

/* En transit — liste des envois en cours (pas de détail par date : seule la
   date d'envoi du lot est connue, pas de mouvement individuel confirmé). */
function renderTransitDrillInto(body, store) {
    const relevant = inTransitTransfers.filter(function (t) { return String(t.to_station_id) === String(store.id); });
    if (!relevant.length) {
        body.innerHTML = `<div class="track-empty"><p>Aucun envoi en cours vers ${escapeHtml(store.label)}.</p></div>`;
        return;
    }
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

function dOpenTransitDrill(store) {
    document.getElementById('dDetailModalTitle').textContent = 'En transit vers ' + store.label;
    renderTransitDrillInto(document.getElementById('dDetailModalBody'), store);
    document.getElementById('dDetailModal').classList.add('active');
}

/* Équivalents mobile des drills ci-dessus : même état/logique, rendus dans le
   bottom sheet (#mSheetBody) au lieu de la modale desktop (#dDetailModal). */
let mLunettesDrill = null;
function mOpenLunettesDrill(title, movements, cityFixed) {
    mLunettesDrill = { movements: movements, city: cityFixed || null, cityFixed: !!cityFixed, date: null };
    document.getElementById('mSheetTitle').textContent = title;
    mOpenSheet();
    renderLunettesDrillInto(document.getElementById('mSheetBody'), mLunettesDrill);
}

function mOpenGlobalDetail(detail) {
    const titles = { total: 'Lunettes total', magasin: 'Lunettes en magasin', stock: 'Lunettes en stock central' };
    const filters = {
        total: function () { return stockMovements; },
        magasin: function () { return stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'local'; }); },
        stock: function () { return stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'general'; }); }
    };
    const getMovements = filters[detail] || function () { return []; };
    mOpenLunettesDrill(titles[detail] || 'Détail', getMovements(), null);
}

let mVenduesDrill = null;
function mOpenVenduesDrill(store) {
    const items = soldGlasses.filter(function (g) { return normalizeStationName(g.station_name || (g.station && g.station.name)) === store.label; });
    mVenduesDrill = { store: store, items: items, date: null };
    document.getElementById('mSheetTitle').textContent = 'Montures vendues · ' + store.label;
    mOpenSheet();
    renderVenduesDrillInto(document.getElementById('mSheetBody'), mVenduesDrill);
}

function mOpenTransitDrill(store) {
    document.getElementById('mSheetTitle').textContent = 'En transit vers ' + store.label;
    mOpenSheet();
    renderTransitDrillInto(document.getElementById('mSheetBody'), store);
}

function mOpenStoreDetail(detail, store) {
    if (detail === 'vendues') { mOpenVenduesDrill(store); return; }
    if (detail === 'transit') { mOpenTransitDrill(store); return; }
    const titles = { stockLocal: 'Stock local · ' + store.label, presentoir: 'Présentoir', labo: 'Laboratoire', reserve: 'Réserve · ' + store.label };
    if (detail === 'stockLocal') {
        mOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'local' && normalizeStationName(m.to_station_name) === store.label; }), store.label);
    } else if (detail === 'presentoir') {
        mOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'presentoir'; }), null);
    } else if (detail === 'labo') {
        mOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return stockStageOf(m.to_station_name) === 'laboratoire'; }), null);
    } else if (detail === 'reserve') {
        mOpenLunettesDrill(titles[detail], stockMovements.filter(function (m) { return m.action === 'RESERVATION' && normalizeStationName(m.to_station_name) === store.label; }), store.label);
    }
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

const M_TAB_TITLES = { home: 'Espace Gérant', lunettes: 'Suivi des lunettes' };
function mSwitchTab(tab) {
    mActiveTab = tab;
    document.querySelectorAll('#mobileShell .tab-panel').forEach(function (panel) { panel.classList.toggle('active', panel.dataset.panel === tab); });
    document.querySelectorAll('#mTabBar .tab-btn').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.tab === tab); });
    mCloseHomeDetail();
    mSetTopbar(M_TAB_TITLES[tab] || M_TAB_TITLES.home, false);
    if (tab === 'lunettes') { refreshActiveReceptionSessions(); }
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
            const module = MODULES.find(function (m) { return m.page === card.dataset.page; });
            if (module && module.href) { window.location.href = module.href; return; }
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
    } else if (page === 'fournisseur') {
        mRenderFournisseurDetail(detail);
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
        { icon: 'ic-warehouse', color: 'blue', value: store.stockLocal, label: 'Stock local', detail: 'stockLocal' },
        { icon: 'ic-display', color: 'green', value: store.presentoir, label: 'Présentoir', detail: 'presentoir' },
        { icon: 'ic-flask', color: 'orange', value: store.labo, label: 'Labo', detail: 'labo' },
        { icon: 'ic-archive', color: 'purple', value: store.reserve, label: 'Réserve', detail: 'reserve' }
    ];
    document.getElementById('mStoreMiniGrid').innerHTML = tiles.map(function (t) {
        return '<button class="mini-tile" type="button" data-store-detail="' + t.detail + '">' +
            '<div class="mini-icon ' + t.color + '"><svg class="i"><use href="#' + t.icon + '"/></svg></div>' +
            '<div class="mini-value">' + formatNumber(t.value) + '</div>' +
            '<div class="mini-label">' + t.label + '</div>' +
            '</button>';
    }).join('');
    document.querySelectorAll('#mStoreMiniGrid [data-store-detail]').forEach(function (btn) {
        btn.addEventListener('click', function () { mOpenStoreDetail(btn.dataset.storeDetail, store); });
    });

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
        '<button class="pending-card" type="button" data-store-detail="vendues"><div class="pending-value">' + formatNumber(store.vendues) + '</div><div class="pending-label">Vendues · ' + store.label + '</div></button>' +
        '<button class="pending-card" type="button" data-store-detail="transit"><div class="pending-value">' + formatNumber(store.enTransit) + '</div><div class="pending-label">En transit</div></button>';
    document.querySelectorAll('#mPendingRow [data-store-detail]').forEach(function (btn) {
        btn.addEventListener('click', function () { mOpenStoreDetail(btn.dataset.storeDetail, store); });
    });
}

// Même parcours Ville → Date → Liste que le bureau (dOpenGlobalDetail), pas
// une vue simplifiée à part : les trois cartes globales doivent ouvrir
// exactement le même détail sur mobile que sur desktop.
function mOpenStatSheet(detail) {
    mOpenGlobalDetail(detail);
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
   ASSISTANT DE DIRECTION — chatbot IA (résumés/questions libres sur
   l'activité). Le contexte envoyé au backend est reconstruit à chaque
   message à partir des données déjà chargées pour le tableau de bord (pas
   de nouvel appel réseau) : les ventes/mouvements bruts grossissent avec le
   temps, donc on les résume par jour et on ne détaille que les entrées les
   plus récentes.
   ========================================================================== */
let chatHistory = [];
let chatOpen = false;

function groupByDay(list, dateFn, valueFn) {
    const byDay = new Map();
    list.forEach(function (item) {
        const key = dayKey(dateFn(item));
        if (!key) return;
        const entry = byDay.get(key) || { date: key, count: 0, total: 0 };
        entry.count += 1;
        entry.total += valueFn ? (Number(valueFn(item)) || 0) : 0;
        byDay.set(key, entry);
    });
    return Array.from(byDay.values()).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
}

// Compte les occurrences d'une liste selon une clé (forme, couleur, matière, genre,
// marque...) — sert au module de suivi par catégorie du chatbot.
function countBy(list, keyFn) {
    const counts = {};
    list.forEach(function (item) {
        const key = keyFn(item) || 'Non renseigné';
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

function categoryBreakdown(list) {
    return {
        par_forme: countBy(list, function (g) { return g.shape; }),
        par_couleur: countBy(list, function (g) { return g.color; }),
        par_matiere: countBy(list, function (g) { return g.material; }),
        par_genre: countBy(list, function (g) { return g.gender; }),
        par_marque: countBy(list, function (g) { return g.brand; })
    };
}

function glassSummary(g, dateValue) {
    return {
        date: dateValue, barcode: g.barcode, station: g.station_name, status: g.status,
        shape: g.shape, color: g.color, material: g.material, gender: g.gender,
        brand: g.brand, reference: g.reference, price: g.price
    };
}

// Statuts considérés comme "stock actif" (par opposition à vendue/perdue/cassée/retournée)
// pour les agrégats stock_actuel.* — la liste brute toutes_les_montures, elle, garde
// systématiquement tous les statuts, y compris ceux-ci.
const ACTIVE_GLASS_STATUSES = [
    'RECU_FOURNISSEUR', 'EN_STOCK_GENERAL', 'EN_TRANSIT', 'EN_STOCK_SOUS_STATION',
    'EN_PRESENTOIR', 'RESERVEE', 'EN_LABORATOIRE', 'PRETE_A_LIVRER'
];

function buildAssistantContext() {
    const stockActif = allGlassesCache.filter(function (g) { return ACTIVE_GLASS_STATUSES.indexOf(g.status) !== -1; });
    const monturesVendues = allGlassesCache.filter(function (g) { return g.status === 'VENDUE'; });
    const salesByDay = groupByDay(monturesVendues, soldDateOf, function (g) { return g.price; });
    const movementsByDay = groupByDay(stockMovements, function (m) { return m.created_at; });

    return {
        today: new Date().toISOString().slice(0, 10),
        stations: stationsList.map(function (s) { return { id: s.id, name: s.name, type: s.type }; }),
        // Nom/rôle/poste/statut uniquement : pas de téléphone/email envoyés à l'API tierce.
        employees: employees.map(function (e) { return { name: e.fullName, role: formatRole(e.role), poste: e.poste, status: e.status }; }),
        stock_actuel: {
            stock_central: STOCK_CENTRAL,
            stock_autres: STOCK_AUTRES,
            total_magasins: TOTAL_MAGASIN,
            total_global: TOTAL_GLOBAL,
            par_magasin: STORES.map(function (s) { return { magasin: s.label, stock_local: s.stockLocal, presentoir: s.presentoir, laboratoire: s.labo, reserve: s.reserve, vendues: s.vendues, en_transit: s.enTransit }; }),
            par_categorie: categoryBreakdown(stockActif)
        },
        // Base complète (tous statuts confondus : en stock, en transit, réservée, vendue,
        // perdue, cassée, retournée... — le champ "status" de chaque entrée permet au
        // chatbot de filtrer lui-même) avec les attributs (forme/couleur/matière/genre/
        // marque) de chaque monture — permet au chatbot de répondre à toute recherche
        // précise, pas seulement aux tendances.
        toutes_les_montures: allGlassesCache.map(function (g) { return glassSummary(g, g.status === 'VENDUE' ? soldDateOf(g) : null); }),
        ventes_par_jour: salesByDay,
        ventes_par_categorie: categoryBreakdown(monturesVendues),
        mouvements_par_jour: movementsByDay,
        mouvements: stockMovements.map(function (m) { return { date: m.created_at, action: m.action, barcode: m.barcode, from: m.from_station_name, to: m.to_station_name }; }),
        sessions_reception: receptionCommandsCache,
        commandes_fournisseur: supplierOrdersCache
    };
}

function aiChatScrollToBottom() {
    const el = document.getElementById('aiChatMessages');
    if (el) el.scrollTop = el.scrollHeight;
}

function aiChatAppendBubble(role, text) {
    const container = document.getElementById('aiChatMessages');
    if (!container) return null;
    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble ai-chat-bubble--' + role;
    if (role === 'pending') {
        // Trois points animés plutôt qu'un texte statique : lecture visuelle
        // plus rapide de "l'assistant travaille" pendant l'attente de la réponse.
        bubble.innerHTML = '<span class="ai-chat-typing" role="status" aria-label="' + escapeHtml(text || "Lunette réfléchit") + '"><span></span><span></span><span></span></span>';
    } else {
        bubble.textContent = text;
    }
    container.appendChild(bubble);
    aiChatScrollToBottom();
    return bubble;
}

/* --- Dictée vocale (SpeechRecognition) et lecture des réponses (SpeechSynthesis) :
   API navigateur natives, pas de service tiers. La dictée n'est pas supportée partout
   (bien sur Chrome/Edge, absente sur Firefox) : le bouton micro se masque proprement
   si l'API n'existe pas plutôt que de planter. --- */
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

const VOICE_KEY = 'lunetterie-ai-voice';
let voiceEnabled = localStorage.getItem(VOICE_KEY) !== 'off';

function aiSetupSpeechRecognition() {
    const micBtn = document.getElementById('aiChatMicBtn');
    if (!SpeechRecognitionCtor) {
        if (micBtn) micBtn.classList.add('is-unsupported');
        return;
    }
    recognition = new SpeechRecognitionCtor();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (event) {
        const transcript = event.results[0][0].transcript;
        document.getElementById('aiChatInput').value = transcript;
        aiSendChatMessage();
    };
    recognition.onerror = function () { aiSetListening(false); };
    recognition.onend = function () { aiSetListening(false); };
}

function aiSetListening(listening) {
    isListening = listening;
    const micBtn = document.getElementById('aiChatMicBtn');
    if (micBtn) micBtn.classList.toggle('is-listening', listening);
}

function aiToggleMic() {
    if (!recognition) return;
    if (isListening) {
        recognition.stop();
        aiSetListening(false);
        return;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel(); // ne pas parler par-dessus le micro
    try {
        recognition.start();
        aiSetListening(true);
    } catch (error) {
        aiSetListening(false);
    }
}

function aiUpdateVoiceIcon() {
    const use = document.querySelector('#aiChatVoiceIcon use');
    if (use) use.setAttribute('href', voiceEnabled ? '#ic-volume' : '#ic-volume-x');
    const btn = document.getElementById('aiChatVoiceToggleBtn');
    if (btn) btn.classList.toggle('is-active', voiceEnabled);
}

function aiToggleVoice() {
    voiceEnabled = !voiceEnabled;
    localStorage.setItem(VOICE_KEY, voiceEnabled ? 'on' : 'off');
    if (!voiceEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    aiUpdateVoiceIcon();
}

// Filet de sécurité : le prompt système demande à Claude d'éviter le markdown, mais on
// nettoie quand même avant la synthèse vocale au cas où (astérisques, puces, titres...) —
// la version affichée dans la bulle de chat, elle, reste inchangée.
function stripForSpeech(text) {
    return text
        .replace(/```[\s\S]*?```/g, ' ')      // blocs de code
        .replace(/`([^`]+)`/g, '$1')          // code inline
        .replace(/^#{1,6}\s+/gm, '')          // titres markdown
        .replace(/^\s*[-*•]\s+/gm, '')        // puces de liste
        .replace(/^\s*\d+[.)]\s+/gm, '')      // listes numérotées
        .replace(/[*_~#>|]/g, '')             // symboles de mise en forme restants
        .replace(/\s+/g, ' ')
        .trim();
}

function aiSpeak(text) {
    if (!voiceEnabled || !window.speechSynthesis || !text) return;
    const cleaned = stripForSpeech(text);
    if (!cleaned) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = 'fr-FR';
    window.speechSynthesis.speak(utterance);
}

function aiOpenChat() {
    chatOpen = true;
    document.getElementById('aiChatPanel').classList.add('active');
    aiChatScrollToBottom();
    document.getElementById('aiChatInput').focus();
}
function aiCloseChat() {
    chatOpen = false;
    document.getElementById('aiChatPanel').classList.remove('active');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (recognition && isListening) recognition.stop();
}
function aiToggleChat() { if (chatOpen) aiCloseChat(); else aiOpenChat(); }

async function aiSendChatMessage() {
    const input = document.getElementById('aiChatInput');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';

    chatHistory.push({ role: 'user', content: message });
    aiChatAppendBubble('user', message);
    const pending = aiChatAppendBubble('pending', "Lunette réfléchit...");

    try {
        const response = await fetch(`${API_URL}/ai/chat`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                message: message,
                history: chatHistory.slice(0, -1).slice(-16),
                context: buildAssistantContext()
            })
        });
        const json = await response.json().catch(function () { return {}; });
        if (pending) pending.remove();

        if (!response.ok || !json.success) {
            aiChatAppendBubble('error', (json && json.error) || "Lunette est indisponible pour le moment.");
            return;
        }
        const reply = (json.data && json.data.reply) || '';
        chatHistory.push({ role: 'assistant', content: reply });
        aiChatAppendBubble('assistant', reply);
        aiSpeak(reply);
    } catch (error) {
        if (pending) pending.remove();
        aiChatAppendBubble('error', "Erreur réseau : impossible de contacter Lunette.");
    }
}

/* ==========================================================================
   INITIALISATION
   La bascule desktop ↔ mobile est automatique (voir direction.css), selon
   la largeur d'écran uniquement — pas de bouton manuel.
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async function () {
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
    document.getElementById('dCloseMontureModal').addEventListener('click', dCloseMontureModal);
    document.getElementById('dCloseMontureModalFooter').addEventListener('click', dCloseMontureModal);
    document.getElementById('dMontureModal').addEventListener('click', function (e) { if (e.target === this) dCloseMontureModal(); });
    document.getElementById('dRegDetailBack').addEventListener('click', dCloseRegDetail);
    document.getElementById('dGoToScanBtn').addEventListener('click', function () { window.location.href = 'scan.html'; });
    const dLogoutBtn = document.querySelector('#desktopShell .logout-btn');
    if (dLogoutBtn) dLogoutBtn.addEventListener('click', logout);

    document.getElementById('dCreateReceptionSessionBtn').addEventListener('click', openReceptionSessionModal);
    document.getElementById('mCreateReceptionSessionBtn').addEventListener('click', openReceptionSessionModal);
    document.getElementById('dCloseReceptionSessionModal').addEventListener('click', closeReceptionSessionModal);
    document.getElementById('dCancelReceptionSession').addEventListener('click', closeReceptionSessionModal);
    document.getElementById('dSaveReceptionSession').addEventListener('click', createReceptionSession);
    document.getElementById('dPrintReceptionSession').addEventListener('click', printReceptionSession);
    document.getElementById('dReceptionSessionModal').addEventListener('click', function (e) { if (e.target === this) closeReceptionSessionModal(); });
    document.getElementById('dRefreshActiveSessionBtn').addEventListener('click', refreshActiveReceptionSessions);

    document.getElementById('dEmployeeStationBack').addEventListener('click', function () {
        dEmployeeStationScope = null;
        dEmployeeStationLevel = 'groups';
        document.getElementById('dEmployeesDetail').style.display = 'none';
        document.getElementById('dEmployeeStationGrid').style.display = 'grid';
        dRenderEmployeeStationBlocks();
    });
    document.getElementById('dEmployeeSearch').addEventListener('input', dRenderEmployeesTable);
    document.getElementById('fSupplierAddBtn').addEventListener('click', dHandleAddSupplierOrder);

    document.getElementById('aiChatFab').addEventListener('click', aiToggleChat);
    document.getElementById('aiChatCloseBtn').addEventListener('click', aiCloseChat);
    document.getElementById('aiChatSendBtn').addEventListener('click', aiSendChatMessage);
    document.getElementById('aiChatInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            aiSendChatMessage();
        }
    });
    document.getElementById('aiChatMicBtn').addEventListener('click', aiToggleMic);
    document.getElementById('aiChatVoiceToggleBtn').addEventListener('click', aiToggleVoice);
    aiSetupSpeechRecognition();
    aiUpdateVoiceIcon();

    // Mobile
    mRenderModuleList();
    mSetTopbar('Espace Gérant', false);
    document.getElementById('mThemeToggle').addEventListener('click', toggleTheme);
    document.querySelectorAll('#mTabBar .tab-btn').forEach(function (btn) {
        if (!btn.dataset.tab) return; // ex. le bouton "Historique" navigue vers historique.html, ce n'est pas un onglet interne
        btn.addEventListener('click', function () { mSwitchTab(btn.dataset.tab); });
    });
    document.getElementById('mBackBtn').addEventListener('click', function () {
        if (mActiveTab === 'home' && mHomeDetailOpen) mCloseHomeDetail();
    });
    document.getElementById('mSheetClose').addEventListener('click', mCloseSheet);
    document.getElementById('mSheetBackdrop').addEventListener('click', mCloseSheet);

    // Données réelles (stations + mouvements + ventes + transferts + montures) :
    // chargées une fois en parallèle, puis les totaux "Suivi des lunettes" sont
    // calculés à partir d'elles (computeDashboardTotals a besoin que tout soit
    // déjà en mémoire) avant que les vues desktop/mobile ne soient rendues.
    await Promise.all([loadStations(), loadEmployees(), loadStockMovements(), loadSoldGlasses(), loadInTransitTransfers(), loadMonturesFromServer(), loadSupplierOrders(), loadReceptionCommands(), loadAllGlassesForAssistant()]);
    computeDashboardTotals();
    mRenderStatCarousel();
    mRenderStoreSegmented();
    mRenderStoreDetail();
    const activePage = document.querySelector('#desktopShell .sidebar-menu .menu-item.active')?.dataset.page;
    if (activePage === 'lunettes') {
        dRenderGlobalStats();
        dRenderStorePicker();
        dRenderStoreDetail();
        refreshActiveReceptionSessions();
    } else if (activePage === 'employes') {
        dRenderEmployeeStationBlocks();
    }
    if (mActiveTab === 'lunettes') { refreshActiveReceptionSessions(); }
});

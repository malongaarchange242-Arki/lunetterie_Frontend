// ============================
// DATA
// ============================
const API_URL = 'https://api-lunetterie.universearch.com/api/v1';
let employees = [];
let stationsList = [];

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
}

function getAuthenticatedUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { return null; }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('lastActivityAt');
    window.location.href = 'index.html';
}

// Toutes les sessions de réception (actives et terminées), tous postes —
// source unique pour le bandeau "sessions en cours" ET pour repérer les
// sessions créées aujourd'hui dans l'Activité de la journée (plus de
// localStorage : ça ne survivait pas à un changement de poste/navigateur).
let allReceptionCommandsCache = [];
async function loadAllReceptionCommands() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_URL}/inventory/reception-commands`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const json = await response.json().catch(() => ({}));
        allReceptionCommandsCache = (response.ok && json.success && Array.isArray(json.data?.commands)) ? json.data.commands : [];
    } catch (error) {
        console.error('Erreur chargement des sessions de réception', error);
        allReceptionCommandsCache = [];
    }
    return allReceptionCommandsCache;
}

// Commandes fournisseur (ex. Dubai), saisies par la direction dans direction.html
// et persistées côté serveur (table supplier_orders).
async function getSupplierOrders() {
    try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(`${API_URL}/inventory/supplier-orders`, { headers });
        const json = await response.json().catch(() => ({}));
        return (response.ok && json.success && Array.isArray(json.data?.orders)) ? json.data.orders : [];
    } catch (error) {
        console.error('Erreur chargement commandes fournisseur', error);
        return [];
    }
}

async function lastDubaiSupplierOrder() {
    const orders = (await getSupplierOrders()).filter(order => String(order.supplier || '').toLowerCase().includes('dubai'));
    if (!orders.length) return null;
    return orders.slice().sort((a, b) => (b.order_date || '').localeCompare(a.order_date || '') || (b.created_at || '').localeCompare(a.created_at || ''))[0];
}

// Bandeau "sessions en cours" (page Gestion du stock) : dérivé de
// allReceptionCommandsCache (toutes les sessions, tous postes/utilisateurs
// confondus), filtré côté client sur status === 'active' — pas de fetch
// séparé. Une session sort de la liste dès qu'elle passe à "completed" côté
// serveur, donc pas besoin de bouton "fermer" manuel.
function renderActiveSessionBanner(sessions) {
    const banner = document.getElementById('activeSessionBanner');
    const list = document.getElementById('activeSessionList');
    if (!banner || !list) return;
    if (!sessions.length) { banner.style.display = 'none'; list.innerHTML = ''; return; }
    banner.style.display = 'block';
    list.innerHTML = sessions.map(command => {
        const registered = Number(command.registered_count) || 0;
        const target = Number(command.target_count) || 0;
        const rest = Math.max(target - registered, 0);
        // "En cours" seulement une fois que scan.html a commencé à enregistrer
        // des montures pour cette session (registered > 0) ; sinon "En attente".
        const statusLabel = registered > 0 ? '● En cours' : '● En attente';
        return `<div class="session-row" data-session-code="${escapeHtml(command.code)}" style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line-soft);cursor:pointer;" title="Voir les montures enregistrées">
            <div class="stat-icon blue" style="width:40px;height:40px;flex-shrink:0;"><svg class="i"><use href="#ic-tag"/></svg></div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;">Session ${escapeHtml(command.code)} <span style="margin-left:6px;padding:3px 9px;border-radius:999px;font-size:11px;background:var(--primary-tint);color:var(--primary);">${statusLabel}</span></div>
                <div style="color:var(--ink-soft);font-size:13px;">${registered} / ${target} monture(s) enregistrée(s) · reste ${rest} à soumettre</div>
            </div>
            <svg class="i" style="color:var(--ink-soft);flex-shrink:0;"><use href="#ic-arrow-right"/></svg>
        </div>`;
    }).join('');
    list.querySelectorAll('[data-session-code]').forEach(row => {
        row.addEventListener('click', () => openSessionGlasses(row.dataset.sessionCode));
    });
}

/* ==========================================================================
   MONTURES D'UNE SESSION — même logique que dOpenSessionGlasses() dans
   direction.js : scan.html n'envoie jamais le code de session avec la
   monture lors de l'enregistrement, on tente donc plusieurs noms de champ
   plausibles. Liste vide malgré des montures enregistrées = le serveur ne
   relie pas encore la monture à sa session (évolution backend nécessaire).
   ========================================================================== */
function imageUrlOf(m) {
    return m && (m.photo_monture_url || m.image_url || m.photo_url || m.image || m.monture_image || m.frame_image
        || (m.monture && (m.monture.photo_monture_url || m.monture.image_url || m.monture.photo_url))) || null;
}

function glassSessionCode(g) {
    return g && (g.reception_command_code || g.session_code || g.command_code
        || (g.reception_command && g.reception_command.code)) || null;
}

let sessionGlassesToken = 0;

async function openSessionGlasses(sessionCode) {
    const modal = document.getElementById('sessionGlassesModal');
    const body = document.getElementById('sessionGlassesBody');
    const title = document.getElementById('sessionGlassesTitle');
    if (!modal || !body || !title) return;
    const myToken = ++sessionGlassesToken;

    title.textContent = 'Montures · Session ' + sessionCode;
    body.innerHTML = '<div class="empty-state"><p>Chargement…</p></div>';
    modal.classList.add('active');

    let glasses = [];
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/inventory/glasses`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const json = await response.json().catch(() => ({}));
        const all = (response.ok && json.success && Array.isArray(json.data?.glasses)) ? json.data.glasses : [];
        glasses = all.filter(g => glassSessionCode(g) === sessionCode);
    } catch (error) {
        console.error('Erreur chargement montures de la session', error);
    }
    if (myToken !== sessionGlassesToken) return;

    if (!glasses.length) {
        body.innerHTML = '<div class="empty-state"><svg class="i"><use href="#ic-glasses"/></svg><h4>Aucune monture trouvée pour cette session</h4><p>Si des montures ont bien été enregistrées pour cette session, il se peut que le serveur ne relie pas encore la monture à son code de session.</p></div>';
        return;
    }

    body.innerHTML = glasses.map(g => {
        const img = imageUrlOf(g);
        return `<div class="activity-row" data-monture-barcode="${escapeHtml(g.barcode)}" style="cursor:pointer;">
            ${img ? `<img class="glass-photo" src="${escapeHtml(img)}" alt="" />` : `<div class="glass-photo"><svg class="i"><use href="#ic-glasses"/></svg></div>`}
            <div class="activity-main">
                <div class="activity-title"><strong>${escapeHtml(g.brand || 'Monture')}${g.reference ? ' · ' + escapeHtml(g.reference) : ''}</strong></div>
                <div class="activity-meta">${escapeHtml(g.barcode)}</div>
            </div>
            <svg class="i" style="color:var(--ink-soft);flex-shrink:0;"><use href="#ic-arrow-right"/></svg>
        </div>`;
    }).join('');

    body.querySelectorAll('[data-monture-barcode]').forEach(row => {
        row.addEventListener('click', () => {
            window.location.href = 'historique.html?from=admin&barcode=' + encodeURIComponent(row.dataset.montureBarcode);
        });
    });
}

function closeSessionGlasses() {
    document.getElementById('sessionGlassesModal').classList.remove('active');
    sessionGlassesToken++;
}

async function refreshActiveReceptionSessions() {
    await loadAllReceptionCommands();
    renderActiveSessionBanner(allReceptionCommandsCache.filter(c => c.status === 'active'));
}

// Somme des target_count des sessions déjà créées pour cette commande —
// sert à borner la saisie pour ne jamais dépasser la quantité commandée.
function sentCountForSupplierOrder(orderId) {
    return allReceptionCommandsCache
        .filter(c => c.supplier_order_id != null && String(c.supplier_order_id) === String(orderId))
        .reduce((sum, c) => sum + (Number(c.target_count) || 0), 0);
}

async function openReceptionSessionModal() {
    document.getElementById('receptionSessionForm').style.display = 'block';
    document.getElementById('receptionSessionResult').style.display = 'none';
    document.getElementById('saveReceptionSession').style.display = 'inline-flex';
    document.getElementById('printReceptionSession').style.display = 'none';
    const mountInput = document.getElementById('sessionMountCount');
    mountInput.value = '';

    document.getElementById('receptionSessionModal').classList.add('active');
    setTimeout(() => mountInput.focus(), 200);

    const infoBox = document.getElementById('lastSupplierOrderInfo');
    await loadAllReceptionCommands();
    const lastOrder = await lastDubaiSupplierOrder();
    if (lastOrder) {
        // Décompte automatique : on ne peut pas saisir plus que ce qu'il
        // reste à envoyer au stock général pour cette commande.
        const sent = sentCountForSupplierOrder(lastOrder.id);
        const rest = Math.max(lastOrder.quantity - sent, 0);
        infoBox.style.display = 'block';
        infoBox.textContent = `Dernière commande Fournisseur Dubai : ${lastOrder.quantity} monture(s) commandée(s) le ${new Date(lastOrder.order_date).toLocaleDateString('fr-FR')} · reste ${rest} à envoyer au stock général`;
        if (rest > 0) { mountInput.max = rest; mountInput.value = rest; } else { mountInput.removeAttribute('max'); }
    } else {
        infoBox.style.display = 'none';
        infoBox.textContent = '';
        mountInput.removeAttribute('max');
    }
}

function closeReceptionSessionModal() {
    document.getElementById('receptionSessionModal').classList.remove('active');
}

async function createReceptionSession() {
    const target = Number(document.getElementById('sessionMountCount').value);
    if (!Number.isInteger(target) || target < 1) {
        alert('Indiquez un nombre entier de montures supérieur à zéro.');
        return;
    }
    const token = localStorage.getItem('token');
    try {
        const lastOrder = await lastDubaiSupplierOrder();
        if (lastOrder) {
            const sent = sentCountForSupplierOrder(lastOrder.id);
            const rest = Math.max(lastOrder.quantity - sent, 0);
            if (target > rest) {
                alert(`Il ne vous reste que ${rest} monture(s) pour cette commande.`);
                return;
            }
        }
        const response = await fetch(`${API_URL}/inventory/reception-commands`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ target_count: target, supplier_order_id: lastOrder ? lastOrder.id : null })
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
            throw new Error(json?.error || `Erreur serveur (${response.status})`);
        }
        const command = json.data?.command || json.data;

        // Recharge la liste serveur : sert à la fois au bandeau "sessions en
        // cours" et à faire apparaître cette création dans l'Activité du jour.
        await loadAllReceptionCommands();
        renderActiveSessionBanner(allReceptionCommandsCache.filter(c => c.status === 'active'));
        updateStats();
        aRenderDashboard();

        const compareText = document.getElementById('sessionCompareText');
        if (lastOrder) {
            const rest = lastOrder.quantity - target;
            compareText.style.display = 'block';
            compareText.innerHTML = `Commande Dubai : <strong>${lastOrder.quantity}</strong> · Envoyé au stock général : <strong>${target}</strong> · Reste à comparer : <strong style="color:${rest > 0 ? 'var(--danger)' : 'var(--success)'}">${rest}</strong>`;
        } else {
            compareText.style.display = 'none';
            compareText.textContent = '';
        }

        document.getElementById('sessionCodeText').textContent = command.code;
        document.getElementById('sessionTargetText').textContent = command.target_count;
        // Le badge reste "En attente" (valeur statique du HTML) : une session
        // qui vient d'être créée n'a encore rien d'enregistré — il passera à
        // "En cours" dans le bandeau dès que scan.html commencera à scanner.
        document.getElementById('receptionSessionForm').style.display = 'none';
        document.getElementById('receptionSessionResult').style.display = 'block';
        document.getElementById('saveReceptionSession').style.display = 'none';
        document.getElementById('printReceptionSession').style.display = 'inline-flex';
        if (typeof JsBarcode !== 'undefined') JsBarcode('#sessionBarcode', command.code, { format: 'CODE128', width: 3, height: 90, displayValue: true, margin: 15 });
    } catch (error) {
        console.error('Erreur création commande', error);
        alert(error.message || 'Impossible de créer la commande');
    }
}

// Génère un PNG de l'étiquette (même contenu que le popup d'impression) dans
// un <canvas> hors écran, à partir d'un code-barres rendu par JsBarcode.
function buildTicketPng(barcodeValue, heading, lines) {
    return new Promise((resolve) => {
        const barcodeCanvas = document.createElement('canvas');
        JsBarcode(barcodeCanvas, barcodeValue, {
            format: 'CODE128', lineColor: '#0f172a', background: '#ffffff',
            width: 3, height: 90, fontSize: 13, margin: 15, displayValue: true
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
        lines.forEach((line) => { ctx.fillText(line, width / 2, y); y += lineHeight; });

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

function notifyQzTrayRequired() {
    alert('QZ Tray n’est pas disponible ou n’est pas lancé. Lancez QZ Tray et réessayez pour imprimer directement via le pont natif.');
}

async function qzPrintImage(dataUrl) {
    if (!window.qz) {
        throw new Error('QZ Tray non disponible');
    }

    await qz.websocket.connect();
    try {
        const printer = await qz.printers.getDefault();
        const config = qz.configs.create(printer);
        const base64 = dataUrl.split(',')[1];
        const data = [{ type: 'image', format: 'base64', data: base64 }];
        await qz.print(config, data);
    } finally {
        if (qz.websocket.isActive()) {
            await qz.websocket.disconnect();
        }
    }
}

// Le ticket doit d'abord être téléchargé (trace locale de l'étiquette) avant
// que l'impression ne se déclenche.
async function printReceptionSession() {
    const svg = document.getElementById('sessionBarcode').outerHTML;
    const code = document.getElementById('sessionCodeText').textContent;
    const target = document.getElementById('sessionTargetText').textContent;

    const dataUrl = await buildTicketPng(code, 'La Lunetterie', [`Session d'enregistrement · ${target} monture(s)`]);
    downloadDataUrl(dataUrl, `session-${code}.png`);

    if (window.qz) {
        try {
            await qzPrintImage(dataUrl);
            return;
        } catch (qzError) {
            console.warn('QZ Tray imprimante non accessible, fallback vers impression navigateur :', qzError);
            notifyQzTrayRequired();
        }
    } else {
        notifyQzTrayRequired();
    }

    const popup = window.open('', '_blank', 'width=500,height=400');
    if (!popup) { alert('Autorisez les fenêtres surgissantes pour imprimer l’étiquette.'); return; }
    popup.document.write(`<html><head><title>Session d'enregistrement</title><style>body{font-family:Arial;text-align:center;padding:28px}svg{max-width:100%}strong{display:block;letter-spacing:.08em}p{color:#475569}</style></head><body><h2>La Lunetterie</h2><p>Session d'enregistrement · ${target} monture(s)</p>${svg}<strong>${code}</strong></body></html>`);
    popup.document.close();
    // Sans ceci, la fenêtre d'impression reste ouverte indéfiniment une fois
    // le dialogue d'impression fermé (impression ou annulation) — l'utilisateur
    // la confond avec la modale principale qui « ne se ferme pas ».
    popup.onafterprint = () => popup.close();
    popup.focus();
    popup.print();
}

// Seuls les administrateurs d'une sous-station / station locale sont limités
// à leur ville. La Station Générale garde la vue globale de l'administration.
function managedStationId() {
    const user = getAuthenticatedUser();
    const id = user?.station_id ?? user?.station?.id;
    if (id === null || id === undefined || id === '') return null;
    const station = stationsList.find(item => Number(item.id) === Number(id));
    // Les stations ne sont pas encore chargées au premier rendu : le périmètre
    // est alors réévalué avant chaque chargement de données, après loadStations.
    if (!station) return null;
    const type = String(station.type || '').toUpperCase();
    if (type) return type.includes('SOUS') || type.includes('LOCAL') ? Number(id) : null;
    const name = String(station.name || '').toLowerCase();
    return name.includes('général') || name.includes('general') || name.includes('principal') || name.includes('présentoir') || name.includes('presentoir') || name.includes('laboratoire') || name.includes('labo')
        ? null : Number(id);
}

function managedStationName() {
    const id = managedStationId();
    return id === null ? '' : stationNameById(id);
}

// Le backend peut conserver d'anciens noms de station ("Stock Principal") :
// l'interface affiche le libellé normalisé sans toucher aux données utilisées
// pour les filtres/comparaisons (voir stockStageOf, employeeStationKind).
function displayStationName(name) {
    const value = String(name || '');
    const lower = value.toLowerCase();
    if (lower.includes('stock principal') || lower.includes('reception generale') || lower.includes('réception générale')) return 'Station Générale';
    return value;
}

function stationNameById(id) {
    const station = stationsList.find(s => s.id === Number(id));
    return station ? displayStationName(station.name) : 'Non assigné';
}

async function loadStations() {
    try {
        const response = await fetch(`${API_URL}/auth/stations`);
        if (!response.ok) {
            console.error('Impossible de charger les stations', response.status);
            return;
        }
        const json = await response.json();
        if (json.success && json.data && Array.isArray(json.data.stations)) {
            stationsList = json.data.stations;
        } else {
            console.error('Réponse inattendue /auth/stations', json);
        }
    } catch (error) {
        console.error('Erreur réseau lors du chargement des stations', error);
    }
    populatePosteSelects();
}

function populatePosteSelects() {
    const scopeId = managedStationId();
    const availableStations = scopeId === null ? stationsList : stationsList.filter(s => Number(s.id) === scopeId);
    const posteSelect = document.getElementById('poste');
    if (posteSelect) {
        posteSelect.innerHTML = `<option value="">Sélectionner</option>` +
            availableStations.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        posteSelect.disabled = scopeId !== null;
    }

    const filterPoste = document.getElementById('filterPoste');
    if (filterPoste) {
        filterPoste.innerHTML = `<option value="all">Tous les postes</option>` +
            availableStations.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    }
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

const roleNameToId = Object.fromEntries(roles.map(role => [role.name, role.id]));
const roleIdToName = Object.fromEntries(roles.map(role => [role.id, role.name]));
const roleLabels = Object.fromEntries(roles.map(role => [role.name, role.label]));

// "Direction" et "Super directeur" (id 7 et 8) ne sont pas des postes
// distincts dans l'équipe : ce sont les mêmes personnes qu'"Administrateur"
// et "Super administrateur" (voir aussi login.js / auth-guard.js).
const ROLE_ALIASES = { DIRECTION: 'ADMIN', SUPER_DIRECTEUR: 'SUPER_ADMIN' };

function getRoleName(user) {
    const raw = user.role_name || roleIdToName[user.role_id] || 'ADMIN';
    return ROLE_ALIASES[raw] || raw;
}

function formatRole(roleName) {
    return roleLabels[ROLE_ALIASES[roleName] || roleName] || roleName || 'Administrateur';
}

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/auth/users`);
        if (!response.ok) {
            console.error('Impossible de charger les utilisateurs', response.status);
            return;
        }
        const json = await response.json();
        if (json.success && json.data && Array.isArray(json.data.users)) {
            employees = json.data.users.map(u => ({
                id: `EMP-${String(u.id).padStart(3, '0')}`,
                dbId: u.id,
                fullName: `${u.first_name} ${u.last_name}`.trim(),
                phone: u.phone || '',
                emergencyPhone: '',
                email: u.email || '',
                role: getRoleName(u),
                stationId: u.station_id ?? null,
                poste: stationNameById(u.station_id),
                status: u.is_active ? 'Actif' : 'Inactif',
                fingerprint: { enrolled: !!u.webauthn_registered, template: null, date: null }
            })).filter(employee => managedStationId() === null || Number(employee.stationId) === managedStationId());
        } else {
            console.error('Réponse inattendue /auth/users', json);
        }
    } catch (error) {
        console.error('Erreur réseau lors du chargement des utilisateurs', error);
    }
}

// Le catalogue couvre toutes les étapes du stock (Général/Local/Présentoir/
// Laboratoire) : nécessaire pour la répartition circulaire du présentoir et
// pour que le catalogue reflète "dans quel stock" se trouve chaque monture.
async function loadMonturesFromServer() {
    try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const stationParam = managedStationId() === null ? '' : `&station_id=${managedStationId()}`;
        const response = await fetch(`${API_URL}/inventory/glasses?status=EN_STOCK_GENERAL,EN_STOCK_SOUS_STATION,EN_PRESENTOIR,EN_LABORATOIRE${stationParam}`, { headers });
        if (!response.ok) {
            console.error('Impossible de charger les montures', response.status);
            return;
        }
        const json = await response.json().catch(() => ({}));
        if (!json.success || !Array.isArray(json.data?.glasses)) {
            console.warn('Réponse inattendue pour les montures', json);
            return;
        }

        montures = json.data.glasses.map(g => {
            const status = g.status || 'EN_STOCK_GENERAL';
            const stockLabel = status === 'EN_STOCK_GENERAL' ? 'Stock Général'
                : status === 'EN_STOCK_SOUS_STATION' ? 'Stock local'
                : status === 'EN_PRESENTOIR' ? 'Présentoir'
                : status === 'EN_LABORATOIRE' ? 'Laboratoire' : status.replaceAll('_', ' ');
            return {
            id: g.barcode || ('MNT-' + String(g.id || '').padStart(4, '0')),
            reference: g.reference || g.barcode || '',
            marque: g.brand || '',
            genre: g.gender || '',
            forme: g.shape || '',
            couleur: g.color || '',
            matiere: g.material || '',
            prix: g.price || 0,
            quantite: 1,
            seuil: 0,
            emplacement: g.location_code || '',
            stockGeneral: status === 'EN_STOCK_GENERAL' ? 1 : 0,
            stockLocal: status === 'EN_STOCK_SOUS_STATION' ? 1 : 0,
            presentoir: status === 'EN_PRESENTOIR' ? 1 : 0,
            stockLabel,
            stockLocation: g.station_name || g.station?.name || g.location_code || stockLabel,
            dateAjout: g.created_at || g.createdAt || g.date_ajout || g.received_at || null
        };
        });
    } catch (error) {
        console.error('Erreur lors du chargement des montures depuis le serveur', error);
    }
}

function escapeStockHtml(value) { return escapeHtml(value); }

let stockSummaryItems = [];

// Charge le résumé du stock (agrégé par référence, Stock Général / Local / Présentoir)
async function loadStockSummary() {
    try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const scopeId = managedStationId();
        const statuses = 'EN_STOCK_GENERAL,EN_STOCK_SOUS_STATION,EN_PRESENTOIR,EN_LABORATOIRE,RESERVEE';
        const endpoint = scopeId === null
            ? `${API_URL}/inventory/stock-summary`
            : `${API_URL}/inventory/glasses?station_id=${scopeId}&status=${statuses}`;
        const response = await fetch(endpoint, { headers });
        if (!response.ok) {
            console.error('Impossible de charger le résumé du stock', response.status);
            return;
        }
        const json = await response.json().catch(() => ({}));
        if (scopeId === null) {
            stockSummaryItems = (json.success && Array.isArray(json.data?.items)) ? json.data.items : [];
        } else {
            const map = new Map();
            const glasses = json.success && Array.isArray(json.data?.glasses) ? json.data.glasses : [];
            glasses.forEach(glass => {
                const reference = glass.reference || glass.barcode || `REF_${glass.id}`;
                if (!map.has(reference)) map.set(reference, { reference, brand: glass.brand || '', qty_general: 0, qty_local: 0, qty_presentoir: 0, qty_laboratoire: 0, qty_total: 0, is_critical: false });
                const item = map.get(reference);
                if (glass.status === 'EN_STOCK_GENERAL') item.qty_general++;
                else if (glass.status === 'EN_STOCK_SOUS_STATION') item.qty_local++;
                else if (glass.status === 'EN_PRESENTOIR') item.qty_presentoir++;
                else if (glass.status === 'EN_LABORATOIRE') item.qty_laboratoire++;
                item.qty_total++;
            });
            stockSummaryItems = Array.from(map.values()).map(item => ({ ...item, is_critical: item.qty_total <= 2 }));
        }
    } catch (error) {
        console.error('Erreur lors du chargement du résumé du stock', error);
        stockSummaryItems = [];
    }
    renderStockStats();
    aRenderStock();
    const stockBadge = document.getElementById('stockBadge');
    if (stockBadge) stockBadge.textContent = String(stockSummaryItems.filter(item => item.is_critical).length);
}

function renderStockStats() {
    // Les 4 tuiles reflètent les mêmes mouvements que le raccourci en dessous
    // (voir renderStockDrill) plutôt que l'agrégat glasses/stock-summary, pour
    // que le chiffre affiché corresponde toujours à ce que le clic ouvre.
    const latest = dedupeMovementsByMonture(stockMovements);
    const counts = { general: 0, local: 0, presentoir: 0, laboratoire: 0 };
    latest.forEach(m => { const s = stockStageOf(m.to_station_name); if (s) counts[s] += 1; });

    const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setValue('statStockGeneral', counts.general);
    setValue('statStockLocal', counts.local);
    setValue('statStockPresentoir', counts.presentoir);
    setValue('statStockLaboratoire', counts.laboratoire);
}

// ============================
// GESTION DU STOCK — raccourcis par étape (même principe que historique.html :
// Stock Général ouvre la liste directement, les autres étapes demandent d'abord
// une ville, puis les mêmes filtres tri/sens partout).
// ============================
let stockMovements = [];
let stockDrillStage = null;
let stockDrillCity = null;
let stockDrillDate = null;
let stockDrillSort = 'recent';
let stockDrillDirection = 'in';
let stockDrillView = 'list';
let stockDrillChartBy = 'forme';

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#c026d3', '#65a30d'];

function computeChartSegments(items, groupBy) {
    const getValue = groupBy === 'gamme' ? gammeOf : (m => m.forme || 'Forme inconnue');
    const counts = new Map();
    items.forEach(m => { const key = getValue(m); counts.set(key, (counts.get(key) || 0) + 1); });
    const total = items.length;
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    let cursor = 0;
    return entries.map(([label, count], i) => {
        const pct = total ? (count / total * 100) : 0;
        const start = cursor;
        cursor += pct;
        return { label, count, pct, start, end: cursor, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
}

// Répartition circulaire (forme/gamme) : utilisée à la fois par le raccourci
// du dashboard et par la vue "Répartition" de l'étape Présentoir dans Gestion Stock.
function buildDonutHtml(scoped, groupBy) {
    if (!scoped.length) {
        return `<div class="track-empty"><svg class="i" style="width:28px;height:28px;"><use href="#ic-glasses"/></svg><p>Aucune monture en présentoir pour cette sélection.</p></div>`;
    }
    const segments = computeChartSegments(scoped, groupBy);
    const gradient = segments.map(s => `${s.color} ${s.start.toFixed(1)}% ${s.end.toFixed(1)}%`).join(', ');
    return `<div class="donut-wrap">
        <div class="donut-chart" style="background:conic-gradient(${gradient});">
            <div class="donut-center"><strong>${scoped.length}</strong><span>${scoped.length > 1 ? 'montures' : 'monture'}</span></div>
        </div>
        <div class="donut-legend">${segments.map(s => `<div class="donut-legend-item"><span class="dot" style="background:${s.color};"></span>${escapeHtml(s.label)}<strong>${s.pct.toFixed(1)}%</strong><span class="muted">(${s.count})</span></div>`).join('')}</div>
    </div>`;
}

function renderStockChart() {
    const container = document.getElementById('stockChart');
    if (!container) return;
    const scoped = montures.filter(m => m.stockLabel === 'Présentoir' && m.stockLocation === stockDrillCity);
    container.innerHTML = buildDonutHtml(scoped, stockDrillChartBy);
}

/* ============================
   DASHBOARD — raccourci Présentoir (choix du magasin puis répartition
   circulaire par forme/gamme), ouvert dans le panneau glissant existant
   (openViewModal) plutôt que de dupliquer toute la navigation Gestion Stock.
   ============================ */
let dashPresentoirCity = null;
let dashPresentoirChartBy = 'forme';

function openDashPresentoir() {
    dashPresentoirCity = null;
    dashPresentoirChartBy = 'forme';
    openViewModal('Présentoir', 'ic-tshirt', '');
    renderDashPresentoirModal();
}

function renderDashPresentoirModal() {
    const body = document.getElementById('viewModalBody');
    if (!body) return;

    if (!dashPresentoirCity) {
        const stageMovements = stockMovements.filter(m => stockStageOf(m.to_station_name) === 'presentoir');
        const latest = dedupeMovementsByMonture(stageMovements);
        const counts = new Map();
        latest.forEach(m => { const name = m.to_station_name || 'Ville inconnue'; counts.set(name, (counts.get(name) || 0) + 1); });
        const names = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));
        body.innerHTML = names.length ? `<div class="date-block-grid stage-grid">${names.map(name => `
            <button class="date-block" type="button" data-dash-presentoir-city="${escapeHtml(name)}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-map-pin"/></svg></div>
                <div class="date-block-value">${counts.get(name)}</div>
                <div class="date-block-label">${escapeHtml(name)}</div>
                <div class="date-block-sub">${counts.get(name) > 1 ? 'montures' : 'monture'}</div>
            </button>
        `).join('')}</div>` : `<div class="track-empty"><p>Aucun magasin avec du présentoir pour le moment.</p></div>`;
        body.querySelectorAll('[data-dash-presentoir-city]').forEach(btn => btn.addEventListener('click', () => {
            dashPresentoirCity = btn.dataset.dashPresentoirCity;
            renderDashPresentoirModal();
        }));
        return;
    }

    const scoped = montures.filter(m => m.stockLabel === 'Présentoir' && m.stockLocation === dashPresentoirCity);
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
    document.getElementById('dashPresentoirBack').addEventListener('click', () => {
        dashPresentoirCity = null;
        renderDashPresentoirModal();
    });
    body.querySelectorAll('[data-dash-chart-by]').forEach(btn => btn.addEventListener('click', () => {
        dashPresentoirChartBy = btn.dataset.dashChartBy;
        renderDashPresentoirModal();
    }));
}

function formatDayLabel(key) {
    return new Date(key + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STOCK_STAGES = [
    { key: 'general', label: 'Stock Général', icon: 'ic-warehouse' },
    { key: 'local', label: 'Stock Local', icon: 'ic-store' },
    { key: 'presentoir', label: 'Présentoir', icon: 'ic-tshirt' },
    { key: 'laboratoire', label: 'Laboratoire', icon: 'ic-flask' }
];
const STOCK_STAGE_BY_KEY = Object.fromEntries(STOCK_STAGES.map(s => [s.key, s]));

function stockStageOf(stationName) {
    const name = String(stationName || '').toLowerCase();
    if (!name) return null;
    if (name.includes('général') || name.includes('general') || name.includes('principal')) return 'general';
    if (name.includes('présentoir') || name.includes('presentoir')) return 'presentoir';
    if (name.includes('laboratoire') || name.includes('labo')) return 'laboratoire';
    return 'local';
}

function dedupeMovementsByMonture(movements) {
    const byBarcode = new Map();
    movements.forEach(m => {
        const existing = byBarcode.get(m.barcode);
        if (!existing || new Date(m.created_at) > new Date(existing.created_at)) byBarcode.set(m.barcode, m);
    });
    return Array.from(byBarcode.values());
}

async function loadStockMovements() {
    try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(`${API_URL}/inventory/movements?limit=300&offset=0`, { headers });
        const json = await response.json().catch(() => ({}));
        stockMovements = (response.ok && json.success && Array.isArray(json.data?.movements)) ? json.data.movements : [];
    } catch (error) {
        console.error('Erreur chargement mouvements (stock)', error);
        stockMovements = [];
    }
    renderStockStats();
    aRenderStock();
    aRenderStock();
}

function openStockStage(stageKey) {
    stockDrillStage = stageKey;
    stockDrillCity = null;
    stockDrillDate = null;
    stockDrillSort = 'recent';
    stockDrillDirection = 'in';
    stockDrillView = 'list';
    stockDrillChartBy = 'forme';
    document.getElementById('stockDrill').style.display = 'block';
    renderStockDrill();
}

function closeStockDrill() {
    stockDrillStage = null;
    stockDrillCity = null;
    stockDrillDate = null;
    document.getElementById('stockDrill').style.display = 'none';
}

function handleStockDrillBack() {
    if (stockDrillStage === 'general' && stockDrillDate) {
        stockDrillDate = null;
        renderStockDrill();
        return;
    }
    if (stockDrillStage !== 'general' && stockDrillCity) {
        stockDrillCity = null;
        renderStockDrill();
        return;
    }
    closeStockDrill();
}

function renderStockDrill() {
    const stage = STOCK_STAGE_BY_KEY[stockDrillStage];
    const stageMovements = stockMovements.filter(m => stockStageOf(m.to_station_name) === stockDrillStage);
    const needsCity = stockDrillStage !== 'general';
    const needsDate = stockDrillStage === 'general';
    const crumbLabel = stockDrillCity || (stockDrillDate ? formatDayLabel(stockDrillDate) : null);

    document.getElementById('stockDrillBackLabel').textContent = crumbLabel ? stage.label : 'Toutes les étapes';
    document.getElementById('stockDrillTitle').innerHTML = '<svg class="i" style="vertical-align:-3px;margin-right:6px;"><use href="#' + stage.icon + '"/></svg>' + stage.label +
        (crumbLabel ? ' <span class="date-detail-sep">›</span> ' + escapeHtml(crumbLabel) : '');

    const cityGrid = document.getElementById('stockCityGrid');
    const filterBar = document.getElementById('stockFilterBar');
    const chartToggle = document.getElementById('stockChartToggle');
    const chartByGroup = document.getElementById('stockChartByGroup');
    const chartContainer = document.getElementById('stockChart');

    if (needsCity && !stockDrillCity) {
        filterBar.style.display = 'none';
        chartToggle.style.display = 'none';
        chartContainer.style.display = 'none';
        cityGrid.style.display = 'grid';
        const latest = dedupeMovementsByMonture(stageMovements);
        const counts = new Map();
        latest.forEach(m => { const name = m.to_station_name || 'Ville inconnue'; counts.set(name, (counts.get(name) || 0) + 1); });
        const names = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));
        cityGrid.innerHTML = names.length ? names.map(name => `
            <button class="date-block" type="button" data-stock-city="${escapeHtml(name)}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-map-pin"/></svg></div>
                <div class="date-block-value">${counts.get(name)}</div>
                <div class="date-block-label">${escapeHtml(name)}</div>
                <div class="date-block-sub">${counts.get(name) > 1 ? 'montures' : 'monture'}</div>
            </button>
        `).join('') : `<div class="track-empty"><p>Aucune ville pour cette étape.</p></div>`;
        cityGrid.querySelectorAll('[data-stock-city]').forEach(btn => btn.addEventListener('click', () => {
            stockDrillCity = btn.dataset.stockCity;
            stockDrillView = 'list';
            renderStockDrill();
        }));
        document.getElementById('stockActivityList').innerHTML = '';
        return;
    }

    if (needsDate && !stockDrillDate) {
        filterBar.style.display = 'none';
        chartToggle.style.display = 'none';
        chartContainer.style.display = 'none';
        cityGrid.style.display = 'grid';
        const latest = dedupeMovementsByMonture(stageMovements);
        const counts = new Map();
        latest.forEach(m => { const key = dayKey(m.created_at); if (!key) return; counts.set(key, (counts.get(key) || 0) + 1); });
        const keys = Array.from(counts.keys()).sort((a, b) => b.localeCompare(a));
        cityGrid.innerHTML = keys.length ? keys.map(key => `
            <button class="date-block" type="button" data-stock-date="${key}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-calendar"/></svg></div>
                <div class="date-block-value">${counts.get(key)}</div>
                <div class="date-block-label">${formatDayLabel(key)}</div>
                <div class="date-block-sub">${counts.get(key) > 1 ? 'montures' : 'monture'}</div>
            </button>
        `).join('') : `<div class="track-empty"><p>Aucune date pour cette étape.</p></div>`;
        cityGrid.querySelectorAll('[data-stock-date]').forEach(btn => btn.addEventListener('click', () => {
            stockDrillDate = btn.dataset.stockDate;
            renderStockDrill();
        }));
        document.getElementById('stockActivityList').innerHTML = '';
        return;
    }

    cityGrid.style.display = 'none';

    // La répartition circulaire (par forme/gamme) n'est proposée que pour le
    // présentoir, une fois un magasin choisi.
    const canChart = stockDrillStage === 'presentoir' && !!stockDrillCity;
    chartToggle.style.display = canChart ? 'flex' : 'none';
    if (canChart) {
        chartToggle.querySelectorAll('[data-stock-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.stockView === stockDrillView));
        chartByGroup.style.display = stockDrillView === 'chart' ? 'flex' : 'none';
        chartByGroup.querySelectorAll('[data-stock-chart-by]').forEach(btn => btn.classList.toggle('active', btn.dataset.stockChartBy === stockDrillChartBy));
    }

    if (canChart && stockDrillView === 'chart') {
        filterBar.style.display = 'none';
        document.getElementById('stockActivityList').style.display = 'none';
        chartContainer.style.display = 'block';
        renderStockChart();
        return;
    }

    chartContainer.style.display = 'none';
    document.getElementById('stockActivityList').style.display = '';
    filterBar.style.display = 'flex';
    filterBar.querySelectorAll('[data-stock-sort]').forEach(btn => btn.classList.toggle('active', btn.dataset.stockSort === stockDrillSort));
    filterBar.querySelectorAll('[data-stock-direction]').forEach(btn => btn.classList.toggle('active', btn.dataset.stockDirection === stockDrillDirection));

    const directional = stockDrillDirection === 'in'
        ? stockMovements.filter(m => stockStageOf(m.to_station_name) === stockDrillStage && (!stockDrillCity || m.to_station_name === stockDrillCity))
        : stockMovements.filter(m => stockDrillCity ? m.from_station_name === stockDrillCity : stockStageOf(m.from_station_name) === stockDrillStage);

    const dated = stockDrillDate ? directional.filter(m => dayKey(m.created_at) === stockDrillDate) : directional;

    const rows = dedupeMovementsByMonture(dated).sort((a, b) =>
        stockDrillSort === 'recent' ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at));

    renderStockActivity(rows);
}

function renderStockActivity(rows, container) {
    container = container || document.getElementById('stockActivityList');
    if (!container) return;
    if (!rows.length) {
        container.innerHTML = `<div class="track-empty"><svg class="i" style="width:28px;height:28px;"><use href="#ic-warehouse"/></svg><p>Aucun mouvement pour cette sélection.</p></div>`;
        return;
    }
    container.innerHTML = rows.map(m => {
        const label = ((m.brand || '') + ' ' + (m.reference || '')).trim();
        const route = [m.from_station_name, m.to_station_name].filter(Boolean).map(displayStationName).join(' → ');
        return `<div class="activity-row">
            <div class="glass-photo"><svg class="i"><use href="#ic-glasses"/></svg></div>
            <div class="activity-main">
                <div class="activity-title"><strong>${escapeHtml(m.barcode)}</strong>${label ? `<span class="activity-sub">${escapeHtml(label)}</span>` : ''}</div>
                <div class="activity-meta"><span class="badge">${escapeHtml(m.action || '')}</span>${route ? `<span class="activity-where">${escapeHtml(route)}</span>` : ''}<span class="activity-date">${new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
        </div>`;
    }).join('');
}

/* ============================
   VUE MOBILE — mêmes raccourcis Gestion du stock (openStockStage /
   renderStockDrill), mais #stockDrill vit dans #desktopShell (masqué sous
   860px) : on rejoue la même navigation ville/date + tri/sens dans la
   fenêtre générique #viewModal, visible sur les deux vues.
   ============================ */
function openMobileStockStage(stageKey) {
    stockDrillStage = stageKey;
    stockDrillCity = null;
    stockDrillDate = null;
    stockDrillSort = 'recent';
    stockDrillDirection = 'in';
    const stage = STOCK_STAGE_BY_KEY[stageKey];
    openViewModal(stage.label, stage.icon, '');
    renderMobileStockStageModal();
}

function renderMobileStockStageModal() {
    const body = document.getElementById('viewModalBody');
    if (!body) return;
    const stage = STOCK_STAGE_BY_KEY[stockDrillStage];
    const stageMovements = stockMovements.filter(m => stockStageOf(m.to_station_name) === stockDrillStage);
    const needsCity = stockDrillStage !== 'general';
    const needsDate = stockDrillStage === 'general';

    if (needsCity && !stockDrillCity) {
        const latest = dedupeMovementsByMonture(stageMovements);
        const counts = new Map();
        latest.forEach(m => { const name = m.to_station_name || 'Ville inconnue'; counts.set(name, (counts.get(name) || 0) + 1); });
        const names = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));
        body.innerHTML = names.length ? `<div class="date-block-grid stage-grid">${names.map(name => `
            <button class="date-block" type="button" data-mstock-city="${escapeHtml(name)}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-map-pin"/></svg></div>
                <div class="date-block-value">${counts.get(name)}</div>
                <div class="date-block-label">${escapeHtml(name)}</div>
                <div class="date-block-sub">${counts.get(name) > 1 ? 'montures' : 'monture'}</div>
            </button>`).join('')}</div>` : `<div class="track-empty"><p>Aucune ville pour cette étape.</p></div>`;
        body.querySelectorAll('[data-mstock-city]').forEach(btn => btn.addEventListener('click', () => {
            stockDrillCity = btn.dataset.mstockCity;
            renderMobileStockStageModal();
        }));
        return;
    }

    if (needsDate && !stockDrillDate) {
        const latest = dedupeMovementsByMonture(stageMovements);
        const counts = new Map();
        latest.forEach(m => { const key = dayKey(m.created_at); if (!key) return; counts.set(key, (counts.get(key) || 0) + 1); });
        const keys = Array.from(counts.keys()).sort((a, b) => b.localeCompare(a));
        body.innerHTML = keys.length ? `<div class="date-block-grid stage-grid">${keys.map(key => `
            <button class="date-block" type="button" data-mstock-date="${key}">
                <div class="date-block-icon"><svg class="i"><use href="#ic-calendar"/></svg></div>
                <div class="date-block-value">${counts.get(key)}</div>
                <div class="date-block-label">${formatDayLabel(key)}</div>
                <div class="date-block-sub">${counts.get(key) > 1 ? 'montures' : 'monture'}</div>
            </button>`).join('')}</div>` : `<div class="track-empty"><p>Aucune date pour cette étape.</p></div>`;
        body.querySelectorAll('[data-mstock-date]').forEach(btn => btn.addEventListener('click', () => {
            stockDrillDate = btn.dataset.mstockDate;
            renderMobileStockStageModal();
        }));
        return;
    }

    const crumbLabel = stockDrillCity || (stockDrillDate ? formatDayLabel(stockDrillDate) : '');
    const directional = stockDrillDirection === 'in'
        ? stockMovements.filter(m => stockStageOf(m.to_station_name) === stockDrillStage && (!stockDrillCity || m.to_station_name === stockDrillCity))
        : stockMovements.filter(m => stockDrillCity ? m.from_station_name === stockDrillCity : stockStageOf(m.from_station_name) === stockDrillStage);
    const dated = stockDrillDate ? directional.filter(m => dayKey(m.created_at) === stockDrillDate) : directional;
    const rows = dedupeMovementsByMonture(dated).sort((a, b) =>
        stockDrillSort === 'recent' ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at));

    body.innerHTML = `
        <div class="table-toolbar" style="padding:0 0 14px;">
            <button class="btn btn-ghost" type="button" id="mStockDrillBack"><svg class="i"><use href="#ic-arrow-left"/></svg><span>${escapeHtml(stage.label)}</span></button>
            ${crumbLabel ? `<span class="date-detail-label">${escapeHtml(crumbLabel)}</span>` : ''}
        </div>
        <div class="catalogue-filter-group" style="margin-bottom:10px;">
            <span class="catalogue-filter-label">Tri</span>
            <button class="catalogue-filter-block ${stockDrillSort === 'recent' ? 'active' : ''}" type="button" data-mstock-sort="recent">Plus récent</button>
            <button class="catalogue-filter-block ${stockDrillSort === 'older' ? 'active' : ''}" type="button" data-mstock-sort="older">Plus ancien</button>
        </div>
        <div class="catalogue-filter-group" style="margin-bottom:14px;">
            <span class="catalogue-filter-label">Sens</span>
            <button class="catalogue-filter-block ${stockDrillDirection === 'in' ? 'active' : ''}" type="button" data-mstock-direction="in">Entrée</button>
            <button class="catalogue-filter-block ${stockDrillDirection === 'out' ? 'active' : ''}" type="button" data-mstock-direction="out">Sortie</button>
        </div>
        <div class="activity-list" id="mStockActivityList"></div>
    `;
    renderStockActivity(rows, document.getElementById('mStockActivityList'));
    document.getElementById('mStockDrillBack').addEventListener('click', () => {
        if (stockDrillStage === 'general' && stockDrillDate) { stockDrillDate = null; }
        else if (stockDrillStage !== 'general' && stockDrillCity) { stockDrillCity = null; }
        else { closeViewModal(); return; }
        renderMobileStockStageModal();
    });
    body.querySelectorAll('[data-mstock-sort]').forEach(btn => btn.addEventListener('click', () => { stockDrillSort = btn.dataset.mstockSort; renderMobileStockStageModal(); }));
    body.querySelectorAll('[data-mstock-direction]').forEach(btn => btn.addEventListener('click', () => { stockDrillDirection = btn.dataset.mstockDirection; renderMobileStockStageModal(); }));
}

let montures = [{

    id: 'MNT-001',
    reference: 'RAY-BAN-RB2180-001',
    marque: 'Ray-Ban',
    genre: 'Homme',
    forme: 'Aviateur',
    couleur: 'Noir',
    matiere: 'Métal',
    prix: 45000,
    quantite: 8,
    seuil: 3,
    emplacement: 'Rack A-1',
    stockGeneral: 8,
    stockLocal: 2,
    presentoir: 1
}, {
    id: 'MNT-002',
    reference: 'OAKLEY-GA2025-001',
    marque: 'Oakley',
    genre: 'Homme',
    forme: 'Sport',
    couleur: 'Bleu',
    matiere: 'Plastique',
    prix: 38000,
    quantite: 6,
    seuil: 2,
    emplacement: 'Rack B-2',
    stockGeneral: 6,
    stockLocal: 1,
    presentoir: 0
}, {
    id: 'MNT-003',
    reference: 'GUCCI-GG001-2026',
    marque: 'Gucci',
    genre: 'Femme',
    forme: 'Papillon',
    couleur: 'Doré',
    matiere: 'Acétate',
    prix: 125000,
    quantite: 4,
    seuil: 2,
    emplacement: 'Rack A-3',
    stockGeneral: 4,
    stockLocal: 2,
    presentoir: 1
}, {
    id: 'MNT-004',
    reference: 'PRADA-PR2024-001',
    marque: 'Prada',
    genre: 'Femme',
    forme: 'Oeil de chat',
    couleur: 'Noir',
    matiere: 'Acétate',
    prix: 98000,
    quantite: 3,
    seuil: 2,
    emplacement: 'Rack C-1',
    stockGeneral: 3,
    stockLocal: 0,
    presentoir: 1
}, {
    id: 'MNT-005',
    reference: 'DIOR-DIOR2025-001',
    marque: 'Dior',
    genre: 'Femme',
    forme: 'Rond',
    couleur: 'Gris',
    matiere: 'Titane',
    prix: 150000,
    quantite: 2,
    seuil: 1,
    emplacement: 'Rack C-2',
    stockGeneral: 2,
    stockLocal: 1,
    presentoir: 0
}, {
    id: 'MNT-006',
    reference: 'VERSACE-VE2026-001',
    marque: 'Versace',
    genre: 'Unisexe',
    forme: 'Rectangulaire',
    couleur: 'Argenté',
    matiere: 'Métal',
    prix: 89000,
    quantite: 5,
    seuil: 2,
    emplacement: 'Rack B-1',
    stockGeneral: 5,
    stockLocal: 1,
    presentoir: 1
}];

let nextEmpId = 7;
let editingId = null;
let editingDbId = null;

let fpState = {
    enrolled: false,
    template: null,
    date: null,
    isScanning: false,
    scanInterval: null,
    scanProgress: 0
};
let fpAbortController = null;

// ============================
// WEBAUTHN (empreinte digitale réelle)
// ============================
function checkWebAuthnSupport() {
    if (!window.PublicKeyCredential) {
        alert("Ce navigateur ne supporte pas WebAuthn / Windows Hello. Utilisez Edge ou Chrome sur Windows 10/11 avec un lecteur d'empreinte.");
        return false;
    }
    return true;
}

function bufferToBase64URL(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    bytes.forEach(b => str += String.fromCharCode(b));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64URLToBuffer(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(base64 + padding);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return buffer;
}

async function createWebAuthnCredential(challenge, userIdSeed, email, displayName) {
    fpAbortController = new AbortController();
    try {
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: base64URLToBuffer(challenge),
                rp: { name: 'Lunetterie Pro', id: 'localhost' },
                user: {
                    id: new TextEncoder().encode(String(userIdSeed)),
                    name: email || 'employe@lunetterie.local',
                    displayName: displayName || 'Employé'
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },
                    { type: 'public-key', alg: -257 }
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'required',
                    requireResidentKey: true
                },
                timeout: 60000,
                attestation: 'none',
                signal: fpAbortController.signal
            }
        });

        return {
            id: credential.id,
            rawId: bufferToBase64URL(credential.rawId),
            type: credential.type,
            response: {
                clientDataJSON: bufferToBase64URL(credential.response.clientDataJSON),
                attestationObject: bufferToBase64URL(credential.response.attestationObject)
            }
        };
    } finally {
        fpAbortController = null;
    }
}

const avatarColors = ['#2c4055', '#c9a84c', '#2ecc71', '#e74c3c', '#3498db', '#9b59b6', '#e67e22', '#1abc9c'];

// ============================
// RENDER FUNCTIONS
// ============================
function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return avatarColors[Math.abs(hash) % avatarColors.length];
}

function renderPosteBadge(poste) {
    return `<span class="poste-badge"><svg class="i"><use href="#ic-map-pin"/></svg> ${poste || 'Non assigné'}</span>`;
}

function renderFingerprintBadge(emp) {
    if (emp.fingerprint?.enrolled) {
        return `<span class="fingerprint-badge enrolled"><svg class="i"><use href="#ic-check-circle"/></svg> Enregistrée</span>`;
    }
    return `<span class="fingerprint-badge not-enrolled"><svg class="i"><use href="#ic-exclamation-circle"/></svg> Non enregistrée</span>`;
}

// ============================
// DASHBOARD — CA / enregistrements / envois du jour, activité en direct
// ============================
let soldGlasses = [];
async function loadSoldGlasses() {
    try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(`${API_URL}/inventory/glasses?status=VENDUE`, { headers });
        const json = await response.json().catch(() => ({}));
        soldGlasses = (response.ok && json.success && Array.isArray(json.data?.glasses)) ? json.data.glasses : [];
    } catch (error) {
        console.error('Erreur chargement montures vendues', error);
        soldGlasses = [];
    }
}

// Le backend n'expose pas de champ de date de vente dédié et confirmé : on
// retient la première date plausible trouvée sur l'objet (mêmes conventions
// défensives que imageUrlOf() dans historique.js).
function soldDateOf(glass) { return glass.sold_at || glass.updated_at || glass.date_vente || glass.created_at || null; }
function dayKey(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
}
function todayKey() { return new Date().toISOString().slice(0, 10); }

function renderDashboardStats() {
    const today = todayKey();
    const caDuJour = soldGlasses.filter(g => dayKey(soldDateOf(g)) === today).reduce((sum, g) => sum + (Number(g.price) || 0), 0);
    const registrations = stockMovements.filter(m => m.action === 'RECEPTION_FOURNISSEUR' && dayKey(m.created_at) === today).length;
    const shipments = stockMovements.filter(m => dayKey(m.created_at) === today && stockStageOf(m.to_station_name) === 'local').length;
    const presentoirTotal = dedupeMovementsByMonture(stockMovements).filter(m => stockStageOf(m.to_station_name) === 'presentoir').length;

    const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setValue('statCaDuJour', formatNumber(caDuJour) + ' FCFA');
    setValue('statRegistrationsDuJour', registrations);
    setValue('statShipmentsDuJour', shipments);
    setValue('statPresentoirTotal', presentoirTotal);
}

function formatNumber(value) { return Number(value || 0).toLocaleString('fr-FR'); }

function renderDashboardNotifications() {
    const container = document.getElementById('dashboardNotifications');
    if (!container) return;
    const today = todayKey();

    const movementItems = stockMovements
        .filter(m => dayKey(m.created_at) === today)
        .map(m => {
            const label = ((m.brand || '') + ' ' + (m.reference || '')).trim();
            const route = [m.from_station_name, m.to_station_name].filter(Boolean).map(displayStationName).join(' → ');
            return { time: m.created_at, icon: 'ic-glasses', title: `${escapeHtml(m.barcode)}${label ? ' — ' + escapeHtml(label) : ''}`, meta: [escapeHtml(m.action || ''), route ? escapeHtml(route) : null].filter(Boolean) };
        });

    const saleItems = soldGlasses
        .filter(g => dayKey(soldDateOf(g)) === today)
        .map(g => {
            const label = ((g.brand || '') + ' ' + (g.reference || '')).trim();
            const price = g.price ? formatNumber(g.price) + ' FCFA' : null;
            return { time: soldDateOf(g), icon: 'ic-credit-card', title: `${escapeHtml(g.barcode || '')}${label ? ' — ' + escapeHtml(label) : ''}`, meta: ['VENTE', price].filter(Boolean) };
        });

    const sessionItems = allReceptionCommandsCache
        .filter(c => dayKey(c.created_at) === today)
        .map(c => ({ time: c.created_at, icon: 'ic-tag', title: `Nouvelle session créée — ${escapeHtml(c.code)}`, meta: ['SESSION', `${c.target_count} monture(s) à enregistrer`] }));

    const items = movementItems.concat(saleItems, sessionItems).sort((a, b) => new Date(b.time) - new Date(a.time));

    if (!items.length) {
        container.innerHTML = `<div class="track-empty"><svg class="i" style="width:28px;height:28px;"><use href="#ic-bell"/></svg><p>Aucune activité aujourd'hui pour le moment.</p></div>`;
        return;
    }

    container.innerHTML = items.map(item => `<div class="activity-row">
        <div class="glass-photo"><svg class="i"><use href="#${item.icon}"/></svg></div>
        <div class="activity-main">
            <div class="activity-title"><strong>${item.title}</strong></div>
            <div class="activity-meta">${item.meta.map(m => `<span class="badge">${m}</span>`).join('')}<span class="activity-date">${new Date(item.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>
    </div>`).join('');
}

function renderEmployees() {
    const tbody = document.getElementById('employeesTable');
    const roleFilter = document.getElementById('filterRole').value;
    const posteFilter = document.getElementById('filterPoste').value;
    const statusFilter = document.getElementById('filterStatus').value;
    const fpFilter = document.getElementById('filterFingerprint').value;
    const search = document.getElementById('employeeSearch').value.toLowerCase();

    let filtered = employees.filter(e => {
        const matchRole = roleFilter === 'all' || e.role === roleFilter;
        const matchPoste = posteFilter === 'all' || e.poste === posteFilter;
        const matchStatus = statusFilter === 'all' || e.status === statusFilter;
        const matchFp = fpFilter === 'all' ||
            (fpFilter === 'enrolled' && e.fingerprint?.enrolled) ||
            (fpFilter === 'not-enrolled' && !e.fingerprint?.enrolled);
        const matchScope = !employeeStationScope || (employeeStationScope.startsWith('kind:')
            ? employeeStationKind(e.poste) === employeeStationScope.slice(5)
            : e.poste === employeeStationScope);
        const matchSearch = e.fullName.toLowerCase().includes(search) ||
            e.phone.includes(search) ||
            e.email.toLowerCase().includes(search);
        return matchRole && matchPoste && matchStatus && matchFp && matchSearch && matchScope;
    });

    document.getElementById('employeeCount').textContent = `${filtered.length} employés`;

    if (!filtered.length) {
        tbody.innerHTML =
            `<tr><td colspan="8" class="empty-state"><svg class="i" style="font-size:32px;"><use href="#ic-users"/></svg><p>Aucun employé trouvé</p></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(e => `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="avatar-sm" style="background:${getAvatarColor(e.fullName)};">${getInitials(e.fullName)}</div>
                            <div class="info">
                                <div class="name">${e.fullName}</div>
                                <div class="sub">${e.email || 'Email non renseigné'}</div>
                            </div>
                        </div>
                    </td>
                    <td>${e.phone}</td>
                    <td>${e.emergencyPhone || '-'}</td>
                    <td>${formatRole(e.role)}</td>
                    <td>${renderPosteBadge(e.poste)}</td>
                    <td>${renderFingerprintBadge(e)}</td>
                    <td><span class="status-badge ${e.status === 'Actif' ? 'active' : 'inactive'}"><span class="dot"></span>${e.status}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="view" onclick="viewEmployee('${e.id}')" title="Voir"><svg class="i"><use href="#ic-eye"/></svg></button>
                            <button class="edit" onclick="editEmployee('${e.id}')" title="Modifier"><svg class="i"><use href="#ic-pencil"/></svg></button>
                            <button class="delete" onclick="deleteEmployee('${e.id}')" title="Supprimer"><svg class="i"><use href="#ic-trash"/></svg></button>
                        </div>
                    </td>
                </tr>
            `).join('');
}

let employeeStationScope = null;
let employeeStationLevel = 'groups';

function employeeStationKind(poste) {
    const name = String(poste || '').toLowerCase();
    if (name.includes('général') || name.includes('general') || name.includes('principal')) return 'general';
    if (name.includes('présentoir') || name.includes('presentoir')) return 'presentoir';
    if (name.includes('laboratoire') || name.includes('labo')) return 'laboratoire';
    return 'local';
}

function openEmployeeStationDetail(scope, label) {
    employeeStationScope = scope;
    document.getElementById('employeeStationGrid').style.display = 'none';
    document.getElementById('employeesDetail').style.display = 'block';
    document.querySelector('#employeesDetail #employeeStationBack span').textContent = label || "Groupes d'employés";
    renderEmployees();
}

function renderEmployeeStationBlocks() {
    const grid = document.getElementById('employeeStationGrid');
    if (!grid) return;
    const items = [
        { key: 'general', label: 'Station Générale', icon: 'ic-warehouse' },
        { key: 'local', label: 'Sous-stations', icon: 'ic-map-pin' },
        { key: 'presentoir', label: 'Présentoir', icon: 'ic-store' },
        { key: 'laboratoire', label: 'Laboratoire', icon: 'ic-flask' }
    ];
    if (employeeStationLevel === 'cities') {
        const cities = [...new Set(employees.filter(e => employeeStationKind(e.poste) === 'local').map(e => e.poste || 'Non assigné'))];
        grid.innerHTML = `<button class="date-block" type="button" data-employee-back="1"><div class="date-block-icon"><svg class="i"><use href="#ic-arrow-left"/></svg></div><div class="date-block-label">Sous-stations</div><div class="date-block-sub">Retour aux groupes</div></button>` + cities.map(city => {
            const total = employees.filter(e => e.poste === city).length;
            return `<button class="date-block" type="button" data-employee-city="${escapeHtml(city)}"><div class="date-block-icon"><svg class="i"><use href="#ic-map-pin"/></svg></div><div class="date-block-value">${total}</div><div class="date-block-label">${escapeHtml(city)}</div><div class="date-block-sub">employé${total > 1 ? 's' : ''}</div></button>`;
        }).join('');
        grid.querySelector('[data-employee-back]').addEventListener('click', () => { employeeStationLevel = 'groups'; renderEmployeeStationBlocks(); });
        grid.querySelectorAll('[data-employee-city]').forEach(btn => btn.addEventListener('click', () => openEmployeeStationDetail(btn.dataset.employeeCity, 'Sous-stations · ' + btn.dataset.employeeCity)));
        return;
    }
    grid.innerHTML = items.map(item => {
        const total = employees.filter(e => employeeStationKind(e.poste) === item.key).length;
        return `<button class="date-block" type="button" data-employee-kind="${item.key}"><div class="date-block-icon"><svg class="i"><use href="#${item.icon}"/></svg></div><div class="date-block-value">${total}</div><div class="date-block-label">${item.label}</div><div class="date-block-sub">${item.key === 'local' ? 'cliquer pour choisir une ville' : 'employé' + (total > 1 ? 's' : '')}</div></button>`;
    }).join('');
    grid.querySelectorAll('[data-employee-kind]').forEach(btn => btn.addEventListener('click', () => {
        if (btn.dataset.employeeKind === 'local') { employeeStationLevel = 'cities'; renderEmployeeStationBlocks(); return; }
        const item = items.find(i => i.key === btn.dataset.employeeKind);
        openEmployeeStationDetail('kind:' + item.key, item.label);
    }));
}

// "Gamme" = tranche de prix (mêmes seuils que le sélecteur de gamme de scan.html :
// Classique / Moyenne gamme / Luxe).
function gammeOf(m) {
    const prix = Number(m.prix) || 0;
    if (prix <= 50000) return 'Classique';
    if (prix <= 100000) return 'Moyenne gamme';
    return 'Luxe';
}

let currentMontureForme = null;
let catalogueFilters = { couleur: 'all', genre: 'all', gamme: 'all' };

function renderCatalogueFilterBlocks() {
    const container = document.getElementById('catalogueFilterBlocks');
    if (!container) return;
    const scoped = currentMontureForme ? montures.filter(m => m.forme === currentMontureForme) : montures;
    const groups = [
        { key: 'couleur', label: 'Couleur', getValue: m => m.couleur },
        { key: 'genre', label: 'Genre', getValue: m => m.genre, canonical: ['Homme', 'Femme', 'Unisexe'] },
        { key: 'gamme', label: 'Gamme', getValue: gammeOf, canonical: ['Classique', 'Moyenne gamme', 'Luxe'] }
    ];
    container.innerHTML = groups.map(group => {
        const found = [...new Set(scoped.map(group.getValue).filter(Boolean))];
        // Les valeurs canoniques (genre, gamme) restent toujours proposées, même
        // absentes du sous-ensemble courant, pour un choix stable dans le filtre.
        const values = group.canonical ? group.canonical.concat(found.filter(v => !group.canonical.includes(v)).sort()) : found.sort();
        return `<div class="catalogue-filter-group"><span class="catalogue-filter-label">${group.label}</span><button class="catalogue-filter-block ${catalogueFilters[group.key] === 'all' ? 'active' : ''}" type="button" data-catalogue-filter="${group.key}" data-catalogue-value="all">Toutes</button>${values.map(value => `<button class="catalogue-filter-block ${catalogueFilters[group.key] === value ? 'active' : ''}" type="button" data-catalogue-filter="${group.key}" data-catalogue-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('')}</div>`;
    }).join('');
    container.querySelectorAll('[data-catalogue-filter]').forEach(button => button.addEventListener('click', () => {
        catalogueFilters[button.dataset.catalogueFilter] = button.dataset.catalogueValue;
        renderCatalogueFilterBlocks();
        renderMontures();
    }));
}

// Vue par défaut du catalogue : un bloc carré par forme de monture plutôt
// qu'un tableau plat — cliquer un bloc ouvre la liste de cette forme, avec
// des filtres couleur/genre/gamme pour affiner.
function renderMonturesFormeBlocks() {
    const grid = document.getElementById('monturesFormeGrid');
    if (!grid) return;

    const groups = new Map();
    montures.forEach(m => {
        const key = m.forme || 'Forme inconnue';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
    });

    const keys = Array.from(groups.keys()).sort((a, b) => groups.get(b).length - groups.get(a).length);

    if (!keys.length) {
        grid.innerHTML = `<div class="empty-state"><svg class="i" style="font-size:32px;"><use href="#ic-glasses"/></svg><p>Aucune monture</p></div>`;
        return;
    }

    grid.innerHTML = keys.map(key => `
        <button class="date-block" type="button" data-forme-key="${escapeHtml(key)}">
            <div class="date-block-icon"><svg class="i"><use href="#ic-glasses"/></svg></div>
            <div class="date-block-value">${groups.get(key).length}</div>
            <div class="date-block-label">${escapeHtml(key)}</div>
            <div class="date-block-sub">${groups.get(key).length > 1 ? 'montures' : 'monture'}</div>
        </button>
    `).join('');

    grid.querySelectorAll('[data-forme-key]').forEach(block => {
        block.addEventListener('click', () => openMonturesFormeDetail(block.dataset.formeKey));
    });
}

function openMonturesFormeDetail(forme) {
    currentMontureForme = forme;
    catalogueFilters = { couleur: 'all', genre: 'all', gamme: 'all' };
    document.getElementById('monturesFormeGrid').style.display = 'none';
    document.getElementById('monturesFormeDetail').style.display = 'block';
    document.getElementById('monturesFormeLabel').textContent = forme;
    renderCatalogueFilterBlocks();
    renderMontures();
}

function closeMonturesFormeDetail() {
    currentMontureForme = null;
    document.getElementById('monturesFormeDetail').style.display = 'none';
    document.getElementById('monturesFormeGrid').style.display = 'grid';
    renderMonturesFormeBlocks();
}

function renderMontures() {
    const tbody = document.getElementById('monturesTable');
    const couleurFilter = catalogueFilters.couleur;
    const genreFilter = catalogueFilters.genre;
    const gammeFilter = catalogueFilters.gamme;
    const search = document.getElementById('montureSearch').value.toLowerCase();

    let filtered = montures.filter(m => {
        const matchForme = !currentMontureForme || m.forme === currentMontureForme;
        const matchCouleur = couleurFilter === 'all' || m.couleur === couleurFilter;
        const matchGenre = genreFilter === 'all' || m.genre === genreFilter;
        const matchGamme = gammeFilter === 'all' || gammeOf(m) === gammeFilter;
        const matchSearch = m.reference.toLowerCase().includes(search) ||
            m.marque.toLowerCase().includes(search);
        return matchForme && matchCouleur && matchGenre && matchGamme && matchSearch;
    });

    document.getElementById('montureCount').textContent = `${filtered.length} montures`;

    if (!filtered.length) {
        tbody.innerHTML =
            `<tr><td colspan="8" class="empty-state"><svg class="i" style="font-size:32px;"><use href="#ic-glasses"/></svg><p>Aucune monture trouvée</p></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(m => `
                <tr>
                    <td><strong>${m.reference}</strong></td>
                    <td>${m.marque}</td>
                    <td>${m.genre}</td>
                    <td>${m.couleur}</td>
                    <td>${m.forme}</td>
                    <td><span class="poste-badge">${escapeHtml(m.stockLabel || (m.stockGeneral ? 'Stock Général' : m.stockLocal ? 'Stock local' : m.presentoir ? 'Présentoir' : 'À préciser'))}</span></td>
                    <td>${escapeHtml(m.stockLocation || m.emplacement || '—')}</td>
                    <td>
                        <div class="action-btns">
                            <button class="view" onclick="viewMonture('${m.id}')" title="Voir"><svg class="i"><use href="#ic-eye"/></svg></button>
                            <button class="delete" onclick="deleteMonture('${m.id}')" title="Supprimer"><svg class="i"><use href="#ic-trash"/></svg></button>
                        </div>
                    </td>
                </tr>
            `).join('');
}

function updateStats() {
    document.getElementById('employeeBadge').textContent = employees.length;
    renderDashboardStats();
    renderDashboardNotifications();
}

function updateAll() {
    renderEmployees();
    renderEmployeeStationBlocks();
    renderMontures();
    renderMonturesFormeBlocks();
    updateStats();
    aRenderDashboard();
    aRenderEmployeeStationBlocks();
    aRenderEmployeesList();
    aRenderMontureFilterBlocks();
    aRenderMonturesList();
    const monturesBadge = document.getElementById('monturesBadge');
    if (monturesBadge) monturesBadge.textContent = String(montures.length);
}

// ============================
// VUE MOBILE
// ============================
function aRenderDashboard() {
    const today = todayKey();
    const caDuJour = soldGlasses.filter(g => dayKey(soldDateOf(g)) === today).reduce((sum, g) => sum + (Number(g.price) || 0), 0);
    const registrations = stockMovements.filter(m => m.action === 'RECEPTION_FOURNISSEUR' && dayKey(m.created_at) === today).length;
    const shipments = stockMovements.filter(m => dayKey(m.created_at) === today && stockStageOf(m.to_station_name) === 'local').length;

    const presentoirTotal = dedupeMovementsByMonture(stockMovements).filter(m => stockStageOf(m.to_station_name) === 'presentoir').length;
    const tiles = [
        { icon: 'ic-credit-card', color: 'green', value: formatNumber(caDuJour) + ' FCFA', label: "CA du jour" },
        { icon: 'ic-inbox', color: 'blue', value: registrations, label: 'Enregistrements du jour' },
        { icon: 'ic-store', color: 'gold', value: shipments, label: 'Envois en magasin du jour' },
        { icon: 'ic-tshirt', color: 'purple', value: presentoirTotal, label: 'Présentoir', action: 'presentoir' }
    ];
    document.getElementById('aStatCarousel').innerHTML = tiles.map(t => `
        <${t.action ? 'button' : 'div'} class="stat-tile-m" ${t.action ? `type="button" data-a-dash-action="${t.action}"` : ''}>
            <div class="stat-icon-m ${t.color}"><svg class="i"><use href="#${t.icon}"/></svg></div>
            <div class="stat-value-m">${t.value}</div>
            <div class="stat-label-m">${t.label}</div>
        </${t.action ? 'button' : 'div'}>
    `).join('');

    const container = document.getElementById('aDashboardNotifications');
    if (container) container.innerHTML = document.getElementById('dashboardNotifications')?.innerHTML || '';
}

function aEmployeeCardHtml(e) {
    return `<button class="mobile-card" type="button" data-emp-id="${e.id}">
        <span class="card-avatar" style="background:${getAvatarColor(e.fullName)};">${getInitials(e.fullName)}</span>
        <span class="card-text">
            <h4>${e.fullName}</h4>
            <p>${e.phone || 'Téléphone non renseigné'}</p>
            <span class="card-badges">${renderPosteBadge(e.poste)}${renderFingerprintBadge(e)}</span>
        </span>
        <span class="card-chevron"><svg class="i"><use href="#ic-arrow-right"/></svg></span>
    </button>`;
}

let aEmployeeScope = { type: 'all', value: '' };
let aMontureFilters = { forme: 'all', couleur: 'all', genre: 'all', gamme: 'all' };

function aRenderEmployeeStationBlocks() {
    const container = document.getElementById('aEmployeeStationGrid');
    if (!container) return;
    if (aEmployeeScope.type === 'cities') {
        const cities = [...new Set(employees.filter(e => employeeStationKind(e.poste) === 'local').map(e => e.poste || 'Non assigné'))].sort();
        container.innerHTML = `<button class="mobile-filter-block active" type="button" data-a-employee-back="1">← Sous-stations</button>` + cities.map(city => {
            const total = employees.filter(e => e.poste === city).length;
            return `<button class="mobile-filter-block" type="button" data-a-employee-city="${escapeHtml(city)}">${escapeHtml(city)} · ${total}</button>`;
        }).join('');
        container.querySelector('[data-a-employee-back]').addEventListener('click', () => { aEmployeeScope = { type: 'all', value: '' }; aRenderEmployeeStationBlocks(); aRenderEmployeesList(); });
        container.querySelectorAll('[data-a-employee-city]').forEach(btn => btn.addEventListener('click', () => { aEmployeeScope = { type: 'city', value: btn.dataset.aEmployeeCity }; aRenderEmployeeStationBlocks(); aRenderEmployeesList(); }));
        return;
    }
    const groups = [
        { key: 'all', label: 'Tous' },
        { key: 'general', label: 'Station Générale' },
        { key: 'local', label: 'Sous-stations' },
        { key: 'presentoir', label: 'Présentoir' },
        { key: 'laboratoire', label: 'Laboratoire' }
    ];
    container.innerHTML = groups.map(group => {
        const count = group.key === 'all' ? employees.length : employees.filter(e => employeeStationKind(e.poste) === group.key).length;
        const active = aEmployeeScope.type === 'kind' && aEmployeeScope.value === group.key || aEmployeeScope.type === 'all' && group.key === 'all';
        return `<button class="mobile-filter-block ${active ? 'active' : ''}" type="button" data-a-employee-kind="${group.key}">${group.label} · ${count}</button>`;
    }).join('');
    container.querySelectorAll('[data-a-employee-kind]').forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.aEmployeeKind;
        aEmployeeScope = key === 'local' ? { type: 'cities', value: '' } : key === 'all' ? { type: 'all', value: '' } : { type: 'kind', value: key };
        aRenderEmployeeStationBlocks();
        aRenderEmployeesList();
    }));
}

function aRenderEmployeesList() {
    const search = (document.getElementById('aEmployeeSearch')?.value || '').toLowerCase();
    const filtered = employees.filter(e => {
        const matchesScope = aEmployeeScope.type === 'all' || aEmployeeScope.type === 'cities'
            || (aEmployeeScope.type === 'kind' && employeeStationKind(e.poste) === aEmployeeScope.value)
            || (aEmployeeScope.type === 'city' && e.poste === aEmployeeScope.value);
        return matchesScope && (
        e.fullName.toLowerCase().includes(search) ||
        e.phone.includes(search) ||
        e.email.toLowerCase().includes(search)
        );
    });
    document.getElementById('aEmployeesList').innerHTML = filtered.length
        ? filtered.map(e => aEmployeeCardHtml(e)).join('')
        : '<p class="mobile-empty">Aucun employé trouvé</p>';
    document.querySelectorAll('#aEmployeesList [data-emp-id]').forEach(card => {
        card.addEventListener('click', () => aOpenEmployeeSheet(card.dataset.empId));
    });
}

function aMontureCardHtml(m) {
    const stockLabel = m.stockLabel || (m.stockGeneral ? 'Stock Général' : m.stockLocal ? 'Stock local' : m.presentoir ? 'Présentoir' : 'À préciser');
    return `<button class="mobile-card" type="button" data-monture-id="${m.id}">
        <span class="card-icon"><svg class="i"><use href="#ic-glasses"/></svg></span>
        <span class="card-text">
            <h4>${m.marque} — ${m.reference}</h4>
            <p>${m.genre} · ${m.couleur} · ${m.forme}</p>
            <span class="card-badges"><span class="poste-badge">${escapeHtml(stockLabel)}</span><span class="poste-badge">${escapeHtml(m.stockLocation || m.emplacement || '—')}</span></span>
        </span>
        <span class="card-chevron"><svg class="i"><use href="#ic-arrow-right"/></svg></span>
    </button>`;
}

function aRenderMontureFilterBlocks() {
    const container = document.getElementById('aMontureFilterBlocks');
    if (!container) return;
    const groups = [
        { key: 'forme', label: 'Formes', getValue: m => m.forme },
        { key: 'couleur', label: 'Couleurs', getValue: m => m.couleur },
        { key: 'genre', label: 'Genres', getValue: m => m.genre, canonical: ['Homme', 'Femme', 'Unisexe'] },
        { key: 'gamme', label: 'Gammes', getValue: gammeOf, canonical: ['Classique', 'Moyenne gamme', 'Luxe'] }
    ];
    container.innerHTML = groups.map(group => {
        const found = [...new Set(montures.map(group.getValue).filter(Boolean))];
        const values = group.canonical ? group.canonical.concat(found.filter(v => !group.canonical.includes(v)).sort()) : found.sort();
        return `<button class="mobile-filter-block ${aMontureFilters[group.key] === 'all' ? 'active' : ''}" type="button" data-a-monture-filter="${group.key}" data-a-monture-value="all">Toutes ${group.label.toLowerCase()}</button>` + values.map(value => `<button class="mobile-filter-block ${aMontureFilters[group.key] === value ? 'active' : ''}" type="button" data-a-monture-filter="${group.key}" data-a-monture-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('');
    }).join('');
    container.querySelectorAll('[data-a-monture-filter]').forEach(btn => btn.addEventListener('click', () => {
        aMontureFilters[btn.dataset.aMontureFilter] = btn.dataset.aMontureValue;
        aRenderMontureFilterBlocks();
        aRenderMonturesList();
    }));
}

function aRenderMonturesList() {
    const search = (document.getElementById('aMontureSearch')?.value || '').toLowerCase();
    const filtered = montures.filter(m =>
        m.reference.toLowerCase().includes(search) ||
        m.marque.toLowerCase().includes(search)
    ).filter(m =>
        (aMontureFilters.forme === 'all' || m.forme === aMontureFilters.forme) &&
        (aMontureFilters.couleur === 'all' || m.couleur === aMontureFilters.couleur) &&
        (aMontureFilters.genre === 'all' || m.genre === aMontureFilters.genre) &&
        (aMontureFilters.gamme === 'all' || gammeOf(m) === aMontureFilters.gamme)
    );
    document.getElementById('aMonturesList').innerHTML = filtered.length
        ? filtered.map(m => aMontureCardHtml(m)).join('')
        : '<p class="mobile-empty">Aucune monture trouvée</p>';
    document.querySelectorAll('#aMonturesList [data-monture-id]').forEach(card => {
        card.addEventListener('click', () => aOpenMontureSheet(card.dataset.montureId));
    });
}

function aRenderStock() {
    const counts = { general: 0, local: 0, presentoir: 0, laboratoire: 0 };
    dedupeMovementsByMonture(stockMovements).forEach(m => {
        const s = stockStageOf(m.to_station_name);
        if (s) counts[s] += 1;
    });

    const tiles = [
        { stage: 'general', icon: 'ic-warehouse', color: 'blue', value: counts.general, label: 'Stock Général' },
        { stage: 'local', icon: 'ic-store', color: 'gold', value: counts.local, label: 'Stock Local' },
        { stage: 'presentoir', icon: 'ic-tshirt', color: 'orange', value: counts.presentoir, label: 'Présentoir' },
        { stage: 'laboratoire', icon: 'ic-flask', color: 'red', value: counts.laboratoire, label: 'Laboratoire' }
    ];

    document.getElementById('aStockGrid').innerHTML = tiles.map(t => `
        <button class="mini-tile" type="button" data-a-stock-stage="${t.stage}">
            <div class="mini-icon ${t.color}"><svg class="i"><use href="#${t.icon}"/></svg></div>
            <div class="mini-value">${t.value}</div>
            <div class="mini-label">${t.label}</div>
        </button>
    `).join('');
    // Le clic est géré par délégation sur #aStockGrid (voir DOMContentLoaded),
    // via openMobileStockStage — pas openStockStage : ce dernier pilote
    // #stockDrill, qui vit dans #desktopShell et reste masqué sous 860px.

    const list = document.getElementById('aStockList');
    if (!list) return;
    list.innerHTML = stockSummaryItems.length ? stockSummaryItems.map(item => `
        <button class="mobile-card" type="button" data-stock-reference="${escapeStockHtml(item.reference || '')}">
            <span class="card-icon"><svg class="i"><use href="#ic-warehouse"/></svg></span>
            <span class="card-text"><h4>${escapeStockHtml(item.reference || '—')}</h4><p>${escapeStockHtml(item.brand || '—')} · ${item.qty_total || 0} monture(s)</p><span class="card-badges"><span class="poste-badge">Gén. ${item.qty_general || 0}</span><span class="poste-badge">Loc. ${item.qty_local || 0}</span><span class="poste-badge">Prés. ${item.qty_presentoir || 0}</span><span class="poste-badge">Lab. ${item.qty_laboratoire || 0}</span></span></span>
            <span class="card-chevron"><svg class="i"><use href="#ic-arrow-right"/></svg></span>
        </button>
    `).join('') : '<p class="mobile-empty">Aucun article en stock.</p>';

    list.querySelectorAll('[data-stock-reference]').forEach(card => card.addEventListener('click', () => {
        const item = stockSummaryItems.find(entry => String(entry.reference || '') === card.dataset.stockReference);
        if (!item) return;
        aOpenSheet(item.reference || 'Stock', `<div class="detail-grid"><div class="detail-item"><div class="detail-label">Marque</div><div class="detail-value">${escapeStockHtml(item.brand || '—')}</div></div><div class="detail-item"><div class="detail-label">Total</div><div class="detail-value">${item.qty_total || 0}</div></div><div class="detail-item"><div class="detail-label">Stock Général</div><div class="detail-value">${item.qty_general || 0}</div></div><div class="detail-item"><div class="detail-label">Stock local</div><div class="detail-value">${item.qty_local || 0}</div></div><div class="detail-item"><div class="detail-label">Présentoir</div><div class="detail-value">${item.qty_presentoir || 0}</div></div><div class="detail-item"><div class="detail-label">Laboratoire</div><div class="detail-value">${item.qty_laboratoire || 0}</div></div><div class="detail-item"><div class="detail-label">Statut</div><div class="detail-value">${item.is_critical ? 'Critique' : 'Normal'}</div></div></div>`);
    }));
}

function aRenderPlus() {
    const items = [
        { icon: 'ic-history', title: 'Historique des mouvements', desc: 'Traçabilité complète des montures par étape.', href: 'historique.html?from=admin' },
        { icon: 'ic-sliders', title: 'Paramètres', desc: "Configuration de l'application.", sheetTitle: 'Paramètres' },
        { icon: 'ic-tag', title: 'Session d’enregistrement', desc: 'Créer une session de réception à scanner.', action: 'receptionSession' },
        { icon: 'ic-file-alt', title: 'Rapports', desc: 'Statistiques et analyses avancées.', sheetTitle: 'Rapports' }
    ];
    document.getElementById('aPlusList').innerHTML = items.map((it, i) => `
        <button class="mobile-card" type="button" data-plus-index="${i}">
            <span class="card-icon"><svg class="i"><use href="#${it.icon}"/></svg></span>
            <span class="card-text"><h4>${it.title}</h4><p>${it.desc}</p></span>
            <span class="card-chevron"><svg class="i"><use href="#ic-arrow-right"/></svg></span>
        </button>
    `).join('');
    document.querySelectorAll('#aPlusList [data-plus-index]').forEach(card => {
        card.addEventListener('click', () => {
            const it = items[Number(card.dataset.plusIndex)];

            if (!it) return;
            if (it.action === 'receptionSession') {
                openReceptionSessionModal();
                return;
            }

            if (it.href) { window.location.href = it.href; return; }

            aOpenSheet(it.sheetTitle, `
                <div class="detail-empty" style="margin-top:0;">
                    <div class="empty-icon"><svg class="i"><use href="#${it.icon}"/></svg></div>
                    <h4>Module en développement</h4>
                    <p>${it.desc}</p>
                </div>
            `);
        });
    });
}

function aOpenEmployeeSheet(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    aOpenSheet(emp.fullName, buildEmployeeDetailBody(emp) + `<div class="sheet-actions"><button class="btn btn-outline" type="button" data-a-edit-employee="${emp.id}">Modifier</button><button class="btn btn-danger" type="button" data-a-delete-employee="${emp.id}">Supprimer</button></div>`);
    document.querySelector('[data-a-edit-employee]').addEventListener('click', () => { aCloseSheet(); editEmployee(emp.id); });
    document.querySelector('[data-a-delete-employee]').addEventListener('click', async () => { await deleteEmployee(emp.id); aCloseSheet(); });
}
function aOpenMontureSheet(id) {
    const m = montures.find(m => m.id === id);
    if (!m) return;
    aOpenSheet(`${m.marque} — ${m.reference}`, buildMontureDetailBody(m) + `<div class="sheet-actions"><button class="btn btn-danger" type="button" data-a-delete-monture="${m.id}">Supprimer</button></div>`);
    document.querySelector('[data-a-delete-monture]').addEventListener('click', async () => { await deleteMonture(m.id); aCloseSheet(); });
}

function aOpenSheet(title, bodyHtml) {
    document.getElementById('aSheetTitle').textContent = title;
    document.getElementById('aSheetBody').innerHTML = bodyHtml;
    document.getElementById('aSheetBackdrop').classList.add('show');
    document.getElementById('aBottomSheet').classList.add('show');
}
function aCloseSheet() {
    document.getElementById('aSheetBackdrop').classList.remove('show');
    document.getElementById('aBottomSheet').classList.remove('show');
}

const A_TAB_TITLES = { dashboard: 'Administration', employes: 'Employés', montures: 'Montures', stock: 'Gestion Stock', plus: 'Plus' };
function aSwitchTab(tab) {
    document.querySelectorAll('#mobileShell .tab-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tab));
    document.querySelectorAll('#aTabBar .tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    const station = managedStationName();
    document.getElementById('aTopbarTitle').textContent = (A_TAB_TITLES[tab] || A_TAB_TITLES.dashboard) + (station ? ' · ' + station : '');
    document.getElementById('aAddEmployeeBtn').style.visibility = tab === 'employes' ? 'visible' : 'hidden';
    if (tab === 'stock') loadStockSummary();
}

// ============================
// NAVIGATION
// ============================
let currentPage = 'dashboard';

function navigateTo(page) {
    document.querySelectorAll('#pageContent > section').forEach(s => s.style.display = 'none');
    const map = {
        'dashboard': 'dashboardSection',
        'employees': 'employeesSection',
        'montures': 'monturesSection',
        'stock': 'stockSection',
        'settings': 'settingsSection',
        'rapports': 'rapportsSection'
    };
    const id = map[page];
    if (id) document.getElementById(id).style.display = 'block';
    if (page === 'stock') { loadStockSummary(); loadStockMovements(); closeStockDrill(); }
    if (page === 'montures') closeMonturesFormeDetail();

    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    const titles = {
        'dashboard': { icon: 'ic-chart-pie', title: 'Tableau de bord', sub: 'Bienvenue sur votre espace d\'administration Pro' },
        'employees': { icon: 'ic-users', title: 'Gestion des employés', sub: 'Gérez les comptes, rôles, postes et empreintes' },
        'montures': { icon: 'ic-glasses', title: 'Catalogue des montures', sub: 'Gérez votre inventaire de montures' },
        'stock': { icon: 'ic-warehouse', title: 'Gestion du stock', sub: 'Stock général, local et présentoir' },
        'settings': { icon: 'ic-sliders', title: 'Paramètres', sub: 'Configuration de l\'application' },
        'rapports': { icon: 'ic-file-alt', title: 'Rapports', sub: 'Statistiques et analyses avancées' }
    };

    const info = titles[page] || titles['dashboard'];
    document.getElementById('pageTitle').innerHTML = '<svg class="i" style="vertical-align:-3px;margin-right:6px;"><use href="#' + info.icon + '"/></svg>' + info.title;
    const station = managedStationName();
    document.getElementById('pageSubtitle').textContent = info.sub + (station ? ' · ' + station : '');

    currentPage = page;
    updateAddButton(page);
}

// Le bouton "Ajouter" du header ne s'affiche que sur les pages où l'admin peut
// créer une ressource (employés). Il reste masqué sur les pages en lecture
// seule : montures, stock, paramètres, rapports.
function updateAddButton(page) {
    const btn = document.getElementById('addEmployeeBtn');
    if (page === 'montures' || page === 'stock' || page === 'settings' || page === 'rapports') {
        btn.style.display = 'none';
    } else {
        btn.style.display = 'flex';
        btn.innerHTML = '<svg class="i"><use href="#ic-plus-circle"/></svg><span>Ajouter employé</span>';
    }
}

// ============================
// MODALS EMPLOYÉ
// ============================
function openModal(title, data = null) {
    const modal = document.getElementById('employeeModal');
    document.getElementById('modalTitle').innerHTML =
        `<svg class="i" style="color:var(--primary);"><use href="#${data ? 'ic-user-edit' : 'ic-user-plus'}"/></svg> ${title}`;
    modal.classList.add('active');
    resetFingerprintUI();

    if (data) {
        document.getElementById('editId').value = data.id;
        editingDbId = data.dbId ?? null;
        document.getElementById('fullName').value = data.fullName;
        document.getElementById('gender').value = data.gender;
        document.getElementById('phone').value = data.phone;
        document.getElementById('emergencyPhone').value = data.emergencyPhone || '';
        document.getElementById('email').value = data.email || '';
        document.getElementById('role').value = data.role;
        document.getElementById('poste').value = data.stationId ?? '';
        document.getElementById('status').value = data.status;

        if (data.fingerprint) {
            fpState.enrolled = data.fingerprint.enrolled || false;
            fpState.template = data.fingerprint.template || null;
            fpState.date = data.fingerprint.date || null;
            updateFingerprintUI();
        }

        editingId = data.id;
    } else {
        document.getElementById('editId').value = '';
        editingDbId = null;
        document.getElementById('employeeForm').reset();
        const scopedStation = managedStationId();
        if (scopedStation !== null) document.getElementById('poste').value = String(scopedStation);
        editingId = null;
        fpState = { enrolled: false, template: null, date: null, isScanning: false, scanInterval: null,
            scanProgress: 0 };
        updateFingerprintUI();
    }
}

function closeModal() {
    document.getElementById('employeeModal').classList.remove('active');
    resetFingerprintUI();
    if (fpState.scanInterval) { clearInterval(fpState.scanInterval);
        fpState.isScanning = false; }
}

// ============================
// MODAL FICHE DÉTAIL (lecture seule)
// ============================
function openViewModal(title, iconId, bodyHtml) {
    document.getElementById('viewModalTitle').innerHTML =
        `<svg class="i" style="color:var(--primary);"><use href="#${iconId}"/></svg> ${title}`;
    document.getElementById('viewModalBody').innerHTML = bodyHtml;
    document.getElementById('viewModal').classList.add('active');
}

function closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
}

function resetFingerprintUI() {
    document.getElementById('fpStartScan').style.display = 'inline-flex';
    document.getElementById('fpCancelScan').style.display = 'none';
    document.getElementById('fpRemove').style.display = 'none';
    document.getElementById('fpProgress').style.display = 'none';
    document.getElementById('fpIconBig').setAttribute('class', 'i fp-icon-big');
    document.getElementById('fpStatusIcon').className = 'status-icon not-enrolled';
    document.getElementById('fpStatusIcon').innerHTML = '<svg class="i"><use href="#ic-exclamation-circle"/></svg>';
    document.getElementById('fpStatusText').textContent = 'Aucune empreinte enregistrée';
    document.getElementById('fpStatusSub').textContent = "L'employé devra scanner son empreinte";
}

function updateFingerprintUI() {
    const icon = document.getElementById('fpIconBig');
    const statusIcon = document.getElementById('fpStatusIcon');
    const statusText = document.getElementById('fpStatusText');
    const statusSub = document.getElementById('fpStatusSub');
    const startBtn = document.getElementById('fpStartScan');
    const cancelBtn = document.getElementById('fpCancelScan');
    const removeBtn = document.getElementById('fpRemove');

    if (fpState.enrolled) {
        icon.setAttribute('class', 'i fp-icon-big enrolled');
        statusIcon.className = 'status-icon enrolled';
        statusIcon.innerHTML = '<svg class="i"><use href="#ic-check-circle"/></svg>';
        statusText.textContent = 'Empreinte enregistrée';
        statusSub.textContent = `Enregistrée le ${fpState.date || 'date inconnue'}`;
        startBtn.textContent = 'Re-scanner';
        startBtn.style.display = 'inline-flex';
        cancelBtn.style.display = 'none';
        removeBtn.style.display = 'inline-flex';
        document.getElementById('fpProgress').style.display = 'none';
    } else {
        icon.setAttribute('class', 'i fp-icon-big');
        statusIcon.className = 'status-icon not-enrolled';
        statusIcon.innerHTML = '<svg class="i"><use href="#ic-exclamation-circle"/></svg>';
        statusText.textContent = 'Aucune empreinte enregistrée';
        statusSub.textContent = "L'employé devra scanner son empreinte";
        startBtn.textContent = 'Démarrer le scan';
        startBtn.style.display = 'inline-flex';
        cancelBtn.style.display = 'none';
        removeBtn.style.display = 'none';
        document.getElementById('fpProgress').style.display = 'none';
    }
}

// ============================
// FINGERPRINT (WebAuthn réel - lecteur d'empreinte / Windows Hello)
// ============================
function setFingerprintScanningUI(isScanning, message) {
    fpState.isScanning = isScanning;
    const icon = document.getElementById('fpIconBig');
    const startBtn = document.getElementById('fpStartScan');
    const cancelBtn = document.getElementById('fpCancelScan');
    const progress = document.getElementById('fpProgress');
    const progressFill = document.getElementById('fpProgressFill');
    const progressText = document.getElementById('fpProgressText');

    if (isScanning) {
        icon.setAttribute('class', 'i fp-icon-big active');
        startBtn.style.display = 'none';
        cancelBtn.style.display = 'inline-flex';
        progress.style.display = 'block';
        progressFill.style.width = '100%';
        progressText.textContent = message || "Posez le doigt sur le lecteur d'empreinte...";
    } else {
        cancelBtn.style.display = 'none';
        progress.style.display = 'none';
        updateFingerprintUI();
    }
}

async function startFingerprintScan() {
    if (fpState.isScanning) return;
    if (!checkWebAuthnSupport()) return;

    const editId = document.getElementById('editId').value;
    if (editId) {
        if (!editingDbId) {
            alert("Impossible de retrouver cet employé en base de données.");
            return;
        }
        await enrollFingerprintForExistingUser(editingDbId);
    } else {
        await enrollFingerprintForNewUser();
    }
}

async function enrollFingerprintForNewUser() {
    const data = readEmployeeFormData();
    if (!validateEmployeeForm(data)) {
        alert('Veuillez remplir tous les champs obligatoires (*) avant de scanner une empreinte.');
        return;
    }
    const [firstName, ...rest] = data.fullName.split(' ');
    const lastName = rest.join(' ') || firstName;

    setFingerprintScanningUI(true);
    try {
        const challengeResponse = await fetch(`${API_URL}/auth/webauthn/register-challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: data.email, firstName, lastName })
        });
        if (!challengeResponse.ok) {
            const body = await challengeResponse.json().catch(() => ({}));
            throw new Error(body?.message || "Impossible d'obtenir un challenge d'enregistrement");
        }
        const { data: challengeData } = await challengeResponse.json();

        const credential = await createWebAuthnCredential(challengeData.challenge, challengeData.userId, data.email, `${firstName} ${lastName}`);

        const verifyResponse = await fetch(`${API_URL}/auth/webauthn/register-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: data.email, ...credential })
        });
        if (!verifyResponse.ok) {
            const body = await verifyResponse.json().catch(() => ({}));
            throw new Error(body?.message || "Vérification de l'empreinte échouée");
        }

        fpState.enrolled = true;
        fpState.template = credential.id;
        fpState.date = new Date().toLocaleDateString('fr-FR');
        document.getElementById('fpStatusSub').textContent = "Empreinte capturée - sera enregistrée en base à la création de l'employé";
    } catch (error) {
        console.error("Erreur enrôlement empreinte (nouvel employé)", error);
        if (error?.name !== 'AbortError') {
            alert(error.message || "Échec de l'enregistrement de l'empreinte");
        }
    } finally {
        setFingerprintScanningUI(false);
    }
}

async function enrollFingerprintForExistingUser(userId) {
    setFingerprintScanningUI(true);
    try {
        const challengeResponse = await fetch(`${API_URL}/auth/webauthn/enroll-challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        if (!challengeResponse.ok) {
            const body = await challengeResponse.json().catch(() => ({}));
            throw new Error(body?.message || "Impossible d'obtenir un challenge d'enregistrement");
        }
        const { data: challengeData } = await challengeResponse.json();

        const emp = employees.find(e => e.dbId === userId);
        const credential = await createWebAuthnCredential(challengeData.challenge, userId, emp?.email || '', emp?.fullName || '');

        const verifyResponse = await fetch(`${API_URL}/auth/webauthn/enroll-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, ...credential })
        });
        if (!verifyResponse.ok) {
            const body = await verifyResponse.json().catch(() => ({}));
            throw new Error(body?.message || "Vérification de l'empreinte échouée");
        }

        fpState.enrolled = true;
        fpState.template = credential.id;
        fpState.date = new Date().toLocaleDateString('fr-FR');

        if (emp) {
            emp.fingerprint = { enrolled: true, template: credential.id, date: fpState.date };
            updateAll();
        }
        alert('Empreinte enregistrée avec succès en base de données !');
    } catch (error) {
        console.error("Erreur enrôlement empreinte (employé existant)", error);
        if (error?.name !== 'AbortError') {
            alert(error.message || "Échec de l'enregistrement de l'empreinte");
        }
    } finally {
        setFingerprintScanningUI(false);
    }
}

function cancelFingerprintScan() {
    if (fpAbortController) {
        fpAbortController.abort();
        fpAbortController = null;
    }
    setFingerprintScanningUI(false);
}

async function removeFingerprint() {
    if (!(await window.showSliderConfirm('Êtes-vous sûr de vouloir supprimer cette empreinte digitale ?'))) return;
    const editId = document.getElementById('editId').value;

    if (editId && editingDbId) {
        try {
            const response = await fetch(`${API_URL}/auth/webauthn/credentials/${editingDbId}`, { method: 'DELETE' });
            if (!response.ok) {
                alert("Erreur lors de la suppression de l'empreinte");
                return;
            }
        } catch (error) {
            console.error('Erreur réseau suppression empreinte', error);
            alert("Erreur réseau lors de la suppression de l'empreinte");
            return;
        }
        const emp = employees.find(e => e.dbId === editingDbId);
        if (emp) {
            emp.fingerprint = { enrolled: false, template: null, date: null };
            updateAll();
        }
    }

    fpState.enrolled = false;
    fpState.template = null;
    fpState.date = null;
    document.getElementById('fpRemove').style.display = 'none';
    updateFingerprintUI();
    alert('Empreinte supprimée');
}

function openFingerprintModal(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    openModal('Modifier l\'employé - Empreinte', emp);
    setTimeout(() => {
        const fpSection = document.getElementById('fingerprintSection');
        if (fpSection) {
            fpSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            fpSection.style.borderColor = 'var(--primary)';
            fpSection.style.borderWidth = '2px';
            setTimeout(() => {
                fpSection.style.borderColor = 'var(--line)';
                fpSection.style.borderWidth = '1px';
            }, 2000);
        }
    }, 300);
}

// ============================
// SAVE EMPLOYEE
// ============================
function readEmployeeFormData() {
    const scopedStation = managedStationId();
    const stationIdRaw = scopedStation === null ? document.getElementById('poste').value : String(scopedStation);
    return {
        fullName: document.getElementById('fullName').value.trim(),
        gender: document.getElementById('gender').value,
        phone: document.getElementById('phone').value.trim(),
        emergencyPhone: document.getElementById('emergencyPhone').value.trim(),
        email: document.getElementById('email').value.trim(),
        role: document.getElementById('role').value,
        stationId: stationIdRaw ? Number(stationIdRaw) : null,
        poste: stationIdRaw ? stationNameById(stationIdRaw) : '',
        status: document.getElementById('status').value
    };
}

function validateEmployeeForm(data) {
    return !!(data.fullName && data.gender && data.phone && data.email && data.role && data.stationId && data.status);
}

async function saveEmployeeData(silent = false) {
    const data = readEmployeeFormData();

    if (!validateEmployeeForm(data)) {
        if (!silent) alert('Veuillez remplir tous les champs obligatoires (*)');
        return false;
    }

    const editId = document.getElementById('editId').value;
    if (editId) {
        const idx = employees.findIndex(e => e.id === editId);
        if (idx !== -1) {
            const existingFp = employees[idx].fingerprint || { enrolled: false, template: null, date: null };
            employees[idx] = {
                ...employees[idx],
                ...data,
                fingerprint: fpState.enrolled ? {
                    enrolled: true,
                    template: fpState.template || existingFp.template || `FP_${editId}_${Date.now()}`,
                    date: fpState.date || existingFp.date || new Date().toLocaleDateString('fr-FR')
                } : { enrolled: false, template: null, date: null }
            };
        }
    } else {
        const [firstName, ...rest] = data.fullName.split(' ');
        const lastName = rest.join(' ') || firstName;
        const roleId = roleNameToId[data.role] || 2;
        const hasPendingFingerprint = fpState.enrolled && !!fpState.template;
        const endpoint = hasPendingFingerprint ? `${API_URL}/auth/register` : `${API_URL}/auth/users`;
        const payload = {
            first_name: firstName,
            last_name: lastName,
            email: data.email,
            phone: data.phone,
            gender: data.gender,
            role_id: roleId,
            station_id: data.stationId
        };
        if (hasPendingFingerprint) payload.credential_id = fpState.template;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const body = await response.text();
                console.error('Échec création utilisateur', response.status, body);
                if (!silent) alert('Erreur lors de la création de l\'utilisateur');
                return false;
            }
            const json = await response.json();
            const user = json?.data?.user;
            // Pas de mot de passe fourni ici : le backend a généré un jeton d'activation
            // à usage unique (voir /auth/set-password) — à transmettre au nouvel employé,
            // il ne sera plus jamais affiché après cet instant.
            const setupToken = json?.data?.setup_token;
            if (setupToken && !silent) {
                alert(`Compte créé. Jeton d'activation à transmettre à ${data.email} :\n\n${setupToken}\n\n(Il lui servira à définir son mot de passe lors de sa première connexion — ce jeton ne sera plus affiché ensuite.)`);
            }
            const newId = `EMP-${String(nextEmpId++).padStart(3, '0')}`;
            employees.push({
                id: newId,
                dbId: user?.id,
                ...data,
                fingerprint: hasPendingFingerprint ? {
                    enrolled: true,
                    template: fpState.template,
                    date: fpState.date || new Date().toLocaleDateString('fr-FR')
                } : { enrolled: false, template: null, date: null }
            });
            editingDbId = user?.id ?? null;
        } catch (error) {
            console.error('Erreur réseau création utilisateur', error);
            if (!silent) alert('Erreur réseau lors de la création de l\'utilisateur');
            return false;
        }
    }

    updateAll();
    if (!silent) closeModal();
    return true;
}

async function saveEmployee() { await saveEmployeeData(false); }

// ============================
// EMPLOYEE ACTIONS
// ============================
function editEmployee(id) {
    const emp = employees.find(e => e.id === id);
    if (emp) {
        fpState.enrolled = emp.fingerprint?.enrolled || false;
        fpState.template = emp.fingerprint?.template || null;
        fpState.date = emp.fingerprint?.date || null;
        openModal('Modifier l\'employé', emp);
        updateFingerprintUI();
    }
}

function buildEmployeeDetailBody(emp) {
    return `
        <div class="detail-header">
            <div class="detail-avatar" style="background:${getAvatarColor(emp.fullName)};">${getInitials(emp.fullName)}</div>
            <div class="detail-heading">
                <h4>${emp.fullName}</h4>
                <div class="detail-id">${emp.id}</div>
                <div class="detail-badges">
                    <span class="status-badge ${emp.status === 'Actif' ? 'active' : 'inactive'}"><span class="dot"></span>${emp.status}</span>
                    ${renderPosteBadge(emp.poste)}
                    ${renderFingerprintBadge(emp)}
                </div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Contact</div>
            <div class="detail-grid">
                <div class="detail-item"><div class="detail-label">Téléphone</div><div class="detail-value">${emp.phone || '—'}</div></div>
                <div class="detail-item"><div class="detail-label">Téléphone d'urgence</div><div class="detail-value">${emp.emergencyPhone || '—'}</div></div>
                <div class="detail-item full"><div class="detail-label">Email</div><div class="detail-value">${emp.email || '—'}</div></div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Rôle &amp; affectation</div>
            <div class="detail-grid">
                <div class="detail-item"><div class="detail-label">Rôle</div><div class="detail-value">${formatRole(emp.role)}</div></div>
                <div class="detail-item"><div class="detail-label">Poste</div><div class="detail-value">${emp.poste}</div></div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Sécurité biométrique</div>
            <div class="detail-grid">
                <div class="detail-item"><div class="detail-label">Empreinte</div><div class="detail-value">${emp.fingerprint?.enrolled ? 'Enregistrée' : 'Non enregistrée'}</div></div>
                <div class="detail-item"><div class="detail-label">Date d'enregistrement</div><div class="detail-value">${emp.fingerprint?.date || '—'}</div></div>
            </div>
        </div>
    `;
}

function viewEmployee(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    openViewModal('Fiche employé', 'ic-eye', buildEmployeeDetailBody(emp));
}

async function deleteEmployee(id) {
    if (!(await window.showSliderConfirm('Êtes-vous sûr de vouloir supprimer cet employé ?'))) return;
    employees = employees.filter(e => e.id !== id);
    updateAll();
}

// ============================
// MONTURE ACTIONS
// ============================
function buildMontureDetailBody(m) {
    const stockLabel = m.stockLabel || (m.stockGeneral ? 'Stock Général' : m.stockLocal ? 'Stock local' : m.presentoir ? 'Présentoir' : 'À préciser');
    const stockLocation = m.stockLocation || m.emplacement || '—';
    return `
        <div class="detail-header">
            <div class="detail-avatar" style="background:var(--primary);"><svg class="i"><use href="#ic-glasses"/></svg></div>
            <div class="detail-heading">
                <h4>${m.marque} — ${m.reference}</h4>
                <div class="detail-id">${m.id}</div>
                <div class="detail-badges">
                    <span class="poste-badge">${m.genre}</span>
                    <span class="poste-badge">${m.forme}</span>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Caractéristiques</div>
            <div class="detail-grid">
                <div class="detail-item"><div class="detail-label">Couleur</div><div class="detail-value">${m.couleur}</div></div>
                <div class="detail-item"><div class="detail-label">Matière</div><div class="detail-value">${m.matiere}</div></div>
                <div class="detail-item"><div class="detail-label">Prix</div><div class="detail-value">${m.prix.toLocaleString()} FCFA</div></div>
                <div class="detail-item"><div class="detail-label">Emplacement</div><div class="detail-value">${stockLocation}</div></div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Stock actuel</div>
            <div class="detail-grid">
                <div class="detail-item"><div class="detail-label">Zone de stock</div><div class="detail-value">${stockLabel}</div></div>
                <div class="detail-item"><div class="detail-label">Emplacement</div><div class="detail-value">${stockLocation}</div></div>
                <div class="detail-item"><div class="detail-label">Quantité</div><div class="detail-value">${m.quantite || 1}</div></div>
                <div class="detail-item"><div class="detail-label">Seuil d'alerte</div><div class="detail-value">${m.seuil || '—'}</div></div>
            </div>
        </div>
    `;
}

function viewMonture(id) {
    const m = montures.find(m => m.id === id);
    if (!m) return;
    openViewModal('Fiche monture', 'ic-glasses', buildMontureDetailBody(m));
}

async function deleteMonture(id) {
    if (!(await window.showSliderConfirm('Êtes-vous sûr de vouloir supprimer cette monture ?'))) return;
    montures = montures.filter(m => m.id !== id);
    updateAll();
}

// ============================
// THÈME CLAIR / SOMBRE
// ============================
const THEME_KEY = 'lunetterie-theme';

function applyTheme(theme) {
    if (theme) {
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    ['themeIcon', 'aThemeIcon'].forEach(id => {
        const icon = document.getElementById(id);
        const use = icon && icon.querySelector('use');
        if (use) use.setAttribute('href', isDark ? '#ic-moon' : '#ic-sun');
    });
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
}

// ============================
// EVENT LISTENERS
// ============================
document.addEventListener('DOMContentLoaded', async function() {
    applyTheme(localStorage.getItem(THEME_KEY));
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Navigation
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
        item.addEventListener('click', function(e) {
            if (!this.dataset.page) return;
            e.preventDefault();
            navigateTo(this.dataset.page);
        });
    });
    const sidebarLogoutBtn = document.querySelector('.logout-btn');
    if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', logout);

    // Vue mobile
    aRenderStock();
    aRenderPlus();
    aSwitchTab('dashboard');
    document.getElementById('aThemeToggle').addEventListener('click', toggleTheme);
    document.querySelectorAll('#aTabBar .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => aSwitchTab(btn.dataset.tab));
    });
    document.getElementById('aEmployeeSearch').addEventListener('input', aRenderEmployeesList);
    document.getElementById('aMontureSearch').addEventListener('input', aRenderMonturesList);
    document.getElementById('aAddEmployeeBtn').addEventListener('click', function () {
        fpState = { enrolled: false, template: null, date: null, isScanning: false, scanInterval: null, scanProgress: 0 };
        openModal('Ajouter un employé');
        resetFingerprintUI();
    });
    document.getElementById('aSyncStockBtn').addEventListener('click', loadStockSummary);
    document.getElementById('aCreateReceptionSessionBtn').addEventListener('click', openReceptionSessionModal);
    document.getElementById('aSheetClose').addEventListener('click', aCloseSheet);
    document.getElementById('aSheetBackdrop').addEventListener('click', aCloseSheet);

    // Bouton "Ajouter" : ouvre le formulaire de création d'un employé (seule action disponible ici)
    document.getElementById('addEmployeeBtn').addEventListener('click', function() {
        fpState = { enrolled: false, template: null, date: null, isScanning: false, scanInterval: null,
            scanProgress: 0 };
        openModal('Ajouter un employé');
        resetFingerprintUI();
    });
    // Close modals
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelModal').addEventListener('click', closeModal);
    document.getElementById('employeeModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    // Close view modal
    document.getElementById('closeViewModal').addEventListener('click', closeViewModal);
    document.getElementById('closeViewModalFooter').addEventListener('click', closeViewModal);
    document.getElementById('viewModal').addEventListener('click', function(e) {
        if (e.target === this) closeViewModal();
    });

    document.getElementById('closeSessionGlasses').addEventListener('click', closeSessionGlasses);
    document.getElementById('closeSessionGlassesFooter').addEventListener('click', closeSessionGlasses);
    document.getElementById('sessionGlassesModal').addEventListener('click', function (e) {
        if (e.target === this) closeSessionGlasses();
    });

    // Save
    document.getElementById('saveEmployee').addEventListener('click', saveEmployee);

    // Filters
    document.getElementById('filterRole').addEventListener('change', renderEmployees);
    document.getElementById('filterPoste').addEventListener('change', renderEmployees);
    document.getElementById('filterStatus').addEventListener('change', renderEmployees);
    document.getElementById('filterFingerprint').addEventListener('change', renderEmployees);
    document.getElementById('employeeSearch').addEventListener('input', renderEmployees);

    document.getElementById('montureSearch').addEventListener('input', renderMontures);
    document.getElementById('monturesFormeBack').addEventListener('click', closeMonturesFormeDetail);

    document.getElementById('createReceptionSessionBtn').addEventListener('click', openReceptionSessionModal);
    document.getElementById('aCreateReceptionSessionBtn')?.addEventListener('click', openReceptionSessionModal);
    document.getElementById('closeReceptionSessionModal').addEventListener('click', closeReceptionSessionModal);
    document.getElementById('cancelReceptionSession').addEventListener('click', closeReceptionSessionModal);
    document.getElementById('saveReceptionSession').addEventListener('click', createReceptionSession);
    document.getElementById('printReceptionSession').addEventListener('click', printReceptionSession);
    document.getElementById('receptionSessionModal').addEventListener('click', function(event) {
        if (event.target === this) closeReceptionSessionModal();
    });
    // Empêche physiquement de dépasser le reste disponible pendant la saisie
    // (le max HTML seul ne bloque pas la frappe manuelle d'un nombre plus grand).
    document.getElementById('sessionMountCount').addEventListener('input', function () {
        const max = Number(this.max);
        if (max && Number(this.value) > max) this.value = String(max);
    });

    document.querySelectorAll('[data-stock-stage]').forEach(btn => btn.addEventListener('click', () => openStockStage(btn.dataset.stockStage)));
    document.getElementById('stockDrillBack').addEventListener('click', handleStockDrillBack);
    document.querySelectorAll('[data-stock-sort]').forEach(btn => btn.addEventListener('click', () => { stockDrillSort = btn.dataset.stockSort; renderStockDrill(); }));
    document.querySelectorAll('[data-stock-direction]').forEach(btn => btn.addEventListener('click', () => { stockDrillDirection = btn.dataset.stockDirection; renderStockDrill(); }));
    document.querySelectorAll('[data-stock-view]').forEach(btn => btn.addEventListener('click', () => { stockDrillView = btn.dataset.stockView; renderStockDrill(); }));
    document.querySelectorAll('[data-stock-chart-by]').forEach(btn => btn.addEventListener('click', () => { stockDrillChartBy = btn.dataset.stockChartBy; renderStockDrill(); }));

    document.getElementById('refreshActiveSessionBtn').addEventListener('click', refreshActiveReceptionSessions);
    refreshActiveReceptionSessions();

    // Blocs de la version mobile (onglet Stock) : sur PC ces cartes ouvrent le
    // détail par ville/mouvements (openStockStage) ; sur mobile ce panneau vit
    // dans #desktopShell, masqué en dessous de 860px, donc on rejoue la même
    // navigation dans la fenêtre générique #viewModal (visible sur les deux vues).
    document.getElementById('aStockGrid').addEventListener('click', function (e) {
        const tile = e.target.closest('[data-a-stock-stage]');
        if (tile) openMobileStockStage(tile.dataset.aStockStage);
    });
    document.getElementById('aStatCarousel').addEventListener('click', function (e) {
        const tile = e.target.closest('[data-a-dash-action]');
        if (tile && tile.dataset.aDashAction === 'presentoir') openDashPresentoir();
    });
    document.getElementById('employeeStationBack').addEventListener('click', function() {
        employeeStationScope = null;
        employeeStationLevel = 'groups';
        document.getElementById('employeesDetail').style.display = 'none';
        document.getElementById('employeeStationGrid').style.display = 'grid';
        renderEmployeeStationBlocks();
    });

    document.getElementById('viewAllEmployees').addEventListener('click', function() { navigateTo('employees'); });
    document.getElementById('dashPresentoirCard').addEventListener('click', openDashPresentoir);

    // Photo upload
    document.getElementById('photoUpload').addEventListener('click', function(e) {
        if (e.target.closest('input[type="file"]')) return;
        this.querySelector('input[type="file"]').click();
    });
    document.getElementById('photoUpload').querySelector('input[type="file"]').addEventListener('change',
        function(e) {
            if (this.files && this.files[0]) {
                const parent = this.closest('.photo-upload');
                const icon = parent.querySelector('svg.i');
                const p = parent.querySelector('p');
                icon.querySelector('use').setAttribute('href', '#ic-check-circle');
                icon.style.color = 'var(--success)';
                p.textContent = this.files[0].name;
                p.style.color = 'var(--success)';
                const newInput = document.createElement('input');
                newInput.type = 'file';
                newInput.accept = 'image/*';
                parent.appendChild(newInput);
                newInput.addEventListener('change', arguments.callee);
            }
        });

    // Fingerprint
    document.getElementById('fpStartScan').addEventListener('click', startFingerprintScan);
    document.getElementById('fpCancelScan').addEventListener('click', cancelFingerprintScan);
    document.getElementById('fpRemove').addEventListener('click', removeFingerprint);

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            if (document.getElementById('employeeModal').classList.contains('active')) saveEmployee();
        }
        if (e.key === 'Escape') { closeModal(); closeViewModal(); }
        if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            document.querySelector('.topbar .search-box input').focus();
        }
    });

    // Init
    await loadStations();
    await loadUsers();
    await loadMonturesFromServer();
    await Promise.all([loadStockMovements(), loadSoldGlasses(), loadStockSummary()]);
    // Bind stock sync button
    const syncBtn = document.getElementById('syncStockBtn');
    if (syncBtn) syncBtn.addEventListener('click', loadStockSummary);
    updateAll();
    const activeMobileTab = document.querySelector('#aTabBar .tab-btn.active')?.dataset.tab || 'dashboard';
    aSwitchTab(activeMobileTab);
    navigateTo('dashboard');

    // Le dashboard (CA / enregistrements / envois / activité du jour) se
    // rafraîchit automatiquement toutes les 6h, sans intervention manuelle.
    setInterval(async function () {
        await Promise.all([loadStockMovements(), loadSoldGlasses()]);
        renderDashboardStats();
        renderDashboardNotifications();
    }, 6 * 60 * 60 * 1000);

    console.log('🕶️ Lunetterie - Prêt !');
    console.log(`👥 ${employees.length} employés chargés`);
    console.log(`🕶️ ${montures.length} montures en catalogue`);
    console.log(`👆 ${employees.filter(e => e.fingerprint?.enrolled).length} empreintes enregistrées`);
});

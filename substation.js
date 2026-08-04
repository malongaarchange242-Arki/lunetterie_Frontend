const DEFAULT_INVENTORY = [
    { id: 'MNT-001', reference: 'RAY-BAN-RB2180-001', marque: 'Ray-Ban', genre: 'Homme', forme: 'Aviateur', couleur: 'Noir', matiere: 'Métal', prix: 45000, quantite: 8, emplacement: 'Rack A-1', stockGeneral: 8, stockLocal: 2 },
    { id: 'MNT-002', reference: 'OAKLEY-GA2025-001', marque: 'Oakley', genre: 'Homme', forme: 'Sport', couleur: 'Bleu', matiere: 'Plastique', prix: 38000, quantite: 6, emplacement: 'Rack B-2', stockGeneral: 6, stockLocal: 1 },
    { id: 'MNT-003', reference: 'GUCCI-GG001-2026', marque: 'Gucci', genre: 'Femme', forme: 'Papillon', couleur: 'Doré', matiere: 'Acétate', prix: 125000, quantite: 4, emplacement: 'Rack A-3', stockGeneral: 4, stockLocal: 2 },
    { id: 'MNT-004', reference: 'PRADA-PR2024-001', marque: 'Prada', genre: 'Femme', forme: 'Oeil de chat', couleur: 'Noir', matiere: 'Acétate', prix: 98000, quantite: 3, emplacement: 'Rack C-1', stockGeneral: 3, stockLocal: 0 },
    { id: 'MNT-005', reference: 'DIOR-DIOR2025-001', marque: 'Dior', genre: 'Femme', forme: 'Rond', couleur: 'Gris', matiere: 'Titane', prix: 150000, quantite: 2, emplacement: 'Rack C-2', stockGeneral: 2, stockLocal: 1 },
    { id: 'MNT-006', reference: 'VERSACE-VE2026-001', marque: 'Versace', genre: 'Unisexe', forme: 'Rectangulaire', couleur: 'Argenté', matiere: 'Métal', prix: 89000, quantite: 5, emplacement: 'Rack B-1', stockGeneral: 5, stockLocal: 1 }
];

const input = document.getElementById('barcodeInput');
const scanState = document.getElementById('scanState');
const historyList = document.getElementById('historyList');
const modal = document.getElementById('frameModal');
const modalContent = document.getElementById('modalContent');
const modalCode = document.getElementById('modalCode');
const inventoryStatus = document.getElementById('inventoryStatus');
let inventory = [];
let scanHistory = [];
let scanTimer;

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
}
// Vignette d'une ligne de liste : photo de la monture si le champ est présent
// sur l'objet, sinon une icône générique (même pattern que presentoir.js).
function historyAvatarHtml(imageUrl) {
    return '<div class="history-avatar">' + (imageUrl
        ? '<img src="' + escapeHtml(imageUrl) + '" alt="" loading="lazy" />'
        : '<svg class="i"><use href="#ic-glasses"/></svg>') + '</div>';
}
function normalized(value) { return String(value || '').trim().toUpperCase(); }
function formatPrice(value) { return value == null || value === '' ? '—' : Number(value).toLocaleString('fr-FR') + ' FCFA'; }
function getGamme(prix) {
    const value = Number(prix);
    if (!prix || Number.isNaN(value)) return '—';
    if (value < 70000) return 'Économique';
    if (value < 90000) return 'Standard';
    if (value < 150000) return 'Premium';
    return 'Luxe';
}
function setState(state, message) { scanState.innerHTML = '<span class="dot-indicator ' + state + '"></span>' + escapeHtml(message); }

function readLocalInventory() {
    try {
        const saved = JSON.parse(localStorage.getItem('monturesEnregistrees') || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}
function refreshInventory() {
    const byCode = new Map();
    DEFAULT_INVENTORY.concat(readLocalInventory()).forEach(function (frame) {
        const key = normalized(frame.code || frame.barcode || frame.reference || frame.id);
        if (key) byCode.set(key, frame);
    });
    inventory = Array.from(byCode.values());
    inventoryStatus.textContent = inventory.length + ' monture' + (inventory.length > 1 ? 's' : '') + ' disponible' + (inventory.length > 1 ? 's' : '') + ' dans la base locale.';
    setState('on', 'Base de données actualisée');
    updateStockBadge();
}

// ============================
// LUNETTES REÇUES & ENVOI VERS LE PRÉSENTOIR
// (les lunettes arrivent ici via "Envoyer les lunettes" depuis le Stock
// Général — scan.html — à destination de "Station Pointe-Noire")
// ============================
const SEND_LOG_KEY = 'lunetterie_envois';
const SUBSTATION_NAME = 'Station Pointe-Noire';
const FORWARD_DEST = 'Présentoir';
const FORWARDED_KEY = 'substation_forwarded_ids';

function loadSendLog() {
    try {
        const saved = JSON.parse(localStorage.getItem(SEND_LOG_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) { return []; }
}
function saveSendLog(log) { localStorage.setItem(SEND_LOG_KEY, JSON.stringify(log)); }

function loadForwardedIds() {
    try {
        const saved = JSON.parse(localStorage.getItem(FORWARDED_KEY) || '[]');
        return new Set(Array.isArray(saved) ? saved : []);
    } catch (error) { return new Set(); }
}
function saveForwardedIds(idSet) { localStorage.setItem(FORWARDED_KEY, JSON.stringify(Array.from(idSet))); }

function getReceivedStock() {
    const forwarded = loadForwardedIds();
    const byId = new Map();
    loadSendLog().forEach(function (entry) {
        if (entry.station !== SUBSTATION_NAME || !Array.isArray(entry.items)) return;
        entry.items.forEach(function (item) { if (item && item.id) byId.set(item.id, item); });
    });
    return Array.from(byId.values()).filter(function (item) { return !forwarded.has(item.id); });
}

function updateStockBadge() {
    const count = String(getReceivedStock().length);
    const badge = document.getElementById('stockCountBadge');
    if (badge) badge.textContent = count;
    const mBadge = document.getElementById('mStockCountBadge');
    if (mBadge) mBadge.textContent = count;
}

const sendModal = document.getElementById('sendModal');
const sendModalSub = document.getElementById('sendModalSub');
const stockTableBody = document.getElementById('stockTableBody');
const stockEmptyState = document.getElementById('stockEmptyState');
const selectAllStock = document.getElementById('selectAllStock');
const selectedCountEl = document.getElementById('selectedCount');
const confirmSendBtn = document.getElementById('confirmSendBtn');
const sendCountLabel = document.getElementById('sendCountLabel');

function renderStockTable() {
    const stock = getReceivedStock();
    sendModalSub.textContent = stock.length + ' monture' + (stock.length > 1 ? 's' : '') + ' reçue' + (stock.length > 1 ? 's' : '');

    if (!stock.length) {
        stockTableBody.innerHTML = '';
        stockEmptyState.style.display = 'flex';
        selectAllStock.checked = false;
        selectAllStock.disabled = true;
    } else {
        stockEmptyState.style.display = 'none';
        selectAllStock.disabled = false;
        stockTableBody.innerHTML = stock.map(function (item) {
            return '<tr>' +
                '<td><input type="checkbox" class="stock-row-check" data-id="' + escapeHtml(item.id) + '" /></td>' +
                '<td><strong>' + escapeHtml(item.marque || '—') + '</strong></td>' +
                '<td>' + escapeHtml(item.reference || '—') + '</td>' +
                '<td>' + escapeHtml([item.genre, item.forme, item.couleur].filter(Boolean).join(' · ')) + '</td>' +
                '<td>' + escapeHtml(getGamme(item.prix)) + '</td>' +
                '</tr>';
        }).join('');
    }
    updateSendSummary();
}

function getSelectedStockIds() {
    return Array.from(stockTableBody.querySelectorAll('.stock-row-check:checked')).map(function (cb) { return cb.dataset.id; });
}

function updateSendSummary() {
    const selected = getSelectedStockIds();
    selectedCountEl.textContent = selected.length + ' sélectionnée' + (selected.length > 1 ? 's' : '');
    sendCountLabel.textContent = selected.length ? '(' + selected.length + ')' : '';
    confirmSendBtn.disabled = selected.length === 0;

    const allChecks = stockTableBody.querySelectorAll('.stock-row-check');
    selectAllStock.checked = allChecks.length > 0 && selected.length === allChecks.length;
}

function selectStockBatch(kind) {
    const checks = Array.from(stockTableBody.querySelectorAll('.stock-row-check'));
    if (kind === 'all') {
        checks.forEach(function (cb) { cb.checked = true; });
    } else if (kind === 'none') {
        checks.forEach(function (cb) { cb.checked = false; });
    } else {
        const n = parseInt(kind, 10);
        checks.forEach(function (cb, i) { cb.checked = i < n; });
    }
    updateSendSummary();
}

function openSendModal() {
    renderStockTable();
    sendModal.classList.add('show');
}
function closeSendModal() { sendModal.classList.remove('show'); }

function confirmSendGlasses() {
    const ids = getSelectedStockIds();
    if (!ids.length) return;

    const stock = getReceivedStock();
    const sentItems = stock.filter(function (item) { return ids.includes(item.id); });

    const forwarded = loadForwardedIds();
    ids.forEach(function (id) { forwarded.add(id); });
    saveForwardedIds(forwarded);

    const log = loadSendLog();
    log.push({ station: FORWARD_DEST, items: sentItems, date: new Date().toISOString() });
    saveSendLog(log);

    updateStockBadge();
    alert(sentItems.length + (sentItems.length > 1 ? ' montures envoyées' : ' monture envoyée') + ' vers ' + FORWARD_DEST + '.');
    renderStockTable();
}
function findFrame(code) {
    const searched = normalized(code);
    return inventory.find(function (frame) {
        return [frame.code, frame.barcode, frame.reference, frame.id].some(function (value) { return normalized(value) === searched; });
    });
}
function searchBarcode() {
    const code = normalized(input.value);
    if (!code) { input.focus(); return; }
    const frame = findFrame(code);
    if (frame) {
        setState('on', 'Monture trouvée · ouverture de la fiche');
        addToHistory(frame, code);
        openFrameModal(frame, code);
    } else {
        setState('off', 'Aucune monture trouvée pour ce code');
        openNotFoundModal(code);
    }
}
function addToHistory(frame, code) {
    scanHistory = scanHistory.filter(function (item) { return item.code !== code; });
    scanHistory.unshift({ frame: frame, code: code, time: new Date() });
    scanHistory = scanHistory.slice(0, 8);
    historyList.innerHTML = scanHistory.map(function (item) {
        const label = (item.frame.marque || 'Monture') + ' ' + (item.frame.reference || item.frame.id || '');
        const time = item.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return '<button class="history-item" type="button" data-code="' + escapeHtml(item.code) + '">' +
            historyAvatarHtml(item.frame.photo_monture_url) +
            '<span><span class="history-code">' + escapeHtml(item.code) + '</span><span class="history-name">' + escapeHtml(label) + '</span></span><span class="history-time">' + time + '</span></button>';
    }).join('');
    historyList.querySelectorAll('[data-code]').forEach(function (button) {
        button.addEventListener('click', function () { input.value = button.dataset.code; searchBarcode(); });
    });
}
function openFrameModal(frame, scannedCode) {
    const title = ((frame.marque || 'Monture') + ' ' + (frame.reference || frame.id || '')).trim();
    document.getElementById('modalTitle').textContent = title;
    modalCode.textContent = 'CODE SCANNÉ · ' + scannedCode;
    const stock = frame.stockGeneral == null ? (frame.quantite || 0) : frame.stockGeneral;
    const fields = [
        ['Identifiant', frame.id], ['Référence', frame.reference], ['Marque', frame.marque], ['Genre', frame.genre],
        ['Forme', frame.forme], ['Couleur', frame.couleur], ['Matière', frame.matiere], ['Taille', frame.taille],
        ['Prix', formatPrice(frame.prix)], ['Stock total', stock + ' unité' + (Number(stock) > 1 ? 's' : '')],
        ['Stock local', frame.stockLocal == null ? '—' : frame.stockLocal], ['Emplacement', frame.emplacement]
    ].filter(function (field) { return field[1] !== undefined && field[1] !== null && field[1] !== ''; });
    const details = fields.map(function (field) {
        return '<div class="detail"><label>' + escapeHtml(field[0]) + '</label><span>' + escapeHtml(String(field[1])) + '</span></div>';
    }).join('');
    const state = stock > 0 ? 'Disponible en stock' : 'Stock à vérifier';
    const message = stock > 0 ? 'La monture est disponible dans l’inventaire.' : 'Aucune unité déclarée en stock.';
    modalContent.innerHTML = '<div class="modal-summary"><span class="status-dot"></span><div><strong>' + state + '</strong><span>' + message + '</span></div></div><div class="frame-details">' + details + '</div><div class="barcode-box"><svg id="modalBarcode"></svg></div>';
    modal.classList.add('show');
    if (window.JsBarcode) JsBarcode('#modalBarcode', scannedCode, { format: 'CODE128', width: 2, height: 70, displayValue: true, margin: 0 });
    document.getElementById('closeModal').focus();
}
function openNotFoundModal(code) {
    document.getElementById('modalTitle').textContent = 'Monture introuvable';
    modalCode.textContent = 'CODE SCANNÉ · ' + code;
    modalContent.innerHTML = '<div class="scan-well not-found"><div class="scan-emblem"><svg class="i"><use href="#ic-close"/></svg></div><h2>Code non enregistré</h2><p>Aucune monture ne correspond à ce code dans la base locale. Actualisez l’inventaire si une monture vient d’être ajoutée.</p></div>';
    modal.classList.add('show');
    document.getElementById('closeModal').focus();
}
function closeModal() { modal.classList.remove('show'); input.value = ''; input.focus(); setState('on', 'En attente d’un code'); }
function clearScan() { input.value = ''; input.focus(); setState('on', 'En attente d’un code'); }

input.addEventListener('input', function () {
    clearTimeout(scanTimer);
    if (!normalized(input.value)) return;
    setState('on', 'Lecture du code…');
    scanTimer = setTimeout(searchBarcode, 350);
});
input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); clearTimeout(scanTimer); searchBarcode(); }
});
document.getElementById('searchBtn').addEventListener('click', searchBarcode);
document.getElementById('clearBtn').addEventListener('click', clearScan);
document.getElementById('refreshInventory').addEventListener('click', refreshInventory);
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (modal.classList.contains('show')) closeModal();
    if (sendModal.classList.contains('show')) closeSendModal();
});
window.addEventListener('storage', function (event) {
    if (event.key === 'monturesEnregistrees') refreshInventory();
    if (event.key === SEND_LOG_KEY || event.key === FORWARDED_KEY) updateStockBadge();
});

document.getElementById('sendGlassesBtn').addEventListener('click', openSendModal);
document.getElementById('mSendGlassesBtn').addEventListener('click', openSendModal);
document.getElementById('mRefreshBtn').addEventListener('click', refreshInventory);
document.getElementById('closeSendModal').addEventListener('click', closeSendModal);
document.getElementById('cancelSendBtn').addEventListener('click', closeSendModal);
sendModal.addEventListener('click', function (event) { if (event.target === sendModal) closeSendModal(); });
document.querySelectorAll('.batch-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { selectStockBatch(btn.dataset.batch); });
});
stockTableBody.addEventListener('change', function (event) {
    if (event.target.classList.contains('stock-row-check')) updateSendSummary();
});
selectAllStock.addEventListener('change', function () { selectStockBatch(selectAllStock.checked ? 'all' : 'none'); });
confirmSendBtn.addEventListener('click', confirmSendGlasses);

// Même bascule clair / sombre que la page d'enregistrement (desktop + mobile).
const root = document.documentElement;
const themeIcon = document.getElementById('themeIcon');
const mThemeIcon = document.getElementById('mThemeIcon');
function toggleTheme() {
    const isDark = root.getAttribute('data-theme') === 'dark'
        || (!root.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', isDark ? 'light' : 'dark');
    const iconMarkup = '<use href="#ic-' + (isDark ? 'moon' : 'sun') + '"/>';
    themeIcon.innerHTML = iconMarkup;
    if (mThemeIcon) mThemeIcon.innerHTML = iconMarkup;
}
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
const mThemeToggle = document.getElementById('mThemeToggle');
if (mThemeToggle) mThemeToggle.addEventListener('click', toggleTheme);

refreshInventory();
input.focus();

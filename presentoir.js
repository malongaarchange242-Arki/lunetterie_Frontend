const DEFAULT_INVENTORY = [
    { id: 'MNT-001', reference: 'RAY-BAN-RB2180-001', marque: 'Ray-Ban', genre: 'Homme', forme: 'Aviateur', couleur: 'Noir', matiere: 'Métal', prix: 45000, quantite: 8, emplacement: 'RAYON-A-ETA-01-BAC-A-POS-01', stockGeneral: 8, stockLocal: 2, presentoir: 1 },
    { id: 'MNT-002', reference: 'OAKLEY-GA2025-001', marque: 'Oakley', genre: 'Homme', forme: 'Sport', couleur: 'Bleu', matiere: 'Plastique', prix: 38000, quantite: 6, emplacement: 'RAYON-A-ETA-01-BAC-B-POS-02', stockGeneral: 6, stockLocal: 1, presentoir: 0 },
    { id: 'MNT-003', reference: 'GUCCI-GG001-2026', marque: 'Gucci', genre: 'Femme', forme: 'Papillon', couleur: 'Doré', matiere: 'Acétate', prix: 125000, quantite: 4, emplacement: 'RAYON-A-ETA-01-BAC-C-POS-03', stockGeneral: 4, stockLocal: 2, presentoir: 1 },
    { id: 'MNT-004', reference: 'PRADA-PR2024-001', marque: 'Prada', genre: 'Femme', forme: 'Oeil de chat', couleur: 'Noir', matiere: 'Acétate', prix: 98000, quantite: 3, emplacement: 'RAYON-A-ETA-01-BAC-D-POS-04', stockGeneral: 3, stockLocal: 0, presentoir: 1 },
    { id: 'MNT-005', reference: 'DIOR-DIOR2025-001', marque: 'Dior', genre: 'Femme', forme: 'Rond', couleur: 'Gris', matiere: 'Titane', prix: 150000, quantite: 2, emplacement: 'RAYON-A-ETA-01-BAC-E-POS-05', stockGeneral: 2, stockLocal: 1, presentoir: 0 },
    { id: 'MNT-006', reference: 'VERSACE-VE2026-001', marque: 'Versace', genre: 'Unisexe', forme: 'Rectangulaire', couleur: 'Argenté', matiere: 'Métal', prix: 89000, quantite: 5, emplacement: 'RAYON-A-ETA-01-BAC-F-POS-06', stockGeneral: 5, stockLocal: 1, presentoir: 1 }
];

const PRESENTOIR_KEY = 'presentoirAjustements';

const input = document.getElementById('barcodeInput');
const scanState = document.getElementById('scanState');
const displayList = document.getElementById('displayList');
const movementList = document.getElementById('movementList');
const modal = document.getElementById('frameModal');
const modalContent = document.getElementById('modalContent');
const modalCode = document.getElementById('modalCode');
const inventoryStatus = document.getElementById('inventoryStatus');
const statTotalQty = document.getElementById('statTotalQty');
const statRefCount = document.getElementById('statRefCount');

let inventory = [];
let overrides = {};
let movements = [];
let scanTimer;
let currentModalFrame = null;
let currentModalCode = '';

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
}
function normalized(value) { return String(value || '').trim().toUpperCase(); }
function formatPrice(value) { return value == null || value === '' ? '—' : Number(value).toLocaleString('fr-FR') + ' FCFA'; }
function setState(state, message) { scanState.innerHTML = '<span class="dot-indicator ' + state + '"></span>' + escapeHtml(message); }
function frameKey(frame) { return normalized(frame.code || frame.barcode || frame.reference || frame.id); }
function frameLabel(frame) { return ((frame.marque || 'Monture') + ' ' + (frame.reference || frame.id || '')).trim(); }

function parseEmplacement(code) {
    const match = /^RAYON-([A-Z])-ETA-(\d+)-BAC-([A-Z])-POS-(\d+)$/i.exec(String(code || '').trim());
    if (!match) return null;
    return { rayon: match[1].toUpperCase(), etagere: Number(match[2]), bac: match[3].toUpperCase(), position: Number(match[4]) };
}
function renderLocationBlock(frame) {
    const code = frame.emplacement;
    if (!code) return '';
    const parsed = parseEmplacement(code);
    if (!parsed) {
        return '<div class="detail" style="margin-top:20px;"><label>Emplacement</label><span>' + escapeHtml(code) + '</span></div>';
    }
    return '<div class="location-block">' +
        '<label class="location-label">Emplacement</label>' +
        '<div class="code-box"><span class="code-text">' + escapeHtml(code) + '</span></div>' +
        '<div class="path-display">' +
        '<span class="seg hi">Rayon ' + escapeHtml(parsed.rayon) + '</span><span class="arrow">→</span>' +
        '<span class="seg">Étagère ' + parsed.etagere + '</span><span class="arrow">→</span>' +
        '<span class="seg">Bac ' + escapeHtml(parsed.bac) + '</span><span class="arrow">→</span>' +
        '<span class="seg">Position ' + parsed.position + '</span>' +
        '</div>' +
        '</div>';
}

function readLocalInventory() {
    try {
        const saved = JSON.parse(localStorage.getItem('monturesEnregistrees') || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}
function readOverrides() {
    try {
        const saved = JSON.parse(localStorage.getItem(PRESENTOIR_KEY) || '{}');
        return saved && typeof saved === 'object' ? saved : {};
    } catch (error) {
        return {};
    }
}
function saveOverrides() { localStorage.setItem(PRESENTOIR_KEY, JSON.stringify(overrides)); }

function currentQty(frame) {
    const key = frameKey(frame);
    return overrides.hasOwnProperty(key) ? overrides[key] : Number(frame.presentoir || 0);
}
function setQty(frame, qty) {
    overrides[frameKey(frame)] = Math.max(0, qty);
    saveOverrides();
}

function refreshInventory() {
    const byCode = new Map();
    DEFAULT_INVENTORY.concat(readLocalInventory()).forEach(function (frame) {
        const key = frameKey(frame);
        if (key) byCode.set(key, frame);
    });
    inventory = Array.from(byCode.values());
    overrides = readOverrides();
    inventoryStatus.textContent = inventory.length + ' monture' + (inventory.length > 1 ? 's' : '') + ' disponible' + (inventory.length > 1 ? 's' : '') + ' dans la base locale.';
    setState('on', 'Base de données actualisée');
    renderDisplayList();
    renderStats();
}

function renderStats() {
    const onDisplay = inventory.filter(function (frame) { return currentQty(frame) > 0; });
    const totalQty = onDisplay.reduce(function (sum, frame) { return sum + currentQty(frame); }, 0);
    statRefCount.textContent = onDisplay.length;
    statTotalQty.textContent = totalQty;
}

function renderDisplayList() {
    const onDisplay = inventory.filter(function (frame) { return currentQty(frame) > 0; });
    if (!onDisplay.length) {
        displayList.innerHTML = '<p class="empty-history">Aucune monture sur le présentoir.</p>';
        return;
    }
    displayList.innerHTML = onDisplay.map(function (frame) {
        const code = frameKey(frame);
        return '<button class="history-item" type="button" data-code="' + escapeHtml(code) + '"><span><span class="history-code">' + escapeHtml(code) + '</span><span class="history-name">' + escapeHtml(frameLabel(frame)) + '</span></span><span class="qty-pill">' + currentQty(frame) + '</span></button>';
    }).join('');
    displayList.querySelectorAll('[data-code]').forEach(function (button) {
        button.addEventListener('click', function () { input.value = button.dataset.code; searchBarcode(); });
    });
}

function renderMovements() {
    if (!movements.length) {
        movementList.innerHTML = '<p class="empty-history">Aucun mouvement enregistré pour le moment.</p>';
        return;
    }
    movementList.innerHTML = movements.map(function (move) {
        const time = move.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const cls = move.direction > 0 ? 'move-add' : 'move-remove';
        const sign = move.direction > 0 ? '+1' : '−1';
        return '<div class="history-item move-item ' + cls + '"><span><span class="history-code">' + escapeHtml(move.code) + '</span><span class="history-name">' + escapeHtml(move.label) + '</span></span><span class="move-badge ' + cls + '">' + sign + ' · reste ' + move.qtyAfter + ' · ' + time + '</span></div>';
    }).join('');
}

function logMovement(frame, direction, qtyAfter) {
    movements.unshift({ code: frameKey(frame), label: frameLabel(frame), direction: direction, qtyAfter: qtyAfter, time: new Date() });
    movements = movements.slice(0, 10);
    renderMovements();
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
        openFrameModal(frame, code);
    } else {
        setState('off', 'Aucune monture trouvée pour ce code');
        openNotFoundModal(code);
    }
}

function openFrameModal(frame, scannedCode) {
    currentModalFrame = frame;
    currentModalCode = scannedCode;
    const title = frameLabel(frame);
    document.getElementById('modalTitle').textContent = title;
    modalCode.textContent = 'CODE SCANNÉ · ' + scannedCode;
    const qty = currentQty(frame);
    const fields = [
        ['Identifiant', frame.id], ['Référence', frame.reference], ['Marque', frame.marque], ['Genre', frame.genre],
        ['Forme', frame.forme], ['Couleur', frame.couleur], ['Matière', frame.matiere], ['Taille', frame.taille],
        ['Prix', formatPrice(frame.prix)], ['Stock général', frame.stockGeneral == null ? '—' : frame.stockGeneral],
        ['Stock local', frame.stockLocal == null ? '—' : frame.stockLocal]
    ].filter(function (field) { return field[1] !== undefined && field[1] !== null && field[1] !== ''; });
    const details = fields.map(function (field) {
        return '<div class="detail"><label>' + escapeHtml(field[0]) + '</label><span>' + escapeHtml(String(field[1])) + '</span></div>';
    }).join('');
    const state = qty > 0 ? qty + ' exemplaire' + (qty > 1 ? 's' : '') + ' exposé' + (qty > 1 ? 's' : '') : 'Retirée du présentoir';
    const message = qty > 0 ? 'La monture est actuellement exposée en magasin.' : 'Aucun exemplaire de cette monture n’est exposé.';
    modalContent.innerHTML = '<div class="modal-summary"><span class="status-dot"></span><div><strong>' + state + '</strong><span>' + message + '</span></div></div>' +
        '<div class="qty-stepper"><div class="qty-stepper-label">Quantité au présentoir</div><div class="qty-stepper-controls">' +
        '<button class="btn btn-outline" id="qtyMinus" type="button"' + (qty <= 0 ? ' disabled' : '') + '><svg class="i"><use href="#ic-minus"/></svg></button>' +
        '<span class="qty-value" id="qtyValue">' + qty + '</span>' +
        '<button class="btn btn-primary" id="qtyPlus" type="button"><svg class="i"><use href="#ic-plus"/></svg></button>' +
        '</div></div>' +
        '<div class="frame-details">' + details + '</div>' + renderLocationBlock(frame) + '<div class="barcode-box"><svg id="modalBarcode"></svg></div>';
    modal.classList.add('show');
    if (window.JsBarcode) JsBarcode('#modalBarcode', scannedCode, { format: 'CODE128', width: 2, height: 70, displayValue: true, margin: 0 });
    document.getElementById('qtyMinus').addEventListener('click', function () { adjustQty(-1); });
    document.getElementById('qtyPlus').addEventListener('click', function () { adjustQty(1); });
    document.getElementById('closeModal').focus();
}

function adjustQty(delta) {
    if (!currentModalFrame) return;
    const before = currentQty(currentModalFrame);
    const after = Math.max(0, before + delta);
    if (after === before) return;
    setQty(currentModalFrame, after);
    logMovement(currentModalFrame, delta > 0 ? 1 : -1, after);
    renderDisplayList();
    renderStats();
    openFrameModal(currentModalFrame, currentModalCode);
}

function openNotFoundModal(code) {
    currentModalFrame = null;
    document.getElementById('modalTitle').textContent = 'Monture introuvable';
    modalCode.textContent = 'CODE SCANNÉ · ' + code;
    modalContent.innerHTML = '<div class="scan-well not-found"><div class="scan-emblem"><svg class="i"><use href="#ic-close"/></svg></div><h2>Code non enregistré</h2><p>Aucune monture ne correspond à ce code dans la base locale. Actualisez l’inventaire si une monture vient d’être ajoutée.</p></div>';
    modal.classList.add('show');
    document.getElementById('closeModal').focus();
}
function closeModal() { modal.classList.remove('show'); currentModalFrame = null; input.value = ''; input.focus(); setState('on', 'En attente d’un code'); }
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
document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && modal.classList.contains('show')) closeModal(); });
window.addEventListener('storage', function (event) {
    if (event.key === 'monturesEnregistrees' || event.key === PRESENTOIR_KEY) refreshInventory();
});

const root = document.documentElement;
const themeIcon = document.getElementById('themeIcon');
document.getElementById('themeToggle').addEventListener('click', function () {
    const isDark = root.getAttribute('data-theme') === 'dark'
        || (!root.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeIcon.innerHTML = '<use href="#ic-' + (isDark ? 'moon' : 'sun') + '"/>';
});

refreshInventory();
renderMovements();
input.focus();

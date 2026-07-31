const API_URL = 'https://api-lunetterie.universearch.com/api/v1';

const input = document.getElementById('barcodeInput');
const scanState = document.getElementById('scanState');
const displayList = document.getElementById('displayList');
const modal = document.getElementById('frameModal');
const modalCode = document.getElementById('modalCode');
const modalContent = document.getElementById('modalContent');
const inventoryStatus = document.getElementById('inventoryStatus');
const statTotalQty = document.getElementById('statTotalQty');
const statRefCount = document.getElementById('statRefCount');
const searchResultBlock = document.getElementById('searchResultBlock');
const searchResultContent = document.getElementById('searchResultContent');
const displayTitle = document.getElementById('displayTitle');
const displayDescription = document.getElementById('displayDescription');
const viewReadyBtn = document.getElementById('viewReadyBtn');
const mViewReadyBtn = document.getElementById('mViewReadyBtn');
const readyModal = document.getElementById('readyModal');
const readyModalSub = document.getElementById('readyModalSub');
const readyList = document.getElementById('readyList');
const viewEmptySlotsBtn = document.getElementById('viewEmptySlotsBtn');
const mViewEmptySlotsBtn = document.getElementById('mViewEmptySlotsBtn');
const emptySlotsModal = document.getElementById('emptySlotsModal');
const emptySlotsModalSub = document.getElementById('emptySlotsModalSub');
const emptySlotsList = document.getElementById('emptySlotsList');
let emptySlots = [];
// Action choice modal elements (Réserve / Vendre)
const actionChoiceModal = document.getElementById('actionChoiceModal');
const chooseReserveBtn = document.getElementById('chooseReserveBtn');
const chooseSellBtn = document.getElementById('chooseSellBtn');
const closeActionChoiceModalBtn = document.getElementById('closeActionChoiceModal');
const cancelActionChoiceBtn = document.getElementById('cancelActionChoiceBtn');

let myStationId = null;
let stationsList = [];
let presentoirStationId = null;
let stockItems = [];
let readyItems = [];
let scanTimer;

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
}
function formatPrice(value) { return value == null || value === '' ? '—' : Number(value).toLocaleString('fr-FR') + ' FCFA'; }
function getGamme(prix) {
    const value = Number(prix);
    if (!prix || Number.isNaN(value)) return '—';
    if (value < 50000) return 'Économique';
    if (value < 100000) return 'Standard';
    if (value < 150000) return 'Premium';
    return 'Luxe';
}
function setState(state, message) { scanState.innerHTML = '<span class="dot-indicator ' + state + '"></span>' + escapeHtml(message); }

function getAuthUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { return null; }
}
function authHeaders(extra) {
    const token = localStorage.getItem('token');
    return Object.assign({}, extra || {}, { 'Authorization': `Bearer ${token}` });
}
function stationName(id) {
    const station = stationsList.find(function (s) { return String(s.id) === String(id); });
    return station ? station.name : null;
}

// ============================
// CHARGEMENT DES STATIONS & DU STOCK RÉEL (table glasses)
// ============================
async function loadStations() {
    try {
        const response = await fetch(`${API_URL}/auth/stations`);
        const json = await response.json();
        if (json.success && Array.isArray(json.data && json.data.stations)) {
            stationsList = json.data.stations;
        }
    } catch (error) {
        console.error('Erreur chargement stations', error);
    }
    const presentoir = stationsList.find(function (s) { return s.name === 'Présentoir'; });
    presentoirStationId = presentoir ? presentoir.id : null;
}

function updatePageTextForRole(user) {
    const role = (user && (user.role_name || user.role || '')).toUpperCase();
    const pageTitleText = document.getElementById('pageTitleText');
    const mPageTitleText = document.getElementById('mPageTitleText');
    const statTotalQtyLabel = document.getElementById('statTotalQtyLabel');
    const myStationName = stationName(myStationId);

    if (role === 'LABORATOIRE') {
        if (displayTitle) displayTitle.textContent = 'En Laboratoire';
        if (displayDescription) displayDescription.textContent = 'Montures actuellement en laboratoire pour analyse, réparation ou préparation avant redistribution.';
        if (pageTitleText) pageTitleText.textContent = 'Poste · Laboratoire';
        if (mPageTitleText) mPageTitleText.textContent = 'Laboratoire';
        if (statTotalQtyLabel) statTotalQtyLabel.textContent = 'Montures en laboratoire';
    } else if (myStationName && myStationName !== 'Présentoir') {
        // Poste rattaché à un magasin physique (ex: "Station Pointe-Noire") plutôt qu'au
        // poste dédié "Présentoir" : on remplace "Présentoir" par le nom réel de la station.
        if (displayTitle) displayTitle.textContent = myStationName;
        if (displayDescription) displayDescription.textContent = 'Montures actuellement exposées à ' + myStationName + '.';
        if (pageTitleText) pageTitleText.textContent = 'Poste · ' + myStationName;
        if (mPageTitleText) mPageTitleText.textContent = myStationName;
        if (statTotalQtyLabel) statTotalQtyLabel.textContent = 'Montures en station';
    } else {
        if (displayTitle) displayTitle.textContent = 'Sur le présentoir';
        if (displayDescription) displayDescription.textContent = 'Montures actuellement exposées en magasin.';
        if (pageTitleText) pageTitleText.textContent = 'Poste · Présentoir';
        if (mPageTitleText) mPageTitleText.textContent = 'Présentoir';
        if (statTotalQtyLabel) statTotalQtyLabel.textContent = 'Montures au présentoir';
    }
}

function updateSendLabelsForRole(user) {
    const role = (user && (user.role_name || user.role || '')).toUpperCase();
    const sendButtonLabel = document.getElementById('sendGlassesBtnLabel');
    const sendButtonMobileLabel = document.getElementById('mSendGlassesBtnLabel');
    const sendModalTitle = document.getElementById('sendModalTitle');
    const confirmSendBtnLabel = document.getElementById('confirmSendBtnLabel');
    const countText = getSelectedStockIds().length ? ' (' + getSelectedStockIds().length + ')' : '';

    if (role === 'LABORATOIRE') {
        if (sendButtonLabel) sendButtonLabel.textContent = 'Délivrer les lunettes';
        if (sendButtonMobileLabel) sendButtonMobileLabel.textContent = 'Délivrer';
        if (sendModalTitle) sendModalTitle.textContent = 'Délivrer les lunettes';
        if (confirmSendBtnLabel) confirmSendBtnLabel.textContent = 'Délivrer' + countText;
    } else {
        if (sendButtonLabel) sendButtonLabel.textContent = 'Envoyer les lunettes';
        if (sendButtonMobileLabel) sendButtonMobileLabel.textContent = 'Envoyer';
        if (sendModalTitle) sendModalTitle.textContent = 'Envoyer les lunettes';
        if (confirmSendBtnLabel) confirmSendBtnLabel.textContent = 'Envoyer' + countText;
    }
}

function updateReadyButtonVisibility(user) {
    const role = (user && (user.role_name || user.role || '')).toUpperCase();
    const show = role === 'VENDEUR';
    if (viewReadyBtn) viewReadyBtn.style.display = show ? '' : 'none';
    if (mViewReadyBtn) mViewReadyBtn.style.display = show ? '' : 'none';
}

function stockListStatus() {
    const myStationName = stationName(myStationId);
    if (myStationName === 'Laboratoire') return 'EN_LABORATOIRE';
    if (myStationName === 'Présentoir') return 'EN_PRESENTOIR';
    // Poste "station" normal (ex: Station Pointe-Noire) : la mise en présentoir est le job du
    // poste dédié Présentoir, pas de chaque magasin — ici on montre le stock local reçu.
    return 'EN_STOCK_SOUS_STATION';
}

async function loadStock() {
    setState('on', 'Chargement…');
    const status = stockListStatus();
    try {
        const response = await fetch(`${API_URL}/inventory/glasses?station_id=${myStationId}&status=${status}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        stockItems = (response.ok && json.success && Array.isArray(json.data && json.data.glasses)) ? json.data.glasses : [];
    } catch (error) {
        console.error('Erreur chargement stock présentoir', error);
        stockItems = [];
    }
    const label = stationName(myStationId) || 'ce poste';
    inventoryStatus.textContent = stockItems.length + ' monture' + (stockItems.length > 1 ? 's' : '') + ' à ' + label + '.';
    setState('on', 'Base de données actualisée');
    renderDisplayList();
    renderStats();
    updateStockBadge();
}

function renderStats() {
    const distinctRefs = new Set(stockItems.map(function (g) { return g.reference; }).filter(Boolean));
    statRefCount.textContent = distinctRefs.size;
    statTotalQty.textContent = stockItems.length;
}

function renderDisplayList() {
    if (!stockItems.length) {
        displayList.innerHTML = '<p class="empty-history">Aucune monture reçue à ce poste.</p>';
        return;
    }
    displayList.innerHTML = stockItems.map(function (glass) {
        const label = ((glass.brand || 'Monture') + ' ' + (glass.reference || '')).trim();
        const locationHtml = glass.location_code ? '<span class="history-location">📍 ' + escapeHtml(glass.location_code) + '</span>' : '';
        return '<button class="history-item" type="button" data-barcode="' + escapeHtml(glass.barcode) + '"><span><span class="history-code">' + escapeHtml(glass.barcode) + '</span><span class="history-name">' + escapeHtml(label) + '</span>' + locationHtml + '</span></button>';
    }).join('');
    displayList.querySelectorAll('[data-barcode]').forEach(function (button) {
        button.addEventListener('click', function () { openGlassByBarcode(button.dataset.barcode); });
    });
}

// Récupère une monture par code-barres et ouvre directement le modal de fiche
// (utilisé pour les clics sur la liste, sans passer par l'étape intermédiaire
// "cliquer sur le résultat de recherche" de searchBarcode()).
async function openGlassByBarcode(barcode) {
    setState('on', 'Chargement…');
    try {
        const response = await fetch(`${API_URL}/inventory/glasses/${encodeURIComponent(barcode)}?station_id=${myStationId}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });

        if (!response.ok || !json.success) {
            setState('off', 'Aucune monture trouvée pour ce code');
            return;
        }

        setState('on', 'Monture trouvée');
        openGlassModal(json.data.glass, barcode);
    } catch (error) {
        console.error('Erreur chargement monture', error);
        setState('off', 'Erreur réseau lors du chargement');
    }
}

// ============================
// RECHERCHE PAR CODE-BARRES (table glasses, toutes stations)
// ============================
async function searchBarcode() {
    const code = input.value.trim();
    if (!code) { input.focus(); return; }

    setState('on', 'Recherche en cours…');
    searchResultBlock.style.display = 'block';
    searchResultContent.innerHTML = '<p class="empty-history">Recherche…</p>';

    try {
        const response = await fetch(`${API_URL}/inventory/glasses/${encodeURIComponent(code)}?station_id=${myStationId}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });

        if (!response.ok || !json.success) {
            setState('off', 'Aucune monture trouvée pour ce code');
            renderSearchNotFound(code);
            return;
        }

        if (json.data.placement_note) {
            setState('off', json.data.placement_note);
        } else {
            setState('on', 'Monture trouvée');
        }
        renderSearchResult(json.data.glass, code, json.data.placement_note);
        loadStock();
    } catch (error) {
        console.error('Erreur recherche monture', error);
        setState('off', 'Erreur réseau lors de la recherche');
        renderSearchNotFound(code);
    }
}

function renderSearchResult(glass, scannedCode, placementNote) {
    const noteHtml = placementNote
        ? '<p class="placement-note">⚠️ ' + escapeHtml(placementNote) + '</p>'
        : '';
    searchResultContent.innerHTML =
        '<button class="history-item" type="button" id="searchResultItem"><span><span class="history-code">' + escapeHtml(glass.barcode) + '</span></span></button>' + noteHtml;
    document.getElementById('searchResultItem').addEventListener('click', function () {
        openGlassModal(glass, scannedCode);
    });
}

// Découpe un code d'emplacement "RAYON-A-ETA-01-BAC-A-POS-03" en ses 4 segments,
// pour l'affichage en fil d'ariane (même format que la page scan).
function parseLocationCode(code) {
    const match = /^RAYON-(\w+)-ETA-(\d+)-BAC-(\w+)-POS-(\d+)$/.exec(code || '');
    if (!match) return null;
    return { rayon: match[1], etagere: Number(match[2]), bac: match[3], position: Number(match[4]) };
}

function renderLocationBlock(locationCode) {
    if (!locationCode) return '';
    const parsed = parseLocationCode(locationCode);
    const pathHtml = parsed
        ? '<div class="path-display">' +
            '<span class="seg hi">Rayon ' + escapeHtml(parsed.rayon) + '</span><span class="arrow">→</span>' +
            '<span class="seg">Étagère ' + parsed.etagere + '</span><span class="arrow">→</span>' +
            '<span class="seg">Bac ' + escapeHtml(parsed.bac) + '</span><span class="arrow">→</span>' +
            '<span class="seg">Position ' + parsed.position + '</span>' +
          '</div>'
        : '';
    return '<div class="location-block">' +
        '<span class="location-label">Emplacement dans la station</span>' +
        '<div class="code-box"><span class="code-text" id="modalLocationCode">' + escapeHtml(locationCode) + '</span>' +
        '<button class="copy-btn" type="button" id="modalCopyLocationBtn"><svg class="i"><use href="#ic-copy"/></svg> Copier</button></div>' +
        pathHtml +
        '</div>';
}

function openGlassModal(glass, scannedCode) {
    const fields = [
        ['Code-barres', glass.barcode], ['Référence', glass.reference], ['Marque', glass.brand],
        ['Genre', glass.gender], ['Forme', glass.shape], ['Couleur', glass.color],
        ['Matière', glass.material], ['Taille', glass.size], ['Prix', formatPrice(glass.price)],
        ['Statut', glass.status], ['Station', glass.station_name]
    ].filter(function (field) { return field[1] !== undefined && field[1] !== null && field[1] !== ''; });

    const details = fields.map(function (field) {
        return '<div class="detail"><label>' + escapeHtml(field[0]) + '</label><span>' + escapeHtml(String(field[1])) + '</span></div>';
    }).join('');

    const photos = [glass.photo_monture_url, glass.photo_branche_url].filter(Boolean);
    const photosHtml = photos.length
        ? '<div class="frame-photos">' + photos.map(function (url) {
            return '<img class="frame-photo" src="' + escapeHtml(url) + '" alt="Photo de la monture" loading="lazy" />';
        }).join('') + '</div>'
        : '';

    document.getElementById('modalTitle').textContent = ((glass.brand || 'Monture') + ' ' + (glass.reference || '')).trim();
    modalCode.textContent = 'CODE SCANNÉ · ' + scannedCode;
    modalContent.innerHTML = photosHtml + '<div class="frame-details">' + details + '</div>' +
        renderLocationBlock(glass.location_code) +
        '<div class="barcode-preview"><svg id="modalBarcodeSvg"></svg><button class="barcode-download-btn" type="button" id="modalDownloadBarcodeBtn" title="Télécharger le code-barres"><svg class="i"><use href="#ic-download"/></svg></button><span>Code-barres de l\'étiquette</span><div class="barcode-label">' + escapeHtml(glass.location_code || glass.barcode) + '</div></div>';
    modal.classList.add('show');

    if (typeof JsBarcode !== 'undefined') {
        JsBarcode('#modalBarcodeSvg', glass.barcode, {
            format: 'CODE128', lineColor: '#0f172a', background: '#ffffff',
            width: 2, height: 46, fontSize: 13, margin: 8, displayValue: false
        });
    }

    const downloadBtn = document.getElementById('modalDownloadBarcodeBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
            const svg = document.getElementById('modalBarcodeSvg');
            if (!svg) return;
            const label = glass.location_code || glass.barcode;
            const width = 600;
            const barHeight = 46;
            const padding = 12;
            const textHeight = 22;
            const totalHeight = barHeight + padding + textHeight + padding;
            const barBBox = svg.getBBox();
            const barWidth = barBBox.width || 300;
            const xOffset = Math.max(0, (width - barWidth) / 2);
            const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + totalHeight + '" viewBox="0 0 ' + width + ' ' + totalHeight + '">' +
                '<rect width="' + width + '" height="' + totalHeight + '" fill="#ffffff"/>' +
                '<g transform="translate(' + xOffset + ',' + padding + ')">' + svg.innerHTML + '</g>' +
                '<text x="' + (width / 2) + '" y="' + (barHeight + padding + textHeight + 4) + '" text-anchor="middle" font-size="14" fill="#000000" font-family="Arial, sans-serif">' + label + '</text>' +
                '</svg>';
            const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = label + '.svg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }

    const copyBtn = document.getElementById('modalCopyLocationBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            const code = document.getElementById('modalLocationCode').textContent;
            navigator.clipboard.writeText(code).then(function () {
                const original = copyBtn.innerHTML;
                copyBtn.innerHTML = '<svg class="i"><use href="#ic-check"/></svg> Copié !';
                setTimeout(function () { copyBtn.innerHTML = original; }, 2000);
            }).catch(function () { alert('Code : ' + code); });
        });
    }
}

function renderSearchNotFound(scannedCode) {
    searchResultContent.innerHTML =
        '<div class="scan-well not-found"><div class="scan-emblem"><svg class="i"><use href="#ic-close"/></svg></div><h2>Code non enregistré</h2><p>Aucune monture ne correspond au code <strong>' + escapeHtml(scannedCode) + '</strong> dans la base.</p></div>';
}

function closeModal() { modal.classList.remove('show'); }
function clearScan() { input.value = ''; input.focus(); setState('on', 'En attente d’un code'); searchResultBlock.style.display = 'none'; }

input.addEventListener('input', function () {
    clearTimeout(scanTimer);
    if (!input.value.trim()) return;
    setState('on', 'Lecture du code…');
    scanTimer = setTimeout(searchBarcode, 350);
});
input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); clearTimeout(scanTimer); searchBarcode(); }
});
document.getElementById('searchBtn').addEventListener('click', searchBarcode);
document.getElementById('clearBtn').addEventListener('click', clearScan);
document.getElementById('refreshInventory').addEventListener('click', loadStock);
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (modal.classList.contains('show')) closeModal();
    if (sendModal.classList.contains('show')) closeSendModal();
    if (readyModal.classList.contains('show')) closeReadyModal();
    if (emptySlotsModal.classList.contains('show')) closeEmptySlotsModal();
});

// ============================
// ENVOI VERS LE LABORATOIRE (transfert réel, comme scan.html)
// ============================
const sendModal = document.getElementById('sendModal');
const sendModalSub = document.getElementById('sendModalSub');
const stockTableBody = document.getElementById('stockTableBody');
const stockEmptyState = document.getElementById('stockEmptyState');
const selectAllStock = document.getElementById('selectAllStock');
const selectedCountEl = document.getElementById('selectedCount');
const confirmSendBtn = document.getElementById('confirmSendBtn');
const sendCountLabel = document.getElementById('sendCountLabel');

function updateStockBadge() {
    const count = String(stockItems.length);
    const badge = document.getElementById('stockCountBadge');
    if (badge) badge.textContent = count;
    const mBadge = document.getElementById('mStockCountBadge');
    if (mBadge) mBadge.textContent = count;
}

// ============================
// LUNETTES À DÉLIVRER (rôle VENDEUR, statut PRETE_A_LIVRER)
// ============================
async function loadReadyToDeliver() {
    readyList.innerHTML = '<p class="empty-history">Chargement…</p>';
    try {
        // Pas de station_id : on veut voir toutes les montures prêtes à délivrer,
        // même si elles n'ont pas encore été transférées au poste du vendeur.
        const response = await fetch(`${API_URL}/inventory/glasses?status=PRETE_A_LIVRER`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        readyItems = (response.ok && json.success && Array.isArray(json.data && json.data.glasses)) ? json.data.glasses : [];
    } catch (error) {
        console.error('Erreur chargement lunettes à délivrer', error);
        readyItems = [];
    }
    renderReadyList();
    updateReadyBadge();
}

function renderReadyList() {
    readyModalSub.textContent = readyItems.length + ' monture' + (readyItems.length > 1 ? 's' : '') + ' prête' + (readyItems.length > 1 ? 's' : '') + ' à délivrer';

    if (!readyItems.length) {
        readyList.innerHTML = '<p class="empty-history">Aucune monture prête à délivrer.</p>';
        return;
    }
    readyList.innerHTML = readyItems.map(function (glass) {
        const label = ((glass.brand || 'Monture') + ' ' + (glass.reference || '')).trim();
        const station = glass.station_name ? ' · ' + glass.station_name : '';
        return '<button class="history-item" type="button" data-barcode="' + escapeHtml(glass.barcode) + '"><span><span class="history-code">' + escapeHtml(glass.barcode) + '</span><span class="history-name">' + escapeHtml(label) + escapeHtml(station) + '</span></span></button>';
    }).join('');
    readyList.querySelectorAll('[data-barcode]').forEach(function (button) {
        button.addEventListener('click', function () {
            closeReadyModal();
            openGlassByBarcode(button.dataset.barcode);
        });
    });
}

function updateReadyBadge() {
    const count = String(readyItems.length);
    const badge = document.getElementById('readyCountBadge');
    if (badge) badge.textContent = count;
    const mBadge = document.getElementById('mReadyCountBadge');
    if (mBadge) mBadge.textContent = count;
}

// ============================
// EMPLACEMENTS À REMPLACER (poste Présentoir uniquement, ventes/réserves du jour)
// ============================
function updateEmptySlotsButtonVisibility() {
    const show = stationName(myStationId) === 'Présentoir';
    if (viewEmptySlotsBtn) viewEmptySlotsBtn.style.display = show ? '' : 'none';
    if (mViewEmptySlotsBtn) mViewEmptySlotsBtn.style.display = show ? '' : 'none';
}

async function loadEmptySlots() {
    emptySlotsList.innerHTML = '<p class="empty-history">Chargement…</p>';
    try {
        const response = await fetch(`${API_URL}/inventory/presentoir/empty-slots?station_id=${myStationId}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        emptySlots = (response.ok && json.success && Array.isArray(json.data && json.data.slots)) ? json.data.slots : [];
    } catch (error) {
        console.error('Erreur chargement emplacements vides', error);
        emptySlots = [];
    }
    renderEmptySlotsList();
    updateEmptySlotsBadge();
}

function renderEmptySlotsList() {
    emptySlotsModalSub.textContent = emptySlots.length + ' emplacement' + (emptySlots.length > 1 ? 's' : '') + ' libéré' + (emptySlots.length > 1 ? 's' : '') + " aujourd'hui";

    if (!emptySlots.length) {
        emptySlotsList.innerHTML = '<p class="empty-history">Aucun emplacement à remplacer aujourd\'hui.</p>';
        return;
    }
    emptySlotsList.innerHTML = emptySlots.map(function (code) {
        return '<div class="history-item"><span><span class="history-code">' + escapeHtml(code) + '</span></span></div>';
    }).join('');
}

function updateEmptySlotsBadge() {
    const count = String(emptySlots.length);
    const badge = document.getElementById('emptySlotsCountBadge');
    if (badge) badge.textContent = count;
    const mBadge = document.getElementById('mEmptySlotsCountBadge');
    if (mBadge) mBadge.textContent = count;
}

function openEmptySlotsModal() { emptySlotsModal.classList.add('show'); loadEmptySlots(); }
function closeEmptySlotsModal() { emptySlotsModal.classList.remove('show'); }

function openReadyModal() { readyModal.classList.add('show'); loadReadyToDeliver(); }
function closeReadyModal() { readyModal.classList.remove('show'); }

// Action choice modal controls
function openActionChoiceModal() {
    if (!actionChoiceModal) return;
    actionChoiceModal.style.display = '';
    actionChoiceModal.classList.add('show');
}
function closeActionChoiceModal() {
    if (!actionChoiceModal) return;
    actionChoiceModal.classList.remove('show');
    actionChoiceModal.style.display = 'none';
}

async function performSell(ids) {
    if (!ids || !ids.length) return alert('Aucune monture sélectionnée');
    if (!chooseSellBtn) return;
    chooseSellBtn.disabled = true;
    const original = chooseSellBtn.innerHTML;
    chooseSellBtn.innerHTML = 'Enregistrement...';
    try {
        const res = await fetch(`${API_URL}/inventory/sales`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ station_id: Number(myStationId), barcodes: ids })
        });
        const json = await res.json().catch(function () { return {}; });
        if (!res.ok || !json.success) throw new Error(json.error || `Erreur (${res.status})`);
        alert('✅ Vente enregistrée');
        closeActionChoiceModal();
        closeSendModal();
        await loadStock();
        renderStockTable();
    } catch (err) {
        console.error('Erreur vente', err);
        alert('❌ ' + (err.message || "Échec de l'enregistrement de la vente"));
    } finally {
        chooseSellBtn.disabled = false;
        chooseSellBtn.innerHTML = original;
    }
}

async function performReserve(ids) {
    if (!ids || !ids.length) return alert('Aucune monture sélectionnée');
    if (!chooseReserveBtn) return;
    chooseReserveBtn.disabled = true;
    const original = chooseReserveBtn.innerHTML;
    chooseReserveBtn.innerHTML = 'Enregistrement...';
    try {
        const res = await fetch(`${API_URL}/inventory/reserves`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ station_id: Number(myStationId), barcodes: ids })
        });
        const json = await res.json().catch(function () { return {}; });
        if (!res.ok || !json.success) throw new Error(json.error || `Erreur (${res.status})`);
        alert('✅ Réserve enregistrée');
        closeActionChoiceModal();
        closeSendModal();
        await loadStock();
        renderStockTable();
    } catch (err) {
        console.error('Erreur réserve', err);
        alert('❌ ' + (err.message || "Échec de l'enregistrement de la réserve"));
    } finally {
        chooseReserveBtn.disabled = false;
        chooseReserveBtn.innerHTML = original;
    }
}

function renderStockTable() {
    sendModalSub.textContent = stockItems.length + ' monture' + (stockItems.length > 1 ? 's' : '') + ' reçue' + (stockItems.length > 1 ? 's' : '');

    if (!stockItems.length) {
        stockTableBody.innerHTML = '';
        stockEmptyState.style.display = 'flex';
        selectAllStock.checked = false;
        selectAllStock.disabled = true;
    } else {
        stockEmptyState.style.display = 'none';
        selectAllStock.disabled = false;
        stockTableBody.innerHTML = stockItems.map(function (item) {
            return '<tr>' +
                '<td><input type="checkbox" class="stock-row-check" data-id="' + escapeHtml(item.barcode) + '" /></td>' +
                '<td><strong>' + escapeHtml(item.brand || '—') + '</strong></td>' +
                '<td>' + escapeHtml(item.reference || '—') + '</td>' +
                '<td>' + escapeHtml([item.gender, item.shape, item.color].filter(Boolean).join(' · ')) + '</td>' +
                '<td>' + escapeHtml(getGamme(item.price)) + '</td>' +
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

async function openSendModal() {
    sendModal.classList.add('show');
    await loadStock();
    renderStockTable();
}
function closeSendModal() { sendModal.classList.remove('show'); }

async function confirmSendGlasses() {
    const ids = getSelectedStockIds();
    if (!ids.length) return;

    const user = getAuthUser();
    const role = (user && (user.role_name || user.role || '')).toUpperCase();
    const myStationName = stationName(myStationId);

    if (role === 'LABORATOIRE') return confirmDeliverGlasses(ids);
    // Poste Présentoir : les montures sont déjà exposées, "Envoyer" = les vendre ou les réserver.
    if (myStationName === 'Présentoir') return openActionChoiceModal();
    // Poste "station" (magasin, ex: Station Pointe-Noire) : les montures sont en stock local,
    // pas encore exposées — "Envoyer" les transfère vers le poste Présentoir.
    return confirmTransferToStation(ids, presentoirStationId, 'Présentoir');
}

// Poste Laboratoire : marque les montures sélectionnées comme prêtes à livrer
// (table deliveries/delivery_items, statut PRETE_A_LIVRER)
async function confirmDeliverGlasses(ids) {
    confirmSendBtn.disabled = true;
    const originalLabel = confirmSendBtn.innerHTML;
    confirmSendBtn.innerHTML = 'Livraison en cours...';

    try {
        const response = await fetch(`${API_URL}/inventory/deliveries`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ station_id: Number(myStationId), barcodes: ids })
        });
        const json = await response.json().catch(function () { return {}; });
        if (!response.ok || !json.success) {
            throw new Error(json.error || `Erreur lors de la livraison (${response.status})`);
        }

        alert('✅ ' + ids.length + (ids.length > 1 ? ' montures livrées.' : ' monture livrée.'));
        await loadStock();
        renderStockTable();
    } catch (error) {
        console.error('Erreur livraison', error);
        alert('❌ ' + (error.message || "Échec de la livraison"));
    } finally {
        confirmSendBtn.disabled = false;
        confirmSendBtn.innerHTML = originalLabel;
    }
}

// Envoie les montures sélectionnées vers une autre station (transfert réel) : utilisé pour
// "Station" -> Présentoir, comme précédemment pour Présentoir -> Laboratoire.
async function confirmTransferToStation(ids, targetStationId, targetLabel) {
    if (!targetStationId) { alert('Station "' + targetLabel + '" introuvable en base.'); return; }

    const sentItems = stockItems.filter(function (item) { return ids.includes(item.barcode); });

    confirmSendBtn.disabled = true;
    const originalLabel = confirmSendBtn.innerHTML;
    confirmSendBtn.innerHTML = 'Envoi en cours...';

    try {
        const createRes = await fetch(`${API_URL}/inventory/transfers`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ from_station_id: Number(myStationId), to_station_id: Number(targetStationId) })
        });
        const createJson = await createRes.json().catch(function () { return {}; });
        if (!createRes.ok || !createJson.success) {
            throw new Error(createJson.error || `Erreur lors de la création du transfert (${createRes.status})`);
        }
        const transferId = createJson.data.id;

        const failed = [];
        for (const item of sentItems) {
            const itemRes = await fetch(`${API_URL}/inventory/transfers/${transferId}/items`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ barcode: item.barcode })
            });
            const itemJson = await itemRes.json().catch(function () { return {}; });
            if (!itemRes.ok || !itemJson.success) failed.push(item.reference || item.barcode);
        }

        const addedItems = sentItems.filter(function (item) { return !failed.includes(item.reference || item.barcode); });
        if (!addedItems.length) {
            throw new Error("Aucune monture n'a pu être ajoutée au transfert" + (failed.length ? ` (${failed.join(', ')})` : ''));
        }

        const dispatchRes = await fetch(`${API_URL}/inventory/transfers/${transferId}/dispatch`, {
            method: 'POST',
            headers: authHeaders()
        });
        const dispatchJson = await dispatchRes.json().catch(function () { return {}; });
        if (!dispatchRes.ok || !dispatchJson.success) {
            throw new Error(dispatchJson.error || `Erreur lors de l'expédition du transfert (${dispatchRes.status})`);
        }

        let message = '✅ ' + addedItems.length + (addedItems.length > 1 ? ' montures envoyées' : ' monture envoyée') + ' vers ' + targetLabel + '.';
        if (failed.length) message += `\n⚠️ Non envoyées : ${failed.join(', ')}`;
        alert(message);
        await loadStock();
        renderStockTable();
    } catch (error) {
        console.error('Erreur envoi transfert', error);
        alert('❌ ' + (error.message || "Échec de l'envoi vers " + targetLabel));
    } finally {
        confirmSendBtn.disabled = false;
        confirmSendBtn.innerHTML = originalLabel;
    }
}

document.getElementById('sendGlassesBtn').addEventListener('click', openSendModal);
document.getElementById('mSendGlassesBtn').addEventListener('click', openSendModal);
document.getElementById('mRefreshBtn').addEventListener('click', loadStock);
document.getElementById('closeSendModal').addEventListener('click', closeSendModal);
document.getElementById('cancelSendBtn').addEventListener('click', closeSendModal);
sendModal.addEventListener('click', function (event) { if (event.target === sendModal) closeSendModal(); });
if (viewReadyBtn) viewReadyBtn.addEventListener('click', openReadyModal);
if (mViewReadyBtn) mViewReadyBtn.addEventListener('click', openReadyModal);
document.getElementById('closeReadyModal').addEventListener('click', closeReadyModal);
document.getElementById('closeReadyModalFooter').addEventListener('click', closeReadyModal);
readyModal.addEventListener('click', function (event) { if (event.target === readyModal) closeReadyModal(); });
if (viewEmptySlotsBtn) viewEmptySlotsBtn.addEventListener('click', openEmptySlotsModal);
if (mViewEmptySlotsBtn) mViewEmptySlotsBtn.addEventListener('click', openEmptySlotsModal);
document.getElementById('closeEmptySlotsModal').addEventListener('click', closeEmptySlotsModal);
document.getElementById('closeEmptySlotsModalFooter').addEventListener('click', closeEmptySlotsModal);
emptySlotsModal.addEventListener('click', function (event) { if (event.target === emptySlotsModal) closeEmptySlotsModal(); });
if (actionChoiceModal) actionChoiceModal.addEventListener('click', function (event) { if (event.target === actionChoiceModal) closeActionChoiceModal(); });

if (chooseSellBtn) chooseSellBtn.addEventListener('click', function () { performSell(getSelectedStockIds()); });
if (chooseReserveBtn) chooseReserveBtn.addEventListener('click', function () { performReserve(getSelectedStockIds()); });
if (closeActionChoiceModalBtn) closeActionChoiceModalBtn.addEventListener('click', closeActionChoiceModal);
if (cancelActionChoiceBtn) cancelActionChoiceBtn.addEventListener('click', closeActionChoiceModal);
document.querySelectorAll('.batch-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { selectStockBatch(btn.dataset.batch); });
});
stockTableBody.addEventListener('change', function (event) {
    if (event.target.classList.contains('stock-row-check')) updateSendSummary();
});
selectAllStock.addEventListener('change', function () { selectStockBatch(selectAllStock.checked ? 'all' : 'none'); });
confirmSendBtn.addEventListener('click', confirmSendGlasses);

// ============================
// THÈME CLAIR / SOMBRE
// ============================
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

// ============================
// INITIALISATION
// ============================
(async function init() {
    const token = localStorage.getItem('token');
    const user = getAuthUser();
    if (!token || !user || !user.station_id) {
        alert('Vous devez être connecté avec un poste assigné pour accéder à cette page.');
        window.location.href = 'index.html';
        return;
    }
    myStationId = user.station_id;

    await loadStations();
    updatePageTextForRole(user);
    updateSendLabelsForRole(user);
    updateReadyButtonVisibility(user);
    updateEmptySlotsButtonVisibility();
    await loadStock();
    input.focus();
})();

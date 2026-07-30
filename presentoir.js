const API_URL = 'https://api-lunetterie.universearch.com/api/v1';

const input = document.getElementById('barcodeInput');
const scanState = document.getElementById('scanState');
const displayList = document.getElementById('displayList');
const movementList = document.getElementById('movementList');
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

let myStationId = null;
let stationsList = [];
let laboratoireStationId = null;
let stockItems = [];
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
    const lab = stationsList.find(function (s) { return s.name === 'Laboratoire'; });
    laboratoireStationId = lab ? lab.id : null;
}

function updatePageTextForRole(user) {
    const role = (user && (user.role_name || user.role || '')).toUpperCase();
    if (role === 'LABORATOIRE') {
        if (displayTitle) displayTitle.textContent = 'En Laboratoire';
        if (displayDescription) displayDescription.textContent = 'Montures actuellement en laboratoire pour analyse, réparation ou préparation avant redistribution.';
    } else {
        if (displayTitle) displayTitle.textContent = 'Sur le présentoir';
        if (displayDescription) displayDescription.textContent = 'Montures actuellement exposées en magasin.';
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

async function loadStock() {
    setState('on', 'Chargement…');
    try {
        const response = await fetch(`${API_URL}/inventory/glasses?station_id=${myStationId}&status=EN_PRESENTOIR`, { headers: authHeaders() });
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
        return '<button class="history-item" type="button" data-barcode="' + escapeHtml(glass.barcode) + '"><span><span class="history-code">' + escapeHtml(glass.barcode) + '</span><span class="history-name">' + escapeHtml(label) + '</span></span></button>';
    }).join('');
    displayList.querySelectorAll('[data-barcode]').forEach(function (button) {
        button.addEventListener('click', function () { input.value = button.dataset.barcode; searchBarcode(); });
    });
}

function renderMovements() {
    movementList.innerHTML = '<p class="empty-history">Aucun mouvement enregistré pour le moment.</p>';
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

        setState('on', 'Monture trouvée');
        renderSearchResult(json.data.glass, code);
        loadStock();
    } catch (error) {
        console.error('Erreur recherche monture', error);
        setState('off', 'Erreur réseau lors de la recherche');
        renderSearchNotFound(code);
    }
}

function renderSearchResult(glass, scannedCode) {
    searchResultContent.innerHTML =
        '<button class="history-item" type="button" id="searchResultItem"><span><span class="history-code">' + escapeHtml(glass.barcode) + '</span></span></button>';
    document.getElementById('searchResultItem').addEventListener('click', function () {
        openGlassModal(glass, scannedCode);
    });
}

function openGlassModal(glass, scannedCode) {
    const fields = [
        ['Code-barres', glass.barcode], ['Référence', glass.reference], ['Marque', glass.brand],
        ['Genre', glass.gender], ['Forme', glass.shape], ['Couleur', glass.color],
        ['Matière', glass.material], ['Taille', glass.size], ['Prix', formatPrice(glass.price)],
        ['Statut', glass.status], ['Station', glass.station_name], ['Emplacement', glass.location_code]
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
    modalContent.innerHTML = photosHtml + '<div class="frame-details">' + details + '</div>';
    modal.classList.add('show');
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
    if (role === 'LABORATOIRE') return confirmDeliverGlasses(ids);
    return confirmTransferToLab(ids);
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

// Poste Présentoir : envoie les montures sélectionnées vers le Laboratoire (transfert réel)
async function confirmTransferToLab(ids) {
    if (!laboratoireStationId) { alert('Station "Laboratoire" introuvable en base.'); return; }

    const sentItems = stockItems.filter(function (item) { return ids.includes(item.barcode); });

    confirmSendBtn.disabled = true;
    const originalLabel = confirmSendBtn.innerHTML;
    confirmSendBtn.innerHTML = 'Envoi en cours...';

    try {
        const createRes = await fetch(`${API_URL}/inventory/transfers`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ from_station_id: Number(myStationId), to_station_id: Number(laboratoireStationId) })
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

        let message = '✅ ' + addedItems.length + (addedItems.length > 1 ? ' montures envoyées' : ' monture envoyée') + ' vers Laboratoire.';
        if (failed.length) message += `\n⚠️ Non envoyées : ${failed.join(', ')}`;
        alert(message);
        await loadStock();
        renderStockTable();
    } catch (error) {
        console.error('Erreur envoi transfert', error);
        alert('❌ ' + (error.message || "Échec de l'envoi vers le laboratoire"));
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
    await loadStock();
    renderMovements();
    input.focus();
})();

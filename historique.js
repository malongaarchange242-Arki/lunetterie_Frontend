const API_URL = 'https://api-lunetterie.universearch.com/api/v1';
const PAGE_SIZE = 50;

const ACTION_LABELS = {
    RECEPTION_FOURNISSEUR: 'Réception fournisseur',
    RANGEMENT: 'Rangement',
    EXPEDITION: 'Expédition',
    RECEPTION_STATION: 'Réception station',
    PRESENTOIR: 'Mise en présentoir',
    RETRAIT_PRESENTOIR: 'Retrait présentoir',
    RESERVATION: 'Réservation',
    LABORATOIRE: 'Envoi laboratoire',
    CONTROLE_QUALITE: 'Contrôle qualité',
    LIVRAISON: 'Livraison',
    RETOUR: 'Retour',
    INVENTAIRE: 'Inventaire',
    PERTE: 'Perte',
    CASSE: 'Casse'
};

const filterFromStation = document.getElementById('filterFromStation');
const filterToStation = document.getElementById('filterToStation');
const filterAction = document.getElementById('filterAction');
const filterUser = document.getElementById('filterUser');
const filterBarcode = document.getElementById('filterBarcode');
const filterDateFrom = document.getElementById('filterDateFrom');
const filterDateTo = document.getElementById('filterDateTo');
const movementsTable = document.getElementById('movementsTable');
const movementCount = document.getElementById('movementCount');
const pageInfo = document.getElementById('pageInfo');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');

let currentPage = 0;
let totalMovements = 0;
let filterDebounce;

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
}
function authHeaders(extra) {
    const token = localStorage.getItem('token');
    return Object.assign({}, extra || {}, { 'Authorization': `Bearer ${token}` });
}
function formatDate(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function actionLabel(action) { return ACTION_LABELS[action] || action; }
function actionBadgeClass(action) {
    if (action === 'PERTE' || action === 'CASSE') return 'badge danger';
    if (action === 'RESERVATION' || action === 'RETRAIT_PRESENTOIR') return 'badge warning';
    if (action === 'PRESENTOIR' || action === 'LIVRAISON' || action === 'RECEPTION_FOURNISSEUR' || action === 'RECEPTION_STATION') return 'badge success';
    return 'badge';
}

async function loadStations() {
    try {
        const response = await fetch(`${API_URL}/auth/stations`);
        const json = await response.json().catch(function () { return {}; });
        const stations = (json.success && Array.isArray(json.data && json.data.stations)) ? json.data.stations : [];
        const options = stations.map(function (s) {
            return '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>';
        }).join('');
        filterFromStation.innerHTML = '<option value="">De · tous postes</option>' + options;
        filterToStation.innerHTML = '<option value="">Vers · tous postes</option>' + options;
    } catch (error) {
        console.error('Erreur chargement stations', error);
    }
}

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/auth/users`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        const users = (json.success && Array.isArray(json.data && json.data.users)) ? json.data.users : [];
        filterUser.innerHTML = '<option value="">Tous les utilisateurs</option>' + users.map(function (u) {
            const name = ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.email || ('Utilisateur #' + u.id);
            return '<option value="' + u.id + '">' + escapeHtml(name) + '</option>';
        }).join('');
    } catch (error) {
        console.error('Erreur chargement utilisateurs', error);
    }
}

function populateActionFilter() {
    filterAction.innerHTML = '<option value="">Toutes les actions</option>' + Object.keys(ACTION_LABELS).map(function (key) {
        return '<option value="' + key + '">' + escapeHtml(ACTION_LABELS[key]) + '</option>';
    }).join('');
}

function buildQuery() {
    const params = new URLSearchParams();
    if (filterFromStation.value) params.set('from_station_id', filterFromStation.value);
    if (filterToStation.value) params.set('to_station_id', filterToStation.value);
    if (filterAction.value) params.set('action', filterAction.value);
    if (filterUser.value) params.set('user_id', filterUser.value);
    if (filterBarcode.value.trim()) params.set('barcode', filterBarcode.value.trim());
    if (filterDateFrom.value) params.set('date_from', filterDateFrom.value);
    if (filterDateTo.value) params.set('date_to', filterDateTo.value);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(currentPage * PAGE_SIZE));
    return params.toString();
}

async function loadMovements() {
    movementsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">Chargement…</td></tr>';
    try {
        const response = await fetch(`${API_URL}/inventory/movements?${buildQuery()}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        const movements = (response.ok && json.success && Array.isArray(json.data && json.data.movements)) ? json.data.movements : [];
        totalMovements = (response.ok && json.success && typeof json.data.total === 'number') ? json.data.total : movements.length;
        renderMovements(movements);
    } catch (error) {
        console.error('Erreur chargement mouvements', error);
        movementsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--danger);">Erreur de chargement.</td></tr>';
        totalMovements = 0;
    }
    updatePagination();
}

function renderMovements(movements) {
    movementCount.textContent = totalMovements + ' mouvement' + (totalMovements > 1 ? 's' : '');

    if (!movements.length) {
        movementsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">Aucun mouvement trouvé.</td></tr>';
        return;
    }

    movementsTable.innerHTML = movements.map(function (m) {
        const label = ((m.brand || '') + ' ' + (m.reference || '')).trim();
        const glassCell = '<div><strong>' + escapeHtml(m.barcode) + '</strong>' + (label ? '<div style="font-size:12px;color:var(--ink-soft);">' + escapeHtml(label) + '</div>' : '') + '</div>';
        const fromCell = [m.from_station_name, m.from_location_code].filter(Boolean).map(escapeHtml).join(' · ') || '—';
        const toCell = [m.to_station_name, m.to_location_code].filter(Boolean).map(escapeHtml).join(' · ') || '—';
        const userCell = (m.user_first_name || m.user_last_name) ? escapeHtml(((m.user_first_name || '') + ' ' + (m.user_last_name || '')).trim()) : '—';
        return '<tr>' +
            '<td>' + formatDate(m.created_at) + '</td>' +
            '<td>' + glassCell + '</td>' +
            '<td><span class="' + actionBadgeClass(m.action) + '">' + escapeHtml(actionLabel(m.action)) + '</span></td>' +
            '<td>' + fromCell + '</td>' +
            '<td>' + toCell + '</td>' +
            '<td>' + userCell + '</td>' +
            '</tr>';
    }).join('');
}

function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalMovements / PAGE_SIZE));
    pageInfo.textContent = 'Page ' + (currentPage + 1) + ' / ' + totalPages;
    prevPageBtn.disabled = currentPage <= 0;
    nextPageBtn.disabled = currentPage + 1 >= totalPages;
}

function resetToFirstPageAndReload() {
    currentPage = 0;
    loadMovements();
}

function debouncedReload() {
    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(resetToFirstPageAndReload, 350);
}

document.getElementById('refreshBtn').addEventListener('click', loadMovements);
document.getElementById('resetFiltersBtn').addEventListener('click', function () {
    filterFromStation.value = '';
    filterToStation.value = '';
    filterAction.value = '';
    filterUser.value = '';
    filterBarcode.value = '';
    filterDateFrom.value = '';
    filterDateTo.value = '';
    resetToFirstPageAndReload();
});
filterFromStation.addEventListener('change', resetToFirstPageAndReload);
filterToStation.addEventListener('change', resetToFirstPageAndReload);
filterAction.addEventListener('change', resetToFirstPageAndReload);
filterUser.addEventListener('change', resetToFirstPageAndReload);
filterDateFrom.addEventListener('change', resetToFirstPageAndReload);
filterDateTo.addEventListener('change', resetToFirstPageAndReload);
filterBarcode.addEventListener('input', debouncedReload);
prevPageBtn.addEventListener('click', function () { if (currentPage > 0) { currentPage -= 1; loadMovements(); } });
nextPageBtn.addEventListener('click', function () { currentPage += 1; loadMovements(); });

// ============================
// THÈME CLAIR / SOMBRE
// ============================
const THEME_KEY = 'lunetterie-theme';
function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.innerHTML = '<use href="#ic-' + (isDark ? 'moon' : 'sun') + '"/>';
}
document.getElementById('themeToggle').addEventListener('click', function () {
    const current = document.documentElement.getAttribute('data-theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
});

// ============================
// INITIALISATION
// ============================
(async function init() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Vous devez être connecté pour accéder à cette page.');
        window.location.href = 'index.html';
        return;
    }
    applyTheme(localStorage.getItem(THEME_KEY));
    populateActionFilter();
    await Promise.all([loadStations(), loadUsers()]);
    await loadMovements();
})();

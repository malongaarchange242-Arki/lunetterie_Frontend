/* ==========================================================================
   Données partagées entre la vue desktop et la vue mobile
   ========================================================================== */
const MODULES = [
    { page: 'lunettes', icon: 'ic-glasses', title: 'Suivi des lunettes', desc: 'Répartition des montures entre le stock central et les magasins.', available: true },
    { page: 'ca', icon: 'ic-chart-bar', title: "Chiffre d'affaires", desc: 'Statistiques de CA par période, magasin et vendeur.' },
    { page: 'employes', icon: 'ic-users', title: 'Suivi des employés', desc: 'Vue consolidée des employés et de leur activité.' },
    { page: 'paiements', icon: 'ic-credit-card', title: 'Demandes de paiement', desc: 'Demandes de paiement des employés et fournisseurs.' },
    { page: 'commandes', icon: 'ic-cart', title: 'Suivi des commandes', desc: 'Commandes fournisseurs et clients en cours.' },
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

function formatNumber(value) { return Number(value).toLocaleString('fr-FR'); }
function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
}

/* ==========================================================================
   CONNEXION AU BACKEND (table stations + glasses réelles)
   ========================================================================== */
const API_URL = 'https://api-lunetterie.universearch.com/api/v1';
const STOCK_STATUSES = ['EN_STOCK_GENERAL', 'EN_STOCK_SOUS_STATION', 'EN_PRESENTOIR', 'EN_LABORATOIRE', 'RESERVEE'];

function getAuthUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { return null; }
}
function authHeaders(extra) {
    const token = localStorage.getItem('token');
    return Object.assign({}, extra || {}, { 'Authorization': `Bearer ${token}` });
}

// Compte les montures d'une station par statut (stockLocal/présentoir/labo/réserve)
async function fetchStationBreakdown(station) {
    const breakdown = { id: String(station.id), label: station.name, stockLocal: 0, presentoir: 0, labo: 0, reserve: 0 };
    try {
        const response = await fetch(`${API_URL}/inventory/glasses?station_id=${station.id}&status=${STOCK_STATUSES.join(',')}`, { headers: authHeaders() });
        const json = await response.json().catch(function () { return {}; });
        const glasses = (response.ok && json.success && Array.isArray(json.data && json.data.glasses)) ? json.data.glasses : [];
        glasses.forEach(function (glass) {
            if (glass.status === 'EN_STOCK_GENERAL' || glass.status === 'EN_STOCK_SOUS_STATION') breakdown.stockLocal++;
            else if (glass.status === 'EN_PRESENTOIR') breakdown.presentoir++;
            else if (glass.status === 'EN_LABORATOIRE') breakdown.labo++;
            else if (glass.status === 'RESERVEE') breakdown.reserve++;
        });
    } catch (error) {
        console.error('Erreur chargement montures station #' + station.id, error);
    }
    return breakdown;
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

    const centralStations = stations.filter(function (s) { return s.type === 'STOCK_GENERAL'; });
    const shopStations = stations.filter(function (s) { return s.type !== 'STOCK_GENERAL'; });

    const [centralBreakdowns, shopBreakdowns] = await Promise.all([
        Promise.all(centralStations.map(fetchStationBreakdown)),
        Promise.all(shopStations.map(fetchStationBreakdown))
    ]);

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
   VUE DESKTOP
   ========================================================================== */
let dSelectedStoreId = null;

const D_TITLES = {
    home: { title: "📊 Vue d'ensemble", sub: 'Accès rapide à tous les modules de pilotage' },
    ca: { title: "📈 Chiffre d'affaires", sub: 'Statistiques par période, magasin et vendeur' },
    employes: { title: '👥 Suivi des employés', sub: 'Vue consolidée des employés et de leur activité' },
    paiements: { title: '💳 Demandes de paiement', sub: 'Employés et fournisseurs' },
    commandes: { title: '🛒 Suivi des commandes', sub: 'Fournisseurs et clients' },
    compta: { title: '💼 Comptabilité', sub: 'Charges et bilans' },
    planning: { title: '🗓️ Plannings', sub: 'Par poste et par semaine' },
    reclamations: { title: '⚠️ Réclamations', sub: 'Suivi et résolution' },
    messagerie: { title: '✉️ Messagerie générale', sub: "Entre les postes et l'administration" },
    lunettes: { title: '🕶️ Suivi des lunettes', sub: "Répartition des montures entre l'entrepôt central et les magasins" }
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
    document.getElementById('dPageTitle').textContent = info.title;
    document.getElementById('dPageSubtitle').textContent = info.sub;

    if (page === 'lunettes') { dRenderGlobalStats(); dRenderStorePicker(); dRenderStoreDetail(); }
}

function dRenderGlobalStats() {
    const cards = [
        { icon: 'ic-glasses', color: 'blue', label: 'Lunettes total', value: TOTAL_GLOBAL, detail: 'total' },
        { icon: 'ic-store', color: 'gold', label: 'Lunettes en magasin', value: TOTAL_MAGASIN, detail: 'magasin' },
        { icon: 'ic-warehouse', color: 'purple', label: 'Lunettes en stock central', value: STOCK_CENTRAL, detail: 'stock' }
    ];
    document.getElementById('dGlobalStats').innerHTML = cards.map(function (card) {
        return '<div class="stat-card">' +
            '<div class="stat-header"><div class="stat-icon ' + card.color + '"><svg class="i"><use href="#' + card.icon + '"/></svg></div></div>' +
            '<div class="stat-value">' + formatNumber(card.value) + '</div>' +
            '<div class="stat-label">' + card.label + '</div>' +
            '<button class="btn btn-outline btn-sm stat-detail-btn" type="button" data-detail="' + card.detail + '">Voir détail</button>' +
            '</div>';
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
        { icon: 'ic-warehouse', color: 'blue', label: 'Stock local', value: store.stockLocal },
        { icon: 'ic-display', color: 'green', label: 'Présentoir', value: store.presentoir },
        { icon: 'ic-flask', color: 'orange', label: 'Labo', value: store.labo },
        { icon: 'ic-archive', color: 'purple', label: 'Réserve', value: store.reserve }
    ];
    document.getElementById('dStoreStats').innerHTML = cards.map(function (card) {
        return '<div class="stat-card">' +
            '<div class="stat-header"><div class="stat-icon ' + card.color + '"><svg class="i"><use href="#' + card.icon + '"/></svg></div></div>' +
            '<div class="stat-value">' + formatNumber(card.value) + '</div>' +
            '<div class="stat-label">' + card.label + ' · ' + store.label + '</div>' +
            '</div>';
    }).join('');

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
        '<div class="stat-card pending"><div class="stat-header"><div class="stat-icon blue"><svg class="i"><use href="#ic-store"/></svg></div></div><div class="stat-value muted-value">—</div><div class="stat-label">Montures vendues · ' + store.label + '</div><div class="pending-note">Donnée à connecter</div></div>' +
        '<div class="stat-card pending"><div class="stat-header"><div class="stat-icon green"><svg class="i"><use href="#ic-warehouse"/></svg></div></div><div class="stat-value muted-value">—</div><div class="stat-label">En transit vers ' + store.label + '</div><div class="pending-note">Donnée à connecter</div></div>';
}

function dOpenGlobalDetail(detail) {
    const titles = { total: 'Lunettes total', magasin: 'Lunettes en magasin', stock: 'Lunettes en stock central' };
    document.getElementById('dDetailModalTitle').textContent = titles[detail] || 'Détail';
    let body;
    if (detail === 'magasin') {
        body = '<p style="color:var(--ink-soft);font-size:13.5px;margin-bottom:16px;">Répartition des ' + formatNumber(TOTAL_MAGASIN) + ' montures en magasin, par point de vente.</p>' +
            '<div class="table-container" style="box-shadow:none;">' + STORES.map(function (store) {
                return '<div class="detail-row-simple"><span>' + store.label + '</span><strong>' + formatNumber(storeTotal(store)) + '</strong></div>';
            }).join('') + '</div>';
    } else {
        body = '<div class="empty-state"><svg class="i"><use href="#ic-file-alt"/></svg><h4>Détail en développement</h4><p>La ventilation détaillée par référence/modèle sera disponible ici.</p></div>';
    }
    document.getElementById('dDetailModalBody').innerHTML = body;
    document.getElementById('dDetailModal').classList.add('active');
}
function dCloseDetailModal() { document.getElementById('dDetailModal').classList.remove('active'); }

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
    detail.innerHTML = '<div class="detail-empty">' +
        '<div class="empty-icon"><svg class="i"><use href="#' + module.icon + '"/></svg></div>' +
        '<h4>Module en développement</h4>' +
        '<p>' + escapeHtml(module.desc) + '</p>' +
        '<span class="tag">Bientôt disponible</span>' +
        '</div>';
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
        '<div class="pending-card"><div class="pending-value">—</div><div class="pending-label">Vendues · ' + store.label + '</div><div class="pending-note">à connecter</div></div>' +
        '<div class="pending-card"><div class="pending-value">—</div><div class="pending-label">En transit</div><div class="pending-note">à connecter</div></div>';
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
    mRenderStatCarousel();
    mRenderStoreSegmented();
    mRenderStoreDetail();
    if (document.querySelector('#desktopShell .sidebar-menu .menu-item.active')?.dataset.page === 'lunettes') {
        dRenderGlobalStats();
        dRenderStorePicker();
        dRenderStoreDetail();
    }
});

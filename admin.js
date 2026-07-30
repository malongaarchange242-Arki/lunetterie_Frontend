// ============================
// DATA
// ============================
const API_URL = 'https://api-lunetterie.universearch.com/api/v1';
let employees = [];
let stationsList = [];

function stationNameById(id) {
    const station = stationsList.find(s => s.id === Number(id));
    return station ? station.name : 'Non assigné';
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
    const posteSelect = document.getElementById('poste');
    if (posteSelect) {
        posteSelect.innerHTML = `<option value="">Sélectionner</option>` +
            stationsList.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    const filterPoste = document.getElementById('filterPoste');
    if (filterPoste) {
        filterPoste.innerHTML = `<option value="all">Tous les postes</option>` +
            stationsList.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    }
}

const roles = [
    { id: 1, name: 'SUPER_ADMIN', label: 'Super administrateur' },
    { id: 2, name: 'ADMIN', label: 'Administrateur' },
    { id: 3, name: 'MAGASINIER', label: 'Magasinier' },
    { id: 4, name: 'VENDEUR', label: 'Vendeur' },
    { id: 5, name: 'LABORATOIRE', label: 'Laboratoire' },
    { id: 6, name: 'RESPONSABLE_STATION', label: 'Responsable de station' }
];

const roleNameToId = Object.fromEntries(roles.map(role => [role.name, role.id]));
const roleIdToName = Object.fromEntries(roles.map(role => [role.id, role.name]));
const roleLabels = Object.fromEntries(roles.map(role => [role.name, role.label]));

function getRoleName(user) {
    return user.role_name || roleIdToName[user.role_id] || 'ADMIN';
}

function formatRole(roleName) {
    return roleLabels[roleName] || roleName || 'Administrateur';
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
            }));
        } else {
            console.error('Réponse inattendue /auth/users', json);
        }
    } catch (error) {
        console.error('Erreur réseau lors du chargement des utilisateurs', error);
    }
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
        alert("❌ Ce navigateur ne supporte pas WebAuthn / Windows Hello. Utilisez Edge ou Chrome sur Windows 10/11 avec un lecteur d'empreinte.");
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
    return `<span class="poste-badge">📍 ${poste || 'Non assigné'}</span>`;
}

function renderFingerprintBadge(emp) {
    if (emp.fingerprint?.enrolled) {
        return `<span class="fingerprint-badge enrolled"><svg class="i"><use href="#ic-check-circle"/></svg> Enregistrée</span>`;
    }
    return `<span class="fingerprint-badge not-enrolled"><svg class="i"><use href="#ic-exclamation-circle"/></svg> Non enregistrée</span>`;
}

function renderRecentEmployees() {
    const tbody = document.getElementById('recentEmployeesTable');
    const recent = employees.filter(e => e.status === 'Actif').slice(0, 4);
    if (!recent.length) {
        tbody.innerHTML =
            `<tr><td colspan="7" class="empty-state"><svg class="i" style="font-size:32px;"><use href="#ic-users"/></svg><p>Aucun employé actif</p></td></tr>`;
        return;
    }
    tbody.innerHTML = recent.map(e => `
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
                    <td>${formatRole(e.role)}</td>
                    <td>${renderPosteBadge(e.poste)}</td>
                    <td>${renderFingerprintBadge(e)}</td>
                    <td><span class="status-badge ${e.status === 'Actif' ? 'active' : 'inactive'}"><span class="dot"></span>${e.status}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="view" onclick="viewEmployee('${e.id}')" title="Voir"><svg class="i"><use href="#ic-eye"/></svg></button>
                            <button class="edit" onclick="editEmployee('${e.id}')" title="Modifier"><svg class="i"><use href="#ic-pencil"/></svg></button>
                            <button class="fingerprint-btn" onclick="openFingerprintModal('${e.id}')" title="Empreinte"><svg class="i"><use href="#ic-fingerprint"/></svg></button>
                            <button class="delete" onclick="deleteEmployee('${e.id}')" title="Supprimer"><svg class="i"><use href="#ic-trash"/></svg></button>
                        </div>
                    </td>
                </tr>
            `).join('');
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
        const matchSearch = e.fullName.toLowerCase().includes(search) ||
            e.phone.includes(search) ||
            e.email.toLowerCase().includes(search);
        return matchRole && matchPoste && matchStatus && matchFp && matchSearch;
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
                            <button class="fingerprint-btn" onclick="openFingerprintModal('${e.id}')" title="Empreinte"><svg class="i"><use href="#ic-fingerprint"/></svg></button>
                            <button class="delete" onclick="deleteEmployee('${e.id}')" title="Supprimer"><svg class="i"><use href="#ic-trash"/></svg></button>
                        </div>
                    </td>
                </tr>
            `).join('');
}

function renderMontures() {
    const tbody = document.getElementById('monturesTable');
    const marqueFilter = document.getElementById('filterMarque').value;
    const genreFilter = document.getElementById('filterGenreMonture').value;
    const formeFilter = document.getElementById('filterForme').value;
    const search = document.getElementById('montureSearch').value.toLowerCase();

    let filtered = montures.filter(m => {
        const matchMarque = marqueFilter === 'all' || m.marque === marqueFilter;
        const matchGenre = genreFilter === 'all' || m.genre === genreFilter;
        const matchForme = formeFilter === 'all' || m.forme === formeFilter;
        const matchSearch = m.reference.toLowerCase().includes(search) ||
            m.marque.toLowerCase().includes(search);
        return matchMarque && matchGenre && matchForme && matchSearch;
    });

    document.getElementById('montureCount').textContent = `${filtered.length} montures`;

    if (!filtered.length) {
        tbody.innerHTML =
            `<tr><td colspan="9" class="empty-state"><svg class="i" style="font-size:32px;"><use href="#ic-glasses"/></svg><p>Aucune monture trouvée</p></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(m => `
                <tr>
                    <td><strong>${m.reference}</strong></td>
                    <td>${m.marque}</td>
                    <td>${m.genre}</td>
                    <td>${m.couleur}</td>
                    <td>${m.forme}</td>
                    <td>${m.stockGeneral}</td>
                    <td>${m.stockLocal}</td>
                    <td>${m.presentoir}</td>
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
    const active = employees.filter(e => e.status === 'Actif').length;
    const enrolled = employees.filter(e => e.fingerprint?.enrolled).length;
    const stations = new Set(employees.map(e => e.poste)).size;

    document.getElementById('statEmployees').textContent = active;
    document.getElementById('statFingerprints').textContent = enrolled;
    document.getElementById('statStations').textContent = stations;
    document.getElementById('employeeBadge').textContent = employees.length;
}

function updateAll() {
    renderRecentEmployees();
    renderEmployees();
    renderMontures();
    updateStats();
    aRenderDashboard();
    aRenderEmployeesList();
    aRenderMonturesList();
}

// ============================
// VUE MOBILE (consultation seule)
// ============================
function aRenderDashboard() {
    const active = employees.filter(e => e.status === 'Actif').length;
    const enrolled = employees.filter(e => e.fingerprint?.enrolled).length;
    const stations = new Set(employees.map(e => e.poste)).size;

    const tiles = [
        { icon: 'ic-users', color: 'blue', value: active, label: 'Employés actifs' },
        { icon: 'ic-glasses', color: 'gold', value: montures.length, label: 'Montures en stock' },
        { icon: 'ic-map-pin', color: 'orange', value: stations, label: 'Stations actives' },
        { icon: 'ic-fingerprint', color: 'purple', value: enrolled, label: 'Empreintes enregistrées' }
    ];
    document.getElementById('aStatCarousel').innerHTML = tiles.map(t => `
        <div class="stat-tile-m">
            <div class="stat-icon-m ${t.color}"><svg class="i"><use href="#${t.icon}"/></svg></div>
            <div class="stat-value-m">${t.value}</div>
            <div class="stat-label-m">${t.label}</div>
        </div>
    `).join('');

    const recent = employees.filter(e => e.status === 'Actif').slice(0, 4);
    const recentContainer = document.getElementById('aRecentEmployeesList');
    if (recentContainer) {
        recentContainer.innerHTML = recent.length
            ? recent.map(e => aEmployeeCardHtml(e)).join('')
            : '<p class="mobile-empty">Aucun employé actif</p>';
        document.querySelectorAll('#aRecentEmployeesList [data-emp-id]').forEach(card => {
            card.addEventListener('click', () => aOpenEmployeeSheet(card.dataset.empId));
        });
    }
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

function aRenderEmployeesList() {
    const search = (document.getElementById('aEmployeeSearch')?.value || '').toLowerCase();
    const filtered = employees.filter(e =>
        e.fullName.toLowerCase().includes(search) ||
        e.phone.includes(search) ||
        e.email.toLowerCase().includes(search)
    );
    document.getElementById('aEmployeesList').innerHTML = filtered.length
        ? filtered.map(e => aEmployeeCardHtml(e)).join('')
        : '<p class="mobile-empty">Aucun employé trouvé</p>';
    document.querySelectorAll('#aEmployeesList [data-emp-id]').forEach(card => {
        card.addEventListener('click', () => aOpenEmployeeSheet(card.dataset.empId));
    });
}

function aMontureCardHtml(m) {
    return `<button class="mobile-card" type="button" data-monture-id="${m.id}">
        <span class="card-icon"><svg class="i"><use href="#ic-glasses"/></svg></span>
        <span class="card-text">
            <h4>${m.marque} — ${m.reference}</h4>
            <p>${m.genre} · ${m.couleur} · ${m.forme}</p>
            <span class="card-badges"><span class="poste-badge">Gén. ${m.stockGeneral}</span><span class="poste-badge">Loc. ${m.stockLocal}</span><span class="poste-badge presentoir">Prés. ${m.presentoir}</span></span>
        </span>
        <span class="card-chevron"><svg class="i"><use href="#ic-arrow-right"/></svg></span>
    </button>`;
}

function aRenderMonturesList() {
    const search = (document.getElementById('aMontureSearch')?.value || '').toLowerCase();
    const filtered = montures.filter(m =>
        m.reference.toLowerCase().includes(search) ||
        m.marque.toLowerCase().includes(search)
    );
    document.getElementById('aMonturesList').innerHTML = filtered.length
        ? filtered.map(m => aMontureCardHtml(m)).join('')
        : '<p class="mobile-empty">Aucune monture trouvée</p>';
    document.querySelectorAll('#aMonturesList [data-monture-id]').forEach(card => {
        card.addEventListener('click', () => aOpenMontureSheet(card.dataset.montureId));
    });
}

function aRenderStock() {
    const tiles = [
        { icon: 'ic-warehouse', color: 'blue', value: 87, label: 'Stock Général' },
        { icon: 'ic-store', color: 'gold', value: 23, label: 'Stock Local' },
        { icon: 'ic-tshirt', color: 'orange', value: 14, label: 'Présentoir' },
        { icon: 'ic-exclamation-triangle', color: 'red', value: 3, label: 'Alertes stock critique' }
    ];
    document.getElementById('aStockGrid').innerHTML = tiles.map(t => `
        <div class="mini-tile">
            <div class="mini-icon ${t.color}"><svg class="i"><use href="#${t.icon}"/></svg></div>
            <div class="mini-value">${t.value}</div>
            <div class="mini-label">${t.label}</div>
        </div>
    `).join('');
}

function aRenderPlus() {
    const items = [
        { icon: 'ic-sliders', title: 'Paramètres', desc: "Configuration de l'application.", sheetTitle: 'Paramètres' },
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
    aOpenSheet(emp.fullName, buildEmployeeDetailBody(emp));
}
function aOpenMontureSheet(id) {
    const m = montures.find(m => m.id === id);
    if (!m) return;
    aOpenSheet(`${m.marque} — ${m.reference}`, buildMontureDetailBody(m));
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
    document.getElementById('aTopbarTitle').textContent = A_TAB_TITLES[tab] || A_TAB_TITLES.dashboard;
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

    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    const titles = {
        'dashboard': { title: 'Tableau de bord', sub: 'Bienvenue sur votre espace d\'administration Pro' },
        'employees': { title: '👥 Gestion des employés', sub: 'Gérez les comptes, rôles, postes et empreintes' },
        'montures': { title: '🕶️ Catalogue des montures', sub: 'Gérez votre inventaire de montures' },
        'stock': { title: '📦 Gestion du stock', sub: 'Stock général, local et présentoir' },
        'settings': { title: '⚙️ Paramètres', sub: 'Configuration de l\'application' },
        'rapports': { title: '📊 Rapports', sub: 'Statistiques et analyses avancées' }
    };

    const info = titles[page] || titles['dashboard'];
    document.getElementById('pageTitle').textContent = info.title;
    document.getElementById('pageSubtitle').textContent = info.sub;

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
        statusText.textContent = '✅ Empreinte enregistrée';
        statusSub.textContent = `Enregistrée le ${fpState.date || 'date inconnue'}`;
        startBtn.textContent = '🔄 Re-scanner';
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
        startBtn.textContent = '📱 Démarrer le scan';
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
            alert('❌ ' + (error.message || "Échec de l'enregistrement de l'empreinte"));
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
        alert('✅ Empreinte enregistrée avec succès en base de données !');
    } catch (error) {
        console.error("Erreur enrôlement empreinte (employé existant)", error);
        if (error?.name !== 'AbortError') {
            alert('❌ ' + (error.message || "Échec de l'enregistrement de l'empreinte"));
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
    if (!confirm('⚠️ Êtes-vous sûr de vouloir supprimer cette empreinte digitale ?')) return;
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
    alert('🗑️ Empreinte supprimée');
}

function openFingerprintModal(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    openModal('✏️ Modifier l\'employé - Empreinte', emp);
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
    const stationIdRaw = document.getElementById('poste').value;
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
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

function deleteEmployee(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet employé ?')) {
        employees = employees.filter(e => e.id !== id);
        updateAll();
    }
}

// ============================
// MONTURE ACTIONS
// ============================
function buildMontureDetailBody(m) {
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
                <div class="detail-item"><div class="detail-label">Emplacement</div><div class="detail-value">${m.emplacement}</div></div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Stock</div>
            <div class="detail-grid">
                <div class="detail-item"><div class="detail-label">Stock général</div><div class="detail-value">${m.stockGeneral}</div></div>
                <div class="detail-item"><div class="detail-label">Stock local</div><div class="detail-value">${m.stockLocal}</div></div>
                <div class="detail-item"><div class="detail-label">Présentoir</div><div class="detail-value">${m.presentoir}</div></div>
                <div class="detail-item"><div class="detail-label">Seuil d'alerte</div><div class="detail-value">${m.seuil}</div></div>
            </div>
        </div>
    `;
}

function viewMonture(id) {
    const m = montures.find(m => m.id === id);
    if (!m) return;
    openViewModal('Fiche monture', 'ic-glasses', buildMontureDetailBody(m));
}

function deleteMonture(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette monture ?')) {
        montures = montures.filter(m => m.id !== id);
        updateAll();
    }
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

    // Vue mobile
    aRenderStock();
    aRenderPlus();
    document.getElementById('aThemeToggle').addEventListener('click', toggleTheme);
    document.querySelectorAll('#aTabBar .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => aSwitchTab(btn.dataset.tab));
    });
    document.getElementById('aEmployeeSearch').addEventListener('input', aRenderEmployeesList);
    document.getElementById('aMontureSearch').addEventListener('input', aRenderMonturesList);
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

    // Save
    document.getElementById('saveEmployee').addEventListener('click', saveEmployee);

    // Filters
    document.getElementById('filterRole').addEventListener('change', renderEmployees);
    document.getElementById('filterPoste').addEventListener('change', renderEmployees);
    document.getElementById('filterStatus').addEventListener('change', renderEmployees);
    document.getElementById('filterFingerprint').addEventListener('change', renderEmployees);
    document.getElementById('employeeSearch').addEventListener('input', renderEmployees);

    document.getElementById('filterMarque').addEventListener('change', renderMontures);
    document.getElementById('filterGenreMonture').addEventListener('change', renderMontures);
    document.getElementById('filterForme').addEventListener('change', renderMontures);
    document.getElementById('montureSearch').addEventListener('input', renderMontures);

    document.getElementById('viewAllEmployees').addEventListener('click', function() { navigateTo('employees'); });

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
    updateAll();
    navigateTo('dashboard');

    console.log('🕶️ Lunetterie - Prêt !');
    console.log(`👥 ${employees.length} employés chargés`);
    console.log(`🕶️ ${montures.length} montures en catalogue`);
    console.log(`👆 ${employees.filter(e => e.fingerprint?.enrolled).length} empreintes enregistrées`);
});

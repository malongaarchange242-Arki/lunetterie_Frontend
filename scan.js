/* ==========================================================================
   SCAN.JS — Enregistrement Monture
   ========================================================================== */

// ============================
// ÉTAT GLOBAL
// ============================
let stream1 = null, stream2 = null;
let isCameraActive1 = false, isCameraActive2 = false;
let currentStep = 1;

let photoMontureData = null;
let photoBrancheData = null;

let detectionMonture = {};
let detectionBranche = {};
let aiMountType = null;

let finalMontureData = null;

// ============================
// BACKEND
// ============================
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://api-lunetterie.universearch.com/api/v1'
    : 'https://api-lunetterie.universearch.com/api/v1';
// Aucun sélecteur de station dans cette page : on réceptionne toujours au Stock Général.
const DEFAULT_STATION_ID = '1';

function dataURLtoBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

// ============================
// RÉFÉRENCES DOM — ÉTAPE 1
// ============================
const video1 = document.getElementById('video1');
const cameraPlaceholder1 = document.getElementById('cameraPlaceholder1');
const detectionOverlay1 = document.getElementById('detectionOverlay1');
const capturedPreview1 = document.getElementById('capturedPreview1');
const startCamera1 = document.getElementById('startCamera1');
const stopCamera1 = document.getElementById('stopCamera1');
const captureBtn1 = document.getElementById('captureBtn1');
const retakeBtn1 = document.getElementById('retakeBtn1');
const validateStep1 = document.getElementById('validateStep1');
const cameraInfo1 = document.getElementById('cameraInfo1');
// My records modal
const viewMyRecordsBtn = document.getElementById('viewMyRecordsBtn');
const myRecordsModal = document.getElementById('myRecordsModal');
const myRecordsContent = document.getElementById('myRecordsContent');
const closeMyRecordsModal = document.getElementById('closeMyRecordsModal');
const myRecordsCloseBtn = document.getElementById('myRecordsCloseBtn');

// ============================
// RÉFÉRENCES DOM — ÉTAPE 2
// ============================
const video2 = document.getElementById('video2');
const cameraPlaceholder2 = document.getElementById('cameraPlaceholder2');
const detectionOverlay2 = document.getElementById('detectionOverlay2');
const capturedPreview2 = document.getElementById('capturedPreview2');
const startCamera2 = document.getElementById('startCamera2');
const stopCamera2 = document.getElementById('stopCamera2');
const captureBtn2 = document.getElementById('captureBtn2');
const retakeBtn2 = document.getElementById('retakeBtn2');
const validateStep2 = document.getElementById('validateStep2');
const cameraInfo2 = document.getElementById('cameraInfo2');

// ============================
// RÉFÉRENCES DOM — ÉTAPE 3
// ============================
const verifRef = document.getElementById('verifRef');
const verifMarque = document.getElementById('verifMarque');
const verifGenre = document.getElementById('verifGenre');
const verifForme = document.getElementById('verifForme');
const verifCouleur = document.getElementById('verifCouleur');
const verifTaille = document.getElementById('verifTaille');
const verifMatiere = document.getElementById('verifMatiere');
const verifPrix = document.getElementById('verifPrix');
const verifPrixCustom = document.getElementById('verifPrixCustom');
const verifMontureImg = document.getElementById('verifMontureImg');
const verifBrancheImg = document.getElementById('verifBrancheImg');
const validateStep3 = document.getElementById('validateStep3');

function updatePrixCustomVisibility() {
    if (!verifPrix || !verifPrixCustom) return;
    const isLuxe = verifPrix.value === 'luxe';
    verifPrixCustom.style.display = isLuxe ? 'block' : 'none';
    if (!isLuxe) {
        verifPrixCustom.value = '';
        verifPrixCustom.closest('.field').style.borderColor = '';
    }
}

function getPrixFinalValue() {
    if (verifPrix && verifPrix.value === 'luxe' && verifPrixCustom && verifPrixCustom.value.trim()) {
        const numeric = Number(verifPrixCustom.value.trim());
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    }
    return normalizePriceValue(verifPrix ? verifPrix.value : '');
}

// ============================
// SÉLECTEURS VISUELS — FORME & COULEUR
// (aident à choisir la forme/couleur réelle : sert aussi de donnée corrigée
// pour l'entraînement du modèle de reconnaissance IA)
// ============================
const shapeOptButtons = document.querySelectorAll('#formePicker .shape-opt');
const colorOptButtons = document.querySelectorAll('#couleurPicker .color-opt');
const formeSrcTag = document.getElementById('formeSrcTag');
const couleurSrcTag = document.getElementById('couleurSrcTag');

function normalizeColorValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.toLowerCase();
    const map = {
        'noir': 'Noir', 'black': 'Noir',
        'marron': 'Marron', 'brown': 'Marron', 'brun': 'Marron',
        'bleu': 'Bleu', 'blue': 'Bleu',
        'rouge': 'Rouge', 'red': 'Rouge',
        'vert': 'Vert', 'green': 'Vert',
        'gris': 'Gris', 'gray': 'Gris', 'grey': 'Gris',
        'blanc': 'Blanc', 'white': 'Blanc',
        'doré': 'Doré', 'dore': 'Doré', 'gold': 'Doré', 'or': 'Doré',
        'argenté': 'Argenté', 'argente': 'Argenté', 'silver': 'Argenté', 'argent': 'Argenté',
        'violet': 'Violet', 'purple': 'Violet',
        'jaune': 'Jaune', 'yellow': 'Jaune',
        'orange': 'Orange',
        'rose': 'Rose', 'pink': 'Rose',
        'beige': 'Beige', 'cream': 'Beige',
        'transparent': 'Transparent',
        'écaille': 'Écaille', 'ecaille': 'Écaille', 'tortoise': 'Écaille',
        'multicolore': 'Multicolore', 'multicolor': 'Multicolore', 'multicolored': 'Multicolore',
        'bronze': 'Bronze',
        'cuivré': 'Cuivré', 'cuivre': 'Cuivré'
    };
    return map[normalized] || raw;
}

function syncFormePicker() {
    shapeOptButtons.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === verifForme.value);
        btn.classList.toggle('detected', !!detectionMonture.forme && btn.dataset.value === detectionMonture.forme);
    });
}
function syncCouleurPicker() {
    const normalized = normalizeColorValue(verifCouleur.value);
    if (normalized && verifCouleur.value !== normalized) {
        verifCouleur.value = normalized;
    }
    colorOptButtons.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === normalized);
    });
}

// ============================
// RÉFÉRENCES DOM — ÉTAPE 4
// ============================
const locationCodeFinal = document.getElementById('locationCodeFinal');
const locRayonFinal = document.getElementById('locRayonFinal');
const locEtagereFinal = document.getElementById('locEtagereFinal');
const locBacFinal = document.getElementById('locBacFinal');
const locPositionFinal = document.getElementById('locPositionFinal');
const finalEmplacement = document.getElementById('finalEmplacement');
const finalQuantite = document.getElementById('finalQuantite');
const finalId = document.getElementById('finalId');
const validateStep4 = document.getElementById('validateStep4');

// ============================
// RÉFÉRENCES DOM — ÉTAPE 5
// ============================
const successMarque = document.getElementById('successMarque');
const successRef = document.getElementById('successRef');
const successId = document.getElementById('successId');
const successLocation = document.getElementById('successLocation');
const successQuantite = document.getElementById('successQuantite');
const successPrix = document.getElementById('successPrix');

// ============================
// RÉFÉRENCES DOM — ÉTIQUETTE / CODE-BARRES
// ============================
const printMarque = document.getElementById('printMarque');
const printRef = document.getElementById('printRef');
const printEmplacement = document.getElementById('printEmplacement');
const printPrix = document.getElementById('printPrix');

// ============================
// RÉFÉRENCES — INDICATEUR D'ÉTAPES
// ============================
const stepNumbers = {
    1: document.getElementById('step1Num'),
    2: document.getElementById('step2Num'),
    3: document.getElementById('step3Num'),
    4: document.getElementById('step4Num'),
    5: document.getElementById('step5Num')
};
const stepLabels = {
    1: document.getElementById('step1Label'),
    2: document.getElementById('step2Label'),
    3: document.getElementById('step3Label'),
    4: document.getElementById('step4Label'),
    5: document.getElementById('step5Label')
};
const stepLines = {
    1: document.getElementById('line1'),
    2: document.getElementById('line2'),
    3: document.getElementById('line3'),
    4: document.getElementById('line4')
};

// ============================
// GESTION DES ÉTAPES
// ============================
function goToStep(step) {
    document.querySelectorAll('.step-panel').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('step' + step);
    if (target) target.classList.add('active');
    currentStep = step;
    updateStepIndicator(step);
}

function updateStepIndicator(step) {
    for (let i = 1; i <= 5; i++) {
        const num = stepNumbers[i];
        const label = stepLabels[i];
        num.className = 'number';
        label.className = 'label';

        if (i < step) {
            num.classList.add('done');
            num.innerHTML = '<svg class="i"><use href="#ic-check"/></svg>';
            label.classList.add('done');
        } else if (i === step) {
            num.classList.add('active');
            num.textContent = i;
            label.classList.add('active');
        } else {
            num.textContent = i;
        }
    }
    for (let i = 1; i <= 4; i++) {
        stepLines[i].classList.toggle('done', i < step);
    }
}

// ============================
// CAMÉRA — ÉTAPE 1
// ============================
async function startCamera1Fn() {
    try {
        stream1 = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video1.srcObject = stream1;
        await video1.play();
        isCameraActive1 = true;
        cameraPlaceholder1.style.display = 'none';
        video1.style.display = 'block';
        detectionOverlay1.classList.add('show');
        startCamera1.style.display = 'none';
        stopCamera1.style.display = 'inline-flex';
        captureBtn1.disabled = false;
        setCameraInfo(cameraInfo1, 'on', 'En direct');
    } catch (err) {
        alert("Impossible d'accéder à la caméra.");
        setCameraInfo(cameraInfo1, 'off', 'Erreur');
    }
}

function stopCamera1Fn() {
    if (stream1) { stream1.getTracks().forEach(t => t.stop()); stream1 = null; }
    video1.srcObject = null;
    video1.style.display = 'none';
    detectionOverlay1.classList.remove('show');
    cameraPlaceholder1.style.display = 'flex';
    isCameraActive1 = false;
    startCamera1.style.display = 'inline-flex';
    stopCamera1.style.display = 'none';
    captureBtn1.disabled = true;
    setCameraInfo(cameraInfo1, 'off', 'Arrêtée');
}

function captureImage1() {
    if (!isCameraActive1) { alert('Démarrez la caméra.'); return; }
    photoMontureData = snapshotToDataUrl(video1);

    capturedPreview1.src = photoMontureData;
    capturedPreview1.classList.add('show');
    video1.style.display = 'none';
    detectionOverlay1.classList.remove('show');
    captureBtn1.style.display = 'none';
    retakeBtn1.style.display = 'inline-flex';
    validateStep1.disabled = false;
    setCameraInfo(cameraInfo1, 'on', 'Photo prise !');

    detectMonture();
}

function retakePhoto1() {
    capturedPreview1.classList.remove('show');
    video1.style.display = 'block';
    detectionOverlay1.classList.add('show');
    captureBtn1.style.display = 'inline-flex';
    retakeBtn1.style.display = 'none';
    validateStep1.disabled = true;
    photoMontureData = null;
    setCameraInfo(cameraInfo1, 'on', 'Prêt');
}

// ============================
// CAMÉRA — ÉTAPE 2
// ============================
async function startCamera2Fn() {
    try {
        stream2 = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video2.srcObject = stream2;
        await video2.play();
        isCameraActive2 = true;
        cameraPlaceholder2.style.display = 'none';
        video2.style.display = 'block';
        detectionOverlay2.classList.add('show');
        startCamera2.style.display = 'none';
        stopCamera2.style.display = 'inline-flex';
        captureBtn2.disabled = false;
        setCameraInfo(cameraInfo2, 'on', 'En direct');
    } catch (err) {
        alert("Impossible d'accéder à la caméra.");
        setCameraInfo(cameraInfo2, 'off', 'Erreur');
    }
}

function stopCamera2Fn() {
    if (stream2) { stream2.getTracks().forEach(t => t.stop()); stream2 = null; }
    video2.srcObject = null;
    video2.style.display = 'none';
    detectionOverlay2.classList.remove('show');
    cameraPlaceholder2.style.display = 'flex';
    isCameraActive2 = false;
    startCamera2.style.display = 'inline-flex';
    stopCamera2.style.display = 'none';
    captureBtn2.disabled = true;
    setCameraInfo(cameraInfo2, 'off', 'Arrêtée');
}

function captureImage2() {
    if (!isCameraActive2) { alert('Démarrez la caméra.'); return; }
    photoBrancheData = snapshotToDataUrl(video2);

    capturedPreview2.src = photoBrancheData;
    capturedPreview2.classList.add('show');
    video2.style.display = 'none';
    detectionOverlay2.classList.remove('show');
    captureBtn2.style.display = 'none';
    retakeBtn2.style.display = 'inline-flex';
    validateStep2.disabled = false;
    setCameraInfo(cameraInfo2, 'on', 'Photo prise !');

    detectBranche();
}

function retakePhoto2() {
    capturedPreview2.classList.remove('show');
    video2.style.display = 'block';
    detectionOverlay2.classList.add('show');
    captureBtn2.style.display = 'inline-flex';
    retakeBtn2.style.display = 'none';
    validateStep2.disabled = true;
    photoBrancheData = null;
    setCameraInfo(cameraInfo2, 'on', 'Prêt');
}

// ============================
// UTILITAIRES CAMÉRA
// ============================
function snapshotToDataUrl(videoEl) {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
}

function setCameraInfo(el, state, text) {
    el.innerHTML = `<span class="dot-indicator ${state}"></span> ${text}`;
}

// Load user's records (glasses with status EN_STOCK_GENERAL)
async function loadMyRecords() {
    myRecordsContent.innerHTML = '<p class="empty-history">Chargement…</p>';
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        if (!token || !user) { myRecordsContent.innerHTML = '<p class="empty-history">Authentification requise.</p>'; return; }
        // Assume user's station_id is where they register; fetch glasses for station 1 (Stock Général)
        const stationId = DEFAULT_STATION_ID;
        const res = await fetch(`${API_URL}/inventory/glasses?station_id=${stationId}&status=EN_STOCK_GENERAL`, { headers: { 'Authorization': `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) { myRecordsContent.innerHTML = '<p class="empty-history">Aucune monture trouvée.</p>'; return; }
        const items = json.data.glasses || [];
        if (!items.length) {
            myRecordsContent.innerHTML = '<div class="send-empty"><svg class="i"><use href="#ic-glasses"/></svg><p>Aucune monture en Stock Général.</p></div>';
            return;
        }
        const rows = items.map(function (g) {
            return '<tr>' +
                '<td>' + escapeHtml(g.barcode) + '</td>' +
                '<td>' + escapeHtml(g.brand || '—') + '</td>' +
                '<td>' + escapeHtml(g.reference || '—') + '</td>' +
                '<td>' + escapeHtml([g.gender, g.shape, g.color].filter(Boolean).join(' · ') || '—') + '</td>' +
                '</tr>';
        }).join('');
        myRecordsContent.innerHTML = '<div class="send-table-wrap"><table class="send-table"><thead><tr><th>Code-barres</th><th>Marque</th><th>Référence</th><th>Détails</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    } catch (err) {
        console.error('Erreur chargement enregistrements', err);
        myRecordsContent.innerHTML = '<p class="empty-history">Erreur de chargement.</p>';
    }
}

function openMyRecordsModal() { myRecordsModal.classList.add('show'); loadMyRecords(); }
function closeMyRecordsModalFn() { myRecordsModal.classList.remove('show'); }

// ============================
// ANALYSE IA (détection + classification, service Python/YOLO)
// ============================
async function detectMonture() {
    verifMontureImg.src = photoMontureData;
    verifMontureImg.style.display = 'block';
    document.querySelector('#previewMonture .placeholder').style.display = 'none';

    const pill = document.querySelector('#step3 .pill');
    const originalPillText = pill ? pill.textContent : '';

    const token = localStorage.getItem('token');
    if (!token) return;

    if (pill) pill.textContent = 'Analyse IA en cours...';

    try {
        const formData = new FormData();
        formData.append('image', dataURLtoBlob(photoMontureData), 'monture.jpg');

        const response = await fetch(`${API_URL}/inventory/analyze`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
            throw new Error(json?.error || `Erreur serveur (${response.status})`);
        }

        const a = json.data;
        detectionMonture = { forme: a.shape, couleur: a.color, matiere: a.material };
        if (a.shape) verifForme.value = a.shape;
        if (a.color) {
            const detectedColor = normalizeColorValue(a.color);
            verifCouleur.value = detectedColor;
            if (couleurSrcTag) {
                couleurSrcTag.textContent = 'Détecté';
                couleurSrcTag.className = 'src-tag detected';
            }
        }
        if (a.material) verifMatiere.value = a.material;
        aiMountType = a.mount_type || null;
        syncFormePicker();
        syncCouleurPicker();

        console.log('🧠 Analyse IA :', a);
    } catch (err) {
        console.warn('Analyse IA indisponible, saisie manuelle requise :', err);
    } finally {
        if (pill) pill.textContent = originalPillText;
    }
}

function detectBranche() {
    verifBrancheImg.src = photoBrancheData;
    verifBrancheImg.style.display = 'block';
    document.querySelector('#previewBranche .placeholder').style.display = 'none';
}

// ============================
// EMPLACEMENT — prochain emplacement libre réel (base de données)
// ============================
// Interroge le backend pour connaître le vrai prochain emplacement libre en zone STOCK,
// sans le réserver (aperçu uniquement). L'emplacement réellement attribué à l'enregistrement
// peut différer si un autre enregistrement concurrent le prend entre-temps.
async function fetchNextFreeLocation() {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/inventory/storage/next-free?station_id=${DEFAULT_STATION_ID}&zone=STOCK`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
        throw new Error(json?.error || `Erreur serveur (${response.status})`);
    }

    const code = json.data.code;
    const match = /^RAYON-(\w+)-ETA-(\d+)-BAC-(\w+)-POS-(\d+)$/.exec(code) || [];
    return {
        code,
        rayon: match[1] || '—',
        etagere: match[2] ? Number(match[2]) : '—',
        bac: match[3] || '—',
        position: match[4] ? Number(match[4]) : '—'
    };
}

// ============================
// VALIDATION — ÉTAPE 1
// ============================
function validateStep1Fn() {
    if (!photoMontureData) { alert('Veuillez prendre une photo de la monture.'); return; }
    stopCamera1Fn();
    goToStep(2);
    setTimeout(startCamera2Fn, 400);
}

// ============================
// VALIDATION — ÉTAPE 2
// ============================
function validateStep2Fn() {
    if (!photoBrancheData) { alert('Veuillez prendre une photo de la branche.'); return; }
    stopCamera2Fn();
    goToStep(3);
}

// ============================
// VALIDATION — ÉTAPE 3
// ============================
function normalizePriceValue(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const trimmed = String(value).trim();
    if (!trimmed) return 0;

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
        return numeric;
    }

    const labels = {
        classique: 70000,
        'moyenne gamme': 90000
    };

    const normalized = trimmed.toLowerCase();
    if (labels[normalized] !== undefined) {
        return labels[normalized];
    }

    if (normalized === 'luxe') {
        // Price for luxe must be entered manually by the user.
        return 0;
    }

    return 0;
}

async function validateStep3Fn() {
    const fields = [verifRef, verifMarque, verifGenre, verifForme, verifCouleur, verifTaille, verifPrix];
    let missing = false;
    fields.forEach(f => {
        if (!f.value.trim()) {
            f.closest('.field').style.borderColor = 'var(--danger)';
            missing = true;
        } else {
            f.closest('.field').style.borderColor = '';
        }
    });

    if (verifPrix && verifPrix.value === 'luxe') {
        if (!verifPrixCustom || !verifPrixCustom.value.trim() || !Number.isFinite(Number(verifPrixCustom.value.trim())) || Number(verifPrixCustom.value.trim()) <= 0) {
            if (verifPrixCustom) verifPrixCustom.closest('.field').style.borderColor = 'var(--danger)';
            missing = true;
        } else {
            if (verifPrixCustom) verifPrixCustom.closest('.field').style.borderColor = '';
        }
    }

    if (missing) {
        alert('Veuillez remplir tous les champs obligatoires.');
        return;
    }

    const originalLabel = validateStep3.innerHTML;
    validateStep3.disabled = true;
    validateStep3.innerHTML = 'Recherche de l\'emplacement...';

    let location;
    try {
        location = await fetchNextFreeLocation();
    } catch (err) {
        console.error('Erreur récupération emplacement libre', err);
        alert("Impossible de trouver un emplacement libre en stock : " + (err.message || 'erreur inconnue'));
        return;
    } finally {
        validateStep3.disabled = false;
        validateStep3.innerHTML = originalLabel;
    }

    const id = 'MNT-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');

    finalMontureData = {
        id,
        reference: verifRef.value.trim(),
        marque: verifMarque.value.trim(),
        genre: verifGenre.value,
        forme: verifForme.value,
        couleur: verifCouleur.value,
        taille: verifTaille.value.trim(),
        matiere: verifMatiere.value,
        prix: getPrixFinalValue(),
        quantite: 1,
        emplacement: location.code,
        location,
        photoMonture: photoMontureData,
        photoBranche: photoBrancheData,
        dateCreation: new Date().toISOString()
    };
    locationCodeFinal.textContent = location.code;
    locRayonFinal.textContent = `Rayon ${location.rayon}`;
    locEtagereFinal.textContent = `Étagère ${location.etagere}`;
    locBacFinal.textContent = `Bac ${location.bac}`;
    locPositionFinal.textContent = `Position ${location.position}`;
    finalEmplacement.textContent = location.code;
    finalQuantite.textContent = '1';
    finalId.textContent = id;

    goToStep(4);
}

// ============================
// COPIE DU CODE EMPLACEMENT
// ============================
function copyFinalCode() {
    const code = locationCodeFinal.textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector('.code-box .copy-btn');
        const original = btn.innerHTML;
        btn.innerHTML = '<svg class="i"><use href="#ic-check"/></svg> Copié !';
        setTimeout(() => { btn.innerHTML = original; }, 2000);
    }).catch(() => {
        alert('Code : ' + code);
    });
}

// ============================
// CODE-BARRES — aperçu + étiquette d'impression
// ============================
function renderBarcode(target, value) {
    if (typeof JsBarcode === 'undefined' || !value) return;
    JsBarcode(target, value, {
        format: 'CODE128',
        lineColor: '#0f172a',
        background: '#ffffff',
        width: 2,
        height: 46,
        fontSize: 13,
        margin: 8,
        displayValue: true
    });
}

// ============================
// VALIDATION — ÉTAPE 4 (ENREGISTREMENT)
// ============================
async function validateStep4Fn() {
    if (!finalMontureData) { alert('Erreur : données manquantes.'); return; }
    if (!activeReceptionSession || Number(activeReceptionSession.registered || 0) >= Number(activeReceptionSession.target || 0)) {
        alert('La session est absente ou son quota est atteint. Activez une nouvelle session avant de continuer.');
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        alert("Vous devez être connecté (scannez votre empreinte sur la page de connexion) pour enregistrer une monture.");
        window.location.href = 'index.html';
        return;
    }

    validateStep4.disabled = true;
    const originalLabel = validateStep4.innerHTML;
    validateStep4.innerHTML = '<svg class="i"><use href="#ic-save"/></svg> Enregistrement en cours...';

    try {
        const formData = new FormData();
        formData.append('image', dataURLtoBlob(finalMontureData.photoMonture), 'monture.jpg');
        formData.append('branche_image', dataURLtoBlob(finalMontureData.photoBranche), 'branche.jpg');
        formData.append('station_id', DEFAULT_STATION_ID);
        formData.append('price', String(finalMontureData.prix));
        formData.append('reference', finalMontureData.reference);
        formData.append('brand', finalMontureData.marque);
        formData.append('gender', finalMontureData.genre);
        formData.append('shape', finalMontureData.forme);
        formData.append('detected_shape', detectionMonture.forme || '');
        formData.append('color', finalMontureData.couleur);
        formData.append('size', finalMontureData.taille);
        formData.append('material', finalMontureData.matiere);
        formData.append('mount_type', aiMountType || '');

        const response = await fetch(`${API_URL}/inventory/reception`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
            throw new Error(json?.error || `Erreur serveur (${response.status})`);
        }

        const data = json.data;
        // On remplace les valeurs prévisualisées (fictives) par les vraies données
        // renvoyées par le backend : code-barres, ID et emplacement réellement enregistrés en base.
        finalMontureData.id = data.barcode;
        finalMontureData.glassId = data.glass_id;
        finalMontureData.emplacement = data.location_code || data.location;
        registerActiveSessionMount();

        console.log('📦 Monture enregistrée en base :', data);

        successMarque.textContent = finalMontureData.marque;
        successRef.textContent = finalMontureData.reference;
        successId.textContent = finalMontureData.id;
        successLocation.textContent = finalMontureData.emplacement;
        successQuantite.textContent = '1';
        successPrix.textContent = finalMontureData.prix || '—';

        // Étiquette d'impression
        printMarque.textContent = finalMontureData.marque;
        printRef.textContent = finalMontureData.reference;
        printEmplacement.textContent = finalMontureData.emplacement;
        printPrix.textContent = finalMontureData.prix || '—';
        renderBarcode('#successBarcode', finalMontureData.id);
        renderBarcode('#printBarcode', finalMontureData.id);

        goToStep(5);
        playSuccessChime();
    } catch (error) {
        console.error('Erreur enregistrement monture', error);
        alert(error.message || "Échec de l'enregistrement de la monture");
    } finally {
        validateStep4.disabled = false;
        validateStep4.innerHTML = originalLabel;
    }
}

function playSuccessChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523, 659, 784];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.value = 0.08;
                osc.start();
                setTimeout(() => osc.stop(), 150);
            }, i * 150);
        });
    } catch (e) { /* audio non disponible */ }
}

// ============================
// IMPRESSION ÉTIQUETTE (avec code-barres)
// ============================
function printEtiquette() {
    if (!finalMontureData) return;
    window.print();
}

// ============================
// RÉINITIALISATION
// ============================
async function resetAll() {
    if (currentStep > 1 && !(await window.showSliderConfirm('Voulez-vous vraiment recommencer ?'))) return;

    stopCamera1Fn();
    stopCamera2Fn();

    photoMontureData = null;
    photoBrancheData = null;
    aiMountType = null;
    detectionMonture = {};
    detectionBranche = {};
    finalMontureData = null;

    capturedPreview1.classList.remove('show');
    capturedPreview1.src = '';
    capturedPreview2.classList.remove('show');
    capturedPreview2.src = '';
    verifMontureImg.style.display = 'none';
    verifBrancheImg.style.display = 'none';
    document.querySelectorAll('#previewMonture .placeholder, #previewBranche .placeholder')
        .forEach(el => el.style.display = 'flex');

    document.querySelectorAll('#verificationDetails input, #verificationDetails select').forEach(el => {
        el.value = '';
        el.closest('.field').style.borderColor = '';
    });
    syncFormePicker();
    syncCouleurPicker();
    if (formeSrcTag) { formeSrcTag.textContent = 'Détecté'; formeSrcTag.className = 'src-tag detected'; }
    if (couleurSrcTag) { couleurSrcTag.textContent = 'Détecté'; couleurSrcTag.className = 'src-tag detected'; }

    validateStep1.disabled = true;
    validateStep2.disabled = true;

    [1, 2].forEach(i => {
        document.getElementById('startCamera' + i).style.display = 'inline-flex';
        document.getElementById('stopCamera' + i).style.display = 'none';
        const capture = document.getElementById('captureBtn' + i);
        capture.disabled = true;
        capture.style.display = 'inline-flex';
        document.getElementById('retakeBtn' + i).style.display = 'none';
        document.getElementById('capturedPreview' + i).classList.remove('show');
        document.getElementById('video' + i).style.display = 'none';
        document.getElementById('cameraPlaceholder' + i).style.display = 'flex';
        document.getElementById('detectionOverlay' + i).classList.remove('show');
    });

    if (!activeReceptionSession || Number(activeReceptionSession.registered || 0) >= Number(activeReceptionSession.target || 0)) {
        activeReceptionSession = null;
        document.getElementById('stepFlow').style.display = 'none';
        document.getElementById('sessionGate').style.display = 'none';
        document.getElementById('sessionActivationGate').style.display = 'block';
        document.getElementById('sessionCodeInput').value = '';
        setSessionActivationStatus('La session est terminée. Scannez une nouvelle étiquette pour continuer.');
        return;
    }

    goToStep(1);
    setTimeout(startCamera1Fn, 400);
}

// ============================
// STOCK (depuis la base) & ENVOI VERS UNE SOUS-STATION
// ============================
let stationsList = [];
let stockItems = [];

async function loadDestinationStations() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_URL}/auth/stations`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!response.ok) {
            console.error('Impossible de charger les stations', response.status);
            return;
        }
        const json = await response.json();
        if (json.success && json.data && Array.isArray(json.data.stations)) {
            // On ne propose pas la station courante (Stock Général) comme destination
            // et on ne garde que les sous-stations dont le nom commence par "station" (insensible à la casse)
            stationsList = json.data.stations.filter(s =>
                String(s.id) !== String(DEFAULT_STATION_ID) &&
                String(s.name || '').toLowerCase().startsWith('station')
            );
        }
    } catch (error) {
        console.error('Erreur réseau lors du chargement des stations', error);
    }

    const options = stationsList.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    destStation.innerHTML = `<option value="">Sélectionner une sous-station</option>${options}`;
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
}

// ============================
// SESSION — page d'accueil affichée à la connexion. Elle capture le nom de
// l'employé et la date du jour, liste ses sessions précédentes (une par jour,
// à partir des réceptions fournisseur enregistrées) et n'ouvre l'assistant
// d'enregistrement que lorsqu'il choisit le bloc du jour.
// ============================
let sessionMovements = [];
let sessionSelectedDate = null;
const RECEPTION_SESSIONS_KEY = 'lunetterie.receptionSessions.v1';
let activeReceptionSession = null;
let sessionScannerStream = null;
let sessionScannerTimer = null;

function getReceptionSessions() {
    try { return JSON.parse(localStorage.getItem(RECEPTION_SESSIONS_KEY) || '[]'); }
    catch (error) { return []; }
}

function saveReceptionSessions(sessions) { localStorage.setItem(RECEPTION_SESSIONS_KEY, JSON.stringify(sessions)); }

function setSessionActivationStatus(message, isError) {
    const status = document.getElementById('sessionActivationStatus');
    const badge = document.getElementById('sessionStateBadge');
    status.textContent = message;
    status.style.color = isError ? 'var(--danger)' : '';
    if (badge) {
        badge.style.display = 'inline-flex';
        if (isError) {
            badge.textContent = '● Erreur';
            badge.style.background = 'rgba(220, 38, 38, 0.12)';
            badge.style.color = 'var(--danger)';
        } else if (/complète|terminée|complet/i.test(message)) {
            badge.textContent = '● Complète';
            badge.style.background = 'rgba(16, 185, 129, 0.12)';
            badge.style.color = '#047857';
        } else {
            badge.textContent = '● En cours';
            badge.style.background = 'var(--primary-soft)';
            badge.style.color = 'var(--primary)';
        }
    }
}

function stopSessionScanner() {
    if (sessionScannerTimer) { clearTimeout(sessionScannerTimer); sessionScannerTimer = null; }
    if (sessionScannerStream) sessionScannerStream.getTracks().forEach(track => track.stop());
    sessionScannerStream = null;
    const video = document.getElementById('sessionScannerVideo');
    if (video) { video.srcObject = null; video.style.display = 'none'; }
}

function activateReceptionSession(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) { setSessionActivationStatus('Saisissez ou scannez le code de session.', true); return false; }
    const sessions = getReceptionSessions();
    const session = sessions.find(item => String(item.code).toUpperCase() === normalized && item.status === 'active');
    if (!session) { setSessionActivationStatus('Ce code est invalide ou la session est fermée.', true); return false; }
    if (Number(session.registered || 0) >= Number(session.target || 0)) {
        session.status = 'completed'; saveReceptionSessions(sessions);
        setSessionActivationStatus('Cette session a déjà atteint son nombre de montures.', true); return false;
    }
    activeReceptionSession = session;
    stopSessionScanner();
    document.getElementById('sessionActivationGate').style.display = 'none';
    document.getElementById('sessionGate').style.display = 'block';
    const remaining = Number(session.target) - Number(session.registered || 0);
    setSessionActivationStatus(`Session activée : ${remaining} monture(s) restante(s).`);
    return true;
}

async function startSessionScanner() {
    if (!('BarcodeDetector' in window)) {
        setSessionActivationStatus('La lecture automatique n’est pas prise en charge ici. Saisissez le code indiqué sous le code-barres.', true); return;
    }
    try {
        const video = document.getElementById('sessionScannerVideo');
        sessionScannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = sessionScannerStream; video.style.display = 'block'; await video.play();
        const detector = new BarcodeDetector({ formats: ['code_128'] });
        setSessionActivationStatus('Recherche du code-barres de session…');
        const detect = async () => {
            if (!sessionScannerStream) return;
            try {
                const codes = await detector.detect(video);
                if (codes[0]?.rawValue && activateReceptionSession(codes[0].rawValue)) return;
            } catch (error) { console.warn('Lecture du code-barres impossible', error); }
            sessionScannerTimer = setTimeout(detect, 250);
        };
        detect();
    } catch (error) { setSessionActivationStatus('Impossible d’accéder à la caméra. Saisissez le code manuellement.', true); }
}

async function registerActiveSessionMount() {
    if (!activeReceptionSession) return;
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_URL}/inventory/reception-commands/${encodeURIComponent(activeReceptionSession.code)}/increment`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
            throw new Error(json?.error || `Erreur serveur (${response.status})`);
        }
        const command = json.data?.command || json.data;
        activeReceptionSession = {
            ...activeReceptionSession,
            registered: command.registered_count,
            target: command.target_count,
            status: command.status
        };
        if (command.status === 'completed') {
            setSessionActivationStatus('La commande est maintenant complète.', false);
        } else {
            setSessionActivationStatus(`Commande en cours : ${command.registered_count}/${command.target_count} monture(s).`, false);
        }
    } catch (error) {
        console.error('Erreur incrémentation commande', error);
    }
}

function dayKey(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function formatDayLabel(key) {
    return new Date(key + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function loadSessionMovements(userId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/inventory/movements?user_id=${userId}&action=RECEPTION_FOURNISSEUR&limit=300`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await response.json().catch(() => ({}));
        sessionMovements = (response.ok && json.success && Array.isArray(json.data?.movements)) ? json.data.movements : [];
    } catch (error) {
        console.error('Erreur chargement des sessions précédentes', error);
        sessionMovements = [];
    }
}

function renderSessionGreeting(user) {
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Employé';
    const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    document.getElementById('sessionGreeting').textContent = `Bonjour, ${name}`;
    document.getElementById('sessionGreetingSub').textContent = `Nous sommes le ${todayLabel}. Choisissez la session du jour pour commencer, ou consultez une session précédente.`;
}

function renderSessionDateBlocks() {
    const grid = document.getElementById('sessionDateGrid');
    const today = todayKey();
    const counts = new Map();
    sessionMovements.forEach(m => {
        const key = dayKey(m.created_at);
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    if (!counts.has(today)) counts.set(today, 0);

    const keys = Array.from(counts.keys()).sort((a, b) => b.localeCompare(a));
    grid.innerHTML = keys.map(key => {
        const isToday = key === today;
        const count = counts.get(key);
        return `<button class="date-block ${isToday ? 'today' : ''}" type="button" data-session-date="${key}">
            <div class="date-block-icon"><svg class="i"><use href="#ic-calendar"/></svg></div>
            <div class="date-block-value">${count}</div>
            <div class="date-block-label">${isToday ? 'Aujourd’hui · ' + formatDayLabel(key) : formatDayLabel(key)}</div>
            <div class="date-block-sub">${isToday ? 'ouvrir la session' : (count > 1 ? 'montures' : 'monture')}</div>
        </button>`;
    }).join('');

    grid.querySelectorAll('[data-session-date]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.sessionDate;
            if (key === today) enterSession();
            else openSessionDetail(key);
        });
    });
}

function openSessionDetail(dateKey) {
    sessionSelectedDate = dateKey;
    document.getElementById('sessionDateGrid').style.display = 'none';
    document.getElementById('sessionDetail').style.display = 'block';
    document.getElementById('sessionDetailTitle').textContent = formatDayLabel(dateKey);
    const rows = sessionMovements
        .filter(m => dayKey(m.created_at) === dateKey)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const container = document.getElementById('sessionActivityList');
    if (!rows.length) {
        container.innerHTML = `<div class="track-empty"><svg class="i" style="width:28px;height:28px;"><use href="#ic-glasses"/></svg><p>Aucun enregistrement pour cette date.</p></div>`;
        return;
    }
    container.innerHTML = rows.map(m => {
        const label = ((m.brand || '') + ' ' + (m.reference || '')).trim();
        return `<div class="activity-row">
            <div class="glass-photo"><svg class="i"><use href="#ic-glasses"/></svg></div>
            <div class="activity-main">
                <div class="activity-title"><strong>${escapeHtml(m.barcode)}</strong>${label ? `<span class="activity-sub">${escapeHtml(label)}</span>` : ''}</div>
                <div class="activity-meta"><span class="badge">ENREGISTRÉ</span><span class="activity-date">${new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
        </div>`;
    }).join('');
}

function closeSessionDetail() {
    sessionSelectedDate = null;
    document.getElementById('sessionDetail').style.display = 'none';
    document.getElementById('sessionDateGrid').style.display = 'grid';
}

// Ouvre l'assistant d'enregistrement pour la session du jour : c'est ici
// qu'elle "se crée" (aucune création explicite côté serveur n'est requise,
// le premier enregistrement du jour suffit à la faire apparaître demain).
function enterSession() {
    document.getElementById('sessionGate').style.display = 'none';
    document.getElementById('stepFlow').style.display = 'block';
}

async function loadStockFromServer() {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_URL}/inventory/glasses?station_id=${DEFAULT_STATION_ID}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
            console.error('Impossible de charger les montures en stock', response.status);
            stockItems = [];
            return;
        }
        stockItems = Array.isArray(json.data?.glasses) ? json.data.glasses : [];
    } catch (error) {
        console.error('Erreur réseau lors du chargement du stock', error);
        stockItems = [];
    }
}

const sendModal = document.getElementById('sendModal');
const sendModalSub = document.getElementById('sendModalSub');
const destStation = document.getElementById('destStation');
const stockTableBody = document.getElementById('stockTableBody');
const stockEmptyState = document.getElementById('stockEmptyState');
const selectAllStock = document.getElementById('selectAllStock');
const selectedCountEl = document.getElementById('selectedCount');
const confirmSendBtn = document.getElementById('confirmSendBtn');
const sendCountLabel = document.getElementById('sendCountLabel');

function renderStockTable() {
    const stock = stockItems;
    sendModalSub.textContent = stock.length + ' monture' + (stock.length > 1 ? 's' : '') + ' en stock';

    if (!stock.length) {
        stockTableBody.innerHTML = '';
        stockEmptyState.style.display = 'flex';
        selectAllStock.checked = false;
        selectAllStock.disabled = true;
    } else {
        stockEmptyState.style.display = 'none';
        selectAllStock.disabled = false;
        stockTableBody.innerHTML = stock.map(item => `
            <tr>
                <td><input type="checkbox" class="stock-row-check" data-id="${escapeHtml(item.barcode)}" /></td>
                <td><strong>${escapeHtml(item.brand || '—')}</strong></td>
                <td>${escapeHtml(item.reference || '—')}</td>
                <td>${escapeHtml([item.gender, item.shape, item.color].filter(Boolean).join(' · '))}</td>
                <td>${item.price ? Number(item.price).toLocaleString('fr-FR') + ' FCFA' : '—'}</td>
                <td>${escapeHtml(item.location_code || '—')}</td>
            </tr>
        `).join('');
    }
    updateSendSummary();
}

function getSelectedStockIds() {
    return Array.from(stockTableBody.querySelectorAll('.stock-row-check:checked')).map(cb => cb.dataset.id);
}

function updateSendSummary() {
    const selected = getSelectedStockIds();
    selectedCountEl.textContent = selected.length + ' sélectionnée' + (selected.length > 1 ? 's' : '');
    sendCountLabel.textContent = selected.length ? '(' + selected.length + ')' : '';
    confirmSendBtn.disabled = !(selected.length > 0 && destStation.value);

    const allChecks = stockTableBody.querySelectorAll('.stock-row-check');
    selectAllStock.checked = allChecks.length > 0 && selected.length === allChecks.length;
}

function selectStockBatch(kind) {
    const checks = Array.from(stockTableBody.querySelectorAll('.stock-row-check'));
    if (kind === 'all') {
        checks.forEach(cb => { cb.checked = true; });
    } else if (kind === 'none') {
        checks.forEach(cb => { cb.checked = false; });
    } else {
        const n = parseInt(kind, 10);
        checks.forEach((cb, i) => { cb.checked = i < n; });
    }
    updateSendSummary();
}

async function openSendModal() {
    sendModal.classList.add('show');
    stockTableBody.innerHTML = '';
    stockEmptyState.style.display = 'none';
    sendModalSub.textContent = 'Chargement…';
    await loadStockFromServer();
    renderStockTable();
}

function closeSendModal() {
    sendModal.classList.remove('show');
}

async function confirmSendGlasses() {
    const ids = getSelectedStockIds();
    const toStationId = destStation.value;
    if (!toStationId || !ids.length) return;

    const token = localStorage.getItem('token');
    if (!token) {
        alert("Vous devez être connecté pour envoyer des montures.");
        return;
    }

    const sentItems = stockItems.filter(item => ids.includes(item.barcode));
    const stationName = stationsList.find(s => String(s.id) === String(toStationId))?.name || 'la station sélectionnée';

    confirmSendBtn.disabled = true;
    const originalLabel = confirmSendBtn.innerHTML;
    confirmSendBtn.innerHTML = 'Envoi en cours...';

    try {
        const createRes = await fetch(`${API_URL}/inventory/transfers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                from_station_id: Number(DEFAULT_STATION_ID),
                to_station_id: Number(toStationId)
            })
        });
        const createJson = await createRes.json().catch(() => ({}));
        if (!createRes.ok || !createJson.success) {
            throw new Error(createJson?.error || `Erreur lors de la création du transfert (${createRes.status})`);
        }
        const transferId = createJson.data.id;

        const failed = [];
        for (const item of sentItems) {
            const itemRes = await fetch(`${API_URL}/inventory/transfers/${transferId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ barcode: item.barcode })
            });
            const itemJson = await itemRes.json().catch(() => ({}));
            if (!itemRes.ok || !itemJson.success) {
                failed.push(item.reference || item.barcode);
            }
        }

        const addedItems = sentItems.filter(item => !failed.some(f => f === (item.reference || item.barcode)));
        if (!addedItems.length) {
            throw new Error("Aucune monture n'a pu être ajoutée au transfert" + (failed.length ? ` (${failed.join(', ')})` : ''));
        }

        const dispatchRes = await fetch(`${API_URL}/inventory/transfers/${transferId}/dispatch`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const dispatchJson = await dispatchRes.json().catch(() => ({}));
        if (!dispatchRes.ok || !dispatchJson.success) {
            throw new Error(dispatchJson?.error || `Erreur lors de l'expédition du transfert (${dispatchRes.status})`);
        }

        let message = addedItems.length + (addedItems.length > 1 ? ' montures envoyées' : ' monture envoyée') + ' vers ' + stationName + '.';
        if (failed.length) message += `\nNon envoyées : ${failed.join(', ')}`;
        alert(message);
        await loadStockFromServer();
        renderStockTable();
    } catch (error) {
        console.error('Erreur envoi transfert', error);
        alert(error.message || "Échec de l'envoi vers la station");
    } finally {
        confirmSendBtn.disabled = false;
        confirmSendBtn.innerHTML = originalLabel;
    }
}

// ============================
// THÈME CLAIR / SOMBRE
// ============================
const THEME_KEY = 'lunetterie-theme';
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');

function applyTheme(theme) {
    if (theme) {
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const iconMarkup = '<use href="#ic-' + (isDark ? 'moon' : 'sun') + '"/>';
    themeIcon.innerHTML = iconMarkup;
    const mThemeIcon = document.getElementById('mThemeIcon');
    if (mThemeIcon) mThemeIcon.innerHTML = iconMarkup;
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
}

// ============================
// ÉCOUTEURS D'ÉVÉNEMENTS
// ============================
document.addEventListener('DOMContentLoaded', async function () {
    const token = localStorage.getItem('token');
    let sessionUser = null;
    try { sessionUser = JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { sessionUser = null; }
    if (!token || !sessionUser) {
        window.location.href = 'index.html';
        return;
    }

    applyTheme(localStorage.getItem(THEME_KEY));
    themeToggle.addEventListener('click', toggleTheme);
    const mThemeToggle = document.getElementById('mThemeToggle');
    if (mThemeToggle) mThemeToggle.addEventListener('click', toggleTheme);

    // Session : bloc du jour (toujours présent) + sessions précédentes par date.
    document.getElementById('sessionDetailBack').addEventListener('click', closeSessionDetail);
    document.getElementById('startSessionScanner').addEventListener('click', startSessionScanner);
    document.getElementById('validateSessionCode').addEventListener('click', () => activateReceptionSession(document.getElementById('sessionCodeInput').value));
    document.getElementById('sessionCodeInput').addEventListener('keydown', event => {
        if (event.key === 'Enter') activateReceptionSession(event.currentTarget.value);
    });
    renderSessionGreeting(sessionUser);
    await loadSessionMovements(sessionUser.id);
    renderSessionDateBlocks();

    // Les <select> natifs sélectionnent leur 1re option par défaut ; on ne veut
    // pas qu'une forme/couleur soit "choisie" tant que l'IA ou l'employé ne l'a pas fait.
    verifForme.value = '';
    verifCouleur.value = '';
    syncFormePicker();
    syncCouleurPicker();

    startCamera1.addEventListener('click', startCamera1Fn);
    stopCamera1.addEventListener('click', stopCamera1Fn);
    captureBtn1.addEventListener('click', captureImage1);
    retakeBtn1.addEventListener('click', retakePhoto1);
    validateStep1.addEventListener('click', validateStep1Fn);

    startCamera2.addEventListener('click', startCamera2Fn);
    stopCamera2.addEventListener('click', stopCamera2Fn);
    captureBtn2.addEventListener('click', captureImage2);
    retakeBtn2.addEventListener('click', retakePhoto2);
    validateStep2.addEventListener('click', validateStep2Fn);

    if (verifPrix) {
        verifPrix.addEventListener('change', updatePrixCustomVisibility);
    }
    updatePrixCustomVisibility();

    validateStep3.addEventListener('click', validateStep3Fn);

    shapeOptButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            verifForme.value = btn.dataset.value;
            if (formeSrcTag) { formeSrcTag.textContent = 'Corrigé'; formeSrcTag.className = 'src-tag manual'; }
            syncFormePicker();
            btn.closest('.field').style.borderColor = '';
        });
    });
    colorOptButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            verifCouleur.value = btn.dataset.value;
            if (couleurSrcTag) { couleurSrcTag.textContent = 'Corrigé'; couleurSrcTag.className = 'src-tag manual'; }
            syncCouleurPicker();
            btn.closest('.field').style.borderColor = '';
        });
    });
    validateStep4.addEventListener('click', validateStep4Fn);

    document.querySelectorAll('[data-goto-step]').forEach(btn => {
        btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.gotoStep, 10)));
    });
    document.querySelectorAll('[data-edit-target]').forEach(btn => {
        btn.addEventListener('click', () => document.getElementById(btn.dataset.editTarget).focus());
    });
    document.getElementById('copyCodeBtn').addEventListener('click', copyFinalCode);
    document.getElementById('printLabelBtn').addEventListener('click', printEtiquette);
    document.getElementById('resetAllBtn').addEventListener('click', resetAll);
    document.getElementById('resetAllBtnHeader').addEventListener('click', resetAll);

    // My Records (Voir mes enregistrements)
    if (viewMyRecordsBtn) viewMyRecordsBtn.addEventListener('click', function () { myRecordsModal.classList.add('show'); loadMyRecords(); });
    if (closeMyRecordsModal) closeMyRecordsModal.addEventListener('click', function () { myRecordsModal.classList.remove('show'); });
    if (myRecordsCloseBtn) myRecordsCloseBtn.addEventListener('click', function () { myRecordsModal.classList.remove('show'); });
    if (myRecordsModal) myRecordsModal.addEventListener('click', function (e) { if (e.target === myRecordsModal) { myRecordsModal.classList.remove('show'); } });

    loadDestinationStations();
    document.getElementById('sendGlassesBtn').addEventListener('click', openSendModal);
    document.getElementById('mSendGlassesBtn').addEventListener('click', openSendModal);
    document.getElementById('mResetAllBtn').addEventListener('click', resetAll);
    document.getElementById('mViewMyRecordsBtn').addEventListener('click', openMyRecordsModal);
    document.getElementById('closeSendModal').addEventListener('click', closeSendModal);
    document.getElementById('cancelSendBtn').addEventListener('click', closeSendModal);
    sendModal.addEventListener('click', function (e) { if (e.target === sendModal) closeSendModal(); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sendModal.classList.contains('show')) closeSendModal();
    });
    document.querySelectorAll('.batch-btn').forEach(btn => {
        btn.addEventListener('click', () => selectStockBatch(btn.dataset.batch));
    });
    stockTableBody.addEventListener('change', function (e) {
        if (e.target.classList.contains('stock-row-check')) updateSendSummary();
    });
    selectAllStock.addEventListener('change', () => selectStockBatch(selectAllStock.checked ? 'all' : 'none'));
    destStation.addEventListener('change', updateSendSummary);
    confirmSendBtn.addEventListener('click', confirmSendGlasses);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.target.matches('input, textarea, select')) {
            if (currentStep === 1 && !validateStep1.disabled) validateStep1Fn();
            else if (currentStep === 2 && !validateStep2.disabled) validateStep2Fn();
            else if (currentStep === 3) validateStep3Fn();
            else if (currentStep === 4) validateStep4Fn();
        }
        if (e.key === 'Escape') {
            if (currentStep === 1 && photoMontureData) retakePhoto1();
            else if (currentStep === 2 && photoBrancheData) retakePhoto2();
        }
        if (e.key === ' ' && !e.target.matches('input, textarea, select')) {
            e.preventDefault();
            if (currentStep === 1 && isCameraActive1) captureImage1();
            else if (currentStep === 2 && isCameraActive2) captureImage2();
        }
    });

    setTimeout(startCamera1Fn, 500);

    console.log('🕶️ Enregistrement Monture — Prêt');
    console.log('📖 Raccourcis : [Espace] Capturer | [Enter] Valider | [Echap] Reprendre');
});

window.addEventListener('beforeunload', function () {
    if (stream1) stream1.getTracks().forEach(t => t.stop());
    if (stream2) stream2.getTracks().forEach(t => t.stop());
});

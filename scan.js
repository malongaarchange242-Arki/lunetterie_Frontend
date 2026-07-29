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
let locationCounter = 1;

// ============================
// BACKEND
// ============================
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8080/api/v1'
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
const verifMontureImg = document.getElementById('verifMontureImg');
const verifBrancheImg = document.getElementById('verifBrancheImg');
const validateStep3 = document.getElementById('validateStep3');

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
        if (a.color) verifCouleur.value = a.color;
        if (a.material) verifMatiere.value = a.material;
        aiMountType = a.mount_type || null;

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
// GÉNÉRATION DE L'EMPLACEMENT
// ============================
function generateLocation() {
    const rayon = String.fromCharCode(65 + (Math.floor((locationCounter - 1) / 50) % 10));
    const etagere = Math.floor((locationCounter - 1) / 10) % 5 + 1;
    const bac = String.fromCharCode(65 + ((locationCounter - 1) % 10));
    const position = ((locationCounter - 1) % 10) + 1;

    const code = `RAYON-${rayon}-ETA-${String(etagere).padStart(2, '0')}-BAC-${bac}-POS-${String(position).padStart(2, '0')}`;

    locationCounter++;

    return {
        code, rayon, etagere, bac, position,
        path: `Rayon ${rayon} → Étagère ${etagere} → Bac ${bac} → Position ${position}`
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
function validateStep3Fn() {
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

    if (missing) {
        alert('Veuillez remplir tous les champs obligatoires.');
        return;
    }

    const location = generateLocation();
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
        prix: parseInt(verifPrix.value, 10),
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

        console.log('📦 Monture enregistrée en base :', data);

        successMarque.textContent = finalMontureData.marque;
        successRef.textContent = finalMontureData.reference;
        successId.textContent = finalMontureData.id;
        successLocation.textContent = finalMontureData.emplacement;
        successQuantite.textContent = '1';
        successPrix.textContent = finalMontureData.prix.toLocaleString() + ' FCFA';

        // Étiquette d'impression
        printMarque.textContent = finalMontureData.marque;
        printRef.textContent = finalMontureData.reference;
        printEmplacement.textContent = finalMontureData.emplacement;
        printPrix.textContent = finalMontureData.prix.toLocaleString() + ' FCFA';
        renderBarcode('#successBarcode', finalMontureData.id);
        renderBarcode('#printBarcode', finalMontureData.id);

        goToStep(5);
        playSuccessChime();
    } catch (error) {
        console.error('Erreur enregistrement monture', error);
        alert('❌ ' + (error.message || "Échec de l'enregistrement de la monture"));
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
function resetAll() {
    if (currentStep > 1 && !confirm('Voulez-vous vraiment recommencer ?')) return;

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

    goToStep(1);
    setTimeout(startCamera1Fn, 400);
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
    themeIcon.innerHTML = '<use href="#ic-' + (isDark ? 'moon' : 'sun') + '"/>';
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
document.addEventListener('DOMContentLoaded', function () {
    applyTheme(localStorage.getItem(THEME_KEY));
    themeToggle.addEventListener('click', toggleTheme);

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

    validateStep3.addEventListener('click', validateStep3Fn);
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

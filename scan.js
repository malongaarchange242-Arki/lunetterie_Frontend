/* ==========================================================================
   SCAN.JS — Enregistrement Monture
   Flux simplifié : 1) Photos (monture puis branche) 2) Vérification
   (seuls les champs non détectés par l'IA restent ouverts) 3) Enregistrement
   (aperçu + bouton Enregistrer, retour automatique à la caméra ensuite).
   ========================================================================== */

// ============================
// ÉTAT GLOBAL
// ============================
let captureStream = null;
let isCameraActive = false;
let captureTarget = 'monture'; // 'monture' | 'branche'
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

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
}

// ============================
// RÉFÉRENCES DOM — ÉTAPE 1 (PHOTOS)
// ============================
const captureVideo = document.getElementById('captureVideo');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const detectionOverlay = document.getElementById('detectionOverlay');
const capturedPreview = document.getElementById('capturedPreview');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const captureNextBtn = document.getElementById('captureNextBtn');
const captureNextBtnText = document.getElementById('captureNextBtnText');
const cameraInfo = document.getElementById('cameraInfo');
const captureStepTitle = document.getElementById('captureStepTitle');
const captureSubPill = document.getElementById('captureSubPill');
const captureScanStatusText = document.getElementById('captureScanStatusText');

// My records modal
const viewMyRecordsBtn = document.getElementById('viewMyRecordsBtn');
const myRecordsModal = document.getElementById('myRecordsModal');
const myRecordsContent = document.getElementById('myRecordsContent');
const myRecordsSub = document.getElementById('myRecordsSub');
const closeMyRecordsModal = document.getElementById('closeMyRecordsModal');
const myRecordsCloseBtn = document.getElementById('myRecordsCloseBtn');

// ============================
// RÉFÉRENCES DOM — ÉTAPE 2 (VÉRIFICATION)
// ============================
const step2Pill = document.getElementById('step2Pill');
const verifRef = document.getElementById('verifRef');
const verifMarque = document.getElementById('verifMarque');
const verifGenre = document.getElementById('verifGenre');
const refSrcTag = document.getElementById('refSrcTag');
const marqueSrcTag = document.getElementById('marqueSrcTag');
const genreSrcTag = document.getElementById('genreSrcTag');
const verifForme = document.getElementById('verifForme');
const verifCouleur = document.getElementById('verifCouleur');
const verifTaille = document.getElementById('verifTaille');
const verifMatiere = document.getElementById('verifMatiere');
const matiereSrcTag = document.getElementById('matiereSrcTag');
const verifPrix = document.getElementById('verifPrix');
const verifPrixCustom = document.getElementById('verifPrixCustom');
const verifMontureImg = document.getElementById('verifMontureImg');
const verifBrancheImg = document.getElementById('verifBrancheImg');
const confirmVerificationBtn = document.getElementById('confirmVerificationBtn');

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
const formeSummary = document.getElementById('formeSummary');
const couleurSummary = document.getElementById('couleurSummary');

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

// Replie un champ "détecté" par l'IA (masqué en résumé compact avec un
// crayon pour le corriger) ; les champs jamais détectés (taille, gamme)
// restent toujours ouverts, voir HTML.
function collapseField(srcTagEl) {
    if (!srcTagEl) return;
    srcTagEl.textContent = 'Détecté';
    srcTagEl.className = 'src-tag detected';
    const field = srcTagEl.closest('.field');
    if (field) field.classList.add('collapsed');
}
function markFieldCorrected(srcTagEl) {
    if (!srcTagEl) return;
    srcTagEl.textContent = 'Corrigé';
    srcTagEl.className = 'src-tag manual';
}

// ============================
// RÉFÉRENCES DOM — ÉTAPE 3 (ENREGISTREMENT)
// ============================
const finalStepPill = document.getElementById('finalStepPill');
const finalMarque = document.getElementById('finalMarque');
const finalRef = document.getElementById('finalRef');
const finalId = document.getElementById('finalId');
const finalEmplacement = document.getElementById('finalEmplacement');
const finalQuantite = document.getElementById('finalQuantite');
const finalPrix = document.getElementById('finalPrix');
const saveRecordBtn = document.getElementById('saveRecordBtn');

const saveToast = document.getElementById('saveToast');
const saveToastText = document.getElementById('saveToastText');
let saveToastTimer = null;
function showSaveToast(text) {
    if (saveToastTimer) clearTimeout(saveToastTimer);
    saveToastText.textContent = text;
    saveToast.classList.add('show');
    saveToastTimer = setTimeout(() => saveToast.classList.remove('show'), 1500);
}

// ============================
// RÉFÉRENCES DOM — ÉTIQUETTE / CODE-BARRES
// ============================
const printMarque = document.getElementById('printMarque');
const printRef = document.getElementById('printRef');
const printEmplacement = document.getElementById('printEmplacement');
const printPrix = document.getElementById('printPrix');

// ============================
// RÉFÉRENCES — INDICATEUR D'ÉTAPES (3 étapes)
// ============================
const stepNumbers = {
    1: document.getElementById('step1Num'),
    2: document.getElementById('step2Num'),
    3: document.getElementById('step3Num')
};
const stepLabels = {
    1: document.getElementById('step1Label'),
    2: document.getElementById('step2Label'),
    3: document.getElementById('step3Label')
};
const stepLines = {
    1: document.getElementById('line1'),
    2: document.getElementById('line2')
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
    for (let i = 1; i <= 3; i++) {
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
    for (let i = 1; i <= 2; i++) {
        stepLines[i].classList.toggle('done', i < step);
    }
}

// ============================
// CAMÉRA — ÉTAPE 1 (une seule vue, réutilisée pour la monture puis la branche)
// ============================
function updateCaptureUI() {
    const isMonture = captureTarget === 'monture';
    captureStepTitle.textContent = isMonture ? 'Photo de la monture' : 'Photo de la branche';
    captureSubPill.textContent = isMonture ? 'Photo 1/2 · Monture' : 'Photo 2/2 · Branche';
    captureScanStatusText.textContent = 'Recherche de ' + (isMonture ? 'la monture' : 'la branche') + '...';
    captureNextBtnText.textContent = isMonture ? 'Photo suivante →' : 'Valider →';
}

async function startCameraFn() {
    try {
        captureStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        captureVideo.srcObject = captureStream;
        await captureVideo.play();
        isCameraActive = true;
        cameraPlaceholder.style.display = 'none';
        captureVideo.style.display = 'block';
        detectionOverlay.classList.add('show');
        startCameraBtn.style.display = 'none';
        stopCameraBtn.style.display = 'inline-flex';
        captureBtn.disabled = false;
        setCameraInfo(cameraInfo, 'on', 'En direct');
    } catch (err) {
        alert("Impossible d'accéder à la caméra.");
        setCameraInfo(cameraInfo, 'off', 'Erreur');
    }
}

function stopCameraFn() {
    if (captureStream) { captureStream.getTracks().forEach(t => t.stop()); captureStream = null; }
    captureVideo.srcObject = null;
    captureVideo.style.display = 'none';
    detectionOverlay.classList.remove('show');
    cameraPlaceholder.style.display = 'flex';
    isCameraActive = false;
    startCameraBtn.style.display = 'inline-flex';
    stopCameraBtn.style.display = 'none';
    captureBtn.disabled = true;
    setCameraInfo(cameraInfo, 'off', 'Arrêtée');
}

function captureImageFn() {
    if (!isCameraActive) { alert('Démarrez la caméra.'); return; }
    const dataUrl = snapshotToDataUrl(captureVideo);
    if (captureTarget === 'monture') photoMontureData = dataUrl; else photoBrancheData = dataUrl;

    capturedPreview.src = dataUrl;
    capturedPreview.classList.add('show');
    captureVideo.style.display = 'none';
    detectionOverlay.classList.remove('show');
    captureBtn.style.display = 'none';
    retakeBtn.style.display = 'inline-flex';
    captureNextBtn.disabled = false;
    setCameraInfo(cameraInfo, 'on', 'Photo prise !');

    if (captureTarget === 'monture') detectMonture(); else detectBranche();
}

function retakePhotoFn() {
    capturedPreview.classList.remove('show');
    captureVideo.style.display = 'block';
    detectionOverlay.classList.add('show');
    captureBtn.style.display = 'inline-flex';
    retakeBtn.style.display = 'none';
    captureNextBtn.disabled = true;
    if (captureTarget === 'monture') photoMontureData = null; else photoBrancheData = null;
    setCameraInfo(cameraInfo, 'on', 'Prêt');
}

function resetCaptureDisplayForNextPhoto() {
    capturedPreview.classList.remove('show');
    capturedPreview.src = '';
    captureBtn.style.display = 'inline-flex';
    captureBtn.disabled = true;
    retakeBtn.style.display = 'none';
    captureNextBtn.disabled = true;
    cameraPlaceholder.style.display = 'flex';
}

function captureNextFn() {
    if (captureTarget === 'monture') {
        if (!photoMontureData) { alert('Veuillez prendre une photo de la monture.'); return; }
        stopCameraFn();
        captureTarget = 'branche';
        updateCaptureUI();
        resetCaptureDisplayForNextPhoto();
        setTimeout(startCameraFn, 400);
    } else {
        if (!photoBrancheData) { alert('Veuillez prendre une photo de la branche.'); return; }
        stopCameraFn();
        goToStep(2);
    }
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
// LISTES DE MONTURES STYLÉES — réutilisées par « Mes enregistrements » et
// par le détail d'un bloc de date (sessionGate). Un clic sur une ligne
// ouvre le détail (photo + infos + code-barres + impression).
// ============================
let activeRecordList = [];

// Les enregistrements « stock » (glasses) portent les champs à plat ; les
// mouvements historiques portent parfois un sous-objet "monture" imbriqué
// (même pattern défensif que imageUrlOf() dans historique.js).
function recordField(r, key) {
    if (!r) return null;
    if (r[key] != null && r[key] !== '') return r[key];
    if (r.monture && r.monture[key] != null && r.monture[key] !== '') return r.monture[key];
    return null;
}
function recordImageUrl(record, side) {
    if (side === 'branche') {
        return recordField(record, 'photo_branche_url') || recordField(record, 'branche_image_url') || null;
    }
    return recordField(record, 'photo_monture_url') || recordField(record, 'image_url')
        || recordField(record, 'photo_url') || recordField(record, 'image')
        || recordField(record, 'monture_image') || recordField(record, 'frame_image') || null;
}
function imageUrlOfRecord(r) { return recordImageUrl(r, 'monture'); }

function buildRecordRowsHtml(items) {
    return '<div class="activity-list">' + items.map(function (item, i) {
        const label = [recordField(item, 'gender'), recordField(item, 'shape'), recordField(item, 'color')].filter(Boolean).join(' · ');
        const imageUrl = imageUrlOfRecord(item);
        const brand = recordField(item, 'brand');
        const reference = recordField(item, 'reference');
        return '<div class="activity-row record-row" data-record-index="' + i + '">' +
            '<div class="glass-photo">' + (imageUrl ? '<img src="' + escapeHtml(imageUrl) + '" alt="" loading="lazy" />' : '<svg class="i"><use href="#ic-glasses"/></svg>') + '</div>' +
            '<div class="activity-main">' +
                '<div class="activity-title"><strong>' + escapeHtml(brand || 'Sans marque') + '</strong>' + (reference ? '<span class="activity-sub">' + escapeHtml(reference) + '</span>' : '') + '</div>' +
                '<div class="activity-meta"><span class="activity-where">' + escapeHtml(label || '—') + '</span></div>' +
            '</div>' +
            '<button class="history-download-btn" type="button" data-record-print-index="' + i + '" title="Imprimer l’étiquette"><svg class="i"><use href="#ic-printer"/></svg></button>' +
        '</div>';
    }).join('') + '</div>';
}

// « Mes enregistrements » : d'abord les blocs de date (une par jour, comme
// sur l'écran d'activation de session), puis la liste stylée du jour choisi.
// Réutilise sessionMovements (déjà chargé) plutôt que de refaire un appel
// réseau à l'ouverture.
let myRecordsView = 'dates';
function renderMyRecordsDateBlocks() {
    myRecordsView = 'dates';
    myRecordsSub.textContent = 'Choisissez une date';
    myRecordsContent.innerHTML = '<div class="date-block-grid">' + buildDateBlocksHtml(sessionMovements, 'voir la liste') + '</div>';
    myRecordsContent.querySelectorAll('[data-block-date]').forEach(btn => {
        btn.addEventListener('click', () => renderMyRecordsListForDate(btn.dataset.blockDate));
    });
}

function renderMyRecordsListForDate(dateKey) {
    myRecordsView = 'list';
    const rows = sessionMovements
        .filter(m => dayKey(m.created_at) === dateKey)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    activeRecordList = rows;
    myRecordsSub.textContent = formatDayLabel(dateKey);
    const backHtml = '<button class="btn btn-outline" type="button" id="myRecordsBackBtn" style="margin-bottom:14px;">'
        + '<svg class="i"><use href="#ic-arrow-left"/></svg> Dates</button>';
    myRecordsContent.innerHTML = backHtml + (rows.length
        ? buildRecordRowsHtml(rows)
        : '<div class="send-empty"><svg class="i"><use href="#ic-glasses"/></svg><p>Aucun enregistrement pour cette date.</p></div>');
    document.getElementById('myRecordsBackBtn').addEventListener('click', renderMyRecordsDateBlocks);
}

function openMyRecordsModal() {
    myRecordsModal.classList.add('show');
    renderMyRecordsDateBlocks();
    // Rafraîchit en arrière-plan pour inclure un enregistrement tout juste
    // sauvegardé ; ne réaffiche les blocs que si l'utilisateur n'a pas déjà
    // ouvert une date entre-temps.
    loadSessionMovements(sessionUser && sessionUser.id).then(() => {
        if (myRecordsView === 'dates') renderMyRecordsDateBlocks();
    });
}
function closeMyRecordsModalFn() { myRecordsModal.classList.remove('show'); }

// Visionneuse de détail (photo + infos + code-barres + impression), ouverte
// au clic sur une ligne, que ce soit depuis « Mes enregistrements » ou
// depuis le détail d'un bloc de date.
const recordLightbox = document.getElementById('recordLightbox');
const recordLightboxMontureImg = document.getElementById('recordLightboxMontureImg');
const recordLightboxMontureBox = document.getElementById('recordLightboxMontureBox');
const recordLightboxBrancheImg = document.getElementById('recordLightboxBrancheImg');
const recordLightboxBrancheBox = document.getElementById('recordLightboxBrancheBox');
const recordLightboxRows = document.getElementById('recordLightboxRows');
const closeRecordLightboxBtn = document.getElementById('closeRecordLightbox');
const recordLightboxPrintBtn = document.getElementById('recordLightboxPrintBtn');
let currentLightboxRecord = null;

function setLightboxPhoto(imgEl, boxEl, url) {
    const placeholder = boxEl.querySelector('.placeholder');
    if (url) {
        imgEl.src = url;
        imgEl.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
    }
}

function renderRecordLightboxContent(record) {
    setLightboxPhoto(recordLightboxMontureImg, recordLightboxMontureBox, recordImageUrl(record, 'monture'));
    setLightboxPhoto(recordLightboxBrancheImg, recordLightboxBrancheBox, recordImageUrl(record, 'branche'));
    const price = recordField(record, 'price');
    const rows = [
        ['Référence', recordField(record, 'reference')],
        ['Genre', recordField(record, 'gender')],
        ['Forme', recordField(record, 'shape')],
        ['Couleur', recordField(record, 'color')],
        ['Emplacement', recordField(record, 'location_code')],
        ['Gamme', price ? Number(price).toLocaleString('fr-FR') + ' FCFA' : null]
    ].filter(function (row) { return row[1]; });
    recordLightboxRows.innerHTML = '<strong>' + escapeHtml(recordField(record, 'brand') || recordField(record, 'barcode') || '') + '</strong>' +
        rows.map(function (row) { return '<div class="lightbox-row"><span>' + row[0] + '</span><span>' + escapeHtml(String(row[1])) + '</span></div>'; }).join('');
}

// Les lignes de la liste viennent de /inventory/movements (un simple journal
// de mouvements : code-barres, action, station, date), sans la photo ni les
// caractéristiques de la monture (forme, couleur, prix, emplacement…) qui,
// elles, ne vivent que sur la fiche /inventory/glasses/{barcode}. D'où le
// symptôme « seul le code-barres s'affiche » : on complète donc la fiche par
// un second appel, dès l'ouverture de la visionneuse.
async function openRecordLightbox(record) {
    currentLightboxRecord = record;
    recordLightbox.classList.add('open');
    renderRecordLightboxContent(record);
    renderBarcode('#recordLightboxBarcode', recordField(record, 'barcode'), false);
    renderBarcodeText('#recordLightboxBarcodeText', recordField(record, 'barcode'));

    const barcode = recordField(record, 'barcode');
    if (!barcode) return;
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/inventory/glasses/${encodeURIComponent(barcode)}?station_id=${DEFAULT_STATION_ID}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await response.json().catch(() => ({}));
        if (currentLightboxRecord !== record) return; // la visionneuse a été fermée ou une autre ligne cliquée entre-temps
        if (response.ok && json.success && json.data && json.data.glass) {
            const full = Object.assign({}, record, json.data.glass);
            currentLightboxRecord = full;
            renderRecordLightboxContent(full);
        }
    } catch (error) {
        console.error('Erreur chargement du détail de la monture', error);
    }
}
function closeRecordLightboxFn() {
    recordLightbox.classList.remove('open');
    recordLightboxMontureImg.src = '';
    recordLightboxBrancheImg.src = '';
    currentLightboxRecord = null;
}

async function printRecordTicket(record) {
    const barcode = recordField(record, 'barcode');
    const printValue = getPrintBarcodeValue(record);
    const brand = recordField(record, 'brand');
    const reference = recordField(record, 'reference');
    const locationCode = recordField(record, 'location_code');
    const price = recordField(record, 'price');
    const dataUrl = await buildTicketPng(printValue, 'La Lunetterie', [
        [brand, reference].filter(Boolean).join(' — '),
        [locationCode, price ? Number(price).toLocaleString('fr-FR') + ' FCFA' : null].filter(Boolean).join(' · ')
    ].filter(Boolean));
    downloadDataUrl(dataUrl, `etiquette-${printValue}.png`);
    printMarque.textContent = brand || '—';
    printRef.textContent = reference || '—';
    printEmplacement.textContent = locationCode || '—';
    printPrix.textContent = price ? Number(price).toLocaleString('fr-FR') + ' FCFA' : '—';
    renderBarcode('#printBarcode', printValue);
    window.print();
}

// ============================
// ANALYSE IA (détection + classification, service Python/YOLO)
// Les champs que l'IA renseigne avec succès se replient automatiquement
// (pastille "Détecté" + crayon pour corriger) ; les autres restent ouverts.
// ============================
async function detectMonture() {
    verifMontureImg.src = photoMontureData;
    verifMontureImg.style.display = 'block';
    document.querySelector('#previewMonture .placeholder').style.display = 'none';

    const originalPillText = step2Pill ? step2Pill.textContent : '';
    if (step2Pill) step2Pill.textContent = 'Analyse IA en cours...';

    try {
        const token = localStorage.getItem('token');
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
        if (a.shape) {
            verifForme.value = a.shape;
            formeSummary.textContent = a.shape;
            collapseField(formeSrcTag);
        }
        if (a.color) {
            const detectedColor = normalizeColorValue(a.color);
            verifCouleur.value = detectedColor;
            couleurSummary.textContent = detectedColor;
            collapseField(couleurSrcTag);
        }
        if (a.material) {
            verifMatiere.value = a.material;
            collapseField(matiereSrcTag);
        }
        if (a.brand) {
            verifMarque.value = a.brand;
            collapseField(marqueSrcTag);
        }
        if (a.gender) {
            verifGenre.value = a.gender;
            collapseField(genreSrcTag);
        }
        aiMountType = a.mount_type || null;
        syncFormePicker();
        syncCouleurPicker();

        console.log('🧠 Analyse IA :', a);
    } catch (err) {
        console.warn('Analyse IA indisponible, saisie manuelle requise :', err);
    } finally {
        if (step2Pill) step2Pill.textContent = originalPillText;
    }
}

async function detectBranche() {
    verifBrancheImg.src = photoBrancheData;
    verifBrancheImg.style.display = 'block';
    document.querySelector('#previewBranche .placeholder').style.display = 'none';

    const originalPillText = step2Pill ? step2Pill.textContent : '';
    if (step2Pill) step2Pill.textContent = 'Analyse IA en cours...';

    try {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('image', dataURLtoBlob(photoBrancheData), 'branche.jpg');

        const response = await fetch(`${API_URL}/inventory/analyze-branche`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
            throw new Error(json?.error || `Erreur serveur (${response.status})`);
        }

        const b = json.data;
        detectionBranche = { reference: b.reference, marque: b.brand };
        if (b.reference) {
            verifRef.value = b.reference;
            collapseField(refSrcTag);
        }
        if (b.brand) {
            verifMarque.value = b.brand;
            collapseField(marqueSrcTag);
        }

        console.log('🧠 OCR branche :', b);
    } catch (err) {
        console.warn('OCR branche indisponible, saisie manuelle requise :', err);
    } finally {
        if (step2Pill) step2Pill.textContent = originalPillText;
    }
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
    return { code: json.data.code };
}

// ============================
// VALIDATION — ÉTAPE 2 (VÉRIFICATION → APERÇU FINAL)
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

function renderFinalStep(data) {
    finalMarque.textContent = data.marque || '—';
    finalRef.textContent = data.reference || '—';
    finalId.textContent = data.id;
    finalEmplacement.textContent = data.emplacement;
    finalQuantite.textContent = String(data.quantite || 1);
    finalPrix.textContent = data.prix ? Number(data.prix).toLocaleString('fr-FR') + ' FCFA' : '—';
    renderBarcode('#finalBarcode', data.id, false);
    renderBarcodeText('#finalBarcodeText', data.id);
}

async function confirmVerificationFn() {
    const fields = [verifRef, verifMarque, verifGenre, verifForme, verifCouleur, verifTaille, verifPrix];
    let missing = false;
    fields.forEach(f => {
        const field = f.closest('.field');
        if (!f.value.trim()) {
            field.classList.remove('collapsed');
            field.style.borderColor = 'var(--danger)';
            missing = true;
        } else {
            field.style.borderColor = '';
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

    const originalLabel = confirmVerificationBtn.innerHTML;
    confirmVerificationBtn.disabled = true;
    confirmVerificationBtn.innerHTML = 'Recherche de l\'emplacement...';

    let location;
    try {
        location = await fetchNextFreeLocation();
    } catch (err) {
        console.error('Erreur récupération emplacement libre', err);
        alert("Impossible de trouver un emplacement libre en stock : " + (err.message || 'erreur inconnue'));
        return;
    } finally {
        confirmVerificationBtn.disabled = false;
        confirmVerificationBtn.innerHTML = originalLabel;
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
        photoMonture: photoMontureData,
        photoBranche: photoBrancheData,
        dateCreation: new Date().toISOString()
    };

    renderFinalStep(finalMontureData);
    goToStep(3);
}

// ============================
// CODE-BARRES — aperçu + étiquette d'impression
// ============================
// showValue=false : n'affiche pas le texte du code dans le SVG lui-même.
// Utile pour les aperçus à l'écran dans des cartes étroites (mobile) : le
// texte intégré au SVG rétrécit avec les barres et devient illisible une
// fois le graphique réduit pour tenir dans la carte. Le texte est alors
// affiché séparément en HTML normal via renderBarcodeText(), toujours lisible
// quelle que soit la largeur du code-barres. L'étiquette imprimée garde le
// texte intégré (displayValue par défaut) car elle n'est jamais redimensionnée.
function renderBarcode(target, value, showValue) {
    if (typeof JsBarcode === 'undefined' || !value) return;
    JsBarcode(target, value, {
        format: 'CODE128',
        lineColor: '#0f172a',
        background: '#ffffff',
        width: 2,
        height: 46,
        fontSize: 20,
        margin: 8,
        displayValue: showValue !== false
    });
    // JsBarcode fixe width/height en pixels sur le <svg> mais n'ajoute pas de
    // viewBox : sans lui, le CSS "max-width:100%" ne peut pas le réduire
    // proportionnellement et le code-barres déborde dans les cartes étroites
    // (ex. la visionneuse « Mes enregistrements »). On l'ajoute nous-mêmes.
    const svgEl = typeof target === 'string' ? document.querySelector(target) : target;
    if (svgEl) {
        const w = svgEl.getAttribute('width');
        const h = svgEl.getAttribute('height');
        if (w && h) svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
}

function renderBarcodeText(target, value) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el) el.textContent = value || '';
}

// ============================
// VALIDATION — ÉTAPE 3 (ENREGISTREMENT RÉEL)
// ============================
async function saveRecordFn() {
    if (!finalMontureData) { alert('Erreur : données manquantes.'); return; }
    if (!activeReceptionSession || Number(activeReceptionSession.registered || 0) >= Number(activeReceptionSession.target || 0)) {
        alert('La session est absente ou son quota est atteint. Activez une nouvelle session avant de continuer.');
        return;
    }

    saveRecordBtn.disabled = true;
    const originalLabel = saveRecordBtn.innerHTML;
    saveRecordBtn.innerHTML = '<svg class="i"><use href="#ic-save"/></svg> Enregistrement en cours...';

    try {
        const token = localStorage.getItem('token');
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
        // Attendu avant de programmer le retour à l'étape 1 : resetAll() doit
        // lire un activeReceptionSession déjà à jour, pas une valeur encore
        // en cours de rafraîchissement (source d'une fermeture prématurée du
        // flux d'enregistrement si la lecture arrivait trop tard).
        await registerActiveSessionMount();

        console.log('📦 Monture enregistrée en base :', data);

        renderFinalStep(finalMontureData);
        playSuccessChime();
        showSaveToast('Monture enregistrée — ' + finalMontureData.id);

        // Retour automatique à la caméra pour la monture suivante.
        setTimeout(() => resetAll(true), 1600);
    } catch (error) {
        console.error('Erreur enregistrement monture', error);
        alert(error.message || "Échec de l'enregistrement de la monture");
        saveRecordBtn.disabled = false;
        saveRecordBtn.innerHTML = originalLabel;
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
// IMPRESSION ÉTIQUETTE (avec code-barres) — depuis « Mes enregistrements »
// ============================
// Génère un PNG de l'étiquette (même contenu que .print-label) dans un
// <canvas> hors écran, à partir d'un code-barres rendu par JsBarcode.
function buildTicketPng(barcodeValue, heading, lines) {
    return new Promise(function (resolve) {
        const barcodeCanvas = document.createElement('canvas');
        JsBarcode(barcodeCanvas, barcodeValue, {
            format: 'CODE128', lineColor: '#0f172a', background: '#ffffff',
            width: 2, height: 60, fontSize: 20, margin: 8, displayValue: true
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
        lines.forEach(function (line) {
            ctx.fillText(line, width / 2, y);
            y += lineHeight;
        });

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

function isPointeNoireScan() {
    try {
        const user = sessionUser || JSON.parse(localStorage.getItem('user') || 'null');
        return user && user.station_name === 'Station Pointe-Noire';
    } catch (error) {
        return false;
    }
}

function getPrintBarcodeValue(record) {
    if (isPointeNoireScan() && record.reference) {
        return record.reference;
    }
    return record.barcode;
}

// ============================
// RÉINITIALISATION
// ============================
// skipConfirm=true pour le retour automatique après un enregistrement réussi
// (pas de confirmation à demander, ce n'est pas une action de l'utilisateur).
async function resetAll(skipConfirm) {
    if (!skipConfirm && currentStep > 1 && !(await window.showSliderConfirm('Voulez-vous vraiment recommencer ?'))) return;

    stopCameraFn();

    photoMontureData = null;
    photoBrancheData = null;
    aiMountType = null;
    detectionMonture = {};
    detectionBranche = {};
    finalMontureData = null;
    captureTarget = 'monture';
    updateCaptureUI();

    capturedPreview.classList.remove('show');
    capturedPreview.src = '';
    verifMontureImg.style.display = 'none';
    verifBrancheImg.style.display = 'none';
    document.querySelectorAll('#previewMonture .placeholder, #previewBranche .placeholder')
        .forEach(el => el.style.display = 'flex');

    document.querySelectorAll('#verificationDetails input, #verificationDetails select').forEach(el => {
        el.value = '';
        el.closest('.field').style.borderColor = '';
    });
    document.querySelectorAll('#verificationDetails .field-collapsible').forEach(field => field.classList.remove('collapsed'));
    [refSrcTag, marqueSrcTag, genreSrcTag, formeSrcTag, couleurSrcTag, matiereSrcTag].forEach(tag => {
        if (tag) { tag.textContent = 'À saisir'; tag.className = 'src-tag manual'; }
    });
    if (formeSummary) formeSummary.textContent = '';
    if (couleurSummary) couleurSummary.textContent = '';
    updatePrixCustomVisibility();
    syncFormePicker();
    syncCouleurPicker();

    startCameraBtn.style.display = 'inline-flex';
    stopCameraBtn.style.display = 'none';
    captureBtn.disabled = true;
    captureBtn.style.display = 'inline-flex';
    retakeBtn.style.display = 'none';
    captureNextBtn.disabled = true;
    captureVideo.style.display = 'none';
    cameraPlaceholder.style.display = 'flex';
    detectionOverlay.classList.remove('show');

    // Le bouton "Enregistrer" n'est réactivé qu'en cas d'erreur dans
    // saveRecordFn() (la boucle passe par ici après un succès) : sans ce
    // reset, il reste bloqué sur "Enregistrement en cours..." et désactivé
    // pour toute monture suivante.
    saveRecordBtn.disabled = false;
    saveRecordBtn.innerHTML = '<svg class="i"><use href="#ic-save"/></svg> Enregistrer';

    if (!activeReceptionSession || Number(activeReceptionSession.registered || 0) >= Number(activeReceptionSession.target || 0)) {
        activeReceptionSession = null;
        updateSessionProgressBadge();
        document.getElementById('stepFlow').style.display = 'none';
        document.getElementById('sessionGate').style.display = 'none';
        document.getElementById('sessionActivationGate').style.display = 'block';
        document.getElementById('sessionCodeInput').value = '';
        setSessionActivationStatus('La session est terminée. Scannez une nouvelle étiquette pour continuer.');
        return;
    }

    goToStep(1);
    setTimeout(startCameraFn, 400);
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

// ============================
// SESSION — page d'accueil affichée à la connexion. Elle capture le nom de
// l'employé et la date du jour, liste ses sessions précédentes (une par jour,
// à partir des réceptions fournisseur enregistrées) et n'ouvre l'assistant
// d'enregistrement que lorsqu'il choisit le bloc du jour.
// ============================
let sessionMovements = [];
let sessionSelectedDate = null;
let activeReceptionSession = null;
let sessionScannerStream = null;
let sessionScannerTimer = null;

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
            badge.style.background = 'var(--primary-tint)';
            badge.style.color = 'var(--primary)';
        }
    }
}

// Affiche le nombre de montures enregistrées / attendues pour la session
// active, sur la page des blocs de date (juste après l'activation).
function updateSessionProgressBadge() {
    const badge = document.getElementById('sessionProgressBadge');
    const text = document.getElementById('sessionProgressText');
    if (!badge || !text) return;
    if (!activeReceptionSession) { badge.style.display = 'none'; return; }
    text.textContent = `${activeReceptionSession.registered} / ${activeReceptionSession.target} montures enregistrées`;
    badge.style.display = 'inline-flex';
}

function stopSessionScanner() {
    if (sessionScannerTimer) { clearTimeout(sessionScannerTimer); sessionScannerTimer = null; }
    if (sessionScannerStream) sessionScannerStream.getTracks().forEach(track => track.stop());
    sessionScannerStream = null;
    const video = document.getElementById('sessionScannerVideo');
    if (video) { video.srcObject = null; video.style.display = 'none'; }
}

async function activateReceptionSession(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) { setSessionActivationStatus('Saisissez ou scannez le code de session.', true); return false; }
    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
        const response = await fetch(`${API_URL}/inventory/reception-commands/${encodeURIComponent(normalized)}`, {
            headers
        });
        const json = await response.json().catch(() => ({}));
        const command = json.data?.command || json.data;
        if (!response.ok || !json.success || !command) {
            setSessionActivationStatus('Ce code est invalide ou la session est fermée.', true);
            return false;
        }
        if (command.status !== 'active') {
            setSessionActivationStatus('Ce code est invalide ou la session est fermée.', true);
            return false;
        }
        if (Number(command.registered_count || 0) >= Number(command.target_count || 0)) {
            setSessionActivationStatus('Cette session a déjà atteint son nombre de montures.', true);
            return false;
        }

        activeReceptionSession = {
            code: String(command.code),
            registered: Number(command.registered_count || 0),
            target: Number(command.target_count || 0),
            status: String(command.status)
        };
        stopSessionScanner();
        document.getElementById('sessionActivationGate').style.display = 'none';
        document.getElementById('sessionGate').style.display = 'block';
        const remaining = activeReceptionSession.target - activeReceptionSession.registered;
        setSessionActivationStatus(`Session activée : ${remaining} monture(s) restante(s).`);
        updateSessionProgressBadge();
        return true;
    } catch (error) {
        console.error('Erreur activation session', error);
        setSessionActivationStatus('Impossible de valider la session sur le serveur. Réessayez.', true);
        return false;
    }
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
                if (codes[0]?.rawValue) {
                    // activateReceptionSession() est asynchrone : il faut attendre son
                    // vrai résultat (true/false) avant de décider d'arrêter la boucle.
                    // Sans ce await, la promesse elle-même est "truthy" et la lecture
                    // s'arrêtait dès qu'un code était détecté, même invalide — laissant
                    // l'employé bloqué sur une caméra figée sans nouvelle tentative.
                    const activated = await activateReceptionSession(codes[0].rawValue);
                    if (activated) return;
                }
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
        const command = json.data?.command || json.data || {};
        // Défensif : si la réponse de /increment ne renvoie pas registered_count/
        // target_count sous la forme attendue (champ manquant, endpoint qui
        // répond différemment de l'activation...), on ne doit surtout pas
        // laisser `target` devenir 0/undefined — sinon la prochaine vérification
        // "registered >= target" dans resetAll() croit la session terminée après
        // une seule monture et ferme le flux d'enregistrement à tort. On retombe
        // dans ce cas sur un incrément local sûr plutôt que sur une valeur
        // potentiellement invalide venue du serveur.
        const parsedRegistered = Number(command.registered_count);
        const parsedTarget = Number(command.target_count);
        const nextRegistered = Number.isFinite(parsedRegistered)
            ? parsedRegistered
            : Number(activeReceptionSession.registered || 0) + 1;
        const nextTarget = Number.isFinite(parsedTarget) && parsedTarget > 0
            ? parsedTarget
            : Number(activeReceptionSession.target || 0);
        if (!Number.isFinite(parsedRegistered) || !Number.isFinite(parsedTarget) || parsedTarget <= 0) {
            console.warn('Réponse inattendue de /increment, valeurs de secours utilisées :', command);
        }
        activeReceptionSession = {
            ...activeReceptionSession,
            registered: nextRegistered,
            target: nextTarget,
            status: command.status || activeReceptionSession.status
        };
        updateSessionProgressBadge();
        if (activeReceptionSession.status === 'completed' || nextRegistered >= nextTarget) {
            setSessionActivationStatus('La commande est maintenant complète.', false);
        } else {
            setSessionActivationStatus(`Commande en cours : ${nextRegistered}/${nextTarget} monture(s).`, false);
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
        const query = userId ? `?user_id=${userId}&action=RECEPTION_FOURNISSEUR&limit=300` : '?action=RECEPTION_FOURNISSEUR&limit=300';
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(`${API_URL}/inventory/movements${query}`, {
            headers
        });
        const json = await response.json().catch(() => ({}));
        sessionMovements = (response.ok && json.success && Array.isArray(json.data?.movements)) ? json.data.movements : [];
    } catch (error) {
        console.error('Erreur chargement des sessions précédentes', error);
        sessionMovements = [];
    }
}

function renderSessionGreeting(user) {
    const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Employé';
    const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    document.getElementById('sessionGreeting').textContent = `Bonjour, ${name}`;
    document.getElementById('sessionGreetingSub').textContent = `Nous sommes le ${todayLabel}. Choisissez la session du jour pour commencer, ou consultez une session précédente.`;
}

// Construit les blocs de date (une par jour d'activité) à partir d'une
// liste de mouvements — réutilisé par l'écran d'activation de session et
// par « Mes enregistrements ».
function buildDateBlocksHtml(movements, todaySubLabel) {
    const today = todayKey();
    const counts = new Map();
    movements.forEach(m => {
        const key = dayKey(m.created_at);
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    if (!counts.has(today)) counts.set(today, 0);

    const keys = Array.from(counts.keys()).sort((a, b) => b.localeCompare(a));
    return keys.map(key => {
        const isToday = key === today;
        const count = counts.get(key);
        return `<button class="date-block ${isToday ? 'today' : ''}" type="button" data-block-date="${key}">
            <div class="date-block-icon"><svg class="i"><use href="#ic-calendar"/></svg></div>
            <div class="date-block-value">${count}</div>
            <div class="date-block-label">${isToday ? 'Aujourd’hui · ' + formatDayLabel(key) : formatDayLabel(key)}</div>
            <div class="date-block-sub">${isToday ? todaySubLabel : (count > 1 ? 'montures' : 'monture')}</div>
        </button>`;
    }).join('');
}

function renderSessionDateBlocks() {
    const grid = document.getElementById('sessionDateGrid');
    grid.innerHTML = buildDateBlocksHtml(sessionMovements, 'ouvrir la session');
    const today = todayKey();
    grid.querySelectorAll('[data-block-date]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.blockDate;
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
        activeRecordList = [];
        container.innerHTML = `<div class="track-empty"><svg class="i" style="width:28px;height:28px;"><use href="#ic-glasses"/></svg><p>Aucun enregistrement pour cette date.</p></div>`;
        return;
    }
    activeRecordList = rows;
    container.innerHTML = buildRecordRowsHtml(rows);
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
    // Démarre la caméra tout de suite : ce clic est le geste utilisateur qui
    // autorise l'accès caméra sur mobile (un démarrage silencieux au
    // chargement de la page est souvent bloqué par le navigateur).
    if (!isCameraActive) startCameraFn();
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
// Portée module (pas seulement DOMContentLoaded) : réutilisé par
// openMyRecordsModal() pour rafraîchir sessionMovements à la demande.
let sessionUser = null;

document.addEventListener('DOMContentLoaded', async function () {
    try { sessionUser = JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { sessionUser = null; }

    // Le magasinier reste en flux caméra continu, sans jamais quitter la page
    // (voir les commentaires "Bouton Retour supprimé" dans scan.html) : ce
    // bouton n'existe donc que pour un SUPER_ADMIN, seul autre rôle admis ici
    // (voir auth-guard.js), venu depuis "Enregistrer une monture" sur
    // direction.html et qui doit pouvoir y retourner.
    const sessionRole = String((sessionUser && (sessionUser.role_name || sessionUser.role)) || '').toUpperCase();
    if (sessionRole === 'SUPER_ADMIN') {
        const backBtn = document.getElementById('backToDirectionBtn');
        if (backBtn) {
            backBtn.style.display = 'inline-flex';
            backBtn.addEventListener('click', () => { window.location.href = 'direction.html'; });
        }
        const mBackBtn = document.getElementById('mBackToDirectionBtn');
        if (mBackBtn) {
            mBackBtn.style.visibility = 'visible';
            mBackBtn.addEventListener('click', () => { window.location.href = 'direction.html'; });
        }
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
    await loadSessionMovements(sessionUser && sessionUser.id);
    renderSessionDateBlocks();

    // Les <select> natifs sélectionnent leur 1re option par défaut ; on ne veut
    // pas qu'une forme/couleur soit "choisie" tant que l'IA ou l'employé ne l'a pas fait.
    verifForme.value = '';
    verifCouleur.value = '';
    syncFormePicker();
    syncCouleurPicker();
    updateCaptureUI();

    startCameraBtn.addEventListener('click', startCameraFn);
    stopCameraBtn.addEventListener('click', stopCameraFn);
    captureBtn.addEventListener('click', captureImageFn);
    retakeBtn.addEventListener('click', retakePhotoFn);
    captureNextBtn.addEventListener('click', captureNextFn);

    if (verifPrix) {
        verifPrix.addEventListener('change', updatePrixCustomVisibility);
    }
    updatePrixCustomVisibility();

    confirmVerificationBtn.addEventListener('click', confirmVerificationFn);

    shapeOptButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            verifForme.value = btn.dataset.value;
            markFieldCorrected(formeSrcTag);
            formeSummary.textContent = btn.dataset.value;
            syncFormePicker();
            btn.closest('.field').style.borderColor = '';
        });
    });
    colorOptButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            verifCouleur.value = btn.dataset.value;
            markFieldCorrected(couleurSrcTag);
            couleurSummary.textContent = btn.dataset.value;
            syncCouleurPicker();
            btn.closest('.field').style.borderColor = '';
        });
    });
    saveRecordBtn.addEventListener('click', saveRecordFn);

    document.querySelectorAll('[data-goto-step]').forEach(btn => {
        btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.gotoStep, 10)));
    });
    // Bouton "crayon" : déplie le champ replié pour le corriger. Pour les
    // champs "picker" (forme/couleur), il n'y a rien à focus : on se contente
    // de réafficher le sélecteur visuel.
    document.querySelectorAll('#verificationDetails .edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.closest('.field');
            field.classList.remove('collapsed');
            if (!field.classList.contains('field-picker')) {
                const targetEl = document.getElementById(btn.dataset.editTarget);
                if (targetEl) targetEl.focus();
            }
        });
    });

    document.getElementById('resetAllBtnHeader').addEventListener('click', () => resetAll(false));

    // My Records (Voir mes enregistrements)
    if (viewMyRecordsBtn) viewMyRecordsBtn.addEventListener('click', openMyRecordsModal);
    if (closeMyRecordsModal) closeMyRecordsModal.addEventListener('click', closeMyRecordsModalFn);
    if (myRecordsCloseBtn) myRecordsCloseBtn.addEventListener('click', closeMyRecordsModalFn);
    if (myRecordsModal) myRecordsModal.addEventListener('click', function (e) { if (e.target === myRecordsModal) closeMyRecordsModalFn(); });
    // Un seul gestionnaire délégué par liste : à chaque rendu (Mes
    // enregistrements ou détail d'un bloc de date), on met à jour
    // `activeRecordList` puis on réutilise ce même gestionnaire délégué.
    function handleRecordListClick(e) {
        const printBtn = e.target.closest('[data-record-print-index]');
        if (printBtn) {
            e.stopPropagation();
            const record = activeRecordList[Number(printBtn.dataset.recordPrintIndex)];
            if (record) printRecordTicket(record);
            return;
        }
        const row = e.target.closest('[data-record-index]');
        if (row) {
            const record = activeRecordList[Number(row.dataset.recordIndex)];
            if (record) openRecordLightbox(record);
        }
    }
    myRecordsContent.addEventListener('click', handleRecordListClick);
    document.getElementById('sessionActivityList').addEventListener('click', handleRecordListClick);
    closeRecordLightboxBtn.addEventListener('click', closeRecordLightboxFn);
    recordLightbox.addEventListener('click', function (e) { if (e.target === recordLightbox) closeRecordLightboxFn(); });
    recordLightboxPrintBtn.addEventListener('click', function () {
        if (currentLightboxRecord) printRecordTicket(currentLightboxRecord);
    });

    loadDestinationStations();
    document.getElementById('sendGlassesBtn').addEventListener('click', openSendModal);
    document.getElementById('mSendGlassesBtn').addEventListener('click', openSendModal);
    document.getElementById('mResetAllBtn').addEventListener('click', () => resetAll(false));
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
            if (currentStep === 1 && !captureNextBtn.disabled) captureNextFn();
            else if (currentStep === 2) confirmVerificationFn();
            else if (currentStep === 3) saveRecordFn();
        }
        if (e.key === 'Escape') {
            if (currentStep === 1 && ((captureTarget === 'monture' && photoMontureData) || (captureTarget === 'branche' && photoBrancheData))) retakePhotoFn();
        }
        if (e.key === ' ' && !e.target.matches('input, textarea, select')) {
            e.preventDefault();
            if (currentStep === 1 && isCameraActive) captureImageFn();
        }
    });

    // Le démarrage caméra n'est plus déclenché ici au chargement de la page
    // (trop tôt, avant l'activation de session, et sans geste utilisateur) :
    // voir enterSession() et resetAll().

    console.log('🕶️ Enregistrement Monture — Prêt');
    console.log('📖 Raccourcis : [Espace] Capturer | [Enter] Valider | [Echap] Reprendre');
});

window.addEventListener('beforeunload', function () {
    if (captureStream) captureStream.getTracks().forEach(t => t.stop());
});

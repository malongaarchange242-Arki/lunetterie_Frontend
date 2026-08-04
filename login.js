document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. CONNEXION BIOMÉTRIQUE RÉELLE (WebAuthn)
    // ==========================================
    // FORCER L'UTILISATION DE L'API DE PRODUCTION
    const API_URL = 'https://api-lunetterie.universearch.com/api/v1';
    const RP_ID = 'api-lunetterie.universearch.com';
    
    const scannerBox = document.getElementById('scannerBox');
    const statusMessage = document.getElementById('statusMessage');
    const scannerIcon = document.getElementById('scannerIcon');
    const emailLoginForm = document.getElementById('emailLoginForm');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginPasswordLabel = document.getElementById('loginPasswordLabel');
    const confirmPasswordWrap = document.getElementById('confirmPasswordWrap');
    const confirmPassword = document.getElementById('confirmPassword');
    const passwordStep = document.getElementById('passwordStep');
    const emailFeedback = document.getElementById('emailFeedback');
    const emailLoginBtnText = document.getElementById('emailLoginBtnText');

    // Afficher/masquer le mot de passe saisi.
    function wireTogglePassword(input, button) {
        if (!input || !button) return;
        const icon = button.querySelector('i');
        button.addEventListener('click', () => {
            const showing = input.type === 'text';
            input.type = showing ? 'password' : 'text';
            icon.classList.toggle('fa-eye', showing);
            icon.classList.toggle('fa-eye-slash', !showing);
            button.setAttribute('aria-label', showing ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
            input.focus();
        });
    }
    wireTogglePassword(loginPassword, document.getElementById('toggleLoginPassword'));
    wireTogglePassword(confirmPassword, document.getElementById('toggleConfirmPassword'));

    let emailLookupTimer;
    let verifiedEmail = '';
    let needsPasswordSetup = false;

    // ==========================================
    // REDIRECTION APRÈS CONNEXION SELON LE RÔLE
    // ==========================================
    const ROLE_REDIRECTS = {
        SUPER_ADMIN: 'direction.html',
        ADMIN: 'admin.html',
        MAGASINIER: 'scan.html',
        VENDEUR: 'presentoir.html',
        LABORATOIRE: 'presentoir.html',
        RESPONSABLE_STATION: 'presentoir.html',
        DIRECTION: 'admin.html',
        SUPER_DIRECTEUR: 'direction.html'
    };

    const ROLE_ID_TO_NAME = {
        1: 'SUPER_ADMIN',
        2: 'ADMIN',
        3: 'MAGASINIER',
        4: 'VENDEUR',
        5: 'LABORATOIRE',
        6: 'RESPONSABLE_STATION',
        7: 'DIRECTION',
        8: 'SUPER_DIRECTEUR'
    };

    function normalizeRoleName(value) {
        if (!value) return null;
        return String(value).trim().toUpperCase().replace(/\s+/g, '_');
    }

    function getRoleName(user) {
        return normalizeRoleName(user?.role_name || user?.role || ROLE_ID_TO_NAME[user?.role_id]);
    }

    function redirectAfterLogin(user) {
        const roleName = getRoleName(user);
        if (roleName === 'MAGASINIER' && user?.station_name === 'Station Pointe-Noire') {
            window.location.href = 'presentoir.html';
            return;
        }
        window.location.href = ROLE_REDIRECTS[roleName] || 'admin.html';
    }

    function setEmailFeedback(message, type = '') {
        emailFeedback.textContent = message;
        emailFeedback.className = 'email-feedback' + (type ? ' ' + type : '');
    }

    function hidePasswordStep() {
        verifiedEmail = '';
        needsPasswordSetup = false;
        loginPassword.value = '';
        confirmPassword.value = '';
        confirmPasswordWrap.hidden = true;
        passwordStep.hidden = true;
    }

    function showPasswordStep(hasPassword) {
        needsPasswordSetup = !hasPassword;
        confirmPasswordWrap.hidden = hasPassword;
        confirmPassword.required = !hasPassword;
        loginPassword.autocomplete = hasPassword ? 'current-password' : 'new-password';
        loginPassword.placeholder = hasPassword ? 'Saisissez votre mot de passe' : 'Choisissez un mot de passe (8 caractères min.)';
        loginPasswordLabel.textContent = hasPassword ? 'Mot de passe' : 'Nouveau mot de passe';
        emailLoginBtnText.textContent = hasPassword ? 'Se connecter' : 'Définir mon mot de passe';
        passwordStep.hidden = false;
    }

    async function checkEmailExists() {
        const email = loginEmail.value.trim().toLowerCase();
        if (!loginEmail.validity.valid) {
            hidePasswordStep();
            setEmailFeedback(email ? 'Saisissez une adresse e-mail valide.' : '');
            return;
        }

        setEmailFeedback('Vérification de votre adresse…');
        try {
            // Cette route existe déjà et fournit les comptes enregistrés.
            const response = await fetch(`${API_URL}/auth/users`, {
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            if (!response.ok) throw new Error('Impossible de vérifier l\'adresse e-mail.');

            const result = await response.json();
            const users = Array.isArray(result?.data?.users) ? result.data.users : [];
            const user = users.find((item) => String(item.email || '').trim().toLowerCase() === email);

            // Ne met pas à jour l'interface si l'utilisateur a changé l'e-mail
            // pendant la requête réseau.
            if (loginEmail.value.trim().toLowerCase() !== email) return;

            if (!user) {
                hidePasswordStep();
                setEmailFeedback('Aucun compte ne correspond à cette adresse e-mail.', 'error');
                return;
            }

            verifiedEmail = email;
            showPasswordStep(!!user.has_password);
            setEmailFeedback(
                user.has_password
                    ? 'Adresse reconnue. Saisissez votre mot de passe.'
                    : 'Première connexion : choisissez votre mot de passe.',
                'success'
            );
            loginPassword.focus();
        } catch (error) {
            console.error('Erreur de vérification e-mail', error);
            hidePasswordStep();
            setEmailFeedback(error.message || 'Vérification indisponible.', 'error');
        }
    }

    loginEmail.addEventListener('input', () => {
        hidePasswordStep();
        window.clearTimeout(emailLookupTimer);
        const email = loginEmail.value.trim();
        if (!email) {
            setEmailFeedback('');
            return;
        }
        emailLookupTimer = window.setTimeout(checkEmailExists, 450);
    });
    loginEmail.addEventListener('blur', checkEmailExists);

    emailLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (verifiedEmail !== loginEmail.value.trim().toLowerCase() || !loginPassword.value) {
            setEmailFeedback('Vérifiez votre adresse e-mail puis saisissez votre mot de passe.', 'error');
            return;
        }

        if (needsPasswordSetup) {
            if (loginPassword.value.length < 8) {
                setEmailFeedback('Le mot de passe doit contenir au moins 8 caractères.', 'error');
                return;
            }
            if (loginPassword.value !== confirmPassword.value) {
                setEmailFeedback('Les deux mots de passe ne correspondent pas.', 'error');
                return;
            }
        }

        try {
            setEmailFeedback(needsPasswordSetup ? 'Enregistrement du mot de passe...' : 'Connexion en cours...', '');

            const endpoint = needsPasswordSetup ? 'auth/set-password' : 'auth/login';
            const response = await fetch(`${API_URL}/${endpoint}`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: verifiedEmail,
                    password: loginPassword.value
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.message || 'Identifiants incorrects');
            }

            const result = await response.json();
            
            // Stocker le token et les données utilisateur
            localStorage.setItem('token', result.data.token);
            localStorage.setItem('user', JSON.stringify(result.data.user));
            
            setEmailFeedback('Connexion réussie ! Redirection...', 'success');

            setTimeout(() => {
                redirectAfterLogin(result.data.user);
            }, 1000);
            
        } catch (error) {
            console.error('Erreur de connexion', error);
            setEmailFeedback(error.message || 'Échec de la connexion', 'error');
        }
    });

    let isScanning = false;

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

    function resetScanner(delay = 2500) {
        setTimeout(() => {
            scannerBox.classList.remove('scanning', 'success');
            scannerIcon.classList.remove('fa-check-circle');
            scannerIcon.classList.add('fa-fingerprint');
            statusMessage.textContent = "En attente du lecteur d'empreinte...";
            statusMessage.className = 'status-message';
        }, delay);
    }

    async function biometricLogin() {
        if (isScanning) return;

        if (!window.PublicKeyCredential) {
            statusMessage.textContent = "Ce navigateur ne supporte pas l'authentification biométrique (WebAuthn).";
            statusMessage.className = 'status-message error';
            return;
        }

        isScanning = true;
        scannerBox.classList.add('scanning');
        statusMessage.textContent = 'Analyse biométrique en cours...';
        statusMessage.className = 'status-message';

        try {
            const challengeResponse = await fetch(`${API_URL}/auth/webauthn/discoverable-login-challenge`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            if (!challengeResponse.ok) {
                throw new Error('Impossible de contacter le serveur');
            }
            const challengeBody = await challengeResponse.json();
            const challenge = challengeBody.data.challenge;

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: base64URLToBuffer(challenge),
                    rpId: RP_ID,
                    userVerification: 'required',
                    timeout: 60000
                }
            });

            const payload = {
                id: assertion.id,
                rawId: bufferToBase64URL(assertion.rawId),
                type: assertion.type,
                response: {
                    clientDataJSON: bufferToBase64URL(assertion.response.clientDataJSON),
                    authenticatorData: bufferToBase64URL(assertion.response.authenticatorData),
                    signature: bufferToBase64URL(assertion.response.signature),
                    userHandle: assertion.response.userHandle ? bufferToBase64URL(assertion.response.userHandle) : null
                }
            };

            const verifyResponse = await fetch(`${API_URL}/auth/webauthn/discoverable-login-verify`, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!verifyResponse.ok) {
                const body = await verifyResponse.json().catch(() => ({}));
                throw new Error(body?.message || 'Empreinte non reconnue');
            }

            const result = await verifyResponse.json();
            localStorage.setItem('token', result.data.token);
            localStorage.setItem('user', JSON.stringify(result.data.user));

            scannerBox.classList.remove('scanning');
            scannerBox.classList.add('success');
            scannerIcon.classList.remove('fa-fingerprint');
            scannerIcon.classList.add('fa-check-circle');

            const firstName = result.data.user?.first_name || '';
            statusMessage.textContent = `Identité confirmée${firstName ? ' : ' + firstName : ''}. Redirection...`;
            statusMessage.className = 'status-message success';

            setTimeout(() => {
                redirectAfterLogin(result.data.user);
            }, 1000);
        } catch (error) {
            console.error('Erreur connexion biométrique', error);
            scannerBox.classList.remove('scanning');
            const message = error?.name === 'NotAllowedError'
                ? 'Scan annulé ou empreinte non reconnue'
                : (error.message || "Échec de l'authentification");
            statusMessage.textContent = message;
            statusMessage.className = 'status-message error';
            resetScanner();
        } finally {
            isScanning = false;
        }
    }

    scannerBox.addEventListener('click', biometricLogin);
});
document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. EFFET 3D ET PARALLAXE DE LA SOURIS
    // ==========================================
    const bgImage = document.getElementById('bgImage');
    const loginCard = document.getElementById('loginCard');

    document.addEventListener('mousemove', (e) => {
        const xAxis = (window.innerWidth / 2 - e.pageX);
        const yAxis = (window.innerHeight / 2 - e.pageY);

        if (bgImage) {
            bgImage.style.transform = `translate(${xAxis / 60}px, ${yAxis / 60}px) scale(1.1)`;
        }

        if (loginCard) {
            const rotateX = yAxis / 120;
            const rotateY = -xAxis / 120;
            loginCard.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        }
    });

    document.addEventListener('mouseleave', () => {
        if (loginCard) loginCard.style.transform = `rotateX(0deg) rotateY(0deg)`;
        if (bgImage) bgImage.style.transform = `translate(0px, 0px) scale(1.1)`;
    });

    // ==========================================
    // 2. CONNEXION BIOMÉTRIQUE RÉELLE (WebAuthn)
    // ==========================================
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const API_URL = isLocal ? 'http://localhost:8080/api/v1' : 'https://api-lunetterie.universearch.com/api/v1';
    const RP_ID = isLocal ? 'localhost' : window.location.hostname;
    const scannerBox = document.getElementById('scannerBox');
    const statusMessage = document.getElementById('statusMessage');
    const scannerIcon = document.getElementById('scannerIcon');

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
            statusMessage.textContent = "❌ Ce navigateur ne supporte pas l'authentification biométrique (WebAuthn).";
            statusMessage.className = 'status-message error';
            return;
        }

        isScanning = true;
        scannerBox.classList.add('scanning');
        statusMessage.textContent = 'Analyse biométrique en cours...';
        statusMessage.className = 'status-message';

        try {
            const challengeResponse = await fetch(`${API_URL}/auth/webauthn/discoverable-login-challenge`, {
                method: 'POST'
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
                window.location.href = 'admin.html';
            }, 1000);
        } catch (error) {
            console.error('Erreur connexion biométrique', error);
            scannerBox.classList.remove('scanning');
            const message = error?.name === 'NotAllowedError'
                ? 'Scan annulé ou empreinte non reconnue'
                : (error.message || "Échec de l'authentification");
            statusMessage.textContent = '❌ ' + message;
            statusMessage.className = 'status-message error';
            resetScanner();
        } finally {
            isScanning = false;
        }
    }

    scannerBox.addEventListener('click', biometricLogin);
});

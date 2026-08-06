// Garde d'accès commune à toutes les pages protégées : vérifie qu'un token
// existe et qu'il est validé côté serveur. Cela réduit le risque de contournement
// côté client et force un contrôle API côté backend.
(function () {
    'use strict';

    var API_BASE = (window.API_BASE_URL || window.API_URL || 'https://api-lunetterie.universearch.com/api/v1').replace(/\/$/, '');
    var ROLE_HOME = {
        SUPER_ADMIN: 'direction.html',
        ADMIN: 'admin.html',
        MAGASINIER: 'scan.html',
        VENDEUR: 'presentoir.html',
        LABORATOIRE: 'presentoir.html',
        RESPONSABLE_STATION: 'presentoir.html'
    };
    var ROLE_ALIASES = {
        DIRECTION: 'ADMIN',
        SUPER_DIRECTEUR: 'SUPER_ADMIN'
    };

    function normalizeRoleName(value) {
        if (!value) {
            return null;
        }
        var name = String(value).trim().toUpperCase().replace(/\s+/g, '_');
        return ROLE_ALIASES[name] || name;
    }

    function getRoleName(user) {
        if (!user) {
            return null;
        }
        return normalizeRoleName(user.role_name || user.role || (user.role_id ? String(user.role_id) : null));
    }

    function isStandaloneApp() {
        try {
            return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
        } catch (error) {
            return false;
        }
    }

    var INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
    var LAST_ACTIVITY_KEY = 'lastActivityAt';
    var lastMarkedAt = 0;

    function markActivity() {
        var now = Date.now();
        if (now - lastMarkedAt < 5000) {
            return;
        }
        lastMarkedAt = now;
        try {
            localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        } catch (error) {
            // ignore
        }
    }

    function isInactiveTooLong() {
        var last = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
        return !!last && (Date.now() - last) > INACTIVITY_LIMIT_MS;
    }

    function clearSession() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem(LAST_ACTIVITY_KEY);
    }

    function forceLogout(reason) {
        clearSession();
        window.location.replace('index.html' + (reason ? '?reason=' + reason : ''));
    }

    async function verifyTokenWithServer(token) {
        try {
            var response = await fetch(API_BASE + '/auth/me', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                return null;
            }
            var payload = await response.json();
            return payload && payload.data && payload.data.user ? payload.data.user : null;
        } catch (error) {
            console.error('Erreur vérification token:', error);
            return null;
        }
    }

    window.protectPage = async function (allowedRoles) {
        var token = localStorage.getItem('token');
        if (!token) {
            window.location.replace('index.html');
            return;
        }

        if (!isStandaloneApp() && isInactiveTooLong()) {
            forceLogout('inactivite');
            return;
        }

        var user = await verifyTokenWithServer(token);
        if (!user) {
            forceLogout();
            return;
        }

        localStorage.setItem('user', JSON.stringify(user));

        if (Array.isArray(allowedRoles) && allowedRoles.length) {
            var role = getRoleName(user);
            if (!role || allowedRoles.indexOf(role) === -1) {
                window.location.replace(ROLE_HOME[role] || 'index.html');
                return;
            }
        }

        if (!isStandaloneApp()) {
            markActivity();
            document.addEventListener('DOMContentLoaded', function () {
                ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach(function (evt) {
                    document.addEventListener(evt, markActivity, { passive: true });
                });
            });
        }
    };

    window.redirectIfAuthenticated = async function () {
        var token = localStorage.getItem('token');
        if (!token) {
            return;
        }

        if (!isStandaloneApp() && isInactiveTooLong()) {
            clearSession();
            return;
        }

        var user = await verifyTokenWithServer(token);
        if (!user) {
            clearSession();
            return;
        }

        localStorage.setItem('user', JSON.stringify(user));
        var role = getRoleName(user);
        window.location.replace(ROLE_HOME[role] || 'admin.html');
    };

    Object.defineProperty(window, 'protectPage', {
        writable: false,
        configurable: false
    });
    Object.defineProperty(window, 'redirectIfAuthenticated', {
        writable: false,
        configurable: false
    });
})();

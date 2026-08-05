// Garde d'accès commune à toutes les pages protégées : vérifie qu'un token
// et un utilisateur existent en localStorage, puis (si des rôles sont
// précisés) que le rôle de l'utilisateur correspond bien à cette page.
// Doit être chargé en tout premier dans <head>, avant tout autre script ou
// CSS : un <script src> classique est bloquant, donc le rendu du <body> est
// suspendu tant que ce fichier ne s'est pas exécuté, ce qui évite d'afficher
// la page protégée avant que la vérification n'ait eu lieu.
//
// Sécurité : ce contrôle est purement côté client (présence du token, pas
// vérification de sa validité auprès du serveur). Il empêche l'accès direct
// aux pages par URL sans être connecté ou avec le mauvais rôle, mais ne
// remplace pas un contrôle d'accès côté API — un token expiré ou falsifié
// n'est détecté que lorsque l'appel réseau correspondant échoue.
(function () {
    var ROLE_HOME = {
        SUPER_ADMIN: 'direction.html',
        ADMIN: 'admin.html',
        MAGASINIER: 'scan.html',
        VENDEUR: 'presentoir.html',
        LABORATOIRE: 'presentoir.html',
        RESPONSABLE_STATION: 'presentoir.html'
    };
    var ROLE_ID_TO_NAME = {
        1: 'SUPER_ADMIN', 2: 'ADMIN', 3: 'MAGASINIER', 4: 'VENDEUR',
        5: 'LABORATOIRE', 6: 'RESPONSABLE_STATION', 7: 'DIRECTION', 8: 'SUPER_DIRECTEUR'
    };

    // "Direction" et "Super directeur" ne sont pas des postes distincts dans
    // l'équipe : ce sont les mêmes personnes qu'"Administrateur" et "Super
    // administrateur" (voir aussi login.js). On les ramène à ces deux seuls
    // rôles dès la lecture, pour qu'aucune autre partie du code n'ait à
    // connaître ces alias.
    var ROLE_ALIASES = { DIRECTION: 'ADMIN', SUPER_DIRECTEUR: 'SUPER_ADMIN' };

    function normalizeRoleName(value) {
        if (!value) return null;
        var name = String(value).trim().toUpperCase().replace(/\s+/g, '_');
        return ROLE_ALIASES[name] || name;
    }

    function getRoleName(user) {
        return normalizeRoleName(user && (user.role_name || user.role || ROLE_ID_TO_NAME[user.role_id]));
    }

    // Détecte le mode "installé" (ajouté à l'écran d'accueil / lancé comme
    // une app, sans barre d'adresse) : Android/Chrome via la media query
    // display-mode, iOS Safari via navigator.standalone. Dans ce cas précis
    // l'appareil est presumé personnel/dédié à un poste — comme Facebook ou
    // WhatsApp, la session reste ouverte indéfiniment tant que l'utilisateur
    // ne se déconnecte pas lui-même. Le contrôle par inactivité ci-dessous
    // ne s'applique donc qu'à un onglet de navigateur classique (poste
    // partagé/kiosque), où le risque d'un appareil oublié connecté est réel.
    function isStandaloneApp() {
        try {
            return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
        } catch (error) { return false; }
    }

    // Déconnexion automatique après une longue inactivité : le token et les
    // infos utilisateur restent en clair dans localStorage (inévitable côté
    // front pur — voir note de sécurité en tête de fichier), donc la seule
    // protection réaliste contre un appareil oublié connecté est de réduire
    // la fenêtre pendant laquelle cette session reste exploitable.
    var INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 60 min sans interaction
    var LAST_ACTIVITY_KEY = 'lastActivityAt';
    var lastMarkedAt = 0;

    function markActivity() {
        var now = Date.now();
        if (now - lastMarkedAt < 5000) return; // écrit au plus une fois toutes les 5s
        lastMarkedAt = now;
        try { localStorage.setItem(LAST_ACTIVITY_KEY, String(now)); } catch (error) { /* ignore */ }
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

    // allowedRoles omis ou vide = simple contrôle de connexion, sans
    // restriction de rôle.
    window.protectPage = function (allowedRoles) {
        var token = localStorage.getItem('token');
        var user = null;
        try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { user = null; }

        if (!token || !user) {
            window.location.replace('index.html');
            return;
        }

        var standalone = isStandaloneApp();

        if (!standalone && isInactiveTooLong()) {
            forceLogout('inactivite');
            return;
        }

        if (Array.isArray(allowedRoles) && allowedRoles.length) {
            var role = getRoleName(user);
            if (!role || allowedRoles.indexOf(role) === -1) {
                window.location.replace(ROLE_HOME[role] || 'index.html');
                return;
            }
        }

        if (standalone) return;

        markActivity();
        document.addEventListener('DOMContentLoaded', function () {
            ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach(function (evt) {
                document.addEventListener(evt, markActivity, { passive: true });
            });
        });
    };

    // Pour index.html (la page de connexion) uniquement : si l'utilisateur
    // est déjà connecté, on le renvoie tout de suite vers sa page — sans ça,
    // le bouton/geste "retour" du téléphone peut faire réapparaître l'écran
    // de connexion après navigation vers une autre page du site, alors que
    // la session est toujours active (ce n'est pas une déconnexion, juste un
    // retour dans l'historique du navigateur). Grâce à ça, "retour" ramène
    // toujours vers une page du site tant qu'on ne s'est pas explicitement
    // déconnecté — exactement comme les boutons retour internes du site.
    window.redirectIfAuthenticated = function () {
        var token = localStorage.getItem('token');
        var user = null;
        try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch (error) { user = null; }
        if (!token || !user) return;

        // Session expirée par inactivité : on nettoie et on laisse l'écran de
        // connexion s'afficher normalement plutôt que de renvoyer vers une
        // page protégée qui va de toute façon rediriger ici.
        if (!isStandaloneApp() && isInactiveTooLong()) {
            clearSession();
            return;
        }

        var role = getRoleName(user);
        window.location.replace(ROLE_HOME[role] || 'admin.html');
    };
})();

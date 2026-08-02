/* Panneaux de message partagés : remplacent les alertes système par une
   interface coulissante cohérente avec le suivi de l'historique. */
(function () {
    let noticeTimer;
    let confirmResolver;

    function ensureUi() {
        let root = document.getElementById('uiSliderRoot');
        if (root) return root;
        if (!document.body) return null;
        root = document.createElement('div');
        root.id = 'uiSliderRoot';
        root.innerHTML = '<div class="ui-slider-shade"></div>' +
            '<aside class="ui-slider-notice" role="status" aria-live="polite"><button type="button" class="ui-slider-close" aria-label="Fermer">×</button><p></p></aside>' +
            '<aside class="ui-slider-confirm" role="dialog" aria-modal="true" aria-labelledby="uiSliderConfirmMessage"><h2>Confirmation</h2><p id="uiSliderConfirmMessage"></p><div><button type="button" class="ui-slider-cancel">Annuler</button><button type="button" class="ui-slider-accept">Confirmer</button></div></aside>';
        document.body.appendChild(root);

        const style = document.createElement('style');
        style.textContent = '#uiSliderRoot{position:fixed;inset:0;z-index:10000;pointer-events:none;font-family:Inter,ui-sans-serif,system-ui,sans-serif}' +
            '.ui-slider-shade{position:absolute;inset:0;background:rgba(15,23,42,.45);opacity:0;transition:opacity .25s}' +
            '.ui-slider-notice,.ui-slider-confirm{position:absolute;right:0;width:min(420px,100%);background:var(--surface,#fff);color:var(--ink,#0f172a);border-left:1px solid var(--line,#e2e8f0);box-shadow:0 24px 48px -16px rgba(15,23,42,.35);transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);pointer-events:auto}' +
            '.ui-slider-notice{top:22px;min-height:86px;padding:22px 50px 22px 24px}.ui-slider-notice p,.ui-slider-confirm p{margin:0;font-size:14px;line-height:1.45}.ui-slider-close{position:absolute;top:14px;right:14px;border:0;background:var(--line-soft,#edf1f7);color:inherit;border-radius:8px;width:30px;height:30px;font-size:22px;line-height:1;cursor:pointer}' +
            '.ui-slider-confirm{top:0;height:100%;padding:30px 26px;display:flex;flex-direction:column}.ui-slider-confirm h2{margin:0 0 12px;font-size:19px}.ui-slider-confirm div{display:flex;justify-content:flex-end;gap:10px;margin-top:auto}.ui-slider-confirm button{border:1px solid var(--line,#e2e8f0);border-radius:999px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer;background:var(--surface,#fff);color:inherit}.ui-slider-confirm .ui-slider-accept{background:var(--primary,#2563eb);border-color:var(--primary,#2563eb);color:#fff}' +
            '#uiSliderRoot.notice-open .ui-slider-notice,#uiSliderRoot.confirm-open .ui-slider-confirm{transform:translateX(0)}#uiSliderRoot.confirm-open .ui-slider-shade{opacity:1;pointer-events:auto}' +
            '@media(max-width:640px){.ui-slider-notice,.ui-slider-confirm{right:auto;bottom:0;top:auto;width:100%;border-left:0;border-top:1px solid var(--line,#e2e8f0);border-radius:22px 22px 0 0;transform:translateY(100%)}.ui-slider-notice{min-height:96px;padding:24px 52px 24px 22px}.ui-slider-confirm{height:auto;min-height:260px}.ui-slider-confirm div{margin-top:28px}#uiSliderRoot.notice-open .ui-slider-notice,#uiSliderRoot.confirm-open .ui-slider-confirm{transform:translateY(0)}}';
        document.head.appendChild(style);

        root.querySelector('.ui-slider-close').addEventListener('click', closeNotice);
        root.querySelector('.ui-slider-cancel').addEventListener('click', function () { closeConfirm(false); });
        root.querySelector('.ui-slider-accept').addEventListener('click', function () { closeConfirm(true); });
        root.querySelector('.ui-slider-shade').addEventListener('click', function () { closeConfirm(false); });
        return root;
    }

    function closeNotice() {
        const root = ensureUi();
        if (root) root.classList.remove('notice-open');
        clearTimeout(noticeTimer);
    }

    function closeConfirm(result) {
        const root = ensureUi();
        if (!root || !root.classList.contains('confirm-open')) return;
        root.classList.remove('confirm-open');
        const resolve = confirmResolver;
        confirmResolver = null;
        if (resolve) resolve(result);
    }

    window.showSliderNotice = function (message) {
        const root = ensureUi();
        if (!root) return;
        root.querySelector('.ui-slider-notice p').textContent = String(message || 'Information');
        root.classList.add('notice-open');
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(closeNotice, 5000);
    };

    window.showSliderConfirm = function (message) {
        const root = ensureUi();
        if (!root) return Promise.resolve(false);
        root.querySelector('#uiSliderConfirmMessage').textContent = String(message || 'Confirmer cette action ?');
        root.classList.add('confirm-open');
        root.querySelector('.ui-slider-cancel').focus();
        return new Promise(function (resolve) { confirmResolver = resolve; });
    };

    // Toutes les alertes existantes sont rendues sous forme de panneau glissant.
    window.alert = function (message) { window.showSliderNotice(message); };
}());

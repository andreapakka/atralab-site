/* SITO SHOP — consenso adattato dal flusso ATRALAB; indipendente da ATRALAB. */
(() => {
  'use strict';
  const KEY = 'sito_shop_cookie_consent';
  // Da configurare con l'ID GA4 del negoziante; vuoto significa Analytics disabilitato.
  const GA_ID = '';
  let lastFocus = null;
  let gaInserted = false;

  function readConsent() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && typeof v.analytics === 'boolean' ? v : null;
    } catch (_) { return null; }
  }
  function analyticsOff() {
    if (!GA_ID) return;
    window['ga-disable-' + GA_ID] = true;
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied', ad_storage: 'denied',
        ad_user_data: 'denied', ad_personalization: 'denied'
      });
    }
  }
  function analyticsOn() {
    if (!/^G-[A-Z0-9]+$/.test(GA_ID)) return;
    window['ga-disable-' + GA_ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    if (!gaInserted) {
      gaInserted = true;
      const sc = document.createElement('script');
      sc.async = true;
      sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
      document.head.appendChild(sc);
      window.gtag('js', new Date());
      window.gtag('config', GA_ID, {allow_google_signals: false, allow_ad_personalization_signals: false});
    } else {
      window.gtag('consent', 'update', {analytics_storage: 'granted'});
    }
  }
  function apply(v) { if (v && v.analytics) analyticsOn(); else analyticsOff(); }
  function save(analytics) {
    const v = {analytics: Boolean(analytics), updatedAt: new Date().toISOString()};
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { console.warn('Consenso non memorizzato', e); }
    apply(v); close();
  }
  function panel() { return document.getElementById('sitoShopCookiePanel'); }
  function build() {
    if (panel()) return;
    const div = document.createElement('div');
    div.id = 'sitoShopCookiePanel';
    div.className = 'cookie-panel';
    div.hidden = true;
    div.innerHTML = `
      <div class="cookie-card" role="dialog" aria-modal="true" aria-labelledby="cookieTitle">
        <button class="cookie-close" type="button" data-cookie-action="reject" aria-label="Chiudi e rifiuta Analytics">×</button>
        <div class="cookie-main" data-cookie-view="main">
          <p class="cookie-eyebrow">Privacy</p>
          <h2 id="cookieTitle">Cookie e statistiche</h2>
          <p>SITO SHOP utilizza funzionalità necessarie alla navigazione. Con il tuo consenso potrà usare Google Analytics per statistiche di utilizzo, quando sarà configurato. <a href="privacy.html">Informativa privacy</a>.</p>
          <div class="cookie-actions">
            <button class="cookie-button cookie-button-primary" type="button" data-cookie-action="accept">Accetta</button>
            <button class="cookie-button" type="button" data-cookie-action="reject">Rifiuta</button>
            <button class="cookie-button cookie-button-text" type="button" data-cookie-action="preferences">Preferenze</button>
          </div>
        </div>
        <div class="cookie-preferences" data-cookie-view="preferences" hidden>
          <p class="cookie-eyebrow">Preferenze</p><h2>Gestisci cookie</h2>
          <div class="cookie-option"><div><strong>Necessari</strong><p>Funzioni tecniche e preferenze locali del sito.</p></div><span class="cookie-required">Sempre attivi</span></div>
          <label class="cookie-option cookie-option-toggle"><div><strong>Statistiche</strong><p>Google Analytics, soltanto dopo il consenso e quando configurato.</p></div><input id="shopAnalyticsConsent" type="checkbox"></label>
          <div class="cookie-actions">
            <button class="cookie-button cookie-button-primary" type="button" data-cookie-action="save">Salva preferenze</button>
            <button class="cookie-button cookie-button-text" type="button" data-cookie-action="back">Indietro</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div);
    div.addEventListener('click', e => { if (e.target === div) close(); });
    div.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const controls = [...div.querySelectorAll('button:not([hidden]), input:not([hidden]), a[href]')].filter(el => el.getClientRects().length);
        if (!controls.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  function view(prefs) {
    panel().querySelector('[data-cookie-view="main"]').hidden = prefs;
    panel().querySelector('[data-cookie-view="preferences"]').hidden = !prefs;
    const check = document.getElementById('shopAnalyticsConsent');
    if (check) check.checked = readConsent()?.analytics === true;
  }
  function open(prefs = false) {
    build(); lastFocus = document.activeElement; view(prefs);
    panel().hidden = false; document.documentElement.classList.add('cookie-open');
    panel().querySelector('.cookie-close').focus();
  }
  function close() {
    if (panel()) panel().hidden = true;
    document.documentElement.classList.remove('cookie-open');
    if (lastFocus?.isConnected) lastFocus.focus();
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-shop-cookie-manage]')) { e.preventDefault(); open(true); return; }
    const btn = e.target.closest('[data-cookie-action]');
    if (!btn || !panel()?.contains(btn)) return;
    switch (btn.dataset.cookieAction) {
      case 'accept': save(true); break;
      case 'reject': save(false); break;
      case 'save': save(Boolean(document.getElementById('shopAnalyticsConsent')?.checked)); break;
      case 'preferences': view(true); break;
      case 'back': view(false); break;
    }
  });
  function start() { build(); const saved = readConsent(); if (saved) apply(saved); else { analyticsOff(); open(); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();

/* --------------------------------------------------
   ATRALAB - Accesso pagine protette
   Le pagine NON presenti in ATRALAB_PUBLIC_PATHS sono protette.
   Per rendere pubblica una pagina, aggiungerla qui.
-------------------------------------------------- */

const ATRALAB_AUTH_URL = "https://ukoaefhtvhqqdchjnzby.supabase.co";
const ATRALAB_AUTH_KEY = "sb_publishable_hUhoYFMepUOJlJiy6RfBcg_LHf_V6cU";
const ATRALAB_AUTH_STORAGE_KEY = "atralab-auth";
const ATRALAB_RETURN_URL_KEY = "atralab-return-url";

/* PAGINE PUBBLICHE ATRALAB - MODIFICARE QUI */
const ATRALAB_PUBLIC_PATHS = [
  "/",
  "/index.html",
  "/auth/",
  "/auth/index.html",
  "/privacy/",
  "/privacy/index.html",
  "/contacts/",
  "/contacts/index.html"
];

function normalizeAtralabPath(pathname) {
  let path = pathname || "/";
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}

function isAtralabPublicPage() {
  return ATRALAB_PUBLIC_PATHS.includes(
    normalizeAtralabPath(window.location.pathname)
  );
}

function getAtralabAuthToken() {
  try {
    return localStorage.getItem(ATRALAB_AUTH_STORAGE_KEY);
  } catch (error) {
    console.warn("ATRALAB auth localStorage:", error);
    return null;
  }
}

function clearAtralabAuthToken() {
  try {
    localStorage.removeItem(ATRALAB_AUTH_STORAGE_KEY);
  } catch (error) {
    console.warn("ATRALAB auth localStorage:", error);
  }
}

function saveAtralabReturnUrl() {
  try {
    const currentUrl =
      window.location.pathname +
      window.location.search +
      window.location.hash;

    localStorage.setItem(ATRALAB_RETURN_URL_KEY, currentUrl);
  } catch (error) {
    console.warn("ATRALAB return URL:", error);
  }
}

function redirectToAtralabAuth() {
  saveAtralabReturnUrl();
  window.location.replace("/auth/");
}

async function checkAtralabAccess() {
  if (isAtralabPublicPage()) return true;

  const token = getAtralabAuthToken();

  if (!token) {
    redirectToAtralabAuth();
    return false;
  }

  try {
    const response = await fetch(
      `${ATRALAB_AUTH_URL}/rest/v1/rpc/check_atralab_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": ATRALAB_AUTH_KEY
        },
        body: JSON.stringify({
          p_token: token
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Verifica accesso fallita (${response.status})`);
    }

    const isValid = await response.json();

    if (isValid === true) return true;

    clearAtralabAuthToken();
    redirectToAtralabAuth();
    return false;
  } catch (error) {
    console.error("ATRALAB auth:", error);
    clearAtralabAuthToken();
    redirectToAtralabAuth();
    return false;
  }
}

async function logoutAtralab() {
  const token = getAtralabAuthToken();

  if (token) {
    try {
      await fetch(
        `${ATRALAB_AUTH_URL}/rest/v1/rpc/logout_atralab_user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": ATRALAB_AUTH_KEY
          },
          body: JSON.stringify({
            p_token: token
          })
        }
      );
    } catch (error) {
      console.warn("ATRALAB logout:", error);
    }
  }

  clearAtralabAuthToken();

  try {
    localStorage.removeItem(ATRALAB_RETURN_URL_KEY);
  } catch (error) {
    console.warn("ATRALAB logout localStorage:", error);
  }

  window.location.replace("/");
}

document.addEventListener("click", function (event) {
  const logoutLink = event.target.closest("[data-atralab-logout]");

  if (!logoutLink) return;

  event.preventDefault();
  logoutAtralab();
});

/* Avvia il controllo prima della normale inizializzazione condivisa. */
checkAtralabAccess();

function loadCommonHead() {
  const head = document.head;

  // Favicon SVG
  if (!document.querySelector('link[rel="icon"][href="/assets/icons/favicon.svg"]')) {
    const faviconSvg = document.createElement("link");
    faviconSvg.rel = "icon";
    faviconSvg.href = "/assets/icons/favicon.svg";
    faviconSvg.type = "image/svg+xml";
    head.appendChild(faviconSvg);
  }

  // Favicon ICO fallback
  if (!document.querySelector('link[rel="icon"][href="/assets/icons/favicon.ico"]')) {
    const faviconIco = document.createElement("link");
    faviconIco.rel = "icon";
    faviconIco.href = "/assets/icons/favicon.ico";
    faviconIco.sizes = "any";
    head.appendChild(faviconIco);
  }

  // Cookie consent CSS
  if (!document.querySelector('link[rel="stylesheet"][href="/css/cookie.css"]')) {
    const cookieCss = document.createElement("link");
    cookieCss.rel = "stylesheet";
    cookieCss.href = "/css/cookie.css";
    head.appendChild(cookieCss);
  }
}

async function loadIncludes() {
  const elements = document.querySelectorAll("[data-include]");

  for (const element of elements) {
    const file = element.getAttribute("data-include");

    try {
      const response = await fetch(file);

      if (!response.ok) {
        throw new Error(`Impossibile caricare ${file}`);
      }

      element.innerHTML = await response.text();
    } catch (error) {
      console.error(error);
    }
  }
}

loadCommonHead();
loadIncludes();

function updateBackToTop() {
  const button = document.getElementById("backToTop");

  if (!button) return;

  button.classList.toggle("show", window.scrollY > 300);
}

window.addEventListener("scroll", updateBackToTop, { passive: true });

document.addEventListener("click", function (event) {
  const button = event.target.closest("#backToTop");

  if (!button) return;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});

/* Il footer viene caricato dinamicamente */
const backToTopObserver = new MutationObserver(() => {
  if (document.getElementById("backToTop")) {
    updateBackToTop();
  }
});

backToTopObserver.observe(document.body, {
  childList: true,
  subtree: true
});


/* --------------------------------------------------
   ATRALAB - Cookie consent / Google Analytics
   Google Analytics viene caricato solo dopo consenso.
-------------------------------------------------- */

const ATRALAB_GA_ID = "G-WKHLHR0YE3";
const ATRALAB_CONSENT_KEY = "atralab-cookie-consent-v1";

function getAtralabConsent() {
  try {
    const saved = localStorage.getItem(ATRALAB_CONSENT_KEY);

    if (!saved) return null;

    const parsed = JSON.parse(saved);

    if (typeof parsed?.analytics !== "boolean") {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn("ATRALAB cookie consent:", error);
    return null;
  }
}

function saveAtralabConsent(analytics) {
  const consent = {
    analytics: Boolean(analytics),
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(
      ATRALAB_CONSENT_KEY,
      JSON.stringify(consent)
    );
  } catch (error) {
    console.warn("ATRALAB cookie consent:", error);
  }

  applyAtralabConsent(consent);
  closeAtralabCookiePanel();
}

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];

  if (typeof window.gtag !== "function") {
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
  }
}

function loadGoogleAnalytics() {
  if (window.__atralabGaLoaded) return;

  window.__atralabGaLoaded = true;
  window[`ga-disable-${ATRALAB_GA_ID}`] = false;

  ensureGtag();

  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ATRALAB_GA_ID)}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", ATRALAB_GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
}

function disableGoogleAnalytics() {
  window[`ga-disable-${ATRALAB_GA_ID}`] = true;

  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
  }
}

function applyAtralabConsent(consent) {
  if (consent?.analytics === true) {
    loadGoogleAnalytics();
  } else {
    disableGoogleAnalytics();
  }
}

function createAtralabCookiePanel() {
  if (document.getElementById("atralabCookiePanel")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "atralabCookiePanel";
  wrapper.className = "cookie-panel";
  wrapper.hidden = true;

  wrapper.innerHTML = `
    <div class="cookie-card" role="dialog" aria-modal="true" aria-labelledby="cookieTitle">
      <button
        class="cookie-close"
        type="button"
        data-cookie-action="reject"
        aria-label="Chiudi e rifiuta i cookie di analisi"
      >×</button>

      <div class="cookie-main" data-cookie-view="main">
        <p class="cookie-eyebrow">Privacy</p>
        <h2 id="cookieTitle">Cookie e statistiche</h2>
        <p>
          ATRALAB usa strumenti necessari al funzionamento del sito.
          Con il tuo consenso usa Google Analytics per capire, in forma statistica,
          come vengono utilizzate le pagine.
        </p>

        <div class="cookie-actions">
          <button class="cookie-button cookie-button-primary" type="button" data-cookie-action="accept">
            Accetta
          </button>
          <button class="cookie-button" type="button" data-cookie-action="reject">
            Rifiuta
          </button>
          <button class="cookie-button cookie-button-text" type="button" data-cookie-action="preferences">
            Preferenze
          </button>
        </div>
      </div>

      <div class="cookie-preferences" data-cookie-view="preferences" hidden>
        <p class="cookie-eyebrow">Preferenze</p>
        <h2>Gestisci cookie</h2>

        <div class="cookie-option">
          <div>
            <strong>Necessari</strong>
            <p>Servono al funzionamento e alle preferenze locali di ATRALAB.</p>
          </div>
          <span class="cookie-required">Sempre attivi</span>
        </div>

        <label class="cookie-option cookie-option-toggle">
          <div>
            <strong>Analytics</strong>
            <p>Google Analytics per statistiche sull'utilizzo del sito.</p>
          </div>
          <input id="atralabAnalyticsConsent" type="checkbox">
        </label>

        <div class="cookie-actions">
          <button class="cookie-button cookie-button-primary" type="button" data-cookie-action="save">
            Salva preferenze
          </button>
          <button class="cookie-button cookie-button-text" type="button" data-cookie-action="back">
            Indietro
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);
}

function setCookiePanelView(view) {
  const panel = document.getElementById("atralabCookiePanel");

  if (!panel) return;

  const main = panel.querySelector('[data-cookie-view="main"]');
  const preferences = panel.querySelector('[data-cookie-view="preferences"]');

  if (main) main.hidden = view !== "main";
  if (preferences) preferences.hidden = view !== "preferences";
}

function openAtralabCookiePanel(preferences = false) {
  createAtralabCookiePanel();

  const panel = document.getElementById("atralabCookiePanel");
  const consent = getAtralabConsent();
  const analyticsToggle = document.getElementById("atralabAnalyticsConsent");

  if (analyticsToggle) {
    analyticsToggle.checked = consent?.analytics === true;
  }

  setCookiePanelView(preferences ? "preferences" : "main");
  panel.hidden = false;
  document.documentElement.classList.add("cookie-open");
}

function closeAtralabCookiePanel() {
  const panel = document.getElementById("atralabCookiePanel");

  if (panel) panel.hidden = true;

  document.documentElement.classList.remove("cookie-open");
}

function initAtralabCookieConsent() {
  createAtralabCookiePanel();

  const consent = getAtralabConsent();

  if (consent) {
    applyAtralabConsent(consent);
  } else {
    disableGoogleAnalytics();
    openAtralabCookiePanel(false);
  }
}

document.addEventListener("click", function (event) {
  const manageButton = event.target.closest("#manageCookies");

  if (manageButton) {
    event.preventDefault();
    openAtralabCookiePanel(true);
    return;
  }

  const actionButton = event.target.closest("[data-cookie-action]");

  if (!actionButton) return;

  const action = actionButton.getAttribute("data-cookie-action");

  if (action === "accept") {
    saveAtralabConsent(true);
    return;
  }

  if (action === "reject") {
    saveAtralabConsent(false);
    return;
  }

  if (action === "preferences") {
    const consent = getAtralabConsent();
    const analyticsToggle = document.getElementById("atralabAnalyticsConsent");

    if (analyticsToggle) {
      analyticsToggle.checked = consent?.analytics === true;
    }

    setCookiePanelView("preferences");
    return;
  }

  if (action === "back") {
    setCookiePanelView("main");
    return;
  }

  if (action === "save") {
    const analyticsToggle = document.getElementById("atralabAnalyticsConsent");
    saveAtralabConsent(Boolean(analyticsToggle?.checked));
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAtralabCookieConsent, { once: true });
} else {
  initAtralabCookieConsent();
}

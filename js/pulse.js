/*
  ATRAPULSE
  =========
  Frontend RSS via Supabase Edge Function pulse-feed.

  Qui puoi cambiare facilmente:
  - numero di card
  - giorni di ricerca
  - ordine delle categorie
*/

const SUPABASE_URL =
  "https://ukoaefhtvhqqdchjnzby.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_hUhoYFMepUOJlJiy6RfBcg_LHf_V6cU";

const PULSE_FEED_URL =
  `${SUPABASE_URL}/functions/v1/pulse-feed`;

const NEWS_CATEGORIES = [
  {
    id: "science",
    label: "Scienza",
    icon: "🔬",
    cards: 3,
    days: 3
  },
  {
    id: "space",
    label: "Spazio",
    icon: "🚀",
    cards: 3,
    days: 5
  },
  {
    id: "environment",
    label: "Ambiente",
    icon: "🌱",
    cards: 3,
    days: 3
  },
  {
    id: "technology",
    label: "Tecnologia",
    icon: "💻",
    cards: 3,
    days: 3
  },
  {
    id: "sport",
    label: "Sport",
    icon: "⚽",
    cards: 3,
    days: 2
  }
];

const CACHE_KEY = "atrapulse-rss-v2";
const CACHE_DURATION_MS = 30 * 60 * 1000;

const tabsEl = document.getElementById("pulseTabs");
const sectionsEl = document.getElementById("pulseSections");
const updatedEl = document.getElementById("pulseUpdated");

let pulseData = null;

function safeText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAge(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60000)
  );

  if (minutes < 60) {
    return minutes <= 1
      ? "adesso"
      : `${minutes} min fa`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  }

  const days = Math.floor(hours / 24);

  return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
}

function formatUpdatedTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function googleSearchUrl(title) {
  return (
    "https://www.google.com/search?q=" +
    encodeURIComponent(`"${safeText(title)}"`)
  );
}

function getSportIcon(topic) {
  const value = safeText(topic).toLowerCase();

  if (value === "pallavolo") return "🏐";
  if (value === "atletica") return "🏃";

  return "⚽";
}

function getCardIcon(article, category) {
  if (category.id === "sport") {
    return getSportIcon(article.topic);
  }

  return category.icon;
}

function getCardLabel(article, category) {
  if (
    category.id === "sport" &&
    article.topic
  ) {
    return article.topic;
  }

  return category.label;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);

    if (!raw) {
      return null;
    }

    const cache = JSON.parse(raw);

    if (
      !cache ||
      !cache.savedAt ||
      !cache.data
    ) {
      return null;
    }

    if (
      Date.now() - cache.savedAt >
      CACHE_DURATION_MS
    ) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return cache;
  } catch {
    return null;
  }
}

function saveCache(data) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        data
      })
    );
  } catch {
    // La pagina funziona anche senza cache.
  }
}

function renderTabs() {
  tabsEl.innerHTML = NEWS_CATEGORIES
    .map((category, index) => `
      <button
        class="pulse-tab ${index === 0 ? "is-active" : ""}"
        type="button"
        data-target="pulse-${category.id}"
      >
        ${category.icon} ${escapeHtml(category.label)}
      </button>
    `)
    .join("");

  tabsEl
    .querySelectorAll(".pulse-tab")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.target;
        const target = document.getElementById(id);

        tabsEl
          .querySelectorAll(".pulse-tab")
          .forEach((tab) =>
            tab.classList.remove("is-active")
          );

        button.classList.add("is-active");

        target?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    });
}

function skeletonCard() {
  return `
    <article class="pulse-card pulse-loading-card">
      <div class="pulse-skeleton pulse-skeleton-image"></div>

      <div class="pulse-skeleton-body">
        <div class="pulse-skeleton pulse-skeleton-line is-short"></div>
        <div class="pulse-skeleton pulse-skeleton-line is-title"></div>
        <div class="pulse-skeleton pulse-skeleton-line is-title-small"></div>
        <div class="pulse-skeleton pulse-skeleton-line is-medium"></div>
      </div>
    </article>
  `;
}

function renderLoading() {
  sectionsEl.innerHTML = NEWS_CATEGORIES
    .map((category) => `
      <section
        id="pulse-${category.id}"
        class="pulse-section is-loading"
      >
        <div class="pulse-section-head">
          <div class="pulse-section-title">
            <div
              class="pulse-section-icon"
              aria-hidden="true"
            >
              ${category.icon}
            </div>

            <h2>${escapeHtml(category.label)}</h2>
          </div>

          <div class="pulse-section-meta">
            Caricamento…
          </div>
        </div>

        <div class="pulse-grid">
          ${Array
            .from(
              { length: category.cards },
              () => skeletonCard()
            )
            .join("")}
        </div>
      </section>
    `)
    .join("");

  updatedEl.textContent =
    "Aggiornamento in corso";
}

function createImageMarkup(article, category) {
  const icon = getCardIcon(
    article,
    category
  );

  if (!article.image) {
    return `
      <div class="pulse-image-fallback">
        <span>${icon}</span>
      </div>
    `;
  }

  return `
    <img
      class="pulse-image"
      src="${escapeHtml(article.image)}"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      onerror="
        this.style.display='none';
        this.nextElementSibling.hidden=false;
      "
    >

    <div
      class="pulse-image-fallback"
      hidden
    >
      <span>${icon}</span>
    </div>
  `;
}

function createCard(article, category) {
  const icon = getCardIcon(
    article,
    category
  );

  const label = getCardLabel(
    article,
    category
  );

  const age = formatAge(
    article.date
  );

  return `
    <article class="pulse-card">
      <div class="pulse-image-wrap">
        ${createImageMarkup(
          article,
          category
        )}
      </div>

      <div class="pulse-card-body">
        <div class="pulse-card-top">
          <span class="pulse-category-pill">
            ${icon}
            ${escapeHtml(label)}
          </span>

          ${
            age
              ? `<span class="pulse-age">${escapeHtml(age)}</span>`
              : ""
          }
        </div>

        <h3 class="pulse-title">
          ${escapeHtml(article.title)}
        </h3>

        <p class="pulse-source">
          ${escapeHtml(article.source)}
        </p>

        <div class="pulse-actions">
          <a
            class="pulse-google-link"
            href="${escapeHtml(
              googleSearchUrl(article.title)
            )}"
            target="_self"
          >
            Cerca su Google
            <span aria-hidden="true">→</span>
          </a>

          <a
            class="pulse-source-link"
            href="${escapeHtml(article.url)}"
            target="_self"
          >
            Fonte
          </a>
        </div>
      </div>
    </article>
  `;
}

function renderData() {
  sectionsEl.innerHTML = NEWS_CATEGORIES
    .map((category) => {
      const news = Array.isArray(
        pulseData?.news?.[category.id]
      )
        ? pulseData.news[category.id]
        : [];

      return `
        <section
          id="pulse-${category.id}"
          class="pulse-section"
        >
          <div class="pulse-section-head">
            <div class="pulse-section-title">
              <div
                class="pulse-section-icon"
                aria-hidden="true"
              >
                ${category.icon}
              </div>

              <h2>${escapeHtml(category.label)}</h2>
            </div>

            <div class="pulse-section-meta">
              ${
                news.length === 1
                  ? "1 notizia"
                  : `${news.length} notizie`
              }
            </div>
          </div>

          ${
            news.length
              ? `
                <div class="pulse-grid">
                  ${news
                    .map((article) =>
                      createCard(
                        article,
                        category
                      )
                    )
                    .join("")}
                </div>
              `
              : `
                <div class="pulse-empty">
                  <strong>
                    Nessuna notizia recente
                  </strong>

                  Per questa categoria non
                  abbiamo trovato contenuti
                  abbastanza recenti
                </div>
              `
          }
        </section>
      `;
    })
    .join("");

  updatedEl.textContent =
    `Aggiornato alle ${
      formatUpdatedTime(
        pulseData.updated_at ||
        new Date()
      )
    }`;
}

async function fetchPulse() {
  const response = await fetch(
    PULSE_FEED_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "apikey":
          SUPABASE_PUBLISHABLE_KEY,

        "Authorization":
          `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      },

      body: JSON.stringify({
        categories:
          NEWS_CATEGORIES.map(
            (category) => ({
              id: category.id,
              limit: category.cards,
              days: category.days
            })
          )
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.details ||
      data?.error ||
      "Errore pulse-feed"
    );
  }

  return data;
}

function renderError(error) {
  console.error(
    "AtraPulse:",
    error
  );

  updatedEl.textContent =
    "Aggiornamento non riuscito";

  sectionsEl.innerHTML = `
    <div class="pulse-empty">
      <strong>
        AtraPulse non riesce ad aggiornarsi
      </strong>

      Le fonti potrebbero essere
      temporaneamente non disponibili

      <br>

      <button
        id="pulseRetry"
        class="pulse-retry"
        type="button"
      >
        Riprova
      </button>
    </div>
  `;

  document
    .getElementById("pulseRetry")
    ?.addEventListener(
      "click",
      () => loadPulse(true)
    );
}

async function loadPulse(force = false) {
  if (!force) {
    const cache = readCache();

    if (cache) {
      pulseData = cache.data;
      renderData();

      updatedEl.textContent =
        `Aggiornato alle ${
          formatUpdatedTime(
            cache.savedAt
          )
        }`;

      return;
    }
  }

  renderLoading();

  try {
    pulseData =
      await fetchPulse();

    saveCache(
      pulseData
    );

    renderData();
  } catch (error) {
    renderError(
      error
    );
  }
}

renderTabs();
loadPulse();

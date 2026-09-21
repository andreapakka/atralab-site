/*
  ATRAPULSE
  ---------
  Modifica soprattutto questo blocco per cambiare:
  - categorie
  - numero di card
  - giorni di ricerca
  - parole chiave
  - fonti ammesse
*/

const NEWS_CATEGORIES = [
  {
    id: "science",
    label: "Scienza",
    icon: "🔬",
    cards: 3,
    days: 3,
    keywords: [
      "science",
      "scientific research",
      "physics",
      "biology",
      "medicine research"
    ],
    sources: [
      "ansa.it",
      "rainews.it",
      "wired.it",
      "focus.it",
      "ilpost.it",
      "repubblica.it",
      "corriere.it"
    ]
  },

  {
    id: "space",
    label: "Spazio",
    icon: "🚀",
    cards: 3,
    days: 5,
    keywords: [
      "space mission",
      "spacecraft",
      "astronomy",
      "NASA",
      "European Space Agency"
    ],
    sources: [
      "ansa.it",
      "rainews.it",
      "wired.it",
      "focus.it",
      "ilpost.it",
      "repubblica.it",
      "corriere.it"
    ]
  },

  {
    id: "sport",
    label: "Sport",
    icon: "⚽",
    cards: 3,
    days: 2,
    keywords: [
      "football",
      "tennis",
      "basketball",
      "Formula 1",
      "MotoGP"
    ],
    sources: [
      "ansa.it",
      "rainews.it",
      "sky.it",
      "eurosport.it",
      "gazzetta.it",
      "repubblica.it",
      "corriere.it"
    ]
  }
];

/*
  Impostazioni generali
*/
const MIN_REQUEST_INTERVAL_MS = 6500;
const RETRY_DELAY_MS = 7000;
const CACHE_DURATION_MS = 60 * 60 * 1000;
const CACHE_PREFIX = "atrapulse-cache-v2-";
const MAX_GDELT_RESULTS = 100;

const tabsEl = document.getElementById("pulseTabs");
const sectionsEl = document.getElementById("pulseSections");
const updatedEl = document.getElementById("pulseUpdated");

let activeCategoryId = NEWS_CATEGORIES[0]?.id ?? null;
let lastRequestAt = 0;
let requestQueue = Promise.resolve();
const inFlight = new Map();

/* -------------------------------------------------------
   UTILITA
------------------------------------------------------- */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeText(value) {
  return String(value ?? "").trim();
}

function normalizeDomain(value) {
  return safeText(value)
    .toLowerCase()
    .replace(/^www\./, "");
}

function isAllowedSource(domain, sources) {
  const normalized = normalizeDomain(domain);

  return sources.some((source) => {
    const clean = normalizeDomain(source);

    return (
      normalized === clean ||
      normalized.endsWith(`.${clean}`)
    );
  });
}

function cleanTitle(title) {
  return safeText(title)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function parseGdeltDate(value) {
  const raw = safeText(value);

  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;

  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );
}

function formatAge(value) {
  const date = parseGdeltDate(value);

  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(
    0,
    Math.floor(diffMs / 60000)
  );

  if (diffMinutes < 60) {
    return diffMinutes <= 1
      ? "adesso"
      : `${diffMinutes} min fa`;
  }

  const hours = Math.floor(diffMinutes / 60);

  if (hours < 24) {
    return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  }

  const days = Math.floor(hours / 24);

  return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
}

function formatUpdatedTime(date = new Date()) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function googleSearchUrl(title) {
  const query = `"${cleanTitle(title)}"`;

  return (
    "https://www.google.com/search?q=" +
    encodeURIComponent(query)
  );
}

function makeCacheKey(category) {
  return CACHE_PREFIX + category.id;
}

function getCachedCategory(category) {
  try {
    const raw = localStorage.getItem(
      makeCacheKey(category)
    );

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      !Array.isArray(parsed.news) ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }

    if (
      Date.now() - parsed.savedAt >
      CACHE_DURATION_MS
    ) {
      localStorage.removeItem(
        makeCacheKey(category)
      );

      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function setCachedCategory(category, news) {
  try {
    localStorage.setItem(
      makeCacheKey(category),
      JSON.stringify({
        news,
        savedAt: Date.now()
      })
    );
  } catch {
    // Se localStorage non è disponibile,
    // AtraPulse continua semplicemente senza cache.
  }
}

/* -------------------------------------------------------
   GDELT
------------------------------------------------------- */

function buildGdeltUrl(category) {
  const keywordQuery = category.keywords
    .map((keyword) => {
      const clean = safeText(keyword);

      return clean.includes(" ")
        ? `"${clean}"`
        : clean;
    })
    .join(" OR ");

  const sourceQuery = category.sources
    .map((source) => `domainis:${source}`)
    .join(" OR ");

  const query =
    `(${keywordQuery}) ` +
    `(${sourceQuery}) ` +
    `sourcelang:italian`;

  const requested = Math.min(
    Math.max(category.cards * 20, 50),
    MAX_GDELT_RESULTS
  );

  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "jsonp",
    maxrecords: String(requested),
    timespan: `${Math.min(
      Math.max(Number(category.days) || 1, 1),
      5
    )}d`,
    sort: "datedesc"
  });

  return (
    "https://api.gdeltproject.org/api/v2/doc/doc?" +
    params.toString()
  );
}

function jsonpRequest(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "__atrapulse_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2);

    const script = document.createElement("script");
    let finished = false;

    function cleanup() {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timer);

      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }

      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(
        new Error("Impossibile caricare GDELT")
      );
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error("GDELT non ha risposto in tempo")
      );
    }, timeoutMs);

    const separator =
      url.includes("?") ? "&" : "?";

    script.src =
      `${url}${separator}` +
      `callback=${encodeURIComponent(callbackName)}`;

    script.async = true;
    document.head.appendChild(script);
  });
}

async function fetchCategory(category) {
  const data = await jsonpRequest(
    buildGdeltUrl(category)
  );

  const articles = Array.isArray(data?.articles)
    ? data.articles
    : [];

  const seen = new Set();
  const news = [];

  for (const article of articles) {
    const title = cleanTitle(article.title);
    const url = safeText(article.url);
    const source = normalizeDomain(article.domain);

    if (!title || !url || !source) {
      continue;
    }

    if (
      !isAllowedSource(
        source,
        category.sources
      )
    ) {
      continue;
    }

    const duplicateKey = title
      .toLocaleLowerCase("it")
      .replace(/\s+/g, " ")
      .trim();

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);

    news.push({
      title,
      url,
      source,
      date: safeText(article.seendate),
      image: safeText(article.socialimage)
    });

    if (news.length >= category.cards) {
      break;
    }
  }

  return news;
}

async function performRequestWithRetry(category) {
  /*
    Manteniamo almeno 6,5 secondi tra due richieste reali
    anche se l'utente cambia categoria molto velocemente.
  */
  const elapsed = Date.now() - lastRequestAt;

  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(
      MIN_REQUEST_INTERVAL_MS - elapsed
    );
  }

  lastRequestAt = Date.now();

  try {
    return await fetchCategory(category);
  } catch (firstError) {
    /*
      Un solo retry automatico.
      Se GDELT sta limitando temporaneamente,
      aspettiamo 7 secondi e riproviamo una volta.
    */
    await sleep(RETRY_DELAY_MS);

    lastRequestAt = Date.now();

    return await fetchCategory(category);
  }
}

function queueCategoryRequest(category) {
  const task = requestQueue.then(
    () => performRequestWithRetry(category)
  );

  requestQueue = task.catch(() => {});

  return task;
}

/* -------------------------------------------------------
   HTML
------------------------------------------------------- */

function createSkeletonCard() {
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

function renderSkeletons(category) {
  return Array
    .from(
      { length: category.cards },
      () => createSkeletonCard()
    )
    .join("");
}

function createCategoryShell(category, index) {
  return `
    <section
      id="pulse-${category.id}"
      class="pulse-section ${index === 0 ? "" : "is-waiting"}"
      data-category="${category.id}"
      ${index === 0 ? "" : "hidden"}
    >
      <div class="pulse-section-head">
        <div class="pulse-section-title">
          <div
            class="pulse-section-icon"
            aria-hidden="true"
          >
            ${category.icon}
          </div>

          <h2>${category.label}</h2>
        </div>

        <div
          class="pulse-section-meta"
          data-section-meta
        >
          ${index === 0 ? "Caricamento…" : "Apri la categoria"}
        </div>
      </div>

      <div
        class="pulse-grid"
        data-news-grid
      >
        ${renderSkeletons(category)}
      </div>
    </section>
  `;
}

function createTabs() {
  tabsEl.innerHTML = NEWS_CATEGORIES
    .map((category, index) => {
      return `
        <button
          class="pulse-tab ${index === 0 ? "is-active" : ""}"
          type="button"
          data-category-id="${category.id}"
        >
          ${category.icon} ${category.label}
        </button>
      `;
    })
    .join("");

  tabsEl
    .querySelectorAll(".pulse-tab")
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const categoryId =
            button.dataset.categoryId;

          const category =
            NEWS_CATEGORIES.find(
              (item) => item.id === categoryId
            );

          if (!category) {
            return;
          }

          activeCategoryId = category.id;

          tabsEl
            .querySelectorAll(".pulse-tab")
            .forEach((tab) =>
              tab.classList.toggle(
                "is-active",
                tab === button
              )
            );

          document
            .querySelectorAll(".pulse-section")
            .forEach((section) => {
              section.hidden =
                section.dataset.category !==
                category.id;
            });

          await loadCategory(category);
        }
      );
    });
}

function createSections() {
  sectionsEl.innerHTML = NEWS_CATEGORIES
    .map(createCategoryShell)
    .join("");
}

function escapeHtml(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createImageMarkup(article, category) {
  if (!article.image) {
    return `
      <div class="pulse-image-fallback">
        <span>${category.icon}</span>
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
      <span>${category.icon}</span>
    </div>
  `;
}

function createNewsCard(article, category) {
  const title = escapeHtml(article.title);
  const source = escapeHtml(article.source);
  const originalUrl = escapeHtml(article.url);
  const searchUrl = escapeHtml(
    googleSearchUrl(article.title)
  );
  const age = escapeHtml(
    formatAge(article.date)
  );

  return `
    <article class="pulse-card">
      <div class="pulse-image-wrap">
        ${createImageMarkup(article, category)}
      </div>

      <div class="pulse-card-body">
        <div class="pulse-card-top">
          <span class="pulse-category-pill">
            ${category.icon} ${escapeHtml(category.label)}
          </span>

          ${
            age
              ? `<span class="pulse-age">${age}</span>`
              : ""
          }
        </div>

        <h3 class="pulse-title">
          ${title}
        </h3>

        <p class="pulse-source">
          ${source}
        </p>

        <div class="pulse-actions">
          <a
            class="pulse-google-link"
            href="${searchUrl}"
            target="_self"
          >
            Cerca su Google
            <span aria-hidden="true">→</span>
          </a>

          <a
            class="pulse-source-link"
            href="${originalUrl}"
            target="_self"
          >
            Fonte
          </a>
        </div>
      </div>
    </article>
  `;
}

function renderNews(category, news, fromCache = false, savedAt = null) {
  const section = document.querySelector(
    `[data-category="${category.id}"]`
  );

  if (!section) {
    return;
  }

  const grid = section.querySelector(
    "[data-news-grid]"
  );

  const meta = section.querySelector(
    "[data-section-meta]"
  );

  section.classList.remove(
    "is-waiting",
    "is-loading"
  );

  if (!news.length) {
    grid.innerHTML = `
      <div class="pulse-empty">
        <strong>Nessuna notizia interessante trovata</strong>
        Prova più tardi oppure amplia le keyword della categoria
      </div>
    `;

    meta.textContent =
      `ultimi ${category.days} giorni`;

    return;
  }

  grid.innerHTML = news
    .map((article) =>
      createNewsCard(article, category)
    )
    .join("");

  meta.textContent = fromCache
    ? `${news.length} · cache`
    : `${news.length} · aggiornate`;

  if (category.id === activeCategoryId) {
    const date = savedAt
      ? new Date(savedAt)
      : new Date();

    updatedEl.textContent =
      `Aggiornato alle ${formatUpdatedTime(date)}`;
  }
}

function renderError(category) {
  const section = document.querySelector(
    `[data-category="${category.id}"]`
  );

  if (!section) {
    return;
  }

  const grid = section.querySelector(
    "[data-news-grid]"
  );

  const meta = section.querySelector(
    "[data-section-meta]"
  );

  section.classList.remove(
    "is-waiting",
    "is-loading"
  );

  grid.innerHTML = `
    <div class="pulse-empty">
      <strong>
        Questa sezione non si è caricata
      </strong>

      GDELT può limitare temporaneamente le richieste
      Aspetta qualche secondo e riprova

      <br>

      <button
        class="pulse-retry"
        type="button"
        data-retry="${category.id}"
      >
        Riprova
      </button>
    </div>
  `;

  meta.textContent = "non disponibile";

  if (category.id === activeCategoryId) {
    updatedEl.textContent =
      "Aggiornamento non riuscito";
  }

  const retryButton = grid.querySelector(
    "[data-retry]"
  );

  retryButton?.addEventListener(
    "click",
    async () => {
      retryButton.disabled = true;
      await loadCategory(category, true);
    }
  );
}

function setSectionLoading(category) {
  const section = document.querySelector(
    `[data-category="${category.id}"]`
  );

  if (!section) {
    return;
  }

  section.classList.remove("is-waiting");
  section.classList.add("is-loading");

  const meta = section.querySelector(
    "[data-section-meta]"
  );

  const grid = section.querySelector(
    "[data-news-grid]"
  );

  meta.textContent = "Caricamento…";
  grid.innerHTML = renderSkeletons(category);

  if (category.id === activeCategoryId) {
    updatedEl.textContent =
      `Caricamento ${category.label.toLowerCase()}…`;
  }
}

/* -------------------------------------------------------
   CARICAMENTO ON DEMAND
------------------------------------------------------- */

async function loadCategory(
  category,
  force = false
) {
  if (!force) {
    const cached = getCachedCategory(category);

    if (cached) {
      renderNews(
        category,
        cached.news,
        true,
        cached.savedAt
      );

      return;
    }
  }

  if (inFlight.has(category.id)) {
    return inFlight.get(category.id);
  }

  setSectionLoading(category);

  const promise = (async () => {
    try {
      const news =
        await queueCategoryRequest(category);

      setCachedCategory(category, news);

      renderNews(
        category,
        news,
        false,
        Date.now()
      );
    } catch (error) {
      console.error(
        `AtraPulse ${category.id}:`,
        error
      );

      renderError(category);
    } finally {
      inFlight.delete(category.id);
    }
  })();

  inFlight.set(category.id, promise);

  return promise;
}

/* -------------------------------------------------------
   AVVIO
------------------------------------------------------- */

createTabs();
createSections();

if (NEWS_CATEGORIES.length > 0) {
  loadCategory(NEWS_CATEGORIES[0]);
}

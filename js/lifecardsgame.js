(() => {
  "use strict";

  const LIFE_SUPABASE_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co";

  /*
   * La publishable key LIFE è già presente nel frontend ATRALAB esistente.
   * Per non duplicare una configurazione che non è stata riportata nei PDF tecnici,
   * questa pagina la recupera dal file /js/life-manage.js già pubblicato.
   * Se in futuro si preferisce renderla autonoma, basta valorizzare LIFE_SUPABASE_KEY.
   */
  const LIFE_SUPABASE_KEY = "";

  const LEVELS = Object.freeze({
    1: { cards: 2, clues: 4, multiplier: 10 },
    2: { cards: 4, clues: 3, multiplier: 20 },
    3: { cards: 6, clues: 2, multiplier: 30 },
    4: { cards: 10, clues: 2, multiplier: 40 }
  });

  const STATS = Object.freeze([
    { field: "weight_raw", label: "Weight", unit: "lbs" },
    { field: "speed_raw", label: "Speed", unit: "mph" },
    { field: "lifespan_raw", label: "Lifespan", unit: "yrs" },
    { field: "population_raw", label: "Population", unit: "est" }
  ]);

  const state = {
    db: null,
    pool: [],
    level: null,
    target: null,
    clues: [],
    deck: [],
    errors: 0,
    solved: false
  };

  let previousFocus = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindUi();
    protectCardInteractions();

    try {
      const key = await resolveLifeSupabaseKey();
      state.db = window.supabase.createClient(LIFE_SUPABASE_URL, key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      state.pool = await loadGamePool();

      if (state.pool.length < 10) {
        throw new Error("Il pool LIFE disponibile è troppo piccolo per il livello 4.");
      }
    } catch (error) {
      console.error("LIFE Cards Game:", error);
      showFatalError(
        "Non riesco a caricare il catalogo LIFE. Riprova tra poco o controlla la configurazione Supabase."
      );
    }
  }

  function bindUi() {
    document.querySelectorAll(".life-level-button").forEach((button) => {
      button.addEventListener("click", () => {
        const level = Number(button.dataset.level);
        if (!LEVELS[level]) return;
        startRound(level);
      });
    });

    document.getElementById("life-win-close")?.addEventListener("click", closeWinModal);
    document.querySelector("[data-close-modal]")?.addEventListener("click", closeWinModal);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !document.getElementById("life-win-modal")?.hidden) {
        closeWinModal();
      }
    });
  }

  function protectCardInteractions() {
    document.addEventListener("contextmenu", (event) => {
      if (event.target.closest(".life-game-card, .life-win-card")) {
        event.preventDefault();
      }
    });

    document.addEventListener("dragstart", (event) => {
      if (event.target.closest(".life-game-card, .life-win-card")) {
        event.preventDefault();
      }
    });

    document.addEventListener("selectstart", (event) => {
      if (event.target.closest(".life-game-card, .life-win-card")) {
        event.preventDefault();
      }
    });
  }

  async function resolveLifeSupabaseKey() {
    if (LIFE_SUPABASE_KEY) return LIFE_SUPABASE_KEY;

    const knownGlobals = [
      window.LIFE_SUPABASE_KEY,
      window.LIFE_SUPABASE_ANON_KEY,
      window.LIFE_SUPABASE_PUBLISHABLE_KEY
    ].filter(Boolean);

    if (knownGlobals.length) return knownGlobals[0];

    const response = await fetch("/js/life-manage.js", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Impossibile leggere /js/life-manage.js (${response.status}).`);
    }

    const source = await response.text();

    const assignmentPatterns = [
      /(?:const|let|var)\s+LIFE_SUPABASE_KEY\s*=\s*["']([^"']+)["']/,
      /(?:const|let|var)\s+LIFE_SUPABASE_ANON_KEY\s*=\s*["']([^"']+)["']/,
      /(?:const|let|var)\s+LIFE_SUPABASE_PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/
    ];

    for (const pattern of assignmentPatterns) {
      const match = source.match(pattern);
      if (match?.[1]) return match[1];
    }

    const modernKey = source.match(/["'](sb_publishable_[A-Za-z0-9._-]+)["']/);
    if (modernKey?.[1]) return modernKey[1];

    const legacyJwt = source.match(/["'](eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)["']/);
    if (legacyJwt?.[1]) return legacyJwt[1];

    throw new Error("Publishable key LIFE non trovata nel frontend esistente.");
  }

  async function loadGamePool() {
    const { data, error } = await state.db
      .from("life_cards")
      .select(`
        id,
        name,
        image_url,
        weight_raw,
        speed_raw,
        lifespan_raw,
        population_raw,
        active,
        collection:life_collections!inner(name),
        card_type:life_card_types!inner(name)
      `)
      .eq("active", true)
      .eq("life_collections.name", "Special Edition Mammals")
      .in("life_card_types.name", ["Common", "Uncommon", "Rare"])
      .not("image_url", "is", null)
      .not("weight_raw", "is", null)
      .not("speed_raw", "is", null)
      .not("lifespan_raw", "is", null)
      .not("population_raw", "is", null);

    if (error) throw error;

    return (data || []).filter((card) =>
      card.image_url &&
      hasValue(card.weight_raw) &&
      hasValue(card.speed_raw) &&
      hasValue(card.lifespan_raw) &&
      hasValue(card.population_raw)
    );
  }

  async function startRound(level) {
    if (!state.pool.length) {
      showFatalError("Il catalogo LIFE non è ancora disponibile.");
      return;
    }

    closeWinModal();

    const config = LEVELS[level];
    const round = buildRound(config);

    if (!round) {
      showFatalError("Non sono riuscito a creare un round valido. Riprova.");
      return;
    }

    state.level = level;
    state.target = round.target;
    state.clues = round.clues;
    state.deck = round.deck;
    state.errors = 0;
    state.solved = false;

    setActiveLevel(level);
    renderRound();
    updateRoundStatus();

    await preloadImages(state.deck.map((card) => card.image_url));
  }

  function buildRound(config) {
    const maxAttempts = 120;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const target = randomItem(state.pool);
      const clues = shuffle([...STATS]).slice(0, config.clues);

      const validDistractors = state.pool.filter((card) => {
        if (card.id === target.id) return false;
        return !matchesAllClues(card, target, clues);
      });

      if (validDistractors.length < config.cards - 1) continue;

      const distractors = sample(validDistractors, config.cards - 1);
      const deck = shuffle([target, ...distractors]);

      const exactMatchesInDeck = deck.filter((card) =>
        matchesAllClues(card, target, clues)
      );

      if (exactMatchesInDeck.length !== 1) continue;

      return { target, clues, deck };
    }

    return null;
  }

  function matchesAllClues(card, target, clues) {
    return clues.every(({ field }) =>
      normalizeRaw(card[field]) === normalizeRaw(target[field])
    );
  }

  function renderRound() {
    const empty = document.getElementById("life-game-empty");
    const content = document.getElementById("life-game-content");
    const errorBox = document.getElementById("life-game-error");

    if (empty) empty.hidden = true;
    if (content) content.hidden = false;
    if (errorBox) errorBox.hidden = true;

    renderClues();
    renderCards();
  }

  function renderClues() {
    const container = document.getElementById("life-game-clues");
    if (!container) return;

    container.replaceChildren();

    state.clues.forEach((stat) => {
      const row = document.createElement("div");
      row.className = "life-clue-row";

      const label = document.createElement("div");
      label.className = "life-clue-label";
      label.innerHTML = `<strong>${escapeHtml(stat.label)}</strong> (${escapeHtml(stat.unit)})`;

      const value = document.createElement("div");
      value.className = "life-clue-value";
      value.textContent = state.target[stat.field];

      row.append(label, value);
      container.append(row);
    });
  }

  function renderCards() {
    const container = document.getElementById("life-game-cards");
    if (!container) return;

    container.replaceChildren();

    state.deck.forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "life-game-card";
      button.dataset.cardId = String(card.id);
      button.setAttribute("aria-label", `Carta ${card.name}`);
      setBackgroundImage(button, card.image_url);

      button.addEventListener("click", () => handleGuess(card, button));
      container.append(button);
    });
  }

  function handleGuess(card, button) {
    if (state.solved || button.disabled) return;

    if (card.id === state.target.id) {
      state.solved = true;
      button.classList.add("is-correct");
      disableAllCards();
      updateRoundStatus(true);
      openWinModal();
      return;
    }

    state.errors += 1;
    button.classList.add("is-wrong");
    button.disabled = true;
    button.setAttribute("aria-label", `${card.name}: risposta sbagliata`);
    updateRoundStatus();
  }

  function calculateScore(level, errors) {
    const config = LEVELS[level];
    return (config.cards - errors) * config.multiplier;
  }

  function openWinModal() {
    const modal = document.getElementById("life-win-modal");
    const name = document.getElementById("life-win-name");
    const score = document.getElementById("life-win-score");
    const card = document.getElementById("life-win-card");
    const closeButton = document.getElementById("life-win-close");

    if (!modal || !state.target) return;

    const points = calculateScore(state.level, state.errors);

    if (name) name.textContent = state.target.name;
    if (score) score.textContent = `+${points} punti`;
    if (card) setBackgroundImage(card, state.target.image_url);

    previousFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("life-modal-open");

    requestAnimationFrame(() => closeButton?.focus());
  }

  function closeWinModal() {
    const modal = document.getElementById("life-win-modal");
    if (!modal || modal.hidden) return;

    modal.hidden = true;
    document.body.classList.remove("life-modal-open");

    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }

    previousFocus = null;
  }

  function disableAllCards() {
    document.querySelectorAll(".life-game-card").forEach((button) => {
      button.disabled = true;
    });
  }

  function updateRoundStatus(solved = false) {
    const status = document.getElementById("life-game-round-status");
    if (!status || !state.level) return;

    const attempts = state.errors + (solved ? 1 : 0);

    if (solved) {
      status.textContent = `Livello ${state.level} · trovata in ${attempts} ${attempts === 1 ? "tentativo" : "tentativi"}`;
    } else if (state.errors === 0) {
      status.textContent = `Livello ${state.level} · scegli una carta`;
    } else {
      status.textContent = `Livello ${state.level} · errori: ${state.errors}`;
    }
  }

  function setActiveLevel(level) {
    document.querySelectorAll(".life-level-button").forEach((button) => {
      const isActive = Number(button.dataset.level) === level;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function showFatalError(message) {
    const empty = document.getElementById("life-game-empty");
    const content = document.getElementById("life-game-content");
    const errorBox = document.getElementById("life-game-error");

    if (empty) empty.hidden = true;
    if (content) content.hidden = true;

    if (errorBox) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }
  }

  function preloadImages(urls) {
    return Promise.allSettled(
      urls.map((url) => new Promise((resolve) => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = resolve;
        image.src = url;
      }))
    );
  }

  function setBackgroundImage(element, url) {
    const safe = String(url).replace(/["\\\n\r]/g, "");
    element.style.backgroundImage = `url("${safe}")`;
  }

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function normalizeRaw(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  function sample(array, count) {
    return shuffle([...array]).slice(0, count);
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();

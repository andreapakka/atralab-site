(() => {
  "use strict";

  const LIFE_SUPABASE_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co";

  // Se vuoi rendere questa pagina completamente indipendente da life-manage.js,
  // puoi incollare qui la stessa publishable key gia usata dalla gestione.
  const LIFE_SUPABASE_KEY = "";

  // Tipi mostrati nella sezione "Carte migliori".
  // Aggiungere/rimuovere voci qui per cambiare la selezione.
  const FEATURED_CARD_TYPES = [
    "Full Art",
    "Photography",
    "1st Edition Holo",
    "Holo",
    "Extended",
    "Rare"
  ];

  const state = {
    collections: [],
    types: [],
    cards: [],
    activeCopies: [],
    ownedVariants: [],
    collectionsById: new Map(),
    typesById: new Map(),
    copiesByCardId: new Map()
  };

  const els = {};
  let lifeDb = null;
  let lightboxReturnFocus = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();

    try {
      const key = await resolveLifeSupabaseKey();
      if (!window.supabase?.createClient) {
        throw new Error("Libreria Supabase non disponibile.");
      }

      lifeDb = window.supabase.createClient(LIFE_SUPABASE_URL, key);
      await loadData();
      prepareState();
      renderAll();
    } catch (error) {
      console.error("LIFE collection:", error);
      showError(
        "Non riesco a caricare la collezione. Controlla la connessione e la publishable key LIFE."
      );
    }
  }

  function cacheElements() {
    els.search = document.getElementById("life-search");
    els.searchResults = document.getElementById("life-search-results");
    els.generalStats = document.getElementById("life-general-stats");
    els.editionGrid = document.getElementById("life-edition-grid");
    els.featuredSection = document.getElementById("life-featured-section");
    els.featuredGrid = document.getElementById("life-featured-grid");
    els.cardGrid = document.getElementById("life-card-grid");
    els.visibleCount = document.getElementById("life-visible-count");
    els.empty = document.getElementById("life-empty");
    els.error = document.getElementById("life-error");

    els.filterEdition = document.getElementById("life-filter-edition");
    els.filterType = document.getElementById("life-filter-type");
    els.filterDuplicates = document.getElementById("life-filter-duplicates");
    els.sort = document.getElementById("life-sort");
    els.resetFilters = document.getElementById("life-reset-filters");

    els.lightbox = document.getElementById("life-lightbox");
    els.lightboxClose = document.getElementById("life-lightbox-close");
    els.lightboxImage = document.getElementById("life-lightbox-image");
    els.lightboxTitle = document.getElementById("life-lightbox-title");
    els.lightboxMeta = document.getElementById("life-lightbox-meta");
  }

  function bindEvents() {
    els.search.addEventListener("input", renderSearchResults);
    els.search.addEventListener("focus", renderSearchResults);
    els.search.addEventListener("keydown", onSearchKeydown);

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".life-search-wrap")) {
        closeAutocomplete();
      }
    });

    window.addEventListener("resize", () => {
      if (!els.searchResults.hidden) positionAutocomplete();
    });

    [els.filterEdition, els.filterType, els.filterDuplicates, els.sort].forEach((element) => {
      element.addEventListener("change", renderCollectionGrid);
    });

    els.resetFilters.addEventListener("click", resetFilters);

    els.editionGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edition-filter]");
      if (!button) return;
      els.filterEdition.value = button.dataset.editionFilter;
      els.filterType.value = "";
      els.filterDuplicates.checked = false;
      renderCollectionGrid();
      document.getElementById("life-collection-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-card-lightbox]");
      if (!opener) return;

      const card = state.cards.find((item) => String(item.id) === opener.dataset.cardLightbox);
      if (card) openLightbox(card, opener);
    });

    els.lightboxClose.addEventListener("click", closeLightbox);
    els.lightbox.addEventListener("click", (event) => {
      if (event.target === els.lightbox) closeLightbox();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.lightbox.hidden) {
        closeLightbox();
      }
    });
  }

  async function resolveLifeSupabaseKey() {
    if (LIFE_SUPABASE_KEY.trim()) return LIFE_SUPABASE_KEY.trim();

    // La publishable key non e un segreto ed e gia presente nel JS pubblico
    // della pagina di gestione. La leggiamo senza modificare quel file.
    const response = await fetch("/js/life-manage.js", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Impossibile leggere life-manage.js (${response.status}).`);
    }

    const source = await response.text();

    const publishableMatch = source.match(/["'](sb_publishable_[A-Za-z0-9._-]+)["']/);
    if (publishableMatch) return publishableMatch[1];

    const jwtMatch = source.match(/["'](eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)["']/);
    if (jwtMatch) return jwtMatch[1];

    throw new Error("Publishable key LIFE non trovata in life-manage.js.");
  }

  async function loadData() {
    const [collections, types, cards, copies] = await Promise.all([
      fetchAllRows("life_collections"),
      fetchAllRows("life_card_types"),
      fetchAllRows("life_cards"),
      fetchAllRows("life_user_cards", "id,card_id,obtained_at,sold_at,deleted_at,pack_number")
    ]);

    state.collections = collections;
    state.types = types;
    state.cards = cards;
    state.activeCopies = copies.filter((copy) => !copy.sold_at && !copy.deleted_at);
  }

  async function fetchAllRows(table, select = "*") {
    const pageSize = 1000;
    const rows = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await lifeDb
        .from(table)
        .select(select)
        .range(from, from + pageSize - 1);

      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    return rows;
  }

  function prepareState() {
    state.collectionsById = new Map(state.collections.map((item) => [String(item.id), item]));
    state.typesById = new Map(state.types.map((item) => [String(item.id), item]));

    state.cards = state.cards.map((card) => ({
      ...card,
      collectionName: state.collectionsById.get(String(card.collection_id))?.name || "Collezione",
      typeName: state.typesById.get(String(card.card_type_id))?.name || "Tipo"
    }));

    state.copiesByCardId = new Map();
    for (const copy of state.activeCopies) {
      const key = String(copy.card_id);
      if (!state.copiesByCardId.has(key)) state.copiesByCardId.set(key, []);
      state.copiesByCardId.get(key).push(copy);
    }

    state.ownedVariants = state.cards
      .filter((card) => state.copiesByCardId.has(String(card.id)))
      .map((card) => ({
        card,
        copies: state.copiesByCardId.get(String(card.id))
      }));
  }

  function renderAll() {
    renderGeneralStats();
    renderEditionStats();
    renderFeatured();
    renderFilterOptions();
    renderCollectionGrid();
  }

  function renderGeneralStats() {
    const totalCopies = state.activeCopies.length;
    const uniqueVariants = state.ownedVariants.length;
    const duplicateVariants = state.ownedVariants.filter((item) => item.copies.length > 1).length;
    const totalPacks = new Set(
      state.activeCopies
        .map((copy) => copy.pack_number)
        .filter((value) => Number.isInteger(Number(value)) && Number(value) > 0)
        .map(String)
    ).size;

    els.generalStats.innerHTML = [
      statCard(totalCopies, "Carte possedute"),
      statCard(uniqueVariants, "Varianti uniche"),
      statCard(duplicateVariants, "Varianti doppie"),
      statCard(totalPacks, "Pacchetti")
    ].join("");
  }

  function renderEditionStats() {
    const byEdition = new Map();

    for (const item of state.ownedVariants) {
      const collectionId = String(item.card.collection_id);
      if (!byEdition.has(collectionId)) {
        byEdition.set(collectionId, {
          collectionId,
          name: item.card.collectionName,
          variants: [],
          copies: []
        });
      }

      const bucket = byEdition.get(collectionId);
      bucket.variants.push(item);
      bucket.copies.push(...item.copies);
    }

    const catalogCountByEdition = new Map();
    for (const card of state.cards) {
      const key = String(card.collection_id);
      catalogCountByEdition.set(key, (catalogCountByEdition.get(key) || 0) + 1);
    }

    const editions = [...byEdition.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "it"))
      .map((edition) => {
        const totalCopies = edition.copies.length;
        const uniqueVariants = edition.variants.length;
        const duplicateVariants = edition.variants.filter((item) => item.copies.length > 1).length;
        const packCount = new Set(
          edition.copies
            .map((copy) => copy.pack_number)
            .filter((value) => Number.isInteger(Number(value)) && Number(value) > 0)
            .map(String)
        ).size;
        const singleCount = edition.copies.filter((copy) => copy.pack_number == null).length;
        const catalogTotal = catalogCountByEdition.get(edition.collectionId) || 0;
        const completion = catalogTotal ? (uniqueVariants / catalogTotal) * 100 : 0;

        const typeCounts = new Map();
        for (const item of edition.variants) {
          typeCounts.set(item.card.typeName, (typeCounts.get(item.card.typeName) || 0) + item.copies.length);
        }

        return {
          ...edition,
          totalCopies,
          uniqueVariants,
          duplicateVariants,
          packCount,
          singleCount,
          catalogTotal,
          completion,
          typeCounts
        };
      });

    els.editionGrid.innerHTML = editions.map((edition) => {
      const typeChips = [...edition.typeCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "it"))
        .map(([type, count]) => `<span class="life-type-chip">${escapeHtml(type)} ${count}</span>`)
        .join("");

      return `
        <article class="life-edition-card">
          <h3>${escapeHtml(edition.name)}</h3>

          <div class="life-edition-metrics">
            ${editionMetric(edition.totalCopies, "Carte")}
            ${editionMetric(edition.uniqueVariants, "Varianti")}
            ${editionMetric(edition.packCount, "Pacchetti")}
            ${editionMetric(edition.singleCount, "Singole")}
          </div>

          <div class="life-progress-head">
            <span>Completamento</span>
            <strong>${edition.uniqueVariants} / ${edition.catalogTotal} · ${formatPercent(edition.completion)}</strong>
          </div>
          <div class="life-progress" aria-hidden="true">
            <span style="width:${Math.min(100, edition.completion).toFixed(2)}%"></span>
          </div>

          ${edition.duplicateVariants
            ? `<div class="life-type-summary"><span class="life-type-chip">Doppioni: ${edition.duplicateVariants} varianti</span>${typeChips}</div>`
            : `<div class="life-type-summary">${typeChips}</div>`
          }

          <div class="life-edition-action">
            <button class="life-button life-button--secondary" type="button"
              data-edition-filter="${escapeAttr(edition.collectionId)}">
              Mostra carte
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderFeatured() {
    const featuredRank = new Map(FEATURED_CARD_TYPES.map((type, index) => [type, index]));

    const items = state.ownedVariants
      .filter((item) => featuredRank.has(item.card.typeName))
      .sort((a, b) => {
        const rankDiff = featuredRank.get(a.card.typeName) - featuredRank.get(b.card.typeName);
        if (rankDiff) return rankDiff;
        const collectionDiff = a.card.collectionName.localeCompare(b.card.collectionName, "it");
        if (collectionDiff) return collectionDiff;
        return compareCardNumber(a.card, b.card);
      });

    if (!items.length) {
      els.featuredSection.hidden = true;
      return;
    }

    els.featuredSection.hidden = false;
    els.featuredGrid.innerHTML = items.map(({ card, copies }) => `
      <article class="life-featured-card">
        ${renderFeaturedImage(card)}
        <div class="life-featured-copy">
          <h3>${escapeHtml(card.name)}</h3>
          <p>${escapeHtml(card.card_number_raw || "—")} · ${escapeHtml(card.typeName)}</p>
          <p>${escapeHtml(card.collectionName)}</p>
          <span class="life-quantity">×${copies.length}</span>
        </div>
      </article>
    `).join("");

    wireImageFallbacks(els.featuredGrid);
  }

  function renderFilterOptions() {
    const editionOptions = uniqueSorted(state.ownedVariants.map((item) => ({
      value: String(item.card.collection_id),
      label: item.card.collectionName
    })));

    const typeOptions = uniqueSorted(state.ownedVariants.map((item) => ({
      value: String(item.card.card_type_id),
      label: item.card.typeName
    })));

    els.filterEdition.innerHTML =
      `<option value="">Tutte</option>` +
      editionOptions.map(optionMarkup).join("");

    els.filterType.innerHTML =
      `<option value="">Tutti</option>` +
      typeOptions.map(optionMarkup).join("");
  }

  function renderCollectionGrid() {
    const editionId = els.filterEdition.value;
    const typeId = els.filterType.value;
    const duplicatesOnly = els.filterDuplicates.checked;
    const sortMode = els.sort.value;

    let items = state.ownedVariants.filter((item) => {
      if (editionId && String(item.card.collection_id) !== editionId) return false;
      if (typeId && String(item.card.card_type_id) !== typeId) return false;
      if (duplicatesOnly && item.copies.length < 2) return false;
      return true;
    });

    items = [...items].sort((a, b) => sortOwnedItems(a, b, sortMode));

    els.visibleCount.textContent = `${items.length} ${items.length === 1 ? "variante" : "varianti"}`;
    els.empty.hidden = items.length > 0;

    els.cardGrid.innerHTML = items.map(({ card, copies }) => renderCollectionCard(card, copies.length)).join("");
    wireImageFallbacks(els.cardGrid);
  }

  function renderCollectionCard(card, quantity) {
    const duplicateClass = quantity > 1 ? " life-card--duplicate" : "";
    return `
      <article class="life-card${duplicateClass}">
        ${renderCollectionImage(card, quantity)}
        <div class="life-card-body">
          <h3 class="life-card-title">${escapeHtml(card.name)}</h3>
          <p class="life-card-number">${escapeHtml(card.card_number_raw || "—")}</p>
          <p class="life-card-meta">${escapeHtml(card.typeName)}</p>
          <p class="life-card-meta">${escapeHtml(card.collectionName)}</p>
        </div>
      </article>
    `;
  }

  function renderCollectionImage(card, quantity) {
    const badge = quantity > 1 ? `<span class="life-card-badge">×${quantity}</span>` : "";
    if (!card.image_url) {
      return `
        <div class="life-image-button" aria-label="Immagine non disponibile">
          <span class="life-image-fallback">Immagine non disponibile</span>
          ${badge}
        </div>
      `;
    }

    return `
      <button class="life-image-button" type="button"
        data-card-lightbox="${escapeAttr(card.id)}"
        aria-label="Apri ${escapeAttr(card.name)}">
        <img src="${escapeAttr(card.image_url)}" alt="${escapeAttr(card.name)}" loading="lazy">
        ${badge}
      </button>
    `;
  }

  function renderFeaturedImage(card) {
    if (!card.image_url) {
      return `
        <div class="life-featured-image" aria-label="Immagine non disponibile">
          <span class="life-image-fallback">Immagine non disponibile</span>
        </div>
      `;
    }

    return `
      <button class="life-featured-image" type="button"
        data-card-lightbox="${escapeAttr(card.id)}"
        aria-label="Apri ${escapeAttr(card.name)}">
        <span class="life-featured-thumb">
          <img src="${escapeAttr(card.image_url)}" alt="${escapeAttr(card.name)}" loading="lazy">
        </span>
      </button>
    `;
  }

  function renderSearchResults() {
    const query = els.search.value.trim();
    if (!query) {
      closeAutocomplete();
      return;
    }

    const normalizedQuery = normalize(query);
    const numericQuery = /^\d+$/.test(query) ? Number(query) : null;

    const matches = state.cards
      .filter((card) => {
        const nameMatch = normalize(card.name).includes(normalizedQuery);
        const rawMatch = normalize(card.card_number_raw || "").includes(normalizedQuery);
        const numericMatch = numericQuery !== null && Number(card.card_number_num) === numericQuery;
        return nameMatch || rawMatch || numericMatch;
      })
      .sort((a, b) => searchRank(a, b, normalizedQuery))
      .slice(0, 12);

    if (!matches.length) {
      els.searchResults.innerHTML = `<div class="life-empty">Nessuna carta trovata.</div>`;
      openAutocomplete();
      return;
    }

    els.searchResults.innerHTML = matches.map((card) => {
      const copies = state.copiesByCardId.get(String(card.id)) || [];
      const owned = copies.length > 0;

      return `
        <button class="life-search-result" type="button"
          role="option"
          data-card-lightbox="${escapeAttr(card.id)}">
          <span class="life-search-thumb">
            ${card.image_url
              ? `<img src="${escapeAttr(card.image_url)}" alt="" loading="lazy">`
              : `<span class="life-image-fallback">No foto</span>`
            }
          </span>

          <span class="life-search-copy">
            <span class="life-search-name">${escapeHtml(card.name)}</span>
            <span class="life-search-meta">
              ${escapeHtml(card.card_number_raw || "—")} ·
              ${escapeHtml(card.collectionName)} ·
              ${escapeHtml(card.typeName)}
            </span>
          </span>

          <span class="life-owned-status${owned ? " is-owned" : ""}">
            ${owned ? `Posseduta ×${copies.length}` : "Non posseduta"}
          </span>
        </button>
      `;
    }).join("");

    wireImageFallbacks(els.searchResults);
    openAutocomplete();
  }

  function onSearchKeydown(event) {
    if (event.key === "Escape") {
      closeAutocomplete();
      return;
    }

    if (event.key === "ArrowDown" && !els.searchResults.hidden) {
      const firstResult = els.searchResults.querySelector(".life-search-result");
      if (firstResult) {
        event.preventDefault();
        firstResult.focus();
      }
    }
  }

  function openAutocomplete() {
    els.searchResults.hidden = false;
    els.search.setAttribute("aria-expanded", "true");
    requestAnimationFrame(positionAutocomplete);
  }

  function closeAutocomplete() {
    els.searchResults.hidden = true;
    els.search.setAttribute("aria-expanded", "false");
  }

  function positionAutocomplete() {
    els.searchResults.classList.remove("is-up");
    const rect = els.searchResults.parentElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < 320 && spaceAbove > spaceBelow) {
      els.searchResults.classList.add("is-up");
    }
  }

  function openLightbox(card, opener) {
    if (!card.image_url) return;

    lightboxReturnFocus = opener || document.activeElement;
    els.lightboxImage.src = card.image_url;
    els.lightboxImage.alt = card.name;
    els.lightboxTitle.textContent = card.name;
    els.lightboxMeta.textContent =
      `${card.card_number_raw || "—"} · ${card.collectionName} · ${card.typeName}`;

    els.lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    els.lightboxClose.focus();
  }

  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lightboxImage.removeAttribute("src");
    document.body.style.overflow = "";
    if (lightboxReturnFocus && typeof lightboxReturnFocus.focus === "function") {
      lightboxReturnFocus.focus();
    }
    lightboxReturnFocus = null;
  }

  function wireImageFallbacks(container) {
    container.querySelectorAll("img").forEach((img) => {
      img.addEventListener("error", () => {
        const parent = img.parentElement;
        img.remove();
        if (parent && !parent.querySelector(".life-image-fallback")) {
          const fallback = document.createElement("span");
          fallback.className = "life-image-fallback";
          fallback.textContent = "Immagine non disponibile";
          parent.prepend(fallback);
        }
      }, { once: true });
    });
  }

  function resetFilters() {
    els.filterEdition.value = "";
    els.filterType.value = "";
    els.filterDuplicates.checked = false;
    els.sort.value = "number";
    renderCollectionGrid();
  }

  function sortOwnedItems(a, b, mode) {
    if (mode === "name") {
      return a.card.name.localeCompare(b.card.name, "it") || compareCardNumber(a.card, b.card);
    }

    if (mode === "type") {
      return a.card.typeName.localeCompare(b.card.typeName, "it") ||
        a.card.name.localeCompare(b.card.name, "it") ||
        compareCardNumber(a.card, b.card);
    }

    return compareCardNumber(a.card, b.card) ||
      a.card.name.localeCompare(b.card.name, "it") ||
      a.card.typeName.localeCompare(b.card.typeName, "it");
  }

  function compareCardNumber(a, b) {
    const aNum = numberSortValue(a);
    const bNum = numberSortValue(b);
    if (aNum !== bNum) return aNum - bNum;
    return String(a.card_number_raw || "").localeCompare(String(b.card_number_raw || ""), "it", { numeric: true });
  }

  function numberSortValue(card) {
    if (Number.isFinite(Number(card.card_number_num))) return Number(card.card_number_num);
    const match = String(card.card_number_raw || "").match(/\d+/);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
  }

  function searchRank(a, b, normalizedQuery) {
    const aExactName = normalize(a.name) === normalizedQuery ? 0 : 1;
    const bExactName = normalize(b.name) === normalizedQuery ? 0 : 1;
    if (aExactName !== bExactName) return aExactName - bExactName;

    const aExactNumber = normalize(a.card_number_raw || "") === normalizedQuery ? 0 : 1;
    const bExactNumber = normalize(b.card_number_raw || "") === normalizedQuery ? 0 : 1;
    if (aExactNumber !== bExactNumber) return aExactNumber - bExactNumber;

    const aOwned = state.copiesByCardId.has(String(a.id)) ? 0 : 1;
    const bOwned = state.copiesByCardId.has(String(b.id)) ? 0 : 1;
    if (aOwned !== bOwned) return aOwned - bOwned;

    return a.name.localeCompare(b.name, "it") || compareCardNumber(a, b);
  }

  function statCard(value, label) {
    return `
      <div class="life-stat">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  function editionMetric(value, label) {
    return `
      <div class="life-edition-metric">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  function uniqueSorted(options) {
    const map = new Map();
    for (const option of options) map.set(option.value, option.label);

    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
  }

  function optionMarkup(option) {
    return `<option value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</option>`;
  }

  function formatPercent(value) {
    return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value)}%`;
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = false;
    els.generalStats.innerHTML = "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();

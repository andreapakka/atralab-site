const LIFE_SUPABASE_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co";
const LIFE_SUPABASE_KEY = "sb_publishable_IRKqtPwpSGWd-YbnyvXqsg_DFKZSotn";
const LIFE_PRODUCT_STORAGE_KEY = "life-manage-product-id";

const lifeDb = supabase.createClient(LIFE_SUPABASE_URL, LIFE_SUPABASE_KEY);

const state = {
  mode: "insert",
  cards: [],
  collections: new Map(),
  cardTypes: new Map(),
  products: [],
  userCards: [],
  insertEntryMode: "pack",
  pack: {
    number: 1,
    count: 0
  },
  selectedCard: {
    insert: null,
    sell: null,
    delete: null
  },
  selectedCopy: {
    sell: null,
    delete: null
  }
};

const elements = {
  globalStatus: document.getElementById("lifeGlobalStatus"),
  tabs: [...document.querySelectorAll("[data-life-mode]")],
  panels: [...document.querySelectorAll("[data-life-panel]")],
  lightbox: document.getElementById("lifeLightbox"),
  lightboxImage: document.getElementById("lifeLightboxImage"),
  lightboxCaption: document.getElementById("lifeLightboxCaption"),
  lightboxClose: document.getElementById("lifeLightboxClose"),

  insert: {
    search: document.getElementById("lifeInsertSearch"),
    results: document.getElementById("lifeInsertResults"),
    selected: document.getElementById("lifeInsertSelected"),
    image: document.getElementById("lifeInsertImage"),
    imageFallback: document.getElementById("lifeInsertImageFallback"),
    collection: document.getElementById("lifeInsertCollection"),
    name: document.getElementById("lifeInsertName"),
    number: document.getElementById("lifeInsertNumber"),
    type: document.getElementById("lifeInsertType"),
    modeSingle: document.getElementById("lifeInsertModeSingle"),
    modePack: document.getElementById("lifeInsertModePack"),
    packStatus: document.getElementById("lifePackStatus"),
    packNumber: document.getElementById("lifePackNumber"),
    packCounter: document.getElementById("lifePackCounter"),
    packProgress: document.getElementById("lifePackProgress"),
    form: document.getElementById("lifeInsertForm"),
    product: document.getElementById("lifeInsertProduct"),
    obtainedAt: document.getElementById("lifeInsertObtainedAt"),
    sleeved: document.getElementById("lifeInsertSleeved"),
    toploader: document.getElementById("lifeInsertToploader"),
    notes: document.getElementById("lifeInsertNotes"),
    submit: document.getElementById("lifeInsertSubmit"),
    message: document.getElementById("lifeInsertMessage")
  },

  sell: {
    search: document.getElementById("lifeSellSearch"),
    results: document.getElementById("lifeSellResults"),
    selected: document.getElementById("lifeSellSelected"),
    image: document.getElementById("lifeSellImage"),
    imageFallback: document.getElementById("lifeSellImageFallback"),
    collection: document.getElementById("lifeSellCollection"),
    name: document.getElementById("lifeSellName"),
    number: document.getElementById("lifeSellNumber"),
    type: document.getElementById("lifeSellType"),
    copies: document.getElementById("lifeSellCopies"),
    form: document.getElementById("lifeSellForm"),
    soldAt: document.getElementById("lifeSellAt"),
    price: document.getElementById("lifeSellPrice"),
    submit: document.getElementById("lifeSellSubmit"),
    message: document.getElementById("lifeSellMessage")
  },

  delete: {
    search: document.getElementById("lifeDeleteSearch"),
    results: document.getElementById("lifeDeleteResults"),
    selected: document.getElementById("lifeDeleteSelected"),
    image: document.getElementById("lifeDeleteImage"),
    imageFallback: document.getElementById("lifeDeleteImageFallback"),
    collection: document.getElementById("lifeDeleteCollection"),
    name: document.getElementById("lifeDeleteName"),
    number: document.getElementById("lifeDeleteNumber"),
    type: document.getElementById("lifeDeleteType"),
    copies: document.getElementById("lifeDeleteCopies"),
    action: document.getElementById("lifeDeleteAction"),
    submit: document.getElementById("lifeDeleteSubmit"),
    message: document.getElementById("lifeDeleteMessage")
  }
};

function setGlobalStatus(message, type = "") {
  elements.globalStatus.textContent = message;
  elements.globalStatus.className = "life-global-status";

  if (type) {
    elements.globalStatus.classList.add(`is-${type}`);
  }
}

function setMessage(element, message = "", type = "") {
  element.textContent = message;
  element.className = "life-message";

  if (type) {
    element.classList.add(`is-${type}`);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocal(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function formatDateTime(value) {
  if (!value) return "Data non disponibile";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Data non disponibile";

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatEuro(value) {
  if (value === null || value === undefined || value === "") return "";

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value));
}

function normalizeSearch(value) {
  return String(value ?? "").trim().toLocaleLowerCase("it");
}

function getCollection(card) {
  return state.collections.get(Number(card.collection_id)) ?? null;
}

function getCardType(card) {
  return state.cardTypes.get(Number(card.card_type_id)) ?? null;
}

function getProduct(productId) {
  if (!productId) return null;
  return state.products.find(product => Number(product.id) === Number(productId)) ?? null;
}

function enrichCard(card) {
  const collection = getCollection(card);
  const type = getCardType(card);

  return {
    ...card,
    collection_name: collection?.name ?? "Collezione sconosciuta",
    category: collection?.category ?? "",
    card_type_name: type?.name ?? "Tipo sconosciuto"
  };
}

function findCard(cardId) {
  const card = state.cards.find(item => Number(item.id) === Number(cardId));
  return card ? enrichCard(card) : null;
}

function cardMatches(card, rawQuery) {
  const query = normalizeSearch(rawQuery);

  if (!query) return false;

  const name = normalizeSearch(card.name);
  const rawNumber = normalizeSearch(card.card_number_raw);
  const numericNumber = card.card_number_num === null || card.card_number_num === undefined
    ? ""
    : String(card.card_number_num);

  return name.includes(query) || rawNumber.includes(query) || numericNumber === query;
}

function cardRank(card, rawQuery) {
  const query = normalizeSearch(rawQuery);
  const name = normalizeSearch(card.name);
  const rawNumber = normalizeSearch(card.card_number_raw);
  const numericNumber = card.card_number_num === null || card.card_number_num === undefined
    ? ""
    : String(card.card_number_num);

  if (name === query) return 0;
  if (rawNumber === query) return 1;
  if (numericNumber === query) return 2;
  if (name.startsWith(query)) return 3;
  if (rawNumber.startsWith(query)) return 4;
  return 5;
}

function sortCardsForSearch(cards, query) {
  return [...cards].sort((a, b) => {
    const rankDiff = cardRank(a, query) - cardRank(b, query);

    if (rankDiff !== 0) return rankDiff;

    const nameDiff = a.name.localeCompare(b.name, "it", { sensitivity: "base" });

    if (nameDiff !== 0) return nameDiff;

    const collectionA = getCollection(a)?.name ?? "";
    const collectionB = getCollection(b)?.name ?? "";

    return collectionA.localeCompare(collectionB, "it", { sensitivity: "base" });
  });
}

function getPackProgress() {
  const packedCopies = state.userCards.filter(copy => {
    const packNumber = Number(copy.pack_number);
    return Number.isInteger(packNumber) && packNumber > 0;
  });

  if (packedCopies.length === 0) {
    return { number: 1, count: 0 };
  }

  const maxPackNumber = Math.max(...packedCopies.map(copy => Number(copy.pack_number)));
  const currentCount = packedCopies.filter(
    copy => Number(copy.pack_number) === maxPackNumber
  ).length;

  if (currentCount >= 10) {
    return { number: maxPackNumber + 1, count: 0 };
  }

  return { number: maxPackNumber, count: currentCount };
}

function renderPackProgress() {
  const progress = getPackProgress();
  state.pack.number = progress.number;
  state.pack.count = progress.count;

  elements.insert.packNumber.textContent = `#${progress.number}`;
  elements.insert.packCounter.textContent = `Carta ${progress.count + 1} di 10`;
  elements.insert.packProgress.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const className = index < progress.count
      ? "is-done"
      : index === progress.count
        ? "is-current"
        : "";
    return `<span${className ? ` class="${className}"` : ""}></span>`;
  }).join("");
}

function updateInsertSubmitLabel() {
  elements.insert.submit.textContent = state.insertEntryMode === "pack"
    ? "Aggiungi al pacchetto"
    : "Aggiungi alla collezione";
}

function setInsertEntryMode(mode) {
  if (mode !== "single" && mode !== "pack") return;

  state.insertEntryMode = mode;
  const isPack = mode === "pack";

  elements.insert.modeSingle.classList.toggle("is-active", !isPack);
  elements.insert.modePack.classList.toggle("is-active", isPack);
  elements.insert.modeSingle.setAttribute("aria-pressed", String(!isPack));
  elements.insert.modePack.setAttribute("aria-pressed", String(isPack));
  elements.insert.packStatus.hidden = !isPack;

  if (isPack) {
    renderPackProgress();
  }

  updateInsertSubmitLabel();
}

function copyIsAvailableForSale(copy) {
  return !copy.deleted_at && !copy.sold_at;
}

function copyIsAvailableForDelete(copy) {
  return !copy.deleted_at;
}

function copiesForCard(cardId, mode) {
  const predicate = mode === "sell" ? copyIsAvailableForSale : copyIsAvailableForDelete;

  return state.userCards
    .filter(copy => Number(copy.card_id) === Number(cardId) && predicate(copy))
    .sort((a, b) => new Date(b.obtained_at) - new Date(a.obtained_at));
}

function searchableOwnedCards(mode, query) {
  const predicate = mode === "sell" ? copyIsAvailableForSale : copyIsAvailableForDelete;
  const availableCardIds = new Set(
    state.userCards
      .filter(predicate)
      .map(copy => Number(copy.card_id))
  );

  return sortCardsForSearch(
    state.cards.filter(card => availableCardIds.has(Number(card.id)) && cardMatches(card, query)),
    query
  );
}

function renderResultThumb(card) {
  if (!card.image_url) {
    return '<span class="life-result-thumb-fallback">NO IMG</span>';
  }

  return `<img class="life-result-thumb" src="${escapeHtml(card.image_url)}" alt="" loading="lazy">`;
}

function renderSearchResults(mode, query) {
  const target = elements[mode].results;
  const normalized = normalizeSearch(query);

  if (!normalized) {
    target.hidden = true;
    target.innerHTML = "";
    return;
  }

  let cards;

  if (mode === "insert") {
    cards = sortCardsForSearch(
      state.cards.filter(card => cardMatches(card, normalized)),
      normalized
    );
  } else {
    cards = searchableOwnedCards(mode, normalized);
  }

  const limited = cards.slice(0, 12);

  if (limited.length === 0) {
    target.innerHTML = '<div class="life-result-empty">Nessuna carta trovata.</div>';
    target.hidden = false;
    positionAutocomplete(target);		
    return;
  }

  target.innerHTML = limited.map(card => {
    const enriched = enrichCard(card);
    const count = mode === "insert" ? null : copiesForCard(card.id, mode).length;
    const copyText = count === null
      ? enriched.card_type_name
      : `${enriched.card_type_name} · ${count} ${count === 1 ? "copia" : "copie"}`;

    return `
      <button class="life-result" type="button" role="option" data-life-result-id="${card.id}">
        ${renderResultThumb(card)}
        <span class="life-result-main">
          <span class="life-result-name">${escapeHtml(card.name)}</span>
          <span class="life-result-sub">${escapeHtml(enriched.collection_name)} · ${escapeHtml(copyText)}</span>
        </span>
        <span class="life-result-number">${escapeHtml(card.card_number_raw)}</span>
      </button>
    `;
  }).join("");

  target.hidden = false;
  positionAutocomplete(target);	
}

function renderSelectedCard(mode, card) {
  const ui = elements[mode];
  const enriched = enrichCard(card);

  ui.collection.textContent = enriched.collection_name;
  ui.name.textContent = card.name;
  ui.number.textContent = card.card_number_raw;
  ui.type.textContent = enriched.card_type_name;

  if (card.image_url) {
    ui.imageFallback.hidden = true;
    ui.image.hidden = false;
    ui.image.src = card.image_url;
    ui.image.alt = `${card.name} ${card.card_number_raw}`;
    ui.image.setAttribute("aria-label", `Apri immagine ingrandita di ${card.name}`);
  } else {
    ui.image.removeAttribute("src");
    ui.image.alt = "";
    ui.image.hidden = true;
    ui.imageFallback.hidden = false;
  }

  ui.selected.hidden = false;
}

function selectCard(mode, cardId) {
  const card = state.cards.find(item => Number(item.id) === Number(cardId));

  if (!card) return;

  state.selectedCard[mode] = card;
  elements[mode].search.value = `${card.name} — ${card.card_number_raw}`;
  elements[mode].results.hidden = true;
  renderSelectedCard(mode, card);

  if (mode === "insert") {
    elements.insert.obtainedAt.value = localDateTimeValue();
    setMessage(elements.insert.message);
    elements.insert.product.focus();
    return;
  }

  state.selectedCopy[mode] = null;
  renderCopies(mode, card.id);

  if (mode === "sell") {
    elements.sell.form.hidden = true;
    elements.sell.price.value = "";
    elements.sell.soldAt.value = localDateTimeValue();
    setMessage(elements.sell.message);
  } else {
    elements.delete.action.hidden = true;
    setMessage(elements.delete.message);
  }
}

function productLabel(productId) {
  const product = getProduct(productId);

  if (!product) return "Provenienza non specificata";

  const collection = product.collection_id
    ? state.collections.get(Number(product.collection_id))
    : null;

  return collection
    ? `${collection.name} · ${product.name}`
    : product.name;
}

function protectionText(copy) {
  const values = [];

  if (copy.sleeved) values.push("Sleeved");
  if (copy.toploader) values.push("Toploader");

  return values;
}

function renderCopies(mode, cardId) {
  const ui = elements[mode];
  const copies = copiesForCard(cardId, mode);

  if (copies.length === 0) {
    ui.copies.innerHTML = '<p class="life-copy-empty">Nessuna copia disponibile.</p>';
    return;
  }

  ui.copies.innerHTML = copies.map(copy => {
    const protections = protectionText(copy);
    const soldBadge = copy.sold_at
      ? `<span class="life-copy-badge is-sold">Venduta ${escapeHtml(formatEuro(copy.sold_price))}</span>`
      : "";
    const protectionBadges = protections
      .map(value => `<span class="life-copy-badge">${escapeHtml(value)}</span>`)
      .join("");
    const notes = copy.notes
      ? ` · ${escapeHtml(copy.notes)}`
      : "";
    const saleInfo = copy.sold_at
      ? ` · vendita ${escapeHtml(formatDateTime(copy.sold_at))}`
      : "";

    return `
      <button class="life-copy-option" type="button" data-life-copy-id="${copy.id}">
        <span class="life-copy-radio" aria-hidden="true"></span>
        <span class="life-copy-main">
          <span class="life-copy-title">Ottenuta ${escapeHtml(formatDateTime(copy.obtained_at))}</span>
          <span class="life-copy-sub">${escapeHtml(productLabel(copy.obtained_from_product_id))}${saleInfo}${notes}</span>
        </span>
        <span class="life-copy-badges">${protectionBadges}${soldBadge}</span>
      </button>
    `;
  }).join("");
}

function selectCopy(mode, copyId) {
  const copy = state.userCards.find(item => Number(item.id) === Number(copyId));

  if (!copy) return;

  state.selectedCopy[mode] = copy;

  elements[mode].copies.querySelectorAll("[data-life-copy-id]").forEach(button => {
    button.classList.toggle("is-selected", Number(button.dataset.lifeCopyId) === Number(copyId));
  });

  if (mode === "sell") {
    elements.sell.form.hidden = false;
    elements.sell.soldAt.value = localDateTimeValue();
    elements.sell.price.focus();
    setMessage(elements.sell.message);
  } else {
    elements.delete.action.hidden = false;
    setMessage(elements.delete.message);
  }
}

function resetSelected(mode) {
  state.selectedCard[mode] = null;
  state.selectedCopy[mode] = null;

  elements[mode].search.value = "";
  elements[mode].results.hidden = true;
  elements[mode].results.innerHTML = "";
  elements[mode].selected.hidden = true;

  if (mode === "sell") {
    elements.sell.form.hidden = true;
    elements.sell.price.value = "";
  }

  if (mode === "delete") {
    elements.delete.action.hidden = true;
  }
}

function setMode(mode) {
  if (!elements[mode]) return;

  state.mode = mode;

  elements.tabs.forEach(tab => {
    const isActive = tab.dataset.lifeMode === mode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  elements.panels.forEach(panel => {
    panel.hidden = panel.dataset.lifePanel !== mode;
  });

  elements[mode].search.focus();
}

function populateProductSelect() {
  const select = elements.insert.product;

  if (state.products.length === 0) {
    select.innerHTML = '<option value="">Nessun prodotto disponibile</option>';
    select.disabled = true;
    return;
  }

  const sorted = [...state.products].sort((a, b) => {
    const aLabel = productLabel(a.id);
    const bLabel = productLabel(b.id);
    return aLabel.localeCompare(bLabel, "it", { sensitivity: "base" });
  });

  select.innerHTML = sorted.map(product => (
    `<option value="${product.id}">${escapeHtml(productLabel(product.id))}</option>`
  )).join("");

  let preferredId = null;

  try {
    preferredId = localStorage.getItem(LIFE_PRODUCT_STORAGE_KEY);
  } catch (error) {
    console.warn("LIFE product localStorage:", error);
  }

  const preferredExists = sorted.some(product => String(product.id) === String(preferredId));

  if (preferredExists) {
    select.value = String(preferredId);
  } else {
    const booster = sorted.find(product => product.name === "Booster Box");
    select.value = String(booster?.id ?? sorted[0].id);
  }

  select.disabled = false;
}

async function loadStaticData() {
  const [collectionsResponse, typesResponse, cardsResponse, productsResponse] = await Promise.all([
    lifeDb
      .from("life_collections")
      .select("id,name,category,active")
      .eq("active", true)
      .order("name"),
    lifeDb
      .from("life_card_types")
      .select("id,name,active")
      .eq("active", true)
      .order("name"),
    lifeDb
      .from("life_cards")
      .select("id,collection_id,card_type_id,name,card_number_raw,card_number_num,card_number_set,image_url,image_filename,gallery_order,active")
      .eq("active", true)
      .order("name"),
    lifeDb
      .from("life_products")
      .select("id,name,collection_id,active")
      .eq("active", true)
      .order("name")
  ]);

  const errors = [
    collectionsResponse.error,
    typesResponse.error,
    cardsResponse.error,
    productsResponse.error
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  state.collections = new Map(
    (collectionsResponse.data ?? []).map(item => [Number(item.id), item])
  );
  state.cardTypes = new Map(
    (typesResponse.data ?? []).map(item => [Number(item.id), item])
  );
  state.cards = cardsResponse.data ?? [];
  state.products = productsResponse.data ?? [];

  populateProductSelect();
}

async function loadUserCards() {
  const { data, error } = await lifeDb
    .from("life_user_cards")
    .select("id,card_id,obtained_at,updated_at,notes,sleeved,toploader,sold_at,sold_price,obtained_from_product_id,created_at,deleted_at,pack_number")
    .order("obtained_at", { ascending: false });

  if (error) throw error;

  state.userCards = data ?? [];
}

async function refreshUserCards() {
  await loadUserCards();
}

async function insertUserCard(event) {
  event.preventDefault();

  const card = state.selectedCard.insert;

  if (!card) {
    setMessage(elements.insert.message, "Seleziona prima una carta.", "error");
    return;
  }

  const productId = Number(elements.insert.product.value);
  const obtainedAt = toIsoFromLocal(elements.insert.obtainedAt.value);
  const packProgress = state.insertEntryMode === "pack" ? getPackProgress() : null;

  if (!productId) {
    setMessage(elements.insert.message, "Scegli la provenienza.", "error");
    return;
  }

  if (!obtainedAt) {
    setMessage(elements.insert.message, "Inserisci una data valida.", "error");
    return;
  }

  const payload = {
    card_id: Number(card.id),
    obtained_at: obtainedAt,
    notes: elements.insert.notes.value.trim() || null,
    sleeved: elements.insert.sleeved.checked,
    toploader: elements.insert.toploader.checked,
    obtained_from_product_id: productId,
    pack_number: packProgress?.number ?? null
  };

  elements.insert.submit.disabled = true;
  elements.insert.submit.textContent = "Salvataggio…";
  setMessage(elements.insert.message);

  const { error } = await lifeDb
    .from("life_user_cards")
    .insert(payload);

  elements.insert.submit.disabled = false;
  updateInsertSubmitLabel();

  if (error) {
    console.error("LIFE insert:", error);
    setMessage(elements.insert.message, "Non sono riuscito a salvare la carta.", "error");
    return;
  }

  try {
    localStorage.setItem(LIFE_PRODUCT_STORAGE_KEY, String(productId));
  } catch (storageError) {
    console.warn("LIFE product localStorage:", storageError);
  }

  await refreshUserCards();

  const completedPack = packProgress && packProgress.count === 9;
  if (state.insertEntryMode === "pack") {
    renderPackProgress();
  }

  const savedProduct = elements.insert.product.value;
  elements.insert.form.reset();
  elements.insert.product.value = savedProduct;
  elements.insert.obtainedAt.value = localDateTimeValue();

  resetSelected("insert");
  elements.insert.search.focus();

  if (packProgress) {
    const packMessage = completedPack
      ? `${card.name} aggiunta al pacchetto ${packProgress.number}. Pacchetto completato.`
      : `${card.name} aggiunta al pacchetto ${packProgress.number} · ${packProgress.count + 1}/10.`;
    setGlobalStatus(packMessage, "ready");
  } else {
    setGlobalStatus(`${card.name} aggiunta alla collezione.`, "ready");
  }
}

async function sellUserCard(event) {
  event.preventDefault();

  const copy = state.selectedCopy.sell;

  if (!copy) {
    setMessage(elements.sell.message, "Scegli la copia venduta.", "error");
    return;
  }

  const soldAt = toIsoFromLocal(elements.sell.soldAt.value);
  const rawPrice = elements.sell.price.value.trim().replace(",", ".");
  const soldPrice = Number(rawPrice);

  if (!soldAt) {
    setMessage(elements.sell.message, "Inserisci una data valida.", "error");
    return;
  }

  if (rawPrice === "" || Number.isNaN(soldPrice) || soldPrice < 0) {
    setMessage(elements.sell.message, "Inserisci un prezzo valido.", "error");
    return;
  }

  elements.sell.submit.disabled = true;
  elements.sell.submit.textContent = "Salvataggio…";
  setMessage(elements.sell.message);

  const { error } = await lifeDb
    .from("life_user_cards")
    .update({
      sold_at: soldAt,
      sold_price: soldPrice,
      updated_at: new Date().toISOString()
    })
    .eq("id", copy.id)
    .is("deleted_at", null)
    .is("sold_at", null);

  elements.sell.submit.disabled = false;
  elements.sell.submit.textContent = "Registra vendita";

  if (error) {
    console.error("LIFE sell:", error);
    setMessage(elements.sell.message, "Non sono riuscito a registrare la vendita.", "error");
    return;
  }

  const card = findCard(copy.card_id);
  await refreshUserCards();
  resetSelected("sell");
  elements.sell.search.focus();
  setGlobalStatus(`${card?.name ?? "Carta"} segnata come venduta.`, "ready");
}

async function deleteUserCard() {
  const copy = state.selectedCopy.delete;

  if (!copy) {
    setMessage(elements.delete.message, "Scegli la copia da eliminare.", "error");
    return;
  }

  const card = findCard(copy.card_id);
  const confirmed = window.confirm(
    `Eliminare logicamente questa copia di ${card?.name ?? "questa carta"}?\n\nLa riga resterà nel database.`
  );

  if (!confirmed) return;

  elements.delete.submit.disabled = true;
  elements.delete.submit.textContent = "Eliminazione…";
  setMessage(elements.delete.message);

  const { error } = await lifeDb
    .from("life_user_cards")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", copy.id)
    .is("deleted_at", null);

  elements.delete.submit.disabled = false;
  elements.delete.submit.textContent = "Elimina copia";

  if (error) {
    console.error("LIFE delete:", error);
    setMessage(elements.delete.message, "Non sono riuscito a eliminare la copia.", "error");
    return;
  }

  await refreshUserCards();
  resetSelected("delete");
  elements.delete.search.focus();
  setGlobalStatus(`${card?.name ?? "Carta"} eliminata logicamente.`, "ready");
}

function openLightbox(mode) {
  const ui = elements[mode];
  const card = state.selectedCard[mode];

  if (!card || ui.image.hidden || !ui.image.currentSrc && !ui.image.src) return;

  elements.lightboxImage.src = ui.image.currentSrc || ui.image.src;
  elements.lightboxImage.alt = ui.image.alt;
  elements.lightboxCaption.textContent = `${card.name} · ${card.card_number_raw} · ${enrichCard(card).collection_name}`;
  elements.lightbox.hidden = false;
  elements.lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("life-lightbox-open");
  elements.lightboxClose.focus();
}

function closeLightbox() {
  if (elements.lightbox.hidden) return;

  elements.lightbox.hidden = true;
  elements.lightbox.setAttribute("aria-hidden", "true");
  elements.lightboxImage.removeAttribute("src");
  elements.lightboxImage.alt = "";
  elements.lightboxCaption.textContent = "";
  document.body.classList.remove("life-lightbox-open");
}

function bindCardPreview(mode) {
  const image = elements[mode].image;

  image.addEventListener("click", () => openLightbox(mode));
  image.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox(mode);
    }
  });

  image.addEventListener("load", () => {
    image.hidden = false;
    elements[mode].imageFallback.hidden = true;
  });

  image.addEventListener("error", () => {
    image.hidden = true;
    elements[mode].imageFallback.hidden = false;
  });
}

function bindAutocomplete(mode) {
  const ui = elements[mode];

  ui.search.addEventListener("input", () => {
    state.selectedCard[mode] = null;
    state.selectedCopy[mode] = null;
    ui.selected.hidden = true;
    renderSearchResults(mode, ui.search.value);
  });

  ui.search.addEventListener("focus", () => {
    if (ui.search.value.trim() && !state.selectedCard[mode]) {
      renderSearchResults(mode, ui.search.value);
    }
  });

  ui.results.addEventListener("click", event => {
    const result = event.target.closest("[data-life-result-id]");

    if (!result) return;

    selectCard(mode, Number(result.dataset.lifeResultId));
  });
}

function bindEvents() {
  elements.tabs.forEach(tab => {
    tab.addEventListener("click", () => setMode(tab.dataset.lifeMode));
  });

  elements.insert.modeSingle.addEventListener("click", () => setInsertEntryMode("single"));
  elements.insert.modePack.addEventListener("click", () => setInsertEntryMode("pack"));

  bindAutocomplete("insert");
  bindAutocomplete("sell");
  bindAutocomplete("delete");

  elements.sell.copies.addEventListener("click", event => {
    const option = event.target.closest("[data-life-copy-id]");
    if (option) selectCopy("sell", Number(option.dataset.lifeCopyId));
  });

  elements.delete.copies.addEventListener("click", event => {
    const option = event.target.closest("[data-life-copy-id]");
    if (option) selectCopy("delete", Number(option.dataset.lifeCopyId));
  });

  elements.insert.form.addEventListener("submit", insertUserCard);
  elements.sell.form.addEventListener("submit", sellUserCard);
  elements.delete.submit.addEventListener("click", deleteUserCard);

  document.addEventListener("click", event => {
    document.querySelectorAll(".life-autocomplete").forEach(wrapper => {
      if (!wrapper.contains(event.target)) {
        const results = wrapper.querySelector(".life-autocomplete-results");
        if (results) results.hidden = true;
      }
    });
  });

  bindCardPreview("insert");
  bindCardPreview("sell");
  bindCardPreview("delete");

  elements.lightboxClose.addEventListener("click", closeLightbox);
  elements.lightbox.addEventListener("click", event => {
    if (event.target === elements.lightbox) closeLightbox();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !elements.lightbox.hidden) {
      closeLightbox();
    }
  });
}

async function initLifeManage() {
  bindEvents();
  elements.insert.obtainedAt.value = localDateTimeValue();
  elements.sell.soldAt.value = localDateTimeValue();

  try {
    setGlobalStatus("Caricamento catalogo…");
    await Promise.all([loadStaticData(), loadUserCards()]);

    elements.insert.search.disabled = false;
    elements.sell.search.disabled = false;
    elements.delete.search.disabled = false;

    renderPackProgress();
    setInsertEntryMode("pack");

    setGlobalStatus(
      `${state.cards.length} carte nel catalogo · ${state.userCards.filter(copyIsAvailableForDelete).length} copie registrate`,
      "ready"
    );

    elements.insert.search.focus();
  } catch (error) {
    console.error("LIFE init:", error);
    setGlobalStatus("Errore durante il caricamento dei dati LIFE.", "error");
  }
}

function positionAutocomplete(results) {
  results.classList.remove("is-up");

  const rect = results.parentElement.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow < 320 && spaceAbove > spaceBelow) {
    results.classList.add("is-up");
  }
}

initLifeManage();

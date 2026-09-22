(() => {
  "use strict";

  const STORAGE_KEY = "atralab-aroundme-last-search-v1";
  const MAX_RESULTS = 15;
  const DEFAULT_RADIUS = 500;
  const MAX_RADIUS = 2000;
  const DEFAULT_CATEGORY = "food";

  const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
  const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
  const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  const CATEGORIES = {
    food: {
      label: "Cibo",
      query: ['nwr(around:{r},{lat},{lon})["amenity"~"^(restaurant|cafe|bar|fast_food|pub)$"]']
    },
    water: {
      label: "Acqua",
      query: [
        'nwr(around:{r},{lat},{lon})["amenity"="drinking_water"]',
        'nwr(around:{r},{lat},{lon})["man_made"="water_tap"]',
        'nwr(around:{r},{lat},{lon})["amenity"="fountain"]["drinking_water"="yes"]'
      ]
    },
    toilets: {
      label: "Bagni",
      query: ['nwr(around:{r},{lat},{lon})["amenity"="toilets"]']
    },
    pharmacy: {
      label: "Farmacie",
      query: [
        'nwr(around:{r},{lat},{lon})["amenity"="pharmacy"]',
        'nwr(around:{r},{lat},{lon})["shop"="chemist"]'
      ]
    },
    atm: {
      label: "ATM",
      query: [
        'nwr(around:{r},{lat},{lon})["amenity"="atm"]',
        'nwr(around:{r},{lat},{lon})["amenity"="bank"]["atm"="yes"]'
      ]
    },
    pause: {
      label: "Pausa",
      query: [
        'nwr(around:{r},{lat},{lon})["amenity"="bench"]',
        'nwr(around:{r},{lat},{lon})["leisure"="park"]',
        'nwr(around:{r},{lat},{lon})["leisure"="picnic_table"]',
        'nwr(around:{r},{lat},{lon})["tourism"="picnic_site"]'
      ]
    },
    defib: {
      label: "Defibrillatori",
      query: ['nwr(around:{r},{lat},{lon})["emergency"="defibrillator"]']
    },
    mobility: {
      label: "Mobilità",
      query: [
        'nwr(around:{r},{lat},{lon})["highway"="bus_stop"]',
        'nwr(around:{r},{lat},{lon})["public_transport"~"^(platform|station)$"]',
        'nwr(around:{r},{lat},{lon})["railway"~"^(station|tram_stop|subway_entrance)$"]',
        'nwr(around:{r},{lat},{lon})["amenity"~"^(parking|bicycle_parking|charging_station|bicycle_repair_station)$"]'
      ]
    }
  };

  let lastNominatimRequestAt = 0;
  let nominatimQueue = Promise.resolve();
  const reverseAddressCache = new Map();

  const state = {
    location: null,
    radius: DEFAULT_RADIUS,
    category: DEFAULT_CATEGORY,
    results: [],
    savedAt: null,
    map: null,
    originMarker: null,
    resultMarker: null,
    selectedResult: null,
    abortController: null,
    isBusy: false
  };

  const els = {
    searchForm: document.getElementById("aroundmeSearchForm"),
    searchInput: document.getElementById("aroundmePlace"),
    searchButton: document.getElementById("aroundmeSearchButton"),
    locateButton: document.getElementById("aroundmeLocateButton"),
    placeChoices: document.getElementById("aroundmePlaceChoices"),
    searchMessage: document.getElementById("aroundmeSearchMessage"),
    categories: document.getElementById("aroundmeCategories"),
    radii: document.getElementById("aroundmeRadii"),
    locationLabel: document.getElementById("aroundmeLocationLabel"),
    savedAt: document.getElementById("aroundmeSavedAt"),
    resultsSection: document.getElementById("aroundmeResultsSection"),
    resultsKicker: document.getElementById("aroundmeResultsKicker"),
    resultsTitle: document.getElementById("aroundmeResultsTitle"),
    resultsCount: document.getElementById("aroundmeResultsCount"),
    results: document.getElementById("aroundmeResults"),
    resultsLayout: document.getElementById("aroundmeResultsLayout"),
    network: document.getElementById("aroundmeNetwork"),
    networkText: document.getElementById("aroundmeNetworkText"),
    mapPanel: document.getElementById("aroundmeMapPanel"),
    mapTitle: document.getElementById("aroundmeMapTitle"),
    mapAddress: document.getElementById("aroundmeMapAddress"),
    mapClose: document.getElementById("aroundmeMapClose"),
    map: document.getElementById("aroundmeMap"),
    navigate: document.getElementById("aroundmeNavigate")
  };

  function clampRadius(value) {
    const radius = Number(value);
    if (!Number.isFinite(radius)) return DEFAULT_RADIUS;
    return Math.max(250, Math.min(MAX_RADIUS, radius));
  }

  function setBusy(isBusy, text = "") {
    state.isBusy = isBusy;

    document.querySelectorAll(".aroundme-main button").forEach((button) => {
      button.disabled = isBusy;
    });

    els.searchInput.disabled = isBusy;
    els.searchButton.textContent = isBusy ? "Attendi…" : "Cerca";

    if (!isBusy) {
      document.querySelectorAll(".aroundme-main button").forEach((button) => {
        button.disabled = false;
      });

      enableControls(Boolean(state.location));
    }

    if (text) {
      showMessage(text, false);
    }
  }

  function showMessage(message, isError = false) {
    els.searchMessage.hidden = !message;
    els.searchMessage.textContent = message || "";
    els.searchMessage.classList.toggle("is-error", isError);
  }

  function hideMessage() {
    showMessage("");
  }

  function updateNetworkStatus() {
    const online = navigator.onLine;
    els.network.classList.toggle("is-offline", !online);
    els.networkText.textContent = online ? "Online" : "Offline · dati salvati";
  }

  function enableControls(enabled) {
    els.categories.querySelectorAll("button").forEach((button) => {
      button.disabled = !enabled;
    });
    els.radii.querySelectorAll("button").forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function selectCategory(category) {
    state.category = CATEGORIES[category] || category === "all" ? category : DEFAULT_CATEGORY;
    els.categories.querySelectorAll("[data-category]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.category === state.category);
    });
  }

  function selectRadius(radius) {
    state.radius = clampRadius(radius);
    els.radii.querySelectorAll("[data-radius]").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.radius) === state.radius);
    });
  }

  function setLocation(location) {
    state.location = {
      label: String(location.label || "Punto selezionato"),
      lat: Number(location.lat),
      lon: Number(location.lon)
    };

    els.locationLabel.textContent = state.location.label;
    enableControls(true);
    closeMap();
  }

  function buildNominatimSearchUrl(query) {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: query,
      limit: "5",
      addressdetails: "1",
      dedupe: "1",
      "accept-language": "it"
    });
    return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
  }

  function fetchNominatim(url) {
    const runRequest = async () => {
      const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
      if (waitMs) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      lastNominatimRequestAt = Date.now();
      return fetch(url, { headers: { Accept: "application/json" } });
    };

    const request = nominatimQueue.then(runRequest, runRequest);
    nominatimQueue = request.then(() => undefined, () => undefined);
    return request;
  }

  async function searchPlace(query) {
    if (!navigator.onLine) {
      showMessage("Sei offline: puoi usare l'ultima ricerca salvata, ma non cercare un nuovo luogo.", true);
      return;
    }

    setBusy(true, "Cerco il luogo…");
    els.placeChoices.hidden = true;
    els.placeChoices.innerHTML = "";

    try {
      const response = await fetchNominatim(buildNominatimSearchUrl(query));

      if (!response.ok) throw new Error(`Nominatim ${response.status}`);

      const places = await response.json();
      hideMessage();

      if (!Array.isArray(places) || places.length === 0) {
        showMessage("Nessun luogo trovato. Prova ad aggiungere città o provincia.", true);
        return;
      }

      if (places.length === 1) {
        await choosePlace(places[0]);
        return;
      }

      renderPlaceChoices(places);
    } catch (error) {
      console.error("AroundMe: errore ricerca luogo", error);
      showMessage("Non riesco a cercare il luogo in questo momento. Riprova tra poco.", true);
    } finally {
      setBusy(false);
    }
  }

  function renderPlaceChoices(places) {
    els.placeChoices.innerHTML = "";

    const title = document.createElement("p");
    title.className = "aroundme-examples";
    title.textContent = "Ho trovato più risultati. Scegli quello giusto:";
    els.placeChoices.appendChild(title);

    places.forEach((place) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "aroundme-place-choice";
      button.textContent = place.display_name;
      button.addEventListener("click", () => choosePlace(place));
      els.placeChoices.appendChild(button);
    });

    els.placeChoices.hidden = false;
  }

  function choosePlace(place) {
    els.placeChoices.hidden = true;
    hideMessage();
    setLocation({
      label: place.display_name,
      lat: place.lat,
      lon: place.lon
    });
    fetchAroundMe();
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      showMessage("Questo browser non supporta la geolocalizzazione.", true);
      return;
    }

    if (!navigator.onLine && !state.location) {
      showMessage("Sei offline e non c'è ancora una ricerca salvata.", true);
      return;
    }

    setBusy(true, "Cerco la tua posizione…");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        hideMessage();
        setLocation({
          label: "La tua posizione",
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });

        await fetchAroundMe();
      },
      (error) => {
        console.warn("AroundMe: geolocalizzazione non disponibile", error);
        setBusy(false);
        showMessage("Non riesco ad accedere alla posizione. Puoi cercare un indirizzo qui sopra.", true);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  }

  function buildOverpassQuery(category) {
    const keys = category === "all" ? Object.keys(CATEGORIES) : [category];
    const statements = [];

    keys.forEach((key) => {
      const config = CATEGORIES[key];
      if (!config) return;
      config.query.forEach((template) => {
        statements.push(
          template
            .replaceAll("{r}", String(state.radius))
            .replaceAll("{lat}", String(state.location.lat))
            .replaceAll("{lon}", String(state.location.lon)) + ";"
        );
      });
    });

    return `[out:json][timeout:25];\n(\n${statements.join("\n")}\n);\nout center tags qt;`;
  }

  async function queryOverpass(query) {
    let lastError = null;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const body = new URLSearchParams({ data: query });
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json"
          },
          body: body.toString(),
          signal: state.abortController?.signal
        });

        if (!response.ok) throw new Error(`Overpass ${response.status}`);
        return await response.json();
      } catch (error) {
        if (error.name === "AbortError") throw error;
        lastError = error;
        console.warn(`AroundMe: endpoint Overpass non disponibile (${endpoint})`, error);
      }
    }

    throw lastError || new Error("Overpass non disponibile");
  }

  async function fetchAroundMe() {
    if (!state.location) return;

    setBusy(true);

    try {
      if (!navigator.onLine) {
        const cached = loadStoredState();
        if (cached && cached.results?.length && isSameSearch(cached)) {
          state.results = cached.results;
          state.savedAt = cached.savedAt;
          renderResults(true);
        } else {
          state.results = [];
          state.savedAt = cached?.savedAt || state.savedAt;
          renderResults(true);
          showMessage("Offline: è disponibile solo l'ultima categoria e il raggio salvati.", true);
        }
        return;
      }

      if (state.abortController) state.abortController.abort();
      state.abortController = new AbortController();

      els.resultsSection.hidden = false;
      els.results.innerHTML = '<div class="aroundme-loading">Cerco nei dintorni…</div>';
      els.resultsCount.textContent = "";
      updateResultsHeading();
      closeMap();

      const data = await queryOverpass(buildOverpassQuery(state.category));
      const elements = Array.isArray(data?.elements) ? data.elements : [];

      state.results = normalizeResults(elements)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, MAX_RESULTS);
      state.savedAt = Date.now();

      saveLastSearch();
      renderResults(false);
      hideMessage();
      enrichMissingAddresses();
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("AroundMe: errore Overpass", error);

      const cached = loadStoredState();
      if (cached && cached.results?.length && isSameSearch(cached)) {
        state.results = cached.results;
        state.savedAt = cached.savedAt;
        renderResults(true);
        showMessage("Le API non rispondono: sto mostrando gli ultimi dati salvati per questa ricerca.", true);
      } else {
        els.results.innerHTML = '<div class="aroundme-empty">Non riesco a recuperare i luoghi in questo momento. Riprova tra poco.</div>';
        els.resultsCount.textContent = "";
        showMessage("Il servizio dati non ha risposto. Puoi riprovare tra poco.", true);
      }
    } finally {
      setBusy(false);
    }
  }

  function classifyElement(tags = {}) {
    if (["restaurant", "cafe", "bar", "fast_food", "pub"].includes(tags.amenity)) return "food";
    if (tags.amenity === "drinking_water" || tags.man_made === "water_tap" || (tags.amenity === "fountain" && tags.drinking_water === "yes")) return "water";
    if (tags.amenity === "toilets") return "toilets";
    if (tags.amenity === "pharmacy" || tags.shop === "chemist") return "pharmacy";
    if (tags.amenity === "atm" || (tags.amenity === "bank" && tags.atm === "yes")) return "atm";
    if (tags.emergency === "defibrillator") return "defib";
    if (tags.amenity === "bench" || tags.leisure === "park" || tags.leisure === "picnic_table" || tags.tourism === "picnic_site") return "pause";
    if (
      tags.highway === "bus_stop" ||
      ["platform", "station"].includes(tags.public_transport) ||
      ["station", "tram_stop", "subway_entrance"].includes(tags.railway) ||
      ["parking", "bicycle_parking", "charging_station", "bicycle_repair_station"].includes(tags.amenity)
    ) return "mobility";
    return null;
  }

  function normalizeResults(elements) {
    const seen = new Set();
    const normalized = [];

    elements.forEach((element) => {
      const lat = Number(element.lat ?? element.center?.lat);
      const lon = Number(element.lon ?? element.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const tags = element.tags || {};
      const category = classifyElement(tags);
      if (!category) return;
      if (state.category !== "all" && category !== state.category) return;

      const name = getDisplayName(tags, category);
      const dedupeKey = `${category}|${name.toLowerCase()}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const distance = haversineMeters(state.location.lat, state.location.lon, lat, lon);
      if (distance > state.radius + 25) return;

      normalized.push({
        id: `${element.type}-${element.id}`,
        osmType: element.type,
        osmId: element.id,
        category,
        categoryLabel: CATEGORIES[category].label,
        name,
        lat,
        lon,
        distance,
        direction: bearingLabel(state.location.lat, state.location.lon, lat, lon),
        address: getAddress(tags),
        details: getUsefulDetails(tags, category),
        openingHours: tags.opening_hours || "",
        tags
      });
    });

    return normalized;
  }

  function getDisplayName(tags, category) {
    if (tags.name) return tags.name;
    if (tags.brand) return tags.brand;
    if (tags.operator && ["atm", "defib", "mobility"].includes(category)) return tags.operator;

    const amenityNames = {
      restaurant: "Ristorante",
      cafe: "Caffè",
      bar: "Bar",
      fast_food: "Fast food",
      pub: "Pub",
      drinking_water: "Acqua potabile",
      toilets: "Bagni pubblici",
      pharmacy: "Farmacia",
      atm: "ATM",
      bank: "Banca / ATM",
      bench: "Panchina",
      parking: "Parcheggio",
      bicycle_parking: "Parcheggio bici",
      charging_station: "Ricarica veicoli",
      bicycle_repair_station: "Stazione riparazione bici"
    };

    if (amenityNames[tags.amenity]) return amenityNames[tags.amenity];
    if (tags.emergency === "defibrillator") return "Defibrillatore";
    if (tags.shop === "chemist") return "Parafarmacia / salute";
    if (tags.man_made === "water_tap") return "Punto acqua";
    if (tags.leisure === "park") return "Parco";
    if (tags.leisure === "picnic_table" || tags.tourism === "picnic_site") return "Area picnic";
    if (tags.highway === "bus_stop") return "Fermata bus";
    if (tags.railway === "station") return "Stazione";
    if (tags.railway === "tram_stop") return "Fermata tram";
    if (tags.railway === "subway_entrance") return "Ingresso metro";
    if (tags.public_transport === "platform") return "Fermata trasporto pubblico";

    return CATEGORIES[category]?.label || "Luogo";
  }

  function getAddress(tags) {
    const street = tags["addr:street"] || tags["addr:place"] || "";
    const number = tags["addr:housenumber"] || "";
    const postcode = tags["addr:postcode"] || "";
    const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "";

    const first = [street, number].filter(Boolean).join(" ");
    const second = [postcode, city].filter(Boolean).join(" ");
    return [first, second].filter(Boolean).join(", ");
  }

  function yesNoLabel(value, yesLabel, noLabel = "") {
    if (value === "yes") return yesLabel;
    if (value === "no" && noLabel) return noLabel;
    return "";
  }

  function getUsefulDetails(tags, category) {
    const details = [];

    if (tags.opening_hours) details.push(`Orari: ${tags.opening_hours}`);
    if (tags.operator && tags.operator !== tags.name) details.push(`Gestore: ${tags.operator}`);

    if (category === "food") {
      if (tags.cuisine) details.push(`Cucina: ${tags.cuisine.replaceAll(";", ", ")}`);
      const outdoor = yesNoLabel(tags.outdoor_seating, "Tavoli esterni");
      if (outdoor) details.push(outdoor);
    }

    if (category === "water") {
      if (tags.amenity === "drinking_water" || tags.drinking_water === "yes") details.push("Acqua potabile");
    }

    if (category === "toilets") {
      const fee = yesNoLabel(tags.fee, "A pagamento", "Gratis");
      if (fee) details.push(fee);
      const wheelchair = yesNoLabel(tags.wheelchair, "Accessibile in sedia a rotelle");
      if (wheelchair) details.push(wheelchair);
      if (tags.unisex === "yes") details.push("Unisex");
    }

    if (category === "pharmacy") {
      if (tags.phone || tags["contact:phone"]) details.push(`Tel: ${tags.phone || tags["contact:phone"]}`);
    }

    if (category === "atm") {
      if (tags.brand && tags.brand !== tags.name) details.push(tags.brand);
    }

    if (category === "pause") {
      const covered = yesNoLabel(tags.covered, "Coperto");
      if (covered) details.push(covered);
      const backrest = yesNoLabel(tags.backrest, "Con schienale");
      if (backrest) details.push(backrest);
    }

    if (category === "defib") {
      const indoor = yesNoLabel(tags.indoor, "Al chiuso", "All'aperto");
      if (indoor) details.push(indoor);
      if (tags.access && tags.access !== "yes") details.push(`Accesso: ${tags.access}`);
    }

    if (category === "mobility") {
      if (tags.capacity) details.push(`Capienza: ${tags.capacity}`);
      const fee = yesNoLabel(tags.fee, "A pagamento", "Gratis");
      if (fee) details.push(fee);
      const covered = yesNoLabel(tags.covered, "Coperto");
      if (covered) details.push(covered);
    }

    const wheelchair = yesNoLabel(tags.wheelchair, "Accessibile");
    if (wheelchair && !details.includes(wheelchair)) details.push(wheelchair);

    return details.slice(0, 3);
  }

  function updateResultsHeading(fromCache = false) {
    const label = state.category === "all" ? "Tutto" : CATEGORIES[state.category]?.label || "Risultati";
    els.resultsKicker.textContent = fromCache ? "DATI SALVATI" : label.toUpperCase();
    els.resultsTitle.textContent = state.location ? `Entro ${formatRadius(state.radius)} da ${shortLocationLabel(state.location.label)}` : "Vicino a te";
  }

  function renderResults(fromCache = false) {
    els.resultsSection.hidden = false;
    updateResultsHeading(fromCache);
    els.results.innerHTML = "";

    if (state.savedAt) {
      els.savedAt.textContent = `${fromCache ? "Salvati" : "Aggiornati"} ${formatRelativeTime(state.savedAt)}`;
    } else {
      els.savedAt.textContent = "";
    }

    if (!state.results.length) {
      els.resultsCount.textContent = "0 risultati";
      els.results.innerHTML = '<div class="aroundme-empty">Nessun risultato trovato in questo raggio. Prova ad aumentare la distanza o cambiare categoria.</div>';
      return;
    }

    els.resultsCount.textContent = `${state.results.length} ${state.results.length === 1 ? "risultato" : "risultati"}`;

    state.results.forEach((result) => {
      const card = document.createElement("article");
      card.className = "aroundme-result";
      card.dataset.resultId = result.id;

      const main = document.createElement("div");
      main.className = "aroundme-result-main";

      const top = document.createElement("div");
      top.className = "aroundme-result-top";

      const category = document.createElement("span");
      category.className = "aroundme-result-category";
      category.textContent = result.categoryLabel;

      const title = document.createElement("h3");
      title.textContent = result.name;

      top.append(category, title);
      main.appendChild(top);

      const address = document.createElement("p");
      address.className = "aroundme-result-address";
      address.dataset.resultAddress = result.id;
      address.textContent = result.address || (navigator.onLine ? "Cerco l'indirizzo…" : "Indirizzo non presente nei dati salvati");
      main.appendChild(address);

      if (result.details?.length) {
        const details = document.createElement("div");
        details.className = "aroundme-result-details";
        result.details.forEach((detail) => {
          const span = document.createElement("span");
          span.textContent = detail;
          details.appendChild(span);
        });
        main.appendChild(details);
      }

      const side = document.createElement("div");
      side.className = "aroundme-result-side";

      const distance = document.createElement("div");
      distance.className = "aroundme-distance";
      distance.innerHTML = `${escapeHtml(formatDistance(result.distance))}<span class="aroundme-direction">${escapeHtml(result.direction)}</span>`;

      const actions = document.createElement("div");
      actions.className = "aroundme-result-actions";

      const mapButton = document.createElement("button");
      mapButton.type = "button";
      mapButton.className = "aroundme-mini-btn";
      mapButton.textContent = "Mappa";
      mapButton.addEventListener("click", () => openMap(result));

      const navigate = document.createElement("a");
      navigate.className = "aroundme-mini-btn";
      navigate.href = navigationUrl(result.lat, result.lon);
      navigate.target = "_blank";
      navigate.rel = "noopener";
      navigate.textContent = navigationLabel();

      actions.append(mapButton, navigate);
      side.append(distance, actions);
      card.append(main, side);
      els.results.appendChild(card);
    });
  }

  function navigationLabel() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return "Mappe";
    if (/Android/i.test(ua)) return "Google Maps";
    return "Naviga";
  }

  function navigationUrl(lat, lon) {
    const ua = navigator.userAgent || "";
    const destination = `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
    const hasOrigin = state.location && Number.isFinite(Number(state.location.lat)) && Number.isFinite(Number(state.location.lon));
    const origin = hasOrigin
      ? `${Number(state.location.lat).toFixed(6)},${Number(state.location.lon).toFixed(6)}`
      : "";

    if (/iPad|iPhone|iPod/.test(ua)) {
      const params = new URLSearchParams({
        daddr: destination,
        dirflg: "w"
      });
      if (origin) params.set("saddr", origin);
      return `https://maps.apple.com/?${params.toString()}`;
    }

    const params = new URLSearchParams({
      api: "1",
      destination,
      travelmode: "walking"
    });
    if (origin) params.set("origin", origin);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  async function openMap(result) {
    state.selectedResult = result;
    els.mapPanel.hidden = false;
    els.resultsLayout.classList.add("has-map");
    els.mapTitle.textContent = result.name;
    els.mapAddress.textContent = result.address || "Cerco l'indirizzo…";
    els.navigate.href = navigationUrl(result.lat, result.lon);
    els.navigate.textContent = navigationLabel();

    if (!window.L) {
      els.map.innerHTML = '<div class="aroundme-empty">Mappa non disponibile in questo momento. Puoi comunque usare il pulsante Naviga.</div>';
      return;
    }

    if (!state.map) {
      state.map = L.map(els.map, {
        zoomControl: true,
        attributionControl: true
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(state.map);
    }

    const originIcon = L.divIcon({
      className: "",
      html: '<div class="aroundme-origin-pin" aria-hidden="true"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    const resultIcon = L.divIcon({
      className: "",
      html: '<div class="aroundme-map-pin" aria-hidden="true"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    if (state.originMarker) state.originMarker.remove();
    if (state.resultMarker) state.resultMarker.remove();

    state.originMarker = L.marker([state.location.lat, state.location.lon], { icon: originIcon })
      .addTo(state.map)
      .bindTooltip("Punto di partenza");

    state.resultMarker = L.marker([result.lat, result.lon], { icon: resultIcon })
      .addTo(state.map)
      .bindTooltip(result.name);

    state.map.fitBounds(
      [
        [state.location.lat, state.location.lon],
        [result.lat, result.lon]
      ],
      { padding: [46, 46], maxZoom: 17 }
    );

    setTimeout(() => state.map.invalidateSize(), 0);

    if (!result.address && navigator.onLine) {
      const address = await reverseAddress(result.lat, result.lon);
      if (address) {
        result.address = address;
        updateResultAddress(result.id, address);
        saveLastSearch();
      }

      if (state.selectedResult?.id === result.id) {
        els.mapAddress.textContent = address || "Indirizzo non disponibile";
      }
    }

    if (window.innerWidth <= 960) {
      els.mapPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function closeMap() {
    state.selectedResult = null;
    els.mapPanel.hidden = true;
    els.resultsLayout.classList.remove("has-map");
  }

  async function reverseAddress(lat, lon) {
    const key = `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
    if (reverseAddressCache.has(key)) return reverseAddressCache.get(key);

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        lat: String(lat),
        lon: String(lon),
        zoom: "18",
        addressdetails: "1",
        "accept-language": "it"
      });
      const response = await fetchNominatim(`${NOMINATIM_REVERSE_URL}?${params.toString()}`);
      if (!response.ok) return "";
      const data = await response.json();
      const address = formatReverseAddress(data);
      reverseAddressCache.set(key, address);
      return address;
    } catch (error) {
      console.warn("AroundMe: reverse geocoding non disponibile", error);
      return "";
    }
  }

  function formatReverseAddress(data) {
    const address = data?.address || {};
    const road =
      address.road ||
      address.pedestrian ||
      address.footway ||
      address.path ||
      address.cycleway ||
      address.square ||
      address.place ||
      "";
    const number = address.house_number || "";
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.city_district ||
      "";

    const streetLine = [road, number].filter(Boolean).join(" ");
    const concise = [streetLine, city].filter(Boolean).join(", ");
    return concise || data?.display_name || "";
  }

  function updateResultAddress(resultId, address) {
    const node = els.results.querySelector(`[data-result-address="${CSS.escape(resultId)}"]`);
    if (node) node.textContent = address || "Indirizzo non disponibile";
  }

  async function enrichMissingAddresses() {
    if (!navigator.onLine || !state.results.length) return;

    const snapshot = state.results;
    const missing = snapshot.filter((result) => !result.address).slice(0, 6);

    for (const result of missing) {
      if (state.results !== snapshot || !navigator.onLine) return;

      const address = await reverseAddress(result.lat, result.lon);
      if (state.results !== snapshot) return;

      if (address) {
        result.address = address;
        updateResultAddress(result.id, address);
        saveLastSearch();
      } else {
        updateResultAddress(result.id, "Indirizzo non disponibile");
      }
    }

    if (state.results === snapshot) {
      snapshot
        .filter((result) => !result.address && !missing.includes(result))
        .forEach((result) => {
          updateResultAddress(result.id, "Indirizzo non presente · apri Mappa per cercarlo");
        });
    }
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function bearingLabel(lat1, lon1, lat2, lon2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const toDeg = (value) => (value * 180) / Math.PI;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const lambda = toRad(lon2 - lon1);
    const y = Math.sin(lambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda);
    const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
    const labels = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return labels[Math.round(bearing / 45) % 8];
  }

  function formatDistance(meters) {
    if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
    return `${(meters / 1000).toFixed(meters < 1500 ? 1 : 1).replace(".", ",")} km`;
  }

  function formatRadius(radius) {
    return radius >= 1000 ? `${String(radius / 1000).replace(".", ",")} km` : `${radius} m`;
  }

  function shortLocationLabel(label) {
    if (!label) return "qui";
    if (label === "La tua posizione") return "te";
    const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
    return parts.slice(0, 2).join(", ") || label;
  }

  function formatRelativeTime(timestamp) {
    const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (diffMinutes < 1) return "adesso";
    if (diffMinutes === 1) return "1 min fa";
    if (diffMinutes < 60) return `${diffMinutes} min fa`;
    const hours = Math.round(diffMinutes / 60);
    if (hours === 1) return "1 ora fa";
    if (hours < 24) return `${hours} ore fa`;
    const days = Math.round(hours / 24);
    return days === 1 ? "1 giorno fa" : `${days} giorni fa`;
  }

  function saveLastSearch() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          location: state.location,
          radius: state.radius,
          category: state.category,
          results: state.results,
          savedAt: state.savedAt
        })
      );
    } catch (error) {
      console.warn("AroundMe: impossibile salvare la ricerca", error);
    }
  }

  function loadStoredState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.location || !Array.isArray(data.results)) return null;
      return data;
    } catch (error) {
      console.warn("AroundMe: dati salvati non leggibili", error);
      return null;
    }
  }

  function isSameSearch(cached) {
    return (
      cached?.location &&
      Math.abs(Number(cached.location.lat) - Number(state.location.lat)) < 0.00001 &&
      Math.abs(Number(cached.location.lon) - Number(state.location.lon)) < 0.00001 &&
      Number(cached.radius) === Number(state.radius) &&
      cached.category === state.category
    );
  }

  function restoreLastSearch() {
    const cached = loadStoredState();
    if (!cached) return false;

    setLocation(cached.location);
    selectRadius(cached.radius);
    selectCategory(cached.category);
    state.results = cached.results;
    state.savedAt = cached.savedAt;
    renderResults(true);

    if (navigator.onLine) {
      fetchAroundMe();
    }

    return true;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activateSidebarLink() {
    const tryActivate = () => {
      const link = document.querySelector('.sidebar-link[href="/aroundme/"]');
      if (!link) return false;
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
      return true;
    };

    if (tryActivate()) return;

    const observer = new MutationObserver(() => {
      if (tryActivate()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/aroundme/sw.js", { scope: "/aroundme/" }).catch((error) => {
        console.warn("AroundMe: service worker non registrato", error);
      });
    });
  }

  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.isBusy) return;

    const query = els.searchInput.value.trim();
    if (query.length < 3) {
      showMessage("Scrivi almeno 3 caratteri, meglio se con città o provincia.", true);
      return;
    }
    searchPlace(query);
  });

  els.locateButton.addEventListener("click", () => {
    if (state.isBusy) return;
    useCurrentLocation();
  });

  els.categories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (state.isBusy || !button || button.disabled || !state.location) return;
    selectCategory(button.dataset.category);
    fetchAroundMe();
  });

  els.radii.addEventListener("click", (event) => {
    const button = event.target.closest("[data-radius]");
    if (state.isBusy || !button || button.disabled || !state.location) return;
    selectRadius(button.dataset.radius);
    fetchAroundMe();
  });

  els.mapClose.addEventListener("click", closeMap);

  window.addEventListener("online", () => {
    updateNetworkStatus();
    if (state.location) fetchAroundMe();
  });

  window.addEventListener("offline", () => {
    updateNetworkStatus();
    if (state.results.length) renderResults(true);
  });

  updateNetworkStatus();
  selectCategory(DEFAULT_CATEGORY);
  selectRadius(DEFAULT_RADIUS);
  enableControls(false);
  activateSidebarLink();
  restoreLastSearch();
  registerServiceWorker();
})();

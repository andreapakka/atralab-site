(() => {
  "use strict";

  const API_URL = "https://ukoaefhtvhqqdchjnzby.supabase.co/functions/v1/roma-alerts";
  const ALERT_CACHE_KEY = "atralab-romaalerts-last-v1";
  const GEOCODE_CACHE_KEY = "atralab-romaalerts-geocode-v1";
  const ALERT_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  const GEOCODE_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  const REFRESH_INTERVAL = 5 * 60 * 1000;
  const NOMINATIM_GAP = 1150;

  const SECTION_ORDER = ["now", "today", "tomorrow", "next7days", "later"];
  const SECTION_LABELS = {
    now: "Adesso",
    today: "Oggi",
    tomorrow: "Domani",
    next7days: "Prossimi 7 giorni",
    later: "Più avanti",
  };

  const CATEGORY_LABELS = {
    emergency: "Emergenza",
    demonstration: "Manifestazione",
    major_event: "Grande evento",
    rail_metro: "Metro / tram / ferrovia",
    service_disruption: "Servizio",
    strike: "Sciopero",
    detour: "Deviazione",
    other: "Avviso",
  };

  const LEVEL_LABELS = {
    critical: "Critico",
    warning: "Attenzione",
    info: "Informazione",
  };

  let currentData = null;
  let map = null;
  let markerLayer = null;
  let geocodeQueue = Promise.resolve();
  let lastNominatimAt = 0;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDateTime(value, options = {}) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "short",
      hour: options.dateOnly ? undefined : "2-digit",
      minute: options.dateOnly ? undefined : "2-digit",
      ...options,
    }).format(date);
  }

  function formatUpdated(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function formatEventTiming(event) {
    if (event.when === "now") {
      const end = formatDateTime(event.nextEnd || event.end);
      return end ? `In corso · fino alle ${end.split(", ").pop()}` : "In corso";
    }

    if (event.eventDates?.length) {
      if (event.eventDates.length === 1) {
        const date = new Date(`${event.eventDates[0]}T12:00:00Z`);
        return new Intl.DateTimeFormat("it-IT", {
          timeZone: "Europe/Rome",
          weekday: "short",
          day: "2-digit",
          month: "short",
        }).format(date);
      }

      const first = new Date(`${event.eventDates[0]}T12:00:00Z`);
      const last = new Date(`${event.eventDates[event.eventDates.length - 1]}T12:00:00Z`);
      const fmt = new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "short",
      });
      return `${fmt.format(first)} – ${fmt.format(last)}`;
    }

    const start = event.nextStart || event.start;
    const end = event.nextEnd || event.end;

    if (start && end) {
      const startText = formatDateTime(start);
      const endText = formatDateTime(end);
      return startText === endText ? startText : `${startText} → ${endText}`;
    }

    return start ? formatDateTime(start) : "Orario non specificato";
  }

  function routeHtml(routes) {
    if (!Array.isArray(routes) || !routes.length) return "";
    return `
      <div class="romaalerts-route-list" aria-label="Linee coinvolte">
        ${routes.map((route) => `<span class="romaalerts-route">${escapeHtml(route)}</span>`).join("")}
      </div>
    `;
  }

  function cardHtml(event, index) {
    const title = escapeHtml(event.title || "Avviso Roma Mobilità");
    const description = escapeHtml(event.description || "Dettagli non disponibili.");
    const category = CATEGORY_LABELS[event.category] || CATEGORY_LABELS.other;
    const level = LEVEL_LABELS[event.level] || LEVEL_LABELS.info;
    const timing = escapeHtml(formatEventTiming(event));
    const source = Array.isArray(event.sources) ? event.sources.join(" + ").toUpperCase() : "ROMA MOBILITÀ";
    const detailsId = `romaalerts-details-${index}`;

    const sourceLink = event.url
      ? `<a class="romaalerts-source-link" href="${escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer">Fonte Roma Mobilità ↗</a>`
      : "";

    return `
      <article class="romaalerts-card" data-level="${escapeHtml(event.level || "info")}" data-event-id="${escapeHtml(event.id || String(index))}">
        <div class="romaalerts-card-main">
          <div class="romaalerts-card-topline">
            <span class="romaalerts-badge romaalerts-badge-level" data-level="${escapeHtml(event.level || "info")}">${escapeHtml(level)}</span>
            <span class="romaalerts-badge">${escapeHtml(category)}</span>
          </div>

          <h3>${title}</h3>

          <div class="romaalerts-card-meta">
            <span><strong>Quando:</strong> ${timing}</span>
            <span><strong>Fonte:</strong> ${escapeHtml(source)}</span>
          </div>

          ${routeHtml(event.routes)}

          <p class="romaalerts-card-preview">${description}</p>

          <div class="romaalerts-card-actions">
            <details class="romaalerts-details" id="${detailsId}">
              <summary>Dettagli</summary>
              <div class="romaalerts-details-body">${description}</div>
            </details>
            ${sourceLink}
            <a class="romaalerts-map-link" href="#romaalerts-map" data-map-event="${escapeHtml(event.id || String(index))}" hidden>Mostra sulla mappa</a>
          </div>
        </div>
      </article>
    `;
  }

  function normalizeWhen(value) {
    if (SECTION_ORDER.includes(value)) return value;
    if (value === "recent") return "today";
    return "later";
  }

  function renderSections(events) {
    const container = $("romaalerts-sections");
    if (!container) return;

    const grouped = Object.fromEntries(SECTION_ORDER.map((key) => [key, []]));

    events.forEach((event) => {
      grouped[normalizeWhen(event.when)].push(event);
    });

    const sections = SECTION_ORDER
      .filter((key) => grouped[key].length)
      .map((key) => {
        const cards = grouped[key]
          .map((event, index) => cardHtml(event, `${key}-${index}`))
          .join("");

        return `
          <section class="romaalerts-time-section" data-when="${key}">
            <div class="romaalerts-time-head">
              <h2 class="romaalerts-time-title">${SECTION_LABELS[key]}</h2>
              <span class="romaalerts-time-count">${grouped[key].length} ${grouped[key].length === 1 ? "segnalazione" : "segnalazioni"}</span>
            </div>
            <div class="romaalerts-cards">${cards}</div>
          </section>
        `;
      })
      .join("");

    container.innerHTML = sections || `
      <div class="romaalerts-empty">
        Nessuna criticità rilevante segnalata in questo momento.
      </div>
    `;
  }

  function renderSummary(events) {
    const counts = { now: 0, today: 0, tomorrow: 0, week: 0 };

    events.forEach((event) => {
      const when = normalizeWhen(event.when);
      if (when === "now") counts.now++;
      else if (when === "today") counts.today++;
      else if (when === "tomorrow") counts.tomorrow++;
      else if (when === "next7days") counts.week++;
    });

    $("summary-now").textContent = counts.now;
    $("summary-today").textContent = counts.today;
    $("summary-tomorrow").textContent = counts.tomorrow;
    $("summary-week").textContent = counts.week;
  }

  function renderMeta(data, cached = false) {
    $("romaalerts-updated").textContent = `${formatUpdated(data.checkedAt || data.feedTimestamp)}${cached ? " · dati salvati" : ""}`;

    const gtfs = data.sourceStatus?.gtfs === "ok" ? "GTFS ok" : "GTFS non disponibile";
    const rss = data.sourceStatus?.rss === "ok" ? "Infomobilità ok" : "Infomobilità non disponibile";
    $("romaalerts-source-status").textContent = `${gtfs} · ${rss}`;
  }

  function saveAlertCache(data) {
    try {
      localStorage.setItem(
        ALERT_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), data })
      );
    } catch (error) {
      console.warn("RomaAlerts: cache alert non salvata", error);
    }
  }

  function readAlertCache() {
    try {
      const raw = localStorage.getItem(ALERT_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.savedAt || !parsed?.data) return null;
      if (Date.now() - parsed.savedAt > ALERT_CACHE_MAX_AGE) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  async function fetchAlerts() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(API_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data?.ok || !Array.isArray(data.events)) {
        throw new Error("Risposta non valida");
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function setBusy(isBusy) {
    const button = $("romaalerts-refresh");
    if (button) {
      button.disabled = isBusy;
      button.textContent = isBusy ? "Aggiorno…" : "Aggiorna";
    }
    const feed = document.querySelector(".romaalerts-feed");
    if (feed) feed.setAttribute("aria-busy", String(isBusy));
  }

  async function loadAlerts({ manual = false } = {}) {
    setBusy(true);
    const loading = $("romaalerts-loading");
    const errorBox = $("romaalerts-error");
    if (manual && loading) loading.hidden = false;
    if (errorBox) errorBox.hidden = true;

    try {
      const data = await fetchAlerts();
      currentData = data;
      saveAlertCache(data);
      renderData(data, false);
    } catch (error) {
      console.error("RomaAlerts: errore caricamento", error);

      const cached = readAlertCache();
      if (cached) {
        currentData = cached;
        renderData(cached, true);
      } else {
        if (loading) loading.hidden = true;
        if (errorBox) {
          errorBox.hidden = false;
          $("romaalerts-error-text").textContent =
            error?.name === "AbortError"
              ? "La richiesta ha impiegato troppo tempo. Riprova tra poco."
              : "Impossibile raggiungere il servizio Roma Alerts. Riprova tra poco.";
        }
        resetMap("Mappa non disponibile senza dati.");
      }
    } finally {
      setBusy(false);
    }
  }

  function renderData(data, cached) {
    const loading = $("romaalerts-loading");
    if (loading) loading.hidden = true;

    const events = Array.isArray(data.events) ? data.events : [];
    renderSummary(events);
    renderSections(events);
    renderMeta(data, cached);
    bindMapLinks();
    updateMap(events);
  }

  function ensureMap() {
    if (map || !window.L || !$("romaalerts-map")) return map;

    map = L.map("romaalerts-map", {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([41.9028, 12.4964], 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    return map;
  }

  function resetMap(message = "Nessun punto localizzabile.") {
    ensureMap();
    if (markerLayer) markerLayer.clearLayers();
    if (map) map.setView([41.9028, 12.4964], 11);
    const status = $("romaalerts-map-status");
    if (status) status.textContent = message;
    hideAllMapLinks();
  }

  function readGeocodeCache() {
    try {
      const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeGeocodeCache(cache) {
    try {
      localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn("RomaAlerts: cache geocoding non salvata", error);
    }
  }

  function cleanPlaceCandidate(value) {
    return String(value || "")
      .replace(/\b(?:alt\.?|altezza)\b.*$/i, "")
      .replace(/\b(?:dx|sx)\b.*$/i, "")
      .replace(/\b(?:direzione|proveniente|provenienti|normale percorso|normale itinerario)\b.*$/i, "")
      .replace(/\s+/g, " ")
      .replace(/[,:;.-]+$/g, "")
      .trim();
  }

  function normalizeRomeAbbreviations(value) {
    return String(value || "")
      .replace(/\bP\.\s*le\b/gi, "Piazzale")
      .replace(/\bP\.\s*za\b/gi, "Piazza")
      .replace(/\bV\.\s*le\b/gi, "Viale")
      .replace(/\bL\.\s*go\b/gi, "Largo")
      .replace(/\bVia C\. Colombo\b/gi, "Via Cristoforo Colombo")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractStreet(text) {
    if (!text) return null;
    const expanded = normalizeRomeAbbreviations(text);

    const inStreet = expanded.match(
      /\b(?:in|su|presso|da|tra)\s+((?:via|viale|piazza|piazzale|largo|corso|lungotevere|ponte|porta)\s+[^,;:\n]{2,72})/i
    );
    if (inStreet?.[1]) return cleanPlaceCandidate(inStreet[1]);

    const street = expanded.match(
      /\b((?:via|viale|piazza|piazzale|largo|corso|lungotevere|ponte|porta)\s+[^,;:\n]{2,72})/i
    );
    if (street?.[1]) return cleanPlaceCandidate(street[1]);

    return null;
  }

  function buildGeocodeCandidates(event) {
    const candidates = [];
    const title = normalizeRomeAbbreviations(event.title || "");
    const description = normalizeRomeAbbreviations(event.description || "");

    const titleStreet = extractStreet(title);
    if (titleStreet) candidates.push(titleStreet);

    const corteoArea = title.match(/\bcorteo\s+a\s+(.+)$/i);
    if (corteoArea?.[1]) candidates.push(cleanPlaceCandidate(corteoArea[1]));

    const titleArea = title.match(/\b(?:manifestazione|evento)\s+(?:a|in)\s+(.+)$/i);
    if (titleArea?.[1]) candidates.push(cleanPlaceCandidate(titleArea[1]));

    const descriptionStreet = extractStreet(description);
    if (descriptionStreet) candidates.push(descriptionStreet);

    if (/world triathlon/i.test(title) && /viale america|viale europa|cristoforo colombo/i.test(description)) {
      candidates.unshift("Viale America, EUR");
    }

    if (/\b3l\b/i.test(title) && /porta maggiore/i.test(description)) {
      candidates.unshift("Porta Maggiore");
    }

    return [...new Set(candidates.filter(Boolean))]
      .map((candidate) => `${candidate}, Roma`)
      .slice(0, 3);
  }

  function queueGeocode(task) {
    const run = geocodeQueue
      .catch(() => undefined)
      .then(async () => {
        const wait = Math.max(0, NOMINATIM_GAP - (Date.now() - lastNominatimAt));
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          return await task();
        } finally {
          lastNominatimAt = Date.now();
        }
      });

    geocodeQueue = run.catch(() => undefined);
    return run;
  }

  async function geocodeQuery(query) {
    const cache = readGeocodeCache();
    const cached = cache[query];

    if (cached && Date.now() - cached.savedAt < GEOCODE_CACHE_MAX_AGE) {
      return cached.result || null;
    }

    const result = await queueGeocode(async () => {
      const params = new URLSearchParams({
        format: "jsonv2",
        q: query,
        limit: "4",
        addressdetails: "1",
        "accept-language": "it",
        countrycodes: "it",
        viewbox: "12.10,42.15,12.85,41.55",
        bounded: "1",
      });

      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
      const items = await response.json();
      if (!Array.isArray(items) || !items.length) return null;

      const rome = items.find((item) => {
        const address = item.address || {};
        const haystack = [
          address.city,
          address.town,
          address.municipality,
          address.county,
          item.display_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes("roma") || haystack.includes("rome");
      }) || items[0];

      const lat = Number(rome.lat);
      const lon = Number(rome.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      return {
        lat,
        lon,
        label: rome.display_name || query,
        query,
      };
    });

    cache[query] = { savedAt: Date.now(), result };
    writeGeocodeCache(cache);
    return result;
  }

  async function geocodeEvent(event) {
    const candidates = buildGeocodeCandidates(event);
    for (const query of candidates) {
      try {
        const result = await geocodeQuery(query);
        if (result) return result;
      } catch (error) {
        console.warn("RomaAlerts: geocoding fallito", query, error);
      }
    }
    return null;
  }

  function markerIcon(level) {
    return L.divIcon({
      className: "romaalerts-marker",
      html: `<div class="romaalerts-marker-dot" data-level="${escapeHtml(level || "info")}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -11],
    });
  }

  function popupHtml(event, location) {
    return `
      <div class="romaalerts-map-popup-title">${escapeHtml(event.title)}</div>
      <div class="romaalerts-map-popup-place">${escapeHtml(location.query)}</div>
      <div class="romaalerts-map-popup-note">Posizione indicativa ricavata dal testo dell'avviso.</div>
    `;
  }

  function showMapLink(eventId) {
    const link = document.querySelector(`[data-map-event="${CSS.escape(String(eventId))}"]`);
    if (link) link.hidden = false;
  }

  function hideAllMapLinks() {
    document.querySelectorAll("[data-map-event]").forEach((link) => {
      link.hidden = true;
    });
  }

  async function updateMap(events) {
    ensureMap();
    if (!markerLayer || !map) return;

    markerLayer.clearLayers();
    hideAllMapLinks();

    const status = $("romaalerts-map-status");
    if (!events.length) {
      resetMap("Nessun alert da localizzare.");
      return;
    }

    if (status) status.textContent = "Localizzazione degli avvisi…";

    const located = [];

    for (const event of events) {
      const location = await geocodeEvent(event);
      if (!location) continue;

      event.__mapLocation = location;
      const marker = L.marker([location.lat, location.lon], {
        icon: markerIcon(event.level),
        title: event.title,
      }).bindPopup(popupHtml(event, location));

      marker.__romaAlertId = event.id;
      markerLayer.addLayer(marker);
      located.push({ event, location, marker });
      showMapLink(event.id);
    }

    if (!located.length) {
      map.setView([41.9028, 12.4964], 11);
      if (status) status.textContent = "Nessun alert localizzato con sufficiente affidabilità.";
      return;
    }

    const bounds = L.latLngBounds(
      located.map(({ location }) => [location.lat, location.lon])
    );

    if (located.length === 1) {
      map.setView(bounds.getCenter(), 14);
    } else {
      map.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
    }

    if (status) {
      status.textContent = `${located.length} ${located.length === 1 ? "alert localizzato" : "alert localizzati"} su ${events.length}`;
    }
  }

  function bindMapLinks() {
    document.querySelectorAll("[data-map-event]").forEach((link) => {
      link.addEventListener("click", (event) => {
        const eventId = event.currentTarget.getAttribute("data-map-event");
        if (!currentData || !markerLayer || !eventId) return;

        const target = currentData.events.find((item) => String(item.id) === String(eventId));
        if (!target?.__mapLocation) return;

        setTimeout(() => {
          map?.setView([target.__mapLocation.lat, target.__mapLocation.lon], 15, { animate: true });
          markerLayer.eachLayer((marker) => {
            if (String(marker.__romaAlertId) === String(eventId)) {
              marker.openPopup();
            }
          });
        }, 120);
      });
    });
  }

  function activateSidebarLink() {
    const apply = () => {
      const links = document.querySelectorAll('a[href="/romaalerts/"], a[href="/romaalerts"]');
      links.forEach((link) => {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      });
      return links.length > 0;
    };

    if (apply()) return;

    const observer = new MutationObserver(() => {
      if (apply()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 8000);
  }

  function setupEvents() {
    $("romaalerts-refresh")?.addEventListener("click", () => loadAlerts({ manual: true }));

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && currentData) {
        const checkedAt = new Date(currentData.checkedAt || 0).getTime();
        if (Date.now() - checkedAt > REFRESH_INTERVAL) {
          loadAlerts();
        }
      }
    });
  }

  function init() {
    ensureMap();
    activateSidebarLink();
    setupEvents();
    loadAlerts();
    setInterval(() => loadAlerts(), REFRESH_INTERVAL);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

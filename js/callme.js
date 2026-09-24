(() => {
  "use strict";

  const SEND_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co/functions/v1/callme-send";
  const GET_REQUEST_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co/functions/v1/callme-get-request";

  const PENDING_KEY = "atralab-callme-pending-v1";
  const LAST_RECEIVED_KEY = "atralab-callme-last-received-v1";
  const LOCATION_MAX_AGE_MS = 60_000;

  const state = {
    digits: "",
    sending: false,
    locked: false,
    geoPermission: "unknown",
    location: null,
    locationAt: 0
  };

  const el = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindCommonEvents();
    activateSidebarLink();

    registerServiceWorker().catch((error) => {
      console.error("CallMe: Service Worker non disponibile", error);
    });

    const token = new URLSearchParams(location.search).get("r");

    // Una richiesta accodata viene ritentata anche quando CallMe viene aperto da una notifica.
    flushPendingRequest().catch(() => {});

    if (token) {
      await openRequest(token);
      return;
    }

    showSenderView();
    renderLastReceived();
    await checkLocationPermission();
  }

  function cacheElements() {
    el.senderView = document.getElementById("senderView");
    el.requestView = document.getElementById("requestView");
    el.locationTitle = document.getElementById("locationTitle");
    el.locationStatus = document.getElementById("locationStatus");
    el.enableLocationButton = document.getElementById("enableLocationButton");
    el.codeDots = document.getElementById("codeDots");
    el.keypad = document.getElementById("keypad");
    el.sendStatus = document.getElementById("sendStatus");
    el.lastReceived = document.getElementById("lastReceived");
    el.lastReceivedText = document.getElementById("lastReceivedText");
    el.lastReceivedLink = document.getElementById("lastReceivedLink");
    el.requestSender = document.getElementById("requestSender");
    el.requestTime = document.getElementById("requestTime");
    el.mapButton = document.getElementById("mapButton");
    el.requestLocationMissing = document.getElementById("requestLocationMissing");
    el.requestStatus = document.getElementById("requestStatus");
  }

  function bindCommonEvents() {
    el.keypad.addEventListener("click", onKeypadClick);
    el.enableLocationButton.addEventListener("click", () => refreshLocation(true));

    window.addEventListener("online", () => {
      flushPendingRequest().catch(() => {});
    });
  }

  function showSenderView() {
    el.senderView.hidden = false;
    el.requestView.hidden = true;
  }

  function showRequestView() {
    el.senderView.hidden = true;
    el.requestView.hidden = false;
  }

  function onKeypadClick(event) {
    const button = event.target.closest("button[data-digit]");
    if (!button || state.sending || state.locked) return;

    const digit = button.dataset.digit;
    if (!/^[1-9]$/.test(digit)) return;

    state.digits += digit;
    renderDots();

    if (
      state.geoPermission === "granted" &&
      (!state.locationAt || Date.now() - state.locationAt > LOCATION_MAX_AGE_MS)
    ) {
      refreshLocation(false).catch(() => {});
    }

    if (state.digits.length === 3) {
      submitCurrentCode();
    }
  }

  function renderDots() {
    const dots = el.codeDots.querySelectorAll("span");
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-filled", index < state.digits.length);
    });
    el.codeDots.setAttribute("aria-label", `${state.digits.length} cifre inserite`);
  }

  function resetCode() {
    state.digits = "";
    state.sending = false;
    state.locked = false;
    el.keypad.classList.remove("is-disabled");
    renderDots();
  }

  async function submitCurrentCode() {
    if (state.digits.length !== 3 || state.sending) return;

    state.sending = true;
    el.keypad.classList.add("is-disabled");
    setSendStatus(navigator.onLine ? "Invio richiesta…" : "Nessuna connessione: richiesta in attesa…");

    const payload = {
      code: state.digits,
      lat: state.location?.lat ?? null,
      lon: state.location?.lon ?? null,
      queuedAt: new Date().toISOString()
    };

    if (!navigator.onLine) {
      queueRequest(payload);
      showQueuedState();
      return;
    }

    await sendPayload(payload, false);
  }

  async function sendPayload(payload, fromQueue) {
    try {
      const requestBody = { code: payload.code };

      if (Number.isFinite(payload.lat) && Number.isFinite(payload.lon)) {
        requestBody.lat = payload.lat;
        requestBody.lon = payload.lon;
      }

      const response = await fetch(SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Risposta non valida (${response.status})`);
      }

      if (!response.ok || !data?.ok) {
        if (response.status === 400 || response.status === 401) {
          if (fromQueue) localStorage.removeItem(PENDING_KEY);
          showInvalidCode();
          return;
        }
        throw new Error(data?.error || `Errore HTTP ${response.status}`);
      }

      localStorage.removeItem(PENDING_KEY);
      showSuccess(data.location === true);
    } catch (error) {
      console.error("CallMe: invio fallito", error);
      queueRequest(payload);
      showQueuedState();
    }
  }

  function showInvalidCode() {
    state.sending = false;
    el.keypad.classList.remove("is-disabled");
    setSendStatus("Codice non riconosciuto.", "error");

    window.setTimeout(() => {
      resetCode();
      setSendStatus("");
    }, 1100);
  }

  function showSuccess(withLocation) {
    state.locked = true;
    state.sending = false;
    el.keypad.classList.add("is-disabled");
    setSendStatus(
      withLocation ? "Richiesta inviata con posizione." : "Richiesta inviata.",
      "success"
    );
  }

  function showQueuedState() {
    state.locked = true;
    state.sending = false;
    el.keypad.classList.add("is-disabled");
    setSendStatus(
      "Richiesta in attesa di rete. Verrà ritentata quando torni online o riapri CallMe."
    );
  }

  function setSendStatus(message, type = "") {
    el.sendStatus.textContent = message;
    el.sendStatus.classList.toggle("is-error", type === "error");
    el.sendStatus.classList.toggle("is-success", type === "success");
  }

  function queueRequest(payload) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("CallMe: impossibile salvare richiesta in coda", error);
    }
  }

  async function flushPendingRequest() {
    if (!navigator.onLine || state.sending) return;

    let payload = null;
    try {
      payload = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    } catch {
      localStorage.removeItem(PENDING_KEY);
      return;
    }

    if (!payload?.code) return;

    state.sending = true;
    state.locked = true;
    el.keypad?.classList.add("is-disabled");
    if (el.sendStatus) setSendStatus("Invio richiesta rimasta in attesa…");

    await sendPayload(payload, true);
  }

  async function checkLocationPermission() {
    if (!("geolocation" in navigator)) {
      showLocationUnavailable("Posizione non supportata. CallMe funziona comunque.");
      return;
    }

    if (!navigator.permissions?.query) {
      state.geoPermission = "prompt";
      inviteLocation();
      return;
    }

    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      state.geoPermission = permission.state;

      if (permission.state === "granted") {
        el.enableLocationButton.hidden = true;
        setLocationStatus("Posizione autorizzata. La preparo…");
        refreshLocation(false).catch(() => {});
      } else if (permission.state === "denied") {
        showLocationUnavailable("Posizione non autorizzata. CallMe funziona comunque.");
      } else {
        inviteLocation();
      }

      permission.addEventListener?.("change", () => {
        state.geoPermission = permission.state;
        if (permission.state === "granted") refreshLocation(false).catch(() => {});
        else if (permission.state === "denied") showLocationUnavailable("Posizione non autorizzata. CallMe funziona comunque.");
        else inviteLocation();
      });
    } catch {
      state.geoPermission = "prompt";
      inviteLocation();
    }
  }

  function inviteLocation() {
    setLocationStatus("Attivala per allegarla alla richiesta. CallMe funziona anche senza.");
    el.enableLocationButton.hidden = false;
  }

  async function refreshLocation(userInitiated) {
    if (!("geolocation" in navigator)) return;

    if (userInitiated) {
      setLocationStatus("Richiesta posizione…");
    }

    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          state.geoPermission = "granted";
          state.location = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          state.locationAt = Date.now();
          el.enableLocationButton.hidden = true;
          setLocationStatus("Posizione pronta.");
          resolve();
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            state.geoPermission = "denied";
            showLocationUnavailable("Posizione non autorizzata. CallMe funziona comunque.");
          } else {
            setLocationStatus("Posizione non disponibile. CallMe funziona comunque.");
            if (state.geoPermission !== "denied") el.enableLocationButton.hidden = false;
          }
          resolve();
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: LOCATION_MAX_AGE_MS
        }
      );
    });
  }

  function showLocationUnavailable(message) {
    setLocationStatus(message);
    el.enableLocationButton.hidden = true;
  }

  function setLocationStatus(message) {
    el.locationStatus.textContent = message;
  }

  async function openRequest(token) {
    showRequestView();

    if (!/^[a-f0-9]{32}$/.test(token)) {
      setRequestError("Richiesta non valida.");
      return;
    }

    setRequestStatus("Caricamento…");

    try {
      const response = await fetch(GET_REQUEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });

      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Richiesta non disponibile");
      }

      const request = {
        token,
        sender: String(data.sender || ""),
        createdAt: data.createdAt,
        lat: finiteOrNull(data.lat),
        lon: finiteOrNull(data.lon)
      };

      saveLastReceived(request);
      renderRequest(request, false);
    } catch (error) {
      console.error("CallMe: lettura richiesta fallita", error);

      const cached = readLastReceived();
      if (cached?.token === token) {
        renderRequest(cached, true);
        return;
      }

      setRequestError("Impossibile caricare questa richiesta.");
    }
  }

  function renderRequest(request, fromCache) {
    el.requestSender.textContent = request.sender || "—";
    el.requestTime.textContent = formatDateTime(request.createdAt);
    el.requestTime.dateTime = request.createdAt || "";

    const hasLocation = Number.isFinite(request.lat) && Number.isFinite(request.lon);

    if (hasLocation) {
      el.mapButton.href = buildMapUrl(request.lat, request.lon);
      el.mapButton.hidden = false;
      el.requestLocationMissing.hidden = true;
    } else {
      el.mapButton.hidden = true;
      el.requestLocationMissing.hidden = false;
    }

    setRequestStatus(fromCache ? "Dati salvati su questo telefono." : "");
  }

  function setRequestStatus(message) {
    el.requestStatus.textContent = message;
    el.requestStatus.classList.remove("is-error");
  }

  function setRequestError(message) {
    el.requestSender.textContent = "—";
    el.requestTime.textContent = "—";
    el.mapButton.hidden = true;
    el.requestLocationMissing.hidden = true;
    el.requestStatus.textContent = message;
    el.requestStatus.classList.add("is-error");
  }

  function buildMapUrl(lat, lon) {
    const coords = `${lat},${lon}`;

    if (isIOS()) {
      return `https://maps.apple.com/?q=Posizione&ll=${encodeURIComponent(coords)}`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`;
  }

  function saveLastReceived(request) {
    try {
      localStorage.setItem(LAST_RECEIVED_KEY, JSON.stringify(request));
    } catch (error) {
      console.error("CallMe: impossibile salvare ultima richiesta", error);
    }
  }

  function readLastReceived() {
    try {
      return JSON.parse(localStorage.getItem(LAST_RECEIVED_KEY) || "null");
    } catch {
      return null;
    }
  }

  function renderLastReceived() {
    const request = readLastReceived();
    if (!request?.token || !request?.sender || !request?.createdAt) return;

    el.lastReceivedText.textContent = `${request.sender} · ${formatShortTime(request.createdAt)}`;
    el.lastReceivedLink.href = `/callme/?r=${encodeURIComponent(request.token)}`;
    el.lastReceived.hidden = false;
  }

  function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatShortTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function finiteOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    await navigator.serviceWorker.register("/callme/sw.js", {
      scope: "/callme/"
    });
  }

  function activateSidebarLink() {
    const activate = () => {
      const link = document.querySelector('a[href="/callme/"]');
      if (!link) return false;
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
      return true;
    };

    if (activate()) return;

    const observer = new MutationObserver(() => {
      if (activate()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
})();

(() => {
  "use strict";

  const FUNCTION_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co/functions/v1/callme-register-device";

  const state = {
    pin: "",
    vapidPublicKey: "",
    registration: null
  };

  const el = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    el.loginPanel = document.getElementById("loginPanel");
    el.pinForm = document.getElementById("pinForm");
    el.adminPin = document.getElementById("adminPin");
    el.loginStatus = document.getElementById("loginStatus");
    el.setupPanel = document.getElementById("setupPanel");
    el.lockButton = document.getElementById("lockButton");
    el.iosInstallNotice = document.getElementById("iosInstallNotice");
    el.deviceName = document.getElementById("deviceName");
    el.registerButton = document.getElementById("registerButton");
    el.deviceStatus = document.getElementById("deviceStatus");
    el.refreshDevices = document.getElementById("refreshDevices");
    el.devicesList = document.getElementById("devicesList");

    el.deviceName.value = defaultDeviceName();

    el.pinForm.addEventListener("submit", unlockSetup);
    el.registerButton.addEventListener("click", registerThisDevice);
    el.refreshDevices.addEventListener("click", loadDevices);
    el.lockButton.addEventListener("click", lockSetup);

    updatePlatformHints();
    registerServiceWorker().catch((error) => {
      console.error("Setup: Service Worker non disponibile", error);
    });
  }

  async function unlockSetup(event) {
    event.preventDefault();

    const pin = el.adminPin.value.trim();
    if (!pin) return;

    setStatus(el.loginStatus, "Verifica…");
    setBusy(el.pinForm, true);

    try {
      const result = await callFunction("config", { pin });

      state.pin = pin;
      state.vapidPublicKey = result.vapidPublicKey || "";

      if (!state.vapidPublicKey) {
        throw new Error("Chiave VAPID pubblica non disponibile");
      }

      el.adminPin.value = "";
      el.loginPanel.hidden = true;
      el.setupPanel.hidden = false;
      setStatus(el.loginStatus, "");

      await registerServiceWorker();
      await updateCurrentDeviceStatus();
      await loadDevices();
    } catch (error) {
      console.error(error);
      setStatus(el.loginStatus, humanError(error), true);
    } finally {
      setBusy(el.pinForm, false);
    }
  }

  function lockSetup() {
    state.pin = "";
    state.vapidPublicKey = "";

    el.setupPanel.hidden = true;
    el.loginPanel.hidden = false;
    el.devicesList.innerHTML = '<p class="setup-muted">Nessun dato caricato.</p>';
    setStatus(el.deviceStatus, "");
    el.adminPin.focus();
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker non supportato");
    }

    if (state.registration) return state.registration;

    state.registration = await navigator.serviceWorker.register("/setup/sw.js", {
      scope: "/setup/"
    });

    await navigator.serviceWorker.ready;
    return state.registration;
  }

  async function registerThisDevice() {
    if (!state.pin || !state.vapidPublicKey) return;

    if (!supportsPush()) {
      setStatus(el.deviceStatus, "Questo browser non supporta le notifiche Web Push.", true);
      return;
    }

    if (isIOS() && !isStandalone()) {
      el.iosInstallNotice.hidden = false;
      setStatus(
        el.deviceStatus,
        "Su iPhone apri prima questa pagina dalla web app aggiunta alla schermata Home.",
        true
      );
      return;
    }

    const name = el.deviceName.value.trim();
    if (!name) {
      setStatus(el.deviceStatus, "Inserisci un nome per il dispositivo.", true);
      return;
    }

    el.registerButton.disabled = true;
    setStatus(el.deviceStatus, "Attivazione notifiche…");

    try {
      const registration = await registerServiceWorker();

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Permesso notifiche non concesso");
      }

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(state.vapidPublicKey)
        });
      }

      await callFunction("register", {
        pin: state.pin,
        name,
        subscription: subscription.toJSON()
      });

      setStatus(el.deviceStatus, "Dispositivo registrato correttamente.");
      await loadDevices();
    } catch (error) {
      console.error(error);
      setStatus(el.deviceStatus, humanError(error), true);
    } finally {
      el.registerButton.disabled = false;
    }
  }

  async function updateCurrentDeviceStatus() {
    updatePlatformHints();

    if (!supportsPush()) {
      setStatus(el.deviceStatus, "Web Push non supportato su questo browser.", true);
      return;
    }

    if (isIOS() && !isStandalone()) {
      el.iosInstallNotice.hidden = false;
      setStatus(el.deviceStatus, "Aggiungi Setup alla schermata Home per abilitare le notifiche su iPhone.");
      return;
    }

    try {
      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription && Notification.permission === "granted") {
        setStatus(el.deviceStatus, "Questo browser ha già una subscription push attiva.");
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function loadDevices() {
    if (!state.pin) return;

    el.refreshDevices.disabled = true;
    el.devicesList.innerHTML = '<p class="setup-muted">Caricamento…</p>';

    try {
      const result = await callFunction("list", { pin: state.pin });
      renderDevices(result.devices || []);
    } catch (error) {
      console.error(error);
      el.devicesList.innerHTML = `<p class="setup-error">${escapeHtml(humanError(error))}</p>`;
    } finally {
      el.refreshDevices.disabled = false;
    }
  }

  function renderDevices(devices) {
    if (!devices.length) {
      el.devicesList.innerHTML = '<p class="setup-muted">Nessun dispositivo registrato.</p>';
      return;
    }

    el.devicesList.innerHTML = "";

    for (const device of devices) {
      const row = document.createElement("div");
      row.className = "setup-device";

      const info = document.createElement("div");
      info.className = "setup-device-info";

      const name = document.createElement("strong");
      name.textContent = device.name;

      const meta = document.createElement("span");
      meta.textContent = device.active ? "Attivo" : "Disattivato";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "setup-remove-button";
      remove.textContent = "Rimuovi";
      remove.addEventListener("click", () => deleteDevice(device));

      info.append(name, meta);
      row.append(info, remove);
      el.devicesList.appendChild(row);
    }
  }

  async function deleteDevice(device) {
    if (!confirm(`Rimuovere “${device.name}” dai destinatari?`)) return;

    try {
      await callFunction("delete", {
        pin: state.pin,
        id: device.id
      });

      await loadDevices();
    } catch (error) {
      console.error(error);
      setStatus(el.deviceStatus, humanError(error), true);
    }
  }

  async function callFunction(action, payload = {}) {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, ...payload })
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Risposta non valida (${response.status})`);
    }

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `Errore HTTP ${response.status}`);
    }

    return data;
  }

  function supportsPush() {
    return (
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  function updatePlatformHints() {
    if (!el.iosInstallNotice) return;
    el.iosInstallNotice.hidden = !(isIOS() && !isStandalone());
  }

  function defaultDeviceName() {
    if (isIOS()) return "iPhone";
    if (/Android/i.test(navigator.userAgent)) return "Android";
    return "Questo dispositivo";
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  }

  function setBusy(form, busy) {
    form.querySelectorAll("input, button").forEach((control) => {
      control.disabled = busy;
    });
  }

  function setStatus(node, message, isError = false) {
    node.textContent = message;
    node.classList.toggle("is-error", Boolean(message && isError));
  }

  function humanError(error) {
    const message = error instanceof Error ? error.message : String(error || "Errore");

    if (message === "PIN non valido") return "PIN non valido.";
    if (message.includes("Failed to fetch")) return "Impossibile contattare Supabase.";
    if (message.includes("Permesso notifiche")) return "Notifiche non autorizzate su questo dispositivo.";

    return message;
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

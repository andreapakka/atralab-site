(() => {
  "use strict";

  const FORM_ENDPOINT = "https://formspree.io/f/mjykeayz";
  const ATTEMPT_COOLDOWN_MS = 15_000;
  const SUCCESS_COOLDOWN_MS = 60_000;
  const REQUEST_TIMEOUT_MS = 15_000;

  const STORAGE_LAST_ATTEMPT = "atralab-contact-last-attempt-v1";
  const STORAGE_LAST_SUCCESS = "atralab-contact-last-success-v1";

  const form = document.getElementById("contactForm");
  const submitButton = document.getElementById("contactSubmit");
  const status = document.getElementById("contactStatus");
  const message = document.getElementById("contactMessage");
  const counter = document.getElementById("messageCounter");

  if (!form || !submitButton || !status || !message || !counter) return;

  let isSubmitting = false;
  let cooldownTimer = null;

  function readTimestamp(key) {
    const value = Number.parseInt(localStorage.getItem(key) || "", 10);
    return Number.isFinite(value) ? value : 0;
  }

  function remainingCooldownMs() {
    const now = Date.now();
    const lastAttempt = readTimestamp(STORAGE_LAST_ATTEMPT);
    const lastSuccess = readTimestamp(STORAGE_LAST_SUCCESS);

    const attemptRemaining =
      lastAttempt > 0 ? ATTEMPT_COOLDOWN_MS - (now - lastAttempt) : 0;

    const successRemaining =
      lastSuccess > 0 ? SUCCESS_COOLDOWN_MS - (now - lastSuccess) : 0;

    return Math.max(0, attemptRemaining, successRemaining);
  }

  function setStatus(text, type = "") {
    status.textContent = text;
    status.classList.remove("is-success", "is-error");

    if (type) {
      status.classList.add(`is-${type}`);
    }
  }

  function updateCounter() {
    counter.textContent = `${message.value.length} / 3000`;
  }

  function updateSubmitState() {
    if (isSubmitting) {
      submitButton.disabled = true;
      submitButton.textContent = "Invio in corso…";
      return;
    }

    const remaining = remainingCooldownMs();

    if (remaining > 0) {
      submitButton.disabled = true;
      submitButton.textContent = `Riprova tra ${Math.ceil(remaining / 1000)}s`;
      return;
    }

    submitButton.disabled = false;
    submitButton.textContent = "Invia messaggio";
  }

  function startCooldownTicker() {
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
    }

    updateSubmitState();

    cooldownTimer = window.setInterval(() => {
      updateSubmitState();

      if (!isSubmitting && remainingCooldownMs() <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }, 500);
  }

  function normalizeFormValues() {
    const fields = ["contactName", "contactEmail", "contactSubject", "contactMessage"];

    fields.forEach((id) => {
      const field = document.getElementById(id);
      if (field) {
        field.value = field.value.trim();
      }
    });

    updateCounter();
  }

  message.addEventListener("input", updateCounter);
  updateCounter();
  startCooldownTicker();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    normalizeFormValues();

    if (!form.reportValidity()) {
      return;
    }

    const remaining = remainingCooldownMs();

    if (remaining > 0) {
      startCooldownTicker();
      return;
    }

    const honeypot = form.querySelector('[name="_gotcha"]');
    if (honeypot && honeypot.value.trim() !== "") {
      setStatus("Messaggio non inviato.", "error");
      return;
    }

    isSubmitting = true;
    localStorage.setItem(STORAGE_LAST_ATTEMPT, String(Date.now()));
    setStatus("");
    updateSubmitState();

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(FORM_ENDPOINT, {
        method: "POST",
        body: new FormData(form),
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("rate-limit");
        }

        throw new Error("request-failed");
      }

      localStorage.setItem(STORAGE_LAST_SUCCESS, String(Date.now()));

      form.reset();
      updateCounter();
      setStatus("Messaggio inviato. Grazie.", "success");
    } catch (error) {
      if (error?.name === "AbortError") {
        setStatus("Invio troppo lento. Controlla la connessione e riprova tra poco.", "error");
      } else if (error?.message === "rate-limit") {
        setStatus("Troppi tentativi ravvicinati. Riprova più tardi.", "error");
      } else {
        setStatus("Non è stato possibile inviare il messaggio. Riprova tra poco.", "error");
      }
    } finally {
      window.clearTimeout(timeoutId);
      isSubmitting = false;
      startCooldownTicker();
    }
  });
})();

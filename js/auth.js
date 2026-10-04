(() => {
  "use strict";

  const AUTH_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co";
  const AUTH_KEY = "sb_publishable_IRKqtPwpSGWd-YbnyvXqsg_DFKZSotn";
  const AUTH_STORAGE_KEY = "atralab-auth";
  const RETURN_URL_KEY = "atralab-return-url";
  const DEVICE_STORAGE_KEY = "atralab-device-id";
  const TURNSTILE_SITE_KEY = "0x4AAAAAAFNXuMibEqqJr4d4";

  const otpEmailForm = document.getElementById("otpEmailForm");
  const otpEmailInput = document.getElementById("otpEmail");
  const otpSendButton = document.getElementById("otpSendButton");
  const otpVerifySection = document.getElementById("otpVerifySection");
  const otpVerifyButton = document.getElementById("otpVerifyButton");
  const otpChangeEmailButton = document.getElementById("otpChangeEmailButton");
  const otpMessage = document.getElementById("otpMessage");
  const turnstileContainer = document.getElementById("otpTurnstile");
  const digitInputs = Array.from(document.querySelectorAll(".auth-digit"));

  const legacyToggle = document.getElementById("legacyToggle");
  const legacyLogin = document.getElementById("legacyLogin");
  const legacyForm = document.getElementById("legacyAuthForm");
  const usernameInput = document.getElementById("authUsername");
  const passwordInput = document.getElementById("authPassword");
  const legacySubmit = document.getElementById("legacyAuthSubmit");
  const legacyMessage = document.getElementById("legacyAuthMessage");
  const passwordToggle = document.querySelector("[data-password-toggle]");

  let supabaseClient = null;
  let currentEmail = "";
  let turnstileWidgetId = null;
  let captchaToken = "";

  function setOtpMessage(text, type = "") {
    if (!otpMessage) return;
    otpMessage.textContent = text || "";
    otpMessage.classList.toggle("is-success", type === "success");
  }

  function setLegacyMessage(text) {
    if (legacyMessage) legacyMessage.textContent = text || "";
  }

  function getSafeReturnUrl() {
    let returnUrl = "/";

    try {
      const savedReturnUrl = localStorage.getItem(RETURN_URL_KEY);

      if (
        savedReturnUrl &&
        savedReturnUrl.startsWith("/") &&
        !savedReturnUrl.startsWith("//") &&
        !savedReturnUrl.startsWith("/auth")
      ) {
        returnUrl = savedReturnUrl;
      }
    } catch (error) {
      console.warn("ATRALAB return URL:", error);
    }

    return returnUrl;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeUsername() {
    if (!usernameInput) return "";
    const value = usernameInput.value.toLowerCase();
    if (usernameInput.value !== value) usernameInput.value = value;
    return value.trim();
  }

  usernameInput?.addEventListener("input", normalizeUsername);

  legacyToggle?.addEventListener("click", () => {
    const willOpen = legacyLogin?.hidden !== false;
    if (legacyLogin) legacyLogin.hidden = !willOpen;
    legacyToggle.setAttribute("aria-expanded", String(willOpen));

    if (willOpen) {
      usernameInput?.focus();
    }
  });

  if (passwordToggle && passwordInput) {
    passwordToggle.type = "button";
    passwordToggle.addEventListener("click", () => {
      const show = passwordInput.type === "password";
      passwordInput.type = show ? "text" : "password";
      passwordToggle.setAttribute("aria-pressed", String(show));
      passwordToggle.setAttribute(
        "aria-label",
        show ? "Nascondi password" : "Mostra password"
      );
    });
  }

  function resetTurnstile() {
    captchaToken = "";
    if (otpSendButton) otpSendButton.disabled = true;

    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function initTurnstile() {
    if (!turnstileContainer || !window.turnstile) {
      window.setTimeout(initTurnstile, 100);
      return;
    }

    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      size: "flexible",
      callback(token) {
        captchaToken = token;
        if (otpSendButton) otpSendButton.disabled = false;
        setOtpMessage("");
      },
      "expired-callback"() {
        captchaToken = "";
        if (otpSendButton) otpSendButton.disabled = true;
        setOtpMessage("Verifica anti-bot scaduta. Attendi il nuovo controllo.");
      },
      "error-callback"() {
        captchaToken = "";
        if (otpSendButton) otpSendButton.disabled = true;
        setOtpMessage("Verifica anti-bot non disponibile. Ricarica la pagina.");
      },
    });
  }

  function getDeviceId() {
    try {
      let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);

      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
      }

      return deviceId;
    } catch (error) {
      console.warn("ATRALAB OTP device id:", error);
      return crypto.randomUUID();
    }
  }

  function getDeviceInfo() {
    return {
      device_id: getDeviceId(),
      user_agent: navigator.userAgent || null,
      platform: navigator.userAgentData?.platform || navigator.platform || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      screen_width: window.screen?.width || null,
      screen_height: window.screen?.height || null,
    };
  }

  async function logAuth(action, email, accessToken = "") {
    const headers = {
      "Content-Type": "application/json",
      "apikey": AUTH_KEY,
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${AUTH_URL}/functions/v1/auth-log`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action,
        email,
        ...getDeviceInfo(),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `auth-log ${response.status}`);
    }
  }

  function clearOtpInputs() {
    digitInputs.forEach((input) => {
      input.value = "";
    });
  }

  function getOtpCode() {
    return digitInputs.map((input) => input.value).join("");
  }

  function showVerifyStep(email) {
    currentEmail = email;
    if (otpEmailInput) otpEmailInput.disabled = true;
    if (otpSendButton) otpSendButton.disabled = true;
    if (otpVerifySection) otpVerifySection.hidden = false;
    clearOtpInputs();
    digitInputs[0]?.focus();
  }

  function resetToEmailStep() {
    currentEmail = "";
    clearOtpInputs();

    digitInputs.forEach((input) => {
      input.disabled = false;
    });

    if (otpVerifySection) otpVerifySection.hidden = true;
    if (otpEmailInput) {
      otpEmailInput.disabled = false;
      otpEmailInput.focus();
    }

    if (otpVerifyButton) otpVerifyButton.disabled = false;
    if (otpChangeEmailButton) otpChangeEmailButton.disabled = false;

    setOtpMessage("");
    resetTurnstile();
  }

  digitInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      const digit = input.value.replace(/\D/g, "").slice(-1);
      input.value = digit;

      if (digit && index < digitInputs.length - 1) {
        digitInputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        digitInputs[index - 1].focus();
      }

      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        digitInputs[index - 1].focus();
      }

      if (event.key === "ArrowRight" && index < digitInputs.length - 1) {
        event.preventDefault();
        digitInputs[index + 1].focus();
      }

      if (event.key === "Enter") {
        event.preventDefault();
        otpVerifyButton?.click();
      }
    });

    input.addEventListener("paste", (event) => {
      const pasted =
        event.clipboardData?.getData("text")?.replace(/\D/g, "").slice(0, 6) || "";

      if (!pasted) return;

      event.preventDefault();
      clearOtpInputs();

      pasted.split("").forEach((digit, pastedIndex) => {
        if (digitInputs[pastedIndex]) {
          digitInputs[pastedIndex].value = digit;
        }
      });

      const focusIndex = Math.min(pasted.length, digitInputs.length) - 1;
      digitInputs[Math.max(focusIndex, 0)]?.focus();
    });
  });

  if (window.supabase?.createClient) {
    supabaseClient = window.supabase.createClient(AUTH_URL, AUTH_KEY);
    initTurnstile();
  } else {
    setOtpMessage("Accesso con codice non disponibile. Puoi usare username e password.");
    if (legacyLogin) legacyLogin.hidden = false;
    legacyToggle?.setAttribute("aria-expanded", "true");
  }

  otpEmailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      setOtpMessage("Accesso con codice non disponibile. Ricarica la pagina.");
      return;
    }

    const email = normalizeEmail(otpEmailInput?.value);

    if (!email || !otpEmailInput?.checkValidity()) {
      setOtpMessage("Inserisci un indirizzo email valido.");
      otpEmailInput?.focus();
      return;
    }

    if (!captchaToken) {
      setOtpMessage("Completa la verifica anti-bot prima di richiedere il codice.");
      return;
    }

    if (otpSendButton) otpSendButton.disabled = true;
    setOtpMessage("Invio del codice in corso…");

    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          captchaToken,
        },
      });

      if (error) throw error;

      await logAuth("requested", email);
      captchaToken = "";
      showVerifyStep(email);
      setOtpMessage(`Codice inviato a ${email}.`, "success");
    } catch (error) {
      console.error("ATRALAB OTP request:", error);
      resetTurnstile();
      setOtpMessage("Non è stato possibile inviare il codice. Riprova.");
    }
  });

  otpVerifyButton?.addEventListener("click", async () => {
    if (!supabaseClient) return;

    const token = getOtpCode();

    if (!/^\d{6}$/.test(token)) {
      setOtpMessage("Inserisci tutte le 6 cifre del codice.");
      return;
    }

    otpVerifyButton.disabled = true;
    if (otpChangeEmailButton) otpChangeEmailButton.disabled = true;
    setOtpMessage("Verifica del codice in corso…");

    try {
      const { data, error } = await supabaseClient.auth.verifyOtp({
        email: currentEmail,
        token,
        type: "email",
      });

      if (error) throw error;

      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new Error("Sessione Supabase non creata");
      }

      await logAuth("verified", currentEmail, accessToken);

      digitInputs.forEach((input) => {
        input.disabled = true;
      });

      otpVerifyButton.disabled = true;
      if (otpChangeEmailButton) otpChangeEmailButton.disabled = false;

      setOtpMessage(
        "Accesso OTP riuscito. La sessione è stata creata; l’integrazione con le pagine protette verrà attivata nel prossimo passo.",
        "success"
      );
    } catch (error) {
      console.error("ATRALAB OTP verify:", error);
      otpVerifyButton.disabled = false;
      if (otpChangeEmailButton) otpChangeEmailButton.disabled = false;
      setOtpMessage("Codice non valido o scaduto. Controlla e riprova.");
    }
  });

  otpChangeEmailButton?.addEventListener("click", async () => {
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (error) {
        console.warn("ATRALAB OTP signOut:", error);
      }
    }

    resetToEmailStep();
  });

  legacyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = normalizeUsername();
    const password = passwordInput?.value ?? "";

    if (!username || !password) {
      setLegacyMessage("Inserisci username e password.");
      return;
    }

    if (legacySubmit) legacySubmit.disabled = true;
    setLegacyMessage("");

    try {
      const response = await fetch(
        `${AUTH_URL}/rest/v1/rpc/login_atralab_user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": AUTH_KEY,
          },
          body: JSON.stringify({
            p_username: username,
            p_password: password,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Login fallito (${response.status})`);
      }

      const token = await response.json();

      if (!token || typeof token !== "string") {
        setLegacyMessage("Username o password non corretti.");
        return;
      }

      localStorage.setItem(AUTH_STORAGE_KEY, token);

      const returnUrl = getSafeReturnUrl();
      localStorage.removeItem(RETURN_URL_KEY);
      window.location.replace(returnUrl);
    } catch (error) {
      console.error("ATRALAB login legacy:", error);
      setLegacyMessage("Accesso non disponibile. Riprova.");
    } finally {
      if (legacySubmit) legacySubmit.disabled = false;
    }
  });
})();

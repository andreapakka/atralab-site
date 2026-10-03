(() => {
  "use strict";

  const SUPABASE_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co";
  const SUPABASE_KEY = "sb_publishable_IRKqtPwpSGWd-YbnyvXqsg_DFKZSotn";
  const DEVICE_STORAGE_KEY = "atralab-device-id";

  const emailForm = document.getElementById("otpEmailForm");
  const emailInput = document.getElementById("otpEmail");
  const sendButton = document.getElementById("otpSendButton");
  const verifySection = document.getElementById("otpVerifySection");
  const verifyButton = document.getElementById("otpVerifyButton");
  const changeEmailButton = document.getElementById("otpChangeEmailButton");
  const message = document.getElementById("otpMessage");
  const digitInputs = Array.from(document.querySelectorAll(".otp-digit"));

  if (!window.supabase?.createClient) {
    setMessage("Accesso non disponibile. Ricarica la pagina.", "error");
    return;
  }

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  let currentEmail = "";

  function setMessage(text, type = "") {
    if (!message) return;

    message.textContent = text || "";
    message.classList.toggle("is-error", type === "error");
    message.classList.toggle("is-success", type === "success");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
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
      "apikey": SUPABASE_KEY,
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-log`, {
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
    emailInput.disabled = true;
    sendButton.disabled = true;
    verifySection.hidden = false;
    clearOtpInputs();
    digitInputs[0]?.focus();
  }

  function resetToEmailStep() {
    currentEmail = "";
    clearOtpInputs();
    verifySection.hidden = true;
    emailInput.disabled = false;
    sendButton.disabled = false;
    setMessage("");
    emailInput.focus();
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
        verifyButton.click();
      }
    });

    input.addEventListener("paste", (event) => {
      const pasted = event.clipboardData?.getData("text")?.replace(/\D/g, "").slice(0, 6) || "";

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

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = normalizeEmail(emailInput.value);

    if (!email || !emailInput.checkValidity()) {
      setMessage("Inserisci un indirizzo email valido.", "error");
      emailInput.focus();
      return;
    }

    sendButton.disabled = true;
    setMessage("Invio del codice in corso…");

    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      await logAuth("requested", email);
      showVerifyStep(email);
      setMessage(`Codice inviato a ${email}.`, "success");
    } catch (error) {
      console.error("ATRALAB OTP request:", error);
      sendButton.disabled = false;
      setMessage("Non è stato possibile inviare il codice. Riprova.", "error");
    }
  });

  verifyButton?.addEventListener("click", async () => {
    const token = getOtpCode();

    if (!/^\d{6}$/.test(token)) {
      setMessage("Inserisci tutte le 6 cifre del codice.", "error");
      return;
    }

    verifyButton.disabled = true;
    changeEmailButton.disabled = true;
    setMessage("Verifica del codice in corso…");

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
      setMessage("Accesso riuscito. Sessione Supabase creata correttamente.", "success");

      digitInputs.forEach((input) => {
        input.disabled = true;
      });
      verifyButton.disabled = true;
      changeEmailButton.disabled = false;
    } catch (error) {
      console.error("ATRALAB OTP verify:", error);
      verifyButton.disabled = false;
      changeEmailButton.disabled = false;
      setMessage("Codice non valido o scaduto. Controlla e riprova.", "error");
    }
  });

  changeEmailButton?.addEventListener("click", async () => {
    try {
      await supabaseClient.auth.signOut();
    } catch (error) {
      console.warn("ATRALAB OTP signOut:", error);
    }

    digitInputs.forEach((input) => {
      input.disabled = false;
    });
    resetToEmailStep();
  });
})();

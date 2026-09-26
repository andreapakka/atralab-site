(() => {
  "use strict";

  const AUTH_URL = "https://ukoaefhtvhqqdchjnzby.supabase.co";
  const AUTH_KEY = "sb_publishable_hUhoYFMepUOJlJiy6RfBcg_LHf_V6cU";
  const AUTH_STORAGE_KEY = "atralab-auth";
  const RETURN_URL_KEY = "atralab-return-url";

  const form = document.querySelector("form");
  const usernameInput = document.querySelector('input[name="username"]');
  const passwordInput = document.querySelector('input[name="password"]');
  const submitButton = form?.querySelector('button[type="submit"]');
  const message = document.querySelector("[data-auth-message]");

  function setMessage(text) {
    if (message) message.textContent = text || "";
  }

  function normalizeUsername() {
    if (!usernameInput) return "";
    const value = usernameInput.value.toLowerCase();
    if (usernameInput.value !== value) usernameInput.value = value;
    return value.trim();
  }

  usernameInput?.addEventListener("input", normalizeUsername);

  // Occhiolino password: supporta sia un elemento dedicato sia un bottone
  // già presente nel markup della pagina.
  const passwordToggle =
    document.querySelector("[data-password-toggle]") ||
    document.querySelector(".password-toggle") ||
    document.querySelector('button[aria-label*="password" i]');

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

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = normalizeUsername();
    const password = passwordInput?.value ?? "";

    if (!username || !password) {
      setMessage("Inserisci username e password.");
      return;
    }

    if (submitButton) submitButton.disabled = true;
    setMessage("");

    try {
      const response = await fetch(
        `${AUTH_URL}/rest/v1/rpc/login_atralab_user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": AUTH_KEY
          },
          body: JSON.stringify({
            p_username: username,
            p_password: password
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Login fallito (${response.status})`);
      }

      const token = await response.json();

      if (!token || typeof token !== "string") {
        setMessage("Username o password non corretti.");
        return;
      }

      localStorage.setItem(AUTH_STORAGE_KEY, token);

      let returnUrl = "/";
      const savedReturnUrl = localStorage.getItem(RETURN_URL_KEY);

      if (
        savedReturnUrl &&
        savedReturnUrl.startsWith("/") &&
        !savedReturnUrl.startsWith("//") &&
        !savedReturnUrl.startsWith("/auth")
      ) {
        returnUrl = savedReturnUrl;
      }

      localStorage.removeItem(RETURN_URL_KEY);
      window.location.replace(returnUrl);
    } catch (error) {
      console.error("ATRALAB login:", error);
      setMessage("Accesso non disponibile. Riprova.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
})();

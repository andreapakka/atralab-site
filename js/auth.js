const ATRALAB_AUTH_URL = "https://ukoaefhtvhqqdchjnzby.supabase.co";
const ATRALAB_AUTH_KEY = "sb_publishable_hUhoYFMepUOJlJiy6RfBcg_LHf_V6cU";
const ATRALAB_AUTH_STORAGE_KEY = "atralab-auth";
const ATRALAB_RETURN_URL_KEY = "atralab-return-url";

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function setAuthMessage(message = "", isError = false) {
  const element = document.getElementById("authMessage");
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

async function loginAtralab(username, password) {
  const response = await fetch(`${ATRALAB_AUTH_URL}/rest/v1/rpc/login_atralab_user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ATRALAB_AUTH_KEY,
      "Authorization": `Bearer ${ATRALAB_AUTH_KEY}`
    },
    body: JSON.stringify({
      p_username: username,
      p_password: password
    })
  });

  if (!response.ok) {
    throw new Error(`Login non disponibile (${response.status})`);
  }

  return response.json();
}

function saveAuthToken(token) {
  localStorage.setItem(ATRALAB_AUTH_STORAGE_KEY, JSON.stringify({
    token,
    savedAt: new Date().toISOString()
  }));
}

function getReturnUrl() {
  const saved = localStorage.getItem(ATRALAB_RETURN_URL_KEY);
  localStorage.removeItem(ATRALAB_RETURN_URL_KEY);

  if (!saved || !saved.startsWith("/") || saved.startsWith("//")) {
    return "/";
  }

  return saved;
}

function initPasswordToggle() {
  const password = document.getElementById("authPassword");
  const toggle = document.getElementById("togglePassword");

  if (!password || !toggle) return;

  toggle.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? "Nascondi password" : "Mostra password");
    toggle.title = show ? "Nascondi password" : "Mostra password";
  });
}

function initUsernameNormalization() {
  const username = document.getElementById("authUsername");
  if (!username) return;

  username.addEventListener("input", () => {
    const start = username.selectionStart;
    const end = username.selectionEnd;
    username.value = username.value.toLowerCase();

    if (start !== null && end !== null) {
      username.setSelectionRange(start, end);
    }
  });
}

function initAuthForm() {
  const form = document.getElementById("authForm");
  const username = document.getElementById("authUsername");
  const password = document.getElementById("authPassword");
  const submit = document.getElementById("authSubmit");

  if (!form || !username || !password || !submit) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage();

    const normalizedUsername = normalizeUsername(username.value);
    username.value = normalizedUsername;

    if (!normalizedUsername || !password.value) {
      setAuthMessage("Inserisci username e password.", true);
      return;
    }

    submit.disabled = true;
    submit.textContent = "Accesso...";

    try {
      const token = await loginAtralab(normalizedUsername, password.value);

      if (!token || typeof token !== "string") {
        setAuthMessage("Username o password non corretti.", true);
        return;
      }

      saveAuthToken(token);
      window.location.replace(getReturnUrl());
    } catch (error) {
      console.error("ATRALAB auth:", error);
      setAuthMessage("Impossibile effettuare l'accesso. Riprova.", true);
    } finally {
      submit.disabled = false;
      submit.textContent = "Accedi";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initUsernameNormalization();
    initPasswordToggle();
    initAuthForm();
  }, { once: true });
} else {
  initUsernameNormalization();
  initPasswordToggle();
  initAuthForm();
}

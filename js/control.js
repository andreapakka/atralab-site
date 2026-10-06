(() => {
  "use strict";

  const SUPABASE_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co";
  const SUPABASE_KEY = "sb_publishable_IRKqtPwpSGWd-YbnyvXqsg_DFKZSotn";
  const SESSION_KEY = "sb-pcpsbrnhfhzkjlnstgfr-auth-token";

  const list = document.getElementById("rolesList");
  const status = document.getElementById("controlStatus");
  const refreshButton = document.getElementById("refreshRoles");

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function setStatus(message = "", type = "") {
    status.textContent = message;
    status.className = "control-status";

    if (type) {
      status.classList.add(`is-${type}`);
    }
  }

  async function rpc(name, body = {}) {
    const session = getSession();

    if (!session?.access_token) {
      throw new Error("Sessione non disponibile");
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorBody = await response.json();
        detail = errorBody?.message || errorBody?.error_description || "";
      } catch {}

      throw new Error(detail || `Errore ${response.status}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function renderRows(rows) {
    list.innerHTML = "";

    if (!Array.isArray(rows) || rows.length === 0) {
      list.innerHTML = '<p class="control-muted">Nessuna email registrata.</p>';
      return;
    }

    for (const item of rows) {
      const row = document.createElement("div");
      row.className = "control-row";

      const main = document.createElement("div");
      main.className = "control-row-main";

      const email = document.createElement("div");
      email.className = "control-email";
      email.textContent = item.email;

      const meta = document.createElement("div");
      meta.className = "control-meta";
      meta.textContent =
        `Creato: ${formatDate(item.created_at)} · Aggiornato: ${formatDate(item.updated_at)}`;

      main.append(email, meta);

      const actions = document.createElement("div");
      actions.className = "control-row-actions";

      const select = document.createElement("select");
      select.className = "control-select";
      select.setAttribute("aria-label", `Ruolo per ${item.email}`);

      for (const role of ["user", "family", "admin"]) {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = role;
        option.selected = item.role === role;
        select.appendChild(option);
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "control-button";
      button.textContent = "Salva";
      button.disabled = true;

      select.addEventListener("change", () => {
        button.disabled = select.value === item.role;
      });

      button.addEventListener("click", async () => {
        const newRole = select.value;

        select.disabled = true;
        button.disabled = true;
        setStatus(`Aggiorno ${item.email}...`);

        try {
          const changed = await rpc("set_atralab_user_role", {
            p_email: item.email,
            p_role: newRole
          });

          if (changed !== true) {
            throw new Error("Modifica non eseguita");
          }

          item.role = newRole;
          setStatus(`Ruolo aggiornato: ${item.email} → ${newRole}`, "success");
          await loadRoles(false);
        } catch (error) {
          setStatus(error.message || "Errore durante l'aggiornamento", "error");
          select.value = item.role;
        } finally {
          select.disabled = false;
          button.disabled = select.value === item.role;
        }
      });

      actions.append(select, button);
      row.append(main, actions);
      list.appendChild(row);
    }
  }

  async function loadRoles(showMessage = true) {
    refreshButton.disabled = true;

    if (showMessage) {
      setStatus("Caricamento...");
    }

    try {
      const rows = await rpc("list_atralab_user_roles");
      renderRows(rows);
      setStatus("");
    } catch (error) {
      list.innerHTML = '<p class="control-muted">Impossibile caricare i ruoli.</p>';
      setStatus(error.message || "Accesso non disponibile", "error");
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener("click", () => loadRoles(true));
  loadRoles(true);
})();

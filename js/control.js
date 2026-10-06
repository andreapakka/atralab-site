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


  const pagesList = document.getElementById("pagesList");
  const pageStatus = document.getElementById("pageStatus");
  const refreshPagesButton = document.getElementById("refreshPages");
  const pageRoleForm = document.getElementById("pageRoleForm");
  const pagePathInput = document.getElementById("pagePath");
  const savePageRolesButton = document.getElementById("savePageRoles");

  function setPageStatus(message = "", type = "") {
    pageStatus.textContent = message;
    pageStatus.className = "control-status";

    if (type) {
      pageStatus.classList.add(`is-${type}`);
    }
  }

  function getSelectedPageRoles() {
    return [...document.querySelectorAll('input[name="pageRole"]:checked')]
      .map((input) => input.value);
  }

  function setSelectedPageRoles(roles = []) {
    document.querySelectorAll('input[name="pageRole"]').forEach((input) => {
      input.checked = roles.includes(input.value);
    });
  }

  function normalizePath(path) {
    let value = String(path || "").trim();

    if (!value) return "";

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    if (value.endsWith("/index.html")) {
      value = value.slice(0, -"index.html".length);
    }

    return value;
  }

  function editPage(item) {
    pagePathInput.value = item.path;
    setSelectedPageRoles(item.roles || []);
    pagePathInput.focus();
    setPageStatus(`Modifica ${item.path}`);
  }

  async function deletePage(item) {
    if (item.path === "/control/") {
      setPageStatus("La pagina /control/ non può essere rimossa.", "error");
      return;
    }

    const confirmed = window.confirm(
      `Rimuovere ${item.path} dalla matrice dei permessi?`
    );

    if (!confirmed) return;

    setPageStatus(`Rimuovo ${item.path}...`);

    try {
      const removed = await rpc("delete_atralab_page_roles", {
        p_path: item.path
      });

      if (removed !== true) {
        throw new Error("Rimozione non eseguita");
      }

      setPageStatus(`Pagina rimossa: ${item.path}`, "success");
      await loadPages(false);
    } catch (error) {
      setPageStatus(error.message || "Errore durante la rimozione", "error");
    }
  }

  function renderPages(rows) {
    pagesList.innerHTML = "";

    if (!Array.isArray(rows) || rows.length === 0) {
      pagesList.innerHTML = '<p class="control-muted">Nessuna pagina configurata.</p>';
      return;
    }

    for (const item of rows) {
      const row = document.createElement("div");
      row.className = "control-row";

      const main = document.createElement("div");
      main.className = "control-row-main";

      const path = document.createElement("div");
      path.className = "control-page-path";
      path.textContent = item.path;

      const badges = document.createElement("div");
      badges.className = "control-role-badges";

      for (const role of item.roles || []) {
        const badge = document.createElement("span");
        badge.className = "control-role-badge";
        badge.textContent = role;
        badges.appendChild(badge);
      }

      main.append(path, badges);

      const actions = document.createElement("div");
      actions.className = "control-row-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "control-button";
      editButton.textContent = "Modifica";
      editButton.addEventListener("click", () => editPage(item));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "control-danger-button";
      deleteButton.textContent = "Rimuovi";
      deleteButton.disabled = item.path === "/control/";
      deleteButton.addEventListener("click", () => deletePage(item));

      actions.append(editButton, deleteButton);
      row.append(main, actions);
      pagesList.appendChild(row);
    }
  }

  async function loadPages(showMessage = true) {
    refreshPagesButton.disabled = true;

    if (showMessage) {
      setPageStatus("Caricamento...");
    }

    try {
      const rows = await rpc("list_atralab_page_roles");
      renderPages(rows);
      setPageStatus("");
    } catch (error) {
      pagesList.innerHTML = '<p class="control-muted">Impossibile caricare le pagine.</p>';
      setPageStatus(error.message || "Accesso non disponibile", "error");
    } finally {
      refreshPagesButton.disabled = false;
    }
  }

  pageRoleForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const path = normalizePath(pagePathInput.value);
    const roles = getSelectedPageRoles();

    if (!path) {
      setPageStatus("Inserisci il path della pagina.", "error");
      return;
    }

    if (roles.length === 0) {
      setPageStatus("Seleziona almeno un ruolo.", "error");
      return;
    }

    savePageRolesButton.disabled = true;
    setPageStatus(`Salvo ${path}...`);

    try {
      const saved = await rpc("set_atralab_page_roles", {
        p_path: path,
        p_roles: roles
      });

      if (saved !== true) {
        throw new Error("Salvataggio non eseguito");
      }

      pagePathInput.value = "";
      setSelectedPageRoles([]);
      setPageStatus(`Permessi salvati per ${path}`, "success");
      await loadPages(false);
    } catch (error) {
      setPageStatus(error.message || "Errore durante il salvataggio", "error");
    } finally {
      savePageRolesButton.disabled = false;
    }
  });

  refreshPagesButton.addEventListener("click", () => loadPages(true));

  refreshButton.addEventListener("click", () => loadRoles(true));
  loadRoles(true);
  loadPages(true);
})();

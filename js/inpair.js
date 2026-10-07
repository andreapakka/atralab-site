(() => {
  "use strict";

  const SUPABASE_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co";

  /*
   * Inserire qui la STESSA publishable key pubblica già usata da ATRALAB.
   * Non usare mai service_role o altre chiavi private.
   */
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_IRKqtPwpSGWd-YbnyvXqsg_DFKZSotn";

  const state = {
    db: null,
    user: null,
    isAdmin: false,
    events: [],
    categories: [],
    allUsers: [],
    event: null,
    participants: [],
    expenses: [],
    activeTab: "expenses"
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    main: $("inpairMain"),
    status: $("statusBox"),
    currentUserBox: $("currentUserBox"),
    currentUserEmail: $("currentUserEmail"),
    currentUserRole: $("currentUserRole"),
    eventsView: $("eventsView"),
    eventView: $("eventView"),
    activeEvents: $("activeEvents"),
    activeEventsEmpty: $("activeEventsEmpty"),
    closedEvents: $("closedEvents"),
    closedEventsEmpty: $("closedEventsEmpty"),
    closedCount: $("closedCount"),
    newEventButton: $("newEventButton"),
    newEventDialog: $("newEventDialog"),
    newEventForm: $("newEventForm"),
    newEventTitle: $("newEventTitle"),
    backToEvents: $("backToEvents"),
    eventTitle: $("eventTitle"),
    eventState: $("eventState"),
    eventMeta: $("eventMeta"),
    shareButton: $("shareButton"),
    shareDialog: $("shareDialog"),
    shareUrl: $("shareUrl"),
    qrCode: $("qrCode"),
    copyLinkButton: $("copyLinkButton"),
    summaryTotal: $("summaryTotal"),
    summaryShare: $("summaryShare"),
    summaryBalance: $("summaryBalance"),
    addExpenseButton: $("addExpenseButton"),
    activeOnly: $("activeOnly"),
    expenseForm: $("expenseForm"),
    expenseDescription: $("expenseDescription"),
    expenseAmount: $("expenseAmount"),
    expenseCategory: $("expenseCategory"),
    expensePayerWrap: $("expensePayerWrap"),
    expensePayer: $("expensePayer"),
    cancelExpenseForm: $("cancelExpenseForm"),
    expenseList: $("expenseList"),
    expenseEmpty: $("expenseEmpty"),
    situationList: $("situationList"),
    settlementIntro: $("settlementIntro"),
    settlementList: $("settlementList"),
    adminPanel: $("adminPanel"),
    titleForm: $("titleForm"),
    adminTitle: $("adminTitle"),
    participantForm: $("participantForm"),
    participantSelect: $("participantSelect"),
    participantAdminList: $("participantAdminList"),
    adminEventStateText: $("adminEventStateText"),
    toggleEventStateButton: $("toggleEventStateButton")
  };

  function setStatus(message, isError = false) {
    if (!message) {
      els.status.hidden = true;
      els.status.textContent = "";
      els.status.classList.remove("is-error");
      return;
    }
    els.status.hidden = false;
    els.status.textContent = message;
    els.status.classList.toggle("is-error", isError);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function euroFromCents(cents) {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    }).format((Number(cents) || 0) / 100);
  }

  function toCents(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function formatDateTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(d);
  }

  function eventUrl(guid) {
    const url = new URL("/inpair/", window.location.origin);
    url.searchParams.set("event", guid);
    return url.toString();
  }

  function currentGuidFromUrl() {
    const guid = new URLSearchParams(window.location.search).get("event");
    return guid ? guid.trim() : "";
  }

  function pushEventUrl(guid) {
    const url = new URL(window.location.href);
    if (guid) url.searchParams.set("event", guid);
    else url.searchParams.delete("event");
    history.pushState({}, "", url);
  }

  function requireConfig() {
    if (!window.supabase?.createClient) {
      throw new Error("Libreria Supabase non disponibile.");
    }
    if (!SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY.startsWith("REPLACE_")) {
      throw new Error("Configura in /js/inpair.js la publishable key pubblica già usata da ATRALAB.");
    }
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.db.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function initAuth() {
    const { data, error } = await state.db.auth.getSession();
    if (error) throw error;

    const session = data.session;
    if (!session?.user?.email) {
      throw new Error("InPair richiede una sessione Supabase Auth via email OTP.");
    }

    state.user = session.user;
    state.isAdmin = Boolean(await rpc("inpair_is_admin"));

    els.currentUserEmail.textContent = normalizeEmail(state.user.email);
    els.currentUserRole.textContent = state.isAdmin ? "admin" : "utente";
    els.currentUserBox.hidden = false;
    els.newEventButton.hidden = !state.isAdmin;
  }

  async function loadCategories() {
    const { data, error } = await state.db
      .from("inpair_categories")
      .select("category_id,name,sort_order,active")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    state.categories = data || [];

    els.expenseCategory.innerHTML = state.categories
      .map((c) => `<option value="${c.category_id}">${escapeHtml(c.name)}</option>`)
      .join("");
  }

  async function loadAllUsersForAdmin() {
    if (!state.isAdmin) return;
    try {
      const data = await rpc("list_atralab_user_roles");
      state.allUsers = Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn("InPair: impossibile caricare elenco utenti ATRALAB", error);
      state.allUsers = [];
    }
  }

  async function loadEvents() {
    setStatus("Caricamento eventi…");

    const { data, error } = await state.db
      .from("inpair_events")
      .select("event_id,event_guid,title,created_by_email,created_at,updated_at,closed_at")
      .order("closed_at", { ascending: true, nullsFirst: true })
      .order("updated_at", { ascending: false });

    if (error) throw error;
    state.events = data || [];
    renderEventLists();
    setStatus("");
  }

  function renderEventLists() {
    const active = state.events.filter((e) => !e.closed_at);
    const closed = state.events.filter((e) => e.closed_at);

    els.activeEvents.innerHTML = active.map(eventCardHtml).join("");
    els.closedEvents.innerHTML = closed.map(eventCardHtml).join("");
    els.activeEventsEmpty.hidden = active.length > 0;
    els.closedEventsEmpty.hidden = closed.length > 0;
    els.closedCount.textContent = `(${closed.length})`;

    document.querySelectorAll("[data-open-event]").forEach((button) => {
      button.addEventListener("click", () => openEvent(button.dataset.openEvent));
    });
  }

  function eventCardHtml(event) {
    const stateLabel = event.closed_at ? "Chiuso" : "Attivo";
    return `
      <button type="button" class="inpair-event-card" data-open-event="${escapeHtml(event.event_guid)}">
        <div class="inpair-event-card-top">
          <strong>${escapeHtml(event.title)}</strong>
          <span class="inpair-badge">${stateLabel}</span>
        </div>
        <p>Aggiornato ${escapeHtml(formatDateTime(event.updated_at))}</p>
      </button>`;
  }

  async function openEvent(guid, updateUrl = true) {
    setStatus("Caricamento evento…");

    const { data: event, error: eventError } = await state.db
      .from("inpair_events")
      .select("event_id,event_guid,title,created_by_email,created_at,updated_at,closed_at")
      .eq("event_guid", guid)
      .maybeSingle();

    if (eventError) throw eventError;
    if (!event) throw new Error("Evento non trovato o non autorizzato.");

    state.event = event;

    const [participantsRes, expensesRes] = await Promise.all([
      state.db
        .from("inpair_event_participants")
        .select("event_id,email,added_by_email,added_at,removed_by_email,removed_at")
        .eq("event_id", event.event_id)
        .order("email", { ascending: true }),
      state.db
        .from("inpair_expenses")
        .select("expense_id,event_id,description,amount,category_id,paid_by_email,created_by_email,created_at,deleted_at,deleted_by_email")
        .eq("event_id", event.event_id)
        .order("created_at", { ascending: false })
    ]);

    if (participantsRes.error) throw participantsRes.error;
    if (expensesRes.error) throw expensesRes.error;

    state.participants = participantsRes.data || [];
    state.expenses = expensesRes.data || [];

    if (updateUrl) pushEventUrl(guid);

    renderEvent();
    els.eventsView.hidden = true;
    els.eventView.hidden = false;
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function activeParticipants() {
    return state.participants.filter((p) => !p.removed_at);
  }

  function activeExpenses() {
    return state.expenses.filter((e) => !e.deleted_at);
  }

  function computeBalances() {
    const participants = activeParticipants()
      .map((p) => normalizeEmail(p.email))
      .sort((a, b) => a.localeCompare(b));

    const totals = new Map(participants.map((email) => [email, 0]));

    let totalCents = 0;
    for (const expense of activeExpenses()) {
      const cents = toCents(expense.amount);
      totalCents += cents;
      const email = normalizeEmail(expense.paid_by_email);
      if (totals.has(email)) totals.set(email, (totals.get(email) || 0) + cents);
    }

    const count = participants.length;
    const baseShare = count ? Math.floor(totalCents / count) : 0;
    const remainder = count ? totalCents % count : 0;

    const rows = participants.map((email, index) => {
      const shareCents = baseShare + (index < remainder ? 1 : 0);
      const paidCents = totals.get(email) || 0;
      return {
        email,
        paidCents,
        shareCents,
        balanceCents: paidCents - shareCents
      };
    });

    return {
      totalCents,
      averageShareCents: count ? Math.round(totalCents / count) : 0,
      rows
    };
  }

  function settlementPlan(rows) {
    const creditors = rows
      .filter((r) => r.balanceCents > 0)
      .map((r) => ({ email: r.email, amount: r.balanceCents }))
      .sort((a, b) => b.amount - a.amount);

    const debtors = rows
      .filter((r) => r.balanceCents < 0)
      .map((r) => ({ email: r.email, amount: -r.balanceCents }))
      .sort((a, b) => b.amount - a.amount);

    const result = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].amount, creditors[j].amount);
      if (amount > 0) {
        result.push({
          from: debtors[i].email,
          to: creditors[j].email,
          amount
        });
      }
      debtors[i].amount -= amount;
      creditors[j].amount -= amount;
      if (debtors[i].amount === 0) i += 1;
      if (creditors[j].amount === 0) j += 1;
    }

    return result;
  }

  function renderEvent() {
    const event = state.event;
    const isClosed = Boolean(event.closed_at);
    const currentEmail = normalizeEmail(state.user.email);
    const isParticipant = activeParticipants().some((p) => normalizeEmail(p.email) === currentEmail);
    const balances = computeBalances();
    const me = balances.rows.find((r) => r.email === currentEmail);

    els.eventTitle.textContent = event.title;
    els.eventState.textContent = isClosed ? "chiuso" : "attivo";
    els.eventMeta.textContent = `${activeParticipants().length} partecipanti · aggiornato ${formatDateTime(event.updated_at)}`;

    els.summaryTotal.textContent = euroFromCents(balances.totalCents);
    els.summaryShare.textContent = euroFromCents(balances.averageShareCents);
    setMoneyElement(els.summaryBalance, me?.balanceCents || 0);

    els.addExpenseButton.hidden = isClosed || !isParticipant;
    els.expenseForm.hidden = true;
    els.expensePayerWrap.hidden = !state.isAdmin;

    renderExpensePayerOptions();
    renderExpenses();
    renderSituation(balances.rows);
    renderSettlement(balances.rows);
    renderAdmin();
    showTab(state.activeTab);
  }

  function setMoneyElement(element, cents) {
    element.textContent = `${cents > 0 ? "+" : ""}${euroFromCents(cents)}`;
    element.classList.toggle("is-positive", cents > 0);
    element.classList.toggle("is-negative", cents < 0);
  }

  function renderExpensePayerOptions() {
    const currentEmail = normalizeEmail(state.user.email);
    const participants = activeParticipants();
    els.expensePayer.innerHTML = participants
      .map((p) => `<option value="${escapeHtml(p.email)}">${escapeHtml(p.email)}</option>`)
      .join("");

    if (participants.some((p) => normalizeEmail(p.email) === currentEmail)) {
      els.expensePayer.value = currentEmail;
    }
  }

  function categoryName(id) {
    return state.categories.find((c) => Number(c.category_id) === Number(id))?.name || "Altro";
  }

  function canCancelExpense(expense) {
    if (state.event?.closed_at || expense.deleted_at) return false;
    if (state.isAdmin) return true;
    return normalizeEmail(expense.paid_by_email) === normalizeEmail(state.user.email);
  }

  function renderExpenses() {
    const showActiveOnly = els.activeOnly.checked;
    const list = state.expenses.filter((e) => !showActiveOnly || !e.deleted_at);

    els.expenseList.innerHTML = list.map((expense) => {
      const deleted = Boolean(expense.deleted_at);
      const cancelButton = canCancelExpense(expense)
        ? `<button type="button" class="inpair-mini-button" data-cancel-expense="${expense.expense_id}">Annulla spesa</button>`
        : "";

      const deletedMeta = deleted
        ? `<span>Annullata ${escapeHtml(formatDateTime(expense.deleted_at))}${expense.deleted_by_email ? ` da ${escapeHtml(expense.deleted_by_email)}` : ""}</span>`
        : "";

      return `
        <article class="inpair-expense-card ${deleted ? "is-deleted" : ""}">
          <div class="inpair-expense-top">
            <div class="inpair-expense-title">${escapeHtml(expense.description)}</div>
            <div class="inpair-expense-amount">${escapeHtml(euroFromCents(toCents(expense.amount)))}</div>
          </div>
          <div class="inpair-expense-meta">
            <span>${escapeHtml(categoryName(expense.category_id))}</span>
            <span>Di ${escapeHtml(expense.paid_by_email)}</span>
            <span>Inserita da ${escapeHtml(expense.created_by_email)}</span>
            <span>${escapeHtml(formatDateTime(expense.created_at))}</span>
            ${deletedMeta}
          </div>
          ${cancelButton ? `<div class="inpair-expense-actions">${cancelButton}</div>` : ""}
        </article>`;
    }).join("");

    els.expenseEmpty.hidden = list.length > 0;

    document.querySelectorAll("[data-cancel-expense]").forEach((button) => {
      button.addEventListener("click", () => cancelExpense(Number(button.dataset.cancelExpense)));
    });
  }

  function renderSituation(rows) {
    els.situationList.innerHTML = rows.map((row) => {
      const balanceClass = row.balanceCents > 0 ? "is-positive" : row.balanceCents < 0 ? "is-negative" : "";
      const balanceText = `${row.balanceCents > 0 ? "+" : ""}${euroFromCents(row.balanceCents)}`;
      const me = row.email === normalizeEmail(state.user.email) ? " · tu" : "";
      return `
        <article class="inpair-person-card">
          <div class="inpair-person-top">
            <strong>${escapeHtml(row.email)}${me}</strong>
            <strong class="inpair-money ${balanceClass}">${escapeHtml(balanceText)}</strong>
          </div>
          <div class="inpair-person-values">
            <div><span>Pagato</span><strong>${escapeHtml(euroFromCents(row.paidCents))}</strong></div>
            <div><span>Quota</span><strong>${escapeHtml(euroFromCents(row.shareCents))}</strong></div>
            <div><span>Saldo</span><strong>${escapeHtml(balanceText)}</strong></div>
          </div>
        </article>`;
    }).join("");
  }

  function renderSettlement(rows) {
    const plan = settlementPlan(rows);

    if (!rows.length) {
      els.settlementIntro.textContent = "Nessun partecipante attivo.";
      els.settlementList.innerHTML = "";
      return;
    }

    if (!plan.length) {
      els.settlementIntro.textContent = "Tutti sono già in pari.";
      els.settlementList.innerHTML = "";
      return;
    }

    els.settlementIntro.textContent = "Proposta di pareggio calcolata sulle spese attive e sui partecipanti attuali.";
    els.settlementList.innerHTML = plan.map((item) => `
      <article class="inpair-settlement-card">
        <div class="inpair-settlement-row">
          <span>${escapeHtml(item.from)} → ${escapeHtml(item.to)}</span>
          <strong>${escapeHtml(euroFromCents(item.amount))}</strong>
        </div>
      </article>`).join("");
  }

  function renderAdmin() {
    els.adminPanel.hidden = !state.isAdmin;
    if (!state.isAdmin) return;

    const isClosed = Boolean(state.event.closed_at);
    els.adminTitle.value = state.event.title;
    els.adminEventStateText.textContent = isClosed
      ? `Evento chiuso ${formatDateTime(state.event.closed_at)}. Può essere riaperto.`
      : "Evento attivo. La chiusura blocca nuove spese e modifiche.";
    els.toggleEventStateButton.textContent = isClosed ? "Riapri evento" : "Chiudi evento";

    const activeEmails = new Set(activeParticipants().map((p) => normalizeEmail(p.email)));
    const available = state.allUsers
      .map((u) => ({ email: normalizeEmail(u.email), role: u.role }))
      .filter((u) => u.email && !activeEmails.has(u.email))
      .sort((a, b) => a.email.localeCompare(b.email));

    els.participantSelect.innerHTML = available.length
      ? `<option value="">Seleziona utente…</option>${available.map((u) => `<option value="${escapeHtml(u.email)}">${escapeHtml(u.email)} · ${escapeHtml(u.role || "user")}</option>`).join("")}`
      : `<option value="">Nessun utente disponibile</option>`;
    els.participantSelect.disabled = isClosed || available.length === 0;
    els.participantForm.querySelector("button").disabled = isClosed || available.length === 0;

    els.participantAdminList.innerHTML = activeParticipants().map((p) => `
      <div class="inpair-participant-row">
        <span>${escapeHtml(p.email)}</span>
        <button type="button" class="inpair-mini-button" data-remove-participant="${escapeHtml(p.email)}" ${isClosed ? "disabled" : ""}>Rimuovi</button>
      </div>`).join("");

    document.querySelectorAll("[data-remove-participant]").forEach((button) => {
      button.addEventListener("click", () => removeParticipant(button.dataset.removeParticipant));
    });
  }

  function showTab(name) {
    state.activeTab = name;
    document.querySelectorAll("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== name;
    });
  }

  async function createEvent(event) {
    event.preventDefault();
    const title = els.newEventTitle.value.trim();
    if (!title) return;

    try {
      setStatus("Creazione evento…");
      const data = await rpc("create_inpair_event", { p_title: title });
      const created = Array.isArray(data) ? data[0] : data;
      els.newEventDialog.close();
      els.newEventForm.reset();
      await loadEvents();
      if (created?.event_guid) await openEvent(created.event_guid);
    } catch (error) {
      handleError(error);
    }
  }

  async function saveExpense(event) {
    event.preventDefault();

    const amount = Number(els.expenseAmount.value);
    const description = els.expenseDescription.value.trim();
    const categoryId = Number(els.expenseCategory.value);
    const payer = state.isAdmin
      ? els.expensePayer.value
      : normalizeEmail(state.user.email);

    if (!description || !Number.isFinite(amount) || amount <= 0 || !categoryId || !payer) return;

    try {
      setStatus("Salvataggio spesa…");
      await rpc("add_inpair_expense", {
        p_event_id: state.event.event_id,
        p_description: description,
        p_amount: amount,
        p_category_id: categoryId,
        p_paid_by_email: payer
      });
      els.expenseForm.reset();
      els.expenseForm.hidden = true;
      await openEvent(state.event.event_guid, false);
    } catch (error) {
      handleError(error);
    }
  }

  async function cancelExpense(expenseId) {
    if (!confirm("Annullare questa spesa? La riga resterà visibile nello storico.")) return;
    try {
      setStatus("Annullamento spesa…");
      await rpc("delete_inpair_expense", { p_expense_id: expenseId });
      await openEvent(state.event.event_guid, false);
    } catch (error) {
      handleError(error);
    }
  }

  async function updateTitle(event) {
    event.preventDefault();
    const title = els.adminTitle.value.trim();
    if (!title) return;
    try {
      setStatus("Aggiornamento titolo…");
      await rpc("set_inpair_event_title", {
        p_event_id: state.event.event_id,
        p_title: title
      });
      await openEvent(state.event.event_guid, false);
    } catch (error) {
      handleError(error);
    }
  }

  async function addParticipant(event) {
    event.preventDefault();
    const email = normalizeEmail(els.participantSelect.value);
    if (!email) return;
    try {
      setStatus("Aggiunta partecipante…");
      await rpc("add_inpair_participant", {
        p_event_id: state.event.event_id,
        p_email: email
      });
      await openEvent(state.event.event_guid, false);
    } catch (error) {
      handleError(error);
    }
  }

  async function removeParticipant(email) {
    if (!confirm(`Rimuovere ${email}? Le sue spese attive verranno annullate logicamente.`)) return;
    try {
      setStatus("Rimozione partecipante…");
      await rpc("remove_inpair_participant", {
        p_event_id: state.event.event_id,
        p_email: email
      });
      await openEvent(state.event.event_guid, false);
    } catch (error) {
      handleError(error);
    }
  }

  async function toggleEventState() {
    const isClosed = Boolean(state.event.closed_at);
    const message = isClosed
      ? "Riaprire questo evento?"
      : "Chiudere questo evento? Non sarà più possibile inserire o annullare spese finché non verrà riaperto.";
    if (!confirm(message)) return;

    try {
      setStatus(isClosed ? "Riapertura evento…" : "Chiusura evento…");
      await rpc(isClosed ? "reopen_inpair_event" : "close_inpair_event", {
        p_event_id: state.event.event_id
      });
      await openEvent(state.event.event_guid, false);
    } catch (error) {
      handleError(error);
    }
  }

  function openShareDialog() {
    const url = eventUrl(state.event.event_guid);
    els.shareUrl.textContent = url;
    els.qrCode.innerHTML = "";

    if (window.QRCode) {
      new window.QRCode(els.qrCode, {
        text: url,
        width: 180,
        height: 180,
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      els.qrCode.textContent = "QR non disponibile";
    }

    els.shareDialog.showModal();
  }

  async function copyLink() {
    const url = eventUrl(state.event.event_guid);
    try {
      await navigator.clipboard.writeText(url);
      els.copyLinkButton.textContent = "Copiato";
      setTimeout(() => { els.copyLinkButton.textContent = "Copia link"; }, 1500);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "absolute";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  function handleError(error) {
    console.error("InPair", error);
    const message = error?.message || "Si è verificato un errore.";
    setStatus(message, true);
  }

  function bindEvents() {
    els.newEventButton.addEventListener("click", () => {
      els.newEventDialog.showModal();
      setTimeout(() => els.newEventTitle.focus(), 0);
    });

    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => button.closest("dialog")?.close());
    });

    els.newEventForm.addEventListener("submit", createEvent);
    els.backToEvents.addEventListener("click", async () => {
      pushEventUrl("");
      state.event = null;
      els.eventView.hidden = true;
      els.eventsView.hidden = false;
      await loadEvents();
    });

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => showTab(button.dataset.tab));
    });

    els.addExpenseButton.addEventListener("click", () => {
      els.expenseForm.hidden = !els.expenseForm.hidden;
      if (!els.expenseForm.hidden) setTimeout(() => els.expenseDescription.focus(), 0);
    });
    els.cancelExpenseForm.addEventListener("click", () => {
      els.expenseForm.reset();
      els.expenseForm.hidden = true;
    });
    els.expenseForm.addEventListener("submit", saveExpense);
    els.activeOnly.addEventListener("change", renderExpenses);

    els.titleForm.addEventListener("submit", updateTitle);
    els.participantForm.addEventListener("submit", addParticipant);
    els.toggleEventStateButton.addEventListener("click", toggleEventState);

    els.shareButton.addEventListener("click", openShareDialog);
    els.copyLinkButton.addEventListener("click", copyLink);

    window.addEventListener("popstate", async () => {
      try {
        const guid = currentGuidFromUrl();
        if (guid) await openEvent(guid, false);
        else {
          state.event = null;
          els.eventView.hidden = true;
          els.eventsView.hidden = false;
          await loadEvents();
        }
      } catch (error) {
        handleError(error);
      }
    });
  }

  async function init() {
    try {
      requireConfig();
      bindEvents();

      state.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      await initAuth();
      await Promise.all([loadCategories(), loadAllUsersForAdmin()]);

      const guid = currentGuidFromUrl();
      if (guid) {
        await openEvent(guid, false);
      } else {
        els.eventsView.hidden = false;
        await loadEvents();
      }
    } catch (error) {
      handleError(error);
      els.eventsView.hidden = true;
      els.eventView.hidden = true;
    }
  }

  init();
})();

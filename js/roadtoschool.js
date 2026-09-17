const SUPABASE_URL = "https://pcpsbrnhfhzkjlnstgfr.supabase.co";
const SUPABASE_KEY = "sb_publishable_IRKqtPwpSGWd-YbnyvXqsg_DFKZSotn";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const form = document.getElementById("roadToSchoolForm");
const dateInput = document.getElementById("date");
const departureInput = document.getElementById("departureTime");
const arrivalInput = document.getElementById("arrivalTime");
const eventInput = document.getElementById("event");
const notesInput = document.getElementById("notes");
const durationValue = document.getElementById("durationValue");
const recordStatus = document.getElementById("recordStatus");
const saveButton = document.getElementById("saveButton");
const saveMessage = document.getElementById("saveMessage");

const transportButtons = [...document.querySelectorAll("[data-transport]")];
const ratingButtons = [...document.querySelectorAll("[data-rating]")];

let selectedTransport = null;
let selectedRating = null;
let currentRowId = null;

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function setTransport(value) {
  selectedTransport = value || null;

  transportButtons.forEach(button => {
    button.classList.toggle(
      "is-selected",
      button.dataset.transport === selectedTransport
    );
  });
}

function setRating(value) {
  selectedRating = value ? Number(value) : null;

  ratingButtons.forEach(button => {
    button.classList.toggle(
      "is-selected",
      Number(button.dataset.rating) === selectedRating
    );
  });
}

function normalizeTime(value) {
  return value ? value.slice(0, 5) : "";
}

function minutesFromTime(value) {
  if (!value || !value.includes(":")) return null;

  const [hours, minutes] = value.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  return hours * 60 + minutes;
}

function updateDuration() {
  const departure = minutesFromTime(departureInput.value);
  const arrival = minutesFromTime(arrivalInput.value);

  if (departure === null || arrival === null) {
    durationValue.textContent = "—";
    return;
  }

  const diff = arrival - departure;

  if (diff < 0) {
    durationValue.textContent = "Controlla gli orari";
    return;
  }

  if (diff < 60) {
    durationValue.textContent = `${diff} min`;
    return;
  }

  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;

  durationValue.textContent = minutes === 0
    ? `${hours} h`
    : `${hours} h ${minutes} min`;
}

function resetFormForDate(date) {
  currentRowId = null;
  form.reset();
  dateInput.value = date;

  setTransport(null);
  setRating(null);

  recordStatus.textContent = "Nuovo giorno";
  recordStatus.classList.remove("is-existing");

  saveButton.textContent = "Salva giornata";
  saveMessage.textContent = "";
  saveMessage.className = "rts-message";

  updateDuration();
}

function populateForm(record) {
  currentRowId = record.rowid;

  dateInput.value = record.date ?? "";
  departureInput.value = normalizeTime(record.departure_time);
  arrivalInput.value = normalizeTime(record.arrival_time);
  eventInput.value = record.event ?? "";
  notesInput.value = record.notes ?? "";

  setTransport(record.transport);
  setRating(record.rating);

  recordStatus.textContent = "Giornata già registrata";
  recordStatus.classList.add("is-existing");

  saveButton.textContent = "Aggiorna giornata";
  saveMessage.textContent = "";
  saveMessage.className = "rts-message";

  updateDuration();
}

async function loadRecordForDate(date) {
  if (!date) return;

  saveMessage.textContent = "Caricamento…";
  saveMessage.className = "rts-message";

  const { data, error } = await db
    .from("school_roadtoschool")
    .select("*")
    .eq("date", date)
    .maybeSingle();

  if (error) {
    console.error(error);
    resetFormForDate(date);
    saveMessage.textContent = "Errore durante il caricamento.";
    saveMessage.className = "rts-message is-error";
    return;
  }

  if (data) {
    populateForm(data);
  } else {
    resetFormForDate(date);
  }
}

function validateForm() {
  if (!dateInput.value) return "Scegli una data.";

  if (!departureInput.value || !arrivalInput.value) {
    return "Inserisci partenza e arrivo.";
  }

  const departure = minutesFromTime(departureInput.value);
  const arrival = minutesFromTime(arrivalInput.value);

  if (departure !== null && arrival !== null && arrival < departure) {
    return "L'ora di arrivo deve essere successiva alla partenza.";
  }

  if (!selectedTransport) return "Scegli macchina o treno.";
  if (!selectedRating) return "Scegli una faccina.";

  return null;
}

async function saveRecord(event) {
  event.preventDefault();

  const validationError = validateForm();

  if (validationError) {
    saveMessage.textContent = validationError;
    saveMessage.className = "rts-message is-error";
    return;
  }

  const payload = {
    date: dateInput.value,
    transport: selectedTransport,
    departure_time: departureInput.value,
    arrival_time: arrivalInput.value,
    rating: selectedRating,
    event: eventInput.value || null,
    notes: notesInput.value.trim() || null
  };

  saveButton.disabled = true;
  saveButton.textContent = currentRowId ? "Aggiornamento…" : "Salvataggio…";
  saveMessage.textContent = "";

  const { data, error } = await db
    .from("school_roadtoschool")
    .upsert(payload, { onConflict: "date" })
    .select()
    .single();

  saveButton.disabled = false;

  if (error) {
    console.error(error);
    saveButton.textContent = currentRowId ? "Aggiorna giornata" : "Salva giornata";
    saveMessage.textContent = "Non sono riuscito a salvare.";
    saveMessage.className = "rts-message is-error";
    return;
  }

  populateForm(data);
  saveMessage.textContent = "✓ Salvato!";
  saveMessage.className = "rts-message is-success";
}

transportButtons.forEach(button => {
  button.addEventListener("click", () => {
    setTransport(button.dataset.transport);
  });
});

ratingButtons.forEach(button => {
  button.addEventListener("click", () => {
    setRating(button.dataset.rating);
  });
});

dateInput.addEventListener("change", () => {
  loadRecordForDate(dateInput.value);
});

departureInput.addEventListener("input", updateDuration);
arrivalInput.addEventListener("input", updateDuration);
form.addEventListener("submit", saveRecord);

dateInput.value = localToday();
loadRecordForDate(dateInput.value);

import { TIMEMACHINE_CONFIG as CFG } from './timemachine/config.js';

// La prima fase gestisce soltanto mappa, ricerca indirizzi e geolocalizzazione.
const $ = id => document.getElementById(id);
const status = $('tm-address-feedback');
let map;
let radiusCircle;
let currentPosition = null;
let lastGeocodeTime = 0;
let addressBusy = false;

function feedback(message, error = false) {
  status.textContent = message;
  status.classList.toggle('tm-error', error);
}

function showLocationAlert(title, message) {
  $('tm-alert-title').textContent = title;
  $('tm-alert-text').textContent = message;
  $('tm-location-alert').hidden = false;
}
function hideLocationAlert() {
  $('tm-location-alert').hidden = true;
  $('tm-help-text').hidden = true;
}

function getRadius() {
  const stored = Number(localStorage.getItem('atralab_timemachine_radius'));
  return CFG.raggi.includes(stored) ? stored : CFG.raggioDefault;
}

function initRadius() {
  const select = $('tm-radius');
  CFG.raggi.forEach(radius => {
    const option = document.createElement('option');
    option.value = radius;
    option.textContent = `${radius} m`;
    select.appendChild(option);
  });
  select.value = String(getRadius());
  select.addEventListener('change', () => {
    localStorage.setItem('atralab_timemachine_radius', select.value);
    updateCircle();
  });
}

function updateCircle() {
  if (!map || !radiusCircle) return;
  radiusCircle.setLatLng(map.getCenter());
  radiusCircle.setRadius(Number($('tm-radius').value));
}

function initMap() {
  if (!window.L) {
    showLocationAlert('Mappa non disponibile', 'Impossibile caricare Leaflet. Controlla la connessione e ricarica la pagina.');
    return;
  }
  map = L.map('tm-map', { zoomControl: true, scrollWheelZoom: false })
    .setView([41.9, 12.5], CFG.zoomInizialeSenzaPosizione);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
  }).addTo(map);
  radiusCircle = L.circle(map.getCenter(), {
    radius: getRadius(), color: '#426c91', weight: 2,
    fillColor: '#426c91', fillOpacity: 0.08, interactive: false
  }).addTo(map);
  map.on('move', updateCircle);
  map.whenReady(() => setTimeout(() => map.invalidateSize(), 0));
}

function locate() {
  if (!navigator.geolocation) {
    showLocationAlert('Posizione non supportata', 'Questo browser non supporta la geolocalizzazione. Puoi cercare un indirizzo.');
    return;
  }
  $('tm-locate').disabled = true;
  navigator.geolocation.getCurrentPosition(
    position => {
      $('tm-locate').disabled = false;
      currentPosition = [position.coords.latitude, position.coords.longitude];
      if (map) map.setView(currentPosition, CFG.zoomInizialeConPosizione);
      hideLocationAlert();
    },
    error => {
      $('tm-locate').disabled = false;
      const denied = error.code === 1;
      showLocationAlert(
        denied ? 'Posizione non autorizzata' : 'Posizione non disponibile',
        denied
          ? 'Consenti la posizione nelle impostazioni del browser oppure cerca un luogo manualmente.'
          : 'Non siamo riusciti a determinare la posizione. Puoi riprovare o cercare un luogo manualmente.'
      );
    },
    { enableHighAccuracy: false, timeout: CFG.geolocationTimeoutMs, maximumAge: 120000 }
  );
}

function showAddressResults(places) {
  const host = $('tm-address-results');
  host.replaceChildren();
  if (!places.length) {
    host.hidden = true;
    feedback('Nessun luogo trovato. Prova con un indirizzo più preciso.', true);
    return;
  }
  places.forEach(place => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tm-place-option';
    button.textContent = place.display_name;
    button.addEventListener('click', () => {
      const lat = Number(place.lat);
      const lon = Number(place.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        map?.setView([lat, lon], 17);
        feedback('Luogo selezionato. Puoi spostare il mirino o cambiare il raggio.');
      }
      $('tm-address').value = place.display_name;
      host.hidden = true;
    });
    host.appendChild(button);
  });
  host.hidden = false;
  feedback('Scegli uno dei luoghi trovati.');
}

async function searchAddress(event) {
  event.preventDefault();
  if (addressBusy) return;
  const query = $('tm-address').value.trim();
  if (query.length < 3) return feedback('Inserisci almeno tre caratteri.', true);
  if (Date.now() - lastGeocodeTime < CFG.nominatumMinIntervalMs) {
    return feedback('Attendi un momento prima di ripetere la ricerca.', true);
  }
  addressBusy = true;
  lastGeocodeTime = Date.now();
  $('tm-address-button').disabled = true;
  feedback('Cerco il luogo...');
  $('tm-address-results').hidden = true;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '0', limit: String(CFG.nominatimLimit), 'accept-language': 'it' });
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    showAddressResults(Array.isArray(data) ? data : []);
  } catch (e) {
    feedback('Ricerca indirizzo temporaneamente non disponibile. Riprova più tardi.', true);
    console.warn('TimeMachine: ricerca indirizzo', e);
  } finally {
    addressBusy = false;
    $('tm-address-button').disabled = false;
  }
}

function boot() {
  initRadius();
  initMap();
  $('tm-address-form').addEventListener('submit', searchAddress);
  $('tm-locate').addEventListener('click', locate);
  $('tm-retry-location').addEventListener('click', locate);
  $('tm-location-help').addEventListener('click', () => {
    const help = $('tm-help-text');
    help.hidden = !help.hidden;
  });
  // Nessuna interrogazione automatica degli archivi in questa prima versione.
  locate();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

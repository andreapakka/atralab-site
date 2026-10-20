import { TIMEMACHINE_CONFIG as CFG } from './timemachine/config.js';
import { searchCommons } from './timemachine/commons.js';
import { searchICCD } from './timemachine/iccd.js';
import { searchGallica } from './timemachine/gallica.js';
import { searchEuropeana } from './timemachine/europeana.js';
import { searchHarvard } from './timemachine/harvard.js';


// La prima fase gestisce soltanto mappa, ricerca indirizzi e geolocalizzazione.
const $ = id => document.getElementById(id);
const status = $('tm-address-feedback');
let map;
let radiusCircle;
let currentPosition = null;
let lastGeocodeTime = 0;
let addressBusy = false;
let monumentsBusy = false;
let monumentMarkers;
let activeItems=[];
let photosByPlace=new Map();
let selectedPlace=null;
let searchId=0;
const SOURCE_RUNNERS={commons:searchCommons,iccd:searchICCD,gallica:searchGallica,europeana:searchEuropeana,harvard:searchHarvard};


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
  monumentMarkers = L.layerGroup().addTo(map);
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


// Fase 2: Wikipedia GeoSearch (punti) + Wikidata (tipologia).
const MONUMENT_TERMS = /fontana|piazza|chiesa|basilica|cattedrale|duomo|obelisco|monumento|palazzo|castello|ponte|teatro|museo|villa|torre|arco|tempio|abbazia|convento|scalinata|santuario|anfiteatro|archaeological|church|fountain|square|palace|bridge|cathedral|museum|monument|castle/i;
const LOW_PRIORITY = /metropolitana|stazione|fermata|ferrovia|ristorante|scuola|discoteca|quartiere|municipio|comune|citta metropolitana|provincia/i;
const HISTORIC_TYPES = /fontana|piazza|chiesa|basilica|cattedrale|obelisco|monumento|palazzo|castello|ponte|teatro|museo|villa|torre|arco|tempio|abbazia|convento|scalinata|santuario|amphitheatre|fountain|square|church|palace|bridge|monument|museum|castle/i;
const ADMIN_TYPES = /comune|provincia|quartiere|municipio|regione|distretto|citta metropolitana|city|municipality|administrative|borough|province|region/i;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, a1 = lat1 * rad, a2 = lat2 * rad;
  const dlat = (lat2 - lat1) * rad, dlon = (lon2 - lon1) * rad;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dlon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

async function wikiJSON(params, base='https://it.wikipedia.org/w/api.php') {
  const u = new URL(base);
  u.search = new URLSearchParams({...params, format:'json', origin:'*'});
  const response = await fetch(u);
  if (!response.ok) throw new Error(`Wikipedia/Wikidata HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.info || 'Errore API');
  return data;
}

async function findMonuments(center, radius, maxCount) {
  const [lat, lon] = center;
  const geo = await wikiJSON({
    action:'query', generator:'geosearch', ggscoord:`${lat}|${lon}`,
    ggsradius:String(radius), ggslimit:'100',
    prop:'pageprops|coordinates', ppprop:'wikibase_item', colimit:'max'
  });
  const places = Object.values(geo.query?.pages || {}).flatMap(page => {
    const pos = page.coordinates?.[0];
    if (!pos || !page.pageprops?.wikibase_item) return [];
    const meters = haversineMeters(lat,lon,pos.lat,pos.lon);
    if (meters > radius) return [];
    return [{ id:page.pageprops.wikibase_item, name:page.title, lat:pos.lat, lon:pos.lon, meters }];
  });
  if (!places.length) return [];
  const ids = [...new Set(places.map(p => p.id))];
  const types = new Map();
  for (let i=0; i<ids.length; i+=40) {
    const wd = await wikiJSON({
      action:'wbgetentities', ids:ids.slice(i,i+40).join('|'),
      props:'claims|labels', languages:'it|en'
    },'https://www.wikidata.org/w/api.php');
    Object.entries(wd.entities || {}).forEach(([id,e]) => {
      types.set(id, (e.claims?.P31 || []).map(c=>c.mainsnak?.datavalue?.value?.id).filter(Boolean));
    });
  }
  const typeIds = [...new Set([...types.values()].flat())];
  const labels = new Map();
  for(let i=0;i<typeIds.length;i+=40) {
    const wd = await wikiJSON({action:'wbgetentities',ids:typeIds.slice(i,i+40).join('|'),props:'labels',languages:'it|en'},'https://www.wikidata.org/w/api.php');
    Object.entries(wd.entities||{}).forEach(([id,e])=>labels.set(id,e.labels?.it?.value || e.labels?.en?.value || ''));
  }
  return places.map(p=>{
    const typeNames=(types.get(p.id)||[]).map(id=>labels.get(id)||'').join(' ');
    const isAdmin=ADMIN_TYPES.test(typeNames);
    const named=MONUMENT_TERMS.test(p.name);
    const typed=HISTORIC_TYPES.test(typeNames);
    const poor=LOW_PRIORITY.test(p.name);
    return {...p, typeNames, score:(typed?5:0)+(named?3:0)-(isAdmin?9:0)-(poor?5:0)};
  }).filter(p=>p.score>0)
    .sort((a,b)=>b.score-a.score || a.meters-b.meters)
    .slice(0,maxCount);
}

function renderMonuments(items, radius) {
  const section=$('tm-monuments'), grid=$('tm-monument-grid');
  grid.replaceChildren();
  monumentMarkers?.clearLayers();
  section.hidden=false;
  $('tm-monuments-summary').textContent=items.length
    ? `${items.length} luoghi selezionati nel raggio di ${radius} m. Clicca su un luogo per individuarlo sulla mappa.`
    : `Nessun monumento catalogato trovato entro ${radius} m. Prova a spostare la mappa oppure aumenta il raggio.`;
  activeItems=items;
  items.forEach((item,i)=>{
    const number=i+1;
    const marker=L.marker([item.lat,item.lon], {icon:L.divIcon({
      className:'', html:`<span class="tm-monument-marker">${number}</span>`,
      iconSize:[26,26], iconAnchor:[13,13]
    })}).addTo(monumentMarkers);
    marker.bindPopup(document.createTextNode(`${item.name} (${item.meters} m)`));
    const button=document.createElement('button');
    button.type='button'; button.className='tm-monument';
    const numberEl=document.createElement('span'); numberEl.className='tm-monument-number'; numberEl.textContent=number;
    const copy=document.createElement('span'); copy.className='tm-monument-copy';
    const name=document.createElement('strong'); name.textContent=item.name;
    const sub=document.createElement('small'); sub.textContent=`${item.meters} m dal centro della ricerca`;
    copy.append(name,sub); button.append(numberEl,copy);
    button.addEventListener('click',()=>{ marker.openPopup(); selectPhotoPlace(item.id); });
    grid.append(button);
  });
}

function showExplorer() {
  $('tm-workspace').hidden=false;
  $('tm-results').hidden=true;
  setTimeout(()=>map?.invalidateSize(),60);
  $('tm-workspace').scrollIntoView({behavior:'smooth',block:'start'});
}
function showResults(){
  $('tm-results').hidden=false;
  $('tm-workspace').hidden=true;
  $('tm-results').scrollIntoView({behavior:'smooth',block:'start'});
}
function uniquePhotos(items) {
  const seen=new Set();
  return items.filter(x=>{
    const key=(x.imageUrl||x.thumbnailUrl||x.sourceId).toLowerCase();
    if(seen.has(key))return false;seen.add(key);return true;
  }).sort((a,b)=>{
    const yr=x=>Number(x.date.match(/\d{4}/)?.[0]||9999);
    return yr(a)-yr(b);
  });
}
function makeEl(tag,cls,textValue){const el=document.createElement(tag);if(cls)el.className=cls;if(textValue!==undefined)el.textContent=textValue;return el;}
function renderPhotoCards(placeId,all=false){
  const host=$('tm-photo-grid');host.replaceChildren();
  const items=photosByPlace.get(placeId)||[];
  const visible=all?items:items.slice(0,CFG.fotoPerMonumento);
  $('tm-photo-count').textContent=items.length?`${items.length} fotografie recuperate`:'Nessuna fotografia confermata per questo luogo.';
  for(const item of visible){
    const card=makeEl('button','tm-photo-card');card.type='button';
    const img=makeEl('img');img.src=item.thumbnailUrl;img.loading='lazy';img.alt=item.title;
    img.onerror=()=>{img.hidden=true;card.classList.add('tm-image-missing');};
    const title=makeEl('strong','',item.title);const date=makeEl('small','',item.date);
    card.append(img,title,date);card.addEventListener('click',()=>openLightbox(placeId,item));host.append(card);
  }
  const more=$('tm-show-more');more.hidden=all||items.length<=CFG.fotoPerMonumento;
  more.onclick=()=>renderPhotoCards(placeId,true);
}
function selectPhotoPlace(id){
  selectedPlace=id;
  const place=activeItems.find(p=>p.id===id);if(!place)return;
  $('tm-selected-name').textContent=place.name;
  for(const b of $('tm-place-tabs').querySelectorAll('button'))b.classList.toggle('tm-active',b.dataset.id===id);
  renderPhotoCards(id);
}
function renderPlaceTabs(){
  const host=$('tm-place-tabs');host.replaceChildren();
  const valid=activeItems.filter(p=>(photosByPlace.get(p.id)||[]).length);
  for(const place of valid){
    const button=makeEl('button','tm-place-tab',place.name);
    button.type='button';button.dataset.id=place.id;
    button.addEventListener('click',()=>selectPhotoPlace(place.id));host.append(button);
  }
  $('tm-no-results').hidden=valid.length>0;
  $('tm-photo-view').hidden=!valid.length;
  if(valid.length && !valid.some(p=>p.id===selectedPlace))selectedPlace=valid[0].id;
  if(selectedPlace && valid.length)selectPhotoPlace(selectedPlace);
}
function openLightbox(placeId,item){
  const lightbox=$('tm-lightbox');
  const list=photosByPlace.get(placeId)||[];
  let index=list.indexOf(item);
  const draw=()=>{
    const x=list[index];$('tm-lightbox-image').src=x.imageUrl||x.thumbnailUrl;
    $('tm-lightbox-image').alt=x.title;
    $('tm-lightbox-title').textContent=x.title;
    $('tm-lightbox-meta').textContent=[x.date,x.author].filter(Boolean).join(' · ');
    $('tm-lightbox-credit').textContent=`Archivio: ${x.source} · ${x.rights}`;
    $('tm-lightbox-original').href=x.sourceUrl;
  };
  const prev=()=>{index=(index+list.length-1)%list.length;draw();};
  const next=()=>{index=(index+1)%list.length;draw();};
  const close=()=>{lightbox.hidden=true;document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape')close();if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev();};
  $('tm-lightbox-close').onclick=close;
  $('tm-lightbox-prev').onclick=prev;$('tm-lightbox-next').onclick=next;
  lightbox.onclick=e=>{if(e.target===lightbox)close();};
  document.addEventListener('keydown',onKey);
  lightbox.hidden=false;draw();
}
async function runOneSource(source,runner,items,token){
  const started=performance.now();const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),CFG.timeoutFonteMs);
  let found=0,valid=0,status='success';
  try{
    // Interrogazioni sequenziali per luogo all'interno della singola fonte.
    for(const place of items){
      if(controller.signal.aborted||token!==searchId)break;
      try{
        const photos=await runner({...place,city:''},{signal:controller.signal,limit:CFG.risultatiPerFonteLuogo,yearMax:CFG.annoMassimo,proxyUrl:CFG.europeanaProxyUrl});
        found+=photos.length;valid+=photos.length;
        const prior=photosByPlace.get(place.id)||[];
        photosByPlace.set(place.id,uniquePhotos(prior.concat(photos)));
        if(token===searchId){renderPlaceTabs();if(valid>0)showResults();}
      }catch(err){if(controller.signal.aborted)throw err;console.warn('TimeMachine fonte',source,err.message);status='error';}
    }
    if(!valid&&status==='success')status='empty';
  }catch(e){status=controller.signal.aborted?'timeout':'error';console.warn('TimeMachine fonte',source,e.message);}
  finally{clearTimeout(timeout);}
  const elapsed=Math.round(performance.now()-started);
  console.info(`TimeMachine: ${source}: ${status}, immagini ${valid}, ${elapsed} ms`);
  return {source,status,duration_ms:elapsed,results_found:found,results_valid:valid};
}
async function searchMonuments(){
  if(monumentsBusy||!map)return;
  monumentsBusy=true;const token=++searchId;
  const button=$('tm-search-photos'),note=$('tm-stage-note');
  const center=map.getCenter(),radius=Number($('tm-radius').value);
  const limit=CFG.maxMonumenti[radius]??3;
  button.disabled=true;button.textContent='Ricerca in corso...';
  $('tm-loading').hidden=false;$('tm-progress').textContent='Individuiamo i luoghi storici...';
  $('tm-monuments').hidden=true;monumentMarkers?.clearLayers();
  photosByPlace=new Map();selectedPlace=null;
  try{
    const items=await findMonuments([center.lat,center.lng],radius,limit);
    renderMonuments(items,radius);
    if(!items.length){note.textContent='Nessun luogo storico nel raggio scelto. Prova a spostare la mappa o ampliare il raggio.';return;}
    for(const p of items)photosByPlace.set(p.id,[]);
    $('tm-results-location').textContent=`${radius} metri · ${items.length} luoghi individuati`;
    $('tm-progress').textContent='Cerchiamo fotografie negli archivi...'; $('tm-results-state').textContent='Ricerca in corso: le fotografie arriveranno progressivamente.'; $('tm-results-state').textContent='Ricerca in corso: le fotografie arriveranno progressivamente.';
    const enabled=Object.entries(CFG.fonti).filter(([key,enabled])=>enabled&&SOURCE_RUNNERS[key]);
    let done=0;
    await Promise.allSettled(enabled.map(async ([key])=>{
      const r=await runOneSource(key,SOURCE_RUNNERS[key],items,token);
      done++;$('tm-progress').textContent=`Ricerca in corso · ${done} di ${enabled.length} raccolte completate`; $('tm-results-state').textContent=$('tm-progress').textContent;
      return r;
    }));
    renderPlaceTabs();showResults();
    const all=[...photosByPlace.values()].reduce((a,b)=>a+b.length,0);
    $('tm-progress').textContent=all?`Ricerca completata · ${all} fotografie recuperate`:'Ricerca completata · Nessuna fotografia verificata';
    $('tm-results-state').textContent=$('tm-progress').textContent;
    note.textContent='Ricerca completata. Puoi esplorare i risultati o modificarne l’area.';
  }catch(e){console.warn('TimeMachine monumenti',e);note.textContent='Ricerca temporaneamente non disponibile. Riprova.';$('tm-progress').textContent='Errore nella ricerca dei luoghi.';}
  finally{monumentsBusy=false;button.disabled=false;button.textContent='Cerca fotografie storiche';$('tm-loading').hidden=true;}
}

function boot() {
  initRadius();
  initMap();
  $('tm-address-form').addEventListener('submit', searchAddress);
  $('tm-search-photos').addEventListener('click', searchMonuments);
  $('tm-modify-search').addEventListener('click',showExplorer);
  $('tm-locate').addEventListener('click', locate);
  $('tm-retry-location').addEventListener('click', locate);
  $('tm-location-help').addEventListener('click', () => {
    const help = $('tm-help-text');
    help.hidden = !help.hidden;
  });
  // Nessuna interrogazione agli archivi fotografici in questa fase.
  locate();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

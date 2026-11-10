/* DogView Foto: caricamento locale o URL CORS, confronto, zoom e download.
   Non salva dati e non invia immagini ad ATRALAB. */
(function () {
  'use strict';
  const CFG = window.DOGVIEW_CONFIG;
  const VISION = window.DogViewVision;
  const $ = id => document.getElementById(id);
  const ui = {
    input: $('dv-file'), urlForm: $('dv-url-form'), url: $('dv-url'),
    status: $('dv-status'), empty: $('dv-empty'), result: $('dv-result'),
    orig: $('dv-original'), dog: $('dv-dog'), stage: $('dv-stage'),
    split: $('dv-split'), blur: $('dv-blur'), label: $('dv-name'), dimensions: $('dv-dimensions'),
    zoomIn: $('dv-zoom-in'), zoomOut: $('dv-zoom-out'), zoomReset: $('dv-zoom-reset'),
    download: $('dv-download'), newer: $('dv-new')
  };
  let sourceImage = null, fileName = 'dogview', transparent = false;
  let revision = 0, busy = false;
  let zoom = 1, panX = 0, panY = 0;
  const pointers = new Map();
  let gesture = null;
  function status(message, isError = false) {
    ui.status.textContent = message;
    ui.status.style.color = isError ? '#ff9c94' : '#ffbf92';
  }
  function setBusy(value) {
    busy = value;
    [ui.input, ui.url, ui.download, ui.blur].forEach(el => { el.disabled = value; });
    ui.urlForm.querySelector('button').disabled = value;
  }
  function waitPaint() { return new Promise(resolve => setTimeout(resolve, 25)); }
  function clearSource() {
    if (sourceImage) { URL.revokeObjectURL(sourceImage.url); sourceImage = null; }
  }
  function reset() {
    revision++; clearSource();
    ui.input.value = ''; ui.url.value = '';
    ui.empty.hidden = false; ui.result.hidden = true;
    ui.blur.checked = true; ui.split.value = String(CFG.initialSplit);
    setSplit(CFG.initialSplit); zoom = 1; panX = 0; panY = 0; applyZoom();
    status('');
  }
  function canvasForImage(image, limitSide, limitPixels) {
    const w = image.naturalWidth, h = image.naturalHeight;
    const ratio = Math.min(1, limitSide / Math.max(w,h), Math.sqrt(limitPixels / (w*h)));
    const width = Math.max(1, Math.round(w*ratio));
    const height = Math.max(1, Math.round(h*ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', {alpha:true});
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image,0,0,width,height);
    return canvas;
  }
  async function decodeBlob(blob, name, token) {
    if (blob.size > CFG.sourceMaxMB * 1024 * 1024) throw new Error(`Immagine troppo grande (massimo ${CFG.sourceMaxMB} MB).`);
    const contentType = (blob.type || '').toLowerCase().split(';')[0];
    if (!['image/jpeg','image/png','image/webp'].includes(contentType)) throw new Error('Formato non supportato. Usa JPG, PNG o WebP.');
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Impossibile leggere questa immagine.'));
      });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Immagine non valida.');
      if (token !== revision) { URL.revokeObjectURL(url); return; }
      clearSource();
      sourceImage = {image, url};
      fileName = (name || 'dogview').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,75) || 'dogview';
      transparent = contentType !== 'image/jpeg';
      await renderPreview(token);
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
  async function loadBlob(blob, name) {
    if (busy) return;
    const token = ++revision;
    setBusy(true); status('Elaborazione foto…'); await waitPaint();
    try {
      await decodeBlob(blob, name, token);
    } catch (err) {
      if (token === revision) status(err.message || 'Immagine non disponibile.', true);
    } finally {
      if (token === revision) setBusy(false);
    }
  }
  async function renderPreview(token) {
    if (!sourceImage || token !== revision) return;
    const image = sourceImage.image;
    const src = canvasForImage(image, CFG.previewMaxSide, CFG.previewMaxSide * CFG.previewMaxSide);
    ui.orig.width = src.width; ui.orig.height = src.height;
    ui.orig.getContext('2d').drawImage(src,0,0);
    VISION.render(src, ui.dog, ui.blur.checked, CFG);
    ui.stage.style.aspectRatio = `${src.width} / ${src.height}`;
    ui.empty.hidden = true; ui.result.hidden = false;
    ui.label.textContent = fileName;
    ui.dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    zoom = 1; panX = 0; panY = 0; applyZoom(); setSplit(Number(ui.split.value));
    status('Foto pronta. Confronta e scarica quando vuoi.');
  }
  function setSplit(value) {
    const n = Math.max(0, Math.min(100, value));
    ui.stage.style.setProperty('--split', `${n}%`);
    ui.split.value = String(n);
  }
  function applyZoom() {
    const transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
    ui.orig.style.transform = transform;
    ui.dog.style.transform = transform;
  }
  function setZoom(value) {
    zoom = Math.max(1,Math.min(CFG.maxZoom,value));
    if (zoom === 1) {panX = 0;panY = 0;}
    applyZoom();
  }
  function pointerDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function pointerMid(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
  function getClientPoint(event){return {x:event.clientX,y:event.clientY};}
  ui.stage.addEventListener('pointerdown', event => {
    if (!sourceImage) return;
    event.preventDefault();
    ui.stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,getClientPoint(event));
    const rect = ui.stage.getBoundingClientRect();
    if (pointers.size === 1) {
      const splitX = rect.left + rect.width*Number(ui.split.value)/100;
      const nearDivider = Math.abs(event.clientX - splitX) < (event.pointerType === 'touch' ? 42 : 24);
      gesture = {type: nearDivider || zoom <= 1 ? 'split' : 'pan', x:event.clientX,y:event.clientY,panX,panY};
    } else if (pointers.size === 2) {
      const [a,b] = [...pointers.values()];
      gesture = {type:'pinch', distance:pointerDistance(a,b),zoom,mid:pointerMid(a,b),panX,panY};
    }
  });
  ui.stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId,getClientPoint(event));
    if (!gesture) return;
    if (pointers.size === 2 && gesture.type === 'pinch') {
      const [a,b] = [...pointers.values()];
      const newZoom = Math.max(1,Math.min(CFG.maxZoom,gesture.zoom * pointerDistance(a,b)/Math.max(1,gesture.distance)));
      const mid = pointerMid(a,b);
      panX = gesture.panX + (mid.x-gesture.mid.x);
      panY = gesture.panY + (mid.y-gesture.mid.y);
      zoom = newZoom;
      if (zoom === 1) {panX=0;panY=0;}
      applyZoom();
    } else if (pointers.size === 1 && gesture.type === 'split') {
      const rect = ui.stage.getBoundingClientRect();
      setSplit((event.clientX - rect.left) / rect.width * 100);
    } else if (pointers.size === 1 && gesture.type === 'pan') {
      panX = gesture.panX + event.clientX - gesture.x;
      panY = gesture.panY + event.clientY - gesture.y;
      applyZoom();
    }
  });
  function pointerEnd(event){
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      gesture = {type:zoom>1?'pan':'split',x:p.x,y:p.y,panX,panY};
    } else if (pointers.size === 0) gesture = null;
  }
  ui.stage.addEventListener('pointerup',pointerEnd);
  ui.stage.addEventListener('pointercancel',pointerEnd);
  ui.split.addEventListener('input',()=>setSplit(Number(ui.split.value)));
  ui.zoomIn.addEventListener('click',()=>setZoom(zoom*1.35));
  ui.zoomOut.addEventListener('click',()=>setZoom(zoom/1.35));
  ui.zoomReset.addEventListener('click',()=>{panX=0;panY=0;setZoom(1);});
  ui.stage.addEventListener('wheel',event=>{
    if(!sourceImage)return;
    event.preventDefault(); setZoom(zoom*(event.deltaY<0?1.12:1/1.12));
  },{passive:false});
  ui.input.addEventListener('change',()=>{const f=ui.input.files && ui.input.files[0];if(f)loadBlob(f,f.name);});
  ui.urlForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if (busy) return;
    let url;
    try {url = new URL(ui.url.value.trim()); if(!['https:','http:'].includes(url.protocol))throw Error();}
    catch {status('Inserisci un indirizzo HTTP o HTTPS valido.',true);return;}
    setBusy(true);status('Caricamento immagine online…');
    const token = ++revision;
    try {
      const response=await fetch(url.href,{mode:'cors',credentials:'omit',redirect:'follow'});
      if(!response.ok)throw new Error(`Immagine non disponibile (HTTP ${response.status}).`);
      const headerLength=Number(response.headers.get('content-length')||0);
      if(headerLength>CFG.sourceMaxMB*1024*1024)throw new Error('Immagine troppo grande.');
      const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error('L’URL deve restituire direttamente un file JPG, PNG o WebP.');
      const blob=await response.blob();
      if(token===revision)await decodeBlob(blob,url.pathname.split('/').pop()||'foto-online',token);
    } catch(err){if(token===revision) status(err instanceof TypeError?'Il sito non consente la lettura dell’immagine (CORS). Scaricala e caricala dal dispositivo.':err.message,true);}
    finally{if(token===revision)setBusy(false);}
  });
  ui.blur.addEventListener('change',async()=>{
    if(!sourceImage || busy)return;
    setBusy(true);status('Aggiornamento simulazione…');await waitPaint();
    try {
      const src=document.createElement('canvas');src.width=ui.orig.width;src.height=ui.orig.height;
      src.getContext('2d').drawImage(ui.orig,0,0);
      VISION.render(src,ui.dog,ui.blur.checked,CFG);
      status('Simulazione aggiornata.');
    }catch(err){status('Impossibile aggiornare la simulazione.',true);}
    finally{setBusy(false);}
  });
  ui.newer.addEventListener('click',reset);
  ui.download.addEventListener('click',async()=>{
    if(!sourceImage||busy)return;
    setBusy(true);status('Preparazione download…');await waitPaint();
    try{
      const src=canvasForImage(sourceImage.image,CFG.exportMaxSide,CFG.exportMaxPixels);
      const dest=document.createElement('canvas');
      VISION.render(src,dest,ui.blur.checked,CFG);
      const mime=transparent?'image/png':'image/jpeg';
      const blob=await new Promise((resolve,reject)=>dest.toBlob(b=>b?resolve(b):reject(new Error('Impossibile preparare il file.')),mime,CFG.jpegQuality));
      const link=document.createElement('a');
      const url=URL.createObjectURL(blob);
      link.href=url; link.download=`${fileName}-dogview.${transparent?'png':'jpg'}`;
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      status('Download avviato. Su iPhone puoi usare anche Condividi / Salva immagine dalla schermata del browser.');
    }catch(err){status('Download non riuscito: prova con una fotografia più piccola.',true);}
    finally{setBusy(false);}
  });
  reset();
})();

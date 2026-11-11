/* DogView Cloud V1.1: upload automatico non bloccante della sola foto elaborata.
   Nessun token segreto nel client. Il caricamento richiede Turnstile e connessione.
   Attivazione: /dogview/config.js -> autoSaveSupabase.
*/
(function () {
  'use strict';
  const CFG = window.DOGVIEW_CONFIG;
  const MAX_BYTES = 10 * 1024 * 1024;
  let scriptPromise = null;
  let inFlight = 0;

  const privacy = document.getElementById('dv-privacy');
  if (privacy && !CFG.autoSaveSupabase) {
    privacy.textContent = 'Le fotografie vengono elaborate soltanto nel browser e non sono inviate ad ATRALAB.';
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      const timer = setTimeout(() => reject(new Error('Turnstile non disponibile')), 15000);
      script.onload = () => { clearTimeout(timer); window.turnstile ? resolve() : reject(new Error('Turnstile non avviato')); };
      script.onerror = () => { clearTimeout(timer); reject(new Error('Caricamento Turnstile non riuscito')); };
      document.head.appendChild(script);
    }).catch(error => { scriptPromise = null; throw error; });
    return scriptPromise;
  }

  function acquireToken() {
    return new Promise((resolve, reject) => {
      const host = document.createElement('div');
      // Il widget rimane discreto. Se Cloudflare richiede interazione, deve essere visibile.
      host.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:10000';
      document.body.appendChild(host);
      let id = null;
      let finished = false;
      const cleanup = () => {
        clearTimeout(timer);
        if (id !== null) { try { window.turnstile.remove(id); } catch (_) {} }
        host.remove();
      };
      const finish = (error, token) => {
        if (finished) return;
        finished = true;
        cleanup();
        error ? reject(error) : resolve(token);
      };
      const timer = setTimeout(() => finish(new Error('Verifica scaduta')), 30000);
      try {
        id = window.turnstile.render(host, {
          sitekey: CFG.turnstileSiteKey,
          action: 'dogview_upload',
          theme: 'dark',
          execution: 'execute',
          appearance: 'interaction-only',
          callback: token => finish(null, token),
          'error-callback': () => finish(new Error('Verifica non riuscita')),
          'expired-callback': () => finish(new Error('Verifica scaduta')),
        });
        window.turnstile.execute(id);
      } catch (error) { finish(error); }
    });
  }

  function canvasForUpload(image) {
    const w = image.naturalWidth, h = image.naturalHeight;
    const factor = Math.min(1, CFG.exportMaxSide / Math.max(w, h), Math.sqrt(CFG.exportMaxPixels / (w * h)));
    const src = document.createElement('canvas');
    src.width = Math.max(1, Math.round(w * factor));
    src.height = Math.max(1, Math.round(h * factor));
    src.getContext('2d', {alpha: true}).drawImage(image, 0, 0, src.width, src.height);
    const result = document.createElement('canvas');
    window.DogViewVision.render(src, result, this.withBlur, CFG);
    // Storage accetta solo JPG: compone l'eventuale trasparenza sul bianco.
    const jpg = document.createElement('canvas');
    jpg.width = result.width;
    jpg.height = result.height;
    const ctx = jpg.getContext('2d', {alpha:false});
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, jpg.width, jpg.height);
    ctx.drawImage(result, 0, 0);
    return jpg;
  }

  function jpegBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('JPEG non disponibile')), 'image/jpeg', quality
    ));
  }

  async function encodeImage(image, withBlur) {
    const canvas = canvasForUpload.call({withBlur}, image);
    for (const quality of [CFG.jpegQuality, 0.82, 0.68, 0.52]) {
      const blob = await jpegBlob(canvas, quality);
      if (blob.size <= MAX_BYTES) return blob;
    }
    throw new Error('Foto troppo grande per lo Storage');
  }

  async function save(image, withBlur) {
    if (!CFG.autoSaveSupabase || !navigator.onLine || inFlight >= 2 || !image) return;
    inFlight++;
    try {
      if (location.protocol !== 'https:') return;
      // Lascia il browser completare prima le operazioni di disegno della pagina.
      await new Promise(resolve => {
        if ('requestIdleCallback' in window) requestIdleCallback(resolve, {timeout: 1500});
        else setTimeout(resolve, 100);
      });
      if (!navigator.onLine) return;
      const blob = await encodeImage(image, withBlur);
      if (!navigator.onLine) return;
      await loadTurnstile();
      const token = await acquireToken();
      if (!navigator.onLine) return;
      const form = new FormData();
      form.append('turnstileToken', token);
      form.append('file', blob, 'dogview.jpg');
      const response = await fetch(CFG.uploadEndpoint, {
        method: 'POST',
        body: form,
        mode: 'cors',
        credentials: 'omit',
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error(`Upload DogView: HTTP ${response.status}`);
    } catch (error) {
      // Il salvataggio cloud non deve alterare UI, download o elaborazione locale.
      console.warn('DogView: salvataggio cloud non riuscito (la foto locale resta disponibile).', error);
    } finally {
      inFlight--;
    }
  }

  window.DogViewCloud = Object.freeze({save});
})();

// SnapText V1 — una sola istanza PaddleOCR per l'intero lotto.
// L'SDK gestisce il proprio Worker: il nostro paddle-worker.js NON va utilizzato.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';
const LOAD_TIMEOUT_MS = 600_000;
const PREDICT_TIMEOUT_MS = 180_000;

export function createPaddleSession({
  onProgress = () => {}, isCancelled = () => false, setCancel = () => {}
} = {}) {
  let closed = false;
  let closingReason = null;
  let engine = null;
  let creation = null;
  let pending = null;
  let languageInUse = null;

  const cancelledError = () => new Error('Elaborazione annullata.');
  const dispose = instance => {
    if (!instance) return;
    try {
      // dispose() e' asincrono nell'SDK; non bloccare la UI attendendolo.
      Promise.resolve(instance.dispose?.()).catch(err =>
        console.warn('SnapText Paddle: errore durante la chiusura:', err));
    } catch (err) { console.warn('SnapText Paddle: chiusura:', err); }
  };

  function close(reason = cancelledError()) {
    if (closed) return;
    closed = true;
    closingReason = reason;
    if (pending) {
      const active = pending;
      pending = null;
      clearTimeout(active.timer);
      active.reject(reason);
    }
    dispose(engine);
    engine = null;
    // Se la creazione e' ancora in corso, rilascera' la sua istanza appena pronta.
    setCancel(null);
  }

  async function initialize(language) {
    if (engine) return engine;
    if (!creation) {
      languageInUse = language;
      creation = (async () => {
        onProgress('PaddleOCR: caricamento libreria…');
        const {PaddleOCR} = await import(SDK_URL);
        if (closed) throw closingReason;
        onProgress('PaddleOCR: caricamento modelli… può richiedere diversi minuti.');
        // Usa il Worker *interno* di PaddleOCR.js, non l'SDK dentro un Worker esterno.
        const options = {
          lang: language,
          ocrVersion: 'PP-OCRv6',
          ortOptions: {backend: 'wasm', numThreads: 1}
        };
        let instance;
        try {
          instance = await PaddleOCR.create({...options, worker: true});
        } catch (error) {
          // L'import +esm da CDN potrebbe non risolvere il bundle Worker.
          // Ripiega sul motore diretto solo per errori specifici del Worker:
          // non ripetere download lenti, timeout o altri guasti dei modelli.
          const detail = String(error?.message || error);
          if (!/worker|worker-entry|cross.origin|securityerror|failed to fetch dynamically imported module/i.test(detail))
            throw error;
          if (closed) throw closingReason;
          console.warn('SnapText Paddle: Worker SDK non disponibile dal CDN; modalità diretta:', error);
          onProgress('PaddleOCR: Worker SDK non disponibile, caricamento in modalità compatibile…');
          instance = await PaddleOCR.create(options);
        }
        if (closed) { dispose(instance); throw closingReason; }
        engine = instance;
        return instance;
      })();
    }
    return creation;
  }

  async function run(file, language) {
    if (languageInUse && language !== languageInUse)
      throw new Error('PaddleOCR: lingua diversa durante la stessa elaborazione.');
    const instance = await initialize(language);
    if (closed || isCancelled()) throw closingReason || cancelledError();
    onProgress('PaddleOCR: riconoscimento della fotografia…');
    const results = await instance.predict(file);
    if (closed || isCancelled()) throw closingReason || cancelledError();
    const items = results?.[0]?.items;
    if (!Array.isArray(items)) throw new Error('PaddleOCR: nessuna riga valida restituita.');
    return {text: items.map(item => item.text || '').join('\n'), lines: items.length};
  }

  function recognize(file, language) {
    if (closed) return Promise.reject(closingReason || cancelledError());
    if (pending) return Promise.reject(new Error('PaddleOCR: elaborazione già in corso.'));
    if (isCancelled()) { close(); return Promise.reject(closingReason); }
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`PaddleOCR: tempo massimo di ${creation && !engine ? '10 minuti per il caricamento' : '3 minuti per la fotografia'} superato.`);
        close(error);
      }, engine ? PREDICT_TIMEOUT_MS : LOAD_TIMEOUT_MS);
      pending = {reject, timer};
      run(file, language).then(data => {
        if (!pending || closed) return;
        clearTimeout(pending.timer);
        pending = null;
        resolve({...data, seconds: (performance.now() - started) / 1000});
      }, error => {
        if (!pending || closed) return;
        clearTimeout(pending.timer);
        pending = null;
        close(error);
        reject(error);
      });
    });
  }

  setCancel(() => close());
  return {recognize, close};
}

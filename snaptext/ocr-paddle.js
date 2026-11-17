// Una sessione PaddleOCR per l'intero lotto di fotografie.
// Il Worker e i modelli restano in memoria fra le pagine; Annulla termina il Worker.
const MAX_PADDLE_MS = 600_000; // limite per ogni richiesta (inizializzazione inclusa)

export function createPaddleSession({
  onProgress = () => {}, isCancelled = () => false, setCancel = () => {}
} = {}) {
  let worker = null;
  let pending = null;
  let closed = false;
  let failure = null;
  let sequence = 0;

  function close(reason = new Error('Elaborazione annullata')) {
    if (closed) return;
    closed = true;
    failure = reason;
    const current = pending;
    pending = null;
    if (current) {
      clearTimeout(current.timer);
      current.reject(reason);
    }
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
    setCancel(null);
  }

  function fail(error) {
    close(error instanceof Error ? error : new Error(String(error)));
  }

  try {
    worker = new Worker(new URL('./paddle-worker.js', import.meta.url), {type: 'module'});
    worker.onmessage = ({data}) => {
      const current = pending;
      if (!current || data?.id !== current.id) return;
      if (isCancelled()) return close();
      if (data.type === 'progress') { onProgress(data.message); return; }
      clearTimeout(current.timer);
      pending = null;
      if (data.type === 'success') {
        current.resolve({text: data.text, lines: data.lines,
          seconds: (performance.now() - current.started) / 1000});
      } else if (data.type === 'error') {
        const error = new Error(`PaddleOCR: ${data.message}`);
        current.reject(error);
        fail(error); // non ripetere un'inizializzazione fallita nelle pagine successive
      }
    };
    worker.onerror = event => {
      event.preventDefault();
      fail(new Error(`Worker PaddleOCR: ${event.message || 'errore sconosciuto'}`));
    };
    worker.onmessageerror = () => fail(new Error('Messaggio PaddleOCR non leggibile'));
    setCancel(() => close());
  } catch (error) { fail(error); }

  function recognize(file, language) {
    if (closed) return Promise.reject(failure || new Error('Sessione PaddleOCR chiusa'));
    if (pending) return Promise.reject(new Error('PaddleOCR: è già in corso una fotografia'));
    if (isCancelled()) { close(); return Promise.reject(failure); }
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const started = performance.now();
      const timer = setTimeout(() => fail(new Error('PaddleOCR: tempo massimo di 10 minuti superato')), MAX_PADDLE_MS);
      pending = {id, resolve, reject, timer, started};
      try {
        worker.postMessage({type: 'run', id, file, language});
      } catch (error) { fail(error); }
    });
  }

  return {recognize, close};
}

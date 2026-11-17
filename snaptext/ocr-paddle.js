// PaddleOCR in un Worker separato: Annulla interrompe davvero il task.
// La versione e i modelli rimangono quelli gia testati (PP-OCRv6 / 0.4.2).
const MAX_PADDLE_MS = 150_000; // limite di sicurezza per singola fotografia

export function recognizePaddle(file, language, {
  onProgress = () => {}, isCancelled = () => false, setCancel = () => {}
} = {}) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    if (isCancelled()) { reject(new Error('Elaborazione annullata')); return; }

    let worker;
    let timer;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setCancel(null);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
      }
      if (error) reject(error);
      else resolve({ ...result, seconds: (performance.now() - started) / 1000 });
    };

    try {
      worker = new Worker(new URL('./paddle-worker.js', import.meta.url), { type: 'module' });
      setCancel(() => finish(new Error('Elaborazione annullata')));
      worker.onmessage = ({ data }) => {
        if (settled) return;
        if (isCancelled()) return finish(new Error('Elaborazione annullata'));
        if (data?.type === 'progress') onProgress(data.message);
        else if (data?.type === 'success') finish(null, { text: data.text, lines: data.lines });
        else if (data?.type === 'error') finish(new Error(`PaddleOCR: ${data.message}`));
      };
      worker.onerror = event => {
        event.preventDefault();
        finish(new Error(`Worker PaddleOCR non avviato: ${event.message || 'errore sconosciuto'}`));
      };
      worker.onmessageerror = () => finish(new Error('Messaggio PaddleOCR non leggibile'));
      timer = setTimeout(() => finish(new Error('PaddleOCR: tempo massimo di 150 secondi superato')), MAX_PADDLE_MS);
      onProgress('PaddleOCR: avvio motore isolato… può richiedere diversi minuti.');
      worker.postMessage({ type: 'run', file, language });
    } catch (error) { finish(error); }
  });
}

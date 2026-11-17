// Worker dedicato PaddleOCR: non accede alla pagina e non salva dati.
// Può essere terminato dal thread principale anche durante PaddleOCR.create().
const report = message => self.postMessage({ type: 'progress', message });
self.onmessage = async ({ data }) => {
  if (data?.type !== 'run') return;
  try {
    report('PaddleOCR: caricamento libreria…');
    const { PaddleOCR } = await import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm');
    report('PaddleOCR: caricamento modelli…');
    const engine = await PaddleOCR.create({
      lang: data.language,
      ocrVersion: 'PP-OCRv6',
      ortOptions: { backend: 'wasm', numThreads: 1 }
    });
    report('PaddleOCR: riconoscimento della fotografia…');
    const result = await engine.predict(data.file);
    const items = result?.[0]?.items;
    if (!Array.isArray(items)) throw new Error('Nessuna riga valida restituita');
    self.postMessage({
      type: 'success',
      text: items.map(item => item.text || '').join('\n'),
      lines: items.length
    });
    // Il main thread termina il Worker al risultato, liberando le risorse.
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};

// Worker PaddleOCR unico per tutto il lotto; il motore rimane in memoria fra le foto.
// Non accede alla pagina e non salva dati; il thread principale può terminarlo.
let engine = null;
let engineLanguage = null;
let busy = false;
const report = (id, message) => self.postMessage({type: 'progress', id, message});

self.onmessage = async ({data}) => {
  if (data?.type !== 'run') return;
  const {id, file, language} = data;
  if (busy) {
    self.postMessage({type: 'error', id, message: 'Motore già impegnato'});
    return;
  }
  busy = true;
  try {
    if (!engine) {
      report(id, 'PaddleOCR: caricamento libreria…');
      const {PaddleOCR} = await import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm');
      report(id, 'PaddleOCR: caricamento modelli… può richiedere diversi minuti.');
      engine = await PaddleOCR.create({
        lang: language,
        ocrVersion: 'PP-OCRv6',
        ortOptions: {backend: 'wasm', numThreads: 1}
      });
      engineLanguage = language;
    }
    if (language !== engineLanguage) throw new Error('Lingua diversa nella stessa sessione');
    report(id, 'PaddleOCR: riconoscimento della fotografia…');
    const result = await engine.predict(file);
    const items = result?.[0]?.items;
    if (!Array.isArray(items)) throw new Error('Nessuna riga valida restituita');
    self.postMessage({
      type: 'success', id,
      text: items.map(item => item.text || '').join('\n'),
      lines: items.length
    });
  } catch (error) {
    self.postMessage({type: 'error', id, message: error?.message || String(error)});
  } finally {
    busy = false;
  }
};

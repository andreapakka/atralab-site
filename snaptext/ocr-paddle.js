// Adapter OCR 2: esattamente SDK/versione/config usati nel banco di prova approvato.
let sdkPromise;
export async function recognizePaddle(file, language, {onProgress=()=>{}, isCancelled=()=>false}={}) {
  const started=performance.now();let engine;
  try {
    onProgress('PaddleOCR: caricamento SDK...');
    sdkPromise ||= import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm');
    const {PaddleOCR}=await sdkPromise;
    if(isCancelled()) throw Error('Annullato');
    onProgress('PaddleOCR: caricamento modelli...');
    engine=await PaddleOCR.create({lang:language,ocrVersion:'PP-OCRv6',ortOptions:{backend:'wasm',numThreads:1}});
    if(isCancelled()) throw Error('Annullato');
    onProgress('PaddleOCR: riconoscimento...');
    const results=await engine.predict(file);
    if(isCancelled()) throw Error('Annullato');
    const items=results?.[0]?.items;
    if(!Array.isArray(items)) throw Error('PaddleOCR non ha restituito righe valide.');
    return {text:items.map(x=>x.text || '').join('\n'),lines:items.length,seconds:(performance.now()-started)/1000};
  } finally {
    try { await engine?.dispose?.(); await engine?.destroy?.(); } catch {}
  }
}

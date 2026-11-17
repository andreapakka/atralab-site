// Adapter OCR 1: Tesseract.js 7, una pagina/worker alla volta.
export async function recognizeTesseract(file, language, {onProgress=()=>{}, isCancelled=()=>false, setCancel=()=>{}}={}) {
  if (!window.Tesseract?.createWorker) throw Error('Tesseract.js non è disponibile.');
  const started=performance.now();
  let worker;
  try {
    worker=await window.Tesseract.createWorker(language === 'en' ? 'eng' : 'ita', 1, {
      logger: info => { if(info?.status) onProgress(`Tesseract: ${info.status}${typeof info.progress==='number' ? ` ${Math.round(info.progress*100)}%` : ''}`); }
    });
    setCancel(() => worker?.terminate());
    if (isCancelled()) throw Error('Annullato');
    const result=await worker.recognize(file);
    if(isCancelled()) throw Error('Annullato');
    return {text:result.data?.text || '', confidence:result.data?.confidence ?? null, seconds:(performance.now()-started)/1000};
  } finally {
    setCancel(null);
    try { await worker?.terminate(); } catch {} 
  }
}

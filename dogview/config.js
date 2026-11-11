/* DogView - configurazione pubblica. Nessuna chiave o dato privato. */
window.DOGVIEW_CONFIG = Object.freeze({
  previewMaxSide: 1600,
  exportMaxSide: 3200,
  exportMaxPixels: 12000000,
  sourceMaxMB: 30,
  jpegQuality: 0.92,
  referenceBlurPx: 0.73,
  referenceWidthPx: 1200,
  maxZoom: 5,
  initialSplit: 50,
  autoSaveSupabase: true, // CAMBIA QUI: true = salva online, false = nessun upload
  turnstileSiteKey: "0x4AAAAAAF8nNBc2hif9NrVl",
  uploadEndpoint: "https://pcpsbrnhfhzkjlnstgfr.supabase.co/functions/v1/dogview-upload"
});

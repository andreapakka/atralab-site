/* CoView V1 — parametri pubblici. Nessun segreto in questo file. */
window.COVIEW_CONFIG = Object.freeze({
  apiUrl: 'https://pcpsbrnhfhzkjlnstgfr.supabase.co/functions/v1/coview-api',
  pollMs: 2000,
  retryMs: 3500,
  apiTimeoutMs: 15000,
  connectTimeoutMs: 25000,
  jpegQuality: 0.84,
  maxPhotoBytes: 2 * 1024 * 1024,
  maxPhotoWidth: 1920,
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});
// La scadenza del codice è definita dall'Edge Function (CODE_MINUTES = 10), non dal browser.

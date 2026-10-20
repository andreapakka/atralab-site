// ATRALAB TimeMachine - valori modificabili in un unico punto.
export const TIMEMACHINE_CONFIG = Object.freeze({
  raggi: [50, 100, 250],
  raggioDefault: 50,
  maxMonumenti: { 50: 2, 100: 3, 250: 5 },
  fotoPerMonumento: 3,
  fotoPerPagina: 6,
  annoMassimo: 1960,
  timeoutFonteMs: 12000,
  risultatiPerFonteLuogo: 15,
  fonti: { commons: true, iccd: true, gallica: true, europeana: false, harvard: true },
  statistiche: false, // da abilitare solo dopo protezione effettiva dell'endpoint
  europeanaProxyUrl: '', // imposta solo dopo aver creato una Edge Function con chiave protetta
  risultatiProgressivi: true,
  geolocationTimeoutMs: 10000,
  nominatumMinIntervalMs: 1100, // limite conservativo per richieste manuali Nominatim
  nominatimLimit: 5,
  zoomInizialeConPosizione: 17,
  zoomInizialeSenzaPosizione: 3
});

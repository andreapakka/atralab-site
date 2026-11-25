// PhotoFit — parametri pubblici. La quota autorevole è photofit_config su Supabase.
window.PHOTOFIT_CONFIG = Object.freeze({
  supabaseUrl: 'https://pcpsbrnhfhzkjlnstgfr.supabase.co',
  supabasePublicKey: 'sb_publishable_IRKqtPwpSGWd-YbnyvXqsg_DFKZSotn',
  table: 'photofit_photos', bucket: 'photofit',
  resizeOnUpload: true, maxUploadWidth: 3000, maxUploadHeight: 3000,
  jpegQuality: 0.95, defaultDpi: 300, defaultUnit: 'cm', defaultWidth: 8, defaultHeight: 5,
  // Limiti tecnici del canvas di esportazione, non vincoli di proporzione.
  maxOutputSide: 8192, maxOutputPixels: 16000000,
  maxPhotoZoom: 30, maxViewZoom: 4, grid: true,
  quotaBytesFallback: 200 * 1024 * 1024, pageSize: 100, signedUrlSeconds: 3600
});

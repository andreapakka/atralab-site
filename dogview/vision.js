/* DogView - motore cromatico isolato. Machado 2009, deuteranopia 100%.
   Approssimazione della dicromia canina; non rappresenta percezione soggettiva esatta.
   Matrice su RGB lineare (non su RGB gamma-encoded):
   Machado et al. 2009, valori di severità 1.0.
*/
(function () {
  'use strict';
  const MATRIX = Object.freeze([
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501,  0.047413],
    [-0.011820, 0.042940, 0.968881]
  ]);
  const toLinear = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const n = i / 255;
    toLinear[i] = n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  }
  function toSRGB(n) {
    n = Math.max(0, Math.min(1, n));
    const s = n <= 0.0031308 ? 12.92 * n : 1.055 * Math.pow(n, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(s * 255)));
  }
  function transformPixel(r, g, b) {
    const R = toLinear[r], G = toLinear[g], B = toLinear[b];
    return [
      toSRGB(MATRIX[0][0] * R + MATRIX[0][1] * G + MATRIX[0][2] * B),
      toSRGB(MATRIX[1][0] * R + MATRIX[1][1] * G + MATRIX[1][2] * B),
      toSRGB(MATRIX[2][0] * R + MATRIX[2][1] * G + MATRIX[2][2] * B)
    ];
  }
  function transformImageData(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const c = transformPixel(d[i], d[i + 1], d[i + 2]);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      // Alpha invariato.
    }
    return imageData;
  }
  function render(sourceCanvas, targetCanvas, withBlur, config) {
    const w = sourceCanvas.width, h = sourceCanvas.height;
    targetCanvas.width = w; targetCanvas.height = h;
    const ctx = targetCanvas.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(sourceCanvas, 0, 0);
    const image = ctx.getImageData(0, 0, w, h);
    ctx.putImageData(transformImageData(image), 0, 0);
    if (withBlur && config.referenceBlurPx > 0) {
      const blur = config.referenceBlurPx * (w / config.referenceWidthPx);
      const buffer = document.createElement('canvas');
      buffer.width = w; buffer.height = h;
      const temp = buffer.getContext('2d');
      temp.drawImage(targetCanvas, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.filter = `blur(${blur.toFixed(3)}px)`;
      ctx.drawImage(buffer, 0, 0);
      ctx.filter = 'none';
    }
    return targetCanvas;
  }
  window.DogViewVision = Object.freeze({ MATRIX, transformPixel, transformImageData, render });
})();

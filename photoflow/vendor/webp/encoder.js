// PhotoFlow adapter for @jsquash/webp 1.5.0 (Apache-2.0).
// Use the baseline, non-SIMD build to maximize iOS compatibility.
import factory from './webp_enc.js';
import { defaultOptions } from './meta.js';
let pending;
export async function encodeWebP(canvas, quality) {
  if (!pending) pending = factory({noInitialRun:true}).catch(error => {pending=undefined; throw error;});
  const module = await pending;
  const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
  const result = module.encode(pixels.data,pixels.width,pixels.height,{...defaultOptions,quality:quality*100,low_memory:1});
  if (!result || !result.byteLength) throw new Error('Codifica WebP non riuscita.');
  return new Blob([result],{type:'image/webp'});
}

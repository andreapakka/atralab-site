// Native WebP first; local WASM fallback only when native encoding is unavailable.
let pfWebpFallback=false;
let pfWebpModule;
async function pfEncodeWebP(canvas,quality){
  if(!pfWebpFallback){
    let blob;
    try{blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));}catch{}
    if(blob && blob.type==='image/webp' && blob.size) return blob;
    pfWebpFallback=true;
  }
  try{
    if(!pfWebpModule) pfWebpModule=import('/photoflow/vendor/webp/encoder.js').catch(error=>{pfWebpModule=undefined;throw error;});
    return await (await pfWebpModule).encodeWebP(canvas,quality);
  }catch(error){console.error('PhotoFlow WebP fallback:',error);throw Error('Conversione WebP non riuscita. Riprova.');}
}
window.pfCompress=async file=>{if(file.size>PF.maxOriginalBytes)throw Error('Foto troppo grande (max 20 MB).');if(!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)&&!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))throw Error('Formato non supportato.');let bitmap,url;try{try{bitmap=await createImageBitmap(file);}catch{url=URL.createObjectURL(file);bitmap=new Image();bitmap.src=url;await bitmap.decode();}const w=bitmap.width,h=bitmap.height;if(!w||!h||w*h>PF.maxPixels)throw Error('Risoluzione originale troppo elevata.');const canvas=document.createElement('canvas');const encode=async(long,short,quality)=>{let scale=Math.min(1,long/Math.max(w,h),short/Math.min(w,h));for(let step=0;step<12;step++){canvas.width=Math.max(1,Math.floor(w*scale));canvas.height=Math.max(1,Math.floor(h*scale));const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);for(let q=quality;q>=.49;q-=.08){const blob=await pfEncodeWebP(canvas,q);if(blob.size<=PF.maxImageBytes)return blob;}scale*=.8;}throw Error('Impossibile comprimere la foto.');};try{const image=await encode(PF.maxLong,PF.maxShort,PF.quality),thumbnail=await encode(PF.thumbLong,PF.thumbLong,PF.thumbQuality);const base64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});return {image:await base64(image),thumbnail:await base64(thumbnail)};}finally{canvas.width=canvas.height=1;}}finally{bitmap?.close?.();if(url)URL.revokeObjectURL(url);}};

const c=window.PHOTOFIT_CONFIG;
const $=id=>document.getElementById('pf-'+id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const radians=a=>a*Math.PI/180;
export async function decode(blob){
 const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error('Immagine non valida.');return image;}finally{URL.revokeObjectURL(url);}
}
function canvas(w,h){const el=document.createElement('canvas');el.width=w;el.height=h;return el;}
function jpeg(el){return new Promise((resolve,reject)=>{try{el.toBlob(b=>b?.size&&b.type==='image/jpeg'?resolve(b):reject(Error('Impossibile generare il JPEG.')),'image/jpeg',c.jpegQuality);}catch(e){reject(e);}});}
// Scrive densità JFIF in dpi, senza ricomprimere. Inserisce APP0 se assente.
export async function withDpi(blob,dpi){
 const b=new Uint8Array(await blob.arrayBuffer());if(b[0]!==255||b[1]!==216)throw Error('JPEG non valido.');
 const density=Math.round(dpi);if(density<1||density>65535)throw Error('DPI non validi.');
 let i=2;while(i+4<b.length&&b[i]===255){const marker=b[i+1];if(marker===218||marker===217)break;const len=b[i+2]*256+b[i+3];if(len<2||i+2+len>b.length)break;
 if(marker===224&&len>=16&&b[i+4]===74&&b[i+5]===70&&b[i+6]===73&&b[i+7]===70&&b[i+8]===0){b[i+11]=1;b[i+12]=b[i+14]=density>>8;b[i+13]=b[i+15]=density&255;return new Blob([b],{type:'image/jpeg'});}i+=2+len;}
 const app=new Uint8Array([255,224,0,16,74,70,73,70,0,1,1,1,density>>8,density&255,density>>8,density&255,0,0]);return new Blob([b.subarray(0,2),app,b.subarray(2)],{type:'image/jpeg'});
}
export async function prepare(file){
 if(!['image/jpeg','image/png'].includes(file.type)&&!(file.type===''&&/\.(jpe?g|png)$/i.test(file.name)))throw Error('Sono ammessi solo JPEG e PNG.');
 const image=await decode(file),w=image.naturalWidth,h=image.naturalHeight;
 const s=c.resizeOnUpload?Math.min(1,c.maxUploadWidth/w,c.maxUploadHeight/h):1;
 const width=Math.max(1,Math.round(w*s)),height=Math.max(1,Math.round(h*s)),el=canvas(width,height);
 try{const ctx=el.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,width,height);return {blob:await withDpi(await jpeg(el),c.defaultDpi),width,height,dpi:c.defaultDpi};}finally{el.width=el.height=1;}
}
// Geometria nel sistema ruotato dell'immagine. Il centro è limitato in modo
// che TUTTI i vertici del rettangolo siano sempre interni alla fotografia.
export function coverage(w,h,iw,ih,angle,zoom,x,y){
 const a=radians(angle),co=Math.cos(a),si=Math.sin(a),rw=Math.abs(co)*w+Math.abs(si)*h,rh=Math.abs(si)*w+Math.abs(co)*h;
 const min=Math.max(rw/iw,rh/ih),scale=min*zoom;
 const u=clamp(co*x+si*y,-Math.max(0,(iw*scale-rw)/2),Math.max(0,(iw*scale-rw)/2));
 const v=clamp(-si*x+co*y,-Math.max(0,(ih*scale-rh)/2),Math.max(0,(ih*scale-rh)/2));
 return {scale,x:co*u-si*v,y:si*u+co*v};
}
function preferences(){try{return JSON.parse(localStorage.getItem('photofit-frame')||'{}');}catch{return {};}}
function remember(v){try{localStorage.setItem('photofit-frame',JSON.stringify(v));}catch{}}
export class Editor{
 constructor(){this.el=$('canvas');this.ctx=this.el.getContext('2d');this.pointers=new Map();this.view=1;this.grid=c.grid;this.row=null;this.image=null;this.onChange=()=>{};
  this.bindAdjustments();
  this.resize=new ResizeObserver(()=>this.draw());this.resize.observe($('canvas-wrap'));
  this.el.addEventListener('pointerdown',e=>{if(!this.image||this.invalid)return;this.el.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,this.point(e));});
  this.el.addEventListener('pointermove',e=>this.move(e));for(const event of ['pointerup','pointercancel','lostpointercapture'])this.el.addEventListener(event,e=>this.pointers.delete(e.pointerId));
  this.el.addEventListener('wheel',e=>{if(!this.image||this.invalid)return;e.preventDefault();const p=this.point(e);if(e.ctrlKey||e.altKey){this.setView(this.view*Math.exp(-e.deltaY*.002));}else this.zoomAt(this.zoom*Math.exp(-e.deltaY*.002),p,p);},{passive:false});
 }
 bindAdjustments(){
  for(const [id,step] of [['photo-zoom',c.photoZoomStep],['view-zoom',c.viewZoomStep],['angle',c.rotationStep]]) $(id).step=step;
  for(const button of document.querySelectorAll('[data-pf-adjust]')){
   let delay=null,repeat=null,held=false;
   const stop=()=>{clearTimeout(delay);clearInterval(repeat);delay=repeat=null;};
   const adjust=()=>{if(!this.image||this.invalid||$('close').disabled){stop();return;}const d=Number(button.dataset.dir);const round=n=>Number(n.toFixed(8));
    if(button.dataset.pfAdjust==='photo')this.setZoom(round(this.zoom+d*c.photoZoomStep));
    else if(button.dataset.pfAdjust==='view')this.setView(round(this.view+d*c.viewZoomStep));
    else this.setAngle(round(this.angle+d*c.rotationStep));
   };
   button.addEventListener('pointerdown',e=>{if(e.button!==0)return;stop();held=false;button.setPointerCapture(e.pointerId);delay=setTimeout(()=>{held=true;adjust();repeat=setInterval(adjust,c.adjustRepeatMs);},c.adjustHoldDelayMs);});
   for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])button.addEventListener(event,stop);
   button.addEventListener('click',e=>{if(!held||e.detail===0)adjust();held=false;});
   $('editor').addEventListener('close',()=>{stop();held=false;});
   window.addEventListener('blur',stop);
  }
 }
 open(row,image){this.row=row;this.image=image;const p=preferences();this.unit=p.unit==='px'?'px':c.defaultUnit;this.dpi=Number(p.dpi)||c.defaultDpi;this.width=Number(p.width)||c.defaultWidth;this.height=Number(p.height)||c.defaultHeight;this.angle=0;this.zoom=1;this.view=1;this.x=0;this.y=0;this.invalid=false;this.frame();this.sync();}
 close(){this.row=null;this.image=null;this.pointers.clear();this.draw();}
 dimensions(){const f=this.unit==='cm'?this.dpi/2.54:1;const w=Math.round(this.width*f),h=Math.round(this.height*f);if(!Number.isFinite(w)||!Number.isFinite(h)||!(this.width>0&&this.height>0&&Number.isInteger(this.dpi)&&this.dpi>=1&&this.dpi<=65535)||w<1||h<1)throw Error('Inserisci misure positive e DPI interi validi.');if(w>c.maxOutputSide||h>c.maxOutputSide||w*h>c.maxOutputPixels)throw Error('Riquadro troppo grande per il limite tecnico configurato.');return {w,h};}
 frame(){try{const {w,h}=this.dimensions();this.w=w;this.h=h;this.invalid=false;this.bound();remember({unit:this.unit,width:this.width,height:this.height,dpi:this.dpi});}catch(e){this.invalid=true;this.error=e.message;}this.draw();}
 setFrame(unit,width,height,dpi){this.unit=unit;this.width=width;this.height=height;this.dpi=dpi;this.frame();this.sync();}
 switchUnit(unit){if(unit===this.unit)return;const f=this.dpi/2.54;if(unit==='px'){this.width=Math.max(1,Math.round(this.width*f));this.height=Math.max(1,Math.round(this.height*f));}else{this.width=Number((this.width/f).toFixed(5));this.height=Number((this.height/f).toFixed(5));}this.unit=unit;this.frame();this.sync();}
 bound(){if(!this.image||this.invalid)return;const v=coverage(this.w,this.h,this.image.naturalWidth,this.image.naturalHeight,this.angle,this.zoom,this.x,this.y);Object.assign(this,v);}
 setAngle(a){this.angle=((a+180)%360+360)%360-180;this.bound();this.sync();this.draw();}
 setView(v){this.view=clamp(v,1,c.maxViewZoom);this.sync();this.draw();}
 center(){this.x=this.y=0;this.bound();this.draw();}
 reset(){this.angle=0;this.zoom=this.view=1;this.center();this.sync();}
 setZoom(z){this.zoomAt(z,{x:this.cx,y:this.cy},{x:this.cx,y:this.cy});}
 point(e){const r=this.el.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 zoomAt(z,oldP,newP){if(!this.image||this.invalid||!this.fit)return;const old=this.zoom;this.zoom=clamp(z,1,c.maxPhotoZoom);const k=this.zoom/old;this.x=(this.x-(oldP.x-this.cx)/this.fit)*k+(newP.x-this.cx)/this.fit;this.y=(this.y-(oldP.y-this.cy)/this.fit)*k+(newP.y-this.cy)/this.fit;this.bound();this.sync();this.draw();}
 move(e){if(!this.pointers.has(e.pointerId)||!this.image||this.invalid||!this.fit)return;const old=this.pointers.get(e.pointerId),p=this.point(e);const other=[...this.pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];this.pointers.set(e.pointerId,p);if(other){const d=Math.max(1,Math.hypot(old.x-other.x,old.y-other.y)),nd=Math.max(1,Math.hypot(p.x-other.x,p.y-other.y));this.zoomAt(this.zoom*nd/d,{x:(old.x+other.x)/2,y:(old.y+other.y)/2},{x:(p.x+other.x)/2,y:(p.y+other.y)/2});}else{this.x+=(p.x-old.x)/this.fit;this.y+=(p.y-old.y)/this.fit;this.bound();this.draw();}}
 sync(){this.onChange(this);}
 draw(){const r=this.el.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(2,window.devicePixelRatio||1);this.el.width=Math.round(r.width*dpr);this.el.height=Math.round(r.height*dpr);const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#090e16';ctx.fillRect(0,0,r.width,r.height);if(!this.image||this.invalid)return;
 this.cx=r.width/2;this.cy=r.height/2;this.fit=Math.min(r.width*.80/this.w,r.height*.80/this.h)*this.view;const f=this.fit,w=this.w*f,h=this.h*f,l=this.cx-w/2,t=this.cy-h/2;
 ctx.save();ctx.translate(this.cx+this.x*f,this.cy+this.y*f);ctx.rotate(radians(this.angle));ctx.scale(this.scale*f,this.scale*f);ctx.imageSmoothingQuality='high';ctx.drawImage(this.image,-this.image.naturalWidth/2,-this.image.naturalHeight/2);ctx.restore();
 ctx.fillStyle='rgba(0,0,0,.64)';ctx.beginPath();ctx.rect(0,0,r.width,r.height);ctx.rect(l,t,w,h);ctx.fill('evenodd');ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.strokeRect(l,t,w,h);
 if(this.grid){ctx.save();ctx.beginPath();ctx.rect(l,t,w,h);ctx.clip();ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=1;ctx.setLineDash([4,4]);for(let i=1;i<3;i++){ctx.beginPath();ctx.moveTo(l+w*i/3,t);ctx.lineTo(l+w*i/3,t+h);ctx.moveTo(l,t+h*i/3);ctx.lineTo(l+w,t+h*i/3);ctx.stroke();}ctx.restore();}
 }
 async export(){const {w,h}=this.dimensions();this.bound();const el=canvas(w,h);try{const ctx=el.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.translate(w/2+this.x,h/2+this.y);ctx.rotate(radians(this.angle));ctx.scale(this.scale,this.scale);ctx.imageSmoothingQuality='high';ctx.drawImage(this.image,-this.image.naturalWidth/2,-this.image.naturalHeight/2);return {blob:await withDpi(await jpeg(el),this.dpi),width:w,height:h,dpi:this.dpi};}finally{el.width=el.height=1;}}
}

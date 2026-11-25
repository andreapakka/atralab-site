// PhotoFit V1.2 — PDF A4 a dimensioni fisiche, JPEG incorporati senza ricodifica.
// Le coordinate di packing sono quantizzate conservativamente al milionesimo di punto.
const U=1000000;
export const A4=[210*72/25.4,297*72/25.4];
const PW=Math.floor(A4[0]*U),PH=Math.floor(A4[1]*U);
const fits=(a,b)=>a.w<=b.w&&a.h<=b.h;
const area=r=>r.w*r.h;
function dimensions(row){
 const w=Number(row.width_px),h=Number(row.height_px),dpi=Number(row.dpi);
 if(row.status!=='completed'||!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||!Number.isFinite(dpi)||dpi<=0)throw Error(`Dimensioni o DPI non validi: ${row.filename}`);
 const width=w*72/dpi,height=h*72/dpi;
 const quantize=v=>Math.abs(v-A4[0])<1e-10?PW:Math.abs(v-A4[1])<1e-10?PH:Math.ceil(v*U);
 const item={row,width,height,w:quantize(width),h:quantize(height)};
 if(!fits(item,{w:PW,h:PH})&&!fits({w:item.h,h:item.w},{w:PW,h:PH}))throw Error(`La foto ${row.filename} supera il formato A4. Nessuna foto verrà ridimensionata.`);
 return item;
}
function newPage(){return {free:[{x:0,y:0,w:PW,h:PH}],placed:[]};}
function split(page,p){
 const out=[];
 for(const r of page.free){
  if(p.x>=r.x+r.w||p.x+p.w<=r.x||p.y>=r.y+r.h||p.y+p.h<=r.y){out.push(r);continue;}
  if(p.x>r.x)out.push({x:r.x,y:r.y,w:p.x-r.x,h:r.h});
  if(p.x+p.w<r.x+r.w)out.push({x:p.x+p.w,y:r.y,w:r.x+r.w-p.x-p.w,h:r.h});
  if(p.y>r.y)out.push({x:r.x,y:r.y,w:r.w,h:p.y-r.y});
  if(p.y+p.h<r.y+r.h)out.push({x:r.x,y:p.y+p.h,w:r.w,h:r.y+r.h-p.y-p.h});
 }
 page.free=out.filter((r,i)=>!out.some((s,j)=>i!==j&&s.x<=r.x&&s.y<=r.y&&s.x+s.w>=r.x+r.w&&s.y+s.h>=r.y+r.h&&(s.x!==r.x||s.y!==r.y||s.w!==r.w||s.h!==r.h||j<i)));
 page.placed.push(p);
}
function better(a,b){if(!b)return true;for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]<b[i];}return false;}
function find(page,item,mode,prefer){let best=null,score=null;
 for(const r of page.free)for(const rotated of (prefer?[true,false]:[false,true])){
  const w=rotated?item.h:item.w,h=rotated?item.w:item.h;
  if(w>r.w||h>r.h)continue;
  const short=Math.min(r.w-w,r.h-h),long=Math.max(r.w-w,r.h-h),waste=area(r)-w*h;
  const s=mode===0?[short,long,r.y,r.x]:mode===1?[waste,short,long,r.y,r.x]:mode===2?[r.y+h,r.x,short,long]:[r.x+w,r.y,short,long];
  if(better(s,score)){score=s;best={item,x:r.x,y:r.y,w,h,rotated};}
 }
 return best;
}
function pack(items,mode,prefer){const pages=[];
 for(const item of items){let p=null,page=null;
  for(const candidate of pages){p=find(candidate,item,mode,prefer);if(p){page=candidate;break;}}
  if(!page){page=newPage();pages.push(page);p=find(page,item,mode,prefer);}
  if(!p)throw Error('Impossibile collocare una fotografia nel PDF.');split(page,p);
 }
 return pages.map(p=>p.placed);
}
// Per foto tutte uguali, prova anche bande miste orizzontali e verticali.
function uniform(items,vertical){
 const {w,h}=items[0],span=vertical?PW:PH,cross=vertical?PH:PW;
 const a=vertical?w:h,b=vertical?h:w,ca=Math.floor(cross/(vertical?h:w)),cb=Math.floor(cross/(vertical?w:h));
 let best=null;
 // Non occorrono più bande del numero di foto da collocare.
 for(let n=0;n<=Math.min(items.length,Math.floor(span/a));n++){
  const m=Math.min(items.length,Math.floor((span-n*a)/b)),capacity=n*ca+m*cb;
  if(!best||capacity>best.capacity)best={n,m,capacity};
 }
 if(!best?.capacity)return null;
 const pages=[];let index=0;
 while(index<items.length){const page=[];let offset=0;
  for(const [rotated,count,thickness,per] of [[false,best.n,a,ca],[true,best.m,b,cb]]){
   for(let i=0;i<count&&index<items.length;i++){
    const rw=rotated?h:w,rh=rotated?w:h;
    for(let j=0;j<per&&index<items.length;j++)page.push({item:items[index++],x:vertical?offset:j*rw,y:vertical?j*rh:offset,w:rw,h:rh,rotated});
    offset+=thickness;
   }
  }
  pages.push(page);
 }
 return pages;
}
export function planPdf(rows){
 if(!rows.length)throw Error('Seleziona almeno una fotografia definitiva.');
 const items=rows.map(dimensions);
 const sorts=[(a,b)=>area(b)-area(a),(a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h),(a,b)=>Math.min(b.w,b.h)-Math.min(a.w,a.h),(a,b)=>b.w-a.w,(a,b)=>b.h-a.h,(a,b)=>(b.w+b.h)-(a.w+a.h)];
 let best=null;
 const fill=pages=>pages.map(p=>p.reduce((sum,r)=>sum+area(r),0));
 const consider=pages=>{if(pages&&(!best||pages.length<best.length||(pages.length===best.length&&better(fill(best),fill(pages)))))best=pages;};
 // Limite inferiore per interrompere le prove quando il numero di fogli è già ottimo.
 const lower=Math.max(1,Math.ceil(items.reduce((s,i)=>s+(i.width/A4[0])*(i.height/A4[1]),0)-1e-12));
 if(items.every(i=>i.w===items[0].w&&i.h===items[0].h)){consider(uniform(items,false));consider(uniform(items,true));}
 for(const order of sorts){if(best?.length===lower)break;const sorted=items.slice().sort(order);
  for(let mode=0;mode<4;mode++){for(const prefer of [false,true]){consider(pack(sorted,mode,prefer));if(best.length===lower)break;}if(best.length===lower)break;}
 }
 // Controllo finale indipendente: ogni foto una sola volta, nessun taglio o sovrapposizione.
 const seen=new Set();
 for(const page of best)for(let i=0;i<page.length;i++){
  const p=page[i];if(seen.has(p.item)||p.x<0||p.y<0||p.x+p.w>PW||p.y+p.h>PH)throw Error('Errore di impaginazione PDF.');seen.add(p.item);
  for(let j=0;j<i;j++){const q=page[j];if(p.x<q.x+q.w&&q.x<p.x+p.w&&p.y<q.y+q.h&&q.y<p.y+p.h)throw Error('Sovrapposizione nel PDF.');}
 }
 if(seen.size!==items.length)throw Error('Impaginazione PDF incompleta.');return best;
}
export async function exportPdf(rows,download,onProgress=()=>{}){
 const lib=globalThis.PDFLib;if(!lib?.PDFDocument)throw Error('Libreria PDF non disponibile. Ricarica la pagina e riprova.');
 const pages=planPdf(rows),pdf=await lib.PDFDocument.create();pdf.setTitle('PhotoFit — ATRALAB');
 let done=0;
 for(const placements of pages){const page=pdf.addPage(A4);
  for(const p of placements){const {row,width,height}=p.item;onProgress(`PDF: fotografia ${++done} di ${rows.length}…`);
   const blob=await download(row),bytes=new Uint8Array(await blob.arrayBuffer());
   const image=await pdf.embedJpg(bytes);
   if(image.width!==Number(row.width_px)||image.height!==Number(row.height_px))throw Error(`Dimensioni JPEG diverse dall’archivio: ${row.filename}`);
   // L'origine PDF è in basso a sinistra. La rotazione positiva è antioraria.
   const x=p.x/U,y=A4[1]-p.y/U-(p.rotated?width:height);
   page.drawImage(image,p.rotated?{x:x+height,y,width,height,rotate:lib.degrees(90)}:{x,y,width,height});
  }
 }
 onProgress('Preparazione del PDF…');const bytes=await pdf.save();return {blob:new Blob([bytes],{type:'application/pdf'}),pageCount:pages.length};
}

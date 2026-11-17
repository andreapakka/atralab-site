// PDF testuale A4: pdf-lib + fontkit + font Lato Unicode caricati a runtime.
// Le fotografie non vengono mai convertite in pagine PDF.
const CDN='https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/';
const fontURLs={normal:'Lato-Regular.ttf',bold:'Lato-Bold.ttf',italic:'Lato-Italic.ttf',bolditalic:'Lato-BoldItalic.ttf'};
let fontCache;
async function getFonts(){
  if(!fontCache)fontCache=Promise.all(Object.values(fontURLs).map(async file=>{
    const response=await fetch(CDN+file);if(!response.ok)throw Error(`Impossibile caricare il font PDF (${file}).`);return new Uint8Array(await response.arrayBuffer());
  }));
  const values=await fontCache;return Object.fromEntries(Object.keys(fontURLs).map((key,i)=>[key,values[i]]));
}
function filename(title,kind){
  const now=new Date(),stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0'),String(now.getHours()).padStart(2,'0'),String(now.getMinutes()).padStart(2,'0'),String(now.getSeconds()).padStart(2,'0')].join('');
  return `${String(title).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Documento'}_SnapText_${kind}_ATRALAB_${stamp}.pdf`;
}
function flattenRevision(revision){
  // Supabase salva {delta:{ops}, alternatives, language}; Quill da' {ops}.
  const delta=revision?.delta?.ops ? revision.delta : revision;
  if(!Array.isArray(delta?.ops))throw Error('Revisione senza contenuto Delta valido.');
  const runs=[];
  for(const op of delta.ops){
    if(typeof op.insert==='string')runs.push({text:op.insert,attr:op.attributes||{}});
    else if(op.insert?.snapNote){const n=op.insert.snapNote;runs.push({text:`Nota personale — ${n.quote||''}: ${n.body||''}\n`,attr:{note:true}});}
  }
  if(!runs.some(run=>run.text.trim()))throw Error('La Revisione non contiene testo da esportare.');
  return runs;
}
function flattenOriginal(original){
  const runs=[];
  for(const page of original?.pages||[]){
    runs.push({text:(page.text || '')+'\n\n',attr:{}});
  }
  return runs;
}
export async function exportPDF({title,kind,original,revision}){
  if(!window.PDFLib||!window.fontkit)throw Error('Librerie PDF non disponibili.');
  const {PDFDocument,rgb}=window.PDFLib;
  const pdf=await PDFDocument.create();pdf.registerFontkit(window.fontkit);
  const fontBytes=await getFonts(),fonts={};
  for(const [key,data] of Object.entries(fontBytes)) fonts[key]=await pdf.embedFont(data,{subset:true});
  const A4=[595.28,841.89], margin=49,bottom=52,bodyWidth=A4[0]-margin*2;
  let page=null,y=0,pageNumber=0;
  const newPage=()=>{page=pdf.addPage(A4);y=A4[1]-margin;pageNumber++;};
  newPage();
  const runs=kind==='Originale'?flattenOriginal(original):flattenRevision(revision);
  const standard=fontBytes;void standard;
  const lineHeight=16;
  const drawLine=(parts,header=false,note=false)=>{
    const size=note?9.5:header?15:11;
    const height=note?14:header?22:lineHeight;
    if(y-height<bottom)newPage();
    let x=margin;
    if(note){page.drawRectangle({x:margin-5,y:y-height+1,width:bodyWidth+10,height:height+2,color:rgb(.95,.95,.95)});}
    for(const item of parts){
      if(!item.text)continue;
      const a=item.attr||{},key=(a.bold?'bold':'')+(a.italic?'italic':'');
      const font=fonts[key||'normal'];
      const width=font.widthOfTextAtSize(item.text,size);
      if(a.background && !note)page.drawRectangle({x,y:y-height+3,width,height:height-1,color:rgb(1,.88,.52)});
      page.drawText(item.text,{x,y:y-height+5,font,size,color:note?rgb(.35,.35,.35):rgb(.12,.12,.12)});
      if(a.underline || a.strike){
        const yy=a.strike?y-height+9:y-height+3;
        page.drawLine({start:{x,y:yy},end:{x:x+width,y:yy},thickness:.6,color:rgb(.2,.2,.2)});
      }
      x+=width;
    }
    y-=height;
  };
  // Impaginazione per parole: conserva gli stili inline e gestisce ritorni a capo e pagine.
  let parts=[],w=0,currentHeader=false,currentNote=false;
  const flush=()=>{drawLine(parts,currentHeader,currentNote);parts=[];w=0;currentHeader=false;currentNote=false;};
  for(const run of runs){
    const attr=run.attr||{};
    const text=String(run.text).replace(/\r\n?/g,'\n');
    const tokens=text.split(/(\n|\s+)/).filter(Boolean);
    for(const token of tokens){
      if(token==='\n'){flush();continue;}
      const note=!!attr.note,header=!!attr.header;
      const size=note?9.5:header?15:11;
      if(parts.length && (note!==currentNote || header!==currentHeader))flush();
      currentNote=note;currentHeader=header;
      const key=(attr.bold?'bold':'')+(attr.italic?'italic':'');const font=fonts[key||'normal'];
      // Se un token e' piu' lungo della riga, lo dividiamo in pezzi per evitare overflow.
      for(const chunk of (font.widthOfTextAtSize(token,size)>bodyWidth ? Array.from(token) : [token])){
        const width=font.widthOfTextAtSize(chunk,size);
        if(w+width>bodyWidth && parts.length)flush();
        parts.push({text:chunk,attr});w+=width;
      }
    }
  }
  if(parts.length)flush();
  const total=pdf.getPageCount();
  for(let i=0;i<total;i++){
    const p=pdf.getPage(i),pageLabel=`${i+1} / ${total}`;
    p.drawText(pageLabel,{x:A4[0]/2-10,y:23,size:9,font:fonts.normal,color:rgb(.45,.45,.45)});
  }
  const bytes=await pdf.save();const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const a=document.createElement('a');a.href=url;a.download=filename(title,kind);document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),45000);
}

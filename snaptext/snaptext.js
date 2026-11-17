// SnapText V1 - solo coordinamento. Gli altri moduli restano indipendenti.
import {recognizeTesseract} from './ocr-tesseract.js';
import {recognizePaddle} from './ocr-paddle.js';
import {mergeWords} from './bestmerge.js';
import {SnapEditor} from './editor.js';
import {getCurrentUser,isAdmin,listDocuments,loadDocument,createDocument,saveRevision,softDelete} from './storage.js';
import {exportPDF} from './pdf-export.js';
const $=id=>document.getElementById(id),cfg=window.SNAPTEXT_CONFIG;
const app={photos:[],sort:null,editor:null,document:null,currentView:'new',dirty:false,busy:false,cancel:false,stopTess:null,admin:false,user:null,timer:null,started:0,authorized:false};
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(text,error=false){$('st-status').textContent=text;$('st-status').classList.toggle('error',error);}
function setView(name,force=false){
  if(!force && app.dirty && app.currentView==='revision' && name!=='revision' && !confirm('Hai modifiche non salvate. Vuoi abbandonarle?'))return;
  app.currentView=name;
  for(const button of document.querySelectorAll('[data-view]')){const selected=button.dataset.view===name;button.classList.toggle('active',selected);button.setAttribute('aria-current',selected?'page':'false');}
  for(const v of ['new','revision','original','library']) $(`st-view-${v}`).hidden=v!==name;
  if(name==='library')refreshLibrary().catch(e=>message(e.message,true));
}
const bytes=n=>`${(n/1024/1024).toFixed(2)} MB`;
function photoButtons(){ $('st-start').disabled=app.busy || !app.authorized || !app.photos.length || !$('st-title').value.trim();$('st-clear').disabled=app.busy;}
function updatePhotoCards(){
  const grid=$('st-photos');grid.replaceChildren();app.sort?.destroy();app.sort=null;
  for(const [i,item] of app.photos.entries()){
    const card=document.createElement('article');card.className='st-photo';card.dataset.id=item.id;
    const head=document.createElement('div');head.className='st-photo-top';
    const handle=document.createElement('button');handle.className='st-handle';handle.type='button';handle.title='Trascina per riordinare';handle.textContent='↕';
    const del=document.createElement('button');del.type='button';del.textContent='×';del.setAttribute('aria-label',`Rimuovi ${item.file.name}`);
    del.addEventListener('click',()=>{if(app.busy)return;URL.revokeObjectURL(item.url);app.photos.splice(app.photos.indexOf(item),1);updatePhotoCards();});
    head.append(handle,del);const image=document.createElement('img');image.src=item.url;image.alt=`Anteprima pagina ${i+1}`;
    const name=document.createElement('div');name.className='st-photo-name';name.textContent=item.file.name;name.title=item.file.name;
    const small=document.createElement('div');small.className='st-photo-small';small.textContent=`Pagina ${i+1} · ${bytes(item.file.size)}`;
    card.append(head,image,name,small);grid.append(card);
  }
  if(window.Sortable && app.photos.length>1)app.sort=new window.Sortable(grid,{handle:'.st-handle',animation:150,onEnd:ev=>{const [item]=app.photos.splice(ev.oldIndex,1);app.photos.splice(ev.newIndex,0,item);updatePhotoCards();}});
  photoButtons();
}
async function imageValid(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error(`${file.name}: formato non supportato.`);
  if(file.size>cfg.maxPhotoMB*1024*1024)throw Error(`${file.name}: supera ${cfg.maxPhotoMB} MB.`);
  const image=await createImageBitmap(file);
  try{if(!image.width||!image.height)throw Error('Fotografia non leggibile.');}finally{image.close();}
}
async function addPhotos(files){
  if(app.busy)return;
  const selected=Array.from(files);
  if(app.photos.length+selected.length>cfg.maxPhotos){message(`Massimo ${cfg.maxPhotos} fotografie.`,true);return;}
  const prepared=[];
  try{
    for(const file of selected){await imageValid(file);prepared.push({file,url:URL.createObjectURL(file),id:crypto.randomUUID()});}
    app.photos.push(...prepared);updatePhotoCards();message(`${app.photos.length} fotografie pronte.`);
  }catch(e){for(const item of prepared)URL.revokeObjectURL(item.url);message(e.message,true);}
}
function clearPhotos(){for(const item of app.photos)URL.revokeObjectURL(item.url);app.photos=[];updatePhotoCards();$('st-photo-input').value='';}
function setBusy(on){app.busy=on;photoButtons();$('st-photo-input').disabled=on;$('st-language').disabled=on;$('st-title').disabled=on;}
function overlay(text){app.started=performance.now();$('st-overlay').hidden=false;stage(text);$('st-cancel').disabled=false;$('st-cancel').textContent='Annulla elaborazione';app.timer=setInterval(()=>{$('st-elapsed').textContent=`${Math.floor((performance.now()-app.started)/1000)} s`;},250);}
function stage(text){$('st-stage').textContent=text;}
function closeOverlay(){clearInterval(app.timer);app.timer=null;$('st-overlay').hidden=true;}
function cancelled(){return app.cancel;}
function checkCancel(){if(app.cancel)throw Error('Elaborazione annullata. Nessun documento salvato.');}
function cleanInput(text){return String(text||'').replace(/\r\n?/g,'\n');}
// Il testo BestMerge è la fonte unica per la Revisione. L'editor evidenzia
// soltanto intervalli piccoli ANCORA dubbi, mai un'intera riga non abbinata.
// Una riga assente in Paddle non è automaticamente una riga sbagliata.
function pageToDelta(page,pageIndex){
  const ops=[],alternatives={};let serial=0;
  const add=(text,id=null)=>{
    if(!text)return;
    const last=ops.at(-1);
    if(!id && last && !last.attributes && typeof last.insert==='string')last.insert+=text;
    else ops.push(id?{insert:text,attributes:{ocrDoubt:id}}:{insert:text});
  };
  const lines=page.merge?.lines||[];
  if(!lines.length){add(cleanInput(page.text));add('\n\n');return {ops,alternatives};}
  // I suggerimenti contengono posizioni sul testo OCR di partenza; per le
  // marcature usiamo invece il testo ricostruito, dopo le correzioni BestMerge.
  const prepared=lines.map(line=>({
    line,
    content:(line.segments||[{text:line.text}]).map(s=>s.text).join('')
  }));
  const makeMark=(marks,text,start,end,reason,paddle)=>{
    if(start<0||end>text.length||end<=start)return;
    const phrase=text.slice(start,end);
    if(!phrase.trim() || phrase.length>32)return; // mai evidenziare frasi intere
    if(marks.some(m=>start<m.end && end>m.start))return;
    marks.push({start,end,reason,paddle});
  };
  for(let i=0;i<prepared.length;i++){
    const {line,content}=prepared[i],marks=[];
    // Le parti "changed" sono state già risolte da BestMerge: NON arancioni.
    const previous=prepared[i-1]?.line;
    const firstInMissingBlock=line.status==='unmatched' && previous?.status!=='unmatched';
    if(firstInMissingBlock){
      // L'altro OCR può avere omesso un blocco: segnaliamo soltanto il primo
      // termine del blocco, non tutto il contenuto recuperato da Tesseract.
      const token=/^\s*([\p{L}\p{M}]{3,})/u.exec(content);
      if(token){const start=content.indexOf(token[1]);makeMark(marks,content,start,start+token[1].length,
        'Inizio di un passaggio assente in PaddleOCR: verifica la parola sulla fotografia.',null);}
    }
    if(line.status==='suspect'){
      // Frammento breve isolato, es. "E |" oppure un segno spurio.
      const match=/\S(?:[\s\S]*\S)?/u.exec(content);
      if(match && match[0].length<=12)makeMark(marks,content,match.index,match.index+match[0].length,
        'Frammento isolato: potrebbe essere un errore OCR.',line.paddle||null);
    }
    // Un segno OCR isolato nella frase non va lasciato confuso con il testo.
    const stray=/\s([|\]\[{}])(?=\s|$)|\s([jJ])\s*$/gu;
    for(const m of content.matchAll(stray)){
      const glyph=m[1]||m[2],start=m.index+m[0].indexOf(glyph);
      makeMark(marks,content,start,start+glyph.length,
        'Carattere isolato sospetto, non corretto da BestMerge.',line.paddle||null);
    }
    // Sillabazioni rimaste dubbie: evidenziamo solo la porzione finale.
    const trailing=/(?:^|\s)([\p{L}\p{M}]{2,}-)\s*$/u.exec(content);
    if(trailing && !line.joinNext){const start=content.lastIndexOf(trailing[1]);
      makeMark(marks,content,start,start+trailing[1].length,
        'Parola ancora spezzata a fine riga: verifica se ricomporla.',line.paddle||null);}
    // Eventuali varianti BestMerge sono ancorate a parole precise, non a righe.
    for(const suggestion of [...(line.suggestions||[]),...(line.variants||[])]){
      if(!suggestion.token && !suggestion.from)continue;
      const term=String(suggestion.token||suggestion.from).trim();
      if(!term||term.length>32)continue;
      // Evita falsi riferimenti se BestMerge ha già cambiato il token.
      const at=content.indexOf(term);
      if(at>=0 && content.indexOf(term,at+term.length)<0)
        makeMark(marks,content,at,at+term.length,
          suggestion.reason||'Variante OCR non risolta: verifica sulla fotografia.',line.paddle||null);
    }
    marks.sort((a,b)=>a.start-b.start);
    let cursor=0;
    for(const mark of marks){
      if(mark.start<cursor)continue;
      add(content.slice(cursor,mark.start));
      const id=`p${pageIndex}-d${++serial}`;
      alternatives[id]={tesseract:line.text,paddle:mark.paddle||line.paddle||'Passaggio non riconosciuto dal secondo OCR',reason:mark.reason};
      add(content.slice(mark.start,mark.end),id);
      cursor=mark.end;
    }
    add(content.slice(cursor));
    if(i<prepared.length-1 && !line.joinNext)add('\n');
  }
  add('\n\n');return {ops,alternatives};
}
function assemblePages(pages,language){
  const ops=[],alternatives={};
  for(const [i,page] of pages.entries()){
    const piece=pageToDelta(page,i);ops.push(...piece.ops);Object.assign(alternatives,piece.alternatives);
  }
  if(!ops.length)ops.push({insert:'\n'});
  return {delta:{ops},alternatives,language};
}
function makeOriginal(pages,language){
  return {version:1,language,pages:pages.map((p,i)=>({number:i+1,text:p.text,tesseract:p.tesseract,paddle:p.paddle,usedFallback:p.usedFallback,lines:p.merge?.lines?.map(line=>({index:line.index,status:line.status,text:line.text,paddle:line.paddle||null,edits:line.edits||[],suggestions:line.suggestions||[],variants:line.variants||[],segments:line.segments||[],joinNext:!!line.joinNext}))||[]}))};
}
async function run(){
  if(app.busy)return;
  const title=$('st-title').value.trim(),language=$('st-language').value;
  if(!title||title.length>cfg.maxTitleChars||!app.photos.length){message('Inserisci un nome e almeno una fotografia.',true);return;}
  if(app.dirty&&!confirm('Hai una Revisione non salvata. Vuoi iniziare un nuovo lavoro?'))return;
  setBusy(true);app.cancel=false;overlay('Preparazione fotografie…');
  const pages=[];
  try{
    for(const [index,item] of app.photos.entries()){
      checkCancel();stage(`Pagina ${index+1}/${app.photos.length}: Tesseract…`);
      let tess='',paddle='',err1=null,err2=null;
      try{tess=(await recognizeTesseract(item.file,language,{onProgress:x=>stage(`Pagina ${index+1}: ${x}`),isCancelled:cancelled,setCancel:fn=>app.stopTess=fn})).text;}
      catch(e){err1=e;if(app.cancel)throw e;console.warn('SnapText Tesseract:',e);}
      checkCancel();stage(`Pagina ${index+1}/${app.photos.length}: PaddleOCR…`);
      try{paddle=(await recognizePaddle(item.file,language,{onProgress:x=>stage(`Pagina ${index+1}: ${x}`),isCancelled:cancelled})).text;}
      catch(e){err2=e;if(app.cancel)throw e;console.warn('SnapText Paddle:',e);}
      checkCancel();
      if(!tess.trim()&&!paddle.trim())throw Error(`Pagina ${index+1}: nessun OCR utilizzabile (${err1?.message||''} ${err2?.message||''}). Nessun documento salvato.`);
      stage(`Pagina ${index+1}/${app.photos.length}: BestMerge…`);
      // Degradazione controllata se solo uno dei motori ha restituito testo sufficiente.
      const merge=tess.trim()&&paddle.trim()?mergeWords(tess,paddle):null;
      const text=merge?.text || tess || paddle;
      if(!text.trim()||text.replace(/\W/g,'').length<8)throw Error(`Pagina ${index+1}: testo insufficiente. Nessun documento salvato.`);
      pages.push({text,tesseract:tess,paddle,merge,usedFallback:!merge});
    }
    checkCancel();stage('Salvataggio Originale e Revisione…');$('st-cancel').disabled=true;
    const original=makeOriginal(pages,language),revision=assemblePages(pages,language);
    // Diagnostica: il passaggio BestMerge -> Delta non deve perdere né
    // aggiungere alcun carattere al testo ricostruito (eccetto separatori pagine).
    const expectedText=pages.map(p=>p.text+'\n\n').join('');
    const actualText=revision.delta.ops.map(op=>typeof op.insert==='string'?op.insert:'').join('');
    console.groupCollapsed('SnapText: confronto testo BestMerge / Revisione (prima di Quill)');
    pages.forEach((page,i)=>{
      console.info(`Pagina ${i+1}: BestMerge`,page.text);
      console.info(`Pagina ${i+1}: ${page.merge?.changes||0} correzioni, ${page.merge?.joinedWords||0} parole ricomposte; righe senza abbinamento: ${page.merge?.unmatchedTesseractCount??'fallback'}`);
    });
    console.info('Punti arancioni NON risolti:',Object.keys(revision.alternatives).length);
    console.info('Testo mantenuto identico:',expectedText===actualText);
    console.groupEnd();
    if(expectedText!==actualText)throw Error('Errore nel passaggio BestMerge → Revisione: testo non identico. Nessun documento salvato.');
    // Un unico INSERT atomico: Originale e Revisione sono sempre creati insieme.
    const doc=await createDocument({title,language,pageCount:app.photos.length,original,revision});
    app.document=doc;app.dirty=false;app.editor.load(doc.revision_json);
    renderOriginal(doc.original_json);updateDocInfo();clearPhotos();setView('revision',true);message('Documento creato. La Revisione è pronta.');
  }catch(e){message(e.message,true);}finally{app.stopTess=null;setBusy(false);closeOverlay();}
}
function renderOriginal(original){
  const panel=$('st-original');panel.replaceChildren();
  for(const page of original?.pages||[]){
    const head=document.createElement('h3');head.textContent=`Pagina ${page.number}`;panel.append(head);
    if(page.lines?.length){
      const pre=document.createElement('div');pre.style.whiteSpace='pre-wrap';
      for(const [i,line] of page.lines.entries()){
        const content=(line.segments?.length?line.segments.map(s=>s.text).join(''):line.text)||'';
        const span=document.createElement('span');span.textContent=content;
        if(['unmatched','suspect'].includes(line.status)||line.suggestions?.length||line.variants?.length)span.className='st-original-doubt';
        span.title=line.paddle?`PaddleOCR: ${line.paddle}`:'Confronto OCR non disponibile';
        pre.append(span);if(i<page.lines.length-1&&!line.joinNext)pre.append(document.createTextNode('\n'));
      }
      panel.append(pre);
    }else{const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.textContent=page.text;panel.append(pre);}
  }
}
function updateDocInfo(){const d=app.document;$('st-document-info').textContent=d?`${d.title} · ${d.language.toUpperCase()} · ${d.page_count} pagine`:'';}
async function openDoc(id){
  if(app.dirty&&!confirm('Modifiche non salvate: vuoi abbandonarle?'))return;
  const doc=await loadDocument(id);app.document=doc;app.dirty=false;app.editor.load(doc.revision_json);renderOriginal(doc.original_json);updateDocInfo();$('st-unsaved').hidden=true;setView('revision',true);message(`Documento «${doc.title}» aperto.`);
}
async function save(){
  if(!app.document)return;
  $('st-save').disabled=true;
  try{app.document=await saveRevision(app.document,{...app.document.revision_json,delta:app.editor.getDelta()});app.dirty=false;$('st-unsaved').hidden=true;message('Revisione salvata.');}
  catch(e){message(e.message,true);}finally{$('st-save').disabled=false;}
}
async function refreshLibrary(){
  const rows=await listDocuments(app.admin && $('st-mine').checked);
  const panel=$('st-library');panel.replaceChildren();
  if(!rows.length){panel.textContent='Nessun documento salvato.';return;}
  for(const d of rows){
    const card=document.createElement('article');card.className='st-library-item';
    const info=document.createElement('div'),name=document.createElement('strong');name.textContent=d.title;
    const meta=document.createElement('div');meta.className='st-library-meta';meta.textContent=`${d.language.toUpperCase()} · ${d.page_count} pagine · ${new Date(d.created_at).toLocaleString('it-IT')}${app.admin && d.owner_id!==app.user.id?' · altro utente':''}`;
    info.append(name,meta);const actions=document.createElement('div');actions.className='st-actions';
    const open=document.createElement('button');open.className='st-secondary';open.textContent='Apri';open.onclick=()=>openDoc(d.id).catch(e=>message(e.message,true));
    const del=document.createElement('button');del.className='st-secondary';del.textContent='Elimina';del.onclick=async()=>{
      if(!confirm(`Eliminare logicamente «${d.title}»? L’operazione non prevede ripristino in V1.`))return;
      try{await softDelete(d);if(app.document?.id===d.id){app.document=null;app.dirty=false;setView('new',true);}await refreshLibrary();message('Documento eliminato logicamente.');}catch(e){message(e.message,true);}
    };
    actions.append(open,del);card.append(info,actions);panel.append(card);
  }
}
async function pdf(kind){
  if(!app.document){message('Apri un documento.',true);return;}
  if(app.dirty && !confirm('Ci sono modifiche non salvate. Il PDF Revisione userà il testo attualmente visibile. Continuare?'))return;
  try{message('Preparazione PDF…');await exportPDF({title:app.document.title,kind,original:app.document.original_json,revision:kind==='Revisione'?{delta:app.editor.getDelta()}:app.document.revision_json});message('PDF scaricato.');}
  catch(e){message(`Esportazione PDF: ${e.message}`,true);}
}
function setup(){
  for(const tab of document.querySelectorAll('[data-view]'))tab.addEventListener('click',()=>setView(tab.dataset.view));
  $('st-title').addEventListener('input',photoButtons);
  $('st-browse').addEventListener('click',e=>{e.stopPropagation();$('st-photo-input').click();});
  $('st-drop').addEventListener('click',e=>{if(!e.target.closest('button'))$('st-photo-input').click();});
  $('st-drop').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();$('st-photo-input').click();}});
  $('st-photo-input').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value='';});
  for(const name of ['dragenter','dragover'])$('st-drop').addEventListener(name,e=>{e.preventDefault();$('st-drop').classList.add('dragging');});
  for(const name of ['dragleave','drop'])$('st-drop').addEventListener(name,e=>{e.preventDefault();$('st-drop').classList.remove('dragging');});
  $('st-drop').addEventListener('drop',e=>addPhotos(e.dataTransfer.files));
  $('st-start').addEventListener('click',run);$('st-clear').addEventListener('click',clearPhotos);
  $('st-cancel').addEventListener('click',()=>{app.cancel=true;$('st-cancel').disabled=true;stage('Annullamento richiesto…');try{app.stopTess?.();}catch{}});
  $('st-save').addEventListener('click',save);
  $('st-refresh').addEventListener('click',()=>refreshLibrary().catch(e=>message(e.message,true)));
  $('st-mine').addEventListener('change',()=>refreshLibrary().catch(e=>message(e.message,true)));
  $('st-pdf-revision').addEventListener('click',()=>pdf('Revisione'));
  $('st-pdf-original').addEventListener('click',()=>pdf('Originale'));
  window.addEventListener('beforeunload',e=>{if(app.dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',()=>{for(const item of app.photos)URL.revokeObjectURL(item.url);try{app.stopTess?.();}catch{}});
}
async function init(){
  setup();app.editor=new SnapEditor(()=>{if(!app.document)return;app.dirty=true;$('st-unsaved').hidden=false;});
  try{
    app.user=getCurrentUser();app.admin=await isAdmin();app.authorized=true;photoButtons();$('st-admin-filter').hidden=!app.admin;
    message(`Accesso OTP verificato. ${app.admin?'Modalità amministratore.':'I tuoi documenti sono privati.'}`);
  }catch(e){message(`${e.message} SnapText richiede una sessione OTP; l'accesso legacy non basta per il database.`,true);$('st-start').disabled=true;}
}
init().catch(e=>message(e.message,true));

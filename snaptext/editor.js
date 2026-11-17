// Editor Revisione Quill. Il JSON Originale e i metadati OCR rimangono fuori dall'editor.
const Quill=window.Quill;
let registered=false;
function registerFormats(){
  if(registered)return;
  if(!Quill)throw Error('Quill non caricato.');
  const Inline=Quill.import('blots/inline');
  class OcrDoubt extends Inline {
    static blotName='ocrDoubt';static tagName='span';static className='st-ocr-doubt';
    static create(value){const node=super.create();node.dataset.doubtId=String(value);node.title='Punto OCR da verificare';return node;}
    static formats(node){return node.dataset.doubtId;}
  }
  Quill.register(OcrDoubt,true);
  const BlockEmbed=Quill.import('blots/block/embed');
  class SnapNote extends BlockEmbed {
    static blotName='snapNote';static tagName='div';static className='st-note';
    static create(value){
      const el=super.create(),data=value && typeof value==='object'?value:{};
      el.dataset.id=String(data.id||'');el.dataset.quote=String(data.quote||'');el.dataset.body=String(data.body||'');el.contentEditable='false';
      const header=document.createElement('div');header.className='st-note-head';header.textContent='Nota personale';
      const quote=document.createElement('span');quote.className='st-note-quote';quote.textContent=`«${el.dataset.quote}»`;
      const body=document.createElement('div');body.className='st-note-body';body.textContent=el.dataset.body;
      const actions=document.createElement('div');actions.className='st-note-actions';
      for(const [action,label] of [['edit','Modifica'],['delete','Elimina']]){
        const button=document.createElement('button');button.type='button';button.dataset.noteAction=action;button.textContent=label;actions.append(button);
      }
      el.append(header,quote,body,actions);return el;
    }
    static value(el){return {id:el.dataset.id,quote:el.dataset.quote,body:el.dataset.body};}
  }
  Quill.register(SnapNote,true);registered=true;
}
const $=id=>document.getElementById(id);
export class SnapEditor{
  constructor(onChange){
    registerFormats();this.onChange=onChange;this.ocrAlternatives={};this.currentDoubt=null;this.pendingSelection=null;this.noteDraft=null;this.internal=false;
    this.quill=new Quill('#st-editor',{theme:'snow',modules:{toolbar:'#st-toolbar',history:{delay:650,maxStack:100,userOnly:true}},formats:['bold','italic','underline','strike','background','header','ocrDoubt','snapNote']});
    this.quill.root.spellcheck=true;this.quill.root.lang='it';this.quill.root.setAttribute('autocapitalize','sentences');
    this.quill.on('selection-change',range=>{if(range)this.pendingSelection={...range};});
    this.quill.on('text-change',(delta,old,source)=>{
      if(this.internal || source!=='user')return;
      // Una porzione OCR modificata dall'utente non rimane marcata come dubbio.
      const bounds=[];let at=0;
      for(const op of delta.ops||[]){
        if(op.retain){at+=typeof op.retain==='number'?op.retain:0;continue;}
        if(op.insert){const len=typeof op.insert==='string'?op.insert.length:1;bounds.push([Math.max(0,at-1),len+2]);at+=len;}
        if(op.delete){bounds.push([Math.max(0,at-1),2]);}
      }
      if(bounds.length){
        this.internal=true;
        try {for(const [pos,len] of bounds){const n=Math.min(len,this.quill.getLength()-pos);if(n>0)this.quill.formatText(pos,n,'ocrDoubt',false,'silent');}}
        finally{this.internal=false;}
      }
      this.updateCount();this.onChange?.();
    });
    this.quill.root.addEventListener('click',event=>{
      const noteButton=event.target.closest('.st-note-actions [data-note-action]');
      if(noteButton){this.handleNoteAction(noteButton);return;}
      const doubt=event.target.closest('.st-ocr-doubt[data-doubt-id]');
      if(doubt)this.showAlternative(doubt.dataset.doubtId);
    });
    $('st-add-note').addEventListener('click',()=>this.beginNote());
    $('st-note-cancel').addEventListener('click',()=>this.closeNote());
    $('st-note-form').addEventListener('submit',e=>{e.preventDefault();this.applyNote();});
    $('st-doubt-close').addEventListener('click',()=>{$('st-alternatives').hidden=true;});
  }
  load(doc){
    this.ocrAlternatives=doc?.alternatives||{};
    this.quill.root.lang=doc.language||'it';
    this.internal=true;
    try{this.quill.setContents(doc.delta||{ops:[{insert:'\n'}]},'silent');this.quill.history.clear();}
    finally{this.internal=false;}
    this.updateCount();this.closeNote();$('st-alternatives').hidden=true;
  }
  getDelta(){return structuredClone(this.quill.getContents());}
  updateCount(){
    const count=this.quill.root.querySelectorAll('.st-ocr-doubt[data-doubt-id]').length;
    $('st-doubt-count').textContent=`${count} punti da verificare`;
  }
  showAlternative(id){
    const item=this.ocrAlternatives[id]||{};
    $('st-alt-title').textContent='Punto da verificare';
    $('st-alt-tess').textContent=item.tesseract || 'Non disponibile';
    $('st-alt-paddle').textContent=item.paddle || 'Non disponibile';
    $('st-alt-reason').textContent=item.reason || 'Controlla la fotografia originale.';
    $('st-alternatives').hidden=false;
  }
  beginNote(){
    const range=this.quill.getSelection()||this.pendingSelection;
    if(!range||!range.length){alert('Seleziona prima una parola o una frase.');return;}
    const quote=this.quill.getText(range.index,range.length).trim().slice(0,250);
    if(!quote){alert('Seleziona del testo, non una nota.');return;}
    const end=range.index+range.length;
    const tail=this.quill.getText(end);
    const newline=tail.indexOf('\n');
    const insertAt=newline>=0?end+newline+1:this.quill.getLength()-1;
    this.noteDraft={mode:'add',index:insertAt,id:crypto.randomUUID(),quote};
    $('st-note-form-title').textContent='Aggiungi nota';$('st-note-quote').textContent=`Riferita a: «${quote}»`;
    $('st-note-text').value='';$('st-note-form').hidden=false;$('st-note-text').focus();
  }
  handleNoteAction(button){
    const node=button.closest('.st-note');if(!node)return;
    const blot=Quill.find(node);if(!blot)return;
    const index=this.quill.getIndex(blot);
    if(button.dataset.noteAction==='delete'){
      if(!confirm('Eliminare questa nota?'))return;
      this.quill.deleteText(index,1,'user');this.onChange?.();return;
    }
    this.noteDraft={mode:'edit',index,id:node.dataset.id,quote:node.dataset.quote};
    $('st-note-form-title').textContent='Modifica nota';$('st-note-quote').textContent=`Riferita a: «${node.dataset.quote}»`;
    $('st-note-text').value=node.dataset.body;$('st-note-form').hidden=false;$('st-note-text').focus();
  }
  applyNote(){
    if(!this.noteDraft)return;
    const body=$('st-note-text').value.trim();if(!body)return;
    const info=this.noteDraft;
    if(info.mode==='edit')this.quill.deleteText(info.index,1,'user');
    this.quill.insertEmbed(info.index,'snapNote',{id:info.id,quote:info.quote,body},'user');
    this.closeNote();this.onChange?.();
  }
  closeNote(){$('st-note-form').hidden=true;this.noteDraft=null;}
}

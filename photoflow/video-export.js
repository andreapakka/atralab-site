/* PhotoFlow: local, finite, real-time video export. No changes to playback or storage. */
window.PFVideoExport=(()=>{
  const $=id=>document.getElementById(id), dialog=$('pf-export-dialog'), size=$('pf-export-size'), music=$('pf-export-music'), start=$('pf-export-start'), cancel=$('pf-export-cancel'), status=$('pf-export-status'), progress=$('pf-export-progress');
  const cfg=PF.video;
  let job=null, data=null, resolveDialog=null;
  const say=t=>status.textContent=t;
  const format=(seconds)=>`${Math.floor(seconds/60)} min ${Math.ceil(seconds%60)} s`;
  function filename(title,ext,date=new Date()){
    const clean=String(title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_').replace(/[^A-Za-z0-9_]/g,'').replace(/_+/g,'_').replace(/^_|_$/g,'').slice(0,80)||'Slideshow';
    const stamp=[date.getFullYear(),date.getMonth()+1,date.getDate(),date.getHours(),date.getMinutes(),date.getSeconds()].map(n=>String(n).padStart(2,'0')).join('');
    return `${clean}_PhotoFlow_ATRALAB_${stamp}.${ext}`;
  }
  function chooseType(withAudio){
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return null;
    const options=withAudio?['video/mp4;codecs=avc1.420034,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm']:['video/mp4;codecs=avc1.420034','video/mp4','video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'];
    return options.find(t=>MediaRecorder.isTypeSupported(t))||null;
  }
  function settings(){return {...PF.defaults,...data.slideshow.settings};}
  function duration(s,audio){return data.photos.length*s.photoSeconds+(s.transition==='none'?0:Math.max(0,data.photos.length-1)*s.transitionSeconds)+(audio?s.musicLeadSeconds:0);}
  function info(){const type=chooseType(music.checked);$('pf-export-info').textContent=`Durata indicativa: ${format(duration(settings(),music.checked))}. ${type?'Formato: '+(type.includes('mp4')?'MP4':'WebM')+'.':'Esportazione non supportata.'} Verrà esportato un solo ciclo.`;start.disabled=!type;}
  function abort(j){if(!j)return;j.aborted=true;j.controller.abort();if(j.recorder?.state!=='inactive')try{j.recorder?.stop();}catch{};}
  function check(j){if(j.aborted)throw Error(j.reason||'Esportazione annullata.');if(j.failure)throw j.failure;}
  async function fetchBlob(url,j){const ctrl=new AbortController(), stop=()=>ctrl.abort();j.controller.signal.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,cfg.loadTimeoutMs);try{check(j);const r=await fetch(url,{mode:'cors',credentials:'omit',signal:ctrl.signal});if(!r.ok)throw Error('Risorsa non disponibile');return await r.blob();}finally{clearTimeout(timer);j.controller.signal.removeEventListener('abort',stop);}}
  async function image(photo,j){let blob;try{blob=await fetchBlob(photo.image_url,j);}catch{check(j);const d=await pfApi('photo_url',{slideshowId:j.data.slideshow.id,photoId:photo.id});blob=await fetchBlob(d.image_url,j);}check(j);const bitmap=await createImageBitmap(blob);if(j.aborted){bitmap.close();check(j);}j.bitmaps.add(bitmap);return bitmap;}
  function dispose(j,im){if(im){im.close();j.bitmaps.delete(im);}}
  function drawImage(ctx,im,w,h,fit,background,alpha=1,dx=0,zoom=1){ctx.save();ctx.globalAlpha=alpha;ctx.translate(dx,0);ctx.translate(w/2,h/2);ctx.scale(zoom,zoom);ctx.translate(-w/2,-h/2);ctx.fillStyle=background;ctx.fillRect(0,0,w,h);const k=(fit==='cover'?Math.max:Math.min)(w/im.width,h/im.height);const iw=im.width*k,ih=im.height*k;ctx.drawImage(im,(w-iw)/2,(h-ih)/2,iw,ih);ctx.restore();}
  function credit(ctx,w,h,track){if(!track)return;const fs=Math.max(13,Math.round(w/85));ctx.save();ctx.font=`${fs}px sans-serif`;ctx.textAlign='center';ctx.fillStyle='#000b';ctx.fillRect(0,h-fs*4,w,fs*4);ctx.fillStyle='white';ctx.fillText(`${track.title} — ${track.author}`,w/2,h-fs*2.7,w-20);ctx.fillText(`${track.license} · ${track.licenseUrl} · Audio adattato a PhotoFlow`,w/2,h-fs*1.5,w-20);ctx.fillText(track.original||track.source,w/2,h-fs*.35,w-20);ctx.restore();}
  async function segment(j,ms,paint){check(j);const begin=performance.now();while(true){check(j);const elapsed=Math.min(ms,performance.now()-begin);paint(ms?elapsed/ms:1);progress.value=Math.min(.99,(j.elapsed+elapsed/1000)/j.total);say(`Esportazione… ${Math.floor(progress.value*100)}%`);if(elapsed>=ms)break;await new Promise(r=>requestAnimationFrame(r));}j.elapsed+=ms/1000;}
  async function record(j,context){
    const s={...PF.defaults,...j.data.slideshow.settings}, track=j.withAudio?PFMusic.get(s.musicId):null;
    const [w,h]=cfg.sizes[j.size];let audioBuffer=null,audioSource=null,gain=null,stream=null,recorder=null,wake=null,downloadUrl=null;
    const chunks=[];let bytes=0;
    const visibility=()=>{if(document.hidden){j.reason='Pagina non più in primo piano. Riprova.';abort(j);}};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',visibility);
    try{
      if(document.hidden)throw Error('Mantieni la pagina in primo piano.');
      if(track){say('Preparazione musica…');try{if(!context||context.state!=='running')throw Error('Audio bloccato');const blob=await fetchBlob(track.url,j);audioBuffer=await context.decodeAudioData(await blob.arrayBuffer());}catch{check(j);throw Error('Musica non esportabile da questa sorgente. Puoi riprovare senza musica.');}}
      check(j);say('Preparazione fotografie…');let current=await image(j.data.photos[0],j);check(j);
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas non disponibile.');
      const paint=(old,next,kind,t)=>{ctx.fillStyle=s.background;ctx.fillRect(0,0,w,h);drawImage(ctx,old,w,h,s.fit,s.background);if(next){t=t*t*(3-2*t);if(kind==='slide')drawImage(ctx,next,w,h,s.fit,s.background,1,w*(1-t));else if(kind==='zoom')drawImage(ctx,next,w,h,s.fit,s.background,t,0,1.12-.12*t);else drawImage(ctx,next,w,h,s.fit,s.background,t);}credit(ctx,w,h,track);};
      paint(current);if(audioBuffer&&s.musicLeadSeconds){ctx.fillStyle=s.background;ctx.fillRect(0,0,w,h);credit(ctx,w,h,track);}stream=canvas.captureStream(cfg.fps);
      if(audioBuffer){const dest=context.createMediaStreamDestination();audioSource=context.createBufferSource();audioSource.buffer=audioBuffer;audioSource.loop=s.musicLoop;gain=context.createGain();audioSource.connect(gain);gain.connect(dest);for(const t of dest.stream.getAudioTracks())stream.addTrack(t);}
      const mimeType=chooseType(!!audioBuffer);if(!mimeType)throw Error('Formati video non supportati.');
      recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:cfg.videoBits[j.size],audioBitsPerSecond:cfg.audioBits});j.recorder=recorder;
      const done=new Promise(resolve=>{recorder.onstop=resolve;recorder.onerror=()=>{j.failure=Error('Registrazione video non riuscita.');abort(j);resolve();};});
      recorder.ondataavailable=e=>{if(e.data.size&&!j.aborted){bytes+=e.data.size;if(bytes>cfg.maxBytes){j.reason='Video troppo grande. Prova in HD o riduci la durata.';abort(j);}else chunks.push(e.data);}};
      if(navigator.wakeLock)try{wake=await navigator.wakeLock.request('screen');}catch{}check(j);
      recorder.start(1000);
      if(audioSource){const now=context.currentTime,vol=s.volume/100;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(vol,now+Math.min(PF.audioFadeSeconds,j.total/2));audioSource.start(now);}
      if(audioBuffer&&s.musicLeadSeconds)await segment(j,s.musicLeadSeconds*1000,()=>{ctx.fillStyle=s.background;ctx.fillRect(0,0,w,h);credit(ctx,w,h,track);});
      for(let i=0;i<j.data.photos.length;i++){
        check(j);const following=i+1<j.data.photos.length?image(j.data.photos[i+1],j):null;following?.catch(()=>{});
        if(!following&&gain){const now=context.currentTime,end=now+s.photoSeconds;const v=gain.gain.value;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(v,now);gain.gain.setValueAtTime(s.volume/100,Math.max(now,end-PF.audioFadeSeconds));gain.gain.linearRampToValueAtTime(0,end);}
        await segment(j,s.photoSeconds*1000,()=>paint(current));
        if(following){say('Preparazione foto successiva…');const next=await following;check(j);let kind=s.transition;if(kind==='auto')kind=['fade','slide','zoom'][Math.floor(Math.random()*3)];if(kind!=='none')await segment(j,s.transitionSeconds*1000,t=>paint(current,next,kind,t));dispose(j,current);current=next;paint(current);}
      }
      recorder.stop();await done;check(j);if(!bytes)throw Error('Video vuoto. Riprova.');
      const actual=recorder.mimeType||mimeType,ext=actual.includes('mp4')?'mp4':'webm';const blob=new Blob(chunks,{type:actual});downloadUrl=URL.createObjectURL(blob);const a=document.createElement('a');a.href=downloadUrl;a.download=filename(j.data.slideshow.title,ext);document.body.append(a);a.click();a.remove();const url=downloadUrl;downloadUrl=null;setTimeout(()=>URL.revokeObjectURL(url),60000);progress.value=1;say(`Video pronto (${(blob.size/1024**2).toFixed(1)} MB). Download avviato.`);
    }finally{
      j.aborted=true;j.controller.abort();if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{};try{audioSource?.stop();}catch{};stream?.getTracks().forEach(t=>t.stop());for(const im of j.bitmaps)im.close();j.bitmaps.clear();if(downloadUrl)URL.revokeObjectURL(downloadUrl);if(context)await context.close().catch(()=>{});if(wake)await wake.release().catch(()=>{});document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',visibility);
    }
  }
  async function begin(){if(job)return;const track=PFMusic.get(settings().musicId);let context=null;const withAudio=music.checked&&!!track;const j={data,size:size.value,withAudio,total:duration(settings(),withAudio),elapsed:0,controller:new AbortController(),bitmaps:new Set(),aborted:false};job=j;start.disabled=true;size.disabled=true;music.disabled=true;cancel.textContent='Annulla';progress.value=0;
    try{if(withAudio){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Audio non esportabile. Riprova senza musica.');context=new C();await context.resume();}await record(j,context);}catch(e){say(j.reason||(j.aborted?'Esportazione annullata.':e.message||'Esportazione non riuscita.'));}finally{if(context&&context.state!=='closed')await context.close().catch(()=>{});job=null;size.disabled=false;music.disabled=!track;cancel.textContent='Chiudi';info();}}
  start.onclick=begin;cancel.onclick=()=>{if(job){abort(job);say('Annullamento…');}else dialog.close();};dialog.addEventListener('cancel',e=>{if(job){e.preventDefault();abort(job);}});dialog.addEventListener('close',()=>{if(job)abort(job);data=null;resolveDialog?.();resolveDialog=null;});music.onchange=info;size.onchange=info;
  function open(d){data=d;size.replaceChildren(...Object.entries(cfg.sizes).map(([k,v])=>new Option(`${k==='hd'?'HD':'Full HD'} (${v.join(' × ')})`,k)));size.value=cfg.defaultSize;const track=PFMusic.get(settings().musicId);music.checked=!!track;music.disabled=!track;progress.value=0;say('');info();dialog.showModal();return new Promise(resolve=>resolveDialog=resolve);}
  return {open,filename};
})();

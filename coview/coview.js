/* CoView V1 — GitHub Pages / ATRALAB. Un solo ruolo per dispositivo. */
(() => {
  'use strict';
  const cfg = window.COVIEW_CONFIG;
  if (!cfg) return;
  const $ = id => document.getElementById(id);
  const ui = {
    status: $('cv-status'), start: $('cv-start'), session: $('cv-session'), join: $('cv-join'),
    codeInput: $('cv-code-input'), joinBtn: $('cv-join-btn'), back: $('cv-back'),
    chooseViewer: $('cv-choose-viewer'), chooseSender: $('cv-choose-sender'),
    roleLabel: $('cv-role-label'), title: $('cv-session-title'), live: $('cv-live'),
    codeBox: $('cv-code-box'), displayCode: $('cv-display-code'), codeExpiry: $('cv-code-expiry'),
    copyCode: $('cv-copy-code'), video: $('cv-video'), overlay: $('cv-video-overlay'),
    pause: $('cv-pause'), audio: $('cv-audio'), switchCam: $('cv-switch-camera'),
    photo: $('cv-photo'), fullscreen: $('cv-fullscreen'), end: $('cv-end'),
    note: $('cv-device-note'), galleryBox: $('cv-gallery-box'), gallery: $('cv-gallery'),
    photoCount: $('cv-photo-count'), dialog: $('cv-photo-dialog'), largePhoto: $('cv-large-photo'),
    closePhoto: $('cv-close-photo')
  };
  let role = null, session = null, stream = null, pc = null, dataChannel = null;
  let cameraFacing = 'environment', audioEnabled = false, paused = false, watchingPaused = false;
  let pollTimer = null, pollBusy = false, reconnectTimer = null, negotiationSeen = null;
  let currentNegId = null, makingOffer = false, peerEpoch = 0;
  let ended = false, wakeLock = null, captureUrls = [], joining = false;
  const text = (node, value) => { node.textContent = value; };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const status = (message, isError = false) => { text(ui.status, message); ui.status.dataset.error = String(isError); };
  const overlay = message => { text(ui.overlay, message); ui.overlay.hidden = !message; };
  const connected = isLive => { ui.live.dataset.live = String(isLive); text(ui.live, isLive ? '● LIVE' : 'IN ATTESA'); };
  function handleError(error, friendly) {
    console.error('CoView:', error);
    status(friendly || String(error.message || error), true);
  }
  function getToken() {
    if (typeof window.getAtralabSupabaseSession !== 'function') throw new Error('sessione_atralab_non_disponibile');
    const s = window.getAtralabSupabaseSession();
    if (!s?.access_token) throw new Error('accesso_otp_necessario');
    return s.access_token;
  }
  async function api(body, { timeout = cfg.apiTimeoutMs } = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(cfg.apiUrl, {
        method: 'POST', mode: 'cors', cache: 'no-store', signal: controller.signal,
        headers: {'Content-Type':'application/json', Authorization: `Bearer ${getToken()}`},
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        const e = new Error(data?.error || `HTTP ${response.status}`);
        e.code = data?.error || 'network_error'; e.status = response.status;
        throw e;
      }
      return data;
    } finally { clearTimeout(t); }
  }
  const request = (action, values = {}) => {
    if (!session) throw new Error('sessione_non_disponibile');
    return api({ action, id: session.id, secret: session.secret, ...values });
  };
  function setButtons() {
    const active = Boolean(session) && !ended;
    ui.pause.disabled = !active || (role === 'viewer' && !pc);
    text(ui.pause, paused || watchingPaused ? 'Riprendi' : 'Pausa');
    ui.audio.disabled = !active;
    text(ui.audio, role === 'sender' ? (audioEnabled ? 'Microfono acceso' : 'Microfono spento') : (audioEnabled ? 'Audio attivo' : 'Ascolto spento'));
    ui.switchCam.hidden = role !== 'sender';
    ui.photo.hidden = role !== 'viewer';
    ui.photo.disabled = role !== 'viewer' || !pc || !ui.video.videoWidth || watchingPaused || ended;
  }
  async function releaseWake() { try { await wakeLock?.release(); } catch (_) {} wakeLock = null; }
  async function acquireWake() {
    if (!session || ended || role !== 'sender' || document.visibilityState !== 'visible' || !navigator.wakeLock?.request || wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true }); }
    catch (e) { console.info('CoView: wake lock non disponibile', e); }
  }
  function stopMedia() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    ui.video.srcObject = null;
  }
  function resetPeer() {
    peerEpoch++;
    if (dataChannel) { try { dataChannel.close(); } catch (_) {} }
    dataChannel = null;
    if (pc) { pc.onconnectionstatechange = null; pc.oniceconnectionstatechange = null; pc.ontrack = null; try { pc.close(); } catch (_) {} }
    pc = null;
    currentNegId = null;
    negotiationSeen = null;
    makingOffer = false;
    if (role === 'viewer') ui.video.srcObject = null;
    setButtons();
  }
  async function finish(fromRemote = false) {
    if (ended) return;
    ended = true;
    clearInterval(pollTimer); clearTimeout(reconnectTimer);
    if (!fromRemote && session) { try { await request('end'); } catch (e) { console.warn('CoView: impossibile chiudere la sessione sul server', e); } }
    resetPeer(); stopMedia(); await releaseWake();
    captureUrls.forEach(URL.revokeObjectURL); captureUrls = [];
    ui.gallery.replaceChildren(); session = null;
    ui.session.hidden = true; ui.start.hidden = false; ui.join.hidden = true;
    ui.codeInput.value = ''; ui.galleryBox.hidden = true;
    connected(false);
    status(fromRemote ? 'L’altro dispositivo ha terminato la sessione.' : 'Sessione terminata. Per ricominciare crea un nuovo codice.');
  }
  async function startViewer() {
    if (session || joining) return;
    joining = true; ui.chooseViewer.disabled = true;
    try {
      const out = await api({ action: 'create' });
      role = 'viewer'; ended = false; session = { id: out.id, secret: out.secret, code: out.code, expires: out.code_expires_at };
      ui.start.hidden = true; ui.session.hidden = false;
      text(ui.roleLabel, 'GUARDA'); text(ui.title, 'Attendi il dispositivo che mostra');
      ui.codeBox.hidden = false; text(ui.displayCode, out.code.replace(/(\d{3})(\d{3})/, '$1 $2'));
      const expiry = new Date(out.code_expires_at);
      text(ui.codeExpiry, Number.isNaN(expiry.valueOf()) ? '' : `Il codice scade alle ${expiry.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} se nessuno si collega.`);
      ui.galleryBox.hidden = false; ui.note.textContent = 'Le foto vengono salvate su Supabase. L’audio parte spento.';
      ui.video.muted = true; ui.video.autoplay = true; ui.video.playsInline = true;
      connected(false); overlay('In attesa dell’altro dispositivo…');
      status('Comunica il codice a sei cifre al dispositivo che deve MOSTRARE.');
      setButtons(); startPolling();
    } catch (e) { handleError(e, 'Impossibile creare il codice. Controlla il login ATRALAB e Supabase.'); }
    finally { joining = false; ui.chooseViewer.disabled = false; }
  }
  function showSenderForm() { ui.join.hidden = false; ui.codeInput.focus(); status('Inserisci il codice mostrato sul dispositivo GUARDA.'); }
  async function openCamera(withAudio = false) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('fotocamera_non_supportata');
    const requestConstraints = {
      video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
      audio: withAudio ? { echoCancellation: true, noiseSuppression: true } : false
    };
    try { return await navigator.mediaDevices.getUserMedia(requestConstraints); }
    catch (error) {
      if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: withAudio });
      }
      throw error;
    }
  }
  async function joinSender() {
    if (session || joining) return;
    const code = ui.codeInput.value.replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) { status('Il codice deve contenere esattamente sei cifre.', true); return; }
    joining = true; ui.joinBtn.disabled = true;
    try {
      // L'autorizzazione della fotocamera nasce da un gesto volontario (Collega).
      const newStream = await openCamera(false);
      let result;
      try { result = await api({ action: 'join', code }); }
      catch (e) { newStream.getTracks().forEach(track => track.stop()); throw e; }
      stream = newStream; role = 'sender'; ended = false;
      session = {id:result.id, secret:result.secret};
      ui.video.srcObject = stream; ui.video.muted = true; ui.video.play().catch(() => {});
      ui.start.hidden = true; ui.session.hidden = false; ui.codeBox.hidden = true;
      text(ui.roleLabel, 'MOSTRA'); text(ui.title, 'Fotocamera condivisa');
      text(ui.note, 'Tieni questa pagina aperta e il dispositivo attivo. Il microfono è spento per impostazione iniziale.');
      ui.galleryBox.hidden = true; connected(false); overlay('Collegamento in corso…');
      status('Dispositivo collegato al codice. Avvio della trasmissione…');
      await acquireWake(); setButtons(); startPolling();
      await sendOffer();
    } catch (e) { handleError(e, 'Collegamento non riuscito. Controlla il codice, la fotocamera e i permessi del browser.'); }
    finally { joining = false; ui.joinBtn.disabled = false; }
  }
  function createPeer() {
    resetPeer();
    const epoch = peerEpoch;
    const peer = new RTCPeerConnection({iceServers:cfg.iceServers});
    pc = peer;
    peer.onconnectionstatechange = () => {
      if (peer !== pc || epoch !== peerEpoch || ended) return;
      const st = peer.connectionState;
      if (st === 'connected') {
        clearTimeout(reconnectTimer); connected(true); overlay(role === 'sender' && paused ? 'Trasmissione in pausa' : (role === 'viewer' && watchingPaused ? 'Visione in pausa' : ''));
        status('Collegamento attivo.'); setButtons();
      } else if (st === 'disconnected' || st === 'failed') {
        connected(false); overlay('Collegamento interrotto. Tentativo di ripristino…');
        scheduleReconnect();
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (peer === pc && peer.iceConnectionState === 'failed' && !ended) scheduleReconnect();
    };
    peer.ondatachannel = event => { if (role === 'viewer') attachChannel(event.channel); };
    peer.ontrack = event => {
      if (role !== 'viewer') return;
      const remote = event.streams[0];
      if (remote && ui.video.srcObject !== remote) ui.video.srcObject = remote;
      ui.video.muted = !audioEnabled;
      ui.video.play().catch(() => { if (audioEnabled) status('Tocca “Ascolto spento/attivo” per autorizzare la riproduzione audio.'); });
      setButtons();
    };
    return peer;
  }
  function attachChannel(channel) {
    dataChannel = channel;
    channel.onopen = () => { sendControl({kind:'state',paused,audio:audioEnabled}); };
    channel.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.kind === 'state' && role === 'viewer' && !watchingPaused) {
          overlay(data.paused ? 'Trasmissione sospesa da chi mostra' : '');
        }
      } catch (_) {}
    };
  }
  function sendControl(value) {
    if (dataChannel?.readyState === 'open') dataChannel.send(JSON.stringify(value));
  }
  async function awaitIce(peer, timeoutMs = cfg.connectTimeoutMs) {
    if (peer.iceGatheringState === 'complete') return;
    await new Promise(resolve => {
      let done = false;
      const finishIce = () => { if(done) return; done = true; peer.removeEventListener('icegatheringstatechange', onChange); clearTimeout(timer); resolve(); };
      const onChange = () => { if(peer.iceGatheringState === 'complete' || peer.signalingState === 'closed') finishIce(); };
      const timer = setTimeout(finishIce, timeoutMs);
      peer.addEventListener('icegatheringstatechange', onChange);
      onChange();
    });
  }
  async function sendOffer() {
    if (ended || !session || !stream || makingOffer) return;
    makingOffer = true;
    try {
      const peer = createPeer();
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
      attachChannel(peer.createDataChannel('coview-control'));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await awaitIce(peer);
      if (peer !== pc || ended) return;
      const reply = await request('signal', {kind:'offer',sdp:{type:'offer',sdp:peer.localDescription.sdp}});
      currentNegId = reply.negotiation_id;
      status('Richiesta video inviata. Attendo la risposta…');
      const pendingPeer = peer;
      setTimeout(() => {
        if (!ended && pendingPeer === pc && pendingPeer.connectionState !== 'connected') scheduleReconnect();
      }, cfg.connectTimeoutMs);
    } catch (e) { handleError(e, 'Errore durante la negoziazione WebRTC. Riproveremo.'); scheduleReconnect(); }
    finally { makingOffer = false; }
  }
  async function acceptOffer(state) {
    if (!state.offer || !state.negotiation_id || ended || negotiationSeen === state.negotiation_id) return;
    const negId = state.negotiation_id;
    negotiationSeen = negId;
    try {
      const peer = createPeer();
      negotiationSeen = negId;
      await peer.setRemoteDescription(state.offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await awaitIce(peer);
      if (peer !== pc || ended) return;
      await request('signal', {kind:'answer',negotiation_id:negId,sdp:{type:'answer',sdp:peer.localDescription.sdp}});
      status('Risposta inviata. Attendo il video…');
    } catch (e) { negotiationSeen = null; handleError(e, 'Non riesco a ricevere il video. Riproveremo quando arriva una nuova offerta.'); }
  }
  function scheduleReconnect() {
    if (ended || role !== 'sender' || !session || reconnectTimer || makingOffer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; if (!ended && session) sendOffer(); }, cfg.retryMs);
  }
  async function pollOnce() {
    if (pollBusy || ended || !session) return;
    pollBusy = true;
    try {
      const state = await request('poll');
      if (state.state === 'ended') { await finish(true); return; }
      if (state.state === 'waiting') {
        if (session.expires && Date.now() >= Date.parse(session.expires)) {
          status('Il codice è scaduto. Termina e crea una nuova sessione.', true);
        }
        return;
      }
      if (state.state !== 'joined') return;
      if (role === 'viewer') {
        ui.codeBox.hidden = true;
        if (!pc || state.negotiation_id !== negotiationSeen) await acceptOffer(state);
      } else if (role === 'sender' && pc && state.answer && state.negotiation_id === currentNegId && pc.signalingState === 'have-local-offer') {
        try { await pc.setRemoteDescription(state.answer); }
        catch (e) { handleError(e, 'Errore nella risposta WebRTC.'); scheduleReconnect(); }
      }
    } catch (e) {
      if (e.code === 'session_access_denied' || e.code === 'auth_required') { handleError(e, 'Sessione ATRALAB non più valida. Ricarica e accedi nuovamente.'); clearInterval(pollTimer); }
      else if (!ended) status('Connessione al servizio momentaneamente assente. Riprovo…', true);
    } finally { pollBusy = false; }
  }
  function startPolling() { clearInterval(pollTimer); pollOnce(); pollTimer = setInterval(pollOnce, cfg.pollMs); }
  function togglePause() {
    if (!session || ended) return;
    if (role === 'sender') {
      paused = !paused;
      stream?.getVideoTracks().forEach(track => { track.enabled = !paused; });
      stream?.getAudioTracks().forEach(track => { track.enabled = audioEnabled && !paused; });
      sendControl({kind:'state',paused,audio:audioEnabled});
      overlay(paused ? 'Trasmissione in pausa' : '');
      status(paused ? 'Trasmissione sospesa; puoi riprenderla senza nuovo codice.' : 'Trasmissione ripresa.');
    } else {
      watchingPaused = !watchingPaused;
      ui.video.muted = watchingPaused || !audioEnabled;
      overlay(watchingPaused ? 'Visione in pausa' : '');
      status(watchingPaused ? 'Visione e ascolto sospesi solo su questo dispositivo.' : 'Visione ripresa in diretta.');
    }
    setButtons();
  }
  async function toggleAudio() {
    if (!session || ended) return;
    if (role === 'viewer') {
      audioEnabled = !audioEnabled;
      ui.video.muted = !audioEnabled || watchingPaused;
      if (audioEnabled && !watchingPaused) {
        try { await ui.video.play(); } catch (_) { status('Il browser non ha autorizzato la riproduzione audio.', true); }
      }
      setButtons(); return;
    }
    if (audioEnabled) {
      audioEnabled = false;
      stream?.getAudioTracks().forEach(track => {track.enabled = false;});
      sendControl({kind:'state',paused,audio:false}); setButtons(); return;
    }
    try {
      // Se non era stata acquisita una traccia audio, inserirla nella connessione attiva.
      const newMicStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      const mic = newMicStream.getAudioTracks()[0];
      if (!session || ended || role !== 'sender' || !stream) {mic.stop();return;}
      const old = stream.getAudioTracks()[0];
      if (old) { stream.removeTrack(old); old.stop(); }
      mic.enabled = !paused; stream.addTrack(mic);
      const sender = pc?.getSenders().find(item => item.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(mic);
      else if (pc) { pc.addTrack(mic, stream); await sendOffer(); }
      audioEnabled = true;
      sendControl({kind:'state',paused,audio:true}); setButtons();
    } catch (e) { handleError(e, 'Impossibile attivare il microfono: controlla i permessi.'); }
  }
  async function changeCamera() {
    if (role !== 'sender' || !stream || ended) return;
    ui.switchCam.disabled = true;
    const previous = cameraFacing;
    cameraFacing = previous === 'environment' ? 'user' : 'environment';
    try {
      const next = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacing},width:{ideal:1280},height:{ideal:720}},audio:false});
      const track = next.getVideoTracks()[0];
      if (!track) throw new Error('camera_missing');
      if (!session || ended) {track.stop();return;}
      const old = stream.getVideoTracks()[0];
      track.enabled = !paused;
      const sender = pc?.getSenders().find(item => item.track?.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      if (old) {stream.removeTrack(old);old.stop();}
      stream.addTrack(track); ui.video.srcObject = stream; ui.video.play().catch(() => {});
      status('Fotocamera cambiata.');
    } catch (e) {cameraFacing = previous;handleError(e,'Impossibile cambiare fotocamera su questo dispositivo.');}
    finally {ui.switchCam.disabled=false;}
  }
  async function savePhoto() {
    if (role !== 'viewer' || !pc || ended || watchingPaused || !ui.video.videoWidth || !ui.video.videoHeight) return;
    ui.photo.disabled = true;
    let blobUrl = null;
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1,cfg.maxPhotoWidth/ui.video.videoWidth);
      canvas.width = Math.max(1,Math.round(ui.video.videoWidth*scale));
      canvas.height = Math.max(1,Math.round(ui.video.videoHeight*scale));
      const ctx = canvas.getContext('2d', { alpha:false });
      ctx.drawImage(ui.video,0,0,canvas.width,canvas.height);
      let quality = cfg.jpegQuality, blob = null;
      while (quality >= .47) {
        blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',quality));
        if (blob && blob.size <= cfg.maxPhotoBytes) break;
        quality -= .10;
      }
      if (!blob || blob.size > cfg.maxPhotoBytes) throw new Error('photo_too_large');
      const base64 = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      await request('photo',{jpeg_base64:base64});
      // La galleria usa l'anteprima locale, disponibile solo nella scheda corrente.
      blobUrl = URL.createObjectURL(blob); captureUrls.push(blobUrl);
      const item = document.createElement('button'); item.type='button';
      const image = document.createElement('img');image.src=blobUrl;image.alt='Fotografia della sessione';image.loading='lazy';
      const time = document.createElement('time');time.dateTime=new Date().toISOString();time.textContent=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
      item.append(image,time);
      item.addEventListener('click',()=>{ ui.largePhoto.src=blobUrl; ui.dialog.showModal(); });
      ui.gallery.prepend(item);
      text(ui.photoCount,`${captureUrls.length} ${captureUrls.length===1?'foto':'foto'}`);
      status('Fotografia salvata su Supabase.');
    } catch(e) { handleError(e,'Non sono riuscito a salvare la foto su Supabase.'); }
    finally {setButtons();}
  }
  function confirmEnd() {
    if (!session || ended) return;
    if (window.confirm('Terminare definitivamente la sessione CoView su entrambi i dispositivi?')) finish(false);
  }
  function closePhoto() { ui.dialog.close(); ui.largePhoto.removeAttribute('src'); }
  function init() {
    if (!window.RTCPeerConnection || !navigator.mediaDevices) {
      status('Questo browser non supporta tutte le funzioni necessarie a CoView.', true);
      ui.chooseViewer.disabled = true; ui.chooseSender.disabled = true; return;
    }
    ui.chooseViewer.addEventListener('click',startViewer);
    ui.chooseSender.addEventListener('click',showSenderForm);
    ui.back.addEventListener('click',()=>{ui.join.hidden=true;status('Scegli come usare CoView.');});
    ui.joinBtn.addEventListener('click',joinSender);
    ui.codeInput.addEventListener('keydown',event=>{if(event.key==='Enter')joinSender();});
    ui.codeInput.addEventListener('input',()=>{ui.codeInput.value=ui.codeInput.value.replace(/\D/g,'').slice(0,6);});
    ui.copyCode.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(session?.code||'');status('Codice copiato.');}catch(_){status('Non è stato possibile copiare il codice.');}});
    ui.pause.addEventListener('click',togglePause);
    ui.audio.addEventListener('click',toggleAudio);
    ui.switchCam.addEventListener('click',changeCamera);
    ui.photo.addEventListener('click',savePhoto);
    ui.fullscreen.addEventListener('click',()=>{ if(document.fullscreenElement)document.exitFullscreen?.();else $('cv-video-wrap').requestFullscreen?.().catch(()=>{}); });
    ui.end.addEventListener('click',confirmEnd);
    ui.closePhoto.addEventListener('click',closePhoto);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')acquireWake();});
    window.addEventListener('online',()=>{if(session&&!ended){status('Rete disponibile. Verifico il collegamento…');pollOnce();if(role==='sender'&&pc?.connectionState==='failed')scheduleReconnect();}});
    ui.video.addEventListener('loadedmetadata',setButtons);
    status('Scegli GUARDA per generare un codice, oppure MOSTRA per collegarti.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

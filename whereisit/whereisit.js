/* WhereIsIt · V3 · gioco client-side. Nessun salvataggio o accesso al database. */
(() => {
  'use strict';
  const CFG = window.WHEREISIT_CONFIG;
  const CAT = window.WHEREISIT_EMOJI_CATALOG;
  const $ = id => document.getElementById(id);
  if (!CFG || !CAT || !$('wi-canvas')) return;

  const canvas = $('wi-canvas'), ctx = canvas.getContext('2d', { alpha: false });
  const board = $('wi-board');
  const W = CFG.world.width, H = CFG.world.height;
  const targets = CAT.targets.filter(t => t.id && Array.isArray(t.distractors));
  const catalogIds = uniqueIds(CAT.emoji);
  function uniqueIds(items) { return [...new Set((items || []).map(item => typeof item === 'string' ? item : item.id).filter(Boolean))]; }
  const $overlay = $('wi-overlay'), $status = $('wi-status');
  let game = null, background = null, images = new Map();
  let viewport = { width: 1, height: 1, dpr: 1 }, view = { scale: 1, x: 0, y: 0, base: 1 };
  let pointers = new Map(), drag = null, pinch = null, preventedTap = false;
  let animFrame = 0, clockHandle = null, loadSerial = 0, revealHandle = null;
  let soundEnabled = CFG.sound.enabledInitially, audioContext = null;
  const rand = (a, b) => a + Math.random() * (b - a);
  const int = (a, b) => Math.floor(rand(a, b + 1));
  const randomOne = arr => arr[int(0, arr.length - 1)];
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = int(0, i); [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const unique = arr => [...new Set(arr)];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const uri = id => CAT.cdnBase + id + '.svg';
  const glyph = id => { try { return id.split('-').map(n => String.fromCodePoint(parseInt(n,16))).join(''); } catch { return '◆'; } };
  const msg = t => { $status.textContent = t; };
  const overlay = t => { $overlay.textContent = t; $overlay.hidden = false; };
  const noOverlay = () => { $overlay.hidden = true; };
  const formatTime = seconds => String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  const elapsed = () => game ? Math.floor(((game.endedAt ?? performance.now()) - game.startedAt) / 1000) : 0;

  function sound(kind) {
    if (!soundEnabled) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      audioContext ||= new C();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const sequence = kind === 'win' ? [523,659,784] : kind === 'reveal' ? [440,550] : kind === 'start' ? [392,490] : [659,880];
      const now = audioContext.currentTime;
      sequence.forEach((freq, i) => {
        const osc = audioContext.createOscillator(), gain = audioContext.createGain();
        const start = now + i * 0.095, end = start + 0.18;
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001,start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, CFG.sound.volume), start + .015);
        gain.gain.exponentialRampToValueAtTime(.0001,end);
        osc.connect(gain).connect(audioContext.destination);osc.start(start);osc.stop(end + .01);
      });
    } catch (_) { /* Audio facoltativo. */ }
  }

  function coverBase() { return Math.max(viewport.width / W, viewport.height / H); }
  function limitPan() {
    const imageW = W * view.scale, imageH = H * view.scale;
    view.x = imageW <= viewport.width ? (viewport.width - imageW)/2 : clamp(view.x, viewport.width - imageW, 0);
    view.y = imageH <= viewport.height ? (viewport.height - imageH)/2 : clamp(view.y, viewport.height - imageH, 0);
  }
  function resetCamera() {
    view.base = coverBase();
    const preferred = viewport.width < 600 ? CFG.camera.mobileInitialZoom : CFG.camera.initialZoom;
    view.scale = view.base * preferred;
    view.x = (viewport.width - W * view.scale)/2;
    view.y = (viewport.height - H * view.scale)/2;
    limitPan(); drawSoon();
  }
  function zoomAt(factor, sx = viewport.width/2, sy = viewport.height/2) {
    const nx = (sx-view.x)/view.scale, ny=(sy-view.y)/view.scale;
    view.scale = clamp(view.scale * factor, view.base, view.base * CFG.camera.maxZoom);
    view.x = sx - nx * view.scale; view.y = sy - ny * view.scale;
    limitPan(); drawSoon();
  }
  function focusTarget(item) {
    const desired = clamp(Math.max(view.base * 2.1, 95/item.size), view.base, view.base * CFG.camera.maxZoom);
    view.scale = desired;
    view.x = viewport.width/2 - item.x * desired;
    view.y = viewport.height/2 - item.y * desired;
    limitPan(); drawSoon();
  }
  function resize() {
    const old = { ...viewport }, oldView = { ...view };
    const bounds = board.getBoundingClientRect();
    viewport.width = Math.max(1, Math.round(bounds.width));
    viewport.height = Math.max(1, Math.round(bounds.height));
    viewport.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewport.width * viewport.dpr);
    canvas.height = Math.round(viewport.height * viewport.dpr);
    if (!game || old.width <= 1 || old.height <= 1) { resetCamera(); return; }
    const wx = (old.width/2 - oldView.x)/oldView.scale;
    const wy = (old.height/2 - oldView.y)/oldView.scale;
    const factor = oldView.scale / Math.max(oldView.base, .00001);
    view.base = coverBase();view.scale=clamp(view.base * factor,view.base,view.base*CFG.camera.maxZoom);
    view.x = viewport.width/2 - wx * view.scale;view.y=viewport.height/2-wy*view.scale;
    limitPan();drawSoon();
  }
  // Contorno sulla silhouette trasparente dell'SVG (non sul suo rettangolo).
  // Viene preparato una sola volta per ogni emoji scaricata dal CDN.
  function outlinedSprite(img) {
    const setting = CFG.emojiOutline;
    if (!setting?.enabled) return img;
    const size = setting.assetSize || 128;
    const thickness = Math.max(0, Math.min(8, setting.thicknessPx || 0));
    const inset = Math.ceil(thickness + 3);
    const edge = size + inset * 2;
    const mask = document.createElement('canvas'); mask.width = mask.height = edge;
    const mc = mask.getContext('2d');
    mc.drawImage(img, inset, inset, size, size);
    mc.globalCompositeOperation = 'source-in';
    mc.fillStyle = setting.color || '#fff'; mc.fillRect(0, 0, edge, edge);
    const composite = document.createElement('canvas'); composite.width = composite.height = edge;
    const cc = composite.getContext('2d');
    if (thickness > 0) {
      for (let step=0; step<16; step++) {
        const angle = step * Math.PI / 8;
        cc.drawImage(mask, Math.cos(angle)*thickness, Math.sin(angle)*thickness);
      }
    }
    cc.drawImage(img, inset, inset, size, size);
    return composite;
  }
  function drawSprite(entry, id, size) {
    if (entry?.ok) {
      const src = entry.sprite || entry.img;
      // Mantiene il rapporto tra bordo e soggetto, senza contorno quadrato.
      const pad = entry.sprite && entry.sprite !== entry.img ? (src.width / (CFG.emojiOutline.assetSize || 128)) : 1;
      const side = size * pad;
      ctx.drawImage(src, -side/2, -side/2, side, side);
    } else {
      ctx.font = `${size*.82}px sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(glyph(id),0,0);
    }
  }

  function drawSoon() { if (!animFrame) animFrame = requestAnimationFrame(draw); }
  function draw() {
    animFrame = 0;
    ctx.setTransform(viewport.dpr,0,0,viewport.dpr,0,0);
    ctx.clearRect(0,0,viewport.width,viewport.height);
    ctx.fillStyle='#17202a';ctx.fillRect(0,0,viewport.width,viewport.height);
    if (!game) return;
    ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
    if (background) ctx.drawImage(background,0,0,W,H);
    else { ctx.fillStyle='#d6c29a'; ctx.fillRect(0,0,W,H); }
    const minX = -view.x/view.scale - 140, maxX = (viewport.width-view.x)/view.scale + 140;
    const minY = -view.y/view.scale - 140, maxY = (viewport.height-view.y)/view.scale + 140;
    for (const item of game.items) {
      if (item.x < minX || item.x > maxX || item.y < minY || item.y > maxY) continue;
      const entry = images.get(item.id);
      ctx.save();ctx.translate(item.x,item.y);ctx.rotate(item.rotation);
      drawSprite(entry, item.id, item.size);
      ctx.restore();
    }
    // Il livello dei protagonisti viene sempre disegnato per ultimo.
    for (const target of game.targets) {
      const item = target.item;
      const entry = images.get(item.id);
      ctx.save();ctx.translate(item.x,item.y);ctx.rotate(item.rotation);
      drawSprite(entry, item.id, item.size);
      ctx.restore();
    }
    if (game.highlight) {
      const t=game.highlight.item, pulse=1+Math.sin(performance.now()/110)*.07;
      ctx.beginPath();ctx.arc(t.x,t.y,t.size*.8*pulse,0,Math.PI*2);
      ctx.strokeStyle='#ffe159';ctx.lineWidth=7/view.scale;ctx.stroke();
    }
    ctx.restore();
    if (game.highlight) drawSoon();
  }

  function sprite(id, x, y, size, target = false) {
    return { id, x, y, size, target, rotation: rand(-CFG.placement.rotateDegrees,CFG.placement.rotateDegrees)*Math.PI/180 };
  }
  function planItems(ids, level, goalIds) {
    const placed = [], all = [], cell = CFG.placement.gridCell;
    const cells = new Map(), key = (x,y) => `${x},${y}`;
    const columns = 8, rows = 6, zoneCount = columns*rows;
    const counts = new Array(zoneCount).fill(0);
    const variation = CFG.placement.crowdedZoneVariation;
    const weights = Array.from({length:zoneCount},()=>rand(1-variation,1+variation));
    const inset = CFG.placement.margin;
    const nearby = (x,y) => {
      const cx=Math.floor(x/cell), cy=Math.floor(y/cell), found=[];
      for (let i=cx-2;i<=cx+2;i++) for (let j=cy-2;j<=cy+2;j++) {
        for (const item of cells.get(key(i,j)) || []) found.push(item);
      }
      return found;
    };
    const record = item => {
      all.push(item);
      counts[item.zone]++;
      const cellKey = key(Math.floor(item.x/cell),Math.floor(item.y/cell));
      if (!cells.has(cellKey)) cells.set(cellKey,[]);
      cells.get(cellKey).push(item);
    };
    // Scegliamo prima la zona meno carica rispetto alla sua densità desiderata.
    // Il rumore evita una griglia rigida, pur coprendo l'intera scena.
    function zone() {
      let best = 0, bestScore=Infinity;
      for (let i=0;i<zoneCount;i++) {
        const score = (counts[i]+rand(0,1.2))/weights[i];
        if (score < bestScore) {bestScore=score;best=i;}
      }
      return best;
    }
    function position(z) {
      const col=z%columns, row=Math.floor(z/columns);
      const zoneWidth=W/columns, zoneHeight=H/rows;
      return {
        x:rand(Math.max(inset,col*zoneWidth),Math.min(W-inset,(col+1)*zoneWidth)),
        y:rand(Math.max(inset,row*zoneHeight),Math.min(H-inset,(row+1)*zoneHeight))
      };
    }
    // Le emoji seguono la prospettiva dello scenario: piccole in alto,
    // più grandi verso il basso. La variazione casuale resta in ogni fascia.
    // Si applica allo stesso modo alle emoji normali e ai protagonisti.
    function sizeAt(y) {
      const t=clamp(y/H,0,1);
      const low=level.sizeTop[0]+(level.sizeBottom[0]-level.sizeTop[0])*t;
      const high=level.sizeTop[1]+(level.sizeBottom[1]-level.sizeTop[1])*t;
      return rand(low,high);
    }
    function place(id, isTarget) {
      const z=zone();
      let best=null, bestSize=0, bestPenalty=Infinity;
      for(let attempt=0;attempt<CFG.placement.attempts;attempt++) {
        const spot=position(z);
        const size=sizeAt(spot.y);
        let penalty=0;
        for (const p of nearby(spot.x,spot.y)) {
          const dist=Math.hypot(spot.x-p.x,spot.y-p.y);
          const radii=.49*(size+p.size);
          // overlap: frazione massima di compenetrazione dei due ingombri.
          const overlap=Math.max(0,(radii-dist)/radii);
          if(overlap > level.overlap) penalty += (overlap-level.overlap)*100;
          penalty += overlap*2;
          // Un target non deve finire addosso a nessun altro target.
          if(isTarget && p.target && dist < radii*1.25) penalty += 100;
        }
        if(penalty<bestPenalty) {bestPenalty=penalty;best=spot;bestSize=size;}
        if(penalty===0) break;
      }
      const item={...sprite(id,best.x,best.y,bestSize,isTarget),zone:z};
      record(item);
      if(!isTarget) placed.push(item);
      return item;
    }
    // Riempimento e target condividono gli stessi vincoli di spazio.
    for(const id of ids)place(id,false);
    const targetItems=goalIds.map(id=>place(id,true));
    return {items:placed,targetItems};
  }

  async function preload(ids, serial) {
    const pending=unique(ids).filter(id=>!images.has(id));
    let complete=0;
    // Poco traffico simultaneo: immagini ripetute condividono la stessa istanza.
    let index=0;
    async function worker() {
      while(index < pending.length) {
        const id=pending[index++];
        if (serial!==loadSerial)return;
        const img=new Image();img.crossOrigin='anonymous';
        const ok=await new Promise(resolve=>{
          const timer=setTimeout(()=>{img.onload=null;img.onerror=null;resolve(false);},5500);
          img.onload=()=>{clearTimeout(timer);resolve(true);};
          img.onerror=()=>{clearTimeout(timer);resolve(false);};
          img.src=uri(id);
        });
        images.set(id,{img,ok,sprite:ok ? outlinedSprite(img) : null});complete++;
        if (serial===loadSerial){
          if(complete%7===0)overlay(`Caricamento emoji: ${complete} / ${pending.length}`);
          drawSoon();
        }
      }
    }
    await Promise.all(Array.from({length:12},()=>worker()));
  }
  function setButtonsRunning(on) {
    $('wi-reveal').disabled=!on || !game?.selected || game?.busy;
  }
  function updateTargets() {
    const root=$('wi-targets');root.replaceChildren();
    if(!game){$('wi-progress').textContent='Da trovare';setButtonsRunning(false);return;}
    const done=game.targets.filter(t=>t.found||t.revealed).length;
    $('wi-progress').textContent=`Trovati ${done}/${game.targets.length}`;
    for(const t of game.targets) {
      const button=document.createElement('button');button.type='button';button.className='wi-target';
      const done=t.found||t.revealed;
      if(done)button.classList.add('done');if(t.revealed)button.classList.add('revealed');
      if(game.selected===t&&!done)button.classList.add('selected');
      button.disabled=done || game.busy;
      button.title=done?(t.revealed?'Svelato':'Trovato'):'Seleziona per svelare';
      button.setAttribute('aria-label',`${glyph(t.id)}: ${button.title}`);
      const img=new Image();img.alt=glyph(t.id);img.src=uri(t.id);img.loading='lazy';
      img.onerror=()=>{img.remove();button.textContent=glyph(t.id);};
      button.appendChild(img);
      button.addEventListener('click',()=>{game.selected=game.selected===t?null:t;updateTargets();});
      root.appendChild(button);
    }
    setButtonsRunning(!game.endedAt);
  }
  function finishIfDone() {
    if (!game || game.endedAt || game.targets.some(t=>!t.found&&!t.revealed)) return;
    game.endedAt=performance.now();clearInterval(clockHandle);clockHandle=null;
    $('wi-clock').textContent=formatTime(elapsed());sound('win');
    const found=game.targets.filter(t=>t.found).length;
    $('wi-finish-summary').textContent=`Tempo: ${formatTime(elapsed())} · Trovati da te: ${found} · Svelati: ${game.targets.length-found}`;
    $('wi-finish').showModal();
    msg('Hai trovato tutti i personaggi!');
    updateTargets();
  }
  function hitTarget(sx,sy,isTouch) {
    if(!game || game.endedAt || game.busy)return;
    const x=(sx-view.x)/view.scale, y=(sy-view.y)/view.scale;
    for(const t of game.targets) {
      if(t.found||t.revealed)continue;
      const item=t.item, dx=x-item.x,dy=y-item.y;
      const cs=Math.cos(item.rotation), sn=Math.sin(item.rotation);
      const rx=cs*dx+sn*dy, ry=-sn*dx+cs*dy;
      const half=item.size*.47+(isTouch?CFG.interaction.touchTolerancePx:CFG.interaction.mouseTolerancePx)/view.scale;
      if(Math.abs(rx)<=half&&Math.abs(ry)<=half) {
        t.found=true;game.selected=null;game.highlight=t;
        sound('found');updateTargets();drawSoon();
        msg('Personaggio trovato!');
        setTimeout(()=>{if(game&&game.highlight===t){game.highlight=null;drawSoon();}},600);
        finishIfDone();return;
      }
    }
  }
  async function startGame() {
    const serial=++loadSerial;
    clearInterval(clockHandle);clearTimeout(revealHandle);revealHandle=null;
    $('wi-play').disabled=true;$('wi-reveal').disabled=true;
    game=null;images=new Map();background=null;
    $('wi-targets').replaceChildren();$('wi-clock').textContent='00:00';
    overlay('Preparazione della scena…');
    const scenarioId=$('wi-scenario').value;
    const scene=scenarioId==='random'?randomOne(CFG.scenarios):CFG.scenarios.find(s=>s.id===scenarioId);
    const difficulty=CFG.difficulty[$('wi-difficulty').value];
    const count=clamp(Number($('wi-count').value),CFG.targets.min,CFG.targets.max);
    const goal=shuffle([...targets]).slice(0,count);
    const goals=new Set(goal.map(t=>t.id));
    // Escludiamo sempre i protagonisti dal riempimento: un soggetto da cercare compare una sola volta.
    const fillPool=catalogIds.filter(id=>!goals.has(id));
    if(!fillPool.length || goal.length!==count){overlay('Catalogo emoji non disponibile.');$('wi-play').disabled=false;return;}
    const ids=[];
    for(const target of goal) {
      const valid=shuffle(unique(target.distractors.filter(id=>fillPool.includes(id))));
      for(const id of valid.slice(0,difficulty.distractorsPerTarget))ids.push(id);
    }
    // Un insieme limitato di soggetti SVG, riutilizzato molte volte per restare leggeri.
    const kinds=shuffle([...fillPool]).slice(0,Math.min(80,fillPool.length));
    while(ids.length < difficulty.count - count)ids.push(randomOne(kinds));
    shuffle(ids);
    const positioned=planItems(ids.slice(0,difficulty.count-count),difficulty,goal.map(t=>t.id));
    game={scene,items:positioned.items,targets:goal.map((t,i)=>({...t,item:positioned.targetItems[i],found:false,revealed:false})),startedAt:performance.now(),endedAt:null,selected:null,busy:true,highlight:null};
    $('wi-scenario-name').textContent=scene.name;
    resetCamera();drawSoon();
    try {
      const bg=new Image();bg.decoding='async';bg.src=scene.image;
      await bg.decode();
      if(serial!==loadSerial)return;
      background=bg;drawSoon();
    } catch(err) {if(serial!==loadSerial)return;msg('Sfondo non disponibile: verifica il file nello ZIP.');}
    const spriteIds=[...ids,...goal.map(t=>t.id)];
    await preload(spriteIds,serial);
    if(serial!==loadSerial)return;
    game.busy=false;game.startedAt=performance.now();
    noOverlay();updateTargets();drawSoon();
    $('wi-play').disabled=false;
    msg('Cerca i personaggi in qualsiasi ordine. Per uno che non trovi, selezionalo nella barra e premi Svela.');
    clockHandle=setInterval(()=>{if(game&&!game.endedAt)$('wi-clock').textContent=formatTime(elapsed());},500);
    sound('start');
  }

  function reveal() {
    if(!game||game.endedAt||game.busy||!game.selected)return;
    const t=game.selected;game.selected=null;game.busy=true;t.revealed=true;game.highlight=t;
    focusTarget(t.item);sound('reveal');updateTargets();
    msg('Personaggio svelato.');
    const current=game;
    revealHandle=setTimeout(()=>{
      if(game!==current)return;
      game.highlight=null;game.busy=false;updateTargets();drawSoon();finishIfDone();
    },CFG.interaction.revealMilliseconds);
  }

  const localPoint=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  function pointerDown(e) {
    if(e.target!==canvas || !game || game.busy)return;
    e.preventDefault();canvas.setPointerCapture(e.pointerId);
    const p=localPoint(e);pointers.set(e.pointerId,p);
    if(pointers.size===1){drag={id:e.pointerId,x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:false,touch:e.pointerType==='touch'};pinch=null;preventedTap=false;}
    else if(pointers.size>=2){preventedTap=true;drag=null;const [a,b]=[...pointers.values()];pinch={dist:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}
  }
  function pointerMove(e) {
    if(!pointers.has(e.pointerId))return;
    const p=localPoint(e);pointers.set(e.pointerId,p);
    if(pointers.size>=2){
      const [a,b]=[...pointers.values()];const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(pinch){view.x+=center.x-pinch.center.x;view.y+=center.y-pinch.center.y;zoomAt(distance/pinch.dist,center.x,center.y);}
      pinch={dist:distance,center};return;
    }
    if(drag&&drag.id===e.pointerId){
      if(Math.hypot(p.x-drag.x,p.y-drag.y)>CFG.interaction.dragThresholdPx)drag.moved=true;
      if(drag.moved){view.x+=p.x-drag.lastX;view.y+=p.y-drag.lastY;limitPan();drawSoon();board.classList.add('dragging');}
      drag.lastX=p.x;drag.lastY=p.y;
    }
  }
  function pointerUp(e) {
    if(!pointers.has(e.pointerId))return;
    const p=localPoint(e), eligible=drag&&drag.id===e.pointerId&&!drag.moved&&!preventedTap&&pointers.size===1&&e.type==='pointerup';
    pointers.delete(e.pointerId);
    if(pointers.size<2)pinch=null;
    if(pointers.size===0){drag=null;board.classList.remove('dragging');}
    else {drag=null;preventedTap=true;}
    if(eligible)hitTarget(p.x,p.y,e.pointerType==='touch');
  }
  function init() {
    if(!targets.length||!catalogIds.length){overlay('Catalogo Twemoji non valido.');return;}
    for(const s of CFG.scenarios){const opt=document.createElement('option');opt.value=s.id;opt.textContent=s.name;$('wi-scenario').append(opt);}
    for(let n=CFG.targets.min;n<=CFG.targets.max;n++){const o=document.createElement('option');o.value=n;o.textContent=n;o.selected=n===CFG.targets.initial;$('wi-count').append(o);}
    $('wi-play').addEventListener('click',()=>{if(game&&!game.endedAt){$('wi-confirm').showModal();return;}startGame();});
    $('wi-confirm-no').addEventListener('click',()=>$('wi-confirm').close());
    $('wi-confirm-yes').addEventListener('click',()=>{$('wi-confirm').close();startGame();});
    $('wi-reveal').addEventListener('click',reveal);
    $('wi-again').addEventListener('click',()=>{$('wi-finish').close();startGame();});
    $('wi-finish-close').addEventListener('click',()=>$('wi-finish').close());
    $('wi-zoom-in').addEventListener('click',()=>zoomAt(1.35));
    $('wi-zoom-out').addEventListener('click',()=>zoomAt(1/1.35));
    $('wi-zoom-reset').addEventListener('click',resetCamera);
    $('wi-sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('wi-sound').textContent=soundEnabled?'♪':'♪̸';$('wi-sound').setAttribute('aria-label',soundEnabled?'Disattiva suoni':'Attiva suoni');$('wi-sound').title=soundEnabled?'Disattiva suoni':'Attiva suoni';if(soundEnabled)sound('found');});
    canvas.addEventListener('pointerdown',pointerDown);
    canvas.addEventListener('pointermove',pointerMove);
    canvas.addEventListener('pointerup',pointerUp);
    canvas.addEventListener('pointercancel',pointerUp);
    canvas.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);drag=null;pinch=null;board.classList.remove('dragging');});
    canvas.addEventListener('wheel',e=>{if(!game)return;e.preventDefault();const p=localPoint(e);zoomAt(e.deltaY<0?1.15:1/1.15,p.x,p.y);},{passive:false});
    board.addEventListener('keydown',e=>{if(!game)return;const step=50;if(e.key==='+'){zoomAt(1.3);e.preventDefault();}else if(e.key==='-'){zoomAt(1/1.3);e.preventDefault();}else if(e.key==='ArrowLeft'){view.x+=step;limitPan();drawSoon();e.preventDefault();}else if(e.key==='ArrowRight'){view.x-=step;limitPan();drawSoon();e.preventDefault();}else if(e.key==='ArrowUp'){view.y+=step;limitPan();drawSoon();e.preventDefault();}else if(e.key==='ArrowDown'){view.y-=step;limitPan();drawSoon();e.preventDefault();}});
    if(window.ResizeObserver)new ResizeObserver(resize).observe(board);else window.addEventListener('resize',resize);
    resize();updateTargets();
  }
  init();
})();

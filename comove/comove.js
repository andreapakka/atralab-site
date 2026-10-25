(() => {
'use strict';
const C=window.COMOVE_CONFIG, A=window.CoMoveAudio, $=id=>document.getElementById(id);
const DB_URL='https://pcpsbrnhfhzkjlnstgfr.supabase.co';
const DB_KEY='sb_publishable_IRKqtPwpSGWd-YbnyvXqsg_DFKZSotn';
const ACTIVE=['waiting','countdown','playing'], DIRS={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
let db,user,canCreate=false,game=null,players=[],channel=null,lobbyChannel=null,busy=false,lastTurn='',lastPosition='',lastStatus='',noticeTimer=0,previousSecond=-1,loadBusy=false;
let clockOffset=0,refreshTimer,uiTimer,heartbeatTimer,liveToken=0,lastRemoteChange=Date.now(),presenceMissingSince=0;
let refreshSerial=0,heartbeatBusy=false,turnExpirySyncKey="",lastSyncAt=0;
const notice=(text,error=false)=>{const e=$('cm-notice');e.textContent=text||'';e.style.color=error?'#ffaaa2':'';clearTimeout(noticeTimer);if(text)noticeTimer=setTimeout(()=>e.textContent='',7000);};
const timeNow=()=>Date.now()+clockOffset;
const since=s=>s?new Date(s).getTime():0;
const remaining=(start,seconds)=>Math.max(0,Math.ceil((since(start)+seconds*1000-timeNow())/1000));
const mmss=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const shortName=e=>(e||'Giocatore').split('@')[0];
const own=()=>players.some(p=>p.user_id===user?.id);
const myPlayer=()=>players.find(p=>p.user_id===user?.id);
const statusActive=g=>ACTIVE.includes(g.status);
function setView(view){$('cm-lobby').hidden=view!=='lobby';$('cm-match').hidden=view==='lobby';}
function buttonLoading(id,on){$(id).disabled=on;}
function syncAudioButton(){$('cm-audio').textContent=A.isEnabled()?'🔊 Audio':'🔇 Muto';}
function buildChoices(){const select=$('cm-emoji');C.emojis.forEach(emoji=>{const opt=document.createElement('option');opt.value=emoji;opt.textContent=emoji;select.append(opt);});select.value=C.emojis.includes(C.defaultEmoji)?C.defaultEmoji:C.emojis[0];$('cm-level').addEventListener('change',()=>{$('cm-custom').hidden=$('cm-level').value!=='custom';});[['cm-size','size'],['cm-turn','turn'],['cm-walls','walls'],['cm-holes','holes'],['cm-path','minPath']].forEach(([id,k])=>$(id).value=C.custom[k]);}
function getSetup(){let difficulty=$('cm-level').value, level;
 if(difficulty==='custom')level={size:+$('cm-size').value,turn:+$('cm-turn').value,walls:+$('cm-walls').value,holes:+$('cm-holes').value,minPath:+$('cm-path').value};else level={...C.levels[difficulty]};
 if(!Number.isInteger(level.size)||level.size<C.limits.minSize||level.size>C.limits.maxSize||!Number.isInteger(level.turn)||level.turn<C.limits.minTurn||level.turn>C.limits.maxTurn)throw Error('Dimensione o durata turno non valida');
 const cells=level.size**2;if(![level.walls,level.holes,level.minPath].every(Number.isInteger)||level.walls<0||level.holes<0||level.walls+level.holes>cells-2||level.minPath<1||level.minPath>=cells)throw Error('Numero di ostacoli o percorso minimo non valido');
 return {difficulty,level,emoji:$('cm-emoji').value};}
async function rpc(name,args={}){const {data,error}=await db.rpc('comove_'+name,args);if(error)throw Error(error.message);return data;}
async function fetchPlayers(id){const {data,error}=await db.from('comove_players').select('*').eq('game_id',id).order('seat');if(error)throw Error(error.message);return data||[];}
async function fetchGame(id){const {data,error}=await db.from('comove_games').select('*').eq('id',id).maybeSingle();if(error)throw Error(error.message);return data;}
async function loadLobby(){if(game||loadBusy)return;loadBusy=true;try{
 await rpc('tick');const {data,error}=await db.from('comove_games').select('id,creator_id,creator_email,status,difficulty,emoji,board_size,turn_seconds,created_at,countdown_at,countdown_seconds,waiting_seconds,first_move_at,duration_seconds,started_at').in('status',ACTIVE).order('created_at',{ascending:false}).limit(35);
 if(error)throw Error(error.message);const list=$('cm-lobby-list');list.replaceChildren();if(!data?.length){const p=document.createElement('p');p.className='cm-muted';p.textContent='Nessuna partita aperta. Crea la prima!';list.append(p);return;}
 const ids=data.map(g=>g.id);const {data:ps,error:pe}=await db.from('comove_players').select('game_id,user_id').in('game_id',ids);if(pe)throw Error(pe.message);
 for(const g of data){const members=(ps||[]).filter(p=>p.game_id===g.id),joined=members.some(p=>p.user_id===user.id),count=members.length;
 const row=document.createElement('div');row.className='cm-room';const meta=document.createElement('div');meta.className='cm-room-meta';const title=document.createElement('strong');title.textContent=`${g.emoji} ${shortName(g.creator_email)} · ${g.difficulty==='custom'?'Personalizzata':C.levels[g.difficulty]?.label||g.difficulty}`;const desc=document.createElement('span');desc.className='cm-muted';desc.textContent=`${count}/4 giocatori · ${g.board_size}×${g.board_size} · ${g.status==='playing'?'In corso':g.status==='countdown'?'In partenza':'In attesa'}`;meta.append(title,desc);const b=document.createElement('button');b.className=joined?'cm-primary':'cm-quiet';b.textContent=joined?'Rientra':g.status==='playing'?'In corso':count>=4?'Completa':'Partecipa';b.disabled=!joined&&(g.status==='playing'||count>=4);b.onclick=()=>joined?openGame(g.id):joinGame(g.id);row.append(meta,b);list.append(row);
 }
 }catch(e){notice('Sala d’attesa: '+e.message,true);}finally{loadBusy=false;}}
async function createGame(evt){evt.preventDefault();if(busy)return;busy=true;buttonLoading('cm-create-button',true);try{
 const {difficulty,level,emoji}=getSetup();const id=await rpc('create',{p_difficulty:difficulty,p_board_size:level.size,p_turn_seconds:level.turn,p_emoji:emoji,p_waiting_seconds:C.waitingSeconds,p_countdown_seconds:C.countdownSeconds,p_duration_seconds:C.durationSeconds});if(difficulty==='custom')localStorage.setItem('comove-custom-'+id,JSON.stringify(level));A.unlock();await openGame(id);
 }catch(e){notice('Creazione: '+e.message,true);}finally{busy=false;buttonLoading('cm-create-button',false);}}
async function joinGame(id){if(busy)return;busy=true;try{A.unlock();await rpc('join',{p_game_id:id});await openGame(id);}catch(e){notice('Ingresso: '+e.message,true);await loadLobby();}finally{busy=false;}}
async function detachChannel(){if(channel){await db.removeChannel(channel);channel=null;}presenceMissingSince=0;}
async function openGame(id){liveToken++;const token=liveToken;await detachChannel();game=await fetchGame(id);if(!game){game=null;notice('Partita non trovata',true);return;}players=await fetchPlayers(id);setView('game');window.history.replaceState(null,'',`/comove/?game=${encodeURIComponent(id)}`);lastTurn='';lastPosition='';lastStatus='';turnExpirySyncKey='';render();
 channel=db.channel('comove-match-'+id,{config:{presence:{key:user.id}}});channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'comove_games',filter:`id=eq.${id}`},()=>refreshMatch(token));channel.on('postgres_changes',{event:'INSERT',schema:'public',table:'comove_players',filter:`game_id=eq.${id}`},()=>refreshMatch(token));
 channel.on('presence',{event:'sync'},()=>{if(token!==liveToken)return;const present=Object.keys(channel.presenceState());if(game?.status==='playing'&&own()&&present.length<players.length){presenceMissingSince ||= Date.now();}else presenceMissingSince=0;});
 channel.subscribe(async status=>{if(status==='SUBSCRIBED'&&token===liveToken){try{await channel.track({at:Date.now()});}catch(e){console.warn('Presence',e);}}});
 await rpc('tick', {p_game_id:id}).catch(console.warn);await refreshMatch(token);
}
async function refreshMatch(token=liveToken){
 if(token!==liveToken||!game)return;
 const serial=++refreshSerial,id=game.id;
 try{
  const [g,ps]=await Promise.all([fetchGame(id),fetchPlayers(id)]);
  // Risposte fuori ordine non devono ripristinare vecchi turni sullo schermo.
  if(token!==liveToken||serial!==refreshSerial||game?.id!==id)return;
  if(!g){await returnLobby();return;}
  game=g;players=ps;lastRemoteChange=Date.now();render();
 }catch(e){if(token===liveToken&&serial===refreshSerial)notice('Aggiornamento: '+e.message,true);}
}
async function returnLobby(){liveToken++;await detachChannel();game=null;players=[];window.history.replaceState(null,'','/comove/');setView('lobby');await loadLobby();}
async function leaveGame(){if(!game)return;const id=game.id;if(own()&&statusActive(game)){if(!confirm('Abbandonare? La partita terminerà per tutti.'))return;try{await rpc('leave',{p_game_id:id});}catch(e){notice(e.message,true);return;}}await returnLobby();}
async function goBack(){if(game?.status==='playing'&&own()){notice('Per lasciare una partita in corso usa Abbandona.');return;}if(game&&statusActive(game)&&own()){notice('Sei ancora in questa partita. Usa Abbandona per terminarla.');return;}await returnLobby();}
function boardParameters(g){if(g.difficulty==='custom'){const n=g.board_size;try{const saved=JSON.parse(localStorage.getItem('comove-custom-'+g.id));if(saved&&saved.size===n)return saved;}catch(_){}return {size:n,walls:Math.floor(n*n*.15),holes:Math.floor(n*n*.04),minPath:Math.max(6,Math.round(n*1.4))};}return C.levels[g.difficulty]||C.levels.medium;}
function neighbors(x,y,n,blocked){return Object.values(DIRS).map(([dx,dy])=>[x+dx,y+dy]).filter(([xx,yy])=>xx>=0&&yy>=0&&xx<n&&yy<n&&!blocked.has(`${xx},${yy}`));}
function shortestDistance(start,goal,n,blocked){const seen=new Set([start.join(',')]),queue=[[...start,0]];for(let i=0;i<queue.length;i++){const [x,y,d]=queue[i];if(x===goal[0]&&y===goal[1])return d;for(const [xx,yy] of neighbors(x,y,n,blocked)){const key=`${xx},${yy}`;if(!seen.has(key)){seen.add(key);queue.push([xx,yy,d+1]);}}}return -1;}
function randomBoard(g){const o=boardParameters(g),n=g.board_size,cells=Array.from({length:n*n},(_,i)=>[i%n,Math.floor(i/n)]),wantWalls=Math.min(o.walls,n*n-2),wantHoles=Math.min(o.holes,n*n-wantWalls-2);const minPath=Math.min(o.minPath,n*n-2);
 for(let attempt=0;attempt<C.boardAttempts;attempt++){const arr=cells.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
 const start=arr[0],goal=arr[1],walls=arr.slice(2,2+wantWalls),holes=arr.slice(2+wantWalls,2+wantWalls+wantHoles);const blocked=new Set([...walls,...holes].map(p=>p.join(',')));const distance=shortestDistance(start,goal,n,blocked);if(distance>=minPath)return {start,goal,walls,holes};}
 throw Error('Impossibile generare una mappa risolvibile con questi parametri. Riduci gli ostacoli o il percorso minimo.');}
async function tryStart(){if(!game||game.status!=='countdown'||busy||remaining(game.countdown_at,game.countdown_seconds)>0)return;
 // Il primo giocatore ancora connesso prova ad avviare; la RPC garantisce unicità.
 if(!own())return;busy=true;try{const board=randomBoard(game);await rpc('start',{p_game_id:game.id,p_board:board});await refreshMatch();}catch(e){if(!/Countdown non terminato|partita non|playing|non terminato/i.test(e.message))notice('Avvio: '+e.message,true);}finally{busy=false;}}
async function action(dir){if(busy||!canMove()||(dir!=='pass'&&!myPlayer()?.directions?.includes(dir)))return;
 busy=true;updateControls();try{A.unlock();const before=JSON.stringify(game.position);const result=await rpc('move',{p_game_id:game.id,p_action:dir});await refreshMatch();if(result?.status==='won')A.play('win');else if(result?.status==='lost')A.play('hole');else if(dir!=='pass')A.play(JSON.stringify(result?.position)===before?'wall':'move');}catch(e){console.warn('CoMove: mossa rifiutata',dir,e);notice('Mossa non accettata: '+e.message,true);await refreshMatch();}finally{busy=false;updateControls();}}
function canMove(){return !!(game?.status==='playing'&&own()&&myPlayer()?.seat===game.current_turn&&remaining(game.turn_started_at,game.turn_seconds)>0&&!busy);}
function updateControls(){if(!game)return;const turn=canMove(),dirs=myPlayer()?.directions||[];document.querySelectorAll('#cm-arrows button').forEach(b=>{const active=turn&&dirs.includes(b.dataset.dir);b.disabled=!active;b.classList.toggle('available',active);});$('cm-pass').disabled=!turn;$('cm-pass').classList.toggle('available',turn);$('cm-board-wrap').classList.toggle('my-turn',turn);}
function finishTitle(status){return {won:'Obiettivo raggiunto!',lost:'Buco nero!',expired:'Tempo scaduto',cancelled:'Partita annullata'}[status]||'Partita terminata';}
function render(){if(!game)return;const g=game;$('cm-match-id').textContent='Partita '+g.id.slice(0,8);$('cm-leave').hidden=!own()||!statusActive(g);$('cm-wait').hidden=!['waiting','countdown'].includes(g.status);$('cm-play').hidden=g.status!=='playing';$('cm-finished').hidden=statusActive(g);
 if(['waiting','countdown'].includes(g.status)){$('cm-wait-title').textContent=g.status==='waiting'?'In attesa di altri giocatori…':'Si parte tra '+remaining(g.countdown_at,g.countdown_seconds)+' s';$('cm-wait-sub').textContent=g.status==='waiting'?`Scadenza tra ${mmss(remaining(g.created_at,g.waiting_seconds))}. Con 2 giocatori parte un countdown di ${g.countdown_seconds}s.`:`${players.length} giocatori: allo scadere partenza automatica.`;const list=$('cm-wait-players');list.replaceChildren();players.forEach(p=>list.append(playerBadge(p,false)));}
 if(g.status==='playing'){const prev=lastTurn,prevStatus=lastStatus;const key=`${g.id}:${g.current_turn}:${g.turn_started_at}`;if(lastStatus==='playing'&&key!==prev&&myPlayer()?.seat===g.current_turn)A.play('turn');lastTurn=key;lastStatus=g.status;const current=players.find(p=>p.seat===g.current_turn);$('cm-status').textContent=`${g.emoji} ${shortName(current?.email)} ${myPlayer()?.seat===g.current_turn?'(TOCCA A TE)':''}`;$('cm-steps').textContent=`${g.move_count} mosse`;
 const list=$('cm-players');list.replaceChildren();players.forEach(p=>list.append(playerBadge(p,p.seat===g.current_turn)));$('cm-turn-label').textContent=myPlayer()?.seat===g.current_turn?'È IL TUO TURNO':'Turno di '+shortName(current?.email);drawBoard();updateControls();}
 if(!statusActive(g)){$('cm-result-title').textContent=finishTitle(g.status);$('cm-result-sub').textContent=`${g.result_note||''} · ${g.move_count} mosse · ${players.length} giocatori`;if(g.status==='won'&&lastStatus==='playing')A.play('win');if(g.status==='lost'&&lastStatus==='playing')A.play('hole');if(g.status==='expired'&&lastStatus==='playing')A.play('lose');lastStatus=g.status;}
}
function playerBadge(p,active){const s=document.createElement('span');s.className='cm-player'+(active?' active':'')+(p.user_id===user.id?' me':'');const dirs=(p.directions||[]).map(d=>({up:'↑',down:'↓',left:'←',right:'→'})[d]).join('');s.textContent=`${p.seat}. ${shortName(p.email)} ${dirs}${p.user_id===user.id?' (tu)':''}`;return s;}
function drawBoard(){if(!game?.board)return;const canvas=$('cm-board'),wrap=$('cm-board-wrap'),rect=wrap.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),size=Math.max(160,Math.floor(Math.min(rect.width,rect.height)-4));if(!size)return;canvas.width=Math.round(size*dpr);canvas.height=Math.round(size*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);const n=game.board_size,c=size/n,b=game.board;
 ctx.fillStyle='#101922';ctx.fillRect(0,0,size,size);const path=game.path||[];
 ctx.fillStyle='rgba(243,143,58,.15)';for(const [x,y] of path)ctx.fillRect(x*c+1,y*c+1,c-2,c-2);
 ctx.strokeStyle='rgba(250,156,77,.8)';ctx.lineWidth=Math.max(2,c*.10);ctx.lineJoin='round';ctx.lineCap='round';if(path.length>1){ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo((x+.5)*c,(y+.5)*c):ctx.moveTo((x+.5)*c,(y+.5)*c));ctx.stroke();}
 ctx.strokeStyle='rgba(210,230,246,.12)';ctx.lineWidth=1;for(let i=0;i<=n;i++){ctx.beginPath();ctx.moveTo(i*c,0);ctx.lineTo(i*c,size);ctx.moveTo(0,i*c);ctx.lineTo(size,i*c);ctx.stroke();}
 for(const [x,y] of b.walls){ctx.fillStyle='#65717d';ctx.fillRect(x*c+2,y*c+2,c-4,c-4);ctx.fillStyle='#ffffff1b';ctx.fillRect(x*c+3,y*c+3,c-6,Math.max(2,c*.09));}
 for(const [x,y] of b.holes){ctx.beginPath();ctx.arc((x+.5)*c,(y+.5)*c,c*.38,0,Math.PI*2);ctx.fillStyle='#090915';ctx.fill();ctx.lineWidth=Math.max(2,c*.085);ctx.strokeStyle='#ad70da';ctx.stroke();}
 const [gx,gy]=b.goal;ctx.strokeStyle='#58e1a0';ctx.lineWidth=Math.max(2,c*.09);ctx.strokeRect(gx*c+c*.15,gy*c+c*.15,c*.7,c*.7);ctx.beginPath();ctx.arc((gx+.5)*c,(gy+.5)*c,c*.15,0,Math.PI*2);ctx.fillStyle='#66e7a9';ctx.fill();
 const [x,y]=game.position||b.start;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${Math.round(c*.70)}px system-ui,Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji`;ctx.fillText(game.emoji,(x+.5)*c,(y+.52)*c);}
function updateClock(){if(!game)return;const g=game;if(g.status==='waiting'){$('cm-wait-sub').textContent=`Scadenza tra ${mmss(remaining(g.created_at,g.waiting_seconds))}. In 2 parte il countdown di ${g.countdown_seconds}s.`;}
 if(g.status==='countdown'){$('cm-wait-title').textContent=`Si parte tra ${remaining(g.countdown_at,g.countdown_seconds)} s`;if(!remaining(g.countdown_at,g.countdown_seconds))tryStart();}
 if(g.status==='playing'){const left=g.first_move_at?remaining(g.first_move_at,g.duration_seconds):remaining(g.started_at,C.preFirstMoveSeconds);$('cm-clock').textContent=mmss(left);$('cm-turn-time').textContent=`${remaining(g.turn_started_at,g.turn_seconds)} s`;const r=remaining(g.turn_started_at,g.turn_seconds);if(canMove()&&r===2&&previousSecond!==2)A.play('warning');previousSecond=r;updateControls();
 // Quando il timer locale raggiunge zero, chiediamo al server il turno vero.
 // Il controllo per chiave evita chiamate ripetute ogni 200 ms.
 const key=`${g.id}:${g.current_turn}:${g.turn_started_at}`;
 if(r===0&&turnExpirySyncKey!==key){turnExpirySyncKey=key;heartbeat();}
 }}
async function heartbeat(){
 if(!game||heartbeatBusy||busy)return;
 heartbeatBusy=true;const token=liveToken,id=game.id;
 try{
  await rpc('tick',{p_game_id:id});
  if(token===liveToken&&game?.id===id){lastSyncAt=Date.now();await refreshMatch(token);}
 }catch(e){console.warn('CoMove tick:',e);}finally{heartbeatBusy=false;}
}
async function init(){try{if(!window.supabase?.createClient)throw Error('Libreria Supabase non caricata');buildChoices();syncAudioButton();$('cm-audio').onclick=()=>{A.toggle();syncAudioButton();};$('cm-create').addEventListener('submit',createGame);$('cm-reload').onclick=loadLobby;$('cm-back').onclick=goBack;$('cm-home').onclick=returnLobby;$('cm-leave').onclick=leaveGame;$('cm-pass').onclick=()=>action('pass');document.querySelectorAll('#cm-arrows button').forEach(b=>b.onclick=()=>action(b.dataset.dir));
 document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea')||e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;const dir={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Space:'pass'}[e.code];if(dir&&game?.status==='playing'){e.preventDefault();action(dir);}});
 document.addEventListener('pointerdown',()=>A.unlock(),{once:true});window.addEventListener('resize',()=>{if(game?.status==='playing')drawBoard();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(game)heartbeat();else loadLobby();}});
 db=window.supabase.createClient(DB_URL,DB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const {data:{session},error}=await db.auth.getSession();if(error||!session?.user)throw Error('Accedi ad ATRALAB tramite OTP per giocare.');user=session.user;$('cm-user').textContent=shortName(user.email);
 canCreate=await rpc('can_create');$('cm-create').hidden=!canCreate;
 setView('lobby');const id=new URLSearchParams(location.search).get('game');if(id)await openGame(id);else await loadLobby();
 lobbyChannel=db.channel('comove-lobby').on('postgres_changes',{event:'*',schema:'public',table:'comove_games'},()=>{if(!game)loadLobby();}).on('postgres_changes',{event:'*',schema:'public',table:'comove_players'},()=>{if(!game)loadLobby();}).subscribe();
 refreshTimer=setInterval(()=>{if(!game)loadLobby();else if(Date.now()-lastRemoteChange>C.refreshGameMs)refreshMatch();},C.refreshLobbyMs);
 uiTimer=setInterval(updateClock,200);heartbeatTimer=setInterval(()=>{if(game)heartbeat();},C.tickEveryMs);
 }catch(e){notice(e.message,true);console.error('CoMove',e);$('cm-lobby-list').textContent=e.message;}}
document.addEventListener('DOMContentLoaded',init);
})();

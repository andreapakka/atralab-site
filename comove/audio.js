/* Effetti sonori sintetizzati localmente con Web Audio API; nessun file esterno. */
window.CoMoveAudio = (() => {
  let ctx;
  const key = () => window.COMOVE_CONFIG.soundKey;
  let enabled = localStorage.getItem('comove-audio-enabled') !== 'false';
  function unlock() { if (!enabled) return; const C=window.AudioContext||window.webkitAudioContext; if (!C) return; ctx ||= new C(); if(ctx.state==='suspended') ctx.resume().catch(()=>{}); }
  function note(freq=440,dur=.09,kind='sine',volume=.045,delay=0,to=null) {
    if(!enabled) return; unlock(); if(!ctx||ctx.state!=='running') return;
    const osc=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+delay;
    osc.type=kind; osc.frequency.setValueAtTime(freq,start); if(to) osc.frequency.exponentialRampToValueAtTime(to,start+dur);
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.01);gain.gain.exponentialRampToValueAtTime(.0001,start+dur);
    osc.connect(gain).connect(ctx.destination);osc.start(start);osc.stop(start+dur+.015);
  }
  function play(name){ if(!enabled) return; try { switch(name){
    case 'turn':note(600,.1);note(850,.13,'sine',.05,.12);break;
    case 'move':note(460,.07,'sine',.034);break;
    case 'wall':note(190,.1,'triangle',.035);break;
    case 'warning':note(870,.07);break;
    case 'hole':note(460,.42,'sawtooth',.03,0,95);break;
    case 'win': [523,659,784,1046].forEach((n,i)=>note(n,.18,'sine',.045,i*.14));break;
    case 'lose':note(380,.22,'triangle',.04,0,180);note(220,.3,'triangle',.035,.22,100);break;
  }} catch(e){console.warn('CoMove audio',e);} }
  function toggle(){enabled=!enabled;localStorage.setItem(key(),String(enabled));if(enabled) unlock();return enabled;}
  return {unlock,play,toggle,isEnabled:()=>enabled};
})();

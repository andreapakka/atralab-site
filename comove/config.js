/* CoMove — tutti i parametri modificabili lato interfaccia.
   I limiti validati dalle funzioni Supabase prevalgono su questo file. */
window.COMOVE_CONFIG = Object.freeze({
  waitingSeconds: 120,
  countdownSeconds: 20,
  durationSeconds: 300,
  preFirstMoveSeconds: 120,
  playerMin: 2,
  playerMax: 4,
  emojis: ['🚗','🚀','🐱','🐶','🐸','🐢','🐝','🦊','🤖','👾'],
  defaultEmoji: '🚗',
levels: {
  easy:   { label:'Facile', size:8,  turn:5, walls:0,  holes:2, minPath:8 },
  medium: { label:'Medio',  size:10, turn:5, walls:0, holes:5, minPath:15 },
  hard:   { label:'Difficile', size:12, turn:5, walls:0, holes:9, minPath:25 }
},
custom: {size:10, turn:5, walls:17, holes:0, minPath:15},
  limits: { minSize:6, maxSize:16, minTurn:2,maxTurn:10 },
  boardAttempts: 2000,
  refreshLobbyMs: 12000,
  refreshGameMs: 1600,
  tickEveryMs: 1500,
  soundKey: 'comove-audio-enabled'
});

/* WhereIsIt · Impostazioni modificabili. Le dimensioni sono in pixel della scena. */
window.WHEREISIT_CONFIG = {
  world: { width: 2000, height: 1400 },
  scenarios: [
    { id: 'spiaggia', name: 'Spiaggia', image: '/whereisit/scenari/spiaggia.webp' },
    { id: 'citta', name: 'Città', image: '/whereisit/scenari/citta.webp' },
    { id: 'parco', name: 'Parco', image: '/whereisit/scenari/parco.webp' },
    { id: 'luna-park', name: 'Luna park', image: '/whereisit/scenari/luna-park.webp' },
    { id: 'castello', name: 'Castello fantastico', image: '/whereisit/scenari/castello.webp' }
  ],
  difficulty: {
    easy: { name: 'Facile', count: 200, size: [62, 108], targetSize: [88, 110], distractorsPerTarget: 2, overlap: 0.26 },
    medium: { name: 'Medio', count: 350, size: [44, 95], targetSize: [67, 88], distractorsPerTarget: 4, overlap: 0.38 },
    hard: { name: 'Difficile', count: 500, size: [34, 80], targetSize: [53, 72], distractorsPerTarget: 6, overlap: 0.50 }
  },
  targets: { min: 1, max: 10, initial: 4 },
  camera: { maxZoom: 4, initialZoom: 1.08, mobileInitialZoom: 1.22 },
  placement: { margin: 90, gridCell: 100, attempts: 100, rotateDegrees: 175, crowdedZoneVariation: 0.45 },
  interaction: { dragThresholdPx: 9, touchTolerancePx: 13, mouseTolerancePx: 5, revealMilliseconds: 2200 },
  sound: { enabledInitially: false, volume: 0.16 }
};

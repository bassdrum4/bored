// Editorial estimates, not telemetry. Controls describe gameplay, not menu buttons.
// Friends means sharing this device unless explicitly marked online.
const info = (minutes, pace, inputs, extra = {}) => ({ minutes, pace, inputs, ...extra });
export const DISCOVERY = {
  deep: info('5–15 min', 'Turn-based', ['Keyboard', 'Mouse', 'Touch']),
  '2048': info('3–10 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  memory: info('2–5 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  'connect-four': info('2–5 min', 'Competitive', ['Keyboard', 'Mouse', 'Touch'], { quick: true, players: '2 local' }),
  'aim-lab': info('20 sec', 'Competitive', ['Mouse', 'Touch'], { quick: true }),
  '8ball': info('5–15 min', 'Competitive', ['Mouse', 'Touch'], { players: '2 local' }),
  sumo: info('1–3 min', 'Competitive', ['Keyboard'], { quick: true, players: '2 local' }),
  sand: info('Open-ended', 'Relaxing', ['Mouse', 'Touch']),
  lighthouse: info('2–5 min', 'Focused', ['Keyboard', 'Mouse', 'Touch']),
  poker: info('5–15 min', 'Competitive', ['Mouse', 'Touch']),
  wordle: info('2–5 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  lava: info('1–3 min', 'Competitive', ['Keyboard'], { quick: true, players: '2 local' }),
  volletball: info('3–5 min', 'Competitive', ['Keyboard'], { players: '2 local' }),
  solitaire: info('5–15 min', 'Relaxing', ['Mouse', 'Touch']),
  commanders: info('5–15 min', 'Competitive', ['Keyboard', 'Touch']),
  eco: info('Open-ended', 'Relaxing', ['Mouse', 'Touch']),
  'void-runner': info('1–5 min', 'Competitive', ['Mouse', 'Touch'], { quick: true }),
  qbert: info('2–5 min', 'Competitive', ['Keyboard', 'Touch'], { quick: true }),
  simon: info('1–3 min', 'Competitive', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  frogger: info('1–5 min', 'Competitive', ['Keyboard'], { quick: true }),
  'pac-man': info('3–10 min', 'Competitive', ['Keyboard']),
  snake: info('1–5 min', 'Competitive', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  tank: info('3–10 min', 'Competitive', ['Keyboard'], { players: '2 local' }),
  'space-invaders': info('3–10 min', 'Competitive', ['Keyboard', 'Touch']),
  pong: info('2–5 min', 'Competitive', ['Keyboard'], { quick: true, players: '2 local' }),
  asteroids: info('2–5 min', 'Competitive', ['Keyboard'], { quick: true }),
  breakout: info('3–10 min', 'Competitive', ['Keyboard', 'Mouse']),
  tetris: info('3–10 min', 'Competitive', ['Keyboard']),
  minesweeper: info('2–10 min', 'Focused', ['Mouse', 'Touch']),
  'lights-out': info('1–5 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  tank2: info('5–10 min', 'Competitive', ['Keyboard'], { players: '2 local' }),
  'gun-mayhem': info('3–10 min', 'Competitive', ['Keyboard'], { players: '2 local' }),
  'shadow-net': info('10–20 min', 'Focused', ['Keyboard', 'Mouse']),
  'f-14': info('5–20 min', 'Competitive', ['Keyboard', 'Mouse', 'Touch'], { players: 'Online multiplayer' }),
  dc: info('Open-ended', 'Social', ['Keyboard', 'Mouse', 'Touch']),
  klang: info('Open-ended', 'Listening', ['Mouse', 'Touch'])
};

// Deliberately fixed picks with reasons; never presented as algorithmic personalization.
export const PICKS = [
  { slug: 'deep', reason: 'A dungeon you can take one turn at a time.' },
  { slug: 'sand', reason: 'No timer. Just materials and a little curiosity.' },
  { slug: 'connect-four', reason: 'One device, two players, a familiar rivalry.' },
  { slug: 'lights-out', reason: 'Five by five. A small puzzle with a clever twist.' }
];

export const COLLECTIONS = [
  { id: 'all', name: 'All games', note: 'The whole arcade, at your own pace.' },
  { id: 'quick', name: 'Quick Break', note: 'Short rounds or easy stopping points. A few minutes is enough.' },
  { id: 'friends', name: 'Play Against Friends', note: 'Pass a turn or share a keyboard. These games have local two-player modes.' },
  { id: 'relax', name: 'Relax & Unwind', note: 'Unhurried puzzles, cards, and worlds to tinker with.' },
  { id: 'picks', name: 'Worth Trying', note: 'Four editor’s picks, each with a different way to play.' }
];

export function inCollection(slug, collection) {
  const game = DISCOVERY[slug];
  if (!game) return false;
  switch (collection) {
    case 'quick': return game.quick === true;
    case 'friends': return game.players === '2 local';
    case 'relax': return game.pace === 'Relaxing';
    case 'picks': return PICKS.some(pick => pick.slug === slug);
    default: return true;
  }
}

// Vite inlines these small, locally captured WebP images in the single HTML file.
const captures = import.meta.glob('./previews/*.webp', { eager: true, query: '?inline', import: 'default' });
export const PREVIEWS = Object.fromEntries(Object.entries(captures).map(([file, data]) =>
  [file.slice(file.lastIndexOf('/') + 1, -5), data]));

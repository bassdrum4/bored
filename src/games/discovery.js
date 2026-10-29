import { ORDER, EXTERNS } from './catalog.js';

// Editorial estimates, not telemetry. Controls describe gameplay, not menu buttons.
// Friends means sharing this device unless explicitly marked online.
const info = (minutes, pace, inputs, extra = {}) => ({ minutes, pace, inputs, ...extra });
export const DISCOVERY = {
  "signal-tower": info('15–25 min', 'Focused', ['Mouse', 'Touch']),
  'prism-duel': info('2–5 min', 'Competitive', ['Keyboard', 'Touch'], { quick: true, players: '2 local' }),
  'rooftop-snipers': info('2–5 min', 'Competitive', ['Keyboard', 'Touch'], { quick: true, players: '2 local' }),
  'block-blast': info('2–5 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  chess: info('5–15 min', 'Competitive', ['Mouse', 'Touch'], { players: '2 local' }),
  mahjong: info('10–25 min', 'Focused', ['Mouse', 'Touch']),
  'minigolf': info('5–10 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch']),
  deep: info('5–15 min', 'Turn-based', ['Keyboard', 'Mouse', 'Touch']),
  '2048': info('3–10 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  memory: info('2–5 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  'connect-four': info('2–5 min', 'Competitive', ['Keyboard', 'Mouse', 'Touch'], { quick: true, players: '2 local' }),
  'aim-lab': info('20 sec', 'Competitive', ['Mouse', 'Touch'], { quick: true }),
  '8ball': info('5–15 min', 'Competitive', ['Mouse', 'Touch'], { players: '2 local' }),
  sumo: info('1–3 min', 'Competitive', ['Keyboard'], { quick: true, players: '2 local' }),
  sand: info('Open-ended', 'Relaxing', ['Mouse', 'Touch']),
  poker: info('5–15 min', 'Competitive', ['Mouse', 'Touch']),
  wordle: info('2–5 min', 'Relaxing', ['Keyboard', 'Mouse', 'Touch'], { quick: true }),
  lava: info('1–3 min', 'Competitive', ['Keyboard'], { quick: true, players: '2 local' }),
  volletball: info('3–5 min', 'Competitive', ['Keyboard'], { players: '1 or 2 local' }),
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
  klang: info('Open-ended', 'Listening', ['Mouse', 'Touch'])
};

export const COLLECTIONS = [
  { id: 'all', name: 'All games', note: 'The whole arcade, at your own pace.' },
  { id: 'quick', name: 'Quick Break', note: 'Short rounds or easy stopping points. A few minutes is enough.' },
  { id: 'friends', name: 'Play Against Friends', note: 'Pass a turn or share a keyboard. These games have local two-player modes.' },
  { id: 'relax', name: 'Relax & Unwind', note: 'Unhurried puzzles, cards, and worlds to tinker with.' }
];

export function inCollection(slug, collection) {
  const game = DISCOVERY[slug];
  if (!game) return false;
  switch (collection) {
    case 'quick': return game.quick === true;
    case 'friends': return game.players === '2 local';
    case 'relax': return game.pace === 'Relaxing';
    default: return true;
  }
}

// The locally captured WebP images ship beside this module, one per offline
// game and named after its slug. They are ordinary files the page requests when
// it builds a card, so the site needs no build step to carry them.
// Newly scaffolded games start with an SVG placeholder; captured screenshots
// remain WebP and can replace it later without changing the loader.
export const PREVIEW_FALLBACKS = { "signal-tower": '.svg', 'prism-duel': '.svg', 'block-blast': '.svg', chess: '.svg', mahjong: '.svg' };
const previewUrl = slug => new URL('./previews/' + slug + (PREVIEW_FALLBACKS[slug] || '.webp'), import.meta.url).href;
export const PREVIEWS = Object.fromEntries(
  ORDER.filter(([slug]) => !EXTERNS[slug]).map(([slug]) => [slug, previewUrl(slug)]));

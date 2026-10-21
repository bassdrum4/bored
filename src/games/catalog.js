import FONT_CSS from './vendor/font.css?raw';

const gameModules = import.meta.glob('./content/*.html.b64', { eager: true, query: '?raw', import: 'default' });
export const GAMES = Object.fromEntries(Object.entries(gameModules).map(([file, b64]) => {
  const slug = file.slice(file.lastIndexOf('/') + 1).replace(/\.html\.b64$/, '');
  return [slug, { b64, fonts: slug !== '8ball' }];
}));
if (!Object.keys(GAMES).length) throw new Error('No game payloads found. Run npm run games:sync.');

export const ORDER = [["sumo", "SUMO"], ["sand", "Sand"], ["lighthouse", "Lighthouse"], ["poker", "Poker"], ["wordle", "Wordle"], ["lava", "Lava"], ["volletball", "VolletBall"], ["solitaire", "Solitaire"], ["commanders", "Commanders"], ["eco", "Eco"], ["void-runner", "Void Runner"], ["qbert", "Q*bert"], ["simon", "Simon"], ["frogger", "Frogger"], ["pac-man", "Pac-man"], ["snake", "Snake"], ["tank", "Tank"], ["space-invaders", "Space Invaders"], ["pong", "Pong"], ["asteroids", "Asteroids"], ["breakout", "Breakout"], ["tetris", "Tetris"], ["minesweeper", "Minesweeper"], ["lights-out", "Lights Out"], ["tank2", "Tank2"], ["gun-mayhem", "Gun Mayhem"], ["shadow-net", "shadow.net"], ["f-14", "F-14"], ["dc", "DC"], ["klang", "Klang"], ["8ball", "8 Ball"]];
export const EXTERNS = {"f-14": "https://bassdrum4.github.io/f-14-4/", "dc": "https://workbag.dpdns.org/", "klang": "https://youtubeplayer.freebuff.app/player"};
export const NEW_GAMES = ['2048', 'memory', 'connect-four', 'aim-lab'];
// The NEW badge: newest first, four at most. A new game joins the front and the
// oldest falls off. NEW_GAMES above is a different list (games built into
// arcade.js), so do not use one for the other.
export const FRESH_GAMES = ['deep', 'aim-lab', 'connect-four', 'memory'];
ORDER.unshift(['2048', '2048'], ['memory', 'Memory'], ['connect-four', 'Connect Four'], ['aim-lab', 'Aim Lab']);
ORDER.unshift(['deep', 'DEEP']);
export const META = {
  deep: ['Arcade', 'A daily-seeded dungeon dive'],
  '2048': ['Puzzle', 'Slide, merge, and chase 2048'],
  memory: ['Puzzle', 'Find all eight matching pairs'],
  'connect-four': ['Strategy', 'Challenge the computer or a friend'],
  'aim-lab': ['Arcade', 'A 20-second accuracy challenge'],
  '8ball': ['Arcade', 'Break, pot, and clear the table'],
  sumo: ['Arcade', 'Push your rival out of the ring'], sand: ['Sandbox', 'Pour, mix, and build a tiny world'],
  lighthouse: ['Sandbox', 'Steer the beam and guide ships home'], poker: ['Strategy', 'Read the table and play your hand'],
  wordle: ['Puzzle', 'Crack the five-letter word'], lava: ['Arcade', 'Stay above the heat'],
  volletball: ['Arcade', 'Keep the ball in play'], solitaire: ['Strategy', 'A quiet game of cards'],
  commanders: ['Arcade', 'Dodge, shoot, and battle through waves'], eco: ['Sandbox', 'Grow and observe a living ecosystem'],
  'void-runner': ['Arcade', 'Dodge obstacles and dash through the void'], qbert: ['Arcade', 'Hop the pyramid and change every tile'],
  simon: ['Puzzle', 'Remember the sequence'], frogger: ['Arcade', 'Get to the other side'],
  'pac-man': ['Arcade', 'A maze full of trouble'], snake: ['Arcade', 'One more bite'],
  tank: ['Arcade', 'Trade shots in an armored duel'], 'space-invaders': ['Arcade', 'Hold off the alien formation'],
  pong: ['Arcade', 'The original rivalry'], asteroids: ['Arcade', 'Survive the asteroid field'],
  breakout: ['Arcade', 'Clear every brick'], tetris: ['Puzzle', 'Find the perfect fit'],
  minesweeper: ['Puzzle', 'Think before you click'], 'lights-out': ['Puzzle', 'Turn every light off'],
  tank2: ['Arcade', 'Aim your artillery across the hills'],
  'gun-mayhem': ['Arcade', 'Knock rivals off the platforms'], 'shadow-net': ['Strategy', 'Explore a fictional network through its terminal'],
  'f-14': ['Online', 'Flight simulator · internet required'],
  dc: ['Online', 'Open the community chat · internet required'], klang: ['Online', 'Music player · internet required']
};

export { FONT_CSS };

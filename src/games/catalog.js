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
ORDER.unshift(['2048', '2048'], ['memory', 'Memory'], ['connect-four', 'Connect Four'], ['aim-lab', 'Aim Lab']);
ORDER.unshift(['deep', 'DEEP']);
export const META = {
  deep: ['Arcade', 'A daily-seeded dungeon dive'],
  '2048': ['Puzzle', 'Slide, merge, and chase 2048'],
  memory: ['Puzzle', 'Find all eight matching pairs'],
  'connect-four': ['Strategy', 'Challenge the computer or a friend'],
  'aim-lab': ['Arcade', 'A 20-second accuracy challenge'],
  '8ball': ['Arcade', 'Break, pot, and clear the table'],
  sumo: ['Arcade', 'Step into the ring'], sand: ['Sandbox', 'Build a tiny world'],
  lighthouse: ['Sandbox', 'Keep the light alive'], poker: ['Strategy', 'The Lucky Spur'],
  wordle: ['Puzzle', 'Crack the five-letter word'], lava: ['Arcade', 'Stay above the heat'],
  volletball: ['Arcade', 'Keep the ball in play'], solitaire: ['Strategy', 'A quiet game of cards'],
  commanders: ['Strategy', 'Take command'], eco: ['Sandbox', 'Explore an ecosystem'],
  'void-runner': ['Arcade', 'Run into the unknown'], qbert: ['Arcade', 'Hop through a classic'],
  simon: ['Puzzle', 'Remember the sequence'], frogger: ['Arcade', 'Get to the other side'],
  'pac-man': ['Arcade', 'A maze full of trouble'], snake: ['Arcade', 'One more bite'],
  tank: ['Arcade', 'Roll into battle'], 'space-invaders': ['Arcade', 'Defend your skies'],
  pong: ['Arcade', 'The original rivalry'], asteroids: ['Arcade', 'Survive the asteroid field'],
  breakout: ['Arcade', 'Clear every brick'], tetris: ['Puzzle', 'Find the perfect fit'],
  minesweeper: ['Puzzle', 'Think before you click'], 'lights-out': ['Puzzle', 'Turn every light off'],
  tank2: ['Arcade', 'Another armored adventure'],
  'gun-mayhem': ['Arcade', 'A little organized chaos'], 'shadow-net': ['Strategy', 'Enter the network'],
  'f-14': ['Online', 'Flight simulator · internet required'],
  dc: ['Online', 'Remote site · internet required'], klang: ['Online', 'Music player · internet required']
};

export { FONT_CSS };

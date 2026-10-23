// Every game is a complete HTML document in `content/`. They used to be inlined
// into the hub as base64, which made every visitor download all 28 games before
// they could open one. The hub now fetches a document only when its card is
// clicked, so the first paint is the arcade shell alone.
//
// GitHub Pages serves this repository itself, so the committed source documents
// in `src/games/content/` are the payloads: there is nothing extra to publish,
// and editing a game updates it without rebuilding the hub.

export const ORDER = [["chess", "Chess"], ["mahjong", "Mahjong"], ["minigolf", "Minigolf"], ["sumo", "SUMO"], ["sand", "Sand"], ["poker", "Poker"], ["wordle", "Wordle"], ["lava", "Lava"], ["volletball", "VolletBall"], ["solitaire", "Solitaire"], ["commanders", "Commanders"], ["eco", "Eco"], ["void-runner", "Void Runner"], ["qbert", "Q*bert"], ["simon", "Simon"], ["frogger", "Frogger"], ["pac-man", "Pac-man"], ["snake", "Snake"], ["tank", "Tank"], ["space-invaders", "Space Invaders"], ["pong", "Pong"], ["asteroids", "Asteroids"], ["breakout", "Breakout"], ["tetris", "Tetris"], ["minesweeper", "Minesweeper"], ["lights-out", "Lights Out"], ["tank2", "Tank2"], ["gun-mayhem", "Gun Mayhem"], ["shadow-net", "shadow.net"], ["f-14", "F-14"], ["klang", "Klang"], ["8ball", "8 Ball"]];
export const EXTERNS = {"f-14": "https://bassdrum4.github.io/f-14-4/", "klang": "https://youtubeplayer.freebuff.app/player"};
export const UNSCORED_GAMES = [];
export const NEW_GAMES = ['2048', 'memory', 'connect-four', 'aim-lab'];
// The NEW badge: newest first, four at most. A new game joins the front and the
// oldest falls off. NEW_GAMES above is a different list (games built into
// arcade.js), so do not use one for the other.
export const FRESH_GAMES = ["chess", "mahjong", "minigolf", "deep"];
ORDER.unshift(['2048', '2048'], ['memory', 'Memory'], ['connect-four', 'Connect Four'], ['aim-lab', 'Aim Lab']);
ORDER.unshift(['deep', 'DEEP']);
export const META = {
  "chess": ["Strategy", "Play the computer or a friend on an 8x8 board."],
  "mahjong": ["Puzzle", "Clear the turtle, one matching pair at a time."],
  "minigolf": ["Arcade", "Nine holes. Mind the bank shot."],
  deep: ['Arcade', 'A daily-seeded dungeon dive'],
  '2048': ['Puzzle', 'Slide, merge, and chase 2048'],
  memory: ['Puzzle', 'Find all eight matching pairs'],
  'connect-four': ['Strategy', 'Challenge the computer or a friend'],
  'aim-lab': ['Arcade', 'A 20-second accuracy challenge'],
  '8ball': ['Arcade', 'Break, pot, and clear the table'],
  sumo: ['Arcade', 'Push your rival out of the ring'], sand: ['Sandbox', 'Pour, mix, and build a tiny world'],
  poker: ['Strategy', 'Read the table and play your hand'],
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
  klang: ['Online', 'Music player · internet required']
};

/* ── Loading a game document on demand ────────────────────────────────────── */

// The site root is `src/` both in development and on GitHub Pages, so a game
// document sits beside the hub at the same relative address in both.
const PAYLOAD_DIR = 'games/content/';

/** Offline games that are plain documents rather than games built into arcade.js. */
export const PAYLOAD_SLUGS = ORDER.map(([slug]) => slug)
  .filter(slug => !EXTERNS[slug] && !NEW_GAMES.includes(slug));

if (!PAYLOAD_SLUGS.length) throw new Error('No game documents found in src/games/content/.');

const payloads = new Map();

/**
 * The deploy workflow writes the commit it published into `version.json`, so a
 * game document is fetched from a URL that changes with every push to main.
 * Pages caches files for ten minutes; without the stamp a returning visitor can
 * open yesterday's game. Locally the file is just "dev", and a missing one
 * simply means no stamp.
 */
let versionTag = null;
function deployVersion() {
  if (!versionTag) {
    versionTag = fetch(new URL('version.json', document.baseURI), { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(version => version && typeof version.commit === 'string' ? version.commit : '')
      .catch(() => '');
  }
  return versionTag;
}

/**
 * Fetch a game document once and remember it for the rest of the visit. The
 * cache stores the promise, so opening two games at once still downloads each
 * document exactly once, and a failed download is forgotten so a retry works.
 */
export function loadGameDocument(slug) {
  if (!PAYLOAD_SLUGS.includes(slug)) {
    return Promise.reject(new Error(slug + ' has no game document.'));
  }
  if (!payloads.has(slug)) {
    payloads.set(slug, deployVersion()
      .then(version => {
        const url = new URL(PAYLOAD_DIR + slug + '.html', document.baseURI);
        if (version) url.searchParams.set('v', version);
        return fetch(url);
      })
      .then(response => {
        if (!response.ok) throw new Error(slug + ' returned HTTP ' + response.status);
        return response.text();
      })
      .then(text => {
        if (!/<html[\s>]/i.test(text)) throw new Error(slug + ' is not a complete document.');
        return text;
      })
      .catch(error => { payloads.delete(slug); throw error; }));
  }
  return payloads.get(slug);
}

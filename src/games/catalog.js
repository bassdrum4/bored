// Every game is a complete HTML document in `content/`. They used to be inlined
// into the hub as base64, which made every visitor download all 28 games before
// they could open one. The hub now fetches a document only when its card is
// clicked, so the first paint is the arcade shell alone.
//
// GitHub Pages serves this repository itself, so the committed source documents
// in `src/games/content/` are the payloads: there is nothing extra to publish,
// and editing a game updates it without rebuilding the hub.

// The shelf is the arcade's arrival log, newest first: games:add prepends a new
// game, so the top entry is the most recent arrival and the bottom is the oldest.
// Games that landed in the same commit keep the order they were written in. The
// four native arcade.js games came after the initial documents but before DEEP.
// Keep their original NEW-badge chronology (Aim Lab, Connect Four, Memory,
// 2048) between DEEP and SUMO; NEW_GAMES identifies the implementation type.
export const ORDER = [["poke-idle", "Poké Idle"], ["air-hockey", "Air Hockey"], ["pokedoku", "Pokédoku"], ["krillion","Krillion"],["quickdraw","Quickdraw"],["clicker", "Clicker"], ["downhill-mayhem","Downhill Mayhem"],["corner","Corner"],["ticket-to-ride","Ticket to Ride"],["wallbound","Sticky Ninja"],["risk","Risk"],["scrabble","Scrabble"],["basket-random","Basket Random"],["brick-run","Brick Run"],["trackbound","Trackmania"],["ashcrown","Civ Lite"],["typing-test","Typing Test"],["circuit","Circuit"],["transit-chaos","Transit Chaos"],["fluid","Fluid"],["signal-tower","Signal Tower"],["prism-duel","Prism Duel"],["rooftop-snipers","Rooftop Snipers: Boring Edition"],["block-blast","Block Blast"],["chess","Chess"],["mahjong","Mahjong"],["minigolf","Minigolf"],["lights-out","Lights Out"],["deep","DEEP"],["aim-lab","Aim Lab"],["connect-four","Connect Four"],["memory","Memory"],["2048","2048"],["sumo","SUMO"],["sand","Sand"],["poker","Card Table"],["wordle","Wordle"],["lava","Lava"],["volletball","VolletBall"],["solitaire","Solitaire"],["commanders","Commanders"],["eco","Eco"],["void-runner","Void Runner"],["qbert","Q*bert"],["simon","Simon"],["frogger","Frogger"],["pac-man","Pac-man"],["snake","Snake"],["tank","Tank"],["space-invaders","Space Invaders"],["pong","Pong"],["asteroids","Asteroids"],["breakout","Breakout"],["tetris","Tetris"],["minesweeper","Minesweeper"],["tank2","Tank 2"],["gun-mayhem","Gun Mayhem"],["shadow-net","shadow.net"],["f-14","F-14"],["klang","Klang"],["8ball","8 Ball"]];
export const EXTERNS = {"f-14": "https://bassdrum4.github.io/f-14-4/", "klang": "https://site-c34c9896e1dc43759ac9d67d703052cd.freebuff.page/"};
// Offline games with no board of their own: they still play, but the hub keeps
// no best for them. 8 Ball, Sand and Eco are open-ended toys, so a "high score"
// only invited comparing two unrelated afternoons.
// Rooftop Snipers is the compiled original Unity export: it exposes no score API.
export const UNSCORED_GAMES = ["prism-duel", "fluid", "rooftop-snipers", "basket-random", "8ball", "eco", "sand"];
export const NEW_GAMES = ['2048', 'memory', 'connect-four', 'aim-lab'];
// The NEW badge: newest first, four at most. A new game joins the front and the
// oldest falls off. NEW_GAMES above is a different list (games built into
// arcade.js), so do not use one for the other.
export const FRESH_GAMES = ["poke-idle", "air-hockey", "pokedoku", "krillion"];
export const META = {
  "poke-idle": ["Strategy", "Build a party of 6, beat 36 gyms across nine regions, and fill the Pokédex."],
  "air-hockey": ["Arcade", "Two mallets, one puck, first to seven. Hold your half and put it away."],
  "pokedoku": ["Puzzle", "Three daily Pokémon puzzles: Pokédoku, Inverse Doku and Shiny Hunt."],
  "krillion": ["Puzzle", "Seven prompts, twenty-five seconds an answer. Rarer answers sink deeper."],
  "quickdraw": ["Arcade", "Wait for DRAW. Fastest shot wins; fire too soon and lose."],
  "clicker": ["Arcade", "One click, one point. That is the whole game."],
  "downhill-mayhem": ["Arcade", "Six riders, one mountain, two laps of elbows-out downhill. Tricks charge the boost; fists settle the rest."],
  "corner": ["Strategy", "Fourteen days behind one counter: fill the shelves, read the notice on the wall and the weather outside, price for the margin, and finish with more in the till."],
  "ticket-to-ride": ["Strategy", "Claim railway routes across North America, complete destination tickets, and hold the longest continuous path."],
  "wallbound": ["Arcade", "Pull back and launch a little ninja. Stick to walls, ricochet off springs, break glass and clear 20 stages."],
  "risk": ["Strategy", "Conquer the world against up to five computer commanders. Place troops, roll dice, defend borders, and claim continents."],
  "scrabble": ["Puzzle", "Fifteen squares a side, seven tiles in hand. Spell across the board against the computer or a friend."],
  "brick-run": ["Arcade", "Run, jump and stomp your way to the flagpole."],
  "trackbound": ["Arcade", "Modular time trial racing: medals, ghosts, a daily track, and a procedural stunt park full of gold rings."],
  "ashcrown": ["Strategy", "Found cities, research techs and take on up to three rival civs on a hex map. Pass-and-play or against CPUs."],
  "transit-chaos": ["Strategy", "Draw subway lines, move passengers, and keep a growing city from gridlock."],
  "typing-test": ["Puzzle", "Thirty seconds, common words, and a keyboard that does not forgive a glance away."],
  "circuit": ["Arcade", "Three laps against the clock on four drawn circuits, or a second car on W A S D."],
  "fluid": ["Sandbox", "Drag to stir ink through a live fluid."],
  "signal-tower": ["Strategy", "Thirty set waves and then endless ones, six towers and threats that fly, plate up or hide. Hold the line."],
  "prism-duel": ["Strategy", "Place mirrors, bend a beam, burn the other core. The CPU plays too."],
  "rooftop-snipers": ["Arcade", "The original two-button rooftop duel. Jump, aim, and knock your rival off the roof."],
  "basket-random": ["Arcade", "Two players, one ball and a physics engine that keeps changing its mind."],
  "block-blast": ["Puzzle", "Drop blocks into an 8x8 grid and clear full lines."],
  "chess": ["Strategy", "Play the computer or a friend on an 8x8 board."],
  "mahjong": ["Puzzle", "The full 144-tile set: three suits, winds, dragons, flowers and seasons."],
  "minigolf": ["Arcade", "Nine holes. Mind the bank shot."],
  deep: ['Arcade', 'A daily-seeded dungeon dive'],
  '2048': ['Puzzle', 'Slide, merge, and chase 2048'],
  memory: ['Puzzle', 'Find all eight matching pairs'],
  'connect-four': ['Strategy', 'Challenge the computer or a friend'],
  'aim-lab': ['Arcade', 'Two 20-second rounds: aim, then memorize and hit invisible targets'],
  '8ball': ['Arcade', 'Break, pot, and clear the table'],
  sumo: ['Arcade', 'Push your rival out of the ring'], sand: ['Sandbox', 'Pour, mix, and build a tiny world'],
  poker: ['Strategy', "Texas Hold'em, Five Card Draw, Blackjack, and Euchre at the Lucky Spur. Poker hands earn chip scores."],
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
  tank2: ['Arcade', 'Artillery on a destructible rolling battlefield'],
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
  // Bored Together always opens the same document the library opens, so a game
  // update reaches both. A per-mode copy is how players ended up on an old build.
  const payload = slug;
  if (!payloads.has(payload)) {
    payloads.set(payload, deployVersion()
      .then(version => {
        const url = new URL(PAYLOAD_DIR + payload + '.html', document.baseURI);
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
      .catch(error => { payloads.delete(payload); throw error; }));
  }
  return payloads.get(payload);
}

// Async rules are server-owned; the existing catalog slug stays the game identity.
export const TOGETHER_GAMES = Object.freeze({
  'connect-four': Object.freeze({ name: 'Connect Four', rulesVersion: 1, mode: 'turns', preview: 'connect-four', blurb: 'Seven columns. One good rivalry.' }),
  '8ball': Object.freeze({ name: '8 Ball Pool', rulesVersion: 1, mode: 'turns', preview: '8ball', blurb: 'Clear your group. Finish on the eight.' }),
  tank2: Object.freeze({ name: 'Tank 2', rulesVersion: 3, mode: 'turns', preview: 'tank2', blurb: 'One breakable box, two tanks, and nowhere safe to hide.' }),
  ashcrown: Object.freeze({ name: 'Civ Lite', rulesVersion: 1, mode: 'turns', preview: 'ashcrown', blurb: 'One map, two civs, a turn each.' }),
  '2048': Object.freeze({ name: '2048', rulesVersion: 1, mode: 'duel', metric: 'score', unit: 'points', preview: '2048', blurb: 'Same board. Higher score wins.' }),
  mahjong: Object.freeze({ name: 'Mahjong', rulesVersion: 1, mode: 'duel', metric: 'pairs', unit: 'pairs', preview: 'mahjong', blurb: 'Same deal. Clear more pairs.' })
});

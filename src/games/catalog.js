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
export const ORDER = [["geopeaks", "GeoPeaks"], ["ballistic-chickens", "Ballistic Chickens"], ["getaway-shootout", "Getaway Shootout"], ["shotgun-roulette", "Shotgun Roulette"], ["crossword", "Crossword"], ["imposter", "Among Us"], ["sudoku", "Sudoku"], ["photo-puzzle", "Photo Puzzle"], ["poke-gacha", "Poké Gacha"], ["poke-idle", "Poké Idle"], ["air-hockey", "Air Hockey"], ["pokedoku", "Pokédoku"], ["krillion","Krillion"],["quickdraw","Quickdraw"],["clicker", "Clicker"], ["downhill-mayhem","Downhill Mayhem"],["corner","Corner"],["ticket-to-ride","Ticket to Ride"],["wallbound","Sticky Ninja"],["risk","Risk"],["scrabble","Scrabble"],["basket-random","Basket Random"],["brick-run","Brick Run"],["trackbound","Trackmania"],["ashcrown","Civ Lite"],["typing-test","Typing Test"],["circuit","Circuit"],["transit-chaos","Transit Chaos"],["fluid","Fluid"],["signal-tower","Signal Tower"],["prism-duel","Prism Duel"],["rooftop-snipers","Rooftop Snipers: Boring Edition"],["block-blast","Block Blast"],["chess","Chess"],["mahjong","Mahjong"],["minigolf","Minigolf"],["lights-out","Lights Out"],["deep","DEEP"],["aim-lab","Aim Lab"],["connect-four","Connect Four"],["memory","Memory"],["2048","2048"],["sumo","SUMO"],["sand","Sand"],["poker","Card Table"],["wordle","Wordle"],["lava","Lava"],["volletball","VolletBall"],["solitaire","Solitaire"],["commanders","Commanders"],["eco","Eco"],["void-runner","Void Runner"],["qbert","Q*bert"],["simon","Simon"],["frogger","Frogger"],["pac-man","Pac-man"],["snake","Snake"],["tank","Tank"],["space-invaders","Space Invaders"],["pong","Pong"],["asteroids","Asteroids"],["breakout","Breakout"],["tetris","Tetris"],["minesweeper","Minesweeper"],["tank2","Tank 2"],["gun-mayhem","Gun Mayhem"],["shadow-net","shadow.net"],["f-14","F-14"],["klang","Klang"],["8ball","8 Ball"]];
// Hidden development games are intentionally excluded from every public catalog surface.
// Access is checked through the existing Supabase admin role before launch.
export const ADMIN_PREVIEWS = Object.freeze({});
// Public games that still run in a sandboxed frame (opaque origin): they cannot
// read the session or touch the wallet, and reach the hub only by postMessage.
// Shotgun Roulette bets Poké Gacha coins; src/hub/roulette.js answers it.
export const SANDBOXED_GAMES = Object.freeze(['shotgun-roulette']);
export const EXTERNS = {"f-14": "https://bassdrum4.github.io/f-14-4/", "klang": "https://site-c34c9896e1dc43759ac9d67d703052cd.freebuff.page/"};
// Offline games with no board of their own: they still play, but the hub keeps
// no best for them. 8 Ball, Sand and Eco are open-ended toys, so a "high score"
// only invited comparing two unrelated afternoons.
// Rooftop Snipers is the compiled original Unity export: it exposes no score API.
// Krillion's dive total proved too easy to game from the client, so it keeps no
// board here even though the game still shows the score it just earned.
export const UNSCORED_GAMES = ["getaway-shootout", "imposter", "prism-duel", "fluid", "rooftop-snipers", "basket-random", "8ball", "eco", "sand", "krillion"];
export const NEW_GAMES = ['2048', 'memory', 'connect-four', 'aim-lab'];
// The NEW badge: newest first, four at most. A new game joins the front and the
// oldest falls off. NEW_GAMES above is a different list (games built into
// arcade.js), so do not use one for the other.
export const FRESH_GAMES = ["geopeaks", "ballistic-chickens", "getaway-shootout", "shotgun-roulette"];
// When each game first arrived. `games:add` stamps each release here.
// Popular promotes the FRESH_GAMES list above its weekly rankings.
// Temporary editorial pin, expiring at midnight Detroit time November 25.
export const FEATURED_UNTIL = Object.freeze({ crossword: '2026-11-25T05:00:00Z' });
export const LAUNCHED = {
  "geopeaks": "2026-11-24",
  "ballistic-chickens": "2026-11-22",
  "getaway-shootout": "2026-11-21",
  "shotgun-roulette": "2026-11-21",
  "crossword": "2026-11-20",
  "imposter": "2026-11-19",
  "sudoku": "2026-11-18",
  "photo-puzzle": "2026-11-17",
  "poke-gacha": "2026-11-16",
  "pokedoku": "2026-11-12",
  "poke-idle": "2026-11-12",
  "krillion": "2026-11-12",
  "air-hockey": "2026-11-12",
  "quickdraw": "2026-11-10",
  "corner": "2026-11-10",
  "clicker": "2026-11-10",
  "ticket-to-ride": "2026-11-09",
  "wallbound": "2026-11-03",
  "scrabble": "2026-11-02",
  "risk": "2026-11-02",
  "downhill-mayhem": "2026-11-02",
  "basket-random": "2026-11-02",
  "brick-run": "2026-11-01",
  "trackbound": "2026-10-31",
  "typing-test": "2026-10-30",
  "circuit": "2026-10-30",
  "ashcrown": "2026-10-30",
  "transit-chaos": "2026-10-29",
  "signal-tower": "2026-10-29",
  "fluid": "2026-10-29",
  "prism-duel": "2026-10-28",
  "rooftop-snipers": "2026-10-26",
  "mahjong": "2026-10-23",
  "chess": "2026-10-23",
  "block-blast": "2026-10-23",
  "minigolf": "2026-10-22",
  "lights-out": "2026-10-20",
  "deep": "2026-10-20"
};
export const META = {
  "geopeaks": ["Arcade", "Ski real mountains on open elevation data. Drop in at the summit and carve two thousand metres of vertical."],
  "ballistic-chickens": ["Arcade", "Load a chicken into a cannon and fire her as far as the gunpowder, the rocket and the obstacles allow."],
  "getaway-shootout": ["Arcade", "Hop left or right, grab weapons, and race your rivals to the escape. Play against computers or challenge a friend on one keyboard. Internet required for the Unity game files."],
  "shotgun-roulette": ["Arcade", "Take turns with Giratina pointing a shotgun at yourself or each other in the Distortion World. Bet tokens, or play a free test game."],
  "crossword": ["Puzzle", "The New York Times archive, one grid at a time. Everyone gets the same puzzle each morning; pull another whenever you like. Needs a connection to fetch a grid."],
  "imposter": ["Online", "Fill tasks or hunt the crew. A public room is always open; private rooms use a four-letter code."],
  "sudoku": ["Puzzle", "Nine by nine, three levels: fill every row, column and box without a repeat."],
  "photo-puzzle": ["Puzzle", "Upload a picture, break it into tiles, then swap them back into place."],
  "poke-gacha": ["Arcade", "Pull eggs, hatch a team, and beat Team Rocket in tower defense."],
  "poke-idle": ["Strategy", "Party of six, 36 gyms, nine regions, and a Pokédex to fill."],
  "air-hockey": ["Arcade", "Two mallets, one puck, first to seven. Hold your half and put it away."],
  "pokedoku": ["Puzzle", "Three daily Pokémon puzzles: Pokédoku, Inverse Doku and Shiny Hunt."],
  "krillion": ["Puzzle", "Seven prompts, twenty-five seconds an answer. Rarer answers sink deeper."],
  "quickdraw": ["Arcade", "Wait for DRAW. Fastest shot wins; fire too soon and lose."],
  "clicker": ["Arcade", "One click, one point. That is the whole game."],
  "downhill-mayhem": ["Arcade", "Six riders, one mountain, two laps of elbows-out downhill. Tricks charge the boost; fists settle the rest."],
  "corner": ["Strategy", "Fourteen days running a corner shop. Buy stock, price it, watch the weather, end up richer than the $120 you started with."],
  "ticket-to-ride": ["Strategy", "Trains across North America. Finish your tickets, keep the longest line."],
  "wallbound": ["Arcade", "Sticky ninja. Pull back, let go, hope the wall catches you."],
  "risk": ["Strategy", "Take over the world. Up to five computers would rather you didn't."],
  "scrabble": ["Puzzle", "Fifteen squares a side, seven tiles in hand. Spell across the board against the computer or a friend."],
  "brick-run": ["Arcade", "Run, jump and stomp your way to the flagpole."],
  "trackbound": ["Arcade", "Time trials with medals, ghosts and a daily track, plus a stunt park full of rings."],
  "ashcrown": ["Strategy", "Civ on a hex map. Cities, tech, up to three rivals. Pass the phone around."],
  "transit-chaos": ["Strategy", "Draw subway lines, move passengers, and keep a growing city from gridlock."],
  "typing-test": ["Puzzle", "Thirty seconds, common words, and a keyboard that does not forgive a glance away."],
  "circuit": ["Arcade", "Three laps against the clock on four drawn circuits, or a second car on W A S D."],
  "fluid": ["Sandbox", "Drag to stir ink through a live fluid."],
  "signal-tower": ["Strategy", "Tower defense. Thirty waves, then however many you can survive."],
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
  'connect-four': ['Strategy', 'Four in a row, against the computer or a friend'],
  'aim-lab': ['Arcade', 'Two 20-second rounds: aim, then memorize and hit invisible targets'],
  '8ball': ['Arcade', 'Break, pot, and clear the table'],
  sumo: ['Arcade', 'Push your rival out of the ring'], sand: ['Sandbox', 'Pour, mix, and build a tiny world'],
  poker: ['Strategy', "Texas Hold'em, Five Card Draw, Blackjack, and Euchre at the Lucky Spur. Poker hands earn chip scores."],
  wordle: ['Puzzle', 'Guess the five-letter word'], lava: ['Arcade', 'Stay above the heat'],
  volletball: ['Arcade', 'Keep the ball in play'], solitaire: ['Strategy', 'A quiet game of cards'],
  commanders: ['Arcade', 'Dodge, shoot, and battle through waves'], eco: ['Sandbox', 'Grow and observe a living ecosystem'],
  'void-runner': ['Arcade', 'Dodge obstacles and dash through the void'], qbert: ['Arcade', 'Hop the pyramid and change every tile'],
  simon: ['Puzzle', 'Remember the sequence'], frogger: ['Arcade', 'Get to the other side'],
  'pac-man': ['Arcade', 'A maze full of trouble'], snake: ['Arcade', 'One more bite'],
  tank: ['Arcade', 'Trade shots in an armored duel'], 'space-invaders': ['Arcade', 'Hold off the alien formation'],
  pong: ['Arcade', 'Literally the first video game'], asteroids: ['Arcade', 'Survive the asteroid field'],
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
  if (!PAYLOAD_SLUGS.includes(slug) && !Object.hasOwn(ADMIN_PREVIEWS, slug)) {
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
  'connect-four': Object.freeze({ name: 'Connect Four', rulesVersion: 1, mode: 'turns', preview: 'connect-four', blurb: 'Connect Four, one drop each.' }),
  chess: Object.freeze({ name: 'Chess', rulesVersion: 1, mode: 'turns', preview: 'chess', blurb: 'Chess, one move each. No clock.' }),
  scrabble: Object.freeze({ name: 'Scrabble', rulesVersion: 1, mode: 'turns', preview: 'scrabble', blurb: 'Scrabble, one word each. The bag is shared.' }),
  risk: Object.freeze({ name: 'Risk', rulesVersion: 1, mode: 'turns', preview: 'risk', blurb: 'Risk, one turn each. The board waits for you.' }),
  '8ball': Object.freeze({ name: '8 Ball Pool', rulesVersion: 1, mode: 'turns', preview: '8ball', blurb: 'Eight ball, one shot each.' }),
  tank2: Object.freeze({ name: 'Tank 2', rulesVersion: 3, mode: 'turns', preview: 'tank2', blurb: 'Tank 2, one shot each. The ground breaks.' }),
  ashcrown: Object.freeze({ name: 'Civ Lite', rulesVersion: 1, mode: 'turns', preview: 'ashcrown', blurb: 'Civ Lite, one turn each. Your CPU keeps playing while you are gone.' })
});

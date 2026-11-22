// Every scored game, how its best is measured, and how that best reaches the
// shared board. Games never talk to the backend themselves: this module owns the
// score specs, the rules they are posted under, and the ranking maths.

import { readStored, writeStored, writeRaw, readNumber } from './store.js';
import {
  backendReady, request, getSession, freshSession, scoreRules, rulesLoaded, loadRules, ensureProfile
} from './backend.js';

/* Extra Trackbound records are public leaderboard metadata, not another
   scored game. They only break ties when everyone in the tied group has a
   complete, layout-matched set of fifteen campaign records. */
export const TRACKBOUND_PACE_ID = 'trackbound-career-pace';

export function careerPaces(rows) {
  const result = new Map();
  for (const row of rows || []) {
    if (row.game !== TRACKBOUND_PACE_ID) continue;
    const key = String(row.handle || '').trim().toLowerCase();
    const pace = Number(row.value);
    if (key && Number.isInteger(pace) && pace > 0) result.set(key, pace);
  }
  return result;
}

function sortGameScores(rows, game, paceByPlayer) {
  rows.sort((a, b) => (game.lower ? a.value - b.value : b.value - a.value) || a.key.localeCompare(b.key));
  if (game.id !== 'trackbound') return new Set();
  const tiebroken = new Set();
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    while (end < rows.length && rows[end].value === rows[start].value) end++;
    const group = rows.slice(start, end);
    if (group.length > 1 && group.every(entry => paceByPlayer.has(entry.key))) {
      group.sort((a, b) => paceByPlayer.get(a.key) - paceByPlayer.get(b.key) || a.key.localeCompare(b.key));
      rows.splice(start, group.length, ...group);
      for (const entry of group) tiebroken.add(entry.key);
    }
    start = end;
  }
  return tiebroken;
}

/* ── Ranking ───────────────────────────────────────────────────────────────── */

/**
 * Account-wide ranking: a top-five finish earns 5 down to 1 points in each game,
 * with ties sharing a rank. Scores are only comparable *within* a game, so raw
 * units are never summed across them. Five places because the board is small.
 */
const RANK_WINDOW = 5;
export const rankPoints = rank => RANK_WINDOW + 1 - rank;

export function accountStandings(scores) {
  const accounts = new Map();
  const paceByPlayer = careerPaces(scores);
  const scoresByGame = new Map(LB_GAMES.map(game => [game.id, []]));
  for (const row of scores) {
    const gameScores = scoresByGame.get(row.game);
    const handle = String(row.handle || '').trim();
    const value = Number(row.value);
    if (!gameScores || !handle || !Number.isFinite(value) || value <= 0) continue;
    const key = handle.toLowerCase();
    if (!accounts.has(key)) accounts.set(key, { handle, points: 0, gamesPlayed: 0, gamesRanked: 0, wins: 0 });
    accounts.get(key).gamesPlayed++;
    gameScores.push({ key, value });
  }
  for (const game of LB_GAMES) {
    const rows = scoresByGame.get(game.id);
    const tiebroken = sortGameScores(rows, game, paceByPlayer);
    let rank = 0;
    let previous = null;
    let previousPace = null;
    for (let i = 0; i < rows.length; i++) {
      const current = rows[i];
      const pace = tiebroken.has(current.key) ? paceByPlayer.get(current.key) : null;
      if (previous !== current.value ||
          (pace !== null && previousPace !== null && pace !== previousPace)) rank = i + 1;
      previous = current.value;
      previousPace = pace;
      if (rank > RANK_WINDOW) break;
      const account = accounts.get(current.key);
      account.points += rankPoints(rank);
      account.gamesRanked++;
      if (rank === 1) account.wins++;
    }
  }
  return [...accounts.values()].sort((a, b) =>
    b.points - a.points || b.wins - a.wins || b.gamesRanked - a.gamesRanked ||
    a.handle.localeCompare(b.handle)
  );
}

/* ── Score specs ───────────────────────────────────────────────────────────── */

// Older games keep their own storage keys; `read` reads those directly.
const LEGACY_GAMES = [
  { id: '2048', name: '2048', unit: 'points', key: 'bored.best.2048' },
  { id: 'aim-lab', name: 'Aim Lab', unit: 'hits', key: 'bored.best.aim-lab.duo-v1.64' },
  { id: 'memory', name: 'Memory', unit: 'moves', key: 'bored.best.memory', lower: true },
  { id: 'snake', name: 'Snake', unit: 'apples', key: 'snake.bestScore' },
  { id: 'pac-man', name: 'Pac-Man', unit: 'points', key: 'pacHi' },
  { id: 'void-runner', name: 'Void Runner', unit: 'points', key: 'voidrunner_best' },
  { id: 'simon', name: 'Simon', unit: 'rounds', key: 'simonBest' },
  { id: 'minesweeper', name: 'Minesweeper', unit: 'seconds', lower: true, read() {
    const all = readStored('minesweeper_scores', {}) || {};
    const times = Array.isArray(all.beginner) ? all.beginner.map(entry => Number(entry.time)).filter(n => n > 0) : [];
    const synced = readNumber('bored.synced.minesweeper');
    return Math.min(...[...times, synced].filter(n => n > 0)) || 0;
  } }
];

// Games with a live snapshot: the hub stores the best value it sees for the
// metric the backend accepts, then reads that like any other local best.
//
// `run` is the contract for a run that is still going when the player leaves:
// `qualify` is a condition the run must always meet (a CPU opponent, a minimum
// time), while `when` is the moment the hub will capture it during play. A spec
// marked `resumable` counts on the way out even though `when` has not passed,
// because the score it keeps is a running total — the points are already yours
// half way through. Boards that rank *finishing* (a solved Wordle, the seconds
// to clear Solitaire) are deliberately not resumable: a half-played board is
// not a fast time, it is no time at all.
const highScore = (id, name, unit, extra = {}) => ({
  id, name, unit, key: 'bored.high.' + id,
  ...extra,
  read: () => readNumber(extra.key || ('bored.high.' + id))
});

export const HIGH_SCORE_GAMES = [
  highScore("rocket-chicken", "Rocket Chicken", "ft", { metric: "feet", when: snapshot => snapshot.finished === true }),
  // Crossword ranks the clock on the day's grid. Two archive puzzles are not
  // the same test — a random Wednesday is nothing like a Sunday — so only a
  // solved daily posts, and anything under a minute is not a solve. The clock
  // starts when the grid appears and stops on the last letter.
  highScore("crossword", "Crossword", "seconds", {
    metric: "seconds", lower: true, min: 60, max: 86400,
    when: snapshot => snapshot.solved === true && snapshot.daily === true,
    key: 'bored.high.crossword-daily-v1'
  }),
  // Sudoku ranks the clock, nothing else: whoever finishes a board fastest holds
  // the seat, whatever they picked on the selector — Easy is the default and we
  // are not going to pretend difficulty levels are comparable. Nothing is dealt
  // until Start, and the clock runs from the moment the board appears, so there
  // is no reading time before the first digit.
  highScore('sudoku', 'Sudoku', 'seconds', {
    metric: 'seconds', lower: true, min: 20, max: 86400,
    when: snapshot => snapshot.won === true,
    key: 'bored.high.sudoku-time-v1'
  }),
  // A photo puzzle ranks the time to solve the standard 4x4 board. Any picture
  // counts, the built-in sample included: the clock is the test, and the sample
  // is the one picture everyone shares. The other grid sizes are a different
  // test, so they cannot post.
  highScore('photo-puzzle', 'Photo Puzzle', 'seconds', {
    metric: 'seconds', lower: true, min: 8, max: 3600,
    when: snapshot => snapshot.finished === true && snapshot.standard === true,
    key: 'bored.high.photo-puzzle-4x4-v1'
  }),
  // Unique species in the Box (evolving counts too), out of 1025.
  highScore("poke-idle", "Poké Idle", "points", { metric: "score", max: 2050, when: snapshot => snapshot.finished === true }),
  // Poké Idle's Battle Tower ranks on its own board: the highest floor cleared. It has no page of its own, so
  // `page` names the game whose snapshot feeds it (see boardsOn).
  highScore("poke-idle-tower", "Poké Idle: Battle Tower", "floors", { page: "poke-idle", metric: "tower", min: 1, max: 100000, when: snapshot => snapshot.finished === true }),
  // Poké Gacha: species caught (any form owned counts once) plus every stage's best stars, out of
  // 1025 species and 75 stages x 3 stars. It counts up as the account plays, so there is no finished run.
  highScore("poke-gacha", "Poké Gacha", "points", { metric: "score", min: 1, max: 1250, when: snapshot => snapshot.score > 0 }),
  // Poké Gacha's weekly challenge: the highest risk total won in any week (13 is every risk at once).
  highScore("poke-gacha-weekly", "Poké Gacha: Weekly Challenge", "risk", { page: "poke-gacha", metric: "weeklyRisk", min: 1, max: 13, when: snapshot => snapshot.weeklyRisk > 0 }),
  // A finished match against the computer ranks the winning margin, so 7–1
  // beats 7–6. Local two-player games and abandoned matches never post.
  highScore("air-hockey", "Air Hockey", "goals", {
    metric: "margin", min: 1, max: 7,
    when: snapshot => snapshot.finished === true && snapshot.won === true && snapshot.cpu === true
  }),
  // Today's three dailies added up: Pokédoku (1350) + Inverse Doku (600) + Shiny Hunt (700).
  highScore("pokedoku", "Pokédoku", "points", { metric: "points", max: 2650, when: snapshot => snapshot.finished === true && snapshot.daily === true }),
  // Solo only: reaction time in milliseconds. False starts do not qualify, and
  // there is no floor, so a faster draw always improves the best; local duels
  // never affect the leaderboard.
  highScore('quickdraw', 'Quickdraw', 'ms', {
    metric: 'milliseconds', lower: true, max: 2000,
    when: snapshot => snapshot.finished === true && snapshot.solo === true
  }),
  // Clicker is endless: the running total is the whole score, so it is captured
  // on any snapshot rather than waiting for a finish line that does not exist.
  highScore('clicker', 'Clicker', 'points', { metric: 'clicks' }),
  // Corner ranks the till after fourteen trading days: a shop still mid-week
  // is not a result, and the board keeps cash rather than a mid-run high.
  highScore('corner', 'Corner', 'dollars', {
    metric: 'cash', min: 1, max: 100000,
    when: snapshot => snapshot.finished === true
  }),
  // A Ticket to Ride result is the final total of a finished game against the
  // CPU, after destination tickets and the longest-path bonus. An abandoned
  // board is only part of a score, so it never posts.
  highScore('ticket-to-ride', 'Ticket to Ride', 'points', {
    metric: 'points', min: 1, max: 500,
    when: snapshot => snapshot.finished === true && snapshot.cpu === true
  }),
  // The leaderboard measures the sum of best stars earned over all 20 stages (up to 60).
  highScore('wallbound', 'Sticky Ninja', 'stars', { metric: 'medals', min: 1, max: 60, when: snapshot => snapshot.finished === true }),
  // A fair Risk result requires winning the entire world against the CPU;
  // territories held mid-game and unfinished wars never enter the leaderboard.
  highScore('risk', 'Risk', 'turns', {
    metric: 'turns', lower: true, min: 1, max: 999,
    when: snapshot => snapshot.cpu === true && snapshot.won === true && snapshot.finished === true,
    key: 'bored.high.risk-turns-v1'
  }),
  // Scrabble ranks the points of a game played to the end against the computer;
  // a two-player game is a shared table, not a score to post, so only CPU games
  // qualify. The game asks for a player choice before the first tile is drawn.
  highScore('scrabble', 'Scrabble', 'points', {
    metric: 'points', min: 1, max: 2000,
    when: snapshot => snapshot.finished === true && snapshot.cpu === true,
    resumable: true
  }),
  highScore("brick-run", "Brick Run", "points", { metric: "score", when: snapshot => snapshot.finished === true }),
  // Ashcrown ranks the renown a campaign actually finished with: a banner still
  // growing when the player walked away is not a result. Every finished campaign
  // holds at least one city, so the renown floor is real rather than arbitrary.
  highScore('ashcrown', 'Civ Lite', 'renown', {
    metric: 'renown', min: 1, max: 10000,
    when: snapshot => snapshot.finished === true
  }),
  // Trackbound ranks the career, not one clock: every medal is worth points
  // (author 4, gold 3, silver 2, bronze 1), and only a finished run earns one,
  // so the board fills as the campaign falls rather than rewarding a single
  // lucky lap on the shortest map. The wall-free tracks rank on the clock like
  // the rest — their stunts pay in freeplay, not in the career — so medals are
  // the ceiling: 15 tracks x 4. Sweeping all sixteen park rings once adds five,
  // which makes 65 the whole board. Trick-earned totals above it are stale and
  // are refused here rather than re-posted.
  highScore('trackbound', 'Trackmania', 'points', {
    metric: 'points', max: 65,
    when: snapshot => snapshot.finished === true
  }),
  highScore("transit-chaos", "Transit Chaos", "passengers", { metric: "delivered", when: snapshot => snapshot.finished === true }),
  // Compare completed races on the fixed Classic mountain at standard Mayhem difficulty.
  highScore('downhill-mayhem', 'Downhill Mayhem', 'seconds', {
    metric: 'seconds', lower: true, min: 15, max: 3600,
    when: snapshot => snapshot.finished === true,
    key: 'bored.high.downhill-mayhem-classic-mayhem-v1'
  }),
  // Circuit ranks the whole three-lap race: the clock starts on the first
  // keypress and stops at the line, so a quick lap cannot offset a scrappy one.
  // The board's value is an integer, so the race is posted in hundredths of a
  // second rather than rounded to whole ones — two runs a tenth apart used to
  // tie on the board and now do not. Under fifteen seconds means the circuit
  // was cut. Two-player races share the clock, so the first car's time is still
  // the same test. The storage key moved with the unit, because a saved best of
  // "42" would otherwise outrank every real hundredth-of-a-second time.
  highScore('circuit', 'Circuit', 'centiseconds', {
    metric: 'centiseconds', lower: true, min: 1500, max: 360000,
    when: snapshot => snapshot.finished === true && snapshot.centiseconds > 0,
    key: 'bored.high.circuit-race-v2'
  }),
  // Typing Test only ranks a finished run at 90% accuracy or better: fast and
  // wrong is not a typing score.
  highScore('typing-test', 'Typing Test', 'words per minute', {
    metric: 'wpm', min: 5, max: 300,
    when: snapshot => snapshot.finished === true && snapshot.accuracy >= 90,
    key: 'bored.high.typing-test-wpm-v1'
  }),
  // Signal Tower keeps the waves already cleared, so leaving mid-defence still
  // keeps what the line has held. A run that never clears wave one saves nothing.
  highScore("signal-tower", "Signal Tower", "waves", { metric: "waves", resumable: true }),
  // Block Blast counts the score of a run that ended with no piece left to place.
  highScore('block-blast', 'Block Blast', 'points', { metric: 'score', when: snapshot => snapshot.finished === true, resumable: true }),
  // Chess counts the human's wins against the computer in a session, like Connect Four.
  highScore('chess', 'Chess', 'wins', { metric: 'wins', qualify: snapshot => snapshot.cpu === true, when: snapshot => snapshot.won === 1, resumable: true }),
  // Rank full 144-tile Mahjong clears by completion time; pairs remain
  // available for daily challenges, but partial deals are not speed records.
  highScore('mahjong', 'Mahjong', 'seconds', {
    metric: 'seconds', lower: true, min: 60, max: 86400,
    key: 'bored.high.mahjong-time-v4',
    when: snapshot => snapshot.won === true && snapshot.finished === true && snapshot.total === 144 && snapshot.pairs === 72
  }),
  highScore("minigolf", "Minigolf", "strokes", { metric: "strokes", when: snapshot => snapshot.finished === true, lower: true }),
  // Native Connect Four counts human victories against its AI across the session.
  highScore('connect-four', 'Connect Four', 'wins', { metric: 'wins', when: snapshot => snapshot.cpu === true }),
  // Tank2's adapter reports an AI match win when the match ends.
  highScore('tank2', 'Tank 2', 'wins', { metric: 'won', when: snapshot => snapshot.cpu === true }),
  highScore('deep', 'DEEP', 'points', {
    metric: 'score',
    // The end screen adds the clear bonus, so a finished descent is captured
    // then; leaving part way through still keeps the points already earned.
    when: snapshot => snapshot.finished === true,
    resumable: true
  }),
  // These games keep a running score, so the board ranks that rather than the
  // coarse counter: two decent runs tie on lines cleared or waves survived and
  // only separate on the score. The daily challenge still uses the counter.
  highScore('tetris', 'Tetris', 'points', { metric: 'score' }),
  highScore('breakout', 'Breakout', 'points', { metric: 'score' }),
  highScore('frogger', 'Frogger', 'points', { metric: 'score' }),
  highScore('wordle', 'Wordle', 'guesses', {
    // The Wordle adapter reports the number of submitted rows after each
    // guess resolves. Adding one made every completed solve rank too slowly.
    metric: 'guesses', lower: true,
    when: snapshot => snapshot.solved === true
  }),
  highScore('space-invaders', 'Space Invaders', 'points', { metric: 'score' }),
  highScore('qbert', 'Q*bert', 'points', { metric: 'score' }),
  highScore('pong', 'Pong', 'points', { metric: 'points', when: snapshot => snapshot.cpu === true }),
  highScore('sumo', 'SUMO', 'rounds', { metric: 'wins', when: snapshot => snapshot.cpu === true }),
  highScore('poker', 'Poker', 'chips', { metric: 'profit', when: snapshot => snapshot.handOver === true }),
  highScore('tank', 'Tank', 'rounds', { metric: 'wins', when: snapshot => snapshot.cpu === true }),
  // Solitaire is finishable, so the board ranks the time to clear it.
  highScore('solitaire', 'Solitaire', 'seconds', {
    metric: 'seconds',
    lower: true,
    when: snapshot => snapshot.won === true && snapshot.cards === 52 && snapshot.moves >= 52 && snapshot.draw === 3,
    // Ignore implausible times and legacy scores from the pausable timer.
    // Easy (draw-one) clears are practice and never rank.
    min: 20, max: 86400, key: 'bored.high.solitaire-wall-v4',
    note: 'Fastest Hard (draw three) clear of all 52 cards'
  }),
  highScore('lights-out', 'Lights Out', 'boards', { metric: 'cleared' }),
  highScore('commanders', 'Commanders', 'points', { metric: 'score' }),
  highScore('lava', 'Lava', 'CPU points', { metric: 'points', when: snapshot => snapshot.cpu === true }),
  highScore('volletball', 'VolletBall', 'CPU points', { metric: 'points', when: snapshot => snapshot.cpu === true }),
  highScore('gun-mayhem', 'Gun Mayhem', 'CPU rounds', { metric: 'wins', when: snapshot => snapshot.cpu === true }),
  highScore('shadow-net', 'shadow.net', 'files', { metric: 'files' }),
  highScore('asteroids', 'Asteroids', 'points', { metric: 'score' })
];

export const LB_GAMES = [...LEGACY_GAMES, ...HIGH_SCORE_GAMES];
const highScoreSpec = new Map(HIGH_SCORE_GAMES.map(game => [game.id, game]));

/**
 * The boards one game page feeds: its own, then any spec that names it as its
 * `page` (a second board inside the same game, like Poké Idle's Battle Tower).
 */
export function boardsOn(slug) {
  return HIGH_SCORE_GAMES.filter(game => game.id === slug || game.page === slug).map(game => game.id);
}

/**
 * The posted high score of each board, with the handle that holds it. The
 * library cards use it as a byline, so it works from the same rows the
 * leaderboard reads: one best per game, the minimum for a lower-is-better
 * board. Games the hub no longer ranks are simply absent.
 */
export function boardLeaders(rows) {
  const leaders = new Map();
  const specs = new Map(LB_GAMES.map(game => [game.id, game]));
  for (const row of rows || []) {
    const spec = specs.get(row.game);
    const handle = String(row.handle || '').trim();
    const value = Number(row.value);
    if (!spec || !handle || !Number.isFinite(value) || value <= 0) continue;
    const held = leaders.get(spec.id);
    if (!held || (spec.lower ? value < held.value : value > held.value)) {
      leaders.set(spec.id, { value, handle, handles: [handle] });
    } else if (value === held.value && !held.handles.some(name => name.toLowerCase() === handle.toLowerCase())) {
      // We cannot prove who first achieved an old tied score. Keep all
      // verified co-leaders instead of accidentally rewarding alphabetical order.
      held.handles.push(handle);
      held.handles.sort((a, b) => a.localeCompare(b));
    }
  }
  return leaders;
}

/**
 * The best posted score of each player on one board, best first. The library
 * cards list the top three in a tooltip, so this is `boardLeaders` per handle
 * rather than per game, capped at the number the card shows.
 */
export function boardTop(rows, id, limit = 3) {
  const spec = LB_GAMES.find(game => game.id === id);
  if (!spec) return [];
  const best = new Map();
  for (const row of rows || []) {
    if (row.game !== id) continue;
    const handle = String(row.handle || '').trim();
    const value = Number(row.value);
    if (!handle || !Number.isFinite(value) || value <= 0) continue;
    const key = handle.toLowerCase();
    const held = best.get(key);
    if (!held || (spec.lower ? value < held.value : value > held.value)) best.set(key, { handle, value });
  }
  return [...best.values()]
    .sort((a, b) => (spec.lower ? a.value - b.value : b.value - a.value) || a.handle.localeCompare(b.handle))
    .slice(0, limit);
}

/* ── Which boards the shared table can hold ───────────────────────────────── */

// The scores table only accepts games that have a row in score_rules, so each
// game is its own board and one without a row yet is marked local-only: its
// best still saves in the browser, and nothing is posted for it.

/** True when the backend has no rule for the game, so it can only save locally. */
export function isLocalOnly(id) {
  return scoreRules.size ? !scoreRules.has(id) : false;
}

/** Games in picker order: boards the backend can hold come first. */
export function boardGames() {
  if (!scoreRules.size) return LB_GAMES.slice();
  return LB_GAMES.slice().sort((a, b) =>
    (scoreRules.has(a.id) ? 0 : 1) - (scoreRules.has(b.id) ? 0 : 1));
}

export function bestValue(game) {
  const value = game.read ? game.read() : readNumber(game.key);
  // Cloud restores or older releases may have put incompatible values in
  // local storage. Ignore them so a real win can replace the corrupt best.
  if (!Number.isFinite(value) || value <= 0 ||
      (Number.isFinite(game.min) && value < game.min) ||
      (Number.isFinite(game.max) && value > game.max)) return 0;
  return value;
}

export function formatScore(value, game) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0 ' + game.unit;
  // Hundredths read as a stopwatch rather than as a raw count: 4237 is 42.37 s.
  if (game.unit === 'centiseconds') return (Math.max(0, number) / 100).toFixed(2) + ' s';
  if (game.unit === 'seconds') {
    const total = Math.max(0, Math.round(number));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  return Math.round(number * 10) / 10 + ' ' + game.unit;
}

/* ── Capturing a best ──────────────────────────────────────────────────────── */

/**
 * The number a snapshot would rank on, after `when`/`transform`, or 0 when the
 * run does not count. The hub uses it both to keep a best and to tell a guest
 * what they just scored. `leaving` says the player is walking out of the game,
 * so a resumable spec keeps what the run has so far.
 */
export function scoreValue(slug, snapshot, { leaving = false } = {}) {
  const spec = highScoreSpec.get(slug);
  if (!spec || !snapshot || snapshot.slug !== (spec.page || slug)) return 0;
  if (spec.qualify && !spec.qualify(snapshot)) return 0;
  if (spec.when && !spec.when(snapshot) && !(leaving && spec.resumable)) return 0;
  const value = spec.transform ? spec.transform(snapshot) : Number(snapshot[spec.metric]);
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return rounded > 0 && (!spec.min || rounded >= spec.min) && (!spec.max || rounded <= spec.max) ? rounded : 0;
}

/**
 * Keep a run's best when it beats the stored one. Returns true only when the
 * local best improved, which is also the moment the shared board should learn
 * about it rather than waiting for the player to leave the game.
 */
export function recordBest(slug, snapshot, options) {
  const spec = highScoreSpec.get(slug);
  const value = scoreValue(slug, snapshot, options);
  if (!spec || !value) return false;
  const previous = bestValue(spec);
  if (previous && (spec.lower ? value >= previous : value <= previous)) return false;
  if (!writeRaw(spec.key, value)) return false;
  requestScoreSync();
  return true;
}

/**
 * The best number this page could post right now, which is how telemetry
 * corroborates the shared board. A snapshot game reports the live run; a page
 * that feeds a second board (Poké Gacha's weekly challenge) reports that board
 * too; and the native games that keep their own storage key report the best
 * they have saved, because they have no snapshot for anyone to read.
 */
export function reportedValue(slug, snapshot) {
  let best = scoreValue(slug, snapshot);
  for (const id of boardsOn(slug)) {
    if (id !== slug) best = Math.max(best, scoreValue(id, snapshot));
  }
  if (!best) {
    const legacy = LEGACY_GAMES.find(game => game.id === slug);
    if (legacy) best = bestValue(legacy);
  }
  return best;
}

/* ── Syncing to the shared board ───────────────────────────────────────────── */

// The game keeps full campaign bests in IndexedDB. Sync only a changed set,
// once per signed-in account. Failed uploads retry after a short backoff;
// another device's slower times cannot overwrite better published records.
let careerSentKey = '';
let careerPending = null;
let careerInFlight = false;
let careerFailedKey = '';
let careerRetryAfter = 0;
export function queueTrackboundCareer(records) {
  const user = getSession()?.user?.id;
  if (!backendReady() || !user || !Array.isArray(records)) return;
  const clean = records.filter(record => record && /^[a-z0-9-]{2,30}$/.test(record.track) &&
    Number.isInteger(record.ms) && record.ms > 0 && record.ms <= 1200000 &&
    typeof record.layout === 'string' && record.layout.length > 0 && record.layout.length <= 400);
  if (!clean.length || clean.length > 15) return;
  const key = user + ':' + JSON.stringify(clean);
  if (key === careerSentKey || key === careerPending?.key ||
      (key === careerFailedKey && Date.now() < careerRetryAfter)) return;
  careerPending = { key, user, records: clean };
  if (!careerInFlight) void flushTrackboundCareer();
}

async function flushTrackboundCareer() {
  careerInFlight = true;
  try {
    while (careerPending) {
      const job = careerPending;
      careerPending = null;
      if (job.key === careerSentKey || getSession()?.user?.id !== job.user ||
          !(await freshSession()) || getSession()?.user?.id !== job.user) continue;
      try {
        await request('/rest/v1/rpc/submit_trackbound_campaign', {
          method: 'POST', body: { p_records: job.records }
        });
        careerSentKey = job.key;
        careerFailedKey = '';
        if (job.records.length === 15 && getSession()?.user?.id === job.user)
          postedListener({ rows: [] }); // Refresh the separate pace data, not game scores.
      } catch {
        careerFailedKey = job.key;
        careerRetryAfter = Date.now() + 30000;
        break;
      }
    }
  } finally { careerInFlight = false; }
}

let postedListener = () => {};

/** Called after a score reaches the backend, so the UI can refresh itself. */
export function onScoresPosted(listener) {
  postedListener = listener;
}

let syncTimer = 0;

/** Debounced because a run ends with several snapshots in a row. */
function requestScoreSync() {
  if (!getSession() || !backendReady()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncScores(); }, 600);
}

export async function syncScores() {
  if (!backendReady() || !getSession()) return false;
  // Refresh before posting so a token that lapsed mid-session cannot cost a score.
  if (!(await freshSession())) return false;
  const session = getSession();
  // Posting a game the backend has no rule for trips scores_game_fkey, so wait
  // for the rule list instead of guessing at it.
  if (!rulesLoaded() && !(await loadRules())) return false;
  const submittedKey = 'bored.submitted.' + session.user.id;
  // The value the server last confirmed for each board. submit_score keeps the
  // better of the submitted and stored value atomically, so the accepted value
  // remembered here is enough to skip a game: reading the whole scores table
  // back first only avoids the occasional no-op RPC and costs a request on
  // every sync.
  const submitted = readStored(submittedKey, {}) || {};
  try {
    if (!(await ensureProfile()) || getSession()?.user?.id !== session.user.id) return false;
  } catch (err) {
    return { error: err };
  }
  let posted = false;
  const accepted = [];
  for (const game of LB_GAMES) {
    if (isLocalOnly(game.id)) continue;
    let score = bestValue(game);
    if (!score || !Number.isFinite(score)) continue;
    score = Math.round(score);
    const rule = scoreRules.get(game.id);
    const floor = Number.isFinite(game.min) ? game.min : rule?.min_value;
    const ceiling = Number.isFinite(game.max) ? game.max : rule?.max_value;
    // Stored scores can come from older clients or a cloud restore; apply
    // the same bounds at upload time as when capturing new gameplay.
    if (score <= 0 || (Number.isFinite(floor) && score < floor) ||
        (Number.isFinite(ceiling) && score > ceiling)) continue;
    const previous = Number(submitted[game.id]);
    // A cached confirmation above the board's ceiling cannot have come from the
    // rule set in front of us (a ceiling lowered by a release, or a restored
    // cloud value). Treat it as stale instead of letting it block every post.
    const stalePrevious = Number.isFinite(ceiling) && Number.isFinite(previous) && previous > ceiling;
    if (!stalePrevious && Number.isFinite(previous) && previous > 0 &&
        (game.lower ? score >= previous : score <= previous)) continue;
    if (getSession()?.user?.id !== session.user.id) return false;
    try {
      // The server applies score rules and atomically keeps the personal best.
      // No client-side UPDATE or INSERT on scores is required.
      const stored = await request('/rest/v1/rpc/submit_score', {
        method: 'POST', body: { p_game: game.id, p_value: score }
      });
      if (getSession()?.user?.id !== session.user.id) return false;
      const best = Number(stored);
      if (!Number.isFinite(best)) return { error: new Error('Invalid score confirmation') };
      submitted[game.id] = best;
      accepted.push({ game: game.id, value: best });
      writeStored(submittedKey, submitted);
      if (best === score) posted = true;
    } catch (err) {
      // A missing rule row means this game cannot post; every other game can.
      if (err.status !== 401 && err.code !== '23503' && !/foreign key/i.test(err.message || '')) {
        return { error: err };
      }
    }
  }
  if (posted) postedListener({ rows: accepted });
  return { posted };
}

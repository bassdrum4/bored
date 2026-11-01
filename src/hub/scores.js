// Every scored game, how its best is measured, and how that best reaches the
// shared board. Games never talk to the backend themselves: this module owns the
// score specs, the rules they are posted under, and the ranking maths.

import { readStored, writeStored, writeRaw, readNumber } from './store.js';
import {
  backendReady, request, getSession, freshSession, scoreRules, rulesLoaded, loadRules, ensureProfile
} from './backend.js';

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
    rows.sort((a, b) => (game.lower ? a.value - b.value : b.value - a.value) || a.key.localeCompare(b.key));
    let rank = 0;
    let previous = null;
    for (let i = 0; i < rows.length; i++) {
      if (previous !== rows[i].value) rank = i + 1;
      previous = rows[i].value;
      if (rank > RANK_WINDOW) break;
      const account = accounts.get(rows[i].key);
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
  highScore("brick-run", "Brick Run", "points", { metric: "score", when: snapshot => snapshot.finished === true }),
  // Ashcrown ranks the renown a campaign actually finished with: a banner still
  // growing when the player walked away is not a result. Every finished campaign
  // holds at least one city, so the renown floor is real rather than arbitrary.
  highScore('ashcrown', 'Ashcrown', 'renown', {
    metric: 'renown', min: 1, max: 10000,
    when: snapshot => snapshot.finished === true
  }),
  // Trackbound ranks the campaign, not one clock: gold medals are per track and
  // only a finished run can earn one, so the board fills as the campaign falls
  // rather than rewarding a single lucky lap on the shortest map.
  highScore('trackbound', 'Trackbound', 'gold medals', { metric: 'medals', when: snapshot => snapshot.finished === true }),
  highScore("transit-chaos", "Transit Chaos", "passengers", { metric: "delivered", when: snapshot => snapshot.finished === true }),
  // Circuit ranks the whole three-lap race: the clock starts on the first
  // keypress and stops at the line, so a quick lap cannot offset a scrappy one.
  // The board stores whole seconds and only a finished race posts; under
  // fifteen seconds means the circuit was cut. Two-player races use the same
  // clock on both cars, so the first car's time is still the same test.
  highScore('circuit', 'Circuit', 'seconds', {
    metric: 'seconds', lower: true, min: 15, max: 3600,
    when: snapshot => snapshot.finished === true && snapshot.seconds > 0,
    key: 'bored.high.circuit-race-v1'
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
  // Prism Duel ranks the fewest of your own turns it took to burn the CPU's
  // core across the session; a two-player duel is unranked, so the spec only
  // reads a win the CPU was actually sitting across the board for. The turns
  // beat the old win counter, which could not tell a two-turn kill from a
  // twenty-turn grind, so the stored best starts a fresh key.
  highScore('prism-duel', 'Prism Duel', 'turns', {
    metric: 'turns', lower: true, min: 1, max: 999,
    when: snapshot => snapshot.cpu === true && snapshot.won === true,
    key: 'bored.high.prism-duel-turns-v1'
  }),
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
  highScore('tank2', 'Tank2', 'wins', { metric: 'won', when: snapshot => snapshot.cpu === true }),
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
    when: snapshot => snapshot.won === true && snapshot.cards === 52 && snapshot.moves >= 52,
    // Ignore implausible times and legacy scores from the pausable timer.
    min: 20, max: 86400, key: 'bored.high.solitaire-wall-v4',
    note: 'Fastest clear of all 52 cards'
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
  if (!spec || !snapshot || snapshot.slug !== slug) return 0;
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

/* ── Syncing to the shared board ───────────────────────────────────────────── */

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
  const submitted = readStored(submittedKey, {}) || {};
  const serverValues = new Map();
  try {
    if (!(await ensureProfile()) || getSession()?.user?.id !== session.user.id) return false;
    const rows = await request('/rest/v1/scores?select=game,value&user_id=eq.' + encodeURIComponent(session.user.id));
    if (getSession()?.user?.id !== session.user.id) return false;
    for (const row of rows || []) {
      const value = Number(row.value);
      if (Number.isFinite(value)) {
        serverValues.set(row.game, value);
        submitted[row.game] = value;
      }
    }
    writeStored(submittedKey, submitted);
  } catch (err) {
    return { error: err };
  }
  let posted = false;
  for (const game of LB_GAMES) {
    if (isLocalOnly(game.id)) continue;
    let score = bestValue(game);
    if (!score || !Number.isFinite(score)) continue;
    score = Math.round(score);
    const rule = scoreRules.get(game.id);
    const ceiling = Number.isFinite(game.max) ? game.max : rule?.max_value;
    // Stored scores can come from older clients or a cloud restore; apply
    // the same bounds at upload time as when capturing new gameplay.
    if (score <= 0 || (Number.isFinite(game.min) && score < game.min) ||
        (Number.isFinite(ceiling) && score > ceiling)) continue;
    const previous = serverValues.get(game.id);
    if (previous != null && (game.lower ? score >= previous : score <= previous)) continue;
    if (getSession()?.user?.id !== session.user.id) return false;
    try {
      // The server applies score rules and atomically keeps the personal best.
      // No client-side UPDATE or INSERT on scores is required.
      const stored = await request('/rest/v1/rpc/submit_score', {
        method: 'POST', body: { p_game: game.id, p_value: score }
      });
      if (getSession()?.user?.id !== session.user.id) return false;
      const accepted = Number(stored);
      if (!Number.isFinite(accepted)) return { error: new Error('Invalid score confirmation') };
      submitted[game.id] = accepted;
      writeStored(submittedKey, submitted);
      if (accepted === score) posted = true;
    } catch (err) {
      // A missing rule row means this game cannot post; every other game can.
      if (err.status !== 401 && err.code !== '23503' && !/foreign key/i.test(err.message || '')) {
        return { error: err };
      }
    }
  }
  if (posted) postedListener();
  return { posted };
}

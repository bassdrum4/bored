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
export const RANK_WINDOW = 5;
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
  { id: 'aim-lab', name: 'Aim Lab', unit: 'hits', key: 'bored.best.aim-lab.64' },
  { id: 'memory', name: 'Memory', unit: 'moves', key: 'bored.best.memory', lower: true },
  { id: 'snake', name: 'Snake', unit: 'apples', key: 'snake.bestScore' },
  { id: 'pac-man', name: 'Pac-Man', unit: 'points', key: 'pacHi' },
  { id: 'void-runner', name: 'Void Runner', unit: 'points', key: 'voidrunner_best' },
  { id: 'simon', name: 'Simon', unit: 'rounds', key: 'simonBest' },
  { id: 'minesweeper', name: 'Minesweeper', unit: 'seconds', lower: true, read() {
    const all = readStored('minesweeper_scores', {}) || {};
    const times = Array.isArray(all.beginner) ? all.beginner.map(entry => Number(entry.time)).filter(n => n > 0) : [];
    return times.length ? Math.min(...times) : 0;
  } }
];

// Games with a live snapshot: the hub stores the best value it sees for the
// metric the backend accepts, then reads that like any other local best.
const highScore = (id, name, unit, extra = {}) => ({
  id, name, unit, key: 'bored.high.' + id,
  ...extra,
  read: () => readNumber('bored.high.' + id)
});

export const HIGH_SCORE_GAMES = [
  highScore('deep', 'DEEP', 'points', {
    metric: 'score',
    // A descent only counts once it ends: the end-screen score carries the
    // clear bonus, and an abandoned run should not post a partial score.
    when: snapshot => snapshot.finished === true
  }),
  highScore('8ball', '8 Ball', 'balls', { metric: 'potted', when: snapshot => snapshot.cpu === true }),
  highScore('tetris', 'Tetris', 'lines', { metric: 'lines' }),
  highScore('breakout', 'Breakout', 'layouts', { metric: 'layouts' }),
  highScore('frogger', 'Frogger', 'lily pads', { metric: 'homes' }),
  highScore('wordle', 'Wordle', 'guesses', {
    metric: 'guesses', lower: true,
    when: snapshot => snapshot.solved === true,
    transform: snapshot => snapshot.guesses + 1
  }),
  highScore('space-invaders', 'Space Invaders', 'waves', { metric: 'waves' }),
  highScore('qbert', 'Q*bert', 'levels', { metric: 'levels' }),
  highScore('pong', 'Pong', 'points', { metric: 'points', when: snapshot => snapshot.cpu === true }),
  highScore('sumo', 'SUMO', 'rounds', { metric: 'wins', when: snapshot => snapshot.cpu === true }),
  highScore('lighthouse', 'Lighthouse', 'ships', { metric: 'ships' }),
  highScore('poker', 'Poker', 'chips', { metric: 'profit', when: snapshot => snapshot.handOver === true }),
  highScore('tank', 'Tank', 'rounds', { metric: 'wins', when: snapshot => snapshot.cpu === true }),
  // Solitaire is finishable, so the board ranks the time to clear it.
  highScore('solitaire', 'Solitaire', 'seconds', {
    metric: 'seconds',
    lower: true,
    when: snapshot => snapshot.won === true,
    // The shared rule was written for foundation cards, so the range check has
    // to come from here now that the board ranks seconds.
    max: 86400,
    note: 'Fastest clear of all 52 cards'
  }),
  highScore('lights-out', 'Lights Out', 'boards', { metric: 'cleared' }),
  highScore('commanders', 'Commanders', 'waves', { metric: 'waves' }),
  highScore('lava', 'Lava', 'points', { metric: 'points', when: snapshot => snapshot.cpu === true }),
  highScore('volletball', 'VolletBall', 'points', { metric: 'points', when: snapshot => snapshot.cpu === true }),
  highScore('gun-mayhem', 'Gun Mayhem', 'rounds', { metric: 'wins', when: snapshot => snapshot.cpu === true }),
  highScore('shadow-net', 'shadow.net', 'files', { metric: 'files' }),
  highScore('sand', 'Sand', 'cells', { metric: 'cells' }),
  highScore('eco', 'Eco', 'plants', { metric: 'plants', when: snapshot => snapshot.seconds >= 60 }),
  highScore('asteroids', 'Asteroids', 'waves', { metric: 'waves' })
];

export const LB_GAMES = [...LEGACY_GAMES, ...HIGH_SCORE_GAMES];
const highScoreSpec = new Map(HIGH_SCORE_GAMES.map(game => [game.id, game]));

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
  return game.read ? game.read() : readNumber(game.key);
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
 * Keep a run's best when it beats the stored one. Returns true only when the
 * local best improved, which is also the moment the shared board should learn
 * about it rather than waiting for the player to leave the game.
 */
export function recordBest(slug, snapshot) {
  const spec = highScoreSpec.get(slug);
  if (!spec || !snapshot || snapshot.slug !== slug) return false;
  if (spec.when && !spec.when(snapshot)) return false;
  let value = spec.transform ? spec.transform(snapshot) : Number(snapshot[spec.metric]);
  if (!Number.isFinite(value)) return false;
  value = Math.round(value);
  if (value <= 0) return false;
  const previous = readNumber(spec.key);
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
export function requestScoreSync() {
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
  try {
    if (!(await ensureProfile())) return false;
    const rows = await request('/rest/v1/scores?select=game,value&user_id=eq.' + encodeURIComponent(session.user.id));
    for (const row of rows || []) {
      const value = Number(row.value);
      if (Number.isFinite(value)) submitted[row.game] = value;
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
    if (Number.isFinite(ceiling) && score > ceiling) continue;
    const previous = submitted[game.id];
    if (previous != null && (game.lower ? score >= previous : score <= previous)) continue;
    try {
      await request('/rest/v1/scores?on_conflict=user_id,game', {
        method: 'POST',
        body: {
          user_id: session.user.id,
          game: game.id,
          value: score,
          score,
          updated_at: new Date().toISOString()
        },
        prefer: 'resolution=merge-duplicates,return=minimal'
      });
      submitted[game.id] = score;
      writeStored(submittedKey, submitted);
      posted = true;
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

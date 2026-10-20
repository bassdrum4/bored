import { ORDER, GAMES, EXTERNS, NEW_GAMES, META, FONT_CSS } from './games/catalog.js';
import { threeBootstrap } from './games/three.js';
import { nativeHTML } from './games/arcade.js';
import { dailyDate as defaultDailyDate, dailyChallenge, dailyCheck, installDailyAdapter, CHALLENGES } from './daily.js';

// Keep the original console/test surface available from the bundled file. The
// date wrapper also lets the offline Puppeteer suite pin a challenge date.
function challengeDate(...args) {
  return (window.dailyDate || defaultDailyDate)(...args);
}
if (typeof window !== 'undefined') window.dailyDate = defaultDailyDate;


const $ = s => document.querySelector(s);
const grid = $('#grid'), player = $('#player'), frame = $('#frame'), q = $('#q');
const menuToggle = $('#menu-toggle'), playerActions = $('#player-actions');

// ── Shared leaderboard (Supabase) ───────────────────────────────────────────
// The project URL and publishable key are safe to ship in a static page; the
// leaderboard tables are protected by row-level security.
const SUPABASE_URL = 'https://djdpttltfmwkofdrvkem.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ayx7pzjm55vlzQ4u8se9KA_O97WK-QZ';
const LB_GAMES = [
  { id: '2048', name: '2048', unit: 'points', key: 'bored.best.2048' },
  { id: 'aim-lab', name: 'Aim Lab', unit: 'hits', key: 'bored.best.aim-lab.64' },
  { id: 'memory', name: 'Memory', unit: 'moves', key: 'bored.best.memory', lower: true },
  { id: 'snake', name: 'Snake', unit: 'apples', key: 'snake.bestScore' },
  { id: 'pac-man', name: 'Pac-Man', unit: 'points', key: 'pacHi' },
  { id: 'void-runner', name: 'Void Runner', unit: 'points', key: 'voidrunner_best' },
  { id: 'simon', name: 'Simon', unit: 'rounds', key: 'simonBest' },
  { id: 'minesweeper', name: 'Minesweeper', unit: 'seconds', lower: true, read() {
    try {
      const all = JSON.parse(localStorage.getItem('minesweeper_scores') || '{}');
      const times = Array.isArray(all.beginner) ? all.beginner.map(entry => Number(entry.time)).filter(n => n > 0) : [];
      return times.length ? Math.min(...times) : 0;
    } catch { return 0; }
  } }
];

// Most games expose a live snapshot through the daily adapter. Store the best
// value seen for the metrics the backend accepts, then read it like any other
// local best when the leaderboard syncs.
const highScore = (id, name, unit, extra = {}) => ({
  id, name, unit, key: 'bored.high.' + id,
  ...extra,
  read() {
    try { return Number(localStorage.getItem('bored.high.' + this.id)) || 0; } catch { return 0; }
  }
});
const HIGH_SCORE_GAMES = [
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
LB_GAMES.push(...HIGH_SCORE_GAMES);
const highScoreSpec = new Map(HIGH_SCORE_GAMES.map(game => [game.id, game]));
const lbCache = new Map();
const scoreRules = new Map();
// The scores table has a foreign key on game id, so nothing is posted until the
// list of games the backend accepts has actually loaded.
let rulesLoaded = false;
let session = loadSession();
let submitted = {};
let myHandle = '';
let lbGame = 'overall';
let lbView = 'players';
let lbOpenPlayer = '';
const rankedGames = new Set();
const unrankedGames = new Set();
let authMode = 'signin';
let authBusy = false;
let lbNotice = '';

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function supabaseOn() {
  return /^https:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
}
function loadSession() {
  const saved = readJson('bored.session', null);
  return saved && saved.access_token && saved.user ? saved : null;
}
function loadSubmitted() {
  submitted = session ? readJson('bored.submitted.' + session.user.id, {}) : {};
}
function saveSubmitted() {
  if (session) writeJson('bored.submitted.' + session.user.id, submitted);
}
function storeSession(data) {
  const user = data.user || session?.user;
  if (!user) return;
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user
  };
  writeJson('bored.session', session);
  loadSubmitted();
}
function forgetSession() {
  session = null;
  myHandle = '';
  lbNotice = '';
  try { localStorage.removeItem('bored.session'); } catch {}
  submitted = {};
  lbCache.clear();
}
function userName() {
  const meta = session?.user?.user_metadata || {};
  const name = String(meta.display_name || session?.user?.email || 'player').split('@')[0];
  return name.slice(0, 20) || 'player';
}
function cleanHandle(value) {
  let handle = String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
  while (handle.length < 3) handle += '_';
  return handle.slice(0, 16);
}
async function sb(path, { method = 'GET', body, prefer, token } = {}) {
  const headers = { apikey: SUPABASE_ANON_KEY };
  headers.Authorization = 'Bearer ' + (token || session?.access_token || SUPABASE_ANON_KEY);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(SUPABASE_URL.replace(/\/+$/, '') + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    let message = res.status + ' ' + res.statusText;
    let code;
    try {
      const data = await res.json();
      message = data.msg || data.message || data.error_description || data.error || message;
      code = data.code;
    } catch {}
    const error = new Error(message);
    error.status = res.status;
    error.code = code;
    throw error;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
async function refreshSession() {
  if (!session?.refresh_token) { forgetSession(); return null; }
  try {
    const data = await sb('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
      token: SUPABASE_ANON_KEY
    });
    storeSession(data);
    return session;
  } catch {
    forgetSession();
    return null;
  }
}
async function freshSession() {
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) return refreshSession();
  return session;
}
function authError(err) {
  const message = String(err?.message || err);
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/user already registered/i.test(message)) return 'That email already has an account. Try signing in.';
  if (/email not confirmed/i.test(message)) return 'Check your email to confirm the account first.';
  if (/password should be at least/i.test(message)) return 'Use at least 6 characters for the password.';
  if (/names use 3 to 16/i.test(message)) return 'Names use 3–16 letters, numbers, _ or -.';
  if (/taken|already in use|duplicate/i.test(message)) return 'That name is taken. Try another.';
  if (/failed to fetch/i.test(message)) return 'Could not reach the leaderboard server.';
  return message;
}
function bestValue(game) {
  if (game.read) return game.read();
  try { return Number(localStorage.getItem(game.key)) || 0; } catch { return 0; }
}
function formatScore(value, game) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0 ' + game.unit;
  if (game.unit === 'seconds') {
    const total = Math.max(0, Math.round(number));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  return Math.round(number * 10) / 10 + ' ' + game.unit;
}
async function setHandle(name, retry = false) {
  let attempt = cleanHandle(name);
  for (let tries = 0; tries < (retry ? 3 : 1); tries++) {
    try {
      const result = await sb('/rest/v1/rpc/set_handle', { method: 'POST', body: { p_handle: attempt } });
      return typeof result === 'string' && result ? result : attempt;
    } catch (err) {
      if (!retry || !/taken|already|unique|duplicate/i.test(err.message)) throw err;
      attempt = cleanHandle(attempt.slice(0, 10) + '-' + Math.floor(1000 + Math.random() * 9000));
    }
  }
  return attempt;
}
async function ensureProfile(preferred) {
  if (!session) return '';
  if (!(await freshSession())) return '';
  if (myHandle) return myHandle;
  try {
    const rows = await sb('/rest/v1/profiles?select=handle&id=eq.' + encodeURIComponent(session.user.id));
    if (rows?.[0]?.handle) myHandle = rows[0].handle;
  } catch {}
  if (!myHandle) myHandle = await setHandle(preferred || userName(), true);
  return myHandle;
}
async function loadRules() {
  if (rulesLoaded) return true;
  try {
    const rows = await sb('/rest/v1/score_rules?select=game,label,better,max_value', { token: SUPABASE_ANON_KEY });
    if (!Array.isArray(rows) || !rows.length) return false;
    for (const row of rows || []) {
      scoreRules.set(row.game, row);
      rankedGames.add(row.game);
    }
    // The scores table only accepts games that have a rule row, so anything
    // without one is played and saved locally but cannot post to the board.
    for (const game of LB_GAMES) if (!rankedGames.has(game.id)) unrankedGames.add(game.id);
    rulesLoaded = true;
    renderGamePicker();
    return true;
  } catch { return false; }
}
function captureHighScore() {
  if (!current || player.hidden) return;
  const spec = highScoreSpec.get(current);
  if (!spec) return;
  let snapshot;
  try {
    if (current === '8ball') {
      const test = frame.contentWindow.__test;
      const balls = test?.balls?.();
      if (!Array.isArray(balls)) return;
      snapshot = {
        slug: '8ball',
        potted: balls.filter(ball => ball.id !== 0 && !ball.alive).length,
        cpu: test.mode?.() === 'cpu'
      };
    } else {
      snapshot = frame.contentWindow.__boredSnapshot?.();
    }
  } catch { return; }
  if (!snapshot || snapshot.slug !== current) return;
  if (spec.when && !spec.when(snapshot)) return;
  let value = spec.transform ? spec.transform(snapshot) : Number(snapshot[spec.metric]);
  if (!Number.isFinite(value)) return;
  value = Math.round(value);
  if (value <= 0) return;
  const key = 'bored.high.' + spec.id;
  let previous = 0;
  try { previous = Number(localStorage.getItem(key)) || 0; } catch { return; }
  if (previous && (spec.lower ? value >= previous : value <= previous)) return;
  try { localStorage.setItem(key, String(value)); } catch {}
}
async function syncScores() {
  if (!supabaseOn() || !session) return;
  // Posting a game the backend has no row for trips scores_game_fkey. Wait for
  // the rule list instead of guessing, and try again next time.
  if (!rulesLoaded && !(await loadRules())) return;
  try {
    if (!(await ensureProfile())) { renderAccount(); return; }
    const rows = await sb('/rest/v1/scores?select=game,value&user_id=eq.' + encodeURIComponent(session.user.id));
    for (const row of rows || []) {
      const value = Number(row.value);
      if (Number.isFinite(value)) submitted[row.game] = value;
    }
    saveSubmitted();
  } catch (err) {
    lbNotice = authError(err);
    renderAccount();
    return;
  }
  let changed = false;
  for (const game of LB_GAMES) {
    if (unrankedGames.has(game.id)) continue;
    let score = bestValue(game);
    if (!score || !Number.isFinite(score)) continue;
    score = Math.round(score);
    const rule = scoreRules.get(game.id);
    const ceiling = Number.isFinite(game.max) ? game.max : rule?.max_value;
    if (Number.isFinite(ceiling) && score > ceiling) continue;
    const previous = submitted[game.id];
    if (previous != null && (game.lower ? score >= previous : score <= previous)) continue;
    try {
      await sb('/rest/v1/scores?on_conflict=user_id,game', {
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
      saveSubmitted();
      lbCache.delete(game.id);
      lbCache.delete('overall');
      changed = true;
    } catch (err) {
      if (err.status === 401) await refreshSession();
      else if (err.code === '23503' || /foreign key/i.test(err.message || '')) {
        // No rule row for this game yet: keep the local best and stop retrying.
        unrankedGames.add(game.id);
      } else lbNotice = authError(err);
    }
  }
  renderAccount();
  renderLeaderboard();
  if (changed) loadLeaderboard(true);
}

/**
 * Account-wide ranking: a top-five finish earns 5 down to 1 points in each
 * game, with ties sharing a rank. Compare scores only *within* each game:
 * raw score units across different games cannot meaningfully be summed.
 * Five places because the board is small — tenth place was mostly everybody.
 */
const RANK_WINDOW = 5;
function rankPoints(rank) {
  return RANK_WINDOW + 1 - rank;
}
function accountStandings(scores) {
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

async function loadLeaderboard(force = false) {
  if (!supabaseOn()) { renderLeaderboard(); return; }
  const key = lbView === 'players' ? 'overall' : lbGame;
  const game = lbView === 'games' ? LB_GAMES.find(entry => entry.id === lbGame) : null;
  const cached = lbCache.get(key);
  if (!force && cached && Date.now() - cached.at < 30000) { renderLeaderboard(); return; }
  if (!cached || force) {
    const empty = $('#lb-empty');
    if (!$('#lb-list').children.length) { empty.hidden = false; empty.textContent = 'Loading rankings…'; }
  }
  try {
    let rows;
    if (game) {
      const query = new URLSearchParams({
        select: 'game,handle,value,updated_at',
        game: 'eq.' + game.id,
        order: 'value.' + (game.lower ? 'asc' : 'desc'),
        limit: '10'
      });
      rows = await sb('/rest/v1/leaderboard?' + query, { token: SUPABASE_ANON_KEY });
    } else {
      // Read the shared leaderboard in pages. PostgREST projects commonly cap
      // individual responses at 1,000 records, so one request misses players.
      rows = [];
      const pageSize = 1000;
      for (let offset = 0; offset < 50000; offset += pageSize) {
        const query = new URLSearchParams({
          select: 'game,handle,value',
          order: 'game.asc,handle.asc',
          limit: String(pageSize),
          offset: String(offset)
        });
        const page = await sb('/rest/v1/leaderboard?' + query, { token: SUPABASE_ANON_KEY });
        if (!Array.isArray(page)) throw new Error('Invalid leaderboard response.');
        rows.push(...page);
        if (page.length < pageSize) break;
        if (offset + pageSize >= 50000) throw new Error('Too many scores to rank right now.');
      }
    }
    lbCache.set(key, { rows: Array.isArray(rows) ? rows : [], at: Date.now() });
  } catch (err) {
    lbCache.set(key, { rows: [], at: Date.now(), error: authError(err) });
  }
  if ((lbView === 'players' ? 'overall' : lbGame) === key) renderLeaderboard();
}
function rankedGamesList() {
  // Once the rules are known, keep every game visible so a local-only best is
  // still reachable, but mark the ones the shared board cannot hold.
  return LB_GAMES.slice().sort((a, b) => {
    const left = rankedGames.size ? rankedGames.has(a.id) : true;
    const right = rankedGames.size ? rankedGames.has(b.id) : true;
    return left === right ? 0 : left ? -1 : 1;
  });
}

function renderGamePicker() {
  const select = $('#lb-game');
  if (!select) return;
  const options = rankedGamesList();
  if (!options.some(game => game.id === lbGame)) lbGame = options[0]?.id || 'overall';
  select.replaceChildren();
  for (const game of options) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name + (rankedGames.size && !rankedGames.has(game.id) ? ' (local only)' : '');
    select.appendChild(option);
  }
  select.value = lbGame;
}

function renderLeaderboard() {
  const select = $('#lb-game');
  const list = $('#lb-list');
  const empty = $('#lb-empty');
  const picker = $('#lb-pick');
  const players = lbView === 'players';
  if (picker) picker.hidden = players;
  for (const tab of document.querySelectorAll('.lb-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === (players ? 'players' : 'games')));
  }
  const game = LB_GAMES.find(entry => entry.id === lbGame) || rankedGamesList()[0];
  if (select && game && select.value !== game.id) select.value = game.id;
  list.replaceChildren();
  $('#lb-refresh').disabled = !supabaseOn();

  if (!supabaseOn()) {
    $('#lb-note').textContent = 'The shared leaderboard is offline until Supabase is configured.';
    empty.hidden = false;
    empty.textContent = 'Playing as a guest? Your local bests still work.';
    $('#lb-mine').textContent = '';
    return;
  }

  const cached = lbCache.get(players ? 'overall' : lbGame);
  const all = cached?.rows || [];
  const rows = players ? accountStandings(all) : all;

  if (players) {
    const played = new Set(all.map(row => row.game).filter(id => LB_GAMES.some(entry => entry.id === id))).size;
    $('#lb-note').textContent = 'Players ranked across ' + LB_GAMES.length + ' games · ' + rows.length +
      (rows.length === 1 ? ' account' : ' accounts') + ' · ' + played + ' with scores · ' + rankPoints(1) +
      ' points for a first place, down to 1 for fifth. Pick a name to see its games.';
  } else if (game) {
    const unit = game.unit === 'seconds' ? 'time' : game.unit;
    $('#lb-note').textContent = game.name + ' · ' + (game.lower ? 'lowest' : 'highest') + ' ' + unit + ' first. ' +
      (game.note ? game.note + '. ' : '') +
      (rankedGames.has(game.id) ? '' : 'Not ranked online yet — scores for this game stay in your browser.');
  }
  if (cached?.error) {
    empty.hidden = false;
    empty.textContent = 'Could not load rankings: ' + cached.error;
  } else if (!rows.length) {
    empty.hidden = false;
    empty.textContent = cached ? 'No scores yet. Be the first.' : 'Loading rankings…';
  } else {
    empty.hidden = true;
  }

  rows.slice(0, 10).forEach((row, index) => {
    const item = document.createElement('li');
    const mine = Boolean(myHandle) && String(row.handle || '').toLowerCase() === myHandle.toLowerCase();
    if (mine) item.className = 'you';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lb-row';
    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = (row.handle || 'player') + (mine ? ' (you)' : '');
    const score = document.createElement('span');
    score.className = 'lb-score';

    if (players) {
      const details = document.createElement('small');
      details.className = 'lb-player-meta';
      details.textContent = row.gamesRanked + ' of ' + row.gamesPlayed + ' games scoring';
      name.appendChild(details);
      score.textContent = row.points + ' pts';
      // clicking a player opens their per-game bests
      const key = String(row.handle || '').toLowerCase();
      const open = lbOpenPlayer === key;
      button.setAttribute('aria-expanded', String(open));
      button.onclick = () => { lbOpenPlayer = open ? '' : key; renderLeaderboard(); };
      const detail = document.createElement('ul');
      detail.className = 'lb-breakdown';
      detail.hidden = !open;
      if (open) {
        const own = all.filter(entry => String(entry.handle || '').toLowerCase() === key);
        own.sort((a, b) => LB_GAMES.findIndex(g => g.id === a.game) - LB_GAMES.findIndex(g => g.id === b.game));
        for (const entry of own) {
          const spec = LB_GAMES.find(g => g.id === entry.game);
          if (!spec) continue;
          const line = document.createElement('li');
          const label = document.createElement('span');
          label.textContent = spec.name;
          const value = document.createElement('span');
          value.textContent = formatScore(entry.value, spec);
          line.append(label, value);
          detail.appendChild(line);
        }
        if (!detail.children.length) {
          const line = document.createElement('li');
          line.textContent = 'No saved scores yet.';
          detail.appendChild(line);
        }
      }
      item.append(button, detail);
    } else {
      score.textContent = formatScore(row.value, game);
      item.appendChild(button);
    }

    button.append(rank, name, score);
    list.appendChild(item);
  });

  if (players) {
    const myRank = myHandle ? rows.findIndex(row => row.handle.toLowerCase() === myHandle.toLowerCase()) : -1;
    const me = myRank < 0 ? null : rows[myRank];
    $('#lb-mine').textContent = me
      ? 'Your account: #' + (myRank + 1) + ' · ' + me.points + ' points · ' + me.gamesRanked + ' games scoring.'
      : (session ? 'Play a game to put your account on the board.' : 'Sign in to put your account on the board.');
  } else if (game) {
    const local = bestValue(game);
    const ranked = rankedGames.has(game.id) || !rankedGames.size;
    const myRow = session && myHandle ? rows.find(row => String(row.handle).toLowerCase() === myHandle.toLowerCase()) : null;
    const parts = [];
    if (rows.length) parts.push(rows.length + (rows.length === 1 ? ' player' : ' players') + ' ranked');
    if (local) parts.push('your best: ' + formatScore(local, game));
    if (myRow) parts.push('on the board: #' + (rows.indexOf(myRow) + 1));
    $('#lb-mine').textContent = parts.length
      ? parts.join(' · ') + (ranked ? '' : ' · not ranked online yet')
      : (session ? 'Play ' + game.name + ' to put a score on the board.' : 'Sign in to add your best scores.');
  }
}

function renderAccount() {
  const state = $('#account-state');
  const action = $('#account-action');
  const rename = $('#account-rename');
  state.replaceChildren();
  if (!supabaseOn()) {
    state.textContent = 'Shared leaderboard is offline until Supabase is connected.';
    action.hidden = true;
    rename.hidden = true;
    return;
  }
  action.hidden = false;
  if (session) {
    const who = document.createElement('b');
    who.textContent = myHandle || userName();
    state.append('Signed in as ', who, lbNotice ? ' · ' + lbNotice : '. Best scores sync to the shared board.');
    action.textContent = 'Sign out';
    rename.hidden = false;
  } else {
    state.textContent = 'Playing as a guest. Scores stay in this browser.';
    action.textContent = 'Sign in';
    rename.hidden = true;
  }
}
function openAuth(mode = 'signin') {
  if (!supabaseOn()) return;
  authMode = mode === 'name' && !session ? 'signin' : mode;
  const dialog = $('#auth-dialog');
  const naming = authMode === 'name';
  $('#auth-title').textContent = authMode === 'signup' ? 'Create an account' : naming ? 'Display name' : 'Sign in';
  $('#auth-blurb').textContent = authMode === 'signup'
    ? 'Pick a name for the leaderboard. The email is only used to sign in.'
    : naming ? 'This is the name other players see. 3–16 letters, numbers, _ or -.' : 'Save your best scores and see how everyone else is doing.';
  $('#auth-email-row').hidden = naming;
  $('#auth-pass-row').hidden = naming;
  $('#auth-name-row').hidden = authMode === 'signin';
  $('#auth-submit').textContent = authMode === 'signup' ? 'Create account' : naming ? 'Save name' : 'Sign in';
  const toggle = $('#auth-toggle');
  toggle.hidden = naming;
  toggle.textContent = authMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('#auth-message').textContent = '';
  $('#auth-name').value = naming ? (myHandle || userName()) : '';
  $('#auth-password').value = '';
  if (!dialog.open) {
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  setTimeout(() => (naming ? $('#auth-name') : $('#auth-email')).focus(), 40);
}
function closeAuth() {
  const dialog = $('#auth-dialog');
  if (dialog.close) dialog.close();
  else dialog.removeAttribute('open');
}
async function handleAuth(event) {
  event.preventDefault();
  if (!supabaseOn() || authBusy) return;
  const message = $('#auth-message');
  const name = $('#auth-name').value.trim().slice(0, 20);
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  if (authMode === 'name') {
    if (!name) { message.textContent = 'Choose a name first.'; return; }
    authBusy = true;
    $('#auth-submit').disabled = true;
    message.textContent = 'Saving…';
    try {
      await renameUser(name);
      closeAuth();
      renderAccount();
      renderLeaderboard();
      loadLeaderboard(true);
    } catch (err) {
      message.textContent = authError(err);
    } finally {
      authBusy = false;
      $('#auth-submit').disabled = false;
    }
    return;
  }
  if (!email || !password) { message.textContent = 'Email and password are required.'; return; }
  if (password.length < 6) { message.textContent = 'Use at least 6 characters for the password.'; return; }
  if (authMode === 'signup' && !name) { message.textContent = 'Choose a display name.'; return; }
  authBusy = true;
  $('#auth-submit').disabled = true;
  message.textContent = authMode === 'signup' ? 'Creating your account…' : 'Signing in…';
  try {
    if (authMode === 'signup') {
      const redirectTo = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
      const data = await sb('/auth/v1/signup' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), {
        method: 'POST',
        body: { email, password, data: { display_name: name } },
        token: SUPABASE_ANON_KEY
      });
      const payload = data.session || data;
      if (payload.access_token) storeSession(payload);
      if (!session) {
        openAuth('signin');
        message.textContent = 'Check your email to confirm the account. The link brings you back here.';
        return;
      }
    } else {
      const data = await sb('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email, password },
        token: SUPABASE_ANON_KEY
      });
      storeSession(data);
    }
    lbNotice = '';
    closeAuth();
    renderAccount();
    renderLeaderboard();
    await syncScores();
    renderAccount();
    loadLeaderboard(true);
  } catch (err) {
    message.textContent = authError(err);
  } finally {
    authBusy = false;
    $('#auth-submit').disabled = false;
  }
}
async function renameUser(name) {
  if (!(await freshSession())) throw new Error('Sign in again first.');
  myHandle = await setHandle(name, false);
  lbCache.clear();
}
async function signOutUser() {
  if (session) { try { await sb('/auth/v1/logout', { method: 'POST' }); } catch {} }
  forgetSession();
  renderAccount();
  renderLeaderboard();
  loadLeaderboard(true);
}
async function consumeAuthRedirect() {
  if (!location.hash || location.hash.length < 2) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  const error = params.get('error_description') || params.get('error');
  if (!access && !error) return false;
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  if (error) {
    let reason = error;
    try { reason = decodeURIComponent(error.replace(/\+/g, ' ')); } catch {}
    lbNotice = reason;
    renderAccount();
    return true;
  }
  try {
    const user = await sb('/auth/v1/user', { token: access });
    storeSession({ access_token: access, refresh_token: refresh, expires_in: Number(params.get('expires_in')) || 3600, user });
    lbNotice = '';
    renderAccount();
    renderLeaderboard();
    await syncScores();
    renderAccount();
    loadLeaderboard(true);
  } catch (err) {
    lbNotice = authError(err);
    renderAccount();
  }
  return true;
}
function initAccount() {
  loadSubmitted();
  renderGamePicker();
  $('#lb-game').onchange = event => { lbGame = event.target.value; lbOpenPlayer = ''; renderLeaderboard(); loadLeaderboard(); };
  for (const tab of document.querySelectorAll('.lb-tab')) {
    tab.onclick = () => {
      lbView = tab.dataset.view === 'games' ? 'games' : 'players';
      lbOpenPlayer = '';
      renderLeaderboard();
      loadLeaderboard();
    };
  }
  $('#lb-refresh').onclick = () => loadLeaderboard(true);
  $('#account-action').onclick = () => { if (session) signOutUser(); else openAuth('signin'); };
  $('#account-rename').onclick = () => openAuth('name');
  $('#auth-cancel').onclick = closeAuth;
  $('#auth-toggle').onclick = () => openAuth(authMode === 'signup' ? 'signin' : 'signup');
  $('#auth-form').addEventListener('submit', handleAuth);
  $('#auth-dialog').addEventListener('click', event => { if (event.target === $('#auth-dialog')) closeAuth(); });
  renderAccount();
  renderLeaderboard();
  loadRules();
  loadLeaderboard();
  consumeAuthRedirect().then(handled => {
    if (handled || !session) return;
    freshSession().then(fresh => {
      if (!fresh) { renderAccount(); renderLeaderboard(); return; }
      ensureProfile().then(() => { renderAccount(); syncScores(); }).catch(err => {
        lbNotice = authError(err);
        renderAccount();
      });
    });
  });
}


const decode = b => {
  const bin = atob(b), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
};

function injectHead(html, extra) {
  return html.replace(/<head([^>]*)>/i, (m, attrs) => '<head' + attrs + '>' + extra);
}


function setMenu(open, { focusFirst = false, returnFocus = false } = {}) {
  if (open === !playerActions.hidden) return;
  playerActions.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  if (open && focusFirst) playerActions.querySelector('button')?.focus();
  else if (!open && returnFocus) menuToggle.focus();
}
function closeMenu(options) { setMenu(false, options); }
function restartGame() {
  if (!current) return;
  captureHighScore();
  closeMenu();
  openGame(current, currentDaily);
}
// Fullscreen is not uniform: Safari still ships a webkit-prefixed API, phones
// cannot fullscreen a page at all, and a page embedded in another page only gets
// the feature when its host allows it. Report the real reason and offer the
// standalone tab when embedding is what blocks it.
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const fsExit = () => document.exitFullscreen || document.webkitExitFullscreen;
const isEmbedded = () => { try { return window.self !== window.top; } catch { return true; } };
let leftFullscreenAt = 0;
async function leaveFullscreen() {
  const exit = fsExit();
  if (!exit) return;
  try { await exit.call(document); } catch {}
  frame.focus();
}
function openStandalone() {
  try {
    const tab = window.open(location.href, '_blank');
    if (tab) { try { tab.opener = null; } catch {} return true; }
  } catch {}
  return false;
}
function fullscreenUnavailable() {
  if (!isEmbedded()) {
    showHint(/iPad|iPhone|iPod/.test(navigator.userAgent)
      ? 'This browser cannot fullscreen a page. Add the arcade to your Home Screen instead.'
      : 'This browser cannot fullscreen a page.');
    return;
  }
  showHint(openStandalone()
    ? 'Fullscreen is blocked inside this embedded view. The arcade is open in its own tab.'
    : 'Fullscreen is blocked inside this embedded view. Open the arcade in its own tab.');
}
async function toggleFullscreen() {
  closeMenu();
  if (fsElement()) { await leaveFullscreen(); return; }
  const request = player.requestFullscreen || player.webkitRequestFullscreen;
  if (!request) { fullscreenUnavailable(); return; }
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
  if (enabled === false) { fullscreenUnavailable(); return; }
  try {
    if (player.webkitRequestFullscreen && !player.requestFullscreen) await player.webkitRequestFullscreen();
    else await player.requestFullscreen({ navigationUI: 'hide' });
    frame.focus();
  } catch {
    if (isEmbedded()) fullscreenUnavailable();
    else showHint('The browser blocked fullscreen for this page.');
  }
}

function openGame(slug, daily = null) {
  if (!ORDER.some(([id]) => id === slug)) return;
  closeMenu();
  currentDaily = daily;
  const ext = EXTERNS[slug];
  current = lastSlug = slug;
  recent = [slug, ...recent.filter(id => id !== slug)].slice(0, 4);
  saveLibrary(); renderRecent();
  frame.title = ORDER.find(([id]) => id === slug)[1];
  $('#challenge-progress').hidden = !daily;
  $('#hint').hidden = !!daily;
  if (daily) $('#challenge-progress').textContent = daily.goal;
  hub.inert = true;
  if (ext) {
    frame.removeAttribute('srcdoc');
    frame.src = ext;
    showHint('Internet required · use All games to return');
  } else {
    const g = GAMES[slug];
    let html = NEW_GAMES.includes(slug) ? nativeHTML(slug) : decode(g.b64);
    if (!NEW_GAMES.includes(slug)) html = installDailyAdapter(html, slug);
    let head = '<scr' + 'ipt>addEventListener("keydown",function(e){var t=e.target||{};if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:close"},"*");return}if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!t.isContentEditable&&!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||"")){if(e.key==="R"||e.key==="r"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:restart"},"*")}else if(e.key==="F"||e.key==="f"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:fullscreen"},"*")}}},true);document.addEventListener("pointerdown",function(){parent.postMessage({type:"bored:menuclose"},"*")},true);<\/scr' + 'ipt>';
    if (g?.fonts) head += '<style>' + FONT_CSS + '</style>';
    if (slug === 'lighthouse') head += '<style>#fatal[hidden]{display:none!important}</style>' + threeBootstrap();
    if (head) html = injectHead(html, head);
    frame.removeAttribute('src');
    frame.srcdoc = html;
    showHint('Click or tap to play · Esc leaves · Shift+R restarts · Shift+F fullscreen');
  }
  player.hidden = false;
  document.body.classList.add('playing');
  clearTimeout(focusTimer);
  // Do not steal focus back while the player menu is open, or Esc and the
  // arrow keys would go to the game instead of the menu.
  focusTimer = setTimeout(() => { if (current === slug && playerActions.hidden) frame.focus(); }, 60);
}

function showHint(msg) {
  const h = $('#hint');
  h.textContent = msg;
  h.classList.remove('gone');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => h.classList.add('gone'), 2600);
}

function closeGame() {
  pollDaily();
  captureHighScore();
  closeMenu();
  clearTimeout(hintTimer); clearTimeout(focusTimer);
  if (fsElement()) leaveFullscreen();
  player.hidden = true;
  hub.inert = false;
  document.body.classList.remove('playing');
  frame.removeAttribute('src');
  frame.srcdoc = '';
  current = null;
  const wasDaily = currentDaily; currentDaily = null;
  $('#challenge-progress').hidden = true;
  syncScores();
  renderDaily();
  (wasDaily ? $('#daily-play') : ($(`[data-slug="${lastSlug}"]`) || q)).focus();
}

let current = null, lastSlug = null, hintTimer = 0, focusTimer = 0, currentDaily = null;
const dailyResults = new Map();
function readDaily(challenge) {
  let result = dailyResults.get(challenge.id);
  try { result = JSON.parse(localStorage.getItem('bored.daily.' + challenge.id)) || result; } catch {}
  return result?.id === challenge.id && dailyCheck(challenge, result.snapshot).complete ? result : null;
}
function renderDaily() {
  const challenge = dailyChallenge(challengeDate()), result = readDaily(challenge);
  $('#daily-date').textContent = challenge.date + ' · RESETS AT MIDNIGHT UTC';
  $('#daily-heading').textContent = ORDER.find(([slug]) => slug === challenge.slug)[1] + ' · ' + challenge.label;
  $('#daily-goal').textContent = challenge.goal;
  $('#daily-status').textContent = result ? '✓ Automatically verified. Your completed result is saved.' : 'One daily goal for everyone. Completion is checked by the game—not a checkbox. Retry as often as you like.';
  $('#daily-play').textContent = result ? 'Play again →' : 'Play today’s challenge →';
  $('#daily-share').hidden = !result;
  if ($('#daily-result').dataset.challenge !== challenge.id) $('#daily-result').hidden = true;
}
function pollDaily() {
  if (!currentDaily || player.hidden) return;
  try {
    const snapshot = frame.contentWindow.__boredSnapshot?.();
    if (!snapshot) return;
    const check = dailyCheck(currentDaily, snapshot);
    let result = readDaily(currentDaily);
    if (check.complete && !result) {
      result = { id: currentDaily.id, snapshot: { ...snapshot } };
      dailyResults.set(currentDaily.id, result);
      try { localStorage.setItem('bored.daily.' + currentDaily.id, JSON.stringify(result)); } catch {}
      renderDaily();
    }
    const message = result ? '✓ Challenge complete! ' + currentDaily.goal : currentDaily.goal + ' · ' + check.progress;
    if ($('#challenge-progress').textContent !== message) $('#challenge-progress').textContent = message;
  } catch { /* Wait for the next game frame to finish loading. */ }
}
setInterval(() => { pollDaily(); captureHighScore(); }, 250);
$('#daily-play').onclick = () => {
  const challenge = dailyChallenge(challengeDate());
  openGame(challenge.slug, challenge);
};
$('#daily-share').onclick = async () => {
  const challenge = dailyChallenge(challengeDate()), result = readDaily(challenge);
  if (!result) return;
  const el = $('#daily-result');
  el.value = 'Bored Daily · ' + challenge.date + '\n' + ORDER.find(([slug]) => slug === challenge.slug)[1] + ' — ' + challenge.label +
    '\n✓ ' + challenge.goal + '\n' + dailyCheck(challenge, result.snapshot).progress + '\nhttps://bassdrum4.github.io/bored/';
  el.dataset.challenge = challenge.id; el.hidden = false;
  try { await navigator.clipboard.writeText(el.value); $('#daily-status').textContent = 'Result copied! Challenge a friend.'; }
  catch { el.focus(); el.select(); $('#daily-status').textContent = 'Select and copy your result below.'; }
};
addEventListener('focus', renderDaily);
setInterval(renderDaily, 60000);
const hub = $('#hub');
let category = 'All', visible = [], favorites = new Set(), recent = [];
try {
  const saved = JSON.parse(localStorage.getItem('bored.library') || '{}');
  const valid = list => Array.isArray(list) ? [...new Set(list.filter(id => ORDER.some(([slug]) => slug === id)))] : [];
  favorites = new Set(valid(saved?.favorites)); recent = valid(saved?.recent).slice(0, 4);
} catch {} // Private browsing/file:// may disallow storage. The library still works.
function saveLibrary() {
  try { localStorage.setItem('bored.library', JSON.stringify({ favorites: [...favorites], recent })); } catch {}
}
function renderRecent() {
  const list = $('#recent-list'); list.replaceChildren();
  for (const slug of recent) {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'action';
    el.textContent = ORDER.find(([id]) => id === slug)[1]; el.onclick = () => openGame(slug); list.appendChild(el);
  }
  $('#recent').hidden = !recent.length;
}
function render() {
  const f = q.value.trim().toLowerCase();
  grid.replaceChildren();
  visible = ORDER.filter(([slug, name]) => {
    const meta = META[slug];
    return (EXTERNS[slug] || GAMES[slug] || NEW_GAMES.includes(slug)) &&
      (!f || [name, slug, ...meta].join(' ').toLowerCase().includes(f)) &&
      (category === 'All' || (category === 'New' ? NEW_GAMES.includes(slug) :
        category === 'Favorites' ? favorites.has(slug) : meta[0] === category));
  });
  if ($('#sort').value === 'az') visible.sort((a, b) => a[1].localeCompare(b[1]));
  for (const [slug, name] of visible) {
    const row = document.createElement('div'); row.className = 'row';
    const card = document.createElement('button'); card.type = 'button'; card.className = 'card'; card.dataset.slug = slug;
    card.innerHTML = '<span class="idx" aria-hidden="true"></span><span class="text"><span class="name"></span><span class="detail"></span></span><span class="go" aria-hidden="true">&#8594;</span>';
    card.querySelector('.name').textContent = name;
    if (NEW_GAMES.includes(slug) || slug === 'deep') {
      const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = 'NEW'; card.querySelector('.name').appendChild(badge);
    }
    card.querySelector('.detail').textContent = META[slug].join(' · ');
    card.querySelector('.idx').textContent = String(ORDER.findIndex(([id]) => id === slug) + 1).padStart(2, '0');
    card.onclick = () => openGame(slug);
    const star = document.createElement('button'); star.type = 'button'; star.className = 'star';
    const updateStar = () => {
      star.textContent = favorites.has(slug) ? '★' : '☆';
      star.setAttribute('aria-pressed', String(favorites.has(slug)));
      star.setAttribute('aria-label', (favorites.has(slug) ? 'Remove ' : 'Add ') + name + (favorites.has(slug) ? ' from' : ' to') + ' favorites');
    };
    updateStar();
    star.onclick = () => {
      if (favorites.has(slug)) favorites.delete(slug); else favorites.add(slug);
      saveLibrary(); updateStar();
      if (category === 'Favorites') {
        const index = visible.findIndex(([id]) => id === slug); render();
        const next = grid.children[Math.min(index, grid.children.length - 1)];
        (next?.querySelector('.star') || $('#filters [data-filter="Favorites"]')).focus();
      }
    };
    row.append(card, star); grid.appendChild(row);
  }
  $('#empty').hidden = visible.length > 0;
  $('#empty').textContent = category === 'Favorites' && !favorites.size ? 'Your favorites live here. Tap a star beside any game to save it.' : 'Nothing here. Try a different search or category.';
  $('#results').textContent = visible.length + ' of ' + ORDER.length + ' entries';
  $('#count').textContent = ORDER.length;
  $('#random').disabled = !visible.length;
}
q.addEventListener('input', render);
$('#sort').addEventListener('change', render);
$('#filters').addEventListener('click', e => {
  const button = e.target.closest('[data-filter]'); if (!button) return;
  category = button.dataset.filter;
  for (const el of $('#filters').children) el.setAttribute('aria-pressed', String(el === button));
  render();
});
$('#random').onclick = () => {
  // Offline by default; a deliberate Online filter opts into remote entries.
  const pool = visible.filter(([slug]) => category === 'Online' || !EXTERNS[slug]);
  if (pool.length) openGame(pool[Math.floor(Math.random() * pool.length)][0]);
  else showLibraryMessage();
};
function showLibraryMessage() { $('#results').textContent = 'These entries need internet. Choose Online to include them in Surprise me.'; }
$('#back').onclick = closeGame;
$('#resume').onclick = () => { closeMenu(); frame.focus(); };
$('#restart').onclick = restartGame;
menuToggle.onclick = e => {
  const open = playerActions.hidden;
  setMenu(open, { focusFirst: open && e.detail === 0 });
};
playerActions.addEventListener('keydown', e => {
  const items = [...playerActions.querySelectorAll('button')];
  const index = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    items[e.key === 'Home' ? 0 : items.length - 1].focus();
  }
});
document.addEventListener('pointerdown', e => {
  if (!playerActions.hidden && !e.target.closest('#player-menu')) closeMenu();
});
function onFullscreenChange() {
  if (!fsElement()) leftFullscreenAt = Date.now();
}
addEventListener('fullscreenchange', onFullscreenChange);
addEventListener('webkitfullscreenchange', onFullscreenChange);
addEventListener('message', e => {
  if (!current || EXTERNS[current] || e.source !== frame.contentWindow) return;
  switch (e.data?.type) {
    case 'bored:close':
      if (fsElement()) leaveFullscreen(); else closeGame();
      break;
    case 'bored:restart': restartGame(); break;
    case 'bored:fullscreen': toggleFullscreen(); break;
    case 'bored:menuclose': closeMenu(); break;
  }
});

addEventListener('keydown', e => {
  const typing = e.target instanceof Element && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
  if (e.key === 'Escape') {
    if (!playerActions.hidden) { e.preventDefault(); closeMenu({ returnFocus: true }); }
    else if (fsElement()) { e.preventDefault(); leaveFullscreen(); }
    else if (current && Date.now() - leftFullscreenAt > 500) closeGame();
  } else if (current && !typing && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'R' || e.key === 'r') { e.preventDefault(); restartGame(); }
    else if (e.key === 'F' || e.key === 'f') { e.preventDefault(); toggleFullscreen(); }
  } else if (e.key === '/' && !current && !typing) { e.preventDefault(); q.focus(); }
});
renderDaily(); renderRecent(); render(); initAccount();

// The original single-file hub exposed these globals; keep them for the test
// suite and for anyone poking at the console.
Object.assign(window, {
  openGame, closeGame, renderDaily, readDaily, dailyChallenge, dailyCheck,
  CHALLENGES, ORDER, EXTERNS, NEW_GAMES, LB_GAMES, HIGH_SCORE_GAMES, captureHighScore, accountStandings,
});
Object.defineProperty(window, 'currentDaily', { get: () => currentDaily });
Object.defineProperty(window, 'current', { get: () => current });


import { ORDER, GAMES, EXTERNS, NEW_GAMES, META, FONT_CSS } from './games/catalog.js';
import { threeBootstrap } from './games/three.js';
import { nativeHTML } from './games/arcade.js';
import { dailyDate as defaultDailyDate, dailyChallenge, dailyCheck, installDailyAdapter, CHALLENGES } from './daily.js';
import { readStored, writeStored } from './hub/store.js';
import {
  backendReady, request, getSession, getHandle, setHandle, loadRules, scoreRules, ANON_TOKEN,
  freshSession, ensureProfile, renameHandle, authErrorMessage, suggestedHandle,
  signIn, signUp, signOut, adoptToken
} from './hub/backend.js';
import {
  LB_GAMES, HIGH_SCORE_GAMES, accountStandings, rankPoints, boardGames, boardTitle,
  mergedInto, postingGameId, isLocalOnly, bestValue, formatScore, recordBest,
  syncScores, onScoresPosted
} from './hub/scores.js';

// Keep the original console/test surface available from the bundled file. The
// date wrapper also lets the offline Puppeteer suite pin a challenge date.
function challengeDate(...args) {
  return (window.dailyDate || defaultDailyDate)(...args);
}
if (typeof window !== 'undefined') window.dailyDate = defaultDailyDate;

/* ── DOM handles ──────────────────────────────────────────────────────────── */

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const hubRoot = $('#hub');
const gameGrid = $('#grid');
const searchInput = $('#q');
const playerPanel = $('#player');
const gameFrame = $('#frame');
const menuButton = $('#menu-toggle');
const menuPanel = $('#player-actions');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ── State ────────────────────────────────────────────────────────────────── */

let activeSlug = null;
let previousSlug = null;
let activeChallenge = null;
let hintTimer = 0;
let focusTimer = 0;
const dailyResults = new Map();

let category = 'All';
let visibleGames = [];
let favorites = new Set();
let recentGames = [];

let lbGameId = 'overall';
let lbView = 'players';
let lbOpenPlayer = '';
let lbNotice = '';
const lbCache = new Map();

let authMode = 'signin';
let authBusy = false;

/* ── Library: grid, filters, favorites, recent ────────────────────────────── */

function loadLibrary() {
  const saved = readStored('bored.library', {}) || {};
  const valid = list => Array.isArray(list)
    ? [...new Set(list.filter(id => ORDER.some(([slug]) => slug === id)))]
    : [];
  favorites = new Set(valid(saved.favorites));
  recentGames = valid(saved.recent).slice(0, 4);
}

function saveLibrary() {
  writeStored('bored.library', { favorites: [...favorites], recent: recentGames });
}

function renderRecent() {
  const list = $('#recent-list');
  list.replaceChildren();
  for (const slug of recentGames) {
    const button = element('button', 'action', ORDER.find(([id]) => id === slug)[1]);
    button.type = 'button';
    button.onclick = () => openGame(slug);
    list.appendChild(button);
  }
  $('#recent').hidden = !recentGames.length;
}

function renderLibrary() {
  const filter = searchInput.value.trim().toLowerCase();
  gameGrid.replaceChildren();
  visibleGames = ORDER.filter(([slug, name]) => {
    const meta = META[slug];
    return (EXTERNS[slug] || GAMES[slug] || NEW_GAMES.includes(slug)) &&
      (!filter || [name, slug, ...meta].join(' ').toLowerCase().includes(filter)) &&
      (category === 'All' || (category === 'New' ? NEW_GAMES.includes(slug) :
        category === 'Favorites' ? favorites.has(slug) : meta[0] === category));
  });
  if ($('#sort').value === 'az') visibleGames.sort((a, b) => a[1].localeCompare(b[1]));

  for (const [slug, name] of visibleGames) {
    const row = element('div', 'row');
    const card = element('button', 'card');
    card.type = 'button';
    card.dataset.slug = slug;
    card.innerHTML = '<span class="idx" aria-hidden="true"></span><span class="text"><span class="name"></span><span class="detail"></span></span><span class="go" aria-hidden="true">&#8594;</span>';
    card.querySelector('.name').textContent = name;
    if (NEW_GAMES.includes(slug) || slug === 'deep') {
      card.querySelector('.name').appendChild(element('span', 'badge', 'NEW'));
    }
    card.querySelector('.detail').textContent = META[slug].join(' · ');
    card.querySelector('.idx').textContent = String(ORDER.findIndex(([id]) => id === slug) + 1).padStart(2, '0');
    card.onclick = () => openGame(slug);

    const star = element('button', 'star');
    star.type = 'button';
    const updateStar = () => {
      const saved = favorites.has(slug);
      star.textContent = saved ? '★' : '☆';
      star.setAttribute('aria-pressed', String(saved));
      star.setAttribute('aria-label', (saved ? 'Remove ' : 'Add ') + name + (saved ? ' from' : ' to') + ' favorites');
    };
    updateStar();
    star.onclick = () => {
      if (favorites.has(slug)) favorites.delete(slug);
      else favorites.add(slug);
      saveLibrary();
      updateStar();
      if (category === 'Favorites') {
        const index = visibleGames.findIndex(([id]) => id === slug);
        renderLibrary();
        const next = gameGrid.children[Math.min(index, gameGrid.children.length - 1)];
        (next?.querySelector('.star') || $('#filters [data-filter="Favorites"]')).focus();
      }
    };
    row.append(card, star);
    gameGrid.appendChild(row);
  }

  $('#empty').hidden = visibleGames.length > 0;
  $('#empty').textContent = category === 'Favorites' && !favorites.size
    ? 'Your favorites live here. Tap a star beside any game to save it.'
    : 'Nothing here. Try a different search or category.';
  $('#results').textContent = visibleGames.length + ' of ' + ORDER.length + ' entries';
  $('#count').textContent = ORDER.length;
  $('#random').disabled = !visibleGames.length;
}

function showLibraryMessage() {
  $('#results').textContent = 'These entries need internet. Choose Online to include them in Surprise me.';
}

/* ── Player: opening, closing, restarting, fullscreen ─────────────────────── */

function setMenu(open, { focusFirst = false, returnFocus = false } = {}) {
  if (open === !menuPanel.hidden) return;
  menuPanel.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  if (open && focusFirst) menuPanel.querySelector('button')?.focus();
  else if (!open && returnFocus) menuButton.focus();
}

function closeMenu(options) {
  setMenu(false, options);
}

function restartGame() {
  if (!activeSlug) return;
  captureBest();
  closeMenu();
  openGame(activeSlug, activeChallenge);
}

// Fullscreen is not uniform: Safari still ships a webkit-prefixed API, phones
// cannot fullscreen a page at all, and a page embedded in another page only gets
// the feature when its host allows it. Report the real reason and offer the
// standalone tab when embedding is what blocks it.
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const fullscreenExit = () => document.exitFullscreen || document.webkitExitFullscreen;
const isEmbedded = () => { try { return window.self !== window.top; } catch { return true; } };
let leftFullscreenAt = 0;

async function leaveFullscreen() {
  const exit = fullscreenExit();
  if (!exit) return;
  try { await exit.call(document); } catch {}
  gameFrame.focus();
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
  if (fullscreenElement()) { await leaveFullscreen(); return; }
  const requestFullscreen = playerPanel.requestFullscreen || playerPanel.webkitRequestFullscreen;
  if (!requestFullscreen) { fullscreenUnavailable(); return; }
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
  if (enabled === false) { fullscreenUnavailable(); return; }
  try {
    if (playerPanel.webkitRequestFullscreen && !playerPanel.requestFullscreen) await playerPanel.webkitRequestFullscreen();
    else await playerPanel.requestFullscreen({ navigationUI: 'hide' });
    gameFrame.focus();
  } catch {
    if (isEmbedded()) fullscreenUnavailable();
    else showHint('The browser blocked fullscreen for this page.');
  }
}

function openGame(slug, challenge = null) {
  if (!ORDER.some(([id]) => id === slug)) return;
  closeMenu();
  activeChallenge = challenge;
  const external = EXTERNS[slug];
  activeSlug = previousSlug = slug;
  recentGames = [slug, ...recentGames.filter(id => id !== slug)].slice(0, 4);
  saveLibrary();
  renderRecent();
  gameFrame.title = ORDER.find(([id]) => id === slug)[1];
  $('#challenge-progress').hidden = !challenge;
  $('#hint').hidden = !!challenge;
  if (challenge) $('#challenge-progress').textContent = challenge.goal;
  hubRoot.inert = true;

  if (external) {
    gameFrame.removeAttribute('srcdoc');
    gameFrame.src = external;
    showHint('Internet required · use All games to return');
  } else {
    const game = GAMES[slug];
    let html = NEW_GAMES.includes(slug) ? nativeHTML(slug) : decode(game.b64);
    if (!NEW_GAMES.includes(slug)) html = installDailyAdapter(html, slug);
    let head = '<scr' + 'ipt>addEventListener("keydown",function(e){var t=e.target||{};if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:close"},"*");return}if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!t.isContentEditable&&!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||"")){if(e.key==="R"||e.key==="r"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:restart"},"*")}else if(e.key==="F"||e.key==="f"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:fullscreen"},"*")}}},true);document.addEventListener("pointerdown",function(){parent.postMessage({type:"bored:menuclose"},"*")},true);<\/scr' + 'ipt>';
    if (game?.fonts) head += '<style>' + FONT_CSS + '</style>';
    if (slug === 'lighthouse') head += '<style>#fatal[hidden]{display:none!important}</style>' + threeBootstrap();
    if (head) html = injectHead(html, head);
    gameFrame.removeAttribute('src');
    gameFrame.srcdoc = html;
    showHint('Click or tap to play · Esc leaves · Shift+R restarts · Shift+F fullscreen');
  }

  playerPanel.hidden = false;
  document.body.classList.add('playing');
  clearTimeout(focusTimer);
  // Do not steal focus back while the player menu is open, or Esc and the
  // arrow keys would go to the game instead of the menu.
  focusTimer = setTimeout(() => { if (activeSlug === slug && menuPanel.hidden) gameFrame.focus(); }, 60);
}

function closeGame() {
  pollDaily();
  captureBest();
  closeMenu();
  clearTimeout(hintTimer);
  clearTimeout(focusTimer);
  if (fullscreenElement()) leaveFullscreen();
  playerPanel.hidden = true;
  hubRoot.inert = false;
  document.body.classList.remove('playing');
  gameFrame.removeAttribute('src');
  gameFrame.srcdoc = '';
  activeSlug = null;
  const wasDaily = activeChallenge;
  activeChallenge = null;
  $('#challenge-progress').hidden = true;
  syncSharedScores();
  renderDaily();
  (wasDaily ? $('#daily-play') : ($(`[data-slug="${previousSlug}"]`) || searchInput)).focus();
}

function showHint(message) {
  const hint = $('#hint');
  hint.textContent = message;
  hint.classList.remove('gone');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.add('gone'), 2600);
}

/* ── Best scores ──────────────────────────────────────────────────────────── */

function snapshotFor(slug) {
  try {
    if (slug === '8ball') {
      // 8 Ball keeps its table inside a closure, so it exposes an accessor.
      const table = gameFrame.contentWindow.__test;
      const balls = table?.balls?.();
      if (!Array.isArray(balls)) return null;
      return {
        slug: '8ball',
        potted: balls.filter(ball => ball.id !== 0 && !ball.alive).length,
        cpu: table.mode?.() === 'cpu'
      };
    }
    return gameFrame.contentWindow.__boredSnapshot?.() || null;
  } catch {
    return null;
  }
}

function captureBest() {
  if (!activeSlug || playerPanel.hidden) return false;
  const snapshot = snapshotFor(activeSlug);
  return snapshot ? recordBest(activeSlug, snapshot) : false;
}

async function syncSharedScores() {
  const result = await syncScores();
  if (result && result.error) {
    lbNotice = authErrorMessage(result.error);
    renderAccount();
  }
}

onScoresPosted(() => {
  lbCache.clear();
  renderAccount();
  renderLeaderboard();
  loadLeaderboard(true);
});

/* ── Daily challenge ──────────────────────────────────────────────────────── */

function readDaily(challenge) {
  let result = dailyResults.get(challenge.id) || null;
  const stored = readStored('bored.daily.' + challenge.id, null);
  if (stored) result = stored;
  return result?.id === challenge.id && dailyCheck(challenge, result.snapshot).complete ? result : null;
}

function renderDaily() {
  const challenge = dailyChallenge(challengeDate());
  const result = readDaily(challenge);
  $('#daily-date').textContent = challenge.date + ' · RESETS AT MIDNIGHT UTC';
  $('#daily-heading').textContent = ORDER.find(([slug]) => slug === challenge.slug)[1] + ' · ' + challenge.label;
  $('#daily-goal').textContent = challenge.goal;
  $('#daily-status').textContent = result
    ? '✓ Automatically verified. Your completed result is saved.'
    : 'One daily goal for everyone. Completion is checked by the game—not a checkbox. Retry as often as you like.';
  $('#daily-play').textContent = result ? 'Play again →' : 'Play today’s challenge →';
  $('#daily-share').hidden = !result;
  if ($('#daily-result').dataset.challenge !== challenge.id) $('#daily-result').hidden = true;
}

function pollDaily() {
  if (!activeChallenge || playerPanel.hidden) return;
  try {
    const snapshot = gameFrame.contentWindow.__boredSnapshot?.();
    if (!snapshot) return;
    const check = dailyCheck(activeChallenge, snapshot);
    let result = readDaily(activeChallenge);
    if (check.complete && !result) {
      result = { id: activeChallenge.id, snapshot: { ...snapshot } };
      dailyResults.set(activeChallenge.id, result);
      writeStored('bored.daily.' + activeChallenge.id, result);
      renderDaily();
    }
    const message = result
      ? '✓ Challenge complete! ' + activeChallenge.goal
      : activeChallenge.goal + ' · ' + check.progress;
    if ($('#challenge-progress').textContent !== message) $('#challenge-progress').textContent = message;
  } catch { /* Wait for the next game frame to finish loading. */ }
}

async function shareDailyResult() {
  const challenge = dailyChallenge(challengeDate());
  const result = readDaily(challenge);
  if (!result) return;
  const box = $('#daily-result');
  box.value = 'Bored Daily · ' + challenge.date + '\n' + ORDER.find(([slug]) => slug === challenge.slug)[1] +
    ' — ' + challenge.label + '\n✓ ' + challenge.goal + '\n' +
    dailyCheck(challenge, result.snapshot).progress + '\nhttps://bassdrum4.github.io/bored/';
  box.dataset.challenge = challenge.id;
  box.hidden = false;
  try {
    await navigator.clipboard.writeText(box.value);
    $('#daily-status').textContent = 'Result copied! Challenge a friend.';
  } catch {
    box.focus();
    box.select();
    $('#daily-status').textContent = 'Select and copy your result below.';
  }
}

/* ── Leaderboard ──────────────────────────────────────────────────────────── */

function renderGamePicker() {
  const select = $('#lb-game');
  if (!select) return;
  const options = boardGames();
  // A game that borrows another board should land on that board when picked.
  const host = postingGameId(lbGameId);
  if (host && host !== lbGameId) lbGameId = host;
  if (!options.some(game => game.id === lbGameId)) lbGameId = options[0]?.id || 'overall';
  select.replaceChildren();
  for (const game of options) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = boardTitle(game) + (isLocalOnly(game.id) ? ' (local only)' : '');
    select.appendChild(option);
  }
  select.value = lbGameId;
}

function gameNote(game) {
  const unit = game.unit === 'seconds' ? 'time' : game.unit;
  const parts = [boardTitle(game) + ' · ' + (game.lower ? 'lowest' : 'highest') + ' ' + unit + ' first.'];
  if (game.note) parts.push(game.note + '.');
  const shared = mergedInto(game.id).map(entry => entry.name);
  if (shared.length) {
    parts.push(shared.join(' and ') + (shared.length > 1 ? ' share' : ' shares') +
      ' this board — the backend has no rule for ' + (shared.length > 1 ? 'them' : 'it') + ' yet.');
  }
  if (isLocalOnly(game.id)) parts.push('Not ranked online yet — scores for this game stay in your browser.');
  return parts.join(' ');
}

function renderLeaderboard() {
  const select = $('#lb-game');
  const list = $('#lb-list');
  const empty = $('#lb-empty');
  const picker = $('#lb-pick');
  const players = lbView === 'players';
  if (picker) picker.hidden = players;
  for (const tab of $$('.lb-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === (players ? 'players' : 'games')));
  }
  const game = LB_GAMES.find(entry => entry.id === lbGameId) || boardGames()[0];
  if (select && game && select.value !== game.id) select.value = game.id;
  list.replaceChildren();
  $('#lb-refresh').disabled = !backendReady();

  if (!backendReady()) {
    $('#lb-note').textContent = 'The shared leaderboard is offline until Supabase is configured.';
    empty.hidden = false;
    empty.textContent = 'Playing as a guest? Your local bests still work.';
    $('#lb-mine').textContent = '';
    return;
  }

  const cached = lbCache.get(players ? 'overall' : lbGameId);
  const all = cached?.rows || [];
  const rows = players ? accountStandings(all) : all;

  if (players) {
    const played = new Set(all.map(row => row.game).filter(id => LB_GAMES.some(entry => entry.id === id))).size;
    $('#lb-note').textContent = 'Players ranked across ' + LB_GAMES.length + ' games · ' + rows.length +
      (rows.length === 1 ? ' account' : ' accounts') + ' · ' + played + ' with scores · ' + rankPoints(1) +
      ' points for a first place, down to 1 for fifth. Pick a name to see its games.';
  } else if (game) {
    $('#lb-note').textContent = gameNote(game);
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

  const handle = getHandle();
  const mineKey = handle ? handle.toLowerCase() : '';
  rows.slice(0, 10).forEach((row, index) => {
    const name = String(row.handle || 'player');
    const mine = Boolean(mineKey) && name.toLowerCase() === mineKey;
    const item = element('li', mine ? 'you' : '');
    const button = element('button', 'lb-row');
    button.type = 'button';
    const rank = element('span', 'lb-rank', String(index + 1).padStart(2, '0'));
    const label = element('span', 'lb-name', name + (mine ? ' (you)' : ''));
    const score = element('span', 'lb-score');

    if (players) {
      label.appendChild(element('small', 'lb-player-meta', row.gamesRanked + ' of ' + row.gamesPlayed + ' games scoring'));
      score.textContent = row.points + ' pts';
      const key = name.toLowerCase();
      const open = lbOpenPlayer === key;
      button.setAttribute('aria-expanded', String(open));
      button.onclick = () => { lbOpenPlayer = open ? '' : key; renderLeaderboard(); };
      const detail = element('ul', 'lb-breakdown');
      detail.hidden = !open;
      if (open) {
        const own = all
          .filter(entry => String(entry.handle || '').toLowerCase() === key)
          .sort((a, b) => LB_GAMES.findIndex(g => g.id === a.game) - LB_GAMES.findIndex(g => g.id === b.game));
        for (const entry of own) {
          const spec = LB_GAMES.find(g => g.id === entry.game);
          if (!spec) continue;
          const line = element('li');
          line.append(element('span', '', boardTitle(spec)), element('span', '', formatScore(entry.value, spec)));
          detail.appendChild(line);
        }
        if (!detail.children.length) detail.appendChild(element('li', '', 'No saved scores yet.'));
      }
      item.append(button, detail);
    } else {
      score.textContent = formatScore(row.value, game);
      item.appendChild(button);
    }

    button.append(rank, label, score);
    list.appendChild(item);
  });

  if (players) {
    const myRank = handle ? rows.findIndex(row => row.handle.toLowerCase() === mineKey) : -1;
    const me = myRank < 0 ? null : rows[myRank];
    $('#lb-mine').textContent = me
      ? 'Your account: #' + (myRank + 1) + ' · ' + me.points + ' points · ' + me.gamesRanked + ' games scoring.'
      : (getSession() ? 'Play a game to put your account on the board.' : 'Sign in to put your account on the board.');
  } else if (game) {
    // Scores that share this board still deserve their own local best line.
    const parts = [];
    if (rows.length) parts.push(rows.length + (rows.length === 1 ? ' player' : ' players') + ' ranked');
    const local = bestValue(game);
    if (local) parts.push('your best: ' + formatScore(local, game));
    for (const entry of mergedInto(game.id)) {
      const shared = bestValue(entry);
      if (shared) parts.push('your ' + entry.name + ' best: ' + formatScore(shared, entry));
    }
    const myRow = getSession() && handle ? rows.find(row => String(row.handle).toLowerCase() === mineKey) : null;
    if (myRow) parts.push('on the board: #' + (rows.indexOf(myRow) + 1));
    $('#lb-mine').textContent = parts.length
      ? parts.join(' · ') + (isLocalOnly(game.id) ? ' · not ranked online yet' : '')
      : (getSession() ? 'Play ' + game.name + ' to put a score on the board.' : 'Sign in to add your best scores.');
  }
}

async function loadLeaderboard(force = false) {
  if (!backendReady()) { renderLeaderboard(); return; }
  const key = lbView === 'players' ? 'overall' : lbGameId;
  const game = lbView === 'games' ? LB_GAMES.find(entry => entry.id === lbGameId) : null;
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
      rows = await request('/rest/v1/leaderboard?' + query, { token: ANON_TOKEN });
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
        const page = await request('/rest/v1/leaderboard?' + query, { token: ANON_TOKEN });
        if (!Array.isArray(page)) throw new Error('Invalid leaderboard response.');
        rows.push(...page);
        if (page.length < pageSize) break;
        if (offset + pageSize >= 50000) throw new Error('Too many scores to rank right now.');
      }
    }
    lbCache.set(key, { rows: Array.isArray(rows) ? rows : [], at: Date.now() });
  } catch (err) {
    lbCache.set(key, { rows: [], at: Date.now(), error: authErrorMessage(err) });
  }
  if ((lbView === 'players' ? 'overall' : lbGameId) === key) renderLeaderboard();
}

/* ── Account ──────────────────────────────────────────────────────────────── */

function renderAccount() {
  const session = getSession();
  const state = $('#account-state');
  const action = $('#account-action');
  const rename = $('#account-rename');
  state.replaceChildren();
  if (!backendReady()) {
    state.textContent = 'Shared leaderboard is offline until Supabase is connected.';
    action.hidden = true;
    rename.hidden = true;
    return;
  }
  action.hidden = false;
  if (session) {
    state.append('Signed in as ', element('b', '', getHandle() || suggestedHandle()),
      lbNotice ? ' · ' + lbNotice : '. Best scores sync to the shared board.');
    action.textContent = 'Sign out';
    action.classList.remove('primary');
    rename.hidden = false;
  } else {
    state.textContent = 'Playing as a guest. Scores stay in this browser.';
    action.textContent = 'Sign in';
    // The sign-in call to action is the one button in the header worth noticing.
    action.classList.add('primary');
    rename.hidden = true;
  }
}

function openAuthDialog(mode = 'signin') {
  if (!backendReady()) return;
  authMode = mode === 'name' && !getSession() ? 'signin' : mode;
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
  $('#auth-name').value = naming ? (getHandle() || suggestedHandle()) : '';
  $('#auth-password').value = '';
  if (!dialog.open) {
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  setTimeout(() => (naming ? $('#auth-name') : $('#auth-email')).focus(), 40);
}

function closeAuthDialog() {
  const dialog = $('#auth-dialog');
  if (dialog.close) dialog.close();
  else dialog.removeAttribute('open');
}

async function submitAuth(event) {
  event.preventDefault();
  if (!backendReady() || authBusy) return;
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
      await renameHandle(name);
      lbCache.clear();
      closeAuthDialog();
      renderAccount();
      renderLeaderboard();
      loadLeaderboard(true);
    } catch (err) {
      message.textContent = authErrorMessage(err);
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
      await signUp(email, password, name);
      if (!getSession()) {
        openAuthDialog('signin');
        message.textContent = 'Check your email to confirm the account. The link brings you back here.';
        return;
      }
    } else {
      await signIn(email, password);
    }
    lbNotice = '';
    closeAuthDialog();
    renderAccount();
    renderLeaderboard();
    await syncSharedScores();
    renderAccount();
    loadLeaderboard(true);
  } catch (err) {
    message.textContent = authErrorMessage(err);
  } finally {
    authBusy = false;
    $('#auth-submit').disabled = false;
  }
}

async function signOutUser() {
  await signOut();
  setHandle('');
  lbNotice = '';
  lbCache.clear();
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
    await adoptToken(access, refresh, Number(params.get('expires_in')) || 3600);
    lbNotice = '';
    renderAccount();
    renderLeaderboard();
    await syncSharedScores();
    renderAccount();
    loadLeaderboard(true);
  } catch (err) {
    lbNotice = authErrorMessage(err);
    renderAccount();
  }
  return true;
}

function initAccount() {
  renderGamePicker();
  $('#lb-game').onchange = event => {
    lbGameId = event.target.value;
    lbOpenPlayer = '';
    renderLeaderboard();
    loadLeaderboard();
  };
  for (const tab of $$('.lb-tab')) {
    tab.onclick = () => {
      lbView = tab.dataset.view === 'games' ? 'games' : 'players';
      lbOpenPlayer = '';
      renderLeaderboard();
      loadLeaderboard();
    };
  }
  $('#lb-refresh').onclick = () => loadLeaderboard(true);
  $('#account-action').onclick = () => { if (getSession()) signOutUser(); else openAuthDialog('signin'); };
  $('#account-rename').onclick = () => openAuthDialog('name');
  $('#auth-cancel').onclick = closeAuthDialog;
  $('#auth-toggle').onclick = () => openAuthDialog(authMode === 'signup' ? 'signin' : 'signup');
  $('#auth-form').addEventListener('submit', submitAuth);
  $('#auth-dialog').addEventListener('click', event => { if (event.target === $('#auth-dialog')) closeAuthDialog(); });

  renderAccount();
  renderLeaderboard();
  loadRules().then(loaded => {
    if (!loaded) return;
    renderGamePicker();
    renderLeaderboard();
  });
  loadLeaderboard();
  consumeAuthRedirect().then(handled => {
    if (handled || !getSession()) return;
    freshSession().then(fresh => {
      if (!fresh) { renderAccount(); renderLeaderboard(); return; }
      ensureProfile().then(() => { renderAccount(); syncSharedScores(); }).catch(err => {
        lbNotice = authErrorMessage(err);
        renderAccount();
      });
    });
  });
}

/* ── Game document plumbing ───────────────────────────────────────────────── */

function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function injectHead(html, extra) {
  return html.replace(/<head([^>]*)>/i, (match, attrs) => '<head' + attrs + '>' + extra);
}

/* ── Wiring ───────────────────────────────────────────────────────────────── */

searchInput.addEventListener('input', renderLibrary);
$('#sort').addEventListener('change', renderLibrary);
$('#filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  category = button.dataset.filter;
  for (const el of $('#filters').children) el.setAttribute('aria-pressed', String(el === button));
  renderLibrary();
});

$('#random').onclick = () => {
  // Offline by default; a deliberate Online filter opts into remote entries.
  const pool = visibleGames.filter(([slug]) => category === 'Online' || !EXTERNS[slug]);
  if (pool.length) openGame(pool[Math.floor(Math.random() * pool.length)][0]);
  else showLibraryMessage();
};
$('#back').onclick = closeGame;
$('#resume').onclick = () => { closeMenu(); gameFrame.focus(); };
$('#restart').onclick = restartGame;
$('#daily-play').onclick = () => {
  const challenge = dailyChallenge(challengeDate());
  openGame(challenge.slug, challenge);
};
$('#daily-share').onclick = shareDailyResult;

menuButton.onclick = event => {
  const open = menuPanel.hidden;
  setMenu(open, { focusFirst: open && event.detail === 0 });
};

menuPanel.addEventListener('keydown', event => {
  const items = [...menuPanel.querySelectorAll('button')];
  const index = items.indexOf(document.activeElement);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    items[event.key === 'Home' ? 0 : items.length - 1].focus();
  }
});

document.addEventListener('pointerdown', event => {
  if (!menuPanel.hidden && !event.target.closest('#player-menu')) closeMenu();
});

function onFullscreenChange() {
  if (!fullscreenElement()) leftFullscreenAt = Date.now();
}
addEventListener('fullscreenchange', onFullscreenChange);
addEventListener('webkitfullscreenchange', onFullscreenChange);

addEventListener('message', event => {
  if (!activeSlug || EXTERNS[activeSlug] || event.source !== gameFrame.contentWindow) return;
  switch (event.data?.type) {
    case 'bored:close':
      if (fullscreenElement()) leaveFullscreen(); else closeGame();
      break;
    case 'bored:restart': restartGame(); break;
    case 'bored:fullscreen': toggleFullscreen(); break;
    case 'bored:menuclose': closeMenu(); break;
  }
});

addEventListener('keydown', event => {
  const typing = event.target instanceof Element &&
    (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
  if (event.key === 'Escape') {
    if (!menuPanel.hidden) { event.preventDefault(); closeMenu({ returnFocus: true }); }
    else if (fullscreenElement()) { event.preventDefault(); leaveFullscreen(); }
    else if (activeSlug && Date.now() - leftFullscreenAt > 500) closeGame();
  } else if (activeSlug && !typing && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.key === 'R' || event.key === 'r') { event.preventDefault(); restartGame(); }
    else if (event.key === 'F' || event.key === 'f') { event.preventDefault(); toggleFullscreen(); }
  } else if (event.key === '/' && !activeSlug && !typing) { event.preventDefault(); searchInput.focus(); }
});

// A run ends in a burst of frames, so the daily check and the best-score check
// run on one steady tick instead of per frame.
setInterval(() => {
  pollDaily();
  captureBest();
}, 250);
addEventListener('focus', renderDaily);
setInterval(renderDaily, 60000);

loadLibrary();
renderDaily();
renderRecent();
renderLibrary();
initAccount();

// The original single-file hub exposed these globals; keep them for the test
// suite and for anyone poking at the console.
Object.assign(window, {
  openGame, closeGame, renderDaily, readDaily, dailyChallenge, dailyCheck,
  CHALLENGES, ORDER, EXTERNS, NEW_GAMES, META, LB_GAMES, HIGH_SCORE_GAMES,
  captureHighScore: captureBest, accountStandings, boardGames, postingGameId, mergedInto, scoreRules
});
Object.defineProperty(window, 'currentDaily', { get: () => activeChallenge });
Object.defineProperty(window, 'current', { get: () => activeSlug });

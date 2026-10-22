import {
  ORDER, EXTERNS, NEW_GAMES, FRESH_GAMES, META, PAYLOAD_SLUGS, loadGameDocument
} from './games/catalog.js';
import { DISCOVERY, COLLECTIONS, PREVIEWS, inCollection } from './games/discovery.js';
import { nativeHTML } from './games/arcade.js';
import { dailyDate as defaultDailyDate, dailyChallenge, dailyCheck, dailyStreak, installDailyAdapter, seedNumber, seedCode, CHALLENGES } from './daily.js';
import { readStored, writeStored, writeRaw, readStoredPrefix } from './hub/store.js';
import {
  backendReady, request, getSession, getHandle, setHandle, loadRules, scoreRules, ANON_TOKEN,
  freshSession, ensureProfile, renameHandle, authErrorMessage, suggestedHandle,
  signIn, signUp, signOut, adoptToken, hasIdentity, ensureAnonymousSession
} from './hub/backend.js';
import {
  LB_GAMES, HIGH_SCORE_GAMES, accountStandings, rankPoints, boardGames,
  isLocalOnly, bestValue, formatScore, recordBest,
  syncScores, onScoresPosted
} from './hub/scores.js';
import { pullPlayerState, pushPlayerState } from './hub/cloud.js';
import { sendFeedback, feedbackErrorMessage } from './hub/feedback.js';

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
let launchSelector = '';
// The element that opened the current game, kept as a node so a control built
// on the fly (a leaderboard row's Play button) still takes focus back on close.
let launchFocus = null;
let activeChallenge = null;
let hintTimer = 0;
let focusTimer = 0;
// Bumped whenever the frame should stop accepting a document, so a download
// that finishes after the player moved on cannot paint over the current game.
let loadToken = 0;
const dailyResults = new Map();

let category = 'All';
let collection = 'all';
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
  requestCloudPush();
}

function previewFor(slug) {
  const preview = element('span', 'game-preview');
  preview.setAttribute('aria-hidden', 'true');
  if (PREVIEWS[slug]) {
    const image = element('img');
    image.src = PREVIEWS[slug];
    image.alt = '';
    image.width = 384;
    image.height = 240;
    image.loading = 'lazy';
    image.decoding = 'async';
    preview.appendChild(image);
  } else {
    preview.classList.add('external-preview');
    preview.append(element('span', 'external-mark', '↗'), element('span', '', 'ONLINE EXTRA'));
  }
  return preview;
}

function gameMeta(slug) {
  const game = DISCOVERY[slug];
  return [game.minutes, game.pace, game.players].filter(Boolean).join(' · ');
}

function shelfGame(slug, note) {
  const name = ORDER.find(([id]) => id === slug)[1];
  const button = element('button', 'shelf-play');
  button.type = 'button';
  button.dataset.slug = slug;
  button.appendChild(previewFor(slug));
  const text = element('span', 'shelf-copy');
  text.append(element('span', 'shelf-name', name + '\u00a0↗'), element('span', 'shelf-note', note));
  button.appendChild(text);
  button.onclick = () => openGame(slug);
  return button;
}

// One shelf, four cards. Recent games come first; favorites fill whatever room
// is left, so the row never grows into a second shelf under itself.
const SHELF_LIMIT = 4;

function renderRecent() {
  const saved = [...favorites].filter(slug => !recentGames.includes(slug));
  const shown = [...recentGames, ...saved].slice(0, SHELF_LIMIT);
  $('#recent-list').replaceChildren(...shown.map(slug => shelfGame(slug,
    (EXTERNS[slug] ? 'Online extra · ' : '') + (recentGames.includes(slug)
      ? (favorites.has(slug) ? 'Favorite · Recently played' : 'Recently played')
      : 'Favorite'))));
  $('#favorites-all').hidden = !favorites.size;
  $('#favorites-all').textContent = 'Browse ' + favorites.size + (favorites.size === 1 ? ' favorite' : ' favorites') + ' →';
  $('#recent-empty').hidden = shown.length > 0;
}

function renderCollections() {
  if (!$('#collections').children.length) $('#collections').replaceChildren(...COLLECTIONS.map(entry => {
    const button = element('button', 'collection', entry.name);
    button.type = 'button';
    button.dataset.collection = entry.id;
    button.setAttribute('aria-pressed', String(collection === entry.id));
    button.onclick = () => { collection = entry.id; renderCollections(); renderLibrary(); };
    return button;
  }));
  for (const button of $('#collections').children) button.setAttribute('aria-pressed', String(button.dataset.collection === collection));
  $('#collection-note').textContent = COLLECTIONS.find(entry => entry.id === collection).note;
}

// The shelf lists the NEW-badged games first, in badge order, then the rest of
// the catalog. Keeping it derived means a game that falls off the badge simply
// drops back into its catalog slot.
function libraryOrder() {
  const fresh = FRESH_GAMES.map(slug => ORDER.find(([id]) => id === slug)).filter(Boolean);
  return [...fresh, ...ORDER.filter(([slug]) => !FRESH_GAMES.includes(slug))];
}

function renderLibrary() {
  const filter = searchInput.value.trim().toLowerCase();
  gameGrid.replaceChildren();
  const shelf = libraryOrder();
  visibleGames = shelf.filter(([slug, name]) => {
    const meta = META[slug];
    return (EXTERNS[slug] || PAYLOAD_SLUGS.includes(slug) || NEW_GAMES.includes(slug)) &&
      inCollection(slug, collection) &&
      (!filter || [name, slug, ...meta, gameMeta(slug), ...DISCOVERY[slug].inputs].join(' ').toLowerCase().includes(filter)) &&
      (category === 'All' || (category === 'New' ? FRESH_GAMES.includes(slug) :
        category === 'Favorites' ? favorites.has(slug) : meta[0] === category));
  });
  if ($('#sort').value === 'az') visibleGames.sort((a, b) => a[1].localeCompare(b[1]));

  for (const [slug, name] of visibleGames) {
    const row = element('div', 'row');
    const card = element('button', 'card');
    card.type = 'button';
    card.dataset.slug = slug;
    card.appendChild(previewFor(slug));
    const text = element('span', 'text');
    const title = element('span', 'name', name);
    if (FRESH_GAMES.includes(slug)) title.appendChild(element('span', 'badge', 'NEW'));
    text.append(element('span', 'card-category', EXTERNS[slug] ? 'Online extra · Internet required' : META[slug][0] + ' · Offline'),
      title, element('span', 'detail', META[slug][1]), element('span', 'game-meta', gameMeta(slug)),
      element('span', 'game-inputs', DISCOVERY[slug].inputs.join(' / ')));
    card.appendChild(text);
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
      renderRecent();
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
    : 'Nothing here. Try another search, category, or collection, or clear the filters.';
  $('#results').textContent = visibleGames.length + ' of ' + ORDER.length + ' entries';
  $('#count').textContent = ORDER.length;
  const counts = (ORDER.length - Object.keys(EXTERNS).length) + ' offline / ' + Object.keys(EXTERNS).length + ' online extras';
  $('#library-count').textContent = counts;
  $('#foot-count').textContent = counts;
  $('#clear-filters').hidden = !filter && category === 'All' && collection === 'all';
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

function openGame(slug, challenge = null, origin = null) {
  if (!ORDER.some(([id]) => id === slug)) return;
  if (!activeSlug) {
    const from = origin || document.activeElement;
    // A caller that hands over the control it was launched from (the board's
    // Play button is rebuilt on every render) gets focus back on that same node;
    // every other game still returns to its card, as before.
    launchFocus = origin && origin.isConnected ? origin : null;
    const shelf = from.closest?.('#recent-list, #grid');
    launchSelector = shelf ? '#' + shelf.id + ' [data-slug="' + slug + '"]' : from.id ? '#' + from.id : '';
  }
  closeMenu();
  activeChallenge = challenge;
  const external = EXTERNS[slug];
  activeSlug = previousSlug = slug;
  recentGames = [slug, ...recentGames.filter(id => id !== slug)].slice(0, 4);
  saveLibrary();
  renderRecent();
  const name = ORDER.find(([id]) => id === slug)[1];
  gameFrame.title = name;
  $('#challenge-progress').hidden = !challenge;
  $('#hint').hidden = !!challenge;
  if (challenge) $('#challenge-progress').textContent = challenge.goal;
  hubRoot.inert = true;

  if (external) {
    gameFrame.removeAttribute('srcdoc');
    gameFrame.src = external;
    showHint('Internet required · use All games to return');
  } else {
    const native = NEW_GAMES.includes(slug);
    const token = ++loadToken;
    const paint = source => {
      // The player may have left, or opened another game, while this one was on
      // its way. Dropping the response keeps a late document from painting over
      // whatever is on screen now.
      if (token !== loadToken) return;
      let html = native ? source : installDailyAdapter(source, slug);
      html = injectSeed(html);
      let head = '<scr' + 'ipt>addEventListener("keydown",function(e){var t=e.target||{};if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:close"},"*");return}if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!t.isContentEditable&&!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||"")){if(e.key==="R"||e.key==="r"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:restart"},"*")}else if(e.key==="F"||e.key==="f"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:fullscreen"},"*")}}},true);document.addEventListener("pointerdown",function(){parent.postMessage({type:"bored:menuclose"},"*")},true);<\/scr' + 'ipt>';
      gameFrame.removeAttribute('src');
      gameFrame.srcdoc = injectHead(html, head);
      showHint('Click or tap to play · Esc leaves · Shift+R restarts · Shift+F fullscreen');
    };
    const fail = () => {
      if (token !== loadToken) return;
      gameFrame.srcdoc = frameStandIn(name + ' did not load.',
        'A game only downloads the first time you open it. Check the connection and choose it again.');
      showHint('That game could not be downloaded.');
    };
    gameFrame.removeAttribute('src');
    // A blank white rectangle reads as "broken" while the document is in flight.
    gameFrame.srcdoc = native ? '' : frameStandIn('Loading ' + name + '…', 'Downloading the game.');
    if (native) paint(nativeHTML(slug));
    else loadGameDocument(slug).then(paint).catch(fail);
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
  loadToken++;
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
  // A card that was on screen when the game opened wins; a rebuilt control
  // (the leaderboard re-renders) has been replaced, so its selector is used.
  const returnTo = (launchFocus?.isConnected ? launchFocus : null) ||
    (launchSelector && $(launchSelector)) ||
    $(`#recent-list [data-slug="${previousSlug}"]`) ||
    $(`#grid [data-slug="${previousSlug}"]`) || searchInput;
  launchFocus = null;
  (wasDaily ? $('#daily-play') : returnTo).focus();
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
  const improved = snapshot ? recordBest(activeSlug, snapshot) : false;
  if (improved) {
    requestCloudPush();
    quietAccount();
  }
  return improved;
}

// The first thing worth keeping is the moment a guest gets an account, without
// being asked to make one. It happens in the background and never changes what
// the page looks like; if it fails, the arcade simply keeps saving locally.
function quietAccount() {
  if (hasIdentity() || !backendReady()) return;
  ensureAnonymousSession().then(async session => {
    if (!session) return;
    await restorePlayerState();
    syncSharedScores();
    requestCloudPush();
  }).catch(() => { /* No account this visit. Nothing to report. */ });
}

async function syncSharedScores() {
  const result = await syncScores();
  if (result && result.error) {
    lbNotice = authErrorMessage(result.error);
    renderAccount();
  }
}

/* ── Player state on the account ──────────────────────────────────────────── */

// The browser's copy is what play reads; this keeps a second copy on the
// account so it shows up again on another device. Chrome partitions third-party
// storage, so without this a student who plays inside the Google Sites embed
// starts from nothing everywhere else.

const DAILY_PREFIX = 'bored.daily.';
// A daily result is a few hundred bytes; a year of them is a page of JSON.
const DAILY_LIMIT = 60;

function localPlayerState() {
  const daily = Object.entries(readStoredPrefix(DAILY_PREFIX))
    .filter(([, result]) => result && result.id)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, DAILY_LIMIT);
  return {
    library: { favorites: [...favorites], recent: recentGames },
    bests: Object.fromEntries(HIGH_SCORE_GAMES
      .map(game => [game.id, bestValue(game)])
      .filter(([, value]) => Number.isFinite(value) && value > 0)),
    daily: Object.fromEntries(daily)
  };
}

// A cloud value replaces a local one only where it is better, so two devices
// that both played offline keep the union of what they achieved rather than
// whatever happened to save last.
function mergePlayerState(data) {
  const validSlug = id => ORDER.some(([slug]) => slug === id);
  const library = data.library || {};
  let changed = false;

  const merged = new Set(
    [...favorites, ...(Array.isArray(library.favorites) ? library.favorites : [])].filter(validSlug)
  );
  if (merged.size !== favorites.size) changed = true;
  favorites = merged;

  const cloudRecent = [...new Set(
    (Array.isArray(library.recent) ? library.recent : []).filter(validSlug)
  )].slice(0, 4);
  if (cloudRecent.length > recentGames.length) {
    recentGames = cloudRecent;
    changed = true;
  }

  for (const game of HIGH_SCORE_GAMES) {
    const cloud = Math.round(Number(data.bests?.[game.id]));
    if (!Number.isFinite(cloud) || cloud <= 0) continue;
    const local = bestValue(game);
    if (local && (game.lower ? local <= cloud : local >= cloud)) continue;
    if (writeRaw(game.key, cloud)) changed = true;
  }

  for (const [id, result] of Object.entries(data.daily || {})) {
    if (!result || result.id !== id || readStored(DAILY_PREFIX + id, null)) continue;
    if (writeStored(DAILY_PREFIX + id, result)) changed = true;
  }
  return changed;
}

let cloudTimer = 0;

/** Debounced: one run can move a best and the recent shelf in the same gesture. */
function requestCloudPush() {
  if (!getSession() || !backendReady()) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => { pushPlayerState(localPlayerState()).catch(() => {}); }, 900);
}

// Called as soon as a session exists. A table that has not been created yet, an
// unreachable network, or a token that will not refresh all resolve to "keep
// the local copy": play must never depend on the account server being up.
async function restorePlayerState() {
  try {
    const cloud = await pullPlayerState();
    if (!cloud) return;
    if (mergePlayerState(cloud)) {
      saveLibrary();
      renderRecent();
      renderLibrary();
      renderDaily();
    }
    requestCloudPush();
  } catch { /* Nothing to restore yet. */ }
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
  const stored = readStored(DAILY_PREFIX + challenge.id, null);
  if (stored) result = stored;
  return result?.id === challenge.id && dailyCheck(challenge, result.snapshot).complete ? result : null;
}

function renderDaily() {
  const challenge = dailyChallenge(challengeDate());
  const result = readDaily(challenge);
  $('#daily-date').textContent = challenge.date + ' · RESETS AT MIDNIGHT DETROIT TIME';
  $('#daily-heading').textContent = ORDER.find(([slug]) => slug === challenge.slug)[1] + ' · ' + challenge.label;
  $('#daily-goal').textContent = challenge.goal;
  $('#daily-meta').textContent = gameMeta(challenge.slug);
  $('#daily-state').textContent = result ? 'Completed ✓' : 'Ready to play';
  $('#daily').classList.toggle('completed', !!result);
  if ($('#daily-preview').dataset.slug !== challenge.slug) {
    const preview = previewFor(challenge.slug);
    const image = preview.querySelector('img');
    if (image) { image.loading = 'eager'; image.fetchPriority = 'high'; }
    $('#daily-preview').replaceChildren(preview);
    $('#daily-preview').dataset.slug = challenge.slug;
  }
  $('#daily-status').textContent = result
    ? '✓ Automatically verified. Your completed result is saved.'
    : 'One goal for everyone. Retry as often as you like. Your result is checked automatically.';
  $('#daily-play').textContent = result ? 'Play again →' : 'Play today’s challenge →';
  $('#daily-share').hidden = !result;
  if ($('#daily-result').dataset.challenge !== challenge.id) $('#daily-result').hidden = true;
  renderStreak();
}

// Days with a verified completion. Completions are stored one key each
// (`bored.daily.<id>`), so they have to be gathered before they can be counted,
// and each is re-checked against its own challenge so a partial or rewritten
// entry cannot inflate the run.
function completedDailyDates() {
  const days = [];
  for (const [id, result] of Object.entries(readStoredPrefix(DAILY_PREFIX))) {
    if (!result || result.id !== id) continue;
    const date = id.split(':')[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const challenge = dailyChallenge(date);
    if (challenge.id !== id) continue;
    if (dailyCheck(challenge, result.snapshot).complete) days.push(date);
  }
  return days;
}

// One quiet line. It stays out of the way until there is something worth saying,
// and a streak that has not started yet is not worth saying anything about.
function renderStreak() {
  const line = $('#daily-streak');
  if (!line) return;
  const { current, best } = dailyStreak(completedDailyDates(), challengeDate());
  if (!current && !best) { line.hidden = true; return; }
  line.hidden = false;
  line.textContent = current
    ? current + '-day streak' + (best > current ? ' · best ' + best : '')
    : 'Longest streak: ' + best + (best === 1 ? ' day' : ' days');
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
      writeStored(DAILY_PREFIX + activeChallenge.id, result);
      requestCloudPush();
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
  if (!options.some(game => game.id === lbGameId)) lbGameId = options[0]?.id || 'overall';
  select.replaceChildren();
  for (const game of options) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name + (isLocalOnly(game.id) ? ' (local only)' : '');
    select.appendChild(option);
  }
  select.value = lbGameId;
}

function gameNote(game) {
  const unit = game.unit === 'seconds' ? 'time' : game.unit;
  const parts = [game.name + ' · ' + (game.lower ? 'lowest' : 'highest') + ' ' + unit + ' first.'];
  if (game.note) parts.push(game.note + '.');
  if (isLocalOnly(game.id)) parts.push('Not ranked online yet — scores for this game stay in your browser.');
  return parts.join(' ');
}

/**
 * The viewer's own best on one game. The posted score comes first so a best set
 * on another device still shows up; a guest, or a game that has not reached the
 * board yet, falls back to the best this browser holds.
 */
function ownValue(spec, all, mineKey) {
  const posted = mineKey
    ? all.find(row => row.game === spec.id && String(row.handle || '').toLowerCase() === mineKey)
    : null;
  const onBoard = posted ? Number(posted.value) : 0;
  return Number.isFinite(onBoard) && onBoard > 0 ? onBoard : bestValue(spec);
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
  const mineKey = handle && hasIdentity() ? handle.toLowerCase() : '';
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
          const value = Number(entry.value);
          const line = element('li', 'lb-line');
          line.append(element('span', 'lb-line-name', spec.name), element('span', 'lb-line-score', formatScore(value, spec)));
          // Their best stays where it was; the comparison sits under it so the
          // row is still one game wide at 320px.
          if (key !== mineKey) {
            const mine = ownValue(spec, all, mineKey);
            const note = !mine ? 'no score from you yet'
              : mine === value ? 'you ' + formatScore(mine, spec) + ' · tied'
                : 'you ' + formatScore(mine, spec) + ((spec.lower ? mine < value : mine > value) ? ' · ahead' : ' · behind');
            line.append(element('span', 'lb-line-you', note));
          }
          const play = element('button', 'lb-play', 'Play');
          play.type = 'button';
          play.setAttribute('aria-label', 'Play ' + spec.name);
          play.onclick = event => openGame(spec.id, null, event.currentTarget);
          line.append(play);
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
      : (hasIdentity() ? 'Play a game to put your account on the board.' : 'Sign in to put your account on the board.');
  } else if (game) {
    const parts = [];
    if (rows.length) parts.push(rows.length + (rows.length === 1 ? ' player' : ' players') + ' ranked');
    const local = bestValue(game);
    if (local) parts.push('your best: ' + formatScore(local, game));
    const myRow = hasIdentity() && handle ? rows.find(row => String(row.handle).toLowerCase() === mineKey) : null;
    if (myRow) parts.push('on the board: #' + (rows.indexOf(myRow) + 1));
    $('#lb-mine').textContent = parts.length
      ? parts.join(' · ') + (isLocalOnly(game.id) ? ' · not ranked online yet' : '')
      : (hasIdentity() ? 'Play ' + game.name + ' to put a score on the board.' : 'Sign in to add your best scores.');
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
  const anonymous = !hasIdentity();
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
  // A guest who holds a background anonymous session reads exactly as a guest
  // does; nothing about the account strip changes until they name themselves.
  if (!anonymous) {
    state.append('Signed in as ', element('b', '', getHandle() || suggestedHandle()),
      lbNotice ? ' · ' + lbNotice : '. Best scores sync to the shared board.');
    action.textContent = 'Sign out';
    action.classList.remove('primary');
    rename.hidden = false;
  } else {
    state.textContent = 'Playing as a guest. Scores stay in this browser.';
    action.textContent = 'Sign in';
    // Signing in is the one thing a guest has to find, so it carries the weight.
    action.classList.add('primary');
    rename.hidden = true;
  }
}

/* ── Feedback ─────────────────────────────────────────────────────────────── */

let feedbackBusy = false;

function openFeedbackDialog() {
  if (!backendReady()) return;
  const dialog = $('#feedback-dialog');
  $('#feedback-status').textContent = '';
  $('#feedback-email').value = getSession()?.user?.email || '';
  if (!dialog.open) {
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  setTimeout(() => $('#feedback-text').focus(), 40);
}

function closeFeedbackDialog() {
  const dialog = $('#feedback-dialog');
  if (dialog.close) dialog.close();
  else dialog.removeAttribute('open');
}

async function submitFeedback(event) {
  event.preventDefault();
  if (feedbackBusy) return;
  const message = $('#feedback-text').value.trim();
  const email = $('#feedback-email').value.trim();
  const status = $('#feedback-status');
  if (message.length < 4) { status.textContent = 'Tell us a little more first.'; return; }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { status.textContent = 'That email does not look right.'; return; }
  feedbackBusy = true;
  $('#feedback-submit').disabled = true;
  status.textContent = 'Sending…';
  try {
    await sendFeedback({ message, email });
    $('#feedback-text').value = '';
    closeFeedbackDialog();
    const button = $('#feedback-open');
    button.textContent = 'Thanks — sent';
    button.disabled = true;
    setTimeout(() => { button.textContent = 'Send feedback'; button.disabled = false; }, 4000);
  } catch (err) {
    status.textContent = feedbackErrorMessage(err);
  } finally {
    feedbackBusy = false;
    $('#feedback-submit').disabled = false;
  }
}

function initFeedback() {
  $('#feedback-open').onclick = openFeedbackDialog;
  $('#feedback-cancel').onclick = closeFeedbackDialog;
  $('#feedback-form').addEventListener('submit', submitFeedback);
  $('#feedback-dialog').addEventListener('click', event => {
    if (event.target === $('#feedback-dialog')) closeFeedbackDialog();
  });
}

function openAuthDialog(mode = 'signin') {
  if (!backendReady()) return;
  authMode = mode === 'name' && !hasIdentity() ? 'signin' : mode;
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
    await restorePlayerState();
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
    await restorePlayerState();
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
  $('#account-action').onclick = () => { if (hasIdentity()) signOutUser(); else openAuthDialog('signin'); };
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
      ensureProfile().then(async () => {
        renderAccount();
        await restorePlayerState();
        syncSharedScores();
      }).catch(err => {
        lbNotice = authErrorMessage(err);
        renderAccount();
      });
    });
  });
}

/* ── Game document plumbing ───────────────────────────────────────────────── */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

// Shown in the frame while a document is downloading, and again when it never
// arrives, so the player gets a reason instead of a white rectangle.
function frameStandIn(message, detail) {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Game</title><style>' +
    'html,body{height:100%}body{margin:0;display:grid;place-content:center;gap:6px;background:#fff;' +
    'color:#111;text-align:center;padding:24px;font:14px/1.5 system-ui,-apple-system,sans-serif}' +
    'p{margin:0;font-weight:600}span{color:#666}</style></head><body>' +
    '<p>' + escapeHtml(message) + '</p><span>' + escapeHtml(detail) + '</span></body></html>';
}

function injectHead(html, extra) {
  return html.replace(/<head([^>]*)>/i, (match, attrs) => '<head' + attrs + '>' + extra);
}

// Every game document learns the day's shared seed before its own script runs,
// so anything board-generated can be the same for everyone on the first run of
// the day. Games that ignore it behave exactly as before.
function injectSeed(html) {
  const date = challengeDate();
  const seed = seedNumber(date);
  const script = '<scr' + 'ipt>window.__boredSeed={date:' + JSON.stringify(date) +
    ',seed:' + seed + ',code:' + JSON.stringify(seedCode(seed)) + '};<\/scr' + 'ipt>';
  // The last closing tag is the document's; a game may well contain the text
  // "</body>" earlier as data (shadow-net's fake web pages do).
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at < 0 ? html + script : html.slice(0, at) + script + html.slice(at);
}

/* ── Wiring ───────────────────────────────────────────────────────────────── */

searchInput.addEventListener('input', renderLibrary);
$('#sort').addEventListener('change', renderLibrary);
$('#clear-filters').onclick = () => {
  category = 'All';
  collection = 'all';
  searchInput.value = '';
  for (const button of $('#filters').children) button.setAttribute('aria-pressed', String(button.dataset.filter === 'All'));
  renderCollections();
  renderLibrary();
  searchInput.focus();
};
$('#favorites-all').onclick = () => {
  collection = 'all';
  category = 'Favorites';
  searchInput.value = '';
  for (const button of $('#filters').children) button.setAttribute('aria-pressed', String(button.dataset.filter === 'Favorites'));
  renderCollections();
  renderLibrary();
  $('#filters [data-filter="Favorites"]').focus();
};
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
renderCollections();
renderLibrary();
initAccount();
initFeedback();

// The original single-file hub exposed these globals; keep them for the test
// suite and for anyone poking at the console.
Object.assign(window, {
  openGame, closeGame, renderDaily, readDaily, dailyChallenge, dailyCheck,
  CHALLENGES, ORDER, EXTERNS, NEW_GAMES, FRESH_GAMES, META, DISCOVERY, COLLECTIONS, PREVIEWS, LB_GAMES, HIGH_SCORE_GAMES,
  captureHighScore: captureBest, accountStandings, boardGames, isLocalOnly, scoreRules
});
Object.defineProperty(window, 'currentDaily', { get: () => activeChallenge });
Object.defineProperty(window, 'current', { get: () => activeSlug });

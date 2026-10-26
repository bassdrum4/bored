import {
  ORDER, EXTERNS, NEW_GAMES, FRESH_GAMES, META, PAYLOAD_SLUGS, loadGameDocument
} from './games/catalog.js';
import { DISCOVERY, COLLECTIONS, PREVIEWS, inCollection } from './games/discovery.js';
import { nativeHTML } from './games/arcade.js';
import { dailyDate as defaultDailyDate, dailyChallenge, dailyCheck, dailyStreak, installDailyAdapter, seedNumber, seedCode, CHALLENGES } from './daily.js';
import { readStored, writeStored, writeRaw, removeStored, readStoredPrefix } from './hub/store.js';
import {
  backendReady, request, getSession, getHandle, setHandle, loadRules, scoreRules, ANON_TOKEN,
  freshSession, ensureProfile, renameHandle, authErrorMessage, suggestedHandle,
  signIn, signUp, signOut, adoptToken, hasIdentity
} from './hub/backend.js';
import {
  LB_GAMES, HIGH_SCORE_GAMES, accountStandings, rankPoints, boardGames,
  isLocalOnly, bestValue, formatScore, recordBest, scoreValue,
  syncScores, onScoresPosted
} from './hub/scores.js';
import { pullPlayerState, pushPlayerState } from './hub/cloud.js';
import { submitDailyResult } from './hub/daily-sync.js';
import { activatePlayerStorage, capturePlayerSnapshot, stashPendingSignup, adoptSignupProgress } from './hub/player-storage.js';
import { createLibraryView } from './hub/library-view.js';
import { createLeaderboardView } from './hub/leaderboard-view.js';
import { createAccountUI } from './hub/account-ui.js';
import { createTogetherUI } from './hub/together-ui.js';
import { createTogetherPlayer } from './hub/together-player.js';
import { createFeedbackUI } from './hub/feedback-ui.js';
import { createAnalytics, ANALYTICS_BRIDGE } from './hub/analytics.js';
import { createGameDocument } from './hub/game-document.js';

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
let favoriteEvents = {};

let lbOpenPlayer = '';
let lbNotice = '';
const lbCache = new Map();

// A guest's best from the run they just left, held only long enough to offer
// them an account for it.
let guestClaim = null;
let claimOffered = null;
let claimReturnFocus = null;

// Main owns mutable state; view modules read/write through these accessors.
const uiState = {
  get category() { return category; }, set category(v) { category = v; },
  get collection() { return collection; }, set collection(v) { collection = v; },
  get visibleGames() { return visibleGames; }, set visibleGames(v) { visibleGames = v; },
  get favorites() { return favorites; }, set favorites(v) { favorites = v; },
  get recentGames() { return recentGames; }, set recentGames(v) { recentGames = v; },
  get favoriteEvents() { return favoriteEvents; }, set favoriteEvents(v) { favoriteEvents = v; },
  get lbOpenPlayer() { return lbOpenPlayer; }, set lbOpenPlayer(v) { lbOpenPlayer = v; },
  get lbCache() { return lbCache; },
  get lbNotice() { return lbNotice; }, set lbNotice(v) { lbNotice = v; }
};

/* ── Library: grid, filters, favorites, recent ────────────────────────────── */

function loadLibrary() {
  const saved = readStored('bored.library', {}) || {};
  const valid = list => Array.isArray(list)
    ? [...new Set(list.filter(id => ORDER.some(([slug]) => slug === id)))]
    : [];
  favorites = new Set(valid(saved.favorites));
  recentGames = valid(saved.recent).slice(0, 4);
  favoriteEvents = readStored('bored.favoriteEvents', {}) || {};
}

function saveLibrary() {
  writeStored('bored.library', { favorites: [...favorites], recent: recentGames });
  requestCloudPush();
}

const { previewFor, gameMeta, renderRecent, renderCollections, renderLibrary, showLibraryMessage } =
  createLibraryView({ state: uiState, openGame, saveLibrary });

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

const analytics = createAnalytics({ frame: gameFrame, snapshot: snapshotFor, score: scoreValue, isLower: slug => !!LB_GAMES.find(g => g.id === slug)?.lower, paused: () => !menuPanel.hidden });
gameFrame.addEventListener('load', () => { if (activeSlug) analytics.ready(!!EXTERNS[activeSlug]); });

function restartGame() {
  if (!activeSlug) return;
  if (activeTogether) { showHint('Your online game is saved. Exit and reopen it to reload.'); closeMenu(); return; }
  captureBest();
  closeMenu();
  analytics.end('restart');
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

let activeTogether = null;
function openGame(slug, challenge = null, origin = null, multiplayer = null) {
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
  if (activeSlug) { pollDaily(); captureBest(); }
  const previousTogether = activeTogether;
  activeTogether = multiplayer;
  if (previousTogether && previousTogether !== multiplayer) previousTogether.dispose();
  $('#back span').textContent = multiplayer ? '‹ Bored Together' : '‹ All games';
  $('#restart').hidden = !!multiplayer;
  analytics.end('switch');
  closeMenu();
  activeChallenge = challenge;
  const external = EXTERNS[slug];
  activeSlug = previousSlug = slug;
  const from = origin || document.activeElement;
  const launchSource = challenge ? 'daily' : from?.closest?.('#recent') ? 'recent' : from?.closest?.('#leaderboard') ? 'leaderboard' : from?.id === 'random' ? 'random' : from?.closest?.('#grid') ? 'library' : 'other';
  analytics.start(slug, { source: launchSource, daily: !!challenge, external: !!external, embedded: isEmbedded(), device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop' });
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
      if (multiplayer) html = multiplayer.document(html);
      let head = '<scr' + 'ipt>addEventListener("keydown",function(e){var t=e.target||{};if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:close"},"*");return}if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!t.isContentEditable&&!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||"")){if(e.key==="R"||e.key==="r"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:restart"},"*")}else if(e.key==="F"||e.key==="f"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"bored:fullscreen"},"*")}}},true);document.addEventListener("pointerdown",function(){parent.postMessage({type:"bored:menuclose"},"*")},true);<\/scr' + 'ipt>';
      gameFrame.removeAttribute('src');
      gameFrame.srcdoc = injectHead(html, ANALYTICS_BRIDGE + head);
      showHint(multiplayer ? 'Your turn saves automatically · Esc returns to Bored Together' : 'Click or tap to play · Esc leaves · Shift+R restarts · Shift+F fullscreen');
    };
    const fail = () => {
      if (token !== loadToken) return;
      gameFrame.srcdoc = frameStandIn(name + ' did not load.',
        'A game only downloads the first time you open it. Check the connection and choose it again.');
      analytics.event('error', { code: 'load_failed' });
      analytics.end('load_failed');
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
  analytics.end('close');
  const claim = guestClaim;
  guestClaim = null;
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
  const together = activeTogether;
  activeTogether = null;
  if (together) together.dispose();
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
  const target = wasDaily ? $('#daily-play') : returnTo;
  target.focus();
  // Back on the hub, a guest who just set a best is offered an account while
  // the run is still something they can keep.
  if (claim) offerClaim(claim, target);
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
  if (activeTogether) return false;
  if (!activeSlug || playerPanel.hidden) return false;
  const snapshot = snapshotFor(activeSlug);
  const improved = snapshot ? recordBest(activeSlug, snapshot) : false;
  if (improved) {
    requestCloudPush();
    // A guest has no account to post under. Remember the run so leaving the
    // game can offer them one instead of quietly dropping the score.
    if (!hasIdentity()) {
      const value = scoreValue(activeSlug, snapshot);
      if (value && !isLocalOnly(activeSlug)) guestClaim = { slug: activeSlug, value };
    }
  }
  return improved;
}

/* A guest's run, offered back to them on the hub. Nothing is posted until they
 * have an account, and only the score they were just shown is carried over. */

const CLAIM_KEY = 'bored.pendingClaim';

function offerClaim(claim, returnTo) {
  const spec = LB_GAMES.find(game => game.id === claim.slug);
  if (!spec || !backendReady()) return;
  claimOffered = claim;
  claimReturnFocus = returnTo;
  $('#claim-heading').textContent = 'You scored ' + formatScore(claim.value, spec) + ' in ' + spec.name + '.';
  const dialog = $('#claim-dialog');
  if (!dialog.open) {
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
}

function closeClaimDialog({ restoreFocus = true } = {}) {
  const dialog = $('#claim-dialog');
  if (dialog.close) dialog.close();
  else dialog.removeAttribute('open');
  claimOffered = null;
  if (restoreFocus && claimReturnFocus?.isConnected) claimReturnFocus.focus();
  claimReturnFocus = null;
}

// Sign in or sign up from the offer. The claim is saved first so the dialog can
// be dismissed, or the page reloaded, without losing which score was promised.
function startClaimAuth(mode) {
  const claim = claimOffered;
  if (claim) writeStored(CLAIM_KEY, claim);
  closeClaimDialog({ restoreFocus: false });
  openAuthDialog(mode);
}

/** Give a claimed run to the account that just signed in, if it is still better. */
function applyPendingClaim() {
  const claim = readStored(CLAIM_KEY, null);
  if (!claim || !hasIdentity() || !claim.slug || !(claim.value > 0)) return false;
  removeStored(CLAIM_KEY);
  const spec = LB_GAMES.find(game => game.id === claim.slug);
  if (!spec || !spec.key || isLocalOnly(spec.id)) return false;
  const previous = bestValue(spec);
  if (previous && (spec.lower ? previous <= claim.value : previous >= claim.value)) return false;
  if (!writeRaw(spec.key, claim.value)) return false;
  requestCloudPush();
  return true;
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
    library: { favorites: [...favorites], recent: recentGames, favoriteEvents },
    bests: Object.fromEntries(LB_GAMES
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

  const events = library.favoriteEvents || {};
  for (const [slug, event] of Object.entries(events)) {
    if (!validSlug(slug) || !event || typeof event.saved !== 'boolean' || !Number.isFinite(event.at)) continue;
    if (!favoriteEvents[slug] || event.at >= favoriteEvents[slug].at) {
      if (!favoriteEvents[slug] || favoriteEvents[slug].at !== event.at || favoriteEvents[slug].saved !== event.saved) changed = true;
      favoriteEvents[slug] = event;
    }
  }
  const merged = new Set(
    [...favorites, ...(Array.isArray(library.favorites) ? library.favorites : [])].filter(validSlug)
  );
  for (const [slug, event] of Object.entries(favoriteEvents)) {
    if (!validSlug(slug)) continue;
    if (event.saved) merged.add(slug);
    else merged.delete(slug);
  }
  if (merged.size !== favorites.size || [...merged].some(slug => !favorites.has(slug))) changed = true;
  favorites = merged;
  writeStored('bored.favoriteEvents', favoriteEvents);

  const cloudRecent = [...new Set(
    (Array.isArray(library.recent) ? library.recent : []).filter(validSlug)
  )].slice(0, 4);
  const recent = [...new Set([...recentGames, ...cloudRecent])].slice(0, 4);
  if (recent.join('|') !== recentGames.join('|')) {
    recentGames = recent;
    changed = true;
  }

  for (const game of LB_GAMES) {
    const cloud = Math.round(Number(data.bests?.[game.id]));
    if (!Number.isFinite(cloud) || cloud <= 0) continue;
    const local = bestValue(game);
    if (local && (game.lower ? local <= cloud : local >= cloud)) continue;
    const key = game.key || (game.id === 'minesweeper' ? 'bored.synced.minesweeper' : null);
    if (key && writeRaw(key, cloud)) changed = true;
  }

  for (const [id, result] of Object.entries(data.daily || {})) {
    if (!result || result.id !== id || readStored(DAILY_PREFIX + id, null)) continue;
    if (writeStored(DAILY_PREFIX + id, result)) changed = true;
  }
  return changed;
}

function activePlayerId() {
  return hasIdentity() ? getSession().user.id : null;
}

// Legacy games write score keys themselves, so replace the entire set of
// player-owned keys rather than just changing the library JSON namespace.
function activateProfile() {
  clearTimeout(cloudTimer);
  const id = activePlayerId();
  activatePlayerStorage(id ? 'user:' + id : 'guest');
  dailyResults.clear();
  loadLibrary();
  renderRecent();
  renderLibrary();
  renderDaily();
}

let cloudTimer = 0;

/** Debounced: one run can move a best and the recent shelf in the same gesture. */
function requestCloudPush() {
  if (!getSession() || !backendReady()) return;
  clearTimeout(cloudTimer);
  const id = getSession().user.id;
  cloudTimer = setTimeout(async () => {
    if (getSession()?.user?.id !== id) return;
    try {
      const merged = await pushPlayerState(localPlayerState());
      if (!merged || getSession()?.user?.id !== id) return;
      if (mergePlayerState(merged)) {
        saveLibrary(); renderRecent(); renderLibrary(); renderDaily();
      }
    } catch { /* Offline: the next save or login retries. */ }
  }, 900);
}

// Called as soon as a session exists. A table that has not been created yet, an
// unreachable network, or a token that will not refresh all resolve to "keep
// the local copy": play must never depend on the account server being up.
async function restorePlayerState() {
  const id = getSession()?.user?.id;
  if (!id) return;
  try {
    const cloud = await pullPlayerState();
    if (getSession()?.user?.id !== id) return;
    if (!cloud) { syncSavedDailyResults(); return; }
    if (mergePlayerState(cloud)) {
      saveLibrary();
      renderRecent();
      renderLibrary();
      renderDaily();
    }
    requestCloudPush();
    syncSavedDailyResults();
  } catch { /* Nothing to restore yet. */ }
}

function syncSavedDailyResults() {
  const saved = Object.entries(readStoredPrefix(DAILY_PREFIX))
    .filter(([id, result]) => result?.id === id)
    .slice(-DAILY_LIMIT);
  for (const [, result] of saved) {
    // Keep daily play working during outages. The RPC is first-write-wins.
    void submitDailyResult(result);
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
      analytics.event('daily_complete');
      result = { id: activeChallenge.id, snapshot: { ...snapshot } };
      dailyResults.set(activeChallenge.id, result);
      writeStored(DAILY_PREFIX + activeChallenge.id, result);
      void submitDailyResult(result);
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

const { renderLeaderboard, loadLeaderboard } = createLeaderboardView({ state: uiState, openGame });

const { renderAccount, openAuthDialog, initAccount } = createAccountUI({
  state: uiState, activateProfile, applyPendingClaim, startClaimAuth, closeClaimDialog,
  loadLibrary, renderRecent, renderLibrary, renderDaily, renderLeaderboard, loadLeaderboard,
  syncSharedScores, restorePlayerState
});

const { initFeedback } = createFeedbackUI();



const { escapeHtml, frameStandIn, injectHead, injectSeed } = createGameDocument(challengeDate);

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
  const items = [...menuPanel.querySelectorAll('button:not([hidden])')];
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
  if (activeTogether) activeTogether.message(event);
  switch (event.data?.type) {
    case 'bored:close':
      if (fullscreenElement()) leaveFullscreen(); else closeGame();
      break;
    case 'bored:runtime-error': analytics.event('error', { code: 'runtime' }); break;
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

activatePlayerStorage(activePlayerId() ? 'user:' + activePlayerId() : 'guest');
loadLibrary();
renderDaily();
renderRecent();
renderCollections();
renderLibrary();
createTogetherUI({ openAuthDialog, playMatch(match, owner, callbacks) {
  const player = createTogetherPlayer({ match, owner, frame: gameFrame, ...callbacks, close: closeGame });
  openGame(match.game, null, document.querySelector('#together-nav'), player);
} });
window.addEventListener('bored:identity', () => { if (activeTogether && !activeTogether.isOwner()) closeGame(); });
initAccount();
initFeedback();
const analyticsToggle = $('#analytics-enabled');
analyticsToggle.checked = analytics.enabled();
analyticsToggle.onchange = () => analytics.setEnabled(analyticsToggle.checked);

// The original single-file hub exposed these globals; keep them for the test
// suite and for anyone poking at the console.
Object.assign(window, {
  openGame, closeGame, renderDaily, readDaily, dailyChallenge, dailyCheck,
  CHALLENGES, ORDER, EXTERNS, NEW_GAMES, FRESH_GAMES, META, DISCOVERY, COLLECTIONS, PREVIEWS, LB_GAMES, HIGH_SCORE_GAMES,
  captureHighScore: captureBest, accountStandings, boardGames, isLocalOnly, scoreRules
});
Object.defineProperty(window, 'currentDaily', { get: () => activeChallenge });
Object.defineProperty(window, 'current', { get: () => activeSlug });

// Puffer Party client. The room, its turn, its fuse and its answers all come
// from the server snapshot; this file only paints them and forwards intent.
import { connectParty } from './party-live.mjs';
import { Reef } from './reef.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIZE_LABEL = { 2: '1v1 · two divers', 3: '3 divers', 6: '4 to 6 players', 10: '8 to 10 players' };
const BUDDIES = { KRILL: 'krill', SCHOOLER: 'schooler', SQUID: 'rare', ANGLER: 'deepcut', EVIL: 'evil' };
const BUDDY_DAYS = { KRILL: 0, SCHOOLER: 5, SQUID: 14, ANGLER: 30, EVIL: 45 };
// Krillion's own pixel heart (7x6, crisp edges) and tier palette, so a seat
// plate and its meter read the same as theirs.
const HEART = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><rect x="1" y="0" width="2" height="1"/><rect x="4" y="0" width="2" height="1"/><rect x="0" y="1" width="7" height="2"/><rect x="1" y="3" width="5" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="3" y="5" width="1" height="1"/></svg>';
const TIER_COLOR = { plankton: '#8fa3c4', tooclever: '#ff9f43', schooler: '#4de3ff', rare: '#ff5252', deepcut: '#9d7bff', krillion: '#ffd166' };
const tierFor = points => points >= 100 ? 'krillion' : points >= 85 ? 'deepcut' : points >= 60 ? 'rare' : points >= 30 ? 'schooler' : points >= 15 ? 'tooclever' : 'plankton';

const state = {
  code: '', view: null, offset: 0, live: null, poll: null, ticker: null, busy: false,
  size: 6, rated: true, listed: false, roomsOffset: 0, seats: 6, lives: 2, minTurn: 8, sprite: 'krill', lastStatus: ''
};
const SEAT_CHOICES = [2, 3, 6, 10];
const TURN_MIN = 3;
const TURN_MAX = 30;
const prefs = { name: '', badge: 'KRILL' };
try {
  prefs.name = localStorage.getItem('ok:partyName') || '';
  prefs.badge = localStorage.getItem('ok:partyBadge') || 'KRILL';
} catch { /* private mode */ }

const API_BASE = 'https://djdpttltfmwkofdrvkem.supabase.co/functions/v1/puffer-party';
const API_KEY = 'sb_publishable_Ayx7pzjm55vlzQ4u8se9KA_O97WK-QZ';
const PARTY_ID = (() => {
  try {
    let id = localStorage.getItem('ok:partyId');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ok:partyId', id); }
    return id;
  } catch { return crypto.randomUUID(); }
})();

async function api(path, data) {
  const response = await fetch(API_BASE + '/' + path, {
    cache: 'no-store',
    headers: { apikey: API_KEY, 'x-party-token': PARTY_ID, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'The signal is lost. Please retry.');
    error.status = response.status;
    throw error;
  }
  return body;
}

function status(message, tone = '') {
  state.lastStatus = message;
  for (const id of ['lobby-status', 'party-status']) {
    const line = $(id);
    if (!line) continue;
    line.textContent = message;
    line.dataset.tone = tone;
  }
}

/* ── the reef ───────────────────────────────────────────────────────────── */

const reef = new Reef($('reef'));
reef.start();

function ringPoints(count) {
  const w = innerWidth;
  const h = innerHeight;
  const cx = w / 2;
  const cy = h * (h < 640 ? .38 : .41);
  const rx = Math.min(w * (count > 6 ? .37 : .30), 330);
  const ry = Math.min(h * .115, 110);
  const scale = w < 760 ? .72 : w < 1100 ? .86 : 1;
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.PI / 2 + i * (Math.PI * 2 / count);
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry, scale });
  }
  return points;
}

function placeRing(count) {
  const points = ringPoints(count);
  reef.seats = points;
  $('puffer').style.left = (innerWidth / 2) + 'px';
  $('puffer').style.top = (innerHeight * (innerHeight < 640 ? .42 : .44)) + 'px';
  $('zz').style.left = (innerWidth / 2 + 58) + 'px';
  $('zz').style.top = (innerHeight * (innerHeight < 640 ? .42 : .44) - 78) + 'px';
  for (const seat of document.querySelectorAll('#ring .pf-seat')) {
    const point = points[Number(seat.dataset.seat)];
    if (!point) continue;
    seat.style.left = point.x + 'px';
    seat.style.top = point.y + 'px';
  }
}

addEventListener('resize', () => {
  reef.resize();
  if (state.view) placeRing(state.view.seats || state.seats);
});

/* ── lobby ──────────────────────────────────────────────────────────────── */

function paintIdentity(identity) {
  if (!identity) return;
  $('rating-value').textContent = String(identity.rating ?? 1200);
  $('rating-games').textContent = `${identity.games ?? 0} rated match${identity.games === 1 ? '' : 'es'}`;
  const days = Number(identity.badge?.days || identity.streak || 0);
  document.querySelectorAll('#badge-row .pf-badge').forEach(button => {
    const badge = button.dataset.badge;
    const unlocked = days >= BUDDY_DAYS[badge];
    button.disabled = !unlocked;
    if (prefs.badge === badge && !unlocked) prefs.badge = 'KRILL';
    button.setAttribute('aria-pressed', String(prefs.badge === badge));
  });
  state.sprite = BUDDIES[prefs.badge] || 'krill';
}

async function loadIdentity() {
  try { paintIdentity(await api('party/me')); } catch { /* not identified yet */ }
}

function renderRooms(payload) {
  const list = $('room-list');
  $('rooms-title').textContent = `SHOWING ${payload.total ?? payload.rooms.length}`;
  if (!payload.rooms.length) {
    list.innerHTML = '<li class="pf-empty">No public rooms right now. Host one and share its code.</li>';
    $('load-more').hidden = true;
    return;
  }
  list.innerHTML = payload.rooms.map(room => `<li><button class="pf-roomrow" data-code="${esc(room.code)}" type="button"${room.full ? ' disabled' : ''}>
    <b>${esc(room.code)}</b>
    <span><span class="name">${esc(room.name)}</span><span class="sub">${room.players}/${room.seats} · ${room.status === 'lobby' ? 'IN THE LOBBY' : 'PLAYING'}</span></span>
    <em>${room.full ? 'FULL' : 'JOIN ▸'}</em>
  </button></li>`).join('');
  $('load-more').hidden = payload.rooms.length < 50;
}

async function loadRooms(offset = 0) {
  try {
    renderRooms(await api(`party/rooms?offset=${offset}`));
    state.roomsOffset = offset;
  } catch {
    $('room-list').innerHTML = '<li class="pf-empty">The room list is unavailable right now.</li>';
  }
}

$('lobby-name').value = prefs.name;
$('lobby-name').addEventListener('input', event => {
  prefs.name = event.target.value.replace(/\s+/g, ' ').trim().slice(0, 16);
  try { localStorage.setItem('ok:partyName', prefs.name); } catch { /* private mode */ }
});
document.querySelectorAll('#badge-row .pf-badge').forEach(button => button.addEventListener('click', () => {
  prefs.badge = button.dataset.badge;
  state.sprite = BUDDIES[prefs.badge] || 'krill';
  document.querySelectorAll('#badge-row .pf-badge').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  try { localStorage.setItem('ok:partyBadge', prefs.badge); } catch { /* private mode */ }
  if (state.view) paintSeats(state.view);
}));
document.querySelectorAll('.pf-chip').forEach(chip => chip.addEventListener('click', () => {
  state.size = Number(chip.dataset.size);
  document.querySelectorAll('.pf-chip').forEach(other => other.setAttribute('aria-checked', String(other === chip)));
  $('size-note').textContent = SIZE_LABEL[state.size];
}));
function pickRated(rated) {
  state.rated = rated;
  $('rated-btn').classList.toggle('is-on', rated);
  $('quick-btn').classList.toggle('is-on', !rated);
  $('rated-btn').setAttribute('aria-pressed', String(rated));
  $('quick-btn').setAttribute('aria-pressed', String(!rated));
}
$('rated-btn').addEventListener('click', () => pickRated(true));
$('quick-btn').addEventListener('click', () => pickRated(false));
$('listed-btn').addEventListener('click', () => {
  state.listed = !state.listed;
  $('listed-btn').setAttribute('aria-pressed', String(state.listed));
  $('listed-btn').textContent = state.listed ? 'PUBLIC · LISTED' : 'PRIVATE · CODE ONLY';
  $('listed-note').textContent = state.listed ? 'anyone can join from the list' : 'friends join with the code';
});
$('code-input').addEventListener('input', event => {
  event.target.value = event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 4);
});
$('join-form').addEventListener('submit', event => { event.preventDefault(); enter($('code-input').value); });
$('room-list').addEventListener('click', event => {
  const button = event.target.closest('[data-code]');
  if (button && !button.disabled) enter(button.dataset.code);
});
$('refresh')?.addEventListener('click', () => loadRooms(0));
$('load-more').addEventListener('click', () => loadRooms(state.roomsOffset + 50));
$('host-btn').addEventListener('click', host);
$('howto-btn').addEventListener('click', () => $('howto-dialog').showModal());
$('rules-btn').addEventListener('click', () => $('howto-dialog').showModal());
$('howto-room').addEventListener('click', () => $('howto-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));

/* ── the room ───────────────────────────────────────────────────────────── */

// Hearts are a fixed row: every slot up to the room's cap is drawn, and the
// hearts a diver has lost stay behind as empty outlines.
function heartsRow(lives, maxLives) {
  const total = Math.min(5, Math.max(Number(maxLives) || 5, Number(lives) || 0, 2));
  return Array.from({ length: total }, (_, index) => `<i class="pf-heart${index < lives ? '' : ' empty'}">${HEART}</i>`).join('');
}

function meterBar(player, target) {
  const segs = Array.isArray(player.segs) && player.segs.length ? player.segs : (player.meter ? [{ tier: '', amt: player.meter }] : []);
  const bars = segs.map(seg => `<i style="width:${Math.min(100, (seg.amt / target) * 100)}%;background:${TIER_COLOR[seg.tier] || '#3a5378'}"></i>`).join('');
  return `<span class="pf-meter pf-seat-meter${Number(player.meter) >= target ? ' full' : ''}">${bars}</span>`;
}

function paintSeats(view) {
  const seats = view.seats || state.seats;
  const winnerSeat = view.winner?.seat;
  const maxLives = view.maxLives || 5;
  const target = view.heartMeter || 600;
  const spoken = new Map();
  for (const entry of view.used || []) if (entry.name) spoken.set(entry.name, entry);
  const rows = [];
  for (let i = 0; i < seats; i++) {
    const player = view.players.find(item => item.seat === i);
    if (!player) {
      rows.push(`<div class="pf-seat open" data-seat="${i}"><div class="pf-seat-in"><div class="pf-body"><div class="pf-spr-wrap"></div></div><span class="pf-meter pf-seat-meter"></span><div class="pf-plate"></div></div></div>`);
      continue;
    }
    const holding = view.status === 'playing' && view.turn?.seat === i;
    const classes = ['pf-seat'];
    if (player.you) classes.push('me');
    if (player.out) classes.push('out');
    if (holding) classes.push('hold');
    if (winnerSeat === i) classes.push('win');
    const sprite = player.you ? state.sprite : 'krill';
    const answer = view.status === 'playing' ? spoken.get(player.name) : null;
    const say = answer
      ? `<div class="pf-say rest" style="--cc:${TIER_COLOR[tierFor(answer.points)]}">${esc(answer.answer)}</div>`
      : '';
    const delta = Number(player.delta) || 0;
    const elo = `<span class="pf-elo">${player.rating ?? ''}${delta ? `<i class="${delta < 0 ? 'down' : 'up'}">${delta > 0 ? ` +${delta}` : ` ${delta}`}</i>` : ''}</span>`;
    rows.push(`<div class="${classes.join(' ')}" data-seat="${i}">
      <div class="pf-seat-in">
        <div class="pf-body"><div class="pf-spr-wrap"><img class="pf-spr" src="assets/${sprite}.svg" alt=""></div></div>
        ${meterBar(player, target)}
        ${say}
        <div class="pf-plate">
          <b class="pf-name">${esc(player.name)}${player.you ? ' (you)' : ''}</b>
          <div class="pf-row"><span class="pf-hearts">${heartsRow(player.lives, maxLives)}</span>${elo}</div>
        </div>
      </div>
    </div>`);
  }
  $('ring').innerHTML = rows.join('');
  placeRing(seats);
}

function paintHud(view) {
  const seats = view.seats || state.seats;
  $('room-code').textContent = view.code;
  $('privacy-label').textContent = view.listed ? 'PUBLIC ↔' : 'PRIVATE ↔';
  $('privacy-label').title = view.listed ? 'listed in public rooms' : 'code only';
  if (view.status === 'lobby') {
    $('room-state').textContent = 'LOBBY';
    $('hud-label').textContent = 'READY';
    $('hud-value').textContent = `${view.players.length}/${seats}`;
  } else if (view.status === 'playing') {
    $('room-state').textContent = `ROUND ${view.round}`;
    $('hud-label').textContent = 'FLOATING';
    $('hud-value').textContent = `${view.players.filter(player => !player.out).length}/${seats}`;
  } else {
    $('room-state').textContent = 'SURFACED';
    $('hud-label').textContent = 'ROUNDS';
    $('hud-value').textContent = String(view.round);
  }
}

function paintPrompt(view) {
  const card = $('prompt-card');
  const fuse = $('fuse');
  const dock = $('dock');
  const playing = view.status === 'playing' || view.status === 'finished';
  card.hidden = !playing;
  fuse.hidden = view.status !== 'playing';
  dock.hidden = view.status !== 'playing';
  $('lobbyfoot').hidden = view.status !== 'lobby';
  $('roomhead').hidden = view.status !== 'lobby';
  $('zz').hidden = view.status !== 'lobby';
  if (!playing) return;
  const text = view.prompt?.text || '';
  $('prompt-number').textContent = `CATEGORY ${view.prompt?.number ?? 1} OF ${view.prompt?.total ?? 7}`;
  $('round-tag').textContent = `ROUND ${view.round}`;
  $('prompt-text').textContent = text;
  card.classList.toggle('long', text.length > 44);
}

function paintTurn(view) {
  const mine = view.status === 'playing' && view.turnPlayer;
  const line = $('turn-line');
  if (view.status !== 'playing') {
    line.textContent = '';
  } else if (view.freeze) {
    line.innerHTML = '<b>POP!</b> a fresh fuse';
  } else if (mine) {
    line.innerHTML = '<b>YOUR TURN</b> — pass the puffer';
  } else {
    line.innerHTML = `${esc(view.turn?.name || 'someone')} holds the puffer`;
  }
  line.classList.toggle('mine', !!mine);
  $('answer').disabled = !mine;
  $('submit-btn').disabled = !mine || state.busy;
  $('answer').placeholder = mine ? 'type one answer…' : 'wait for the puffer…';
}

function paintClock() {
  const view = state.view;
  const playing = view?.status === 'playing' && view.deadline != null;
  const left = playing ? Math.max(0, (view.deadline - (Date.now() + state.offset)) / 1000) : 0;
  const total = Math.max(1, (view?.fuseTotal || 15000) / 1000);
  const burnt = playing ? Math.min(1, Math.max(0, 1 - left / total)) : 0;
  const puffer = $('puffer');
  $('puffer-count').textContent = playing ? String(Math.ceil(left)) : '';
  $('clock').textContent = playing ? String(Math.ceil(left)) : '·';
  $('fuse-fill').style.width = `${Math.round(burnt * 100)}%`;
  puffer.style.setProperty('--pf-puff', (1 + burnt * .5).toFixed(3));
  const img = puffer.querySelector('img');
  img.style.transform = `scale(${(1 + burnt * .42).toFixed(3)})`;
  puffer.classList.toggle('awake', !!playing);
  puffer.classList.toggle('hot', playing && left <= 5);
  puffer.classList.toggle('furious', playing && left <= 2.5);
  $('clock-face').classList.toggle('hot', playing && left <= 5);
}

function paintOver(view) {
  const over = view.status === 'finished';
  $('party-over').hidden = !over;
  if (!over) return;
  const winner = view.winner;
  $('party-winner').textContent = winner?.you ? 'you float last' : `${winner?.name || 'nobody'} floats last`;
  const delta = view.rating?.delta ?? 0;
  $('party-placement').textContent = view.rated
    ? `rating ${view.rating?.value ?? 1200}${delta ? ` · ${delta > 0 ? '+' : ''}${delta} this match` : ''}`
    : 'quick play · this match did not move anyone’s rating';
  const ranked = [...view.players].sort((a, b) =>
    (Number(a.out) - Number(b.out)) || (b.lives - a.lives) || (b.meter - a.meter));
  $('over-list').innerHTML = ranked.map((player, index) => `<li><span class="rank">${index + 1}</span><span class="who">${esc(player.name)}${player.you ? ' (you)' : ''}</span><span class="state">${player.out ? 'popped' : `${player.lives} ♥`}</span></li>`).join('');
  $('again-btn').hidden = !view.host;
}

// The host's LIVES / MIN. TURN / SEATS steppers write straight through to the
// room, so every diver sees the same numbers the fuse will actually use.
function nextSetting(kind, dir) {
  const players = state.view?.players?.length ?? 1;
  if (kind === 'seats') {
    const index = SEAT_CHOICES.indexOf(state.seats);
    if (index < 0) return null;
    const next = SEAT_CHOICES[Math.max(0, Math.min(SEAT_CHOICES.length - 1, index + dir))];
    return next === state.seats || next < players ? null : next;
  }
  if (kind === 'lives') {
    const next = Math.max(1, Math.min(5, state.lives + dir));
    return next === state.lives ? null : next;
  }
  const next = Math.max(TURN_MIN, Math.min(TURN_MAX, state.minTurn + dir));
  return next === state.minTurn ? null : next;
}

function paintSettings(view) {
  state.lives = Number(view.lives) || state.lives;
  state.minTurn = Number(view.minTurn) || state.minTurn;
  state.seats = Number(view.seats) || state.seats;
  $('lives-value').textContent = String(state.lives);
  $('minturn-value').textContent = `${state.minTurn}s`;
  $('seats-value').textContent = String(state.seats);
  const editable = !!view.host && view.status === 'lobby';
  document.querySelectorAll('[data-step]').forEach(button => {
    button.disabled = !editable || nextSetting(button.dataset.step, Number(button.dataset.dir)) === null;
  });
}

function paint(view) {
  if (!view || !view.code || !Array.isArray(view.players)) { if (state.code) leaveRoom(); return; }
  state.view = view;
  state.offset = (view.serverNow || Date.now()) - Date.now();
  paintHud(view);
  paintSeats(view);
  paintPrompt(view);
  paintTurn(view);
  paintOver(view);
  paintClock();
  paintSettings(view);
  $('ready-line').textContent = `${view.players.length} READY · ${Math.max(0, (view.seats || state.seats) - view.players.length)} OPEN`;
  const start = $('start-btn');
  if (view.status === 'lobby') {
    start.hidden = false;
    start.disabled = !view.host || view.players.length < 2;
    start.textContent = view.host ? '▼ WAKE THE PUFFER ▼' : 'WAITING FOR THE HOST';
  } else {
    start.hidden = true;
  }
}

function stopRoom() {
  clearInterval(state.poll);
  clearInterval(state.ticker);
  state.poll = state.ticker = null;
  state.live?.close();
  state.live = null;
}

function openChannel() {
  state.live?.close();
  state.live = connectParty({
    code: state.code, name: prefs.name,
    onStatus: value => { if (value === 'disconnected') paintPresenceNote('reconnecting…'); },
    onMessage: message => { if (message.type === 'broadcast') sync(); },
  });
}
function paintPresenceNote(note) { status(note, ''); }

async function sync() {
  if (!state.code) return;
  try {
    paint(await api('party/room?code=' + state.code));
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      stopRoom();
      showLobby();
      status('You are not in that room any more.', 'bad');
      loadRooms();
    }
  }
}

function scheduleSync() {
  clearInterval(state.poll);
  state.poll = setInterval(sync, 1500);
  clearInterval(state.ticker);
  state.ticker = setInterval(paintClock, 100);
}

function showLobby() {
  stopRoom();
  state.code = '';
  state.view = null;
  $('room').hidden = true;
  $('lobby').hidden = false;
  $('party-over').hidden = true;
  reef.seats = [];
  history.replaceState({}, '', 'party.html');
  loadIdentity();
  loadRooms(0);
}

async function enter(rawCode) {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { status('A room code is four letters.', 'bad'); return; }
  try {
    openRoom(await api('party/join', { code, name: prefs.name }), code);
  } catch (error) {
    status(error.status === 404 ? 'No room with that code.' : error.message, 'bad');
    loadRooms();
  }
}

async function host() {
  if (state.busy) return;
  state.busy = true;
  $('host-btn').disabled = true;
  try {
    const view = await api('party/create', { seats: state.size, rated: state.rated, listed: state.listed, name: prefs.name });
    openRoom(view, view.code);
  } catch (error) {
    status(error.message, 'bad');
  } finally {
    state.busy = false;
    $('host-btn').disabled = false;
  }
}

function openRoom(view, code) {
  state.code = code;
  state.seats = view.seats || state.size;
  $('lobby').hidden = true;
  $('room').hidden = false;
  $('lobby').scrollTop = 0;
  history.replaceState({}, '', 'party.html?code=' + code);
  status('');
  paint(view);
  openChannel();
  scheduleSync();
}

async function act(path, data = {}) {
  try {
    const view = await api(path, { code: state.code, ...data });
    if (view.gone) { showLobby(); status('You left the room.'); return; }
    paint(view);
    state.live?.broadcast?.();
    status('');
  } catch (error) {
    status(error.message, 'bad');
    if (error.status === 409) sync();
  }
}

// Leaving a finished room is not always acknowledged by the server (there is
// nothing left to remove), so the room is dropped here either way.
async function leaveRoom() {
  try { await api('party/leave', { code: state.code }); } catch { /* already out */ }
  showLobby();
}

document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  const next = nextSetting(button.dataset.step, Number(button.dataset.dir));
  if (next !== null) act('party/settings', { [button.dataset.step]: next });
}));

// Inside Bored the dive is an inline document in the game frame, and this page
// is a real navigation away from it. Stepping back restores that dive with the
// hub's helpers intact. A room link opened on its own has no dive behind it, so
// the link's own address opens Bored on Krillion instead.
$('back-link')?.addEventListener('click', event => {
  if (window.parent === window || history.length < 2) return;
  event.preventDefault();
  history.back();
});

$('start-btn').addEventListener('click', () => act('party/start'));
$('again-btn').addEventListener('click', () => act('party/start'));
$('leave-btn').addEventListener('click', () => {
  if (state.view?.status === 'playing') $('leave-dialog').showModal();
  else leaveRoom();
});
$('keep-btn').addEventListener('click', () => $('leave-dialog').close());
$('confirm-leave').addEventListener('click', () => { $('leave-dialog').close(); leaveRoom(); });
$('over-leave').addEventListener('click', () => leaveRoom());

function inviteLink() {
  return state.code ? new URL('party.html?code=' + state.code, location.href).href : '';
}
$('invite-btn').addEventListener('click', () => {
  $('invite-link').textContent = inviteLink();
  $('invite-dialog').showModal();
});
$('copy-btn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(inviteLink()); status('Invite link copied.'); }
  catch { status(inviteLink()); }
});
$('invite-copy').addEventListener('click', async () => {
  const button = $('invite-copy');
  try {
    await navigator.clipboard.writeText(inviteLink());
    button.textContent = 'COPIED';
  } catch {
    button.textContent = 'PRESS ⌘C';
  }
  setTimeout(() => { button.textContent = 'COPY INVITE LINK'; }, 1800);
});

$('answer-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('answer');
  const answer = input.value.trim();
  if (!answer || state.busy) return;
  state.busy = true;
  $('submit-btn').disabled = true;
  try {
    const view = await api('party/answer', { code: state.code, answer });
    input.value = '';
    paint(view);
    status('');
  } catch (error) {
    status(error.message, 'bad');
    sync();
  } finally {
    state.busy = false;
    paintTurn(state.view || {});
  }
});

loadIdentity();
loadRooms(0);
setInterval(() => { if (!$('lobby').hidden) loadRooms(0); }, 6000);
const initial = new URLSearchParams(location.search).get('code');
if (initial) enter(initial);

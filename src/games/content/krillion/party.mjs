// Puffer Party client. Everything rendered here comes from the server snapshot;
// the WebSocket only carries presence and a revision nudge, so the browser can
// never invent a turn, a heart or an answer.
import { connectParty } from './party-live.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIZE_LABEL = { 2: '1v1 · 2 divers', 3: '3 divers', 6: '4 to 6 players', 10: '8 to 10 players' };
const state = { code: '', view: null, offset: 0, live: null, presence: 0, poll: null, ticker: null, busy: false, size: 6, rated: true, listed: true, offsetRooms: 0 };
const settings = { name: '' };
try { settings.name = localStorage.getItem('ok:partyName') || ''; } catch { /* private mode */ }

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
  if (!response.ok) { const error = new Error(body.error || 'The signal is lost. Please retry.'); error.status = response.status; throw error; }
  return body;
}
function status(message, tone = '') {
  for (const id of ['lobby-status', 'party-status']) {
    const line = $(id);
    if (!line) continue;
    line.textContent = message;
    line.dataset.tone = tone;
  }
}

function paintPresence(note = '') {
  const line = $('room-presence');
  if (!line) return;
  const count = Math.max(1, state.presence);
  line.textContent = note || `${count} diver${count === 1 ? '' : 's'} connected · live water`;
}

function paintIdentity(identity) {
  if (!identity) return;
  const badge = identity.badge?.name ?? 'KRILL';
  document.querySelectorAll('#badge-row .badge').forEach(item => item.classList.toggle('is-on', item.dataset.badge === badge));
  $('rating-value').textContent = String(identity.rating ?? 1200);
  const days = identity.badge?.days ? ` · ${identity.badge.days}-day badge` : '';
  $('identity-line').textContent = `Rating ${identity.rating ?? 1200} · ${badge}${days}${identity.streak ? ` · ${identity.streak}-day streak` : ''}`;
  $('rating-note').textContent = `${identity.games ?? 0} rated match${identity.games === 1 ? '' : 'es'} · saved in this browser`;
}

function paintTurn() {
  const view = state.view;
  if (!view) return;
  const playing = view.status === 'playing';
  const mine = playing && view.turnPlayer;
  $('turn-line').textContent = playing
    ? (view.freeze ? 'POP! New fuse…' : mine ? 'YOUR TURN — pass the puffer' : `${view.turn?.name ?? 'Someone'}'S TURN`)
    : view.status === 'lobby' ? 'Waiting for the host to start.' : 'The puffer has settled.';
  $('turn-line').classList.toggle('mine', mine);
  $('party-answer').disabled = !mine;
  $('party-submit').disabled = !mine || state.busy;
  $('party-answer').placeholder = mine ? 'type one answer…' : 'wait for the puffer…';
  document.querySelectorAll('#party-players li').forEach(item => item.classList.toggle('current', playing && item.dataset.turn === '1'));
}

function paintClock() {
  const view = state.view;
  const playing = view?.status === 'playing' && view.deadline != null;
  const left = playing ? Math.max(0, (view.deadline - (Date.now() + state.offset)) / 1000) : 0;
  $('puffer-count').textContent = playing ? String(Math.ceil(left)) : '·';
  const total = Math.max(1, (view?.fuseTotal || 15000) / 1000);
  const burnt = playing ? Math.min(1, 1 - left / total) : 0;
  $('fuse-fill').style.width = `${Math.round(burnt * 100)}%`;
  $('puffer').style.setProperty('--puff', (1 + burnt * 0.45).toFixed(3));
  $('puffer').classList.toggle('spined', playing && left <= 5);
  $('puffer').classList.toggle('hot', playing && left <= 2);
}

function paint(view) {
  state.view = view;
  state.offset = view.serverNow - Date.now();
  $('room-code').textContent = view.code;
  $('room-state').textContent = view.status === 'lobby' ? 'IN THE LOBBY' : view.status === 'playing' ? (view.rated ? 'RATED · PLAYING' : 'PLAYING') : 'GAME OVER';
  $('party-prompt-number').textContent = view.status === 'lobby' ? 'WAITING FOR DIVERS' : `CATEGORY ${view.prompt.number} OF ${view.prompt.total} · ROUND ${view.round}`;
  $('party-prompt').textContent = view.status === 'lobby' ? 'The category opens when the host starts the party.' : view.prompt.text;
  $('party-players').innerHTML = view.players.map(player => `<li data-turn="${view.turn && view.turn.seat === player.seat ? '1' : '0'}" class="${player.you ? 'you' : ''} ${player.out ? 'out' : ''}"><span class="party-name">${esc(player.name)}${player.you ? ' (you)' : ''}</span><span class="party-hearts">${player.out ? 'POPPED' : '♥'.repeat(Math.max(0, player.lives))}</span><span class="party-pearls">${player.meter ? `✦${player.meter}` : ''}</span></li>`).join('');
  $('meter-line').textContent = view.me ? `meter ${view.me.meter}/${view.heartMeter} · ${view.me.meter >= view.heartMeter - 1 ? 'one answer from a heart' : `${view.heartMeter - view.me.meter} to an extra heart`}` : '';
  $('party-used').innerHTML = view.used.length
    ? view.used.map(entry => `<li><span>${esc(entry.answer)}</span><small>${esc(entry.name)} · +${entry.points}</small></li>`).join('')
    : '<li>Nothing on the table yet.</li>';
  $('party-log').innerHTML = view.log.map(line => `<li>${esc(line)}</li>`).join('') || '<li>Nothing has happened yet.</li>';
  const over = view.status === 'finished';
  $('party-over').hidden = !over;
  $('party-start-btn').hidden = !(view.host && view.status === 'lobby');
  if (over) {
    $('party-winner').textContent = view.winner?.you ? 'You float last! 🌟' : `${view.winner?.name ?? 'Nobody'} floats last.`;
    const delta = view.rating?.delta ?? 0;
    $('party-placement').textContent = view.rated ? `Rating ${view.rating?.value ?? 1200}${delta ? ` (${delta >= 0 ? '+' : ''}${delta} this match)` : ''}` : 'Quick play — this match did not move anyone’s rating.';
    $('again-btn').hidden = !view.host;
  }
  paintTurn();
  paintPresence();
  paintClock();
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
    code: state.code, name: settings.name,
    onStatus: value => {
      if (value === 'connected') paintPresence();
      if (value === 'unauthorized') paintPresence('live water unavailable');
      if (value === 'disconnected') paintPresence('reconnecting…');
    },
    onMessage: message => {
      if (message.type === 'broadcast') sync();
      if (message.type === 'presence') { state.presence = message.members.length; paintPresence(); }
    },
  });
}

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
  history.replaceState({}, '', 'party.html');
  loadIdentity();
}

async function enter(rawCode) {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { status('A room code is four letters.', 'bad'); return; }
  try {
    const view = await api('party/join', { code, name: settings.name });
    state.code = code;
    $('lobby').hidden = true;
    $('room').hidden = false;
    history.replaceState({}, '', 'party.html?code=' + code);
    status('');
    paint(view);
    openChannel();
    scheduleSync();
  } catch (error) {
    status(error.status === 404 ? 'No room with that code.' : error.message, 'bad');
    loadRooms();
  }
}

async function host() {
  if (state.busy) return;
  state.busy = true;
  try {
    const view = await api('party/create', { seats: state.size, rated: state.rated, listed: state.listed, name: settings.name });
    state.code = view.code;
    $('lobby').hidden = true;
    $('room').hidden = false;
    history.replaceState({}, '', 'party.html?code=' + view.code);
    status('');
    paint(view);
    openChannel();
    scheduleSync();
  } catch (error) {
    status(error.message, 'bad');
  } finally {
    state.busy = false;
    paintTurn();
  }
}

function renderRooms(payload) {
  const list = $('room-list');
  $('rooms-title').textContent = `PUBLIC ROOMS SHOWING ${payload.total ?? payload.rooms.length}`;
  if (!payload.rooms.length) { list.innerHTML = '<li class="muted">No public rooms right now. Host one and share its code.</li>'; $('load-more').hidden = true; return; }
  list.innerHTML = payload.rooms.map(room => `<li><button class="party-room-btn" data-code="${esc(room.code)}" type="button"><strong>${esc(room.code)}</strong><span class="room-name">${esc(room.name)}</span><span class="room-count">${room.players}/${room.seats}</span><small>${room.status === 'lobby' ? 'IN THE LOBBY' : 'PLAYING'}</small><em>${room.full ? 'FULL' : 'JOIN ▸'}</em></button></li>`).join('');
  $('load-more').hidden = payload.rooms.length < 50;
}

async function loadRooms(offset = 0) {
  try {
    const payload = await api(`party/rooms?offset=${offset}`);
    renderRooms(payload);
    state.offsetRooms = offset;
  } catch {
    $('room-list').innerHTML = '<li class="muted">The room list is unavailable right now.</li>';
  }
}

async function loadIdentity() {
  try { paintIdentity(await api('party/me')); } catch { /* not identified yet */ }
}

async function act(path, data = {}) {
  try {
    const view = await api(path, { code: state.code, ...data });
    if (view.gone) { showLobby(); status('You left the room.'); loadRooms(); return; }
    paint(view);
    state.live?.broadcast?.();
    status('');
  } catch (error) {
    status(error.message, 'bad');
    if (error.status === 409) sync();
  }
}

$('lobby-name').value = settings.name;
$('lobby-name').addEventListener('input', event => {
  settings.name = event.target.value.replace(/\s+/g, ' ').trim().slice(0, 16);
  try { localStorage.setItem('ok:partyName', settings.name); } catch { /* private mode */ }
});
document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  state.size = Number(chip.dataset.size);
  document.querySelectorAll('.chip').forEach(other => other.classList.toggle('is-on', other === chip));
  $('size-note').textContent = SIZE_LABEL[state.size];
}));
$('rated-btn').addEventListener('click', () => {
  state.rated = true;
  $('rated-btn').classList.add('is-on'); $('rated-btn').setAttribute('aria-pressed', 'true');
  $('quick-btn').classList.remove('is-on'); $('quick-btn').setAttribute('aria-pressed', 'false');
});
$('quick-btn').addEventListener('click', () => {
  state.rated = false;
  $('quick-btn').classList.add('is-on'); $('quick-btn').setAttribute('aria-pressed', 'true');
  $('rated-btn').classList.remove('is-on'); $('rated-btn').setAttribute('aria-pressed', 'false');
});
$('listed-btn').addEventListener('click', () => {
  state.listed = !state.listed;
  $('listed-btn').setAttribute('aria-pressed', String(!state.listed));
  $('listed-btn').innerHTML = state.listed ? 'PUBLIC · LISTED <small>anyone can join from the list</small>' : 'PRIVATE · CODE ONLY <small>friends join with the code</small>';
});
$('host-btn').addEventListener('click', host);
$('refresh-btn').addEventListener('click', () => loadRooms(0));
$('load-more').addEventListener('click', () => loadRooms(state.offsetRooms + 50));
$('howto-btn').addEventListener('click', () => $('howto-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
$('join-form').addEventListener('submit', event => { event.preventDefault(); enter($('code-input').value); });
$('room-list').addEventListener('click', event => {
  const button = event.target.closest('[data-code]');
  if (button) enter(button.dataset.code);
});
$('party-start-btn').addEventListener('click', () => act('party/start'));
// Inside Bored the dive is an inline document in the game frame, and this page
// is a real navigation away from it. Stepping back restores that dive with the
// hub's helpers intact. A room link opened on its own has no dive behind it, so
// the link's own address opens Bored on Krillion instead.
$('back-link')?.addEventListener('click', event => {
  if (window.parent === window || history.length < 2) return;
  event.preventDefault();
  history.back();
});
$('again-btn').addEventListener('click', () => act('party/start'));
$('leave-btn').addEventListener('click', () => act('party/leave'));
$('copy-btn').addEventListener('click', async () => {
  const link = new URL('party.html?code=' + state.code, location.href).href;
  try { await navigator.clipboard.writeText(link); status('Room link copied.'); }
  catch { status(link); }
});
$('party-answer-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('party-answer');
  const answer = input.value.trim();
  if (!answer || state.busy) return;
  state.busy = true;
  $('party-submit').disabled = true;
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
    paintTurn();
  }
});

loadRooms(0);
loadIdentity();
setInterval(() => { if (!$('lobby').hidden) loadRooms(0); }, 6000);
const initial = new URLSearchParams(location.search).get('code');
if (initial) enter(initial);

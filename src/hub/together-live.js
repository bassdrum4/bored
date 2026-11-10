import { hasIdentity, getSession, freshSession, realtimeURL } from './backend.js';
import { liveRPC } from './together-api.js';
import { subscribeChanges } from './realtime.js';

// Games that can be played live in Bored Together: everyone in the room plays the same game at the same time,
// from one ordered log of actions. A room is the host plus min to max invited members (CPUs fill the rest). A room
// opened from Civ Lite's Multiplayer screen can be as small as the host and a friend with a code (see together-lobby.js).
export const TOGETHER_LIVE = Object.freeze({
  ashcrown: { min: 1, max: 3 }
});

// The six characters a room code is made of, from what somebody typed or pasted (even a whole invite, "Join my Civ Lite
// game on Bored: code KX7Q2M"): after the word "code" when there is one, upper case, without spaces or dashes.
export function roomCodeFrom(text) {
  const t = String(text || ''), m = /\bcode\b[\s:]*([A-Za-z0-9][A-Za-z0-9 -]*)/i.exec(t);
  return (m ? m[1] : t).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

// What a new room starts with. The host changes it in the game's own setup screen before starting.
export const LIVE_DEFAULTS = Object.freeze({
  map: 'pangaea', size: 'auto', level: 'normal', borders: 'tech', turns: 100, cpus: 1, timer: 0,
  wrap: false, conquest: true, science: true, unjoined: 'cpu'
});

// Serialized into the game's document before its script runs, like the turn-based bridge. The game gets two
// things: call(op, payload), which answers with the hub's result, and on(fn), which hears what the hub pushes.
// It never sees a token, a URL or the network.
function liveBridge(channel) {
  let serial = 0, listener = null;
  const waiting = new Map(), early = [];
  window.__boredLive = {
    call(op, payload) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        waiting.set(id, { resolve, reject });
        parent.postMessage({ type: 'bored:live-call', channel, id, op, payload: payload || {} }, '*');
      });
    },
    on(fn) {
      listener = fn;
      while (early.length) fn(early.shift());
    }
  };
  addEventListener('message', event => {
    const m = event.data;
    if (event.source !== parent || !m || m.channel !== channel) return;
    if (m.type === 'bored:live-result') {
      const task = waiting.get(m.id);
      if (!task) return;
      waiting.delete(m.id);
      if (m.error) task.reject(new Error(m.error)); else task.resolve(m.result);
    } else if (m.type === 'bored:live-event') {
      if (listener) listener(m.event); else early.push(m.event);
    }
  });
}

const isNetwork = error => !error || !error.status || error.status >= 500 || error.status === 408;

// The part of a room's state that matters to the lobby screen: who is in, what they picked, the setup.
// Seconds-since-seen and round clocks change on every read and would make every poll look like news.
function lobbyKey(game) {
  if (!game) return '';
  return JSON.stringify([game.status, game.config, game.start, game.code, game.capacity, (game.seats || []).map(s => [s.seat, s.user, s.state, s.civ, s.controller, s.online])]);
}
function seatsKey(seats) {
  return JSON.stringify((seats || []).map(s => [s.seat, s.controller, s.online]));
}

// The protocol between one screen and the room, with everything it needs injected so it can be tested without a
// browser, a clock or a network:
//   rpc(action, args)    one call to the room's endpoint (the room's id is added here)
//   subscribe(options)   Realtime for the action table, or null when there is none
//   emit(event)          what the page is told: game, actions, presence, net
//   exit() / reload()    close this screen / open it again from the last snapshot
export function createLiveSession({ id, owner, rpc, subscribe, emit, exit, reload, notify, clock = Date.now, uuid = () => crypto.randomUUID(), timers = {}, intervals = {} }) {
  const every = intervals.every || { lobby: 2000, fallback: 1000, heartbeat: 10000, presence: 9000 };
  const later = timers.setTimeout || setTimeout, clear = timers.clearTimeout || clearTimeout;
  const repeat = timers.setInterval || setInterval, stopRepeat = timers.clearInterval || clearInterval;
  let game = null, delivered = null, head = 0, stopped = false, active = false, socketOpen = false, realtime = null;
  let syncing = null, again = false, lobbyTimer = 0, fallbackTimer = 0, beatTimer = 0;
  let online = true, failures = 0, seats = '', seatsAt = 0, reloads = [];
  let pingHead = null, pinging = null;   // co-op map pings: the newest one heard, and a poll under way
  const buffer = new Map();

  const tell = event => { if (!stopped) { try { emit(event); } catch (error) { /* the page's problem */ } } };
  const normal = a => ({ seq: Number(a.seq), seat: Number(a.seat), type: String(a.type),
    args: typeof a.args === 'string' ? JSON.parse(a.args) : (a.args || {}) });

  function worked() {
    failures = 0;
    if (!online) { online = true; tell({ event: 'net', online: true }); if (realtime && realtime.reconnect) realtime.reconnect(); }
  }
  function failed(error) {
    if (!isNetwork(error)) return;
    failures += 1;
    if (failures >= 2 && online) { online = false; tell({ event: 'net', online: false }); }
  }
  async function api(action, args) {
    try {
      const result = await rpc(action, Object.assign({ id }, args || {}));
      worked();
      return result;
    } catch (error) { failed(error); throw error; }
  }

  /* ── the lobby ─────────────────────────────────────────────────────────── */

  function setGame(next, announce) {
    const changed = lobbyKey(next) !== lobbyKey(game);
    game = next;
    if (announce && changed) tell({ event: 'game', game: next });
    if (next.status !== 'lobby') stopLobby();
  }
  function watchLobby() {
    if (lobbyTimer || stopped) return;
    lobbyTimer = repeat(async () => {
      try { setGame(await api('game', {}), true); } catch (error) {
        // The host removed this player: the room does not list them any more, so there is nothing to wait for.
        if (error && (error.status === 403 || error.code === '42501') && /not in this game/i.test(error.message || '')) { stopLobby(); tell({ event: 'removed' }); }
        /* anything else: the next look tries again */
      }
    }, every.lobby);
  }
  function stopLobby() { if (lobbyTimer) { stopRepeat(lobbyTimer); lobbyTimer = 0; } }

  /* ── the action log ────────────────────────────────────────────────────── */

  // Hands the page every action it is owed, in order, once. A hole means one is still on its way or was lost:
  // ask the server for it instead of guessing.
  function flush() {
    if (delivered === null || stopped) return;
    const out = [];
    while (buffer.has(delivered + 1 + out.length)) out.push(buffer.get(delivered + 1 + out.length));
    for (const seq of [...buffer.keys()]) if (seq <= delivered + out.length) buffer.delete(seq);
    if (out.length) { delivered += out.length; tell({ event: 'actions', actions: out }); }
    if (buffer.size) catchUp();
  }
  function ingest(list) {
    for (const a of list) {
      if (!a || !Number.isInteger(Number(a.seq))) continue;
      const row = normal(a);
      if (delivered === null || row.seq > delivered) buffer.set(row.seq, row);
    }
    flush();
  }
  function presence(r, force) {
    if (!r || !Array.isArray(r.seats)) return;
    const key = seatsKey(r.seats), now = clock();
    if (!force && key === seats && now - seatsAt < every.presence) return;
    seats = key; seatsAt = now;
    tell({ event: 'presence', seats: r.seats, round: r.round, round_age: r.round_age, timer: r.timer });
  }
  function seeHead(r) {
    if (r && Number.isInteger(r.head)) { head = r.head; if (delivered !== null && head > delivered) catchUp(); }
  }
  // Reads the log after what the page has. One read at a time; a request that arrives meanwhile reruns it.
  function catchUp() {
    if (delivered === null || stopped) return Promise.resolve();
    if (syncing) { again = true; return syncing; }
    syncing = (async () => {
      try {
        do {
          again = false;
          const r = await api('sync', { after: delivered, limit: 500 });
          if (stopped) return;
          presence(r);
          ingest(r.actions || []);
          if (r.status && r.status !== 'active') { if (game) game.status = r.status; settle(); }
          if ((r.actions || []).length >= 500) again = true;
        } while (again && !stopped);
      } catch (error) { /* the next poll tries again */ }
      finally { syncing = null; }
    })();
    return syncing;
  }
  async function heartbeat() {
    try {
      const r = await api('heartbeat', { after: delivered === null ? 0 : delivered });
      presence(r, true);
      seeHead(r);
      if (r.status && r.status !== 'active') settle();
    } catch (error) { /* the next one tries again */ }
  }

  // Map pings are not game actions and never touch the log. They come in over Realtime, or by polling when there is no
  // socket, and go to the page as they are. Only co-op rooms have them.
  const coop = () => !!(game && game.config && game.config.mode === 'coop');
  function hearPing(r) {
    if (!r || !Number.isInteger(Number(r.id)) || !coop()) return;
    const id = Number(r.id);
    if (pingHead !== null && id <= pingHead) return;
    pingHead = id;
    const seat = Number(r.seat), x = Number(r.x), y = Number(r.y);
    if (Number.isInteger(seat) && Number.isInteger(x) && Number.isInteger(y)) tell({ event: 'ping', seat, x, y });
  }
  // The first read only learns where the pings stand, so a ping from before this screen opened is not shown late.
  function pollPings() {
    if (pinging || stopped || !coop()) return pinging;
    pinging = (async () => {
      try {
        const first = pingHead === null;
        const r = await api('pings', first ? {} : { after: pingHead });
        if (stopped) return;
        if (first) { pingHead = Number(r.head) || 0; return; }
        for (const p of r.pings || []) hearPing(p);
      } catch (error) { /* the next poll tries again */ }
      finally { pinging = null; }
    })();
    return pinging;
  }

  // The room is running: listen for new actions, and keep poking the server so the others know we are here.
  function activate() {
    if (active || stopped) return;
    active = true;
    stopLobby();
    if (subscribe) {
      realtime = subscribe({
        topic: 'live-' + id,
        changes: [{ event: 'INSERT', schema: 'bored_live', table: 'actions', filter: 'game_id=eq.' + id }].concat(
          coop() ? [{ event: 'INSERT', schema: 'bored_live', table: 'pings', filter: 'game_id=eq.' + id }] : []),
        onChange: (record, change) => (change && change.table === 'pings' ? hearPing(record) : ingest([record])),
        onState: open => { socketOpen = open; if (open) catchUp(); }
      });
    }
    // Without a socket the log is read once a second; with one it is only the heartbeat's check that nothing slipped by.
    fallbackTimer = repeat(() => { if (!socketOpen) { catchUp(); pollPings(); } }, every.fallback);
    beatTimer = repeat(heartbeat, every.heartbeat);
  }
  // The game has ended or been cancelled: nothing more will come.
  function settle() {
    stopLobby();
    if (fallbackTimer) { stopRepeat(fallbackTimer); fallbackTimer = 0; }
    if (beatTimer) { stopRepeat(beatTimer); beatTimer = 0; }
    if (realtime) { realtime.close(); realtime = null; socketOpen = false; }
  }

  // Everything after a point in the log, however many pages of it there are.
  async function readFrom(after) {
    const list = [];
    let last = null, from = after;
    for (let round = 0; round < 200; round++) {
      const r = await api('sync', { after: from, limit: 1000 });
      last = r;
      for (const a of r.actions || []) {
        const row = normal(a);
        if (row.seq !== from + 1) throw new Error('The game log has a gap. Open the game again.');
        list.push(row); from = row.seq;
      }
      if ((r.actions || []).length < 1000) break;
    }
    return { list, last, after: from };
  }

  /* ── what the page asks for ────────────────────────────────────────────── */

  async function hello() {
    let g = await api('game', {});
    if (g.status === 'lobby' && g.me !== null && g.me !== undefined) {
      const mine = (g.seats || []).find(s => s.seat === g.me);
      if (mine && mine.state === 'invited') g = await api('join', {});
    }
    game = g;
    const out = { game: g, host: g.host === owner, snapshot: null, actions: [], presence: null };
    if (g.status === 'lobby') { watchLobby(); return out; }
    if (g.status !== 'active' && g.status !== 'completed') return out;
    let after = 0;
    if (g.snapshot) {
      const loaded = await api('load', {});
      if (loaded && loaded.snapshot) { out.snapshot = loaded.snapshot; after = loaded.snapshot.seq; }
    }
    // Hear new actions from here on before reading the old ones, so nothing falls between the two.
    delivered = null; buffer.clear();
    if (g.status === 'active') activate();
    const read = await readFrom(after);
    out.actions = read.list;
    out.presence = read.last && Array.isArray(read.last.seats)
      ? { seats: read.last.seats, round: read.last.round, round_age: read.last.round_age, timer: read.last.timer } : null;
    seats = out.presence ? seatsKey(out.presence.seats) : ''; seatsAt = clock();
    delivered = read.after;
    if (g.status === 'completed') settle();
    later(flush, 0);
    return out;
  }

  async function send(p) {
    if (!p || typeof p.type !== 'string') throw new Error('Nothing to send.');
    // One id for every try, so an answer that was lost on the way back does not become two actions.
    const request = uuid();
    let last = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const r = await api('send', { type: p.type, args: p.args || {}, request_id: request });
        if (r && Number.isInteger(r.head)) seeHead(r);
        return r;
      } catch (error) {
        last = error;
        if (!isNetwork(error) || stopped) throw error;
        await new Promise(done => later(done, Math.min(400 * 2 ** attempt, 4000)));
      }
    }
    throw last;
  }

  function limitedReload(p) {
    const now = clock();
    reloads = reloads.filter(t => now - t < 120000);
    if (reloads.length >= 3) {
      if (notify) notify('This game keeps drifting out of step. Leave it and open it again from Your Games.');
      return {};
    }
    reloads.push(now);
    later(() => reload(p && p.round), 50);
    return {};
  }

  async function call(op, p) {
    if (stopped) throw new Error('This game is closed.');
    p = p && typeof p === 'object' ? p : {};
    switch (op) {
      case 'hello': return hello();
      case 'game': { const g = await api('game', {}); setGame(g, false); return g; }
      case 'lobby': {
        const args = {};
        if (p.config) args.config = p.config;
        if ('civ' in p) args.civ = p.civ;
        if ('ready' in p) args.ready = !!p.ready;
        const g = await api('lobby_set', args);
        setGame(g, false);
        return g;
      }
      // The host's two lobby tools for a room code: a new code (the old one stops working) and removing a player
      // (who stays out for as long as the room's code lasts). The server checks it is the host and the lobby.
      case 'new-code': { const g = await api('new_code', {}); setGame(g, false); return g; }
      case 'kick': {
        const seat = p.seat;
        if (!Number.isInteger(seat) || seat < 0 || seat > 7) throw new Error('Nobody to remove.');
        const g = await api('kick', { seat }); setGame(g, false); return g;
      }
      case 'start': { const g = await api('start', {}); setGame(g, false); return g; }
      case 'leave': { const g = await api('leave_lobby', {}); setGame(g, false); return g; }
      case 'send': return send(p);
      case 'ping': {
        if (!coop()) throw new Error('Pings are for co-op games.');
        const x = Number(p.x), y = Number(p.y);
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 255 || y > 255) throw new Error('Nothing to ping.');
        return api('ping', { x, y });
      }
      case 'report': return api('report', { round: p.round, hash: p.hash });
      case 'snapshot': return api('snapshot', { round: p.round, seq: p.seq, hash: p.hash, state: p.state });
      // One claim does not end a game: the room stays open (and on the heartbeat) until the server says it is over.
      case 'finish': { const g = await api('finish', { winner: p.winner, why: p.why }); if (!g || g.status !== 'active') settle(); return g; }
      case 'reload': return limitedReload(p);
      case 'resync':
        if (delivered !== null) { delivered = Math.max(0, Math.min(delivered, Number(p.after) || 0)); buffer.clear(); catchUp(); }
        return {};
      case 'exit': later(exit, 0); return {};
      default: throw new Error('Unknown operation.');
    }
  }

  return {
    call,
    stop() {
      stopped = true;
      stopLobby();
      if (fallbackTimer) stopRepeat(fallbackTimer);
      if (beatTimer) stopRepeat(beatTimer);
      if (realtime) realtime.close();
      realtime = null;
    },
    // The network is back or the tab is visible again: look now instead of at the next tick.
    wake() {
      if (stopped || !active) return;
      if (realtime && realtime.reconnect) realtime.reconnect();
      catchUp();
      heartbeat();
    },
    // For tests and the status line: what the session believes right now.
    state: () => ({ delivered, head, active, socketOpen, online, game })
  };
}

// The screen's side: puts the bridge into the game's document and passes messages across, checking who sent them.
export function createLivePlayer({ game, owner, frame, close, back, onExit, notify, reload, deps = {} }) {
  if (!game || !TOGETHER_LIVE[game.game]) throw new Error('This game is not available live yet.');
  const channel = crypto.randomUUID();
  let disposed = false;
  const identity = () => !disposed && hasIdentity() && getSession()?.user?.id === owner;
  const post = message => { try { frame.contentWindow?.postMessage(Object.assign({ channel }, message), '*'); } catch (error) { /* the frame is gone */ } };
  const session = createLiveSession({
    id: game.id, owner,
    rpc: deps.rpc || liveRPC,
    subscribe: deps.subscribe || (options => subscribeChanges(Object.assign({
      url: realtimeURL(),
      getToken: async () => (await freshSession())?.access_token || ''
    }, options))),
    emit: event => post({ type: 'bored:live-event', event }),
    // Leaving a live game goes back to Civ Lite's title screen when the caller gives a way there, and out otherwise.
    exit: () => { if (!disposed) (back || close)(); },
    reload: () => { if (!disposed) reload(); },
    notify
  });
  const wake = () => { if (!document.hidden) session.wake(); };
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', wake);
  return {
    isOwner: identity,
    mode: 'live',
    session,
    stop() { session.stop(); },
    document(html) {
      const json = JSON.stringify([channel]).replace(/</g, '\\u003c');
      return html.replace(/<head([^>]*)>/i, head => head + '<script>(' + liveBridge.toString() + ')(...' + json + ');<\/script>');
    },
    async message(event) {
      const request = event.data;
      if (!identity() || event.source !== frame.contentWindow || request?.channel !== channel || request.type !== 'bored:live-call') return;
      try {
        const result = await session.call(request.op, request.payload);
        if (identity()) post({ type: 'bored:live-result', id: request.id, result: result === undefined ? null : result });
      } catch (error) {
        if (identity()) post({ type: 'bored:live-result', id: request.id, error: String((error && error.message) || 'Something went wrong.') });
      }
    },
    dispose() {
      disposed = true;
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      session.stop();
      onExit();
    }
  };
}

import { hasIdentity, getSession, getHandle } from './backend.js';
import { liveRPC, togetherRPC } from './together-api.js';

// Civ Lite's Multiplayer screen (5.2). The game has no network and no credentials, so everything it shows or does
// there goes through this bridge, which exists whenever Civ Lite is open in Bored's player and is not already in a
// match or a live game. The game asks with postMessage on a channel only this document knows. The hub checks who
// asked (the game's own window), the channel, and the signed-in account, then makes the calls itself.
//
// What the game is given: display names, whether people are online, room ids for the rooms it may open, and
// opaque references for the members it may invite. Never a token, an email or another person's account id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TEXT = { map: 24, size: 24, level: 24, borders: 24, unjoined: 24, mode: 24 };
const NUMBERS = ['turns', 'cpus', 'timer'];
const FLAGS = ['wrap', 'conquest', 'science'];
const FRESH = 1500;   // one screen asks for status, invites and games together; they share one read of the server

// Serialized into the game's document before its script runs, like the live bridge: call(op, payload) answers with
// the hub's result, and on(fn) hears what the hub pushes.
function lobbyBridge(channel) {
  let serial = 0, listener = null;
  const waiting = new Map(), early = [];
  window.__boredLobby = {
    call(op, payload) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        waiting.set(id, { resolve, reject });
        parent.postMessage({ type: 'bored:lobby-call', channel, id, op, payload: payload || {} }, '*');
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
    if (m.type === 'bored:lobby-result') {
      const task = waiting.get(m.id);
      if (!task) return;
      waiting.delete(m.id);
      if (m.error) task.reject(new Error(m.error)); else task.resolve(m.result);
    } else if (m.type === 'bored:lobby-event') {
      if (listener) listener(m.event); else early.push(m.event);
    }
  });
}

// What a new room may be set up with. The server checks every value again; this only keeps stray keys and wrong
// types out of the call.
export function cleanSettings(settings) {
  const out = {};
  if (!settings || typeof settings !== 'object') return out;
  for (const key of Object.keys(TEXT)) if (typeof settings[key] === 'string') out[key] = settings[key].slice(0, TEXT[key]);
  for (const key of NUMBERS) if (Number.isFinite(settings[key])) out[key] = Math.trunc(settings[key]);
  for (const key of FLAGS) if (typeof settings[key] === 'boolean') out[key] = settings[key];
  return out;
}

const name = value => String(value || 'Player').slice(0, 40);
const mode = g => (g && g.config && g.config.mode === 'coop' ? 'coop' : 'ffa');
const seatOf = g => (g.seats || []).find(s => s.seat === g.me);
const hostName = g => name(((g.seats || []).find(s => s.user === g.host) || {}).handle || 'The host');
const players = g => (g.seats || []).filter(s => s.state !== 'left').map(s => ({
  name: name(s.handle), you: s.seat === g.me, cpu: s.controller === 'cpu', online: !!s.online, state: String(s.state || '')
}));

// The lobby bridge for one document of Civ Lite. Everything it needs from the page around it is injected, so it can
// be tested without a browser or a network:
//   rpc / together     bt_live_rpc and bt_rpc
//   account()          who is signed in now, as { id, name }, or null
//   openLive(id)       switch the player into that live game, as Bored Together does
//   openSignIn()       the hub's sign-in
//   openTogether()     the Bored Together page
export function createLobbyBridge({ frame, deps = {} }) {
  const channel = crypto.randomUUID();
  const rpc = deps.rpc || liveRPC, together = deps.together || togetherRPC;
  const account = deps.account || (() => (hasIdentity() ? { id: getSession()?.user?.id, name: getHandle() } : null));
  const clock = deps.clock || Date.now;
  let disposed = false, refs = new Map(), cache = new Map();

  const post = message => { try { frame.contentWindow?.postMessage(Object.assign({ channel }, message), '*'); } catch (error) { /* the frame is gone */ } };
  const same = id => { const now = account(); return !!now && now.id === id; };
  // A read the screen asks for several times at once is made once, and kept for a moment.
  function read(key, fetch) {
    const hit = cache.get(key);
    if (hit && clock() - hit.at < FRESH) return hit.task;
    const task = Promise.resolve().then(fetch);
    const entry = { at: clock(), task };
    cache.set(key, entry);
    task.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
    return task;
  }
  const dashboard = () => read('dashboard', () => together('dashboard'));
  const rooms = () => read('list', async () => { const list = await rpc('list'); return Array.isArray(list) ? list : []; });
  const uuid = value => { if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Invalid request.'); return value; };

  async function status(me) {
    if (!me) return { signedIn: false, enrolled: false, name: null };
    const d = await dashboard();
    return { signedIn: true, enrolled: !!(d && d.enrolled), name: me.name ? name(me.name) : null };
  }
  async function enrolled() {
    const d = await dashboard();
    return !!(d && d.enrolled);
  }
  async function invites() {
    if (!(await enrolled())) return [];
    return (await rooms()).filter(g => g.status === 'lobby' && (seatOf(g) || {}).state === 'invited').map(g => ({
      id: uuid(g.id), host: hostName(g), mode: mode(g), at: typeof g.created_at === 'string' ? g.created_at : null, players: players(g).map(p => p.name)
    }));
  }
  async function games(me) {
    if (!(await enrolled())) return { live: [], turns: [] };
    const live = (await rooms()).filter(g => !(g.status === 'lobby' && (seatOf(g) || {}).state === 'invited')).map(g => {
      const mineSeat = seatOf(g) || {}, done = g.status === 'completed';
      const winner = done && g.winner !== null && g.winner !== undefined ? (g.seats || []).find(s => s.seat === g.winner) : null;
      return {
        id: uuid(g.id), status: String(g.status), mode: mode(g), round: Number(g.round) || 1, host: g.host === me.id, players: players(g),
        you: { cpu: mineSeat.controller === 'cpu', online: !!mineSeat.online },
        winner: done ? (winner ? name(winner.handle) : g.winner === null || g.winner === undefined ? null : 'A CPU') : null
      };
    });
    // The two-player Civ Lite games play turn by turn and open from Bored Together; they are only listed.
    const d = await dashboard();
    const turns = ((d && d.matches) || []).filter(m => m.game === 'ashcrown' && (m.status === 'active' || m.status === 'pending')).map(m => ({
      with: name(m.opponent && m.opponent.handle), yourTurn: m.turn_user === me.id
    }));
    return { live, turns };
  }
  async function members(me) {
    const list = await together('people');
    const next = new Map(), out = [];
    for (const person of Array.isArray(list) ? list : []) {
      if (!person || !person.id || person.id === me.id || out.length >= 200) continue;
      const ref = crypto.randomUUID();
      next.set(ref, person.id);
      out.push({ ref, name: name(person.handle) });
    }
    refs = next;
    return out;
  }
  async function host(me, settings, invitees) {
    if (!Array.isArray(invitees) || invitees.length < 1 || invitees.length > 3) throw new Error('Invite one to three members.');
    const ids = [];
    for (const ref of invitees) {
      const id = typeof ref === 'string' ? refs.get(ref) : null;
      if (!id) throw new Error('Pick the members again.');
      if (!ids.includes(id)) ids.push(id);
    }
    const created = await rpc('create', { game: 'ashcrown', invite: ids, config: cleanSettings(settings) });
    cache.clear();
    const id = uuid(created && created.id);
    if (!same(me.id)) throw new Error('Your account changed. Please try again.');
    await deps.openLive(id);
    return { id };
  }

  async function call(op, p) {
    p = p && typeof p === 'object' ? p : {};
    const me = account();
    if (op === 'status') return status(me);
    if (op === 'sign-in') { if (deps.openSignIn) deps.openSignIn(); return {}; }
    if (!me) throw new Error('Sign in to Bored to play online.');
    switch (op) {
      case 'members': return members(me);
      case 'invites': return invites();
      case 'games': return games(me);
      case 'host': return host(me, p.settings, p.invitees);
      case 'join': { const id = uuid(p.invite); await rpc('join', { id }); cache.clear(); await deps.openLive(id); return { id }; }
      case 'decline': { await rpc('leave_lobby', { id: uuid(p.invite) }); cache.clear(); return {}; }
      case 'open': { const id = uuid(p.game); await deps.openLive(id); return { id }; }
      case 'open-together': if (deps.openTogether) deps.openTogether(); return {};
      default: throw new Error('Unknown operation.');
    }
  }

  return {
    channel,
    // Puts the bridge into the game's document before its own script runs.
    document(html) {
      const json = JSON.stringify([channel]).replace(/</g, '\\u003c');
      return html.replace(/<head([^>]*)>/i, head => head + '<script>(' + lobbyBridge.toString() + ')(...' + json + ');<\/script>');
    },
    async message(event) {
      const request = event.data;
      if (disposed || event.source !== frame.contentWindow || !request || request.channel !== channel || request.type !== 'bored:lobby-call') return;
      const before = account(), owner = before ? before.id : null;
      try {
        const result = await call(request.op, request.payload);
        if (disposed) return;
        // An answer meant for one account is never handed to the page after the account changed.
        if (owner !== null && !same(owner)) throw new Error('Your account changed. Please try again.');
        post({ type: 'bored:lobby-result', id: request.id, result: result === undefined ? null : result });
      } catch (error) {
        if (!disposed) post({ type: 'bored:lobby-result', id: request.id, error: String((error && error.message) || 'Something went wrong.') });
      }
    },
    // The player signed in, out or switched accounts: nothing read for the last one is kept, and the page is told.
    accountChanged() {
      refs = new Map(); cache = new Map();
      post({ type: 'bored:lobby-event', event: { event: 'account' } });
    },
    dispose() { disposed = true; refs = new Map(); cache = new Map(); }
  };
}

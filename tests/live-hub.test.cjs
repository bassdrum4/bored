// The hub's side of a live game: the session that sits between one game screen and the room (order, retries,
// polling when Realtime is down, presence, the lobby), and the player that carries it into the game's iframe.
// The room is an in-memory stand-in for bt_live_rpc; the real one is tested on Postgres in together-live.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const OWNER = 'user-owner';
// The hub reads its session from localStorage at import, so give it one before it loads.
globalThis.localStorage = {
  data: { 'bored.session': JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: OWNER, is_anonymous: false } }) },
  getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = String(v); }, removeItem(k) { delete this.data[k]; }
};
const hub = () => import(pathToFileURL(path.join(__dirname, '../src/hub/together-live.js')).href);
const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(check, ms = 3000, label = 'condition') {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (check()) return; await wait(5); }
  throw new Error('Timed out waiting for ' + label);
}
const FAST = { every: { lobby: 15, fallback: 15, heartbeat: 40, presence: 60 } };

// bt_live_rpc, in memory: just enough of the room to drive the session.
function room(extra = {}) {
  const r = Object.assign({
    id: 'room-1', status: 'lobby', head: 0, round: 1, actions: [], snapshot: null, timer: 0, calls: [], requests: new Map(),
    config: { cpus: 1 }, start: null, host: OWNER,
    seats: [{ seat: 0, user: OWNER, handle: 'Me', state: 'joined', civ: null, controller: 'human', online: true, away: 0 },
            { seat: 1, user: 'user-friend', handle: 'Friend', state: 'invited', civ: null, controller: 'human', online: true, away: 3 }],
    fail: [], lose: 0, latency: 0
  }, extra);
  const game = () => ({ id: r.id, game: 'ashcrown', host: r.host, status: r.status, config: r.config, start: r.start, timer: r.timer, head: r.head,
    round: r.round, round_age: 1, winner: r.winner == null ? null : r.winner, me: 0, seats: r.seats.map(s => Object.assign({}, s)),
    snapshot: r.snapshot ? { round: r.snapshot.round, seq: r.snapshot.seq, hash: r.snapshot.hash } : null });
  const sync = (after, limit) => ({ id: r.id, status: r.status, head: r.head, round: r.round, round_age: 2, timer: r.timer, winner: null,
    actions: r.actions.filter(a => a.seq > after).slice(0, limit).map(a => Object.assign({}, a)),
    seats: r.seats.map(s => ({ seat: s.seat, controller: s.controller, online: s.online, away: s.away })) });
  r.add = (seat, type, args = {}) => { const a = { seq: ++r.head, seat, type, args }; r.actions.push(a); return a; };
  r.rpc = async (action, args) => {
    r.calls.push({ action, args });
    if (r.latency) await wait(r.latency);
    const failure = r.fail.shift();
    if (failure) { const e = new Error(failure.message || 'Failed to fetch'); if (failure.status) e.status = failure.status; throw e; }
    if (args.id !== r.id) throw Object.assign(new Error('That live game was not found.'), { status: 400 });
    switch (action) {
      case 'game': return game();
      case 'join': r.seats[0].state = 'joined'; return game();
      case 'lobby_set': if (args.config) r.config = args.config; if ('ready' in args) r.seats[0].state = args.ready ? 'ready' : 'joined'; if ('civ' in args) r.seats[0].civ = args.civ; return game();
      case 'start': r.status = 'active'; r.start = { seats: [] }; return game();
      case 'leave_lobby': r.status = 'cancelled'; return game();
      case 'sync': case 'heartbeat': return sync(args.after || 0, action === 'heartbeat' ? 0 : args.limit || 500);
      case 'load': return { snapshot: r.snapshot };
      case 'snapshot': r.snapshot = r.snapshot || { round: args.round, seq: args.seq, hash: args.hash, state: args.state }; return { stored: true };
      case 'report': return { ok: true, desync: !!r.desync };
      case 'finish': r.status = 'completed'; r.winner = args.winner; return game();
      case 'send': {
        if (r.requests.has(args.request_id)) return { seq: r.requests.get(args.request_id), duplicate: true, head: r.head };
        if (args.type === 'bad') throw Object.assign(new Error('Invalid action.'), { status: 400 });
        const a = r.add(0, args.type, args.args);
        r.requests.set(args.request_id, a.seq);
        if (r.lose > 0) { r.lose -= 1; throw new Error('Failed to fetch'); }   // applied, but the answer never arrived
        return { seq: a.seq, duplicate: false, head: r.head };
      }
      default: throw new Error('Unknown operation.');
    }
  };
  return r;
}

// Realtime, in memory: a handle the test can open, close and push through.
function socket() {
  const s = { opened: 0, closed: 0, onChange: null, onState: null, reconnects: 0 };
  s.subscribe = options => {
    s.options = options; s.onChange = options.onChange; s.onState = options.onState; s.opened += 1;
    return { close() { s.closed += 1; }, reconnect() { s.reconnects += 1; }, isOpen: () => !!s.up };
  };
  s.open = () => { s.up = true; s.onState(true); };
  s.down = () => { s.up = false; s.onState(false, 'down'); };
  return s;
}

async function session(t, r, { sock = null, extra = {} } = {}) {
  const { createLiveSession } = await hub();
  const events = [];
  const s = createLiveSession(Object.assign({
    id: r.id, owner: OWNER, rpc: r.rpc, subscribe: sock ? sock.subscribe : null, emit: e => events.push(e),
    exit: () => events.push({ event: 'exited' }), reload: round => events.push({ event: 'reloaded', round }), notify: text => events.push({ event: 'notice', text }),
    intervals: FAST, uuid: (() => { let n = 0; return () => 'req-' + (++n); })()
  }, extra));
  t.after(() => s.stop());
  s.events = events;
  s.log = () => events.filter(e => e.event === 'actions').flatMap(e => e.actions.map(a => a.seq));
  return s;
}

test('a lobby: an invited seat is joined on opening, the host flag is right, changes arrive, quiet reads do not', async t => {
  const r = room(); r.seats[0].state = 'invited'; r.host = 'user-friend';
  const s = await session(t, r);
  const hello = await s.call('hello', {});
  assert.equal(hello.game.status, 'lobby');
  assert.equal(hello.host, false);
  assert.equal(r.seats[0].state, 'joined', 'opening the game joins the invited seat');
  assert.ok(r.calls.some(c => c.action === 'join'));
  assert.equal(hello.snapshot, null);
  assert.deepEqual(hello.actions, []);
  await wait(80);
  assert.equal(s.events.filter(e => e.event === 'game').length, 0, 'nothing changed, so nothing is announced');
  r.seats[1].state = 'ready'; r.seats[1].civ = 'tide';
  await until(() => s.events.some(e => e.event === 'game'), 2000, 'the lobby change');
  assert.equal(s.events.find(e => e.event === 'game').game.seats[1].civ, 'tide');
  const before = s.events.length;
  r.seats[1].away = 40; r.round = 1;   // seconds and clocks alone are not news
  await wait(80);
  assert.equal(s.events.length, before);
});

test('lobby calls reach the room as the lobby_set, start and leave_lobby actions', async t => {
  const r = room();
  const s = await session(t, r);
  await s.call('hello', {});
  await s.call('lobby', { config: { cpus: 2 }, civ: 'ember', ready: true });
  assert.deepEqual(r.calls.find(c => c.action === 'lobby_set').args, { id: 'room-1', config: { cpus: 2 }, civ: 'ember', ready: true });
  assert.equal(r.seats[0].state, 'ready');
  const started = await s.call('start', {});
  assert.equal(started.status, 'active');
  const l = room(); const s2 = await session(t, l);
  await s2.call('hello', {});
  assert.equal((await s2.call('leave', {})).status, 'cancelled');
  await assert.rejects(s2.call('bogus', {}), /Unknown operation/);
});

test('opening a running game gives the newest snapshot and exactly the actions after it, then the rest in order', async t => {
  const r = room({ status: 'active' });
  for (let i = 0; i < 7; i++) r.add(i % 2, 'end-turn');
  r.snapshot = { round: 3, seq: 4, hash: 'abc12345', state: { turn: 3 } };
  const s = await session(t, r);
  const hello = await s.call('hello', {});
  assert.deepEqual(hello.snapshot, r.snapshot);
  assert.deepEqual(hello.actions.map(a => a.seq), [5, 6, 7]);
  assert.equal(hello.host, true);
  assert.deepEqual(hello.presence.seats.map(x => x.seat), [0, 1]);
  assert.ok(s.state().active);
  r.add(1, 'move', { a: 1 });
  await until(() => s.log().length === 1, 2000, 'the next action by polling');
  assert.deepEqual(s.log(), [8]);
});

test('with no snapshot the whole log is replayed; a long log is read in pages', async t => {
  const r = room({ status: 'active' });
  for (let i = 0; i < 2300; i++) r.add(0, 'tick');
  const s = await session(t, r);
  const hello = await s.call('hello', {});
  assert.equal(hello.snapshot, null);
  assert.equal(hello.actions.length, 2300);
  assert.ok(hello.actions.every((a, i) => a.seq === i + 1));
  assert.ok(r.calls.filter(c => c.action === 'sync').length >= 3, 'read in pages of 1000');
});

test('Realtime rows are delivered once and in order: duplicates dropped, early ones held, gaps filled from the server', async t => {
  const r = room({ status: 'active' });
  const sock = socket();
  const s = await session(t, r, { sock });
  await s.call('hello', {});
  sock.open();
  const a1 = r.add(1, 'x'), a2 = r.add(1, 'y'), a3 = r.add(0, 'z');
  // Seq 3 arrives before 1 and 2, then 2 twice, then 1: delivered 1, 2, 3 once each.
  sock.onChange(Object.assign({ game_id: r.id, request_id: 'q' }, a3));
  await wait(30);
  assert.equal(s.log().length === 0 || s.log().join() === '1,2,3', true);
  sock.onChange(a2); sock.onChange(a2); sock.onChange(a1);
  await until(() => s.log().length >= 3, 2000, 'all three');
  assert.deepEqual(s.log(), [1, 2, 3]);
  // A row Realtime never sends: the next one shows the hole and the session fetches the missing one itself.
  const a4 = r.add(0, 'lost'), a5 = r.add(1, 'seen');
  sock.onChange(a5);
  await until(() => s.log().length === 5, 2000, 'the gap to be filled');
  assert.deepEqual(s.log(), [1, 2, 3, 4, 5]);
  assert.equal(a4.seq, 4);
  // Strings from the wire are normalised.
  const a6 = r.add(0, 'wire');
  sock.onChange({ seq: String(a6.seq), seat: '0', type: 'wire', args: '{"k":2}' });
  await until(() => s.log().length === 6);
  assert.deepEqual(s.events.filter(e => e.event === 'actions').flatMap(e => e.actions).pop(), { seq: 6, seat: 0, type: 'wire', args: { k: 2 } });
});

test('with the socket up the log is not polled; down, it is read every tick; coming back reads it once', async t => {
  const r = room({ status: 'active' });
  const sock = socket();
  const s = await session(t, r, { sock });
  await s.call('hello', {});
  sock.open();
  await wait(30);
  const syncs = () => r.calls.filter(c => c.action === 'sync').length;
  const base = syncs();
  await wait(100);
  assert.equal(syncs(), base, 'a healthy socket means no polling');
  sock.down();
  r.add(1, 'while-down');
  await until(() => s.log().length === 1, 2000, 'polling to pick it up');
  r.add(1, 'again');
  sock.open();
  await until(() => s.log().length === 2, 2000, 'a catch-up on reconnect');
  const idle = syncs();
  await wait(100);
  assert.equal(syncs(), idle, 'polling stops once the socket is back');
});

test('the heartbeat notices an action Realtime dropped even while the socket looks fine', async t => {
  const r = room({ status: 'active' });
  const sock = socket();
  const s = await session(t, r, { sock });
  await s.call('hello', {});
  sock.open();
  r.add(1, 'silent');   // no push for it
  await until(() => s.log().length === 1, 2000, 'the heartbeat to see the head move');
  assert.ok(r.calls.some(c => c.action === 'heartbeat'));
});

test('sending: an answer that never arrives is retried with the same request and lands once', async t => {
  const r = room({ status: 'active' });
  const s = await session(t, r, { extra: { timers: { setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)) } } });
  await s.call('hello', {});
  r.fail.push({});   // the first try never reaches the room
  r.lose = 1;        // the second lands, but its answer is lost
  const out = await s.call('send', { type: 'move', args: { to: [1, 2] } });
  assert.equal(out.seq, 1);
  assert.equal(out.duplicate, true, 'a retry is answered with the number it already has');
  assert.equal(r.actions.length, 1, 'one action, not three');
  const sends = r.calls.filter(c => c.action === 'send');
  assert.equal(sends.length, 3);
  assert.equal(new Set(sends.map(c => c.args.request_id)).size, 1);
  // Each separate action gets its own request id.
  await s.call('send', { type: 'move', args: {} });
  assert.equal(new Set(r.calls.filter(c => c.action === 'send').map(c => c.args.request_id)).size, 2);
  // And it comes back through the log, in order, once.
  await until(() => s.log().length === 2, 2000, 'both actions back');
  assert.deepEqual(s.log(), [1, 2]);
});

test('a refusal is not retried and reaches the page as an error', async t => {
  const r = room({ status: 'active' });
  const s = await session(t, r);
  await s.call('hello', {});
  await assert.rejects(s.call('send', { type: 'bad', args: {} }), /Invalid action/);
  assert.equal(r.calls.filter(c => c.action === 'send').length, 1);
  await assert.rejects(s.call('send', {}), /Nothing to send/);
});

test('presence: seats, the round clock and the timer reach the page, on change and on every heartbeat', async t => {
  const r = room({ status: 'active', timer: 60 });
  const s = await session(t, r);
  await s.call('hello', {});
  await until(() => s.events.some(e => e.event === 'presence'), 2000, 'a heartbeat');
  const first = s.events.find(e => e.event === 'presence');
  assert.equal(first.timer, 60);
  assert.equal(first.round, 1);
  assert.deepEqual(first.seats.map(x => [x.seat, x.online, x.controller]), [[0, true, 'human'], [1, true, 'human']]);
  const count = () => s.events.filter(e => e.event === 'presence').length;
  const n = count();
  r.seats[1].online = false; r.seats[1].away = 30;
  await until(() => count() > n, 2000, 'the change');
  assert.equal(s.events.filter(e => e.event === 'presence').pop().seats[1].online, false);
});

test('the connection: two failures in a row say offline, one success says online again, and nothing is lost', async t => {
  const r = room({ status: 'active' });
  const s = await session(t, r);
  await s.call('hello', {});
  r.fail.push({}, {}, {});
  await until(() => s.events.some(e => e.event === 'net' && e.online === false), 2000, 'offline');
  await until(() => s.events.some(e => e.event === 'net' && e.online === true), 2000, 'online');
  r.add(1, 'after');
  await until(() => s.log().length === 1, 2000);
  assert.deepEqual(s.log(), [1]);
});

test('report, snapshot and finish go to the room; finishing stops the timers', async t => {
  const r = room({ status: 'active' });
  const sock = socket();
  const s = await session(t, r, { sock });
  await s.call('hello', {});
  assert.deepEqual(await s.call('report', { round: 2, hash: 'deadbeef' }), { ok: true, desync: false });
  r.desync = true;
  assert.equal((await s.call('report', { round: 2, hash: 'cafe0001' })).desync, true);
  await s.call('snapshot', { round: 2, seq: 0, hash: 'deadbeef', state: { turn: 2 } });
  assert.equal(r.snapshot.round, 2);
  await s.call('finish', { winner: 1, why: 'conquest' });
  assert.equal(r.status, 'completed');
  assert.equal(sock.closed, 1, 'the socket is let go');
  const beats = () => r.calls.filter(c => c.action === 'heartbeat').length;
  const n = beats();
  await wait(120);
  assert.equal(beats(), n, 'no more heartbeats once it is over');
});

test('reload is limited to three a couple of minutes; resync rewinds to what the page has; exit closes the screen', async t => {
  let now = 1000000;
  const r = room({ status: 'active' });
  for (let i = 0; i < 5; i++) r.add(0, 'a');
  const s = await session(t, r, { extra: { clock: () => now } });
  await s.call('hello', {});
  for (let i = 0; i < 4; i++) await s.call('reload', { round: i + 2 });
  await wait(100);
  assert.equal(s.events.filter(e => e.event === 'reloaded').length, 3);
  assert.equal(s.events.filter(e => e.event === 'notice').length, 1);
  now += 130000;
  await s.call('reload', { round: 9 });
  await wait(100);
  assert.equal(s.events.filter(e => e.event === 'reloaded').length, 4, 'allowed again later');
  // The page says it only has up to action 2: everything after it is sent again.
  await s.call('resync', { after: 2 });
  await until(() => s.log().join() === '3,4,5', 2000, 'the resend');
  await s.call('exit', {});
  await until(() => s.events.some(e => e.event === 'exited'));
});

test('a stopped session answers nothing and polls nothing', async t => {
  const r = room({ status: 'active' });
  const s = await session(t, r);
  await s.call('hello', {});
  s.stop();
  await assert.rejects(s.call('game', {}), /closed/);
  const n = r.calls.length;
  await wait(100);
  assert.equal(r.calls.length, n);
});

test('the player: the bridge is put in the document once, and only the right sender on the right channel is heard', async t => {
  const { createLivePlayer, createLiveSession } = await hub();
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const r = room({ status: 'active' });
  const posts = [];
  const frame = { contentWindow: { postMessage: (m, to) => posts.push([m, to]) } };
  const state = { exited: 0, closed: 0 };
  const player = createLivePlayer({ game: { id: r.id, game: 'ashcrown' }, owner: OWNER, frame, close: () => state.closed++, onExit: () => state.exited++, reload() {}, notify() {},
    deps: { rpc: r.rpc, subscribe: () => ({ close() {}, reconnect() {}, isOpen: () => false }) } });
  t.after(() => { try { player.dispose(); } catch (e) { /* already */ } });
  assert.equal(player.mode, 'live');
  assert.equal(player.isOwner(), true);
  const html = player.document('<!doctype html><html><head><title>x</title></head><body></body></html>');
  assert.equal((html.match(/__boredLive/g) || []).length, 1);
  assert.ok(html.indexOf('__boredLive') < html.indexOf('<title>'), 'in the head, before the game script');
  const channel = /\(\.\.\.\["([0-9a-f-]{36})"\]\)/.exec(html)[1];
  // The game's side: run the injected script in a bare context with a fake parent and listener list.
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const outbox = [], listeners = [];
  const parent = { postMessage: (m, to) => outbox.push(m) };
  const context = vm.createContext({ parent, window: {}, addEventListener: (type, fn) => listeners.push(fn), Promise, Map, Error });
  vm.runInContext(script, context);
  const bridge = context.window.__boredLive;
  const answer = bridge.call('game', {});
  assert.equal(outbox[0].type, 'bored:live-call');
  assert.equal(outbox[0].channel, channel);
  assert.equal(outbox[0].op, 'game');
  // The hub side answers the call it received.
  await player.message({ source: frame.contentWindow, data: outbox[0] });
  const reply = posts.find(p => p[0].type === 'bored:live-result');
  assert.equal(reply[0].channel, channel);
  assert.equal(reply[0].result.id, r.id);
  // The page hears it only from its parent and on its channel.
  listeners[0]({ source: {}, data: reply[0] });
  listeners[0]({ source: parent, data: Object.assign({}, reply[0], { channel: 'other' }) });
  let settled = false; answer.then(() => { settled = true; });
  await wait(10);
  assert.equal(settled, false, 'a stranger or a wrong channel cannot answer');
  listeners[0]({ source: parent, data: reply[0] });
  assert.equal((await answer).id, r.id);
  // Events pushed before the game calls on() are kept for it.
  listeners[0]({ source: parent, data: { type: 'bored:live-event', channel, event: { event: 'net', online: false } } });
  const heard = [];
  bridge.on(e => heard.push(e));
  assert.deepEqual(heard, [{ event: 'net', online: false }]);
  listeners[0]({ source: parent, data: { type: 'bored:live-event', channel, event: { event: 'net', online: true } } });
  assert.equal(heard.length, 2);
  // The hub ignores a message from another window or on another channel, and a failure comes back as an error.
  const before = posts.length;
  await player.message({ source: {}, data: { type: 'bored:live-call', channel, id: 9, op: 'game', payload: {} } });
  await player.message({ source: frame.contentWindow, data: { type: 'bored:live-call', channel: 'x', id: 9, op: 'game', payload: {} } });
  assert.equal(posts.length, before);
  await player.message({ source: frame.contentWindow, data: { type: 'bored:live-call', channel, id: 10, op: 'nope', payload: {} } });
  assert.match(posts.pop()[0].error, /Unknown operation/);
  // exit closes the screen through the hub; disposing tells the list.
  await player.message({ source: frame.contentWindow, data: { type: 'bored:live-call', channel, id: 11, op: 'exit', payload: {} } });
  await until(() => state.closed === 1);
  player.dispose();
  assert.equal(state.exited, 1);
  assert.equal(player.isOwner(), false);
  await player.message({ source: frame.contentWindow, data: { type: 'bored:live-call', channel, id: 12, op: 'game', payload: {} } });
  assert.ok(!posts.some(p => p[0].id === 12), 'a disposed player answers nothing');
  void createLiveSession;
});

test('only a live game can be opened live', async () => {
  const { createLivePlayer, TOGETHER_LIVE, LIVE_DEFAULTS } = await hub();
  assert.deepEqual(Object.keys(TOGETHER_LIVE), ['ashcrown']);
  assert.throws(() => createLivePlayer({ game: { id: 'x', game: 'chess' }, owner: OWNER, frame: {}, close() {}, onExit() {}, reload() {}, notify() {} }), /not available live/);
  assert.equal(LIVE_DEFAULTS.timer, 0);
  assert.equal(LIVE_DEFAULTS.unjoined, 'cpu');
});

// The hub's Realtime client, against a Phoenix-protocol server speaking real WebSocket frames.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createMockRealtime } = require('./mock-realtime.cjs');

const load = () => import(pathToFileURL(path.join(__dirname, '../src/hub/realtime.js')).href);
const wait = ms => new Promise(done => setTimeout(done, ms));
async function until(check, ms = 3000, label = 'condition') {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (check()) return; await wait(10); }
  throw new Error('Timed out waiting for ' + label);
}
const GAME = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';
const changes = id => [{ event: 'INSERT', schema: 'bored_live', table: 'actions', filter: 'game_id=eq.' + id }];

async function setup(t, extra = {}) {
  const { subscribeChanges } = await load();
  const server = await createMockRealtime();
  const log = { rows: [], states: [] };
  const channel = subscribeChanges(Object.assign({
    url: server.url, topic: 'live-' + GAME, changes: changes(GAME), getToken: async () => 'token-one',
    onChange: row => log.rows.push(row), onState: (open, reason) => log.states.push([open, reason]),
    retry: [20, 40], heartbeatMs: 40, joinWaitMs: 300, tokenMs: 60000
  }, extra));
  t.after(async () => { channel.close(); await server.close(); });
  return { server, channel, log };
}

test('joins with the table, the filter and the token, and says when the server has accepted', async t => {
  const { server, channel, log } = await setup(t);
  await until(() => channel.isOpen(), 3000, 'the join');
  assert.deepEqual(log.states, [[true, undefined]]);
  const join = server.state.joins[0];
  assert.equal(join.topic, 'realtime:live-' + GAME);
  assert.equal(join.payload.access_token, 'token-one');
  assert.deepEqual(join.payload.config.postgres_changes, changes(GAME));
  assert.match(server.state.urls[0], /^\/realtime\/v1\/websocket\?apikey=test&vsn=1\.0\.0$/);
  assert.equal(join.ref, join.join_ref, 'the join carries its own reference');
});

test('hears new rows for its game, and only for its game', async t => {
  const { server, channel, log } = await setup(t);
  await until(() => channel.isOpen());
  const row = n => ({ game_id: GAME, seq: n, seat: 0, type: 'end-turn', args: {}, request_id: 'r' + n });
  server.push(row(1)); server.push(Object.assign(row(2), { args: { x: 1 } }));
  assert.equal(server.push({ game_id: OTHER, seq: 1, seat: 0, type: 'end-turn', args: {} }), 0, 'another game is not sent to this one');
  await until(() => log.rows.length === 2);
  assert.deepEqual(log.rows.map(r => r.seq), [1, 2]);
  assert.deepEqual(log.rows[1].args, { x: 1 });
});

test('heartbeats while joined, and gives up on a server that stops answering', async t => {
  const { server, channel, log } = await setup(t);
  await until(() => channel.isOpen());
  await until(() => server.state.heartbeats >= 3, 3000, 'three heartbeats');
  assert.equal(log.states.length, 1, 'answered heartbeats keep it up');
  server.state.silent = true;
  await until(() => log.states.some(([open]) => open === false), 3000, 'the drop');
  assert.match(log.states.find(([open]) => open === false)[1], /stopped answering/);
  server.state.silent = false;
  await until(() => channel.isOpen(), 3000, 'the reconnect');
  assert.equal(server.state.joins.length, 2);
});

test('a dropped network is noticed and healed with a new join', async t => {
  const { server, channel, log } = await setup(t);
  await until(() => channel.isOpen());
  server.drop();
  await until(() => !channel.isOpen(), 3000, 'the drop');
  assert.deepEqual(log.states.map(s => s[0]), [true, false]);
  await until(() => channel.isOpen(), 3000, 'the reconnect');
  assert.deepEqual(log.states.map(s => s[0]), [true, false, true]);
  server.push({ game_id: GAME, seq: 7, seat: 1, type: 'end-turn', args: {} });
  await until(() => log.rows.length === 1);
  assert.equal(log.rows[0].seq, 7);
});

test('a refused subscription is not open, and is tried again', async t => {
  const { server, channel, log } = await setup(t);
  server.state.refuse = true;
  server.drop();
  await until(() => server.state.joins.length >= 3, 3000, 'repeated tries');
  assert.equal(channel.isOpen(), false);
  server.state.refuse = false;
  await until(() => channel.isOpen(), 3000, 'an accepted join');
});

test('sends a fresh token on a long-lived socket, and none without a session', async t => {
  let n = 0;
  const { server, channel } = await setup(t, { tokenMs: 40, getToken: async () => 'token-' + (++n) });
  await until(() => channel.isOpen());
  await until(() => server.state.tokens.length >= 2, 3000, 'token refreshes');
  assert.ok(server.state.tokens.every(x => /^token-\d+$/.test(x)));
  assert.notEqual(server.state.tokens[0], server.state.tokens[1]);
});

test('close leaves the channel and stays closed', async t => {
  const { server, channel } = await setup(t);
  await until(() => channel.isOpen());
  channel.close();
  await until(() => server.state.leaves === 1, 3000, 'the leave');
  const joins = server.state.joins.length;
  await wait(200);
  assert.equal(server.state.joins.length, joins, 'no reconnect after close');
  assert.equal(channel.isOpen(), false);
});

test('with no session it never opens a socket', async t => {
  const { subscribeChanges } = await load();
  const server = await createMockRealtime();
  const channel = subscribeChanges({ url: server.url, topic: 'live-x', changes: changes(GAME), getToken: async () => '', onChange() {}, onState() {}, retry: [20] });
  t.after(async () => { channel.close(); await server.close(); });
  await wait(150);
  assert.equal(server.state.connections, 0);
});

// The hub's side of cloud saves: the bridge that sits between Civ Lite's frame and the account's saves.
// The save_* functions are replaced by an in-memory stand-in; the real ones are tested on Postgres in game-saves.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const TOKEN = 'secret-access-token-123', OWNER = '9f1c2d3e-aaaa-4bbb-8ccc-0123456789ab', EMAIL = 'someone@example.test';
globalThis.localStorage = {
  data: { 'bored.session': JSON.stringify({ access_token: TOKEN, refresh_token: 'refresh-xyz', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: OWNER, email: EMAIL, is_anonymous: false } }) },
  getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = String(v); }, removeItem(k) { delete this.data[k]; }
};
const mod = () => import(pathToFileURL(path.join(__dirname, '../src/hub/saves-bridge.js')).href);
const wait = ms => new Promise(done => setTimeout(done, ms));

// A frame that records what the hub posts into it, and an account the test can change.
async function world() {
  const { createSavesBridge } = await mod();
  const posted = [], calls = [];
  const win = { postMessage(message) { posted.push(message); } };
  const frame = { contentWindow: win };
  const w = { me: { id: OWNER }, calls, posted, win, frame, fail: null, hold: null, rows: [] };
  w.bridge = createSavesBridge({ frame, deps: {
    account: () => w.me,
    rpc: async (fn, args, options) => {
      calls.push({ fn, args, options });
      if (w.hold) await w.hold;
      if (w.fail) throw w.fail;
      if (fn === 'save_list') return w.rows;
      if (fn === 'save_get') return { slot: args.p_slot, version: 3, bytes: 10, stamp: 1700000000000, header: { v: 1, at: 5, name: 'Far away' }, data: w.data };
      if (fn === 'save_put') return { slot: args.p_slot, version: args.p_expected + 1, bytes: args.p_data.length, stamp: 1700000001000 };
      return { slot: args.p_slot, deleted: true, version: args.p_expected };
    }
  } });
  w.send = (op, payload, over = {}) => w.bridge.message(Object.assign({ source: win, data: { type: 'bored:saves-call', channel: w.bridge.channel, id: 1, op, payload } }, over));
  w.last = () => posted[posted.length - 1];
  return w;
}
const head = (over = {}) => ({ v: 1, mv: 2, at: 1000, kind: 'manual', name: 'Mine', meta: 'China', turn: 3, seed: 7, civ: 'china', color: '#fff', ink: '#000', era: 'Ancient', ...over });

test('the bridge answers only the game’s own window, on its own channel, with its own message type', async () => {
  const w = await world();
  await w.send('list', {}, { source: { postMessage() {} } });                                   // another window
  await w.send('list', {}, { source: null });
  await w.bridge.message({ source: w.win, data: { type: 'bored:saves-call', channel: 'not-the-channel', id: 2, op: 'list', payload: {} } });
  await w.bridge.message({ source: w.win, data: { type: 'bored:lobby-call', channel: w.bridge.channel, id: 3, op: 'list', payload: {} } });
  await w.bridge.message({ source: w.win, data: null });
  await w.bridge.message({ source: w.win, data: { type: 'bored:saves-call', id: 4, op: 'list' } });
  assert.deepEqual([w.calls.length, w.posted.length], [0, 0], 'nothing was called and nothing answered');
  await w.send('list', {});
  assert.equal(w.calls.length, 1, 'the right window on the right channel is served');
  assert.equal(w.last().type, 'bored:saves-result');
  w.bridge.dispose();
  await w.send('list', {});
  assert.equal(w.calls.length, 1, 'a disposed bridge hears nothing');
});

test('signed out: status says so and every other call is refused before the server is asked', async () => {
  const w = await world();
  w.me = null;
  await w.send('status', {});
  assert.deepEqual(w.last().result, { signedIn: false, account: null });
  for (const [op, payload] of [['list', {}], ['get', { slot: 'm1' }], ['put', { slot: 'm1', header: head(), state: '{}', expected: 0 }], ['delete', { slot: 'm1', expected: 1 }]]) {
    await w.send(op, payload);
    assert.match(w.last().error, /Sign in to Bored/);
    assert.equal(w.last().retry, false);
  }
  assert.equal(w.calls.length, 0);
});

test('no token, email or account id ever reaches the page', async () => {
  const w = await world();
  w.rows = [{ slot: 'm1', version: 2, bytes: 40, stamp: 1700000000000, header: head() }];
  w.data = 'plain:{"v":4}';
  await w.send('status', {});
  await w.send('list', {});
  await w.send('get', { slot: 'm1' });
  await w.send('put', { slot: 'm2', header: head(), state: '{"v":4}', expected: 0 });
  w.fail = Object.assign(new Error('Sign in again to continue.'), { status: 401 });
  await w.send('delete', { slot: 'm1', expected: 1 });
  w.bridge.accountChanged();
  const everything = JSON.stringify(w.posted) + w.bridge.document('<html><head></head><body></body></html>');
  for (const secret of [TOKEN, 'refresh-xyz', OWNER, EMAIL]) assert.ok(!everything.includes(secret), 'the page never sees ' + secret.slice(0, 6) + '…');
  // The account is named by a short stable reference, and the game's own id is not in it.
  const status = w.posted.find(m => m.result && 'account' in m.result).result;
  assert.match(status.account, /^a[0-9a-f]{16}$/);
  const { accountRef } = await mod();
  assert.equal(status.account, accountRef(OWNER));
  assert.notEqual(accountRef(OWNER), accountRef('someone-else'));
  // The document gets the bridge script right after <head>, with only the channel in it.
  const doc = w.bridge.document('<!doctype html><html><head><meta charset="utf-8"></head><body>x</body></html>');
  assert.match(doc, /<head><script>\(function savesBridge\(channel\)/);
  assert.ok(doc.includes(w.bridge.channel));
  const script = doc.match(/<script>([\s\S]*?)<\/script>/)[1];
  const sandbox = { parent: { postMessage(m) { sandbox.sent.push(m); } }, sent: [], addEventListener() {} };
  sandbox.window = sandbox;
  vm.runInNewContext(script, sandbox);
  assert.equal(typeof sandbox.__boredSaves.call, 'function');
  assert.equal(typeof sandbox.__boredSaves.on, 'function');
});

test('a save is compressed before it goes up and unpacked when it comes down, with a plain fallback', async () => {
  const { encodeSave, decodeSave } = await mod();
  const text = JSON.stringify({ v: 4, tiles: Array.from({ length: 2000 }, (_, i) => ({ i, t: 'grass', o: null })) });
  const packed = await encodeSave(text);
  assert.ok(packed.startsWith('gz:'));
  assert.ok(packed.length < text.length / 4, 'gzip and base64 still come out far smaller: ' + packed.length + ' vs ' + text.length);
  assert.equal(await decodeSave(packed), text);
  // A browser without CompressionStream keeps the text as it is, and still reads both kinds.
  const keep = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  try {
    const plain = await encodeSave(text);
    assert.equal(plain, 'plain:' + text);
    assert.equal(await decodeSave(plain), text);
    assert.equal(await decodeSave(packed), text, 'a compressed save from another device still opens');
  } finally { globalThis.CompressionStream = keep; }
  await assert.rejects(decodeSave('nonsense'), /can’t be opened/);
  await assert.rejects(decodeSave(null), /can’t be opened/);
  await assert.rejects(encodeSave(''), /Invalid save/);
});

test('put and get: the header is cleaned, the game is packed, and the answer is what the page needs', async () => {
  const w = await world();
  const state = JSON.stringify({ v: 4, tiles: [1, 2, 3] });
  await w.send('put', { slot: 'm3', header: Object.assign(head(), { evil: 'x', token: TOKEN, name: 'n'.repeat(500) }), state, expected: 2, leaving: true });
  const call = w.calls[0];
  assert.equal(call.fn, 'save_put');
  assert.deepEqual([call.args.p_game, call.args.p_slot, call.args.p_expected], ['ashcrown', 'm3', 2]);
  assert.deepEqual(Object.keys(call.args.p_header).sort(), ['at', 'civ', 'color', 'era', 'ink', 'kind', 'meta', 'mv', 'name', 'seed', 'turn', 'v']);
  assert.equal(call.args.p_header.name.length, 200);
  assert.ok(call.args.p_data.startsWith('gz:'));
  assert.equal(call.options.keepalive, true, 'a save made while the page closes is left with the browser');
  assert.deepEqual(w.last().result, { slot: 'm3', version: 3, bytes: call.args.p_data.length, stamp: 1700000001000 });
  await w.send('put', { slot: 'm3', header: head(), state, expected: 0 });
  assert.equal(w.calls[1].options.keepalive, false);
  // Down: the data is unpacked back into the game's own text.
  const { encodeSave } = await mod();
  w.data = await encodeSave(state);
  await w.send('get', { slot: 'auto' });
  assert.deepEqual(w.last().result, { slot: 'auto', version: 3, stamp: 1700000000000, header: { v: 1, at: 5, name: 'Far away' }, state });
  await w.send('delete', { slot: 'm3', expected: 3 });
  assert.deepEqual(w.last().result, { slot: 'm3', deleted: true, version: 3 });
});

test('bad requests never reach the server', async () => {
  const w = await world();
  const good = { slot: 'm1', header: head(), state: '{}', expected: 0 };
  const bad = [
    ['put', { ...good, slot: 't1' }], ['put', { ...good, slot: 'm9' }], ['put', { ...good, slot: undefined }],
    ['put', { ...good, expected: -1 }], ['put', { ...good, expected: 1.5 }], ['put', { ...good, expected: '1' }],
    ['put', { ...good, header: null }], ['put', { ...good, header: [1] }], ['put', { ...good, header: { name: 'x' } }],
    ['put', { ...good, state: '' }], ['put', { ...good, state: 42 }],
    ['get', { slot: '../etc' }], ['delete', { slot: 'm1', expected: -1 }], ['sign-in', {}], ['nope', {}]
  ];
  for (const [op, payload] of bad) {
    await w.send(op, payload);
    assert.ok(w.last().error, op + ' ' + JSON.stringify(payload).slice(0, 60) + ' is refused');
    assert.equal(w.last().retry, false);
  }
  assert.equal(w.calls.length, 0);
  // A game too big to keep is refused here, before it is sent: random text does not compress below 2 MB of base64.
  const noise = require('node:crypto').randomBytes(2.5 * 1024 * 1024).toString('base64');
  await w.send('put', { ...good, state: JSON.stringify(noise) });
  assert.match(w.last().error, /larger than your account keeps/);
  assert.equal(w.calls.length, 0);
});

test('what the page is told when the server says no: a 409 with what is stored, retry only where it can help', async () => {
  const w = await world();
  const put = { slot: 'm1', header: head(), state: '{}', expected: 1 };
  w.fail = Object.assign(new Error('This save changed on another device.'), { status: 409, code: 'PT409', details: JSON.stringify({ version: 4, header: head({ name: 'Elsewhere' }), stamp: 1700000009000, bytes: 9 }) });
  await w.send('put', put);
  assert.deepEqual(w.last().conflict, { version: 4, header: head({ name: 'Elsewhere' }), stamp: 1700000009000 });
  assert.equal(w.last().retry, false);
  w.fail = Object.assign(new Error('x'), { status: 409 });                                       // a 409 whose detail did not arrive
  await w.send('put', put);
  assert.deepEqual(w.last().conflict, { version: null, header: null, stamp: null });
  for (const [status, retry] of [[undefined, true], [408, true], [429, true], [500, true], [503, true], [400, false], [401, false], [403, false], [404, false]]) {
    w.fail = Object.assign(new Error('boom'), status ? { status } : {});
    await w.send('list', {});
    assert.equal(w.last().retry, retry, 'status ' + status);
    assert.equal(w.last().conflict, undefined);
  }
});

test('an answer for one account is never handed over after the account changed, and a closing page’s save still lands', async () => {
  const w = await world();
  let release;
  w.hold = new Promise(done => { release = done; });
  w.rows = [{ slot: 'm1', version: 1, bytes: 5, stamp: 1, header: head() }];
  const pending = w.send('list', {});
  await wait(5);
  w.me = { id: 'another-account' };                                                              // signs out and in as someone else
  release();
  await pending;
  assert.match(w.last().error, /account changed/);
  assert.ok(!w.posted.some(m => m.result && m.result.saves), 'the first account’s saves were not handed to the second');
  // Back to Bored: the page asks for a save and is gone before the answer. The save still goes up; nobody is answered.
  w.me = { id: OWNER };
  w.hold = new Promise(done => { release = done; });
  const before = w.posted.length;
  const leaving = w.send('put', { slot: 'auto', header: head({ kind: 'auto' }), state: '{"v":4}', expected: 0, leaving: true });
  await wait(10);
  w.bridge.dispose();
  release();
  await leaving;
  assert.equal(w.calls.filter(c => c.fn === 'save_put').length, 1, 'the save was made');
  assert.equal(w.posted.length, before, 'and nothing was posted into the closed page');
});

test('accountChanged tells the page, and two list calls in flight share one request', async () => {
  const w = await world();
  w.bridge.accountChanged();
  assert.deepEqual(w.last(), { channel: w.bridge.channel, type: 'bored:saves-event', event: { event: 'account' } });
  let release;
  w.hold = new Promise(done => { release = done; });
  const one = w.send('list', {}), two = w.send('list', {}, {});
  await wait(5);
  release();
  await Promise.all([one, two]);
  assert.equal(w.calls.filter(c => c.fn === 'save_list').length, 1);
});

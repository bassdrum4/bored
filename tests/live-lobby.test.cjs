// The hub's side of Civ Lite's Multiplayer screen (5.2): the lobby bridge that stands between the game and Bored
// Together. It must answer only the game's own window on its own channel, only for a signed-in account, hand the
// game names and room ids but never an email, a token or someone's account id, and do what the game asks through the
// same calls Bored Together makes. The server calls are an in-memory stand-in; the real ones are in live-browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

globalThis.localStorage = {
  data: {}, getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = String(v); }, removeItem(k) { delete this.data[k]; }
};
const lobby = () => import(pathToFileURL(path.join(__dirname, '../src/hub/together-lobby.js')).href);

const ME = 'user-me', FRIEND = 'user-friend', OTHER = 'user-other';
const TOKEN = 'SECRET-ACCESS-TOKEN';
const ROOM_CODE = 'KX7Q2M';
const ROOM = (n) => '00000000-0000-4000-8000-00000000000' + n;
const seats = (...list) => list.map((s, i) => Object.assign({ seat: i, user: s.user, handle: s.handle, state: 'joined', controller: 'human', online: true }, s));

function world(extra = {}) {
  const w = Object.assign({
    signedIn: true, enrolled: true, account: { id: ME, name: 'Me' }, calls: [], opened: [], signins: 0, togethers: 0,
    people: [{ id: FRIEND, handle: 'Friend', email: 'friend@example.com' }, { id: OTHER, handle: 'Other', email: 'other@example.com' }, { id: ME, handle: 'Me', email: 'me@example.com' }],
    rooms: [
      { id: ROOM(1), game: 'ashcrown', host: FRIEND, status: 'lobby', config: { mode: 'coop' }, created_at: '2026-11-09T18:00:00Z', me: 1, round: 1, winner: null,
        seats: seats({ user: FRIEND, handle: 'Friend', state: 'ready' }, { user: ME, handle: 'Me', state: 'invited', online: false }) },
      { id: ROOM(2), game: 'ashcrown', host: ME, status: 'active', config: {}, code: ROOM_CODE, capacity: 3, created_at: '2026-11-09T17:00:00Z', me: 0, round: 12, winner: null,
        seats: seats({ user: ME, handle: 'Me', controller: 'cpu', online: false }, { user: FRIEND, handle: 'Friend' }) },
      { id: ROOM(3), game: 'ashcrown', host: FRIEND, status: 'completed', config: { mode: 'coop' }, created_at: '2026-11-08T17:00:00Z', me: 1, round: 40, winner: 0,
        seats: seats({ user: FRIEND, handle: 'Friend' }, { user: ME, handle: 'Me' }) }
    ],
    matches: [{ id: 'm1', game: 'ashcrown', status: 'active', turn_user: ME, opponent: { id: OTHER, handle: 'Other', email: 'other@example.com' } },
              { id: 'm2', game: 'connect-four', status: 'active', turn_user: ME, opponent: { id: OTHER, handle: 'Other' } }]
  }, extra);
  // The bridge keeps the functions it was given, so a test that wants a different answer swaps w.impl.
  w.impl = {
    rpc: async (action, args) => {
      w.calls.push(['live', action, args]);
      if (action === 'list') return w.rooms;
      if (action === 'create') return { id: ROOM(9), invite: args.invite };
      return { ok: true };
    },
    together: async (action, args) => {
      w.calls.push(['together', action, args]);
      if (action === 'dashboard') return w.enrolled ? { enrolled: true, user_id: ME, token: TOKEN, matches: w.matches } : { enrolled: false };
      if (action === 'people') return w.people;
      throw new Error('Unknown operation.');
    }
  };
  w.deps = {
    account: () => (w.signedIn ? w.account : null),
    rpc: (action, args) => w.impl.rpc(action, args),
    together: (action, args) => w.impl.together(action, args),
    openLive: async id => { w.opened.push(id); },
    openSignIn: () => { w.signins++; },
    openTogether: () => { w.togethers++; }
  };
  return w;
}

async function bridge(w) {
  const { createLobbyBridge } = await lobby();
  const posts = [];
  const frame = { contentWindow: { postMessage: m => posts.push(m) } };
  const b = createLobbyBridge({ frame, deps: w.deps });
  let serial = 0;
  const ask = async (op, payload, over = {}) => {
    const id = ++serial, before = posts.length;
    await b.message({ source: over.source || frame.contentWindow, data: Object.assign({ type: 'bored:lobby-call', channel: b.channel, id, op, payload: payload || {} }, over.data || {}) });
    return posts.slice(before).find(m => m.id === id) || null;
  };
  return { b, posts, ask, frame };
}

test('only the game’s own window on the bridge’s own channel is answered', async () => {
  const w = world(), { b, posts, ask, frame } = await bridge(w);
  assert.equal((await ask('status')).result.signedIn, true);
  const before = posts.length;
  assert.equal(await ask('status', {}, { source: { postMessage() {} } }), null, 'another window');
  assert.equal(await ask('status', {}, { data: { channel: 'not-the-channel' } }), null, 'another channel');
  assert.equal(await ask('status', {}, { data: { channel: undefined } }), null, 'no channel');
  assert.equal(await ask('status', {}, { data: { type: 'bored:live-call' } }), null, 'another kind of message');
  await b.message({ source: frame.contentWindow, data: null });
  assert.equal(posts.length, before, 'nothing was said to any of them');
  assert.equal(w.calls.filter(c => c[1] === 'dashboard').length, 1, 'and none of them reached the server');
  b.dispose();
  assert.equal(await ask('status'), null, 'a disposed bridge answers nobody');
});

test('signed out: the status says so, the sign-in button reaches the hub, and everything else is refused', async () => {
  const w = world({ signedIn: false }), { ask } = await bridge(w);
  assert.deepEqual((await ask('status')).result, { signedIn: false, enrolled: false, name: null });
  await ask('sign-in');
  assert.equal(w.signins, 1);
  for (const [op, payload] of [['members'], ['invites'], ['games'], ['host', { settings: {}, invitees: ['x'] }], ['join', { invite: ROOM(1) }], ['decline', { invite: ROOM(1) }],
    ['open', { game: ROOM(2) }], ['open-together'], ['join-code', { code: 'KX7Q2M' }]]) {
    const r = await ask(op, payload);
    assert.equal(r.error, 'Sign in to Bored to play online.', op);
  }
  assert.deepEqual(w.calls, [], 'no call was made for a signed-out page');
  assert.deepEqual(w.opened, []);
});

test('signed in but not in Bored Together: the status says so, nothing is listed, and Join Bored Together opens its page', async () => {
  const w = world({ enrolled: false }), { ask } = await bridge(w);
  assert.deepEqual((await ask('status')).result, { signedIn: true, enrolled: false, name: 'Me' });
  assert.deepEqual((await ask('invites')).result, []);
  assert.deepEqual((await ask('games')).result, { live: [], turns: [] });
  assert.equal(w.calls.some(c => c[1] === 'list'), false, 'the room list is not read');
  await ask('open-together');
  assert.equal(w.togethers, 1);
});

test('invites and games are shaped for the screen, and nothing private goes with them', async () => {
  const w = world(), { ask, posts } = await bridge(w);
  const status = (await ask('status')).result;
  assert.deepEqual(status, { signedIn: true, enrolled: true, name: 'Me' });
  const [invites, games, members] = [(await ask('invites')).result, (await ask('games')).result, (await ask('members')).result];
  assert.deepEqual(invites, [{ id: ROOM(1), host: 'Friend', mode: 'coop', at: '2026-11-09T18:00:00Z', players: ['Friend', 'Me'] }]);
  assert.deepEqual(games.live.map(g => [g.id, g.status, g.mode, g.round, g.host, g.you, g.winner]), [
    [ROOM(2), 'active', 'ffa', 12, true, { cpu: true, online: false }, null],
    [ROOM(3), 'completed', 'coop', 40, false, { cpu: false, online: true }, 'Friend']
  ]);
  assert.deepEqual(games.live[0].players, [{ name: 'Me', you: true, cpu: true, online: false, state: 'joined' }, { name: 'Friend', you: false, cpu: false, online: true, state: 'joined' }]);
  assert.deepEqual(games.turns, [{ with: 'Other', yourTurn: true }], 'only the two-player Civ Lite games, with a name and whose turn');
  assert.deepEqual(members.map(m => m.name), ['Friend', 'Other'], 'yourself is not a member to invite');
  // Everything the page was ever sent: names, room ids, opaque refs. No email, no token, no account id.
  const text = JSON.stringify(posts);
  assert.ok(!/@/.test(text), 'no email address');
  assert.ok(!text.includes(TOKEN), 'no token');
  assert.ok(!text.includes(ROOM_CODE), 'not even a room code: the lobby gets that from its own room, and only if it is seated');
  for (const id of [ME, FRIEND, OTHER]) assert.ok(!text.includes(id), 'no account id: ' + id);
  for (const key of ['"user"', '"email"', '"user_id"', 'access_token']) assert.ok(!text.includes(key), 'no ' + key);
  // The server was asked once for the list and once for the dashboard, however many things the screen asked for.
  assert.equal(w.calls.filter(c => c[1] === 'list').length, 1);
  assert.equal(w.calls.filter(c => c[1] === 'dashboard').length, 1);
});

test('host: members are picked by reference, the setup is cleaned, and the hub creates the room and opens it', async () => {
  const w = world(), { ask } = await bridge(w);
  const members = (await ask('members')).result;
  const friend = members.find(m => m.name === 'Friend').ref, other = members.find(m => m.name === 'Other').ref;
  assert.ok(!Object.values(members[0]).some(v => v === FRIEND || v === OTHER), 'the ref is not the account id');
  const settings = { map: 'islands', size: 'auto', level: 'normal', borders: 'tech', turns: 100.7, cpus: 2, timer: 60, wrap: false, conquest: true, science: false, unjoined: 'drop', mode: 'coop',
    host: 'someone-else', invite: ['user-x'], map2: 'x', turnsText: '5', cpusBad: NaN };
  const config = { map: 'islands', size: 'auto', level: 'normal', borders: 'tech', unjoined: 'drop', mode: 'coop', turns: 100, cpus: 2, timer: 60, wrap: false, conquest: true, science: false };
  const reply = await ask('host', { settings, invitees: [friend, other, friend] });
  assert.deepEqual(reply.result, { id: ROOM(9) });
  const create = w.calls.find(c => c[1] === 'create');
  // Without a number of human players, the room is as big as its invitations: the host and two friends.
  assert.deepEqual(create[2], { game: 'ashcrown', invite: [FRIEND, OTHER], capacity: 3, config });
  assert.deepEqual(w.opened, [ROOM(9)]);
  for (const bad of ['x', ['not-a-ref'], [friend, other, other, 'a', 'b'], [friend, FRIEND]]) {
    const r = await ask('host', { settings, invitees: bad });
    assert.ok(r.error, 'refused: ' + JSON.stringify(bad));
  }
  assert.equal(w.calls.filter(c => c[1] === 'create').length, 1, 'none of the bad ones created a room');
  // A member list is only good for the account and the moment it was read: a new list forgets the old refs.
  await ask('members');
  assert.ok((await ask('host', { settings, invitees: [friend] })).error, 'a ref from an earlier list is no longer valid');
});

test('host: nobody has to be invited, and the human players (2 to 4) are the room’s capacity', async () => {
  const w = world(), { ask } = await bridge(w);
  const members = (await ask('members')).result;
  const friend = members.find(m => m.name === 'Friend').ref, other = members.find(m => m.name === 'Other').ref;
  const created = () => w.calls.filter(c => c[1] === 'create').map(c => [c[2].invite, c[2].capacity]);
  // No invitations at all: just a room with a code to share, for two, three or four people.
  assert.deepEqual((await ask('host', { settings: {}, humans: 2 })).result, { id: ROOM(9) });
  await ask('host', { settings: {}, invitees: [], humans: 4 });
  await ask('host', { settings: {} });
  assert.deepEqual(created(), [[[], 2], [[], 4], [[], 2]]);
  // Some invitations and some seats left for the code.
  await ask('members');
  const again = (await ask('members')).result;
  const f2 = again.find(m => m.name === 'Friend').ref;
  await ask('host', { settings: {}, invitees: [f2], humans: 3 });
  assert.deepEqual(created().at(-1), [[FRIEND], 3]);
  // Not a number of players a room can have, and more invitations than seats, never reach the server.
  const count = created().length;
  for (const humans of [1, 5, 0, -2, 2.5, '3', NaN, true, {}]) assert.ok((await ask('host', { settings: {}, humans })).error, 'humans ' + JSON.stringify(humans));
  const fresh = (await ask('members')).result;
  const [a, b] = [fresh.find(m => m.name === 'Friend').ref, fresh.find(m => m.name === 'Other').ref];
  assert.match((await ask('host', { settings: {}, invitees: [a, b], humans: 2 })).error, /more invitations than seats/);
  assert.match((await ask('host', { settings: {}, invitees: ['x', 'y', 'z', 'w'], humans: 4 })).error, /Invite up to three/);
  assert.equal(created().length, count, 'none of those created a room');
  assert.ok(friend && other);
});

test('join-code: the code goes to the room call as typed, the hub opens the lobby, and a refusal reaches the page as its own message', async () => {
  const w = world(), { ask } = await bridge(w);
  w.impl.rpc = async (action, args) => { w.calls.push(['live', action, args]); return action === 'join_code' ? { id: ROOM(7), status: 'lobby', code: ROOM_CODE } : { ok: true }; };
  assert.deepEqual((await ask('join-code', { code: 'kx7-q2m' })).result, { id: ROOM(7) }, 'only the room id comes back, not the room');
  assert.deepEqual(w.calls.filter(c => c[1] === 'join_code').map(c => c[2]), [{ code: 'kx7-q2m' }]);
  assert.deepEqual(w.opened, [ROOM(7)]);
  assert.ok(!JSON.stringify((await ask('join-code', { code: 'KX7Q2M' }))).includes(ROOM_CODE), 'the code is not echoed to the page');
  // Not a string: refused here, nothing asked.
  const count = w.calls.length;
  for (const code of [undefined, null, 12, {}, ['KX7Q2M']]) assert.equal((await ask('join-code', { code })).error, 'No open room with that code');
  assert.equal(w.calls.length, count);
  // A long paste is cut before it is sent.
  await ask('join-code', { code: 'x'.repeat(5000) });
  assert.equal(w.calls.at(-1)[2].code.length, 40);
  // The server answers a wrong, full or started room as {ok:false, error}; a thrown error reads the same to the page.
  for (const error of ['No open room with that code', 'That room is full', 'That game has already started']) {
    w.impl.rpc = async () => ({ ok: false, error });
    const opened = w.opened.length;
    assert.equal((await ask('join-code', { code: 'KX7Q2M' })).error, error);
    assert.equal(w.opened.length, opened, 'nothing opened');
  }
  w.impl.rpc = async () => { throw Object.assign(new Error('Too many requests. Please try again later.'), { status: 400, secret: TOKEN }); };
  assert.equal((await ask('join-code', { code: 'KX7Q2M' })).error, 'Too many requests. Please try again later.');
  // The same account that asked is still the one signed in when the answer lands.
  w.impl.rpc = async () => { w.account = { id: OTHER, name: 'Other' }; return { id: ROOM(7) }; };
  assert.equal((await ask('join-code', { code: 'KX7Q2M' })).error, 'Your account changed. Please try again.');
});

test('join, decline and open go through the room calls Bored Together makes, and only for real room ids', async () => {
  const w = world(), { ask } = await bridge(w);
  assert.deepEqual((await ask('join', { invite: ROOM(1) })).result, { id: ROOM(1) });
  assert.deepEqual(w.calls.filter(c => c[0] === 'live').map(c => [c[1], c[2]]), [['join', { id: ROOM(1) }]]);
  assert.deepEqual(w.opened, [ROOM(1)]);
  await ask('decline', { invite: ROOM(1) });
  assert.deepEqual(w.calls.at(-1), ['live', 'leave_lobby', { id: ROOM(1) }]);
  await ask('open', { game: ROOM(2) });
  assert.deepEqual(w.opened, [ROOM(1), ROOM(2)]);
  const count = w.calls.length;
  for (const [op, payload] of [['join', { invite: 'nope' }], ['decline', {}], ['open', { game: '../../etc' }], ['open', { game: ROOM(2) + 'x' }], ['frobnicate', {}]]) {
    assert.ok((await ask(op, payload)).error, op + ' ' + JSON.stringify(payload));
  }
  assert.equal(w.calls.length, count, 'refused before any call');
  // A server refusal reaches the page as its message and nothing else.
  w.impl.rpc = async () => { throw Object.assign(new Error('This game has already started.'), { status: 400, secret: TOKEN }); };
  assert.deepEqual((await ask('join', { invite: ROOM(1) })).error, 'This game has already started.');
});

test('an answer is never handed to a page after the account changed; a change is announced and clears what was read', async () => {
  const w = world(), { b, ask, posts } = await bridge(w);
  const slow = new Promise(done => { w.release = done; });
  const together = w.impl.together;
  w.impl.together = async (action, args) => { if (action === 'dashboard') await slow; return together(action, args); };
  const pending = ask('status');
  await new Promise(r => setTimeout(r, 10));
  w.account = { id: OTHER, name: 'Other' };   // someone else signs in while the call is out
  w.release();
  assert.equal((await pending).error, 'Your account changed. Please try again.');
  assert.ok(!JSON.stringify(posts).includes('"signedIn":true'), 'the first account’s answer never arrived');
  w.impl.together = together;
  const n = w.calls.filter(c => c[1] === 'list').length;
  await ask('invites');
  b.accountChanged();
  assert.deepEqual(posts.at(-1), { channel: b.channel, type: 'bored:lobby-event', event: { event: 'account' } });
  await ask('invites');
  assert.equal(w.calls.filter(c => c[1] === 'list').length, n + 2, 'the list is read again for the new account, not served from the old one');
});

test('each document gets its own bridge script and channel', async () => {
  const { createLobbyBridge } = await lobby();
  const frame = { contentWindow: { postMessage() {} } };
  const one = createLobbyBridge({ frame, deps: world().deps }), two = createLobbyBridge({ frame, deps: world().deps });
  assert.notEqual(one.channel, two.channel);
  const html = one.document('<!doctype html><html><head><title>x</title></head><body></body></html>');
  assert.ok(html.includes('window.__boredLobby') && html.includes(JSON.stringify([one.channel])), 'the bridge and its channel are in the head');
  assert.ok(html.indexOf('window.__boredLobby') < html.indexOf('<title>'), 'before the game’s own script');
  assert.ok(!html.includes(two.channel));
  for (const word of ['token', 'Bearer', 'fetch(', 'XMLHttpRequest']) assert.ok(!html.includes(word), 'the bridge script has no ' + word);
});

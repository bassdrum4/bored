// sql/shotgun_roulette_multiplayer.sql on the real Bored Together schema (every migration, in
// PGlite): Shotgun Roulette rooms through bored_live's own lobby, start, action log and finish,
// and the Multiplayer leaderboard read from finished rooms.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { database, as, ids, enroll } = require('./together-db.cjs');
const [A, B, C, D, E] = ids; // WackyPenguin, BananaWizard, QuietOwl, NeverJoined, FourthPlayer
const SQL = fs.readFileSync(path.join(__dirname, '../sql/shotgun_roulette_multiplayer.sql'), 'utf8');
const ROOM = { unjoined: 'drop', cpus: 0, timer: 0, mode: 'ffa' };

test('Shotgun Roulette live rooms: lobby by code, ready check, 2-4 humans, no CPUs, agreed finish, leaderboard', async () => {
  const db = await database();
  for (const u of [A, B, C, D, E]) await enroll(db, u);
  const rpc = (user, action, args = {}) => as(db, user, async () => (await db.query('select public.bt_live_rpc($1,$2::jsonb) result', [action, JSON.stringify(args)])).rows[0].result);
  const top = () => as(db, null, async () => (await db.query('select * from public.shotgun_roulette_mp_top()')).rows);

  // Before the SQL: the server knows only Civ Lite.
  await assert.rejects(rpc(A, 'create', { game: 'shotgun-roulette', capacity: 4, config: ROOM }), /Unknown game/);
  await db.exec(SQL);
  await db.exec(SQL); // safe to run twice

  const room = await rpc(A, 'create', { game: 'shotgun-roulette', capacity: 4, config: ROOM });
  assert.equal(room.game, 'shotgun-roulette');
  assert.match(room.code, /^[A-Z0-9]{6}$/);
  assert.equal(room.capacity, 4);
  // Alone, the host can't start.
  await assert.rejects(rpc(A, 'start', { id: room.id }), /wait for a friend/i);
  for (const u of [B, C]) assert.notEqual((await rpc(u, 'join_code', { code: room.code })).ok, false);
  // Everyone who joined must be ready first.
  await assert.rejects(rpc(A, 'start', { id: room.id }), /ready/);
  for (const u of [B, C]) await rpc(u, 'lobby_set', { id: room.id, ready: true });
  const started = await rpc(A, 'start', { id: room.id });
  assert.equal(started.status, 'active');
  const seats = started.start.seats;
  assert.deepEqual(seats.map(s => [s.kind, s.handle]), [['human', 'WackyPenguin'], ['human', 'BananaWizard'], ['human', 'QuietOwl']], 'no CPUs, empty seats dropped');

  // The ordered action log carries the host's loads and everyone's moves.
  const send = (u, type, args) => rpc(u, 'send', { id: room.id, type, args, request_id: randomUUID() });
  assert.equal((await send(A, 'load', { n: 1, shells: [1, 0, 1], items: [[], [], []] })).seq, 1);
  assert.equal((await send(A, 'shoot', { turn: 1, target: 1 })).seq, 2);
  const read = await rpc(C, 'sync', { id: room.id, after: 0 });
  assert.deepEqual(read.actions.map(a => [a.seq, a.seat, a.type]), [[1, 0, 'load'], [2, 0, 'shoot']]);

  // The game ends once two players' screens agree on the winner (seat 1, BananaWizard).
  await rpc(A, 'finish', { id: room.id, winner: 1, why: 'won' });
  assert.equal((await rpc(A, 'game', { id: room.id })).status, 'active', 'one claim is not enough');
  await rpc(B, 'finish', { id: room.id, winner: 1, why: 'won' });
  assert.equal((await rpc(A, 'game', { id: room.id })).status, 'completed');

  // A second game, two players: QuietOwl beats WackyPenguin.
  const two = await rpc(A, 'create', { game: 'shotgun-roulette', capacity: 2, config: ROOM });
  await rpc(C, 'join_code', { code: two.code });
  await rpc(C, 'lobby_set', { id: two.id, ready: true });
  await rpc(A, 'start', { id: two.id });
  await rpc(A, 'finish', { id: two.id, winner: 1, why: 'won' });
  await rpc(C, 'finish', { id: two.id, winner: 1, why: 'won' });

  assert.deepEqual((await top()).map(r => [r.handle, Number(r.wins), Number(r.games)]),
    [['BananaWizard', 1, 1], ['QuietOwl', 1, 2], ['WackyPenguin', 0, 2]], 'wins first, then fewer games played');

  // Civ Lite is untouched: its rooms still open, and an unknown game is still refused.
  const civ = await rpc(D, 'create', { game: 'ashcrown', capacity: 2, config: { map: 'pangaea', cpus: 1 } });
  assert.equal(civ.game, 'ashcrown');
  await assert.rejects(rpc(E, 'create', { game: 'chess', capacity: 2, config: ROOM }), /Unknown game/);
  // A Civ Lite room never counts toward the Shotgun Roulette board.
  assert.equal((await top()).length, 3);
});

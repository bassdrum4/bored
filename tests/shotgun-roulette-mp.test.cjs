// Shotgun Roulette multiplayer: the rules engine in src/games/content/shotgun-roulette.html, cut out of
// the page and run here. Every screen replays the room's one action log, so the main promise is that
// screens fed the same log hold the same game, however the moves and loads land.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../src/games/content/shotgun-roulette.html'), 'utf8');
const between = (from, to) => {
  const a = html.indexOf(from), b = html.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, 'found ' + from);
  return html.slice(a, b);
};
const line = start => between(start, '\n');
const SOURCE = [
  line('const RULES ='), line('const rand ='), line('const shuffle ='), line('const emptyBoxes ='),
  between('const ITEMS = {', 'const YOU = 0'),
  between('function rollLoad()', '// The chance the shell in the chamber'),
  line('const MP_POS ='),
  between('const MP_SETTINGS =', 'const MP_POS ='),
  'let M = null, mpMe = 0;',
  between('// A fixed 0-1 number per (seed, turn)', '/* The screen. */'),
  'this.api = { mpGame, mpRound, mpApply, mpCompose, mpUp, mpRoll, mpHostSeat, mpParseSettings, mpSettingsCode, mpRollLoad, setView(m, me) { M = m; mpMe = me; } };'
].join('\n');

// One screen: its own copy of the rules (a separate VM), and a seat to look from.
function screen(seats, seed, me, code) {
  const box = {};
  vm.runInNewContext(SOURCE, box);
  const api = box.api, m = api.mpGame(seats.map(handle => ({ handle })), seed, code === undefined ? undefined : api.mpParseSettings(code));
  api.setView(m, me);
  api.mpRound(m);
  return { api, m, apply: action => api.mpApply(m, JSON.parse(JSON.stringify(action))) };
}
const state = m => JSON.stringify({ ...m, ev: undefined });
const NAMES = ['WackyPenguin', 'BananaWizard', 'QuietOwl', 'FourthPlayer'];

// Plays one random game: whoever's turn it is picks an item or a shot, the host's screen loads,
// now and then someone times out or leaves, and a few junk or stale actions are thrown in.
function playRandom(n, seed, random) {
  const seats = NAMES.slice(0, n), screens = seats.map((_, i) => screen(seats, seed, i));
  const log = [];
  const send = (seat, type, args) => {
    const action = { seq: log.length + 1, seat, type, args };
    log.push(action);
    for (const s of screens) s.apply(action);
  };
  const host = screens[0];
  for (let step = 0; step < 3000 && host.m.phase !== 'over'; step++) {
    const m = host.m;
    if (m.phase === 'load') { send(host.api.mpHostSeat(m), 'load', host.api.mpCompose(m)); continue; }
    const seat = m.turn, me = m.p[seat], roll = random();
    if (roll < 0.03) { send(seat, 'expire', { turn: m.turnNo }); continue; }
    if (roll < 0.04) { send((seat + 1) % n, 'shoot', { turn: m.turnNo, target: seat }); continue; }      // not their turn
    if (roll < 0.05) { send(seat, 'shoot', { turn: m.turnNo - 1, target: seat }); continue; }           // stale
    if (roll < 0.055 && n > 2) { send(Math.floor(random() * n), 'leave', {}); continue; }
    const boxes = me.items.map((k, b) => k ? b : -1).filter(b => b >= 0);
    if (boxes.length && roll < 0.45) {
      const target = Math.floor(random() * n);
      send(seat, 'item', { turn: m.turnNo, box: boxes[Math.floor(random() * boxes.length)], target });
      continue;
    }
    const up = m.p.map((_, i) => i).filter(i => host.api.mpUp(m, i));
    send(seat, 'shoot', { turn: m.turnNo, target: up[Math.floor(random() * up.length)] });
  }
  return { screens, log };
}
function seeded(a) { return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; }

test('every screen fed the same log holds the same game, 2 to 4 players', () => {
  const random = seeded(7);
  let finished = 0;
  for (let game = 0; game < 150; game++) {
    const n = 2 + game % 3;
    const { screens, log } = playRandom(n, 1000 + game, random);
    const first = screens[0].m;
    assert.equal(first.phase, 'over', 'game ' + game + ' ends');
    finished++;
    for (const s of screens.slice(1)) assert.equal(state(s.m), state(first), 'game ' + game + ': screens agree');
    // A screen that opens the game late (replaying the whole log at once) lands in the same place.
    const late = screen(NAMES.slice(0, n), 1000 + game, n - 1);
    for (const action of log) late.apply(action);
    assert.equal(state(late.m), state(first));
    assert.ok(first.winner >= 0 && first.winner < n);
    const standing = first.p.filter(p => !p.left).length;
    assert.ok(first.wins[first.winner] >= 2 || standing === 1, 'a winner took 2 rounds or is the last one at the table');
  }
  assert.equal(finished, 150);
});

test('the rules: turns, blanks at yourself, damage, rounds, paralysis, leaving', () => {
  const s = screen(['A', 'B', 'C'], 42, 0), m = s.m;
  assert.deepEqual([m.round, m.phase, m.turn, m.p.map(p => p.hp)], [1, 'load', 0, [2, 2, 2]]);
  // A load before it's due, or for the wrong round, or with only one kind of shell, is ignored.
  s.apply({ seq: 1, seat: 0, type: 'load', args: { round: 2, n: 1, shells: [1, 0, 1], items: [[], [], []] } });
  s.apply({ seq: 2, seat: 0, type: 'load', args: { round: 1, n: 1, shells: [1, 1, 1], items: [[], [], []] } });
  assert.equal(m.phase, 'load');
  s.apply({ seq: 3, seat: 0, type: 'load', args: { round: 1, n: 1, shells: [0, 1, 1, 0], items: [['potion', 'wave'], ['band'], ['scope', 'nonsense']] } });
  assert.equal(m.phase, 'turn');
  assert.equal(JSON.stringify(m.p.map(p => p.items.filter(Boolean))), JSON.stringify([['potion', 'wave'], ['band'], ['scope']]));
  const turn = () => m.turnNo;
  // Seat 1 can't shoot on seat 0's turn.
  s.apply({ seq: 4, seat: 1, type: 'shoot', args: { turn: turn(), target: 0 } });
  assert.equal(m.shells.length, 4);
  // A blank at yourself keeps the turn.
  s.apply({ seq: 5, seat: 0, type: 'shoot', args: { turn: turn(), target: 0 } });
  assert.deepEqual([m.turn, m.shells.length, m.p[0].hp], [0, 3, 2]);
  // Thunder Wave on seat 1, then a live shot at seat 2: the turn moves clockwise to seat 1, who is paralyzed.
  s.apply({ seq: 6, seat: 0, type: 'item', args: { turn: turn(), box: 1, target: 1 } });
  assert.equal(m.p[1].para, true);
  s.apply({ seq: 7, seat: 0, type: 'shoot', args: { turn: turn(), target: 2 } });
  assert.equal(m.p[2].hp, 1);
  assert.equal(m.p[1].para, false, 'paralysis is spent at the start of their turn');
  const stuck = s.api.mpRoll(42, m.turnNo - 1) < 0.5;
  assert.equal(m.turn, stuck ? 2 : 1, 'the seeded roll decides, the same on every screen');
  // Leaving puts the seat out for good; two players left keep playing.
  s.apply({ seq: 8, seat: 2, type: 'leave', args: {} });
  assert.deepEqual([m.p[2].left, m.p[2].out, m.phase === 'over'], [true, true, false]);
  assert.notEqual(m.turn, 2);
  // The next leaver hands the game to the last player at the table.
  s.apply({ seq: 9, seat: 1, type: 'leave', args: {} });
  assert.deepEqual([m.phase, m.winner], ['over', 0]);
});

test('an expired turn fires at the player whose turn it was, once', () => {
  const s = screen(['A', 'B'], 9, 1), m = s.m;
  s.apply({ seq: 1, seat: 0, type: 'load', args: { round: 1, n: 1, shells: [1, 0, 0], items: [[], []] } });
  const t = m.turnNo;
  s.apply({ seq: 2, seat: 1, type: 'expire', args: { turn: t } });
  assert.equal(m.p[0].hp, 1, 'seat 0 shot themself with the live shell');
  s.apply({ seq: 3, seat: 0, type: 'expire', args: { turn: t } });
  assert.equal(m.shells.length, 2, 'a second expiry for the same turn does nothing');
});

test('round HP goes 2, 3, 4 and the first player moves clockwise each round', () => {
  const s = screen(['A', 'B', 'C'], 5, 0), m = s.m;
  for (let round = 1; round <= 3; round++) {
    assert.equal(m.round, round);
    assert.equal(m.turn, (round - 1) % 3);
    assert.ok(m.p.every(p => p.hp === [2, 3, 4][round - 1]));
    // Loads are all live but one, and each player fires at the next one still standing.
    let seq = 100 * round;
    while (m.round === round && m.phase !== 'over') {
      if (m.phase === 'load') { s.apply({ seq: ++seq, seat: 0, type: 'load', args: { round: m.round, n: m.loads + 1, shells: [1, 1, 1, 1, 1, 1, 1, 0], items: [[], [], []] } }); continue; }
      const target = [0, 1, 2].find(i => i !== m.turn && s.api.mpUp(m, i));
      s.apply({ seq: ++seq, seat: m.turn, type: 'shoot', args: { turn: m.turnNo, target } });
    }
    if (m.phase === 'over') break;
  }
  assert.equal(m.phase, 'over');
  assert.equal(Math.max(...m.wins), 2);
});

test('reload rule, multiplayer: a last-shell blank at yourself keeps the gun for the next load, every time', () => {
  const s = screen(['A', 'B', 'C'], 3, 0), m = s.m;
  let seq = 0;
  const load = (shells, items = [[], [], []]) => s.apply({ seq: ++seq, seat: 0, type: 'load', args: { round: m.round, n: m.loads + 1, shells, items } });
  const shoot = (seat, target) => s.apply({ seq: ++seq, seat, type: 'shoot', args: { turn: m.turnNo, target } });
  const logs = [];
  const watch = () => logs.push(...m.ev.filter(e => e.t === 'log').map(e => e.text));
  // Load 1, started by seat 0. Seat 1 fires the last shell, a blank at themself: seat 1 starts load 2.
  load([1, 0, 0]);
  shoot(0, 1); assert.equal(m.turn, 1);
  shoot(1, 1); shoot(1, 1); watch();
  assert.deepEqual([m.phase, m.turn], ['load', 1]);
  assert.match(logs.join(' '), /Blank! You keep the gun|Blank! B keeps the gun for the next load\./);
  // Load 2, started by seat 1, who ejects the live shell and blanks out the load again: still seat 1 (no limit).
  load([1, 0, 0], [[], ['eject'], []]);
  assert.equal(m.turn, 1);
  s.apply({ seq: ++seq, seat: 1, type: 'item', args: { turn: m.turnNo, box: 0 } });
  shoot(1, 1); shoot(1, 1); watch();
  assert.deepEqual([m.phase, m.turn], ['load', 1], 'the starter of the load keeps the gun again');
  // Load 3: the last shell is live at someone else, so the next player clockwise starts.
  load([0, 0, 1]);
  shoot(1, 1); shoot(1, 1); shoot(1, 0); watch();
  assert.deepEqual([m.phase, m.turn, m.p[0].hp], ['load', 2, 1]);
  assert.doesNotMatch(logs.join(' '), /already started/, 'multiplayer never says the single-player exception');
});

test('reload rule, single player: the same, except for whoever started the load that just ended', () => {
  const source = html.slice(html.indexOf('function nextTurn('), html.indexOf('// Resolve a shot by side i'));
  const box = { g: null };
  vm.runInNewContext(source + '\nthis.nextTurn = nextTurn;', box);
  const YOU = 0, FOE = 1;
  box.g = { shells: [], loadStarter: FOE };
  assert.equal(box.nextTurn(YOU, true, false), YOU, 'a last blank at yourself, and Giratina started the load: you keep the gun');
  box.g = { shells: [], loadStarter: YOU };
  assert.equal(box.nextTurn(YOU, true, false), FOE, 'you started this load too: the gun passes');
  box.g = { shells: [], loadStarter: FOE };
  assert.equal(box.nextTurn(YOU, true, true), FOE, 'a live last shell passes as before');
  assert.equal(box.nextTurn(YOU, false, false), FOE, 'a last blank at Giratina passes as before');
  box.g = { shells: [true], loadStarter: YOU };
  assert.equal(box.nextTurn(YOU, true, false), YOU, 'mid-load, a blank at yourself always keeps the turn');
  assert.match(html, /function reload\(\) \{\s*\/\/[^\n]*\n\s*g\.loadStarter = g\.turn;/, 'every load records who starts it');
});

test('the 3D table gives every seat its own 4x2 item grid in its own quarter of the table', () => {
  const slot = new Function('return ' + line('const SLOT =').replace('const SLOT =', '').replace(/;\s*$/, ''))();
  const ROT = { bottom: 0, right: Math.PI / 2, top: Math.PI, left: -Math.PI / 2 };
  const all = [];
  for (const [pos, a] of Object.entries(ROT)) {
    for (let k = 0; k < 8; k++) {
      const [x, z] = slot(k);
      const w = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
      // Nearer to its own edge than to any other seat's: |along the seat's axis| beats |across it|.
      const toward = [Math.sin(a), Math.cos(a)], along = w[0] * toward[0] + w[1] * toward[1];
      assert.ok(along > Math.abs(w[0] * toward[1] - w[1] * toward[0]), pos + ' box ' + k + ' sits in front of its own seat');
      all.push(w);
    }
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
    assert.ok(Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]) >= 0.5, 'boxes ' + i + ' and ' + j + ' are at least a slot apart');
});

test('host settings: the room code, one round, fixed HP, and rooms from before settings', () => {
  const { api } = screen(['A', 'B'], 1, 0);
  assert.equal(JSON.stringify(api.mpParseSettings('r1-h3-t20')), JSON.stringify({ rounds: 1, hp: 3, timer: 20 }));
  assert.equal(JSON.stringify(api.mpParseSettings('r3-he-t15')), JSON.stringify({ rounds: 3, hp: 'e', timer: 15 }));
  assert.equal(api.mpSettingsCode({ rounds: 3, hp: 4, timer: 30 }), 'r3-h4-t30');
  assert.match(api.mpSettingsCode({ rounds: 3, hp: 'e', timer: 30 }), /^[a-z0-9-]{1,24}$/, 'fits the room config\'s map field');
  assert.equal(JSON.stringify(api.mpParseSettings('pangaea')), JSON.stringify({ rounds: 3, hp: 'e', timer: 30 }), 'an older room keeps its old rules');

  // One round, 3 HP: the last one standing wins the table at once.
  const s = screen(['A', 'B', 'C'], 2, 0, 'r1-h3-t20'), m = s.m;
  assert.deepEqual(m.p.map(p => p.hp), [3, 3, 3]);
  let seq = 0;
  const load = shells => s.apply({ seq: ++seq, seat: 0, type: 'load', args: { round: m.round, n: m.loads + 1, shells, items: [[], [], []] } });
  const shoot = (seat, target) => s.apply({ seq: ++seq, seat, type: 'shoot', args: { turn: m.turnNo, target } });
  load([1, 1, 1, 1, 1, 1, 1, 0]);
  const fire = (target, who) => { assert.equal(m.turn, who); shoot(who, target); };
  fire(1, 0); fire(2, 1); fire(1, 2); fire(1, 0);                    // B takes 3: out
  assert.equal(m.p[1].out, true);
  fire(2, 2); fire(2, 0);                                            // C takes 3: out
  assert.deepEqual([m.phase, m.winner, m.round], ['over', 0, 1], 'one round, last one standing wins');

  // Three rounds with fixed 4 HP: every round starts at 4.
  const t = screen(['A', 'B'], 3, 0, 'r3-h4-t30');
  assert.deepEqual(t.m.p.map(p => p.hp), [4, 4]);
});

test('the Remote reverses the turn order, only with 3 or more still in', () => {
  const s = screen(['A', 'B', 'C', 'D'], 4, 0, 'r1-h3-t20'), m = s.m;
  let seq = 0;
  s.apply({ seq: ++seq, seat: 0, type: 'load', args: { round: 1, n: 1, shells: [0, 0, 0, 1], items: [['remote'], [], [], []] } });
  assert.equal(m.turn, 0);
  s.apply({ seq: ++seq, seat: 0, type: 'item', args: { turn: m.turnNo, box: 0 } });
  assert.equal(m.dir, -1);
  s.apply({ seq: ++seq, seat: 0, type: 'shoot', args: { turn: m.turnNo, target: 1 } });   // a blank at B
  assert.equal(m.turn, 3, 'counterclockwise: from seat 0 to seat 3');
  // With only two still in, a Remote does nothing and stays in the box.
  const two = screen(['A', 'B'], 5, 0, 'r1-h3-t20');
  two.apply({ seq: 1, seat: 0, type: 'load', args: { round: 1, n: 1, shells: [0, 1, 1], items: [['remote'], []] } });
  two.apply({ seq: 2, seat: 0, type: 'item', args: { turn: two.m.turnNo, box: 0 } });
  assert.deepEqual([two.m.dir, two.m.p[0].items[0]], [1, 'remote']);
  // A new round turns clockwise again.
  assert.match(html, /m\.round\+\+;\s*m\.dir = 1;/);
});

test('multiplayer loads are 1/2 to 2/3 live, with a blank in every load', () => {
  const { api } = screen(['A', 'B'], 1, 0);
  for (let k = 0; k < 4000; k++) {
    const { total, live } = api.mpRollLoad();
    assert.ok(total >= 3 && total <= 8);
    assert.ok(live >= Math.ceil(total / 2) && live <= Math.max(Math.ceil(total / 2), Math.floor(total * 2 / 3)) && live < total, total + '/' + live);
  }
});

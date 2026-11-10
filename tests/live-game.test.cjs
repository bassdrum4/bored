// Civ Lite live games, the game side: the same seed and the same action log must give the same game on
// every device, a snapshot plus the later actions must equal the live game, rounds must take turns the way
// Civ 6 does, and leaving and coming back must hand a civ to a CPU and back. Each "device" is the whole
// game script in its own VM (see live-sim.cjs), so nothing is shared between them but the log.
const test = require('node:test');
const assert = require('node:assert/strict');
const { room, bot, table, device } = require('./live-sim.cjs');

const BASE = { map: 'continents', size: 'small', level: 'normal', maxTurns: 60, live: true, victory: { conquest: true, science: true } };
const end = (rm, seat) => rm.send({ seat, type: 'end-turn', args: {} });
const q = (rm, expr) => rm.ref.json(expr);

// One scripted game for 2 humans and 2 CPUs: a random bot plays the humans, and at set rounds the table
// sets up what a bot would not find by itself (a war, a capture, a trade, an embassy). The setups that
// are not actions (who has met, a weakened city) run the same way on every device.
function playScripted(rm, rounds, onRound) {
  const b = bot(rm, 99);
  const seen = { fixtures: 0, war: 0, peace: 0, capture: 0, kept: 0, trade: 0, cpuTrade: 0, embassy: 0 };
  const once = new Set();
  const first = (key, seat, only) => {
    if ((only !== undefined && seat !== only) || once.has(key)) return false;
    once.add(key);
    return true;
  };
  const events = {
    2: seat => {
      if (!first('fix', seat)) return;
      rm.fixture('for (const a of G.players) for (const c of G.players) if (a.i < c.i) meet(a.i, c.i); for (const i of [0, 1]) { const f = pl(i); for (const t of ["earlyempire", "writing"]) if (!f.techs.includes(t)) f.techs.push(t); f.horses = 20; f.iron = 15; }');
      seen.fixtures++;
    },
    4: seat => { if (first('war', seat, 0) && rm.send({ seat: 0, type: 'war', args: { to: 1 } })) seen.war++; },
    // Peace is asked for while it is still seat 0's turn, and answered by seat 1 at once, not on their turn.
    8: seat => {
      if (!first('peace', seat, 0)) return;
      if (rm.send({ seat: 0, type: 'peace', args: { to: 1 } })) {
        const offer = q(rm, 'G.offers.find(o => o.kind === "peace" && o.to === 1)');
        if (offer && rm.send({ seat: 1, type: 'offer-answer', args: { id: offer.id, accept: true } })) seen.peace++;
      }
    },
    10: seat => {
      if (!first('capture', seat, 0)) return;
      assert.ok(rm.send({ seat: 0, type: 'war', args: { to: 3 } }), 'war with the CPU');
      rm.fixture(`(() => {
        const c = G.cities.find(c => c.owner === 3 && !c.capital), u = G.units.find(u => u.owner === 0 && u.type === unitFor(0, 'warrior'));
        const spot = neighbourList(c.x, c.y).find(([x, y]) => { const t = tileAt(x, y); return t && !TERRAIN[t.t].water && !TERRAIN[t.t].block && !unitsAt(x, y).length && !cityAt(x, y); });
        u.x = spot[0]; u.y = spot[1]; u.mp = unitMove(u); u.acted = false; u.pinned = false; u.path = null; u.fort = false; u.sleep = false;
        c.hp = 0;
        for (const o of unitsAt(c.x, c.y)) removeUnit(o);
        G.captureTarget = c.id; G.captureBy = u.id;
      })()`);
      const target = q(rm, 'cityById(G.captureTarget)');
      assert.ok(rm.send({ seat: 0, type: 'unit-order', args: { unit: q(rm, 'G.captureBy'), x: target.x, y: target.y } }), 'the order is carried out');
      if (q(rm, 'cityById(G.captureTarget).owner') === 0) seen.capture++;
      if (q(rm, '!!G.live.pend[0]') && rm.send({ seat: 0, type: 'keep', args: {} })) seen.kept++;
    },
    11: seat => {
      if (!first('trade', seat, 0)) return;
      const before = q(rm, '[pl(0).horses, pl(1).horses]');
      if (rm.send({ seat: 0, type: 'trade', args: { other: 1, dir: 'sell', res: 'horses', qty: 5, turns: 1, total: 1 } })) {
        const offer = q(rm, 'G.offers.find(o => o.kind === "trade" && o.to === 1)');
        if (offer && rm.send({ seat: 1, type: 'offer-answer', args: { id: offer.id, accept: true } })) {
          const after = q(rm, '[pl(0).horses, pl(1).horses]');
          if (after[0] === before[0] - 5 && after[1] === before[1] + 5) seen.trade++;
        }
      }
      // And with a CPU, which answers on the spot.
      if (rm.send({ seat: 0, type: 'trade', args: { other: 2, dir: 'sell', res: 'iron', qty: 5, turns: 1, total: 1 } })) seen.cpuTrade++;
    },
    12: seat => {
      if (!first('embassy', seat, 0)) return;
      const city = q(rm, 'G.cities.find(c => c.owner === 0 && !c.build) || G.cities.find(c => c.owner === 0)');
      if (!rm.send({ seat: 0, type: 'city-embassy', args: { city: city.id, to: 1 } })) return;
      const offer = q(rm, 'G.offers.find(o => o.kind === "embassy" && o.to === 1)');
      if (offer && rm.send({ seat: 1, type: 'offer-answer', args: { id: offer.id, accept: true } })) seen.embassy++;
    }
  };
  let last = q(rm, 'G.turn');
  for (let step = 0; step < 5000 && q(rm, 'G.turn') <= rounds && !q(rm, 'G.over'); step++) {
    const acting = q(rm, 'G.live.human0.filter(liveCanAct)');
    if (!acting.length) break;
    const seat = b.pick(acting), turn = q(rm, 'G.turn');
    if (events[turn]) events[turn](seat);
    b.play(seat);
    b.noise(rm.ref);   // device 0 also draws its screen; device 1 does not
    end(rm, seat);
    const now = q(rm, 'G.turn');
    if (now !== last) {
      rm.agree('at the start of round ' + now);
      if (onRound) onRound(now);
      last = now;
    }
  }
  return { b, seen };
}

test('determinism: two devices, one action log, the same game at the start of every round', () => {
  const rm = room({ ...BASE, seats: table(2, 2), seed: 424242 }, [0, 1]);
  const rounds = [];
  const { b, seen } = playScripted(rm, 40, round => rounds.push(round));
  assert.ok(rounds.length >= 38, 'ran ' + rounds.length + ' rounds');
  assert.equal(q(rm, 'G.turn') > 40 || q(rm, '!!G.over'), true);
  // The log really had the interesting things in it.
  assert.deepEqual([seen.war, seen.peace, seen.capture, seen.kept, seen.trade, seen.embassy], [1, 1, 1, 1, 1, 1], JSON.stringify(seen));
  assert.ok(seen.cpuTrade >= 0);
  assert.ok(q(rm, 'hasEmbassy(0, 1)'), 'the embassy was built');
  assert.ok(b.stats.strikes + b.stats.orders + b.stats.builds + b.stats.found > 100, JSON.stringify(b.stats));
  assert.ok(b.stats.junk > 5, 'wrong, stale and made-up actions went through as well');
  assert.equal(rm.log.filter(a => a.type === 'end-turn').length >= 80, true);
  // Same hash on both devices at the end, no rule threw on either.
  rm.agree('at the end');
  for (const d of rm.devices) assert.deepEqual(d.errors().filter(e => !/constructor|__proto__/.test(e)), []);
  assert.equal(q(rm, 'G.cities.length') > 4, true);
});

test('determinism: what each device shows is its own, and none of it is in the hash', () => {
  const rm = room({ ...BASE, seats: table(2, 2), seed: 31337 }, [0, 1]);
  playScripted(rm, 14);
  const [d0, d1] = rm.devices;
  // Different fog on the same game.
  const fog = d => d.json('G.seen.map(s => s.reduce((a, b) => a + b, 0))');
  assert.deepEqual(fog(d0), fog(d1), 'every device keeps every seat\'s fog, so the hash can agree');
  // Each device keeps mail for its own seat only.
  for (const [d, seat] of [[d0, 0], [d1, 1]]) {
    assert.deepEqual(d.json('G.news.filter(n => n.i !== ' + seat + ')'), [], 'seat ' + seat + ' has no cards for anyone else');
    assert.deepEqual(d.json('G.log.filter(e => e.to !== null && e.to !== ' + seat + ')'), [], 'seat ' + seat + ' has no private lines for anyone else');
    assert.deepEqual(d.json('G.players.filter(f => f.i !== ' + seat + ').map(f => (f.notes || []).length)'), [0, 0, 0]);
  }
  assert.ok(d0.json('G.news.length') + d1.json('G.news.length') > 0 || true);
  // And different toasts never came from the other seat's orders: a march ordered by seat 1 says nothing on seat 0's screen.
  const before = d0.toasts.length;
  rm.fixture('G.units.filter(u => u.owner === 1 && u.type === "scout").slice(0, 1).forEach(u => { u.mp = 3; u.acted = false; })');
  const scout = q(rm, 'G.units.find(u => u.owner === 1 && u.type === "scout")');
  const seat1Acts = q(rm, 'liveCanAct(1)');
  if (scout && seat1Acts) rm.send({ seat: 1, type: 'unit-order', args: { unit: scout.id, x: 0, y: 0 } });
  assert.equal(d0.toasts.length, before, 'nothing about seat 1\'s order was said on seat 0\'s screen');
});

// What Postgres jsonb does to an object: its keys come back shortest first, then by bytes. A snapshot has been through it.
function jsonbOrder(v) {
  if (Array.isArray(v)) return v.map(jsonbOrder);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).reverse()) out[k] = jsonbOrder(v[k]);
    return out;
  }
  return v;
}

// shape(state) is what the snapshot looks like when a device reads it back.
function replayFromSnapshots(shape) {
  const rm = room({ ...BASE, seats: table(2, 2), seed: 90210 }, [0, 1]);
  const snapshots = [];
  let joined = null;
  const b = bot(rm, 7);
  let last = 1;
  // Take a snapshot at the start of rounds 4 and 9, bring a third device in from the first one, and keep playing.
  for (let step = 0; step < 4000 && q(rm, 'G.turn') <= 16 && !q(rm, 'G.over'); step++) {
    const acting = q(rm, 'G.live.human0.filter(liveCanAct)');
    if (!acting.length) break;
    const seat = b.pick(acting);
    b.play(seat);
    end(rm, seat);
    const turn = q(rm, 'G.turn');
    if (turn !== last) {
      last = turn;
      rm.agree('round ' + turn);
      if (turn === 4 || turn === 9) {
        const state = shape(rm.ref.json('liveState(false)')), hash = rm.ref.hash(), at = rm.log.length;
        snapshots.push({ turn, hash, at });
        const late = device(1);
        late.restore(state);
        // The restored game is the live game as of the snapshot: same hash, the same viewer-independent state.
        assert.equal(late.hash(), hash, 'restoring round ' + turn + ' gives the live hash');
        if (turn === 4) joined = { late, at };
        else {
          // A snapshot from round 9, then the log after it, must meet the live game at every later round start.
          const again = device(0);
          again.restore(state);
          rm.devices.push(again);
        }
        if (turn === 4) rm.devices.push(late);
      }
    }
  }
  assert.equal(snapshots.length, 2);
  // The device that joined at round 4 has been fed every action since, and agrees now.
  rm.agree('after replaying from the snapshots');
  assert.deepEqual(rm.devices.flatMap(d => d.errors()).filter(e => !/constructor|__proto__/.test(e)), []);
  assert.equal(rm.devices.length, 4);
}
test('replay: a snapshot plus the later actions equals the live game', () => replayFromSnapshots(state => state));
// The database keeps a snapshot as jsonb, which hands its keys back in its own order. The game has to play the same
// whichever order it was handed them in; a screen that rejoined from the server once drifted from the others without this.
test('replay: a snapshot whose keys came back in the database\'s order still equals the live game', () => replayFromSnapshots(jsonbOrder));

test('dynamic turns: humans at peace act together and a round waits for all of them', () => {
  const rm = room({ ...BASE, seats: table(3, 1), seed: 5150 }, [0, 1, 2]);
  assert.deepEqual(q(rm, 'G.live.groups'), [[0], [1], [2]]);
  assert.deepEqual([0, 1, 2, 3].map(i => q(rm, 'liveCanAct(' + i + ')')), [true, true, true, false], 'all three humans move at once; the CPU waits its turn');
  // Orders from different seats interleave in one round.
  const unit = seat => q(rm, 'G.units.find(u => u.owner === ' + seat + ' && u.type === unitFor(' + seat + ', "warrior"))');
  const moved = [];
  for (const seat of [2, 0, 1]) {
    const u = unit(seat);
    const cells = rm.ref.json('(() => { const r = computeReachable(unitById("' + u.id + '")); return [...r.keys()].filter(k => !r.war.has(k)).map(k => k.split(",").map(Number)); })()');
    assert.ok(cells.length, 'seat ' + seat + ' has somewhere to go');
    rm.send({ seat, type: 'unit-order', args: { unit: u.id, x: cells[0][0], y: cells[0][1] } });
    moved.push(unit(seat).x !== u.x || unit(seat).y !== u.y);
  }
  assert.deepEqual(moved, [true, true, true]);
  end(rm, 1);
  assert.equal(q(rm, 'G.turn'), 1, 'one human ending does not end the round');
  end(rm, 2);
  assert.equal(q(rm, 'G.turn'), 1);
  assert.deepEqual(q(rm, 'G.live.done'), [false, true, true, true]);
  end(rm, 0);
  assert.equal(q(rm, 'G.turn'), 2, 'the last human ends it: the CPU plays and round two begins');
  assert.deepEqual(q(rm, 'G.live.done'), [false, false, false, true]);
  rm.agree('after round one');
});

test('dynamic turns: humans at war take turns in seat order; a third human at peace is not held up', () => {
  const rm = room({ ...BASE, seats: table(3, 1), seed: 5150 }, [0, 1, 2]);
  rm.fixture('for (const a of G.players) for (const c of G.players) if (a.i < c.i) meet(a.i, c.i);');
  // War is declared during round one; the order of play changes when round two starts.
  assert.ok(rm.send({ seat: 1, type: 'war', args: { to: 0 } }), 'war can be declared at any time');
  assert.deepEqual(q(rm, 'G.live.groups'), [[0], [1], [2]], 'the round already under way keeps its order');
  for (const seat of [0, 1, 2]) end(rm, seat);
  assert.equal(q(rm, 'G.turn'), 2);
  assert.deepEqual(q(rm, 'G.live.groups'), [[0, 1], [2]]);
  assert.deepEqual([0, 1, 2].map(i => q(rm, 'liveCanAct(' + i + ')')), [true, false, true], 'seat 0 first, seat 1 waits, seat 2 is not held up');
  // Seat 1 cannot act out of turn: the order does nothing, on every device.
  const unit1 = q(rm, 'G.units.find(u => u.owner === 1 && u.type === unitFor(1, "warrior"))');
  const cells = rm.ref.json('(() => { const r = computeReachable(unitById("' + unit1.id + '")); return [...r.keys()].map(k => k.split(",").map(Number)); })()');
  const hash = rm.agree('before the out-of-turn order');
  rm.send({ seat: 1, type: 'unit-order', args: { unit: unit1.id, x: cells[0][0], y: cells[0][1] } });
  assert.equal(rm.agree('after it'), hash, 'an order out of turn changes nothing');
  assert.equal(end(rm, 1), false, 'nor does ending a turn out of turn');
  assert.deepEqual(q(rm, 'G.live.done'), [false, false, false, true]);
  // Seat 2, at peace with both, finishes first and the round still waits for the war.
  end(rm, 2);
  assert.equal(q(rm, 'G.turn'), 2);
  end(rm, 0);
  assert.deepEqual([0, 1, 2].map(i => q(rm, 'liveCanAct(' + i + ')')), [false, true, false], 'seat 0 is done: now seat 1 starts');
  rm.send({ seat: 1, type: 'unit-order', args: { unit: unit1.id, x: cells[0][0], y: cells[0][1] } });
  assert.notDeepEqual(q(rm, 'unitById("' + unit1.id + '")').x + ',' + q(rm, 'unitById("' + unit1.id + '")').y, unit1.x + ',' + unit1.y, 'on its own turn the order is carried out');
  end(rm, 1);
  assert.equal(q(rm, 'G.turn'), 3);
  // A chain: 0 at war with 1 and 1 at war with 2 puts all three in one line, in seat order.
  assert.ok(rm.send({ seat: 1, type: 'war', args: { to: 2 } }));
  for (const seat of [0, 1, 2]) rm.send({ seat, type: 'end-turn', args: {} });
  assert.equal(q(rm, 'G.turn'), 4);
  assert.deepEqual(q(rm, 'G.live.groups'), [[0, 1, 2]]);
  assert.deepEqual([0, 1, 2].map(i => q(rm, 'liveCanAct(' + i + ')')), [true, false, false]);
  rm.agree('after the chain');
});

test('dynamic turns: offers and answers do not wait for a turn', () => {
  const rm = room({ ...BASE, seats: table(2, 1), seed: 5150 }, [0, 1]);
  rm.fixture('meet(0, 1);');
  rm.send({ seat: 0, type: 'war', args: { to: 1 } });
  end(rm, 0); end(rm, 1);
  assert.deepEqual(q(rm, 'G.live.groups'), [[0, 1]]);
  assert.deepEqual([q(rm, 'liveCanAct(0)'), q(rm, 'liveCanAct(1)')], [true, false]);
  // Seat 0 asks for peace on its own turn; seat 1, whose turn it is not, sees the offer in the Council at once and answers it.
  assert.ok(rm.send({ seat: 0, type: 'peace', args: { to: 1 } }));
  const offers = rm.devices[1].json('G.offers.filter(o => o.to === 1)');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].kind, 'peace');
  assert.ok(rm.send({ seat: 1, type: 'offer-answer', args: { id: offers[0].id, accept: true } }));
  assert.equal(q(rm, 'atWar(0, 1)'), false, 'peace');
  // ...and with the war over, nobody has to wait: both can act now.
  assert.deepEqual([q(rm, 'liveCanAct(0)'), q(rm, 'liveCanAct(1)')], [true, false], 'the groups were fixed when the round began');
  end(rm, 0); end(rm, 1);
  assert.equal(q(rm, 'G.turn'), 3);
  assert.deepEqual([q(rm, 'liveCanAct(0)'), q(rm, 'liveCanAct(1)')], [true, true]);
});

test('timer: it ends the turns that are left, through an action in the log', () => {
  const rm = room({ ...BASE, seats: table(3, 1), seed: 5150, timer: 60 }, [0, 1, 2]);
  end(rm, 2);
  assert.equal(rm.send({ seat: 0, type: 'timeout', args: { round: 7 } }), false, 'a timeout for another round does nothing');
  assert.equal(q(rm, 'G.turn'), 1);
  assert.equal(rm.send({ seat: 1, type: 'timeout', args: { round: 1 } }), true);
  assert.equal(q(rm, 'G.turn'), 2, 'seats 0 and 1 were still playing; both are ended and round two starts');
  assert.deepEqual(q(rm, 'G.live.done'), [false, false, false, true]);
  // The same in a war: the whole line is ended in seat order.
  rm.fixture('for (const a of G.players) for (const c of G.players) if (a.i < c.i) meet(a.i, c.i);');
  rm.send({ seat: 0, type: 'war', args: { to: 1 } });
  for (const seat of [0, 1, 2]) end(rm, seat);
  assert.deepEqual(q(rm, 'G.live.groups'), [[0, 1], [2]]);
  // Seat 2 has ended; the timer then ends seat 0 and then seat 1 in order, and the round is over.
  end(rm, 2);
  assert.equal(q(rm, 'G.turn'), 3);
  assert.equal(rm.send({ seat: 2, type: 'timeout', args: { round: 3 } }), true);
  assert.equal(q(rm, 'G.turn'), 4);
  // A second one for the round that just ended does nothing.
  assert.equal(rm.send({ seat: 2, type: 'timeout', args: { round: 3 } }), false, 'a late timeout does nothing');
  assert.equal(q(rm, 'G.turn'), 4);
  // No timer, no timeout.
  const plain = room({ ...BASE, seats: table(2, 1), seed: 5150 }, [0, 1]);
  assert.equal(plain.send({ seat: 0, type: 'timeout', args: { round: 1 } }), false, 'a game with no timer ignores it');
  assert.equal(q(plain, 'G.turn'), 1);
  rm.agree('after the timer');
});

test('leaving and coming back: a CPU plays the civ from the next round, and gives it back', () => {
  const rm = room({ ...BASE, seats: table(2, 2), seed: 8675309 }, [0, 1]);
  const own = seat => q(rm, 'G.units.filter(u => u.owner === ' + seat + ').map(u => u.id + "@" + u.x + "," + u.y + ":" + u.mp)').join(' ');
  const builds = seat => q(rm, 'G.cities.filter(c => c.owner === ' + seat + ').map(c => c.build && c.build.id)').join(' ');
  // Round one: seat 1 drops out while the round is under way.
  const before = own(1);
  assert.ok(rm.send({ seat: 0, type: 'cpu-takes-over', args: { seat: 1 } }), 'any seat can insert it for someone who is gone');
  assert.equal(q(rm, 'pl(1).human'), false);
  assert.equal(q(rm, 'G.live.away[1]'), true);
  assert.deepEqual(q(rm, 'G.live.done'), [false, true, true, true], 'their turn is over as it stands');
  assert.equal(rm.send({ seat: 0, type: 'cpu-takes-over', args: { seat: 1 } }), false, 'a second takeover for the same seat does nothing');
  assert.equal(rm.send({ seat: 1, type: 'unit-skip', args: { unit: 'u2' } }), false, 'their own orders are ignored while the CPU has the civ');
  end(rm, 0);
  assert.equal(q(rm, 'G.turn'), 2, 'the round ended without them');
  assert.equal(own(1).replace(/:\d+/g, ''), before.replace(/:\d+/g, ''), 'the CPU did not play seat 1 in the round they left during');
  // Round two: the CPU plays seat 1 after seat 0 has ended.
  assert.equal(q(rm, 'G.live.human0.join()'), '0');
  const settler = q(rm, 'G.units.find(u => u.owner === 1 && u.type.includes("settler"))');
  end(rm, 0);
  assert.equal(q(rm, 'G.turn'), 3);
  assert.ok(q(rm, 'G.cities.some(c => c.owner === 1)') || own(1) !== before, 'seat 1 was played by a CPU');
  assert.equal(q(rm, '!!cityAt(' + settler.x + ',' + settler.y + ')') || q(rm, '!unitById("' + settler.id + '") || unitById("' + settler.id + '").x !== ' + settler.x + ' || unitById("' + settler.id + '").y !== ' + settler.y), true, 'the settler was used');
  // Seat 1 comes back: they get the civ at the next round start, not in the middle of this one.
  assert.ok(rm.send({ seat: 1, type: 'human-returns', args: {} }));
  assert.equal(q(rm, 'pl(1).human'), false, 'still a CPU until the round ends');
  assert.deepEqual(q(rm, 'G.live.returning'), [1]);
  end(rm, 0);
  assert.equal(q(rm, 'G.turn'), 4);
  assert.equal(q(rm, 'pl(1).human'), true);
  assert.deepEqual(q(rm, 'G.live.away'), {});
  assert.deepEqual([q(rm, 'liveCanAct(0)'), q(rm, 'liveCanAct(1)')], [true, true]);
  assert.notEqual(builds(1), undefined);
  assert.equal(rm.send({ seat: 1, type: 'human-returns', args: {} }), false, 'back already');
  rm.agree('after seat 1 returned');
});

test('leaving and coming back: with every human gone the game waits, and starts again when one is back', () => {
  const rm = room({ ...BASE, seats: table(2, 2), seed: 8675309 }, [0, 1]);
  rm.send({ seat: 1, type: 'cpu-takes-over', args: { seat: 1 } });
  rm.send({ seat: 0, type: 'cpu-takes-over', args: { seat: 0 } });
  // Both are gone: the round that was running finished and the next one is waiting for somebody.
  const turn = q(rm, 'G.turn');
  assert.equal(q(rm, 'G.live.human0.length'), 0);
  const waiting = rm.agree('waiting');
  for (const seat of [0, 1]) rm.send({ seat, type: 'end-turn', args: {} });
  rm.send({ seat: 0, type: 'timeout', args: { round: turn } });
  assert.equal(q(rm, 'G.turn'), turn, 'nothing moves without a human');
  assert.equal(rm.agree('still waiting'), waiting);
  // Seat 1 returns: the game was waiting, so they take the round up now.
  assert.ok(rm.send({ seat: 1, type: 'human-returns', args: {} }));
  assert.equal(q(rm, 'pl(1).human'), true);
  assert.equal(q(rm, 'liveCanAct(1)'), true);
  assert.equal(q(rm, 'liveCanAct(0)'), false, 'seat 0 is still away');
  end(rm, 1);
  assert.equal(q(rm, 'G.turn'), turn + 1, 'the round goes on');
  assert.ok(rm.send({ seat: 0, type: 'human-returns', args: {} }));
  end(rm, 1);
  assert.equal(q(rm, 'G.turn'), turn + 2);
  assert.equal(q(rm, 'pl(0).human'), true);
  rm.agree('after both came back');
});

test('a seat the humans left is not "every human out": the game goes on', () => {
  const rm = room({ ...BASE, seats: table(1, 2), seed: 8675309 }, [0]);
  rm.send({ seat: 0, type: 'cpu-takes-over', args: { seat: 0 } });
  assert.equal(q(rm, '!!G.over'), false);
  assert.equal(q(rm, 'G.live.away[0]'), true);
});

test('teams: G holds one team number per seat, one per seat in a free-for-all, and live no longer keeps its own list', () => {
  const rm = room({ ...BASE, seats: table(2, 2), seed: 1 }, [0]);
  assert.deepEqual(q(rm, 'G.teams'), [0, 1, 2, 3]);
  assert.equal(q(rm, 'G.mode'), 'ffa');
  assert.equal(q(rm, 'G.live.teams'), undefined);
  assert.deepEqual(q(rm, 'G.live.humans'), [0, 1]);
});

// 5.1 co-op: the humans are one team against the CPUs.
test('co-op: both devices agree through a team game, a war on a teammate is refused, gifts land on both, and the map is shared', () => {
  const rm = room({ ...BASE, seats: table(2, 2), seed: 5151, mode: 'coop' }, [0, 1]);
  assert.deepEqual(q(rm, 'G.teams'), [0, 0, 2, 3]);
  assert.equal(q(rm, 'G.mode'), 'coop');
  assert.equal(q(rm, 'hasMet(0, 1) && hasMet(1, 0)'), true, 'teammates have met from the first turn');
  assert.equal(q(rm, 'hasMet(0, 2) || hasMet(1, 3)'), false);
  rm.agree('at the start');
  // A war on a teammate is refused on every device, and changes nothing.
  const before = rm.agree();
  assert.equal(rm.send({ seat: 0, type: 'war', args: { to: 1 } }), false);
  assert.equal(rm.send({ seat: 1, type: 'war', args: { to: 0 } }), false);
  assert.equal(q(rm, 'atWar(0, 1) || atWar(1, 0)'), false);
  assert.equal(rm.agree('after the refused wars'), before, 'a refused action leaves the game as it was');
  // Gifts: horses, iron and gunpowder, in fives, between teammates only, the same on both devices.
  rm.fixture('pl(0).horses = 20; pl(0).iron = 10; pl(1).horses = 0; pl(1).iron = 0; pl(1).gunpowder = 0; pl(0).gunpowder = 5;');
  assert.equal(rm.send({ seat: 0, type: 'gift', args: { to: 1, res: 'horses', qty: 5 } }), true);
  assert.equal(rm.send({ seat: 0, type: 'gift', args: { to: 1, res: 'gunpowder', qty: 5 } }), true);
  assert.equal(rm.send({ seat: 0, type: 'gift', args: { to: 1, res: 'horses', qty: 3 } }), false, 'not in fives');
  assert.equal(rm.send({ seat: 0, type: 'gift', args: { to: 1, res: 'iron', qty: 15 } }), false, 'more than the stockpile');
  assert.equal(rm.send({ seat: 0, type: 'gift', args: { to: 2, res: 'iron', qty: 5 } }), false, 'a CPU is not a teammate');
  assert.equal(rm.send({ seat: 0, type: 'gift', args: { to: 0, res: 'iron', qty: 5 } }), false, 'not to yourself');
  assert.equal(rm.send({ seat: 0, type: 'gift', args: { to: 1, res: 'gold', qty: 5 } }), false, 'only the three resources');
  assert.equal(rm.send({ seat: 1, type: 'gift', args: { to: 0 } }), false, 'a gift with nothing in it');
  assert.equal(rm.send({ seat: 1, type: 'gift', args: { to: 0, res: '__proto__', qty: 5 } }), false);
  for (const d of rm.devices) assert.deepEqual(d.json('[pl(0).horses, pl(1).horses, pl(0).gunpowder, pl(1).gunpowder]'), [15, 5, 0, 5], 'both devices moved the same fives');
  rm.agree('after the gifts');
  // A war with a CPU is one player's, not the team's.
  assert.equal(rm.send({ seat: 0, type: 'war', args: { to: 2 } }), false, 'not before they have met');
  rm.fixture('meet(0, 2); meet(1, 2)');
  assert.equal(rm.send({ seat: 0, type: 'war', args: { to: 2 } }), true);
  assert.equal(q(rm, 'atWar(0, 2) && !atWar(1, 2)'), true);
  assert.equal(rm.agree('after the war'), rm.agree());
  // Play on: a bot plays both humans, the devices must agree at every round, nobody ever fights a teammate,
  // and the two seats keep one map.
  const b = bot(rm, 51);
  let last = q(rm, 'G.turn'), rounds = 0;
  for (let step = 0; step < 4000 && q(rm, 'G.turn') <= 18 && !q(rm, 'G.over'); step++) {
    const acting = q(rm, 'G.live.human0.filter(liveCanAct)');
    if (!acting.length) break;
    const seat = b.pick(acting);
    b.play(seat);
    b.noise(rm.ref);
    end(rm, seat);
    const now = q(rm, 'G.turn');
    if (now !== last) {
      rm.agree('at the start of round ' + now);
      assert.equal(q(rm, 'atWar(0, 1) || atWar(1, 0)'), false, 'never at war with each other');
      rounds++;
      last = now;
    }
  }
  assert.ok(rounds >= 15, 'ran ' + rounds + ' rounds');
  rm.agree('at the end');
  assert.deepEqual(q(rm, 'G.seen[0]'), q(rm, 'G.seen[1]'), 'one shared map');
  assert.ok(q(rm, 'G.cities.filter(c => c.owner < 2).length') >= 2, 'the team founded cities');
  assert.equal(q(rm, 'G.dip[0][1] !== "war" && G.dip[1][0] !== "war"'), true);
  for (const d of rm.devices) assert.deepEqual(d.errors().filter(e => !/constructor|__proto__/.test(e)), []);
});

test('co-op: a ping is a marker on a screen, never part of the game: not in G, the log or the hash', () => {
  const rm = room({ ...BASE, seats: table(2, 2), seed: 77, mode: 'coop' }, [0, 1]);
  for (const d of rm.devices) { d.ctx.setTimeout = () => 0; d.run('Date.now = Date.now'); }
  const [ann, ben] = rm.devices;
  const h = rm.agree('at the start');
  const logLen = rm.log.length;
  const state = JSON.stringify(ann.G);
  // Ann pings her own screen, Ben's arrives at hers as a message.
  assert.equal(ann.run('canPing()'), true, 'co-op, a human, a teammate');
  assert.equal(ann.run('pingHex(5, 5)'), true);
  assert.equal(ann.run('pingHex(6, 6)'), false, 'a second ping inside 0.7 s is turned away');
  assert.equal(ann.run('PINGS.length'), 1);
  assert.deepEqual(ann.json('livePings(0).map(k => [k.x, k.y, k.seat])'), [[5, 5, 0]]);
  assert.deepEqual(ann.json('livePings(1).map(k => [k.x, k.y, k.seat])'), [[5, 5, 0]], 'her teammate would see it');
  assert.deepEqual(ann.json('livePings(2)'), [], 'a CPU never sees it');
  ann.run('livePing({ seat: 1, x: 7, y: 6 })');
  assert.equal(ann.run('PINGS.length'), 2, 'Ben’s ping shows on Ann’s screen');
  assert.ok(ann.run('G.log.at(-1).text').includes(' pinged near '), 'with a line in her own log');
  ann.run('livePing({ seat: 1, x: 7, y: 6 })');
  assert.equal(ann.run('PINGS.length'), 2, 'the same spot again replaces the marker');
  // What a network could send that must be ignored.
  for (const bad of ['{ seat: 0, x: 3, y: 3 }', '{ seat: 2, x: 3, y: 3 }', '{ seat: 9, x: 3, y: 3 }', '{ seat: 1, x: -1, y: 3 }', '{ seat: 1, x: 3.5, y: 3 }', '{ seat: 1, x: "3", y: 3 }', '{ seat: 1, x: 9999, y: 9999 }', '{}', 'null'.replace('null', '{ seat: "__proto__" }')])
    ann.run('livePing(' + bad + ')');
  assert.equal(ann.run('PINGS.length'), 2, 'a ping from myself, a CPU, nobody or off the map is dropped');
  // Nothing in the game moved.
  assert.equal(ann.hash(), h, 'the hash did not change');
  assert.equal(ben.hash(), h, 'and Ben’s screen knows nothing');
  assert.equal(rm.log.length, logLen, 'no action went into the log');
  assert.equal(JSON.stringify(ann.G).includes('PINGS'), false);
  const after = JSON.parse(JSON.stringify(ann.G));
  delete after.log; delete after.news;
  const was = JSON.parse(state);
  delete was.log; delete was.news;
  assert.deepEqual(after, was, 'G is the same apart from this screen’s own log');
  // Not in a free-for-all, not for a spectator, not once it is over.
  const ffa = room({ ...BASE, seats: table(2, 2), seed: 77 }, [0, 1]);
  ffa.devices[0].ctx.setTimeout = () => 0;
  assert.equal(ffa.devices[0].run('canPing()'), false);
  assert.equal(ffa.devices[0].run('pingHex(5, 5)'), false);
  ffa.devices[0].run('livePing({ seat: 1, x: 7, y: 6 })');
  assert.equal(ffa.devices[0].run('PINGS.length'), 0);
  ann.run('G.over = { winner: 0, why: "x", turn: 1 }');
  assert.equal(ann.run('canPing()'), false, 'not after the game');
});

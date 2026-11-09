// Two or more simulated devices for Civ Lite live games. Each device loads the whole game script in its own
// bare VM (the same trick the other Civ Lite tests use), starts from the same options and applies the same
// action log. A bot plays the human seats with random legal moves, so the logs the devices share are the ones
// a table of people would produce.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../src/games/content/ashcrown.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

// One device. `viewer` is the seat whose screen it is.
function device(viewer) {
  const store = new Map();
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
  });
  vm.runInContext(script, ctx);
  const run = code => vm.runInContext(code, ctx);
  const toasts = [];
  ctx.openModal = ctx.closeModal = ctx.render = () => {};
  ctx.toast = text => { toasts.push(text); };
  run('UI = { modalKind: null }');
  const d = {
    ctx, run, viewer, toasts,
    get G() { return run('G'); },
    json: expr => { const text = run('JSON.stringify(' + expr + ')'); return text === undefined ? undefined : JSON.parse(text); },
    start(options) {
      ctx.options = options;
      run('startGame(options)');
      run('G.viewer = ' + viewer + '; G.cur = ' + viewer);
    },
    restore(state) {
      ctx.state = state;
      run('liveRestore(state, ' + viewer + ')');
    },
    apply(action) { ctx.action = action; return run('applyAction(action)'); },
    hash: () => run('liveHash()'),
    errors: () => JSON.parse(run('JSON.stringify(LIVE.errors)'))
  };
  return d;
}

// The seat list of a table: humans first, then CPUs, as the server's start would freeze it.
const table = (humans, cpus) => [
  ...Array.from({ length: humans }, (x, i) => ({ name: 'Human ' + (i + 1), human: true, civ: null, team: i })),
  ...Array.from({ length: cpus }, (x, i) => ({ name: '', human: false, civ: null, team: humans + i }))
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Several devices, one log. send() appends an action and hands it to every device in order.
function room(options, viewers) {
  const devices = viewers.map(device);
  for (const d of devices) d.start(options);
  const log = [];
  return {
    devices, log, options,
    ref: devices[0],
    send(action) {
      log.push(action);
      let ok;
      for (const d of devices) ok = d.apply(action);
      return ok;
    },
    // Something the test sets up the same way on every device (a stockpile, a weakened city).
    fixture(code) { for (const d of devices) d.run(code); },
    agree(why) {
      const hashes = devices.map(d => d.hash());
      if (new Set(hashes).size !== 1) throw new Error('devices disagree' + (why ? ' ' + why : '') + ': ' + hashes.join(' '));
      return hashes[0];
    }
  };
}

// A bot for the human seats. It reads the first device and sends actions through the room.
function bot(rm, seed) {
  const r = rng(seed), d = rm.ref, q = expr => d.json(expr);
  const pick = list => list[Math.floor(r() * list.length)];
  const stats = { orders: 0, strikes: 0, found: 0, builds: 0, research: 0, wars: 0, peace: 0, offers: 0, answers: 0, trades: 0, embassies: 0, captures: 0, junk: 0, builders: 0, marches: 0 };
  d.ctx.pickBuild = null;

  const unitsOf = seat => q('G.units.filter(u => u.owner === ' + seat + ').map(u => u.id)');
  const reach = id => q('(() => { const u = unitById(' + JSON.stringify(id) + '); if (!u) return []; const r = computeReachable(u); return [...r.keys()].map(k => k.split(",").map(Number).concat([r.war.has(k) ? 1 : 0])); })()');

  function actUnit(seat, id) {
    const u = q('(() => { const u = unitById(' + JSON.stringify(id) + '); return u && { id: u.id, type: u.type, x: u.x, y: u.y, mp: u.mp, acted: u.acted, fort: u.fort, sleep: u.sleep, mil: isMil(u.type), builder: !!UNITS[u.type].charges, settler: !!UNITS[u.type].founds, marching: marching(u) }; })()');
    if (!u || u.mp <= 0 || u.acted || u.marching) return;
    if (u.settler) {
      if (q('!foundProblem(unitById(' + JSON.stringify(id) + '))') && r() < 0.9) { if (rm.send({ seat, type: 'unit-found', args: { unit: id } })) stats.found++; return; }
    }
    if (u.builder) {
      const options = q('builderOptions(unitById(' + JSON.stringify(id) + ')).filter(o => !o.why).map(o => o.act)');
      if (options.length && r() < 0.8) { if (rm.send({ seat, type: 'unit-builder', args: { unit: id, what: pick(options) } })) stats.builders++; return; }
    }
    if (u.mil) {
      // Hit anything at war that is in range.
      const targets = q('(() => { const u = unitById(' + JSON.stringify(id) + '); const out = []; for (const o of G.units) if (o.owner !== u.owner && strikeInfo(u, o.x, o.y)) out.push([o.x, o.y]); for (const c of G.cities) if (c.owner !== u.owner && strikeInfo(u, c.x, c.y)) out.push([c.x, c.y]); return out; })()');
      if (targets.length && r() < 0.95) {
        const [x, y] = pick(targets);
        if (rm.send({ seat, type: 'unit-order', args: { unit: id, x, y } })) { stats.strikes++; if (q('G.units.some(o => o.id === ' + JSON.stringify(id) + ')') === false) return; }
        return;
      }
      const x = r();
      if (x < 0.06) { rm.send({ seat, type: 'unit-fortify', args: { unit: id } }); return; }
      if (x < 0.1) { rm.send({ seat, type: 'unit-sleep', args: { unit: id } }); return; }
    }
    const cells = reach(id).filter(c => !c[2]);
    if (cells.length && r() < 0.8) {
      const [x, y] = pick(cells);
      if (rm.send({ seat, type: 'unit-order', args: { unit: id, x, y } })) stats.orders++;
      return;
    }
    // A long march toward somewhere seen.
    const far = q('(() => { const seen = G.seen[' + seat + ']; const out = []; for (let k = 0; k < seen.length; k += 7) if (seen[k]) out.push([k % G.cols, Math.floor(k / G.cols)]); return out; })()');
    if (far.length && r() < 0.5) {
      const [x, y] = pick(far);
      if (rm.send({ seat, type: 'unit-order', args: { unit: id, x, y } })) stats.marches++;
      return;
    }
    rm.send({ seat, type: r() < 0.5 ? 'unit-skip' : 'unit-clearpath', args: { unit: id } });
  }

  function manageCities(seat) {
    const cities = q('G.cities.filter(c => c.owner === ' + seat + ').map(c => ({ id: c.id, idle: !c.build, project: !!c.build && c.build.kind === "embassy" }))');
    for (const c of cities) {
      if (c.project || (!c.idle && r() > 0.05)) continue;
      const items = q('(() => { const c = cityById(' + JSON.stringify(c.id) + '); const out = []; for (const id of UNIT_ORDER) out.push({ kind: "unit", id }); for (const id of BUILDING_ORDER) out.push({ kind: "building", id }); out.push({ kind: "research", id: "research" }); return out.filter(i => !buildProblem(c, i)).map(i => ({ kind: i.kind, id: i.id, plot: i.kind === "building" && needsPlot(i.id) ? (freePlot(c, i.id) ? [freePlot(c, i.id).x, freePlot(c, i.id).y] : null) : null })); })()');
      if (!items.length) continue;
      // Soldiers and settlers early, buildings later.
      const item = pick(items);
      const args = { city: c.id, kind: item.kind, id: item.id };
      if (item.plot) args.at = item.plot;
      if (rm.send({ seat, type: 'city-build', args })) stats.builds++;
    }
  }

  function research(seat) {
    if (!q('needsTech(' + seat + ')')) return;
    const choices = q('researchChoices(' + seat + ').map(t => t.id || t)');
    if (choices.length && rm.send({ seat, type: 'research', args: { tech: pick(choices) } })) stats.research++;
  }

  function diplomacy(seat) {
    // Answer what is waiting in the Council.
    for (const o of q('G.offers.filter(o => o.to === ' + seat + ').map(o => ({ id: o.id, kind: o.kind, from: o.from }))')) {
      if (rm.send({ seat, type: 'offer-answer', args: { id: o.id, accept: r() < 0.65 } })) stats.answers++;
    }
    const met = q('G.players.filter(o => o.alive && o.i !== ' + seat + ' && hasMet(' + seat + ', o.i)).map(o => ({ i: o.i, war: atWar(' + seat + ', o.i), human: o.human }))');
    for (const o of met) {
      if (o.war && r() < 0.12 && rm.send({ seat, type: 'peace', args: { to: o.i } })) stats.peace++;
      else if (!o.war && r() < 0.03 && rm.send({ seat, type: 'open-ask', args: { to: o.i } })) stats.offers++;
    }
  }

  // Everything one seat does in one go.
  function play(seat, moves = 16) {
    research(seat);
    manageCities(seat);
    diplomacy(seat);
    const ids = unitsOf(seat);
    for (let k = ids.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [ids[k], ids[j]] = [ids[j], ids[k]]; }
    for (const id of ids.slice(0, moves)) {
      if (!q('liveCanAct(' + seat + ')')) break;
      actUnit(seat, id);
    }
    // Sometimes a client sends something it should not: someone else's unit, a hex off the map, a stale order, a made-up type.
    if (r() < 0.5) {
      const other = q('G.units.filter(u => u.owner !== ' + seat + ').map(u => u.id)');
      const junk = [
        { seat, type: 'unit-order', args: { unit: other.length ? pick(other) : 'u1', x: 1, y: 1 } },
        { seat, type: 'unit-order', args: { unit: 'u1', x: -4, y: 9999 } },
        { seat, type: 'unit-found', args: { unit: 'nope' } },
        { seat, type: 'city-build', args: { city: 'c1', kind: 'unit', id: 'constructor' } },
        { seat, type: 'city-build', args: { city: 'c1', kind: 'building', id: '__proto__' } },
        { seat, type: 'constructor', args: {} },
        { seat, type: 'timeout', args: { round: -5 } },
        { seat, type: 'cpu-takes-over', args: { seat: 77 } },
        { seat, type: 'offer-answer', args: { id: 'o99', accept: true } },
        { seat, type: 'trade', args: { other: seat, dir: 'sell', res: 'iron', qty: 5, turns: 1, total: 5 } },
        { seat, type: 'unit-builder', args: { unit: 'u2', what: 5 } }
      ];
      rm.send(pick(junk));
      stats.junk++;
    }
  }

  // What drawing the screen does on one device: sight, reach, the panel's numbers. None of it may change the game.
  function noise(dev) {
    dev.run(`(() => {
      refreshVision();
      validateSelection();
      for (const u of ownUnits(G.viewer).slice(0, 5)) { computeReachable(u); computePaths(u); }
      for (const c of ownCities(G.viewer)) { cityYields(c); roadChoices(c); embassyTargets(c); researchChoices(G.viewer); }
      standings();
      idleUnits(G.viewer);
    })()`);
  }

  return { play, stats, pick, r, q, noise };
}

module.exports = { device, room, bot, table, rng };

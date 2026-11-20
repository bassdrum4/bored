const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Trackbound is one HTML document with its engine inline, so this loads the real
// document into a stub page and drives the real functions: the track builder,
// the surface rays, the car, the race clock, the save layer and the snapshot.
function load(options) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src/games/content/trackbound.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const noop = () => {};
  const nodes = new Map();
  const storage = new Map();
  const glCalls = [];
  const previewCalls = [];
  const previewContext = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      target[key] = (...args) => {
        previewCalls.push(String(key));
        return undefined;
      };
      return target[key];
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  let ids = 0;

  // A recording stand-in for WebGL: every call is counted, creations return
  // objects, and the queries the renderer depends on return usable answers.
  // This is not a rasteriser; it proves the frame path runs end to end.
  function makeGl() {
    const store = {};
    return new Proxy(store, {
      get(target, key) {
        if (key in target) return target[key];
        const name = String(key);
        if (/^[A-Z0-9_]+$/.test(name)) { target[key] = ++ids; return target[key]; }
        target[key] = (...args) => {
          glCalls.push(name + '(' + args.length + ')');
          if (name.startsWith('create')) return { id: ++ids };
          if (name === 'getShaderParameter' || name === 'getProgramParameter') return true;
          if (name === 'getShaderInfoLog' || name === 'getProgramInfoLog') return '';
          if (name === 'getAttribLocation') return ++ids;
          if (name === 'getUniformLocation') return { id: ++ids, name: String(args[1]) };
          return undefined;
        };
        return target[key];
      }
    });
  }
  const gl = options && options.webgl ? makeGl() : null;

  // An in-memory IndexedDB stand-in. Pass a Map through options.idb to share
  // records between two pages, and options.idbFail to make it report blocked.
  // Events fire on microtasks, like the real thing.
  const idbRecords = options && options.idb;
  function makeIdb() {
    const fire = (request, event) => {
      const fn = request['on' + event];
      if (typeof fn === 'function') fn.call(request, { target: request });
    };
    const fakeDb = {
      createObjectStore: () => ({}),
      transaction: () => ({
        objectStore: () => ({
          getAll: () => {
            const request = { onsuccess: null, onerror: null, result: null };
            queueMicrotask(() => {
              // put stored the whole { key, value } record verbatim.
              request.result = [...idbRecords.values()];
              fire(request, 'success');
            });
            return request;
          },
          put: (value, key) => { idbRecords.set(key, value); return {}; }
        })
      })
    };
    return {
      open: () => {
        const request = { onupgradeneeded: null, onerror: null, onblocked: null, onsuccess: null, result: null };
        queueMicrotask(() => {
          if (options.idbFail) { fire(request, 'error'); return; }
          request.result = fakeDb;
          fire(request, 'upgradeneeded');
          fire(request, 'success');
        });
        return request;
      }
    };
  }

  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const element = {
      id, textContent: '', className: '', hidden: false, value: '', dataset: {}, style: {},
      width: id === 'editorPreview' ? 660 : 440, height: id === 'editorPreview' ? 420 : 220,
      listeners: {}, clientWidth: 960, clientHeight: 600,
      classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener: noop,
      appendChild: noop, append: noop, replaceChildren: noop,
      setAttribute: noop, removeAttribute: noop, focus: noop,
      getContext: type => (gl && /webgl/i.test(String(type)) ? gl :
        (options && options.preview2d && type === '2d' ? previewContext : null)),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
      querySelectorAll: () => [],
      setPointerCapture: noop
    };
    nodes.set(id, element);
    return element;
  }

  const sandbox = {
    console,
    document: {
      getElementById: node,
      createElement: () => node('created-' + nodes.size),
      querySelector: () => node('query'),
      querySelectorAll: () => [],
      addEventListener: noop,
      body: { classList: { add: noop, remove: noop, contains: () => false } }
    },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => { storage.set(key, String(value)); },
      removeItem: key => { storage.delete(key); }
    },
    indexedDB: idbRecords ? makeIdb() : undefined,
    addEventListener: noop,
    removeEventListener: noop,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    __boredSeed: { date: '2026-10-30', seed: 24680, code: 'ABCDEF' }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const script of scripts) vm.runInContext(script, sandbox, { filename: 'trackbound.html' });

  return {
    sandbox,
    element: id => nodes.get(id),
    storage,
    glCalls,
    previewCalls,
    flush: () => new Promise(resolve => queueMicrotask(resolve)),
    advance: noop
  };
}

// A crude driver that follows the centre line: enough to prove a track can be
// completed and that the clock, checkpoints and finish line agree.
function autopilot(page, index, options = {}) {
  const lookahead = options.lookahead || 12;
  const brakeSpeed = options.brakeSpeed || 30;
  const brakeAngle = options.brakeAngle || 0.4;
  const liftAngle = options.liftAngle || 0;
  const T = page.sandbox.__test;
  T.startCampaign(index);
  const car = T.car();
  const points = T.centerline(T.world());
  let nearest = 0;
  for (let step = 0; step < 120 * 60; step++) {
    let best = nearest, bestDistance = Infinity;
    for (let i = 0; i < points.length; i++) {
      const distance = Math.hypot(points[i].p[0] - car.p[0], points[i].p[1] - car.p[1], points[i].p[2] - car.p[2]);
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    }
    nearest = best;
    let ahead = best, travelled = 0;
    while (ahead < points.length - 1 && travelled < lookahead) {
      travelled += Math.hypot(points[ahead + 1].p[0] - points[ahead].p[0],
        points[ahead + 1].p[1] - points[ahead].p[1], points[ahead + 1].p[2] - points[ahead].p[2]);
      ahead++;
    }
    const target = points[ahead];
    const u = car.u, f = car.f;
    const right = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
    const toTarget = [target.p[0] - car.p[0], target.p[1] - car.p[1], target.p[2] - car.p[2]];
    const lateral = toTarget[0] * right[0] + toTarget[1] * right[1] + toTarget[2] * right[2];
    const forward = toTarget[0] * f[0] + toTarget[1] * f[1] + toTarget[2] * f[2];
    const angle = Math.atan2(lateral, forward);
    const speed = Math.hypot(car.v[0], car.v[1], car.v[2]);
    const braking = speed > brakeSpeed && Math.abs(angle) > brakeAngle;
    const lifting = liftAngle > 0 && Math.abs(angle) > liftAngle;
    T.stepRace(1 / 120, {
      gas: !braking && !lifting,
      brake: braking,
      steer: -Math.max(-1, Math.min(1, angle * 2.6)),
      handbrake: false
    });
    if (T.race.state === 'finished') break;
  }
  return T;
}

test('Trackbound builds every campaign track as a solid, unfolded ribbon', () => {
  const page = load();
  const T = page.sandbox.__test;
  assert.ok(T.CAMPAIGN.length >= 8, 'the original campaign tracks are still there');
  assert.equal(new Set(T.CAMPAIGN.map(entry => entry.id)).size, T.CAMPAIGN.length,
    'every campaign track has its own id');
  for (const entry of T.CAMPAIGN) {
    const track = T.buildTrack(entry.blocks, entry);
    assert.ok(track.mesh.tris.length > 0, entry.id + ' has road triangles');
    assert.ok(track.mesh.grid.size > 0, entry.id + ' is indexed for raycasts');
    assert.ok(track.spawn, entry.id + ' has a start frame');
    assert.ok(track.finish, entry.id + ' has a finish gate');
    assert.equal(track.checkpoints.length, entry.blocks.filter(id => id === 'checkpoint').length,
      entry.id + ' counts its checkpoints');
    assert.equal(T.trackFolds(track), false, entry.id + ' does not fold back into itself');
    for (const link of track.chain) {
      assert.ok(link.exit.p.every(Number.isFinite), entry.id + ': a connector is not a number');
    }
    // The surface under the spawn must be a real, upward facing road.
    const spawn = track.spawn.p;
    const floor = T.raycast(track.mesh, [spawn[0], spawn[1] + 4, spawn[2]], [0, -1, 0], 12);
    assert.ok(floor, entry.id + ' has no road under its spawn');
    assert.ok(floor.n[1] > 0.9, entry.id + ' spawns on a surface that is not flat');
  }
});

test('Trackbound drives: throttle accelerates and the car stays on the road', () => {
  const page = load();
  const T = page.sandbox.__test;
  T.useTrack(T.buildTrack(['start', 'sprint', 'straight', 'finish'], { id: 'probe', name: 'Probe', author: 32000 }));
  const car = T.car();
  const start = car.p.slice();
  for (let step = 0; step < 180; step++) T.stepRace(1 / 120, { gas: true });
  const speed = Math.hypot(car.v[0], car.v[1], car.v[2]);
  assert.ok(speed > 20, 'the car accelerates (' + speed.toFixed(1) + ' u/s)');
  assert.equal(car.grounded, true, 'it is still on the road');
  assert.ok(Math.abs(car.p[1] - 0.62) < 0.25, 'it sits at ride height: y=' + car.p[1].toFixed(2));
  assert.ok(Math.hypot(car.p[0] - start[0], car.p[2] - start[2]) > 15, 'it covered ground');
  assert.equal(T.race.state, 'running', 'the clock started on the first input');
  assert.ok(T.race.t > 1.4 && T.race.t < 1.6, 'the clock is real time');
});

test('Trackbound finishes a campaign track and scores it once', () => {
  const page = load();
  const T = autopilot(page, 0);
  assert.equal(T.race.state, 'finished', 'the finish line was crossed');
  assert.ok(T.race.finishedAt > 3, 'a real race time');
  assert.equal(T.race.cp, T.race.cpTotal, 'every checkpoint was collected');
  const snapshot = page.sandbox.__boredSnapshot();
  assert.equal(snapshot.slug, 'trackbound');
  assert.equal(snapshot.finished, true);
  assert.ok(Number.isInteger(snapshot.timeMs) && snapshot.timeMs > 0);
  assert.ok(Number.isInteger(snapshot.seconds) && snapshot.seconds > 0);
  assert.ok(Number.isInteger(snapshot.medals), 'medals is an integer');
  // The autopilot brakes through every bend, so its lap sits inside the bronze
  // rung rather than the author's: the top medal is meant to need a tidier line
  // than the bot drives. What matters here is that the time is reachable.
  const bronze = T.medalTimes(T.world().author).find(medal => medal.id === 'bronze').ms;
  assert.ok(snapshot.timeMs <= bronze, 'a completed lap is inside the bronze rung');
  assert.equal(snapshot.track, 'paddock');
  const stored = JSON.parse(page.storage.get('bored.trackbound.best'));
  assert.ok(stored.paddock.ms > 0, 'the best time is kept');
  assert.ok(Array.isArray(stored.paddock.ghost) && stored.paddock.ghost.length > 4, 'a ghost is kept');
  assert.equal(stored.paddock.layout, T.layoutOf(T.CAMPAIGN[0].blocks), 'the layout is stamped');
  assert.ok(Array.isArray(stored.paddock.splits) && stored.paddock.splits.length === T.race.cpTotal,
    'checkpoints splits are saved');
  assert.ok(stored.paddock.splits.every(value => value > 0), 'splits are positive ms');
});

test('Trackbound medals are ordered and earned against the author time', () => {
  const page = load();
  const T = page.sandbox.__test;
  const times = T.medalTimes(20000);
  assert.equal(times.map(medal => medal.id).join(','), 'author,gold,silver,bronze');
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i].ms > times[i - 1].ms, times[i].id + ' is slower than ' + times[i - 1].id);
  }
  assert.equal(T.medalFor(20000, 19999), 'author');
  assert.equal(T.medalFor(20000, 20001), 'gold');
  assert.equal(T.medalFor(20000, 40000), null, 'outside bronze there is no medal');
  for (const entry of T.CAMPAIGN) {
    assert.ok(entry.author > 5000, entry.id + ' has a sane author time');
  }
});

test('Trackbound long campaign laps reach bronze with a clean line', () => {
  const page = load();
  const T = page.sandbox.__test;
  // These five were published with author times 23-45% faster than a clean lap,
  // so even bronze was out of reach. Drive them the way a careful player would:
  // look further ahead, brake earlier through the bend, lift on the tightest.
  for (const id of ['kicker', 'serpentine', 'highline', 'foundry', 'longway']) {
    const index = T.CAMPAIGN.findIndex(entry => entry.id === id);
    assert.ok(index >= 0, id + ' is still in the campaign');
    const lap = autopilot(page, index, { lookahead: 20, brakeSpeed: 42, brakeAngle: 0.32, liftAngle: 0.22 });
    assert.equal(lap.race.state, 'finished', id + ' can be finished');
    const bronze = lap.medalTimes(lap.world().author).find(medal => medal.id === 'bronze').ms;
    assert.ok(lap.snapshot().timeMs <= bronze,
      id + ' medals at ' + lap.snapshot().timeMs + 'ms (bronze ' + bronze + 'ms)');
  }
});

test('Trackbound daily medals come from the ribbon, not a flat 32 seconds', () => {
  const page = load();
  const T = page.sandbox.__test;
  const track = T.dailyTrack(24680);
  assert.equal(track.author, Math.round((track.length / 36) * 1000));
  T.startDaily();
  assert.equal(T.world().author, track.author, 'loadRace keeps the computed pace');
  const bronze = T.medalTimes(T.world().author).find(medal => medal.id === 'bronze').ms;
  assert.ok(bronze > 8000 && bronze < 40000, 'the rung follows the ribbon: ' + bronze + 'ms');
});

test('Trackbound reports a quiet snapshot before the lights go out', () => {
  const page = load();
  const snapshot = page.sandbox.__boredSnapshot();
  assert.equal(snapshot.slug, 'trackbound');
  assert.equal(snapshot.finished, false);
  assert.equal(snapshot.timeMs, 0);
  assert.equal(snapshot.seconds, 0);
  assert.equal(snapshot.medals, 0);
  assert.equal(snapshot.checkpoints, 0);
  assert.equal(snapshot.daily, false);
});

test('Trackbound wall rides bank the surface without rolling the exit', () => {
  const page = load();
  const T = page.sandbox.__test;
  const track = T.buildTrack(['start', 'sprint', 'wallR', 'straight', 'finish'], { id: 'bank', name: 'Bank' });
  const link = track.chain[2];
  assert.equal(link.id, 'wallR');
  const apex = T.compose(link.entry, T.localCurveFrame(T.BLOCKS.wallR, 0.5));
  assert.ok(apex.y[1] < 0.99, 'the apex is not flat any more');
  assert.ok(Math.abs(apex.y[2]) > 0.05, 'the bank leans across the road');
  const exit = link.exit;
  assert.ok(Math.abs(exit.y[1] - 1) < 0.001, 'the exit connector is level again');
  assert.ok(Math.abs(exit.y[0]) < 1e-9 && Math.abs(exit.y[2]) < 1e-9);
  assert.equal(T.trackFolds(track), false);
});

test('Trackbound keeps bests, ghosts and medals in IndexedDB', async () => {
  const store = new Map();
  const page = load({ idb: store });
  await page.flush(); await page.flush();
  const T = autopilot(page, 0);
  assert.equal(T.race.state, 'finished');
  const mirror = JSON.parse(page.storage.get('bored.trackbound.best'));
  assert.ok(mirror.paddock && mirror.paddock.ms > 0, 'the localStorage mirror holds the best');
  const bestRecord = store.get('best');
  assert.ok(bestRecord && bestRecord.value.paddock && bestRecord.value.paddock.ms === mirror.paddock.ms,
    'the best record went into the database');
  assert.ok(Array.isArray(bestRecord.value.paddock.ghost) && bestRecord.value.paddock.ghost.length > 4,
    'the ghost is inside the saved record');
  const medalRecord = store.get('medals');
  assert.ok(medalRecord && medalRecord.value.paddock, 'the medal is saved too');

  // Opening the document again restores the best and ghost out of the database.
  const again = load({ idb: store });
  await again.flush(); await again.flush();
  again.sandbox.__test.startCampaign(0);
  const race = again.sandbox.__test.race;
  assert.ok(race.best && race.best.ms === mirror.paddock.ms, 'the best came back from the database');
  assert.ok(Array.isArray(race.ghost) && race.ghost.length > 4, 'the ghost came back too');
  assert.ok(race.best.layout === again.sandbox.__test.layoutOf(again.sandbox.__test.CAMPAIGN[0].blocks),
    'the layout stamp came back');
  assert.ok(Array.isArray(race.best.splits) && race.best.splits.length === race.cpTotal,
    'the splits came back too');
  const golds = Object.values(medalRecord.value).filter(id => id === 'gold' || id === 'author').length;
  assert.equal(again.sandbox.__test.snapshot().medals, golds, 'the medal count loaded');
});

test('Trackbound drops bests made on an older track shape, and the mute sticks', async () => {
  const probe = load();
  const entry = probe.sandbox.__test.CAMPAIGN[0];
  const layout = probe.sandbox.__test.layoutOf(entry.blocks);

  // A best stamped with a layout that is not this campaign's layout is dead
  // weight: it has to load without providing a ghost.
  const staleStore = new Map([['best', { key: 'best', value: { [entry.id]: { ms: 8000, layout: 'start|finish' } } }]]);
  const stale = load({ idb: staleStore });
  await stale.flush(); await stale.flush();
  stale.sandbox.__test.loadRace('campaign', 0);
  assert.equal(stale.sandbox.__test.race.best, null, 'an out-of-date layout provides no best');
  // And the loader pruned it from the mirror as well.
  const staleMirror = JSON.parse(stale.storage.get('bored.trackbound.best') || '{}');
  assert.equal(staleMirror[entry.id], undefined, 'the stale best was pruned');

  // The same best, stamped for the real layout, drives again.
  const ghost = [[0, 0, 0, 0, 0, 0, 1, 0, 1, 0], [0.5, 1, 0, 1, 0, 0, 1, 0, 1, 0]];
  const liveStore = new Map([['best', { key: 'best', value: { [entry.id]: { ms: 12345, layout, ghost } } }]]);
  const live = load({ idb: liveStore });
  await live.flush(); await live.flush();
  live.sandbox.__test.loadRace('campaign', 0);
  const after = live.sandbox.__test.race;
  assert.ok(after.best && after.best.ms === 12345, 'a matching layout keeps its best');
  assert.ok(Array.isArray(after.ghost) && after.ghost.length === ghost.length, 'the ghost rides again');

  // Mute is a preference: toggling it flips the label and the mirror.
  assert.ok(live.element('pauseMute').textContent, 'Sound: on', 'sound is on by default');
  live.sandbox.__test.toggleMute();
  assert.equal(live.element('pauseMute').textContent, 'Sound: off', 'the pause button says so');
  assert.equal(live.storage.get('bored.trackbound.mute'), 'true', 'the mute mirrors to storage');
});

test('Trackbound falls back to localStorage when the database is blocked', async () => {
  const page = load({ idb: new Map(), idbFail: true });
  await page.flush(); await page.flush();
  const T = autopilot(page, 0);
  assert.equal(T.race.state, 'finished', 'the race still runs without a database');
  const mirror = JSON.parse(page.storage.get('bored.trackbound.best'));
  assert.ok(mirror.paddock && mirror.paddock.ms > 0, 'the best is kept through localStorage');
});

test('Trackbound daily track is the same track for the same seed', () => {
  const page = load();
  const T = page.sandbox.__test;
  const first = T.dailyTrack(123456789);
  const again = T.dailyTrack(123456789);
  const other = T.dailyTrack(555);
  assert.equal(first.blocks.join(','), again.blocks.join(','), 'same seed, same track');
  assert.notEqual(first.blocks.join(','), other.blocks.join(','), 'a different day is a different track');
  assert.equal(first.blocks[0], 'start');
  assert.equal(first.blocks[first.blocks.length - 1], 'finish');
  assert.ok(first.checkpoints.length >= 1, 'the daily track has at least one checkpoint');
  assert.equal(T.trackFolds(first), false, 'it does not fold into itself');
  assert.ok(first.mesh.tris.length > 0);
});

test('Trackbound files a daily run under its day, not under one shared id', () => {
  const page = load();
  const T = page.sandbox.__test;
  T.useTrack(T.buildTrack(['start', 'sprint', 'straight', 'finish'], { id: 'daily', name: 'Daily', author: 32000 }));
  for (let step = 0; step < 120 * 30; step++) {
    T.stepRace(1 / 120, { gas: true });
    if (T.race.state === 'finished') break;
  }
  assert.equal(T.race.state, 'finished', 'the short daily was completed');
  const day = T.seedDate();
  assert.equal(day, '2026-10-30', 'the day comes from the injected seed');
  const record = T.dailyRecord(day);
  assert.ok(record && record.ms > 0, 'the daily record is filed under its day');
  assert.ok(Array.isArray(record.ghost) && record.ghost.length > 1, 'with its ghost');
  assert.equal(record.layout, T.layoutOf(['start', 'sprint', 'straight', 'finish']), 'and its layout');
  const mirror = JSON.parse(page.storage.get('bored.trackbound.daily'));
  assert.ok(mirror[day] && mirror[day].ms === record.ms, 'the day is mirrored to storage');
  const bests = page.storage.get('bored.trackbound.best');
  assert.equal(bests && JSON.parse(bests).daily, undefined, 'nothing is filed under the shared daily id');
  assert.equal(T.dailyStreak().current, 1, 'today counts as a one-day streak');
  assert.equal(page.sandbox.__boredSnapshot().dailyMs, record.ms, 'the snapshot reports the daily time');
});

test('Trackbound packs a ghost to half the rate without moving the line', () => {
  const page = load();
  const T = page.sandbox.__test;
  const record = [];
  for (let i = 0; i < 40; i++) record.push([i * 0.05, i * 0.1, 0.62, -i * 0.2, 0, 0, 1, 0, 1, 0]);
  const packed = T.packGhost(record);
  assert.equal(packed.length, 20, 'every second sample is kept');
  // join, not deepEqual: an array built inside the game's context has that
  // context's Array prototype, which strict deep equality refuses to match.
  assert.equal(packed[0].join(','), '0,0,0.62,0,0,0,1,0,1,0', 'the first sample survives');
  assert.equal(packed[3][0], 0.3, 'time is carried at a hundredth');
  assert.equal(T.packGhost([[0, 0, 0]]), null, 'a short sample list is not a ghost');
  assert.equal(T.packGhost('nope'), null);
  assert.equal(T.unpackGhost(packed).length, 20, 'the packed ghost reads back');
  assert.equal(T.unpackGhost([[1, 2, 3]]), null, 'a malformed ghost is dropped');
  assert.equal(page.sandbox.__boredSnapshot().dailyGold, 0, 'no daily medal before a daily finish');
});

test('Trackbound renders a full frame without throwing', () => {
  const page = load({ webgl: true });
  const T = page.sandbox.__test;
  assert.ok(page.glCalls.some(call => call.startsWith('createProgram')), 'the renderer initialised rather than falling back');
  assert.ok(page.glCalls.some(call => call.startsWith('getAttribLocation')), 'the shader attributes were bound');
  const draws = () => page.glCalls.filter(call => call.startsWith('drawArrays')).length;
  const before = draws();
  T.render();
  assert.ok(draws() > before, 'a frame drew geometry');
  T.startCampaign(0);
  T.render();
  assert.ok(page.glCalls.some(call => call.startsWith('uniformMatrix4fv')), 'matrices reached the shader');
  assert.ok(page.glCalls.some(call => call.startsWith('bufferData')), 'meshes were uploaded');
});

test('Trackbound respawn puts the car back on the last checkpoint', () => {
  const page = load();
  const T = page.sandbox.__test;
  T.useTrack(T.buildTrack(['start', 'sprint', 'checkpoint', 'straight', 'finish'], { id: 'probe', name: 'Probe', author: 32000 }));
  const car = T.car();
  for (let step = 0; step < 60 * 6; step++) T.stepRace(1 / 120, { gas: true });
  const checkpoint = T.world().checkpoints[0];
  assert.ok(checkpoint, 'the track has a checkpoint');
  // Knock the car off the world and let the race put it back.
  car.p = [car.p[0], -40, car.p[2]];
  T.stepRace(1 / 120, {});
  assert.ok(car.p[1] > -2, 'the car is back on the track, not under it');
  const toCheckpoint = Math.hypot(car.p[0] - checkpoint.frame.p[0], car.p[1] - checkpoint.frame.p[1], car.p[2] - checkpoint.frame.p[2]);
  const toSpawn = Math.hypot(car.p[0] - T.world().spawn.p[0], car.p[1] - T.world().spawn.p[1], car.p[2] - T.world().spawn.p[2]);
  assert.ok(toCheckpoint < 30 || toSpawn < 30, 'it respawned at a checkpoint or the start');
});

test('Trackbound freeplay is an open procedural world, not a ribbon', () => {
  const page = load();
  const T = page.sandbox.__test;
  const world = T.freeplayWorld(4242);
  assert.equal(world.finish, null, 'no finish line out here');
  assert.equal(world.checkpoints.length, 0, 'no checkpoints');
  assert.equal(world.chain.length, 0, 'no road ribbon');
  assert.equal(world.blocks.length, 0, 'no blocks');
  assert.ok(world.mesh.tris.length > 6000, 'the ground is a real surface');
  assert.ok(world.ramps >= 16, 'the world has a kicker for every gate (' + world.ramps + ')');
  assert.equal(world.rings.length, 16, 'sixteen gold rings');
  assert.equal(world.gates, 16, 'sixteen gates on the road');
  assert.ok(world.rings.every(ring => ring.p.every(Number.isFinite) && ring.r > 4),
    'every ring is a real hoop');
  // The gates are spaced evenly along one closed road, all the way round.
  const road = T.parkRoad(4242);
  assert.ok(T.PARK_GATES === 16, 'the park holds sixteen gates');
  const step = road.length / T.PARK_GATES;
  for (let i = 0; i < T.PARK_GATES; i++) {
    const a = road.at(i * step), b = road.at((i + 1) * step);
    assert.ok(road.distance(a.x, a.z) < 1, 'every gate stands on the road');
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 40,
      'gates are spaced far enough apart to land between (' + Math.hypot(a.x - b.x, a.z - b.z).toFixed(1) + ')');
  }
  assert.ok(road.distance(0, 0) > 60, 'the road leaves the infield open');
  assert.equal(T.freeplayWorld(4242).mesh.tris.length, world.mesh.tris.length, 'the seed decides the world');
  assert.notEqual(T.parkHeight(40, 40, 4242), T.parkHeight(40, 40, 99), 'another seed is another landscape');

  const spawn = world.spawn.p;
  const floor = T.raycast(world.mesh, [spawn[0], spawn[1] + 6, spawn[2]], [0, -1, 0], 14);
  assert.ok(floor, 'there is ground under the spawn');
  assert.ok(floor.n[1] > 0.7, 'the spawn is on drivable ground');

  T.startFreeplay(4242);
  const start = T.car().p.slice();
  for (let step = 0; step < 120 * 6; step++) T.stepRace(1 / 120, { gas: true });
  assert.equal(T.race.state, 'running', 'freeplay keeps running');
  assert.equal(page.sandbox.__boredSnapshot().freeplay, true);
  assert.equal(page.sandbox.__boredSnapshot().finished, false);
  assert.ok(Math.hypot(T.car().p[0] - start[0], T.car().p[2] - start[2]) > 20, 'the car drove away');
  assert.ok(T.car().p[1] > -20, 'it stayed in the world');
});

test('Trackbound lets the car leave the ground when the road drops away', () => {
  const page = load();
  const T = page.sandbox.__test;
  // Flat, then a 24 degree drop: the crest has to be a launch, not glue.
  T.useTrack(T.buildTrack(['start', 'sprint', 'straight', 'straight', 'down', 'straight', 'finish'],
    { id: 'crest', name: 'Crest', author: 9000 }));
  let air = 0;
  for (let step = 0; step < 120 * 6; step++) {
    T.stepRace(1 / 120, { gas: true });
    air = Math.max(air, T.car().airTime);
  }
  assert.ok(air > 0.08, 'the crest threw the car (' + air.toFixed(2) + 's)');
});


test('Trackbound editor codes round-trip road blocks and reject corrupt or unknown pieces', () => {
  const page = load();
  const T = page.sandbox.__test;
  const pieces = ['sprint', 'curveR', 'checkpoint', 'straight', 'curveL', 'boost'];
  const code = T.encodeTrackCode(pieces);
  assert.match(code, /^TB1-[0-9a-z]+-[0-9a-z]{4}$/);
  assert.deepEqual(Array.from(T.decodeTrackCode(code)), pieces);
  assert.equal(T.customTrackId(pieces), T.customTrackId(Array.from(T.decodeTrackCode(code))),
    'the same shared layout has the same local best-time key');
  assert.throws(() => T.decodeTrackCode(code.slice(0, -1) + (code.endsWith('x') ? 'y' : 'x')), /checksum/);
  assert.throws(() => T.decodeTrackCode('TB1-zzz-0000'), /checksum|support/);
  assert.equal(T.encodeTrackCode(['start', 'finish']), '', 'structural pieces cannot be forged');
});

test('Trackbound editor builds valid courses and rejects incomplete or unsupported roads', () => {
  const page = load();
  const T = page.sandbox.__test;
  const draft = ['sprint', 'curveR', 'straight', 'checkpoint', 'curveL', 'sprint'];
  const result = T.validateCustom(draft);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.track.checkpoints.length, 1);
  assert.equal(result.track.blocks[0], 'start');
  assert.equal(result.track.blocks[result.track.blocks.length - 1], 'finish');
  assert.equal(T.trackFolds(result.track), false);
  assert.equal(T.validateCustom(['straight']).ok, false);
  assert.equal(T.validateCustom(['straight', 'bogus', 'straight']).ok, false);
  assert.equal(T.validateCustom(Array(37).fill('straight')).ok, false);
});

test('Trackbound editor saves drafts and keeps custom races out of campaign medals', () => {
  const page = load();
  const T = page.sandbox.__test;
  const draft = { name: 'Straight dash', blocks: ['sprint', 'checkpoint', 'sprint'] };
  T.openEditor(draft);
  assert.equal(T.mode(), 'editor');
  assert.equal(T.saveCustomTrack(), true);
  assert.equal(T.customTracks().length, 1);
  assert.equal(page.storage.get('bored.trackbound.custom').includes('Straight dash'), true);
  assert.equal(T.startCustomTrack(draft), true);
  assert.equal(T.current().kind, 'custom');
  assert.equal(T.world().id, T.customTrackId(draft.blocks));
  T.restartRace();
  assert.equal(T.current().kind, 'custom', 'restart uses the same custom layout');
  for (let i = 0; i < 120 * 14 && T.race.state !== 'finished'; i++) {
    T.stepRace(1 / 120, { gas: true, brake: false, steer: 0, handbrake: false });
  }
  assert.equal(T.race.state, 'finished', 'straight custom course can be driven to its finish');
  assert.equal(T.race.medal, null, 'custom tracks do not create campaign medals');
  assert.equal(T.snapshot().finished, false, 'custom race cannot trigger the hub campaign score');
  assert.equal(T.snapshot().points, 0, 'custom race does not award career points');
  assert.ok(page.storage.get('bored.trackbound.best').includes('custom-'), 'best time is still saved');
});


test('Trackbound editor renders physical road faces, walls, tunnels and loops in an orbitable 3D preview', () => {
  const page = load({ preview2d: true });
  const T = page.sandbox.__test;
  const draft = { name: 'Sky road', blocks: ['sprint', 'curveR', 'tunnel', 'loop', 'checkpoint', 'sprint'] };
  T.openEditor(draft);
  const geometry = T.editorPreviewGeometry(T.editorView.track);
  assert.ok(geometry.faces.length > 100, 'the preview contains actual 3D surface faces');
  assert.ok(geometry.faces.some(f => f.kind === 'wall'), 'walls have geometry');
  assert.ok(geometry.faces.some(f => f.kind === 'roof'), 'tunnels have visible roofs');
  assert.ok(geometry.faces.some(f => f.kind === 'gate'), 'start, checkpoint and finish have visible gates');
  assert.ok(new Set(geometry.faces.flatMap(f => f.corners.map(p => p[1].toFixed(1)))).size > 6,
    'the preview includes 3D height, not merely projected map lines');
  assert.ok(page.previewCalls.includes('fill'), 'faces were drawn in a 2D canvas');
  T.selectEditorPiece(2);
  assert.equal(T.editorView.selected, 2);
  assert.ok(geometry.faces.some(f => f.index === 2 && f.kind === 'road'), 'selection maps to the right block');
  const canvas = page.element('editorPreview');
  const event = (clientX, clientY, type) => ({
    clientX, clientY, pointerId: 1, type, button: 0, preventDefault() {}
  });
  const yaw = T.editorView.yaw;
  canvas.listeners.pointerdown[0](event(310, 190, 'pointerdown'));
  canvas.listeners.pointermove[0](event(480, 215, 'pointermove'));
  canvas.listeners.pointerup[0](event(480, 215, 'pointerup'));
  assert.notEqual(T.editorView.yaw, yaw, 'dragging rotates the camera');
  const zoom = T.editorView.zoom;
  canvas.listeners.wheel[0]({ deltaY: -100, preventDefault() {} });
  assert.ok(T.editorView.zoom > zoom, 'wheel zooms the preview');
  T.resetEditorCamera();
  assert.equal(T.editorView.zoom, 1);
  assert.ok(Number.isFinite(T.previewPick(300,200)), 'selecting by projected position is available');
});

test('Trackbound home screen gives campaign and saved courses separate, persistent tabs', () => {
  const page = load();
  const T = page.sandbox.__test;
  assert.equal(page.element('menuCampaignPanel').hidden, false);
  assert.equal(page.element('menuCustomPanel').hidden, true);
  T.showMenuLibrary('custom');
  assert.equal(page.element('menuCampaignPanel').hidden, true);
  assert.equal(page.element('menuCustomPanel').hidden, false);
  T.openEditor({ name: 'My circuit', blocks: ['sprint', 'straight', 'checkpoint', 'sprint'] });
  assert.equal(T.saveCustomTrack(), true);
  T.openMenu();
  assert.equal(page.element('menuCustomPanel').hidden, false, 'the chosen tab persists through editing');
  assert.match(page.element('menuCustomTab').textContent, /1$/, 'my tracks count is shown');
  T.showMenuLibrary('campaign');
  assert.equal(page.element('menuCampaignPanel').hidden, false);
});

test('Trackbound needs a name of its own and a change before a track can be posted', () => {
  const page = load();
  const T = page.sandbox.__test;
  T.openEditor({ name: 'My track', blocks: ['sprint', 'checkpoint', 'sprint'] });
  assert.equal(T.postState().named, false);
  assert.equal(T.postState().blocked, true, 'the placeholder name cannot be posted');
  page.element('editorName').value = 'Sky road';
  assert.equal(T.postState().named, true);
  assert.equal(T.postState().blocked, false, 'a named, never-posted track can be posted');
  T.editorDraft().posted = { id: null, code: T.encodeTrackCode(T.editorDraft().blocks) };
  assert.equal(T.postState().changed, false);
  assert.equal(T.postState().blocked, true, 'an unchanged posted track cannot be posted again');
  T.editorDraft().blocks.push('sprint');
  assert.equal(T.postState().changed, true);
  assert.equal(T.postState().blocked, false, 'editing a posted track offers a repost');
});

test('Trackbound road pieces can be dragged into a new place', () => {
  const page = load();
  const T = page.sandbox.__test;
  T.openEditor({ name: 'Drag road', blocks: ['sprint', 'straight', 'checkpoint', 'curveL'] });
  T.moveBlockTo(3, 0);
  assert.deepEqual(Array.from(T.editorDraft().blocks), ['curveL', 'sprint', 'straight', 'checkpoint']);
  T.moveBlockTo(0, 2);
  assert.deepEqual(Array.from(T.editorDraft().blocks), ['sprint', 'straight', 'curveL', 'checkpoint']);
  T.moveBlockTo(9, 0);
  assert.deepEqual(Array.from(T.editorDraft().blocks), ['sprint', 'straight', 'curveL', 'checkpoint'],
    'a drop outside the list changes nothing');
  assert.equal(T.editorView.selected, 2, 'the moved piece stays selected');
});

test('Trackbound public list shows the leader and lists the next three on hover', () => {
  const T = load().sandbox.__test;
  const times = [
    { handle: 'Ash', ms: 42310 }, { handle: 'Wren', ms: 43120 }, { handle: 'Bo', ms: 44000 },
    { handle: 'Cy', ms: 45999 }, { handle: 'Dee', ms: 60000 }
  ];
  assert.match(T.timeLabel(times[0]), /^Ash /);
  const hover = T.nextTimesLabel(times);
  assert.equal(hover.split('\n').length, 3, 'only the next three are listed');
  assert.match(hover, /^2\. Wren /);
  assert.match(hover, /4\. Cy /);
  assert.equal(T.nextTimesLabel([times[0]]), 'Only time on this course so far.');
});

test('Trackbound offers the editor only for a test drive and drops next track on a custom course', () => {
  const page = load();
  const T = page.sandbox.__test;
  const draft = { name: 'Straight dash', blocks: ['sprint', 'checkpoint', 'sprint'] };
  assert.equal(T.startCustomTrack(draft, null, true), true);
  assert.equal(T.current().testDrive, true, 'the editor says where the drive came from');
  assert.equal(page.element('resEdit').hidden, false, 'a test drive can go back to the editor');
  assert.equal(page.element('pauseEdit').hidden, false, 'and from the pause screen');
  assert.equal(page.element('resNext').hidden, true, 'a custom course has no next track');
  assert.equal(T.startCustomTrack(draft), true);
  assert.equal(T.current().testDrive, false);
  assert.equal(page.element('resEdit').hidden, true, 'a course from the list is not an edit session');
  assert.equal(page.element('pauseEdit').hidden, true);
  assert.equal(page.element('resNext').hidden, true);
});

test('Trackbound reports a finished public course to its board', async () => {
  const page = load();
  const T = page.sandbox.__test;
  const calls = [];
  page.sandbox.__boredTracks = { call: (op, payload) => { calls.push({ op, payload }); return Promise.resolve({ ok: true }); } };
  const track = '11111111-1111-4111-8111-111111111111';
  assert.equal(T.startCustomTrack({ name: 'Sky road', blocks: ['sprint', 'checkpoint', 'sprint'] }, track), true);
  for (let i = 0; i < 120 * 14 && T.race.state !== 'finished'; i++) {
    T.stepRace(1 / 120, { gas: true, brake: false, steer: 0, handbrake: false });
  }
  assert.equal(T.race.state, 'finished');
  for (let i = 0; i < 3; i++) await page.flush();
  assert.equal(calls.filter(call => call.op === 'run').length, 1, 'one report per finished run');
  assert.equal(calls[0].op, 'run');
  assert.equal(calls[0].payload.track, track);
  assert.ok(calls[0].payload.ms > 0, 'the run clock is reported');
  assert.ok(calls.some(call => call.op === 'list'), 'the course board is read back for the result screen');
});

test('Trackbound reports times from My tracks when the saved copy is the posted version', async () => {
  const page = load();
  const T = page.sandbox.__test;
  const calls = [];
  page.sandbox.__boredTracks = { call: (op, payload) => { calls.push({ op, payload }); return Promise.resolve({ ok: true }); } };
  const trackId = '33333333-3333-4333-8333-333333333333';
  const blocks = ['sprint', 'checkpoint', 'sprint'];
  T.openEditor({ name: 'Sky road', blocks });
  assert.equal(T.saveCustomTrack(), true);
  const record = T.customTracks()[0];
  record.posted = { id: trackId, code: T.encodeTrackCode(blocks) };
  assert.equal(T.publishedId(record), trackId);
  assert.equal(T.startCustomTrack(record, T.publishedId(record)), true);
  for (let i = 0; i < 120 * 14 && T.race.state !== 'finished'; i++) {
    T.stepRace(1 / 120, { gas: true, brake: false, steer: 0, handbrake: false });
  }
  assert.equal(T.race.state, 'finished');
  for (let i = 0; i < 3; i++) await page.flush();
  assert.equal(calls.filter(call => call.op === 'run').length, 1, 'a saved copy of the posted course reports its run');
  assert.equal(calls[0].op, 'run');
  assert.equal(calls[0].payload.track, trackId);
  record.blocks.push('sprint');
  assert.equal(T.publishedId(record), null, 'an edited course is no longer the posted one');
});

test('Trackbound lets an author remove a posted track and forgets it locally', async () => {
  const page = load();
  const T = page.sandbox.__test;
  const calls = [];
  const trackId = '44444444-4444-4444-8444-444444444444';
  page.sandbox.__boredTracks = {
    call: (op, payload) => {
      calls.push({ op, payload });
      if (op === 'list') {
        return Promise.resolve({ tracks: [{ id: trackId, name: 'Sky road', handle: 'Ash',
          code: T.encodeTrackCode(['sprint', 'checkpoint', 'sprint']), at: 1, best: [], mine: true }] });
      }
      return Promise.resolve({ ok: true });
    }
  };
  T.openEditor({ name: 'Sky road', blocks: ['sprint', 'checkpoint', 'sprint'] });
  assert.equal(T.saveCustomTrack(), true);
  T.customTracks()[0].posted = { id: trackId, code: T.encodeTrackCode(T.customTracks()[0].blocks) };
  await T.refreshPublicList();
  assert.equal(T.publicTracks().length, 1);
  assert.equal(await T.deletePublicTrack(T.publicTracks()[0]), true);
  assert.equal(calls.some(call => call.op === 'remove' && call.payload.id === trackId), true);
  assert.equal(T.publicTracks().length, 0, 'the row leaves the list');
  assert.equal(T.customTracks()[0].posted, undefined, 'the saved copy can be posted again');
});

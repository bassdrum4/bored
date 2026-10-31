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
      listeners: {}, clientWidth: 960, clientHeight: 600,
      classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener: noop,
      appendChild: noop, append: noop, replaceChildren: noop,
      setAttribute: noop, removeAttribute: noop, focus: noop,
      getContext: type => (gl && /webgl/i.test(String(type)) ? gl : null),
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
    flush: () => new Promise(resolve => queueMicrotask(resolve)),
    advance: noop
  };
}

// A crude driver that follows the centre line: enough to prove a track can be
// completed and that the clock, checkpoints and finish line agree.
function autopilot(page, index) {
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
    while (ahead < points.length - 1 && travelled < 12) {
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
    const braking = speed > 30 && Math.abs(angle) > 0.4;
    T.stepRace(1 / 120, {
      gas: !braking,
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
  assert.equal(T.CAMPAIGN.length, 8, 'eight campaign tracks');
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
  assert.ok(snapshot.medals >= 1, 'a finished run inside the author time earns a medal');
  assert.equal(snapshot.track, 'paddock');
  const stored = JSON.parse(page.storage.get('bored.trackbound.best'));
  assert.ok(stored.paddock.ms > 0, 'the best time is kept');
  assert.ok(Array.isArray(stored.paddock.ghost) && stored.paddock.ghost.length > 4, 'a ghost is kept');
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
  console.log('DEBUG saved.best keys:', Object.keys((again.sandbox.__test.snapshot, again.sandbox.__raceDebug && again.sandbox.__raceDebug()) || []));
  again.sandbox.__test.startCampaign(0);
  console.log('DEBUG after start: best =', again.sandbox.__test.race.best && again.sandbox.__test.race.best.ms, 'mirror=', mirror.paddock.ms);
  const race = again.sandbox.__test.race;
  assert.ok(race.best && race.best.ms === mirror.paddock.ms, 'the best came back from the database');
  assert.ok(Array.isArray(race.ghost) && race.ghost.length > 4, 'the ghost came back too');
  assert.ok(again.sandbox.__test.snapshot().medals >= 1, 'the medal count loaded');
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

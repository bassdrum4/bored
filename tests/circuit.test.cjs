const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The games are single HTML documents with their script inline, so this loads
// the real document into a stub page and drives the real functions. Nothing is
// copied out of the source: a broken lap counter fails here.
function load(file) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src/games/content', file), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const noop = () => {};
  const canvas = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : noop),
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const elements = new Map();
  const element = id => {
    if (elements.has(id)) return elements.get(id);
    const node = {
      id, textContent: '', className: '', hidden: false, value: '', dataset: {}, style: {}, listeners: {},
      classList: { add: noop, remove: noop, contains: () => false },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener: noop,
      appendChild: noop,
      replaceChildren: noop,
      focus: noop,
      setAttribute: noop,
      removeAttribute: noop,
      getContext: () => canvas,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 760, height: 520 }),
      querySelectorAll: () => []
    };
    elements.set(id, node);
    return node;
  };
  let clock = 0;
  const listeners = {};
  const sandbox = {
    console,
    document: {
      getElementById: element,
      createElement: () => element('created-' + elements.size),
      querySelector: () => element('query'),
      querySelectorAll: () => [],
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      body: { classList: { add: noop, remove: noop, contains: () => false } }
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener: noop,
    performance: { now: () => clock },
    requestAnimationFrame: () => 0,
    setInterval: () => 0,
    clearInterval: noop,
    setTimeout: () => 0,
    clearTimeout: noop,
    __boredSeed: { date: '2026-10-30', seed: 123456789, code: 'ABCDEF' }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const script of scripts) vm.runInContext(script, sandbox, { filename: file });
  return {
    sandbox,
    element: id => elements.get(id),
    advance: ms => { clock += ms; },
    fire(type, event) { for (const fn of listeners[type] || []) fn(event); },
    fireOn(node, type) { for (const fn of node?.listeners?.[type] || []) fn({ target: node }); }
  };
}

// Walk the car around the real centreline one sample at a time, which is how
// progress is accumulated, and let each frame be 1/60 of a second.
function drive(page, game, frames) {
  const points = game.path();
  const car = game.cars()[0];
  for (let step = 0; step < frames; step++) {
    const point = points[step % points.length];
    car.x = point.x;
    car.y = point.y;
    page.advance(1000 / 60);
    game.step(1 / 60);
  }
}

test('Circuit draws a seeded loop that fits the board', () => {
  const page = load('circuit.html');
  const points = page.sandbox.__test.path();
  assert.ok(points.length >= 360, 'the centreline is sampled finely enough to measure progress');
  for (const point of points) {
    assert.ok(point.x > 20 && point.x < 740, 'track leaves the canvas horizontally at ' + point.x);
    assert.ok(point.y > 20 && point.y < 500, 'track leaves the canvas vertically at ' + point.y);
  }
});

test('Circuit ships several drawn tracks of equal length', () => {
  const page = load('circuit.html');
  const shapes = page.sandbox.__test.shapes();
  assert.ok(shapes.length >= 4, 'more than one circuit to learn');
  assert.equal(new Set(shapes.map(shape => shape.name)).size, shapes.length, 'each track has its own name');
  const lengths = [];
  for (const shape of shapes) {
    const points = shape.points;
    assert.equal(points.length, 720, shape.name + ' is sampled like the rest');
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, total = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), shape.name + ' has a stray point at ' + i);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      total += Math.hypot(q.x - p.x, q.y - p.y);
    }
    assert.ok(minX > 26 && maxX < 734 && minY > 26 && maxY < 494,
      shape.name + ' leaves the board: ' + [minX, minY, maxX, maxY].map(v => v.toFixed(0)).join(','));
    lengths.push(total);
    // Two stretches of road closer than the road is wide are drawn as one blob
    // and confuse the nearest-point lookup, so anything but neighbouring
    // samples has to stay clear.
    let closest = Infinity;
    for (let i = 0; i < points.length; i += 2) {
      for (let j = i + 60; j < points.length; j += 2) {
        if (points.length - (j - i) < 60) continue;
        closest = Math.min(closest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
      }
    }
    assert.ok(closest > 58, shape.name + ' folds back on itself (' + closest.toFixed(1) + 'px apart)');
  }
  const spread = Math.max(...lengths) - Math.min(...lengths);
  assert.ok(spread < 20, 'every track is the same length so times compare: ' + spread.toFixed(1) + 'px apart');
});

test('Circuit swaps the shape from the track button', () => {
  const page = load('circuit.html');
  const game = page.sandbox.__test;
  const before = game.trackName();
  const beforePath = game.path().map(point => ({ ...point }));
  page.fireOn(page.element('track'), 'click');
  assert.notEqual(game.trackName(), before, 'the button names the next track');
  assert.equal(page.element('track').textContent, game.trackName(), 'and the label follows it');
  const moved = game.path().some((point, i) => Math.abs(point.x - beforePath[i].x) > 1 || Math.abs(point.y - beforePath[i].y) > 1);
  assert.ok(moved, 'the centreline is a different shape');
  assert.equal(game.cars().length, 1, 'and the race restarts on the new track');
});

test('Circuit times the whole three-lap race, not a single lap', () => {
  const page = load('circuit.html');
  const game = page.sandbox.__test;
  game.place();
  page.fire('keydown', { key: 'ArrowUp', preventDefault() {} });
  drive(page, game, game.path().length * 2 + 12);
  let snapshot = page.sandbox.__boredSnapshot();
  assert.equal(snapshot.laps, 2);
  assert.equal(snapshot.finished, false);
  assert.equal(snapshot.seconds, 0, 'a race that is still running has no score');
  assert.equal(snapshot.lapDone, false);
  drive(page, game, game.path().length * 2 + 12);
  snapshot = page.sandbox.__boredSnapshot();
  assert.equal(snapshot.slug, 'circuit');
  assert.equal(snapshot.laps, 3);
  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.lapDone, true);
  assert.ok(Number.isInteger(snapshot.seconds), 'the board needs an integer score');
  // Three laps of centreline at sixty frames a second is roughly 36 seconds, so
  // anything near a single lap means the clock was reset at the line.
  assert.ok(snapshot.seconds >= 34 && snapshot.seconds <= 38, 'race time ' + snapshot.seconds + 's should cover all three laps');
  assert.ok(snapshot.seconds >= 15 && snapshot.seconds <= 3600, 'race time ' + snapshot.seconds + 's is outside what the board accepts');
  assert.ok(Number.isInteger(snapshot.centiseconds));
});

test('Circuit reports a quiet snapshot before a lap is run', () => {
  const page = load('circuit.html');
  const snapshot = page.sandbox.__boredSnapshot();
  assert.deepEqual(
    { slug: snapshot.slug, finished: snapshot.finished, seconds: snapshot.seconds, laps: snapshot.laps, lapDone: snapshot.lapDone, twoPlayer: snapshot.twoPlayer },
    { slug: 'circuit', finished: false, seconds: 0, laps: 0, lapDone: false, twoPlayer: false }
  );
});

test('Circuit lets one player drive on W A S D', () => {
  const page = load('circuit.html');
  const game = page.sandbox.__test;
  page.fire('keydown', { key: 'w', preventDefault() {} });
  page.advance(1000 / 60);
  game.step(1 / 60);
  assert.equal(game.cars().length, 1, 'solo is still one car');
  assert.ok(game.cars()[0].v > 0, 'W accelerates the only car');
});

test('Circuit gives a second car the arrows and W A S D, with its own clock', () => {
  const page = load('circuit.html');
  const game = page.sandbox.__test;
  game.setDuel(true);
  const cars = game.cars();
  assert.equal(cars.length, 2, 'two-player mode puts a second car on the track');
  const [one, two] = cars;
  page.fire('keydown', { key: 'ArrowUp', preventDefault() {} });
  page.advance(1000 / 60);
  game.step(1 / 60);
  assert.ok(one.v > 0, 'player one drives on the arrows');
  assert.equal(two.v, 0, 'the arrows leave player two alone');
  page.fire('keyup', { key: 'ArrowUp' });
  page.fire('keydown', { key: 'w', preventDefault() {} });
  page.advance(1000 / 60);
  game.step(1 / 60);
  assert.ok(two.v > 0, 'player two drives on W');
  assert.ok(one.time > two.time, 'each car keeps its own race clock');
  assert.equal(page.sandbox.__boredSnapshot().twoPlayer, true);
});

test('Typing Test counts keys and stays unfinished until the clock runs out', () => {
  const page = load('typing-test.html');
  const field = page.element('field');
  assert.ok(field, 'the document has its hidden input');
  field.value = 'zzz';
  page.fireOn(field, 'input');
  const snapshot = page.sandbox.__boredSnapshot();
  assert.equal(snapshot.slug, 'typing-test');
  assert.equal(snapshot.keys, 3, 'every character reaches the test');
  assert.equal(snapshot.chars, 0, 'letters that match nothing are not credit');
  assert.equal(snapshot.finished, false);
  assert.ok(Number.isInteger(snapshot.wpm) && Number.isInteger(snapshot.accuracy));
  assert.ok(snapshot.accuracy <= 100);
});

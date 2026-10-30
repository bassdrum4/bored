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

test('Circuit draws a seeded loop that fits the board', () => {
  const page = load('circuit.html');
  const points = page.sandbox.__test.path();
  assert.ok(points.length >= 360, 'the centreline is sampled finely enough to measure progress');
  for (const point of points) {
    assert.ok(point.x > 20 && point.x < 740, 'track leaves the canvas horizontally at ' + point.x);
    assert.ok(point.y > 20 && point.y < 500, 'track leaves the canvas vertically at ' + point.y);
  }
});

test('Circuit counts three laps and ranks the best one', () => {
  const page = load('circuit.html');
  const game = page.sandbox.__test;
  game.place();
  const points = game.path();
  page.fire('keydown', { key: 'ArrowUp', preventDefault() {} });
  // Walk the car around the real centreline one sample at a time, which is how
  // progress is accumulated, and let each frame be 1/60 of a second.
  for (let step = 0; step < points.length * 3 + 12; step++) {
    const point = points[step % points.length];
    game.car().x = point.x;
    game.car().y = point.y;
    page.advance(1000 / 60);
    game.step(1 / 60);
  }
  const snapshot = page.sandbox.__boredSnapshot();
  assert.equal(snapshot.slug, 'circuit');
  assert.equal(snapshot.laps, 3);
  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.lapDone, true);
  assert.ok(Number.isInteger(snapshot.seconds), 'the board needs an integer score');
  assert.ok(snapshot.seconds >= 8 && snapshot.seconds <= 3600, 'lap time ' + snapshot.seconds + 's is outside what the board accepts');
  assert.ok(Number.isInteger(snapshot.centiseconds));
});

test('Circuit reports a quiet snapshot before a lap is run', () => {
  const page = load('circuit.html');
  const snapshot = page.sandbox.__boredSnapshot();
  assert.deepEqual(
    { slug: snapshot.slug, finished: snapshot.finished, seconds: snapshot.seconds, lapDone: snapshot.lapDone },
    { slug: 'circuit', finished: false, seconds: 0, lapDone: false }
  );
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

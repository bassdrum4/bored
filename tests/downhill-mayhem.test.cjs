'use strict';
// Downhill Mayhem ships as a Bored wrapper around a vendored single-file
// three.js build. This keeps the catalog honest, proves the wrapper starts the
// right document from both the hub and its own URL, and pins the payload so the
// build cannot drift into a different game or start calling off-site.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const wrapperPath = path.join(root, 'src/games/content/downhill-mayhem.html');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const vendor = path.join(root, 'src/games/content/downhill-mayhem');
const inner = fs.readFileSync(path.join(vendor, 'index.html'), 'utf8');

test('downhill mayhem is a catalogued, locally packaged, scored game', async () => {
  const { ORDER, META, EXTERNS, UNSCORED_GAMES, PAYLOAD_SLUGS } = await import('../src/games/catalog.js');
  const { DISCOVERY, PREVIEWS, PREVIEW_FALLBACKS } = await import('../src/games/discovery.js');
  const { CHALLENGES } = await import('../src/daily.js');
  const { LB_GAMES } = await import('../src/hub/scores.js');
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'src/games/score-rules.json'), 'utf8'));

  assert.deepEqual(ORDER.filter(([slug]) => slug === 'downhill-mayhem'), [['downhill-mayhem', 'Downhill Mayhem']]);
  assert.deepEqual(ORDER.filter(([slug]) => slug === 'dirt-trials'), [], 'the hand-built bike game is gone');
  assert.equal(EXTERNS['downhill-mayhem'], undefined);
  assert.equal(META['downhill-mayhem'][0], 'Arcade');
  assert.ok(META['downhill-mayhem'][1].length > 40);
  assert.ok(DISCOVERY['downhill-mayhem'].inputs.includes('Keyboard'));
  assert.equal(DISCOVERY['downhill-mayhem'].quick, true);
  assert.ok(!UNSCORED_GAMES.includes('downhill-mayhem'));
  assert.ok(PAYLOAD_SLUGS.includes('downhill-mayhem'));
  assert.equal(rules['downhill-mayhem'].better, 'low');
  assert.ok(LB_GAMES.some(game => game.id === 'downhill-mayhem' && game.lower));
  assert.ok(!CHALLENGES.some(game => game.slug === 'downhill-mayhem'));
  assert.equal(PREVIEW_FALLBACKS['downhill-mayhem'], undefined);
  assert.ok(PREVIEWS['downhill-mayhem'].endsWith('/downhill-mayhem.webp'));
  assert.ok(fs.existsSync(new URL(PREVIEWS['downhill-mayhem'])));
  assert.match(wrapper, /<title>Downhill Mayhem<\/title>/);
});

function bootWrapper(href, baseURI) {
  const elements = new Map();
  const element = id => ({
    id, hidden: false, disabled: false, textContent: '', src: '', onclick: null, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }
  });
  const document = {
    baseURI,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    }
  };
  document.getElementById('game').hidden = /<iframe[^>]*\shidden[\s>]/.test(wrapper);
  const sandbox = { document, location: { href }, URL, console, setTimeout: () => 0 };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(wrapper.match(/<script>([\s\S]*?)<\/script>/)[1], context, { filename: 'downhill-mayhem.html' });
  return { run: code => vm.runInContext(code, context), node: id => elements.get(id) };
}

test('the wrapper starts the local build from the hub and from its own address', () => {
  // Inside the hub the document is a srcdoc frame, so its base is the hub page.
  const hub = bootWrapper('about:srcdoc', 'https://example.test/bored/index.html');
  // The no-src iframe loads a blank placeholder whose load event can arrive after
  // this script does; it must not lift the cover over an empty stage.
  hub.node('game').listeners.load();
  assert.equal(hub.node('cover').hidden, false, 'the placeholder load is not the game');
  assert.deepEqual({ ...hub.run('__boredSnapshot()') }, { slug: 'downhill-mayhem', started: false, loaded: false, finished: false, seconds: 0 });
  assert.equal(hub.node('game').hidden, true, 'the build is not fetched until the player starts');
  hub.node('start').onclick();
  assert.equal(hub.node('game').src, 'https://example.test/bored/games/content/downhill-mayhem/index.html');
  assert.equal(hub.node('game').hidden, false);
  hub.node('game').listeners.load();
  assert.equal(hub.node('cover').hidden, true);
  assert.equal(hub.run('__boredSnapshot()').loaded, true);
  // The nested game exposes its live race state. Only an actual completed
  // Classic/MAYHEM attempt qualifies; the demonstration and easier courses do not.
  const embeddedGame = {
    demo: false, state: 'finished', mode: 'classic', difficulty: 'mayhem',
    player: { finished: true, finishTime: 124.56 }
  };
  hub.node('game').contentWindow = { GAME: embeddedGame };
  assert.deepEqual({ ...hub.run('__boredSnapshot()') }, {
    slug: 'downhill-mayhem', started: true, loaded: true, finished: true, seconds: 125
  });
  embeddedGame.difficulty = 'chill';
  assert.equal(hub.run('__boredSnapshot()').finished, false);
  embeddedGame.difficulty = 'mayhem';
  embeddedGame.mode = 'rock';
  assert.equal(hub.run('__boredSnapshot()').seconds, 0);
  embeddedGame.mode = 'classic';
  embeddedGame.demo = true;
  assert.equal(hub.run('__boredSnapshot()').finished, false);
  embeddedGame.demo = false;
  embeddedGame.player.finished = false;
  assert.equal(hub.run('__boredSnapshot()').finished, false);

  // Opened on its own, the game folder sits beside the wrapper document.
  const standalone = bootWrapper(
    'https://example.test/bored/games/content/downhill-mayhem.html',
    'https://example.test/bored/games/content/downhill-mayhem.html'
  );
  standalone.node('start').onclick();
  assert.equal(standalone.node('game').src, 'https://example.test/bored/games/content/downhill-mayhem/index.html');
});

test('the vendored build is complete, offline, and unlicensed code stays out', () => {
  for (const file of ['index.html', 'LICENSE', 'THREE.LICENSE']) {
    assert.ok(fs.existsSync(path.join(vendor, file)), 'missing ' + file);
  }
  // One self-contained document: three.js is inlined rather than fetched.
  assert.match(inner, /three\.js r128/);
  assert.match(inner, /SPDX-License-Identifier: MIT/);
  assert.ok(inner.length > 600000 && inner.length < 1200000, 'the payload stays around three quarters of a megabyte');
  assert.match(inner, /<title>Downhill Mayhem<\/title>/);
  assert.match(inner, /window\.TRACK=function\(\)\{\}/, 'the analytics hook is a local no-op');
  assert.match(inner, /const SAVE_KEY='bored\.downhill-mayhem\.best'/, 'best times live under the arcade prefix');

  for (const html of [wrapper, inner]) {
    assert.doesNotMatch(html, /<script[^>]+\ssrc=/i, 'no remote scripts');
    assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i, 'no remote stylesheets');
    assert.doesNotMatch(html, /<img[^>]+src=["']https?:/i, 'no remote images');
  }
  assert.doesNotMatch(inner, /goatcounter|gc\.zgo\.at/, 'the visit counter is gone');
  assert.doesNotMatch(inner, /XMLHttpRequest\.open/, 'the build makes no requests of its own');
  assert.doesNotMatch(wrapper, /localStorage|sessionStorage/);
});

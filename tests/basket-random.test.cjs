'use strict';
// Basket Random ships as a Bored wrapper around a vendored Construct 3 build.
// This keeps the catalog honest, proves the wrapper starts the right document
// from both the hub and its own URL, and pins the payload so it cannot drift
// into a different game or start loading things off-site.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const wrapperPath = path.join(root, 'src/games/content/basket-random.html');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
const vendor = path.join(root, 'src/games/content/basket-random');
const sha = file => createHash('sha256').update(fs.readFileSync(path.join(vendor, file))).digest('hex');

test('basket random is a catalogued, local, unscored two-player game', async () => {
  const { ORDER, META, EXTERNS, UNSCORED_GAMES, PAYLOAD_SLUGS } = await import('../src/games/catalog.js');
  const { DISCOVERY, PREVIEWS, PREVIEW_FALLBACKS } = await import('../src/games/discovery.js');
  const { CHALLENGES } = await import('../src/daily.js');
  const { LB_GAMES } = await import('../src/hub/scores.js');
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'src/games/score-rules.json'), 'utf8'));

  assert.deepEqual(ORDER.filter(([slug]) => slug === 'basket-random'), [['basket-random', 'Basket Random']]);
  assert.equal(EXTERNS['basket-random'], undefined);
  assert.deepEqual(META['basket-random'], ['Arcade', 'Two players, one ball and a physics engine that keeps changing its mind.']);
  assert.equal(DISCOVERY['basket-random'].players, '2 local');
  assert.equal(DISCOVERY['basket-random'].quick, true);
  assert.ok(UNSCORED_GAMES.includes('basket-random'));
  assert.ok(PAYLOAD_SLUGS.includes('basket-random'));
  assert.equal(rules['basket-random'], undefined);
  assert.ok(!LB_GAMES.some(game => game.id === 'basket-random'));
  assert.ok(!CHALLENGES.some(game => game.slug === 'basket-random'));
  assert.equal(PREVIEW_FALLBACKS['basket-random'], undefined);
  assert.ok(PREVIEWS['basket-random'].endsWith('/basket-random.webp'));
  assert.ok(fs.existsSync(new URL(PREVIEWS['basket-random'])));
  assert.match(fs.readFileSync(wrapperPath, 'utf8'), /<title>Basket Random<\/title>/);
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
  // The iframe carries the hidden attribute in the markup; the stub starts bare.
  document.getElementById('game').hidden = /<iframe[^>]*\shidden[\s>]/.test(wrapper);
  const sandbox = { document, location: { href }, URL, console, setTimeout: () => 0 };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(wrapper.match(/<script>([\s\S]*?)<\/script>/)[1], context, { filename: 'basket-random.html' });
  return { run: code => vm.runInContext(code, context), node: id => elements.get(id) };
}

test('the wrapper starts the local build from the hub and from its own address', () => {
  // Inside the hub the document is a srcdoc frame, so its base is the hub page.
  const hub = bootWrapper('about:srcdoc', 'https://example.test/bored/index.html');
  // The no-src iframe loads a blank placeholder whose load event can arrive after
  // this script does; it must not lift the cover over an empty stage.
  hub.node('game').listeners.load();
  assert.equal(hub.node('cover').hidden, false, 'the placeholder load is not the game');
  assert.deepEqual({ ...hub.run('__boredSnapshot()') }, { slug: 'basket-random', started: false, loaded: false, finished: false });
  assert.equal(hub.node('game').hidden, true, 'the build is not fetched until the player starts');
  hub.node('start').onclick();
  assert.equal(hub.node('game').src, 'https://example.test/bored/games/content/basket-random/index.html');
  assert.equal(hub.node('game').hidden, false);
  hub.node('game').listeners.load();
  assert.equal(hub.node('cover').hidden, true);
  assert.equal(hub.run('__boredSnapshot()').loaded, true);

  // Opened on its own, the game folder sits beside the wrapper document.
  const standalone = bootWrapper(
    'https://example.test/bored/games/content/basket-random.html',
    'https://example.test/bored/games/content/basket-random.html'
  );
  standalone.node('start').onclick();
  assert.equal(standalone.node('game').src, 'https://example.test/bored/games/content/basket-random/index.html');
});

test('the vendored Construct 3 build is complete and stays offline', () => {
  for (const file of [
    'index.html', 'style.css', 'data.json', 'box2d.wasm', 'box2d.wasm.js',
    'scripts/main.js', 'scripts/c3runtime.js', 'scripts/supportcheck.js', 'scripts/offlineclient.js',
    'scripts/dispatchworker.js', 'scripts/jobworker.js', 'patch/js/gd-sdk.js'
  ]) {
    assert.ok(fs.existsSync(path.join(vendor, file)), 'missing ' + file);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(vendor, 'data.json'), 'utf8')).project[0], 'Basket Random');
  assert.equal(sha('data.json'), 'c206e99105049fcce5f49eb363e217a6421f77e7f4f7ffd58d73ff8a3198ef36');
  assert.equal(sha('scripts/c3runtime.js'), '6189b6125c52212f24c3f2a0fbb3f531f8e234cae854c8121453e5f38029391f');

  const inner = fs.readFileSync(path.join(vendor, 'index.html'), 'utf8');
  assert.doesNotMatch(inner, /register-sw/i, 'the hosting page service worker is not part of the game');
  for (const html of [wrapper, inner]) {
    assert.doesNotMatch(html, /<(?:script|link|img|iframe)[^>]+(?:src|href)=["']https?:/i, 'no remote payloads');
  }
  assert.doesNotMatch(inner, /gameDistribution|azerion|eponesh|analytics/i, 'the host page SDKs stay out');
  assert.doesNotMatch(wrapper, /localStorage|sessionStorage/);

  // The build still asks its old host for the GameDistribution SDK at startup.
  // The local stub answers that request so PLAY's ad call cannot throw; it must
  // never add a network dependency of its own.
  assert.match(fs.readFileSync(path.join(vendor, 'scripts/c3runtime.js'), 'utf8'), /patch\/js\/gd-sdk\.js/);
  const sdk = fs.readFileSync(path.join(vendor, 'patch/js/gd-sdk.js'), 'utf8');
  assert.match(sdk, /window\.gdsdk\s*=/);
  assert.match(sdk, /showAd\(/);
  assert.match(sdk, /preloadAd\(/);
  assert.doesNotMatch(sdk, /https?:|fetch\(|XMLHttpRequest/, 'the stub stays local');

  const art = fs.readdirSync(path.join(vendor, 'images')).length + fs.readdirSync(path.join(vendor, 'media')).length;
  assert.ok(art >= 40, 'the art and audio travel with the game');
  const bytes = ['data.json', 'box2d.wasm', 'box2d.wasm.js', 'scripts/c3runtime.js']
    .reduce((total, file) => total + fs.statSync(path.join(vendor, file)).size, 0);
  assert.ok(bytes < 4 * 1024 * 1024, 'the payload stays small enough to fetch on demand');
});

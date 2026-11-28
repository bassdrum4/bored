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
  assert.equal(META['basket-random'][0], 'Arcade');
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
    id, hidden: false, disabled: false, textContent: '', src: '', listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }
  });
  const document = {
    baseURI,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    }
  };
  const sandbox = { document, location: { href }, URL, console };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(wrapper.match(/<script>([\s\S]*?)<\/script>/)[1], context, { filename: 'basket-random.html' });
  return { run: code => vm.runInContext(code, context), node: id => elements.get(id) };
}

test('basket random starts its original main menu immediately, from hub or standalone URL', () => {
  assert.doesNotMatch(wrapper, /Start match|Still loading|id="cover"/i);
  const hub = bootWrapper('about:srcdoc', 'https://example.test/bored/index.html');
  assert.equal(hub.node('game').src, 'https://example.test/bored/games/content/basket-random/index.html');
  assert.equal(hub.node('game').hidden, false);
  assert.deepEqual({ ...hub.run('__boredSnapshot()') }, { slug: 'basket-random', started: true, loaded: false, finished: false });
  hub.node('game').listeners.load();
  assert.equal(hub.run('__boredSnapshot()').loaded, true);

  const standalone = bootWrapper(
    'https://example.test/bored/games/content/basket-random.html',
    'https://example.test/bored/games/content/basket-random.html'
  );
  assert.equal(standalone.node('game').src, 'https://example.test/bored/games/content/basket-random/index.html');
});

test('construct starts on the main menu and has no More or TwoPlayerGames links', () => {
  const project = JSON.parse(fs.readFileSync(path.join(vendor, 'data.json'), 'utf8')).project;
  assert.equal(project[1], 'game');
  const menuItems = project[5].find(layout => layout[0] === 'game')[6].flatMap(layer => layer[14] || []);
  assert.ok(!menuItems.some(instance => [20, 54].includes(instance[1])), 'More button and TPG logo must not be placed');
  for (const [name, events] of project[6]) {
    function visit(item) {
      if (![0, 3, 4].includes(item[0])) return;
      for (const condition of item[6] || []) {
        assert.ok(!/\[4,(?:20|54)\]/.test(JSON.stringify(condition)), name + ' still touches the removed promo links');
      }
      for (const action of item[7] || []) assert.ok(!(action[0] === 49 && action[1] === 176), name + ' has a leftover external browser navigation');
      for (const child of item[8] || []) visit(child);
    }
    for (const item of events) visit(item);
  }
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
  assert.equal(JSON.parse(fs.readFileSync(path.join(vendor, 'data.json'), 'utf8')).project[1], 'game');
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


test('the recovered Construct event source round-trips and rebuilds a playable package', () => {
  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const script = path.join(root, 'src/prototypes/basket-random/decompile.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bored-basket-rebuild-'));
  const destination = path.join(dir, 'basket-random');
  try {
    execFileSync(process.execPath, [script, '--check'], { cwd: root, timeout: 30000 });
    execFileSync(process.execPath, [script, '--rebuild', destination], { cwd: root, timeout: 30000 });
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(destination, 'data.json'), 'utf8')),
      JSON.parse(fs.readFileSync(path.join(vendor, 'data.json'), 'utf8')),
      'extraction and rebuild must preserve all original Construct event data'
    );
    for (const file of ['scripts/main.js', 'scripts/c3runtime.js']) {
      assert.deepEqual(fs.readFileSync(path.join(destination, file)), fs.readFileSync(path.join(vendor, file)));
    }
    assert.ok(fs.existsSync(path.join(destination, 'index.html')));
    assert.ok(fs.existsSync(path.join(destination, 'box2d.wasm')));
    const index = fs.readFileSync(path.join(root, 'src/prototypes/basket-random/source/INDEX.md'), 'utf8');
    for (const name of ['gameEvent', 'bonusEvent', 'player1Event', 'player2Event']) {
      assert.match(index, new RegExp(name));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

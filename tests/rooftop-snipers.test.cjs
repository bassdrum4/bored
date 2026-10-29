const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/games/content/rooftop-snipers.html'), 'utf8');
const build = JSON.parse(html.match(/<script id="unity-build" type="application\/json">(.*?)<\/script>/s)[1]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('the original replaces the remake under its existing identity without obsolete scoring', async () => {
  const { ORDER, UNSCORED_GAMES } = await import('../src/games/catalog.js');
  const { CHALLENGES } = await import('../src/daily.js');
  const { LB_GAMES } = await import('../src/hub/scores.js');
  assert.deepEqual(ORDER.filter(([slug]) => slug.startsWith('rooftop-snipers')), [['rooftop-snipers', 'Rooftop Snipers: Boring Edition']]);
  assert.ok(UNSCORED_GAMES.includes('rooftop-snipers'));
  assert.ok(!CHALLENGES.some(game => game.slug === 'rooftop-snipers'));
  assert.ok(!LB_GAMES.some(game => game.id === 'rooftop-snipers'));
  assert.equal(fs.existsSync(path.join(root, 'src/games/content/rooftop-snipers-classic.html')), false);
  assert.match(html, /slug: 'rooftop-snipers'/);
});

test('Rooftop Snipers preserves original gameplay/assets and packages a valid offline Unity framework', () => {
  // Prevent accidentally swapping the actual game for the native remake or a
  // placeholder while keeping the new card. Core code, data and memory stay exact.
  for (const [name, hash] of Object.entries({
    'rooftop-snipers.asm.code.unityweb': '9fdb1d5414f6bab1f84467e7d834f5694cb612d80af6394e4b6c13b85c7ba5da',
    'rooftop-snipers.data.unityweb': '3630893d0c341d0c13b21c856e55dcb638a005f3f761939f4deac9b505258cc9',
    'rooftop-snipers.asm.memory.unityweb': '884ffa169399ef39af758b6d4fbc0dfd0a97e6dc8bff5d35a4cf2cf46098b682'
  })) assert.equal(sha(Buffer.from(build.assets[name], 'base64')), hash, name);
  for (const key of ['dataUrl', 'asmCodeUrl', 'asmMemoryUrl', 'asmFrameworkUrl']) {
    assert.ok(build.assets[build.config[key]], key + ' maps to an embedded resource');
  }
  const compressed = Buffer.from(build.assets[build.config.asmFrameworkUrl], 'base64');
  assert.ok(compressed.subarray(10, 45).toString().startsWith('UnityWeb Compressed Content (gzip)\0'), 'old loader requires the Unity gzip comment');
  const framework = gunzipSync(compressed).toString();
  assert.doesNotThrow(() => new vm.Script(framework));
  assert.match(framework, /Module\.boredCreateRequest\(Pointer_stringify\(url\),Pointer_stringify\(method\)\)/);
  assert.match(html, /Copyright \(c\) 2021 Echo/);
  assert.match(html, /connect-src blob:/);
  assert.doesNotMatch(html, /<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for (const script of scripts) if (!script[0].includes('application/json')) assert.doesNotThrow(() => new vm.Script(script[1]));
});

test('Rooftop Snipers launches the real Unity game through Bored, fits touch screens, and restarts/exits', { timeout: 120000 }, async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(path.join(root, 'src'));
  let browser;
  t.after(async () => { try { await browser?.close(); } finally { await site.close(); } });
  browser = await puppeteer.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(site.origin + '/')) {
      remote.push(request.url());
      // Existing hub requests are irrelevant here; return empty, readable data.
      return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
    }
    return request.continue();
  });
  // Keep mobile emulation constant: changing it later reloads the hub and
  // disposes its iframe. Only dimensions change during the live Unity session.
  await page.setViewport({ width: 960, height: 720, isMobile: true, hasTouch: true });
  await page.goto(site.url);
  await page.waitForFunction(() => typeof openGame === 'function');
  await page.evaluate(() => openGame('rooftop-snipers'));
  const frame = await (await page.$('#frame')).contentFrame();
  await frame.waitForSelector('#start');
  assert.equal(await frame.evaluate(() => __boredSnapshot().loaded), false);
  const before = remote.length;
  await frame.click('#start');
  await frame.waitForFunction(() => __boredSnapshot().loaded, { timeout: 90000 });
  // A compiled game's runtime starts before its scene finishes the splash.
  await new Promise(resolve => setTimeout(resolve, 6000));
  assert.equal(await frame.evaluate(() => gameInstance.Module.calledRun), true);
  assert.equal(await frame.$eval('#cover', element => element.hidden), true);
  // The surrounding hub records game/visit analytics; the Unity payload itself
  // must not initiate its own requests.
  assert.deepEqual(remote.slice(before).filter(url => !/\/rest\/v1\/(?:play_events|product_events)$/.test(url)), [],
    'Unity makes no HTTP calls, including optional telemetry');

  await page.setViewport({ width: 320, height: 740, isMobile: true, hasTouch: true });
  await frame.waitForFunction(() => document.querySelector('#game').getBoundingClientRect().width <= innerWidth);
  assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
  const ratio = await frame.$eval('#game', element => { const box = element.getBoundingClientRect(); return box.width / box.height; });
  assert.ok(Math.abs(ratio - 16 / 9) < .01, 'portrait view shows the whole landscape playfield instead of cropping both players');
  // Observe the actual events entering Unity's document. Both thumbs can hold
  // independent keys, and cancellation/blur must release them exactly once.
  await frame.evaluate(() => {
    window.observedKeys = [];
    for (const type of ['keydown', 'keyup']) document.addEventListener(type, e => observedKeys.push([e.type, e.keyCode]));
    const jump = document.querySelector('[data-code="87"]');
    const fire = document.querySelector('[data-code="69"]');
    jump.setPointerCapture = fire.setPointerCapture = () => {};
    jump.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1 }));
    fire.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2 }));
    fire.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 2 }));
    dispatchEvent(new Event('blur'));
  });
  assert.deepEqual(await frame.evaluate(() => observedKeys), [['keydown', 87], ['keydown', 69], ['keyup', 69], ['keyup', 87]]);
  const shots = path.join(root, '_build', 'rooftop-snipers');
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, 'mobile.png') });
  await page.setViewport({ width: 960, height: 720, isMobile: true, hasTouch: true });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#player').hidden);
  await page.evaluate(() => openGame('rooftop-snipers'));
  const reopened = await (await page.$('#frame')).contentFrame();
  await reopened.waitForSelector('#start');
  assert.equal(await reopened.evaluate(() => __boredSnapshot().loaded), false, 'a new frame frees the prior Unity session');
  await reopened.focus('#start');
  await page.keyboard.down('Shift');
  await page.keyboard.press('R');
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelector('#start')?.disabled === false);
  assert.deepEqual(errors, []);
});

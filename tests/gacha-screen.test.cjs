// Poké Gacha's pull screen in a real browser, through the hub: the frame is
// scaled by a whole number and centered, the scene fills the window, and
// nothing on the pull screen covers anything else at any window size.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');
const { respondToAnalytics } = require('./telemetry-isolation.cjs');

const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Read in the game frame: rectangles in CSS pixels, scaled from the 640x384 internal frame.
function measure() {
  machine = 'legend';
  updateScene();
  const box = s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const k = document.querySelector('#frame').getBoundingClientRect().width / 640;
  const stage = box('#stage');
  const at = (l, t, r, b) => ({ l: stage.l + l * k, t: stage.t + t * k, r: stage.l + r * k, b: stage.t + b * k });
  return {
    k, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    wrap: box('#wrap'), sky: box('#sky'), menu: box('#menu'), counts: box('#counts'), msg: box('#msg'), banner: box('#banner'),
    // Drawn on the canvas, so measured from the layout: the machine (internal x 104-316,
    // y 14-272), the next machine from x 560, the egg pile above the plate, the
    // plate's clear area that holds the banner, and the "UP!" drawn beside it.
    machine: at(104, 14, 316, 272), next: at(560, 14, 772, 272), pile: at(116, 34, 304, 76), window: at(162, 98, 258, 128),
    words: at(220, 106, 244, 122)
  };
}
const overlap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const inside = (a, b) => a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;

test('the Poké Gacha pull screen fills the window at a whole-number scale, with nothing overlapping', async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(path.join(root, 'src'));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [] });
  t.after(async () => { await browser.close(); await site.close(); });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (respondToAnalytics(request)) return;
    if (request.url().startsWith(site.origin)) request.continue(); else request.abort();
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(site.url);
  await page.waitForFunction(() => typeof openGame === 'function');
  await page.evaluate(() => openGame('poke-gacha'));
  await page.waitForFunction(() => document.querySelector('#frame')?.contentDocument?.querySelector('#tabs .panel'));
  const game = await (await page.$('#frame')).contentFrame();
  // A new wallet opens on the starter pick when the page has one: take the first.
  await game.evaluate(() => { if (typeof picking !== 'undefined' && picking) { starterEnter(); starterEnter(); } });
  await game.evaluate(() => go('pull'));

  // A phone, the 640x384 frame exactly, a small embed, the owner's Google Sites game
  // area (about 1900x790, which must reach 2x), laptops and big screens.
  const expected = { '360x640': 0.5625, '640x384': 1, '1000x630': 1, '1900x790': 2, '1366x768': 2, '1440x900': 2, '1920x1080': 2, '2560x1440': 3 };
  for (const [size, scale] of Object.entries(expected)) {
    const [width, height] = size.split('x').map(Number);
    await page.setViewport({ width, height });
    await pause(150);
    const m = await game.evaluate(measure);
    assert.equal(m.k, scale, size + ': the biggest whole scale that fits (or a shrink below 640px)');
    assert.ok(m.scrollWidth <= m.width, size + ': no horizontal scroll');
    assert.ok(inside(m.wrap, { l: 0, t: 0, r: m.width, b: m.height }), size + ': the frame is fully in view');
    assert.ok(Math.abs((m.wrap.l + m.wrap.r) / 2 - m.width / 2) <= m.k, size + ': centered across');
    assert.ok(Math.abs((m.wrap.t + m.wrap.b) / 2 - m.height / 2) <= m.k, size + ': centered down');
    assert.ok(m.sky.l <= 0 && m.sky.t <= 0 && m.sky.r >= m.width && m.sky.b >= m.height, size + ': the scene fills the window');
    assert.ok(!overlap(m.menu, m.machine) && !overlap(m.counts, m.machine), size + ': the menu column clears the machine');
    assert.ok(!overlap(m.menu, m.next) && !overlap(m.counts, m.next), size + ': the menu column clears the next machine');
    assert.ok(m.msg.t >= m.machine.b && !overlap(m.msg, m.menu), size + ': the message box sits below the machine and the menu');
    assert.equal(m.banner.r - m.banner.l, 40 * m.k, size + ': the banner is its 40px mini sprite at 1x');
    assert.ok(inside(m.banner, m.window) && !overlap(m.banner, m.pile), size + ': the banner stays on the plate, off the egg pile');
    assert.ok(inside(m.words, m.window) && !overlap(m.words, m.banner), size + ': "UP!" stays on the plate, beside the banner');
  }
  assert.deepEqual(errors, []);
});

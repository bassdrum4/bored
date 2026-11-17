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
    machine: at(56, 6, 268, 272), next: at(524, 6, 736, 272), pile: at(68, 26, 256, 68), window: at(114, 90, 210, 120),
    words: at(172, 98, 196, 114),
    // The arrows' own columns, and the backdrop just above the tab bar (no dark band).
    arrowLeft: at(32, 124, 48, 156), arrowRight: at(500, 124, 516, 156),
    skyAboveTabs: (() => { const c = document.querySelector('#sky'), g = c.getContext('2d'); const p = g.getImageData(4, Math.max(0, VIEW.y - 2), 1, 1).data; return [p[0], p[1], p[2]]; })()
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
  // The biggest quarter step that fits (whole numbers when they fit exactly).
  const expected = { '360x640': 0.5625, '640x384': 1, '1000x630': 1.5, '1900x790': 2, '1900x1150': 2.75, '1366x768': 2, '1440x900': 2.25, '1920x1080': 2.75, '2560x1440': 3.75 };
  for (const [size, scale] of Object.entries(expected)) {
    const [width, height] = size.split('x').map(Number);
    await page.setViewport({ width, height });
    await pause(150);
    const m = await game.evaluate(measure);
    assert.equal(m.k, scale, size + ': the biggest quarter-step scale that fits (or a shrink below 640px)');
    assert.ok(m.scrollWidth <= m.width, size + ': no horizontal scroll');
    assert.ok(inside(m.wrap, { l: 0, t: 0, r: m.width, b: m.height }), size + ': the frame is fully in view');
    assert.ok(Math.abs((m.wrap.l + m.wrap.r) / 2 - m.width / 2) <= m.k, size + ': centered across');
    assert.ok(Math.abs((m.wrap.t + m.wrap.b) / 2 - m.height / 2) <= m.k, size + ': centered down');
    assert.ok(m.sky.l <= 0 && m.sky.t <= 0 && m.sky.r >= m.width && m.sky.b >= m.height, size + ': the scene fills the window');
    assert.ok(!overlap(m.menu, m.machine) && !overlap(m.counts, m.machine), size + ': the menu column clears the machine');
    assert.ok(!overlap(m.menu, m.next) && !overlap(m.counts, m.next), size + ': the menu column clears the next machine');
    assert.ok(m.msg.t >= m.machine.b && !overlap(m.msg, m.menu), size + ': the message box sits below the machine and the menu');
    assert.ok(Math.abs((m.banner.r - m.banner.l) - 40 * m.k) < 0.5, size + ': the banner is its 40px mini sprite at 1x');
    const gap = (a, b) => Math.max(b.l - a.r, a.l - b.r);
    assert.ok(gap(m.arrowLeft, m.machine) >= 8 * m.k - 0.5 && gap(m.arrowRight, m.menu) >= 8 * m.k - 0.5 && gap(m.arrowRight, m.next) >= 8 * m.k - 0.5,
      size + ': the arrows have 8px of their own space from the machines and the menu');
    assert.ok(m.machine.b <= m.msg.t, size + ': the machine, base included, ends above the message box');
    assert.notDeepEqual(m.skyAboveTabs, [0x1c, 0x1b, 0x2c], size + ': the backdrop above the tabs is the scene, not a dark ink band');
    assert.ok(inside(m.banner, m.window) && !overlap(m.banner, m.pile), size + ': the banner stays on the plate, off the egg pile');
    assert.ok(inside(m.words, m.window) && !overlap(m.words, m.banner), size + ': "UP!" stays on the plate, beside the banner');
  }
  assert.deepEqual(errors, []);
});

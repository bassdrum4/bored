// Rebuild first, then: CHROME_PATH=/path/to/chrome node scripts/capture-previews.mjs
// Captures real offline gameplay. Run in a fresh profile; no account or network needed.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, '_build/game-previews');
await fs.mkdir(shots, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  async function freshPage(height = 600) {
    const page = await browser.newPage();
    page.setDefaultTimeout(4000);
    await page.setViewport({ width: 768, height, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());
    await page.evaluateOnNewDocument(() => {
      let seed = 4981;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.addStyleTag({ content: '#player-menu,#hint,#challenge-progress{display:none!important}' });
    return page;
  }
  const catalog = await freshPage();
  const requested = new Set(process.argv.slice(2));
  const games = await catalog.evaluate(() => ORDER.filter(([slug]) => !EXTERNS[slug]));
  await catalog.close();
  const starts = {
    deep: '#btnDaily', sumo: '#opt-cpu', 'aim-lab': '#actions button',
    'void-runner': '#screen-overlay', simon: '#btnStart', snake: '#start',
    tank: '#m1', '8ball': '#btnCpu', tetris: '#start-btn'
  };
  const buttons = { pong: '1 PLAYER', 'gun-mayhem': '1 PLAYER vs CPU' };
  const keys = { commanders: 'Space', qbert: 'Space', frogger: 'Space', 'pac-man': 'Space',
    'space-invaders': 'Space', asteroids: 'Space', breakout: 'Space', tank2: 'Digit1' };
  for (const [slug] of games) {
    if (requested.size && !requested.has(slug)) continue;
    console.log('Capturing ' + slug);
    const page = await freshPage(['2048', 'memory', 'connect-four', 'wordle'].includes(slug) ? 900 : 600);
    await page.evaluate(id => openGame(id), slug);
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.body?.childElementCount > 0);
    const frame = await (await page.$('#frame')).contentFrame();
    await new Promise(resolve => setTimeout(resolve, 150));
    if (starts[slug] && await frame.$(starts[slug])) {
      try { await frame.click(starts[slug]); } catch {}
    }
    if (buttons[slug]) await frame.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label)?.click(), buttons[slug]);
    async function press(code) {
      const key = code === 'Space' ? ' ' : code.startsWith('Digit') ? code.slice(5) : code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
      await frame.evaluate(({ code, key }) => document.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true })), { code, key });
      await new Promise(resolve => setTimeout(resolve, 80));
      await frame.evaluate(({ code, key }) => document.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true })), { code, key });
    }
    if (keys[slug]) await press(keys[slug]);
    if (slug === 'snake') await press('ArrowRight');
    if (slug === '2048') for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown']) await press(key);
    if (slug === 'wordle') for (const code of ['KeyC', 'KeyR', 'KeyA', 'KeyN', 'KeyE', 'Enter']) await press(code);
    if (slug === 'minesweeper') await frame.click('#board .cell');
    if (slug === 'tetris') for (const code of ['ArrowLeft', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Space', 'ArrowUp', 'Space', 'ArrowLeft', 'Space']) await press(code);
    if (slug === 'memory') await frame.click('.memory-card');
    if (slug === 'connect-four') {
      for (const key of ['1', '3', '2']) { await press(key); await new Promise(resolve => setTimeout(resolve, 400)); }
    }
    if (slug === 'sand') {
      const canvas = await frame.$('canvas');
      const box = await canvas?.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width * .4, box.y + box.height * .25);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * .6, box.y + box.height * .3, { steps: 35 });
        await page.mouse.up();
      }
    }
    await new Promise(resolve => setTimeout(resolve, ['memory', 'connect-four'].includes(slug) ? 60 : 1200));
    const candidates = await frame.$$('canvas, #board');
    let target = null, area = 0;
    for (const node of candidates) {
      const box = await node.boundingBox();
      if (box && box.width * box.height > area) { area = box.width * box.height; target = node; }
    }
    const file = path.join(shots, slug + '.png');
    const box = await target?.boundingBox();
    // Do not use ElementHandle.screenshot here: scrolling a canvas inside a
    // fixed iframe can make Chrome capture the underlying hub instead.
    const height = page.viewport().height;
    const x = Math.max(0, box?.x || 0), y = Math.max(0, box?.y || 0);
    await page.screenshot({ path: file, captureBeyondViewport: false, clip: {
      x, y, width: Math.min(box?.width || 768, 768 - x), height: Math.min(box?.height || height, height - y)
    } });
    console.log(slug + ': ' + (await frame.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width).slice(0, 6).map(b => b.id + '=' + b.textContent.trim().slice(0, 25)).join(', '))));
    await page.close();
  }
} finally { await browser.close(); }

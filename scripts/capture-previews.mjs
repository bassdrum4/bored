// CHROME_PATH=/path/to/chrome node scripts/capture-previews.mjs
// Captures real offline gameplay. Run in a fresh profile; no account or network
// needed. The hub is served over loopback from src/, the same tree the site
// deploys, because the page is modules and cannot run from file://.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { serve } from '../tests/serve.cjs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, '_build/game-previews');
await fs.mkdir(shots, { recursive: true });
const site = await serve(path.join(root, 'src'));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  async function freshPage(height = 600) {
    const page = await browser.newPage();
    page.setDefaultTimeout(4000);
    await page.setViewport({ width: 768, height, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', request => /^https?:/.test(request.url()) && !request.url().startsWith(site.origin + '/') ? request.abort() : request.continue());
    await page.evaluateOnNewDocument(() => {
      let seed = 4981;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    });
    await page.goto(site.url);
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
    tank: '#m1', '8ball': '#btnCpu', tetris: '#start-btn',
    'brick-run': '#start', 'transit-chaos': '#start', ashcrown: '#btn-begin',
    trackbound: '#btnDaily', chess: '#new', mahjong: '#deal',
    'basket-random': '#start'
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
    // Ashcrown turns its tutorial on until one is finished, and the card wants
    // the board, not a twelve-step overlay on top of it. One human against CPUs
    // also skips the handoff screen, which is for passing a device around.
    if (slug === 'ashcrown') await frame.evaluate(() => {
      const tutorial = document.querySelector('#opt-tutorial');
      if (tutorial) tutorial.checked = false;
      const humans = document.querySelector('#opt-humans');
      const cpus = document.querySelector('#opt-cpus');
      if (humans && cpus) {
        humans.value = '1';
        humans.dispatchEvent(new Event('change'));
        cpus.value = '3';
        cpus.dispatchEvent(new Event('change'));
      }
    });
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
    if (slug === 'ashcrown') {
      // Give the CPUs a couple of turns so the card is not one settler on an
      // empty map. Ending a turn with units still idle asks for confirmation,
      // and the closing tip sits over the corner, so both are cleared before
      // the shot.
      for (let turn = 0; turn < 3; turn++) {
        await press('Space');
        await frame.evaluate(() => document.querySelector('[data-act="end-confirm"]')?.click());
        await new Promise(resolve => setTimeout(resolve, 900));
      }
      await frame.evaluate(() => {
        document.querySelector('#modal [data-act="close"]')?.click();
        for (const id of ['#coach', '#toast']) {
          const bubble = document.querySelector(id);
          if (bubble) bubble.hidden = true;
        }
      });
    }
    if (slug === 'snake') await press('ArrowRight');
    if (slug === 'minigolf') await frame.evaluate(() => { holeIndex = 4; loadHole(); });
    if (slug === '2048') for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown']) await press(key);
    if (slug === 'wordle') for (const code of ['KeyC', 'KeyR', 'KeyA', 'KeyN', 'KeyE', 'Enter']) await press(code);
    if (slug === 'minesweeper') await frame.click('#board .cell');
    if (slug === 'tetris') for (const code of ['ArrowLeft', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Space', 'ArrowUp', 'Space', 'ArrowLeft', 'Space']) await press(code);
    if (slug === 'memory') await frame.click('.memory-card');
    if (slug === 'connect-four') {
      for (const key of ['1', '3', '2']) { await press(key); await new Promise(resolve => setTimeout(resolve, 400)); }
    }
    if (slug === 'typing-test') for (const code of ['KeyT', 'KeyH', 'KeyE', 'Space', 'KeyQ', 'KeyU', 'KeyI', 'KeyC', 'KeyK']) await press(code);
    if (slug === 'circuit') for (const code of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp']) await press(code);
    if (slug === 'scrabble') {
      // The board sits behind the player-choice overlay, so put a plausible
      // mid-game position on it instead of capturing the empty board.
      await frame.evaluate(() => window.__test.load({
        mode: 'computer', turn: 0, bag: [], scores: [42, 31],
        board: { 82: 's', 83: 'p', 84: 'a', 85: 'r', 86: 'e',
          98: 'g', 113: 'a', 128: 'm', 143: 'e',
          112: 'c', 114: 't', 157: 'r', 158: 'a', 159: 'i', 160: 'n' },
        racks: [['s', 'e', 'r', 'o', 'd', 'l', 'n'], ['a', 'b', 'c', 'd', 'e', 'f', 'g']]
      }));
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (slug === 'basket-random') {
      // The wrapper frames a vendored Construct build. Its cover lifts when the
      // build loads, then the build shows its own PLAY screen inside a nested
      // frame, so click that and let a possession start before shooting the court.
      await frame.waitForFunction(() => document.querySelector('#cover').hidden === true, { timeout: 60000 });
      // The engine ignores a click that lands while it is still booting, so give
      // it a moment before the PLAY press and press again if it missed.
      await new Promise(resolve => setTimeout(resolve, 2000));
      const court = page.frames().find(candidate => candidate.url().includes('/basket-random/index.html'));
      const canvas = await court?.$('canvas');
      const box = await canvas?.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        // The house splash rolls into a one-player / two-player choice on its
        // own, and the menu wants a press on its arrow, not on the court.
        await new Promise(resolve => setTimeout(resolve, 5000));
        await page.mouse.move(box.x + box.width * .25, box.y + box.height * .60);
        await new Promise(resolve => setTimeout(resolve, 150));
        await page.mouse.click(box.x + box.width * .25, box.y + box.height * .60);
        await new Promise(resolve => setTimeout(resolve, 1800));
        await page.mouse.click(box.x + box.width * .25, box.y + box.height * .68);
        await new Promise(resolve => setTimeout(resolve, 2200));
      }
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
    // Basket Random draws inside a nested frame, so there is no canvas to find
    // here: shoot the wrapper's stage, which holds the framed court.
    let target = slug === 'basket-random' ? await frame.$('#stage') : null;
    let area = 0;
    if (!target) for (const node of candidates) {
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
} finally { await browser.close(); await site.close(); }

// Poké Gacha's page (src/games/content/poke-gacha.html): its structure, and a
// run through every screen in Chrome via the hub. The engines have their own
// suites (tests/gacha.test.cjs, tests/td.test.cjs); this file is the page's,
// so game-only changes to Poké Gacha can carry their tests with them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');
const { respondToAnalytics } = require('./telemetry-isolation.cjs');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'src/games/content/poke-gacha.html'), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('every tab has a screen section and a screen entry', () => {
  const tabs = [...page.match(/const TABS = \[([^\n]*)\];/)[1].matchAll(/\["([a-z]+)", "[^"]+"\]/g)].map(m => m[1]);
  assert.ok(tabs.length >= 5, 'the tab list is readable');
  const screens = page.match(/const SCREENS = \{([^\n]*)\};/)[1];
  for (const id of tabs) {
    assert.ok(page.includes(`<section id="scr-${id}"`), id + ' has a <section>');
    assert.match(screens, new RegExp('\\b' + id + ': \\['), id + ' has a SCREENS entry');
  }
});

test('the page writes its own snapshot, with the poke-gacha slug', () => {
  assert.match(page, /window\.__boredSnapshot = \(\) =>/);
  assert.match(page, /slug: "poke-gacha"/);
});

// Hand-drawn icons, when the page keeps them as PIXEL_MAPS, must have closed outlines:
// a filled pixel never touches transparency without the ink outline ('k') between.
const block = page.match(/\/\* PIXEL_MAPS:BEGIN[^\n]*\n\s*const PIXEL_MAPS = ([\s\S]*?);\n\/\* PIXEL_MAPS:END \*\//);
test('pixel maps, if any, are rectangular and fully outlined', { skip: !block && 'the page has no PIXEL_MAPS block' }, () => {
  for (const [key, rows] of Object.entries(JSON.parse(block[1]))) {
    const width = rows[0].length;
    for (const row of rows) assert.equal(row.length, width, key + ': every row has the same width');
    const at = (x, y) => (y < 0 || y >= rows.length || x < 0 || x >= width) ? '.' : rows[y][x];
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === 'k') return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        assert.notEqual(at(x + dx, y + dy), '.', `${key}: '${ch}' at ${x},${y} touches transparency`);
    }));
  }
});

test('Poké Gacha opens through the hub, and every screen draws without an error', async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(path.join(root, 'src'));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [] });
  t.after(async () => { await browser.close(); await site.close(); });
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  await tab.setRequestInterception(true);
  tab.on('request', request => {
    if (respondToAnalytics(request)) return;
    if (request.url().startsWith(site.origin)) request.continue(); else request.abort();
  });
  await tab.setViewport({ width: 1280, height: 800 });
  await tab.goto(site.url);
  await tab.waitForFunction(() => typeof openGame === 'function');

  // The hub's bridge: the gacha, and the tower defense engine beside it.
  const bridge = await tab.evaluate(() => ({ gacha: typeof window.__boredGacha?.pull, td: window.__boredGacha?.td?.stages?.length || 0 }));
  assert.equal(bridge.gacha, 'function');
  assert.equal(bridge.td, 8, 'the hub exposes chapter 1 of tower defense');

  await tab.evaluate(() => openGame('poke-gacha'));
  await tab.waitForFunction(() => document.querySelector('#frame')?.contentDocument?.querySelector('#tabs .panel'));
  const game = await (await tab.$('#frame')).contentFrame();
  const ids = await game.evaluate(() => TABS.map(([id]) => id));
  for (const id of ids) {
    await game.evaluate(screen => go(screen), id);
    await pause(100);
    const shown = await game.evaluate(screen => !document.querySelector('#scr-' + screen).hidden, id);
    assert.ok(shown, id + ' is shown when picked');
  }
  assert.equal((await game.evaluate(() => __boredSnapshot())).slug, 'poke-gacha');
  assert.deepEqual(errors, []);
});

/* ── Tower defense screens (Story, Squad, Battle, Quests) ─────────────────
   Driven through the hub with a seeded wallet: vouchers, pulls, waves and a
   hatch, so the player owns mons. Needs the hub's engine (__boredGacha.td). */
async function openWithMons(t) {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(path.join(root, 'src'));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [] });
  t.after(async () => { await browser.close(); await site.close(); });
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  await tab.setRequestInterception(true);
  tab.on('request', request => {
    if (respondToAnalytics(request)) return;
    if (request.url().startsWith(site.origin)) request.continue(); else request.abort();
  });
  await tab.setViewport({ width: 1280, height: 800 });
  await tab.goto(site.url);
  await tab.waitForFunction(() => typeof openGame === 'function');
  await tab.evaluate(() => openGame('poke-gacha'));
  await tab.waitForFunction(() => document.querySelector('#frame')?.contentDocument?.querySelector('#tabs .panel'));
  const game = await (await tab.$('#frame')).contentFrame();
  // The page has activated the wallet; fund it, pull 45 eggs, earn waves after the pulls, hatch them all.
  await game.evaluate(() => {
    const now = Math.floor(Date.now() / 1000);
    const put = (id, entry) => { const w = JSON.parse(parent.localStorage.getItem('bored.wallet')); w.entries[id] = entry; parent.localStorage.setItem('bored.wallet', JSON.stringify(w)); };
    put('test:grant', { at: now - 100, g: { gold: 1, premium: 2, coins: 900 } });
    G.pull({ voucher: 'gold', count: 1, machine: 'move' });
    G.pull({ voucher: 'premium', count: 1, machine: 'move' });
    G.pull({ voucher: 'premium', count: 1, machine: 'legend' });
    put('test:waves', { at: now + 5, g: { waves: 100 } });
    G.hatch();
    refreshTop();
  });
  return { tab, game, errors };
}
const key = async (tab, name, times = 1) => { for (let i = 0; i < times; i++) { await tab.keyboard.press(name); await pause(30); } };
const rect = (frame, selector) => frame.$eval(selector, node => { const b = node.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; });
const apart = (a, b) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;

test('tower defense: Story lists chapter 1, Squad lists every owned mon, and a 1-1 clear pays and unlocks 1-2', async t => {
  const { tab, game, errors } = await openWithMons(t);
  const tabs = await game.$$eval('#tabs [data-tab]', nodes => nodes.map(n => n.dataset.tab));
  assert.deepEqual(tabs, ['story', 'pull', 'eggs', 'dex', 'shop', 'quests'], 'Story is the first of six tabs');
  // The tab bar and the purse fit on one line inside the frame.
  const bar = await rect(game, '#tabs'), purse = await rect(game, '#tabs .purse'), last = await rect(game, '#tabs [data-tab="quests"]');
  assert.ok(purse.r <= bar.r + 0.5 && last.r <= purse.l, 'six tabs and the purse fit');

  await key(tab, '1');
  assert.equal(await game.evaluate(() => tab), 'story');
  const stages = await game.$$eval('#story-list > div', rows => rows.map(r => r.textContent));
  assert.equal(stages.length, 8);
  assert.match(stages[0], /^1-1 /);
  assert.match(stages[1], /locked/, '1-2 starts locked');

  // Enter opens the squad: every owned mon is listed, not just the first 8.
  await key(tab, 'Enter');
  const owned = await game.evaluate(() => S.owned.length);
  assert.ok(owned > 8, 'the seeded wallet owns more than 8 mons');
  assert.equal(await game.$$eval('#squad-list > div', rows => rows.length), owned + 1, 'a Start row and one row per owned mon');
  // Pick eight with the keyboard: down, Enter, eight times.
  for (let i = 0; i < 8; i++) await key(tab, 'ArrowDown'), await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => squadPick().length), 8);
  await key(tab, 'ArrowDown'); await key(tab, 'Enter');
  assert.match(await game.$eval('#msg', n => n.textContent), /holds 8/, 'a ninth pick is refused');

  // Start: the battle opens on its dialogue, tabs locked, the message box hidden.
  await game.evaluate(() => { squadAt = 0; squadUpdate(); });
  await key(tab, 'Enter');
  await game.waitForFunction(() => battle && !document.querySelector('#scr-battle').hidden);
  assert.ok(await game.$eval('#tabs', n => n.classList.contains('locked')));
  assert.equal(await game.$eval('#battle-talk', n => n.hidden), false);
  await key(tab, '2');
  assert.equal(await game.evaluate(() => tab), 'story', 'number keys do not leave a battle');
  // Through the dialogue, then the battle runs.
  for (let i = 0; i < 4 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => battle.paused), false);
  await key(tab, ' ');
  assert.equal(await game.evaluate(() => battle.paused), true, 'Space pauses');
  assert.match(await game.$eval('#battle-hud', n => n.textContent), /Paused/);
  await key(tab, ' ');

  // The battle screen: HUD on one line, and field, HUD and deploy cards never overlap.
  const hud = await game.$eval('#battle-hud', n => [n.scrollHeight, n.clientHeight]);
  assert.ok(hud[0] <= hud[1], 'the HUD is one line');
  const field = await rect(game, '#field'), hudBox = await rect(game, '#battle-hud'), deck = await rect(game, '#deploy');
  assert.ok(apart(field, hudBox) && apart(field, deck) && apart(hudBox, deck), 'HUD, field and deploy cards do not overlap');

  // Deploy the squad where each class may stand, then let the engine play the stage out.
  await game.evaluate(() => {
    const b = battle.b; b.energy = 60;
    b.squad.forEach((u, i) => { for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) if (!b.units.some(o => o.slot === i)) T.deploy(b, i, x, y); });
    for (let i = 0; i < 20000 && !b.over; i++) T.step(b);
  });
  await game.waitForFunction(() => battle.done, { timeout: 5000 });
  assert.equal(await game.evaluate(() => battle.b.over), 'win');
  for (let i = 0; i < 4 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  assert.equal(await game.$eval('#battle-result', n => n.hidden), false);
  assert.match(await game.$eval('#battle-result', n => n.textContent), /CLEARED/);
  assert.match(await game.$eval('#battle-result', n => n.textContent), /Regular voucher/, 'rewards name the voucher');
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => battle), null);
  assert.equal(await game.evaluate(() => tab), 'story');
  assert.ok(await game.evaluate(() => T.state().best['1-1'] > 0), 'the clear is recorded');
  assert.doesNotMatch((await game.$$eval('#story-list > div', rows => rows.map(r => r.textContent)))[1], /locked/, '1-2 unlocks');

  // Quests: 4 daily and 5 weekly battle missions above the starters; the clear ticked "Clear any stage".
  await key(tab, '6');
  const quests = await game.evaluate(() => questItems().map(q => ({ label: q.label, done: !!q.done, off: !!q.off })));
  if (quests.some(q => /daily missions/.test(q.label))) {
    assert.ok(quests.find(q => q.label === 'Clear any stage')?.done ?? true, 'a clear ticks "Clear any stage" when it is drawn today');
    assert.ok(quests.find(q => q.label === 'All 5 weekly missions').off, 'the weekly Gold is locked while the Poké Idle boss mission is');
    assert.ok(quests.find(q => q.label === 'Clear stage 1-1').done, 'the 1-1 starter mission is done');
  }
  assert.deepEqual(errors, []);
});

test('tower defense: Left and Right switch chapters, and chapter 2 says which enemies fly', async t => {
  const { tab, game, errors } = await openWithMons(t);
  if (!await game.evaluate(() => Array.isArray(T.chapters) && T.chapters.length > 1)) return t.skip('the hub engine has one chapter');
  // A recorded 1-8 clear opens chapter 2.
  await game.evaluate(() => {
    const w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    w.entries['td:run:test-1-8'] = { at: Math.floor(Date.now() / 1000), x: { st: '1-8', s: 3, tm: [], d: T.state().monday } };
    parent.localStorage.setItem('bored.wallet', JSON.stringify(w));
    refreshTop();
  });
  await key(tab, '1');
  assert.match(await game.$eval('#story-title', n => n.textContent), /CHAPTER\s*1\/[2-9]/);
  await key(tab, 'ArrowRight');
  assert.match(await game.$eval('#story-title', n => n.textContent), /CHAPTER\s*2\/[2-9]/);
  const rows = await game.$$eval('#story-list > div', list => list.map(r => r.textContent));
  assert.equal(rows.length, 6);
  assert.match(rows[0], /^2-1 /);
  assert.doesNotMatch(rows[0], /locked/, '2-1 is open after 1-8');
  assert.match(rows[1], /locked/);
  assert.match(await game.$eval('#story-info', n => n.textContent), /Flying: .*Snipers only/);
  await key(tab, 'ArrowDown', 5);
  assert.match(await game.$eval('#story-info', n => n.textContent), /ADMIN/, '2-6 is the admin stage');
  await key(tab, 'ArrowLeft');
  assert.match(await game.$eval('#story-title', n => n.textContent), /CHAPTER\s*1\/[2-9]/);
  assert.deepEqual(errors, []);
});

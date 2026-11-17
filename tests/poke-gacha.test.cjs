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
  await passStarter(game);
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

// A new wallet opens on the starter pick when the hub offers one: take the
// first starter and clear the squad it fills, so a test starts from its own picks.
const passStarter = game => game.evaluate(() => {
  if (typeof picking === 'undefined' || !picking) return false;
  starterEnter(); starterEnter();
  pref.squad = []; keep();
  return true;
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
  await passStarter(game);
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
  assert.equal(await game.$$eval('#squad-grid > .card', cells => cells.length), owned, 'one roster card per owned mon');
  // Pick eight with the keyboard: Enter, then right, eight times.
  for (let i = 0; i < 8; i++) await key(tab, 'Enter'), await key(tab, 'ArrowRight');
  assert.equal(await game.evaluate(() => squadPick().length), 8);
  assert.equal(await game.$$eval('#squad-slots > .card:not(.empty)', cells => cells.length), 8, 'all eight slots are filled');
  await key(tab, 'Enter');
  assert.match(await game.$eval('#squad-detail', n => n.textContent), /holds 8/, 'a ninth pick is refused');

  // Start (top right): the battle opens on its dialogue, tabs locked, the message box hidden.
  await game.evaluate(() => { sq.zone = 'head'; sq.head = 3; squadUpdate(); });
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
  assert.match(await game.$eval('#story-info', n => n.textContent), /Flying: Zubat/);
  assert.match(await game.$eval('#msg', n => n.textContent), /Only snipers hit flyers/);
  await key(tab, 'ArrowDown', 5);
  assert.match(await game.$eval('#story-info', n => n.textContent), /ADMIN/, '2-6 is the admin stage');
  await key(tab, 'ArrowLeft');
  assert.match(await game.$eval('#story-title', n => n.textContent), /CHAPTER\s*1\/[2-9]/);
  assert.deepEqual(errors, []);
});

test('tower defense: chapter 3 says which enemies explode', async t => {
  const { tab, game, errors } = await openWithMons(t);
  if (!await game.evaluate(() => Array.isArray(T.chapters) && T.chapters.length > 2)) return t.skip('the hub engine has fewer than 3 chapters');
  // Recorded clears of 1-8 and 2-6 open chapter 3.
  await game.evaluate(() => {
    const w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    for (const st of ['1-8', '2-6']) w.entries['td:run:test-' + st] = { at: Math.floor(Date.now() / 1000), x: { st, s: 3, tm: [], d: T.state().monday } };
    parent.localStorage.setItem('bored.wallet', JSON.stringify(w));
    refreshTop();
  });
  await key(tab, '1');
  await key(tab, 'ArrowRight', 2);
  assert.match(await game.$eval('#story-title', n => n.textContent), /CHAPTER\s*3\//);
  const rows = await game.$$eval('#story-list > div', list => list.map(r => r.textContent));
  assert.equal(rows.length, 6);
  assert.doesNotMatch(rows[0], /locked/, '3-1 is open after 2-6');
  assert.match(await game.$eval('#story-info', n => n.textContent), /Explodes: Koffing/);
  assert.match(await game.$eval('#msg', n => n.textContent), /Kill exploders before the fuse/);
  const info = await game.$eval('#story-info', n => [n.scrollHeight, n.clientHeight]);
  assert.ok(info[0] <= info[1], 'the stage panel does not overflow');
  assert.deepEqual(errors, []);
});

test('Dex: F filters what is shown, T a type, S the order, and the choice is kept', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await game.evaluate(() => { pref.dexFilter = 'All'; pref.dexType = ''; pref.dexSort = 'Number'; keep(); go('dex'); });
  const rowsNow = () => game.$$eval('#dex-rows > div', list => list.map(r => r.textContent.trim()));
  const all = await game.evaluate(() => dexList().length);
  assert.equal(all, await game.evaluate(() => BASES.length), 'All shows every line');
  await key(tab, 'f');
  assert.deepEqual(await game.evaluate(() => dexList().every(num => !!S.lines[num])), true, 'Owned shows only owned lines');
  assert.equal(await game.evaluate(() => dexList().length), await game.evaluate(() => Object.keys(S.lines).length));
  assert.match(await game.$eval('#msg', n => n.textContent), /F: Owned/);
  const msg = await game.$eval('#msg', n => [n.scrollHeight, n.clientHeight]);
  assert.ok(msg[0] <= msg[1], 'the message box does not overflow');
  await key(tab, 'f');
  assert.ok(await game.evaluate(() => dexList().every(num => !S.lines[num])), 'Not owned shows only missing lines');
  // A type: every line shown has it.
  await key(tab, 't');
  const type = await game.evaluate(() => dexView().type);
  assert.ok(type);
  assert.ok(await game.evaluate(t => dexList().every(num => G.dex[num - 1][1].split('/').includes(t)), type), 'every line shown is ' + type);
  // Back to all, any type; sort by name.
  await game.evaluate(() => { pref.dexFilter = 'All'; pref.dexType = ''; keep(); dexUpdate(); });
  await key(tab, 's');
  const names = await game.evaluate(() => dexList().map(name));
  assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)), 'S sorts by name');
  assert.equal(await game.evaluate(() => JSON.parse(localStorage.getItem('bored.poke-gacha.ui')).dexSort), 'Name', 'the choice is kept');
  assert.ok((await rowsNow()).length > 0);
  await game.evaluate(() => { pref.dexSort = 'Number'; keep(); });
  assert.deepEqual(errors, []);
});

test('tower defense: chapter 4 says which enemies are armored', async t => {
  const { tab, game, errors } = await openWithMons(t);
  if (!await game.evaluate(() => Array.isArray(T.chapters) && T.chapters.length > 3)) return t.skip('the hub engine has fewer than 4 chapters');
  await game.evaluate(() => {
    const w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    for (const st of ['1-8', '2-6', '3-6']) w.entries['td:run:test-' + st] = { at: Math.floor(Date.now() / 1000), x: { st, s: 3, tm: [], d: T.state().monday } };
    parent.localStorage.setItem('bored.wallet', JSON.stringify(w));
    refreshTop();
  });
  await key(tab, '1');
  await key(tab, 'ArrowRight', 3);
  assert.match(await game.$eval('#story-title', n => n.textContent), /CHAPTER\s*4\//);
  assert.doesNotMatch((await game.$$eval('#story-list > div', list => list.map(r => r.textContent)))[0], /locked/, '4-1 is open after 3-6');
  assert.match(await game.$eval('#story-info', n => n.textContent), /Armored: /);
  assert.match(await game.$eval('#msg', n => n.textContent), /Casters go through armor/);
  const info = await game.$eval('#story-info', n => [n.scrollHeight, n.clientHeight]);
  assert.ok(info[0] <= info[1], 'the stage panel does not overflow');
  assert.deepEqual(errors, []);
});

/* ── A brand new account, end to end ──────────────────────────────────────
   Open Poké Gacha with an empty wallet: the starter pick comes first, the
   four mons clear 1-1, and the first egg pulled hatches at once. Needs the
   hub's starter API (__boredGacha.pickStarter). */
test('a new account picks a starter, clears 1-1 with the gifts, pulls and hatches at once', async t => {
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
  const hub = await tab.evaluate(() => typeof window.__boredGacha?.pickStarter === 'function' && !!window.__boredGacha?.td);
  if (!hub) return t.skip('the hub has no starter pick yet');
  assert.equal(await tab.evaluate(() => localStorage.getItem('bored.wallet')), null, 'a brand new browser, no wallet');
  await tab.evaluate(() => openGame('poke-gacha'));
  await tab.waitForFunction(() => document.querySelector('#frame')?.contentDocument?.querySelector('#tabs .panel'));
  const game = await (await tab.$('#frame')).contentFrame();

  // 1. The pick screen is all there is: no mons, tabs locked, number keys stay put.
  await game.waitForFunction(() => !document.querySelector('#scr-starter').hidden);
  assert.deepEqual(await game.evaluate(() => S.owned), []);
  assert.ok(await game.$eval('#tabs', n => n.classList.contains('locked')));
  assert.equal(await game.$$eval('#starter-rows > div', rows => rows.length), 27, 'one first-stage starter from each of gens 1-9');
  await key(tab, '3');
  assert.equal(await game.evaluate(() => !!picking), true, 'number keys do not skip the pick');
  // The starter screen fits its panels: every row whole, nothing spills.
  const list = await rect(game, '#starter-list'), detail = await rect(game, '#starter-detail'), msg = await rect(game, '#msg');
  assert.ok(apart(list, detail) && apart(list, msg) && apart(detail, msg), 'list, detail and message do not overlap');
  const spill = await game.evaluate(() => [...document.querySelectorAll('#starter-detail, #starter-gifts, #starter-info')].filter(n => n.scrollHeight > n.clientHeight + 1).map(n => n.id));
  assert.deepEqual(spill, []);

  // Charmander, the second row: Enter asks, Backspace cancels, Enter twice takes it.
  await key(tab, 'ArrowDown');
  await key(tab, 'Enter');
  assert.match(await game.$eval('#msg', n => n.textContent), /Take Charmander for good\?/);
  await key(tab, 'Backspace');
  assert.equal(await game.evaluate(() => picking.sure), false);
  await key(tab, 'Enter'); await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => picking), null);
  const owned = await game.evaluate(() => S.owned.map(name));
  assert.deepEqual(owned.slice().sort(), ['Audino', 'Charmander', 'Geodude', 'Pidgey'], 'the starter and its three gifts');
  assert.equal(await game.evaluate(() => tab), 'story');
  assert.equal(await game.$eval('#tabs', n => n.classList.contains('locked')), false);
  assert.match(await game.$eval('#msg', n => n.textContent), /Charmander joins you/);
  // It never pays twice: a second pick is refused, and a reload goes straight past the screen.
  assert.equal(await game.evaluate(() => G.pickStarter({ species: G.starters[2] }).reason), 'picked');

  // 2. Play 1-1 with the four, deployed in the squad's order on the first free tile for each.
  await key(tab, 'Enter');
  assert.deepEqual(await game.evaluate(() => squadPick().map(name)), ['Geodude', 'Pidgey', 'Audino', 'Charmander']);
  await game.evaluate(() => { sq.zone = 'head'; sq.head = 3; squadUpdate(); });
  await key(tab, 'Enter');
  await game.waitForFunction(() => battle && !document.querySelector('#scr-battle').hidden);
  for (let i = 0; i < 6 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  await game.evaluate(() => {
    const b = battle.b, stage = b.stage || T.stages[0];
    const high = [], ground = T.pathsOf(stage)[0].slice().reverse().filter(([x, y]) => stage.map[y][x] === '.');
    stage.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'H') high.push([x, y]); }));
    const plan = b.squad.map((u, slot) => [slot, ...(u.ground ? ground.shift() : high.shift())]);
    for (let i = 0; i < 20000 && !b.over; i++) {
      for (const [slot, x, y] of plan) if (!b.units.some(o => o.slot === slot) && T.deploy(b, slot, x, y) === 'energy') break;
      T.step(b);
    }
  });
  await game.waitForFunction(() => battle.done, { timeout: 5000 });
  assert.equal(await game.evaluate(() => battle.b.over), 'win', 'the starter squad clears 1-1');
  for (let i = 0; i < 6 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => battle), null);
  assert.ok(await game.evaluate(() => T.state().best['1-1'] > 0), 'the clear is recorded');

  // 3. Pull one egg on the Pull screen, with a Regular from the login or the clear.
  await key(tab, '2');
  assert.equal(await game.evaluate(() => tab), 'pull');
  assert.ok(await game.evaluate(() => S.balance.regular >= 1), 'a new player has a Regular to pull with');
  await game.evaluate(() => { menuOpen = true; cursor = 0; updateScene(); });
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => S.pulls), 1);

  // 4. The egg needs no waves: it hatches straight away on the Eggs screen.
  await key(tab, '3');
  const egg = await game.evaluate(() => S.eggs[0]);
  assert.deepEqual([egg.need, egg.ready, egg.free], [0, true, true]);
  assert.match(await game.$eval('#msg', n => n.textContent), /hatches right away/);
  await key(tab, 'Enter');
  assert.ok(await game.evaluate(() => !!hatching));
  for (let i = 0; i < 6 && await game.evaluate(() => !!hatching); i++) { await pause(200); await key(tab, 'Enter'); }
  assert.equal(await game.evaluate(() => hatching), null);
  assert.equal(await game.evaluate(() => S.eggs.length), 0, 'the egg hatched');
  assert.equal(await game.evaluate(() => S.hatched.length), 1);

  // A reload goes straight to the game: the pick is kept on the account.
  await tab.evaluate(() => openGame('poke-gacha'));
  await pause(500);
  const again = await (await tab.$('#frame')).contentFrame();
  await again.waitForFunction(() => typeof S !== 'undefined' && S);
  assert.equal(await again.evaluate(() => !!picking), false, 'no second pick');
  assert.deepEqual(errors, []);
});

/* ── The weekly challenge: a page after the last chapter ───────────────── */
test('weekly challenge: risks stack, the run uses them, and a win scores the risk total', async t => {
  const { tab, game, errors } = await openWithMons(t);
  if (!await game.evaluate(() => typeof hasWeekly === 'function' && hasWeekly())) return t.skip('the hub has no weekly challenge yet');
  await key(tab, '1');
  // Left from chapter 1 wraps to the weekly page.
  await key(tab, 'ArrowLeft');
  assert.equal(await game.evaluate(() => onWeekly()), true);
  assert.match(await game.$eval('#story-title', n => n.textContent), /^WEEKLY/);
  const rowsShown = await game.$$eval('#story-list > div', rows => rows.map(r => r.textContent));
  assert.equal(rowsShown.length, await game.evaluate(() => T.risks.length + 1), 'a Start row and one row per risk');
  assert.match(rowsShown[0], /locked/, 'locked until 1-8 is cleared');
  await key(tab, 'Enter');
  assert.match(await game.$eval('#msg', n => n.textContent), /Clear 1-8 first/);
  // Clearing 1-1 is not enough: the chapter 1 boss opens it.
  await game.evaluate(() => { T.finish({ stage: '1-1', stars: 3, team: [S.owned[0]], waves: 2 }); storyUpdate(); });
  assert.match((await game.$$eval('#story-list > div', rows => rows.map(r => r.textContent)))[0], /locked/);

  // Clear 1-8, then stack two risks: harder HP (+1) and one life (+3).
  await game.evaluate(() => { T.finish({ stage: '1-8', stars: 1, team: [S.owned[0]], waves: 2 }); pref.risks = []; keep(); storyUpdate(); });
  const at = id => game.evaluate(i => T.risks.findIndex(r => r.id === i) + 1, id);
  for (const id of ['hp', 'onelife']) { await game.evaluate(i => { storyAt = i; storyUpdate(); }, await at(id)); await key(tab, 'Enter'); }
  assert.deepEqual(await game.evaluate(() => riskPick().sort()), ['hp', 'onelife']);
  assert.match(await game.$eval('#story-title', n => n.textContent), /risk 4/);
  assert.match(await game.$eval('#story-info', n => n.textContent), / 1 life(?!s)/, 'one life shows on the panel');
  // Toggle hp back off and on again.
  await game.evaluate(i => { storyAt = i; storyUpdate(); }, await at('hp'));
  await key(tab, 'Enter'); assert.deepEqual(await game.evaluate(() => riskPick()), ['onelife']);
  await key(tab, 'Enter'); assert.equal(await game.evaluate(() => T.riskOf(riskPick())), 4);
  const panel = await game.$eval('#story-info', n => [n.scrollHeight, n.clientHeight]);
  assert.ok(panel[0] <= panel[1], 'the weekly panel does not overflow');
  // The four risk milestones, none claimed yet this week (when the hub has them).
  const milestones = await game.evaluate(() => !!T.milestones);
  if (milestones) {
    const cells = await game.$$eval('#story-info .milestones > span', ns => ns.map(n => ({ text: n.textContent, dim: n.classList.contains('dim') })));
    assert.equal(cells.length, 4);
    assert.deepEqual(cells.map(c => c.text.match(/Risk (\d+)/)[1]), ['3', '7', '10', '12']);
    assert.ok(cells.every(c => c.dim), 'nothing claimed yet');
  }

  // Start: squad, then the battle carries the risks.
  await game.evaluate(() => { storyAt = 0; storyUpdate(); });
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => storyMode), 'squad');
  await game.evaluate(() => { setSquad(S.owned.slice(0, 8)); sq.zone = 'head'; sq.head = 3; squadUpdate(); });
  assert.match(await game.$eval('#squad-stage', n => n.textContent), /Risk 4/);
  await key(tab, 'Enter');
  await game.waitForFunction(() => battle && !document.querySelector('#scr-battle').hidden);
  assert.equal(await game.evaluate(() => battle.b.life), 1, 'one life');
  assert.match(await game.$eval('#battle-hud', n => n.textContent), /Weekly.*Risk 4/);
  for (let i = 0; i < 4 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  await game.evaluate(() => {
    const b = battle.b; b.energy = 99;
    b.squad.forEach((u, i) => { for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) if (!b.units.some(o => o.slot === i)) T.deploy(b, i, x, y); });
    // Win or lose, the run is recorded; give it the field's best shot.
    for (let i = 0; i < 20000 && !b.over; i++) { b.energy = 99; T.step(b); }
  });
  await game.waitForFunction(() => battle.done, { timeout: 5000 });
  const won = await game.evaluate(() => battle.b.over === 'win');
  for (let i = 0; i < 4 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  const result = await game.$eval('#battle-result', n => n.textContent);
  assert.match(result, /Risk 4/);
  assert.match(result, won ? /new best/ : /not scored/);
  const box = await game.$eval('#battle-result', n => [n.scrollHeight, n.clientHeight, [...n.children].map(c => c.textContent + ':' + c.getBoundingClientRect().height).join(' / ')]);
  assert.ok(box[0] <= box[1], 'the result box does not overflow: ' + box[2]);
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => onWeekly()), true, 'back on the weekly page');
  assert.equal(await game.evaluate(() => T.state().challengeBest), won ? 4 : 0);
  assert.equal((await game.evaluate(() => __boredSnapshot())).weeklyRisk, won ? 4 : 0, 'the snapshot carries the best risk for the board');
  if (milestones) {
    // A win at risk 4 pays the risk-3 milestone (a Plus) once; the page shows it claimed.
    const claimed = await game.evaluate(() => T.state().challengeClaimed);
    assert.deepEqual(claimed, [won, false, false, false]);
    const dims = await game.$$eval('#story-info .milestones > span', ns => ns.map(n => n.classList.contains('dim')));
    assert.deepEqual(dims, [!won, true, true, true]);
    if (won) assert.match(result, /\+1/, 'the result lists the Plus');
  }
  assert.deepEqual(errors, []);
});

/* ── The hatch: the owner's egg-hatch frames ───────────────────────────── */
test('hatching plays the cracking egg, the rays and the shell shards from the hatch sheet', async t => {
  const { tab, game, errors } = await openWithMons(t);
  // The sheet is inline, so it is there without a network.
  await game.waitForFunction(() => typeof HATCH_SHEET !== 'undefined' && HATCH_SHEET.complete && HATCH_SHEET.naturalWidth === 384);
  // Every tier draws at every step: the cracking egg, the rays, the burst.
  const drawn = await game.evaluate(() => [0, 1, 2, 3, 4].map(tier => [0, 0.7, 1.4, 1.65, 1.95].map(t => {
    const g = hatchFrame(tier, t).getContext('2d'), d = g.getImageData(0, 0, 96, 96).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  })));
  for (const row of drawn) for (const n of row) assert.ok(n > 40, 'every frame draws something: ' + JSON.stringify(drawn));
  // The cracks grow: the last stage differs from the first.
  const differ = await game.evaluate(() => hatchFrame(0, 0).toDataURL() !== hatchFrame(0, 1.3).toDataURL());
  assert.ok(differ);
  // A real hatch shows the sheet's frames in the cell while it shakes, then the Pokémon.
  await game.evaluate(() => {
    const now = Math.floor(Date.now() / 1000);
    const put = (id, entry) => { const w = JSON.parse(parent.localStorage.getItem('bored.wallet')); w.entries[id] = entry; parent.localStorage.setItem('bored.wallet', JSON.stringify(w)); };
    put('test:more', { at: now - 50, g: { regular: 1 } });
    G.pull({ voucher: 'regular', count: 1, machine: 'move' });
    put('test:more-waves', { at: now + 50, g: { waves: 100 } });
    refreshTop(); go('eggs');
  });
  await key(tab, 'Enter');
  assert.ok(await game.evaluate(() => !!hatching && hatching.phase === 'shake'));
  assert.ok(await game.evaluate(() => !!document.querySelector('#hatch .cell canvas')), 'the egg is drawn on a canvas');
  await game.waitForFunction(() => hatching && hatching.phase === 'shown', { timeout: 5000 });
  assert.ok(await game.evaluate(() => !!document.querySelector('#hatch .cell img')), 'then the Pokémon sprite');
  assert.deepEqual(errors, []);
});

/* ── Squad: slots, roster grid, filters, sorting, detail and teams ─────── */
test('squad: slots and a roster grid with real level and cost, filters, sorting, detail and three teams', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await key(tab, '1');
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => storyMode), 'squad');
  assert.equal(await game.$eval('#msg', n => n.hidden), true, 'the squad screen uses the whole stage');
  // The stage it is for, and what it sends.
  assert.match(await game.$eval('#squad-stage', n => n.textContent), /1-1.*Foes: Normal/);
  // Every roster card: class icon, level as "Lv n" and the deploy cost as its own badge, matching the engine.
  const cards = await game.evaluate(() => [...document.querySelectorAll('#squad-grid > .card')].map((c, i) => ({
    lv: c.querySelector('.low').textContent, cost: c.querySelector('.cost').textContent, icon: !!c.querySelector('canvas.ci'),
    unit: rosterCache.list[i] })));
  for (const c of cards) {
    assert.equal(c.lv, 'Lv' + c.unit.level);
    assert.equal(c.cost, String(c.unit.cost));
    assert.ok(c.icon);
  }
  // The cursor is a bracket on the selected card; Enter adds it, and it gets a check and a gold outline.
  await game.evaluate(() => { sq.zone = 'grid'; sq.at = 0; squadUpdate(); });
  assert.ok(await game.evaluate(() => !!document.querySelector('#squad-grid > .card .bracket')));
  await key(tab, 'Enter');
  const first = await game.evaluate(() => rosterCache.list[0].num);
  assert.deepEqual(await game.evaluate(() => squadPick()), [first]);
  assert.ok(await game.evaluate(() => document.querySelector('#squad-grid > .card').classList.contains('in')));
  // The detail: types, class, range, level and its next cost, six stats and four skills.
  const detail = await game.$eval('#squad-detail', n => n.textContent);
  assert.match(detail, /Range [\d.]+/); assert.match(detail, /Lv \d+\/10/); assert.match(detail, /cost \d+/);
  for (const k of ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe']) assert.match(detail, new RegExp(k + ' \\d+'));
  assert.equal(await game.$$eval('#squad-detail .skills > span', n => n.length), 4);
  // Filters: C cycles the class (spelled out), T a type, R a tier, Q only the squad.
  await key(tab, 'c');
  const cls = await game.evaluate(() => sqView().cls);
  assert.equal(cls, 'vanguard');
  assert.match(await game.$eval('#squad-filters', n => n.textContent), /Vanguard/);
  assert.ok(await game.evaluate(c => rosterCache.list.every(u => u.cls === c), cls));
  await game.evaluate(() => { pref.squadView = {}; keep(); squadUpdate(); });
  await key(tab, 'r');
  assert.ok(await game.evaluate(() => rosterCache.list.every(u => tierOf(u.num) === 3)));
  await key(tab, 'q');
  // Q: only squad members (still 3★ only).
  const shown = await game.evaluate(() => rosterCache.list.map(u => u.num).sort((a, b) => a - b));
  assert.deepEqual(shown, await game.evaluate(() => squadPick().filter(n => tierOf(n) === 3).sort((a, b) => a - b)));
  await game.evaluate(() => { pref.squadView = {}; keep(); squadUpdate(); });
  // Sorting: S goes Level, Cost, Tier, Newest.
  await key(tab, 's');
  const costs = await game.evaluate(() => rosterCache.list.map(u => u.cost));
  assert.deepEqual(costs, costs.slice().sort((a, b) => a - b), 'sorted by cost');
  // Slots: Enter on a slot removes it.
  await game.evaluate(() => { sq.zone = 'slots'; sq.slot = 0; squadUpdate(); });
  await key(tab, 'Enter');
  assert.deepEqual(await game.evaluate(() => squadPick()), []);
  // Teams: three saved squads; P switches, and each keeps its own picks.
  await game.evaluate(() => setSquad(S.owned.slice(0, 3)));
  await key(tab, 'p');
  assert.equal(await game.evaluate(() => pref.team), 1);
  assert.deepEqual(await game.evaluate(() => squadPick()), []);
  await game.evaluate(() => setSquad(S.owned.slice(3, 5)));
  await key(tab, 'p'); await key(tab, 'p');
  assert.equal(await game.evaluate(() => pref.team), 0);
  assert.deepEqual(await game.evaluate(() => squadPick()), await game.evaluate(() => S.owned.slice(0, 3)));
  assert.deepEqual(await game.evaluate(() => pref.squads[1]), await game.evaluate(() => S.owned.slice(3, 5)));
  // Nothing on the squad screen spills or overlaps.
  const spill = await game.evaluate(() => [...document.querySelectorAll('#squad, #squad *')].filter(n => n.offsetParent && n.id !== 'squad-grid' &&
    (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1) && n.clientWidth > 0).map(n => n.id || n.className));
  assert.deepEqual(spill, []);
  const box = id => rect(game, id);
  const parts = await Promise.all(['#squad-slots', '#squad-roster', '#squad-stage', '#squad-detail'].map(box));
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) assert.ok(apart(parts[i], parts[j]), 'squad panels ' + i + ' and ' + j + ' do not overlap');
  // Backspace goes back to the stages, and the message box comes back.
  await key(tab, 'Backspace');
  assert.equal(await game.evaluate(() => storyMode), 'stages');
  assert.equal(await game.$eval('#msg', n => n.hidden), false);
  assert.deepEqual(errors, []);
});

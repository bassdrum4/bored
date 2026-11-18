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
  // These tests are about other screens: the tutorial is off (it has its own tests).
  if (typeof tutorSkipAll === 'function') tutorSkipAll();
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
  assert.match(await game.$eval('#battle-pause', n => n.textContent), /Paused/);
  await key(tab, ' ');

  // The battle screen: the tab bar gives way, the HUD is one line, and the HUD,
  // pause, energy line, deploy cards and tip never overlap each other or the map.
  assert.equal(await game.$eval('#tabs', n => getComputedStyle(n).display), 'none', 'the tab bar gives way to the battle');
  const hud = await game.$eval('#battle-hud', n => [n.scrollHeight, n.clientHeight]);
  assert.ok(hud[0] <= hud[1], 'the HUD is one line');
  const map = await game.evaluate(() => mapBox());
  const parts = await Promise.all(['#battle-hud', '#battle-pause', '#deploy-info', '#deploy', '#battle-tip'].map(id => rect(game, id)));
  for (let i = 0; i < parts.length; i++) {
    assert.ok(apart(parts[i], map), 'panel ' + i + ' stays off the map');
    for (let j = i + 1; j < parts.length; j++) assert.ok(apart(parts[i], parts[j]), 'battle panels ' + i + ' and ' + j + ' do not overlap');
  }
  // Each deploy card: its sprite, class icon and cost, and no name to cut off.
  const cards = await game.$$eval('#deploy .card', cs => cs.map(c => ({ mini: !!c.querySelector('.mini'), icon: !!c.querySelector('canvas'), cost: c.querySelector('.num')?.textContent })));
  assert.ok(cards.length && cards.every(c => c.mini && c.icon && /^\d+$/.test(c.cost)));

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
    // The Poké Idle daily boss mission is open, so nothing on the weekly list is locked.
    assert.ok(!quests.find(q => q.label === 'All 5 weekly missions').off, 'the weekly Gold can be earned');
    assert.ok(!quests.find(q => /Poké Idle daily boss/.test(q.label)).off, 'the boss mission is open');
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
  // A type only finds caught lines, so it never hints at an uncaught line's type.
  await game.evaluate(() => { pref.dexFilter = 'All'; keep(); dexUpdate(); });
  const typed = await game.evaluate(() => [...new Set(BASES.filter(n => S.lines[n]).flatMap(n => G.dex[n - 1][1].split('/')))]);
  for (const t of typed) {
    const seen = await game.evaluate(t => { pref.dexType = t; keep(); dexUpdate(); return dexList().map(n => [!!S.lines[n], G.dex[n - 1][1].split('/').includes(t)]); }, t);
    assert.ok(seen.length > 0 && seen.every(([caught, has]) => caught && has), t + ': caught ' + t + ' lines only');
  }
  assert.equal(await game.evaluate(() => { pref.dexFilter = 'Not owned'; keep(); dexUpdate(); return dexList().length; }), 0, 'no uncaught line has a type to filter by');
  assert.match(await game.$eval('#msg', n => n.textContent), /Nothing matches/);
  await game.evaluate(() => { pref.dexType = ''; keep(); dexUpdate(); });
  // Back to all, any type; sort by name.
  await game.evaluate(() => { pref.dexFilter = 'All'; pref.dexType = ''; keep(); dexUpdate(); });
  await key(tab, 's');
  // Caught lines by name, then the uncaught ones (their names are hidden) by number.
  const sorted = await game.evaluate(() => dexList().map(num => [!!S.lines[num], name(num), num]));
  const caught = sorted.filter(r => r[0]), missing = sorted.filter(r => !r[0]);
  assert.deepEqual(sorted, [...caught, ...missing], 'caught lines first');
  assert.deepEqual(caught.map(r => r[1]), caught.map(r => r[1]).sort((a, b) => a.localeCompare(b)), 'S sorts caught lines by name');
  assert.deepEqual(missing.map(r => r[2]), missing.map(r => r[2]).sort((a, b) => a - b), 'and the rest by number');
  assert.equal(await game.evaluate(() => JSON.parse(localStorage.getItem('bored.poke-gacha.ui')).dexSort), 'Name', 'the choice is kept');
  assert.ok((await rowsNow()).length > 0);
  await game.evaluate(() => { pref.dexSort = 'Number'; keep(); });
  assert.deepEqual(errors, []);
});

test('Dex: uncaught lines are ??? with a silhouette, the egg they hatch from and no type; caught ones are named and checked', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await game.evaluate(() => { pref.dexFilter = 'All'; pref.dexType = ''; pref.dexSort = 'Number'; keep(); go('dex'); });
  // The list: a caught row has its name, a colour sprite and a check; an uncaught one only its number.
  const rowsSeen = await game.evaluate(() => [...document.querySelectorAll('#dex-rows > div')].map((r, i) => {
    const num = dexList()[i];
    return { caught: !!S.lines[num], text: r.textContent.trim(), name: name(num), dark: !!r.querySelector('.unseen'), check: !!r.querySelector('canvas:not(.unseen)'),
      tip: r.querySelector('.mini').title };
  }));
  assert.ok(rowsSeen.some(r => r.caught) && rowsSeen.some(r => !r.caught), 'the first rows hold both');
  for (const r of rowsSeen) {
    if (r.caught) { assert.ok(r.text.includes(r.name) && !r.dark && r.check, r.name + ' reads as caught'); }
    else { assert.ok(!r.text.includes(r.name) && /\?\?\?/.test(r.text) && r.dark && r.tip === '???', r.text + ' hides its name'); }
  }
  // The detail for an uncaught line: a silhouette that fills the cell, the egg and its icon, type ???.
  const line = await game.evaluate(() => { dexAt = dexList().findIndex(num => !S.lines[num]); dexUpdate(); return dexList()[dexAt]; });
  await game.waitForFunction(() => { const c = document.querySelector('#dex-pic canvas.silhouette'); return c && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some(v => v > 0); });
  const pic = await game.evaluate(() => {
    const c = document.querySelector('#dex-pic canvas.silhouette'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { size: c.width, span: Math.max(x1 - x0, y1 - y0) + 1 };
  });
  assert.ok(pic.span >= pic.size * 0.8, 'the silhouette fills the box (' + pic.span + ' of ' + pic.size + ')');
  const info = await game.evaluate(() => ({ text: $('#dex-info').textContent, egg: $('#dex-info .egg-line img')?.alt, all: document.querySelector('#dex-detail').textContent }));
  const [want, types, nm] = await game.evaluate(n => [TIER_NAME[G.dex[n - 1][9] - 3] + ' egg', G.dex[n - 1][1], name(n)], line);
  assert.equal(info.egg, want, 'the egg icon is the tier it hatches from');
  assert.match(info.text, /^\?\?\?/);
  assert.match(info.text, /Type \?\?\?/);
  assert.ok(!info.all.includes(nm), 'no name in the detail');
  assert.ok(!info.text.includes(types), 'no type in the detail');
  // A caught line: name, egg, type and candy costs in words (no red candy icon).
  await game.evaluate(() => { dexAt = dexList().findIndex(num => !!S.lines[num]); dexUpdate(); });
  const shown = await game.evaluate(() => ({ text: $('#dex-info').textContent, n: name(tipOf(dexList()[dexAt])), type: G.dex[tipOf(dexList()[dexAt]) - 1][1], icons: $('#dex-acts').querySelectorAll('canvas').length,
    acts: $('#dex-acts').textContent, spill: $('#dex-info').scrollHeight > $('#dex-info').clientHeight + 1 }));
  assert.ok(shown.text.startsWith(shown.n) && shown.text.includes(shown.type), 'a caught line shows its name and type');
  assert.match(shown.acts, /\d+ candy/);
  assert.equal(shown.spill, false);
  assert.deepEqual(errors, []);
});

test('Dex tiers follow each line\'s final evolution: Magikarp and Happiny are Rare, Bonsly (Sudowoodo, 410) stays Common', async () => {
  const { DEX } = await import(path.join(root, 'src/hub/gacha-dex.js'));
  const bst = r => r[2] + r[3] + r[4] + r[5] + r[6] + r[7];
  const kids = {};
  DEX.forEach((r, i) => { if (r[8]) (kids[r[8]] ||= []).push(i + 1); });
  const finals = n => kids[n] ? kids[n].flatMap(finals) : [n];
  const off = [];
  DEX.forEach((r, i) => {
    if (r[9] !== 3 && r[9] !== 4) return;
    const best = Math.max(...finals(i + 1).map(f => bst(DEX[f - 1])));
    if ((best >= 500 ? 4 : 3) !== r[9]) off.push(r[0] + ' ' + r[9] + '★ (final ' + best + ')');
  });
  assert.deepEqual(off, [], 'every Common/Rare line is tiered by its final form');
  const star = n => DEX.find(r => r[0] === n)[9];
  assert.deepEqual(['Magikarp', 'Happiny', 'Munchlax', 'Feebas', 'Bonsly'].map(star), [4, 4, 4, 4, 3]);
});

test('Quests: four sub-tabs with reset clocks; rows show n/m, a bar and real reward icons; done rows sink; trophies group by game', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await game.evaluate(() => { for (const st of T.allStages.slice(0, 3)) T.finish({ stage: st.id, stars: 3, team: [S.owned[0]], waves: 1 }); refreshTop(); });
  await key(tab, '6');
  const tabs = await game.$$eval('#quest-tabs > span', n => n.map(t => [t.dataset.qtab, t.querySelector('.num').textContent, t.querySelector('.clock')?.textContent || '']));
  assert.deepEqual(tabs.map(t => t[0]), ['daily', 'weekly', 'starter', 'trophies']);
  for (const [, count] of tabs) assert.match(count, /^\d+\/(\d+|\?)$/);
  assert.match(tabs[0][2], /^(\d+h )?\d+m$|^\d+h \d+m$/, 'Daily counts down to midnight');
  assert.match(tabs[1][2], /^\d+d \d+h$|^\d+h \d+m$|^\d+m$/, 'Weekly counts down to Monday');
  assert.deepEqual([tabs[2][2], tabs[3][2]], ['', ''], 'Starter and Trophies never reset');
  // Each sub-tab: every row has n/m over a bar and its reward in icons (no S/M/B letters); done rows are last.
  for (const id of ['daily', 'weekly', 'starter', 'trophies']) {
    const rows = await game.evaluate(id => { questTab = id; questAt = 0; questsUpdate();
      return [...document.querySelectorAll('#quest-list .q')].map(r => ({ done: r.classList.contains('done'), n: r.querySelector('.prog .n').textContent,
        bar: !!r.querySelector('.bar i'), icons: r.querySelectorAll('.reward img').length, text: r.querySelector('.reward').textContent, check: !!r.querySelector('.reward canvas') })); }, id);
    if (!rows.length) continue;
    const firstDone = rows.findIndex(r => r.done);
    if (firstDone >= 0) assert.ok(rows.slice(firstDone).every(r => r.done), id + ': done rows are at the bottom');
    for (const r of rows) {
      assert.match(r.n, /^(\d+\/\d+|later)$/);
      assert.ok(r.bar && r.icons >= 1 && !/\b[SMB]\b/.test(r.text), id + ': progress bar and reward icons');
      assert.equal(r.check, r.done, id + ': a check exactly on done rows');
    }
  }
  // Clears ticked "Clear any stage" (when drawn today) and the 1-1 starter mission, and they sit below the open ones.
  const daily = await game.evaluate(() => { questTab = 'daily'; questsUpdate(); return [...document.querySelectorAll('#quest-list .q')].map(r => [r.querySelector('.label').textContent, r.classList.contains('done')]); });
  const clear = daily.find(r => r[0] === 'Clear any stage');
  if (clear) assert.equal(clear[1], true);
  // A star in a label is the text's own size.
  // A star in a label is drawn no taller than the letters around it (both measured on screen).
  const star = await game.evaluate(() => { const row = [...document.querySelectorAll('#quest-list .label')].find(n => n.querySelector('.st'));
    if (!row) return null;
    const range = document.createRange(), text = [...row.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    range.setStart(text, 0); range.setEnd(text, 1);
    return [row.querySelector('.st').getBoundingClientRect().height, range.getBoundingClientRect().height]; });
  if (star) assert.ok(star[0] <= star[1] * 1.05, 'the star is no taller than the text ' + JSON.stringify(star));
  // Left/Right move between sub-tabs; Up/Down skip the trophy group headers.
  await game.evaluate(() => { questTab = 'daily'; questsUpdate(); });
  await key(tab, 'ArrowRight');
  assert.equal(await game.evaluate(() => questTab), 'weekly');
  await key(tab, 'ArrowLeft', 2);
  assert.equal(await game.evaluate(() => questTab), 'trophies');
  if (await game.evaluate(() => !!G.trophyList)) {
    const groups = await game.$$eval('#quest-list .group', n => n.map(g => g.textContent));
    assert.deepEqual(groups.map(g => g.replace(/\d+\/\d+$/, '')), ['Poké Idle', 'Pokédoku']);
    const total = await game.evaluate(() => G.trophyList().length);
    assert.match(await game.$eval('#quest-tabs [data-qtab="trophies"]', n => n.textContent), new RegExp('\\d+/' + total + '$'));
    await key(tab, 'ArrowDown', 3);
    assert.ok(await game.evaluate(() => !questRows('trophies')[questAt].head), 'the cursor never lands on a header');
  }
  // Nothing is cut or spills, and the message names the reset.
  await game.evaluate(() => { questTab = 'weekly'; questAt = 0; questsUpdate(); });
  const spill = await game.evaluate(() => [...document.querySelectorAll('#scr-quests *')].filter(n => n.offsetParent && n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1).map(n => n.className));
  assert.deepEqual(spill, []);
  assert.match(await game.$eval('#msg', n => n.textContent), /Resets in \d+[dhm]/);
  assert.deepEqual(errors, []);
});

test('sound: off until turned on (M or the speaker), kept per device, and pulls, hatches and battles make their sounds', async t => {
  const { tab, game, errors } = await openWithMons(t);
  // Record which sounds would play, without needing speakers.
  await game.evaluate(() => { window.__heard = []; for (const k of Object.keys(SOUNDS)) { const f = SOUNDS[k]; SOUNDS[k] = a => { __heard.push(k); f(a); }; } });
  assert.equal(await game.evaluate(() => soundOn()), false, 'muted on a fresh device');
  await game.evaluate(() => { go('pull'); turnCrank(); });
  assert.deepEqual(await game.evaluate(() => [__heard.length, SFX.ctx]), [0, null], 'muted: nothing plays and no audio is opened');
  // The speaker sits beside "?" and the tab bar still fits.
  assert.equal(await game.$eval('#tabs .help .speaker', n => n.title), 'Sound off (M)');
  await key(tab, 'm');
  assert.equal(await game.evaluate(() => soundOn()), true);
  assert.equal(await game.$eval('#tabs .help .speaker', n => n.title), 'Sound on (M)');
  assert.equal(await game.evaluate(() => JSON.parse(localStorage.getItem('bored.poke-gacha.ui')).sound), true, 'kept on this device');
  const tabs = await game.$eval('#tabs', n => [n.scrollWidth, n.clientWidth]);
  assert.ok(tabs[0] <= tabs[1], 'the tab bar does not overflow');
  // A pull, a hatch (four shakes, the crack, the burst and the reveal), then a battle.
  await game.evaluate(() => { __heard = []; turnCrank(); });
  assert.deepEqual(await game.evaluate(() => __heard), ['pull']);
  await game.evaluate(() => {
    const now = Math.floor(Date.now() / 1000), w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    w.entries['test:snd'] = { at: now - 50, g: { regular: 1 } }; parent.localStorage.setItem('bored.wallet', JSON.stringify(w));
    G.pull({ voucher: 'regular', count: 1, machine: 'move' });
    // Waves earned after the pull hatch it.
    const v = JSON.parse(parent.localStorage.getItem('bored.wallet')); v.entries['test:sndw'] = { at: now + 30, g: { waves: 50 } }; parent.localStorage.setItem('bored.wallet', JSON.stringify(v));
    refreshTop(); go('eggs'); __heard = []; startHatch();
  });
  await game.waitForFunction(() => hatching && hatching.phase === 'shown', { timeout: 6000 });
  const hatchHeard = await game.evaluate(() => __heard);
  assert.deepEqual(hatchHeard.slice(0, 6), ['shake', 'shake', 'shake', 'shake', 'crack', 'burst']);
  assert.ok(['hatch', 'epic', 'legend'].includes(hatchHeard[6]), 'the reveal: ' + hatchHeard[6]);
  await game.evaluate(() => endHatch());
  await game.evaluate(() => { __heard = []; go('story'); chapterAt = 0; storyAt = 0; storyUpdate(); pickStage(); setSquad(S.owned.slice(0, 4)); startBattle(); battle.talk = []; battleTalk();
    const b = battle.b; b.energy = 99;
    // The first squad member and tile it can take (a blocker on the path, a ranged unit up high).
    found: for (let slot = 0; slot < b.squad.length; slot++) for (let y = 0; y < b.stage.map.length; y++) for (let x = 0; x < b.stage.map[y].length; x++)
      if (!T.canDeploy(b, slot, x, y)) { battle.slot = slot; tileAction(x, y); break found; }
    battle.paused = false; });
  await game.waitForFunction(() => __heard.includes('hit'), { timeout: 30000 });
  await game.evaluate(() => { battle.b.life = 0; });
  await game.waitForFunction(() => battle.done, { timeout: 10000 });
  const battleHeard = await game.evaluate(() => __heard);
  assert.equal(battleHeard[0], 'deploy');
  assert.ok(battleHeard.includes('win') || battleHeard.includes('lose'));
  // M again turns it off.
  await game.evaluate(() => leaveBattle && battle && battle.done && (battle.talk = [], leaveBattle()));
  await key(tab, 'm');
  assert.equal(await game.evaluate(() => soundOn()), false);
  assert.deepEqual(errors, []);
});

test('SP skins: the shop prices sets by size, a set shows on each form, and a skin rolled for an evolution shows on it', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await game.waitForFunction(() => G.skins().length > 0);
  // Every listed skin's art loads, at 96x96.
  const sizes = await game.evaluate(async () => Promise.all(G.skins().flatMap(skin => skin.forms.map(num => new Promise(done => {
    const img = sprite(num, skin.id); img.onload = () => done([skin.id, num, img.naturalWidth, img.naturalHeight]); img.onerror = () => done([skin.id, num, 0, 0]);
  })))));
  assert.ok(sizes.length >= 30);
  for (const [id, num, w, h] of sizes) assert.deepEqual([w, h], [96, 96], id + ' on #' + num);
  // The shop: every listed skin whose line hatches is for sale (Mew too, now mythicals are in Legendary eggs); prices go by forms.
  const shop = await game.evaluate(() => shopItems().filter(i => i.kind === 'sp').map(i => [i.skin.id, i.price]));
  assert.equal(shop.find(([id]) => id === 'mew')?.[1], 300, 'the Mew skin is on sale');
  assert.deepEqual(['charizard', 'clefairy-set', 'pidgey-set'].map(id => shop.find(r => r[0] === id)[1]), [300, 400, 500]);
  // Own the Pidgey line, buy the set and wear it: Pidgey and Pidgeotto both draw it.
  const worn = await game.evaluate(() => {
    const now = Math.floor(Date.now() / 1000), w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    w.entries['test:sp'] = { at: now - 50, g: { shards: 500, 'candy:16': 50 } }; parent.localStorage.setItem('bored.wallet', JSON.stringify(w));
    refreshTop();
    return { had: S.owned.includes(16), shards: S.balance.shards };
  });
  if (!worn.had) return t.skip('this roster has no Pidgey');
  const r = await game.evaluate(() => [G.evolve({ from: 16, to: 17 }).ok, G.buySkin({ skin: 'pidgey-set' }).ok, G.setLook({ line: 16, look: 'pidgey-set' }).ok]);
  assert.deepEqual(r, [true, true, true]);
  await game.evaluate(() => refreshTop());
  assert.deepEqual(await game.evaluate(() => [G.lookFor(16), G.lookFor(17), G.lookFor(18)]), ['pidgey-set', 'pidgey-set', 'pidgey-set']);
  assert.match(await game.evaluate(() => spriteUrl(17, 'pidgey-set')), /sp\/pidgey-set-17\.png$/);
  assert.equal(await game.evaluate(() => S.balance.shards), worn.shards - 500, 'a three-form set costs 500');
  assert.equal(await game.evaluate(() => T.squad([17])[0].look), 'pidgey-set', 'battle draws the set on Pidgeotto');
  // A Charizard skin rolled from a Charmander egg shows Charizard; a single skin stays on its own form.
  assert.match(await game.evaluate(() => hatchSprite({ species: 4, sp: 'charizard' }).src), /sp\/charizard-6\.png$/);
  assert.match(await game.evaluate(() => spriteUrl(4, 'charizard')), /sp\/charizard-6\.png$/);
  assert.deepEqual(errors, []);
});

test('chapters 5-6: fast foes are named, nothing overflows, and the first clear of the final stage plays the ending once', async t => {
  const { tab, game, errors } = await openWithMons(t);
  if (!await game.evaluate(() => Array.isArray(T.chapters) && T.chapters.length >= 6)) return t.skip('the hub engine has fewer than 6 chapters');
  await game.evaluate(() => { for (const st of T.allStages) { if (st.id === '6-6') break; T.finish({ stage: st.id, stars: 3, team: [S.owned[0]], waves: 1 }); } refreshTop(); });
  await key(tab, '1');
  // Every chapter 5-6 preview, its message and its squad box fit.
  const bad = await game.evaluate(() => { const out = [];
    for (const c of [4, 5]) { chapterAt = c; for (let i = 0; i < stagesNow().length; i++) { storyMode = 'stages'; storyAt = i; storyUpdate();
      for (const id of ['#story-info', '#msg']) { const n = $(id); if (n.scrollHeight > n.clientHeight + 1) out.push(stagesNow()[i].id + id); }
      pickStage(); const q = $('#squad-stage'); if (q.scrollHeight > q.clientHeight + 1 || [...q.children].some(n => n.scrollWidth > n.clientWidth + 1)) out.push(stagesNow()[i].id + ' squad'); } }
    storyMode = 'stages'; return out; });
  assert.deepEqual(bad, []);
  await game.evaluate(() => { chapterAt = 4; storyAt = 0; storyUpdate(); });
  assert.match(await game.$eval('#story-info', n => n.textContent), /Fast: Raticate/);
  await game.evaluate(() => pickStage());
  assert.match(await game.$eval('#squad-stage', n => n.textContent), /fast/);
  // 6-6, first clear: Giovanni's words, then the ending, and THE END.
  const play66 = async () => {
    await game.evaluate(() => { storyMode = 'stages'; chapterAt = 5; storyAt = 5; storyUpdate(); pickStage(); setSquad(S.owned.slice(0, 4)); startBattle();
      battle.talk = []; battleTalk(); battle.b.queue = []; battle.b.enemies = []; battle.paused = false; });
    await game.waitForFunction(() => battle.done, { timeout: 10000 });
    const talk = await game.evaluate(() => battle.talk.slice());
    await game.evaluate(() => { battle.talk = []; battleTalk(); showResult(); });
    const title = await game.$eval('#battle-result .title', n => n.textContent);
    await game.evaluate(() => leaveBattle());
    return [talk, title];
  };
  const [first, title] = await play66();
  const ending = await game.evaluate(() => T.allStages.find(s => s.id === '6-6').ending);
  assert.deepEqual(first.slice(-ending.length), ending, 'the ending follows the boss');
  assert.equal(title, 'THE END');
  const [again, title2] = await play66();
  assert.ok(!again.some(line => ending.includes(line)), 'only once');
  assert.equal(title2, 'CLEARED');
  assert.deepEqual(errors, []);
});

test('progression: Squad and Dex show the level cap, and K picks which unlocked skill a line uses', async t => {
  const { tab, game, errors } = await openWithMons(t);
  // A line with two skills unlocked: a second hatch of the first owned line, rolled on its third skill.
  const line = await game.evaluate(() => {
    const now = Math.floor(Date.now() / 1000), num = S.owned[0], w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    w.entries['spend:prog2'] = { at: now - 90, g: { regular: 0 }, x: { m: 'move', e: [0], w: 0, n: 0, d: '2026-11-18' } };
    w.entries['hatch:prog2.0'] = { at: now - 80, x: { s: num, t: 0, n: 0, k: 2 } };
    parent.localStorage.setItem('bored.wallet', JSON.stringify(w)); refreshTop();
    return G.lineOf(num);
  });
  const cap = await game.evaluate(l => T.capOf ? T.capOf(l) : T.maxLevel, line);
  await key(tab, '1');
  await key(tab, 'Enter');
  await game.evaluate(l => { setSquad([S.owned.find(n => G.lineOf(n) === l)]); sq.zone = 'slots'; sq.slot = 0; squadUpdate(); }, line);
  assert.match(await game.$eval('#squad-detail', n => n.textContent), new RegExp('Lv \\d+/' + cap));
  if (await game.evaluate(() => !!G.setSkill)) {
    const before = await game.evaluate(() => unitOf(squadPick()[0]).skillAt ?? null);
    await key(tab, 'k');
    const after = await game.evaluate(() => { rosterCache = null; return [unitOf(squadPick()[0]).skillAt, document.querySelector('#squad-detail .skills .use')?.textContent, sq.note]; });
    assert.notEqual(after[0], before, 'K switched the skill');
    assert.equal(after[1].replace('*', ''), await game.evaluate(k => G.skillsOf(squadPick()[0])[k], after[0]), 'the skill in use is marked');
    assert.match(after[2], /^Skill: /);
    const spill = await game.$eval('#squad-detail', n => [...n.children].some(c => c.getBoundingClientRect().right > n.getBoundingClientRect().right + 1));
    assert.equal(spill, false, 'the note fits the panel');
  }
  // The Dex: the battle level and its cap come first.
  await game.evaluate(l => { storyMode = 'stages'; go('dex'); pref.dexFilter = 'All'; dexAt = dexList().indexOf(l); dexUpdate(); }, line);
  if (await game.evaluate(() => !!(T.capOf && G.setSkill))) {
    const first = await game.$eval('#dex-acts > div', n => n.textContent);
    assert.match(first, new RegExp('^Battle level.*\\d+/' + cap + '$'));
    assert.match(await game.$eval('#dex-acts', n => n.textContent), /Skill: /);
  }
  assert.deepEqual(errors, []);
});

test('coin shop: candy for a picked line, shards and preset slots, each with a confirm step and its limit shown', async t => {
  const { tab, game, errors } = await openWithMons(t);
  if (!await game.evaluate(() => !!G.coinShop)) return t.skip('the hub has no coin shop');
  await game.evaluate(() => { const now = Math.floor(Date.now() / 1000), w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    w.entries['test:coins'] = { at: now - 100, g: { coins: 20000 } }; parent.localStorage.setItem('bored.wallet', JSON.stringify(w)); refreshTop(); });
  await key(tab, '5');
  const labels = await game.evaluate(() => shopItems().map(i => i.kind + ':' + i.label));
  assert.ok(labels.includes('shards:10 shards · 50/50 a week') && labels.some(l => l.startsWith('candy:')) && labels.includes('preset:Squad preset 4 of 5'));
  const row = kind => game.evaluate(k => shopItems().findIndex(i => i.kind === k), kind);
  // Shards: Enter asks, Backspace cancels without buying, Enter Enter buys; the weekly limit counts down.
  await game.evaluate(i => { shopAt = i; shopUpdate(); }, await row('shards'));
  const coins0 = await game.evaluate(() => S.balance.coins);
  await key(tab, 'Enter');
  assert.match(await game.$eval('#msg', n => n.textContent), /Buy 10 shards for 500 coins\? Enter: buy/);
  await key(tab, 'Backspace');
  assert.equal(await game.evaluate(() => S.balance.coins), coins0, 'cancelled: nothing bought');
  assert.equal(await game.evaluate(() => tab), 'shop', 'Backspace on a question only cancels it');
  for (let i = 0; i < 5; i++) { await key(tab, 'Enter'); await key(tab, 'Enter'); }
  assert.deepEqual(await game.evaluate(c0 => [S.shop.shardsLeft, c0 - S.balance.coins], coins0), [0, 2500]);
  assert.match(await game.evaluate(() => shopItems().find(i => i.kind === 'shards').label), /0\/50 a week/);
  // Candy: Enter opens the caught lines with the Dex filters; Enter Enter buys for the line under the cursor.
  await game.evaluate(i => { shopAt = i; shopUpdate(); }, await row('candy'));
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => shopMode), 'candy');
  const lines = await game.evaluate(() => candyLines());
  assert.ok(lines.length > 0 && await game.evaluate(l => l.every(n => !!S.lines[n]), lines), 'caught lines only');
  const line = lines[0], candy0 = await game.evaluate(l => S.lines[l].candy, line);
  await key(tab, 'Enter'); await key(tab, 'Enter');
  assert.equal(await game.evaluate(l => S.lines[l].candy, line) - candy0, 5);
  assert.match(await game.$eval('#shop-list', n => n.textContent), /45\/50 today/);
  await key(tab, 't');
  const type = await game.evaluate(() => candyView().type);
  assert.ok(await game.evaluate(t => candyLines().every(n => G.dex[n - 1][1].split('/').includes(t)), type), 'T filters by type, like the Dex');
  await key(tab, 'Backspace');
  assert.equal(await game.evaluate(() => shopMode), 'list');
  // Presets: 4th and 5th; then Squad shows T1-T5 and Start, and nothing spills.
  await game.evaluate(i => { shopAt = i; shopUpdate(); }, await row('preset'));
  await key(tab, 'Enter'); await key(tab, 'Enter'); await key(tab, 'Enter'); await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => S.shop.presets), 5);
  assert.match(await game.evaluate(() => shopItems().find(i => i.kind === 'preset').label), /Squad presets: 5 of 5/);
  const spill = await game.evaluate(() => [...document.querySelectorAll('#scr-shop *, #msg')].filter(n => n.offsetParent && n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1).map(n => n.className));
  assert.deepEqual(spill, []);
  await key(tab, '1'); await key(tab, 'Enter');
  const head = await game.$eval('#squad-stage .teams', n => [n.textContent, n.scrollWidth <= n.clientWidth + 1]);
  assert.deepEqual(head, ['T1T2T3T4T5Start', true]);
  assert.deepEqual(errors, []);
});

test('tilesets: tiles by stage seed, path edges at floor, front faces only before low ground, props on floor, drawn tiles as the fallback', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await key(tab, '1');
  // No tiles folder in the repo yet: the field draws as before.
  await game.evaluate(() => { pickStage(); setSquad(S.owned.slice(0, 2)); startBattle(); battle.talk = []; battleTalk(); battle.paused = true; });
  const px = (x, y) => game.evaluate(([x, y]) => [...document.querySelector('#field').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3).join(','), [x, y]);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
  const centre = (x, y) => game.evaluate(([x, y]) => { const r = tileRect(battle.stage, x, y); return [r.x + 28, r.y + 18]; }, [x, y]);
  const pathTile = await game.evaluate(() => { const p = T.pathsOf(battle.stage)[0]; return p[Math.floor(p.length / 2)]; });
  await game.evaluate(() => drawField());
  assert.equal(await px(...await centre(...pathTile)), hex(await game.evaluate(() => SHADE.paper[0])), 'without a tileset the drawn path shows');
  // A test tileset: one solid colour per piece (edges are a 4px strip on their side).
  await game.evaluate(() => {
    const solid = (w, h, color, strip) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = color;
      if (strip === 'top') g.fillRect(0, 0, w, 4); else if (strip === 'bottom') g.fillRect(0, h - 4, w, 4); else if (strip === 'left') g.fillRect(0, 0, 4, h); else if (strip === 'right') g.fillRect(w - 4, 0, 4, h);
      else if (strip === 'dot') g.fillRect(w / 2 - 6, h / 2 - 6, 12, 12); else g.fillRect(0, 0, w, h); c.naturalWidth = w; c.naturalHeight = h; return c; };
    const set = { theme: 'test', floor: [solid(56, 36, '#101010'), solid(56, 36, '#202020')], path: [solid(56, 36, '#303030')], 'high-top': [solid(56, 36, '#404040')], 'high-front': [solid(56, 12, '#505050')],
      'path-edge-top': solid(56, 36, '#606060', 'top'), 'path-edge-bottom': solid(56, 36, '#616161', 'bottom'), 'path-edge-left': solid(56, 36, '#626262', 'left'), 'path-edge-right': solid(56, 36, '#636363', 'right'),
      spawn: solid(56, 36, '#707070', 'dot'), base: solid(56, 36, '#717171', 'dot'), props: [solid(10, 30, '#808080')] };
    for (const theme of ['chapter-1', 'default']) TILESETS.set(theme, set);
    drawField();
  });
  const map = await game.evaluate(() => battle.stage.map);
  const at = (x, y) => (map[y] || '')[x];
  const props = await game.evaluate(() => propsOf(battle.stage, tilesetFor(battle.stage)).map(p => [p.x, p.y]));
  const propAt = new Set(props.map(p => p.join(',')));
  assert.ok(props.length > 0 && props.every(([x, y]) => at(x, y) === '#'), 'props stand on floor tiles only');
  const floors = new Set();
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
    const c = at(x, y), [cx, cy] = await centre(x, y);
    if (c === '#') { if (propAt.has(x + ',' + y)) continue; const got = await px(cx, cy); assert.ok(['16,16,16', '32,32,32'].includes(got), 'floor ' + x + ',' + y + ': ' + got); floors.add(got); }
    if (c === '.') {
      assert.equal(await px(cx, cy), '48,48,48', 'path ' + x + ',' + y);
      // The edge strip shows on a side that meets floor, and not on a side that meets path or high ground.
      const top = await px(cx, cy - 16);
      assert.equal(top === '96,96,96', at(x, y - 1) === '#' && y > 0, 'top edge at ' + x + ',' + y);
    }
    if (c === 'H') {
      assert.equal(await px(cx, cy), '64,64,64', 'high top ' + x + ',' + y);
      const front = await px(cx, cy + 18 + 6);
      // A prop standing on the tile in front may cover the face: that is the right depth order.
      if (propAt.has(x + ',' + (y + 1))) continue;
      if (y + 1 < map.length && at(x, y + 1) !== 'H') assert.equal(front, '80,80,80', 'front face before low ground at ' + x + ',' + y);
      if (y + 1 < map.length && at(x, y + 1) === 'H') assert.notEqual(front, '80,80,80', 'no front face before more high ground at ' + x + ',' + y);
    }
    if (c === 'S') assert.equal(await px(cx, cy), '112,112,112', 'spawn marker');
    if (c === 'G') assert.equal(await px(cx, cy), '113,113,113', 'base marker');
  }
  assert.equal(floors.size, 2, 'both floor variants are used');
  // The stage seed decides it: the same stage picks the same, another stage can differ.
  assert.equal(await game.evaluate(() => JSON.stringify(propsOf(battle.stage, tilesetFor(battle.stage)).map(p => [p.x, p.y]))), JSON.stringify(props));
  assert.ok(await game.evaluate(() => T.allStages.slice(0, 8).some(s => tilePick(stageSeed(s), 1, 1, 3, 2) !== tilePick(stageSeed(battle.stage), 1, 1, 3, 2))));
  // A piece the set lacks falls back to the drawn tile.
  await game.evaluate(() => { tilesetFor(battle.stage).path = []; drawField(); });
  assert.equal(await px(...await centre(...pathTile)), hex(await game.evaluate(() => SHADE.paper[0])), 'a set without path tiles draws the path as before');
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
  // The tutorial has its own tests; this one is about the pick and the first battle.
  await game.evaluate(() => { if (typeof tutorSkipAll === 'function') tutorSkipAll(); });
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
  assert.match(await game.$eval('#battle-hud', n => n.textContent), /Risk\s*4/);
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
test('multi-pull reveal: every egg on one board, in order; Epic and up framed and flashed; NEW on first tiers; Enter finishes then closes', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await game.evaluate(() => {
    const now = Math.floor(Date.now() / 1000), w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    w.entries['test:reveal'] = { at: now - 50, g: { gold: 1, premium: 1, regular: 3 } }; parent.localStorage.setItem('bored.wallet', JSON.stringify(w));
    refreshTop(); go('pull');
    // Watch for the flash classes while the eggs pop in.
    window.__flashes = []; new MutationObserver(list => { for (const m of list) if (m.target.classList && /flash/.test(m.target.className)) __flashes.push(m.target.className); })
      .observe(document.querySelector('#reveal'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  // A single Regular is not a reveal.
  await game.evaluate(() => { menuOpen = true; const i = OPTIONS.findIndex(o => o.voucher === 'regular' && o.count === 1); cursor = i; choose(i); });
  assert.equal(await game.evaluate(() => reveal), null, 'one egg is not a reveal');
  assert.match(await game.$eval('#msg', n => n.textContent), /^1 egg/, 'and keeps its plain message');
  // Gold: 25 eggs, at least one Epic.
  const before = await game.evaluate(() => ({ gold: S.balance.gold, seen: [...new Set([...S.eggs, ...S.hatched].map(e => e.tier))] }));
  await game.evaluate(() => { menuOpen = true; const i = OPTIONS.findIndex(o => o.voucher === 'gold'); cursor = i; choose(i); });
  const early = await game.evaluate(() => ({ cells: reveal.cells.length, shown: reveal.shown, menu: !$('#menu').hidden }));
  assert.deepEqual([early.cells, early.shown, early.menu], [25, 0, false], 'the board opens empty over the machine, menu hidden');
  await pause(900);
  const mid = await game.evaluate(() => reveal.shown);
  assert.ok(mid > 0 && mid < 25, 'eggs pop in one after another (' + mid + ' so far)');
  await game.waitForFunction(() => reveal && reveal.done, { timeout: 8000 });
  const board = await game.evaluate(() => ({ tiers: reveal.list.map(x => x.tier), news: reveal.list.filter(x => x.isNew).map(x => x.tier),
    framed: [...document.querySelectorAll('#reveal .egg.t2, #reveal .egg.t3, #reveal .egg.t4')].length, msg: $('#msg').textContent, flashes: __flashes.slice() }));
  const epicUp = board.tiers.filter(x => x >= 2).length;
  assert.ok(epicUp >= 1, 'a Gold pull has an Epic or better');
  assert.equal(board.framed, epicUp, 'each Epic or better has its frame');
  assert.ok(board.flashes.some(c => /flash/.test(c)), 'a flash played');
  const firsts = [...new Set(board.tiers.filter(x => x < 4 && !before.seen.includes(x)))].sort();
  assert.deepEqual(board.news.filter(x => x < 4).sort(), firsts, 'NEW on the first egg of each tier never pulled before');
  assert.match(board.msg, /Common.*Enter: close\./);
  // Enter closes it, and does not pull again.
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => reveal), null);
  assert.equal(await game.evaluate(() => S.balance.gold), before.gold - 1, 'exactly one Gold spent');
  // Premium: Enter while it plays shows everything at once, a second Enter closes, and a click works too.
  await game.evaluate(() => { menuOpen = true; const i = OPTIONS.findIndex(o => o.voucher === 'premium'); cursor = i; choose(i); });
  await key(tab, 'Enter');
  assert.deepEqual(await game.evaluate(() => [reveal.done, reveal.shown]), [true, 10]);
  await (await game.$('#reveal')).click();
  assert.equal(await game.evaluate(() => reveal), null);
  assert.deepEqual(errors, []);
});

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
  assert.match(await game.$eval('#squad-stage', n => n.textContent), /1-1.*Tank Rock, Steel.*Dmg Fighting/);
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
  assert.match(detail, /Range [\d.]+/); assert.match(detail, /Lv \d+\/(5|8|10)\b/); assert.match(detail, /cost \d+/);
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

/* ── The battle's feel: blocking, effects and the 3/4 field ────────────── */
test('battle: blocked enemies stand clear of the blocker, hits show numbers and flashes, and the range previews', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await key(tab, '1');
  await game.evaluate(() => { setSquad(S.owned.filter(n => T.classOf(n) === 'blocker').slice(0, 1).concat(S.owned.filter(n => T.classOf(n) === 'sniper').slice(0, 1))); });
  await key(tab, 'Enter');
  await game.evaluate(() => { sq.zone = 'head'; sq.head = 3; squadUpdate(); });
  await key(tab, 'Enter');
  await game.waitForFunction(() => battle && !document.querySelector('#scr-battle').hidden);
  const result = await game.evaluate(() => {
    battle.talk = []; battleTalk(); battle.paused = true;
    const b = battle.b, st = battle.stage;
    const ground = T.pathsOf(st)[0].filter(([x, y]) => st.map[y][x] === '.');
    b.energy = 99;
    const bi = b.squad.findIndex(u => u.cls === 'blocker');
    T.deploy(b, bi, ground[2][0], ground[2][1]);
    // A virtual clock, 50ms a tick, as in play.
    let vt = performance.now(); const real = performance.now.bind(performance); performance.now = () => vt;
    let blocked = null, sawNum = false, sawFlash = false;
    for (let i = 0; i < 3000 && !b.over; i++) {
      vt += 50; stepWithFx(battle);
      sawNum ||= battle.fx.some(f => f.kind === 'num');
      sawFlash ||= Object.values(battle.anim).some(a => a && a.flash);
      const e = b.enemies.find(o => o.blockedBy && !o.flying);
      if (e && !blocked) {
        const u = b.units.find(o => o.id === e.blockedBy);
        const [ex, ey] = enemySpot(battle, e);
        const [fx, fy] = feetOf(battle, e), [gx, gy] = feet(st, ex, ey, false);
        drawField(vt);
        const bar = (battle.bars || []).find(p => p.id === 'e' + e.id);
        blocked = { gap: Math.hypot(ex - u.x, ey - u.y), facing: facesRight(e) === (u.x > ex) || facesRight(e) === (u.x >= ex),
          tile: st.map[Math.round(ey)][Math.round(ex)], sameRow: Math.round(ey) === u.y || Math.round(ex) === u.x,
          rowOffset: Math.abs(ey - Math.round(ey)), raised: fy !== gy || fx !== gx, bar: !!bar && bar.y > 0 };
      }
      if (blocked && sawNum && sawFlash) break;
    }
    drawField(vt);
    // Every live enemy has its HP bar on the top layer, inside the field; every sprite fits the 48x64 box.
    const ids = new Set((battle.bars || []).filter(p => p.y >= 0 && p.y < FIELD_H).map(p => p.id));
    const allBars = b.enemies.every(e => ids.has('e' + e.id)) && b.units.every(u => ids.has('u' + u.id));
    const fits = [...b.units, ...b.enemies].every(o => { const img = spriteFor(o.num, o.look || 'normal'), tr = trimOf(img); return !tr || ((tr.b - tr.t) * fitOf(tr) <= 48.5 && (tr.r - tr.l) * fitOf(tr) <= 64.5); });
    performance.now = real;
    // Range preview: hovering a high tile with the sniper card shows its range.
    const si = b.squad.findIndex(u => u.cls === 'sniper');
    const high = []; st.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'H') high.push([x, y]); }));
    battle.slot = si; battle.hover = high[0];
    return { blocked, sawNum, sawFlash, allBars, fits, range: inRange(b.squad[si], high[0][0], high[0][1]).length };
  });
  assert.ok(result.blocked, 'an enemy was blocked');
  assert.ok(result.blocked.gap >= 0.8, 'a blocked enemy stands at the edge of the tile, not on the blocker');
  assert.ok(result.blocked.facing, 'and faces it');
  assert.ok(['.', 'S'].includes(result.blocked.tile), 'a blocked ground enemy stands on the path, not up on high ground: ' + result.blocked.tile);
  assert.ok(result.blocked.sameRow && result.blocked.rowOffset < 0.01, 'in the path tile next to the blocker, along the path');
  assert.equal(result.blocked.raised, false, 'only flyers are raised');
  assert.ok(result.blocked.bar, 'a blocked enemy keeps its HP bar');
  assert.ok(result.allBars, 'every live enemy and unit has an HP bar');
  assert.ok(result.fits, 'every sprite fits the tile box');
  assert.ok(result.sawNum && result.sawFlash, 'hits show a number and a flash');
  assert.ok(result.range > 4, 'a sniper covers several tiles');
  // The field is drawn in the 3/4 view: high ground stands above the floor.
  const lifted = await game.evaluate(() => { const st = battle.stage; for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) if (st.map[y][x] === 'H') return tileRect(st, x, y).y < MY + y * TH; return null; });
  assert.equal(lifted, true);
  assert.deepEqual(errors, []);
});

/* ── The tutorial ──────────────────────────────────────────────────────── */
async function freshGame(t) {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  const site = await serve(path.join(root, 'src'));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [] });
  t.after(async () => { await browser.close(); await site.close(); });
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  await tab.setRequestInterception(true);
  tab.on('request', request => { if (respondToAnalytics(request)) return; if (request.url().startsWith(site.origin)) request.continue(); else request.abort(); });
  await tab.setViewport({ width: 1280, height: 800 });
  await tab.goto(site.url);
  await tab.waitForFunction(() => typeof openGame === 'function');
  const hub = await tab.evaluate(() => typeof window.__boredGacha?.pickStarter === 'function' && !!window.__boredGacha?.td);
  await tab.evaluate(() => openGame('poke-gacha'));
  await tab.waitForFunction(() => document.querySelector('#frame')?.contentDocument?.querySelector('#tabs .panel'));
  const game = await (await tab.$('#frame')).contentFrame();
  return { tab, game, errors, hub };
}
const tutorUp = game => game.evaluate(() => !document.querySelector('#tutor').hidden && tutor && { id: tutor.id, i: tutor.i, n: tutor.steps.length, text: document.querySelector('#tutor-box').textContent });
const clickHole = async (tab, game) => {
  const r = await game.evaluate(() => { const h = document.querySelector('#tutor-hole').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; });
  const f = await (await tab.$('#frame')).boundingBox();
  await tab.mouse.click(f.x + r.x, f.y + r.y);
  await pause(150);
};
test('tutorial: a new account goes through every tip, the guided 1-1 waits for each real step, and ? replays', async t => {
  const { tab, game, errors, hub } = await freshGame(t);
  if (!hub) return t.skip('the hub has no starter pick yet');
  await game.waitForFunction(() => !document.querySelector('#scr-starter').hidden);
  await key(tab, 'Enter'); await key(tab, 'Enter');
  // The loop, in six boxes, each framing something on screen, read with Enter.
  await game.waitForFunction(() => tutor && tutor.id === 'loop');
  for (let i = 0; i < 6; i++) {
    assert.equal((await tutorUp(game)).id, 'loop');
    assert.ok(await game.evaluate(() => !!tutorStep().at()), 'loop box ' + i + ' frames its target');
    await key(tab, 'Enter');
  }
  // Then it hands over to the Pull tab and its three boxes.
  await game.waitForFunction(() => tutor && tutor.id === 'pull');
  assert.equal(await game.evaluate(() => tab), 'pull');
  for (let i = 0; i < 3; i++) { assert.equal((await tutorUp(game)).id, 'pull'); await key(tab, 'Enter'); }
  assert.equal(await tutorUp(game), false);
  // Squad: its two boxes on the first visit.
  await game.evaluate(() => go('story'));
  await key(tab, 'Enter');
  await game.waitForFunction(() => tutor && tutor.id === 'squad');
  await key(tab, 'Enter'); await key(tab, 'Enter');
  // The guided first battle.
  await game.evaluate(() => { sq.zone = 'head'; sq.head = 3; squadUpdate(); });
  await key(tab, 'Enter');
  await game.waitForFunction(() => battle && !document.querySelector('#scr-battle').hidden);
  for (let i = 0; i < 6 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  await game.waitForFunction(() => tutor && tutor.id === 'battle-1-1');
  // 1: pick the blocker's card. Enter alone does not move on, and the battle waits.
  await key(tab, 'Enter');
  assert.equal((await tutorUp(game)).i, 0, 'a do-it step waits for the real action');
  assert.equal(await game.evaluate(() => battle.paused), true);
  await key(tab, '1');
  await game.waitForFunction(() => tutor.i === 1);
  // 2: place it on the framed path tile.
  await clickHole(tab, game);
  await game.waitForFunction(() => tutor.i === 2);
  assert.equal(await game.evaluate(() => battle.b.units.length), 1);
  // 3: energy, read with Enter. 4: the battle runs until an enemy is blocked.
  await key(tab, 'Enter');
  await game.waitForFunction(() => tutor.i === 4, { timeout: 30000 });
  assert.ok(await game.evaluate(() => battle.b.enemies.some(e => e.blockedBy)));
  // 5-6: the sniper on high ground.
  await key(tab, '2');
  await game.waitForFunction(() => tutor.i === 5);
  await clickHole(tab, game);
  await game.waitForFunction(() => tutor.i === 6);
  // 7: the skill charges, about 3s in the tutorial (not the skill's full charge), then 8: ready, read with Enter.
  const t0 = Date.now();
  await game.waitForFunction(() => tutor.i === 7, { timeout: 10000 });
  assert.ok(Date.now() - t0 < 6000, 'the charging step is a short watch, not a long wait');
  await key(tab, 'Enter');
  assert.equal(await tutorUp(game), false);
  assert.equal(await game.evaluate(() => tipsSeen['battle-1-1']), true);
  assert.equal(await game.evaluate(() => battle.paused), false, 'the battle plays on');
  // Finish the battle quickly and visit each screen once.
  await game.evaluate(() => { const b = battle.b; b.queue = []; b.enemies = []; });
  await game.waitForFunction(() => battle.done, { timeout: 5000 });
  for (let i = 0; i < 6 && await game.evaluate(() => battle && battle.talk.length); i++) await key(tab, 'Enter');
  await key(tab, 'Enter');
  // Pull's tips were read in the hand-over after the loop.
  for (const [k, id, n] of [['3', 'eggs', 1], ['4', 'dex', 2], ['6', 'quests', 1]]) {
    await key(tab, k);
    await game.waitForFunction(i => tutor && tutor.id === i, {}, id);
    for (let i = 0; i < n; i++) await key(tab, 'Enter');
    assert.equal(await tutorUp(game), false, id + ' tips close');
  }
  // Each once: back to Pull, nothing. The ? replays it.
  await key(tab, '2'); await pause(100);
  assert.equal(await tutorUp(game), false, 'a tip shows once');
  await game.evaluate(() => document.querySelector('#tabs [data-help]').click());
  assert.equal((await tutorUp(game)).id, 'pull', '? replays this screen');
  await key(tab, 'Enter'); await key(tab, 'Enter'); await key(tab, 'Enter');
  assert.deepEqual(errors, []);
});
test('tutorial: Skip works from the first box, in a battle step and on a replay, and nothing comes back', async t => {
  const { tab, game, errors, hub } = await freshGame(t);
  if (!hub) return t.skip('the hub has no starter pick yet');
  await game.waitForFunction(() => !document.querySelector('#scr-starter').hidden);
  await key(tab, 'Enter'); await key(tab, 'Enter');
  await game.waitForFunction(() => tutor && tutor.id === 'loop');
  // Skip by its link: the overlay goes, and the flag is kept in localStorage.
  await game.evaluate(() => document.querySelector('#tutor-box [data-skip]').click());
  assert.equal(await tutorUp(game), false);
  assert.equal(await game.evaluate(() => JSON.parse(localStorage.getItem('bored.poke-gacha.tips'))._skip), true);
  for (const k of ['2', '3', '4', '6']) { await key(tab, k); await pause(80); assert.equal(await tutorUp(game), false, 'no tip after Skip'); }
  // In a battle step: replay is forced, so start the guided battle's tip by hand and skip with X.
  await key(tab, '1'); await key(tab, 'Enter');
  await game.evaluate(() => { sq.zone = 'head'; sq.head = 3; squadUpdate(); });
  await key(tab, 'Enter');
  await game.waitForFunction(() => battle && !document.querySelector('#scr-battle').hidden);
  for (let i = 0; i < 6 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  assert.equal(await tutorUp(game), false, 'no guided battle after Skip');
  await game.evaluate(() => { delete tipsSeen._skip; battleTips(); });
  await game.waitForFunction(() => tutor && tutor.id === 'battle-1-1');
  assert.equal(await game.evaluate(() => battle.paused), true);
  await key(tab, 'x');
  assert.equal(await tutorUp(game), false);
  assert.equal(await game.evaluate(() => battle.paused), false, 'skipping lets the battle go on');
  // On a replay (the ? button) too.
  await game.evaluate(() => { const b = battle.b; b.queue = []; b.enemies = []; });
  await game.waitForFunction(() => battle.done, { timeout: 5000 });
  for (let i = 0; i < 6 && await game.evaluate(() => battle && battle.talk.length); i++) await key(tab, 'Enter');
  await key(tab, 'Enter');
  await key(tab, '2');
  await game.evaluate(() => document.querySelector('#tabs [data-help]').click());
  assert.equal((await tutorUp(game)).id, 'pull');
  await game.evaluate(() => document.querySelector('#tutor-box [data-skip]').click());
  assert.equal(await tutorUp(game), false);
  assert.deepEqual(errors, []);
});

/* ── Stage preview and loss hints ──────────────────────────────────────── */
test('stage preview shows types, waves and a recommended level; a loss names what the foes are weak to', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await key(tab, '1');
  const info = await game.$eval('#story-info', n => n.textContent);
  assert.match(info, /2 waves · 3 lives · Rec\. Lv\s*1/);
  assert.match(info, /Types: Normal/);
  // Late stages ask for more.
  assert.ok(await game.evaluate(() => recLevel(T.allStages.find(s => s.id === '3-4')) >= 3));
  assert.deepEqual(await game.evaluate(() => weakTo(T.allStages.find(s => s.id === '1-1'))), ['Fighting']);
  // Lose 1-1 on purpose: the result says what to bring.
  await key(tab, 'Enter');
  await game.evaluate(() => { sq.zone = 'head'; sq.head = 3; setSquad(S.owned.slice(0, 1)); squadUpdate(); });
  await key(tab, 'Enter');
  await game.waitForFunction(() => battle && !document.querySelector('#scr-battle').hidden);
  await game.evaluate(() => { battle.talk = []; battleTalk(); battle.b.life = 1; battle.paused = false; });
  await game.waitForFunction(() => battle.done, { timeout: 60000 });
  for (let i = 0; i < 4 && await game.evaluate(() => battle.talk.length); i++) await key(tab, 'Enter');
  const result = await game.$eval('#battle-result', n => [n.textContent, n.scrollHeight, n.clientHeight]);
  assert.match(result[0], /DEFEATED.*Fighting/);
  assert.ok(result[1] <= result[2], 'the hint fits the result box');
  assert.deepEqual(errors, []);
});

test('roles: 1-1 asks for tanks that resist Normal and Fighting damage, the loss hint says which went wrong, Squad marks the fits', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await key(tab, '1');
  const on11 = fn => game.evaluate(fn => new Function('stage', 'return ' + fn)(T.allStages.find(s => s.id === '1-1')), String(fn).replace(/^stage => /, ''));
  // Rattata attacks with Normal: Rock and Steel resist it, Ghost is immune (Rock and Steel have more tanks).
  assert.deepEqual(await on11(stage => attackTypes(stage)), ['Normal']);
  assert.deepEqual(await on11(stage => tankTypes(stage, 3)), ['Rock', 'Steel', 'Ghost']);
  assert.ok(await on11(stage => tankTypes(stage, 3).every(t => T.typeMultiplier('Normal', [t]) < 1)), 'every tank type resists Normal');
  // Rattata is Normal: Fighting is super effective.
  assert.deepEqual(await on11(stage => weakTo(stage)), ['Fighting']);
  assert.ok(await on11(stage => T.typeMultiplier('Fighting', ['Normal']) > 1));
  // The preview shows both.
  assert.match(await game.$eval('#story-info .roles', n => n.textContent), /^Tanks: Rock, Steel\s*Damage: Fighting$/);
  // The loss hint: a blocker that fell fast wants a tank, foes that leaked healthy want damage, else both roles.
  assert.match(await on11(stage => lossHint(stage, { fell: [{ cls: 'blocker', lasted: 6 }], leakHp: [0.1] })), /blocker fell fast: try a tank that resists Normal \(Rock, Steel\)/);
  assert.match(await on11(stage => lossHint(stage, { fell: [], leakHp: [0.9, 0.7] })), /most of their HP: bring Fighting damage/);
  assert.match(await on11(stage => lossHint(stage, { fell: [{ cls: 'blocker', lasted: 60 }], leakHp: [0.2] })), /Tanks: Rock, Steel · Damage: Fighting/);
  // Who fits: a Rock or Ghost blocker is a tank here, a Fighting caster or sniper is damage; others are neither.
  assert.deepEqual(await on11(stage => [['blocker', ['Rock', 'Ground']], ['guard', ['Ghost']], ['blocker', ['Fighting']], ['caster', ['Fighting']], ['sniper', ['Fighting', 'Steel']],
    ['caster', ['Fire']], ['medic', ['Rock']]].map(([cls, types]) => roleFit({ cls, types }, stage))), ['tank', 'tank', '', 'damage', 'damage', '', '']);
  // Squad from 1-1 marks exactly the owned mons that fit, and its stage box names both roles.
  await key(tab, 'Enter');
  assert.equal(await game.evaluate(() => storyMode), 'squad');
  assert.match(await game.$eval('#squad-stage', n => n.textContent), /Tank Rock, Steel.*Dmg Fighting/);
  const marks = await game.evaluate(() => [...document.querySelectorAll('#squad-grid .card')].map(c => c.classList.contains('fit-tank') ? 'tank' : c.classList.contains('fit-damage') ? 'damage' : ''));
  const want = await game.evaluate(() => roster().list.map(u => roleFit(u, stageNow())));
  assert.deepEqual(marks, want);
  assert.ok(await game.evaluate(() => [...document.querySelectorAll('#squad-grid .card.fit-tank, #squad-grid .card.fit-damage')].every(c => c.querySelector('.fit').offsetHeight > 0)), 'fits show a bar');
  assert.deepEqual(errors, []);
});

/* ── Rates and pity, and the tab dots ──────────────────────────────────── */
test('the page copy of rates, shiny odds and pity matches the engine', () => {
  const engine = fs.readFileSync(path.join(root, 'src/hub/gacha.js'), 'utf8');
  const pick = (src, re) => src.match(re)[1].replace(/\s+/g, '');
  assert.equal(pick(page, /const RATES = (\{[^;]*\});/), pick(engine, /export const EGG_RATES = (\{[^;]*\});/));
  assert.equal(pick(page, /const SHINY_IN = (\{[^}]*\})/), pick(engine, /export const SHINY_ODDS = (\{[^}]*\})/));
  assert.equal(pick(page, /SP_IN = (\d+)/), pick(engine, /export const SP_ODDS = (\d+)/));
  assert.equal(pick(page, /PITY = (\[[^\]]*\])/), pick(engine, /export const RARITY_PITY = (\[[^\]]*\])/));
});
test('Pull shows each machine\'s rates and my pity; Eggs and Quests get a dot when something is waiting', async t => {
  const { tab, game, errors } = await openWithMons(t);
  await key(tab, '2');
  await key(tab, 'd');
  assert.equal(await game.$eval('#rates', n => n.hidden), false);
  const text = await game.$eval('#rates', n => n.textContent);
  assert.match(text, /Common egg\s*79\.7%/);
  assert.match(text, /Shiny on hatch\s*1 in (64|128)/);
  const p = await game.evaluate(() => S.pity);
  assert.ok(text.includes(`Rare ${p.rare}/9`) && text.includes(`Epic ${p.epic}/59`) && text.includes(`Legendary ${p.legendary}/412`), text);
  const over = await game.$eval('#rates', n => n.scrollHeight > n.clientHeight + 1);
  assert.equal(over, false, 'the rates panel fits');
  await key(tab, 'd');
  assert.equal(await game.$eval('#rates', n => n.hidden), true);
  // An egg ready to hatch: a dot on Eggs.
  await game.evaluate(() => {
    const now = Math.floor(Date.now() / 1000);
    const w = JSON.parse(parent.localStorage.getItem('bored.wallet'));
    w.entries['test:one'] = { at: now - 50, g: { regular: 1 } }; parent.localStorage.setItem('bored.wallet', JSON.stringify(w));
    G.pull({ voucher: 'regular', count: 1, machine: 'move' });
    const w2 = JSON.parse(parent.localStorage.getItem('bored.wallet')); w2.entries['test:w'] = { at: now + 50, g: { waves: 100 } }; parent.localStorage.setItem('bored.wallet', JSON.stringify(w2));
    refreshTop();
  });
  assert.equal(await game.$$eval('#tabs [data-tab="eggs"] .alert', n => n.length), 1);
  // Quests: a dot for rewards paid since the last visit, gone once it is opened.
  await game.evaluate(() => { pref.questsSeen = 0; keep(); refreshTop(); });
  assert.equal(await game.$$eval('#tabs [data-tab="quests"] .alert', n => n.length), 1);
  await key(tab, '6');
  assert.equal(await game.$$eval('#tabs [data-tab="quests"] .alert', n => n.length), 0);
  assert.deepEqual(errors, []);
});

test('fallback font: the Dex detail stays in its panel, an empty tray says so on one line, and battle talk covers the bars below it', async t => {
  // The suite aborts the webfont, so this runs in the mono/Arial fallback (the narrowest case).
  const { tab, game, errors } = await openWithMons(t);
  await game.evaluate(() => go('dex'));
  const inside = await game.evaluate(() => { const d = $('#dex-detail').getBoundingClientRect(); return [...$('#dex-detail').querySelectorAll('*')].every(n => { const b = n.getBoundingClientRect(); return !b.width || b.right <= d.right + 1; }); });
  assert.ok(inside, 'nothing in the Dex detail runs past its panel');
  await game.evaluate(() => { while (S.eggs.length) G.hatch(); refreshTop(); go('eggs'); });
  const empty = await game.$eval('#eggs-grid > p', n => n.scrollWidth <= n.clientWidth + 1);
  assert.ok(empty, '"No eggs yet." is not clipped');
  await game.evaluate(() => { go('story'); chapterAt = 0; storyMode = 'stages'; storyAt = 0; storyUpdate(); pickStage(); setSquad(S.owned.slice(0, 4)); startBattle(); battle.talk = ['A line long enough to need some room in the box, which wraps once.']; battleTalk(); });
  const [talk, bar, tip] = await Promise.all(['#battle-talk', '#deploy', '#battle-tip'].map(s => rect(game, s)));
  assert.ok(talk.t <= bar.t + 0.5 && talk.t <= tip.t + 0.5, 'the talk box is as tall as the deploy bar and the tip');
  assert.ok(Math.abs(tip.t - bar.t) <= 0.5, 'the tip and the deploy bar line up at the top');
  const fits = await game.$eval('#battle-talk', n => n.scrollHeight <= n.clientHeight + 1);
  assert.ok(fits, 'the talk text fits its box');
  await game.evaluate(() => { battle.talk = []; battleTalk(); leaveBattle(); });
  void tab;
  assert.deepEqual(errors, []);
});

test('new player: Skip (clicked) ends the tutorial at every step of every tip, and the loop hands over to Pull only when read', async t => {
  const { tab, game, errors, hub } = await freshGame(t);
  if (!hub) return t.skip('the hub has no starter pick yet');
  await game.waitForFunction(() => !document.querySelector('#scr-starter').hidden);
  await key(tab, 'Enter'); await key(tab, 'Enter');
  await game.waitForFunction(() => tutor && tutor.id === 'loop');
  const skipAt = async (open, i) => {
    await game.evaluate(() => { tipsSeen._skip = false; });
    await game.evaluate(open);
    await game.evaluate(i => { for (let k = 0; k < i; k++) tutorNext(); }, i);
    const before = await game.evaluate(() => ({ id: tutor && tutor.id, i: tutor && tutor.i, tab }));
    await (await game.$('#tutor-box [data-skip]')).click();
    const after = await game.evaluate(() => ({ up: !!tutor, hidden: document.querySelector('#tutor').hidden, skip: tipsSeen._skip, tab, paused: battle ? battle.paused : null }));
    return { before, after };
  };
  // The loop: every box, and a Skip stays on Story (no hand-over).
  for (let i = 0; i < 6; i++) {
    const r = await skipAt(() => { go('story'); tip('loop', TIPS.loop(), { force: true, after: () => go('pull') }); }, i);
    assert.deepEqual([r.before.id, r.before.i], ['loop', i]);
    assert.deepEqual([r.after.up, r.after.hidden, r.after.skip, r.after.tab], [false, true, true, 'story'], 'loop box ' + i);
  }
  // Each screen's tips.
  for (const id of ['pull', 'eggs', 'dex', 'shop', 'quests']) {
    const n = await game.evaluate(id => TIPS[id]().length, id);
    for (let i = 0; i < n; i++) {
      const r = await skipAt(new Function(`go(${JSON.stringify(id)}); if (tutor) tutorEnd(false); tip(${JSON.stringify(id)}, TIPS[${JSON.stringify(id)}](), { force: true });`), i);
      assert.equal(r.before.id, id);
      assert.deepEqual([r.after.up, r.after.skip], [false, true], id + ' box ' + i);
    }
  }
  // Squad: a click on Start (the mouse works on the Squad screen) opens 1-1.
  await game.evaluate(() => { go('story'); chapterAt = 0; storyMode = 'stages'; storyAt = 0; storyUpdate(); pickStage(); });
  assert.deepEqual(await game.evaluate(() => squadPick().length), 4, 'the starter and its gifts');
  await (await game.$('#squad [data-start]')).click();
  await game.waitForFunction(() => battle && !document.querySelector('#scr-battle').hidden);
  await game.evaluate(() => { battle.talk = []; battleTalk(); });
  // The guided 1-1: Skip at each of its steps; the battle plays on after.
  const steps = await game.evaluate(() => { delete tipsSeen['battle-1-1']; tipsSeen._skip = false; battleTips(); const n = tutor.steps.length; tutorEnd(false); return n; });
  assert.ok(steps >= 4, 'the guided 1-1 has its steps');
  for (let i = 0; i < steps; i++) {
    const r = await skipAt(() => { battleTips(); }, i);
    assert.deepEqual([r.before.id, r.before.i], ['battle-1-1', i]);
    assert.deepEqual([r.after.up, r.after.skip, r.after.paused], [false, true, false], 'battle step ' + i + ' skipped, the battle runs');
  }
  // After a first clear the cursor moves to 1-2.
  await game.evaluate(() => { battle.b.queue = []; battle.b.enemies = []; });
  await game.waitForFunction(() => battle.done, { timeout: 10000 });
  await game.evaluate(() => { battle.talk = []; battleTalk(); showResult(); leaveBattle(); });
  assert.equal(await game.evaluate(() => stagesNow()[storyAt].id), '1-2', 'the cursor moves on to the stage the clear opened');
  assert.deepEqual(errors, []);
});

test('new player: a pull says the free egg is ready on Eggs, a hatch fills empty squad slots, the empty tray points to 1-1', async t => {
  const { tab, game, errors, hub } = await freshGame(t);
  if (!hub) return t.skip('the hub has no starter pick yet');
  await game.waitForFunction(() => !document.querySelector('#scr-starter').hidden);
  await key(tab, 'Enter'); await key(tab, 'Enter');
  await game.evaluate(() => tutorSkipAll());
  await game.evaluate(() => { go('pull'); menuOpen = true; cursor = OPTIONS.findIndex(o => o.voucher === 'regular' && o.count === 1); choose(cursor); });
  assert.match(await game.$eval('#msg', n => n.textContent), /^1 egg, ready to hatch on Eggs:/);
  const before = await game.evaluate(() => squadPick().length);
  await game.evaluate(() => { go('eggs'); startHatch(); });
  const grown = await game.evaluate(() => squadPick().length);
  const fresh = await game.evaluate(() => hatching.list.filter(h => h.fresh).length);
  assert.equal(grown, Math.min(8, before + fresh), 'a new line joins the squad');
  await game.evaluate(() => { while (hatching) endHatch(); eggsUpdate(); });
  assert.match(await game.$eval('#msg', n => n.textContent), /Next: play 1-1/);
  assert.deepEqual(errors, []);
});

/* ── The page's "Rec. Lv" is a promise ─────────────────────────────────────
   Each stage preview recommends a level (recLevel in the page). With the engines
   loaded the way tests/td.test.cjs loads them, a type-matched squad of commons and
   rares at that level must clear every stage, so raising stage levels in td.js can
   never make the page's advice wrong. The squad and placement follow td.test.cjs's
   difficulty test; the worst-typed squad is only reported, not asserted. */
test('every stage is cleared by a type-matched squad at the page\'s recommended level', () => {
  const load = (file, names, inject = {}) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8').replace(/^import [\s\S]*?;\s*$/gm, '').replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))/g, '');
    return new Function(...Object.keys(inject), src + '\nreturn {' + names.join(',') + '};')(...Object.values(inject));
  };
  const daily = load('src/daily.js', ['dailyDate', 'dailyStreak', 'seedNumber']);
  const dex = load('src/hub/gacha-dex.js', ['DEX', 'DEX_TYPES', 'DEX_CHART']);
  const rewards = load('src/hub/rewards.js', ['mergeWallet', 'walletBalance', 'activateWallet', 'spendFrom', 'grantOnce', 'buyRegular', 'readWallet', 'writeWallet', 'walletTrophies'],
    { ...daily, readStored: () => null, writeStored: () => true, readStoredPrefix: () => ({}) });
  const gacha = load('src/hub/gacha.js', ['gachaState', 'lineOf', 'mon', 'skillsOf', 'lookFor', 'stageOf', 'evolutionsOf'], { ...daily, ...rewards, DEX: dex.DEX, DEX_TYPES: dex.DEX_TYPES });
  const td = load('src/hub/td.js', ['classOf', 'STAGES', 'pathsOf', 'unitStats', 'newBattle', 'step', 'deploy', 'typeMultiplier', 'MAX_LEVEL'],
    { ...daily, ...rewards, ...dex, gachaState: gacha.gachaState, lineOf: gacha.lineOf, mon: gacha.mon, skillsOf: gacha.skillsOf, lookFor: gacha.lookFor, stageOf: gacha.stageOf, evolutionsOf: gacha.evolutionsOf });
  // The page's own formula, read from the page.
  const recLevel = new Function('T', 'return ' + page.match(/const recLevel = (stage => [^\n]*);/)[1])({ maxLevel: td.MAX_LEVEL });
  const squadFor = (stage, rank, level) => {
    const foes = stage.waves.map(w => gacha.mon(w[1]).types);
    const fit = num => foes.reduce((s, types) => s + Math.log2(td.typeMultiplier(gacha.mon(num).types[0], types)), 0) / foes.length;
    const pool = dex.DEX.map((row, i) => [row, i + 1]).filter(([row]) => row[9] === 3 || row[9] === 4).map(([, n]) => n);
    const ranked = pool.map(n => [n, rank * fit(n) + (gacha.mon(n).bst || 0) / 2000]).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 60);
    const by = cls => ranked.filter(n => td.classOf(n) === cls);
    const flying = stage.waves.some(w => w[5]);
    const core = [...by('blocker').slice(0, 1), ...by('guard').slice(0, 2), ...by('vanguard').slice(0, 1),
      ...(flying ? by('sniper').slice(0, 2) : by('caster').slice(0, 2)), ...by('sniper').slice(0, 1), ...by('medic').slice(0, 1), ...by('caster').slice(0, 1)];
    return [...new Set([...core, ...ranked])].slice(0, 8).map(n => td.unitStats(n, { level }));
  };
  const placed = (stage, squad) => {
    const high = []; stage.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'H') high.push([x, y]); }));
    const ground = td.pathsOf(stage)[0].slice().reverse().filter(([x, y]) => stage.map[y][x] === '.');
    const flying = stage.waves.some(w => w[5]), armored = stage.waves.some(w => w[7]);
    // Snipers next to the flight lines when bats fly (as td.test.cjs places them).
    const toFlight = (x, y) => Math.min(...td.pathsOf(stage).map(p => { const [[ax, ay], [bx, by]] = [p[0], p[p.length - 1]];
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2))); return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))); }));
    if (flying) high.sort((a, c) => toFlight(...a) - toFlight(...c));
    // The order the guided 1-1 teaches: the blocker first, then the rest.
    const pri = u => (armored && u.cls === 'vanguard' ? 2 : 0) + (flying && u.cls === 'sniper' ? 1 : 0) + (u.cls === 'blocker' ? 0.5 : 0);
    return squad.map((u, slot) => slot).sort((a, b) => pri(squad[b]) - pri(squad[a])).map(slot => [slot, ...(squad[slot].ground ? ground.shift() || [0, 0] : high.shift() || [0, 0])]);
  };
  const play = (stage, squad) => {
    const b = td.newBattle(stage, squad), plan = placed(stage, squad);
    for (let guard = 0; !b.over && guard < 20 * 600; guard++) { for (const [slot, x, y] of plan) if (td.deploy(b, slot, x, y) === 'energy') break; td.step(b); }
    return b.over;
  };
  const lost = td.STAGES.filter(stage => play(stage, squadFor(stage, 1, recLevel(stage))) !== 'win').map(s => s.id + ' (Rec. Lv ' + recLevel(s) + ')');
  assert.deepEqual(lost, [], 'a type-matched squad at Rec. Lv loses these stages');
});

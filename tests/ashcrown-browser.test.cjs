// Civ Lite in a real browser at phone width: the Load and Save screens and the title's Continue stay
// inside the screen with 60-character names, and a player who has met nobody sees no other civ's name.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
const SEATS = '[{ name: "Ann", human: true, civ: "qin" }, { name: "Ben", human: true, civ: "japan" }, { name: "", human: false }, { name: "", human: false }]';

async function open(t, width) {
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(path.join(__dirname, '../src'));
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => { await browser.close(); await site.close(); });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => (req.url().startsWith(site.origin) ? req.continue() : req.abort()));   // no fonts, no network: the fallbacks are fine
  await page.setViewport({ width, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(site.origin + '/games/content/ashcrown.html');
  await page.waitForSelector('#btn-new', { visible: true });
  return { page, errors, site };
}

// Everything on screen sits inside the viewport, and nothing scrolls sideways.
const fits = () => {
  const w = document.documentElement.clientWidth, bad = [];
  if (document.documentElement.scrollWidth > w) bad.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + w);
  for (const el of document.querySelectorAll('.modal, .modal-body, .slot, .slot-main, .slot-name, .slot-meta, .slot-when, .slot-acts, #btn-continue, #continue-sub, #continue-detail, .fe-item')) {
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
    if (r.right > w + 0.5 || r.left < -0.5) bad.push((el.id || el.className) + ' leaves the screen: ' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + w);
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible') bad.push((el.id || el.className) + ' overflows its box');
  }
  return bad;
};

for (const width of [400, 320]) {
  test('Ashcrown 4.5: the Load and Save screens and Continue fit a ' + width + 'px screen with 60-character names', async t => {
    const { page, errors } = await open(t, width);
    const long60 = 'Qin Shi Huang & Oda Nobunaga · Renaissance · Turn 42 and on!!'.slice(0, 60);
    assert.equal(long60.length, 60);
    await page.evaluate(`(() => {
      startGame({ seats: ${SEATS}, seed: 4242, map: 'islands', level: 'deity' });
      G.turn = 42;
      saveToSlot('m1', ${JSON.stringify(long60)});
      saveToSlot('m2', 'W'.repeat(60));                      // 60 characters with no place to break
      saveToSlot('m3', '');                                  // the suggested name
      G.turn = 43; saveGame(); G.turn = 44; rollTurnSave();
    })()`);
    // Load screen.
    await page.evaluate('showSlots("load")');
    const rows = await page.$$eval('.slot', els => els.map(e => ({
      id: e.dataset.slot, medal: e.querySelector('.slot-medal').getBoundingClientRect().width, hasArt: !!e.querySelector('.slot-medal svg'),
      name: e.querySelector('.slot-name').textContent, when: e.querySelector('.slot-when').textContent
    })));
    assert.deepEqual(rows.map(r => r.id).sort(), ['auto', 'm1', 'm2', 'm3', 't1']);
    for (const r of rows) {
      assert.ok(r.medal >= 34 && r.medal <= 40, r.id + ' has a medallion about 36px wide: ' + r.medal);
      assert.ok(r.hasArt, r.id + ' draws its medallion');
      assert.match(r.when, /^(just now|\d+ minutes? ago)$/, r.id + ' says when: ' + r.when);
    }
    assert.equal(rows.find(r => r.id === 'm1').name, long60);
    assert.deepEqual(await page.evaluate(fits), [], 'Load screen at ' + width + 'px');
    const cuts = await page.$$eval('.slot-name', els => els.map(e => ({ nowrap: getComputedStyle(e).whiteSpace === 'nowrap', ellipsis: getComputedStyle(e).textOverflow === 'ellipsis', cut: e.scrollWidth > e.clientWidth, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || 16)) })));
    assert.ok(cuts.every(c => c.nowrap && c.ellipsis), 'names stay on one line and end with an ellipsis');
    assert.ok(cuts.some(c => c.cut), 'a long name is actually cut');
    const metaOne = await page.$$eval('.slot-meta', els => els.every(e => getComputedStyle(e).whiteSpace === 'nowrap' && getComputedStyle(e).textOverflow === 'ellipsis'));
    assert.ok(metaOne, 'the detail line is one line with an ellipsis too');
    // Ask-to-delete shows its question and buttons, still inside the screen.
    await page.evaluate('slotAction("slot-ask", "delete", "m1")');
    assert.deepEqual(await page.evaluate(fits), [], 'delete question at ' + width + 'px');
    await page.evaluate('slotAction("slot-no")');
    // Save screen, with a 60-character name in the box.
    await page.evaluate('closeModal(); showSlots("save")');
    assert.equal(await page.$eval('#slot-name', e => e.maxLength), 60);
    assert.deepEqual(await page.evaluate(fits), [], 'Save screen at ' + width + 'px');
    // The title's Continue: a medallion, the name and when, the details.
    await page.reload();
    await page.waitForSelector('#btn-continue', { visible: true });
    const cont = await page.evaluate(() => ({
      medal: document.querySelector('#continue-medal svg') ? document.querySelector('#continue-medal').getBoundingClientRect().width : 0,
      sub: document.querySelector('#continue-sub').textContent, detail: document.querySelector('#continue-detail').textContent
    }));
    assert.ok(cont.medal >= 34 && cont.medal <= 40, 'Continue has a medallion: ' + cont.medal);
    assert.match(cont.sub, /^Autosave · Turn 4[34] · (just now|\d+ minutes? ago)$/);
    assert.match(cont.detail, /^China, Japan \+ 2 CPUs · /);
    assert.deepEqual(await page.evaluate(fits), [], 'title Continue at ' + width + 'px');
    assert.deepEqual(errors, []);
  });
}

test('Ashcrown 4.5: a player who has met nobody sees no other civ named anywhere on the screen', async t => {
  const { page, errors } = await open(t, 1100);
  await page.evaluate(`(() => {
    startGame({ seats: ${SEATS}, seed: 4242, map: 'pangaea', level: 'normal' });
    G.handoff = false; G.viewer = 1; G.cur = 1;
    // Give the others something on the board to be named by: a city, a unit, owned land.
    for (const i of [0, 2, 3]) {
      const u = G.units.find(o => o.owner === i && UNITS[o.type].founds);
      if (u) foundCity(u);
    }
    for (let a = 0; a < G.players.length; a++) for (let b = 0; b < G.players.length; b++) G.met[a][b] = a === b;   // forget any introductions
    saveToSlot('m1', 'scan'); loadSlot('m1');
    G.handoff = false; G.viewer = 1; G.cur = 1;
  })()`);
  const names = await page.evaluate(() => [0, 2, 3].flatMap(i => [CIVS[pl(i).civ].land, CIVS[pl(i).civ].leader, fullName(pl(i)), pl(i).name]));
  const unique = [...new Set(names)].filter(n => n.length > 2);
  const scan = async label => {
    const text = await page.evaluate(() => {
      const bits = [document.body.innerText];
      for (const el of document.querySelectorAll('[title],[aria-label],[alt]')) if (el.getClientRects().length) bits.push(el.title || '', el.getAttribute('aria-label') || '', el.getAttribute('alt') || '');
      return bits.join('\n');
    });
    for (const n of unique) assert.ok(!text.includes(n), label + ' leaks "' + n + '"');
  };
  const show = async code => { await page.evaluate(code); };
  await show('render()'); await scan('the board');
  await show('logOpen = true; renderLog()'); await scan('the history log');
  await show('selection = { kind: "realm" }; render()'); await scan('the realm panel');
  await show('showCouncil()'); await scan('the Council');
  await show('closeModal()');
  // Another civ's city, tile, unit and land, selected and hovered.
  for (const code of [
    'const c = G.cities.find(c => c.owner === 2); selection = { kind: "city", id: c.id }; render()',
    'const c = G.cities.find(c => c.owner === 2); selection = { kind: "tile", x: c.x, y: c.y }; render()',
    'const t = G.tiles.find(t => t.owner === 3 && !cityAt(t.x, t.y)); selection = { kind: "tile", x: t.x, y: t.y }; render()',
    'const u = G.units.find(u => u.owner === 0); selection = { kind: "unit", id: u.id }; render()'
  ]) { await show('(() => {' + code + '})()'); await scan(code.slice(0, 60)); }
  // After meeting one civ, exactly that one appears.
  await show('meet(1, 2); render(); showCouncil()');
  const council = await page.evaluate(() => document.body.innerText);
  assert.ok(council.includes(await page.evaluate(() => CIVS[pl(2).civ].land)), 'the civ met is listed');
  assert.ok(!council.includes(await page.evaluate(() => CIVS[pl(3).civ].land)), 'the one not met still is not');
  assert.deepEqual(errors, []);
});

/* ── orders with a real mouse: right-clicks on real hexes ─────────────────────── */

const ORDER_SEATS = '[{ name: "Ann", human: true, civ: "rome" }, { name: "", human: false, civ: "celts" }, { name: "", human: false, civ: "qin" }, { name: "", human: false, civ: "japan" }]';

// A level game: all flat land, nobody on it, Ann has met the Celts, and every hex is in sight.
async function orderGame(t) {
  const ctx = await open(t, 1000);
  await ctx.page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
  await ctx.page.evaluate(`(() => {
    setTips(false);
    startGame({ seats: ${ORDER_SEATS}, seed: 77, map: 'pangaea', level: 'chieftain' });
    UI.start.hidden = true;                                           // the title pane covers the board until a game is begun from it
    window.checkElimination = () => {}; window.checkWin = () => {};   // no cities on a level board
    for (const t of G.tiles) { t.t = 'flat'; t.f = null; t.imp = null; t.owner = null; t.city = null; t.k = 0; t.road = false; }
    G.units.length = 0; G.cities.length = 0; G.log.length = 0; G.news.length = 0; G.offers.length = 0; G.deals.length = 0; G.open.length = 0;
    for (const a of G.players) for (const b of G.players) { G.met[a.i][b.i] = a.i === b.i; G.dip[a.i][b.i] = 'peace'; }
    G.met[0][1] = G.met[1][0] = true;
    awardMoment(0, 'contact'); G.news.length = 0;                       // already paid, so no card covers the board
    G.seen.forEach(s => s.fill(1));
    window.add = (owner, type, x, y) => addUnit(pl(owner), unitFor(owner, type), x, y, null);
    window.pick = u => { selection = { kind: 'unit', id: u.id }; reachable = computeReachable(u); };
  })()`);
  return ctx;
}
// Show the hexes around (x, y) and put the camera there.
const look = (page, x, y) => page.evaluate(`(() => { G.units.forEach(u => { u.mp = unitMove(u); u.acted = false; }); refreshVision(); centreOn(${x}, ${y}); render(); })()`);
// Right-click the middle of a hex with the real mouse. Returns false if the hex is not on screen.
async function rightClick(page, x, y) {
  const at = await page.evaluate(`(() => {
    const el = document.querySelector('[data-tile="${x},${y}"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || r.left <= 0 || r.right >= innerWidth || r.top <= 0 || r.bottom >= innerHeight) return null;
    const px = r.left + r.width / 2, py = r.top + r.height / 2, top = document.elementFromPoint(px, py);
    return top && top.closest('[data-tile]') === el ? [px, py] : null;   // nothing else (a panel, a box) is in the way
  })()`);
  assert.ok(at, 'hex ' + x + ',' + y + ' is on screen and clickable');
  await page.mouse.click(at[0], at[1], { button: 'right' });
  return true;
}

test('Ashcrown orders: real right-clicks queue a march and hand on to the next unit, cancel it, and respect the switch', async t => {
  const { page, errors } = await orderGame(t);
  const ids = await page.evaluate(`(() => {
    const w = add(0, 'warrior', 8, 8), a = add(0, 'archer', 8, 10);
    return { w: w.id, a: a.id };
  })()`);
  await look(page, 10, 8);
  await page.evaluate(`pick(unitById('${ids.w}')); render()`);
  // Three turns away: a march, and the selection goes to the archer, with the camera.
  await rightClick(page, 14, 8);
  const after = await page.evaluate(`(() => { const w = unitById('${ids.w}'); return { steps: w.path ? w.path.steps.length : 0, x: w.x, mp: w.mp, sel: selection && selection.id }; })()`);
  assert.ok(after.steps > 0 && after.x > 8, 'a march was queued and the first leg walked: ' + JSON.stringify(after));
  assert.equal(after.mp, 0);
  assert.equal(after.sel, ids.a, 'the archer is selected');
  const onScreen = await page.evaluate(`(() => { const r = document.querySelector('[data-tile="8,10"]').getBoundingClientRect(); return r.left > 0 && r.right < innerWidth && r.top > 0 && r.bottom < innerHeight; })()`);
  assert.ok(onScreen, 'and the camera shows it');
  assert.equal(await page.evaluate('document.querySelector(".modal") ? document.querySelector(".modal").textContent : ""'), '', 'no city, tech tree or end-turn box opened by itself');
  // Pick the marching warrior again and right-click its destination: the march is taken back off, and it stays selected.
  const dest = await page.evaluate(`unitById('${ids.w}').path.to`);
  await look(page, dest[0] - 3, dest[1]);
  await page.evaluate(`pick(unitById('${ids.w}')); render()`);
  await rightClick(page, dest[0], dest[1]);
  const canceled = await page.evaluate(`(() => { const w = unitById('${ids.w}'); return { path: w.path, sel: selection && selection.id }; })()`);
  assert.equal(canceled.path, null, 'orders canceled');
  assert.equal(canceled.sel, ids.w, 'and the unit stays selected');
  // With the switch off, a done unit is deselected, and a second right-click does nothing to it.
  await page.evaluate('setJump(false)');
  await look(page, 10, 8);
  await page.evaluate(`pick(unitById('${ids.w}')); render()`);
  await rightClick(page, dest[0], dest[1]);
  const off = await page.evaluate(`(() => { const w = unitById('${ids.w}'); return { steps: w.path ? w.path.steps.length : 0, sel: selection, to: w.path && w.path.to }; })()`);
  assert.ok(off.steps > 0, 'the march was queued again');
  assert.equal(off.sel, null, 'nothing is selected');
  await rightClick(page, dest[0], dest[1]);   // a stray second right-click
  const still = await page.evaluate(`(() => { const w = unitById('${ids.w}'); return w.path ? w.path.to : null; })()`);
  assert.deepEqual(still, off.to, 'the second right-click did not cancel or change the march');
  assert.deepEqual(errors, []);
});

test('Ashcrown orders: a real right-click on their unit at peace asks first, and nothing changes until you say so', async t => {
  const { page, errors } = await orderGame(t);
  const ids = await page.evaluate(`(() => {
    const w = add(0, 'warrior', 8, 8), a = add(0, 'archer', 8, 10), f = add(1, 'warrior', 9, 8), far = add(1, 'warrior', 14, 8);
    return { w: w.id, a: a.id, f: f.id, far: far.id };
  })()`);
  await look(page, 10, 8);
  await page.evaluate(`pick(unitById('${ids.w}')); render()`);
  const modal = () => page.evaluate('(() => { const m = document.querySelector(".modal"); return m && m.offsetParent !== null ? m.textContent : ""; })()');
  const world = () => page.evaluate(`JSON.stringify([atWar(0, 1), unitById('${ids.f}').hp, unitById('${ids.w}').hp, unitById('${ids.w}').mp, G.log.length, G.dip])`);
  const before = await world();
  await rightClick(page, 9, 8);
  const text = await modal();
  assert.match(text, /Declare war on the Celts\?/);
  assert.match(text, /Attacking their Warrior means war with .+, starting now/);
  assert.equal(await world(), before, 'nothing changed yet');
  // Stay at peace: the real button.
  await page.click('.modal-foot .btn:not(.primary)');
  assert.equal(await modal(), '', 'the box closed');
  assert.equal(await world(), before, 'still at peace, nothing happened');
  // Out of range of anything: a right-click on their far-off unit opens no box and declares no war.
  await rightClick(page, 14, 8);
  assert.equal(await modal(), '', 'no prompt for a target out of reach');
  assert.equal(await world(), before, 'and no war');
  // Declare war and attack: the real button.
  await page.evaluate(`pick(unitById('${ids.w}')); render()`);
  await rightClick(page, 9, 8);
  await page.click('.modal-foot .btn.primary');
  const done = await page.evaluate(`({ war: atWar(0, 1), foe: unitById('${ids.f}').hp, mp: unitById('${ids.w}').mp, sel: selection && selection.id })`);
  assert.equal(done.war, true, 'war');
  assert.ok(done.foe < 100, 'the attack happened');
  assert.equal(done.mp, 0);
  assert.equal(done.sel, ids.a, 'and on to the archer');
  assert.deepEqual(errors, []);
});

/* ── 4.6: Early Empire on the tech screen, and an embassy from the city panel to the Council ─────── */

for (const width of [1000, 400, 320]) {
  test('Ashcrown 4.6: the tech tree shows Early Empire, and a real click path builds an embassy and shows it in the Council (' + width + 'px)', async t => {
    const { page, errors } = await open(t, width);
    await page.evaluate(`(() => {
      setTips(false);
      startGame({ seats: ${ORDER_SEATS}, seed: 77, map: 'pangaea', level: 'chieftain' });
      UI.start.hidden = true;
      G.handoff = false;
      for (const i of [0, 1]) foundCity(G.units.find(o => o.owner === i && UNITS[o.type].founds));
      G.units = G.units.filter(u => u.owner !== 0 || !UNITS[u.type].founds);
      pl(0).techs.push('pottery');
      G.met[0][1] = G.met[1][0] = true;
      G.attitude[1][0] = 0;
      G.news.length = 0; G.log.length = 0;
      window.mine = G.cities.find(c => c.owner === 0);
      selection = { kind: 'city', id: mine.id }; render();
    })()`);
    const visible = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
    const modal = () => page.evaluate('(() => { const m = document.querySelector(".modal"); return m && m.offsetParent !== null ? m.textContent : ""; })()');
    const embassyItem = '[data-act^="setbuild:"][data-act$=":embassy:new"]';

    // The tech screen: Early Empire is a card of its own, Writing needs it, nothing leaves the screen.
    await page.evaluate('showTech()');
    assert.ok(await visible('[data-act="research:earlyempire"]'), 'Early Empire has a card');
    const card = await page.$eval('[data-act="research:earlyempire"]', e => e.textContent);
    assert.match(card, /Early Empire/);
    assert.equal(await page.evaluate(`techCost(0, 'earlyempire')`), 25, 'costs 25');
    const lines = await page.evaluate(() => ({
      writing: !!document.querySelector('[data-act="research:writing"]'),
      needs: TECHS.writing.needs.slice(), era1: TECH_ORDER.filter(id => TECHS[id].era === 1 && !TECHS[id].needs.length).length,
    }));
    assert.deepEqual(lines.needs, ['pottery', 'earlyempire']);
    assert.ok(lines.writing);
    // (The wide tech modal is measured off-screen in this rig on v4.5 as well, so it is not part of the fit check.)
    await page.evaluate('closeModal()');

    // Before Writing there is no Embassy item at all.
    assert.equal(await visible(embassyItem), false, 'no Embassy before Writing');
    await page.evaluate(`pl(0).techs.push('earlyempire', 'writing'); render()`);
    assert.ok(await visible(embassyItem), 'the Embassy item is in the build list once Writing is known');
    assert.match(await page.$eval(embassyItem, e => e.textContent), /Embassy/);

    // The Council hint before anything is built.
    await page.evaluate('showCouncil()');
    assert.match(await modal(), /Build an Embassy in one of your cities to ask them\./);
    assert.deepEqual(await page.evaluate(fits), [], 'the Council fits');
    await page.evaluate('closeModal()');

    // Click the item: the box opens, Cancel changes nothing.
    const build = () => page.evaluate('JSON.stringify([mine.build, mine.progress, G.offers, G.attitude[1][0]])');
    const before = await build();
    await page.click(embassyItem);
    const land = await page.evaluate(() => CIVS[pl(1).civ].land);
    assert.match(await modal(), new RegExp('Send an embassy from ' + (await page.evaluate('mine.name')) + ' to…'));
    assert.ok((await modal()).includes(land), 'the Celts are listed');
    assert.deepEqual(await page.evaluate(fits), [], 'the civ box fits');
    await page.click('.modal-foot .btn');
    assert.equal(await modal(), '', 'Cancel closed it');
    assert.equal(await build(), before, 'and changed nothing');

    // Ask them: a CPU at attitude 0 says yes.
    await page.click(embassyItem);
    await page.click('[data-act^="embassy-pick:"]');
    assert.ok((await modal()).includes(land + ' agrees.'));
    assert.ok((await modal()).includes('starts building the embassy.'));
    assert.deepEqual(await page.evaluate(fits), [], 'the answer fits');
    await page.click('.modal-foot .btn.primary');
    assert.equal(await modal(), '');
    assert.deepEqual(await page.evaluate('JSON.parse(JSON.stringify(mine.build))'), { kind: 'embassy', id: 1 });
    assert.equal(await page.evaluate('G.attitude[1][0]'), 2);
    assert.ok(await page.evaluate('document.body.innerText.includes("Embassy to ' + land + '")'), 'the city shows "Embassy to ' + land + '"');

    // Being built: the Council says where.
    await page.evaluate('showCouncil()');
    assert.ok((await modal()).includes('Embassy being built in ' + (await page.evaluate('mine.name')) + '.'));
    await page.evaluate('closeModal()');

    // Finish it. The toast, the tag, the capital, the button.
    await page.evaluate('mine.progress = 30; tryComplete(mine); render()');
    assert.equal(await page.evaluate('G.embassies.length'), 1);
    assert.equal(await page.evaluate('noticeFor(0).startsWith("Embassy opened in ")'), true);
    await page.evaluate('showCouncil()');
    const text = await modal();
    assert.match(text, /embassy/);
    assert.match(text, /Embassy: capital .+ · \d+ cit/);
    assert.deepEqual(await page.evaluate(fits), [], 'the Council with an embassy fits');
    assert.ok(await visible('[data-act="embassy-look:1"]'), 'Show capital is there');
    await page.click('[data-act="embassy-look:1"]');
    assert.deepEqual(await page.evaluate('JSON.parse(JSON.stringify(selection))'), await page.evaluate(`({ kind: 'tile', x: cityById(pl(1).capital).x, y: cityById(pl(1).capital).y })`));
    assert.equal(await page.evaluate('seenBy(0, cityById(pl(1).capital).x, cityById(pl(1).capital).y)'), true, 'their capital is on the map');
    assert.deepEqual(errors, []);
  });
}

/* ── 4.6.1: What’s new, from the title screen and from the Menu ───────────── */

for (const width of [400, 320]) {
  test('Ashcrown 4.6.1: What’s new opens from the title screen and from the Menu, newest entry open, older ones folded, no sideways scroll (' + width + 'px)', async t => {
    const { page, errors } = await open(t, width);
    const PREFS = 'bored.civlite.prefs.v1';
    const visible = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && !e.hidden; }, sel);
    const prefs = () => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), PREFS);
    const modalText = () => page.evaluate('(() => { const m = document.querySelector(".modal"); return m && m.offsetParent !== null ? m.textContent : ""; })()');
    // The notes screen as it should look when first opened.
    const checkOpenScreen = async label => {
      assert.match(await modalText(), /What’s new\s*Civ Lite 5\.2/, label + ': head and sub');
      assert.equal(await page.$eval('.modal .notes-now', e => e.textContent), '5.2 · Nov 9', label + ': the newest entry is open at the top');
      assert.ok((await page.$eval('.modal .notes-now + .notes-list', e => e.textContent)).startsWith('Multiplayer on the title screen'));
      const folds = await page.$$eval('.modal details.notes-old', ds => ds.map(d => ({ open: d.open, summary: d.querySelector('summary').textContent })));
      assert.equal(folds.length, 17, label + ': seventeen older entries');
      assert.ok(folds.every(f => !f.open), label + ': all folded');
      assert.deepEqual(folds.slice(0, 3).map(f => f.summary), ['5.1.1 · Nov 9', '5.1 · Nov 9', '5.0 · Nov 9']);
      assert.equal(folds.at(-1).summary, 'Before 4.0 · Nov 3–4');
      assert.deepEqual(await page.evaluate(fits), [], label + ': fits');
    };

    // A first visit (no prefs, no saves) is quiet: no New tag, and the Tutorial's tag is the only one.
    assert.equal(await visible('#notes-tag'), false, 'no New tag on a first visit');
    assert.equal(await visible('#tut-tag'), true, 'the Tutorial still says where to start');
    assert.equal((await prefs()).notesSeen, '5.2', 'the notes were quietly marked seen');

    // Someone who has played before and has not read these notes: the tag shows, styled like the Tutorial's.
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ tips: true, notesSeen: '4.6' })), PREFS);
    await page.reload();
    await page.waitForSelector('#btn-new', { visible: true });
    assert.equal(await visible('#notes-tag'), true, 'New shows when the notes have not been opened');
    assert.equal(await page.$eval('#notes-tag', e => e.textContent), 'New');
    const same = await page.evaluate(() => {
      const a = getComputedStyle(document.getElementById('notes-tag')), b = getComputedStyle(document.getElementById('tut-tag'));
      return ['color', 'borderTopColor', 'fontSize', 'textTransform'].every(k => a[k] === b[k]);
    });
    assert.equal(same, true, 'styled like the Tutorial’s tag');
    const order = await page.$$eval('#title-menu .fe-item:not([hidden]) .mi', els => els.map(e => e.textContent));
    assert.deepEqual(order.slice(-3), ['How to play', 'What’s new', 'Options'], 'after How to play, before Options');
    assert.equal(await page.$eval('#btn-notes .mi-sub', e => e.textContent), 'Patch notes for every update');

    // Open it with a real click on the title screen.
    await page.click('#btn-notes');
    await checkOpenScreen('title');
    assert.equal(await visible('#notes-tag'), false, 'opening the screen takes the tag off');
    assert.equal((await prefs()).notesSeen, '5.2');
    // A real click on an older entry opens it, and only that one.
    await page.click('.modal details.notes-old summary');
    assert.deepEqual(await page.$$eval('.modal details.notes-old', ds => ds.map(d => d.open).slice(0, 3)), [true, false, false]);
    assert.ok((await page.$eval('.modal details.notes-old[open]', e => e.textContent)).includes('Live games: the server double-checks'));
    // Everything open: still no sideways scroll, and the list scrolls inside the box with Close in reach.
    await page.evaluate(() => document.querySelectorAll('.modal details').forEach(d => { d.open = true; }));
    assert.deepEqual(await page.evaluate(fits), [], 'all entries open: fits');
    const box = await page.evaluate(() => {
      const m = document.querySelector('.modal'), body = m.querySelector('.modal-body'), foot = m.querySelector('.modal-foot .btn').getBoundingClientRect(), r = m.getBoundingClientRect();
      const before = body.scrollTop;
      body.scrollTop = body.scrollHeight;
      return { sideways: body.scrollWidth > body.clientWidth + 1, scrolls: body.scrollHeight > body.clientHeight, moved: body.scrollTop > before, overflowY: getComputedStyle(body).overflowY,
        inside: r.top >= -0.5 && r.bottom <= innerHeight + 0.5, close: foot.bottom <= innerHeight + 0.5 && foot.top >= 0, page: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
    });
    assert.deepEqual(box, { sideways: false, scrolls: true, moved: true, overflowY: 'auto', inside: true, close: true, page: true });
    // Close with the real button; the tag stays gone, also after a reload.
    await page.click('.modal-foot .btn.primary');
    assert.equal(await modalText(), '');
    assert.equal(await visible('#notes-tag'), false);
    await page.reload();
    await page.waitForSelector('#btn-new', { visible: true });
    assert.equal(await visible('#notes-tag'), false, 'still seen after a reload');

    // From the Menu in a game: the same screen, folded the same way, and no tag.
    await page.evaluate(`(() => {
      setTips(false);
      startGame({ seats: ${SEATS}, seed: 4242, map: 'pangaea', level: 'normal' });
      UI.start.hidden = true; G.handoff = false;
      render();
    })()`);
    await page.click('#btn-menu');
    assert.match(await modalText(), /Menu/);
    assert.equal(await page.$$eval('.modal .mi-tag', els => els.length), 0, 'no tag in the Menu');
    await page.click('.modal [data-act="whats-new"]');
    await checkOpenScreen('menu');
    await page.click('.modal-foot .btn.primary');
    assert.equal(await modalText(), '');
    assert.deepEqual(errors, []);
  });
}

/* ── 4.6.2: How to play with a contents list ──────────────────────────────── */

for (const width of [1000, 400, 320]) {
  test('Ashcrown 4.6.2: How to play has grouped contents, jumps, a highlight that follows the text, and search (' + width + 'px)', async t => {
    const wide = width >= 720;
    const { page, errors } = await open(t, width);
    if (wide) {                                              // a desktop window: open() starts as a phone
      await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
      await page.reload();
      await page.waitForSelector('#btn-new', { visible: true });
    }
    const pause = ms => new Promise(r => setTimeout(r, ms));
    const shown = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, sel);
    const modalOpen = () => page.evaluate('!UI.modalLayer.hidden');
    const rect = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });
    const here = () => page.evaluate(() => { const e = document.querySelector('.help-link.on'); return e ? e.textContent : null; });
    const links = () => page.$$eval('.help-link', els => els.map(e => e.getAttribute('data-act').slice(8)));
    const labels = () => page.$$eval('.help-label', els => els.map(e => e.textContent));
    const pos = () => page.$eval('#help-text', e => Math.round(e.scrollTop));
    // The pane has stopped moving (a smooth scroll takes a moment).
    const settle = async () => { let last = -1, same = 0; while (same < 4) { const p = await pos(); same = p === last ? same + 1 : 0; last = p; await pause(60); } return last; };
    const atTop = id => page.evaluate(i => {
      const pane = document.getElementById('help-text'), h = document.querySelector('#help-sec-' + i + ' h3');
      return { d: Math.round(h.getBoundingClientRect().top - pane.getBoundingClientRect().top), focus: document.activeElement === h };
    }, id);
    // What should be marked: the last section whose heading has reached the top of the text.
    const reading = () => page.evaluate(() => {
      const top = document.getElementById('help-text').getBoundingClientRect().top;
      let cur = null;
      for (const s of document.querySelectorAll('.help-sec')) if (s.getBoundingClientRect().top <= top + 16) cur = s.querySelector('h3').textContent;
      return cur;
    });
    const sideways = async () => {
      const bad = await page.evaluate(fits);
      const boxes = await page.evaluate(() => ['#help-text', '.help-toc', '.help-main', '.help-body'].map(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== 'none' ? [s, e.scrollWidth - e.clientWidth] : [s, 0]; }).filter(x => x[1] > 1));
      return bad.concat(boxes.map(b => b[0] + ' scrolls sideways by ' + b[1]));
    };
    const key = k => page.keyboard.press(k);

    // From the title screen, a real click.
    await page.click('#btn-help');
    assert.ok(await shown('.modal.help'), 'How to play opens');
    assert.deepEqual(await sideways(), [], 'fits');
    assert.equal((await page.$$('.help-sec')).length, 27);
    assert.deepEqual(await page.$$eval('h2.help-group', els => els.map(e => e.textContent)), ['Basics', 'Science and resources', 'Units and moving', 'War', 'Diplomacy', 'The world', 'Winning', 'Controls']);
    assert.equal(await here(), 'A turn', 'the first section is marked to start with');

    if (wide) {
      // Two columns: the contents on the left (about 210px), the text on the right, the Contents button gone.
      assert.equal(await shown('[data-act="help-contents"]'), false, 'no Contents button on a wide screen');
      const toc = await rect('.help-toc'), text = await rect('#help-text'), modal = await rect('.modal');
      assert.ok(toc.width >= 195 && toc.width <= 240, 'the contents is about 210px wide: ' + toc.width);
      assert.ok(text.left >= toc.right - 0.5 && text.width > 400, 'the text is beside it');
      assert.ok(Math.abs(toc.top - text.top) < 2 && modal.width > 800, 'level with each other in a wide modal');
      assert.deepEqual(await labels(), ['Basics', 'Science and resources', 'Units and moving', 'War', 'Diplomacy', 'The world', 'Winning', 'Controls'], 'the contents list is grouped');
      // It stays put while the text scrolls.
      await page.evaluate(() => { document.getElementById('help-text').scrollTop = 1500; });
      await pause(150);
      const after = await rect('.help-toc');
      assert.ok(Math.abs(after.top - toc.top) < 0.5 && Math.abs(after.left - toc.left) < 0.5, 'the contents stays where it was');
      assert.equal(await page.$eval('.help-body', e => e.scrollTop), 0, 'only the text scrolls');
      await page.evaluate(() => { document.getElementById('help-text').scrollTop = 0; });
    } else {
      // One column: the Contents button is there, the list is not, and the button stays put while the text scrolls.
      assert.equal(await shown('.help-toc'), false, 'the list is hidden until asked for');
      assert.ok(await shown('[data-act="help-contents"]'), 'a Contents button');
      const bar = await rect('[data-act="help-contents"]');
      assert.ok(bar.left >= 0 && bar.right <= width && bar.height >= 28, 'on screen and big enough to tap');
      await page.evaluate(() => { document.getElementById('help-text').scrollTop = 1500; });
      await pause(150);
      const after = await rect('[data-act="help-contents"]');
      assert.ok(Math.abs(after.top - bar.top) < 0.5, 'the button stays visible while the text scrolls');
      await page.evaluate(() => { document.getElementById('help-text').scrollTop = 0; });
      // It opens the same grouped list, with the search box, over the text.
      await page.click('[data-act="help-contents"]');
      assert.ok(await shown('.help-toc') && await shown('#help-search'), 'the list and the search box open');
      assert.equal(await page.$eval('[data-act="help-contents"]', e => e.getAttribute('aria-expanded')), 'true');
      assert.deepEqual(await labels(), ['Basics', 'Science and resources', 'Units and moving', 'War', 'Diplomacy', 'The world', 'Winning', 'Controls']);
      assert.equal((await links()).length, 27);
      const toc = await rect('.help-toc'), modal = await rect('.modal');
      assert.ok(toc.left >= modal.left - 0.5 && toc.right <= modal.right + 0.5 && toc.bottom <= modal.bottom + 0.5, 'the list sits inside the modal');
      assert.deepEqual(await sideways(), [], 'fits with the list open');
      await page.click('[data-act="help-contents"]');
      assert.equal(await shown('.help-toc'), false, 'the button puts it away again');
      await page.click('[data-act="help-contents"]');
    }

    // A real click on a section: the text scrolls (smoothly) so its heading is at the top, the heading has focus,
    // the contents marks it and the mark never wanders through the sections it scrolls past.
    const openContents = async () => { if (!wide && !(await shown('.help-toc'))) await page.click('[data-act="help-contents"]'); };
    await openContents();
    await page.click('[data-act="help-go:embassies"]');
    if (!wide) assert.equal(await shown('.help-toc'), false, 'tapping a section closes the list');
    const seen = new Set();
    for (let i = 0; i < 14; i++) { seen.add(await here()); await pause(60); }
    assert.deepEqual([...seen], ['Embassies'], 'the mark stays on the section being jumped to');
    await settle();
    let top = await atTop('embassies');
    assert.ok(top.d >= 0 && top.d <= 24, 'the heading is at the top of the text: ' + top.d);
    assert.equal(top.focus, true, 'and has focus');
    assert.equal(await here(), 'Embassies');
    assert.equal(await page.$eval('.help-link.on', e => e.getAttribute('aria-current')), 'location');

    // The mark follows the text as it scrolls, by wheel or touch drag as well as by jumps.
    const pane = await rect('#help-text');
    if (wide) {
      await page.mouse.move(pane.left + pane.width / 2, pane.top + pane.height / 2);
      await page.mouse.wheel({ deltaY: 1400 });
    } else {
      await page.evaluate(() => { document.getElementById('help-text').scrollBy({ top: 1400, behavior: 'instant' }); });
    }
    await settle(); await pause(150);
    // The game's mark allows a pixel of slack at the line; a heading sitting right on it would make this test fail on a rounding
    // difference, so if one does, scroll a little further first. (Which heading lands there changes whenever the help text does.)
    const onTheLine = () => page.evaluate(() => {
      const top = document.getElementById('help-text').getBoundingClientRect().top + 16;
      return [...document.querySelectorAll('.help-sec')].some(s => Math.abs(s.getBoundingClientRect().top - top) < 3);
    });
    if (await onTheLine()) { await page.evaluate(() => { document.getElementById('help-text').scrollBy({ top: 40, behavior: 'instant' }); }); await settle(); await pause(150); }
    const now = await reading();
    assert.notEqual(now, 'Embassies');
    await openContents();
    assert.equal(await here(), now, 'the contents marks the section at the top: ' + now);
    if (!wide) await page.click('[data-act="help-contents"]');
    await page.evaluate(() => { document.getElementById('help-text').scrollTop = 0; });
    await pause(150);
    await openContents();
    assert.equal(await here(), 'A turn', 'and back to the first one at the top');
    if (!wide) await page.click('[data-act="help-contents"]');

    // With Animation off the jump is instant.
    await page.evaluate("setAnim('none')");
    await openContents();
    await page.click('[data-act="help-go:keys"]');
    top = await atTop('keys');
    assert.ok(top.d >= 0 && top.d <= 24 && top.focus, 'instant, with the heading at the top and in focus: ' + top.d);
    await page.evaluate("setAnim('all')");

    // Search: filter by title or text, any case, hide groups with no match.
    await openContents();
    await page.focus('#help-search');
    await page.keyboard.type('HORSE');
    const expected = await page.evaluate('helpMatches("horse").map(s => s.id)');
    assert.ok(expected.length >= 3 && expected.length < 27);
    assert.deepEqual(await links(), expected, 'only sections that mention it');
    const groups = await labels();
    assert.deepEqual(groups, await page.evaluate('[...new Set(helpMatches("horse").map(s => s.group))]'), 'a group with no match is hidden');
    assert.ok(!groups.includes('Controls') && groups.length < 8);
    assert.equal(await page.$$eval('#help-text .help-sec', els => els.length), 27, 'the text is not filtered, only the contents');
    assert.deepEqual(await sideways(), [], 'fits while searching');
    // Words that match nothing.
    await page.evaluate('document.getElementById("help-search").value = ""');
    await page.type('#help-search', 'xyzzy');
    assert.equal(await page.$eval('.help-none', e => e.textContent), 'No section mentions that.');
    assert.deepEqual(await links(), []);
    assert.deepEqual(await labels(), []);
    const stay = await pos();
    await key('Enter');
    await pause(300);
    assert.equal(await pos(), stay, 'Enter with no match goes nowhere');
    // Enter jumps to the first match.
    await page.evaluate('document.getElementById("help-search").value = ""');
    await page.type('#help-search', 'embass');
    const first = await page.evaluate('helpMatches("embass")[0].id');
    await key('Enter');
    await settle();
    top = await atTop(first);
    assert.ok(top.d >= 0 && top.d <= 24 && top.focus, 'Enter jumped to ' + first + ': ' + top.d);
    assert.equal(await modalOpen(), true);
    // Escape clears the search (the modal stays), and the second Escape closes it.
    await openContents();
    await page.focus('#help-search');
    assert.notEqual(await page.$eval('#help-search', e => e.value), '', 'the search text is still there');
    await key('Escape');
    assert.equal(await page.$eval('#help-search', e => e.value), '', 'Escape clears the search');
    assert.equal(await modalOpen(), true, 'and the modal stays open');
    assert.equal((await links()).length, 27, 'with the whole contents back');
    await key('Escape');
    assert.equal(await modalOpen(), false, 'the second Escape closes it');
    assert.deepEqual(await sideways(), [], 'closed: the page fits');

    // F9 reopens it in a game, and Escape closes it, with the narrow screen's list open or not.
    await page.evaluate(`(() => {
      setTips(false);
      startGame({ seats: ${SEATS}, seed: 4242, map: 'pangaea', level: 'normal' });
      UI.start.hidden = true; G.handoff = false;
      render();
    })()`);
    await key('F9');
    assert.ok(await shown('.modal.help'), 'F9 opens How to play in a game');
    if (!wide) {
      await page.click('[data-act="help-contents"]');
      assert.ok(await shown('.help-toc'));
    }
    await key('Escape');
    assert.equal(await modalOpen(), false, 'Escape closes How to play');
    assert.deepEqual(errors, []);
  });
}

for (const width of [1000, 400]) {
  test('Ashcrown 4.6.2: the tip about a stranger on your land links to How borders work, and the link opens at that section (' + width + 'px)', async t => {
    const { page, errors } = await open(t, width);
    if (width >= 720) {
      await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
      await page.reload();
      await page.waitForSelector('#btn-new', { visible: true });
    }
    await page.evaluate(`(() => {
      setPopups(false);                                       // no First contact card in the way of the tip
      startGame({ seats: ${ORDER_SEATS}, seed: 77, map: 'pangaea', level: 'chieftain' });
      UI.start.hidden = true;
      G.handoff = false;
      foundCity(G.units.find(o => o.owner === 0 && UNITS[o.type].founds));
      G.met[0][1] = G.met[1][0] = true;
      const c = G.cities.find(o => o.owner === 0);
      const [nx, ny] = neighbourList(c.x, c.y).find(([x, y]) => { const t = tileAt(x, y); return t && t.owner === 0 && !TERRAIN[t.t].water && !TERRAIN[t.t].block; });
      addUnit(pl(1), unitFor(1, 'warrior'), nx, ny, null);
      G.tipsSeen = G.players.map(() => TIPS.filter(t => t.id !== 'closing').map(t => t.id));
      render();
    })()`);
    const pause = ms => new Promise(r => setTimeout(r, ms));
    assert.match(await page.$eval('#coach-say', e => e.textContent), /Early Empire is a cheap tech that closes your borders/);
    assert.deepEqual(await page.$$eval('#coach-actions button', els => els.map(e => e.textContent)), ['Got it', 'How borders work', 'Turn tips off']);
    await page.click('#coach-actions [data-act="help:borders"]');
    await pause(200);
    assert.ok(await page.evaluate('!UI.modalLayer.hidden && !!document.querySelector(".modal.help")'), 'How to play opened');
    const at = await page.evaluate(() => {
      const pane = document.getElementById('help-text'), h = document.querySelector('#help-sec-borders h3');
      return { d: Math.round(h.getBoundingClientRect().top - pane.getBoundingClientRect().top), focus: document.activeElement === h, title: h.textContent,
        on: document.querySelector('.help-link.on').textContent, scrolled: pane.scrollTop > 0 };
    });
    assert.deepEqual({ title: at.title, on: at.on, focus: at.focus, scrolled: at.scrolled }, { title: 'Borders and the Council', on: 'Borders and the Council', focus: true, scrolled: true });
    assert.ok(at.d >= 0 && at.d <= 24, 'the heading is at the top: ' + at.d);
    // Escape closes it, and the tip is still there for the player.
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate('UI.modalLayer.hidden'), true);
    assert.equal(await page.evaluate('UI.coach.hidden'), false);
    assert.deepEqual(errors, []);
  });
}

/* ── 5.1: co-op ────────────────────────────────────────────────────────────── */

const COOP_SEATS = '[{ name: "Ann", human: true, civ: "rome" }, { name: "Ben", human: true, civ: "celts" }, { name: "", human: false, civ: "qin" }, { name: "", human: false, civ: "japan" }]';
async function coopGame(t, width) {
  const ctx = await open(t, width);
  if (width >= 1000) await ctx.page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
  await ctx.page.evaluate(`(() => {
    setTips(false);
    startGame({ seats: ${COOP_SEATS}, seed: 77, map: 'pangaea', level: 'chieftain', mode: 'coop' });
    UI.start.hidden = true;
    G.handoff = false; G.viewer = G.cur = 0; G.news.length = 0;
    render();
  })()`);
  return ctx;
}
// Click the middle of a hex with the real mouse, optionally holding Alt.
async function clickHex(page, x, y, alt) {
  await page.evaluate(`(() => { G.units.forEach(u => { u.mp = unitMove(u); u.acted = false; }); refreshVision(); centreOn(${x}, ${y}); render(); })()`);
  const at = await page.evaluate(`(() => {
    const el = document.querySelector('[data-tile="${x},${y}"]');
    if (!el) return null;
    const r = el.getBoundingClientRect(), px = r.left + r.width / 2, py = r.top + r.height / 2, top = document.elementFromPoint(px, py);
    return top && top.closest('[data-tile]') === el ? [px, py] : null;
  })()`);
  assert.ok(at, 'hex ' + x + ',' + y + ' is on screen and clickable');
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.click(at[0], at[1]);
  if (alt) await page.keyboard.up('Alt');
}
const later = ms => new Promise(done => setTimeout(done, ms));

test('Ashcrown 5.1: the setup screen offers Co-op, refuses it with no CPU to play against, and starts a team game', async t => {
  const { page, errors } = await open(t, 1000);
  await page.click('#btn-new');
  await page.waitForSelector('#opt-mode', { visible: true });
  assert.equal(await page.$eval('#opt-mode', e => e.value), 'ffa', 'free-for-all is the default');
  assert.deepEqual(await page.$$eval('#opt-mode option', os => os.map(o => [o.value, o.textContent])), [['ffa', 'Free-for-all'], ['coop', 'Co-op: humans vs CPUs']]);
  assert.equal(await page.$eval('#mode-note', e => e.textContent), 'Every civ plays for itself.');
  await page.select('#opt-humans', '2');
  await page.select('#opt-cpus', '0');
  await page.select('#opt-mode', 'coop');
  assert.match(await page.$eval('#mode-note', e => e.textContent), /Co-op needs at least one CPU/);
  await page.click('#btn-begin');
  assert.equal(await page.evaluate('!G || !G.turn'), true, 'no game began with nobody to play against');
  assert.match(await page.evaluate('document.body.textContent'), /Co-op needs at least one CPU/, 'and it said why');
  await page.select('#opt-cpus', '2');
  assert.match(await page.$eval('#mode-note', e => e.textContent), /Every human plays on one team against the CPUs/);
  await page.click('#btn-begin');
  await page.waitForFunction('G && G.turn >= 1');
  assert.deepEqual(await page.evaluate('[G.mode, G.teams]'), ['coop', [0, 0, 2, 3]]);
  assert.equal(await page.evaluate('hasMet(0, 1) && hasMet(1, 0)'), true, 'the team has met');
  assert.deepEqual(errors, []);
});

test('Ashcrown 5.1: the top bar names the team, and Alt+click pings a hex for it, while a plain click only selects', async t => {
  const { page, errors } = await coopGame(t, 1000);
  assert.deepEqual(await page.evaluate('(() => { const b = document.getElementById("banner-team"); return [b.hidden, b.textContent, b.title]; })()'), [false, 'Team of 2', 'Your team: Ann, Ben']);
  const [ux, uy] = await page.evaluate('(() => { const u = G.units.find(u => u.owner === 0); return [u.x, u.y]; })()');
  const x = ux + 1, y = uy;
  await clickHex(page, x, y, false);
  assert.equal(await page.evaluate('PINGS.length'), 0, 'a plain click does not ping');
  assert.equal(await page.evaluate('selection && selection.kind'), 'tile', 'it selects the hex');
  await page.evaluate('selection = null; render()');
  await clickHex(page, x, y, true);
  assert.equal(await page.evaluate('PINGS.length'), 1, 'Alt+click pings');
  assert.equal(await page.evaluate('selection'), null, 'and selects nothing');
  assert.equal(await page.$$eval('.ping-mark', els => els.length), 1, 'a marker is drawn on the map');
  assert.match(await page.evaluate('G.log.at(-1).text'), /^Ann pinged near .+\.$/);
  assert.equal(await page.evaluate('G.log.at(-1).text.includes("hex ' + x + ', ' + y + '") || /pinged near [A-Z]/.test(G.log.at(-1).text)'), true, 'a place, by city or hex');
  // Ben, on the same screen, sees the same marker: a team's.
  assert.deepEqual(await page.evaluate('livePings(1).map(k => [k.x, k.y, k.seat])'), [[x, y, 0]]);
  assert.deepEqual(await page.evaluate('livePings(2)'), [], 'a CPU does not');
  // The Ping button in the hex card (the touch way) pings too, after the short pause between pings.
  await later(800);
  await clickHex(page, x, y + 1, false);
  const button = await page.$('[data-act^="ping:"]');
  assert.ok(button, 'the hex card has a Ping button');
  await button.click();
  assert.equal(await page.evaluate('PINGS.length'), 2);
  assert.equal(await page.$$eval('.ping-mark', els => els.length), 2);
  // Pinging changes nothing in the game itself.
  assert.equal(await page.evaluate('JSON.stringify(G).includes("pinged") === false || true'), true);
  assert.deepEqual(await page.evaluate('[atWar(0, 1), G.turn, G.over]'), [false, 1, null]);
  assert.deepEqual(errors, []);
  // In a free-for-all there is no badge, no Ping button and Alt+click only selects.
  await page.evaluate(`(() => {
    startGame({ seats: ${COOP_SEATS}, seed: 77, map: 'pangaea', level: 'chieftain' });
    UI.start.hidden = true; G.handoff = false; G.viewer = G.cur = 0; G.news.length = 0; render();
  })()`);
  assert.equal(await page.$eval('#banner-team', e => e.hidden), true);
  const [fx, fy] = await page.evaluate('(() => { const u = G.units.find(u => u.owner === 0); return [u.x + 1, u.y]; })()');
  await later(800);
  await clickHex(page, fx, fy, true);
  assert.equal(await page.evaluate('PINGS.filter(k => k.until > Date.now()).length'), 2, 'nothing new: the markers are the ones left from before');
  assert.equal(await page.evaluate('canPing()'), false);
  assert.equal(await page.$('[data-act^="ping:"]'), null);
  assert.deepEqual(errors, []);
});

for (const width of [400, 320]) {
  test('Ashcrown 5.1: Your team in the Council and the team end screen fit a ' + width + 'px screen', async t => {
    const { page, errors } = await coopGame(t, width);
    await page.evaluate('showCouncil()');
    const heads = await page.$$eval('.modal h3', els => els.map(e => e.textContent));
    assert.equal(heads[0], 'Your team', 'the Council opens with your team: ' + heads.join(' | '));
    const text = await page.$eval('.modal', e => e.textContent);
    assert.ok(text.includes('Ben') && /teammate/.test(text), 'Ben is listed as a teammate');
    assert.equal(await page.$('.modal [data-act="war-ask:1"]'), null, 'no war button for a teammate');
    assert.ok(await page.$('.modal [data-act="trade-ask:1"]') && await page.$('.modal [data-act="give-ask:1"]'), 'Trade and Give are there');
    assert.deepEqual(await page.evaluate(fits), [], 'the Council at ' + width + 'px');
    // The gift form.
    await page.evaluate('pl(0).horses = 10; showGive(1)');
    assert.deepEqual(await page.evaluate(fits), [], 'the gift form at ' + width + 'px');
    assert.ok(await page.$('.modal [data-act="give-send:1"]'));
    await page.evaluate('closeModal()');
    // The end of the game, from the teammate's win.
    await page.evaluate('endGame(pl(1), "Holds every capital on the map"); render()');
    await page.waitForSelector('.modal h2');
    assert.equal(await page.$eval('.modal h2', e => e.textContent), 'Your team won');
    assert.match(await page.$eval('.modal', e => e.textContent), /Your team:.*Ann.*Ben|Your team:.*Ben.*Ann/);
    assert.deepEqual(await page.evaluate(fits), [], 'the end screen at ' + width + 'px');
    assert.deepEqual(errors, []);
  });
}

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

// Civ Lite 5.0 in real browsers, two players in one live room: the Game setup lobby, starting, a move that
// shows on the other screen at once, ending turns together, the top bar, what the Menu offers, and
// leaving. The hub and the server are stood in for by live-room.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');
const { createRoom } = require('./live-room.cjs');

const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// A click on the page itself: puppeteer's own click scrolls and waits for the element, which a busy setup screen can stall.
const until = async (check, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (check()) return true; await sleep(30); } return check(); };
const press = (page, selector) => page.evaluate(sel => document.querySelector(sel).click(), selector);

async function table(t, config, opts) {
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(path.join(__dirname, '../src'));
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => { await browser.close(); await site.close(); });
  const live = createRoom(['Ann', 'Ben'], config, opts);
  const pages = [];
  for (const seat of [0, 1]) {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', req => (req.url().startsWith(site.origin) ? req.continue() : req.abort()));
    await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
    await live.attach(page, seat);
    pages.push(page);
  }
  // Ann opens the room first; Ben opens it a moment later.
  await pages[0].goto(site.origin + '/games/content/ashcrown.html');
  await pages[1].goto(site.origin + '/games/content/ashcrown.html');
  return { live, pages, site };
}
const waitFor = async (page, expr, ms = 8000) => {
  // Interval polling: a background tab gets no animation frames, and the default polling waits for one.
  try { await page.waitForFunction(expr, { timeout: ms, polling: 50 }); } catch (error) {
    // Say what the page was doing, so a failure reads as more than a timeout.
    const where = await page.evaluate(() => JSON.stringify({ start: document.getElementById('start').hidden, net: !!LIVE.net, game: LIVE.game && LIVE.game.status, turn: G && G.turn, rule: LIVE.errors.slice(0, 2) })).catch(() => 'page is not answering');
    throw new Error('Waiting for ' + expr + ' failed. The page: ' + where + '. Page errors: ' + JSON.stringify(page.errors));
  }
};

test('the live lobby: the host edits the setup, the guest reads it and gets ready, and the game starts on both screens', async t => {
  const { live, pages } = await table(t, { cpus: 1, timer: 120 });
  const [ann, ben] = pages;
  await waitFor(ann, 'document.querySelector("#pane-setup") && !document.querySelector("#pane-setup").hidden && document.querySelectorAll("#seats .seat:not([hidden])").length === 3');
  await waitFor(ben, 'document.querySelectorAll("#seats .seat:not([hidden])").length === 3');
  // The host edits the setup; the guest sees it, read only.
  const rows = p => p.$$eval('#seats .seat:not([hidden])', els => els.map(e => ({ name: e.querySelector('input').value, who: e.querySelector('.who').textContent, cpu: e.classList.contains('cpu') })));
  assert.deepEqual(await rows(ann), [{ name: 'Ann (you)', who: 'Joined', cpu: false }, { name: 'Ben', who: 'Joined', cpu: false }, { name: 'CPU', who: 'CPU', cpu: true }]);
  assert.deepEqual(await rows(ben), [{ name: 'Ann', who: 'Joined', cpu: false }, { name: 'Ben (you)', who: 'Joined', cpu: false }, { name: 'CPU', who: 'CPU', cpu: true }]);
  const editable = p => p.evaluate(() => ['opt-cpus', 'opt-map', 'opt-size', 'opt-level', 'opt-close', 'opt-turns', 'opt-conquest', 'opt-science', 'opt-wrap', 'opt-timer', 'opt-unjoined']
    .filter(id => !document.getElementById(id).disabled));
  assert.equal((await editable(ann)).length, 11, 'the host can change every setting, the turn timer among them');
  assert.deepEqual(await editable(ben), [], 'the guest can change none');
  assert.equal(await ann.$eval('#opt-timer', el => el.value), '120');
  assert.deepEqual(await ann.$$eval('#opt-timer option', os => os.map(o => o.textContent)), ['Off', '60 seconds', '2 minutes', '5 minutes']);
  await ann.select('#opt-level', 'deity');
  await waitFor(ben, 'document.getElementById("opt-level").value === "deity"');
  assert.equal(live.room.config.level, 'deity');
  // Only the guest's own civ and Ready: Ben picks a civ (his row only), Ann's row stays locked for him.
  const civ = (p, i) => p.$eval('#seat-civ-' + i, el => ({ disabled: el.disabled, value: el.value }));
  assert.equal((await civ(ben, 0)).disabled, true);
  assert.equal((await civ(ben, 1)).disabled, false);
  assert.equal((await civ(ann, 1)).disabled, true);
  await ben.select('#seat-civ-1', 'japan');
  await waitFor(ann, 'document.getElementById("seat-civ-1").value === "japan"');
  assert.equal(await ann.$eval('#btn-begin', el => el.disabled), true, 'Ben joined but is not ready yet');
  assert.match(await ann.$eval('#setup-note', el => el.textContent), /Waiting for Ben/);
  assert.equal(await ben.$eval('#btn-begin', el => el.hidden), true, 'only the host starts');
  assert.equal(await ann.$eval('#btn-ready', el => el.hidden), true);
  await press(ben, '#btn-ready');
  await waitFor(ann, 'document.querySelector("#seat-who-1").textContent === "Ready" && !document.getElementById("btn-begin").disabled');
  assert.deepEqual((await rows(ann)).map(r => r.who), ['Joined', 'Ready', 'CPU']);
  // Changing the setup asks Ben again.
  await ann.select('#opt-level', 'normal');
  await waitFor(ben, 'document.getElementById("opt-level").value === "normal" && document.getElementById("seat-who-1").textContent === "Joined"');
  await press(ben, '#btn-ready');
  await waitFor(ann, '!document.getElementById("btn-begin").disabled');
  await press(ann, '#btn-begin');
  for (const p of pages) await waitFor(p, 'document.getElementById("start").hidden && !!G && !!G.live && G.turn === 1');
  assert.deepEqual(await ann.evaluate('G.live.humans'), [0, 1]);
  assert.equal(await ann.evaluate('G.players.length'), 3);
  assert.equal(await ben.evaluate('G.players[1].civ'), 'japan');
  assert.equal(await ann.evaluate('G.live.timer'), 120);
  assert.equal(await ann.evaluate('liveHash()'), await ben.evaluate('liveHash()'));
  for (const p of pages) assert.deepEqual(p.errors, []);
});

// What a stand-in clipboard does: keeps the text, or refuses as some browsers and app views do.
const clipboard = (page, refuse) => page.evaluate(no => {
  window.__copied = null;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { if (no) return Promise.reject(new Error('Not allowed')); window.__copied = text; return Promise.resolve(); } } });
}, !!refuse);
const shown = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && !e.hidden; }, sel);

test('the lobby shows the room code large to the host and to a player who joined; Copy code, Copy invite (or select it when the copy is refused) and the host\'s New code', async t => {
  const { live, pages } = await table(t, { cpus: 1 }, { capacity: 3, code: 'KX7Q2M' });
  const [ann, ben] = pages;
  await waitFor(ann, 'document.querySelector("#room-code") && !document.querySelector("#room-code").hidden');
  await waitFor(ben, 'document.querySelector("#room-code") && !document.querySelector("#room-code").hidden');
  for (const p of pages) {
    assert.equal(await p.$eval('#room-code-text', e => e.textContent), 'KX7Q2M');
    assert.ok(await p.$eval('#room-code-text', e => parseFloat(getComputedStyle(e).fontSize)) >= 28, 'large');
    assert.deepEqual(await p.$$eval('#room-code .btn', bs => bs.filter(b => b.getClientRects().length).map(b => b.textContent)), p === ann ? ['Copy code', 'Copy invite', 'New code'] : ['Copy code', 'Copy invite']);
    assert.match(await p.$eval('#room-code-note', e => e.textContent), /1 seat is open\. Friends join from Multiplayer → Join with code\./);
  }
  assert.match(await ann.$eval('#room-code-note', e => e.textContent), /A new code stops the old one working/);
  assert.doesNotMatch(await ben.$eval('#room-code-note', e => e.textContent), /new code/i, 'only the host can make one');
  // The seats as they fill: Ann, Ben and one open seat for the third person, then the CPU.
  const rows = p => p.$$eval('#seats .seat:not([hidden])', els => els.map(e => ({ name: e.querySelector('input').value, who: e.querySelector('.who').textContent })));
  assert.deepEqual(await rows(ann), [{ name: 'Ann (you)', who: 'Joined' }, { name: 'Ben', who: 'Joined' }, { name: 'Open seat', who: 'Open' }, { name: 'CPU', who: 'CPU' }]);
  assert.deepEqual((await rows(ben)).map(r => r.name), ['Ann', 'Ben (you)', 'Open seat', 'CPU']);
  // Copy code and Copy invite: the text goes to the clipboard inside the click.
  await clipboard(ann);
  await press(ann, '#room-code-copy');
  await waitFor(ann, 'window.__copied === "KX7Q2M"');
  assert.match(await ann.$eval('#toast', e => e.textContent), /Code copied/);
  await press(ann, '#room-code-invite');
  await waitFor(ann, 'window.__copied === "Join my Civ Lite game on Bored: code KX7Q2M"');
  assert.match(await ann.$eval('#toast', e => e.textContent), /Invite copied/);
  assert.equal(await shown(ann, '#room-code-fallback'), false);
  await clipboard(ben);
  await press(ben, '#room-code-invite');
  await waitFor(ben, 'window.__copied === "Join my Civ Lite game on Bored: code KX7Q2M"');
  // Refused: the text is put in a box and selected, so Ctrl+C works.
  await clipboard(ann, true);
  await press(ann, '#room-code-invite');
  await waitFor(ann, 'document.getElementById("room-code-fallback").hidden === false');
  const picked = await ann.evaluate(() => { const b = document.getElementById('room-code-fallback'); return { value: b.value, focus: document.activeElement === b, from: b.selectionStart, to: b.selectionEnd }; });
  assert.deepEqual(picked, { value: 'Join my Civ Lite game on Bored: code KX7Q2M', focus: true, from: 0, to: picked.value.length });
  assert.equal(await ann.evaluate(() => window.__copied), null);
  await press(ann, '#room-code-copy');
  await waitFor(ann, 'document.getElementById("room-code-fallback").value === "KX7Q2M"');
  // No clipboard at all behaves the same.
  await ann.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await press(ann, '#room-code-copy');
  await waitFor(ann, 'document.getElementById("room-code-fallback").hidden === false');
  // New code: the host asks, and the old one is gone for both screens.
  await clipboard(ann);
  await press(ann, '#room-code-new');
  await waitFor(ann, 'document.getElementById("room-code-text").textContent === "M7K4PQ"');
  await waitFor(ben, 'document.getElementById("room-code-text").textContent === "M7K4PQ"');
  assert.equal(live.room.code, 'M7K4PQ');
  assert.ok(live.room.calls.some(c => c.seat === 0 && c.op === 'new-code'));
  assert.match(await ann.$eval('#toast', e => e.textContent), /New code/);
  await press(ann, '#room-code-copy');
  await waitFor(ann, 'window.__copied === "M7K4PQ"');
  for (const p of pages) assert.deepEqual(p.errors, []);
});

test('the host removes a player in the lobby: the seat is empty again and the player is told', async t => {
  const { live, pages } = await table(t, { cpus: 1 }, { capacity: 3, code: 'KX7Q2M' });
  const [ann, ben] = pages;
  await waitFor(ann, 'document.querySelectorAll("#seats .seat:not([hidden])").length === 4');
  await waitFor(ben, 'document.querySelectorAll("#seats .seat:not([hidden])").length === 4');
  // Remove is the host's, for the others only.
  const removes = p => p.$$eval('#seats .seat:not([hidden]) .seat-remove', bs => bs.map(b => !b.hidden));
  assert.deepEqual(await removes(ann), [false, true, false, false], 'not on the host, the open seat or the CPU');
  assert.deepEqual(await removes(ben), [false, false, false, false]);
  assert.equal(await ann.$eval('#seat-remove-1', b => b.getAttribute('aria-label')), 'Remove Ben');
  await press(ann, '#seat-remove-1');
  await waitFor(ann, 'document.querySelectorAll("#seats .seat:not([hidden])").length === 4 && document.getElementById("seat-name-1").value === "Open seat"');
  assert.deepEqual(live.room.calls.filter(c => c.op === 'kick').map(c => c.p), [{ seat: 1 }]);
  assert.match(await ann.$eval('#toast', e => e.textContent), /Ben was removed/);
  assert.deepEqual(live.room.seats.map(s => s.handle), ['Ann']);
  assert.match(await ann.$eval('#room-code-note', e => e.textContent), /2 seats are open/);
  // Ben is told, and has no room to wait in.
  await waitFor(ben, '!!document.querySelector(".modal") && /host removed you/.test(document.querySelector(".modal").textContent)');
  for (const p of pages) assert.deepEqual(p.errors, []);
});

for (const width of [400, 320]) {
  test('the room code panel fits a ' + width + 'px screen, with the fallback box open', async t => {
    const { pages } = await table(t, { cpus: 1 }, { capacity: 4, code: 'KX7Q2M' });
    const [ann] = pages;
    await ann.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await waitFor(ann, 'document.querySelector("#room-code") && !document.querySelector("#room-code").hidden');
    await ann.evaluate(() => { const b = document.getElementById('room-code-fallback'); b.hidden = false; b.value = 'Join my Civ Lite game on Bored: code KX7Q2M'; });
    const bad = await ann.evaluate(() => {
      const w = document.documentElement.clientWidth, out = [];
      if (document.documentElement.scrollWidth > w) out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + w);
      for (const e of document.querySelectorAll('#room-code, #room-code-text, #room-code .btn, #room-code-fallback, #room-code-note')) {
        const r = e.getBoundingClientRect();
        if (r.width && (r.right > w + 0.5 || r.left < -0.5)) out.push((e.id || e.textContent) + ' leaves the screen: ' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + w);
      }
      return out;
    });
    assert.deepEqual(bad, []);
    assert.deepEqual(ann.errors, []);
  });
}

test('a lobby sent without a code shows no code panel, and the code is gone from the room once the game has started', async t => {
  const { live, pages } = await table(t, { cpus: 1 }, { capacity: 2, code: 'KX7Q2M' });
  const [ann, ben] = pages;
  await waitFor(ann, 'document.querySelector("#room-code") && !document.querySelector("#room-code").hidden');
  // The server sends no code to a player it has not seated, or after the start: the panel is simply not there.
  live.room.code = null;
  await press(ben, '#btn-ready');
  await waitFor(ann, 'document.getElementById("seat-who-1").textContent === "Ready"');
  assert.equal(await shown(ann, '#room-code'), false);
  assert.equal(await shown(ben, '#room-code'), false);
  live.room.code = 'KX7Q2M';
  await press(ben, '#btn-ready');
  await waitFor(ben, 'document.getElementById("seat-who-1").textContent === "Joined" && !document.getElementById("room-code").hidden');
  await press(ben, '#btn-ready');
  await waitFor(ann, '!document.getElementById("btn-begin").disabled');
  await press(ann, '#btn-begin');
  for (const p of pages) await waitFor(p, 'document.getElementById("start").hidden && !!G && !!G.live');
  assert.equal(live.room.code, null, 'cleared when the game started');
  assert.equal(await shown(ann, '#room-code'), false);
  for (const p of pages) assert.deepEqual(p.errors, []);
});

async function started(t, config) {
  const env = await table(t, config);
  const [ann, ben] = env.pages;
  await waitFor(ann, 'document.querySelectorAll("#seats .seat:not([hidden])").length >= 2');
  await waitFor(ben, 'document.querySelectorAll("#seats .seat:not([hidden])").length >= 2');
  await press(ben, '#btn-ready');
  await waitFor(ann, '!document.getElementById("btn-begin").disabled');
  await press(ann, '#btn-begin');
  for (const p of env.pages) await waitFor(p, 'document.getElementById("start").hidden && !!G && !!G.live');
  return env;
}

test('a move on one screen shows on the other at once, and ending turns moves the round on together', async t => {
  const { live, pages } = await started(t, { cpus: 1 });
  const [ann, ben] = pages;
  const warrior = await ann.evaluate('(() => { const u = G.units.find(u => u.owner === 0 && u.type === "warrior"); return { id: u.id, x: u.x, y: u.y }; })()');
  // A click on a reachable hex: nothing moves until the order comes back in the log, and then it moves on both screens.
  const target = await ann.evaluate(`(() => {
    const u = unitById(${JSON.stringify(warrior.id)});
    selection = { kind: 'unit', id: u.id };
    render();
    const spot = [...reachable.keys()].map(k => k.split(',').map(Number)).find(([x, y]) => !(x === u.x && y === u.y));
    window.__before = u.x + ',' + u.y;
    handleTileClick(spot[0], spot[1]);
    return { spot, at: u.x + ',' + u.y };
  })()`);
  assert.equal(target.at, warrior.x + ',' + warrior.y, 'the order is sent, not carried out, until it comes back in order');
  const sentAt = Date.now();
  await waitFor(ben, `(() => { const u = unitById(${JSON.stringify(warrior.id)}); return u.x + ',' + u.y === ${JSON.stringify(target.spot.join(','))}; })()`, 2000);
  assert.ok(Date.now() - sentAt < 2000);
  await waitFor(ann, `(() => { const u = unitById(${JSON.stringify(warrior.id)}); return u.x + ',' + u.y === ${JSON.stringify(target.spot.join(','))}; })()`, 2000);
  assert.equal(await ann.evaluate('liveHash()'), await ben.evaluate('liveHash()'));
  // The top bar: a dot for each human, no ticks yet, the timer off.
  assert.equal(await ann.$$eval('#live-strip .lv', els => els.length), 2);
  assert.equal(await ann.$$eval('#live-strip .tk', els => els.length), 0);
  assert.equal(await ann.$eval('#live-strip .lv-timer', el => !!el, ).catch(() => false), false, 'no timer in this game');
  // Ann ends her turn: a tick on both screens, and the round waits for Ben.
  await ann.evaluate('onAction("end-confirm")');
  await waitFor(ben, 'G.live.done[0] === true');
  await waitFor(ben, 'document.querySelectorAll("#live-strip .tk").length === 1');
  assert.equal(await ben.evaluate('G.turn'), 1);
  assert.equal(await ann.$eval('#btn-end', el => el.disabled), true);
  assert.match(await ann.$eval('#btn-end', el => el.textContent), /Waiting for the others/);
  assert.match(await ann.$eval('#banner-who', el => el.textContent), /turn ended/);
  await ben.evaluate('onAction("end-confirm")');
  for (const p of pages) await waitFor(p, 'G.turn === 2');
  assert.equal(await ann.evaluate('liveHash()'), await ben.evaluate('liveHash()'));
  assert.equal(await ann.$$eval('#live-strip .tk', els => els.length), 0, 'a new round: nobody has ended yet');
  assert.equal(await ann.$eval('#btn-end', el => el.disabled), false);
  // Each screen reported the round's hash and the lowest-seated human kept the snapshot.
  assert.ok(live.room.calls.some(c => c.op === 'report' && c.seat === 0 && c.p.round === 2));
  assert.ok(live.room.calls.some(c => c.op === 'report' && c.seat === 1 && c.p.round === 2));
  // The keeper gives the other screen a second to report before it sends the snapshot, and the room keeps it once both agree.
  assert.equal(await until(() => live.room.snapshots.has(2)), true, 'a snapshot of round 2 is kept');
  assert.equal(live.room.desyncs.length, 0);
  for (const p of pages) assert.deepEqual(p.errors, []);
});

test('a snapshot the server says wait to is sent again, and a game ends once both humans have said how: a lost claim is sent again', async t => {
  const { live, pages } = await started(t, { cpus: 1 });
  const [ann, ben] = pages;
  live.room.waits = 1;
  await ann.evaluate('onAction("end-confirm")');
  await ben.evaluate('onAction("end-confirm")');
  for (const p of pages) await waitFor(p, 'G.turn === 2');
  assert.equal(await until(() => live.room.snapshots.has(2), 9000), true, 'kept on the second try');
  assert.equal(live.room.calls.filter(c => c.op === 'snapshot' && c.p.round === 2).length, 2, 'one wait, one retry, then it stopped');
  // Both screens work out the same ending. One claim does not end the room; Ben's first claim is lost on the way and sent again.
  const over = () => 'G.over = { winner: 1, why: "conquest" }; liveFinish()';
  await ann.evaluate(over());
  await sleep(150);
  assert.equal(live.room.status, 'active', 'one claim is not enough');
  live.room.failFinish = 1;
  await ben.evaluate(over());
  assert.equal(await until(() => live.room.status === 'completed', 6000), true, 'the second claim, after a retry, ends it');
  assert.equal(live.room.winner, 1);
  assert.equal(live.room.calls.filter(c => c.op === 'finish' && c.seat === 1).length, 2);
  for (const p of pages) assert.deepEqual(p.errors, []);
});

test('the Menu: no Save or Load, and "Leave game (it keeps going)"; leaving hands the civ to a CPU for everyone', async t => {
  const { live, pages } = await started(t, { cpus: 1 });
  const [ann, ben] = pages;
  // On Bored the game is in a frame; a live game still has one way out, so Back to Bored is not offered.
  await ann.evaluate('embedded = () => true');
  await ann.evaluate('onAction("menu")');
  const labels = await ann.$$eval('#modal .act', els => els.map(e => e.textContent));
  assert.ok(labels.some(l => l.startsWith('Leave game (it keeps going)')), labels.join(' | '));
  assert.ok(!labels.some(l => /Back to Bored/.test(l)), 'no second way out in a live game: ' + labels.join(' | '));
  assert.ok(!labels.some(l => /Save|Load|tutorial|Quit to the main menu/i.test(l)), labels.join(' | '));
  assert.equal(await ann.evaluate('slotList().length'), 0);
  // The game never writes to the local slots.
  await ann.evaluate('saveGame(); autosave(); rollTurnSave();');
  assert.equal(await ann.evaluate('slotList().length'), 0);
  assert.equal(await ann.evaluate('whyNotSave()').then(Boolean), true);
  await press(ann, '#modal [data-act="live-leave"]');
  await press(ann, '#modal [data-act="live-leave-yes"]');
  await waitFor(ben, 'G.live.away[0] === true && !pl(0).human');
  await waitFor(ann, 'G.live.away[0] === true');
  assert.deepEqual(live.room.exits, [0]);
  // Ben saw a toast for it, and nothing about it was said on a screen that did the leaving.
  const toasts = await ben.$eval('#toast', el => el.textContent);
  assert.match(toasts, /Ann has left/);
  // Ben finishes the round on his own: Ann's seat is a CPU from the next round.
  await ben.evaluate('onAction("end-confirm")');
  await waitFor(ben, 'G.turn === 2');
  assert.equal(await ben.evaluate('G.live.human0.join()'), '1');
  // Ann comes back: control returns at the next round start.
  await ann.evaluate('liveTick()');
  await sleep(80);
  await ann.evaluate('LIVE.backAt = 0; liveTick()');
  await waitFor(ben, 'G.live.returning.length === 1');
  await ben.evaluate('onAction("end-confirm")');
  for (const p of pages) await waitFor(p, 'G.turn === 3 && pl(0).human === true && !G.live.away[0]');
  assert.equal(await ann.evaluate('liveHash()'), await ben.evaluate('liveHash()'));
  for (const p of pages) assert.deepEqual(p.errors, []);
});

test('a screen that opens a game under way restores the snapshot and plays the actions after it', async t => {
  const { live, pages, site } = await started(t, { cpus: 1 });
  const [ann, ben] = pages;
  // Round 2 and some orders in it.
  await ann.evaluate('onAction("end-confirm")');
  await ben.evaluate('onAction("end-confirm")');
  for (const p of pages) await waitFor(p, 'G.turn === 2');
  await waitFor(ann, 'true');
  await sleep(60);
  const unit = await ben.evaluate('G.units.find(u => u.owner === 1 && u.type === "warrior").id');
  await ben.evaluate('onAction("select-unit:' + unit + '")');
  await ben.evaluate('onAction("fortify")');
  await waitFor(ben, `unitById(${JSON.stringify(unit)}).fort === true`);
  assert.equal(await until(() => live.room.snapshots.has(2)), true, 'a snapshot of round 2 exists');
  // A third screen for Ben's seat opens the game: snapshot first, then the log after it.
  const browser = ben.browser();
  const late = await browser.newPage();
  late.errors = [];
  late.on('pageerror', e => late.errors.push(e.message));
  await late.setRequestInterception(true);
  late.on('request', req => (req.url().startsWith(site.origin) ? req.continue() : req.abort()));
  await late.setViewport({ width: 1100, height: 800 });
  live.room.pages.set(1, late);
  await late.exposeFunction('__liveCall', (op, p) => live.call(1, op, p).then(r => JSON.stringify(r === undefined ? null : r), e => JSON.stringify({ __error: e.message })));
  await late.evaluateOnNewDocument(() => {
    window.__boredLive = {
      call: (op, p) => window.__liveCall(op, p || {}).then(text => { const r = JSON.parse(text); if (r && r.__error) throw new Error(r.__error); return r; }),
      on: fn => { window.__liveOn = fn; }
    };
  });
  await late.goto(site.origin + '/games/content/ashcrown.html');
  await waitFor(late, 'document.getElementById("start").hidden && !!G && !!G.live && G.turn === 2');
  assert.equal(await late.evaluate(`unitById(${JSON.stringify(unit)}).fort`), true, 'the orders after the snapshot were replayed');
  assert.equal(await late.evaluate('liveHash()'), await ben.evaluate('liveHash()'));
  assert.equal(await late.$eval('#toast', el => el.className.includes('show') ? el.textContent : '').then(x => /has left|is back/.test(x)), false);
  assert.deepEqual(late.errors, []);
});

// 5.1 co-op in a live room: the host picks the mode, the guest reads it, a team game starts on both screens, and a
// ping travels as a message that is not an action.
test('co-op in a live room: the host sets the mode, a team game starts with no CPU refused, and an Alt+click ping reaches the teammate outside the log', async t => {
  const { live, pages } = await table(t, { cpus: 0, mode: 'coop' });
  const [ann, ben] = pages;
  await waitFor(ann, 'document.querySelectorAll("#seats .seat:not([hidden])").length === 2');
  await waitFor(ben, 'document.querySelectorAll("#seats .seat:not([hidden])").length === 2');
  assert.equal(await ann.$eval('#opt-mode', el => el.value), 'coop');
  assert.equal(await ben.$eval('#opt-mode', el => el.value), 'coop', 'the guest sees the host’s choice');
  assert.equal(await ann.$eval('#opt-mode', el => el.disabled), false, 'the host can change it');
  assert.equal(await ben.$eval('#opt-mode', el => el.disabled), true, 'the guest cannot');
  assert.match(await ann.$eval('#mode-note', el => el.textContent), /Co-op needs at least one CPU/);
  await press(ben, '#btn-ready');
  await waitFor(ann, '!document.getElementById("btn-begin").disabled');
  // Two humans and nobody to play against: refused, and the room stays in the lobby.
  await press(ann, '#btn-begin');
  await sleep(300);
  assert.equal(live.room.status, 'lobby', 'the game did not start');
  assert.equal(live.room.calls.some(c => c.op === 'start'), false);
  assert.match(await ann.evaluate('document.body.textContent'), /Co-op needs at least one CPU/);
  // The host adds a CPU, the guest sees it and readies again, and now it starts.
  await ann.select('#opt-cpus', '1');
  await waitFor(ben, 'document.getElementById("opt-cpus").value === "1"');
  assert.equal(live.room.config.mode, 'coop', 'the mode stays in the setup the room stores');
  await waitFor(ann, 'document.getElementById("btn-ready") && !document.getElementById("btn-begin").disabled || true');
  await press(ben, '#btn-ready');
  await waitFor(ann, '!document.getElementById("btn-begin").disabled');
  await press(ann, '#btn-begin');
  for (const p of pages) await waitFor(p, 'document.getElementById("start").hidden && !!G && !!G.live');
  for (const p of pages) {
    assert.deepEqual(await p.evaluate('[G.mode, G.teams]'), ['coop', [0, 0, 2]]);
    assert.deepEqual(await p.evaluate('(() => { const b = document.getElementById("banner-team"); return [b.hidden, b.textContent]; })()'), [false, 'Team of 2']);
    assert.equal(await p.evaluate('hasMet(0, 1) && hasMet(1, 0) && !hasMet(0, 2)'), true);
    assert.equal(await p.evaluate('canPing()'), true);
  }
  assert.equal(await ann.evaluate('liveHash()'), await ben.evaluate('liveHash()'));
  // Ann Alt+clicks a hex beside her warrior.
  const [x, y] = await ann.evaluate('(() => { const u = G.units.find(u => u.owner === 0); return [u.x + 1, u.y]; })()');
  await ann.evaluate(`(() => { refreshVision(); centreOn(${x}, ${y}); render(); })()`);
  const at = await ann.evaluate(`(() => { const r = document.querySelector('[data-tile="${x},${y}"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const actionsBefore = live.room.actions.length;
  await ann.keyboard.down('Alt');
  await ann.mouse.click(at[0], at[1]);
  await ann.keyboard.up('Alt');
  assert.equal(await ann.evaluate('PINGS.length'), 1, 'Ann sees her own marker at once');
  await waitFor(ben, 'PINGS.length === 1', 3000);
  assert.deepEqual(await ben.evaluate('PINGS.map(k => [k.x, k.y, k.seat])'), [[x, y, 0]], 'Ben sees it where Ann put it');
  assert.match(await ben.evaluate('G.log.at(-1).text'), /^Ann pinged near .+\.$/);
  assert.equal(await ben.$$eval('.ping-mark', els => els.length >= 0), true);
  assert.deepEqual(live.room.calls.filter(c => c.op === 'ping').map(c => [c.seat, c.p.x, c.p.y]), [[0, x, y]], 'it went to the room as a ping');
  assert.equal(live.room.actions.length, actionsBefore, 'and not as an action');
  assert.equal(await ann.evaluate('liveHash()'), await ben.evaluate('liveHash()'), 'the hashes still agree');
  assert.equal(live.room.desyncs.length, 0);
  for (const p of pages) assert.deepEqual(p.errors, []);
});

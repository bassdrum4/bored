// Cloud saves (Civ Lite 5.3) in real browsers: the hub's own bridge, Civ Lite's save screens, and the real SQL on a
// disposable Postgres. Several browser contexts play the same account, as several devices would; Supabase's REST
// endpoint for the save functions is answered from that database and nothing else leaves the machine.
// It runs on PGlite, or on native PostgreSQL when BT_TEST_DATABASE_URL names a disposable server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');
const { pgliteEnv, nativeEnv, url, ids } = require('./together-live-env.cjs');

const [A, B] = ids;
const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const SEATS = '[{ name: "Ann", human: true, civ: "qin" }, { name: "", human: false }]';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function environment() {
  if (url) return nativeEnv();
  try { return await pgliteEnv(); } catch (error) { return { unavailable: error.message }; }
}

// A site, a browser and a database; devices (browser contexts) come from device().
async function lab(t) {
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const env = await environment();
  if (env.unavailable) { t.skip('no disposable Postgres here: ' + env.unavailable); return null; }
  const site = await serve(path.join(__dirname, '../src'));
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const errors = [], unexpected = [];
  t.after(async () => { await browser.close(); await site.close(); await env.close(); });
  await env.admin('delete from public.game_saves');
  await env.admin('delete from bored_together.limits');

  // One device: its own storage, signed in as `user` (a token the hub would hold) or a guest.
  async function device(user, name) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    const net = { offline: false, calls: [] };
    await page.setRequestInterception(true);
    page.on('request', async req => {
      if (req.url().startsWith(site.origin) || !/^https?:/.test(req.url())) return req.continue();
      const address = new URL(req.url());
      const reply = (body, status = 200) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
      if (/(^|\.)(googleapis|gstatic)\.com$/.test(address.hostname)) return req.abort();
      if (address.hostname !== 'djdpttltfmwkofdrvkem.supabase.co') { unexpected.push(req.url()); return req.abort(); }
      const token = (req.headers().authorization || '').replace('Bearer ', '');
      const as = ids.find(id => 'tok-' + id === token) || null;
      if (address.pathname === '/rest/v1/rpc/bored_popular_games') return reply([{ game: 'trackbound', ranking: 1 }]);
      const save = /^\/rest\/v1\/rpc\/(save_(?:list|get|put|delete))$/.exec(address.pathname);
      if (save) {
        net.calls.push(save[1]);
        if (net.offline) return req.abort('failed');
        const b = JSON.parse(req.postData());
        const call = {
          save_list: ['select public.save_list($1) r', [b.p_game]],
          save_get: ['select public.save_get($1,$2) r', [b.p_game, b.p_slot]],
          save_put: ['select public.save_put($1,$2,$3::jsonb,$4,$5) r', [b.p_game, b.p_slot, JSON.stringify(b.p_header), b.p_data, b.p_expected]],
          save_delete: ['select public.save_delete($1,$2,$3) r', [b.p_game, b.p_slot, b.p_expected]]
        }[save[1]];
        try { return reply((await env.asUser(as, call[0], call[1]))[0].r); } catch (e) {
          return reply({ code: e.code, message: e.message, details: e.detail || null, hint: null }, e.code === 'PT409' ? 409 : e.code === '42501' ? 403 : 400);
        }
      }
      if (address.pathname.startsWith('/rest/v1/rpc/bt_')) return reply(null);   // Bored Together's own background calls; not what is tested here
      if (address.pathname === '/rest/v1/profiles') return reply([{ handle: 'Fixture' }]);
      if (address.pathname === '/auth/v1/logout') return reply(null);
      if (['/rest/v1/announcements', '/rest/v1/announcement_reads', '/rest/v1/score_rules', '/rest/v1/leaderboard', '/rest/v1/daily_leaderboard', '/rest/v1/scores', '/rest/v1/player_state', '/rest/v1/daily_results', '/rest/v1/play_events', '/rest/v1/product_events', '/rest/v1/enjoyment_feedback', '/rest/v1/analytics_admins', '/rest/v1/game_analytics_readers'].includes(address.pathname)) return reply(req.method() === 'GET' ? [] : null);
      unexpected.push(req.method() + ' ' + address.pathname);
      return req.abort();
    });
    const grid = () => page.waitForFunction(() => document.querySelectorAll('#grid .card').length > 0, { polling: 50 });
    await page.goto(site.url);
    await grid();
    if (user) {
      await page.evaluate(u => localStorage.setItem('bored.session', JSON.stringify({ access_token: 'tok-' + u, refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u, is_anonymous: false, email: 'fixture@example.test' } })), user);
      await page.reload();
      await grid();
    }
    const d = { page, net, name };
    // Opens Civ Lite in Bored's player, as a click on its card would.
    d.open = async () => {
      if (!(await page.evaluate(() => location.hash === '#ashcrown'))) await page.evaluate(() => { location.hash = '#ashcrown'; });
      else { await page.reload(); await grid(); }
      await page.waitForFunction(() => !document.querySelector('#player').hidden && document.querySelector('#frame').contentDocument?.getElementById('btn-new'), { polling: 50 });
      d.frame = await (await page.$('#frame')).contentFrame();
      await d.frame.waitForFunction('typeof SYNC === "object" && (SYNC.acct === null ? true : SYNC.list !== null)', { polling: 50, timeout: 15000 });
      return d.frame;
    };
    // A wait that runs out says what the game's sync state was, so a failure explains itself.
    d.until = async (expr, arg, ms) => {
      try { return await d.frame.waitForFunction(expr, { polling: 50, timeout: ms || 15000 }, arg); } catch (error) {
        const state = await d.frame.evaluate(() => JSON.stringify({ acct: SYNC.acct, list: SYNC.list, notes: syncAll(), tries: SYNC.tries, blocked: SYNC.blocked, timers: Object.keys(SYNC.timers), heads: ['auto', 'm1', 'm2'].map(id => slotHead(id) && [id, slotHead(id).at, slotHead(id).name]), sub: (document.getElementById('continue-sub') || {}).textContent }), null, 1).catch(e => 'no state: ' + e.message);
        error.message += '\n' + d.name + ' state: ' + state;
        throw error;
      }
    };
    d.run = expr => d.frame.evaluate(expr);
    d.start = () => d.run(`startGame({ seats: ${SEATS}, seed: 4242, map: 'islands', level: 'normal' })`);
    d.rows = () => d.frame.$$eval('.slot', els => els.map(e => ({ id: e.dataset.slot, name: e.querySelector('.slot-name').textContent, when: (c => { const w = c.querySelector('.slot-when'); if (!w) return ''; const copy = w.cloneNode(true); copy.querySelectorAll('svg').forEach(x => x.remove()); return copy.textContent; })(e), cloud: !!e.querySelector('.slot-when svg.cloud'), question: (e.querySelector('.slot-q') || {}).textContent || '', buttons: [...e.querySelectorAll('.slot-acts button')].map(b => b.textContent) })));
    d.press = (slot, label) => d.frame.evaluate((id, text) => {
      const b = [...document.querySelectorAll('.slot[data-slot="' + id + '"] button')].find(x => x.textContent === text);
      if (!b) throw new Error('No button ' + text + ' in ' + id);
      b.click();
    }, slot, label);
    d.screen = (mode) => d.run(`closeModal(); slotAction('slots', '${mode}')`);
    return d;
  }
  const saves = user => env.admin("select slot, version, header->>'name' as name, left(data, 3) as enc from public.game_saves where user_id = $1 order by slot", [user]);
  return { env, site, device, saves, errors, unexpected };
}

test('save on one device, Load and Continue on another, and a clash is asked about first', async t => {
  const L = await lab(t);
  if (!L) return;
  const ann = await L.device(A, 'device A'), ben = await L.device(A, 'device B');
  await ann.open();
  await ann.start();
  // A named save goes up at once; the autosave goes up too; the turn autosaves never leave the device.
  await ann.run(`G.turn = 8; saveToSlot('m2', 'Campaign on A'); G.turn = 7; saveGame(); G.turn = 9; rollTurnSave();`);
  await ann.until(() => syncNote('m2') && syncNote('auto'));
  await sleep(300);
  assert.deepEqual((await L.saves(A)).map(r => [r.slot, r.version, r.name, r.enc]), [['auto', 1, 'Autosave · Turn 7', 'gz:'], ['m2', 1, 'Campaign on A', 'gz:']], 'compressed, and no turn autosave');
  // Its own screens say so: a cloud mark on each.
  await ann.screen('load');
  assert.deepEqual(Object.fromEntries((await ann.rows()).map(r => [r.id, r.cloud])), { auto: true, t1: false, m2: true });
  assert.ok(!(await ann.rows()).some(r => /On this device only/.test(r.when)));

  // Device B: the account's saves are listed but nothing is stored on this device yet.
  await ben.open();
  assert.equal(await ben.run(`localStorage.getItem(SLOT_PREFIX + 'm2')`), null, 'nothing from the account is kept on this device until it is loaded');
  assert.equal(await ben.run(`slotList().length`), 2, 'but the account’s saves are in its lists');
  await ben.until(() => document.getElementById('btn-continue') && !document.getElementById('btn-continue').hidden);
  assert.match(await ben.run(`document.getElementById('continue-sub').textContent`), /^Autosave · Turn 7 · Saved on another device · (just now|\d+ minutes? ago)$/, 'Continue says whose autosave it is');
  await ben.screen('load');
  const row = (await ben.rows()).find(r => r.id === 'm2');
  assert.match(row.when, /^\s*Saved on another device · (just now|\d+ minutes? ago)$/);
  assert.equal(row.cloud, true);
  assert.equal(row.name, 'Campaign on A');
  assert.deepEqual(row.buttons, ['Load', 'Delete']);
  await ben.press('m2', 'Load');
  await ben.until(() => G && G.seed === 4242 && !!SYNC.list && !!syncNote('m2'), undefined, 15000);
  assert.equal(await ben.run('G.turn'), 8, 'it is A’s game, as saved');
  assert.notEqual(await ben.run(`localStorage.getItem(SLOT_PREFIX + 'm2')`), null, 'loaded: now it is on this device');
  assert.equal(await ben.run(`syncNote('m2').v`), 1);
  await ben.screen('load');
  const loaded = (await ben.rows()).find(r => r.id === 'm2');
  assert.ok(loaded.cloud && !/another device/.test(loaded.when), 'once here it is simply in the account: ' + loaded.when);

  // Loading made that game B's autosave too, and it went up (it was played last, so it took the account's).
  await ben.until(() => syncNote('auto') && syncNote('auto').at === slotHead('auto').at);
  assert.equal((await L.saves(A)).find(r => r.slot === 'auto').name, 'Autosave · Turn 8');

  // A plays on and saves again: B's reloaded title offers A's newer autosave and Continue opens it.
  await ann.run(`G.turn = 21; saveGame()`);
  const rolling = async () => (await L.saves(A)).find(r => r.slot === 'auto');
  const before = (await rolling()).version;
  await sleep(500);
  assert.equal((await rolling()).version, before, 'the autosave goes up at most once a minute');
  assert.ok(await ann.run(`SYNC.timers.auto !== undefined`), 'it is waiting its turn');
  await ann.run(`clearTimeout(SYNC.timers.auto); delete SYNC.timers.auto; SYNC.lastAuto = 0; syncKick();`);   // the minute passes
  await ann.until(() => SYNC.list.auto && SYNC.list.auto.header.turn === 21 && syncNote('auto').at === slotHead('auto').at);
  await ben.open();
  await ben.until(() => document.getElementById('btn-continue') && /Saved on another device/.test(document.getElementById('continue-sub').textContent));
  await ben.run(`document.getElementById('btn-continue').click()`);
  await ben.until(() => G && G.turn === 21);

  // The same slot saved on both: A saves it again; B, which saw version 1, is asked before replacing.
  await ann.run(`saveToSlot('m2', 'A again')`);
  await ann.until(() => syncNote('m2').v === 2);
  await ben.screen('save');
  await ben.until(() => SYNC.list.m2 && SYNC.list.m2.version === 2);
  await ben.press('m2', 'Overwrite');
  let ask = (await ben.rows()).find(r => r.id === 'm2');
  assert.match(ask.question, /^This slot was saved on another device (just now|\d+ minutes? ago)\. Replace it\?$/);
  assert.deepEqual(ask.buttons, ['Replace', 'Cancel']);
  await ben.press('m2', 'Cancel');
  assert.equal((await L.saves(A)).find(r => r.slot === 'm2').name, 'A again', 'Cancel changes nothing');
  await ben.press('m2', 'Overwrite');
  await ben.press('m2', 'Replace');
  await ben.until(() => syncNote('m2') && syncNote('m2').v === 3);
  assert.deepEqual((await L.saves(A)).filter(r => r.slot === 'm2').map(r => [r.version, r.name]), [[3, await ben.run('G.players.filter(p => p.human).map(p => CIVS[p.civ].leader).join(" & ") + " · " + saveEra(G) + " · Turn " + G.turn')]], 'B’s save replaced it after the question');

  // Deleting asks the same way when the account's copy is newer than what this device saw.
  // (A has Save game open, so it has seen B's save and has said yes to replacing it, as the screen asks.)
  await ann.run(`(async () => { await syncRefresh(); syncAcknowledge('m2'); saveToSlot('m2', 'A third time'); })()`);
  await ann.until(() => syncNote('m2').v === 4);
  await ben.screen('load');
  await ben.until(() => SYNC.list.m2 && SYNC.list.m2.version === 4);
  await ben.run(`slotAction('slot-ask', 'delete', 'm2')`);
  ask = (await ben.rows()).find(r => r.id === 'm2');
  assert.match(ask.question, /^This slot was saved on another device .* Delete it\?$/);
  await ben.press('m2', 'Delete');
  await ben.until(() => !SYNC.list.m2);
  assert.equal((await L.saves(A)).some(r => r.slot === 'm2'), false);
  assert.deepEqual(L.errors, []);
  assert.deepEqual(L.unexpected, []);
});

test('nothing from the bridge carries a token, an email or an account id into the game', async t => {
  const L = await lab(t);
  if (!L) return;
  const ann = await L.device(A, 'device A');
  await ann.page.evaluateOnNewDocument(() => {});
  await ann.open();
  await ann.run(`window.__heard = []; addEventListener('message', e => window.__heard.push(JSON.stringify(e.data)))`);
  await ann.start();
  await ann.run(`saveToSlot('m1', 'Mine')`);
  await ann.until(() => syncNote('m1'));
  await ann.screen('load');
  await ann.run(`syncRefresh()`);
  const heard = (await ann.run('window.__heard')).join('\n');
  assert.ok(heard.includes('bored:saves-result'), 'the game did hear from the hub');
  for (const secret of ['tok-', A, 'fixture@example.test', 'fixture-refresh']) assert.ok(!heard.includes(secret), 'never ' + secret);
  const document = await ann.run('document.documentElement.outerHTML');
  assert.ok(!document.includes('tok-' + A));
  assert.deepEqual(L.errors, []);
});

test('a guest’s saves stay on the device, then go up on sign-in, and a clash keeps both', async t => {
  const L = await lab(t);
  if (!L) return;
  // The account already holds a different save in slot 3.
  await L.env.asUser(A, "select public.save_put('ashcrown', 'm3', $1::jsonb, 'plain:{}', 0)", [JSON.stringify({ v: 1, mv: 2, at: 5000, kind: 'manual', name: 'Account three', meta: 'Japan + 1 CPU', turn: 3, civ: 'japan', color: '#aaa', ink: '#111', era: 'Ancient' })]);
  // As a guest: saves behave as they always did. No marks, nothing sent.
  const guest = await L.device(null, 'guest');
  await guest.open();
  assert.equal(await guest.run('typeof window.__boredSaves'), 'object', 'the bridge is there, but there is nobody to sync for');
  assert.equal(await guest.run('SYNC.acct'), null);
  await guest.start();
  await guest.run(`saveToSlot('m1', 'Guest one'); saveToSlot('m3', 'Guest three'); saveGame();`);
  await guest.screen('load');
  const rows = await guest.rows();
  assert.deepEqual(rows.map(r => r.id).sort(), ['auto', 'm1', 'm3']);
  assert.ok(rows.every(r => !r.cloud && !/device only|another device/.test(r.when)), 'a guest sees no cloud marks');
  assert.deepEqual(guest.net.calls, [], 'and the hub is never asked for anything');
  assert.deepEqual((await L.saves(A)).map(r => r.slot), ['m3']);
  // Signing in (the session appears, the game reopens): the device's saves go up; slot 3 clashes.
  await guest.page.evaluate(u => localStorage.setItem('bored.session', JSON.stringify({ access_token: 'tok-' + u, refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u, is_anonymous: false, email: 'fixture@example.test' } })), A);
  await guest.open();
  await guest.until(() => slotHead('m1') && syncNote('m1') && slotHead('m2') && syncNote('m2'), undefined, 20000);
  assert.deepEqual((await L.saves(A)).map(r => [r.slot, r.name]).filter(r => r[0] !== 'auto'), [['m1', 'Guest one'], ['m2', 'Guest three (this device)'], ['m3', 'Account three']], 'both kept: the device’s clashing save has a name of its own');
  assert.equal(await guest.run(`slotHead('m3')`), null, 'slot 3 here is empty: the account’s save is listed, not stored');
  assert.equal(await guest.run(`slotHead('m2').name`), 'Guest three (this device)');
  await guest.screen('load');
  const after = Object.fromEntries((await guest.rows()).map(r => [r.id, r]));
  assert.match(after.m3.when, /^\s*Saved on another device/);
  assert.equal(after.m3.name, 'Account three');
  assert.ok(after.m1.cloud && after.m2.cloud);
  assert.deepEqual(L.errors, []);
});

test('a clash with every slot taken asks which to keep, and “Decide later” changes nothing', async t => {
  const L = await lab(t);
  if (!L) return;
  const head = (name, at) => ({ v: 1, mv: 2, at, kind: 'manual', name, meta: 'Japan + 1 CPU', turn: 3, civ: 'japan', color: '#aaa', ink: '#111', era: 'Ancient' });
  await L.env.asUser(A, "select public.save_put('ashcrown', 'm5', $1::jsonb, 'plain:{}', 0)", [JSON.stringify(head('Account five', 9000))]);
  const guest = await L.device(null, 'guest');
  await guest.open();
  await guest.start();
  await guest.run(`for (const id of MANUAL_IDS) saveToSlot(id, 'Guest ' + id)`);
  await guest.page.evaluate(u => localStorage.setItem('bored.session', JSON.stringify({ access_token: 'tok-' + u, refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u, is_anonymous: false, email: 'fixture@example.test' } })), A);
  await guest.open();
  await guest.until(() => UI.modalKind === 'syncask', undefined, 20000);
  assert.match(await guest.run('UI.modal.textContent'), /Two saves in slot 5[\s\S]*Guest m5[\s\S]*Keep this one[\s\S]*Account five[\s\S]*Keep this one[\s\S]*Decide later/);
  await guest.run(`document.querySelector('[data-act="sy-later"]').click()`);
  await guest.until(() => UI.modalLayer.hidden);
  assert.equal(await guest.run(`slotHead('m5').name`), 'Guest m5', 'the device’s save is still there');
  assert.equal((await L.saves(A)).find(r => r.slot === 'm5').name, 'Account five', 'and so is the account’s');
  // Asked again next time; this time the device's is kept.
  await guest.open();
  await guest.until(() => UI.modalKind === 'syncask', undefined, 20000);
  await guest.run(`document.querySelector('[data-act="sy-keep:device:m5"]').click()`);
  await guest.until(() => syncNote('m5') && syncNote('m5').v === 2, undefined, 20000);
  assert.equal((await L.saves(A)).find(r => r.slot === 'm5').name, 'Guest m5', 'the choice was the device’s, so it replaced the account’s');
  assert.deepEqual(L.errors, []);
});

test('offline, a save stays "On this device only" and goes up when the connection is back', async t => {
  const L = await lab(t);
  if (!L) return;
  const ann = await L.device(A, 'device A');
  await ann.open();
  await ann.start();
  ann.net.offline = true;
  await ann.run(`saveToSlot('m4', 'Saved on a train')`);
  await ann.until(() => SYNC.tries.m4 >= 1, undefined, 15000);
  assert.deepEqual(await L.saves(A), [], 'nothing reached the account');
  await ann.screen('load');
  const waiting = (await ann.rows()).find(r => r.id === 'm4');
  assert.match(waiting.when, /· On this device only$/);
  assert.equal(waiting.cloud, false);
  assert.equal(await ann.run(`slotHead('m4').name`), 'Saved on a train', 'play was never blocked');
  assert.ok(await ann.run(`SYNC.timers.m4 !== undefined`), 'a retry is scheduled, with backoff');
  ann.net.offline = false;
  await ann.run(`window.dispatchEvent(new Event('online'))`);
  await ann.until(() => syncNote('m4'), undefined, 20000);
  assert.deepEqual((await L.saves(A)).map(r => [r.slot, r.name]).filter(r => r[0] === 'm4'), [['m4', 'Saved on a train']]);
  await ann.screen('load');
  assert.equal((await ann.rows()).find(r => r.id === 'm4').cloud, true, 'now it has the cloud mark');
  assert.deepEqual(L.errors, []);
});

test('a second account on the same browser does not inherit the first one’s saves, and signing out leaves the device’s slots', async t => {
  const L = await lab(t);
  if (!L) return;
  const ann = await L.device(A, 'Ann');
  await ann.open();
  await ann.start();
  await ann.run(`saveToSlot('m1', 'Ann only')`);
  await ann.run(`saveGame()`);
  await ann.until(() => syncNote('m1') && syncNote('auto'));
  await ann.run(`G = null`);   // she leaves the game on screen, so going away autosaves nothing new
  assert.equal((await L.saves(B)).length, 0);
  // Ben signs in on the same browser: Ann's synced save is hers, so it is not uploaded to his account.
  await ann.page.evaluate(u => localStorage.setItem('bored.session', JSON.stringify({ access_token: 'tok-' + u, refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u, is_anonymous: false, email: 'fixture@example.test' } })), B);
  await ann.open();
  await sleep(1500);
  assert.deepEqual(await L.saves(B), [], 'Ann’s save did not go into Ben’s account');
  assert.equal(await ann.run(`slotHead('m1').name`), 'Ann only', 'it is still on the device');
  // Signed out: the device's own slots stay exactly as they were, with no marks.
  await ann.page.evaluate(() => localStorage.removeItem('bored.session'));
  await ann.open();
  assert.equal(await ann.run('SYNC.acct'), null);
  assert.equal(await ann.run(`slotHead('m1').name`), 'Ann only');
  await ann.screen('load');
  assert.ok((await ann.rows()).every(r => !r.cloud && !/device only|another device/.test(r.when)));
  assert.deepEqual(L.errors, []);
});

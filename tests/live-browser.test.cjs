// Two real browser accounts in one live Civ Lite room: the hub's own screens (Start a live game, the invitation in
// Your Games, the lobby, rejoining), the hub's live client, and the real SQL on a disposable Postgres. The only thing
// stood in for is Supabase Realtime, which is a protocol-faithful mock that is fed from the action table, so the
// test can cut it off and prove the one-second polling keeps the screens together.
// It runs on PGlite, or on native PostgreSQL when BT_TEST_DATABASE_URL names a disposable server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');
const { pgliteEnv, nativeEnv, url, ids } = require('./together-live-env.cjs');
const { createMockRealtime } = require('./mock-realtime.cjs');

const [A, B] = ids;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
const handles = ['WackyPenguin', 'BananaWizard', 'QuietOwl', 'NeverJoined', 'FourthPlayer', 'FifthPlayer', 'Anonymous'];
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

async function environment() {
  if (url) return nativeEnv();
  try { return await pgliteEnv(); } catch (error) { return { unavailable: error.message }; }
}

// The two-account setup: a site, the real SQL, a Realtime stand-in, and a browser account for each person.
async function harness(t) {
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const env = await environment();
  if (env.unavailable) { t.skip('no disposable Postgres here: ' + env.unavailable); return null; }
  const site = await serve(path.join(__dirname, '../src'));
  const realtime = await createMockRealtime();
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => { clearInterval(pump); await browser.close(); await site.close(); await realtime.close(); await env.close(); });

  // The database, as Supabase serves it: one call at a time per request, as the signed-in user.
  const sql = (user, text, params) => env.asUser(user, text, params);
  const errors = [], unexpected = [], seen = [];
  // Realtime in the real system is the database telling the socket about new rows; here a pump does that.
  const pushed = new Map();
  const pump = setInterval(async () => {
    try {
      const rows = await env.admin('select game_id, seq, seat, type, args, request_id from bored_live.actions order by game_id, seq');
      for (const row of rows) {
        if ((pushed.get(row.game_id) || 0) >= row.seq) continue;
        pushed.set(row.game_id, row.seq);
        realtime.push(row);
      }
    } catch (error) { /* the database is closing */ }
  }, 60);

  async function player(user) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(handles[ids.indexOf(user)] + ': ' + e.message));
    // The hub's WebSocket goes to the mock instead of Supabase; nothing else leaves the machine.
    await page.evaluateOnNewDocument(port => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native { constructor(address, protocols) { super(String(address).replace(/^wss:\/\/[^/]+/, 'ws://127.0.0.1:' + port), protocols); } };
    }, realtime.port);
    await page.setRequestInterception(true);
    page.on('request', async req => {
      if (req.url().startsWith(site.origin) || !/^https?:/.test(req.url())) return req.continue();
      const address = new URL(req.url());
      const reply = (body, status = 200) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
      if (/(^|\.)(googleapis|gstatic)\.com$/.test(address.hostname)) return req.abort();
      if (address.hostname !== 'djdpttltfmwkofdrvkem.supabase.co') { unexpected.push(req.url()); return req.abort(); }
      const identity = req.headers().authorization?.replace('Bearer ', '');
      const as = ids.includes(identity) ? identity : null;
      const rpc = async fn => { try { return reply(await fn()); } catch (e) { return reply({ message: e.message, code: e.code }, 400); } };
      if (address.pathname === '/rest/v1/rpc/bt_live_rpc') {
        const { action, args } = JSON.parse(req.postData());
        seen.push(action);
        return rpc(async () => (await sql(as, 'select public.bt_live_rpc($1,$2::jsonb) result', [action, JSON.stringify(args)]))[0].result);
      }
      if (address.pathname === '/rest/v1/rpc/bt_rpc') {
        const { action, args } = JSON.parse(req.postData());
        return rpc(async () => (await sql(as, 'select public.bt_rpc($1,$2::jsonb) result', [action, JSON.stringify(args)]))[0].result);
      }
      if (address.pathname === '/rest/v1/rpc/bt_invite_rpc') {
        const { action, args } = JSON.parse(req.postData());
        return rpc(async () => (await sql(as, 'select public.bt_invite_rpc($1,$2::jsonb) result', [action, JSON.stringify(args)]))[0].result);
      }
      // A signed-in Civ Lite also asks for the account's saves (5.3): answered by the real functions, as the rest is.
      const save = /^\/rest\/v1\/rpc\/(save_(?:list|get|put|delete))$/.exec(address.pathname);
      if (save) {
        const b = JSON.parse(req.postData());
        const call = {
          save_list: ['select public.save_list($1) r', [b.p_game]],
          save_get: ['select public.save_get($1,$2) r', [b.p_game, b.p_slot]],
          save_put: ['select public.save_put($1,$2,$3::jsonb,$4,$5) r', [b.p_game, b.p_slot, JSON.stringify(b.p_header), b.p_data, b.p_expected]],
          save_delete: ['select public.save_delete($1,$2,$3) r', [b.p_game, b.p_slot, b.p_expected]]
        }[save[1]];
        try { return reply((await sql(as, call[0], call[1]))[0].r); } catch (e) { return reply({ code: e.code, message: e.message, details: e.detail || null }, e.code === 'PT409' ? 409 : 400); }
      }
      if (address.pathname === '/rest/v1/profiles') return reply([{ handle: handles[ids.indexOf(identity)] }]);
      if (address.pathname === '/auth/v1/logout') return reply(null);
      if (['/rest/v1/announcements', '/rest/v1/announcement_reads', '/rest/v1/score_rules', '/rest/v1/leaderboard', '/rest/v1/daily_leaderboard', '/rest/v1/scores', '/rest/v1/player_state', '/rest/v1/daily_results', '/rest/v1/play_events', '/rest/v1/product_events', '/rest/v1/enjoyment_feedback', '/rest/v1/analytics_admins', '/rest/v1/game_analytics_readers'].includes(address.pathname)) return reply(req.method() === 'GET' ? [] : null);
      unexpected.push(req.method() + ' ' + address.pathname);
      return req.abort();
    });
    await page.goto(site.url);
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length > 0, { polling: 50 });
    // A guest (no user) never signs in.
    if (user) {
      await page.evaluate(u => localStorage.setItem('bored.session', JSON.stringify({ access_token: u, refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u, is_anonymous: false, email: 'fixture@example.test' } })), user);
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll('#grid .card').length > 0, { polling: 50 });
    }
    return page;
  }
  const waitPage = (page, expr, arg, ms = 15000) => page.waitForFunction(expr, { polling: 50, timeout: ms }, arg);
  const press = (page, text) => page.evaluate(label => {
    const b = [...document.querySelectorAll('#together button')].find(x => x.textContent === label && !x.disabled);
    if (!b) throw new Error('No enabled button: ' + label);
    b.click();
  }, text);
  async function hubButton(page, text) {
    await waitPage(page, label => !document.querySelector('#together').hasAttribute('aria-busy') && [...document.querySelectorAll('#together button')].some(b => b.textContent === label && !b.disabled), text);
    await press(page, text);
  }
  // A button in a live game's row, once the list has finished refreshing (a click during a refresh is ignored).
  async function rowButton(page, labels) {
    await waitPage(page, pattern => !document.querySelector('#together').hasAttribute('aria-busy') && [...document.querySelectorAll('[data-live-id] button')].some(b => new RegExp(pattern).test(b.textContent)), labels);
    await page.evaluate(pattern => [...document.querySelectorAll('[data-live-id] button')].find(b => new RegExp(pattern).test(b.textContent)).click(), labels);
  }
  async function game(page) {
    try {
      await waitPage(page, () => !document.querySelector('#player').hidden && document.querySelector('#frame').contentDocument?.getElementById('start'));
    } catch (error) {
      // Say what the hub was doing, so a failure reads as more than a timeout.
      const note = await page.evaluate(() => JSON.stringify({ status: document.querySelector('#together-status')?.textContent, player: document.querySelector('#player').hidden, frame: document.querySelector('#frame').srcdoc.length })).catch(() => '?');
      throw new Error('The game did not open. ' + note + ' calls: ' + seen.join(',') + ' errors: ' + JSON.stringify(errors) + ' unexpected: ' + JSON.stringify(unexpected));
    }
    return (await page.$('#frame')).contentFrame();
  }
  const inGame = (frame, expr, arg, ms) => frame.waitForFunction(expr, { polling: 50, timeout: ms || 15000 }, arg);
  const click = (frame, selector) => frame.evaluate(sel => document.querySelector(sel).click(), selector);

  return { env, site, realtime, browser, errors, unexpected, seen, player, waitPage, press, hubButton, rowButton, game, inGame, click };
}

test('two accounts start a live game from Bored Together, move, end turns, lose Realtime, and rejoin', async t => {
  const h = await harness(t);
  if (!h) return;
  const { env, realtime, errors, unexpected, seen, player, waitPage, hubButton, rowButton, game, inGame, click } = h;
  const ann = await player(A), ben = await player(B);

  // Ann opens Bored Together, starts a live game, and invites Ben from the member list.
  for (const page of [ann, ben]) { await page.evaluate(() => document.querySelector('#together-nav').click()); await waitPage(page, () => !document.querySelector('#together').hidden); }
  await hubButton(ann, 'Start a live game');
  await waitPage(ann, () => document.querySelector('#bt-live-people .bt-person'));
  assert.equal(await ann.$eval('#bt-live-create', b => b.disabled), true, 'nobody is picked yet');
  assert.match(await ann.$eval('#together-content', e => e.textContent), /Pick 1 to 3 members/);
  const benBox = '#bt-live-pick-' + B;
  await ann.evaluate(sel => document.querySelector(sel).click(), benBox);
  await waitPage(ann, () => !document.querySelector('#bt-live-create').disabled);
  await hubButton(ann, 'Open lobby');
  const annGame = await game(ann);
  await inGame(annGame, () => !document.getElementById('pane-setup').hidden && document.querySelectorAll('#seats .seat:not([hidden])').length === 3);
  const room = (await env.admin("select id, status from bored_live.games order by created_at desc limit 1"))[0];
  assert.equal(room.status, 'lobby');
  // The deal is random on the server, and some civs have no plain warrior (China's is the Terracotta Warrior), so
  // the two humans pick their civs: the run does not depend on the deal.
  await annGame.select('#seat-civ-0', 'rome');
  for (let i = 0; i < 40 && (await env.admin('select civ from bored_live.seats where game_id=$1 and seat=0', [room.id]))[0].civ !== 'rome'; i++) await sleep(100);
  assert.equal((await env.admin('select civ from bored_live.seats where game_id=$1 and seat=0', [room.id]))[0].civ, 'rome');
  // Ben sees the invitation in Your Games, with who is in it, and joins.
  await ben.evaluate(() => document.querySelector('#together-refresh').click());
  await waitPage(ben, id => document.querySelector('[data-live-id="' + id + '"]'), room.id);
  assert.match(await ben.$eval('[data-live-id]', e => e.textContent), /Invited[\s\S]*WackyPenguin[\s\S]*BananaWizard \(you\)/);
  await rowButton(ben, '^Join$');
  const benGame = await game(ben);
  await inGame(benGame, () => document.querySelectorAll('#seats .seat:not([hidden])').length === 3 && document.getElementById('seat-who-1').textContent === 'Joined');
  await inGame(annGame, () => document.getElementById('seat-who-1').textContent === 'Joined');
  assert.equal((await env.admin('select state from bored_live.seats where game_id=$1 and seat=1', [room.id]))[0].state, 'joined');
  await benGame.select('#seat-civ-1', 'celts');
  await inGame(annGame, () => document.getElementById('seat-civ-1').value === 'celts');
  // Ben is ready; Ann starts. Both screens open the same game.
  await click(benGame, '#btn-ready');
  await inGame(annGame, () => !document.getElementById('btn-begin').disabled);
  await click(annGame, '#btn-begin');
  for (const frame of [annGame, benGame]) await inGame(frame, () => document.getElementById('start').hidden && !!G && !!G.live && G.turn === 1);
  assert.equal(await annGame.evaluate('liveHash()'), await benGame.evaluate('liveHash()'));
  assert.equal(await annGame.evaluate('G.players.length'), 3);
  assert.deepEqual(await annGame.evaluate('G.players.slice(0, 2).map(p => p.civ)'), ['rome', 'celts']);
  assert.equal((await env.admin('select status from bored_live.games where id=$1', [room.id]))[0].status, 'active');

  // Ann moves a unit; Ben sees it within two seconds.
  const move = async (frame, owner) => frame.evaluate(`(() => {
    const u = G.units.find(x => x.owner === ${owner} && x.type === unitFor(${owner}, 'warrior'));   // a civ's own, which some replace
    selection = { kind: 'unit', id: u.id };
    render();
    const spot = [...reachable.keys()].map(k => k.split(',').map(Number)).find(([x, y]) => !(x === u.x && y === u.y));
    handleTileClick(spot[0], spot[1]);
    return { id: u.id, spot };
  })()`);
  const arrived = (frame, order) => inGame(frame, o => { const u = unitById(o.id); return u.x + ',' + u.y === o.spot.join(','); }, order, 2000);
  const order = await move(annGame, 0);
  const sent = Date.now();
  await arrived(benGame, order);
  assert.ok(Date.now() - sent < 2000, 'the other screen has it inside two seconds');
  await arrived(annGame, order);
  assert.equal(await annGame.evaluate('liveHash()'), await benGame.evaluate('liveHash()'));
  assert.ok(realtime.state.joins.length >= 2, 'both screens joined Realtime');

  // Each ends their turn; the round moves on for both.
  await annGame.evaluate('onAction("end-confirm")');
  await inGame(benGame, () => G.live.done[0] === true);
  assert.equal(await benGame.evaluate('G.turn'), 1, 'the round waits for Ben');
  await benGame.evaluate('onAction("end-confirm")');
  for (const frame of [annGame, benGame]) await inGame(frame, () => G.turn === 2);
  assert.equal(await annGame.evaluate('liveHash()'), await benGame.evaluate('liveHash()'));
  // The server has both screens' hashes for the round, they agree, and a snapshot is stored.
  await waitPage(ann, async id => true, room.id);
  let hashes;
  for (let i = 0; i < 40; i++) { hashes = await env.admin('select seat, hash from bored_live.hashes where game_id=$1 and round=2 order by seat', [room.id]); if (hashes.length === 2) break; await sleep(100); }
  assert.equal(hashes.length, 2);
  assert.equal(hashes[0].hash, hashes[1].hash);
  for (let i = 0; i < 40; i++) { if ((await env.admin('select count(*)::int n from bored_live.snapshots where game_id=$1 and round=2', [room.id]))[0].n === 1) break; await sleep(100); }
  assert.equal((await env.admin('select count(*)::int n from bored_live.snapshots where game_id=$1 and round=2', [room.id]))[0].n, 1);
  assert.equal((await env.admin('select count(*)::int n from bored_live.desyncs where game_id=$1', [room.id]))[0].n, 0);
  assert.equal((await env.admin('select round from bored_live.games where id=$1', [room.id]))[0].round, 2);

  // Realtime dies and stays dead: the one-second polling carries Ben's move to Ann.
  realtime.state.refuse = true; realtime.drop();
  await sleep(300);
  const second = await move(benGame, 1);
  const resent = Date.now();
  await arrived(annGame, second);
  assert.ok(Date.now() - resent < 2500, 'polling is enough while the socket is down');
  assert.equal(await annGame.evaluate('liveHash()'), await benGame.evaluate('liveHash()'));
  realtime.state.refuse = false;

  // Ben leaves the screen, and finds the game in Your Games with Ann online. Opening it again rejoins it.
  await ben.evaluate(() => { document.querySelector('#menu-toggle').click(); document.querySelector('#back').click(); });
  await waitPage(ben, () => document.querySelector('#player').hidden);
  await ann.evaluate('0');
  await annGame.evaluate('onAction("end-confirm")');
  await ben.evaluate(() => document.querySelector('#together-refresh').click());
  await waitPage(ben, id => !document.querySelector('#together').hasAttribute('aria-busy') && /Live/.test(document.querySelector('[data-live-id="' + id + '"]')?.textContent || ''), room.id);
  const row = await ben.$eval('[data-live-id]', e => e.textContent);
  assert.match(row, /Live/);
  assert.match(row, /WackyPenguin[\s\S]*online/);
  await rowButton(ben, '^(Open|Rejoin)$');
  const back = await game(ben);
  await inGame(back, () => !!G && !!G.live && G.turn >= 2 && !!document.getElementById('start').hidden);
  await inGame(back, () => LIVE.applied === LIVE.applied && true);
  // The reopened screen and Ann's agree on the state, the unit Ben moved before leaving is where he put it, and
  // Ben's turn in this round is still open (Ann has ended hers).
  const ahead = await annGame.evaluate('LIVE.applied');
  await inGame(back, n => LIVE.applied >= n, ahead);
  assert.equal(await annGame.evaluate('liveHash()'), await back.evaluate('liveHash()'));
  assert.equal(await back.evaluate(`(() => { const u = unitById(${JSON.stringify(second.id)}); return u.x + ',' + u.y; })()`), second.spot.join(','));
  assert.equal(await back.evaluate('G.live.done[1]'), false);
  assert.ok(seen.includes('load') || seen.includes('sync'), 'it read the log from the server');
  // And it keeps playing: Ben ends his turn from the rejoined screen and the round moves on for Ann.
  await back.evaluate('onAction("end-confirm")');
  await inGame(annGame, () => G.turn === 3);
  await inGame(back, () => G.turn === 3);
  assert.equal(await annGame.evaluate('liveHash()'), await back.evaluate('liveHash()'));
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
});

// Civ Lite's Multiplayer screen with the real hub and the real SQL: Ann hosts a co-op game from the title screen and
// invites Ben, Ben sees the tag and joins from there, both start, Ann leaves from the Menu and lands on the title
// screen, and rejoins from Your live games. A guest and an account that is not in Bored Together get their prompts.
test('Civ Lite Multiplayer: host a co-op game from the title screen, join from the invite, leave to the title screen, rejoin', async t => {
  const h = await harness(t);
  if (!h) return;
  const { env, errors, unexpected, player, waitPage, inGame } = h;
  const ann = await player(A), ben = await player(B);
  // Civ Lite opened the ordinary way, from the library; its frame is the one the hub reloads, so ask for it each time.
  const frameOf = async page => (await page.$('#frame')).contentFrame();
  const inFrame = async (page, expr, arg, ms = 15000) => {
    const end = Date.now() + ms;
    for (;;) {
      try { return await (await frameOf(page)).waitForFunction(expr, { polling: 50, timeout: Math.max(500, end - Date.now()) }, arg); }
      catch (error) { if (Date.now() > end) throw error; await sleep(100); }   // the document was replaced under the wait: look again
    }
  };
  const openCivLite = async page => { await page.evaluate(() => { location.hash = 'ashcrown'; }); await waitPage(page, () => !document.querySelector('#player').hidden); };
  const act = async (page, selector) => { await inFrame(page, sel => !!document.querySelector(sel) && !document.querySelector(sel).disabled, selector); await (await frameOf(page)).evaluate(sel => document.querySelector(sel).click(), selector); };
  const titleReady = page => inFrame(page, () => typeof G !== 'undefined' && !G && !document.getElementById('start').hidden && !document.getElementById('pane-title').hidden && !document.getElementById('btn-mp').hidden);

  await openCivLite(ann);
  await titleReady(ann);
  assert.equal(await (await frameOf(ann)).$eval('#btn-mp .mi-sub', e => e.textContent), 'Play live with friends on Bored');
  // Ann: Multiplayer, Host a live game, pick Ben, Co-op, open the lobby.
  await act(ann, '#btn-mp');
  await act(ann, '[data-act="mp-host"]');
  await inFrame(ann, () => document.querySelectorAll('#mp-people .mp-person').length >= 1 && !document.getElementById('pane-setup').hidden);
  const names = await (await frameOf(ann)).$$eval('#mp-people .mp-person span', s => s.map(e => e.textContent));
  assert.ok(names.includes('BananaWizard') && !names.includes('WackyPenguin'), 'members by name, not herself: ' + names.join(','));
  assert.ok(!(await (await frameOf(ann)).$eval('#mp-pick', e => e.outerHTML)).includes('@'), 'no emails in the picker');
  await (await frameOf(ann)).evaluate(() => { [...document.querySelectorAll('#mp-people .mp-person')].find(l => l.textContent === 'BananaWizard').querySelector('input').click(); });
  await (await frameOf(ann)).select('#opt-mode', 'coop');
  await act(ann, '#btn-begin');
  await inFrame(ann, () => !!LIVE.net && !document.getElementById('pane-setup').hidden && document.querySelectorAll('#seats .seat:not([hidden])').length === 3);
  const room = (await env.admin("select id, status, config from bored_live.games order by created_at desc limit 1"))[0];
  assert.equal(room.status, 'lobby');
  assert.equal(room.config.mode, 'coop', 'the setup chosen on the title screen is the room’s setup');
  assert.equal((await env.admin('select state from bored_live.seats where game_id=$1 and seat=1', [room.id]))[0].state, 'invited');

  // Ben opens Civ Lite: the tag counts the invite, and the Multiplayer screen shows who, Co-op and when.
  await openCivLite(ben);
  await titleReady(ben);
  await inFrame(ben, () => !document.getElementById('mp-tag').hidden && document.getElementById('mp-tag').textContent === '1');
  await act(ben, '#btn-mp');
  await inFrame(ben, () => /WackyPenguin invited you/.test(document.querySelector('.modal').textContent));
  const text = await (await frameOf(ben)).evaluate(() => document.querySelector('.modal').textContent);
  assert.match(text, /Co-op/);
  assert.match(text, /just now|minute/);
  assert.ok(!text.includes('@'), 'no email on the screen');
  await act(ben, '[data-act^="mp-join:"]');
  await inFrame(ben, () => !!LIVE.net && document.querySelectorAll('#seats .seat:not([hidden])').length === 3 && document.getElementById('seat-who-1').textContent === 'Joined');
  await inFrame(ann, () => document.getElementById('seat-who-1').textContent === 'Joined');
  // Both reach the lobby and start.
  await act(ben, '#btn-ready');
  await inFrame(ann, () => !document.getElementById('btn-begin').disabled);
  await act(ann, '#btn-begin');
  for (const page of [ann, ben]) await inFrame(page, () => document.getElementById('start').hidden && !!G && !!G.live && G.turn === 1);
  assert.equal(await (await frameOf(ann)).evaluate('liveHash()'), await (await frameOf(ben)).evaluate('liveHash()'));
  assert.equal(await (await frameOf(ann)).evaluate('G.teams.length > 0 && sameTeam(0, 1)'), true, 'a co-op game: Ann and Ben are teammates');
  assert.equal((await env.admin('select status from bored_live.games where id=$1', [room.id]))[0].status, 'active');

  // Ann leaves from the Menu: she lands on the title screen, still inside Bored's player, and the game goes on.
  await (await frameOf(ann)).evaluate('onAction("menu")');
  await act(ann, '[data-act="live-leave"]');
  await act(ann, '[data-act="live-leave-yes"]');
  await titleReady(ann);
  assert.equal(await ann.$eval('#player', e => e.hidden), false, 'not out in Bored');
  assert.equal((await env.admin('select controller from bored_live.seats where game_id=$1 and seat=0', [room.id]))[0].controller, 'cpu', 'a CPU plays her civ');
  assert.equal((await env.admin('select status from bored_live.games where id=$1', [room.id]))[0].status, 'active');
  // Your live games lists it with Rejoin, her friend online and the round; Rejoin puts her back in.
  await act(ann, '#btn-mp');
  await inFrame(ann, () => /Rejoin/.test(document.querySelector('.modal').textContent));
  const row = await (await frameOf(ann)).evaluate(() => document.querySelector('.mp-row[data-game]').textContent);
  assert.match(row, /Co-op/);
  assert.match(row, /Round 1/);
  assert.match(row, /BananaWizard/);
  assert.match(row, /a CPU is playing/);
  await act(ann, '[data-act^="mp-open-game:"]');
  await inFrame(ann, () => !!G && !!G.live && G.turn >= 1 && document.getElementById('start').hidden);
  assert.equal(await (await frameOf(ann)).evaluate('liveHash()'), await (await frameOf(ben)).evaluate('liveHash()'));

  // A guest and an account that has not joined Bored Together get a prompt each, and the buttons reach the hub.
  const guest = await player(null);
  await openCivLite(guest);
  await titleReady(guest);
  await act(guest, '#btn-mp');
  await inFrame(guest, () => /Sign in to Bored to play online/.test(document.querySelector('.modal').textContent));
  await act(guest, '[data-act="mp-signin"]');
  await waitPage(guest, () => document.querySelector('#auth-dialog').open);
  const outsider = await player(ids[5]);
  await openCivLite(outsider);
  await titleReady(outsider);
  await act(outsider, '#btn-mp');
  await inFrame(outsider, () => /Join Bored Together to play online/.test(document.querySelector('.modal').textContent));
  await act(outsider, '[data-act="mp-together"]');
  await waitPage(outsider, () => document.querySelector('#player').hidden && !document.querySelector('#together').hidden);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
});

// Room codes (5.4) with the real hub and the real SQL: Ann hosts for two humans without inviting anybody and copies the
// code, Ben types it (lower case, with a dash) in Join with code and lands in the lobby, a third account is told the room
// is full, a new code makes the old one stale, and both start. The code reaches only the seated players.
test('Civ Lite room codes: host for two humans, join with a typed code, a third account is refused, a new code retires the old one, and the game starts', async t => {
  const h = await harness(t);
  if (!h) return;
  const { env, errors, unexpected, seen, player, waitPage, inGame } = h;
  const ann = await player(A), ben = await player(B), cleo = await player(ids[2]);
  const frameOf = async page => (await page.$('#frame')).contentFrame();
  const inFrame = async (page, expr, arg, ms = 15000) => {
    const end = Date.now() + ms;
    for (;;) {
      try { return await (await frameOf(page)).waitForFunction(expr, { polling: 50, timeout: Math.max(500, end - Date.now()) }, arg); }
      catch (error) { if (Date.now() > end) throw error; await sleep(100); }   // the document was replaced under the wait: look again
    }
  };
  const openCivLite = async page => { await page.evaluate(() => { location.hash = 'ashcrown'; }); await waitPage(page, () => !document.querySelector('#player').hidden); };
  const act = async (page, selector) => { await inFrame(page, sel => !!document.querySelector(sel) && !document.querySelector(sel).disabled, selector); await (await frameOf(page)).evaluate(sel => document.querySelector(sel).click(), selector); };
  const titleReady = page => inFrame(page, () => typeof G !== 'undefined' && !G && !document.getElementById('start').hidden && !document.getElementById('pane-title').hidden && !document.getElementById('btn-mp').hidden);
  const codeOf = async page => (await frameOf(page)).$eval('#room-code-text', e => e.textContent);
  const lobby = page => inFrame(page, () => !!LIVE.net && !document.getElementById('pane-setup').hidden && !document.getElementById('room-code').hidden && document.getElementById('room-code-text').textContent.length === 6);
  const dbRoom = async () => (await env.admin('select id, status, code, retired_code, capacity from bored_live.games order by created_at desc limit 1'))[0];
  const ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  // Joining with a code from the title screen: type it in the box, press Join.
  const tryCode = async (page, text) => {
    await (await frameOf(page)).evaluate(() => { const box = document.getElementById('mp-code'); box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); });
    await (await frameOf(page)).type('#mp-code', text);
    await act(page, '#mp-code-join');
  };
  const refusal = (page, words) => inFrame(page, w => document.getElementById('mp-code-error').textContent === w, words);

  // Ann: Multiplayer, Host a live game for two humans, nobody invited, open the lobby.
  await openCivLite(ann);
  await titleReady(ann);
  await act(ann, '#btn-mp');
  await act(ann, '[data-act="mp-host"]');
  await inFrame(ann, () => document.querySelectorAll('#mp-people .mp-person').length >= 1 && !document.getElementById('pane-setup').hidden);
  assert.equal(await (await frameOf(ann)).$eval('#opt-live-humans', e => e.value), '2');
  await act(ann, '#btn-begin');
  await lobby(ann);
  const code = await codeOf(ann);
  assert.match(code, ALPHABET);
  const room = await dbRoom();
  assert.deepEqual([room.status, room.code, room.capacity], ['lobby', code, 2]);
  assert.equal((await env.admin('select count(*)::int n from bored_live.seats where game_id=$1', [room.id]))[0].n, 1, 'nobody was invited: only the host is seated');
  assert.equal(await (await frameOf(ann)).$eval('#room-code-new', b => b.hidden), false, 'the host can make a new code');
  // Copy invite puts the invitation on the clipboard (a stand-in for it here: the page is not user-activated in this browser).
  await (await frameOf(ann)).evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.__copied = text; return Promise.resolve(); } } }); });
  await act(ann, '#room-code-invite');
  await inFrame(ann, c => window.__copied === 'Join my Civ Lite game on Bored: code ' + c, code);

  // Ben types the code in lower case with a dash, and lands in the lobby.
  await openCivLite(ben);
  await titleReady(ben);
  await act(ben, '#btn-mp');
  await inFrame(ben, () => !!document.getElementById('mp-code'));
  await tryCode(ben, code.slice(0, 3).toLowerCase() + '-' + code.slice(3).toLowerCase());
  await lobby(ben);
  assert.equal(await codeOf(ben), code, 'a joined player sees the code, to pass it on');
  assert.equal(await (await frameOf(ben)).$eval('#room-code-new', b => b.hidden), true, 'only the host makes a new code');
  await inFrame(ann, () => document.getElementById('seat-who-1').textContent === 'Joined' && document.getElementById('seat-name-1').value === 'BananaWizard');
  assert.deepEqual((await env.admin('select seat, state from bored_live.seats where game_id=$1 order by seat', [room.id])).map(r => r.state), ['joined', 'joined']);

  // A third account, Cleo, is a member of Bored Together but the room is full.
  await openCivLite(cleo);
  await titleReady(cleo);
  await act(cleo, '#btn-mp');
  await inFrame(cleo, () => !!document.getElementById('mp-code'));
  await tryCode(cleo, code);
  await refusal(cleo, 'That room is full');
  assert.equal(await cleo.$eval('#player', e => e.hidden), false);
  assert.equal(await (await frameOf(cleo)).evaluate(() => typeof G !== 'undefined' && !G && !document.getElementById('start').hidden), true, 'still on the title screen');
  assert.equal((await env.admin('select count(*)::int n from bored_live.seats where game_id=$1', [room.id]))[0].n, 2, 'nobody was added');
  // The Multiplayer screen, with Cleo's refusal under the box, fits a small phone inside Bored's player too.
  for (const width of [375, 320]) {
    await cleo.setViewport({ width, height: 800 });
    await sleep(200);
    const bad = await (await frameOf(cleo)).evaluate(() => {
      const w = document.documentElement.clientWidth, out = [];
      if (document.documentElement.scrollWidth > w) out.push('the screen scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + w);
      for (const e of document.querySelectorAll('.modal, .modal-body, .mp-join, #mp-code, #mp-code-join, #mp-code-error, .mp-acts')) {
        const r = e.getBoundingClientRect();
        if (r.width && (r.right > w + 0.5 || r.left < -0.5)) out.push((e.id || e.className) + ' leaves the screen: ' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + w);
      }
      return out;
    });
    assert.deepEqual(bad, [], 'the Multiplayer screen at ' + width + 'px');
  }
  await cleo.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });

  // Ann makes a new code: the old one is stale for Cleo, and Ben's lobby shows the new one.
  await act(ann, '#room-code-new');
  await inFrame(ann, old => document.getElementById('room-code-text').textContent !== old, code);
  const fresh = await codeOf(ann);
  assert.match(fresh, ALPHABET);
  assert.notEqual(fresh, code);
  assert.equal((await dbRoom()).code, fresh);
  await tryCode(cleo, code);
  await refusal(cleo, 'No open room with that code');
  await inFrame(ben, c => document.getElementById('room-code-text').textContent === c, fresh);
  // The new code is full too: a refused code never seats anybody.
  await tryCode(cleo, fresh);
  await refusal(cleo, 'That room is full');

  // Both are ready, Ann starts, and the game runs on both screens. The code is cleared.
  await act(ben, '#btn-ready');
  await inFrame(ann, () => !document.getElementById('btn-begin').disabled);
  await act(ann, '#btn-begin');
  for (const page of [ann, ben]) await inFrame(page, () => document.getElementById('start').hidden && !!G && !!G.live && G.turn === 1);
  assert.equal(await (await frameOf(ann)).evaluate('liveHash()'), await (await frameOf(ben)).evaluate('liveHash()'));
  for (const page of [ann, ben]) await (await frameOf(page)).evaluate('onAction("end-confirm")');
  for (const page of [ann, ben]) await inFrame(page, () => G.turn === 2);
  const started = await dbRoom();
  assert.equal(started.status, 'active');
  assert.equal(started.code, null, 'the code is cleared when the game starts');
  // Late: the game has started, and a code cannot seat anybody in a game under way.
  await tryCode(cleo, fresh);
  await refusal(cleo, 'That game has already started');
  // What the third account was shown never held a code of the room: only what she typed herself.
  const shown = await (await frameOf(cleo)).evaluate(() => document.body.textContent);
  assert.ok(!shown.includes(code) && !shown.includes(fresh), 'the room code never reached an account that is not seated');
  assert.equal((await env.admin('select count(*)::int n from bored_live.seats where game_id=$1', [room.id]))[0].n, 2, 'still Ann and Ben: a code seats nobody once the game has started');
  assert.ok(seen.includes('join_code') && seen.includes('new_code'));
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
});

// Bored Together's own page has the same box next to "Start a live game".
test('Bored Together: Join with code next to Start a live game says what went wrong under the field, and a good code opens the lobby', async t => {
  const h = await harness(t);
  if (!h) return;
  const { env, errors, unexpected, player, waitPage, game, inGame } = h;
  const ann = await player(A), ben = await player(B), cleo = await player(ids[2]);
  const room = await env.rpc(A, 'create', { game: 'ashcrown', capacity: 2, config: { map: 'pangaea' } });
  assert.match(room.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/, 'the host is given the code');
  for (const page of [ben, cleo]) { await page.evaluate(() => document.querySelector('#together-nav').click()); await waitPage(page, () => !document.querySelector('#together').hidden && !!document.querySelector('#bt-join-code')); }
  const join = async (page, text) => {
    await page.$eval('#bt-join-code', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('#bt-join-code', text);
    await page.evaluate(() => document.querySelector('#bt-join-go').click());
  };
  // The box sits in the same row as Start a live game.
  assert.equal(await ben.evaluate(() => document.querySelector('#bt-join-code').closest('.bt-start-actions') === [...document.querySelectorAll('#together button')].find(b => b.textContent === 'Start a live game').closest('.bt-start-actions')), true);
  // The page does not scroll sideways on a small phone, and the field and its button stay on the screen (CI's
  // together-browser checks the page's width at 320 too, but it needs PGlite).
  for (const width of [375, 320]) {
    await ben.setViewport({ width, height: 850 });
    const fit = await ben.evaluate(() => {
      const w = innerWidth, bad = [];
      if (document.documentElement.scrollWidth > w) bad.push('the page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + w);
      for (const e of document.querySelectorAll('.bt-start-actions, .bt-start-actions > *, #bt-join-code, #bt-join-go')) {
        const r = e.getBoundingClientRect();
        if (r.width && (r.right > w + 0.5 || r.left < -0.5)) bad.push((e.id || e.className || e.tagName) + ' leaves the screen: ' + Math.round(r.left) + '..' + Math.round(r.right));
      }
      return bad;
    });
    assert.deepEqual(fit, [], 'the Join with code row at ' + width + 'px');
  }
  await ben.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
  // A short code, a wrong code, then the right one typed as people type it: lower case, with a dash and a space.
  await join(ben, 'abc');
  await waitPage(ben, () => /6 characters/.test(document.querySelector('#bt-join-error')?.textContent || ''));
  await join(ben, 'zzzzzz');
  await waitPage(ben, () => document.querySelector('#bt-join-error')?.textContent === 'No open room with that code');
  assert.equal((await env.admin('select count(*)::int n from bored_live.seats where game_id=$1', [room.id]))[0].n, 1, 'a wrong code seats nobody');
  await join(ben, room.code.slice(0, 3).toLowerCase() + '- ' + room.code.slice(3).toLowerCase());
  const lobby = await game(ben);
  await inGame(lobby, () => !document.getElementById('pane-setup').hidden && document.getElementById('seat-who-1').textContent === 'Joined' && !document.getElementById('room-code').hidden);
  assert.equal(await lobby.$eval('#room-code-text', e => e.textContent), room.code, 'a player who joined sees the code');
  assert.equal((await env.admin('select state from bored_live.seats where game_id=$1 and seat=1', [room.id]))[0].state, 'joined');
  // Cleo with the same code: the room is full, and the page stays where it was.
  await join(cleo, room.code);
  await waitPage(cleo, () => document.querySelector('#bt-join-error')?.textContent === 'That room is full');
  assert.equal(await cleo.$eval('#player', e => e.hidden), true);
  assert.equal((await env.admin('select count(*)::int n from bored_live.seats where game_id=$1', [room.id]))[0].n, 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
});

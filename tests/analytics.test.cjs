const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');
const root = path.resolve(__dirname, '..');

test('active time excludes hidden, idle, unfocused, paused, loading and clock sleep', async () => {
  const { timeSlice, cleanSnapshot } = await import('../src/hub/analytics.js');
  const state = { visible: true, focused: true, ready: true, paused: false };
  assert.deepEqual(timeSlice(1000, 2000, 0, state), { activeMs: 1000, visibleMs: 1000 });
  for (const patch of [{ visible: false }, { ready: false }]) assert.deepEqual(timeSlice(1000, 2000, 0, { ...state, ...patch }), { activeMs: 0, visibleMs: 0 });
  for (const patch of [{ focused: false }, { paused: true }]) assert.deepEqual(timeSlice(1000, 2000, 0, { ...state, ...patch }), { activeMs: 0, visibleMs: 1000 });
  assert.deepEqual(timeSlice(60000, 61000, 0, state), { activeMs: 0, visibleMs: 1000 });
  assert.deepEqual(timeSlice(59500, 60500, 0, state), { activeMs: 500, visibleMs: 1000 });
  assert.deepEqual(timeSlice(1000, 100000, 0, state), { activeMs: 2000, visibleMs: 2000 });
  assert.deepEqual(cleanSnapshot({ slug: 'snake', input: 'private words', score: 20, won: true, token: 'secret', infinite: Infinity, nested: { email: 'x' } }), { score: 20, won: true });
});

test('aggregation preserves identity, session counts, mixed games, repeat days and CSV safety', async () => {
  const { summarizeEvents, eventsCSV } = await import('../src/hub/analytics-data.js');
  const event = (id, session, user, game, kind, time, active = 0, visible = active) => ({ id, session_id: session, user_id: user, game, kind, received_at: time, active_ms: active, visible_ms: visible, details: {} });
  const events = [
    event('1','s1','u1','snake','start','2026-10-20T15:00:00Z'),
    event('2','s1','u1','snake','end','2026-10-20T15:01:00Z',30000,60000),
    event('3','s2','u1','memory','daily_complete','2026-10-21T15:01:00Z',10000),
    event('4','s3',null,'snake','error','2026-10-21T15:01:00Z',5000),
    event('5','s4',null,'snake','end','2026-10-21T15:01:00Z',2000)
  ];
  const r = summarizeEvents(events, { u1: '=malicious()' });
  assert.deepEqual(r.totals, { active: 47000, visible: 77000, sessions: 4, accounts: 1, repeatAccounts: 1, guests: 2, errors: 1, completed: 1 });
  assert.equal(r.games.find(g => g.id === 'snake').users.size, 1);
  assert.equal(r.sessions.find(s => s.id === 's2').hasStart, false);
  assert.equal(r.days.reduce((n, d) => n + d.active, 0), r.totals.active);
  assert.equal(r.hours.reduce((n, h) => n + h.active, 0), r.totals.active);
  assert.match(eventsCSV(events, { u1: '=malicious()' }), /"'=malicious\(\)"/);
});

test('browser collects real iframe sessions; opt-out, admin denial, filtering, export and mobile layout', async t => {
  const executablePath = process.env.CHROME_PATH;
  assert.ok(executablePath && fs.existsSync(executablePath), 'Set CHROME_PATH');
  const site = await serve(path.join(root, 'src'));
  let browser;
  t.after(async () => { await browser?.close(); await site.close(); });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(), writes = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  let admin = false;
  const fixture = [
    { id:'a', session_id:'s1', user_id:'admin-id', game:'snake', kind:'start', received_at:new Date().toISOString(), active_ms:0, visible_ms:0, details:{} },
    { id:'b', session_id:'s1', user_id:'admin-id', game:'snake', kind:'end', received_at:new Date().toISOString(), active_ms:30000, visible_ms:45000, details:{score:10,reason:'close',snapshot:{score:10}} },
    { id:'c', session_id:'s2', user_id:null, game:'memory', kind:'error', received_at:new Date().toISOString(), active_ms:5000, visible_ms:5000, details:{code:'runtime'} }
  ];
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  page.on('request', req => {
    if (req.url().startsWith(site.origin)) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status:204, headers });
    if (req.url().includes('/play_events') && req.method() === 'POST') { writes.push(JSON.parse(req.postData())); return req.respond({ status:201, headers, body:'' }); }
    const body = req.url().includes('/analytics_admins') ? admin ? [{user_id:'admin-id'}] : [] : req.url().includes('/play_events') ? fixture : req.url().includes('/profiles') ? [{id:'admin-id',handle:'Daniel'}] : [];
    return req.respond({status:200, headers, contentType:'application/json', body:JSON.stringify(body)});
  });
  await page.goto(site.url);
  await page.waitForFunction(() => !!window.openGame);
  await page.evaluate(() => openGame('snake'));
  await page.waitForFunction(() => document.querySelector('#frame').contentWindow.__boredSnapshot?.().slug === 'snake');
  await page.evaluate(() => { document.querySelector('#frame').contentDocument.dispatchEvent(new Event('pointerdown')); });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => closeGame());
  await page.waitForFunction(() => document.querySelector('#player').hidden);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(writes.filter(e => e.kind === 'start').length,1);
  assert.equal(writes.filter(e => e.kind === 'end').length,1);
  assert.ok(writes.find(e => e.kind === 'end').visible_ms > 0);
  assert.equal(writes[0].user_id, null);
  assert.ok(writes.every(e => e.session_id === writes[0].session_id));
  if (await page.$eval('#claim-dialog', n => n.open)) await page.click('#claim-cancel');
  await page.click('.activity-notice summary');
  const before = writes.length;
  await page.click('#analytics-enabled');
  assert.equal(await page.$eval('#analytics-enabled', n => n.checked), false);
  await page.evaluate(() => { openGame('memory'); closeGame(); });
  await new Promise(r => setTimeout(r,100));
  assert.equal(writes.length,before);
  await page.goto(site.origin + '/analytics.html');
  await page.waitForFunction(() => !document.querySelector('#access').hidden);
  assert.equal(await page.$eval('#dashboard', n => n.hidden),true);
  await page.evaluate(() => localStorage.setItem('bored.session',JSON.stringify({access_token:'test',refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'admin-id'}})));
  admin = true;
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#totals strong').length === 8);
  assert.equal(await page.$eval('#games-table tbody',n=>n.children.length),2);
  fs.mkdirSync(path.join(root, '_build/shots'), { recursive:true });
  await page.setViewport({width:1100,height:900});
  await page.screenshot({path:path.join(root,'_build/shots/analytics-desktop.png'),fullPage:true});
  await page.select('#person','admin-id');
  assert.equal(await page.$eval('#games-table tbody',n=>n.children.length),1);
  await page.click('[data-view="sessions"]');
  await page.click('#sessions-table button');
  assert.match(await page.$eval('#session-json',n=>n.textContent), /"score": 10/);
  await page.select('#person','guest');
  await page.click('#errors-only');
  assert.equal(await page.$eval('#sessions-table tbody',n=>n.children.length),1);
  assert.match(await page.$eval('#sessions-table',n=>n.textContent), /Guest/);
  for (const width of [1100,375,320]) {
    await page.setViewport({width,height:900});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'layout at ' + width);
  }
  await page.screenshot({path:path.join(root,'_build/shots/analytics-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
});

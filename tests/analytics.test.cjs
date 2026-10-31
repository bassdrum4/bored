const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');
const root = path.resolve(__dirname, '..');

test('active time excludes hidden, idle, unfocused, paused, loading and clock sleep', async () => {
  const { timeSlice, cleanSnapshot, prepareAnalyticsRows } = await import('../src/hub/analytics.js');
  const state = { visible: true, focused: true, ready: true, paused: false };
  assert.deepEqual(timeSlice(1000, 2000, 0, state), { activeMs: 1000, visibleMs: 1000 });
  for (const patch of [{ visible: false }, { ready: false }]) assert.deepEqual(timeSlice(1000, 2000, 0, { ...state, ...patch }), { activeMs: 0, visibleMs: 0 });
  for (const patch of [{ focused: false }, { paused: true }]) assert.deepEqual(timeSlice(1000, 2000, 0, { ...state, ...patch }), { activeMs: 0, visibleMs: 1000 });
  assert.deepEqual(timeSlice(60000, 61000, 0, state), { activeMs: 0, visibleMs: 1000 });
  assert.deepEqual(timeSlice(59500, 60500, 0, state), { activeMs: 500, visibleMs: 1000 });
  assert.deepEqual(timeSlice(1000, 100000, 0, state), { activeMs: 2000, visibleMs: 2000 });
  assert.deepEqual(cleanSnapshot({ slug: 'snake', input: 'private words', score: 20, won: true, token: 'secret', infinite: Infinity, nested: { email: 'x' } }), { score: 20, won: true });
  assert.deepEqual(prepareAnalyticsRows([
    { _table:'product_events', id:'1', user_id:'stale-user', kind:'visit' }
  ], 'current-user'), [{ id:'1', user_id:'current-user', kind:'visit' }]);
  assert.deepEqual(prepareAnalyticsRows([
    { _table:'product_events', id:'2', user_id:'stale-user', kind:'visit' }
  ], null), [{ id:'2', user_id:null, kind:'visit' }]);
});

test('retention cohorts, meaningful play, and returning visitor calculations', async () => {
  const { summarizeEngagement, excludeAdmins } = await import('../src/hub/analytics-data.js');
  const make = (day, session, kind, active=0, details={}) => ({
    session_id:session, user_id:'u1', visitor_id:'11111111-1111-4111-8111-111111111111',
    game:'snake', kind, received_at:day+'T14:00:00Z', active_ms:active, details
  });
  const events = [
    make('2026-10-05','s1','start'),make('2026-10-05','s1','interaction'),
    make('2026-10-05','s1','end',65000),
    make('2026-10-12','s2','start'),make('2026-10-12','s2','end',62000)
  ];
  const visits=['2026-10-05','2026-10-12'].map((day,i)=>({
    user_id:'u1',visitor_id:'11111111-1111-4111-8111-111111111111',
    kind:'visit',received_at:day+'T13:00:00Z'
  }));
  const result=summarizeEngagement(events,visits,[{rating:5}],new Date('2026-10-21T14:00:00Z'));
  assert.equal(result.meaningful,2);
  assert.equal(result.interacting,1);
  assert.deepEqual(result.retention,{eligible:1,returned:1});
  assert.deepEqual(result.repeatGame,{eligible:1,returned:1});
  assert.equal(result.uniqueVisitors,1);
  assert.equal(result.visitorsByDay[1].returning,1);
  assert.equal(result.survey.average,5);
  const immature=summarizeEngagement(events,visits,[],new Date('2026-10-13T14:00:00Z'));
  assert.equal(immature.retention.eligible,0);
  const adminGuest={...events[0],session_id:'sx',user_id:null};
  const adminSigned={...events[1],user_id:'admin'};
  assert.deepEqual(excludeAdmins([adminGuest,adminSigned],['admin']),[]);
});

test('analytics admin accounts are dropped from reported events and time', async () => {
  const { excludeAdmins } = await import('../src/hub/analytics-data.js');
  const events = [{ user_id:'admin-a' }, { user_id:'u1' }, { user_id:null }];
  assert.deepEqual(excludeAdmins(events, ['admin-a', 'admin-b']), [{ user_id:'u1' }, { user_id:null }]);
  assert.equal(excludeAdmins(events, []), events);
  assert.equal(excludeAdmins(events, undefined), events);
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
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(file => fs.existsSync(file));
  assert.ok(executablePath, 'Set CHROME_PATH or install Chrome');
  const site = await serve(path.join(root, 'src'));
  let browser;
  t.after(async () => { await browser?.close(); await site.close(); });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(), writes = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  let admin = false, flightAvailable = false;
  const fixture = [
    { id:'a', session_id:'s1', user_id:'admin-id', game:'snake', kind:'start', received_at:new Date().toISOString(), active_ms:0, visible_ms:0, details:{} },
    { id:'b', session_id:'s1', user_id:'admin-id', game:'snake', kind:'end', received_at:new Date().toISOString(), active_ms:30000, visible_ms:45000, details:{score:10,reason:'close',snapshot:{score:10}} },
    { id:'c', session_id:'s2', user_id:null, game:'memory', kind:'error', received_at:new Date().toISOString(), active_ms:5000, visible_ms:5000, details:{code:'runtime'} },
    { id:'d', session_id:'s3', user_id:'player-id', game:'snake', kind:'start', received_at:new Date().toISOString(), active_ms:0, visible_ms:0, details:{} },
    { id:'e', session_id:'s3', user_id:'player-id', game:'snake', kind:'end', received_at:new Date().toISOString(), active_ms:20000, visible_ms:20000, details:{score:20,reason:'close',snapshot:{score:20}} }
  ];
  // Native F-14 flights are stored in a different table and must be read
  // through the admin-only RPC, not the Bored play_events endpoint.
  const flightFixture = [
    { id:'f1', session_id:'flight-1', user_id:null, visitor_id:'00000000-0000-4000-8000-000000000001', game:'f-14',
      kind:'start', received_at:new Date().toISOString(), active_ms:0, visible_ms:0, details:{mode:'cruise',aircraft:'tomcat'} },
    { id:'f2', session_id:'flight-1', user_id:null, visitor_id:'00000000-0000-4000-8000-000000000001', game:'f-14',
      kind:'interaction', received_at:new Date().toISOString(), active_ms:0, visible_ms:0, details:{mode:'cruise',aircraft:'tomcat'} },
    { id:'f3', session_id:'flight-1', user_id:null, visitor_id:'00000000-0000-4000-8000-000000000001', game:'f-14',
      kind:'end', received_at:new Date().toISOString(), active_ms:32000, visible_ms:42000, details:{mode:'cruise',aircraft:'tomcat',outcome:'recovered'} }
  ];
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  page.on('request', req => {
    if (req.url().startsWith(site.origin)) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status:204, headers });
    if (req.url().includes('/play_events') && req.method() === 'POST') { writes.push(...[].concat(JSON.parse(req.postData()))); return req.respond({ status:201, headers, body:'' }); }
    const body = req.url().includes('/analytics_admins') ? admin ? [{user_id:'admin-id'}] : [] : req.url().includes('/rpc/analytics_f14_events') ? flightAvailable ? flightFixture : [] : req.url().includes('/play_events') ? req.url().includes('game=eq.f-14') ? [] : fixture : req.url().includes('/profiles') ? [{id:'admin-id',handle:'Daniel'},{id:'player-id',handle:'Player Two'}] : [];
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
  // Admin play is staff activity: its two snake events never reach the report.
  assert.match(await page.$eval('#status',n=>n.textContent), /2 staff\/admin events recorded and excluded/);
  assert.equal(await page.$$eval('#person option', options => options.some(o => o.value === 'admin-id')), false);
  assert.equal(await page.$eval('#totals strong',n=>n.textContent), '25 s');
  // The new admin-only tab renders from the same protected endpoint set.
  await page.click('[data-view="engagement"]');
  assert.equal(await page.$$eval('#engagement-kpis .analytics-stat', nodes => nodes.length), 8);
  assert.match(await page.$eval('#engagement-together', n => n.textContent), /Organic matches/);
  assert.match(await page.$eval('#engagement-feedback', n => n.textContent), /Responses/);
  await page.click('[data-view="overview"]');
  assert.equal(await page.$eval('#games-table tbody',n=>n.children.length),2);
  assert.doesNotMatch(await page.$eval('#players-table',n=>n.textContent), /Daniel/);
  fs.mkdirSync(path.join(root, '_build/shots'), { recursive:true });
  await page.setViewport({width:1100,height:900});
  await page.screenshot({path:path.join(root,'_build/shots/analytics-desktop.png'),fullPage:true});
  await page.select('#person','player-id');
  assert.equal(await page.$eval('#games-table tbody',n=>n.children.length),1);
  await page.click('[data-view="sessions"]');
  await page.click('#sessions-table button');
  assert.match(await page.$eval('#session-json',n=>n.textContent), /"score": 20/);
  await page.select('#person','guest');
  await page.click('#errors-only');
  assert.equal(await page.$eval('#sessions-table tbody',n=>n.children.length),1);
  assert.match(await page.$eval('#sessions-table',n=>n.textContent), /Guest/);
  for (const width of [1100,375,320]) {
    await page.setViewport({width,height:900});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'layout at ' + width);
  }
  await page.screenshot({path:path.join(root,'_build/shots/analytics-mobile.png'),fullPage:true});
  flightAvailable = true;
  await page.select('#game', 'f-14');
  await page.click('#refresh');
  await page.waitForFunction(() => document.querySelector('#f14-totals')?.textContent?.includes('32 s'));
  assert.equal(await page.$eval('#f14-totals strong',n=>n.textContent), '1');
  assert.match(await page.$eval('#f14-aircraft',n=>n.textContent), /tomcat/);
  assert.match(await page.$eval('#f14-outcomes',n=>n.textContent), /Recovered/);
  assert.equal(await page.$eval('#games-table tbody',n=>n.children.length), 1);
  assert.deepEqual(errors,[]);
});


test('browser test telemetry is answered locally instead of reaching live analytics', async () => {
  const { respondToAnalytics, isolateAnalytics } = require('./telemetry-isolation.cjs');
  let replied = 0, continued = 0, handler;
  const request = url => ({ url: () => url, respond: async response => { assert.equal(response.status, 204); replied++; }, continue: () => continued++ });
  assert.equal(respondToAnalytics(request('https://djdpttltfmwkofdrvkem.supabase.co/rest/v1/play_events')), true);
  assert.equal(respondToAnalytics(request('https://djdpttltfmwkofdrvkem.supabase.co/rest/v1/play_events?select=*')), true);
  assert.equal(respondToAnalytics(request('https://djdpttltfmwkofdrvkem.supabase.co/rest/v1/product_events')), true);
  assert.equal(respondToAnalytics(request('https://djdpttltfmwkofdrvkem.supabase.co/rest/v1/enjoyment_feedback')), true);
  assert.equal(respondToAnalytics(request('https://djdpttltfmwkofdrvkem.supabase.co/rest/v1/score_rules')), false);
  await isolateAnalytics({ setRequestInterception: async enabled => assert.equal(enabled, true), on: (name, fn) => { assert.equal(name, 'request'); handler = fn; } });
  handler(request('https://djdpttltfmwkofdrvkem.supabase.co/rest/v1/play_events'));
  handler(request('https://djdpttltfmwkofdrvkem.supabase.co/rest/v1/product_events'));
  handler(request('https://djdpttltfmwkofdrvkem.supabase.co/rest/v1/enjoyment_feedback'));
  handler(request('http://127.0.0.1/index.html'));
  assert.equal(replied, 7);
  assert.equal(continued, 1);
});

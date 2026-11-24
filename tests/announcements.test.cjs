const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const root = path.join(__dirname, '..', 'src');

test('public announcement renders safely, persists guest dismissal and never traps gameplay', async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath);
  const site = await serve(root);
  let browser;
  t.after(async () => { await browser?.close(); await site.close(); });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const sent = [{
    id: 'announcement-test-1', title: '<script>not HTML</script>',
    body: 'Risk is available now.', audience: 'everyone', recipient_id: null, priority: 'normal', link_url: '#risk',
    active: true, published_at: new Date(Date.now() - 5000).toISOString(),
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString()
  }];
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().startsWith(site.origin)) return req.continue();
    if (req.url().includes('.supabase.co/rest/v1/announcements?')) {
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,OPTIONS',
        'access-control-allow-headers': 'apikey,authorization,content-type'
      };
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers });
      return req.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(sent) });
    }
    return req.abort();
  });
  await page.goto(site.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#announcement-banner:not([hidden])', { timeout: 10000 });
  assert.equal(await page.$eval('#announcement-banner h3', node => node.textContent), '<script>not HTML</script>');
  assert.equal(await page.$('#announcement-banner script'), null, 'title is text, never HTML');
  assert.equal(await page.$eval('#announcement-count', node => node.textContent), '1');

  // The announcement is a viewport-fixed overlay, not part of the scrolled page.
  const initial = await page.$eval('#announcement-banner', banner => ({
    top: banner.getBoundingClientRect().top,
    width: banner.getBoundingClientRect().width,
    position: getComputedStyle(banner).position,
    background: getComputedStyle(banner).backgroundColor
  }));
  assert.equal(initial.position, 'fixed');
  assert.ok(initial.top >= 0 && initial.top <= 20);
    const pageColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(initial.background, pageColor, 'banner contrasts with the page');
  await page.evaluate(() => window.scrollTo(0, 750));
  await page.waitForFunction(() => window.scrollY > 200);
  assert.ok(Math.abs(await page.$eval('#announcement-banner', banner => banner.getBoundingClientRect().top) - initial.top) <= 1,
    'banner stays in place while scrolling');

  // Starting a full-screen game hides the overlay without marking it as read.
  await page.evaluate(() => openGame('memory'));
  await page.waitForFunction(() => document.body.classList.contains('playing'));
  assert.equal(await page.$eval('#announcement-banner', banner => getComputedStyle(banner).display), 'none');
  await page.evaluate(() => closeGame());
  assert.equal(await page.$eval('#announcement-banner', banner => banner.hidden), false);

  await page.setViewport({ width: 375, height: 700 });
  const mobile = await page.$eval('#announcement-banner', banner => ({
    left: banner.getBoundingClientRect().left, right: banner.getBoundingClientRect().right,
    top: banner.getBoundingClientRect().top
  }));
  assert.ok(mobile.left >= 0 && mobile.right <= 375 && mobile.top >= 0, 'mobile banner fits the viewport');

  // Reading details, or following the game link, does not silently dismiss it.
  await page.click('#announcement-banner .announcement-actions button');
  assert.equal(await page.$eval('#announcement-dialog', d => d.open), true);
  await page.click('#announcement-close');
  assert.equal(await page.$eval('#announcement-banner', banner => banner.hidden), false);
  await page.click('#announcement-banner .announcement-dismiss');
  assert.equal(await page.$eval('#announcement-banner', banner => banner.hidden), true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('announcement-status').textContent === '');
  assert.equal(await page.$eval('#announcement-banner', element => element.hidden), true);
  assert.equal(await page.$eval('#announcement-count', element => element.hidden), true);
  assert.deepEqual(errors, []);
});

test('announcement composer offers targeted delivery and deliberate unpublishing', () => {
  const html = fs.readFileSync(path.join(root, 'analytics.html'), 'utf8');
  const module = fs.readFileSync(path.join(root, 'hub', 'announcement-admin.js'), 'utf8');
  assert.match(html, /data-view="announcements"/);
  assert.match(html, /id="announcement-recipients" multiple/);
  assert.match(html, /id="announcement-priority"/);
  assert.match(module, /recipient_id/);
  assert.match(module, /method: 'PATCH'/);
  assert.match(module, /method: 'POST'/);
});

test('a signed-in player votes in a poll and answers an open-ended question', async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath);
  const site = await serve(root);
  let browser;
  t.after(async () => { await browser?.close(); await site.close(); });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const userId = '11111111-1111-4111-8111-111111111111';
  const posts = [{
    id: 'poll-1', title: 'Which mode?', body: 'Pick one.', kind: 'poll',
    options: ['More of this', 'Fewer games'], audience: 'everyone', recipient_id: null,
    priority: 'normal', link_url: null, active: true,
    published_at: new Date(Date.now() - 5000).toISOString(),
    created_at: new Date().toISOString(), expires_at: null
  }, {
    id: 'question-1', title: 'What next?', body: 'Tell us.', kind: 'question', options: null,
    audience: 'everyone', recipient_id: null, priority: 'normal', link_url: null, active: true,
    published_at: new Date(Date.now() - 6000).toISOString(),
    created_at: new Date(Date.now() - 60000).toISOString(), expires_at: null
  }];
  let voted = null, answered = null;
  const cors = {
    'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'apikey,authorization,content-type,prefer'
  };
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.startsWith(site.origin)) return req.continue();
    const reply = (status, body) => req.respond({
      status, contentType: 'application/json', headers: cors,
      body: body === undefined ? '' : JSON.stringify(body)
    });
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (url.includes('/rest/v1/announcements?')) return reply(200, posts);
    if (url.includes('/rest/v1/announcement_reads?') && req.method() === 'GET') return reply(200, []);
    if (url.includes('/rest/v1/announcement_responses?') && req.method() === 'GET') return reply(200, []);
    if (url.includes('/rest/v1/announcement_reads?on_conflict')) return reply(204);
    if (url.includes('/rest/v1/rpc/respond_to_announcement')) {
      const body = JSON.parse(req.postData() || '{}');
      if (body.p_choice) voted = body; else answered = body;
      return reply(200, body.p_choice ? { choice: body.p_choice } : { answer: body.p_answer });
    }
    if (url.includes('/rest/v1/rpc/announcement_results')) return reply(200, [{ choice: 'More of this', votes: 1 }]);
    return req.abort();
  });
  await page.evaluateOnNewDocument(user => {
    localStorage.setItem('bored.session', JSON.stringify({
      access_token: 'fixture-token', refresh_token: 'fixture-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: user, is_anonymous: false, email: 'fixture@example.test' }
    }));
  }, userId);
  await page.goto(site.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#announcement-banner:not([hidden])', { timeout: 10000 });
  await page.click('#announcement-toggle');
  await page.waitForSelector('#announcement-dialog[open]');

  await page.$eval('#announcement-list .announcement-option', button => button.click());
  await page.waitForFunction(() => document.getElementById('announcement-status').textContent === 'Vote recorded.');
  assert.equal(voted.p_announcement, 'poll-1');
  assert.equal(voted.p_choice, 'More of this');
  assert.equal(await page.$eval('#announcement-list .announcement-chosen .announcement-result-label',
    node => node.textContent), 'More of this');

  const question = '#announcement-list .announcement-card:nth-child(2)';
  await page.type(question + ' textarea', 'A fishing game');
  await page.click(question + ' .announcement-submit');
  await page.waitForFunction(() => document.getElementById('announcement-status').textContent === 'Answer sent.');
  assert.equal(answered.p_announcement, 'question-1');
  assert.equal(answered.p_answer, 'A fishing game');
  assert.deepEqual(errors, []);
});

test('a guest votes in a poll without signing in, once per browser', async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath);
  const site = await serve(root);
  let browser;
  t.after(async () => { await browser?.close(); await site.close(); });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const posts = [{
    id: 'poll-guest', title: 'Which mode?', body: 'Pick one.', kind: 'poll',
    options: ['More of this', 'Fewer games'], audience: 'everyone', recipient_id: null,
    priority: 'normal', link_url: null, active: true,
    published_at: new Date(Date.now() - 5000).toISOString(),
    created_at: new Date().toISOString(), expires_at: null
  }];
  let voted = null;
  const cors = {
    'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'apikey,authorization,content-type,prefer'
  };
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.startsWith(site.origin)) return req.continue();
    const reply = (status, body) => req.respond({
      status, contentType: 'application/json', headers: cors,
      body: body === undefined ? '' : JSON.stringify(body)
    });
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (url.includes('/rest/v1/announcements?')) return reply(200, posts);
    if (url.includes('/rest/v1/rpc/respond_to_announcement')) {
      voted = JSON.parse(req.postData() || '{}');
      return reply(200, { choice: voted.p_choice });
    }
    if (url.includes('/rest/v1/rpc/announcement_results')) {
      return reply(200, [{ choice: 'More of this', votes: 3 }, { choice: 'Fewer games', votes: 1 }]);
    }
    return req.abort();
  });
  await page.goto(site.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#announcement-banner:not([hidden])', { timeout: 10000 });

  // The banner's poll is live for a guest: answering does not need "Read more"
  // or an account.
  assert.equal(await page.$('#announcement-banner .announcement-response-hint'), null);
  const options = await page.$$eval('#announcement-banner .announcement-option',
    nodes => nodes.map(node => ({ text: node.textContent, disabled: node.disabled })));
  assert.deepEqual(options, [
    { text: 'More of this', disabled: false },
    { text: 'Fewer games', disabled: false }
  ]);

  await page.$eval('#announcement-banner .announcement-option', button => button.click());
  await page.waitForFunction(() => document.getElementById('announcement-status').textContent === 'Vote recorded.');
  assert.equal(voted.p_announcement, 'poll-guest');
  assert.equal(voted.p_choice, 'More of this');
  assert.equal(voted.p_answer, null);
  assert.match(voted.p_guest, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bored.announcements.guestVotes')));
  assert.equal(saved['poll-guest'], 'More of this');

  // The browser remembers which way it voted, so a reload shows the choice and
  // the tally instead of asking again.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('hub-loading')?.hidden === true &&
    typeof document.getElementById('announcement-toggle').onclick === 'function');
  await page.click('#announcement-toggle');
  await page.waitForSelector('#announcement-dialog[open]');
  await page.waitForSelector('#announcement-list .announcement-option[aria-pressed="true"]');
  assert.equal(await page.$eval('#announcement-list .announcement-chosen .announcement-result-label',
    node => node.textContent), 'More of this');
  assert.deepEqual(errors, []);
});

test('an announcement can be a message, a poll or an open-ended question', () => {
  const html = fs.readFileSync(path.join(root, 'analytics.html'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'hub', 'announcement-admin.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'hub', 'announcements-ui.js'), 'utf8');
  assert.match(html, /id="announcement-kind"/);
  assert.match(html, /<option value="poll">Poll<\/option>/);
  assert.match(html, /<option value="question">Open-ended question<\/option>/);
  assert.match(html, /id="announcement-options"/);
  // The composer publishes the kind and its listed answers with the message.
  assert.match(admin, /kind, options, link_url/);
  assert.match(admin, /Give the poll 2 to 8 answers/);
  assert.match(admin, /announcement_responses/);
  // Players answer through the functions; open-ended answers stay private to
  // their author and the admins, and polls expose only a tally.
  assert.match(ui, /rpc\/respond_to_announcement/);
  assert.match(ui, /rpc\/announcement_results/);
  assert.match(ui, /announcement-option/);
  assert.match(ui, /announcement-response-hint/);
  // Guests vote with the browser id the page keeps; only written answers ask
  // for an account.
  assert.match(ui, /p_guest/);
  assert.match(ui, /guestVotes/);
});

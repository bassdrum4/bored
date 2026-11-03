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
  await page.click('#announcement-toggle');
  assert.ok(await page.$eval('#announcement-dialog', d => d.open));
  await page.click('#announcement-list button');
  assert.equal(await page.$eval('#announcement-banner', element => element.hidden), true);
  await page.click('#announcement-close');
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

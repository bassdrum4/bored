const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

test('game hash links open on load and follow URL navigation', async t => {
  const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
  assert.ok(chrome, 'Chrome is required');
  const site = await serve(path.resolve(__dirname, '../src'));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  t.after(async () => { await browser.close(); await site.close(); });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(site.origin) ? req.continue() : req.abort());

  await page.goto(site.url + '#qbert');
  await page.waitForFunction(() => window.current === 'qbert');
  assert.equal(await page.$eval('#player', el => el.hidden), false);
  assert.equal(new URL(page.url()).hash, '#qbert');

  await page.evaluate(() => closeGame());
  assert.equal(await page.evaluate(() => window.current), null);
  assert.equal(new URL(page.url()).hash, '');

  await page.evaluate(() => { location.hash = '#mahjong'; });
  await page.waitForFunction(() => window.current === 'mahjong');
  assert.equal(new URL(page.url()).hash, '#mahjong');

  await page.evaluate(() => { location.hash = '#library'; });
  await page.waitForFunction(() => window.current === null);
  assert.equal(new URL(page.url()).hash, '#library');

  await page.evaluate(() => openGame('qbert'));
  await page.waitForFunction(() => window.current === 'qbert');
  assert.equal(new URL(page.url()).hash, '#qbert');
  assert.deepEqual(pageErrors, []);
});

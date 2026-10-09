const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');

test('visual release captures and live F-14 embed', async t => {
  const root = path.resolve(__dirname, '..');
  const chrome = [process.env.CHROME_PATH, path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'), '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p)) || require('puppeteer').executablePath();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const shots = path.join(root, '_build', 'shots');
  fs.mkdirSync(shots, { recursive: true });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  for (const width of [1100, 375, 320]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(shots, 'release-hub-' + width + '.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.click('#daily-play');
    await page.waitForFunction(() => typeof document.querySelector('#frame').contentWindow.__boredSnapshot === 'function');
    // Let the original game's entrance animation finish before judging its contrast.
    await new Promise(resolve => setTimeout(resolve, 900));
    await page.screenshot({ path: path.join(shots, 'release-daily-' + width + '.png') });
    await page.click('#back');
    for (const slug of ['2048', 'memory', 'connect-four', 'aim-lab']) {
      await page.evaluate(id => openGame(id), slug);
      await page.waitForFunction(id => document.querySelector('#frame').contentWindow.__boredSnapshot?.().slug === id, {}, slug);
      await page.screenshot({ path: path.join(shots, 'release-' + slug + '-' + width + '.png') });
      await page.click('#back');
    }
  }
  assert.deepEqual(errors, []);
  await page.setViewport({ width: 1100, height: 900 });
  await page.evaluate(() => openGame('f-14'));
  await page.waitForFunction(() => document.querySelector('#frame').src === 'https://bassdrum4.github.io/f-14-4/');
  const frame = await (await page.$('#frame')).contentFrame();
  await frame.waitForSelector('canvas', { timeout: 30000 });
  const content = await frame.evaluate(() => ({ title: document.title, text: document.body.innerText.slice(0, 3500), canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })) }));
  console.log('F-14 embed:', JSON.stringify(content));
  assert.ok(content.canvas.some(c => c.width > 0 && c.height > 0));
  await page.screenshot({ path: path.join(shots, 'release-f14.png') });
  console.log('Release screenshots:', shots);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const siteRoot = path.join(root, 'src');

test('game finder uses public catalog games and respects multiplayer requirements', async () => {
  const [{ recommendGames, FINDER_QUESTIONS }, { ORDER }, { DISCOVERY }] = await Promise.all([
    import('../src/hub/game-finder.js'),
    import('../src/games/catalog.js'),
    import('../src/games/discovery.js')
  ]);
  assert.equal(FINDER_QUESTIONS.length, 6);
  assert.ok(FINDER_QUESTIONS.every(question => question.options.length === 4));
  const valid = new Set(ORDER.map(([slug]) => slug));
  const baseline = ['puzzle', 'medium', 'mid', 'solve', 'solo', 'strategy'];
  const results = recommendGames(baseline);
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map(game => game.slug)).size, 3);
  assert.ok(results.every(game => valid.has(game.slug) && game.name && game.reason));
  assert.ok(!results.some(game => game.slug === 'klang'));

  const withOnline = [...baseline]; withOnline[4] = 'online';
  const onlineResults = recommendGames(withOnline);
  assert.deepEqual(onlineResults.map(game => game.slug).sort(), ['f-14', 'imposter']);
  const withLocal = [...baseline]; withLocal[4] = 'local';
  const localResults = recommendGames(withLocal);
  assert.ok(localResults.length > 0);
  assert.ok(localResults.every(game => /2 local/.test(DISCOVERY[game.slug]?.players || '') ||
    game.slug === 'getaway-shootout'));
  assert.equal(recommendGames(['puzzle']).length, 0);
  assert.ok(recommendGames(baseline, { exclude: results.map(game => game.slug) }).every(game =>
    !results.some(previous => previous.slug === game.slug)));
});

test('game finder stays optional and plays through the existing hub', async t => {
  const puppeteer = require('puppeteer-core');
  const { serve } = require('./serve.cjs');
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(file => fs.existsSync(file));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(siteRoot);
  let browser;
  t.after(async () => {
    try { await browser?.close(); } finally { await site.close(); }
  });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/^https?:/.test(req.url()) && !req.url().startsWith(site.origin)) req.abort();
    else req.continue();
  });
  await page.setViewport({ width: 1280, height: 850 });
  await page.goto(site.url);
  await page.waitForFunction(() => document.querySelectorAll('#grid .card').length > 25);

  assert.ok(await page.evaluate(() =>
    document.querySelector('#daily').offsetTop <
    document.querySelector('#game-finder').offsetTop &&
    document.querySelector('#game-finder').offsetTop <
    document.querySelector('#library').offsetTop));
  assert.equal(await page.$eval('#game-finder', node => node.hidden), false);
  await page.click('#game-finder-open');
  assert.equal(await page.$eval('#game-finder-dialog', node => node.open), true);
  assert.match(await page.$eval('#game-finder-progress', node => node.textContent), /QUESTION 1 OF 6/);
  for (let i = 0; i < 6; i++) await page.click('.finder-option:first-child');
  assert.equal(await page.$$eval('.finder-result', nodes => nodes.length), 3);
  const recommended = await page.$eval('.finder-result', node => node.querySelector('h4').textContent);
  await page.click('.finder-result .finder-play');
  await page.waitForFunction(() => window.current != null);
  assert.equal(await page.evaluate(() => ORDER.find(([slug]) => slug === window.current)?.[1]), recommended);
  assert.equal(await page.$eval('#game-finder-dialog', node => node.open), false);
  await page.evaluate(() => closeGame({ force: true }));

  await page.click('#leaderboard-nav');
  assert.equal(await page.$eval('#game-finder', node => node.hidden), true);
  await page.click('#home-nav');
  assert.equal(await page.$eval('#game-finder', node => node.hidden), false);
  await page.click('#game-finder-open');
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#game-finder-dialog', node => node.open), false);
  assert.deepEqual(errors, []);
});

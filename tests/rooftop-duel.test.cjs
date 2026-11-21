const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const root = path.resolve(__dirname, '..');
const doc = path.join(root, 'src/games/content/rooftop-duel.html');

test('the restored Rooftop Snipers is editable source, not a payload', () => {
  const html = fs.readFileSync(doc, 'utf8');
  assert.match(html, /<title>Rooftop Snipers \(Editable\)<\/title>/);
  assert.match(html, /window\.__boredSnapshot = \(\) => \(\{\s*slug: 'rooftop-duel'/);
  // Plain source: no base64 payload, no compiled runtime, no off-site requests.
  assert.doesNotMatch(html, /base64,[A-Za-z0-9+/]{4000,}/);
  assert.doesNotMatch(html, /UnityWeb|\.unityweb|asm\.(?:code|memory|framework)|Il2Cpp/i);
  assert.doesNotMatch(html, /<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i);
  // The Unity export is separate and must stay where it was.
  assert.ok(fs.existsSync(path.join(root, 'src/games/content/rooftop-snipers.html')));
});

test('Rooftop Snipers (Editable) plays: jump, fire, a round won, then the next round', { timeout: 90000 }, async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(path.join(root, 'src'));
  let browser;
  t.after(async () => { try { await browser?.close(); } finally { await site.close(); } });
  browser = await puppeteer.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
  const page = await browser.newPage();
  const errors = [], failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push(request.url()));
  await page.goto(site.origin + '/games/content/rooftop-duel.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__test === 'object', { timeout: 15000 });

  assert.equal(await page.evaluate(() => window.__boredSnapshot().slug), 'rooftop-duel');

  // Jump.
  const ground = await page.evaluate(() => window.__test.state().players[0].y);
  await page.keyboard.down('w');
  await page.evaluate(() => window.__test.step(0.2));
  const air = await page.evaluate(() => window.__test.state().players[0].y);
  await page.keyboard.up('w');
  assert.ok(air < ground - 10, 'W lifts the player off the roof: ' + ground + ' -> ' + air);

  // Fire.
  await page.keyboard.press('f');
  assert.ok(await page.evaluate(() => window.__test.state().bullets > 0), 'F puts a shot in the air');

  // A round is won by knocking the rival off, which also starts the next one.
  const roundBefore = await page.evaluate(() => window.__test.state().round);
  await page.evaluate(() => {
    const round = window.__test.state().round;
    for (let shot = 0; shot < 8; shot++) {
      window.__test.fire(0);
      window.__test.step(1);
      if (window.__test.state().round !== round) break;
    }
  });
  const after = await page.evaluate(() => window.__test.state());
  assert.ok(after.wins[0] + after.wins[1] >= 1, 'a round was awarded: ' + JSON.stringify(after.wins));
  assert.equal(after.round, roundBefore + 1, 'the next round begins');

  // Two players.
  await page.evaluate(() => window.__test.mode('friend'));
  assert.equal(await page.evaluate(() => window.__boredSnapshot().cpu), false);
  assert.equal(await page.$eval('#pad-p2', element => element.hidden), false);

  // Something is actually drawn.
  const colours = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 97) seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
    return seen.size;
  });
  assert.ok(colours > 3, 'the canvas draws a scene, not one colour: ' + colours);

  assert.deepEqual(errors, [], 'no page or console errors');
  assert.deepEqual(failed, [], 'no failed requests');
});

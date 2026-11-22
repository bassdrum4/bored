'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'src/games/content/getaway-shootout');
const wrapper = fs.readFileSync(folder + '.html', 'utf8');

test('Getaway Shootout is the original locally hosted Unity WebGL build', async () => {
  const { ORDER, UNSCORED_GAMES, EXTERNS } = await import('../src/games/catalog.js');
  assert.deepEqual(ORDER.filter(([slug]) => slug === 'getaway-shootout'),
    [['getaway-shootout', 'Getaway Shootout']]);
  assert.ok(UNSCORED_GAMES.includes('getaway-shootout'));
  assert.equal(EXTERNS['getaway-shootout'], undefined);
  for (const file of ['Build/UnityLoader.js', 'unity/GetawayShootout.asm.code.unityweb',
    'unity/GetawayShootout.asm.framework.unityweb',
    'unity/GetawayShootout.asm.memory.unityweb',
    'unity/GetawayShootout.data.unityweb']) {
    assert.ok(fs.statSync(path.join(folder, file)).size > 5000, file + ' missing or empty');
  }
  const code = gunzipSync(fs.readFileSync(path.join(folder, 'unity/GetawayShootout.asm.code.unityweb'))).toString();
  assert.ok(code.length > 20_000_000, 'actual executable code must be preserved');
  const source = fs.readFileSync(path.join(root, 'src/prototypes/getaway-shootout/source/getaway-shootout.code.js'), 'utf8');
  assert.ok(source.length > code.length && source.includes('EDITABLE UNITY ASM.JS PROGRAM'));
  assert.doesNotMatch(wrapper, /<script[^>]+src=["']https?:/i, 'never load portal or third-party scripts directly');
});

test('Getaway Shootout boots its self-hosted Unity executable and reaches playable canvas', {timeout: 130000}, async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
  assert.ok(executablePath, 'Chrome/Chromium required for Unity integration test');
  const site = await serve(path.join(root, 'src'));
  let browser;
  t.after(async () => {try { await browser?.close(); } finally { await site.close(); }});
  browser = await puppeteer.launch({executablePath, headless: true,
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page = await browser.newPage();
  await page.setViewport({width: 960, height: 650});
  const errors = [], external = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().startsWith('http') && !request.url().startsWith(site.origin+'/')) {
      external.push(request.url());
      return request.respond({status:204, body:''});
    }
    return request.continue();
  });
  await page.goto(site.origin + '/games/content/getaway-shootout.html');
  const ok = await page.waitForFunction(() => window.__boredSnapshot?.().loaded === true, {timeout:95000})
    .then(()=>true,()=>false);
  if (!ok) {
    const details = await page.evaluate(() => ({
      snapshot: window.__boredSnapshot?.(), status:document.querySelector('#status')?.textContent,
      error:document.querySelector('#error')?.className,
      canvasCount:document.querySelectorAll('canvas').length
    }));
    assert.fail('Unity never reached ready: ' + JSON.stringify({details,errors,external}));
  }
  assert.equal(await page.$eval('#status', el => el.hidden), true);
  assert.ok(await page.$$eval('#gameContainer canvas', items => items.some(el => el.width > 0 && el.height > 0)));
  assert.deepEqual(external, [], 'the game should not need an external gaming host');
  assert.deepEqual(errors, []);
});

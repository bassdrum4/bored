const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '..');
// Match bored.test.cjs: hosted Ubuntu also has a Chromium launcher whose sandbox
// may be unavailable. Prefer the same working Google Chrome as the game suite.

test('discovery works offline, keeps its controls, and fits small screens', async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/^https?:/.test(req.url())) { requests.push(req.url()); req.abort(); }
    else req.continue();
  });
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === ORDER.length);

  await t.test('every game has useful metadata; every offline preview is in the file', async () => {
    const catalog = await page.evaluate(() => ORDER.map(([slug]) => ({ slug, online: !!EXTERNS[slug], meta: DISCOVERY[slug], preview: PREVIEWS[slug] })));
    for (const game of catalog) {
      assert.ok(game.meta.minutes && game.meta.pace && game.meta.inputs.length, game.slug);
      assert.ok(game.meta.inputs.every(input => ['Keyboard', 'Mouse', 'Touch'].includes(input)), game.slug);
      if (!game.online) assert.match(game.preview || '', /^data:image\/webp;base64,/, game.slug + ' has a bundled capture');
    }
    await page.$$eval('#grid img', images => images.forEach(image => image.loading = 'eager'));
    await page.waitForFunction(() => [...document.querySelectorAll('#grid img')].every(image => image.complete && image.naturalWidth > 0));
    assert.ok(fs.statSync(path.join(root, 'index.html')).size < 5096942 * 1.06, 'redesign adds less than 6% to the existing build');
    assert.equal(await page.$eval('#recent-empty', e => e.hidden), false);
    // The board sits above the library now: it belongs to the top of the page.
    assert.ok(await page.evaluate(() => document.querySelector('#leaderboard').offsetTop < document.querySelector('#library').offsetTop));
  });

  await t.test('collections intersect with search and filters, and can be cleared', async () => {
    for (const [id, predicate] of [
      ['quick', 'quick'], ['friends', 'players'], ['relax', 'pace']
    ]) {
      await page.click('[data-collection="' + id + '"]');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.collection), id, 'collection keeps keyboard focus');
      const actual = await page.$$eval('#grid .card', cards => cards.map(card => card.dataset.slug));
      const expected = await page.evaluate(kind => ORDER.filter(([slug]) => kind === 'quick' ? DISCOVERY[slug].quick : kind === 'players' ? DISCOVERY[slug].players === '2 local' : DISCOVERY[slug].pace === 'Relaxing').map(([slug]) => slug), predicate);
      assert.deepEqual(actual.sort(), expected.sort());
    }
    await page.click('[data-collection="friends"]');
    await page.click('[data-filter="Puzzle"]');
    assert.equal(await page.$$eval('#grid .card', cards => cards.length), 0);
    assert.equal(await page.$eval('#random', b => b.disabled), true);
    await page.click('#clear-filters');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'q');
    await page.type('#q', 'touch');
    assert.ok(await page.$$eval('#grid .card', cards => cards.length) > 0);
    assert.ok(await page.$$eval('#grid .game-inputs', spans => spans.every(span => span.textContent.includes('Touch'))));
    await page.click('#clear-filters');
  });

  await t.test('favorites and recents share one shelf of four and survive reload', async () => {
    await page.click('[aria-label="Add Memory to favorites"]');
    assert.equal(await page.$eval('#recent-empty', e => e.hidden), true);
    await page.click('#recent-list [data-slug="memory"]');
    await page.waitForFunction(() => document.querySelector('#frame').contentWindow.__boredSnapshot?.().slug === 'memory');
    await page.evaluate(() => closeGame());
    assert.equal(await page.evaluate(() => document.activeElement.closest('#recent-list')?.id), 'recent-list', 'focus follows a favorite when it becomes recent');
    await page.reload();
    assert.equal(await page.$$eval('#recent-list [data-slug="memory"]', nodes => nodes.length), 1);
    assert.match(await page.$eval('#recent-list', node => node.textContent), /Favorite/);
    // Five games played, four slots: the oldest drops off the shelf.
    for (const slug of ['2048', 'lights-out', 'snake', 'solitaire']) {
      await page.evaluate(id => openGame(id), slug);
      await page.evaluate(() => closeGame());
    }
    assert.equal(await page.$$eval('#recent-list [data-slug]', nodes => nodes.length), 4);
    assert.equal(await page.$$eval('#recent-list [data-slug="memory"]', nodes => nodes.length), 0);
  });

  await t.test('Surprise Me honors collections and keeps online extras opt-in', async () => {
    await page.click('[data-collection="friends"]');
    await page.click('#random');
    assert.equal(await page.evaluate(() => DISCOVERY[current].players), '2 local');
    await page.evaluate(() => closeGame());
    await page.click('#clear-filters');
    await page.type('#q', 'internet required');
    assert.equal(await page.$eval('#random', button => button.disabled), false);
    await page.click('#random');
    assert.equal(await page.evaluate(() => current), null);
    await page.click('[data-filter="Online"]');
    await page.click('#random');
    assert.equal(await page.evaluate(() => !!EXTERNS[current]), true);
    await page.evaluate(() => closeGame());
    await page.click('#clear-filters');
  });

  await t.test('layout, anchors, keyboard focus, and reduced motion at desktop and phone widths', async () => {
    const shots = path.join(root, '_build', 'discovery');
    fs.mkdirSync(shots, { recursive: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    for (const width of [1366, 1024, 768, 600, 375, 320]) {
      await page.setViewport({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(shots, 'home-' + width + '.png'), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow at ' + width);
      const targets = await page.$$eval('#daily-play,#collections button,#filters button,#grid .star,#random', nodes => nodes.map(node => ({ label: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
      assert.ok(targets.every(box => box.width >= 30 && box.height >= 30), 'usable control sizes at ' + width);
      const regions = await page.$$eval('#daily,#recent,#leaderboard,#library', nodes => nodes.map(node => ({ top: node.offsetTop, height: node.offsetHeight })));
      assert.ok(regions.every((region, index) => !index || region.top >= regions[index - 1].top + regions[index - 1].height), 'sections do not overlap');
    }
    await page.evaluate(() => document.querySelector('.skip-link').focus());
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'library');
    await page.keyboard.press('/');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'q');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'random');
    assert.notEqual(await page.$eval('#random', button => getComputedStyle(button).outlineStyle), 'none');
    assert.equal(await page.$eval('#hint', node => getComputedStyle(node).transitionDuration), '0s');
  });
  assert.deepEqual(errors, []);
  // The hub may try its existing score API. Previews and discovery must add none.
  assert.ok(requests.every(url => url.includes('.supabase.co/') || Object.values({f14:'https://bassdrum4.github.io/f-14-4/',klang:'https://youtubeplayer.freebuff.app/player'}).some(external => url.startsWith(external))), requests.join('\n'));
});

test('account UI and score sync still work through the redesigned hub (mock backend)', async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const rows = [], posted = [], notes = [], unexpected = [];
  const rules = Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'src/games/score-rules.json')))).map(([game, rule]) => ({ game, ...rule }));
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (!/^https?:/.test(request.url())) return request.continue();
    const url = new URL(request.url()), method = request.method();
    const reply = body => request.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return request.respond({ status: 204, headers });
    if (url.pathname === '/rest/v1/score_rules') return reply(rules);
    if (url.pathname === '/auth/v1/token') return reply({ access_token: 'mock-access', refresh_token: 'mock-refresh', expires_in: 3600, user: { id: 'test-user', email: 'tester@example.test' } });
    if (url.pathname === '/rest/v1/profiles') return reply([{ handle: 'tester' }]);
    if (url.pathname === '/rest/v1/scores') {
      if (method === 'POST') {
        const row = JSON.parse(request.postData());
        posted.push({ ...row, authorization: request.headers().authorization });
        rows.push(row);
        return reply(null);
      }
      return reply(rows);
    }
    if (url.pathname === '/rest/v1/leaderboard') return reply(rows.filter(row => !url.searchParams.get('game') || url.searchParams.get('game') === 'eq.' + row.game).map(row => ({ ...row, handle: 'tester' })));
    if (url.pathname === '/rest/v1/feedback' && method === 'POST') { notes.push(JSON.parse(request.postData())); return reply(null); }
    if (url.pathname === '/auth/v1/logout') return reply(null);
    unexpected.push(method + ' ' + url.pathname);
    return request.abort();
  });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.click('#account-action');
  await page.waitForFunction(() => document.querySelector('#auth-dialog')?.open === true);
  // Click each field before typing: a dialog that opens while the page is still
  // laying out can otherwise swallow the keystrokes and submit empty fields.
  await page.click('#auth-email');
  await page.type('#auth-email', 'tester@example.test');
  await page.click('#auth-password');
  await page.type('#auth-password', 'test-password');
  assert.equal(await page.$eval('#auth-email', el => el.value), 'tester@example.test');
  assert.equal(await page.$eval('#auth-password', el => el.value), 'test-password');
  await page.click('#auth-submit');
  await page.waitForFunction(() => document.querySelector('#account-state').textContent.includes('tester'));
  assert.equal(await page.$eval('#auth-dialog', dialog => dialog.open), false);
  await page.evaluate(() => openGame('lights-out'));
  await page.waitForFunction(() => document.querySelector('#frame').contentWindow.__boredSnapshot?.().slug === 'lights-out');
  await page.evaluate(() => {
    document.querySelector('#frame').contentWindow.__boredSnapshot = () => ({ slug: 'lights-out', cleared: 2 });
    captureHighScore();
    closeGame();
  });
  await page.waitForFunction(() => document.querySelector('#lb-list').textContent.includes('tester'));
  assert.equal(posted.length, 1, 'score is posted once');
  assert.equal(posted[0].game, 'lights-out');
  assert.equal(posted[0].value, 2);
  assert.equal(posted[0].authorization, 'Bearer mock-access');
  await page.click('.lb-tab[data-view="games"]');
  await page.select('#lb-game', 'lights-out');
  await page.waitForFunction(() => document.querySelector('#lb-list').textContent.includes('2 boards'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#account-state').textContent.includes('tester'));
  assert.equal(posted.length, 1, 'restoring the account does not repost an equal best');
  await page.click('#feedback-open');
  await page.type('#feedback-text', 'Snake ate my whole afternoon.');
  await page.click('#feedback-submit');
  await page.waitForFunction(() => document.querySelector('#feedback-open').textContent.includes('Thanks'));
  assert.equal(notes.length, 1, 'feedback posts once');
  assert.equal(notes[0].message, 'Snake ate my whole afternoon.');
  assert.equal(notes[0].email, 'tester@example.test', 'a signed-in sender gets a reply address filled in');
  assert.equal(notes[0].handle, 'tester');
  await page.click('#account-action');
  await page.waitForFunction(() => document.querySelector('#account-state').textContent.includes('guest'));
  assert.equal(await page.evaluate(() => localStorage.getItem('bored.session')), null);
  assert.deepEqual(unexpected, []);
});

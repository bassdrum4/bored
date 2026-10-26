const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');
const root = path.resolve(__dirname, '..');
// The site is the src/ folder itself, deployed as written.
const siteRoot = path.join(root, 'src');
// Match bored.test.cjs: hosted Ubuntu also has a Chromium launcher whose sandbox
// may be unavailable. Prefer the same working Google Chrome as the game suite.

test('discovery reaches nothing off-site, keeps its controls, and fits small screens', async t => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(siteRoot);
  let browser;
  t.after(async () => {
    try { await browser?.close(); } finally { await site.close(); }
  });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    // The loopback site is the arcade's own host, not an off-site dependency.
    if (/^https?:/.test(req.url()) && !req.url().startsWith(site.origin)) { requests.push(req.url()); req.abort(); }
    else req.continue();
  });
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(site.url);
  await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === ORDER.length);

  await t.test('every game has useful metadata; every offline preview is in the file', async () => {
    const catalog = await page.evaluate(() => ORDER.map(([slug]) => ({ slug, online: !!EXTERNS[slug], meta: DISCOVERY[slug], preview: PREVIEWS[slug] })));
    for (const game of catalog) {
      assert.ok(game.meta.minutes && game.meta.pace && game.meta.inputs.length, game.slug);
      assert.ok(game.meta.inputs.every(input => ['Keyboard', 'Mouse', 'Touch'].includes(input)), game.slug);
      if (!game.online) assert.match(game.preview || '', new RegExp('/previews/' + game.slug + '\\.(?:webp|svg)$'), game.slug + ' has a preview asset');
    }
    await page.$$eval('#grid img', images => images.forEach(image => image.loading = 'eager'));
    await page.waitForFunction(() => [...document.querySelectorAll('#grid img')].every(image => image.complete && image.naturalWidth > 0));
    // The entry document is hand-written markup: it carries no games and no
    // inlined script, so a game is downloaded only when its card is opened.
    const shell = fs.readFileSync(path.join(siteRoot, 'index.html'), 'utf8');
    assert.ok(Buffer.byteLength(shell) < 40 * 1024, 'the shell stays a small document');
    assert.ok(!/import\.meta\.(?:glob|env)/.test(fs.readFileSync(path.join(siteRoot, 'main.js'), 'utf8')), 'the hub runs unbundled');
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
  const site = await serve(siteRoot);
  let browser;
  t.after(async () => {
    try { await browser?.close(); } finally { await site.close(); }
  });
  browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const rows = [], posted = [], notes = [], state = [], activity = [], unexpected = [];
  const rules = Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'src/games/score-rules.json')))).map(([game, rule]) => ({ game, ...rule }));
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (!/^https?:/.test(request.url())) return request.continue();
    // The arcade's own host serves the game documents; only the API is mocked.
    if (request.url().startsWith(site.origin)) return request.continue();
    const url = new URL(request.url()), method = request.method();
    const reply = body => request.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return request.respond({ status: 204, headers });
    if (url.pathname === '/rest/v1/play_events' && method === 'POST') { activity.push(JSON.parse(request.postData())); return reply(null); }
    if (url.pathname === '/rest/v1/rpc/bt_rpc') return reply({ enrolled: false });
    if (url.pathname === '/rest/v1/score_rules') return reply(rules);
    if (url.pathname === '/auth/v1/token') return reply({ access_token: 'mock-access', refresh_token: 'mock-refresh', expires_in: 3600, user: { id: 'test-user', email: 'tester@example.test' } });
    if (url.pathname === '/rest/v1/profiles') return reply([{ handle: 'tester' }]);
    if (url.pathname === '/rest/v1/player_state') {
      if (method === 'POST') { state.push(JSON.parse(request.postData())); return reply(null); }
      return reply([]);
    }
    if (url.pathname === '/rest/v1/rpc/submit_score' && method === 'POST') {
      const { p_game, p_value } = JSON.parse(request.postData());
      posted.push({ game: p_game, value: p_value, authorization: request.headers().authorization });
      rows.push({ game: p_game, value: p_value });
      return reply(p_value);
    }
    if (url.pathname === '/rest/v1/scores') {
      if (method === 'POST') {
        const row = JSON.parse(request.postData());
        posted.push({ ...row, authorization: request.headers().authorization });
        rows.push(row);
        return reply(null);
      }
      return reply(rows);
    }
    // A second account is on the board so the player view has somebody to be
    // compared against.
    if (url.pathname === '/rest/v1/leaderboard') {
      const board = [...rows.map(row => ({ ...row, handle: 'tester' })), { game: 'lights-out', handle: 'rival', value: 9 }];
      return reply(board.filter(row => !url.searchParams.get('game') || url.searchParams.get('game') === 'eq.' + row.game));
    }
    if (url.pathname === '/rest/v1/feedback' && method === 'POST') { notes.push(JSON.parse(request.postData())); return reply(null); }
    if (url.pathname === '/auth/v1/logout') return reply(null);
    unexpected.push(method + ' ' + url.pathname);
    return request.abort();
  });
  await page.goto(site.url);
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
  // The account, not this browser, owns the state now: the arcade pushes it so
  // it turns up again on the next device.
  await new Promise(resolve => setTimeout(resolve, 1200));
  const pushed = state.at(-1);
  assert.ok(pushed, 'the player state is pushed to the account');
  assert.equal(pushed.user_id, 'test-user');
  assert.ok(pushed.data.library.recent.includes('lights-out'), 'recent games follow the account');
  assert.equal(pushed.data.bests['lights-out'], 2, 'a new best follows the account');
  // Their game row carries the viewer's own best — the number they can act on —
  // with the other player's best and the verdict underneath, plus a way to go
  // and beat it.
  await page.waitForFunction(() => document.querySelector('#lb-list').textContent.includes('rival'));
  // The card byline names the board leader, and a game with no board has none.
  await page.waitForFunction(() => document.querySelector('#grid [data-slug="lights-out"] .card-best')?.textContent.includes('rival'));
  assert.equal(await page.$eval('#grid [data-slug="lights-out"] .card-best', el => el.textContent), 'Best 9 boards · rival');
  assert.equal(await page.$eval('#grid [data-slug="8ball"]', card => card.querySelector('.card-best')), null);
  await page.evaluate(() => {
    [...document.querySelectorAll('#lb-list .lb-row')]
      .find(row => row.textContent.includes('rival')).click();
  });
  await page.waitForSelector('#lb-list .lb-breakdown .lb-line');
  const line = await page.$eval('#lb-list .lb-breakdown .lb-line', el => ({
    game: el.querySelector('.lb-line-name').textContent,
    mine: el.querySelector('.lb-line-score').textContent,
    versus: el.querySelector('.lb-line-versus')?.textContent || '',
    theirs: el.querySelector('.lb-line-versus b')?.textContent || '',
    play: el.querySelector('.lb-play')?.getAttribute('aria-label') || ''
  }));
  assert.equal(line.game, 'Lights Out');
  assert.equal(line.mine, '2 boards', 'the row carries your own best');
  assert.equal(line.theirs, '9 boards', 'their best is named underneath');
  assert.equal(line.versus, "them 9 boards · you're behind");
  assert.equal(line.play, 'Play Lights Out');
  await page.click('#lb-list .lb-breakdown .lb-play');
  await page.waitForFunction(() => document.querySelector('#player').hidden === false);
  await page.waitForFunction(() => document.querySelector('#frame').title === 'Lights Out');
  await page.evaluate(() => closeGame());
  await page.waitForFunction(() => document.querySelector('#player').hidden === true);

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
  assert.ok(activity.some(e => e.user_id === 'test-user' && e.game === 'lights-out'), 'signed-in telemetry uses the current account');
  assert.deepEqual(unexpected, []);
});

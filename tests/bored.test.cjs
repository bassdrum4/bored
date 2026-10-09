const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*)<\/script>/)[1];
const url = pathToFileURL(path.join(root, 'index.html')).href;
let browser, page;
const errors = [], requests = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Extract the production rules, not copies of the algorithms.
function functionSource(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  const brace = source.indexOf('{', start);
  let depth = 1, end = brace + 1;
  while (depth && end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  return source.slice(start, end);
}
function rules(names, extra = '') {
  const context = vm.createContext({});
  vm.runInContext(extra + names.map(functionSource).join('\n'), context);
  return context;
}

async function open(slug, selector = '#board') {
  await page.evaluate(id => openGame(id), slug);
  await page.waitForFunction(id => document.querySelector('#frame').contentDocument?.querySelector('#title')?.textContent ===
    ({ '2048': '2048', memory: 'Memory', 'connect-four': 'Connect Four', 'aim-lab': 'Aim Lab' })[id], {}, slug);
  const frame = await (await page.$('#frame')).contentFrame();
  await frame.waitForSelector(selector);
  return frame;
}
async function close() {
  await page.click('#back');
  await page.waitForFunction(() => document.querySelector('#player').hidden);
}
async function filter(name) {
  await page.click('[data-filter="' + name + '"]');
}
async function text(frame, selector) {
  return frame.$eval(selector, el => el.textContent);
}
async function clickText(frame, label) {
  await frame.evaluate(value => [...document.querySelectorAll('button')].find(el => el.textContent === value).click(), label);
}
async function noOverflow(frame = page) {
  assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
}

test('F-14 points to its GitHub Pages build', () => {
  const externs = JSON.parse(source.match(/const EXTERNS = (.*);/)[1]);
  assert.equal(externs['f-14'], 'https://bassdrum4.github.io/f-14-4/');
});

test('all hub JavaScript parses', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  const context = rules(['arcadeGame', 'nativeHTML']);
  for (const slug of ['2048', 'memory', 'connect-four', 'aim-lab']) {
    const game = context.nativeHTML(slug);
    assert.doesNotThrow(() => new vm.Script(game.match(/<script>([\s\S]*)<\/script>/)[1]));
    assert.ok(!/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i.test(game), 'native game has no external assets');
  }
});

function challengeRules() {
  const start = source.indexOf('const CHALLENGES = [');
  const end = source.indexOf('function dailyChallenge', start);
  const context = rules(['dailyDate', 'dailyChallenge', 'dailyCheck'], source.slice(start, end));
  return context;
}
function dateFor(slug) {
  const context = challengeRules();
  for (let n = 0; n < 30; n++) {
    const date = new Date(Date.UTC(2026, 9, 8 + n)).toISOString().slice(0, 10);
    if (context.dailyChallenge(date).slug === slug) return date;
  }
  throw new Error('No challenge for ' + slug);
}
test('daily rotation covers all thirty offline games, changes targets, and uses UTC', () => {
  const { dailyDate, dailyChallenge } = challengeRules();
  assert.equal(dailyDate(new Date('2026-10-09T00:30:00+02:00')), '2026-10-08');
  const rotation = Array.from({ length: 30 }, (_, n) => dailyChallenge(new Date(Date.UTC(2026, 9, 8 + n)).toISOString().slice(0, 10)));
  assert.equal(new Set(rotation.map(c => c.slug)).size, 30);
  assert.ok(rotation.every(c => !c.goal.includes('{target}')));
  assert.deepEqual(JSON.parse(JSON.stringify(dailyChallenge('2026-10-08'))), JSON.parse(JSON.stringify(dailyChallenge('2026-10-08'))));
  assert.notEqual(dailyChallenge('2026-10-08').slug, dailyChallenge('2026-10-09').slug);
  const tetris = dailyChallenge(dateFor('tetris'));
  const later = new Date(Date.parse(tetris.date + 'T00:00:00Z') + 30 * 86400000).toISOString().slice(0, 10);
  assert.notEqual(tetris.target, dailyChallenge(later).target);
});
test('daily completion rejects idle state, wrong games, wrong modes, hints, undo, and partial wins', () => {
  const { dailyChallenge, dailyCheck } = challengeRules();
  const good = { solved: true, undoUsed: false, pairs: 8, cpu: true, finished: true, accuracy: 90, normal: true, won: true, standard: true, hints: 0, handOver: true, materials: 4, seconds: 60, herbs: 20, predators: 3 };
  for (let n = 0; n < 30; n++) {
    const challenge = dailyChallenge(new Date(Date.UTC(2026, 9, 8 + n)).toISOString().slice(0, 10));
    const snapshot = { ...good, slug: challenge.slug, [challenge.metric]: challenge.target };
    if (challenge.rule === 'connect') snapshot.won = 1;
    assert.equal(dailyCheck(challenge, snapshot).complete, true, challenge.slug + ' accepts completed goal');
    assert.equal(dailyCheck(challenge, { ...snapshot, slug: 'wrong' }).complete, false);
    assert.equal(dailyCheck(challenge, null).complete, false);
    const upperBound = ['word', 'memory', 'mines'].includes(challenge.rule);
    assert.equal(dailyCheck(challenge, { ...snapshot, [challenge.metric]: upperBound ? challenge.target + 1 : -1 }).complete, false, challenge.slug + ' checks threshold');
  }
  for (const [slug, fields] of [
    ['wordle', { solved: false }], ['2048', { undoUsed: true }], ['memory', { pairs: 7 }],
    ['connect-four', { cpu: false }], ['aim-lab', { finished: false }], ['aim-lab', { accuracy: 79 }],
    ['aim-lab', { normal: false }], ['minesweeper', { hints: 1 }], ['minesweeper', { won: false }],
    ['minesweeper', { standard: false }], ['tank', { cpu: false }], ['poker', { handOver: false }],
    ['sand', { materials: 3 }], ['eco', { herbs: 19 }], ['eco', { predators: 2 }], ['eco', { seconds: 59 }]
  ]) {
    const challenge = dailyChallenge(dateFor(slug));
    const snapshot = { ...good, slug, [challenge.metric]: challenge.target, ...fields };
    assert.equal(dailyCheck(challenge, snapshot).complete, false, slug + ' rejects ' + JSON.stringify(fields));
  }
});

test('2048 merges once per tile and reports the exact gained score', () => {
  const { collapse } = rules(['collapse']);
  for (const [input, output, score] of [
    [[2, 2, 2, 2], [4, 4, 0, 0], 8],
    [[2, 2, 4, 0], [4, 4, 0, 0], 4],
    [[0, 4, 0, 4], [8, 0, 0, 0], 8],
    [[4, 2, 4, 2], [4, 2, 4, 2], 0],
    [[0, 0, 0, 0], [0, 0, 0, 0], 0],
    [[1024, 1024, 0, 0], [2048, 0, 0, 0], 2048]
  ]) {
    const result = collapse(input);
    assert.deepEqual(Array.from(result.line), output);
    assert.equal(result.gained, score);
  }
});

test('Connect Four detects all four win directions without wrapping rows', () => {
  const { winner } = rules(['winner']);
  for (const indices of [[35, 36, 37, 38], [0, 7, 14, 21], [0, 8, 16, 24], [6, 12, 18, 24]]) {
    const state = Array(42).fill(0);
    indices.forEach(i => { state[i] = 1; });
    assert.equal(winner(state, 1), true);
    assert.equal(winner(state, 2), false);
  }
  const wrap = Array(42).fill(0);
  [5, 6, 7, 8].forEach(i => { wrap[i] = 1; });
  assert.equal(winner(wrap, 1), false);
});

test('Connect Four computer wins, blocks immediate threats, and skips full columns', () => {
  const { chooseMove } = rules(['landing', 'winner', 'evaluate', 'minimax', 'chooseMove'], 'const order = [3,2,4,1,5,0,6];');
  const win = Array(42).fill(0);
  [35, 36, 37].forEach(i => { win[i] = 2; });
  assert.equal(chooseMove(win), 3);
  const block = Array(42).fill(0);
  [35, 36, 37].forEach(i => { block[i] = 1; });
  assert.equal(chooseMove(block), 3);
  const full = Array(42).fill(0);
  for (let row = 0; row < 6; row++) full[row * 7 + 3] = row % 2 + 1;
  assert.notEqual(chooseMove(full), 3);
});

test('browser regressions', async t => {
  const candidates = [
    process.env.CHROME_PATH,
    path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  let executablePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!executablePath) {
    try { const installed = require('puppeteer').executablePath(); if (fs.existsSync(installed)) executablePath = installed; } catch {}
  }
  assert.ok(executablePath, 'Chrome is required; set CHROME_PATH if it is not in a standard location');
  browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => { await browser.close(); });
  page = await browser.newPage();
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.evaluateOnNewDocument(() => { Math.random = () => 0; });
  await page.setViewport({ width: 1000, height: 900 });
  await page.goto(url);

  await t.test('hub categories, search, sorting, empty state, and stored favorites', async () => {
    assert.equal(await page.$$eval('.card', els => els.length), 33);
    assert.equal(await text(page, '#count'), '33');
    await filter('New');
    assert.equal(await page.$$eval('.card', els => els.length), 4);
    await filter('Puzzle');
    assert.equal(await page.$$eval('.card', els => els.length), 6);
    await filter('All');
    await page.type('#q', 'internet required');
    assert.equal(await page.$$eval('.card', els => els.length), 3);
    await page.$eval('#q', el => { el.value = 'nothingmatches'; el.dispatchEvent(new Event('input')); });
    assert.equal(await page.$eval('#random', el => el.disabled), true);
    assert.equal(await page.$eval('#empty', el => el.hidden), false);
    await page.$eval('#q', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
    await page.select('#sort', 'az');
    const names = await page.$$eval('.card .name', els => els.map(el => el.firstChild.textContent));
    assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));
    await page.select('#sort', 'original');
    await page.click('[aria-label="Add Memory to favorites"]');
    await filter('Favorites');
    assert.equal(await page.$$eval('.card', els => els.length), 1);
    await page.reload();
    await filter('Favorites');
    assert.equal(await page.$$eval('.card', els => els.length), 1);
    await page.click('[aria-label="Remove Memory from favorites"]');
    assert.equal(await page.$$eval('.card', els => els.length), 0);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.filter), 'Favorites');
    await filter('All');
    await noOverflow();
  });

  await t.test('2048 keyboard, swipe, no-op moves, undo, score persistence, and restart', async () => {
    let frame = await open('2048');
    const cells = () => frame.$$eval('.tile', els => els.map(el => Number(el.dataset.value)));
    assert.deepEqual((await cells()).slice(0, 4), [2, 2, 0, 0]);
    await frame.click('#title');
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual((await cells()).slice(0, 4), [4, 2, 0, 0]);
    assert.match(await text(frame, '#stats'), /Score 4 \/ Best 4/);
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual((await cells()).slice(0, 4), [4, 2, 0, 0]);
    await clickText(frame, 'Undo');
    assert.deepEqual((await cells()).slice(0, 4), [2, 2, 0, 0]);
    const bounds = await (await frame.$('#board')).boundingBox();
    await page.mouse.move(bounds.x + 30, bounds.y + 30);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 150, bounds.y + 30);
    await page.mouse.up();
    assert.deepEqual((await cells()).slice(0, 4), [2, 0, 0, 4]);
    await page.click('#restart');
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelector('#stats')?.textContent.includes('Score 0'));
    frame = await (await page.$('#frame')).contentFrame();
    assert.match(await text(frame, '#stats'), /Best 4/);
    await close();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.slug), '2048');
  });

  await t.test('Memory locks mismatches, clears pending timers on reset, and completes all pairs', async () => {
    const frame = await open('memory');
    await frame.click('.memory-card:nth-child(1)');
    await frame.click('.memory-card:nth-child(2)');
    await frame.click('.memory-card:nth-child(3)');
    assert.equal(await frame.$$eval('.flipped', els => els.length), 2);
    await pause(900);
    assert.equal(await frame.$$eval('.flipped', els => els.length), 0);
    await frame.click('.memory-card:nth-child(1)');
    await frame.click('.memory-card:nth-child(2)');
    await clickText(frame, 'Shuffle & restart');
    await pause(900);
    assert.equal(await frame.$$eval('.flipped', els => els.length), 0);
    for (let i = 1; i <= 8; i++) {
      await frame.click('.memory-card:nth-child(' + i + ')');
      await frame.click('.memory-card:nth-child(' + (i + 8) + ')');
    }
    assert.match(await text(frame, '#status'), /All pairs found in 8 moves/);
    assert.equal(await frame.$$eval('.matched', els => els.length), 16);
    assert.match(await text(frame, '#stats'), /Best 8/);
    await frame.click('#title');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#player').hidden);
    assert.equal(await page.$eval('#hub', el => el.inert), false);
  });

  await t.test('Connect Four computer turn, two-player wins, full columns, and reset', async () => {
    const frame = await open('connect-four');
    await frame.click('.columns button:nth-child(1)');
    assert.equal(await frame.$$eval('.columns button:disabled', els => els.length), 7);
    await frame.waitForSelector('.disc.p2');
    assert.equal(await frame.$$eval('.disc.p1', els => els.length), 1);
    assert.equal(await frame.$$eval('.disc.p2', els => els.length), 1);
    await frame.select('select', 'friend');
    for (const col of [1, 2, 1, 2, 1, 2, 1]) await frame.click('.columns button:nth-child(' + col + ')');
    assert.match(await text(frame, '#status'), /Red wins/);
    assert.equal(await frame.$$eval('.columns button:disabled', els => els.length), 7);
    await clickText(frame, 'New game');
    for (let i = 0; i < 6; i++) await frame.click('.columns button:nth-child(1)');
    assert.equal(await frame.$eval('.columns button', el => el.disabled), true);
    await clickText(frame, 'New game');
    await frame.click('#title');
    await page.keyboard.press('3');
    assert.equal(await frame.$$eval('.disc.p1', els => els.length), 1);
    await close();
  });

  await t.test('Aim Lab counts hits/misses, expires, persists a best score, and restarts cleanly', async () => {
    const frame = await open('aim-lab');
    await clickText(frame, 'Start challenge');
    assert.equal(await frame.$eval('select', el => el.disabled), true);
    await frame.click('.target');
    await frame.click('#board', { offset: { x: 1, y: 1 } });
    assert.match(await text(frame, '#stats'), /Hits 1 \/ Accuracy 50%/);
    const box = await (await frame.$('.target')).boundingBox();
    const area = await (await frame.$('#board')).boundingBox();
    assert.ok(box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + area.width);
    // Advance the monotonic clock rather than waiting twenty seconds per test run.
    await frame.evaluate(() => { const now = performance.now.bind(performance); performance.now = () => now() + 21000; });
    await frame.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Time!'));
    assert.match(await text(frame, '#stats'), /0s \/ Best 1/);
    assert.equal(await frame.$eval('.target', el => el.hidden), true);
    await clickText(frame, 'Play again');
    assert.match(await text(frame, '#stats'), /Hits 0 \/ Accuracy 0% \/ 20s/);
    await close();
    assert.equal(await page.$$eval('#recent-list button', els => els.length), 4);
  });

  await t.test('all thirty daily adapters boot and expose current-run state', async () => {
    const challenges = await page.evaluate(() => CHALLENGES);
    for (const challenge of challenges) {
      await page.evaluate(date => { window.originalDailyDate ||= dailyDate; dailyDate = () => date; renderDaily(); }, dateFor(challenge.slug));
      await page.click('#daily-play');
      try { await page.waitForFunction(() => typeof document.querySelector('#frame').contentWindow.__boredSnapshot === 'function', { timeout: 6000 }); }
      catch (e) { throw new Error(challenge.slug + ': adapter unavailable; errors=' + JSON.stringify(errors)); }
      const snapshot = await page.evaluate(() => { try { return document.querySelector('#frame').contentWindow.__boredSnapshot(); } catch (e) { throw new Error(current + ': ' + e.message); } });
      assert.equal(snapshot.slug, challenge.slug);
      assert.ok(Number.isFinite(snapshot[challenge.metric]), challenge.slug + ' exposes numeric metric');
      assert.equal(await page.evaluate(() => dailyCheck(currentDaily, document.querySelector('#frame').contentWindow.__boredSnapshot()).complete), false, challenge.slug + ' does not complete at boot');
      if (challenge.slug === 'wordle') {
        const frame = await (await page.$('#frame')).contentFrame();
        await frame.evaluate(() => {
          gameOver = true; row = 2;
          // Five green tiles split across rows are not a solved word.
          [getTile(0, 0), getTile(0, 1), getTile(0, 2), getTile(1, 0), getTile(1, 1)].forEach(tile => tile.classList.add('correct'));
        });
        assert.equal(await frame.evaluate(() => __boredSnapshot().solved), false);
        await frame.evaluate(() => { for (let col = 0; col < 5; col++) getTile(1, col).classList.add('correct'); });
        assert.equal(await frame.evaluate(() => __boredSnapshot().solved), true);
        await frame.evaluate(() => { gameOver = false; row = 0; });
      }
      if (challenge.slug === 'minesweeper') {
        const frame = await (await page.$('#frame')).contentFrame();
        await frame.evaluate(() => game.getHint());
        assert.equal(await frame.evaluate(() => __boredSnapshot().hints), 1);
        await frame.evaluate(() => game.init());
        assert.equal(await frame.evaluate(() => __boredSnapshot().hints), 0);
      }
      if (challenge.slug === 'tank') {
        const frame = await (await page.$('#frame')).contentFrame();
        await frame.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); });
        assert.equal(await frame.evaluate(() => __boredSnapshot().cpu), false, 'brief AI toggle cannot bypass the goal');
      }
      await close();
    }
    await page.evaluate(() => { dailyDate = window.originalDailyDate; renderDaily(); });
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
  });

  await t.test('daily goal verifies actual Memory gameplay, persists completion, shares, and rolls over', async () => {
    const date = dateFor('memory');
    await page.evaluate(day => { window.originalDailyDate ||= dailyDate; dailyDate = () => day; renderDaily(); }, date);
    if (await page.$eval('#player', el => !el.hidden)) await close();
    await page.click('#daily-play');
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelectorAll('.memory-card').length === 16);
    const frame = await (await page.$('#frame')).contentFrame();
    assert.equal(await page.evaluate(() => readDaily(currentDaily)), null);
    for (let i = 1; i <= 8; i++) {
      await frame.click('.memory-card:nth-child(' + i + ')');
      await frame.click('.memory-card:nth-child(' + (i + 8) + ')');
    }
    await page.waitForFunction(() => document.querySelector('#challenge-progress').textContent.startsWith('✓'));
    await close();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'daily-play');
    assert.match(await text(page, '#daily-status'), /Automatically verified/);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied'); } }, configurable: true }));
    await page.click('#daily-share');
    assert.match(await page.$eval('#daily-result', el => el.value), /8 moves/);
    assert.equal(await page.$eval('#daily-result', el => el.hidden), false);
    await page.evaluate(() => { window.copied = ''; navigator.clipboard.writeText = async value => { window.copied = value; }; });
    await page.click('#daily-share');
    assert.match(await page.evaluate(() => window.copied), /Bored Daily/);
    await page.reload();
    await page.evaluate(day => { window.originalDailyDate = dailyDate; dailyDate = () => day; renderDaily(); }, date);
    assert.match(await text(page, '#daily-status'), /Automatically verified/);
    await page.click('#daily-play');
    await page.waitForFunction(() => typeof document.querySelector('#frame').contentWindow.__boredSnapshot === 'function');
    await page.click('#restart');
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelector('#stats')?.textContent.includes('Moves 0'));
    await close();
    assert.match(await text(page, '#daily-status'), /Automatically verified/, 'retry cannot erase earned completion');
    const tomorrow = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    await page.evaluate(day => { dailyDate = () => day; renderDaily(); }, tomorrow);
    assert.doesNotMatch(await text(page, '#daily-status'), /Automatically verified/);
    assert.equal(await page.$eval('#daily-share', el => el.hidden), true);
    assert.equal(await page.$eval('#daily-result', el => el.hidden), true);
    await page.evaluate(() => { dailyDate = window.originalDailyDate; renderDaily(); });
  });

  await t.test('all thirty offline games boot; Lighthouse overlay is actually hidden', async () => {
    const slugs = await page.evaluate(() => ORDER.filter(([slug]) => !EXTERNS[slug] && !NEW_GAMES.includes(slug)).map(([slug]) => slug));
    for (const slug of slugs) {
      await page.evaluate(id => openGame(id), slug);
      await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.body?.childElementCount > 0);
      await pause(slug === 'lighthouse' ? 1500 : 180);
      if (slug === 'lighthouse') {
        const frame = await (await page.$('#frame')).contentFrame();
        assert.equal(await frame.$eval('#fatal', el => el.hidden && getComputedStyle(el).display === 'none'), true);
      }
      await close();
    }
    assert.deepEqual(errors, [], 'no uncaught JavaScript errors');
    assert.deepEqual(requests, [], 'no external requests from offline games or idle hub');
  });

  await t.test('mobile hub and all new games fit at 320px; random respects the active filter', async () => {
    await page.setViewport({ width: 320, height: 740, isMobile: true, hasTouch: true });
    await filter('New');
    await noOverflow();
    await page.click('#random');
    await page.waitForFunction(() => !document.querySelector('#player').hidden);
    assert.ok(await page.evaluate(() => NEW_GAMES.includes(current)));
    await close();
    await page.evaluate(day => { window.originalDailyDate ||= dailyDate; dailyDate = () => day; renderDaily(); }, dateFor('memory'));
    await page.click('#daily-play');
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelectorAll('.memory-card').length === 16);
    await noOverflow();
    const progress = await (await page.$('#challenge-progress')).boundingBox();
    assert.ok(progress.x >= 0 && progress.x + progress.width <= 320, 'daily progress fits on mobile');
    await close();
    await page.evaluate(() => { dailyDate = window.originalDailyDate; renderDaily(); });
    for (const slug of ['2048', 'memory', 'connect-four', 'aim-lab']) {
      const frame = await open(slug);
      await noOverflow(frame);
      const back = await (await page.$('#back')).boundingBox();
      const tools = await (await page.$('#player-tools')).boundingBox();
      assert.ok(back.x + back.width <= tools.x, 'player controls do not overlap');
      await close();
    }
  });

  await t.test('blocked storage does not break the hub or new games', async () => {
    const restricted = await browser.newPage();
    const failures = [];
    restricted.on('pageerror', err => failures.push(err.message));
    await restricted.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    });
    await restricted.goto(url);
    assert.equal(await restricted.$$eval('.card', els => els.length), 33);
    for (const slug of ['2048', 'memory', 'connect-four', 'aim-lab']) {
      await restricted.evaluate(id => openGame(id), slug);
      await restricted.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelector('#board')?.childElementCount > 0);
      await restricted.click('#back');
    }
    await restricted.evaluate(day => { dailyDate = () => day; renderDaily(); }, dateFor('memory'));
    await restricted.evaluateOnNewDocument(() => { Math.random = () => 0; });
    await restricted.click('#daily-play');
    await restricted.waitForFunction(() => typeof document.querySelector('#frame').contentWindow.__boredSnapshot === 'function');
    const daily = await (await restricted.$('#frame')).contentFrame();
    for (let i = 1; i <= 8; i++) {
      await daily.click('.memory-card:nth-child(' + i + ')');
      await daily.click('.memory-card:nth-child(' + (i + 8) + ')');
    }
    await restricted.waitForFunction(() => dailyResults.size === 1);
    await restricted.click('#back');
    assert.match(await text(restricted, '#daily-status'), /Automatically verified/);
    await noOverflow(daily);
    assert.deepEqual(failures, []);
    await restricted.close();
  });
});

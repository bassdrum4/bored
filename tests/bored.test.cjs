const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const root = path.resolve(__dirname, '..');
// GitHub Pages publishes src/ as the site root, so the suite serves that folder
// exactly as written: the same entry document, modules and game files a visitor
// gets. Nothing here is built.
const siteRoot = path.join(root, 'src');
const entry = fs.readFileSync(path.join(siteRoot, 'index.html'), 'utf8');
const source = [
  'src/main.js', 'src/hub/store.js', 'src/hub/backend.js', 'src/hub/scores.js',
  'src/games/arcade.js', 'src/daily.js', 'src/games/catalog.js'
].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const API = source.match(/const API_URL = '([^']+)'/)[1];
// Games are downloaded on demand now, so the suite serves the repository over
// loopback the way GitHub Pages does instead of loading file://.
let origin = '', url = '';
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
async function openTitle(slug, title) {
  await page.evaluate(id => openGame(id), slug);
  await page.waitForFunction(t => document.querySelector('#frame')?.title === t &&
    document.querySelector('#frame')?.contentDocument?.body?.childElementCount > 0, {}, title);
  return (await page.$('#frame')).contentFrame();
}
async function close({ dismissClaim = true } = {}) {
  await page.click('#menu-toggle');
  await page.click('#back');
  await page.waitForFunction(() => document.querySelector('#player').hidden);
  // Leaving a game with a new guest best opens the account offer, which is a
  // modal: dismiss it so the next step reaches the hub. Only the offer's own
  // test keeps it.
  if (dismissClaim) {
    await page.evaluate(() => {
      const dialog = document.querySelector('#claim-dialog');
      if (dialog.open) dialog.close();
    });
  }
}
async function restart() {
  await page.click('#menu-toggle');
  await page.click('#restart');
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

test('the entry document loads the hub as modules from its own folder', () => {
  assert.match(entry, /<script type="module" src="\.\/main\.js"><\/script>/, 'the hub is a module beside the page');
  assert.match(entry, /<link rel="stylesheet" href="\.\/styles\.css">/, 'the stylesheet is a sibling file');
  assert.doesNotMatch(entry, /(?:src|href)="\/(?!\/)/, 'no root-absolute paths: the site is served under /bored/');
  assert.doesNotMatch(entry, /<script>/, 'nothing is inlined into the page');
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
  // `const` in the vm script is lexical, so hand the list to the test explicitly.
  const context = rules(['dailyDate', 'dailyChallenge', 'dailyCheck', 'dailyStreak'],
    source.slice(start, end).replace(/export\s+$/, '') + '\nthis.CHALLENGES = CHALLENGES;');
  return context;
}
function dateFor(slug) {
  const context = challengeRules();
  for (let n = 0; n < 40; n++) {
    const date = new Date(Date.UTC(2026, 9, 8 + n)).toISOString().slice(0, 10);
    if (context.dailyChallenge(date).slug === slug) return date;
  }
  throw new Error('No challenge for ' + slug);
}
test('a streak counts consecutive completed days and survives an outstanding today', () => {
  const { dailyStreak } = challengeRules();
  const streak = (dates, today) => {
    const result = dailyStreak(dates, today);
    return result.current + '/' + result.best;
  };
  assert.equal(streak([], '2031-01-07'), '0/0');
  assert.equal(streak(['2031-01-07'], '2031-01-07'), '1/1');
  // Today is still to play, so yesterday's run has not been broken.
  assert.equal(streak(['2031-01-06'], '2031-01-07'), '1/1');
  assert.equal(streak(['2031-01-05'], '2031-01-07'), '0/1');
  // Duplicates and out-of-order days count once each.
  assert.equal(streak(['2031-01-06', '2031-01-04', '2031-01-05', '2031-01-06'], '2031-01-07'), '3/3');
  // A gap ends the run; only the longest one is remembered.
  assert.equal(streak(['2031-01-04', '2031-01-05', '2031-01-07'], '2031-01-07'), '1/2');
  // A longer gap, months apart, still only counts as one pair.
  assert.equal(streak(['2030-12-31', '2031-01-01', '2031-03-01'], '2031-03-01'), '1/2');
});

test('the daily rotation covers every challenge game, changes targets, and uses Eastern Time', () => {
  const { dailyDate, dailyChallenge, CHALLENGES } = challengeRules();
  assert.equal(dailyDate(new Date('2026-10-09T00:30:00+02:00')), '2026-10-08');
  // The day turns at midnight in Detroit, not UTC: in summer (EDT, UTC-4)
  // 03:30Z is still the previous evening and 04:30Z is already the next day.
  assert.equal(dailyDate(new Date('2026-10-09T03:30:00Z')), '2026-10-08');
  assert.equal(dailyDate(new Date('2026-10-09T04:30:00Z')), '2026-10-09');
  // In winter (EST, UTC-5) the turn happens an hour later than in summer.
  assert.equal(dailyDate(new Date('2026-01-10T04:30:00Z')), '2026-01-09');
  assert.equal(dailyDate(new Date('2026-01-10T05:30:00Z')), '2026-01-10');
  // The spring-forward morning still produces one date per Detroit day.
  assert.equal(dailyDate(new Date('2026-03-08T06:30:00Z')), '2026-03-08');
  const rotation = Array.from({ length: CHALLENGES.length }, (_, n) => dailyChallenge(new Date(Date.UTC(2026, 9, 8 + n)).toISOString().slice(0, 10)));
  assert.equal(new Set(rotation.map(c => c.slug)).size, CHALLENGES.length);
  assert.ok(rotation.every(c => !c.goal.includes('{target}')));
  assert.deepEqual(JSON.parse(JSON.stringify(dailyChallenge('2026-10-08'))), JSON.parse(JSON.stringify(dailyChallenge('2026-10-08'))));
  assert.notEqual(dailyChallenge('2026-10-08').slug, dailyChallenge('2026-10-09').slug);
  const tetris = dailyChallenge(dateFor('tetris'));
  const later = new Date(Date.parse(tetris.date + 'T00:00:00Z') + rotation.length * 86400000).toISOString().slice(0, 10);
  assert.notEqual(tetris.target, dailyChallenge(later).target);
});
test('daily completion rejects idle state, wrong games, wrong modes, hints, undo, and partial wins', () => {
  const { dailyChallenge, dailyCheck } = challengeRules();
  const good = { solved: true, undoUsed: false, pairs: 8, cpu: true, finished: true, accuracy: 90, normal: true, won: true, standard: true, hints: 0, handOver: true, materials: 4, seconds: 60, herbs: 20, predators: 3 };
  for (let n = 0; n < 40; n++) {
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
  const site = await serve(siteRoot);
  ({ origin, url } = site);
  browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => { await browser.close(); await site.close(); });
  page = await browser.newPage();
  page.on('pageerror', err => errors.push(err.message));
  await page.setRequestInterception(true);
  // The leaderboard is the only server this page is allowed to reach; the loopback
  // site that serves it is not an external request. Nothing here answers an auth
  // request on the page's behalf: a guest visit must not create an account on the
  // project, so no sign-up may leave the browser at all.
  page.on('request', request => {
    const target = request.url();
    if (/^https?:/.test(target) && !target.startsWith(origin)) requests.push(target);
    return request.continue();
  });
  await page.evaluateOnNewDocument(() => { Math.random = () => 0; });
  await page.setViewport({ width: 1000, height: 900 });
  await page.goto(url);

  await t.test('hub categories, search, sorting, empty state, and stored favorites', async () => {
    // Counts come from the catalog so adding a game does not have to touch this
    // file: the suite checks the wiring, not the catalogue's contents.
    const catalog = await page.evaluate(() => ({
      total: ORDER.length,
      newest: FRESH_GAMES.length,
      fresh: FRESH_GAMES,
      puzzle: ORDER.filter(([slug]) => META[slug][0] === 'Puzzle').length,
      online: Object.keys(EXTERNS).length
    }));
    assert.equal(await page.$$eval('.card', els => els.length), catalog.total);
    assert.equal(await text(page, '#count'), String(catalog.total));
    // The NEW badge holds four games at most, and they sit at the top of the shelf.
    assert.ok(catalog.newest > 0 && catalog.newest <= 4, 'the NEW badge holds four games at most');
    assert.deepEqual(
      await page.$$eval('.card', els => els.slice(0, 4).map(el => el.dataset.slug)),
      catalog.fresh,
      'new games are pinned to the top in badge order'
    );
    await filter('New');
    assert.equal(await page.$$eval('.card', els => els.length), catalog.newest);
    await filter('Puzzle');
    assert.equal(await page.$$eval('.card', els => els.length), catalog.puzzle);
    await filter('All');
    await page.type('#q', 'internet required');
    assert.equal(await page.$$eval('.card', els => els.length), catalog.online);
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
    await restart();
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelector('#stats')?.textContent.includes('Score 0'));
    frame = await (await page.$('#frame')).contentFrame();
    assert.match(await text(frame, '#stats'), /Best 4/);
    await close();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.slug), '2048');
  });

  await t.test('game menu collapses the player controls and keyboard shortcuts drive them', async () => {
    let frame = await open('2048');
    assert.equal(await page.$eval('#menu-toggle', el => el.getAttribute('aria-expanded')), 'false');
    await page.click('#menu-toggle');
    assert.equal(await page.$eval('#player-actions', el => el.hidden), false);
    assert.equal(await page.$eval('#menu-toggle', el => el.getAttribute('aria-expanded')), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#player-actions', el => el.hidden), true, 'Esc closes the menu first');
    assert.equal(await page.$eval('#player', el => el.hidden), false, 'Esc does not leave while closing the menu');
    await frame.click('#title');
    await page.keyboard.press('ArrowLeft');
    assert.match(await text(frame, '#stats'), /Score 4 /);
    await page.keyboard.down('Shift');
    await page.keyboard.press('R');
    await page.keyboard.up('Shift');
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelector('#stats')?.textContent.includes('Score 0'));
    frame = await (await page.$('#frame')).contentFrame();
    assert.match(await text(frame, '#stats'), /Score 0 /);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#player').hidden);
  });

  await t.test('overall ranking groups scores by account, respects lower-is-better and ties', async () => {
    const rankings = await page.evaluate(() => accountStandings([
      { game: '2048', handle: 'Ada', value: 300 },
      { game: '2048', handle: 'Ben', value: 300 },
      { game: '2048', handle: 'Cy', value: 200 },
      { game: 'memory', handle: 'Ada', value: 20 },
      { game: 'memory', handle: 'Ben', value: 15 },
      { game: 'memory', handle: 'Cy', value: 0 },
      { game: 'not-a-game', handle: 'Outsider', value: 9999 }
    ]));
    // Ada and Ben share first in 2048 (5 each); the lower-is-better Memory board
    // flips them, so Ben takes 5 there and 10 overall.
    assert.deepEqual(rankings.map(({ handle, points, gamesPlayed, gamesRanked }) => [handle, points, gamesPlayed, gamesRanked]), [
      ['Ben', 10, 2, 2], ['Ada', 9, 2, 2], ['Cy', 3, 1, 1]
    ]);

    // Only the top five in a game score; sixth place is worth nothing.
    const ladder = await page.evaluate(() => accountStandings(
      [10, 9, 8, 7, 6, 5].map((value, i) => ({ game: 'snake', handle: 'P' + i, value }))
    ));
    assert.deepEqual(ladder.map(entry => entry.points), [5, 4, 3, 2, 1, 0]);
    assert.deepEqual(ladder.map(entry => entry.gamesRanked), [1, 1, 1, 1, 1, 0]);
  });

  await t.test('fullscreen menu button is absent while Shift+F and Escape still work', async () => {
    await openTitle('tetris', 'Tetris');
    await page.click('#menu-toggle');
    assert.equal(await page.$('#fullscreen'), null);
    await page.click('#resume');
    await page.keyboard.down('Shift');
    await page.keyboard.press('F');
    await page.keyboard.up('Shift');
    await page.waitForFunction(() => document.fullscreenElement === document.querySelector('#player'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await page.$eval('#player', el => el.hidden), false);
    await close();
  });

  await t.test('Lights Out flips a cross, counts moves, and clears a board', async () => {
    const frame = await openTitle('lights-out', 'Lights Out');
    const state = () => frame.evaluate(() => __test.state());

    // A real click in the middle of the grid changes exactly the five squares of its cross.
    const before = await state();
    const box = await (await frame.$('.cell[data-i="12"]')).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const after = await state();
    const changed = after.board.map((lit, i) => lit !== before.board[i]).filter(Boolean).length;
    assert.equal(changed, 5, 'a middle press flips its own square and four neighbours');
    assert.equal(after.moves, 1, 'each press counts as a move');

    // Solve whatever board is on the table by chasing the lights, through real cell clicks.
    const solved = await frame.evaluate(() => {
      const cells = () => [...document.querySelectorAll('.cell')];
      const lit = () => cells().map(el => el.getAttribute('aria-pressed') === 'true');
      const press = i => cells()[i].click();
      const chase = mask => {
        for (let c = 0; c < 5; c++) if (mask & (1 << c)) press(c);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if (lit()[r * 5 + c]) press((r + 1) * 5 + c);
      };
      for (let mask = 0; mask < 32; mask++) {
        chase(mask);
        if (lit().every(v => !v)) return { cleared: __test.state().cleared, dark: true, mask };
        chase(mask); // the presses commute, so the same pattern undoes it
      }
      return { cleared: __test.state().cleared, dark: false, mask: -1 };
    });
    assert.equal(solved.dark, true, 'a five-by-five board is always solvable from a generated start');
    assert.equal(solved.cleared, 1, 'clearing the board is counted');

    await pause(1400);
    const fresh = await state();
    assert.equal(fresh.cleared, 1, 'the cleared count survives the next board');
    assert.equal(fresh.board.some(Boolean), true, 'a new board is dealt after a clear');
    assert.equal(fresh.board.every(Boolean), false, 'the next board is not already solved');

    await close();
    assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.lights-out')), '1',
      'clearing a board posts a high score of one board');
    await page.evaluate(() => localStorage.removeItem('bored.high.lights-out'));
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

  await t.test('DEEP cuts one dungeon per day, descends five floors, and the Warden seals the Core', async () => {
    const frame = await openTitle('deep', 'DEEP');
    await frame.waitForFunction(() => typeof __deep === 'object');
    // The first dive of the day is the shared, deterministic dungeon; a second
    // dive that day is cut fresh, and retrying a seed reproduces it exactly.
    const dives = await frame.evaluate(() => {
      localStorage.removeItem('deep.dailyPlayed');
      __deep.start('daily');
      const shared = Array.from(__deep.map).join('');
      const seed = __deep.state.seed;
      __deep.start('daily');
      const second = Array.from(__deep.map).join('');
      __deep.start('daily', seed);
      const retried = Array.from(__deep.map).join('');
      return { shared: shared === retried, fresh: shared !== second, seed, date: __deep.state.seed };
    });
    assert.equal(dives.shared, true, 'retrying the day\'s seed cuts the same dungeon');
    assert.equal(dives.fresh, true, 'a second dive the same day is cut fresh');
    await frame.evaluate(() => __deep.start('daily'));
    const opening = await frame.evaluate(() => ({
      depth: __deep.state.depth,
      alive: __deep.state.alive,
      enemies: __deep.enemies.length,
      lit: Array.from(__deep.vis).reduce((n, v) => n + v, 0)
    }));
    assert.equal(opening.depth, 1);
    assert.equal(opening.alive, true);
    assert.ok(opening.enemies >= 3, 'the first floor is inhabited');
    assert.ok(opening.lit > 30, 'the delver can see the room around them');
    let depth = 1;
    while (depth < 5) {
      await frame.evaluate(() => { const s = __deep.stairs; __deep.setPos(s.x, s.y); __deep.useStairs(); });
      depth += 1;
      assert.equal(await frame.evaluate(() => __deep.state.depth), depth);
    }
    const sealed = await frame.evaluate(() => {
      const core = __deep.items.find(i => i.kind === 'core');
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const dir = dirs.find(([dx, dy]) => __deep.map[(core.y + dy) * 44 + (core.x + dx)] === 1);
      __deep.setPos(core.x + dir[0], core.y + dir[1]);
      __deep.move(-dir[0], -dir[1]);
      return { won: __deep.state.won, warden: __deep.enemies.some(e => e.type === 'warden' && e.hp > 0) };
    });
    assert.equal(sealed.warden, true, 'the boss guards the core');
    assert.equal(sealed.won, false, 'the core refuses to open early');
    const victory = await frame.evaluate(() => {
      __deep.state.atk = 999;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const warden = __deep.enemies.find(e => e.type === 'warden');
      const hit = dirs.find(([dx, dy]) => __deep.map[(warden.y + dy) * 44 + (warden.x + dx)] === 1);
      __deep.setPos(warden.x + hit[0], warden.y + hit[1]);
      __deep.move(-hit[0], -hit[1]);
      const core = __deep.items.find(i => i.kind === 'core');
      const inTo = dirs.find(([dx, dy]) => __deep.map[(core.y + dy) * 44 + (core.x + dx)] === 1);
      __deep.setPos(core.x + inTo[0], core.y + inTo[1]);
      __deep.move(-inTo[0], -inTo[1]);
      return { won: __deep.state.won, kills: __deep.state.kills, score: __deep.score() };
    });
    assert.equal(victory.kills, 1);
    assert.equal(victory.won, true);
    assert.ok(victory.score >= 800, 'depth five alone is worth 800');
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument.getElementById('end').hidden === false);
    assert.match(await text(frame, '#endWord'), /CORE CLAIMED/);
    assert.equal(await frame.$eval('#endDepth', el => el.textContent), '5/5');
    const endScore = Number(await text(frame, '#endScore'));
    assert.ok(endScore >= 1500, 'claiming the core pays the clear bonus');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('deep.best')));
    assert.ok(stored && stored.won === true && stored.score >= 1500, 'the best descent is saved');

    // The end screen, the saved best and the snapshot the hub reads must agree.
    const reported = await frame.evaluate(() => ({ snap: window.__boredSnapshot(), live: __deep.score() }));
    assert.equal(reported.snap.score, endScore, 'the snapshot reports the same score as the end screen');
    assert.equal(reported.snap.finished, true, 'a cleared run is finished');
    assert.equal(stored.score, endScore, 'the saved best matches the end screen');
    assert.ok(endScore - reported.live >= 1500, 'the reported score carries the clear bonus the live HUD omits');

    // A death on the first floor still has to save: turns make the score positive,
    // so a finished run is never dropped for being zero. Clear the older best
    // only once the death run is the live snapshot — the hub recaptures on a
    // 250 ms tick, and clearing while the victory run is still on screen would
    // let that tick restore the higher score instead.
    const death = await frame.evaluate(() => {
      __deep.start('daily');
      Object.assign(__deep.state, { gold: 0, kills: 0, depth: 1, turns: 7 });
      __deep.finish(false);
      return window.__boredSnapshot();
    });
    await page.evaluate(() => localStorage.removeItem('bored.high.deep'));
    await page.waitForFunction(() => (Number(localStorage.getItem('bored.high.deep')) || 0) > 0, { timeout: 4000 });
    assert.equal(death.finished, true, 'a death ends the run');
    assert.ok(death.score > 0, 'a floor-one death still scores');
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('bored.high.deep'))), death.score, 'the hub captures that score');
    await close();
  });

  await t.test('poker opponents price hands by equity, never peek, and draw to real outs', async () => {
    const frame = await openTitle('poker', 'Poker');
    await frame.waitForFunction(() => typeof window.__pokerAI === 'object');

    // The fast 7-card evaluator must agree with the showdown evaluator exactly.
    const fast = await frame.evaluate(() => {
      const AI = window.__pokerAI;
      const deck = [];
      for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ rank: r, suit: s });
      let checked = 0, mismatches = 0;
      for (let n = 5; n <= 7; n++) {
        for (let trial = 0; trial < 40; trial++) {
          const copy = deck.slice();
          for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = copy[i]; copy[i] = copy[j]; copy[j] = t; }
          const cards = copy.slice(0, n);
          checked++;
          if (AI.eval7(cards).score !== bestHand(cards).score) mismatches++;
        }
      }
      AI.seed(2026);
      const c = (r, s) => ({ rank: r, suit: s });
      const aces = AI.equity([c(14, 0), c(14, 1)], [], 1, 500, 0);
      const rags = AI.equity([c(7, 0), c(2, 1)], [], 1, 500, 0);
      const multi = AI.equity([c(14, 0), c(14, 1)], [], 4, 500, 0);
      AI.unseed();
      return { checked, mismatches, aces, rags, multi };
    });
    assert.equal(fast.mismatches, 0, 'the simulation evaluator agrees with the showdown evaluator on ' + fast.checked + ' hands');
    assert.ok(fast.aces > 0.78 && fast.aces < 0.92, 'aces are a favourite heads-up');
    assert.ok(fast.rags < 0.42, 'seven-deuce is a dog heads-up');
    assert.ok(fast.multi < fast.aces - 0.15, 'extra opponents cost equity');

    const behaviour = await frame.evaluate(() => {
      const AI = window.__pokerAI;
      const c = (r, s) => ({ rank: r, suit: s });
      const spot = (hole, bet, raised) => {
        G.phase = 'betting';
        G.variant = 'holdem';
        G.community = [];
        G.settings.bb = 10;
        G.minRaise = 10;
        G.streetRaises = raised;
        G.players.forEach(p => { p.folded = false; p.allIn = false; p.bet = 0; p.totalBet = 0; p.stack = 1000; });
        G.players[0].isHuman = true;
        G.players[0].bet = bet;
        G.players[0].totalBet = bet;
        G.currentBet = bet;
        G.lastAggressor = raised ? G.players[0] : null;
        const p = G.players[1];
        p.hand = hole;
        p.stack = 1000;
        p.style = 'balanced';
        p.tightness = 0.45;
        p.aggression = 0.5;
        return p;
      };
      AI.seed(777);
      spot([c(14, 0), c(14, 1)], 200, 1);
      const aces = AI.decide(1);
      spot([c(7, 0), c(2, 1)], 200, 1);
      const trash = AI.decide(1);
      AI.unseed();

      // Same marginal hand, two prices: a small bet is a call, an overbet is not.
      const flopSpot = (bet) => {
        spot([c(9, 0), c(9, 1)], bet, 1);
        G.community = [c(14, 0), c(13, 1), c(4, 2)];
        G.street = 'flop';
        G.players[2].totalBet = 60;
        G.players[3].totalBet = 60;
        AI.seed(31337);
        const move = AI.decide(1);
        AI.unseed();
        return move;
      };
      const cheap = flopSpot(10);
      const dear = flopSpot(600);

      // Same spot, same seed, different hidden cards: the move cannot change.
      const peek = (holes) => {
        spot([c(11, 0), c(11, 1)], 120, 1);
        holes.forEach((hole, i) => { G.players[i + 2].hand = hole; });
        AI.seed(4242);
        const move = AI.decide(1);
        return JSON.stringify(move);
      };
      const first = peek([[c(14, 0), c(14, 1)], [c(13, 0), c(13, 1)]]);
      const second = peek([[c(2, 0), c(3, 1)], [c(4, 0), c(6, 1)]]);
      AI.unseed();

      AI.seed(99);
      const flushDraw = AI.discards([c(14, 0), c(13, 0), c(12, 0), c(11, 0), c(2, 1)], 1);
      const pat = AI.discards([c(6, 0), c(7, 0), c(8, 0), c(9, 0), c(10, 0)], 1);
      const trashHand = AI.discards([c(2, 0), c(7, 1), c(9, 2), c(11, 3), c(13, 0)], 1);
      AI.unseed();

      return {
        aces, trash, first, second, cheap, dear,
        flushDiscards: flushDraw.map(x => x.rank + ':' + x.suit),
        pat: pat.length,
        trashCount: trashHand.length
      };
    });

    assert.ok(behaviour.aces.type !== 'fold', 'aces never fold to a big bet');
    assert.equal(behaviour.trash.type, 'fold', 'seven-deuce folds to a pot-sized bet');
    assert.ok(behaviour.cheap.type !== 'fold', 'calls a tiny bet with a marginal pair');
    assert.equal(behaviour.dear.type, 'fold', 'folds the same pair to an overbet');
    assert.equal(behaviour.first, behaviour.second, 'the same spot gives the same move whatever the other players hold');
    assert.deepEqual(behaviour.flushDiscards, ['2:1'], 'five-card draw keeps four to a flush');
    assert.equal(behaviour.pat, 0, 'a straight flush stands pat');
    assert.ok(behaviour.trashCount >= 3, 'a dead draw hand throws most of itself away');

    // Betting ranges must actually tighten: the same hand is worth less against
    // a bettor than against a random hand. This was silently a no-op once.
    const ranges = await frame.evaluate(() => {
      const AI = window.__pokerAI;
      const c = (r, s) => ({ rank: r, suit: s });
      const board = [c(13, 0), c(9, 1), c(4, 2)];
      const topPair = [c(13, 2), c(7, 0)];
      AI.seed(99);
      const wild = AI.equity(topPair, board, 1, 500, 0);
      const tight = AI.equity(topPair, board, 1, 500, AI.startCut(0.1));
      AI.unseed();
      return {
        wild: +wild.toFixed(3), tight: +tight.toFixed(3),
        cut: +AI.startCut(0.1).toFixed(3), randomCut: +AI.startCut(0.2).toFixed(3)
      };
    });
    assert.ok(ranges.tight < ranges.wild - 0.06,
      'a tighter betting range lowers equity (' + ranges.wild + ' -> ' + ranges.tight + ')');
    assert.ok(ranges.cut > ranges.randomCut, 'the top 10% of hands is a stricter cut than the top 20%');

    // Side pots are one story: the same winner must not be logged once per pot,
    // and the human is never "You wins".
    const ledgers = await frame.evaluate(() => {
      G.phase = 'showdown';
      G.variant = 'holdem';
      G.revealAll = true;
      G.community = [{ rank: 14, suit: 0 }, { rank: 13, suit: 1 }, { rank: 9, suit: 2 }, { rank: 4, suit: 3 }, { rank: 2, suit: 0 }];
      G.log = [];
      G.players = G.players.slice(0, 3);
      const hands = [[{ rank: 14, suit: 1 }, { rank: 13, suit: 2 }], [{ rank: 13, suit: 0 }, { rank: 12, suit: 1 }], [{ rank: 5, suit: 0 }, { rank: 6, suit: 1 }]];
      // unequal contributions create a side pot that the same player wins
      const bets = [300, 150, 100];
      G.players.forEach((p, i) => {
        p.hand = hands[i];
        p.totalBet = bets[i];
        p.stack = 100;
        p.folded = false;
        p.result = bestHand(p.hand.concat(G.community));
      });
      const won = settlePots();
      const winLines = G.log.filter(e => /wins? /.test(e.text));
      return { log: G.log.map(e => e.text), winLines: winLines.length, winner: G.players[0].name, won: won.get(G.players[0]) };
    });
    assert.equal(ledgers.winLines, 1, 'one win line for a hand that takes the main pot and a side pot');
    assert.match(ledgers.log[0], /^You win 550 /, 'the human reads "You win", not "You wins" (got: ' + ledgers.log[0] + ')');
    assert.equal(ledgers.won, 550, 'the main pot and side pot are paid out once');

    // The draw UI still works end to end against the new opponent code.
    await frame.click('#tab-draw');
    await frame.waitForFunction(() => G.variant === 'draw' && G.phase === 'betting' && G.awaitingHuman);
    await frame.evaluate(() => {
      const call = document.getElementById('ctrl-call');
      const check = document.getElementById('ctrl-check');
      (call || check).click();
    });
    await frame.waitForFunction(() => G.phase === 'draw' && document.getElementById('ctrl-draw') !== null, { timeout: 20000 });
    await frame.click('.card-slot');
    await frame.waitForFunction(() => document.querySelectorAll('.discard-tag').length === 1);
    assert.match(await text(frame, '#ctrl-draw'), /Draw 1 card/);
    await frame.click('#ctrl-draw');
    await frame.waitForFunction(() => G.street === 'bet2' || G.phase === 'handOver', { timeout: 20000 });
    const spoken = await frame.evaluate(() => G.log.map(e => e.text).filter(t => /\bYou (wins|calls|folds|checks|raises|bets|posts|gets|draws|stands)\b/.test(t)));
    assert.deepEqual(spoken, [], 'the ledger conjugates for the human: ' + spoken.join(' | '));
    await close();
  });

  await t.test('Solitaire sweeps up a drag that loses its ending instead of freezing a card', async () => {
    const frame = await openTitle('solitaire', 'Solitaire');
    await frame.waitForSelector('#pileStock');
    await frame.click('#pileStock');
    await frame.click('#pileStock');
    const orphaned = await frame.evaluate(() => {
      // what a press that never reports its release leaves behind
      const card = document.querySelector('#pileWaste .card:not(.ghost)');
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      document.querySelector('#dragLayer').appendChild(ghost);
      card.classList.add('dragging');
      return { ghosts: document.querySelectorAll('.drag-ghost').length,
        hidden: document.querySelectorAll('.card.dragging').length };
    });
    assert.equal(orphaned.ghosts, 1);
    assert.equal(orphaned.hidden, 1);
    await frame.click('#pileStock');
    const after = await frame.evaluate(() => ({
      ghosts: document.querySelectorAll('.drag-ghost').length,
      hidden: document.querySelectorAll('.card.dragging').length,
      moves: document.querySelector('#statMoves').textContent,
      waste: document.querySelectorAll('#pileWaste .card').length
    }));
    assert.equal(after.ghosts, 0, 'the frozen drag is cleared');
    assert.equal(after.hidden, 0, 'its card is visible again');
    assert.equal(after.moves, '3', 'and the click still draws: ' + after.moves + ' moves');
    await close();
  });

  await t.test('the 8 Ball CPU simulates its shots, so it pots, never fouls, and never scratches', async () => {
    const frame = await openTitle('8ball', '8 Ball');
    await frame.waitForFunction(() => typeof window.__8ball === 'object');

    // Only the black left: it must play the pot, not bump the 8 around.
    const black = await frame.evaluate(() => {
      __8ball.setup({ groups: ['stripe', 'solid'], openTable: false, breakShot: false,
        balls: [{ id: 0, x: 120, y: 55 }, { id: 8, x: 170, y: 30 }] });
      const plan = __8ball.plan();
      return { plan, sim: __8ball.simulate(plan.angle, plan.power) };
    });
    assert.match(String(black.plan.label), /8/, 'lines up the black');
    assert.ok(black.sim.potted.includes(8), 'and drops it');
    assert.ok(!black.sim.potted.includes(0), 'without following it in');

    // Snookered behind an opponent ball: still a legal contact, never a foul on the 8.
    const snookered = await frame.evaluate(() => {
      __8ball.setup({ groups: ['stripe', 'solid'], openTable: false, breakShot: false,
        balls: [{ id: 0, x: 60, y: 55 }, { id: 1, x: 130, y: 55 }, { id: 2, x: 190, y: 55 },
          { id: 9, x: 100, y: 55 }, { id: 10, x: 150, y: 30 }, { id: 8, x: 190, y: 90 }] });
      const targets = __8ball.targets();
      const plan = __8ball.plan();
      return { targets, plan, sim: __8ball.simulate(plan.angle, plan.power) };
    });
    assert.ok(snookered.targets.length > 0);
    assert.ok(snookered.targets.includes(snookered.sim.firstHit),
      'first contact is legal (' + snookered.sim.firstHit + ' vs ' + snookered.targets.join(',') + ')');
    assert.ok(!snookered.sim.potted.includes(0), 'no scratch out of a snooker');

    // Seeded layouts: whatever it chooses must be a legal shot that leaves the 8 on the table.
    const sweep = await frame.evaluate(() => {
      let seed = 7;
      const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const out = { turns: 0, fouls: 0, stuck: 0, scratches: 0, eights: 0, pots: 0, ms: 0, worst: 0 };
      for (let trial = 0; trial < 40; trial++) {
        const balls = [{ id: 0, x: 20 + rand() * 180, y: 12 + rand() * 86 }];
        const place = id => balls.push({ id, x: 10 + rand() * 200, y: 10 + rand() * 90 });
        for (let i = 0; i < 2 + Math.floor(rand() * 4); i++) place(i + 1);
        for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) place(i + 9);
        place(8);
        for (let a = 0; a < balls.length; a++) for (let b = a + 1; b < balls.length; b++) {
          if (Math.hypot(balls[b].x - balls[a].x, balls[b].y - balls[a].y) < 7.2) {
            balls[b].x = Math.min(214, Math.max(6, balls[b].x + 7.4));
          }
        }
        __8ball.setup({ groups: ['stripe', 'solid'], openTable: false, breakShot: false, balls });
        const legal = __8ball.targets();
        const t0 = performance.now();
        const plan = __8ball.plan();
        const ms = performance.now() - t0;
        const sim = __8ball.simulate(plan.angle, plan.power);
        const stuck = __8ball.fan() === null && __8ball.escape() === null;
        out.turns++;
        out.ms += ms;
        out.worst = Math.max(out.worst, ms);
        if (sim.potted.includes(0)) out.scratches++;
        if (sim.potted.includes(8)) out.eights++;
        if (sim.firstHit === null || !legal.includes(sim.firstHit)) {
          if (stuck) out.stuck++; else out.fouls++;
        }
        if (sim.potted.some(id => id !== 0 && id !== 8)) out.pots++;
      }
      out.avg = +(out.ms / out.turns).toFixed(1);
      return out;
    });
    assert.equal(sweep.fouls, 0, 'no avoidable foul in ' + sweep.turns + ' layouts');
    assert.ok(sweep.stuck <= 4, 'only racks with no legal contact at all leave a foul: ' + sweep.stuck);
    assert.equal(sweep.scratches, 0, 'no scratches');
    assert.equal(sweep.eights, 0, 'never pots the 8 early');
    assert.ok(sweep.pots >= 28, 'converts most open looks: ' + sweep.pots + '/' + sweep.turns);
    assert.ok(sweep.avg < 120, 'decisions stay interactive: ' + sweep.avg + 'ms average, ' + sweep.worst.toFixed(0) + 'ms worst');

    // A whole self-played rack: the old planner never finished a game at all.
    const rack = await frame.evaluate(() => {
      __8ball.start('cpu');
      let frames = 0, pots = 0, shots = 0, wasRunning = false;
      while (frames < 24000) {
        __8ball.frame(1); frames++;
        const now = __8ball.state();
        if (wasRunning && now !== 'run') pots += __8ball.pottedThisShot().filter(id => id !== 0 && id !== 8).length;
        if (now === 'run' && !wasRunning) shots++;
        wasRunning = now === 'run';
        if (now === 'over') break;
        if (now === 'aim' || now === 'hand') __8ball.autoPlay();
      }
      return { over: __8ball.state() === 'over', pots, shots, frames };
    });
    assert.equal(rack.over, true, 'a rack reaches a winner');
    assert.ok(rack.pots >= 7, 'somebody clears their group: ' + rack.pots);
    assert.ok(rack.shots <= 60, 'without bunting the black around forever: ' + rack.shots + ' shots');

    // Ball in hand must land somewhere the player can legally reach a ball.
    const hand = await frame.evaluate(() => {
      __8ball.setup({ groups: ['stripe', 'solid'], openTable: false, breakShot: false, balls: [
        { id: 1, x: 145, y: 65 }, { id: 2, x: 118, y: 69 }, { id: 3, x: 102, y: 93 },
        { id: 4, x: 184, y: 66 }, { id: 5, x: 180, y: 79 }, { id: 6, x: 192, y: 19 },
        { id: 7, x: 188, y: 78 }, { id: 15, x: 171, y: 75 }, { id: 8, x: 175, y: 67 }] });
      const spot = __8ball.handSpot();
      return { spot, reachable: __8ball.reach(spot.x, spot.y) };
    });
    assert.equal(hand.reachable, true, 'ball in hand finds a legal line: ' + JSON.stringify(hand.spot));
    await close();
    // that rack posts a real score; clear it so the scoring checks below start clean
    await pause(300);
    await page.evaluate(() => localStorage.removeItem('bored.high.8ball'));
  });

  await t.test('game scores feed the high-score entries without counting unfinished runs', async () => {
    const keys = ['tetris', 'wordle', '8ball', 'poker', 'deep'].map(id => 'bored.high.' + id);
    await page.evaluate(list => list.forEach(key => localStorage.removeItem(key)), keys);
    try {
      let frame = await openTitle('tetris', 'Tetris');
      await frame.waitForFunction(() => typeof __boredSnapshot === 'function');
      // Tetris is ranked on the score the game keeps, not the line count: two
      // runs can clear the same lines and still be different runs.
      await frame.evaluate(() => { window.__boredSnapshot = () => ({ slug: 'tetris', lines: 42, score: 4200 }); });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.tetris')), '4200');

      frame = await openTitle('wordle', 'Wordle');
      await frame.waitForFunction(() => typeof __boredSnapshot === 'function');
      await frame.evaluate(() => { window.__boredSnapshot = () => ({ slug: 'wordle', solved: false, guesses: 2 }); });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.wordle')), null, 'unsolved runs do not count');
      frame = await openTitle('wordle', 'Wordle');
      await frame.waitForFunction(() => typeof __boredSnapshot === 'function');
      await frame.evaluate(() => { window.__boredSnapshot = () => ({ slug: 'wordle', solved: true, guesses: 2 }); });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.wordle')), '3');
      frame = await openTitle('wordle', 'Wordle');
      await frame.waitForFunction(() => typeof __boredSnapshot === 'function');
      await frame.evaluate(() => { window.__boredSnapshot = () => ({ slug: 'wordle', solved: true, guesses: 4 }); });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.wordle')), '3', 'worse solves keep the best');

      frame = await openTitle('8ball', '8 Ball');
      await frame.waitForFunction(() => typeof window.__test?.balls === 'function');
      await frame.evaluate(() => {
        window.__test.balls = () => [{ id: 1, alive: false }, { id: 2, alive: true }];
        window.__test.mode = () => 'cpu';
      });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.8ball')), '1', 'counts pocketed object balls');
      // 8 Ball is a two-player game: only the CPU counts, never a human opponent.
      await page.evaluate(() => localStorage.removeItem('bored.high.8ball'));
      frame = await openTitle('8ball', '8 Ball');
      await frame.waitForFunction(() => typeof window.__test?.balls === 'function');
      await frame.evaluate(() => {
        window.__test.balls = () => [{ id: 1, alive: false }, { id: 2, alive: false }];
        window.__test.mode = () => '2p';
      });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.8ball')), null, 'two-player wins stay off the board');

      frame = await openTitle('poker', 'Poker');
      await frame.waitForFunction(() => typeof __boredSnapshot === 'function');
      await frame.evaluate(() => { window.__boredSnapshot = () => ({ slug: 'poker', handOver: false, profit: 500 }); });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.poker')), null, 'unfinished hands do not count');
      frame = await openTitle('poker', 'Poker');
      await frame.waitForFunction(() => typeof __boredSnapshot === 'function');
      await frame.evaluate(() => { window.__boredSnapshot = () => ({ slug: 'poker', handOver: true, profit: 500 }); });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.poker')), '500');

      // DEEP only counts a descent that ended, and keeps its clear bonus.
      frame = await openTitle('deep', 'DEEP');
      await frame.waitForFunction(() => typeof __boredSnapshot === 'function');
      await frame.evaluate(() => { window.__boredSnapshot = () => ({ slug: 'deep', score: 900, finished: false }); });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.deep')), null, 'an abandoned descent does not post');
      frame = await openTitle('deep', 'DEEP');
      await frame.waitForFunction(() => typeof __boredSnapshot === 'function');
      await frame.evaluate(() => { window.__boredSnapshot = () => ({ slug: 'deep', score: 2402, finished: true }); });
      await close();
      assert.equal(await page.evaluate(() => localStorage.getItem('bored.high.deep')), '2402', 'a cleared descent posts its bonus score');

      // Every game ranks on its own board, and one the server has no rule row
      // for is only saved locally rather than folding into another game's
      // score — so this holds whatever the live rule list contains.
      const boards = await page.evaluate(() => ({
        ids: LB_GAMES.map(game => game.id),
        boards: boardGames().length,
        localOnly: LB_GAMES.filter(game => isLocalOnly(game.id)).length
      }));
      assert.equal(boards.boards, boards.ids.length, 'every game is its own board');
      assert.equal(new Set(boards.ids).size, boards.ids.length, 'no board is listed twice');
      assert.match(await text(page, '#lb-note'), new RegExp('across ' + boards.ids.length + ' games'));
    } finally {
      if (await page.$eval('#player', el => !el.hidden)) await close();
      await page.evaluate(list => list.forEach(key => localStorage.removeItem(key)), keys);
    }
  });

  await t.test('every daily adapter boots and exposes current-run state', async () => {
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
    assert.deepEqual(requests.filter(request => !request.startsWith(API)), []);
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
    await restart();
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

  await t.test('completed challenge days show as a streak, and nothing at all shows nothing', async () => {
    const days = ['2031-01-04', '2031-01-05', '2031-01-06', '2031-01-07'];
    // Whatever completions the suite has already earned, the line has to end up
    // exactly as it started once these four days are taken back out.
    const before = {
      hidden: await page.$eval('#daily-streak', el => el.hidden),
      text: await text(page, '#daily-streak')
    };
    // Each day is completed against its own goal, whatever the rotation picked.
    const verified = await page.evaluate(list => {
      window.originalDailyDate ||= dailyDate;
      const checks = [];
      for (const date of list) {
        const challenge = dailyChallenge(date);
        const snapshot = { slug: challenge.slug, solved: true, undoUsed: false, pairs: 8,
          cpu: true, finished: true, accuracy: 100, normal: true, standard: true,
          hints: 0, handOver: true, materials: 4, seconds: 120, herbs: 20, predators: 3 };
        snapshot[challenge.metric] = ['word', 'memory', 'mines'].includes(challenge.rule) ? 0 : challenge.target;
        if (challenge.rule === 'connect') snapshot.won = 1;
        else if (challenge.rule === 'mines') snapshot.won = true;
        checks.push(dailyCheck(challenge, snapshot).complete);
        localStorage.setItem('bored.daily.' + challenge.id, JSON.stringify({ id: challenge.id, snapshot }));
      }
      return checks;
    }, days);
    assert.deepEqual(verified, [true, true, true, true], 'every seeded day verifies against its own goal');

    await page.evaluate(day => { dailyDate = () => day; renderDaily(); }, days[3]);
    assert.equal(await page.$eval('#daily-streak', el => el.hidden), false);
    assert.equal(await text(page, '#daily-streak'), '4-day streak');

    // Today is still to play, so the run from yesterday carries on.
    await page.evaluate(day => { dailyDate = () => day; renderDaily(); }, '2031-01-08');
    assert.equal(await text(page, '#daily-streak'), '4-day streak', 'an outstanding today does not break the run');

    // A gap ends the run but the longest one is remembered.
    await page.evaluate(() => localStorage.removeItem('bored.daily.' + dailyChallenge('2031-01-06').id));
    await page.evaluate(day => { dailyDate = () => day; renderDaily(); }, days[3]);
    assert.equal(await text(page, '#daily-streak'), '1-day streak · best 2');

    await page.evaluate(list => {
      for (const date of list) localStorage.removeItem('bored.daily.' + dailyChallenge(date).id);
      renderDaily();
    }, days);
    assert.equal(await page.$eval('#daily-streak', el => el.hidden), before.hidden, 'removing the seeded days restores the line');
    assert.equal(await text(page, '#daily-streak'), before.text);
    await page.evaluate(() => { dailyDate = window.originalDailyDate; renderDaily(); });
  });

  await t.test('every offline game boots with the shared daily seed', async () => {
    const slugs = await page.evaluate(() => ORDER.filter(([slug]) => !EXTERNS[slug] && !NEW_GAMES.includes(slug)).map(([slug]) => slug));
    const seeds = new Set();
    for (const slug of slugs) {
      await page.evaluate(id => openGame(id), slug);
      await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.body?.childElementCount > 0);
      await pause(180);
      const seed = await page.evaluate(() => document.querySelector('#frame').contentWindow.__boredSeed);
      assert.ok(seed && Number.isFinite(seed.seed) && /^[0-9A-F]{6}$/.test(seed.code), slug + ' receives the shared daily seed');
      seeds.add(seed.date + ':' + seed.seed);
      await close();
    }
    assert.equal(seeds.size, 1, 'every game receives the same daily seed');
    assert.deepEqual(errors, [], 'no uncaught JavaScript errors');
    const external = requests.filter(request => !request.startsWith(API));
    assert.deepEqual(external, [], 'no external requests other than the configured leaderboard');
  });

  await t.test('mobile hub and all new games fit at 320px; random respects the active filter', async () => {
    await page.setViewport({ width: 320, height: 740, isMobile: true, hasTouch: true });
    await filter('New');
    await noOverflow();
    await page.click('#random');
    await page.waitForFunction(() => !document.querySelector('#player').hidden);
    assert.ok(await page.evaluate(() => FRESH_GAMES.includes(current)));
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
      const toggle = await (await page.$('#menu-toggle')).boundingBox();
      assert.ok(toggle.x >= 0 && toggle.x + toggle.width <= 320, 'menu button fits on mobile');
      await page.click('#menu-toggle');
      const menu = await (await page.$('#player-actions')).boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= 320 && menu.y >= 0 && menu.y + menu.height <= 740, 'player menu fits on mobile');
      await page.keyboard.press('Escape');
      assert.equal(await page.$eval('#player-actions', el => el.hidden), true);
      await close();
    }
  });

  await t.test('blocked storage does not break the hub or new games', async () => {
    const restricted = await browser.newPage();
    const failures = [];
    restricted.on('pageerror', err => failures.push(err.message));
    await restricted.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
      Math.random = () => 0;
    });
    await restricted.goto(url);
    assert.equal(await restricted.$$eval('.card', els => els.length), await page.evaluate(() => ORDER.length));
    for (const slug of ['2048', 'memory', 'connect-four', 'aim-lab']) {
      await restricted.evaluate(id => openGame(id), slug);
      await restricted.waitForFunction(() => document.querySelector('#frame').contentDocument?.querySelector('#board')?.childElementCount > 0);
      await restricted.click('#menu-toggle');
      await restricted.click('#back');
    }
    await restricted.evaluate(day => { dailyDate = () => day; renderDaily(); }, dateFor('memory'));
    await restricted.click('#daily-play');
    await restricted.waitForFunction(() => typeof document.querySelector('#frame').contentWindow.__boredSnapshot === 'function');
    const daily = await (await restricted.$('#frame')).contentFrame();
    for (let i = 1; i <= 8; i++) {
      await daily.click('.memory-card:nth-child(' + i + ')');
      await daily.click('.memory-card:nth-child(' + (i + 8) + ')');
    }
    await restricted.waitForFunction(() => document.querySelector('#challenge-progress').textContent.startsWith('✓'));
    await restricted.click('#menu-toggle');
    await restricted.click('#back');
    assert.match(await text(restricted, '#daily-status'), /Automatically verified/);
    await noOverflow(daily);
    assert.deepEqual(failures, []);
    await restricted.close();
  });

  await t.test('a guest plays without an account and is offered the best they just set', async () => {
    await page.evaluate(() => { localStorage.removeItem('bored.high.lights-out'); openGame('lights-out'); });
    await page.waitForFunction(() => document.querySelector('#frame').contentWindow.__boredSnapshot?.().slug === 'lights-out');
    await page.evaluate(() => {
      document.querySelector('#frame').contentWindow.__boredSnapshot = () => ({ slug: 'lights-out', cleared: 3 });
      captureHighScore();
    });
    // No account appears in the background, and the strip keeps calling them a guest.
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bored.session') || 'null')), null);
    assert.equal(await text(page, '#account-state'), 'Playing as a guest. Scores stay in this browser.');
    assert.equal(await text(page, '#account-action'), 'Sign in');
    assert.equal(await page.$eval('#account-rename', el => el.hidden), true);
    assert.equal(await page.$eval('#account-action', el => el.classList.contains('primary')), true);
    await close({ dismissClaim: false });
    // Leaving the game names the run they just saved and offers an account for it.
    await page.waitForFunction(() => document.querySelector('#claim-dialog')?.open === true);
    assert.equal(await text(page, '#claim-heading'), 'You scored 3 boards in Lights Out.');
    assert.match(await text(page, '#claim-blurb'), /sign in or create an account to add it to the leaderboard/i);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bored.pendingClaim') || 'null')), null,
      'showing the offer stores nothing; only choosing an account does');
    await page.click('#claim-signin');
    await page.waitForFunction(() => document.querySelector('#auth-dialog')?.open === true);
    assert.equal(await page.$eval('#claim-dialog', dialog => dialog.open), false);
    assert.equal(await text(page, '#auth-title'), 'Sign in');
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('bored.pendingClaim') || 'null')),
      { slug: 'lights-out', value: 3 },
      'choosing an account remembers which run was offered'
    );
    await page.click('#auth-cancel');
    // The board keeps not pointing at them either.
    await page.click('#lb-refresh');
    await page.waitForFunction(() => document.querySelector('#lb-note').textContent.includes('Players ranked'));
    assert.doesNotMatch(await text(page, '#lb-mine'), /Your account/);
    assert.doesNotMatch(await text(page, '#lb-list'), /\(you\)/);
  });
});

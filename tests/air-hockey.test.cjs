const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const file = path.join(__dirname, '../src/games/content/air-hockey.html');

// Run the real game's physics and CPU without a clock or a renderer. The
// browser test below covers the menus, pointer input and the hub hooks.
function game() {
  const elements = new Map();
  const canvasContext = new Proxy({}, { get: (obj, key) => key in obj ? obj[key] : () => {}, set: (obj, key, value) => { obj[key] = value; return true; } });
  const element = () => new Proxy({ style: {}, innerHTML: '', textContent: '', hidden: false },
    { get: (obj, key) => key in obj ? obj[key] : key === 'getContext' ? () => canvasContext : key === 'querySelector' ? () => element() : () => {},
      set: (obj, key, value) => { obj[key] = value; return true; } });
  const context = vm.createContext({
    document: { querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); },
      createElement: () => element(), addEventListener() {}, hidden: false },
    requestAnimationFrame() {}, addEventListener() {}, localStorage: { getItem: () => null, setItem() {} }, devicePixelRatio: 1
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(file, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1], context);
  // Objects come back as plain copies so deep comparisons work across the VM boundary.
  return code => { const value = vm.runInContext(code, context); return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; };
}

// Deterministic randomness so a match played here plays out the same every run.
const seeded = seed => `(() => { let a = ${seed} >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;

// The left paddle is given a CPU too, standing in for a player of that level.
function playMatch(run, left, right, seed, maxSeconds = 900) {
  run(`rand = ${seeded(seed)}; startMatch('1p', ${right}); paddles[0].ai = makeAI(LEVELS[${left}]); paddles[0].ai.wait = .7`);
  for (let i = 0; i < 120 * maxSeconds && run('phase') !== 'over'; i++) run('tick(STEP)');
  return { score: run('score.slice()'), over: run('phase') === 'over' };
}

test('the snapshot is zeroed before a match and only a finished win over the CPU scores', async () => {
  const run = game();
  const { scoreValue, HIGH_SCORE_GAMES } = await import('../src/hub/scores.js');
  assert.ok(HIGH_SCORE_GAMES.find(spec => spec.id === 'air-hockey'));
  assert.deepEqual(run('__boredSnapshot()'), { slug: 'air-hockey', beaten: 0, points: 0, cpu: false, finished: false });

  run('startMatch("1p", 2)');
  assert.equal(run('__boredSnapshot().cpu'), true);
  run('score = [6, 3]; goal(0); goalTimer = 0; tick(STEP)');
  assert.equal(run('phase'), 'over');
  assert.deepEqual(run('__boredSnapshot()'), { slug: 'air-hockey', beaten: 3, points: 7, cpu: true, finished: true });
  assert.equal(scoreValue('air-hockey', run('__boredSnapshot()')), 3, 'beating hard is worth 3');

  run('startMatch("1p", 0); score = [3, 6]; goal(1); goalTimer = 0; tick(STEP)');
  assert.equal(run('__boredSnapshot().beaten'), 0, 'a loss is not a result');
  assert.equal(scoreValue('air-hockey', run('__boredSnapshot()')), 0);

  run('startMatch("2p", 0); score = [6, 0]; goal(0); goalTimer = 0; tick(STEP)');
  assert.equal(run('__boredSnapshot().finished'), true);
  assert.equal(run('__boredSnapshot().beaten'), 0, 'a two-player win never posts');

  run('startMatch("1p", 1); score = [2, 1]');
  assert.equal(run('__boredSnapshot().finished'), false, 'an unfinished match does not count');
  assert.equal(scoreValue('air-hockey', run('__boredSnapshot()')), 0);
});

test('the puck stays on the table, scores once, and is served to whoever conceded', () => {
  const run = game();
  run('startMatch("2p", 0)');
  // fire it at a wall and let it rattle round the table: it must never leave
  run('puck.x = 400; puck.y = 100; puck.vx = 900; puck.vy = -1100');
  for (let i = 0; i < 600; i++) {
    run('tick(STEP)');
    assert.ok(run('puck.y >= KR - 1e-6 && puck.y <= H - KR + 1e-6'), 'inside the top and bottom walls');
  }
  // straight into the right goal: the left player scores, once
  run('score = [0, 0]; phase = "play"; paddles.forEach(p => { p.y = 40; p.vx = p.vy = 0; }); puck.x = 700; puck.y = 220; puck.vx = 600; puck.vy = 0');
  for (let i = 0; i < 120; i++) run('tick(STEP)');
  assert.deepEqual(run('score'), [1, 0]);
  assert.equal(run('phase'), 'goal');
  for (let i = 0; i < 120; i++) run('tick(STEP)');
  assert.equal(run('phase'), 'play');
  assert.ok(run('puck.x') > 400, 'the puck is served on the side that conceded');
  assert.equal(run('puck.vx === 0 && puck.vy === 0'), true);
  // a puck off the goal mouth bounces off the end wall instead of scoring
  run('paddles.forEach(p => { p.y = 400; }); puck.x = 700; puck.y = 60; puck.vx = 800; puck.vy = 0');
  for (let i = 0; i < 120; i++) run('tick(STEP)');
  assert.deepEqual(run('score'), [1, 0]);
  assert.ok(run('puck.vx') < 0);
});

test('paddles stay on their own side and a fast paddle cannot tunnel the puck', () => {
  const run = game();
  run('startMatch("2p", 0)');
  run('paddles[0].ctl = "pointer"; paddles[0].tx = 790; paddles[0].ty = 220');
  for (let i = 0; i < 240; i++) run('tick(STEP)');
  assert.ok(run('paddles[0].x') <= 400 - 30 + 1e-6, 'the left paddle stops at the centre line');
  run('paddles[0].tx = -50; paddles[0].ty = -50');
  for (let i = 0; i < 240; i++) run('tick(STEP)');
  assert.ok(run('paddles[0].x >= PR - 1e-6 && paddles[0].y >= PR - 1e-6'), 'and at the end wall');
  // sweep the paddle through a resting puck at full human speed
  run('puck.x = 300; puck.y = 220; puck.vx = puck.vy = 0; paddles[0].x = 200; paddles[0].y = 220; paddles[0].vx = paddles[0].vy = 0; paddles[0].tx = 360; paddles[0].ty = 220');
  for (let i = 0; i < 14; i++) run('tick(STEP)');
  assert.ok(run('puck.vx') > 300, 'the puck is hit');
  assert.ok(run('Math.hypot(puck.vx, puck.vy) <= MAX_SPEED + 1e-6'), 'and never faster than the cap');
});

test('the CPU levels are ordered and a match against any of them finishes', () => {
  const run = game();
  const hardOverEasy = playMatch(run, 2, 0, 11);
  assert.ok(hardOverEasy.over, 'hard against easy reaches seven');
  assert.ok(hardOverEasy.score[0] > hardOverEasy.score[1], 'hard beats easy');
  const mediumOverEasy = playMatch(run, 1, 0, 12);
  assert.ok(mediumOverEasy.over && mediumOverEasy.score[0] > mediumOverEasy.score[1], 'medium beats easy');
  const hardOverMedium = playMatch(run, 1, 2, 13);
  assert.ok(hardOverMedium.over, 'hard against medium reaches seven');
  assert.ok(hardOverMedium.score[1] > hardOverMedium.score[0], 'hard beats medium');
});

test('a puck left dead in the CPU half is knocked back into play', () => {
  const run = game();
  run('startMatch("1p", 0); paddles[1].ai.wait = 999; puck.x = 600; puck.y = 100; puck.vx = puck.vy = 0');
  for (let i = 0; i < 120 * 5; i++) run('tick(STEP)');
  assert.ok(run('puck.vx !== 0 || puck.vy !== 0 || puck.x < 600'), 'it moves again');
});

test('menus, difficulty picker, pointer and keyboard work in a real page', async () => {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(candidate => fs.existsSync(candidate));
  assert.ok(executablePath, 'Set CHROME_PATH or install Chrome');
  const server = await serve(path.join(__dirname, '../src'));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 960, height: 600 });
    await page.goto(server.origin + '/games/content/air-hockey.html');
    assert.equal(await page.title(), 'Air Hockey');
    assert.equal(await page.evaluate(() => phase), 'menu');
    assert.equal(await page.evaluate(() => __boredSnapshot().finished), false);

    // one player asks for a difficulty before anything starts
    await page.click('#one');
    assert.equal(await page.evaluate(() => phase), 'menu', 'no match yet');
    assert.deepEqual(await page.$$eval('.choice b', nodes => nodes.map(node => node.textContent)), ['Easy', 'Medium', 'Hard']);
    await (await page.$$('.choice'))[0].click();
    assert.equal(await page.evaluate(() => [phase, mode, level].join()), 'play,1p,0');

    // the paddle follows the pointer and stays on its half
    const box = await (await page.$('#rink')).boundingBox();
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .7, { steps: 5 });
    await new Promise(done => setTimeout(done, 500));
    const paddle = await page.evaluate(() => ({ x: paddles[0].x, y: paddles[0].y }));
    assert.ok(paddle.x < 400 && paddle.y > 250, 'paddle is on the left and below centre: ' + JSON.stringify(paddle));
    await page.mouse.move(box.x + box.width * .9, box.y + box.height * .5, { steps: 5 });
    await new Promise(done => setTimeout(done, 500));
    assert.ok(await page.evaluate(() => paddles[0].x <= W / 2 - PR + 1e-6), 'cannot cross the centre line');

    // keys, then pause
    await page.keyboard.down('KeyW');
    await new Promise(done => setTimeout(done, 300));
    await page.keyboard.up('KeyW');
    assert.ok(await page.evaluate(() => paddles[0].y < H / 2), 'W moves the paddle up the screen');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => paused), true);
    const frozen = await page.evaluate(() => puck.x + ',' + puck.y);
    await new Promise(done => setTimeout(done, 300));
    assert.equal(await page.evaluate(() => puck.x + ',' + puck.y), frozen, 'the puck holds still while paused');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => paused), false);

    // two players start straight away and each side has its own keys
    await page.evaluate(() => toMenu());
    await page.click('#two');
    assert.equal(await page.evaluate(() => [phase, mode].join()), 'play,2p');
    await page.keyboard.down('ArrowUp');
    await new Promise(done => setTimeout(done, 300));
    await page.keyboard.up('ArrowUp');
    assert.ok(await page.evaluate(() => paddles[1].y < H / 2 - 20), 'arrows move player two');
    assert.ok(await page.evaluate(() => Math.abs(paddles[0].y - H / 2) < 1), 'and leave player one alone');

    // a narrow, tall screen turns the table so it still fills the space
    await page.setViewport({ width: 360, height: 640 });
    await new Promise(done => setTimeout(done, 300));
    assert.equal(await page.evaluate(() => portrait), true);
    const fit = await page.evaluate(() => { const r = document.querySelector('#rink').getBoundingClientRect(); return { right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight }; });
    assert.ok(fit.right <= fit.w && fit.bottom <= fit.h, 'the table fits the screen');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

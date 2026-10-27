const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const load = path => fs.readFileSync(require('node:path').join(root, path), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  const first = source.indexOf('{', source.indexOf(') {', start));
  let depth = 1, end = first + 1;
  while (depth > 0 && end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0, name + ' is complete');
  return source.slice(start, end);
}

test('Solitaire counts time while hidden or paused, and freezes exactly at the win', () => {
  const html = load('src/games/content/solitaire.html');
  const begin = html.indexOf('var tWallStart = null, tWallFinish = null;');
  const end = html.indexOf('/* ============================================================', begin);
  assert.ok(begin >= 0 && end > begin);
  let clock = 1000;
  const context = vm.createContext({ started: false, won: false, performance: { now: () => clock } });
  vm.runInContext(html.slice(begin, end), context);
  context.startTimerIfNeeded();
  clock = 2500;
  context.timerStop(); // visibilitychange/blur must not pause elapsed time
  clock = 5700;
  assert.equal(context.timerNow(), 4700);
  context.won = true;
  context.timerStop();
  clock = 11000;
  assert.equal(context.timerNow(), 4700);
  context.timerReset();
  assert.equal(context.timerNow(), 0);
});

test('Mahjong requires a full timed deal for a leaderboard entry', () => {
  const html = load('src/games/content/mahjong.html');
  const begin = html.indexOf('window.__boredSnapshot = () => mode ===');
  const end = html.indexOf('/* Small handle', begin);
  assert.ok(begin >= 0 && end > begin);
  const context = vm.createContext({
    window: {}, mode: 'deal', pairs: 72, left: 0, won: true,
    tiles: Array.from({length: 144}), startedAt: 500, finishedAt: 120500
  });
  vm.runInContext(html.slice(begin, end), context);
  const completed = context.window.__boredSnapshot();
  assert.equal(completed.pairs, 72);
  assert.equal(completed.seconds, 120);
  assert.equal(completed.finished, true);
  context.mode = 'tutorial';
  assert.equal(context.window.__boredSnapshot().finished, false);
  context.mode = 'deal';
  context.left = 2;
  context.won = false;
  assert.equal(context.window.__boredSnapshot().seconds, 0);

  const scores = load('src/hub/scores.js');
  const scoreRule = {
    metric: 'seconds', min: 60, max: 86400,
    when: snapshot => snapshot.won === true && snapshot.finished === true &&
      snapshot.total === 144 && snapshot.pairs === 72
  };
  const scoreCtx = vm.createContext({ highScoreSpec: new Map([['mahjong', scoreRule]]) });
  vm.runInContext(extractFunction(scores, 'scoreValue'), scoreCtx);
  assert.equal(scoreCtx.scoreValue('mahjong', completed), 120);
  assert.equal(scoreCtx.scoreValue('mahjong', { ...completed, seconds: 3 }), 0);
  assert.equal(scoreCtx.scoreValue('mahjong', { ...completed, pairs: 6, total: 12 }), 0);
  assert.equal(scoreCtx.scoreValue('mahjong', { ...completed, finished: false }), 0);
});

test('Sand fans move gases and liquids in their facing direction but stop at solids', () => {
  const html = load('src/games/content/sand.html');
  const begin = html.indexOf('const AIRBORNE = new Set(');
  const end = html.indexOf('/* ── Simulation ── */', begin);
  assert.ok(begin >= 0 && end > begin);
  const g = new Uint8Array(20), moved = new Uint8Array(20);
  const types = {
    EMPTY: 0, SMOKE: 5, STEAM: 8, FIRE: 4, METHANE: 17,
    NITROGEN: 26, ELECTRICITY: 22, WATER: 2, OIL: 6, ACID: 9
  };
  const context = vm.createContext({
    ...types, grid: g, gMove: moved, Math: { random: () => 0 },
    I: (x, y) => x, ok: (x, y) => y === 0 && x >= 0 && x < g.length,
    moveTo: (x1, y1, x2, y2) => { g[x2] = g[x1]; g[x1] = 0; moved[x2] = 1; }
  });
  vm.runInContext(html.slice(begin, end), context);
  g[3] = types.SMOKE;
  context.updFan(2, 0, 1);
  assert.equal(g[4], types.SMOKE, 'right-facing fan pushes smoke right');
  g.fill(0); moved.fill(0);
  g[9] = types.SMOKE;
  context.updFan(10, 0, -1);
  assert.equal(g[8], types.SMOKE, 'left-facing fan pushes smoke left');
  g.fill(0); moved.fill(0);
  g[3] = types.SMOKE; g[4] = 3; // stone
  context.updFan(2, 0, 1);
  assert.equal(g[3], types.SMOKE, 'stone blocks the stream');
  g.fill(0); moved.fill(0);
  g[3] = types.WATER;
  context.updFan(2, 0, 1);
  assert.equal(g[4], types.WATER, 'light liquids move when the fan impulse succeeds');
  new vm.Script(html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')));
});

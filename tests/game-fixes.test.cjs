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

test('Wind follows eight drag headings, flows through air, pushes material, and fades', () => {
  const html = load('src/games/content/sand.html');
  const begin = html.indexOf('const WIND_DIRS = [');
  const end = html.indexOf('/* ── Simulation ── */', begin);
  assert.ok(begin >= 0 && end > begin, 'wind and mite simulation extracted');
  const width = 12, height = 8;
  const grid = new Uint8Array(width * height), gLife = new Uint8Array(grid.length);
  const gExtra = new Uint8Array(grid.length), gMove = new Uint8Array(grid.length);
  const at = (x, y) => y * width + x;
  const ctx = vm.createContext({
    grid, gLife, gExtra, gMove, frame: 1, mitePopulation: 0,
    WIND: 38, MITE: 39, EMPTY: 0, SMOKE: 5, STEAM: 8, FIRE: 4,
    METHANE: 17, NITROGEN: 26, ELECTRICITY: 22, DUST: 19,
    WATER: 2, OIL: 6, ACID: 9, PLANT: 12, VINE: 21, BREAD: 35,
    SUGAR: 36, FLOUR: 32, DOUGH: 34, WOOD: 7, MUD: 14, LAVA: 10,
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    I: at, ok: (x, y) => x >= 0 && x < width && y >= 0 && y < height,
    moveTo: (x, y, nx, ny) => {
      const a = at(x, y), b = at(nx, ny);
      grid[b] = grid[a]; grid[a] = 0;
      gLife[b] = gLife[a]; gLife[a] = 0;
      gExtra[b] = gExtra[a]; gExtra[a] = 0;
      gMove[b] = 1;
    }
  });
  vm.runInContext(html.slice(begin, end), ctx);
  assert.equal(ctx.windHeading(4, 0), 1);
  assert.equal(ctx.windHeading(3, 3), 2);
  assert.equal(ctx.windHeading(0, 4), 3);
  assert.equal(ctx.windHeading(-2, 0), 5);
  assert.equal(ctx.windHeading(0, -4), 7);
  assert.equal(ctx.windHeading(2, -2), 8);

  grid[at(2, 2)] = 38; gLife[at(2, 2)] = 40; gExtra[at(2, 2)] = 1;
  ctx.updWind(2, 2);
  assert.equal(grid[at(3, 2)], 38, 'wind advances like a gas, no anchored block');
  assert.equal(gExtra[at(3, 2)], 1, 'gust carries its direction');
  assert.equal(gLife[at(3, 2)], 39, 'gust energy dissipates');

  grid.fill(0); gLife.fill(0); gExtra.fill(0); gMove.fill(0);
  grid[at(2, 2)] = 38; gLife[at(2, 2)] = 40; gExtra[at(2, 2)] = 3;
  ctx.updWind(2, 2);
  assert.equal(grid[at(2, 3)], 38, 'vertical drag sends wind down');

  grid.fill(0); gLife.fill(0); gExtra.fill(0); gMove.fill(0);
  grid[at(2, 2)] = 38; gLife[at(2, 2)] = 40; gExtra[at(2, 2)] = 1;
  grid[at(3, 2)] = 19;
  ctx.updWind(2, 2);
  assert.equal(grid[at(4, 2)], 19, 'wind moves loose dust');
  assert.equal(grid[at(3, 2)], 38, 'gust enters the cleared cell');

  grid.fill(0); gLife.fill(0); gExtra.fill(0); gMove.fill(0);
  grid[at(2, 2)] = 38; gLife[at(2, 2)] = 1; gExtra[at(2, 2)] = 1;
  ctx.updWind(2, 2);
  assert.equal(grid[at(2, 2)], 0, 'old wind dissipates entirely');
  new vm.Script(html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')));
});

test('Mites feed on plant matter, reproduce when well-fed, and die near flames', () => {
  const html = load('src/games/content/sand.html');
  const begin = html.indexOf('const WIND_DIRS = [');
  const end = html.indexOf('/* ── Simulation ── */', begin);
  const width = 12, height = 8;
  const grid = new Uint8Array(width * height), gLife = new Uint8Array(grid.length);
  const gExtra = new Uint8Array(grid.length), gMove = new Uint8Array(grid.length);
  const at = (x, y) => y * width + x;
  const ctx = vm.createContext({
    grid, gLife, gExtra, gMove, frame: 1, mitePopulation: 0,
    WIND: 38, MITE: 39, EMPTY: 0, SMOKE: 5, STEAM: 8, FIRE: 4,
    METHANE: 17, NITROGEN: 26, ELECTRICITY: 22, DUST: 19,
    WATER: 2, OIL: 6, ACID: 9, PLANT: 12, VINE: 21, BREAD: 35,
    SUGAR: 36, FLOUR: 32, DOUGH: 34, WOOD: 7, MUD: 14, LAVA: 10,
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    I: at, ok: (x, y) => x >= 0 && x < width && y >= 0 && y < height,
    moveTo: (x, y, nx, ny) => {
      const a = at(x, y), b = at(nx, ny);
      grid[b] = grid[a]; grid[a] = 0;
      gLife[b] = gLife[a]; gLife[a] = 0;
      gExtra[b] = gExtra[a]; gExtra[a] = 0;
      gMove[b] = 1;
    }
  });
  vm.runInContext(html.slice(begin, end), ctx);
  grid[at(3, 2)] = 39; gLife[at(3, 2)] = 70;
  grid[at(4, 2)] = 12;
  ctx.updMite(3, 2);
  assert.equal(grid[at(4, 2)], 14, 'eaten plant becomes compost');
  assert.ok([...gLife].some(value => value >= 90), 'feeding restores energy');

  grid.fill(0); gLife.fill(0); gExtra.fill(0); gMove.fill(0);
  ctx.frame = 1;
  grid[at(3, 2)] = 39; gLife[at(3, 2)] = 140; gExtra[at(3, 2)] = 40;
  grid[at(4, 2)] = 12;
  ctx.updMite(3, 2);
  assert.equal(grid.filter(v => v === 39).length, 2, 'well-fed adults produce offspring');
  assert.equal(vm.runInContext('mitePopulation', ctx), 1, 'population cap accounts for births');

  grid.fill(0); gLife.fill(0); gExtra.fill(0); gMove.fill(0);
  grid[at(3, 2)] = 39; gLife[at(3, 2)] = 80;
  grid[at(4, 2)] = 4;
  ctx.updMite(3, 2);
  assert.equal(grid[at(3, 2)], 19, 'a mite dies from nearby fire');
});


test('DEEP leaderboard score ignores idle turns but rewards earned progress', () => {
  // Execute the production score formula from inside the game's IIFE, not a
  // reimplementation. Waiting and walking must never farm leaderboard points.
  const html = load('src/games/content/deep.html');
  const state = { gold: 0, kills: 0, depth: 1, turns: 0 };
  const ctx = vm.createContext({ state });
  vm.runInContext(extractFunction(html, 'liveScore'), ctx);
  assert.equal(ctx.liveScore(), 1, 'a completed zero-progress attempt stays capturable');

  state.turns = 10000;
  assert.equal(ctx.liveScore(), 1, 'waiting thousands of turns cannot raise the score');
  state.gold = 7;
  assert.equal(ctx.liveScore(), 7, 'earned gold raises the score');
  state.turns = 20000;
  assert.equal(ctx.liveScore(), 7, 'more waiting still cannot add points');
  state.kills = 2;
  assert.equal(ctx.liveScore(), 31, 'defeated enemies count as progress');
  state.depth = 2;
  assert.equal(ctx.liveScore(), 231, 'descending to a new floor counts as progress');
});

test('Frogger only awards upward progress once per row per life', () => {
  // Exercise the real reset/start/movement functions with collision detection
  // stubbed out. Oscillating in safe rows must not create unlimited points.
  const html = load('src/games/content/frogger.html');
  const begin = html.indexOf('function resetFrog(){');
  const end = html.indexOf('function check(){', begin);
  assert.ok(begin >= 0 && end > begin, 'Frogger movement functions are present');
  const ctx = vm.createContext({
    COLS: 13, ROWS: 15, tMax: 30, timer: 30, score: 0, lives: 3, level: 1,
    state: 'title', filled: new Set(), furthestRow: 13,
    frog: { x: 6, y: 13, sx: 6, sy: 13, rideDx: 0 },
    buildLanes() {}, check() {}
  });
  vm.runInContext(html.slice(begin, end), ctx);

  ctx.startGame();
  assert.equal(ctx.score, 0);
  ctx.moveFrog(0, -1);
  assert.equal(ctx.score, 10, 'first new row earns ten points');
  for (let i = 0; i < 20; i++) {
    ctx.moveFrog(0, 1);
    ctx.moveFrog(0, -1);
  }
  assert.equal(ctx.score, 10, 'up/down oscillation cannot farm the same row');
  ctx.moveFrog(0, -1);
  assert.equal(ctx.score, 20, 'reaching a genuinely new row earns points');
  ctx.resetFrog();
  ctx.moveFrog(0, -1);
  assert.equal(ctx.score, 30, 'a new life resets the progress frontier');
  ctx.startGame();
  assert.equal(ctx.score, 0, 'starting a new game resets the score');
  ctx.moveFrog(0, -1);
  assert.equal(ctx.score, 10, 'a new run still rewards legitimate progress');
});


test('Sand cloner learns wind heading and emits live directional gusts', () => {
  const html = load('src/games/content/sand.html');
  const begin = html.indexOf('const CLONABLE = new Set(');
  const end = html.indexOf('/* ── Destat ── */', begin);
  assert.ok(begin >= 0 && end > begin);
  const width = 10, height = 8, size = width * height;
  const grid = new Uint8Array(size), gLife = new Uint8Array(size);
  const gExtra = new Uint8Array(size), gMove = new Uint8Array(size);
  const I = (x, y) => y * width + x;
  const ids = {
    EMPTY: 0, SAND: 1, WATER: 2, OIL: 6, ACID: 9, LAVA: 10, MUD: 14,
    SALT: 16, GUNPOWDER: 15, DUST: 19, TAR: 20, FIRE: 4, SMOKE: 5,
    STEAM: 8, ELECTRICITY: 22, GOLD: 13, COAL: 18, SODIUM: 23,
    NITROGEN: 26, WIND: 38, CLONER: 27
  };
  const ctx = vm.createContext({
    ...ids, grid, gLife, gExtra, gMove, windDirection: 1,
    I, ok: (x, y) => x >= 0 && x < width && y >= 0 && y < height,
    rnd: (min) => min
  });
  vm.runInContext(html.slice(begin, end), ctx);
  grid[I(5, 3)] = ids.CLONER;
  grid[I(4, 3)] = ids.WIND;
  gExtra[I(4, 3)] = 7; // Gust heading: up.
  ctx.updCloner(5, 3);
  assert.equal(gExtra[I(5, 3)], ids.WIND, 'cloner memorizes wind as material');
  assert.equal(gLife[I(5, 3)], 7, 'cloner memorizes original wind heading');
  grid[I(4, 3)] = ids.EMPTY;
  ctx.updCloner(5, 3);
  for (const y of [2, 4]) {
    assert.equal(grid[I(5, y)], ids.WIND, 'cloner emits above and below');
    assert.equal(gExtra[I(5, y)], 7, 'new gust inherits the direction');
    assert.ok(gLife[I(5, y)] > 1, 'new gust has enough lifetime to push matter');
  }
});

test('Fluid exposes editable live solver parameters', () => {
  const html = load('src/games/content/fluid.html');
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new vm.Script(script));
  for (const setting of ['SPLAT_FORCE', 'CURL', 'SPLAT_RADIUS', 'DYE_STRENGTH', 'DENSITY_DISSIPATION']) {
    assert.match(html, new RegExp('data-setting="' + setting + '"'), setting + ' has a slider');
  }
  assert.match(html, /id="editor-toggle"/);
  assert.match(html, /id="fluid-reset-settings"/);
});

test('Game card leaderboard reports co-leaders instead of choosing alphabetically', () => {
  const source = load('src/hub/scores.js');
  const ctx = vm.createContext({ LB_GAMES: [{ id: 'wordle', lower: true }] });
  vm.runInContext(extractFunction(source, 'boardLeaders'), ctx);
  const leaders = ctx.boardLeaders([
    { game: 'wordle', handle: 'Zoe', value: 2 },
    { game: 'wordle', handle: 'Adam', value: 2 },
    { game: 'wordle', handle: 'Maya', value: 3 }
  ]);
  assert.equal(leaders.get('wordle').value, 2);
  assert.deepEqual(Array.from(leaders.get('wordle').handles), ['Adam', 'Zoe']);
});

test('Wordle win animation keeps the winning row after the guess counter advances', () => {
  // Exercise the actual game function with deferred timers. On a sixth-guess
  // win the old code animated row 6 (which does not exist) five times.
  const html = load('src/games/content/wordle.html');
  for (const winningRow of [0, 5]) {
    const scheduled = [];
    const animated = [];
    const ctx = vm.createContext({
      row: winningRow,
      setTimeout: (callback, delay) => scheduled.push({ callback, delay }),
      getTile: (r, col) => r >= 0 && r < 6 ? {
        classList: { add: name => animated.push([r, col, name]) }
      } : null
    });
    vm.runInContext(extractFunction(html, 'bounceRow'), ctx);
    ctx.bounceRow();
    ctx.row++; // submitGuess advances this before animation timers fire
    assert.deepEqual(scheduled.map(task => task.delay), [0, 100, 200, 300, 400]);
    for (const task of scheduled) task.callback();
    assert.deepEqual(animated, Array.from({ length: 5 }, (_, col) => [winningRow, col, 'bounce']));
  }
});

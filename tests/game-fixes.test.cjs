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

// ── Ashcrown save slots ────────────────────────────────────────────────────────────────────────────
// The slot storage functions run exactly as shipped, against an in-memory localStorage that can be
// made small, blocked or corrupt.
function slotRig(options = {}) {
  const html = load('src/games/content/ashcrown.html');
  const quota = options.quota || Infinity;
  const store = new Map();
  const log = [];
  let clock = 1_000_000;
  const used = () => [...store].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const localStorage = {
    getItem: key => { if (options.blocked) throw new Error('blocked'); return store.has(key) ? store.get(key) : null; },
    setItem: (key, value) => {
      if (options.blocked) throw new Error('blocked');
      const next = used() - (store.has(key) ? key.length + store.get(key).length : 0) + key.length + String(value).length;
      if (next > quota) { log.push('refused ' + key); throw new Error('QuotaExceededError'); }
      log.push('set ' + key); store.set(key, String(value));
    },
    removeItem: key => { if (options.blocked) throw new Error('blocked'); log.push('remove ' + key); store.delete(key); }
  };
  class FakeDate extends Date { static now() { return clock; } }
  const ctx = vm.createContext({
    localStorage, Date: FakeDate, JSON, Number, Array, String, Math,
    MAP_TYPES: { pangaea: { name: 'Pangaea' }, islands: { name: 'Islands' } },
    MAP_SIZES: { small: { name: 'Small' }, standard: { name: 'Standard' }, huge: { name: 'Huge' } },
    CIVS: { rome: { land: 'Rome', leader: 'Julius Caesar' }, carthage: { land: 'Carthage', leader: 'Hannibal' }, qin: { land: 'China', leader: 'Qin Shi Huang' },
      japan: { land: 'Japan', leader: 'Oda Nobunaga' }, inca: { land: 'Inca', leader: 'Pachacuti' } },
    LEVELS: { normal: { name: 'Normal' }, deity: { name: 'Deity' } },
    TECHS: { pottery: { era: 1 }, bronze: { era: 1 }, writing: { era: 2 }, stirrups: { era: 3 }, firearms: { era: 4 } },
    ERA_NAMES: { 1: 'Ancient', 2: 'Classical', 3: 'Medieval', 4: 'Renaissance' },
    plural: (n, one, many) => n + ' ' + (n === 1 ? one : many),
    scoreParts: () => ({ total: 84 }),
    toast: () => {}, slotAction: () => {}, closeModal: () => {},
    G: null
  });
  const prelude = html.match(/const SLOT_PREFIX[\s\S]*?let slotMode[^\n]*\n/)[0];
  const names = ['slotKind', 'humansOf', 'sizeOfState', 'eraOfPlayer', 'saveEra', 'scoreOfState', 'describeSave', 'defaultSaveName', 'autoSaveName',
    'cleanSaveName', 'slotHeader', 'validState', 'slotHead', 'slotRead', 'upgradeHead', 'slotRemove', 'slotWrite', 'moveOldSave', 'slotList',
    'saveGame', 'clearSave', 'autosave', 'rollTurnSave', 'whyNotSave', 'saveToSlot', 'quickSave', 'loadSlot', 'agoText'];
  vm.runInContext('var online = null;\n' + prelude +
    'function resumeState(state) { G = state; resumed.push(state); }\nvar resumed = [];\n' +
    names.map(name => extractFunction(html, name)).join('\n'), ctx);
  const game = (extra = {}) => ({
    v: 4, cols: 2, rows: 2, tiles: [{}, {}, {}, {}], units: [], cities: [{ owner: 0 }], conts: [], map: 'pangaea', level: 'normal', size: 'standard',
    players: [{ i: 0, name: 'Marcus', civ: 'rome', human: true, techs: [], light: '#aa88cc', ink: '#5a2a82' },
      { i: 1, name: 'Dido', civ: 'carthage', human: false, techs: [], light: '#cccccc', ink: '#444444' }],
    turn: 4, seed: 77, over: null, ...extra
  });
  const read = key => (store.has(key) ? store.get(key) : null);
  const ids = () => Array.from(vm.runInContext('slotList()', ctx), s => s.id);
  const head = id => { const raw = read('bored.civlite.slot.' + id); return raw ? JSON.parse(raw.slice(0, raw.indexOf('\n'))) : null; };
  return { ctx, store, log, game, read, head, used, ids, tick: ms => { clock += ms; return clock; }, now: () => clock,
    get: expr => vm.runInContext(expr, ctx) };
}

test('Ashcrown keeps the autosave, three turn autosaves and eight named saves in separate slots', () => {
  const r = slotRig();
  r.ctx.G = r.game();
  assert.equal(r.ctx.saveGame(), true);
  assert.deepEqual([...r.store.keys()], ['bored.civlite.slot.auto']);
  assert.equal(r.head('auto').meta, 'Rome + 1 CPU · Standard Pangaea · Normal · 1 city · Score 84');
  assert.equal(r.head('auto').name, 'Autosave · Turn 4');
  assert.deepEqual({ mv: r.head('auto').mv, civ: r.head('auto').civ, color: r.head('auto').color, era: r.head('auto').era }, { mv: 2, civ: 'rome', color: '#aa88cc', era: 'Ancient' });
  // The turn autosaves fill three slots, then the oldest is replaced.
  for (let turn = 5; turn <= 8; turn++) { r.tick(1000); r.ctx.G.turn = turn; assert.equal(r.ctx.rollTurnSave(), true); }
  const turns = ['t1', 't2', 't3'].map(id => r.head(id).turn).sort();
  assert.deepEqual(turns, [6, 7, 8], 'the last three turns are kept, turn 5 was rolled out');
  // A named save is cleaned, lands in its own slot and marks the game as safely in a slot.
  r.tick(1000);
  const saved = r.ctx.saveToSlot('m3', '   Before   the   war \n');
  assert.deepEqual({ ok: saved.ok, name: saved.name }, { ok: true, name: 'Before the war' });
  assert.equal(r.head('m3').name, 'Before the war');
  assert.equal(r.get('currentSlot'), 'm3');
  assert.equal(r.get('slotDirty'), false);
  r.ctx.autosave();
  assert.equal(r.get('slotDirty'), true, 'playing on makes it unsaved again');
  assert.equal(r.ctx.saveToSlot('m3', '').name, 'Julius Caesar · Ancient · Turn 8', 'an empty name falls back to "<leader> · <era> · Turn N"');
  assert.equal(r.ctx.saveToSlot('m3', 'x'.repeat(80)).name.length, 60, 'names are capped');
  for (const bad of ['auto', 't1', 'm9', '../x', undefined]) assert.equal(r.ctx.saveToSlot(bad, 'no').ok, false, 'not a named slot: ' + bad);
  // Listing reads headers only and sees every slot that holds a game.
  assert.deepEqual(r.ids().sort(), ['auto', 'm3', 't1', 't2', 't3']);
  // Loading puts the slot's exact game on screen and makes it the autosave.
  r.ctx.G = r.game({ turn: 40 });
  assert.equal(r.ctx.loadSlot('m3'), true);
  assert.equal(r.ctx.G.turn, 8);
  assert.equal(r.head('auto').turn, 8, 'the autosave is the game on screen');
  assert.equal(r.ctx.loadSlot('m4'), false, 'an empty slot does not load');
});

test('Ashcrown never loses a save to a full or broken browser', () => {
  const probe = slotRig();
  probe.ctx.G = probe.game({ pad: 'x'.repeat(4000) });
  probe.ctx.saveGame();
  const one = probe.used();   // what one save costs in this browser, key and header included
  // Room for three saves and not a fourth: the autosave, two named saves, and whatever turn autosaves squeeze in.
  const r = slotRig({ quota: one * 3 + 120 });
  r.ctx.G = r.game({ pad: 'x'.repeat(4000) });
  assert.equal(r.ctx.saveGame(), true);
  for (const turn of [5, 6, 7]) { r.tick(1000); r.ctx.G.turn = turn; r.ctx.rollTurnSave(); }
  const roll = [r.head('t1'), r.head('t2'), r.head('t3')].filter(Boolean).length;
  assert.ok(roll >= 1, 'some turn autosaves fit');
  // Named saves push the turn autosaves out, oldest first. They never push each other, or the autosave, out.
  r.tick(1000); assert.equal(r.ctx.saveToSlot('m1', 'One').ok, true);
  r.tick(1000); assert.equal(r.ctx.saveToSlot('m2', 'Two').ok, true);
  assert.ok(r.head('m1') && r.head('m2') && r.head('auto'));
  r.tick(1000);
  const third = r.ctx.saveToSlot('m3', 'Three');
  assert.equal(third.ok, false, 'with nothing left to give up, the save is refused');
  assert.match(third.text, /no room/);
  assert.equal(r.head('m1').name, 'One');
  assert.equal(r.head('m2').name, 'Two');
  assert.ok(r.head('auto'), 'the autosave survived');
  assert.equal(r.head('m3'), null, 'no half-written slot');
  assert.equal(r.get('currentSlot'), 'm2', 'a refused save does not change which slot the game belongs to');
  // Overwriting a slot with something that no longer fits keeps the old save whole.
  r.ctx.G.pad = 'y'.repeat(9000);
  const before = r.read('bored.civlite.slot.m1');
  assert.equal(r.ctx.saveToSlot('m1', 'Bigger').ok, false);
  assert.equal(r.read('bored.civlite.slot.m1'), before, 'the old save is untouched');
  // Storage that throws on everything never throws back.
  const blocked = slotRig({ blocked: true });
  blocked.ctx.G = blocked.game();
  assert.equal(blocked.ctx.saveGame(), false);
  assert.equal(blocked.ctx.rollTurnSave(), false);
  assert.equal(blocked.ctx.saveToSlot('m1', 'x').ok, false);
  assert.deepEqual(blocked.ids(), []);
  assert.equal(blocked.ctx.loadSlot('auto'), false);
  assert.doesNotThrow(() => blocked.ctx.clearSave());
});

test('Ashcrown moves the single save from before slots into the autosave, losing nothing', () => {
  const OLD = 'bored.civlite.save.v2';
  const r = slotRig();
  const old = { v: 4, at: 500, meta: 'Marcus vs Dido · pangaea · turn 31', state: r.game({ turn: 31 }) };
  r.store.set(OLD, JSON.stringify(old));
  assert.deepEqual(r.ids(), ['auto'], 'the old save shows up as the autosave');
  assert.equal(r.head('auto').turn, 31);
  assert.equal(r.head('auto').at, 500, 'with its own time');
  assert.equal(r.store.has(OLD), false, 'and the old key goes once it is safe');
  assert.equal(r.ctx.loadSlot('auto'), true);
  assert.equal(r.ctx.G.turn, 31);
  // An autosave made since is newer: it wins, and the stale key is dropped.
  const newer = slotRig();
  newer.ctx.G = newer.game({ turn: 50 }); newer.tick(10_000); newer.ctx.saveGame();
  newer.store.set(OLD, JSON.stringify({ ...old, at: 5 }));
  newer.ctx.slotList();
  assert.equal(newer.head('auto').turn, 50);
  assert.equal(newer.store.has(OLD), false);
  // Something unreadable is left exactly where it is, and nothing throws.
  for (const junk of ['{not json', '{"v":4,"state":{"v":9}}', 'null']) {
    const odd = slotRig();
    odd.store.set(OLD, junk);
    assert.doesNotThrow(() => odd.ctx.slotList());
    assert.equal(odd.store.get(OLD), junk, 'left alone: ' + junk);
    assert.equal(odd.head('auto'), null);
  }
  // A move that cannot be written keeps the old key, so the game is still on the device.
  const tiny = slotRig({ quota: 400 });
  tiny.store.set(OLD, JSON.stringify(old));
  tiny.ctx.slotList();
  assert.equal(tiny.store.has(OLD), true, 'not removed when the copy did not fit');
});

test('Ashcrown slots: a damaged slot is skipped, a finished game clears only its autosave', () => {
  const r = slotRig();
  r.ctx.G = r.game();
  r.ctx.saveGame(); r.tick(1000); r.ctx.rollTurnSave(); r.tick(1000); r.ctx.saveToSlot('m1', 'Keep me');
  r.store.set('bored.civlite.slot.m2', 'no newline at all');
  r.store.set('bored.civlite.slot.m4', '{"v":1,"at":1,"name":"x"}\n{broken');
  r.store.set('bored.civlite.slot.m5', '{"v":7,"at":1}\n{}');
  r.store.set('bored.civlite.slot.m6', JSON.stringify({ v: 1, at: 1, name: 'Bad game' }) + '\n' + JSON.stringify({ v: 4, tiles: [] }));
  const listed = r.ids();
  assert.ok(['m2', 'm5'].every(id => !listed.includes(id)), 'unreadable headers are not listed: ' + listed);
  for (const id of ['m4', 'm6']) assert.equal(r.ctx.loadSlot(id), false, id + ' has a header but no playable game');
  // Game over: the autosave goes (nothing to continue), the turn autosaves and named saves stay.
  r.ctx.G = r.game({ over: { winner: 0, turn: 9 } });
  assert.equal(r.ctx.saveGame(), false);
  assert.equal(r.head('auto'), null);
  assert.ok(r.head('t1') && r.head('m1'), 'a loss can still be undone from a turn autosave or a named save');
  assert.match(r.ctx.whyNotSave(), /over/);
  assert.equal(r.ctx.saveToSlot('m2', 'late').ok, false);
  // The tutorial and watch mode are never saved.
  for (const flag of [{ tut: {} }, { watch: true }]) {
    const t = slotRig(); t.ctx.G = t.game(flag);
    assert.equal(t.ctx.saveGame(), false); assert.equal(t.ctx.rollTurnSave(), false); assert.equal(t.ctx.saveToSlot('m1', 'x').ok, false);
    assert.equal(t.store.size, 0, 'nothing written for ' + Object.keys(flag));
  }
});

test('Ashcrown never touches its save slots during a Bored Together match', () => {
  // A match hands the whole board to the server, so it must not write, clear or load over
  // the campaign slots this device keeps for the single-player game.
  const r = slotRig();
  r.ctx.G = r.game({ turn: 12 });
  r.ctx.saveGame(); r.tick(1000); r.ctx.rollTurnSave(); r.tick(1000); r.ctx.saveToSlot('m1', 'Campaign');
  const before = new Map(r.store);
  r.log.length = 0;
  r.ctx.online = { submit() {}, finishTurn() {} };
  r.ctx.G = r.game({ turn: 3 });
  assert.equal(r.ctx.saveGame(), false, 'a match never saves');
  r.ctx.autosave();
  assert.equal(r.ctx.rollTurnSave(), false);
  assert.equal(r.ctx.saveToSlot('m2', 'Nope').ok, false);
  assert.equal(r.ctx.loadSlot('m1'), false, 'and never loads a campaign over the match');
  r.ctx.G.over = { winner: 0 };
  assert.equal(r.ctx.saveGame(), false, 'a finished match never clears the autosave either');
  // The primitives themselves refuse, so a path that forgets its own guard (a
  // header upgrade, a slot menu action) still cannot reach the store.
  assert.equal(r.ctx.slotWrite('m1', { v: 1, at: 1 }, r.ctx.G), false, 'a match cannot write a slot');
  r.ctx.slotRemove('auto');
  assert.deepEqual(r.ctx.upgradeHead('m1', { v: 1, at: 1 }), { v: 1, at: 1 }, 'a match does not upgrade a saved header');
  assert.deepEqual(r.log, [], 'the match touches storage not at all');
  assert.deepEqual([...r.store], [...before], 'the campaign survives the match');
});

test('Ashcrown routes slot clicks before the no-game guard, so Load works from the start screen', () => {
  const html = load('src/games/content/ashcrown.html');
  const body = extractFunction(html, 'onAction');
  const slots = body.indexOf("kind.startsWith('slot-')");
  const guard = body.indexOf('if (!G) {');
  assert.ok(slots > 0 && guard > 0 && slots < guard, 'slot actions come before "if (!G)"');
  assert.match(html, /id="btn-load"[^>]*data-act="slots:load"/, 'the start screen has a Load game button');
  assert.match(html, /addEventListener\('pagehide', saveGame\)/, 'leaving the page saves without marking the game changed');
});

test('Ashcrown shows how long ago a save was made', () => {
  const r = slotRig();
  const ago = (ms, now = 10 * 86400_000) => r.ctx.agoText(now - ms, now);
  assert.equal(ago(5_000), 'just now');
  assert.equal(ago(59_000), 'just now');
  assert.equal(ago(60_000), '1 minute ago');
  assert.equal(ago(5 * 60_000), '5 minutes ago');
  assert.equal(ago(60 * 60_000), '1 hour ago');
  assert.equal(ago(2 * 3600_000), '2 hours ago');
  assert.equal(ago(23 * 3600_000), '23 hours ago');
  assert.equal(ago(30 * 3600_000), 'yesterday');
  assert.equal(ago(3 * 86400_000), '3 days ago');
  assert.equal(ago(6 * 86400_000 + 23 * 3600_000), '6 days ago');
  // After a week it is a short date, with the year only when it is not this year.
  const now = Date.UTC(2026, 10, 6, 12);
  assert.equal(r.ctx.agoText(Date.UTC(2026, 9, 29, 12), now), 'Oct 29');
  assert.equal(r.ctx.agoText(Date.UTC(2026, 10, 2, 12) - 5 * 86400_000, now), 'Oct 28');
  assert.equal(r.ctx.agoText(Date.UTC(2025, 10, 2, 12), now), 'Nov 2, 2025');
  assert.equal(r.ctx.agoText(now + 5000, now), 'just now', 'a clock that ran backwards never shows a negative time');
});

// v4.4: a title screen, then game setup.
function frontRig() {
  const html = load('src/games/content/ashcrown.html');
  const log = [];
  const doc = { activeElement: null, els: {}, getElementById(id) { return this.els[id] || (this.els[id] = { id, value: '', dataset: {}, hidden: false, textContent: '' }); } };
  const ctx = vm.createContext({ Array, Number, String, Math, JSON, document: doc, G: null, online: null,
    closeModal: () => { ctx.UI.modalLayer.hidden = true; log.push('closeModal'); },
    showPane: name => log.push('pane:' + name), showOptions: () => log.push('options'), showMenu: () => log.push('menu'),
    refreshStart: () => log.push('refreshStart'), toast: message => log.push('toast:' + message),
    SEATS: Array.from({ length: 8 }, (x, i) => ({ name: 'Player ' + (i + 1) })), DEFAULT_BORDERS: 'tech' });
  vm.runInContext(['frontKeys', 'resetSetup', 'redoSwitches'].map(name => extractFunction(html, name)).join('\n'), ctx);
  return { html, ctx, doc, log };
}
const keyEvent = (key, extra = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, preventDefault() { this.prevented = true; }, ...extra });

test('Ashcrown opens on a title menu, and setup holds every game option', () => {
  const html = load('src/games/content/ashcrown.html');
  // Bored Together's browser test waits for #start to hide, so it stays the one overlay for both screens.
  const start = html.match(/<div id="start" class="screen">[\s\S]*?\n<script>/)[0];
  const title = start.slice(start.indexOf('id="pane-title"'), start.indexOf('id="pane-setup"'));
  const setup = start.slice(start.indexOf('id="pane-setup"'));
  const order = ['btn-continue', 'btn-new', 'btn-load', 'btn-tutorial', 'btn-civs', 'btn-help', 'btn-notes', 'btn-options'];
  const at = order.map(id => title.indexOf('id="' + id + '"'));
  assert.ok(at.every(n => n > 0) && at.every((n, i) => !i || n > at[i - 1]), 'title menu: Continue, New game, Load game, Tutorial, Civs, How to play, What’s new, Options');
  for (const [id, act] of [['btn-new', 'title-new'], ['btn-load', 'slots:load'], ['btn-tutorial', 'tut-start'], ['btn-civs', 'civs'], ['btn-help', 'help'], ['btn-notes', 'whats-new'], ['btn-options', 'options']]) {
    assert.match(title, new RegExp('id="' + id + '"[^>]*data-act="' + act + '"'), id + ' runs ' + act);
  }
  assert.match(title, /id="btn-continue"[^>]*hidden/, 'Continue is hidden until there is an autosave');
  for (const id of ['opt-humans', 'opt-cpus', 'opt-level', 'opt-close', 'opt-turns', 'opt-map', 'opt-size', 'opt-wrap', 'opt-conquest', 'opt-science', 'btn-begin', 'seats']) {
    assert.ok(setup.includes('id="' + id + '"'), 'setup has #' + id);
    assert.ok(!title.includes('id="' + id + '"'), '#' + id + ' is not on the title');
  }
  assert.match(setup, /id="btn-back"[^>]*data-act="title-back"/);
  assert.match(setup, /id="btn-reset"[^>]*data-act="setup-reset"/);
  assert.ok(!/opt-tutorial|opt-tips/.test(html), 'the Tutorial and Tips tick boxes moved out of setup (to the menu and Options)');
});

test('Ashcrown routes the title screen\'s actions before the no-game guard, and each exit goes where it says', () => {
  const html = load('src/games/content/ashcrown.html');
  const body = extractFunction(html, 'onAction');
  const guard = body.indexOf('if (!G) {');
  for (const kind of ['civs', 'help', 'whats-new', 'options', 'title-new', 'title-back', 'setup-reset', 'tut-start']) {
    const spot = body.indexOf("kind === '" + kind + "'");
    assert.ok(spot > 0 && spot < guard, kind + ' works with no game running');
  }
  assert.match(body, /case 'tut-quit': onAction\('new'\); break;/, 'quitting the tutorial returns to the title');
  assert.match(body, /case 'tut-new': onAction\('new-setup'\); break;/, '"Start a real game" opens setup');
  assert.match(body, /showPane\(kind === 'new-setup' \? 'setup' : 'title'\)/, 'quitting a game lands on the title');
  assert.match(html, /data-act="new-setup">New game<\/button>/, 'New game after a finished game opens setup');
  assert.match(html, /data-act="new-ask">Quit to the main menu</, 'the Menu says main menu');
});

test('Ashcrown\'s title screen keys: arrows walk the menu and wrap, Esc closes a window or steps back', () => {
  const r = frontRig();
  const mk = id => ({ id, focus() { r.doc.activeElement = this; } });
  const items = ['btn-new', 'btn-tutorial', 'btn-help'].map(mk);
  r.ctx.UI = { modalLayer: { hidden: true }, paneSetup: { hidden: true }, paneTitle: { hidden: false }, titleMenu: { querySelectorAll: () => items } };
  const press = (key, extra) => { const e = keyEvent(key, extra); r.ctx.frontKeys(e); return e; };
  const focused = () => (r.doc.activeElement ? r.doc.activeElement.id : null);
  assert.equal(press('ArrowDown').prevented, true);
  assert.equal(focused(), 'btn-new', 'nothing focused yet: Down starts at the top');
  press('ArrowDown'); press('ArrowDown');
  assert.equal(focused(), 'btn-help');
  press('ArrowDown');
  assert.equal(focused(), 'btn-new', 'Down wraps to the top');
  press('ArrowUp');
  assert.equal(focused(), 'btn-help', 'Up wraps to the bottom');
  press('ArrowDown', { ctrlKey: true });
  assert.equal(focused(), 'btn-help', 'Ctrl+arrow is left to the browser');
  // Esc: a window first, then step back from setup, and on the title itself nothing.
  r.ctx.UI.modalLayer.hidden = false;
  press('ArrowDown');
  assert.equal(focused(), 'btn-help', 'arrows do nothing while a window is open');
  press('Escape');
  assert.deepEqual(r.log, ['closeModal'], 'Esc closes the open window');
  r.log.length = 0;
  r.ctx.UI.paneTitle.hidden = true; r.ctx.UI.paneSetup.hidden = false;
  press('Escape');
  assert.deepEqual(r.log, ['pane:title'], 'Esc steps back from setup');
  r.log.length = 0;
  r.ctx.UI.paneTitle.hidden = false; r.ctx.UI.paneSetup.hidden = true;
  press('Escape');
  assert.deepEqual(r.log, [], 'Esc on the title does nothing');
});

test('Ashcrown\'s Reset to defaults puts every setup choice back, names and civs included', () => {
  const r = frontRig();
  r.ctx.UI = { optHumans: { value: '5' }, optCpus: { value: '3' }, optMap: { value: 'islands' }, optSize: { value: 'huge' },
    optLevel: { value: 'deity', selectedIndex: 1 }, optClose: { value: 'never' }, optTurns: { value: '7' },
    optConquest: { checked: false }, optScience: { checked: false }, optWrap: { checked: true } };
  for (let i = 0; i < 8; i++) {
    r.doc.getElementById('seat-civ-' + i).value = 'rome';
    Object.assign(r.doc.getElementById('seat-name-' + i), { value: 'Zed', dataset: { edited: '1' } });
  }
  r.ctx.resetSetup();
  const u = r.ctx.UI;
  assert.deepEqual([u.optHumans.value, u.optCpus.value, u.optMap.value, u.optSize.value, u.optLevel.selectedIndex, u.optClose.value, u.optTurns.value],
    ['2', '0', 'pangaea', 'auto', 0, 'tech', '100']);
  assert.deepEqual([u.optConquest.checked, u.optScience.checked, u.optWrap.checked], [true, true, false]);
  for (let i = 0; i < 8; i++) {
    const civ = r.doc.getElementById('seat-civ-' + i), name = r.doc.getElementById('seat-name-' + i);
    assert.equal(civ.value, 'random');
    assert.equal(name.value, 'Player ' + (i + 1));
    assert.equal(name.dataset.edited, undefined, 'a typed name no longer counts as typed');
  }
  assert.ok(r.log.includes('refreshStart') && r.log.some(l => l.startsWith('toast:')), 'the screen redraws and says so');
});

test('Ashcrown\'s Options window redraws itself, and the in-game Menu redraws itself', () => {
  const r = frontRig();
  r.ctx.UI = { modalKind: 'options' };
  r.ctx.redoSwitches();
  assert.deepEqual(r.log, ['options'], 'Options redraws with no game running');
  r.log.length = 0; r.ctx.UI.modalKind = null; r.ctx.G = {};
  r.ctx.redoSwitches();
  assert.deepEqual(r.log, ['menu'], 'the Menu redraws during a game');
  r.log.length = 0; r.ctx.G = null;
  r.ctx.redoSwitches();
  assert.deepEqual(r.log, [], 'neither open: nothing to redraw (and no crash)');
});

test('Ashcrown\'s title shows Continue and Load game from the saves, and never reads them during a Bored Together match', () => {
  const r = slotRig();
  const html = r.get('1') && load('src/games/content/ashcrown.html');
  const mk = (extra = {}) => ({ hidden: false, textContent: '', classList: { on: {}, toggle(name, on) { this.on[name] = !!on; } }, ...extra });
  const els = { 'continue-sub': mk(), 'continue-detail': mk(), 'continue-medal': mk({ innerHTML: '' }), 'load-sub': mk(), 'tut-tag': mk(), 'tut-sub': mk(), 'notes-tag': mk(), 'btn-leave': mk() };
  r.ctx.refreshNotesTag = () => {};   // the What’s new tag has its own test
  r.ctx.slotMedal = head => '<svg data-civ="' + head.civ + '"></svg>';
  r.ctx.document = { getElementById: id => els[id] };
  r.ctx.UI = { btnContinue: mk(), btnLoad: mk(), btnNew: mk() };
  r.ctx.tutorialDone = () => false;
  r.ctx.TUT_STEPS = new Array(7).fill(0);
  r.ctx.plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  vm.runInContext(extractFunction(html, 'refreshTitle'), r.ctx);
  vm.runInContext(extractFunction(html, 'embedded'), r.ctx);
  r.ctx.window = {};
  r.ctx.window.parent = r.ctx.window;   // the game opened on its own: no Back to Bored
  // Nothing saved: only New game.
  r.ctx.refreshTitle();
  assert.equal(els['btn-leave'].hidden, true, 'not on Bored: no Back to Bored');
  assert.equal(r.ctx.UI.btnContinue.hidden, true);
  assert.equal(r.ctx.UI.btnLoad.hidden, true);
  assert.equal(r.ctx.UI.btnNew.classList.on.primary, true, 'New game is the highlighted item');
  r.ctx.window.parent = {};   // inside Bored's frame
  r.ctx.refreshTitle();
  assert.equal(els['btn-leave'].hidden, false, 'on Bored the title ends with Back to Bored');
  assert.equal(els['tut-tag'].hidden, false, 'the Tutorial is flagged as the place to start');
  assert.equal(els['tut-sub'].textContent, '7 short steps on a small island, playing Rome');
  // An autosave: Continue names the game and when, and takes the highlight.
  r.ctx.G = r.game();
  assert.equal(r.ctx.saveGame(), true);
  r.tick(5 * 60_000);
  r.ctx.tutorialDone = () => true;
  r.ctx.refreshTitle();
  assert.equal(r.ctx.UI.btnContinue.hidden, false);
  assert.equal(els['continue-sub'].textContent, 'Autosave · Turn 4 · 5 minutes ago');
  assert.equal(els['continue-detail'].textContent, 'Rome + 1 CPU · Standard Pangaea · Normal · 1 city · Score 84');
  assert.equal(els['continue-medal'].innerHTML, '<svg data-civ="rome"></svg>', 'the medallion is the first human’s civ');
  assert.equal(r.ctx.UI.btnContinue.classList.on.primary, true);
  assert.equal(r.ctx.UI.btnNew.classList.on.primary, false);
  assert.equal(r.ctx.UI.btnLoad.hidden, false);
  assert.equal(els['load-sub'].textContent, 'Your autosaves');
  assert.equal(els['tut-tag'].hidden, true, 'the flag goes once the tutorial has been played');
  r.ctx.saveToSlot('m1', 'Before the war');
  r.ctx.refreshTitle();
  assert.equal(els['load-sub'].textContent, '1 named save and your autosaves');
  // A Bored Together match: the title never looks at the solo saves.
  r.ctx.online = {};
  r.ctx.slotList = () => { throw new Error('read the solo saves during a match'); };
  r.ctx.refreshTitle();
  assert.equal(r.ctx.UI.btnContinue.hidden, true);
  assert.equal(r.ctx.UI.btnLoad.hidden, true);
});

test('A Bored Together document gets an inert continue-where-you-left-off helper', async () => {
  // The match document is the same game, so its resume wiring still runs. A
  // together board belongs to the server: it must not be written to this
  // device's slot for the game, nor offered back as a solo run afterwards.
  const { resumeScript } = await import('../src/hub/resume.js');
  const code = tag => {
    assert.ok(tag.startsWith('<script>') && tag.endsWith('</script>'), 'a helper is one script tag');
    return tag.slice('<script>'.length, -'</script>'.length);
  };
  const soloSlot = 'bored.resume.8ball';
  const solo = JSON.stringify({ v: 1, at: 1, label: 'Rack 3 \u00b7 solo', state: { solo: true } });
  function run(tag) {
    const store = new Map([[soloSlot, solo]]);
    const touched = [], timers = [], listeners = [];
    const context = vm.createContext({
      localStorage: {
        getItem: key => { touched.push('get ' + key); return store.has(key) ? store.get(key) : null; },
        setItem: (key, value) => { touched.push('set ' + key); store.set(key, value); },
        removeItem: key => { touched.push('remove ' + key); store.delete(key); }
      },
      setInterval: fn => { timers.push(fn); return timers.length; },
      clearInterval: () => {},
      addEventListener: type => listeners.push(type),
      document: { visibilityState: 'visible', createElement: () => { throw new Error('the continue prompt was drawn'); } }
    });
    context.window = context;
    vm.runInContext(code(tag), context);
    return { helper: context.__boredResume, store, touched, timers, listeners };
  }

  const match = run(resumeScript('8ball', { online: true }));
  assert.equal(match.helper.read(), null, 'a match offers no saved run');
  assert.equal(match.helper.save({ match: true }, 'Match'), false, 'a match never saves');
  match.helper.arm(() => ({ label: 'Match', state: { match: true } }));
  assert.equal(match.helper.flush(), false, 'a match never flushes');
  match.helper.clear();
  match.helper.ask('Match', () => {}, () => {});
  assert.deepEqual(match.touched, [], 'the match never reads or writes the slot');
  assert.deepEqual(match.timers, [], 'the match arms no autosave');
  assert.deepEqual(match.listeners, [], 'the match adds no pagehide or visibility listeners');
  assert.equal(match.store.get(soloSlot), solo, 'the solo run survives the match');

  const single = run(resumeScript('8ball'));
  assert.equal(single.helper.read().label, 'Rack 3 \u00b7 solo', 'solo play still finds its own save');
  assert.equal(single.helper.save({ solo: 2 }, 'Rack 9'), true, 'solo play still saves');
  single.helper.arm(() => ({ label: 'Rack 12', state: { solo: 3 } }));
  assert.equal(single.timers.length, 1, 'solo play still arms its autosave');
  assert.equal(single.helper.flush(), true);
  assert.equal(JSON.parse(single.store.get(soloSlot)).label, 'Rack 12', 'solo autosave still writes');
});

test('Ashcrown\'s tech tree can be hovered anywhere, hidden era 4 cards included', () => {
  // A hidden era 4 card is a plain <div> with no data-act, and the tree reads the
  // hovered card on every mouseover. Slicing that missing attribute threw on each
  // mouse move across a "?" card, and the hub counts every such throw as a
  // runtime error.
  const html = load('src/games/content/ashcrown.html');
  const hiddenCard = html.match(/'<div class="tcard hidden"[^']*'/);
  assert.ok(hiddenCard, 'the tree still draws hidden cards');
  assert.ok(!hiddenCard[0].includes('data-act'), 'a hidden card has no data-act to read');
  const ctx = vm.createContext({});
  vm.runInContext(extractFunction(html, 'techCardId'), ctx);
  const card = act => ({ getAttribute: name => (name === 'data-act' ? act : null) });
  assert.equal(ctx.techCardId(card('research:masonry')), 'masonry', 'a tech card names its tech');
  assert.equal(ctx.techCardId(card(null)), null, 'a hidden card names nothing');
  assert.equal(ctx.techCardId(card('close')), null, 'a card that does something else names no tech');
  assert.equal(ctx.techCardId(null), null, 'the pointer is not over a card');
  const tech = extractFunction(html, 'showTech');
  assert.ok(tech.includes('techCardId(card)'), 'hover and focus go through the guarded reader');
  assert.ok(!/getAttribute\('data-act'\)\.slice/.test(tech), 'the tree never slices an attribute that can be missing');
});

test('Ashcrown\'s coach mark can never take the board\'s render down', () => {
  // A tip or tutorial step that cannot find its hex used to throw out of
  // renderBoard on every render (a rival's voyage whose home port was burned).
  const html = load('src/games/content/ashcrown.html');
  const boom = () => { throw new TypeError('Cannot read properties of null (reading \'x\')'); };
  const ctx = vm.createContext({
    G: { tut: null }, TUT_STEPS: [{ at: boom }],
    currentTip: () => ({ tip: { at: boom }, hit: {} })
  });
  vm.runInContext(extractFunction(html, 'coachAt'), ctx);
  assert.equal(ctx.coachAt(), null, 'a tip that throws points at nothing');
  ctx.G.tut = { closed: false, step: 0 };
  assert.equal(ctx.coachAt(), null, 'a tutorial step that throws points at nothing');
  ctx.G = null;
  assert.equal(ctx.coachAt(), null, 'no game, no coach mark');
  const tip = html.match(/\{ id: 'rival-trip', test:[^\n]*/);
  assert.ok(tip, 'the rival voyage tip exists');
  assert.ok(/cityById\(o\.voyage\.city\)/.test(tip[0]), 'it only fires while the voyage\'s home city still stands');
});

test('Ashcrown ships can batter a city but never take it, except Norway\'s', () => {
  // Like Civ 6, only a melee land unit walks into a broken city. A galley used to
  // finish off and take a coastal city (the tutorial even taught it).
  const html = load('src/games/content/ashcrown.html');
  const ctx = vm.createContext({
    UNITS: {
      warrior: { kind: 'melee' }, archer: { kind: 'ranged', rs: 20 }, scout: { kind: 'recon', noCapture: true },
      galley: { kind: 'melee', naval: true }, warship: { kind: 'ranged', naval: true, rs: 25 }
    },
    civIs: (owner, id) => owner === 'norse' && id === 'norway'
  });
  vm.runInContext([html.match(/const isNaval = [^\n]+/)[0], html.match(/const shoots = [^\n]+/)[0],
    extractFunction(html, 'canTakeCity')].join('\n'), ctx);
  const can = (type, owner = 'rome') => ctx.canTakeCity({ type, owner });
  assert.equal(can('warrior'), true, 'melee land units take cities');
  assert.equal(can('archer'), false, 'ranged land units do not');
  assert.equal(can('scout'), false, 'scouts do not');
  assert.equal(can('galley'), false, 'a galley cannot walk into a port');
  assert.equal(can('warship'), false, 'nor can a warship');
  assert.equal(can('galley', 'norse'), true, 'Norway\'s ships keep their boarding perk');
  assert.equal(can('warship', 'norse'), true);
  assert.ok(extractFunction(html, 'strikeInfo').includes('canTakeCity(u)'), 'a broken port is taken through canTakeCity');
  assert.ok(extractFunction(html, 'attack').includes('canTakeCity(u)'), 'so is the hit that breaks it');
  assert.ok(!/can take (a )?coastal cit/.test(html), 'no card says a galley can take a coastal city');
  assert.ok(!/melee unit or galley/.test(html), 'the city panel does not send a galley in');
});

test('Ashcrown launches new ships onto the water beside their city', () => {
  // Civ 6: a built ship appears on a water hex next to the city, not inside it. It
  // only docks when every water hex there is taken. Land units are unchanged.
  const html = load('src/games/content/ashcrown.html');
  const open = { ship: new Set(), land: new Set() };
  const ctx = vm.createContext({
    UNITS: { galley: { naval: true }, warrior: {} },
    neighbourList: () => [[5, 4], [6, 4], [4, 5]],
    tileAt: () => ({ owner: 0 }),
    slotFree: (x, y, owner, type) => (ctx.UNITS[type].naval ? open.ship : open.land).has(x + ',' + y)
  });
  vm.runInContext(html.match(/const isNaval = [^\n]+/)[0] + '\n' + extractFunction(html, 'spawnSpot'), ctx);
  const city = { x: 5, y: 5, owner: 0 };
  const spot = type => ctx.spawnSpot(city, type);
  open.ship = new Set(['5,5', '5,4', '6,4']);
  assert.ok(['5,4', '6,4'].includes(String(spot('galley'))), 'a galley takes a water hex, not the city');
  open.ship = new Set(['5,5']);
  assert.equal(String(spot('galley')), '5,5', 'with the water full it docks in the city');
  open.ship = new Set();
  assert.equal(spot('galley'), null, 'no water and no berth: production waits');
  open.land = new Set(['5,5', '4,5']);
  assert.equal(String(spot('warrior')), '5,5', 'a land unit still appears in the city');
  open.land = new Set(['4,5']);
  assert.equal(String(spot('warrior')), '4,5', 'or beside it when the city is occupied');
});

/* ── Ashcrown 4.5: first contact ─────────────────────────────────────────────
   These run the whole game script in a bare VM (no page). The script only boots when a
   document exists, so it just defines its functions; the tests drive them directly. */

function civRig(seats, { seed = 12345, map = 'pangaea', flat = true, borders = 'tech', level = 'normal' } = {}) {
  const html = load('src/games/content/ashcrown.html');
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const store = new Map();
  const ctx = vm.createContext({
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
  });
  vm.runInContext(script, ctx);
  const run = code => vm.runInContext(code, ctx);
  const modals = [], toasts = [];
  ctx.openModal = html => { modals.push(html); };
  ctx.closeModal = ctx.render = () => {};
  ctx.toast = text => { toasts.push(text); };
  run('UI = { modalKind: null }');
  ctx.seats = seats;
  run('startGame({ seats, seed: ' + seed + ', map: "' + map + '", level: "' + level + '", borders: "' + borders + '" })');
  const r = {
    ctx, run, modals, toasts, store,
    get G() { return run('G'); },
    // A level sandbox: all land, nobody on it, nobody met, every moment unspent.
    sandbox() {
      run(`for (const t of G.tiles) { t.t = 'flat'; t.f = null; t.imp = null; t.owner = null; t.city = null; t.k = 0; t.road = false; }
        G.units.length = 0; G.cities.length = 0; G.log.length = 0; G.news.length = 0; G.offers.length = 0; G.deals.length = 0; G.open.length = 0; G.embassies.length = 0; G.firsts = {};
        for (const f of G.players) { f.capital = null; f.capHome = -1; f.met = false; f.moments = []; f.eraPts = 0; f.notes = []; f.asked = []; }
        for (const a of G.players) for (const b of G.players) { G.met[a.i][b.i] = a.i === b.i; G.dip[a.i][b.i] = 'peace'; }
        G.turn = 5; G.cur = 0; G.viewer = 0; G.handoff = false; G.seen = G.players.map(() => new Array(G.cols * G.rows).fill(0));`);
    },
    unit(owner, type, x, y) { ctx.args = [owner, type, x, y]; return run('addUnit(pl(args[0]), unitFor(args[0], args[1]), args[2], args[3], null)'); },
    own(owner, x, y) { run('tileAt(' + x + ', ' + y + ').owner = ' + owner); },
    met: (a, b) => run('G.met[' + a + '][' + b + ']'),
    news: (i, kind) => run('G.news.filter(n => n.i === ' + i + (kind ? ' && n.kind === "' + kind + '"' : '') + ')'),
    say: (i, kind) => run('G.news.filter(n => n.i === ' + i + ' && n.kind === "' + kind + '").length')
  };
  run('G.handoff = false');   // the screen that passes the device is not under test
  if (flat) r.sandbox();
  return r;
}
const FOUR = [{ name: 'Ann', human: true }, { name: 'Ben', human: true }, { name: '', human: false }, { name: '', human: false }];

test('Ashcrown 4.5: a new four-player game starts with nobody met, and the Council lists only who you have met', () => {
  const r = civRig(FOUR, { flat: false });
  const n = r.run('G.players.length');
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) assert.equal(r.met(a, b), a === b, 'met[' + a + '][' + b + ']');
  assert.equal(r.run('G.players.every(f => f.met === false)'), true);
  assert.equal(r.run('hasMet(0, 2)'), false);
  assert.equal(r.run('metSomeone(pl(0))'), false);
  r.run('showCouncil()');
  const html = r.modals.at(-1);
  assert.ok(html.includes('You haven’t met anyone yet. Explore to find other civs.'), 'the empty Council says so');
  assert.ok(!html.includes('data-act="war-ask:'), 'no war button for a stranger');
  for (const i of [1, 2, 3]) {
    assert.ok(!html.includes(r.run('CIVS[pl(' + i + ').civ].land')), 'the Council hides civ ' + i);
    assert.ok(!html.includes(r.run('CIVS[pl(' + i + ').civ].leader')), 'and its leader');
  }
  // Meeting one civ puts exactly that civ in the Council.
  r.run('meet(0, 2)');
  r.run('showCouncil()');
  const after = r.modals.at(-1);
  assert.ok(after.includes(r.run('CIVS[pl(2).civ].land')) && !after.includes('You haven’t met anyone'));
  assert.ok(!after.includes(r.run('CIVS[pl(3).civ].land')), 'still hides the one not met');
  assert.ok(after.includes('data-act="war-ask:2"') && !after.includes('data-act="war-ask:3"'));
});

test('Ashcrown 4.5: coming into sight of a unit, a city or land sets met both ways, queues one card per human, and pays contact once', () => {
  // Unit sees unit: Ann's warrior walks to two hexes from Ben's.
  let r = civRig(FOUR);
  const ben = r.unit(1, 'warrior', 10, 5), ann = r.unit(0, 'warrior', 6, 5);
  r.run('G.units.forEach(u => { u.mp = 2; })');
  r.run('checkContacts(0); checkContacts(1)');
  assert.equal(r.met(0, 1), false, 'four hexes apart is out of sight');
  assert.equal(r.run('moveUnit(units.ann, 7, 5)'.replace('units.ann', 'G.units.find(u => u.id === "' + ann.id + '")')), true);
  assert.equal(r.met(0, 1), false, 'three hexes is still out of sight');
  r.run('G.units.find(u => u.id === "' + ann.id + '").mp = 2');
  assert.equal(r.run('moveUnit(G.units.find(u => u.id === "' + ann.id + '"), 8, 5)'), true);
  assert.equal(r.met(0, 1), true);
  assert.equal(r.met(1, 0), true, 'meeting is mutual');
  assert.equal(r.say(0, 'meet'), 1, 'Ann gets one card');
  assert.equal(r.say(1, 'meet'), 1, 'Ben gets one card, though it was Ann who moved');
  assert.equal(r.news(0, 'meet')[0].other, 1);
  assert.equal(r.news(1, 'meet')[0].other, 0);
  assert.equal(r.say(0, 'moment') + r.say(1, 'moment'), 0, 'the contact moment is folded into the card, not a second card');
  assert.ok(r.news(0, 'meet')[0].pts > 0 && r.news(1, 'meet')[0].pts > 0, 'the card carries the era points');
  assert.equal(r.run('G.players.filter(f => f.met).length'), 2, 'the old flag follows');
  assert.equal(r.run('metSomeone(pl(0)) && metSomeone(pl(1)) && !metSomeone(pl(2))'), true);
  // Paid once: more sight, more checks and a second meet() change nothing.
  const eras = r.run('[pl(0).eraPts, pl(1).eraPts]');
  r.run('checkContacts(0); checkContacts(1); meet(0, 1); meet(1, 0); checkMoments(0); checkMoments(1)');
  assert.deepEqual(r.run('[pl(0).eraPts, pl(1).eraPts]'), eras);
  assert.equal(r.say(0, 'meet') + r.say(1, 'meet'), 2, 'no second card');
  assert.equal(r.run('pl(0).moments.filter(m => m === "contact").length'), 1);
  assert.equal(r.run('G.log.filter(e => /You meet/.test(e.text)).length'), 2, 'one history line for each human');
  // Their card is shown on their own turn, in their colors, and names the civ.
  r.run('G.news.length = 0; G.news.push({ i: 0, kind: "meet", other: 1, pts: 2, first: true }); showNews()');
  const card = r.modals.at(-1);
  assert.ok(card.includes('First contact') && card.includes(r.run('CIVS[pl(1).civ].land')) && card.includes(r.run('fullName(pl(1))')));
  assert.ok(card.includes('data-act="council"') && card.includes('Open Council') && card.includes('Got it'));
  assert.ok(card.includes(r.run('CIVS[pl(1).civ].hello')), 'their greeting');
  assert.ok(card.includes('You’re at peace.') && card.includes('Their borders are open.'), 'before Early Empire their borders are open');
  r.run('pl(1).techs.push("earlyempire"); G.news.length = 0; G.news.push({ i: 0, kind: "meet", other: 1, pts: 2, first: true }); showNews()');
  assert.ok(r.modals.at(-1).includes('Their borders are closed.'), 'after it they are closed');
  assert.ok(!card.includes('Their capital is'), 'no capital line when none is in sight');

  // Unit sees a city: Ann's scout-less warrior comes within three hexes of Ben's city.
  r = civRig(FOUR);
  r.unit(1, 'settler', 12, 5); r.run('foundCity(G.units[0])');
  assert.equal(r.run('G.cities.length'), 1);
  const w = r.unit(0, 'warrior', 7, 5);
  r.run('checkContacts(0)');
  assert.equal(r.met(0, 1), false, 'five hexes from the city is out of sight');
  r.run('G.units.find(u => u.id === "' + w.id + '").x = 9; checkContacts(0)');
  assert.equal(r.met(0, 1), true, 'three hexes from the city, two from its border: met');

  // A city sees a unit, from the other side: Ben founds a city beside Ann's lone warrior.
  r = civRig(FOUR);
  r.unit(0, 'warrior', 5, 5);
  r.unit(1, 'settler', 8, 5);
  r.run('foundCity(G.units.find(u => u.owner === 1))');
  assert.equal(r.met(0, 1), true, 'the new city sees Ann\'s warrior, and the founding checks for it');
  assert.equal(r.say(0, 'meet') + r.say(1, 'meet'), 2);

  // Land alone counts: nothing of Ben's stands there, only a hex he owns.
  r = civRig(FOUR);
  r.own(1, 12, 5);
  r.unit(0, 'warrior', 10, 5);
  r.run('checkContacts(0)');
  assert.equal(r.met(0, 1), true, 'an owned hex within two hexes');
  assert.equal(r.met(0, 2), false, 'nobody else is met');
  assert.equal(r.met(2, 1), false);

  // Meeting is mutual even when only one side can see: Ann's scout sees three hexes, Ben's warrior two.
  r = civRig(FOUR);
  r.unit(0, 'scout', 7, 5); r.unit(1, 'warrior', 10, 5);
  r.run('checkContacts(1)');
  assert.equal(r.met(1, 0) && r.met(0, 1), true, 'Ben cannot see the scout, but the scout sees him, and he is introduced when he checks');
  assert.equal(r.say(0, 'meet') + r.say(1, 'meet'), 2);

  // CPUs meet each other too, and the card goes to humans only.
  r = civRig(FOUR);
  r.unit(2, 'warrior', 5, 5); r.unit(3, 'warrior', 7, 5);
  r.run('checkContacts(2)');
  assert.equal(r.met(2, 3) && r.met(3, 2), true);
  assert.equal(r.run('G.news.length'), 0, 'no card for a CPU');
  assert.equal(r.run('G.log.filter(e => (e.to === 2 || e.to === 3) && /You meet/.test(e.text)).length'), 0, 'and no "You meet" line written to a CPU');
  assert.equal(r.run('pl(2).moments.includes("contact") && pl(3).moments.includes("contact")'), true, 'but they earn the moment');

  // With event cards off, there is no card, and the history line stays.
  r = civRig(FOUR);
  r.run('popupsSwitch = false');
  r.unit(0, 'warrior', 5, 5); r.unit(1, 'warrior', 7, 5);
  r.run('checkContacts(0)');
  assert.equal(r.met(0, 1), true);
  assert.equal(r.run('G.news.length'), 0);
  assert.equal(r.run('G.log.filter(e => e.to === 0 && /You meet/.test(e.text)).length'), 1);
});

test('Ashcrown 4.5: war, peace, trade and borders are refused toward a civ you have not met, for humans and CPUs', () => {
  const r = civRig(FOUR);
  // A human toward a CPU, and toward another human.
  for (const other of [2, 1]) {
    assert.equal(r.run('declareWar(0, ' + other + ')'), false, 'no war on a stranger');
    assert.equal(r.run('atWar(0, ' + other + ')'), false);
    r.run('G.dip[0][' + other + '] = G.dip[' + other + '][0] = "war"');   // even if the books somehow say war
    assert.equal(r.run('offerPeace(0, ' + other + ')'), '', 'no peace offer to a stranger');
    assert.equal(r.run('G.offers.length'), 0);
    r.run('G.dip[0][' + other + '] = G.dip[' + other + '][0] = "peace"');
    assert.equal(r.run('proposeOpen(0, ' + other + ')'), '', 'no open-borders request to a stranger');
    r.run('openBorders(0, ' + other + ')');
    assert.equal(r.run('G.open.length'), 0);
    const deal = '{ seller: ' + other + ', buyer: 0, res: "horses", qty: 10, total: 5, turns: 1 }';
    r.run('pl(' + other + ').horses = 40');
    assert.equal(r.run('tradeProblem(' + deal + ')'), 'You haven’t met');
    assert.equal(r.run('proposeTrade(Object.assign(' + deal + ', { proposer: 0 })).result'), 'error');
    assert.equal(r.run('G.deals.length + G.offers.length'), 0);
  }
  assert.equal(r.run('G.log.length + G.news.length'), 0, 'refusals leave no trace');
  // Once they meet, the same calls work.
  r.run('meet(0, 2)');
  assert.notEqual(r.run('tradeProblem({ seller: 2, buyer: 0, res: "horses", qty: 10, total: 5, turns: 1 })'), 'You haven’t met', 'a deal gets past the met test');
  assert.equal(r.run('proposeOpen(0, 2)'), 'accepted');
  assert.equal(r.run('declareWar(0, 2)'), true);
  assert.equal(r.run('declareWar(0, 2)'), false, 'a second declaration is not a war');
  assert.ok(['accepted', 'refused'].includes(r.run('offerPeace(0, 2)')), 'the CPU answers a peace offer from a civ it has met (a fresh war is usually refused)');
  assert.equal(r.run('declareWar(0, 0)'), false);

  // A CPU toward a CPU it has not met: none of its diplomacy reaches them.
  const cpu = civRig(FOUR);
  cpu.ctx.roll = () => 0;                               // every chance comes up
  cpu.run('G.turn = 40; G.cur = 2');
  cpu.unit(2, 'settler', 3, 5); cpu.run('foundCity(G.units[0])');
  cpu.unit(3, 'settler', 9, 5); cpu.run('foundCity(G.units.find(u => u.owner === 3))');
  assert.equal(cpu.met(2, 3), false, 'six hexes apart: close enough to rival each other, too far to see');
  for (let k = 0; k < 4; k++) cpu.unit(2, 'warrior', 3, 5);   // an army its neighbour has no match for
  const wars = () => cpu.run('G.players.map(f => G.players.map(o => atWar(f.i, o.i) ? 1 : 0).join("")).join("")');
  cpu.run('aiDiplomacy(pl(2)); aiDiplomacy(pl(3))');
  assert.equal(cpu.run('atWar(2, 3)'), false, 'it will not attack a stranger');
  cpu.run('pl(3).voyage = { kind: "expedition" }');
  cpu.run('aiDiplomacy(pl(2))');
  assert.equal(cpu.run('atWar(2, 3)'), false, 'not even a stranger sailing for the win');
  assert.equal(cpu.run('G.attitude[2][3]'), 0, 'and it has no mood toward them');
  cpu.run('G.dip[2][3] = G.dip[3][2] = "war"');           // forced, to prove it cannot ask them for peace either
  assert.equal(cpu.run('offerPeace(2, 3)'), '');
  cpu.run('G.dip[2][3] = G.dip[3][2] = "peace"; pl(3).voyage = null');
  assert.equal(cpu.run('proposeOpen(2, 3)'), '');
  // The positive control: the same board, once they have met, starts the war it was waiting to start.
  cpu.run('meet(2, 3)');
  cpu.run('aiDiplomacy(pl(2))');
  assert.equal(cpu.run('atWar(2, 3)'), true, 'met: the CPU is free to attack');
  assert.ok(wars().includes('1'));

  // CPU borders request: a mood above 2 and closed borders send it to ask a neighbour it knows, never a stranger.
  const open = civRig(FOUR);
  open.ctx.roll = () => 0;
  open.run('G.turn = 40; G.cur = 2; pl(3).techs.push("earlyempire")');
  open.unit(2, 'settler', 3, 5); open.run('foundCity(G.units[0])');
  open.unit(3, 'settler', 13, 5); open.run('foundCity(G.units.find(u => u.owner === 3))');
  open.run('G.attitude[2][3] = 10');
  open.run('aiDiplomacy(pl(2))');
  assert.equal(open.run('G.open.length'), 0, 'no borders request to a stranger');
  open.run('meet(2, 3); G.attitude[2][3] = 10');
  open.run('aiDiplomacy(pl(2))');
  assert.equal(open.run('G.open.length'), 1, 'a civ it has met gets one');

  // CPU trade: a CPU short of horses buys from a CPU that has them, but only one it has met.
  const trade = civRig(FOUR);
  trade.ctx.roll = () => 0;
  trade.ctx.maxPay = () => 100;
  trade.run('G.turn = 40; G.cur = 2; var dealt = 0; var was = makeDeal; makeDeal = d => { dealt++; return was(d); };');
  trade.unit(2, 'settler', 3, 5); trade.run('foundCity(G.units[0])');
  trade.unit(3, 'settler', 9, 5); trade.run('foundCity(G.units.find(u => u.owner === 3))');
  trade.run('pl(2).techs.push("riding"); pl(3).horses = 40');
  trade.run('aiTrade(pl(2))');
  assert.equal(trade.run('dealt'), 0, 'no deal with a stranger');
  trade.run('meet(2, 3)');
  trade.run('aiTrade(pl(2))');
  assert.equal(trade.run('dealt'), 1, 'the same shop, once they have met');
});

test('Ashcrown 4.5: a queued march toward an unmet civ\'s closed land stops on the hex before it, and no war starts', () => {
  const r = civRig(FOUR);
  r.run('pl(1).techs.push("earlyempire")');    // Ben's borders are closed
  assert.equal(r.run('landClosed(1)'), true);
  // Ben owns a wall of land, columns 9 to 11, the whole height of the map: there is no way around it.
  for (let y = 0; y < r.run('G.rows'); y++) for (let x = 9; x <= 11; x++) r.own(1, x, y);
  const u = r.unit(0, 'warrior', 2, 5);
  r.run('var W = G.units.find(u => u.id === "' + u.id + '"); W.mp = 40');
  r.run('W.path = { to: [14, 5], steps: [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5]], seen: [] }; runPath(W)');
  assert.equal(r.run('W.x'), 8, 'it stopped on the last hex before the border');
  assert.equal(r.run('W.path'), null, 'the march is called off');
  assert.equal(r.run('atWar(0, 1)'), false, 'and nobody declared war');
  assert.equal(r.run('G.dip[0][1] + G.dip[1][0]'), 'peacepeace');
  assert.equal(r.met(0, 1), true, 'seeing their land is what introduces you');
  assert.equal(r.say(0, 'meet'), 1, 'the card comes up');
  assert.equal(r.run('G.news.filter(n => n.kind === "alert").length'), 0, 'no war card');
  assert.ok(r.run('G.log.some(e => /stopped its march/.test(e.text))'));
  // The stranger rule itself: standing at the border without having met, a step in is refused outright.
  const r2 = civRig(FOUR);
  r2.run('pl(1).techs.push("earlyempire")');
  r2.own(1, 6, 5);
  const v = r2.unit(0, 'warrior', 5, 5);
  r2.run('var V = G.units.find(u => u.id === "' + v.id + '"); V.mp = 2');
  assert.equal(r2.met(0, 1), false, 'sight has not been checked: this is the guard on its own');
  assert.equal(r2.run('moveUnit(V, 6, 5)'), false, 'a step onto an unmet civ\'s land is refused');
  assert.equal(r2.run('computeReachable(V).has("6,5")'), false, 'it is not even offered as a green hex');
  assert.equal(r2.run('atWar(0, 1) || V.x !== 5'), false);
  assert.equal(r2.run('moveUnit(V, 6, 5, new Map([["6,5", 1]]))'), false, 'and a reach map that wrongly offers it does not open the door');
  // Met, the usual closed-border step is offered again, and it is the one that declares the war.
  r2.run('meet(0, 1)');
  assert.equal(r2.run('moveUnit(V, 6, 5)'), true);
  assert.equal(r2.run('atWar(0, 1)'), true);
  // A CPU's units honour it too.
  const r3 = civRig(FOUR);
  r3.run('pl(3).techs.push("earlyempire")');
  r3.own(3, 6, 5);
  const c = r3.unit(2, 'warrior', 5, 5);
  r3.run('var C = G.units.find(u => u.id === "' + c.id + '"); C.mp = 2');
  assert.equal(r3.run('computeReachable(C).has("6,5")'), false);
  assert.equal(r3.run('moveUnit(C, 6, 5)'), false);
  assert.equal(r3.run('atWar(2, 3)'), false);
});

test('Ashcrown 4.5: in pass-and-play each player sees "Unmet player" for civs they have not met, in the Council, the log and the score list', () => {
  const r = civRig(FOUR, { flat: false });
  // Ann (0) has met the civ at seat 2; Ben (1) has met nobody. Two CPUs fight, in view of Ann only.
  r.run('meet(0, 2); meet(2, 3); declareWar(2, 3)');
  r.run('G.news.length = 0; UI.log = { innerHTML: "" }');
  const name = (i, what) => r.run(what === 'land' ? 'CIVS[pl(' + i + ').civ].land' : what === 'leader' ? 'CIVS[pl(' + i + ').civ].leader' : 'pl(' + i + ').name');
  const seesOf = viewer => {
    r.run('G.viewer = ' + viewer + '; G.cur = ' + viewer + '; G.handoff = false; renderLog()');
    const council = (r.run('showCouncil()'), r.modals.at(-1));
    return { log: r.run('UI.log.innerHTML'), council, realm: r.run('realmPanel()') };
  };
  // Ben has met nobody.
  const ben = seesOf(1);
  assert.ok(ben.council.includes('You haven’t met anyone yet. Explore to find other civs.'));
  for (const i of [0, 2, 3]) {
    for (const what of ['land', 'leader', 'name']) {
      const n = name(i, what);
      assert.ok(!ben.council.includes(n), 'Ben\'s Council hides ' + what + ' of ' + i + ': ' + n);
      assert.ok(!ben.log.includes(n), 'Ben\'s log hides ' + what + ' of ' + i + ': ' + n);
      assert.ok(!ben.realm.includes(n), 'Ben\'s score list hides ' + what + ' of ' + i + ': ' + n);
    }
  }
  assert.ok(ben.log.includes('Unmet player'), 'the shared lines read "Unmet player" for him');
  assert.equal((ben.realm.match(/Unmet player/g) || []).length, 3, 'one row for each of the three rivals');
  assert.equal((ben.realm.match(/class="tag">unmet</g) || []).length, 3);
  assert.ok(ben.realm.includes('#cfc8bb'), 'with a grey dot');
  // Ann has met seat 2 (who has also met seat 3), not Ben.
  const ann = seesOf(0);
  assert.ok(ann.council.includes(name(2, 'land')), 'Ann\'s Council lists the civ she has met');
  assert.ok(!ann.council.includes(name(3, 'land')) && !ann.council.includes(name(1, 'land')), 'and only that civ');
  assert.ok(ann.log.includes(r.run('fullName(pl(2))')), 'her log names the civ she knows');
  assert.ok(ann.log.includes('Unmet player'), 'and still hides the one she does not: the war was declared on seat 3');
  assert.ok(!ann.log.includes(r.run('fullName(pl(3))')) && !ann.log.includes(name(3, 'land')));
  assert.ok(ann.realm.includes(r.run('fullName(pl(2))')) && !ann.realm.includes(r.run('fullName(pl(3))')));
  assert.equal((ann.realm.match(/Unmet player/g) || []).length, 2);
  // The helper, directly.
  assert.equal(r.run('knownName(1, 2)'), 'Unmet player');
  assert.equal(r.run('knownName(0, 2)'), r.run('fullName(pl(2))'));
  assert.equal(r.run('knownName(0, 2, true)'), r.run('pl(2).name'));
  assert.equal(r.run('knownName(1, 1)'), r.run('fullName(pl(1))'), 'you always know yourself');
  assert.equal(r.run('knownName(null, 3)'), r.run('fullName(pl(3))'), 'no viewer, no hiding');
  // When the game ends, everyone is named.
  r.run('G.over = { winner: 0, why: "test", turn: 9 }');
  assert.equal(r.run('knownName(1, 3)'), r.run('fullName(pl(3))'));
  assert.ok(!r.run('logText(G.log[0].text, 1)').includes('Unmet player'), 'the old lines read in full');
  // The war card to a human names the aggressor only if met.
  r.run('G.over = null; G.news.length = 0; G.viewer = 1; G.cur = 1');
  r.run('G.news.push({ i: 1, kind: "alert", type: "war", by: 3 }); showNews()');
  assert.ok(r.modals.at(-1).includes('Unmet player declares war') && !r.modals.at(-1).includes(name(3, 'land')));
});

test('Ashcrown 4.5: a game saved before first contact loads with everyone met, no cards, and plays on', () => {
  const r = civRig(FOUR, { flat: false });
  // Play a few turns as 4.4 would have, then store the game without a met matrix, as 4.4 saved it.
  for (let k = 0; k < 6; k++) { r.run('G.handoff = false; endCurrentTurn(); G.handoff = false; endCurrentTurn()'); }
  const turn = r.run('G.turn');
  const eras = r.run('G.players.map(f => f.eraPts || 0)');
  const old = JSON.parse(r.run('JSON.stringify(G)'));
  delete old.met;
  for (const f of old.players) f.met = false;
  old.news = [];
  r.ctx.save44 = JSON.stringify(old);
  r.run('G = prepareState(JSON.parse(save44)); G.handoff = false');
  const n = r.run('G.players.length');
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) assert.equal(r.met(a, b), true, 'met[' + a + '][' + b + ']');
  assert.equal(r.run('G.news.length'), 0, 'no card');
  assert.deepEqual(r.run('G.players.map(f => f.eraPts || 0)'), eras, 'no era points');
  assert.equal(r.run('G.players.every(f => f.moments.includes("contact"))'), true, 'the contact moment counts as already earned');
  r.run('showCouncil()');
  assert.ok(r.modals.at(-1).includes(r.run('CIVS[pl(2).civ].land')) && !r.modals.at(-1).includes('haven’t met'), 'the Council lists everyone');
  assert.equal(r.run('knownName(0, 3)'), r.run('fullName(pl(3))'));
  // It plays on: more rounds, no throw, no first-contact cards, nobody un-met.
  for (let k = 0; k < 10; k++) r.run('G.handoff = false; endCurrentTurn(); G.handoff = false; endCurrentTurn()');
  assert.ok(r.run('G.turn') > turn, 'the turns went on');
  assert.equal(r.run('G.news.filter(n => n.kind === "meet").length'), 0);
  assert.equal(r.run('G.met.every(row => row.every(Boolean))'), true);
  // A save that already has a met matrix keeps it.
  const mixed = JSON.parse(r.run('JSON.stringify(G)'));
  mixed.met = mixed.players.map((f, a) => mixed.players.map((g, b) => a === b));
  r.ctx.mixed = JSON.stringify(mixed);
  r.run('G = prepareState(JSON.parse(mixed))');
  assert.equal(r.met(0, 2), false, 'a 4.5 save is not overwritten');
});

test('Ashcrown 4.5: the tutorial starts with everyone met and runs start to finish', () => {
  const r = civRig(FOUR, { flat: false });
  r.run('buildTutorialIsland()');
  assert.equal(r.run('JSON.stringify(G.met)'), '[[true,true],[true,true]]');
  assert.equal(r.run('hasMet(0, 1) && hasMet(1, 0)'), true);
  assert.equal(r.run('knownName(0, 1)'), r.run('fullName(pl(1))'), 'the Cinder Clan is named in the tutorial');
  const steps = r.run('TUT_STEPS.length');
  let council = false;
  for (let k = 0; k < steps + 5 && r.run('G.tut.step < TUT_STEPS.length'); k++) {
    if (/offer the Cinder Clan peace/.test(r.run('TUT_STEPS[G.tut.step].say').replace(/<[^>]+>/g, ''))) {
      // The step that sends you to the Council: the Cinder Clan is listed, at war, with its peace button.
      r.run('showCouncil()');
      const html = r.modals.at(-1);
      assert.ok(html.includes('Cinder') && html.includes('data-act="peace:1"'), 'the Council offers the Cinder Clan peace');
      assert.ok(!html.includes('haven’t met'));
      council = true;
    }
    r.run('tutorialNext()');
    assert.equal(r.run('G.met.every(row => row.every(Boolean))'), true, 'step ' + k + ' keeps everyone met');
    assert.equal(r.run('G.news.filter(n => n.kind === "meet").length'), 0, 'no first-contact card in the tutorial');
  }
  assert.equal(r.run('G.tut.step'), steps, 'every step ran');
  assert.ok(council, 'the Council step was reached');
  assert.equal(r.run('atWar(0, 1)'), false, 'the Cinder Clan made peace');
});

test('Ashcrown 4.5: save names use the human leaders and era, the detail line counts the realm, and no CPU civ is ever named', () => {
  const seats = [{ name: 'Ann', human: true, civ: 'qin' }, { name: '', human: false }, { name: '', human: false }, { name: '', human: false }];
  const r = civRig(seats, { level: 'deity' });
  // Six cities for the human, spread along one row of the level map.
  for (const x of [2, 6, 10, 14, 18, 22]) { r.unit(0, 'settler', x, 5); r.run('foundCity(G.units.find(u => u.owner === 0 && UNITS[u.type].founds))'); }
  assert.equal(r.run('ownCities(0).length'), 6);
  r.run('G.turn = 42; pl(0).techs.push("ironworking")');
  assert.equal(r.run('defaultSaveName(G)'), 'Qin Shi Huang · Medieval · Turn 42');
  const total = r.run('scoreParts(0).total');
  assert.equal(r.run('describeSave(G)'), 'China + 3 CPUs · Standard Pangaea · Deity · 6 cities · Score ' + total);
  assert.equal(r.run('autoSaveName(G)'), 'Autosave · Turn 42');
  // Written for real: the autosave, a turn autosave and a manual save with no typed name.
  r.run('saveGame(); rollTurnSave(); saveToSlot("m1", "")');
  const head = id => JSON.parse(r.store.get('bored.civlite.slot.' + id).split('\n')[0]);
  assert.equal(head('auto').name, 'Autosave · Turn 42');
  assert.equal(head('t1').name, 'Autosave · Turn 42');
  assert.equal(head('m1').name, 'Qin Shi Huang · Medieval · Turn 42');
  assert.equal(head('m1').meta, 'China + 3 CPUs · Standard Pangaea · Deity · 6 cities · Score ' + total);
  assert.deepEqual({ mv: head('m1').mv, civ: head('m1').civ, color: head('m1').color, ink: head('m1').ink, era: head('m1').era },
    { mv: 2, civ: 'qin', color: r.run('pl(0).light'), ink: r.run('pl(0).ink'), era: 'Medieval' });
  const cpuNames = [];
  for (const i of [1, 2, 3]) cpuNames.push(r.run('CIVS[pl(' + i + ').civ].land'), r.run('CIVS[pl(' + i + ').civ].leader'), r.run('fullName(pl(' + i + '))'), r.run('pl(' + i + ').name'));
  for (const id of ['auto', 't1', 'm1']) {
    const text = r.store.get('bored.civlite.slot.' + id).split('\n')[0];
    for (const n of cpuNames) assert.ok(!text.includes(n), 'the ' + id + ' header never names ' + n);
  }
  // One human against one CPU, and two humans with none.
  const duel = civRig([{ name: 'Ann', human: true, civ: 'qin' }, { name: '', human: false }]);
  assert.equal(duel.run('describeSave(G)'), 'China + 1 CPU · Small Pangaea · Normal · 0 cities · Score ' + duel.run('scoreParts(0).total'));
  const pair = civRig([{ name: 'Ann', human: true, civ: 'qin' }, { name: 'Ben', human: true, civ: 'japan' }]);
  pair.run('G.turn = 42; pl(0).techs.push("ironworking"); pl(1).techs.push("writing")');
  assert.equal(pair.run('defaultSaveName(G)'), 'Qin Shi Huang & Oda Nobunaga · Medieval · Turn 42');
  assert.equal(pair.run('describeSave(G)'), 'China, Japan · Small Pangaea · Normal', 'two humans: no cities, no score, and no CPUs to count');
  pair.run('pl(1).techs.push("firearms")');
  assert.equal(pair.run('defaultSaveName(G)'), 'Qin Shi Huang & Oda Nobunaga · Renaissance · Turn 42', 'the furthest era any human has reached');
  const mixed = civRig([{ name: 'Ann', human: true, civ: 'qin' }, { name: 'Ben', human: true, civ: 'japan' }, { name: '', human: false }, { name: '', human: false }]);
  assert.equal(mixed.run('describeSave(G)'), 'China, Japan + 2 CPUs · Standard Pangaea · Normal');
  // A header from before 4.5 is rebuilt once, and a name the player typed stays.
  const state = r.run('JSON.stringify(G)');
  const old = (name, extra = {}) => JSON.stringify(Object.assign({ v: 1, at: 1700000000000, kind: 'manual', name, meta: 'Rome · Standard · Normal', turn: 42, seed: 7 }, extra)) + '\n' + state;
  const key = id => 'bored.civlite.slot.' + id;
  r.store.clear();
  r.store.set(key('m1'), old('My epic war'));
  r.store.set(key('m2'), old('China, turn 42'));
  r.store.set(key('m3'), old(''));
  r.store.set(key('auto'), old('Autosave', { kind: 'auto' }));
  const set = r.ctx.localStorage.setItem; let writes = 0;
  r.ctx.localStorage.setItem = (k, v) => { writes++; return set(k, v); };
  const rows = Object.fromEntries(Array.from(r.run('slotList()'), s => [s.id, s.head]));
  assert.equal(rows.m1.name, 'My epic war', 'a typed name survives');
  assert.equal(rows.m2.name, 'Qin Shi Huang · Medieval · Turn 42', 'the old default, "<land>, turn <n>", counts as untyped');
  assert.equal(rows.m3.name, 'Qin Shi Huang · Medieval · Turn 42');
  assert.equal(rows.auto.name, 'Autosave · Turn 42');
  for (const id of ['m1', 'm2', 'm3', 'auto']) {
    assert.equal(rows[id].mv, 2, id + ' is marked rebuilt');
    assert.equal(rows[id].civ, 'qin');
    assert.equal(rows[id].era, 'Medieval');
    assert.equal(rows[id].meta, 'China + 3 CPUs · Standard Pangaea · Deity · 6 cities · Score ' + total);
    assert.equal(head(id).mv, 2, id + ' was written back');
  }
  assert.equal(head('m1').name, 'My epic war');
  assert.equal(r.store.get(key('m1')).split('\n')[1], state, 'the game itself is untouched');
  assert.equal(writes, 4, 'one write for each old header');
  r.run('slotList()');
  assert.equal(writes, 4, 'rebuilt once, not every time the screen opens');
  // A full or blocked browser still lists the row, rebuilt.
  r.store.set(key('m4'), old('Old and unlucky'));
  r.ctx.localStorage.setItem = () => { throw new Error('full'); };
  const m4 = Array.from(r.run('slotList()')).find(s => s.id === 'm4');
  assert.equal(m4.head.mv, 2);
  assert.equal(m4.head.name, 'Old and unlucky');
});

test('Ashcrown 4.5: every civ has a short greeting for its first-contact card', () => {
  const r = civRig(FOUR, { flat: false });
  const hellos = r.run('Object.keys(CIVS).map(id => [id, CIVS[id].hello])');
  assert.equal(hellos.length, 16);
  for (const [id, hello] of hellos) {
    assert.equal(typeof hello, 'string', id + ' has a hello');
    assert.ok(hello.trim().split(/\s+/).length < 15, id + ' greets in under 15 words: ' + hello);
    assert.ok(/[.!]$/.test(hello) && !/[“”"]/.test(hello), id + ' is a plain sentence without quote marks (the card adds them)');
  }
  assert.equal(new Set(hellos.map(h => h[1])).size, 16, 'no two civs greet alike');
});

/* ── Ashcrown orders: auto unit cycling, the declare-war prompt and captures ──
   Same bare-VM rig as above. Real right-clicks are in tests/ashcrown-browser.test.cjs. */

function ordersRig(opts) {
  const r = civRig(FOUR, opts);
  const camera = [];
  r.ctx.centreOn = (x, y) => { camera.push([x, y]); };   // there is no stage to measure
  r.ctx.checkElimination = () => {};                     // the sandbox has no cities, which would knock everyone out
  r.ctx.checkWin = () => {};
  r.camera = camera;
  r.run('G.seen.forEach(s => s.fill(1))');
  r.run("pl(0).civ = 'rome'; pl(1).civ = 'celts'; pl(2).civ = 'qin'; pl(3).civ = 'japan'");
  r.ready = () => r.run('G.units.forEach(u => { u.mp = unitMove(u); u.acted = false; u.moved = false; u.pinned = false; })');
  r.pick = u => r.run('selection = { kind: "unit", id: "' + u.id + '" }; reachable = computeReachable(unitById("' + u.id + '"))');
  r.sel = () => r.run('selection && selection.kind === "unit" ? selection.id : null');
  r.order = (u, x, y) => r.run('orderUnit(unitById("' + u.id + '"), ' + x + ', ' + y + ')');
  r.get = (u, expr) => r.run('(u => ' + expr + ')(unitById("' + u.id + '"))');
  r.meetOnly = (a, b) => r.run('G.met[' + a + '][' + b + '] = G.met[' + b + '][' + a + '] = true');
  r.war = (a, b) => { r.meetOnly(a, b); r.run('G.dip[' + a + '][' + b + '] = G.dip[' + b + '][' + a + '] = "war"'); };
  r.at = (a, b) => r.run('atWar(' + a + ', ' + b + ')');
  r.act = code => r.run('onAction("' + code + '")');
  r.city = (owner, x, y) => {
    const s = r.unit(owner, 'settler', x, y);
    r.run('foundCity(unitById("' + s.id + '"))');
    return r.run('cityAt(' + x + ', ' + y + ')');
  };
  r.seat = i => r.run('G.viewer = G.cur = ' + i);
  r.logs = (to = 0) => Array.from(r.run('G.log'), e => r.run('logText(' + JSON.stringify(e.text) + ', ' + to + ')'));
  r.ctx.roll = () => 0.5;
  return r;
}

test('Ashcrown orders: a right-click order that uses up a unit\'s turn moves the selection on, or clears it', () => {
  let r = ordersRig();
  const a = r.unit(0, 'warrior', 4, 5), b = r.unit(0, 'archer', 4, 8);
  r.ready(); r.pick(a);
  assert.equal(r.run('jumpOn()'), true, 'on by default');
  assert.equal(r.order(a, 10, 5), true, 'a hex three turns away is an order');
  assert.equal(r.run('marching(unitById("' + a.id + '"))'), true, 'it queued a march');
  assert.ok(r.get(a, 'u.x') > 4, 'and walked the first leg');
  assert.equal(r.sel(), b.id, 'the next idle unit is selected');
  assert.equal(JSON.stringify(r.camera.at(-1)), '[4,8]', 'and the camera goes to it');
  assert.equal(r.run('idleUnits(0).some(u => u.id === "' + a.id + '")'), false, 'a marching unit is not idle');
  // Nobody else needs orders: the selection clears, and nothing else opens.
  r = ordersRig();
  const solo = r.unit(0, 'warrior', 4, 5);
  r.ready(); r.pick(solo);
  const opened = r.modals.length;
  assert.equal(r.order(solo, 10, 5), true);
  assert.equal(r.sel(), null, 'no other unit to go to');
  assert.equal(r.modals.length, opened, 'no city, tech tree or end-turn box opens by itself');
  // A move that spends every move also hands on, with no march.
  r = ordersRig();
  const c = r.unit(0, 'warrior', 4, 5), d = r.unit(0, 'warrior', 4, 9);
  r.ready(); r.pick(c);
  assert.equal(r.order(c, 6, 5), true);
  assert.equal(r.get(c, 'u.mp'), 0);
  assert.equal(r.get(c, 'marching(u)'), false);
  assert.equal(r.sel(), d.id);
});

test('Ashcrown orders: a unit with moves left and no march stays selected', () => {
  const r = ordersRig();
  const a = r.unit(0, 'warrior', 4, 5), b = r.unit(0, 'archer', 4, 8);
  r.ready(); r.pick(a);
  assert.equal(r.order(a, 5, 5), true, 'one step');
  assert.equal(r.get(a, 'u.mp'), 1, 'one move left');
  assert.equal(r.sel(), a.id, 'still the selected unit, like Civ 6');
  assert.equal(r.camera.length, 0, 'the camera stays put');
  assert.equal(r.order(a, 6, 5), true, 'it can go on');
  assert.equal(r.sel(), b.id, 'out of moves now: on to the next');
  void b;
});

test('Ashcrown orders: a melee attack that ends at 0 moves moves on, and so does a unit that dies', () => {
  let r = ordersRig();
  r.war(0, 2);
  let a = r.unit(0, 'warrior', 4, 5);
  r.unit(2, 'warrior', 5, 5);
  let b = r.unit(0, 'archer', 4, 8);
  r.ready(); r.pick(a);
  assert.equal(r.order(a, 5, 5), true, 'the attack is an order');
  assert.equal(r.get(a, 'u.mp'), 0, 'it used up its moves');
  assert.equal(r.sel(), b.id, 'on to the next unit');
  // It dies in the attack: still on to the next, and the dead unit is not selected.
  r = ordersRig();
  r.war(0, 2);
  a = r.unit(0, 'warrior', 4, 5);
  r.unit(2, 'heavy', 5, 5);
  b = r.unit(0, 'archer', 4, 8);
  r.ready(); r.pick(a);
  r.run('unitById("' + a.id + '").hp = 1');
  assert.equal(r.order(a, 5, 5), true);
  assert.equal(r.run('unitById("' + a.id + '")'), null, 'the warrior died');
  assert.equal(r.sel(), b.id, 'the selection moves on from a dead unit');
  // A ranged strike too.
  r = ordersRig();
  r.war(0, 2);
  a = r.unit(0, 'archer', 4, 5);
  r.unit(2, 'warrior', 6, 5);
  b = r.unit(0, 'warrior', 4, 8);
  r.ready(); r.pick(a);
  assert.equal(r.order(a, 6, 5), true);
  assert.equal(r.sel(), b.id);
  // The panel's Attack button goes through the same hand-on.
  r = ordersRig();
  r.war(0, 2);
  a = r.unit(0, 'warrior', 4, 5);
  r.unit(2, 'warrior', 5, 5);
  b = r.unit(0, 'archer', 4, 8);
  r.ready(); r.pick(a);
  r.act('strike:5:5');
  assert.equal(r.sel(), b.id);
});

test('Ashcrown orders: with the jump switched off a done unit is deselected, and the switch lives in Options and the Menu', () => {
  const r = ordersRig();
  const a = r.unit(0, 'warrior', 4, 5), b = r.unit(0, 'archer', 4, 8);
  r.ready();
  assert.equal(r.run('readPrefs().jump'), undefined, 'nothing stored until it is changed');
  r.act('jump-toggle');
  assert.equal(r.run('jumpOn()'), false);
  assert.equal(JSON.parse(r.store.get('bored.civlite.prefs.v1')).jump, false, 'kept with the other switches, under the same key');
  assert.match(r.toasts.at(-1), /nothing is selected/);
  r.pick(a);
  assert.equal(r.order(a, 10, 5), true);
  assert.equal(r.sel(), null, 'deselected, not moved on');
  assert.equal(r.run('reachable'), null, 'no green hexes left for a stray right-click to use');
  assert.equal(r.camera.length, 0);
  // A unit with moves left still stays selected when the switch is off.
  r.ready(); r.pick(b);
  assert.equal(r.order(b, 4, 9), true);
  assert.equal(r.sel(), b.id);
  // The same switch, next to the event popups, in Options and in the Menu.
  for (const show of ['showOptions()', 'showMenu()']) {
    r.run(show);
    const html = r.modals.at(-1);
    const [p, j, an] = ['popups-toggle', 'jump-toggle', 'anim-next'].map(k => html.indexOf('data-act="' + k + '"'));
    assert.ok(p >= 0 && p < j && j < an, show + ': the jump switch follows the event popups');
    assert.ok(html.includes('Jump to the next unit after orders<b>off</b>'), show + ' shows its state');
  }
  r.act('jump-toggle');
  assert.equal(r.run('jumpOn()'), true);
  assert.ok(r.modals.at(-1).includes('Jump to the next unit after orders<b>on</b>'), 'and redraws itself');
  // It works from the title screen, with no game running.
  r.run('G = null');
  r.act('jump-toggle');
  assert.equal(r.run('jumpOn()'), false);
});

test('Ashcrown orders: right-clicking a march\'s destination still cancels it, and idleUnits skips what is done', () => {
  const r = ordersRig();
  const a = r.unit(0, 'warrior', 4, 5), b = r.unit(0, 'archer', 4, 8);
  r.ready(); r.pick(a);
  r.order(a, 10, 5);
  assert.equal(r.get(a, 'marching(u)'), true);
  r.pick(a);   // click the marching unit to select it again
  const sel = r.sel();
  assert.equal(r.order(a, 10, 5), true, 'right-clicking the destination');
  assert.equal(r.get(a, 'u.path'), null, 'takes the orders back off');
  assert.equal(r.toasts.at(-1), 'Orders canceled.');
  assert.equal(r.sel(), sel, 'and leaves it selected, so it can be sent somewhere else');
  void b;
  // idleUnits: moves left, and not marching, fortified or asleep.
  const q = ordersRig();
  const idle = q.unit(0, 'warrior', 3, 3), march = q.unit(0, 'warrior', 3, 5), spent = q.unit(0, 'warrior', 3, 7),
    fort = q.unit(0, 'warrior', 3, 9), sleep = q.unit(0, 'warrior', 3, 11), emptyPath = q.unit(0, 'warrior', 3, 13);
  q.ready();
  q.run('unitById("' + march.id + '").path = { to: [9, 5], steps: [[4, 5], [5, 5]], seen: [] }');
  q.run('unitById("' + spent.id + '").mp = 0');
  q.run('unitById("' + fort.id + '").fort = true');
  q.run('unitById("' + sleep.id + '").sleep = true');
  q.run('unitById("' + emptyPath.id + '").path = { to: [3, 13], steps: [], seen: [] }');
  assert.equal(JSON.stringify(q.run('idleUnits(0).map(u => u.id)')), JSON.stringify([idle.id, emptyPath.id]),
    'only the unit that needs orders (a march with no steps left is no march)');
  assert.equal(q.run('nextIdle(0, unitById("' + idle.id + '")).id'), emptyPath.id, 'next unit goes round the idle ones');
  assert.equal(q.run('nextIdle(0, unitById("' + emptyPath.id + '")).id'), idle.id, 'and wraps');
  assert.equal(q.run('nextIdle(0, unitById("' + spent.id + '")).id'), idle.id, 'from a unit that is done, to the first idle one');
});

// The prompt, for a unit, a city and a lone civilian, from either seat of a pass-and-play game.
for (const seat of [0, 1]) {
  const me = seat, them = 1 - seat;
  test('Ashcrown orders: at peace, ordering a soldier onto their unit asks first and changes nothing until you confirm (seat ' + me + ')', () => {
    const r = ordersRig();
    r.seat(me); r.meetOnly(0, 1);
    const a = r.unit(me, 'warrior', 4, 5), foe = r.unit(them, 'warrior', 5, 5), spare = r.unit(me, 'archer', 4, 8);
    r.ready(); r.pick(a);
    const state = () => r.run('JSON.stringify([G.log.length, G.dip, G.attitude, G.news.length, G.units.map(u => [u.id, u.x, u.y, u.hp, u.mp, u.owner])])');
    const before = state();
    assert.equal(r.order(a, 5, 5), true);
    const html = r.modals.at(-1);
    const land = r.run('CIVS[pl(' + them + ').civ].land'), the = r.run('THE_LANDS.includes(pl(' + them + ').civ)') ? 'the ' : '';
    assert.ok(html.includes('Declare war on ' + the + land + '?'), 'the title names their civ');
    assert.ok(html.includes('Attacking their Warrior means <b>war with ' + r.run('fullName(pl(' + them + '))') + ', starting now</b>.'), 'the body says what you do and with whom');
    r.run('askWar(' + them + ')');
    const council = r.modals.at(-1);
    assert.ok(council.includes(r.run('WAR_NOTE')) && html.includes(r.run('WAR_NOTE')), 'the same consequences the Council gives');
    assert.ok(html.includes('Stay at peace') && html.includes('Declare war and attack'));
    assert.ok(html.includes('data-act="order-war:' + a.id + ':5:5"'));
    assert.equal(state(), before, 'nothing happened yet: no war, no log line, no damage, nobody moved');
    // Stay at peace: the box closes and that is all.
    r.act('close');
    assert.equal(r.at(0, 1), false);
    assert.equal(state(), before);
    // Confirm: war as the Council declares it, then the attack, then on to the next unit.
    const att = r.run('G.attitude[' + them + '][' + me + ']');
    r.act('order-war:' + a.id + ':5:5');
    assert.equal(r.at(0, 1), true, 'war');
    assert.equal(r.run('G.attitude[' + them + '][' + me + ']'), Math.max(-100, att - 30), 'their attitude drops as it does from the Council');
    assert.equal(r.logs(me).filter(t => / declares war on /.test(t)).length, 1, 'one declaration in the history');
    const card = r.news(them, 'alert').filter(n => n.type === 'war');
    assert.equal(card.length, 1, 'and one war card for the player it was declared on');
    assert.equal(card[0].by, me);
    assert.ok(r.get(foe, 'u.hp') < 100, 'the attack happened');
    assert.equal(r.get(a, 'u.mp'), 0);
    assert.equal(r.sel(), spare.id, 'and the selection moved on');
  });
}

test('Ashcrown orders: the same prompt for a city and for a lone civilian, which is captured on confirm', () => {
  let r = ordersRig();
  r.meetOnly(0, 1);
  const city = r.city(1, 5, 5), name = city.name, a = r.unit(0, 'warrior', 4, 5);
  r.ready(); r.pick(a);
  assert.equal(r.order(a, 5, 5), true);
  assert.ok(r.modals.at(-1).includes('Attacking ' + name + ' means <b>war with '), 'a city is named, not "their"');
  assert.equal(r.at(0, 1), false);
  assert.equal(r.run('cityAt(5, 5).hp'), 100, 'untouched until you confirm');
  r.act('order-war:' + a.id + ':5:5');
  assert.equal(r.at(0, 1), true);
  assert.ok(r.run('cityAt(5, 5).hp') < 100, 'the city was hit');

  // A lone settler two hexes away: a walk this turn, so the prompt says capture.
  r = ordersRig();
  r.meetOnly(0, 1);
  const prey = r.unit(1, 'settler', 6, 5), b = r.unit(0, 'warrior', 4, 5), spare = r.unit(0, 'archer', 4, 8);
  r.ready(); r.pick(b);
  assert.equal(r.order(b, 6, 5), true);
  const html = r.modals.at(-1);
  assert.ok(html.includes('Capturing their Settler means <b>war with '), html);
  assert.ok(html.includes('Declare war and capture'));
  assert.equal(r.get(prey, 'u.owner'), 1, 'still theirs');
  assert.equal(r.at(0, 1), false);
  assert.equal(r.get(b, 'u.x'), 4, 'nobody moved');
  r.act('close');
  assert.equal(r.get(prey, 'u.owner'), 1, 'Stay at peace leaves it alone');
  r.act('order-war:' + b.id + ':6:5');
  assert.equal(r.at(0, 1), true, 'war');
  assert.equal(r.get(prey, 'u.owner'), 0, 'captured');
  assert.equal(r.get(prey, 'u.type'), r.run('unitFor(0, "settler")'), 'still a settler');
  assert.equal(r.get(b, 'u.x') + ',' + r.get(b, 'u.y'), '6,5', 'the soldier stands where it stood');
  assert.equal(r.get(b, 'u.mp'), 0, 'and used up its moves');
  assert.equal(r.sel(), spare.id, 'on to the next unit');
  assert.equal(r.news(1, 'captured').length, 1, 'one capture card for the player who lost it');
  assert.equal(r.news(1, 'alert').filter(n => n.type === 'war').length, 1, 'beside the war card');
});

test('Ashcrown orders: an order that would not be legal at war never asks and never declares it', () => {
  const r = ordersRig();
  r.meetOnly(0, 1);
  const a = r.unit(0, 'warrior', 4, 5), archer = r.unit(0, 'archer', 7, 5);
  r.unit(1, 'warrior', 12, 5);                // far off
  r.unit(1, 'settler', 12, 8);                // a civilian far off
  r.unit(1, 'warrior', 10, 5);                // three hexes from the archer: out of its range of 2
  r.ready();
  const quiet = (u, x, y, why) => {
    r.pick(u);
    const modals = r.modals.length;
    assert.equal(r.order(u, x, y), false, why + ': not an order, so a click only inspects it');
    assert.equal(r.modals.length, modals, why + ': no prompt');
    assert.equal(r.at(0, 1), false, why + ': no war');
  };
  quiet(a, 12, 5, 'a unit far away');
  quiet(a, 12, 8, 'a civilian too far to walk onto this turn');
  quiet(archer, 10, 5, 'out of an archer\'s range');
  // The same civilian, one hex inside what a walk can reach, does ask.
  r.run('unitById("' + a.id + '").x = 10; unitById("' + a.id + '").y = 8');
  r.ready(); r.pick(a);
  assert.equal(r.order(a, 12, 8), true, 'two hexes: a capture this turn');
  assert.ok(r.modals.at(-1).includes('Capturing their Settler'));
  r.act('close');
  assert.equal(r.at(0, 1), false);
  // No moves left, or a civ you have not met: no prompt either, and the toast no longer sends you to the Council.
  const b = r.unit(0, 'warrior', 4, 9), foe = r.unit(1, 'warrior', 5, 9);
  r.ready(); r.pick(b);
  r.run('unitById("' + b.id + '").mp = 0');
  const modals = r.modals.length;
  assert.equal(r.order(b, 5, 9), true, 'adjacent, but it has no moves: the toast says why');
  assert.match(r.toasts.at(-1), /^You are at peace with .+\.$/);
  assert.ok(!/Council/.test(r.toasts.at(-1)));
  r.ready();
  r.run('G.met[0][1] = G.met[1][0] = false');
  assert.equal(r.order(b, 5, 9), true);
  assert.equal(r.toasts.at(-1), 'You are at peace with Unmet player.', 'an unmet civ is left as it was');
  assert.equal(r.modals.length, modals, 'no prompt for a stranger');
  assert.equal(r.run('declareWar(0, 1)'), false);
  void foe;
  // A far-off hex that is just ground still plans a march, as before.
  r.meetOnly(0, 1); r.ready(); r.pick(a);
  assert.equal(r.order(a, 10, 14), true);
  assert.equal(r.get(a, 'marching(u)'), true);
  assert.equal(r.at(0, 1), false);
  // The old toast is gone from the file.
  assert.ok(!/Declare war in the Council first/.test(load('src/games/content/ashcrown.html')));
});

test('Ashcrown orders: ranged units, ships and siege use the same prompt', () => {
  const r = ordersRig();
  r.meetOnly(0, 1);
  // Archer, two hexes from a warrior.
  let archer = r.unit(0, 'archer', 4, 5);
  const target = r.unit(1, 'warrior', 6, 5);
  r.ready(); r.pick(archer);
  assert.equal(r.order(archer, 6, 5), true);
  assert.ok(r.modals.at(-1).includes('Attacking their Warrior') && r.modals.at(-1).includes('Declare war and attack'));
  assert.equal(r.at(0, 1), false);
  r.act('order-war:' + archer.id + ':6:5');
  assert.equal(r.at(0, 1), true);
  assert.ok(r.get(target, 'u.hp') < 100, 'the archer shot');
  assert.equal(r.get(archer, 'u.hp'), 100, 'and took nothing back');
  // A galley beside a warrior wading in the shallows.
  const q = ordersRig();
  q.meetOnly(0, 1);
  q.run(`for (const [x, y] of [[5, 5], [6, 5]]) tileAt(x, y).t = 'shallow'`);
  const galley = q.unit(0, 'galley', 5, 5), wader = q.unit(1, 'warrior', 6, 5);
  q.ready(); q.pick(galley);
  assert.equal(q.order(galley, 6, 5), true);
  assert.ok(q.modals.at(-1).includes('Attacking their Warrior'));
  q.act('order-war:' + galley.id + ':6:5');
  assert.equal(q.at(0, 1), true);
  assert.ok(q.get(wader, 'u.hp') < 100, 'the ship hit it');
  // A catapult, two hexes from a city.
  const s = ordersRig();
  s.meetOnly(0, 1);
  const city = s.city(1, 6, 5), cat = s.unit(0, 'catapult', 4, 5);
  s.ready(); s.pick(cat);
  assert.equal(s.order(cat, 6, 5), true);
  assert.ok(s.modals.at(-1).includes('Attacking ' + city.name));
  s.act('order-war:' + cat.id + ':6:5');
  assert.ok(s.run('cityAt(6, 5).hp') < 100, 'the siege engine hit the city');
  void archer;
});

test('Ashcrown orders: an enemy zone of control blocks a capture the prompt would have promised', () => {
  // The way to the settler runs through a hex beside their soldier, which ends the move there.
  // The question is asked as if at war, so it must not offer a war that cannot finish the job.
  const r = ordersRig();
  r.meetOnly(0, 1);
  const a = r.unit(0, 'warrior', 4, 5), prey = r.unit(1, 'settler', 6, 5);
  const guard = r.run('neighbourList(5, 5).find(([x, y]) => (x !== 4 || y !== 5) && (x !== 6 || y !== 5) && hexDistance(x, y, 6, 5) > 1)');
  r.unit(1, 'warrior', guard[0], guard[1]);
  r.ready();
  const A = 'unitById("' + a.id + '")';
  assert.equal(r.run('captureAt(' + A + ', 6, 5)'), null, 'not reachable once the war is on');
  assert.equal(r.run('computeReachable(' + A + ', 1).has("6,5")'), false);
  r.pick(a);
  assert.equal(r.order(a, 6, 5), false, 'so no prompt');
  assert.equal(r.at(0, 1), false);
  // And without the soldier it is a capture.
  r.run('G.units = G.units.filter(u => u.owner !== 1 || u.type === "settler")');
  assert.equal(r.run('captureAt(' + A + ', 6, 5)').id, prey.id);
});

test('Ashcrown orders: targetAt, strikeInfo, canStop and computeReachable can treat one player as an enemy', () => {
  const r = ordersRig();
  r.meetOnly(0, 1); r.meetOnly(0, 2);
  const a = r.unit(0, 'warrior', 4, 5);
  r.unit(1, 'warrior', 5, 5);
  r.city(2, 4, 8);
  r.unit(1, 'settler', 3, 5);
  r.ready();
  const A = 'unitById("' + a.id + '")';
  assert.equal(JSON.stringify(r.run('targetAt(' + A + ', 5, 5)')), '{"peace":1}', 'at peace: a peace target');
  assert.equal(r.run('targetAt(' + A + ', 5, 5, 1).unit.owner'), 1, 'asked as an enemy: a unit to fight');
  assert.equal(JSON.stringify(r.run('targetAt(' + A + ', 5, 5, 2)')), '{"peace":1}', 'someone else\'s enmity changes nothing');
  assert.equal(r.run('strikeInfo(' + A + ', 5, 5)'), null);
  assert.ok(r.run('strikeInfo(' + A + ', 5, 5, 1)').dmg > 0);
  assert.equal(r.run('canStop(' + A + ', 3, 5)'), false, 'a civilian of someone at peace blocks the hex');
  assert.equal(r.run('canStop(' + A + ', 3, 5, 1)'), true, 'but would be captured at war');
  assert.equal(r.run('canStop(' + A + ', 3, 5, 2)'), false);
  assert.equal(r.run('computeReachable(' + A + ').has("3,5")'), false);
  assert.equal(r.run('computeReachable(' + A + ', 1).has("3,5")'), true);
  // The question changes nothing: still at peace, nothing moved.
  assert.equal(r.at(0, 1), false);
  assert.equal(r.get(a, 'u.mp'), 2);
});

test('Ashcrown orders: ships can\'t capture, and soldiers of every kind that walk can', () => {
  const r = ordersRig();
  r.war(0, 1);
  r.run(`for (const [x, y] of [[5, 5], [6, 5]]) tileAt(x, y).t = 'shallow'`);
  const galley = r.unit(0, 'galley', 5, 5), prey = r.unit(1, 'settler', 6, 5);
  r.ready();
  const G1 = 'unitById("' + galley.id + '")';
  assert.equal(r.run('canStop(' + G1 + ', 6, 5)'), false, 'a ship can\'t end on a civilian');
  assert.equal(r.run('computeReachable(' + G1 + ').has("6,5")'), false);
  assert.equal(r.run('moveUnit(' + G1 + ', 6, 5)'), false);
  assert.equal(r.run('captureAt(' + G1 + ', 6, 5)'), null);
  assert.equal(r.run('warOrder(' + G1 + ', 6, 5)'), null);
  assert.equal(r.get(prey, 'u.owner'), 1, 'still theirs');
  // Positive control: a warrior on the shore takes it.
  for (const type of ['warrior', 'archer', 'scout', 'catapult']) {
    const q = ordersRig();
    q.war(0, 1);
    q.run(`for (const [x, y] of [[5, 5], [6, 5]]) tileAt(x, y).t = 'shallow'`);
    const s = q.unit(0, type, 4, 5), p = q.unit(1, 'settler', 6, 5);
    q.ready();
    assert.equal(q.run('moveUnit(unitById("' + s.id + '"), 6, 5)'), true, type + ' walks onto it');
    assert.equal(q.get(p, 'u.owner'), 0, type + ' captured it');
  }
});

test('Ashcrown orders: a captured settler stays a settler and a captured builder stays a builder, as the captor\'s own kind, keeping its charges up to that kind\'s maximum', () => {
  // [captor civ, victim civ, victim unit, charges before, type after, charges after]
  const cases = [
    ['celts', 'rome', 'settler', null, 'settler', null],
    ['usa', 'rome', 'settler', null, 'pioneer', null],   // the USA's own settler
    ['rome', 'rome', 'settler', null, 'settler', null],
    ['celts', 'usa', 'settler', null, 'settler', null],  // a Pioneer comes over as a plain settler
    ['usa', 'rome', 'builder', 1, 'builder', 1],
    ['rome', 'rome', 'builder', 2, 'builder', 2],
    ['celts', 'usa', 'builder', 4, 'woodsman', 3],       // a 4-charge American builder, capped at the Woodsman's 3
    ['usa', 'celts', 'builder', 2, 'builder', 2],        // a Woodsman with 2 left
    ['usa', 'celts', 'builder', 3, 'builder', 3]
  ];
  for (const [captor, victim, base, charges, type, left] of cases) {
    const r = ordersRig();
    r.run('pl(0).civ = "' + captor + '"; pl(1).civ = "' + victim + '"');
    r.war(0, 1);
    const prey = r.unit(1, base, 5, 5), by = r.unit(0, 'warrior', 4, 5);
    if (charges !== null) r.run('unitById("' + prey.id + '").charges = ' + charges);
    r.ready();
    const was = r.get(prey, 'UNITS[u.type].name.toLowerCase()'), wasType = r.get(prey, 'u.type');
    assert.equal(r.run('moveUnit(unitById("' + by.id + '"), 5, 5)'), true);
    const label = captor + ' takes ' + victim + ' ' + was + (charges === null ? '' : ' (' + charges + ' left)');
    assert.equal(r.get(prey, 'u.owner'), 0, label);
    assert.equal(r.get(prey, 'u.type'), type, label + ': becomes a ' + type);
    assert.equal(r.get(prey, 'u.charges === undefined ? null : u.charges'), left, label + ': ' + left + ' charges');
    assert.equal(r.get(by, 'u.mp'), 0, label + ': the soldier uses up its moves');
    assert.equal(r.get(prey, 'u.mp'), 0, 'the captured unit waits a turn');
    const land = id => r.run('CIVS["' + id + '"].land');
    const line = r.logs(0).at(-1);
    assert.equal(line, land(captor) + ' captured a ' + land(victim) + ' ' + was + (wasType !== type ? ' (now a ' + r.get(prey, 'UNITS[u.type].name.toLowerCase()') + ').' : '.'), label + ': the history line');
  }
  // The Pioneer is a settler and a Woodsman a builder, so the cases above cover both; Legion is a soldier and is never captured.
  const r = ordersRig();
  r.war(0, 1);
  r.unit(1, 'swordsman', 5, 5); r.unit(0, 'warrior', 4, 5); r.ready();
  assert.equal(r.run('G.units.filter(u => u.owner === 1).length'), 1);
  assert.equal(r.run('computeReachable(G.units.find(u => u.owner === 0)).has("5,5")'), false, 'a soldier is fought, not captured');
});

test('Ashcrown orders: the player who loses a unit gets one "captured" card, and the log line shows either way', () => {
  const r = ordersRig();
  r.war(0, 1);
  const home = r.city(1, 9, 9), prey = r.unit(1, 'settler', 5, 5), by = r.unit(0, 'warrior', 4, 5);
  r.ready();
  r.run('moveUnit(unitById("' + by.id + '"), 5, 5)');
  const cards = r.news(1, 'captured');
  assert.equal(cards.length, 1, 'one card');
  assert.equal(r.news(0, 'captured').length, 0, 'none for the one who took it');
  assert.equal(cards[0].unit, 'settler');
  assert.equal(cards[0].near, home.name, 'the nearest of their cities');
  assert.equal(JSON.stringify(cards[0].at), '[5,5]');
  // On their turn the card reads like the war card: title, civ, text, Show me and Got it.
  r.seat(1);
  r.run('G.news = G.news.filter(n => n.kind === "captured"); showNews()');
  const html = r.modals.at(-1);
  const who = r.run('fullName(pl(0))');
  assert.ok(html.includes('Settler captured'), 'title');
  assert.ok(html.includes(r.run('CIVS[pl(0).civ].land')), 'sub: their civ');
  assert.ok(html.includes('<b>' + who + '</b> captured your settler near ' + home.name + '.'), html);
  assert.ok(html.includes('data-act="news-look:5:5"') && html.includes('Show me') && html.includes('Got it'));
  assert.ok(html.includes('wonder-card'), 'a card with art, like the war card');
  // Show me centres on the hex.
  r.act('news-look:5:5');
  assert.equal(r.run('JSON.stringify(selection)'), '{"kind":"tile","x":5,"y":5}');
  assert.equal(JSON.stringify(r.camera.at(-1)), '[5,5]');
  // A pioneer shows as itself, a builder as a builder.
  assert.ok(r.log0 === undefined);
  // Cards off: no card, but the history line is always there.
  const q = ordersRig();
  q.war(0, 1);
  q.run('setPopups(false)');
  const p2 = q.unit(1, 'builder', 5, 5), b2 = q.unit(0, 'warrior', 4, 5);
  q.ready();
  q.run('moveUnit(unitById("' + b2.id + '"), 5, 5)');
  assert.equal(q.news(1, 'captured').length, 0, 'the setting is respected');
  assert.ok(q.logs(0).some(t => / captured a Celts woodsman \(now a builder\)\.$/.test(t)), 'the log line still shows');
  void p2;
  // A CPU that loses a unit gets no card to show.
  const c = ordersRig();
  c.war(0, 2);
  c.unit(2, 'settler', 5, 5); const b3 = c.unit(0, 'warrior', 4, 5); c.ready();
  c.run('moveUnit(unitById("' + b3.id + '"), 5, 5)');
  assert.equal(c.news(2, 'captured').length, 0);
});

test('Ashcrown orders: the hover preview says "Capture <unit>", and "(means war)" at peace', () => {
  const r = ordersRig();
  r.run('UI.layerPath = { innerHTML: "" }');
  r.meetOnly(0, 1);
  const a = r.unit(0, 'warrior', 4, 5), ship = r.unit(0, 'galley', 3, 5);
  const prey = r.unit(1, 'settler', 6, 5);
  r.unit(1, 'builder', 12, 5);
  r.run('tileAt(3, 5).t = "shallow"');
  r.ready(); r.pick(a);
  const hover = (x, y) => { r.run('hover = [' + x + ', ' + y + ']; refreshPreview()'); return r.run('preview'); };
  const layer = () => r.run('UI.layerPath.innerHTML');
  let p = hover(6, 5);
  assert.equal(p.cap.label, 'Capture Settler (means war)', 'at peace, within a walk this turn');
  assert.ok(/class="pathlabel-bg war"/.test(layer()) && /class="threat"/.test(layer()) && layer().includes('Capture Settler (means war)'), 'drawn like an attack: a red hex and a red label');
  assert.equal(hover(12, 5), null, 'at peace, too far to take this turn: no preview of a capture');
  r.war(0, 1);
  assert.equal(hover(6, 5).cap.label, 'Capture Settler', 'at war it is just a capture');
  assert.ok(!layer().includes('means war'));
  p = hover(12, 5);
  assert.ok(/^Capture Woodsman · \d+ turns$/.test(p.cap.label), 'a longer way says how long: ' + p.cap.label);
  p = hover(5, 5);
  assert.equal(p.cap, null, 'an empty hex is the plain path preview');
  assert.ok(layer().includes('this turn'));
  // A ship and a civilian of its own: no capture label.
  r.pick(ship);
  assert.equal(hover(6, 5), null, 'a ship has nothing to capture');
  r.pick(a);
  void prey;
  // Ordinary move previews are unchanged.
  r.run('selection = null');
  assert.equal(hover(5, 5), null);
});

test('Ashcrown orders: a CPU at war captures a lone settler next to its soldier, settlers first, unless a stronger enemy stands beside it', () => {
  const r = ordersRig();
  r.war(0, 2);
  const mine = r.unit(2, 'warrior', 5, 5);
  const builder = r.unit(0, 'builder', 5, 7), settler = r.unit(0, 'settler', 6, 5);
  r.ready();
  r.run('aiSoldier(pl(2), unitById("' + mine.id + '"))');
  assert.equal(r.get(settler, 'u.owner'), 2, 'the settler is taken, though the builder was as close');
  assert.equal(r.get(settler, 'u.type'), r.run('unitFor(2, "settler")'), 'still a settler');
  assert.equal(r.get(builder, 'u.owner'), 0, 'the builder waits for another day');
  assert.equal(r.get(mine, 'u.mp'), 0);
  assert.equal(r.news(0, 'captured').length, 1, 'and the human who lost it is told');
  assert.ok(r.logs(0).some(t => / captured a .* settler( \(now a \w+\))?\.$/.test(t)));
  // A builder alone is taken too.
  const q = ordersRig();
  q.war(0, 2);
  const w = q.unit(2, 'warrior', 5, 5), b = q.unit(0, 'builder', 6, 5);
  q.ready();
  q.run('aiSoldier(pl(2), unitById("' + w.id + '"))');
  assert.equal(q.get(b, 'u.owner'), 2);
  // Unless it would end the turn beside a stronger enemy soldier.
  const s = ordersRig();
  s.war(0, 2);
  const x = s.unit(2, 'warrior', 5, 5), p = s.unit(0, 'settler', 6, 5);
  const [gx, gy] = s.run('neighbourList(6, 5).find(([x, y]) => x !== 5 || y !== 5)');
  s.unit(0, 'heavy', gx, gy);
  s.ready();
  s.run('aiSoldier(pl(2), unitById("' + x.id + '"))');
  assert.equal(s.get(p, 'u.owner'), 0, 'a heavy horseman beside it is too strong a neighbour');
  // A weaker neighbour is no reason to hold back.
  s.run('G.units.find(u => u.type === "heavy").type = "scout"; G.units.find(u => u.id === "' + x.id + '").mp = 2');
  s.run('aiSoldier(pl(2), unitById("' + x.id + '"))');
  assert.equal(s.get(p, 'u.owner'), 2, 'a scout is weaker than a warrior');
  // At peace nothing is taken, and a ship never tries.
  const t = ordersRig();
  t.meetOnly(0, 2);
  const pw = t.unit(2, 'warrior', 5, 5), ps = t.unit(0, 'settler', 6, 5);
  t.ready();
  t.run('aiSoldier(pl(2), unitById("' + pw.id + '"))');
  assert.equal(t.get(ps, 'u.owner'), 0, 'at peace the CPU never uses the prompt, or war');
  assert.equal(t.at(0, 2), false);
  t.war(0, 2);
  t.run('tileAt(5, 5).t = "shallow"; tileAt(6, 5).t = "shallow"');
  const ship = t.unit(2, 'galley', 5, 6);
  t.run('tileAt(5, 6).t = "shallow"');
  t.ready();
  assert.equal(t.run('aiTryCapture(pl(2), unitById("' + ship.id + '"))'), false, 'a ship never captures');
});

test('Ashcrown orders: a lone civilian that is reached on a march is captured the same way', () => {
  const r = ordersRig();
  r.war(0, 1);
  const prey = r.unit(1, 'settler', 8, 5), a = r.unit(0, 'warrior', 4, 5), b = r.unit(0, 'archer', 4, 8);
  r.ready(); r.pick(a);
  assert.equal(r.order(a, 8, 5), true, 'a march to the settler');
  assert.equal(r.sel(), b.id);
  r.run('beginPlayerTurn(0)');   // it walks on at the start of the turn
  assert.equal(r.get(prey, 'u.owner'), 0, 'taken when the march arrives');
  assert.equal(r.get(a, 'u.mp'), 0);
  assert.equal(r.news(1, 'captured').length, 1);
});

test('Ashcrown orders: the tutorial still runs start to finish, with the warrior sent by a real order', () => {
  const r = civRig(FOUR, { flat: false });
  const camera = [];
  r.ctx.centreOn = (x, y) => { camera.push([x, y]); };
  r.run('buildTutorialIsland()');
  r.run('G.seen[0].fill(1)');
  const steps = r.run('TUT_STEPS.length');
  let sent = false;
  for (let k = 0; k < steps + 5 && r.run('G.tut.step < TUT_STEPS.length'); k++) {
    if (/Now the warrior/.test(r.run('TUT_STEPS[G.tut.step].say').replace(/<[^>]+>/g, ''))) {
      // The lesson as written: select the warrior, then right-click the flashing hex.
      r.run('tutorialTick()');
      const at = r.run('G.tut.step'), goal = r.run('G.tut.goal');
      assert.ok(goal, 'the lesson picked a flashing hex');
      const w = r.run('tutUnit(u => u.type === "warrior")');
      r.run('G.units.forEach(u => { u.mp = unitMove(u); })');
      r.run('selection = { kind: "unit", id: "' + w.id + '" }; reachable = computeReachable(unitById("' + w.id + '"))');
      assert.equal(r.run('orderUnit(unitById("' + w.id + '"), ' + goal[0] + ', ' + goal[1] + ')'), true);
      assert.equal(r.run('unitById("' + w.id + '").mp'), 0, 'two moves, two hexes');
      const next = r.run('selection && selection.id');
      assert.ok(next && next !== w.id, 'the selection went on to a unit that still needs orders');
      assert.equal(JSON.stringify(camera.at(-1)), JSON.stringify(r.run('(u => [u.x, u.y])(unitById("' + next + '"))')), 'and the camera with it');
      r.run('tutorialTick()');
      assert.ok(r.run('G.tut.step') > at, 'the lesson saw the warrior arrive and moved on by itself');
      sent = true;
    } else r.run('tutorialNext()');
  }
  assert.ok(sent, 'the warrior step was reached');
  r.run('while (G.tut.step < TUT_STEPS.length) tutorialNext()');
  assert.equal(r.run('G.tut.step'), steps, 'every step ran');
});

/* ── Ashcrown 4.6: Early Empire closes a civ's borders, and embassies show their capital ──
   Same bare-VM rigs as above. */

const jsonOf = (r, code) => JSON.parse(r.run('JSON.stringify(' + code + ')'));
const logLines = (r, viewer) => Array.from(r.run('G.log'), e => r.run('logText(' + JSON.stringify(e.text) + ', ' + viewer + ')'));
const SEVEN = [{ name: 'Ann', human: true }, { name: 'Ben', human: true }, ...Array.from({ length: 5 }, () => ({ name: '', human: false }))];

test('Ashcrown 4.6: Early Empire costs 25, is an era 1 tech with no prerequisite, and Writing needs it and Pottery', () => {
  const r = ordersRig();
  const t = jsonOf(r, 'TECHS.earlyempire');
  assert.equal(t.name, 'Early Empire');
  assert.equal(t.era, 1);
  assert.deepEqual(t.needs, []);
  assert.equal(r.run('techCost(0, "earlyempire")'), 25);
  assert.equal(r.run('TECH_COST[1]'), 40, 'the era price is untouched');
  assert.equal(r.run('techCost(0, "mining")'), 40, 'every other era 1 tech still costs it');
  assert.ok(t.blurb.startsWith('Closes your borders: other civs need an open-borders deal, or a war, to enter your land'));
  // Research list: there from the start, and Writing needs both Pottery and Early Empire.
  assert.ok(jsonOf(r, 'researchChoices(0)').includes('earlyempire'));
  r.run('pl(0).techs = ["pottery"]');
  assert.equal(r.run('techReady(0, "writing")'), false, 'Pottery alone is not enough');
  assert.ok(!jsonOf(r, 'researchChoices(0)').includes('writing'));
  r.run('pl(0).techs = ["earlyempire"]');
  assert.equal(r.run('techReady(0, "writing")'), false, 'nor is Early Empire alone');
  r.run('pl(0).techs = ["pottery", "earlyempire"]');
  assert.equal(r.run('techReady(0, "writing")'), true);
  assert.ok(jsonOf(r, 'researchChoices(0)').includes('writing'));
  assert.deepEqual(jsonOf(r, 'techPath(1, "writing")').sort(), ['earlyempire', 'pottery', 'writing'], 'heading for Writing queues both');
  assert.ok(jsonOf(r, 'techPath(1, "navigation")').includes('earlyempire'), 'and so does everything past Writing');
  // The tree: its own card in the first column, a line into Writing beside Pottery's, no two cards on one spot.
  assert.equal(jsonOf(r, 'techSpot("earlyempire")').col, 0);
  const spots = jsonOf(r, 'TECH_ORDER.concat("future").map(id => techSpot(id).x + "," + techSpot(id).y)');
  assert.equal(new Set(spots).size, spots.length, 'every tech card has a spot of its own');
  assert.deepEqual(jsonOf(r, 'techEdges(0).filter(e => e.to === "writing").map(e => e.from).sort()'), ['earlyempire', 'pottery']);
  const tree = r.run('techTreeHTML(0)');
  assert.ok(tree.includes('data-act="research:earlyempire"') && tree.includes('Early Empire'), 'the tree draws it');
  assert.ok(tree.includes('Era 1 · 25–40 rp'), 'the era header tells the cost range');
  assert.ok(tree.includes('Era 2 · 100 rp each'), 'and the other eras their one price');
  // Score: it counts like any era 1 tech (2 points).
  r.run('pl(0).techs = []');
  const none = r.run('scoreParts(0).total');
  r.run('pl(0).techs = ["earlyempire"]');
  assert.equal(r.run('scoreParts(0).total') - none, 2);
  assert.equal(r.run('techPoints(pl(0))'), r.run('(pl(0).techs = ["mining"], techPoints(pl(0)))'), 'the same as Mining');
  // UK's discount reaches it like every tech.
  r.run('pl(0).civ = "uk"');
  assert.equal(r.run('techCost(0, "earlyempire")'), 19);
});

test('Ashcrown 4.6: before Early Empire others walk onto your land; after it they are moved out, asked first, and a deal or a war lets them in', () => {
  const r = ordersRig();
  r.meetOnly(0, 1);
  for (const x of [8, 9, 10]) for (const y of [4, 5, 6]) r.own(0, x, y);   // Rome's land
  r.seat(1);
  // Before: Ben steps in freely. No prompt, no war.
  const early = r.unit(1, 'warrior', 7, 5);
  r.ready(); r.pick(early);
  const boxes = r.modals.length;
  assert.equal(r.run('closedOwner(1, 8, 5)'), -1);
  assert.equal(r.order(early, 8, 5), true);
  assert.equal(r.get(early, 'u.x'), 8, 'he walked in');
  assert.equal(r.at(0, 1), false);
  assert.equal(r.modals.length, boxes, 'nothing asked');
  // Rome learns Early Empire. His warrior is still there, until his turn starts.
  r.run('pl(0).research = "earlyempire"; pl(0).rp = 100; processResearch(pl(0))');
  assert.equal(r.run('hasTech(0, "earlyempire")'), true);
  assert.equal(r.run('closedOwner(1, 8, 5)'), 0, 'closedOwner names Rome for Ben');
  assert.equal(r.run('closedOwner(0, 8, 5)'), -1, 'and never for Rome on its own land');
  assert.equal(r.get(early, 'u.x'), 8, 'nothing moves until his turn');
  r.run('beginPlayerTurn(1)');
  assert.notEqual(r.run('tileAt(' + r.get(early, 'u.x') + ', ' + r.get(early, 'u.y') + ').owner'), 0, 'at the start of his turn he is moved out');
  assert.ok(logLines(r, 1).some(l => /was moved out of .*’s land: the borders are closed/.test(l)), 'with a line saying so');
  // Stepping in now asks first, and only a yes declares war.
  const late = r.unit(1, 'warrior', 7, 4);
  r.ready(); r.pick(late);
  assert.equal(r.order(late, 8, 4), true);
  assert.ok(r.modals.at(-1).includes('Declare war and go in') && r.modals.at(-1).includes('Their borders are closed.'), 'the question comes up');
  assert.equal(r.get(late, 'u.x'), 7, 'he has not moved');
  assert.equal(r.at(0, 1), false, 'and nobody is at war yet');
  r.act('enter-war:' + late.id + ':8:4');
  assert.equal(r.at(0, 1), true, 'yes is the declaration');
  assert.equal(r.get(late, 'u.x'), 8);
  // An open-borders deal lets him in without asking.
  const deal = ordersRig();
  deal.meetOnly(0, 1);
  for (const x of [8, 9]) deal.own(0, x, 5);
  deal.run('pl(0).techs.push("earlyempire"); openBorders(0, 1)');
  assert.equal(deal.run('closedOwner(1, 8, 5)'), -1, 'a deal opens it');
  deal.seat(1);
  const guest = deal.unit(1, 'warrior', 7, 5);
  deal.ready(); deal.pick(guest);
  assert.equal(deal.order(guest, 8, 5), true);
  assert.equal(deal.get(guest, 'u.x'), 8);
  assert.equal(deal.at(0, 1), false);
  // So does a war: closed land is no wall to an enemy.
  const war = ordersRig();
  war.war(0, 1);
  war.own(0, 8, 5);
  war.run('pl(0).techs.push("earlyempire")');
  assert.equal(war.run('closedOwner(1, 8, 5)'), -1);
});

test('Ashcrown 4.6: only the civ that knows Early Empire is closed, and "never" closes nothing', () => {
  const r = ordersRig();
  r.meetOnly(0, 1);
  r.own(0, 4, 5); r.own(1, 9, 5);
  r.run('pl(0).techs.push("earlyempire")');
  assert.equal(r.run('closedOwner(1, 4, 5)'), 0, 'Rome knows it: its land is closed to the Celts');
  assert.equal(r.run('closedOwner(0, 9, 5)'), -1, 'the Celts do not: their land stays open to Rome');
  r.run('pl(1).techs.push("earlyempire")');
  assert.equal(r.run('closedOwner(0, 9, 5)'), 1, 'once they learn it, theirs closes too');
  assert.equal(r.run('G.borders'), 'tech', 'the default setting');
  // The "never" setting: the tech can be learned and closes nothing.
  const never = ordersRig({ borders: 'never' });
  assert.equal(never.run('G.borders'), 'never');
  never.meetOnly(0, 1);
  never.own(0, 4, 5);
  never.run('pl(0).research = "earlyempire"; pl(0).rp = 100; processResearch(pl(0))');
  assert.equal(never.run('hasTech(0, "earlyempire")'), true, 'it can still be researched');
  assert.equal(never.run('closedOwner(1, 4, 5)'), -1, 'and closes nothing');
  assert.equal(never.run('landClosed(0)'), false);
  assert.equal(never.say(1, 'alert') + never.say(0, 'alert'), 0, 'no card');
  assert.equal(never.run('pl(0).notes.length'), 0, 'no note');
  assert.ok(!logLines(never, 1).some(l => /borders are closed/.test(l)), 'no line in the history');
  assert.ok(never.run('techBlurb("earlyempire")').startsWith('Closes nothing in this game'), 'its blurb says so in this game');
  assert.ok(never.run('techDetail(0, "earlyempire")').includes('Closes nothing in this game'));
  assert.ok(ordersRig().run('techDetail(0, "earlyempire")').includes('Closes your borders'), 'and the normal one otherwise');
});

test('Ashcrown 4.6: learning Early Empire sends one card to each human who has met that civ, none to the rest, and a note to the civ itself', () => {
  const r = ordersRig();
  r.meetOnly(0, 2);                                   // Ann has met the civ at seat 2; Ben has not
  r.run('pl(2).research = "earlyempire"; pl(2).rp = 100; processResearch(pl(2))');
  assert.equal(r.say(0, 'alert'), 1, 'Ann gets a card');
  assert.equal(r.say(1, 'alert'), 0, 'Ben, who has not met them, gets nothing');
  const card = jsonOf(r, 'G.news.filter(n => n.i === 0)')[0];
  assert.equal(card.type, 'close');
  assert.equal(card.by, 2);
  r.seat(0);
  r.run('showNews()');
  const html = r.modals.at(-1);
  const land = r.run('CIVS[pl(2).civ].land');
  assert.ok(html.includes(land + '’s borders are closed'), 'titled with the civ: ' + land);
  assert.ok(html.includes('Stepping onto their land without an open-borders deal means war. Ask for open borders in the Council.'));
  assert.ok(html.includes('data-act="council"'), 'with a button to the Council');
  // The history line carries a name marker: Ann reads the civ, Ben reads "Unmet player".
  assert.ok(logLines(r, 0).includes(land + '’s borders are closed.'));
  assert.ok(logLines(r, 1).includes('Unmet player’s borders are closed.'));
  // A human learning it gets the note for their next turn, shown when it starts.
  r.run('pl(0).research = "earlyempire"; pl(0).rp = 100; processResearch(pl(0))');
  assert.deepEqual(jsonOf(r, 'pl(0).notes'), ['Your borders are closed. Other civs need an open-borders deal to come in.']);
  r.run('G.handoff = true; G.viewer = 0; G.cur = 0; UI.handoff = { hidden: false }');
  r.toasts.length = 0;
  r.act('handoff-go');
  assert.ok(r.toasts.some(t => t.startsWith('Your borders are closed. Other civs need an open-borders deal to come in.')), 'a toast as their turn starts: ' + r.toasts.join(' | '));
  assert.equal(r.run('pl(0).notes.length'), 0, 'shown once');
  // A CPU learning it makes no note for itself.
  assert.equal(r.run('pl(3).research = "earlyempire"; pl(3).rp = 100; processResearch(pl(3)); (pl(3).notes || []).length'), 0);
});

test('Ashcrown 4.6: a CPU picks Early Empire first when a war wonder is near its city, and otherwise within its first three techs', () => {
  const pick = (setup) => {
    const r = civRig(FOUR);
    r.ctx.checkElimination = () => {}; r.ctx.checkWin = () => {};
    r.unit(2, 'settler', 6, 5); r.run('foundCity(G.units.find(u => u.owner === 2))');
    r.run('WONDER_TILES_FOR = null');
    if (setup) setup(r);
    return r;
  };
  // Pamukkale three hexes from the city: first.
  let r = pick(x => x.run('tileAt(9, 5).f = "spring"; WONDER_TILES_FOR = null'));
  assert.equal(r.run('hexDistance(6, 5, 9, 5)'), 3);
  assert.equal(r.run('aiPickTech(pl(2))'), 'earlyempire', 'a spring three hexes out');
  // The Giant's Causeway counts too, and so does a wonder inside its borders.
  r = pick(x => x.run('tileAt(8, 4).f = "stair"; WONDER_TILES_FOR = null'));
  assert.equal(r.run('aiPickTech(pl(2))'), 'earlyempire', 'a causeway close by');
  // Four hexes out is not near enough, and the science wonders give no gift.
  r = pick(x => x.run('tileAt(10, 5).f = "spring"; tileAt(5, 5).f = "reef"; WONDER_TILES_FOR = null'));
  assert.equal(r.run('hexDistance(6, 5, 10, 5)'), 4);
  assert.notEqual(r.run('aiPickTech(pl(2))'), 'earlyempire', 'too far, and a reef is no war wonder');
  // With a war wonder near but borders that never close, there is no rush.
  r = civRig(FOUR, { borders: 'never' });
  r.ctx.checkElimination = () => {}; r.ctx.checkWin = () => {};
  r.unit(2, 'settler', 6, 5); r.run('foundCity(G.units.find(u => u.owner === 2)); tileAt(9, 5).f = "spring"; WONDER_TILES_FOR = null');
  assert.notEqual(r.run('aiPickTech(pl(2))'), 'earlyempire');
  // No wonder: it comes within the first three techs, for every seed and civ we try.
  for (const seed of [1, 7, 12345, 99, 2024]) {
    const q = civRig(FOUR, { seed });
    q.ctx.checkElimination = () => {}; q.ctx.checkWin = () => {};
    q.unit(2, 'settler', 6, 5); q.run('foundCity(G.units.find(u => u.owner === 2)); WONDER_TILES_FOR = null');
    const order = [];
    for (let k = 0; k < 3; k++) { const id = q.run('aiPickTech(pl(2))'); order.push(id); q.run('pl(2).techs.push("' + id + '")'); }
    assert.ok(order.includes('earlyempire'), 'seed ' + seed + ' picked ' + order.join(', '));
  }
  // The very first pick waits for a first city (research points come from cities), so a wonder near it can count.
  const lone = civRig(FOUR);
  assert.equal(lone.run('aiPickTech(pl(2))'), null, 'nothing to pick before it has a city');
});

test('Ashcrown 4.6: an old save converts: past the old close turn everyone has Early Empire, before it nobody, never stays never, and Writing is kept', () => {
  const fresh = civRig(FOUR, { flat: false });
  const make = (closeTurn, turn, tweak) => {
    const s = JSON.parse(fresh.run('JSON.stringify(G)'));
    delete s.borders; delete s.embassies;
    if (closeTurn !== undefined) s.closeTurn = closeTurn;
    s.turn = turn;
    s.players[0].techs = ['pottery', 'writing'];
    s.players[1].techs = ['mining'];
    s.players[1].queue = ['writing', 'math'];
    s.players[2].techs = [];
    s.players[3].techs = ['archery'];
    s.players[3].alive = false;
    if (tweak) tweak(s);
    return s;
  };
  const convert = s => { fresh.ctx.__s = s; fresh.run('prepareState(__s)'); return s; };
  const knows = (s, i) => s.players[i].techs.includes('earlyempire');
  // Past the old close turn: the borders were already closed, so every living player has it. No cards, no points.
  let s = make(30, 35);
  const eraBefore = s.players.map(p => p.eraPts || 0), newsBefore = s.news.length, momentsBefore = s.players.map(p => (p.moments || []).length);
  convert(s);
  assert.equal(s.borders, 'tech');
  assert.equal(s.closeTurn, undefined, 'closeTurn is dropped');
  assert.deepEqual([0, 1, 2].map(i => knows(s, i)), [true, true, true], 'every living player');
  assert.equal(knows(s, 3), false, 'but not a player who is out');
  assert.equal(s.news.length, newsBefore, 'no cards');
  assert.deepEqual(s.players.map(p => p.eraPts || 0), eraBefore, 'no era points');
  assert.deepEqual(s.players.map(p => (p.moments || []).length), momentsBefore, 'no moments');
  assert.ok(s.players[0].techs.includes('writing') && s.players[0].techs.includes('pottery'), 'Writing stays');
  assert.equal(s.embassies.length, 0, 'and the embassy list starts empty');
  // Exactly on the turn counts as closed, like the old rule.
  assert.equal(knows(convert(make(30, 30)), 2), true);
  // Not reached yet: nobody has it, and the borders will close with the tech.
  s = convert(make(30, 20));
  assert.equal(s.borders, 'tech');
  assert.deepEqual([0, 1, 2, 3].map(i => knows(s, i)), [false, false, false, false]);
  assert.ok(s.players[0].techs.includes('writing'), 'a player who knew Writing keeps it, with no Early Empire');
  assert.deepEqual(s.players[1].queue, ['earlyempire', 'writing', 'math'], 'a queued Writing gets Early Empire ahead of it');
  // Never closing stays never.
  s = convert(make(0, 90));
  assert.equal(s.borders, 'never');
  assert.deepEqual([0, 1, 2].map(i => knows(s, i)), [false, false, false]);
  assert.ok(s.players[0].techs.includes('writing'));
  s = convert(make(undefined, 90, x => { delete x.closeTurn; }));
  assert.equal(s.borders, 'never', 'a save older than closeTurn too');
  // A save that already has the setting is left alone, and a stray closeTurn goes.
  s = make(30, 35, x => { x.borders = 'never'; });
  convert(s);
  assert.equal(s.borders, 'never');
  assert.equal(knows(s, 2), false);
  assert.equal(s.closeTurn, undefined);
  // The converted game plays: closed land follows the tech.
  fresh.ctx.__s = convert(make(30, 35));
  fresh.run('G = __s');
  fresh.run('G.tiles[0].owner = 0');
  assert.equal(fresh.run('closedOwner(1, G.tiles[0].x, G.tiles[0].y)'), 0);
});

test('Ashcrown 4.6: the tutorial still runs start to finish, closes nothing, and teaches Early Empire', () => {
  const r = civRig(FOUR, { flat: false });
  r.ctx.centreOn = () => {};
  r.run('buildTutorialIsland()');
  r.run('G.seen[0].fill(1)');
  assert.equal(r.run('G.borders'), 'never');
  const steps = r.run('TUT_STEPS.length');
  const says = jsonOf(r, 'TUT_STEPS.map(s => s.say)').join(' ');
  assert.ok(/Early Empire/.test(says), 'a step explains it');
  assert.ok(!/on a turn you choose|borders close on turn/i.test(says), 'no step talks about a close turn');
  for (let k = 0; k < steps + 5 && r.run('G.tut.step < TUT_STEPS.length'); k++) {
    r.run('tutorialNext()');
    // However the CPU's tech stands, nothing closes in the tutorial.
    if (k === 3) r.run('G.players[1].techs.push("earlyempire")');
    assert.equal(r.run('G.tiles.every(t => closedOwner(0, t.x, t.y) === -1)'), true, 'step ' + k + ': no land is closed');
  }
  assert.equal(r.run('G.tut.step'), steps, 'every step ran');
  assert.equal(r.run('hasTech(0, "writing")'), true, 'the library lesson gave Writing');
  // The tutorial teaches no embassies: no Embassy item in the city panel.
  r.run('G.viewer = 0; G.cur = 0; G.handoff = false');
  const cap = r.run('tutCap()');
  assert.ok(cap, 'a capital');
  assert.ok(!r.run('cityPanel(tutCap())').includes(':embassy:new'), 'no Embassy row in the tutorial');
});

function embRig(seats = FOUR, opts) {
  const r = civRig(seats, opts);
  r.camera = [];
  r.ctx.centreOn = (x, y) => { r.camera.push([x, y]); };
  r.ctx.checkElimination = () => {};          // the sandbox has no cities, which would knock everyone out
  r.ctx.checkWin = () => {};
  r.ctx.roll = () => 0.5;
  r.run('pl(0).civ = "rome"; pl(0).techs.push("writing")');
  r.meetOnly = (a, b) => r.run('G.met[' + a + '][' + b + '] = G.met[' + b + '][' + a + '] = true');
  r.war = (a, b) => { r.meetOnly(a, b); r.run('G.dip[' + a + '][' + b + '] = G.dip[' + b + '][' + a + '] = "war"'); };
  r.city = (owner, x, y) => {
    const s = r.unit(owner, 'settler', x, y);
    r.run('foundCity(unitById("' + s.id + '"))');
    return r.run('cityAt(' + x + ', ' + y + ')');
  };
  r.act = code => r.run('onAction("' + code + '")');
  r.ask = (c, to) => r.run('askEmbassy(cityById("' + c.id + '"), ' + to + ')');
  r.item = 'setbuild:%:embassy:new';
  r.panel = c => r.run('cityPanel(cityById("' + c.id + '"))');
  r.land = i => r.run('CIVS[pl(' + i + ').civ].land');
  return r;
}
const embassyRow = html => (html.match(/<button class="build-row[^>]*data-act="setbuild:[^"]*:embassy:new"[^>]*>[\s\S]*?<\/button>/) || [''])[0];

test('Ashcrown 4.6: no Embassy item before Writing; after it the item is greyed with its reason until a civ qualifies', () => {
  const r = embRig();
  r.run('pl(0).techs = []');
  const c = r.city(0, 3, 5);
  r.city(2, 14, 5);
  assert.equal(r.run('buildProblem(cityById("' + c.id + '"), { kind: "embassy", id: "new" })'), 'Needs Writing');
  assert.equal(embassyRow(r.panel(c)), '', 'no Embassy row in the build list before Writing');
  r.run('pl(0).techs.push("writing")');
  // Writing, but nobody met: greyed out, with the reason.
  let row = embassyRow(r.panel(c));
  assert.ok(row.includes('>Embassy<') && row.includes('disabled') && row.includes('No civ to send one to'), 'greyed out: ' + row);
  assert.ok(row.includes('Ask a civ you’ve met for an embassy. If they agree, their capital shows on your map.'), 'the blurb');
  assert.ok(row.includes('>30<'), 'it costs 30');
  const boxes = r.modals.length;
  r.act('setbuild:' + c.id + ':embassy:new');
  assert.equal(r.modals.length, boxes, 'a greyed item opens nothing');
  assert.equal(r.run('cityById("' + c.id + '").build'), null);
  // At war with the only civ met: still nobody to send one to. An embassy already open: the same.
  r.war(0, 2);
  assert.ok(embassyRow(r.panel(c)).includes('disabled'), 'at war');
  r.run('makePeace(0, 2)');
  r.run('G.embassies.push({ from: 0, to: 2, turn: 1 })');
  assert.ok(embassyRow(r.panel(c)).includes('disabled'), 'an embassy already open');
  // Once a civ qualifies the row is live, and picking it opens the box.
  r.run('G.embassies.length = 0');
  row = embassyRow(r.panel(c));
  assert.ok(!row.includes('disabled') && row.includes('One civ to ask'), 'a civ is met and at peace: ' + row);
  r.act('setbuild:' + c.id + ':embassy:new');
  assert.ok(r.modals.at(-1).includes('Send an embassy from ' + c.name + ' to…'));
  assert.equal(r.run('cityById("' + c.id + '").build'), null, 'opening the box builds nothing yet');
  // Other players' cities and the tutorial never show it.
  assert.equal(embassyRow(r.run('(G.viewer = 1, cityPanel(cityById("' + c.id + '")))')), '', 'not in someone else\'s city panel');
});

test('Ashcrown 4.6: the civ box lists only civs that qualify, and Cancel changes nothing', () => {
  const r = embRig(SEVEN);
  const a = r.city(0, 3, 5), b = r.city(0, 3, 9);
  r.meetOnly(0, 1);                                              // qualifies
  r.war(0, 2);                                                   // at war
  r.meetOnly(0, 3); r.run('G.embassies.push({ from: 0, to: 3, turn: 1 })');   // embassy already open
  r.meetOnly(0, 4); r.run('cityById("' + b.id + '").build = { kind: "embassy", id: 4 }');   // being built in another city
  /* civ 5 is never met */
  r.meetOnly(0, 6);                                              // qualifies
  r.act('setbuild:' + a.id + ':embassy:new');
  const html = r.modals.at(-1);
  const rows = [...html.matchAll(/embassy-pick:c\d+:(\d+)/g)].map(m => Number(m[1]));
  assert.deepEqual(rows, [1, 6], 'only the met civs at peace with no embassy and none being built');
  assert.ok(html.includes('Send an embassy from ' + a.name + ' to…'));
  for (const i of [1, 6]) assert.ok(html.includes(r.land(i)) && html.includes(r.run('pl(' + i + ').name')), 'row ' + i + ' shows the name and the leader');
  assert.ok(html.includes('dot'), 'and their dot');
  for (const i of [2, 3, 4, 5]) assert.ok(!html.includes('embassy-pick:' + a.id + ':' + i), 'civ ' + i + ' is not offered');
  assert.ok(html.includes('data-act="close">Cancel</button>'));
  // The other city can still ask 1 and 6, but not 4 (it is already building that one itself).
  r.act('close');
  r.act('setbuild:' + b.id + ':embassy:new');
  assert.deepEqual([...r.modals.at(-1).matchAll(/embassy-pick:c\d+:(\d+)/g)].map(m => Number(m[1])), [1, 6]);
  // Cancel changes nothing.
  r.act('setbuild:' + a.id + ':embassy:new');
  const snap = () => r.run('JSON.stringify([G.offers, G.attitude, G.embassies, G.cities.map(c => [c.build, c.progress, c.wait]), pl(0).asked, G.log.length])');
  const before = snap();
  r.act('close');
  assert.equal(snap(), before);
});

test('Ashcrown 4.6: a CPU that likes you says yes (the build starts, +2, a log line); one that does not says no, the city is unchanged and Back returns to the list', () => {
  const r = embRig();
  const c = r.city(0, 3, 5);
  r.city(2, 14, 5);
  r.meetOnly(0, 2); r.meetOnly(0, 3);
  r.run('G.attitude[2][0] = 0; G.attitude[3][0] = -10');
  const land2 = r.land(2), land3 = r.land(3);
  r.act('setbuild:' + c.id + ':embassy:new');
  r.act('embassy-pick:' + c.id + ':2');
  const yes = r.modals.at(-1);
  assert.ok(yes.includes(land2 + ' agrees.') && yes.includes(c.name + ' starts building the embassy.'), 'the box shows the answer: ' + yes);
  assert.ok(!yes.includes('embassy-pick:'), 'instead of the list');
  assert.deepEqual(jsonOf(r, 'cityById("' + c.id + '").build'), { kind: 'embassy', id: 2 }, 'the build starts');
  assert.equal(r.run('buildLabel(cityById("' + c.id + '")).startsWith("Embassy to ' + land2 + ' · ")'), true, 'as "Embassy to <civ>"');
  assert.equal(r.run('G.attitude[2][0]'), 2, '+2 toward you');
  assert.ok(logLines(r, 0).some(l => l.includes(land2) && /agrees to an embassy from/.test(l)), 'a log line');
  assert.equal(r.run('costOf(cityById("' + c.id + '"), cityById("' + c.id + '").build)'), 30);
  // A CPU that does not trust you says no. The city stays as it was.
  r.run('setBuild(cityById("' + c.id + '"), null)');
  const was = r.run('JSON.stringify([cityById("' + c.id + '").build, cityById("' + c.id + '").progress, G.offers, G.attitude[3][0]])');
  r.act('setbuild:' + c.id + ':embassy:new');
  r.act('embassy-pick:' + c.id + ':3');
  const no = r.modals.at(-1);
  assert.ok(no.includes(land3 + ' won’t let you.') && no.includes('They don’t trust you enough yet.'), 'the refusal: ' + no);
  assert.ok(no.includes('data-act="embassy-back:' + c.id + '">Back</button>') && no.includes('data-act="close">Close</button>'), 'Back and Close');
  assert.equal(r.run('JSON.stringify([cityById("' + c.id + '").build, cityById("' + c.id + '").progress, G.offers, G.attitude[3][0]])'), was, 'nothing changed');
  r.act('embassy-back:' + c.id);
  assert.ok(r.modals.at(-1).includes('embassy-pick:' + c.id + ':3') && r.modals.at(-1).includes('embassy-pick:' + c.id + ':2'), 'Back is the list again');
  // The test is aiAcceptsOpen's: not at war, attitude above -8, and not about to attack.
  const html = load('src/games/content/ashcrown.html');
  assert.ok(/aiAcceptsEmbassy = \(f, other\) => aiAcceptsOpen\(f, other\)/.test(html), 'reused, not copied');
  const t = att => { r.run('G.attitude[3][0] = ' + att + '; pl(3).stance = {}'); return r.ask(r.run('cityById("' + c.id + '")'), 3); };
  assert.equal(t(-8), 'no', '-8 is not above -8');
  assert.equal(r.run('G.attitude[3][0]'), -8);
  assert.equal(t(-7), 'yes');
  r.run('setBuild(cityById("' + c.id + '"), null); G.attitude[3][0] = 10; pl(3).stance = { 0: "attack" }');
  assert.equal(r.ask(r.run('cityById("' + c.id + '")'), 3), 'no', 'a civ about to attack you refuses');
  // Asking again after cancelling warms them up only once.
  r.run('pl(3).stance = {}; G.attitude[3][0] = 0');
  assert.equal(r.ask(r.run('cityById("' + c.id + '")'), 3), 'yes');
  const warmed = r.run('G.attitude[3][0]');
  r.run('setBuild(cityById("' + c.id + '"), null)');
  assert.equal(r.ask(r.run('cityById("' + c.id + '")'), 3), 'yes');
  assert.equal(r.run('G.attitude[3][0]'), warmed, 'no second +2 for the same civ');
});

test('Ashcrown 4.6: an embassy to a human starts waiting and sends a request; Accept lets it finish, Refuse or a lapse cancels it and keeps the production', () => {
  const r = embRig();
  const c = r.city(0, 3, 5);
  r.city(1, 14, 5);
  r.meetOnly(0, 1);
  const cid = c.id, city = () => r.run('cityById("' + cid + '")');
  r.act('setbuild:' + cid + ':embassy:new');
  r.act('embassy-pick:' + cid + ':1');
  assert.ok(r.modals.at(-1).includes(r.land(1) + '</b> answers in the Council on their turn.'), 'the box says so');
  assert.equal(city().build.kind, 'embassy');
  assert.equal(city().build.id, 1);
  assert.ok(r.run('buildLabel(cityById("' + cid + '"))').startsWith('Embassy to ' + r.land(1) + ' (waiting for their answer)'), 'waiting for their answer');
  const offers = jsonOf(r, 'G.offers');
  assert.equal(offers.length, 1);
  assert.deepEqual([offers[0].kind, offers[0].from, offers[0].to, offers[0].city], ['embassy', 0, 1, cid]);
  assert.equal(city().build.ask, offers[0].id);
  assert.equal(r.run('G.attitude[1][0]'), 0, 'a human has no mood to change');
  // The other human sees it in the Council on their turn.
  r.run('G.viewer = 1; G.cur = 1');
  r.run('showCouncil()');
  const council = r.modals.at(-1);
  assert.ok(council.includes('asks for an embassy') && council.includes('offer-accept:' + offers[0].id) && council.includes('offer-refuse:' + offers[0].id));
  r.run('G.viewer = 0; G.cur = 0');
  // It cannot finish while waiting, however much production piles up.
  r.run('cityById("' + cid + '").progress = 99');
  r.run('tryComplete(cityById("' + cid + '")); tryComplete(cityById("' + cid + '"))');
  assert.equal(r.run('G.embassies.length'), 0, 'not finished');
  assert.equal(city().build.kind, 'embassy', 'still on it');
  assert.equal(city().wait, true, 'and holding');
  r.run('processCity(cityById("' + cid + '"))');
  assert.equal(r.run('G.embassies.length'), 0, 'a turn of production changes nothing');
  assert.ok(city().progress >= 99);
  // Accept: the project carries on, and finishes.
  r.run('G.viewer = 1; G.cur = 1');
  r.act('offer-accept:' + offers[0].id);
  r.run('G.viewer = 0; G.cur = 0');
  assert.equal(r.run('G.offers.length'), 0);
  assert.equal(city().build.ask, undefined, 'no longer waiting');
  assert.ok(r.run('buildLabel(cityById("' + cid + '"))').startsWith('Embassy to ' + r.land(1) + ' · '));
  const stock = city().progress;
  r.run('tryComplete(cityById("' + cid + '"))');
  assert.deepEqual(jsonOf(r, 'G.embassies'), [{ from: 0, to: 1, turn: 5 }], 'now it is built');
  assert.equal(city().build, null);
  assert.equal(city().progress, stock - 30, 'what was over carries on');

  // Refuse: the project cancels, the production stays, and a toast waits for the next turn.
  const q = embRig();
  const d = q.city(0, 3, 5); q.city(1, 14, 5); q.meetOnly(0, 1);
  q.ask(d, 1);
  q.run('cityById("' + d.id + '").progress = 17');
  const offer = jsonOf(q, 'G.offers')[0];
  q.run('answerOffer(1, "' + offer.id + '", false)');
  assert.equal(q.run('cityById("' + d.id + '").build'), null, 'cancelled');
  assert.equal(q.run('cityById("' + d.id + '").progress'), 17, 'production kept, like a road');
  assert.equal(q.run('G.embassies.length'), 0);
  assert.equal(q.run('G.offers.length'), 0);
  assert.equal(q.run('noticeFor(0)').startsWith(q.land(1) + ' turned down your embassy. ' + d.name + ' keeps its production.'), true, 'a note for their next turn');
  q.run('processCity(cityById("' + d.id + '"))');
  assert.equal(q.run('G.embassies.length'), 0, 'it can no longer finish');

  // A request nobody answers lapses after three turns and cancels it the same way.
  const w = embRig();
  const e = w.city(0, 3, 5); w.city(1, 14, 5); w.meetOnly(0, 1);
  w.ask(e, 1);
  w.run('cityById("' + e.id + '").progress = 21');
  w.run('G.turn += 3; beginPlayerTurn(1)');
  assert.equal(w.run('G.offers.length'), 1, 'three turns is still in time');
  w.run('G.turn += 1; beginPlayerTurn(1)');
  assert.equal(w.run('G.offers.length'), 0, 'the fourth lapses it');
  assert.equal(w.run('cityById("' + e.id + '").build'), null);
  assert.equal(w.run('cityById("' + e.id + '").progress'), 21);
  assert.ok(w.run('noticeFor(0)').includes('never answered your embassy request'), 'with a note');
  // Choosing something else while waiting withdraws the request.
  const x = embRig();
  const f = x.city(0, 3, 5); x.city(1, 14, 5); x.meetOnly(0, 1);
  x.ask(f, 1);
  x.run('setBuild(cityById("' + f.id + '"), { kind: "unit", id: "warrior" })');
  assert.equal(x.run('G.offers.length'), 0, 'the request goes with the project');
});

test('Ashcrown 4.6: building an embassy: 30 production, war or elimination cancels it and keeps the production, finishing marks their capital and raises attitude by 5', () => {
  const r = embRig();
  r.run('pl(0).civ = "egypt"');                                   // Egypt halves building costs, but not this
  const c = r.city(0, 3, 5), capital = r.city(2, 14, 5);
  r.meetOnly(0, 2);
  r.run('G.attitude[2][0] = 0');
  r.ask(c, 2);
  assert.equal(r.run('costOf(cityById("' + c.id + '"), cityById("' + c.id + '").build)'), 30, '30 production, discounts do not touch it');
  assert.equal(r.run('itemDef(cityById("' + c.id + '").build).name'), 'Embassy to ' + r.land(2));
  // War mid-build: cancelled, production kept.
  r.run('cityById("' + c.id + '").progress = 12');
  r.run('declareWar(0, 2)');
  assert.equal(r.run('cityById("' + c.id + '").build'), null, 'war cancels it');
  assert.equal(r.run('cityById("' + c.id + '").progress'), 12, 'and the production carries over');
  assert.ok(logLines(r, 0).some(l => /embassy to .* was cancelled: war/.test(l)));
  r.run('makePeace(0, 2)');
  // Relations dropping after they agreed does not cancel it.
  r.run('G.attitude[2][0] = 0; G.turn = 8');
  assert.equal(r.ask(c, 2), 'yes');
  r.run('G.attitude[2][0] = -60');
  r.run('cityById("' + c.id + '").progress = 30; tryComplete(cityById("' + c.id + '"))');
  assert.deepEqual(jsonOf(r, 'G.embassies'), [{ from: 0, to: 2, turn: 8 }], 'it finished although they now dislike you');
  assert.equal(r.run('G.attitude[2][0]'), -55, '+5 toward you');
  assert.equal(r.run('cityById("' + c.id + '").build'), null);
  assert.ok(logLines(r, 0).some(l => l.includes('opens an embassy with') && l.includes(r.run('fullName(pl(2))'))), 'a log line');
  assert.equal(r.run('noticeFor(0)').startsWith('Embassy opened in ' + capital.name + '. Their capital is now on your map.'), true, 'and a toast for their next turn');
  // Their capital and every hex within 2 of it are seen, dimmed and remembered: nothing else is.
  const near = jsonOf(r, 'G.tiles.filter(t => hexDistance(14, 5, t.x, t.y) <= 2).map(t => t.y * G.cols + t.x)');
  const seen = jsonOf(r, 'G.seen[0].map((v, k) => v ? k : -1).filter(k => k >= 0)');
  assert.deepEqual(seen.sort((p, q) => p - q), near.sort((p, q) => p - q), 'radius 2 around the capital');
  assert.equal(r.run('seenBy(0, 14, 5)'), true);
  assert.equal(r.run('seenBy(0, 17, 5)'), false, 'three hexes out is not');
  assert.equal(r.run('G.units.length'), 0, 'no unit came with it');
  // It survives war and peace.
  r.run('declareWar(0, 2)');
  assert.equal(r.run('hasEmbassy(0, 2)'), true, 'war');
  r.run('makePeace(0, 2)');
  assert.equal(r.run('hasEmbassy(0, 2)'), true, 'and peace');
  // A capital that moves is revealed again at the start of your turn.
  const second = r.city(2, 20, 8);
  r.run('pl(2).capital = "' + second.id + '"; G.seen[0].fill(0)');
  r.run('beginPlayerTurn(0)');
  assert.equal(r.run('seenBy(0, 20, 8)'), true, 'the new capital is on the map');
  assert.equal(r.run('seenBy(0, 14, 5)'), false, 'the old one is not marked again');
  const near2 = jsonOf(r, 'G.tiles.filter(t => hexDistance(20, 8, t.x, t.y) <= 2).map(t => t.y * G.cols + t.x)');
  assert.ok(near2.every(k => r.run('G.seen[0][' + k + ']')), 'all of its radius');
});

test('Ashcrown 4.6: an embassy is lost only when its civ is eliminated, and an eliminated civ cancels the builds aimed at it', () => {
  const r = civRig(FOUR);
  r.ctx.centreOn = () => {}; r.ctx.roll = () => 0.5;
  r.run('pl(0).civ = "rome"; pl(0).techs.push("writing")');
  const own = r.unit(0, 'settler', 3, 5); r.run('foundCity(unitById("' + own.id + '"))');
  const mine = r.run('cityAt(3, 5)');
  const theirs = r.unit(2, 'settler', 14, 5); r.run('foundCity(unitById("' + theirs.id + '"))');
  const other = r.unit(3, 'settler', 20, 5); r.run('foundCity(unitById("' + other.id + '"))');
  const mate = r.unit(1, 'settler', 3, 9); r.run('foundCity(unitById("' + mate.id + '"))');
  for (const b of [2, 3]) r.run('G.met[0][' + b + '] = G.met[' + b + '][0] = true');
  r.run('G.attitude[2][0] = 0; G.attitude[3][0] = 0');
  r.run('G.embassies.push({ from: 0, to: 3, turn: 2 })');
  r.run('askEmbassy(cityAt(3, 5), 2)');
  assert.equal(r.run('cityAt(3, 5).build.id'), 2);
  // Civ 2 loses its only city: eliminated. The project aimed at it stops; the embassy to civ 3 stays.
  r.run('cityAt(14, 5).owner = 3');
  r.run('cityAt(3, 5).progress = 14; checkElimination()');
  assert.equal(r.run('pl(2).alive'), false);
  assert.equal(r.run('cityAt(3, 5).build'), null, 'cancelled');
  assert.equal(r.run('cityAt(3, 5).progress'), 14, 'production kept');
  assert.equal(r.run('pl(3).alive'), true);
  assert.deepEqual(jsonOf(r, 'G.embassies'), [{ from: 0, to: 3, turn: 2 }], 'the embassy to a living civ stays');
  // Now civ 3 goes too: that embassy is lost.
  r.run('G.cities.filter(c => c.owner === 3).forEach(c => { c.owner = 0; }); G.units.filter(u => u.owner === 3).forEach(removeUnit); checkElimination()');
  assert.equal(r.run('pl(3).alive'), false);
  assert.equal(r.run('G.embassies.length'), 0, 'lost with its civ');
});

test('Ashcrown 4.6: the Council shows the embassy tag, the capital name and city count, a Show capital button, what is being built, and the hint after Writing', () => {
  const r = embRig();
  const c = r.city(0, 3, 5);
  const cap = r.city(2, 14, 5); r.city(2, 14, 9);
  r.meetOnly(0, 2);
  // Writing but nothing yet: the hint.
  r.run('showCouncil()');
  let html = r.modals.at(-1);
  assert.ok(html.includes('Build an Embassy in one of your cities to ask them.'), 'the hint');
  assert.ok(!html.includes('embassy-look') && !html.includes('>embassy<'));
  // Before Writing there is no hint.
  r.run('pl(0).techs = []; showCouncil()');
  assert.ok(!r.modals.at(-1).includes('Build an Embassy'), 'no hint before Writing');
  r.run('pl(0).techs.push("writing")');
  // Being built.
  r.run('G.attitude[2][0] = 0');
  r.ask(c, 2);
  r.run('showCouncil()');
  html = r.modals.at(-1);
  assert.ok(html.includes('Embassy being built in ' + c.name + '.'), 'being built: ' + html.match(/Embassy being[^<]*/));
  assert.ok(!html.includes('Build an Embassy in one of your cities'), 'the hint goes');
  // Built: the tag, the capital and the count, the button.
  r.run('cityById("' + c.id + '").progress = 30; tryComplete(cityById("' + c.id + '"))');
  r.run('showCouncil()');
  html = r.modals.at(-1);
  assert.ok(html.includes('<span class="tag peace">embassy</span>'), 'the tag');
  assert.ok(html.includes('Embassy: capital ' + cap.name + ' · 2 cities.'), 'capital and city count');
  assert.ok(html.includes('data-act="embassy-look:2">Show capital</button>'), 'the button');
  assert.ok(!html.includes('Embassy being built'));
  // Show capital centers the map on it.
  r.act('embassy-look:2');
  assert.deepEqual(r.camera.at(-1), [14, 5], 'the camera goes to their capital');
  assert.deepEqual(jsonOf(r, 'selection'), { kind: 'tile', x: 14, y: 5 });
  // The button shows even when it is not your turn, and never for a civ without an embassy.
  r.run('G.cur = 1; showCouncil()');
  assert.ok(r.modals.at(-1).includes('embassy-look:2'));
  const none = embRig();
  none.city(0, 3, 5); none.city(2, 14, 5); none.meetOnly(0, 2);
  none.run('showCouncil()');
  none.act('embassy-look:2');
  assert.equal(none.camera.length, 0, 'no embassy, no look');
});

/* ── 4.6.1: the What’s new screen ──────────────────────────────────────────── */

const NOTES_PREFS = 'bored.civlite.prefs.v1';
// civRig runs the whole game script on real functions; this adds the few page elements the title code writes to.
function notesRig() {
  const r = civRig(FOUR);
  const els = {};
  for (const id of ['continue-sub', 'continue-detail', 'continue-medal', 'load-sub', 'tut-tag', 'tut-sub', 'notes-tag', 'btn-leave']) els[id] = { hidden: false, textContent: '', innerHTML: '' };
  r.ctx.document = { getElementById: id => els[id] };
  const btn = () => ({ hidden: false, classList: { toggle() {} } });
  r.ctx.btns = [btn(), btn(), btn()];
  r.run('UI = { modalKind: null, btnContinue: btns[0], btnLoad: btns[1], btnNew: btns[2] }');
  r.els = els;
  r.title = () => { r.run('refreshTitle()'); return { notes: !els['notes-tag'].hidden, tutorial: !els['tut-tag'].hidden }; };
  r.prefs = () => JSON.parse(r.store.get(NOTES_PREFS) || '{}');
  return r;
}

test('Ashcrown 4.6.1: the changelog is newest first, its newest entry is this version, and every entry has a date and notes', () => {
  const r = civRig(FOUR);
  const log = jsonOf(r, 'CHANGELOG');
  assert.equal(r.run('VERSION'), '4.7.1');
  assert.equal(log[0].v, r.run('VERSION'), 'the newest entry is the current version');
  assert.deepEqual(log.map(e => [e.v, e.date, e.notes.length]), [
    ['4.7.1', 'Nov 9', 1], ['4.7', 'Nov 9', 4], ['4.6.2', 'Nov 8', 1], ['4.6.1', 'Nov 7', 1], ['4.6', 'Nov 7', 5], ['4.5 orders', 'Nov 6', 4], ['4.5', 'Nov 6', 4], ['4.4', 'Nov 6', 2], ['4.3', 'Nov 6', 2],
    ['4.2.1–4.2.3', 'Nov 6', 3], ['4.2', 'Nov 6', 3], ['4.1', 'Nov 6', 2], ['4.0', 'Nov 4', 7], ['Before 4.0', 'Nov 3–4', 4]
  ], 'the entries, in order, with their dates and how many notes each has');
  for (const e of log) {
    assert.ok(e.v && e.date && e.notes.length >= 1, 'entry ' + e.v + ' has a version, a date and a note');
    for (const n of e.notes) assert.ok(typeof n === 'string' && n.length > 0 && !/["']/.test(n), 'notes use typographic quotes: ' + n);
  }
  assert.equal(log[0].notes[0], 'Esc stays in the game on Bored: it closes windows, deselects, then opens the Menu. Leave with Back to Bored, in the Menu or on the title screen.');
  assert.equal(log[1].notes[0], 'Army upkeep: 2 soldiers per city are free, and each extra one costs its city 1 production a turn.');
  assert.equal(log[2].notes[0], 'How to play has a contents list, like a Civilopedia: sections grouped by topic, a search box, and the section you’re reading highlighted as you scroll.');
  assert.equal(log[3].notes[0], 'A What’s new screen: patch notes for every update, on the title screen and in the Menu.');
  assert.equal(log[5].notes[1], 'Attacking someone you’re at peace with asks “Declare war?” first.');
  assert.equal(log[6].notes[2], 'Saves get real names, like “Qin Shi Huang · Medieval · Turn 42”, with a detail line and your civ’s medallion.');
  assert.equal(log[13].notes[3], '3.0: a research revamp, a science victory, and up to 8 players.');
});

test('Ashcrown 4.6.1: the New tag shows until the notes are opened, never on a first visit, and a new version brings it back', () => {
  const r = notesRig();
  // Someone who has played before (prefs exist) but has not opened these notes: the tag shows, next to the Tutorial's.
  r.store.set(NOTES_PREFS, JSON.stringify({ tips: false, tutorialDone: false }));
  assert.deepEqual(r.title(), { notes: true, tutorial: true });
  assert.equal(r.run('notesNew()'), true);
  // Opening the screen stores the version and takes the tag off at once.
  r.run('showWhatsNew()');
  assert.equal(r.prefs().notesSeen, '4.7.1', 'stored under the prefs key through writePref');
  assert.equal(r.prefs().tips, false, 'the other prefs are left alone');
  assert.equal(r.els['notes-tag'].hidden, true, 'the tag is gone behind the open screen');
  assert.deepEqual(r.title(), { notes: false, tutorial: true }, 'and stays gone');
  assert.equal(r.run('notesNew()'), false);
  // An older stored version brings it back (that is what a new release does).
  r.store.set(NOTES_PREFS, JSON.stringify({ notesSeen: '4.6' }));
  r.run('notesSwitch = null');
  assert.deepEqual(r.title(), { notes: true, tutorial: true });
  // The old localStorage keys are untouched: nothing else was written.
  assert.deepEqual([...r.store.keys()].filter(k => k !== NOTES_PREFS), [], 'only the prefs key holds anything');
});

test('Ashcrown 4.6.1: a first visit (no prefs and no saves) starts with the notes seen, so the Tutorial is the only tag', () => {
  let r = notesRig();
  r.run('firstVisitNotes()');
  assert.equal(r.prefs().notesSeen, '4.7.1');
  assert.deepEqual(r.title(), { notes: false, tutorial: true }, 'no New tag, and the Tutorial tag stays');
  // Prefs but no saves, or saves but no prefs: not new here, so the tag shows.
  r = notesRig();
  r.store.set(NOTES_PREFS, JSON.stringify({ popups: true }));
  r.run('firstVisitNotes()');
  assert.equal(r.prefs().notesSeen, undefined, 'a device with prefs is not a first visit');
  assert.equal(r.title().notes, true);
  r = notesRig();
  r.run('G.watch = false; G.tut = null; saveGame()');
  assert.equal(r.run('slotList().length') > 0, true, 'the game wrote an autosave');
  r.run('firstVisitNotes()');
  assert.equal(r.store.has(NOTES_PREFS), false, 'a device with a save is not a first visit and nothing is written');
  assert.equal(r.title().notes, true);
  // Storage blocked: nothing throws, and the tag still goes for this visit once the notes are opened.
  r = notesRig();
  r.ctx.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => r.run('firstVisitNotes()'));
  assert.equal(r.run('notesNew()'), false, 'blocked storage looks like a first visit: no tag this visit');
  r.run('notesSwitch = null');                       // as if this visit had started on a version that was not seen
  assert.equal(r.run('notesNew()'), true, 'nothing could be kept');
  r.run('refreshNotesTag()');
  assert.equal(r.els['notes-tag'].hidden, false);
  assert.doesNotThrow(() => r.run('showWhatsNew()'));
  assert.equal(r.els['notes-tag'].hidden, true);
  assert.equal(r.run('notesNew()'), false, 'seen for this visit');
});

test('Ashcrown 4.6.1: the What’s new screen opens the newest entry, folds every older one, and the Menu has the same button', () => {
  const r = notesRig();
  r.run('showWhatsNew()');
  const html = r.modals.at(-1);
  assert.match(html, /<h2>What’s new<\/h2><span class="sub">Civ Lite 4\.7\.1<\/span>/, 'head and sub');
  assert.equal(r.run('UI.modalKind'), 'notes');
  assert.ok(html.includes('<h3 class="notes-now">4.7.1 · Nov 9</h3>'), 'the newest entry is open at the top as version · date');
  assert.ok(html.includes('<li>How to play has a contents list, like a Civilopedia: sections grouped by topic, a search box, and the section you’re reading highlighted as you scroll.</li>'));
  assert.ok(html.includes('<li>A What’s new screen: patch notes for every update, on the title screen and in the Menu.</li>'));
  const details = html.match(/<details[^>]*>/g) || [];
  assert.equal(details.length, 13, 'every older entry is a details element');
  assert.ok(details.every(d => d === '<details class="notes-old">'), 'all of them closed');
  assert.ok(html.includes('<summary>4.6.1 · Nov 7</summary>') && html.includes('<summary>4.6 · Nov 7</summary>') && html.includes('<summary>Before 4.0 · Nov 3–4</summary>') && html.includes('<summary>4.2.1–4.2.3 · Nov 6</summary>'));
  assert.ok(html.indexOf('<summary>4.6 · Nov 7</summary>') < html.indexOf('<summary>4.5 · Nov 6</summary>') && html.indexOf('<summary>4.5 · Nov 6</summary>') < html.indexOf('<summary>Before 4.0'), 'newest first');
  assert.equal((html.match(/<li>/g) || []).length, 1 + 4 + 1 + 1 + 5 + 4 + 4 + 2 + 2 + 3 + 3 + 2 + 7 + 4, 'every note is listed once');
  assert.ok(html.includes('Attacking someone you’re at peace with asks “Declare war?” first.'));
  assert.match(html, /<div class="modal-foot"><button class="btn primary" data-act="close">Close<\/button><\/div>/, 'a Close button at the bottom');
  // The in-game Menu opens the same screen and shows no tag.
  r.run('showMenu()');
  const menu = r.modals.at(-1);
  assert.ok(menu.includes('<button class="act" data-act="whats-new">What’s new</button>'), 'the Menu has the button');
  assert.ok(menu.indexOf('data-act="help">How to play') < menu.indexOf('data-act="whats-new"') && menu.indexOf('data-act="whats-new"') < menu.indexOf('data-act="civs"'), 'next to How to play');
  assert.ok(!/class="mi-tag"|class="tag/.test(menu.slice(menu.indexOf('data-act="whats-new"'), menu.indexOf('data-act="civs"'))), 'no tag in the Menu');
  const before = r.modals.length;
  r.run('onAction("whats-new")');
  assert.equal(r.modals.length, before + 1);
  assert.equal(r.modals.at(-1), html, 'the Menu button opens the same screen');
});

/* ── 4.7.1: Esc stays in the game on Bored ────────────────────────────────── */

test('Ashcrown 4.7.1: Back to Bored is in the Menu only when the game is in a frame, and it asks Bored to close the game', () => {
  const r = notesRig();
  const sent = [];
  const win = { postMessage: (data, to) => sent.push([data, to]) };
  r.ctx.window = { parent: win };
  r.run('G.turn = 1');
  assert.equal(r.run('embedded()'), true, 'in a frame');
  r.run('showMenu()');
  const menu = r.modals.at(-1);
  assert.ok(menu.includes('<button class="act" data-act="leave-bored">Back to Bored</button>'), 'the Menu has the button');
  assert.ok(menu.indexOf('data-act="whats-new"') < menu.indexOf('data-act="leave-bored"') && menu.indexOf('data-act="leave-bored"') < menu.indexOf('data-act="civs"'), 'after What’s new');
  r.run('onAction("leave-bored")');
  assert.equal(JSON.stringify(sent), JSON.stringify([[{ type: 'bored:close' }, '*']]), 'the hub gets bored:close, which it already handles');
  // Opened on its own: no button, and a click that somehow arrives does nothing harmful.
  const alone = {};
  alone.parent = alone;
  r.ctx.window = alone;
  alone.postMessage = () => { throw new Error('there is no hub'); };
  assert.equal(r.run('embedded()'), false);
  r.run('showMenu()');
  assert.ok(!r.modals.at(-1).includes('leave-bored'), 'no Back to Bored outside Bored');
  // A browser that will not say counts as embedded (a cross-origin parent can throw).
  r.ctx.window = { get parent() { throw new Error('blocked'); } };
  assert.equal(r.run('embedded()'), true);
  assert.doesNotThrow(() => r.run('leaveBored()'));
});

/* ── 4.6.2: How to play has a contents list ────────────────────────────────── */

const HELP_GROUPS = [
  ['Basics', ['turn', 'cities', 'hex-buildings', 'tiers', 'roads', 'builders']],
  ['Science and resources', ['science', 'era4', 'resources']],
  ['Units and moving', ['moving', 'marches', 'zoc', 'ships']],
  ['War', ['fighting', 'taking-cities', 'declaring-war']],
  ['Diplomacy', ['first-contact', 'borders', 'embassies', 'trading']],
  ['The world', ['maps', 'wonders', 'difficulty']],
  ['Winning', ['winning', 'moments']],
  ['Controls', ['keys']]
];
// civRig plus a stand-in for the few page elements How to play touches: the text pane and a heading per section.
const plain = o => JSON.parse(JSON.stringify(o));
function helpRig() {
  const r = embRig();
  const ids = jsonOf(r, 'helpSections().map(s => s.id)');
  const pane = { scrollTop: 0, scrollHeight: 9000, clientHeight: 500, scrolls: [], scrollTo(o) { this.scrolls.push(o); } };
  const focused = [];
  const sec = id => ({ offsetTop: ids.indexOf(id) * 300 + 40, querySelector: () => ({ focus: o => focused.push([id, o]) }) });
  r.els = { 'help-text': pane, 'help-search': { value: '' }, 'help-list': { innerHTML: '', querySelectorAll: () => [] }, 'help-toc': { classList: { contains: () => false, toggle() {} } } };
  r.ctx.document = { getElementById: id => (id.startsWith('help-sec-') ? sec(id.slice(9)) : r.els[id] || null), querySelector: () => null };
  r.sizes = [];
  r.ctx.openModal = (html, size) => { r.modals.push(html); r.sizes.push(size); };
  r.pane = pane;
  r.focused = focused;
  r.top = id => ids.indexOf(id) * 300 + 40 - 8;
  r.run('UI = { modalKind: null, coach: { hidden: true }, coachTag: {}, coachCount: {}, coachSay: {}, coachActions: {} }');
  return r;
}

test('Ashcrown 4.6.2: How to play is one list of sections, grouped, and the old text is only reordered', () => {
  const r = helpRig();
  const secs = jsonOf(r, 'helpSections()');
  assert.equal(r.run('VERSION'), '4.7.1');
  assert.equal(secs.length, 26);
  assert.equal(new Set(secs.map(s => s.id)).size, 26, 'ids are unique');
  assert.deepEqual([...new Set(secs.map(s => s.group))], HELP_GROUPS.map(g => g[0]), 'the groups, in order');
  for (const [group, ids] of HELP_GROUPS) assert.deepEqual(secs.filter(s => s.group === group).map(s => s.id), ids, group);
  assert.deepEqual(secs.filter(s => ['turn', 'era4', 'declaring-war', 'borders', 'maps', 'moments'].includes(s.id)).map(s => s.title),
    ['A turn', 'Era 4 is shuffled', 'Declaring war with an order', 'Borders and the Council', 'Maps and continents', 'Historic moments']);
  for (const s of secs) {
    assert.ok(s.title && s.html.startsWith('<p>') && s.html.endsWith('</p>'), s.id + ' has a title and its paragraph');
    assert.ok(!/<h[1-6]/.test(s.html), s.id + ' leaves the heading to the page');
  }
  assert.ok(secs.find(s => s.id === 'keys').html.startsWith('<p>Like Civ 6: <b>right-click</b> sends the selected unit'), 'text kept as it was');
  assert.ok(secs.find(s => s.id === 'embassies').html.includes('<b>Embassy</b> (30 production)'));
});

test('Ashcrown 4.6.2: the page lists every group and section, and showHelp(id) opens at that section', () => {
  const r = helpRig();
  r.run('showHelp()');
  const html = r.modals.at(-1);
  assert.equal(r.sizes.at(-1), 'wide help', 'a wide modal with the help class');
  assert.equal(r.run('UI.modalKind'), 'help');
  assert.match(html, /<h2>How to play<\/h2>/);
  assert.ok(html.includes('data-act="help-contents"') && html.includes('>Contents</button>'), 'the Contents button for narrow screens');
  assert.ok(html.includes('id="help-search"') && html.includes('placeholder="Search the rules"'), 'the search box');
  assert.deepEqual((html.match(/<h2 class="help-group">[^<]*/g) || []).map(h => h.replace(/<[^>]*>/, '')), HELP_GROUPS.map(g => g[0]), 'a heading above each group of text');
  assert.deepEqual((html.match(/<div class="help-label">[^<]*/g) || []).map(h => h.replace(/<[^>]*>/, '')), HELP_GROUPS.map(g => g[0]), 'and a small label in the contents');
  const all = HELP_GROUPS.flatMap(g => g[1]);
  assert.deepEqual((html.match(/<section class="help-sec" id="help-sec-[^"]*"><h3 tabindex="-1">/g) || []).map(s => s.match(/help-sec-([^"]*)/)[1]), all, 'every section, headed so focus can land on it');
  assert.deepEqual((html.match(/data-act="help-go:[^"]*"/g) || []).map(s => s.slice(18, -1)), all, 'a link for each');
  assert.equal(r.pane.scrolls.length, 0, 'no id, no jump');
  assert.equal(html.match(/class="help-link on"/g).length, 1, 'one link is marked: the first section');
  assert.ok(html.includes('class="help-link on" type="button" data-act="help-go:turn"'));
  // An id opens straight at the section: instant, heading focused. An unknown id just opens it.
  r.run('showHelp("borders")');
  assert.deepEqual(plain(r.pane.scrolls.at(-1)), { top: r.top('borders'), behavior: 'auto' });
  assert.equal(r.focused.at(-1)[0], 'borders');
  assert.deepEqual(plain(r.focused.at(-1)[1]), { preventScroll: true });
  assert.equal(r.run('UI.helpCur'), 'borders');
  const jumps = r.pane.scrolls.length;
  r.run('showHelp("nope")');
  assert.equal(r.pane.scrolls.length, jumps);
  // The menu items still open it with no id.
  r.run('onAction("help")');
  assert.equal(r.pane.scrolls.length, jumps);
  assert.equal(r.run('UI.helpCur'), 'turn');
});

test('Ashcrown 4.6.2: a jump is smooth unless Animation is off, and the heading takes focus', () => {
  const r = helpRig();
  r.run('showHelp()');
  r.act('help-go:ships');
  assert.deepEqual(plain(r.pane.scrolls.at(-1)), { top: r.top('ships'), behavior: 'smooth' });
  assert.deepEqual(r.focused.at(-1)[0], 'ships');
  assert.equal(r.run('UI.helpCur'), 'ships', 'marked at once');
  r.run('setAnim("none")');
  r.act('help-go:keys');
  assert.deepEqual(plain(r.pane.scrolls.at(-1)), { top: r.top('keys'), behavior: 'auto' }, 'instant with Animation off');
  assert.equal(r.run('UI.helpAim'), null);
  // The last section can always be brought to the top: the target never goes past the end of the text.
  r.pane.scrollHeight = 5000;
  r.act('help-go:keys');
  assert.equal(r.pane.scrolls.at(-1).top, 4500, 'clamped to the end of the pane');
});

test('Ashcrown 4.6.2: search matches the title or the text, every word, any case, and a group with no match is hidden', () => {
  const r = helpRig();
  const ids = q => jsonOf(r, 'helpMatches(' + JSON.stringify(q) + ').map(s => s.id)');
  assert.equal(ids('').length, 26, 'an empty search is everything');
  assert.deepEqual(ids('zone control'), ['zoc'], 'two words, both needed');
  assert.deepEqual(ids('ZONE'), ids('zone'), 'case does not matter');
  assert.ok(ids('zone').includes('zoc'));
  assert.deepEqual(ids('borders').filter(x => x === 'borders'), ['borders'], 'a title word');
  const text = ids('horse');
  assert.ok(text.includes('resources') && text.includes('fighting') && text.includes('trading'), 'a word in the text finds the section: ' + text);
  assert.ok(!text.includes('keys') && !text.includes('maps'));
  assert.deepEqual(ids('<b>'), [], 'tags are not text');
  assert.deepEqual(ids('xyzzy'), []);
  // The list keeps the page's order, shows only groups that still have a match, and marks the section being read.
  r.run('UI.helpCur = "trading"');
  const list = r.run('helpListHtml(helpMatches("embassy"))');
  assert.deepEqual((list.match(/<div class="help-label">[^<]*/g) || []).map(h => h.replace(/<[^>]*>/, '')), ['Diplomacy']);
  assert.ok(!list.includes('help-go:turn'), 'sections with no match are gone');
  assert.ok(list.includes('data-act="help-go:embassies"'));
  assert.ok(!list.includes('help-link on'), 'the section being read is not in this list, so nothing is marked');
  const full = r.run('helpListHtml(helpSections())');
  assert.ok(full.includes('<button class="help-link on" type="button" data-act="help-go:trading" aria-current="location">Trading</button>'));
  assert.equal(full.match(/aria-current/g).length, 1);
  assert.equal(r.run('helpListHtml(helpMatches("xyzzy"))'), '<p class="help-none">No section mentions that.</p>');
  // Typing filters the list in place.
  r.els['help-list'].innerHTML = '';
  r.run('helpFilter("horse")');
  assert.deepEqual((r.els['help-list'].innerHTML.match(/help-go:[a-z0-9-]+/g) || []).map(s => s.slice(8)), text);
});

test('Ashcrown 4.6.2: Enter jumps to the first match, Escape clears the search and the next Escape is left to close', () => {
  const r = helpRig();
  r.run('showHelp()');
  const box = r.els['help-search'];
  const key = (k, target) => { const e = { key: k, target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; r.ctx.ev = e; r.run('helpKey(ev)'); return e; };
  box.value = 'horse';
  key('Enter', box);
  assert.equal(r.focused.at(-1)[0], 'builders', 'the first match in page order');
  assert.equal(r.pane.scrolls.at(-1).top, r.top('builders'));
  box.value = 'xyzzy';
  const n = r.pane.scrolls.length;
  key('Enter', box);
  box.value = '   ';
  key('Enter', box);
  assert.equal(r.pane.scrolls.length, n, 'nothing to jump to');
  // Escape: first the search is cleared and the whole contents is back.
  box.value = 'horse';
  r.els['help-list'].innerHTML = 'filtered';
  const first = key('Escape', box);
  assert.equal(box.value, '');
  assert.equal(first.prevented && first.stopped, true, 'handled: the modal stays open');
  assert.equal((r.els['help-list'].innerHTML.match(/help-go:/g) || []).length, 26, 'the contents is whole again');
  assert.equal(r.run('helpEscape()'), false, 'the second Escape is not ours: it closes the modal');
});

test('Ashcrown 4.6.2: the closing tip links to How borders work, and nothing else gets a link', () => {
  const r = helpRig();
  assert.deepEqual(jsonOf(r, 'TIPS.filter(t => t.help).map(t => [t.id, t.help, t.helpLabel])'), [['closing', 'borders', 'How borders work']]);
  r.city(0, 3, 5);
  r.unit(1, 'warrior', 4, 5);
  r.meetOnly(0, 1);
  r.run('pl(0).techs = pl(0).techs.filter(t => t !== "earlyempire")');
  assert.equal(r.run('currentTip() && currentTip().tip.id'), 'closing', 'a stranger on your land brings the tip up');
  r.run('renderCoach()');
  const actions = r.run('UI.coachActions.innerHTML');
  assert.ok(actions.includes('<button class="act" data-act="help:borders">How borders work</button>'), 'the link');
  assert.ok(actions.indexOf('data-act="tip-ok:closing"') < actions.indexOf('data-act="help:borders"') && actions.indexOf('data-act="help:borders"') < actions.indexOf('data-act="tips-off"'), 'between Got it and Turn tips off');
  assert.ok(r.run('UI.coachSay.innerHTML').includes('Early Empire is a cheap tech that closes your borders'), 'the tip text is unchanged');
  // The button opens How to play at Borders and the Council. It also works from the title screen, where there is no game.
  r.act('help:borders');
  assert.deepEqual(plain(r.pane.scrolls.at(-1)), { top: r.top('borders'), behavior: 'auto' }, 'it opens right there');
  assert.equal(r.run('UI.helpCur'), 'borders');
  assert.equal(r.run('UI.modalKind'), 'help');
  r.run('G = null');
  r.act('help:keys');
  assert.equal(r.focused.at(-1)[0], 'keys');
});

/* ── 4.7: army upkeep, obsolete warriors, CPUs that attack with a plan, stalemates, who is at war ── */

test('Ashcrown 4.7: 2 soldiers per city are free, and each extra one costs its home city 1 production, never below 0', () => {
  const r = ordersRig();
  const a = r.city(0, 4, 5), b = r.city(0, 10, 9);
  for (let k = 0; k < 4; k++) r.unit(0, 'warrior', 5 + k, 6);
  assert.equal(r.run('armyFree(0)'), 4);
  assert.equal(r.run('upkeepCharges(0).size'), 0, '4 soldiers for 2 cities cost nothing');
  r.unit(0, 'warrior', 5, 7); r.unit(0, 'warrior', 6, 7);
  const charged = r.run('[...upkeepCharges(0).values()].reduce((n, k) => n + k, 0)');
  assert.equal(charged, 2, '6 soldiers for 2 cities: 2 pay');
  const cost = r.run('cityYields(cityAt(4, 5)).armyCost + cityYields(cityAt(10, 9)).armyCost');
  assert.equal(cost, 2, 'and the cities pay it in production');
  assert.ok(r.run('cityYields(cityAt(4, 5)).prod') >= 0 && r.run('cityYields(cityAt(10, 9)).prod') >= 0, 'never below 0');
  assert.ok(r.run('realmPanel()').includes('Army: 6 units, 4 free, upkeep 2 production a turn.'), 'the realm panel says so');
  void a; void b;
});

test('Ashcrown 4.7: warriors cost 30 and are not offered once you know Iron Working', () => {
  const r = ordersRig();
  r.city(0, 4, 5);
  assert.equal(r.run('UNITS.warrior.cost'), 30);
  assert.equal(r.run('UNITS.terracotta.cost'), 30, 'the Terracotta Warrior follows the warrior');
  assert.equal(r.run('buildProblem(cityAt(4, 5), { kind: "unit", id: "warrior" })'), '');
  r.run('pl(0).techs.push("mining", "bronze", "ironworking")');
  assert.equal(r.run('buildProblem(cityAt(4, 5), { kind: "unit", id: "warrior" })'), 'Obsolete after Iron Working');
  assert.equal(r.run('unlockedFor(0, UNITS.warrior)'), false, 'so the build list hides it');
  assert.equal(r.run('unlockedFor(0, UNITS.spearman)'), true);
});

test('Ashcrown 4.7: a CPU only goes for a city when its force nearby is clearly stronger, with archers once it can build them', () => {
  const r = ordersRig();
  r.city(1, 10, 5);
  r.war(3, 1);
  const ready = () => r.run('aiReadyFor(pl(3), cityAt(10, 5), ownUnits(3).filter(u => isMil(u.type)))');
  r.unit(3, 'warrior', 8, 5); r.unit(3, 'warrior', 8, 6);
  assert.equal(r.run('cityStrength(cityAt(10, 5))'), 28);
  assert.equal(ready(), false, '40 strength against a city holding 28: not enough');
  r.unit(3, 'warrior', 8, 4);
  assert.equal(ready(), true, '60 is at least 1.5 times 28');
  r.run('pl(3).techs.push("archery")');
  assert.equal(ready(), false, 'once it can build archers, one must come');
  r.unit(3, 'archer', 7, 5);
  assert.equal(ready(), true);
  r.unit(1, 'swordsman', 11, 5);
  assert.equal(ready(), false, 'a swordsman next to the city counts too: 85 against 1.5 times 63');
});

test('Ashcrown 4.7: 20 turns of war with no city changing hands is a stalemate, and the CPU wants peace', () => {
  const r = ordersRig();
  r.war(2, 3);
  r.run('G.turn = 40; G.warSince[2][3] = G.warSince[3][2] = 30');
  assert.equal(r.run('stalemate(2, 3)'), false, '10 turns is not yet');
  r.run('G.warSince[2][3] = G.warSince[3][2] = 20');
  assert.equal(r.run('stalemate(2, 3)'), true, '20 turns with nothing taken');
  assert.equal(r.run('aiWantsPeace(pl(2), pl(3))'), true);
  r.run('noteTake(3, 2)');
  assert.equal(r.run('stalemate(2, 3)'), false, 'a city that just changed hands resets it');
  assert.equal(r.run('stalemate(0, 1)'), false, 'at peace is never a stalemate');
});

test('Ashcrown 4.7: the Council and the realm panel show who is at war with whom, without naming civs you have not met', () => {
  const r = ordersRig();
  r.run('G.met = G.players.map(a => G.players.map(b => a.i === b.i))');
  r.war(2, 3);
  r.meetOnly(0, 2);
  r.seat(0);
  assert.equal(r.run('warLine(0, pl(2))'), 'At war with: 1 civ you haven’t met');
  assert.equal(r.run('warsList(0).length'), 0, 'a war with a civ you have not met is not listed');
  r.meetOnly(0, 3);
  assert.equal(r.run('warLine(0, pl(2))'), 'At war with: Japan');
  assert.equal(r.run('warLine(0, pl(1))'), 'At peace with everyone');
  assert.equal(r.run('warsList(0).map(w => w.a.i + "-" + w.b.i).join()'), '2-3');
  r.run('showCouncil()');
  const html = r.modals.at(-1);
  assert.ok(html.includes('<h3>Wars</h3>') && html.includes('China') && html.includes('Since turn'), 'the Wars list');
  assert.ok(html.includes('At war with: Japan'), 'and the line on China’s row');
  assert.ok(r.run('realmPanel()').includes('At war with: China'), 'the realm panel too');
});


test('A Bored Together match never writes the arcade best a solo game reads', () => {
  // 2048 (a duel) and the native arcade games keep their best in `bored.best.*`,
  // which the solo game and the hub high score both read. A match is somebody
  // else's run: it must not replace that key in either match mode.
  const source = load('src/games/arcade.js');
  const store = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value))
    },
    window: {}
  });
  vm.runInContext(extractFunction(source, 'inMatch') + '\n' + extractFunction(source, 'write'), context);
  context.write('2048', 12);
  assert.equal(store.get('bored.best.2048'), '12', 'solo play keeps its best');
  context.window.__boredTogether = { context: {} };
  context.write('2048', 40);
  assert.equal(store.get('bored.best.2048'), '12', 'a turns match never overwrites it');
  context.window.__boredTogether = null;
  context.window.__boredSeed = { seed: 7, match: true };
  context.write('2048', 99);
  assert.equal(store.get('bored.best.2048'), '12', 'a duel never overwrites it');
});

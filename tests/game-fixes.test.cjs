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
    MAP_TYPES: { pangaea: { name: 'Pangaea' } },
    CIVS: { rome: { land: 'Rome' }, carthage: { land: 'Carthage' } },
    LEVELS: { normal: {}, deity: {} },
    toast: () => {}, slotAction: () => {}, closeModal: () => {},
    G: null
  });
  const prelude = html.match(/const SLOT_PREFIX[\s\S]*?let slotMode[^\n]*\n/)[0];
  const names = ['slotKind', 'describeSave', 'defaultSaveName', 'cleanSaveName', 'slotHeader', 'validState', 'slotHead', 'slotRead',
    'slotRemove', 'slotWrite', 'moveOldSave', 'slotList', 'saveGame', 'clearSave', 'autosave', 'rollTurnSave', 'whyNotSave',
    'saveToSlot', 'quickSave', 'loadSlot', 'agoText'];
  vm.runInContext('var online = null;\n' + prelude +
    'function resumeState(state) { G = state; resumed.push(state); }\nvar resumed = [];\n' +
    names.map(name => extractFunction(html, name)).join('\n'), ctx);
  const game = (extra = {}) => ({
    v: 4, cols: 2, rows: 2, tiles: [{}, {}, {}, {}], units: [], cities: [], conts: [], map: 'pangaea', level: 'normal',
    players: [{ name: 'Marcus', civ: 'rome', human: true, techs: [] }, { name: 'Dido', civ: 'carthage', human: false, techs: [] }],
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
  assert.equal(r.head('auto').meta, 'Marcus vs Dido · pangaea · turn 4');
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
  assert.equal(r.ctx.saveToSlot('m3', '').name, 'Rome, turn 8', 'an empty name falls back to "<civ>, turn N"');
  assert.equal(r.ctx.saveToSlot('m3', 'x'.repeat(80)).name.length, 28, 'names are capped');
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
  assert.equal(ago(3 * 60_000), '3 min ago');
  assert.equal(ago(60 * 60_000), '1 hour ago');
  assert.equal(ago(5 * 3600_000), '5 hours ago');
  assert.equal(ago(3 * 86400_000), '3 days ago');
  assert.match(ago(0, 10 * 86400_000 - 0) , /just now/);
  assert.match(r.ctx.agoText(0, 400 * 86400_000), /\d/, 'a very old save shows a date');
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
    SEATS: Array.from({ length: 8 }, (x, i) => ({ name: 'Player ' + (i + 1) })), DEFAULT_CLOSE_TURN: 30 });
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
  const order = ['btn-continue', 'btn-new', 'btn-load', 'btn-tutorial', 'btn-civs', 'btn-help', 'btn-options'];
  const at = order.map(id => title.indexOf('id="' + id + '"'));
  assert.ok(at.every(n => n > 0) && at.every((n, i) => !i || n > at[i - 1]), 'title menu: Continue, New game, Load game, Tutorial, Civs, How to play, Options');
  for (const [id, act] of [['btn-new', 'title-new'], ['btn-load', 'slots:load'], ['btn-tutorial', 'tut-start'], ['btn-civs', 'civs'], ['btn-help', 'help'], ['btn-options', 'options']]) {
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
  for (const kind of ['civs', 'help', 'options', 'title-new', 'title-back', 'setup-reset', 'tut-start']) {
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
    optLevel: { value: 'deity', selectedIndex: 1 }, optClose: { value: '60' }, optTurns: { value: '7' },
    optConquest: { checked: false }, optScience: { checked: false }, optWrap: { checked: true } };
  for (let i = 0; i < 8; i++) {
    r.doc.getElementById('seat-civ-' + i).value = 'rome';
    Object.assign(r.doc.getElementById('seat-name-' + i), { value: 'Zed', dataset: { edited: '1' } });
  }
  r.ctx.resetSetup();
  const u = r.ctx.UI;
  assert.deepEqual([u.optHumans.value, u.optCpus.value, u.optMap.value, u.optSize.value, u.optLevel.selectedIndex, u.optClose.value, u.optTurns.value],
    ['2', '0', 'pangaea', 'auto', 0, '30', '100']);
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
  const els = { 'continue-sub': mk(), 'load-sub': mk(), 'tut-tag': mk(), 'tut-sub': mk() };
  r.ctx.document = { getElementById: id => els[id] };
  r.ctx.UI = { btnContinue: mk(), btnLoad: mk(), btnNew: mk() };
  r.ctx.tutorialDone = () => false;
  r.ctx.TUT_STEPS = new Array(7).fill(0);
  r.ctx.plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  vm.runInContext(extractFunction(html, 'refreshTitle'), r.ctx);
  // Nothing saved: only New game.
  r.ctx.refreshTitle();
  assert.equal(r.ctx.UI.btnContinue.hidden, true);
  assert.equal(r.ctx.UI.btnLoad.hidden, true);
  assert.equal(r.ctx.UI.btnNew.classList.on.primary, true, 'New game is the highlighted item');
  assert.equal(els['tut-tag'].hidden, false, 'the Tutorial is flagged as the place to start');
  assert.equal(els['tut-sub'].textContent, '7 short steps on a small island, playing Rome');
  // An autosave: Continue names the game and when, and takes the highlight.
  r.ctx.G = r.game();
  assert.equal(r.ctx.saveGame(), true);
  r.tick(5 * 60_000);
  r.ctx.tutorialDone = () => true;
  r.ctx.refreshTitle();
  assert.equal(r.ctx.UI.btnContinue.hidden, false);
  assert.equal(els['continue-sub'].textContent, 'Marcus vs Dido · pangaea · turn 4 · 5 min ago');
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

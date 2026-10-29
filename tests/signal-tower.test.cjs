'use strict';
// Signal Tower is a simulation with no browser to watch it in, so this boots the
// real document in a VM with a stub DOM, plays it to the end and fails on any
// exception or broken contract. It is the only check that proves the waves,
// counters and upgrade paths actually run.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(resolve(__dirname, '../src/games/content/signal-tower.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function element(id) {
  return {
    id, textContent: '', title: '', disabled: false, hidden: false, onclick: null,
    dataset: {}, attributes: {}, listeners: {}, style: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] === undefined ? null : this.attributes[name]; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 576, height: 384 }; }
  };
}

function context2d() {
  const draw = {};
  for (const name of ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo',
    'arc', 'fill', 'stroke', 'save', 'restore', 'setLineDash', 'fillText', 'translate', 'rotate', 'scale']) {
    draw[name] = () => {};
  }
  return draw;
}

function boot() {
  const elements = new Map();
  const buttons = [...html.matchAll(/data-tower="([a-z-]+)"/g)].map(match => {
    const node = element('tower-' + match[1]);
    node.dataset.tower = match[1];
    return node;
  });
  const canvas = element('board');
  const size = html.match(/<canvas[^>]*width="(\d+)"[^>]*height="(\d+)"/);
  canvas.width = Number(size[1]);
  canvas.height = Number(size[2]);
  canvas.getContext = () => context2d();
  elements.set('board', canvas);
  const document = {
    listeners: {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    querySelectorAll(selector) { return selector === '[data-tower]' ? buttons : []; },
    addEventListener(type, fn) { document.listeners[type] = fn; }
  };
  const sandbox = { document, console, performance: { now: () => 0 }, requestAnimationFrame: () => 1 };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(script, context, { filename: 'signal-tower.html' });
  const run = code => vm.runInContext(code, context);
  return {
    run,
    snapshot: () => run('__boredSnapshot()'),
    state: () => run('({ phase, wave, credits, integrity, over, victory, cleared, kills, leaked, towers: towers.length, enemies: enemies.length })'),
    build: (slug, col, row) => {
      const button = buttons.find(node => node.dataset.tower === slug);
      assert.ok(button, 'no button for ' + slug);
      // The palette button toggles, so only press it when this type is not already held.
      if (run('selectedType') !== slug) button.onclick();
      canvas.listeners.pointerdown({ clientX: (col + 0.5) * 32, clientY: (row + 0.5) * 32 });
    },
    click: (col, row) => canvas.listeners.pointerdown({ clientX: (col + 0.5) * 32, clientY: (row + 0.5) * 32 })
  };
}

test('signal tower: every element the script reaches for exists', () => {
  const ids = new Set([...script.matchAll(/\$\('([a-z-]+)'\)/g)].map(match => match[1]));
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), 'missing element #' + id);
  assert.match(html, /<title>Signal Tower<\/title>/);
  assert.equal(/^https?:\/\//m.test(script), false, 'the game must not call out');
  assert.equal(/localStorage|sessionStorage/.test(script), false, 'the game must not use storage');
});

test('signal tower: the field is 18 by 12 and terrain stays off the track', () => {
  const game = boot();
  const layout = game.run('({ cols: COLS, rows: ROWS, width: canvas.width, height: canvas.height, length: pathLength })');
  assert.equal(layout.cols, 18);
  assert.equal(layout.rows, 12);
  assert.equal(layout.width, 576);
  assert.equal(layout.height, 384);
  assert.ok(layout.length > 40 * 32, 'the track should be long enough to matter');
  const clashes = game.run('[...RIDGES, ...MARSH].filter(key => pathCells.has(key))');
  assert.deepEqual([...clashes], [], 'terrain must not sit on the track');
});

test('signal tower: the starting snapshot reads zero, never null', () => {
  const game = boot();
  const snapshot = game.snapshot();
  assert.equal(snapshot.slug, 'signal-tower');
  assert.equal(snapshot.waves, 0);
  assert.equal(snapshot.kills, 0);
  assert.equal(snapshot.points, 0);
  assert.equal(snapshot.finished, false);
  assert.equal(snapshot.won, false);
});

test('signal tower: building refuses the track, marsh and an empty purse', () => {
  const game = boot();
  game.build('pulse', 2, 1);
  assert.equal(game.state().towers, 0, 'track cell refused');
  game.build('pulse', 2, 0);
  assert.equal(game.state().towers, 0, 'marsh cell refused');
  const before = game.state().credits;
  game.build('pulse', 5, 2);
  assert.equal(game.state().towers, 1);
  assert.equal(game.state().credits, before - 40);
  game.click(5, 2);
  assert.equal(game.state().towers, 1, 'clicking a built cell selects instead of stacking');
  game.run('credits = 0');
  game.build('pulse', 6, 2);
  assert.equal(game.state().towers, 1, 'no credits means no tower');
});

test('signal tower: upgrades, targeting and selling all move the ledger', () => {
  const game = boot();
  game.build('arc', 5, 2);
  game.run('credits = 500');
  const spent = game.state().credits;
  game.run('upgrade()');
  const upgraded = game.run('({ level: selected.level, credits })');
  assert.equal(upgraded.level, 2);
  assert.ok(upgraded.credits < spent, 'an upgrade costs credits');
  game.run('cycleTarget()');
  assert.equal(game.run('selected.targetMode'), 'last');
  game.run('cycleTarget()');
  assert.equal(game.run('selected.targetMode'), 'strong');
  game.run('sell()');
  assert.equal(game.state().towers, 0);
  assert.ok(game.state().credits > upgraded.credits, 'selling refunds part of the spend');
});

test('signal tower: every threat is deployed somewhere in the table', () => {
  const game = boot();
  const report = game.run(`(() => {
    const used = new Set();
    for (const plan of WAVES) for (const [type] of plan.units) used.add(type);
    return { waves: WAVES.length, missing: Object.keys(ENEMIES).filter(type => !used.has(type)),
             mods: WAVES.map(plan => plan.mod).filter(Boolean) };
  })()`);
  assert.equal(report.waves, 30);
  assert.deepEqual([...report.missing], [], 'every threat appears in the table');
  assert.ok(report.mods.length >= 3, 'the field modifiers are used');
});

test('signal tower: a funded line survives deep into the waves without throwing', () => {
  const game = boot();
  game.run('credits = 100000');
  const spots = [
    ['pulse', 5, 2], ['pulse', 5, 4], ['frost', 3, 4], ['mortar', 3, 7],
    ['arc', 9, 5], ['arc', 9, 3], ['flak', 9, 2], ['flak', 12, 5],
    ['radar', 8, 6], ['radar', 13, 7], ['mortar', 12, 9], ['pulse', 13, 4],
    ['arc', 16, 5], ['flak', 14, 8]
  ];
  for (const [slug, col, row] of spots) {
    game.build(slug, col, row);
    for (let level = 0; level < 3; level++) game.run('upgrade()');
  }
  assert.ok(game.state().towers >= 12, 'the line got built');

  let guard = 0;
  while (!game.state().over && guard < 4000) {
    game.run('for (let i = 0; i < 100; i++) update(0.05)');
    guard++;
  }
  const final = game.state();
  assert.equal(final.over, true, 'the run must end');
  assert.ok(final.wave >= 10, 'the run reached the late waves, stopped on ' + final.wave);
  assert.ok(final.kills > 0, 'enemies were actually stopped');

  const snapshot = game.snapshot();
  assert.equal(snapshot.finished, true);
  assert.ok(Number.isInteger(snapshot.points) && snapshot.points > 0);
  assert.ok(snapshot.points >= snapshot.waves * 120, 'the score keeps the waves it cleared');
  game.run('draw()');
});

test('signal tower: abilities, repair and pause all take effect', () => {
  const game = boot();
  game.run('credits = 1000; startWave(true); for (let i = 0; i < 240; i++) update(0.05)');
  assert.ok(game.run('enemies.length') > 0, 'the wave is on the field');

  game.run("useAbility('overcharge')");
  assert.ok(game.run('ABILITIES.overcharge.cd') > 0, 'overcharge goes on cooldown');
  assert.ok(game.run('overchargeUntil > clock'), 'overcharge lifts the fire rate');

  game.run("useAbility('cryo')");
  assert.ok(game.run('ABILITIES.cryo.cd') > 0);
  assert.equal(game.run('enemies.every(e => e.frozenUntil > clock)'), true, 'cryo freezes the field');

  game.run("useAbility('strike')");
  assert.equal(game.run('strikeArmed'), true, 'strike waits for a target');
  game.click(5, 9);
  assert.ok(game.run('ABILITIES.strike.cd') > 0, 'a landed strike goes on cooldown');
  assert.equal(game.run('strikeArmed'), false);

  game.run('finish(false)');
  const before = game.run('clock');
  game.run('paused = true; update(1)');
  assert.equal(game.run('clock'), before, 'a paused game does not advance');
});

test('signal tower: repairing only works between waves and never past the cap', () => {
  const game = boot();
  game.run('credits = 1000; integrity = 10');
  game.run('repair()');
  assert.equal(game.run('integrity'), 12);
  game.run('integrity = 20');
  const spent = game.run('credits');
  game.run('repair()');
  assert.equal(game.run('credits'), spent, 'a sound receiver costs nothing');
  game.run('integrity = 10; phase = "wave"');
  game.run('repair()');
  assert.equal(game.run('integrity'), 10, 'no repairs mid-wave');
});

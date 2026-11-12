'use strict';
// Chess has no browser suite of its own. This boots the real document in a VM
// with a stub DOM and checks the setup overlay gates play, the difficulty
// selector follows the player choice, and New game returns to the overlay.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(resolve(__dirname, '../src/games/content/chess.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function element(id) {
  return {
    id, textContent: '', hidden: false, disabled: false, value: '', type: '', className: '',
    dataset: {}, attributes: {}, children: [], onclick: null, onchange: null, listeners: {},
    replaceChildren() { this.children.length = 0; },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    classList: { add() {} },
    closest() { return null; }
  };
}

function boot() {
  const nodes = {};
  for (const id of ['hud', 'board', 'status', 'hint', 'new', 'mode', 'level', 'setup', 'begin', 'level-field']) {
    nodes[id] = element(id);
  }
  const document = {
    querySelector(selector) { return nodes[selector.slice(1)] || null; },
    createElement() { return element('square'); }
  };
  const sandbox = { document, console, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(script, context, { filename: 'chess.html' });
  const run = code => vm.runInContext(code, context);
  return {
    nodes,
    run,
    state: () => ({ ...run('__test.state()') }),
    snapshot: () => ({ ...run('__boredSnapshot()') }),
    click: index => nodes.board.listeners.click({
      target: { closest: () => ({ dataset: { index: String(index) } }) }
    })
  };
}

// e2 and e4 on the 8x8 grid.
const E2 = 52, E4 = 36;

test('chess: the setup overlay gates play until players are chosen', () => {
  const game = boot();
  assert.equal(game.nodes.setup.hidden, false, 'the overlay is up on arrival');
  assert.equal(game.nodes.begin.disabled, true, 'no start without a choice');
  assert.equal(game.nodes['level-field'].hidden, true, 'difficulty waits for the CPU choice');
  assert.equal(game.nodes.mode.value, '');

  game.click(E2);
  game.click(E4);
  assert.equal(game.state().plies, 0, 'the board is locked behind the overlay');
  assert.equal(game.state().started, false);
  assert.equal(game.snapshot().cpu, false);

  game.nodes.mode.value = 'friend';
  game.nodes.mode.onchange();
  assert.equal(game.nodes.begin.disabled, false);
  assert.equal(game.nodes['level-field'].hidden, true, 'two players has no difficulty');

  game.nodes.begin.onclick();
  assert.equal(game.nodes.setup.hidden, true);
  assert.equal(game.state().started, true);
  game.click(E2);
  game.click(E4);
  assert.equal(game.state().plies, 1, 'the board opens after Start game');
  assert.equal(game.snapshot().cpu, false);
});

test('chess: choosing the CPU reveals difficulty and starts the engine at that level', async () => {
  const game = boot();
  game.nodes.mode.value = 'computer';
  game.nodes.mode.onchange();
  assert.equal(game.nodes['level-field'].hidden, false);
  assert.equal(game.nodes.begin.disabled, false);

  game.nodes.level.value = 'hard';
  game.nodes.begin.onclick();
  assert.equal(game.nodes.setup.hidden, true);
  assert.equal(game.run('levelEl.value'), 'hard');

  game.click(E2);
  game.click(E4);
  assert.equal(game.state().plies, 1);
  assert.equal(game.snapshot().cpu, true);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(game.state().plies, 2, 'the computer answered');

  game.nodes.new.onclick();
  assert.equal(game.nodes.setup.hidden, false, 'New game asks again');
  assert.equal(game.nodes.mode.value, '');
  assert.equal(game.nodes.begin.disabled, true);
  assert.equal(game.state().plies, 0);
  assert.equal(game.state().started, false);
});

test('chess: each level carries its measured rating, in the picker and the HUD', () => {
  const game = boot();
  const ratings = game.run('JSON.stringify(RATING)');
  assert.deepEqual(JSON.parse(ratings), { easy: 700, medium: 1050, hard: 1250 });

  game.nodes.mode.value = 'computer';
  game.nodes.level.value = 'hard';
  game.nodes.begin.onclick();
  assert.match(game.nodes.hud.textContent, /vs computer \u00b7 hard \u00b7 1250/);

  game.nodes.level.value = 'easy';
  game.nodes.new.onclick();
  game.nodes.mode.value = 'computer';
  game.nodes.level.value = 'easy';
  game.nodes.begin.onclick();
  assert.match(game.nodes.hud.textContent, /\u00b7 easy \u00b7 700/);
});

test('chess: a restored saved game skips the overlay and keeps its difficulty', () => {
  const game = boot();
  const saved = {
    label: 'Move 3 · vs computer',
    state: {
      board: game.state().board, turn: 'w',
      castling: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, full: 1,
      mode: 'computer', level: 'easy', plies: 4, wins: 1
    }
  };
  assert.equal(game.run(`restoreRun(${JSON.stringify(saved)})`), true);
  assert.equal(game.nodes.setup.hidden, true);
  assert.equal(game.state().started, true);
  assert.equal(game.nodes.mode.value, 'computer');
  assert.equal(game.nodes.level.value, 'easy');
  assert.equal(game.state().wins, 1);
  game.click(E2);
  game.click(E4);
  assert.ok(game.state().plies > 4, 'the restored board is playable');
});

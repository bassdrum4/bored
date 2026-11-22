'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const html = readFileSync(resolve(__dirname, '../src/games/content/scrabble.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function element() {
  return {
    children: [], dataset: {}, classList: { add() {} },
    hidden: false, disabled: false, value: '', textContent: '',
    replaceChildren(...children) { this.children = children; },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute() {},
    addEventListener(type, fn) { this['on_' + type] = fn; },
    closest() { return null; }
  };
}

function boot(saved = null) {
  const nodes = {};
  const document = {
    querySelector(selector) {
      const id = selector.slice(1);
      return nodes[id] || (nodes[id] = element());
    },
    createElement: element,
    createDocumentFragment: element
  };
  const win = {};
  if (saved) {
    win.__boredResume = {
      read: () => saved,
      ask: (_label, accept) => accept(),
      arm() {}, clear() {}, flush() {}
    };
  }
  const timers = [];
  // Use the real game, including its serialization and finish logic, with a
  // tiny DOM and controlled timers. No network or browser required.
  const game = new Function('document', 'window', 'setTimeout', 'clearTimeout',
    script + '\nreturn { state: () => window.__test.state(), run: source => eval(source) };'
  )(document, win, fn => { timers.push(fn); return timers.length; }, () => {});
  return { nodes, win, timers, ...game };
}

function startTwoPlayer(game) {
  game.nodes.mode.value = 'friend';
  game.nodes.begin.onclick();
}

test('Scrabble: two consecutive passes finish and prevent another turn', () => {
  const game = boot();
  startTwoPlayer(game);
  game.nodes.pass.onclick();
  assert.equal(game.state().passes, 1);
  assert.equal(game.state().passStreak, 1);
  assert.equal(game.state().turn, 1);
  assert.equal(game.state().over, false);
  game.nodes.pass.onclick();
  assert.equal(game.state().turns, 2);
  assert.equal(game.state().passStreak, 2);
  assert.equal(game.state().over, true);
  assert.equal(game.win.__boredSnapshot().finished, true);
  assert.equal(game.nodes.pass.disabled, true);
  assert.match(game.nodes.status.textContent, /Final:/);
});

test('Scrabble: a swap breaks the pass streak but preserves the old scoreless-turn limit', () => {
  const game = boot();
  startTwoPlayer(game);
  game.nodes.pass.onclick();
  game.nodes.swap.onclick();
  game.run('marked.add(racks[turn][0].id)');
  game.nodes.swap.onclick();
  assert.equal(game.state().passes, 2);
  assert.equal(game.state().passStreak, 0);
  game.nodes.pass.onclick();
  assert.equal(game.state().passes, 3);
  assert.equal(game.state().passStreak, 1);
  assert.equal(game.state().over, false);
  game.nodes.swap.onclick();
  game.run('marked.add(racks[turn][0].id)');
  game.nodes.swap.onclick();
  assert.equal(game.state().passes, 4);
  assert.equal(game.state().over, true);
});

test('Scrabble: scoring a word clears both counters', () => {
  const game = boot();
  game.win.__test.load({
    mode: 'friend', turn: 0,
    board: { 112: 'a', 113: 't' },
    racks: [['s'], ['e']], bag: ['x', 'y'], scores: [10, 20]
  });
  game.nodes.pass.onclick();
  game.run("place(racks[turn][0], 114, 'e'); commit();");
  assert.equal(game.state().passes, 0);
  assert.equal(game.state().passStreak, 0);
  assert.equal(game.state().over, false);
  game.nodes.pass.onclick();
  assert.equal(game.state().passStreak, 1);
  assert.equal(game.state().over, false);
});

test('Scrabble: pre-update saves load without a pass streak; new saves keep it', () => {
  const oldSave = { state: {
    board: new Array(225).fill(0),
    racks: [[['e', 1, 0]], [['t', 1, 0]]],
    bag: [], scores: [10, 20], turn: 0, passes: 1, turns: 6,
    mode: 'friend', level: 'medium'
  } };
  const game = boot(oldSave);
  assert.equal(game.state().started, true);
  assert.equal(game.state().passes, 1);
  assert.equal(game.state().passStreak, 0);
  game.nodes.pass.onclick();
  assert.equal(game.state().over, false);
  assert.equal(game.state().passStreak, 1);
  const onlinePosition = game.run('onlinePack()');
  assert.equal(onlinePosition.passStreak, 1);
  const localPosition = game.run('savedRun().state');
  assert.equal(localPosition.passStreak, 1);
  game.run('restoreRun({ state: onlinePack() })');
  assert.equal(game.state().passStreak, 1);
  game.nodes.pass.onclick();
  assert.equal(game.state().over, true);
});

test('Scrabble: a CPU pass also counts toward the two-pass finish', () => {
  const game = boot();
  game.win.__test.load({
    mode: 'computer', turn: 0,
    board: { 112: 'a', 113: 't' },
    racks: [['s'], []], bag: ['x'], scores: [7, 3]
  });
  game.nodes.pass.onclick();
  assert.equal(game.state().passStreak, 1);
  assert.equal(game.timers.length, 1);
  game.timers.shift()();
  assert.equal(game.state().passStreak, 2);
  assert.equal(game.state().over, true);
});

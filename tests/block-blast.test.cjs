const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../src/games/content/block-blast.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Block Blast has an inline game script');

// Lightweight DOM harness executes the REAL game code, including its deal solver
// and scoring, without needing a graphical browser for deterministic logic tests.
function game() {
  class Element {
    constructor() {
      this.children = [];
      this.events = {};
      this.attrs = {};
      this.hidden = false;
      this.style = { setProperty() {} };
      this.classNames = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => this.classNames.add(name)),
        remove: (...names) => names.forEach(name => this.classNames.delete(name)),
        toggle: (name, force) => {
          if (force === undefined ? !this.classNames.has(name) : force) this.classNames.add(name);
          else this.classNames.delete(name);
        },
        contains: name => this.classNames.has(name)
      };
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text || ''; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
    removeEventListener(name, callback) {
      this.events[name] = (this.events[name] || []).filter(fn => fn !== callback);
    }
    emit(name, event) { for (const fn of [...(this.events[name] || [])]) fn(event); }
    setAttribute(name, value) { this.attrs[name] = value; }
    focus() {}
    setPointerCapture() {}
    getBoundingClientRect() {
      const pos = cells.indexOf(this);
      const row = Math.floor(pos / 8), col = pos % 8;
      return { left: 15 + 43 * col, top: 60 + 43 * row, width: 40, height: 40 };
    }
  }
  const cells = [];
  const elems = Object.fromEntries(['board','tray','drag-ghost','status','score','best','lines','combo','again']
    .map(id => [id, new Element()]));
  elems.board.appendChild = child => { cells.push(child); return Element.prototype.appendChild.call(elems.board, child); };
  const document = {
    getElementById: id => elems[id],
    createElement: () => new Element()
  };
  const window = new Element();
  const storage = new Map();
  const timers = [];
  const context = vm.createContext({
    document, window, Uint8Array, Math, BigInt,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: fn => timers.push(fn)
  });
  vm.runInContext(script, context, { filename: 'block-blast.html' });
  return {
    t: window.__test,
    snapshot: window.__boredSnapshot,
    elems, window, cells,
    flush: () => { while (timers.length) timers.shift()(); },
    ones: (...rows) => [...rows, ...Array(Math.max(0, 8 - rows.length)).fill('00000000')]
  };
}

const single = [[0,0]];
const vertical = [[0,0],[0,1],[0,2]];
const square = Array.from({length:9}, (_,i) => [i % 3, Math.floor(i / 3)]);

test('a deal has a complete playable path across sparse and crowded boards', () => {
  const g = game();
  let seed = 173;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const boards = [g.ones(), g.ones(...Array(8).fill('10101010')),
    g.ones(...Array(8).fill('01111111'))];
  for (let n = 0; n < 35; n++) {
    let rows;
    do {
      rows = Array.from({ length: 8 }, () =>
        Array.from({ length: 8 }, () => random() < .72 ? '1' : '0').join(''));
    } while (rows.some(row => !row.includes('0')) ||
      [...Array(8).keys()].some(col => rows.every(row => row[col] === '1')));
    boards.push(rows);
  }
  for (const rows of boards) {
    g.t.setBoard(rows);
    assert.equal(g.t.deal(), true, 'generator proved a solution for ' + rows.join('/'));
    assert.equal(g.t.canFinishHand(), true, 'issued hand remains exactly solvable');
    assert.equal(g.t.state().tray.filter(Boolean).length, 3, 'always three pieces');
  }
});

test('solver explores piece ordering and row clears, rejects impossible sets', () => {
  const g = game();
  g.t.setBoard(g.ones('11111110', '11111110', '11111110',
    '10101010', '01010101', '10101010', '01010101', '10101010'));
  g.t.setTray([square, vertical, single]);
  assert.equal(g.t.canFinishHand(), true, 'vertical clears three rows to open a 3x3');
  g.t.setBoard(g.ones(...Array(8).fill('10101010')));
  g.t.setTray([square, square, square]);
  assert.equal(g.t.canFinishHand(), false, 'three impossible squares are rejected');
});

test('combo survives two misses, increments once per clearing placement and resets on third miss', () => {
  const g = game();
  g.t.setBoard(g.ones('11111110'));
  g.t.setTray([single,null,null]);
  assert.equal(g.t.place(0,0,7), true);
  g.flush();
  assert.equal(g.t.state().combo, 1);
  g.t.setTray([single,null,null]);
  g.t.place(0,0,0);
  g.t.setTray([single,null,null]);
  g.t.place(0,0,1);
  assert.equal(g.t.state().combo, 1, 'two non-clears preserve the combo');
  assert.equal(g.t.state().misses, 2);
  g.t.setBoard(g.ones('11111110', '11111110'));
  g.t.setTray([[[0,0],[0,1]],null,null]);
  g.t.place(0,0,7);
  g.flush();
  assert.equal(g.t.state().combo, 2, 'two lines are one combo step');
  assert.equal(g.t.state().lines, 3);
  assert.equal(g.t.state().misses, 0);
  for (let i = 0; i < 3; i++) {
    g.t.setTray([single,null,null]);
    assert.equal(g.t.place(0,0,i), true);
  }
  assert.equal(g.t.state().combo, 0, 'third non-clear breaks the chain');
  g.t.setBoard(g.ones('11111110'));
  g.t.setTray([single,null,null]);
  g.t.place(0,0,7);
  g.flush();
  assert.equal(g.t.state().combo, 1, 'next clearing move starts a new combo');
});

test('touch drag keeps source button attached, lifts the preview, and drops a block', () => {
  const g = game();
  g.t.setTray([single,null,null]);
  const slot = g.elems.tray.children[0];
  const ev = (x, y) => ({ pointerId: 17, pointerType: 'touch', clientX: x, clientY: y,
    preventDefault() {} });
  slot.emit('pointerdown', ev(160,470));
  assert.equal(g.elems.tray.children[0], slot, 'drag source is not remounted during pointerdown');
  g.window.emit('pointermove', ev(15,133.1));
  assert.equal(g.elems['drag-ghost'].hidden, false);
  g.window.emit('pointerup', ev(15,133.1));
  assert.equal(g.t.state().board[0], 1, 'finger coordinates map to lifted target cell');
  assert.equal(g.elems['drag-ghost'].hidden, true, 'ghost is removed on release');
});

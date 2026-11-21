const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/prototypes/rooftop-snipers/source/rooftop-snipers.code.js'), 'utf8');
const methodStart = source.indexOf('  function lXk(b, e) {');
const methodEnd = source.indexOf('  function mXk(b, e) {', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'located Gamemanager.Start by compiled IL2CPP method pointers');
const start = source.indexOf('// Always use a randomized round:', methodStart);
const end = source.indexOf('e = c [381728] | 0; q = e + 177', start);
assert.ok(start > methodStart && end > start && end < methodEnd, 'compiled round selector patch exists');
const roundSelection = new vm.Script(source.slice(start, end), { filename: 'Gamemanager.Start modifier guard' });

function runRound(initial, bounds, seed) {
  let state = seed >>> 0;
  const o = initial.slice(), c = new Int32Array(400000), b = 1024, lengths = 4096;
  c[(b + 116) >> 2] = lengths;
  bounds.forEach((n, i) => c[(lengths + 16 + i * 4) >> 2] = n);
  const o3i = (_ctx, min, max) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return max > min ? min + (state % (max - min)) : min;
  };
  const sandbox = { b, c, o, e: 0, f: 0, g: 0, h: 0, q: 0,
    DVi: () => o.length, hsg: (_arr, index) => o[index],
    isg: (_arr, index, value) => { o[index] = value; },
    o3i };
  roundSelection.runInNewContext(sandbox, { timeout: 1000 });
  return o;
}

test('compiled Rooftop Snipers normal-round branch is gone and every eligible round has a modifier', () => {
  const bounds = [4, 5, 6, 2, 3];
  for (let seed = 0; seed < 300; seed++) {
    const initiallyRandom = [0, 0, 0, 0, 0];
    const result = runRound(initiallyRandom, bounds, seed);
    assert.ok(result.some(Boolean), 'all-zero roll must be corrected (seed ' + seed + ')');
    result.forEach((n, i) => assert.ok(n >= 0 && n < bounds[i], 'modifier remains in category range'));
  }
});

test('existing random modifiers survive unchanged', () => {
  for (let seed = 0; seed < 30; seed++) {
    const before = [1, 0, 3, 0, 2];
    assert.deepEqual(runRound(before, [5, 3, 4, 2, 3], seed), before);
  }
});

test('only eligible modifier categories can be selected as fallback', () => {
  const bounds = [1, 1, 3, 1, 1];
  for (let seed = 0; seed < 35; seed++)
    assert.deepEqual(runRound([0, 0, 0, 0, 0], bounds, seed).map(Boolean), [false, false, true, false, false]);
});

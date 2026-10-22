const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
function scaffoldFixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bored-scaffold-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const sources = ['scripts/games.mjs', 'src/games/catalog.js', 'src/games/discovery.js',
    'src/games/score-rules.json', 'src/hub/scores.js'];
  for (const relative of sources) {
    const to = path.join(temp, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(root, relative), to);
  }
  fs.mkdirSync(path.join(temp, 'src/games/content'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src/games/previews'), { recursive: true });
  return temp;
}
function run(temp, ...args) {
  return cp.spawnSync(process.execPath, ['scripts/games.mjs', 'add', ...args],
    { cwd: temp, encoding: 'utf8' });
}
test('the generator wires playable documents, previews, discovery and scoring atomically', t => {
  const tmp = scaffoldFixture(t);
  const first = run(tmp, 'quiz-room', "Quiz's Room", 'Puzzle', 'A playable quiz',
    '--metric', 'solved', '--unit', 'answers');
  assert.equal(first.status, 0, first.stderr);
  const second = run(tmp, 'another-game', 'Another Game', 'Arcade', 'Second starter');
  assert.equal(second.status, 0, second.stderr);
  for (const slug of ['quiz-room', 'another-game']) {
    const html = fs.readFileSync(path.join(tmp, 'src/games/content', slug + '.html'), 'utf8');
    assert.match(html, /window\.__boredSnapshot/);
    assert.match(html, /finished = true/);
    assert.doesNotThrow(() => new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]));
    assert.match(fs.readFileSync(path.join(tmp, 'src/games/previews', slug + '.svg'), 'utf8'), /<svg/);
  }
  const catalog = fs.readFileSync(path.join(tmp, 'src/games/catalog.js'), 'utf8');
  const discovery = fs.readFileSync(path.join(tmp, 'src/games/discovery.js'), 'utf8');
  const scores = fs.readFileSync(path.join(tmp, 'src/hub/scores.js'), 'utf8');
  const rules = JSON.parse(fs.readFileSync(path.join(tmp, 'src/games/score-rules.json'), 'utf8'));
  assert.match(catalog, /quiz-room/);
  assert.match(catalog, /another-game/);
  assert.match(discovery, /'quiz-room': '\.svg'/);
  assert.match(scores, /highScore\("quiz-room"/);
  assert.equal(rules['quiz-room'].max_value, 999);
  assert.equal(rules['quiz-room'].better, 'high');
});
test('--no-score declares the exception without a half-wired score', t => {
  const tmp = scaffoldFixture(t);
  const result = run(tmp, 'sandbox-toy', 'Sandbox Toy', 'Sandbox', 'Free play', '--no-score');
  assert.equal(result.status, 0, result.stderr);
  const catalog = fs.readFileSync(path.join(tmp, 'src/games/catalog.js'), 'utf8');
  const rules = JSON.parse(fs.readFileSync(path.join(tmp, 'src/games/score-rules.json'), 'utf8'));
  assert.match(catalog, /UNSCORED_GAMES = \["sandbox-toy"/);
  assert.equal(rules['sandbox-toy'], undefined);
});

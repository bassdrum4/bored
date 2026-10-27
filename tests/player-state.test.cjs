const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function moduleUnderTest(file, names, injections = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^import .*;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))/g, '')
    // Backend tests mock transport; keep its internal implementation from
    // shadowing that injected request function.
    .replace(file === 'src/hub/backend.js' ? /async function request\(/ : /never-match/, 'async function unusedRequest(');
  const keys = Object.keys(injections);
  return new Function(...keys, source + '\nreturn {' + names.join(',') + '};')
    (...keys.map(key => injections[key]));
}

class MemoryStorage {
  constructor() { this.items = new Map(); }
  get length() { return this.items.size; }
  getItem(key) { return this.items.get(key) ?? null; }
  setItem(key, value) { this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
  key(index) { return [...this.items.keys()][index] ?? null; }
}

test('cloud merge retains independent bests, days, and favorite removals', () => {
  const { mergeCloudState } = moduleUnderTest('src/hub/cloud.js', ['mergeCloudState']);
  const merged = mergeCloudState({
    library: { favorites: ['snake', 'pong'], recent: ['snake'], favoriteEvents: {
      pong: { saved: false, at: 30 }
    } },
    bests: { snake: 12, wordle: 4, memory: 17 },
    daily: { 'a': { id: 'a' } }
  }, {
    library: { favorites: ['pong', 'tetris'], recent: ['tetris'], favoriteEvents: {
      pong: { saved: true, at: 20 }, tetris: { saved: true, at: 40 }
    } },
    bests: { snake: 8, wordle: 3, memory: 21, tetris: 10 },
    daily: { 'b': { id: 'b' } }
  });
  assert.deepEqual(merged.library.favorites.sort(), ['snake', 'tetris']);
  assert.deepEqual(merged.library.recent, ['tetris', 'snake']);
  assert.deepEqual(merged.bests, { snake: 12, wordle: 3, memory: 17, tetris: 10 });
  assert.deepEqual(Object.keys(merged.daily).sort(), ['a', 'b']);
});

test('speedrun cloud score versions preserve legacy records without restoring their units', () => {
  const { cloudScoreKey, mergeCloudState } =
    moduleUnderTest('src/hub/cloud.js', ['cloudScoreKey', 'mergeCloudState']);
  assert.equal(cloudScoreKey('solitaire'), 'solitaire:wall-v3');
  assert.equal(cloudScoreKey('mahjong'), 'mahjong:time-v3');
  assert.equal(cloudScoreKey('snake'), 'snake');

  const legacy = { bests: { solitaire: 3, mahjong: 72, snake: 15 } };
  const current = { bests: { [cloudScoreKey('solitaire')]: 235,
    [cloudScoreKey('mahjong')]: 400, snake: 16 } };
  const combined = mergeCloudState(legacy, current);
  assert.equal(combined.bests.solitaire, 3, 'old records remain archived in cloud state');
  assert.equal(combined.bests.mahjong, 72);
  assert.equal(combined.bests['solitaire:wall-v3'], 235);
  assert.equal(combined.bests['mahjong:time-v3'], 400);
  // A second device with better times keeps the lower value.
  const improved = mergeCloudState(combined, { bests: {
    'solitaire:wall-v3': 180, 'mahjong:time-v3': 380
  } });
  assert.equal(improved.bests['solitaire:wall-v3'], 180);
  assert.equal(improved.bests['mahjong:time-v3'], 380);

  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.match(main, /\.map\(game => \[cloudScoreKey\(game.id\), bestValue\(game\)\]\)/);
  assert.match(main, /data\.bests\?\.\[cloudScoreKey\(game.id\)\]/);
  const scores = fs.readFileSync(path.join(root, 'src/hub/scores.js'), 'utf8');
  assert.match(scores, /score < game\.min/, 'sync enforces new speedrun minimums');
});

test('simultaneous devices retry stale writes rather than overwriting one another', async () => {
  let row = null;
  let version = 0;
  const session = { user: { id: 'account-123' } };
  const request = async (path, options = {}) => {
    const url = new URL(path, 'https://example.invalid');
    const clone = value => JSON.parse(JSON.stringify(value));
    if (options.method === undefined) return row ? [clone(row)] : [];
    if (options.method === 'POST') {
      if (row) throw Object.assign(new Error('duplicate'), { status: 409 });
      row = { data: clone(options.body.data), updated_at: 'version-' + ++version };
      return [{ data: clone(row.data) }];
    }
    if (options.method === 'PATCH') {
      if (!row || url.searchParams.get('updated_at') !== 'eq.' + row.updated_at) return [];
      row = { data: clone(options.body.data), updated_at: 'version-' + ++version };
      return [{ data: clone(row.data) }];
    }
    throw new Error('unexpected request');
  };
  const { pushPlayerState } = moduleUnderTest('src/hub/cloud.js', ['pushPlayerState'], {
    request, getSession: () => session, freshSession: async () => session
  });
  await Promise.all([
    pushPlayerState({ library: { favorites: ['snake'] }, bests: { snake: 8, wordle: 5 },
      daily: { 'one': { id: 'one' } } }),
    pushPlayerState({ library: { favorites: ['tetris'] }, bests: { snake: 18, wordle: 3 },
      daily: { 'two': { id: 'two' } } })
  ]);
  assert.deepEqual(row.data.library.favorites.sort(), ['snake', 'tetris']);
  assert.equal(row.data.bests.snake, 18);
  assert.equal(row.data.bests.wordle, 3);
  assert.deepEqual(Object.keys(row.data.daily).sort(), ['one', 'two']);
});

test('browser score and library keys follow their account, not the next person', () => {
  const localStorage = new MemoryStorage();
  const { activatePlayerStorage, capturePlayerSnapshot, stashPendingSignup, adoptSignupProgress } =
    moduleUnderTest('src/hub/player-storage.js',
      ['activatePlayerStorage', 'capturePlayerSnapshot', 'stashPendingSignup', 'adoptSignupProgress'],
      { localStorage });

  localStorage.setItem('bored.best.2048', '256');
  localStorage.setItem('bored.library', '{"favorites":["snake"]}');
  localStorage.setItem('bored.daily.today', '{"id":"today"}');
  activatePlayerStorage('guest');
  const guest = capturePlayerSnapshot();

  activatePlayerStorage('user:alice');
  assert.equal(localStorage.getItem('bored.best.2048'), null);
  assert.equal(localStorage.getItem('bored.library'), null);
  localStorage.setItem('bored.best.2048', '1024');
  localStorage.setItem('bored.library', '{"favorites":["tetris"]}');

  activatePlayerStorage('user:bob');
  assert.equal(localStorage.getItem('bored.best.2048'), null);
  localStorage.setItem('bored.best.2048', '64');
  activatePlayerStorage('user:alice');
  assert.equal(localStorage.getItem('bored.best.2048'), '1024');
  assert.deepEqual(JSON.parse(localStorage.getItem('bored.library')).favorites, ['tetris']);
  activatePlayerStorage('guest');
  assert.equal(localStorage.getItem('bored.best.2048'), '256');

  stashPendingSignup('a11ce', guest);
  activatePlayerStorage('user:a11ce');
  assert.equal(localStorage.getItem('bored.best.2048'), null);
  assert.equal(adoptSignupProgress('a11ce'), true);
  assert.equal(localStorage.getItem('bored.best.2048'), '256');
  assert.equal(adoptSignupProgress('a11ce'), false);
});

test('a session saved by the old anonymous sign-in does not come back', () => {
  const storage = new MemoryStorage();
  storage.setItem('bored.session', JSON.stringify({
    access_token: 'anon-token', refresh_token: 'anon-refresh', expires_at: 9999999999,
    user: { id: 'anon-1', email: null, is_anonymous: true }
  }));
  const auth = moduleUnderTest('src/hub/backend.js', ['getSession', 'hasIdentity'], {
    readStored: (key, fallback) => JSON.parse(storage.getItem(key) || 'null') || fallback,
    writeStored: (key, value) => { storage.setItem(key, JSON.stringify(value)); return true; },
    removeStored: key => storage.removeItem(key)
  });
  assert.equal(auth.getSession(), null);
  assert.equal(auth.hasIdentity(), false);
  assert.equal(storage.getItem('bored.session'), null);
});

test('an unconfirmed email signup does not touch the account already signed in', async () => {
  const storage = new MemoryStorage();
  const readStored = (key, fallback) => JSON.parse(storage.getItem(key) || 'null') || fallback;
  const writeStored = (key, value) => { storage.setItem(key, JSON.stringify(value)); return true; };
  const removeStored = key => storage.removeItem(key);
  const request = async (url) => {
    if (url.startsWith('/auth/v1/token?grant_type=password'))
      return { access_token: 'old-token', refresh_token: 'old-refresh',
        user: { id: 'old-1', is_anonymous: false, email: 'old@test.invalid' } };
    // An unconfirmed signup returns a user but no session.
    if (url.startsWith('/auth/v1/signup')) return { user: { id: 'new-1', is_anonymous: false } };
    throw Error('unexpected endpoint ' + url);
  };
  const auth = moduleUnderTest('src/hub/backend.js', [
    'signUp', 'signIn', 'getSession', 'getHandle', 'setHandle', 'hasIdentity'
  ], { readStored, writeStored, removeStored, request,
    location: { protocol: 'https:', origin: 'https://example.com', pathname: '/bored/' } });
  await auth.signIn('old@test.invalid', 'secretpass');
  auth.setHandle('old-player');
  const status = await auth.signUp('player@test.invalid', 'secretpass', 'player');
  assert.deepEqual(status, { confirmed: false, userId: 'new-1' });
  assert.equal(auth.getSession().user.id, 'old-1');
  assert.equal(auth.getHandle(), 'old-player');
  assert.equal(auth.hasIdentity(), true);
});

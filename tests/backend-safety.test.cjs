const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load(file, names, deps) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))/g, '');
  return new Function(...Object.keys(deps), source + '\nreturn {' + names.join(',') + '};')
    (...Object.values(deps));
}

function harness(handler) {
  const saved = new Map();
  saved.set('bored.session', JSON.stringify({
    access_token: 'old', refresh_token: 'old-refresh',
    expires_at: 1, user: { id: 'alpha', is_anonymous: false }
  }));
  const deps = {
    readStored: (key, fallback) => saved.has(key) ? JSON.parse(saved.get(key)) : fallback,
    writeStored: (key, value) => { saved.set(key, JSON.stringify(value)); return true; },
    removeStored: key => saved.delete(key),
    fetch: handler
  };
  return { saved, api: load('src/hub/backend.js',
    ['freshSession', 'refreshSession', 'getSession', 'hasIdentity', 'signIn'], deps) };
}
const ok = value => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });
const newTokens = () => ({ access_token: 'fresh', refresh_token: 'fresh-refresh',
  expires_in: 3600, user: { id: 'alpha', is_anonymous: false } });

test('concurrent refreshes share a single Supabase request', async () => {
  let count = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { api } = harness(async () => {
    count++;
    await gate;
    return ok(newTokens());
  });
  const calls = [api.freshSession(), api.freshSession(), api.refreshSession()];
  assert.equal(count, 1);
  release();
  const results = await Promise.all(calls);
  assert.equal(count, 1);
  assert.ok(results.every(result => result.access_token === 'fresh'));
});

test('temporary refresh outage does not sign out and can retry', async () => {
  let count = 0;
  const { api, saved } = harness(async () => {
    if (++count === 1) throw new Error('Network disconnected');
    return ok(newTokens());
  });
  assert.equal(await api.freshSession(), null);
  assert.equal(api.hasIdentity(), true);
  assert.ok(saved.has('bored.session'));
  assert.equal((await api.freshSession()).access_token, 'fresh');
});

test('invalid refresh token clears the session', async () => {
  const { api } = harness(async () => ({
    ok: false, status: 400, statusText: 'Bad Request',
    json: async () => ({ message: 'Invalid Refresh Token' })
  }));
  assert.equal(await api.freshSession(), null);
  assert.equal(api.getSession(), null);
});

test('late refresh cannot undo sign in to another account', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { api } = harness(async url => {
    if (url.includes('grant_type=refresh_token')) {
      await gate;
      return ok(newTokens());
    }
    return ok({ access_token: 'other', refresh_token: 'other-refresh',
      expires_in: 3600, user: { id: 'beta', is_anonymous: false } });
  });
  const old = api.freshSession();
  await api.signIn('other@example.test', 'password');
  release();
  assert.equal(await old, null);
  assert.equal(api.getSession().user.id, 'beta');
});

function scoreHarness(rows, slug, localScore) {
  const local = new Map();
  const scoreKey = slug === 'snake' ? 'snake.bestScore' : 'bored.best.memory';
  local.set(scoreKey, localScore);
  const user = { user: { id: 'alpha' } };
  const calls = [];
  const request = async (path, options = {}) => {
    const url = new URL(path, 'https://example.test');
    if (url.pathname.endsWith('/scores') && !options.method) {
      await Promise.resolve();
      return [...rows].map(([game, value]) => ({ game, value }));
    }
    if (url.pathname.endsWith('/rpc/submit_score') && options.method === 'POST') {
      const { p_game, p_value } = options.body;
      calls.push('RPC');
      const prev = rows.get(p_game);
      const best = prev === undefined ? p_value
        : p_game === 'memory' ? Math.min(prev, p_value) : Math.max(prev, p_value);
      rows.set(p_game, best);
      return best;
    }
    throw new Error('Unexpected scoring request ' + path);
  };
  const deps = {
    readStored: (key, fallback) => local.get(key) ?? fallback,
    writeStored: (key, value) => { local.set(key, value); return true; },
    writeRaw: (key, value) => { local.set(key, value); return true; },
    readNumber: key => Number(local.get(key) || 0),
    backendReady: () => true, request, getSession: () => user,
    freshSession: async () => user, scoreRules: new Map(),
    rulesLoaded: () => true, loadRules: async () => true,
    ensureProfile: async () => 'alpha'
  };
  const api = load('src/hub/scores.js', ['syncScores'], deps);
  return { sync: api.syncScores, calls };
}

test('two devices cannot overwrite a better high score', async () => {
  const remote = new Map();
  const a = scoreHarness(remote, 'snake', 100);
  const b = scoreHarness(remote, 'snake', 90);
  await Promise.all([a.sync(), b.sync()]);
  assert.equal(remote.get('snake'), 100);
  assert.ok([...a.calls, ...b.calls].every(method => method === 'RPC'));
});

test('lowest completion time wins even when two writes race', async () => {
  const remote = new Map([['memory', 40]]);
  const a = scoreHarness(remote, 'memory', 20);
  const b = scoreHarness(remote, 'memory', 30);
  await Promise.all([a.sync(), b.sync()]);
  assert.equal(remote.get('memory'), 20);
  assert.ok([...a.calls, ...b.calls].every(method => method === 'RPC'));
});

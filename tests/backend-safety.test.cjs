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

function harness(handler, clock = Date) {
  const saved = new Map();
  saved.set('bored.session', JSON.stringify({
    access_token: 'old', refresh_token: 'old-refresh',
    expires_at: 1, user: { id: 'alpha', is_anonymous: false }
  }));
  const deps = {
    readStored: (key, fallback) => saved.has(key) ? JSON.parse(saved.get(key)) : fallback,
    writeStored: (key, value) => { saved.set(key, JSON.stringify(value)); return true; },
    removeStored: key => saved.delete(key),
    fetch: handler, Date: clock
  };
  return { saved, api: load('src/hub/backend.js',
    ['freshSession', 'refreshSession', 'getSession', 'hasIdentity', 'signIn', 'request'], deps) };
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

function feedbackHarness({ session = null, fresh = session, handle = '' } = {}) {
  const sent = [];
  const deps = {
    request: async (path, options) => { sent.push({ path, options }); return null; },
    ANON_TOKEN: 'publishable-key',
    getSession: () => session,
    getHandle: () => handle,
    freshSession: async () => fresh,
    location: { pathname: '/games/content/risk.html', search: '?from=library' },
    navigator: { userAgent: 'test-agent' }
  };
  return { sent, api: load('src/hub/feedback.js', ['sendFeedback'], deps) };
}

// The insert policy accepts a user_id only when the request's own token owns
// that account, so sending the publishable key with a player's id is refused.
test('a signed-in note travels with the player token, never the public key', async () => {
  const session = { access_token: 'session-token', user: { id: 'alpha' } };
  const { api, sent } = feedbackHarness({ session, handle: 'alpha' });
  await api.sendFeedback({ message: '  A real note.  ', email: ' alpha@example.test ' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].options.token, 'session-token');
  assert.equal(sent[0].options.body.user_id, 'alpha');
  assert.equal(sent[0].options.body.body, 'A real note.');
  assert.equal(sent[0].options.body.email, 'alpha@example.test');
  assert.equal(sent[0].options.body.handle, 'alpha');
  assert.equal(sent[0].options.prefer, 'return=minimal');
});

test('a guest note uses the publishable key and carries no account', async () => {
  const { api, sent } = feedbackHarness();
  await api.sendFeedback({ message: 'Guest note' });
  assert.equal(sent[0].options.token, 'publishable-key');
  assert.equal(sent[0].options.body.user_id, null);
});

test('a note is not written when the account changed under it', async () => {
  const session = { access_token: 'session-token', user: { id: 'alpha' } };
  const { api, sent } = feedbackHarness({ session, fresh: { access_token: 'other', user: { id: 'beta' } } });
  await assert.rejects(api.sendFeedback({ message: 'Too late' }), /Sign in again/);
  assert.equal(sent.length, 0);
});

test('short and over-long notes never reach the server', async () => {
  const { api, sent } = feedbackHarness();
  await assert.rejects(api.sendFeedback({ message: 'hi' }), /little more/);
  await assert.rejects(api.sendFeedback({ message: 'x'.repeat(2001) }), /2000/);
  assert.equal(sent.length, 0);
});

test('gateway failures share a cooldown, then allow only one probe', async () => {
  let now = 100000, calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const { api } = harness(async () => {
    calls++;
    if (calls <= 2) return { ok: false, status: 521, text: async () => '<html>down</html>' };
    if (calls === 3) { await gate; return ok(['recovered']); }
    return ok([]);
  }, { now: () => now });
  await assert.rejects(api.request('/a'), { status: 521 });
  await assert.rejects(api.request('/b'), { status: 521 });
  await assert.rejects(api.request('/c'), { code: 'BORED_BACKEND_COOLDOWN' });
  assert.equal(calls, 2);
  now += 6100;
  const probe = api.request('/c');
  await assert.rejects(api.request('/d', { method: 'POST', body: {} }), { code: 'BORED_BACKEND_COOLDOWN' });
  assert.equal(calls, 3);
  release();
  assert.deepEqual(await probe, ['recovered']);
  assert.deepEqual(await api.request('/d'), []);
  assert.equal(calls, 4);
});

test('failed probes increase cooldown and ordinary refusals do not trip it', async () => {
  let now = 100000, calls = 0;
  const { api } = harness(async () => {
    calls++;
    if (calls <= 3) return { ok: false, status: 503, text: async () => '<html>down</html>' };
    return { ok: false, status: 400, text: async () => JSON.stringify({ message: 'bad input' }) };
  }, { now: () => now });
  await assert.rejects(api.request('/a'), { status: 503 });
  await assert.rejects(api.request('/a'), { status: 503 });
  now += 6100;
  await assert.rejects(api.request('/a'), { status: 503 });
  now += 6100;
  await assert.rejects(api.request('/b'), { code: 'BORED_BACKEND_COOLDOWN' });
  now += 5000;
  await assert.rejects(api.request('/b'), { status: 400 });
  await assert.rejects(api.request('/b'), { status: 400 });
  await assert.rejects(api.request('/b'), { status: 400 });
  assert.equal(calls, 6);
});

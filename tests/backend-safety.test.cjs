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
// The Beginner's Package, the daily tokens and the broke bailout: the ledger
// rules in rewards.js / gacha.js, and src/hub/claims.js's server-first flow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function moduleUnderTest(file, names, injections = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^import [\s\S]*?;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))/g, '');
  const keys = Object.keys(injections);
  return new Function(...keys, source + '\nreturn {' + names.join(',') + '};')
    (...keys.map(key => injections[key]));
}

const daily = moduleUnderTest('src/daily.js', ['dailyDate', 'dailyStreak', 'seedNumber']);
const { DEX, DEX_TYPES, DEX_LEGACY } = moduleUnderTest('src/hub/gacha-dex.js', ['DEX', 'DEX_TYPES', 'DEX_LEGACY']);
// One in-memory wallet the "browser" keeps, for claims.js.
let stored = null;
const rewards = moduleUnderTest('src/hub/rewards.js', [
  'mergeWallet', 'walletBalance', 'activateWallet', 'spendFrom', 'grantOnce', 'buyRegular', 'readWallet', 'writeWallet', 'walletTrophies',
  'addAchievements', 'achievement', 'claimTrophies', 'walletTrophyList', 'bossStreak', 'claimDailyChips', 'claimBailout', 'CHIPS'
], { ...daily, readStored: () => stored, writeStored: (key, value) => { stored = value; return true; }, readStoredPrefix: () => ({}) });
const gacha = moduleUnderTest('src/hub/gacha.js', [
  'gachaState', 'claimLogin', 'claimBeginner', 'rewardState', 'BEGINNER_ID', 'STARTERS', 'setBuddy', 'collectorOwned', 'collectorState', 'COLLECTOR'
], { ...daily, ...rewards, DEX, DEX_TYPES, DEX_LEGACY });
const { walletBalance, grantOnce, activateWallet, claimDailyChips, claimBailout, CHIPS } = rewards;
const { gachaState, claimLogin, claimBeginner, rewardState, STARTERS, setBuddy, collectorOwned, COLLECTOR } = gacha;

const TODAY = '2026-11-23';
let clock = Date.parse('2026-11-23T15:00:00Z');
const later = () => (clock += 1000);
const fresh = (grant = {}) => {
  const on = activateWallet({}, { today: TODAY, now: later() }).wallet;
  return Object.keys(grant).length ? grantOnce(on, 'test:' + clock, grant, { now: later() }).wallet : on;
};

test('the rules: 1,000 tokens and a starter, 300 a day, 100 under 10; pulls at 60 / 600', () => {
  assert.deepEqual([CHIPS.beginner, CHIPS.login, CHIPS.bailout, CHIPS.bailoutBelow], [1000, 300, 100, 10]);
  assert.deepEqual([COLLECTOR.pull, COLLECTOR.ten], [60, 600]);
  assert.equal(STARTERS.length, 27, "every generation's grass, fire and water starter");
});

test('the Beginner\'s Package: tokens and the starter in one entry, once, and the starter is the default buddy', () => {
  const w = fresh();
  assert.equal(gachaState(w, TODAY).buddy, null);
  const got = claimBeginner(w, 7, { now: later() });
  assert.equal(got.ok, true);
  assert.equal(walletBalance(got.wallet).chips, 1000);
  assert.equal(collectorOwned(got.wallet.entries).has(7), true, 'Squirtle joins the collection');
  assert.equal(gachaState(got.wallet, TODAY).buddy.species, 7, 'and becomes the buddy');
  assert.equal(claimBeginner(got.wallet, 4, { now: later() }).reason, 'claimed', 'once per account');
  assert.equal(claimBeginner(fresh(), 25, { now: later() }).reason, 'unknown', 'starters only');
  assert.deepEqual(rewardState(got.wallet, TODAY).beginner, { claimed: true, species: 7 });
});

test('a player who already has a buddy keeps it', () => {
  let w = claimBeginner(fresh(), 1, { now: later() }).wallet;
  w = setBuddy(w, 1, { now: later() }).wallet;
  // A second account-wide starter can't be claimed; simulate an older buddy instead.
  const other = fresh();
  const withBuddy = claimBeginner(other, 4, { now: later() }).wallet;
  const changed = setBuddy(withBuddy, 4, { now: later() }).wallet;
  assert.equal(gachaState(changed, TODAY).buddy.species, 4);
  assert.equal(gachaState(w, TODAY).buddy.species, 1);
});

test('the daily tokens are claimed, not granted at login; the bailout is only under 10, once a day', () => {
  let w = claimLogin(fresh(), { today: TODAY, now: later() }).wallet;
  assert.equal(walletBalance(w).chips || 0, 0, 'login pays no tokens');
  const d = claimDailyChips(w, { today: TODAY, now: later() });
  assert.equal(d.changed, true);
  assert.equal(walletBalance(d.wallet).chips, 300);
  assert.equal(claimDailyChips(d.wallet, { today: TODAY, now: later() }).changed, false, 'once a day');
  assert.equal(claimDailyChips(d.wallet, { today: '2026-11-24', now: later() }).changed, true, 'again tomorrow');
  assert.equal(claimBailout(fresh({ chips: 10 }), { today: TODAY, now: later() }).reason, 'balance');
  const broke = claimBailout(fresh({ chips: 4 }), { today: TODAY, now: later() });
  assert.equal(walletBalance(broke.wallet).chips, 104);
  assert.equal(claimBailout(fresh({ chips: 0 }), { today: TODAY, now: later() }).changed, true);
  const st = rewardState(fresh({ chips: 3 }), TODAY);
  assert.deepEqual([st.tokens, st.bailout.open, st.daily.claimed], [3, true, false]);
});

// claims.js, with the server and the session stubbed.
function claimsWith({ signedIn = true, server }) {
  const calls = [];
  const mod = moduleUnderTest('src/hub/claims.js', ['createClaims'], {
    readWallet: rewards.readWallet, writeWallet: rewards.writeWallet, claimDailyChips, claimBailout, claimBeginner, rewardState,
    dailyDate: () => TODAY, hasIdentity: () => signedIn, freshSession: async () => (signedIn ? { user: { id: 'u' } } : null),
    request: async (url, options) => { calls.push(options.body); return server(options.body); }
  });
  return { claims: mod.createClaims({ onChange: () => {} }), calls };
}

test('claims: an account is required, and the server is asked before the wallet changes', async () => {
  stored = fresh();
  const guest = claimsWith({ signedIn: false, server: () => true });
  assert.equal((await guest.claims.claim('daily')).reason, 'signin');
  assert.equal(guest.calls.length, 0);

  const already = claimsWith({ server: () => false });
  const refused = await already.claims.claim('daily');
  assert.deepEqual([refused.ok, refused.reason], [false, 'claimed'], 'the server already has it: nothing granted');
  assert.equal(walletBalance(stored).chips || 0, 0);

  const ok = claimsWith({ server: () => true });
  const got = await ok.claims.claim('beginner', { species: 152 });
  assert.deepEqual([got.ok, got.tokens, got.species, got.recorded], [true, 1000, 152, true]);
  assert.deepEqual(ok.calls[0], { p_kind: 'beginner', p_balance: 0 });
  assert.equal(walletBalance(stored).chips, 1000);
  assert.equal((await ok.claims.claim('beginner', { species: 155 })).reason, 'claimed', 'known locally: the server is not even asked');
  assert.equal(ok.calls.length, 1);
  assert.equal((await ok.claims.claim('bailout')).reason, 'balance', '1,000 tokens is not broke');
});

test('claims: before the SQL runs (no claim_reward), the ledger alone keeps them once', async () => {
  stored = fresh();
  const missing = claimsWith({ server: () => { const e = new Error('Could not find the function'); e.status = 404; e.code = 'PGRST202'; throw e; } });
  const logged = [];
  const original = console.log;
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const first = await missing.claims.claim('daily');
    assert.deepEqual([first.ok, first.tokens, first.recorded], [true, 300, false]);
    assert.equal((await missing.claims.claim('daily')).reason, 'claimed');
  } finally {
    console.log = original;
  }
  assert.ok(logged.some(line => /claim_reward is not on the server yet/.test(line)));
  const down = claimsWith({ server: () => { const e = new Error('Service unavailable'); e.status = 503; throw e; } });
  stored = fresh();
  const failed = await down.claims.claim('daily');
  assert.deepEqual([failed.ok, failed.reason], [false, 'server'], 'any other failure grants nothing');
  assert.equal(walletBalance(stored).chips || 0, 0);
});

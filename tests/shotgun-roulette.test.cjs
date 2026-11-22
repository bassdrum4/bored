// Shotgun Roulette's hub side: the bet/payout ledger rules in src/hub/roulette.js
// and the server checks in sql/shotgun_roulette.sql (run in an in-memory Postgres).
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
const rewards = moduleUnderTest('src/hub/rewards.js',
  ['mergeWallet', 'walletBalance', 'spendFrom', 'grantOnce', 'readWallet', 'writeWallet'],
  { ...daily, readStored: () => null, writeStored: () => true, readStoredPrefix: () => ({}) });
const roulette = moduleUnderTest('src/hub/roulette.js',
  ['ROULETTE', 'rouletteGames', 'rouletteWonOn', 'rouletteStreak', 'placeRouletteBet', 'settleRouletteWin'],
  { ...daily, ...rewards, request: async () => [], freshSession: async () => null, hasIdentity: () => false, ANON_TOKEN: 'anon' });
const { placeRouletteBet, settleRouletteWin, rouletteWonOn, rouletteStreak, rouletteGames } = roulette;
const { walletBalance, grantOnce } = rewards;

const DAY = '2026-11-21';
const funded = chips => grantOnce({ v: 1, entries: {} }, 'gift:test', { chips }).wallet;
let tokens = 0;
const bet = (wallet, mode, amount) => placeRouletteBet(wallet, mode, amount, { today: DAY, now: 1e12 + tokens * 1000, token: 'token-' + (++tokens) });

test('a bet takes chips once and refuses what the rules do not allow', () => {
  const wallet = funded(1000);
  const placed = bet(wallet, 'normal', 100);
  assert.equal(placed.ok, true);
  assert.equal(walletBalance(placed.wallet).chips, 900);
  assert.equal(walletBalance(placed.wallet).coins, 0, 'coins are never touched');
  assert.equal(bet(wallet, 'normal', 5).reason, 'range');
  assert.equal(bet(wallet, 'normal', 501).reason, 'range');
  assert.equal(bet(wallet, 'normal', 12.5).reason, 'range');
  assert.equal(bet(wallet, 'expert', 100).reason, 'mode');
  assert.equal(bet(funded(50), 'hard', 100).reason, 'chips');
});

test('a win pays the multiplier once; a loss pays nothing', () => {
  const normal = bet(funded(1000), 'normal', 100);
  const paid = settleRouletteWin(normal.wallet, normal.betId);
  assert.deepEqual([paid.ok, paid.payout, paid.profit, paid.capped], [true, 180, 80, false]);
  assert.equal(walletBalance(paid.wallet).chips, 1080);
  assert.equal(settleRouletteWin(paid.wallet, normal.betId).reason, 'settled');

  const hard = bet(funded(1000), 'hard', 500);
  assert.equal(walletBalance(settleRouletteWin(hard.wallet, hard.betId).wallet).chips, 2000);

  assert.equal(settleRouletteWin(funded(1000), 'spend:sr:' + DAY + ':normal:made-up-id').reason, 'bet');
});

test('the daily cap trims the last win and then refuses new bets', () => {
  let wallet = funded(10000);
  for (let i = 0; i < 2; i++) {
    const placed = bet(wallet, 'hard', 500);
    wallet = settleRouletteWin(placed.wallet, placed.betId).wallet;
  }
  assert.equal(rouletteWonOn(wallet, DAY), 2000);
  const third = bet(wallet, 'hard', 400);
  wallet = settleRouletteWin(third.wallet, third.betId).wallet;
  assert.equal(rouletteWonOn(wallet, DAY), 2800);
  const fourth = bet(wallet, 'hard', 500);
  const trimmed = settleRouletteWin(fourth.wallet, fourth.betId);
  assert.deepEqual([trimmed.profit, trimmed.capped], [200, true]);
  assert.equal(trimmed.payout, 700, 'the bet comes back with whatever the cap leaves');
  assert.equal(rouletteWonOn(trimmed.wallet, DAY), 3000);
  assert.equal(bet(trimmed.wallet, 'normal', 10).reason, 'cap');
  assert.equal(placeRouletteBet(trimmed.wallet, 'normal', 10, { today: '2026-11-22', token: 'next-day-1' }).ok, true);
});

test('the cap counts net profit: losses come off the day, so wins in between cannot pass it', () => {
  let wallet = funded(20000);
  const play = (mode, amount, won) => {
    const placed = bet(wallet, mode, amount);
    wallet = won ? settleRouletteWin(placed.wallet, placed.betId).wallet : placed.wallet;
  };
  // Three Hard wins (+3000 gross) with a 500 loss between them nets +2500.
  play('hard', 500, true); play('hard', 500, false); play('hard', 500, true); play('hard', 500, true);
  assert.equal(rouletteWonOn(wallet, DAY), 2500, 'net, not the 3000 won gross');
  assert.equal(walletBalance(wallet).chips, 22500);
  // The next win fills the day to exactly +3000.
  const placed = bet(wallet, 'hard', 500);
  const paid = settleRouletteWin(placed.wallet, placed.betId);
  assert.deepEqual([paid.payout, paid.profit, paid.capped], [1000, 500, true]);
  assert.equal(rouletteWonOn(paid.wallet, DAY), 3000);
  assert.equal(walletBalance(paid.wallet).chips - 20000, 3000, 'the wallet gained exactly the cap');
  assert.equal(bet(paid.wallet, 'normal', 10).reason, 'cap');
  assert.deepEqual(rouletteGames(paid.wallet).map(g => g.profit), [1000, -500, 1000, 1000, 500]);
});

test('games from before chips still read back in coins and count toward their day', () => {
  const old = grantOnce({ v: 1, entries: {} }, 'gift:test', { coins: 1000, chips: 1000 }).wallet;
  old.entries['spend:sr:' + DAY + ':normal:old-coin-game'] = { at: 1, g: { coins: -100 }, x: { m: 'normal', b: 100 } };
  const paid = settleRouletteWin(old, 'spend:sr:' + DAY + ':normal:old-coin-game');
  assert.equal(paid.ok, true);
  assert.deepEqual([walletBalance(paid.wallet).coins, walletBalance(paid.wallet).chips], [1080, 1000]);
  assert.equal(rouletteWonOn(paid.wallet, DAY), 80);
});

test('streaks count wins in a row per mode', () => {
  let wallet = funded(10000);
  const play = (mode, won) => {
    const placed = bet(wallet, mode, 10);
    wallet = won ? settleRouletteWin(placed.wallet, placed.betId).wallet : placed.wallet;
  };
  play('normal', true); play('normal', true); play('hard', false); play('normal', true);
  play('normal', false); play('normal', true);
  assert.deepEqual(rouletteStreak(wallet, 'normal'), { current: 1, best: 3 });
  assert.deepEqual(rouletteStreak(wallet, 'hard'), { current: 0, best: 0 });
  assert.equal(rouletteGames(wallet).length, 6);
});

test('the SQL creates the board and refuses impossible scores', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role anon; create role authenticated;
    create table public.profiles (id uuid primary key, handle text);
    insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
    insert into public.profiles values ('00000000-0000-0000-0000-000000000001', 'gira_fan');
  `);
  await db.exec(fs.readFileSync(path.join(root, 'sql/shotgun_roulette.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'sql/shotgun_roulette.sql'), 'utf8')); // safe to run twice
  const as = uid => db.exec(`select set_config('test.uid', '${uid}', false)`);
  const submit = (mode, coins, streak) => db.query('select public.submit_shotgun_roulette($1, $2, $3)', [mode, coins, streak]);

  await as('');
  await assert.rejects(submit('normal', 10, 1), /sign in/);
  await as('00000000-0000-0000-0000-000000000001');
  await submit('normal', 400, 1);
  await submit('normal', 0, 1);
  await submit('hard', 1000, 1);
  await assert.rejects(submit('normal', 401, 1), /out of range/);
  await assert.rejects(submit('hard', 1001, 1), /out of range/);
  await assert.rejects(submit('normal', 10, 9), /best_streak/);
  await assert.rejects(submit('easy', 10, 0), /unknown mode/);
  await submit('hard', 1000, 2);
  await assert.rejects(submit('hard', 1000, 3), /daily win cap/);
  await submit('hard', 600, 3);
  // A loss posts as -bet and makes room under the net cap.
  await assert.rejects(submit('normal', -501, 1), /out of range/);
  await submit('hard', -500, 3);
  await submit('hard', 500, 3);
  await assert.rejects(submit('hard', 1, 3), /daily win cap/);

  await as('00000000-0000-0000-0000-000000000002');
  await submit('normal', 120, 1);

  const top = (await db.query('select * from public.shotgun_roulette_top($1)', ['normal'])).rows;
  assert.deepEqual(top.map(row => [row.handle, Number(row.coins_won), row.best_streak]), [['gira_fan', 400, 1], ['unnamed', 120, 1]]);
  const hard = (await db.query('select * from public.shotgun_roulette_top($1)', ['hard'])).rows;
  assert.deepEqual(hard.map(row => Number(row.coins_won)), [2600], 'net: 1000 + 1000 + 600 - 500 + 500');
  await db.close();
});

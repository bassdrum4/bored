const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function moduleUnderTest(file, names, injections = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^import .*;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))/g, '');
  const keys = Object.keys(injections);
  return new Function(...keys, source + '\nreturn {' + names.join(',') + '};')
    (...keys.map(key => injections[key]));
}

const { dailyDate, dailyStreak } = moduleUnderTest('src/daily.js', ['dailyDate', 'dailyStreak']);
const rewards = moduleUnderTest('src/hub/rewards.js', [
  'mergeWallet', 'walletBalance', 'activateWallet', 'observeSnapshot', 'grantOnce',
  'spendFrom', 'buyRegular', 'walletTrophies', 'walletStats', 'walletTrophyList'
], { dailyDate, dailyStreak, readStored: () => null, writeStored: () => true, readStoredPrefix: () => ({}) });
const { mergeWallet, walletBalance, activateWallet, observeSnapshot, grantOnce, spendFrom, buyRegular, walletTrophies } = rewards;

const TODAY = '2026-11-16';
const NOW = Date.parse('2026-11-16T15:00:00Z');
const opts = (extra = {}) => ({ today: TODAY, now: NOW, ...extra });
const idle = fields => ({ slug: 'poke-idle', caught: 0, shinies: 0, badges: 0, tower: 0, score: 0, finished: true, ...fields });
const doku = (days, modes = {}, date = TODAY) => ({ slug: 'pokedoku', points: 0, finished: true, daily: true, date, days, modes });
const on = () => activateWallet({}, opts()).wallet;
const observe = (wallet, slug, snapshot, extra) => observeSnapshot(wallet, slug, snapshot, opts(extra)).wallet;

test('nothing is recorded before Poké Gacha activates the wallet', () => {
  const { wallet, changed } = observeSnapshot({}, 'poke-idle', idle({ caught: 300 }), opts());
  assert.equal(changed, false);
  assert.deepEqual(Object.keys(wallet.entries), []);
});

test('Poké Idle pays progress past the baseline, and a restart pays nothing again', () => {
  let wallet = observe(on(), 'poke-idle', idle({ caught: 20 }));
  const backpaid = walletBalance(wallet);
  assert.equal(backpaid.coins, 0, 'existing progress goes to backpay, not coins');
  assert.equal(backpaid.regular, 1, '20 species × 5 coins = 100 coin-equivalents of backpay');

  wallet = observe(wallet, 'poke-idle', idle({ caught: 30, badges: 1, tower: 4 }));
  let balance = walletBalance(wallet);
  // Badge and tower baselines were read at 0 together with caught, so they pay in full.
  assert.equal(balance.coins, 10 * 5 + 100 + 4 * 10);
  wallet = observe(wallet, 'poke-idle', idle({ caught: 30, badges: 1, tower: 4 }));
  assert.equal(walletBalance(wallet).coins, 190, 'the same snapshot twice pays once');

  const restarted = observe(wallet, 'poke-idle', idle({ caught: 5, badges: 0, tower: 0 }));
  assert.deepEqual(walletBalance(restarted), walletBalance(wallet), 'a fresh save pays nothing');
  const caughtUp = observe(restarted, 'poke-idle', idle({ caught: 31, badges: 1, tower: 4 }));
  assert.equal(walletBalance(caughtUp).coins, 195, 'only a new account best pays');
});

test('tower floors and waves follow the rate table', () => {
  let wallet = observe(on(), 'poke-idle', idle({}));
  wallet = observe(wallet, 'poke-idle', idle({ tower: 3, shinies: 1, caught: 2 }));
  const balance = walletBalance(wallet);
  assert.equal(balance.coins, 3 * 10 + 200 + 2 * 5);
  assert.equal(balance.waves, 3 + 2);
});

test('Pokédoku dailies pay once per mode and day, plus the all-three Premium', () => {
  let wallet = on();
  const done = { points: 500, finished: true };
  wallet = observe(wallet, 'pokedoku', doku({ doku: done, inverse: null, shiny: null }));
  wallet = observe(wallet, 'pokedoku', doku({ doku: done, inverse: null, shiny: null }));
  let balance = walletBalance(wallet);
  assert.equal(balance.coins, 100);
  assert.equal(balance.waves, 10);
  assert.equal(balance.plus, 1, 'first Pokédoku daily achievement (S)');

  wallet = observe(wallet, 'pokedoku', doku({ doku: done, inverse: { points: 600, finished: true }, shiny: done }));
  balance = walletBalance(wallet);
  assert.equal(balance.coins, 300 + 50, 'three dailies and a perfect Inverse Doku');
  assert.equal(balance.premium, 1 + 1, 'all three dailies, and the find-everything achievement (M)');
  assert.equal(balance.plus, 3, 'first daily in each mode');
});

test('a perfect 9/9 needs the live daily board', () => {
  let wallet = on();
  wallet = observe(wallet, 'pokedoku', doku({ doku: { points: 1350, finished: true } },
    { doku: { slug: 'pokedoku', squares: 9, finished: true, daily: true, seed: 7 } }));
  assert.ok(wallet.entries['pdoku:perfect:doku:' + TODAY]);
  assert.ok(wallet.entries['ach:doku-perfect']);
});

test('random boards pay once per seed and three times per mode per day, even across devices', () => {
  const board = seed => doku({}, { inverse: { slug: 'inverse-doku', found: 2, finished: true, daily: false, seed } });
  let a = on();
  for (const seed of [1, 1, 2, 3, 4]) a = observe(a, 'pokedoku', board(seed));
  assert.equal(walletBalance(a).coins, 60);
  let b = on();
  for (const seed of [5, 6, 7]) b = observe(b, 'pokedoku', board(seed));
  assert.equal(walletBalance(mergeWallet(a, b)).coins, 60, 'six boards from two devices still pay three');
  const gaveUp = observe(on(), 'pokedoku', doku({}, { doku: { finished: true, daily: false, gaveUp: true, seed: 9 } }));
  assert.equal(walletBalance(gaveUp).coins, 0);
  const custom = observe(on(), 'pokedoku', doku({}, { doku: { finished: true, daily: false, custom: true, seed: 9 } }));
  assert.equal(walletBalance(custom).coins, 0);
});

test('a board from another day does not pay', () => {
  const old = observe(on(), 'pokedoku', doku({ doku: { points: 1, finished: true } }, {}, '2026-11-01'));
  assert.equal(walletBalance(old).coins, 0);
  const lastNight = observe(on(), 'pokedoku', doku({ doku: { points: 1, finished: true } }, {}, '2026-11-15'));
  assert.equal(walletBalance(lastNight).coins, 100, 'yesterday still counts across midnight');
});

test('merging devices is a union: nothing doubles, nothing is lost', () => {
  const base = observe(on(), 'poke-idle', idle({}));
  const a = observe(base, 'pokedoku', doku({ doku: { points: 1, finished: true } }), { now: NOW + 1000 });
  const b = observe(base, 'pokedoku', doku({ doku: { points: 1, finished: true } }), { now: NOW + 5000 });
  const c = observe(base, 'poke-idle', idle({ caught: 10 }));
  const ab = mergeWallet(a, b, c), ba = mergeWallet(c, b, a);
  assert.deepEqual(ab, ba, 'order does not matter');
  assert.deepEqual(mergeWallet(ab, ab), ab, 'merging again changes nothing');
  assert.equal(walletBalance(ab).coins, 100 + 50);

  const spentA = spendFrom(ab, { coins: 100 }, { id: 'one' });
  const spentB = spendFrom(ab, { coins: 20 }, { id: 'two' });
  assert.ok(spentA.ok && spentB.ok);
  assert.equal(walletBalance(mergeWallet(spentA.wallet, spentB.wallet)).coins, 30, 'both spends survive the merge');
});

test('marks keep the highest value when devices disagree', () => {
  const base = observe(on(), 'poke-idle', idle({}));
  const high = observe(base, 'poke-idle', idle({ caught: 40 }));
  const low = observe(base, 'poke-idle', idle({ caught: 12 }), { now: NOW + 60000 });
  assert.equal(walletBalance(mergeWallet(low, high)).coins, 200);
});

test('backpay is capped at 1 Gold + 2 Premium and pays nothing again', () => {
  const history = {};
  for (let day = 1; day <= 12; day++) {
    const date = '2026-10-' + String(day).padStart(2, '0');
    history[date] = { doku: { points: 900, finished: true }, inverse: { points: 600, finished: true }, shiny: { points: 300, finished: true } };
  }
  let wallet = activateWallet({}, opts({ history })).wallet;
  wallet = observe(wallet, 'poke-idle', idle({ caught: 820, shinies: 10, badges: 36, tower: 120 }));
  const balance = walletBalance(wallet);
  assert.equal(balance.gold, 1);
  assert.equal(balance.premium, 2);
  assert.equal(balance.regular, 0);
  assert.equal(balance.plus, 0);
  assert.equal(balance.coins, 0);
  const trophies = walletTrophies(wallet).map(t => t.id);
  assert.ok(trophies.includes('pi-caught-800') && trophies.includes('doku-10') && trophies.includes('doku-all3-7'),
    'achievements reached before launch still go on the trophy list');
  // Today's daily was not in the history, so it pays in full.
  const today = observe(wallet, 'pokedoku', doku({ doku: { points: 1, finished: true } }));
  assert.equal(walletBalance(today).coins, 100);
  // A historic day cannot be paid again.
  const replay = observe(wallet, 'pokedoku', doku({ doku: { points: 1, finished: true } }, {}, '2026-10-12'));
  assert.equal(walletBalance(replay).coins, 0);
  assert.deepEqual(activateWallet(wallet, opts({ history })).changed, false);
});

test('progress after the baseline unlocks achievements at full value', () => {
  let wallet = observe(on(), 'poke-idle', idle({ caught: 49 }));
  assert.equal(walletBalance(wallet).plus, 0);
  wallet = observe(wallet, 'poke-idle', idle({ caught: 50 }));
  assert.equal(walletBalance(wallet).plus, 1);
});

test('spends refuse to overdraw, grants pay once, and coins buy Regulars', () => {
  let wallet = grantOnce(on(), 'gacha:login:' + TODAY, { regular: 3 }, { now: NOW }).wallet;
  assert.equal(grantOnce(wallet, 'gacha:login:' + TODAY, { regular: 3 }).changed, false);
  assert.equal(grantOnce(wallet, 'ach:fake', { gold: 9 }).changed, false, 'reserved ids cannot be granted');
  assert.equal(grantOnce(wallet, 'gacha:neg', { coins: -5 }).changed, false);
  assert.equal(walletBalance(wallet).regular, 3);
  assert.equal(spendFrom(wallet, { regular: 4 }).ok, false);
  wallet = grantOnce(wallet, 'td:1-1:clear', { coins: 250 }).wallet;
  const bought = buyRegular(wallet, 2, { id: 'buy' });
  assert.ok(bought.ok);
  const balance = walletBalance(bought.wallet);
  assert.equal(balance.coins, 50);
  assert.equal(balance.regular, 5);
  assert.equal(buyRegular(bought.wallet, 1).ok, false);
});

test('a tampered copy cannot inject currencies or bad ids', () => {
  const merged = mergeWallet({ entries: {
    'x y': { at: 1, g: { coins: 999 } },
    ok: { at: 'soon', g: { coins: 999 } },
    fine: { at: 1, g: { coins: 5, dollars: 7, 'candy:pikachu': 2 } }
  } });
  assert.deepEqual(Object.keys(merged.entries), ['fine']);
  assert.deepEqual(merged.entries.fine.g, { coins: 5, 'candy:pikachu': 2 });
});

test('the account copy carries the wallet through the cloud merge', () => {
  const { mergeCloudState } = moduleUnderTest('src/hub/cloud.js', ['mergeCloudState'], { mergeWallet });
  const a = grantOnce(on(), 'gacha:login:2026-11-15', { regular: 3 }).wallet;
  const b = grantOnce(on(), 'gacha:login:2026-11-16', { regular: 3 }).wallet;
  const merged = mergeCloudState({ wallet: a }, { wallet: b });
  assert.equal(walletBalance(merged.wallet).regular, 6);
  assert.equal('wallet' in mergeCloudState({}, {}), false, 'rows without a wallet stay as they were');
});

test('the Poké Idle daily boss pays once a day, and five weekday wins in a row pay a Premium; weekends neither count nor break it', () => {
  // 2026-11-16 is a Monday.
  const day = d => '2026-11-' + String(d).padStart(2, '0');
  const at = d => ({ today: day(d), now: Date.parse(day(d) + 'T15:00:00Z') });
  const win = (w, d, won = true) => observeSnapshot(w, 'poke-idle', idle({ boss: { date: day(d), won } }), at(d)).wallet;
  let w = activateWallet({}, at(16)).wallet;
  const before = walletBalance(w);
  w = win(w, 16, false);
  assert.equal(w.entries['pi:boss:' + day(16)], undefined, 'not beaten, not paid');
  w = win(win(w, 16), 16);
  assert.deepEqual(w.entries['pi:boss:' + day(16)].g, { coins: 150, waves: 15 });
  assert.equal(walletBalance(w).coins - before.coins, 150, 'once a day');
  // Monday to Friday: the fifth win pays a Premium.
  for (const d of [17, 18, 19]) w = win(w, d);
  assert.equal(walletBalance(w).premium, before.premium);
  w = win(w, 20);
  assert.deepEqual(w.entries['pi:streak:' + day(20)].g, { premium: 1 });
  // A weekend win pays its coins; the weekend neither counts nor breaks the run.
  w = win(w, 21);
  assert.ok(w.entries['pi:boss:' + day(21)]);
  assert.equal(w.entries['pi:streak:' + day(21)], undefined);
  for (const d of [23, 24, 25, 26]) w = win(w, d);
  assert.equal(w.entries['pi:streak:' + day(26)], undefined, 'four into the next run');
  w = win(w, 27);
  assert.ok(w.entries['pi:streak:' + day(27)], 'ten weekday wins in a row: a second Premium, across the weekend');
  assert.equal(walletBalance(w).premium - before.premium, 2);
  // A missed weekday breaks the run.
  let gap = activateWallet({}, at(16)).wallet;
  for (const d of [16, 17, 19, 20, 23]) gap = win(gap, d);
  assert.equal(Object.keys(gap.entries).filter(id => id.startsWith('pi:streak:')).length, 0);
  // Yesterday's boss still pays today; an older one, or a forged id, does not.
  assert.ok(observeSnapshot(activateWallet({}, at(17)).wallet, 'poke-idle', idle({ boss: { date: day(16), won: true } }), at(17)).wallet.entries['pi:boss:' + day(16)]);
  assert.equal(observeSnapshot(activateWallet({}, at(18)).wallet, 'poke-idle', idle({ boss: { date: day(16), won: true } }), at(18)).wallet.entries['pi:boss:' + day(16)], undefined);
  assert.equal(grantOnce(w, 'pi:boss:' + day(28), { coins: 150 }).changed, false, 'pi: ids are the hub\'s own');
});

test('the trophy list has every trophy with its progress, and an earned one shows full', () => {
  let w = observe(on(), 'poke-idle', idle({ caught: 0 }));
  w = observe(w, 'poke-idle', idle({ caught: 60 }));
  const list = rewards.walletTrophyList(w, TODAY);
  assert.equal(list.length, 28, 'every trophy, earned or not');
  assert.deepEqual([...new Set(list.map(t => t.game))], ['poke-idle', 'pokedoku']);
  const at = id => { const t = list.find(x => x.id === id); return [t.have, t.need, t.done]; };
  assert.deepEqual(at('pi-caught-50'), [50, 50, true], 'earned: full');
  assert.deepEqual(at('pi-caught-150'), [60, 150, false], 'in progress');
  assert.deepEqual(at('doku-10'), [0, 10, false]);
  assert.equal(list.filter(t => t.done).length, walletTrophies(w).length, 'done matches the earned list');
});

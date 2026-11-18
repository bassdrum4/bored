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
const rewards = moduleUnderTest('src/hub/rewards.js', [
  'mergeWallet', 'walletBalance', 'activateWallet', 'spendFrom', 'grantOnce', 'buyRegular', 'readWallet', 'writeWallet', 'walletTrophies'
], { ...daily, readStored: () => null, writeStored: () => true, readStoredPrefix: () => ({}) });
const gacha = moduleUnderTest('src/hub/gacha.js', [
  'gachaState', 'pullEggs', 'hatchReady', 'evolve', 'upgrade', 'buySp', 'setBuddy', 'claimLogin', 'candyOffer',
  'eggPools', 'bannerFor', 'lineOf', 'stageOf', 'evolutionsOf', 'skillsOf', 'RARITY_PITY', 'setLook', 'lookFor', 'setSkins', 'skinList', 'looksOf', 'buyCandy', 'buyShards', 'buyPreset', 'COIN_SHOP', 'skinFile', 'skinPrice', 'SP_PRICES',
  'pickStarter', 'STARTERS', 'STARTER_GIFTS', 'FREE_HATCHES', 'WELCOME', 'WELCOME_ID', 'claimCutRefund', 'isCut', 'CUT_REFUND', 'CUT_CANDY'
], { ...daily, ...rewards, DEX, DEX_TYPES, DEX_LEGACY });
const { mergeWallet, walletBalance, activateWallet, grantOnce } = rewards;
const { gachaState, pullEggs, hatchReady, evolve, upgrade, buySp, setBuddy, claimLogin, eggPools, bannerFor } = gacha;

const TODAY = '2026-11-16';
const NOW = Date.parse('2026-11-16T15:00:00Z');
// mulberry32: a small seeded generator so every run rolls the same eggs.
const seeded = seed => () => {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const always = value => () => value;
let tick = 0;
const later = () => NOW + (++tick) * 1000;
const opts = extra => ({ today: TODAY, now: later(), ...extra });
const fund = (wallet, grant, id = 'test:' + (++tick)) => grantOnce(wallet, id, grant, { now: later() }).wallet;
const fresh = grant => fund(activateWallet({}, { today: TODAY, now: NOW }).wallet, grant);
const pull = (wallet, extra) => {
  const result = pullEggs(wallet, opts(extra));
  assert.ok(result.ok, 'pull refused: ' + result.reason);
  return result;
};

test('the egg pool is base forms only, mythicals hatch from Legendary eggs, and every tier is filled', () => {
  const pools = eggPools();
  assert.deepEqual(pools.slice(0, 4).map(p => p.length > 0), [true, true, true, true]);
  for (const pool of pools) for (const num of pool) {
    assert.equal(DEX[num - 1][8], 0, DEX[num - 1][0] + ' is not a base form');
  }
  // Mythicals: every one still on the roster is in the Legendary tier (same rates and pity), none in the other tiers.
  const mythicals = DEX.map((row, i) => [row, i + 1]).filter(([row]) => row[10] === 'my' && !row[8] && row[9]).map(([, num]) => num);
  assert.ok(mythicals.length >= 5);
  assert.ok(mythicals.every(num => pools[3].includes(num)), 'every mythical hatches from Legendary eggs');
  assert.ok(pools.slice(0, 3).every(p => p.every(num => DEX[num - 1][10] !== 'my')), 'and from no other tier');
  const named = name => DEX.findIndex(row => row[0] === name) + 1;
  assert.ok(pools[3].includes(named('Dratini')) && pools[3].includes(named('Mewtwo')) && pools[3].includes(named('Mew')));
  assert.ok(pools[2].includes(named('Eevee')) && pools[2].includes(named('Riolu')) && pools[2].includes(named('Bulbasaur')));
  assert.ok(!pools.flat().includes(named('Pikachu')), 'Pichu is the base form, not Pikachu');
  assert.ok(pools[4].every(num => pools[3].includes(num) && DEX[num - 1][10] === 'lg'), 'banners are legendaries');
});

/* ── The roster cut (docs/poke-gacha-roster.md) ─────────────────────────── */
const named = name => DEX.findIndex(row => row[0] === name) + 1;
// A wallet that hatched these species (tier = the egg tier each came from), with candy on each line.
function hatchedWallet(list, tag = 'cut') {
  let w = fresh({});
  list.forEach(([num, tier], i) => {
    w.entries['spend:' + tag + '-' + i] = { at: 1, g: { regular: 0 }, x: { m: 'move', e: [tier], w: 0, n: i, d: TODAY } };
    w = mergeWallet(w);
    w.entries['hatch:' + tag + '-' + i + '.0'] = { at: 2, g: { ['candy:' + gacha.lineOf(num)]: 10 }, x: { s: num, t: tier, n: 1, k: 0 } };
  });
  return mergeWallet(w);
}
test('the roster: about 200 lines, every starter, SP line and pseudo-legendary in, 30-40 legendaries and mythicals', () => {
  const pools = eggPools(), lines = pools.slice(0, 4).flat();
  assert.ok(lines.length >= 190 && lines.length <= 215, lines.length + ' lines');
  for (const num of gacha.STARTERS) assert.ok(lines.includes(num), DEX[num - 1][0] + ' is a starter');
  const skins = JSON.parse(fs.readFileSync(path.join(root, 'src/games/content/poke-gacha/sp/skins.json'), 'utf8'));
  for (const skin of skins) assert.ok(lines.includes(gacha.lineOf(skin.species)), skin.id + ' has its line on the roster');
  DEX.forEach((row, i) => { if (row[10] === 'pseudo' && !row[8]) assert.ok(lines.includes(i + 1), row[0] + ' is a pseudo-legendary'); });
  const legends = pools[3].filter(num => DEX[num - 1][10] === 'lg' || DEX[num - 1][10] === 'my');
  assert.ok(legends.length >= 30 && legends.length <= 40, legends.length + ' legendaries and mythicals');
  // The commonest egg has the biggest pool, then each rarer one.
  assert.ok(pools[0].length > pools[1].length && pools[1].length > pools[2].length);
  // Cut lines are not in any pool, and every cut line was an egg line before.
  const cut = new Set(DEX_LEGACY.map(([num]) => num));
  assert.ok(cut.size > 300);
  for (const num of cut) { assert.equal(DEX[num - 1][9], 0); assert.ok(!pools.flat().includes(num)); }
  assert.equal(cut.size + lines.length, 552, 'every old egg line is either kept or cut');
  assert.ok(gacha.isCut(named('Tauros')) && gacha.isCut(named('Archeops')) && !gacha.isCut(named('Charizard')));
});
test('a cut line leaves the dex and squads, and is refunded once: tier vouchers, candy, level coins', () => {
  const [tauros, archen, kubfu, regieleki, charmander] = ['Tauros', 'Archen', 'Kubfu', 'Regieleki', 'Charmander'].map(named);
  let w = hatchedWallet([[tauros, 0], [archen, 2], [kubfu, 3], [regieleki, 3], [charmander, 2]]);
  w = fund(w, { [`candy:${tauros}`]: 45 }); // Tauros: 55 candy, 2 Regulars from candy
  // Two levels bought on Tauros before the cut: 40 + 80 coins.
  w = fund(w, { coins: 120 });
  w.entries['spend:lv-1'] = { at: 3, g: { coins: -40 }, x: { lv: tauros, to: 2 } };
  w.entries['spend:lv-2'] = { at: 4, g: { coins: -80 }, x: { lv: tauros, to: 3 } };
  w = mergeWallet(w);
  const state = gachaState(w, TODAY);
  assert.deepEqual(state.owned, [charmander], 'only the kept line is owned');
  assert.deepEqual(Object.keys(state.lines).map(Number), [charmander]);
  assert.deepEqual(state.legacy.map(l => [l.line, l.star]), [[tauros, 3], [archen, 5], [kubfu, 6], [regieleki, 6]]);
  assert.ok(evolve(w, archen, named('Archeops'), opts()).ok === false, 'a cut line cannot evolve');
  const before = walletBalance(w);
  const r = gacha.claimCutRefund(w, opts());
  assert.ok(r.ok);
  assert.deepEqual(r.total, { regular: 1 + 2, coins: 120, plus: 1, premium: 2 });
  const after = walletBalance(r.wallet);
  assert.equal(after.regular - before.regular, 3);
  assert.equal(after.plus - before.plus, 1);
  assert.equal(after.premium - before.premium, 2);
  assert.equal(after.coins - before.coins, 120);
  assert.equal(after['candy:' + tauros] || 0, 0, 'the candy it was paid for is spent');
  assert.equal(after['candy:' + charmander], 10, 'kept lines keep their candy');
  // Once: a second claim, on this device or after a merge with another that claimed too, pays nothing more.
  assert.equal(gacha.claimCutRefund(r.wallet, opts()).ok, false);
  const other = gacha.claimCutRefund(w, opts()).wallet;
  assert.deepEqual(walletBalance(mergeWallet(r.wallet, other)), after);
  assert.ok(gachaState(r.wallet, TODAY).legacy.every(l => l.refunded));
  // A cut line that syncs in later is still refunded, once.
  const late = mergeWallet(r.wallet, hatchedWallet([[named('Spearow'), 0]], 'late'));
  const r2 = gacha.claimCutRefund(late, opts());
  assert.ok(r2.ok);
  assert.deepEqual(r2.lines.map(l => l.line), [named('Spearow')]);
  assert.equal(gacha.claimCutRefund(r2.wallet, opts()).ok, false);
});
test('a cut buddy is dropped, a cut shiny keeps its look elsewhere in Bored, and a cut banner egg hatches a kept legendary', () => {
  const [tauros] = ['Tauros'].map(named);
  let w = hatchedWallet([[tauros, 0]]);
  w.entries['hatch:cut-0.0'].x.sh = 1;
  w.entries['cfg:buddy:t'] = { at: 5, x: { s: tauros } };
  w.entries['cfg:look:t'] = { at: 6, x: { l: tauros, look: 'shiny' } };
  w = mergeWallet(w);
  const state = gachaState(w, TODAY);
  assert.equal(state.buddy, null);
  assert.equal(gacha.lookFor(state, tauros), 'shiny', 'Poké Idle still draws it shiny');
  // An unhatched banner egg pulled for a legendary that is now cut.
  let e = fresh({});
  e.entries['spend:banner'] = { at: 1, g: { regular: 0 }, x: { m: 'legend', e: [4], w: 0, n: 0, d: TODAY, b: named('Kubfu') } };
  e = mergeWallet(e);
  const hatched = hatchReady(e, opts({ rand: always(0.5) })).hatched;
  assert.equal(hatched.length, 1);
  assert.equal(hatched[0].species, bannerFor(TODAY));
  assert.ok(!gacha.isCut(hatched[0].species));
});

test('the banner legendary comes from the shared daily seed', () => {
  assert.equal(bannerFor(TODAY), bannerFor(TODAY));
  const week = new Set(['10', '11', '12', '13', '14', '15', '16'].map(d => bannerFor('2026-11-' + d)));
  assert.ok(week.size > 1, 'the banner changes from day to day');
});

test('rates follow the 256 table', () => {
  let wallet = fresh({ regular: 5000, waves: 0 });
  const counts = [0, 0, 0, 0, 0];
  const rand = seeded(7);
  for (let i = 0; i < 400; i++) {
    const result = pull(wallet, { voucher: 'regular', count: 1, machine: 'legend', rand });
    counts[result.eggs[0].tier]++;
    // Hatch nothing; drop the eggs by starting from the same funds each time but keep pity moving.
    wallet = result.wallet;
    if (gachaState(wallet, TODAY).eggs.length >= 99) wallet = fund(wallet, { waves: 1000 }), wallet = hatchReady(wallet, opts({ rand })).wallet;
  }
  // 400 eggs: about 317 Common and 69 Rare by the table, with pity adding Rares.
  assert.ok(counts[0] > 250 && counts[0] < 340, 'common ' + counts[0]);
  assert.ok(counts[1] > 40 && counts[1] < 110, 'rare ' + counts[1]);
});

test('rarity pity upgrades the next Common after 9 eggs with no Rare, and after 59 with no Epic', () => {
  let wallet = fresh({ regular: 200, waves: 100000 });
  const tiers = [];
  for (let i = 0; i < 60; i++) {
    const result = pull(wallet, { voucher: 'regular', count: 1, machine: 'move', rand: always(0) });
    tiers.push(result.eggs[0].tier);
    wallet = result.wallet;
  }
  assert.deepEqual(tiers.slice(0, 10), [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(tiers[19], 1);
  assert.equal(tiers[59], 2, 'the 60th egg is the Epic pity');
  assert.equal(gachaState(wallet, TODAY).pity.epic, 0);
});

test('Legendary UP counts each non-legendary egg double toward Legendary pity', () => {
  let wallet = fresh({ regular: 20 });
  wallet = pull(wallet, { voucher: 'regular', count: 1, machine: 'legend', rand: always(0) }).wallet;
  wallet = pull(wallet, { voucher: 'regular', count: 1, machine: 'move', rand: always(0) }).wallet;
  assert.equal(gachaState(wallet, TODAY).pity.legendary, 3);
});

test('Premium, Gold and ten Regulars carry their guarantee', () => {
  const low = always(0.01);
  const premium = pull(fresh({ premium: 1 }), { voucher: 'premium', rand: low });
  assert.equal(premium.eggs.length, 10);
  assert.ok(premium.eggs.some(e => e.tier >= 1));
  const gold = pull(fresh({ gold: 1 }), { voucher: 'gold', rand: low });
  assert.equal(gold.eggs.length, 25);
  assert.ok(gold.eggs.some(e => e.tier >= 2));
  const plus = pull(fresh({ plus: 1 }), { voucher: 'plus', rand: low });
  assert.equal(plus.eggs.length, 5);
  const ten = pull(fresh({ regular: 10 }), { voucher: 'regular', count: 10, rand: low });
  assert.ok(ten.eggs.some(e => e.tier >= 1));
  assert.equal(walletBalance(ten.wallet).regular, 2, 'ten spent, plus the first-pull starter mission');
  assert.equal(pullEggs(fresh({ regular: 5 }), opts({ count: 5 })).ok, false, 'only 1 or 10 Regulars at once');
});

test('a pull needs vouchers, an active wallet and room under 99 eggs', () => {
  assert.equal(pullEggs(fresh({}), opts()).reason, 'vouchers');
  assert.equal(pullEggs(fund({}, { regular: 1 }), opts()).reason, 'inactive');
  let wallet = fresh({ gold: 4 });
  for (let i = 0; i < 3; i++) wallet = pull(wallet, { voucher: 'gold' }).wallet;
  assert.equal(gachaState(wallet, TODAY).eggs.length, 75);
  assert.equal(pullEggs(wallet, opts({ voucher: 'gold' })).reason, 'full');
});

test('the first ten eggs hatch at once, and later eggs count down on waves earned after the pull', () => {
  let wallet = fresh({ regular: 11, waves: 50 });
  wallet = pull(wallet, { count: 10, rand: always(0) }).wallet;
  let state = gachaState(wallet, TODAY);
  assert.equal(state.eggs.length, 10);
  assert.ok(state.eggs.every(egg => egg.need === 0 && egg.ready && egg.free), 'the first ten need no waves');
  const first = hatchReady(wallet, opts({ rand: always(0) }));
  assert.equal(first.hatched.length, 10);
  const egg = first.hatched[0];
  assert.equal(egg.fresh, true);
  assert.equal(egg.shards, 0);
  wallet = first.wallet;
  state = gachaState(wallet, TODAY);
  assert.ok(state.owned.includes(egg.species));
  assert.ok(state.lines[egg.species].candy >= 10);
  assert.ok(state.lines[egg.species].skills.some(Boolean), 'the first hatch always gives a skill');
  assert.equal(state.missions.hatch, true);

  wallet = pull(wallet, { rand: always(0) }).wallet;
  state = gachaState(wallet, TODAY);
  assert.deepEqual([state.eggs[0].progress, state.eggs[0].need, state.eggs[0].ready, state.eggs[0].free], [0, 5, false, false],
    'the 11th egg waits, and waves banked before the pull do not count');
  assert.equal(hatchReady(wallet, opts()).hatched.length, 0);
  wallet = fund(wallet, { waves: 5 });
  const hatched = hatchReady(wallet, opts({ rand: always(0) }));
  assert.equal(hatched.hatched.length, 1);
  assert.equal(gachaState(hatched.wallet, TODAY).eggs.length, 0);
  assert.equal(hatchReady(hatched.wallet, opts()).hatched.length, 0, 'an egg hatches once');
});

test('the welcome pack: 1 Gold and 1000 coins with the starter pick, once per account, and once for accounts that picked before it', () => {
  const { pickStarter, WELCOME, WELCOME_ID } = gacha;
  const named = name => DEX.findIndex(row => row[0] === name) + 1;
  assert.deepEqual(WELCOME, { gold: 1, coins: 1000 });
  // A new account: the pick pays it, and says so.
  const picked = pickStarter(fresh({}), named('Charmander'), opts());
  assert.deepEqual(picked.welcome, WELCOME);
  assert.deepEqual([walletBalance(picked.wallet).gold, walletBalance(picked.wallet).coins], [1, 1000]);
  // The daily login does not pay it again.
  const later = claimLogin(picked.wallet, opts());
  assert.equal(later.welcome, null);
  assert.equal(walletBalance(later.wallet).gold, 1);
  // An account that picked before the pack existed: its next visit pays it, once.
  let old = pickStarter(fresh({}), named('Squirtle'), opts()).wallet;
  delete old.entries[WELCOME_ID];
  assert.equal(walletBalance(old).gold, 0);
  const first = claimLogin(old, opts());
  assert.deepEqual(first.welcome, WELCOME);
  assert.equal(first.login, true);
  const again = claimLogin(first.wallet, opts());
  assert.equal(again.welcome, null, 'once');
  assert.equal(walletBalance(again.wallet).gold, 1);
  // No starter yet: nothing until the pick.
  assert.equal(claimLogin(fresh({}), opts()).welcome, null);
  // Two devices that each got it: the merge pays once.
  const a = pickStarter(fresh({}), named('Charmander'), opts()).wallet, b = pickStarter(fresh({}), named('Charmander'), opts()).wallet;
  assert.equal(walletBalance(mergeWallet(a, b)).coins, 1000);
});

test('the starter pick: one first-stage starter plus three gifted commons, once per account', () => {
  const { pickStarter, STARTERS, STARTER_GIFTS } = gacha;
  const named = name => DEX.findIndex(row => row[0] === name) + 1;
  assert.equal(STARTERS.length, 27, 'gens 1-9');
  for (const num of STARTERS) assert.equal(DEX[num - 1][8], 0, DEX[num - 1][0] + ' is a first stage');
  assert.deepEqual(STARTER_GIFTS, [named('Geodude'), named('Pidgey'), named('Audino')]);
  assert.ok(STARTER_GIFTS.every(num => eggPools()[0].includes(num)), 'the gifts are commons');

  let wallet = fresh({});
  assert.equal(gachaState(wallet, TODAY).needsStarter, true);
  assert.equal(pickStarter({}, named('Charmander'), opts()).reason, 'inactive');
  assert.equal(pickStarter(wallet, named('Charmeleon'), opts()).reason, 'unknown', 'only first-stage starters');
  const picked = pickStarter(wallet, named('Charmander'), opts());
  assert.ok(picked.ok);
  wallet = picked.wallet;
  const state = gachaState(wallet, TODAY);
  assert.equal(state.needsStarter, false);
  assert.deepEqual(state.owned, [named('Charmander'), ...STARTER_GIFTS].sort((a, b) => a - b), 'a squad of four');
  assert.equal(state.lines[named('Charmander')].skills[0], true, 'the starter has its first skill');
  assert.equal(walletBalance(wallet).regular, 0, 'the pick pays no vouchers');
  assert.equal(pickStarter(wallet, named('Squirtle'), opts()).reason, 'picked', 'a second pick is refused');

  // Two devices that each picked offline: the earlier pick wins, and nothing doubles.
  const other = pickStarter(fresh({}), named('Squirtle'), { today: TODAY, now: NOW + 99e6 }).wallet;
  const merged = gachaState(mergeWallet(wallet, other), TODAY);
  assert.deepEqual(merged.owned, state.owned);

  // A hatched egg of a gifted species is a dupe.
  wallet = fund(wallet, { regular: 1 });
  wallet = pull(wallet, { rand: always(0) }).wallet;
  const pidgeyPool = eggPools()[0].indexOf(named('Pidgey'));
  const dupe = hatchReady(wallet, opts({ rand: () => (pidgeyPool + 0.5) / eggPools()[0].length })).hatched[0];
  assert.equal(dupe.species, named('Pidgey'));
  assert.equal(dupe.fresh, false);
});

test('an existing account with hatches and no pick is offered the starter once', () => {
  let wallet = fresh({ regular: 1, waves: 0 });
  wallet = pull(wallet, { rand: always(0) }).wallet;
  wallet = hatchReady(wallet, opts({ rand: always(0) })).wallet;
  const before = gachaState(wallet, TODAY);
  assert.equal(before.needsStarter, true);
  wallet = gacha.pickStarter(wallet, gacha.STARTERS[0], opts()).wallet;
  const after = gachaState(wallet, TODAY);
  assert.equal(after.needsStarter, false);
  assert.equal(after.owned.length, before.owned.length + 4);
});

test('an egg hatched on two devices pays once after the merge', () => {
  let wallet = fresh({ regular: 2, waves: 0 });
  wallet = pull(wallet, { rand: always(0) }).wallet;
  wallet = pull(wallet, { rand: always(0) }).wallet;
  wallet = fund(wallet, { waves: 10 });
  const a = hatchReady(wallet, opts({ rand: always(0) })).wallet;
  const b = hatchReady(wallet, opts({ rand: always(0.5) })).wallet;
  const merged = mergeWallet(a, b);
  assert.equal(gachaState(merged, TODAY).hatched.length, 2);
  const shards = walletBalance(merged).shards;
  assert.ok(shards === walletBalance(a).shards || shards === walletBalance(b).shards);
});

test('dupes give shards, and the 10th hatch after 9 dupes in a tier is new', () => {
  let wallet = fresh({ regular: 20, waves: 0 });
  for (let i = 0; i < 12; i++) wallet = pull(wallet, { rand: always(0.001) }).wallet;
  wallet = fund(wallet, { waves: 100 });
  // Always the first species in the pool. The 10th egg is a Rare from rarity
  // pity, so the 12 eggs hold 11 Commons: one new, nine dupes, then dupe pity.
  const { hatched, wallet: after } = hatchReady(wallet, opts({ rand: always(0.001) }));
  const commons = hatched.filter(h => h.tier === 0);
  assert.equal(commons[0].fresh, true);
  assert.ok(commons.slice(1, 10).every(h => !h.fresh && h.shards === 1), 'nine dupes, 1 shard each');
  assert.equal(commons[10].fresh, true, 'dupe pity forces a new species');
  assert.equal(walletBalance(after).shards, 9);
});

test('candy evolves, unlocks the passive and cuts the deploy cost in order', () => {
  let wallet = fresh({ regular: 3, waves: 0 });
  wallet = pull(wallet, { rand: always(0.001) }).wallet;
  wallet = pull(wallet, { rand: always(0.001) }).wallet;
  wallet = pull(wallet, { rand: always(0.001) }).wallet;
  wallet = fund(wallet, { waves: 100 });
  wallet = hatchReady(wallet, opts({ rand: always(0.001) })).wallet;
  const base = gachaState(wallet, TODAY).owned[0];
  const line = gacha.lineOf(base);
  assert.equal(gachaState(wallet, TODAY).lines[line].candy, 30);
  const next = gacha.evolutionsOf(base)[0];
  assert.ok(next, 'the first common species evolves');
  assert.equal(evolve(wallet, base, 1, opts()).reason, 'unknown');
  wallet = evolve(wallet, base, next, opts()).wallet;
  let state = gachaState(wallet, TODAY);
  assert.ok(state.owned.includes(next));
  assert.equal(state.lines[line].candy, 5);
  assert.equal(evolve(wallet, base, next, opts()).reason, 'owned');
  assert.equal(upgrade(wallet, line, 'passive', opts()).reason, 'candy');
  wallet = fund(wallet, { ['candy:' + line]: 200 });
  assert.equal(upgrade(wallet, line, 'cost2', opts()).reason, 'order');
  wallet = upgrade(wallet, line, 'passive', opts()).wallet;
  wallet = upgrade(wallet, line, 'cost1', opts()).wallet;
  wallet = upgrade(wallet, line, 'cost2', opts()).wallet;
  state = gachaState(wallet, TODAY);
  assert.deepEqual([state.lines[line].passive, state.lines[line].cost, state.lines[line].candy], [true, 2, 205 - 50 - 30 - 60]);
});

test('SP skins exist only for listed species: no list, no SP roll and nothing to buy', () => {
  gacha.setSkins([]);
  let wallet = fresh({ regular: 1, waves: 0 });
  wallet = pull(wallet, { machine: 'shiny', rand: always(0.001) }).wallet;
  wallet = fund(wallet, { waves: 10 });
  const egg = hatchReady(wallet, opts({ rand: always(0.001) }));
  assert.equal(egg.hatched[0].shiny, true, 'Shiny UP still rolls shinies');
  assert.equal(egg.hatched[0].sp, null, 'no skin in the list, so no SP roll');
  assert.equal(buySp(fund(egg.wallet, { shards: 300 }), 'anything', opts()).reason, 'unknown');
});

test('a listed skin rolls on Shiny UP only for its species, and the shard shop sells it', () => {
  const first = eggPools()[0][0];
  assert.equal(gacha.setSkins([{ id: 'test-skin', species: first, name: 'Test' }, { id: 'Bad Id', species: 1, name: 'x' }, { id: 'nobody', species: 99999, name: 'x' }]), 1,
    'malformed entries are dropped');
  let wallet = fresh({ regular: 2, waves: 0 });
  wallet = pull(wallet, { machine: 'shiny', rand: always(0.001) }).wallet;
  wallet = pull(wallet, { machine: 'move', rand: always(0.001) }).wallet;
  const hatched = hatchReady(fund(wallet, { waves: 10 }), opts({ rand: always(0.001) }));
  assert.equal(hatched.hatched[0].species, first);
  assert.equal(hatched.hatched[0].sp, 'test-skin', 'Shiny UP rolled the listed skin');
  assert.equal(hatched.hatched[1].sp, null, 'only Shiny UP rolls SP');
  let state = gachaState(hatched.wallet, TODAY);
  assert.deepEqual(state.lines[first].skins, ['test-skin']);
  assert.deepEqual(gacha.looksOf(state.lines[first]), ['normal', 'shiny', 'test-skin']);
  const worn = gacha.setLook(hatched.wallet, first, 'test-skin', opts()).wallet;
  assert.equal(gacha.lookFor(gachaState(worn, TODAY), first), 'test-skin');
  const next = gacha.evolutionsOf(first)[0];
  if (next) assert.equal(gacha.lookFor(gachaState(worn, TODAY), next), 'normal', 'a skin is drawn only on its own species');
  assert.equal(setBuddy(worn, first, opts({ skin: 'test-skin' })).ok, true);
  // The shop: someone without the skin buys it for 300 shards; nobody buys it twice.
  let other = fresh({ regular: 1, waves: 0 });
  other = pull(other, { machine: 'move', rand: always(0.001) }).wallet;
  other = hatchReady(fund(other, { waves: 10 }), opts({ rand: always(0.001) })).wallet;
  assert.equal(buySp(other, 'test-skin', opts()).reason, 'shards');
  other = buySp(fund(other, { shards: 300 }), 'test-skin', opts()).wallet;
  assert.deepEqual(gachaState(other, TODAY).lines[first].skins, ['test-skin']);
  assert.equal(walletBalance(other).shards, 0);
  assert.equal(buySp(fund(other, { shards: 300 }), 'test-skin', opts()).reason, 'owned');
  assert.equal(buySp(fresh({ shards: 300 }), 'test-skin', opts()).reason, 'not-owned', 'you need the line first');
  // A skin taken off the list stops counting, and the look falls back to normal.
  gacha.setSkins([]);
  assert.equal(gacha.lookFor(gachaState(worn, TODAY), first), 'normal');
  assert.deepEqual(gachaState(worn, TODAY).lines[first].skins, []);
});

test('the shipped SP list is valid, and every listed skin has its PNG', () => {
  const dir = path.join(root, 'src/games/content/poke-gacha/sp');
  const list = JSON.parse(fs.readFileSync(path.join(dir, 'skins.json'), 'utf8'));
  assert.ok(Array.isArray(list));
  assert.equal(gacha.setSkins(list), list.length, 'every entry is well formed');
  for (const skin of gacha.skinList()) for (const num of skin.forms) {
    const file = path.join(dir, gacha.skinFile(skin.id, num));
    assert.ok(fs.existsSync(file), gacha.skinFile(skin.id, num) + ' is missing');
    // 96x96 PNGs at 1x, like every other sprite.
    const png = fs.readFileSync(file);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [96, 96], gacha.skinFile(skin.id, num) + ' is 96x96');
  }
  // Every PNG in the folder belongs to a listed skin.
  const files = new Set(gacha.skinList().flatMap(skin => skin.forms.map(num => gacha.skinFile(skin.id, num))));
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.png')).filter(f => !files.has(f)), []);
  // Prices by size; Espeon and Umbreon are their own skins in the Eevee line.
  const price = id => gacha.skinPrice(gacha.skinList().find(skin => skin.id === id));
  assert.deepEqual(['charizard', 'clefairy-set', 'pidgey-set'].map(price), [300, 400, 500]);
  assert.deepEqual(gacha.skinList().filter(skin => gacha.lineOf(skin.species) === 133).map(skin => skin.id).sort(), ['eevee', 'espeon', 'umbreon']);
  gacha.setSkins([]);
});

test('SP sets: one skin covers each listed form, costs by size, and bad sets are dropped', () => {
  const first = eggPools()[0].find(num => gacha.evolutionsOf(num).length), next = gacha.evolutionsOf(first)[0];
  const other = eggPools()[0].find(num => gacha.lineOf(num) !== gacha.lineOf(first));
  assert.equal(gacha.skinFile('pidgey-set', 17), 'pidgey-set-17.png');
  assert.equal(gacha.setSkins([
    { id: 'line-set', name: 'Set', species: first, forms: [first, next] },
    { id: 'mixed', name: 'x', species: first, forms: [first, other] },
    { id: 'missing', name: 'x', species: first, forms: [next] },
    { id: 'too-big', name: 'x', species: first, forms: [first, next, first + 1000, 1] }
  ]), 1, 'a set must hold its own species and only forms of its line');
  assert.equal(gacha.skinPrice(gacha.skinList()[0]), 400);
  let wallet = fresh({ regular: 1, waves: 0 });
  wallet = pull(wallet, { machine: 'move', rand: always(0.001) }).wallet;
  wallet = hatchReady(fund(wallet, { waves: 10 }), opts({ rand: always(0.001) })).wallet;
  assert.equal(buySp(fund(wallet, { shards: 399 }), 'line-set', opts()).reason, 'shards', 'a two-form set is 400');
  wallet = buySp(fund(wallet, { shards: 400 }), 'line-set', opts()).wallet;
  const worn = gacha.setLook(wallet, first, 'line-set', opts()).wallet;
  const state = gachaState(worn, TODAY);
  assert.deepEqual([gacha.lookFor(state, first), gacha.lookFor(state, next)], ['line-set', 'line-set'], 'both forms wear the set');
  assert.equal(setBuddy(worn, first, opts({ skin: 'line-set' })).ok, true);
  gacha.setSkins([]);
});

test('Shiny UP rolls a skin for the line it hatches, even one drawn for an evolution, never one already owned', () => {
  const first = eggPools()[0].find(num => gacha.evolutionsOf(num).length), next = gacha.evolutionsOf(first)[0];
  gacha.setSkins([{ id: 'evolved', name: 'Evolved', species: next }, { id: 'base', name: 'Base', species: first }]);
  let wallet = fresh({ regular: 3, waves: 0 });
  for (let i = 0; i < 3; i++) wallet = pull(wallet, { machine: 'shiny', rand: always(0.001) }).wallet;
  const out = hatchReady(fund(wallet, { waves: 30 }), opts({ rand: always(0.001) }));
  assert.deepEqual(out.hatched.map(h => [h.species, h.sp]), [[first, 'evolved'], [first, 'base'], [first, null]],
    'one of the line\'s skins at random, then the one left, then none');
  assert.deepEqual(gachaState(out.wallet, TODAY).lines[first].skins, ['evolved', 'base']);
  const look = gachaState(gacha.setLook(out.wallet, first, 'evolved', opts()).wallet, TODAY);
  assert.deepEqual([gacha.lookFor(look, first), gacha.lookFor(look, next)], ['normal', 'evolved'], 'a single skin draws only on its own form');
  gacha.setSkins([]);
});

test('the buddy must be owned, its look unlocked, and the latest choice wins', () => {
  let wallet = fresh({ regular: 2, waves: 0 });
  wallet = pull(wallet, { rand: always(0.9) }).wallet;
  wallet = pull(wallet, { rand: always(0.1) }).wallet;
  wallet = hatchReady(fund(wallet, { waves: 100 }), opts({ rand: always(0.9) })).wallet;
  const [a, b] = gachaState(wallet, TODAY).owned;
  assert.equal(setBuddy(wallet, 25, opts()).reason, 'not-owned');
  assert.equal(setBuddy(wallet, a, opts({ shiny: true })).reason, 'locked');
  assert.equal(setBuddy(wallet, a, opts({ skin: 'not-a-skin' })).reason, 'locked');
  wallet = setBuddy(wallet, a, opts()).wallet;
  wallet = setBuddy(wallet, b || a, opts()).wallet;
  const state = gachaState(wallet, TODAY);
  assert.equal(state.buddy.species, b || a);
  assert.equal(state.missions.buddy, true);
});

test('the daily login pays three Regulars once a day', () => {
  let wallet = fresh({});
  wallet = claimLogin(wallet, opts()).wallet;
  assert.equal(claimLogin(wallet, opts()).ok, false);
  wallet = claimLogin(wallet, opts({ today: '2026-11-17' })).wallet;
  assert.equal(walletBalance(wallet).regular, 6);
  assert.equal(claimLogin(fund({}, {}), opts()).ok, false, 'not before Poké Gacha has been opened');
});

test('skills come from the line\'s types', () => {
  const named = name => DEX.findIndex(row => row[0] === name) + 1;
  assert.deepEqual(gacha.skillsOf(named('Charmander')), ['Ember', 'Flame Wheel', 'Fire Spin', 'Overheat']);
  assert.deepEqual(gacha.skillsOf(named('Bulbasaur')), ['Vine Whip', 'Razor Leaf', 'Poison Sting', 'Solar Beam']);
  assert.deepEqual(gacha.skillsOf(named('Venusaur')), gacha.skillsOf(named('Bulbasaur')), 'shared by the line');
  assert.equal(gacha.stageOf(named('Venusaur')), 3);
});

test('a line wears one look across Bored, and only one it has unlocked', () => {
  let wallet = fresh({ regular: 1, waves: 0 });
  wallet = pull(wallet, { machine: 'shiny', rand: always(0.001) }).wallet;
  wallet = hatchReady(fund(wallet, { waves: 10 }), opts({ rand: always(0.001) })).wallet;
  const line = gachaState(wallet, TODAY).owned[0];
  assert.equal(gacha.lookFor(gachaState(wallet, TODAY), line), 'normal');
  assert.equal(gacha.setLook(wallet, line, 'sp', opts()).reason, 'locked', 'no such skin');
  wallet = gacha.setLook(wallet, line, 'shiny', opts()).wallet;
  wallet = gacha.setLook(wallet, line, 'normal', opts()).wallet;
  wallet = gacha.setLook(wallet, line, 'shiny', opts()).wallet;
  assert.equal(gachaState(wallet, TODAY).lines[line].look, 'shiny', 'the latest choice wins');
  const next = gacha.evolutionsOf(line)[0];
  if (next) assert.equal(gacha.lookFor(gachaState(wallet, TODAY), next), 'shiny', 'evolutions share the line\'s look');
  assert.equal(gacha.lookFor(gachaState(wallet, TODAY), 25), 'normal');
  let plain = fresh({ regular: 1, waves: 0 });
  plain = pull(plain, { machine: 'move', rand: always(0.001) }).wallet;
  plain = hatchReady(fund(plain, { waves: 10 }), opts({ rand: always(0.9) })).wallet;
  const own = gachaState(plain, TODAY).owned[0];
  assert.equal(gacha.setLook(plain, own, 'shiny', opts()).reason, 'locked');
});

test('candy by count: exactly the missing candy at 40 coins each, within 50 per line a day; refusals say how far off', () => {
  const { buyCandy, candyOffer, COIN_SHOP } = gacha;
  assert.equal(COIN_SHOP.candy.each, 40);
  const owning = coins => { let w = fresh({ regular: 1, coins }); w = pull(w, { machine: 'move', rand: always(0.001) }).wallet;
    return hatchReady(fund(w, { waves: 10 }), opts({ rand: always(0.001) })).wallet; };
  let w = owning(2000);
  const line = gacha.lineOf(gachaState(w, TODAY).owned[0]);
  const before = gachaState(w, TODAY).lines[line].candy;
  assert.deepEqual(candyOffer(w, line, 7, { today: TODAY }), { count: 7, coins: 280, left: 50, have: 2000, short: 0, fits: true });
  const r = buyCandy(w, line, opts({ count: 7 }));
  assert.ok(r.ok); assert.deepEqual([r.count, r.coins], [7, 280]);
  w = r.wallet;
  assert.equal(gachaState(w, TODAY).lines[line].candy - before, 7, 'exactly 7');
  assert.equal(walletBalance(w).coins, 2000 - 280);
  assert.equal(gachaState(w, TODAY).shop.candyToday[line], 7, 'the cap counts what was bought, not packs');
  // The default is still the 5-pack for 200.
  w = buyCandy(w, line, opts()).wallet;
  assert.equal(gachaState(w, TODAY).shop.candyToday[line], 12);
  // Over today's cap: refused, with what is left.
  const over = buyCandy(w, line, opts({ count: 39 }));
  assert.deepEqual([over.ok, over.reason, over.left], [false, 'limit', 38]);
  // Short of coins: refused, with how many coins short.
  const poor = owning(100);
  const no = buyCandy(poor, line, opts({ count: 3 }));
  assert.deepEqual([no.ok, no.reason, no.short], [false, 'coins', 20]);
  assert.equal(candyOffer(poor, line, 3, { today: TODAY }).short, 20);
});

test('coin shop: candy for a caught line, 50 a line a day; shards, 50 a week; preset slots up to 5, permanent', () => {
  const { buyCandy, buyShards, buyPreset, COIN_SHOP } = gacha;
  let w = fresh({ regular: 1, coins: 20000 });
  w = pull(w, { machine: 'move', rand: always(0.001) }).wallet;
  w = hatchReady(fund(w, { waves: 10 }), opts({ rand: always(0.001) })).wallet;
  const line = gacha.lineOf(gachaState(w, TODAY).owned[0]);
  const candy = wallet => walletBalance(wallet)['candy:' + line] || 0, coins = wallet => walletBalance(wallet).coins;
  // Candy: 200 coins for 5, only for a line you have, ten buys (50 candy) a day.
  assert.equal(buyCandy(w, 99999, opts()).reason, 'not-owned');
  const c0 = candy(w), m0 = coins(w);
  for (let i = 0; i < 10; i++) w = buyCandy(w, line, opts()).wallet;
  assert.equal(candy(w) - c0, 50);
  assert.equal(m0 - coins(w), 2000);
  assert.equal(buyCandy(w, line, opts()).reason, 'limit', 'the 11th buy today is refused');
  assert.equal(gachaState(w, TODAY).shop.candyToday[line], 50);
  assert.ok(buyCandy(w, line, { today: '2026-11-17', now: later() }).ok, 'a new day opens again');
  // Shards: 500 coins for 10, five buys a week; next Monday opens again.
  const s0 = walletBalance(w).shards || 0;
  for (let i = 0; i < 5; i++) w = buyShards(w, opts()).wallet;
  assert.equal((walletBalance(w).shards || 0) - s0, 50);
  assert.equal(buyShards(w, opts()).reason, 'limit');
  assert.equal(gachaState(w, TODAY).shop.shardsLeft, 0);
  assert.equal(buyShards(w, { today: '2026-11-22', now: later() }).reason, 'limit', 'Sunday is the same week');
  assert.ok(buyShards(w, { today: '2026-11-23', now: later() }).ok, 'Monday is a new week');
  // Presets: 3 to start; the 4th costs 500, the 5th 1000; then no more.
  assert.equal(gachaState(w, TODAY).shop.presets, COIN_SHOP.presets.start);
  let m = coins(w);
  w = buyPreset(w, opts()).wallet;
  assert.equal(m - coins(w), 500);
  m = coins(w);
  w = buyPreset(w, opts()).wallet;
  assert.equal(m - coins(w), 1000);
  assert.equal(gachaState(w, TODAY).shop.presets, 5);
  assert.equal(buyPreset(w, opts()).reason, 'owned');
  // Not enough coins is refused and charges nothing.
  const poor = fresh({ coins: 100 });
  assert.equal(buyShards(poor, opts()).reason, 'coins');
  // Two devices buying the same slot offline merge to one purchase, not two.
  const a = buyShards(w, { today: '2026-11-30', now: later() }).wallet, b = buyShards(w, { today: '2026-11-30', now: later() }).wallet;
  const merged = mergeWallet(a, b);
  assert.equal(Object.keys(merged.entries).filter(id => id.startsWith('spend:shards:2026-11-30')).length, 1);
  assert.equal(walletBalance(merged).shards, walletBalance(a).shards, 'paid and received once');
});
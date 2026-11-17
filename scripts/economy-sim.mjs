// A normal player's month in coins and vouchers, from the real reward tables.
// Report only: `node scripts/economy-sim.mjs`. It changes nothing.
//
// The player (edit PLAYER to try others):
//   Pokédoku: the daily board in 2 of the 3 modes on 4 days a week, one random
//             board on those days, one perfect board a week;
//   Poké Idle: about 20 catches a day, a badge and 5 tower floors a week, no shinies;
//   Poké Gacha: opens it every day (login), plays 2 TD stages a day, clearing a new
//             stage each time until the story runs out, 3-starring half of them;
//             finishes 2 of the 4 daily missions, and the "3-star 5 stages" weekly.
import { DOKU, PI_RATES, COINS_PER_REGULAR, VOUCHER_VALUE } from '../src/hub/rewards.js';
import { LOGIN } from '../src/hub/gacha.js';
import { STAGES, FIRST_CLEAR, FIRST_STAR3, DAILY_REWARD, DAILY_ALL, WEEKLY_REWARD, WEEKLY_ALL, levelCost, MAX_LEVEL } from '../src/hub/td.js';

export const PLAYER = { dokuDays: 4, dokuModes: 2, dokuRandom: 1, dokuPerfectPerWeek: 1, piCatchesPerDay: 20, piBadgesPerWeek: 1, piTowerPerWeek: 5,
  tdStagesPerDay: 2, star3Share: 0.5, dailyMissionsDone: 2, weeklyMissionsDone: 1 };

export function simulate(weeks = 4, p = PLAYER) {
  const out = [];
  let cleared = 0, starred = 0;
  for (let w = 1; w <= weeks; w++) {
    const g = { coins: 0, regular: 0, plus: 0, premium: 0, gold: 0, waves: 0 };
    const add = (grant, n = 1) => { for (const [k, v] of Object.entries(grant)) g[k] = (g[k] || 0) + v * n; };
    // Pokédoku
    add(DOKU.daily, p.dokuDays * p.dokuModes);
    add(DOKU.random, p.dokuDays * Math.min(p.dokuRandom, DOKU.randomPerDay));
    add(DOKU.perfect, p.dokuPerfectPerWeek);
    if (p.dokuModes === 3) add(DOKU.all3, p.dokuDays);
    // Poké Idle
    add(PI_RATES.caught, p.piCatchesPerDay * 7);
    add(PI_RATES.badges, p.piBadgesPerWeek);
    add(PI_RATES.tower, p.piTowerPerWeek);
    // Poké Gacha: login and tower defense
    add(LOGIN, 7);
    for (let d = 0; d < 7; d++) for (let s = 0; s < p.tdStagesPerDay; s++) {
      if (cleared < STAGES.length) { cleared++; add(FIRST_CLEAR); }
      if (starred < Math.floor(cleared * p.star3Share)) { starred++; add(FIRST_STAR3); }
    }
    add(DAILY_REWARD, 7 * p.dailyMissionsDone);
    if (p.dailyMissionsDone >= 4) add(DAILY_ALL, 7);
    add(WEEKLY_REWARD, p.weeklyMissionsDone);
    if (p.weeklyMissionsDone >= 5) add(WEEKLY_ALL);
    const pulls = g.regular + g.plus * 5 + g.premium * 10 + g.gold * 25;
    out.push({ week: w, ...g, coinPulls: Math.floor(g.coins / COINS_PER_REGULAR), pulls, clearedSoFar: cleared });
  }
  return out;
}
// Coins to raise one mon from Lv 1 to `to`, and a squad of 8.
export const levelBill = to => { let c = 0; for (let l = 1; l < to; l++) c += levelCost(l); return c; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = simulate(4);
  console.log('week | coins | waves | Regular | Plus | Premium | Gold | eggs from vouchers | + eggs if all coins buy Regulars | stages cleared');
  for (const r of rows) console.log([r.week, r.coins, r.waves, r.regular, r.plus, r.premium, r.gold, r.pulls, r.coinPulls, r.clearedSoFar].join(' | '));
  console.log('\nLevel costs (40 x level): one mon to Lv 3 = ' + levelBill(3) + ', Lv 5 = ' + levelBill(5) + ', Lv ' + MAX_LEVEL + ' = ' + levelBill(MAX_LEVEL) +
    '; a squad of 8 to Lv 3 = ' + 8 * levelBill(3) + ', to Lv 5 = ' + 8 * levelBill(5) + ', to Lv ' + MAX_LEVEL + ' = ' + 8 * levelBill(MAX_LEVEL));
  console.log('Voucher value in coins: ' + JSON.stringify(VOUCHER_VALUE));
}

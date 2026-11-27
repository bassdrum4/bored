// Relic Song, hub side: coin payouts and optional crossover state.
//
// The game calls this through parent.__boredGacha.relic, the same door Poké
// Gacha uses, so every coin lands in the one ledger that syncs to the account.
// Ledger entries (src/hub/rewards.js), each written once:
//   rs:clear:<song>:<diff>          the first clear of a song on a difficulty
//   rs:rank:<song>:<diff>:<rank>    the first time the best rank reached b, a or s
// A rank reached again, or a lower one, finds its entry already there and pays nothing.
// The amounts come from the game's PAY config; this side caps each one.
import { readWallet, writeWallet, grantOnce, walletBalance } from './rewards.js';
import { storedBuddy } from './gacha.js';
import { DEX, DEX_TYPES, DEX_CHART } from './gacha-dex.js';
import { rouletteGames } from './roulette.js';
import { hasIdentity } from './backend.js';

export const RELIC = Object.freeze({
  // The most one ledger entry may pay, whatever the page asks for.
  maxPay: 400,
  ranks: Object.freeze(['c', 'b', 'a', 's']),
  diffs: Object.freeze(['ez', 'hd', 'in', 'at'])
});
const SONG = /^[a-z0-9-]{1,32}$/;
const coinsIn = n => Math.max(0, Math.min(RELIC.maxPay, Math.floor(Number(n) || 0)));

/**
 * Pay a finished song: the first clear on this difficulty, then each rank step
 * (b, a, s) the first time the best rank reaches it. `rankPay` is per step.
 * Returns the wallet and what was paid this time ({ clear, rank, total }).
 */
export function payRelicSong(wallet, { song, diff, rank, clearPay, rankPay } = {}, { now = Date.now() } = {}) {
  let next = wallet;
  const paid = { clear: 0, rank: 0, total: 0 };
  const r = RELIC.ranks.indexOf(rank);
  if (!SONG.test(String(song || '')) || !RELIC.diffs.includes(diff) || r < 0) return { wallet: next, ok: false, reason: 'song', paid };
  const base = 'rs:clear:' + song + ':' + diff;
  const clear = coinsIn(clearPay);
  if (clear > 0) {
    const g = grantOnce(next, base, { coins: clear }, { now });
    next = g.wallet;
    if (g.changed) paid.clear = clear;
  }
  const step = coinsIn(rankPay);
  for (let k = 1; k <= r && step > 0; k++) {
    const g = grantOnce(next, 'rs:rank:' + song + ':' + diff + ':' + RELIC.ranks[k], { coins: step }, { now });
    next = g.wallet;
    if (g.changed) paid.rank += step;
  }
  paid.total = paid.clear + paid.rank;
  return { wallet: next, ok: true, paid };
}

/** How the buddy's types hit a defender's: the best of its types, 0 to 4. */
export function typeEdge(species, defend) {
  const row = DEX[Math.trunc(Number(species)) - 1];
  if (!row) return 1;
  const mult = { 0: 0, h: 0.5, 1: 1, 2: 2 };
  const cols = [].concat(defend || []).map(t => DEX_TYPES.indexOf(t)).filter(i => i >= 0);
  let best = 0;
  for (const t of String(row[1]).split('/')) {
    const a = DEX_TYPES.indexOf(t);
    if (a < 0) continue;
    best = Math.max(best, cols.reduce((m, c) => m * mult[DEX_CHART[a][c]], 1));
  }
  return best;
}

/* ── The bridge ────────────────────────────────────────────────────────────── */
export function relicBridge({ onChange = () => {} } = {}) {
  return {
    // Coins, the buddy (the one Shotgun Roulette shows next to your name), and
    // whether Origin Giratina has ever lost to you at the Roulette table.
    state: () => {
      const wallet = readWallet();
      let originWin = false;
      try { originWin = rouletteGames(wallet).some(game => game.mode === 'hard' && game.won); } catch {}
      return { coins: walletBalance(wallet).coins || 0, buddy: storedBuddy(), originWin, signedIn: hasIdentity() };
    },
    typeEdge,
    nameOf: species => (DEX[Math.trunc(Number(species)) - 1] || ['?'])[0],
    typesOf: species => String((DEX[Math.trunc(Number(species)) - 1] || [, ''])[1]).split('/').filter(Boolean),
    pay: options => {
      const result = payRelicSong(readWallet(), options || {});
      if (result.ok && result.paid.total > 0) { writeWallet(result.wallet); try { onChange(); } catch {} }
      return { ok: result.ok, reason: result.reason, paid: result.paid, coins: walletBalance(readWallet()).coins || 0 };
    }
  };
}

// Relic Song, hub side: coin payouts and optional crossover state.
//
// The game calls this through parent.__boredGacha.relic, the same door Poké
// Gacha uses, so every coin lands in the one ledger that syncs to the account.
// Ledger entries (src/hub/rewards.js), each written once:
//   rs:clear:<song>:<diff>          the first clear of a song on a difficulty
//   rs:rank:<song>:<diff>:<rank>    the first time the best rank reached b, a or s
//   rs:badge:<gym>                  a gym boss's first clear, on any difficulty (gyms 0-3)
//   rs:finale                       the final boss's first clear
//   rs:lesson                       finishing Meloetta's Lesson, the tutorial (once, however often it's replayed)
//   rs:top:<entry without rs:>      once only: the rest of an entry that paid under today's table
// A rank reached again, or a lower one, finds its entry already there and pays nothing.
// The amounts come from the game's PAY table; this side caps each one.
import { readWallet, writeWallet, grantOnce, walletBalance } from './rewards.js';
import { storedBuddy } from './gacha.js';
import { DEX, DEX_TYPES, DEX_CHART } from './gacha-dex.js';
import { rouletteGames } from './roulette.js';
import { hasIdentity } from './backend.js';

export const RELIC = Object.freeze({
  // The most one ledger entry may pay, whatever the page asks for. It is also the most one
  // run can pay: the finale's first AT clear at S is 400 + 100 + 200 + 400 + 500.
  maxPay: 1600,
  ranks: Object.freeze(['c', 'b', 'a', 's']),
  diffs: Object.freeze(['ez', 'hd', 'in', 'at'])
});
const SONG = /^[a-z0-9-]{1,32}$/;
const coinsIn = n => Math.max(0, Math.min(RELIC.maxPay, Math.floor(Number(n) || 0)));

// What an entry is worth under the page's table: { clear: {ez..}, rank: {b,a,s}, mult: {ez..}, badge, finale }.
function worth(table, id) {
  const t = table || {};
  let m = /^rs:clear:[a-z0-9-]+:(ez|hd|in|at)$/.exec(id);
  if (m) return coinsIn((t.clear || {})[m[1]]);
  m = /^rs:rank:[a-z0-9-]+:(ez|hd|in|at):(b|a|s)$/.exec(id);
  if (m) return coinsIn(Math.round(((t.rank || {})[m[2]] || 0) * ((t.mult || {})[m[1]] || 0)));
  if (/^rs:badge:[0-3]$/.test(id)) return coinsIn(t.badge);
  if (id === 'rs:finale') return coinsIn(t.finale);
  if (id === 'rs:lesson') return coinsIn(t.lesson);
  return 0;
}

// Pay an entry once; an entry already paid under an older, smaller table gets the rest, once.
function settle(wallet, id, table, now) {
  const want = worth(table, id);
  if (!(want > 0)) return { wallet, paid: 0 };
  const had = wallet.entries && wallet.entries[id];
  if (!had) {
    const g = grantOnce(wallet, id, { coins: want }, { now });
    return { wallet: g.wallet, paid: g.changed ? want : 0 };
  }
  const rest = want - Math.max(0, Number(had.g && had.g.coins) || 0);
  if (rest <= 0) return { wallet, paid: 0 };
  const g = grantOnce(wallet, 'rs:top:' + id.slice(3), { coins: rest }, { now });
  return { wallet: g.wallet, paid: g.changed ? rest : 0 };
}

/**
 * Bring old entries up to today's table: top up every rs:clear / rs:rank entry that
 * paid less, and pay the badge (and finale) for every boss whose clear is already in
 * the ledger. `bosses` maps a boss song to its gym (0-3); `final` is the finale's song.
 */
export function topUpRelicSong(wallet, { table, bosses = {}, final = '' } = {}, { now = Date.now() } = {}) {
  let next = wallet;
  let paid = 0;
  const ids = Object.keys((next && next.entries) || {}).filter(id => /^rs:(clear|rank):/.test(id));
  const due = new Set(ids);
  for (const id of ids) {
    const song = id.split(':')[2];
    if (Object.prototype.hasOwnProperty.call(bosses, song)) due.add('rs:badge:' + bosses[song]);
    if (song && song === final) due.add('rs:finale');
  }
  for (const id of due) { const r = settle(next, id, table, now); next = r.wallet; paid += r.paid; }
  return { wallet: next, paid };
}

/**
 * Pay a finished song from the page's PAY table: the first clear on this difficulty,
 * each rank step (b, a, s) the first time the best rank reaches it, the gym's badge on a
 * boss's first clear, the finale's bonus. Older, smaller entries are topped up on the way.
 * Returns the wallet and what was paid this time ({ clear, rank, badge, finale, top, total }).
 */
export function payRelicSong(wallet, { song, diff, rank, table, badge = null, finale = false, bosses = {}, final = '' } = {}, { now = Date.now() } = {}) {
  let next = wallet;
  const paid = { clear: 0, rank: 0, badge: 0, finale: 0, top: 0, total: 0 };
  const r = RELIC.ranks.indexOf(rank);
  if (!SONG.test(String(song || '')) || !RELIC.diffs.includes(diff) || r < 0) return { wallet: next, ok: false, reason: 'song', paid };
  const run = [['clear', 'rs:clear:' + song + ':' + diff]];
  for (let k = 1; k <= r; k++) run.push(['rank', 'rs:rank:' + song + ':' + diff + ':' + RELIC.ranks[k]]);
  if (Number.isInteger(badge) && badge >= 0 && badge <= 3) run.push(['badge', 'rs:badge:' + badge]);
  if (finale) run.push(['finale', 'rs:finale']);
  for (const [kind, id] of run) {
    const fresh = !(next.entries && next.entries[id]);
    const s = settle(next, id, table, now);
    next = s.wallet;
    paid[fresh ? kind : 'top'] += s.paid;
  }
  const up = topUpRelicSong(next, { table, bosses, final }, { now });
  next = up.wallet; paid.top += up.paid;
  paid.total = paid.clear + paid.rank + paid.badge + paid.finale + paid.top;
  return { wallet: next, ok: true, paid };
}

/** Pay Meloetta's Lesson once: the table's `lesson` amount, the first time it's finished. */
export function payRelicLesson(wallet, { table } = {}, { now = Date.now() } = {}) {
  const s = settle(wallet, 'rs:lesson', table, now);
  return { wallet: s.wallet, ok: true, paid: s.paid };
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
    },
    // Finishing the tutorial: its small bonus, once.
    lesson: options => {
      const result = payRelicLesson(readWallet(), options || {});
      if (result.paid > 0) { writeWallet(result.wallet); try { onChange(); } catch {} }
      return { ok: true, paid: result.paid, coins: walletBalance(readWallet()).coins || 0 };
    },
    // On load: old payouts brought up to today's table, once.
    topUp: options => {
      const result = topUpRelicSong(readWallet(), options || {});
      if (result.paid > 0) { writeWallet(result.wallet); try { onChange(); } catch {} }
      return { paid: result.paid, coins: walletBalance(readWallet()).coins || 0 };
    }
  };
}

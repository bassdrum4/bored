// Relic Song, hub side: token payouts and optional crossover state.
//
// The game calls this through parent.__boredGacha.relic, the same door Poké
// Gacha uses, so every payout lands in the one ledger that syncs to the account.
// Relic Song pays tokens: `chips`, the arcade's collection tokens that Shotgun Roulette bets
// and the Collector uses. It paid TD coins until then; those stay where they are (coins never
// turn into chips). The page's table says which: unit 'chips' pays chips under rt: entries, a
// table without a unit pays coins under rs: entries, as before. A coin entry and a token entry
// are different entries, so every chart, rank, badge, champion, the finale and the lesson pay
// tokens once, fresh, whatever they paid in coins.
// Ledger entries (src/hub/rewards.js), each written once (rt: in place of rs: for tokens):
//   rs:clear:<song>:<diff>          the first clear of a song on a difficulty
//   rs:rank:<song>:<diff>:<rank>    the first time the best rank reached b, a or s
//   rs:badge:<gym>                  a gym boss's first clear, on any difficulty (gyms 0-3)
//   rs:finale                       the final boss's first clear
//   rs:champion:<region>            a region champion's first clear
//   rs:lesson                       finishing Meloetta's Lesson, the tutorial (once, however often it's replayed)
// A ledger version (the page's `ledger`, e.g. r2 for the Kanto remaster) goes in front of a chart's
// entries: rs:r2:clear:<song>:<diff>, rs:r2:rank:<song>:<diff>:<rank>. Charts that were rewritten pay
// again under their new entries; the old ones stay paid. Badges, the finale and the lesson have none.
//   rs:top:<entry without rs:>      once only: the rest of an entry that paid under today's table
// A rank reached again, or a lower one, finds its entry already there and pays nothing.
// The amounts come from the game's PAY table; this side caps each one.
//
// Two shapes of table. The old one names amounts by difficulty ({ clear: {ez..}, rank: {b,a,s},
// mult: {ez..} }) and tops up entries paid under a smaller one. Today's names every chart
// ({ charts: { 'song:diff': { clear, a, s } } }, paid by the chart's measured level) and says
// topUp: false: an entry already in the ledger, under any table, is paid and pays nothing more,
// so nobody loses coins and nothing is paid twice; only new entries pay, at today's amounts.
import { readWallet, writeWallet, grantOnce, walletBalance } from './rewards.js';
import { readStored, writeStored, removeStored, readStoredPrefix } from './store.js';
import { storedBuddy } from './gacha.js';
import { DEX, DEX_TYPES, DEX_CHART } from './gacha-dex.js';
import { rouletteGames } from './roulette.js';
import { hasIdentity } from './backend.js';

export const RELIC = Object.freeze({
  // The most one ledger entry may pay, whatever the page asks for. It is also more than one run can
  // pay: the finale's first AT clear at S, at Lv.15, is 450 + 115 + 225 + 500.
  maxPay: 1600,
  ranks: Object.freeze(['c', 'b', 'a', 's']),
  diffs: Object.freeze(['ez', 'hd', 'in', 'at'])
});
const SONG = /^[a-z0-9-]{1,32}$/;
const LEDGER = /^r\d{1,3}$/;
// A chart's entry, with or without a ledger version: [, rs|rt, version, clear|rank, song, diff, rank].
const CHART_ENTRY = /^(rs|rt):(?:(r\d{1,3}):)?(clear|rank):([a-z0-9-]+):(ez|hd|in|at)(?::(b|a|s))?$/;
const coinsIn = n => Math.max(0, Math.min(RELIC.maxPay, Math.floor(Number(n) || 0)));
// What a table pays in, and the entries it pays under: tokens (chips, rt:) or, before tokens, coins (rs:).
const unitOf = table => table && table.unit === 'chips' ? 'chips' : 'coins';
const keyOf = table => unitOf(table) === 'chips' ? 'rt' : 'rs';

// What an entry is worth under the page's table (either shape, above).
function worth(table, id) {
  const t = table || {};
  const chart = (song, diff) => (t.charts && t.charts[song + ':' + diff]) || {};
  const m = CHART_ENTRY.exec(id);
  if (m && m[3] === 'clear' && !m[6]) return coinsIn(t.charts ? chart(m[4], m[5]).clear : (t.clear || {})[m[5]]);
  if (m && m[3] === 'rank' && m[6]) return coinsIn(t.charts ? chart(m[4], m[5])[m[6]] : Math.round(((t.rank || {})[m[6]] || 0) * ((t.mult || {})[m[5]] || 0)));
  if (/^r[st]:badge:[0-3]$/.test(id)) return coinsIn(t.badge);
  if (/^r[st]:champion:[a-z0-9-]{1,32}$/.test(id)) return coinsIn(t.champion);
  if (/^r[st]:finale$/.test(id)) return coinsIn(t.finale);
  if (/^r[st]:lesson$/.test(id)) return coinsIn(t.lesson);
  return 0;
}

// Pay an entry once; an entry already paid under an older, smaller table gets the rest, once.
function settle(wallet, id, table, now) {
  const want = worth(table, id), unit = unitOf(table);
  if (!(want > 0)) return { wallet, paid: 0 };
  const had = wallet.entries && wallet.entries[id];
  if (!had) {
    const g = grantOnce(wallet, id, { [unit]: want }, { now });
    return { wallet: g.wallet, paid: g.changed ? want : 0 };
  }
  if (table && table.topUp === false) return { wallet, paid: 0 };
  const rest = want - Math.max(0, Number(had.g && had.g[unit]) || 0);
  if (rest <= 0) return { wallet, paid: 0 };
  const g = grantOnce(wallet, keyOf(table) + ':top:' + id.slice(3), { [unit]: rest }, { now });
  return { wallet: g.wallet, paid: g.changed ? rest : 0 };
}

/**
 * Bring old entries up to today's table: top up every rs:clear / rs:rank entry that
 * paid less (old-shape tables only), and pay the badge (and finale, and champion) for every
 * boss whose clear is already in the ledger but whose bonus isn't. `bosses` maps a boss song to
 * its gym (0-3); `final` is the finale's song; `champions` maps a champion song to its region.
 */
export function topUpRelicSong(wallet, { table, bosses = {}, final = '', champions = {} } = {}, { now = Date.now() } = {}) {
  let next = wallet;
  let paid = 0;
  // Only the table's own unit: a coin clear never makes a token badge due, or the other way round.
  const k = keyOf(table);
  const ids = Object.keys((next && next.entries) || {}).filter(id => { const m = CHART_ENTRY.exec(id); return m && m[1] === k; });
  const due = new Set(ids);
  for (const id of ids) {
    const song = CHART_ENTRY.exec(id)[4];
    if (Object.prototype.hasOwnProperty.call(bosses, song)) due.add(k + ':badge:' + bosses[song]);
    if (song && song === final) due.add(k + ':finale');
    if (Object.prototype.hasOwnProperty.call(champions, song) && SONG.test(String(champions[song]))) due.add(k + ':champion:' + champions[song]);
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
export function payRelicSong(wallet, { song, diff, rank, table, badge = null, finale = false, champion = null, bosses = {}, final = '', champions = {}, ledger = '' } = {}, { now = Date.now() } = {}) {
  let next = wallet;
  const paid = { clear: 0, rank: 0, badge: 0, champion: 0, finale: 0, top: 0, total: 0 };
  const r = RELIC.ranks.indexOf(rank);
  if (!SONG.test(String(song || '')) || !RELIC.diffs.includes(diff) || r < 0) return { wallet: next, ok: false, reason: 'song', paid };
  const key = keyOf(table), at = key + ':' + (LEDGER.test(String(ledger)) ? ledger + ':' : '');
  const run = [['clear', at + 'clear:' + song + ':' + diff]];
  for (let k = 1; k <= r; k++) run.push(['rank', at + 'rank:' + song + ':' + diff + ':' + RELIC.ranks[k]]);
  if (Number.isInteger(badge) && badge >= 0 && badge <= 3) run.push(['badge', key + ':badge:' + badge]);
  if (champion && SONG.test(String(champion))) run.push(['champion', key + ':champion:' + champion]);
  if (finale) run.push(['finale', key + ':finale']);
  for (const [kind, id] of run) {
    const fresh = !(next.entries && next.entries[id]);
    const s = settle(next, id, table, now);
    next = s.wallet;
    paid[fresh ? kind : 'top'] += s.paid;
  }
  const up = topUpRelicSong(next, { table, bosses, final, champions }, { now });
  next = up.wallet; paid.top += up.paid;
  paid.total = paid.clear + paid.rank + paid.badge + paid.champion + paid.finale + paid.top;
  return { wallet: next, ok: true, paid };
}

/** Pay Meloetta's Lesson once: the table's `lesson` amount, the first time it's finished. */
export function payRelicLesson(wallet, { table } = {}, { now = Date.now() } = {}) {
  const s = settle(wallet, keyOf(table) + ':lesson', table, now);
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
    // Tokens (chips; coins too, for a page from before tokens), the buddy (the one Shotgun Roulette
    // shows next to your name), and whether Origin Giratina has ever lost to you at the Roulette table.
    state: () => {
      const wallet = readWallet(), balance = walletBalance(wallet);
      let originWin = false;
      try { originWin = rouletteGames(wallet).some(game => game.mode === 'hard' && game.won); } catch {}
      return { chips: balance.chips || 0, coins: balance.coins || 0, buddy: storedBuddy(), originWin, signedIn: hasIdentity() };
    },
    typeEdge,
    nameOf: species => (DEX[Math.trunc(Number(species)) - 1] || ['?'])[0],
    typesOf: species => String((DEX[Math.trunc(Number(species)) - 1] || [, ''])[1]).split('/').filter(Boolean),
    pay: options => {
      const result = payRelicSong(readWallet(), options || {});
      if (result.ok && result.paid.total > 0) { writeWallet(result.wallet); try { onChange(); } catch {} }
      return { ok: result.ok, reason: result.reason, paid: result.paid, chips: walletBalance(readWallet()).chips || 0, coins: walletBalance(readWallet()).coins || 0 };
    },
    // Finishing the tutorial: its small bonus, once.
    lesson: options => {
      const result = payRelicLesson(readWallet(), options || {});
      if (result.paid > 0) { writeWallet(result.wallet); try { onChange(); } catch {} }
      return { ok: true, paid: result.paid, chips: walletBalance(readWallet()).chips || 0, coins: walletBalance(readWallet()).coins || 0 };
    },
    // The remaster's fresh board, once a browser: this hub's cached Relic Song best, and its record of
    // what the board last accepted, are let go, so an old total doesn't come back on the next sync
    // or stop a new, lower one from posting. sql/relic-song-reset.sql clears the board and the
    // account's cloud copy. `version` names the reset; the same one never runs twice.
    resetBoard: version => {
      const mark = 'bored.relic-song.board-reset';
      if (!/^r\d{1,3}$/.test(String(version)) || readStored(mark, null) === version) return { reset: false };
      removeStored('bored.high.relic-song');
      for (const [user, sent] of Object.entries(readStoredPrefix('bored.submitted.'))) {
        if (sent && typeof sent === 'object' && 'relic-song' in sent) { delete sent['relic-song']; writeStored('bored.submitted.' + user, sent); }
      }
      writeStored(mark, version);
      return { reset: true };
    },
    // On load: old payouts brought up to today's table, once.
    topUp: options => {
      const result = topUpRelicSong(readWallet(), options || {});
      if (result.paid > 0) { writeWallet(result.wallet); try { onChange(); } catch {} }
      return { paid: result.paid, chips: walletBalance(readWallet()).chips || 0, coins: walletBalance(readWallet()).coins || 0 };
    }
  };
}

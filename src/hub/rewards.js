// Poké Gacha wallet and rewards engine (hub side).
//
// The wallet is a ledger: a map of entries keyed by a unique id
// (`pdoku:daily:doku:2026-11-16`, `ach:pi-caught-50`, `spend:<uuid>` …). Every
// balance is derived from the entries, and merging two devices is the union of
// entries by id, so a reward can never pay twice and a currency can never be
// lost or duplicated by a sync.
//
// Entry shape: { at, g?, v?, bp?, h? }
//   at  seconds since the epoch the entry was written (earliest wins a conflict)
//   g   currencies granted (positive) or spent (negative), e.g. { coins: 100 }
//   v   a recorded value: `mark:pi:*` is the highest ever seen (max wins a
//       conflict), `base:pi:*` is the value when the account first started earning
//   bp  backpay, in coin-equivalents. The sum of every bp is capped (BACKPAY)
//       and paid out as vouchers
//   h   historic: recorded at activation from play that happened before it
//   x   a small payload for Poké Gacha (the eggs a pull made, what a hatch
//       gave); src/hub/gacha.js reads and checks it
//
// Poké Idle pays from marks, never from current state: income is
// rate × (highest value ever recorded − baseline), so restarting Poké Idle and
// catching the same species again pays nothing.
//
// Nothing is recorded until the wallet is activated (`on`), which Poké Gacha
// does the first time a player opens it; activation pays backpay instead of
// full rewards for history. Pulls are cosmetic everywhere but Poké Gacha.
import { readStored, writeStored, readStoredPrefix } from './store.js';
import { dailyDate, dailyStreak } from '../daily.js';

export const WALLET_KEY = 'bored.wallet';
export const CURRENCIES = ['coins', 'waves', 'regular', 'plus', 'premium', 'gold', 'shards'];
// Candy is one balance per species line: `candy:<line>`.
const currencyOk = name => CURRENCIES.includes(name) || /^candy:[a-z0-9-]{1,40}$/.test(name);
export const COINS_PER_REGULAR = 100;

// Starting values from the spec; all of them can be tuned.
export const PI_RATES = {
  caught: { coins: 5, waves: 1 },
  shinies: { coins: 200 },
  badges: { coins: 100, waves: 5 },
  tower: { coins: 10, waves: 1 }
};
export const PI_FIELDS = Object.keys(PI_RATES);
export const DOKU_MODES = ['doku', 'inverse', 'shiny'];
export const DOKU = {
  daily: { coins: 100, waves: 10 },
  perfect: { coins: 50 },
  random: { coins: 20, waves: 2 },
  randomPerDay: 3,
  all3: { premium: 1 }
};
// Inverse Doku has six categories at 100 points each.
const INVERSE_ALL = 600;
// Shiny Hunt's perfect cutoff is not decided yet; null means nothing counts as perfect.
export const SHINY_PERFECT = null;
// Coin-equivalents per voucher, and the one-time backpay cap: 1 Gold + 2 Premium.
export const VOUCHER_VALUE = { regular: 100, plus: 500, premium: 1000, gold: 2500 };
export const BACKPAY = { gold: 1, premium: 2, cap: 2500 + 2 * 1000 };
const TIER = { S: { plus: 1 }, M: { premium: 1 }, B: { gold: 1 } };

const piAch = (field, label, steps) => steps.map(([n, tier]) => ({
  id: `pi-${field}-${n}`, game: 'poke-idle', name: `${label} ${n}`, tier,
  met: s => s.pi[field] >= n
}));
export const ACHIEVEMENTS = [
  ...piAch('caught', 'Caught', [[50, 'S'], [150, 'S'], [400, 'M'], [800, 'B']]),
  ...piAch('shinies', 'Shinies', [[1, 'S'], [3, 'M'], [10, 'B']]),
  ...piAch('badges', 'Badges', [[4, 'S'], [8, 'S'], [16, 'M'], [24, 'M'], [36, 'B']]),
  ...piAch('tower', 'Tower floor', [[10, 'S'], [25, 'M'], [50, 'B'], [100, 'B']]),
  { id: 'doku-first', game: 'pokedoku', name: 'Pokédoku: first daily', tier: 'S', met: s => s.doku.doku.dailies >= 1 },
  { id: 'doku-perfect', game: 'pokedoku', name: 'Pokédoku: perfect 9/9', tier: 'M', met: s => s.doku.doku.perfects >= 1 },
  { id: 'doku-10', game: 'pokedoku', name: 'Pokédoku: 10 dailies', tier: 'M', met: s => s.doku.doku.dailies >= 10 },
  { id: 'doku-30', game: 'pokedoku', name: 'Pokédoku: 30 dailies', tier: 'B', met: s => s.doku.doku.dailies >= 30 },
  { id: 'doku-streak-7', game: 'pokedoku', name: 'Pokédoku: 7-day streak', tier: 'B', met: s => s.doku.doku.streak >= 7 },
  { id: 'inverse-first', game: 'pokedoku', name: 'Inverse Doku: first daily', tier: 'S', met: s => s.doku.inverse.dailies >= 1 },
  { id: 'inverse-all', game: 'pokedoku', name: 'Inverse Doku: find everything', tier: 'M', met: s => s.doku.inverse.perfects >= 1 },
  { id: 'inverse-10', game: 'pokedoku', name: 'Inverse Doku: 10 dailies', tier: 'M', met: s => s.doku.inverse.dailies >= 10 },
  { id: 'shiny-first', game: 'pokedoku', name: 'Shiny Hunt: first daily', tier: 'S', met: s => s.doku.shiny.dailies >= 1 },
  { id: 'shiny-cutoff', game: 'pokedoku', name: 'Shiny Hunt: top score', tier: 'M', met: s => s.doku.shiny.perfects >= 1 },
  { id: 'shiny-10', game: 'pokedoku', name: 'Shiny Hunt: 10 dailies', tier: 'M', met: s => s.doku.shiny.dailies >= 10 },
  { id: 'doku-all3-7', game: 'pokedoku', name: 'All 3 dailies, 7 days in a row', tier: 'B', met: s => s.all3Streak >= 7 }
];

const ID = /^[a-z0-9][a-z0-9:._-]{0,119}$/i;
const X_LIMIT = 1500;
// Poké Gacha writes these itself (src/hub/gacha.js); nothing else may grant under them.
const RESERVED = /^(on|mark:|base:|bp:|ach:|pdoku:|spend:|pull:|hatch:|cfg:)/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const int = value => { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : 0; };
const seconds = now => Math.floor(now / 1000);
const worth = grant => Object.entries(grant)
  .reduce((total, [name, n]) => total + (VOUCHER_VALUE[name] || (name === 'coins' ? 1 : 0)) * n, 0);
const shiftDay = (date, days) => {
  const at = new Date(date + 'T00:00:00Z');
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

/** Drop anything a stale or tampered copy could carry that the ledger does not understand. */
export function cleanEntry(raw) {
  const entry = object(raw);
  const at = Number(entry.at);
  if (!Number.isFinite(at) || at < 0) return null;
  const clean = { at: Math.trunc(at) };
  const grant = {};
  for (const [name, n] of Object.entries(object(entry.g))) if (currencyOk(name) && int(n)) grant[name] = int(n);
  if (Object.keys(grant).length) clean.g = grant;
  if (entry.v !== undefined && int(entry.v) >= 0) clean.v = int(entry.v);
  if (entry.bp !== undefined && int(entry.bp) > 0) clean.bp = int(entry.bp);
  if (entry.h) clean.h = 1;
  if (entry.x && typeof entry.x === 'object' && !Array.isArray(entry.x)) {
    const text = JSON.stringify(entry.x);
    if (text.length <= X_LIMIT) clean.x = JSON.parse(text);
  }
  return clean;
}

/**
 * Union of ledgers by id. Commutative and idempotent, so it gives the same
 * answer whichever device merges first: a mark keeps the highest value, every
 * other id keeps its earliest entry.
 */
export function mergeWallet(...wallets) {
  const entries = {};
  for (const wallet of wallets) {
    for (const [id, raw] of Object.entries(object(object(wallet).entries))) {
      if (!ID.test(id)) continue;
      const entry = cleanEntry(raw);
      if (!entry) continue;
      const held = entries[id];
      if (!held) { entries[id] = entry; continue; }
      const order = id.startsWith('mark:')
        ? ((entry.v || 0) - (held.v || 0)) || (held.at - entry.at)
        : held.at - entry.at;
      if (order > 0 || (order === 0 && JSON.stringify(entry) < JSON.stringify(held))) entries[id] = entry;
    }
  }
  return { v: 1, entries };
}

/** Every balance, derived from the entries. */
export function walletBalance(wallet) {
  const entries = object(object(wallet).entries);
  const total = Object.fromEntries(CURRENCIES.map(name => [name, 0]));
  const add = (grant, times = 1) => {
    for (const [name, n] of Object.entries(grant)) total[name] = (total[name] || 0) + n * times;
  };
  const randomDays = {};
  let backpay = 0;
  for (const [id, entry] of Object.entries(entries)) {
    if (entry.g) add(entry.g);
    if (entry.bp) backpay += entry.bp;
    if (id.startsWith('pdoku:rand:')) {
      const day = id.split(':').slice(0, 4).join(':');
      randomDays[day] = (randomDays[day] || 0) + 1;
    }
  }
  // Two offline devices can each record three random boards; only three pay.
  for (const count of Object.values(randomDays)) add(DOKU.random, Math.min(count, DOKU.randomPerDay));
  for (const field of PI_FIELDS) {
    const base = entries['base:pi:' + field], mark = entries['mark:pi:' + field];
    if (base && mark) add(PI_RATES[field], Math.max(0, mark.v - base.v));
  }
  let pool = Math.min(BACKPAY.cap, backpay);
  const gold = Math.min(BACKPAY.gold, Math.floor(pool / VOUCHER_VALUE.gold));
  pool -= gold * VOUCHER_VALUE.gold;
  const premium = Math.min(BACKPAY.premium, Math.floor(pool / VOUCHER_VALUE.premium));
  pool -= premium * VOUCHER_VALUE.premium;
  add({ gold, premium, regular: Math.floor(pool / VOUCHER_VALUE.regular) });
  return total;
}

/** What achievements read. `historic` counts only play from before activation. */
export function walletStats(wallet, today, historic = false) {
  const entries = object(object(wallet).entries);
  const pick = id => entries[id] && (!historic || entries[id].h) ? entries[id] : null;
  const pi = {};
  for (const field of PI_FIELDS) {
    const entry = historic ? entries['base:pi:' + field] : entries['mark:pi:' + field];
    pi[field] = entry ? entry.v : 0;
  }
  const dates = { all3: [] };
  const doku = {};
  for (const mode of DOKU_MODES) { doku[mode] = { dailies: 0, perfects: 0, streak: 0 }; dates[mode] = []; }
  for (const id of Object.keys(entries)) {
    if (!pick(id)) continue;
    const [prefix, kind, mode, date] = id.split(':');
    if (prefix !== 'pdoku') continue;
    if (kind === 'all3') dates.all3.push(mode);
    else if (doku[mode] && kind === 'daily') { doku[mode].dailies++; dates[mode].push(date); }
    else if (doku[mode] && kind === 'perfect') doku[mode].perfects++;
  }
  for (const mode of DOKU_MODES) doku[mode].streak = dailyStreak(dates[mode], today).best;
  return { pi, doku, all3Streak: dailyStreak(dates.all3, today).best };
}

function checkAchievements(wallet, today, at) {
  const live = walletStats(wallet, today);
  let historic = null;
  let changed = false;
  for (const achievement of ACHIEVEMENTS) {
    const id = 'ach:' + achievement.id;
    if (wallet.entries[id] || !achievement.met(live)) continue;
    // Reached before the account started earning: it goes into the capped backpay.
    historic ||= walletStats(wallet, today, true);
    const grant = TIER[achievement.tier];
    wallet.entries[id] = achievement.met(historic) ? { at, bp: worth(grant), h: 1 } : { at, g: grant };
    changed = true;
  }
  return changed;
}

function isPerfect(mode, run) {
  if (mode === 'doku') return int(run.squares) >= 9 && !run.gaveUp;
  if (mode === 'inverse') return int(run.found) * 100 >= INVERSE_ALL;
  return SHINY_PERFECT !== null && int(run.points) >= SHINY_PERFECT;
}

/**
 * Start earning. `history` is Pokédoku's saved daily results,
 * `{ 'YYYY-MM-DD': { doku: { points, finished }, … } }`; those days count toward
 * achievements and streaks but pay through the capped backpay only.
 */
export function activateWallet(wallet, { today = dailyDate(), now = Date.now(), history = {} } = {}) {
  const next = mergeWallet(wallet);
  if (next.entries.on) return { wallet: next, changed: false };
  const at = seconds(now);
  const entries = next.entries;
  entries.on = { at };
  for (const [date, modes] of Object.entries(object(history))) {
    if (!DATE.test(date) || date > today) continue;
    let all = true;
    for (const mode of DOKU_MODES) {
      const day = object(object(modes)[mode]);
      if (day.finished !== true) { all = false; continue; }
      entries[`pdoku:daily:${mode}:${date}`] ||= { at, h: 1, bp: worth(DOKU.daily) };
      if (mode === 'inverse' && int(day.points) >= INVERSE_ALL)
        entries[`pdoku:perfect:${mode}:${date}`] ||= { at, h: 1, bp: worth(DOKU.perfect) };
    }
    if (all) entries[`pdoku:all3:${date}`] ||= { at, h: 1, bp: worth(DOKU.all3) };
  }
  checkAchievements(next, today, at);
  return { wallet: next, changed: true };
}

/** Record what a Poké Idle or Pokédoku snapshot has earned. A no-op before activation. */
export function observeSnapshot(wallet, slug, snapshot, { today = dailyDate(), now = Date.now() } = {}) {
  const next = mergeWallet(wallet);
  const entries = next.entries;
  if (!entries.on) return { wallet: next, changed: false };
  const at = seconds(now);
  const s = object(snapshot);
  let changed = false;
  const put = (id, entry) => {
    if (entries[id]) return false;
    entries[id] = { at, ...entry };
    return (changed = true);
  };

  if (slug === 'poke-idle' && s.slug === 'poke-idle' && s.finished === true) {
    for (const field of PI_FIELDS) {
      const value = int(s[field]);
      if (value < 0) continue;
      // The first reading after activation is the baseline; what it already
      // holds is paid as backpay, and only progress past it pays in full.
      if (put('base:pi:' + field, { v: value }) && value > 0)
        put('bp:pi:' + field, { bp: value * (PI_RATES[field].coins || 0) });
      const mark = entries['mark:pi:' + field];
      if (!mark || value > mark.v) { entries['mark:pi:' + field] = { at, v: value }; changed = true; }
    }
  }

  if (slug === 'pokedoku' && s.slug === 'pokedoku') {
    // The board's own day, so a daily finished just before midnight still counts.
    const date = s.date === today || s.date === shiftDay(today, -1) ? s.date : null;
    if (date) {
      const days = object(s.days), modes = object(s.modes);
      for (const mode of DOKU_MODES) {
        const day = object(days[mode]), run = object(modes[mode]);
        const dailyId = `pdoku:daily:${mode}:${date}`;
        if (day.finished === true) put(dailyId, { g: DOKU.daily });
        const perfect = (run.daily === true && run.finished === true && isPerfect(mode, run)) ||
          (mode === 'inverse' && day.finished === true && int(day.points) >= INVERSE_ALL);
        if (perfect && entries[dailyId]) put(`pdoku:perfect:${mode}:${date}`, { g: DOKU.perfect });
        // A random board is one seed, once. Shared codes and given-up boards do not pay.
        const seed = int(run.seed);
        if (run.finished === true && run.daily === false && !run.gaveUp && !run.custom && seed > 0) {
          const prefix = `pdoku:rand:${mode}:${date}:`;
          const held = Object.keys(entries).filter(id => id.startsWith(prefix)).length;
          if (held < DOKU.randomPerDay) put(prefix + seed, {});
        }
      }
      if (DOKU_MODES.every(mode => entries[`pdoku:daily:${mode}:${date}`]))
        put(`pdoku:all3:${date}`, { g: DOKU.all3 });
    }
  }

  if (changed) checkAchievements(next, today, at);
  return { wallet: next, changed };
}

/** A one-time grant from Poké Gacha itself (login, stage clears, missions). */
export function grantOnce(wallet, id, grant, { now = Date.now() } = {}) {
  const next = mergeWallet(wallet);
  if (!ID.test(id) || next.entries[id] || RESERVED.test(id))
    return { wallet: next, changed: false };
  const entry = cleanEntry({ at: seconds(now), g: grant });
  if (!entry?.g || Object.values(entry.g).some(n => n < 0)) return { wallet: next, changed: false };
  next.entries[id] = entry;
  return { wallet: next, changed: true };
}

/**
 * Spend from the wallet: `cost` is positive, e.g. { coins: 100 }, and the
 * entry is a negative grant. Refused when any balance is short.
 */
export function spendFrom(wallet, cost, { id = null, now = Date.now(), gain = {}, x = null } = {}) {
  const next = mergeWallet(wallet);
  const balance = walletBalance(next);
  const debit = {};
  for (const [name, n] of Object.entries(object(cost))) {
    // Waves are a running total that egg progress reads, so they are never spent.
    if (!currencyOk(name) || name === 'waves' || !(int(n) > 0)) return { wallet: next, ok: false };
    if ((balance[name] || 0) < int(n)) return { wallet: next, ok: false };
    debit[name] = -int(n);
  }
  if (!Object.keys(debit).length) return { wallet: next, ok: false };
  // What the spend buys goes in the same entry, so it can never land without the cost.
  for (const [name, n] of Object.entries(object(gain))) {
    if (!currencyOk(name) || !(int(n) > 0) || debit[name]) return { wallet: next, ok: false };
    debit[name] = int(n);
  }
  const key = 'spend:' + (id || (globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2)));
  if (!ID.test(key) || next.entries[key]) return { wallet: next, ok: false };
  const entry = cleanEntry({ at: seconds(now), g: debit, x });
  if (x && !entry.x) return { wallet: next, ok: false };
  next.entries[key] = entry;
  return { wallet: next, ok: true, id: key };
}

/** 100 coins buys one Regular voucher. */
export function buyRegular(wallet, count = 1, options = {}) {
  const n = int(count);
  if (n < 1) return { wallet: mergeWallet(wallet), ok: false };
  return spendFrom(wallet, { coins: n * COINS_PER_REGULAR }, { ...options, gain: { regular: n } });
}

/** The trophy list for a profile. */
export function walletTrophies(wallet) {
  const entries = object(object(wallet).entries);
  return ACHIEVEMENTS.filter(achievement => entries['ach:' + achievement.id])
    .map(({ id, game, name, tier }) => ({ id, game, name, tier, at: entries['ach:' + id].at * 1000 }));
}

/* ── This browser's copy ─────────────────────────────────────────────────── */

export function readWallet() {
  return mergeWallet(readStored(WALLET_KEY, null));
}

export function writeWallet(wallet) {
  return writeStored(WALLET_KEY, mergeWallet(wallet));
}

/** Fold another copy (the account's) into this browser's. True when anything changed. */
export function mergeStoredWallet(incoming) {
  const local = readWallet();
  const merged = mergeWallet(local, incoming);
  if (JSON.stringify(merged) === JSON.stringify(local)) return false;
  return writeWallet(merged);
}

const POKEDOKU_SUM = 'bored.pokedoku.sum-';

function pokedokuHistory() {
  const history = {};
  for (const [key, value] of Object.entries(readStoredPrefix(POKEDOKU_SUM))) {
    const match = key.match(/^(\d{4}-\d{2}-\d{2})-(doku|inverse|shiny)$/);
    if (match) (history[match[1]] ||= {})[match[2]] = value;
  }
  return history;
}

/** Called by Poké Gacha the first time a player opens it. */
export function activateStoredWallet() {
  const { wallet, changed } = activateWallet(readWallet(), { history: pokedokuHistory() });
  if (changed) writeWallet(wallet);
  return changed;
}

/** Called by the hub with the open game's snapshot. True when the wallet changed. */
export function observeStoredSnapshot(slug, snapshot) {
  if (slug !== 'poke-idle' && slug !== 'pokedoku') return false;
  const { wallet, changed } = observeSnapshot(readWallet(), slug, snapshot);
  if (changed) writeWallet(wallet);
  return changed;
}

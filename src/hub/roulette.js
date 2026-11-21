// Shotgun Roulette's coins and board, hub side.
//
// The game runs in a sandboxed admin-preview frame and can only ask, over
// postMessage. This module is the one place that answers: it takes bets,
// pays wins and talks to the database, and it enforces every limit itself
// (bet range, payout multiplier, the daily win cap, one payout per bet),
// whatever the frame claims.
//
// Ledger entries (src/hub/rewards.js), one pair per game:
//   spend:sr:<day>:<mode>:<token>   the bet: a negative coins grant, x = { m, b }
//   sr:win:<day>:<mode>:<token>     the payout (bet + profit), written once
// A bet with no win entry is a loss. <day> is the Detroit day of the bet.
// Because both live in the wallet, they sync with the account like any spend.
import { readWallet, writeWallet, mergeWallet, walletBalance, spendFrom, grantOnce } from './rewards.js';
import { dailyDate } from '../daily.js';
import { request, freshSession, hasIdentity, ANON_TOKEN } from './backend.js';

export const ROULETTE = Object.freeze({
  min: 10, max: 500, dailyCap: 3000,
  pays: Object.freeze({ normal: 1.8, hard: 3 }),
  // A win claimed sooner than this after the bet is refused: no real game is that short.
  minGameMs: 8000
});
const BET_ID = /^spend:sr:(\d{4}-\d{2}-\d{2}):(normal|hard):([a-z0-9-]{6,40})$/;

/** Every Shotgun Roulette game in the wallet, oldest first. */
export function rouletteGames(wallet) {
  const entries = mergeWallet(wallet).entries;
  const games = [];
  for (const [id, entry] of Object.entries(entries)) {
    const match = id.match(BET_ID);
    if (!match || !entry.g || !(entry.g.coins < 0)) continue;
    const win = entries['sr:win:' + match[1] + ':' + match[2] + ':' + match[3]];
    const bet = -entry.g.coins;
    const payout = win && win.g && win.g.coins > 0 ? win.g.coins : 0;
    games.push({ id, day: match[1], mode: match[2], at: entry.at, bet, won: payout > 0, payout, profit: payout ? payout - bet : 0 });
  }
  return games.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

/** Coins won (profit over the bet) on one day. This is what the daily cap counts. */
export function rouletteWonOn(wallet, day) {
  return rouletteGames(wallet).filter(game => game.day === day).reduce((total, game) => total + game.profit, 0);
}

/** Wins in a row in one mode: the current run and the best ever. */
export function rouletteStreak(wallet, mode) {
  let current = 0, best = 0;
  for (const game of rouletteGames(wallet)) {
    if (game.mode !== mode) continue;
    current = game.won ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { current, best };
}

/** Take a bet. `token` makes the ledger id unique. */
export function placeRouletteBet(wallet, mode, amount, { today = dailyDate(), now = Date.now(), token } = {}) {
  const next = mergeWallet(wallet);
  const bet = Number(amount);
  if (!Object.hasOwn(ROULETTE.pays, mode)) return { wallet: next, ok: false, reason: 'mode' };
  if (!Number.isInteger(bet) || bet < ROULETTE.min || bet > ROULETTE.max) return { wallet: next, ok: false, reason: 'range' };
  if (!/^[a-z0-9-]{6,40}$/.test(String(token || ''))) return { wallet: next, ok: false, reason: 'token' };
  if (rouletteWonOn(next, today) >= ROULETTE.dailyCap) return { wallet: next, ok: false, reason: 'cap' };
  const spent = spendFrom(next, { coins: bet }, { id: 'sr:' + today + ':' + mode + ':' + token, now, x: { m: mode, b: bet } });
  return spent.ok ? { wallet: spent.wallet, ok: true, betId: spent.id } : { wallet: spent.wallet, ok: false, reason: 'coins' };
}

/** Pay a won bet once: the multiplier, trimmed so the bet's day stays under the cap. */
export function settleRouletteWin(wallet, betId, { now = Date.now() } = {}) {
  const next = mergeWallet(wallet);
  const match = String(betId || '').match(BET_ID);
  const entry = match && next.entries[betId];
  if (!entry || !entry.g || !(entry.g.coins < 0)) return { wallet: next, ok: false, reason: 'bet' };
  const winId = 'sr:win:' + match[1] + ':' + match[2] + ':' + match[3];
  if (next.entries[winId]) return { wallet: next, ok: false, reason: 'settled' };
  const bet = -entry.g.coins;
  const full = Math.floor(bet * ROULETTE.pays[match[2]]) - bet;
  const room = Math.max(0, ROULETTE.dailyCap - rouletteWonOn(next, match[1]));
  const profit = Math.min(full, room);
  const paid = grantOnce(next, winId, { coins: bet + profit }, { now });
  if (!paid.changed) return { wallet: next, ok: false, reason: 'settled' };
  return { wallet: paid.wallet, ok: true, payout: bet + profit, profit, capped: profit < full };
}

/* ── The database ─────────────────────────────────────────────────────────── */

// Rows only go in through submit_shotgun_roulette (sql/shotgun_roulette.sql),
// which checks the numbers again on the server. Guests never post.
export async function submitRouletteScore(mode, coinsWon, bestStreak) {
  if (!hasIdentity()) return { ok: false, reason: 'signin' };
  const session = await freshSession();
  if (!session) return { ok: false, reason: 'signin' };
  await request('/rest/v1/rpc/submit_shotgun_roulette', {
    method: 'POST', token: session.access_token,
    body: { p_mode: mode, p_coins_won: coinsWon, p_best_streak: bestStreak }
  });
  return { ok: true };
}

/** Top 10 players for a mode, by total coins won. */
export async function rouletteBoard(mode) {
  if (!Object.hasOwn(ROULETTE.pays, mode)) return [];
  const rows = await request('/rest/v1/rpc/shotgun_roulette_top', { method: 'POST', token: ANON_TOKEN, body: { p_mode: mode } });
  return (Array.isArray(rows) ? rows : []).slice(0, 10).map(row => ({
    handle: String(row.handle || '').slice(0, 40),
    coins_won: Math.max(0, Math.trunc(Number(row.coins_won)) || 0),
    best_streak: Math.max(0, Math.trunc(Number(row.best_streak)) || 0)
  }));
}

/* ── The bridge the hub's message handler calls ───────────────────────────── */

/**
 * Returns `handle(request) → Promise<reply>`. A win is only paid for a bet this
 * bridge placed in this page session, once, and no sooner than minGameMs after it.
 */
export function createRouletteBridge({ onChange = () => {}, log = (...args) => console.log(...args) } = {}) {
  const open = new Map();
  const coins = () => walletBalance(readWallet()).coins || 0;
  const status = () => {
    const today = dailyDate();
    const won = rouletteWonOn(readWallet(), today);
    return { coins: coins(), wonToday: won, capLeft: Math.max(0, ROULETTE.dailyCap - won) };
  };
  const token = () => (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)).toLowerCase();

  return async function handle(data = {}) {
    switch (data.op) {
      case 'status':
        return { ok: true, ...status() };

      case 'bet': {
        const placed = placeRouletteBet(readWallet(), data.mode, data.bet, { token: token() });
        if (!placed.ok) return { ok: false, reason: placed.reason, ...status() };
        writeWallet(placed.wallet);
        try { onChange(); } catch {}
        open.set(placed.betId, { mode: data.mode, at: Date.now() });
        return { ok: true, betId: placed.betId, ...status() };
      }

      case 'settle': {
        const bet = open.get(data.betId);
        if (!bet) return { ok: false, reason: 'bet', ...status() };
        open.delete(data.betId);
        let payout = 0, profit = 0, capped = false, reason;
        if (data.won === true && !data.forfeit) {
          if (Date.now() - bet.at < ROULETTE.minGameMs) reason = 'early';
          else {
            const paid = settleRouletteWin(readWallet(), data.betId);
            if (paid.ok) {
              writeWallet(paid.wallet);
              try { onChange(); } catch {}
              ({ payout, profit, capped } = paid);
            } else reason = paid.reason;
          }
        }
        const streak = rouletteStreak(readWallet(), bet.mode);
        // The board is a bonus: a missing table or a refused row never blocks the result.
        submitRouletteScore(bet.mode, profit, streak.best)
          .then(result => { if (!result.ok) log('Shotgun Roulette: score not posted (' + result.reason + ').'); })
          .catch(error => log('Shotgun Roulette: score not posted.', error.message));
        return { ok: !reason, reason, payout, profit, capped, streak: streak.current, best: streak.best, ...status() };
      }

      case 'board':
        try {
          return { ok: true, rows: await rouletteBoard(data.mode) };
        } catch (error) {
          log('Shotgun Roulette: leaderboard unavailable.', error.message);
          return { ok: false, reason: 'board', rows: [] };
        }

      default:
        return { ok: false, reason: 'op' };
    }
  };
}

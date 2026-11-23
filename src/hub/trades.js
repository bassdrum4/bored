// Collector trades, hub side: the page's calls, the server's answers, and the wallet's mirror.
//
// The server (supabase/migrations/*_collector_trades.sql) decides every trade in one transaction
// and keeps the only record of it. This module only asks (post, cancel, accept, list) and then
// mirrors each finished trade into the wallet as col:trade:<id> = { g: { dust: -fee }, x: { in, out } },
// once, so the Full Dex and the dust balance show it. Before any server check it pushes the
// wallet, so the server counts the copies and dust the player has right now.
import { request, freshSession, hasIdentity } from './backend.js';
import { readWallet, writeWallet, mergeWallet } from './rewards.js';

export const TRADE_RULES = Object.freeze({ perDay: 3, legendaryPerWeek: 1, minAgeDays: 7, maxOpen: 5, fees: [5, 15, 30, 75] });

/** Mirror finished trades (my_collector_trades rows) into a wallet; each id once. */
export function applyTrades(wallet, trades, { now = Date.now() } = {}) {
  const next = mergeWallet(wallet);
  let added = 0;
  for (const t of Array.isArray(trades) ? trades : []) {
    const id = 'col:trade:' + Number(t.id);
    if (!(Number(t.id) > 0) || next.entries[id]) continue;
    const got = Number(t.got), gave = Number(t.gave), fee = Math.max(0, Math.trunc(Number(t.fee)) || 0);
    if (!(got >= 1 && got <= 1025 && gave >= 1 && gave <= 1025)) continue;
    next.entries[id] = { at: Math.floor((Date.parse(t.done_at) || now) / 1000), ...(fee ? { g: { dust: -fee } } : {}), x: { in: got, out: gave } };
    added++;
  }
  return { wallet: next, added };
}

const rpc = async (name, body = {}) => {
  const session = await freshSession();
  if (!session) throw new Error('signin');
  return request('/rest/v1/rpc/' + name, { method: 'POST', token: session.access_token, body });
};
// Supabase returns a raised exception's message; pass it on as the reason.
const reason = error => String(error && error.message || error || 'Not now.').replace(/^.*?:\s*/, '').slice(0, 160);

/**
 * The bridge the Collector's Trades view calls (window.__boredGacha.trades). `flush` pushes the
 * wallet to the account; `onChange` runs after the wallet changes (sync, redraw the buddy).
 */
export function tradesBridge({ flush = async () => {}, onChange = () => {} } = {}) {
  const guard = run => async (o = {}) => {
    if (!hasIdentity()) return { ok: false, reason: 'Sign in to trade.' };
    try { return await run(o); } catch (error) { return { ok: false, reason: error && error.message === 'signin' ? 'Sign in to trade.' : reason(error) }; }
  };
  const sync = async () => {
    const rows = await rpc('my_collector_trades');
    const { wallet, added } = applyTrades(readWallet(), rows);
    if (added) { writeWallet(wallet); try { onChange(); } catch {} }
    return { ok: true, trades: Array.isArray(rows) ? rows : [], added };
  };
  return {
    rules: TRADE_RULES,
    signedIn: () => hasIdentity(),
    offers: guard(async () => ({ ok: true, offers: await rpc('collector_offers') || [] })),
    history: guard(sync),
    post: guard(async o => { await flush(); const id = await rpc('post_collector_offer', { p_give: o.give, p_want: o.want, p_for: o.forHandle || null }); return { ok: true, id }; }),
    cancel: guard(async o => { await rpc('cancel_collector_offer', { p_id: o.id }); return { ok: true }; }),
    accept: guard(async o => { await flush(); const done = await rpc('accept_collector_offer', { p_id: o.id }); await sync(); return { ok: true, trade: done }; })
  };
}

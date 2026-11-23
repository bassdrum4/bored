// Claimable tokens: the Beginner's Package, the daily tokens and the broke
// bailout. Poké Gacha's Collector and Shotgun Roulette both claim through here.
//
// A claim needs an account. It is recorded on the server first, through
// claim_reward (sql/bored_reward_claims.sql): one row per account and claim
// (and per Detroit day for the daily ones), so refreshing, a second tab or a
// second device can't take it twice. Only then does the wallet ledger get its
// entry, under the same one-time ids rewards.js and gacha.js already use.
//
// Until that SQL is applied the server has no claim_reward; claims then fall
// back to the ledger's own one-time ids alone, and say so in the console.
import { readWallet, writeWallet, claimDailyChips, claimBailout } from './rewards.js';
import { claimBeginner, rewardState } from './gacha.js';
import { request, freshSession, hasIdentity } from './backend.js';
import { dailyDate } from '../daily.js';

const KINDS = ['beginner', 'daily', 'bailout'];

/** The server's verdict: 'ok' (recorded now), 'claimed' (already), or 'local' (no claim_reward yet). */
async function recordOnServer(kind, tokens) {
  try {
    const recorded = await request('/rest/v1/rpc/claim_reward', { method: 'POST', body: { p_kind: kind, p_balance: tokens } });
    return recorded === true ? 'ok' : 'claimed';
  } catch (error) {
    // PostgREST answers 404 / PGRST202 for a function that doesn't exist yet.
    if (error.status === 404 || error.code === 'PGRST202') {
      console.log('Bored claims: claim_reward is not on the server yet (sql/bored_reward_claims.sql), so this claim is kept by the wallet ledger alone.');
      return 'local';
    }
    throw error;
  }
}

export function createClaims({ onChange = () => {} } = {}) {
  const state = () => ({ ...rewardState(readWallet(), dailyDate()), signedIn: hasIdentity() });

  async function claim(kind, { species = null } = {}) {
    if (!KINDS.includes(kind)) return { ok: false, reason: 'kind' };
    if (!hasIdentity()) return { ok: false, reason: 'signin' };
    const now = state();
    if (kind === 'beginner' && now.beginner.claimed) return { ok: false, reason: 'claimed' };
    if (kind === 'beginner' && !now.starters.includes(species)) return { ok: false, reason: 'unknown' };
    if (kind === 'daily' && now.daily.claimed) return { ok: false, reason: 'claimed' };
    if (kind === 'bailout' && now.bailout.claimed) return { ok: false, reason: 'claimed' };
    if (kind === 'bailout' && now.tokens >= now.bailout.below) return { ok: false, reason: 'balance' };
    if (!(await freshSession())) return { ok: false, reason: 'signin' };
    let verdict;
    try {
      verdict = await recordOnServer(kind, now.tokens);
    } catch (error) {
      return { ok: false, reason: 'server', message: error.message };
    }
    if (verdict === 'claimed') return { ok: false, reason: 'claimed' };
    const wallet = readWallet();
    const done = kind === 'beginner' ? claimBeginner(wallet, species)
      : kind === 'daily' ? claimDailyChips(wallet)
      : claimBailout(wallet);
    const landed = kind === 'beginner' ? done.ok : done.changed;
    if (!landed) return { ok: false, reason: done.reason || 'claimed' };
    writeWallet(done.wallet);
    try { onChange(); } catch {}
    const tokens = kind === 'beginner' ? now.rewards.beginner : kind === 'daily' ? now.rewards.login : now.rewards.bailout;
    return { ok: true, kind, tokens, species: kind === 'beginner' ? species : null, recorded: verdict === 'ok' };
  }

  return { state, claim };
}

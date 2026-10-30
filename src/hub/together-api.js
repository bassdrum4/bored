import { request, freshSession, getSession, hasIdentity } from './backend.js';

// v3 shows members to each other in a list, with their email. Existing members
// are asked to review it once before their games load again.
export const CONSENT_VERSION = '2026-10-26-v3';

// Invitations are their own endpoint: the member picker invites an account that
// has not joined yet, and that account reads the notice without joining.
export async function inviteRPC(action, args = {}) {
  if (!hasIdentity()) throw new Error('Sign in to your Bored account first.');
  const owner = getSession()?.user?.id;
  const session = await freshSession();
  if (!session || session.user.id !== owner) throw new Error('Sign in again to continue.');
  const result = await request('/rest/v1/rpc/bt_invite_rpc', {
    method: 'POST', body: { action, args }, token: session.access_token
  });
  if (getSession()?.user?.id !== owner) throw new Error('Your account changed. Please try again.');
  return result;
}

export async function togetherRPC(action, args = {}) {
  if (!hasIdentity()) throw new Error('Sign in to your Bored account first.');
  const owner = getSession()?.user?.id;
  const session = await freshSession();
  if (!session || session.user.id !== owner) throw new Error('Sign in again to continue.');
  const result = await request(action === 'pool_move' ? '/functions/v1/together-pool' : '/rest/v1/rpc/bt_rpc', {
    method: 'POST', body: action === 'pool_move' ? args : { action, args }, token: session.access_token
  });
  if (getSession()?.user?.id !== owner) throw new Error('Your account changed. Please try again.');
  // An event is a client-side funnel indicator only; the authoritative matches
  // and moves tables determine whether a match actually completed.
  const tracked = { enroll: 'bt_enroll', challenge: 'bt_challenge', queue_join: 'bt_random',
    match: 'bt_open', move: 'bt_move', pool_move: 'bt_move', submit_run: 'bt_move',
    rematch: 'bt_rematch', delete: 'bt_delete', leave: 'bt_leave' }[action];
  if (tracked && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bored:together-telemetry', {
    detail: { kind: tracked, game: result?.game || args.game || null, match_id: result?.id || args.match_id || null }
  }));
  if (typeof window !== 'undefined' && result?.status === 'completed' && ['move','pool_move','submit_run'].includes(action))
    window.dispatchEvent(new CustomEvent('bored:together-telemetry', {
      detail: { kind: 'bt_complete', game: result.game || args.game || null, match_id: result.id || args.match_id || null }
    }));
  return result;
}

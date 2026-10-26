import { request, freshSession, getSession, hasIdentity } from './backend.js';

// v3 shows members to each other in a list, with their email. Existing members
// are asked to review it once before their games load again.
export const CONSENT_VERSION = '2026-10-26-v3';

export async function togetherRPC(action, args = {}) {
  if (!hasIdentity()) throw new Error('Sign in to your Bored account first.');
  const owner = getSession()?.user?.id;
  const session = await freshSession();
  if (!session || session.user.id !== owner) throw new Error('Sign in again to continue.');
  const result = await request(action === 'pool_move' ? '/functions/v1/together-pool' : '/rest/v1/rpc/bt_rpc', {
    method: 'POST', body: action === 'pool_move' ? args : { action, args }, token: session.access_token
  });
  if (getSession()?.user?.id !== owner) throw new Error('Your account changed. Please try again.');
  return result;
}

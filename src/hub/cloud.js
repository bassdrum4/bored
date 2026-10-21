// Account state that has to survive the browser it was written in.
//
// Chrome partitions third-party storage, so anything saved inside the Google
// Sites embed belongs to that embed alone: the same student opening the arcade
// in another embed, or straight from bassdrum4.github.io, sees an empty
// profile. A signed-in player's library and bests are therefore mirrored to
// Supabase and keyed by account rather than by browser.
//
// The local copy stays authoritative for play — nothing here blocks a game —
// and the cloud copy is a merge, never a replacement: two devices that both
// played offline keep the union of what they achieved instead of whoever
// saved last.

import { request, getSession, freshSession } from './backend.js';

const TABLE = '/rest/v1/player_state';

/** Read the row for the signed-in account. Resolves to null when there is none. */
export async function pullPlayerState() {
  const session = getSession();
  if (!session || !(await freshSession())) return null;
  const rows = await request(TABLE + '?select=data&user_id=eq.' + encodeURIComponent(session.user.id));
  const data = rows?.[0]?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

/** Replace the row for the signed-in account. */
export async function pushPlayerState(data) {
  const session = getSession();
  if (!session || !(await freshSession())) return false;
  await request(TABLE + '?on_conflict=user_id', {
    method: 'POST',
    body: { user_id: session.user.id, data, updated_at: new Date().toISOString() },
    prefer: 'resolution=merge-duplicates,return=minimal'
  });
  return true;
}

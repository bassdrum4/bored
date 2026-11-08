import { freshSession, getSession, request } from './backend.js';

export const CIV_LITE_GAME = 'ashcrown';

// The database owns permissions. Both tables expose only the signed-in user's
// own membership through RLS; client-side checks are for presentation only.
export async function getAnalyticsAccess() {
  const session = await freshSession();
  const userId = session?.user?.id;
  if (!userId || getSession()?.user?.id !== userId) return { userId: null, kind: null };

  const [admins, gameReaders] = await Promise.all([
    request('/rest/v1/analytics_admins?select=user_id&user_id=eq.' + encodeURIComponent(userId),
      { token: session.access_token }),
    request('/rest/v1/game_analytics_readers?select=game&user_id=eq.' + encodeURIComponent(userId) +
      '&game=eq.' + CIV_LITE_GAME, { token: session.access_token })
  ]);
  // An old async response must never reveal another account's dashboard link.
  if (getSession()?.user?.id !== userId) return { userId: null, kind: null };
  const isAdmin = Array.isArray(admins) && admins.some(row => row.user_id === userId);
  const isGameReader = Array.isArray(gameReaders) && gameReaders.some(row => row.game === CIV_LITE_GAME);
  return { userId, kind: isAdmin ? 'admin' : isGameReader ? 'civ-lite' : null };
}

export function isSuppressedGame(role, game) {
  return role === 'civ-lite' && game === CIV_LITE_GAME;
}

export function filterGameReaderTelemetry(rows, role) {
  if (role === 'admin') return [];
  if (role === 'civ-lite') return rows.filter(row => row.game !== CIV_LITE_GAME);
  return rows;
}

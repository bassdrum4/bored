import { freshSession, getSession, request } from './backend.js';

// Historical name: Civ Lite was the first scoped game. The database owns the
// permissions; a reader row names exactly one game at a time.
export const CIV_LITE_GAME = 'ashcrown';

// Both tables expose only the signed-in user's own rows through RLS; client-side
// checks are for presentation only.
export async function getAnalyticsAccess() {
  const session = await freshSession();
  const userId = session?.user?.id;
  if (!userId || getSession()?.user?.id !== userId) return { userId: null, kind: null, games: [] };

  const [admins, gameReaders] = await Promise.all([
    request('/rest/v1/analytics_admins?select=user_id&user_id=eq.' + encodeURIComponent(userId),
      { token: session.access_token }),
    request('/rest/v1/game_analytics_readers?select=game&user_id=eq.' + encodeURIComponent(userId),
      { token: session.access_token })
  ]);
  // An old async response must never reveal another account's dashboard link.
  if (getSession()?.user?.id !== userId) return { userId: null, kind: null, games: [] };
  const isAdmin = Array.isArray(admins) && admins.some(row => row.user_id === userId);
  const games = Array.isArray(gameReaders)
    ? [...new Set(gameReaders.map(row => row.game).filter(game => typeof game === 'string' && game))].sort()
    : [];
  return { userId, kind: isAdmin ? 'admin' : games.length ? 'game-reader' : null, games };
}

export function isSuppressedGame(role, game, games = []) {
  if (role !== 'game-reader' || !game) return false;
  return (games instanceof Set ? games : new Set(games)).has(game);
}

export function filterGameReaderTelemetry(rows, role, games = []) {
  if (role === 'admin') return [];
  if (role !== 'game-reader') return rows;
  const scope = games instanceof Set ? games : new Set(games);
  return rows.filter(row => !scope.has(row.game));
}

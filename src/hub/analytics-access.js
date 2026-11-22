import { freshSession, getSession, request } from './backend.js';

// Historical name: Civ Lite was the first scoped game. The database owns the
// permissions; a reader row names exactly one game at a time.
export const CIV_LITE_GAME = 'ashcrown';

// Both tables expose only the signed-in user's own rows through RLS; client-side
// checks are for presentation only.
// The footer and telemetry initialize together on each page load. Share the
// role check and reuse it briefly, but never cache across an account/token
// change or cache failed checks. Database RLS remains the actual gate.
const ACCESS_TTL_MS = 120_000;
let cachedAccess = null;
let accessInFlight = null;
const noAccess = () => ({ userId: null, kind: null, games: [] });

if (typeof window !== 'undefined') {
  window.addEventListener('bored:identity', () => {
    cachedAccess = null;
    accessInFlight = null;
  });
}

export async function getAnalyticsAccess() {
  const session = await freshSession();
  const userId = session?.user?.id;
  const token = session?.access_token;
  if (!userId || getSession()?.user?.id !== userId || getSession()?.access_token !== token) {
    cachedAccess = null;
    accessInFlight = null;
    return noAccess();
  }

  if (cachedAccess?.userId === userId && cachedAccess.token === token &&
      Date.now() < cachedAccess.expiresAt) return cachedAccess.value;
  if (accessInFlight?.userId === userId && accessInFlight.token === token)
    return accessInFlight.promise;

  const promise = (async () => {
    const [admins, gameReaders] = await Promise.all([
      request('/rest/v1/analytics_admins?select=user_id&user_id=eq.' + encodeURIComponent(userId),
        { token }),
      request('/rest/v1/game_analytics_readers?select=game&user_id=eq.' + encodeURIComponent(userId),
        { token })
    ]);
    // Never hand an old account's entitlement to the next signed-in player.
    if (getSession()?.user?.id !== userId || getSession()?.access_token !== token) return noAccess();
    const isAdmin = Array.isArray(admins) && admins.some(row => row.user_id === userId);
    const games = Array.isArray(gameReaders)
      ? [...new Set(gameReaders.map(row => row.game).filter(game => typeof game === 'string' && game))].sort()
      : [];
    const value = { userId, kind: isAdmin ? 'admin' : games.length ? 'game-reader' : null, games };
    cachedAccess = { userId, token, expiresAt: Date.now() + ACCESS_TTL_MS, value };
    return value;
  })();
  accessInFlight = { userId, token, promise };
  try { return await promise; }
  finally { if (accessInFlight?.promise === promise) accessInFlight = null; }
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

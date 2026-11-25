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
const ORDINARY_TTL_MS = 30 * 60_000;
const ACCESS_CACHE_KEY = "bored.analytics.ordinary.v1";
function readOrdinary(userId, session) {
  try {
    const item = JSON.parse(sessionStorage.getItem(ACCESS_CACHE_KEY) || "null");
    if (session.expires_at && item?.userId === userId && item.sessionExpiry === session.expires_at && Date.now() < item.expiresAt)
      return { userId, kind: null, games: [] };
  } catch {}
  return null;
}
function rememberOrdinary(userId, session, expiresAt) {
  try { if (session.expires_at) sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ userId, sessionExpiry: session.expires_at, expiresAt })); } catch {}
}
function clearOrdinary() { try { sessionStorage.removeItem(ACCESS_CACHE_KEY); } catch {} }
let cachedAccess = null;
let accessInFlight = null;
const noAccess = () => ({ userId: null, kind: null, games: [] });

if (typeof window !== 'undefined') {
  window.addEventListener('bored:identity', () => {
    const session = getSession();
    if (!session?.user?.id) clearOrdinary();
    if (cachedAccess?.userId !== session?.user?.id || cachedAccess?.token !== session?.access_token) cachedAccess = null;
    if (accessInFlight?.userId !== session?.user?.id || accessInFlight?.token !== session?.access_token) accessInFlight = null;
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

  // Only negative (ordinary-player) results persist across reloads; privileged
  // roles are revalidated frequently and the database remains the actual gate.
  const stored = readOrdinary(userId, session);
  if (stored && !cachedAccess) return stored;
  const promise = (async () => {
    let access;
    try {
      const result = await request("/rest/v1/rpc/my_analytics_access", { method: "POST", body: {}, token });
      if (typeof result?.admin === "boolean" && Array.isArray(result.games)) access = result;
    } catch (error) { if (error?.status !== 404) throw error; }
    if (!access) {
      const [admins, gameReaders] = await Promise.all([
        request('/rest/v1/analytics_admins?select=user_id&user_id=eq.' + encodeURIComponent(userId),
          { token }),
        request('/rest/v1/game_analytics_readers?select=game&user_id=eq.' + encodeURIComponent(userId),
          { token })
      ]);
      access = { admin: Array.isArray(admins) && admins.some(row => row.user_id === userId),
        games: Array.isArray(gameReaders) ? gameReaders.map(row => row.game) : [] };
    }
    // Never hand an old account's entitlement to the next signed-in player.
    if (getSession()?.user?.id !== userId || getSession()?.access_token !== token) return noAccess();
    const games = [...new Set(access.games.filter(game => typeof game === 'string' && game))].sort();
    const value = { userId, kind: access.admin ? 'admin' : games.length ? 'game-reader' : null, games };
    const expiresAt = Date.now() + (value.kind ? ACCESS_TTL_MS : ORDINARY_TTL_MS);
    if (value.kind) clearOrdinary(); else rememberOrdinary(userId, session, expiresAt);
    cachedAccess = { userId, token, expiresAt, value };
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

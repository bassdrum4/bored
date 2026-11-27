// Supabase REST + auth. The project URL and publishable key are safe to ship in
// a static page: row-level security is what protects the tables. Everything the
// hub knows about accounts and score rules goes through this module.

import { readStored, writeStored, removeStored } from './store.js';

const API_URL = 'https://djdpttltfmwkofdrvkem.supabase.co';
const API_KEY = 'sb_publishable_Ayx7pzjm55vlzQ4u8se9KA_O97WK-QZ';
// Public reads (leaderboard, score rules) use the key itself, not the player's
// token, so they keep working while a session is being refreshed.
export const ANON_TOKEN = API_KEY;
const SESSION_KEY = 'bored.session';

// game -> { label, better, max_value }. The scores table has a foreign key on
// this list, so a game is only postable once its rule has been read.
export const scoreRules = new Map();

let session = restoredSession();
let handle = '';
let rulesReady = false;

// Where Realtime listens: the same project, over a WebSocket, with the same publishable key.
export function realtimeURL() {
  return API_URL.replace(/\/+$/, '').replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(API_KEY) + '&vsn=1.0.0';
}

export function backendReady() {
  return /^https:\/\//.test(API_URL) && API_KEY.length > 20;
}

function restoredSession() {
  const saved = readStored(SESSION_KEY, null);
  if (!saved || !saved.access_token || !saved.user) return null;
  // Anonymous accounts are gone. A session an older build left behind must not
  // come back as a signed-in player.
  if (saved.user.is_anonymous) {
    removeStored(SESSION_KEY);
    return null;
  }
  return saved;
}

export function getSession() {
  return session;
}

/**
 * Whether this player actually has an account of their own. There are no
 * anonymous accounts any more, so this is simply "signed in", but the guard
 * stays so a stale token can never make a guest look like a named player.
 */
export function hasIdentity() {
  return Boolean(session && !session.user?.is_anonymous);
}

export function getHandle() {
  return handle;
}

export function setHandle(value) {
  handle = String(value || '');
}

export function rulesLoaded() {
  return rulesReady;
}

function applySession(data) {
  const user = data.user || session?.user;
  if (!user) return null;
  // A different person may have been active. Display names are strictly
  // account-specific.
  if (session?.user?.id !== user.id) handle = '';
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user
  };
  writeStored(SESSION_KEY, session);
  return session;
}

function forgetSession() {
  session = null;
  handle = '';
  removeStored(SESSION_KEY);
}

// Supabase answers through Cloudflare. When its origin has a blip the gateway
// replies with an HTML error page (520-527) instead of JSON, and JSON.parse of
// that page put `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` in
// front of the player. Read the body once, defensively, and let a response that
// is not JSON become a readable, retryable failure.
async function responseBody(res) {
  if (typeof res.text === 'function') {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return undefined; }
  }
  try { return await res.json(); } catch { return undefined; }
}

function busyError(res) {
  const error = new Error('The server is busy. Try again in a moment.');
  error.status = res.status;
  error.transient = true;
  return error;
}

export function isTransientError(error) {
  return Boolean(error?.transient);
}

// One circuit per hub, shared by all REST/auth callers. Do not replay writes:
// callers retain their own queues and decide when a failed operation is safe to retry.
let outageFailures = 0, lastOutageFailure = 0, outageUntil = 0, outageDelay = 0;
let outageGeneration = 0, outageProbe = 0;
// A real offline -> online transition is an opportunity for one fresh probe.
// Do not replay any writes here; each caller owns its retry queue.
if (typeof window !== 'undefined') window.addEventListener('online', () => {
  if (outageUntil) outageUntil = Date.now();
});
function outageTicket() {
  if (!outageUntil) return { generation: outageGeneration, probe: false };
  if (Date.now() < outageUntil || Date.now() < outageProbe) {
    const error = busyError({ status: 503 });
    error.code = 'BORED_BACKEND_COOLDOWN';
    error.retryAfter = Math.max(0, outageUntil - Date.now());
    throw error;
  }
  // A hung probe cannot leave the hub permanently half-open.
  if (outageProbe) outageGeneration++;
  outageProbe = Date.now() + 15000;
  return { generation: outageGeneration, probe: true };
}
function settleOutage(ticket, failed) {
  // Late responses from a pre-outage burst cannot close the circuit or extend it.
  if (ticket.generation !== outageGeneration) return;
  if (!failed) {
    outageFailures = 0;
    if (ticket.probe) {
      outageUntil = 0; outageDelay = 0; outageProbe = 0;
      outageGeneration++;
    }
    return;
  }
  const now = Date.now();
  outageFailures = now - lastOutageFailure > 15000 ? 1 : outageFailures + 1;
  lastOutageFailure = now;
  if (!ticket.probe && outageFailures < 2) return;
  outageDelay = Math.min(60000, outageDelay ? outageDelay * 2 : 5000);
  outageUntil = now + outageDelay + Math.floor(Math.random() * 1000);
  outageProbe = 0;
  outageGeneration++;
}

export async function request(path, { method = 'GET', body, prefer, token, keepalive = false } = {}) {
  const headers = { apikey: API_KEY };
  headers.Authorization = 'Bearer ' + (token || session?.access_token || API_KEY);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const ticket = outageTicket();
  let res;
  try {
    res = await fetch(API_URL.replace(/\/+$/, '') + path, {
      method,
      headers,
      keepalive,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (cause) {
    settleOutage(ticket, true);
    const error = busyError({ status: 503 });
    error.cause = cause;
    throw error;
  }
  if (!res.ok) {
    let data;
    try { data = await responseBody(res); } catch { data = undefined; }
    settleOutage(ticket, [502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527].includes(res.status) || (res.status >= 500 && data === undefined));
    let message = '';
    if (data && typeof data === 'object') message = data.msg || data.message || data.error_description || data.error || '';
    const error = data === undefined ? busyError(res) : new Error(message || 'That request was refused (' + res.status + ').');
    error.status = res.status;
    if (data && typeof data === 'object') {
      error.code = data.code;
      // PostgREST's DETAIL line. A function that refuses with a 409 puts what is stored there.
      if (typeof data.details === 'string') error.details = data.details;
    }
    // A gateway blip, a rate limit or a timeout is worth repeating; a refusal is not.
    if (!data || res.status === 408 || res.status === 429 || res.status >= 500) error.transient = true;
    throw error;
  }
  if (res.status === 204) { settleOutage(ticket, false); return null; }
  let data;
  try { data = await responseBody(res); } catch { data = undefined; }
  settleOutage(ticket, data === undefined);
  // A 2xx that is an HTML page is an interstitial, never this API's answer.
  if (data === undefined) throw busyError(res);
  return data;
}

export async function loadRules() {
  if (rulesReady) return true;
  try {
    const rows = await request('/rest/v1/score_rules?select=game,label,better,min_value,max_value', { token: API_KEY });
    if (!Array.isArray(rows) || !rows.length) return false;
    for (const row of rows) scoreRules.set(row.game, row);
    rulesReady = true;
    return true;
  } catch {
    return false;
  }
}

// Supabase refresh tokens rotate after use. Multiple backend requests often
// call freshSession() together on page load; they must share one refresh rather
// than each spending the same token. Never discard an account because the
// network, rate limiter or server was temporarily unavailable.
let refreshInFlight = null;

function temporaryRefreshFailure(error) {
  const status = Number(error?.status);
  // A gateway page that failed to parse says nothing about the refresh token.
  return Boolean(error?.transient) || !status || status === 408 || status === 429 || status >= 500;
}

export async function refreshSession() {
  const startingSession = session;
  if (!startingSession) return null;
  if (!startingSession.refresh_token) { forgetSession(); return null; }
  if (refreshInFlight?.token === startingSession.refresh_token &&
      refreshInFlight.userId === startingSession.user.id) {
    return refreshInFlight.promise;
  }

  const pending = (async () => {
    try {
      const data = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: startingSession.refresh_token },
        token: API_KEY
      });
      // A logout or a new login can happen while the request is in flight.
      // Never restore the old identity or tokens after that transition.
      if (session !== startingSession) return null;
      return applySession(data);
    } catch (error) {
      if (session !== startingSession) return null;
      if (!temporaryRefreshFailure(error)) forgetSession();
      // An expired local token cannot authorize a write, but retaining the
      // refresh token on temporary failures allows the next action to retry.
      return null;
    }
  })();

  const flight = { token: startingSession.refresh_token, userId: startingSession.user.id, promise: pending };
  refreshInFlight = flight;
  try { return await pending; }
  finally { if (refreshInFlight === flight) refreshInFlight = null; }
}

export async function freshSession() {
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) return refreshSession();
  return session;
}

// What a display name may keep: letters and numbers from any script, combining
// marks, emoji (with their joiners and variation selectors), underscore and
// hyphen. Everything else — spaces, quotes, brackets — is dropped.
const NAME_CHAR = /[\p{L}\p{N}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f_-]/u;

// Split by grapheme where the browser can, so a name is never cut inside an
// emoji sequence.
function nameParts(value) {
  const text = String(value || '').normalize('NFC');
  try {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment);
  } catch {
    return Array.from(text);
  }
}

// A name keeps its own script and emoji. Stripping to ASCII turned "✈" into
// nothing and then padded it with underscores, which is how a player ended up
// called "___" on the board.
function cleanHandle(value) {
  const kept = nameParts(value)
    .filter(part => Array.from(part).every(char => NAME_CHAR.test(char)))
    .slice(0, 16);
  return kept.join('') || 'player';
}

export function suggestedHandle() {
  const meta = session?.user?.user_metadata || {};
  const name = String(meta.display_name || session?.user?.email || 'player').split('@')[0];
  return name.slice(0, 20) || 'player';
}

async function claimHandle(name, retry = false) {
  let attempt = cleanHandle(name);
  for (let tries = 0; tries < (retry ? 3 : 1); tries++) {
    try {
      const result = await request('/rest/v1/rpc/set_handle', { method: 'POST', body: { p_handle: attempt } });
      return typeof result === 'string' && result ? result : attempt;
    } catch (err) {
      if (!retry || !/taken|already|unique|duplicate/i.test(err.message)) throw err;
      attempt = cleanHandle(attempt.slice(0, 10) + '-' + Math.floor(1000 + Math.random() * 9000));
    }
  }
  return attempt;
}

export async function ensureProfile(preferred) {
  if (!session) return '';
  if (!(await freshSession())) return '';
  if (handle) return handle;
  try {
    const rows = await request('/rest/v1/profiles?select=handle&id=eq.' + encodeURIComponent(session.user.id));
    if (rows?.[0]?.handle) handle = rows[0].handle;
  } catch {}
  if (!handle) handle = await claimHandle(preferred || suggestedHandle(), true);
  return handle;
}

export async function renameHandle(name) {
  if (!(await freshSession())) throw new Error('Sign in again first.');
  handle = await claimHandle(name, false);
  return handle;
}

export function authErrorMessage(err) {
  const message = String(err?.message || err);
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/user already registered/i.test(message)) return 'That email already has an account. Try signing in.';
  if (/email not confirmed/i.test(message)) return 'Check your email to confirm the account first.';
  if (/password should be at least/i.test(message)) return 'Use at least 6 characters for the password.';
  if (/names use 1 to 16/i.test(message)) return 'Names use 1–16 characters: letters, numbers or emoji, no spaces.';
  if (/names use 3 to 16/i.test(message)) return 'Names use 3–16 letters, numbers, _ or -.';
  if (/taken|already in use|duplicate/i.test(message)) return 'That name is taken. Try another.';
  if (/failed to fetch/i.test(message)) return 'Could not reach the leaderboard server.';
  return message;
}

export async function signIn(email, password) {
  const data = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
    token: API_KEY
  });
  return applySession(data);
}

export async function signUp(email, password, name, invite = '') {
  const redirectTo = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
  const data = await request('/auth/v1/signup' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), {
    method: 'POST',
    // The invite code rides in the metadata so it survives an email-confirmation
    // round trip; the server still decides whether it is still usable.
    body: { email, password, data: invite ? { display_name: name, invite_code: invite } : { display_name: name } },
    token: API_KEY
  });
  const payload = data.session || data;
  // An unconfirmed signup returns a user but no session, so only a payload
  // carrying both is proof that the account is usable right away.
  const confirmed = Boolean(payload?.access_token && payload?.user);
  if (confirmed) applySession(payload);
  return { confirmed, userId: data.user?.id || payload?.user?.id || null };
}

export async function signOut() {
  // Signing out is about this browser, so the local session goes away first
  // and the button repaints as a guest at once. Revoking the token is a
  // best-effort courtesy to the server; it must not hold the interface.
  const token = session?.access_token;
  forgetSession();
  if (token) {
    void request('/auth/v1/logout', { method: 'POST', token, keepalive: true }).catch(() => {});
  }
}

export async function adoptToken(access, refresh, expiresIn) {
  const user = await request('/auth/v1/user', { token: access });
  return applySession({ access_token: access, refresh_token: refresh, expires_in: expiresIn, user });
}

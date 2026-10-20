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

export function backendReady() {
  return /^https:\/\//.test(API_URL) && API_KEY.length > 20;
}

function restoredSession() {
  const saved = readStored(SESSION_KEY, null);
  return saved && saved.access_token && saved.user ? saved : null;
}

export function getSession() {
  return session;
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

export function applySession(data) {
  const user = data.user || session?.user;
  if (!user) return null;
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user
  };
  writeStored(SESSION_KEY, session);
  return session;
}

export function forgetSession() {
  session = null;
  handle = '';
  removeStored(SESSION_KEY);
}

export async function request(path, { method = 'GET', body, prefer, token } = {}) {
  const headers = { apikey: API_KEY };
  headers.Authorization = 'Bearer ' + (token || session?.access_token || API_KEY);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(API_URL.replace(/\/+$/, '') + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    let message = res.status + ' ' + res.statusText;
    let code;
    try {
      const data = await res.json();
      message = data.msg || data.message || data.error_description || data.error || message;
      code = data.code;
    } catch {}
    const error = new Error(message);
    error.status = res.status;
    error.code = code;
    throw error;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function loadRules() {
  if (rulesReady) return true;
  try {
    const rows = await request('/rest/v1/score_rules?select=game,label,better,max_value', { token: API_KEY });
    if (!Array.isArray(rows) || !rows.length) return false;
    for (const row of rows) scoreRules.set(row.game, row);
    rulesReady = true;
    return true;
  } catch {
    return false;
  }
}

export async function refreshSession() {
  if (!session?.refresh_token) { forgetSession(); return null; }
  try {
    const data = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
      token: API_KEY
    });
    return applySession(data);
  } catch {
    forgetSession();
    return null;
  }
}

export async function freshSession() {
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) return refreshSession();
  return session;
}

export function cleanHandle(value) {
  let cleaned = String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
  while (cleaned.length < 3) cleaned += '_';
  return cleaned.slice(0, 16);
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

export async function signUp(email, password, name) {
  const redirectTo = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
  const data = await request('/auth/v1/signup' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), {
    method: 'POST',
    body: { email, password, data: { display_name: name } },
    token: API_KEY
  });
  const payload = data.session || data;
  if (payload.access_token) applySession(payload);
  return Boolean(session);
}

export async function signOut() {
  if (session) {
    try { await request('/auth/v1/logout', { method: 'POST' }); } catch {}
  }
  forgetSession();
}

export async function adoptToken(access, refresh, expiresIn) {
  const user = await request('/auth/v1/user', { token: access });
  return applySession({ access_token: access, refresh_token: refresh, expires_in: expiresIn, user });
}

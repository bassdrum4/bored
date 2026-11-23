// Invites: one short code per account, a recruit credit once the person who
// used it has opened a game on two different days, and the medal the inviter
// wears beside their name everywhere the hub prints it.
//
// The day count is this browser's own record. It is deliberately trusted: a
// forged count only ever inflates its own inviter's cosmetic medal, so there is
// nothing on the server to protect by proving it.
import { request, hasIdentity, getSession, ANON_TOKEN } from './backend.js';
import { readStored, writeStored, removeStored } from './store.js';
import { dailyDate } from '../daily.js';

const DAYS_KEY = 'bored.invite.days';
const CODE_KEY = 'bored.invite.code';
const NUDGE_KEY = 'bored.invite.nudge';
const MEDALS_TTL = 60_000;
const $ = selector => document.querySelector(selector);

/** 0 for no badge, then Plus One, Enabler and Bad Influence at 1, 5 and 10. */
export function inviteTier(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 1) return 0;
  if (n >= 10) return 3;
  if (n >= 5) return 2;
  return 1;
}

export function tierName(tier) {
  return tier >= 3 ? 'Bad Influence' : tier === 2 ? 'Enabler' : tier === 1 ? 'Plus One' : '';
}

/* ── The medal itself ─────────────────────────────────────────────────────── */

const SVG = 'http://www.w3.org/2000/svg';
function shape(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

// A small rosette: a filled disc with a darker rim, a centre pip at Enabler,
// and an outer ring at Bad Influence. Colours live in styles.css so dark mode
// can brighten them without touching the drawing.
export function medalMark(tier) {
  if (!(tier >= 1 && tier <= 3)) return null;
  const size = 11 + tier;
  const svg = shape('svg', {
    viewBox: '0 0 24 24', width: size, height: size,
    class: 'bt-medal bt-medal-' + tier, role: 'img', 'aria-label': tierName(tier),
    focusable: 'false'
  });
  if (tier === 3) svg.append(shape('circle', { cx: 12, cy: 12, r: 10.4, class: 'bt-medal-ring' }));
  svg.append(shape('circle', { cx: 12, cy: 12, r: tier === 3 ? 7.4 : 8, class: 'bt-medal-rim' }));
  svg.append(shape('circle', { cx: 12, cy: 12, r: tier === 3 ? 6.1 : 6.7, class: 'bt-medal-face' }));
  if (tier >= 2) svg.append(shape('circle', { cx: 12, cy: 12, r: 2.2, class: 'bt-medal-pip' }));
  return svg;
}

let medalTiers = new Map();
let medalsAt = 0;
let medalFlight = null;
let medalStamp = '';

export function medalFor(handle) {
  return medalTiers.get(String(handle || '').trim().toLowerCase()) || 0;
}

/** The whole map, for the pages that print names with their own drawing. */
export function medalLookup() {
  return Object.fromEntries(medalTiers);
}

/** Adds the inviter's medal to a name element, once. */
export function addMedal(parent, handle) {
  const tier = medalFor(handle);
  if (!parent || !tier) return parent;
  if (parent.querySelector?.(':scope > .bt-medal')) return parent;
  const mark = medalMark(tier);
  if (mark) parent.append(mark);
  return parent;
}

/**
 * The public medal list, one request for the whole hub and one minute of cache.
 * Returns a signature the views can compare, so a reload of unchanged medals
 * does not redraw everything.
 */
export async function loadMedals(force = false) {
  if (medalFlight) return medalFlight;
  if (!force && Date.now() - medalsAt < MEDALS_TTL) return medalStamp;
  medalFlight = (async () => {
    try {
      const rows = await request('/rest/v1/recruiter_board?select=handle,credited&limit=5000', { token: ANON_TOKEN });
      const next = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        const tier = inviteTier(row.credited);
        if (!tier || !row.handle) continue;
        next.set(String(row.handle).trim().toLowerCase(), tier);
      }
      medalTiers = next;
      medalsAt = Date.now();
    } catch {
      // A board with no medals on it is still a board.
    }
    medalStamp = [...medalTiers].map(([handle, tier]) => handle + ':' + tier).sort().join('|');
    medalFlight = null;
    return medalStamp;
  })();
  try { return await medalFlight; } finally { medalFlight = null; }
}

/* ── Days this account opened a game ──────────────────────────────────────── */

export function playDays() {
  const saved = readStored(DAYS_KEY, null);
  if (!Array.isArray(saved)) return [];
  return saved.filter(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day));
}

/** Returns true when this is the first launch of the day. */
export function recordPlayDay(day = dailyDate()) {
  const days = playDays();
  if (days.includes(day)) return false;
  days.push(day);
  writeStored(DAYS_KEY, days.slice(-40));
  return true;
}

/* ── Codes and credit ─────────────────────────────────────────────────────── */

export function storedInviteCode() {
  const saved = String(readStored(CODE_KEY, '') || '').trim();
  return /^\d{3,4}$/.test(saved) ? saved : '';
}

export function rememberInviteCode(code) {
  const clean = String(code || '').trim();
  if (/^\d{3,4}$/.test(clean)) writeStored(CODE_KEY, clean);
}

let inviteFlight = null;

/**
 * Tells the server what this account knows: the code it was given (if any) and
 * how many days it has opened a game. Safe to call on every load; the first
 * code wins and the credit only moves forward.
 */
export async function syncInvite(code = null) {
  if (!hasIdentity()) return null;
  // A second call while one is in the air waits for it, then runs with whatever
  // code this call was actually given.
  if (inviteFlight) { try { await inviteFlight; } catch {} }
  const sessionCode = getSession()?.user?.user_metadata?.invite_code;
  const wanted = String(code || storedInviteCode() || sessionCode || '').trim();
  inviteFlight = (async () => {
    try {
      const info = await request('/rest/v1/rpc/sync_invite', {
        method: 'POST',
        body: { p_code: /^\d{3,4}$/.test(wanted) ? wanted : null, p_days: playDays().length }
      });
      // Only a code the server accepted is kept for the next launch day; a
      // rejected one must not be retried forever.
      if (info && info.credited_to) removeStored(CODE_KEY);
      else if (/^\d{3,4}$/.test(wanted)) rememberInviteCode(wanted);
      return info;
    } finally {
      inviteFlight = null;
    }
  })();
  return inviteFlight;
}

export async function loadMyInvite() {
  if (!hasIdentity()) return null;
  return request('/rest/v1/rpc/my_invite', { method: 'POST', body: {} });
}

export async function claimInvite(code) {
  const wanted = String(code || '').trim();
  if (!/^\d{3,4}$/.test(wanted)) throw new Error('Invite codes are 3 or 4 digits.');
  return syncInvite(wanted);
}

export function inviteErrorMessage(error) {
  const message = String(error?.message || error || '');
  if (/own invite code/i.test(message)) return 'That is your own code.';
  if (/does not exist/i.test(message)) return 'That code does not exist.';
  if (/window/i.test(message)) return 'The 3-day window for adding a code has closed.';
  if (/sign in/i.test(message)) return 'Sign in first.';
  if (/failed to fetch|could not reach/i.test(message)) return 'Could not reach the server. Try again.';
  return message || 'That code did not work.';
}

/* ── The nudge dot ────────────────────────────────────────────────────────── */

// A small pulsing dot beside Settings until this account has actually been led
// to its invite code. The dismissal stores the account id, so someone else
// signing in on this browser still gets their own nudge.
function nudgeDoneFor() {
  return String(readStored(NUDGE_KEY, '') || '');
}

export function refreshInviteNudge() {
  const uid = getSession()?.user?.id || '';
  const show = Boolean(uid) && nudgeDoneFor() !== uid;
  for (const dot of document.querySelectorAll('.invite-dot')) dot.hidden = !show;
  return show;
}

export function dismissInviteNudge() {
  const uid = getSession()?.user?.id || '';
  if (!uid || nudgeDoneFor() === uid) return;
  writeStored(NUDGE_KEY, uid);
  refreshInviteNudge();
}

/**
 * The dot's whole job: open Settings on the code itself, then stop nudging.
 * Called when the Settings view opens, so it works from the nav link and from
 * the phone menu alike. The scroll waits a frame because the view is being
 * revealed in the same turn.
 */
export function leadToInviteCode() {
  if (!refreshInviteNudge()) return false;
  dismissInviteNudge();
  requestAnimationFrame(() => $('#invite-panel')?.scrollIntoView({ block: 'center' }));
  return true;
}

/* ── The Settings panel ───────────────────────────────────────────────────── */

function setText(selector, text) {
  const node = $(selector);
  if (node) node.textContent = text;
}

function nextTierNote(count) {
  if (count >= 10) return 'Bad Influence · the top rank.';
  const left = count >= 5 ? 10 - count : 5 - count;
  return left + ' more to ' + (count >= 5 ? 'Bad Influence' : 'Enabler') + '.';
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    // Clipboard access can be refused; the code is still on screen to select.
    return false;
  }
}

let invitesWired = false;

export function initInvites() {
  if (invitesWired) return;
  invitesWired = true;
  const copy = $('#invite-copy');
  if (copy) copy.onclick = async () => {
    const code = String($('#invite-code')?.dataset.code || '');
    if (!code) return;
    setText('#invite-status', await copyCode(code) ? 'Code copied.' : 'Select the code and copy it.');
    dismissInviteNudge();
  };
  const claim = $('#invite-claim');
  if (claim) claim.onclick = async () => {
    const input = $('#invite-claim-code');
    const code = String(input?.value || '').trim();
    if (!/^\d{3,4}$/.test(code)) { setText('#invite-status', 'Invite codes are 3 or 4 digits.'); return; }
    claim.disabled = true;
    setText('#invite-status', 'Adding…');
    try {
      const info = await claimInvite(code);
      if (info?.credited_to) setText('#invite-status', 'Credited to ' + info.credited_to + '.');
      else setText('#invite-status', 'Saved. Your inviter gets credit once you have played on two days.');
      if (input) input.value = '';
      await renderInvites();
    } catch (error) {
      setText('#invite-status', inviteErrorMessage(error));
    } finally {
      claim.disabled = false;
    }
  };
  const input = $('#invite-claim-code');
  if (input) input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    claim?.click();
  });
  window.addEventListener('bored:identity', refreshInviteNudge);
  refreshInviteNudge();
  void renderInvites();
}

export async function renderInvites() {
  const panel = $('#invite-panel');
  if (!panel) return;
  const claimRow = $('#invite-claim-row');
  const copy = $('#invite-copy');
  const codeNode = $('#invite-code');
  if (!hasIdentity()) {
    if (codeNode) { codeNode.textContent = 'Sign in to get one.'; delete codeNode.dataset.code; }
    setText('#invite-blurb', "Want to have a cool badge by your name? Give someone this code when they're signing up, and you'll get credit for them.");
    setText('#invite-progress', 'Your code is waiting inside your account.');
    if (claimRow) claimRow.hidden = true;
    if (copy) copy.hidden = true;
    return;
  }
  let info = null;
  try {
    info = await loadMyInvite();
  } catch {
    setText('#invite-status', 'Could not reach the server. Try again in a moment.');
  }
  if (!info) return;
  if (codeNode) {
    codeNode.textContent = info.code || '—';
    if (info.code) codeNode.dataset.code = info.code;
  }
  if (copy) copy.hidden = !info.code;

  const credited = Number(info.credited) || 0;
  const tier = inviteTier(credited);
  let progress = credited
    ? credited + (credited === 1 ? ' person in' : ' people in') + ' · ' + tierName(tier) + ' · ' + nextTierNote(credited)
    : 'No credit yet. It counts once someone you invite has played on two days.';
  // Who is close matters more than a raw list of day counts: say how many
  // people are still waiting, and how far each one has got.
  const pending = Array.isArray(info.pending) ? info.pending : [];
  if (pending.length) {
    const waiting = pending.map(row => Math.min(2, Math.max(0, Number(row.days) || 0)) + ' of 2 days');
    progress += ' ' + pending.length + (pending.length === 1
      ? ' person you invited is still waiting' : ' people you invited are still waiting') +
      ': ' + waiting.join(', ') + '. They count once they hit 2 of 2 days.';
  }
  setText('#invite-progress', progress);

  // The note stays: an invitee needs to see who their code credited, even
  // though there is nothing left to type. Only the controls go away.
  if (claimRow) claimRow.hidden = false;
  const claimControls = panel.querySelector('.invite-claim-controls');
  if (claimControls) claimControls.hidden = Boolean(info.credited_to) || !info.window_open;
  if (info.credited_to) {
    setText('#invite-claim-note', 'Credited to ' + info.credited_to + '.');
  } else if (!info.window_open) {
    setText('#invite-claim-note', 'The 3-day window for adding a code has closed.');
  } else if (Number(info.days_played) >= 1) {
    setText('#invite-claim-note', 'Add the code you were given. Played ' +
      Math.min(2, Number(info.days_played)) + ' of 2 days so far.');
  } else {
    const closes = info.window_closes ? new Date(info.window_closes) : null;
    const daysLeft = closes && Number.isFinite(closes.getTime())
      ? Math.max(0, Math.ceil((closes.getTime() - Date.now()) / 86_400_000)) : 0;
    setText('#invite-claim-note', 'Add the code you were given' +
      (daysLeft ? ' — ' + daysLeft + (daysLeft === 1 ? ' day' : ' days') + ' left.' : '.'));
  }
}

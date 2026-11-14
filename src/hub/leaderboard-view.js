import { backendReady, request, getHandle, hasIdentity, authErrorMessage, ANON_TOKEN } from './backend.js';
import { LB_GAMES, accountStandings, rankPoints, bestValue, formatScore } from './scores.js';
import { dailyDate, dailyStreak } from '../daily.js';
export function createLeaderboardView({ state, openGame, onBoard = () => {} }) {
const $ = selector => document.querySelector(selector);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
/* ── Leaderboard ──────────────────────────────────────────────────────────── */

// The catalog keeps its own order for the hub; the scoreboard lists its games
// A–Z so one is easy to find by name.
const byGameName = (a, b) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/* ── Daily challenge streaks ──────────────────────────────────────────────── */

// A challenge id is `v4:2026-10-31:aim-lab`; the day is the middle field, the
// same day the hub counts its own streak from.
const CHALLENGE_DAY = /^v\d+:(\d{4}-\d{2}-\d{2}):/;
// One shared empty list, so a board with no cached days does not rebuild the map
// on every keystroke-sized render.
const NO_DAYS = [];
let streakRows = null;
let streaks = new Map();

// The board asks for every completed day, groups them by account and counts the
// run with the same function the hub uses, so a fire here means what the line
// under the challenge means: consecutive days, not a lifetime tally.
function streakMap(rows) {
  if (rows === streakRows) return streaks;
  streakRows = rows;
  const days = new Map();
  for (const row of rows) {
    const day = CHALLENGE_DAY.exec(String(row.challenge_id || ''))?.[1];
    const handle = String(row.handle || '').trim().toLowerCase();
    if (!day || !handle) continue;
    if (!days.has(handle)) days.set(handle, new Set());
    days.get(handle).add(day);
  }
  const today = dailyDate();
  streaks = new Map();
  for (const [handle, set] of days) {
    const { current } = dailyStreak([...set], today);
    if (current > 0) streaks.set(handle, current);
  }
  return streaks;
}

function flame() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '10');
  svg.setAttribute('height', '10');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M12 2c.9 3.3 4.6 4.9 4.6 8.7a4.6 4.6 0 0 1-9.2 0c0-1.7.7-3 1.6-4.2.2 1.4 1 2.4 2 2.4 1.1 0 1.7-.9 1.7-2.1C12.7 5.2 11.8 4 12 2z');
  svg.append(path);
  return svg;
}

// The fire sits beside the name, and explains itself on hover or keyboard focus.
function streakTag(count) {
  const tag = element('span', 'lb-streak');
  tag.setAttribute('aria-label', 'Daily challenge streak: ' + count + (count === 1 ? ' day' : ' days'));
  tag.append(flame(), element('span', 'lb-streak-count', String(count)));
  const tip = element('span', 'lb-streak-tip', 'Days in a row you finished the daily challenge.');
  tip.setAttribute('role', 'tooltip');
  tag.append(tip);
  return tag;
}

/**
 * The viewer's own best on one game. The posted score comes first so a best set
 * on another device still shows up; a guest, or a game that has not reached the
 * board yet, falls back to the best this browser holds.
 */
function ownValue(spec, all, mineKey) {
  const posted = mineKey
    ? all.find(row => row.game === spec.id && String(row.handle || '').toLowerCase() === mineKey)
    : null;
  const onBoard = posted ? Number(posted.value) : 0;
  return Number.isFinite(onBoard) && onBoard > 0 ? onBoard : bestValue(spec);
}

function renderLeaderboard() {
  const list = $('#lb-list');
  const empty = $('#lb-empty');
  list.replaceChildren();
  $('#lb-refresh').disabled = !backendReady();

  if (!backendReady()) {
    $('#lb-note').textContent = 'The shared leaderboard is offline until Supabase is configured.';
    empty.hidden = false;
    empty.textContent = 'Playing as a guest? Your local bests still work.';
    $('#lb-mine').textContent = '';
    return;
  }

  const cached = state.lbCache.get('overall');
  const all = cached?.rows || [];
  const rows = accountStandings(all);
  const played = new Set(all.map(row => row.game).filter(id => LB_GAMES.some(entry => entry.id === id))).size;
  $('#lb-note').textContent = 'Players ranked across ' + LB_GAMES.length + ' games · ' + rows.length +
    (rows.length === 1 ? ' account' : ' accounts') + ' · ' + played + ' with scores · ' + rankPoints(1) +
    ' points for a first place, down to 1 for fifth. Pick a name to see its games.';

  if (cached?.error) {
    empty.hidden = false;
    empty.textContent = 'Could not load rankings: ' + cached.error;
  } else if (!rows.length) {
    empty.hidden = false;
    empty.textContent = cached ? 'Nobody is on the board yet. Embarrassing. Be first.' : 'Loading rankings…';
  } else {
    empty.hidden = true;
  }

  const handle = getHandle();
  const mineKey = handle && hasIdentity() ? handle.toLowerCase() : '';
  const streakCounts = streakMap(state.lbCache.get('daily')?.rows || NO_DAYS);
  rows.slice(0, 10).forEach((row, index) => {
    const name = String(row.handle || 'player');
    const key = name.toLowerCase();
    const mine = Boolean(mineKey) && key === mineKey;
    const item = element('li', mine ? 'you' : '');
    const button = element('button', 'lb-row');
    button.type = 'button';
    const rank = element('span', 'lb-rank', String(index + 1).padStart(2, '0'));
    const label = element('span', 'lb-name', name + (mine ? ' (you)' : ''));
    const score = element('span', 'lb-score');

    label.appendChild(element('small', 'lb-player-meta', row.gamesRanked + ' of ' + row.gamesPlayed + ' games scoring'));
    score.textContent = row.points + ' pts';
    const open = state.lbOpenPlayer === key;
    button.setAttribute('aria-expanded', String(open));
    button.onclick = () => { state.lbOpenPlayer = open ? '' : key; renderLeaderboard(); };
    const detail = element('ul', 'lb-breakdown');
    detail.hidden = !open;
    if (open) {
      const specOf = id => LB_GAMES.find(game => game.id === id) || { id, name: id };
      const own = all
        .filter(entry => String(entry.handle || '').toLowerCase() === key)
        .sort((a, b) => byGameName(specOf(a.game), specOf(b.game)));
      for (const entry of own) {
        const spec = LB_GAMES.find(g => g.id === entry.game);
        if (!spec) continue;
        const value = Number(entry.value);
        const line = element('li', 'lb-line');
        // The number on the row is the viewer's own best, since that is the one
        // they can act on; the other player's best reads under it, with the
        // verdict, so the row is still one game wide at 320px.
        // A stored best can be the string '0', and Minesweeper reads Infinity
        // until a board is cleared; neither is a run to print.
        const raw = Number(key === mineKey ? value : ownValue(spec, all, mineKey));
        const mine = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
        const score = mine ? element('span', 'lb-line-score', formatScore(mine, spec))
          : element('span', 'lb-line-score empty', 'no score');
        line.append(element('span', 'lb-line-name', spec.name), score);
        if (key !== mineKey) {
          const verdict = !mine ? ''
            : mine === value ? ' · tied'
              : (spec.lower ? mine < value : mine > value) ? " · you're ahead" : " · you're behind";
          const versus = element('span', 'lb-line-versus');
          versus.append('them ', element('b', '', formatScore(value, spec)), verdict);
          line.append(versus);
        }
        const play = element('button', 'lb-play', 'Play');
        play.type = 'button';
        play.setAttribute('aria-label', 'Play ' + spec.name);
        // A second board inside a game (the Battle Tower) plays its page.
        play.onclick = event => openGame(spec.page || spec.id, null, event.currentTarget);
        line.append(play);
        detail.appendChild(line);
      }
      if (!detail.children.length) detail.appendChild(element('li', '', 'No saved scores yet.'));
    }
    item.append(button, detail);

    const streak = streakCounts.get(key);
    button.append(rank, label);
    if (streak) button.append(streakTag(streak));
    button.append(score);
    list.appendChild(item);
  });

  const myRank = handle ? rows.findIndex(row => row.handle.toLowerCase() === mineKey) : -1;
  const me = myRank < 0 ? null : rows[myRank];
  $('#lb-mine').textContent = me
    ? 'Your account: #' + (myRank + 1) + ' · ' + me.points + ' points · ' + me.gamesRanked + ' games scoring.'
    : (hasIdentity() ? 'Play a game to put your account on the board.' : 'Sign in to put your account on the board.');
}

// The daily days behind the streak column. It is decoration on the board, so a
// failed or missing read simply means no fires rather than an error notice.
async function loadStreaks(force) {
  const cached = state.lbCache.get('daily');
  if (!force && cached && Date.now() - cached.at < 300000) return;
  try {
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const query = new URLSearchParams({
        select: 'challenge_id,handle',
        order: 'challenge_id.asc',
        limit: String(pageSize),
        offset: String(offset)
      });
      const page = await request('/rest/v1/daily_leaderboard?' + query, { token: ANON_TOKEN });
      if (!Array.isArray(page)) throw new Error('Invalid daily response.');
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    state.lbCache.set('daily', { rows, at: Date.now() });
  } catch {
    state.lbCache.set('daily', { rows: [], at: Date.now() });
  }
}

async function loadLeaderboard(force = false) {
  if (!backendReady()) { renderLeaderboard(); return; }
  const key = 'overall';
  const cached = state.lbCache.get(key);
  if (!force && cached && Date.now() - cached.at < 30000) {
    await loadStreaks(false);
    renderLeaderboard();
    return;
  }
  if (!cached || force) {
    const empty = $('#lb-empty');
    if (!$('#lb-list').children.length) { empty.hidden = false; empty.textContent = 'Loading rankings…'; }
  }
  try {
    // Read the shared leaderboard in pages. PostgREST projects commonly cap
    // individual responses at 1,000 records, so one request misses players.
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 50000; offset += pageSize) {
      const query = new URLSearchParams({
        select: 'game,handle,value',
        order: 'game.asc,handle.asc',
        limit: String(pageSize),
        offset: String(offset)
      });
      const page = await request('/rest/v1/leaderboard?' + query, { token: ANON_TOKEN });
      if (!Array.isArray(page)) throw new Error('Invalid leaderboard response.');
      rows.push(...page);
      if (page.length < pageSize) break;
      if (offset + pageSize >= 50000) throw new Error('Too many scores to rank right now.');
    }
    state.lbCache.set(key, { rows, at: Date.now() });
  } catch (err) {
    state.lbCache.set(key, { rows: [], at: Date.now(), error: authErrorMessage(err) });
  }
  await loadStreaks(force);
  renderLeaderboard();
  // The library cards read the same rows, so they redraw once they land.
  onBoard();
}


return { renderLeaderboard, loadLeaderboard };
}

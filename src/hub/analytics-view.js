import { request, freshSession, getSession } from './backend.js';
import { ORDER } from '../games/catalog.js';
import { summarizeEvents, summarizeEngagement, eventsCSV, excludeAdmins } from './analytics-data.js';
const $ = selector => document.querySelector(selector);
let events = [], productEvents = [], surveyRows = [], togetherSummary = null, handles = {}, report = null, page = 0, loading = false, epoch = 0;
const names = Object.fromEntries(ORDER), PAGE_SIZE = 40, MAX_EVENTS = 20000;
const duration = ms => ms >= 3600000 ? (ms / 3600000).toFixed(1) + ' h' : ms >= 60000 ? (ms / 60000).toFixed(1) + ' min' : Math.round(ms / 1000) + ' s';
const dateTime = iso => new Date(iso).toLocaleString([], { timeZone: 'America/Detroit', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function el(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
function table(target, columns, rows) {
  const wrapper = el('div'); wrapper.className = 'analytics-table-wrap';
  const table = el('table'), head = el('tr'), body = el('tbody');
  columns.forEach(c => { const th = el('th', c); th.scope = 'col'; head.append(th); });
  const thead = el('thead'); thead.append(head); table.append(thead, body);
  rows.forEach(values => { const tr = el('tr'); values.forEach(value => { const td = el('td'); value instanceof Node ? td.append(value) : td.textContent = value; tr.append(td); }); body.append(tr); });
  wrapper.append(table); $(target).replaceChildren(rows.length ? wrapper : el('p', 'No activity in this selection.'));
}
function action(label, fn) { const b = el('button', label); b.type = 'button'; b.onclick = fn; return b; }
function bars(target, rows, label) {
  const max = Math.max(1, ...rows.map(r => r.active));
  $(target).replaceChildren(...rows.map(row => {
    const n = el('div'); n.className = 'analytics-bar-row';
    const title = el('span', label(row)); title.className = 'analytics-bar-label'; title.title = label(row);
    const track = el('div'); track.className = 'analytics-bar-track'; track.setAttribute('aria-hidden', 'true');
    const bar = el('div'); bar.className = 'analytics-bar'; bar.style.width = 100 * row.active / max + '%'; track.append(bar);
    const value = el('span', duration(row.active)); value.className = 'analytics-bar-value'; n.append(title, track, value); return n;
  }));
  if (!rows.length) $(target).append(el('p', 'No activity recorded yet.'));
}
function gameRows(games) {
  return games.map(g => [names[g.id] || g.id, g.sessions, g.users.size, duration(g.active), duration(g.visible), duration(g.active / g.sessions), g.completed, g.errors]);
}
const gameColumns = ['Game','Sessions','Accounts','Active time','Visible time','Avg active / session','Daily completions','Errors'];
function renderEngagement(rows) {
  const selected = $('#person').value;
  const products = productEvents.filter(e => !selected || (selected === 'guest' ? !e.user_id : e.user_id === selected));
  const feedback = surveyRows.filter(e => !selected || (selected === 'guest' ? !e.user_id : e.user_id === selected));
  const data = summarizeEngagement(rows, products, feedback, new Date($('#through').value + 'T23:59:59Z'));
  const percent = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) + '%' : 'Not enough history';
  const stats = [
    ['Visitors with an ID', data.uniqueVisitors], ['Meaningful sessions', data.meaningful],
    ['Players meaningfully engaged', data.identifiedEngaged],
    ['Next-school-week retention', percent(data.retention.returned,data.retention.eligible)],
    ['Eligible retention cohort', data.retention.eligible],
    ['Repeat-game rate', percent(data.repeatGame.returned,data.repeatGame.eligible)],
    ['Game interactions', data.interacting],
    ['Average enjoyment rating', data.survey.average === null ? 'No feedback' : data.survey.average.toFixed(1) + ' / 5']
  ];
  $('#engagement-kpis').replaceChildren(...stats.map(([label,value]) => {
    const n=el('div');n.className='analytics-stat';n.append(el('strong',value),el('span',label));return n;
  }));
  table('#engagement-games',
    ['Game','Opens','Meaningful sessions','Engaged players','Repeat players (matured)'],
    data.games.map(g => [names[g.game]||g.game,g.sessions,g.meaningful,g.engagedPlayers,g.repeatPlayers]));
  table('#engagement-visitors',['Detroit date','New tracked visitors','Returning tracked visitors'],
    data.visitorsByDay.map(d=>[d.day,d.new,d.returning]));
  const match = togetherSummary && !Array.isArray(togetherSummary) ? togetherSummary : {};
  const multiplayer = [
    ['Matches created (all)',match.all_matches??'—'],
    ['Organic matches',match.organic_matches??'—'],
    ['Organic matches with both players moving',match.organic_both_played??'—'],
    ['Organic completed matches',match.organic_completed??'—'],
    ['Organic moves',match.organic_moves??'—'],
    ['Avg organic opponent turn delay',match.organic_turn_delay_minutes==null?'—':match.organic_turn_delay_minutes+' min']
  ];
  // Client funnel counts explain intent and dropoff; match outcomes above
  // remain authoritative even when the sender closes the browser early.
  const labels = {
    bt_view:'Together opened',bt_enroll:'Members enrolled',bt_challenge:'Direct challenges sent',
    bt_random:'Random-match requests',bt_open:'Match views',
    bt_move:'Successful client move submissions',bt_complete:'Client-reported completions',
    bt_rematch:'Rematch requests',bt_delete:'Matches deleted',bt_leave:'Members leaving'
  };
  const counts = new Map();
  for (const e of products) if (labels[e.kind]) counts.set(e.kind,(counts.get(e.kind)||0)+1);
  for (const [kind,label] of Object.entries(labels)) multiplayer.push([label,counts.get(kind)||0]);
  table('#engagement-together',['Measure','Value'],multiplayer);
  const sentiment = [['Responses',data.survey.responses],
    ['Positive (4 or 5)',data.survey.positive],
    ['Positive share',percent(data.survey.positive,data.survey.responses)]];
  table('#engagement-feedback',['Measure','Value'],sentiment);
  table('#engagement-comments',['Date','Rating','Comment'],feedback
    .filter(row => typeof row.comment === 'string' && row.comment.trim())
    .slice(-25).reverse()
    .map(row => [dateTime(row.created_at),row.rating,row.comment]));
}
function render() {
  const selected = $('#person').value;
  const rows = events.filter(e => !selected || (selected === 'guest' ? !e.user_id : e.user_id === selected));
  report = summarizeEvents(rows, handles);
  const t = report.totals;
  const stats = [['Active time', duration(t.active)], ['Sessions', t.sessions], ['Signed-in accounts', t.accounts], ['Guest sessions', t.guests], ['Visible time', duration(t.visible)], ['Repeat accounts', t.repeatAccounts], ['Daily completions', t.completed], ['Errors', t.errors]];
  $('#totals').replaceChildren(...stats.map(([label, value]) => { const n = el('div'); n.className = 'analytics-stat'; n.append(el('strong', value), el('span', label)); return n; }));
  bars('#game-chart', report.games, r => names[r.id] || r.id);
  bars('#day-chart', report.days, r => r.id);
  bars('#source-chart', report.sources, r => r.id + ' · ' + r.sessions + ' sessions');
  bars('#device-chart', report.devices, r => r.id);
  bars('#mode-chart', report.modes, r => r.id);
  const maxHour = Math.max(1, ...report.hours.map(h => h.active));
  $('#hour-chart').replaceChildren(...report.hours.map(h => {
    const n = el('div'); n.className = 'analytics-hour';
    n.style.backgroundColor = `rgba(69,102,83,${(h.active / maxHour * .2).toFixed(3)})`;
    n.append(el('span', h.id + ':00'), el('strong', duration(h.active))); return n;
  }));
  table('#games-table', gameColumns, gameRows(report.games));
  table('#players-table', ['Player','Sessions','Games','Days active','Active time','Avg / session','Last seen'], report.players.map(p => [
    action(p.label, () => { $('#person').value = p.id === 'Unidentified guests' ? 'guest' : p.id; page = 0; render(); }),
    p.sessions, p.games.size, p.days.size, duration(p.active), duration(p.active / p.sessions), dateTime(p.last)
  ]));
  $('#player-detail').hidden = !selected;
  $('#player-heading').textContent = selected === 'guest' ? 'Unidentified guests' : handles[selected] || selected;
  if (selected) table('#player-games', gameColumns, gameRows(report.games));
  renderEngagement(rows);
  renderSessions(); $('#export').disabled = !rows.length;
}
function renderSessions() {
  $('#session-detail').hidden = true;
  const sessions = report.sessions.filter(s => !$('#errors-only').checked || s.errors);
  const pages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE)); page = Math.min(page, pages - 1);
  $('#session-note').textContent = sessions.length + ' sessions · latest first · Detroit time';
  table('#sessions-table', ['Player','Game','First received','Active','Visible','Status','Result','Device','Errors','Detail'], sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(s => [
    s.handle, names[s.game] || s.game, dateTime(s.start), duration(s.active), duration(s.visible),
    (!s.hasStart ? 'Partial · ' : '') + (s.ended ? s.events.findLast(e => e.kind === 'end')?.details?.reason || 'Ended' : 'No end received'),
    (s.latest?.details?.best_score || s.latest?.details?.score) > 0 ? String(s.latest.details.best_score || s.latest.details.score) : '—',
    (s.latest?.details?.device || '—') + (s.latest?.details?.embedded ? ' · embedded' : ''), s.errors,
    action('Inspect', () => {
      $('#session-detail').hidden = false; $('#session-detail').open = true;
      $('#session-heading').textContent = s.handle + ' · ' + (names[s.game] || s.game);
      $('#session-json').textContent = JSON.stringify(s.events, null, 2);
      $('#session-detail').scrollIntoView({ block: 'nearest' });
    })
  ]));
  $('#page-label').textContent = (page + 1) + ' / ' + pages;
  $('#previous').disabled = page === 0; $('#next').disabled = page + 1 >= pages;
}
async function load() {
  if (loading) return;
  const seq = ++epoch; let authorized = false; loading = true; $('#refresh').disabled = true; $('#export').disabled = true;
  $('#session-detail').hidden = true;
  try {
    const user = await freshSession();
    if (!user) throw new Error('Sign in to your admin account first.');
    const membership = await request('/rest/v1/analytics_admins?select=user_id&user_id=eq.' + user.user.id);
    if (!membership?.length) throw new Error('This account does not have analytics admin access.');
    authorized = true;
    $('#access').hidden = true; $('#dashboard').hidden = false; $('#refresh').hidden = false;
    const start = new Date($('#from').value + 'T00:00:00Z'), end = new Date($('#through').value + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 1);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || start >= end || end - start > 90 * 86400000) throw new Error('Choose a valid date range of at most 90 days.');
    $('#status').textContent = 'Loading activity…';
    const base = '/rest/v1/play_events?select=*&received_at=gte.' + start.toISOString() + '&received_at=lt.' + end.toISOString() +
      ($('#game').value ? '&game=eq.' + encodeURIComponent($('#game').value) : '');
    const loaded = []; let cursor = null, capped = false;
    // Keyset paging remains stable while new telemetry arrives; timestamps are server-owned.
    const cutoff = new Date().toISOString();
    while (loaded.length < MAX_EVENTS) {
      const next = cursor ? '&or=' + encodeURIComponent('(received_at.gt.' + cursor.received_at + ',and(received_at.eq.' + cursor.received_at + ',id.gt.' + cursor.id + '))') : '';
      const batch = await request(base + '&received_at=lte.' + cutoff + next + '&order=received_at.asc,id.asc&limit=1000');
      loaded.push(...batch);
      if (batch.length < 1000) break;
      cursor = batch.at(-1);
      if (loaded.length >= MAX_EVENTS) capped = true;
    }
    // Independent visit/survey events do not inflate game-session totals.
    const [productLoaded,feedbackLoaded,authoritativeTogether] = await Promise.all([
      request('/rest/v1/product_events?select=*&received_at=gte.' + start.toISOString() +
        '&received_at=lt.' + end.toISOString() + '&order=received_at.asc&limit=20000'),
      request('/rest/v1/enjoyment_feedback?select=*&created_at=gte.' + start.toISOString() +
        '&created_at=lt.' + end.toISOString() + '&order=created_at.asc&limit=20000'),
      request('/rest/v1/rpc/analytics_together_summary',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}})
    ]);
    const profiles = await request('/rest/v1/profiles?select=id,handle&order=id&limit=1000');
    // Admin accounts are staff, not players: their events never enter a report.
    const roster = await request('/rest/v1/analytics_admins?select=user_id');
    if (seq !== epoch || getSession()?.user?.id !== user.user.id) throw new Error('Account changed. Reload this page.');
    handles = Object.fromEntries(profiles.map(p => [p.id, p.handle]));
    const cleaned = excludeAdmins([...loaded,...productLoaded,...feedbackLoaded],roster.map(row => row.user_id));
    const allowed = new Set(cleaned);
    events = loaded.filter(e => allowed.has(e));
    productEvents = productLoaded.filter(e => allowed.has(e));
    surveyRows = feedbackLoaded.filter(e => allowed.has(e));
    togetherSummary = authoritativeTogether;
    const excluded = loaded.length - events.length;
    const previous = $('#person').value;
    $('#person').replaceChildren(new Option('All players', ''), new Option('Unidentified guests', 'guest'),
      ...[...new Set(events.map(e => e.user_id).filter(Boolean))].map(id => new Option(handles[id] || id.slice(0, 8), id)));
    $('#person').value = [...$('#person').options].some(o => o.value === previous) ? previous : '';
    page = 0; render();
    $('#status').textContent = (capped ? 'EVENT LIMIT REACHED — showing only the earliest 20,000 events. Narrow the date range. ' : '') +
      events.length.toLocaleString() + ' events loaded · refreshed ' + dateTime(cutoff) + (events.length ? '' : ' · Collection begins with this release.') +
      (excluded ? ' · ' + excluded.toLocaleString() + ' admin events excluded' : '');
  } catch (error) {
    events = []; productEvents = []; surveyRows = []; togetherSummary = null; report = null; $('#dashboard').hidden = !authorized; $('#access').hidden = authorized;
    if (authorized) render();
    $('#status').textContent = error.message || 'Could not load analytics. Try again.';
  } finally { loading = false; $('#refresh').disabled = false; }
}
$('#from').value = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
$('#through').value = new Date().toISOString().slice(0, 10);
ORDER.forEach(([id, name]) => $('#game').append(new Option(name, id)));
$('#filters-form').onsubmit = event => { event.preventDefault(); void load(); };
$('#refresh').onclick = () => void load();
$('#person').onchange = () => { page = 0; render(); };
$('#clear-person').onclick = () => { $('#person').value = ''; page = 0; render(); };
$('#errors-only').onchange = () => { page = 0; renderSessions(); };
$('#previous').onclick = () => { page--; renderSessions(); };
$('#next').onclick = () => { page++; renderSessions(); };
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
  for (const tab of document.querySelectorAll('[data-view]')) { const active = tab === button; tab.setAttribute('aria-pressed', String(active)); $('#' + tab.dataset.view + '-view').hidden = !active; }
};
$('#export').onclick = () => {
  const selected = $('#person').value;
  const rows = events.filter(e => !selected || (selected === 'guest' ? !e.user_id : e.user_id === selected));
  const url = URL.createObjectURL(new Blob([eventsCSV(rows, handles)], { type: 'text/csv;charset=utf-8' }));
  const link = el('a'); link.href = url; link.download = 'bored-activity.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Clear sensitive DOM when a different tab signs out or switches account.
window.addEventListener('storage', event => { if (event.key === 'bored.session') { epoch++; events = []; productEvents = []; surveyRows = []; togetherSummary = null; report = null; $('#dashboard').replaceChildren(); $('#dashboard').hidden = true; $('#status').textContent = 'Account changed. Reload to check access again.'; } });
void load();

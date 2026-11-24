import { request, freshSession, getSession } from './backend.js';
import { createAnnouncementAdmin } from './announcement-admin.js';
import { ORDER } from '../games/catalog.js';
import { summarizeEvents, summarizeEngagement, eventsCSV, excludeAdmins } from './analytics-data.js';
const $ = selector => document.querySelector(selector);
const announcementAdmin = createAnnouncementAdmin();
let events = [], productEvents = [], feedbackRows = [], togetherSummary = null, popularitySummary = null, aggregateSummary = null, aggregateCohorts = [], inviteSummary = null, handles = {}, report = null, page = 0, loading = false, epoch = 0;
const names = { ...Object.fromEntries(ORDER), 'f-14': 'F-14 Simulator' }, PAGE_SIZE = 40, MAX_EVENTS = 20000;
const duration = ms => ms >= 3600000 ? (ms / 3600000).toFixed(1) + ' h' : ms >= 60000 ? (ms / 60000).toFixed(1) + ' min' : Math.round(ms / 1000) + ' s';
const dateTime = iso => new Date(iso).toLocaleString([], { timeZone: 'America/Detroit', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
// Date filters are Detroit calendar days even though timestamps are stored in UTC.
const DETROIT = 'America/Detroit';
const detroitDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: DETROIT, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const shiftDay = (day, days) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
function detroitOffset(ts) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: DETROIT, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ts)).map(part => [part.type, part.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(ts / 1000) * 1000;
}
// Midnight in Detroit for a YYYY-MM-DD day, as an instant, honoring EST/EDT.
function detroitMidnight(day) {
  const base = Date.parse(day + 'T00:00:00Z');
  let ts = base;
  for (let i = 0; i < 3; i++) {
    const next = base - detroitOffset(ts);
    if (next === ts) break;
    ts = next;
  }
  return new Date(ts);
}
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
// Proportions are more readable as a donut than as a long list of small bars.
// Keep the raw numbers alongside percentages and exclude zero-only categories.
function donut(target, rows, label, value, format = n => n.toLocaleString()) {
  const entries = rows.map(row => ({ name: String(label(row)), amount: Math.max(0, Number(value(row)) || 0) }))
    .filter(row => row.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = entries.reduce((sum, row) => sum + row.amount, 0);
  const host = $(target);
  if (!host) return;
  if (!total) { host.replaceChildren(el('p', 'No activity recorded yet.')); return; }
  // Tiny categories remain represented, but get grouped to keep the key readable.
  const kept = entries.slice(0, 7);
  if (entries.length > 7) kept.push({ name: 'Other', amount: entries.slice(7).reduce((sum, row) => sum + row.amount, 0) });
  const palette = ['#456653','#bd694b','#d1a04b','#648da5','#8a75a5','#779a6d','#b67c94','#8b8b80'];
  let cursor = 0;
  const stops = kept.map((row, i) => {
    const start = cursor / total * 100;
    cursor += row.amount;
    return `${palette[i]} ${start}% ${cursor / total * 100}%`;
  });
  const figure = el('div'); figure.className = 'analytics-donut-layout';
  const wheel = el('div'); wheel.className = 'analytics-donut';
  wheel.style.background = 'conic-gradient(' + stops.join(',') + ')';
  wheel.setAttribute('role', 'img');
  wheel.setAttribute('aria-label', kept.map(row => row.name + ': ' + format(row.amount) + ' (' + Math.round(row.amount / total * 100) + '%)').join('; '));
  const middle = el('div'); middle.className = 'analytics-donut-middle';
  middle.append(el('strong', format(total)), el('span', 'Total'));
  wheel.append(middle);
  const legend = el('div'); legend.className = 'analytics-donut-legend';
  kept.forEach((row, i) => {
    const line = el('div'); line.className = 'analytics-donut-key';
    const dot = el('i'); dot.style.backgroundColor = palette[i]; dot.setAttribute('aria-hidden', 'true');
    const name = el('span', row.name); name.title = row.name;
    const number = el('strong', format(row.amount) + ' · ' + (row.amount / total * 100).toFixed(1) + '%');
    line.append(dot, name, number); legend.append(line);
  });
  figure.append(wheel, legend); host.replaceChildren(figure);
}

function rankedChart(target, rows, label, value, limit = 12, format = n => n.toLocaleString()) {
  const host = $(target); if (!host) return;
  const data = rows.map(row => ({ label: String(label(row)), value: Math.max(0, Number(value(row)) || 0) }))
    .filter(row => row.value > 0).sort((a,b) => b.value - a.value).slice(0,limit);
  const maximum = Math.max(1,...data.map(row => row.value));
  host.replaceChildren(...data.map(row => {
    const line = el('div'); line.className = 'analytics-bar-row';
    const name = el('span',row.label); name.className = 'analytics-bar-label'; name.title = row.label;
    const track = el('div'); track.className = 'analytics-bar-track'; track.setAttribute('aria-hidden','true');
    const fill = el('div'); fill.className = 'analytics-bar'; fill.style.width = 100 * row.value / maximum + '%'; track.append(fill);
    const count = el('span', format(row.value)); count.className = 'analytics-bar-value';
    line.append(name,track,count); return line;
  }));
  if (!data.length) host.append(el('p','No activity recorded yet.'));
}
function stackedDays(target, rows, key, first, second, labels = ['New','Returning']) {
  const host = $(target); if (!host) return;
  const data = [...rows].sort((a,b) => String(key(a)).localeCompare(String(key(b))));
  const max = Math.max(1,...data.map(row => Math.max(0,Number(first(row))||0) + Math.max(0,Number(second(row))||0)));
  host.replaceChildren(...data.map(row => {
    const a = Math.max(0,Number(first(row))||0), b = Math.max(0,Number(second(row))||0);
    const line = el('div'); line.className = 'analytics-bar-row';
    const name = el('span',String(key(row))); name.className = 'analytics-bar-label';
    const track = el('div'); track.className = 'analytics-bar-track analytics-stacked'; 
    track.setAttribute('aria-label',labels[0]+': '+a+'; '+labels[1]+': '+b);
    const left = el('div'); left.className = 'analytics-stack-first'; left.style.width = 100*a/max+'%';
    const right = el('div'); right.className = 'analytics-stack-second'; right.style.width = 100*b/max+'%';
    track.append(left,right);
    const count = el('span',(a+b).toLocaleString()); count.className = 'analytics-bar-value';
    line.append(name,track,count); return line;
  }));
  if (!data.length) host.append(el('p','No activity recorded yet.'));
}
function gameRows(games) {
  return games.map(g => [names[g.id] || g.id, g.sessions, g.users.size, duration(g.active), duration(g.visible), duration(g.active / g.sessions), g.completed, g.errors]);
}
const gameColumns = ['Game','Sessions','Accounts','Active time','Visible time','Avg active / session','Daily completions','Errors'];
// This is the actual per-game popularity ranking. Reopening a multiplayer
// iframe is not a new match and does not improve a game's solo rank.
function renderPopularity() {
  if (!Array.isArray(popularitySummary?.games)) {
    $('#popularity-chart').replaceChildren();
    $('#game-popularity').replaceChildren(el('p', 'Authoritative popularity breakdown is unavailable.'));
    return;
  }
  const selectedGame = $('#game').value;
  const rows = popularitySummary.games.filter(r => !selectedGame || r.game === selectedGame);
  // Compare launches, not Together reopen events: the latter can repeatedly
  // count the same multiplayer game and would distort the ranking.
  const leaders = [...rows].sort((a,b) => b.standalone_launches - a.standalone_launches).slice(0, 12);
  const maxLaunches = Math.max(1, ...leaders.map(r => Number(r.standalone_launches) || 0));
  const popularityChart = $('#popularity-chart');
  popularityChart.replaceChildren(...leaders.map(row => {
    const line = el('div'); line.className = 'analytics-bar-row';
    const label = el('span', names[row.game] || row.game); label.className = 'analytics-bar-label'; label.title = label.textContent;
    const track = el('div'); track.className = 'analytics-bar-track'; track.setAttribute('aria-hidden', 'true');
    const bar = el('div'); bar.className = 'analytics-bar';
    bar.style.width = (100 * (Number(row.standalone_launches) || 0) / maxLaunches) + '%';
    track.append(bar);
    const value = el('span', Number(row.standalone_launches || 0).toLocaleString()); value.className = 'analytics-bar-value';
    line.append(label, track, value); return line;
  }));
  if (!leaders.length) popularityChart.append(el('p', 'No launches recorded yet.'));
  table('#game-popularity', ['Game','Standalone launches','Standalone browser IDs','Together opens','Organic matches','Organic turns'],
    rows.map(r => [names[r.game] || r.game, r.standalone_launches, r.standalone_browsers,
      r.together_opens, r.matches_started, r.turns_played]));
}
function renderEngagement(rows) {
  const selected = $('#person').value;
  const products = productEvents.filter(e => !selected || (selected === 'guest' ? !e.user_id : e.user_id === selected));
  const feedback = feedbackRows.filter(e => !selected || (selected === 'guest' ? !e.user_id : e.user_id === selected));
  const data = summarizeEngagement(rows, products, feedback, new Date(detroitMidnight(shiftDay($('#through').value, 1)) - 1));
  const percent = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) + '%' : 'Not enough history';
  const stats = [
    ['Players with an ID', data.uniqueVisitors], ['Meaningful sessions', data.meaningful],
    ['Players meaningfully engaged', data.identifiedEngaged],
    ['Next-school-week retention', percent(data.retention.returned,data.retention.eligible)],
    ['Eligible retention cohort', data.retention.eligible],
    ['Repeat-game rate', percent(data.repeatGame.returned,data.repeatGame.eligible)],
    ['Average enjoyment rating', data.survey.average === null ? 'No feedback' : data.survey.average.toFixed(1) + ' / 5']
  ];
  $('#engagement-kpis').replaceChildren(...stats.map(([label,value]) => {
    const n=el('div');n.className='analytics-stat';n.append(el('strong',value),el('span',label));return n;
  }));
  rankedChart('#engagement-games-chart', data.games, g => names[g.game] || g.game, g => g.meaningful);
  table('#engagement-games',
    ['Game','Opens','Meaningful sessions','Engaged players','Repeat players (matured)'],
    data.games.map(g => [names[g.game]||g.game,g.sessions,g.meaningful,g.engagedPlayers,g.repeatPlayers]));
  stackedDays('#engagement-visitors-chart', data.visitorsByDay, d => d.day, d => d.new, d => d.returning);
  table('#engagement-visitors',['Detroit date','New tracked players','Returning tracked players'],
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
    bt_enroll:'Members enrolled',bt_challenge:'Direct challenges sent',
    bt_random:'Random-match requests',
    bt_move:'Successful client move submissions',bt_complete:'Client-reported completions',
    bt_rematch:'Rematch requests',bt_delete:'Matches deleted',bt_leave:'Members leaving'
  };
  const counts = new Map();
  for (const e of products) if (labels[e.kind]) counts.set(e.kind,(counts.get(e.kind)||0)+1);
  for (const [kind,label] of Object.entries(labels)) multiplayer.push([label,counts.get(kind)||0]);
  rankedChart('#engagement-together-chart', Object.entries(labels).map(([kind,label]) => ({label,count:counts.get(kind)||0})),r=>r.label,r=>r.count);
  table('#engagement-together',['Measure','Value'],multiplayer);
  const sentiment = [['Responses',data.survey.responses],
    ['Positive (4 or 5)',data.survey.positive],
    ['Positive share',percent(data.survey.positive,data.survey.responses)]];
  donut('#engagement-feedback-chart', [{id:'Positive (4–5)',count:data.survey.positive},{id:'Other ratings',count:Math.max(0,data.survey.responses-data.survey.positive)}],r=>r.id,r=>r.count);
  table('#engagement-feedback',['Measure','Value'],sentiment);
  table('#engagement-comments',['Date','Type','Rating','Player','Game','Feedback',''],feedback
    .slice(-50).reverse()
    .map(row => [
      dateTime(row.created_at),
      row.kind === 'rating' ? 'Rating' : 'Note',
      row.kind === 'rating' ? row.rating : '—',
      row.user_id ? (handles[row.user_id] || row.handle || row.user_id.slice(0, 8)) : (row.handle || 'Guest'),
      row.game ? (names[row.game] || row.game) : '—',
      row.body || '',
      action('Delete', () => void deleteFeedback(row))
    ]));
}

// Deletion is admin-only in the database too: the delete policy asks
// is_analytics_admin(), so this button cannot remove a row for anyone else.
async function deleteFeedback(row) {
  if (!window.confirm('Delete this feedback? This cannot be undone.')) return;
  try {
    const session = await freshSession();
    if (!session?.access_token) throw new Error('Sign in again to delete feedback.');
    await request('/rest/v1/feedback_entries?id=eq.' + encodeURIComponent(row.id), {
      method: 'DELETE', token: session.access_token
    });
    feedbackRows = feedbackRows.filter(item => item.id !== row.id);
    render();
    $('#status').textContent = 'Feedback deleted.';
  } catch (error) {
    $('#status').textContent = error.message || 'Could not delete that feedback.';
  }
}

/** Flight-specific aggregates use the same admin-protected events as Bored.
 * A sortie is a session ID, not a raw event count. */
function renderF14(rows) {
  const chosen = $('#game').value;
  $('#f14-section').hidden = Boolean(chosen && chosen !== 'f-14');
  if ($('#f14-section').hidden) return;
  const sessions = new Map();
  for (const e of rows) {
    if (e.game !== 'f-14') continue;
    if (!sessions.has(e.session_id)) sessions.set(e.session_id, {
      mode: 'Unknown', aircraft: 'Unknown', active: 0, visible: 0, interacted: false,
      finished: false, outcome: 'Unfinished', kills: 0
    });
    const s = sessions.get(e.session_id), d = e.details || {};
    s.active += e.active_ms || 0;
    s.visible += e.visible_ms || 0;
    if (typeof d.mode === 'string') s.mode = d.mode;
    if (typeof d.aircraft === 'string') s.aircraft = d.aircraft;
    if (Number.isFinite(d.kills)) s.kills = Math.max(s.kills, d.kills);
    if (e.kind === 'end') {
      s.finished = true;
      s.outcome = ({
        success: 'Mission success', failure: 'Mission failure',
        crash: 'Crashed', recovered: 'Recovered'
      })[d.outcome] || 'Quit / unfinished';
    }
  }
  const flights = [...sessions.values()];
  const active = flights.reduce((sum, s) => sum + s.active, 0);
  const engaged = flights.filter(s => s.active >= 60000).length;
  const recovered = flights.filter(s => s.outcome === 'Recovered').length;
  const successes = flights.filter(s => s.outcome === 'Mission success').length;
  const crashes = flights.filter(s => s.outcome === 'Crashed').length;
  const stats = [
    ['Sorties', flights.length], ['Active flight time', duration(active)],
    ['Engaged sorties', engaged], ['Mission victories', successes],
    ['Recoveries', recovered], ['Crashes', crashes]
  ];
  $('#f14-totals').replaceChildren(...stats.map(([label,value]) => {
    const n = el('div'); n.className = 'analytics-stat';
    n.append(el('strong', value), el('span', label)); return n;
  }));
  const group = field => {
    const map = new Map();
    for (const s of flights) {
      const key = s[field];
      if (!map.has(key)) map.set(key, { id: key, count: 0, active: 0 });
      const g = map.get(key); g.count++; g.active += s.active;
    }
    return [...map.values()].sort((a,b) => b.count-a.count || b.active-a.active);
  };
  donut('#f14-modes', group('mode'), s => s.id, s => s.count);
  donut('#f14-aircraft', group('aircraft'), s => s.id, s => s.count);
  donut('#f14-outcomes', group('outcome'), s => s.id, s => s.count);
}
function renderHistory() {
  const totals = aggregateSummary?.totals;
  if (!totals) {
    $('#history-totals').replaceChildren(el('p', 'Aggregated history is unavailable.'));
    for (const id of ['#history-games','#history-sources','#history-ui','#history-cohorts','#history-games-chart','#history-sources-chart','#history-ui-chart','#history-cohorts-chart'])
      $(id).replaceChildren(el('p', 'No aggregate data available.'));
    return;
  }
  const popularGames = Array.isArray(popularitySummary?.games) ? popularitySummary.games : null;
  const total = field => popularGames.reduce((n, row) => n + Number(row[field] || 0), 0);
  const items = [
    ...(popularGames
      ? [['Standalone launches', total('standalone_launches')],
        ['Together reopens', total('together_opens')],
        ['Organic matches created', total('matches_started')],
        ['Organic turns played', total('turns_played')]]
      : [['Game opens (including Together)', totals.launches]]),
    ['Meaningful sessions', totals.meaningful],
    ['Tracked browsers', totals.browsers], ['Active game time', duration(totals.active_ms)],
    ['Error sessions', totals.error_sessions]
  ];
  $('#history-totals').replaceChildren(...items.map(([name, value]) => {
    const n = el('div'); n.className = 'analytics-stat';
    n.append(el('strong', value), el('span', name)); return n;
  }));
  const percentage = (numerator, denominator) =>
    denominator ? Math.round(numerator * 100 / denominator) + '%' : '—';
  const byGame = new Map((aggregateSummary.games || []).map(g => [g.game, g]));
  if (popularGames) {
    // Server orders by standalone launches, never by reopens of old matches.
    const gameRows = popularGames.map(g => {
      const detail = byGame.get(g.game) || {};
      return [names[g.game] || g.game,g.standalone_launches,g.standalone_browsers,
        g.together_opens,g.matches_started,g.turns_played,
        detail.meaningful || 0,duration(detail.active_ms || 0)];
    });
    table('#history-games', ['Game','Standalone launches','Standalone browsers','Together opens',
      'Organic matches','Organic turns','Meaningful · all modes','Active · all modes'], gameRows);
  } else {
    const gameRows = (aggregateSummary.games || []).map(g => [
      names[g.game] || g.game, g.launches, g.meaningful,
      percentage(g.meaningful,g.sessions), g.browsers, duration(g.active_ms),
      duration(g.median_active_ms), g.errors
    ]);
    table('#history-games', ['Game','All-mode opens','Meaningful','Meaningful rate',
      'Browser IDs','Active time','Median active','Errors'], gameRows);
  }
  // Ranking is the primary interface; raw cross-metric data is optional below.
  // Preserve the selected metric when the date filters refresh the report.
  const picker = $('#history-game-metric');
  const drawGameComparison = () => {
    const metric = picker.value;
    const rows = popularGames || aggregateSummary.games || [];
    const value = r => {
      const detail = byGame.get(r.game) || {};
      switch (metric) {
        case 'browsers': return popularGames ? r.standalone_browsers : r.browsers;
        case 'meaningful': return detail.meaningful ?? r.meaningful ?? 0;
        case 'active': return detail.active_ms ?? r.active_ms ?? 0;
        case 'together': return popularGames ? r.together_opens : 0;
        case 'matches': return popularGames ? r.matches_started : 0;
        case 'turns': return popularGames ? r.turns_played : 0;
        default: return popularGames ? r.standalone_launches : r.launches;
      }
    };
    rankedChart('#history-games-chart', rows, r => names[r.game] || r.game, value, 15, metric === 'active' ? duration : n => n.toLocaleString());
  };
  for (const option of picker.options) {
    if (['together','matches','turns'].includes(option.value)) option.disabled = !popularGames;
    if (option.value === 'launches') option.textContent = popularGames ? 'Standalone launches' : 'All-mode opens';
    if (option.value === 'browsers') option.textContent = popularGames ? 'Standalone browsers' : 'Browser IDs';
  }
  if (!popularGames && ['together','matches','turns'].includes(picker.value)) picker.value = 'launches';
  picker.onchange = drawGameComparison;
  drawGameComparison();
  donut('#history-sources-chart',aggregateSummary.sources || [],r=>r.source,r=>r.launches);
  table('#history-sources', ['Launch source','Launches','Meaningful','Active time'],
    (aggregateSummary.sources || []).map(r => [r.source,r.launches,r.meaningful,duration(r.active_ms)]));
  const actions = (aggregateSummary.ui_events || [])
    .sort((a,b) => b.events-a.events || a.kind.localeCompare(b.kind))
    .slice(0,100);
  rankedChart('#history-ui-chart', actions, e => [e.kind,e.action_name].filter(Boolean).join(' · '), e => e.events);
  table('#history-ui',['Event','Game','Surface','Action','Count','Browser IDs'], actions.map(e => [
    e.kind, names[e.game] || e.game || '—',e.surface || '—',e.action_name || '—',e.events,e.browsers
  ]));
  stackedDays('#history-cohorts-chart',aggregateCohorts.filter(c=>c.d1_returned!=null),c=>c.first_day,c=>c.d1_returned,c=>Math.max(0,c.cohort-c.d1_returned),['D1 returned','Did not return D1']);
  table('#history-cohorts',['First play','Browsers','D1 returns','D7 returns','Next school day','School-day returns'],
    aggregateCohorts.map(c => [c.first_day,c.cohort,
      c.d1_returned == null ? 'Not mature' : c.d1_returned + ' (' + percentage(c.d1_returned,c.cohort) + ')',
      c.d7_returned == null ? 'Not mature' : c.d7_returned + ' (' + percentage(c.d7_returned,c.cohort) + ')',
      c.next_school || '—',
      c.school_returned == null ? 'Not mature' : c.school_returned + ' (' + percentage(c.school_returned,c.cohort) + ')'
    ]));
}
// Invite totals come from one admin-only aggregate over invite_codes and
// recruits; the raw tables are readable by no client role at all.
function renderInvitesView() {
  const host = $('#invite-totals');
  if (!host) return;
  const data = inviteSummary;
  if (!data || typeof data !== 'object') {
    host.replaceChildren(el('p', 'Invite totals are unavailable.'));
    for (const id of ['#invite-day-chart','#invite-table','#invite-recruiters'])
      $(id)?.replaceChildren(el('p', 'No invite data available.'));
    return;
  }
  const number = value => Number(value) || 0;
  const issued = number(data.codes_total), redeemed = number(data.codes_redeemed_total);
  const stats = [
    ['Codes issued', issued], ['Codes redeemed', redeemed],
    ['Redemption rate', issued ? Math.round(redeemed * 100 / issued) + '%' : '—'],
    ['Pending recruits', number(data.pending_total)], ['Credited recruits', number(data.credited_total)],
    ['Redeemed in range', number(data.redemptions)]
  ];
  host.replaceChildren(...stats.map(([label, value]) => {
    const n = el('div'); n.className = 'analytics-stat';
    n.append(el('strong', typeof value === 'number' ? value.toLocaleString() : value), el('span', label)); return n;
  }));
  const days = Array.isArray(data.days) ? data.days : [];
  stackedDays('#invite-day-chart', days, d => d.day, d => d.redemptions, d => d.credited, ['Redeemed','Credited']);
  table('#invite-table', ['Detroit date','Codes issued','Redeemed','Credited'],
    days.map(d => [d.day, d.issued, d.redemptions, d.credited]));
  const recruiters = Array.isArray(data.recruiters) ? data.recruiters : [];
  table('#invite-recruiters', ['Recruiter','Credited','Pending'],
    recruiters.map(r => [r.handle, r.credited, r.pending]));
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
  donut('#source-chart', report.sources, r => r.id, r => r.active, duration);
  donut('#device-chart', report.devices, r => r.id, r => r.active, duration);
  donut('#mode-chart', report.modes, r => r.id, r => r.active, duration);
  const maxHour = Math.max(1, ...report.hours.map(h => h.active));
  $('#hour-chart').replaceChildren(...report.hours.map(h => {
    const n = el('div'); n.className = 'analytics-hour';
    n.style.backgroundColor = `rgba(69,102,83,${(h.active / maxHour * .2).toFixed(3)})`;
    n.append(el('span', h.id + ':00'), el('strong', duration(h.active))); return n;
  }));
  renderPopularity();
  table('#games-table', gameColumns, gameRows(report.games));
  renderF14(rows);
  rankedChart('#players-chart', report.players, p=>p.label, p=>p.sessions, 10);
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
  const errorsByGame = new Map();
  for (const session of sessions) if (session.errors) errorsByGame.set(session.game,(errorsByGame.get(session.game)||0)+session.errors);
  rankedChart('#sessions-errors-chart',[...errorsByGame].map(([game,count])=>({game,count})),r=>names[r.game]||r.game,r=>r.count);
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
    announcementAdmin.init();
    $('#access').hidden = true; $('#dashboard').hidden = false; $('#refresh').hidden = false;
    const start = detroitMidnight($('#from').value), end = detroitMidnight(shiftDay($('#through').value, 1));
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
    // Since the F-14 migration, live flight telemetry lives in an isolated
    // table. Load it through the admin-only RPC rather than duplicating the
    // events into play_events or granting direct access to the flight table.
    const flightLoaded = [];
    if (!$('#game').value || $('#game').value === 'f-14') {
      let flightCursor = null;
      while (flightLoaded.length < MAX_EVENTS) {
        const batch = await request('/rest/v1/rpc/analytics_f14_events', {
          method: 'POST',
          body: {
            p_from: start.toISOString(), p_to: end.toISOString(),
            p_cutoff: cutoff, p_after_at: flightCursor?.received_at ?? null,
            p_after_id: flightCursor?.id ?? null, p_limit: 1000
          }
        });
        flightLoaded.push(...batch);
        if (batch.length < 1000) break;
        flightCursor = batch.at(-1);
        if (flightLoaded.length >= MAX_EVENTS) capped = true;
      }
    }
    // Independent visit/survey events do not inflate game-session totals.
    const [productLoaded,feedbackLoaded,authoritativeTogether,serverRollup,serverCohorts,serverPopularity,serverInvites] = await Promise.all([
      request('/rest/v1/product_events?select=*&received_at=gte.' + start.toISOString() +
        '&received_at=lt.' + end.toISOString() + '&order=received_at.asc&limit=20000'),
      request('/rest/v1/feedback_entries?select=*&created_at=gte.' + start.toISOString() +
        '&created_at=lt.' + end.toISOString() + '&order=created_at.asc&limit=20000'),
      request('/rest/v1/rpc/analytics_together_summary',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}}),
      request('/rest/v1/rpc/analytics_rollup_v1',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}}).catch(() => null),
      request('/rest/v1/rpc/analytics_retention_cohorts_v1',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}}).catch(() => []),
      request('/rest/v1/rpc/analytics_game_popularity_v1',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}}).catch(() => null),
      request('/rest/v1/rpc/analytics_invites_v1',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}}).catch(() => null)
    ]);
    const profiles = await request('/rest/v1/profiles?select=id,handle&order=id&limit=1000');
    // Admin accounts are staff, not players: their events never enter a report.
    const roster = await request('/rest/v1/analytics_admins?select=user_id');
    if (seq !== epoch || getSession()?.user?.id !== user.user.id) throw new Error('Account changed. Reload this page.');
    handles = Object.fromEntries(profiles.map(p => [p.id, p.handle]));
    const cleaned = excludeAdmins([...loaded,...flightLoaded,...productLoaded,...feedbackLoaded],roster.map(row => row.user_id));
    const allowed = new Set(cleaned);
    events = [...loaded,...flightLoaded].filter(e => allowed.has(e))
      .sort((a,b) => a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id));
    productEvents = productLoaded.filter(e => allowed.has(e));
    feedbackRows = feedbackLoaded.filter(e => allowed.has(e));
    togetherSummary = authoritativeTogether;
    popularitySummary = serverPopularity;
    inviteSummary = serverInvites;
    aggregateSummary = serverRollup;
    aggregateCohorts = Array.isArray(serverCohorts) ? serverCohorts : [];
    const excluded = loaded.length + flightLoaded.length - events.length;
    const previous = $('#person').value;
    $('#person').replaceChildren(new Option('All players', ''), new Option('Unidentified guests', 'guest'),
      ...[...new Set(events.map(e => e.user_id).filter(Boolean))].map(id => new Option(handles[id] || id.slice(0, 8), id)));
    $('#person').value = [...$('#person').options].some(o => o.value === previous) ? previous : '';
    page = 0; render(); renderHistory(); renderInvitesView();
    const emptyReason = events.length ? '' : loaded.length + flightLoaded.length
      ? ' · Player report is empty because every recorded event in this selection was staff/admin activity.'
      : ' · No telemetry was received in this selection.';
    $('#status').textContent = (capped ? 'DETAILED SESSION LIMIT REACHED — the Funnels & history tab still uses complete server-side summaries. Narrow the date range for individual sessions. ' : '') +
      events.length.toLocaleString() + ' player events loaded · refreshed ' + dateTime(cutoff) + emptyReason +
      (excluded ? ' · ' + excluded.toLocaleString() + ' staff/admin events recorded and excluded' : '');
  } catch (error) {
    events = []; productEvents = []; feedbackRows = []; togetherSummary = null; popularitySummary = null; aggregateSummary = null; aggregateCohorts = []; inviteSummary = null; report = null; $('#dashboard').hidden = !authorized; $('#access').hidden = authorized;
    if (authorized) render();
    $('#status').textContent = error.message || 'Could not load analytics. Try again.';
  } finally { loading = false; $('#refresh').disabled = false; }
}
// Open on today only: the dashboard loads the smallest useful slice first, and
// both fields stay editable so any range up to the 90-day cap can be picked.
const today = detroitDay(new Date());
$('#from').value = today;
$('#through').value = today;
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
window.addEventListener('storage', event => { if (event.key === 'bored.session') { epoch++; events = []; productEvents = []; feedbackRows = []; togetherSummary = null; popularitySummary = null; aggregateSummary = null; report = null; $('#dashboard').replaceChildren(); $('#dashboard').hidden = true; $('#status').textContent = 'Account changed. Reload to check access again.'; } });
void load();

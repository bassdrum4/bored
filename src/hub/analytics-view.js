import { request, freshSession, getSession } from './backend.js';
import { createAnnouncementAdmin } from './announcement-admin.js';
import { ORDER } from '../games/catalog.js';
import { summarizeEvents, summarizeEngagement, eventsCSV, excludeAdmins, buildGameSignals, buildInsights } from './analytics-data.js';
const $ = selector => document.querySelector(selector);
const announcementAdmin = createAnnouncementAdmin();
let events = [], productEvents = [], feedbackRows = [], togetherSummary = null, aggregateSummary = null, aggregateCohorts = [], handles = {}, report = null, page = 0, loading = false, epoch = 0;
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
  mount(target).replaceChildren(...rows.map(row => {
    const n = el('div'); n.className = 'analytics-bar-row';
    const title = el('span', label(row)); title.className = 'analytics-bar-label'; title.title = label(row);
    const track = el('div'); track.className = 'analytics-bar-track'; track.setAttribute('aria-hidden', 'true');
    const bar = el('div'); bar.className = 'analytics-bar'; bar.style.width = 100 * row.active / max + '%'; track.append(bar);
    const value = el('span', duration(row.active)); value.className = 'analytics-bar-value'; n.append(title, track, value); return n;
  }));
  if (!rows.length) mount(target).append(el('p', 'No activity recorded yet.'));
}
const SVGNS = 'http://www.w3.org/2000/svg';
const pct = ratio => Number.isFinite(ratio) ? Math.round(ratio * 100) + '%' : '—';
const mount = target => typeof target === 'string' ? $(target) : target;
function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
function svgLabel(x, y, text, anchor = 'start', className = 'analytics-svg-label') {
  const node = svgNode('text', { x, y, 'text-anchor': anchor, class: className });
  node.textContent = text; return node;
}
function meter(label, ratio, text) {
  const row = el('div'); row.className = 'analytics-love-meter';
  row.append(el('span', label), el('b', text));
  const track = el('div'); track.className = 'analytics-love-track';
  const fill = el('div'); fill.className = 'analytics-love-fill';
  fill.style.width = Math.round(Math.max(0, Math.min(1, ratio || 0)) * 100) + '%';
  track.append(fill); row.append(track); return row;
}
// Where each game sits between "opens a lot" and "keeps people": the four
// corners are four different next moves, not four scores.
function quadrantChart(target, signals) {
  const host = mount(target), rows = signals.filter(row => row.sessions > 0);
  if (!rows.length) { host.replaceChildren(el('p', 'No activity recorded yet.')); return; }
  const W = 760, H = 340, pad = { l: 64, r: 30, t: 46, b: 54 };
  const longest = Math.max(60000, ...rows.map(row => row.perSession));
  const split = rows.reduce((n, row) => n + row.perSession, 0) / rows.length;
  const x = rate => pad.l + Math.max(0, Math.min(1, rate)) * (W - pad.l - pad.r);
  const y = value => pad.t + (H - pad.t - pad.b) * (1 - Math.min(1, value / longest));
  const root = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'analytics-svg analytics-scatter',
    role: 'img', 'aria-label': 'Games by share of sessions that reach a minute of play and average session length' });
  root.append(svgNode('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), class: 'analytics-axis-line' }));
  root.append(svgNode('line', { x1: x(0.5), x2: x(0.5), y1: pad.t, y2: y(0), class: 'analytics-grid-line', 'stroke-dasharray': '4 4' }));
  root.append(svgNode('line', { x1: pad.l, x2: W - pad.r, y1: y(split), y2: y(split), class: 'analytics-grid-line', 'stroke-dasharray': '4 4' }));
  root.append(svgLabel(pad.l, H - 32, '0% hook', 'start'));
  root.append(svgLabel(x(0.5), H - 32, 'half of sessions reach 60s+', 'middle'));
  root.append(svgLabel(W - pad.r, H - 32, '100% hook', 'end'));
  for (const value of [0, split, longest])
    root.append(svgLabel(pad.l - 8, y(value) + 3, duration(value), 'end'));
  // The four corner words live outside the plot, so the busiest game — which
  // sits in one of those corners by definition — cannot cover them.
  const taken = [];
  const corner = (cx, cy, text, anchor) => {
    root.append(svgLabel(cx, cy, text, anchor, 'analytics-quadrant-label'));
    const width = text.length * 5.9, left = anchor === 'end' ? cx - width : anchor === 'middle' ? cx - width / 2 : cx;
    taken.push({ left, right: left + width, top: cy - 9, bottom: cy + 2 });
  };
  corner(W - pad.r, 14, 'KEEP INVESTING', 'end');
  corner(pad.l, 14, 'REWARD THE COMMITTED', 'start');
  corner(W - pad.r, H - 6, 'ADD DEPTH', 'end');
  corner(pad.l, H - 6, 'FIX THE FIRST MINUTE', 'start');
  const overlaps = box => taken.some(other => box.left < other.right + 2 && box.right + 2 > other.left &&
    box.top < other.bottom + 2 && box.bottom + 2 > other.top);
  // Biggest bubbles keep their names; a crowded neighbour loses its label
  // rather than drawing it across another one.
  for (const row of [...rows].sort((a, b) => b.sessions - a.sessions)) {
    const radius = 4 + Math.min(11, Math.sqrt(row.sessions) * 2);
    const cx = x(row.hookRate), cy = y(row.perSession);
    const bubble = svgNode('circle', { cx, cy, r: radius, class: 'analytics-bubble' });
    const title = svgNode('title');
    title.textContent = (names[row.id] || row.id) + ' · ' + pct(row.hookRate) + ' hook · ' +
      duration(row.perSession) + ' avg · ' + row.sessions + ' sessions' +
      (row.returnRate === null ? '' : ' · ' + pct(row.returnRate) + ' returned');
    bubble.append(title); root.append(bubble);
    const label = names[row.id] || row.id, width = label.length * 6.1;
    for (const baseline of [cy + radius + 10, cy - radius - 4]) {
      const box = { left: cx - width / 2, right: cx + width / 2, top: baseline - 9, bottom: baseline + 2 };
      if (box.left < 2 || box.right > W - 2 || overlaps(box)) continue;
      root.append(svgLabel(cx, baseline, label, 'middle', 'analytics-bubble-label'));
      taken.push(box); break;
    }
  }
  host.replaceChildren(root);
}
function lineChart(target, rows) {
  const host = mount(target);
  if (!rows.length) { host.replaceChildren(el('p', 'No activity recorded yet.')); return; }
  const W = 760, H = 230, pad = { l: 58, r: 18, t: 16, b: 30 };
  const max = Math.max(1, ...rows.map(row => row.active));
  const x = index => rows.length > 1 ? pad.l + index * (W - pad.l - pad.r) / (rows.length - 1) : (pad.l + W - pad.r) / 2;
  const y = value => pad.t + (H - pad.t - pad.b) * (1 - value / max);
  const root = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'analytics-svg',
    role: 'img', 'aria-label': 'Active play time by Detroit day' });
  for (const level of [0, 0.5, 1]) {
    root.append(svgNode('line', { x1: pad.l, x2: W - pad.r, y1: y(max * level), y2: y(max * level),
      class: level ? 'analytics-grid-line' : 'analytics-axis-line' }));
    root.append(svgLabel(pad.l - 8, y(max * level) + 3, duration(max * level), 'end'));
  }
  const tick = Math.max(1, Math.ceil(rows.length / 7));
  // The last day is always worth printing, but not on top of its neighbour.
  const minGap = tick > 1 ? Math.max(2, Math.floor(tick / 2)) : 1;
  let lastTick = -Infinity;
  rows.forEach((row, index) => {
    if (!(index % tick === 0 || index === rows.length - 1) || index - lastTick < minGap) return;
    lastTick = index;
    root.append(svgLabel(x(index), H - 10, row.id.slice(5), 'middle'));
  });
  const points = rows.map((row, index) => x(index) + ',' + y(row.active));
  if (rows.length > 1) {
    root.append(svgNode('polygon', { points: pad.l + ',' + y(0) + ' ' + points.join(' ') + ' ' + x(rows.length - 1) + ',' + y(0),
      class: 'analytics-trend-area' }));
    root.append(svgNode('polyline', { points: points.join(' '), class: 'analytics-trend-line' }));
  }
  // A trailing week keeps a single spike from rewriting the story.
  if (rows.length >= 4) {
    const average = rows.map((row, index) => {
      const window = rows.slice(Math.max(0, index - 6), index + 1);
      return window.reduce((sum, item) => sum + item.active, 0) / window.length;
    });
    root.append(svgNode('polyline', { points: average.map((value, index) => x(index) + ',' + y(value)).join(' '),
      class: 'analytics-trend-average' }));
  }
  rows.forEach((row, index) => {
    const dot = svgNode('circle', { cx: x(index), cy: y(row.active), r: rows.length > 45 ? 2 : 3.5, class: 'analytics-trend-dot' });
    const title = svgNode('title');
    title.textContent = row.id + ' · ' + duration(row.active) + ' · ' + row.sessions.size + ' sessions';
    dot.append(title); root.append(dot);
  });
  host.replaceChildren(root);
}
function ratingChart(target, rows) {
  const host = mount(target);
  const rated = (rows || []).filter(row => row.ratings > 0);
  if (!rated.length) { host.replaceChildren(el('p', 'No enjoyment ratings in this selection.')); return; }
  host.replaceChildren(...rated.map(row => {
    const wrap = el('div'); wrap.className = 'analytics-love';
    const head = el('div'); head.className = 'analytics-love-head';
    head.append(el('strong', names[row.game] || row.game),
      el('span', row.average.toFixed(1) + ' / 5 · ' + row.ratings + ' rating' + (row.ratings === 1 ? '' : 's')));
    const meters = el('div'); meters.className = 'analytics-love-meters analytics-love-single';
    meters.append(meter('Average rating', row.average / 5, row.average.toFixed(1) + ' / 5'));
    wrap.append(head, meters); return wrap;
  }));
}
function insightCard(item) {
  const card = el('article'); card.className = 'analytics-insight'; card.dataset.tone = item.tone;
  const head = el('div'); head.className = 'analytics-insight-head';
  head.append(el('span', item.tone === 'good' ? 'Working' : item.tone === 'watch' ? 'Watch' : 'Try next'),
    el('strong', item.metric || ''));
  head.firstChild.className = 'analytics-insight-kicker'; head.lastChild.className = 'analytics-insight-metric';
  card.append(head, el('h3', item.title), el('p', item.detail));
  return card;
}
// --- Overview --------------------------------------------------------------
// The same numbers, three ways to read them: a written briefing, a sortable
// standings board, or one small card per game. One is mounted at a time, and
// every value comes from the tables this page already loads.
let layout = 'briefing', boardSort = 'active';
const boardOrders = {
  active: (a, b) => b.active - a.active || b.sessions - a.sessions,
  sessions: (a, b) => b.sessions - a.sessions || b.active - a.active,
  share: (a, b) => b.share - a.share,
  hookRate: (a, b) => b.hookRate - a.hookRate || b.sessions - a.sessions,
  returnRate: (a, b) => (b.returnRate ?? -1) - (a.returnRate ?? -1),
  errors: (a, b) => b.errors / b.sessions - a.errors / a.sessions
};
const playedSignals = signals => signals.filter(row => row.sessions > 0);
function panel(title, note) {
  const node = el('section'); node.className = 'analytics-panel';
  if (title) node.append(el('h2', title));
  if (note) { const p = el('p', note); p.className = 'analytics-note'; node.append(p); }
  return node;
}
// A drawing keeps its real width so its labels stay readable; only its own box
// pans on a narrow screen, never the document.
function chartBox(draw) { const box = el('div'); box.className = 'analytics-chartbox'; draw(box); return box; }
function barsHost(rows, label) { const host = el('div'); bars(host, rows, label); return host; }
function hoursGrid(hours) {
  const max = Math.max(1, ...hours.map(hour => hour.active));
  const grid = el('div'); grid.className = 'analytics-hours';
  // A cell is only a few characters wide, so it says 22.9m rather than 22.9 min.
  const short = ms => ms >= 3600000 ? (ms / 3600000).toFixed(1) + 'h'
    : ms >= 60000 ? (ms / 60000).toFixed(1) + 'm' : Math.round(ms / 1000) + 's';
  for (const hour of hours) {
    const cell = el('div'); cell.className = 'analytics-hour';
    cell.style.backgroundColor = 'rgba(69,102,83,' + (hour.active / max * .2).toFixed(3) + ')';
    cell.append(el('span', hour.id + ':00'), el('strong', short(hour.active)));
    grid.append(cell);
  }
  return grid;
}
function sparkline(values) {
  if (!values.length) return el('span', '—');
  const W = 160, H = 34, pad = 3, max = Math.max(1, ...values);
  const x = index => values.length > 1 ? pad + index * (W - pad * 2) / (values.length - 1) : pad + (W - pad * 2) / 2;
  const y = value => H - pad - (H - pad * 2) * (value / max);
  const root = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'analytics-spark',
    role: 'img', 'aria-label': 'Active play time per day in this date range' });
  root.append(svgNode('line', { x1: pad, x2: W - pad, y1: H - pad, y2: H - pad, class: 'analytics-axis-line' }));
  root.append(svgNode('polyline', { points: values.map((value, index) => x(index) + ',' + y(value)).join(' '),
    class: 'analytics-spark-line' }));
  return root;
}
function seriesFor(game) {
  const daily = (report.gameDays && report.gameDays[game]) || {};
  return report.days.map(day => daily[day.id] || 0);
}
function insightGrid(insights) {
  const grid = el('div'); grid.className = 'analytics-insight-grid';
  if (!insights.length) {
    grid.className = '';
    const p = el('p', 'No advice yet: it needs at least 10 sessions, and 10 sessions of a game before naming it. Widen the dates to collect more activity.');
    p.className = 'analytics-note'; grid.append(p); return grid;
  }
  grid.append(...insights.map(insightCard));
  return grid;
}
function briefingSentence(signals, totals) {
  const days = report.days.length;
  if (!totals.sessions) return 'No activity in this selection yet. Widen the dates above, or check that the collector is running.';
  const played = playedSignals(signals), top = played[0];
  const sessions = totals.sessions + ' session' + (totals.sessions === 1 ? '' : 's');
  const spread = top ? ', and ' + pct(top.share) + ' of it went to ' + (names[top.id] || top.id) : '';
  return 'In ' + days + ' day' + (days === 1 ? '' : 's') + ', ' + sessions + ' put in ' +
    duration(totals.active) + ' of play (' + duration(totals.active / totals.sessions) + ' each)' + spread + '. ' +
    totals.accounts + ' signed-in account' + (totals.accounts === 1 ? '' : 's') + ' and ' +
    totals.guests + ' guest session' + (totals.guests === 1 ? '' : 's') + ' are in the count.';
}
function rankedList(rows) {
  if (!rows.length) return el('p', 'No activity recorded yet.');
  const max = Math.max(...rows.map(row => row.share)) || 1;
  const list = el('ol'); list.className = 'analytics-ranked';
  rows.forEach((row, index) => {
    const item = el('li'); item.className = 'analytics-ranked-row';
    const rank = el('span', String(index + 1)); rank.className = 'analytics-rank';
    const body = el('div'); body.className = 'analytics-ranked-body';
    const head = el('div'); head.className = 'analytics-ranked-head';
    head.append(el('strong', names[row.id] || row.id),
      el('span', row.sessions + ' sessions · ' + duration(row.perSession) + ' each · ' + pct(row.share) + ' of play'));
    const bar = el('div'); bar.className = 'analytics-ranked-bar';
    const fill = el('div'); fill.className = 'analytics-ranked-fill';
    fill.style.width = Math.round(row.share / max * 100) + '%';
    bar.append(fill);
    const meta = el('p'); meta.className = 'analytics-ranked-meta';
    meta.textContent = pct(row.hookRate) + ' of sessions reach a minute' +
      (row.returnRate === null ? ' · not enough history to judge returns'
        : ' · ' + pct(row.returnRate) + ' came back another day') +
      (row.errors ? ' · ' + row.errors + ' error' + (row.errors === 1 ? '' : 's') : '');
    body.append(head, bar, meta);
    item.append(rank, body); list.append(item);
  });
  return list;
}
function barCell(ratio, text) {
  const cell = el('td'), wrap = el('div'); wrap.className = 'analytics-cell-barwrap';
  const track = el('div'); track.className = 'analytics-cell-bar';
  const fill = el('div'); fill.className = 'analytics-cell-fill';
  fill.style.width = Math.round(Math.max(0, Math.min(1, ratio || 0)) * 100) + '%';
  track.append(fill); wrap.append(track, el('span', text)); cell.append(wrap); return cell;
}
function standingsTable(rows) {
  if (!rows.length) return el('p', 'No activity recorded yet.');
  const sorted = [...rows].sort(boardOrders[boardSort] || boardOrders.active);
  const wrap = el('div'); wrap.className = 'analytics-table-wrap';
  const table = el('table'); table.className = 'analytics-board-table';
  const thead = el('thead'), head = el('tr');
  const columns = [['Game', null], ['Play time', 'active'], ['Share', 'share'], ['Sessions', 'sessions'],
    ['Avg / session', null], ['Hooked', 'hookRate'], ['Came back', 'returnRate'], ['Errors', 'errors']];
  for (const [label, key] of columns) {
    const th = el('th'); th.scope = 'col';
    if (!key) th.textContent = label;
    else {
      const button = el('button', label + (boardSort === key ? ' ↓' : ''));
      button.type = 'button';
      button.onclick = () => { boardSort = key; render(); };
      th.append(button);
    }
    head.append(th);
  }
  thead.append(head); table.append(thead);
  const body = el('tbody'), maxShare = Math.max(...rows.map(row => row.share)) || 1;
  for (const row of sorted) {
    const tr = el('tr');
    const nameCell = el('td', names[row.id] || row.id); nameCell.className = 'analytics-board-game';
    tr.append(nameCell, el('td', duration(row.active)), barCell(row.share / maxShare, pct(row.share)),
      el('td', String(row.sessions)), el('td', duration(row.perSession)),
      el('td', pct(row.hookRate)), el('td', row.returnRate === null ? '—' : pct(row.returnRate)),
      el('td', String(row.errors)));
    body.append(tr);
  }
  table.append(body); wrap.append(table); return wrap;
}
function briefingView({ signals, insights }) {
  const frag = document.createDocumentFragment();
  const lead = el('section'); lead.className = 'analytics-panel';
  const text = el('p', briefingSentence(signals, report.totals)); text.className = 'analytics-brief-lead';
  lead.append(text);
  frag.append(lead);
  const trend = panel('Play over time', 'Solid: each Detroit day. Dashed: seven-day trailing average. Hover a point for its day and session count.');
  trend.append(chartBox(box => lineChart(box, report.days)));
  frag.append(trend);
  const ranked = panel('What people play, and whether it lands',
    'Bars compare share of active play time. Under each game: how many of its sessions reach a minute of play, and how many players came back on another day.');
  ranked.append(rankedList(playedSignals(signals)));
  frag.append(ranked);
  const moves = panel('What to do next', 'Read from the dates and filters above. Each card names the signal behind it, not a target. Advice needs at least 10 sessions, and 10 sessions of a game before it names one.');
  moves.append(insightGrid(insights));
  frag.append(moves);
  return frag;
}
function boardView({ signals, insights }) {
  const frag = document.createDocumentFragment();
  const standings = panel('Standings', 'One row per game in this selection. Click a column to sort by it; the share bar is that game’s slice of active play time.');
  standings.append(standingsTable(playedSignals(signals)));
  frag.append(standings);
  const trend = panel('Play over time', 'Solid: each Detroit day. Dashed: seven-day trailing average.');
  trend.append(chartBox(box => lineChart(box, report.days)));
  frag.append(trend);
  const grid = el('div'); grid.className = 'analytics-panel-grid';
  const hours = panel('Time of day · Detroit'); hours.append(hoursGrid(report.hours)); grid.append(hours);
  const sources = panel('Where play starts');
  sources.append(barsHost(report.sources, row => (row.id === 'unknown' ? 'unknown source' : row.id) + ' · ' + row.sessions + ' sessions'));
  grid.append(sources);
  const devices = panel('Device & embed'); devices.append(barsHost(report.devices, row => row.id)); grid.append(devices);
  const modes = panel('Daily challenge vs free play');
  modes.append(barsHost(report.modes, row => row.id + ' · ' + row.sessions + ' sessions')); grid.append(modes);
  frag.append(grid);
  const moves = panel('What to do next', 'Read from the dates and filters above. Advice needs at least 10 sessions, and 10 sessions of a game before it names one.');
  moves.append(insightGrid(insights));
  frag.append(moves);
  return frag;
}
function gameTile(row) {
  const card = el('article'); card.className = 'analytics-tile';
  const head = el('div'); head.className = 'analytics-tile-head';
  head.append(el('strong', names[row.id] || row.id), el('span', duration(row.active)));
  const stats = el('dl');
  const add = (label, value) => stats.append(el('dt', label), el('dd', value));
  add('sessions', String(row.sessions));
  add('avg session', duration(row.perSession));
  add('hooked (60s+)', pct(row.hookRate));
  add('came back', row.returnRate === null ? '—' : pct(row.returnRate));
  card.append(head, sparkline(seriesFor(row.id)), stats);
  return card;
}
function cardsView({ signals, insights, engagement }) {
  const frag = document.createDocumentFragment(), played = playedSignals(signals);
  const tiles = el('div'); tiles.className = 'analytics-tiles';
  if (!played.length) tiles.append(el('p', 'No activity recorded yet.'));
  for (const row of played) tiles.append(gameTile(row));
  const scatter = el('section'); scatter.className = 'analytics-tile analytics-tile-wide';
  scatter.append(el('h2', 'Hook vs depth'));
  const scatterNote = el('p', 'Horizontal: share of sessions that reach a minute of play. Vertical: average active minutes per session. Bubble size: sessions.'); scatterNote.className = 'analytics-note';
  scatter.append(scatterNote, chartBox(box => quadrantChart(box, played)));
  tiles.append(scatter);
  const hours = el('section'); hours.className = 'analytics-tile analytics-tile-wide';
  hours.append(el('h2', 'Time of day · Detroit'), hoursGrid(report.hours)); tiles.append(hours);
  const ratings = el('section'); ratings.className = 'analytics-tile';
  ratings.append(el('h2', 'Enjoyment by game'));
  const ratingHost = el('div'); ratingChart(ratingHost, engagement.survey.byGame || []); ratings.append(ratingHost);
  tiles.append(ratings);
  const sources = el('section'); sources.className = 'analytics-tile';
  sources.append(el('h2', 'Where play starts'),
    barsHost(report.sources, row => (row.id === 'unknown' ? 'unknown source' : row.id) + ' · ' + row.sessions + ' sessions'));
  tiles.append(sources);
  const devices = el('section'); devices.className = 'analytics-tile';
  devices.append(el('h2', 'Device & embed'), barsHost(report.devices, row => row.id)); tiles.append(devices);
  const modes = el('section'); modes.className = 'analytics-tile';
  modes.append(el('h2', 'Daily challenge vs free play'),
    barsHost(report.modes, row => row.id + ' · ' + row.sessions + ' sessions')); tiles.append(modes);
  frag.append(tiles);
  const moves = panel('What to do next', 'Read from the dates and filters above. Advice needs at least 10 sessions, and 10 sessions of a game before it names one.');
  moves.append(insightGrid(insights));
  frag.append(moves);
  return frag;
}
function renderOverview(engagement) {
  const signals = buildGameSignals({ report, engagement });
  const insights = buildInsights({ signals, hours: report.hours,
    sources: report.sources, survey: engagement.survey, totals: report.totals }, names);
  const context = { signals, insights, engagement };
  const view = layout === 'board' ? boardView : layout === 'cards' ? cardsView : briefingView;
  $('#overview-body').replaceChildren(view(context));
}
function gameRows(games) {
  return games.map(g => [names[g.id] || g.id, g.sessions, g.users.size, duration(g.active), duration(g.visible), duration(g.active / g.sessions), g.completed, g.errors]);
}
const gameColumns = ['Game','Sessions','Accounts','Active time','Visible time','Avg active / session','Daily completions','Errors'];
function renderEngagement(data, products, feedback) {
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
 * A sortie is a session ID, not a raw event count (checkpoints are repeated). */
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
    s.interacted ||= e.kind === 'interaction';
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
  const engaged = flights.filter(s => s.interacted || s.active >= 60000).length;
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
  table('#f14-modes', ['Mode','Sorties','Active time'],
    group('mode').map(s => [s.id,s.count,duration(s.active)]));
  table('#f14-aircraft', ['Vehicle','Sorties','Active time'],
    group('aircraft').map(s => [s.id,s.count,duration(s.active)]));
  const outcomes = group('outcome');
  table('#f14-outcomes', ['Outcome','Sorties'],
    outcomes.map(s => [s.id,s.count]));
}
function renderHistory() {
  const totals = aggregateSummary?.totals;
  if (!totals) {
    $('#history-totals').replaceChildren(el('p', 'Aggregated history is unavailable.'));
    for (const id of ['#history-games','#history-sources','#history-ui','#history-cohorts'])
      $(id).replaceChildren(el('p', 'No aggregate data available.'));
    return;
  }
  const items = [
    ['Game launches', totals.launches], ['Meaningful sessions', totals.meaningful],
    ['Tracked browsers', totals.browsers], ['Active game time', duration(totals.active_ms)],
    ['Error sessions', totals.error_sessions], ['Site visits', aggregateSummary.site?.visits || 0]
  ];
  $('#history-totals').replaceChildren(...items.map(([name, value]) => {
    const n = el('div'); n.className = 'analytics-stat';
    n.append(el('strong', value), el('span', name)); return n;
  }));
  const percentage = (numerator, denominator) =>
    denominator ? Math.round(numerator * 100 / denominator) + '%' : '—';
  const gameRows = (aggregateSummary.games || []).map(g => [
    names[g.game] || g.game, g.launches, g.meaningful,
    percentage(g.meaningful,g.sessions), g.browsers, duration(g.active_ms),
    duration(g.median_active_ms), g.errors
  ]);
  table('#history-games', ['Game','Launches','Meaningful','Meaningful rate','Browser IDs','Active time','Median active','Errors'], gameRows);
  table('#history-sources', ['Launch source','Launches','Meaningful','Active time'],
    (aggregateSummary.sources || []).map(r => [r.source,r.launches,r.meaningful,duration(r.active_ms)]));
  const actions = (aggregateSummary.ui_events || [])
    .filter(e => e.kind !== 'visit')
    .sort((a,b) => b.events-a.events || a.kind.localeCompare(b.kind))
    .slice(0,100);
  table('#history-ui',['Event','Game','Surface','Action','Count','Browser IDs'], actions.map(e => [
    e.kind, names[e.game] || e.game || '—',e.surface || '—',e.action_name || '—',e.events,e.browsers
  ]));
  table('#history-cohorts',['First visit','Browsers','D1 returns','D7 returns','Next school day','School-day returns'],
    aggregateCohorts.map(c => [c.first_day,c.cohort,
      c.d1_returned == null ? 'Not mature' : c.d1_returned + ' (' + percentage(c.d1_returned,c.cohort) + ')',
      c.d7_returned == null ? 'Not mature' : c.d7_returned + ' (' + percentage(c.d7_returned,c.cohort) + ')',
      c.next_school || '—',
      c.school_returned == null ? 'Not mature' : c.school_returned + ' (' + percentage(c.school_returned,c.cohort) + ')'
    ]));
}
function render() {
  const selected = $('#person').value;
  const matching = event => !selected || (selected === 'guest' ? !event.user_id : event.user_id === selected);
  const rows = events.filter(matching), products = productEvents.filter(matching), feedback = feedbackRows.filter(matching);
  report = summarizeEvents(rows, handles);
  const engagement = summarizeEngagement(rows, products, feedback,
    new Date(detroitMidnight(shiftDay($('#through').value, 1)) - 1));
  const t = report.totals;
  const stats = [['Active time', duration(t.active)], ['Sessions', t.sessions], ['Signed-in accounts', t.accounts], ['Guest sessions', t.guests], ['Visible time', duration(t.visible)], ['Repeat accounts', t.repeatAccounts], ['Daily completions', t.completed], ['Errors', t.errors]];
  $('#totals').replaceChildren(...stats.map(([label, value]) => { const n = el('div'); n.className = 'analytics-stat'; n.append(el('strong', value), el('span', label)); return n; }));
  renderOverview(engagement);
  table('#games-table', gameColumns, gameRows(report.games));
  renderF14(rows);
  table('#players-table', ['Player','Sessions','Games','Days active','Active time','Avg / session','Last seen'], report.players.map(p => [
    action(p.label, () => { $('#person').value = p.id === 'Unidentified guests' ? 'guest' : p.id; page = 0; render(); }),
    p.sessions, p.games.size, p.days.size, duration(p.active), duration(p.active / p.sessions), dateTime(p.last)
  ]));
  $('#player-detail').hidden = !selected;
  $('#player-heading').textContent = selected === 'guest' ? 'Unidentified guests' : handles[selected] || selected;
  if (selected) table('#player-games', gameColumns, gameRows(report.games));
  renderEngagement(engagement, products, feedback);
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
    const [productLoaded,feedbackLoaded,authoritativeTogether,serverRollup,serverCohorts] = await Promise.all([
      request('/rest/v1/product_events?select=*&received_at=gte.' + start.toISOString() +
        '&received_at=lt.' + end.toISOString() + '&order=received_at.asc&limit=20000'),
      request('/rest/v1/feedback_entries?select=*&created_at=gte.' + start.toISOString() +
        '&created_at=lt.' + end.toISOString() + '&order=created_at.asc&limit=20000'),
      request('/rest/v1/rpc/analytics_together_summary',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}}),
      request('/rest/v1/rpc/analytics_rollup_v1',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}}).catch(() => null),
      request('/rest/v1/rpc/analytics_retention_cohorts_v1',{method:'POST',
        body:{p_from:start.toISOString(),p_to:end.toISOString()}}).catch(() => [])
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
    aggregateSummary = serverRollup;
    aggregateCohorts = Array.isArray(serverCohorts) ? serverCohorts : [];
    const excluded = loaded.length + flightLoaded.length - events.length;
    const previous = $('#person').value;
    $('#person').replaceChildren(new Option('All players', ''), new Option('Unidentified guests', 'guest'),
      ...[...new Set(events.map(e => e.user_id).filter(Boolean))].map(id => new Option(handles[id] || id.slice(0, 8), id)));
    $('#person').value = [...$('#person').options].some(o => o.value === previous) ? previous : '';
    page = 0; render(); renderHistory();
    const emptyReason = events.length ? '' : loaded.length + flightLoaded.length
      ? ' · Player report is empty because every recorded event in this selection was staff/admin activity.'
      : ' · No telemetry was received in this selection.';
    $('#status').textContent = (capped ? 'DETAILED SESSION LIMIT REACHED — the Funnels & history tab still uses complete server-side summaries. Narrow the date range for individual sessions. ' : '') +
      events.length.toLocaleString() + ' player events loaded · refreshed ' + dateTime(cutoff) + emptyReason +
      (excluded ? ' · ' + excluded.toLocaleString() + ' staff/admin events recorded and excluded' : '');
  } catch (error) {
    events = []; productEvents = []; feedbackRows = []; togetherSummary = null; aggregateSummary = null; aggregateCohorts = []; report = null; $('#dashboard').hidden = !authorized; $('#access').hidden = authorized;
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
// The three readings are the same numbers; switching re-renders from memory and
// never re-fetches, so a sort or a layout change costs no network.
for (const button of document.querySelectorAll('[data-layout]')) button.onclick = () => {
  layout = button.dataset.layout;
  for (const other of document.querySelectorAll('[data-layout]')) other.setAttribute('aria-pressed', String(other === button));
  render();
};
$('#export').onclick = () => {
  const selected = $('#person').value;
  const rows = events.filter(e => !selected || (selected === 'guest' ? !e.user_id : e.user_id === selected));
  const url = URL.createObjectURL(new Blob([eventsCSV(rows, handles)], { type: 'text/csv;charset=utf-8' }));
  const link = el('a'); link.href = url; link.download = 'bored-activity.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Clear sensitive DOM when a different tab signs out or switches account.
window.addEventListener('storage', event => { if (event.key === 'bored.session') { epoch++; events = []; productEvents = []; feedbackRows = []; togetherSummary = null; report = null; $('#dashboard').replaceChildren(); $('#dashboard').hidden = true; $('#status').textContent = 'Account changed. Reload to check access again.'; } });
void load();

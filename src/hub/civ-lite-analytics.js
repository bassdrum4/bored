import { request, freshSession, getSession } from './backend.js';

const $ = selector => document.querySelector(selector);
const formatNumber = value => Number(value || 0).toLocaleString();
const formatTime = value => {
  const ms = Number(value || 0);
  if (ms >= 3600000) return (ms / 3600000).toFixed(1) + ' h';
  if (ms >= 60000) return (ms / 60000).toFixed(1) + ' min';
  return Math.round(ms / 1000) + ' s';
};
const formatDay = date => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);
const shiftDay = (day, days) => {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
function makeCell(tag, value) {
  const node = document.createElement(tag);
  node.textContent = String(value ?? '');
  return node;
}
function renderTable(target, headings, rows) {
  const root = $(target);
  root.replaceChildren();
  if (!rows?.length) {
    root.append(makeCell('p', 'No recorded activity for this period.'));
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'analytics-table-wrap';
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  headings.forEach(label => headRow.append(makeCell('th', label)));
  head.append(headRow);
  const body = document.createElement('tbody');
  rows.forEach(values => {
    const row = document.createElement('tr');
    values.forEach(value => row.append(makeCell('td', value)));
    body.append(row);
  });
  table.append(head, body); wrapper.append(table); root.append(wrapper);
}
function render(report) {
  const t = report.totals;
  const metrics = [
    ['Sessions', formatNumber(t.sessions)],
    ['Estimated players', formatNumber(t.estimatedPlayers)],
    ['Signed-in accounts', formatNumber(t.signedInAccounts)],
    ['Guest sessions', formatNumber(t.guestSessions)],
    ['Active time', formatTime(t.activeMs)],
    ['Avg active / session', formatTime(Number(t.activeMs) / Math.max(1, Number(t.sessions)))],
    ['Engaged sessions', formatNumber(t.engagedSessions)],
    ['Finished sessions', formatNumber(t.endedSessions)],
    ['Daily completions', formatNumber(t.completedSessions)],
    ['Recorded errors', formatNumber(t.errors)]
  ];
  $('#totals').replaceChildren(...metrics.map(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'analytics-stat';
    item.append(makeCell('strong', value), makeCell('span', label));
    return item;
  }));
  renderTable('#daily', ['Date','Sessions','Players','Active time','Errors'],
    (report.daily || []).map(d => [d.date,formatNumber(d.sessions),formatNumber(d.players),formatTime(d.activeMs),formatNumber(d.errors)]));
  renderTable('#sources', ['Source','Launches'],
    (report.sources || []).map(d => [d.label,formatNumber(d.count)]));
  renderTable('#actions', ['Event','Count'],
    (report.actions || []).map(d => [d.label,formatNumber(d.count)]));
  renderTable('#discovery', ['Event','Count'],
    (report.discovery || []).map(d => [d.label,formatNumber(d.count)]));
}
let loading = false, epoch = 0;
async function load() {
  if (loading) return;
  loading = true;
  const current = ++epoch;
  $('#refresh').disabled = true;
  $('#status').textContent = 'Checking Civ Lite access…';
  try {
    const session = await freshSession();
    if (!session) throw new Error('Sign in to your Bored account first.');
    const from = $('#from').value, through = $('#through').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through)
      || from > through || shiftDay(from, 89) < through) {
      throw new Error('Choose an inclusive date range of 1 to 90 days.');
    }
    const report = await request('/rest/v1/rpc/civ_lite_analytics_v1', {
      method: 'POST', body: { p_from: from, p_through: through }
    });
    if (current !== epoch || getSession()?.user?.id !== session.user.id) {
      throw new Error('Account changed. Reload this page.');
    }
    render(report);
    $('#dashboard').hidden = false; $('#access').hidden = true; $('#refresh').hidden = false;
    $('#status').textContent = 'Civ Lite only · ' + from + ' through ' + through + ' · updated ' +
      new Date().toLocaleTimeString([], { timeZone: 'America/Detroit', hour: 'numeric', minute: '2-digit' });
  } catch (error) {
    $('#dashboard').hidden = true;
    $('#access').hidden = false;
    $('#status').textContent = error?.code === '42501'
      ? 'This account has not been granted Civ Lite analytics access.'
      : (error.message || 'Could not load analytics.');
  } finally {
    loading = false;
    $('#refresh').disabled = false;
  }
}
const today = formatDay(new Date());
$('#from').value = shiftDay(today, -13);
$('#through').value = today;
$('#filters').onsubmit = event => { event.preventDefault(); void load(); };
$('#refresh').onclick = () => void load();
window.addEventListener('storage', event => {
  if (event.key !== 'bored.session') return;
  epoch++;
  $('#dashboard').hidden = true;
  $('#access').hidden = false;
  $('#status').textContent = 'Account changed. Reload to check access.';
});
void load();

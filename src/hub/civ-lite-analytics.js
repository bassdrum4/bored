import { request, freshSession, getSession } from './backend.js';
import { getAnalyticsAccess } from './analytics-access.js';

const GAME_NAMES = {
  ashcrown: 'Civ Lite (Ashcrown)',
  pokedoku: 'Pokédoku',
  'poke-idle': 'Poké Idle',
  'poke-gacha': 'Poké Gacha'
};
const gameName = game => GAME_NAMES[game] || game;
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

function scopedBars(target,rows,label,value,limit=12) {
  const root=$(target), data=rows.map(r=>({name:String(label(r)),count:Math.max(0,Number(value(r))||0)}))
    .filter(r=>r.count>0).sort((a,b)=>b.count-a.count).slice(0,limit);
  const max=Math.max(1,...data.map(r=>r.count));
  root.replaceChildren(...data.map(r=>{
    const line=document.createElement('div');line.className='analytics-bar-row';
    const name=makeCell('span',r.name);name.className='analytics-bar-label';name.title=r.name;
    const track=document.createElement('div');track.className='analytics-bar-track';track.setAttribute('aria-hidden','true');
    const fill=document.createElement('div');fill.className='analytics-bar';fill.style.width=100*r.count/max+'%';track.append(fill);
    const count=makeCell('span',formatNumber(r.count));count.className='analytics-bar-value';
    line.append(name,track,count);return line;
  }));
  if(!data.length)root.append(makeCell('p','No recorded activity for this period.'));
}
function scopedDaily(target,rows) {
  const root=$(target),data=[...rows].sort((a,b)=>a.date.localeCompare(b.date));
  const max=Math.max(1,...data.map(r=>Number(r.sessions)||0));
  root.replaceChildren(...data.map(r=>{
    const line=document.createElement('div');line.className='analytics-bar-row';
    const name=makeCell('span',r.date);name.className='analytics-bar-label';
    const track=document.createElement('div');track.className='analytics-bar-track';track.setAttribute('aria-hidden','true');
    const fill=document.createElement('div');fill.className='analytics-bar';fill.style.width=100*(Number(r.sessions)||0)/max+'%';track.append(fill);
    const count=makeCell('span',formatNumber(r.sessions));count.className='analytics-bar-value';
    line.append(name,track,count);return line;
  }));
  if(!data.length)root.append(makeCell('p','No recorded activity for this period.'));
}
function scopedDonut(target,rows) {
  const root=$(target);
  const data=rows.map(r=>({name:String(r.label),count:Math.max(0,Number(r.count)||0)}))
    .filter(r=>r.count>0).sort((a,b)=>b.count-a.count);
  const total=data.reduce((sum,r)=>sum+r.count,0);
  if(!total){root.replaceChildren(makeCell('p','No recorded activity for this period.'));return;}
  const kept=data.slice(0,7);
  if(data.length>7)kept.push({name:'Other',count:data.slice(7).reduce((n,r)=>n+r.count,0)});
  const palette=['#456653','#bd694b','#d1a04b','#648da5','#8a75a5','#779a6d','#b67c94','#8b8b80'];
  let offset=0;
  const stops=kept.map((r,i)=>{const start=100*offset/total;offset+=r.count;return palette[i]+' '+start+'% '+100*offset/total+'%';});
  const layout=document.createElement('div');layout.className='analytics-donut-layout';
  const wheel=document.createElement('div');wheel.className='analytics-donut';wheel.style.background='conic-gradient('+stops.join(',')+')';
  wheel.setAttribute('role','img');wheel.setAttribute('aria-label',kept.map(r=>r.name+': '+r.count).join('; '));
  const center=document.createElement('div');center.className='analytics-donut-middle';
  center.append(makeCell('strong',formatNumber(total)),makeCell('span','Total'));wheel.append(center);
  const legend=document.createElement('div');legend.className='analytics-donut-legend';
  kept.forEach((r,i)=>{
    const line=document.createElement('div');line.className='analytics-donut-key';
    const square=document.createElement('i');square.style.backgroundColor=palette[i];square.setAttribute('aria-hidden','true');
    const name=makeCell('span',r.name),value=makeCell('strong',formatNumber(r.count)+' · '+(100*r.count/total).toFixed(1)+'%');
    line.append(square,name,value);legend.append(line);
  });
  layout.append(wheel,legend);root.replaceChildren(layout);
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
    ['Completed rounds', formatNumber(t.completedSessions)],
    ['Recorded errors', formatNumber(t.errors)]
  ];
  $('#totals').replaceChildren(...metrics.map(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'analytics-stat';
    item.append(makeCell('strong', value), makeCell('span', label));
    return item;
  }));
  scopedDaily('#daily-chart',report.daily||[]);
  scopedDonut('#sources-chart',report.sources||[]);
  scopedBars('#actions-chart',report.actions||[],r=>r.label,r=>r.count);
  scopedBars('#discovery-chart',report.discovery||[],r=>r.label,r=>r.count);
  renderTable('#daily', ['Date','Sessions','Players','Active time','Errors'],
    (report.daily || []).map(d => [d.date,formatNumber(d.sessions),formatNumber(d.players),formatTime(d.activeMs),formatNumber(d.errors)]));
  renderTable('#sources', ['Source','Launches'],
    (report.sources || []).map(d => [d.label,formatNumber(d.count)]));
  renderTable('#actions', ['Event','Count'],
    (report.actions || []).map(d => [d.label,formatNumber(d.count)]));
  renderTable('#discovery', ['Event','Count'],
    (report.discovery || []).map(d => [d.label,formatNumber(d.count)]));
}
function syncGames(games) {
  const select = $('#game');
  const current = select.value;
  select.replaceChildren(...games.map(game => {
    const option = document.createElement('option');
    option.value = game;
    option.textContent = gameName(game);
    return option;
  }));
  select.value = games.includes(current) ? current : games.includes('ashcrown') ? 'ashcrown' : games[0];
  select.disabled = games.length < 2;
}
let loading = false, epoch = 0;
async function load() {
  if (loading) return;
  loading = true;
  const current = ++epoch;
  $('#refresh').disabled = true;
  $('#status').textContent = 'Checking analytics access…';
  try {
    const session = await freshSession();
    if (!session) throw new Error('Sign in to your Bored account first.');
    const access = await getAnalyticsAccess();
    if (current !== epoch || getSession()?.user?.id !== session.user.id) {
      throw new Error('Account changed. Reload this page.');
    }
    if (!access.games.length) {
      const error = new Error('This account has not been granted analytics access.');
      error.code = '42501';
      throw error;
    }
    syncGames(access.games);
    const game = $('#game').value;
    const from = $('#from').value, through = $('#through').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through)
      || from > through || shiftDay(from, 89) < through) {
      throw new Error('Choose an inclusive date range of 1 to 90 days.');
    }
    const report = await request('/rest/v1/rpc/game_analytics_v1', {
      method: 'POST', body: { p_game: game, p_from: from, p_through: through }
    });
    if (current !== epoch || getSession()?.user?.id !== session.user.id) {
      throw new Error('Account changed. Reload this page.');
    }
    render(report);
    $('#dashboard').hidden = false; $('#access').hidden = true; $('#refresh').hidden = false;
    $('#status').textContent = gameName(game) + ' · ' + from + ' through ' + through + ' · updated ' +
      new Date().toLocaleTimeString([], { timeZone: 'America/Detroit', hour: 'numeric', minute: '2-digit' });
  } catch (error) {
    $('#dashboard').hidden = true;
    $('#access').hidden = false;
    $('#status').textContent = error?.code === '42501'
      ? 'This account has not been granted analytics access.'
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
$('#game').onchange = () => void load();
$('#refresh').onclick = () => void load();
window.addEventListener('storage', event => {
  if (event.key !== 'bored.session') return;
  epoch++;
  $('#dashboard').hidden = true;
  $('#access').hidden = false;
  $('#status').textContent = 'Account changed. Reload to check access.';
});
void load();

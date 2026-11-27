import { request, freshSession, getSession } from './backend.js';
import { getAnalyticsAccess } from './analytics-access.js';
const $ = s => document.querySelector(s);
let rows = [], epoch = 0;
function node(tag, value) { const n = document.createElement(tag); if (value !== undefined) n.textContent = String(value); return n; }
function party(save) {
  return Array.isArray(save?.party) ? save.party.slice(0,6).map(p => '#' + p.num + ' Lv ' + p.lvl + (p.battleLvl != null && p.battleLvl !== p.lvl ? ' (battle ' + p.battleLvl + ')' : '') + (p.shiny ? ' shiny' : '') + (p.form ? ' · ' + p.form : '') + (p.mega ? ' · ' + p.mega : '')).join('; ') : '—';
}
function summary(s, story) {
  if (!s || typeof s !== 'object') return 'No save';
  return story ? 'Year ' + s.year + ' · chapter ' + s.chapter + ' · dex ' + s.lifeDex + ' · regions ' + s.liberated + ' · box ' + s.boxCount + ' · bonded ' + s.bonded + ' / unbonded ' + s.unbonded + ' · cleared ' + (Array.isArray(s.cleared) ? s.cleared.join(', ') : '—') + ' · picks ' + (s.picks && typeof s.picks === 'object' ? Object.entries(s.picks).map(([r,p]) => r + ': #' + p).join(', ') : '—') : 'Prestige ' + s.prestige + ' · dex ' + s.dex + ' · shiny ' + s.shinies + ' · badges ' + s.badges + ' · champions ' + s.champs + ' · ' + s.region + ' · box ' + s.boxCount;
}
function render() {
  const term = $('#filter').value.trim().toLowerCase();
  const wrap = node('div'); wrap.className = 'analytics-table-wrap';
  const table = node('table'), head = node('thead'), tr = node('tr'), body = node('tbody');
  ['Player','Classic','Classic party','Story','Story party','Last update'].forEach(h => tr.append(node('th',h))); head.append(tr);
  for (const r of rows.filter(r => r.handle.toLowerCase().includes(term))) {
    const tr = node('tr'); const c = r.snapshot?.classic, s = r.snapshot?.story;
    [r.handle, summary(c,false),party(c),summary(s,true),party(s),new Date(r.updated_at).toLocaleString()].forEach(v => tr.append(node('td',v))); body.append(tr);
  }
  table.append(head,body); wrap.append(table); $('#rows').replaceChildren(wrap);
  if (!body.children.length) $('#rows').append(node('p','No matching snapshots yet.'));
}
async function load() {
  const current = ++epoch; rows = []; $('#rows').replaceChildren(); $('#progress').hidden = true; $('#refresh').hidden = true;
  $('#status').textContent = 'Checking access…';
  try {
    const session = await freshSession(), access = await getAnalyticsAccess();
    if (!session || access.userId !== session.user.id || !(access.kind === 'admin' || access.games.includes('poke-idle'))) throw new Error('Poké Idle admin permission required.');
    const options = {token:session.access_token}; let records = [], profiles = [];
    for (let offset=0; ; offset+=500) {
      const batch=await request('/rest/v1/poke_idle_admin_snapshots?select=user_id,snapshot,updated_at&order=user_id&limit=500&offset='+offset,options);
      records.push(...batch); if(batch.length<500) break;
    }
    for(let i=0;i<records.length;i+=50) {
      const ids=records.slice(i,i+50).map(r=>r.user_id).join(',');
      profiles.push(...await request('/rest/v1/profiles?select=id,handle&id=in.('+encodeURIComponent(ids)+')',options));
    }
    if(current!==epoch || getSession()?.user?.id!==session.user.id) return;
    const handles=new Map(profiles.map(p=>[p.id,p.handle]));
    rows=records.map(r=>({...r,handle:String(handles.get(r.user_id)||'Unnamed player')})).sort((a,b)=>a.handle.localeCompare(b.handle));
    render(); $('#progress').hidden=false; $('#refresh').hidden=false; $('#status').textContent=rows.length+' reported accounts';
  } catch(error) { if(current===epoch) $('#status').textContent=error.message||'Could not load player progress.'; }
}
$('#refresh').onclick=()=>void load(); $('#filter').oninput=render;
window.addEventListener('storage',e=>{if(e.key==='bored.session'){epoch++; rows=[]; $('#rows').replaceChildren(); $('#progress').hidden=true; $('#refresh').hidden=true; $('#status').textContent='Account changed. Reload to check access.';}});
void load();

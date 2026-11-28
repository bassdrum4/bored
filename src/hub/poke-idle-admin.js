import { request, freshSession, getSession } from './backend.js';
import { getAnalyticsAccess } from './analytics-access.js';
const $ = s => document.querySelector(s);
const reader = 'da33b6a3-0eae-48b9-9bd0-82d49f36c8c6';
let rows = [], epoch = 0, sort = 'seen', direction = -1, selected = null;
const node = (tag, value) => { const n = document.createElement(tag); if (value != null) n.textContent = String(value); return n; };
const cols = [
 ['name','Player',r=>r.handle],['prestige','Classic prestige',r=>r.snapshot?.classic?.prestige],
 ['dex','Classic dex',r=>r.snapshot?.classic?.dex],['year','Story year',r=>r.snapshot?.story?.year],
 ['chapter','Chapter',r=>r.snapshot?.story?.chapter],['lifeDex','Story dex',r=>r.snapshot?.story?.lifeDex],
 ['seen','Last reported',r=>r.updated_at]
];
function party(save) {
 const wrap=node('div'); wrap.className='idle-party';
 for(const p of (Array.isArray(save?.party)?save.party.slice(0,6):[])) {
  if(!p || !Number.isInteger(p.num) || p.num<1 || p.num>1025) continue;
  const card=node('div'), img=node('img'); img.alt='Pokemon #'+p.num; img.width=64; img.height=64; img.loading='lazy';
  const base='./games/content/pokedoku/sprites/';
  const id=Number.isInteger(p.form)&&p.form>0&&p.form<20000?p.form:p.num;
  img.src=base+(p.shiny?'shiny/':'')+id+'.png';
  img.onerror=()=>{img.onerror=null;img.src=base+p.num+'.png';};
  card.append(img,node('strong','#'+p.num+' · Lv '+p.lvl),node('small',[p.shiny?'Shiny':'',p.form,p.mega,p.battleLvl!=null&&p.battleLvl!==p.lvl?'Battle Lv '+p.battleLvl:''].filter(Boolean).join(' · '))); wrap.append(card);
 }
 if(!wrap.children.length) wrap.append(node('p','No party reported.'));
 return wrap;
}
function details(r) {
 const panel=$('#details'); panel.replaceChildren(); panel.hidden=!r; if(!r)return;
 const title=node('h2',r.handle), close=node('button','Close'); close.onclick=()=>{selected=null;details(null);}; panel.append(title,close);
 for(const [label,s,fields] of [
 ['Classic',r.snapshot?.classic,[['Prestige','prestige'],['Lifetime dex','dex'],['Shinies','shinies'],['Badges','badges'],['Champions','champs'],['Furthest region','region'],['Box size','boxCount']]],
 ['Story',r.snapshot?.story,[['Year','year'],['Chapter','chapter'],['Regions liberated','liberated'],['Lifetime dex','lifeDex'],['Box size','boxCount'],['Bonded','bonded'],['Unbonded','unbonded'],['Mascot picks','picks'],['Years cleared','cleared']]]]) {
  const sec=node('section');sec.append(node('h3',label)); if(!s){sec.append(node('p','No save'));panel.append(sec);continue;}
  const dl=node('dl'); for(const [label,key] of fields){const v=s[key];dl.append(node('dt',label),node('dd',v==null?'—':typeof v==='object'?JSON.stringify(v):v));} sec.append(dl,party(s));panel.append(sec);
 }
}
function render() {
 const term=$('#filter').value.trim().toLowerCase(), year=$('#year').value, chapter=$('#chapter').value.trim().toLowerCase(), days=$('#inactive').value;
 const filtered=rows.filter(r=>r.handle.toLowerCase().includes(term)&&(!year||String(r.snapshot?.story?.year)===year)&&(!chapter||String(r.snapshot?.story?.chapter??'').toLowerCase()===chapter)&&(!days||Date.parse(r.updated_at)<=Date.now()-Number(days)*86400000));
 const get=cols.find(c=>c[0]===sort)[2];
 filtered.sort((a,b)=>{const x=get(a),y=get(b);if(x==null)return y==null?0:1;if(y==null)return -1;return direction*(typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true}));});
 const wrap=node('div');wrap.className='analytics-table-wrap'; const table=node('table'),head=node('thead'),tr=node('tr'),body=node('tbody');
 for(const [key,label] of cols){const th=node('th'), b=node('button',label+(sort===key?(direction===1?' ↑':' ↓'):''));th.scope='col';th.setAttribute('aria-sort',sort===key?(direction===1?'ascending':'descending'):'none');b.onclick=()=>{direction=sort===key?-direction:1;sort=key;render();};th.append(b);tr.append(th);}head.append(tr);
 for(const r of filtered){const tr=node('tr');for(const [key,,get] of cols){const td=node('td'),v=get(r);if(key==='name'){const b=node('button',v);b.onclick=()=>{selected=r.user_id;details(r);$('#details').scrollIntoView({block:'nearest'});};td.append(b);}else td.textContent=v==null?'—':key==='seen'?new Date(v).toLocaleString():String(v);tr.append(td);}body.append(tr);}
 table.append(head,body);wrap.append(table);$('#rows').replaceChildren(wrap);$('#count').textContent=filtered.length+' of '+rows.length+' reported accounts';if(!filtered.length)$('#rows').append(node('p','No matching accounts.'));
}
async function load() {
 const current=++epoch;rows=[];selected=null;details(null);$('#rows').replaceChildren();$('#progress').hidden=true;$('#refresh').hidden=true;$('#status').textContent='Checking access…';
 try {
  const session=await freshSession(), access=await getAnalyticsAccess();
  if(session?.user?.id!==reader||access.userId!==reader||!access.games.includes('poke-idle'))throw new Error('Poké Idle admin permission required.');
  const options={token:session.access_token};let records=[],profiles=[];
  for(let offset=0;;offset+=500){const batch=await request('/rest/v1/poke_idle_admin_snapshots?select=user_id,snapshot,updated_at&order=user_id&limit=500&offset='+offset,options);records.push(...batch);if(batch.length<500)break;}
  for(let i=0;i<records.length;i+=50){const ids=records.slice(i,i+50).map(r=>r.user_id).join(',');profiles.push(...await request('/rest/v1/profiles?select=id,handle&id=in.('+encodeURIComponent(ids)+')',options));}
  if(current!==epoch||getSession()?.user?.id!==reader)return;
  const handles=new Map(profiles.map(p=>[p.id,p.handle]));rows=records.map(r=>({...r,handle:String(handles.get(r.user_id)||'Unnamed player')}));
  render();$('#progress').hidden=false;$('#refresh').hidden=false;$('#status').textContent='Latest reported player progress';
 }catch(error){if(current===epoch)$('#status').textContent=error.message||'Could not load player progress.';}
}
$('#refresh').onclick=()=>void load();
for(const id of ['filter','year','chapter','inactive'])$('#'+id).oninput=render;
window.addEventListener('storage',e=>{if(e.key==='bored.session'){epoch++;rows=[];selected=null;details(null);$('#rows').replaceChildren();$('#progress').hidden=true;$('#refresh').hidden=true;$('#status').textContent='Account changed. Reload to check access.';}});
void load();

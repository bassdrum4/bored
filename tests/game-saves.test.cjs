// Cloud saves (Civ Lite 5.3), server side: public.game_saves and its four functions.
// The same scenarios run on PGlite (production SQL on Postgres WASM) and, when BT_TEST_DATABASE_URL points at a
// disposable server, on native PostgreSQL, where the concurrency check needs real simultaneous sessions. Never
// point it at production: the native run refuses a Supabase host.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pgliteEnv,nativeEnv,url,ids}=require('./together-live-env.cjs');
const [A,B,C,D,E,F,ANON]=ids; // F has a Bored account but never joined Bored Together; ANON is an anonymous session

const header=(over={})=>({v:1,mv:2,at:1000,kind:'manual',name:'Qin Shi Huang · Medieval · Turn 42',meta:'China + 3 CPUs',turn:42,...over});
const put=(env,user,slot,{head=header(),data='gz:AAAA',expected=0,game='ashcrown'}={})=>
  env.asUser(user,'select public.save_put($1,$2,$3::jsonb,$4,$5) r',[game,slot,JSON.stringify(head),data,expected]).then(rows=>rows[0].r);
const list=(env,user,game='ashcrown')=>env.asUser(user,'select public.save_list($1) r',[game]).then(rows=>rows[0].r);
const get=(env,user,slot,game='ashcrown')=>env.asUser(user,'select public.save_get($1,$2) r',[game,slot]).then(rows=>rows[0].r);
const del=(env,user,slot,expected,game='ashcrown')=>env.asUser(user,'select public.save_delete($1,$2,$3) r',[game,slot,expected]).then(rows=>rows[0].r);
const refused=(promise,pattern)=>assert.rejects(promise,pattern);
// A 409 carries the stored copy in its DETAIL.
async function conflict(promise) {
  try { await promise; } catch(e) {
    assert.equal(e.code,'PT409');
    assert.match(e.message,/changed on another device/);
    return JSON.parse(e.detail);
  }
  assert.fail('expected a 409');
}
const SLOTS=['auto','m1','m2','m3','m4','m5','m6','m7','m8'];

async function scenarios(t,env) {
  t.beforeEach(async()=>{
    await env.admin('delete from public.game_saves');
    await env.admin('delete from bored_together.limits');
  });

  await t.test('only a signed-in, non-anonymous account can use saves',async()=>{
    await refused(list(env,ANON),/Sign in to your Bored account/);
    await refused(put(env,ANON,'m1'),/Sign in to your Bored account/);
    await refused(get(env,ANON,'m1'),/Sign in to your Bored account/);
    await refused(del(env,ANON,'m1',0),/Sign in to your Bored account/);
    // The publishable key alone (no account) can not even call them, or read the table.
    await refused(list(env,null),/permission denied/);
    await refused(put(env,null,'m1'),/permission denied/);
    await refused(env.asUser(null,'select * from public.game_saves'),/permission denied/);
    // An anonymous session is refused by the table's own policy as well.
    await put(env,A,'m1');
    assert.equal((await env.asUser(ANON,'select * from public.game_saves')).length,0);
    // Saves are for the account, not for Bored Together: someone who never joined it can save.
    assert.equal((await put(env,F,'m1')).version,1);
    assert.equal((await list(env,F)).length,1);
  });

  await t.test('own rows only: no peeking, no overwriting, no deleting for someone else',async()=>{
    await put(env,A,'m1',{head:header({name:'A save'}),data:'gz:AAAA'});
    await put(env,A,'auto',{head:header({kind:'auto',name:'Autosave · Turn 42'})});
    assert.deepEqual((await list(env,B)),[]);
    await refused(get(env,B,'m1'),/isn.t in your account/);
    // B writes the same slot name: it is B's own row, A's is untouched.
    const mine=await put(env,B,'m1',{head:header({name:'B save'}),data:'gz:BBBB'});
    assert.equal(mine.version,1);
    assert.equal((await get(env,A,'m1')).header.name,'A save');
    assert.equal((await get(env,A,'m1')).data,'gz:AAAA');
    assert.equal((await get(env,B,'m1')).data,'gz:BBBB');
    assert.deepEqual((await list(env,A)).map(s=>s.slot),['auto','m1']);
    assert.deepEqual((await list(env,B)).map(s=>s.slot),['m1']);
    // B can not delete A's, and a delete from B only removes B's own row.
    assert.equal((await del(env,B,'auto',0)).deleted,false);
    assert.equal((await list(env,A)).length,2);
    // The table: select shows own rows only; nothing can be written to it directly.
    assert.deepEqual((await env.asUser(A,'select user_id,slot from public.game_saves order by slot')).map(r=>[r.user_id,r.slot]),[[A,'auto'],[A,'m1']]);
    await refused(env.asUser(A,"insert into public.game_saves(user_id,game,slot,header,data,bytes) values($1,'ashcrown','m2','{}','x',1)",[A]),/permission denied/);
    await refused(env.asUser(A,"update public.game_saves set data='x',bytes=1 where slot='m1'"),/permission denied/);
    await refused(env.asUser(A,"delete from public.game_saves where slot='m1'"),/permission denied/);
    assert.equal((await get(env,A,'m1')).data,'gz:AAAA');
  });

  await t.test('limits: game, slots, nine rows, 2 MB',async()=>{
    await refused(put(env,A,'m1',{game:'chess'}),/Unknown game/);
    await refused(list(env,A,'chess'),/Unknown game/);
    for(const slot of ['t1','t2','t3','m0','m9','M1','',null,'auto ']) await refused(put(env,A,slot),/isn.t a save slot/);
    await refused(get(env,A,'m9'),/isn.t a save slot/);
    // Nine slots fill up and that is all an account can ever hold.
    for(const slot of SLOTS) assert.equal((await put(env,A,slot)).version,1);
    assert.equal((await list(env,A)).length,9);
    await refused(put(env,A,'m10'),/isn.t a save slot/);
    await refused(env.admin("insert into public.game_saves(user_id,game,slot,header,data,bytes) values($1,'ashcrown','m9','{}','x',1)",[A]),/violates check constraint/);
    await refused(env.admin("insert into public.game_saves(user_id,game,slot,header,data,bytes) values($1,'chess','m1','{}','x',1)",[B]),/violates check constraint/);
    // Size: exactly 2 MB is fine, one byte more is refused, and so are empty and malformed saves.
    const MAX=2*1024*1024;
    assert.equal((await put(env,B,'m1',{data:'x'.repeat(MAX)})).bytes,MAX);
    await refused(put(env,B,'m2',{data:'x'.repeat(MAX+1)}),/at most 2 MB/);
    await refused(put(env,B,'m2',{data:''}),/Invalid save/);
    await refused(put(env,B,'m2',{head:[1]}),/Invalid save/);
    await refused(put(env,B,'m2',{head:header({name:'x'.repeat(5000)})}),/Invalid save/);
    await refused(put(env,B,'m2',{expected:-1}),/Invalid request/);
    await refused(env.asUser(B,"select public.save_put('ashcrown','m2','{}','x',null)"),/Invalid request/);
    assert.equal((await list(env,B)).length,1);
    await refused(env.admin("update public.game_saves set bytes=5 where user_id=$1",[B]),/violates check constraint/);
  });

  await t.test('a stale expected_version is refused with the stored header, and nothing changes',async()=>{
    const one=await put(env,A,'m1',{head:header({name:'first',at:1000}),data:'gz:one'});
    assert.equal(one.version,1);
    assert.equal(one.slot,'m1');
    assert.ok(Number.isFinite(one.stamp) && Math.abs(one.stamp-Date.now())<60000,'the stamp is the server clock');
    // Creating a slot that exists, as if it were new.
    let stored=await conflict(put(env,A,'m1',{head:header({name:'other device'}),data:'gz:two',expected:0}));
    assert.equal(stored.version,1);
    assert.equal(stored.header.name,'first');
    assert.equal(stored.stamp,one.stamp);
    assert.equal((await get(env,A,'m1')).data,'gz:one');
    // The right version goes through and bumps it.
    const two=await put(env,A,'m1',{head:header({name:'second',at:2000}),data:'gz:two',expected:1});
    assert.equal(two.version,2);
    assert.equal((await get(env,A,'m1')).header.name,'second');
    // A device still on version 1 is told what is there now.
    stored=await conflict(put(env,A,'m1',{head:header({name:'late'}),data:'gz:late',expected:1}));
    assert.deepEqual([stored.version,stored.header.name,stored.header.at],[2,'second',2000]);
    assert.equal((await get(env,A,'m1')).data,'gz:two');
    // A version from the future is not the stored one either.
    assert.equal((await conflict(put(env,A,'m1',{expected:9}))).version,2);
    // The slot was deleted elsewhere: a device that saw a version is told it is empty (version 0, no header).
    stored=await conflict(put(env,A,'m2',{expected:3}));
    assert.deepEqual([stored.version,stored.header],[0,null]);
    assert.equal((await list(env,A)).length,1);
    // Delete has the same check.
    stored=await conflict(del(env,A,'m1',1));
    assert.deepEqual([stored.version,stored.header.name],[2,'second']);
    assert.equal((await list(env,A)).length,1);
    assert.deepEqual(await del(env,A,'m1',2),{slot:'m1',deleted:true,version:2});
    assert.deepEqual(await del(env,A,'m1',2),{slot:'m1',deleted:false,version:0},'already gone is not an error');
    await refused(get(env,A,'m1'),/isn.t in your account/);
    assert.equal((await put(env,A,'m1')).version,1,'a deleted slot starts again at 1');
  });

  await t.test('save_list gives headers, versions and sizes, never the game',async()=>{
    await put(env,A,'m3',{head:header({name:'three'}),data:'gz:'+'y'.repeat(100)});
    await put(env,A,'auto',{head:header({kind:'auto'}),data:'gz:z'});
    const rows=await list(env,A);
    assert.deepEqual(rows.map(r=>r.slot),['auto','m3']);
    for(const r of rows) assert.deepEqual(Object.keys(r).sort(),['bytes','header','slot','stamp','version']);
    assert.equal(rows[1].bytes,103);
    assert.equal(rows[1].header.name,'three');
    assert.equal(JSON.stringify(rows).includes('yyyy'),false);
    assert.equal((await get(env,A,'m3')).data.length,103);
  });

  await t.test('rate limit: 60 calls a minute, 20 writes a minute, per account',async()=>{
    for(let i=0;i<60;i++) await list(env,E);
    await refused(list(env,E),/Too many requests/);
    await refused(put(env,E,'m1'),/Too many requests/);
    assert.equal((await list(env,D)).length,0,'another account is not affected');
    await env.admin('delete from bored_together.limits');
    for(let i=0;i<20;i++) await put(env,E,'m1',{expected:i,data:'gz:'+i});
    await refused(put(env,E,'m1',{expected:20}),/Too many requests/);
    await refused(del(env,E,'m1',20),/Too many requests/);
    assert.equal((await get(env,E,'m1')).header.turn,42,'reads still go through under the write limit');
    assert.equal((await get(env,E,'m1')).data,'gz:19');
  });
}

async function concurrency(t,env) {
  await env.admin('delete from public.game_saves');
  await env.admin('delete from bored_together.limits');
  // Ten devices create the same slot in the same instant: one wins, nine are told what is stored.
  const results=await Promise.allSettled(Array.from({length:10},(_,i)=>put(env,A,'m1',{head:header({name:'device '+i}),data:'gz:'+i})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const lost=results.filter(r=>r.status==='rejected');
  assert.equal(lost.length,9);
  for(const r of lost) { assert.equal(r.reason.code,'PT409'); assert.equal(JSON.parse(r.reason.detail).version,1); }
  // And ten devices holding version 1 overwrite it: again exactly one.
  const next=await Promise.allSettled(Array.from({length:10},(_,i)=>put(env,A,'m1',{head:header({name:'next '+i}),data:'gz:n'+i,expected:1})));
  assert.equal(next.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await get(env,A,'m1')).version,2);
}

test('cloud saves on PGlite',async t=>{
  let env;
  try { env=await pgliteEnv(); } catch(e) { t.skip('PGlite is not installed here: '+e.message); return; }
  t.after(()=>env.close());
  await scenarios(t,env);
});

test('cloud saves on native PostgreSQL',{skip:!url},async t=>{
  const env=await nativeEnv();
  t.after(()=>env.close());
  await scenarios(t,env);
  await t.test('concurrent first saves and overwrites: exactly one wins',()=>concurrency(t,env));
});

test('the 5.3 migration only adds: one table, one schema, four public functions, nothing existing touched',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109210000_civ_lite_cloud_saves.sql'),'utf8');
  assert.ok(!/\b(drop|truncate)\s+(table|schema|function)/i.test(sql),'no drops');
  assert.deepEqual([...sql.matchAll(/alter\s+table\s+([\w.]+)/gi)].map(m=>m[1]),['public.game_saves'],'only the new table is altered');
  assert.deepEqual([...sql.matchAll(/create or replace function (public\.[\w]+)/gi)].map(m=>m[1]).sort(),['public.save_delete','public.save_get','public.save_list','public.save_put']);
  assert.match(sql,/create table if not exists public\.game_saves/);
  // Every function is for signed-in accounts only: security definer, an empty search_path, nothing for anon.
  const functions=sql.split(/create or replace function /i).slice(1);
  assert.equal(functions.length,8);
  for(const f of functions) assert.match(f,/set search_path = ''/);
  for(const name of ['save_list(text)','save_get(text, text)','save_put(text, text, jsonb, text, integer)','save_delete(text, text, integer)']) {
    assert.ok(sql.includes('revoke all on function public.'+name+' from public, anon;'),name+' is revoked from anon');
    assert.ok(sql.includes('grant execute on function public.'+name+' to authenticated;'),name+' is granted to signed-in accounts');
  }
  assert.ok(!/grant[^;]*\banon\b/i.test(sql.replace(/revoke[^;]*;/gi,'')),'nothing is granted to anon');
  assert.ok(!/grant (insert|update|delete)/i.test(sql),'the table has no direct write grants');
  const names=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).sort();
  assert.ok(names.indexOf('20261109210000_civ_lite_cloud_saves.sql')>names.indexOf('20261109190000_together_live_checks.sql'),'it runs after the Bored Together migrations it relies on');
});

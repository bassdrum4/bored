// Dedicated ephemeral Postgres ONLY. CI provisions a fresh postgres:17 service.
// Never point BT_TEST_DATABASE_URL at an existing or production database.
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const {ids,consent}=require('./together-db.cjs');
const url=process.env.BT_TEST_DATABASE_URL;

test('native PostgreSQL: competing moves, queues, crossed requests and leave races', {skip:!url},async t=>{
  const admin=new Client({connectionString:url});await admin.connect();
  t.after(()=>admin.end());
  // Fail closed rather than applying fixture DDL to an occupied database.
  const count=await admin.query("select count(*)::int n from information_schema.tables where table_schema in ('public','auth','bored_together')");
  assert.equal(count.rows[0].n,0,'requires an EMPTY disposable database');
  await admin.query(`create role anon;create role authenticated;create schema auth;
    grant usage on schema auth to anon,authenticated;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profiles(id uuid primary key references auth.users(id),handle text);`);
  await admin.query(fs.readFileSync(path.join(__dirname,'../scripts/bored-together.sql'),'utf8'));
  for(let i=0;i<ids.length;i++){
    await admin.query('insert into auth.users(id,email) values($1,$2)',[ids[i],`native${i}@example.test`]);
    await admin.query('insert into public.profiles values($1,$2)',[ids[i],`Native${i}`]);
  }
  async function rpc(user,action,args={}) {
    const client=new Client({connectionString:url});await client.connect();
    try{
      await client.query('begin');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
      await client.query('set local role authenticated');
      const r=await client.query('select public.bt_rpc($1,$2::jsonb) result',[action,JSON.stringify(args)]);
      await client.query('commit');return r.rows[0].result;
    }catch(e){await client.query('rollback');throw e;}finally{await client.end();}
  }
  const [a,b,c,d]=ids;
  for(const id of ids)await rpc(id,'enroll',consent);
  const pending=await rpc(a,'challenge',{user_id:b});
  const active=await rpc(b,'accept',{match_id:pending.id});
  const moves=await Promise.allSettled([0,1].map(column=>rpc(a,'move',{match_id:active.id,version:active.version,column,request_id:randomUUID()})));
  assert.equal(moves.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await admin.query('select count(*)::int n from bored_together.moves')).rows[0].n,1);
  const queue=await Promise.all([rpc(c,'queue_join'),rpc(d,'queue_join'),rpc(c,'queue_join'),rpc(d,'queue_join')]);
  assert.ok(queue.some(x=>x.id));
  assert.equal((await admin.query("select count(*)::int n from bored_together.matches where source='random'")).rows[0].n,1);
  const requests=await Promise.allSettled([rpc(a,'friend_request',{user_id:c}),rpc(c,'friend_request',{user_id:a})]);
  assert.equal(requests.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await admin.query('select count(*)::int n from bored_together.friendships')).rows[0].n,1);
  // Whichever transaction obtains the lock first, leave cannot leave an active
  // match or queue entry referring to a departed player.
  await Promise.allSettled([rpc(c,'leave'),rpc(c,'queue_join'),rpc(a,'challenge',{user_id:c})]);
  assert.equal((await admin.query("select count(*)::int n from bored_together.matches where $1 in(p1,p2) and status in('pending','active')",[c])).rows[0].n,0);
  assert.equal((await admin.query('select count(*)::int n from bored_together.queue where user_id=$1',[c])).rows[0].n,0);
  const f=await admin.query("select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='bored_together' and proname='api'");
  assert.match(f.rows[0].prosrc,/pg_advisory_xact_lock/);
});

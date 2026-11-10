// A disposable database for the live-game tests: PGlite (production SQL on Postgres WASM) or, when
// BT_TEST_DATABASE_URL points at a disposable server, native PostgreSQL in a temporary database of its own.
// Never point it at production: the native one refuses a Supabase host.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {database,as,ids,enroll,consent}=require('./together-db.cjs');
const url=process.env.BT_TEST_DATABASE_URL;
const [A,B,C,D,E,F,ANON]=ids;

async function pgliteEnv() {
  const db=await database();
  for(const u of [A,B,C,D,E]) await enroll(db,u);
  return {
    name:'PGlite',
    rpc:(user,action,args={})=>as(db,user,async()=>(await db.query('select public.bt_live_rpc($1,$2::jsonb) result',[action,JSON.stringify(args)])).rows[0].result),
    admin:async(sql,params)=>(await db.query(sql,params)).rows,
    asUser:(user,sql,params)=>as(db,user,async()=>(await db.query(sql,params)).rows),
    close:async()=>{}
  };
}

async function nativeEnv() {
  const {Client}=require('pg');
  assert.ok(!/supabase\.co/i.test(url),'BT_TEST_DATABASE_URL must be a disposable database, never Supabase');
  const name='bt_live_'+randomUUID().replace(/-/g,'').slice(0,12);
  const server=new Client({connectionString:url});await server.connect();
  await server.query(`create database ${name}`);
  const u=new URL(url);u.pathname='/'+name;
  const own=u.toString();
  const connect=async()=>{const c=new Client({connectionString:own});await c.connect();return c;};
  const admin=await connect();
  await admin.query(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema auth; grant usage on schema auth to anon,authenticated;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profiles(id uuid primary key references auth.users(id),handle text);`);
  await admin.query(fs.readFileSync(path.join(__dirname,'../scripts/bored-together.sql'),'utf8'));
  for(const file of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(f=>f.endsWith('.sql') && !f.includes('engagement_and_retention_analytics') && !f.includes('bored_analytics_funnels_rollups')).sort()) await admin.query(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  const handles=['WackyPenguin','BananaWizard','QuietOwl','NeverJoined','FourthPlayer','FifthPlayer','Anonymous'];
  for(let i=0;i<ids.length;i++) {
    await admin.query('insert into auth.users(id,email,is_anonymous) values($1,$2,$3)',[ids[i],`live${i}@example.test`,i===6]);
    await admin.query('insert into public.profiles values($1,$2)',[ids[i],handles[i]]);
  }
  // One short-lived session per call, like PostgREST: the role and the user are set for that transaction only.
  async function session(user,fn) {
    const c=await connect();
    try {
      await c.query('begin');
      await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);
      await c.query('set local role '+(user?'authenticated':'anon'));
      const out=await fn(c);
      await c.query('commit');return out;
    } catch(e) {
      try {await c.query('rollback');} catch(x) {}
      throw e;
    } finally {await c.end();}
  }
  const env={
    name:'native PostgreSQL',native:true,
    rpc:(user,action,args={})=>session(user,async c=>(await c.query('select public.bt_live_rpc($1,$2::jsonb) result',[action,JSON.stringify(args)])).rows[0].result),
    admin:async(sql,params)=>(await admin.query(sql,params)).rows,
    asUser:(user,sql,params)=>session(user,async c=>(await c.query(sql,params)).rows),
    close:async()=>{await admin.end();await server.query(`drop database ${name} with (force)`);await server.end();}
  };
  for(const u of [A,B,C,D,E]) await session(u,c=>c.query('select public.bt_rpc($1,$2::jsonb)',['enroll',JSON.stringify(consent)]));
  return env;
}

module.exports={pgliteEnv,nativeEnv,url,ids};

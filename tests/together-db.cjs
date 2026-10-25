const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const consent = { consent_version:'2026-10-25-v2' };
const ids = Array.from({length:7},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`);

// Production SQL, real PostgreSQL WASM execution, isolated auth fixtures. Nothing
// in this suite contacts production or inserts demo accounts into Supabase.
async function database() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to anon,authenticated;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.profiles(id uuid primary key references auth.users(id),handle text);`);
  await db.exec(fs.readFileSync(path.join(root,'scripts/bored-together.sql'),'utf8'));
  for (const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  const handles = ['WackyPenguin','BananaWizard','QuietOwl','NeverJoined','FourthPlayer','FifthPlayer','Anonymous'];
  for(let i=0;i<ids.length;i++) {
    await db.query('insert into auth.users values($1,$2,$3)',[ids[i],`student${i+1}@example.test`,i===6]);
    await db.query('insert into public.profiles values($1,$2)',[ids[i],handles[i]]);
  }
  return db;
}
async function as(db,user,fn) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  await db.exec('set role '+(user?'authenticated':'anon'));
  try {return await fn();} finally {await db.exec('reset role');}
}
async function call(db,user,action,args={}) {
  return as(db,user,async()=> (await db.query('select public.bt_rpc($1,$2::jsonb) result',[action,JSON.stringify(args)])).rows[0].result);
}
const enroll=(db,u)=>call(db,u,'enroll',consent);
const dashboard=(db,u)=>call(db,u,'dashboard');
async function challenge(db,a,b) {
  const m=await call(db,a,'challenge',{user_id:b});
  return call(db,b,'accept',{match_id:m.id});
}
async function move(db,m,u,column,extra={}) {
  return call(db,u,'move',{match_id:m.id,version:m.version,column,request_id:randomUUID(),...extra});
}

async function serviceCommit(db,shot){
 await db.exec('reset role;set role service_role');
 try{return(await db.query('select public.bt_pool_commit($1::jsonb) result',[JSON.stringify(shot)])).rows[0].result;}finally{await db.exec('reset role');}
}
async function poolHandler(db,enqueue=fn=>fn()){
 const {createPoolHandler}=await import('../supabase/functions/together-pool/handler.js');
 return createPoolHandler({authorize:async auth=>{const id=auth.replace('Bearer ','');return ids.includes(id)?{id,is_anonymous:id===ids[6]}:null;},readMatch:(auth,id)=>enqueue(()=>call(db,auth.replace('Bearer ',''),'match',{match_id:id})),commitShot:shot=>enqueue(()=>serviceCommit(db,shot))});
}
module.exports={database,call,as,ids,consent,enroll,dashboard,challenge,move,serviceCommit,poolHandler};

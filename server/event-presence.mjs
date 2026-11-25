import { createHash } from 'node:crypto';
import { UUID } from './core.mjs';

// One event protocol; both HTTP transports share the same roster and snapshots.
export function createEventPresence({roster,verify,changed,hideAccount,reply,readBody,origins,clientSource,maxClients=1000,maxIp=800,waitMs=25000,ttlMs=90000,keepaliveMs=25000,authMs=18*60000,streamMs=12*60000}) {
  const sessions=new Map(), auth=new Map(), pending=new Map();
  let generation=0, closed=false;
  const tokenKey=t=>createHash('sha256').update(t).digest('hex');
  async function profile(token){
    const key=tokenKey(token),now=Date.now(),cached=auth.get(key);
    if(cached?.until>now)return cached.value;
    if(pending.has(key))return pending.get(key);
    const gen=generation;
    const task=(async()=>{
      const value=await verify(token);
      if(gen!==generation)throw Error('Identity changed');
      const exp=Number(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).exp)*1000;
      if(!Number.isFinite(exp)||exp<=Date.now())throw Error('Expired token');
      if(auth.size>=2048)auth.delete(auth.keys().next().value);
      const verified={...value,expires:exp};
      auth.set(key,{value:verified,until:Math.min(exp,Date.now()+authMs)});
      return verified;
    })();
    pending.set(key,task);
    try{return await task;}finally{pending.delete(key);}
  }
  function snapshot(s){
    const value={t:'ok',...roster.counts()};
    if(!s.identity.guest&&s.watch)value.n=roster.names();
    const cursor=tokenKey(JSON.stringify(value)).slice(0,24);
    return {...value,cursor};
  }
  function detach(s,frame){
    const c=s.connection;if(!c)return;
    s.connection=null;clearTimeout(c.timer);
    if(c.mode==='sse'){
      if(frame&&!c.res.destroyed)c.res.write('data: '+JSON.stringify(frame)+'\n\n');
      c.res.end();
    }else reply(c.res,200,frame||{t:'idle',cursor:c.cursor},c.origin);
  }
  function remove(s,frame){
    if(sessions.get(s.id)!==s)return;
    sessions.delete(s.id);detach(s,frame);
    if(roster.remove(s))changed();
  }
  function evict(id){
    generation++;
    for(const [key,entry] of auth)if(entry.value.id===id)auth.delete(key);
    for(const s of sessions.values())if(!s.identity.guest&&s.identity.id===id)remove(s,{t:'off'});
  }
  function flush(){
    let countsFrame,namedFrame;
    for(const s of sessions.values()){
      const c=s.connection;if(!c)continue;
      const frame=s.watch?(namedFrame??=snapshot(s)):(countsFrame??=snapshot(s));
      if(frame.cursor===c.cursor)continue;
      c.cursor=frame.cursor;
      if(c.mode==='poll')detach(s,frame);
      else if(c.res.writableLength>65536){c.res.destroy();} 
      else c.res.write('data: '+JSON.stringify(frame)+'\n\n');
    }
  }
  async function handle(req,res){
    const origin=req.headers.origin;
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'access-control-allow-origin':origins.has(origin)?origin:'null','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','vary':'Origin'});res.end();return;
    }
    if(closed||!origins.has(origin)){reply(res,403,{t:'err'},origin);return;}
    let m;
    try{m=JSON.parse(await readBody(req));}catch{reply(res,400,{t:'err'},origin);return;}
    if(!UUID.test(m?.sid||'')||!['sse','poll','leave','hide'].includes(m.mode)){reply(res,400,{t:'err'},origin);return;}
    let identity;
    if(m.t==='guest'&&UUID.test(m.id||''))identity={guest:true,id:m.id};
    else if(m.t==='auth'&&typeof m.jwt==='string'&&m.jwt.length<=7000&&m.jwt.split('.').length===3){
      let p;try{p=await profile(m.jwt);}catch{reply(res,401,{t:'err'},origin);return;}
      if(m.mode==='hide'){hideAccount(p.id);reply(res,200,{t:'off'},origin);return;}
      if(!p.visible){hideAccount(p.id);reply(res,200,{t:'off'},origin);return;}
      if(!p.handle){reply(res,401,{t:'err'},origin);return;}
      identity={guest:false,id:p.id,name:p.handle,expires:p.expires};
    }else{reply(res,400,{t:'err'},origin);return;}
    if(res.destroyed)return;
    let s=sessions.get(m.sid);
    if(s&&(s.identity.id!==identity.id||s.identity.guest!==identity.guest)){reply(res,403,{t:'err'},origin);return;}
    if(m.mode==='leave'||m.mode==='hide'){
      if(s)remove(s);
      reply(res,200,{t:'ok'},origin);return;
    }
    if(!s){
      const ip=clientSource(req);
      if(sessions.size>=maxClients||roster.counts().g+roster.counts().a>=maxClients||[...sessions.values()].filter(x=>x.ip===ip).length>=maxIp){reply(res,429,{t:'err'},origin);return;}
      s={id:m.sid,identity,ip,watch:false,at:Date.now(),connection:null};sessions.set(s.id,s);
    }
    detach(s);s.identity=identity;s.watch=m.watch===true&&!identity.guest;s.at=Date.now();
    roster.add(s,identity);changed();
    const frame=snapshot(s);
    const cursor=typeof m.cursor==='string'?m.cursor:'';
    if(m.mode==='poll'&&cursor!==frame.cursor){reply(res,200,frame,origin);return;}
    const c={mode:m.mode,res,origin,cursor:m.mode==='sse'?frame.cursor:cursor,timer:null,created:Date.now(),last:Date.now()};
    s.connection=c;
    res.on('close',()=>{if(s.connection===c){s.connection=null;clearTimeout(c.timer);s.at=Date.now();}});
    if(c.mode==='sse'){
      res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','x-accel-buffering':'no','access-control-allow-origin':origin,'vary':'Origin'});
      res.flushHeaders();res.write('data: '+JSON.stringify(frame)+'\n\n');
      c.timer=setTimeout(()=>detach(s,{t:'renew'}),Math.max(1,Math.min(streamMs,(identity.expires||Infinity)-Date.now()-5000)));c.timer.unref?.();
    }else{
      c.timer=setTimeout(()=>detach(s),waitMs);c.timer.unref?.();
    }
  }
  const sweep=setInterval(()=>{
    const now=Date.now();
    for(const s of sessions.values()){
      const c=s.connection;
      if(c?.mode==='sse'){
        if(c.res.writableLength>65536){c.res.destroy();continue;}
        if(now-c.last>=keepaliveMs){c.res.write(': keepalive\n\n');c.last=now;}
        s.at=now;
      }else if(now-s.at>ttlMs||(!s.identity.guest&&s.identity.expires<=now))remove(s);
    }
    for(const [key,value] of auth)if(value.until<=now)auth.delete(key);
  },Math.min(5000,keepaliveMs));sweep.unref?.();
  return {handle,flush,evict,close(){closed=true;clearInterval(sweep);for(const s of sessions.values())remove(s);auth.clear();}};
}

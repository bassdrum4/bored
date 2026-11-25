import {randomUUID,createHash} from 'node:crypto';
import {UUID} from './core.mjs';
const DAY=86400000, LIMIT=200, BATCH=50;
export function cleanMessage(raw){
  if(typeof raw!=='string')return '';
  const s=raw.normalize('NFKC').replace(/[\p{Cf}\p{Cc}]/gu,' ').trim().replace(/\s+/g,' ');
  if(!s||[...s].length>300)return '';
  // School chat: disallow common contact information, links and explicit profanity.
  if(/https?:|www\.|(?:[\w.+-]+@[\w.-]+\.[a-z]{2,})|(?:\d[\s().+-]*){7,}|(?:discord\.gg|(?:snap|insta)gram)|\b(?:fuck\w*|shit\w*|bitch\w*|cunt\w*|motherfuck\w*)\b/i.test(s))return '';
  return s;
}
export async function moderate(text,{key=process.env.OPENAI_API_KEY,fetcher=fetch}={}){
  if(!key)throw Error('Moderation unavailable');
  const r=await fetcher('https://api.openai.com/v1/moderations',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:'omni-moderation-latest',input:text}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('Moderation unavailable');
  const result=(await r.json())?.results?.[0];
  if(typeof result?.flagged!=='boolean')throw Error('Moderation unavailable');
  return !result.flagged;
}
export function createChat({verify,isAdmin,store,configured,moderateText=moderate,reply,readBody,origins,source,waitMs=25000,keepaliveMs=25000}){
  const messages=[],events=[],peers=new Set(),auth=new Map(),rates=new Map(),ipRates=new Map(),inflight=new Set();
  const epoch=randomUUID();let seq=0,state=null,stateAt=0,loading=null,flushTimer=null,closed=false;
  const hash=t=>createHash('sha256').update(t).digest('hex');
  function rate(map,key,max,window){
    const now=Date.now(),old=map.get(key);
    if(old&&now-old.at<window){if(old.n>=max)return false;old.n++;return true;}
    if(map.size>=4000)map.delete(map.keys().next().value);
    map.set(key,{at:now,n:1});return true;
  }
  async function control(force=false){
    if(!configured)return {enabled:false,bans:{}};
    if(!force&&state&&Date.now()-stateAt<60000)return state;
    if(loading)return loading;
    loading=(async()=>{const s=await store('state',{});if(typeof s?.enabled!=='boolean'||!s.bans)throw Error('Invalid state');state=s;stateAt=Date.now();return s;})();
    try{return await loading;}finally{loading=null;}
  }
  async function account(jwt){
    if(typeof jwt!=='string'||jwt.length>7000||jwt.split('.').length!==3)throw Error('Sign in');
    const key=hash(jwt),cached=auth.get(key),now=Date.now();
    if(cached?.until>now)return cached.value;
    const p=await verify(jwt);
    const exp=Number(JSON.parse(Buffer.from(jwt.split('.')[1],'base64url')).exp)*1000;
    if(!p?.id||!p.handle||!Number.isFinite(exp)||exp<=now)throw Error('Sign in');
    const value={id:p.id,handle:p.handle};
    if(auth.size>=2048)auth.delete(auth.keys().next().value);
    auth.set(key,{value,until:Math.min(exp,now+300000)});return value;
  }
  const publicMessage=m=>({id:m.id,author:hash(m.author).slice(0,24),handle:m.handle,text:m.text,at:m.at,reply:m.reply});
  function prune(){
    const now=Date.now();
    while(messages.length&&(messages.length>LIMIT||messages[0].at<now-DAY))messages.shift();
    while(events.length>LIMIT*2)events.shift();
  }
  function frame(cursor){
    prune();
    const [e,n]=typeof cursor==='string'?cursor.split(':'):[],after=Number(n);
    const reset=e!==epoch||!Number.isSafeInteger(after)||after>seq||after<(events[0]?.seq??seq+1)-1;
    if(reset)return {t:'chat',reset:true,cursor:epoch+':'+seq,messages:messages.slice(-BATCH).map(publicMessage),enabled:state?.enabled===true};
    const next=events.filter(x=>x.seq>after);
    if(next.length>BATCH)return {t:'chat',reset:true,cursor:epoch+':'+seq,messages:messages.slice(-BATCH).map(publicMessage),enabled:state?.enabled===true};
    return {t:'chat',cursor:epoch+':'+seq,events:next,enabled:state?.enabled===true};
  }
  function end(p,body){
    if(!peers.delete(p))return;
    clearTimeout(p.timer);
    if(p.mode==='sse'){if(body&&!p.res.destroyed)p.res.write('data: '+JSON.stringify(body)+'\n\n');p.res.end();}
    else if(!p.res.destroyed)reply(p.res,200,body||{t:'idle',cursor:p.cursor},p.origin);
  }
  function flush(){
    flushTimer=null;
    for(const p of peers){
      if(p.res.destroyed||p.res.writableLength>65536){end(p);continue;}
      const f=frame(p.cursor);
      if(f.cursor===p.cursor)continue;
      p.cursor=f.cursor;
      if(p.mode==='poll')end(p,f);else p.res.write('data: '+JSON.stringify(f)+'\n\n');
    }
  }
  function publish(type,value){
    events.push({seq:++seq,type,...value});prune();
    if(!flushTimer){flushTimer=setTimeout(flush,250);flushTimer.unref?.();}
  }
  function blocked(id,s){return Date.parse(s.bans[id]||'')>Date.now();}
  async function handle(req,res){
    const origin=req.headers.origin,ip=source(req);
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'access-control-allow-origin':origins.has(origin)?origin:'null','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','vary':'Origin'});res.end();return;
    }
    const out=(code,data)=>reply(res,code,data,origin);
    if(closed||!origins.has(origin))return out(403,{error:'Forbidden'});
    if(!rate(ipRates,ip,1500,60000))return out(429,{error:'Too many requests'});
    let m;try{m=JSON.parse(await readBody(req));}catch{return out(400,{error:'Invalid request'});}
    const mode=m?.mode;
    if(!configured)return out(503,{error:'Chat is not configured yet.'});
    let s;try{s=await control();}catch{return out(503,{error:'Chat is unavailable.'});}
    if(mode==='status'){
      let admin=false;
      if(m.jwt)try{await account(m.jwt);admin=await isAdmin(m.jwt);}catch{}
      return out(200,{enabled:s.enabled,admin});
    }
    if(mode==='admin'){
      let a;try{a=await account(m.jwt);if(!await isAdmin(m.jwt))throw Error();}catch{return out(403,{error:'Forbidden'});}
      if(!rate(rates,'admin:'+a.id,30,60000))return out(429,{error:'Slow down'});
      try{
        if(m.action==='reports')return out(200,{reports:await store('reports',{})});
        if(m.action==='enable'&&typeof m.enabled==='boolean'){await store('enable',{enabled:m.enabled});state=null;await control(true);if(!state.enabled){messages.length=0;events.length=0;}publish('state',{});}
        else if(m.action==='delete'&&UUID.test(m.id||'')){const i=messages.findIndex(x=>x.id===m.id);if(i>=0){messages.splice(i,1);publish('delete',{id:m.id});}}
        else if(['ban','unban'].includes(m.action)){
          const target=messages.find(x=>x.id===m.id)?.author||m.user;
          if(!UUID.test(target||''))return out(400,{error:'Unknown user'});
          await store(m.action,{user:target,seconds:m.seconds===86400?86400:600});state=null;await control(true);
          if(m.action==='ban')for(let i=messages.length-1;i>=0;i--)if(messages[i].author===target){const id=messages[i].id;messages.splice(i,1);publish('delete',{id});}
        }else return out(400,{error:'Invalid action'});
        return out(200,{ok:true});
      }catch{return out(503,{error:'Moderation storage unavailable'});}
    }
    if(!s.enabled)return out(403,{error:'Chat is disabled.'});
    if(mode==='send'||mode==='report'){
      let a;try{a=await account(m.jwt);}catch{return out(401,{error:'Sign in to participate.'});}
      if(!rate(rates,mode+':'+a.id,mode==='send'?5:3,10000))return out(429,{error:'Slow down.'});
      if(mode==='report'){
        const msg=messages.find(x=>x.id===m.id);
        if(!msg)return out(404,{error:'Message is no longer available.'});
        try{await store('report',{id:msg.id,reporter:a.id,author:msg.author,handle:msg.handle,text:msg.text});return out(200,{ok:true});}catch{return out(503,{error:'Report could not be saved.'});}
      }
      if(blocked(a.id,s))return out(403,{error:'You are muted in chat.'});
      const text=cleanMessage(m.text),handle=cleanMessage(a.handle);
      if(!text||!handle)return out(400,{error:'Message or display name is not allowed. No links or personal contact details.'});
      if(inflight.has(a.id)||inflight.size>=12)return out(429,{error:'Chat is busy. Try again.'});
      inflight.add(a.id);
      try{
        if(!await moderateText(handle+': '+text))return out(422,{error:'Message did not pass moderation.'});
        const current=await control();
        if(!current.enabled||blocked(a.id,current))return out(403,{error:'Chat is unavailable.'});
        const parent=messages.find(x=>x.id===m.reply);
        const msg={id:randomUUID(),author:a.id,handle:a.handle,text,at:Date.now(),reply:parent?{id:parent.id,handle:parent.handle}:null};
        messages.push(msg);publish('message',{message:publicMessage(msg)});return out(200,{ok:true,id:msg.id});
      }catch{return out(503,{error:'Moderation unavailable. Message not sent.'});}finally{inflight.delete(a.id);}
    }
    if(!['sse','poll'].includes(mode))return out(400,{error:'Invalid mode'});
    if(peers.size>=300||[...peers].filter(p=>p.ip===ip).length>=250)return out(429,{error:'Chat is busy.'});
    if(res.destroyed)return;
    const f=frame(m.cursor);
    if(mode==='poll'&&(f.reset||f.events?.length))return out(200,f);
    const p={mode,res,origin,ip,cursor:f.cursor,timer:null};peers.add(p);
    res.on('close',()=>{peers.delete(p);clearTimeout(p.timer);});
    if(mode==='sse'){
      res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','x-accel-buffering':'no','access-control-allow-origin':origin,'vary':'Origin'});res.flushHeaders();res.write('data: '+JSON.stringify(f)+'\n\n');
      p.timer=setTimeout(()=>end(p,{t:'renew'}),12*60000);
    }else p.timer=setTimeout(()=>end(p),waitMs);
    p.timer.unref?.();
  }
  const sweep=setInterval(async()=>{
    if(!peers.size)return;
    try{const before=state?.enabled;await control();if(before!==state.enabled){if(!state.enabled){messages.length=0;events.length=0;}publish('state',{});}}
    catch{for(const p of peers)end(p,{t:'unavailable'});return;}
    for(const p of peers)if(p.mode==='sse'){if(p.res.writableLength>65536)end(p);else p.res.write(': keepalive\n\n');}
    prune();
  },keepaliveMs);sweep.unref?.();
  return {handle,close(){closed=true;clearInterval(sweep);clearTimeout(flushTimer);for(const p of peers)end(p);}};
}

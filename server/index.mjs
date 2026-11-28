import http from 'node:http';
import { createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoster, UUID } from './core.mjs';
import { createEventPresence } from './event-presence.mjs';
import { createChat, createChatStore } from './chat.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://djdpttltfmwkofdrvkem.supabase.co';
const API_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ayx7pzjm55vlzQ4u8se9KA_O97WK-QZ';
const ORIGINS = new Set((process.env.ALLOWED_ORIGINS || 'https://bassdrum4.github.io').split(','));
const MAX_CLIENTS = 1000, MAX_BUFFER = 65536;
// A school or office is one public address, so a whole class shares a bucket.
// The cap still stops a single source from taking the entire roster.
const MAX_IP = 800;
const AUTH_MS = 20*60*1000, AUTH_CACHE_MS = 60*1000;
// A network that refuses the WebSocket upgrade falls back to HTTPS polling every
// 45 seconds. An entry stays live for 150 so a throttled background timer and one
// missed poll do not drop a live tab off the count.
const POLL_TTL = 150000;
const roster = createRoster(), peers = new Map(), ipCounts = new Map(), pollers = new Map();
const authCache = new Map(), pending = new Map();
let authBudget = 24, budgetAt = Date.now(), flushTimer = null, authEpoch = 0;
let lastCount = '', lastNames = '', shuttingDown = false;

function send(ws, value) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFER) { ws.terminate(); return; }
  try { ws.send(typeof value === 'string' ? value : JSON.stringify(value)); } catch { ws.terminate(); }
}
function countFrame() { return JSON.stringify({t:'c',...roster.counts()}); }
function namesFrame() { return JSON.stringify({t:'n',n:roster.names()}); }
function clientSource(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  // Render's proxy is shared; use its client IP header if present. Never log it.
  return String(req.headers['x-forwarded-for']||ip).split(',').at(-1).trim();
}
function reply(res,code,value,origin) {
  res.writeHead(code,{
    'content-type':'application/json','cache-control':'no-store',
    'access-control-allow-origin':ORIGINS.has(origin)?origin:'null','vary':'Origin'
  });
  res.end(JSON.stringify(value));
}
function readBody(req) {
  return new Promise((resolve,reject)=>{
    let body = '', tooLarge = false;
    req.setEncoding('utf8');
    // Drain an oversized body instead of destroying the socket, so the client
    // gets a readable 413 rather than a network error.
    req.on('data',chunk=>{ if(tooLarge)return; body += chunk; if(body.length > 4096){ tooLarge = true; body = ''; } });
    req.on('end',()=>tooLarge?reject(Error('Too large')):resolve(body));
    req.on('error',reject);
  });
}
function pollCount(source) {
  let n = 0;
  for(const entry of pollers.values()) if(entry.ip === source) n++;
  return n;
}
function changed() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const count = countFrame(), countChanged = count !== lastCount;
    const names = namesFrame(), namesChanged = names !== lastNames;
    lastCount = count; lastNames = names;
    events.flush();
    for (const [ws,state] of peers) {
      const who = roster.identity(ws);
      if (!who) continue;
      if (countChanged) send(ws,count);
      if (namesChanged && state.watch && !who.guest) send(ws,names);
    }
  },5000);
}
function evict(id) {
  events.evict(id);
  const poller = 'a:'+id;
  if (pollers.delete(poller)) roster.remove(poller);
  for (const ws of roster.accountClients(id)) {
    if (!peers.has(ws)) continue;
    roster.remove(ws); send(ws,{t:'off'}); ws.close(4003,'Presence disabled');
  }
  changed();
}
async function verify(token) {
  const key = createHash('sha256').update(token).digest('hex'), now = Date.now();
  const cached = authCache.get(key);
  if (cached?.until > now) return cached.value;
  if (pending.has(key)) return pending.get(key);
  authBudget = Math.min(24, authBudget + (now-budgetAt)/1000*8); budgetAt = now;
  if (authBudget < 1 || pending.size >= 16) throw Error('Busy');
  authBudget--;
  const startedEpoch = authEpoch;
  const task = (async () => {
    const res = await fetch(SUPABASE_URL+'/rest/v1/rpc/bored_presence_account',{
      method:'POST',headers:{apikey:API_KEY,authorization:'Bearer '+token,'content-type':'application/json'},
      body:'{"action":"get"}',signal:AbortSignal.timeout(8000)
    });
    if (!res.ok || startedEpoch !== authEpoch) throw Error('Account verification failed');
    const value = await res.json();
    if (!UUID.test(value?.id || '') || typeof value.visible !== 'boolean') throw Error('Invalid identity');
    const clean = {id:value.id,visible:value.visible,handle:typeof value.handle==='string'?value.handle.slice(0,160):''};
    if (authCache.size >= 2048) authCache.delete(authCache.keys().next().value);
    authCache.set(key,{value:clean,until:Date.now()+AUTH_CACHE_MS});
    return clean;
  })();
  pending.set(key,task);
  try { return await task; } finally { pending.delete(key); }
}
// The HTTPS twin of a socket join, for networks that block WebSocket upgrades.
// Same origin allowlist, same verified identity, same roster and counts.
async function presence(req,res) {
  const origin = req.headers.origin;
  if (req.method==='OPTIONS') {
    res.writeHead(204,{
      'access-control-allow-origin':ORIGINS.has(origin)?origin:'null',
      'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type',
      'access-control-max-age':'86400','vary':'Origin'
    });
    res.end(); return;
  }
  if (!ORIGINS.has(origin)) { reply(res,403,{error:'Forbidden'},origin); return; }
  let raw;
  try { raw = await readBody(req); } catch { reply(res,413,{error:'Too large'},origin); return; }
  let m;
  try { m = JSON.parse(raw); } catch { reply(res,400,{error:'Bad request'},origin); return; }
  let identity = null;
  if (m?.t==='guest' && UUID.test(m.id||'')) identity = {guest:true,id:m.id};
  else if (m?.t==='auth' && typeof m.jwt==='string' && m.jwt.length<=7000 && m.jwt.split('.').length===3) {
    let profile;
    try { profile = await verify(m.jwt); } catch { reply(res,401,{t:'err'},origin); return; }
    if (!profile.visible) {
      const key = 'a:'+profile.id;
      if (pollers.delete(key) && roster.remove(key)) changed();
      reply(res,200,{t:'off'},origin); return;
    }
    if (!profile.handle) { reply(res,401,{t:'err'},origin); return; }
    identity = {guest:false,id:profile.id,name:profile.handle};
  }
  if (!identity) { reply(res,400,{error:'Bad request'},origin); return; }
  const key = (identity.guest?'g:':'a:')+identity.id, source = clientSource(req), known = pollers.get(key);
  if (!known) {
    const live = roster.counts();
    if (live.g+live.a >= MAX_CLIENTS) { reply(res,503,{t:'err'},origin); return; }
    if (pollCount(source) >= MAX_IP) { reply(res,429,{t:'err'},origin); return; }
  }
  pollers.set(key,{ip:known?.ip||source,at:Date.now()});
  roster.add(key,identity); changed();
  const counts = roster.counts();
  reply(res,200,identity.guest?{t:'ok',...counts}:{t:'ok',...counts,n:roster.names()},origin);
}
const events = createEventPresence({roster,verify,changed,reply,readBody,origins:ORIGINS,clientSource,maxClients:MAX_CLIENTS,maxIp:MAX_IP,
  hideAccount(id){authEpoch++;authCache.clear();evict(id);}
});
const chatRpc=createChatStore(SUPABASE_URL,process.env.SUPABASE_SECRET_KEY);
async function chatAdmin(token){
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/my_analytics_access',{method:'POST',headers:{apikey:API_KEY,authorization:'Bearer '+token,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
  return r.ok&&(await r.json())?.admin===true;
}
const chat=createChat({verify,isAdmin:chatAdmin,store:chatRpc,configured:Boolean(process.env.OPENAI_API_KEY&&chatRpc),reply,readBody,origins:ORIGINS,source:clientSource,onMention:events.mention,onlineNames:()=>roster.names()});
// A database-generated, short-lived opaque record ID is the only way to publish.
const seenRecords=new Map(); let recordBudget=12, recordBudgetAt=Date.now();
async function recordEvent(req,res){
  const now=Date.now();
  recordBudget=Math.min(12,recordBudget+(now-recordBudgetAt)/1000*2);recordBudgetAt=now;
  if(recordBudget<1){res.writeHead(429);res.end();return;}
  recordBudget--;
  let id;try{id=JSON.parse(await readBody(req)).id;}catch{}
  const key=process.env.SUPABASE_SECRET_KEY;
  if(!key||!UUID.test(id||'')){res.writeHead(400);res.end();return;}
  for(const [old,at] of seenRecords)if(now-at>60000)seenRecords.delete(old);
  if(seenRecords.has(id)){res.writeHead(204);res.end();return;}
  seenRecords.set(id,now);
  try{
    const r=await fetch(SUPABASE_URL+'/rest/v1/leaderboard_record_events?id=eq.'+id+'&select=id,game,handle,value,created_at',{
      headers:{apikey:key},signal:AbortSignal.timeout(5000),redirect:'error'
    });
    const rows=r.ok?await r.json():[];
    const row=rows[0],at=Date.parse(row?.created_at);
    if(row&&Number.isFinite(at)&&Date.now()-at<20000&&at<=Date.now()+5000){
      events.announce({id:row.id,game:row.game,handle:row.handle,value:row.value,at});
    }
    res.writeHead(204);res.end();
  }catch{seenRecords.delete(id);res.writeHead(503);res.end();}
}
const server = http.createServer((req,res)=>{
  if (req.method==='GET' && req.url==='/health') {
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({ok:true,service:'bored-presence',version:1}));
  } else if (req.method==='POST' && req.url==='/leaderboard-record') {
    void recordEvent(req,res).catch(()=>{if(!res.headersSent){res.writeHead(500);res.end();}else res.destroy();});
  } else if (['POST','OPTIONS'].includes(req.method) && req.url==='/chat') {
    void chat.handle(req,res).catch(()=>{if(!res.headersSent)reply(res,500,{error:'Chat unavailable'},req.headers.origin);else res.destroy();});
  } else if (['POST','OPTIONS'].includes(req.method) && req.url==='/presence/events') {
    void events.handle(req,res).catch(()=>{if(!res.headersSent)reply(res,500,{t:'err'},req.headers.origin);else res.destroy();});
  } else if (req.method==='POST' && req.url==='/presence') {
    void presence(req,res);
  } else if (req.method==='OPTIONS' && req.url==='/presence') {
    void presence(req,res);
  } else {res.writeHead(404);res.end();}
});
const wss = new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
  const source = clientSource(req);
  if(shuttingDown || req.url!=='/ws' || !ORIGINS.has(req.headers.origin) ||
    peers.size>=MAX_CLIENTS || (ipCounts.get(source)||0)>=MAX_IP) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,source));
});
wss.on('connection',(ws,ip)=>{
  const now=Date.now(), state={ip,last:now,created:now,alive:true,watch:false,authAt:0,checking:false,window:now,frames:0};
  peers.set(ws,state); ipCounts.set(ip,(ipCounts.get(ip)||0)+1);
  ws.on('pong',()=>{state.alive=true;});
  ws.on('error',()=>ws.terminate());
  ws.on('close',()=>{
    peers.delete(ws); const count=(ipCounts.get(ip)||1)-1;
    if(count)ipCounts.set(ip,count);else ipCounts.delete(ip);
    if(roster.remove(ws))changed();
  });
  ws.on('message',async (raw,binary)=>{
    if(binary){ws.close(1003);return;}
    const now=Date.now();
    if(now-state.window>=10000){state.window=now;state.frames=0;}
    if(++state.frames>30){ws.close(1008);return;}
    state.last=now;
    if(raw.toString()==='p')return;
    let m;try{m=JSON.parse(raw.toString());}catch{return;}
    const who=roster.identity(ws);
    if(m?.t==='guest' && !who && !state.checking && UUID.test(m.id||'')){
      roster.add(ws,{guest:true,id:m.id});
      send(ws,{t:'ok'});send(ws,countFrame());changed();return;
    }
    if(m?.t==='auth' && !state.checking && !who?.guest &&
       typeof m.jwt==='string' && m.jwt.length<=7000 && m.jwt.split('.').length===3 &&
       now-state.authAt>=3000){
      state.checking=true;state.authAt=now;
      try{
        const version=authEpoch;
        const profile=await verify(m.jwt);
        if(version!==authEpoch){ws.close(1013);return;}
        if(!peers.has(ws)||ws.readyState!==WebSocket.OPEN)return;
        if(who&&who.id!==profile.id){ws.close(1008);return;}
        if(!profile.visible){evict(profile.id);send(ws,{t:'off'});ws.close(4003);return;}
        if(!profile.handle){ws.close(4001,'Profile unavailable');return;}
        roster.add(ws,{guest:false,id:profile.id,name:profile.handle,expires:Date.now()+AUTH_MS+60000});
        send(ws,{t:'ok'});send(ws,countFrame());if(state.watch)send(ws,namesFrame());changed();
      }catch{send(ws,{t:'err'});ws.close(1013,'Try again');}
      finally{state.checking=false;}
      return;
    }
    if(!who)return;
    if(m?.t==='watch'){
      state.watch=!who.guest && m.on===true;
      if(state.watch)send(ws,namesFrame());
    }else if(m?.t==='hide'&&!who.guest){
      // An authenticated socket may hide its own account, never anyone else.
      authEpoch++;authCache.clear();evict(who.id);
    }
  });
});
const sweep=setInterval(()=>{
  const now=Date.now();
  for(const [ws,s] of peers){
    const who=roster.identity(ws);
    if(!s.alive||(!who&&now-s.created>12000)||now-s.last>150000||(!who?.guest&&who?.expires<now)){ws.terminate();continue;}
    s.alive=false;try{ws.ping();}catch{ws.terminate();}
  }
  for(const [key,value] of authCache)if(value.until<=now)authCache.delete(key);
},30000);
sweep.unref();
const pollSweep = setInterval(()=>{
  const now = Date.now();
  for(const [key,entry] of pollers) if(now-entry.at > POLL_TTL) {
    pollers.delete(key);
    if(roster.remove(key)) changed();
  }
},10000);
pollSweep.unref();
function shutdown(){
  shuttingDown=true;chat.close();events.close();clearInterval(sweep);clearInterval(pollSweep);clearTimeout(flushTimer);
  for(const ws of peers.keys())ws.close(1012,'Restarting');
  server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Bored presence listening'));

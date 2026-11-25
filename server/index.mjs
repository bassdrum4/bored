import http from 'node:http';
import { createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoster, UUID } from './core.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://djdpttltfmwkofdrvkem.supabase.co';
const API_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ayx7pzjm55vlzQ4u8se9KA_O97WK-QZ';
const ORIGINS = new Set((process.env.ALLOWED_ORIGINS || 'https://bassdrum4.github.io').split(','));
const MAX_CLIENTS = 1000, MAX_IP = 250, MAX_BUFFER = 65536;
const AUTH_MS = 20*60*1000, AUTH_CACHE_MS = 60*1000;
const roster = createRoster(), peers = new Map(), ipCounts = new Map();
const authCache = new Map(), pending = new Map();
let authBudget = 24, budgetAt = Date.now(), flushTimer = null;
let lastCount = '', lastNames = '', shuttingDown = false;

function send(ws, value) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFER) { ws.terminate(); return; }
  try { ws.send(typeof value === 'string' ? value : JSON.stringify(value)); } catch { ws.terminate(); }
}
function countFrame() { return JSON.stringify({t:'c',...roster.counts()}); }
function namesFrame() { return JSON.stringify({t:'n',n:roster.names()}); }
function changed() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const count = countFrame(), countChanged = count !== lastCount;
    const names = namesFrame(), namesChanged = names !== lastNames;
    lastCount = count; lastNames = names;
    for (const [ws,state] of peers) {
      const who = roster.identity(ws);
      if (!who) continue;
      if (countChanged) send(ws,count);
      if (namesChanged && state.watch && !who.guest) send(ws,names);
    }
  },5000);
}
function evict(id) {
  for (const ws of roster.accountClients(id)) {
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
  const task = (async () => {
    const res = await fetch(SUPABASE_URL+'/rest/v1/rpc/bored_presence_account',{
      method:'POST',headers:{apikey:API_KEY,authorization:'Bearer '+token,'content-type':'application/json'},
      body:'{"action":"get"}',signal:AbortSignal.timeout(8000)
    });
    if (!res.ok) throw Error('Account verification failed');
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
const server = http.createServer((req,res)=>{
  if (req.method==='GET' && req.url==='/health') {
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({ok:true,service:'bored-presence',version:1}));
  } else {res.writeHead(404);res.end();}
});
const wss = new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
  const ip = req.socket.remoteAddress || 'unknown';
  // Render's proxy is shared; use its client IP header if present. Never log it.
  const source = String(req.headers['x-forwarded-for']||ip).split(',').at(-1).trim();
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
        const profile=await verify(m.jwt);
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
      authCache.clear();evict(who.id);
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
function shutdown(){
  shuttingDown=true;clearInterval(sweep);clearTimeout(flushTimer);
  for(const ws of peers.keys())ws.close(1012,'Restarting');
  server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Bored presence listening'));

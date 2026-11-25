import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {createRoster} from './core.mjs';
import {createEventPresence} from './event-presence.mjs';
const origin='https://bassdrum4.github.io';
async function fixture(t){
  const roster=createRoster(), id=randomUUID();
  const jwt='x.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.x';
  let checks=0,visible=true,events;
  const reply=(res,code,value)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  events=createEventPresence({roster,verify:async token=>{assert.equal(token,jwt);checks++;return {id,visible,handle:'Penguin'};},changed:()=>queueMicrotask(()=>events.flush()),hideAccount:who=>{visible=false;events.evict(who);},reply,readBody:async req=>{let s='';for await(const c of req)s+=c;return s;},origins:new Set([origin]),clientSource:()=> 'test',waitMs:100,ttlMs:2000,keepaliveMs:50,streamMs:5000});
  const server=http.createServer((req,res)=>void events.handle(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  t.after(()=>{events.close();server.closeAllConnections();server.close();});
  const post=(body,signal)=>fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body),signal});
  const guest={t:'guest',id:randomUUID(),sid:randomUUID()},account={t:'auth',jwt,sid:randomUUID()};
  return {post,guest,account,roster,checks:()=>checks};
}
test('SSE sends counts and roster changes; guest receives no names',async t=>{
  const f=await fixture(t),ac=new AbortController();
  t.after(()=>ac.abort());
  const stream=await f.post({...f.guest,mode:'sse',watch:true},ac.signal);
  assert.match(stream.headers.get('content-type'),/text\/event-stream/);
  const reader=stream.body.getReader(), decoder=new TextDecoder();
  let buffer='';
  async function frame(){
    while(true){
      const i=buffer.indexOf('\n\n');
      if(i>=0){const part=buffer.slice(0,i);buffer=buffer.slice(i+2);if(part.startsWith('data: '))return JSON.parse(part.slice(6));continue;}
      const {value,done}=await reader.read();assert.equal(done,false);buffer+=decoder.decode(value,{stream:true});
    }
  }
  assert.deepEqual(Object.keys(await frame()).sort(),['a','cursor','g','t']);
  const p=await (await f.post({...f.account,mode:'poll',watch:true})).json();
  assert.deepEqual(p.n,['Penguin']);assert.equal(p.g,1);
  assert.equal((await frame()).a,1);
  await f.post({...f.account,mode:'leave'});
  assert.equal((await frame()).a,0);
});
test('long poll returns on change, otherwise idle; account auth cached and names on demand',async t=>{
  const f=await fixture(t);
  const first=await (await f.post({...f.account,mode:'poll'})).json();
  assert.equal(first.n,undefined);
  const idle=await (await f.post({...f.account,mode:'poll',cursor:first.cursor})).json();
  assert.equal(idle.t,'idle');assert.equal(f.checks(),1);
  const pending=f.post({...f.account,mode:'poll',cursor:first.cursor});
  await new Promise(r=>setTimeout(r,10));
  await f.post({...f.guest,mode:'poll'});
  const update=await (await pending).json();
  assert.equal(update.g,1);assert.equal(update.t,'ok');
  const names=await (await f.post({...f.account,mode:'poll',watch:true,cursor:update.cursor})).json();
  assert.deepEqual(names.n,['Penguin']);assert.equal(f.checks(),1);
  const second={...f.account,sid:randomUUID()};
  await f.post({...second,mode:'poll'});
  assert.equal(f.roster.counts().a,1);
  await f.post({...f.account,mode:'hide'});
  assert.equal(f.roster.counts().a,0);
  const off=await (await f.post({...second,mode:'poll'})).json();
  assert.equal(off.t,'off');
});

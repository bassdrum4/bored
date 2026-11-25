import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {createChat,cleanMessage,moderate} from './chat.mjs';
const origin='https://bassdrum4.github.io';
test('local checks reject contact details, links, oversize and profanity',()=>{
  for(const s of ['https://example.com','me@example.com','123-456-7890','a'.repeat(301),'fuck','  '])assert.equal(cleanMessage(s),'');
  assert.equal(cleanMessage('  Anyone   up for chess? '),'Anyone up for chess?');
});
test('OpenAI request is text-only and moderation fails closed',async()=>{
  let request;
  assert.equal(await moderate('hello',{key:'test',fetcher:async(url,opts)=>{request={url,body:JSON.parse(opts.body)};return {ok:true,json:async()=>({results:[{flagged:false}]})};}}),true);
  assert.equal(request.url,'https://api.openai.com/v1/moderations');
  assert.deepEqual(request.body,{model:'omni-moderation-latest',input:'hello'});
  assert.equal(await moderate('bad',{key:'test',fetcher:async()=>({ok:true,json:async()=>({results:[{flagged:true}]})})}),false);
  await assert.rejects(moderate('hello',{key:'',fetcher:async()=>{throw Error('must not call');}}));
  await assert.rejects(moderate('hello',{key:'test',fetcher:async()=>({ok:false})}));
  await assert.rejects(moderate('hello',{key:'test',fetcher:async()=>({ok:true,json:async()=>({results:[]})})}));
});
async function fixture(t,configured=true){
  const uid=randomUUID(),mod=randomUUID();
  const jwt=id=>'x.'+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.x';
  let enabled=true,bans={},reports=[],checks=0;
  const chat=createChat({configured,verify:async token=>{const id=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub;return {id,handle:id===mod?'Admin':'Penguin'};},isAdmin:async token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub===mod,store:async(action,args)=>{
    if(action==='state')return {enabled,bans:{...bans}};
    if(action==='report')reports.push(args);
    if(action==='reports')return reports;
    if(action==='enable')enabled=args.enabled;
    if(action==='ban')bans[args.user]=new Date(Date.now()+600000).toISOString();
    if(action==='unban')delete bans[args.user];
    return {ok:true};
  },moderateText:async text=>{checks++;if(text==='offline')throw Error('offline');return text!=='flagged';},reply:(r,code,v)=>{r.writeHead(code,{'content-type':'application/json'});r.end(JSON.stringify(v));},readBody:async req=>{let s='';for await(const c of req)s+=c;return s;},origins:new Set([origin]),source:()=> 'test',waitMs:500,keepaliveMs:1000});
  const server=http.createServer((req,res)=>void chat.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{chat.close();server.closeAllConnections();server.close();});
  const post=(body,signal)=>fetch('http://127.0.0.1:'+server.address().port,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body),signal});
  return {post,user:jwt(uid),admin:jwt(mod),uid,reports,checks:()=>checks};
}
test('chat verifies authors, moderates before delivery, persists reports and enforces admin bans',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post({mode:'send',text:'hi'})).status,401);
  const initial=await (await f.post({mode:'poll'})).json();
  assert.equal(initial.messages.length,0);
  assert.equal((await f.post({mode:'send',jwt:f.user,text:'flagged'})).status,422);
  assert.equal((await f.post({mode:'send',jwt:f.user,text:'offline'})).status,503);
  const pending=f.post({mode:'poll',cursor:initial.cursor});
  const sent=await (await f.post({mode:'send',jwt:f.user,text:'hello',handle:'fake'})).json();
  const got=await (await pending).json();
  assert.equal(got.events[0].message.handle,'Penguin');assert.equal(got.events[0].message.text,'hello');
  assert.notEqual(got.events[0].message.author,f.uid);
  assert.equal(f.checks(),3);
  assert.equal((await f.post({mode:'report',jwt:f.user,id:sent.id})).status,200);
  assert.equal(f.reports[0].text,'hello');
  assert.equal((await f.post({mode:'admin',jwt:f.user,action:'ban',id:sent.id})).status,403);
  assert.equal((await f.post({mode:'admin',jwt:f.admin,action:'ban',id:sent.id})).status,200);
  assert.equal((await f.post({mode:'send',jwt:f.user,text:'again'})).status,403);
  assert.equal((await f.post({mode:'admin',jwt:f.admin,action:'enable',enabled:false})).status,200);
  assert.equal((await f.post({mode:'poll'})).status,403);
});
test('missing keys leave chat closed',async t=>{
  const f=await fixture(t,false);
  assert.equal((await f.post({mode:'status'})).status,503);
});
test('SSE broadcasts moderated messages and nothing on rejection',async t=>{
  const f=await fixture(t),ac=new AbortController();t.after(()=>ac.abort());
  const r=await f.post({mode:'sse'},ac.signal);assert.match(r.headers.get('content-type'),/text\/event-stream/);
  const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
  async function frame(){while(true){const i=buffer.indexOf('\n\n');if(i>=0){const part=buffer.slice(0,i);buffer=buffer.slice(i+2);if(part.startsWith('data: '))return JSON.parse(part.slice(6));continue;}const {done,value}=await reader.read();assert.equal(done,false);buffer+=decoder.decode(value,{stream:true});}}
  assert.equal((await frame()).messages.length,0);
  assert.equal((await f.post({mode:'send',jwt:f.user,text:'flagged'})).status,422);
  await f.post({mode:'send',jwt:f.user,text:'chess?'});
  assert.equal((await frame()).events[0].message.text,'chess?');
});

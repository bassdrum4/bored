const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {database,call,as,ids,enroll,serviceCommit,poolHandler:localHandler}=require('./together-db.cjs');
const engine=()=>import('../src/games/pool-engine.js');
function oldSimulator(){
 const source=fs.readFileSync(path.join(__dirname,'../src/games/content/8ball.html'),'utf8');
 const names=['simPotGeo','simStep','simulateShot','inCornerTL','inCornerTR','inCornerBL','inCornerBR','inSideT','inSideB','inLeft','inRight'];
 const extract=name=>{const start=source.indexOf('function '+name+'(');let end=source.indexOf('{',start),depth=1;while(depth&&++end<source.length){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(start,end+1);};
 const setup=`const PW=220,PH=110,R=3.05,FRICTION=1,CUSH=.72,BB_E=.94,STOPV=9,MAXPOWER=780,SIM_STEP=1/300,JAW=4.7,SIDEGAP=3.9;
 const POCKETS=[{x:0,y:0,r:5.6},{x:220,y:0,r:5.6},{x:0,y:110,r:5.6},{x:220,y:110,r:5.6},{x:110,y:-1.1,r:5.1},{x:110,y:111.1,r:5.1}];`;
 return new Function(setup+names.map(extract).join('\n')+';return simulateShot;')();
}
function position(kind){
 const eight=kind==='early'||kind==='win'||kind==='break';const id=eight?8:kind==='wrong'?9:1;
 const balls=[{id:0,x:110,y:50},{id,x:110,y:20}];
 if(!eight)balls.push({id:8,x:175,y:70});
 if(kind!=='win'&&id!==1)balls.push({id:1,x:180,y:90});
 if(id!==9)balls.push({id:9,x:195,y:85});
 return {balls,groups:kind==='break'?[null,null]:['solid','stripe'],ballInHand:false,breakShot:kind==='break',shotCount:3,lastShot:null};
}

test('pool simulation reuses the original game physics and does not mutate inputs',async()=>{
 const {initialPoolState,simulatePoolShot,applyPoolShot}=await engine();const old=oldSimulator();
 for(const layout of [initialPoolState().balls,position('pot').balls])for(const [angle,power] of [[0,.85],[-Math.PI/2,.25],[.28,.55],[Math.PI,.7]]){
  const expected=old(layout,angle,power),actual=simulatePoolShot(layout,angle,power);
  assert.deepEqual(actual.potted,expected.potted);assert.equal(actual.firstHit,expected.firstHit);assert.equal(actual.after.length,expected.after.length);
  actual.after.forEach((b,i)=>{assert.equal(b.id,expected.after[i].id);assert.ok(Math.abs(b.x-expected.after[i].x)<1e-9);assert.ok(Math.abs(b.y-expected.after[i].y)<1e-9);});
 }
 const start=initialPoolState(),before=JSON.stringify(start);applyPoolShot(start,{angle:0,power:85},1);assert.equal(JSON.stringify(start),before);
});

test('pool rules: pots keep turn, scratches/fouls give ball in hand, 8-ball finish and break re-rack',async()=>{
 const {applyPoolShot,normalizePoolMove,validCuePlacement}=await engine();
 const pot=applyPoolShot(position('pot'),{angle:2700,power:25},1);assert.ok(pot.state.lastShot.potted.includes(1));assert.equal(pot.nextSeat,1);assert.equal(pot.winner,null);
 const wrong=applyPoolShot(position('wrong'),{angle:2700,power:25},1);assert.equal(wrong.state.ballInHand,true);assert.equal(wrong.nextSeat,2);assert.ok(!wrong.state.balls.some(b=>b.id===0));
 const scratchState={...position('pot'),balls:[{id:0,x:110,y:30},{id:1,x:175,y:70},{id:8,x:185,y:90}]};
 const scratch=applyPoolShot(scratchState,{angle:2700,power:20},1);assert.ok(scratch.state.lastShot.potted.includes(0));assert.equal(scratch.state.ballInHand,true);
 assert.throws(()=>applyPoolShot(scratch.state,{angle:0,power:50},2),/Place the cue/);
 assert.throws(()=>applyPoolShot(scratch.state,{angle:0,power:50,cue:{x:175,y:70}},2),/Place the cue/);
 assert.ok(validCuePlacement(scratch.state.balls,50,55));
 assert.doesNotThrow(()=>applyPoolShot(scratch.state,{angle:0,power:50,cue:{x:50,y:55}},2));
 assert.equal(applyPoolShot(position('early'),{angle:2700,power:25},1).winner,2);
 assert.equal(applyPoolShot(position('win'),{angle:2700,power:25},1).winner,1);
 const reset=applyPoolShot(position('break'),{angle:2700,power:25},1);assert.equal(reset.state.balls.length,16);assert.equal(reset.nextSeat,1);assert.equal(reset.winner,null);
 for(const bad of [{angle:NaN,power:40},{angle:3600,power:50},{angle:1.5,power:50},{angle:0,power:0},{angle:0,power:101},{angle:0,power:40,winner:1},{angle:0,power:40,cue:{x:Infinity,y:1}}])assert.throws(()=>normalizePoolMove(bad));
 assert.throws(()=>applyPoolShot(position('pot'),{angle:0,power:50,cue:{x:50,y:55}},1),/only after a foul/);
});

async function shotRequest(handler,user,body){
 const response=await handler(new Request('https://example.test/functions/v1/together-pool',{method:'POST',headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};
}

test('pool endpoint and SQL: complete saved game, repeat requests, auth and result tampering',async t=>{
 const db=await database();t.after(()=>db.close());const [a,b,c]=ids;
 for(const u of [a,b,c])await enroll(db,u);
 const pending=await call(db,a,'challenge',{user_id:b,game:'8ball'});let m=await call(db,b,'accept',{match_id:pending.id});
 const {initialPoolState}=await engine();assert.deepEqual(m.state,initialPoolState());
 const handler=await localHandler(db),payload={match_id:m.id,version:m.version,request_id:randomUUID(),move:{angle:0,power:85}};
 for(const u of [a,b,c,null])await assert.rejects(as(db,u,()=>db.query('select public.bt_pool_commit($1::jsonb)',[JSON.stringify({actor:a,winner_seat:1})])),/permission denied/);
 await assert.rejects(call(db,a,'move',{...payload,move:{angle:0,power:85}}),/verified pool/);
 const unauthorized=await shotRequest(handler,c,payload);assert.ok(unauthorized.status>=400);
 const notTurn=await shotRequest(handler,b,payload);assert.equal(notTurn.status,409);
 const forged=await shotRequest(handler,a,{...payload,state:{balls:[]},winner:1});assert.equal(forged.status,422);
 const first=await shotRequest(handler,a,payload);assert.equal(first.status,200);m=first.body;assert.equal(m.state.shotCount,1);assert.equal(m.turn_user,b);
 const duplicate=await shotRequest(handler,a,payload);assert.equal(duplicate.status,200);assert.equal(duplicate.body.version,m.version);
 assert.equal((await call(db,a,'match',{match_id:m.id})).moves.length,1);
 assert.equal((await shotRequest(handler,a,{...payload,move:{angle:1,power:85}})).status,409);
 assert.equal((await shotRequest(handler,b,{...payload,request_id:randomUUID()})).status,409);
 // Controlled table fixtures exercise rule-to-database winner assignment. All
 // fixtures stay inside this disposable database, never the production project.
 await db.query('update bored_together.matches set state=$1::jsonb,turn_user=$2 where id=$3',[JSON.stringify(position('win')),a,m.id]);
 const win=await shotRequest(handler,a,{match_id:m.id,version:m.version,request_id:randomUUID(),move:{angle:2700,power:25}});
 assert.equal(win.status,200);assert.equal(win.body.status,'completed');assert.equal(win.body.winner,a);assert.match(win.body.reason,/8 ball cleared/);
 const reopened=await call(db,b,'match',{match_id:m.id});assert.equal(reopened.moves.length,2);assert.ok(reopened.moves[1].state_after);assert.equal(reopened.winner,a);
 assert.ok(!JSON.stringify(reopened).includes('@example.test'));
 const rematch=await call(db,b,'rematch',{match_id:m.id});assert.equal(rematch.game,'8ball');assert.deepEqual(rematch.state,initialPoolState());
 await call(db,a,'accept',{match_id:rematch.id});
 await db.query('update bored_together.matches set state=$1::jsonb where id=$2',[JSON.stringify(position('early')),rematch.id]);
 const loss=await shotRequest(handler,b,{match_id:rematch.id,version:1,request_id:randomUUID(),move:{angle:2700,power:25}});assert.equal(loss.body.winner,a,'an early 8 awards the opponent, not the shooter');
 await call(db,a,'queue_join',{game:'8ball'});await call(db,c,'queue_join',{game:'connect-four'});
 assert.deepEqual((await call(db,c,'dashboard')).queue,['connect-four']);
 const matched=await call(db,b,'queue_join',{game:'8ball'});assert.equal(matched.game,'8ball');assert.equal(matched.source,'random');assert.ok(!JSON.stringify(matched).includes('email'));
 // A leave/block race after server computation cannot commit a stale result.
 const before=await call(db,a,'match',{match_id:matched.id});const {applyPoolShot}=await engine();const transition=applyPoolShot(before.state,{angle:0,power:80},1);
 await call(db,a,'block',{user_id:b});
 await assert.rejects(serviceCommit(db,{actor:a,match_id:before.id,expected_version:before.version,request_id:randomUUID(),move:{angle:0,power:80},state:transition.state,next_seat:transition.nextSeat,winner_seat:transition.winner,reason:transition.reason}),/turn|unavailable/);
 const preflight=await handler(new Request('https://example.test',{method:'OPTIONS'}));assert.equal(preflight.status,204);
 const signedOut=await handler(new Request('https://example.test',{method:'POST',body:'{}'}));assert.equal(signedOut.status,401);
});

test('pool animation tolerates an RAF timestamp before the shot starts and always settles',async t=>{
 const saved={document:global.document,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame};
 t.after(()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete global[key];else global[key]=value;}});
 global.document={hidden:false,addEventListener(){},removeEventListener(){}};
 let n=0;global.requestAnimationFrame=callback=>{const frame=++n;queueMicrotask(()=>callback(performance.now()+(frame===1?-500:5000)));return frame;};global.cancelAnimationFrame=()=>{};
 const painted=[];const context=new Proxy({arc:(x,y,r)=>{if(r===3.05)painted.push(x);}},{get:(target,key)=>key in target?target[key]:()=>{}});
 const canvas={width:240,isConnected:true,getContext:()=>context};
 const {animatePoolShot}=await import('../src/hub/together-pool.js');
 await animatePoolShot(canvas,[[{id:0,x:50,y:55}],[{id:0,x:70,y:55}]]);
 assert.deepEqual(painted,[50,50,70]);
});

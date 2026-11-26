const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {database,call,enroll,ids}=require('./together-db.cjs');
test('Battleship validates fleets and shots; neither opponent fleet nor placement log leaks',async()=>{
 const db=await database();try{
 const [a,b]=ids;await enroll(db,a);await enroll(db,b);
 let m=await call(db,a,'challenge',{game:'battleship',user_id:b});
 const fleet=[[0,1,2,3,4],[10,11,12,13],[20,21,22],[30,31,32],[40,41]];
 const other=[[50,51,52,53,54],[60,61,62,63],[70,71,72],[80,81,82],[90,91]];
 const move=(u,x,p)=>call(db,u,'move',{match_id:x.id,version:x.version,request_id:randomUUID(),move:p});
 await assert.rejects(move(a,m,{fleet:[[9,10,11,12,13],...fleet.slice(1)]}),/straight/);
 m=await move(a,m,{fleet});assert.equal(m.state.ready,false);
 let v=await call(db,b,'match',{match_id:m.id});assert.deepEqual(v.state.fleet,[]);assert.equal(v.moves.length,0);
 m=await move(b,v,{fleet:other});assert.equal(m.state.ready,true);assert.deepEqual(m.state.fleet,other);
 v=await call(db,a,'match',{match_id:m.id});assert.deepEqual(v.state.fleet,fleet);assert.equal(v.moves.some(x=>x.actor===b&&x.move.fleet),false);
 const targets=other.flat();
 for(let i=0;i<targets.length;i++){
  v=await move(a,v,{fire:targets[i]});assert.equal(v.state.outgoing.at(-1).hit,true);
  if(i===targets.length-1)break;
  let w=await call(db,b,'match',{match_id:m.id});w=await move(b,w,{fire:99-i});v=await call(db,a,'match',{match_id:m.id});
  await assert.rejects(move(a,v,{fire:targets[i]}),/Already fired/);
 }
 assert.equal(v.status,'completed');assert.equal(v.winner,a);
 }finally{await db.close();}
});


const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function load(deps){
 const source=fs.readFileSync(path.join(__dirname,'../src/hub/together-api.js'),'utf8')
 .replace(/^import .*;\n/gm,'').replace(/export /g,'');
 return new Function(...Object.keys(deps),source+';return togetherRPC;')(...Object.values(deps));
}
test('Together transport rejects guest requests and results from a previous identity',async()=>{
 let owner='first',release,called=0;
 const gate=new Promise(r=>{release=r;});
 const rpc=load({hasIdentity:()=>Boolean(owner),getSession:()=>({user:{id:owner}}),
  freshSession:async()=>({user:{id:owner},access_token:'first-token'}),
  request:async(path,options)=>{called++;assert.equal(path,'/rest/v1/rpc/bt_rpc');assert.equal(options.token,'first-token');await gate;return {private:'first account'};}});
 const pending=rpc('dashboard');await new Promise(r=>setImmediate(r));owner='second';release();
 await assert.rejects(pending,/account changed/);assert.equal(called,1);
 owner=null;await assert.rejects(rpc('dashboard'),/Sign in/);assert.equal(called,1);
});
test('pool shots use the authenticated Edge endpoint rather than accepting client results through the database RPC',async()=>{
 const payload={match_id:'match',version:1,request_id:'request',move:{angle:0,power:80}};let seen;
 const rpc=load({hasIdentity:()=>true,getSession:()=>({user:{id:'player'}}),freshSession:async()=>({user:{id:'player'},access_token:'token'}),request:async(path,options)=>{seen={path,options};return {ok:true};}});
 await rpc('pool_move',payload);assert.equal(seen.path,'/functions/v1/together-pool');assert.deepEqual(seen.options.body,payload);assert.equal(seen.options.token,'token');
});

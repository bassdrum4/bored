const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function controller(deps){
 const source=fs.readFileSync(path.join(__dirname,'../src/hub/together-player.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 return new Function(...Object.keys(deps),source+';return createTogetherPlayer;')(...Object.values(deps));
}
test('original-game bridge waits for authoritative end, rejects other frames and drops late identity results',async()=>{
 let owner='a',closed=0,exits=0,release;
 const frameWindow={postMessage:message=>reply(message)},incoming=[];
 const create=controller({hasIdentity:()=>!!owner,getSession:()=>({user:{id:owner}}),location:{href:'https://example.test/bored/'},crypto:require('node:crypto')});
 const match={game:'8ball',rules_version:1,status:'active',state:{balls:[]},p1:'a',p2:'b',turn_user:'a',p1_handle:'</script><img>',p2_handle:'B'};
 let next={...match,version:2};
 const player=create({match,owner:'a',frame:{contentWindow:frameWindow},submit:async()=>next,close:()=>closed++,reload:()=>{},onExit:()=>exits++});
 const document=player.document('<head></head>');
 assert.ok(!document.includes('</script><img>'),'player names cannot escape injected script');
 let reply;
 const realm={window:{},parent:{postMessage:m=>incoming.push(m)},addEventListener:(_,fn)=>reply=m=>fn({source:realm.parent,data:m})};
 vm.runInNewContext(document.match(/<script>([\s\S]*)<\/script>/)[1],realm);
 const bridge=realm.window.__boredTogether;
 let promise=bridge.submit({angle:0,power:55}),request=incoming.shift();
 await player.message({source:{},data:request});assert.equal(incoming.length,0);
 await player.message({source:frameWindow,data:request});await promise;
 bridge.finishTurn();await player.message({source:frameWindow,data:incoming.shift()});
 assert.equal(closed,0,'a retained Pool turn stays open');
 next={...match,turn_user:'b',version:3};
 promise=bridge.submit({angle:0,power:55});request=incoming.shift();
 await player.message({source:frameWindow,data:request});await promise;
 assert.equal(closed,0,'wait for original game animation to settle');
 bridge.finishTurn();await player.message({source:frameWindow,data:incoming.shift()});assert.equal(closed,1);
 const delayed=create({match,owner:'a',frame:{contentWindow:frameWindow},submit:()=>new Promise(r=>release=r),close:()=>closed++,onExit:()=>exits++});
 const script=delayed.document('<head></head>').match(/<script>([\s\S]*)<\/script>/)[1];
 vm.runInNewContext(script,realm);
 const late=realm.window.__boredTogether.submit({angle:0,power:5});
 const running=delayed.message({source:frameWindow,data:incoming.shift()});
 owner='b';release(next);await running;
 assert.equal(delayed.isOwner(),false);assert.equal(closed,1,'late save cannot close another account game');
 // No reply is delivered to the disposed/previous-account frame.
 delayed.dispose();assert.equal(exits,1);void late;
});

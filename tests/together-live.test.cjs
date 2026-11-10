// Live games, server side: rooms, the ordered action log, presence rules, snapshots and hashes.
// The same scenarios run on PGlite (production SQL, real Postgres WASM, one connection) and, when
// BT_TEST_DATABASE_URL points at a disposable server, on native PostgreSQL, where the concurrency
// checks need real simultaneous sessions. The native run makes its own temporary database inside
// that server, so it can share the server with together-postgres.test.cjs. Never point it at
// production: it refuses a Supabase host.
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {ids}=require('./together-db.cjs');
const {pgliteEnv,nativeEnv,url}=require('./together-live-env.cjs');
const [A,B,C,D,E,F,ANON]=ids; // A hosts, B and C are invited, D never joins, E is a member outside the game, F is no member, ANON is anonymous
const GAME_ID='11111111-1111-4111-8111-111111111111';

// A started game: A hosts, B and C joined and ready, D never joined and becomes a CPU, plus two more CPUs.
async function startedGame(env,config={}) {
  const g=await env.rpc(A,'create',{game:'ashcrown',invite:[B,C,D],config:{map:'pangaea',cpus:1,timer:60,...config}});
  await env.rpc(B,'join',{id:g.id});
  await env.rpc(C,'join',{id:g.id});
  await env.rpc(B,'lobby_set',{id:g.id,ready:true,civ:'ember'});
  await env.rpc(C,'lobby_set',{id:g.id,ready:true,civ:'tide'});
  return env.rpc(A,'start',{id:g.id});
}
const send=(env,user,id,type,args={},request_id=randomUUID())=>env.rpc(user,'send',{id,type,args,request_id});
const rejects=(promise,pattern)=>assert.rejects(promise,pattern);

async function functional(t,env) {
  // A host may have five open games; every scenario starts from a clean slate.
  t.beforeEach(()=>env.admin("update bored_live.games set status='completed' where status in ('lobby','active')"));
  await t.test('only signed-in Together members can use live games',async()=>{
    await rejects(env.rpc(F,'list'),/Join Bored Together first/);
    await rejects(env.rpc(ANON,'list'),/Sign in to your Bored account/);
    await rejects(env.rpc(null,'list'),/permission denied/);
    await rejects(env.rpc(A,'bogus'),/Unknown operation/);
  });

  await t.test('create: one to three invited members, checked setup, no strangers',async()=>{
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[]}),/Invite one to three/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B,C,D,E]}),/Invite one to three/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B,B]}),/Invite each member once/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[A]}),/Invite each member once/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[F]}),/can not be invited/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[ANON]}),/can not be invited/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:['not-a-uuid']}),/Invalid request/);
    await rejects(env.rpc(A,'create',{game:'chess',invite:[B]}),/Unknown game/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{cpus:9}}),/Invalid setup/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{timer:45}}),/Invalid setup/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{bomb:true}}),/Invalid setup/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{map:'x'.repeat(40)}}),/Invalid setup/);
    const g=await env.rpc(A,'create',{game:'ashcrown',invite:[B,C],config:{map:'pangaea',timer:120}});
    assert.equal(g.status,'lobby');
    assert.equal(g.host,A);
    assert.equal(g.me,0);
    assert.deepEqual(g.seats.map(s=>[s.seat,s.state,s.team]),[[0,'joined',0],[1,'invited',1],[2,'invited',2]]);
    assert.deepEqual(g.seats.map(s=>s.handle),['WackyPenguin','BananaWizard','QuietOwl']);
    await env.rpc(A,'leave_lobby',{id:g.id});
  });

  await t.test('lobby: invited, joined, ready, civ picks, then start',async()=>{
    const g=await env.rpc(A,'create',{game:'ashcrown',invite:[B,C,D],config:{map:'pangaea',cpus:2,timer:300,unjoined:'cpu'}});
    const id=g.id;
    // An invited member sees it in their list before joining; a stranger does not.
    assert.ok((await env.rpc(B,'list')).some(x=>x.id===id));
    assert.ok(!(await env.rpc(E,'list')).some(x=>x.id===id));
    await rejects(env.rpc(E,'game',{id}),/not in this game/);
    await rejects(env.rpc(B,'lobby_set',{id,ready:true}),/Join the game first/);
    const joined=await env.rpc(B,'join',{id});
    assert.equal(joined.seats[1].state,'joined');
    await env.rpc(C,'join',{id});
    const picked=await env.rpc(B,'lobby_set',{id,civ:'ember'});
    assert.equal(picked.seats[1].civ,'ember');
    await rejects(env.rpc(C,'lobby_set',{id,civ:'ember'}),/taken/);
    assert.equal((await env.rpc(C,'lobby_set',{id,civ:'random'})).seats[2].civ,null);
    // Only the host changes the setup, and a change asks the others to confirm again.
    await rejects(env.rpc(B,'lobby_set',{id,config:{cpus:3}}),/Only the host/);
    await env.rpc(B,'lobby_set',{id,ready:true});
    await env.rpc(C,'lobby_set',{id,ready:true,civ:'tide'});
    let now=await env.rpc(A,'lobby_set',{id,config:{map:'pangaea',cpus:2,timer:300,unjoined:'cpu',turns:80}});
    assert.deepEqual(now.seats.map(s=>s.state),['joined','joined','joined','invited']);
    await env.rpc(B,'lobby_set',{id,ready:true});
    await rejects(env.rpc(B,'start',{id}),/Only the host/);
    await rejects(env.rpc(A,'start',{id}),/has to be ready/);
    await env.rpc(C,'lobby_set',{id,ready:true});
    now=await env.rpc(A,'start',{id});
    assert.equal(now.status,'active');
    assert.equal(now.timer,300);
    // D never joined, so that seat became a CPU. Two more CPUs follow. Three humans, three CPUs.
    assert.deepEqual(now.start.seats.map(s=>[s.seat,s.kind,s.team]),[[0,'human',0],[1,'human',1],[2,'human',2],[3,'cpu',3],[4,'cpu',4],[5,'cpu',5]]);
    assert.equal(now.start.seats[1].civ,'ember');
    assert.equal(now.start.seats[2].civ,'tide');
    assert.equal(now.start.options.turns,80);
    assert.equal(now.start.options.timer,300);
    assert.ok(Number.isInteger(now.start.options.seed) && now.start.options.seed>0);
    assert.equal(now.round,1);
    assert.equal(now.head,0);
    await rejects(env.rpc(A,'start',{id}),/already started/);
    await rejects(env.rpc(D,'game',{id}),/not in this game/);
    await rejects(env.rpc(B,'join',{id}),/already started/);
  });

  await t.test('unjoined seats can be dropped instead of becoming CPUs, and a game needs two civs',async()=>{
    const g=await env.rpc(A,'create',{game:'ashcrown',invite:[B,D],config:{cpus:0,unjoined:'drop'}});
    await env.rpc(B,'join',{id:g.id});
    await env.rpc(B,'lobby_set',{id:g.id,ready:true});
    const s=await env.rpc(A,'start',{id:g.id});
    assert.deepEqual(s.start.seats.map(x=>[x.seat,x.kind]),[[0,'human'],[1,'human']]);
    const lone=await env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{cpus:0,unjoined:'drop'}});
    await rejects(env.rpc(A,'start',{id:lone.id}),/Add a CPU/);
    const many=await env.rpc(A,'create',{game:'ashcrown',invite:[B,C,D],config:{cpus:7,unjoined:'cpu'}});
    await rejects(env.rpc(A,'start',{id:many.id}),/at most 8 civs/);
    // Leaving a lobby: a guest just drops out, the host cancels it.
    await env.rpc(B,'leave_lobby',{id:lone.id});
    await rejects(env.rpc(B,'game',{id:lone.id}),/not in this game/);
    assert.equal((await env.rpc(A,'leave_lobby',{id:many.id})).status,'cancelled');
    await rejects(send(env,A,many.id,'end-turn'),/not running/);
  });

  await t.test('the action log: next number, idempotent retries, seat from the caller, ordered reads',async()=>{
    const g=await startedGame(env);
    const id=g.id;
    const first=await send(env,A,id,'unit-move',{unit:3,to:[4,5]});
    assert.deepEqual([first.seq,first.duplicate,first.head],[1,false,1]);
    // The same request id again answers the same number and appends nothing.
    const rid=randomUUID();
    const one=await send(env,B,id,'set-build',{city:1,item:'warrior'},rid);
    const two=await send(env,B,id,'set-build',{city:1,item:'warrior'},rid);
    assert.deepEqual([one.seq,one.duplicate,two.seq,two.duplicate],[2,false,2,true]);
    // A client cannot pick its seat: the server takes it from who is calling.
    const spoof=await env.rpc(C,'send',{id,type:'end-turn',args:{},request_id:randomUUID(),seat:0});
    assert.equal(spoof.seq,3);
    // Somebody else's request id is not an echo of yours.
    await rejects(env.rpc(C,'send',{id,type:'end-turn',args:{},request_id:rid}),/Invalid request/);
    await rejects(send(env,B,id,'Bad Type'),/Invalid action/);
    await rejects(send(env,B,id,'x'.repeat(40)),/Invalid action/);
    await rejects(env.rpc(B,'send',{id,type:'end-turn',args:[],request_id:randomUUID()}),/Invalid action/);
    await rejects(env.rpc(B,'send',{id,type:'end-turn',args:{blob:'x'.repeat(9000)},request_id:randomUUID()}),/Invalid action/);
    await rejects(env.rpc(B,'send',{id,type:'end-turn',args:{},request_id:'nope'}),/Invalid request/);
    await rejects(send(env,E,id,'end-turn'),/not in this game/);
    for(let i=0;i<5;i++) await send(env,i%2?B:A,id,'unit-fortify',{unit:i});
    const all=await env.rpc(C,'sync',{id,after:0});
    assert.deepEqual(all.actions.map(a=>a.seq),[1,2,3,4,5,6,7,8]);
    assert.deepEqual(all.actions.slice(0,3).map(a=>[a.seat,a.type]),[[0,'unit-move'],[1,'set-build'],[2,'end-turn']]);
    assert.deepEqual(all.actions[0].args,{unit:3,to:[4,5]});
    assert.equal(all.head,8);
    const later=await env.rpc(B,'sync',{id,after:5,limit:2});
    assert.deepEqual(later.actions.map(a=>a.seq),[6,7]);
    assert.deepEqual((await env.rpc(B,'heartbeat',{id,after:0})).actions,[]);
    assert.equal((await env.rpc(B,'heartbeat',{id})).head,8);
    const rows=await env.admin('select seq from bored_live.actions where game_id=$1 order by seq',[id]);
    assert.deepEqual(rows.map(r=>r.seq),[1,2,3,4,5,6,7,8]);
  });

  await t.test('takeover: only after sixty quiet seconds, once, and a player can take their civ back',async()=>{
    const g=await startedGame(env);
    const id=g.id;
    await rejects(send(env,A,id,'cpu-takes-over',{seat:7}),/Invalid action/);
    // B was just seen: A cannot step in for them, and cannot step in so early after the start either.
    await rejects(send(env,A,id,'cpu-takes-over',{seat:1}),/still here/);
    await env.admin("update bored_live.presence set seen_at=now()-interval '90 seconds' where game_id=$1 and user_id=$2",[id,B]);
    await rejects(send(env,A,id,'cpu-takes-over',{seat:1}),/still here/); // game and A are too new
    await env.admin("update bored_live.games set started_at=now()-interval '5 minutes' where id=$1",[id]);
    await env.admin("update bored_live.presence set joined_at=now()-interval '5 minutes' where game_id=$1 and user_id=$2",[id,A]);
    const took=await send(env,A,id,'cpu-takes-over',{seat:1});
    assert.equal(took.duplicate,false);
    // Everyone else who notices too only gets the same action back.
    const again=await send(env,C,id,'cpu-takes-over',{seat:1});
    assert.deepEqual([again.seq,again.duplicate],[took.seq,true]);
    assert.equal((await env.admin('select count(*)::int n from bored_live.actions where game_id=$1 and type=$2',[id,'cpu-takes-over']))[0].n,1);
    const sync=await env.rpc(A,'sync',{id,after:0});
    assert.deepEqual(sync.actions.map(a=>[a.seat,a.type,a.args]),[[0,'cpu-takes-over',{seat:1,reason:'away'}]]);
    assert.equal(sync.seats[1].controller,'cpu');
    assert.equal(sync.seats[1].online,false);
    // While a CPU plays the civ the player can only ask for it back.
    await rejects(send(env,B,id,'unit-move',{unit:1}),/CPU is playing your civ/);
    const back=await send(env,B,id,'human-returns');
    assert.equal(back.duplicate,false);
    assert.equal((await env.rpc(B,'sync',{id,after:0})).seats[1].controller,'human');
    assert.equal((await send(env,B,id,'human-returns')).noop,true);
    await send(env,B,id,'unit-move',{unit:1});
    // Leaving on purpose is immediate: no waiting for sixty seconds.
    const left=await send(env,C,id,'cpu-takes-over',{seat:2});
    const leftAction=(await env.rpc(A,'sync',{id,after:left.seq-1})).actions[0];
    assert.deepEqual([leftAction.seat,leftAction.args],[2,{seat:2,reason:'left'}]);
    // Asking again for a seat that a CPU already plays answers with the same action and adds nothing.
    assert.equal((await send(env,A,id,'cpu-takes-over',{seat:2})).duplicate,true);
  });

  await t.test('timer: a timeout is accepted once, only when the time is up, only for the current round',async()=>{
    const g=await startedGame(env,{timer:60});
    const id=g.id;
    await rejects(send(env,A,id,'timeout',{round:1}),/has not run out/);
    await rejects(send(env,A,id,'timeout',{round:2}),/round is over/);
    // A report for a round far ahead is refused and moves neither the round nor its clock, so the timer still runs.
    const clock=async()=>(await env.admin('select round,round_at from bored_live.games where id=$1',[id]))[0];
    const before=await clock();
    for(const round of [3,50,9999]) await rejects(env.rpc(A,'report',{id,round,hash:'abcdef12'}),/Invalid request/);
    assert.deepEqual(await clock(),before);
    await env.admin("update bored_live.games set round_at=now()-interval '61 seconds' where id=$1",[id]);
    const first=await send(env,A,id,'timeout',{round:1});
    assert.equal(first.duplicate,false);
    const second=await send(env,B,id,'timeout',{round:1});
    assert.deepEqual([second.seq,second.duplicate],[first.seq,true]);
    // Round two begins when the first client reports its hash; round one's timeout is then history.
    await env.rpc(A,'report',{id,round:2,hash:'abcdef12'});
    await rejects(send(env,C,id,'timeout',{round:1}),/round is over/);
    await rejects(send(env,C,id,'timeout',{round:2}),/has not run out/);
    const untimed=await startedGame(env,{timer:0});
    await rejects(send(env,A,untimed.id,'timeout',{round:1}),/no turn timer/);
  });

  await t.test('snapshots and hashes: a snapshot waits for another seat to report its hash, first writer wins, a mismatch is logged, rounds are checked',async()=>{
    const g=await startedGame(env);
    const id=g.id,H='abcdef12';
    const snap=(user,round,hash,state={})=>env.rpc(user,'snapshot',{id,round,seq:3,hash,state:{turn:round,...state}});
    const kept=async()=>(await env.admin('select round,hash,seat from bored_live.snapshots where game_id=$1 order by round',[id]));
    for(let i=0;i<3;i++) await send(env,A,id,'unit-fortify',{unit:i});
    await rejects(env.rpc(A,'snapshot',{id,round:2,seq:99,hash:H,state:{turn:2}}),/Invalid snapshot/);
    await rejects(env.rpc(A,'snapshot',{id,round:2,seq:3,hash:'zz',state:{turn:2}}),/Invalid snapshot/);
    // Three humans are playing: nobody else has reported round 2, so the snapshot is not stored. The sender is told to ask again.
    assert.deepEqual(await snap(A,2,H,{from:'A'}),{stored:false,wait:true});
    assert.deepEqual(await kept(),[]);
    // Another seat reporting a different hash is not a confirmation; the same hash is.
    await env.rpc(B,'report',{id,round:2,hash:'0badc0de'});
    assert.deepEqual(await snap(A,2,H,{from:'A'}),{stored:false,wait:true},'a hash nobody else reported is not stored');
    await env.rpc(C,'report',{id,round:2,hash:H});
    assert.equal((await snap(A,2,H,{from:'A'})).stored,true);
    assert.deepEqual(await kept(),[{round:2,hash:H,seat:0}]);
    // The first writer wins; a later snapshot for the same round is not stored and not asked to wait.
    assert.deepEqual(await snap(C,2,H,{from:'C'}),{stored:false,wait:true},'C is the only seat that reported H, so no other seat confirms it');
    await env.rpc(A,'report',{id,round:2,hash:H});
    assert.deepEqual(await snap(C,2,H,{from:'C'}),{stored:false});
    assert.equal((await env.admin("select state->>'from' f from bored_live.snapshots where game_id=$1 and round=2",[id]))[0].f,'A');
    // A player who joins or comes back loads the newest snapshot with its state, then syncs from its seq.
    assert.deepEqual((await env.rpc(C,'game',{id})).snapshot,{round:2,seq:3,hash:H});
    assert.deepEqual((await env.rpc(C,'load',{id})).snapshot,{round:2,seq:3,hash:H,state:{turn:2,from:'A'}});
    await rejects(env.rpc(E,'load',{id}),/not in this game/);
    // Only the newest few snapshots are kept.
    for(const r of [3,4,5,6]) { await env.rpc(B,'report',{id,round:r,hash:H}); await snap(A,r,H); }
    assert.deepEqual((await kept()).map(r=>r.round),[4,5,6]);

    // Hashes: a mismatch is logged, and the round clock follows the first report of a round.
    const other=(await startedGame(env)).id;   // a second room, with its own round clock
    assert.deepEqual(await env.rpc(A,'report',{id:other,round:2,hash:'0123abcd'}),{ok:true,desync:false});
    assert.deepEqual(await env.rpc(B,'report',{id:other,round:2,hash:'0123abcd'}),{ok:true,desync:false});
    assert.equal((await env.rpc(C,'sync',{id:other,after:0})).round,2);
    const bad=await env.rpc(C,'report',{id:other,round:2,hash:'ffffffff'});
    assert.equal(bad.desync,true);
    const log=await env.admin('select round,seat,expected,got from bored_live.desyncs where game_id=$1',[other]);
    assert.deepEqual(log.map(x=>[x.round,x.seat,x.expected,x.got]),[[2,2,'0123abcd','ffffffff']]);
    // Only the round under way or the next one is accepted; anything else is refused and moves nothing.
    const clock=async()=>(await env.admin('select round,round_at from bored_live.games where id=$1',[other]))[0];
    const was=await clock();
    for(const round of [1,4,50]) await rejects(env.rpc(B,'report',{id:other,round,hash:'0123abcd'}),/Invalid request/);
    assert.deepEqual(await clock(),was,'neither the round nor its clock moved');
    assert.deepEqual(await env.rpc(B,'report',{id:other,round:3,hash:'0123abcd'}),{ok:true,desync:false},'the next round is fine');
    assert.equal((await clock()).round,3);

    // One human seat: nobody to ask, so a snapshot is stored as before. A seat a CPU is playing still needs a confirmation.
    const solo=await startedGame(env);
    await env.admin("update bored_live.seats set controller='cpu' where game_id=$1 and seat in (1,2)",[solo.id]);
    assert.equal((await env.rpc(A,'snapshot',{id:solo.id,round:2,seq:0,hash:H,state:{turn:2}})).stored,true);
    assert.deepEqual(await env.rpc(B,'snapshot',{id:solo.id,round:3,seq:0,hash:H,state:{turn:3}}),{stored:false,wait:true},'B’s seat is run by a CPU: it needs another seat to confirm');
  });

  await t.test('finishing a game: two seated humans must send the same winner, or the only human left; a lone claim waits',async()=>{
    const state=async id=>(await env.admin('select status,winner,over_reason from bored_live.games where id=$1',[id]))[0];
    const claims=async id=>(await env.admin('select seat,winner from bored_live.finish_claims where game_id=$1 order by seat',[id])).map(c=>[c.seat,c.winner]);
    const g=await startedGame(env);
    const id=g.id;
    // One claim is stored and ignored: the game goes on. The same human again does not make two.
    assert.equal((await env.rpc(B,'finish',{id,winner:1,why:'Conquest'})).status,'active');
    assert.equal((await env.rpc(B,'finish',{id,winner:1,why:'Conquest'})).status,'active');
    assert.deepEqual(await claims(id),[[1,1]]);
    assert.equal((await send(env,A,id,'unit-fortify',{unit:1})).duplicate,false,'still running');
    // A different winner from another human is not an agreement either.
    assert.equal((await env.rpc(C,'finish',{id,winner:2,why:'Score'})).status,'active');
    assert.deepEqual(await state(id),{status:'active',winner:null,over_reason:null});
    // The second matching claim ends it, with the winner and the reason they sent.
    const done=await env.rpc(A,'finish',{id,winner:1,why:'Conquest'});
    assert.deepEqual([done.status,done.winner,done.over_reason],['completed',1,'Conquest']);
    await rejects(send(env,A,id,'end-turn'),/not running/);
    assert.ok((await env.rpc(A,'list')).some(x=>x.id===id&&x.status==='completed'));
    assert.equal((await env.rpc(C,'finish',{id,winner:2,why:'late'})).winner,1,'a finished game stays as it ended');
    // Claims that do not count: a seat that is not in the game, nonsense, a CPU-run seat, a seat that never joined.
    const h=await startedGame(env);
    for(const winner of [7,-1,'x',null,1.5]) await env.rpc(A,'finish',{id:h.id,winner,why:'x'});
    assert.deepEqual(await claims(h.id),[],'only a seat that is in the game can be named');
    await env.admin("update bored_live.seats set controller='cpu' where game_id=$1 and seat=1",[h.id]);
    await env.rpc(B,'finish',{id:h.id,winner:0,why:'x'});
    assert.deepEqual(await claims(h.id),[],'a seat a CPU is playing sends no claim');
    await rejects(env.rpc(E,'finish',{id:h.id,winner:0,why:'x'}),/not in this game/);
    await rejects(env.rpc(F,'finish',{id:h.id,winner:0,why:'x'}),/Join Bored Together first/);
    // With one human left seated as human, that one is enough. Here A and C remain, then only A.
    await env.rpc(A,'finish',{id:h.id,winner:0,why:'Conquest'});
    assert.equal((await state(h.id)).status,'active');
    await env.admin("update bored_live.seats set controller='cpu' where game_id=$1 and seat=2",[h.id]);
    assert.equal((await env.rpc(A,'finish',{id:h.id,winner:0,why:'Conquest'})).status,'completed');
    // A lone claim counts again when the other humans leave afterwards (a takeover re-reads the claims).
    const k=await startedGame(env);
    assert.equal((await env.rpc(A,'finish',{id:k.id,winner:1,why:'Score'})).status,'active');
    await send(env,B,k.id,'cpu-takes-over',{seat:1});
    assert.equal((await state(k.id)).status,'active','C is still here');
    await send(env,C,k.id,'cpu-takes-over',{seat:2});
    assert.deepEqual(await state(k.id),{status:'completed',winner:1,over_reason:'Score'});
    // The claims are server business: no direct reads, no helper calls.
    await rejects(env.asUser(A,'select * from bored_live.finish_claims'),/permission denied/);
    await rejects(env.asUser(A,'select bored_live.settle_finish($1)',[k.id]),/permission denied/);
    // A co-op room is checked the same way.
    const co=await startedGame(env,{mode:'coop'});
    assert.equal((await env.rpc(A,'finish',{id:co.id,winner:1,why:'Your team won'})).status,'active');
    assert.equal((await env.rpc(B,'finish',{id:co.id,winner:2,why:'Your team lost'})).status,'active','disagreeing claims do not end it');
    const won=await env.rpc(C,'finish',{id:co.id,winner:1,why:'Your team won'});
    assert.deepEqual([won.status,won.winner],['completed',1]);
  });

  await t.test('rate limits: sending, and creating games',async()=>{
    const g=await startedGame(env);
    const id=g.id;
    const bucket=async(user,name,uses)=>env.admin("insert into bored_together.limits(user_id,bucket,window_start,uses) values($1,$2,to_timestamp(floor(extract(epoch from now())/$3)*$3),$4) on conflict(user_id,bucket,window_start) do update set uses=$4",[user,name,name==='live-create'?3600:60,uses]);
    await bucket(B,'live-send',299);
    await send(env,B,id,'unit-fortify',{unit:1}); // the 300th this minute
    await rejects(send(env,B,id,'unit-fortify',{unit:2}),/Too many requests/);
    // A retry of something that already landed is free, even over the limit.
    const rid=randomUUID();
    await bucket(C,'live-send',250);
    const landed=await send(env,C,id,'unit-fortify',{unit:1},rid);
    await bucket(C,'live-send',9999);
    assert.deepEqual((await send(env,C,id,'unit-fortify',{unit:1},rid)).seq,landed.seq);
    // Reading is limited separately and more loosely.
    await bucket(A,'live-send',9999);
    assert.equal((await env.rpc(A,'sync',{id,after:0})).head>0,true);
    await bucket(A,'live',900);
    await rejects(env.rpc(A,'sync',{id,after:0}),/Too many requests/);
    await bucket(E,'live-create',20);
    await rejects(env.rpc(E,'create',{game:'ashcrown',invite:[D]}),/Too many requests/);
    await env.admin("delete from bored_together.limits where bucket like 'live%'");
  });

  await t.test('too many open games at once',async()=>{
    await env.admin("delete from bored_live.games where host=$1",[D]);
    for(let i=0;i<5;i++) await env.rpc(D,'create',{game:'ashcrown',invite:[E]});
    await rejects(env.rpc(D,'create',{game:'ashcrown',invite:[E]}),/too many live games/);
    await env.admin("delete from bored_live.games where host=$1",[D]);
  });

  await t.test('co-op: the mode setup is checked, and pings reach seated players of a co-op room only, never the action log',async()=>{
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{mode:'teams'}}),/Invalid setup/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{mode:3}}),/Invalid setup/);
    await rejects(env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{mode:null}}),/Invalid setup/);
    const lobby=await env.rpc(A,'create',{game:'ashcrown',invite:[B],config:{map:'pangaea',mode:'coop'}});
    assert.equal((await env.admin('select config from bored_live.games where id=$1',[lobby.id]))[0].config.mode,'coop','the setup keeps the mode');
    await rejects(env.rpc(A,'ping',{id:lobby.id,x:3,y:3}),/not running/);
    await env.rpc(A,'leave_lobby',{id:lobby.id});
    const ffa=await env.rpc(A,'create',{game:'ashcrown',invite:[B,C],config:{map:'pangaea',cpus:1,mode:'ffa'}});
    await env.rpc(B,'join',{id:ffa.id}); await env.rpc(C,'join',{id:ffa.id});
    await env.rpc(B,'lobby_set',{id:ffa.id,ready:true,civ:'ember'}); await env.rpc(C,'lobby_set',{id:ffa.id,ready:true,civ:'tide'});
    await env.rpc(A,'start',{id:ffa.id});
    await rejects(env.rpc(A,'ping',{id:ffa.id,x:3,y:3}),/Pings are for co-op games/);
    await rejects(env.rpc(A,'pings',{id:ffa.id}),/Pings are for co-op games/);
    await env.rpc(A,'leave',{id:ffa.id}).catch(()=>{});
    await env.admin("update bored_live.games set status='completed' where id=$1",[ffa.id]);

    const g=await startedGame(env,{mode:'coop'});
    const id=g.id;
    assert.equal(g.config.mode,'coop','the room hands the mode to every client');
    const before=await env.rpc(A,'sync',{id,after:0});
    const mine=await env.rpc(A,'ping',{id,x:4,y:7});
    assert.ok(Number(mine.id)>0);
    const theirs=await env.rpc(C,'ping',{id,x:12,y:2});
    assert.ok(Number(theirs.id)>Number(mine.id));
    // A teammate reads them by polling, in order, from where they left off, with the seat from the caller.
    const seen=await env.rpc(B,'pings',{id});
    assert.deepEqual(seen.pings.map(p=>[p.seat,p.x,p.y]),[[0,4,7],[2,12,2]]);
    assert.equal(Number(seen.head),Number(theirs.id));
    assert.deepEqual((await env.rpc(B,'pings',{id,after:Number(mine.id)})).pings.map(p=>[p.seat,p.x,p.y]),[[2,12,2]]);
    assert.deepEqual((await env.rpc(B,'pings',{id,after:Number(theirs.id)})).pings,[]);
    // A ping is not an action: the log, the round and the hashes are exactly as they were.
    const after=await env.rpc(A,'sync',{id,after:0});
    assert.deepEqual([after.head,after.round,(after.actions||[]).length],[before.head,before.round,(before.actions||[]).length]);
    assert.equal((await env.admin('select count(*)::int n from bored_live.actions where game_id=$1',[id]))[0].n,0);
    assert.equal((await env.admin('select count(*)::int n from bored_live.hashes where game_id=$1',[id]))[0].n,0);
    // Bad input and wrong callers.
    for(const bad of [{x:-1,y:3},{x:'3',y:3},{x:3},{y:3},{x:256,y:3},{x:3,y:1000},{x:1.5,y:3},{x:null,y:3},{x:[3],y:3},{}])
      await rejects(env.rpc(A,'ping',{id,...bad}),/Invalid request/);
    await rejects(env.rpc(A,'pings',{id,after:-1}),/Invalid request/);
    await rejects(env.rpc(A,'pings',{id,after:'1'}),/Invalid request/);
    await rejects(env.rpc(A,'ping',{x:3,y:3}),/Invalid request/);
    await rejects(env.rpc(A,'ping',{id:'not-a-uuid',x:3,y:3}),/Invalid request/);
    await rejects(env.rpc(A,'ping',{id:randomUUID(),x:3,y:3}),/not found/);
    await rejects(env.rpc(E,'ping',{id,x:3,y:3}),/not in this game/);
    await rejects(env.rpc(E,'pings',{id}),/not in this game/);
    await rejects(env.rpc(F,'ping',{id,x:3,y:3}),/Join Bored Together first/);
    await rejects(env.rpc(ANON,'ping',{id,x:3,y:3}),/Sign in to your Bored account/);
    await rejects(env.rpc(null,'ping',{id,x:3,y:3}),/permission denied/);
    // Old pings: not served after fifteen seconds, and dropped as a new one comes in after a minute.
    await env.admin("update bored_live.pings set at=now()-interval '20 seconds' where game_id=$1",[id]);
    assert.deepEqual((await env.rpc(B,'pings',{id})).pings,[]);
    await env.admin("update bored_live.pings set at=now()-interval '2 minutes' where game_id=$1",[id]);
    await env.rpc(B,'ping',{id,x:1,y:1});
    assert.deepEqual((await env.admin('select seat,x,y from bored_live.pings where game_id=$1 order by id',[id])).map(r=>[r.seat,r.x,r.y]),[[1,1,1]]);
    // A seated player's direct read (Realtime reads as the subscriber); nobody else's, and no writes at all.
    assert.equal((await env.asUser(B,'select id from bored_live.pings where game_id=$1',[id])).length,1);
    assert.equal((await env.asUser(E,'select id from bored_live.pings where game_id=$1',[id])).length,0);
    await rejects(env.asUser(null,'select id from bored_live.pings'),/permission denied/);
    await rejects(env.asUser(B,'insert into bored_live.pings(game_id,seat,x,y) values($1,1,1,1)',[id]),/permission denied/);
    await rejects(env.asUser(B,'update bored_live.pings set x=2'),/permission denied/);
    await rejects(env.asUser(B,'delete from bored_live.pings'),/permission denied/);
    await rejects(env.asUser(null,"select bored_live.ping_api('ping',jsonb_build_object('id',$1::text,'x',1,'y',1))",[id]),/permission denied/);
    // Pings are rate limited on their own, far below the action limit.
    let sent=0,limited=false;
    try { for(;sent<30;sent++) await env.rpc(A,'ping',{id,x:2,y:2}); } catch(error) { limited=/Too many requests/.test(error.message); }
    assert.ok(limited&&sent>=6&&sent<=16,'stopped after '+sent);   // eight a window, and A pinged once above
    await env.admin("delete from bored_together.limits where bucket like 'live%'");
    // Ending the game takes its pings with it when the room is cleaned up.
    await env.rpc(B,'finish',{id,winner:1,why:'Conquest'});
    await env.rpc(A,'finish',{id,winner:1,why:'Conquest'});
    await rejects(env.rpc(A,'ping',{id,x:3,y:3}),/not running/);
    await env.admin("delete from bored_live.games where id=$1",[id]);
    assert.equal((await env.admin('select count(*)::int n from bored_live.pings where game_id=$1',[id]))[0].n,0);
  });

  await t.test('nothing outside the RPC is open: tables, other users rows, and the schema',async()=>{
    const g=await startedGame(env);
    const id=g.id;
    await send(env,A,id,'unit-fortify',{unit:1});
    // The one direct grant: seated players read their own game's actions (Realtime reads as the subscriber).
    assert.equal((await env.asUser(B,'select seq from bored_live.actions where game_id=$1',[id])).length,1);
    assert.equal((await env.asUser(E,'select seq from bored_live.actions where game_id=$1',[id])).length,0);
    await rejects(env.asUser(null,'select seq from bored_live.actions where game_id=$1',[id]),/permission denied/);
    await rejects(env.asUser(B,"insert into bored_live.actions(game_id,seq,seat,type,request_id) values($1,99,1,'x',gen_random_uuid())",[id]),/permission denied/);
    await rejects(env.asUser(B,'update bored_live.actions set seat=3'),/permission denied/);
    await rejects(env.asUser(B,'delete from bored_live.actions'),/permission denied/);
    for(const table of ['games','seats','snapshots','hashes','desyncs','presence','finish_claims']) await rejects(env.asUser(B,`select * from bored_live.${table}`),/permission denied/);
    await rejects(env.asUser(B,'select bored_live.cleanup()'),/permission denied/);
    await rejects(env.asUser(null,"select bored_live.api('list','{}'::jsonb)"),/permission denied/);
    const rls=await env.admin("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='bored_live' and relkind='r' order by relname");
    assert.deepEqual(rls.map(r=>r.relname),['actions','desyncs','finish_claims','games','hashes','pings','presence','seats','snapshots']);
    assert.ok(rls.every(r=>r.relrowsecurity===true));
  });

  await t.test('cleanup removes stale rooms and keeps live ones',async()=>{
    const stale=await env.rpc(A,'create',{game:'ashcrown',invite:[B]});
    const fresh=await env.rpc(A,'create',{game:'ashcrown',invite:[C]});
    await env.admin("update bored_live.games set updated_at=now()-interval '3 days' where id=$1",[stale.id]);
    await env.admin('select bored_live.cleanup()');
    const left=(await env.admin('select id from bored_live.games where id in ($1,$2)',[stale.id,fresh.id])).map(r=>r.id);
    assert.deepEqual(left,[fresh.id]);
  });
}

test('live games on PGlite: rooms, ordered log, takeover, timer, snapshots, limits',async t=>{
  const env=await pgliteEnv();
  await functional(t,env);
});

test('live games on native PostgreSQL: the same scenarios',{skip:!url},async t=>{
  const env=await nativeEnv();
  t.after(()=>env.close());
  await functional(t,env);
});

test('native PostgreSQL: sequence numbers are gap-free under concurrent sends',{skip:!url},async t=>{
  const env=await nativeEnv();
  t.after(()=>env.close());
  const g=await startedGame(env,{timer:0});
  const id=g.id;
  const players=[A,B,C];
  // Three players send twenty actions each, as fast as they can, at the same time.
  const results=await Promise.all(players.map(async(user,i)=>{
    const got=[];
    for(let n=0;n<20;n++) got.push(await send(env,user,id,'unit-fortify',{from:i,n}));
    return got;
  }));
  const seqs=results.flat().map(r=>r.seq).sort((a,b)=>a-b);
  assert.deepEqual(seqs,Array.from({length:60},(_,i)=>i+1),'every number once, none skipped');
  const log=await env.admin('select seq,seat,args from bored_live.actions where game_id=$1 order by seq',[id]);
  assert.equal(log.length,60);
  assert.equal((await env.admin('select head from bored_live.games where id=$1',[id]))[0].head,60);
  // Each player's own actions keep the order they were sent in.
  for(let i=0;i<players.length;i++) assert.deepEqual(log.filter(r=>r.seat===i).map(r=>r.args.n),Array.from({length:20},(_,n)=>n));
  // A client that reads in pages gets the same log in order.
  let after=0;const paged=[];
  for(;;) {
    const page=await env.rpc(B,'sync',{id,after,limit:25});
    if(!page.actions.length) break;
    paged.push(...page.actions.map(a=>a.seq));
    after=page.actions[page.actions.length-1].seq;
  }
  assert.deepEqual(paged,Array.from({length:60},(_,i)=>i+1));
});

test('native PostgreSQL: concurrent retries and takeovers append once',{skip:!url},async t=>{
  const env=await nativeEnv();
  t.after(()=>env.close());
  const g=await startedGame(env,{timer:60});
  const id=g.id;
  const rid=randomUUID();
  const same=await Promise.all(Array.from({length:6},()=>send(env,A,id,'end-turn',{},rid)));
  assert.equal(new Set(same.map(r=>r.seq)).size,1);
  assert.equal(same.filter(r=>!r.duplicate).length,1);
  assert.equal((await env.admin('select count(*)::int n from bored_live.actions where game_id=$1',[id]))[0].n,1);
  // Everyone notices at once that B has gone quiet: one takeover lands.
  await env.admin("update bored_live.games set started_at=now()-interval '5 minutes' where id=$1",[id]);
  await env.admin("update bored_live.presence set seen_at=now()-interval '2 minutes' where game_id=$1 and user_id=$2",[id,B]);
  await env.admin("update bored_live.presence set joined_at=now()-interval '5 minutes' where game_id=$1 and user_id in ($2,$3)",[id,A,C]);
  const takeovers=await Promise.all([A,C,A,C].map(u=>send(env,u,id,'cpu-takes-over',{seat:1})));
  assert.equal(new Set(takeovers.map(r=>r.seq)).size,1);
  assert.equal((await env.admin("select count(*)::int n from bored_live.actions where game_id=$1 and type='cpu-takes-over'",[id]))[0].n,1);
  // Everyone notices the timer at once: one timeout lands.
  await env.admin("update bored_live.games set round_at=now()-interval '2 minutes' where id=$1",[id]);
  const timeouts=await Promise.all([A,C,A,C].map(u=>send(env,u,id,'timeout',{round:1})));
  assert.equal(new Set(timeouts.map(r=>r.seq)).size,1);
  assert.equal((await env.admin("select count(*)::int n from bored_live.actions where game_id=$1 and type='timeout'",[id]))[0].n,1);
  const log=await env.admin('select seq from bored_live.actions where game_id=$1 order by seq',[id]);
  assert.deepEqual(log.map(r=>r.seq),[1,2,3]);
});

test('the live migration is purely additive',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109120000_together_live_ashcrown.sql'),'utf8');
  assert.ok(!/\b(drop|truncate)\s+(table|schema|function)/i.test(sql),'no drops');
  assert.ok(!/alter\s+table\s+bored_together/i.test(sql),'the async tables are untouched');
  assert.ok(!/(create|replace)\s+function\s+(public\.bt_rpc|bored_together\.api)/i.test(sql),'the async API is untouched');
  assert.match(sql,/create function public\.bt_live_rpc/);
});

test('the co-op migration only adds: a new table and function, a wider setup check, the same entry point',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109150000_together_live_coop.sql'),'utf8');
  assert.ok(!/\b(drop|truncate)\s+(table|schema|function)/i.test(sql),'no drops');
  assert.deepEqual([...sql.matchAll(/alter\s+table\s+([\w.]+)/gi)].map(m=>m[1]),['bored_live.pings'],'no existing table is altered, only the new one');
  assert.ok(!/(create|replace)\s+function\s+bored_live\.api\b/i.test(sql),'the action API is not replaced, so migration order does not matter');
  assert.ok(!/(create|replace)\s+function\s+(public\.bt_rpc|bored_together\.api)/i.test(sql),'the async API is untouched');
  assert.deepEqual([...sql.matchAll(/create or replace function ([\w.]+)/gi)].map(m=>m[1]).sort(),['bored_live.clean_config','public.bt_live_rpc']);
  assert.match(sql,/create function bored_live\.ping_api/);
  assert.match(sql,/create table bored_live\.pings/);
  assert.match(sql,/function public\.bt_live_rpc\(action text,args jsonb default '\{\}'\) returns jsonb/);
});

test('the 5.1.1 migration only adds: one table, one helper, the same entry point with three checks',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109190000_together_live_checks.sql'),'utf8');
  assert.ok(!/\b(drop|truncate)\s+(table|schema|function)/i.test(sql),'no drops');
  assert.deepEqual([...sql.matchAll(/alter\s+table\s+([\w.]+)/gi)].map(m=>m[1]),['bored_live.finish_claims'],'no existing table is altered, only the new one');
  assert.deepEqual([...sql.matchAll(/create or replace function ([\w.]+)/gi)].map(m=>m[1]).sort(),['bored_live.api','bored_live.settle_finish']);
  assert.ok(!/function\s+(public\.bt_live_rpc|bored_live\.(ping_api|clean_config))/i.test(sql),'the co-op pieces from 5.1 are not touched');
  assert.match(sql,/create table if not exists bored_live\.finish_claims/);
  assert.match(sql,/revoke all on function bored_live\.settle_finish\(uuid\) from public,anon,authenticated/);
  assert.match(sql,/grant execute on function bored_live\.api\(text,jsonb\) to authenticated/);
  // It carries the whole of bored_live.api, so it must still know every action the 5.0 one did.
  const first=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261109120000_together_live_ashcrown.sql'),'utf8');
  const actions=text=>text.match(/if action not in \(([^)]*)\)/)[1];
  assert.equal(actions(sql),actions(first));
  // And the migrations still sort in the order they must run.
  const names=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(f=>/together_live_(ashcrown|coop|checks)/.test(f)).sort();
  assert.deepEqual(names,['20261109120000_together_live_ashcrown.sql','20261109150000_together_live_coop.sql','20261109190000_together_live_checks.sql']);
});

// Live games, room codes (Civ Lite 5.4), server side: the code a host shares and the three actions around it
// (join_code, new_code, kick). The same scenarios run on PGlite (production SQL on Postgres WASM) and, when
// BT_TEST_DATABASE_URL points at a disposable server, on native PostgreSQL, where the last-seat race needs real
// simultaneous sessions. Never point it at production: the native run refuses a Supabase host.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pgliteEnv,nativeEnv,url,ids}=require('./together-live-env.cjs');
const [A,B,C,D,E,F,ANON]=ids; // A hosts; B, C, D, E are Together members; F never joined Together; ANON is anonymous
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE=new RegExp(`^[${ALPHABET}]{6}$`);
const NO_ROOM={ok:false,error:'No open room with that code'};
const FULL={ok:false,error:'That room is full'};
const STARTED={ok:false,error:'That game has already started'};

const create=(env,user=A,over={})=>env.rpc(user,'create',{game:'ashcrown',capacity:2,config:{map:'pangaea'},...over});
const joinCode=(env,user,code)=>env.rpc(user,'join_code',{code});
const refused=(promise,pattern)=>assert.rejects(promise,pattern);
const handles=g=>g.seats.map(s=>s.handle);

async function scenarios(t,env) {
  t.beforeEach(async()=>{
    await env.admin("update bored_live.games set status='completed', code=null where status in ('lobby','active')");
    await env.admin('delete from bored_together.limits');
    await env.admin('delete from bored_together.blocks');
  });

  await t.test('create: the host gets a code and a capacity; nobody has to be invited',async()=>{
    const g=await create(env);
    assert.match(g.code,CODE);
    assert.equal(g.capacity,2);
    assert.equal(g.status,'lobby');
    assert.deepEqual(g.seats.map(s=>[s.seat,s.state]),[[0,'joined']]);
    // Capacity is two to four human seats, and invitations have to fit in them.
    for(const bad of [1,5,0,'3',2.5,true,{}]) await refused(create(env,A,{capacity:bad}),/two to four human players/);
    await refused(create(env,A,{capacity:2,invite:[B,C]}),/more invitations than seats/);
    await refused(create(env,A,{capacity:4,invite:[B,C,D,E]}),/Invite up to three/);
    const four=await create(env,A,{capacity:4,invite:[B,C,D]});
    assert.equal(four.capacity,4);
    assert.deepEqual(four.seats.map(s=>s.state),['joined','invited','invited','invited']);
    assert.match(four.code,CODE);
    // A screen that does not send a capacity (5.0 to 5.3) gets a room as big as its invitations, as before.
    const old=await env.rpc(A,'create',{game:'ashcrown',invite:[B,C]});
    assert.equal(old.capacity,3);
    assert.match(old.code,CODE);
    assert.equal((await env.rpc(A,'create',{game:'ashcrown',invite:null})).capacity,2);
  });

  await t.test('codes use only the alphabet and are unique among rooms in the lobby',async()=>{
    // The generator itself: only alphabet characters, and every one of them turns up (secure random, no bias to speak of).
    const rows=await env.admin('select bored_live.new_room_code() c from generate_series(1,3000)');
    const seen={};
    for(const {c} of rows) {
      assert.match(c,CODE);
      for(const ch of c) seen[ch]=(seen[ch]||0)+1;
    }
    assert.equal(Object.keys(seen).length,32);
    for(const ch of ALPHABET) assert.ok(seen[ch]>350 && seen[ch]<780,`${ch} turned up ${seen[ch]} times in 18000`);
    for(const lookalike of '01IO') assert.ok(!(lookalike in seen));
    // Rooms made by different hosts all differ.
    const made=[];
    for(const u of [A,B,C,D,E]) for(let i=0;i<4;i++) made.push((await create(env,u)).code);
    assert.equal(new Set(made).size,made.length);
    // The database says so as well: no two rooms in the lobby share a code, but a started game's code is free again.
    const [one,two]=made;
    await env.admin("update bored_live.games set code=null where status='lobby'");
    await env.admin("update bored_live.games set code='ABCDEF' where code is null and status='lobby' and id=(select id from bored_live.games where status='lobby' limit 1)");
    await refused(env.admin("update bored_live.games set code='ABCDEF' where status='lobby' and code is null"),/live_games_open_code|duplicate key/);
    await env.admin("update bored_live.games set code=null where code='ABCDEF'");
    assert.ok(one&&two);
    await refused(env.admin("update bored_live.games set code='abc' where status='lobby' and code is null"),/check|violates/);
  });

  await t.test('assign_code draws again when a code is taken',async()=>{
    // Stand in for the generator: the first two draws are a code an open room already holds.
    const holder=await create(env,B);
    await env.admin("update bored_live.games set code='ZZZZZZ' where id=$1",[holder.id]);
    await env.admin('create sequence bored_live.test_draws');
    await env.admin('alter function bored_live.new_room_code() rename to new_room_code_real');
    await env.admin(`create function bored_live.new_room_code() returns text language plpgsql set search_path='' as $$
      begin if nextval('bored_live.test_draws')<=2 then return 'ZZZZZZ'; end if; return bored_live.new_room_code_real(); end $$`);
    try {
      const g=await create(env,A);
      assert.match(g.code,CODE);
      assert.notEqual(g.code,'ZZZZZZ');
      assert.ok((await env.admin('select last_value::int n from bored_live.test_draws'))[0].n>=3);
      assert.equal((await env.admin("select count(*)::int n from bored_live.games where code='ZZZZZZ' and status='lobby'"))[0].n,1);
    } finally {
      await env.admin('drop function bored_live.new_room_code()');
      await env.admin('alter function bored_live.new_room_code_real() rename to new_room_code');
      await env.admin('drop sequence bored_live.test_draws');
    }
  });

  await t.test('join_code: case, spaces and dashes do not matter; the joiner is seated as joined',async()=>{
    const g=await create(env);
    const code=g.code;
    const typed=`${code.slice(0,3).toLowerCase()}-${code.slice(3).toLowerCase()}`;
    const joined=await joinCode(env,B,` ${typed} `);
    assert.equal(joined.id,g.id);
    assert.equal(joined.status,'lobby');
    assert.equal(joined.me,1);
    assert.deepEqual(joined.seats.map(s=>[s.seat,s.handle,s.state,s.team]),[[0,'WackyPenguin','joined',0],[1,'BananaWizard','joined',1]]);
    assert.equal(joined.code,code,'a joined player sees the code, to pass it on');
    // The host sees B arrive, with the code, in the same lobby view.
    const host=await env.rpc(A,'game',{id:g.id});
    assert.deepEqual(handles(host),['WackyPenguin','BananaWizard']);
    assert.equal(host.code,code);
    // Spaces and dashes anywhere, and mixed case, are the same code (a new room, so the first one is not full).
    const h=await create(env,C,{capacity:4});
    for(const form of [h.code.toLowerCase(),` ${h.code.slice(0,2)} - ${h.code.slice(2,4)} ${h.code.slice(4)} `,h.code.split('').join('-')]) {
      const r=await joinCode(env,D,form);
      assert.equal(r.id,h.id);
      await env.rpc(D,'leave_lobby',{id:h.id});
    }
    // B can ready up and the host can start, as with any lobby.
    await env.rpc(B,'lobby_set',{id:g.id,ready:true,civ:'ember'});
    const started=await env.rpc(A,'start',{id:g.id});
    assert.equal(started.status,'active');
    assert.deepEqual(started.start.seats.map(s=>s.kind),['human','human']);
  });

  await t.test('join_code: wrong, full, started, closed and blocked all get a plain answer',async()=>{
    const g=await create(env);
    const code=g.code;
    const wrong=code.replace(/./,c=>c==='A'?'B':'A');
    assert.deepEqual(await joinCode(env,B,wrong),NO_ROOM);
    for(const junk of ['',' ','x','!!!!!!','ABCDE','ABCDEFG','0O1I22',null]) assert.deepEqual(await env.rpc(B,'join_code',{code:junk}),NO_ROOM);
    await env.admin('delete from bored_together.limits');
    for(const junk of [12,{},[]]) assert.deepEqual(await env.rpc(B,'join_code',{code:junk}),NO_ROOM);
    assert.deepEqual(await env.rpc(B,'join_code',{}),NO_ROOM);
    await env.admin('delete from bored_together.limits');
    // Full: capacity two, B is in.
    assert.equal((await joinCode(env,B,code)).me,1);
    assert.deepEqual(await joinCode(env,C,code),FULL);
    assert.deepEqual(await joinCode(env,C,code.toLowerCase()),FULL);
    // A seat held for somebody invited by name counts as taken; that person can still use the code.
    const inv=await create(env,C,{capacity:2,invite:[D]});
    assert.deepEqual(await joinCode(env,E,inv.code),FULL);
    const viaCode=await joinCode(env,D,inv.code);
    assert.equal(viaCode.seats[1].state,'joined');
    // Started: the code is cleared, and a late joiner is told so.
    await env.rpc(B,'lobby_set',{id:g.id,ready:true});
    await env.rpc(A,'start',{id:g.id});
    assert.deepEqual(await joinCode(env,E,code),STARTED);
    assert.equal((await env.admin('select code from bored_live.games where id=$1',[g.id]))[0].code,null);
    // A room whose host left is closed.
    const gone=await create(env,D);
    await env.rpc(D,'leave_lobby',{id:gone.id});
    assert.deepEqual(await joinCode(env,E,gone.code),NO_ROOM);
    // Blocked, either way round, gets what a wrong code gets, and no seat.
    const room=await create(env,A,{capacity:4});
    await env.admin('insert into bored_together.blocks(blocker,blocked) values($1,$2)',[A,E]);
    assert.deepEqual(await joinCode(env,E,room.code),NO_ROOM);
    await env.admin('delete from bored_together.blocks');
    await env.admin('insert into bored_together.blocks(blocker,blocked) values($1,$2)',[E,A]);
    assert.deepEqual(await joinCode(env,E,room.code),NO_ROOM);
    assert.equal((await env.admin('select count(*)::int n from bored_live.seats where game_id=$1 and user_id=$2',[room.id,E]))[0].n,0);
    await env.admin('delete from bored_together.blocks');
    assert.equal((await joinCode(env,E,room.code)).me,1);
    // Only signed-in Together members can try codes at all.
    await refused(joinCode(env,F,room.code),/Join Bored Together first/);
    await refused(joinCode(env,ANON,room.code),/Sign in to your Bored account/);
    await refused(joinCode(env,null,room.code),/permission denied/);
  });

  await t.test('join_code: a lobby left alone for a day is closed, with or without the cleanup',async()=>{
    const g=await create(env);
    await env.admin("update bored_live.games set updated_at=now()-interval '25 hours' where id=$1",[g.id]);
    assert.deepEqual(await joinCode(env,B,g.code),NO_ROOM);
    await env.admin('select bored_live.cleanup()');
    const row=(await env.admin('select status,code from bored_live.games where id=$1',[g.id]))[0];
    assert.equal(row.status,'cancelled');
    assert.equal(row.code,null);
    // A lobby people are still using is kept: joining counts as touching it.
    const live=await create(env,C);
    await env.admin("update bored_live.games set updated_at=now()-interval '23 hours' where id=$1",[live.id]);
    await joinCode(env,D,live.code);
    await env.admin('select bored_live.cleanup()');
    assert.equal((await env.admin('select status from bored_live.games where id=$1',[live.id]))[0].status,'lobby');
    // The old retention rules stand: a lobby older than two days goes altogether.
    const old=await create(env,E);
    await env.admin("update bored_live.games set updated_at=now()-interval '3 days' where id=$1",[old.id]);
    await env.admin('select bored_live.cleanup()');
    assert.equal((await env.admin('select count(*)::int n from bored_live.games where id=$1',[old.id]))[0].n,0);
  });

  await t.test('the rate limit stops guessing: ten tries a minute, wrong ones included',async()=>{
    const g=await create(env);
    for(let i=0;i<10;i++) assert.deepEqual(await joinCode(env,B,'AAAAAA'),NO_ROOM);
    // The eleventh is refused, and so is the right code until the minute is over.
    await refused(joinCode(env,B,'AAAAAA'),/Too many requests/);
    await refused(joinCode(env,B,g.code),/Too many requests/);
    assert.equal((await env.admin('select count(*)::int n from bored_live.seats where game_id=$1',[g.id]))[0].n,1);
    // The count is per player: somebody else is not locked out by B's guesses.
    assert.equal((await joinCode(env,C,g.code)).me,1);
    // A new minute starts fresh.
    await env.admin('delete from bored_together.limits');
    assert.deepEqual(await joinCode(env,B,'AAAAAA'),NO_ROOM);
  });

  await t.test('join_code: the host, a player already in, and somebody who left and comes back',async()=>{
    const g=await create(env,A,{capacity:3,invite:[D]});
    // The host typing their own code, and an invited player using it, just open the room.
    const own=await joinCode(env,A,g.code);
    assert.deepEqual(own.seats.map(s=>s.state),['joined','invited']);
    assert.equal((await joinCode(env,D,g.code)).seats[1].state,'joined');
    await env.rpc(D,'lobby_set',{id:g.id,ready:true,civ:'tide'});
    assert.equal((await joinCode(env,D,g.code)).seats[1].state,'ready','a player who is ready stays ready');
    // B joins, leaves, and comes back with the code into the seat they had.
    await joinCode(env,B,g.code);
    const left=await env.rpc(B,'leave_lobby',{id:g.id});
    assert.equal(left.status,'lobby');
    await refused(env.rpc(B,'game',{id:g.id}),/not in this game/);
    const back=await joinCode(env,B,g.code);
    assert.equal(back.me,2);
    assert.equal(back.seats.filter(s=>s.user===B).length,1);
    assert.equal(back.seats[2].state,'joined');
    // The seat of someone who left makes room for the next player.
    await env.rpc(B,'leave_lobby',{id:g.id});
    assert.equal((await joinCode(env,E,g.code)).seats.filter(s=>s.state!=='left').length,3);
    assert.deepEqual(await joinCode(env,B,g.code),FULL);
  });

  await t.test('who sees the code: the host, and players who joined; nobody else, and nobody after the start',async()=>{
    const g=await create(env,A,{capacity:4,invite:[C]});
    const code=g.code;
    const seen=obj=>JSON.stringify(obj).includes(code);
    // Host: in the room and in the list.
    assert.equal((await env.rpc(A,'game',{id:g.id})).code,code);
    assert.equal((await env.rpc(A,'list')).find(x=>x.id===g.id).code,code);
    // An invited player who has not joined has the invitation, not the code.
    assert.ok(!seen(await env.rpc(C,'game',{id:g.id})));
    assert.ok(!seen(await env.rpc(C,'list')));
    // A stranger sees nothing: not the room, not in a list, not by asking for it.
    await refused(env.rpc(E,'game',{id:g.id}),/not in this game/);
    assert.ok(!seen(await env.rpc(E,'list')));
    await refused(env.rpc(E,'new_code',{id:g.id}),/not in this game/);
    await refused(env.rpc(E,'kick',{id:g.id,seat:0}),/not in this game/);
    // A player who joined sees it in the room (to pass it on), but a list does not repeat it.
    await joinCode(env,B,code);
    assert.equal((await env.rpc(B,'game',{id:g.id})).code,code);
    assert.ok(!seen(await env.rpc(B,'list')));
    assert.ok(!('code' in (await env.rpc(B,'list')).find(x=>x.id===g.id)));
    // Joining the room as an invited player makes the code theirs to see as well.
    await env.rpc(C,'join',{id:g.id});
    assert.equal((await env.rpc(C,'game',{id:g.id})).code,code);
    // Heartbeats, lobby changes and the other actions never carry it either.
    assert.ok(!seen(await env.rpc(B,'heartbeat',{id:g.id})));
    // After the start nobody sees it, the host included, and the table has none.
    await env.rpc(B,'lobby_set',{id:g.id,ready:true});
    await env.rpc(C,'lobby_set',{id:g.id,ready:true});
    const started=await env.rpc(A,'start',{id:g.id});
    for(const u of [A,B,C]) {
      assert.ok(!seen(await env.rpc(u,'game',{id:g.id})));
      assert.ok(!seen(await env.rpc(u,'list')));
    }
    assert.ok(!seen(started));
    assert.equal((await env.admin('select code from bored_live.games where id=$1',[g.id]))[0].code,null);
  });

  await t.test('new_code: host only, in the lobby; the old code stops working',async()=>{
    const g=await create(env,A,{capacity:3});
    const first=g.code;
    await joinCode(env,B,first);
    await refused(env.rpc(B,'new_code',{id:g.id}),/Only the host/);
    const next=await env.rpc(A,'new_code',{id:g.id});
    assert.match(next.code,CODE);
    assert.notEqual(next.code,first);
    assert.equal(next.id,g.id);
    // The old code is as good as wrong. The new one works, and the player already in sees it too.
    assert.deepEqual(await joinCode(env,C,first),NO_ROOM);
    assert.equal((await env.rpc(B,'game',{id:g.id})).code,next.code);
    assert.equal((await joinCode(env,C,next.code)).me,2);
    assert.equal((await env.admin("select count(*)::int n from bored_live.games where code=$1 and status='lobby'",[first]))[0].n,0);
    // Not once the game is running.
    await env.rpc(B,'lobby_set',{id:g.id,ready:true});
    await env.rpc(C,'lobby_set',{id:g.id,ready:true});
    await env.rpc(A,'start',{id:g.id});
    await refused(env.rpc(A,'new_code',{id:g.id}),/already started/);
  });

  await t.test('kick: host only; the player is out, and cannot come back with that code, only a new one',async()=>{
    const g=await create(env,A,{capacity:3,invite:[D]});
    const code=g.code;
    await joinCode(env,B,code);
    await env.rpc(B,'lobby_set',{id:g.id,ready:true});
    await refused(env.rpc(B,'kick',{id:g.id,seat:2}),/Only the host/);
    await refused(env.rpc(A,'kick',{id:g.id,seat:0}),/can not remove yourself/);
    await refused(env.rpc(A,'kick',{id:g.id,seat:5}),/seat is empty/);
    await refused(env.rpc(A,'kick',{id:g.id,seat:9}),/Invalid request/);
    await refused(env.rpc(A,'kick',{id:g.id}),/Invalid request/);
    // B (joined and ready) is removed. They lose the room, the list entry and their way back in.
    const after=await env.rpc(A,'kick',{id:g.id,seat:2});
    assert.deepEqual(handles(after),['WackyPenguin','NeverJoined']);
    assert.equal(after.code,code);
    await refused(env.rpc(B,'game',{id:g.id}),/not in this game/);
    assert.ok(!(await env.rpc(B,'list')).some(x=>x.id===g.id));
    assert.deepEqual(await joinCode(env,B,code),NO_ROOM);
    assert.deepEqual(await joinCode(env,B,code.toLowerCase()),NO_ROOM);
    // The seat is free again for somebody else, with the same code.
    assert.equal((await joinCode(env,E,code)).me,2);
    // An invited player (D) can be removed too: the invitation goes, and so does the way back with the code.
    const out=await env.rpc(A,'kick',{id:g.id,seat:1});
    assert.deepEqual(handles(out),['WackyPenguin','FourthPlayer']);
    assert.ok(!(await env.rpc(D,'list')).some(x=>x.id===g.id));
    await refused(env.rpc(D,'join',{id:g.id}),/not in this game/);
    assert.deepEqual(await joinCode(env,D,code),NO_ROOM);
    // A new code lets them back in (removed once does not mean banned for good), and the table keeps nothing stale.
    await env.rpc(A,'new_code',{id:g.id});
    const fresh=(await env.rpc(A,'game',{id:g.id})).code;
    assert.equal((await joinCode(env,B,fresh)).me,1);
    assert.equal((await env.admin('select count(*)::int n from bored_live.kicks where game_id=$1',[g.id]))[0].n,0);
    // A removed player cannot slip back in by leaving and rejoining either.
    await env.rpc(A,'kick',{id:g.id,seat:1});
    assert.deepEqual(await joinCode(env,B,fresh),NO_ROOM);
    // Not once the game has started.
    await env.rpc(E,'lobby_set',{id:g.id,ready:true});
    await env.rpc(A,'start',{id:g.id});
    await refused(env.rpc(A,'kick',{id:g.id,seat:1}),/already started/);
  });

  await t.test('start: the code is cleared, and human seats nobody took become CPUs, or go',async()=>{
    // Capacity four, two came: two CPUs fill the rest (the default for empty seats).
    const g=await create(env,A,{capacity:4});
    await joinCode(env,B,g.code);
    await env.rpc(B,'lobby_set',{id:g.id,ready:true});
    const s=await env.rpc(A,'start',{id:g.id});
    assert.deepEqual(s.start.seats.map(x=>x.kind),['human','human','cpu','cpu']);
    assert.equal((await env.admin('select retired_code from bored_live.games where id=$1',[g.id]))[0].retired_code,g.code);
    // 'drop' leaves the empty seats out.
    const d=await create(env,C,{capacity:4,config:{unjoined:'drop',cpus:1}});
    await joinCode(env,D,d.code);
    await env.rpc(D,'lobby_set',{id:d.id,ready:true});
    assert.deepEqual((await env.rpc(C,'start',{id:d.id})).start.seats.map(x=>x.kind),['human','human','cpu']);
    // Somebody who joined and has not said ready holds the start back, as ever; and a lone host with nobody and no CPU cannot start.
    const w=await create(env,E,{capacity:3,config:{unjoined:'drop'}});
    await refused(env.rpc(E,'start',{id:w.id}),/Add a CPU, or wait/);
    await joinCode(env,B,w.code);
    await refused(env.rpc(E,'start',{id:w.id}),/has to be ready/);
    // Seats of people who left the lobby, invited seats and the rest all end up as CPUs with 'cpu'.
    const k=await create(env,A,{capacity:4,invite:[C]});
    await joinCode(env,D,k.code);
    await env.rpc(D,'lobby_set',{id:k.id,ready:true});
    assert.deepEqual((await env.rpc(A,'start',{id:k.id})).start.seats.map(x=>x.kind),['human','cpu','human','cpu']);
  });

  await t.test('the code is a lobby thing: nothing else in a started game changes shape',async()=>{
    const g=await create(env,A,{capacity:2,invite:[B]});
    await env.rpc(B,'join',{id:g.id});
    await env.rpc(B,'lobby_set',{id:g.id,ready:true});
    const started=await env.rpc(A,'start',{id:g.id});
    assert.deepEqual(Object.keys(started).sort(),['capacity','config','created_at','game','head','host','id','me','over_reason','round','round_age','seats','snapshot','start','started_at','status','timer','winner']);
    const ok=await env.rpc(A,'send',{id:g.id,type:'end-turn',args:{},request_id:'11111111-1111-4111-8111-111111111111'});
    assert.equal(ok.seq,1);
  });
}

test('room codes on PGlite',async t=>{
  let env;
  try { env=await pgliteEnv(); } catch(e) { t.skip('PGlite is not installed here: '+e.message); return; }
  t.after(()=>env.close());
  await scenarios(t,env);
});

test('room codes on native PostgreSQL',{skip:!url},async t=>{
  const env=await nativeEnv();
  t.after(()=>env.close());
  await scenarios(t,env);
});

test('native PostgreSQL: two players racing for the last seat, and for a code that changes',{skip:!url},async t=>{
  const env=await nativeEnv();
  t.after(()=>env.close());
  const g=await create(env,A,{capacity:2});
  const results=await Promise.all([B,C,D,E].map(u=>joinCode(env,u,g.code)));
  assert.equal(results.filter(r=>r.id===g.id).length,1,'exactly one player gets the last seat');
  assert.equal(results.filter(r=>r.error==='That room is full').length,3);
  assert.equal((await env.admin("select count(*)::int n from bored_live.seats where game_id=$1 and state<>'left'",[g.id]))[0].n,2);
  // New code while people are using the old one: each attempt lands on one side of it, and no seat is lost or doubled.
  const h=await create(env,B,{capacity:4});
  const old=h.code;
  const mixed=await Promise.all([env.rpc(B,'new_code',{id:h.id}),joinCode(env,C,old),joinCode(env,D,old),joinCode(env,E,old)]);
  const now=mixed[0].code;
  assert.notEqual(now,old);
  for(const r of mixed.slice(1)) assert.ok(r.id===h.id||r.error==='No open room with that code');
  const seated=(await env.admin('select user_id from bored_live.seats where game_id=$1',[h.id])).length;
  assert.equal(seated,1+mixed.slice(1).filter(r=>r.id===h.id).length);
  assert.equal((await env.admin("select count(*)::int n from bored_live.games where status='lobby' and code=$1",[old]))[0].n,0);
});

test('the 5.4 migration keeps every check of bored_live.api and only changes what room codes need',()=>{
  const dir=path.join(__dirname,'../supabase/migrations');
  const sql=fs.readFileSync(path.join(dir,'20261110150000_together_live_room_codes.sql'),'utf8');
  const prev=fs.readFileSync(path.join(dir,'20261109190000_together_live_checks.sql'),'utf8');
  assert.ok(!/\b(drop|truncate)\s+(table|schema|function)/i.test(sql.replace(/--.*$/gm,'')),'no drops');
  assert.deepEqual([...sql.matchAll(/alter\s+table\s+([\w.]+)\s+add column if not exists (\w+)/gi)].map(m=>m[2]),['code','retired_code','capacity']);
  assert.deepEqual([...sql.matchAll(/create or replace function ([\w.]+)/gi)].map(m=>m[1]).sort(),
    ['bored_live.api','bored_live.assign_code','bored_live.cleanup','bored_live.game_json','bored_live.new_room_code']);
  assert.ok(!/function\s+(public\.bt_live_rpc|bored_live\.(ping_api|clean_config|settle_finish|touch))/i.test(sql),'the other live pieces are not touched');
  assert.match(sql,/grant execute on function bored_live\.api\(text,jsonb\) to authenticated/);
  assert.match(sql,/revoke all on function bored_live\.assign_code\(uuid\) from public,anon,authenticated/);
  assert.match(sql,/revoke all on function bored_live\.new_room_code\(\) from public,anon,authenticated/);
  const body=text=>text.slice(text.indexOf('create or replace function bored_live.api('),text.indexOf('revoke all on function bored_live.api'));
  const lines=text=>body(text).split('\n').map(l=>l.trim()).filter(Boolean);
  const kept=new Set(lines(sql));
  const dropped=lines(prev).filter(l=>!kept.has(l));
  // Every line of the 5.1.1 body is still there except these eight, which room codes had to reword: the list of
  // actions, the limits for the new one, the invitation rules in create, the host's room insert, the code in a list,
  // the code of a cancelled room, and the start update that retires the code.
  assert.deepEqual(dropped,[
    "if action not in ('create','list','game','join','lobby_set','leave_lobby','start','send','sync','heartbeat','snapshot','load','report','finish') then",
    "if action in ('create','list') then",
    "if jsonb_typeof(invitees) is distinct from 'array' or jsonb_array_length(invitees) not between 1 and 3 then",
    "raise exception 'Invite one to three members.';",
    "insert into bored_live.games(game,host,config) values('ashcrown',u,cfg) returning * into g;",
    "return coalesce((select jsonb_agg(bored_live.game_json(x,u) order by x.updated_at desc) from (",
    "update bored_live.games set status='cancelled', updated_at=now() where id=gid;",
    "update bored_live.games set status='active', started_at=now(), round_at=now(), updated_at=now(),"
  ],'the lines the 5.1.1 api had and this one does not');
  // The checks themselves, by name, so a rewording above can not hide the loss of one.
  for(const snippet of [
    'finish_claims','settle_finish','r<>g.round and r<>g.round+1','return jsonb_build_object(\'stored\',false,\'wait\',true)',
    "raise exception 'They are still here.'","raise exception 'The timer has not run out.'","raise exception 'That round is over.'",
    "raise exception 'Everyone who joined has to be ready.'","raise exception 'Only the host can start the game.'",
    "raise exception 'Invite each member once.'","raise exception 'That member can not be invited.'",
    "'live-create',3600,20","'live-send',60,300",'>=5 then','duplicate\',true','human-returns','cpu-takes-over'
  ]) assert.ok(body(sql).includes(snippet),`${snippet} is still in bored_live.api`);
  // The 5.1.1 file itself is as it was, and the migrations still sort in the order they must run.
  const names=fs.readdirSync(dir).filter(f=>/together_live_(ashcrown|coop|checks|room_codes)/.test(f)).sort();
  assert.deepEqual(names,['20261109120000_together_live_ashcrown.sql','20261109150000_together_live_coop.sql','20261109190000_together_live_checks.sql','20261110150000_together_live_room_codes.sql']);
  assert.match(sql,/alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'/);
  assert.match(sql,/uuid_send\(gen_random_uuid\(\)\)/);
});

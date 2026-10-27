const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {database,call,as,ids,consent,enroll,dashboard,challenge,move}=require('./together-db.cjs');

function reference(board,col,seat) {
  const next=board.slice();let row=5;while(row>=0&&next[row*7+col])row--;
  if(row<0)return null;next[row*7+col]=seat;
  const won=[...Array(6)].some((_,r)=>[...Array(7)].some((_,c)=>[[0,1],[1,0],[1,1],[1,-1]].some(([dr,dc])=>
    r+3*dr<6&&c+3*dc>=0&&c+3*dc<7&&[0,1,2,3].every(n=>next[(r+n*dr)*7+c+n*dc]===seat))));
  return {state:{board:next},won,draw:next.every(Boolean)};
}
const play=(db,m,u,value)=>call(db,u,'submit_run',{match_id:m.id,version:m.version,value,request_id:randomUUID()});

test('Together production SQL: consent, directory, blocks, moves, duels and retention',async t=>{
  const db=await database(); t.after(()=>db.close());
  const [a,b,c,non,d,e,anonymous]=ids;
  await t.test('guests and anonymous accounts cannot use the API; no automatic enrollment',async()=>{
    await assert.rejects(call(db,null,'dashboard'),/permission denied/);
    await assert.rejects(enroll(db,anonymous),/Sign in/);
    assert.deepEqual(await dashboard(db,a),{enrolled:false});
    await assert.rejects(call(db,a,'people'),/Join/);
    await assert.rejects(call(db,a,'enroll',{}),/enrollment notice/);
    assert.equal((await db.query('select count(*) n from bored_together.members')).rows[0].n,0);
    for(const u of [a,b,c,d,e])await enroll(db,u);
    const member=(await db.query('select * from bored_together.members where user_id=$1',[a])).rows[0];
    assert.equal(member.consent_version,consent.consent_version);assert.ok(member.consent_at);
    // An older consent is asked for once, because the notice now covers the
    // member directory and its email column.
    await db.query("update bored_together.members set consent_version='2026-10-25-v2' where user_id=$1",[a]);
    assert.deepEqual(await dashboard(db,a),{enrolled:false,renew:true});
    await enroll(db,a);
    assert.equal((await dashboard(db,a)).enrolled,true);
  });
  await t.test('the directory lists members by name and address and nothing else does',async()=>{
    const people=await call(db,a,'people');
    assert.deepEqual(people.map(p=>p.handle),['BananaWizard','FifthPlayer','FourthPlayer','QuietOwl']);
    assert.equal(people.find(p=>p.id===b).email,'student2@example.test');
    assert.equal(people.some(p=>p.id===a),false,'the viewer is not in their own list');
    assert.equal(people.some(p=>p.id===non),false,'nonmembers are never listed');
    // The friend list, notifications and search are gone from the surface.
    for(const action of ['search','friend_request','friend_accept','read_notifications','settings','accept','decline','cancel']) {
      await assert.rejects(call(db,a,action,{query:'Ban',user_id:b}),/Unknown operation/,action+' is retired');
    }
    // The dashboard carries no addresses, and game payloads never do either.
    const mine=await dashboard(db,a);
    assert.deepEqual(Object.keys(mine).sort(),['blocks','enrolled','matches','queue','user_id']);
    assert.ok(!JSON.stringify(mine).includes('@example.test'));
    await assert.rejects(call(db,a,'challenge',{user_id:non}),/unavailable/);
    await assert.rejects(call(db,a,'challenge',{user_id:a}),/another player/);
  });
  await t.test('all private tables and internal helpers deny direct reads/writes even to members',async()=>{
    for(const table of ['members','blocks','matches','moves','queue','limits']) {
      await assert.rejects(as(db,a,()=>db.query('select * from bored_together.'+table)),/permission denied/);
      await assert.rejects(as(db,a,()=>db.query('delete from bored_together.'+table)),/permission denied/);
    }
    await assert.rejects(as(db,a,()=>db.query('select bored_together.person($1)',[non])),/permission denied/);
    await assert.rejects(as(db,a,()=>db.query('select bored_together.finish($1,$2,$3)',[randomUUID(),a,'fake win'])),/permission denied/);
    const rows=(await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='bored_together' and relkind='r'")).rows;
    assert.equal(rows.length,6);assert.ok(rows.every(r=>r.relsecurity||r.relrowsecurity));
  });
  await t.test('blocking hides both ways, stops challenges and cancels open games',async()=>{
    const live=await move(db,await challenge(db,a,c),a,0);
    await call(db,a,'block',{user_id:c});
    assert.equal((await call(db,a,'people')).some(p=>p.id===c),false,'blocked members leave the directory');
    assert.equal((await call(db,c,'people')).some(p=>p.id===a),false,'blocking works both ways');
    await assert.rejects(call(db,c,'challenge',{user_id:a}),/unavailable/);
    assert.equal((await call(db,a,'match',{match_id:live.id})).status,'cancelled','an open game is cancelled');
    await call(db,a,'unblock',{user_id:c});
    assert.ok((await call(db,a,'people')).some(p=>p.id===c));
  });
  let finished;
  await t.test('a game starts with the challenger\'s turn and reaches the opponent on save',async()=>{
    const started=await call(db,a,'challenge',{user_id:b});
    assert.equal(started.status,'active');assert.equal(started.turn_user,a);assert.equal(started.mode,'turns');
    // Nothing has been sent yet: the opponent has no row and cannot open it.
    assert.equal((await dashboard(db,b)).matches.some(x=>x.id===started.id),false);
    await assert.rejects(call(db,b,'match',{match_id:started.id}),/unavailable/);
    await assert.rejects(call(db,c,'match',{match_id:started.id}),/unavailable/);
    await assert.rejects(move(db,started,b,0),/unavailable/);
    // Both directions can start independent games of the same type.
    const parallel=await call(db,a,'challenge',{user_id:b});
    const reverse=await call(db,b,'challenge',{user_id:a});
    assert.equal(new Set([started.id,parallel.id,reverse.id]).size,3);
    assert.equal(parallel.turn_user,a);assert.equal(reverse.turn_user,b);
    await call(db,b,'delete',{match_id:parallel.id});
    await call(db,a,'delete',{match_id:reverse.id});
    let m=await move(db,started,a,0);
    const delivered=(await dashboard(db,b)).matches.find(x=>x.id===m.id);
    assert.equal(delivered.status,'active');assert.equal(delivered.turn_user,b);
    await assert.rejects(move(db,m,b,7),/Invalid move|column/);
    await assert.rejects(move(db,m,b,null),/column|Invalid move/);
    const rid=randomUUID(), original=m;
    m=await move(db,m,b,1,{request_id:rid});
    const retry=await move(db,original,b,1,{request_id:rid});
    assert.equal(retry.version,m.version);assert.deepEqual(retry.state,m.state);
    await assert.rejects(move(db,m,b,2,{request_id:rid}),/already used/);
    await assert.rejects(move(db,m,a,2,{version:0}),/board changed/);
    m=await move(db,m,a,0);m=await move(db,m,b,1);m=await move(db,m,a,0);m=await move(db,m,b,1);m=await move(db,m,a,0);
    assert.equal(m.winner,a);assert.equal(m.status,'completed');assert.equal(m.turn_user,null);
    await assert.rejects(move(db,m,b,2),/not your turn/);
    assert.ok(!JSON.stringify(m).includes('@example.test'),'a match never carries an address');
    const reopened=await call(db,a,'match',{match_id:m.id});
    assert.deepEqual(reopened.state,m.state);assert.equal(reopened.moves.length,7);
    assert.equal(reopened.moves.filter(x=>x.actor===a).length,4);
    finished=m;
  });
  await t.test('duels give both players the same board and compare one run each',async()=>{
    const started=await call(db,a,'challenge',{user_id:b,game:'mahjong'});
    assert.equal(started.mode,'duel');assert.equal(started.turn_user,a);
    assert.deepEqual(started.state.plays,{});
    assert.ok(Number.isInteger(started.state.seed)&&started.state.seed>0,'the server chooses the board');
    assert.equal(started.state.seed,(await call(db,c,'challenge',{user_id:b,game:'mahjong'})).state.seed,'every board that day is the same');
    await call(db,c,'delete',{match_id:(await call(db,c,'dashboard')).matches.find(x=>x.game==='mahjong').id});
    // A duel is not played with moves.
    await assert.rejects(move(db,started,a,0),/run, not moves/);
    await assert.rejects(call(db,a,'submit_run',{match_id:started.id,version:started.version,value:99,request_id:randomUUID()}),/Invalid result/,'the board size is the ceiling');
    await assert.rejects(call(db,a,'submit_run',{match_id:started.id,version:started.version,value:-1,request_id:randomUUID()}),/Invalid result/);
    const mine=await play(db,started,a,12);
    assert.equal(mine.status,'active');assert.equal(mine.turn_user,b);
    // The opponent cannot see the run they have to beat, and the player keeps
    // their own submission visible.
    assert.deepEqual((await call(db,b,'match',{match_id:mine.id})).state.plays,{});
    assert.deepEqual((await call(db,a,'match',{match_id:mine.id})).state.plays,{1:12});
    await assert.rejects(play(db,mine,a,20),/not your turn/);
    const theirRun=await play(db,mine,b,20);
    assert.equal(theirRun.status,'completed');assert.equal(theirRun.winner,b);
    const both=await call(db,a,'match',{match_id:theirRun.id});
    assert.deepEqual(both.state.plays,{1:12,2:20});
    assert.match(both.reason,/Higher run on the same board/);
    // A duel cannot be reopened with moves, and a turns game cannot be scored.
    await assert.rejects(move(db,both,a,0),/run, not moves/);
    await assert.rejects(call(db,b,'submit_run',{match_id:finished.id,version:finished.version,value:1,request_id:randomUUID()}),/played by moves/);
    const draw=await play(db,await call(db,a,'challenge',{user_id:b,game:'2048'}),a,512);
    const drawn=await play(db,draw,b,512);
    assert.equal(drawn.winner,null);assert.equal(drawn.status,'completed');
    assert.match(drawn.reason,/Drew/);
  });
  await t.test('Tanks keeps the shots and bounds what one may say',async()=>{
    const started=await call(db,a,'challenge',{user_id:b,game:'tank2'});
    assert.equal(started.mode,'turns');assert.equal(started.turn_user,a);
    assert.ok(Number.isInteger(started.state.seed)&&started.state.seed>0,'the map seed comes from the server');
    assert.deepEqual(started.state.shots,[]);
    assert.equal((await call(db,b,'dashboard')).matches.some(m=>m.id===started.id),false,'an unplayed board stays private');
    // The client's move envelope is what the dispatcher stores, exactly as the
    // original game's bridge sends it.
    const shot=extra=>({match_id:started.id,version:started.version,request_id:randomUUID(),
      move:{seat:1,x:144,angle:45,power:10,weapon:'standard',won:false,...extra}});
    await assert.rejects(call(db,a,'move',shot({angle:90})),/5 and 85/);
    await assert.rejects(call(db,a,'move',shot({power:21})),/Power/);
    await assert.rejects(call(db,a,'move',shot({weapon:'laser'})),/Unknown weapon/);
    await assert.rejects(call(db,a,'move',shot({x:3})),/off the field/);
    await assert.rejects(call(db,a,'move',shot({seat:2})),/Invalid shot/);
    let m=await call(db,a,'move',shot({}));
    assert.equal(m.turn_user,b);assert.equal(m.state.shots.length,1);
    assert.deepEqual(m.state.shots[0],{seat:1,x:144,angle:45,power:10,weapon:'standard'});
    assert.equal(m.state.seed,started.state.seed,'the battlefield seed survives the shot');
    const same=await call(db,b,'match',{match_id:m.id});assert.deepEqual(same.state.shots,m.state.shots);
    await assert.rejects(call(db,a,'move',shot({version:m.version})),/not your turn/);
    // A reported kill completes the game for the player who reported it; the
    // opponent's replay is what can contradict that claim.
    const won=await call(db,b,'move',{match_id:m.id,version:m.version,request_id:randomUUID(),
      move:{seat:2,x:700,angle:50,power:12,weapon:'standard',won:true}});
    assert.equal(won.status,'completed');assert.equal(won.winner,b);assert.equal(won.reason,'Last tank standing');
    assert.equal(won.state.winner,2);assert.equal(won.state.shots.length,2);
    await assert.rejects(call(db,a,'move',{match_id:m.id,version:won.version,request_id:randomUUID(),
      move:{seat:1,x:144,angle:45,power:10,weapon:'standard'}}),/not your turn|over/);
    assert.deepEqual(await call(db,b,'delete',{match_id:m.id}),{ok:true});
    await call(db,e,'queue_join',{game:'tank2'});
    assert.deepEqual((await call(db,e,'dashboard')).queue,['tank2'],'the random queue offers it too');
    await call(db,e,'queue_cancel',{game:'tank2'});
  });
  await t.test('rematches are played first too, and either player can delete a match',async()=>{
    const rematch=await call(db,b,'rematch',{match_id:finished.id});
    assert.equal(rematch.status,'active');assert.equal(rematch.p1,b);assert.equal(rematch.turn_user,b);
    assert.equal((await call(db,a,'rematch',{match_id:finished.id})).id,rematch.id,'a rematch is created once');
    await assert.rejects(call(db,a,'match',{match_id:rematch.id}),/unavailable/,'an unplayed rematch is private');
    await move(db,rematch,b,0);
    const resigned=await call(db,a,'resign',{match_id:rematch.id});
    assert.equal(resigned.winner,b);assert.equal(resigned.reason,'Resigned');
    // Removing a game removes it for both sides and awards nothing.
    const live=await move(db,await call(db,d,'challenge',{user_id:e}),d,0);
    assert.ok((await dashboard(db,e)).matches.some(x=>x.id===live.id));
    assert.deepEqual(await call(db,e,'delete',{match_id:live.id}),{ok:true});
    assert.equal((await dashboard(db,d)).matches.some(x=>x.id===live.id),false);
    assert.equal((await db.query('select count(*) n from bored_together.matches where id=$1',[live.id])).rows[0].n,0);
    assert.equal((await db.query('select count(*) n from bored_together.moves where match_id=$1',[live.id])).rows[0].n,0);
    await assert.rejects(call(db,c,'delete',{match_id:live.id}),/unavailable/);
    // Abandoning the first turn leaves nothing behind, on either list.
    const draft=await call(db,e,'challenge',{user_id:d});
    assert.deepEqual(await call(db,e,'resign',{match_id:draft.id}),{ok:true});
    await assert.rejects(call(db,d,'match',{match_id:draft.id}),/unavailable/);
    assert.equal((await dashboard(db,e)).matches.some(x=>x.id===draft.id),false);
  });
  await t.test('random queue pairing excludes self, blocked pairs and duplicate active pairs',async()=>{
    assert.deepEqual(await call(db,c,'queue_join'),{queued:true});
    assert.deepEqual(await call(db,c,'queue_join'),{queued:true});
    await call(db,c,'block',{user_id:d});
    assert.deepEqual(await call(db,d,'queue_join'),{queued:true});
    const random=await call(db,e,'queue_join');
    assert.equal(random.p1,c);assert.equal(random.p2,e);assert.equal(random.status,'active');
    assert.ok(!JSON.stringify(random).includes('email'));
    assert.equal((await dashboard(db,c)).queue.length,0);
    assert.equal((await dashboard(db,d)).queue.length,1);
    await call(db,d,'queue_cancel');assert.equal((await dashboard(db,d)).queue.length,0);
    await call(db,c,'queue_join');await call(db,e,'queue_join');
    const count=(await db.query("select count(*) n from bored_together.matches where source='random' and status='active'")).rows[0].n;
    assert.equal(count,1);
    await call(db,c,'queue_cancel');await call(db,e,'queue_cancel');
    await call(db,c,'block',{user_id:e});
    assert.equal((await call(db,c,'match',{match_id:random.id})).status,'cancelled');
    await call(db,c,'unblock',{user_id:d});await call(db,c,'unblock',{user_id:e});
  });
  await t.test('optimistic concurrency: a duplicate version cannot commit two moves',async()=>{
    let m=await challenge(db,a,c);
    const first=await move(db,m,a,0);
    await assert.rejects(move(db,m,a,1),/not your turn|board changed/);
    assert.equal((await call(db,a,'match',{match_id:m.id})).moves.length,1);
    m=await move(db,first,c,1);
    await assert.rejects(move(db,first,a,2),/board changed/);
    assert.equal((await call(db,a,'match',{match_id:m.id})).moves.length,2);
    await call(db,a,'resign',{match_id:m.id});
  });
  await t.test('leaving drops unseen games, forfeits the rest and leaves the directory',async()=>{
    const unseen=await call(db,d,'challenge',{user_id:b});
    const active=await move(db,await challenge(db,a,d),a,0);
    await call(db,d,'queue_join');
    await call(db,d,'leave');
    assert.deepEqual(await dashboard(db,d),{enrolled:false});
    assert.deepEqual(await call(db,a,'people'),(await call(db,a,'people')).filter(p=>p.id!==d),'a departed member is unlisted');
    await assert.rejects(call(db,a,'challenge',{user_id:d}),/unavailable/);
    await assert.rejects(call(db,b,'match',{match_id:unseen.id}),/unavailable/,'an unplayed game vanishes with the player');
    assert.equal((await db.query('select count(*) n from bored_together.matches where id=$1',[unseen.id])).rows[0].n,0);
    const ended=await call(db,a,'match',{match_id:active.id});
    assert.equal(ended.status,'completed');assert.equal(ended.winner,a);
    assert.equal((await db.query('select count(*) n from bored_together.queue where user_id=$1',[d])).rows[0].n,0);
    await enroll(db,d);assert.equal((await dashboard(db,d)).enrolled,true);
  });
  await t.test('expiry, retention and stale unplayed boards',async()=>{
    const m=await move(db,await challenge(db,a,b),a,0);
    const draft=await challenge(db,c,b);
    await db.query("update bored_together.matches set created_at=now()-interval '8 days' where id=$1",[draft.id]);
    await db.query('select bored_together.cleanup()');
    await assert.rejects(call(db,c,'match',{match_id:draft.id}),/unavailable/);
    await db.query("update bored_together.matches set updated_at=now()-interval '31 days' where id=$1",[m.id]);
    await db.query('select bored_together.cleanup()');
    const expired=await call(db,a,'match',{match_id:m.id});assert.equal(expired.status,'expired');assert.equal(expired.winner,null);
    await db.query("update bored_together.matches set updated_at=now()-interval '91 days' where id=$1",[m.id]);
    await db.query('select bored_together.cleanup()');await assert.rejects(call(db,a,'match',{match_id:m.id}),/unavailable/);
  });
  await t.test('the directory has its own server-enforced budget',async()=>{
    await db.query("delete from bored_together.limits where user_id=$1",[e]);
    for(let n=0;n<30;n++)await call(db,e,'people');
    await assert.rejects(call(db,e,'people'),/Too many/);
    await db.query("delete from bored_together.limits where user_id=$1",[e]);
  });
});

test('Connect Four SQL adapter agrees with independent rules over seeded games, full columns and draws',async t=>{
  const db=await database();t.after(()=>db.close());
  let seed=42;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  let sawDraw=false;
  // Bias toward non-winning moves to exercise full-board draw and late diagonals.
  for(let game=0;game<100;game++) {
    let board=Array(42).fill(0),seat=1;
    for(let turn=0;turn<42;turn++) {
      const options=Array.from({length:7},(_,c)=>({c,r:reference(board,c,seat)})).filter(x=>x.r);
      const safe=options.filter(x=>!x.r.won), choices=safe.length?safe:options;
      const {c,r}=choices[Math.floor(rand()*choices.length)];
      const got=(await db.query('select bored_together.connect_four($1::jsonb,$2,$3) result',[JSON.stringify({board}),c,seat])).rows[0].result;
      assert.deepEqual(got,r); board=r.state.board;
      if(r.draw){sawDraw=true;break;}if(r.won)break;seat=3-seat;
    }
  }
  assert.ok(sawDraw,'exercised full board draw');
  await assert.rejects(db.query('select bored_together.connect_four($1::jsonb,0,1)',[JSON.stringify({board:Array(42).fill(1)})]),/column is full/);
});

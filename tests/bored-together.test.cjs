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

test('Together production SQL: consent, privacy, social, queue, moves and retention',async t=>{
  const db=await database(); t.after(()=>db.close());
  const [a,b,c,non,d,e,anonymous]=ids;
  await t.test('guests and anonymous accounts cannot use the API; no automatic enrollment',async()=>{
    await assert.rejects(call(db,null,'dashboard'),/permission denied/);
    await assert.rejects(enroll(db,anonymous),/Sign in/);
    assert.deepEqual(await dashboard(db,a),{enrolled:false});
    await assert.rejects(call(db,a,'search',{query:'Never'}),/Join/);
    await assert.rejects(call(db,a,'enroll',{}),/enrollment notice/);
    assert.equal((await db.query('select count(*) n from bored_together.members')).rows[0].n,0);
    for(const u of [a,b,c,d,e])await enroll(db,u);
    const member=(await db.query('select * from bored_together.members where user_id=$1',[a])).rows[0];
    assert.equal(member.consent_version,consent.consent_version);assert.ok(member.consent_at);
    // The notice grew an email column, so an older consent is shown once more
    // before the member list loads again.
    await db.query("update bored_together.members set consent_version='2026-10-25-v2' where user_id=$1",[a]);
    assert.deepEqual(await dashboard(db,a),{enrolled:false,renew:true});
    await enroll(db,a);
    assert.equal((await dashboard(db,a)).enrolled,true);
  });
  await t.test('exact email, prefix username, hidden accounts, no email leaks or wildcard enumeration',async()=>{
    assert.equal((await call(db,a,'search',{query:' STUDENT2@EXAMPLE.TEST '}))[0].handle,'BananaWizard');
    assert.equal((await call(db,a,'search',{query:'ban'}))[0].id,b);
    assert.deepEqual(await call(db,a,'search',{query:'student2@'}),[]);
    assert.deepEqual(await call(db,a,'search',{query:'student4@example.test'}),[]);
    assert.deepEqual(await call(db,a,'search',{query:'Nev'}),[]);
    assert.deepEqual(await call(db,a,'search',{query:'%%%'}),[]);
    assert.equal((await call(db,a,'search',{query:'Ban'}))[0].email,undefined);
    assert.equal((await call(db,a,'search',{query:'student2@example.test'}))[0].email,undefined,'exact email finds a member without returning the address');
    await assert.rejects(call(db,a,'search',{query:'B'}),/at least 3/);
    await assert.rejects(call(db,a,'friend_request',{user_id:non}),/unavailable/);
    await assert.rejects(call(db,a,'challenge',{user_id:non}),/unavailable/);
    // The picker's directory lists the members themselves, address included,
    // and never the viewer or anyone who has not joined.
    const people=await call(db,a,'people');
    assert.deepEqual(people.map(p=>p.handle),['BananaWizard','FifthPlayer','FourthPlayer','QuietOwl']);
    assert.equal(people.find(p=>p.id===b).email,'student2@example.test');
    assert.equal(people.some(p=>p.id===a),false,'the viewer is not in their own list');
    assert.equal(people.some(p=>p.id===non),false,'nonmembers are never listed');
  });
  await t.test('all private tables and internal helpers deny direct reads/writes even to members',async()=>{
    for(const table of ['members','friendships','blocks','matches','moves','queue','notifications','limits']) {
      await assert.rejects(as(db,a,()=>db.query('select * from bored_together.'+table)),/permission denied/);
      await assert.rejects(as(db,a,()=>db.query('delete from bored_together.'+table)),/permission denied/);
    }
    await assert.rejects(as(db,a,()=>db.query('select bored_together.person($1,$2)',[a,non])),/permission denied/);
    await assert.rejects(as(db,a,()=>db.query('select bored_together.finish($1,$2,$3)',[randomUUID(),a,'fake win'])),/permission denied/);
    const rows=(await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='bored_together' and relkind='r'")).rows;
    assert.equal(rows.length,8);assert.ok(rows.every(r=>r.relrowsecurity));
  });
  await t.test('friend state machine, duplicate/cross requests, visibility and blocking',async()=>{
    await assert.rejects(call(db,a,'friend_request',{user_id:a}),/another player/);
    await call(db,a,'friend_request',{user_id:b});
    await assert.rejects(call(db,b,'friend_request',{user_id:a}),/already exists/);
    await assert.rejects(call(db,a,'friend_accept',{user_id:b}),/unavailable/);
    assert.ok((await dashboard(db,b)).notifications.some(n=>n.kind==='New friend request'));
    await call(db,b,'friend_accept',{user_id:a});
    assert.equal((await dashboard(db,a)).friends[0].status,'accepted');
    await call(db,b,'settings',{email_visibility:'friends'});
    assert.equal((await call(db,a,'search',{query:'Ban'}))[0].email,undefined);
    assert.equal((await call(db,c,'search',{query:'Ban'}))[0].email,undefined);
    await call(db,a,'friend_remove',{user_id:b});
    assert.equal((await call(db,a,'search',{query:'Ban'}))[0].email,undefined);
    await call(db,b,'friend_request',{user_id:a});
    await call(db,a,'friend_decline',{user_id:b});
    assert.equal((await dashboard(db,a)).friends.length,0);
    await call(db,a,'block',{user_id:b});
    assert.deepEqual(await call(db,a,'search',{query:'Ban'}),[]);
    assert.deepEqual(await call(db,b,'search',{query:'Wac'}),[]);
    assert.equal((await call(db,a,'people')).some(p=>p.id===b),false,'blocked members leave the directory');
    assert.equal((await call(db,b,'people')).some(p=>p.id===a),false,'blocking works both ways');
    await assert.rejects(call(db,b,'friend_request',{user_id:a}),/unavailable/);
    await assert.rejects(call(db,b,'challenge',{user_id:a}),/unavailable/);
    await call(db,a,'unblock',{user_id:b});
  });
  let finished;
  await t.test('a game starts with the challenger\'s turn and reaches the opponent on save',async()=>{
    const started=await call(db,a,'challenge',{user_id:b});
    assert.equal(started.status,'active');assert.equal(started.turn_user,a);
    // Nothing has been sent yet: the opponent has no row and cannot open it.
    assert.equal((await dashboard(db,b)).matches.some(x=>x.id===started.id),false);
    await assert.rejects(call(db,b,'match',{match_id:started.id}),/unavailable/);
    await assert.rejects(call(db,c,'match',{match_id:started.id}),/unavailable/);
    await assert.rejects(move(db,started,b,0),/unavailable/);
    // A second game with the same person names the one to finish instead of
    // leaking the unique index's duplicate-key error.
    await assert.rejects(call(db,a,'challenge',{user_id:b}),/already have a Connect Four game with BananaWizard/);
    await assert.rejects(call(db,b,'challenge',{user_id:a}),/already have a Connect Four game with WackyPenguin/);
    await assert.rejects(call(db,a,'accept',{match_id:started.id}),/Challenge unavailable/,'there is nothing left to accept');
    let m=await move(db,started,a,0);
    const delivered=(await dashboard(db,b)).matches.find(x=>x.id===m.id);
    assert.equal(delivered.status,'active');assert.equal(delivered.turn_user,b);
    assert.ok((await dashboard(db,b)).notifications.some(n=>n.kind==='New game — your turn'));
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
    const reopened=await call(db,a,'match',{match_id:m.id});
    assert.deepEqual(reopened.state,m.state);assert.equal(reopened.moves.length,7);
    assert.equal(reopened.moves.filter(x=>x.actor===a).length,4);
    assert.ok(!JSON.stringify(reopened).includes('@example.test'));
    finished=m;
    const stats=(await dashboard(db,b)).stats.find(s=>s.opponent.id===a);
    assert.equal(stats.losses,1);
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
  await t.test('challenges created before play-first can still be accepted, declined or cancelled',async()=>{
    const insert=async(p1,p2)=>(await db.query("insert into bored_together.matches(game,p1,p2,source,status,turn_user,revealed_at,state) values('connect-four',$1,$2,'challenge','pending',null,now(),bored_together.initial_state('connect-four',1)) returning id",[p1,p2])).rows[0].id;
    const accepted=await call(db,e,'accept',{match_id:await insert(d,e)});
    assert.equal(accepted.status,'active');assert.equal(accepted.turn_user,d);
    await call(db,e,'delete',{match_id:accepted.id});
    const declined=await insert(d,e);
    await call(db,e,'decline',{match_id:declined});
    assert.equal((await call(db,d,'match',{match_id:declined})).status,'declined');
    const cancelled=await insert(d,e);
    await call(db,d,'cancel',{match_id:cancelled});
    assert.equal((await call(db,d,'match',{match_id:cancelled})).status,'cancelled');
    await assert.rejects(call(db,e,'accept',{match_id:cancelled}),/Challenge unavailable/);
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
  });
  await t.test('optimistic concurrency: a duplicate version cannot commit two moves',async()=>{
    let m=await challenge(db,a,c);
    // Both requests use the same version, as two devices would. PGlite serializes
    // connections; production Postgres locking is separately checked in SQL.
    const first=await move(db,m,a,0);
    await assert.rejects(move(db,m,a,1),/not your turn|board changed/);
    assert.equal((await call(db,a,'match',{match_id:m.id})).moves.length,1);
    m=await move(db,first,c,1);
    await assert.rejects(move(db,first,a,2),/board changed/);
    assert.equal((await call(db,a,'match',{match_id:m.id})).moves.length,2);
    await call(db,a,'resign',{match_id:m.id});
  });
  await t.test('leaving immediately disables discovery, queues, invitations and friendships; forfeits active matches',async()=>{
    await call(db,a,'friend_request',{user_id:d});await call(db,d,'friend_accept',{user_id:a});
    const pending=await call(db,d,'challenge',{user_id:b});
    const active=await move(db,await challenge(db,a,d),a,0);
    await call(db,d,'queue_join');
    await call(db,d,'leave');
    assert.deepEqual(await dashboard(db,d),{enrolled:false});
    await assert.deepEqual(await call(db,a,'search',{query:'student5@example.test'}),[]);
    await assert.rejects(call(db,a,'challenge',{user_id:d}),/unavailable/);
    // A game the opponent never saw disappears with the player who started it.
    await assert.rejects(call(db,b,'match',{match_id:pending.id}),/unavailable/);
    assert.equal((await db.query('select count(*) n from bored_together.matches where id=$1',[pending.id])).rows[0].n,0);
    // A game both players had is forfeited to the one who stayed.
    const ended=await call(db,a,'match',{match_id:active.id});
    assert.equal(ended.status,'completed');assert.equal(ended.winner,a);
    assert.equal((await dashboard(db,a)).friends.length,0);
    assert.equal((await db.query('select count(*) n from bored_together.queue where user_id=$1',[d])).rows[0].n,0);
    await enroll(db,d);assert.equal((await dashboard(db,d)).email_visibility,'hidden');
  });
  await t.test('expiry, retention, notification ownership and read acknowledgments',async()=>{
    const m=await move(db,await challenge(db,a,b),a,0);
    // An unplayed game is never delivered, so it is dropped sooner than one
    // both players are ignoring.
    const draft=await challenge(db,c,b);
    await db.query("update bored_together.matches set created_at=now()-interval '8 days' where id=$1",[draft.id]);
    await db.query('select bored_together.cleanup()');
    await assert.rejects(call(db,c,'match',{match_id:draft.id}),/unavailable/);
    await db.query("update bored_together.matches set updated_at=now()-interval '31 days' where id=$1",[m.id]);
    await db.query('select bored_together.cleanup()');
    const expired=await call(db,a,'match',{match_id:m.id});assert.equal(expired.status,'expired');assert.equal(expired.winner,null);
    await db.query("update bored_together.matches set updated_at=now()-interval '91 days' where id=$1",[m.id]);
    await db.query('select bored_together.cleanup()');await assert.rejects(call(db,a,'match',{match_id:m.id}),/unavailable/);
    const before=await dashboard(db,b);assert.ok(before.notifications.length);
    await call(db,a,'read_notifications',{through:999999});
    assert.ok((await dashboard(db,b)).notifications.some(n=>!n.read_at));
    await call(db,b,'read_notifications',{through:before.notifications[0].id});
    assert.ok((await dashboard(db,b)).notifications.every(n=>n.read_at));
  });
  await t.test('discovery rate limit is server-enforced',async()=>{
    await db.query("delete from bored_together.limits where user_id=$1",[e]);
    for(let n=0;n<20;n++)await call(db,e,'search',{query:'Wac'});
    await assert.rejects(call(db,e,'search',{query:'Wac'}),/Too many/);
    await db.query("delete from bored_together.limits where user_id=$1",[e]);
    await db.query("insert into bored_together.limits values($1,'search-day',to_timestamp(floor(extract(epoch from now())/86400)*86400),200)",[e]);
    await assert.rejects(call(db,e,'search',{query:'Wac'}),/Too many/);
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

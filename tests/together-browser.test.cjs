const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const puppeteer=require('puppeteer-core');
const {serve}=require('./serve.cjs');
const {database,call,ids,poolHandler,inviteCall}=require('./together-db.cjs');

test('two embedded browser accounts play, save, auto-return, resume and rematch using production SQL',async t=>{
  const executablePath=[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p));
  assert.ok(executablePath,'Set CHROME_PATH to run browser verification');
  const db=await database(), site=await serve(path.join(__dirname,'../src'));
  const browser=await puppeteer.launch({executablePath,headless:true});
  t.after(async()=>{await browser.close();await site.close();await db.close();});
  let serial=Promise.resolve();
  const enqueue=fn=>{const pending=serial.then(fn);serial=pending.catch(()=>{});return pending;};
  const pool=await poolHandler(db,enqueue);
  const errors=[], unexpected=[], calls=[], outages=new Set(), lostReplies=new Set();
  const handles=['WackyPenguin','BananaWizard','QuietOwl','NeverJoined','FourthPlayer','FifthPlayer','Anonymous'];
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  async function player(user) {
    const context=await browser.createBrowserContext();const page=await context.newPage();page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request',async req=>{
      if(req.url().startsWith(site.origin)||!/^https?:/.test(req.url()))return req.continue();
      const url=new URL(req.url());
      const reply=(body,status=200)=>req.respond({status,headers:cors,contentType:'application/json',body:JSON.stringify(body)});
      if(req.method()==='OPTIONS')return req.respond({status:204,headers:cors});
      if(url.hostname!=='djdpttltfmwkofdrvkem.supabase.co'){unexpected.push(req.url());return req.abort();}
      const identity=req.headers().authorization?.replace('Bearer ','');
      if(url.pathname==='/functions/v1/together-pool') {
        if(outages.has(identity))return req.abort('internetdisconnected');
        calls.push({identity,action:'pool-start'});
        const response=await pool(new Request(req.url(),{method:'POST',headers:{Authorization:req.headers().authorization,'Content-Type':'application/json'},body:req.postData()}));
        calls.push({identity,action:'pool-end',status:response.status});
        return req.respond({status:response.status,headers:cors,contentType:'application/json',body:await response.text()});
      }
      if(url.pathname==='/rest/v1/rpc/bt_invite_rpc') {
        if(outages.has(identity))return req.abort('internetdisconnected');
        const {action,args}=JSON.parse(req.postData());calls.push({identity,action:'invite:'+action});
        const pending=serial.then(()=>inviteCall(db,ids.includes(identity)?identity:null,action,args));
        serial=pending.catch(()=>{});
        try{return reply(await pending);}catch(e){return reply({message:e.message,code:e.code},400);}
      }
      if(url.pathname==='/rest/v1/rpc/bt_rpc') {
        if(outages.has(identity))return req.abort('internetdisconnected');
        const {action,args}=JSON.parse(req.postData());calls.push({identity,action});
        const pending=serial.then(()=>call(db,ids.includes(identity)?identity:null,action,args));
        serial=pending.catch(()=>{});
        try{const result=await pending;if(action==='move'&&lostReplies.delete(identity))return req.abort('internetdisconnected');return reply(result);}catch(e){return reply({message:e.message,code:e.code},400);}
      }
      if(url.pathname==='/rest/v1/profiles')return reply([{handle:handles[ids.indexOf(identity)]}]);
      if(url.pathname==='/auth/v1/logout')return reply(null);
      if(['/rest/v1/score_rules','/rest/v1/leaderboard','/rest/v1/scores','/rest/v1/player_state','/rest/v1/daily_results','/rest/v1/play_events','/rest/v1/product_events','/rest/v1/enjoyment_feedback'].includes(url.pathname))return reply(req.method()==='GET'?[]:null);
      unexpected.push(req.method()+' '+url.pathname);return req.abort();
    });
    await page.goto(site.url);await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length>0);
    if(user){await page.evaluate(u=>localStorage.setItem('bored.session',JSON.stringify({access_token:u,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:u,is_anonymous:false,email:'fixture@example.test'}})),user);await page.reload();}
    return page;
  }
  async function click(page,text) {
    await page.waitForFunction(text=>!document.querySelector('#together').hasAttribute('aria-busy')&&[...document.querySelectorAll('#together button')].some(b=>b.textContent===text&&!b.disabled),{},text);
    await page.$$eval('#together button',(buttons,text)=>buttons.find(b=>b.textContent===text).click(),text);
    await page.waitForFunction(()=>!document.querySelector('#together').hasAttribute('aria-busy'));
  }
  async function open(page){await page.click('#together-nav');await page.waitForFunction(()=>!document.querySelector('#together').hidden);}
  async function refresh(page){await click(page,'Refresh');}
  async function frame(page,selector){
    await page.waitForFunction(selector=>document.querySelector('#frame').contentDocument?.querySelector(selector),{},selector);
    return (await page.$('#frame')).contentFrame();
  }
  async function launch(page,id){
    await page.waitForSelector(`[data-match-id="${id}"]`);
    await page.$eval(`[data-match-id="${id}"]`,row=>row.querySelector('.bt-actions>button').click());
    await page.waitForFunction(()=>!document.querySelector('#player').hidden);
  }
  async function exit(page){await page.click('#menu-toggle');await page.click('#back');await page.waitForFunction(()=>document.querySelector('#player').hidden);await refresh(page);}
  async function drop(page,n,returns=true){
    const game=await frame(page,'.columns');
    await game.waitForSelector(`.columns button[aria-label="Drop in column ${n}"]:not([disabled])`);
    await game.click(`.columns button[aria-label="Drop in column ${n}"]`);
    if(returns){await page.waitForFunction(()=>document.querySelector('#player').hidden);await refresh(page);}
  }
  // Pick a game, then a member from the directory; the challenge opens the
  // original game straight away with the first turn.
  async function challengePlayer(page,game,handle){
    await click(page,'Start a Game');await page.select('#bt-game-select',game);
    await page.waitForSelector('#bt-people .bt-person');
    await page.$$eval('#bt-people .bt-person',(rows,handle)=>{
      const row=rows.find(r=>r.querySelector('strong').textContent===handle);
      if(!row)throw new Error('member missing: '+handle);row.querySelector('button').click();
    },handle);
    try {
      await page.waitForFunction(()=>!document.querySelector('#player').hidden);
    } catch (error) {
      throw new Error('starting ' + game + ' did not open the player: ' + await page.$eval('#together-status', node => node.textContent));
    }
  }
  async function shoot(page,angle,power){
    const game=await frame(page,'#c');
    await game.waitForFunction(()=>__test.state()==='aim');
    await game.evaluate(({angle,power})=>{__test.set(angle);__test.setPower(power);},{angle,power});
    await page.focus('#frame');
    await page.keyboard.press('Enter');
  }
  const guest=await player();await open(guest);
  assert.equal(calls.length,0,'guest makes no multiplayer requests');
  assert.match(await guest.$eval('#together-content',e=>e.textContent),/display name and email in the member list/);
  await click(guest,'Join Bored Together');assert.ok(await guest.$eval('#auth-dialog',e=>e.open));
  const a=await player(ids[0]),b=await player(ids[1]);await open(a);await open(b);
  await click(a,'Join Bored Together');await click(b,'Join Bored Together');
  assert.equal(await a.$('[role="tablist"]'),null,'no social subnavigation');
  await challengePlayer(a,'connect-four','BananaWizard');
  // The picker is the directory: the member's address is how you recognise them.
  assert.equal((await call(db,ids[1],'dashboard')).matches.length,0,'nothing is sent before the first turn is saved');
  const original=await frame(a,'.connect');
  assert.equal(await original.$$eval('.columns button:not([disabled])',x=>x.length),7,'the challenger starts');
  assert.equal(await a.$eval('#frame',e=>e.getBoundingClientRect().width),await a.evaluate(()=>innerWidth),'normal player fills viewport');
  // A failed save leaves the original board open and offers recovery.
  let game;
  outages.add(ids[0]);await drop(a,1,false);
  game=await frame(a,'#together-error');
  assert.equal(await game.$$eval('.disc.p1',x=>x.length),0,'no optimistic disc after failed save');
  assert.equal(await a.$eval('#player',e=>e.hidden),false);
  outages.delete(ids[0]);await game.click('#together-error button');
  await a.waitForFunction(()=>document.querySelector('#player').hidden);await refresh(a);
  const first=(await call(db,ids[0],'dashboard')).matches.find(m=>m.game==='connect-four'&&m.status==='active');
  assert.match(await a.$eval(`[data-match-id="${first.id}"]`,e=>e.textContent),/Their turn/);
  assert.ok(!(await a.$eval(`[data-match-id="${first.id}"]`,e=>e.textContent)).includes('@'),'a game row never shows an address');
  // Now it is the other player's game, waiting for their turn.
  await refresh(b);
  assert.match(await b.$eval(`[data-match-id="${first.id}"]`,e=>e.textContent),/Your turn/);
  await a.reload();await a.waitForSelector('#bt-your-games');
  assert.equal(await a.$eval('#player',e=>e.hidden),true,'refresh returns to the list');
  await launch(b,first.id);
  game=await frame(b,'.connect');assert.equal(await game.$$eval('.disc.p1',x=>x.length),1,'other account restores saved board');
  await exit(b);await launch(b,first.id);await drop(b,2);
  await refresh(a);await launch(a,first.id);
  // A lost response after commit retries the SAME request ID, never two discs.
  lostReplies.add(ids[0]);await drop(a,1,false);game=await frame(a,'#together-error');
  await game.click('#together-error button');await a.waitForFunction(()=>document.querySelector('#player').hidden);
  assert.equal((await db.query('select count(*)::int n from bored_together.moves where match_id=$1',[first.id])).rows[0].n,3);
  for(const [page,n] of [[b,2],[a,1],[b,2],[a,1]]){await refresh(page);await launch(page,first.id);await drop(page,n);}
  await refresh(a);assert.match(await a.$eval(`[data-match-id="${first.id}"]`,e=>e.textContent),/You won/);
  // A rematch is played first as well: it opens for its creator and is sent on
  // the first saved turn.
  await click(a,'Rematch');await frame(a,'.connect');await drop(a,1);
  const rematch=(await call(db,ids[0],'dashboard')).matches.find(m=>m.game==='connect-four'&&m.status==='active'&&m.id!==first.id);
  await refresh(b);
  assert.match(await b.$eval(`[data-match-id="${rematch.id}"]`,e=>e.textContent),/Your turn/,'the rematch reaches its opponent');
  await click(b,'Play Random');await click(b,'Find opponent');
  assert.match(await b.$eval('#together-content',e=>e.textContent),/Finding an opponent/);
  await b.reload();await b.waitForSelector('#bt-your-games');await click(b,'Cancel search');
  await call(db,ids[4],'enroll',{consent_version:'2026-10-26-v3'});
  await call(db,ids[4],'queue_join',{game:'connect-four'});
  await click(b,'Play Random');await click(b,'Find opponent');await frame(b,'.connect');await exit(b);
  // Pool's existing authoritative engine/Edge handler remains intact, with original controls.
  await challengePlayer(a,'8ball','BananaWizard');
  game=await frame(a,'#c');assert.equal(await game.$eval('#menu',e=>e.classList.contains('hidden')),true,'original menu bypassed for a fresh game');
  assert.ok(await game.$eval('#c',e=>e.width>300),'original pool canvas fills player');
  await shoot(a,0,.85);await a.waitForFunction(()=>document.querySelector('#player').hidden);
  const poolMatch=(await call(db,ids[0],'dashboard')).matches.find(m=>m.game==='8ball'&&m.status==='active');
  await refresh(b);await launch(b,poolMatch.id);game=await frame(b,'#c');
  assert.ok((await game.evaluate(()=>__test.balls())).some(b=>Math.abs(b.x-52.8)>1),'restored pool state');
  await exit(b);
  // Set up a legal-pot table in the isolated database to verify multi-shot turn ownership.
  const pot={balls:[{id:0,x:110,y:50},{id:1,x:110,y:20},{id:8,x:175,y:70},{id:9,x:195,y:85}],groups:['solid','stripe'],ballInHand:false,breakShot:false,shotCount:3,lastShot:null};
  await db.query("update bored_together.matches set state=$1::jsonb,turn_user=p1,version=version+1 where id=$2",[JSON.stringify(pot),poolMatch.id]);
  await refresh(a);await launch(a,poolMatch.id);await shoot(a,-Math.PI/2,.25);
  game=await frame(a,'#c');await game.waitForFunction(()=>__test.state()==='aim'&&__boredTogether.context.state.shotCount===4);
  assert.equal(await a.$eval('#player',e=>e.hidden),false,'legal pot retains original game for next shot');
  assert.equal((await call(db,ids[0],'match',{match_id:poolMatch.id})).turn_user,ids[0]);
  await a.reload();await a.waitForSelector('#bt-your-games');await launch(a,poolMatch.id);
  game=await frame(a,'#c');assert.equal(await game.evaluate(()=>__boredTogether.context.state.shotCount),4,'retained turn survives refresh');
  await shoot(a,0,.05);await a.waitForFunction(()=>document.querySelector('#player').hidden);
  // Tanks: the move on the wire is an aim, and the other side recomputes the
  // shell, the crater and the damage from the stored shot.
  const aimAt = async (state, seat) => {
    const engine = await import('../src/games/tank-engine.js');
    const world = engine.replay(state), tank = world.tanks[seat - 1], before = world.tanks[2 - seat].hp;
    for (const angle of [45, 50, 40, 55, 35, 60, 30, 65, 25, 70, 20]) {
      for (const power of [20, 18, 16, 14, 12, 10]) {
        try {
          const out = engine.advance(state, { seat, x: tank.x, angle, power, weapon: 'standard' });
          if (out.world.tanks[2 - seat].hp < before) return { angle, power, hp: out.world.tanks.map(t => t.hp), world: out.world };
        } catch { /* try the next aim */ }
      }
    }
    throw new Error('no shot reaches the other tank');
  };
  const inGame = async (page, check) => {
    try { await page.waitForFunction(check, { timeout: 20000 }); }
    catch {
      const info = await page.evaluate(() => {
        const element = document.querySelector('#frame'), frame = element.contentWindow;
        return { srcdoc: element.srcdoc.length, test: !!(frame && frame.__test),
          state: frame && frame.__test ? frame.__test.state() : null,
          text: frame ? frame.document.body.innerText.slice(0, 300) : 'no frame',
          status: document.querySelector('#together-status')?.textContent || '' };
      });
      throw new Error('the tank game did not start: ' + JSON.stringify({ ...info, errors }));
    }
  };
  await challengePlayer(a, 'tank2', 'BananaWizard');
  const tanks = (await call(db, ids[0], 'dashboard')).matches.find(m => m.game === 'tank2');
  assert.equal(tanks.mode, 'turns'); assert.equal(tanks.turn_user, ids[0]);
  await inGame(a, () => { const w = document.querySelector('#frame').contentWindow, s = w && w.__test && w.__test.state(); return !!(s && s.online && s.mode === 'AIM'); });
  const firstShot = await aimAt(tanks.state, 1);
  await frame(a, 'canvas').then(f => f.evaluate(s => __test.aim(s.angle, s.power), firstShot));
  await a.focus('#frame'); await a.keyboard.press('Space');
  await a.waitForFunction(() => document.querySelector('#player').hidden, { timeout: 20000 });
  await refresh(a); await refresh(b);
  assert.match(await b.$eval(`[data-match-id="${tanks.id}"]`, e => e.textContent), /Your turn/);
  await launch(b, tanks.id);
  await inGame(b, () => { const w = document.querySelector('#frame').contentWindow, s = w && w.__test && w.__test.state(); return !!(s && s.online && s.shots === 1 && s.mode === 'AIM'); });
  assert.deepEqual(await frame(b, 'canvas').then(f => f.evaluate(() => __test.state().hp)), firstShot.hp, 'the opponent rebuilds the damage from the shot');
  const secondShot = await aimAt((await call(db, ids[1], 'match', { match_id: tanks.id })).state, 2);
  await frame(b, 'canvas').then(f => f.evaluate(s => __test.aim(s.angle, s.power), secondShot));
  await b.focus('#frame'); await b.keyboard.press('Space');
  await b.waitForFunction(() => document.querySelector('#player').hidden, { timeout: 20000 });
  await refresh(a); await launch(a, tanks.id);
  await inGame(a, () => { const w = document.querySelector('#frame').contentWindow, s = w && w.__test && w.__test.state(); return !!(s && s.online && s.shots === 2); });
  assert.deepEqual(await frame(a, 'canvas').then(f => f.evaluate(() => __test.state().hp)), secondShot.hp, 'both shots replay on the first player\u2019s screen');
  assert.equal(await frame(a, 'canvas').then(f => f.evaluate(() => __test.state().seed)), tanks.state.seed, 'the same battlefield seed');
  await exit(a);
  // A duel deals both players the same board and compares one run each; the
  // opponent's score stays hidden until your own run is in.
  await challengePlayer(a,'2048','BananaWizard');
  const duel=(await call(db,ids[0],'dashboard')).matches.find(m=>m.game==='2048');
  assert.equal(duel.mode,'duel');assert.equal(duel.turn_user,ids[0]);
  let duelBoard=await frame(a,'.tiles');
  assert.equal(await duelBoard.evaluate(()=>window.__boredSeed.seed),duel.state.seed,'the match seed reaches the game');
  for(const key of ['ArrowLeft','ArrowDown','ArrowLeft','ArrowUp']){await a.focus('#frame');await a.keyboard.press(key);await a.keyboard.press(key);}
  const mine=await duelBoard.evaluate(()=>__boredSnapshot().score);assert.ok(mine>0,'a duel run scores');
  await a.focus('#frame');await a.keyboard.press('Escape');
  await a.waitForFunction(()=>!document.querySelector('#duel-finish').hidden);
  assert.match(await a.$eval('#duel-finish-text',e=>e.textContent),/Send your run/);
  await a.click('#duel-send');
  await a.waitForFunction(()=>document.querySelector('#player').hidden);
  await refresh(a);await refresh(b);
  assert.ok(!(await b.$eval(`[data-match-id="${duel.id}"]`,e=>e.textContent)).includes('beat'),'the run to beat is hidden');
  await launch(b,duel.id);
  duelBoard=await frame(b,'.tiles');
  assert.equal(await duelBoard.evaluate(()=>window.__boredSeed.seed),duel.state.seed,'both players get the same board');
  for(const key of ['ArrowUp','ArrowRight','ArrowUp','ArrowRight']){await b.focus('#frame');await b.keyboard.press(key);await b.keyboard.press(key);}
  await b.focus('#frame');await b.keyboard.press('Escape');
  await b.waitForFunction(()=>!document.querySelector('#duel-finish').hidden);
  await b.click('#duel-send');await b.waitForFunction(()=>document.querySelector('#player').hidden);
  await refresh(a);
  const done=(await call(db,ids[0],'dashboard')).matches.find(m=>m.id===duel.id);
  assert.equal(done.status,'completed');assert.equal(done.state.plays['1'],mine);
  const theirs=done.state.plays['2'];
  assert.equal(done.winner,theirs===mine?null:theirs>mine?ids[1]:ids[0]);
  assert.match(await a.$eval(`[data-match-id="${duel.id}"]`,e=>e.textContent),/\d+ points to \d+ points/,'both runs are shown once they are in');
  // Mixed list: attention first, no separate people/history/settings/feed.
  await call(db,ids[2],'enroll',{consent_version:'2026-10-26-v3'});
  const fromC=await call(db,ids[2],'challenge',{user_id:ids[0]});
  await refresh(a);
  assert.equal((await call(db,ids[0],'dashboard')).matches.some(m=>m.id===fromC.id),false,'an unplayed game is not listed for its opponent');
  await call(db,ids[2],'move',{match_id:fromC.id,version:fromC.version,column:3,request_id:randomUUID()});
  await refresh(a);
  assert.match(await a.$eval('.bt-match-row',e=>e.textContent),/Your turn/);
  for(const selector of ['.bt-tabs','.bt-sidebar','.bt-board','.bt-activity','#bt-email-visibility','input[aria-label="Review move number"]'])assert.equal(await a.$(selector),null,selector+' removed');
  fs.mkdirSync(path.join(__dirname,'../_build/together'),{recursive:true});
  for(const width of [1100,375,320]){
    await a.setViewport({width,height:850});await a.evaluate(()=>scrollTo(0,0));
    await a.screenshot({path:path.join(__dirname,`../_build/together/simple-${width}.png`),fullPage:true});
    assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'list no overflow '+width);
    // Only the player whose turn it is gets a button on the row.
    const active=(await call(db,ids[0],'dashboard')).matches.find(m=>m.status==='active'&&m.turn_user===ids[0]&&m.game==='connect-four');
    await launch(a,active.id);game=await frame(a,'.connect');
    assert.ok(await game.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'original board no overflow '+width);
    await a.screenshot({path:path.join(__dirname,`../_build/together/original-${width}.png`)});await exit(a);
    await launch(a,poolMatch.id);game=await frame(a,'#c');
    assert.ok(await game.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'original pool no overflow '+width);
    await a.screenshot({path:path.join(__dirname,`../_build/together/pool-original-${width}.png`)});await exit(a);
  }
  // Google Sites equivalent: nested frame with normal script/same-origin sandbox permissions.
  await a.setContent('<iframe title="Google Sites embed" style="width:100%;height:750px;border:0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" src="'+site.url+'#together"></iframe>');
  const embed=await (await a.$('iframe')).contentFrame();await embed.waitForSelector('#bt-your-games');
  const active=(await call(db,ids[0],'dashboard')).matches.find(m=>m.status==='active'&&m.turn_user===ids[0]&&m.game==='connect-four');
  await embed.$eval(`[data-match-id="${active.id}"]`,e=>e.querySelector('button').click());
  await embed.waitForFunction(()=>document.querySelector('#frame').contentDocument?.querySelector('.connect'));
  assert.ok(await embed.$eval('#player',e=>!e.hidden),'full player works within embedded site');
  await embed.click('#menu-toggle');await embed.click('#back');await embed.waitForFunction(()=>document.querySelector('#player').hidden);
  await a.goto(site.url+'?after-embed#together');await a.waitForSelector('#bt-your-games');
  await click(a,'Start a Game');await a.waitForSelector('#bt-people .bt-person');await refresh(a);
  assert.ok(await a.$('#bt-people'),'polling preserves the member list');
  await click(a,'Cancel');
  // Switching identities while an original game is open closes it synchronously.
  await launch(a,active.id);await frame(a,'.connect');
  await a.evaluate(()=>document.querySelector('#account-action').click());
  await a.waitForFunction(()=>document.querySelector('#player').hidden);
  await a.waitForFunction(()=>document.querySelector('#together-content').textContent.includes('Join Bored Together'));
  assert.ok(!(await a.$eval('#together-content',e=>e.textContent)).includes('BananaWizard'));
  assert.equal(await a.$eval('#together-home',e=>e.hidden),true);
  // Ordinary single-player still launches with its CPU/local selector.
  await a.click('#together-back');await a.evaluate(()=>openGame('connect-four'));
  game=await frame(a,'.connect');assert.equal(await game.$eval('#actions',e=>e.hidden),false);
  await game.select('select[aria-label="Opponent"]','friend');await game.click('.columns button');
  assert.equal(await game.$$eval('.disc.p1',x=>x.length),1);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
});

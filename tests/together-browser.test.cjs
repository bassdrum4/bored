const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {serve}=require('./serve.cjs');
const {database,call,ids,poolHandler}=require('./together-db.cjs');

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
      if(url.pathname==='/rest/v1/rpc/bt_rpc') {
        if(outages.has(identity))return req.abort('internetdisconnected');
        const {action,args}=JSON.parse(req.postData());calls.push({identity,action});
        const pending=serial.then(()=>call(db,ids.includes(identity)?identity:null,action,args));
        serial=pending.catch(()=>{});
        try{const result=await pending;if(action==='move'&&lostReplies.delete(identity))return req.abort('internetdisconnected');return reply(result);}catch(e){return reply({message:e.message,code:e.code},400);}
      }
      if(url.pathname==='/rest/v1/profiles')return reply([{handle:handles[ids.indexOf(identity)]}]);
      if(url.pathname==='/auth/v1/logout')return reply(null);
      if(['/rest/v1/score_rules','/rest/v1/leaderboard','/rest/v1/scores','/rest/v1/player_state','/rest/v1/daily_results','/rest/v1/play_events'].includes(url.pathname))return reply(req.method()==='GET'?[]:null);
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
  async function challengePlayer(page,game,query){
    await click(page,'Challenge Someone');await page.select('#bt-game-select',game);
    await page.type('#bt-search',query);await click(page,'Find player');await click(page,'Challenge');
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
  assert.match(await guest.$eval('#together-content',e=>e.textContent),/email stays private/);
  await click(guest,'Join Bored Together');assert.ok(await guest.$eval('#auth-dialog',e=>e.open));
  const a=await player(ids[0]),b=await player(ids[1]);await open(a);await open(b);
  await click(a,'Join Bored Together');await click(b,'Join Bored Together');
  assert.equal(await a.$('[role="tablist"]'),null,'no social subnavigation');
  await challengePlayer(a,'connect-four','student2@example.test');
  assert.ok(!(await a.$eval('#together-content',e=>e.textContent)).includes('student2@example.test'),'email never rendered');
  const first=(await call(db,ids[0],'dashboard')).matches.find(m=>m.status==='pending');
  await refresh(b);await click(b,'Accept');
  const original=await frame(b,'.connect');
  assert.equal(await original.$$eval('.columns button:not([disabled])',x=>x.length),0,'acceptance launches original game with waiting controls');
  assert.equal(await b.$eval('#frame',e=>e.getBoundingClientRect().width),await b.evaluate(()=>innerWidth),'normal player fills viewport');
  await exit(b);await refresh(a);await launch(a,first.id);
  // A failed save leaves the original board open and offers recovery.
  outages.add(ids[0]);await drop(a,1,false);
  let game=await frame(a,'#together-error');
  assert.equal(await game.$$eval('.disc.p1',x=>x.length),0,'no optimistic disc after failed save');
  assert.equal(await a.$eval('#player',e=>e.hidden),false);
  outages.delete(ids[0]);await game.click('#together-error button');
  await a.waitForFunction(()=>document.querySelector('#player').hidden);await refresh(a);
  assert.match(await a.$eval(`[data-match-id="${first.id}"]`,e=>e.textContent),/Their turn/);
  await a.reload();await a.waitForSelector('#bt-your-games');
  assert.equal(await a.$eval('#player',e=>e.hidden),true,'refresh returns to the list');
  await refresh(b);await launch(b,first.id);
  game=await frame(b,'.connect');assert.equal(await game.$$eval('.disc.p1',x=>x.length),1,'other account restores saved board');
  await exit(b);await launch(b,first.id);await drop(b,2);
  await refresh(a);await launch(a,first.id);
  // A lost response after commit retries the SAME request ID, never two discs.
  lostReplies.add(ids[0]);await drop(a,1,false);game=await frame(a,'#together-error');
  await game.click('#together-error button');await a.waitForFunction(()=>document.querySelector('#player').hidden);
  assert.equal((await db.query('select count(*)::int n from bored_together.moves where match_id=$1',[first.id])).rows[0].n,3);
  for(const [page,n] of [[b,2],[a,1],[b,2],[a,1]]){await refresh(page);await launch(page,first.id);await drop(page,n);}
  await refresh(a);assert.match(await a.$eval(`[data-match-id="${first.id}"]`,e=>e.textContent),/You won/);
  await click(a,'Rematch');await refresh(b);await click(b,'Accept');await frame(b,'.connect');await exit(b);
  await click(b,'Play Random');await click(b,'Find opponent');
  assert.match(await b.$eval('#together-content',e=>e.textContent),/Finding an opponent/);
  await b.reload();await b.waitForSelector('#bt-your-games');await click(b,'Cancel search');
  await call(db,ids[4],'enroll',{consent_version:'2026-10-25-v2'});
  await call(db,ids[4],'queue_join',{game:'connect-four'});
  await click(b,'Play Random');await click(b,'Find opponent');await frame(b,'.connect');await exit(b);
  // Pool's existing authoritative engine/Edge handler remains intact, with original controls.
  await challengePlayer(a,'8ball','Banana');
  const poolMatch=(await call(db,ids[0],'dashboard')).matches.find(m=>m.game==='8ball'&&m.status==='pending');
  await refresh(b);await b.$eval(`[data-match-id="${poolMatch.id}"]`,e=>e.querySelector('button').click());
  await frame(b,'#c');await exit(b);
  await refresh(a);await launch(a,poolMatch.id);
  game=await frame(a,'#c');assert.equal(await game.$eval('#menu',e=>e.classList.contains('hidden')),true,'original menu bypassed for persisted match');
  assert.ok(await game.$eval('#c',e=>e.width>300),'original pool canvas fills player');
  await shoot(a,0,.85);await a.waitForFunction(()=>document.querySelector('#player').hidden);
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
  // Mixed list: attention first, no separate people/history/settings/feed.
  await call(db,ids[2],'enroll',{consent_version:'2026-10-25-v2'});
  await call(db,ids[2],'challenge',{user_id:ids[0]});await refresh(a);
  assert.match(await a.$eval('.bt-match-row',e=>e.textContent),/Your turn|Challenge received/);
  for(const selector of ['.bt-tabs','.bt-sidebar','.bt-board','.bt-activity','#bt-email-visibility','input[aria-label="Review move number"]'])assert.equal(await a.$(selector),null,selector+' removed');
  fs.mkdirSync(path.join(__dirname,'../_build/together'),{recursive:true});
  for(const width of [1100,375,320]){
    await a.setViewport({width,height:850});await a.evaluate(()=>scrollTo(0,0));
    await a.screenshot({path:path.join(__dirname,`../_build/together/simple-${width}.png`),fullPage:true});
    assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'list no overflow '+width);
    const active=(await call(db,ids[0],'dashboard')).matches.find(m=>m.status==='active'&&m.game==='connect-four');
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
  const active=(await call(db,ids[0],'dashboard')).matches.find(m=>m.status==='active'&&m.game==='connect-four');
  await embed.$eval(`[data-match-id="${active.id}"]`,e=>e.querySelector('button').click());
  await embed.waitForFunction(()=>document.querySelector('#frame').contentDocument?.querySelector('.connect'));
  assert.ok(await embed.$eval('#player',e=>!e.hidden),'full player works within embedded site');
  await embed.click('#menu-toggle');await embed.click('#back');await embed.waitForFunction(()=>document.querySelector('#player').hidden);
  await a.goto(site.url+'?after-embed#together');await a.waitForSelector('#bt-your-games');
  await click(a,'Challenge Someone');await a.type('#bt-search','Quiet');await refresh(a);
  assert.equal(await a.$eval('#bt-search',e=>e.value),'Quiet','polling preserves search');
  // Switching identities while an original game is open closes it synchronously.
  await click(a,'Cancel');await launch(a,active.id);await frame(a,'.connect');
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

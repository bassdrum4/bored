const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {serve}=require('./serve.cjs');
const {database,call,ids,poolHandler}=require('./together-db.cjs');

test('two embedded browser accounts play, disconnect, resume, review and rematch using production SQL',async t=>{
  const executablePath=[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p));
  assert.ok(executablePath,'Set CHROME_PATH to run browser verification');
  const db=await database(), site=await serve(path.join(__dirname,'../src'));
  const browser=await puppeteer.launch({executablePath,headless:true});
  t.after(async()=>{await browser.close();await site.close();await db.close();});
  let serial=Promise.resolve();
  const enqueue=fn=>{const pending=serial.then(fn);serial=pending.catch(()=>{});return pending;};
  const pool=await poolHandler(db,enqueue);
  const errors=[], unexpected=[], calls=[], outages=new Set();
  const handles=['WackyPenguin','BananaWizard','QuietOwl','NeverJoined','FourthPlayer','FifthPlayer','Anonymous'];
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
  async function player(user) {
    const context=await browser.createBrowserContext();const page=await context.newPage();
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
        try{return reply(await pending);}catch(e){return reply({message:e.message,code:e.code},400);}
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
    try { await page.waitForFunction(()=>!document.querySelector('#together').hasAttribute('aria-busy')); }
    catch(error) {
      console.log('UI diagnostic',text,await page.evaluate(()=>({busy:document.querySelector('#together').getAttribute('aria-busy'),status:document.querySelector('#together-status').textContent,hidden:document.hidden})),errors,calls.slice(-8));
      console.log('Stored moves', (await db.query('select count(*)::int n from bored_together.moves')).rows);
      throw error;
    }
  }
  async function open(page){await page.click('#together-nav');await page.waitForFunction(()=>!document.querySelector('#together').hidden);}
  async function tab(page,id){await page.click('#bt-tab-'+id);await page.waitForFunction(id=>document.querySelector('#bt-tab-panel')?.getAttribute('aria-labelledby')==='bt-tab-'+id,{},id);}
  async function refresh(page){await click(page,'Refresh');}
  async function column(page,n){await page.waitForSelector(`.bt-columns button[aria-label="Drop in column ${n}"]:not([disabled])`);await page.click(`.bt-columns button[aria-label="Drop in column ${n}"]`);await page.waitForFunction(()=>!document.querySelector('#together').hasAttribute('aria-busy'));}
  const guest=await player();
  await open(guest);
  assert.equal(calls.length,0,'guest makes no multiplayer requests');
  assert.match(await guest.$eval('#together-content',e=>e.textContent),/searches your exact account email/);
  fs.mkdirSync(path.join(__dirname,'../_build/together'),{recursive:true});
  for(const width of [1100,375,320]) {
    await guest.setViewport({width,height:900});await guest.evaluate(()=>window.scrollTo(0,0));
    await guest.screenshot({path:path.join(__dirname,`../_build/together/join-${width}.png`),fullPage:true});
    assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'enrollment no overflow '+width);
    if(width<700) assert.ok(await guest.evaluate(()=>document.querySelector('.bt-enroll-action').getBoundingClientRect().top>=document.querySelector('.bt-consent').getBoundingClientRect().bottom),'mobile disclosure precedes joining');
  }
  await click(guest,'Join Bored Together');assert.ok(await guest.$eval('#auth-dialog',e=>e.open));
  assert.equal(await guest.$eval('#together-home',e=>e.hidden),true);
  const a=await player(ids[0]), b=await player(ids[1]);
  await open(a);await open(b);
  await click(a,'Join Bored Together');await click(b,'Join Bored Together');
  await a.setViewport({width:1100,height:900});await a.evaluate(()=>window.scrollTo(0,0));
  await a.screenshot({path:path.join(__dirname,'../_build/together/empty-1100.png'),fullPage:true});
  await tab(a,'people');
  await a.waitForSelector('#bt-search');
  await a.type('#bt-search','student2@example.test');await click(a,'Find players');
  await a.waitForFunction(()=>document.querySelector('#bt-find').textContent.includes('BananaWizard'));
  assert.ok((await a.$eval('#bt-find',e=>e.textContent)).includes('student2@example.test'),'exact email result includes the address without a visibility toggle');
  await click(a,'Add friend');await refresh(b);await tab(b,'people');
  await click(b,'Accept friend');await refresh(a);
  assert.match(await a.$eval('#together-content',e=>e.textContent),/Remove friend/);
  // Challenge from the accepted friend profile.
  await click(a,'Challenge');await refresh(b);await tab(b,'games');await click(b,'Accept');await refresh(a);
  await a.waitForSelector('.bt-columns');
  assert.equal(await a.$$eval('.bt-columns button:not([disabled])',x=>x.length),7);
  assert.equal(await b.$$eval('.bt-columns button:not([disabled])',x=>x.length),0);
  await column(a,1);
  // Reopening the embedded document preserves the match, not a local board.
  await a.reload();await a.waitForSelector('.bt-board');
  assert.equal(await a.$$eval('.bt-p1',x=>x.length),1);
  await refresh(b);await column(b,2);await refresh(a);await column(a,1);
  await refresh(b);await column(b,2);await refresh(a);await column(a,1);
  await refresh(b);await column(b,2);await refresh(a);await column(a,1);
  await a.waitForFunction(()=>document.querySelector('#together-content').textContent.includes('You won.'));
  await refresh(b);assert.match(await b.$eval('#together-content',e=>e.textContent),/Your opponent won/);
  await a.$eval('input[type="range"]',e=>{e.value='0';e.dispatchEvent(new Event('input'));});
  assert.equal(await a.$$eval('.bt-p1,.bt-p2',x=>x.length),0);
  await click(a,'Rematch');assert.match(await a.$eval('#together-content',e=>e.textContent),/Invitation sent/);
  await refresh(b);await click(b,'← Dashboard');await click(b,'Accept');
  await click(b,'← Dashboard');await click(b,'Play Random');
  assert.match(await b.$eval('#together-content',e=>e.textContent),/Waiting for another Connect Four player/);
  await b.reload();await b.waitForFunction(()=>document.querySelector('#together-content').textContent.includes('Cancel random search'));
  await click(b,'Cancel random search');
  // Populate the local database with realistic mixed activity for layout QA.
  for(const id of [ids[2],ids[4]])await call(db,id,'enroll',{consent_version:'2026-10-25-v2'});
  const extra=await call(db,ids[0],'challenge',{user_id:ids[2]});await call(db,ids[2],'accept',{match_id:extra.id});
  await call(db,ids[4],'challenge',{user_id:ids[0]});await call(db,ids[2],'friend_request',{user_id:ids[0]});
  await refresh(a);await click(a,'← Dashboard');await tab(a,'games');
  await a.waitForSelector('.bt-match-featured');
  assert.equal(await a.$eval('#bt-tab-games',e=>e.getAttribute('aria-selected')),'true');
  assert.equal(await a.$('#bt-search'),null,'search belongs to People, not the games overview');
  assert.equal(await a.$('#bt-email-visibility'),null,'settings do not crowd the overview');
  assert.equal(await a.$$eval('.bt-match-featured',e=>e.length),2);
  const positions=await a.evaluate(()=>({main:document.querySelector('.bt-match-list').getBoundingClientRect().left,sidebar:document.querySelector('.bt-sidebar').getBoundingClientRect().left}));
  assert.ok(positions.sidebar>positions.main,'invitations and quick challenge are beside games on desktop');
  const activity=await a.$eval('.bt-activity',e=>e.open);assert.equal(activity,false,'activity starts collapsed');
  fs.mkdirSync(path.join(__dirname,'../_build/together'),{recursive:true});
  for(const width of [1100,375,320]) {
    await a.setViewport({width,height:900});await a.evaluate(()=>window.scrollTo(0,0));
    await a.screenshot({path:path.join(__dirname,`../_build/together/overview-${width}.png`),fullPage:true});
    assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overview no overflow '+width);
    for(const id of ['people','history','settings']) {
      await tab(a,id);await a.evaluate(()=>window.scrollTo(0,0));
      await a.screenshot({path:path.join(__dirname,`../_build/together/${id}-${width}.png`),fullPage:true});
      assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),id+' no overflow '+width);
    }
    await a.reload();await a.waitForSelector('#bt-tab-games');await tab(a,'games');
    await click(a,'Play your next turn →');await a.evaluate(()=>window.scrollTo(0,0));
    await a.screenshot({path:path.join(__dirname,`../_build/together/match-${width}.png`),fullPage:true});
    assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'match no overflow '+width);
    await click(a,'← Dashboard');await tab(a,'games');
  }
  await a.focus('#bt-tab-games');await a.keyboard.press('ArrowRight');
  assert.equal(await a.$eval('#bt-tab-people',e=>e.getAttribute('aria-selected')),'true','keyboard tab navigation');
  await a.type('#bt-search','Quiet');await refresh(a);
  assert.equal(await a.$eval('#bt-search',e=>e.value),'Quiet','polling preserves typed search');
  await tab(a,'games');await click(a,'Play your next turn →');
  // Pool uses the same challenge/accept flow, saved table and authenticated Edge handler.
  await click(a,'← Dashboard');await a.select('#bt-game-select','8ball');
  await click(a,'Challenge Someone');await a.waitForSelector('#bt-find');
  await a.$eval('#bt-search',e=>{e.value='student2@example.test';e.dispatchEvent(new Event('input'));});
  await click(a,'Find players');await click(a,'Challenge');
  await refresh(b);await b.$$eval('.bt-match-card',cards=>cards.find(c=>c.textContent.includes('8 Ball Pool')).querySelector('button').click());
  await b.waitForFunction(()=>!document.querySelector('#together').hasAttribute('aria-busy'));
  await refresh(a);await a.waitForSelector('#bt-pool-shoot');
  assert.equal(await b.$('#bt-pool-shoot'),null,'opponent cannot shoot out of turn');
  await a.$eval('#bt-pool-power',e=>{e.value='85';e.dispatchEvent(new Event('input'));});
  await click(a,'Shoot');
  await a.waitForFunction(()=>document.querySelector('.bt-match-message').textContent.includes('Waiting'));
  await a.reload();await a.waitForSelector('.bt-pool-table');
  assert.ok(await a.$('input[type="range"][aria-label="Review move number"]'),'pool history survived reload');
  await refresh(b);await b.waitForSelector('#bt-pool-shoot');
  await b.$eval('#bt-pool-power',e=>{e.value='1';e.dispatchEvent(new Event('input'));});await click(b,'Shoot');
  await refresh(a);await a.waitForSelector('#bt-pool-shoot');
  assert.match(await a.$eval('.bt-pool-controls',e=>e.textContent),/Place cue ball/,'foul restores ball-in-hand controls');
  for(const width of [1100,375,320]){
    await a.setViewport({width,height:900});await a.evaluate(()=>window.scrollTo(0,0));
    await a.screenshot({path:path.join(__dirname,`../_build/together/pool-${width}.png`),fullPage:true});
    assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'pool no overflow '+width);
    if(width<600)assert.ok(await a.$$eval('.bt-pool-controls label',labels=>labels.every(e=>e.getBoundingClientRect().width>=100)),'pool controls remain readable on a phone');
  }
  await a.$eval('input[aria-label="Review move number"]',e=>{e.value='0';e.dispatchEvent(new Event('input'));});
  assert.equal(await a.$('#bt-pool-shoot'),null,'reviewing an old table cannot submit a move');
  await click(a,'← Dashboard');await a.select('#bt-game-select','connect-four');
  // Return to an active Connect Four table for the original offline regression.
  await a.$$eval('.bt-match-featured',cards=>cards.find(c=>c.textContent.includes('Connect Four')).querySelector('button').click());
  await a.waitForFunction(()=>!document.querySelector('#together').hasAttribute('aria-busy'));
  // A failed/offline fetch never replaces the authoritative board with a local move.
  const before=await a.$$eval('.bt-disc',x=>x.map(e=>e.textContent));
  outages.add(ids[0]);await a.setOfflineMode(true);await refresh(a);
  assert.deepEqual(await a.$$eval('.bt-disc',x=>x.map(e=>e.textContent)),before);
  assert.match(await a.$eval('#together-status',e=>e.textContent),/Could not refresh|offline/i);
  outages.delete(ids[0]);await a.setOfflineMode(false);await refresh(a);
  await a.click('#account-action');
  await a.waitForFunction(()=>document.querySelector('#together-content').textContent.includes('Join Bored Together'));
  assert.ok(!(await a.$eval('#together-content',e=>e.textContent)).includes('BananaWizard'));
  assert.equal(await a.$eval('#together-home',e=>e.hidden),true);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./serve.cjs');
const { watch, capture } = require('./browser-diagnostics.cjs');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '../src');
test('Relic Song boots, has playable charts and uses the shared leaderboard contract', async t => {
  const html = fs.readFileSync(path.join(root,'games/content/relic-song.html'),'utf8');
  assert.doesNotThrow(() => new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]));
  const rules = JSON.parse(fs.readFileSync(path.join(root,'games/score-rules.json'),'utf8'));
  const { scoreValue } = await import('../src/hub/scores.js');
  assert.equal(rules['relic-song'].max_value,50000000);
  assert.equal(scoreValue('relic-song',{slug:'relic-song',total:900000,real:true,finished:true}),900000);
  assert.equal(scoreValue('relic-song',{slug:'relic-song',total:900000,real:false,finished:true}),0);
  const executablePath = [process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(p=>fs.existsSync(p));
  assert.ok(executablePath,'Set CHROME_PATH to run browser verification');
  const site = await serve(root);
  let browser, page;
  t.after(async()=>{try{if(page) await capture(page,'relic-song'); await browser?.close();}finally{await site.close();}});
  browser=await puppeteer.launch({executablePath,headless:true});
  page=await browser.newPage(); watch(page);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1100,height:800});
  await page.setRequestInterception(true);
  page.on('request',r=>r.url().startsWith(site.origin)||!/^https?:/.test(r.url())?r.continue():r.abort());
  await page.goto(site.origin+'/games/content/relic-song.html');
  await page.waitForFunction(()=>typeof window.__boredSnapshot==='function' && typeof window.__relicSong?.songs==='function');
  const state=await page.evaluate(()=>({snapshot:window.__boredSnapshot(), songs:window.__relicSong.songs(), menu:!!document.querySelector('#map')}));
  assert.equal(state.snapshot.slug,'relic-song');
  assert.equal(state.snapshot.total,0);
  assert.equal(state.snapshot.finished,false);
  assert.ok(state.menu);
  assert.ok(state.songs.length>=1);
  assert.ok(state.songs.every(s=>s.notes>0&&s.seconds>0));
  // Every chart: a level measured from the chart, inside its band, rising EZ < HD < IN < AT,
  // six lanes on IN/AT, never more than four notes at one moment.
  const charts=await page.evaluate(()=>window.__relicSong.charts());
  const band={ez:[1,5],hd:[1,10],in:[9,13],at:[13,15]};
  for(const c of charts){
    assert.ok(c.level>=band[c.diff][0]&&c.level<=band[c.diff][1],c.id+' '+c.diff+' Lv.'+c.level);
    assert.equal(c.lanes,c.diff==='in'||c.diff==='at'?6:4);
    assert.ok(c.chord<=Math.min(4,{ez:2,hd:2,in:3,at:4}[c.diff]),c.id+' '+c.diff+' chord '+c.chord);
  }
  for(const id of new Set(charts.map(c=>c.id))){const lv=charts.filter(c=>c.id===id).map(c=>c.level);assert.ok(lv.every((v,i)=>!i||v>lv[i-1]),id+' '+lv);}
  assert.equal(charts.find(c=>c.id==='its-started-go'&&c.diff==='hd').level,1);
  assert.deepEqual(errors,[]);
});

test('Relic Song pays its PAY table once, and tops up old payouts once', async () => {
  const { payRelicSong, topUpRelicSong, RELIC } = await import('../src/hub/relic-song.js');
  const { walletBalance, grantOnce, mergeWallet } = await import('../src/hub/rewards.js');
  const table = { clear: { ez: 50, hd: 100, in: 200, at: 400 }, rank: { b: 25, a: 50, s: 100 }, mult: { ez: 0.5, hd: 1, in: 2, at: 4 }, badge: 250, finale: 500 };
  const bosses = { 'onix-rising': 0 }, final = 'relic-song', coins = w => walletBalance(w).coins || 0;
  let r = payRelicSong(mergeWallet({}), { song: 'relic-song', diff: 'at', rank: 's', table, finale: true, bosses, final });
  assert.equal(r.paid.total, 1600);
  assert.ok(RELIC.maxPay >= 1600);
  assert.equal(payRelicSong(r.wallet, { song: 'relic-song', diff: 'at', rank: 's', table, finale: true, bosses, final }).paid.total, 0);
  let old = mergeWallet({});
  for (const [id, c] of [['rs:clear:onix-rising:hd', 12], ['rs:rank:onix-rising:hd:b', 3]]) old = grantOnce(old, id, { coins: c }).wallet;
  const t = topUpRelicSong(old, { table, bosses, final });
  assert.equal(t.paid, (100 - 12) + (25 - 3) + 250);
  assert.equal(coins(t.wallet), 100 + 25 + 250);
  assert.equal(topUpRelicSong(t.wallet, { table, bosses, final }).paid, 0);
});

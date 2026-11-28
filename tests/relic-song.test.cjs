const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./serve.cjs');
const { watch, capture } = require('./browser-diagnostics.cjs');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '../src');
// The moving line's readability rules, checked from a built chart and its line script at 1.0x:
//  R1 every note is on screen (below the HUD) and its line solid for the 0.6 s before its hit, at its line's real place;
//  R2 its line never turns faster than 180 degrees a beat in the beat before it;
//  R3 its line doesn't jump (60 px in a 32nd of a beat) in the half beat before it, unless the jump lands on a hit;
//  R4 its line is up a whole bar before it.
const READABLE = '// The readability rules, checked from the built chart and its line script (1.0x scroll speed).\n// Returns a list of problems for one chart.\nfunction readable(R, B) {\n  const out = [], song = B.song, spb = B.spb, px = 520, L = B.lanes;\n  if (!B.lines) return out;\n  const laneW = L === 6 ? 180 : 240, laneX = l => (l - (L - 1) / 2) * laneW;\n  const state = (k, rel) => rel < 0 ? (k ? null : { x: 640, y: 540, rot: 0, a: 1 }) : R.lineAt(B.lines[k], rel, k);\n  const byLine = [0, 1, 2, 3].map(k => B.chart.filter(n => n.rel >= 0 && n.line === k).map(n => n.rel));\n  for (const n of B.chart) {\n    if (n.rel < 0) continue;\n    const k = n.line, fl = B.floors[k], tag = song.id + " " + B.diff + " beat " + n.rel.toFixed(2) + " line " + k + ": ";\n    // R1: on screen and solid for 0.6 s before the hit, at the line\'s real place.\n    for (let dt = 0; dt <= 0.6001; dt += 0.04) {\n      const rel = n.rel - dt / spb, s = state(k, rel);\n      if (!s || s.a < 0.25) { out.push(tag + "R1 line not there " + dt.toFixed(2) + "s before"); break; }\n      const d = (n.mode === "line" ? R.floorAt(fl, n.rel) - R.floorAt(fl, rel) : n.rel - rel) * spb * px;\n      const lx = n.mode === "line" ? n.lx : laneX(n.lane), ly = -n.side * d, th = s.rot * Math.PI / 180;\n      const x = s.x + lx * Math.cos(th) - ly * Math.sin(th), y = s.y + lx * Math.sin(th) + ly * Math.cos(th);\n      if (x < 10 || x > 1270 || y < 160 || y > 712) { out.push(tag + "R1 off screen " + dt.toFixed(2) + "s before at " + Math.round(x) + "," + Math.round(y)); break; }\n    }\n    // R2 and R3, over the beat before the hit, in 32nds.\n    let prev = state(k, n.rel - 1);\n    for (let j = 1; j <= 32; j++) {\n      const rel = n.rel - 1 + j / 32 - (j === 32 ? 1e-3 : 0), s = state(k, rel);\n      if (prev && s) {\n        if (Math.abs(s.rot - prev.rot) > 180 / 32 + 0.6) { out.push(tag + "R2 turns " + Math.round(Math.abs(s.rot - prev.rot) * 32) + " deg/beat at " + rel.toFixed(2)); break; }\n        const jump = Math.hypot(s.x - prev.x, s.y - prev.y);\n        if (j > 16 && jump > 60 && !byLine[k].some(x => x >= rel - 1 / 32 - 1e-3 && x <= rel + 1e-3)) { out.push(tag + "R3 jumps " + Math.round(jump) + "px at " + rel.toFixed(2)); break; }\n      }\n      prev = s;\n    }\n    // R4: its line is up for a bar before it.\n    for (let b = n.rel - song.bar; b <= n.rel; b += 0.125) { const s = state(k, b); if (!s || s.a < 0.25) { out.push(tag + "R4 line not up at " + b.toFixed(2)); break; } }\n  }\n  return out;\n}';
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
  // The moving line's readability rules, chart by chart (see readable() below).
  const unreadable=await page.evaluate(src=>{eval(src);const R=window.__relicSong;return R.SONGS.filter(s=>s.line).flatMap(s=>s.diffs.flatMap(d=>readable(R,R.built(s,d))));},READABLE);
  assert.deepEqual(unreadable.slice(0,5),[]);
  // EZ stays tame: one line, no flips, spins, speed changes or shakes.
  const ez=await page.evaluate(()=>{const R=window.__relicSong;return R.SONGS.filter(s=>s.line).map(s=>{const B=R.built(s,'ez');return {id:s.id,lines:B.lines.slice(1).filter(l=>l.length).length,turns:B.lines[0].filter(g=>g.kind==='flip'||g.kind==='spin').length,speeds:B.floors.flat().length-4,shakes:B.fx.filter(f=>f.kind==='shake').length};});});
  for(const c of ez) assert.deepEqual([c.lines,c.turns,c.speeds,c.shakes],[0,0,0,0],c.id);
  // Onix Rising is the first boss: on EZ and HD its line only stomps (one line, no flips or spins, one
  // speed, every note from above). The stomp flip is IN and AT's.
  const onix=await page.evaluate(()=>{const R=window.__relicSong,s=R.SONGS.find(x=>x.id==='onix-rising');return s.diffs.map(d=>{const B=R.built(s,d);
    return {d,lines:B.lines.slice(1).filter(l=>l.length).length,turns:B.lines[0].filter(g=>g.kind==='flip'||g.kind==='spin').length,speeds:B.floors.flat().length-4,
      below:B.chart.filter(n=>n.mode==='line'&&n.side*Math.cos(R.lineAt(B.lines[n.line],n.rel,n.line).rot*Math.PI/180)<0).length};});});
  for(const c of onix.filter(c=>c.d==='ez'||c.d==='hd')) assert.deepEqual([c.lines,c.turns,c.speeds,c.below],[0,0,0,0],'onix '+c.d);
  assert.ok(onix.find(c=>c.d==='in').turns>0,'onix IN keeps its stomp flip');
  // Meloetta's Lesson: six practices, every note on a sound, and the line one never turns.
  const lesson=await page.evaluate(()=>{const R=window.__relicSong;return R.LESSON_STEPS.filter(s=>s.part).map(s=>{const B=R.lessonPart(s);
    return {n:s.n,notes:B.chart.length,seconds:B.seconds,silent:B.chart.filter(n=>!B.ev.some(e=>Math.abs(e.b-n.b)<0.02)).length,kinds:[...new Set(B.chart.map(n=>n.kind))].sort().join(),
      turns:B.lines?B.lines[0].filter(g=>g.kind==='flip'||g.kind==='spin').length:0,line:B.chart.some(n=>n.mode==='line')};});});
  assert.deepEqual(lesson.map(l=>l.n),[1,2,3,4,5,6]);
  for(const l of lesson){assert.equal(l.silent,0,'lesson '+l.n);assert.equal(l.turns,0,'lesson '+l.n);}
  assert.ok(lesson.find(l=>l.n===2).kinds.includes('hold')&&lesson.find(l=>l.n===5).kinds.includes('drag')&&lesson.find(l=>l.n===4).line);
  const lessonSecs=lesson.reduce((t,l)=>t+l.seconds,0);
  assert.ok(lessonSecs>=55&&lessonSecs<=95,'lesson music '+lessonSecs+'s');
  // A fresh save: the sound question, then the lesson; Pewter Steps waits for it; Esc skips it and opens it.
  const pewter=()=>page.evaluate(()=>document.querySelector('.gym .row').classList.contains('off'));
  assert.equal(await page.evaluate(()=>!document.querySelector('#first').hidden),true);
  assert.equal(await pewter(),true);
  await page.click('#f-sound');
  assert.equal(await page.evaluate(()=>!document.querySelector('#lesson').hidden),true);
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>[document.querySelector('#lesson').hidden,window.__relicSong.opts.lesson]),[true,1]);
  assert.equal(await pewter(),false);
  // The first moving line: identical scored charts with or without the one-time cue.
  const first=await page.evaluate(()=>{const R=window.__relicSong;R.start('onix-rising','hd');const card=!document.querySelector('#bosscard').hidden;
    document.querySelector('#bc-go').click();const P=R.play,firstChart=P.notes.map(n=>[n.b,n.lane,n.kind,n.len]),judged=P.judged,cue=P.cue&&P.cue.to;
    R.opts.tips.flip=1;document.querySelector('#b-quit').click();R.start('onix-rising','hd');const again=[!document.querySelector('#bosscard').hidden,R.play.cue,JSON.stringify(R.play.notes.map(n=>[n.b,n.lane,n.kind,n.len]))===JSON.stringify(firstChart),R.play.judged===judged];
    document.querySelector('#b-quit').click();return {card,cue,again};});
  assert.deepEqual(first,{card:true,cue:8,again:[false,null,true,true]});
  // Tips: queued once each, before the thing they're about.
  const tips=await page.evaluate(()=>{const R=window.__relicSong,s=R.SONGS.find(x=>x.id==='starmie-undertow'),B=R.built(s,'in');const notes=B.chart.map(n=>({...n,t:n.b*B.spb}));
    const t=R.tipsFor(s,B,notes,3);for(const x of t)R.opts.tips[x.id]=1;return {ids:t.map(x=>x.id).sort(),again:R.tipsFor(s,B,notes,3).length};});
  assert.deepEqual(tips,{ids:['below','lines','six','speed'],again:0});
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

test('Meloetta\'s Lesson pays its bonus once', async () => {
  const { payRelicLesson } = await import('../src/hub/relic-song.js');
  const { walletBalance, mergeWallet } = await import('../src/hub/rewards.js');
  const first = payRelicLesson(mergeWallet({}), { table: { lesson: 50 } });
  assert.equal(first.paid, 50);
  assert.equal(walletBalance(first.wallet).coins, 50);
  assert.equal(payRelicLesson(first.wallet, { table: { lesson: 50 } }).paid, 0);
});

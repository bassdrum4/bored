const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../src/games/content/risk.html'), 'utf8');

function functionSource(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start > 0, name + ' exists');
  const brace = html.indexOf('{', start);
  let depth = 1, end = brace + 1;
  while (depth > 0 && end < html.length) {
    if (html[end] === '{') depth++;
    if (html[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0, name + ' is complete');
  return html.slice(start, end);
}

const cpuFunctions=['riskContinentValue','riskFrontAssessment','riskDistributeSetup',
                    'riskCpuChooseAttack','riskCpuChooseFortify','executeAITurn'];

function cpuFixture(overrides={}) {
  const queue=[], actions=[];
  const state = {
    phase:'REINFORCE', turnIndex:1, _aiRunning:false, aiDifficulty:3,
    reserves:7, conqueredThisTurn:false, historyStack:[], selected:null, setupPool:[0,0],
    territories:{
      HOME:{owner:1,armies:5},
      REAR:{owner:1,armies:9},
      BORDER:{owner:0,armies:1},
      EAST:{owner:0,armies:1},
      FINAL:{owner:1,armies:1}
    },
    players:[
      {name:'Human',isAI:false,cards:[]},
      {name:'CPU',isAI:true,cards:[]}
    ],
    chat:[]
  };
  Object.assign(state,overrides);
  const context=vm.createContext({
    state, isHost:true,
    LOCS:[[0,0,'HOME',0],[1,0,'REAR',0],[2,0,'BORDER',0],
          [3,0,'EAST',1],[4,0,'FINAL',0]],
    CONTINENTS:[{bonus:4},{bonus:2}],
    ADJ:{HOME:['REAR','BORDER'],REAR:['HOME','FINAL'],BORDER:['HOME','EAST'],
         EAST:['BORDER'],FINAL:['REAR']},
    setTimeout:callback=>{queue.push(callback);return queue.length;},
    broadcastState:()=>{},
    hasValidSet:()=>false,
    processTrade:()=>{},
    awardCard:pid=>actions.push('card:'+pid),
    isConnected:()=>true,
    resolveCombat:(from,to)=>{
      actions.push('attack:'+from+':'+to);
      if(state.territories[from].armies>1){
        state.territories[from].armies--;
        state.territories[to].owner=1;
        state.territories[to].armies=1;
        state.conqueredThisTurn=true;
      }
    },
    endTurn:()=>{actions.push('end');state.turnIndex=0;}
  });
  vm.runInContext(cpuFunctions.map(functionSource).join('\n'),context);
  const pump=(max=30)=>{for(let i=0;queue.length&&i<max;i++)queue.shift()();};
  return {state,actions,queue,context,pump};
}

test('Risk solo onboarding uses one screen with optional manual placement',()=>{
  assert.match(html, /id="risk-difficulty"/);
  assert.match(html, /id="bored-cpu-count"/);
  assert.match(html, /id="risk-manual-setup"/);
  assert.match(html, /id="risk-resume"/);
  assert.match(html, /id="risk-auto-place"/);
  assert.match(html, /function riskReadSavedWar\(/);
  assert.doesNotMatch(html, /<script src="https:\/\/www\.gstatic\.com\/firebasejs\//);
  assert.doesNotMatch(html, /onclick="enterLobby\(true\)"/);
  assert.match(html, /bored\.risk\.autosave/);
  assert.match(html, /window\.__boredSnapshot/);
});

test('CPU setup spends the entire pool and keeps a useful secondary border',()=>{
  const f=cpuFixture();
  f.state.phase='SETUP';
  f.state.setupPool=[0,19];
  vm.runInContext('riskDistributeSetup(1)',f.context);
  assert.equal(f.state.setupPool[1],0);
  assert.equal(f.state.players[1].ready,true);
  const total=Object.values(f.state.territories)
    .filter(t=>t.owner===1).reduce((n,t)=>n+t.armies,0);
  assert.equal(total,5+9+1+19);
  assert.ok(f.state.territories.HOME.armies>5,
    'setup should reinforce the border facing enemy armies');
});

test('CPU completes a turn: reinforce, attack, award one card, fortify, finish',()=>{
  const f=cpuFixture();
  vm.runInContext('executeAITurn()',f.context);
  assert.equal(f.state.reserves,0);
  f.pump();
  assert.ok(f.actions.some(x=>x.startsWith('attack:')), 'CPU should attack a reachable weaker target');
  assert.ok(f.actions.includes('attack:BORDER:EAST'),'CPU should push into territory behind its first conquest');
  assert.equal(f.actions.filter(x=>x.startsWith('card:')).length,1,'only one conquest card per turn');
  assert.ok(f.actions.includes('end'),'CPU should finish its turn');
  assert.equal(f.state._aiRunning,false,'CPU must clear the running guard');
});

test('CPU pursues a nearly completed continent and rejects suicidal assaults',()=>{
  const f=cpuFixture();
  f.state.territories={
    HOME:{owner:1,armies:8},
    FRIEND:{owner:1,armies:2},
    LAST:{owner:0,armies:1},
    OTHER:{owner:0,armies:1},
    FORT:{owner:0,armies:9}
  };
  f.context.ADJ={HOME:['FRIEND','LAST','OTHER','FORT'],FRIEND:['HOME'],
    LAST:['HOME'],OTHER:['HOME'],FORT:['HOME']};
  f.context.LOCS=[[0,0,'HOME',0],[0,0,'FRIEND',0],[0,0,'LAST',0],
                  [0,0,'OTHER',1],[0,0,'FORT',1]];
  const chosen=vm.runInContext('riskCpuChooseAttack(1,3)',f.context);
  assert.equal(chosen.to,'LAST','finishing a continent outranks a random equal target');
  assert.notEqual(chosen.to,'FORT');
  f.state.territories.HOME.armies=4;
  assert.equal(vm.runInContext('riskCpuChooseAttack(1,1)',f.context),null,
    'easy opponents hesitate more before attacking');
  assert.ok(vm.runInContext('riskCpuChooseAttack(1,3)',f.context),
    'hard opponents capitalize on modest advantages');
  f.state.territories.HOME.armies=2;
  assert.equal(vm.runInContext('riskCpuChooseAttack(1,2)',f.context),null,
    'avoid throwing a two-army stack into a stronger defense');
});

test('CPU fortifies from rear via friendly routes, preserving a garrison',()=>{
  const f=cpuFixture();
  const move=vm.runInContext('riskCpuChooseFortify(1)',f.context);
  assert.ok(move,'there should be a legal route from the rear');
  assert.equal(move.from,'REAR');
  assert.equal(move.to,'HOME');
  assert.ok(move.amount>0 && move.amount<f.state.territories.REAR.armies);
});

test('Risk only scores finished human world conquest',()=>{
  assert.match(html, /return \{slug:"risk", turns, won, finished:state\?\.phase === "GAME_OVER", cpu:true\}/);
  assert.match(html, /Object\.values\(state\.territories \|\| \{\}\)\.every\(t => t\.owner === 0\)/);
});

test('Risk opens into a real turn and resumes as the human in Chrome',async t=>{
  const puppeteer=require('puppeteer-core');
  const {serve}=require('./serve.cjs');
  const executablePath=[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/chromium']
    .filter(Boolean).find(p=>fs.existsSync(p));
  assert.ok(executablePath,'Chrome required for Risk browser smoke test');
  const site=await serve(path.resolve(__dirname,'../src'));
  let browser;
  t.after(async()=>{try{await browser?.close();}finally{await site.close()}});
  browser=await puppeteer.launch({executablePath,headless:true});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request',r=>r.url().startsWith(site.origin)?r.continue():r.abort());
  await page.goto(site.origin+'/games/content/risk.html',{waitUntil:'domcontentloaded'});
  const ready=await page.evaluate(()=>{
    document.getElementById('callsign-input').value='TEST';
    document.getElementById('bored-cpu-count').value='1';
    document.getElementById('risk-difficulty').value='3';
    startSinglePlayer();
    return {phase:state.phase,turn:state.turnIndex,players:state.players.length,
      troops:Object.values(state.territories).reduce((sum,t)=>sum+t.armies,0),
      hidden:document.getElementById('overlay-layer').classList.contains('hidden')};
  });
  assert.equal(ready.phase,'REINFORCE','one click should skip tedious setup');
  assert.equal(ready.turn,0);
  assert.equal(ready.players,2);
  assert.ok(ready.troops>=80,'both sides should start with complete armies');
  assert.equal(ready.hidden,true);
  const stage=await page.evaluate(()=>{
    const info=document.getElementById('risk-turn-help').textContent;
    const army=document.getElementById('risk-auto-place');
    army.click();
    const remaining=state.reserves;
    nextPhase();nextPhase();nextPhase();
    return {info,remaining,turn:state.turnIndex};
  });
  assert.match(stage.info,/friendly territory|reinforce/i);
  assert.equal(stage.remaining,0,'Auto-place consumes remaining human reinforcements');
  assert.equal(stage.turn,1,'CPU gets the next turn');
  await page.waitForFunction(()=>state.phase==='REINFORCE' && state.turnIndex===0,{timeout:15000});
  await page.evaluate(()=>saveToLocal());
  await page.reload({waitUntil:'domcontentloaded'});
  const showsResume=await page.evaluate(()=>!document.getElementById('risk-resume').classList.contains('hidden'));
  assert.equal(showsResume,true,'saved war can be continued from the front door');
  const resumed=await page.evaluate(()=>{
    loadFromLocal();
    return {host:isHost,human:myPlayerIndex,phase:state.phase,turn:state.turnIndex,
      hidden:document.getElementById('overlay-layer').classList.contains('hidden'),
      game:window.__boredSnapshot()};
  });
  assert.equal(resumed.host,true);
  assert.equal(resumed.human,0);
  assert.equal(resumed.hidden,true);
  assert.equal(resumed.game.slug,'risk');
  assert.equal(resumed.game.won,false);
  assert.deepEqual(errors.filter(e=>!/Failed to load resource|Network error/i.test(e)),[]);
  // Deliberate manual setup must remain reachable for players who prefer it.
  await page.evaluate(()=>{
    document.getElementById('overlay-layer').classList.remove('hidden');
    document.getElementById('risk-manual-setup').checked=true;
    startSinglePlayer();
  });
  const manual=await page.evaluate(()=>({
    phase:state.phase,setup:state.setupPool[0],
    auto:!document.getElementById('risk-auto-place').classList.contains('hidden')
  }));
  assert.equal(manual.phase,'SETUP');
  assert.ok(manual.setup>0);
  assert.equal(manual.auto,true);
  await page.evaluate(()=>{
    riskAutoPlaceHuman();
    nextPhase();
  });
  await page.waitForFunction(()=>state.phase==='REINFORCE' && state.turnIndex===0,{timeout:5000});
});

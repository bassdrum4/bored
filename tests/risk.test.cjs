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

test('Risk solo onboarding starts with manual deployment and no Auto-place',()=>{
  assert.match(html, /id="risk-difficulty"/);
  assert.match(html, /id="bored-cpu-count"/);
  assert.match(html, /id="risk-resume"/);
  assert.doesNotMatch(html, /id="risk-auto-place"/);
  assert.doesNotMatch(html, /id="risk-manual-setup"/);
  assert.doesNotMatch(html, /riskAutoPlaceHuman/);
  assert.match(html, /function riskReadSavedWar\(/);
  assert.match(html, /count: e\.shiftKey \? 5 : 1/);
  assert.match(html, /Shift-click/);
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

test('CPU spreads a large reserve instead of one 100-army dump',()=>{
  const f=cpuFixture({reserves:100});
  const before=Object.fromEntries(Object.entries(f.state.territories)
    .map(([name,t])=>[name,t.armies]));
  vm.runInContext('executeAITurn()',f.context);
  const gains=Object.entries(f.state.territories)
    .filter(([,t])=>t.owner===1)
    .map(([name,t])=>t.armies-before[name]);
  const placed=gains.reduce((sum,n)=>sum+n,0);
  const carried=Number(f.state.botReserves?.[1])||0;
  assert.ok(Math.max(...gains)<=30,'no single territory may take more than the ceiling');
  assert.ok(placed<100,'the whole reserve must not be spent on one turn');
  assert.equal(placed+carried,100,'carried troops are neither dumped nor lost');
  assert.equal(f.state.reserves,0,'the shared reserve is cleared for the next player');
});

test('CPU advances a bounded column, not the whole surviving stack',()=>{
  const f=cpuFixture({reserves:0,aiDifficulty:3});
  f.state.territories.HOME.armies=100;
  f.state.territories.BORDER.armies=1;
  f.state.territories.FINAL.owner=1;
  f.state.territories.FINAL.armies=9;
  vm.runInContext('executeAITurn()',f.context);
  f.pump();
  assert.equal(f.state.territories.BORDER.owner,1,'CPU captures the border first');
  assert.ok(f.state.territories.BORDER.armies<=16,
    'only a capped column follows the conquest, not the 95 that survived');
});

test('Risk only scores finished human world conquest',()=>{
  assert.match(html, /return \{slug:"risk", turns, won, finished:state\?\.phase === "GAME_OVER", cpu:true\}/);
  assert.match(html, /Object\.values\(state\.territories \|\| \{\}\)\.every\(t => t\.owner === 0\)/);
});

test('Risk starts with manual placement; pointer Shift-click puts 5 armies and respects pool cap',async t=>{
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

  const initial=await page.evaluate(()=>{
    document.getElementById('callsign-input').value='TEST';
    document.getElementById('bored-cpu-count').value='1';
    document.getElementById('risk-difficulty').value='3';
    startSinglePlayer();
    return {
      phase:state.phase,turn:state.turnIndex,players:state.players.length,
      pool:state.setupPool[0],cpuPool:state.setupPool[1],
      hidden:document.getElementById('overlay-layer').classList.contains('hidden'),
      autoButton:document.getElementById('risk-auto-place')
    };
  });
  assert.equal(initial.phase,'SETUP','humans manually place their starting armies');
  assert.equal(initial.turn,-1,'setup phase has no active combat player');
  assert.equal(initial.players,2);
  assert.ok(initial.pool>=16,'human starts with armies still to place');
  assert.ok(initial.cpuPool>=16,'CPU deployment remains independent');
  assert.equal(initial.hidden,true);
  assert.equal(initial.autoButton,null);

  // Use actual PointerEvents on the rendered map: this verifies that
  // Shift reaches the command handler, rather than merely testing a helper.
  const placed=await page.evaluate(()=>{
    const loc=LOCS.find((item,i)=>state.territories[item[2]].owner===0 &&
      !LOCS.slice(0,i).some(prev=>Math.hypot((item[0]-prev[0])*10,(item[1]-prev[1])*7.5)<25));
    if (!loc) throw Error('No unambiguous human map position');
    const map=document.getElementById('worldCanvas');
    const rect=map.getBoundingClientRect();
    if (!rect.width || !rect.height) throw Error('World map has no dimensions');
    const click=(shift)=>{
      map.dispatchEvent(new PointerEvent('pointerdown',{
        bubbles:true, shiftKey:shift, pointerType:'mouse', button:0,
        clientX:rect.left+loc[0]*rect.width/100,
        clientY:rect.top+loc[1]*rect.height/100
      }));
    };
    const start=state.setupPool[0], prior=state.territories[loc[2]].armies;
    click(true);
    const afterShift={pool:state.setupPool[0],troops:state.territories[loc[2]].armies};
    click(false);
    const afterNormal={pool:state.setupPool[0],troops:state.territories[loc[2]].armies};
    // Shift-click should consume only the remaining amount on the last move.
    while(state.setupPool[0]>0) click(true);
    return {
      start, prior, afterShift, afterNormal, finalPool:state.setupPool[0],
      total:state.territories[loc[2]].armies-prior,
      finishEnabled:!document.getElementById('nextBtn').disabled
    };
  });
  assert.equal(placed.afterShift.pool,placed.start-5);
  assert.equal(placed.afterShift.troops,placed.prior+5);
  assert.equal(placed.afterNormal.pool,placed.start-6);
  assert.equal(placed.afterNormal.troops,placed.prior+6);
  assert.equal(placed.finalPool,0);
  assert.equal(placed.total,placed.start,'final Shift-click cannot overspend');
  assert.equal(placed.finishEnabled,true);
  const setupComplete=await page.evaluate(()=>{
    nextPhase();
    return {
      phase:state.phase,turn:state.turnIndex,
      cpuReady:state.players[1].ready,cpuPool:state.setupPool[1],
      reserves:state.reserves
    };
  });
  assert.equal(setupComplete.phase,'REINFORCE');
  assert.equal(setupComplete.turn,0);
  assert.equal(setupComplete.cpuReady,true,'CPU still deploys its starting troops');
  assert.equal(setupComplete.cpuPool,0);
  assert.ok(setupComplete.reserves>0);

  const reinforcements=await page.evaluate(()=>{
    const territory=Object.keys(state.territories).find(n=>state.territories[n].owner===0);
    const start=state.reserves, before=state.territories[territory].armies;
    processAction({type:'CLICK',target:territory,count:5},0);
    return {start,now:state.reserves,troops:state.territories[territory].armies-before};
  });
  assert.equal(reinforcements.now,Math.max(0,reinforcements.start-5));
  assert.equal(reinforcements.troops,Math.min(5,reinforcements.start),
    'reinforcement placement is clamped to remaining reserve');
  const stage=await page.evaluate(()=>{
    const territory=Object.keys(state.territories).find(n=>state.territories[n].owner===0);
    while(state.reserves>0)processAction({type:'CLICK',target:territory,count:5},0);
    nextPhase();nextPhase();nextPhase();
    return {turn:state.turnIndex};
  });
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
});

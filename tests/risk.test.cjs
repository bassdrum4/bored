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

test('Risk is an isolated single-player Bored document', () => {
  assert.match(html, /<title>Risk — Solo Command<\/title>/);
  assert.match(html, /id="bored-cpu-count"/);
  assert.doesNotMatch(html, /<script src="https:\/\/www\.gstatic\.com\/firebasejs\//);
  assert.doesNotMatch(html, /onclick="enterLobby\(true\)"/);
  assert.match(html, /bored\.risk\.autosave/);
  assert.match(html, /window\.__boredSnapshot/);
});

test('the CPU reinforces fronts, attacks adjacent enemies, and ends its turn', () => {
  const queue = [];
  const actions = [];
  const state = {
    phase: 'REINFORCE', turnIndex: 1, _aiRunning: false,
    aiDifficulty: 3, reserves: 6, conqueredThisTurn: false,
    historyStack: [], selected: null,
    territories: {
      HOME: {owner: 1, armies: 3},
      REAR: {owner: 1, armies: 5},
      BORDER: {owner: 0, armies: 1},
      EAST: {owner: 0, armies: 1}
    },
    players: [
      {name:'Human', isAI:false, cards: []},
      {name:'CPU', isAI:true, cards: []}
    ]
  };
  const context = vm.createContext({
    state, isHost: true,
    ADJ: {HOME:['REAR','BORDER'], REAR:['HOME'], BORDER:['HOME','EAST'], EAST:['BORDER']},
    LOCS: [[0,0,'HOME',0],[0,0,'REAR',0],[0,0,'BORDER',0],[0,0,'EAST',0]],
    CONTINENTS: [{bonus:2}],
    setTimeout: fn => { queue.push(fn); return queue.length; },
    broadcastState: () => {},
    hasValidSet: () => false,
    processTrade: () => {},
    awardCard: pid => actions.push('card:'+pid),
    isConnected: () => true,
    resolveCombat: (from,to) => {
      actions.push('attack:'+from+':'+to);
      if (state.territories[from].armies > 1) {
        state.territories[from].armies--;
        state.territories[to].owner=1;
        state.territories[to].armies=1;
        state.conqueredThisTurn=true;
      }
    },
    endTurn: () => actions.push('end')
  });
  vm.runInContext(functionSource('executeAITurn') + '\nexecuteAITurn();', context);
  assert.equal(state.reserves,0,'CPU should place all reinforcements');
  for (let n=0; queue.length && n<10; n++) queue.shift()();
  assert.ok(actions.some(a=>a.startsWith('attack:')), 'CPU should attack with an advantage');
  assert.ok(actions.includes('end'), 'CPU should finish its turn');
  assert.equal(state._aiRunning,false,'AI must clear its running guard');
});

test('Risk scores only a completed human conquest', () => {
  assert.match(html, /return \{slug:"risk", turns, won, finished:state\?\.phase === "GAME_OVER", cpu:true\}/);
  assert.match(html, /Object\.values\(state\.territories \|\| \{\}\)\.every\(t => t\.owner === 0\)/);
});


test('Risk starts in a real browser and the CPU plays a complete turn', async t => {
  const puppeteer = require('puppeteer-core');
  const {serve} = require('./serve.cjs');
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find(p=>fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH for Risk smoke test');
  const site=await serve(path.resolve(__dirname,'../src'));
  let browser;
  t.after(async()=>{
    try {await browser?.close();} finally {await site.close();}
  });
  browser=await puppeteer.launch({executablePath,headless:true});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.setRequestInterception(true);
  page.on('request',req=>req.url().startsWith(site.origin)?req.continue():req.abort());
  await page.goto(site.origin+'/games/content/risk.html',{waitUntil:'domcontentloaded'});
  const intro=await page.evaluate(()=>{
    document.getElementById('callsign-input').value='TEST';
    document.getElementById('bored-cpu-count').value='1';
    startSinglePlayer();
    return {players:state.players.length,stage:state.phase,choice:document.getElementById('difficulty-modal').classList.contains('hidden')};
  });
  assert.equal(intro.players,2,'one human vs one CPU');
  assert.equal(intro.stage,'LOBBY');
  assert.equal(intro.choice,false,'difficulty picker opens');
  await page.evaluate(()=>confirmDifficulty());
  await page.waitForFunction(()=>state.phase==='SETUP',{timeout:8000});
  const setup=await page.evaluate(()=>{
    state.setupPool[0]=0;
    nextPhase();
    return {territories:Object.keys(state.territories).length,phase:state.phase,ready:state.players[1].ready,aiPool:state.setupPool[1]};
  });
  assert.equal(setup.territories,42,'original world map has all 42 territories');
  assert.equal(setup.phase,'REINFORCE');
  assert.equal(setup.ready,true);
  assert.equal(setup.aiPool,0,'CPU completes its initial placements');
  const start=await page.evaluate(()=>{
    state.reserves=0;
    nextPhase(); // attack
    nextPhase(); // fortify
    nextPhase(); // CPU reinforce
    return {turn:state.turnIndex,phase:state.phase};
  });
  assert.equal(start.turn,1,'CPU takes over after human turn');
  await page.waitForFunction(()=>state.phase==='REINFORCE' && state.turnIndex===0,{timeout:15000});
  const snapshot=await page.evaluate(()=>window.__boredSnapshot());
  assert.equal(snapshot.slug,'risk');
  assert.equal(snapshot.won,false);
  assert.equal(snapshot.finished,false);
  assert.equal(snapshot.cpu,true);
  assert.deepEqual(errors.filter(e=>!/Failed to load resource|Network error/i.test(e)),[]);
});

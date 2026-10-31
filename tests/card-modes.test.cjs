'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Exercise the actual inline card-mode functions from the shipped Poker document.
const html = fs.readFileSync(path.join(__dirname, '../src/games/content/poker.html'), 'utf8');
const start = html.indexOf('/* Blackjack:');
const end = html.indexOf('function renderAlternate(){', start);
assert.ok(start > 0 && end > start, 'card-mode source is present');
const code = html.slice(start, end);
const stubs = [
  'const G = { settings:{stack:1000} };',
  'function makeDeck(){const cards=[];for(let s=0;s<4;s++)for(let rank=2;rank<=14;rank++)cards.push({rank,suit:s});return cards;}',
  'function shuffle(cards){for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}',
  'function fmt(n){return n.toLocaleString();}',
  'function render(){}',
  'function cardHTML(c){return c.rank+":"+c.suit;}',
  'function backHTML(){return "BACK";}',
  'function cardLabel(c){return c.rank+":"+c.suit;}',
  'const SUIT_SYMBOLS=["S","H","D","C"];'
].join('\n');
function makeGame(){
  return new Function(stubs + '\n' + code + '\nreturn {' +
    'bjNew,bjDeal,bjAction,bjValue,bjHTML,euNew,euDeal,euAction,euLegal,euSuit,euPower,euHTML,euFinish,' +
    'get BJ(){return BJ;},get EU(){return EU;}};')();
}
test('Blackjack plays complete rounds and never creates invalid chip balances', () => {
  const game = makeGame();
  game.bjNew();
  for(let round=0;round<100;round++){
    if(game.BJ.bank<1)game.bjNew();
    game.bjDeal();
    let turns=20;
    while(game.BJ.phase==='player' && turns--){
      const hand=game.BJ.hands[game.BJ.active];
      game.bjAction(game.bjValue(hand.cards).total<17?'hit':'stand');
    }
    assert.equal(game.BJ.phase,'over');
    assert.ok(Number.isFinite(game.BJ.bank) && game.BJ.bank>=0);
    assert.match(game.bjHTML(),/Dealer/);
  }
});
test('Euchre bowers, follow-suit, teams, and five-trick hands', () => {
  const game=makeGame();
  assert.equal(game.euSuit({rank:11,suit:2},1),1,'left bower follows trump');
  assert.ok(game.euPower({rank:11,suit:1},1,1)>game.euPower({rank:11,suit:2},1,1));
  assert.ok(game.euPower({rank:11,suit:2},1,1)>game.euPower({rank:14,suit:1},1,1));
  game.euNew();
  for(let round=0;round<100;round++){
    let turns=100;
    while(!['handOver','matchOver'].includes(game.EU.phase) && turns--){
      const state=game.EU;
      assert.equal(state.turn,0,'AI advances without user intervention');
      if(state.phase==='bid'){
        if(state.bidRound===1)game.euAction('order');
        else game.euAction('trump',[0,1,2,3].find(s=>s!==state.upcard.suit));
      }else if(state.phase==='discard')game.euAction('card',0);
      else if(state.phase==='play')game.euAction('card',game.euLegal(0)[0]);
      else assert.fail('Unexpected phase '+state.phase);
    }
    assert.ok(turns>0,'hand terminates');
    assert.equal(game.EU.tricks[0]+game.EU.tricks[1],5);
    assert.ok(game.EU.hands.every(hand=>hand.length===0));
    assert.match(game.euHTML(),/Tricks/);
    if(game.EU.phase==='matchOver')game.euNew();else game.euDeal();
  }
});

test('Euchre alone skips partner and awards four points for a sweep', () => {
  const game=makeGame();
  game.euNew();
  const state=game.EU;
  state.phase='bid';state.bidRound=2;state.turn=0;
  const trump=[0,1,2,3].find(s=>s!==state.upcard.suit);
  game.euAction('trump-alone',trump);
  assert.equal(state.alone,true);
  assert.equal(state.sittingOut,2);
  let safety=40;
  while(!['handOver','matchOver'].includes(state.phase) && safety--){
    assert.equal(state.turn,0);
    if(state.phase==='discard')game.euAction('card',0);
    else if(state.phase==='play')game.euAction('card',game.euLegal(0)[0]);
    else assert.fail('Unexpected phase '+state.phase);
  }
  assert.ok(safety>0);
  assert.equal(state.tricks[0]+state.tricks[1],5);
  assert.equal(state.hands[2].length,5,'the partner sits out all five tricks');
  state.scores=[0,0];state.tricks=[5,0];state.maker=0;state.alone=true;
  game.euFinish();
  assert.equal(state.scores[0],4,'a lone maker sweeping earns four points');
});

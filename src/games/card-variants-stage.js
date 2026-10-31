
/* Blackjack: dealer hits soft 17; naturals pay 3:2; double and one split. */
let BJ = null;
function bjValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += c.rank === 14 ? 11 : Math.min(c.rank, 10); if (c.rank === 14) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
function bjNew() {
  BJ = { bank: G.settings.stack, bet: 20, shoe: [], dealer: [], hands: [],
    active: 0, phase: 'bet', handsWon: 0, rounds: 0, message: 'Choose a wager and deal.' };
  render();
}
function bjDeal() {
  if (!BJ || !['bet','over'].includes(BJ.phase)) return;
  if (BJ.bank < 1) { BJ.message = 'Out of chips. Switch games and return to reset the table.'; render(); return; }
  BJ.bet = Math.round(Math.min(BJ.bank, Math.max(1, BJ.bet)) * 2) / 2;
  BJ.bank -= BJ.bet;
  BJ.shoe = shuffle(makeDeck());
  BJ.dealer = [];
  BJ.hands = [{ cards: [], bet: BJ.bet, done: false, split: false }];
  BJ.hands[0].cards.push(BJ.shoe.pop());
  BJ.dealer.push(BJ.shoe.pop());
  BJ.hands[0].cards.push(BJ.shoe.pop());
  BJ.dealer.push(BJ.shoe.pop());
  BJ.active = 0;
  BJ.rounds++;
  BJ.phase = 'player';
  BJ.message = 'Your turn. Hit, stand, double, or split.';
  if (bjValue(BJ.dealer).total === 21 || bjValue(BJ.hands[0].cards).total === 21) bjSettle();
  render();
}
function bjSettle() {
  const dealerNatural = BJ.dealer.length === 2 && bjValue(BJ.dealer).total === 21;
  if (!dealerNatural && BJ.hands.some(h => bjValue(h.cards).total <= 21)) {
    while (bjValue(BJ.dealer).total < 17 ||
      (bjValue(BJ.dealer).total === 17 && bjValue(BJ.dealer).soft)) BJ.dealer.push(BJ.shoe.pop());
  }
  const d = bjValue(BJ.dealer).total;
  const outcomes = [];
  for (const h of BJ.hands) {
    const value = bjValue(h.cards).total;
    const natural = !h.split && h.cards.length === 2 && value === 21;
    let paid = 0, result = '';
    if (value > 21) result = 'Bust';
    else if (dealerNatural) { paid = natural ? h.bet : 0; result = natural ? 'Push' : 'Dealer blackjack'; }
    else if (natural) { paid = 2.5 * h.bet; result = 'Blackjack! (3:2)'; }
    else if (d > 21 || value > d) { paid = 2 * h.bet; result = 'Win'; }
    else if (value === d) { paid = h.bet; result = 'Push'; }
    else result = 'Loss';
    BJ.bank += paid;
    if (paid > h.bet) BJ.handsWon++;
    h.done = true;
    outcomes.push(result);
  }
  BJ.phase = 'over';
  BJ.message = outcomes.join(' / ') + '. Dealer: ' + d + '. Bank: ' + fmt(BJ.bank) + '.';
}
function bjAction(move) {
  if (!BJ || BJ.phase !== 'player') return;
  const h = BJ.hands[BJ.active];
  if (!h || h.done) return;
  switch (move) {
    case 'hit':
      h.cards.push(BJ.shoe.pop());
      if (bjValue(h.cards).total >= 21) h.done = true;
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      if (h.cards.length !== 2 || BJ.bank < h.bet) return;
      BJ.bank -= h.bet; h.bet *= 2;
      h.cards.push(BJ.shoe.pop()); h.done = true;
      break;
    case 'split':
      if (BJ.hands.length !== 1 || h.cards.length !== 2 ||
        h.cards[0].rank !== h.cards[1].rank || BJ.bank < h.bet) return;
      BJ.bank -= h.bet;
      const moved = h.cards.pop();
      h.split = true; h.cards.push(BJ.shoe.pop());
      const second = { cards: [moved, BJ.shoe.pop()], bet: h.bet, done: false, split: true };
      BJ.hands.push(second);
      // Split aces only draw one card apiece; split 21 is not a natural.
      if (moved.rank === 14) { h.done = true; second.done = true; }
      break;
    default: return;
  }
  if (h.done) {
    while (BJ.active < BJ.hands.length && BJ.hands[BJ.active].done) BJ.active++;
    if (BJ.active === BJ.hands.length) bjSettle();
  }
  render();
}
function bjHTML() {
  const active = BJ.phase === 'player', h = BJ.hands[BJ.active];
  let out = '<div class="other-hud"><span>Chips ' + fmt(BJ.bank) + '</span><span>Rounds ' + BJ.rounds +
    '</span><span>Winning hands ' + BJ.handsWon + '</span></div><div class="other-board">' +
    '<div class="other-row"><h2>Dealer ' + (active ? '(one hidden)' : '(' + bjValue(BJ.dealer).total + ')') +
    '</h2><div class="other-cards">' +
    BJ.dealer.map((c,i) => active && i === 1 ? backHTML() : cardHTML(c)).join('') + '</div></div>';
  BJ.hands.forEach((hand,i) => {
    out += '<div class="other-hand' + (active && BJ.active === i ? ' is-active' : '') + '">' +
      '<div class="other-label">Hand ' + (i+1) + ' · Wager ' + fmt(hand.bet) +
      ' · Total ' + bjValue(hand.cards).total + '</div><div class="other-cards">' +
      hand.cards.map(c => cardHTML(c)).join('') + '</div></div>';
  });
  out += '<div class="other-message" role="status">' + BJ.message + '</div><div class="other-controls">';
  if (BJ.phase === 'bet' || BJ.phase === 'over') {
    out += '<label for="bj-bet">Wager</label><input class="other-bet" id="bj-bet" type="number" aria-label="Wager" min="1" step="5" max="' +
      BJ.bank + '" value="' + Math.min(BJ.bank,BJ.bet) + '">' +
      '<button class="btn btn-primary" data-bj="deal"' + (BJ.bank < 1 ? ' disabled' : '') + '>Deal</button>';
  } else if (active) {
    out += '<button class="btn btn-primary" data-bj="hit">Hit</button><button class="btn" data-bj="stand">Stand</button>' +
      '<button class="btn" data-bj="double"' + (h.cards.length !== 2 || BJ.bank < h.bet ? ' disabled' : '') + '>Double</button>' +
      '<button class="btn" data-bj="split"' +
      (BJ.hands.length !== 1 || h.cards.length !== 2 || h.cards[0].rank !== h.cards[1].rank || BJ.bank < h.bet ?
        ' disabled' : '') + '>Split</button>';
  }
  return out + '</div><div class="other-notes">Dealer hits soft 17 · Blackjack pays 3:2 · No insurance · Virtual chips only</div></div>';
}

/* Four-player partnership Euchre, first team to 10; stick the dealer. */
let EU = null;
const EU_NAMES = ['You','West','Partner','East'];
const euTeam = seat => seat % 2;
function euOther(trump) { return [3,2,1,0][trump]; }
function euSuit(c,trump) {
  return c.rank === 11 && c.suit === euOther(trump) ? trump : c.suit;
}
function euPower(c,led,trump) {
  if (c.rank === 11 && c.suit === trump) return 200;
  if (c.rank === 11 && c.suit === euOther(trump)) return 190;
  if (euSuit(c,trump) === trump) return 100 + c.rank;
  if (euSuit(c,trump) === led) return 30 + c.rank;
  return c.rank;
}
function euStrength(cards,trump) {
  let score = 0;
  for (const c of cards) {
    if (c.rank === 11 && c.suit === trump) score += 4.5;
    else if (c.rank === 11 && c.suit === euOther(trump)) score += 3.7;
    else if (euSuit(c,trump) === trump) score += c.rank === 14 ? 2.6 : c.rank === 13 ? 1.8 : c.rank === 12 ? 1.3 : 0.9;
    else if (c.rank === 14) score += 1.2;
    else if (c.rank === 13) score += .3;
  }
  return score;
}
function euNew() {
  EU = { dealer:3, scores:[0,0], hands:[[],[],[],[]], round:0, phase:'idle',
    trick:[], tricks:[0,0], turn:0, maker:-1, trump:-1, message:'' };
  euDeal();
}
function euDeal() {
  EU.dealer=(EU.dealer+1)%4;
  EU.round++;
  EU.deck=shuffle(makeDeck().filter(c=>c.rank>=9));
  EU.hands=[[],[],[],[]];
  for(let i=0;i<5;i++) for(let seat=0;seat<4;seat++) EU.hands[seat].push(EU.deck.pop());
  EU.upcard=EU.deck.pop();
  EU.phase='bid'; EU.bidRound=1; EU.passes=0;
  EU.trump=-1; EU.maker=-1; EU.tricks=[0,0]; EU.trick=[]; EU.played=0;
  EU.turn=(EU.dealer+1)%4;
  EU.message='Order up or pass. Your partner sits opposite.';
  euAdvance();
}
function euDiscardAI(seat) {
  const hand=EU.hands[seat]; let worst=0, value=Infinity;
  for(let i=0;i<hand.length;i++){
    const c=hand[i], suited=euSuit(c,EU.trump)===EU.trump;
    const score=suited ? euPower(c,EU.trump,EU.trump) : c.rank;
    if(score<value){worst=i;value=score;}
  }
  hand.splice(worst,1);
}
function euStartPlay() {
  EU.phase='play'; EU.trick=[];
  EU.turn=(EU.dealer+1)%4;
  EU.message='Follow suit. The left bower counts as trump.';
}
function euOrder(seat,trump) {
  EU.maker=seat; EU.trump=trump;
  if(EU.bidRound===1) {
    EU.hands[EU.dealer].push(EU.upcard);
    EU.phase='discard'; EU.turn=EU.dealer;
    EU.message='Dealer picks up the upcard and discards one.';
  } else euStartPlay();
}
function euPass() {
  EU.passes++;
  if(EU.passes===4){
    if(EU.bidRound===1){
      EU.bidRound=2; EU.passes=0; EU.turn=(EU.dealer+1)%4;
      EU.message='Turned down. Choose another suit or pass.';
    } else {
      const opts=[0,1,2,3].filter(x=>x!==EU.upcard.suit);
      opts.sort((a,b)=>euStrength(EU.hands[EU.dealer],b)-euStrength(EU.hands[EU.dealer],a));
      euOrder(EU.dealer,opts[0]);
    }
  } else EU.turn=(EU.turn+1)%4;
}
function euLegal(seat) {
  const hand=EU.hands[seat];
  if(!EU.trick.length) return hand.map((_,i)=>i);
  const led=euSuit(EU.trick[0].card,EU.trump);
  const follows=hand.map((c,i)=>euSuit(c,EU.trump)===led?i:-1).filter(i=>i!==-1);
  return follows.length?follows:hand.map((_,i)=>i);
}
function euWinner(){
  const led=euSuit(EU.trick[0].card,EU.trump);
  let winner=EU.trick[0];
  for (const played of EU.trick.slice(1))
    if(euPower(played.card,led,EU.trump)>euPower(winner.card,led,EU.trump)) winner=played;
  return winner.seat;
}
function euFinish(){
  const makerTeam=euTeam(EU.maker), tricks=EU.tricks[makerTeam];
  const points=tricks>=3?(tricks===5?2:1):2;
  const awarded=tricks>=3?makerTeam:1-makerTeam;
  EU.scores[awarded]+=points;
  EU.phase=EU.scores[awarded]>=10?'matchOver':'handOver';
  EU.message=(tricks>=3?'Makers won '+tricks+' tricks. ':'Euchred! Makers took '+tricks+' tricks. ')+
    (awarded===0?'Your team':'Opponents')+' score'+(points===1?'s ':' ')+points+
    ' point'+(points===1?'':'s')+'.'+(EU.phase==='matchOver'?' Match complete!':'');
}
function euPlay(seat,index) {
  if(EU.phase!=='play'||EU.turn!==seat||!euLegal(seat).includes(index)) return;
  const card=EU.hands[seat].splice(index,1)[0];
  EU.trick.push({seat,card});
  if(EU.trick.length===4){
    const won=euWinner();
    EU.tricks[euTeam(won)]++;
    EU.played++;
    EU.message=EU_NAMES[won]+' took trick '+EU.played+'.';
    EU.turn=won;
    if(EU.played===5){euFinish();return;}
    EU.trick=[];
  }else EU.turn=(seat+1)%4;
}
function euAICard(seat){
  const choices=euLegal(seat), hand=EU.hands[seat];
  const led=EU.trick.length?euSuit(EU.trick[0].card,EU.trump):euSuit(hand[choices[0]],EU.trump);
  const power=i=>euPower(hand[i],led,EU.trump);
  const low=choices.slice().sort((a,b)=>power(a)-power(b))[0];
  if(!EU.trick.length) return choices.slice().sort((a,b)=>power(b)-power(a))[0];
  const winner=euWinner();
  if(euTeam(winner)===euTeam(seat))return low;
  const current=EU.trick.find(t=>t.seat===winner);
  const minimum=euPower(current.card,led,EU.trump);
  const winning=choices.filter(i=>power(i)>minimum).sort((a,b)=>power(a)-power(b));
  return winning.length?winning[0]:low;
}
function euAdvance(){
  // Synchronous AI prevents stale turns after switching tables.
  for(let count=0;count<50;count++){
    if(EU.phase==='bid'){
      if(EU.turn===0)break;
      const hand=EU.hands[EU.turn];
      if(EU.bidRound===1){
        const score=euStrength(hand.concat(EU.turn===EU.dealer?[EU.upcard]:[]),EU.upcard.suit);
        if(score>=5.6)euOrder(EU.turn,EU.upcard.suit);else euPass();
      }else{
        const opts=[0,1,2,3].filter(s=>s!==EU.upcard.suit);
        opts.sort((a,b)=>euStrength(hand,b)-euStrength(hand,a));
        if(euStrength(hand,opts[0])>=5.2 || (EU.turn===EU.dealer && EU.passes===3))
          euOrder(EU.turn,opts[0]);
        else euPass();
      }
    }else if(EU.phase==='discard'){
      if(EU.turn===0)break;
      euDiscardAI(EU.turn);euStartPlay();
    }else if(EU.phase==='play'){
      if(EU.turn===0)break;
      euPlay(EU.turn,euAICard(EU.turn));
    }else break;
  }
  render();
}
function euAction(move,index){
  if(EU.phase==='bid'&&EU.turn===0){
    if(move==='pass'){
      if(EU.bidRound===2 && EU.dealer===0 && EU.passes===3)return;
      euPass();
    }else if(move==='order'&&EU.bidRound===1)euOrder(0,EU.upcard.suit);
    else if(move==='trump'&&EU.bidRound===2&&Number.isInteger(index)&&
      index>=0&&index<=3&&index!==EU.upcard.suit)euOrder(0,index);
    else return;
  }else if(EU.phase==='discard'&&EU.turn===0&&move==='card'){
    if(!Number.isInteger(index)||index<0||index>=EU.hands[0].length)return;
    EU.hands[0].splice(index,1);euStartPlay();
  }else if(EU.phase==='play'&&EU.turn===0&&move==='card'){
    if(!euLegal(0).includes(index))return;
    euPlay(0,index);
  }else return;
  euAdvance();
}
function euHTML(){
  const suitNames=['Spades','Hearts','Diamonds','Clubs'];
  let out='<div class="other-hud"><span>You + Partner '+EU.scores[0]+' / 10</span>'+
    '<span>West + East '+EU.scores[1]+' / 10</span><span>Hand '+EU.round+
    ' · Tricks '+EU.tricks[0]+'–'+EU.tricks[1]+'</span></div><div class="other-board">';
  out+='<div class="other-notes">Dealer: '+EU_NAMES[EU.dealer]+' · Trump: '+
    (EU.trump<0?'Unchosen':suitNames[EU.trump]+' '+SUIT_SYMBOLS[EU.trump])+'</div>';
  out+='<div class="euchre-seats">';
  for(const seat of [2,1,3]){
    out+='<div class="euchre-seat"><strong>'+EU_NAMES[seat]+'</strong><small>'+
      (EU.turn===seat&&['bid','discard','play'].includes(EU.phase)?'Acting · ':'')+
      (EU.dealer===seat?'Dealer':'')+'</small><div class="other-cards">'+
      EU.hands[seat].map(()=>backHTML({small:true})).join('')+'</div></div>';
  }
  out+='<div class="euchre-trick"><div class="other-label">Trick '+Math.min(5,EU.played+1)+'</div>'+
    '<div class="other-cards">'+EU.trick.map(t=>cardHTML(t.card,{small:true})).join('')+'</div></div></div>';
  if(EU.phase==='bid')out+='<div class="other-row"><h2>Upcard'+(EU.bidRound===2?' (turned down)':'')+
    '</h2><div class="other-cards">'+cardHTML(EU.upcard)+'</div></div>';
  const picking=EU.turn===0&&(EU.phase==='discard'||EU.phase==='play');
  const legal=EU.phase==='play'?euLegal(0):EU.hands[0].map((_,i)=>i);
  out+='<div class="other-hand'+(picking?' is-active':'')+'"><div class="other-label">Your hand'+
    (picking?' · '+(EU.phase==='discard'?'Choose a discard':'Play a card'):'')+'</div>'+
    '<div class="other-cards">'+EU.hands[0].map((c,i)=>
      '<button type="button" class="card-button" data-eu="card" data-i="'+i+'" aria-label="'+cardLabel(c)+
      '"'+(!picking||!legal.includes(i)?' disabled':'')+'>'+cardHTML(c)+'</button>').join('')+
    '</div></div><div class="other-message" role="status">'+EU.message+'</div><div class="other-controls">';
  if(EU.phase==='bid'&&EU.turn===0){
    if(EU.bidRound===1)out+='<button class="btn btn-primary" data-eu="order">Order up '+suitNames[EU.upcard.suit]+'</button>';
    else for(let i=0;i<4;i++)if(i!==EU.upcard.suit)
      out+='<button class="btn btn-primary" data-eu="trump" data-i="'+i+'">'+suitNames[i]+'</button>';
    if(!(EU.bidRound===2&&EU.dealer===0&&EU.passes===3))
      out+='<button class="btn" data-eu="pass">Pass</button>';
  }
  if(EU.phase==='handOver')out+='<button class="btn btn-primary" data-eu="next">Next hand</button>';
  if(EU.phase==='matchOver')out+='<button class="btn btn-primary" data-eu="next">New match</button>';
  return out+'</div><div class="other-notes">24 cards · Right and left bowers · Follow suit · Stick the dealer · First to 10<br>'+
    'Makers: 1 point for 3–4 tricks, 2 for five. Defenders: 2 points if makers are euchred.</div></div>';
}

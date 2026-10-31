
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

/*
 * Regression tests for the three card/tank games that are embedded in index.html.
 * Everything runs through the hub player, so the packed base64 payloads, the
 * injected head (Esc handler + fonts) and the games themselves are all covered.
 *
 *   node --test tests/cards.test.cjs        (CHROME_PATH if Chrome is not standard)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');

const root = path.resolve(__dirname, '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const RANK = { A: 1, J: 11, Q: 12, K: 13 };
const rankOf = id => RANK[id.slice(1)] || Number(id.slice(1));
const isRed = id => id[0] === 'H' || id[0] === 'D';

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (found) return found;
  try { const installed = require('puppeteer').executablePath(); if (fs.existsSync(installed)) return installed; } catch {}
  return null;
}

test('poker, solitaire and tank2 regressions', async t => {
  const executablePath = chromePath();
  assert.ok(executablePath, 'Chrome is required; set CHROME_PATH if it is not in a standard location');
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  t.after(async () => { await browser.close(); });

  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewport({ width: 1000, height: 900 });
  await page.goto(url);

  const frameFor = async slug => {
    await page.evaluate(id => openGame(id), slug);
    await page.waitForFunction(() => document.querySelector('#frame').contentDocument?.body?.childElementCount > 0);
    const frame = await (await page.$('#frame')).contentFrame();
    await pause(250);
    return frame;
  };
  const close = async () => {
    await page.click('#back');
    await page.waitForFunction(() => document.querySelector('#player').hidden);
  };
  const boxIn = (frame, selector) => frame.$eval(selector, el => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(20, r.height / 2), left: r.left, top: r.top };
  });
  const dragIn = async (frame, from, to) => {
    const origin = { x: from.x, y: from.y };
    await frame.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(origin.x + 18, origin.y + 18, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await pause(400);
  };

  await t.test('poker: everyone folding out ends the hand instead of throwing', async () => {
    const frame = await frameFor('poker');
    const foldedOut = await frame.evaluate(() => {
      newGame();
      G.players.forEach(p => { if (!p.isHuman) p.folded = true; });
      endBettingRound();
      return { phase: G.phase, message: G.message, stack: human().stack };
    });
    assert.equal(foldedOut.phase, 'handOver');
    assert.match(foldedOut.message, /wins/, 'the pot is awarded to the surviving player');

    const everyoneFolded = await frame.evaluate(() => {
      newGame();
      G.players.forEach(p => { p.folded = true; p.foldedAt = ++G.foldCounter; });
      G.phase = 'betting';
      scheduleNext();
      return { phase: G.phase, message: G.message };
    });
    assert.equal(everyoneFolded.phase, 'handOver', 'a table where everyone folded cannot crash');
    assert.match(everyoneFolded.message, /wins/);

    const lastPlayer = await frame.evaluate(() => {
      newGame();
      G.players.forEach(p => { if (!p.isHuman) p.folded = true; });
      scheduleNext();
      return { awaiting: G.awaitingHuman, phase: G.phase };
    });
    assert.equal(lastPlayer.awaiting, false, 'the last player left is never asked to act');
    await close();
  });

  await t.test('poker: a folded human never blocks the table and chips are conserved', async () => {
    const frame = await frameFor('poker');
    const totals = await frame.evaluate(async () => {
      newGame();
      G.settings.aiSpeed = 2;
      const seen = [];
      for (let step = 0; step < 60; step++) {
        if (G.phase === 'betting' && G.awaitingHuman && G.toAct === human()) {
          const t1 = legalTargets(human());
          humanAction(t1.canCheck ? 'check' : 'call');
        } else if (G.phase === 'draw' && G.awaitingHumanDraw) {
          doDraw();
        } else if (G.phase === 'handOver') {
          startHand();
        }
        seen.push({ hand: G.handNumber, total: G.players.reduce((sum, p) => sum + p.stack + p.totalBet, 0) });
        await new Promise(r => setTimeout(r, 20));
      }
      return seen;
    });
    const perHand = new Map();
    for (const sample of totals) {
      if (!perHand.has(sample.hand)) perHand.set(sample.hand, new Set());
      perHand.get(sample.hand).add(sample.total);
    }
    for (const [hand, values] of perHand) assert.equal(values.size, 1, 'hand ' + hand + ' must not gain or lose chips');

    const draw = await frame.evaluate(() => {
      switchVariant('draw');
      startDrawPhase();
      const awaiting = G.awaitingHumanDraw;
      G.drawSelection = new Set([0, 2]);
      doDraw();
      return { awaiting, hand: human().hand.length };
    });
    assert.equal(draw.awaiting, true, 'the draw phase waits for the human');
    assert.equal(draw.hand, 5, 'discarded cards are replaced one for one');
    await close();
  });

  await t.test('tank2: powerups equip themselves without number keys', async () => {
    const frame = await frameFor('tank2');
    await frame.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' })); });
    await pause(400);
    const collected = await frame.evaluate(() => {
      const tank = tanks[0];
      powerups.push({ x: tank.x, y: tY(tank.x) - 8, gnd: true, vy: 0, ty: PUTYPES.find(p => p.key === 'heavy') });
      updatePU();
      return { selected: selWeap, ammo: tank.ammo.heavy, auto: tank.auto };
    });
    assert.deepEqual(collected, { selected: 'heavy', ammo: 2, auto: 'heavy' });

    const fired = await frame.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      return { mode, type: proj[0] && proj[0].type, ammo: tanks[0].ammo.heavy };
    });
    assert.equal(fired.type, 'heavy', 'the equipped shell is the one that fires');
    assert.equal(fired.ammo, 1);

    const laterTurn = await frame.evaluate(() => {
      proj = []; parts = []; tanks[0].ammo.heavy = 2; tanks[0].auto = 'heavy';
      turn = 1; selWeap = 'standard'; mode = 'SWITCH'; timer = 1;
      update();
      return { turn, selected: selWeap };
    });
    assert.deepEqual(laterTurn, { turn: 0, selected: 'heavy' }, 'the pickup stays equipped on the next turn');

    const spent = await frame.evaluate(() => {
      tanks[0].ammo.heavy = 0; turn = 1; mode = 'SWITCH'; timer = 1;
      update();
      return selWeap;
    });
    assert.equal(spent, 'standard', 'a spent powerup falls back to the standard shell');
    await close();
  });

  await t.test('solitaire: a dragged card always lands on its pile', async () => {
    const frame = await frameFor('solitaire');
    await frame.waitForSelector('#pileStock .card');
    const state = await frame.evaluate(() => [...document.querySelectorAll('#tableau .pile')].map(pile =>
      [...pile.querySelectorAll('.card')].map(card => ({ id: card.dataset.id, up: card.classList.contains('up') }))));
    let move = null;
    for (let from = 0; from < 7 && !move; from++) {
      const up = state[from].filter(c => c.up);
      for (let k = up.length - 1; k >= 0 && !move; k--) {
        for (let to = 0; to < 7; to++) {
          if (to === from) continue;
          const dest = state[to];
          const top = dest.length ? dest[dest.length - 1].id : null;
          const ok = top ? (isRed(up[k].id) !== isRed(top) && rankOf(up[k].id) === rankOf(top) - 1) : rankOf(up[k].id) === 13;
          if (ok) { move = { from, to, id: up[k].id }; break; }
        }
      }
    }
    assert.ok(move, 'the deal contains at least one legal tableau move');
    await dragIn(frame, await boxIn(frame, '#tableau .pile:nth-child(' + (move.from + 1) + ') .card[data-id="' + move.id + '"]'),
      await boxIn(frame, '#tableau .pile:nth-child(' + (move.to + 1) + ')'));
    const landed = await frame.evaluate(id => {
      const el = document.querySelector('.card[data-id="' + id + '"]');
      const pile = el.parentElement.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return {
        zone: el.parentElement.dataset.zone, index: el.parentElement.dataset.index,
        transform: el.style.transform, visibility: getComputedStyle(el).visibility,
        flush: Math.abs(rect.left - pile.left) < 2,
        stuck: document.querySelectorAll('.card.dragging').length,
        ghosts: document.querySelectorAll('#dragLayer .drag-ghost').length
      };
    }, move.id);
    assert.equal(landed.zone, 'tableau');
    assert.equal(landed.index, String(move.to), 'the card is in the target pile');
    assert.equal(landed.transform, '', 'no stale transform is left behind');
    assert.equal(landed.visibility, 'visible');
    assert.equal(landed.flush, true, 'the card sits exactly on its pile');
    assert.equal(landed.stuck, 0);
    assert.equal(landed.ghosts, 0);
    await close();
  });

  await t.test('solitaire: clicking anywhere in the target pile completes the move', async () => {
    const frame = await frameFor('solitaire');
    await frame.waitForSelector('#pileStock .card');
    const state = await frame.evaluate(() => [...document.querySelectorAll('#tableau .pile')].map(pile => ({
      ids: [...pile.querySelectorAll('.card')].map(c => c.dataset.id),
      up: [...pile.querySelectorAll('.card.up')].map(c => c.dataset.id)
    })));
    let move = null;
    for (let from = 0; from < 7 && !move; from++) {
      for (let k = state[from].up.length - 1; k >= 0 && !move; k--) {
        const card = state[from].up[k];
        for (let to = 0; to < 7; to++) {
          if (to === from || !state[to].ids.length) continue;
          const top = state[to].ids[state[to].ids.length - 1];
          const hasFaceDown = state[to].up.length !== state[to].ids.length;
          if (hasFaceDown && isRed(card) !== isRed(top) && rankOf(card) === rankOf(top) - 1) { move = { from, to, id: card }; break; }
        }
      }
    }
    assert.ok(move, 'the deal contains a move whose target pile has face-down cards');
    await frame.click('#tableau .pile:nth-child(' + (move.from + 1) + ') .card[data-id="' + move.id + '"]');
    await pause(80);
    const top = await boxIn(frame, '#tableau .pile:nth-child(' + (move.to + 1) + ')');
    await page.mouse.click(top.x, top.top + 6);       // deliberately on a face-down card
    await pause(400);
    const placed = await frame.evaluate((m) => {
      const el = document.querySelector('.card[data-id="' + m.id + '"]');
      return el.parentElement.dataset.zone + ':' + el.parentElement.dataset.index;
    }, move);
    assert.equal(placed, 'tableau:' + move.to, 'tapping the face-down area still drops the selected card');
    await close();
  });

  await t.test('solitaire: an interrupted drag never hides a card', async () => {
    const frame = await frameFor('solitaire');
    await frame.waitForSelector('#pileStock .card');
    const card = await frame.evaluate(() => document.querySelector('#tableau .pile:nth-child(7) .card').dataset.id);
    const box = await boxIn(frame, '#tableau .pile:nth-child(7) .card');
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 30, { steps: 4 });
    await frame.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null, clientX: -5, clientY: -5, bubbles: true })));
    await pause(400);
    await page.mouse.up();
    const state = await frame.evaluate(id => {
      const el = document.querySelector('.card[data-id="' + id + '"]');
      return { visibility: getComputedStyle(el).visibility, stuck: document.querySelectorAll('.card.dragging').length, ghosts: document.querySelectorAll('#dragLayer .drag-ghost').length };
    }, card);
    assert.equal(state.visibility, 'visible', 'the card comes back when the pointer leaves');
    assert.equal(state.stuck, 0);
    assert.equal(state.ghosts, 0);
    await close();
  });

  await t.test('solitaire: the waste spreads three readable cards clear of the foundations', async () => {
    const frame = await frameFor('solitaire');
    await frame.waitForSelector('#pileStock .card');
    for (let i = 0; i < 3; i++) { await frame.click('#pileStock'); await pause(140); }
    const waste = await frame.evaluate(() => {
      const cards = [...document.querySelectorAll('#pileWaste .card')];
      const visible = cards.filter(c => getComputedStyle(c).visibility !== 'hidden');
      const step = parseFloat(visible[1].style.left) - parseFloat(visible[0].style.left);
      const cardWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w'));
      const right = visible[visible.length - 1].getBoundingClientRect().right;
      const foundation = document.querySelector('#foundations .pile').getBoundingClientRect().left;
      return { total: cards.length, visible: visible.length, step, cardWidth, clear: right <= foundation };
    });
    assert.equal(waste.total, 9, 'three draws fill the waste');
    assert.equal(waste.visible, 3, 'exactly three cards stay readable');
    assert.ok(waste.step >= waste.cardWidth * 0.2, 'the fanned cards are spread out, not stacked');
    assert.equal(waste.clear, true, 'the fan never reaches the foundation row');
    await close();
  });

  await t.test('solitaire: reduced motion still lands cards exactly', async () => {
    const reduced = await browser.newPage();
    await reduced.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await reduced.setViewport({ width: 1000, height: 900 });
    await reduced.goto(url);
    await reduced.evaluate(() => openGame('solitaire'));
    await reduced.waitForFunction(() => document.querySelector('#frame').contentDocument?.body?.childElementCount > 0);
    const frame = await (await reduced.$('#frame')).contentFrame();
    await frame.waitForSelector('#pileStock .card');
    const findPlan = () => frame.evaluate(() => {
      const piles = [...document.querySelectorAll('#tableau .pile')].map(pile =>
        [...pile.querySelectorAll('.card.up')].map(card => card.dataset.id));
      const rank = id => ({ A: 1, J: 11, Q: 12, K: 13 })[id.slice(1)] || Number(id.slice(1));
      const red = id => 'HD'.includes(id[0]);
      for (let from = 0; from < 7; from++) {
        for (let k = piles[from].length - 1; k >= 0; k--) {
          for (let to = 0; to < 7; to++) {
            if (to === from) continue;
            const all = [...document.querySelectorAll('#tableau .pile')[to].querySelectorAll('.card')].map(c => c.dataset.id);
            const top = all.length ? all[all.length - 1] : null;
            const ok = top ? (red(piles[from][k]) !== red(top) && rank(piles[from][k]) === rank(top) - 1) : rank(piles[from][k]) === 13;
            if (ok) return { from, to, id: piles[from][k] };
          }
        }
      }
      return null;
    });
    /* A random deal may have no tableau move at all — deal again until it does. */
    let plan = null;
    for (let attempt = 0; attempt < 15 && !plan; attempt++) {
      plan = await findPlan();
      if (!plan) { await frame.click('#btnNew'); await pause(250); }
    }
    assert.ok(plan, 'a deal with a legal tableau move is found');
    if (plan) {
      const from = await frame.$eval('#tableau .pile:nth-child(' + (plan.from + 1) + ') .card[data-id="' + plan.id + '"]', el => {
        const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 };
      });
      const to = await frame.$eval('#tableau .pile:nth-child(' + (plan.to + 1) + ')', el => {
        const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 };
      });
      await reduced.mouse.move(from.x, from.y);
      await reduced.mouse.down();
      await reduced.mouse.move(from.x + 18, from.y + 18, { steps: 4 });
      await reduced.mouse.move(to.x, to.y, { steps: 8 });
      await reduced.mouse.up();
      await pause(400);
      const landed = await frame.evaluate(id => {
        const el = document.querySelector('.card[data-id="' + id + '"]');
        const pile = el.parentElement.getBoundingClientRect();
        return { transform: el.style.transform, flush: Math.abs(el.getBoundingClientRect().left - pile.left) < 2 };
      }, plan.id);
      assert.equal(landed.transform, '', 'reduced motion leaves no dangling transform');
      assert.equal(landed.flush, true, 'the card is drawn on its pile');
    }
    await reduced.close();
  });

  assert.deepEqual(errors, [], 'no uncaught errors across the three games');
});

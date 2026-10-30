// The four generated arcade games. nativeHTML() serializes arcadeGame() into the iframe document.

function arcadeGame(kind) {
  const $ = selector => document.querySelector(selector);
  const board = $('#board'), status = $('#status'), stats = $('#stats');
  const read = key => { try { return Number(localStorage.getItem('bored.best.' + key)) || 0; } catch { return 0; } };
  const write = (key, value) => { try { localStorage.setItem('bored.best.' + key, String(value)); } catch {} };
  const shuffle = list => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const button = (label, action, parent = $('#actions')) => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.onclick = action;
    parent.appendChild(el); return el;
  };
  const titles = { '2048': '2048', memory: 'Memory', 'connect-four': 'Connect Four', 'aim-lab': 'Aim Lab' };
  $('#title').textContent = titles[kind];
  document.title = titles[kind] + ' — Bored';

  if (kind === '2048') {
    $('#instructions').textContent = 'Arrow keys, WASD, swipe, or tap the arrows. Equal tiles merge once per move. Reach 2048, then keep going.';
    board.className = 'tiles'; board.setAttribute('aria-label', '2048 board');
    let cells, score, previous, best = read(kind), won, undoUsed = false;
    // A Bored Together duel deals everyone the same opening board: the bridge
    // supplies the match seed before this script runs, so both spawns and every
    // restart come from one stream. Ordinary play keeps Math.random.
    const matchSeed = () => {
      const bridge = window.__boredTogether?.context?.state?.seed;
      const injected = window.__boredSeed;
      const seed = Number.isFinite(bridge) ? bridge : injected?.match ? injected.seed : null;
      return Number.isFinite(seed) ? seed >>> 0 : null;
    };
    function makeRand(start) {
      let state = start >>> 0;
      return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const seed = matchSeed();
    let rand = seed === null ? Math.random : makeRand(seed);
    // The hub ranks a duel on the score, and needs to know when the board is out
    // of moves, exactly like the "No moves left" line already shown.
    window.__boredSnapshot = () => ({ slug: kind, tile: Math.max(...cells), score, finished: !canMove(), undoUsed });
    function collapse(line) {
      const values = line.filter(Boolean), out = [];
      let gained = 0;
      for (let i = 0; i < values.length; i++) {
        if (values[i] === values[i + 1]) { out.push(values[i] * 2); gained += values[i] * 2; i++; }
        else out.push(values[i]);
      }
      while (out.length < 4) out.push(0);
      return { line: out, gained };
    }
    function spawn() {
      const empty = cells.flatMap((value, i) => value ? [] : [i]);
      if (empty.length) cells[empty[Math.floor(rand() * empty.length)]] = rand() < .9 ? 2 : 4;
    }
    function canMove() {
      return cells.some((value, i) => !value || (i % 4 < 3 && value === cells[i + 1]) || (i < 12 && value === cells[i + 4]));
    }
    function draw() {
      board.replaceChildren();
      for (const value of cells) {
        const tile = document.createElement('div'); tile.className = 'tile';
        tile.textContent = value || ''; tile.dataset.value = value;
        tile.setAttribute('aria-label', value ? String(value) : 'Empty');
        if (value) {
          const level = Math.log2(value);
          tile.style.background = 'hsl(' + Math.max(8, 42 - level * 3) + ' 65% ' + Math.max(30, 94 - level * 6) + '%)';
          tile.style.color = value >= 16 ? '#fff9ed' : '#191713';
        }
        board.appendChild(tile);
      }
      if (score > best) { best = score; write(kind, best); }
      stats.textContent = 'Score ' + score + ' / Best ' + best;
      undo.disabled = !previous;
      if (!canMove()) status.textContent = 'No moves left. Undo or start a new game.';
      else if (cells.includes(2048) && !won) { won = true; status.textContent = '2048! You did it. Keep going for a bigger tile.'; }
    }
    function move(direction) {
      const next = cells.slice(); let gained = 0;
      for (let n = 0; n < 4; n++) {
        let indices = Array.from({ length: 4 }, (_, i) => direction === 'left' || direction === 'right' ? n * 4 + i : i * 4 + n);
        if (direction === 'right' || direction === 'down') indices.reverse();
        const result = collapse(indices.map(i => cells[i])); gained += result.gained;
        indices.forEach((i, j) => { next[i] = result.line[j]; });
      }
      if (next.every((value, i) => value === cells[i])) return;
      previous = { cells: cells.slice(), score, won }; cells = next; score += gained;
      status.textContent = 'Keep merging.'; spawn(); draw();
    }
    function reset() {
      cells = Array(16).fill(0); score = 0; previous = null; won = false; undoUsed = false;
      // Restarting a duel replays the same opening board rather than rerolling it.
      if (seed !== null) rand = makeRand(seed);
      spawn(); spawn(); status.textContent = 'Your next high score starts here.'; draw();
    }
    button('New game', reset);
    const undo = button('Undo', () => {
      if (!previous) return;
      ({ cells, score, won } = previous); previous = null; undoUsed = true; status.textContent = 'Move undone.'; draw();
    });
    const arrows = document.createElement('div'); arrows.className = 'arrows'; $('#app').appendChild(arrows);
    for (const [label, dir] of [['←', 'left'], ['↑', 'up'], ['↓', 'down'], ['→', 'right']]) {
      const el = button(label, () => move(dir), arrows); el.setAttribute('aria-label', 'Move ' + dir);
    }
    addEventListener('keydown', e => {
      const direction = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down' }[e.key];
      if (direction && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); move(direction); }
    });
    let touch;
    board.addEventListener('pointerdown', e => { touch = [e.clientX, e.clientY]; board.setPointerCapture(e.pointerId); });
    board.addEventListener('pointercancel', () => { touch = null; });
    board.addEventListener('pointerup', e => {
      if (!touch) return;
      const dx = e.clientX - touch[0], dy = e.clientY - touch[1]; touch = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    reset();
  }

  if (kind === 'memory') {
    $('#instructions').textContent = 'Flip two cards at a time. Find all eight pairs in as few moves as possible. Mouse, touch, Tab, and Enter all work.';
    board.className = 'memory';
    const symbols = ['☀', '☾', '★', '♠', '♥', '♣', '♦', '♫'];
    let deck, selected, matched, moves, locked, timer, best = read(kind);
    window.__boredSnapshot = () => ({ slug: kind, pairs: matched.size / 2, moves });
    function drawStats() { stats.textContent = 'Moves ' + moves + ' / Pairs ' + matched.size / 2 + '/8' + (best ? ' / Best ' + best : ''); }
    function reveal(i, el) {
      if (locked || matched.has(i) || selected.includes(i)) return;
      el.textContent = deck[i]; el.classList.add('flipped'); el.setAttribute('aria-label', 'Card ' + (i + 1) + ': ' + deck[i]);
      selected.push(i);
      if (selected.length < 2) return;
      moves++; drawStats();
      const [a, b] = selected;
      if (deck[a] === deck[b]) {
        matched.add(a); matched.add(b);
        for (const index of selected) { board.children[index].classList.add('matched'); board.children[index].disabled = true; }
        selected = []; drawStats();
        status.textContent = 'A match! ' + matched.size / 2 + ' of 8 pairs.';
        if (matched.size === 16) {
          if (!best || moves < best) { best = moves; write(kind, best); }
          status.textContent = 'All pairs found in ' + moves + ' moves. Nicely done!'; drawStats();
        }
      } else {
        locked = true; status.textContent = 'Not a match. Try another pair.';
        timer = setTimeout(() => {
          for (const index of selected) { const card = board.children[index]; card.textContent = '?'; card.classList.remove('flipped'); card.setAttribute('aria-label', 'Card ' + (index + 1) + ', face down'); }
          selected = []; locked = false;
        }, 850);
      }
    }
    function reset() {
      clearTimeout(timer); deck = shuffle([...symbols, ...symbols]); selected = []; matched = new Set(); moves = 0; locked = false;
      board.replaceChildren();
      deck.forEach((_, i) => {
        const card = button('?', () => reveal(i, card), board); card.className = 'memory-card';
        card.setAttribute('aria-label', 'Card ' + (i + 1) + ', face down');
      });
      status.textContent = 'Eight pairs. One good memory.'; drawStats();
    }
    button('Shuffle & restart', reset); reset();
  }

  if (kind === 'connect-four') {
    const online = window.__boredTogether;
    $('#instructions').textContent = 'Drop a disc into a column. Connect four horizontally, vertically, or diagonally. Use the buttons or keys 1–7. You are red; the computer is gold.';
    board.className = 'connect'; board.setAttribute('aria-label', 'Connect Four board');
    const mode = document.createElement('select'); mode.setAttribute('aria-label', 'Opponent');
    mode.innerHTML = '<option value="computer">Vs computer</option><option value="friend">Two players</option>';
    $('#actions').appendChild(mode);
    const columns = document.createElement('div'); columns.className = 'columns'; board.before(columns);
    let cells, turn, over, busy, timer, sessionWins = 0;
    window.__boredSnapshot = () => ({ slug: kind, won: over && winner(cells, 1) ? 1 : 0, wins: sessionWins, cpu: mode.value === 'computer' });
    const columnButtons = Array.from({ length: 7 }, (_, col) => {
      const el = button('↓', () => play(col), columns); el.setAttribute('aria-label', 'Drop in column ' + (col + 1)); return el;
    });
    function landing(state, col) { for (let row = 5; row >= 0; row--) if (!state[row * 7 + col]) return row * 7 + col; return -1; }
    function winner(state, player) {
      for (let row = 0; row < 6; row++) for (let col = 0; col < 7; col++) {
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          if (row + dr * 3 >= 6 || col + dc * 3 < 0 || col + dc * 3 >= 7) continue;
          if ([0, 1, 2, 3].every(n => state[(row + dr * n) * 7 + col + dc * n] === player)) return true;
        }
      }
      return false;
    }
    const order = [3, 2, 4, 1, 5, 0, 6];
    function evaluate(state) {
      let score = 0;
      for (let row = 0; row < 6; row++) { if (state[row * 7 + 3] === 2) score += 3; if (state[row * 7 + 3] === 1) score -= 3; }
      for (let row = 0; row < 6; row++) for (let col = 0; col < 7; col++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        if (row + dr * 3 >= 6 || col + dc * 3 < 0 || col + dc * 3 >= 7) continue;
        const line = [0, 1, 2, 3].map(n => state[(row + dr * n) * 7 + col + dc * n]);
        const ai = line.filter(v => v === 2).length, human = line.filter(v => v === 1).length;
        if (!human) score += [0, 1, 8, 60, 10000][ai];
        if (!ai) score -= [0, 1, 8, 70, 10000][human];
      }
      return score;
    }
    function minimax(state, depth, player, alpha, beta) {
      if (winner(state, 2)) return 100000 + depth;
      if (winner(state, 1)) return -100000 - depth;
      const available = order.filter(col => landing(state, col) >= 0);
      if (!available.length) return 0;
      if (!depth) return evaluate(state);
      let value = player === 2 ? -Infinity : Infinity;
      for (const col of available) {
        const next = state.slice(); next[landing(next, col)] = player;
        const result = minimax(next, depth - 1, 3 - player, alpha, beta);
        value = player === 2 ? Math.max(value, result) : Math.min(value, result);
        if (player === 2) alpha = Math.max(alpha, value); else beta = Math.min(beta, value);
        if (beta <= alpha) break;
      }
      return value;
    }
    function chooseMove(state) {
      let best = -Infinity, chosen = 3;
      for (const col of order) {
        const index = landing(state, col); if (index < 0) continue;
        const next = state.slice(); next[index] = 2;
        const value = minimax(next, 3, 1, -Infinity, Infinity);
        if (value > best) { best = value; chosen = col; }
      }
      return chosen;
    }
    function draw() {
      board.replaceChildren();
      cells.forEach((value, i) => {
        const disc = document.createElement('div'); disc.className = 'disc p' + value;
        disc.setAttribute('aria-label', 'Row ' + (Math.floor(i / 7) + 1) + ', column ' + (i % 7 + 1) + ': ' + (value === 1 ? 'red' : value === 2 ? 'gold' : 'empty'));
        board.appendChild(disc);
      });
      columnButtons.forEach((el, col) => { el.disabled = over || busy || landing(cells, col) < 0; });
      stats.textContent = mode.value === 'computer' ? 'You: red / Computer: gold' : 'Player 1: red / Player 2: gold';
    }
    function drop(col) {
      const index = landing(cells, col); if (index < 0) return false;
      cells[index] = turn;
      if (winner(cells, turn)) { over = true; if (turn === 1 && mode.value === 'computer') sessionWins++; status.textContent = (turn === 1 ? 'Red' : 'Gold') + ' wins! Play again?'; }
      else if (cells.every(Boolean)) { over = true; status.textContent = 'A draw. Good defense on both sides.'; }
      else { turn = 3 - turn; status.textContent = (turn === 1 ? 'Red' : 'Gold') + ' to move.'; }
      draw(); return true;
    }
    function play(col) {
      if (online) { if (!over && !busy && online.context.canPlay && landing(cells, col) >= 0) saveTurn(col); return; }
      if (over || busy || !drop(col) || over || mode.value !== 'computer') return;
      busy = true; status.textContent = 'The computer is thinking…'; draw();
      timer = setTimeout(() => { const col = chooseMove(cells); busy = false; drop(col); }, 260);
    }
    function reset() { clearTimeout(timer); cells = Array(42).fill(0); turn = 1; over = false; busy = false; status.textContent = 'Red goes first. Pick a column.'; draw(); }
    mode.onchange = reset; button('New game', reset);
    addEventListener('keydown', e => { if (/^[1-7]$/.test(e.key) && e.target.tagName !== 'SELECT') { e.preventDefault(); play(Number(e.key) - 1); } });
    function restoreOnline() {
      const match = online.context;
      cells = match.state.board.slice(); turn = match.seat; over = match.status !== 'active'; busy = !match.canPlay;
      draw();
      stats.textContent = match.players[0] + ': red / ' + match.players[1] + ': gold';
      status.textContent = over ? 'Game finished.' : match.canPlay ? 'Your turn. Pick a column.' : 'Their turn. Your game is saved.';
    }
    async function saveTurn(col) {
      busy = true; draw(); status.textContent = 'Saving your move…';
      try { await online.submit({ column: col }); restoreOnline(); online.finishTurn(); }
      catch (error) { status.textContent = 'Move not confirmed.'; online.error(error, () => saveTurn(col)); }
    }
    if (online) {
      $('#actions').hidden = true;
      $('#instructions').textContent = 'Connect four horizontally, vertically, or diagonally. Use the buttons or keys 1–7. Your turn saves automatically.';
      restoreOnline();
    } else reset();
  }

  if (kind === 'aim-lab') {
    $('#instructions').textContent = 'Two 20-second rounds: first hit visible targets, then memorize five numbered targets and hit their hidden positions in order. Your score is the total hits across both rounds. Click or tap; misses reduce accuracy. The clock keeps running if you switch tabs.';
    board.className = 'aim';
    const target = button('◎', hit, board); target.className = 'target'; target.setAttribute('aria-label', 'Hit target'); target.hidden = true;
    const markers = Array.from({ length: 5 }, (_, index) => {
      const el = document.createElement('span');
      el.className = 'memory-target'; el.textContent = String(index + 1);
      el.setAttribute('aria-hidden', 'true'); el.hidden = true; board.appendChild(el);
      return el;
    });
    const size = document.createElement('select'); size.setAttribute('aria-label', 'Target difficulty');
    size.innerHTML = '<option value="64">Normal targets</option><option value="44">Small targets</option>';
    $('#actions').appendChild(size);
    let hits = 0, shots = 0, normalHits = 0, normalShots = 0, blindHits = 0;
    let end = 0, previewEnd = 0, recallEnd = 0, timer, active = false, finished = false;
    let phase = 'ready', wave = [], nextMemoryTarget = 0, best = 0, runNormal = true;
    window.__boredSnapshot = () => ({
      slug: kind, hits, normalHits, blindHits, finished,
      accuracy: shots ? hits / shots * 100 : 0,
      normalAccuracy: normalShots ? normalHits / normalShots * 100 : 0,
      normal: runNormal
    });
    // The old 20-second score is not comparable to a 40-second two-round score.
    const bestKey = () => kind + '.duo-v1.' + size.value;
    function draw() {
      const seconds = active ? Math.max(0, Math.ceil((end - performance.now()) / 1000)) : finished ? 0 : 20;
      const round = phase === 'normal' ? 'Round 1/2 · Normal' :
        phase === 'blind-preview' || phase === 'blind-recall' ? 'Round 2/2 · Blindfire' :
        finished ? 'Both rounds complete' : 'Two rounds';
      stats.textContent = 'Hits ' + hits + ' / Accuracy ' + (shots ? Math.round(hits / shots * 100) : 0) +
        '% / ' + seconds + 's / Best ' + best + ' · ' + round +
        ' · Normal ' + normalHits + ' · Blindfire ' + blindHits;
    }
    function position() {
      const diameter = Number(size.value), gap = diameter / 2 + 8;
      target.style.width = target.style.height = diameter + 'px';
      target.style.left = gap + Math.random() * Math.max(0, board.clientWidth - gap * 2) + 'px';
      target.style.top = gap + Math.random() * Math.max(0, board.clientHeight - gap * 2) + 'px';
    }
    function hideMarkers() { for (const marker of markers) marker.hidden = true; }
    function startWave(now) {
      // One target per grid cell avoids accidental overlap on narrow phones.
      const cells = shuffle(Array.from({ length: 9 }, (_, i) => i)).slice(0, 5);
      const width = board.clientWidth || 320, height = board.clientHeight || 260;
      const margin = Math.max(20, Number(size.value) / 2 + 4);
      wave = cells.map(cell => {
        const col = cell % 3, row = Math.floor(cell / 3);
        return {
          x: margin + (col + .5) / 3 * (width - 2 * margin),
          y: margin + (row + .5) / 3 * (height - 2 * margin)
        };
      });
      nextMemoryTarget = 0;
      phase = 'blind-preview';
      previewEnd = now + 1200;
      markers.forEach((marker, i) => {
        marker.style.left = wave[i].x + 'px'; marker.style.top = wave[i].y + 'px';
        marker.style.width = marker.style.height = Math.min(46, Number(size.value)) + 'px';
        marker.hidden = false;
      });
      status.textContent = 'Blindfire: memorize targets 1–5. They disappear in a moment.';
    }
    function beginBlindfire(now) {
      normalHits = hits;
      phase = 'blind-preview';
      target.hidden = true;
      end = now + 20000;
      startWave(now);
    }
    function finish() {
      if (finished) return;
      active = false; finished = true; phase = 'done';
      clearInterval(timer); target.hidden = true; hideMarkers();
      size.disabled = false; start.textContent = 'Play again';
      if (hits > best) { best = hits; write(bestKey(), best); }
      status.textContent = 'Time! ' + normalHits + ' normal + ' + blindHits +
        ' Blindfire = ' + hits + ' hits (' + (shots ? Math.round(hits / shots * 100) : 0) + '% accuracy).';
      draw();
    }
    function tick() {
      if (!active) return;
      const now = performance.now();
      if (phase === 'normal' && now >= end) beginBlindfire(now);
      if (phase === 'blind-preview' || phase === 'blind-recall') {
        if (now >= end) { finish(); return; }
        if (phase === 'blind-preview' && now >= previewEnd) {
          hideMarkers(); phase = 'blind-recall'; recallEnd = now + 4500;
          status.textContent = 'Blindfire: click where target 1 was, then 2, 3, 4 and 5.';
        } else if (phase === 'blind-recall' && now >= recallEnd) startWave(now);
      }
      draw();
    }
    function hit(e) {
      e.stopPropagation();
      if (!active) return;
      if (performance.now() >= end) { tick(); return; }
      if (phase !== 'normal') return;
      hits++; normalHits++; shots++; normalShots++; position(); draw();
    }
    board.addEventListener('click', event => {
      if (!active) return;
      if (performance.now() >= end) { tick(); return; }
      if (phase === 'normal') {
        shots++; normalShots++; draw(); return;
      }
      if (phase !== 'blind-recall') return;
      shots++;
      const rect = board.getBoundingClientRect();
      const x = (event.clientX - rect.left) * board.clientWidth / rect.width;
      const y = (event.clientY - rect.top) * board.clientHeight / rect.height;
      const required = wave[nextMemoryTarget];
      if (required && Math.hypot(x - required.x, y - required.y) <= Math.max(20, Number(size.value) * .43)) {
        hits++; blindHits++; nextMemoryTarget++;
        if (nextMemoryTarget === wave.length) startWave(performance.now());
        else status.textContent = 'Blindfire: remembered! Now hit target ' + (nextMemoryTarget + 1) + '.';
      } else {
        status.textContent = 'Blindfire: miss. Look for target ' + (nextMemoryTarget + 1) + '.';
      }
      draw();
    });
    const start = button('Start challenge', () => {
      clearInterval(timer); hits = shots = normalHits = normalShots = blindHits = 0;
      best = read(bestKey()); active = true; finished = false; phase = 'normal';
      runNormal = size.value === '64'; end = performance.now() + 20000;
      hideMarkers(); size.disabled = true; target.hidden = false; position();
      start.textContent = 'Restart'; status.textContent = 'Round 1: hit visible targets for 20 seconds.';
      draw(); timer = setInterval(tick, 100);
    });
    size.onchange = () => { best = read(bestKey()); draw(); };
    addEventListener('resize', () => {
      if (!active) return;
      if (phase === 'normal') position();
      // Resizing during Blindfire starts a fresh visible pattern instead of
      // making a memorized pattern impossible to hit at old coordinates.
      else if (phase === 'blind-preview' || phase === 'blind-recall') startWave(performance.now());
    });
    best = read(bestKey()); status.textContent = 'Ready for Normal + Blindfire.'; draw();
  }
}

export function nativeHTML(slug) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bored game</title><style>' +
    '*{box-sizing:border-box}body{margin:0;background:#f5f2ea;color:#191713;font:16px/1.5 Georgia,serif}' +
    '[hidden]{display:none!important}#app{max-width:520px;margin:auto;padding:76px 18px 34px}h1{font-size:42px;font-weight:400;margin:0 0 8px}' +
    '#stats{font:12px/1.7 ui-monospace,monospace;color:#6b6558}#actions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}' +
    'button,select{font:13px ui-monospace,monospace;background:#f5f2ea;color:#191713;border:1px solid #d8d2c4;padding:10px 12px;cursor:pointer;touch-action:manipulation}' +
    'button:hover{border-color:#191713}button:focus-visible,select:focus-visible{outline:3px solid #b3261e;outline-offset:2px}button:disabled{opacity:.45;cursor:default}' +
    '#status{min-height:24px;font-size:15px}#instructions{font-size:14px;color:#6b6558;margin-top:20px}textarea{width:100%;max-width:100%;padding:12px;background:#fff9ed;color:#191713;border:1px solid #d8d2c4;font:12px/1.7 ui-monospace,monospace}' +
    '.tiles,.memory{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.tiles{background:#d8d2c4;padding:9px;touch-action:none}' +
    '.tile{aspect-ratio:1;display:grid;place-items:center;background:#e9e3d5;font:bold clamp(20px,6vw,38px) Georgia,serif;min-width:0}' +
    '.arrows{display:flex;gap:8px;justify-content:center;margin:16px 0}.arrows button{min-width:52px;font-size:22px}' +
    '.memory-card{aspect-ratio:1;background:#191713;color:#f5f2ea;font-size:34px;padding:0}.memory-card.flipped{background:#eee4d0;color:#191713}.memory-card.matched{opacity:1;background:#dce3cf;color:#344827}' +
    '.connect,.columns{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.connect{padding:10px;background:#292e38}.columns{padding:0 10px;margin-bottom:8px}.columns button{padding:7px 0;min-width:0}' +
    '.disc{aspect-ratio:1;border-radius:50%;background:#f5f2ea}.disc.p1{background:#b3261e}.disc.p2{background:#e7af35}' +
    '.aim{position:relative;min-height:240px;height:min(48vh,370px);border:1px solid #d8d2c4;background:repeating-linear-gradient(0deg,transparent,transparent 31px,#e8e2d5 32px),repeating-linear-gradient(90deg,transparent,transparent 31px,#e8e2d5 32px);overflow:hidden}' +
    '.target{position:absolute;transform:translate(-50%,-50%);border-radius:50%;border:0;background:#b3261e;color:#fff;font-size:34px;padding:0;line-height:1}' +
    '.memory-target{position:absolute;display:grid;place-items:center;transform:translate(-50%,-50%);pointer-events:none;border-radius:50%;background:#253b30;color:#f5f2ea;font:bold 20px ui-monospace,monospace;box-shadow:0 0 0 3px #f5f2ea,0 0 0 5px #253b30}' +
    '@media(max-width:380px){#app{padding-left:12px;padding-right:12px}.tiles,.memory{gap:6px}#stats{font-size:11px}}' +
    '</style></head><body><main id="app"><h1 id="title"></h1><p id="stats"></p><div id="actions"></div><div id="board"></div><p id="status" role="status" aria-live="polite"></p><p id="instructions"></p></main><scr' +
    'ipt>(' + arcadeGame.toString() + ')(' + JSON.stringify(slug) + ');<\/scr' + 'ipt></body></html>';
}

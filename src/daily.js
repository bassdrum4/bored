// Daily challenge definitions and verification. Kept data-only so it can be tested in isolation.

// The challenge day rolls over at midnight in Detroit (Eastern Time) wherever
// the player is; Intl applies the daylight-saving shifts for free. The formatter
// is built once and cached on the function, which keeps it self-contained.
export function dailyDate(now = new Date()) {
  dailyDate.day ||= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return dailyDate.day.format(now);
}

// One shared seed for anything that generates a board, so the first run of a day
// plays out the same for everyone. The hub injects it into every game as
// `window.__boredSeed = { date, seed, code }`; games that seed themselves (DEEP)
// derive exactly this value from the date, so the two always agree.
export function seedNumber(date) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < date.length; i++) {
    hash ^= date.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function seedCode(seed) {
  return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
}

/**
 * Consecutive days with a verified completion.
 *
 * `dates` are challenge days (`YYYY-MM-DD`), `today` is the current challenge
 * day. A streak that ran through yesterday is still alive while today's
 * challenge is outstanding, so today only has to be complete for the streak to
 * have grown — not for it to survive. Everything is self-contained because the
 * test suite extracts this function body and runs it on its own.
 */
export function dailyStreak(dates, today) {
  const back = (date, days) => {
    const at = new Date(date + 'T00:00:00Z');
    at.setUTCDate(at.getUTCDate() + days);
    return at.toISOString().slice(0, 10);
  };
  const done = new Set(dates);
  const sorted = [...done].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === back(sorted[i - 1], 1) ? run + 1 : 1;
    if (run > best) best = run;
  }
  const yesterday = back(today, -1);
  const start = done.has(today) ? today : (done.has(yesterday) ? yesterday : null);
  let current = 0;
  for (let cursor = start; cursor && done.has(cursor); cursor = back(cursor, -1)) current++;
  return { current, best };
}
// Each adapter reads current-run state, never saved high scores. Thresholds rotate every circuit.
export const CHALLENGES = [
  { slug: 'minigolf', label: 'On the green', goal: 'Sink {target} holes in one round of Minigolf.', metric: 'holes', targets: [3, 6, 9], unit: 'holes sunk' },
  { slug: 'tetris', label: 'Line sweep', goal: 'Clear {target} lines in one run.', metric: 'lines', targets: [10, 15, 20], unit: 'lines' },
  { slug: 'snake', label: 'Hungry snake', goal: 'Eat {target} apples in one run without crashing.', metric: 'apples', targets: [10, 15, 20], unit: 'apples' },
  { slug: 'wordle', label: 'Word detective', goal: 'Solve a word in {target} guesses or fewer.', metric: 'guesses', targets: [4, 3, 5], rule: 'word', unit: 'guesses' },
  { slug: 'space-invaders', label: 'Sky defender', goal: 'Clear {target} alien waves in one run.', metric: 'waves', targets: [1, 2, 3], unit: 'waves cleared' },
  { slug: '2048', label: 'Merge master', goal: 'Build a {target} tile without using Undo.', metric: 'tile', targets: [256, 512, 1024], rule: 'merge', unit: 'largest tile' },
  { slug: 'simon', label: 'Perfect recall', goal: 'Correctly repeat a {target}-step sequence. Watching it is not enough!', metric: 'rounds', targets: [8, 10, 12], unit: 'rounds completed' },
  { slug: 'breakout', label: 'Brick demolition', goal: 'Clear {target} complete brick layouts in one run.', metric: 'layouts', targets: [1, 2, 3], unit: 'layouts cleared' },
  { slug: 'memory', label: 'Sharp memory', goal: 'Find all eight pairs in {target} moves or fewer.', metric: 'moves', targets: [20, 16, 12], rule: 'memory', unit: 'moves' },
  { slug: 'frogger', label: 'Homeward hops', goal: 'Fill {target} lily pads in the same level.', metric: 'homes', targets: [3, 4, 5], unit: 'lily pads' },
  { slug: 'connect-four', label: 'Outsmart the computer', goal: 'Win as Red against the computer—not two-player mode.', metric: 'won', targets: [1, 1, 1], rule: 'connect', unit: 'computer wins' },
  { slug: 'asteroids', label: 'Rock breaker', goal: 'Clear {target} asteroid waves in one run.', metric: 'waves', targets: [2, 3, 4], unit: 'waves cleared' },
  { slug: 'pac-man', label: 'Ghost-town feast', goal: 'Earn {target} points in one maze run.', metric: 'score', targets: [1500, 2500, 4000], unit: 'points' },
  { slug: 'aim-lab', label: 'Precision under pressure', goal: 'Finish both Aim Lab rounds with at least {target} Normal-round hits and 80% Normal accuracy.', metric: 'hits', targets: [20, 25, 30], rule: 'aim', unit: 'hits' },
  { slug: 'qbert', label: 'Paint the pyramid', goal: 'Complete {target} pyramid levels in one run.', metric: 'levels', targets: [1, 2, 3], unit: 'levels cleared' },
  { slug: 'minesweeper', label: 'Clean sweep', goal: 'Win a standard Beginner or harder board within {target} seconds, without hints.', metric: 'seconds', targets: [180, 120, 90], rule: 'mines', unit: 'seconds' },
  { slug: 'lights-out', label: 'Dark room', goal: 'Clear {target} boards in one session.', metric: 'cleared', targets: [2, 3, 4], unit: 'boards' },
  { slug: 'pong', label: 'Paddle supremacy', goal: 'Score {target} points against the CPU in one match.', metric: 'points', targets: [5, 7, 10], rule: 'cpu', unit: 'points' },
  { slug: 'sumo', label: 'Ring ruler', goal: 'Win {target} rounds as Player 1 against the CPU in one match.', metric: 'wins', targets: [3, 4, 5], rule: 'cpu', unit: 'rounds won' },
  { slug: 'poker', label: 'Chip builder', goal: 'Finish a hand at least {target} chips above your starting stack.', metric: 'profit', targets: [200, 400, 600], rule: 'poker', unit: 'chips profit' },
  { slug: 'tank', label: 'Armored ace', goal: 'Win {target} rounds as P1 with the AI enabled throughout.', metric: 'wins', targets: [2, 3, 4], rule: 'cpu', unit: 'rounds won' },
  { slug: 'void-runner', label: 'Into the void', goal: 'Reach {target} points in one run.', metric: 'score', targets: [2000, 4000, 6000], unit: 'points' },
  { slug: 'solitaire', label: 'Foundation builder', goal: 'Move {target} cards onto the foundations in one deal.', metric: 'cards', targets: [12, 20, 28], unit: 'foundation cards' },
  { slug: 'commanders', label: 'Fleet commander', goal: 'Clear {target} enemy waves in one run.', metric: 'waves', targets: [3, 5, 7], unit: 'waves cleared' },
  { slug: 'lava', label: 'The floor is yours', goal: 'Score {target} points as P1 against the CPU in one match.', metric: 'points', targets: [3, 4, 5], rule: 'cpu', unit: 'points' },
  { slug: 'volletball', label: 'Above the net', goal: 'Score {target} points as the left player against the CPU in one match.', metric: 'points', targets: [5, 7, 10], rule: 'cpu', unit: 'points' },
  { slug: 'tank2', label: 'Ballistic victory', goal: 'Win a match as Lavender against Mint (AI).', metric: 'won', targets: [1, 1, 1], rule: 'cpu', unit: 'AI wins' },
  { slug: 'gun-mayhem', label: 'Last one standing', goal: 'Win {target} rounds as P1 in one-player mode against the CPU.', metric: 'wins', targets: [1, 2, 3], rule: 'cpu', unit: 'rounds won' },
  { slug: 'shadow-net', label: 'Data extraction', goal: 'Download {target} files from remote servers in one session.', metric: 'files', targets: [3, 4, 5], unit: 'files downloaded' },
  { slug: 'sand', label: 'Tiny world architect', goal: 'Keep {target} occupied cells and at least four different materials together.', metric: 'cells', targets: [250, 500, 750], rule: 'sand', unit: 'occupied cells' },
  { slug: 'eco', label: 'Thriving ecosystem', goal: 'After 60 simulation seconds, sustain {target} plants, 20 herbivores, and 3 predators together.', metric: 'plants', targets: [150, 175, 200], rule: 'eco', unit: 'plants' },
  { slug: 'mahjong', label: 'Pair by pair', goal: 'Clear {target} pairs from one Mahjong deal.', metric: 'pairs', targets: [24, 40, 56], unit: 'pairs' },
  { slug: 'chess', label: 'Board room', goal: 'Beat the computer in {target} moves or fewer.', metric: 'moves', targets: [40, 32, 24], rule: 'chess', unit: 'moves' },
  { slug: 'block-blast', label: 'Blast radius', goal: 'Clear {target} lines in one run.', metric: 'lines', targets: [6, 10, 14], unit: 'lines' },
  { slug: 'deep', label: 'Deep pockets', goal: 'Reach {target} points in one descent.', metric: 'score', targets: [1200, 2000, 3000], unit: 'points' },
  { slug: 'circuit', label: 'Clean race', goal: 'Finish the three-lap race in under {target} seconds on the day\u2019s circuit.', metric: 'seconds', targets: [42, 36, 30], rule: 'race', unit: 'seconds' },
  { slug: 'typing-test', label: 'Home row', goal: 'Type {target} words per minute with 95% accuracy or better.', metric: 'wpm', targets: [35, 45, 55], rule: 'typing', unit: 'words per minute' }
];
// Frozen v3 calendar lineup; future additions must make a new schedule version
// instead of silently moving previously published daily challenges.
const DAILY_SCHEDULE_V3 = Object.freeze([
  'minigolf',
  'tetris',
  'snake',
  'wordle',
  'space-invaders',
  '2048',
  'simon',
  'breakout',
  'memory',
  'frogger',
  'connect-four',
  'asteroids',
  'pac-man',
  'aim-lab',
  'qbert',
  'minesweeper',
  'lights-out',
  'pong',
  'sumo',
  'poker',
  'tank',
  'void-runner',
  'solitaire',
  'commanders',
  'lava',
  'volletball',
  'tank2',
  'gun-mayhem',
  'shadow-net',
  'sand',
  'eco',
  'mahjong',
  'chess',
  'block-blast',
  'deep'
]);
// CHALLENGES is append-only, and the v2 rotation that ran before the calendar
// shipped was cut from the first 35 entries. Pinning that count keeps already
// played days where they were when new games are appended.
const DAILY_V2_COUNT = 35;
// V4 adds the games built after the frozen v3 calendar. Days already played
// keep their v3 game, so no published challenge moves; the larger calendar
// starts the day after this release and is never applied retroactively.
const DAILY_SCHEDULE_V4 = Object.freeze([...DAILY_SCHEDULE_V3, 'circuit', 'typing-test']);
const DAILY_SCHEDULE_V4_START = Date.parse('2026-10-31T00:00:00Z') / 86400000;
const DAILY_SCHEDULE_START = Date.parse('2026-10-28T00:00:00Z') / 86400000;

export function dailyChallenge(date) {
  const day = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
  if (day < DAILY_SCHEDULE_START) {
    // Preserve old completions/streaks under their original v2 IDs.
    const index = ((day % DAILY_V2_COUNT) + DAILY_V2_COUNT) % DAILY_V2_COUNT;
    const definition = CHALLENGES[index];
    const circuit = ((Math.floor(day / DAILY_V2_COUNT) % 3) + 3) % 3;
    const target = definition.targets[circuit];
    return { ...definition, date, target, goal: definition.goal.replace('{target}', target), id: 'v2:' + date + ':' + definition.slug };
  }
  const schedule = day < DAILY_SCHEDULE_V4_START ? DAILY_SCHEDULE_V3 : DAILY_SCHEDULE_V4;
  const version = day < DAILY_SCHEDULE_V4_START ? 3 : 4;
  const size = schedule.length;
  const offset = day - DAILY_SCHEDULE_START;
  const cycleNumber = Math.floor(offset / size);
  let previous = [];
  // Deterministic seeded order per cycle: each game once per circuit.
  // Keep the first seven days disjoint from the preceding seven, including
  // the boundary between the old and new schedules.
  for (let cycle = 0; cycle <= cycleNumber; cycle++) {
    const order = schedule.slice();
    let state = (Math.imul(cycle + 1, 1664525) ^ 0x9e3779b9) >>> 0;
    for (let i = size - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const j = state % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const recent = cycle ? previous.slice(-7) : Array.from({ length: 7 }, (_, i) => {
      const historicDay = DAILY_SCHEDULE_START - 7 + i;
      return CHALLENGES[((historicDay % DAILY_V2_COUNT) + DAILY_V2_COUNT) % DAILY_V2_COUNT].slug;
    });
    for (let i = 0; i < 7 && i < size; i++) {
      if (!recent.includes(order[i])) continue;
      const j = order.findIndex((slug, index) => index >= 7 && !recent.includes(slug));
      if (j >= 0) [order[i], order[j]] = [order[j], order[i]];
    }
    previous = order;
  }
  const slug = previous[offset % size];
  const definition = CHALLENGES.find(item => item.slug === slug);
  const target = definition.targets[cycleNumber % definition.targets.length];
  return { ...definition, date, target, goal: definition.goal.replace('{target}', target), id: 'v' + version + ':' + date + ':' + definition.slug };
}
export function dailyCheck(challenge, snapshot) {
  if (!snapshot || snapshot.slug !== challenge.slug || !Number.isFinite(snapshot[challenge.metric]) || snapshot[challenge.metric] < 0) return { complete: false, progress: 'Start playing to track your goal.' };
  // The Aim Lab leaderboard uses both rounds, but its established daily goal
  // remains a 20-second Normal-round challenge. Old saved snapshots still work.
  const value = challenge.rule === 'aim' && Number.isFinite(snapshot.normalHits)
    ? snapshot.normalHits : snapshot[challenge.metric], t = challenge.target;
  let complete = value >= t;
  const notes = [];
  switch (challenge.rule) {
    case 'word': complete = snapshot.solved === true && value <= t; notes.push(snapshot.solved ? 'word solved' : 'not solved yet'); break;
    case 'merge': complete = complete && snapshot.undoUsed === false; if (snapshot.undoUsed) notes.push('Undo used—start a fresh run'); break;
    case 'memory': complete = snapshot.pairs === 8 && value <= t; notes.push(snapshot.pairs + '/8 pairs'); break;
    case 'connect': complete = snapshot.won === 1 && snapshot.cpu === true; if (!snapshot.cpu) notes.push('computer mode required'); break;
    case 'cpu': complete = complete && snapshot.cpu === true; if (!snapshot.cpu) notes.push('CPU mode required'); break;
    case 'aim': { const accuracy = Number.isFinite(snapshot.normalAccuracy) ? snapshot.normalAccuracy : snapshot.accuracy; complete = complete && snapshot.finished === true && accuracy >= 80 && snapshot.normal === true; notes.push(Math.round(accuracy) + '% Normal accuracy', snapshot.finished ? 'finished' : 'finish both rounds'); if (!snapshot.normal) notes.push('normal targets required'); break; }
    case 'mines': complete = snapshot.won === true && snapshot.standard === true && snapshot.hints === 0 && value <= t; notes.push(snapshot.won ? 'board cleared' : 'still playing'); if (snapshot.hints) notes.push('hints used—start a fresh board'); if (!snapshot.standard) notes.push('standard board required'); break;
    case 'poker': complete = complete && snapshot.handOver === true; notes.push(snapshot.handOver ? 'hand finished' : 'finish the hand'); break;
    case 'sand': complete = complete && snapshot.materials >= 4; notes.push(snapshot.materials + '/4 materials'); break;
    case 'eco': complete = complete && snapshot.seconds >= 60 && snapshot.herbs >= 20 && snapshot.predators >= 3; notes.push(Math.floor(snapshot.seconds) + '/60s', snapshot.herbs + '/20 herbivores', snapshot.predators + '/3 predators'); break;
    case 'chess': complete = (snapshot.won === 1 || snapshot.won === true) && snapshot.cpu === true && value > 0 && value <= t; if (!snapshot.cpu) notes.push('computer mode required'); if (snapshot.won !== 1) notes.push('beat the computer'); break;
    // A race is the rare daily goal that is better when smaller, so it has to
    // beat the target rather than reach it, and only counts once all three laps
    // are in: the clock covers the whole race, not its best lap.
    case 'race': complete = snapshot.finished === true && snapshot.laps >= 3 && value > 0 && value <= t; notes.push(snapshot.finished ? 'race finished' : 'finish all three laps'); break;
    // Speed only counts if the test finished and stayed accurate: a flailing
    // 30 seconds of keystrokes is not 60 words per minute.
    case 'typing': complete = complete && snapshot.finished === true && snapshot.accuracy >= 95; notes.push(snapshot.accuracy + '% accuracy', snapshot.finished ? 'finished' : 'finish the test'); break;
  }
  return { complete, progress: value + ' ' + challenge.unit + ' · target ' + t + (notes.length ? ' · ' + notes.join(' · ') : '') };
}

// A saved run is proof of a day, and a day has to outlive the calendar that
// produced it: a later schedule version renames a challenge, and a retuned
// target moves the bar under results already earned. Neither may erase a
// completed day, because the streak is counted from saved days — so the date and
// the game are read back out of the stored id, and the run is accepted if it met
// any goal that game has been published with. A malformed id, a snapshot for a
// different game, or a run that never reached a published goal still counts for
// nothing.
export function parseDailyId(id) {
  const match = /^v\d+:(\d{4}-\d{2}-\d{2}):([a-z0-9-]+)$/.exec(typeof id === 'string' ? id : '');
  if (!match) return null;
  const definition = CHALLENGES.find(item => item.slug === match[2]);
  if (!definition || !Number.isFinite(Date.parse(match[1] + 'T00:00:00Z'))) return null;
  return { date: match[1], definition };
}
export function dailyResultCheck(id, result) {
  const parsed = parseDailyId(id);
  if (!parsed || !result || result.id !== id || !result.snapshot) {
    return { complete: false, progress: 'Start playing to track your goal.' };
  }
  const current = dailyChallenge(parsed.date);
  const goals = current.slug === parsed.definition.slug
    ? [current.target, ...parsed.definition.targets]
    : parsed.definition.targets;
  let last = { complete: false, progress: 'Start playing to track your goal.' };
  for (const target of new Set(goals)) {
    const challenge = {
      ...parsed.definition, date: parsed.date, id, target,
      goal: parsed.definition.goal.replace('{target}', target)
    };
    const check = dailyCheck(challenge, result.snapshot);
    if (check.complete) return { complete: true, progress: check.progress, challenge };
    last = check;
  }
  return { complete: false, progress: last.progress };
}

// Inject the read-only accessor into the game's own scope; original base64 payloads remain untouched.
const DAILY_ADAPTERS = {
  tetris: { expression: '({lines:game.lines,score:game.score||0})' },
  snake: { closure: true, expression: '({apples:score})' },
  wordle: { expression: '({guesses:row,solved:gameOver && Array.from({length:row},(_,r)=>[...document.querySelectorAll(".tile[data-row="+CSS.escape(String(r))+"]")].filter(t=>t.classList.contains("correct")).length===5).some(Boolean)})' },
  'space-invaders': { expression: '({waves:Math.max(0,lvN-1)+(st==="levelclear"?1:0),score:sc||0})' },
  simon: { closure: true, expression: '({rounds:Math.max(0,round-(state==="paused"?0:1))})' },
  breakout: { expression: '({layouts:currentLevel||0,score:score||0})' },
  frogger: { expression: '({homes:level>1?5:filled.size,score:score||0})' },
  asteroids: { expression: '({waves:Math.max(0,(level||1)-1),score:score||0})' },
  'pac-man': { expression: '({score:score||0})' },
  qbert: { expression: '({levels:Math.max(0,gameLvl-1)+(state==="win"?1:0),score:score||0})' },
  minesweeper: { setup: 'let boredHints=0;const boredHint=game.getHint;game.getHint=function(...a){boredHints++;return boredHint.apply(this,a)};const boredInit=game.init;game.init=function(...a){boredHints=0;return boredInit.apply(this,a)};', expression: '({seconds:game.timer,won:game.state==="WON",standard:["beginner","intermediate","expert"].includes(game.difficulty),hints:boredHints})' },
  pong: { expression: '({points:score1||0,cpu:mode==="ai"})' },
  sumo: { expression: '({wins:p1.score||0,cpu:cpuMode===true})' },
  poker: { expression: '(G.variant==="holdem"||G.variant==="draw"?{profit:human()?human().stack-G.settings.stack:0,handOver:G.phase==="handOver"}:{profit:0,handOver:false})' },
  tank: { setup: 'let boredCpuOnly=true;document.addEventListener("keydown",e=>{if(e.key.toLowerCase()==="e"&&!aiEnabled)boredCpuOnly=false});', expression: '((!aiEnabled&&(boredCpuOnly=false)),({wins:scores[0],cpu:aiEnabled&&boredCpuOnly}))' },
  'void-runner': { closure: true, expression: '({score})' },
  solitaire: { closure: true, expression: '({cards:G.foundations.reduce((n,p)=>n+p.length,0),moves:G.moves,won:won===true,seconds:won?Math.ceil(timerNow()/1000):0})' },
  commanders: { closure: true, expression: '({waves:Math.max(0,wn-1),score:P&&P.sc?P.sc:0})' },
  lava: { expression: '({points:sc?sc[0]:0,cpu:cpuMode===true})' },
  volletball: { expression: '({points:sc[0],cpu:cpuMode===true})' },
  tank2: { expression: '({won:sessionWins,cpu:aiEnabled===true,started:mode!=="TITLE"})' },
  'gun-mayhem': { expression: '({wins:pls[0]?pls[0].wins:0,cpu:mode==="1p"})' },
  'shadow-net': { expression: '({files:state.downloadCount})' },
  sand: { closure: true, expression: '({cells:grid.reduce((n,v)=>n+(v!==EMPTY),0),materials:new Set(grid.filter(v=>v!==EMPTY)).size})' },
  eco: { closure: true, expression: '({plants:plants.length,herbs:herbs.length,predators:preds.length,seconds:gTime})' }
};
export function installDailyAdapter(html, slug) {
  const adapter = DAILY_ADAPTERS[slug];
  if (!adapter) return html;
  const code = '\n' + (adapter.setup || '') + 'window.__boredSnapshot=()=>Object.assign({slug:' + JSON.stringify(slug) + '},' + adapter.expression + ');\n';
  let installed = false;
  const variable = adapter.expression.match(/\b(game|score|row|lvN|round|currentLevel|filled|level|gameLvl|score1|p1|G|scores|wn|sc|mode|pls|state|grid|plants)\b/)?.[0];
  html = html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (whole, start, body, end) => {
    if (installed || !variable || !new RegExp('\\b' + variable + '\\b').test(body)) return whole;
    if (/type=["'](?:importmap|application\/json)/i.test(start)) return whole;
    if (adapter.closure) {
      const index = body.lastIndexOf('})();');
      if (index < 0) throw new Error('Daily adapter scope not found: ' + slug);
      const close = body.lastIndexOf('}', index);
      body = body.slice(0, close) + code + body.slice(close);
    } else body += code;
    installed = true;
    return start + body + end;
  });
  if (!installed) throw new Error('Daily adapter script not found: ' + slug);
  return html;
}

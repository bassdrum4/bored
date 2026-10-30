const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual standalone game's physics without a clock or renderer. The
// browser suite separately checks pointer input, resizing and the hub hooks.
function game() {
  const elements = new Map();
  const canvasContext = new Proxy({}, { get: (obj, key) => key in obj ? obj[key] : () => {}, set: (obj, key, value) => { obj[key] = value; return true; } });
  const element = () => ({ innerHTML: '', textContent: '', hidden: false,
    addEventListener() {}, getContext: () => canvasContext });
  const context = vm.createContext({ document: {
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); },
    addEventListener() {}
  }, requestAnimationFrame() {}, ResizeObserver: class { observe() {} }, addEventListener() {} });
  context.window = context;
  const html = fs.readFileSync(path.join(__dirname, '../src/games/content/minigolf.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return code => vm.runInContext(code, context);
}

test('minigolf counts putts once, ignores unfinished rounds, and resets cleanly', async () => {
  const run = game();
  const { scoreValue, HIGH_SCORE_GAMES } = await import('../src/hub/scores.js');
  assert.equal(HIGH_SCORE_GAMES.find(spec => spec.id === 'minigolf').lower, true);
  assert.equal(run('__boredSnapshot().strokes'), 0);
  assert.equal(run('putt(-Math.PI / 2, .4)'), true);
  assert.equal(run('putt(0, 1)'), false, 'no second shot while rolling');
  assert.equal(run('__boredSnapshot().strokes'), 1);
  assert.equal(scoreValue('minigolf', run('__boredSnapshot()')), 0);
  run('for (let i = 0; i < 2400; i++) step(STEP)');
  assert.equal(run('moving'), false, 'friction eventually stops the ball');
  run('advanceHole()');
  assert.equal(run('holeIndex'), 0, 'cannot skip an unfinished hole');
  run('newRound()');
  assert.equal(run('__boredSnapshot().strokes'), 0);
  assert.equal(run('__boredSnapshot().holes'), 0);
  assert.equal(run('__boredSnapshot().finished'), false);
});

test('minigolf banks off thin walls, slows in sand, and rejects a fast cup pass', () => {
  const run = game();
  const distance = run(`(() => {
    function roll(x, y) {
      holeIndex = 5; loadHole(); ball.x = x; ball.y = y;
      putt(0, .25); const start = ball.x;
      for (let i = 0; i < 1000; i++) step(STEP);
      return ball.x - start;
    }
    return { grass: roll(140, 360), sand: roll(140, 260) };
  })()`);
  assert.ok(distance.sand < distance.grass / 2);
  run('holeIndex = 3; loadHole(); ball.x = 100; ball.y = 290; putt(-Math.PI / 2, 1); for (let i = 0; i < 20; i++) step(STEP)');
  assert.ok(run('ball.vy') > 0, 'full-power ball reflects instead of tunneling through a 20px wall');
  run('newRound(); ball.x = 180; ball.y = 100; putt(0, 1); for (let i = 0; i < 20; i++) step(STEP)');
  assert.equal(run('sunk'), false, 'a fast ball rolls across the cup');
  run('newRound(); ball.x = 180; ball.y = 100; putt(0, .16); for (let i = 0; i < 300; i++) step(STEP)');
  assert.equal(run('__boredSnapshot().holes'), 1);
  run('for (let i = 0; i < 100; i++) step(STEP)');
  assert.equal(run('__boredSnapshot().holes'), 1, 'a holed ball is only counted once');
});

test('all nine minigolf holes can be played through physics and only the finished total ranks', async () => {
  const run = game();
  // Waypoints are a route around the authored obstacles. Find a putt's power
  // with dry-run physics, then play that putt; never teleport or call pocket().
  run(`
    function shootTo(x, y) {
      const saved = { ball: { ...ball }, strokes, card: [...card], sunk, finished, courseTime, portalCooldown };
      const direction = Math.atan2(y - ball.y, x - ball.x);
      let best = .5, closest = Infinity;
      function restore() {
        ball = { ...saved.ball }; strokes = saved.strokes; card = [...saved.card];
        sunk = saved.sunk; finished = saved.finished; moving = false;
        courseTime = saved.courseTime; portalCooldown = saved.portalCooldown;
      }
      // Acceleration strips and moving blades make endpoint distance non-monotonic.
      for (let n = 4; n <= 100; n++) {
        restore(); const strength = n / 100; putt(direction, strength);
        for (let tick = 0; tick < 2400 && moving; tick++) step(STEP);
        const error = Math.hypot(ball.x - x, ball.y - y);
        if (error < closest) { closest = error; best = strength; }
        if (sunk) break;
      }
      restore(); putt(direction, best);
      for (let tick = 0; tick < 2400 && moving; tick++) step(STEP);
      return Math.hypot(ball.x - x, ball.y - y);
    }
  `);
  const routes = [
    [[200, 100]],
    [[345, 370], [345, 190], [300, 100]],
    [[345, 325], [345, 180], [90, 90]],
    [[165, 215], [165, 125], [200, 90]],
    [[310, 410], [310, 265], [90, 265], [90, 100], [300, 85]],
    [[310, 390], [310, 90]],
    [[90, 150], [310, 100], [310, 420]],
    [[135, 144], [200, 80]],
    [[310, 420], [310, 280], [90, 280], [90, 175], [235, 175], [235, 95], [320, 80]]
  ];
  const { scoreValue } = await import('../src/hub/scores.js');
  const { CHALLENGES, dailyCheck } = await import('../src/daily.js');
  const daily = { ...CHALLENGES.find(c => c.slug === 'minigolf'), target: 9 };
  for (let hole = 0; hole < routes.length; hole++) {
    for (const [x, y] of routes[hole]) {
      const error = run(`shootTo(${x}, ${y})`);
      assert.ok(error < 11, 'reachable waypoint on hole ' + (hole + 1) +
        ' target ' + x + ',' + y + ' error ' + error.toFixed(2));
    }
    assert.equal(run('__boredSnapshot().holes'), hole + 1);
    const snapshot = run('__boredSnapshot()');
    assert.equal(dailyCheck(daily, snapshot).complete, hole === 8);
    assert.equal(scoreValue('minigolf', snapshot), hole === 8 ? snapshot.strokes : 0);
    if (hole < 8) run('advanceHole()');
  }
  assert.equal(run('__boredSnapshot().finished'), true);
  assert.equal(run('card.reduce((a,b) => a+b, 0)'), run('strokes'));
  assert.equal(run('putt(0, 1)'), false);
  run('advanceHole()');
  assert.equal(run('holeIndex'), 8, 'last hole cannot advance beyond the course');
});


test('minigolf retains nine holes and its new obstacles affect physics without changing score semantics', () => {
  const run = game();
  assert.equal(run('holes.length'), 9);
  assert.equal(run('holes.reduce((sum, h) => sum + h.par, 0)'), 28);
  assert.equal(run('holes.filter(h => h.bumpers?.length).length'), 2);
  assert.ok(run('holes.some(h => h.sweepers?.length)'));
  assert.ok(run('holes.some(h => h.belts?.length)'));
  assert.ok(run('holes.some(h => h.portals?.length)'));
  assert.ok(run('holes.some(h => h.gates?.length)'));

  run('holeIndex=1; loadHole(); ball={x:310,y:295,vx:0,vy:-180}; moving=true; for(let i=0;i<15;i++) step(STEP)');
  assert.ok(run('ball.vy') > 0, 'spring bumper reverses an incoming ball');

  run('holeIndex=5; loadHole(); ball={x:85,y:350,vx:80,vy:0}; moving=true; step(STEP)');
  assert.ok(run('ball.x > 315 && ball.y < 290'), 'entering one portal exits at its linked partner');
  const exit = run('({x:ball.x,y:ball.y})');
  run('step(STEP)');
  assert.ok(run('Math.hypot(ball.x-'+exit.x+',ball.y-'+exit.y+')') < 10,
    'portal cooldown prevents instantaneous bounce-back');

  run('holeIndex=4; loadHole(); ball={x:310,y:330,vx:100,vy:0}; moving=true; for(let i=0;i<12;i++) step(STEP)');
  assert.ok(run('ball.vy') < -5, 'speed strip deflects a rolling ball in its arrow direction');

  run('holeIndex=7; loadHole(); courseTime=2;');
  assert.ok(run('movingGate(holes[7].gates[0])[0]') !== run('holes[7].gates[0][0]'),
    'moving gate changes position with course time');
  run('newRound()');
  assert.equal(run('__boredSnapshot().strokes'), 0);
  assert.equal(run('__boredSnapshot().finished'), false);
});

test('obstacles alter real shot corridors and flag/aim strokes remain thin', () => {
  const run = game();
  const bumper = run('(() => { holeIndex=1;loadHole();function roll(){ball={x:310,y:318,vx:0,vy:-210};moving=true;for(let i=0;i<110;i++)step(STEP);return {y:ball.y,vy:ball.vy};}const blocked=roll();holes[1].bumpers=[];const clear=roll();return {blocked,clear};})()');
  assert.ok(bumper.blocked.y > bumper.clear.y + 20, 'bumper interrupts the original right-hand lane');
  const gate = run('(() => { holeIndex=7;loadHole();function roll(){ball={x:200,y:218,vx:0,vy:-220};moving=true;courseTime=0;for(let i=0;i<110;i++)step(STEP);return {y:ball.y,vy:ball.vy};}const blocked=roll();holes[7].gates=[];const clear=roll();return {blocked,clear};})()');
  assert.ok(gate.blocked.y > gate.clear.y + 15, 'moving gate interrupts center-line approaches');
  run('holeIndex=5;loadHole();ball={x:85,y:351,vx:0,vy:-100};moving=true;step(STEP)');
  assert.ok(run('Math.hypot(ball.x-330,ball.y-270)') < 3, 'portal near tee skips the bunker');
  run('holeIndex=4;loadHole();ball={x:310,y:330,vx:0,vy:-100};moving=true;step(STEP)');
  assert.ok(run('ball.vy') < -100, 'speed strip accelerates a ball on the main shot path');
  for (let i = 0; i < 9; i++) {
    run('holeIndex='+i+';loadHole();ctx.lineWidth=10;draw()');
    assert.equal(run('ctx.lineWidth'), 1, 'original thin flag and power-guide strokes on hole '+(i+1));
  }
});

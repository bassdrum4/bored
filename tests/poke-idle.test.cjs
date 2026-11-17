// Poké Idle's daily boss: one boss a day for everyone, from the arcade's shared seed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const root = path.resolve(__dirname, '..');

// The game on its own, with the seed the hub would inject (window.__boredSeed) for `date`.
async function openIdle(t, date) {
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const { seedNumber } = await import(path.join(root, 'src/daily.js'));
  const site = await serve(path.join(root, 'src'));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [] });
  t.after(async () => { await browser.close(); await site.close(); });
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  await tab.setRequestInterception(true);
  tab.on('request', request => request.url().startsWith(site.origin) ? request.continue() : request.abort());
  const seed = { date, seed: seedNumber(date), code: 'test' };
  await tab.evaluateOnNewDocument(s => { window.__boredSeed = s; }, seed);
  await tab.goto(site.origin + '/games/content/poke-idle.html');
  await tab.waitForFunction(() => typeof dailyBoss === 'function' && typeof startLoc === 'function');
  return { tab, errors, seed };
}
// A save with a party, either one badge in (low cap) or six regions cleared (high cap).
const setup = (tab, level) => tab.evaluate(level => {
  S = fresh(); S.box[25] = { xp: 1e9 }; S.party = [25];
  if (level === 'low') S.badges['0-0'] = 1;
  else for (let r = 0; r < 6; r++) { for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; S.champs[r] = 1; }
  save(); renderLocs();
}, level);

test('the daily boss comes from the shared seed: the same for everyone, a final, non-legendary Pokémon with a clear weakness', async t => {
  const { tab, errors, seed } = await openIdle(t, '2026-11-20');
  await setup(tab, 'low');
  const boss = await tab.evaluate(s => { const m = dailyBoss(s); return { name: m.name, n: m.num, today: dailyBoss().num, day: bossDay(), final: finalStage(m), legend: legendary(m), weak: weakTo(m), bst: m.bst }; }, seed.seed);
  assert.equal(boss.today, boss.n, 'today is the injected seed');
  assert.deepEqual(boss.day, { date: seed.date, seed: seed.seed });
  assert.equal(boss.final, true);
  assert.equal(boss.legend, false);
  assert.ok(boss.bst >= 470);
  assert.ok(boss.weak.length >= 1 && boss.weak.length <= 3, 'one to three weaknesses');
  // A week of seeds gives different bosses, all from the same pool.
  const week = await tab.evaluate(() => Array.from({ length: 7 }, (_, i) => dailyBoss(0x9e3779b1 * (i + 1) >>> 0).num));
  assert.ok(new Set(week).size >= 5, 'the boss changes from day to day');
  // Without the arcade, a hash of the local date stands in.
  assert.ok(await tab.evaluate(() => { const s = window.__boredSeed; delete window.__boredSeed; const d = bossDay(); window.__boredSeed = s; return /^\d{4}-\d\d-\d\d$/.test(d.date) && Number.isInteger(d.seed); }));
  assert.deepEqual(errors, []);
});

test('the daily boss is listed, fights at the level cap, can be retried, and a win shows in the snapshot once', async t => {
  const { tab, errors, seed } = await openIdle(t, '2026-11-20');
  await setup(tab, 'high');
  // Listed under the Lab, with the boss and its level.
  const name = await tab.evaluate(() => dailyBoss().name);
  const item = await tab.$eval('#locs', n => [...n.querySelectorAll('[data-loc]')].map(b => b.textContent).find(t => t.startsWith('Daily boss')));
  assert.ok(item && item.includes(name), 'the list shows today\'s boss');
  assert.deepEqual(await tab.evaluate(() => window.__boredSnapshot().boss), { date: seed.date, won: false });
  // Start it: one foe, at the level cap, with the weakness in the message.
  const fight = await tab.evaluate(() => { startLoc({ kind: 'daily', r: frontier() }); return { kind: B.kind, L: B.L, cap: levelCap(), n: B.queue.length, foe: B.foe.m.name, msg: document.body.textContent.includes("It's weak to " + weakTo(B.foe.m).join(', ')), tries: S.daily.tries }; });
  assert.deepEqual(fight, { kind: 'daily', L: fight.cap, cap: fight.cap, n: 1, foe: name, msg: true, tries: 1 });
  // Out of time: try again, as often as you like.
  await tab.evaluate(() => { backToRoute(); startLoc({ kind: 'daily', r: frontier() }); });
  assert.equal(await tab.evaluate(() => S.daily.tries), 2);
  // Win: normal money, the day marked won, and the snapshot says so.
  const won = await tab.evaluate(() => { const before = S.money; B.foe.hp = 1; hit(10); next(); return { paid: S.money > before, won: S.daily.won, back: B.kind }; });
  assert.deepEqual(won, { paid: true, won: true, back: 'route' });
  assert.deepEqual(await tab.evaluate(() => window.__boredSnapshot().boss), { date: seed.date, won: true });
  assert.ok((await tab.$eval('#locs', n => n.textContent)).includes('beaten today'));
  // It's kept in the save, and a new day starts over.
  assert.equal(await tab.evaluate(() => JSON.parse(localStorage.getItem('bored.poke-idle.save')).daily.won), true);
  assert.equal(await tab.evaluate(() => { window.__boredSeed = { date: '2026-11-21', seed: 7, code: 'x' }; return window.__boredSnapshot().boss.won; }), false);
  assert.deepEqual(errors, []);
});

test('the daily boss is tuned for a counter team: one built on its weakness wins in time, one with no weakness to hit does not', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-20');
  for (const level of ['low', 'high']) {
    await setup(tab, level);
    const r = await tab.evaluate(() => {
      startLoc({ kind: 'daily', r: frontier() });
      const cap = areaCap(), f = B.foe.m, pool = refPool(...dailyArea(B.r), cap, 5), boost = bossBoost();
      const secs = P => B.foe.max / (P.reduce((s, p) => s + refHit(p, cap, f) * bestEff(p, f), 0) * boost);
      const counter = refPick(pool, [{ f, hp: 1 }], (p, g) => refHit(p, cap, g) * bestEff(p, g));
      const plain = pool.filter(p => bestEff(p, f) <= 1).sort((a, c) => refHit(c, cap, f) - refHit(a, cap, f)).slice(0, 6);
      const out = { clock: B.bossTime, counter: secs(counter), plain: secs(plain) };
      backToRoute();
      return out;
    });
    assert.ok(r.counter < r.clock, `${level}: the counter team wins (${Math.round(r.counter)}s of ${r.clock}s)`);
    assert.ok(r.counter > r.clock * 0.6, `${level}: but it is close (${Math.round(r.counter)}s of ${r.clock}s)`);
    assert.ok(r.plain > r.clock, `${level}: a team with no weakness to hit runs out of time (${Math.round(r.plain)}s)`);
  }
  assert.deepEqual(errors, []);
});

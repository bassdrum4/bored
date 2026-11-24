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

// All nine Champions down and standing in the Training area. TRAIN_R (9) is past the last region, so the
// Dex must never adopt it as one: regionMons(9) read REGIONS[9].gen and threw on every render for the rest
// of the session, which is what the field errors were.
test('the Dex opens on a real region from the Training area', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-21');
  await tab.evaluate(() => {
    S = fresh(); S.box[25] = { xp: 1e9 }; S.party = [25]; S.full = 1;
    for (let r = 0; r < REGIONS.length; r++) { for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; S.champs[r] = 1; }
    S.loc = { kind: 'route', r: TRAIN_R, k: 0 };
    save(); renderLocs();
  });
  const regions = await tab.evaluate(() => REGIONS.length);
  assert.ok(await tab.evaluate(() => TRAIN_R) >= regions, 'the Training area is past the last region');
  assert.equal(await tab.evaluate(() => regionMons(TRAIN_R).length), 0, 'the Training area has no regional dex');
  assert.ok(await tab.evaluate(() => regionMons(0).length) > 0, 'a real region still lists its Pokémon');
  const shown = await tab.evaluate(() => {
    openTab('dex');
    return { dexR, cells: document.querySelectorAll('#dexgrid [data-wpk]').length, sum: document.querySelector('#dexsum').textContent.trim() };
  });
  assert.ok(Number.isInteger(shown.dexR) && shown.dexR >= 0 && shown.dexR < regions, 'the Dex kept a real region');
  assert.ok(shown.cells > 0, 'the Dex still lists a region');
  assert.ok(shown.sum.length > 0, 'the summary still renders');
  assert.deepEqual(errors, []);
});

// Prestige: after Prof Penguin, start over for XP ×2 and shinies ×2 a prestige (up to ×8). What stays and what resets
// is exactly the confirm screen's list; shiny lines, SP editions and saved teams (as templates) carry over.
test('prestige resets the journey, keeps what it promises, and pays its bonuses', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  await tab.evaluate(() => {
    S = fresh();
    for (let r = 0; r < REGIONS.length; r++) { for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; S.champs[r] = 1; }
    S.box[4] = { xp: 1e6, shiny: true }; S.box[5] = { xp: 1e6, shiny: true }; S.box[25] = { xp: 1e6, shiny: false };
    S.box[395] = { xp: 1e6, shiny: false, special: 'prof-empoleon', look: 'special' };
    S.party = [5, 25, 395]; S.money = 5e6; S.charm = 1; S.key = 1; S.stones[10034] = 1; S.won.origin = 1; S.protein = 20;
    S.teams = [{ name: 'Old', party: [5, 25, 395], mega: null, gmax: 0 }]; S.tower = { best: 12, runs: 3 };
    S.stats.wins = 500; S.ach.dex10 = 1; S.beat = '2026-11-20'; S.mail.read['update-2026-11-24a'] = 1;
    save(); showTitle();
  });
  // The stats card offers it, and the confirm screen lists what resets and what stays.
  assert.ok(await tab.evaluate(() => canPrestige()), 'a save that beat Prof Penguin can prestige');
  await tab.click('[data-act="prestige-ask"]');
  const card = await tab.$eval('#t-card', n => n.textContent);
  for (const s of ['Resets', 'Stays', 'the Shiny Charm', 'Mega Stones', 'saved teams, as templates', 'your Battle Tower best', 'special editions (SP)']) assert.ok(card.includes(s), `the confirm screen lists ${s}`);
  await tab.click('[data-act="prestige"]');
  const after = await tab.evaluate(() => ({ pick: !document.querySelector('#pick').hidden, p: S.prestige, box: Object.keys(S.box), sp: S.box[395], cap: levelCap(), money: S.money, charm: !!S.charm,
    stones: Object.keys(S.stones).length, won: Object.keys(S.won).length, badges: Object.keys(S.badges).length, tower: S.tower.best, wins: S.stats.wins, ach: !!S.ach.dex10, beat: S.beat,
    teams: S.teams.length, lines: !!JSON.parse(localStorage.getItem('bored.poke-idle.shinylines.v1'))[4], life: lifeDex(), score: window.__boredSnapshot().score, read: !!S.mail.read['update-2026-11-24a'], again: canPrestige(), lab: finalOpen() }));
  assert.deepEqual(after, { pick: true, p: 1, box: ['395'], sp: { xp: after.cap ** 3, shiny: false, special: 'prof-empoleon', look: 'special' }, cap: after.cap, money: 0, charm: false,
    stones: 0, won: 0, badges: 0, tower: 12, wins: 500, ach: true, beat: '2026-11-20', teams: 1, lines: true, life: 4, score: 6, read: true, again: false, lab: false });
  // A new starter, then the SP edition joins it; P1 shows on the HUD and the party header.
  await tab.click('[data-start="1"]');
  const start = await tab.evaluate(() => ({ party: S.party.slice(), pick: !!S.pick, hud: document.querySelector('#hudp').textContent, odds: shinyOdds() * 4096 }));
  assert.deepEqual(start, { party: [1, 395], pick: false, hud: 'P1', odds: 2 });
  // XP ×2: the same win gives twice the XP it would without a prestige.
  const xp = await tab.evaluate(() => { const b = S.box[1]; b.xp = 1000; gainXp(10); const one = b.xp - 1000; S.prestige = 0; b.xp = 1000; gainXp(10); const zero = b.xp - 1000; S.prestige = 1; return { one, zero }; });
  assert.equal(xp.one, xp.zero * 2);
  // Shiny odds: ×2 a prestige, capped at ×8, and the Shiny Charm's ×3 on top.
  assert.deepEqual(await tab.evaluate(() => [0, 1, 2, 3, 4].map(p => { S.prestige = p; const o = 1 / shinyOdds(); S.charm = 1; const c = shinyOdds() * 4096; S.charm = 0; return [o, c]; })),
    [[4096, 3], [2048, 6], [1024, 12], [512, 24], [512, 24]]);
  await tab.evaluate(() => { S.prestige = 1; });
  // The first Charmander-line catch comes out shiny (the line was recorded), and the line rule follows.
  const shiny = await tab.evaluate(() => { addMon(4, 5, false); return S.box[4].shiny; });
  assert.equal(shiny, true);
  // The old team is a template: owned members fill in, the rest show as faded slots.
  const team = await tab.evaluate(() => { B = { kind: 'route' }; loadTeam(0); openTab('party'); return { party: S.party.slice(), ghosts: [...document.querySelectorAll('#party .ghost')].map(n => n.textContent) }; });
  assert.deepEqual(team.party, [395]);
  assert.equal(team.ghosts.length, 2);
  assert.ok(team.ghosts[0].includes('Charmeleon') && team.ghosts[1].includes('Pikachu'));
  // The board: prestige first, then lifetime dex; the score is the lifetime dex plus lifetime shinies, never lower.
  assert.deepEqual(await tab.evaluate(() => { const s = window.__boredSnapshot(); return [s.prestige, s.lifeDex, s.ranked, s.score]; }), [1, 5, 2051 + 5, 7]);
  // Beating Prof Penguin again in this run opens the next prestige.
  assert.equal(await tab.evaluate(() => { S.pbeat = 1; return canPrestige(); }), true);
  assert.deepEqual(errors, []);
});

// Shiny lines live in their own store, outside any save: a different save (or Story Mode) reads the same lines, a save's
// shinies are merged in when it loads, and the test account never writes there.
test('shiny lines are kept in a shared store outside the save', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const r = await tab.evaluate(() => {
    const key = 'bored.poke-idle.shinylines.v1', store = () => JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.removeItem(key);
    // A save that already has a shiny Dratini line: loading it merges the line in.
    S = fresh(); S.box[148] = { xp: 1e6, shiny: true }; S.party = [148]; migrateSave();
    const merged = !!store()[147] && !('shinyLines' in S);
    // A brand-new save shares the store: its first Dratini comes out shiny, and so does the line after it.
    S = fresh(); S.box[25] = { xp: 1e6, shiny: false }; S.party = [25]; save();
    addMon(147, 5, false); const fresh1 = S.box[147].shiny;
    // A line nobody had shiny stays normal.
    addMon(129, 5, false); const plain = S.box[129].shiny;
    // The test account (every line shiny) writes nothing.
    const before = Object.keys(store()).length; useSlot(TEST_KEY, testAccount()); const after = Object.keys(store()).length; useSlot(KEY);
    return { merged, fresh1, plain, testWrites: after - before };
  });
  assert.deepEqual(r, { merged: true, fresh1: true, plain: false, testWrites: 0 });
  assert.deepEqual(errors, []);
});

// Sssssssnakes: three optional rival fights, each at the top of its region's list once that Champion is beaten, set
// by the Champion's rules but a little harder (RIVAL_USE of the clock for the reference team, BOSS_USE for a Champion).
test('rival Sssssssnakes: listed after the Champion, set by the Champion\'s rules a little harder, and paid once', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const teams = await tab.evaluate(() => RIVALS.map(x => [REGIONS[x.r].name, x.team.map(m => m.name)]));
  assert.deepEqual(teams, [
    ['Johto', ['Snivy', 'Ekans', 'Silicobra']],
    ['Unova', ['Servine', 'Arbok', 'Sandaconda', 'Milotic']],
    ['Galar', ['Serperior', 'Arbok', 'Sandaconda', 'Milotic', 'Zygarde 50% Forme']]]);
  for (const x of await tab.evaluate(() => RIVALS.map(x => ({ id: x.id, r: x.r, master: !!x.master })))) {
    // Locked until the Champion is down, then the first row of that list.
    const locked = await tab.evaluate(r => { S = fresh(); S.box[25] = { xp: 1e9 }; S.party = [25]; for (let q = 0; q < r; q++) { for (let k = 0; k < 4; k++) S.badges[q + '-' + k] = 1; S.champs[q] = 1; } for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; viewR = r; renderLocs(); return document.querySelector('#locs [data-loc]').disabled; }, x.r);
    assert.equal(locked, true, `${x.id}: locked before the Champion`);
    const row = await tab.evaluate(r => { S.champs[r] = 1; renderLocs(); const b = document.querySelector('#locs [data-loc]'); return { first: JSON.parse(b.dataset.loc).kind, text: b.textContent, open: !b.disabled }; }, x.r);
    assert.deepEqual([row.first, row.open, row.text.startsWith('Rival Sssssssnakes')], ['rival', true, true]);
    // The Champion's cap and timer rules; the reference team needs RIVAL_USE of the clock where the Champion's needs BOSS_USE.
    const f = await tab.evaluate(r => {
      const use = () => { const cap = areaCap(), vs = m => B.queue.reduce((s, f) => s + refHit(m, cap, f) * bestEff(m, f), 0);
        const P = refPool(B.r, 3, cap).sort((a, b) => vs(b) - vs(a)).slice(0, 6);
        return B.queue.reduce((s, f) => s + bossHpFor(f, B.L, B.i, B.tune) / (P.reduce((d, m) => d + refHit(m, cap, f) * bestEff(m, f), 0) * bossBoost()), 0) / (B.bossTime * refDef(P)); };
      startLoc({ kind: 'champ', r }); const champ = { cap: areaCap(), use: use() }; backToRoute();
      startLoc({ kind: 'rival', r }); const rival = { cap: areaCap(), use: use(), L: B.L, clock: B.bossTime, want: rivalTime(RIVAL_AT[r]), said: document.querySelector('#log').textContent };
      B.idx = B.queue.length - 1; B.foe.hp = 1; hit(10);
      const before = { money: S.money, master: S.balls.master }; next();
      return { champ, rival, paid: S.money - before.money, master: S.balls.master - before.master, won: rivalWon(RIVAL_AT[r].id), letter: inbox().some(m => m.id === 'rival-' + RIVAL_AT[r].id), ach: (checkAch(true), !!S.ach['rival-' + RIVAL_AT[r].id]), prize: rewardFor(champLevel(r) + CAP_OVER, r * 4 + 3, RIVAL_PAY) };
    }, x.r);
    assert.equal(f.rival.cap, f.champ.cap, `${x.id}: the Champion's level cap`);
    assert.equal(f.rival.L, f.rival.cap);
    assert.equal(f.rival.clock, f.rival.want, `${x.id}: the Champion's timer rule`);
    assert.ok(Math.abs(f.champ.use - 0.97) < 0.01 && Math.abs(f.rival.use - 1.05) < 0.01, `${x.id}: champion ${f.champ.use.toFixed(3)}, rival ${f.rival.use.toFixed(3)}`);
    assert.ok(f.rival.said.startsWith('Sssssssnakes: "'), 'a one-liner before the fight');
    assert.deepEqual([f.paid, f.master, f.won, f.letter, f.ach], [f.prize, x.master ? 1 : 0, true, true, true]);
    // A rematch pays a Champion rematch's and no Master Ball.
    const again = await tab.evaluate(r => { const m = S.balls.master; startLoc({ kind: 'rival', r }); B.idx = B.queue.length - 1; B.foe.hp = 1; hit(10); const paid = S.money; next(); return [S.balls.master - m, S.money - paid === rewardFor(champLevel(r) + CAP_OVER, r * 4 + 3, RIVAL_REMATCH)]; }, x.r);
    assert.deepEqual(again, [0, true]);
  }
  assert.deepEqual(errors, []);
});

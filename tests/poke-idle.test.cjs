// Poké Idle's daily boss: one boss a day for everyone, from the arcade's shared seed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const root = path.resolve(__dirname, '..');

// The game on its own, with the seed the hub would inject (window.__boredSeed) for `date`.
// opts.hof serves the page with HOF_READY switched on, the way the Hall of Fame is tested before it ships.
async function openIdle(t, date, opts = {}) {
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
  tab.on('request', request => {
    if (!request.url().startsWith(site.origin)) return request.abort();
    if (opts.hof && /poke-idle\.html/.test(request.url())) {
      const html = fs.readFileSync(path.join(root, 'src/games/content/poke-idle.html'), 'utf8');
      assert.ok(html.includes('const HOF_READY = false;'), 'the page ships with the Hall of Fame held back');
      return request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html.replace('const HOF_READY = false;', 'const HOF_READY = true;') });
    }
    request.continue();
  });
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
  assert.deepEqual(after, { pick: true, p: 1, box: ['395'], sp: { xp: after.cap ** 3, shiny: false, special: 'prof-empoleon', look: 'special', peak: after.cap, from: 0 }, cap: after.cap, money: 0, charm: false,
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

// The Hall of Fame is built but held back: with HOF_READY false (as it ships), nothing of it shows anywhere.
test('the Hall of Fame stays hidden while HOF_READY is false', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const seen = await tab.evaluate(() => {
    S = fresh(); S.box[25] = { xp: 1e9 }; S.party = [25]; S.beat = '2026-11-20'; S.pbeat = 1;
    for (let r = 0; r < REGIONS.length; r++) { for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; S.champs[r] = 1; }
    save(); enter('battle');
    const rows = [];
    for (let r = 0; r <= TRAIN_R; r++) { viewR = r; renderLocs(); rows.push(...[...document.querySelectorAll('#locs [data-loc]')].map(b => JSON.parse(b.dataset.loc).kind)); }
    const wiki = wikiSections().map(x => x.title + x.html).join(' ') + wikiEntry(1019) + wikiTiers();
    const mail = inbox().map(m => m.title + m.body).join(' ');
    openTab('wiki'); const wikiText = document.querySelector('#t-wiki').textContent;
    return { hofRows: rows.filter(k => k === 'hof').length, sp: HOF_SP in SPECIALS, unlocked: unlocked({ kind: 'hof', r: HOF_R }), tier: tierOf({ ...mon(1019), key: 'hof' }),
      wiki: /Hall of Fame|Mega Hydrapple/.test(wiki + wikiText), mail: /Hall of Fame|Mega Hydrapple/.test(mail), resets: PRESTIGE_RESETS.some(x => /Hall of Fame/.test(x)) };
  });
  assert.deepEqual(seen, { hofRows: 0, sp: false, unlocked: false, tier: 5, wiki: false, mail: false, resets: false });
  assert.deepEqual(errors, []);
});

test('the Hall of Fame, switched on: after the Lab, a little harder than Prof Penguin\'s phase 2, and the SP Mega Hydrapple', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24', { hof: true });
  const setup = () => tab.evaluate(() => {
    S = fresh(); S.box[25] = { xp: 1e9 }; S.party = [25];
    for (let r = 0; r < REGIONS.length; r++) { for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; S.champs[r] = 1; }
    save(); enter('battle'); viewR = 0; renderLocs();
  });
  await setup();
  const rows = () => tab.evaluate(() => [...document.querySelectorAll('#locs [data-loc]')].map(b => ({ kind: JSON.parse(b.dataset.loc).kind, open: !b.disabled, text: b.textContent })));
  let list = await rows();
  const lab = list.findIndex(x => x.kind === 'final');
  assert.equal(list[lab + 1].kind, 'hof', 'right after Prof Penguin\'s Lab');
  assert.equal(list[lab + 1].open, false, 'locked until Prof Penguin is beaten');
  await tab.evaluate(() => { S.beat = '2026-11-20'; S.pbeat = 1; renderLocs(); });
  list = await rows();
  assert.ok(list[lab + 1].open && list[lab + 1].text.startsWith('Hall of Fame') && list[lab + 1].text.includes('Sssssssnakes, first graduate'));
  const fight = await tab.evaluate(() => {
    // Prof Penguin's phase 2 method: the best six of every tier, matchups 1×, a quarter of the Protein.
    const use = () => { const cap = areaCap(), hit = (m, f) => refHit(m, cap, f), foes = B.queue.map(f => ({ f, hp: bossHpFor(f, B.L, B.i) * clockRate(f) }));
      const P = refPick([...refPool(...refArea(B.r, 3), cap, 0), ETERNAMAX_FOE], foes, hit);
      return foes.reduce((s, { f, hp }) => s + hp * B.tune / (P.reduce((d, m) => d + hit(m, f), 0) * bossBoost()), 0) / (B.bossTime * refDef(P)); };
    // A team built on its weaknesses from the same pool: matchups counted.
    const counter = () => { const cap = areaCap(), hit = (m, f) => refHit(m, cap, f) * bestEff(m, f), foes = B.queue.map(f => ({ f, hp: bossHpFor(f, B.L, B.i) }));
      const P = refPick([...refPool(...refArea(B.r, 3), cap, 0), ETERNAMAX_FOE], foes, hit);
      return foes.reduce((s, { f, hp }) => s + hp * B.tune / (P.reduce((d, m) => d + hit(m, f), 0) * bossBoost()), 0) / (B.bossTime * refDef(P)); };
    startLoc({ kind: 'hof', r: HOF_R });
    const out = { team: B.queue.map(f => f.name), L: B.L, cap: levelCap(), clock: B.bossTime, use: use(), counter: counter(), said: document.querySelector('#log').textContent };
    B.idx = B.queue.length - 1; B.foe.hp = 1; hit(10); next();
    const b = S.box[1019], sp = SPECIALS[HOF_SP];
    return { ...out, won: hofWon(), sp: b && b.special, look: lookKind(1019), tier: tierOf(fighter(1019)), stats: [sp.hp, sp.atk, sp.def, sp.spa, sp.spd, sp.spe, sp.bst], types: sp.types.join('/'),
      wiki: wikiSections().some(x => x.id === 'hof'), mail: inbox().some(m => m.id === 'update-hall-of-fame') };
  });
  assert.deepEqual(fight.team, ['Serperior', 'Arbok', 'Gigantamax Sandaconda', 'Milotic', 'Zygarde 50% Forme', 'Mega Hydrapple']);
  assert.equal(fight.L, fight.cap);
  assert.ok(fight.said.startsWith('Sssssssnakes, first graduate'));
  assert.ok(Math.abs(fight.use - 1.42) < 0.01, `the reference team needs HOF_USE of the clock (${fight.use.toFixed(3)})`);
  assert.ok(fight.counter >= 0.95 && fight.counter <= 1, `a team built on its weaknesses, with a quarter of the Protein, needs 95-100% of the clock (${fight.counter.toFixed(3)})`);
  assert.deepEqual({ won: fight.won, sp: fight.sp, look: fight.look, tier: fight.tier, stats: fight.stats, types: fight.types, wiki: fight.wiki, mail: fight.mail },
    { won: true, sp: 'hof-hydrapple', look: 'special', tier: 2, stats: [106, 90, 140, 150, 110, 54, 650], types: 'Grass/Dragon', wiki: true, mail: true });
  // Prof Penguin's phase 2, for comparison: his reference team needs FINAL_USE.
  assert.ok(await tab.evaluate(() => FINAL_USE < HOF_USE));
  assert.deepEqual(errors, []);
});

// ── Story Mode (framework). A Classic save as main wrote it before Story existed.
const OLD_SAVE = { v: 1, money: 500, box: { 4: { xp: 1000, shiny: false }, 16: { xp: 300, shiny: true } }, party: [4, 16], balls: { poke: 10, great: 0, ultra: 0, master: 0 }, items: {}, cords: 0, protein: 0, kills: {}, badges: { '0-0': 1 }, champs: {}, dungeons: {}, trips: {}, tickets: {}, seen: {}, loc: { kind: 'route', r: 0, k: 1 }, set: { fresh: 'auto', dupe: 'none', shiny: 'best', auto: 1 }, stones: {}, gfactor: {}, mega: null, gmax: 0, mail: { read: {}, claimed: {}, got: {} }, ach: {}, stats: { taps: 0, wins: 0, evolved: 0, gifts: 0 }, last: Date.now() };

test('an old Classic save stays Classic: same odds, same XP, same snapshot, no Story tab', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(old => {
    localStorage.setItem(KEY, JSON.stringify(old)); slot = KEY; S = readSlot(KEY); boot();
    const xp0 = S.box[16].xp; gainXp(100);
    S.box[4].xp = 1e6; enter('party'); const classicTile = document.querySelector('#party [data-n="4"]').textContent, classicCap = document.querySelector('#partycap').hidden;
    enter('battle');
    return { classicTile, classicCap, story: isStory(), mode: S.mode, odds: shinyOdds() * 4096, xp: S.box[16].xp - xp0, tab: document.querySelector('#tabs [data-tab=story]').hidden, snap: __boredSnapshot(), prestigeRule: canPrestige.toString().includes('isStory') };
  }, OLD_SAVE);
  assert.equal(got.story, false);
  assert.equal(got.mode, undefined, 'an old save is not given a mode');
  assert.ok(!got.classicTile.includes('fights at') && got.classicCap, 'Classic shows one level and no cap line, as before');
  assert.equal(got.odds, 1);
  assert.equal(got.xp, 200, 'the catch-up bonus still applies in Classic (Lv 6 behind Lv 10)');
  assert.equal(got.tab, true);
  assert.deepEqual([got.snap.score, got.snap.lifeDex, got.snap.caught, got.snap.finished, got.snap.story], [3, 2, 2, true, null]);
  assert.deepEqual(errors, []);
});

test('Story Mode: its own save, the opening scenes, ×2 XP and shinies, no prestige, and a Classic board that never moves', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  await tab.evaluate(old => { localStorage.setItem(KEY, JSON.stringify(old)); slot = KEY; S = readSlot(KEY); boot(); go('new'); }, OLD_SAVE);
  assert.equal(await tab.evaluate(() => document.querySelectorAll('#t-card [data-act=mode]').length), 2, 'New game asks Classic or Story');
  await tab.click('#t-card [data-act=mode][data-k="bored.poke-idle.story"]');
  const pick = await tab.evaluate(() => ({ screen, slot, scene: !$('#scene').hidden && sceneNow.id, classic: !!readSlot(KEY) }));
  assert.deepEqual(pick, { screen: 'pick', slot: 'bored.poke-idle.story', scene: 'open-1', classic: true });
  await tab.click('#scene [data-scene=skip]');
  await tab.click('[data-start="7"]');
  const story = await tab.evaluate(() => ({ mode: S.mode, scene: sceneNow && sceneNow.id, odds: shinyOdds() * 4096, charm: (S.charm = 1, shinyOdds() * 4096), prestige: (S.beat = '2026-11-24', S.pbeat = 1, canPrestige()), tab: !$('#tabs [data-tab=story]').hidden, from: S.box[7].from }));
  assert.deepEqual(story, { mode: 'story', scene: 'open-2', odds: 2, charm: 6, prestige: false, tab: true, from: 0 });
  const fields = await tab.evaluate(() => { save(); const st = readSlot(STORY_KEY).story; return { keys: Object.keys(st).sort(), life: Object.keys(st.lifeDex) }; });
  assert.deepEqual(fields.keys, ['ch', 'cleared', 'clues', 'epilogue', 'eternatusStolen', 'frozen', 'giratinaDebt', 'liberated', 'lifeDex', 'nullTrust', 'picks', 'roulette', 'seen', 'silvally', 'y3Recovered', 'year'], 'every story field is in the save from day one');
  assert.deepEqual(fields.life, ['7'], 'the Story lifetime dex');
  await tab.evaluate(() => { S.charm = 0; delete S.beat; delete S.pbeat; });
  await tab.click('#scene [data-scene=skip]');
  const book = await tab.evaluate(() => ({ seen: S.story.seen, tab, text: $('#t-story').textContent, rereads: [...document.querySelectorAll('#t-story [data-reread]')].map(b => b.dataset.reread) }));
  assert.deepEqual(book.seen, { 'open-1': 1, 'open-2': 1 }, 'a skipped scene counts as seen');
  assert.equal(book.tab, 'story');
  assert.ok(book.text.includes('Write down everything, especially the things that seem small.'));
  assert.deepEqual(book.rereads, ['open-1', 'open-2']);
  await tab.click('#t-story [data-reread="open-2"]');
  assert.equal(await tab.evaluate(() => sceneNow.id), 'open-2', 'a scene can be read again');
  await tab.click('#scene [data-scene=skip]');
  // XP: ×2, no catch-up; below its peak a Pokémon gets ×2 more, but only back up to its peak.
  const xp = await tab.evaluate(() => {
    S.box = { 7: { xp: 27, shiny: false, peak: 7 }, 1: { xp: 27, shiny: false } }; S.party = [7, 1];
    const tile = remembers(7) && (openTab('party'), !!document.querySelector('#party [data-n="7"] .peak'));
    gainXp(100); return { remembered: S.box[7].xp, plain: S.box[1].xp, tile, after: remembers(7) };
  });
  assert.deepEqual(xp, { remembered: 343 + 42, plain: 27 + 200, tile: true, after: false });
  // The Classic board doesn't move while Story is open; Story's progress rides along.
  const snap = await tab.evaluate(() => { save(); return __boredSnapshot(); });
  assert.deepEqual([snap.score, snap.lifeDex, snap.caught, snap.finished], [3, 2, 2, true]);
  assert.deepEqual(snap.story, { year: 1, chapter: 0, regionsLiberated: 0, lifeDex: 2, ranked: 100000002 });
  // Switching back: the Classic save is just as it was, and the Story save waits.
  await tab.evaluate(() => { showTitle(); go('switch'); });
  const back = await tab.evaluate(() => ({ slot, mode: S.mode || null, money: S.money, box: Object.keys(S.box), story: readSlot(STORY_KEY).mode, menu: [...document.querySelectorAll('#menu [data-go]')].map(b => b.textContent) }));
  assert.deepEqual(back, { slot: 'bored.poke-idle.save', mode: null, money: 500, box: ['4', '16'], story: 'story', menu: back.menu });
  assert.ok(back.menu.includes('Switch to Story'));
  assert.deepEqual(errors, []);
});

test('Story chapters: rows after the Champion that wait for what they need, scenes before and after, clues, and tracking', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(() => {
    slot = STORY_KEY; S = fresh(); startStory(); S.box[25] = { xp: 1e9 }; S.party = [25];
    SCENES['t-pre'] = { year: 1, r: 0, title: 'Before', lines: [['Prof Penguin', 'One.']] };
    SCENES['t-post'] = { year: 1, r: 0, title: 'After', lines: [['', 'Two.']] };
    CLUES.t = { title: 'A clue', text: 'Something small.' };
    for (const c of [{ id: 't-1', r: 0, type: 'scene', name: 'Test one', pre: 't-pre', post: 't-post', clue: 't', liberates: true }, { id: 't-2', r: 0, type: 'scene', name: 'Test two', after: ['t-1'] }]) { CHAPTERS.push(c); CHAPTER[c.id] = c; }
    viewR = 0; enter('battle');
    const rows = () => [...document.querySelectorAll('#locs .loc')].map(b => ({ text: b.textContent, open: !b.disabled }));
    const before = rows().filter(x => x.text.startsWith('Test'));
    const champAt = rows().findIndex(x => /^Champion Blue/.test(x.text)), oneAt = rows().findIndex(x => x.text.startsWith('Test one'));
    S.champs[0] = 1; renderLocs();
    startLoc({ kind: 'chapter', r: 0, x: 't-1' });
    const pre = sceneNow && sceneNow.id; endScene();
    const post = sceneNow && sceneNow.id; endScene();
    const after = rows().filter(x => x.text.startsWith('Test'));
    // Bond comes from a win in the active party only.
    S.box[26] = { xp: 1e6 }; S.balls = { poke: 0, great: 0, ultra: 0, master: 0 }; startLoc({ kind: 'route', r: 0, k: 0 }); defeat();   // no balls: no random catch
    return { before, after, order: rows()[champAt + 1].text.startsWith('Team Thaw: Rime') && oneAt > champAt, pre, post, ch: S.story.ch, clue: S.story.clues, snap: storyProgress(S), bond: [S.box[25].bond, S.box[26].bond], peak: S.box[25].peak };
  });
  assert.deepEqual(got.before.map(x => [x.text, x.open]), [['Test oneafter Blue', false], ['Test twoafter Test one', false]]);
  assert.equal(got.order, true, 'chapters come right after the Champion, in order');
  assert.deepEqual([got.pre, got.post], ['t-pre', 't-post']);
  assert.deepEqual(got.ch, { 't-1': 1 });
  assert.deepEqual(got.clue, { t: 1 });
  assert.deepEqual(got.after.map(x => [x.text, x.open]), [['Test onedone', true], ['Test twostory', true]]);
  assert.deepEqual(got.snap, { year: 1, chapter: 1, regionsLiberated: 1, lifeDex: 2, ranked: 100010002 });
  assert.deepEqual(got.bond, [1, null], 'only the party member that fought bonds');
  assert.equal(got.peak, 100);
  assert.deepEqual(errors, []);
});

// ── Story Mode Year 1: the content.
const storyAllChamps = () => {
  slot = STORY_KEY; S = fresh(); startStory(); S.box[25] = { xp: 1e9 }; S.party = [25]; S.balls.master = 50; S.set.fresh = 'master'; S.set.dupe = 'master';   // a Master Ball always holds
  for (let r = 0; r < 9; r++) { for (let k = 0; k < 4; k++) { S.badges[r + '-' + k] = 1; S.kills[r + '-' + k] = 10; } S.champs[r] = 1; }
};

test('Story Year 1 plays through: admins, rivals with the mascot you left, picks, prizes, the finale and Red', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(`(${storyAllChamps})()`).then(() => tab.evaluate(() => {
    const done = [], fights = {};
    const skip = () => { let n = 0; while (sceneNow && n++ < 20) endScene(); };
    const win = () => { B.idx = B.queue.length - 1; B.foe.hp = 1; hit(1e12); if (!B.manual) next(); };
    for (let i = 0; i < 160; i++) S.lifeDex[2000 + i] = 1;
    viewR = 0; enter('battle'); skip();
    const gated = chapterOpen(CHAPTER['paldea-finale']);
    for (const c of CHAPTERS) {
      skip(); if (!chapterOpen(c)) continue;
      startLoc({ kind: 'chapter', r: c.r, x: c.id }); skip();
      if (pickNow) { pickClick({ dataset: { pick: String(c.mons[1]) } }); pickClick({ dataset: { pick: 'mine' } }); skip(); }
      fights[c.id] = B.queue.map(f => f.name);
      win(); while (B && B.brk != null) { storyGo(); fights[c.id] = fights[c.id].concat(B.queue.map(f => f.name)); win(); }
      skip(); if (chDone(c.id)) done.push(c.id);
    }
    return { gated, done, fights, picks: S.story.picks, stones: Object.keys(S.stones).map(Number).sort(), key: S.key, charm: S.charm, silvally: !!S.box[772] && S.story.silvally, master: S.balls.master,
      mail: inbox().map(m => m.id).filter(x => /^(story|rival)-/.test(x)),
      sinnoh: MAIL.find(m => m.id === 'story-sinnoh').body,
      silver: MAIL.find(m => m.id === 'story-silver').body,
      signatures: ['story-r1', 'story-r2', 'story-r3', 'story-snakes-end'].map(id => MAIL.find(m => m.id === id).body.match(/— Ss*nakes/)[0]),
      gens: Object.entries(ADMIN_TEAMS).filter(([k]) => k !== 'aether-chief').map(([, [, t]]) => t).map(t => { const g = [...new Set(t.map(x => typeof x === 'string' ? (VARIANT[x].region + 1) : mon(x).gen))]; return g.length === 1 ? g[0] : g.join('/'); }), progress: storyProgress(S), seen: ['johto-250', 'unova-kyurem', 'paldea-freeze', 'silver-after'].map(id => !!S.story.seen[id]) };
  }));
  assert.equal(got.gated, false, 'the finale waits for every legend chapter, not just the dex');
  assert.equal(got.done.length, 23, 'every Year 1 chapter can be finished: ' + got.done.join(', '));
  assert.deepEqual(got.fights['johto-rival'], ['Snivy', 'Ekans', 'Silicobra']);
  assert.deepEqual(got.fights['unova-rival'], ['Servine', 'Arbok', 'Sandaconda', 'Milotic', 'Groudon'], 'Rival 2 has the Hoenn mascot you left');
  assert.deepEqual(got.fights['galar-rival'], ['Serperior', 'Arbok', 'Sandaconda', 'Milotic', 'Zygarde 50% Forme', 'Reshiram'], 'Rival 3 has the Unova mascot you left');
  assert.equal(got.fights['paldea-finale'].length, 18, 'the finale is all three admins, six each');
  assert.deepEqual(got.picks, { 0: 150, 1: 250, 2: 382, 3: 484, 4: 644, 5: 717, 6: 792, 7: 889, 8: 1008 });
  assert.deepEqual(got.stones, [10049, 10058, 10076, 10089, 10281, 10309, 10325]);
  assert.deepEqual([got.key, got.charm, got.silvally], [1, 1, 1], 'The Mask frees Type: Null (silvally 1, trust to come)');
  assert.equal(got.master, 50 - 9 + 4, 'nine thrown on the legends; Year 1 gives four (Unova, Alola, Galar, Rival 3), none from Champions');
  assert.equal(got.fights['alola-silvally'].join(','), 'Togedemaru,Alolan Raichu,Bronzong,Metang,Klefki,Oranguru,Type: Null', 'The Mask: the lab chief\u2019s Steel and Psychic team, then Type: Null');
  for (const id of ['story-johto-250', 'story-hoenn', 'story-sinnoh', 'story-unova', 'story-kalos-next', 'story-alola', 'story-galar']) assert.ok(got.mail.includes(id), 'transition letter ' + id);
  assert.deepEqual(got.mail.filter(x => x.startsWith('rival-')), [], 'Story sends its own rival letters, not Classic\u2019s');
  for (const id of ['story-kanto', 'story-r1', 'story-r2', 'story-r3', 'story-started', 'story-snakes-end', 'story-silver']) assert.ok(got.mail.includes(id), id);
  assert.equal(got.silver, "<p>Red doesn't talk much. His Pokémon don't need him to.</p><p>The ones you fight beside remember you best. Don't forget that.</p><p>Prof Penguin</p>", 'bond hint 1, word for word');
  assert.ok(got.sinnoh.includes('His reply took two days.') && got.sinnoh.includes('Unova next.'), 'Sinnoh\u2019s reply, two days late');
  assert.deepEqual(got.signatures, ['— Sssssnakes', '— Ssssssnakes', '— Sssssssnakes', '— Sssnakes'], 'a different number of s\u2019s every time');
  assert.ok(got.mail.indexOf('story-started') < got.mail.indexOf('story-snakes-end'), 'the last letter sits under Penguin\u2019s');
  assert.deepEqual(got.gens, [1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 7], 'each admin team from its region\u2019s generation, the finale\u2019s all Generation 9');
  assert.deepEqual(got.progress, { year: 1, chapter: 23, regionsLiberated: 9, lifeDex: got.progress.lifeDex, ranked: 100230000 + got.progress.lifeDex });
  assert.deepEqual(got.seen, [true, true, true, true]);
  assert.deepEqual(errors, []);
});

test('Story Year 1: the finale waits for 150 in the Story dex, runs three phases, and starts over from Rime on a loss', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  await tab.evaluate(`(${storyAllChamps})()`);
  const got = await tab.evaluate(() => {
    for (const id of LEGENDS) S.story.ch[id] = 1;
    const before = chapterOpen(CHAPTER['paldea-finale']), note = chapterRows(8).find(x => x.x === 'paldea-finale').note;
    for (let i = 0; i < 150; i++) S.lifeDex[3000 + i] = 1;
    viewR = 8; enter('battle');
    startLoc({ kind: 'story', r: 8, x: 'paldea-finale' });
    const p1 = { phase: B.phase, use: B.tune, L: B.L };
    B.idx = B.queue.length - 1; B.foe.hp = 1; hit(1e12); next();
    const brk = B.brk != null && !bossLocked();
    storyGo(); const p2 = B.phase;
    B.time = 0.001; lastTick = performance.now() - 500; tick();
    return { before, note, p1, brk, p2, after: B && B.kind, done: chDone('paldea-finale') };
  });
  assert.equal(got.before, false);
  assert.match(got.note, /^Dex \d+ \/ 150$/);
  assert.equal(got.p1.phase, 1);
  assert.equal(got.p1.L, 100);
  assert.equal(got.brk, true, 'the party is free during the break');
  assert.equal(got.p2, 2);
  assert.equal(got.after, 'route', 'out of time anywhere: back to the route, and it starts over from Rime');
  assert.equal(got.done, false);
  assert.deepEqual(errors, []);
});

test('Story Year 1: League rules, hidden Classic extras, Story dungeons, and the scenes, clues and letters on the way', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(async () => {
    const classicDen = (slot = KEY, S = fresh(), dungeonBosses(0).map(m => m.num));
    slot = STORY_KEY; S = fresh(); startStory(); S.box[25] = { xp: 1e9 }; S.party = [25]; viewR = 0; enter('battle'); hideTip();
    const sleep = ms => new Promise(f => setTimeout(f, ms)), seen = [];
    const beat = async loc => { S.kills[loc.r + '-' + (loc.k || 0)] = 10; startLoc(loc); B.idx = B.queue.length - 1; B.foe.hp = 1; hit(1e12); next(); await sleep(800); seen.push(sceneNow && sceneNow.id); while (sceneNow) endScene(); };
    await beat({ kind: 'gym', r: 0, k: 0 }); await beat({ kind: 'gym', r: 0, k: 1 });
    for (let k = 1; k < 4; k++) S.badges['0-' + k] = 1;
    await beat({ kind: 'champ', r: 0 });
    for (const r of [1, 2, 4, 5]) S.champs[r] = 1;
    for (const r of [3, 6]) { for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; await beat({ kind: 'champ', r }); }
    for (let r = 0; r < 9; r++) S.champs[r] = 1;
    const kinds = r => (viewR = r, renderLocs(), [...document.querySelectorAll('#locs [data-loc]')].map(b => JSON.parse(b.dataset.loc).kind));
    const k0 = kinds(0), k1 = kinds(1), k7 = kinds(7);
    // League rules: two Tier 3s, then a saved team that fits.
    S.box[150] = { xp: 1e6 }; S.box[249] = { xp: 1e6 }; S.party = [150, 249]; S.teams = [{ name: 'Fits', party: [150, 25] }]; B = null;
    startLoc({ kind: 'gym', r: 0, k: 0 });
    const notice = !$('#league').hidden && $('#league').textContent;
    $('#league [data-league="0"]').click();
    const plates = (S.champs = Object.fromEntries(REGIONS.map((_, r) => [r, 1])), gainPlates(5));
    return { classicDen, storyDen: dungeonBosses(0).map(m => m.num), galar: dungeonBosses(7).map(m => m.num), kalos: dungeonBosses(5).map(m => m.num), hoenn: dungeonBosses(2).map(m => m.num), unova: dungeonBosses(4).map(m => m.num), plates, seen, clues: S.story.clues, mail: inbox().map(m => m.id).filter(x => x.startsWith('story')),
      k0, k1, k7, notice, party: S.party, fighting: B && B.kind, arceus: (S.box[493] = { xp: 1e6 }, leagueBreaks([493])), megaT3: tierOf(formById(10281)) };
  });
  assert.ok(got.classicDen.includes(150), 'Classic keeps Mewtwo in the Kanto dungeon');
  assert.deepEqual(got.storyDen, [144, 145, 146, 151]);
  assert.ok(![888, 889, 890].some(n => got.galar.includes(n)));
  assert.ok([896, 897].every(n => got.galar.includes(n)), 'Glastrier and Spectrier stay for Year 2');
  assert.ok(got.kalos.includes(718) && ![716, 717].some(n => got.kalos.includes(n)), 'Zygarde stays for Year 3');
  assert.ok(![380, 381, 386].some(n => got.hoenn.includes(n)) && ![641, 642, 645, 647].some(n => got.unova.includes(n)), 'no legend a Story chapter gives');
  assert.equal(got.plates, '', 'no Plates in Story');
  assert.deepEqual(got.seen, ['kanto-gyms', null, 'kanto-alarm', null, 'alola-memo'], 'Sinnoh\u2019s letter now comes after Rime\u2019s line, not the Champion');
  assert.deepEqual(got.clues, { badge: 1, memo: 1 });
  assert.deepEqual(got.mail.sort(), ['story-memo']);
  for (const k of ['final', 'hof', 'rival', 'quest', 'summit']) assert.ok(![...got.k0, ...got.k1].includes(k), `no ${k} row in Story`);
  assert.ok(got.k1.includes('chapter') && !got.k7.includes('darkest'));
  assert.ok(got.notice && got.notice.includes('Mascot legends and Mega pseudo forms are both Tier 3.'), 'the League rules notice');
  assert.deepEqual(got.party, [150, 25]);
  assert.equal(got.fighting, 'gym', 'loading a team that fits starts the fight');
  assert.match(got.arceus, /Tier 1 or stronger/);
  assert.equal(got.megaT3, 3);
  assert.deepEqual(errors, []);
});

test('Story Year 1 end: Year 2 waits behind YEAR2_READY, Red stays, and Replay Mode changes nothing that counts', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  await tab.evaluate(`(${storyAllChamps})()`);
  const got = await tab.evaluate(() => {
    localStorage.setItem(KEY, JSON.stringify({ ...fresh(), box: { 1: { xp: 125, shiny: false } }, party: [1] }));
    for (const c of CHAPTERS) S.story.ch[c.id] = 1;
    S.story.epilogue = 1; S.story.picks = { 1: 249 }; S.charm = 1; S.box[249] = { xp: 1e6, shiny: false }; S.money = 777; save();
    const core = () => { const x = JSON.parse(localStorage.getItem(STORY_KEY)); return JSON.stringify([x.box, x.story, x.money, x.balls, x.stones, x.party, x.lifeDex]); };   // not its timestamps
    const main = core(), shinyBefore = localStorage.getItem(SHINY_KEY);
    enter('battle'); viewR = 1; renderLocs();
    const rows = () => [...document.querySelectorAll('#locs .loc')].map(b => ({ text: b.textContent, open: !b.disabled }));
    const year2 = rows().find(x => x.text.startsWith('Year 2'));
    const red = rows().find(x => x.text.startsWith('Mt. Silver'));
    const ach = achs().filter(a => a.group === 'Story').map(a => [a.id, a.have()]);
    showTitle();
    const menu = [...document.querySelectorAll('#menu [data-go]')].map(b => b.dataset.go);
    go('replay');
    enter('battle'); const banner = !$('#replaybar').hidden && $('#replaybar').textContent; showTitle();
    const inReplay = { slot, replay: S.replay, banner, badges: Object.keys(S.badges).length, cap: levelCap(), tag: $('#tagline').textContent, picks: { ...S.story.picks }, ch: Object.keys(S.story.ch).length, menu: [...document.querySelectorAll('#menu [data-go]')].map(b => b.dataset.go), snap: __boredSnapshot() };
    // Play the Johto pick the other way: no catch, no money kept, the main save untouched.
    enter('battle'); while (sceneNow) endScene();
    S.box[999] = { xp: 1e6, shiny: true }; S.story.ch['johto-rival'] = 1; S.story.ch['johto-admin'] = 1; save();   // the replay starts every chapter over
    startLoc({ kind: 'chapter', r: 1, x: 'johto-pick' }); while (sceneNow) endScene();
    pickClick({ dataset: { pick: '250' } }); pickClick({ dataset: { pick: 'mine' } }); while (sceneNow) endScene();
    B.idx = B.queue.length - 1; B.foe.hp = 1; hit(1e12); next(); while (sceneNow) endScene();
    const replayPick = { done: chDone('johto-pick'), caught: !!S.box[250] };
    // No prizes in a replay, but an allowlisted reward (Year 3's one exception) reaches the main Story save, once.
    const prizeBefore = S.stones[10049];
    REPLAY_REWARDS.add('test-reward');
    const hook = [storyReward('prize:johto-pick', T => { T.money += 1; }), storyReward('test-reward', T => { T.money += 5; }), storyReward('test-reward', T => { T.money += 5; })];
    REPLAY_REWARDS.delete('test-reward');
    const mainMoney = readSlot(STORY_KEY).money;
    year2Confirm(); const y2 = { text: $('#scene').textContent, disabled: $('#scene [data-y2="go"]').disabled, no: $('#scene [data-y2="no"]').textContent }; $('#scene [data-y2="no"]').click(); y2.closed = $('#scene').hidden;
    showTitle(); go('endreplay');
    return { y2, year2, red, ach, menu, inReplay, replayPick, prizeBefore: prizeBefore || null, hook, mainMoney, after: { slot, gone: localStorage.getItem(REPLAY_KEY), same: core() === main, shiny: localStorage.getItem(SHINY_KEY) === shinyBefore },
      classicAch: (slot = KEY, S = readSlot(KEY), achs().some(a => a.group === 'Story')), wiki: wikiSections().some(x => x.id === 'story'), classicMail: inbox().some(m => m.id === 'update-story-mode') };
  });
  assert.deepEqual(got.year2, { text: 'Year 2: The Huntcoming soon', open: false }, 'Year 2 shows, but YEAR2_READY is false');
  assert.equal(got.red.open, true, 'Red can still be fought');
  assert.deepEqual(got.ach.map(([, h]) => h), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.ok(got.menu.includes('replay'));
  assert.deepEqual([got.inReplay.slot, got.inReplay.replay, got.inReplay.picks, got.inReplay.ch], ['bored.poke-idle.story.replay', 1, {}, 0]);
  assert.equal(got.inReplay.banner, 'This is a replay. Nothing here changes your save.');
  assert.equal(got.inReplay.tag, 'This is a replay. Nothing here changes your save.');
  assert.deepEqual([got.inReplay.badges, got.inReplay.cap < 20], [0, true], 'the replay uses Year 1\u2019s level caps from the start');
  assert.ok(got.inReplay.menu.includes('endreplay') && !got.inReplay.menu.includes('new'));
  assert.equal(got.inReplay.snap.caught, 1, 'the board still reports the Classic save');
  assert.equal(got.inReplay.snap.story.chapter, 23, 'and the main Story save, not the replay');
  assert.deepEqual(got.replayPick, { done: true, caught: false });
  assert.equal(got.prizeBefore, null, 'no chapter prize in a replay');
  assert.deepEqual(got.hook, [false, true, false], 'only an allowlisted reward, and only once');
  assert.equal(got.mainMoney, 777 + 5);
  assert.deepEqual(got.after, { slot: 'bored.poke-idle.story', gone: null, same: false, shiny: true }, 'only the allowlisted reward changed the main save');
  assert.equal(got.classicAch, false, 'no Story achievements in Classic');
  assert.ok(got.y2.text.includes('Every Pokémon goes back to Lv 5') && got.y2.text.includes('your whole Box') && got.y2.text.includes('Begin Year 2.'), 'the Year 2 confirm screen');
  assert.ok(!/bond/i.test(got.y2.text), 'bond flags are kept but never listed');
  assert.deepEqual([got.y2.disabled, got.y2.no, got.y2.closed], [true, 'Not yet.', true], 'Begin Year 2. stays disabled while YEAR2_READY is false');
  assert.ok(got.wiki && got.classicMail);
  assert.deepEqual(errors, []);
});

test('Story Year 1 finale, as one run: a League-legal team built on the admins gets through all three back to back, and the Hall of Fame stays harder', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  await tab.evaluate(`(${storyAllChamps})()`);
  const got = await tab.evaluate(() => {
    S.key = 1; S.band = 1; for (const id of LEGENDS) S.story.ch[id] = 1; for (let i = 0; i < 160; i++) S.lifeDex[4000 + i] = 1;
    viewR = 8; enter('battle'); startLoc({ kind: 'story', r: 8, x: 'paldea-finale' });
    const cap = areaCap(), typed = (m, f) => refHit(m, cap, f) * bestEff(m, f), pool = refPool(...refArea(8, 3), cap, 2);
    // One team for the whole run, picked against all eighteen, with no swaps in the breaks.
    const all = B.phases.flatMap(adminTeam), team = refPick(pool, all.map(f => ({ f, hp: 1 })), typed, 6, leagueRule);
    const need = () => B.queue.reduce((s, f) => s + bossHpFor(f, B.L, B.i) * B.tune * clockRate(f) / (team.reduce((d, m) => d + typed(m, f), 0) * bossBoost()), 0);
    const phases = [];
    for (let i = 0; i < 3; i++) { if (i) { B.brk = 1; storyGo(); } phases.push({ need: need(), clock: B.bossTime * refDef(team) }); }
    return { legal: !leagueBreaksList(team), phases, whole: phases.reduce((s, p) => s + p.need, 0) / phases.reduce((s, p) => s + p.clock, 0), hof: HOF_USE, finale: FINALE_USE };
  });
  for (const p of got.phases) assert.ok(p.need < p.clock, `each phase is won in time (${(p.need / p.clock).toFixed(3)})`);
  assert.ok(got.whole <= 0.95 && got.whole >= 0.8, `the whole run needs 80-95% of its clock (${got.whole.toFixed(3)})`);
  assert.ok(got.finale < got.hof, 'the Hall of Fame stays the hardest fight');
  assert.deepEqual(errors, []);
});

test('every catch has a from region (Kanto when nothing else fits), the bond flag stays hidden, level sync shows, and Type: Null evolves on trust', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(() => {
    const where = [
      catchRegion({ kind: 'route', r: 3, k: 1 }), catchRegion({ kind: 'dungeon', r: 5 }), catchRegion({ kind: 'summit', r: 1 }), catchRegion({ kind: 'quest', q: 'aether' }),
      catchRegion({ kind: 'quest', q: 'distortion' }), catchRegion({ kind: 'quest', q: 'kitakami' }), catchRegion({ kind: 'quest', q: 'meteor' }), catchRegion({ kind: 'quest', q: 'southern' }),
      catchRegion({ kind: 'quest', q: 'chasm' }), catchRegion({ kind: 'quest', q: 'meltan' }), catchRegion({ kind: 'raid', r: 7 }),
      catchRegion({ kind: 'daily', r: 4 }), catchRegion({ kind: 'tower', r: 8 }), catchRegion({ kind: 'route', r: TRAIN_R, k: 0 }), catchRegion(null), catchRegion({ kind: 'anything' })];
    // An old entry with no region gets Kanto when the save is written.
    slot = KEY; S = fresh(); S.box[1] = { xp: 125 }; S.party = [1]; save(); const old = readSlot(KEY).box[1].from;
    // A route catch in Johto, through addMon.
    S.loc = { kind: 'route', r: 1, k: 0 }; B = { kind: 'route', r: 1, k: 0 }; addMon(161, 5, false); const johto = S.box[161].from;
    // Story: bonded words, and Type: Null's trust.
    slot = STORY_KEY; S = fresh(); startStory(); S.box[25] = { xp: 1e6 }; S.box[NULL] = { xp: 1e6 }; S.party = [25]; S.story.silvally = 1;
    detail = 25; renderDetail(); const unb = document.querySelector('#detail').innerHTML;
    S.box[25].bond = 1; renderDetail(); const bon = document.querySelector('#detail').innerHTML;
    // Level sync: Lv 100 stored, the cap far below.
    enter('party'); const tile = document.querySelector('#party [data-n="25"]').textContent, cap = document.querySelector('#partycap').textContent;
    S.party = [25, NULL]; for (let i = 0; i < 9; i++) nullTrust();
    detail = NULL; renderDetail(); const trust = document.querySelector('#detail').textContent;
    nullTrust();
    return { where, old, johto, hidden: unb === bon && !/bond/i.test(bon), tile, cap, detailLv: bon.includes(`Lv 100 (fights at ${levelCap()})`), lvCap: levelCap(), trust: trust.includes('Trust: 9/10'), silvally: S.story.silvally, party: S.party, has: !!S.box[SILVALLY] };
  });
  assert.deepEqual(got.where, [3, 5, 1, 6, 3, 8, 2, 2, 4, 7, 7, 0, 0, 0, 0, 0]);
  assert.equal(got.old, 0, 'an entry with no region counts as Kanto');
  assert.equal(got.johto, 1);
  assert.equal(got.hidden, true, 'the bond flag is never shown');
  assert.ok(got.tile.includes(`Lv 100 (fights at ${got.lvCap})`) && got.detailLv, 'level sync: the real level and the one it fights at');
  assert.equal(got.cap, `Level cap ${got.lvCap}`);
  assert.equal(got.trust, true, 'Trust: X/10 shows');
  assert.deepEqual([got.silvally, got.party, got.has], [2, [25, 773], true]);
  assert.deepEqual(errors, []);
});

test('the Story tab: Next up and the Year map, with ??? for what you haven\'t reached and the finale shown from the start', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(() => {
    slot = STORY_KEY; S = fresh(); startStory(); S.box[25] = { xp: 1e9 }; S.party = [25];
    CHAPTERS.length = 0;   // just these test chapters
    const add = c => { CHAPTERS.push(c); CHAPTER[c.id] = c; };
    add({ id: 'k-1', r: 0, type: 'scene', name: 'Containment', at: 'Cerulean' });
    add({ id: 'k-2', r: 0, type: 'scene', name: 'The cage', after: ['k-1'] });
    add({ id: 'k-opt', r: 0, type: 'scene', name: 'The Mask', optional: true, after: ['k-1'] });
    add({ id: 'p-f', r: 8, type: 'scene', name: 'Paldea finale', finale: true, after: ['champ'], open: () => lifeDex() >= 150, note: () => `Dex ${lifeDex()} / 150` });
    const step = () => { save(); renderStory(); return { next: storyNext().text, map: yearMap().map(x => x.mark + x.name + (x.optional ? ' (optional)' : '') + (x.note ? ' ' + x.note : '')) }; };
    const a = step(); S.champs[0] = 1; const b = step(); S.story.ch['k-1'] = 1; const c = step();
    S.story.ch['k-2'] = 1; for (let r = 1; r < 9; r++) S.champs[r] = 1; const d = step();
    enter('battle'); openTab('story');
    return { a, b, c, d, shown: document.querySelector('#t-story .next').textContent };
  });
  assert.equal(got.a.next, 'Next: Champion of Kanto, then Containment at Cerulean.');
  assert.deepEqual(got.a.map, ['▶Containment', '🔒???', '🔒??? (optional)', '🔒Paldea finale Dex 1 / 150']);
  assert.equal(got.b.next, 'Next: Containment at Cerulean, in Kanto.');
  assert.deepEqual(got.c.map, ['✓Containment', '▶The cage', '🔒The Mask (optional)', '🔒Paldea finale Dex 1 / 150']);
  assert.equal(got.d.next, 'Next: Paldea finale. Dex 1 / 150');
  assert.equal(got.shown, got.d.next);
  assert.deepEqual(errors, []);
});

test('Story Champions give no Master Ball (Year 1 has four, from chapters); Classic Champions still do', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(() => {
    const champ = story => { slot = story ? STORY_KEY : KEY; S = fresh(); if (story) startStory(); S.box[25] = { xp: 1e9 }; S.party = [25]; for (let k = 0; k < 4; k++) S.badges['0-' + k] = 1;
      enter('battle'); startLoc({ kind: 'champ', r: 0 }); B.idx = B.queue.length - 1; B.foe.hp = 1; hit(1e12); next(); return S.balls.master; };
    return { classic: champ(false), story: champ(true) };
  });
  assert.deepEqual(got, { classic: 1, story: 0 });
  assert.deepEqual(errors, []);
});

test('the test account\'s Story save: its own slot, maxed, and nothing leaks into the real saves, the shiny store or the board', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(() => {
    // A real Classic and a real Story save first.
    const real = fresh(); real.box[1] = { xp: 125, shiny: false }; real.party = [1]; localStorage.setItem(KEY, JSON.stringify(real));
    const story = fresh(); story.mode = 'story'; story.story = freshStory(); story.box[4] = { xp: 125, shiny: false }; story.party = [4]; localStorage.setItem(STORY_KEY, JSON.stringify(story));
    localStorage.setItem(SHINY_KEY, JSON.stringify({ 1: 1 }));
    const before = { story: localStorage.getItem(STORY_KEY), classic: localStorage.getItem(KEY), shiny: localStorage.getItem(SHINY_KEY) };
    slot = KEY; S = readSlot(KEY); boot();
    useSlot(TEST_KEY, testAccount());
    const menu = [...document.querySelectorAll('#menu [data-go]')].map(b => b.textContent);
    go('switch');
    const ts = { slot, mode: S.mode, test: S.test, lv100: Object.values(S.box).every(b => lvlOf(b.xp) === 100), mewtwo: !!S.box[150], koraidon: !!S.box[1007], master: S.balls.master, charm: S.charm, key: S.key, badges: Object.keys(S.badges).length, tag: $('#tagline').textContent };
    // Play a little: a shiny catch, a win, an achievement check, a save.
    S.loc = { kind: 'route', r: 0, k: 0 }; B = { kind: 'route', r: 0, k: 0 }; addMon(10, 5, true); S.box[25] = S.box[25] || { xp: 1e6 }; checkAch(true); save();
    const snap = __boredSnapshot();
    showTitle(); go('back');
    return { menu, ts, snap, after: { slot, classic: S.box[1] ? 'real' : 'other', story: localStorage.getItem(STORY_KEY) === before.story, shiny: localStorage.getItem(SHINY_KEY) === before.shiny,
      testStory: !!readSlot(TEST_STORY_KEY) && readSlot(TEST_STORY_KEY).test } };
  });
  assert.ok(got.menu.includes('Back to my save') && got.menu.includes('Switch to Story'));
  assert.deepEqual([got.ts.slot, got.ts.mode, got.ts.test, got.ts.lv100, got.ts.mewtwo, got.ts.koraidon, got.ts.master, got.ts.charm, got.ts.key, got.ts.badges],
    ['bored.poke-idle.test.story', 'story', 1, true, true, true, 99, 1, 1, 0], 'a maxed Story save, at the start of the story');
  assert.match(got.ts.tag, /^Test account, Story Mode/);
  assert.deepEqual([got.snap.score, got.snap.caught, got.snap.finished, got.snap.story], [0, 0, false, undefined], 'nothing for the leaderboard');
  assert.deepEqual(got.after, { slot: 'bored.poke-idle.save', classic: 'real', story: true, shiny: true, testStory: 1 }, 'the real saves and the shiny store are untouched');
  assert.deepEqual(errors, []);
});

test('the test account\'s Story tools: jump with version picks, reset a chapter, win a fight, League rules, dex gates, Giratina and bond flags', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(async () => {
    const sleep = ms => new Promise(f => setTimeout(f, ms));
    useSlot(TEST_STORY_KEY, testStoryAccount()); storyJump(0); enter('battle'); while (sceneNow) endScene();
    const pts = jumpPoints(), to = id => pts.findIndex(p => p.id === id);
    const labels = pts.map(p => p.label);
    // Jump to Unova's pick, choosing Kyogre in Hoenn and Lugia in Johto.
    storyJump(to('ch-unova-pick'), { 1: '249', 2: '382' }); while (sceneNow) endScene();
    const j = { badges: Object.keys(S.badges).length, champs: Object.keys(S.champs).map(Number), picks: { ...S.story.picks }, next: storyNext().text, open: chapterOpen(CHAPTER['unova-pick']),
      seen: ['hoenn-slush-after', 'johto-249', 'sinnoh-letter'].map(id => !!S.story.seen[id]), clue: !!S.story.clues.badge, mail: inbox().map(m => m.id).filter(x => /^story-(r1|johto-249|r2)$/.test(x)).sort(), r2: S.rivals && S.rivals.mid };
    // The Story tab shows the tools.
    openTab('story'); const tools = !!document.querySelector('#t-story #tj') && document.querySelectorAll('#t-story [data-pick-r]').length;
    // Reset Hoenn's pick.
    resetChapter('hoenn-pick'); const reset = { done: chDone('hoenn-pick'), pick: S.story.picks[2] || null };
    // League rules: two Tier 3s in the party block a gym, until the test switch turns them off.
    S.party = [150, 249]; B = null; startLoc({ kind: 'gym', r: 0, k: 0 }); const blocked = !$('#league').hidden; $('#league').hidden = true;
    testTool('league'); startLoc({ kind: 'gym', r: 0, k: 0 }); const off = B && B.kind;
    // Win the fight at once.
    const winBtn = !$('#testwin').hidden; testWin(); await sleep(800); while (sceneNow) endScene();
    const won = !!S.badges['0-0'];
    // Dex gates.
    for (const id of LEGENDS) S.story.ch[id] = 1; S.champs[8] = 1; S.lifeDex = { 1: 1 };
    const gate = chapterOpen(CHAPTER['paldea-finale']);
    S.debug.dex = 'met'; const met = chapterOpen(CHAPTER['paldea-finale']);
    S.debug.dex = 'ignore'; const ign = chapterOpen(CHAPTER['paldea-finale']);
    // Giratina flags and bond flags.
    const box = document.querySelector('#t-story [data-flag="dealer"]'); renderStory();
    const cb = document.querySelector('#t-story [data-flag="dealer"]'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    testTool('bond', { dataset: { bond: 'all' } }); const all = Object.values(S.box).every(b => b.bond);
    testTool('bond', { dataset: { bond: 'none' } }); const none = Object.values(S.box).every(b => !b.bond);
    // Year 1 cleared: the Begin Year 2 screen.
    storyJump(to('year1-end')); while (sceneNow) endScene(); const y2 = !$('#scene').hidden && $('#scene').textContent.includes('Begin Year 2.');
    return { labels, j, tools, reset, blocked, off, winBtn, won, gates: [gate, met, ign], roulette: S.story.roulette, all, none, y2, epi: S.story.epilogue, real: localStorage.getItem(STORY_KEY) };
  });
  assert.deepEqual(got.labels.slice(0, 4), ['Prologue: starter picked', 'Kanto: gyms', 'Kanto: Champion Blue', 'Kanto: Team Thaw: Rime']);
  assert.ok(got.labels.includes('Alola: The Mask (optional)') && got.labels.at(-2) === 'Epilogue: Mt. Silver' && got.labels.at(-1).startsWith('Year 1 cleared'));
  assert.deepEqual(got.j.champs, [0, 1, 2, 3, 4]);
  assert.equal(got.j.badges, 20);
  assert.deepEqual(got.j.picks, { 0: 150, 1: 249, 2: 382, 3: got.j.picks[3] }, 'the picks asked for, and random where none was');
  assert.ok([483, 484].includes(got.j.picks[3]));
  assert.equal(got.j.open, true);
  assert.match(got.j.next, /^Next: Reshiram or Zekrom/);
  assert.deepEqual(got.j.seen, [true, true, true]);
  assert.equal(got.j.clue, true);
  assert.deepEqual(got.j.mail, ['story-johto-249', 'story-r1', 'story-r2']);
  assert.equal(got.j.r2, 1);
  assert.equal(got.tools, 8, 'a version pick for each region with two mascots (Kanto has only Mewtwo)');
  assert.deepEqual(got.reset, { done: false, pick: null });
  assert.deepEqual([got.blocked, got.off], [true, 'gym'], 'League rules apply, and the test switch turns them off');
  assert.deepEqual([got.winBtn, got.won], [true, true]);
  assert.deepEqual(got.gates, [false, true, true]);
  assert.equal(got.roulette.dealer, 1);
  assert.deepEqual([got.all, got.none], [true, true]);
  assert.deepEqual([got.y2, got.epi], [true, 1]);
  assert.equal(got.real, null, 'the real Story save is never made');
  assert.deepEqual(errors, []);
});

test('Story\'s ranked number: progress always outranks the dex, and Year 3 counts regions liberated before chapters', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(() => {
    const save = (year, ch, dex, lib = 0) => { const s = fresh(); s.mode = 'story'; s.story = { ...freshStory(), year };
      CHAPTERS.slice(0, ch).forEach(c => { s.story.ch[c.id] = 1; }); for (let i = 1; i <= dex; i++) s.lifeDex[i] = 1;
      if (lib) { s.story.ch = {}; CHAPTERS.filter(c => c.liberates).slice(0, lib).forEach(c => { s.story.ch[c.id] = 1; }); } return storyProgress(s).ranked; };
    return { a: save(1, 3, 1025) < save(1, 4, 1), b: save(1, 23, 1025) < save(2, 0, 1), c: save(3, 9, 1025, 1) < save(3, 1, 1, 2), max: save(3, 23, 1025, 9) };
  });
  assert.deepEqual([got.a, got.b, got.c], [true, true, true]);
  assert.ok(got.max < 400000000, 'fits the board\'s max_value');
  assert.deepEqual(errors, []);
});

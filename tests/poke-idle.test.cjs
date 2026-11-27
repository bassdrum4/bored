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
  assert.deepEqual(fields.keys, ['ch', 'cleared', 'clues', 'epilogue', 'eternatusStolen', 'frozen', 'giratinaDebt', 'liberated', 'lifeDex', 'nullTrust', 'pickLinesSeen', 'picks', 'reread', 'roulette', 'seen', 'silvally', 'y3Recovered', 'year'], 'every story field is in the save from day one');
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
      gens: Object.entries(ADMIN_TEAMS).filter(([k]) => k !== 'aether-chief' && !k.startsWith('y2-') && !k.startsWith('y3-')).map(([, [, t]]) => t).map(t => { const g = [...new Set(t.map(x => typeof x === 'string' ? (VARIANT[x].region + 1) : mon(x).gen))]; return g.length === 1 ? g[0] : g.join('/'); }), progress: storyProgress(S), seen: ['johto-250', 'unova-kyurem', 'paldea-freeze', 'silver-after'].map(id => !!S.story.seen[id]) };
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

test('Story Year 1 end: Begin Year 2 opens (YEAR2_READY), Red stays, and Replay Mode changes nothing that counts', async t => {
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
  assert.deepEqual(got.year2, { text: 'Year 2: The Huntbegin', open: true }, 'Begin Year 2 is open now that Year 2 has shipped');
  assert.equal(got.red.open, true, 'Red can still be fought');
  assert.ok(['st_start', 'st_mewtwo', 'st_r1', 'st_started', 'st_red', 'st_y1'].every(id => got.ach.find(([k, h]) => k === id && h === 1)), 'the Year 1 story achievements are earned');
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
  assert.deepEqual([got.y2.disabled, got.y2.no, got.y2.closed], [false, 'Not yet.', true], 'Begin Year 2. is enabled, and Not yet. closes it');
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
    S.party = [150, 249]; B = null; startLoc({ kind: 'gym', r: 0, k: 0 }); const blocked = !$('#league').hidden; overlay('#league', false);
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
  assert.ok(got.labels.includes('Alola: The Mask (optional)') && got.labels[got.labels.indexOf('Epilogue: Mt. Silver') + 1].startsWith('Year 1 cleared') && got.labels.some(l => l.startsWith('Year 2 Paldea')) && got.labels.includes('Year 3 Paldea: Liberate Paldea'));
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
      if (lib) { s.story.ch = {}; CHAPTERS.filter(c => c.liberates && (c.year || 1) === year).slice(0, lib).forEach(c => { s.story.ch[c.id] = 1; }); } return storyProgress(s).ranked; };
    return { a: save(1, 3, 1025) < save(1, 4, 1), b: save(1, 23, 1025) < save(2, 0, 1), c: save(3, 9, 1025, 1) < save(3, 1, 1, 2), max: save(3, 23, 1025, 9) };
  });
  assert.deepEqual([got.a, got.b, got.c], [true, true, true]);
  assert.ok(got.max < 400000000, 'fits the board\'s max_value');
  assert.deepEqual(errors, []);
});

test('Story achievements: types and display rules, Story only, Replay awards only the replayOk choices, and the wiki keeps hidden ones hidden', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-24');
  const got = await tab.evaluate(() => {
    const rows = () => [...document.querySelectorAll('#achlist .ach')].map(r => r.textContent);
    const head = () => [...document.querySelectorAll('#achlist .ach-group')].map(h => h.textContent).find(t => t.startsWith('Story'));
    // Classic: no Story group.
    slot = KEY; S = fresh(); S.box[1] = { xp: 125 }; S.party = [1]; enter('ach');
    const classic = { story: !!head(), count: $('#achsum').textContent };
    // Story: a hidden one shows as ??? until earned; a secret one isn't listed, and the header counts it.
    ACH.push({ id: 'sc_test', group: 'Story', story: true, type: 'secret', title: 'Test Secret', desc: 'A secret', need: 1, have: () => 0 });
    slot = STORY_KEY; S = fresh(); startStory(); S.box[1] = { xp: 125 }; S.party = [1]; save(); checkAch(true); openTab('ach');
    const before = { rows: rows(), head: head(), sum: $('#achsum').textContent };
    S.story.seen['sinnoh-483'] = 1; checkAch(true); renderAch();
    const after = rows();
    // Rereading a scene from the Story tab.
    S.story.seen['open-1'] = 1; openTab('story'); while (sceneNow) endScene(); document.querySelector('#t-story [data-reread]').click(); while (sceneNow) endScene();
    const reread = !!S.ach.st_reread;
    // Replay: the pick there counts toward Both Halves on the main save; nothing is earned in the replay itself.
    S.story.picks[1] = 249; S.story.pickLinesSeen['johto-249'] = 1; S.story.epilogue = 1; for (const c of CHAPTERS) S.story.ch[c.id] = 1; checkAch(true); save();
    const mainBoth = !!S.ach.ch_both;
    startReplay(); S.story.ch['johto-rival'] = 1; S.story.ch['johto-admin'] = 1;
    pickNow = { c: CHAPTER['johto-pick'], n: 250 }; pickClick({ dataset: { pick: 'mine' } }); while (sceneNow) endScene();
    const replayAch = Object.keys(S.ach).filter(k => /^(st|ch)_/.test(k)).length;
    showTitle(); go('endreplay');
    const back = { both: !!S.ach.ch_both, hooh: !!S.ach.ch_hooh, seen: { ...S.story.pickLinesSeen } };
    const wiki = wikiSections().find(x => x.id === 'story').html;
    ACH.pop();
    return { classic, before, after, reread, mainBoth, replayAch, back, wiki, secrets: ACH.filter(a => a.type === 'secret').length };
  });
  assert.equal(got.classic.story, false, 'no Story group in Classic');
  assert.ok(got.before.head.includes(`+${got.secrets + 1} secret`), 'the header counts the unearned secrets: ' + got.before.head);
  assert.ok(!got.before.rows.some(r => r.includes('Test Secret')), 'a secret one is not listed');
  assert.ok(got.before.rows.some(r => r.startsWith('??? · Keep playing.')), 'a hidden one is ???');
  assert.ok(!got.before.rows.some(r => r.includes('He Always Did')));
  assert.ok(got.after.some(r => r.startsWith('He Always Did')), 'earned: revealed');
  assert.match(got.before.sum, /^\d+\/\d+ earned/);
  assert.equal(got.reread, true, 'Write It Down');
  assert.equal(got.mainBoth, false);
  assert.equal(got.replayAch, 0, 'Replay gives no achievements itself');
  assert.deepEqual(got.back.seen, { 'johto-249': 1, 'johto-250': 1 }, 'the replay’s pick is kept on the main save');
  assert.deepEqual([got.back.both, got.back.hooh], [true, true], 'Both Halves and the other pick, earned on the main save');
  assert.ok(got.wiki.includes('There are hidden achievements.') && got.wiki.includes('Write It Down') && !got.wiki.includes('He Always Did'));
  assert.deepEqual(errors, []);
});

test('Prof Penguin\'s text box never moves the page: the tip slot keeps one height, scenes open over it, and a fast tap can\'t reach the battle', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-26');
  await tab.setViewport({ width: 375, height: 740, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  // An old Classic save, from before tips and Story existed.
  await tab.evaluate(old => { localStorage.setItem(KEY, JSON.stringify(old)); slot = KEY; S = readSlot(KEY); boot(); go('continue'); }, OLD_SAVE);
  // What the text box could push: the tabs, the slot itself and the top of the battle screen (the field's own height
  // changes as the fight goes on, so only where it starts is measured).
  const where = () => tab.evaluate(() => [['#tabs', 1], ['#tip', 1], ['#t-battle', 0], ['#field', 0]].map(([q, h]) => { const r = $(q).getBoundingClientRect(); return [q, r.top, r.left, r.width, h ? r.height : 0]; }));
  // An old save gets the tips from the start: the welcome one is up.
  assert.deepEqual(await tab.evaluate(() => [screen, tipNow && tipNow.id]), ['game', 'hello']);
  const before = await where();
  await tab.evaluate(() => { S.tut.seen.hello = 1; hideTip(); });
  const idle = await tab.evaluate(() => ({ cls: $('#tip').className, text: $('#tip .dlg-text').textContent, shown: getComputedStyle($('#tip')).display, op: +getComputedStyle($('#tip')).opacity }));
  assert.ok(idle.cls.includes('idle') && idle.text === '…' && idle.shown !== 'none' && idle.op < 1, 'with nothing to say, the slot is there and faint');
  assert.deepEqual(await where(), before, 'the welcome tip closing moves nothing');
  for (let k = 0; k < 4; k++) {
    // A tip, the longest one too: the slot doesn't grow; a long one comes in pages.
    const tip = await tab.evaluate(k => { S.tut = { seen: {}, off: 0 }; if (k % 2) for (const x of TIPS) if (x.id !== 'tier3') S.tut.seen[x.id] = 1; tutor(); return { now: tipNow && tipNow.id, pages: tipPages.length, idle: $('#tip').classList.contains('idle'), face: $('#tip .dlg-face img') && $('#tip .dlg-face img').getAttribute('src') }; }, k);
    if (tip.now) {
      assert.equal(tip.idle, false);
      assert.match(tip.face, /pokedoku\/sprites\/prof-penguin\.png$/);
      assert.deepEqual(await where(), before, `the page stays put while Prof Penguin talks (${tip.now})`);
      // Tap once: the line finishes. Tap again: the next page, or done.
      const tap1 = await tab.evaluate(() => { $('#tip [data-tip=more], #tip [data-tip=ok]').click(); return { typing: !!typer.t, pg: tipPg, full: typer.i === typer.text.length }; });
      assert.deepEqual(tap1, { typing: false, pg: 0, full: true }, 'the first tap finishes the line');
      for (let p = 1; p < tip.pages; p++) { await tab.evaluate(() => { $('#tip [data-tip=more]').click(); typeFinish(); }); assert.deepEqual(await where(), before); }
      await tab.evaluate(() => $('#tip [data-tip=ok]').click());
      assert.equal(await tab.evaluate(() => tipNow), null);
    }
    assert.deepEqual(await where(), before, 'and when he stops');
  }
  // The welcome tip at phone width is more than two lines, so it pages, and no page overflows the box.
  const paged = await tab.evaluate(() => { hideTip(); S.tut = { seen: {}, off: 0 }; tutor(); const n = tipPages.length, el = $('#tip .dlg-text'); let over = 0; for (let i = 0; i < n; i++) { tipPg = i; tipPage(); typeFinish(); if (el.scrollHeight > el.clientHeight + 1) over++; } hideTip(); return { n, over }; });
  assert.ok(paged.n >= 2, `a long tip is paged (${paged.n})`);
  assert.equal(paged.over, 0, 'every page fits the box');
  // A scene (Story content isn't in Classic, so play one directly): an overlay on a veil that takes the taps.
  for (let k = 0; k < 3; k++) {
    const open = await tab.evaluate(() => {
      playScene('open-1');
      const f = $('#foe').getBoundingClientRect(), hit = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2);
      const p = $('#scene').getBoundingClientRect();
      return { veil: !$('#veil').hidden, hitFoe: !!(hit && hit.closest('#foe')), fixed: getComputedStyle($('#scene')).position, inView: p.bottom <= innerHeight && p.left >= 0 && p.right <= innerWidth, next: $('#scene [data-scene=next]').getBoundingClientRect().height };
    });
    assert.deepEqual(open, { veil: true, hitFoe: false, fixed: 'fixed', inView: true, next: open.next });
    assert.ok(open.next >= 40, 'Next is big enough for a thumb');
    assert.deepEqual(await where(), before, 'opening a scene moves nothing behind it');
    // Next stays in one place from line to line, and a tap first finishes the line.
    const lines = await tab.evaluate(() => { const at = [], b = () => $('#scene [data-scene=next]').getBoundingClientRect(); const taps = []; while (sceneNow) { at.push(Math.round(b().top)); const typing = !!typer.t; $('#scene [data-scene=next]').click(); taps.push(typing ? !!sceneNow && !typer.t : true); if (sceneNow) $('#scene [data-scene=next]').click(); } return { at: [...new Set(at)], taps: taps.every(Boolean), veil: !$('#veil').hidden }; });
    assert.equal(lines.at.length, 1, 'Next never moves');
    assert.ok(lines.taps);
    assert.equal(lines.veil, false, 'the veil goes with the scene');
    assert.deepEqual(await where(), before, 'closing it moves nothing either');
  }
  // Space doesn't tap the foe through a scene, and the game keeps running behind it.
  const behind = await tab.evaluate(() => { playScene('open-1'); const taps = S.stats.taps; document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); const r = { taps: S.stats.taps - taps }; endScene(); return r; });
  assert.equal(behind.taps, 0);
  // Other speakers get a placeholder frame with their initials.
  const face = await tab.evaluate(() => { const d = document.createElement('div'); d.innerHTML = dlgFace('Team Thaw grunt'); return d.textContent; });
  assert.equal(face, 'TT');
  // Mail has the letter.
  assert.ok(await tab.evaluate(() => MAIL.some(m => /makeover/.test(m.title))));
  assert.deepEqual(errors, []);
});

test('Year 2 begins (test save): the reset keeps the A10 list, the new League has its own leaders and Ice-shifted Champions, and Classic never sees it', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-26');
  const got = await tab.evaluate(() => {
    // Classic's teams first, to check they don't change once a Story year has been open.
    S = fresh(); S.box[25] = { xp: 125 }; S.party = [25]; slot = KEY; save(); boot();
    const classic = { gym: gymTeam(0, 1).map(m => m.num), champ: champTeam(5).map(m => m.num), name: gymName(0, 1), year: storyYear() };
    useSlot(TEST_STORY_KEY, testStoryAccount());
    const pts = jumpPoints(), to = id => pts.findIndex(p => p.id === id);
    storyJump(to('year1-end')); while (sceneNow) endScene();
    // Something to keep: a bond, a from, a Mega Stone, a form unlock, cells, a saved team, an achievement, a key item.
    S.box[25].bond = 1; S.box[25].from = 3; S.box[25].xp = 1e6; S.stones[10062] = 1; S.won = { ...(S.won || {}), kitakami: 1 }; S.cells = 37; S.teams = [{ name: 'Keep', party: [25] }]; S.ach.st_start = Date.now();
    S.money = 5e6; S.items = { fire: 3 }; S.tickets = { 0: 2 }; S.protein = 9; S.balls.master = 3;
    const before = { peak: lvlOf(S.box[25].xp), box: Object.keys(S.box).length, dex: lifeDex(), red: chapterRows(1).some(x => x.x === 'johto-silver') };
    // The Begin Year 2 row is open to the test account (YEAR2_READY is still off for players).
    const row = unlocked({ kind: 'year2' }), ready = YEAR2_READY;
    year2Confirm(); const go = !$('#scene [data-y2="go"]').disabled; $('#scene [data-y2="go"]').click();
    const interlude = sceneNow && sceneNow.id; while (sceneNow) endScene();
    const b = S.box[25];
    const after = {
      year: S.story.year, cleared: S.story.cleared, lv: realLevel(25), peak: b.peak, remembers: remembers(25), bond: b.bond, from: b.from,
      all5: Object.values(S.box).every(x => lvlOf(x.xp) <= 5), box: Object.keys(S.box).length, dex: lifeDex(),
      badges: Object.keys(S.badges).length, champs: Object.keys(S.champs).length, money: S.money, balls: S.balls, items: S.items, tickets: S.tickets, protein: S.protein,
      key: S.key, stone: S.stones[10062], won: S.won.kitakami, cells: S.cells, teams: S.teams.length, ach: !!S.ach.st_start, charm: S.charm,
      letter: !!S.mail.got['story-y2-start'], cap: levelCap()
    };
    // The new League.
    const league = {
      names: REGIONS.map((R, r) => [0, 1, 2, 3].map(k => gymName(r, k))),
      nessa: gymTeam(0, 1).map(m => m.num), place: locName({ kind: 'gym', r: 0, k: 1 }),
      sizes: REGIONS.map((R, r) => gymTeam(r, 3).length),
      typed: REGIONS.every((R, r) => [0, 1, 2, 3].every(k => gymTeam(r, k).every(m => m.types.includes(R.gyms[k][1])))),
      ice: REGIONS.map((R, r) => champTeam(r).filter(m => m.types.includes('Ice')).length),
      max: leagueMax(), rule: [leagueRule([mon(384)], mon(646)), leagueRule([mon(384), mon(646)], mon(888)), leagueRule([mon(380), mon(381)], mon(386)), leagueRule([mon(380), mon(381), mon(386)], mon(641))]
    };
    S.kills['0-1'] = KILLS_FOR_GYM; S.debug.league = 0; startLoc({ kind: 'gym', r: 0, k: 1 }); const line = $('#log').textContent; B = null;
    startLoc({ kind: 'champ', r: 0 }); B = null;
    // The Story tab: Year 2's map with the Crown Shrine row and its checklist; Red still on Johto's list.
    openTab('story');
    const tabText = $('#t-story').textContent;
    const crown = yearMap().find(x => x.id === 'y2-crown');
    const story = { crown, next: storyNext().text, red: chapterRows(1).some(x => x.x === 'johto-silver'), y1rows: chapterRows(0).filter(x => !x.x.startsWith('y2-')).length, header: tabText.includes('Year 2: The Hunt') };
    // Three Words: secret, so not listed until the letter is read.
    openTab('ach'); const unread = { listed: $('#t-ach').textContent.includes('Three Words'), secret: /\+\d+ secret/.test($('#t-ach').textContent) };
    openTab('mail'); document.querySelector('#mail [data-mail="story-y2-start"]').click();
    const letter = $('#mail').textContent;
    return new Promise(done => setTimeout(() => { checkAch(true); openTab('ach'); done({ classic, before, row, ready, go, interlude, after, league, line, story, unread, letter,
      three: !!S.ach.st_three, listed: $('#t-ach').textContent.includes('Three Words'),
      // Back in Classic: the teams are the ones from before, and nothing of Year 2 shows.
      back: (useSlot(KEY), { gym: gymTeam(0, 1).map(m => m.num), champ: champTeam(5).map(m => m.num), name: gymName(0, 1), year: storyYear(), place: locName({ kind: 'gym', r: 0, k: 1 }) }) }); }, 50));
  });
  assert.equal(got.ready, true, 'Year 2 has shipped');
  assert.ok(got.row && got.go, 'the test account can begin Year 2');
  assert.equal(got.interlude, 'y2-interlude');
  const a = got.after;
  assert.deepEqual([a.year, a.cleared, a.lv, a.remembers, a.all5, a.bond, a.from], [2, { 1: 1 }, 5, true, true, 1, 3]);
  assert.equal(a.peak, got.before.peak, 'the peak is kept, so it remembers you');
  assert.deepEqual([a.box, a.dex], [got.before.box, got.before.dex], 'the Box and dex stay');
  assert.deepEqual([a.badges, a.champs, a.money, a.balls, a.items, a.tickets, a.protein], [0, 0, 0, { poke: 10, great: 0, ultra: 0, master: 0 }, {}, {}, 0], 'badges, money, balls and items reset');
  assert.deepEqual([a.key, a.stone, a.won, a.cells, a.teams, a.ach, a.charm], [1, 1, 1, 37, 1, true, 1], 'key items, Mega Stones, form unlocks, cells, saved teams and achievements stay');
  assert.ok(a.letter);
  assert.ok(a.cap <= 20, `the cap starts over at Kanto (${a.cap})`);
  const L = got.league;
  assert.deepEqual(L.names[0], ['Roxanne', 'Nessa', 'Gardenia', 'Clay']);
  assert.deepEqual(L.names[4], ['Koga', 'Giovanni', 'Winona', 'Clair']);
  assert.deepEqual(L.names[8], ['Norman', 'Acerola', 'Tate & Liza', 'Roxie']);
  assert.deepEqual([...L.nessa].sort((x, y) => x - y), [118, 834, 846], "Nessa's own team");
  assert.equal(L.place, "Nessa's Water gym");
  assert.deepEqual(L.sizes, [3, 3, 3, 4, 4, 4, 5, 5, 5]);
  assert.ok(L.typed, 'every Year 2 leader keeps the gym type');
  assert.deepEqual(L.ice.map(n => n >= 1), Array(9).fill(true), `every Champion has Ice types (${L.ice})`);
  assert.deepEqual(L.max, { 3: 2, 4: 3 }, 'Year 2 League rules');
  assert.deepEqual(L.rule, [true, false, true, false], 'Year 2 allows two Tier 3s (Rayquaza, Kyurem) and three Tier 4s (Latias, Latios, Deoxys), no more');
  assert.match(got.line, /Hulbury's harbor froze solid/);
  assert.ok(got.story.crown && got.story.crown.name === 'Crown Shrine' && /Dex \d+ \/ 300/.test(got.story.crown.note) && /Glastrier [✓✗]/.test(got.story.crown.note), 'the Crown Shrine row shows from the start, with its checklist');
  assert.ok(got.story.red, 'Red stays on Johto\'s list');
  assert.equal(got.story.y1rows, 0, 'Year 1\'s chapters are off the lists');
  assert.ok(got.story.header);
  assert.deepEqual(got.unread, { listed: false, secret: true }, 'Three Words is secret until earned');
  assert.match(got.letter, /three words, not two/);
  assert.ok(got.three && got.listed, 'reading the letter earns Three Words');
  assert.deepEqual(got.back, { ...got.classic, place: got.back.place }, 'Classic keeps its own teams and leaders');
  assert.equal(got.back.place, "Misty's Water gym");
  assert.deepEqual(errors, []);
});

test('Year 2, the other half: guards, the bound legends you left, Rayquaza, the camp and its dealer, Kyurem, Memo #2, Eternatus, and the hat at the Shotgun Roulette table', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-26');
  const got = await tab.evaluate(() => {
    const scenes = {};
    const skip = () => { let n = 0; while (sceneNow && n++ < 30) { if (sceneNow.id === 'y2-johto-r1-after') { sceneNow.i = 1; renderScene(); typeFinish(); scenes.johto = $('#scene .dlg-text').textContent; } endScene(); } };
    const win = () => { B.idx = B.queue.length - 1; B.foe.hp = 1; hit(1e12); if (!B.manual) next(); };
    useSlot(TEST_STORY_KEY, testStoryAccount());
    const pts = jumpPoints(), to = id => pts.findIndex(p => p.id === id);
    storyJump(to('y2-begin') + 1, { 1: '249', 2: '383', 3: '483', 4: '643', 5: '716', 6: '791', 7: '888', 8: '1007' });
    skip();
    for (const b of [250, 382, 484, 644, 717, 792, 889, 1008, 384, 646, 890, 487]) delete S.box[b];
    delete S.seen[487]; S.party = S.party.filter(n => S.box[n]); if (!S.party.length) S.party = [Object.keys(S.box).map(Number)[0]];
    for (let r = 0; r < 9; r++) { S.champs[r] = 1; for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; }
    S.balls.master = 50; save(); viewR = 0; enter('battle'); skip();
    const done = [], fights = {}, dealer = {};
    const chapters = chaptersNow().filter(c => c.type !== 'crown' && !c.hunt);
    for (const c of chapters) {
      skip(); if (!chapterOpen(c)) continue;
      startLoc({ kind: 'chapter', r: c.r, x: c.id });
      skip();
      if (!B || B.kind !== 'story') { if (chDone(c.id)) done.push(c.id); continue; }
      fights[c.id] = B.queue.map(f => f.name);
      if (c.type === 'dealer') Object.assign(dealer, { name: B.queue[0].name, info: $('#foeinfo').textContent, shade: $('#foeimg').classList.contains('shade'), seen: !!S.seen[487], log: $('#log').textContent, where: $('#where').textContent });
      win(); skip(); if (chDone(c.id)) done.push(c.id);
    }
    if (B) B = null;
    const caught = Object.fromEntries([250, 382, 484, 644, 717, 792, 889, 1008, 384, 646, 890].map(n => [n, S.box[n] ? S.box[n].from : null]));
    const mail = inbox().map(m => m.id).filter(x => x.startsWith('story-y2'));
    const sig = id => (MAIL.find(m => m.id === id).body.match(/— Ss*nakes/) || [''])[0];
    checkAch(true);
    const dealerAfter = { seen: !!S.seen[487], box: !!S.box[487], clue: !!S.story.clues.table, hat: S.story.roulette && S.story.roulette.hat, shared: localStorage.getItem(ROULETTE_KEY) };
    const texts = [$('#t-story').textContent, ...MAIL.filter(m => m.id.startsWith('story-y2')).map(m => m.body + m.title), ...Object.entries(SCENES).filter(([id]) => id.startsWith('y2-')).flatMap(([, s]) => s.lines.map(l => l[1])), ...Object.values(CLUES).map(c => c.title + c.text),
      ...ACH.filter(a => a.story).map(a => a.title + a.desc), ...chaptersNow().map(c => c.name + (c.doneNote || ''))];
    openTab('story'); texts.push($('#t-story').textContent);
    const named = texts.filter(x => /Giratina/.test(x));
    // The real Story save (not a test save, not Replay) shares the flag.
    const real = JSON.parse(JSON.stringify(S)); delete real.test; delete real.debug; localStorage.setItem(STORY_KEY, JSON.stringify(real));
    useSlot(STORY_KEY); shareRoulette('hat');
    return { done, fights, dealer, scenes, caught, mail, sigs: [sig('story-y2-r1'), sig('story-y2-r2')], pickLines: Object.keys(S.story.pickLinesSeen).filter(k => k.startsWith('y2:')).sort(),
      master: S.balls.master, dealerAfter, named, ach: ['st_battery', 'st_otherhalf', 'st_debt'].map(id => !!S.ach[id]),
      johtoLetter: MAIL.find(m => m.id === 'story-y2-johto-249').body, shared: JSON.parse(localStorage.getItem(ROULETTE_KEY)) };
  });
  assert.equal(got.done.length, 22, 'every other-half chapter plays through: ' + got.done.join(', '));
  assert.ok(got.done.includes('y2-kanto-lab'), 'Kanto: the sealed lab');
  assert.deepEqual(got.fights['y2-johto-rival'], ['Servine', 'Arbok', 'Sandaconda', 'Milotic'], 'Rival Y2-1 has no borrowed legend');
  assert.deepEqual(got.fights['y2-unova-rival'], ['Serperior', 'Arbok', 'Sandaconda', 'Milotic', 'Zygarde 50% Forme']);
  assert.deepEqual(['johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'].map(r => got.fights[`y2-${r}-bound`][0]), ['Ho-Oh', 'Kyogre', 'Palkia', 'Zekrom', 'Yveltal', 'Lunala', 'Zamazenta', 'Miraidon'], 'each region’s bound legend is the one you didn’t pick');
  assert.deepEqual(['hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'].map(r => got.fights[`y2-${r}-admin`].length), [6, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(got.caught, { 250: 1, 382: 2, 484: 3, 644: 4, 717: 5, 792: 6, 889: 7, 1008: 8, 384: 2, 646: 4, 890: 7 }, 'every catch has its region (A17)');
  assert.equal(got.dealer.name, '???');
  assert.ok(got.dealer.info.startsWith('???') && got.dealer.shade && !got.dealer.seen, 'the dealer: ???, shadowed, not seen');
  assert.ok(!/Giratina/.test(got.dealer.log + got.dealer.where + got.dealer.info), 'the battle never names it');
  assert.deepEqual([got.dealerAfter.seen, got.dealerAfter.box, got.dealerAfter.clue, got.dealerAfter.hat, got.dealerAfter.shared], [false, false, true, 1, null], 'not caught, not seen; the clue and the hat flag; a test save shares nothing');
  assert.deepEqual(got.named, [], 'nothing names it: Mail, scenes, clues, achievements, rows, the Story tab');
  assert.match(got.scenes.johto, /Ho-Oh strains against the cables/);
  for (const id of ['story-y2-r1', 'story-y2-johto-249', 'story-y2-hoenn-383', 'story-y2-rayquaza', 'story-y2-sinnoh-483', 'story-y2-camp', 'story-y2-unova-643', 'story-y2-r2', 'story-y2-kyurem', 'story-y2-kalos-716', 'story-y2-alola-791', 'story-y2-memo2', 'story-y2-galar-888', 'story-y2-eternatus', 'story-y2-paldea-1007']) assert.ok(got.mail.includes(id), id);
  assert.ok(!got.mail.includes('story-y2-johto-250'), 'only your pick’s line');
  assert.equal(got.johtoLetter, "<p>Ho-Oh too, now. Your Lugia's been restless all year. I think it missed the other one.</p><p>Prof Penguin</p>");
  assert.deepEqual(got.sigs, ['— Sssssnakes', '— Ssssssnakes'], 'the s count in each signature');
  assert.deepEqual(got.pickLines, ['y2:alola-791', 'y2:galar-888', 'y2:hoenn-383', 'y2:johto-249', 'y2:kalos-716', 'y2:paldea-1007', 'y2:sinnoh-483', 'y2:unova-643']);
  assert.equal(got.master, 50 - 11 + 1, 'eleven thrown, and Rival Y2-2’s Master Ball');
  assert.deepEqual(got.ach, [true, true, true]);
  assert.deepEqual(got.shared, { hat: 1 }, 'the real Story save shares the hat flag');
  // Shotgun Roulette, same origin: the chair and hat wait at the table, and the hat has a note.
  const sr = tab.url().replace('poke-idle.html', 'shotgun-roulette.html');
  await tab.goto(sr); await tab.waitForFunction(() => typeof window.__boredSnapshot === 'function');
  const chair = await tab.evaluate(() => { const shown = !document.querySelector('#pchair').hidden; document.querySelector('#pchair').click(); return { shown, note: document.querySelector('#pnote').textContent, noteShown: !document.querySelector('#pnote').hidden }; });
  assert.deepEqual(chair, { shown: true, note: 'P. — you still owe me a rematch. — G.', noteShown: true });
  await tab.evaluate(() => localStorage.removeItem('bored.poke-idle.roulette.v1')); await tab.reload(); await tab.waitForFunction(() => typeof window.__boredSnapshot === 'function');
  assert.equal(await tab.evaluate(() => document.querySelector('#pchair').hidden), true, 'no flag, no chair');
  assert.deepEqual(errors, []);
});

test('Year 2, the Hunt: rows open with the Champions and stay ??? until then, every catch is from its place, Meltan and Kubfu join at the cap, Kubfu waits for a tower, and Giant Chasm waits for Unova', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-26');
  const got = await tab.evaluate(() => {
    const skip = () => { let n = 0; while (sceneNow && n++ < 30) endScene(); };
    // Each foe in turn (the last one is the catch), then the chapter.
    const win = () => { const here = B; for (let n = 0; n < 12 && B === here && B.foe; n++) { B.foe.hp = 1; hit(1e12); if (B === here && !B.manual) next(); } };
    useSlot(TEST_STORY_KEY, testStoryAccount());
    const pts = jumpPoints(), to = id => pts.findIndex(p => p.id === id);
    storyJump(to('y2-begin') + 1, { 4: '643' }); skip();
    const mine = [1017, 386, 380, 381, 641, 642, 645, 647, 808, 809, 891, 892, 1024];
    for (const n of mine) delete S.box[n];
    S.party = S.party.filter(n => S.box[n]); S.balls.master = 50; S.won = {}; delete S.stones[10062]; delete S.stones[10063];
    // One Champion: the Hunt is still ???.
    S.champs = { 0: 1 }; viewR = HUNT_R; enter('battle'); skip();
    const tabs = [...document.querySelectorAll('#regions [data-r]')].map(b => b.textContent);
    const one = { tabs, regionRows: [0, 1, 2, 3, 4, 5, 6, 7, 8].some(r => chapterRows(r).some(x => CHAPTER[x.x].hunt)), mapHead: (openTab('story'), $('#t-story h3') && $('#t-story h3').textContent), map: yearMap().filter(x => CHAPTER[x.id].hunt).map(x => x.name), next: storyNext().text, row: chapterRows(HUNT_R).map(x => [locName(x), x.note]),
      list: [...document.querySelectorAll('#locs .loc')].map(b => b.textContent).filter(t => /Kitakami|Ogerpon|Scout/.test(t)) };
    // Two: Kitakami opens (in Johto's list); the others don't.
    S.champs[1] = 1; renderLocs();
    const two = { open: chaptersNow().filter(c => c.hunt && chapterOpen(c)).map(c => c.id), ogerpon: chapterRows(HUNT_R).find(x => x.x === 'y2-kitakami').note };
    // All nine: play the Hunt. Giant Chasm waits for Unova's other half.
    for (let r = 0; r < 9; r++) { S.champs[r] = 1; for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; }
    const capNow = levelCap(), chasmBefore = chapterOpen(CHAPTER['y2-chasm']);
    const done = [], kubfu = {};
    for (const c of chaptersNow().filter(c => c.hunt && c.id !== 'y2-chasm')) {
      skip(); if (!chapterOpen(c)) continue;
      if (c.id === 'y2-towers-climb') Object.assign(kubfu, { lv: realLevel(891), evo: evoOptions(891).length, urshifu: !!S.box[892] });
      startLoc({ kind: 'chapter', r: c.r, x: c.id }); skip();
      if (!B || B.kind !== 'story') continue;
      win(); skip(); if (chDone(c.id)) done.push(c.id);
    }
    S.story.ch['y2-unova-bound'] = 1;
    startLoc({ kind: 'chapter', r: 7, x: 'y2-chasm' }); skip(); if (chDone('y2-chasm')) done.push('y2-chasm');
    checkAch(true);
    const from = Object.fromEntries(mine.filter(n => S.box[n]).map(n => [n, S.box[n].from]));
    const sig = id => (MAIL.find(m => m.id === id).body.match(/— Ss*nakes/) || [''])[0];
    return { one, two, capNow, chasmBefore, done, from, kubfu, gifts: [realLevel(808), S.box[892] ? realLevel(892) : 0], won: Object.keys(S.won).sort(), stones: [S.stones[10062], S.stones[10063]], masks: S.story.masks,
      under: chapterRows(HUNT_R).find(x => x.x === 'y2-underdepths').note, terapagos: !!S.box[1024],
      mail: inbox().map(m => m.id), sigs: [sig('story-y2-alone'), sig('story-y2-stupid')], chasm: MAIL.find(m => m.id === 'story-y2-chasm').body,
      ach: ['st_masks', 'st_deoxys', 'st_keldeo', 'st_watching', 'st_lost', 'st_tanks'].map(id => !!S.ach[id]) };
  });
  assert.ok(got.one.tabs.includes('The Hunt') && !got.one.regionRows, 'the Hunt has its own list, not the regions\u2019');
  assert.equal(got.one.mapHead, 'The Hunt', 'and its own section in the Year map');
  assert.ok(got.one.map.every(n => n === '???'), 'locked Hunt rows are ??? in the Year map: ' + got.one.map);
  assert.ok(!/Kitakami|Ogerpon|Scout/.test(got.one.next), 'Next up doesn’t name them either');
  assert.ok(got.one.row.every(([name]) => name === '???') && got.one.row.every(([, note]) => /^after \d Champions$/.test(note)) && got.one.row[0][1] === 'after 2 Champions' && got.one.row.at(-1)[1] === 'after 8 Champions', JSON.stringify(got.one.row));
  assert.deepEqual(got.one.list, [], 'the list shows ??? too');
  assert.deepEqual(got.two.open, ['y2-kitakami-1', 'y2-kitakami-2', 'y2-kitakami-3'], 'the second Champion opens the scouts');
  assert.equal(got.two.ogerpon, 'Masks returned: 0/3');
  assert.equal(got.chasmBefore, false, 'Giant Chasm waits for Unova’s other half');
  assert.deepEqual(got.done, ['y2-kitakami-1', 'y2-kitakami-2', 'y2-kitakami-3', 'y2-kitakami', 'y2-meteor', 'y2-latias', 'y2-latios', 'y2-tornadus', 'y2-thundurus', 'y2-landorus', 'y2-icirrus', 'y2-towers', 'y2-towers-climb', 'y2-underdepths', 'y2-chasm']);
  assert.deepEqual(got.from, { 1017: 8, 386: 2, 380: 2, 381: 2, 641: 4, 642: 4, 645: 4, 647: 4, 808: 7, 809: 7, 891: 7, 892: 7 }, 'A17: Kitakami → Paldea, Meteor Falls and Southern Island → Hoenn, Abundant Shrine and Icirrus → Unova, the towers and the Mystery Box → Galar');
  assert.ok(got.kubfu.lv >= 30 && got.kubfu.evo === 0 && !got.kubfu.urshifu, `Kubfu arrives at the cap (Lv ${got.kubfu.lv}) and waits for a tower`);
  assert.deepEqual(got.gifts, [got.capNow, got.capNow], 'Meltan and Kubfu (now Urshifu) at the cap');
  assert.deepEqual(got.won, ['abundant', 'chasm', 'icirrus', 'kitakami', 'meteor', 'southern', 'towers'], 'the form unlocks');
  assert.deepEqual(got.stones, [1, 1], 'Latiasite and Latiosite');
  assert.equal(got.masks, 3);
  assert.equal(got.under, 'Terapagos: lost. For now.');
  assert.equal(got.terapagos, false, 'no Terapagos');
  for (const id of ['story-y2-kitakami', 'story-y2-alone', 'story-y2-stupid', 'story-y2-promise', 'story-y2-chasm']) assert.ok(got.mail.includes(id), id);
  assert.deepEqual(got.sigs, ['— Ssssssssnakes', '— Sssssssnakes'], 'one s too many, then his usual');
  assert.equal(got.chasm, "<p>If the tanks are full, they'll run it. Soon. I don't know what it will take from you. But whatever happens next, the ones who've fought with you will hold on.</p><p>Prof Penguin</p>", 'bond hint 2, word for word');
  assert.deepEqual(got.ach, [true, true, true, true, true, true]);
  assert.deepEqual(errors, []);
});

test('Year 2, the whole year on a real Story save: Begin Year 2, every gym, Champion and chapter, the Crown Shrine and its prizes, the Year 3 screens (off), and Replay Year 2', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-26');
  const got = await tab.evaluate(() => {
    const skip = () => { let n = 0; while (sceneNow && n++ < 40) endScene(); };
    const win = () => { const here = B; for (let n = 0; n < 12 && B === here && B.foe; n++) { B.foe.hp = 1; hit(1e12); if (B === here && !B.manual) next(); } };
    // A real Story save at the end of Year 1 (built with the test account's jump, then made a real save).
    useSlot(TEST_STORY_KEY, testStoryAccount());
    const pts = jumpPoints(); storyJump(pts.findIndex(p => p.id === 'year1-end'), { 1: '249', 2: '383', 3: '483', 4: '643', 5: '716', 6: '791', 7: '888', 8: '1007' }); skip(); overlay('#scene', false);
    for (const n of [250, 382, 484, 644, 717, 792, 889, 1008, 384, 646, 890, 487, 1017, 386, 380, 381, 641, 642, 645, 647, 808, 809, 891, 892, 1024, 898]) delete S.box[n];
    const real = JSON.parse(JSON.stringify(S)); delete real.test; delete real.debug;
    real.party = [248, 445, 149, 376, 373, 635]; real.balls.master = 0;
    localStorage.setItem(STORY_KEY, JSON.stringify(real)); useSlot(STORY_KEY); enter('battle'); skip();
    const gate = { ready: YEAR2_READY, test: !!S.test, row: unlocked({ kind: 'year2' }) };
    startLoc({ kind: 'year2', r: 0 }); $('#scene [data-y2="go"]').click(); skip();
    const begun = { year: S.story.year, cap: levelCap(), lv5: realLevel(248) };
    S.balls.master = 80; S.story.lifeDex = { ...S.story.lifeDex }; for (let i = 0; i < 400; i++) S.lifeDex[3000 + i] = 1;
    const log = { gyms: 0, champs: 0, chapters: [] };
    for (let r = 0; r < 9; r++) {
      viewR = r;
      for (let k = 0; k < 4; k++) { S.kills[r + '-' + k] = KILLS_FOR_GYM; startLoc({ kind: 'gym', r, k }); skip(); if (B && B.kind === 'gym') { win(); skip(); if (badge(r, k)) log.gyms++; } }
      startLoc({ kind: 'champ', r }); skip(); if (B && B.kind === 'champ') { win(); skip(); if (S.champs[r]) log.champs++; }
      for (let pass = 0; pass < 3; pass++) for (const c of chaptersNow()) {
        if (c.type === 'crown' || chDone(c.id) || !chapterOpen(c)) continue;
        startLoc({ kind: 'chapter', r: c.r, x: c.id }); skip();
        if (B && B.kind === 'story') { win(); skip(); }
        if (chDone(c.id)) log.chapters.push(c.id);
      }
    }
    // The Riders for the checklist, from Galar's dungeon.
    for (const n of [896, 897]) S.box[n] = { xp: 1e6, shiny: false, from: 7 };
    const crownOpen = chapterOpen(CHAPTER['y2-crown']);
    startLoc({ kind: 'chapter', r: 7, x: 'y2-crown' }); skip();
    const crownFight = B && B.queue.map(f => f.name);
    win(); const scenes = []; let n = 0; while (sceneNow && n++ < 40) { scenes.push(sceneNow.id); endScene(); }
    checkAch(true);
    const cal = S.box[898];
    const after = { done: chDone('y2-crown'), cleared: S.story.cleared, calyrex: cal && { bond: cal.bond, from: cal.from, lv: realLevel(898), cap: levelCap() }, won: [S.won.crown, S.won.weald], ach: [!!S.ach.st_bridges, !!S.ach.st_king], scenes,
      riders: (QFORMES[898] || []).every(f => S.won[f.quest]), next: storyNext().text,
      engine: SCENES['y2-engine'].lines[0][1], endText: ['y2-crown', 'y2-crown-after', 'y2-engine'].flatMap(id => SCENES[id].lines.map(l => l[1])).join(' '), letter: S.mail.got['story-y2-end'] && MAIL.find(m => m.id === 'story-y2-end').body };
    // Begin Year 3: a row that says coming soon; its screens exist but stay off.
    viewR = 7; renderLocs();
    const y3row = [...document.querySelectorAll('#locs .loc')].map(b => b.textContent).find(t => t.startsWith('Year 3'));
    startLoc({ kind: 'year3', r: 7 }); const y3toast = $('#toast').textContent;
    const realOpen = year3Open();
    S.test = 1; startLoc({ kind: 'year3', r: 7 });
    const confirm = { text: $('#scene').textContent, go: $('#scene [data-y3="go"]').disabled, realOpen };
    $('#scene [data-y3="pick"]').click();
    const box = Object.keys(S.box).length, rows = () => [...document.querySelectorAll('#po-list .po-row')];
    const pick = { all: rows().length, first: rows()[0].textContent };
    const q = $('#po-q'); q.value = 'calyrex'; q.dispatchEvent(new Event('input', { bubbles: true }));
    pick.found = rows().map(r => r.textContent);
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    const rsel = $('#po-r'); rsel.value = '7'; rsel.dispatchEvent(new Event('change', { bubbles: true })); pick.galar = rows().every(r => r.textContent.includes('Comes back when Galar is freed.'));
    rsel.value = 'all'; rsel.dispatchEvent(new Event('change', { bubbles: true }));
    const ssel = $('#po-sort'); ssel.value = 'level'; ssel.dispatchEvent(new Event('change', { bubbles: true })); pick.top = rows()[0].textContent;
    document.querySelector('#po-list [data-po="898"]').click();
    pick.chosen = $('.po-chosen').textContent; pick.stay = $('#scene [data-y3="stay"]').disabled; pick.stayText = $('#scene [data-y3="stay"]').textContent;
    pick.noBond = !/bond|♥|fought beside|half/i.test($('#scene').textContent);
    overlay('#scene', false); pickOne = null; delete S.test; save();
    // Replay Year 2 from the title screen: Year 2's caps and rules, and nothing that counts.
    showTitle(); const menu = [...document.querySelectorAll('#menu [data-go]')].map(b => b.dataset.go);
    go('replay2');
    const replay = { slot, year: storyYear(), replay: S.replay, cap: levelCap(), max: leagueMax(), picks: S.story.picks[1], open: chaptersNow().filter(c => !chDone(c.id)).length };
    go('endreplay');
    return { gate, begun, log, crownOpen, crownFight, after, y3row, y3toast, confirm, box, pick, menu, replay, main: { year: storyYear(), slot } };
  });
  assert.deepEqual(got.gate, { ready: true, test: false, row: true }, 'Begin Year 2 is open on a real save');
  assert.deepEqual([got.begun.year, got.begun.lv5], [2, 5]);
  assert.deepEqual([got.log.gyms, got.log.champs], [36, 9], 'all 36 Year 2 gyms and nine Champions');
  assert.equal(got.log.chapters.length, 37, 'every Year 2 chapter before the finale: ' + got.log.chapters.join(', '));
  assert.ok(got.crownOpen, 'the Crown Shrine opens with its checklist met');
  assert.deepEqual(got.crownFight, ['Serperior', 'Arbok', 'Sandaconda', 'Milotic', 'Zygarde 50% Forme']);
  assert.ok(got.after.done);
  assert.deepEqual(got.after.cleared, { 1: 1, 2: 1 });
  assert.deepEqual(got.after.calyrex, { bond: 1, from: 7, lv: got.after.calyrex.cap, cap: got.after.calyrex.cap }, 'Calyrex joins bonded, at the cap, from Galar');
  assert.deepEqual(got.after.won, [1, 1], 'both Riders and the Crowned forms');
  assert.ok(got.after.riders);
  assert.deepEqual(got.after.ach, [true, true]);
  assert.deepEqual(got.after.scenes.slice(-2), ['y2-crown-after', 'y2-engine'], 'the badge in the snow, the base maps, and the Engine starts');
  assert.equal(got.after.engine, "That's when the Engine starts. Far away, something enormous begins to hum, and the tanks start to drain.");
  assert.ok(!/freez/i.test(got.after.endText), 'nothing at the Crown Shrine says the Box freezes');
  assert.equal(got.after.letter, "<p>It's warming up. We have a little time. Not much.</p><p>Prof Penguin</p>");
  assert.equal(got.after.next, 'Year 2 is done. Year 3 is coming.');
  assert.equal(got.y3row, 'Year 3: The Thawcoming soon');
  assert.match(got.y3toast, /isn't here yet/);
  assert.ok(got.confirm.text.includes("Your Box will freeze. You'll keep one Pokémon. Everything else comes back as you free each region.") && !got.confirm.go && got.confirm.realOpen === false, 'Begin Year 3. is off on a real save (YEAR3_READY), on for the test account');
  assert.equal(got.pick.all, got.box, 'the pick-one screen lists the whole Box');
  assert.match(got.pick.first, /^.+ Lv \d+ Comes back when \w+ is freed\.$/, 'name, level and where it comes back: ' + got.pick.first);
  assert.deepEqual(got.pick.found.length, 1);
  assert.ok(got.pick.galar, 'filter by where it comes back');
  assert.match(got.pick.top, /Lv 100/, 'sort by level');
  assert.match(got.pick.chosen, /Calyrex: Stays with you at Lv \d+\. It fights at your level cap until the cap catches up\./);
  assert.deepEqual([got.pick.stay, got.pick.stayText], [false, 'This one stays with me.'], 'open for the test account; a real save never gets here before YEAR3_READY');
  assert.ok(got.pick.noBond, 'no bond status or return levels');
  assert.ok(got.menu.includes('replay2'), 'Replay Year 2 on the title screen');
  assert.deepEqual([got.replay.slot, got.replay.year, got.replay.replay, got.replay.max, got.replay.picks], ['bored.poke-idle.story.replay', 2, 1, { 3: 2, 4: 3 }, 249], 'Replay Year 2: its own slot, Year 2’s rules, your Year 1 picks');
  assert.ok(got.replay.cap <= 20 && got.replay.open > 30, 'from the start of Year 2, at its caps');
  assert.deepEqual(got.main, { year: 2, slot: 'bored.poke-idle.story' });
  assert.deepEqual(errors, []);
});

test('Year 2 finale, the Crown Shrine: a League-legal team built on Sssssssnakes’ needs most of the clock, and the Hall of Fame stays harder', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-26');
  const got = await tab.evaluate(() => {
    useSlot(TEST_STORY_KEY, testStoryAccount());
    const pts = jumpPoints(); storyJump(pts.findIndex(p => p.id === 'y2-begin') + 1); while (sceneNow) endScene();
    for (let r = 0; r < 9; r++) S.champs[r] = 1;
    viewR = 7; enter('battle'); S.debug.league = 0; startLoc({ kind: 'story', r: 7, x: 'y2-crown' });
    const cap = areaCap(), typed = (m, f) => refHit(m, cap, f) * bestEff(m, f);
    const pool = refPool(...refArea(7, 3), cap, 2);
    const counter = refPick(pool, B.queue.map(f => ({ f, hp: 1 })), typed, 6, leagueRule);
    const any = refPick(pool, B.queue.map(f => ({ f, hp: 1 })), (m, f) => refHit(m, cap, f), 6, leagueRule);
    const need = team => B.queue.reduce((s, f) => s + bossHpFor(f, B.L, B.i) * B.tune * clockRate(f) / (team.reduce((d, m) => d + typed(m, f), 0) * bossBoost()), 0) / (B.bossTime * refDef(team));
    return { counter: need(counter), any: need(any), legal: [!leagueBreaksList(counter), !leagueBreaksList(any)], team: counter.map(m => m.name), crown: CROWN_USE, hof: HOF_USE, cap, L: B.L };
  });
  assert.deepEqual(got.legal, [true, true]);
  assert.ok(got.counter < 0.95 && got.counter >= 0.85, `a team built on his needs about 88% of the clock (${got.counter.toFixed(3)}: ${got.team.join(', ')}; any strong League team: ${got.any.toFixed(3)})`);
  console.log(`# crown: counter ${got.counter.toFixed(3)}, generic ${got.any.toFixed(3)}, L ${got.L}, team ${got.team.join(', ')}`);
  assert.ok(got.any > 1, `a generic League team still loses (${got.any.toFixed(3)})`);
  assert.ok(got.crown < got.hof, 'the Hall of Fame stays the hardest fight');
  assert.deepEqual(errors, []);
});

test('the admin block in the snapshot: both real saves (party and counts only), never the test account, null when missing or broken, and the board fields unchanged', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-26');
  const got = await tab.evaluate(() => {
    const BOARD = ['slug', 'caught', 'shinies', 'score', 'lifeDex', 'badges', 'tower', 'prestige', 'ranked', 'boss', 'finished', 'story'];
    const snap = () => JSON.parse(JSON.stringify(window.__boredSnapshot()));
    const board = s => { const { admin, ...rest } = s; return rest; };
    localStorage.clear();
    // A Classic save: prestige 1, two badges, Kanto's Champion, a shiny in the party, a Mega on.
    const c = fresh(); c.prestige = 1; c.box = { 6: { xp: 30 ** 3, shiny: true }, 25: { xp: 20 ** 3 }, 1: { xp: 125 } }; c.party = [6, 25]; c.badges = { '0-0': 1, '0-1': 1 }; c.champs = { 0: 1 };
    c.lifeDex = { 1: 1, 6: 1, 25: 1, 150: 1 }; c.key = 1; c.stones = { 10034: 1 }; c.mega = { n: 6, f: 10034 };
    // A Story save: Year 1 cleared, picks, two bonded of three, one above the cap.
    const st = fresh(); st.mode = 'story'; st.story = { ...freshStory(), epilogue: 1, picks: { 1: 249, 2: 383 }, ch: { 'kanto-admin': 1 } };
    st.box = { 7: { xp: 90 ** 3, bond: 1 }, 249: { xp: 40 ** 3, bond: 1 }, 10: { xp: 125 } }; st.party = [7, 249];
    // 1. Only Classic.
    localStorage.setItem(KEY, JSON.stringify(c)); slot = KEY; S = readSlot(KEY); boot();
    const onlyClassic = snap();
    // 2. Both: Classic open, Story from storage.
    localStorage.setItem(STORY_KEY, JSON.stringify(st));
    const both = snap();
    // 3. Only Story: Story open, no Classic save.
    useSlot(STORY_KEY); localStorage.removeItem(KEY);
    const onlyStory = snap();
    // A Replay open: the real Story save, not the replay copy.
    localStorage.setItem(KEY, JSON.stringify(c));
    useSlot(STORY_KEY); startReplay(); S.box[999] = { xp: 125 }; const replay = snap(); go('endreplay');
    // 4. The test account, Classic and Story: the real saves only.
    useSlot(TEST_KEY, testAccount()); const testOpen = snap();
    useSlot(TEST_STORY_KEY, testStoryAccount()); const testStoryOpen = snap();
    // A broken Story save, and a test save written into a real slot by mistake.
    localStorage.setItem(STORY_KEY, '{nope'); useSlot(KEY); const broken = snap();
    const t2 = testAccount(); localStorage.setItem(STORY_KEY, JSON.stringify({ ...t2, mode: 'story', story: freshStory() })); const flagged = snap();
    // Size with a full Box: still small.
    const big = fresh(); for (let n = 1; n <= 1025; n++) big.box[n] = { xp: 125 }; big.party = [1, 2, 3, 4, 5, 6, 7]; slot = KEY; S = big; save();
    const size = JSON.stringify(window.__boredSnapshot().admin).length, bigParty = window.__boredSnapshot().admin.classic.party.length;
    return { BOARD, onlyClassic, both, onlyStory, replay, testOpen, testStoryOpen, broken, flagged, size, bigParty,
      keys: [onlyClassic, both, onlyStory, replay].map(s => Object.keys(board(s))), testKeys: Object.keys(board(testOpen)), testBoard: board(testOpen), bondUi: document.body.innerText.includes('Bonded') };
  });
  // The board fields: the same keys as before, and the test account's still zeroed.
  for (const k of got.keys) assert.deepEqual(k, got.BOARD);
  assert.deepEqual(got.testKeys, got.BOARD.filter(k => k !== 'story'), 'the test account\u2019s zeroed fields, as before');
  assert.deepEqual([got.onlyClassic.prestige, got.onlyClassic.lifeDex, got.onlyClassic.ranked, got.onlyClassic.caught, got.onlyClassic.shinies], [1, 4, 2051 + 4, 3, 1], 'the Classic board numbers are unchanged');
  assert.deepEqual([got.testBoard.caught, got.testBoard.ranked, got.testBoard.finished], [0, 0, false]);
  const C = got.onlyClassic.admin;
  assert.equal(C.v, 1);
  assert.deepEqual(C.classic, { prestige: 1, dex: 4, shinies: 1, badges: 2, champs: 1, region: 'Johto', boxCount: 3,
    party: [{ num: 6, lvl: C.classic.party[0].lvl, shiny: true, form: null, mega: 'Mega Charizard X' }, { num: 25, lvl: C.classic.party[1].lvl, shiny: false, form: null, mega: null }] });
  assert.ok(C.classic.party.every(p => p.lvl >= 1 && p.lvl <= 20), 'Classic levels are the ones the game shows (held to the cap)');
  assert.equal(C.story, null, 'only Classic: no Story');
  assert.deepEqual(got.both.admin.classic, C.classic);
  const Y = got.both.admin.story;
  assert.deepEqual({ ...Y, party: undefined }, { year: 1, chapter: 1, liberated: 0, lifeDex: 3, boxCount: 3, party: undefined, bonded: 2, unbonded: 1, picks: { 1: 249, 2: 383 }, cleared: [1] });
  assert.deepEqual(Y.party.map(p => [p.num, p.lvl, p.shiny, p.form, p.mega]), [[7, 90, false, null, null], [249, 40, false, null, null]]);
  assert.ok(Y.party.every(p => p.battleLvl <= p.lvl) && Y.party[0].battleLvl < 90, 'battle level is the synced one');
  assert.equal(got.onlyStory.admin.classic, null, 'only Story: no Classic');
  assert.deepEqual(got.onlyStory.admin.story, Y);
  assert.equal(got.replay.admin.story.boxCount, 3, 'a replay reports the real Story save');
  assert.deepEqual(got.testOpen.admin.classic, C.classic, 'the test account open: the real Classic save, never the test one');
  assert.equal(got.testOpen.admin.story.boxCount, 3);
  assert.deepEqual(got.testStoryOpen.admin, got.testOpen.admin);
  assert.equal(got.broken.admin.story, null, 'a broken save is null');
  assert.equal(got.flagged.admin.story, null, 'a save marked as a test is left out');
  assert.ok(got.size < 1500 && got.bigParty === 6, `party only, never the Box (${got.size} bytes with a full Box)`);
  assert.equal(got.bondUi, false, 'nothing about bonds shows to players');
  assert.deepEqual(errors, []);
});

test('Year 3 begins (test save): the freeze keeps one, deletes nothing, and leaves the frozen out of the party, teams, evolution and catches; occupied gyms free their leaders; the first thaw', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-27');
  const got = await tab.evaluate(() => {
    const skip = () => { let n = 0; while (sceneNow && n++ < 40) endScene(); };
    const win = () => { const here = B; for (let n = 0; n < 12 && B === here && B.foe; n++) { B.foe.hp = 1; hit(1e12); if (B === here && !B.manual) next(); } };
    // Classic's gyms, to check they don't change.
    S = fresh(); S.box[25] = { xp: 125 }; S.party = [25]; slot = KEY; save(); boot();
    const classic = { gym: gymTeam(0, 1).map(m => m.num), name: gymName(0, 1), place: locName({ kind: 'gym', r: 0, k: 1 }) };
    useSlot(TEST_STORY_KEY, testStoryAccount());
    const pts = jumpPoints(); storyJump(pts.findIndex(p => p.id === 'ch-y2-crown') + 1); skip(); overlay('#scene', false);
    // Spread the Box over the nine regions, with a few bonded; a saved team; something to keep.
    Object.entries(S.box).forEach(([n, b], i) => { b.from = i % 9; if (i % 3 === 0) b.bond = 1; else delete b.bond; });
    S.box[6].xp = 80 ** 3; S.box[6].from = 0; S.box[6].bond = 1;   // Charizard: bonded, Kanto, Lv 80
    S.box[9].xp = 61 ** 3; S.box[9].peak = 61; S.box[9].from = 0; delete S.box[9].bond; // Blastoise: unbonded, Kanto, Lv 61
    S.box[3].xp = 7 ** 3; S.box[3].from = 0; delete S.box[3].bond;  // Venusaur: unbonded, Kanto, Lv 7
    S.box[248].from = 1;                                             // Tyranitar: Johto
    S.teams = [{ name: 'Old', party: [6, 248, 9] }]; S.money = 1e6; S.items = { fire: 3 }; S.balls.master = 4; S.stones[10062] = 1; S.won.kitakami = 1; S.ach.st_start = 1;
    S.party = [150, 6, 248]; save();
    const before = { box: Object.keys(S.box).length, ids: Object.keys(S.box).sort().join(), charizard: realLevel(6), peak9: lvlOf(S.box[9].xp), keptLv: realLevel(150), eternatus: !!S.box[890] };
    const row = unlocked({ kind: 'year3' });
    startLoc({ kind: 'year3', r: 0 }); const goOff = $('#scene [data-y3="go"]').disabled; $('#scene [data-y3="go"]').click();
    const interlude = sceneNow && sceneNow.id; skip();
    const pickOpen = !!document.querySelector('#po-list'); document.querySelector('#po-list [data-po="150"]').click(); $('#scene [data-y3="stay"]').click();
    const kept = sceneNow && sceneNow.id; skip();
    const frozen = Object.entries(S.box).filter(([n, b]) => b.frozen != null);
    const after = {
      year: S.story.year, cleared: S.story.cleared, kept: S.story.kept, party: S.party.slice(), box: Object.keys(S.box).length, ids: Object.keys(S.box).sort().join(),
      allFrozen: frozen.length === before.box - 1, keptFree: !isFrozen(150) && realLevel(150) === before.keptLv,
      regions: frozen.every(([n, b]) => b.frozen === b.from && b.frozen >= 0 && b.frozen < 9), stolen: [S.story.eternatusStolen, S.box[890] && S.box[890].stolen],
      money: S.money, balls: { ...S.balls }, items: S.items, badges: Object.keys(S.badges).length, champs: Object.keys(S.champs).length, cap: levelCap(),
      key: S.key, stone: S.stones[10062], won: S.won.kitakami, teams: S.teams.length, ach: !!S.ach.st_start,
      mail: ['story-y3-start', 'story-y3-snakes'].map(id => !!S.mail.got[id]), held: S.story.frozen, recovered: recovered()
    };
    const letter = MAIL.find(m => m.id === 'story-y3-start').body, snakes = MAIL.find(m => m.id === 'story-y3-snakes').body;
    // The frozen stay out of everything.
    toggleParty(6); const notIn = !S.party.includes(6), refused = $('#toast').textContent;
    placeIn(9, 1); const notPlaced = !S.party.includes(9);
    loadTeam(0); const loaded = { party: S.party.slice(), toast: $('#toast').textContent };
    openTab('party'); renderParty();
    const tile = document.querySelector('#boxgrid [data-n="6"]'), slots = [...document.querySelectorAll('#party .ghost')].map(g => g.textContent);
    const evo = canEvolve(4, [5, 'L', 16]);
    // A wild Pokémon of a frozen species: no throw.
    S.set.fresh = 'all'; S.set.dupe = 'all'; S.balls.poke = 50; startLoc({ kind: 'route', r: 0, k: 0 }); B.foe = { m: mon(6), L: 5, hp: 1, max: 1, wild: true, reward: 1 }; defeat();
    const catchText = $('#log').textContent; B = null;
    // No League rule, and the occupied gyms.
    const league = { breaks: leagueBreaks([150, 493]), rule: leagueRule([mon(150), mon(493)], mon(890)), max: leagueMax() };
    const gyms = { names: [0, 1, 2, 3].map(k => gymName(0, k)), place: locName({ kind: 'gym', r: 0, k: 1 }),
      ice: REGIONS.every((R, r) => [0, 1, 2, 3].every(k => R.gyms[k][1] === 'Ice' || gymTeam(r, k).some(m => m.types.includes('Ice')))),
      typed: REGIONS.every((R, r) => [0, 1, 2, 3].every(k => gymTeam(r, k).filter(m => m.types.includes(R.gyms[k][1])).length >= gymTeam(r, k).length - 1)) };
    viewR = 0; renderLocs();
    const rows = [...document.querySelectorAll('#locs .loc')].map(b => b.textContent);
    const next0 = storyNext().text;
    S.party = [150]; S.debug.league = 0;
    const lines = [];
    for (let k = 0; k < 4; k++) { S.kills['0-' + k] = KILLS_FOR_GYM; startLoc({ kind: 'gym', r: 0, k }); lines.push($('#log').textContent.split('\n')[0]); win(); }
    const freed = { names: [0, 1, 2, 3].map(k => gymName(0, k)), record: Object.keys(S.story.freed).length, cap: levelCap() };
    return new Promise(done => setTimeout(() => {
      freed.toast = $('#toast').textContent;
      const lib = chapterRows(0).find(x => x.x === 'y3-kanto-free'), next1 = storyNext().text;
      startLoc({ kind: 'chapter', r: 0, x: 'y3-kanto-free' }); skip(); win();
      const msg = $('#scene').textContent;
      $('#scene [data-thaw]').click(); skip();
      const thaw = { charizard: [realLevel(6), isFrozen(6)], blastoise: [realLevel(9), S.box[9].peak, remembers(9)], venusaur: realLevel(3), tyranitar: isFrozen(248),
        champ: S.champs[0], cap: levelCap(), capNext: Math.min(100, gymLevel(4) + CAP_OVER), told: !!S.mail.got['story-y3-told'], toldBody: MAIL.find(m => m.id === 'story-y3-told').body, lib: storyProgress(S).regionsLiberated, recovered: recovered(),
        kanto: Object.values(S.box).filter(b => b.from === 0 && b.frozen != null && !b.stolen).length };
      openTab('story'); const story = $('#t-story').textContent;
      openTab('party'); renderParty(); loadTeam(0); const reload = S.party.slice();
      const page = document.body.innerText;
      // Keeping Eternatus: nothing is stolen.
      storyJump(pts.findIndex(p => p.id === 'ch-y2-crown') + 1); skip(); overlay('#scene', false); year3Reset(890);
      const keptEternatus = [S.story.eternatusStolen, !!S.box[890].stolen, isFrozen(890)];
      useSlot(KEY);
      done({ classic, before, row, goOff, interlude, pickOpen, kept, after, letter, snakes, notIn, refused, notPlaced, loaded, tile: tile && [tile.className, tile.textContent], slots, evo, catchText, league, gyms, rows, next0, lines, freed, lib, next1, msg, thaw, story, reload,
        bondLeak: /fought beside you|bonded|remember you\./.test(page), keptEternatus,
        back: { gym: gymTeam(0, 1).map(m => m.num), name: gymName(0, 1), place: locName({ kind: 'gym', r: 0, k: 1 }) } });
    }, 3600));
  });
  assert.ok(got.row && !got.goOff, 'Begin Year 3 is open to the test account');
  assert.deepEqual([got.interlude, got.pickOpen, got.kept], ['y3-interlude', true, 'y3-kept']);
  const a = got.after;
  assert.deepEqual([a.year, a.cleared[2], a.kept, a.party], [3, 1, 150, [150]]);
  assert.deepEqual([a.box, a.ids], [got.before.box, got.before.ids], 'the freeze deletes nothing');
  assert.ok(a.allFrozen && a.keptFree && a.regions, 'everything but the kept one is frozen in its from region; the kept one keeps its level');
  assert.deepEqual(a.stolen, [1, 1], 'Eternatus, not kept, is stolen');
  assert.deepEqual([a.money, a.balls, a.items, a.badges, a.champs], [0, { poke: 10, great: 0, ultra: 0, master: 0 }, {}, 0, 0], 'money, balls, items, badges and Champions reset');
  assert.ok(a.cap <= 20, `the cap starts over at Kanto (${a.cap})`);
  assert.deepEqual([a.key, a.stone, a.won, a.teams, a.ach], [1, 1, 1, 1, true], 'key items, stones, form unlocks, saved teams and achievements stay');
  assert.deepEqual(a.mail, [true, true]);
  assert.equal(a.recovered, 1, 'only the kept one is recovered');
  assert.equal(Object.values(a.held).reduce((x, y) => x + y, 0), got.before.box - 1, 'the frozen-Box record');
  assert.match(got.letter, /Some of them will come back to you sooner than others\. You'll see\.<\/p><p>Prof Penguin<\/p>$/);
  assert.match(got.snakes, /THEY FROZE MINE TOO\. I'M FINE\. I'M FINE\. I'LL FIND YOU\./);
  assert.ok(got.notIn && got.notPlaced, 'a frozen Pokémon can\'t join the party');
  assert.match(got.refused, /frozen in Kanto\. It comes back when Kanto is freed\./);
  assert.deepEqual(got.loaded.party, [150], 'a team with no one thawed yet loads nothing');
  assert.match(got.loaded.toast, /Old is still under the ice\./);
  assert.match(got.tile[0], /frozen/); assert.match(got.tile[1], /❄ Frozen in Kanto/);
  assert.equal(got.evo, false, 'frozen Pokémon can\'t evolve');
  assert.match(got.catchText, /under the ice in Kanto: no throw/);
  assert.deepEqual([got.league.breaks, got.league.rule, got.league.max], ['', true, null], 'no League rule in Year 3');
  assert.deepEqual(got.gyms.names, ['Team Thaw grunt', 'Team Thaw grunt', 'Team Thaw grunt', 'Thaw captain']);
  assert.ok(got.gyms.ice && got.gyms.typed, 'each gym keeps its type, with an ice twist');
  assert.ok(!got.rows.some(r => r.startsWith('Champion')), 'no Champion row in Year 3');
  assert.ok(got.rows.some(r => r === 'Liberate Kantogyms 0/4 freed'), got.rows.join(' | '));
  assert.equal(got.next0, 'Next: Free Kanto\'s gyms, then Liberate Kanto at the Cerulean lab. (Gyms: 0/4 freed)');
  assert.match(got.lines[3], /Thaw captain: "Gym's under new management\. Badge costs three Thaw Packs\."/);
  assert.ok(!got.freed.names.some(n => /Thaw/.test(n)) && got.freed.record === 4, 'the real leaders are freed');
  assert.match(got.freed.toast, /was locked in the back room/);
  assert.equal(got.lib.note, 'story');
  assert.equal(got.next1, 'Next: Liberate Kanto at the Cerulean lab, in Kanto.');
  assert.match(got.msg, /The ice lets go\..*The ones who fought beside you come back just as strong\. ❤ .*Charizard.*The others come back weaker, but they remember you\. ❄ .*Blastoise/);
  const T = got.thaw;
  assert.deepEqual(T.charizard, [80, false], 'bonded: back at its real level');
  assert.deepEqual(T.blastoise, [30, got.before.peak9, true], 'unbonded: half (rounded down), peak unchanged, it remembers you');
  assert.equal(T.venusaur, 5, 'never below Lv 5');
  assert.equal(T.tyranitar, true, 'Johto\'s stay frozen');
  assert.equal(T.kanto, 0, 'everything from Kanto is back');
  assert.ok(T.champ && T.cap === T.capNext, 'the liberation counts as the Champion for the cap');
  assert.ok(T.told && /^<p>I told you\. They remember who stood with them\.<\/p>/.test(T.toldBody), 'the first thaw\'s letter');
  assert.equal(T.lib, 1);
  assert.match(got.story, /Frozen Box/); assert.match(got.story, new RegExp(`Species recovered: ${T.recovered} / 270`)); assert.match(got.story, /✓ Kanto/); assert.match(got.story, /❄ Johto · \d+/);
  assert.ok(got.reload.includes(6) && !got.reload.includes(248), 'the team fills in its thawed member');
  assert.equal(got.bondLeak, false, 'the bond shows nowhere but the thaw message');
  assert.deepEqual(got.keptEternatus, [0, false, false], 'keeping Eternatus: nothing stolen');
  assert.deepEqual(got.back, got.classic, 'Classic keeps its gyms');
  assert.deepEqual(errors, []);
});

test('Year 3, the nine liberations (test save): admins and Thaw-bound projections, the ally bonus, Slush stops Hoenn halfway, Cave of Origin, the dealer named at last, and both Galar paths', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-27');
  const got = await tab.evaluate(() => {
    const skip = () => { const ids = []; let n = 0; while (sceneNow && n++ < 60) { ids.push(sceneNow.id); endScene(); } return ids; };
    const win = () => { const here = B; let kos = 0; for (let n = 0; n < 20 && B === here && B.foe; n++) { B.foe.hp = 1; hit(1e12); kos++; if (B === here && !B.manual) next(); } return kos; };
    useSlot(TEST_STORY_KEY, testStoryAccount());
    const pts = jumpPoints();
    storyJump(pts.findIndex(p => p.id === 'ch-y2-crown') + 1, { 1: '249', 2: '383', 3: '483', 4: '643', 5: '716', 6: '791', 7: '888', 8: '1007' }); skip(); overlay('#scene', false);
    Object.entries(S.box).forEach(([n, b], i) => { b.from = i % 9; });
    // The test account has every Pokémon seen; a real save never marks the dealer (the Year 2 test checks that).
    delete S.seen[487];
    const dealerSeenBefore = !!S.seen[487], namedBefore = Object.entries(SCENES).filter(([id, sc]) => sc.year < 3).some(([id, sc]) => sc.lines.some(l => /Giratina/.test(l[1])));
    year3Reset(150); S.debug.league = 0;
    const log = [];
    const free = r => { for (let k = 0; k < 4; k++) { S.badges[r + '-' + k] = 1; S.story.freed[r + '-' + k] = 1; } };
    for (let r = 0; r < 9; r++) {
      free(r); const c = CHAPTER[`y3-${['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'][r]}-free`];
      const open = chapterOpen(c);
      startLoc({ kind: 'chapter', r, x: c.id }); const pre = skip();
      const fight = { queue: B.queue.map(f => f.name), bound: B.queue.filter(f => f.bound3).map(f => f.num), ally: B.ally, tune: B.tune, say: $('#log').textContent, stopAt: B.stopAt || 0 };
      if (r === 0) delete S.seen[150];
      fight.kos = win(); const seen150 = !!S.seen[150]; fight.stopped = !!(B && B.stopped);
      fight.msg = $('#scene').textContent; $('#scene [data-thaw]') && $('#scene [data-thaw]').click();
      const post = skip();
      log.push({ r, open, pre, fight, post, seen150, champ: !!S.champs[r], lib: !!S.story.liberated[r], frozenLeft: Object.values(S.box).filter(b => b.frozen === r).length, letters: Object.keys(S.mail.got).filter(id => id.startsWith('story-y3')) });
      if (r === 2) {
        const cave = CHAPTER['y3-cave'], caveOpen = chapterOpen(cave);
        startLoc({ kind: 'chapter', r: 2, x: 'y3-cave' }); const cavePre = skip(); const caveQ = B.queue.map(f => f.name), caveSay = $('#log').textContent; win(); const cavePost = skip();
        log[r].cave = { caveOpen, cavePre, caveQ, caveSay, cavePost, won: !!S.won.cave, clue: !!S.story.clues.memos };
      }
      if (r === 3) {
        const d = CHAPTER['y3-distortion'], before = { seen: !!S.seen[487], open: chapterOpen(d) };
        startLoc({ kind: 'chapter', r: 3, x: 'y3-distortion' }); const ids = skip();
        log[r].distortion = { before, ids, fight: !!(B && B.kind === 'story'), seen: !!S.seen[487], clue: !!S.story.clues.p, debt: S.story.giratinaDebt, text: SCENES['y3-distortion'].lines.map(l => l[1]).join(' ') };
      }
    }
    const end = { next: storyNext().text, frozen: Object.entries(S.box).filter(([n, b]) => b.frozen != null).map(([n]) => +n), slot: emptySlot(890), cap: levelCap(), lib: storyProgress(S).regionsLiberated,
      bodyBond: /fought beside you/.test(document.body.innerText) };
    // Keeping Eternatus: Galar thaws in full.
    storyJump(pts.findIndex(p => p.id === 'ch-y2-crown') + 1); skip(); overlay('#scene', false);
    year3Reset(890); for (let r = 0; r < 7; r++) { free(r); S.story.liberated[r] = 1; S.champs[r] = 1; } free(7);
    startLoc({ kind: 'chapter', r: 7, x: 'y3-galar-free' }); skip(); win(); $('#scene [data-thaw]').click(); const keptPost = skip();
    const kept = { post: keptPost, frozen: Object.values(S.box).filter(b => b.frozen === 7).length, slot: emptySlot(890) };
    useSlot(KEY);
    return { dealerSeenBefore, namedBefore, log, end, kept, slush: ['story-y3-slush-1', 'story-y3-slush-2', 'story-y3-slush-3', 'story-y3-slush-4'].map(id => MAIL.find(m => m.id === id).body), uses: LIB_USE };
  });
  const L = got.log;
  assert.deepEqual([got.dealerSeenBefore, got.namedBefore], [false, false], 'before Year 3 Sinnoh, nothing names or marks the dealer');
  assert.ok(L.every(x => x.open && x.champ && x.lib), 'every liberation opens with its gyms, and counts as the Champion');
  assert.equal(L[0].fight.queue.length, 7, 'Rime\'s six, then the projection');
  assert.equal(L[0].seen150, false, 'a projection never marks the dex');
  assert.equal(L[0].fight.queue.at(-1), 'Thaw-bound Mewtwo', 'Kanto: one projection');
  assert.deepEqual(L[0].pre, ['y3-kanto']);
  assert.deepEqual(L.map(x => x.fight.bound.length), [1, 2, 2, 2, 2, 2, 2, 2, 2], 'pair regions project both legends');
  assert.deepEqual(L[1].fight.bound, [249, 250], 'your first pick leads');
  assert.match(L[1].fight.say, /Hail: "Your Lugia was first, wasn't it\? Let's see if the copy remembers\."/);
  assert.match(L[3].fight.say, /Rime: "Dialga first\. Then the other\. Exactly as I predicted\."/);
  assert.match(L[5].fight.say, /^The stand-in captain: /);
  assert.deepEqual(L.map(x => x.fight.ally), [1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.2], 'Sssssssnakes +10%, and Slush too in Paldea');
  assert.match(L[0].fight.say, /hissing supportively: your team hits 10% harder/);
  assert.match(L[8].fight.say, /Slush stands next to you.*20% harder/);
  assert.ok(L.every(x => x.fight.tune > 0));
  assert.deepEqual(got.uses, [1.05, 1.07, 1.09, 1.11, 1.13, 1.15, 1.17, 1.19, 1.2]);
  // Hoenn: Slush stops it halfway, and it counts.
  assert.deepEqual([L[2].fight.stopAt, L[2].fight.kos, L[2].fight.queue.length], [4, 4, 8]);
  assert.deepEqual(L[2].fight.queue.filter(n => /Thaw-bound/.test(n)).length, 2);
  assert.ok(L[2].fight.queue.slice(0, 4).some(n => /Thaw-bound/.test(n)), 'the projections come out before Slush calls it');
  assert.ok(L[2].post.includes('y3-hoenn-after') && L[2].post.includes('y3-hoenn-banter'));
  const C = L[2].cave;
  assert.ok(C.caveOpen && C.won && C.clue, 'Cave of Origin opens after Hoenn, and the memos clue');
  assert.deepEqual(C.caveQ, ['Primal Groudon', 'Primal Kyogre']);
  assert.deepEqual(C.cavePre, ['y3-cave']);
  // Sinnoh: the Distortion World, no fight, and only now is Giratina named and seen.
  const D = L[3].distortion;
  assert.deepEqual([D.before.seen, D.before.open, D.fight, D.seen, D.clue, D.debt], [false, true, false, true, true, 1]);
  assert.match(D.text, /the dealer is finally in the light\. It's Giratina, in its Origin Forme/);
  assert.ok(L[3].letters.includes('story-y3-slush-1') && L[4].letters.includes('story-y3-keepgoing') && L[6].letters.includes('story-y3-slush-4'), 'Penguin\'s "Keep going." and Slush\'s intel');
  assert.ok(L[5].post.includes('y3-kalos-after') && L[6].post.includes('y3-alola-after'));
  // Galar, with Eternatus stolen: everything but it.
  assert.deepEqual(L[7].post, ['y3-galar-after']);
  assert.ok(L.every((x, r) => x.frozenLeft === (r === 7 ? 1 : 0)), 'each thaw returns everything from its region (but the stolen Eternatus)');
  assert.deepEqual(L[8].post, ['y3-paldea-after', 'y3-maps']);
  assert.deepEqual([got.end.next, got.end.frozen, got.end.slot, got.end.cap, got.end.lib, got.end.bodyBond], ['Next: Cerulean Cave at deep under Cerulean, in Kanto.', [890], true, 100, 9, false]);
  assert.deepEqual(got.kept, { post: ['y3-galar-kept'], frozen: 0, slot: false }, 'keeping Eternatus: Galar thaws in full');
  assert.ok(got.slush.every(b => b.endsWith('<p>— Slush</p>')));
  assert.deepEqual(errors, []);
});

test('Year 3, the endgame (test save): the inner circle, Necrozma before Ultra, Arceus with every Plate, Terminus, the Dig, the Darkest Day both ways, and the night before', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-27');
  const got = await tab.evaluate(() => {
    const skip = () => { const ids = []; let n = 0; while (sceneNow && n++ < 60) { ids.push(sceneNow.id); endScene(); } return ids; };
    const win = () => { const here = B; for (let n = 0; n < 20 && B === here && B.foe; n++) { B.foe.hp = 1; hit(1e12); if (B === here && !B.manual) next(); } };
    const play = id => { const c = CHAPTER[id]; const open = chapterOpen(c); startLoc({ kind: 'chapter', r: c.r, x: id }); const pre = skip(); const q = B && B.kind === 'story' ? B.queue.map(f => f.name) : null, L = B && B.L; if (q) win(); const post = skip(); return { open, pre, q, L, post, done: chDone(id) }; };
    useSlot(TEST_STORY_KEY, testStoryAccount());
    const pts = jumpPoints(), to = id => pts.findIndex(p => p.id === id);
    const begin = stolen => {
      storyJump(to('ch-y2-crown') + 1); skip(); overlay('#scene', false);
      for (const n of [800, 493, 1024, 718]) delete S.box[n];
      for (const k of ['megalo', 'necrozma', 'origin', 'cerulean', 'sky', 'terminus', 'underdepths']) delete S.won[k]; S.eternamax = 0; S.plates = 0; for (const id of [...MEWTWONITES, MEGA_RAYQUAZA, 10301]) delete S.stones[id];
      year3Reset(stolen ? 150 : 890); S.debug.league = 0; S.balls.master = 50; S.set.manual = 0;
      for (let r = 0; r < 9; r++) { for (let k = 0; k < 4; k++) S.badges[r + '-' + k] = 1; const c = CHAPTER[CHAPTERS.find(x => x.type === 'liberate' && x.r === r).id]; S.story.ch[c.id] = 1; thawRegion(r); }
      for (const id of ['y3-cave', 'y3-distortion']) S.story.ch[id] = 1;
    };
    begin(true);
    const next0 = storyNext().text, originShut = chapterOpen(CHAPTER['y3-origin']);
    const cer = play('y3-cerulean'), sky = play('y3-sky');
    const originStill = chapterOpen(CHAPTER['y3-origin']);
    const meg = play('y3-megalo');
    const nec = S.box[800] && { lv: realLevel(800), cap: levelCap(), from: S.box[800].from, frozen: isFrozen(800) };
    S.box[800].forme = 'dusk'; const dusk = !!qforme(800); S.box[800].forme = 'ultra'; const ultraBefore = !!qforme(800); S.box[800].forme = '';
    const ult = play('y3-ultra'); S.box[800].forme = 'ultra'; const ultraAfter = !!qforme(800); S.box[800].forme = '';
    const ori = play('y3-origin');
    const arceus = S.box[493] && { lv: realLevel(493), plates: S.plates, won: !!S.won.origin }; S.box[493].forme = 't:Fire'; const fire = qforme(493) && qforme(493).types[0]; S.box[493].forme = '';
    const termRow = chapterRows(5).find(x => x.x === 'y3-terminus').note;
    S.box[718] = { xp: 125, shiny: false, forme: '10', from: 5 }; S.cells = 40; const termCells = chapterRows(5).find(x => x.x === 'y3-terminus').note;
    S.cells = 100; const term = play('y3-terminus');
    const dig = play('y3-dig'); const tera = S.box[1024] && { lv: realLevel(1024), from: S.box[1024].from, stellar: !!S.won.underdepths };
    const etBefore = { stolen: !!S.box[890].stolen, slot: emptySlot(890) };
    const dark = play('y3-darkest'); const et = { frozen: isFrozen(890), stolen: !!S.box[890].stolen, bond: S.box[890].bond, slot: emptySlot(890), eternamax: S.eternamax };
    const night = play('y3-night');
    const letter = MAIL.find(m => m.id === 'story-y3-seven').body, clues = ['notes', 'photo'].map(k => !!S.story.clues[k]);
    const nextEnd = storyNext().text, stonesWon = [...MEWTWONITES, MEGA_RAYQUAZA, 10301].map(id => !!S.stones[id]);
    // Keeping Eternatus: the Darkest Day is a Thaw-bound copy, and nothing comes back.
    begin(false);
    for (const id of ['y3-cerulean', 'y3-sky', 'y3-megalo', 'y3-origin', 'y3-dig']) S.story.ch[id] = 1;
    const box = Object.keys(S.box).length, copy = play('y3-darkest');
    const keptPath = { q: copy.q, post: copy.post, box: Object.keys(S.box).length === box };
    // Classic: Megalo's one flag still opens all three forms, and Story's fusion flag means nothing there.
    useSlot(KEY); S = fresh(); S.box[800] = { xp: 125, forme: 'dusk' }; S.won = { necrozma: 1 }; const classicDusk = !!qforme(800);
    const stones = [...MEWTWONITES, MEGA_RAYQUAZA, 10301].map(id => !!S.stones[id]);
    return { stones, stonesWon, next0, originShut, originStill, cer, sky, meg, nec, dusk, ultraBefore, ult, ultraAfter, ori, arceus, fire, termRow, termCells, term, dig, tera, etBefore, dark, et, night, letter, clues, nextEnd, keptPath, classicDusk };
  });
  assert.equal(got.next0, 'Next: Cerulean Cave at deep under Cerulean, in Kanto.');
  assert.deepEqual([got.originShut, got.originStill], [false, false], 'the Hall of Origin waits for all three of the inner circle');
  assert.ok(got.cer.open && got.cer.done && got.sky.done && got.meg.done);
  assert.deepEqual(got.cer.q, ['Mega Mewtwo X', 'Mega Mewtwo Y']);
  assert.equal(got.sky.q.length, 4, 'Deoxys in four Formes');
  assert.deepEqual(got.meg.q, ['Necrozma']);
  assert.deepEqual(got.nec, { lv: got.nec.cap, cap: got.nec.cap, from: 6, frozen: false }, 'Necrozma joins at the cap, from Alola, never frozen');
  assert.deepEqual([got.dusk, got.ultraBefore, got.ultraAfter], [true, false, true], 'the fusions first, Ultra Necrozma after the summit');
  assert.ok(got.ult.open);
  assert.deepEqual(got.ori.q, ['Arceus'], 'a short trial');
  assert.equal(got.ori.pre[0], 'y3-origin');
  assert.deepEqual(got.arceus, { lv: got.nec.cap, plates: 17, won: true }, 'Arceus at the cap, with all 17 Plates');
  assert.equal(got.fire, 'Fire');
  assert.equal(got.termRow, 'needs a Zygarde (the Kalos dungeon)');
  assert.equal(got.termCells, 'Zygarde Cells 40/100');
  assert.ok(got.term.open && got.term.done);
  assert.ok(got.dig.done && got.tera && got.tera.stellar && got.tera.from === 8, 'Terapagos caught, from Paldea');
  assert.deepEqual(got.dig.post, ['y3-dig-after']);
  assert.deepEqual(got.etBefore, { stolen: true, slot: true });
  assert.deepEqual(got.dark.q, ['Eternamax Eternatus']);
  assert.deepEqual(got.et, { frozen: false, stolen: false, bond: 1, slot: false, eternamax: 1 }, 'Eternatus comes back, bonded, and the slot is filled');
  assert.deepEqual(got.dark.post, ['y3-darkest-after']);
  assert.ok(got.night.done);
  assert.match(got.letter, /<p>— Sssssssnakes<\/p>$/);
  assert.equal('Sssssssnakes'.match(/^S(s*)nakes$/)[1].length + 1, 7, 'exactly seven s\'s');
  assert.deepEqual(got.clues, [true, true], 'the founder\'s notes and the photo');
  assert.deepEqual(got.keptPath, { q: ['Thaw-bound Eternamax Eternatus'], post: ['y3-darkest-copy'], box: true });
  assert.deepEqual(got.stonesWon, [true, true, true, true], 'both Mewtwonites, Mega Rayquaza and the Zygardite');
  assert.deepEqual(got.stones, [false, false, false, false], 'the second run (kept Eternatus) starts clean');
  assert.equal(got.classicDusk, false, 'Classic ignores Story\'s fusion flag');
  assert.deepEqual(errors, []);
});

// A Year 3 save at the night before Team Thaw HQ (test account), every region thawed.
const y3Ready = () => {
  useSlot(TEST_STORY_KEY, testStoryAccount());
  const pts = jumpPoints(); storyJump(pts.findIndex(p => p.id === 'ch-y3-night') + 1); while (sceneNow) endScene(); overlay('#scene', false);
  S.debug.league = 0; S.story.roulette = {};
  // A real Story save never has Giratina before the credits (the test account has every Pokémon).
  delete S.box[487];
};

test('Year 3 finales, measured: a team built on Sleet or on Prof Penguin (one run, both phases) wins with a little room, a generic one loses, and the Hall of Fame stays the hardest', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-27');
  const got = await tab.evaluate(`(${y3Ready})(), (() => {
    enter('battle');
    const measure = (id, phases) => {
      runChapter(CHAPTER[id]); while (sceneNow) endScene();
      const cap = areaCap(), typed = (m, f) => refHit(m, cap, f) * bestEff(m, f), pool = [...refPool(...refArea(B.r, 3), cap, 0), ETERNAMAX_FOE];
      const foes = phases ? phases.flatMap(q => q()) : B.queue, T = phases ? phases.reduce((t, q) => t + fightTime(B.base, q(), regionOffense(B.r), .8, 1.2), 0) : B.bossTime;
      const counter = refPick(pool, foes.map(f => ({ f, hp: 1 })), typed), any = refPick(pool, foes.map(f => ({ f, hp: 1 })), (m, f) => refHit(m, cap, f));
      const need = team => foes.reduce((s, f) => s + bossHpFor(f, B.L, B.i) * B.tune * clockRate(f) / (team.reduce((d, m) => d + typed(m, f), 0) * bossBoost()), 0) / (T * refDef(team));
      const r = { L: B.L, cap, counter: need(counter), any: need(any), team: counter.map(m => m.name) }; B = null; return r;
    };
    const sleet = measure('y3-sleet'); S.story.ch['y3-sleet'] = 1;
    const penguin = measure('y3-penguin', PENGUIN_PHASES); S.story.ch['y3-penguin'] = 1;
    const hof = measure('y3-hof');
    return { sleet, penguin, hof, uses: [SLEET_USE, PENGUIN_USE, HOF_USE] };
  })()`);
  for (const [k, v] of Object.entries({ sleet: got.sleet, penguin: got.penguin, hof: got.hof })) console.log(`# ${k}: built ${v.counter.toFixed(3)}, generic ${v.any.toFixed(3)}, L ${v.L}, team ${v.team.join(', ')}`);
  assert.ok(got.sleet.L === 100 && got.penguin.L === 100, 'both at the level cap');
  assert.ok(got.sleet.counter >= 0.9 && got.sleet.counter <= 0.95, `Sleet: a built team needs 90–95% (${got.sleet.counter.toFixed(3)})`);
  assert.ok(got.penguin.counter >= 0.9 && got.penguin.counter <= 0.95, `Prof Penguin: a built team needs 90–95% over both phases (${got.penguin.counter.toFixed(3)})`);
  assert.ok(got.sleet.any > 1 && got.penguin.any > 1, `a generic strong team loses (${got.sleet.any.toFixed(3)}, ${got.penguin.any.toFixed(3)})`);
  assert.ok(got.penguin.counter > got.sleet.counter, 'the finale is harder than Sleet');
  assert.ok(got.hof.counter > got.penguin.counter && got.hof.counter < 1, `the Hall of Fame is still the hardest fight (${got.hof.counter.toFixed(3)})`);
  assert.deepEqual(errors, []);
});

test('Year 3, Sleet and Prof Penguin (test save): the 270 gate, the Silvally branch, the Roulette flag, one run over both phases, the credits, and after them', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-27');
  const got = await tab.evaluate(`(${y3Ready})(), (() => {
    const skip = () => { const ids = []; let n = 0; while (sceneNow && n++ < 60) { ids.push(sceneNow.id); endScene(); } return ids; };
    const win = () => { const here = B; for (let n = 0; n < 20 && B === here && B.foe; n++) { B.foe.hp = 1; hit(1e12); if (B === here && !B.manual) next(); } };
    enter('battle');
    // The 270 gate, shown on the rows from the start.
    const keep = Object.keys(S.box).slice(200); for (const n of keep) S.box[n].frozen = 4;
    const gate = { open: chapterOpen(CHAPTER['y3-sleet']), note: chapterRows(8).find(x => x.x === 'y3-sleet').note, pnote: chapterRows(0).find(x => x.x === 'y3-penguin').note, map: yearMap().find(x => x.id === 'y3-penguin').name };
    for (const n of keep) delete S.box[n].frozen;
    gate.after = chapterOpen(CHAPTER['y3-sleet']);
    // Sleet with Silvally in the party: the masked Type: Null walks out.
    S.party = [773, 150, 6]; runChapter(CHAPTER['y3-sleet']); skip();
    const sleetQ = B.queue.map(f => f.name);
    for (let i = 0; i < 4; i++) { B.foe.hp = 1; hit(1e12); next(); }
    const mask = { broke: !!B.maskBroke, left: B.queue.map(f => f.name) };
    win(); const sleetPost = skip();
    const sleet = { maskBroke: S.story.maskBroke, post: sleetPost, done: chDone('y3-sleet') };
    // Without Silvally, the Type: Null fights.
    resetChapter('y3-sleet'); S.party = [150, 6]; runChapter(CHAPTER['y3-sleet']); skip(); for (let i = 0; i < 4; i++) { B.foe.hp = 1; hit(1e12); next(); }
    const noMask = { next: B.queue[B.idx] && B.queue[B.idx].name, broke: !!B.maskBroke }; win(); const noMaskPost = skip();
    // Prof Penguin, no Roulette flag: Giratina at full HP. Run out of time in phase 2 and it starts over from Giratina.
    runChapter(CHAPTER['y3-penguin']); const pre = skip();
    const p1 = { foe: B.foe.m.name, full: B.foe.hp === B.foe.max, say: $('#log').textContent, phase: B.phase };
    B.foe.hp = 1; hit(1e12); next(); const left = B.left; B.brk = 0; storyGo();
    const p2 = { phase: B.phase, q: B.queue.map(f => f.name), carried: B.time >= Math.round(B.left || 0) && B.left > 0, say: $('#log').textContent };
    B.time = 0; lastTick = performance.now() - 50; tick(); const lost = { kind: B && B.kind, done: chDone('y3-penguin') };
    // With the flag (a Hard win at Shotgun Roulette): Giratina holds back.
    S.story.roulette = { dealer: 1 }; runChapter(CHAPTER['y3-penguin']); skip();
    const held = { start: B.phase, hp: B.foe.hp / B.foe.max, say: $('#log').textContent };
    // Win both phases: the confession was first, then "Wake it up.", the ending, the credits, and after them.
    win(); B.brk = 0; storyGo(); win(); const ends = skip();
    const credits = { open: !$('#credits').hidden, text: $('#credits').textContent };
    $('#credits [data-credits]').click(); const after = skip();
    const sp = S.box[395], gir = S.box[487];
    const res = { pre, p1, p2, lost, held, ends, credits, after, empoleon: sp && { special: sp.special, lv: realLevel(395) }, giratina: gir && { bond: gir.bond, lv: realLevel(487), from: gir.from, origin: !!S.won.distortion },
      story: { debt: S.story.giratinaDebt, title: S.story.title, cleared: S.story.cleared[3], hat: S.story.hatOwned, hofLate: S.story.hofLate }, letter: S.mail.got['story-y3-last'] && MAIL.find(m => m.id === 'story-y3-last').body,
      progress: storyProgress(S), shared: localStorage.getItem(ROULETTE_KEY) };
    // The golden top hat, on any party member.
    openTab('party'); detail = 150; renderParty(); document.querySelector('#t-party [data-hat="150"]').click();
    res.hat = { on: S.story.hat, tile: !!document.querySelector('#party [data-n="150"] .gtop') };
    // The Hall of Fame is held back (HOF_READY): no row, no letter yet.
    res.hof = { listed: chapterRows(3).some(x => x.x === 'y3-hof'), late: !!S.mail.got['story-y3-hof-late'], next: storyNext().text };
    // A real Story save writes "paid" to the shared key; the test save didn't.
    const real = JSON.parse(JSON.stringify(S)); delete real.test; delete real.debug; delete real.story.title; delete real.story.credits; localStorage.setItem(STORY_KEY, JSON.stringify(real)); useSlot(STORY_KEY);
    afterCredits(); skip(); res.realShared = JSON.parse(localStorage.getItem(ROULETTE_KEY) || '{}');
    useSlot(KEY);
    return Object.assign(res, { gate, sleetQ, mask, sleet, noMask, noMaskPost });
  })()`);
  assert.deepEqual([got.gate.open, got.gate.after], [false, true], 'Team Thaw HQ waits for 270 species recovered');
  assert.match(got.gate.note, /^Species recovered: 200 \/ 270$/); assert.match(got.gate.pnote, /Species recovered: \d+ \/ 270/);
  assert.equal(got.gate.map, 'Prof Penguin', 'the finale shows on the Year map from the start');
  assert.deepEqual(got.sleetQ, ['Baxcalibur', 'Cetitan', 'Glaceon', 'Arctozolt', "Type: Null (the Director's unit)", 'Thaw-bound Kyurem']);
  assert.deepEqual(got.mask, { broke: true, left: ['Baxcalibur', 'Cetitan', 'Glaceon', 'Arctozolt', 'Thaw-bound Kyurem'] }, 'with Silvally in the party, the Type: Null leaves the fight');
  assert.deepEqual([got.sleet.maskBroke, got.sleet.post, got.sleet.done], [1, ['y3-mask', 'y3-sleet-after'], true]);
  assert.deepEqual([got.noMask.next, got.noMask.broke, got.noMaskPost], ["Type: Null (the Director's unit)", false, ['y3-sleet-after']]);
  assert.deepEqual(got.pre, ['y3-confession']);
  assert.deepEqual([got.p1.foe, got.p1.full, got.p1.phase], ['Giratina (Origin Forme)', true, 1]);
  assert.ok(!/own table/.test(got.p1.say));
  assert.equal(got.p2.phase, 2); assert.equal(got.p2.q.at(-1), "Prof Penguin's Mega Empoleon"); assert.ok(got.p2.carried, 'phase 1\'s time carries over');
  assert.deepEqual(got.lost, { kind: 'route', done: false }, 'out of time in phase 2: back to the start');
  assert.equal(got.held.start, 1, 'it starts over from Giratina');
  assert.ok(Math.abs(got.held.hp - 0.85) < 0.01, `Giratina holds back at 85% (${got.held.hp})`);
  assert.match(got.held.say, /Prof Penguin: "You beat it at its own table\?"/);
  assert.deepEqual(got.ends, ['y3-wake', 'y3-ending']);
  assert.ok(got.credits.open && ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'].every(n => got.credits.text.includes(`${n} thaws.`)), 'the credits roll over all nine regions');
  assert.deepEqual(got.after, ['y3-after']);
  assert.equal(got.empoleon.special, 'prof-empoleon');
  assert.deepEqual(got.giratina, { bond: 1, lv: 100, from: 3, origin: true }, 'Giratina joins, bonded, at the cap, in both Formes');
  assert.deepEqual(got.story, { debt: 0, title: 'Field Researcher', cleared: 1, hat: 1, hofLate: 1 });
  assert.equal(got.letter, "<p>The notebook's yours now. Write down the small things.</p><p>— P.</p>");
  assert.deepEqual([got.progress.cleared, got.progress.title], [true, 'Field Researcher'], 'the story field says Cleared, with the title');
  assert.equal(got.shared, null, 'the test save never writes the shared key');
  assert.deepEqual(got.hat, { on: 150, tile: true });
  assert.deepEqual(got.hof, { listed: false, late: false, next: got.hof.next });
  assert.equal(got.realShared.paid, 1, 'the real Story save writes "paid" for Shotgun Roulette');
  assert.deepEqual(errors, []);
});

test('Year 3 Hall of Fame, switched on (HOF_READY): the row after Prof Penguin, the late-arrival letter, and the SP Mega Hydrapple', async t => {
  const { tab, errors } = await openIdle(t, '2026-11-27', { hof: true });
  const got = await tab.evaluate(`(${y3Ready})(), (() => {
    const skip = () => { const ids = []; let n = 0; while (sceneNow && n++ < 60) { ids.push(sceneNow.id); endScene(); } return ids; };
    const win = () => { const here = B; for (let n = 0; n < 20 && B === here && B.foe; n++) { B.foe.hp = 1; hit(1e12); if (B === here && !B.manual) next(); } };
    for (const id of ['y3-sleet', 'y3-penguin']) S.story.ch[id] = 1;
    S.story.hofLate = 1; save(); boot();
    const late = MAIL.find(m => m.id === 'story-y3-hof-late').body, gotLate = !!S.mail.got['story-y3-hof-late'];
    enter('battle'); const row = chapterRows(3).find(x => x.x === 'y3-hof');
    runChapter(CHAPTER['y3-hof']); const pre = skip(); const q = B.queue.map(f => f.name), L = B.L; delete S.hof; delete S.box[1019]; win(); const post = skip();
    return { gotLate, late, row: row && row.note, pre, q, L, post, sp: S.box[1019] && S.box[1019].special, letter: !!S.mail.got['story-y3-hof'] };
  })()`);
  assert.ok(got.gotLate);
  assert.equal(got.late, "<p>Took you long enough. I've been standing here for weeks.</p><p>— Sssssssnakes</p>");
  assert.equal(got.row, 'optional');
  assert.deepEqual([got.pre, got.post], [['y3-hof'], ['y3-hof-after']]);
  assert.equal(got.q.at(-1), 'Mega Hydrapple'); assert.equal(got.L, 100);
  assert.ok(got.sp && got.letter, 'the SP Mega Hydrapple, and his last letter');
  assert.deepEqual(errors, []);
});

test('Shotgun Roulette reads and writes the shared Poké Idle flags: the hat note changes to "Paid in full", and a confirmed Hard win is remembered', async t => {
  const { tab } = await openIdle(t, '2026-11-27');
  const src = fs.readFileSync(path.join(root, 'src/games/content/shotgun-roulette.html'), 'utf8');
  const settle = src.slice(src.indexOf('setBalance(reply);'), src.indexOf('loadBoard(game.mode);'));
  assert.match(settle, /if \(won && game\.mode === "hard"\) penguinMark\("beatOrigin"\);/, 'only inside a confirmed (non-test) settle, and only on Hard');
  const origin = new URL(tab.url()).origin;
  const note = async flags => {
    await tab.evaluate(f => localStorage.setItem('bored.poke-idle.roulette.v1', JSON.stringify(f)), flags);
    await tab.goto(origin + '/games/content/shotgun-roulette.html');
    await tab.waitForFunction(() => typeof showPenguinChair === 'function');
    return tab.evaluate(() => { showPenguinChair(); const c = document.getElementById('pchair'); const hidden = c.hidden; c.click(); return { hidden, text: document.getElementById('pnote').textContent, flags: JSON.parse(localStorage.getItem('bored.poke-idle.roulette.v1')) }; });
  };
  const before = await note({ hat: 1 }), paid = await note({ hat: 1, paid: 1, beatOrigin: 1 });
  assert.deepEqual([before.hidden, before.text], [false, 'P. — you still owe me a rematch. — G.']);
  assert.deepEqual([paid.hidden, paid.text], [false, 'Paid in full. — G.'], 'the chair and hat stay, and the note changes');
  assert.deepEqual(paid.flags, { hat: 1, paid: 1, beatOrigin: 1, paidSeen: 1 }, 'reading the paid note is remembered, and the other flags are kept');
  const merged = await tab.evaluate(() => { localStorage.setItem('bored.poke-idle.roulette.v1', '{nope'); penguinMark('beatOrigin'); return localStorage.getItem('bored.poke-idle.roulette.v1'); });
  assert.equal(merged, '{"beatOrigin":1}', 'a broken key is replaced, not thrown on');
});

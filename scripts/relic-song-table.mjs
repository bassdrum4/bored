// CHROME_PATH=/path/to/chrome node scripts/relic-song-table.mjs [--strict]
// Relic Song's songs against the recipe (docs/relic-song-songs.md), one row a song: type, key, BPM,
// bars, length, hook repeats, the level of each difficulty, its clear pay and the most its ranks pay,
// and anything off the recipe. Then each region's variety, the 18 style demos (recipe and moving-line
// readability), the pay rules run through the hub's ledger, and the coin totals: the story on EZ only
// and 100% of everything, for Kanto now and projected for a region built to the recipe's level targets.
// The levels and the music come from the game itself (src/games/content/relic-song.html), in Chrome.
// --strict exits 1 if a song written to the recipe (one with a region), a demo, or a pay rule fails.
// Kanto's songs were written before the recipe: they are listed, never failed.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from '../tests/serve.cjs';
import { payRelicSong, topUpRelicSong } from '../src/hub/relic-song.js';
import { mergeWallet, grantOnce, walletBalance } from '../src/hub/rewards.js';

const root = path.resolve(import.meta.dirname, '..');
const strict = process.argv.includes('--strict');
// The moving line's readability rules live with the game's tests; read them from there.
const READABLE = eval(fs.readFileSync(path.join(root, 'tests/relic-song.test.cjs'), 'utf8').match(/const READABLE = ('(?:[^'\\]|\\.)*');/)[1]);
const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/opt/pw-browsers/chromium'].filter(Boolean).find(p => fs.existsSync(p));
if (!executablePath) { console.error('Set CHROME_PATH.'); process.exit(2); }

const site = await serve(path.join(root, 'src'));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
let failed = 0;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', r => r.url().startsWith(site.origin) || !/^https?:/.test(r.url()) ? r.continue() : r.abort());
  await page.goto(site.origin + '/games/content/relic-song.html');
  await page.waitForFunction(() => window.__relicSong && window.__relicSong.recipeCheck);
  const data = await page.evaluate(src => {
    eval(src);
    const R = window.__relicSong, D = ['ez', 'hd', 'in', 'at'];
    const row = s => ({ ...R.recipeCheck(s), legacy: !s.region || !!s.demo,
      levels: Object.fromEntries(s.diffs.map(d => [d, R.built(s, d).level])),
      pay: Object.fromEntries(s.diffs.map(d => { const lv = R.built(s, d).level; return [d, { clear: R.clearPay(lv), rank: R.rankPay(lv, d, 'a') + R.rankPay(lv, d, 's') }]; })),
      unreadable: s.line ? s.diffs.flatMap(d => readable(R, R.built(s, d))) : [] });
    const songs = R.SONGS.map(row), demos = R.DEMOS().map(row);
    const regions = [...new Set(songs.map(s => s.region))].map(id => R.regionCheck(id, R.SONGS.filter(s => (s.region || 'kanto') === id)));
    const L = R.RECIPE.levels, chart = (role, d) => ({ clear: R.clearPay(L[role][d]), rank: R.rankPay(L[role][d], d, 'a') + R.rankPay(L[role][d], d, 's') });
    return { songs, demos, regions, PAY: R.PAY, levels: L, diffs: D, payTable: R.payTable().table,
      // A region built to the targets: 8 songs, 4 gym bosses, a champion.
      region: { songs: 8, bosses: 4, champions: 1, song: Object.fromEntries(Object.keys(L.song).map(d => [d, chart('song', d)])),
        boss: Object.fromEntries(Object.keys(L.boss).map(d => [d, chart('boss', d)])), champion: Object.fromEntries(Object.keys(L.champion).map(d => [d, chart('champion', d)])),
        final: Object.fromEntries(Object.keys(L.final).map(d => [d, chart('final', d)])) } };
  }, READABLE);
  const PAY = data.PAY;

  // ── Songs ──
  const pad = (v, n) => String(v).padEnd(n), lpad = (v, n) => String(v).padStart(n);
  const clock = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  const perDiff = (o, f) => data.diffs.map(d => d in o ? lpad(f(o[d]), 4) : '   -').join('');
  const table = (title, rows) => {
    console.log('\n' + title);
    console.log(pad('song', 20) + pad('role', 9) + pad('type', 9) + pad('key', 5) + lpad('bpm', 4) + lpad('bars', 5) + lpad('len', 6) + lpad('hook', 5)
      + '  level EZ  HD  IN  AT' + '  clear EZ  HD  IN  AT' + '  rank IN+AT' + '  off the recipe');
    for (const r of rows) {
      const rank = Object.values(r.pay).reduce((t, p) => t + p.rank, 0);
      console.log(pad(r.title.slice(0, 19), 20) + pad(r.role, 9) + pad(r.type || '-', 9) + pad(r.key || '-', 5) + lpad(r.bpm, 4) + lpad(r.bars, 5) + lpad(clock(r.seconds), 6)
        + lpad(r.hookRepeats, 5) + '       ' + perDiff(r.levels, x => x) + '       ' + perDiff(r.pay, p => p.clear) + lpad(rank, 12) + '  '
        + [...r.flags, ...(r.unreadable.length ? [r.unreadable.length + ' unreadable notes (' + r.unreadable[0] + ')'] : [])].join('; '));
      if (!r.legacy || r.id.startsWith('style-')) if (r.flags.length || r.unreadable.length) failed++;
    }
  };
  table('SONGS (Kanto was written before the recipe: listed, not failed)', data.songs);
  console.log('\nREGIONS');
  for (const g of data.regions) console.log(pad(g.id, 10) + g.songs + ' songs, keys ' + g.keys.join(' ') + ', tempos ' + g.tempos.join('-') + (g.flags.length ? '  off: ' + g.flags.join('; ') : '  ok'));
  table('STYLE DEMOS (one per type; held to the recipe, and their auto lines to the readability rules)', data.demos);

  // ── Pay rules, through the hub's ledger ──
  console.log('\nPAY RULES');
  const check = (what, ok) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) failed++; };
  const clearPay = lv => Math.max(PAY.round, Math.round(PAY.perLevel * lv * lv / PAY.round) * PAY.round);
  check('first clear = 2 x level^2 to the nearest 5: Lv2 10, Lv6 70, Lv10 200, Lv15 450', [2, 6, 10, 15].map(clearPay).join() === '10,70,200,450');
  const charts = data.payTable.charts;
  check('rank coins only on IN and AT', Object.entries(charts).every(([k, c]) => /:(in|at)$/.test(k) ? c.a > 0 && c.s > 0 : c.a === 0 && c.s === 0));
  check('first A = 25%, first S = 50% of the clear pay (to the nearest 5)', Object.entries(charts).filter(([k]) => /:(in|at)$/.test(k))
    .every(([, c]) => c.a === Math.round(c.clear * 0.25 / 5) * 5 && c.s === Math.round(c.clear * 0.5 / 5) * 5));
  check('every chart pays by its measured level', data.songs.every(s => Object.entries(s.pay).every(([d, p]) => charts[s.id + ':' + d].clear === p.clear)));
  const t = { table: data.payTable, bosses: { 'onix-rising': 0 }, final: 'relic-song', champions: {} }, coins = w => walletBalance(w).coins || 0;
  const oz = charts['onix-rising:in'];
  let r = payRelicSong(mergeWallet({}), { song: 'onix-rising', diff: 'in', rank: 's', badge: 0, ...t });
  check('a fresh S on Onix Rising IN pays clear + A + S + the badge (' + (oz.clear + oz.a + oz.s + PAY.badge) + ')', r.paid.total === oz.clear + oz.a + oz.s + PAY.badge);
  check('the replay pays nothing', payRelicSong(r.wallet, { song: 'onix-rising', diff: 'in', rank: 's', badge: 0, ...t }).paid.total === 0);
  r = payRelicSong(mergeWallet({}), { song: 'pewter-steps', diff: 'hd', rank: 's', ...t });
  check('no rank coins on HD: an S on Pewter Steps HD pays its clear only (' + charts['pewter-steps:hd'].clear + ')', r.paid.total === charts['pewter-steps:hd'].clear);
  // An old save: paid under the old table (HD clear 100, its ranks, the badge at 250, an IN A).
  let old = mergeWallet({});
  for (const [id, c] of [['rs:clear:onix-rising:hd', 100], ['rs:rank:onix-rising:hd:a', 50], ['rs:badge:0', 250], ['rs:clear:onix-rising:in', 200], ['rs:rank:onix-rising:in:a', 100]]) old = grantOnce(old, id, { coins: c }).wallet;
  const before = coins(old);
  r = payRelicSong(old, { song: 'onix-rising', diff: 'hd', rank: 's', badge: 0, ...t });
  check('an old save keeps its coins, and what it was paid for pays nothing again (HD clear, badge)', r.paid.total === 0 && coins(r.wallet) === before);
  r = payRelicSong(old, { song: 'onix-rising', diff: 'in', rank: 's', badge: 0, ...t });
  check('an old save is paid only what is new: the IN S (' + oz.s + '), not the IN clear or A again', r.paid.total === oz.s && coins(r.wallet) === before + oz.s);
  check('loading the game tops up nothing on an old save', topUpRelicSong(old, t).paid === 0);
  r = payRelicSong(mergeWallet({}), { song: 'relic-song', diff: 'at', rank: 's', finale: true, ...t });
  const fz = charts['relic-song:at'];
  check('the finale\'s first AT S pays clear + A + S + 500 (' + (fz.clear + fz.a + fz.s + PAY.finale) + ')', r.paid.total === fz.clear + fz.a + fz.s + PAY.finale);
  r = payRelicSong(mergeWallet({}), { song: 'champ-test', diff: 'hd', rank: 'a', champion: 'johto', table: { ...data.payTable, charts: { 'champ-test:hd': { clear: 160, a: 0, s: 0 } } }, bosses: {}, final: '' });
  check('a champion\'s first clear pays its bonus (+' + PAY.champion + ') once', r.paid.champion === PAY.champion && payRelicSong(r.wallet, { song: 'champ-test', diff: 'hd', rank: 'a', champion: 'johto', table: { ...data.payTable, charts: { 'champ-test:hd': { clear: 160, a: 0, s: 0 } } } }).paid.total === 0);

  // ── Coin totals ──
  console.log('\nCOINS');
  const story = data.songs.filter(s => !s.id.startsWith('style-') && s.role !== 'hidden');
  const sum = (rows, f) => rows.reduce((n, s) => n + f(s), 0);
  const bosses = story.filter(s => s.role === 'boss').length, champs = story.filter(s => s.role === 'champion').length;
  const kantoStory = sum(story, s => s.pay.ez ? s.pay.ez.clear : 0) + bosses * PAY.badge + champs * PAY.champion + PAY.finale + PAY.lesson;
  const all = sum(data.songs, s => Object.values(s.pay).reduce((n, p) => n + p.clear + p.rank, 0)) + bosses * PAY.badge + champs * PAY.champion + PAY.finale + PAY.lesson;
  console.log('Kanto now     story on EZ only ' + lpad(kantoStory, 6) + '   100% everything ' + lpad(all, 6) + '   (' + data.songs.length + ' songs, the lesson and the finale included; hidden tracks in 100% only)');
  const g = data.region, full = o => Object.values(o).reduce((n, p) => n + p.clear + p.rank, 0);
  const regStory = g.songs * g.song.ez.clear + g.bosses * g.boss.ez.clear + g.champion.ez.clear + g.bosses * PAY.badge + PAY.champion;
  const regAll = g.songs * full(g.song) + g.bosses * full(g.boss) + full(g.champion) + g.bosses * PAY.badge + PAY.champion;
  console.log('Per region    story on EZ only ' + lpad(regStory, 6) + '   100% everything ' + lpad(regAll, 6) + '   (projected: 8 songs, 4 bosses, a champion, at the recipe\'s level targets)');
  console.log('9 regions     story on EZ only ' + lpad(9 * regStory + g.final.ez.clear + PAY.finale + PAY.lesson, 6) + '   100% everything ' + lpad(9 * regAll + full(g.final) + PAY.finale + PAY.lesson, 6) + '   (and the true final Relic Song, the lesson)');
  console.log('Level targets ' + JSON.stringify(data.levels));
  if (errors.length) { console.log('\nPage errors: ' + errors.join(' | ')); failed++; }
} finally {
  await browser.close(); await site.close();
}
console.log(failed ? '\n' + failed + ' problem(s).' : '\nAll recipe songs, demos and pay rules pass.');
if (strict && failed) process.exit(1);

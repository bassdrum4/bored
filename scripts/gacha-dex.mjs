// Build src/hub/gacha-dex.js from Poké Idle's species table, so Poké Gacha
// shares one source of names, types, stats and evolutions with it.
//
//   node scripts/gacha-dex.mjs          write the file
//   node scripts/gacha-dex.mjs --check  fail if the committed file is stale
//
// Star tiers (Poké Gacha spec): the pool is base forms only, and only the lines in ROSTER.
//   6★ legendaries, mythicals and pseudo-legendary bases (the Legendary egg tier)
//   5★ starters, fossils and a few strong base forms
//   4★ / 3★ the rest, split by the best final-stage BST of the line (FOUR_STAR_BST)
// A line left out of ROSTER is "cut": star 0, so it never hatches and leaves the
// Poké Gacha dex. DEX_LEGACY keeps the star each cut line had before the cut
// (the old rule: every base form, 4★ from BST 500), which the one-time refund
// for owned cut lines is priced by (gacha.js, claimCutRefund). Poké Idle reads its
// own table and keeps every species.
// Mythicals hatch from Legendary eggs, at the same rates and pity as legendaries
// (MYTHICALS below; the banner rotation stays legendaries only).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/games/content/poke-idle.html'), 'utf8');
const OUT = path.join(root, 'src/hub/gacha-dex.js');

const MYTHICALS = true;
const STRONG_BASES = [133, 447]; // Eevee, Riolu
const FOUR_STAR_BST = 505;
const LEGACY_FOUR_STAR_BST = 500;
// The egg roster, by base form (docs/poke-gacha-roster.md has the reasoning).
// Every starter, every line with an SP skin and every pseudo-legendary is in;
// --check fails if one is missing.
const ROSTER = new Set([
  // 6★: pseudo-legendaries, 30 legendaries, 7 mythicals
  147, 246, 371, 374, 443, 633, 704, 782, 885, 996,
  144, 145, 146, 150, 243, 244, 245, 249, 250, 377, 378, 379, 380, 381, 382, 383, 384, 483, 484, 487,
  643, 644, 646, 716, 717, 785, 888, 889, 1007, 1008,
  151, 251, 385, 386, 491, 493, 494,
  // 5★: the 27 starters, Eevee, Riolu and nine fossils
  1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912,
  133, 447, 138, 140, 142, 345, 347, 408, 410, 696, 698,
  // 4★ and 3★ (split by FOUR_STAR_BST). Buizel, Bruxish, Falinks, Iron Hands and Iron Treads
  // were added after the review: the type-matched squads need them on 4-2, 4-3, 5-1, 6-3 and 6-5.
  10, 16, 19, 23, 27, 29, 32, 37, 41, 43, 48, 50, 52, 54, 58, 60, 63, 66, 74, 77,
  79, 81, 86, 88, 90, 92, 95, 100, 104, 109, 111, 115, 120, 123, 129, 131, 132, 170, 172, 173,
  174, 175, 179, 194, 198, 200, 207, 211, 213, 214, 215, 220, 227, 228, 236, 241, 270, 280, 287, 298,
  302, 303, 304, 318, 324, 328, 333, 349, 359, 361, 396, 399, 403, 406, 418, 440, 446, 479, 529, 531,
  532, 550, 570, 577, 592, 594, 595, 597, 607, 610, 624, 636, 661, 674, 679, 701, 714, 744, 747, 749,
  764, 774, 778, 779, 798, 805, 821, 831, 837, 840, 856, 865, 870, 872, 921, 932, 935, 938, 957, 984,
  990, 992, 999
]);

const D = JSON.parse(source.match(/^const D = (\{.*\});?$/m)[1]);
const EXT = JSON.parse(source.match(/^const EXT = (".*?")\.split/m)[1]).split(';').map(r => r.split(',').map(Number));
if (D.mons.length !== 1025 || EXT.length !== 1025) throw new Error('Unexpected Poké Idle species table size.');

const mons = D.mons.map(([name, types, atk, spa, hp, , flags, evos, bst], i) => ({
  num: i + 1, name, types, hp, atk, def: EXT[i][0], spa, spd: EXT[i][1], spe: EXT[i][2],
  flags: new Set((flags || '').split(/[ ,]/).filter(Boolean)), evos: evos.map(e => e[0]), bst
}));
const from = {};
for (const m of mons) for (const to of m.evos) from[to] ||= m.num;
const finals = num => {
  const m = mons[num - 1];
  return m.evos.length ? m.evos.flatMap(finals) : [m];
};
const lineBst = m => Math.max(...finals(m.num).map(x => x.bst));

function legacyStar(m) {
  if (from[m.num]) return 0;
  if (m.flags.has('my') && !MYTHICALS) return 0;
  if (m.flags.has('lg') || m.flags.has('pseudo') || m.flags.has('my')) return 6;
  if (m.flags.has('starter') || m.flags.has('fossil') || STRONG_BASES.includes(m.num)) return 5;
  return lineBst(m) >= LEGACY_FOUR_STAR_BST ? 4 : 3;
}
function star(m) {
  const old = legacyStar(m);
  if (!old || !ROSTER.has(m.num)) return 0;
  return old >= 5 ? old : lineBst(m) >= FOUR_STAR_BST ? 4 : 3;
}
for (const num of ROSTER) if (!mons[num - 1] || from[num] || !legacyStar(mons[num - 1])) throw new Error('ROSTER holds ' + num + ', which is not an egg base form.');
const skins = JSON.parse(fs.readFileSync(path.join(root, 'src/games/content/poke-gacha/sp/skins.json'), 'utf8'));
const baseOf = num => { let at = num; while (from[at]) at = from[at]; return at; };
for (const m of mons) if (!from[m.num] && (m.flags.has('starter') || m.flags.has('pseudo')) && !ROSTER.has(m.num)) throw new Error(m.name + ' must stay in ROSTER.');
for (const skin of skins) if (!ROSTER.has(baseOf(skin.species))) throw new Error('The SP skin ' + skin.id + ' needs its line in ROSTER.');
const legacy = mons.filter(m => legacyStar(m) && !ROSTER.has(m.num)).map(m => [m.num, legacyStar(m)]);

const rows = mons.map(m => [m.name, m.types, m.hp, m.atk, m.def, m.spa, m.spd, m.spe, from[m.num] || 0, star(m),
  m.flags.has('lg') ? 'lg' : m.flags.has('my') ? 'my' : m.flags.has('pseudo') ? 'pseudo' : '']);

const text = `// Generated by scripts/gacha-dex.mjs from Poké Idle's species table. Do not edit by hand.
// One row per species, index = national number - 1:
// [name, types, hp, atk, def, spa, spd, spe, evolves from (0 = base form), star tier (0 = not in the egg pool), class]
export const DEX_TYPES = ${JSON.stringify(D.types)};
// Attack type (row) against defending type (column), in DEX_TYPES order: 0 none, h half, 1 normal, 2 double.
export const DEX_CHART = ${JSON.stringify(D.chart)};
export const DEX = [
${rows.map(row => JSON.stringify(row)).join(',\n')}
];
// Lines cut from the egg roster: [base form, the star it had]. Owned ones are refunded once.
export const DEX_LEGACY = ${JSON.stringify(legacy)};
`;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== text) {
    console.error('src/hub/gacha-dex.js is stale: run node scripts/gacha-dex.mjs');
    process.exit(1);
  }
  console.log('gacha-dex.js is up to date');
} else {
  fs.writeFileSync(OUT, text);
  const count = n => rows.filter(row => row[9] === n).length;
  console.log(`wrote ${path.relative(root, OUT)}: 6★ ${count(6)}, 5★ ${count(5)}, 4★ ${count(4)}, 3★ ${count(3)}, cut ${legacy.length}`);
}

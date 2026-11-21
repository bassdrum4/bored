// Patch the recovered IL2CPP Gamemanager.Start function (asm.js symbol lXk).
// Its original branch occasionally clears every randomized rule, creating a
// plain round. Preserve its modifier generation, but never ship an all-zero
// outcome. This is intentionally scoped to one compiled game method.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('./source/rooftop-snipers.code.js', import.meta.url));
const src = readFileSync(file, 'utf8');
const fn = src.indexOf('  function lXk(b, e) {');
const next = src.indexOf('  function mXk(b, e) {', fn);
if (fn < 0 || next < 0) throw Error('Gamemanager.Start method missing');
const begin = src.indexOf('if ((o3i(0, 1, 4, 0) | 0) != 3)', fn);
const end = src.indexOf('e = c [381728] | 0; q = e + 177', begin);
if (begin < fn || begin >= next || end < begin || end >= next)
  throw Error('Expected normal-round selection branch missing');
const old = src.slice(begin,end);
if (!old.includes('isg(o, e, 0, c [383419] | 0)'))
  throw Error('Refusing to patch unexpected compiled code');
const replacement = `// Always use a randomized round: original code sometimes zeroed the
    // entire randomizer array. Check for a nonzero rolled modifier.
    e = 0; h = 0;
    while (1) {
      if ((e | 0) >= (DVi(o, c [383386] | 0) | 0)) break;
      if ((hsg(o, e, c [383420] | 0) | 0) != 0) { h = 1; break }
      e = e + 1 | 0
    }
    if ((h | 0) == 0) {
      // All five categories can roll zero. Pick an eligible category
      // uniformly by reservoir sampling and reroll it to a nonzero value.
      e = 0; q = -1; g = 0;
      while (1) {
        if ((e | 0) >= (DVi(o, c [383386] | 0) | 0)) break;
        f = c [(c [b + 116 >> 2] | 0) + 16 + (e << 2) >> 2] | 0;
        if ((f | 0) > 1) {
          g = g + 1 | 0;
          if ((o3i(0, 0, g | 0, 0) | 0) == 0) q = e
        }
        e = e + 1 | 0
      }
      if ((q | 0) >= 0) {
        f = c [(c [b + 116 >> 2] | 0) + 16 + (q << 2) >> 2] | 0;
        isg(o, q | 0, o3i(0, 1, f | 0, 0) | 0, c [383419] | 0)
      }
    }
    `;
writeFileSync(file, src.slice(0,begin)+replacement+src.slice(end));
console.log('Patched Gamemanager.Start (lXk); removed no-modifier rounds');

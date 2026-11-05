#!/usr/bin/env node
// Deterministic, offline check of the game contract. Run before every release.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { ORDER, META, EXTERNS, NEW_GAMES, FRESH_GAMES, UNSCORED_GAMES, PAYLOAD_SLUGS } from '../src/games/catalog.js';
import { DISCOVERY, PREVIEWS } from '../src/games/discovery.js';
import { LB_GAMES, HIGH_SCORE_GAMES } from '../src/hub/scores.js';
import { CHALLENGES, installDailyAdapter } from '../src/daily.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rules = JSON.parse(readFileSync(join(root, 'src/games/score-rules.json'), 'utf8'));
const errors = [];
const check = (test, message) => { if (!test) errors.push(message); };
const duplicates = values => values.filter((value, i) => values.indexOf(value) !== i);
const ids = ORDER.map(([id]) => id);
const idSet = new Set(ids), native = new Set(NEW_GAMES), online = new Set(Object.keys(EXTERNS));
const local = ids.filter(id => !online.has(id));
const specs = new Map(LB_GAMES.map(game => [game.id, game]));
const high = new Map(HIGH_SCORE_GAMES.map(game => [game.id, game]));
const challenges = CHALLENGES.map(game => game.slug);

check(!duplicates(ids).length, 'duplicate catalog slug: ' + duplicates(ids).join(', '));
check(!duplicates(NEW_GAMES).length && !duplicates(FRESH_GAMES).length, 'duplicate native or fresh slug');
check(FRESH_GAMES.length <= 4, 'NEW badge must have at most four games');
check(!duplicates(LB_GAMES.map(game => game.id)).length, 'duplicate leaderboard score spec');
check(!duplicates(challenges).length, 'duplicate daily challenge slug');

for (const [id, name] of ORDER) {
  check(/^[a-z0-9][a-z0-9-]*$/.test(id), id + ': invalid slug');
  check(typeof name === 'string' && name.trim(), id + ': missing display name');
  const meta = META[id], discovery = DISCOVERY[id];
  check(Array.isArray(meta) && meta.length === 2 && meta.every(Boolean), id + ': missing category/description');
  check(discovery && typeof discovery.minutes === 'string' &&
    typeof discovery.pace === 'string' && Array.isArray(discovery.inputs) &&
    discovery.inputs.length > 0 && discovery.inputs.every(input => ['Keyboard', 'Mouse', 'Touch'].includes(input)),
    id + ': missing or invalid discovery metadata');
  if (online.has(id)) {
    check(/^https:\/\//.test(EXTERNS[id]), id + ': invalid external address');
    check(!rules[id], id + ': external game must not have a local score rule');
    continue;
  }
  if (!native.has(id)) {
    const file = join(root, 'src/games/content', id + '.html');
    check(existsSync(file), id + ': missing game document');
    if (existsSync(file)) {
      const html = readFileSync(file, 'utf8');
      check(/<html[\s>]/i.test(html) && /<\/html>/i.test(html), id + ': not a full HTML document');
      if (high.has(id) && id !== '8ball') {
        const wired = installDailyAdapter(html, id);
        check(wired.includes('__boredSnapshot'), id + ': no snapshot hook in game or daily adapter');
      }
    }
  }
  const preview = PREVIEWS[id];
  check(typeof preview === 'string' && /\.(webp|svg)$/.test(preview), id + ': missing preview URL');
  if (preview) check(existsSync(fileURLToPath(preview)), id + ': missing preview asset');
  if (UNSCORED_GAMES.includes(id)) {
    check(!rules[id] && !specs.has(id), id + ': marked unscored but scoring hook/rule exists');
  } else {
    check(!!rules[id], id + ': no score rule');
    check(specs.has(id), id + ': no score capture spec (leaderboard silently skips it)');
  }
}
for (const id of [...native, ...online, ...FRESH_GAMES, ...UNSCORED_GAMES, ...PAYLOAD_SLUGS, ...Object.keys(META), ...Object.keys(DISCOVERY), ...Object.keys(PREVIEWS), ...Object.keys(rules), ...specs.keys(), ...challenges]) {
  check(idSet.has(id), id + ': referenced outside catalog');
}
check(PAYLOAD_SLUGS.length === local.length - native.size, 'document set does not match catalog');
for (const [id, spec] of specs) {
  if (UNSCORED_GAMES.includes(id)) continue;
  const rule = rules[id];
  if (!rule) continue;
  check(rule.better === (spec.lower ? 'low' : 'high'), id + ': score direction disagrees with database rule');
  check(Number.isSafeInteger(rule.max_value) && rule.max_value > 0, id + ': invalid score ceiling');
  if (high.has(id)) check(typeof spec.metric === 'string' && spec.metric.length > 0, id + ': no capture metric');
}
for (const id of challenges) check(!online.has(id), id + ': daily challenge needs a local game');
const legacyFiles = (await import('node:fs')).readdirSync(join(root, 'src/games/content'))
  .filter(file => file.endsWith('.html')).map(file => file.slice(0, -5));
for (const id of legacyFiles) check(PAYLOAD_SLUGS.includes(id), id + ': orphan HTML game (not registered)');

if (errors.length) {
  console.error('Game contract failed (' + errors.length + '):\n' + errors.map(e => '  - ' + e).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Game contract OK: ' + ids.length + ' entries, ' + local.length +
    ' local, ' + specs.size + ' scored, ' + challenges.length + ' daily, ' + online.size + ' online.');
}

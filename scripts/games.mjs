#!/usr/bin/env node
// Add games to the arcade and keep the shared leaderboard's game list in sync.
//
//   node scripts/games.mjs add <slug> "<Name>" "<Category>" "<blurb>"
//       [--unit <unit>] [--lower] [--metric <field>] [--no-score]
//   node scripts/games.mjs register [--apply]
//
// `add` scaffolds a playable game file, wires it into the catalog, and records
// what its score means. `register` compares the catalog with the score_rules
// table (the list the scores table's foreign key allows) and adds whatever is
// missing. Without a service key it prints the SQL; with one it writes rows:
//
//   SUPABASE_SERVICE_KEY=... node scripts/games.mjs register --apply

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogPath = join(root, 'src/games/catalog.js');
const backendPath = join(root, 'src/hub/backend.js');
const rulesPath = join(root, 'src/games/score-rules.json');
const contentDir = join(root, 'src/games/content');

const CATEGORIES = ['Arcade', 'Puzzle', 'Strategy', 'Sandbox', 'Online'];

/* ── shared helpers ──────────────────────────────────────────────────────── */

function usage(message) {
  if (message) console.error('error: ' + message + '\n');
  console.error(
    'usage:\n' +
    '  node scripts/games.mjs add <slug> "<Name>" "<Category>" "<blurb>" [--unit <unit>] [--lower] [--metric <field>] [--label <text>] [--max <n>] [--no-score]\n' +
    '  node scripts/games.mjs register [--apply]\n\n' +
    'categories: ' + CATEGORIES.join(', ')
  );
  process.exit(1);
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

// Project credentials are never committed: read them from the environment or a
// local env file if one exists, and never print them.
function readEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

function backendSettings() {
  const source = readFileSync(backendPath, 'utf8');
  const url = source.match(/const API_URL = '([^']+)'/)?.[1];
  const key = source.match(/const API_KEY = '([^']+)'/)?.[1];
  if (!url || !key) throw new Error('Could not read the Supabase settings from src/hub/backend.js.');
  return { url, key };
}

// The catalog keeps its games in two formats (the ORDER literal and the
// single-quoted unshift lines), so read only those statements: META uses the
// same ['Category', 'blurb'] shape and must not be mistaken for a game.
function catalogEntries() {
  const source = readFileSync(catalogPath, 'utf8');
  const entries = new Map();
  const orderStatements = source.match(/(?:export const ORDER = \[[\s\S]*?\];)|(?:ORDER\.unshift\([\s\S]*?\);)/g) || [];
  for (const statement of orderStatements) {
    for (const [, id, name] of statement.matchAll(/\[\s*["']([^"']+)["'],\s*["']([^"']+)["']\s*\]/g)) {
      entries.set(id, name);
    }
  }
  const newGames = source.match(/export const NEW_GAMES = \[([^\]]*)\]/)?.[1] || '';
  for (const [, id] of newGames.matchAll(/'([^']+)'/g)) entries.set(id, id);
  const externals = new Set();
  const externBlock = source.match(/export const EXTERNS = \{([^}]*)\}/)?.[1] || '';
  for (const [, id] of externBlock.matchAll(/"([^"]+)":/g)) externals.add(id);
  return { entries, externals };
}

async function api(path, { method = 'GET', body, key, prefer }) {
  const { url } = backendSettings();
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(url.replace(/\/+$/, '') + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + ' ' + (text || res.statusText));
  return text ? JSON.parse(text) : null;
}

function sqlFor(rules) {
  if (!rules.length) return '';
  const rows = rules.map(([game, rule]) =>
    `  ('${game}', '${rule.label}', '${rule.better}', ${rule.max_value})`);
  return '\ninsert into score_rules (game, label, better, max_value)\nvalues\n' +
    rows.join(',\n') + '\non conflict (game) do nothing;\n';
}

/* ── add: scaffold a game and wire it into the catalog ───────────────────── */

const starterGame = ({ slug, name, unit }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box }
  body { display: grid; place-items: center; min-height: 100vh; background: #f5f2ea; color: #191713;
         font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace }
  main { width: min(340px, 92vw); text-align: center }
  h1 { font-size: 12px; font-weight: 600; letter-spacing: .08em; margin-bottom: 12px }
  p { font-size: 12px; color: #6b6558; margin-top: 12px }
  #stage { position: relative; height: 200px; border: 1px solid #d8d2c4; background: #fffdf7; touch-action: manipulation }
  #target { position: absolute; width: 44px; height: 44px; border: 1px solid #191713; background: none;
            color: inherit; font: 12px ui-monospace; cursor: pointer }
  #target[hidden] { display: none }
  #start { font: inherit; font-size: 12px; border: 1px solid #191713; background: none; color: inherit;
           padding: 9px 14px; cursor: pointer }
</style>
</head>
<body>
<main>
  <h1 id="hud">${unit.toUpperCase()} 0</h1>
  <div id="stage"><button id="target" type="button" hidden>+1</button><button id="start" type="button">Start</button></div>
  <p id="hint">20 seconds. Hit as many as you can.</p>
</main>
<script>
/* Replace everything here with the game itself. Two hooks must survive:
   <title> is the display name, and window.__boredSnapshot() reports the
   current run so the hub can award a high score and check the daily
   challenge. Keep persistence try/catch-ed and under "${slug}.…". */
const $ = selector => document.querySelector(selector);
const ROUND = 20000;
let hits = 0, endsAt = 0, timer = 0;

function move() {
  const stage = $('#stage').getBoundingClientRect();
  $('#target').style.left = Math.round(Math.random() * (stage.width - 52)) + 'px';
  $('#target').style.top = Math.round(Math.random() * (stage.height - 52)) + 'px';
}
function hud(text) { $('#hud').textContent = text || (unit.toUpperCase() + ' ' + hits); }
function finish() {
  clearTimeout(timer);
  $('#target').hidden = true;
  $('#start').hidden = false;
  $('#start').textContent = 'Play again';
  $('#hint').textContent = 'Final: ' + hits + ' ' + unit + '.';
  hud();
}
function start() {
  hits = 0;
  endsAt = Date.now() + ROUND;
  $('#start').hidden = true;
  $('#target').hidden = false;
  hud();
  move();
  timer = setInterval(() => {
    const left = Math.max(0, endsAt - Date.now());
    hud('TIME ' + Math.ceil(left / 1000));
    if (!left) finish();
  }, 200);
}
$('#start').onclick = start;
$('#target').onclick = () => { hits++; hud(); move(); };

// The hub reads this: integer metrics, the current run, never null.
window.__boredSnapshot = () => ({ slug: '${slug}', hits });
</script>
</body>
</html>
`;

function addGame([slug, name, category, blurb, ...rest], flags) {
  if (!slug || !name || !category || !blurb) usage('add needs a slug, a name, a category and a blurb');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) usage('slugs are lower-case letters, digits and dashes');
  if (!CATEGORIES.includes(category)) usage('unknown category "' + category + '"');
  if (flags.metric && !/^[A-Za-z_$][\w$]*$/.test(flags.metric)) usage('--metric must be a snapshot field name');

  const { entries } = catalogEntries();
  const contentFile = join(contentDir, slug + '.html');
  if (entries.has(slug)) usage(slug + ' is already in the catalog');
  if (existsSync(contentFile)) usage(slug + '.html already exists');

  const unit = flags.unit || 'points';
  const lower = Boolean(flags.lower);
  const metric = flags.metric || unit.replace(/s$/, '');
  writeFileSync(contentFile, starterGame({ slug, name, unit }));

  const catalog = readFileSync(catalogPath, 'utf8');
  const metaKey = /^[a-z0-9]+$/.test(slug) ? slug : "'" + slug + "'";
  const updated = catalog
    .replace('export const ORDER = [', `export const ORDER = [["${slug}", "${name}"], `)
    .replace('export const META = {\n', `export const META = {\n  ${metaKey}: ['${category}', '${blurb}'],\n`);
  if (updated === catalog) usage('could not patch src/games/catalog.js');
  // The NEW badge holds four games, newest first: this one pushes the oldest off.
  const fresh = (updated.match(/export const FRESH_GAMES = \[([^\]]*)\]/)?.[1] || '')
    .match(/'[^']+'/g)?.map(id => id.slice(1, -1)) || [];
  const nextFresh = [slug, ...fresh.filter(id => id !== slug)].slice(0, 4);
  writeFileSync(catalogPath, updated.replace(
    /export const FRESH_GAMES = \[[^\]]*\]/,
    'export const FRESH_GAMES = [' + nextFresh.map(id => `'${id}'`).join(', ') + ']'
  ));

  const rules = readJson(rulesPath, {});
  if (!flags.noScore) {
    // A new score needs a row in score_rules before the board accepts it, so
    // record it here and let `register` add it to the backend.
    rules[slug] = {
      label: flags.label || (lower ? metric.charAt(0).toUpperCase() + metric.slice(1) : (unit === 'points' ? 'Score' : unit.charAt(0).toUpperCase() + unit.slice(1))),
      better: lower ? 'low' : 'high',
      max_value: Number(flags.max) || (unit === 'points' ? 10000000 : 999)
    };
    writeFileSync(rulesPath, JSON.stringify(sortObject(rules), null, 2) + '\n');
  }

  console.log(`added ${slug} (${name}) to src/games/content/${slug}.html and the catalog\n`);
  if (flags.noScore) {
    console.log('next:\n  npm test               # boots the new game in Chrome\n');
    return;
  }
  console.log(`score: ${rules[slug].label} (${rules[slug].better}, max ${rules[slug].max_value})\n`);
  console.log(
    'next:\n' +
    `  1. src/hub/scores.js — HIGH_SCORE_GAMES, so bests are captured:\n` +
    `       highScore('${slug}', '${name}', '${unit}', { metric: '${metric}'${lower ? ', lower: true' : ''} }),\n` +
    `  2. src/daily.js — CHALLENGES, so it can be a daily (optional):\n` +
    `       { slug: '${slug}', label: 'Short title', goal: 'Reach {target} ${unit} in one run.',\n` +
    `         metric: '${metric}', targets: [10, 20, 30], unit: '${unit}' },\n` +
    `  3. npm run games:register   # give the shared board its rule row\n` +
    `  4. npm test\n`
  );
}

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

/* ── register: make sure every game has a rule row ───────────────────────── */

async function registerRules(flags) {
  const { entries, externals } = catalogEntries();
  const wanted = readJson(rulesPath, {});
  const { key } = backendSettings();
  const env = { ...readEnvFile(join(root, '.env.local')), ...process.env };
  const serviceKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null;

  const offline = [...entries.keys()].filter(slug => !externals.has(slug));
  const withoutRule = offline.filter(slug => !wanted[slug]);
  const existing = new Set((await api('/rest/v1/score_rules?select=game', { key }))?.map(row => row.game) || []);

  const missing = offline.filter(slug => wanted[slug] && !existing.has(slug));
  const orphans = [...existing].filter(game => !entries.has(game));

  console.log(`catalog: ${entries.size} games (${offline.length} offline, ${externals.size} external)`);
  console.log(`shared board: ${existing.size} rules on the server, ${Object.keys(wanted).length} recorded here\n`);

  if (withoutRule.length) {
    console.log('no score rule recorded (these stay local-only until one is added):');
    for (const slug of withoutRule) console.log('  ' + slug);
    console.log('');
  }
  if (orphans.length) {
    console.log('on the server but not in the catalog: ' + orphans.join(', ') + '\n');
  }
  if (!missing.length) {
    console.log('every game with a recorded rule has a row on the server.');
    return;
  }

  const rows = missing.map(slug => [slug, wanted[slug]]);
  if (!flags.apply) {
    console.log('missing on the server (run with --apply and a service key to insert them):');
    for (const [slug, rule] of rows) console.log(`  ${slug} — ${rule.label} (${rule.better}, max ${rule.max_value})`);
    console.log(sqlFor(rows));
    return;
  }
  if (!serviceKey) {
    console.log('--apply needs SUPABASE_SERVICE_KEY (env or .env.local). Paste this instead:\n' + sqlFor(rows));
    return;
  }
  const inserted = await api('/rest/v1/score_rules?on_conflict=game', {
    method: 'POST',
    key: serviceKey,
    body: rows.map(([game, rule]) => ({ game, ...rule })),
    prefer: 'resolution=merge-duplicates'
  }).catch(err => { console.error('insert failed: ' + err.message + '\n\npaste this instead:\n' + sqlFor(rows)); return null; });
  if (inserted) console.log('inserted ' + rows.length + ' rules: ' + missing.join(', '));
}

/* ── entry point ─────────────────────────────────────────────────────────── */

const [command, ...args] = process.argv.slice(2);
const flags = {};
const positionals = [];
for (let index = 0; index < args.length; index++) {
  const token = args[index];
  if (!token.startsWith('--')) { positionals.push(token); continue; }
  const [name, inline] = token.slice(2).split('=', 2);
  const value = inline !== undefined || !args[index + 1] || args[index + 1].startsWith('--')
    ? (inline !== undefined ? inline : true)
    : args[++index];
  flags[name] = value;
}

if (command === 'add') addGame(positionals, flags);
else if (command === 'register') await registerRules(flags);
else usage();

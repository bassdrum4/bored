#!/usr/bin/env node
// Create the feedback table the "Send feedback" dialog posts to.
//
//   node scripts/setup-feedback.mjs            # report state, print the SQL
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/setup-feedback.mjs --apply
//
// --apply runs scripts/feedback-setup.sql through the Supabase management API,
// which needs a personal access token from
// https://supabase.com/dashboard/account/tokens — the service key cannot run
// DDL. Tokens are read from the environment or .env.local and never printed.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sqlPath = join(root, 'scripts/feedback-setup.sql');
const apply = process.argv.includes('--apply');

function readEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

function settings() {
  const source = readFileSync(join(root, 'src/hub/backend.js'), 'utf8');
  const url = source.match(/const API_URL = '([^']+)'/)?.[1];
  const key = source.match(/const API_KEY = '([^']+)'/)?.[1];
  if (!url || !key) throw new Error('Could not read the Supabase settings from src/hub/backend.js.');
  return { url: url.replace(/\/+$/, ''), key };
}

// With the publishable key: 404 means no table, 401/403 means the table is
// there and correctly refuses to be read, 200 means anyone can read feedback.
async function state({ url, key }) {
  const res = await fetch(url + '/rest/v1/feedback?select=id&limit=1', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  if (res.status === 404) return 'missing';
  if (res.status === 401 || res.status === 403) return 'insert-only';
  if (res.ok) return 'readable';
  return 'unexpected ' + res.status;
}

async function applySql({ url }, token) {
  const ref = new URL(url).hostname.split('.')[0];
  const res = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: readFileSync(sqlPath, 'utf8') })
  });
  const body = await res.text();
  if (!res.ok) throw new Error('management API said ' + res.status + ': ' + body.slice(0, 300));
  return ref;
}

const config = settings();
console.log('project: ' + config.url);
console.log('feedback table: ' + (await state(config)));

if (!apply) {
  console.log('\nRun with --apply and a personal access token to create it:\n' +
    '  SUPABASE_ACCESS_TOKEN=sbp_... npm run feedback:setup -- --apply\n' +
    '\nOr paste scripts/feedback-setup.sql into the Supabase SQL editor:\n');
  console.log(readFileSync(sqlPath, 'utf8'));
  process.exit(0);
}

const env = { ...readEnvFile(join(root, '.env.local')), ...process.env };
const token = env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_PAT || '';
if (!token) {
  console.error('\n--apply needs SUPABASE_ACCESS_TOKEN (a personal access token, not the service key).\n' +
    'Paste scripts/feedback-setup.sql into the Supabase SQL editor instead.');
  process.exit(1);
}

const ref = await applySql(config, token);
console.log('\nran scripts/feedback-setup.sql on ' + ref);
const after = await state(config);
console.log('feedback table: ' + after);
if (after !== 'insert-only') {
  console.error('Expected the table to be insert-only for the publishable key. Check the policies.');
  process.exit(1);
}
console.log('\nFeedback is ready. The dialog posts to /rest/v1/feedback with the publishable key.');

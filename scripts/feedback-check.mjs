// A live check of the feedback table: the exact contract the browser depends on.
//
//   node scripts/feedback-check.mjs        (or: npm run feedback:check)
//
// It posts one probe note and one probe rating with the publishable key the
// site ships, proves neither row can be read back with that key, proves a guest
// cannot file feedback under an account, and proves the table refuses a bad
// rating and an over-long note. The probes are deleted with the service key in
// SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) when it is set; without
// one the row is left in place and named on the last line.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const backend = readFileSync(new URL('src/hub/backend.js', root), 'utf8');
const API_URL = /const API_URL = '([^']+)'/.exec(backend)?.[1];
const KEY = /const API_KEY = '([^']+)'/.exec(backend)?.[1];
if (!API_URL || !KEY) {
  console.error('Could not read the Supabase constants from src/hub/backend.js.');
  process.exit(1);
}

const TABLE = API_URL.replace(/\/+$/, '') + '/rest/v1/feedback_entries';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const marker = 'automated feedback check ' + new Date().toISOString();
const failures = [];
const notes = [];

async function call(label, path, { method = 'GET', body, token = KEY, prefer } = {}) {
  const headers = { apikey: KEY, Authorization: 'Bearer ' + token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(TABLE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { label, status: res.status, body: parsed };
}

function check(result, allowed, detail) {
  const pass = allowed.includes(result.status);
  const message = detail ? detail(result) : (result.body?.message || '');
  const line = (pass ? 'ok   ' : 'FAIL ') + result.label +
    ' (HTTP ' + result.status + ')' + (message ? ' — ' + message : '');
  notes.push(line);
  if (!pass) failures.push(line);
  return pass;
}

// 1. A guest note lands, exactly as src/hub/feedback.js sends it.
const note = await call('guest note is accepted', '', {
  method: 'POST',
  prefer: 'return=minimal',
  body: {
    kind: 'note', body: marker, email: null, page: '/scripts/feedback-check.mjs',
    handle: null, user_id: null, user_agent: 'feedback-check'
  }
});
check(note, [201]);

// 2. A guest rating lands, as the enjoyment prompt sends it.
const rating = await call('guest rating is accepted', '', {
  method: 'POST',
  prefer: 'return=minimal',
  body: {
    id: crypto.randomUUID(), kind: 'rating', user_id: null,
    visitor_id: crypto.randomUUID(), game: 'risk', rating: 5, body: marker
  }
});
check(rating, [201]);

// 3. The publishable key may write and never read.
const read = await call('publishable key cannot read feedback', '?select=id,body&limit=1');
check(read, [401, 403], () => 'no SELECT grant for the public key');

// 4. A guest cannot attach feedback to an account.
const spoof = await call('a guest cannot claim an account', '', {
  method: 'POST',
  prefer: 'return=minimal',
  body: { kind: 'note', body: marker, user_id: '00000000-0000-4000-8000-000000000000' }
});
check(spoof, [401, 403], () => 'insert policy requires user_id = auth.uid()');

// 5. Rows the table should refuse.
const badRating = await call('rating outside 1-5 is refused', '', {
  method: 'POST',
  prefer: 'return=minimal',
  body: { kind: 'rating', rating: 6, visitor_id: crypto.randomUUID(), game: 'risk' }
});
check(badRating, [400]);

const longNote = await call('a note over 2000 characters is refused', '', {
  method: 'POST',
  prefer: 'return=minimal',
  body: { kind: 'note', body: 'x'.repeat(2001) }
});
check(longNote, [400]);

const mixed = await call('a note cannot carry a rating', '', {
  method: 'POST',
  prefer: 'return=minimal',
  body: { kind: 'note', body: marker, rating: 3 }
});
check(mixed, [400]);

// 6. Take the probes back out. The service key bypasses RLS; the publishable
// key cannot delete, which is why this step is optional.
if (SERVICE) {
  const res = await fetch(TABLE + '?body=eq.' + encodeURIComponent(marker), {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, Prefer: 'return=representation' }
  });
  const removed = res.ok ? (await res.json().catch(() => [])) : [];
  notes.push((res.ok ? 'ok   ' : 'FAIL ') + 'probe rows removed (HTTP ' + res.status + ', ' +
    (Array.isArray(removed) ? removed.length : 0) + ' rows)');
  if (!res.ok) failures.push(notes.at(-1));
} else {
  notes.push('note probe rows remain for body "' + marker + '"');
  notes.push('     set SUPABASE_SERVICE_ROLE_KEY (or delete them in the dashboard)');
}

for (const line of notes) console.log(line);
if (failures.length) {
  console.error('\nFeedback contract FAILED: ' + failures.length + ' check(s).');
  process.exit(1);
}
console.log('\nFeedback contract OK: ' + notes.filter(line => line.startsWith('ok   ')).length + ' checks.');

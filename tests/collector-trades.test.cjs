// Collector trades: the server rules in supabase/migrations/*_collector_trades.sql, run in an
// in-memory Postgres (PGlite) with stand-ins for auth.users, profiles and player_state.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.endsWith('_collector_trades.sql'));

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c', NEW = '00000000-0000-0000-0000-00000000000d';
// A wallet: Collector pulls of these species (one copy each) and some dust.
const wallet = (mons, dust = 500) => ({ wallet: { v: 1, entries: {
  'spend:col:test': { at: 1, g: { chips: -900, dust }, x: { cp: mons.map(n => [n, 1]), n: 0, d: '2026-11-01' } } } } });

async function db() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role anon; create role authenticated;
    create table public.profiles (id uuid primary key, handle text);
    create table public.player_state (user_id uuid primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
    insert into auth.users values ('${A}', now() - interval '30 days'), ('${B}', now() - interval '30 days'), ('${C}', now() - interval '30 days'), ('${NEW}', now() - interval '2 days');
    insert into public.profiles values ('${A}', 'ash'), ('${B}', 'misty'), ('${C}', 'brock'), ('${NEW}', 'newbie');
  `);
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8');
  await pg.exec(sql); await pg.exec(sql); // safe to run twice
  const state = (uid, data) => pg.query('insert into public.player_state (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data', [uid, data]);
  const as = uid => pg.exec(`select set_config('test.uid', '${uid}', false)`);
  const one = async (q, args = []) => (await pg.query(q, args)).rows[0];
  return { pg, state, as, one };
}

test('the tier table matches the game', async () => {
  const { one } = await db();
  // Bulbasaur Common, Mewtwo Legendary, Nihilego (an Ultra Beast) Epic.
  assert.deepEqual([(await one('select public.collector_tier(1) t')).t, (await one('select public.collector_tier(150) t')).t, (await one('select public.collector_tier(793) t')).t], [0, 3, 2]);
});

test('post, see and accept: same rarity, real copies, fees, and the swap in one step', async () => {
  const { pg, state, as, one } = await db();
  await state(A, wallet([1, 4]));        // Bulbasaur, Charmander (both Common)
  await state(B, wallet([7]));           // Squirtle (Common)
  await as(A);
  await assert.rejects(pg.query('select public.post_collector_offer(1, 150)'), /same rarity/);
  await assert.rejects(pg.query('select public.post_collector_offer(10, 7)'), /do not have/);
  const id = (await one('select public.post_collector_offer(1, 7) id')).id;
  // The open offer holds Bulbasaur back: a second offer of it is refused.
  await assert.rejects(pg.query('select public.post_collector_offer(1, 152)'), /do not have/);
  await as(B);
  const seen = (await pg.query('select * from public.collector_offers()')).rows;
  assert.deepEqual(seen.map(r => [r.handle, r.give, r.want, r.fee, r.mine]), [['ash', 1, 7, 5, false]]);
  const done = await one('select public.accept_collector_offer($1) r', [id]);
  assert.deepEqual(done.r, { id: Number(id), got: 1, gave: 7, fee: 5, tier: 0 });
  // Counted from this table: A now holds Squirtle and not Bulbasaur; B the reverse; each paid 5 dust.
  const copies = async (u, n) => (await one('select public.collector_copies($1, $2) c', [u, n])).c;
  assert.deepEqual([await copies(A, 1), await copies(A, 7), await copies(B, 1), await copies(B, 7)], [0, 1, 1, 0]);
  assert.deepEqual([(await one('select public.collector_dust($1) d', [A])).d, (await one('select public.collector_dust($1) d', [B])).d], [495, 495]);
  // The wallet's own mirror of the trade (col:trade) changes nothing on the server.
  await state(B, { wallet: { v: 1, entries: { ...wallet([7]).wallet.entries, 'col:trade:1': { at: 2, g: { dust: -5 }, x: { in: 1, out: 7 } } } } });
  assert.deepEqual([await copies(B, 1), (await one('select public.collector_dust($1) d', [B])).d], [1, 495]);
  await assert.rejects(pg.query('select public.accept_collector_offer($1)', [id]), /gone/);
  const hist = (await pg.query('select * from public.my_collector_trades()')).rows;
  assert.deepEqual(hist.map(r => [r.got, r.gave, r.fee, r.other]), [[1, 7, 5, 'ash']]);
});

test('rules: own offer, a handle, new accounts, dust, open-offer limit, cancel', async () => {
  const { pg, state, as, one } = await db();
  await state(A, wallet([1, 4, 10, 13, 16, 19, 21]));
  await state(B, wallet([7, 25], 0));
  await state(C, wallet([7]));
  await state(NEW, wallet([7]));
  await as(A);
  const forMisty = (await one(`select public.post_collector_offer(1, 7, 'misty') id`)).id;
  await assert.rejects(pg.query('select public.accept_collector_offer($1)', [forMisty]), /own offer/);
  await as(C);
  await assert.rejects(pg.query('select public.accept_collector_offer($1)', [forMisty]), /someone else/);
  assert.equal((await pg.query('select * from public.collector_offers()')).rows.length, 0, 'brock does not see an offer for misty');
  await as(B);
  await assert.rejects(pg.query('select public.accept_collector_offer($1)', [forMisty]), /dust/, 'misty has no dust for the fee');
  await as(NEW);
  await assert.rejects(pg.query('select public.post_collector_offer(7, 1)'), /7 days/);
  await as(A);
  for (const n of [4, 10, 13, 16]) await pg.query('select public.post_collector_offer($1, 7)', [n]);
  await assert.rejects(pg.query('select public.post_collector_offer(19, 7)'), /Five open offers/);
  await pg.query('select public.cancel_collector_offer($1)', [forMisty]);
  await pg.query('select public.post_collector_offer(19, 7)');
  await as(C);
  await assert.rejects(pg.query('select public.cancel_collector_offer($1)', [forMisty]), /No such open offer/);
});

test('limits: three trades a Detroit day, one Legendary trade a week', async () => {
  const { pg, state, as, one } = await db();
  await state(A, wallet([1, 4, 10, 13, 144, 145], 1000));
  await state(B, wallet([7, 16, 19, 25, 146, 150], 1000));
  const trade = async (give, want) => { await as(A); const id = (await one('select public.post_collector_offer($1, $2) id', [give, want])).id; await as(B); return pg.query('select public.accept_collector_offer($1)', [id]); };
  await trade(1, 7); await trade(4, 16); await trade(10, 19);
  await assert.rejects(trade(13, 25), /Three trades a day/);
  // Move those three to last week, then: one Legendary trade, and a second is refused.
  await pg.exec(`update public.collector_trade_offers set done_at = done_at - interval '8 days' where status = 'done'`);
  await trade(144, 146);
  await assert.rejects(trade(145, 150), /One Legendary or Mythical trade a week/);
});

test('the wallet mirrors each finished trade once: the mon in, the mon out, the fee', () => {
  const source = fs.readFileSync(path.join(root, 'src/hub/trades.js'), 'utf8')
    .replace(/^import [\s\S]*?;\s*$/gm, '').replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))/g, '');
  const mergeWallet = (...ws) => ({ v: 1, entries: Object.assign({}, ...ws.map(w => (w && w.entries) || {})) });
  const { applyTrades } = new Function('mergeWallet', 'request', 'freshSession', 'hasIdentity', 'readWallet', 'writeWallet', source + '\nreturn { applyTrades };')(mergeWallet);
  const rows = [{ id: 7, got: 1, gave: 4, fee: 5, done_at: '2026-11-23T12:00:00Z' }, { id: 8, got: 'x', gave: 4, fee: 5 }];
  const first = applyTrades({ v: 1, entries: {} }, rows);
  assert.equal(first.added, 1, 'a bad row is skipped');
  assert.deepEqual(first.wallet.entries['col:trade:7'], { at: Date.parse('2026-11-23T12:00:00Z') / 1000, g: { dust: -5 }, x: { in: 1, out: 4 } });
  assert.equal(applyTrades(first.wallet, rows).added, 0, 'once');
});

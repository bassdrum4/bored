// Trackmania's daily board, served as a Bored Edge Function.
//
// The daily ribbon is generated from the shared seed, so every player drives the
// same road and their times are comparable. This pools finished runs anonymously
// — a run is a time and a path, nothing else — and answers with the shape of the
// day plus the fastest ghost, which the game races against on its next attempt.
// There is no account here and no name to store.
//
// A posted run has to carry its ghost and the ghost has to last as long as the
// time it claims, so the board cannot be filled with times nobody drove. That is
// a plausibility check, not a replay of the drive: the client owns the physics.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store'
};

type Sample = number[];
type Row = { id: string; ms: number; ghost: Sample[] | null };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const MIN_MS = 4_000;          // shorter than this is not a lap of any daily
const MAX_MS = 600_000;        // and longer than this is a walk, not a time
const MIN_POPULATION = 3;      // below this the curve says nothing
const BUCKET_MS = 5_000;
const BUCKET_FROM = 10_000;
const BUCKETS = 16;
const MAX_SAMPLES = 1_200;     // ten minutes at the ghost rate
const MAX_BODY = 96_000;
const MAX_ROWS = 2_000;
const DAY_MS = 86_400_000;

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json' }
});

// The daily rolls over at midnight in Detroit, wherever the player is, because
// that is the day the hub seeds every game document with.
function etDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(now));
}

async function readJson(req: Request, limit = 16_384): Promise<Record<string, any>> {
  const text = await req.text();
  if (text.length > limit) throw new HttpError('Request too large.', 413);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError('Invalid request.', 400);
  }
}

async function sb(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Backend is not configured.');
  const headers = new Headers(init.headers);
  headers.set('apikey', SERVICE_KEY);
  headers.set('Authorization', 'Bearer ' + SERVICE_KEY);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(SUPABASE_URL + '/rest/v1/' + path, { ...init, headers });
}

const validDay = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z'));

// A player can be a day behind the server (or a minute ahead of Detroit
// midnight), so a week back and one day forward is the whole accepted window.
function dayWindow(date: string) {
  const delta = (Date.parse(date + 'T00:00:00Z') - Date.parse(etDate() + 'T00:00:00Z')) / DAY_MS;
  return delta >= -7 && delta <= 1;
}

const bucketOf = (ms: number) =>
  Math.max(0, Math.min(BUCKETS - 1, Math.floor((ms - BUCKET_FROM) / BUCKET_MS)));

// [t, x, y, z, fx, fy, fz, ux, uy, uz], the same shape the game records.
function parseGhost(value: unknown): Sample[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_SAMPLES) return null;
  const out: Sample[] = [];
  let last = -1;
  for (const sample of value) {
    if (!Array.isArray(sample) || sample.length !== 10) return null;
    const row = sample.map(Number);
    if (!row.every(Number.isFinite)) return null;
    const [t, x, y, z] = row;
    if (t < 0 || t > 1_200) return null;
    if (Math.abs(x) > 10_000 || Math.abs(y) > 10_000 || Math.abs(z) > 10_000) return null;
    if (t < last) return null;
    last = t;
    out.push(row);
  }
  return out;
}

async function dayRows(date: string): Promise<Row[]> {
  const response = await sb('trackbound_runs?day=eq.' + encodeURIComponent(date) +
    '&select=id,ms,ghost&order=ms.asc&limit=' + MAX_ROWS);
  if (!response.ok) throw new HttpError('The board is out of reach. Try again shortly.', 503);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : [])
    .map((row: any) => ({
      id: String(row.id),
      ms: Number(row.ms),
      ghost: Array.isArray(row.ghost) ? (row.ghost as Sample[]) : null
    }))
    .filter(row => Number.isFinite(row.ms) && row.ms >= MIN_MS && row.ms <= MAX_MS);
}

// The answer the game draws: a count, a percentile once there is a population,
// sixteen buckets of five seconds from ten, and the fastest ghost of the day.
function summarise(date: string, rows: Row[], mine: number | null, skipId: string | null) {
  const others = rows.filter(row => row.id !== skipId);
  const population = others.length;
  const dist = Array(BUCKETS).fill(0);
  for (const row of others) dist[bucketOf(row.ms)] += 1;
  const betterThan = mine != null && population >= MIN_POPULATION
    ? Math.round((others.filter(row => row.ms > mine).length / population) * 100)
    : null;
  const fastest = rows[0] || null;
  return {
    date,
    population,
    betterThan,
    yourRank: mine == null ? null : 1 + others.filter(row => row.ms < mine).length,
    yourBucket: mine == null ? null : bucketOf(mine),
    dist,
    best: fastest?.ghost ? { ms: fastest.ms, ghost: fastest.ghost } : null
  };
}

const routePath = (url: URL) => url.pathname.replace(/^.*\/trackbound/, '').replace(/\/+$/, '') || '/';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    const path = routePath(url);

    if (req.method === 'GET') {
      if (path === '/' || path === '/health') return reply({ ok: true, buckets: BUCKETS });
      if (path === '/daily') {
        const date = url.searchParams.get('date') || etDate();
        if (!validDay(date) || !dayWindow(date)) throw new HttpError('Unknown day.', 400);
        const raw = Number(url.searchParams.get('ms'));
        const mine = Number.isFinite(raw) && raw >= MIN_MS && raw <= MAX_MS ? Math.round(raw) : null;
        return reply(summarise(date, await dayRows(date), mine, null));
      }
      throw new HttpError('Unknown endpoint.', 404);
    }

    if (req.method !== 'POST') throw new HttpError('Use GET or POST.', 405);
    const body = await readJson(req, MAX_BODY);
    if (path !== '/daily') throw new HttpError('Unknown endpoint.', 404);

    const date = String(body.date || etDate());
    if (!validDay(date) || !dayWindow(date)) throw new HttpError('Unknown day.', 400);
    const ms = Number(body.ms);
    if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) throw new HttpError('That time is not a run.', 400);
    const ghost = parseGhost(body.ghost);
    if (!ghost) throw new HttpError('That ghost is not a run.', 400);
    const ghostMs = ghost[ghost.length - 1][0] * 1000;
    if (Math.abs(ghostMs - ms) > 2_500) throw new HttpError('The ghost does not match the time.', 400);
    const medal = ['author', 'gold', 'silver', 'bronze'].includes(String(body.medal)) ? String(body.medal) : null;

    const insert = await sb('trackbound_runs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ day: date, ms: Math.round(ms), medal, ghost }])
    });
    if (!insert.ok) throw new HttpError('The time could not be filed. Try again shortly.', 503);
    const created = await insert.json();
    const id = created?.[0]?.id ? String(created[0].id) : null;

    return reply(summarise(date, await dayRows(date), Math.round(ms), id));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    console.error('trackbound:', error instanceof Error ? error.message : String(error));
    return reply({
      error: status >= 500
        ? 'The board is out of reach. Try again shortly.'
        : (error instanceof Error ? error.message : 'Request failed.')
    }, status);
  }
});

// Krillion, served as a Bored Edge Function.
//
// The reference site has no CORS headers, and a big day's answer sheet is tens
// of megabytes — more object graph than an Edge Function can hold. So this
// function is a pipe: it hands the browser the day's prompts and streams the
// reveal back untouched. The browser checks answers with the same rules the
// game ships, and the function keeps only the run, so the clock, the daily
// board and the sounding still belong to the server.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store'
};

const TIERS: Record<string, { name: string; score: number }> = {
  plankton: { name: 'Plankton', score: 10 },
  tooclever: { name: 'Too Clever', score: 15 },
  schooler: { name: 'Schooler', score: 30 },
  rare: { name: 'Rare', score: 60 },
  deepcut: { name: 'Deep Cut', score: 85 },
  krillion: { name: 'One in a Krillion', score: 100 }
};

type Prompt = { id: string; text: string };
type Today = { date: string; dayNumber: number; resetsAt: number; prompts: Prompt[] };
type Scored = { answer: string; tier: string; quip: string | null };
type AnswerResult = {
  round: number;
  rawAnswer: string | null;
  answer: string | null;
  tier: string | null;
  score: number;
  quip: string | null;
  promptText: string;
};
type Run = {
  id: string;
  date: string;
  day_number: number;
  mode: string;
  round: number;
  round_start: number | string | null;
  paused_at: number | string | null;
  completed: boolean;
  results: AnswerResult[];
  hint_used: boolean;
  prompts: Prompt[];
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const REFERENCE = 'https://krillion.io/api/';
const USER_AGENT = 'BoredKrillion/1.0 (+https://bassdrum4.github.io/bored/)';
const ROUNDS = 7;
const ROUND_MS = 25_000;
const PREVIEW_MS = 3_000;
// The browser matches the answer before it posts, which costs a few hundred
// milliseconds on the biggest rounds of the day.
const ANSWER_GRACE_MS = 4_000;
const RUN_COLUMNS = 'id,date,day_number,mode,round,round_start,paused_at,completed,results,hint_used,prompts';

function etDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

function resetAt(date: string) {
  const next = new Date(date + 'T12:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const day = next.toISOString().slice(0, 10);
  const probe = new Date(day + 'T04:00:00Z');
  return etDate(probe) === day ? probe.getTime() : Date.parse(day + 'T05:00:00Z');
}

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
  // Bound each database hop. Only reads and explicitly idempotent writes retry.
  const safe = !init.method || init.method === 'GET' || path === 'krillion_runs?on_conflict=id';
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, { ...init, headers, signal: AbortSignal.timeout(4_000) });
      if (!safe || attempt || ![429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(response.status)) return response;
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      if (!safe || attempt) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 300));
  }
}

// The reference site's own day payload: seven prompts and a reset time, a few
// hundred bytes. It is re-read once a minute so a rolled-over day is picked up.
let dayCache: { at: number; day: Today } | null = null;

async function loadToday(): Promise<Today> {
  const now = Date.now();
  if (dayCache && now - dayCache.at < 60_000) return dayCache.day;
  const response = await fetch(REFERENCE + 'today', {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new HttpError('Today’s dive is temporarily unavailable.', 503);
  const raw = await response.json().catch(() => null);
  const prompts = Array.isArray(raw?.prompts) ? raw.prompts : [];
  if (prompts.length !== ROUNDS) throw new HttpError('Today’s dive is temporarily unavailable.', 503);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.date)) ? String(raw.date) : etDate(now);
  const day: Today = {
    date,
    dayNumber: Number(raw?.dayNumber) || 0,
    resetsAt: Number(raw?.resetsAt) || resetAt(date),
    prompts: prompts.map((prompt: any, index: number) => ({
      id: String(prompt?.id || `p${index + 1}`),
      text: String(prompt?.text || '')
    }))
  };
  dayCache = { at: now, day };
  return day;
}

// A dive's own state is the whole public answer to "where am I": the prompts it
// was served, its clock and its scored rounds. Nothing is looked up again.
function stateFor(run: Run) {
  const results = Array.isArray(run.results) ? run.results : [];
  const prompts = Array.isArray(run.prompts) ? run.prompts : [];
  return {
    date: String(run.date),
    dayNumber: Number(run.day_number) || 0,
    sample: false,
    stale: false,
    source: 'krillion.io',
    prompts: prompts.map(prompt => ({ id: String(prompt?.id), text: String(prompt?.text) })),
    resetsAt: resetAt(String(run.date)),
    runId: run.id,
    mode: run.mode,
    round: Number(run.round),
    roundStart: run.round_start == null ? null : Number(run.round_start),
    pausedAt: run.paused_at == null ? null : Number(run.paused_at),
    serverNow: Date.now(),
    completed: !!run.completed,
    results,
    score: results.reduce((total, result) => total + Number(result?.score || 0), 0),
    hintUsed: !!run.hint_used
  };
}

// The population curve. Every finished daily dive already sits in
// krillion_runs as an anonymous row of round results, so the distribution is
// drawn from the dives themselves: no names, no player identifiers, no extra
// table to keep in step. It is read once a minute and refreshed as soon as a
// dive finishes.
const POPULATION_MIN = 3;
const POPULATION_TTL = 60_000;
let dailyCache: { date: string; at: number; rows: { id: string; score: number }[] } | null = null;

const runScore = (results: unknown) => (Array.isArray(results) ? results : [])
  .reduce((total, entry) => total + Number((entry as AnswerResult)?.score || 0), 0);

async function dailyScores(date: string) {
  if (dailyCache && dailyCache.date === date && Date.now() - dailyCache.at < POPULATION_TTL) return dailyCache.rows;
  const response = await sb('krillion_runs?date=eq.' + encodeURIComponent(date) + '&mode=eq.daily&completed=eq.true&select=id,results&limit=2000');
  if (!response.ok) throw new HttpError('The sounding is out of reach. Try again shortly.', 503);
  const rows = await response.json();
  const scores = (Array.isArray(rows) ? rows : []).map((row: any) => ({ id: String(row.id), score: runScore(row.results) }));
  dailyCache = { date, at: Date.now(), rows: scores };
  return scores;
}

// The chart wants 71 buckets of ten points each: a perfect dive is 700.
function dailyComparison(run: Run, scores: { id: string; score: number }[]) {
  const mine = runScore(run.results);
  const others = scores.filter(entry => entry.id !== run.id);
  const population = others.length;
  const dist = Array(71).fill(0);
  if (population < POPULATION_MIN) return { population, betterThan: null, dist };
  for (const entry of others) dist[Math.max(0, Math.min(70, Math.floor(entry.score / 10)))] += 1;
  const better = others.filter(entry => entry.score < mine).length;
  return { population, betterThan: Math.round((better / population) * 100), dist };
}

// The anonymous daily board reads the same rows the curve does.
function dailyBoard(run: Run, scores: { id: string; score: number }[]) {
  const mine = runScore(run.results);
  const ordered = scores.slice().sort((a, b) => b.score - a.score);
  const index = ordered.findIndex(entry => entry.id === run.id);
  return {
    date: run.date,
    total: ordered.length,
    top: ordered.slice(0, 10).map((entry, rank) => ({ rank: rank + 1, score: entry.score, you: entry.id === run.id })),
    yourRank: index < 0 ? null : index + 1,
    yourScore: mine,
    beaten: ordered.filter(entry => entry.score < mine).length
  };
}

async function readRun(id: string): Promise<Run | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return null;
  const response = await sb('krillion_runs?id=eq.' + encodeURIComponent(id) + '&select=' + RUN_COLUMNS + '&limit=1');
  if (!response.ok) throw new HttpError('The dive state is temporarily unavailable.', 503);
  const rows = await response.json();
  return (rows?.[0] || null) as Run | null;
}

async function createRun(mode: string, day: Today, prompts: Prompt[], id = crypto.randomUUID()): Promise<Run> {
  const row = {
    id,
    date: day.date,
    day_number: day.dayNumber,
    mode,
    round: 0,
    round_start: Date.now() + PREVIEW_MS,
    paused_at: null,
    completed: false,
    results: [],
    hint_used: false,
    prompts
  };
  const response = await sb('krillion_runs?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
  if (!response.ok) throw new HttpError('The dive could not start. Try again shortly.', 503);
  const rows = await response.json();
  // A lost response can be retried with the same ID without creating another dive.
  const run = rows?.[0] || await readRun(id);
  if (!run || run.mode !== mode || run.date !== day.date) throw new HttpError('Dive could not be recovered.', 409);
  return run as Run;
}

async function updateRun(id: string, patch: Record<string, unknown>): Promise<Run> {
  const response = await sb('krillion_runs?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new HttpError('The dive could not be saved. Try again shortly.', 503);
  const rows = await response.json();
  if (!rows?.[0]) throw new HttpError('Dive not found.', 404);
  // A dive that just finished belongs in the curve now, not a minute from now.
  if (patch.completed === true) dailyCache = null;
  return rows[0] as Run;
}

// The answer the browser matched is the browser's word; the server only keeps
// it inside the tiers it knows and prices it from its own table.
function cleanResult(value: unknown): Scored | null {
  if (!value || typeof value !== 'object') return null;
  const tier = String((value as any).tier || '');
  const answer = typeof (value as any).answer === 'string' ? (value as any).answer.trim().slice(0, 120) : '';
  if (!answer || !Object.hasOwn(TIERS, tier)) return null;
  const quip = typeof (value as any).quip === 'string' ? (value as any).quip.slice(0, 240) : null;
  return { answer, tier, quip };
}

const shuffle = <T>(items: T[]) => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const runPath = (url: URL) => (url.pathname.replace(/^.*\/krillion/, '').replace(/^\/api/, '') || '/').replace(/\/+$/, '') || '/';

Deno.serve(async (req: Request) => {
  const receivedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    const path = runPath(url);

    if (req.method === 'GET') {
      if (path === '/' || path === '/today') {
        const day = await loadToday();
        return reply({ ...day, sample: false, stale: false, source: 'krillion.io' });
      }
      // The day's answer sheet, streamed straight through. A browser cannot ask
      // the reference site itself: there are no CORS headers on it.
      if (path === '/reveal') {
        const date = String(url.searchParams.get('date') || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError('Pick a real dive date.', 400);
        const upstream = await fetch(REFERENCE + 'reveal?date=' + encodeURIComponent(date), {
          headers: { 'User-Agent': USER_AGENT }
        });
        if (!upstream.body) throw new HttpError('The answer sheet is temporarily unavailable.', 503);
        if (!upstream.ok) {
          return new Response(await upstream.text(), {
            status: upstream.status,
            headers: { ...CORS, 'Content-Type': 'application/json' }
          });
        }
        return new Response(upstream.body, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
            // The sheet cannot change during the day, so a replay is free.
            'Cache-Control': 'private, max-age=300'
          }
        });
      }
      if (path === '/health') return reply({ ok: true, rounds: ROUNDS });
      if (path === '/party/rooms') return reply({ rooms: [], seats: [] });
      if (path === '/state') {
        const run = await readRun(url.searchParams.get('run') || '');
        if (!run) throw new HttpError('Dive not found on this browser.', 404);
        return reply(stateFor(run));
      }
      if (path === '/population') {
        const run = await readRun(url.searchParams.get('run') || '');
        if (!run?.completed) throw new HttpError('Finish your dive before opening the sounding.', 403);
        return reply(run.mode === 'daily'
          ? dailyComparison(run, await dailyScores(run.date))
          : { population: 0, betterThan: null, dist: Array(71).fill(0) });
      }
      if (path === '/leaderboard') {
        const run = await readRun(url.searchParams.get('run') || '');
        if (!run?.completed) throw new HttpError('Finish your dive before opening the board.', 403);
        return reply(run.mode === 'daily'
          ? dailyBoard(run, await dailyScores(run.date))
          : { date: run.date, total: 0, top: [], yourRank: null, yourScore: runScore(run.results), beaten: 0 });
      }
      throw new HttpError('Unknown endpoint.', 404);
    }

    if (req.method !== 'POST') throw new HttpError('Use GET or POST.', 405);
    const body = await readJson(req);

    if (path === '/start') {
      if (body.archive || body.pack || body.unlimited) throw new HttpError('Only the daily dive is available in Bored.', 400);
      const day = await loadToday();
      const mode = body.practice === true ? 'practice' : 'daily';
      // Unlimited replays the day's own prompts, shuffled: past days' answer
      // sheets are not public, so there is no archive to draw from.
      const prompts = mode === 'practice' ? shuffle(day.prompts) : day.prompts;
      const requestedId = body.runId;
      if (requestedId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestedId))) throw new HttpError('Invalid dive ID.', 400);
      if (requestedId) {
        const existing = await readRun(String(requestedId));
        if (existing) {
          if (existing.mode !== mode || existing.date !== day.date) throw new HttpError('This dive belongs to another day.', 409);
          return reply(stateFor(existing));
        }
      }
      const run = await createRun(mode, day, prompts, requestedId ? String(requestedId) : undefined);
      return reply(stateFor(run));
    }

    if (path === '/answer') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      const prompts = Array.isArray(run.prompts) ? run.prompts : [];
      const round = Number(body.round);
      if (!Number.isInteger(round) || round < 0 || round >= prompts.length) throw new HttpError('Invalid round.', 400);
      if (run.completed || run.round_start == null || round !== Number(run.round)) {
        return reply({ state: stateFor(run), alreadyScored: true });
      }
      const windowStart = Number(run.round_start);
      // Time spent matching in the browser must not count against the player.
      const timely = receivedAt <= windowStart + ROUND_MS + ANSWER_GRACE_MS;
      const raw = String(body.answer ?? '').trim().slice(0, 256);
      const scored = timely ? cleanResult(body.result) : null;
      const result: AnswerResult = {
        round,
        rawAnswer: raw || null,
        answer: scored?.answer ?? null,
        tier: scored?.tier ?? null,
        score: scored ? TIERS[scored.tier].score : 0,
        quip: scored?.quip ?? null,
        promptText: String(prompts[round]?.text || '')
      };
      const results = [...run.results.filter(entry => entry.round !== round), result].sort((a, b) => a.round - b.round);
      // An earlier request might have committed after the browser timed out.
      // Conditional scoring prevents a late retry from overwriting that result.
      const response = await sb('krillion_runs?id=eq.' + encodeURIComponent(run.id) + '&round=eq.' + round + '&completed=eq.false', {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ round: round + 1, round_start: null, completed: round + 1 >= prompts.length, results })
      });
      if (!response.ok) throw new HttpError('The answer could not be saved. Retry this round.', 503);
      const rows = await response.json();
      if (!rows?.[0]) {
        const current = await readRun(run.id);
        if (!current) throw new HttpError('Dive not found.', 404);
        return reply({ state: stateFor(current), alreadyScored: true });
      }
      const updated = rows[0] as Run;
      if (updated.completed) dailyCache = null;
      return reply({ result, state: stateFor(updated) });
    }

    if (path === '/next') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      const updated = !run.completed && run.round_start == null
        ? await updateRun(run.id, { round_start: Date.now() + PREVIEW_MS })
        : run;
      return reply(stateFor(updated));
    }

    if (path === '/pause') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      let updated = run;
      if (body.paused === true && !run.completed && run.round_start != null && !run.paused_at && Date.now() <= Number(run.round_start) + ROUND_MS) {
        updated = await updateRun(run.id, { paused_at: Date.now() });
      } else if (body.paused === false && run.paused_at) {
        const delta = Date.now() - Number(run.paused_at);
        updated = await updateRun(run.id, { round_start: Number(run.round_start) + delta, paused_at: null });
      }
      return reply(stateFor(updated));
    }

    if (path === '/hint') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      if (run.completed) throw new HttpError('This dive is over.', 409);
      if (run.hint_used) throw new HttpError('That hint is already spent for this dive.', 409);
      const updated = await updateRun(run.id, { hint_used: true });
      return reply({ used: true, state: stateFor(updated) });
    }

    if (path === '/feedback') return reply({ ok: true });
    throw new HttpError('Unknown endpoint.', 404);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    console.error('krillion:', error instanceof Error ? error.message : String(error));
    return reply({
      error: status >= 500 ? 'Krillion is between dives. Try again shortly.' : (error instanceof Error ? error.message : 'Request failed.')
    }, status);
  }
});

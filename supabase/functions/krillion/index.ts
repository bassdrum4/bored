// Krillion, served as a Bored Edge Function.
//
// This is the API the original OpenKrillion client expects. The reference site
// has no CORS headers, so the answer book is fetched and cached here, and each
// daily run is kept in Postgres. The client only receives prompts until it has
// finished the dive; answer checks happen on this side.

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

type Answer = { answer: string; tier: string; quip?: string; aliases?: string[] };
type Prompt = { id: string; text: string; answers: Answer[] };
type Book = { date: string; dayNumber: number; source: string; prompts: Prompt[] };
type Match = Answer & { correction: boolean };
type Loaded = { book: Book; stale: boolean };
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
  mode: string;
  round: number;
  round_start: number | string | null;
  paused_at: number | string | null;
  completed: boolean;
  results: AnswerResult[];
  hint_used: boolean;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const REFERENCE = 'https://krillion.io';
const USER_AGENT = 'BoredKrillion/1.0 (+https://bassdrum4.github.io/bored/)';
const ROUND_MS = 25_000;
const PREVIEW_MS = 3_000;
const RUN_COLUMNS = 'id,date,mode,round,round_start,paused_at,completed,results,hint_used';

const normalize = (value: unknown) => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const stripArticle = (value: unknown) => String(value).trim().replace(/^(?:the|a|an)\s+/i, '');
const bare = (value: unknown) => normalize(stripArticle(value));

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

function distance(a: string, b: string, limit = Infinity) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    if (Math.min(...next) > limit) return limit + 1;
    row = next;
  }
  return row[b.length];
}

const QUALIFIER = 16;
const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function numberValue(text: unknown) {
  const key = normalize(stripArticle(String(text)));
  if (/^\d{1,3}$/.test(key)) return Number(key);
  if (key in ONES) return ONES[key];
  const compound = key.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(one|two|three|four|five|six|seven|eight|nine)?$/);
  if (compound) return TENS[compound[1]] + (compound[2] ? ONES[compound[2]] : 0);
  return null;
}

// Mirrors public/rules.mjs in OpenKrillion, including typo, plural, numeric and
// natural-language qualifier matching. Keep the two in step if either changes.
function matchAnswer(input: string, answers: Answer[]): Match | null {
  const key = bare(input);
  if (!key || key.length > 256) return null;
  const commonAliases: Record<string, string[]> = {
    mashedpotatoes: ['mashed', 'mash'],
    frenchfries: ['fries'],
    bakedpotato: ['baked potato', 'jacket potato']
  };
  const entries: { word: string; a: Answer; key: string }[] = answers.flatMap(answer =>
    [answer.answer, ...(answer.aliases || []), ...(commonAliases[bare(answer.answer)] || [])]
      .map(word => ({ word, a: answer, key: bare(word) }))
  );
  const exact = entries.find(entry => entry.key === key);
  if (exact) return { ...exact.a, correction: key !== bare(exact.a.answer) };
  if (key.length > 4 && key.endsWith('s')) {
    const singular = entries.find(entry => entry.key === key.slice(0, -1));
    if (singular) return { ...singular.a, correction: true };
  }
  const numeric = numberValue(input);
  if (numeric !== null) {
    const numericEntry = entries.find(entry => numberValue(entry.key) === numeric);
    if (numericEntry) return { ...numericEntry.a, correction: numericEntry.key !== key };
  }
  const allowance = key.length < 4 ? 0 : key.length < 8 ? 1 : 2;
  const candidates = entries.map(entry => ({ ...entry, d: distance(key, entry.key, allowance) }))
    .filter(entry => entry.d <= allowance)
    .sort((a, b) => a.d - b.d);
  if (candidates.length && (!candidates[1] || candidates[0].d < candidates[1].d || candidates[0].a.answer === candidates[1].a.answer)) {
    return { ...candidates[0].a, correction: true };
  }
  const qualified = entries
    .filter(entry => entry.key.length >= 4 && key.length > entry.key.length && key.length - entry.key.length <= QUALIFIER && key.startsWith(entry.key))
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (qualified && entries.filter(entry => entry.key !== qualified.key && key.startsWith(entry.key)).length === 0) {
    return { ...qualified.a, correction: true };
  }
  return null;
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
  return fetch(SUPABASE_URL + '/rest/v1/' + path, { ...init, headers });
}

async function cachedBook(date: string): Promise<Book | null> {
  const query = 'krillion_books?date=eq.' + encodeURIComponent(date) + '&select=book&limit=1';
  const response = await sb(query);
  if (!response.ok) return null;
  const rows = await response.json();
  const value = rows?.[0]?.book;
  if (!value) return null;
  return (typeof value === 'string' ? JSON.parse(value) : value) as Book;
}

async function latestBook(): Promise<Book | null> {
  const response = await sb('krillion_books?select=book&order=fetched_at.desc&limit=1');
  if (!response.ok) return null;
  const rows = await response.json();
  const value = rows?.[0]?.book;
  if (!value) return null;
  return (typeof value === 'string' ? JSON.parse(value) : value) as Book;
}

async function storeBook(book: Book) {
  const response = await sb('krillion_books?on_conflict=date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      date: book.date,
      day_number: book.dayNumber,
      source: book.source,
      book
    }])
  });
  if (!response.ok) throw new Error('Cache write failed with HTTP ' + response.status + '.');
}

function validateReference(today: any, reveal: any, date: string): Book {
  if (today?.date !== date || reveal?.date !== date || today.prompts?.length !== 7 || reveal.prompts?.length !== 7) {
    throw new Error('Reference puzzle date or round count mismatch.');
  }
  return {
    date,
    dayNumber: Number(today.dayNumber) || 0,
    source: 'Reference snapshot from krillion.io',
    prompts: today.prompts.map((prompt: any) => {
      const source = reveal.prompts.find((entry: any) => entry.id === prompt.id && entry.text === prompt.text);
      if (!source?.answers?.length) throw new Error('Missing reference answer set.');
      return {
        id: String(prompt.id),
        text: String(prompt.text),
        answers: source.answers
          .filter((answer: any) => typeof answer.answer === 'string' && TIERS[answer.tier])
          .map((answer: any) => ({
            answer: answer.answer,
            tier: answer.tier,
            ...(answer.quip ? { quip: String(answer.quip) } : {}),
            ...(Array.isArray(answer.aliases) ? { aliases: answer.aliases.filter((alias: unknown) => typeof alias === 'string') } : {})
          }))
      };
    })
  };
}

async function fetchReference(date: string): Promise<Book> {
  const headers = { 'User-Agent': USER_AGENT };
  const [todayResponse, revealResponse] = await Promise.all([
    fetch(REFERENCE + '/api/today', { signal: AbortSignal.timeout(20_000), headers }),
    fetch(REFERENCE + '/api/reveal?date=' + encodeURIComponent(date), { signal: AbortSignal.timeout(20_000), headers })
  ]);
  if (!todayResponse.ok || !revealResponse.ok) throw new Error('Reference service unavailable.');
  return validateReference(await todayResponse.json(), await revealResponse.json(), date);
}

let memo: Loaded | null = null;

async function loadBook(date: string): Promise<Loaded> {
  if (memo && memo.book.date === date) return memo;
  const cached = await cachedBook(date);
  if (cached?.prompts?.length === 7) {
    memo = { book: cached, stale: false };
    return memo;
  }
  try {
    const fresh = await fetchReference(date);
    try {
      await storeBook(fresh);
    } catch (error) {
      console.warn('Krillion cache write unavailable:', error instanceof Error ? error.message : String(error));
    }
    memo = { book: fresh, stale: false };
    return memo;
  } catch (error) {
    const latest = await latestBook();
    if (latest?.prompts?.length === 7) {
      memo = { book: latest, stale: true };
      return memo;
    }
    throw error;
  }
}

const publicBook = (loaded: Loaded) => ({
  date: loaded.book.date,
  dayNumber: loaded.book.dayNumber,
  sample: false,
  prompts: loaded.book.prompts.map(prompt => ({ id: prompt.id, text: prompt.text })),
  resetsAt: resetAt(loaded.book.date),
  source: loaded.book.source,
  stale: loaded.stale
});

async function readRun(id: string): Promise<Run | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return null;
  const response = await sb('krillion_runs?id=eq.' + encodeURIComponent(id) + '&select=' + RUN_COLUMNS + '&limit=1');
  if (!response.ok) return null;
  const rows = await response.json();
  return (rows?.[0] || null) as Run | null;
}

async function createRun(mode: string, book: Book): Promise<Run> {
  const row = {
    id: crypto.randomUUID(),
    date: book.date,
    mode,
    round: 0,
    round_start: Date.now() + PREVIEW_MS,
    paused_at: null,
    completed: false,
    results: [],
    hint_used: false
  };
  const response = await sb('krillion_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  if (!response.ok) throw new HttpError('The dive could not start. Try again shortly.', 503);
  const rows = await response.json();
  return rows[0] as Run;
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
  return rows[0] as Run;
}

function stateFor(run: Run, book: Book) {
  const results = Array.isArray(run.results) ? run.results : [];
  return {
    ...publicBook({ book, stale: false }),
    runId: run.id,
    mode: run.mode,
    round: Number(run.round),
    roundStart: run.round_start == null ? null : Number(run.round_start),
    pausedAt: run.paused_at == null ? null : Number(run.paused_at),
    serverNow: Date.now(),
    completed: !!run.completed,
    results,
    score: results.reduce((total, result) => total + Number(result.score || 0), 0),
    hintUsed: !!run.hint_used
  };
}

const runPath = (url: URL) => (url.pathname.replace(/^.*\/krillion/, '').replace(/^\/api/, '') || '/').replace(/\/+$/, '') || '/';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    const path = runPath(url);

    if (req.method === 'GET') {
      if (path === '/' || path === '/today') {
        return reply(publicBook(await loadBook(etDate())));
      }
      if (path === '/health') return reply({ ok: true, rounds: 7 });
      if (path === '/party/rooms') return reply({ rooms: [], seats: [] });
      if (path === '/state') {
        const run = await readRun(url.searchParams.get('run') || '');
        if (!run) throw new HttpError('Dive not found on this browser.', 404);
        const loaded = await loadBook(run.date);
        return reply(stateFor(run, loaded.book));
      }
      if (path === '/review') {
        const run = await readRun(url.searchParams.get('run') || '');
        if (!run?.completed) throw new HttpError('Finish your dive before opening the answer sheet.', 403);
        const loaded = await loadBook(run.date);
        return reply({
          prompts: loaded.book.prompts.map(prompt => ({
            id: prompt.id,
            text: prompt.text,
            answers: prompt.answers
              .slice()
              .sort((a, b) => TIERS[b.tier].score - TIERS[a.tier].score || a.answer.localeCompare(b.answer))
              .map(answer => ({ ...answer, score: TIERS[answer.tier].score }))
          })),
          population: 0,
          betterThan: null,
          dist: Array(71).fill(0)
        });
      }
      if (path === '/leaderboard') {
        const run = await readRun(url.searchParams.get('run') || '');
        if (!run?.completed) throw new HttpError('Finish your dive before opening the board.', 403);
        return reply({ date: run.date, total: 0, top: [], yourRank: null, yourScore: null, beaten: 0 });
      }
      throw new HttpError('Unknown endpoint.', 404);
    }

    if (req.method !== 'POST') throw new HttpError('Use GET or POST.', 405);
    const body = await readJson(req);

    if (path === '/start') {
      if (body.archive || body.pack || body.unlimited) throw new HttpError('Only the daily dive is available in Bored.', 400);
      const loaded = await loadBook(etDate());
      const run = await createRun(body.practice === true ? 'practice' : 'daily', loaded.book);
      return reply(stateFor(run, loaded.book));
    }

    if (path === '/answer') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      const loaded = await loadBook(run.date);
      const book = loaded.book;
      const round = Number(body.round);
      if (!Number.isInteger(round) || round < 0 || round >= book.prompts.length) throw new HttpError('Invalid round.', 400);
      if (run.completed || run.round_start == null || round !== Number(run.round)) {
        return reply({ state: stateFor(run, book), alreadyScored: true });
      }
      const windowStart = Number(run.round_start);
      const late = Date.now() > windowStart + ROUND_MS;
      const timely = !late || (body.timeout === true && Date.now() <= windowStart + ROUND_MS + 1_500);
      const raw = String(body.answer ?? '').trim().slice(0, 256);
      const prompt = book.prompts[round];
      const match = raw && timely ? matchAnswer(raw, prompt.answers) : null;
      if (!match && raw && !late && !body.timeout) {
        return reply({ rejected: true, message: `“${raw}”: no echo. try again` });
      }
      if (match?.correction && body.confirm !== true && !late && !body.timeout && body.previewCorrection !== false) {
        return reply({ correction: match.answer, original: raw });
      }
      const result: AnswerResult = {
        round,
        rawAnswer: raw || null,
        answer: match?.answer || null,
        tier: match?.tier || null,
        score: match ? TIERS[match.tier].score : 0,
        quip: match?.quip || null,
        promptText: prompt.text
      };
      const results = [...run.results.filter(entry => entry.round !== round), result].sort((a, b) => a.round - b.round);
      const updated = await updateRun(run.id, {
        round: round + 1,
        round_start: null,
        completed: round + 1 >= book.prompts.length,
        results
      });
      return reply({ result, state: stateFor(updated, book) });
    }

    if (path === '/next') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      const loaded = await loadBook(run.date);
      const updated = !run.completed && run.round_start == null
        ? await updateRun(run.id, { round_start: Date.now() + PREVIEW_MS })
        : run;
      return reply(stateFor(updated, loaded.book));
    }

    if (path === '/pause') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      const loaded = await loadBook(run.date);
      let updated = run;
      if (body.paused === true && !run.completed && run.round_start != null && !run.paused_at && Date.now() <= Number(run.round_start) + ROUND_MS) {
        updated = await updateRun(run.id, { paused_at: Date.now() });
      } else if (body.paused === false && run.paused_at) {
        const delta = Date.now() - Number(run.paused_at);
        updated = await updateRun(run.id, { round_start: Number(run.round_start) + delta, paused_at: null });
      }
      return reply(stateFor(updated, loaded.book));
    }

    if (path === '/hint') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      if (run.completed) throw new HttpError('This dive is over.', 409);
      if (run.hint_used) throw new HttpError('That hint is already spent for today.', 409);
      const loaded = await loadBook(run.date);
      const prompt = loaded.book.prompts[Number(run.round)];
      if (!prompt) throw new HttpError('This dive is over.', 409);
      const gem = prompt.answers.find(answer => answer.tier === 'krillion') || prompt.answers[prompt.answers.length - 1];
      await updateRun(run.id, { hint_used: true });
      return reply({
        used: true,
        hint: `${prompt.answers.length} answers land here. The deepest one starts with “${gem.answer[0].toUpperCase()}”.`
      });
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

// Krillion, served as a Bored Edge Function.
//
// This is the API the original OpenKrillion client expects. The reference site
// has no CORS headers, so the answer book is fetched and cached here, and each
// run, daily or unlimited, is kept in Postgres. The client only receives prompts until it has
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
type Prompt = { id: string; text: string };
type Book = { date: string; dayNumber: number; source: string; title?: string; prompts: Prompt[] };
type StoredBook = Book & { prompts: (Prompt & { answers?: Answer[] })[] };
type PickedPrompt = { id: string; text: string; date: string };
type Match = Answer & { correction: boolean };
type Loaded = { book: Book; stale: boolean };
type BankRow = {
  date: string;
  prompt_id: string;
  key: string;
  answer: string;
  tier: string;
  quip: string | null;
  num: number | null;
  own: boolean;
  ord: number;
};
type RevealIndex = { prompts: string[]; starts: Int32Array; ends: Int32Array; prompt: Int32Array };
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
  prompts?: PickedPrompt[];
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const REFERENCE = 'https://krillion.io';
const USER_AGENT = 'BoredKrillion/1.0 (+https://bassdrum4.github.io/bored/)';
const ROUND_MS = 25_000;
const PREVIEW_MS = 3_000;
const RUN_COLUMNS = 'id,date,mode,round,round_start,paused_at,completed,results,hint_used,prompts';
const ARCHIVE_TITLE = 'The Open Water';

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

const COMMON_ALIASES: Record<string, string[]> = {
  mashedpotatoes: ['mashed', 'mash'],
  frenchfries: ['fries'],
  bakedpotato: ['baked potato', 'jacket potato']
};
// A plain object also answers for its prototype, so an answer named
// "Constructor" would read Object.prototype.constructor — not iterable.
const commonFor = (word: string) => Object.hasOwn(COMMON_ALIASES, word) ? COMMON_ALIASES[word] : [];
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
function matchFromRow(row: any): Match | null {
  if (!row || typeof row.answer !== 'string' || !TIERS[row.tier]) return null;
  return {
    answer: row.answer,
    tier: row.tier,
    ...(typeof row.quip === 'string' && row.quip ? { quip: row.quip } : {}),
    correction: row.correction === true
  };
}

// The spelling rules live next to the bank in Postgres: a big day's round holds
// a couple of hundred thousand keys, which is more than this runtime will hold
// as objects.
async function matchStored(date: string, promptId: string, input: string): Promise<Match | null> {
  const key = bare(input);
  if (!key || key.length > 256) return null;
  const allowance = key.length < 4 ? 0 : key.length < 8 ? 1 : 2;
  const response = await sb('rpc/krillion_match_answer', {
    method: 'POST',
    body: JSON.stringify({
      p_date: date,
      p_prompt: promptId,
      p_key: key,
      p_num: numberValue(input),
      p_allowance: allowance
    })
  });
  if (!response.ok) throw new HttpError('The answer could not be checked. Retry this round.', 503);
  return matchFromRow(await response.json());
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
  const safe = !init.method || init.method === 'GET' || path.startsWith('krillion_books?on_conflict=date') || path === 'krillion_runs?on_conflict=id';
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

async function cachedBook(date: string): Promise<StoredBook | null> {
  const query = 'krillion_books?date=eq.' + encodeURIComponent(date) + '&select=book&limit=1';
  const response = await sb(query);
  if (!response.ok) throw new HttpError('The puzzle cache is temporarily unavailable.', 503);
  const rows = await response.json();
  const value = rows?.[0]?.book;
  if (!value) return null;
  return (typeof value === 'string' ? JSON.parse(value) : value) as StoredBook;
}

async function latestBook(): Promise<StoredBook | null> {
  const response = await sb('krillion_books?select=book&order=fetched_at.desc&limit=1');
  if (!response.ok) return null;
  const rows = await response.json();
  const value = rows?.[0]?.book;
  if (!value) return null;
  return (typeof value === 'string' ? JSON.parse(value) : value) as StoredBook;
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

async function callBank<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await sb('rpc/' + name, { method: 'POST', body: JSON.stringify(args) });
  if (!response.ok) throw new Error('Answer bank call ' + name + ' failed with HTTP ' + response.status + '.');
  return await response.json() as T;
}

const ANSWER_BATCH = 4_000;

// Every spelling a round accepts: its own name, its aliases, and the handful of
// common short forms the original client hard-coded.
function bankRows(date: string, promptId: string, answer: any, nextOrd: () => number): BankRow[] {
  const tier = String(answer?.tier || '');
  const label = typeof answer?.answer === 'string' ? answer.answer.trim() : '';
  if (!label || !TIERS[tier]) return [];
  const ownKey = bare(label);
  const words = [label, ...(Array.isArray(answer.aliases) ? answer.aliases : []), ...commonFor(ownKey)];
  const rows: BankRow[] = [];
  for (const word of words) {
    if (typeof word !== 'string') continue;
    const key = bare(word);
    if (!key) continue;
    rows.push({
      date,
      prompt_id: promptId,
      key,
      answer: label,
      tier,
      quip: typeof answer.quip === 'string' && answer.quip ? answer.quip : null,
      num: numberValue(key),
      own: key === ownKey,
      ord: nextOrd()
    });
  }
  return rows;
}

async function writeBank(rows: BankRow[]) {
  if (!rows.length) return;
  const response = await sb('krillion_answer_keys?on_conflict=date,prompt_id,key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error('Cache write failed with HTTP ' + response.status + '.');
}

async function clearBank(date: string) {
  const response = await sb('rpc/krillion_clear_bank', { method: 'POST', body: JSON.stringify({ p_date: date }) });
  if (!response.ok) throw new Error('The answer bank could not be cleared.');
}

async function bankMissing(date: string) {
  const response = await sb('krillion_answer_keys?date=eq.' + encodeURIComponent(date) + '&select=prompt_id&limit=1');
  if (!response.ok) throw new HttpError('The answer bank is temporarily unavailable.', 503);
  const rows = await response.json();
  return !(Array.isArray(rows) && rows.length);
}

async function fetchToday(date: string): Promise<{ dayNumber: number; prompts: Prompt[] }> {
  const response = await fetch(REFERENCE + '/api/today',
    { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error('Reference service unavailable.');
  const today = await response.json();
  const prompts = Array.isArray(today?.prompts) ? today.prompts : [];
  if (today?.date !== date || prompts.length !== 7) throw new Error('Reference puzzle date or round count mismatch.');
  return {
    dayNumber: Number(today.dayNumber) || 0,
    prompts: prompts.map((prompt: any) => ({ id: String(prompt.id), text: String(prompt.text) }))
  };
}

async function fetchReveal(date: string): Promise<string> {
  // A big day's reveal is 33 MB and takes the reference site a couple of
  // seconds, so this hop is given more room than a database read.
  const response = await fetch(REFERENCE + '/api/reveal?date=' + encodeURIComponent(date),
    { signal: AbortSignal.timeout(90_000), headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error('Reference service unavailable.');
  return await response.text();
}

function objectEnd(text: string, start: number) {
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === 92) escaped = true;
      else if (ch === 34) inString = false;
      continue;
    }
    if (ch === 34) inString = true;
    else if (ch === 123 || ch === 91) depth += 1;
    else if (ch === 125 || ch === 93) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('Reference answer is unterminated.');
}

// The reveal is one JSON document of 350k answers. Parsing it whole is more
// object graph than the runtime holds, so the text is walked once to find where
// each answer object starts and ends, and each one is parsed on its own.
function indexReveal(text: string): RevealIndex {
  const prompts: string[] = [];
  const starts: number[] = [], ends: number[] = [], owner: number[] = [];
  let depth = 0, inString = false, escaped = false;
  let promptsDepth = 0, promptDepth = 0, answersDepth = 0, current = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === 92) escaped = true;
      else if (ch === 34) inString = false;
      continue;
    }
    if (ch === 34) { inString = true; continue; }
    if (ch === 123) {
      if (answersDepth && depth === answersDepth) {
        const end = objectEnd(text, i);
        starts.push(i);
        ends.push(end);
        owner.push(current);
        i = end;
        continue;
      }
      if (promptsDepth && depth === promptsDepth) {
        promptDepth = depth + 1;
        const id = /^\{"id":"([^"]{1,64})"/.exec(text.slice(i, i + 600));
        prompts.push(id ? id[1] : '');
        current = prompts.length - 1;
      }
      depth += 1;
      continue;
    }
    if (ch === 91) {
      depth += 1;
      const tail = text.slice(Math.max(0, i - 11), i + 1);
      if (tail.endsWith('"prompts":[')) promptsDepth = depth;
      else if (promptDepth && depth === promptDepth + 1 && tail.endsWith('"answers":[')) answersDepth = depth;
      continue;
    }
    if (ch === 125 || ch === 93) {
      if (answersDepth && depth === answersDepth) answersDepth = 0;
      if (promptDepth && depth === promptDepth) promptDepth = 0;
      if (promptsDepth && depth === promptsDepth) promptsDepth = 0;
      depth -= 1;
    }
  }
  return { prompts, starts: Int32Array.from(starts), ends: Int32Array.from(ends), prompt: Int32Array.from(owner) };
}

async function ingestReference(date: string): Promise<Book> {
  const [today, text] = await Promise.all([fetchToday(date), fetchReveal(date)]);
  const index = indexReveal(text);
  const wanted = new Map(today.prompts.map((prompt, position) => [prompt.id, position]));
  const seen = new Set(index.prompts.filter(id => wanted.has(id)));
  if (seen.size !== 7) throw new Error('Reference prompt set mismatch.');
  await clearBank(date);
  let ord = 0;
  const filled = new Set<string>();
  const nextOrd = () => ord++;
  for (let at = 0; at < index.starts.length; at += ANSWER_BATCH) {
    const rows: BankRow[] = [];
    for (let i = at; i < Math.min(at + ANSWER_BATCH, index.starts.length); i++) {
      let answer: any;
      try { answer = JSON.parse(text.slice(index.starts[i], index.ends[i] + 1)); } catch { continue; }
      const promptId = index.prompts[index.prompt[i]];
      const filledRows = bankRows(date, promptId, answer, nextOrd);
      if (filledRows.length) filled.add(promptId);
      rows.push(...filledRows);
    }
    await writeBank(rows);
  }
  if (filled.size !== 7) throw new Error('Reference answer set is incomplete.');
  return {
    date,
    dayNumber: today.dayNumber,
    source: 'Reference snapshot from krillion.io',
    prompts: today.prompts
  };
}

// Days cached before the bank existed still carry their answers inside the
// stored book. Their rows are written once, on the first dive that asks for
// them, and the book is then kept as prompts only.
async function ensureBank(date: string, cached: StoredBook): Promise<Book> {
  const book: Book = {
    date: String(cached.date || date),
    dayNumber: Number(cached.dayNumber) || 0,
    source: String(cached.source || ''),
    ...(cached.title ? { title: String(cached.title) } : {}),
    prompts: (cached.prompts || []).map(prompt => ({ id: String(prompt.id), text: String(prompt.text) }))
  };
  if (!(await bankMissing(date))) return book;
  const legacy = (cached.prompts || []).some(prompt => Array.isArray(prompt.answers) && prompt.answers.length);
  if (!legacy) return book;
  await clearBank(date);
  let ord = 0;
  const nextOrd = () => ord++;
  let rows: BankRow[] = [];
  for (const prompt of cached.prompts || []) {
    for (const answer of Array.isArray(prompt?.answers) ? prompt.answers : []) {
      rows.push(...bankRows(date, String(prompt.id), answer, nextOrd));
      if (rows.length >= ANSWER_BATCH) { await writeBank(rows); rows = []; }
    }
  }
  await writeBank(rows);
  await storeBook(book);
  return book;
}

// Per-isolate cache keyed by requested date. Archive play can span several dates.
const books = new Map<string, { loaded: Loaded; until: number }>();
const loadingBooks = new Map<string, Promise<Loaded>>();
async function loadBook(date: string): Promise<Loaded> {
  const hit = books.get(date);
  if (hit && Date.now() < hit.until) return hit.loaded;
  const inflight = loadingBooks.get(date);
  if (inflight) return inflight;
  const job = (async (): Promise<Loaded> => {
    const cached = await cachedBook(date);
    let loaded: Loaded;
    if (cached?.prompts?.length === 7) {
      loaded = { book: await ensureBank(date, cached), stale: false };
    } else {
      try {
        const fresh = await ingestReference(date);
        // Never start a ranked run against a book that was not durably saved.
        await storeBook(fresh);
        loaded = { book: fresh, stale: false };
      } catch (error) {
        const latest = await latestBook();
        if (!latest?.prompts?.length) throw error;
        loaded = { book: await ensureBank(String(latest.date || ''), latest), stale: true };
      }
    }
    // Do not pin an older fallback book as today's puzzle. Retry that shortly.
    books.set(date, { loaded, until: Date.now() + (loaded.stale ? 30_000 : 6 * 60 * 60_000) });
    if (books.size > 20) books.delete(books.keys().next().value!);
    return loaded;
  })();
  loadingBooks.set(date, job);
  try { return await job; }
  finally { loadingBooks.delete(date); }
}

const publicBook = (loaded: Loaded) => ({
  date: loaded.book.date,
  dayNumber: loaded.book.dayNumber,
  ...(loaded.book.title ? { title: loaded.book.title } : {}),
  sample: false,
  prompts: loaded.book.prompts.map(prompt => ({ id: prompt.id, text: prompt.text })),
  resetsAt: resetAt(loaded.book.date),
  source: loaded.book.source,
  stale: loaded.stale
});

// A practice dive keeps only the identity of the prompts it drew, so the answer
// book for those prompts stays in Postgres and is scored here like the daily's.
async function bookForRun(run: Run): Promise<Book> {
  const picked = Array.isArray(run.prompts)
    ? run.prompts.filter(entry => entry && typeof entry.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date)))
    : [];
  if (picked.length !== 7) {
    const loaded = await loadBook(run.date);
    if (loaded.stale || loaded.book.date !== run.date) throw new HttpError('The dive book is temporarily unavailable.', 503);
    return loaded.book;
  }
  const books = new Map<string, Book>();
  await Promise.all([...new Set(picked.map(entry => entry.date))].map(async date => {
    const loaded = await loadBook(date);
    if (loaded.stale || loaded.book.date !== date) throw new HttpError('The archive book is temporarily unavailable.', 503);
    books.set(date, loaded.book);
  }));
  return {
    date: run.date,
    dayNumber: 0,
    source: 'Archive dive',
    title: ARCHIVE_TITLE,
    prompts: picked.map(entry => {
      const prompt = books.get(entry.date)?.prompts.find(candidate => candidate.id === entry.id);
      if (!prompt) throw new HttpError('This dive lost its prompts. Start a new one.', 503);
      return prompt;
    })
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

async function createRun(mode: string, book: Book, prompts: PickedPrompt[] = [], id = crypto.randomUUID()): Promise<Run> {
  const row = {
    id,
    date: book.date,
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
  if (!run || run.mode !== mode || run.date !== book.date) throw new HttpError('Dive could not be recovered.', 409);
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
  const receivedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    const path = runPath(url);

    if (req.method === 'GET') {
      if (path === '/' || path === '/today') {
        const date = etDate(receivedAt);
        const loaded = await loadBook(date);
        if (loaded.stale || loaded.book.date !== date) throw new HttpError('Today’s dive is temporarily unavailable.', 503);
        return reply(publicBook(loaded));
      }
      if (path === '/health') return reply({ ok: true, rounds: 7 });
      if (path === '/party/rooms') return reply({ rooms: [], seats: [] });
      if (path === '/state') {
        const run = await readRun(url.searchParams.get('run') || '');
        if (!run) throw new HttpError('Dive not found on this browser.', 404);
        return reply(stateFor(run, await bookForRun(run)));
      }
      if (path === '/review') {
        const run = await readRun(url.searchParams.get('run') || '');
        if (!run?.completed) throw new HttpError('Finish your dive before opening the answer sheet.', 403);
        const book = await bookForRun(run);
        const comparison = run.mode === 'daily'
          ? dailyComparison(run, await dailyScores(run.date))
          : { population: 0, betterThan: null, dist: Array(71).fill(0) };
        // A round can hold 195k answers; the sheet shows the deepest page of
        // them and says how many landed in total.
        const sheets = await Promise.all(book.prompts.map(prompt =>
          callBank<{ total: number; answers: { answer: string; tier: string; quip: string | null; score: number }[] }>(
            'krillion_review', { p_date: book.date, p_prompt: prompt.id, p_limit: 200 }).catch(() => ({ total: 0, answers: [] }))));
        return reply({
          prompts: book.prompts.map((prompt, index) => ({
            id: prompt.id,
            text: prompt.text,
            total: sheets[index]?.total ?? 0,
            answers: sheets[index]?.answers ?? []
          })),
          ...comparison
        });
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
      if (body.practice === true) {
        // Unlimited: seven prompts picked at random from past dives. The run is
        // stored like a daily dive, but against the days those prompts came from.
        const response = await sb('rpc/krillion_random_prompts', {
          method: 'POST',
          body: JSON.stringify({ p_count: 7 })
        });
        if (!response.ok) throw new HttpError('The archive is out of reach. Try again shortly.', 503);
        const prompts = await response.json();
        if (!Array.isArray(prompts) || prompts.length !== 7) throw new HttpError('The archive is out of reach. Try again shortly.', 503);
        const run = await createRun('practice', { date: etDate(), dayNumber: 0, source: 'Archive dive', title: ARCHIVE_TITLE, prompts: [] }, prompts);
        return reply(stateFor(run, await bookForRun(run)));
      }
      const date = etDate(receivedAt);
      const requestedId = body.runId;
      if (requestedId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestedId))) throw new HttpError('Invalid dive ID.', 400);
      if (requestedId) {
        const existing = await readRun(String(requestedId));
        if (existing) {
          if (existing.mode !== 'daily' || existing.date !== date) throw new HttpError('This dive belongs to another day.', 409);
          return reply(stateFor(existing, await bookForRun(existing)));
        }
      }
      const loaded = await loadBook(date);
      if (loaded.stale || loaded.book.date !== date) throw new HttpError('Today’s dive is temporarily unavailable.', 503);
      const run = await createRun('daily', loaded.book, [], requestedId ? String(requestedId) : undefined);
      return reply(stateFor(run, loaded.book));
    }

    if (path === '/answer') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      const book = await bookForRun(run);
      const round = Number(body.round);
      if (!Number.isInteger(round) || round < 0 || round >= book.prompts.length) throw new HttpError('Invalid round.', 400);
      if (run.completed || run.round_start == null || round !== Number(run.round)) {
        return reply({ state: stateFor(run, book), alreadyScored: true });
      }
      const windowStart = Number(run.round_start);
      // Time spent inside this function (including database reads) must not
      // count against the player. Keep a small, server-measured network grace.
      const late = receivedAt > windowStart + ROUND_MS;
      const timely = receivedAt <= windowStart + ROUND_MS + 1_500;
      const raw = String(body.answer ?? '').trim().slice(0, 256);
      const prompt = book.prompts[round];
      const match = raw && timely ? await matchStored(book.date, prompt.id, raw) : null;
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
      // An earlier request might have committed after the browser timed out.
      // Conditional scoring prevents a late retry from overwriting that result.
      const response = await sb('krillion_runs?id=eq.' + encodeURIComponent(run.id) + '&round=eq.' + round + '&completed=eq.false', {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ round: round + 1, round_start: null, completed: round + 1 >= book.prompts.length, results })
      });
      if (!response.ok) throw new HttpError('The answer could not be saved. Retry this round.', 503);
      const rows = await response.json();
      if (!rows?.[0]) {
        const current = await readRun(run.id);
        if (!current) throw new HttpError('Dive not found.', 404);
        return reply({ state: stateFor(current, book), alreadyScored: true });
      }
      const updated = rows[0] as Run;
      if (updated.completed) dailyCache = null;
      return reply({ result, state: stateFor(updated, book) });
    }

    if (path === '/next') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      const book = await bookForRun(run);
      const updated = !run.completed && run.round_start == null
        ? await updateRun(run.id, { round_start: Date.now() + PREVIEW_MS })
        : run;
      return reply(stateFor(updated, book));
    }

    if (path === '/pause') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      const book = await bookForRun(run);
      let updated = run;
      if (body.paused === true && !run.completed && run.round_start != null && !run.paused_at && Date.now() <= Number(run.round_start) + ROUND_MS) {
        updated = await updateRun(run.id, { paused_at: Date.now() });
      } else if (body.paused === false && run.paused_at) {
        const delta = Date.now() - Number(run.paused_at);
        updated = await updateRun(run.id, { round_start: Number(run.round_start) + delta, paused_at: null });
      }
      return reply(stateFor(updated, book));
    }

    if (path === '/hint') {
      const run = await readRun(String(body.runId || ''));
      if (!run) throw new HttpError('Dive not found.', 404);
      if (run.completed) throw new HttpError('This dive is over.', 409);
      if (run.hint_used) throw new HttpError('That hint is already spent for this dive.', 409);
      const book = await bookForRun(run);
      const prompt = book.prompts[Number(run.round)];
      if (!prompt) throw new HttpError('This dive is over.', 409);
      const sheet = await callBank<{ count: number; deepest: string | null }>('krillion_hint',
        { p_date: book.date, p_prompt: prompt.id });
      if (!sheet?.count || !sheet.deepest) throw new HttpError('This dive is over.', 409);
      await updateRun(run.id, { hint_used: true });
      return reply({
        used: true,
        hint: `${sheet.count} answers land here. The deepest one starts with “${String(sheet.deepest)[0].toUpperCase()}”.`
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

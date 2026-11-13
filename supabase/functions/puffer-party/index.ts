// Puffer Party, backed by Supabase.
//
// Room state lives in one JSONB snapshot so a move is one revision-guarded
// write. Clients act over HTTP and only use Realtime for presence and a
// "revision changed" nudge; no client can invent a turn, a heart or an answer.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-party-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ROUNDS = 7;
const START_LIVES = 2;
const MAX_LIVES = 5;
const HEART_METER = 600;
// The host can retune the heart meter: 50-point steps, six hundred by default.
const METER_MIN = 300;
const METER_MAX = 5000;
const METER_STEP = 50;
const FUSE_MIN = 10_000;
const FUSE_MAX = 30_000;
// The host picks the fuse floor (MIN. TURN) and the starting hearts (LIVES) in
// the room lobby; every read clamps them back into these bounds.
const LIVES_MIN = 1;
const MIN_TURN_MIN = 3;
const MIN_TURN_MAX = 30;
const MIN_TURN_DEFAULT = 8;
const FREEZE_MS = 1_500;
const ROOM_TTL = 3 * 60 * 60 * 1000;
const RATING_START = 1200;
const RATING_K = 24;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const SEAT_LIMITS = [2, 3, 6, 10];
const CODE_PATTERN = /^[A-Z]{4}$/;

const TIERS: Record<string, { score: number; name: string }> = {
  plankton: { score: 10, name: 'Plankton' },
  tooclever: { score: 15, name: 'Too Clever' },
  schooler: { score: 30, name: 'Schooler' },
  rare: { score: 60, name: 'Rare' },
  deepcut: { score: 85, name: 'Deep Cut' },
  krillion: { score: 100, name: 'One in a Krillion' }
};

type Answer = { answer: string; tier: string; quip?: string; aliases?: string[] };
type Prompt = { id: string; text: string; answers: Answer[] };
type Book = { date: string; prompts: Prompt[] };
type MeterSeg = { tier: string; amt: number };
type Player = { token: string; seat: number; name: string; lives: number; meter: number; segs?: MeterSeg[]; out: boolean; delta: number };
type UsedAnswer = { round: number; player: string; rawAnswer: string; normalized: string; points: number };
type PartyState = {
  code: string;
  date: string;
  status: 'lobby' | 'playing' | 'finished';
  host: string;
  listed: boolean;
  seats: number;
  lives: number;
  minTurn: number;
  meterTarget?: number;
  rated: boolean;
  round: number;
  promptIndex: number;
  turn: string | null;
  turnDeadline: number | null;
  fuseTotal: number;
  popUntil: number | null;
  winner: string | null;
  revision: number;
  players: Player[];
  used: UsedAnswer[];
  log: string[];
  ratedApplied?: boolean;
};
type Room = { code: string; state: PartyState; status: string; listed: boolean; seats: number; revision: number; updated_at?: string };

const normalize = (value: unknown) => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const stripArticle = (value: unknown) => String(value).trim().replace(/^(?:the|a|an)\s+/i, '');
const bare = (value: unknown) => normalize(stripArticle(value));

const QU = 16;
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

// Mirrors the daily client's tolerance: exact, typo, plural, numeric and a
// natural-language qualifier on a known answer.
function matchAnswer(input: string, answers: Answer[]): Answer | null {
  const key = bare(input);
  if (!key || key.length > 120) return null;
  const commonAliases: Record<string, string[]> = {
    mashedpotatoes: ['mashed', 'mash'],
    frenchfries: ['fries'],
    bakedpotato: ['baked potato', 'jacket potato']
  };
  // A plain object also answers for its prototype, so an answer named
  // "Constructor" would read Object.prototype.constructor — not iterable.
  const commonFor = (word: string) => Object.hasOwn(commonAliases, word) ? commonAliases[word] : [];
  const entries: { word: string; a: Answer; key: string }[] = answers.flatMap(answer =>
    [answer.answer, ...(answer.aliases || []), ...commonFor(bare(answer.answer))]
      .map(word => ({ word, a: answer, key: bare(word) }))
  );
  const exact = entries.find(entry => entry.key === key);
  if (exact) return exact.a;
  if (key.length > 4 && key.endsWith('s')) {
    const singular = entries.find(entry => entry.key === key.slice(0, -1));
    if (singular) return singular.a;
  }
  const numeric = numberValue(input);
  if (numeric !== null) {
    const numericEntry = entries.find(entry => numberValue(entry.key) === numeric);
    if (numericEntry) return numericEntry.a;
  }
  const allowance = key.length < 4 ? 0 : key.length < 8 ? 1 : 2;
  const candidates = entries.map(entry => ({ ...entry, d: distance(key, entry.key, allowance) }))
    .filter(entry => entry.d <= allowance)
    .sort((a, b) => a.d - b.d);
  if (candidates.length && (!candidates[1] || candidates[0].d < candidates[1].d || candidates[0].a.answer === candidates[1].a.answer)) return candidates[0].a;
  const qualified = entries
    .filter(entry => entry.key.length >= 4 && key.length > entry.key.length && key.length - entry.key.length <= QU && key.startsWith(entry.key))
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (qualified && entries.filter(entry => entry.key !== qualified.key && key.startsWith(entry.key)).length === 0) return qualified.a;
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

async function readJson(req: Request, limit = 8_192): Promise<Record<string, any>> {
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

function etDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

async function loadBook(): Promise<Book> {
  const date = etDate();
  let response = await sb('krillion_books?date=eq.' + encodeURIComponent(date) + '&select=book&limit=1');
  let rows = response.ok ? await response.json() : [];
  if (!rows?.[0]?.book) {
    response = await sb('krillion_books?select=book&order=fetched_at.desc&limit=1');
    rows = response.ok ? await response.json() : [];
  }
  const value = rows?.[0]?.book;
  const book = typeof value === 'string' ? JSON.parse(value) : value;
  if (!book?.prompts?.length || book.prompts.length !== ROUNDS) throw new HttpError('Puffer Party is between dives. Try again shortly.', 503);
  return book;
}

const cleanName = (value: unknown, seat: number) => {
  const raw = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const safe = raw.replace(/[<>&"'`\\/\u0000-\u001f]/g, '').slice(0, 16).trim();
  return safe || ['Krill', 'Puffer', 'Squid', 'Manta', 'Blenny', 'Narwhal', 'Otter', 'Crab', 'Guppy', 'Eel'][seat] || `Diver ${seat + 1}`;
};

const cleanToken = (value: unknown) => {
  const token = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{8,80}$/.test(token) ? token : '';
};

const label = (player: Player | null | undefined) => player?.name || 'Diver';
const alive = (players: Player[]) => players.filter(player => !player.out && player.lives > 0);
const fuseLength = () => FUSE_MIN + Math.floor(Math.random() * (FUSE_MAX - FUSE_MIN + 1));
const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
};
// How long a diver must hold the puffer before it can pop on them.
const turnFloor = (state: PartyState) => Math.max(1_000, Math.round(Number(state.minTurn) || MIN_TURN_DEFAULT) * 1000);

function nextTurn(players: Player[], seat: number) {
  const order = alive(players).sort((a, b) => a.seat - b.seat);
  if (!order.length) return { token: null as string | null, wrapped: false };
  const index = order.findIndex(player => player.seat === seat);
  const next = index < 0 ? 0 : (index + 1) % order.length;
  return { token: order[next].token, wrapped: index >= 0 && next === 0 };
}

function promptFor(state: PartyState, book: Book) {
  const index = ((state.promptIndex % book.prompts.length) + book.prompts.length) % book.prompts.length;
  return { ...book.prompts[index], number: index + 1, total: book.prompts.length };
}

function pushLog(state: PartyState, events: string[]) {
  state.log = [...state.log, ...events.map(event => String(event).slice(0, 120))].slice(-40);
}

function settle(state: PartyState) {
  const survivors = alive(state.players);
  state.status = 'finished';
  state.winner = survivors[0]?.token ?? null;
  state.turnDeadline = null;
  state.popUntil = null;
  state.ratedApplied = false;
  pushLog(state, [survivors[0] ? `${label(survivors[0])} floats last!` : 'The room is empty.']);
}

function simulatePops(state: PartyState, book: Book, now: number) {
  let changed = false;
  let guard = 0;
  const events: string[] = [];
  while (state.status === 'playing' && state.turnDeadline != null && now >= state.turnDeadline && guard++ < 20) {
    const current = state.players.find(player => player.token === state.turn && !player.out);
    if (!current) {
      settle(state);
      break;
    }
    current.lives = Math.max(0, current.lives - 1);
    if (current.lives === 0) current.out = true;
    events.push(`POP — ${label(current)} swallowed it and lost a heart.`);
    const step = nextTurn(state.players, current.seat);
    state.turn = step.token ?? state.turn;
    state.fuseTotal = fuseLength();
    state.popUntil = now + FREEZE_MS;
    state.turnDeadline = state.popUntil + state.fuseTotal;
    if (step.wrapped) {
      state.round += 1;
      state.promptIndex = (state.promptIndex + 1) % book.prompts.length;
      state.used = [];
      events.push(`New category: ${promptFor(state, book).text}`);
    }
    const survivors = alive(state.players);
    if (survivors.length <= 1) {
      settle(state);
      break;
    }
    changed = true;
  }
  if (events.length) {
    pushLog(state, events);
    changed = true;
  }
  return changed;
}

async function readRoom(code: string): Promise<Room | null> {
  if (!CODE_PATTERN.test(code || '')) return null;
  const response = await sb('party_rooms?code=eq.' + encodeURIComponent(code) + '&select=code,state,status,listed,seats,revision,updated_at&limit=1');
  if (!response.ok) throw new HttpError('The party board is unavailable.', 503);
  const rows = await response.json();
  const row = rows?.[0];
  if (!row) return null;
  if (typeof row.state === 'string') row.state = JSON.parse(row.state);
  // Rooms created before settings existed get the defaults.
  if (!Number.isFinite(Number(row.state.lives))) row.state.lives = START_LIVES;
  if (!Number.isFinite(Number(row.state.minTurn))) row.state.minTurn = MIN_TURN_DEFAULT;
  return row as Room;
}

async function saveRoom(room: Room, state: PartyState): Promise<Room> {
  state.revision = Number(room.revision) + 1;
  const response = await sb('party_rooms?code=eq.' + encodeURIComponent(room.code) + '&revision=eq.' + Number(room.revision), {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      state,
      status: state.status,
      listed: state.listed,
      seats: state.seats,
      revision: state.revision,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new HttpError('The puffer moved. Re-reading the room…', 409);
  const rows = await response.json();
  if (!rows?.[0]) throw new HttpError('The puffer moved. Re-reading the room…', 409);
  return rows[0] as Room;
}

async function ratingFor(token: string) {
  const response = await sb('party_ratings?token=eq.' + encodeURIComponent(token) + '&select=rating,games&limit=1');
  const rows = response.ok ? await response.json() : [];
  return rows?.[0] ?? { rating: RATING_START, games: 0 };
}

// The seat plate shows every diver's rating, so one query covers the room.
async function ratingsFor(tokens: string[]) {
  const unique = [...new Set(tokens.filter(token => /^[A-Za-z0-9_-]{8,80}$/.test(token || '')))];
  const map = new Map<string, { rating: number; games: number }>();
  if (!unique.length) return map;
  const response = await sb('party_ratings?token=in.(' + unique.join(',') + ')&select=token,rating,games');
  const rows: any[] = response.ok ? await response.json() : [];
  for (const row of rows) map.set(row.token, { rating: Number(row.rating) || RATING_START, games: Number(row.games) || 0 });
  return map;
}

async function applyRatings(state: PartyState) {
  if (!state.rated || !state.winner || state.ratedApplied) return;
  const values = await Promise.all(state.players.map(async player => ({ player, row: await ratingFor(player.token) })));
  const mean = values.reduce((total, entry) => total + Number(entry.row.rating), 0) / Math.max(1, values.length);
  const now = new Date().toISOString();
  for (const { player, row } of values) {
    const own = Number(row.rating) || RATING_START;
    const expected = 1 / (1 + 10 ** ((mean - own) / 400));
    const delta = Math.round(RATING_K * ((player.token === state.winner ? 1 : 0) - expected));
    player.delta = delta;
    const value = Math.max(100, own + delta);
    const response = await sb('party_ratings?on_conflict=token', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ token: player.token, rating: value, games: Number(row.games || 0) + 1, updated_at: now }])
    });
    if (!response.ok) throw new HttpError('The rating card could not be saved.', 503);
  }
  state.ratedApplied = true;
}

async function snapshot(room: Room, state: PartyState, token: string, book: Book) {
  const now = Date.now();
  const prompt = promptFor(state, book);
  const current = state.status === 'playing' ? state.players.find(player => player.token === state.turn) ?? null : null;
  const winner = state.players.find(player => player.token === state.winner) ?? null;
  const me = state.players.find(player => player.token === token) ?? null;
  const ratings = await ratingsFor(state.players.map(player => player.token));
  const rating = ratings.get(token) ?? { rating: RATING_START, games: 0 };
  return {
    code: room.code,
    status: state.status,
    rated: !!state.rated,
    seats: state.seats,
    lives: state.lives,
    minTurn: state.minTurn,
    revision: state.revision,
    prompt: { text: prompt.text, number: prompt.number, total: prompt.total },
    round: state.round,
    heartMeter: state.meterTarget || HEART_METER,
    maxLives: MAX_LIVES,
    fuseTotal: state.fuseTotal ?? 0,
    freeze: state.popUntil && now < state.popUntil ? state.popUntil : null,
    turn: current ? { seat: current.seat, name: label(current), mine: current.token === token } : null,
    turnPlayer: state.status === 'playing' && state.turn === token,
    deadline: state.turnDeadline,
    serverNow: now,
    host: state.host === token,
    players: state.players.map(player => ({
      seat: player.seat,
      name: label(player),
      lives: player.lives,
      meter: player.meter ?? 0,
      segs: (player.segs || []).map(seg => ({ tier: seg.tier, amt: seg.amt })),
      out: !!player.out,
      you: player.token === token,
      delta: player.delta ?? 0,
      rating: ratings.get(player.token)?.rating ?? RATING_START
    })),
    used: state.used.filter(entry => entry.round === state.round).map(entry => ({
      answer: entry.rawAnswer,
      name: label(state.players.find(player => player.token === entry.player)),
      points: entry.points
    })),
    log: state.log.slice(-7),
    winner: winner ? { name: label(winner), you: winner.token === token } : null,
    me: me ? { seat: me.seat, out: !!me.out, lives: me.lives, meter: me.meter ?? 0, delta: me.delta ?? 0 } : null,
    rating: { value: Number(rating.rating) || RATING_START, games: Number(rating.games) || 0, delta: me?.delta ?? 0 },
    badge: { name: 'KRILL', streak: 0, days: 0 }
  };
}

async function cleanRoom(room: Room, book: Book): Promise<Room> {
  let changed = simulatePops(room.state, book, Date.now());
  if (room.state.status === 'finished' && !room.state.ratedApplied) {
    await applyRatings(room.state);
    changed = true;
  }
  if (!changed) return room;
  return saveRoom(room, room.state);
}

async function freshCode() {
  for (let attempt = 0; attempt < 16; attempt++) {
    const code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
    if (!await readRoom(code)) return code;
  }
  throw new HttpError('No room code is free right now. Try again.', 503);
}

async function createParty(body: Record<string, any>, token: string) {
  const book = await loadBook();
  const seats = SEAT_LIMITS.includes(Number(body.seats)) ? Number(body.seats) : 6;
  const lives = clampInt(body.lives, LIVES_MIN, MAX_LIVES, START_LIVES);
  const minTurn = clampInt(body.minTurn, MIN_TURN_MIN, MIN_TURN_MAX, MIN_TURN_DEFAULT);
  const code = await freshCode();
  const state: PartyState = {
    code,
    date: book.date,
    status: 'lobby',
    host: token,
    listed: body.listed !== false,
    seats,
    lives,
    minTurn,
    rated: body.rated === true,
    round: 0,
    promptIndex: Math.floor(Math.random() * book.prompts.length),
    turn: null,
    turnDeadline: null,
    fuseTotal: 0,
    popUntil: null,
    winner: null,
    revision: 0,
    players: [{ token, seat: 0, name: cleanName(body.name, 0), lives, meter: 0, out: false, delta: 0 }],
    used: [],
    log: ['Room opened. Waiting for divers.']
  };
  const response = await sb('party_rooms', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ code, state, status: state.status, listed: state.listed, seats, revision: 0 }])
  });
  if (!response.ok) throw new HttpError('The room could not be opened. Try again.', 503);
  const rows = await response.json();
  return snapshot(rows[0] as Room, state, token, book);
}

async function joinParty(body: Record<string, any>, token: string) {
  const code = String(body.code || '').toUpperCase();
  const room = await readRoom(code);
  if (!room) throw new HttpError('No room with that code.', 404);
  const book = await loadBook();
  const state = room.state;
  const existing = state.players.find(player => player.token === token);
  if (existing) {
    if (body.name) existing.name = cleanName(body.name, existing.seat);
    const saved = await saveRoom(room, state);
    return snapshot(saved, state, token, book);
  }
  if (state.status !== 'lobby') throw new HttpError('That party already started. Ask for the next one.', 409);
  if (state.players.length >= state.seats) throw new HttpError('That room is full.', 409);
  const seat = Array.from({ length: state.seats }, (_, index) => index).find(index => !state.players.some(player => player.seat === index));
  if (seat == null) throw new HttpError('That room is full.', 409);
  const name = cleanName(body.name, seat);
  state.players.push({ token, seat, name, lives: state.lives, meter: 0, out: false, delta: 0 });
  pushLog(state, [`${name} joined the room.`]);
  const saved = await saveRoom(room, state);
  return snapshot(saved, state, token, book);
}

async function startParty(body: Record<string, any>, token: string) {
  const room = await readRoom(String(body.code || '').toUpperCase());
  if (!room) throw new HttpError('No room with that code.', 404);
  if (room.state.host !== token) throw new HttpError('Only the host can start the party.', 403);
  if (room.state.status === 'playing') throw new HttpError('That party is already running.', 409);
  if (room.state.players.length < 2) throw new HttpError('Two divers are needed to pass the puffer.', 409);
  const book = await loadBook();
  const state = room.state;
  for (const player of state.players) {
    player.lives = state.lives;
    player.meter = 0;
    player.out = false;
    player.delta = 0;
  }
  const first = [...state.players].sort((a, b) => a.seat - b.seat)[0];
  state.status = 'playing';
  state.round = 1;
  state.promptIndex = (state.promptIndex + (room.status === 'finished' ? 1 : 0)) % book.prompts.length;
  state.turn = first.token;
  state.fuseTotal = fuseLength();
  state.turnDeadline = Date.now() + state.fuseTotal;
  state.popUntil = null;
  state.winner = null;
  state.used = [];
  state.ratedApplied = false;
  pushLog(state, [`${label(first)} holds the puffer. Category: ${promptFor(state, book).text}`]);
  const saved = await saveRoom(room, state);
  return snapshot(saved, state, token, book);
}

async function answerParty(body: Record<string, any>, token: string) {
  const room = await readRoom(String(body.code || '').toUpperCase());
  if (!room) throw new HttpError('No room with that code.', 404);
  const book = await loadBook();
  const state = room.state;
  let changed = simulatePops(state, book, Date.now());
  if (changed) room.state = state;
  const mine = state.players.find(player => player.token === token);
  if (!mine) throw new HttpError('Join that room first.', 403);
  if (state.status !== 'playing') {
    if (changed) await saveRoom(room, state);
    throw new HttpError('That party is not running.', 409);
  }
  if (mine.out) throw new HttpError('You are out of this party — watching only.', 409);
  if (state.turn !== token) throw new HttpError('The puffer is not with you.', 409);
  if (state.popUntil && Date.now() < state.popUntil) throw new HttpError('The puffer is still bursting. Wait for the new fuse.', 409);
  const answer = String(body.answer ?? '').trim().slice(0, 80);
  const key = bare(answer);
  if (!key) throw new HttpError('Name something first.', 400);
  const prompt = promptFor(state, book);
  const match = matchAnswer(answer, prompt.answers);
  if (!match) throw new HttpError(`“${answer}” is not in the answer book. Try another.`, 400);
  const normalized = bare(match.answer);
  const used = state.used.filter(entry => entry.round === state.round);
  if (used.some(entry => entry.normalized === normalized || entry.normalized === key)) {
    throw new HttpError(`“${answer}” is already on the table for this category.`, 409);
  }
  const points = TIERS[match.tier]?.score ?? 0;
  mine.meter = Number(mine.meter || 0) + points;
  // The seat meter is drawn in tier-coloured segments, so the room keeps them.
  const segs: MeterSeg[] = (mine.segs || []).map(seg => ({ tier: seg.tier, amt: seg.amt }));
  const last = segs[segs.length - 1];
  if (last && last.tier === match.tier) last.amt += points;
  else segs.push({ tier: match.tier, amt: points });
  const meterTarget = state.meterTarget || HEART_METER;
  let hearts = 0;
  while (mine.meter >= meterTarget && mine.lives < MAX_LIVES) {
    mine.lives += 1;
    mine.meter -= meterTarget;
    hearts += 1;
  }
  if (mine.meter >= meterTarget) mine.meter = meterTarget - 1;
  // Spending the meter on a heart clears its segments; the leftover stays.
  if (hearts) mine.segs = mine.meter > 0 ? [{ tier: match.tier, amt: mine.meter }] : [];
  else mine.segs = segs;
  state.used.push({ round: state.round, player: token, rawAnswer: answer, normalized, points });
  const events = [`${label(mine)} named “${match.answer}” (+${points}).`];
  if (hearts) events.push(`${label(mine)} filled the meter: extra heart.`);
  const now = Date.now();
  const remaining = Math.max(turnFloor(state), (state.turnDeadline ?? now) - now);
  const step = nextTurn(state.players, mine.seat);
  state.turn = step.token ?? state.turn;
  state.turnDeadline = now + remaining;
  state.fuseTotal = remaining;
  state.popUntil = null;
  if (step.wrapped) {
    state.round += 1;
    state.promptIndex = (state.promptIndex + 1) % book.prompts.length;
    state.used = [];
    events.push(`New category: ${promptFor(state, book).text}`);
  }
  if (alive(state.players).length <= 1) settle(state);
  pushLog(state, events);
  if (state.status === 'finished') await applyRatings(state);
  const saved = await saveRoom(room, state);
  return snapshot(saved, state, token, book);
}

async function settingsParty(body: Record<string, any>, token: string) {
  const room = await readRoom(String(body.code || '').toUpperCase());
  if (!room) throw new HttpError('No room with that code.', 404);
  const state = room.state;
  if (state.host !== token) throw new HttpError('Only the host can change the room.', 403);
  if (state.status !== 'lobby') throw new HttpError('The room is locked once the puffer wakes.', 409);
  const nextLives = clampInt(body.lives ?? state.lives, LIVES_MIN, MAX_LIVES, state.lives);
  const nextTurn = clampInt(body.minTurn ?? state.minTurn, MIN_TURN_MIN, MIN_TURN_MAX, state.minTurn);
  let nextMeter = state.meterTarget || HEART_METER;
  if (body.meterTarget !== undefined) {
    const wanted = Number(body.meterTarget);
    if (!Number.isFinite(wanted)) throw new HttpError('That meter is not a number.', 400);
    nextMeter = Math.max(METER_MIN, Math.min(METER_MAX, Math.round(wanted / METER_STEP) * METER_STEP));
  }
  let nextSeats = state.seats;
  if (body.seats !== undefined) {
    const wanted = Number(body.seats);
    if (!SEAT_LIMITS.includes(wanted)) throw new HttpError('That table size is not on the menu.', 400);
    if (wanted < state.players.length) throw new HttpError('More divers are aboard than that many seats.', 409);
    nextSeats = wanted;
  }
  const changed = nextLives !== state.lives || nextTurn !== state.minTurn || nextSeats !== state.seats
    || nextMeter !== (state.meterTarget || HEART_METER);
  state.lives = nextLives;
  state.minTurn = nextTurn;
  state.seats = nextSeats;
  state.meterTarget = nextMeter;
  for (const player of state.players) player.lives = nextLives;
  if (!changed) return snapshot(room, state, token, await loadBook());
  pushLog(state, [`The host set the room to ${nextLives} ${nextLives === 1 ? 'heart' : 'hearts'}, a ${nextTurn}s minimum turn and a ${nextMeter}-point meter.`]);
  const saved = await saveRoom(room, state);
  return snapshot(saved, state, token, await loadBook());
}

async function leaveParty(body: Record<string, any>, token: string) {
  const code = String(body.code || '').toUpperCase();
  const room = await readRoom(code);
  if (!room) return { gone: true };
  const state = room.state;
  const mine = state.players.find(player => player.token === token);
  if (!mine) return { gone: false };
  const remaining = state.players.filter(player => player.token !== token);
  if (!remaining.length) {
    await sb('party_rooms?code=eq.' + encodeURIComponent(code), { method: 'DELETE' });
    return { gone: true };
  }
  state.players = remaining;
  if (state.host === token) state.host = remaining[0].token;
  pushLog(state, [`${label(mine)} left the water.`]);
  if (state.status === 'playing' && state.turn === token) {
    const step = nextTurn(remaining, mine.seat);
    state.turn = step.token ?? state.turn;
    state.turnDeadline = Date.now() + Math.max(turnFloor(state), (state.turnDeadline ?? Date.now()) - Date.now());
    state.popUntil = null;
    if (step.wrapped) {
      state.round += 1;
      state.promptIndex = (state.promptIndex + 1) % (await loadBook()).prompts.length;
      state.used = [];
    }
  }
  if (alive(remaining).length <= 1) {
    settle(state);
    await applyRatings(state);
  }
  const saved = await saveRoom(room, state);
  return snapshot(saved, state, token, await loadBook());
}

async function listRooms(url: URL) {
  const stale = new Date(Date.now() - ROOM_TTL).toISOString();
  await sb('party_rooms?updated_at=lt.' + encodeURIComponent(stale), { method: 'DELETE' });
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const limit = 50;
  const query = 'party_rooms?listed=eq.true&status=in.(lobby,playing)&select=code,state,status,seats,revision,updated_at&order=updated_at.desc&limit=' + limit + '&offset=' + offset;
  const response = await sb(query);
  if (!response.ok) throw new HttpError('The room list is unavailable right now.', 503);
  const rows = await response.json();
  const rooms = rows.map((row: any) => {
    const state = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
    const host = state.players?.find((player: Player) => player.token === state.host);
    return {
      code: row.code,
      name: cleanName(host?.name || 'Diver', 0),
      status: row.status,
      players: state.players?.length || 0,
      seats: row.seats,
      rated: !!state.rated,
      full: (state.players?.length || 0) >= row.seats
    };
  });
  return { total: rooms.length, rooms };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    const path = (url.pathname.replace(/^.*\/puffer-party/, '').replace(/\/+$/, '') || '/');
    const token = cleanToken(req.headers.get('x-party-token'));
    if (req.method === 'GET') {
      if (path === '/health') return reply({ ok: true, realtime: true });
      if (path === '/party/rooms') return reply(await listRooms(url));
      if (path === '/party/me') {
        if (!token) throw new HttpError('Open a party first.', 401);
        const rating = await ratingFor(token);
        return reply({ rating: Number(rating.rating) || RATING_START, games: Number(rating.games) || 0, streak: 0, badge: { name: 'KRILL', days: 0 } });
      }
      if (path === '/party/room') {
        const room = await readRoom(String(url.searchParams.get('code') || '').toUpperCase());
        if (!room) throw new HttpError('No room with that code.', 404);
        const book = await loadBook();
        const cleaned = await cleanRoom(room, book);
        return reply(await snapshot(cleaned, cleaned.state, token, book));
      }
      throw new HttpError('Unknown endpoint.', 404);
    }
    if (req.method !== 'POST') throw new HttpError('Use GET or POST.', 405);
    if (!token) throw new HttpError('Open a party first.', 401);
    const body = await readJson(req);
    if (path === '/party/create') return reply(await createParty(body, token));
    if (path === '/party/join') return reply(await joinParty(body, token));
    if (path === '/party/start') return reply(await startParty(body, token));
    if (path === '/party/settings') return reply(await settingsParty(body, token));
    if (path === '/party/answer') return reply(await answerParty(body, token));
    if (path === '/party/leave') return reply(await leaveParty(body, token));
    throw new HttpError('Unknown endpoint.', 404);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    console.error('puffer-party:', error instanceof Error ? error.message : String(error));
    return reply({
      error: status >= 500 ? 'The puffer is between dives. Try again shortly.' : (error instanceof Error ? error.message : 'Request failed.')
    }, status);
  }
});

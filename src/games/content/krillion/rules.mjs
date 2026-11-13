export const TIERS = {
  plankton: { name: 'Plankton', score: 10, emoji: '🫧', color: '#8fa3c4', blurb: 'The answer everyone blurts out.' },
  tooclever: { name: 'Too Clever', score: 15, emoji: '🤡', color: '#ff9f43', blurb: 'The obscure answer the whole school thought of.' },
  schooler: { name: 'Schooler', score: 30, emoji: '🐟', color: '#4de3ff', blurb: 'Solid — swims with the school.' },
  rare: { name: 'Rare', score: 60, emoji: '🦑', color: '#ff5252', blurb: 'An uncommon answer. Nice pull.' },
  deepcut: { name: 'Deep Cut', score: 85, emoji: '🏮', color: '#9d7bff', blurb: 'True obscurity. Few go this deep.' },
  krillion: { name: 'One in a Krillion', score: 100, emoji: '🌟', color: '#ffd166', blurb: 'The designated gem. Trench floor.' },
};
export const BANDS = [
  { min: 0, max: 150, tier: 'plankton', name: 'Plankton', text: 'Plenty of ocean left down there.' },
  { min: 151, max: 250, tier: 'schooler', name: 'Schooler', text: 'Swimming with the school.' },
  { min: 251, max: 350, tier: 'rare', name: 'Rare', text: 'Below the thermocline. Nice.' },
  { min: 351, max: 449, tier: 'deepcut', name: 'Deep cut', text: 'Seriously deep dive.' },
  { min: 450, max: 700, tier: 'krillion', name: 'One in a krillion', text: 'Trench dweller. Absurd.' },
];
export const ROUND_MS = 25000;
export const PREVIEW_MS = 3000;
export const ROUNDS = 7;
export const bandFor = score => [...BANDS].reverse().find(b => score >= b.min) || BANDS[0];
export const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
export function etDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}
export function resetAt(date) {
  const next = new Date(date + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
  const day = next.toISOString().slice(0, 10);
  const probe = new Date(day + 'T04:00:00Z');
  return etDate(probe) === day ? probe.getTime() : Date.parse(day + 'T05:00:00Z');
}
export function distance(a, b, limit = Infinity) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...next) > limit) return limit + 1;
    row = next;
  }
  return row[b.length];
}
// A leading article is noise for open answers: "the avengers" is "avengers".
// It is stripped from the raw answer, before normalization, so words that merely
// start with those letters (Arabic, anemometer) are untouched.
export const stripArticle = value => String(value).trim().replace(/^(?:the|a|an)\s+/i, '');
// Both sides of a comparison lose the article, so "The Birds" and "Birds" are
// the same answer. Stripping only the input made every "The …" answer unmatchable.
const bare = value => normalize(stripArticle(value));
// A short trailing qualifier is how people naturally write ("Bob Pettit hawks").
const QUALIFIER = 16;
const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// Numeric prompts are the worst offenders for false rejections: "23" and
// "twenty three" are the same answer, and neither is a typo of the other.
export function numberValue(text) {
  const key = normalize(stripArticle(String(text)));
  if (/^\d{1,3}$/.test(key)) return Number(key);
  if (key in ONES) return ONES[key];
  const compound = key.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(one|two|three|four|five|six|seven|eight|nine)?$/);
  if (compound) return TENS[compound[1]] + (compound[2] ? ONES[compound[2]] : 0);
  return null;
}
export function matchAnswer(input, answers) {
  const key = bare(input);
  if (!key || key.length > 256) return null;
  const commonAliases = { mashedpotatoes: ['mashed', 'mash'], frenchfries: ['fries'], bakedpotato: ['baked potato', 'jacket potato'] };
  // A plain object also answers for its prototype, so an answer named
  // "Constructor" would read Object.prototype.constructor — not iterable.
  const commonFor = word => Object.hasOwn(commonAliases, word) ? commonAliases[word] : [];
  const entries = answers.flatMap(a => [a.answer, ...(a.aliases || []), ...commonFor(bare(a.answer))].map(word => ({ word, a, key: bare(word) })));
  const exact = entries.find(e => e.key === key);
  if (exact) return { ...exact.a, correction: key !== bare(exact.a.answer) };
  // A plain plural is the same answer, not a different one.
  if (key.length > 4 && key.endsWith('s')) {
    const singular = entries.find(e => e.key === key.slice(0, -1));
    if (singular) return { ...singular.a, correction: true };
  }
  // "twenty three" / "23" equivalence, checked both ways.
  const numeric = numberValue(input);
  if (numeric !== null) {
    const numericEntry = entries.find(e => numberValue(e.key) === numeric);
    if (numericEntry) return { ...numericEntry.a, correction: numericEntry.key !== key };
  }
  const allowance = key.length < 4 ? 0 : key.length < 8 ? 1 : 2;
  const candidates = entries.map(e => ({ ...e, d: distance(key, e.key, allowance) })).filter(e => e.d <= allowance).sort((a, b) => a.d - b.d);
  // A typo equally close to two different answers lands on the lower-scoring
  // one, so a misspelling is never worth more than the answer it might have meant.
  if (candidates.length) {
    const best = candidates.filter(e => e.d === candidates[0].d).sort((a, b) => (TIERS[a.a.tier]?.score ?? 0) - (TIERS[b.a.tier]?.score ?? 0))[0];
    return { ...best.a, correction: true };
  }
  // Only after exact and typo matching: a unique longer phrase that starts with
  // one known answer ("Bob Pettit hawks") counts, and never more than one tier.
  const qualified = entries
    .filter(e => e.key.length >= 4 && key.length > e.key.length && key.length - e.key.length <= QUALIFIER && key.startsWith(e.key))
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (qualified && entries.filter(e => e.key !== qualified.key && key.startsWith(e.key)).length === 0) return { ...qualified.a, correction: true };
  return null;
}
export function shareText(day, results, origin = 'https://openkrillion.com') {
  const score = results.reduce((s, r) => s + r.score, 0);
  return `OpenKrillion #${day} 🦐\n${score}/700 · ${score * 10}m\n${results.map(r => TIERS[r.tier]?.emoji || '⬛').join('')}\n${origin}`;
}

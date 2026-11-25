// The daily dive scores in the browser.
//
// The reference site publishes the day's answer sheet, but it has no CORS
// headers and a big day is tens of megabytes — too much object graph for an
// Edge Function to index. The function streams the sheet here instead, so the
// page fetches it once, matches answers with the same rules the classroom sets
// use, and leaves the server with what it is good at: the run, its clock, the
// daily board and the sounding.
import { TIERS, matchAnswer } from './rules.mjs';

const ROUNDS = 7;
// A round of a big day holds a hundred thousand answers; the sheet shows the
// deepest slice rather than printing the reef.
const REVIEW_LIMIT = 200;

const isPrompt = prompt => !!prompt && typeof prompt.id === 'string' && Array.isArray(prompt.answers) && !!prompt.text;

function prepare(raw) {
  const prompts = Array.isArray(raw?.prompts) ? raw.prompts.filter(isPrompt) : [];
  if (prompts.length !== ROUNDS) throw new Error('Today’s answer sheet is incomplete. Try again in a moment.');
  return {
    date: String(raw.date || ''),
    prompts: prompts.map((prompt, index) => ({
      id: String(prompt.id || `p${index + 1}`),
      text: String(prompt.text),
      // The sheet already arrives deepest-first, so no copy or re-sort is
      // needed for a round that can hold 136,000 answers.
      answers: prompt.answers.filter(answer => answer && typeof answer.answer === 'string' && TIERS[answer.tier])
    }))
  };
}

// A practice dive asks the day's prompts in a different order, so the sheet has
// to follow the run's order rather than the sheet's own.
function align(book, prompts) {
  if (!book || !Array.isArray(prompts) || prompts.length !== ROUNDS) return book;
  const known = new Map(book.prompts.map(prompt => [prompt.id, prompt]));
  const ordered = prompts.map(prompt => known.get(String(prompt?.id))).filter(Boolean);
  return ordered.length === ROUNDS ? { ...book, prompts: ordered } : book;
}

export function createRevealRun({ call }) {
  let book = null;
  let pending = null;
  let run = null;

  const load = () => {
    if (book) return Promise.resolve(book);
    if (!pending) {
      pending = (async () => {
        const today = await call('today');
        const raw = await call('reveal?date=' + encodeURIComponent(today.date));
        book = prepare(raw);
        return book;
      })().catch(error => {
        // A failed download is worth retrying on the next press.
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  const remember = state => {
    run = state;
    if (Array.isArray(state?.prompts)) book = align(book, state.prompts);
    return state;
  };

  const hintFor = prompt => {
    const answers = prompt.answers;
    const gem = answers.find(answer => answer.tier === 'krillion') || answers[answers.length - 1];
    if (!answers.length || !gem) return 'That answer sheet is empty.';
    return `${answers.length} answers land here. The deepest one starts with “${String(gem.answer)[0].toUpperCase()}”.`;
  };

  return async function api(path, data) {
    const route = String(path).split('?')[0];

    // Warm the sheet on the intro screen, so pressing the dive does not wait on
    // a fourteen-megabyte download.
    if (route === 'today') {
      const today = await call('today');
      void load().catch(() => {});
      return today;
    }

    if (route === 'start') {
      await load();
      return remember(await call('start', data || {}));
    }

    if (route === 'state') return remember(await call(path));

    if (route === 'next' || route === 'pause') return remember(await call(route, data || {}));

    if (route === 'answer') {
      await load();
      const round = Number(data?.round);
      const prompt = book.prompts[round];
      if (!prompt) throw new Error('Invalid round.');
      const raw = String(data?.answer ?? '').trim().slice(0, 256);
      const match = raw ? matchAnswer(raw, prompt.answers) : null;
      if (!match && raw && !data?.timeout) return { rejected: true, message: `“${raw}”: no echo. try again` };
      if (match?.correction && data?.confirm !== true && !data?.timeout && data?.previewCorrection !== false) {
        return { correction: match.answer, original: raw };
      }
      const scored = match && TIERS[match.tier]
        ? { answer: match.answer, tier: match.tier, quip: match.quip || null }
        : null;
      return remember(await call('answer', {
        runId: data?.runId,
        round,
        answer: raw,
        timeout: data?.timeout === true,
        result: scored
      }));
    }

    if (route === 'hint') {
      await load();
      const prompt = book.prompts[Number(data?.round)];
      const response = await call('hint', { runId: data?.runId, round: data?.round });
      if (response?.state) remember(response.state);
      return { used: true, hint: prompt ? hintFor(prompt) : 'That answer sheet is unavailable.' };
    }

    // The answer sheet is already here; only the population needs the server.
    if (route === 'review') {
      await load();
      const prompts = book.prompts.map(prompt => ({
        id: prompt.id,
        text: prompt.text,
        total: prompt.answers.length,
        answers: prompt.answers.slice(0, REVIEW_LIMIT).map(answer => ({
          answer: answer.answer,
          tier: answer.tier,
          quip: answer.quip || null,
          score: TIERS[answer.tier].score
        }))
      }));
      const comparison = run?.mode === 'daily'
        ? await call('population?run=' + encodeURIComponent(run.id))
          .catch(() => ({ population: 0, betterThan: null, dist: Array(71).fill(0) }))
        : { population: 0, betterThan: null, dist: Array(71).fill(0) };
      return { prompts, ...comparison };
    }

    return call(path, data);
  };
}

// A dive that runs in the browser instead of on the shared board.
//
// The prompts come from a loader and scoring uses the same matcher as the daily
// dive. Only classroom sets use this: they are files a teacher controls, so
// there is no server and nothing to store. Unlimited dives are ordinary runs on
// the API, scored and kept in Postgres.
import { TIERS, ROUND_MS, PREVIEW_MS, matchAnswer } from './rules.mjs';

export function prepareBook(raw, fallbackTitle) {
  const prompts = Array.isArray(raw?.prompts) ? raw.prompts : [];
  if (prompts.length !== 7) throw new Error(`${fallbackTitle} needs exactly seven prompts.`);
  return {
    title: String(raw.title || fallbackTitle).slice(0, 80),
    prompts: prompts.map((prompt, index) => {
      const answers = (Array.isArray(prompt?.answers) ? prompt.answers : [])
        .filter(answer => typeof answer?.answer === 'string' && answer.answer.trim() && TIERS[answer.tier])
        .map(answer => ({
          answer: answer.answer.trim(),
          tier: answer.tier,
          ...(Array.isArray(answer.aliases) ? { aliases: answer.aliases.filter(alias => typeof alias === 'string') } : {}),
          ...(typeof answer.quip === 'string' ? { quip: answer.quip } : {})
        }));
      if (!answers.length) throw new Error(`Prompt ${index + 1} in ${fallbackTitle} has no answers.`);
      return { id: String(prompt.id || `p${index + 1}`), text: String(prompt.text || `Prompt ${index + 1}`), answers };
    })
  };
}

// Returns the same (path, data) => body function the game uses for the daily
// dive, so the client does not need a second code path. `load` resolves a raw
// book whenever a fresh run starts.
export function createLocalRun({ mode, load, idPrefix = 'local', fallbackTitle = 'This dive' }) {
  let book = null;
  let loading = null;
  let run = null;
  let seq = 0;

  const read = async () => {
    if (book) return book;
    if (!loading) {
      loading = Promise.resolve()
        .then(load)
        .then(raw => (book = prepareBook(raw, fallbackTitle)))
        .catch(error => { loading = null; throw error; });
    }
    return loading;
  };

  const score = () => (run ? run.results.reduce((total, result) => total + result.score, 0) : 0);
  const publicPrompts = () => book.prompts.map(prompt => ({ id: prompt.id, text: prompt.text }));

  const stateFor = () => ({
    date: new Date().toISOString().slice(0, 10),
    dayNumber: 0,
    title: book.title,
    sample: false,
    stale: false,
    prompts: publicPrompts(),
    resetsAt: 0,
    runId: run.id,
    mode,
    round: run.round,
    roundStart: run.roundStart,
    pausedAt: run.pausedAt,
    serverNow: Date.now(),
    completed: run.completed,
    results: run.results,
    score: score(),
    hintUsed: run.hintUsed
  });

  const start = async () => {
    await read();
    seq += 1;
    run = { id: `${idPrefix}-${seq}-${Date.now().toString(36)}`, round: 0, roundStart: Date.now() + PREVIEW_MS, pausedAt: null, completed: false, results: [], hintUsed: false };
    return stateFor();
  };

  return async function api(path, data = {}) {
    const route = String(path).split('?')[0].replace(/^\/+/, '');

    if (route === 'start') return start();

    await read();
    if (route === 'today') {
      return { date: new Date().toISOString().slice(0, 10), dayNumber: 0, title: book.title, sample: false, stale: false, prompts: publicPrompts(), resetsAt: 0 };
    }
    if (route === 'feedback') return { ok: true };
    if (!run) throw new Error('Start the dive first.');

    if (route === 'state') return stateFor();

    if (route === 'answer') {
      const round = Number(data.round);
      if (!Number.isInteger(round) || round < 0 || round >= book.prompts.length) throw new Error('Invalid round.');
      if (run.completed || run.roundStart == null || round !== run.round) return { state: stateFor(), alreadyScored: true };
      const windowStart = Number(run.roundStart);
      const late = Date.now() > windowStart + ROUND_MS;
      const timely = !late || (data.timeout === true && Date.now() <= windowStart + ROUND_MS + 1_500);
      const raw = String(data.answer ?? '').trim().slice(0, 256);
      const prompt = book.prompts[round];
      const match = raw && timely ? matchAnswer(raw, prompt.answers) : null;
      if (!match && raw && !late && !data.timeout) return { rejected: true, message: `“${raw}”: no echo. try again` };
      if (match?.correction && data.confirm !== true && !late && !data.timeout && data.previewCorrection !== false) {
        return { correction: match.answer, original: raw };
      }
      const result = {
        round,
        rawAnswer: raw || null,
        answer: match?.answer || null,
        tier: match?.tier || null,
        score: match ? (TIERS[match.tier]?.score ?? 0) : 0,
        quip: match?.quip || null,
        promptText: prompt.text
      };
      run.results = [...run.results.filter(entry => entry.round !== round), result].sort((a, b) => a.round - b.round);
      run.round = round + 1;
      run.roundStart = null;
      run.completed = run.round >= book.prompts.length;
      return { result, state: stateFor() };
    }

    if (route === 'next') {
      if (!run.completed) run.roundStart = Date.now() + PREVIEW_MS;
      return stateFor();
    }

    if (route === 'pause') {
      if (data.paused === true && !run.completed && run.roundStart != null && !run.pausedAt && Date.now() <= Number(run.roundStart) + ROUND_MS) {
        run.pausedAt = Date.now();
      } else if (data.paused === false && run.pausedAt) {
        run.roundStart = Number(run.roundStart) + (Date.now() - Number(run.pausedAt));
        run.pausedAt = null;
      }
      return stateFor();
    }

    if (route === 'hint') {
      if (run.completed) throw new Error('This dive is over.');
      if (run.hintUsed) throw new Error('That hint is already spent.');
      const prompt = book.prompts[Number(run.round)];
      if (!prompt) throw new Error('This dive is over.');
      const gem = prompt.answers.find(answer => answer.tier === 'krillion') || prompt.answers[prompt.answers.length - 1];
      run.hintUsed = true;
      return { used: true, hint: `${prompt.answers.length} answers land here. The deepest one starts with “${gem.answer[0].toUpperCase()}”.` };
    }

    if (route === 'review') {
      if (!run.completed) throw new Error('Finish the dive before opening the answer sheet.');
      return {
        prompts: book.prompts.map(prompt => ({
          id: prompt.id,
          text: prompt.text,
          answers: prompt.answers
            .map(answer => ({ ...answer, score: TIERS[answer.tier].score }))
            .sort((a, b) => TIERS[b.tier].score - TIERS[a.tier].score || a.answer.localeCompare(b.answer))
        })),
        population: 0,
        betterThan: null,
        dist: []
      };
    }

    if (route === 'leaderboard') return { date: stateFor().date, total: 0, top: [], yourRank: null, yScore: null, beaten: 0 };

    throw new Error('Unknown request.');
  };
}

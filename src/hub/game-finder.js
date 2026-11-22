import { ORDER, META } from '../games/catalog.js';
import { DISCOVERY, PREVIEWS } from '../games/discovery.js';

// Six short questions, no account or network call. Answers only live in this dialog.
export const FINDER_QUESTIONS = [
  { title: 'What sounds good right now?', options: [
    ['Something fast and exciting', 'action'], ['A challenge that makes me think', 'puzzle'],
    ['Something I can get invested in', 'deep'], ['Honestly, just messing around', 'casual']
  ] },
  { title: 'How much effort are we talking?', options: [
    ['My brain is off-duty', 'relax'], ['A little thinking is fine', 'medium'],
    ['Give me a proper challenge', 'hard'], ['I want to get genuinely good at something', 'master']
  ] },
  { title: 'How long are you sticking around?', options: [
    ['Just a minute or two', 'short'], ['Five to ten minutes', 'mid'],
    ['Maybe twenty minutes', 'long'], ['Until I remember I have responsibilities', 'endless']
  ] },
  { title: 'What makes a game satisfying?', options: [
    ['Beating my last score', 'score'], ['Figuring something out', 'solve'],
    ['Building or controlling something', 'build'], ['Winning a ridiculous confrontation', 'chaos']
  ] },
  { title: 'Who are you playing with?', options: [
    ['Just me', 'solo'], ['A friend on the same device', 'local'],
    ['People online', 'online'], ["Doesn't matter", 'any']
  ] },
  { title: 'Pick your preferred kind of trouble.', options: [
    ['Fast reflexes and close calls', 'reflex'], ['Planning five moves ahead', 'strategy'],
    ['Physics doing something questionable', 'physics'], ['A peaceful little world', 'peace']
  ] }
];

// A small editorial layer on top of the live catalog's genre/pace/duration metadata.
// Adding a game to ORDER automatically makes it eligible; these tags refine matches.
const GROUPS = Object.fromEntries(Object.entries({
  score: 'trackbound aim-lab quickdraw circuit typing-test block-blast 2048 tetris snake pac-man asteroids breakout qbert krillion downhill-mayhem brick-run void-runner simon space-invaders ballistic-chickens',
  solve: 'crossword sudoku photo-puzzle pokedoku krillion scrabble wordle mahjong chess 2048 minesweeper lights-out memory tetris block-blast prism-duel shadow-net corner',
  build: 'ashcrown transit-chaos signal-tower sand fluid eco corner poke-idle poke-gacha trackbound ticket-to-ride',
  chaos: 'getaway-shootout rooftop-snipers basket-random ballistic-chickens gun-mayhem tank2 tank quickdraw sumo downhill-mayhem lava volletball commanders shotgun-roulette',
  reflex: 'trackbound quickdraw aim-lab circuit brick-run void-runner pac-man qbert frogger snake space-invaders asteroids gun-mayhem getaway-shootout rooftop-snipers basket-random downhill-mayhem wallbound',
  strategy: 'ashcrown risk chess scrabble ticket-to-ride corner transit-chaos signal-tower prism-duel commanders poker tank2 connect-four poke-idle poke-gacha deep',
  physics: 'getaway-shootout rooftop-snipers basket-random ballistic-chickens wallbound tank2 sumo minigolf air-hockey downhill-mayhem circuit trackbound gun-mayhem',
  peace: 'sand fluid eco mahjong solitaire photo-puzzle wordle memory sudoku 2048 minigolf clicker poke-idle',
  immersive: 'f-14 ashcrown risk poke-idle poke-gacha signal-tower transit-chaos ticket-to-ride eco deep imposter shadow-net',
  skill: 'trackbound aim-lab quickdraw circuit chess tetris typing-test minesweeper block-blast f-14',
  challenging: 'ashcrown risk chess scrabble transit-chaos signal-tower sudoku crossword minesweeper prism-duel f-14 ticket-to-ride',
  lowkey: 'block-blast 2048 wordle photo-puzzle mahjong solitaire clicker sand fluid eco memory lights-out minigolf',
}).map(([key, slugs]) => [key, new Set(slugs.split(' '))]));

const ONLINE_MULTIPLAYER = new Set(['imposter', 'f-14']);
const NOT_A_GAME = new Set(['klang']);
const reasonCopy = {
  score: 'You can keep chasing a better score.',
  solve: 'There is a satisfying problem to crack.',
  build: 'You get to make decisions and build something.',
  chaos: 'Things are likely to get ridiculous.',
  reflex: 'Quick reactions actually matter here.',
  strategy: 'It rewards thinking a few moves ahead.',
  physics: 'The physics are half the entertainment.',
  peace: 'You can play without rushing.',
  immersive: 'There is plenty to get absorbed in.',
  skill: 'It rewards practice and improvement.'
};
const groupHas = (group, slug) => !!GROUPS[group]?.has(slug);

function canPlay(slug, social) {
  if (NOT_A_GAME.has(slug)) return false;
  const players = DISCOVERY[slug]?.players || '';
  if (social === 'online') return ONLINE_MULTIPLAYER.has(slug);
  if (social === 'local') return /2 local/.test(players) || slug === 'getaway-shootout';
  // Among Us requires another human. Online F-14 can also be flown alone.
  if (social === 'solo') return slug !== 'imposter';
  return true;
}

function scoreGame(slug, answers) {
  const meta = DISCOVERY[slug] || {};
  const genre = META[slug]?.[0] || '';
  let points = 0;
  const reasons = [];
  const reward = (condition, weight, reason) => {
    if (condition) {
      points += weight;
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    }
  };

  reward(answers[0] === 'action' && (genre === 'Arcade' || groupHas('reflex', slug)), 5, 'reflex');
  reward(answers[0] === 'puzzle' && genre === 'Puzzle', 6, 'solve');
  reward(answers[0] === 'deep' && (genre === 'Strategy' || groupHas('immersive', slug)), 6, 'immersive');
  reward(answers[0] === 'casual' && (meta.pace === 'Relaxing' || groupHas('lowkey', slug)), 6, 'peace');

  reward(answers[1] === 'relax' && (meta.pace === 'Relaxing' || groupHas('lowkey', slug)), 4, 'peace');
  reward(answers[1] === 'medium' && !groupHas('challenging', slug), 2);
  reward(answers[1] === 'hard' && (groupHas('challenging', slug) || genre === 'Puzzle'), 4, 'strategy');
  reward(answers[1] === 'master' && (groupHas('skill', slug) || groupHas('score', slug)), 4, 'skill');

  const range = /\d+\s*[–-]\s*(\d+)\s*min/.exec(meta.minutes || '');
  const maxMinutes = range ? Number(range[1]) : /^(\d+)\s*min/.exec(meta.minutes || '')?.[1] * 1;
  const openEnded = meta.minutes === 'Open-ended';
  reward(answers[2] === 'short' && (meta.quick && (maxMinutes <= 5 || !maxMinutes)), 5);
  reward(answers[2] === 'mid' && maxMinutes >= 3 && maxMinutes <= 15, 4);
  reward(answers[2] === 'long' && (openEnded || (maxMinutes >= 10 && maxMinutes <= 60)), 4);
  reward(answers[2] === 'endless' && (openEnded || groupHas('immersive', slug)), 5);
  if (answers[2] === 'short' && openEnded) points -= 3;
  if (answers[2] === 'endless' && maxMinutes && maxMinutes <= 3) points -= 2;

  reward(groupHas(answers[3], slug), 7, answers[3]);
  reward(groupHas(answers[5], slug), 7, answers[5]);

  // Keep a small breadth bonus for games with multiple independently relevant traits.
  reward(answers[1] === 'master' && groupHas('challenging', slug), 1);
  reward(answers[0] === 'deep' && openEnded, 2);
  reward(answers[0] === 'puzzle' && groupHas('solve', slug), 2);
  const reason = [answers[3], answers[5], ...reasons].find(tag => reasons.includes(tag) && reasonCopy[tag]);
  return { score: points, reason: reasonCopy[reason] || 'A good fit for the kind of game you picked.' };
}

// Deterministic, with a varied third recommendation so every result isn't the
// same genre. Online / local choices are hard filters, not soft preferences.
export function recommendGames(answers, { exclude = [] } = {}) {
  if (!Array.isArray(answers) || answers.length !== FINDER_QUESTIONS.length) return [];
  const excludeSet = new Set(exclude);
  const ranked = ORDER.map(([slug, name], index) => {
    if (!canPlay(slug, answers[4]) || excludeSet.has(slug)) return null;
    return { slug, name, genre: META[slug]?.[0] || 'Arcade', index, ...scoreGame(slug, answers) };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index);
  if (!ranked.length) return [];
  const selected = ranked.slice(0, 2);
  const alternative = ranked.slice(2).find(game =>
    game.genre !== selected[0].genre && game.score >= (ranked[2]?.score || 0) - 4);
  const third = alternative || ranked[2];
  if (third) selected.push(third);
  return selected.map(({ slug, name, reason }) => ({
    slug, name, reason, description: META[slug]?.[1] || '', preview: PREVIEWS[slug] || ''
  }));
}

export function createGameFinder({ openGame, track = () => {} }) {
  const $ = id => document.getElementById(id);
  const opener = $('game-finder-open');
  const dialog = $('game-finder-dialog');
  const body = $('game-finder-body');
  const progress = $('game-finder-progress');
  let answers = [];
  let step = 0;
  let excluded = [];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(label, className, action) {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function drawQuestion() {
    const question = FINDER_QUESTIONS[step];
    progress.textContent = 'QUESTION ' + (step + 1) + ' OF ' + FINDER_QUESTIONS.length;
    body.replaceChildren(el('h3', 'finder-question', question.title));
    const list = el('div', 'finder-options');
    question.options.forEach(([label, value], index) => {
      const option = button('', 'finder-option', () => {
        answers[step] = value;
        answers.length = step + 1;
        step++;
        if (step === FINDER_QUESTIONS.length) {
          track('library_action', { surface: 'library', action: 'click', step: 6, results: 3 });
          drawResults();
        } else drawQuestion();
      });
      option.append(el('span', 'finder-letter', String.fromCharCode(65 + index)), el('span', '', label));
      list.append(option);
    });
    body.append(list);
    const controls = el('div', 'finder-controls');
    if (step) controls.append(button('← Back', 'finder-back', () => { step--; drawQuestion(); }));
    controls.append(el('span', 'finder-footnote', 'Pick the first answer that feels right.'));
    body.append(controls);
  }
  function drawResults() {
    const results = recommendGames(answers, { exclude: excluded });
    progress.textContent = 'YOUR RESULTS';
    body.replaceChildren(el('h3', 'finder-question', 'We found your kind of trouble.'));
    body.append(el('p', 'finder-explainer', 'Try one of these. The third is a bit of a wildcard.'));
    const list = el('div', 'finder-results');
    results.forEach((game, index) => {
      const item = el('article', 'finder-result');
      const artwork = el('div', 'finder-result-art');
      if (game.preview) {
        const image = el('img');
        image.src = game.preview;
        image.alt = '';
        image.width = 150;
        image.height = 94;
        image.loading = 'lazy';
        artwork.append(image);
      }
      const details = el('div', 'finder-result-info');
      details.append(el('p', 'eyebrow', ['Best match', 'Also worth a shot', 'Something different'][index]));
      details.append(el('h4', '', game.name));
      details.append(el('p', 'finder-why', game.reason));
      const play = button('Play →', 'finder-play action' + (index === 0 ? ' primary-action' : ''), () => {
        track('library_action', { surface: 'library', action: 'open', game: game.slug, position: index + 1 });
        dialog.close();
        openGame(game.slug, null, opener);
      });
      item.append(artwork, details, play);
      list.append(item);
    });
    body.append(list);
    const controls = el('div', 'finder-controls');
    const totalEligible = ORDER.filter(([slug]) => canPlay(slug, answers[4])).length;
    if (totalEligible > results.length) controls.append(button('Try other games', 'finder-back', () => {
      const next = [...excluded, ...results.map(game => game.slug)];
      excluded = next.length >= totalEligible ? [] : next;
      drawResults();
    }));
    controls.append(button('Retake quiz', 'finder-back', () => {
      step = 0;
      answers = [];
      excluded = [];
      drawQuestion();
    }));
    body.append(controls);
  }

  opener.addEventListener('click', () => {
    step = 0; answers = []; excluded = [];
    drawQuestion();
    track('library_action', { surface: 'library', action: 'open' });
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  $('game-finder-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (!document.getElementById('player')?.hidden) return;
    opener.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

/* The hub's voice: a greeting that knows what time it is, a line under the
 * wordmark that changes between visits, and a rotating footer. Plain text only,
 * no network, no storage. `date` and `random` are parameters so a test can pin them. */

import { setBo } from './bo.js';

const LATE = [
  'Still up?',
  'Go to bed.',
  'Why are you awake?'
];
const MORNING = [
  'Good morning.',
  'Morning.',
  'Good morning.'
];
const SCHOOL_HOURS = [
  'Free period?',
  'Study hall?',
  'What are you playing?'
];
const AFTERNOON = [
  'School is over.',
  'Good afternoon.',
  'Good afternoon.'
];
const EVENING = [
  'Good evening.',
  'What are you playing?',
  'Good evening.'
];

export const FOOTERS = [
  'Have fun!',
  '',
  'No ads.',
  'Thanks for playing.',
  ''
];

const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

// Which list of greetings fits this moment. Weekday daytime is "school hours".
export function greetingBucket(date = new Date()) {
  const hour = date.getHours();
  const weekday = date.getDay() >= 1 && date.getDay() <= 5;
  if (hour < 5) return LATE;
  if (hour < 8) return MORNING;
  if (hour < 15) return weekday ? SCHOOL_HOURS : MORNING;
  if (hour < 18) return AFTERNOON;
  if (hour < 23) return EVENING;
  return LATE;
}

export function introLine(date = new Date(), random = Math.random) {
  return pick(greetingBucket(date), random);
}

// Bo's face: asleep in the small hours, bored the rest of the time. The page
// swaps in a pleased face by itself once today's daily challenge is done.
export function moodFor(date = new Date()) {
  return greetingBucket(date) === LATE ? 'asleep' : 'bored';
}

export function footerLine(random = Math.random) {
  return pick(FOOTERS, random);
}

// A hidden tab gets a nudge; coming back puts the real title back.
export function titleWhileAway() {
  return 'Bored. (come back)';
}

// The tab icon goes to sleep with the tab. These are flattened copies of Bo's faces.
export const ICON_AWAKE = './favicon.svg';
export const ICON_ASLEEP = './favicon-asleep.svg';

export function initVoice({ date = () => new Date(), random = Math.random } = {}) {
  const intro = document.querySelector('.intro');
  if (intro) intro.textContent = introLine(date(), random);
  const foot = document.querySelector('.foot > span:first-child');
  if (foot) foot.textContent = footerLine(random);

  // Bo beside the intro: asleep in the small hours, bored otherwise, and pleased once
  // today's daily is done. renderDaily flips the `completed` class on #daily, so watch it.
  const bo = document.querySelector('#bo-intro');
  const daily = document.querySelector('#daily');
  const showMood = () => setBo(bo, daily?.classList.contains('completed') ? 'pleased' : moodFor(date()));
  showMood();
  if (daily && typeof MutationObserver === 'function') {
    new MutationObserver(showMood).observe(daily, { attributes: true, attributeFilter: ['class'] });
  }

  const home = document.title;
  const icon = document.querySelector('link[rel="icon"]');
  document.addEventListener('visibilitychange', () => {
    if (icon) icon.setAttribute('href', document.hidden ? ICON_ASLEEP : ICON_AWAKE);
    // Never touch the title while a game is on screen; it belongs to the game's tab.
    if (document.body.classList.contains('playing')) return;
    document.title = document.hidden ? titleWhileAway() : home;
  });
}

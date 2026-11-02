/* Bo, the mascot. The drawing lives in ../bo.svg, one <symbol> per mood; this module only
 * points an <svg class="bo"> at the right one. Keep it that small: a new face is a new
 * symbol in bo.svg, and a new placement is `makeBo(mood)` or markup that matches it. */

export const BO_FILE = './bo.svg';
export const MOODS = ['bored', 'asleep', 'pleased', 'shrug', 'surprised'];

const NS = 'http://www.w3.org/2000/svg';

export function boHref(mood) {
  return BO_FILE + '#' + (MOODS.includes(mood) ? mood : 'bored');
}

// Point an existing placement at a mood. Safe to call with nothing.
export function setBo(svg, mood) {
  if (!svg) return;
  svg.dataset.mood = mood;
  svg.querySelector('use')?.setAttribute('href', boHref(mood));
}

// A new placement, for code that builds its markup in JS. Decorative: hidden from
// assistive tech and never a focus stop.
export function makeBo(mood, size = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'bo' + (size ? ' bo-' + size : ''));
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.appendChild(document.createElementNS(NS, 'use'));
  setBo(svg, mood);
  return svg;
}

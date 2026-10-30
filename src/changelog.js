import { CHANGELOG, CHANGELOG_META } from './changelog-data.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function dayKey(date) {
  return String(date).slice(0, 10);
}

export function dayLabel(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// Entries arrive newest first, so a run of the same day is one group.
export function groupByDay(entries) {
  const groups = [];
  for (const entry of entries) {
    const key = dayKey(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }
  return groups;
}

export function buildRow(entry) {
  const item = el('li', 'log-row');

  const text = el('span', 'log-text');
  text.append(el('span', 'log-subject', entry.subject));
  if (entry.pr) {
    const pr = el('a', 'log-pr', '#' + entry.pr);
    pr.href = `${CHANGELOG_META.repo}/pull/${entry.pr}`;
    pr.title = `Pull request #${entry.pr}`;
    text.append(pr);
  }

  const sha = el('a', 'log-sha', entry.sha);
  sha.href = `${CHANGELOG_META.repo}/commit/${entry.sha}`;
  sha.title = `${entry.author}, ${entry.date}`;

  item.append(text, sha);
  return item;
}

export function buildLog(entries) {
  const frag = document.createDocumentFragment();
  for (const group of groupByDay(entries)) {
    const heading = el('h3', 'log-day');
    const when = el('time', 'log-date', dayLabel(group.key));
    when.dateTime = group.key;
    heading.append(when);
    if (group.entries.length > 1) heading.append(el('log-day-count', '', `${group.entries.length} changes`));

    const list = el('ol', 'log-list');
    for (const entry of group.entries) list.append(buildRow(entry));
    frag.append(heading, list);
  }
  return frag;
}

function paint() {
  const root = document.getElementById('log');
  if (!root) return;
  root.textContent = '';
  root.append(buildLog(CHANGELOG));

  const count = document.getElementById('log-count');
  if (count) count.textContent = String(CHANGELOG_META.count);

  const note = document.getElementById('log-note');
  if (note) {
    note.textContent = 'Newest first. Merges are folded into the work they carried, '
      + 'so a line is a change and not bookkeeping. The short code links to the commit; '
      + 'a #number links to the pull request it landed in.';
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
}

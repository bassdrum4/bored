import { ORDER, EXTERNS, NEW_GAMES, FRESH_GAMES, META, PAYLOAD_SLUGS, TOGETHER_GAMES } from '../games/catalog.js';
import { DISCOVERY, COLLECTIONS, PREVIEWS, inCollection } from '../games/discovery.js';
import { DEVELOPER_NOTES } from '../games/developer-notes.js';
import { LB_GAMES, boardLeaders, boardTop, bestValue, formatScore } from './scores.js';
import { writeStored } from './store.js';

export function createLibraryView({ state, openGame, saveLibrary }) {
const $ = selector => document.querySelector(selector);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const searchInput = $('#q');
const gameGrid = $('#grid');

// These notes are separate from the regular game descriptions.
function closeDeveloperNotes() {
  document.querySelectorAll('.note-host.note-open').forEach(host => {
    host.classList.remove('note-open');
    host.querySelector('.developer-note-toggle')?.setAttribute('aria-expanded', 'false');
  });
}
function addDeveloperNote(host, slug, name) {
  const note = DEVELOPER_NOTES[slug];
  if (!note) return;
  host.classList.add('note-host');
  const id = 'developer-note-' + slug + (host.classList.contains('shelf-entry') ? '-shelf' : '');
  const toggle = element('button', 'developer-note-toggle', 'i');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Read developer note for ' + name);
  toggle.setAttribute('aria-controls', id);
  toggle.setAttribute('aria-expanded', 'false');
  const tip = element('span', 'developer-note-tip');
  tip.id = id;
  tip.setAttribute('role', 'tooltip');
  tip.append(element('span', 'developer-note-label', 'A note from the developer'),
    element('span', 'developer-note-copy', note));
  // Keep information and play as separate buttons, including on phones.
  host.querySelector('.card, .shelf-play')?.setAttribute('aria-describedby', id);
  toggle.onclick = () => {
    const wasOpen = host.classList.contains('note-open');
    closeDeveloperNotes();
    if (!wasOpen) {
      host.classList.add('note-open');
      toggle.setAttribute('aria-expanded', 'true');
    }
  };
  host.append(toggle, tip);
}
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.developer-note-toggle')) closeDeveloperNotes();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const wasOpen = !!document.querySelector('.note-host.note-open');
  closeDeveloperNotes();
  if (wasOpen && document.activeElement?.classList.contains('developer-note-toggle')) {
    document.activeElement.blur();
  }
});
function previewFor(slug) {
  const preview = element('span', 'game-preview');
  preview.setAttribute('aria-hidden', 'true');
  if (PREVIEWS[slug]) {
    const image = element('img');
    image.src = PREVIEWS[slug];
    image.alt = '';
    image.width = 384;
    image.height = 240;
    image.loading = 'lazy';
    image.decoding = 'async';
    preview.appendChild(image);
  } else {
    preview.classList.add('external-preview');
    preview.append(element('span', 'external-mark', '↗'), element('span', '', 'ONLINE EXTRA'));
  }
  return preview;
}

function gameMeta(slug) {
  const game = DISCOVERY[slug];
  return [game.minutes, game.pace, game.players].filter(Boolean).join(' · ');
}

// The scored games, and the leaders of the rows the leaderboard last fetched.
// Rows are cached by array identity so typing in the search box does not walk a
// whole board on every keystroke.
const scoredGames = new Map(LB_GAMES.map(game => [game.id, game]));
let leaderRows = null;
let leaders = new Map();
let topThrees = new Map();
// The byline and its tooltip read the same rows the leaderboard fetched, and
// the per-game top list is derived once per fetch rather than per card.
function boardData(slug) {
  const rows = state.lbCache.get('overall')?.rows || [];
  if (rows !== leaderRows) {
    leaderRows = rows;
    leaders = boardLeaders(rows);
    topThrees = new Map();
  }
  if (!topThrees.has(slug)) topThrees.set(slug, boardTop(rows, slug, 3));
  return { leader: leaders.get(slug) || null, top: topThrees.get(slug) };
}

// One quiet byline: the posted high score and who holds it, or the best this
// browser has when the game has not reached the shared board. Hovering or
// keyboard-focusing it lists the top three players on that board.
function cardBest(slug) {
  const spec = scoredGames.get(slug);
  if (!spec) return null;
  const line = element('span', 'card-best');
  const { leader, top } = boardData(slug);
  const own = bestValue(spec);
  if (leader) {
    const tied = leader.handles || [leader.handle];
    line.textContent = 'Best ' + formatScore(leader.value, spec) + ' · ' +
      (tied.length === 1 ? tied[0] : tied.length + ' tied leaders');
    if (tied.length > 1) line.title = 'Tied: ' + tied.join(', ');
  }
  else if (Number.isFinite(own) && own > 0) line.textContent = 'Your best ' + formatScore(own, spec);
  else line.textContent = 'No score yet';
  // One posted score is already named in the byline, so a one-row list would
  // only repeat it. The tooltip sits beside `.card-best`, never inside it, so
  // the byline text stays exactly what it says.
  if (top.length < 2) return line;
  const wrap = element('span', 'card-best-wrap');
  const tip = element('span', 'card-best-tip');
  tip.setAttribute('role', 'tooltip');
  tip.append(element('span', 'card-best-tip-title', 'Top ' + top.length + ' · ' + spec.name));
  top.forEach((row, index) => {
    const item = element('span', 'card-best-tip-row');
    item.append(element('span', 'card-best-tip-rank', String(index + 1)),
      element('span', 'card-best-tip-name', row.handle),
      element('span', 'card-best-tip-value', formatScore(row.value, spec)));
    tip.append(item);
  });
  wrap.append(line, tip);
  return wrap;
}

function shelfGame(slug, note) {
  const name = ORDER.find(([id]) => id === slug)[1];
  const button = element('button', 'shelf-play');
  button.type = 'button';
  button.dataset.slug = slug;
  button.appendChild(previewFor(slug));
  const text = element('span', 'shelf-copy');
  text.append(element('span', 'shelf-name', name + '\u00a0↗'), element('span', 'shelf-note', note));
  button.appendChild(text);
  button.onclick = () => openGame(slug);
  if (!DEVELOPER_NOTES[slug]) return button;
  const wrapper = element('div', 'shelf-entry');
  wrapper.appendChild(button);
  addDeveloperNote(wrapper, slug, name);
  return wrapper;
}

// One shelf, four cards. Recent games come first; favorites fill whatever room
// is left, so the row never grows into a second shelf under itself.
const SHELF_LIMIT = 4;

function renderRecent() {
  const saved = [...state.favorites].filter(slug => !state.recentGames.includes(slug));
  const shown = [...state.recentGames, ...saved].slice(0, SHELF_LIMIT);
  $('#recent-list').replaceChildren(...shown.map(slug => shelfGame(slug,
    (EXTERNS[slug] ? 'Online extra · ' : '') + (state.recentGames.includes(slug)
      ? (state.favorites.has(slug) ? 'Favorite · Recently played' : 'Recently played')
      : 'Favorite'))));
  $('#favorites-all').hidden = !state.favorites.size;
  $('#favorites-all').textContent = 'Browse ' + state.favorites.size + (state.favorites.size === 1 ? ' favorite' : ' favorites') + ' →';
  $('#recent-empty').hidden = shown.length > 0;
}

function renderCollections() {
  if (!$('#collections').children.length) $('#collections').replaceChildren(...COLLECTIONS.map(entry => {
    const button = element('button', 'collection', entry.name);
    button.type = 'button';
    button.dataset.collection = entry.id;
    button.setAttribute('aria-pressed', String(state.collection === entry.id));
    button.onclick = () => { state.collection = entry.id; renderCollections(); renderLibrary(); };
    return button;
  }));
  for (const button of $('#collections').children) button.setAttribute('aria-pressed', String(button.dataset.collection === state.collection));
  $('#collection-note').textContent = COLLECTIONS.find(entry => entry.id === state.collection).note;
}

// The shelf lists the NEW-badged games first, in badge order, then the rest of
// the catalog. Keeping it derived means a game that falls off the badge simply
// drops back into its catalog slot.
function libraryOrder() {
  const fresh = FRESH_GAMES.map(slug => ORDER.find(([id]) => id === slug)).filter(Boolean);
  return [...fresh, ...ORDER.filter(([slug]) => !FRESH_GAMES.includes(slug))];
}

function renderLibrary() {
  const filter = searchInput.value.trim().toLowerCase();
  gameGrid.replaceChildren();
  const shelf = libraryOrder();
  state.visibleGames = shelf.filter(([slug, name]) => {
    const meta = META[slug];
    return (EXTERNS[slug] || PAYLOAD_SLUGS.includes(slug) || NEW_GAMES.includes(slug)) &&
      inCollection(slug, state.collection) &&
      (!filter || [name, slug, ...meta, gameMeta(slug), ...DISCOVERY[slug].inputs].join(' ').toLowerCase().includes(filter)) &&
      (state.category === 'All' || (state.category === 'New' ? FRESH_GAMES.includes(slug) :
        state.category === 'Favorites' ? state.favorites.has(slug) : meta[0] === state.category));
  });
  if ($('#sort').value === 'az') state.visibleGames.sort((a, b) => a[1].localeCompare(b[1]));

  for (const [slug, name] of state.visibleGames) {
    const row = element('div', 'row');
    const card = element('button', 'card');
    card.type = 'button';
    card.dataset.slug = slug;
    card.appendChild(previewFor(slug));
    const text = element('span', 'text');
    const title = element('span', 'name', name);
    if (FRESH_GAMES.includes(slug)) title.appendChild(element('span', 'badge', 'NEW'));
    text.append(element('span', 'card-category', EXTERNS[slug] ? 'Online extra · Internet required' : META[slug][0] + ' · Offline'),
      title, element('span', 'detail', META[slug][1]), element('span', 'game-meta', gameMeta(slug)),
      element('span', 'game-inputs', DISCOVERY[slug].inputs.join(' / ')));
    const best = cardBest(slug);
    if (best) text.appendChild(best);
    card.appendChild(text);
    card.onclick = () => openGame(slug);

    const star = element('button', 'star');
    star.type = 'button';
    const updateStar = () => {
      const saved = state.favorites.has(slug);
      star.textContent = saved ? '★' : '☆';
      star.setAttribute('aria-pressed', String(saved));
      star.setAttribute('aria-label', (saved ? 'Remove ' : 'Add ') + name + (saved ? ' from' : ' to') + ' favorites');
    };
    updateStar();
    star.onclick = () => {
      if (state.favorites.has(slug)) state.favorites.delete(slug);
      else state.favorites.add(slug);
      state.favoriteEvents[slug] = { saved: state.favorites.has(slug), at: Date.now() };
      writeStored('bored.favoriteEvents', state.favoriteEvents);
      saveLibrary();
      updateStar();
      renderRecent();
      if (state.category === 'Favorites') {
        const index = state.visibleGames.findIndex(([id]) => id === slug);
        renderLibrary();
        const next = gameGrid.children[Math.min(index, gameGrid.children.length - 1)];
        (next?.querySelector('.star') || $('#filters [data-filter="Favorites"]')).focus();
      }
    };
    row.append(card, star);
    if (TOGETHER_GAMES[slug]) {
      row.classList.add('has-together');
      const together = element('button', 'catalog-together', 'Bored Together →');
      together.type = 'button';
      together.setAttribute('aria-label', 'Play ' + name + ' on Bored Together');
      together.onclick = () => window.dispatchEvent(new CustomEvent('bored:together-open', { detail: { game: slug } }));
      row.append(together);
    }
    addDeveloperNote(row, slug, name);
    gameGrid.appendChild(row);
  }

  $('#empty').hidden = state.visibleGames.length > 0;
  $('#empty').textContent = state.category === 'Favorites' && !state.favorites.size
    ? 'No favorites yet. Tap the star on any game and it lands here.'
    : 'Nothing matches that. Try another search, or clear the filters and start over.';
  $('#results').textContent = state.visibleGames.length + ' of ' + ORDER.length + ' entries';
  $('#count').textContent = ORDER.length;
  const counts = (ORDER.length - Object.keys(EXTERNS).length) + ' offline / ' + Object.keys(EXTERNS).length + ' online extras';
  $('#library-count').textContent = counts;
  $('#foot-count').textContent = counts;
  $('#clear-filters').hidden = !filter && state.category === 'All' && state.collection === 'all';
  $('#random').disabled = !state.visibleGames.length;
}

function showLibraryMessage() {
  $('#results').textContent = 'These entries need internet. Choose Online to include them in Surprise me.';
}


return { previewFor, gameMeta, renderRecent, renderCollections, renderLibrary, showLibraryMessage };
}

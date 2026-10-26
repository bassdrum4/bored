import { hasIdentity, getSession, ensureProfile } from './backend.js';
import { togetherRPC, CONSENT_VERSION } from './together-api.js';
import { TOGETHER_GAMES } from '../games/catalog.js';
import { TOGETHER_ADAPTERS } from './together-player.js';
import { readStored, writeStored, removeStored } from './store.js';

export function createTogetherUI({ openAuthDialog, playMatch }) {
  const $ = s => document.querySelector(s);
  const root = $('#together'), content = $('#together-content'), status = $('#together-status');
  let owner = null, data = null, visible = false, busy = false, generation = 0, flight = null;
  let flow = null, selectedGame = 'connect-four', query = '', results = null;
  const name = game => TOGETHER_GAMES[game]?.name || game;
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(text, fn, primary = false) {
    const b = node('button', text, 'action' + (primary ? ' bt-primary' : ''));
    b.type = 'button'; b.onclick = () => run(fn); return b;
  }
  function updateBadge() {
    const count = data?.enrolled ? data.matches.filter(m =>
      m.status === 'active' && m.turn_user === owner || m.status === 'pending' && m.p2 === owner).length : 0;
    $('#together-badge').hidden = !count; $('#together-badge').textContent = String(count);
    $('#together-home').hidden = !count;
    $('#together-home-link').textContent = count + (count === 1 ? ' game needs' : ' games need') + ' your attention →';
  }
  function resetIdentity() {
    const next = hasIdentity() ? getSession()?.user?.id : null;
    if (owner === next) return;
    owner = next; generation++; flight = null; busy = false; root.removeAttribute('aria-busy');
    data = flow = results = null; query = ''; status.textContent = '';
    updateBadge(); render();
  }
  async function refresh(force = false) {
    resetIdentity();
    if (!owner || document.hidden || busy && !force) return;
    if (flight) return flight;
    const stamp = generation;
    const task = (async () => {
      try {
        const next = await togetherRPC('dashboard');
        if (stamp !== generation) return;
        const changed = JSON.stringify(data) !== JSON.stringify(next);
        data = next; updateBadge();
        if (changed || force) render();
      } catch (error) {
        if (stamp === generation) status.textContent = 'Could not refresh. Your saved games are safe. ' + error.message;
      }
    })();
    flight = task;
    try { await task; } finally { if (flight === task) flight = null; }
  }
  async function run(fn) {
    if (busy) return;
    busy = true; root.setAttribute('aria-busy', 'true'); status.textContent = '';
    const stamp = generation;
    try { await fn(); if (stamp === generation) await refresh(true); }
    catch (error) { if (stamp === generation) status.textContent = error.message; }
    finally { if (stamp === generation) { busy = false; root.removeAttribute('aria-busy'); } }
  }
  async function launch(id) {
    const stamp = generation, player = owner;
    const match = await togetherRPC('match', { match_id: id });
    if (stamp !== generation || !visible) return;
    if (!['active', 'completed'].includes(match.status)) { await refresh(true); return; }
    flow = null; query = ''; results = null; render();
    playMatch(match, player, {
      async submit(current, move, action) {
        if (stamp !== generation || owner !== player) throw new Error('Your account changed.');
        const key = 'bored.together.pending.' + player + '.' + id;
        let pending = readStored(key, null);
        if (!pending || pending.version !== current.version || JSON.stringify(pending.move) !== JSON.stringify(move)) {
          pending = { match_id: id, version: current.version, request_id: crypto.randomUUID(), move };
          writeStored(key, pending);
        }
        const next = await togetherRPC(action, pending);
        if (stamp !== generation) throw new Error('Your account changed.');
        removeStored(key);
        return next;
      },
      reload() { run(() => launch(id)); },
      onExit() { if (stamp === generation) refresh(true); }
    });
  }
  function intro() {
    const intro = node('div', undefined, 'bt-enrollment');
    intro.append(node('h3', 'Play a turn. Come back whenever.'),
      node('p', 'Challenge someone or find a random opponent. Your games save between turns.'),
      node('p', 'Joining lets other members find your username or look you up by your exact account email. Your email stays private.', 'bt-caption'),
      button('Join Bored Together', async () => {
        if (!hasIdentity()) { openAuthDialog('signin'); return; }
        await ensureProfile(); await togetherRPC('enroll', { consent_version: CONSENT_VERSION });
      }, true));
    content.append(intro);
  }
  function overflow(host, opponent) {
    const more = node('details', undefined, 'bt-more');
    const summary = node('summary', 'More'); summary.setAttribute('aria-label', opponent ? 'Options for ' + opponent.handle : 'Bored Together options');
    more.append(summary);
    if (opponent) more.append(button('Block ' + opponent.handle, () => togetherRPC('block', { user_id: opponent.id })));
    else {
      for (const p of data.blocks || []) more.append(button('Unblock ' + p.handle, () => togetherRPC('unblock', { user_id: p.id })));
      const leave = node('details'); leave.append(node('summary', 'Leave Bored Together'),
        node('p', 'Leaving hides you from search, cancels invitations and forfeits active games.', 'bt-caption'),
        button('Confirm leave', () => togetherRPC('leave')));
      more.append(leave);
    }
    host.append(more);
  }
  function picker() {
    const box = node('section', undefined, 'bt-start');
    box.setAttribute('aria-label', flow === 'challenge' ? 'Challenge someone' : 'Play random');
    const label = node('label', 'Choose a game ', 'bt-game-picker'), select = node('select'); select.id = 'bt-game-select';
    for (const [slug, game] of Object.entries(TOGETHER_GAMES)) {
      if (!TOGETHER_ADAPTERS[slug]) continue;
      const option = node('option', game.name); option.value = slug; select.append(option);
    }
    select.value = selectedGame;
    select.onchange = () => { selectedGame = select.value; results = null; render(); };
    label.append(select); box.append(label);
    if (flow === 'random') box.append(button('Find opponent', async () => {
      const result = await togetherRPC('queue_join', { game: selectedGame });
      flow = null; if (result.id) await launch(result.id);
    }, true));
    else {
      const form = node('form', undefined, 'bt-search-form');
      const label = node('label', 'Username or exact email'); label.htmlFor = 'bt-search';
      const input = node('input'); input.id = 'bt-search'; input.value = query; input.required = true; input.minLength = 3; input.maxLength = 254;
      input.autocomplete = 'off'; input.oninput = () => { query = input.value; results = null; $('#bt-find')?.remove(); };
      const find = node('button', 'Find player', 'action'); find.type = 'submit';
      form.onsubmit = e => { e.preventDefault(); run(async () => {
        const stamp = generation, searched = query.trim();
        const found = await togetherRPC('search', { query: searched });
        if (stamp === generation && query.trim() === searched) { results = found; render(); }
      }); };
      form.append(label, input, find); box.append(form);
      if (results) {
        const list = node('div'); list.id = 'bt-find';
        if (!results.length) list.append(node('p', 'No player found. They need to join Bored Together first.', 'bt-caption'));
        for (const person of results) {
          const row = node('div', undefined, 'bt-person');
          row.append(node('strong', person.handle), button('Challenge', async () => {
            await togetherRPC('challenge', { user_id: person.id, game: selectedGame });
            flow = results = null; query = ''; status.textContent = 'Challenge sent.';
          }, true));
          list.append(row);
        }
        box.append(list);
      }
    }
    box.append(button('Cancel', () => { flow = results = null; query = ''; render(); }));
    content.append(box);
  }
  function matchRow(m, host) {
    const incoming = m.status === 'pending' && m.p2 === owner;
    const turn = m.status === 'active' && m.turn_user === owner;
    const row = node('article', undefined, 'bt-match-row' + (turn || incoming ? ' bt-ready' : ''));
    row.dataset.matchId = m.id;
    const copy = node('div', undefined, 'bt-match-copy');
    copy.append(node('h4', name(m.game) + ' · ' + (m.opponent?.handle || 'Former member')),
      node('p', incoming ? 'Challenge received' : m.status === 'pending' ? 'Challenge sent' : m.status === 'active' ? turn ? 'Your turn' : 'Their turn' : m.winner === owner ? 'You won' : m.winner ? 'You lost' : 'Draw', 'bt-caption'));
    const actions = node('div', undefined, 'bt-actions');
    if (incoming) actions.append(button('Accept', async () => { await togetherRPC('accept', { match_id: m.id }); await launch(m.id); }, true),
      button('Decline', () => togetherRPC('decline', { match_id: m.id })));
    else if (m.status === 'pending') actions.append(button('Cancel challenge', () => togetherRPC('cancel', { match_id: m.id })));
    else if (m.status === 'active') actions.append(button(turn ? 'Play turn' : 'Open', () => launch(m.id), turn));
    else actions.append(button('Rematch', async () => {
      await togetherRPC('rematch', { match_id: m.id, game: m.game }); status.textContent = 'Rematch sent.';
    }));
    if (m.opponent) overflow(actions, m.opponent);
    row.append(copy, actions); host.append(row);
  }
  function dashboard() {
    const start = node('div', undefined, 'bt-start-actions');
    start.append(button('Challenge Someone', () => { flow = 'challenge'; results = null; render(); $('#bt-game-select')?.focus(); }, true),
      button('Play Random', () => { flow = 'random'; results = null; render(); $('#bt-game-select')?.focus(); }));
    overflow(start); content.append(start);
    if (flow) picker();
    const games = node('section'); games.id = 'bt-your-games'; games.append(node('h3', 'Your Games'));
    const attention = m => m.status === 'active' && m.turn_user === owner || m.status === 'pending' && m.p2 === owner ? 0 : m.status === 'completed' ? 2 : 1;
    const open = data.matches.filter(m => ['pending', 'active'].includes(m.status));
    // Keep rematches close to the finished game, without a history page or records.
    const completed = data.matches.filter(m => m.status === 'completed').slice(0, 3);
    const matches = [...open, ...completed].sort((a, b) => attention(a) - attention(b));
    if (!matches.length && !data.queue.length) games.append(node('p', 'No games yet. Start one above.', 'bt-caption'));
    for (const match of matches) matchRow(match, games);
    for (const game of data.queue) {
      const row = node('div', undefined, 'bt-match-row');
      row.append(node('p', 'Finding an opponent · ' + name(game)), button('Cancel search', () => togetherRPC('queue_cancel', { game })));
      games.append(row);
    }
    content.append(games);
  }
  function render() {
    if (!visible) return;
    const active = document.activeElement, focus = active?.id, start = active?.selectionStart, end = active?.selectionEnd;
    content.replaceChildren();
    if (!owner || data?.enrolled === false) intro();
    else if (!data) content.append(node('p', 'Loading your games…'));
    else dashboard();
    if (focus) { const next = document.getElementById(focus); if (next) { next.focus({ preventScroll: true }); try { next.setSelectionRange(start, end); } catch {} } }
  }
  function open() {
    visible = true; document.body.classList.add('together-open');
    for (const el of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) el.hidden = true;
    root.hidden = false; $('#together-nav').setAttribute('aria-current', 'page');
    try { history.replaceState(null, '', '#together'); } catch {}
    resetIdentity(); render(); refresh(true); root.scrollIntoView({ block: 'start' });
  }
  function close() {
    visible = false; flow = results = null; query = ''; root.hidden = true;
    document.body.classList.remove('together-open'); $('#together-nav').removeAttribute('aria-current');
    for (const el of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) el.hidden = false;
  }
  $('#together-nav').onclick = e => { e.preventDefault(); open(); };
  $('#together-home-link').onclick = e => { e.preventDefault(); open(); };
  $('#together-refresh').onclick = () => run(() => refresh(true));
  $('#together-back').onclick = () => { close(); try { history.replaceState(null, '', '#library'); } catch {} $('#library').scrollIntoView(); };
  for (const link of document.querySelectorAll('.site-nav a:not(#together-nav)')) link.addEventListener('click', close);
  window.addEventListener('bored:identity', () => { resetIdentity(); refresh(true); });
  window.addEventListener('bored:together-open', event => {
    if (TOGETHER_ADAPTERS[event.detail?.game]) selectedGame = event.detail.game;
    open(); flow = 'challenge'; render();
  });
  window.addEventListener('focus', () => refresh());
  window.addEventListener('online', () => refresh(true));
  window.addEventListener('hashchange', () => { if (location.hash === '#together') open(); else close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden && hasIdentity()) refresh(); }, 15000);
  resetIdentity(); refresh(); if (location.hash === '#together') open();
  return { open, refresh };
}

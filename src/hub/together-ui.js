import { hasIdentity, getSession, ensureProfile } from './backend.js';
import { togetherRPC, CONSENT_VERSION } from './together-api.js';
import { TOGETHER_GAMES } from '../games/catalog.js';
import { readStored, writeStored, removeStored } from './store.js';

// Hub-owned UI. No credentials or network are passed to a game iframe.
export function createTogetherUI({ openAuthDialog }) {
  const $ = s => document.querySelector(s);
  const root = $('#together');
  const content = $('#together-content');
  const status = $('#together-status');
  let owner = null, data = null, current = null, selected = null;
  let visible = false, busy = false, flight = null, generation = 0, fingerprint = '';
  let searchResults = [], searchQuery = '', review = null, dashboardView = 'games', searched = false;
  const key = () => 'bored.together.match.' + owner;
  const name = game => TOGETHER_GAMES[game]?.name || game;
  const node = (tag, text, className) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  };
  function button(text, fn, label) {
    const b = node('button', text, 'action'); b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    b.onclick = () => run(fn); return b;
  }
  function message(text) { status.textContent = text; }
  function resetIdentity() {
    const next = hasIdentity() ? getSession()?.user?.id : null;
    if (next === owner) return;
    owner = next; generation++; flight = null; fingerprint = '';
    data = current = selected = null; searchResults = []; searchQuery = ''; review = null; dashboardView = 'games'; searched = false;
    updateBadge(); render();
  }
  function updateBadge() {
    const enrolled = data?.enrolled === true;
    const pending = enrolled ? data.matches.filter(m => m.status === 'active' && m.turn_user === owner).length +
      data.matches.filter(m => m.status === 'pending' && m.p2 === owner).length +
      data.friends.filter(f => f.status === 'pending' && f.sender !== owner).length : 0;
    $('#together-badge').hidden = !pending;
    $('#together-badge').textContent = String(pending);
    $('#together-home').hidden = !enrolled || !pending;
    $('#together-home-link').textContent = pending + (pending === 1 ? ' multiplayer activity needs' : ' multiplayer activities need') + ' your attention →';
  }
  async function refresh(force = false) {
    resetIdentity();
    if (!owner || document.hidden) return;
    if (flight) return flight;
    const stamp = generation;
    const task = (async () => {
      try {
        const next = await togetherRPC('dashboard');
        if (stamp !== generation) return;
        const changed = JSON.stringify(next) !== fingerprint;
        data = next; fingerprint = JSON.stringify(next); updateBadge();
        if (data.enrolled && visible) {
          if (!selected && force) selected = readStored(key(), null);
          if (selected) {
            try {
              const match = await togetherRPC('match', { match_id: selected });
              if (stamp !== generation || selected !== match.id) return;
              const boardChanged = JSON.stringify(current) !== JSON.stringify(match);
              current = match;
              if (force || boardChanged) render();
            } catch (error) {
              if (stamp !== generation) return;
              current = selected = null; removeStored(key()); render(); message(error.message);
            }
          } else if (changed || force) render();
        } else if (changed || force) render();
      } catch (error) {
        if (stamp !== generation) return;
        message(/PGRST202|function.*bt_rpc/i.test(error.code + ' ' + error.message)
          ? 'Bored Together is not available yet. The database setup needs to be installed.'
          : 'Could not refresh. Your saved games are safe. ' + error.message);
      }
    })();
    flight = task;
    try { await task; } finally { if (flight === task) flight = null; }
  }
  async function run(fn) {
    if (busy) return;
    busy = true; root.setAttribute('aria-busy', 'true'); message('Saving…');
    const stamp = generation;
    try {
      await fn();
      if (stamp === generation) { if (status.textContent === 'Saving…') message(''); await refresh(true); }
    } catch (error) {
      if (stamp === generation) {
        await refresh(true);
        message((navigator.onLine ? '' : 'You are offline. Reconnect and try again. ') + error.message);
      }
    } finally { busy = false; root.removeAttribute('aria-busy'); }
  }
  function open() {
    visible = true; document.body.classList.add('together-open');
    for (const e of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) e.hidden = true;
    root.hidden = false; $('#together-nav').setAttribute('aria-current', 'page');
    try { history.replaceState(null, '', '#together'); } catch {}
    resetIdentity(); render(); refresh(true);
    root.scrollIntoView({ block: 'start' });
  }
  function close() {
    visible = false; document.body.classList.remove('together-open'); root.hidden = true; $('#together-nav').removeAttribute('aria-current');
    for (const e of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) e.hidden = false;
  }
  function empty(host, text) { host.append(node('p', text, 'section-note')); }
  async function act(action, args) { return togetherRPC(action, args); }
  async function viewMatch(id) {
    selected = id; review = null; writeStored(key(), id);
    current = await act('match', { match_id: id }); render();
    $('#bt-match-heading')?.focus();
  }
  function back() { current = selected = null; review = null; dashboardView = 'games'; removeStored(key()); render(); }
  function control(text, fn, className = 'action') {
    const b = node('button', text, className); b.type = 'button'; b.onclick = fn; return b;
  }
  function primary(b) { b.classList.add('bt-primary'); return b; }
  function switchView(view, focus = false) {
    dashboardView = view; render();
    if (focus) $('#bt-tab-' + view)?.focus({ preventScroll: true });
  }
  function findPlayers() {
    dashboardView = 'people'; render(); $('#bt-search')?.focus({ preventScroll: true });
    $('#bt-find')?.scrollIntoView({ block: 'nearest' });
  }
  function miniBoard(m) {
    const preview = node('div', undefined, 'bt-mini-board'); preview.setAttribute('aria-hidden', 'true');
    for (const value of m.state?.board || Array(42).fill(0)) preview.append(node('span', undefined, 'bt-mini-cell bt-mini-' + value));
    return preview;
  }
  function gamePreview() {
    const image = node('img', undefined, 'bt-game-image');
    image.src = './games/previews/connect-four.webp'; image.alt = ''; image.width = 180; image.height = 120;
    return image;
  }
  function intro() {
    const wrap = node('div', undefined, 'bt-enrollment');
    const pitch = node('div', undefined, 'bt-welcome');
    pitch.append(node('p', 'A LITTLE FRIENDLY COMPETITION', 'bt-kicker'),
      node('h3', 'Play together. On your own time.', 'bt-welcome-title'),
      node('p', 'A quick move between classes. A rematch after school. Challenge a friend or find someone new, then pick up the game whenever you return.', 'bt-lead'));
    const join = primary(button('Join Bored Together', async () => {
      if (!hasIdentity()) { openAuthDialog('signin'); return; }
      await ensureProfile(); await act('enroll', { consent_version: CONSENT_VERSION });
    }));
    const enrollmentAction = node('div', undefined, 'bt-enroll-action');
    enrollmentAction.append(join, node('p', owner ? 'Your existing account. No new password.' : 'Use your existing Bored account. Sign in first, then choose Join.', 'bt-caption'));
    const game = node('div', undefined, 'bt-welcome-game'); game.append(gamePreview(), node('span', 'Connect Four · ready to play', 'bt-caption')); pitch.append(game);
    const privacy = node('aside', undefined, 'bt-consent');
    privacy.append(node('p', 'BEFORE YOU JOIN', 'bt-kicker'), node('h4', 'You choose to be discoverable.'));
    const list = node('ul');
    for (const text of [
      'Only members can find your username or send you a challenge.',
      'People who know your exact account email can use it to find your username.',
      'Your email address stays hidden by default. You can choose to show it to accepted friends; random matches never show email.'
    ]) list.append(node('li', text));
    privacy.append(list, node('p', 'Joining is optional. You can leave or block a player at any time.', 'bt-caption'));
    const policy = node('details'); policy.append(node('summary', 'Leaving & game history'),
      node('p', 'Leaving removes friendships and invitations, exits the queue, and forfeits active games. Match history and opponent statistics remain for 90 days; notifications for 30 days. Blocking cancels games between you without a win.'));
    privacy.append(policy); wrap.append(pitch, privacy, enrollmentAction); content.append(wrap);
    const steps = node('div', undefined, 'bt-steps');
    for (const [number, title, text] of [['01','Pick an opponent','Find a friend by username or email, or play random.'],['02','Make your move','Play a turn. Your game is saved automatically.'],['03','Come back later','Your next turn will be waiting when you return.']]) {
      const step = node('div'); step.append(node('span', number, 'bt-kicker'), node('h4', title), node('p', text)); steps.append(step);
    }
    content.append(steps);
  }
  function friendState(id) { return data.friends.find(f => f.person.id === id); }
  function personCard(p, host, friend = friendState(p.id)) {
    const row = node('article', undefined, 'bt-person');
    const copy = node('div', undefined, 'bt-person-copy'); copy.append(node('h4', p.handle));
    copy.append(node('span', !friend ? 'Bored Together member' : friend.status === 'accepted' ? 'Friend' : friend.sender === owner ? 'Request sent' : 'Wants to be friends', 'bt-caption'));
    if (p.email) copy.append(node('p', p.email, 'bt-email'));
    const stat = data.stats.find(s => s.opponent?.id === p.id);
    if (stat) copy.append(node('p', `${stat.wins}W · ${stat.losses}L · ${stat.draws}D against you`, 'bt-caption'));
    row.append(copy);
    const actions = node('div', undefined, 'bt-actions');
    actions.append(button('Challenge', async () => {
      const m = await act('challenge', { user_id: p.id, game: 'connect-four' }); await viewMatch(m.id);
    }, 'Challenge ' + p.handle));
    if (!friend) actions.append(button('Add friend', () => act('friend_request', { user_id: p.id }), 'Add ' + p.handle + ' as a friend'));
    else if (friend.status === 'pending') {
      if (friend.sender !== owner) actions.append(primary(button('Accept friend', () => act('friend_accept', { user_id: p.id }))));
      actions.append(button(friend.sender === owner ? 'Cancel request' : 'Decline friend', () => act('friend_decline', { user_id: p.id })));
    }
    const more = node('details', undefined, 'bt-more'); more.append(node('summary', 'More'));
    if (friend?.status === 'accepted') more.append(button('Remove friend', () => act('friend_remove', { user_id: p.id })));
    more.append(button('Block', async () => {
      await act('block', { user_id: p.id }); searchResults = searchResults.filter(person => person.id !== p.id);
    }, 'Block ' + p.handle));
    actions.append(more); row.append(actions); host.append(row);
  }
  function matchCard(m, host, featured = false) {
    const incoming = m.status === 'pending' && m.p2 === owner;
    const yourTurn = m.status === 'active' && m.turn_user === owner;
    const row = node('article', undefined, 'bt-match-card' + (featured ? ' bt-match-featured' : ''));
    row.dataset.matchId = m.id;
    if (featured) row.append(miniBoard(m));
    const copy = node('div', undefined, 'bt-match-copy');
    const result = m.status === 'completed' ? (m.winner === owner ? 'You won' : m.winner ? 'You lost' : 'Draw') :
      m.status === 'active' ? (yourTurn ? 'Your turn' : 'Their turn') : incoming ? 'Challenge received' : m.status === 'pending' ? 'Invitation sent' : m.status;
    copy.append(node('p', name(m.game), 'bt-kicker'), node('h4', m.opponent?.handle || 'Former member'), node('span', result, 'bt-match-state' + (yourTurn || incoming ? ' bt-state-ready' : '')));
    row.append(copy);
    const actions = node('div', undefined, 'bt-actions');
    if (m.status === 'pending') {
      if (incoming) actions.append(primary(button('Accept', async () => { await act('accept', { match_id: m.id }); await viewMatch(m.id); })), button('Decline', () => act('decline', { match_id: m.id })));
      else actions.append(button('Cancel invitation', () => act('cancel', { match_id: m.id })));
    } else {
      const open = button(yourTurn ? 'Play turn →' : m.status === 'active' ? 'Resume' : 'Review', () => viewMatch(m.id), 'Open game with ' + m.opponent?.handle);
      actions.append(yourTurn ? primary(open) : open);
    }
    row.append(actions); host.append(row);
  }
  function panel(title, host, count, className = '') {
    const s = node('section', undefined, 'bt-panel ' + className);
    const heading = node('div', undefined, 'bt-panel-heading'); const h = node('h3', title);
    if (count !== undefined) h.append(node('span', String(count), 'bt-count'));
    heading.append(h); s.append(heading); host.append(s); return s;
  }
  function dashboard() {
    const incoming = data.friends.filter(f => f.status === 'pending' && f.sender !== owner);
    const turns = data.matches.filter(m => m.status === 'active' && m.turn_user === owner);
    const challenges = data.matches.filter(m => m.status === 'pending' && m.p2 === owner);
    const nav = node('nav', undefined, 'bt-tabs'); nav.setAttribute('aria-label', 'Bored Together views'); nav.setAttribute('role', 'tablist');
    const tabs = [['games','Games',turns.length + challenges.length],['people','People',incoming.length],['history','History',0],['settings','Settings',0]];
    for (const [id, label, count] of tabs) {
      const b = control(label, () => switchView(id, true), 'bt-tab'); b.id = 'bt-tab-' + id;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(dashboardView === id));
      b.setAttribute('aria-controls', 'bt-tab-panel'); b.tabIndex = dashboardView === id ? 0 : -1;
      if (count) b.append(node('span', String(count), 'bt-tab-count'));
      b.onkeydown = event => {
        const index = tabs.findIndex(tab => tab[0] === id);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); switchView(tabs[next][0], true); }
      };
      nav.append(b);
    }
    const body = node('div', undefined, 'bt-view'); body.id = 'bt-tab-panel'; body.setAttribute('role', 'tabpanel'); body.setAttribute('aria-labelledby', 'bt-tab-' + dashboardView);
    content.append(nav, body);
    if (dashboardView === 'people') peopleView(body, incoming);
    else if (dashboardView === 'history') historyView(body);
    else if (dashboardView === 'settings') settingsView(body);
    else gamesView(body, turns, challenges, incoming);
  }
  function gamesView(host, turns, challenges, incoming) {
    const hero = node('div', undefined, 'bt-spotlight' + (turns.length ? ' has-turns' : '')); const copy = node('div');
    copy.append(node('p', 'YOUR GAMES, AT YOUR PACE', 'bt-kicker'), node('h3', turns.length ? "You're up." : 'Ready when you are.', 'bt-spotlight-title'),
      node('p', turns.length ? `${turns.length === 1 ? 'A game is' : turns.length + ' games are'} waiting for your next move.` : 'Challenge a friend or start a game with someone new.', 'bt-lead'));
    if (turns.length) copy.append(primary(button('Play your next turn →', () => viewMatch(turns[0].id))));
    else copy.append(primary(control('Challenge Someone', findPlayers)));
    const start = node('div', undefined, 'bt-start-game'); start.append(gamePreview());
    const startCopy = node('div'); startCopy.append(node('h4', 'Connect Four'), node('p', 'Seven columns. One good rivalry.', 'bt-caption'));
    const choices = node('div', undefined, 'bt-actions');
    if (turns.length) choices.append(control('Challenge Someone', findPlayers));
    choices.append(button('Play Random', async () => {
      const result = await act('queue_join', { game: 'connect-four' }); if (result.id) await viewMatch(result.id);
    })); startCopy.append(choices); start.append(startCopy); hero.append(copy, start); host.append(hero);
    if (data.queue.length) {
      const queue = node('div', undefined, 'bt-queue');
      const note = node('div'); note.append(node('strong', 'Finding your next opponent'), node('p', 'Waiting for another Connect Four player. You can close Bored; we’ll save the match when someone joins.', 'bt-caption'));
      queue.append(note, button('Cancel random search', () => act('queue_cancel', { game: 'connect-four' }))); host.append(queue);
    }
    const layout = node('div', undefined, 'bt-overview'); const main = node('div', undefined, 'bt-match-list'); const aside = node('aside', undefined, 'bt-sidebar');
    layout.append(main, aside); host.append(layout);
    const ready = panel('Your turn', main, turns.length, 'bt-ready-panel');
    if (turns.length) { const cards = node('div', undefined, 'bt-turn-grid'); turns.forEach(m => matchCard(m, cards, true)); ready.append(cards); }
    else { const clear = node('div', undefined, 'bt-empty-state'); clear.append(node('h4', 'All caught up.'), node('p', 'Your next move will appear here. Start a game while you wait.', 'bt-caption')); ready.append(clear); }
    const waiting = data.matches.filter(m => m.status === 'active' && m.turn_user !== owner);
    const sent = data.matches.filter(m => m.status === 'pending' && m.p1 === owner);
    if (waiting.length || sent.length) {
      const s = panel('With your opponents', main, waiting.length + sent.length);
      for (const m of [...waiting, ...sent]) matchCard(m, s);
    }
    const invites = panel('Invitations', aside, challenges.length + incoming.length);
    if (!challenges.length && !incoming.length) empty(invites, 'No invitations right now.');
    challenges.forEach(m => matchCard(m, invites));
    if (incoming.length) invites.append(control(`${incoming.length} friend ${incoming.length === 1 ? 'request' : 'requests'} →`, () => switchView('people', true), 'bt-text-link'));
    const friends = data.friends.filter(f => f.status === 'accepted');
    const quick = panel('Quick challenge', aside);
    for (const f of friends.slice(0, 4)) {
      const row = node('div', undefined, 'bt-quick-friend'); row.append(node('span', f.person.handle), button('Challenge', async () => {
        const m = await act('challenge', { user_id: f.person.id, game: 'connect-four' }); await viewMatch(m.id);
      }, 'Challenge ' + f.person.handle)); quick.append(row);
    }
    if (!friends.length) empty(quick, 'Add a friend to keep the rivalry going.');
    quick.append(control('Find players →', findPlayers, 'bt-text-link'));
    const activity = panel('Activity', aside);
    const notices = node('details', undefined, 'bt-activity');
    const unread = data.notifications.filter(n => !n.read_at).length;
    notices.append(node('summary', unread ? `${unread} new ${unread === 1 ? 'update' : 'updates'}` : 'Recent updates'));
    if (!data.notifications.length) empty(notices, 'Your challenges and results will appear here.');
    for (const n of data.notifications.slice(0, 5)) {
      const row = node('div', undefined, 'bt-notice'); row.append(node('p', n.kind), node('span', new Date(n.created_at).toLocaleDateString(), 'bt-caption'));
      if (n.match_id) row.append(button('Open game', () => viewMatch(n.match_id))); notices.append(row);
    }
    if (unread) notices.append(button('Mark activity read', () => act('read_notifications', { through: data.notifications[0].id })));
    activity.append(notices);
  }
  function peopleView(host, incoming) {
    const find = panel('Find your people', host, undefined, 'bt-find-panel'); find.id = 'bt-find';
    find.append(node('p', 'A strange username? Use the email you already know.', 'bt-lead'));
    const form = node('form', undefined, 'bt-search-form');
    const label = node('label', 'Username or exact account email'); label.htmlFor = 'bt-search';
    const input = node('input'); input.id = 'bt-search'; input.type = 'search'; input.maxLength = 254;
    input.autocomplete = 'off'; input.value = searchQuery; input.required = true; input.placeholder = 'Username or friend@example.com';
    input.oninput = () => { searchQuery = input.value; };
    const submit = node('button', 'Find players', 'action bt-primary'); submit.type = 'submit'; form.append(label, input, submit);
    form.onsubmit = e => { e.preventDefault(); run(async () => {
      searchResults = await act('search', { query: searchQuery.trim() }); searched = true; render(); $('#bt-search')?.focus();
    }); };
    find.append(form, node('p', 'Only opted-in members appear. Enter at least 3 username characters or a full email. Email visibility is controlled by each player.', 'bt-caption'));
    if (searched) {
      const results = node('div', undefined, 'bt-people-grid');
      if (!searchResults.length) empty(results, 'No members found. Check the username or exact account email.');
      searchResults.forEach(p => personCard(p, results)); find.append(results);
    }
    const pending = data.friends.filter(f => f.status === 'pending');
    if (pending.length) { const s = panel('Friend requests', host, incoming.length); const grid = node('div', undefined, 'bt-people-grid'); pending.forEach(f => personCard(f.person, grid, f)); s.append(grid); }
    const friends = data.friends.filter(f => f.status === 'accepted');
    const s = panel('Friends', host, friends.length); const grid = node('div', undefined, 'bt-people-grid');
    if (!friends.length) empty(grid, 'Your friends will appear here once a request is accepted.');
    friends.forEach(f => personCard(f.person, grid, f)); s.append(grid);
  }
  function historyView(host) {
    const totals = data.stats.reduce((a, s) => ({ wins: a.wins + s.wins, losses: a.losses + s.losses, draws: a.draws + s.draws }), { wins: 0, losses: 0, draws: 0 });
    const record = node('div', undefined, 'bt-record');
    const title = node('div'); title.append(node('p', 'THE LAST 90 DAYS', 'bt-kicker'), node('h3', 'Your record')); record.append(title);
    const values = node('dl');
    for (const [label, value] of [['Wins', totals.wins], ['Losses', totals.losses], ['Draws', totals.draws]]) { const stat = node('div'); stat.append(node('dt', label), node('dd', String(value))); values.append(stat); } record.append(values); host.append(record);
    const history = panel('Completed games', host); const finished = data.matches.filter(m => !['active', 'pending'].includes(m.status));
    if (!finished.length) empty(history, 'Finish your first game to start a record.'); else finished.forEach(m => matchCard(m, history));
    if (data.stats.length) {
      const stats = panel('Head-to-head', host); const table = node('table'); const heading = node('tr');
      for (const text of ['Opponent', 'Your wins', 'Their wins', 'Draws']) heading.append(node('th', text));
      const thead = node('thead'); thead.append(heading); table.append(thead); const tbody = node('tbody');
      for (const s of [...data.stats].sort((a, b) => b.wins - a.wins)) { const tr = node('tr'); for (const text of [s.opponent?.handle || 'Former member', s.wins, s.losses, s.draws]) tr.append(node('td', String(text))); tbody.append(tr); }
      table.append(tbody); stats.append(table);
    }
  }
  function settingsView(host) {
    const settings = panel('Privacy & membership', host, undefined, 'bt-settings-panel');
    settings.append(node('p', 'Choose what other players can see.', 'bt-lead'));
    const label = node('label', 'Email visibility'); const select = node('select'); select.id = 'bt-email-visibility';
    for (const [value, text] of [['hidden', 'Hidden from everyone'], ['friends', 'Show to accepted friends only']]) { const opt = node('option', text); opt.value = value; select.append(opt); }
    select.value = data.email_visibility; label.append(select);
    const form = node('div', undefined, 'bt-settings-form'); form.append(label, button('Save visibility', () => act('settings', { email_visibility: select.value })));
    settings.append(form, node('p', 'Exact email lookup identifies your username even when your address is hidden. Random matches never display email.', 'bt-caption'));
    const blocks = panel('Blocked players', host);
    if (!data.blocks.length) empty(blocks, 'You have not blocked anyone.');
    for (const p of data.blocks) { const row = node('div', undefined, 'bt-row'); row.append(node('p', p.handle), button('Unblock', () => act('unblock', { user_id: p.id }))); blocks.append(row); }
    const membership = panel('Membership', host); const leave = node('details'); leave.append(node('summary', 'Leave Bored Together'));
    leave.append(node('p', 'Leaving immediately hides you from discovery, removes friendships, cancels invitations and queue entries, and forfeits active matches. Opponents keep game history for up to 90 days. Blocks remain so they still protect you if you rejoin. Your Bored account and single-player scores stay available.'));
    leave.append(button('Leave and forfeit active games', async () => { await act('leave'); back(); searchResults = []; searchQuery = ''; searched = false; dashboardView = 'games'; })); membership.append(leave);
  }
  function renderBoard(m, host) {
    let board = m.state.board;
    if (review !== null && Array.isArray(m.moves)) {
      board = Array(42).fill(0);
      for (const move of m.moves.slice(0,review)) {
        const col=move.move.column;
        for (let r=5;r>=0;r--) if (!board[r*7+col]) { board[r*7+col]=move.actor===m.p1?1:2; break; }
      }
    }
    const canPlay = m.status==='active' && m.turn_user===owner && (review === null || review === m.moves?.length);
    const columns=node('div',undefined,'bt-columns');
    for (let col=0;col<7;col++) {
      const b=button(String(col+1), async () => {
        const pendingKey='bored.together.pending.'+owner+'.'+m.id;
        let pending=readStored(pendingKey,null);
        if (!pending || pending.version!==m.version || pending.column!==col) {
          pending={match_id:m.id,column:col,version:m.version,request_id:crypto.randomUUID()}; writeStored(pendingKey,pending);
        }
        await act('move',pending); removeStored(pendingKey);
      },'Drop in column '+(col+1));
      b.disabled=!canPlay || board[col]!==0; columns.append(b);
    }
    if (m.status==='active') host.append(columns);
    const grid=node('div',undefined,'bt-board'); grid.setAttribute('role','img');
    grid.setAttribute('aria-label','Connect Four board. Red: '+m.p1_handle+'. Gold: '+m.p2_handle+'.');
    board.forEach((v,i) => {
      const cell=node('span',v===1?'R':v===2?'G':'·','bt-disc bt-p'+v);
      cell.setAttribute('aria-label',`Row ${Math.floor(i/7)+1}, column ${i%7+1}: ${v===1?'red':v===2?'gold':'empty'}`); grid.append(cell);
    }); host.append(grid);
  }
  function matchView() {
    const m = current;
    content.append(control('← Dashboard', back, 'bt-text-link bt-match-back'));
    const layout = node('div', undefined, 'bt-match-layout');
    const game = node('section', undefined, 'bt-match-play');
    const h = node('h3', name(m.game)); h.id = 'bt-match-heading'; h.tabIndex = -1;
    game.append(node('p', 'YOU VS ' + (m.opponent?.handle || 'FORMER MEMBER').toUpperCase(), 'bt-kicker'), h);
    const result = m.status === 'completed' ? (m.winner === owner ? 'You won.' : m.winner ? 'Your opponent won.' : 'A draw.') :
      m.status === 'active' ? (m.turn_user === owner ? 'Your turn. Pick a column.' : 'Waiting for your opponent. Come back whenever.') :
      m.status === 'pending' ? (m.p2 === owner ? 'You have been challenged.' : 'Invitation sent. Waiting for acceptance.') : m.status + '.';
    game.append(node('p', result, 'bt-match-message'));
    if (m.game === 'connect-four') renderBoard(m, game);
    const aside = node('aside', undefined, 'bt-match-info');
    aside.append(node('p', 'THE MATCH', 'bt-kicker'), node('h4', m.p1_handle + ' vs ' + m.p2_handle));
    const legend = node('div', undefined, 'bt-legend');
    for (const [seat, handle] of [[1, m.p1_handle], [2, m.p2_handle]]) {
      const row = node('p'); row.append(node('span', undefined, 'bt-legend-dot bt-mini-' + seat), node('span', handle + (seat === 1 ? ' · Red' : ' · Gold'))); legend.append(row);
    }
    aside.append(legend, node('p', m.reason || 'Your game is saved after every turn. Neither player needs to stay online.', 'bt-caption'));
    const actions = node('div', undefined, 'bt-match-options');
    if (m.status === 'pending') {
      if (m.p2 === owner) actions.append(primary(button('Accept challenge', () => act('accept', { match_id: m.id }))), button('Decline challenge', () => act('decline', { match_id: m.id })));
      else actions.append(button('Cancel invitation', () => act('cancel', { match_id: m.id })));
    }
    if (m.status === 'active') {
      const resign = node('details'); resign.append(node('summary', 'Resign this game'), button('Confirm resignation', () => act('resign', { match_id: m.id }))); actions.append(resign);
    }
    if (m.status === 'completed') actions.append(primary(button('Rematch', async () => {
      const next = await act('rematch', { match_id: m.id, game: m.game }); await viewMatch(next.id);
    })));
    if (m.status !== 'pending' && m.moves?.length) {
      const label = node('label', 'Review moves '), slider = node('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(m.moves.length);
      slider.value = String(review ?? m.moves.length); slider.setAttribute('aria-label', 'Review move number');
      slider.oninput = () => { review = Number(slider.value); render(); }; label.append(slider);
      actions.append(label, node('p', 'Move ' + (review ?? m.moves.length) + ' of ' + m.moves.length, 'bt-caption'));
    }
    const options = node('details'); options.append(node('summary', 'Opponent options'), button('Block opponent', async () => { await act('block', { user_id: m.opponent.id }); back(); }));
    actions.append(options); aside.append(actions); layout.append(game, aside); content.append(layout);
  }
  function render() {
    if (!visible) return;
    // Keep typed search and keyboard focus across notification refreshes.
    const active=document.activeElement, focusId=active?.id;
    const start=active?.selectionStart, end=active?.selectionEnd;
    content.replaceChildren();
    if (!owner || data?.enrolled===false) intro();
    else if (!data) content.append(node('p','Loading your membership…'));
    else if (current) matchView(); else dashboard();
    if (focusId) {
      const next=document.getElementById(focusId);
      if (next) { next.focus({preventScroll:true}); try{next.setSelectionRange(start,end);}catch{} }
    }
  }
  $('#together-nav').onclick=e=>{e.preventDefault();open();};
  $('#together-home-link').onclick=e=>{e.preventDefault();open();};
  $('#together-refresh').onclick=()=>run(()=>refresh(true));
  $('#together-back').onclick=()=>{close();try{history.replaceState(null,'','#library');}catch{} $('#library').scrollIntoView();};
  for (const link of document.querySelectorAll('.site-nav a:not(#together-nav)')) link.addEventListener('click',close);
  window.addEventListener('bored:identity',()=>{resetIdentity();refresh(true);});
  window.addEventListener('bored:together-open',open);
  window.addEventListener('focus',()=>refresh());
  window.addEventListener('online',()=>refresh(true));
  window.addEventListener('hashchange',()=>{if(location.hash==='#together')open();else close();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(()=>{if(!document.hidden && hasIdentity())refresh();},15000);
  resetIdentity(); refresh();
  if(location.hash==='#together')open();
  return { open, refresh };
}

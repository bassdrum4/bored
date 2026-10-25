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
  let searchResults = [], searchQuery = '', review = null;
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
    data = current = selected = null; searchResults = []; searchQuery = ''; review = null;
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
    visible = true;
    for (const e of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) e.hidden = true;
    root.hidden = false; $('#together-nav').setAttribute('aria-current', 'page');
    try { history.replaceState(null, '', '#together'); } catch {}
    resetIdentity(); render(); refresh(true);
    root.scrollIntoView({ block: 'start' });
  }
  function close() {
    visible = false; root.hidden = true; $('#together-nav').removeAttribute('aria-current');
    for (const e of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) e.hidden = false;
  }
  function section(title, host = content) {
    const s = node('section', undefined, 'bt-section'); s.append(node('h3', title)); host.append(s); return s;
  }
  function empty(host, text) { host.append(node('p', text, 'section-note')); }
  async function act(action, args) { return togetherRPC(action, args); }
  async function viewMatch(id) {
    selected = id; review = null; writeStored(key(), id);
    current = await act('match', { match_id: id }); render();
    $('#bt-match-heading')?.focus();
  }
  function back() { current = selected = null; review = null; removeStored(key()); render(); }
  function intro() {
    const wrap = node('div', undefined, 'bt-intro');
    wrap.append(node('h3', 'One turn now. The next whenever.'),
      node('p', 'Challenge a friend or meet a random opponent. Play a move, close Bored, and pick up where you left off on any signed-in device.'),
      node('p', 'Joining is optional. Your username becomes searchable by other members. People who already know your exact account email can find your username. Your email address stays hidden by default; you can choose to show it to accepted friends later. Random matches never display email.'),
      node('p', 'You can leave at any time. Leaving removes friendships and invitations, exits the queue, and forfeits active games. Match history and opponent statistics remain for 90 days; notifications for 30 days. Blocking cancels games between you without a win.'));
    const join = button('Join Bored Together', async () => {
      if (!hasIdentity()) { openAuthDialog('signin'); return; }
      await ensureProfile(); await act('enroll', { consent_version: CONSENT_VERSION });
    }); join.classList.add('primary-action'); wrap.append(join);
    if (!owner) wrap.append(node('p', 'Use your existing Bored account. Sign in first, then choose Join.', 'section-note'));
    content.append(wrap);
  }
  function friendState(id) { return data.friends.find(f => f.person.id === id); }
  function personCard(p, host, friend = friendState(p.id)) {
    const row = node('article', undefined, 'bt-row');
    const copy = node('div'); copy.append(node('h4', p.handle));
    if (p.email) copy.append(node('p', p.email, 'bt-email'));
    const stat = data.stats.find(s => s.opponent?.id === p.id);
    if (stat) copy.append(node('p', `${stat.wins} wins · ${stat.losses} losses · ${stat.draws} draws vs you (90 days)`, 'section-note'));
    row.append(copy);
    const actions = node('div', undefined, 'bt-actions');
    actions.append(button('Challenge', async () => {
      const m = await act('challenge', { user_id: p.id, game: 'connect-four' }); await viewMatch(m.id);
    }, 'Challenge ' + p.handle));
    if (!friend) actions.append(button('Add friend', () => act('friend_request', { user_id: p.id }), 'Add ' + p.handle + ' as a friend'));
    else if (friend.status === 'pending') {
      if (friend.sender !== owner) actions.append(button('Accept friend', () => act('friend_accept', { user_id: p.id })));
      actions.append(button(friend.sender === owner ? 'Cancel request' : 'Decline friend', () => act('friend_decline', { user_id: p.id })));
    } else actions.append(button('Remove friend', () => act('friend_remove', { user_id: p.id })));
    actions.append(button('Block', () => act('block', { user_id: p.id }), 'Block ' + p.handle));
    row.append(actions); host.append(row);
  }
  function matchCard(m, host) {
    const row = node('article', undefined, 'bt-row');
    const result = m.status === 'completed' ? (m.winner === owner ? 'You won' : m.winner ? 'You lost' : 'Draw') :
      m.status === 'active' ? (m.turn_user === owner ? 'Your turn' : 'Their turn') : m.status;
    row.append(node('p', `${name(m.game)} · ${m.opponent?.handle || 'Former member'} · ${result}`));
    const actions = node('div', undefined, 'bt-actions');
    actions.append(button(m.status === 'active' ? 'Resume' : 'Review', () => viewMatch(m.id), 'Open game with ' + m.opponent?.handle));
    if (m.status === 'pending') {
      if (m.p2 === owner) actions.append(button('Accept', async () => { await act('accept', { match_id: m.id }); await viewMatch(m.id); }),
        button('Decline', () => act('decline', { match_id: m.id })));
      else actions.append(button('Cancel invitation', () => act('cancel', { match_id: m.id })));
    }
    row.append(actions); host.append(row);
  }
  function dashboard() {
    const play = section('Start a game');
    play.append(node('p', 'Connect Four · take turns whenever you have a moment.', 'section-note'));
    const choices = node('div', undefined, 'bt-actions');
    choices.append(button('Challenge Someone', () => { $('#bt-find')?.scrollIntoView(); $('#bt-search')?.focus(); }),
      button('Play Random', async () => {
        const result = await act('queue_join', { game: 'connect-four' });
        if (result.id) await viewMatch(result.id);
      })); play.append(choices);
    const groups = [
      ['Your Turn', m => m.status === 'active' && m.turn_user === owner, 'All caught up.'],
      ['Waiting for Opponent', m => m.status === 'active' && m.turn_user !== owner, 'No games waiting.'],
      ['Challenges', m => m.status === 'pending', 'No pending challenges.']
    ];
    for (const [title, predicate, note] of groups) {
      const s = section(title), matches = data.matches.filter(predicate);
      if (!matches.length) empty(s, note); else matches.forEach(m => matchCard(m, s));
    }
    const friends = section('Friends');
    if (!data.friends.length) empty(friends, 'Find someone below and send a friend request.');
    for (const f of data.friends) personCard(f.person, friends, f);
    const find = section('Find Players'); find.id = 'bt-find';
    const form = node('form', undefined, 'bt-search-form');
    const label = node('label', 'Username or exact account email'); label.htmlFor = 'bt-search';
    const input = node('input'); input.id = 'bt-search'; input.type = 'search'; input.maxLength = 254;
    input.autocomplete = 'off'; input.value = searchQuery; input.required = true;
    input.oninput = () => { searchQuery = input.value; };
    const submit = node('button', 'Find players', 'action'); submit.type = 'submit';
    form.append(label, input, submit);
    form.onsubmit = e => { e.preventDefault(); run(async () => {
      searchResults = await act('search', { query: searchQuery.trim() }); render();
      $('#bt-search')?.focus();
    }); };
    find.append(form, node('p', 'Only members appear. Usernames use a prefix of at least 3 characters; emails must match exactly. Limited to 20 searches per minute and 200 per day.', 'section-note'));
    if (searchQuery && !searchResults.length) empty(find, 'No results yet. Search for a member above.');
    for (const p of searchResults) personCard(p, find);
    const random = section('Random Match');
    if (data.queue.length) {
      empty(random, 'Waiting for another Connect Four player. You can close Bored; pairing will be saved when someone joins. Queue entries expire after 7 days.');
      random.append(button('Cancel random search', () => act('queue_cancel', { game: 'connect-four' })));
    } else empty(random, 'Choose Play Random above to find an opponent. You do not need to be online together. More games will appear here as server rules become available.');
    const history = section('Completed Games');
    const finished = data.matches.filter(m => !['active','pending'].includes(m.status));
    if (!finished.length) empty(history, 'Your recent games will appear here.');
    else finished.forEach(m => matchCard(m, history));
    const stats = section('Head-to-head · last 90 days');
    const totals = data.stats.reduce((a, s) => ({ wins:a.wins+s.wins, losses:a.losses+s.losses, draws:a.draws+s.draws }), { wins:0,losses:0,draws:0 });
    stats.append(node('p', `${totals.wins} wins · ${totals.losses} losses · ${totals.draws} draws`));
    const table = node('table'); const heading = node('tr');
    for (const text of ['Opponent','Your wins','Their wins','Draws']) heading.append(node('th', text));
    const thead = node('thead'); thead.append(heading); table.append(thead);
    const tbody = node('tbody');
    for (const s of [...data.stats].sort((a,b) => b.wins-a.wins)) {
      const tr = node('tr'); for (const text of [s.opponent?.handle || 'Former member',s.wins,s.losses,s.draws]) tr.append(node('td', String(text))); tbody.append(tr);
    }
    table.append(tbody); stats.append(table);
    const notices = section('Activity');
    if (!data.notifications.length) empty(notices, 'Challenges, requests, turns and results will appear here.');
    for (const n of data.notifications.slice(0,10)) {
      const row = node('div', undefined, 'bt-row');
      row.append(node('p', (n.read_at ? '' : 'New · ') + n.kind + ' · ' + new Date(n.created_at).toLocaleDateString()));
      if (n.match_id) row.append(button('Open game', () => viewMatch(n.match_id))); notices.append(row);
    }
    if (data.notifications.some(n => !n.read_at)) notices.append(button('Mark activity read', () => act('read_notifications', { through:data.notifications[0].id })));
    const settings = section('Privacy & membership');
    const label2 = node('label', 'Email visibility '); const select = node('select'); select.id = 'bt-email-visibility';
    for (const [value,text] of [['hidden','Hidden from everyone'],['friends','Show to accepted friends only']]) {
      const opt = node('option', text); opt.value=value; select.append(opt);
    }
    select.value=data.email_visibility; label2.append(select); settings.append(label2,
      button('Save visibility', () => act('settings', { email_visibility:select.value })),
      node('p', 'Exact email lookup identifies your username even when your address is hidden. Random matches never display email.', 'section-note'));
    for (const p of data.blocks) {
      const row=node('div',undefined,'bt-row'); row.append(node('p', p.handle+' · blocked'),button('Unblock', () => act('unblock',{user_id:p.id}))); settings.append(row);
    }
    const leave = node('details'); leave.append(node('summary','Leave Bored Together'));
    leave.append(node('p','Leaving immediately hides you from discovery, removes friendships, cancels invitations and queue entries, and forfeits active matches. Opponents keep game history for up to 90 days. Blocks remain so they still protect you if you rejoin. Your Bored account and single-player scores stay available.'));
    leave.append(button('Leave and forfeit active games', async () => {
      await act('leave'); back(); searchResults=[]; searchQuery='';
    })); settings.append(leave);
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
    const m=current;
    content.append(button('← Dashboard', back));
    const h=node('h3',name(m.game)+' vs '+m.opponent?.handle); h.id='bt-match-heading'; h.tabIndex=-1;
    const s=section('Match'); s.replaceChildren(h);
    const result=m.status==='completed' ? (m.winner===owner?'You won.':m.winner?'Your opponent won.':'A draw.') :
      m.status==='active' ? (m.turn_user===owner?'Your turn. Pick a column.':'Waiting for your opponent. Come back whenever.') :
      m.status==='pending' ? (m.p2===owner?'You have been challenged.':'Invitation sent. Waiting for acceptance.') : m.status+'.';
    s.append(node('p',result+' '+(m.reason||'')),node('p',`Red: ${m.p1_handle} · Gold: ${m.p2_handle}`, 'section-note'));
    if (m.game==='connect-four') renderBoard(m,s);
    const actions=node('div',undefined,'bt-actions');
    if (m.status==='pending') {
      if(m.p2===owner) actions.append(button('Accept challenge',()=>act('accept',{match_id:m.id})),button('Decline challenge',()=>act('decline',{match_id:m.id})));
      else actions.append(button('Cancel invitation',()=>act('cancel',{match_id:m.id})));
    }
    if (m.status==='active') {
      const resign=node('details'); resign.append(node('summary','Resign this game'),button('Confirm resignation',()=>act('resign',{match_id:m.id}))); actions.append(resign);
    }
    if (m.status==='completed') actions.append(button('Rematch',async()=>{
      const next=await act('rematch',{match_id:m.id,game:m.game}); await viewMatch(next.id);
    }));
    s.append(actions);
    if (m.status!=='pending' && m.moves?.length) {
      const label=node('label','Review moves '), slider=node('input'); slider.type='range'; slider.min='0'; slider.max=String(m.moves.length);
      slider.value=String(review??m.moves.length); slider.setAttribute('aria-label','Review move number');
      slider.oninput=()=>{review=Number(slider.value);render();}; label.append(slider); s.append(label,node('p','Move '+(review??m.moves.length)+' of '+m.moves.length,'section-note'));
    }
    s.append(button('Block opponent',async()=>{await act('block',{user_id:m.opponent.id});back();}));
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

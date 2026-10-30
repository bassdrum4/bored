import { hasIdentity, getSession, ensureProfile } from './backend.js';
import { togetherRPC, inviteRPC, CONSENT_VERSION } from './together-api.js';
import { TOGETHER_GAMES } from '../games/catalog.js';
import { TOGETHER_ADAPTERS } from './together-player.js';
import { readStored, writeStored, removeStored } from './store.js';

export function createTogetherUI({ openAuthDialog, playMatch }) {
  const $ = s => document.querySelector(s);
  const root = $('#together'), content = $('#together-content'), status = $('#together-status');
  let owner = null, data = null, visible = false, busy = false, generation = 0, flight = null;
  let lastRefresh = 0;
  let flow = null, selectedGame = 'connect-four', people = null, outsiders = null, outsidersError = '';
  // An invite is an ordinary game for later: the recipient has not joined yet.
  const invited = new Map();
  let invite = null, inviteAccepted = false, inviteBusy = false;
  const dismissedInvites = new Set();
  const inviteDialog = $('#invite-dialog');
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
  function dialogOpen(dialog) {
    if (!dialog) return;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  }
  function dialogClose(dialog) {
    if (!dialog) return;
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
  }
  function updateBadge() {
    const count = data?.enrolled ? data.matches.filter(m => m.status === 'active' && m.turn_user === owner).length : 0;
    $('#together-badge').hidden = !count; $('#together-badge').textContent = String(count);
    $('#together-home').hidden = !count;
    $('#together-home-link').textContent = count + (count === 1 ? ' game needs' : ' games need') + ' your attention →';
  }
  function resetIdentity() {
    const next = hasIdentity() ? getSession()?.user?.id : null;
    if (owner === next) return;
    owner = next; generation++; flight = null; busy = false; lastRefresh = 0; root.removeAttribute('aria-busy');
    data = flow = people = outsiders = null; outsidersError = ''; invited.clear(); status.textContent = '';
    invite = null; inviteAccepted = false;
    if (inviteDialog?.open) dialogClose(inviteDialog);
    updateBadge(); render();
  }
  async function refresh(force = false) {
    resetIdentity();
    if (!owner || document.hidden || busy && !force) return;
    if (flight) return flight;
    // An unopened Together tab still gets badge updates, but doesn't poll
    // every 15 seconds for someone playing other games.
    if (!force && Date.now() - lastRefresh < (visible ? 14000 : 55000)) return;
    const stamp = generation;
    const task = (async () => {
      try {
        const next = await togetherRPC('dashboard');
        if (stamp !== generation) return;
        const changed = JSON.stringify(data) !== JSON.stringify(next);
        data = next; lastRefresh = Date.now(); updateBadge();
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
    flow = null; people = null; render();
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
  /* ── Invitations ────────────────────────────────────────────────────────── */

  // Shown to a signed-in Bored account that is not in Bored Together, the next
  // time it opens a game. Closing only dismisses it for this page; accepting
  // holds the challenge on the server until the account joins.
  function inviteCopy() {
    const who = invite?.inviter || 'A Bored Together member';
    $('#invite-title').textContent = who + ' invited you to ' + name(invite.game);
    $('#invite-blurb').textContent = inviteAccepted
      ? 'Saved. The game stays with your account and will be in Your Games as soon as you join Bored Together.'
      : who + ' would like to play ' + name(invite.game) + ' with you on Bored Together, the arcade\u2019s two-player side. Take a turn, then come back whenever.';
    $('#invite-how').textContent = 'To join, open Bored Together and choose Join Bored Together. ' +
      name(invite.game) + ' will be waiting in Your Games.';
    $('#invite-accept').textContent = inviteAccepted ? 'Join Bored Together' : 'Accept invite';
  }
  function inviteTone(text, error) {
    const el = $('#invite-status');
    el.textContent = text; el.dataset.tone = error ? 'error' : '';
  }
  async function checkInvites() {
    if (!hasIdentity() || inviteBusy || inviteDialog?.open) return;
    if (!document.body.classList.contains('playing')) return;
    try {
      const result = await inviteRPC('list');
      if (!result || result.enrolled) return;
      const next = (result.invites || []).find(item => item?.id && !dismissedInvites.has(item.id));
      if (!next) return;
      invite = next; inviteAccepted = next.status === 'accepted';
      inviteTone('', false); inviteCopy(); dialogOpen(inviteDialog);
      $('#invite-close').focus();
    } catch {
      // An invitation is never worth interrupting a game with an error.
    }
  }
  async function acceptInvite() {
    if (!invite || inviteBusy) return;
    if (inviteAccepted) { dialogClose(inviteDialog); invite = null; open(); return; }
    inviteBusy = true; const accept = $('#invite-accept'); accept.disabled = true;
    inviteTone('Saving\u2026', false);
    try {
      await inviteRPC('accept', { id: invite.id });
      inviteAccepted = true; inviteCopy();
      inviteTone('Accepted. Join Bored Together and the game will be waiting for you.', false);
    } catch (error) { inviteTone(error.message, true); }
    finally { inviteBusy = false; accept.disabled = false; }
  }
  if (inviteDialog) {
    $('#invite-accept').onclick = acceptInvite;
    $('#invite-close').onclick = () => { if (invite) dismissedInvites.add(invite.id); dialogClose(inviteDialog); };
    inviteDialog.addEventListener('close', () => { if (invite) dismissedInvites.add(invite.id); });
  }
  function intro() {
    // A member who joined under the older notice is shown the new one once
    // before their list loads: the directory now shows their email.
    const renew = data?.renew === true;
    const intro = node('div', undefined, 'bt-enrollment');
    intro.append(node('h3', renew ? 'A change to Bored Together' : 'Play a turn. Come back whenever.'),
      node('p', renew
        ? 'Games now start with your turn and go to the other player when you save it. Members are picked from a list, so you can see who else is here without typing an address.'
        : 'Send a game by playing the first turn. It reaches the other player as theirs to play, and it waits for both of you between turns. A few games are a single run instead: the same board for both, and the higher score wins.'),
      node('p', 'Joining puts your display name and email in the member list, where other members can see and pick you. Leaving removes you from it.', 'bt-caption'),
      button(renew ? 'Review and continue' : 'Join Bored Together', async () => {
        if (!hasIdentity()) { openAuthDialog('signin'); return; }
        await ensureProfile(); await togetherRPC('enroll', { consent_version: CONSENT_VERSION });
        // An accepted invite is held until enrollment; it becomes a game now.
        try { await inviteRPC('claim'); } catch { /* joining still works */ }
      }, true));
    content.append(intro);
  }
  function overflow(host, match) {
    const opponent = match?.opponent;
    const more = node('details', undefined, 'bt-more');
    const summary = node('summary', 'More'); summary.setAttribute('aria-label', opponent ? 'Options for ' + opponent.handle : 'Bored Together options');
    more.append(summary);
    if (match) {
      // Deleting removes the game for both players; nothing is awarded.
      const remove = node('details');
      remove.append(node('summary', 'Delete game'),
        node('p', 'This deletes the game for both of you. No winner is recorded.', 'bt-caption'),
        button('Confirm delete', () => togetherRPC('delete', { match_id: match.id })));
      more.append(remove);
    }
    if (opponent) more.append(button('Block ' + opponent.handle, () => togetherRPC('block', { user_id: opponent.id })));
    else {
      for (const p of data.blocks || []) more.append(button('Unblock ' + p.handle, () => togetherRPC('unblock', { user_id: p.id })));
      const leave = node('details'); leave.append(node('summary', 'Leave Bored Together'),
        node('p', 'Leaving removes you from the member list, cancels games you have not sent and forfeits ones in progress.', 'bt-caption'),
        button('Confirm leave', () => togetherRPC('leave')));
      more.append(leave);
    }
    host.append(more);
  }
  function picker() {
    const box = node('section', undefined, 'bt-start');
    box.setAttribute('aria-label', flow === 'challenge' ? 'Start a game' : 'Play random');
    const label = node('label', 'Choose a game ', 'bt-game-picker'), select = node('select'); select.id = 'bt-game-select';
    for (const [slug, game] of Object.entries(TOGETHER_GAMES)) {
      if (!TOGETHER_ADAPTERS[slug]) continue;
      const option = node('option', game.name); option.value = slug; select.append(option);
    }
    select.value = selectedGame;
    select.onchange = () => { selectedGame = select.value; render(); };
    label.append(select); box.append(label);
    if (flow === 'random') box.append(button('Find opponent', async () => {
      const result = await togetherRPC('queue_join', { game: selectedGame });
      flow = null; if (result.id) await launch(result.id);
    }, true));
    else {
      box.append(node('p', TOGETHER_GAMES[selectedGame]?.mode === 'duel'
        ? 'Pick a member. You both get the same board and the higher run wins; neither score is shown until both are in.'
        : 'Pick a member and play the first turn. It reaches them as their game, so nothing is sent until your turn is saved.', 'bt-caption'));
      if (!people) box.append(node('p', 'Loading members…', 'bt-caption'));
      else if (!people.length) box.append(node('p', 'Nobody else has joined yet. Anyone who joins appears here.', 'bt-caption'));
      else {
        const list = node('div', undefined, 'bt-people'); list.id = 'bt-people';
        for (const person of people) {
          const row = node('div', undefined, 'bt-person');
          const who = node('div');
          who.append(node('strong', person.handle), node('span', person.email || 'No email on this account', 'bt-caption'));
          row.append(who, button('Play', async () => {
            const match = await togetherRPC('challenge', { user_id: person.id, game: selectedGame });
            flow = null; people = null; outsiders = null; await launch(match.id);
          }, true));
          list.append(row);
        }
        box.append(list);
      }
      // The second list is short: accounts that exist in Bored but have not
      // joined Together yet. Inviting uses the game chosen above.
      const outside = node('section', undefined, 'bt-outsiders');
      outside.append(node('h4', 'Not in Bored Together yet'),
        node('p', 'Invite one of them to ' + name(selectedGame) + '. They see it the next time they open a game, and it is waiting for them when they join.', 'bt-caption'));
      if (outsidersError) outside.append(node('p', outsidersError, 'bt-caption'));
      else if (!outsiders) outside.append(node('p', 'Loading…', 'bt-caption'));
      else if (!outsiders.length) outside.append(node('p', 'Nobody else has a Bored account to invite right now.', 'bt-caption'));
      else {
        const list = node('div', undefined, 'bt-people'); list.id = 'bt-outsiders';
        for (const person of outsiders) {
          const row = node('div', undefined, 'bt-person');
          const who = node('div');
          who.append(node('strong', person.handle), node('span', 'Not in Bored Together', 'bt-caption'));
          const key = person.id + ':' + selectedGame;
          if (invited.has(key)) row.append(who, node('span', 'Invited', 'bt-caption'));
          else row.append(who, button('Invite', async () => {
            const sent = await inviteRPC('send', { user_id: person.id, game: selectedGame });
            invited.set(key, true);
            status.textContent = 'Invite sent to ' + sent.handle + '. It waits for them until they join.';
            render();
          }, true));
          list.append(row);
        }
        outside.append(list);
      }
      box.append(outside);
    }
    box.append(button('Cancel', () => { flow = null; people = null; render(); }));
    content.append(box);
  }
  function valueText(m, seat) {
    const raw = m.state?.plays?.[seat];
    if (raw == null || raw === '') return '';
    const value = Number(raw);
    const unit = TOGETHER_GAMES[m.game]?.unit;
    if (!Number.isFinite(value)) return '';
    return value.toLocaleString('en-US') + (unit ? ' ' + unit : '');
  }
  // A duel has no shared board to show, so the row is the scoreboard: what you
  // sent, what you have to beat, and how it ended.
  function runLine(m, turn) {
    const mine = m.p1 === owner ? '1' : '2', theirs = mine === '1' ? '2' : '1';
    if (m.status === 'completed') {
      const head = m.winner === owner ? 'You won' : m.winner ? 'You lost' : 'Draw';
      const scores = [valueText(m, mine), valueText(m, theirs)].filter(Boolean);
      return head + (scores.length === 2 ? ' · ' + scores[0] + ' to ' + scores[1] : '');
    }
    // A submitted run leads provisionally until the opponent has played.
    // Never label it a final win or expose the score before both finish.
    if (valueText(m, mine) && !valueText(m, theirs)) return 'Leading for now · awaiting their run';
    if (valueText(m, theirs) && !valueText(m, mine)) return 'Opponent leading for now · your run';
    if (turn) return valueText(m, theirs) ? 'Your run · beat ' + valueText(m, theirs) : 'Your run';
    return valueText(m, mine) ? 'Their run · you sent ' + valueText(m, mine) : 'Their run';
  }
  function matchRow(m, host) {
    const duel = m.mode === 'duel';
    const turn = m.status === 'active' && m.turn_user === owner;
    const row = node('article', undefined, 'bt-match-row' + (turn ? ' bt-ready' : ''));
    row.dataset.matchId = m.id;
    const copy = node('div', undefined, 'bt-match-copy');
    copy.append(node('h4', name(m.game) + ' · ' + (m.opponent?.handle || 'Former member')),
      node('p', duel ? runLine(m, turn)
        : m.status === 'active' ? (turn ? 'Your turn' : 'Their turn')
        : m.winner === owner ? 'You won' : m.winner ? 'You lost' : 'Draw', 'bt-caption'));
    const actions = node('div', undefined, 'bt-actions');
    if (m.status === 'active' && turn) actions.append(button(duel ? 'Play run' : 'Play turn', () => launch(m.id), true));
    // Watching the board you are waiting on is harmless in a turn game; a duel
    // has nothing to look at once your run is in.
    else if (m.status === 'active' && !duel) actions.append(button('Open', () => launch(m.id)));
    else if (m.status === 'completed') actions.append(button('Rematch', async () => {
      // A rematch is played first too, so it usually opens straight away. If the
      // other player already started it, there is nothing to send.
      const next = await togetherRPC('rematch', { match_id: m.id, game: m.game });
      if (next.turn_user === owner) await launch(next.id);
      else status.textContent = 'They already started the rematch.';
    }));
    overflow(actions, m);
    row.append(copy, actions); host.append(row);
  }
  function dashboard() {
    const start = node('div', undefined, 'bt-start-actions');
    // The member list is only fetched when the picker is opened.
    start.append(button('Start a Game', async () => {
      people = await togetherRPC('people');
      // A list that failed to load must not read as "nobody to invite": the
      // endpoint is easy to miss when a deployment lands before its SQL does.
      outsiders = null; outsidersError = '';
      try {
        const list = await inviteRPC('candidates', { game: selectedGame });
        outsiders = Array.isArray(list) ? list : [];
      } catch (error) {
        outsiders = []; outsidersError = error.message || 'Invitations are not available right now.';
      }
      flow = 'challenge'; render(); $('#bt-game-select')?.focus();
    }, true),
      button('Play Random', () => { flow = 'random'; people = null; render(); $('#bt-game-select')?.focus(); }));
    overflow(start, null); content.append(start);
    if (flow) picker();
    const games = node('section'); games.id = 'bt-your-games'; games.append(node('h3', 'Your Games'));
    const attention = m => m.status === 'active' && m.turn_user === owner ? 0 : m.status === 'completed' ? 2 : 1;
    const open = data.matches.filter(m => m.status === 'active');
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
    if (!visible) window.dispatchEvent(new CustomEvent('bored:together-telemetry', { detail: { kind: 'bt_view' } }));
    visible = true; people = null; outsiders = null; outsidersError = ''; document.body.classList.add('together-open');
    for (const el of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) el.hidden = true;
    root.hidden = false; $('#together-nav').setAttribute('aria-current', 'page');
    try { history.replaceState(null, '', '#together'); } catch {}
    resetIdentity(); render(); refresh(true); root.scrollIntoView({ block: 'start' });
  }
  function close() {
    visible = false; flow = people = null; root.hidden = true;
    document.body.classList.remove('together-open'); $('#together-nav').removeAttribute('aria-current');
    for (const el of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) el.hidden = false;
  }
  $('#together-nav').onclick = e => { e.preventDefault(); open(); };
  $('#together-home-link').onclick = e => { e.preventDefault(); open(); };
  $('#together-refresh').onclick = () => run(() => refresh(true));
  $('#together-back').onclick = () => { close(); try { history.replaceState(null, '', '#library'); } catch {} $('#library').scrollIntoView(); };
  for (const link of document.querySelectorAll('.site-nav a:not(#together-nav)')) link.addEventListener('click', close);
  window.addEventListener('bored:identity', () => {
    resetIdentity(); refresh(true);
    // A game already on screen gets the invite notice for the new account.
    if (document.body.classList.contains('playing')) setTimeout(checkInvites, 400);
  });
  window.addEventListener('bored:together-open', event => {
    if (TOGETHER_ADAPTERS[event.detail?.game]) selectedGame = event.detail.game;
    open(); flow = 'challenge'; render();
    if (data?.enrolled) run(async () => { people = await togetherRPC('people'); render(); });
  });
  window.addEventListener('focus', () => refresh());
  window.addEventListener('online', () => refresh(true));
  window.addEventListener('hashchange', () => { if (location.hash === '#together') open(); else close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // Preserve quick updates while Together is open; outside it, a minute-level
  // badge refresh costs far fewer Auth and database requests on the Free tier.
  setInterval(() => { if (!document.hidden && hasIdentity()) refresh(); }, 15000);
  resetIdentity(); refresh(); if (location.hash === '#together') open();
  return { open, refresh, checkInvites };
}

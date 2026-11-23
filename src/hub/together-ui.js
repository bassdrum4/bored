import { hasIdentity, getSession, ensureProfile } from './backend.js';
import { togetherRPC, inviteRPC, liveRPC, CONSENT_VERSION } from './together-api.js';
import { TOGETHER_GAMES } from '../games/catalog.js';
import { PREVIEWS } from '../games/discovery.js';
import { TOGETHER_ADAPTERS } from './together-player.js';
import { TOGETHER_LIVE, LIVE_DEFAULTS } from './together-live.js';
import { readStored, writeStored, removeStored } from './store.js';
import { addMedal } from './invites.js';

export function createTogetherUI({ openAuthDialog, playMatch, playLive }) {
  const $ = s => document.querySelector(s);
  const root = $('#together'), content = $('#together-content'), status = $('#together-status');
  let owner = null, data = null, visible = false, busy = false, generation = 0, flight = null;
  let lastRefresh = 0;
  // Live games the account is in (rooms being set up, games running, ones that just finished).
  let liveGames = [], liveKey = '';
  const liveSelected = new Set();
  let liveCapacity = 2;
  let flow = null, selectedGame = 'connect-four', people = null, outsiders = null, outsidersError = '';
  // The one corner note: dismissed stays dismissed for that set of games, so it
  // can only reappear when something new is actually waiting.
  let noticeDismissed = '';
  // An invite is an ordinary game for later: the recipient has not joined yet.
  const invited = new Map();
  let invite = null, inviteBusy = false;
  // Every invitation waiting on this account, and the ids whose popup was
  // dismissed. The dismissal is kept per account, so an invitation is announced
  // once and never again; the invitation itself stays in the tab below.
  let inviteList = null, dismissedInvites = null;
  const dismissedKey = () => 'bored.together.invites.' + owner;
  function dismissedIds() {
    if (!dismissedInvites) {
      const saved = readStored(dismissedKey(), null);
      dismissedInvites = new Set(Array.isArray(saved) ? saved : []);
    }
    return dismissedInvites;
  }
  function dismissInvites(ids) {
    const seen = dismissedIds();
    let touched = false;
    for (const id of ids) if (id && !seen.has(id)) { seen.add(id); touched = true; }
    if (touched) writeStored(dismissedKey(), [...seen].slice(-200));
  }
  // The popup is a notice, not the invitation. Closing it stops that one coming
  // back, even on another visit; the other invitations waiting keep their own
  // notices, and the tab lists every one of them either way.
  function dismissShownInvite() {
    if (invite?.id) dismissInvites([invite.id]);
  }
  const inviteDialog = $('#invite-dialog');
  const resultDialog = $('#result-dialog');
  const name = game => TOGETHER_GAMES[game]?.name || game;
  // A retired game stays readable in the database but is no longer a row here.
  const offered = m => Boolean(TOGETHER_ADAPTERS[m.game]);
  const mySeat = g => (g?.seats || []).find(s => s.seat === g.me);
  // What a live row shows. Seconds-since-seen change on every read, so they stay out of what counts as a change.
  const liveSignature = list => JSON.stringify(list.map(g => [g.id, g.status, g.round, g.me, g.winner, g.config,
    (g.seats || []).map(s => [s.seat, s.user, s.handle, s.state, s.civ, s.controller, s.online])]));
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
  // Another dialog on screen owns the page: an invite waits for it rather than
  // stacking a second modal on top of it.
  const dialogBusy = () => !!document.querySelector('dialog[open]');
  /* ── Finished games ──────────────────────────────────────────────────────── */

  // A game can end on the other player's turn, while you are nowhere near
  // Bored Together. The first time you come back, the result is a popup; the
  // per-account map below remembers what was already announced so it is said
  // once and the list can carry the rest quietly.
  let resultsSeen = null;
  const resultsKey = () => 'bored.together.results.' + owner;
  function completedResults() {
    const out = [];
    for (const m of data?.matches || []) {
      if (!offered(m)) continue;
      // An unsent game was never anyone's turn, so it cannot have a result.
      if (m.status !== 'completed' || m.revealed_at == null) continue;
      out.push({ key: 'match:' + m.id,
        outcome: m.winner === owner ? 'won' : m.winner ? 'lost' : 'draw',
        game: name(m.game), who: m.opponent?.handle || '' });
    }
    for (const g of liveGames) {
      if (g.status !== 'completed') continue;
      const seat = mySeat(g);
      if (!seat || seat.state === 'left') continue;
      out.push({ key: 'live:' + g.id,
        outcome: g.winner == null ? 'draw' : g.winner === seat.seat ? 'won' : 'lost',
        game: name(g.game) + ' live', who: '' });
    }
    return out;
  }
  function seenResults() {
    if (resultsSeen) return resultsSeen;
    const saved = readStored(resultsKey(), null);
    resultsSeen = new Set(Array.isArray(saved) ? saved : []);
    return resultsSeen;
  }
  function saveResults() {
    writeStored(resultsKey(), [...seenResults()].slice(-200));
  }
  function maybeShowResult() {
    if (!visible || !owner || !data?.enrolled || document.hidden) return;
    if (!resultDialog || document.body.classList.contains('playing') || resultDialog.open) return;
    const seen = seenResults();
    const pending = completedResults().filter(result => !seen.has(result.key));
    if (!pending.length) return;
    const first = pending[0];
    $('#result-title').textContent = first.outcome === 'won' ? 'YOU WON!'
      : first.outcome === 'lost' ? 'YOU LOST :(' : 'DRAW';
    $('#result-title').dataset.result = first.outcome;
    $('#result-copy').textContent = first.game + (first.who ? ' with ' + first.who : '');
    $('#result-note').textContent = pending.length > 1
      ? (pending.length - 1) + ' more finished ' + (pending.length === 2 ? 'game' : 'games') + ' in Your games.'
      : '';
    dialogOpen(resultDialog);
  }
  function dismissResult() {
    for (const result of completedResults()) seenResults().add(result.key);
    saveResults();
    dialogClose(resultDialog);
  }
  if (resultDialog) {
    $('#result-close').onclick = dismissResult;
    resultDialog.addEventListener('cancel', dismissResult);
  }
  function updateBadge() {
    const waiting = data?.enrolled ? data.matches.filter(m => offered(m) && m.status === 'active' && m.turn_user === owner) : [];
    // A live room you were invited to is waiting on you too.
    const count = waiting.length + (data?.enrolled ? liveGames.filter(g => g.status === 'lobby' && mySeat(g)?.state === 'invited').length : 0);
    $('#together-badge').hidden = !count; $('#together-badge').textContent = String(count);
    $('#together-home').hidden = !count;
    $('#together-home-link').textContent = count + (count === 1 ? ' game needs' : ' games need') + ' your attention →';
    updateNotice(waiting);
  }
  // Somewhere other than the nav, on whatever page you are on. A challenge that
  // was never sent is still your move, so it is worth naming here.
  function updateNotice(waiting) {
    const notice = $('#together-notice');
    if (!notice) return;
    const key = waiting.map(m => m.id).sort().join(',');
    if (!key || key === noticeDismissed) { notice.hidden = true; return; }
    const first = waiting[0], unsent = first.revealed_at == null;
    const title = waiting.length === 1
      ? (unsent ? 'Not sent yet' : 'Your turn in ' + name(first.game))
      : waiting.length + ' games waiting on you';
    const note = waiting.length > 1
      ? 'Bored Together · take a turn when you have a minute.'
      : unsent ? 'Play your first turn and it goes to ' + (first.opponent?.handle || 'them') + '.'
        : 'with ' + (first.opponent?.handle || 'your opponent');
    const titleEl = $('#together-notice-title'), noteEl = $('#together-notice-note');
    if (titleEl.textContent !== title) titleEl.textContent = title;
    if (noteEl.textContent !== note) noteEl.textContent = note;
    notice.hidden = false;
  }
  function resetIdentity() {
    const next = hasIdentity() ? getSession()?.user?.id : null;
    if (owner === next) return;
    owner = next; generation++; flight = null; busy = false; lastRefresh = 0; root.removeAttribute('aria-busy');
    data = flow = people = outsiders = null; outsidersError = ''; invited.clear(); status.textContent = '';
    liveGames = []; liveKey = ''; liveSelected.clear(); liveCapacity = 2;
    resultsSeen = null;
    if (resultDialog?.open) dialogClose(resultDialog);
    noticeDismissed = '';
    invite = null; inviteList = null; dismissedInvites = null;
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
        // Live rooms are a separate endpoint. If it is not there yet (its SQL has not been applied), the rest of
        // Bored Together carries on without it.
        let lives = null;
        if (next?.enrolled) { try { lives = await liveRPC('list'); } catch { lives = null; } }
        if (stamp !== generation) return;
        const nextKey = Array.isArray(lives) ? liveSignature(lives) : liveKey;
        const changed = JSON.stringify(data) !== JSON.stringify(next) || nextKey !== liveKey;
        if (Array.isArray(lives)) { liveGames = lives; liveKey = nextKey; }
        data = next; lastRefresh = Date.now(); updateBadge();
        if (changed || force) render();
        maybeShowResult();
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
  // A live room opens the game's own screen; the lobby and the game both live in it. Opening one again from the
  // list is how you rejoin: the screen loads the newest snapshot and the actions after it.
  // `fromGame` is the Multiplayer screen inside Civ Lite asking for it: the Bored Together page is not open then.
  async function launchLive(id, fromGame = false) {
    resetIdentity();
    const stamp = generation, player = owner;
    const game = await liveRPC('game', { id });
    if (stamp !== generation || (!visible && !fromGame)) return;
    if (!['lobby', 'active', 'completed'].includes(game.status)) {
      if (fromGame) throw new Error(game.status === 'cancelled' ? 'The host cancelled this game.' : 'This game is no longer open.');
      await refresh(true); return;
    }
    flow = null; people = null; liveSelected.clear(); render();
    playLive(game, player, {
      reload() { run(() => launchLive(id, fromGame)); },
      onExit() { if (stamp === generation) refresh(true); }
    });
  }
  /* ── Invitations ────────────────────────────────────────────────────────── */

  // Shown to a signed-in Bored account that is not in Bored Together as soon as
  // the site opens, and again after a sign-in. Closing it keeps that one invite
  // dismissed for the account for good; the invitation itself stays in the
  // Bored Together tab, where accepting joins and opens the game it promised.
  function inviteCopy() {
    const who = invite?.inviter || 'A Bored Together member';
    $('#invite-title').textContent = who + ' invited you to ' + name(invite.game);
    $('#invite-blurb').textContent = who + ' would like to play ' + name(invite.game) +
      ' with you on Bored Together, the arcade\u2019s two-player side. Accept and it opens on your first move.';
    $('#invite-how').textContent = 'Joining puts your display name and email in the member list; leaving takes them out. ' +
      'Your turn saves automatically, so you can come back whenever.';
    $('#invite-accept').textContent = 'Accept and play';
  }
  function inviteTone(text, error) {
    const el = $('#invite-status');
    el.textContent = text; el.dataset.tone = error ? 'error' : '';
  }
  // The account's waiting invitations, read once for the popup and for the tab.
  // A signed-in account outside Bored Together has no games list, so its tab is
  // where the invitations live: dismissing the popup never hides them.
  async function loadInvites() {
    if (!hasIdentity()) { inviteList = null; return null; }
    const stamp = generation, who = owner;
    try {
      const result = await inviteRPC('list');
      if (stamp !== generation || owner !== who) return inviteList;
      inviteList = result?.enrolled ? [] : (Array.isArray(result?.invites) ? result.invites : []);
    } catch {
      // An invitation is never worth interrupting a game with an error.
      return inviteList;
    }
    if (visible && stamp === generation) render();
    return inviteList;
  }
  async function checkInvites() {
    if (!hasIdentity() || inviteBusy || data?.enrolled || dialogBusy()) return;
    const list = await loadInvites();
    if (!list || data?.enrolled) return;
    const seen = dismissedIds();
    const next = list.find(item => item?.id && !seen.has(item.id));
    if (!next) return;
    invite = next;
    inviteTone('', false); inviteCopy(); dialogOpen(inviteDialog);
    $('#invite-close').focus();
  }
  // Accepting is one action: it takes the invitation, joins Bored Together under
  // the notice the enrollment screen shows, and opens the promised game with the
  // new member to move. That is the one game whose first seat is not the member
  // who started the match. The page is opened before the game so leaving it
  // lands on Bored Together, where the game waits for the next turn.
  async function acceptInvite(target) {
    const taking = target && target.id ? target : invite;
    if (!taking || inviteBusy) return;
    if (!hasIdentity()) {
      // No invitation can be taken without an account. The notice comes back
      // after the sign-in rather than being spent on a dialog that could not act.
      invite = null; dialogClose(inviteDialog); openAuthDialog('signin'); return;
    }
    inviteBusy = true; const accept = $('#invite-accept'); accept.disabled = true;
    if (inviteDialog?.open) inviteTone('Joining Bored Together\u2026', false);
    try {
      if (taking.status !== 'accepted') await inviteRPC('accept', { id: taking.id });
      // Taken but not joined yet: a second try goes straight to joining.
      invite = { ...taking, status: 'accepted' };
      await ensureProfile();
      await togetherRPC('enroll', { consent_version: CONSENT_VERSION });
      const claimed = await inviteRPC('claim');
      const match = (claimed?.matches || [])[0];
      dismissInvites([taking.id]);
      // A member's invitations become games, so there is no list left to carry.
      inviteList = [];
      invite = null; dialogClose(inviteDialog); inviteTone('', false);
      open();
      if (match?.id) await launch(match.id);
    } catch (error) {
      if (inviteDialog?.open) inviteTone(error.message, true);
      else status.textContent = error.message;
    } finally { inviteBusy = false; accept.disabled = false; }
  }
  if (inviteDialog) {
    $('#invite-accept').onclick = () => acceptInvite();
    // Only the player closes it for good: the Close button or Escape (cancel).
    // A dialog the page closes itself is not a dismissal.
    $('#invite-close').onclick = () => { dismissShownInvite(); dialogClose(inviteDialog); };
    inviteDialog.addEventListener('cancel', () => { dismissShownInvite(); });
    // A sign-in or a finished-game popup may have been in the way when an
    // invitation was waiting; look again once it is gone.
    document.addEventListener('close', () => { if (!dialogBusy()) setTimeout(checkInvites, 300); }, true);
  }
  // The tab's own list of invitations, for an account that is not in Bored
  // Together yet: the popup is easy to close, so the offer waits here with the
  // same join, for as long as the invite does.
  function invitesPanel(host) {
    if (!inviteList || !inviteList.length) return;
    const panel = node('section', undefined, 'bt-start bt-invites');
    panel.setAttribute('aria-label', 'Invites waiting for you');
    panel.append(node('p', 'Invites', 'eyebrow'),
      node('h3', inviteList.length === 1 ? '1 invite waiting' : inviteList.length + ' invites waiting'),
      node('p', 'Someone picked you for a game. Join and it opens on your first turn; nothing is lost while you think about it.', 'bt-caption'));
    for (const game of inviteList) {
      const row = node('div', undefined, 'bt-person');
      const who = node('div');
      who.append(node('strong', (game.inviter || 'A Bored Together member') + ' · ' + (game.game ? name(game.game) : 'a game')),
        node('span', 'would like to play ' + (game.game ? name(game.game) : 'this') + ' with you', 'bt-caption'));
      row.append(who, button(game.status === 'accepted' ? 'Finish joining' : 'Join and play', () => acceptInvite(game), true));
      panel.append(row);
    }
    host.append(panel);
  }
  function intro() {
    // A member who joined under the older notice is shown the new one once
    // before their list loads: the directory now shows their email.
    const renew = data?.renew === true;
    const intro = node('div', undefined, 'bt-enrollment');
    intro.append(node('h3', renew ? 'A change to Bored Together' : 'Play a turn. Come back whenever.'),
      node('p', renew
        ? 'Games start on your turn now and go over when you save. You pick people from a list instead of typing an email.'
        : 'Play the first turn and it\'s their move. It waits there until they play. A couple of games are one run each instead: same board, higher score wins.'),
      node('p', 'Joining puts your name and email in the member list. Leaving takes them out.', 'bt-caption'),
      button(renew ? 'Review and continue' : 'Join Bored Together', async () => {
        if (!hasIdentity()) { openAuthDialog('signin'); return; }
        await ensureProfile(); await togetherRPC('enroll', { consent_version: CONSENT_VERSION });
        // An accepted invite is held until enrollment; it becomes a game now.
        try { await inviteRPC('claim'); } catch { /* joining still works */ }
      }, true));
    content.append(intro);
    invitesPanel(content);
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
        node('p', 'Leaving takes you off the member list, cancels games you have not sent and forfeits the ones in progress.', 'bt-caption'),
        button('Confirm leave', () => togetherRPC('leave')));
      more.append(leave);
    }
    host.append(more);
  }
  // Live is an optional way to play Civ Lite, inside the normal game-selection flow.
  // Hosting does not require an invitation: friends can join the resulting room by code.
  function livePicker(host) {
    const maxInvites = Math.min(3, liveCapacity - 1);
    const box = node('section', undefined, 'bt-start bt-live-start');
    box.setAttribute('aria-label', 'Play Civ Lite live');
    box.append(node('p', 'Play live', 'eyebrow'), node('h4', name('ashcrown') + ' · live room'),
      node('p', 'Everyone plays at once. Make a room, share the six-character code, start when everyone is in.', 'bt-caption'));

    const countLabel = node('label', 'Human players ', 'bt-game-picker');
    const count = node('select'); count.id = 'bt-live-capacity';
    for (let n = 2; n <= 4; n++) {
      const option = node('option', n + ' players'); option.value = String(n); count.append(option);
    }
    count.value = String(liveCapacity);
    count.onchange = () => {
      liveCapacity = Number(count.value);
      while (liveSelected.size >= liveCapacity) liveSelected.delete([...liveSelected].pop());
      render();
    };
    countLabel.append(count); box.append(countLabel);

    if (!people) box.append(node('p', 'Loading members…', 'bt-caption'));
    else if (!people.length) box.append(node('p', 'No members to invite yet. You can still create a room and share its code.', 'bt-caption'));
    else {
      box.append(node('p', 'Invite members (optional)', 'bt-caption'));
      const list = node('div', undefined, 'bt-people'); list.id = 'bt-live-people';
      for (const person of people) {
        const picked = liveSelected.has(person.id);
        const row = node('label', undefined, 'bt-person');
        const who = node('div');
        const whoName = node('strong', person.handle);
        addMedal(whoName, person.handle);
        who.append(whoName, node('span', person.email || 'No email on this account', 'bt-caption'));
        const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = picked; checkbox.id = 'bt-live-pick-' + person.id;
        checkbox.disabled = !picked && liveSelected.size >= maxInvites;
        checkbox.setAttribute('aria-label', 'Invite ' + person.handle);
        checkbox.onchange = () => { if (checkbox.checked) liveSelected.add(person.id); else liveSelected.delete(person.id); render(); };
        row.append(who, checkbox); list.append(row);
      }
      box.append(list);
    }
    const openSeats = liveCapacity - 1 - liveSelected.size;
    box.append(node('p', liveSelected.size + ' invited · ' + openSeats + ' seat' + (openSeats === 1 ? '' : 's') + ' available by code', 'bt-caption'));
    const make = button('Create live room', async () => {
      const game = await liveRPC('create', { game: 'ashcrown', invite: [...liveSelected], capacity: liveCapacity, config: LIVE_DEFAULTS });
      flow = null; people = null; liveSelected.clear(); liveCapacity = 2;
      await launchLive(game.id);
    }, true);
    make.id = 'bt-live-create';
    box.append(make,
      button('Back to turns', () => { flow = 'challenge'; liveSelected.clear(); render(); }),
      button('Cancel', () => { flow = null; people = null; liveSelected.clear(); render(); }));
    host.append(box);
  }
  function picker(host = content) {
    if (flow === 'live') { livePicker(host); return; }
    const box = node('section', undefined, 'bt-start');
    box.setAttribute('aria-label', flow === 'challenge' ? 'Start a game' : 'Play random');
    box.append(node('p', flow === 'random' ? 'Find a random partner' : 'Choose a partner', 'eyebrow'));
    const label = node('label', 'Choose a game ', 'bt-game-picker'), select = node('select'); select.id = 'bt-game-select';
    for (const [slug, game] of Object.entries(TOGETHER_GAMES)) {
      if (!TOGETHER_ADAPTERS[slug]) continue;
      const option = node('option', game.name); option.value = slug; select.append(option);
    }
    select.value = selectedGame;
    select.onchange = () => { selectedGame = select.value; render(); };
    label.append(select); box.append(label);
    if (flow === 'challenge' && TOGETHER_LIVE[selectedGame]) {
      box.append(node('p', 'Want to play together at the same time instead?', 'bt-caption'),
        button('Play live instead', () => { liveSelected.clear(); flow = 'live'; render(); }));
    }
    if (flow === 'random') box.append(button('Find opponent', async () => {
      const result = await togetherRPC('queue_join', { game: selectedGame });
      flow = null; if (result.id) await launch(result.id);
    }, true));
    else {
      box.append(node('p', TOGETHER_GAMES[selectedGame]?.mode === 'duel'
        ? 'Pick someone. Same board for both, higher run wins. Nobody sees a score until you\'ve both gone.'
        : 'Pick someone and play the first turn. It goes over as their game, so nothing is sent until you save.', 'bt-caption'));
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
          const whoName = node('strong', person.handle);
          addMedal(whoName, person.handle);
          who.append(whoName, node('span', 'Not in Bored Together', 'bt-caption'));
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
    host.append(box);
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
  // One game's own art, used by the hero, the starter tiles and the match
  // cards, so a game is identifiable before its name is read.
  function gamePreview(slug, className) {
    const host = node('span', undefined, className);
    host.setAttribute('aria-hidden', 'true');
    if (PREVIEWS[slug]) {
      const image = node('img');
      image.src = PREVIEWS[slug];
      image.alt = '';
      image.width = 384;
      image.height = 240;
      image.loading = 'lazy';
      image.decoding = 'async';
      host.append(image);
    } else {
      host.classList.add('bt-art-empty');
      host.append(node('span', (TOGETHER_GAMES[slug]?.name || slug).slice(0, 2).toUpperCase(), 'bt-art-mark'));
    }
    return host;
  }
  function matchRow(m, host) {
    const duel = m.mode === 'duel';
    const turn = m.status === 'active' && m.turn_user === owner;
    // Until the first turn is saved the opponent cannot see this game at all,
    // so the challenger's row has to say that instead of "Your turn".
    const unsent = turn && m.revealed_at == null;
    const row = node('article', undefined, 'bt-match-row bt-match-card' + (turn ? ' bt-ready' : ''));
    row.dataset.matchId = m.id;
    const copy = node('div', undefined, 'bt-match-copy');
    // The state is a chip on the title line, so a card says whose move it is
    // before the sentence under it is read.
    const head = node('div', undefined, 'bt-match-head');
    head.append(node('h4', name(m.game)),
      node('span',
        m.status === 'completed' ? (m.winner === owner ? 'Won' : m.winner ? 'Lost' : 'Draw')
          : unsent ? 'Not sent' : turn ? 'Your turn' : 'Their turn',
        'bt-chip' + (turn ? ' bt-chip-turn' : '')));
    const opponentLine = node('p', 'with ' + (m.opponent?.handle || 'Former member'), 'bt-opponent');
    addMedal(opponentLine, m.opponent?.handle);
    copy.append(head,
      opponentLine,
      node('p', duel ? runLine(m, turn)
        : m.status === 'active' ? (unsent
          ? 'Play the first turn to send it. Unplayed games disappear after 7 days.'
          : turn ? 'Your turn' : 'Their turn')
        : m.winner === owner ? 'You won' : m.winner ? 'You lost' : 'Draw', 'bt-caption'));
    const actions = node('div', undefined, 'bt-actions');
    if (m.status === 'active' && turn) actions.append(button(unsent ? 'Play first turn' : duel ? 'Play run' : 'Play turn', () => launch(m.id), true));
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
    row.append(gamePreview(m.game, 'bt-match-art'), copy, actions);
    host.append(row);
  }
  // Who is in a live room, and what they are doing: the list says it all, so nobody has to open a game to look.
  function liveSeatLine(g, s) {
    const lobby = g.status === 'lobby';
    const state = lobby ? ({ invited: 'invited', joined: 'joined', ready: 'ready' }[s.state] || s.state)
      : s.controller === 'cpu' ? 'a CPU is playing' : s.online ? 'online' : 'away';
    const item = node('li', undefined, 'bt-live-seat' + (s.online ? ' bt-online' : ''));
    const seatName = node('strong', (s.handle || 'Player') + (s.seat === g.me ? ' (you)' : ''));
    addMedal(seatName, s.handle);
    item.append(node('span', s.online ? '\u25cf ' : '\u25cb ', 'bt-dot'),
      seatName, node('span', ' \u00b7 ' + state, 'bt-caption'));
    item.setAttribute('aria-label', (s.handle || 'Player') + ', ' + state);
    return item;
  }
  function liveRow(g, host) {
    const mine = mySeat(g), lobby = g.status === 'lobby', done = g.status === 'completed';
    const invitedMe = lobby && mine?.state === 'invited';
    const row = node('article', undefined, 'bt-match-row bt-match-card bt-live-row' + (invitedMe ? ' bt-ready' : ''));
    row.dataset.liveId = g.id;
    const copy = node('div', undefined, 'bt-match-copy');
    const head = node('div', undefined, 'bt-match-head');
    head.append(node('h4', name(g.game) + ' \u00b7 live'),
      node('span', lobby ? (invitedMe ? 'Invited' : 'Setting up') : done ? 'Finished' : 'Live', 'bt-chip' + (invitedMe ? ' bt-chip-turn' : '')));
    const players = node('ul', undefined, 'bt-live-seats');
    for (const s of g.seats || []) if (s.state !== 'left') players.append(liveSeatLine(g, s));
    const host0 = (g.seats || []).find(s => s.user === g.host);
    const winner = done ? (g.winner == null ? 'Nobody won.' : ((g.seats || []).find(s => s.seat === g.winner)?.handle || 'A CPU') + ' won.') : '';
    copy.append(head, players,
      node('p', lobby ? (invitedMe ? (host0?.handle || 'The host') + ' invited you. Join to pick your civ.' : g.host === owner ? 'Waiting for everyone to be ready.' : 'The host starts the game once everyone is ready.')
        : done ? winner : 'Round ' + (g.round || 1) + (mine?.controller === 'cpu' ? ' \u00b7 a CPU is playing your civ until you rejoin' : ''), 'bt-caption'));
    const actions = node('div', undefined, 'bt-actions');
    const rejoin = !lobby && !done && (mine?.controller === 'cpu' || !mine?.online);
    actions.append(button(invitedMe ? 'Join' : lobby ? 'Open lobby' : done ? 'View' : rejoin ? 'Rejoin' : 'Open', () => launchLive(g.id), !done));
    if (lobby) {
      const more = node('details', undefined, 'bt-more');
      more.append(node('summary', 'More'), button(g.host === owner ? 'Cancel game' : 'Leave lobby', () => liveRPC('leave_lobby', { id: g.id })));
      actions.append(more);
    }
    row.append(gamePreview(g.game, 'bt-match-art'), copy, actions);
    host.append(row);
  }
  function dashboard() {
    const played = data.matches.filter(offered);
    const open = played.filter(m => m.status === 'active');
    const yours = open.filter(m => m.turn_user === owner);
    const waiting = open.filter(m => m.turn_user !== owner);
    // Keep rematches close to the finished game, without a history page or records.
    const completed = played.filter(m => m.status === 'completed').slice(0, 3);

    // The lobby's front door: the game that is actually waiting on you.
    if (yours.length) {
      const match = yours[0];
      const duel = match.mode === 'duel';
      const unsent = match.revealed_at == null;
      const hero = node('section', undefined, 'bt-hero');
      hero.setAttribute('aria-label', unsent ? 'Not sent yet' : 'Your move');
      const copy = node('div', undefined, 'bt-hero-copy');
      const heroOpponent = node('p', 'with ' + (match.opponent?.handle || 'your opponent'), 'bt-opponent');
      addMedal(heroOpponent, match.opponent?.handle);
      copy.append(node('p', unsent ? 'Not sent yet' : 'Your move', 'eyebrow'),
        node('h3', name(match.game), 'bt-hero-title'),
        heroOpponent,
        node('p', duel ? runLine(match, true)
          : unsent ? 'Play your first turn and it goes to ' + (match.opponent?.handle || 'them') + '.'
          : 'The turn is yours.', 'bt-hero-line'),
        node('p', unsent ? 'An unplayed game disappears after 7 days.'
          : yours.length > 1 ? (yours.length - 1) + ' more waiting below.' : 'Take it when you are ready.', 'bt-caption'));
      hero.append(gamePreview(match.game, 'bt-hero-art'), copy,
        button(unsent ? 'Play first turn' : duel ? 'Play run' : 'Play turn', () => launch(match.id), true));
      content.append(hero);
    } else if (waiting.length) {
      content.append(node('p', waiting.length === 1
        ? 'Nothing waiting on you. Their turn.'
        : 'Nothing waiting on you. ' + waiting.length + ' games are with them.', 'bt-hero-quiet'));
    }

    const start = node('section', undefined, 'bt-start-panel');
    start.append(node('p', 'Start something', 'eyebrow'),
      node('h3', 'Start a game'),
      node('p', 'Pick a game and who you\'re playing. Take turns whenever. Civ Lite can also run live if you\'re both online.', 'bt-caption'));
    // Once a game is chosen the picker takes over below, so there is only ever
    // one game control on screen.
    if (!flow) {
      const grid = node('div', undefined, 'bt-game-grid');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', 'Choose a game');
      for (const [slug, game] of Object.entries(TOGETHER_GAMES)) {
        if (!TOGETHER_ADAPTERS[slug]) continue;
        const option = node('button', undefined, 'bt-game-option');
        option.type = 'button';
        option.id = 'bt-game-' + slug;
        option.dataset.game = slug;
        option.setAttribute('aria-pressed', String(slug === selectedGame));
        option.append(gamePreview(game.preview || slug, 'bt-game-art'),
          node('span', game.name, 'bt-game-name'),
          node('span', TOGETHER_LIVE[slug] ? 'Take turns · Live option' : game.mode === 'duel' ? 'One run each' : 'Take turns', 'bt-game-mode'));
        option.onclick = () => { selectedGame = slug; render(); };
        grid.append(option);
      }
      start.append(grid);
    }
    const actions = node('div', undefined, 'bt-start-actions');
    // The member list is only fetched when the picker is opened.
    actions.append(button('Start a Game', async () => {
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
    overflow(actions, null);
    if (!flow) start.append(actions);
    // The picker lives inside the starter, so choosing a game never pushes the
    // page down into a second, unrelated-looking box.
    if (flow) picker(start);
    content.append(start);
    const games = node('section'); games.id = 'bt-your-games'; games.append(node('h3', 'Your games'));
    const counts = [];
    if (yours.length) counts.push(yours.length + ' waiting on you');
    if (waiting.length) counts.push(waiting.length + ' with them');
    if (counts.length) games.append(node('p', counts.join(' · '), 'bt-caption'));
    if (!open.length && !completed.length && !data.queue.length && !liveGames.length) {
      games.append(node('p', 'No games yet. Start one above.', 'bt-caption'));
    }
    // Ongoing games are separated by whose move it is; a finished game stays
    // nearby for a rematch but never leads the list.
    const group = (title, note, list, row = matchRow) => {
      if (!list.length) return;
      games.append(node('h4', title, 'bt-group'));
      if (note) games.append(node('p', note, 'bt-caption bt-group-note'));
      for (const match of list) row(match, games);
    };
    // Live rooms come first: they are happening now.
    const liveOpen = liveGames.filter(g => g.status === 'lobby' || g.status === 'active');
    group('Live now \u00b7 ' + liveOpen.length, 'Open one to rejoin it. While you are away a CPU plays your civ.', liveOpen, liveRow);
    group('Your move · ' + yours.length, yours.length === 1
      ? 'Take your turn whenever you are ready.' : 'Every one of these is waiting on you.', yours);
    group('Waiting on them · ' + waiting.length, waiting.length === 1
      ? 'Their turn. Nothing to do until they play.' : 'Their turns. Nothing to do until they play.', waiting);
    group('Finished', null, completed);
    group('Finished live games', null, liveGames.filter(g => g.status === 'completed'), liveRow);
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
    resetIdentity();
    // A non-member's tab is the list of invitations the account is carrying.
    if (hasIdentity() && data?.enrolled !== true) void loadInvites();
    render(); refresh(true); maybeShowResult(); root.scrollIntoView({ block: 'start' });
  }
  function close() {
    visible = false; flow = people = null; root.hidden = true;
    if (resultDialog?.open) dialogClose(resultDialog);
    document.body.classList.remove('together-open'); $('#together-nav').removeAttribute('aria-current');
    for (const el of document.querySelectorAll('#daily,#recent,#leaderboard,#library,.activity-notice')) el.hidden = false;
  }
  $('#together-notice-open')?.addEventListener('click', () => open());
  $('#together-notice-close')?.addEventListener('click', () => {
    noticeDismissed = (data?.enrolled ? data.matches : [])
      .filter(m => m.status === 'active' && m.turn_user === owner).map(m => m.id).sort().join(',');
    $('#together-notice').hidden = true;
  });
  $('#together-nav').onclick = e => { e.preventDefault(); open(); };
  $('#together-home-link').onclick = e => { e.preventDefault(); open(); };
  $('#together-refresh').onclick = () => run(() => refresh(true));
  $('#together-back').onclick = () => { close(); try { history.replaceState(null, '', '#library'); } catch {} $('#library').scrollIntoView(); };
  for (const link of document.querySelectorAll('.site-nav a:not(#together-nav)')) link.addEventListener('click', close);
  // The notice belongs to the site, not to a game: it shows on the first page
  // load, and again when a different account signs in. The account UI dispatches
  // bored:identity on every repaint, so this remembers which account the list was
  // last read for instead of asking the server again on each of them.
  let inviteCheckedFor;
  function scheduleInviteCheck() {
    const who = hasIdentity() ? getSession()?.user?.id : null;
    if (who === inviteCheckedFor) return;
    inviteCheckedFor = who;
    setTimeout(checkInvites, 400);
  }
  window.addEventListener('bored:identity', () => {
    resetIdentity(); refresh(true);
    scheduleInviteCheck();
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
  return { open, close, refresh, checkInvites, openLive: id => launchLive(id, true) };
}

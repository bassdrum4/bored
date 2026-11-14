import { backendReady, getHandle, hasIdentity } from './backend.js';
import { LB_GAMES, bestValue, isLocalOnly } from './scores.js';
import { LEAGUE_EVENTS, LEAGUE_FULL, leaguePoints, leagueStandings } from './league.js';

// Penguin's Leaderboard: a combined table and one table per event, all read
// from the rows the overall leaderboard already fetched. Penguin's text box
// says who leads the open table and where the viewer stands.
export function createLeagueView({ state, openGame, loadBoard }) {
  const $ = selector => document.querySelector(selector);
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const TABS = [{ id: 'combined', name: 'Combined' }, ...LEAGUE_EVENTS];
  const SHOWN = 100;
  let tab = 'combined';

  const num = n => Math.round(Number(n) || 0).toLocaleString('en-US');
  const specOf = id => LB_GAMES.find(game => game.id === id);
  // The number as a player would say it: "1,830 points", "floor 31", "41 of 67 achievements".
  const said = (event, value) => event.unit === 'floors' ? 'floor ' + num(value)
    : event.unit === 'earned' ? num(value) + ' of ' + event.full + ' achievements' : num(value) + ' points';
  // The same, short enough for a table cell.
  const cell = (event, value) => event.unit === 'floors' ? 'floor ' + num(value)
    : event.unit === 'earned' ? num(value) + ' of ' + event.full : num(value);
  const fullAt = event => event.unit === 'floors' ? 'floor ' + event.full
    : event.unit === 'earned' ? 'all ' + event.full : num(event.full) + ' points';
  const hints = {
    'poke-idle': 'Catch something in Poké Idle while signed in.',
    'poke-idle-ach': 'Earn an achievement in Poké Idle while signed in.',
    'poke-idle-tower': 'It opens in Poké Idle once Geeta, the Paldea Champion, is beaten.',
    'pokedoku-doku': "Finish today's Pokédoku grid while signed in.",
    'pokedoku-inverse': "Finish today's Inverse Doku while signed in.",
    'pokedoku-shiny': "Finish today's Shiny Hunt while signed in."
  };

  // This browser's own bests: what a guest, or a board the server can't hold yet, still counts.
  function localBest(event) {
    const spec = specOf(event.id);
    const value = spec ? bestValue(spec) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  const localTotal = () => LEAGUE_EVENTS.reduce((sum, event) => sum + leaguePoints(localBest(event), event.full), 0);

  // One event's table: everyone with a score in it, best first; ties share a rank.
  function eventRows(players, event) {
    const rows = players.filter(player => player.events[event.id])
      .map(player => ({ handle: player.handle, key: player.key, ...player.events[event.id] }))
      .sort((a, b) => b.value - a.value || a.handle.localeCompare(b.handle));
    let rank = 0, previous = null;
    rows.forEach((row, index) => { if (row.value !== previous) rank = index + 1; previous = row.value; row.rank = rank; });
    return rows;
  }

  function bar(points, label) {
    const track = element('span', 'lg-bar');
    const fill = element('i');
    fill.style.width = (100 * points / LEAGUE_FULL).toFixed(1) + '%';
    track.append(fill);
    if (label) track.setAttribute('aria-label', label);
    return track;
  }

  function renderTabs() {
    $('#league-tabs').replaceChildren(...TABS.map(item => {
      const button = element('button', 'league-tab', item.name);
      button.type = 'button';
      button.id = 'league-tab-' + item.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'league-board');
      button.setAttribute('aria-selected', String(item.id === tab));
      button.tabIndex = item.id === tab ? 0 : -1;
      button.onclick = () => { tab = item.id; render(); };
      return button;
    }));
  }

  function heading(...cells) {
    const head = element('thead');
    const row = element('tr');
    for (const [text, className, small] of cells) {
      const th = element('th', className, text);
      th.scope = 'col';
      if (small) th.append(element('small', '', small));
      row.append(th);
    }
    head.append(row);
    return head;
  }

  function nameCell(player, mineKey) {
    const th = element('th', 'lg-name');
    th.scope = 'row';
    const mine = player.key === mineKey;
    th.append(element('span', 'lg-handle', player.handle + (mine ? ' (you)' : '')));
    return th;
  }

  function combinedTable(players, mineKey) {
    const table = element('table', 'league-table combined');
    table.append(element('caption', 'sr-only', "Penguin's Leaderboard, all events combined"));
    table.append(heading(['Rank', 'lg-rank'], ['Trainer', 'lg-name'], ['Total', 'lg-total', 'of 6,000'],
      ...LEAGUE_EVENTS.map(event => [event.name, 'lg-ev', event.from])));
    const body = element('tbody');
    for (const player of players.slice(0, SHOWN)) {
      const row = element('tr', player.key === mineKey ? 'you' : '');
      const name = nameCell(player, mineKey);
      // On a phone the six event columns fold into one strip under the name.
      const strip = element('span', 'lg-strip');
      strip.setAttribute('aria-hidden', 'true');
      for (const event of LEAGUE_EVENTS) strip.append(bar(player.events[event.id]?.points || 0));
      name.append(strip);
      row.append(element('td', 'lg-rank', String(player.rank)), name, element('td', 'lg-total', num(player.total)));
      for (const event of LEAGUE_EVENTS) {
        const got = player.events[event.id];
        const td = element('td', 'lg-ev' + (got ? '' : ' none'));
        if (got) td.append(element('span', 'lg-pts', num(got.points)), bar(got.points, event.name + ': ' + said(event, got.value)));
        else td.append(element('span', 'lg-pts', '–'));
        if (got) td.title = said(event, got.value);
        row.append(td);
      }
      body.append(row);
    }
    table.append(body);
    return table;
  }

  function eventTable(rows, event, mineKey) {
    const table = element('table', 'league-table single');
    table.append(element('caption', 'sr-only', event.name + ' standings'));
    table.append(heading(['Rank', 'lg-rank'], ['Trainer', 'lg-name'], ['Best', 'lg-best'], ['Points', 'lg-league', 'of 1,000']));
    const body = element('tbody');
    for (const entry of rows.slice(0, SHOWN)) {
      const row = element('tr', entry.key === mineKey ? 'you' : '');
      const league = element('td', 'lg-league');
      league.append(element('span', 'lg-pts', num(entry.points)), bar(entry.points));
      row.append(element('td', 'lg-rank', String(entry.rank)), nameCell(entry, mineKey), element('td', 'lg-best', cell(event, entry.value)), league);
      body.append(row);
    }
    table.append(body);
    return table;
  }

  // Penguin's line: who leads, then where the viewer stands.
  function profSays(parts) {
    const box = $('#league-prof');
    box.replaceChildren(...parts.map(part => typeof part === 'string' ? document.createTextNode(part) : element('b', '', part.b)));
  }
  const named = list => list.map(entry => entry.handle).reduce((text, name, i, all) =>
    text + (i === 0 ? '' : i === all.length - 1 ? ' and ' : ', ') + name, '');

  function render() {
    renderTabs();
    const event = LEAGUE_EVENTS.find(item => item.id === tab);
    const cached = state.lbCache.get('overall');
    const players = leagueStandings(cached?.rows || []);
    const handle = getHandle();
    const mineKey = handle && hasIdentity() ? handle.toLowerCase() : '';
    const board = $('#league-board');
    const empty = $('#league-empty');
    $('#league-refresh').disabled = !backendReady();
    board.replaceChildren();
    empty.hidden = true;

    const rows = event ? eventRows(players, event) : players;
    const me = mineKey ? rows.find(row => row.key === mineKey) : null;
    const top = rows.filter(row => row.rank === 1);
    const local = event ? localBest(event) : localTotal();
    const localOnly = event && isLocalOnly(event.id);

    if (!backendReady()) profSays(["This board needs the shared leaderboard, and it's offline right now. Your own numbers are below."]);
    else if (cached?.error) profSays(["I couldn't reach the leaderboard: " + cached.error + ' Try Refresh in a minute.']);
    else if (!cached) profSays(['Checking the scores…']);
    else if (localOnly) profSays(['The ' + event.name + " table opens once its board is on the shared leaderboard. Until then, your best counts on this browser."]);
    else if (!rows.length) profSays([event ? 'Nobody has a ' + event.name + ' score yet. ' + hints[event.id] : "Nobody has a Pokémon score on the table yet. Play Poké Idle or a Pokédoku daily while signed in, and the top spot is yours."]);
    else {
      const lead = top[0];
      const strongest = !event && LEAGUE_EVENTS.filter(item => lead.events[item.id])
        .sort((a, b) => lead.events[b.id].points - lead.events[a.id].points)[0];
      const parts = event
        ? [{ b: named(top) }, (top.length > 1 ? ' share the lead in the ' : ' leads the ') + event.name + ' table with ' + said(event, lead.value) + '.']
        : [{ b: named(top) }, (top.length > 1 ? ' share the top spot with ' : ' is the Champion with ') + num(lead.total) + ' of 6,000 points' +
            (top.length === 1 && strongest ? ', strongest at ' + strongest.name + '.' : '.')];
      if (me && me.rank === 1) parts.push(top.length > 1 ? " You're one of them. Break the tie." : " That's you. Everyone else is coming for it.");
      else if (me) parts.push(" You're #" + me.rank + ', ' + (event ? 'at ' + said(event, me.value) : num(lead.total - me.total) + ' points behind') + '.');
      else if (mineKey) parts.push(event ? " You're not on this table yet. " + hints[event.id] : " You're not on the table yet: any Pokémon score puts you there.");
      else parts.push(' Sign in and your bests join the table.');
      profSays(parts);
    }

    if (rows.length && !localOnly) board.append(event ? eventTable(rows, event, mineKey) : combinedTable(rows, mineKey));
    else if (backendReady() && cached && !cached.error) { empty.hidden = false; empty.textContent = 'No one here yet.'; }

    // The viewer's own browser, for guests and for boards the server can't hold yet.
    const mine = $('#league-mine');
    if (me && !localOnly) mine.textContent = '';
    else if (local > 0) {
      const ahead = rows.filter(row => (event ? row.value : row.total) > local).length;
      mine.textContent = 'On this browser: ' + (event ? said(event, local) + ', worth ' + num(leaguePoints(local, event.full)) + ' points' : num(local) + ' points') +
        (rows.length && !localOnly ? ', which would be #' + (ahead + 1) + '.' : '.') + (hasIdentity() ? '' : ' Sign in to put it on the table.');
    } else mine.textContent = '';

    // How this table scores, and where to raise it.
    const how = $('#league-how');
    how.replaceChildren();
    if (event) {
      how.append(element('span', '', event.what + ' ' + fullAt(event)[0].toUpperCase() + fullAt(event).slice(1) + ' is a full 1,000 points.'));
      const play = element('button', 'action league-play', 'Play ' + event.from);
      play.type = 'button';
      play.onclick = clickEvent => openGame(event.play, null, clickEvent.currentTarget);
      how.append(play);
    } else {
      how.append(element('span', '', 'Each event turns your best into points: your best as a share of a full score, out of 1,000. The combined table adds all six, so 6,000 is the most anyone can hold. Pick an event above for its own table and what a full score takes.'));
    }
  }

  async function load(force = false) {
    render();
    await loadBoard(force);
    render();
  }

  $('#league-refresh').onclick = () => load(true);
  // Arrow keys move along the tabs, as a tab list should.
  $('#league-tabs').addEventListener('keydown', keyEvent => {
    if (keyEvent.key !== 'ArrowRight' && keyEvent.key !== 'ArrowLeft') return;
    keyEvent.preventDefault();
    const at = TABS.findIndex(item => item.id === tab);
    tab = TABS[(at + (keyEvent.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    render();
    document.getElementById('league-tab-' + tab)?.focus();
  });

  return { renderLeague: render, loadLeague: load };
}

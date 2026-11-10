// Civ Lite's Multiplayer screen (5.2) in a real browser, with the hub stood in for by a small in-memory lobby bridge:
// the title menu's item and invite tag, the screen's three parts, the host setup with its friend picker, the sign-in
// and join prompts, the refresh, and the pages where the item must not appear. The real hub, the real server and two
// accounts are tested together in live-browser.test.cjs; the hub's own checks in live-lobby.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { serve } = require('./serve.cjs');

const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ID = n => '00000000-0000-4000-8000-00000000000' + n;
const iso = minutesAgo => new Date(Date.now() - minutesAgo * 60000).toISOString();

function lobbyState(extra = {}) {
  return Object.assign({
    status: { signedIn: true, enrolled: true, name: 'Ann' }, calls: [],
    invites: [{ id: ID(1), host: 'Ben', mode: 'coop', at: iso(5), players: ['Ben', 'Ann'] }],
    games: {
      live: [
        { id: ID(2), status: 'active', mode: 'ffa', round: 12, host: true, players: [{ name: 'Ann', you: true, cpu: true, online: false, state: 'joined' }, { name: 'Cleo', you: false, cpu: false, online: true, state: 'joined' }], you: { cpu: true, online: false }, winner: null },
        { id: ID(3), status: 'completed', mode: 'coop', round: 40, host: false, players: [{ name: 'Ann', you: true, cpu: false, online: true, state: 'joined' }, { name: 'Ben', you: false, cpu: false, online: true, state: 'joined' }], you: { cpu: false, online: true }, winner: 'Ben' }
      ],
      turns: [{ with: 'Dee', yourTurn: true }]
    },
    members: [{ ref: 'ref-ben', name: 'Ben' }, { ref: 'ref-cleo', name: 'Cleo' }, { ref: 'ref-dee', name: 'Dee' }, { ref: 'ref-eli', name: 'Eli' }]
  }, extra);
}

// width: the screen; mode 'bored' puts the game in a frame-like page with the bridge, 'framed' without a bridge, 'alone' neither.
async function open(t, state, { width = 1100, mode = 'bored' } = {}) {
  assert.ok(executablePath, 'Set CHROME_PATH to run browser verification');
  const site = await serve(path.join(__dirname, '../src'));
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => { await browser.close(); await site.close(); });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => (req.url().startsWith(site.origin) ? req.continue() : req.abort()));
  await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
  if (mode !== 'alone') await page.evaluateOnNewDocument(() => { Object.defineProperty(window, 'parent', { value: { postMessage() {} }, configurable: true }); });   // "in a frame"
  if (mode === 'bored') {
    await page.exposeFunction('__lobbyCall', async (op, payload) => {
      state.calls.push({ op, payload });
      try {
        let result;
        if (op === 'status') result = state.status;
        else if (!state.status.signedIn) throw new Error('Sign in to Bored to play online.');
        else if (op === 'invites') result = state.invites;
        else if (op === 'games') result = state.games;
        else if (op === 'members') result = state.members;
        else if (op === 'host' && state.hostError) throw new Error(state.hostError);
        else if (op === 'join-code') { if (state.joinError) throw new Error(state.joinError); result = { id: ID(5) }; }
        else result = {};
        return JSON.stringify(result);
      } catch (error) { return JSON.stringify({ __error: error.message }); }
    });
    await page.evaluateOnNewDocument(() => {
      window.__boredLobby = {
        call: (op, payload) => window.__lobbyCall(op, payload || {}).then(text => { const r = JSON.parse(text); if (r && r.__error) throw new Error(r.__error); return r; }),
        on: fn => { window.__lobbyOn = fn; }
      };
    });
  }
  await page.goto(site.origin + '/games/content/ashcrown.html');
  await page.waitForSelector('#btn-new', { visible: true });
  return { page, errors, state };
}
const until = async (page, expr, arg, ms = 8000) => page.waitForFunction(expr, { polling: 50, timeout: ms }, arg);
const visible = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && !e.hidden; }, sel);
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const modalText = page => page.evaluate('(() => { const m = document.querySelector(".modal"); return m && m.offsetParent !== null ? m.textContent : ""; })()');
const lastCall = (state, op) => state.calls.filter(c => c.op === op).at(-1);
const fits = () => {
  const w = document.documentElement.clientWidth, bad = [];
  if (document.documentElement.scrollWidth > w) bad.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + w);
  for (const el of document.querySelectorAll('.modal, .modal-body, .mp-row, .mp-main, .mp-acts, .mp-prompt, .mp-person, .mp-join, #mp-code, #mp-code-error, #mp-pick, #mp-people, #mp-humans, .fe-item, .setup-inner')) {
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
    if (r.right > w + 0.5 || r.left < -0.5) bad.push((el.id || el.className) + ' leaves the screen: ' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + w);
  }
  return bad;
};

test('the Multiplayer item is on the title menu after Load game only inside Bored with a lobby bridge', async t => {
  for (const mode of ['alone', 'framed']) {
    const { page, errors } = await open(t, lobbyState(), { mode });
    assert.equal(await visible(page, '#btn-mp'), false, mode + ': no Multiplayer item');
    assert.deepEqual(errors, []);
  }
  const { page, errors, state } = await open(t, lobbyState());
  assert.equal(await visible(page, '#btn-mp'), true);
  assert.equal(await page.evaluate(() => document.getElementById('btn-load').nextElementSibling.id), 'btn-mp', 'right after Load game');
  assert.equal(await page.$eval('#btn-mp .mi', e => e.textContent), 'Multiplayer');
  assert.equal(await page.$eval('#btn-mp .mi-sub', e => e.textContent), 'Play live with friends on Bored');
  await until(page, () => !document.getElementById('mp-tag').hidden);
  assert.equal(await page.$eval('#mp-tag', e => e.textContent), '1', 'a count tag for the one invite waiting');
  assert.ok(state.calls.some(c => c.op === 'invites'));
  // The tag is the same small tag What's new wears.
  assert.equal(await page.evaluate(() => { const a = getComputedStyle(document.getElementById('mp-tag')), b = getComputedStyle(document.getElementById('tut-tag')); return ['color', 'borderTopColor', 'fontSize', 'textTransform'].every(k => a[k] === b[k]); }), true);
  // No invites: no tag. An account that changed is announced by the hub and the tag follows.
  state.invites = [];
  await page.evaluate(() => window.__lobbyOn({ event: 'account' }));
  await until(page, () => document.getElementById('mp-tag').hidden);
  assert.deepEqual(errors, []);
});

test('the screen shows who invited you, your live games, the finished ones folded, and the two-player games with their note; its buttons ask the hub', async t => {
  const { page, errors, state } = await open(t, lobbyState());
  await click(page, '#btn-mp');
  await until(page, () => document.querySelector('#mp-body .mp-row'));
  const text = await modalText(page);
  for (const part of ['Host a live game', 'Join with code', 'Invites · 1', 'Your live games · 1', 'Two-player games', 'Ben invited you', 'Co-op', 'Round 12', 'a CPU is playing your civ', 'Cleo', 'With Dee', 'Your turn', 'turn by turn']) assert.ok(text.includes(part), part + ' in ' + text);
  assert.match(text, /5 minutes ago/);
  assert.deepEqual(await page.$$eval('.modal .mp-row .btn', bs => bs.map(b => b.textContent)), ['Join', 'Decline', 'Rejoin', 'View'], 'Join and Decline on the invite, Rejoin on the game I left, View on the finished one');
  assert.equal(await page.$eval('.mp-done', d => d.open), false, 'the finished game is folded away');
  assert.equal(await page.$eval('.mp-done summary', e => e.textContent), 'Finished · 1');
  assert.equal(await page.$eval('.modal-head h2', e => e.textContent), 'Multiplayer');
  // Decline asks the hub to decline that invite; Rejoin asks it to open that game.
  await click(page, '[data-act="mp-decline:' + ID(1) + '"]');
  await sleep(150);
  assert.deepEqual(lastCall(state, 'decline').payload, { invite: ID(1) });
  state.invites = [];
  await until(page, () => !document.querySelector('[data-act^="mp-decline"]'), null, 8000);
  await click(page, '[data-act="mp-open-game:' + ID(2) + '"]');
  await sleep(150);
  assert.deepEqual(lastCall(state, 'open').payload, { game: ID(2) });
  // The folded game opens with its summary and has its own button.
  await page.evaluate(() => { document.querySelector('.mp-done').open = true; });
  await click(page, '[data-act="mp-open-game:' + ID(3) + '"]');
  await sleep(150);
  assert.deepEqual(lastCall(state, 'open').payload, { game: ID(3) });
  assert.deepEqual(errors, []);
});

test('Join asks the hub to join that invite, and the screen refreshes by itself every 5 seconds', async t => {
  const { page, errors, state } = await open(t, lobbyState());
  await click(page, '#btn-mp');
  await until(page, () => document.querySelector('#mp-body .mp-row'));
  await click(page, '[data-act="mp-join:' + ID(1) + '"]');
  await sleep(150);
  assert.deepEqual(lastCall(state, 'join').payload, { invite: ID(1) });
  // A new invite arrives while the screen is open: it shows without anything being pressed.
  state.invites = state.invites.concat([{ id: ID(4), host: 'Fay', mode: 'ffa', at: iso(0), players: ['Fay', 'Ann'] }]);
  const asked = state.calls.filter(c => c.op === 'status').length;
  await until(page, () => /Fay invited you/.test(document.querySelector('.modal').textContent), null, 9000);
  assert.ok(state.calls.filter(c => c.op === 'status').length > asked, 'it asked again');
  assert.match(await modalText(page), /Invites · 2/);
  // Closing it stops the refreshing.
  await click(page, '.modal-foot .btn');
  await sleep(100);
  const idle = state.calls.length;
  await sleep(5600);
  assert.equal(state.calls.filter(c => c.op === 'games').length, state.calls.slice(0, idle).filter(c => c.op === 'games').length, 'no more reads for the screen once it is closed');
  assert.deepEqual(errors, []);
});

test('signed out the screen says to sign in and its button asks the hub; not in Bored Together it says to join and asks the hub for that page', async t => {
  const out = lobbyState({ status: { signedIn: false, enrolled: false, name: null } });
  const { page, errors } = await open(t, out);
  await click(page, '#btn-mp');
  await until(page, () => document.querySelector('.mp-prompt'));
  assert.match(await modalText(page), /Sign in to Bored to play online/);
  assert.equal(await page.$$eval('.modal [data-act="mp-host"]', b => b.length), 0, 'no hosting while signed out');
  assert.equal(await page.$$eval('.modal #mp-code', b => b.length), 0, 'and no Join with code box');
  await click(page, '[data-act="mp-signin"]');
  await sleep(150);
  assert.ok(out.calls.some(c => c.op === 'sign-in'));
  assert.equal(await page.$eval('#mp-tag', e => e.hidden), true, 'no tag when signed out');
  // Signed in the hub tells the page, and the screen follows.
  out.status = { signedIn: true, enrolled: false, name: 'Ann' };
  await page.evaluate(() => window.__lobbyOn({ event: 'account' }));
  await until(page, () => /Join Bored Together to play online/.test(document.querySelector('.modal').textContent));
  await click(page, '[data-act="mp-together"]');
  await sleep(150);
  assert.ok(out.calls.some(c => c.op === 'open-together'));
  assert.deepEqual(errors, []);
});

test('host a live game: the Game setup with Human players (2 to 4) and an optional friend picker, and the setup goes to the hub', async t => {
  const { page, errors, state } = await open(t, lobbyState({ invites: [] }));
  await click(page, '#btn-mp');
  await until(page, () => document.querySelector('[data-act="mp-host"]'));
  await click(page, '[data-act="mp-host"]');
  await until(page, () => !document.getElementById('pane-setup').hidden && document.querySelector('#mp-people .mp-person'));
  assert.equal(await page.$eval('.setup-head .eyebrow', e => e.textContent), 'Live game');
  assert.equal(await visible(page, '#opt-humans'), false, 'the solo human count (hot-seat players on this device) is not here');
  assert.equal(await visible(page, '#opt-live-humans'), true, 'the room has its own Human players choice');
  assert.deepEqual(await page.$$eval('#opt-live-humans option', o => o.map(x => x.value)), ['2', '3', '4']);
  assert.equal(await page.$eval('#opt-live-humans', e => e.value), '2');
  assert.equal(await visible(page, '#seats'), false);
  assert.equal(await visible(page, '#room-code'), false, 'the code comes with the lobby, not before');
  for (const id of ['#opt-timer', '#opt-unjoined', '#opt-mode', '#opt-map', '#opt-size', '#opt-level', '#opt-close', '#opt-cpus', '#mp-pick']) assert.equal(await visible(page, id), true, id + ' is on the setup');
  assert.deepEqual(await page.$$eval('#mp-people .mp-person span', s => s.map(e => e.textContent)), ['Ben', 'Cleo', 'Dee', 'Eli'], 'names only');
  assert.ok(!(await page.$eval('#mp-pick', e => e.outerHTML)).includes('@'), 'no emails');
  assert.match(await page.$eval('#mp-pick', e => e.textContent), /Invite friends by name/);
  assert.equal(await page.$eval('#btn-begin', b => b.textContent), 'Open lobby');
  assert.equal(await page.$eval('#btn-begin', b => b.disabled), false, 'nobody has to be invited: the room code is enough');
  assert.equal(await visible(page, '#btn-ready'), false);
  // Three friends at most. Each one takes a seat, so Human players grows to fit them.
  const pick = name => page.evaluate(n => { [...document.querySelectorAll('#mp-people .mp-person')].find(l => l.textContent === n).querySelector('input').click(); }, name);
  await pick('Ben');
  assert.equal(await page.$eval('#opt-live-humans', e => e.value), '2', 'host and one friend fit two seats');
  for (const n of ['Cleo', 'Dee']) await pick(n);
  assert.equal(await page.$eval('#mp-count', e => e.textContent), '3 of 3 invited');
  assert.equal(await page.$eval('#opt-live-humans', e => e.value), '4', 'three friends and the host need four seats');
  assert.equal(await page.$$eval('#mp-people input:disabled', b => b.length), 1, 'the fourth cannot be picked');
  // Fewer seats than invitations: the latest invitations are taken back.
  await page.select('#opt-live-humans', '3');
  assert.equal(await page.$eval('#mp-count', e => e.textContent), '2 of 3 invited');
  assert.deepEqual(await page.$$eval('#mp-people input:checked', b => b.map(x => x.getAttribute('data-ref'))), ['ref-ben', 'ref-cleo'], 'Dee is no longer invited');
  assert.equal(await page.$$eval('#mp-people input:disabled', b => b.length), 0);
  await pick('Cleo');
  await pick('Dee');
  assert.equal(await page.$eval('#mp-count', e => e.textContent), '2 of 3 invited');
  assert.equal(await page.$eval('#opt-live-humans', e => e.value), '3');
  // CPUs make room for the people: 8 civs in all, with three people.
  assert.equal(await page.$$eval('#opt-cpus option', o => o.length), 6);
  await page.select('#opt-live-humans', '4');
  assert.equal(await page.$$eval('#opt-cpus option', o => o.length), 5, 'four people leave four CPU seats, 0 to 4');
  await page.select('#opt-live-humans', '3');
  // Co-op needs a CPU.
  await page.select('#opt-mode', 'coop');
  await page.select('#opt-cpus', '0');
  await click(page, '#btn-begin');
  assert.match(await page.$eval('#toast', e => e.textContent), /Co-op needs at least one CPU/);
  assert.equal(state.calls.some(c => c.op === 'host'), false);
  await page.select('#opt-cpus', '2');
  await page.select('#opt-timer', '60');
  await page.select('#opt-map', 'islands');
  await click(page, '#btn-begin');
  await sleep(150);
  const host = lastCall(state, 'host').payload;
  assert.deepEqual(host.invitees, ['ref-ben', 'ref-dee']);
  assert.equal(host.humans, 3);
  assert.deepEqual(host.settings, { map: 'islands', size: 'auto', level: 'normal', borders: 'tech', turns: 100, cpus: 2, timer: 60, wrap: false, conquest: true, science: true, unjoined: 'cpu', mode: 'coop' });
  // Back goes to the Multiplayer screen, and the solo setup is the way it was left.
  await click(page, '#btn-back');
  await until(page, () => /Host a live game/.test(document.querySelector('.modal').textContent));
  await click(page, '.modal-foot .btn');
  await click(page, '#btn-new');
  await until(page, () => !document.getElementById('pane-setup').hidden);
  assert.equal(await visible(page, '#opt-humans'), true);
  assert.equal(await visible(page, '#opt-live-humans'), false);
  assert.equal(await visible(page, '#seats'), true);
  assert.equal(await visible(page, '#opt-timer'), false);
  assert.equal(await visible(page, '#mp-pick'), false);
  assert.equal(await page.$eval('.setup-head .eyebrow', e => e.textContent), 'New game');
  assert.equal(await page.$$eval('#opt-cpus option', o => o.length), 8, 'the solo CPU choices are back');
  assert.equal(await page.$eval('#opt-mode', e => e.value), 'ffa', 'and the values it had');
  assert.equal(await page.$eval('#opt-map', e => e.value), 'pangaea');
  assert.equal(await page.$eval('#btn-begin', b => b.textContent), 'Start game');
  assert.equal(await page.$eval('#btn-back', b => b.getAttribute('data-act')), 'title-back');
  assert.deepEqual(errors, []);
});

test('host a live game with nobody invited: two humans by default, and the room opens on the code alone', async t => {
  const { page, errors, state } = await open(t, lobbyState({ invites: [] }));
  await click(page, '#btn-mp');
  await until(page, () => document.querySelector('[data-act="mp-host"]'));
  await click(page, '[data-act="mp-host"]');
  await until(page, () => document.querySelector('#mp-people .mp-person'));
  assert.equal(await page.$eval('#mp-count', e => e.textContent), '0 of 3 invited');
  await page.select('#opt-live-humans', '4');
  // A refusal shows as a toast and the button works again.
  state.hostError = 'Your account changed. Please try again.';
  await click(page, '#btn-begin');
  await until(page, () => /account changed/.test(document.getElementById('toast').textContent));
  assert.equal(await page.$eval('#btn-begin', b => b.disabled), false);
  state.hostError = null;
  await click(page, '#btn-begin');
  await sleep(150);
  const host = lastCall(state, 'host').payload;
  assert.deepEqual(host.invitees, []);
  assert.equal(host.humans, 4);
  assert.equal(await page.$eval('#btn-begin', b => b.disabled), true, 'one press, one room: the button waits while the lobby opens');
  assert.deepEqual(errors, []);
});

test('Join with code: it takes typing in any case with dashes and spaces, a pasted invite, and shows the hub\'s refusals under the box', async t => {
  const { page, errors, state } = await open(t, lobbyState());
  await click(page, '#btn-mp');
  await until(page, () => document.querySelector('#mp-code'));
  const text = await modalText(page);
  assert.ok(text.indexOf('Host a live game') < text.indexOf('Join with code') && text.indexOf('Join with code') < text.indexOf('Invites'), 'between Host a live game and Invites');
  assert.equal(await page.$eval('#mp-code-join', b => b.textContent), 'Join');
  assert.equal(await page.$eval('#mp-code', e => e.getAttribute('aria-label')), 'Room code');
  // Lower case with a dash and spaces: the field shows the six characters, upper case.
  await page.type('#mp-code', 'abc- 234');
  assert.equal(await page.$eval('#mp-code', e => e.value), 'ABC234');
  await click(page, '#mp-code-join');
  await sleep(150);
  assert.deepEqual(lastCall(state, 'join-code').payload, { code: 'ABC234' });
  await until(page, () => !document.getElementById('mp-code-join').disabled);
  assert.equal(await page.$eval('#mp-code-error', e => e.textContent), '');
  // Too short or empty: said under the box, and the hub is not asked.
  const asked = state.calls.filter(c => c.op === 'join-code').length;
  await page.$eval('#mp-code', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(page, '#mp-code-join');
  assert.equal(await page.$eval('#mp-code-error', e => e.textContent), 'Type or paste the room code.');
  await page.type('#mp-code', 'k7q');
  await click(page, '#mp-code-join');
  assert.equal(await page.$eval('#mp-code-error', e => e.textContent), 'A room code has 6 characters.');
  assert.equal(state.calls.filter(c => c.op === 'join-code').length, asked, 'not asked for a short code');
  // Typing clears the error. A pasted invite gives just its code.
  await page.type('#mp-code', 'x');
  assert.equal(await page.$eval('#mp-code-error', e => e.textContent), '');
  await page.$eval('#mp-code', e => { e.value = ''; e.focus(); });
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text', 'Join my Civ Lite game on Bored: code KX7Q2M');
    document.getElementById('mp-code').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert.equal(await page.$eval('#mp-code', e => e.value), 'KX7Q2M');
  // The hub's words show under the box (and not as a lost connection), and the player can try again; Enter joins too.
  state.joinError = 'That room is full';
  await page.focus('#mp-code');
  await page.keyboard.press('Enter');
  await until(page, () => document.getElementById('mp-code-error').textContent === 'That room is full');
  assert.deepEqual(lastCall(state, 'join-code').payload, { code: 'KX7Q2M' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mp-code', 'the cursor is back in the box');
  assert.equal(await page.$eval('#mp-code-join', b => b.disabled), false);
  // A redraw of the screen (a new invite arrives) keeps what was typed, the error and the cursor.
  state.invites = state.invites.concat([{ id: ID(4), host: 'Fay', mode: 'ffa', at: iso(0), players: ['Fay', 'Ann'] }]);
  await until(page, () => /Fay invited you/.test(document.querySelector('.modal').textContent), null, 9000);
  assert.equal(await page.$eval('#mp-code', e => e.value), 'KX7Q2M');
  assert.equal(await page.$eval('#mp-code-error', e => e.textContent), 'That room is full');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mp-code');
  assert.equal(await page.$$eval('#mp-code', b => b.length), 1, 'one box, not a new one per redraw');
  // Another refusal replaces the first.
  state.joinError = 'No open room with that code';
  await click(page, '#mp-code-join');
  await until(page, () => document.getElementById('mp-code-error').textContent === 'No open room with that code');
  assert.deepEqual(errors, []);
});

test('Esc steps back out of the host setup, and an empty member list says so', async t => {
  const { page, errors } = await open(t, lobbyState({ members: [] }));
  await click(page, '#btn-mp');
  await until(page, () => document.querySelector('[data-act="mp-host"]'));
  await click(page, '[data-act="mp-host"]');
  await until(page, () => /Nobody else has joined Bored Together yet/.test(document.getElementById('mp-people').textContent));
  await page.keyboard.press('Escape');
  await until(page, () => document.querySelector('.modal') && /Host a live game/.test(document.querySelector('.modal').textContent));
  assert.equal(await visible(page, '#pane-title'), true);
  assert.deepEqual(errors, []);
});

for (const width of [400, 320]) {
  test('the Multiplayer screen and the host setup fit a ' + width + 'px screen', async t => {
    const long = 'W'.repeat(40);
    const state = lobbyState({ members: Array.from({ length: 9 }, (x, i) => ({ ref: 'r' + i, name: long })), invites: [{ id: ID(1), host: long, mode: 'coop', at: iso(5), players: [long, long, long] }] });
    state.games.live[0].players = [0, 1, 2, 3].map(i => ({ name: long, you: i === 0, cpu: false, online: i % 2 === 0, state: 'joined' }));
    const { page, errors } = await open(t, state, { width });
    await click(page, '#btn-mp');
    await until(page, () => document.querySelector('#mp-body .mp-row'));
    assert.deepEqual(await page.evaluate(fits), [], 'the screen');
    await page.$eval('#mp-code-error', e => { e.textContent = 'No open room with that code. Ask the host for the code again, or for a new one.'; });
    await page.type('#mp-code', 'ABC234');
    assert.deepEqual(await page.evaluate(fits), [], 'with the Join with code box filled and an error under it');
    await page.evaluate(() => { document.querySelector('.mp-done').open = true; });
    assert.deepEqual(await page.evaluate(fits), [], 'with Finished open');
    await click(page, '[data-act="mp-host"]');
    await until(page, () => document.querySelector('#mp-people .mp-person'));
    assert.deepEqual(await page.evaluate(fits), [], 'the host setup');
    assert.deepEqual(errors, []);
  });
}

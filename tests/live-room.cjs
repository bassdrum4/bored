// A stand-in for the hub and the server, for tests of the Civ Lite screen: it keeps one room and speaks the
// bridge the page expects (window.__boredLive.call / .on). The real server is tested in together-live.test.cjs
// on Postgres, and the real hub client in live-hub.test.cjs; this one only has to give the page what they would.
const START_OPTIONS = ['map', 'size', 'level', 'borders', 'turns', 'wrap', 'conquest', 'science', 'timer'];

function createRoom(handles, config) {
  const room = {
    status: 'lobby', config: Object.assign({ map: 'pangaea', size: 'small', level: 'normal', borders: 'tech', turns: 100, cpus: 1, timer: 0, wrap: false, conquest: true, science: true, unjoined: 'cpu' }, config || {}),
    seats: handles.map((handle, i) => ({ seat: i, handle, state: i === 0 ? 'joined' : 'invited', civ: null, controller: 'human', online: true, away: 0, team: i })),
    start: null, head: 0, round: 1, actions: [], snapshots: new Map(), hashes: new Map(), claims: new Map(), desyncs: [], pages: new Map(), calls: [], exits: [], reloads: [], pings: []
  };
  const timer = () => room.config.timer || 0;
  const json = seat => ({
    id: 'room', game: 'ashcrown', host: 'host', status: room.status, config: room.config, start: room.start, timer: timer(), head: room.head, round: room.round, round_age: 0,
    winner: null, me: seat, seats: room.seats.map(s => Object.assign({}, s)),
    snapshot: room.snapshots.size ? { round: Math.max(...room.snapshots.keys()), seq: 0, hash: '' } : null
  });
  const latest = () => (room.snapshots.size ? room.snapshots.get(Math.max(...room.snapshots.keys())) : null);
  async function push(event, only) {
    for (const [seat, page] of room.pages) {
      if (only !== undefined && seat !== only) continue;
      await page.evaluate(e => { if (window.__liveOn) window.__liveOn(e); }, event).catch(() => {});
    }
  }
  const pushGame = () => { for (const [seat] of room.pages) push({ event: 'game', game: json(seat) }, seat); };

  async function call(seat, op, p) {
    room.calls.push({ seat, op, p });
    const mine = room.seats.find(s => s.seat === seat);
    if (op === 'hello' || op === 'game') {
      if (room.status === 'lobby' && mine.state === 'invited') { mine.state = 'joined'; pushGame(); }
      const snap = room.status === 'active' ? latest() : null;
      const after = snap ? snap.seq : 0;
      return op === 'game' ? json(seat) : {
        game: json(seat), host: seat === 0, snapshot: snap, actions: room.actions.filter(a => a.seq > after), presence: null
      };
    }
    if (op === 'lobby') {
      if (room.status !== 'lobby') throw new Error('This game has already started.');
      if (p.config) {
        if (seat !== 0) throw new Error('Only the host can change the setup.');
        if (JSON.stringify(p.config) !== JSON.stringify(room.config)) {
          room.config = p.config;
          for (const s of room.seats) if (s.state === 'ready' && s.seat !== seat) s.state = 'joined';
        }
      }
      if ('civ' in p) {
        const civ = p.civ === 'random' ? null : p.civ;
        if (civ && room.seats.some(s => s.civ === civ && s.seat !== seat)) throw new Error('That civ is taken.');
        mine.civ = civ;
      }
      if ('ready' in p) mine.state = p.ready ? 'ready' : 'joined';
      pushGame();
      return json(seat);
    }
    if (op === 'start') {
      if (seat !== 0) throw new Error('Only the host can start the game.');
      if (room.seats.some(s => s.state === 'joined' && s.seat !== 0)) throw new Error('Everyone who joined has to be ready.');
      const list = [];
      for (const s of room.seats) {
        if (s.state === 'joined' || s.state === 'ready') list.push({ seat: list.length, kind: 'human', handle: s.handle, civ: s.civ, team: list.length });
        else if (room.config.unjoined === 'cpu') list.push({ seat: list.length, kind: 'cpu', handle: null, civ: null, team: list.length });
      }
      for (let k = 0; k < room.config.cpus; k++) list.push({ seat: list.length, kind: 'cpu', handle: null, civ: null, team: list.length });
      room.seats = room.seats.filter(s => s.state === 'joined' || s.state === 'ready').map((s, i) => Object.assign(s, { seat: i, state: 'ready' }));
      room.start = { seats: list, options: { map: room.config.map, size: room.config.size, level: room.config.level, borders: room.config.borders, turns: room.config.turns,
        wrap: room.config.wrap, conquest: room.config.conquest, science: room.config.science, timer: room.config.timer, seed: 777001 } };
      room.status = 'active';
      pushGame();
      return json(seat);
    }
    if (op === 'send') {
      if (room.status !== 'active') throw new Error('This game is not running.');
      if (p.type === 'cpu-takes-over') { room.seats[p.args.seat].controller = 'cpu'; }
      if (p.type === 'human-returns') { if (mine.controller !== 'cpu') return { seq: room.head, duplicate: true }; mine.controller = 'human'; }
      const action = { seq: ++room.head, seat, type: p.type, args: p.args || {} };
      room.actions.push(action);
      // The sender gets its answer, and every page (its own too) gets the action, a moment apart as on a real network.
      setTimeout(() => push({ event: 'actions', actions: [action] }), 5);
      return { seq: action.seq, duplicate: false, head: room.head };
    }
    // 5.1: a map ping goes to the other seats as its own message. It is not an action and never enters the log.
    if (op === 'ping') {
      if (room.status !== 'active') throw new Error('This game is not running.');
      if (room.config.mode !== 'coop') throw new Error('Pings are for co-op games.');
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) throw new Error('Invalid request.');
      room.pings.push({ seat, x: p.x, y: p.y });
      for (const [other] of room.pages) if (other !== seat) setTimeout(() => push({ event: 'ping', seat, x: p.x, y: p.y }, other), 5);
      return { id: room.pings.length };
    }
    // The server's three checks (5.1.1): a report names the round under way or the next one, a snapshot is kept only once
    // another seat has reported the same hash for that round, and the game ends on two matching claims from humans.
    if (op === 'report') {
      if (room.status !== 'active') return { ok: true, desync: false };
      if (p.round !== room.round && p.round !== room.round + 1) throw new Error('Invalid request.');
      const key = p.round + ':' + seat;
      if (!room.hashes.has(key)) room.hashes.set(key, p.hash);
      if (p.round > room.round) room.round = p.round;
      const other = [...room.hashes].find(([k, h]) => k.startsWith(p.round + ':') && k !== key && h !== p.hash);
      if (other) { room.desyncs.push({ round: p.round, seat }); return { ok: true, desync: true }; }
      return { ok: true, desync: false };
    }
    if (op === 'snapshot') {
      if (room.waits > 0) { room.waits--; return { stored: false, wait: true }; }   // a test can make the server say "wait" a few times
      const humans = room.seats.filter(s => s.state !== 'left' && s.controller === 'human').length;
      const confirmed = [...room.hashes].some(([k, h]) => k.startsWith(p.round + ':') && k !== p.round + ':' + seat && h === p.hash);
      if ((humans > 1 || mine.controller !== 'human') && !confirmed) return { stored: false, wait: true };
      if (!room.snapshots.has(p.round)) room.snapshots.set(p.round, { round: p.round, seq: p.seq, hash: p.hash, state: p.state });
      return { stored: true };
    }
    if (op === 'finish') {
      if (room.failFinish > 0) { room.failFinish--; throw new Error('Failed to fetch'); }   // ... or lose a few finish calls
      if (room.status === 'active' && mine.controller === 'human') {
        room.claims.set(seat, p.winner);
        const live = room.seats.filter(s => s.state !== 'left' && s.controller === 'human');
        const votes = new Map();
        for (const s of live) if (room.claims.has(s.seat)) votes.set(room.claims.get(s.seat), (votes.get(room.claims.get(s.seat)) || 0) + 1);
        const best = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
        if (best && best[1] >= Math.min(2, live.length)) { room.status = 'completed'; room.winner = best[0]; }
      }
      return json(seat);
    }
    if (op === 'leave') { if (seat === 0) room.status = 'cancelled'; else mine.state = 'left'; pushGame(); return json(seat); }
    if (op === 'exit') { room.exits.push(seat); return {}; }
    if (op === 'reload') { room.reloads.push({ seat, round: p.round }); return {}; }
    if (op === 'resync') return {};
    throw new Error('Unknown operation.');
  }

  // Gives a puppeteer page the bridge for one seat. Call before the page loads.
  async function attach(page, seat) {
    room.pages.set(seat, page);
    await page.exposeFunction('__liveCall', (op, p) => call(seat, op, p).then(r => JSON.stringify(r === undefined ? null : r), e => JSON.stringify({ __error: e.message })));
    await page.evaluateOnNewDocument(() => {
      window.__boredLive = {
        call: (op, p) => window.__liveCall(op, p || {}).then(text => { const r = JSON.parse(text); if (r && r.__error) throw new Error(r.__error); return r; }),
        on: fn => { window.__liveOn = fn; }
      };
    });
  }
  return { room, call, attach, push, START_OPTIONS };
}

module.exports = { createRoom };

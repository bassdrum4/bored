// Analytics admin accounts are staff, not players. Their own events and time are
// dropped before anything is counted, charted or exported.
export function excludeAdmins(events, adminIds) {
  const admins = new Set(adminIds || []);
  if (!admins.size) return events;
  // Exclude a signed-in admin's anonymous activity on the same opted-in browser.
  const adminBrowsers = new Set(events.filter(e => admins.has(e.user_id) && e.visitor_id).map(e => e.visitor_id));
  return events.filter(e => !admins.has(e.user_id) && !(e.visitor_id && adminBrowsers.has(e.visitor_id)));
}

// Pure aggregation shared by the admin page and regression tests. No fixture data.
export function summarizeEvents(events, handles = {}) {
  const sessions = new Map(), days = new Map(), hours = new Map(), gameDays = new Map();
  for (const event of events) {
    const key = event.session_id + ':' + (event.user_id || 'guest');
    if (!sessions.has(key)) sessions.set(key, { id: event.session_id, user: event.user_id, game: event.game,
      handle: event.user_id ? (handles[event.user_id] || event.user_id.slice(0, 8)) : 'Guest · ' + event.session_id.slice(0, 8),
      start: event.received_at, last: event.received_at, active: 0, visible: 0, errors: 0, completed: false, ended: false, hasStart: false, events: [] });
    const s = sessions.get(key);
    s.active += event.active_ms; s.visible += event.visible_ms;
    s.start = s.start < event.received_at ? s.start : event.received_at;
    s.last = s.last > event.received_at ? s.last : event.received_at;
    s.errors += Number(event.kind === 'error');
    s.completed ||= event.kind === 'daily_complete';
    s.ended ||= event.kind === 'end'; s.hasStart ||= event.kind === 'start';
    s.events.push(event);
    if (!s.latest || event.received_at >= s.latest.received_at) s.latest = event;
    const date = new Date(event.received_at);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', hour: '2-digit', hourCycle: 'h23' }).format(date);
    for (const [map, id] of [[days, day], [hours, hour]]) {
      if (!map.has(id)) map.set(id, { id, active: 0, users: new Set(), sessions: new Set() });
      const bucket = map.get(id); bucket.active += event.active_ms; bucket.sessions.add(key);
      if (event.user_id) bucket.users.add(event.user_id);
    }
    if (!gameDays.has(event.game)) gameDays.set(event.game, new Map());
    const perDay = gameDays.get(event.game);
    perDay.set(day, (perDay.get(day) || 0) + event.active_ms);
  }
  const list = [...sessions.values()].sort((a, b) => b.last.localeCompare(a.last));
  const groups = (keyFor) => {
    const map = new Map();
    for (const s of list) {
      const key = keyFor(s);
      if (!map.has(key)) map.set(key, { id: key, label: key === s.user ? s.handle : key, active: 0, visible: 0, sessions: 0, users: new Set(), games: new Set(), days: new Set(), errors: 0, completed: 0, last: s.last });
      const g = map.get(key);
      g.active += s.active; g.visible += s.visible; g.sessions++; g.games.add(s.game);
      if (s.user) g.users.add(s.user);
      s.events.forEach(e => g.days.add(new Date(e.received_at).toLocaleDateString('en-CA', { timeZone: 'America/Detroit' })));
      g.errors += s.errors; g.completed += Number(s.completed);
    }
    return [...map.values()].sort((a, b) => b.active - a.active || b.sessions - a.sessions);
  };
  const games = groups(s => s.game), players = groups(s => s.user || 'Unidentified guests');
  const signed = players.filter(p => p.id !== 'Unidentified guests');
  return { sessions: list, games, players,
    sources: groups(s => s.latest?.details?.source || 'unknown'),
    devices: groups(s => (s.latest?.details?.device || 'unknown') + (s.latest?.details?.embedded ? ' · embedded' : ' · direct')),
    modes: groups(s => s.latest?.details?.daily ? 'Daily challenge' : 'Free play'),
    days: [...days.values()].sort((a, b) => a.id.localeCompare(b.id)),
    hours: Array.from({ length: 24 }, (_, hour) => hours.get(String(hour).padStart(2, '0')) || { id: String(hour).padStart(2, '0'), active: 0, users: new Set(), sessions: new Set() }),
    gameDays: Object.fromEntries([...gameDays].map(([game, perDay]) => [game, Object.fromEntries(perDay)])),
    totals: { active: list.reduce((n, s) => n + s.active, 0), visible: list.reduce((n, s) => n + s.visible, 0),
      sessions: list.length, accounts: signed.length, repeatAccounts: signed.filter(p => p.days.size > 1).length,
      guests: list.filter(s => !s.user).length, errors: list.reduce((n, s) => n + s.errors, 0), completed: list.filter(s => s.completed).length }
  };
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; // spreadsheet formula injection
  return '"' + text.replaceAll('"', '""') + '"';
}
export function eventsCSV(events, handles) {
  const fields = ['received_at','session_id','user_id','handle','game','kind','active_ms','visible_ms','details'];
  return [fields.map(csvCell).join(','), ...events.map(e => fields.map(k => csvCell(k === 'handle' ? handles[e.user_id] || '' : k === 'details' ? JSON.stringify(e.details) : e[k])).join(','))].join('\r\n');
}

// Retention uses meaningful play and dates, never raw page loads as proof of fun.
export function summarizeEngagement(events, productEvents = [], survey = [], cutoff = new Date()) {
  const dateOf = date => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Detroit',
    year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(date));
  const dateMs = value => Date.parse(value + 'T12:00:00Z');
  const monday = day => {
    const d = new Date(dateMs(day));
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0,10);
  };
  const identity = e => e.user_id ? 'u:' + e.user_id : e.visitor_id ? 'v:' + e.visitor_id : null;
  const sessions = new Map();
  for (const e of events) {
    if (!e.session_id || !['start','checkpoint','interaction','end','daily_complete','error'].includes(e.kind)) continue;
    const key = e.session_id + ':' + (e.user_id || 'guest');
    if (!sessions.has(key)) sessions.set(key, { game:e.game, who:identity(e), date:dateOf(e.received_at),
      active:0, loaded:false, interacted:false, finished:false });
    const s = sessions.get(key);
    s.active += Number(e.active_ms) || 0;
    s.loaded ||= e.kind === 'checkpoint' && e.details?.loaded === true;
    s.interacted ||= e.kind === 'interaction';
    s.finished ||= e.kind === 'daily_complete' || (e.kind === 'checkpoint' && e.details?.round_finished === true);
  }
  const games = new Map(), people = new Map();
  let loaded = 0, interacting = 0, meaningful = 0;
  for (const s of sessions.values()) {
    loaded += Number(s.loaded);
    interacting += Number(s.interacted);
    s.meaningful = s.active >= 60000 || s.finished;
    meaningful += Number(s.meaningful);
    if (!games.has(s.game)) games.set(s.game, { game:s.game, sessions:0, meaningful:0, players:new Set(),
      returners:new Set(), days:new Map(), repeatEligible:0, repeatReturns:0 });
    const g = games.get(s.game);
    g.sessions++; g.meaningful += Number(s.meaningful);
    if (!s.meaningful || !s.who) continue;
    g.players.add(s.who);
    if (!g.days.has(s.who)) g.days.set(s.who,new Set());
    g.days.get(s.who).add(s.date);
    if (!people.has(s.who)) people.set(s.who,new Set());
    people.get(s.who).add(s.date);
  }
  const today = dateOf(cutoff), cutoffMs = dateMs(today);
  const firstWeeks = new Map();
  for (const [who, dates] of people) {
    const first = [...dates].sort()[0];
    firstWeeks.set(who,monday(first));
  }
  let eligible = 0, nextWeekReturns = 0;
  for (const [who, firstWeek] of firstWeeks) {
    const start = dateMs(firstWeek);
    // A full following school week must have elapsed before scoring the cohort.
    if (cutoffMs < start + 14*86400000) continue;
    eligible++;
    const returned = [...people.get(who)].some(day => {
      const ms = dateMs(day), weekday = new Date(ms).getUTCDay();
      return ms >= start+7*86400000 && ms < start+14*86400000 && weekday>=1 && weekday<=5;
    });
    nextWeekReturns += Number(returned);
  }
  let repeatEligible = 0, repeatReturns = 0;
  for (const g of games.values()) {
    for (const [who, dates] of g.days) {
      const first = [...dates].sort()[0];
      if (cutoffMs - dateMs(first) < 7*86400000) continue;
      repeatEligible++; g.repeatEligible++;
      if ([...dates].some(d => d > first)) { repeatReturns++; g.repeatReturns++; g.returners.add(who); }
    }
  }
  const visitors = new Map();
  for (const e of productEvents) {
    if (e.kind !== 'visit') continue;
    const who = identity(e);
    if (!who) continue;
    const day = dateOf(e.received_at);
    if (!visitors.has(who)) visitors.set(who,new Set());
    visitors.get(who).add(day);
  }
  const visitorDays = new Map();
  for (const dates of visitors.values()) {
    const ordered = [...dates].sort();
    for (let i=0;i<ordered.length;i++) {
      const day = ordered[i];
      if (!visitorDays.has(day)) visitorDays.set(day,{ day,new:0,returning:0 });
      visitorDays.get(day)[i ? 'returning':'new']++;
    }
  }
  const ratings = survey.filter(e => Number.isInteger(Number(e.rating)) && e.rating>=1 && e.rating<=5);
  const average = ratings.length ? ratings.reduce((n,e)=>n+Number(e.rating),0)/ratings.length : null;
  // A game's own average is the closest thing to "what people like" in the data.
  const rated = new Map();
  for (const e of ratings) {
    if (!e.game) continue;
    if (!rated.has(e.game)) rated.set(e.game, { game:e.game, ratings:0, total:0 });
    const row = rated.get(e.game); row.ratings++; row.total += Number(e.rating);
  }
  return {
    sessions:sessions.size, loaded, interacting, meaningful, identifiedEngaged:people.size,
    uniqueVisitors:visitors.size, visitorsByDay:[...visitorDays.values()].sort((a,b)=>a.day.localeCompare(b.day)),
    retention:{eligible,returned:nextWeekReturns},repeatGame:{eligible:repeatEligible,returned:repeatReturns},
    games:[...games.values()].map(g=>({game:g.game,sessions:g.sessions,meaningful:g.meaningful,
      engagedPlayers:g.players.size,repeatPlayers:g.returners.size,
      repeatEligible:g.repeatEligible,repeatReturns:g.repeatReturns})).sort((a,b)=>b.meaningful-a.meaningful || b.sessions-a.sessions),
    survey:{responses:ratings.length,average,positive:ratings.filter(e=>Number(e.rating)>=4).length,
      byGame:[...rated.values()].map(g=>({game:g.game,ratings:g.ratings,average:g.total/g.ratings}))
        .sort((a,b)=>b.average-a.average || b.ratings-a.ratings)}
  };
}

// One row per game joining play time with the signals that explain it: how
// often a session becomes real play, how often a player comes back, and how
// much attention the library card earned. Charts and advice read from here.
export function buildGameSignals({ report, engagement } = {}) {
  const rows = new Map();
  for (const g of report?.games || []) rows.set(g.id, {
    id: g.id, active: g.active, visible: g.visible, sessions: g.sessions,
    players: g.users?.size || 0, errors: g.errors, completed: g.completed,
    meaningful: 0, repeatEligible: 0, repeatReturns: 0
  });
  for (const g of engagement?.games || []) {
    if (!rows.has(g.game)) rows.set(g.game, {
      id: g.game, active: 0, visible: 0, sessions: g.sessions, players: 0, errors: 0,
      completed: 0, meaningful: 0, repeatEligible: 0, repeatReturns: 0
    });
    const row = rows.get(g.game);
    row.meaningful = g.meaningful || 0;
    row.repeatEligible = g.repeatEligible || 0;
    row.repeatReturns = g.repeatReturns || 0;
  }
  const total = [...rows.values()].reduce((n, row) => n + row.active, 0);
  return [...rows.values()].map(row => ({
    ...row,
    share: total ? row.active / total : 0,
    perSession: row.sessions ? row.active / row.sessions : 0,
    hookRate: row.sessions ? row.meaningful / row.sessions : 0,
    returnRate: row.repeatEligible ? row.repeatReturns / row.repeatEligible : null
  })).sort((a, b) => b.active - a.active || b.sessions - a.sessions);
}

// Turns the aggregates into a short, ranked reading list for the admin:
// what is carrying the site, what is leaking, and where the next move is.
// Every claim is derived from the selected range, never from a baseline.
export function buildInsights({ signals = [], hours = [], sources = [], survey = {}, totals = {} } = {}, names = {}, limit = 6) {
  const name = id => names[id] || id;
  const pct = ratio => Number.isFinite(ratio) ? Math.round(ratio * 100) + '%' : '—';
  const span = ms => ms >= 60000 ? (ms / 60000).toFixed(1) + ' min' : Math.round(ms / 1000) + ' s';
  // Three sessions is noise, not a finding: the board stays empty until the
  // range holds a real sample, and per-game cards need one per game.
  const MIN_SESSIONS = 10, MIN_RETURN_COHORT = 5;
  const active = signals.filter(row => row.sessions > 0);
  if (!active.length || !(totals.sessions >= MIN_SESSIONS)) return [];
  const found = [], used = new Set();
  const add = (item, game) => { if (game) used.add(game); found.push(item); };

  const anchor = active[0];
  if (anchor.sessions >= MIN_SESSIONS && anchor.share >= 0.15) add({ tone: 'good', metric: pct(anchor.share),
    title: name(anchor.id) + ' carries the site',
    detail: pct(anchor.share) + ' of play time over ' + anchor.sessions + ' sessions, ' + span(anchor.perSession) + ' each. The next content drop belongs here.' }, anchor.id);

  const leak = active.filter(row => row.sessions >= MIN_SESSIONS && !used.has(row.id))
    .sort((a, b) => a.hookRate - b.hookRate)[0];
  if (leak && leak.hookRate < 0.5) add({ tone: 'watch', metric: pct(leak.hookRate),
    title: name(leak.id) + ' opens but does not hook',
    detail: 'Only ' + pct(leak.hookRate) + ' of ' + leak.sessions + ' sessions reach a minute of play. Explain the goal on the first screen and get players moving sooner.' }, leak.id);

  const comeback = active.filter(row => row.repeatEligible >= MIN_RETURN_COHORT && !used.has(row.id))
    .sort((a, b) => (b.returnRate || 0) - (a.returnRate || 0))[0];
  if (comeback && comeback.returnRate >= 0.3) add({ tone: 'good', metric: pct(comeback.returnRate),
    title: name(comeback.id) + ' brings people back',
    detail: comeback.repeatReturns + ' of ' + comeback.repeatEligible + ' players returned on another day. A daily, a streak or a second mode would land on ready ground.' }, comeback.id);

  const broken = active.filter(row => row.sessions >= MIN_SESSIONS && !used.has(row.id))
    .sort((a, b) => b.errors / b.sessions - a.errors / a.sessions)[0];
  if (broken && broken.errors && broken.errors / broken.sessions >= 0.2) add({ tone: 'watch', metric: pct(broken.errors / broken.sessions),
    title: name(broken.id) + ' throws errors',
    detail: broken.errors + ' of ' + broken.sessions + ' sessions recorded a runtime error. Fixing it is cheaper than anything new.' }, broken.id);

  const rated = (survey.byGame || []).filter(row => row.ratings >= 2);
  if (rated.length) {
    const best = rated[0];
    if (best.average >= 4) add({ tone: 'good', metric: best.average.toFixed(1) + ' / 5',
      title: 'Players rate ' + name(best.game) + ' highest',
      detail: best.ratings + ' ratings average ' + best.average.toFixed(1) + '. This is the formula to repeat in the quieter games.' }, best.game);
    const worst = rated[rated.length - 1];
    if (rated.length > 1 && worst.average < 3) add({ tone: 'watch', metric: worst.average.toFixed(1) + ' / 5',
      title: name(worst.game) + ' lands flat',
      detail: worst.ratings + ' ratings average ' + worst.average.toFixed(1) + '. Ask what is missing before adding more of it.' }, worst.game);
  }

  const busiest = [...hours].filter(row => row.active > 0).sort((a, b) => b.active - a.active)[0];
  if (busiest) {
    const next = String((Number(busiest.id) + 1) % 24).padStart(2, '0');
    add({ tone: 'idea', metric: busiest.id + ':00',
      title: 'Play peaks at ' + busiest.id + ':00 Detroit',
      detail: 'New games, announcements and daily resets are seen most between ' + busiest.id + ':00 and ' + next + ':00.' });
  }

  const sourceTotal = sources.reduce((n, row) => n + row.active, 0);
  const top = [...sources].sort((a, b) => b.active - a.active)[0];
  if (top && sourceTotal && top.active / sourceTotal >= 0.4) add({ tone: 'idea', metric: pct(top.active / sourceTotal),
    title: 'Most play starts from ' + (top.id === 'unknown' ? 'an unknown source' : top.id),
    detail: pct(top.active / sourceTotal) + ' of play time. Put launch work there before trying a new channel.' });

  if (anchor.share >= 0.6 && active.length > 2) add({ tone: 'watch', metric: pct(anchor.share),
    title: 'One game is most of the site',
    detail: name(anchor.id) + ' holds ' + pct(anchor.share) + ' of play time. A quiet week there is a quiet week everywhere.' }, anchor.id);

  return found.slice(0, limit);
}

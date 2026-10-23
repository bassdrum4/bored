// Pure aggregation shared by the admin page and regression tests. No fixture data.
export function summarizeEvents(events, handles = {}) {
  const sessions = new Map(), days = new Map(), hours = new Map();
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

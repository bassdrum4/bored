// A small Supabase Realtime client: the Phoenix channel protocol over the browser's own WebSocket, enough to
// hear new rows on one table (postgres_changes). There is no library to load or pin.
//
// Realtime is a wake-up call, not the source of truth. The caller keeps polling while the socket is down and
// always reads the log again when it comes back up, so a lost frame costs a moment, never an action.
//
//   const channel = subscribeChanges({
//     url: 'wss://<project>.supabase.co/realtime/v1/websocket?apikey=<key>&vsn=1.0.0',
//     topic: 'live-<game id>',
//     changes: [{ event: 'INSERT', schema: 'bored_live', table: 'actions', filter: 'game_id=eq.<game id>' }],
//     getToken: async () => accessToken,
//     onChange: (record, change) => {},  // one row, as the database has it, and the change it came in (change.table says which)
//     onState: (open, reason) => {}      // true once the server has accepted the subscription
//   });
//   channel.close();

// Phoenix presence state, keyed by server connection refs. Never trust client
// names; the presence UI resolves only server-issued tickets.
export function createPresenceState() {
  const members = new Map();
  let ready = false, pending = [];
  function apply(group, joining) {
    for (const [key, entry] of Object.entries(group || {})) {
      if (!Array.isArray(entry?.metas)) continue;
      const refs = members.get(key) || new Map();
      for (const meta of entry.metas) {
        if (typeof meta?.phx_ref !== 'string') continue;
        if (joining) {
          if (typeof meta.phx_ref_prev === 'string') refs.delete(meta.phx_ref_prev);
          refs.set(meta.phx_ref, typeof meta.ticket === 'string' ? meta.ticket : '');
        } else refs.delete(meta.phx_ref);
      }
      if (refs.size) members.set(key, refs); else members.delete(key);
    }
  }
  function diff(payload) { apply(payload?.joins, true); apply(payload?.leaves, false); }
  return {
    reset() { members.clear(); ready = false; pending = []; },
    snapshot(payload) {
      members.clear(); apply(payload, true); ready = true;
      for (const item of pending) diff(item);
      pending = [];
    },
    change(payload) {
      if (!ready) { if (pending.length < 1000) pending.push(payload); return; }
      diff(payload);
    },
    tickets() {
      return ready ? [...new Set([...members.values()].flatMap(refs => [...refs.values()]).filter(Boolean))].sort() : null;
    }
  };
}

export function subscribeChanges(options) {
  const { url, topic, changes = [], getToken, onChange, onState, onPresence } = options;
  const presence = typeof onPresence === 'function' ? createPresenceState() : null;
  let desiredTicket = '', presenceRef = '';
  const reportPresence = () => { try { onPresence?.(presence.tickets()); } catch {} };
  const Socket = options.WebSocket || globalThis.WebSocket;
  const heartbeatMs = options.heartbeatMs || 25000;
  const joinWaitMs = options.joinWaitMs || 10000;
  const tokenMs = options.tokenMs || 300000;
  const retry = options.retry || [1000, 2000, 4000, 8000, 15000];
  const name = 'realtime:' + topic;
  let socket = null, ref = 0, joinRef = '', joined = false, closed = false, attempt = 0, missed = 0;
  let retryTimer = 0, beatTimer = 0, joinTimer = 0, tokenTimer = 0;

  const tell = (open, reason) => { try { if (onState) onState(open, reason); } catch (error) { /* a listener's problem */ } };

  function send(event, payload, to) {
    if (!socket || socket.readyState !== 1) return;
    ref += 1;
    try { socket.send(JSON.stringify({ topic: to || name, event, payload, ref: String(ref), join_ref: joinRef })); return String(ref); } catch (error) { /* the close handler follows */ }
  }

  function pushPresence() {
    if (joined && presence && desiredTicket) {
      presenceRef = send('presence', { type: 'presence', event: 'track', payload: { ticket: desiredTicket } });
    }
  }

  // The socket is gone or useless: say so once, and try again a little later.
  function down(reason) {
    const was = joined;
    joined = false;
    if (presence) { presence.reset(); reportPresence(); presenceRef = ''; }
    clearInterval(beatTimer); clearTimeout(joinTimer); clearInterval(tokenTimer);
    const old = socket;
    socket = null;
    if (old) { try { old.close(); } catch (error) { /* already closed */ } }
    if (was) tell(false, reason);
    if (closed) return;
    const base = retry[Math.min(attempt, retry.length - 1)];
    attempt += 1;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, base + Math.floor(Math.random() * base * 0.3));
  }

  function receive(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (error) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.event === 'phx_reply') {
      if (m.topic === 'phoenix') { missed = 0; return; }
      if (m.topic !== name) return;
      if (presence && presenceRef && m.ref === presenceRef && m.payload?.status !== 'ok') { down('Presence was refused.'); return; }
      if (m.ref === joinRef) {
        const reply = m.payload || {};
        const bound = reply.response && Array.isArray(reply.response.postgres_changes) ? reply.response.postgres_changes.length : 0;
        // The server has to have accepted every binding, or nothing will ever arrive.
        if (reply.status === 'ok' && bound >= changes.length) {
          clearTimeout(joinTimer);
          joined = true; attempt = 0; missed = 0;
          beatTimer = setInterval(() => {
            if (missed >= 2) { down('The server stopped answering.'); return; }
            missed += 1;
            send('heartbeat', {}, 'phoenix');
          }, heartbeatMs);
          // A long-lived socket keeps working past the token's hour.
          tokenTimer = setInterval(async () => {
            try { const next = await getToken(); if (next && joined) send('access_token', { access_token: next }); } catch (error) { /* try again next time */ }
          }, tokenMs);
          tell(true);
          pushPresence();
        } else down((reply.response && reply.response.reason) || 'The server refused the subscription.');
      }
      return;
    }
    if (m.topic !== name) return;
    if (presence && m.event === 'presence_state') { presence.snapshot(m.payload); reportPresence(); }
    else if (presence && m.event === 'presence_diff') { presence.change(m.payload); reportPresence(); }
    else if (m.event === 'postgres_changes') {
      const data = m.payload && m.payload.data;
      if (data && data.type === 'INSERT' && data.record && typeof data.record === 'object') {
        try { onChange(data.record, data); } catch (error) { /* a listener's problem */ }
      }
    } else if (m.event === 'phx_error' || m.event === 'phx_close') down('The channel closed.');
    else if (m.event === 'system' && m.payload && m.payload.status === 'error') down(m.payload.message || 'The subscription failed.');
  }

  async function connect() {
    if (closed || socket) return;
    let token = '';
    try { token = await getToken(); } catch (error) { token = ''; }
    if (closed || socket) return;
    if (!token) { down('No session.'); return; }
    let mine;
    try { mine = new Socket(url); } catch (error) { down(String((error && error.message) || error)); return; }
    socket = mine;
    mine.onopen = () => {
      if (mine !== socket) return;
      joinRef = String(ref + 1);
      send('phx_join', { config: { broadcast: { ack: false, self: false }, presence: { key: '', ...(presence ? { enabled: true } : {}) }, postgres_changes: changes, private: options.private === true }, access_token: token });
      joinTimer = setTimeout(() => { if (mine === socket && !joined) down('The server did not answer.'); }, joinWaitMs);
    };
    mine.onmessage = event => { if (mine === socket) receive(event.data); };
    mine.onclose = () => { if (mine === socket) down('The connection closed.'); };
    mine.onerror = () => { /* onclose follows */ };
  }

  connect();
  return {
    isOpen: () => joined,
    trackPresence(ticket) {
      if (!presence || closed || typeof ticket !== 'string' || !ticket || desiredTicket === ticket) return;
      desiredTicket = ticket;
      pushPresence();
    },
    // Try again now instead of at the next backoff, for when the network comes back.
    reconnect() { if (closed || socket) return; attempt = 0; clearTimeout(retryTimer); connect(); },
    close() {
      closed = true;
      if (presence) { presence.reset(); reportPresence(); }
      clearTimeout(retryTimer); clearInterval(beatTimer); clearTimeout(joinTimer); clearInterval(tokenTimer);
      const old = socket;
      socket = null;
      if (old) {
        try { if (old.readyState === 1) old.send(JSON.stringify({ topic: name, event: 'phx_leave', payload: {}, ref: String(++ref), join_ref: joinRef })); } catch (error) { /* closing anyway */ }
        try { old.close(); } catch (error) { /* already closed */ }
      }
      joined = false;
    }
  };
}

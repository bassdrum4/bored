// Puffer Party's live-water channel. The database and Edge Function own every
// seat, turn, heart and answer; this socket only carries presence and a nudge
// telling other divers to re-read the authoritative room over HTTP.
const API_KEY = 'sb_publishable_Ayx7pzjm55vlzQ4u8se9KA_O97WK-QZ';
const SOCKET = `wss://djdpttltfmwkofdrvkem.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(API_KEY)}&vsn=1.0.0`;

export function connectParty({ code, name = 'Diver', onStatus = () => {}, onMessage = () => {} }) {
  let socket;
  let closed = false;
  let retry = 0;
  let timer;
  let heartbeat;
  let ref = 0;
  let joined = false;
  const members = new Map();
  const topic = 'realtime:party:' + code;
  const presenceKey = (crypto.randomUUID?.() || String(Math.random()).slice(2)) + '-' + Date.now();

  const send = (event, payload, target = topic) => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ topic: target, event, payload, ref: String(++ref) }));
  };

  const schedule = () => {
    clearTimeout(timer);
    if (closed) return;
    const delay = Math.min(30_000, 700 * 2 ** Math.min(retry++, 5)) * (0.5 + Math.random());
    timer = setTimeout(open, delay);
  };

  const paintPresence = () => onMessage({ type: 'presence', members: [...members.values()] });

  function handle(message) {
    if (message.event === 'phx_reply') {
      if (message.payload?.status === 'ok') {
        if (!joined) { joined = true; retry = 0; onStatus('connected'); }
      } else if (message.payload?.status === 'error') {
        closed = true;
        onStatus('unauthorized');
        try { socket?.close(); } catch { /* already gone */ }
      }
      return;
    }
    if (message.event === 'presence_state') {
      members.clear();
      for (const [id, value] of Object.entries(message.payload || {})) members.set(id, value);
      paintPresence();
      return;
    }
    if (message.event === 'presence_diff') {
      for (const id of Object.keys(message.payload?.leaves || {})) members.delete(id);
      for (const [id, value] of Object.entries(message.payload?.joins || {})) members.set(id, value);
      paintPresence();
      return;
    }
    if (message.event === 'broadcast' && message.payload?.event === 'party') {
      onMessage({ type: 'broadcast', revision: Number(message.payload.payload?.revision) || 0, kind: message.payload.payload?.kind || 'update' });
    }
  }

  function open() {
    if (closed) return;
    onStatus('connecting');
    socket = new WebSocket(SOCKET);
    socket.onopen = () => {
      send('phx_join', {
        config: { broadcast: { self: false }, presence: { key: presenceKey } },
        access_token: API_KEY
      });
      send('presence', { type: 'presence', event: 'track', payload: { name } });
      clearInterval(heartbeat);
      heartbeat = setInterval(() => send('heartbeat', {}, 'phoenix'), 25_000);
    };
    socket.onmessage = ({ data }) => {
      try { handle(JSON.parse(data)); } catch { /* ignore non-JSON */ }
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      clearInterval(heartbeat);
      if (closed) return;
      joined = false;
      members.clear();
      onStatus('disconnected');
      schedule();
    };
  }

  open();
  return {
    broadcast() {
      send('broadcast', { type: 'broadcast', event: 'party', payload: { revision: 0, kind: 'update' } });
    },
    close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      try { socket?.close(1000, 'Leaving the party'); } catch { /* already gone */ }
      onStatus('closed');
    }
  };
}

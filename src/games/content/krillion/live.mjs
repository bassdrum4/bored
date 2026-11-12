// Reconnectable, same-origin realtime client for the results screen.
// Every (re)connect asks this site for a single-use ticket; the browser never
// chooses its identity, the room capabilities or the published events.
export function connectLive({ room, onStatus = () => {}, onMessage = () => {} }) {
  let socket, closed = false, retry = 0, timer, renewal, pending;
  const members = new Map();

  const retire = () => {
    clearTimeout(renewal);
    const previous = socket;
    socket = undefined;
    if (!previous) return;
    previous.onmessage = previous.onclose = previous.onerror = null;
    try { previous.close(1000, 'Renewing authorization'); } catch { /* already gone */ }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (closed) return;
    const delay = Math.min(30_000, 700 * 2 ** Math.min(retry++, 5)) * (0.5 + Math.random());
    timer = setTimeout(open, delay);
  };

  async function open() {
    if (closed || pending) return;
    onStatus('connecting');
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('/api/realtime/ticket', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room }), signal: controller.signal,
      });
      if (closed) return;
      if (response.status === 401 || response.status === 403) { closed = true; onStatus('unauthorized'); return; }
      if (!response.ok) throw new Error('Ticket request failed.');
      const ticket = await response.json();
      if (closed) return;
      const connection = new WebSocket(ticket.websocketUrl);
      socket = connection;
      connection.onmessage = ({ data }) => {
        if (closed || socket !== connection) return;
        let message;
        try { message = JSON.parse(data); } catch { return; }
        if (message.type === 'ready') {
          retry = 0;
          members.clear();
          const expiresInMs = Number.isFinite(message.expiresInMs) ? Math.max(1_000, Math.min(300_000, message.expiresInMs)) : 300_000;
          clearTimeout(renewal);
          renewal = setTimeout(() => { if (!closed && socket === connection) { retire(); open(); } }, Math.max(250, expiresInMs - 1_000));
          onStatus('connected');
        }
        if (message.type === 'presence') {
          members.clear();
          for (const member of message.members) members.set(member.connectionId, member);
        }
        if (message.type === 'presence_update') {
          members.set(message.member.connectionId, message.member);
          onMessage({ type: 'presence', members: [...members.values()] });
          return;
        }
        onMessage(message);
      };
      connection.onclose = connection.onerror = () => {
        if (closed || socket !== connection) return;
        retire();
        onStatus('disconnected');
        schedule();
      };
    } catch {
      if (!closed) { onStatus('disconnected'); schedule(); }
    } finally {
      clearTimeout(timeout);
      if (pending === controller) pending = undefined;
    }
  }

  open();
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      clearTimeout(renewal);
      pending?.abort();
      retire();
      onStatus('closed');
    },
  };
}

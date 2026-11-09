// A stand-in for Supabase Realtime: the Phoenix channel protocol over a real WebSocket (RFC 6455, written out here
// because the sandbox has no ws package). It accepts joins, answers heartbeats, takes token refreshes, and pushes
// postgres_changes INSERT events to whoever joined with a matching filter. Tests use it to prove the hub's client
// speaks the protocol, and to give the live browser test a Realtime path it can break and heal on purpose.
const http = require('node:http');
const crypto = require('node:crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function readFrame(buf) {
  if (buf.length < 2) return null;
  const op = buf[0] & 0x0f;
  let len = buf[1] & 0x7f, at = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); at = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); at = 10; }
  const masked = (buf[1] & 0x80) !== 0;
  if (buf.length < at + (masked ? 4 : 0) + len) return null;
  let payload = buf.subarray(at + (masked ? 4 : 0), at + (masked ? 4 : 0) + len);
  if (masked) {
    const mask = buf.subarray(at, at + 4);
    payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
  }
  return { op, payload, text: payload.toString('utf8'), used: at + (masked ? 4 : 0) + len };
}
function frame(op, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  let head;
  if (body.length < 126) head = Buffer.from([0x80 | op, body.length]);
  else if (body.length < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(body.length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(body.length), 2); }
  return Buffer.concat([head, body]);
}

async function createMockRealtime() {
  const clients = new Set();
  const state = { joins: [], heartbeats: 0, tokens: [], leaves: 0, refuse: false, silent: false, connections: 0, urls: [] };
  const server = http.createServer((req, res) => { res.statusCode = 426; res.end('upgrade required'); });
  const send = (client, message) => { try { client.socket.write(frame(1, JSON.stringify(message))); } catch (error) { /* gone */ } };

  function handle(client, text) {
    let m;
    try { m = JSON.parse(text); } catch (error) { return; }
    if (m.event === 'phx_join') {
      state.joins.push({ topic: m.topic, payload: m.payload, ref: m.ref, join_ref: m.join_ref });
      if (state.refuse) { send(client, { topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'error', response: { reason: 'refused' } } }); return; }
      client.topic = m.topic;
      client.changes = (m.payload && m.payload.config && m.payload.config.postgres_changes) || [];
      send(client, { topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: { postgres_changes: client.changes.map((c, i) => Object.assign({ id: i + 1 }, c)) } } });
      send(client, { topic: m.topic, event: 'system', ref: null, payload: { status: 'ok', message: 'Subscribed to PostgreSQL', channel: m.topic, extension: 'postgres_changes' } });
    } else if (m.event === 'heartbeat') {
      state.heartbeats += 1;
      if (!state.silent) send(client, { topic: 'phoenix', event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } });
    } else if (m.event === 'access_token') {
      state.tokens.push(m.payload && m.payload.access_token);
    } else if (m.event === 'phx_leave') {
      state.leaves += 1;
      client.topic = null;
      send(client, { topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } });
    }
  }

  server.on('upgrade', (req, socket) => {
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const client = { socket, topic: null, changes: [], url: req.url };
    clients.add(client);
    state.connections += 1;
    state.urls.push(req.url);
    let buf = Buffer.alloc(0);
    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const f = readFrame(buf);
        if (!f) break;
        buf = buf.subarray(f.used);
        if (f.op === 8) { try { socket.end(frame(8, Buffer.alloc(0))); } catch (error) { /* gone */ } }
        else if (f.op === 9) socket.write(frame(10, f.payload));
        else if (f.op === 1) handle(client, f.text);
      }
    });
    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  return {
    port, state,
    url: 'ws://127.0.0.1:' + port + '/realtime/v1/websocket?apikey=test&vsn=1.0.0',
    subscribers: () => [...clients].filter(c => c.topic).length,
    // A new row in a table: everyone whose filter matches it hears about it.
    push(record, table = 'actions') {
      let sent = 0;
      for (const client of clients) {
        if (!client.topic) continue;
        const wants = client.changes.some(c => c.table === table && (!c.filter || c.filter === 'game_id=eq.' + record.game_id));
        if (!wants) continue;
        send(client, { topic: client.topic, event: 'postgres_changes', ref: null,
          payload: { ids: client.changes.map((c, i) => i + 1), data: { schema: 'bored_live', table, commit_timestamp: new Date().toISOString(), type: 'INSERT', record, columns: [], errors: null } } });
        sent += 1;
      }
      return sent;
    },
    // The network drops: every socket dies without a goodbye.
    drop() { for (const client of [...clients]) { try { client.socket.destroy(); } catch (error) { /* gone */ } } clients.clear(); },
    async close() { for (const client of clients) { try { client.socket.destroy(); } catch (error) { /* gone */ } } clients.clear(); await new Promise(done => server.close(done)); }
  };
}

module.exports = { createMockRealtime };

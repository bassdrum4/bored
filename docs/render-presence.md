# Render presence deployment

This service owns only the online roster. GitHub Pages still hosts games and Supabase
still owns account/profile data and persistent account privacy preferences.

1. In Render, choose **New → Blueprint**, connect the GitHub repository
   `bassdrum4/bored`, choose branch `main`, and apply the root `render.yaml`.
   It creates one free web service called `bored-presence` with root `server`.
   No paid database, disks or secret service-role key are required.
2. Wait for the deployment to become Live. Copy the actual HTTPS URL from the
   service dashboard (do not guess the hostname). Open `<that URL>/health`
   and check that it returns `{"ok":true,"service":"bored-presence","version":1}`.
3. Set `PRESENCE_ORIGIN` in `src/hub/presence-endpoint.js` to that exact origin
   (e.g. `https://your-service.onrender.com`); commit to main. The Pages
   deployment picks it up. Never point it at a service you don't control:
   the service receives Supabase access tokens over TLS to verify named accounts.
4. Verify the roster in two browsers (guest and signed-in), opt-out on both,
   and disconnect/reconnect. Check Render logs and metrics before calling the
   migration complete. No Supabase Realtime fallback is used; an unreachable
   service does not stop Bored from loading or playing games.

If creating a Web Service manually instead of a Blueprint:
- Root Directory: `server`, runtime: Node, instance: Free.
- Build: `npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm test`.
- Start: `npm start`, health check: `/health`.
- Node 22, Supabase URL/publishable key as in `render.yaml`. No service-role key.
- Automatic deploys only when files under `server/` change.

## HTTP event transport

New clients use POST /presence/events with an authenticated fetch SSE stream first.
JWTs are sent only in the HTTPS request body, never in URLs. An initial snapshot
contains aggregate counts, and names only for a signed-in user with the dropdown
open. Count/roster changes are batched by the shared five-second dispatcher.
SSE keepalives are sent every 25 seconds; streams renew at most every 12 minutes
(or before token expiry). If the initial stream or subsequent streaming fails,
the page switches to long polling: one request held for up to 25 seconds, returned
early on a changed snapshot. No WebSocket attempts from new clients.

The same in-memory roster deduplicates accounts and guest browser IDs across
transports. A per-tab session identifies a connection; abandoned sessions expire
after approximately 90–95 seconds. Explicit leave is best effort on page exit.
Account verification is cached for at most 18 minutes and never past JWT expiry.
An account opt-out persists in Supabase and invalidates live Render sessions;
if delivery fails, periodic verification provides a fallback. No guest database
traffic or per-event writes. The old /ws and /presence endpoints remain for
cached clients during rollout; no changes to game realtime or Bored Together.

Tests: npm test in server/ includes HTTP transport tests with a local HTTP server.
Validate SSE and fallback on the embedded school network, and check Render
bandwidth and Supabase RPC traffic before extending this protocol to chat.

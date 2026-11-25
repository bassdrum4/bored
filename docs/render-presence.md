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

## Efficiency and limits

One socket per participating tab, with unique guest browser IDs and account IDs
deduplicated in RAM. Only small count frames are broadcast, at most once every
five seconds and only when counts change. A named roster is sent exclusively to
signed-in sockets with the dropdown open; it is not sent to guests. One shared
30-second liveness sweep plus a one-byte client message every 60 seconds.
No disk, per-event database writes, guest authentication or roster RPC polling.
Signed-in clients read the preference on entry and the server validates their
identity on join and approximately every 18 minutes. Concurrent validations for
the same token are coalesced and results cached for 60 seconds. The server
limits sockets to 1,000 and 250 per source IP, bounds incoming frames and
authentication concurrency, and drops slow consumers. These are protective
caps, not measured Render performance guarantees. Guest counts are approximate
and can be inflated by deliberately fabricated browser IDs.

Free instances sleep after inactivity; no artificial uptime pings. The hub
backs off with jitter and never blocks game loading. Ordinary game pushes do
not restart the service. Restarting loses the ephemeral roster; browsers reconnect.

The former Supabase channel/policies are retained for rollback and cached
clients, but the new page no longer opens them. After checking the live
Render service, disable the old presence channels if no legacy clients remain;
do not touch Bored Together's realtime transport or persistent privacy settings.

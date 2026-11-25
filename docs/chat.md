# Bored global chat

Chat is a single, public, text-only room. Guests can read, verified accounts can send. No ordinary messages are stored in Supabase. Render keeps up to 200 messages for at most 24 hours, and reconnects retrieve at most 50 messages. Restarting the server clears history. Chat subscribes only when the panel is open; it uses its own on-demand SSE/long-poll request on the existing Render service so opting out of presence does not opt a user out of chat. No WebSockets, typing indicators, notifications or media uploads.

## Deploy and enable

1. Apply `scripts/site-chat.sql` to the Bored Supabase project if the migration is not already applied.
2. In the existing bored-presence Render service, add secret environment variables `OPENAI_API_KEY` (prefer a restricted project key with permission for the moderation endpoint only) and `SUPABASE_SECRET_KEY` (modern `sb_secret_...` key; create a dedicated `bored-render` secret in Supabase Settings → API Keys). Never put these values in GitHub or the browser. The secret credential is privileged; restrict access to Render's environment. Chat cannot function without both. Remove any obsolete `SUPABASE_SERVICE_ROLE_KEY` environment variable after migrating this service. The backend sends the new secret only in the `apikey` header; signed-in user JWTs still use their separate bearer authentication.
3. Redeploy. In Bored, sign in with an existing analytics administrator account, open Chat, and choose Enable chat. It defaults to disabled in the database. Test with a separate signed-in account before public rollout.
4. Verify school-network SSE and long-poll fallback; verify reports and the kill switch. OpenAI's moderation endpoint uses `omni-moderation-latest` and is free, subject to account rate limits. API failures, rejected moderation results and missing credentials prevent sending. No text generation endpoint is used.

## Moderation and privacy

Only message text is submitted to OpenAI. Local checks block common profanity, links and contact details; they are imperfect. Users should not share personal information. The UI discloses automated moderation. There are report, local block, reply, admin deletion, 10-minute mute and 24-hour ban controls. A report saves the server's canonical message snapshot, not arbitrary client text. Reports are available to authorized administrators for 30 days; expired report records are deleted on the next report. The admin check uses the existing `my_analytics_access` RPC. State and bans are cached for up to one minute, and normal messages do not create database rows. All public database access to the chat moderation tables is denied.

Before enabling for a school audience, confirm applicable school rules and consent/privacy requirements and establish a human moderation procedure. AI moderation is not a substitute for human review.

# Civ Lite saves in your Bored account (5.3)

Signed in to Bored, the saves you make in Civ Lite follow your account: save on one device, **Continue** or **Load**
on another. Signed out, or with Civ Lite open on its own, nothing changes: saves stay on the device.

## What goes where

| Save | Where |
| --- | --- |
| Named saves (8 slots) | The device at once, the account at once |
| Autosave | The device on every move, the account at most once a minute and when you leave |
| Turn autosaves (the three rolling ones) | The device only |

Only the player's own saves are stored, only in their own account, and nothing is shared with anyone. A device does not
keep an account save until you load it there (or make one there). Signing out leaves the device's own slots as they were.

## The pieces

- **Server** (`supabase/migrations/20261109210000_civ_lite_cloud_saves.sql`): `public.game_saves`
  `(user_id, game, slot, header, data, bytes, version, updated_at)`, primary key `(user_id, game, slot)`. The table can
  be read by its owner (not by anonymous sessions) and **cannot be written to directly**: `save_put`, `save_delete`
  (and `save_list`, `save_get` for reading) are the only way in. All are `security definer` with `search_path ''`, granted
  to `authenticated` only, and rate limited with `bored_together.rate_limit` (60 calls and 20 writes a minute).
  Limits are also table checks: `game = 'ashcrown'`, slot one of `m1`..`m8` or `auto` (so at most 9 rows per player),
  data at most 2 MB, header at most 4 KB.
- **Versions.** Each row has a version (1 on creation). `save_put` and `save_delete` take the version the caller last
  saw (`0` for "nothing yet"). If it is not the stored one nothing changes and the call fails with HTTP 409 (SQLSTATE
  `PT409`); its `details` hold the stored version, header and time, so the game can say which copy is newer.
- **Hub bridge** (`src/hub/saves-bridge.js`): offered to Civ Lite whenever it is open in Bored's player (not in a live
  or turn-based match) as `window.__boredSaves = { call(op, payload), on(fn) }`, injected before the game's script on a
  channel only that document knows. The hub answers only the game's own window on that channel, only while the same
  account is signed in, and calls the save functions itself with the player's session, so **no token, email or account
  id reaches the page**. The game gets an opaque account reference to key its own notes. Operations: `status`, `list`,
  `get`, `put`, `delete`. Saves go up as `gz:` + base64 of gzip (`CompressionStream`), or `plain:` + text where the
  browser can not compress.
- **Game** (`src/games/content/ashcrown.html`, the `SYNC` block): per account it keeps a note for each slot in
  `localStorage['bored.civlite.sync.v1']`, the version of the account's copy it last saw and the time of the device
  copy that matched it. A device copy whose time differs from its note has not been uploaded yet. Failed uploads retry
  with backoff (5, 15, 45, 120, 300 s) and never block play; coming back online retries at once. Leaving
  (Back to Bored, the tab closing or going to the background) sends what is waiting.

## What the player sees

A small cloud mark on a Save, Load or Continue row means the save is in the account. **On this device only** means it
has not been uploaded (yet, or it failed). **Saved on another device · 2 hours ago** marks a save made elsewhere.
**Continue** takes the newer of this device's autosave and the account's and says which it is.

Nothing is replaced without asking. If a slot's account copy is newer than what this device last saw, saving over it asks
"This slot was saved on another device 2 hours ago. Replace it?", and deleting asks the same way. The one slot that is
not asked about is the rolling autosave: whichever game was played last takes it. (Leaving a page re-saves the game on
screen, but only when it changed, so a tab left open for hours never takes the autosave from the device in use.)

A guest with saves who signs in: the device's saves go into the account's empty slots. If a slot holds a different save on
each side, the device's save moves into a free slot as "<name> (this device)"; with every slot taken the player is
asked which to keep (**Decide later** changes nothing and asks again next time).

## Installing

Apply `supabase/migrations/20261109210000_civ_lite_cloud_saves.sql` once, in the Supabase SQL editor for the project, the
way the other forward migrations are applied. It needs the Bored Together migrations that are already there (it uses
`bored_together.rate_limit`). It creates the table, the `bored_saves` helper schema and the four functions, and changes
nothing that exists. Deploy the SQL before the frontend; until it is applied, the game keeps its saves on the device and
the rows say "On this device only".

## Tests

`tests/game-saves.test.cjs` (the SQL, on PGlite and on native PostgreSQL when `BT_TEST_DATABASE_URL` names a disposable
server), `tests/saves-bridge.test.cjs` (the bridge without a browser) and `tests/saves-browser.test.cjs` (several browsers
as one account, the real SQL behind Supabase's REST path).

# Failures

What broke, why, and what the next agent should do instead. Append a new entry
whenever a check, deploy or environment fails; keep symptoms exact (error text,
file, commit) so they can be searched for.

Current verified state (2026-11-24, commit `01ce711`): CI green on `main`,
GitHub Pages serving that commit, announcement poll/question migration applied
to the Supabase project.

---

## 2026-11-24 — Announcement polls: one feature, five CI failures

The poll/question work first landed as `a4d9e7d`. Its CI run `45291236352`
failed in two jobs (`test` and `together-postgres`), which in turn kept the
deploy on the previous commit. All five failures below were fixed in `01ce711`.

### 1. Fresh databases had no announcements tables

**Symptom** — CI `test` failed in the Together SQL tests and the
`together-postgres` job with:

```
error: relation "public.announcements" does not exist
code: '42P01'
```

It surfaced while applying `supabase/migrations/20261123213000_announcement_polls.sql`.

**Cause** — The announcements feature was originally created only by hand from
`scripts/announcements.sql`. No migration file ever created
`public.announcements` or `public.announcement_reads`. Every disposable test
database is built from `supabase/migrations/*.sql`, so the new `alter table`
ran against nothing.

**Fix** — `supabase/migrations/20261123212000_announcements.sql` now carries the
original base schema ahead of the poll migration, with idempotent
`create table if not exists` / `drop policy if exists` guards so it is harmless
on the live project where the tables already exist.

**Rule for next time** — `supabase/migrations/` is the schema of record for
tests, not `scripts/*.sql`. Any hand-applied schema that later migrations or
the hub depend on needs a migration file. Test harnesses apply every
`supabase/migrations/*.sql` in filename order (see
`tests/together-db.cjs`, `tests/together-postgres.test.cjs`,
`tests/together-live-env.cjs`), skipping only
`engagement_and_retention_analytics` and `bored_analytics_funnels_rollups`.

### 2. The base migration had no analytics admin helper

**Symptom** — After adding the base migration, the same tests failed with:

```
error: function public.is_analytics_admin() does not exist
code: '42883'
```

**Cause** — The disposable database deliberately skips the analytics
migrations, and those define `public.is_analytics_admin()`. The announcement
RLS policies and the `announcement_results` SQL function call it.

**Fix** — The base migration now has a guarded `do $analytics$ …` block that
creates a stand-in only when `to_regprocedure('public.is_analytics_admin()')`
is null. The stand-in returns `false` when `public.analytics_admins` is absent
and otherwise checks it. It never replaces the real function on a project that
has it.

**Rule for next time** — RLS policies and `language sql` function bodies are
parsed when created, so a missing helper breaks the whole migration chain.
Guard test-only dependencies the way `20261118130000_unified_feedback.sql`
does (`if to_regprocedure(...) is not null then execute …`), or provide a
guarded stand-in like this one.

### 3. Signed-in browser mocks rejected the new responses request

**Symptom** — CI `test`:

```
not ok 84 - account UI and score sync still work through the redesigned hub (mock backend)
  Expected values to be strictly deep-equal:
  + [ 'GET /rest/v1/announcement_responses', 'GET /rest/v1/announcement_responses' ]
  - []
```

and the same list of unexpected requests in
`two embedded browser accounts …` (`tests/together-browser.test.cjs`).

**Cause** — The player UI now requests the account's own announcement answers
whenever someone is signed in. Test harnesses mock Supabase per path and push
anything unlisted into an `unexpected` array that must stay empty.

**Fix** — Added `/rest/v1/announcement_responses` to the allowlists in:
`tests/discovery.test.cjs`, `tests/together-browser.test.cjs`,
`tests/saves-browser.test.cjs`, `tests/live-browser.test.cjs`,
`tests/telemetry-isolation.cjs`.

**Rule for next time** — When the hub starts calling a new Supabase path, grep
the tests for an existing announcement path and add it everywhere:

```bash
rg "/rest/v1/announcement" tests
```

`discovery.test.cjs` has a path-specific mock; the other four share a list.
Missing the saves/live harnesses is easy because they are not announcement
tests.

### 4. A failed CI run looks like a stuck deploy

**Symptom** — `https://bassdrum4.github.io/bored/version.json` stayed on the
previous commit for ~7 minutes after a push.

**Cause** — The deploy workflow had not run because the CI workflow for that
commit failed first. Waiting on `version.json` hides this; the real signal is
the check run for the pushed SHA.

**Fix / next time** — Check the commit's check runs first, then wait for the
deploy stamp. Anonymous GitHub API polling is easily rate-limited; use the
connected GitHub app or the Actions page. A green `test` / `together-postgres`
plus a successful `deploy` means the publish landed.

### 5. Push rejected after `main` moved

**Symptom** —

```
! [rejected] HEAD -> main (fetch first)
```

**Cause** — The changelog bot (`chore(changelog): sync entries from main history
[skip ci]`) commits to `main`. Our branch was one commit behind.

**Fix** — Fetch, rebase the local commits on `FETCH_HEAD`, push again. Never
force-push and never discard the bot's changelog commit.

**Also** — The remote answers a direct push with:

```
Bypassed rule violations for refs/heads/main:
- Changes must be made through a pull request.
```

The push still succeeded, and this repo's `AGENTS.md` explicitly says pushes to
`main` are the deploy path. Do not "fix" this by force-pushing; if the rule
starts blocking, stop and ask rather than widening permissions.

---

## 2026-11-23 — Running the browser suite in a cloud workspace

These are environment failures, not app bugs. The giveaway is that they happen
before any test assertion.

### B1. `Cannot find module 'puppeteer-core'`

`npm ci` had not been run. Reading source and `node --check` work without
dependencies, but `node --test tests/*.test.cjs` does not.

### B2. Chrome missing shared libraries

Installing `chrome-headless-shell` alone fails with:

```
error while loading shared libraries: libnspr4.so: cannot open shared object file
```

There is no root/sudo. Download the `.deb`s and extract them locally instead of
installing system-wide. `apt-get` works non-root only with private state/cache
directories:

```bash
mkdir -p /tmp/buffy-browser/apt/lists/partial /tmp/buffy-browser/apt/cache/archives/partial
apt-get -o Dir::State::lists=/tmp/buffy-browser/apt/lists \
        -o Dir::Cache=/tmp/buffy-browser/apt/cache \
        -o Debug::NoLocking=1 update

# NOTE: `apt-get download` writes into the CURRENT DIRECTORY. Run it from /tmp.
cd /tmp
apt-get -o Dir::State::lists=/tmp/buffy-browser/apt/lists \
        -o Dir::Cache=/tmp/buffy-browser/apt/cache \
        -o Debug::NoLocking=1 install --download-only -y --no-install-recommends \
        libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libasound2t64 libxkbcommon0
apt-get -o Dir::State::lists=/tmp/buffy-browser/apt/lists \
        -o Dir::Cache=/tmp/buffy-browser/apt/cache \
        -o Debug::NoLocking=1 download fonts-dejavu-core

mkdir -p /tmp/buffy-browser/sysroot
for f in /tmp/buffy-browser/apt/cache/archives/*.deb; do
  dpkg-deb -x "$f" /tmp/buffy-browser/sysroot
done
```

**Stray file warning** — Running `apt-get download` from the repo root left a
`fonts-dejavu-core*.deb` in the workspace. It had to be moved out before
committing. Always download in `/tmp`.

### B3. `Navigating frame was detached` is usually a renderer crash

The test fails at `page.goto` with:

```
Error: Navigating frame was detached
```

and the navigation trace shows `index.html` followed by `about:blank`. This is
not the app redirecting; the renderer crashed. Relaunch with `dumpio: true` to
see the real cause. Here it was:

```
Fontconfig error: Cannot load default config file: File not found
FATAL:third_party/skia/src/ports/SkFontMgr_FontConfigInterface.cpp:163 Not implemented.
```

The container has no `/etc/fonts` and no fonts. Provide both a config and at
least one font (the DejaVu `.deb` above), pointing `dir` at the extracted TTF
directory:

```bash
mkdir -p /tmp/buffy-browser/fonts/files /tmp/buffy-browser/fonts-cache
# extract the font .deb into fonts/files, then:
cat > /tmp/buffy-browser/fonts.conf <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/tmp/buffy-browser/fonts/files/usr/share/fonts/truetype/dejavu</dir>
  <cachedir>/tmp/buffy-browser/fonts-cache</cachedir>
</fontconfig>
EOF
```

### B4. Bridge the sandbox flags without editing tests

Tests call `puppeteer.launch({ executablePath, headless: true })` with no args.
Point `CHROME_PATH` at a wrapper that adds the container-safe flags:

```bash
CHROME_BIN=$(find /tmp/buffy-browser -name chrome-headless-shell -type f | head -1)
cat > /tmp/buffy-browser/chrome <<EOF
#!/bin/sh
exec "$CHROME_BIN" --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu "\$@"
EOF
chmod +x /tmp/buffy-browser/chrome
```

Then run tests with:

```bash
export LD_LIBRARY_PATH=/tmp/buffy-browser/sysroot/usr/lib/x86_64-linux-gnu
export FONTCONFIG_FILE=/tmp/buffy-browser/fonts.conf
export FONTCONFIG_PATH=/tmp/buffy-browser
export CHROME_PATH=/tmp/buffy-browser/chrome
node --test tests/announcements.test.cjs
```

`/tmp` is not archived. Re-run the setup after a restore.

### B5. Running only the static tests

`node --test --test-name-pattern="composer" tests/announcements.test.cjs` skips
the browser test but still `require`s `puppeteer-core`, so `npm ci` is required
first. Use name patterns to avoid launching Chrome, not to avoid installing it.

---

## Known gaps / unverified behaviour

- **Admin composer was never exercised with a real analytics-admin login.**
  The player vote/answer flow has a browser test; the admin form's fields and
  response rendering are only covered by the static contract test in
  `tests/announcements.test.cjs`. If you touch
  `src/hub/announcement-admin.js`, sign in as an analytics admin and publish a
  poll and a question end to end.
- The new RLS policies and RPCs were verified against the live project in a
  rolled-back SQL transaction (vote change replaces the old row, invalid choice
  is rejected, answers stored). They were not exercised through a real
  signed-in browser against production.

---

## Copy-paste checks for the announcement feature

```bash
# focused browser + contract suite (needs the environment above)
node --test tests/announcements.test.cjs

# mock-backend hub test that pins the Supabase request list
node --test --test-name-pattern="account UI and score sync" tests/discovery.test.cjs

# fresh disposable database: applies every supabase/migrations file in order
node --test --test-name-pattern="Together production SQL" tests/bored-together.test.cjs
node --test --test-name-pattern="pool endpoint and SQL" tests/together-pool.test.cjs

# deployed state
curl -fsS https://bassdrum4.github.io/bored/version.json
```

If a migration change lands, run the fresh-database checks above before
pushing. A green local unit test does not prove the migration chain applies.

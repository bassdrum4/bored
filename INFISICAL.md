# Secrets with Infisical

Secrets manager in use: none

`src/` is the arcade and is deployed as-is; the GitHub Actions workflow publishes
that folder straight to GitHub Pages, with no build step. The app reads no runtime
environment variables, so nothing in it has to change for Infisical: the local
dev server can run under `infisical run`, which injects the `dev` environment's
secrets into the process. The Supabase URL and publishable key are constants near the top of
`src/main.js` (the publishable key is safe in a public page); if that
configuration ever moves to secrets, the server can expose them without touching
the games.

## Commands

| Purpose | Command |
| --- | --- |
| Local development (plain) | `npm run dev` → `vite` |
| Local development (secrets injected) | `npm run dev:infisical` → `infisical run --env=dev -- vite` |
| Production | push to `main`; the workflow deploys `src/` (Pages source: GitHub Actions) |
| Play without the network | `npm run dev`, then open http://localhost:3000 |
| Tests (unit rules offline; browser block needs Chrome) | `node --test tests/bored.test.cjs` |
| Release screenshots (needs internet) | `node --test tests/visual.test.cjs` |

`npm run dev` serves the site from `src/` at `http://localhost:3000`, the same
addresses the deployed site uses.
Production is that static folder published to GitHub Pages; there is no `start`
script, pm2 process, Procfile or Dockerfile to wrap.

## Variables

The hub itself reads no environment variables. The test suite reads the optional
`CHROME_PATH` to find a Chrome/Chromium binary; that variable is non-secret and
does not have to be in Infisical for the site to run.

The Supabase client settings baked into `src/main.js` are named `SUPABASE_URL` and
`SUPABASE_ANON_KEY`; the key there is the publishable (public) key, not a secret.
No service-role or secret key belongs in this static page.

## Finish setup

Run these in this folder, one command per line:

1. Create a project for this site at <https://app.infisical.com> — Development,
   Staging and Production are created with it.
2. Install the CLI: `npm install -g @infisical/cli`
   (macOS: `brew install infisical/get-cli/infisical`;
   Windows: `scoop bucket add org https://github.com/Infisical/scoop-infisical.git`
   then `scoop install infisical`).
3. `infisical login` — without a browser (WSL 2, Codespaces, SSH) use
   `infisical login -i`.
4. `infisical init` — run it in this folder. It writes `.infisical.json` with the
   project id; it holds no secrets and is safe to commit.
5. Import the `.env`: open the project's **Secrets Overview** page in Infisical,
   choose the **dev** environment, and drag the `.env` file onto the page to add
   every key at once. This repo has no runtime variables today, so there may be
   nothing to import; `.env.example` lists what the project does read.
6. Start the app through Infisical: `npm run dev:infisical`
7. Move `.env` out of this repository folder (for example to your home folder —
   do not rename it to a backup inside the repo, because git would not ignore
   it), then restart `npm run dev:infisical` to prove the values come from Infisical.

For CI or a deployed environment, create a machine identity with Universal Auth
and set `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID` and
`INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET` in that platform's secret store; do not
use the interactive dev CLI login there.

Any secret that was ever committed to git stays in history and must be rotated at
its source. Run `infisical scan` to look for leaked values before publishing.

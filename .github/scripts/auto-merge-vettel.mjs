// A trusted default-branch workflow invokes this after Check Bored CI completes.
// Never check out or execute PR code in this script's privileged workflow.
import fs from 'node:fs';

const VETTEL_ACCOUNT_IDS = new Set([188396997, 307236910]); // PenguinV360, penguinv360-jpg
const allowedExact = new Set([
  'src/games/content/ashcrown.html', // Civ Lite's actual slug
  'src/games/content/pokedoku.html',
  'src/games/content/poke-idle.html',
  'src/games/previews/ashcrown.webp',
  'src/games/previews/pokedoku.svg',
  'src/games/previews/poke-idle.svg',
  'tests/ashcrown-browser.test.cjs',
  'tests/pokedoku.test.cjs',
  'tests/poke-idle.test.cjs',
]);
const allowedSprite = /^src\/games\/content\/pokedoku\/sprites\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|webp|jpg|jpeg|gif)$/;

export function isAllowedGameFile(filename) {
  return allowedExact.has(filename) || allowedSprite.test(filename);
}

const log = message => console.log(message);
const note = message => log(`::notice::${message}`);
const warn = message => log(`::warning::${message}`);
const repo = process.env.GITHUB_REPOSITORY;
const readToken = process.env.GITHUB_TOKEN;
const mergeToken = process.env.BORED_AUTOMERGE_TOKEN;
const eventFile = process.env.GITHUB_EVENT_PATH;

async function api(path, token, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}: ${payload.message || 'Unknown error'}`);
  return { payload, response };
}

async function changedFiles(number) {
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const { payload } = await api(`pulls/${number}/files?per_page=100&page=${page}`, readToken);
    if (!Array.isArray(payload)) throw new Error('Unexpected changed-files response');
    files.push(...payload);
    if (payload.length < 100) return files;
  }
  throw new Error('PR too large to classify safely');
}

export async function run() {
  if (!repo || !readToken || !eventFile) throw new Error('Missing Actions event or read token');
  if (repo !== 'bassdrum4/bored') throw new Error('This workflow only operates in bassdrum4/bored');
  const event = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  const ci = event.workflow_run;
  if (ci?.name !== 'Check Bored' || ci.event !== 'pull_request' || !['success', 'failure'].includes(ci.conclusion)) {
    note('Not a completed pull-request Check Bored run; nothing to merge.');
    return;
  }
  // GitHub sometimes reports an empty workflow_run.pull_requests array even
  // for a same-repository PR. Resolve the exact current head SHA instead.
  const candidates = new Set((ci.pull_requests || []).map(pr => pr.number).filter(Number.isInteger));
  if (candidates.size === 0) {
    for (let page = 1; page <= 5; page++) {
      const { payload: prs } = await api(`pulls?state=open&per_page=100&page=${page}`, readToken);
      if (!Array.isArray(prs)) throw new Error('Unexpected open-PR response');
      for (const pr of prs) {
        if (pr.head?.sha === ci.head_sha && pr.head?.repo?.full_name === repo) candidates.add(pr.number);
      }
      if (prs.length < 100) break;
    }
  }
  if (candidates.size === 0) {
    note('No open PR matches the completed CI run head. Nothing to merge.');
    return;
  }
  for (const number of candidates) {
    const { payload: pr } = await api(`pulls/${number}`, readToken);
    if (pr.state !== 'open' || pr.draft || pr.base?.ref !== 'main' ||
        pr.head?.repo?.full_name !== repo || pr.base?.repo?.full_name !== repo ||
        !VETTEL_ACCOUNT_IDS.has(pr.user?.id) ||
        !VETTEL_ACCOUNT_IDS.has(ci.actor?.id) ||
        !ci.head_sha || ci.head_sha !== pr.head?.sha) {
      note(`PR #${number}: not an eligible, current Vettel game-only update.`);
      continue;
    }
    const files = await changedFiles(number);
    const disallowed = files.filter(f =>
      f.status === 'removed' || f.status === 'renamed' ||
      !isAllowedGameFile(f.filename) ||
      (f.previous_filename && !isAllowedGameFile(f.previous_filename)));
    if (!files.length || disallowed.length) {
      note(`PR #${number}: manual review required (${disallowed.slice(0, 5).map(f => f.filename).join(', ') || 'no changes'}${disallowed.length > 5 ? ', …' : ''}).`);
      continue;
    }
    // Require the normal browser/logic suite for every auto-merge. Civ Lite
    // additionally depends on the multiplayer/PostgreSQL suite; Pokédoku and
    // Poké Idle do not, so an unrelated multiplayer flake must not block them.
    const { payload: jobList } = await api(`actions/runs/${ci.id}/jobs?per_page=100`, readToken);
    const jobs = jobList.jobs || [];
    const jobPassed = name => jobs.some(job => job.name === name && job.conclusion === 'success');
    const touchesCivLite = files.some(f => f.filename === 'src/games/content/ashcrown.html' ||
      f.filename === 'src/games/previews/ashcrown.webp' ||
      f.filename === 'tests/ashcrown-browser.test.cjs');
    if (!jobPassed('test') || (touchesCivLite && !jobPassed('together-postgres'))) {
      note(`PR #${number}: relevant CI tests have not passed. Manual review required.`);
      continue;
    }
    if (!mergeToken) {
      warn(`PR #${number} eligible, but BORED_AUTOMERGE_TOKEN secret is not configured. Manual review still applies.`);
      continue;
    }
    // The bypass-capable owner's token is ONLY used for this one, SHA-locked merge.
    // GitHub refuses if the PR head changes after classification or CI.
    const { payload: result } = await api(`pulls/${number}/merge`, mergeToken, 'PUT', {
      sha: pr.head.sha,
      merge_method: 'squash',
    });
    if (result.merged !== true) throw new Error(`PR #${number} was not merged: ${result.message || 'Unknown reason'}`);
    note(`Automatically merged vetted game-only PR #${number} after the relevant Check Bored jobs passed.`);
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}

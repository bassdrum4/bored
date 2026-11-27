import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Only independent game documents/tests and narrowly scoped artwork qualify.
// Shared code, catalog, CI, SQL, renames, unknown paths and failed detection
// fall back to the full suite. No contributor identities are used for CI scope.
const groups = {
  'poke-idle': [/^src\/games\/content\/poke-idle\.html$/, /^tests\/poke-idle\.test\.cjs$/, /^src\/games\/previews\/poke-idle\.svg$/, /^src\/games\/content\/pokedoku\/sprites\/thaw-[a-z0-9-]+\.png$/],
  'relic-song': [/^src\/games\/content\/relic-song\.html$/, /^tests\/relic-song\.test\.cjs$/, /^src\/games\/previews\/relic-song\.svg$/, /^docs\/relic-song-[^/]+\.md$/],
  'shotgun-roulette': [/^src\/games\/content\/shotgun-roulette\.html$/, /^tests\/shotgun-roulette\.test\.cjs$/, /^src\/games\/previews\/shotgun-roulette\.svg$/],
};
export function classify(paths) {
  const games = new Set();
  if (!paths.length) return { full: true, games: [] };
  for (const file of paths) {
    const game = Object.keys(groups).find(g => groups[g].some(p => p.test(file)));
    if (!game) return { full: true, games: [] };
    games.add(game);
  }
  return { full: false, games: [...games].sort() };
}
export function detect(env = process.env) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request' || !/^[a-f0-9]{40}$/.test(env.CI_BASE_SHA || '')) return { full: true, games: [] };
  try {
    // GitHub checks out a synthetic merge commit. Compare that exact tree to
    // its first parent, not a potentially stale PR head or a moving main.
    const parent = execFileSync('git', ['rev-parse', 'HEAD^1'], { encoding: 'utf8' }).trim();
    if (parent !== env.CI_BASE_SHA) return { full: true, games: [] };
    const diff = execFileSync('git', ['diff', '--name-status', '-z', '--no-renames', parent, 'HEAD'], { encoding: 'utf8' }).split('\0');
    diff.pop();
    const paths = [];
    for (let i = 0; i < diff.length; i += 2) {
      if (!['A', 'M'].includes(diff[i]) || !diff[i+1]) return { full: true, games: [] };
      paths.push(diff[i+1]);
    }
    return classify(paths);
  } catch { return { full: true, games: [] }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = detect();
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'full=' + result.full + '\ngames=' + result.games.join(' ') + '\n');
}

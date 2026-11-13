// A classroom set: Krillion's engine with prompts from a file you control.
//
// Open the game as games/content/krillion.html?set=<name> and the seven prompts
// come from sets/<name>.json beside this module instead of the daily dive.
// Everyone who opens the same URL gets the same prompts on any day, scoring runs
// here in the browser with the same matcher the daily dive uses, and nothing is
// posted: no account, no shared board, no streak, no server.
//
// The file is plain JSON:
//
//   { "title": "World War II · 1939–1945",
//     "prompts": [
//       { "text": "Name a country that fought in the Second World War.",
//         "answers": [
//           { "answer": "United States", "tier": "plankton",
//             "aliases": ["usa", "us", "america"] },
//           { "answer": "Mongolia", "tier": "krillion" }
//         ] } ] }
//
// Exactly seven prompts, two to twelve answers each. Tiers are editorial: choose
// what your class will shout first as plankton and the answer almost nobody will
// find as krillion. Leading articles, plurals, numbers and typos are handled the
// same way as in the daily dive; aliases are where you list alternate spellings.
import { createLocalRun } from './local-run.mjs';

const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;

async function loadFromSite(name) {
  const response = await fetch(new URL(`./sets/${name}.json`, import.meta.url), { cache: 'no-store' });
  if (response.status === 404) throw new Error(`There is no set called “${name}”.`);
  if (!response.ok) throw new Error(`The “${name}” set could not be loaded.`);
  return response.json();
}

// Returns the same (path, data) => body function the game uses for the daily
// dive, so the client does not need a second code path. `load` is only for tests.
export function createClassSet(name, load = loadFromSite) {
  if (!SLUG.test(String(name))) throw new Error('Set names are lowercase letters, numbers and dashes.');
  return createLocalRun({
    mode: 'set',
    idPrefix: 'set',
    fallbackTitle: `The “${name}” set`,
    load: () => load(name)
  });
}

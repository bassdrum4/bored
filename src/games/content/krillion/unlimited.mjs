// Unlimited: seven prompts drawn at random from the archive of past dives.
//
// The function picks the prompts (it keeps today's answer book to itself), the
// browser scores the answers with the daily dive's own matcher, and the run is
// stored under this browser's own key. No run row is written and nothing is
// posted to the board, so unlimited can be played as often as the player likes.
import { createLocalRun } from './local-run.mjs';

export const UNLIMITED_STORAGE_KEY = 'bored.krillion.unlimited';

export function createUnlimited({ apiBase, apiKey, read, write }) {
  const load = async () => {
    const response = await fetch(apiBase + '/unlimited', {
      cache: 'no-store',
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error('The archive is out of reach. Try again shortly.');
    const body = await response.json();
    return { title: body.title || 'The Open Water', prompts: body.prompts };
  };
  return createLocalRun({
    mode: 'practice',
    idPrefix: 'unlimited',
    fallbackTitle: 'The open water',
    storage: {
      read: () => read(UNLIMITED_STORAGE_KEY, null),
      write: value => write(UNLIMITED_STORAGE_KEY, value)
    },
    load
  });
}

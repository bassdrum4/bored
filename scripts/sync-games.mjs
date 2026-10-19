import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../src/games/content/', import.meta.url));
const files = readdirSync(dir).filter(file => file.endsWith('.html')).sort();
if (!files.length) {
  console.error('No game HTML files found in src/games/content.');
  process.exit(1);
}

let changed = 0;
for (const file of files) {
  const html = readFileSync(join(dir, file), 'utf8');
  if (!html.trim()) {
    console.error(`Empty game source: ${file}`);
    process.exit(1);
  }
  const b64 = Buffer.from(html, 'utf8').toString('base64');
  const target = join(dir, file + '.b64');
  let previous = null;
  try { previous = readFileSync(target, 'utf8'); } catch {}
  if (previous !== b64) {
    writeFileSync(target, b64);
    changed++;
  }
}
console.log(`games: ${files.length} sources, ${changed} payload${changed === 1 ? '' : 's'} updated`);

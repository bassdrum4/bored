import { readFileSync, writeFileSync, statSync } from 'node:fs';

let html = readFileSync('dist/index.html', 'utf8');
const inlined = html.match(/<script type="module" crossorigin>([\s\S]*?)<\/script>/);
if (!inlined) throw new Error('Could not find the inlined module script in dist/index.html.');
const script = inlined[1];
if (/\bimport\.meta\b/.test(script) || /^\s*(?:import|export)\s/m.test(script)) {
  throw new Error('Bundle still uses module syntax; refusing to publish a broken classic script.');
}
html = html.replace(inlined[0], '');
html = html.replace('</body>', () => `<script>${script}</script>\n</body>`);
writeFileSync('dist/index.html', html);
writeFileSync('index.html', html);
console.log(`published: single classic script in index.html (${statSync('index.html').size} bytes)`);

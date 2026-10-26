// Reproduce the self-contained game from the pinned upstream WebGL export.
// node scripts/package-rooftop-snipers.mjs /path/to/SoBloxsy-rooftop-snipers
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv.length !== 3) throw new Error('Pass the path to the upstream checkout (commit 44aad84ec9c5f70ffb6179ed7f4fa91eb5c824bd).');
const upstream = resolve(process.argv[2]);
const hashes = {
  'TemplateData/UnityLoader.js': '47d644782c8c9b55d9ac494f7be91e118495c23d5afe20ac27784462e64b42a8',
  'Build/rooftop-snipers.data.unityweb': 'b82dd5d2ee5567e5759c1f49413d8e48428a92fae7cc79d8da577b4345682f82',
  'Build/rooftop-snipers.asm.code.unityweb': '9fdb1d5414f6bab1f84467e7d834f5694cb612d80af6394e4b6c13b85c7ba5da',
  'Build/rooftop-snipers.json': 'ca6ea795ea2f06abd2bdd4b3bfc0d7f36efbbc15de697c77cf734f3d7a9381f2',
  'Build/rooftop-snipers.asm.framework.unityweb': '89b185bd7aaefb6081595b8e9a96dc025f45310ea28520ff359e4465ca7b6330',
  'Build/rooftop-snipers.asm.memory.unityweb': '884ffa169399ef39af758b6d4fbc0dfd0a97e6dc8bff5d35a4cf2cf46098b682',
  'LICENSE': 'a6a1d5a2a2d733e1febfc97132255b2d23b7f7c1c960d3f51d50a9ed4ced74de'
};
const files = {};
for (const [name, expected] of Object.entries(hashes)) {
  const buffer = readFileSync(resolve(upstream, name));
  if (createHash('sha256').update(buffer).digest('hex') !== expected) throw new Error('Upstream hash mismatch: ' + name);
  files[name] = buffer;
}
const config = JSON.parse(files['Build/rooftop-snipers.json']);
// One narrow compatibility patch at Unity's C# → browser HTTP boundary. The
// game needs no HTTP after boot; complete its legacy telemetry as network errors
// locally, instead of issuing off-site requests or relying only on CSP blocking.
const frameworkName = 'Build/rooftop-snipers.asm.framework.unityweb';
const originalRequest = 'var http=new XMLHttpRequest;var _url=Pointer_stringify(url);var _method=Pointer_stringify(method);http.open(_method,_url,true);';
const framework = gunzipSync(files[frameworkName]).toString();
if (framework.split(originalRequest).length !== 2) throw new Error('Unity request bridge changed; review before packaging.');
const packedFramework = gzipSync(framework.replace(originalRequest,
  'var http=Module.boredCreateRequest(Pointer_stringify(url),Pointer_stringify(method));'), { level: 9 });
// This loader recognizes compressed bytes by Unity's gzip comment, not by the
// normal gzip magic alone. Retain that marker on the modified framework.
packedFramework[3] = 16;
files[frameworkName] = Buffer.concat([packedFramework.subarray(0, 10),
  Buffer.from('UnityWeb Compressed Content (gzip)\0'), packedFramework.subarray(10)]);
const assets = Object.fromEntries(Object.keys(hashes).filter(name => name.endsWith('.unityweb'))
  .map(name => [name.slice('Build/'.length), files[name].toString('base64')]));
const template = readFileSync(resolve(root, 'scripts/templates/rooftop-snipers.html'), 'utf8');
const html = template
  .replace('__UPSTREAM_LICENSE__', () => files.LICENSE.toString().trim())
  .replace('__UNITY_LOADER__', () => files['TemplateData/UnityLoader.js'].toString().replace(/<\/script/gi, '<\\/script'))
  .replace('__UNITY_BUILD__', () => JSON.stringify({ config, assets }));
writeFileSync(resolve(root, 'src/games/content/rooftop-snipers.html'), html);
console.log('Packaged original Unity build: ' + html.length + ' bytes; no runtime network dependencies.');

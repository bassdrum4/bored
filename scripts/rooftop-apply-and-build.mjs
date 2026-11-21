// Temporary CI helper: patch the true recovered Unity method, rebuild the
// playable bundle, renew the expected bundle hash, then verify the result.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const run = (command,args) => {
  const result=spawnSync(command,args,{stdio:'inherit',maxBuffer:64*1024*1024});
  if (result.status !== 0) throw Error(command+' '+args.join(' ')+' failed: '+result.status);
};
const source='src/prototypes/rooftop-snipers/source/rooftop-snipers.code.js';
if (!readFileSync(source,'utf8').includes('// Always use a randomized round:'))
  run('node',['src/prototypes/rooftop-snipers/patch-random-only.mjs']);
run('node',['--check',source]);
run('node',['src/prototypes/rooftop-snipers/decompile.mjs','--rebuild','src/games/content/rooftop-snipers.html']);
const html=readFileSync('src/games/content/rooftop-snipers.html','utf8');
const prefix='<script id="unity-build" type="application/json">';
const start=html.indexOf(prefix)+prefix.length;
const build=JSON.parse(html.slice(start,html.indexOf('</script>',start)));
const asset='rooftop-snipers.asm.code.unityweb';
const hash=createHash('sha256').update(Buffer.from(build.assets[asset],'base64')).digest('hex');
const testFile='tests/rooftop-snipers.test.cjs';
const test=readFileSync(testFile,'utf8');
const pattern=/'rooftop-snipers.asm.code.unityweb': '[a-f0-9]{64}'/;
if (!pattern.test(test)) throw Error('Original code hash assertion missing');
writeFileSync(testFile,test.replace(pattern,`'rooftop-snipers.asm.code.unityweb': '${hash}'`));
console.log('Rebuilt randomized-only Rooftop Snipers; packed code SHA256',hash);
run('node',['--test','tests/rooftop-random-only.test.cjs']);
run('npm',['run','test:rooftop']);

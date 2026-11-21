import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const html = readFileSync('src/games/content/rooftop-snipers.html', 'utf8');
const marker = '<script id="unity-build" type="application/json">';
const left = html.indexOf(marker) + marker.length;
const right = html.indexOf('</script>', left);
const build = JSON.parse(html.slice(left, right));
const codeKey = 'rooftop-snipers.asm.code.unityweb';
const dataKey = 'rooftop-snipers.data.unityweb';
const memKey = 'rooftop-snipers.asm.memory.unityweb';
const unzip = key => gunzipSync(Buffer.from(build.assets[key], 'base64'));
const data = unzip(dataKey), mem = unzip(memKey);
console.log('sizes', {code:unzip(codeKey).length, data:data.length, mem:mem.length});
function files(buf){
 const magic='UnityWebData1.0\0', files=new Map();if(!buf.subarray(0,magic.length).equals(Buffer.from(magic,'latin1')))throw Error('container');
 const end=buf.readInt32LE(magic.length);for(let at=magic.length+4;at<end;){
  const off=buf.readInt32LE(at),sz=buf.readInt32LE(at+4),l=buf.readInt32LE(at+8),n=buf.subarray(at+12,at+12+l).toString('utf8');files.set(n,buf.subarray(off,off+sz));at+=12+l;
 }return files;
}
const meta=files(data).get('Il2CppData/Metadata/global-metadata.dat');
const regions=['stringLiteral','stringLiteralData','string','events','properties','methods','parameterDefaultValues','fieldDefaultValues','fieldAndParameterDefaultValueData','fieldMarshaledSizes','parameters','fields','genericParameters','genericParameterConstraints','genericContainers','nestedTypes','interfaces','vtableMethods','interfaceOffsets','typeDefinitions','images','assemblies','fieldRefs','referencedAssemblies','attributeData','attributeDataRange','unresolvedVirtualCall','unresolvedVirtualCallParameterTypes','unresolvedVirtualCallParameterRanges','windowsRuntimeTypeNames','windowsRuntimeStrings','exportedTypeDefinitions'];
const region={};for(let i=0;i<regions.length;i++)region[regions[i]]={off:meta.readInt32LE(8+8*i),n:meta.readInt32LE(12+8*i)};
const cstr=(index)=>{const x=region.string.off+index;return meta.subarray(x,meta.indexOf(0,x)).toString('utf8')};
let gm;for(let n=0;n<region.typeDefinitions.n/104;n++){let o=region.typeDefinitions.off+n*104;if(cstr(meta.readInt32LE(o))==='Gamemanager'){gm={index:n,methodStart:meta.readInt32LE(o+52),methodCount:meta.readUInt16LE(o+80),token:meta.readUInt32LE(o+100)};break}}
if(!gm) throw Error('Gamemanager not found');
console.log('GAMEMANAGER',gm);
for(let j=0;j<gm.methodCount;j++){const ix=gm.methodStart+j,o=region.methods.off+ix*56;console.log('METHOD',ix,cstr(meta.readInt32LE(o)),'slot',meta.readUInt16LE(o+50),'token',meta.readUInt32LE(o+44).toString(16),'methodIndex',meta.readInt32LE(o+24));}
console.log('METADATA',Object.fromEntries(['methods','typeDefinitions','images','assemblies'].map(x=>[x,region[x]])));
console.log('memory prefix',Array.from({length:24},(_,i)=>mem.readUInt32LE(i*4)));
console.log('memory bytes',mem.length,'first nonzero');
let spans=[];for(let i=0;i+4<mem.length&&spans.length<30;i+=4){const n=mem.readUInt32LE(i);if(n>0&&n<32768)spans.push([i,n]);}console.log(spans);

throw new Error('Forensic run complete (intentional temporary CI stop)');

// Validate every generated path and its size before using a snapshot.
// No network, database or dependency install required.
import { readdir, lstat, readFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const MiB=1024*1024;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
async function exactChildren(dir, expected) {
  const entries=await readdir(dir,{withFileTypes:true});
  const actual=new Set(entries.map(e=>e.name));
  if(entries.length!==expected.length||expected.some(name=>!actual.has(name)))throw Error('Incomplete or unexpected files: '+dir);
  return entries;
}
async function regular(path,max,gzip=false) {
  const s=await lstat(path);
  if(!s.isFile()||s.size<1||s.size>max)throw Error('Invalid generated file: '+path);
  if(gzip){
    const handle=await open(path,'r');
    try{
      const header=Buffer.alloc(3);
      const {bytesRead}=await handle.read(header,0,3,0);
      if(bytesRead!==3||header[0]!==0x1f||header[1]!==0x8b||header[2]!==8)throw Error('Invalid gzip: '+path);
    }finally{await handle.close();}
  }
  return s.size;
}
export async function validate(root,requiredDate) {
  const days=await readdir(root,{withFileTypes:true});
  if(days.length>3||!days.length||days.some(d=>!d.isDirectory()||!datePattern.test(d.name)))throw Error('Invalid snapshot directories');
  if(requiredDate&&!days.some(d=>d.name===requiredDate))throw Error('Missing daily snapshot');
  for(const day of days){
    const dir=join(root,day.name);
    await exactChildren(dir,['manifest.json',...Array.from({length:7},(_,i)=>String(i))]);
    const manifestPath=join(dir,'manifest.json');
    let size=await regular(manifestPath,64*1024);
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    if(manifest.date!==day.name||manifest.staticAnswers!==true||!Number.isSafeInteger(manifest.dayNumber)||manifest.dayNumber<1||!Array.isArray(manifest.prompts)||manifest.prompts.length!==7||new Set(manifest.prompts.map(p=>p.id)).size!==7||manifest.prompts.some(p=>typeof p.id!=='string'||!p.id||typeof p.text!=='string'||!p.text.trim()))throw Error('Invalid daily manifest: '+day.name);
    for(let i=0;i<7;i++){
      const round=join(dir,String(i));
      if(!(await lstat(round)).isDirectory())throw Error('Invalid round directory');
      await exactChildren(round,['answers.json.gz','sheet.json',...Array.from({length:128},(_,j)=>j+'.json.gz')]);
      size+=await regular(join(round,'answers.json.gz'),48*MiB,true);
      const sheetPath=join(round,'sheet.json');
      size+=await regular(sheetPath,2*MiB);
      const sheet=JSON.parse(await readFile(sheetPath,'utf8'));
      if(!Number.isSafeInteger(sheet.total)||sheet.total<1||sheet.count!==sheet.total||typeof sheet.deepest!=='string'||!sheet.deepest||!Array.isArray(sheet.answers)||!sheet.answers.length||sheet.answers.length>200)throw Error('Invalid review sheet: '+round);
      for(let j=0;j<128;j++)size+=await regular(join(round,j+'.json.gz'),4*MiB,true);
      if(size>64*MiB)throw Error('Daily compressed output exceeds 64 MiB');
    }
  }
  console.log('Verified '+days.length+' complete Krillion snapshot(s)');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await validate(process.argv[2],process.argv[3]);

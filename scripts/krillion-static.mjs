// Build one immutable daily snapshot, with a browser round file and small
// server-verifiable lookup shards. No service role key or database is needed.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { TIERS, normalize, stripArticle, numberValue, etDate } from '../src/games/content/krillion/rules.mjs';

const keyOf = value => normalize(stripArticle(value));
const common = { mashedpotatoes: ['mashed','mash'], frenchfries: ['fries'], bakedpotato: ['baked potato','jacket potato'] };
export function bucket(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % 128;
}
export function compileRound(raw) {
  const entries = new Map(), labels = new Set(), review = [], rows = [];
  let deepest = null, last = null;
  for (const item of raw) {
    if (typeof item?.answer !== 'string' || !item.answer.trim() || !Object.hasOwn(TIERS,item.tier)) continue;
    const answer = item.answer.trim(), own = keyOf(answer);
    if (!own) continue;
    const row = { answer, tier: item.tier, ...(typeof item.quip === 'string' && item.quip ? { quip: item.quip } : {}), ...(Array.isArray(item.aliases) ? { aliases: item.aliases.filter(x=>typeof x==='string') } : {}) };
    rows.push(row);
    last = answer;
    if (row.tier === 'krillion' && !deepest) deepest = answer;
    if (!labels.has(answer)) { labels.add(answer); review.push({ answer, tier: row.tier, ...(row.quip ? {quip:row.quip} : {}), score: TIERS[row.tier].score }); }
    for (const word of [answer,...(row.aliases||[]),...(Object.hasOwn(common,own)?common[own]:[])]) {
      const key = keyOf(word);
      if (!key || key.length > 256) continue;
      const value = [answer,row.tier,row.quip||null,key!==own];
      if (!entries.has(key)) entries.set(key,value);
      const num = numberValue(key);
      if (Number.isInteger(num) && !entries.has('#'+num)) entries.set('#'+num,[answer,row.tier,row.quip||null,true]);
    }
  }
  if (!rows.length) throw new Error('An answer bank was empty');
  const shards = Array.from({length:128},()=>Object.create(null));
  for (const [key,value] of entries) shards[bucket(key)][key]=value;
  review.sort((a,b)=>b.score-a.score||a.answer.localeCompare(b.answer));
  return { rows, shards, sheet:{total:labels.size,count:labels.size,deepest:deepest||last,answers:review.slice(0,200)} };
}
async function fetchJson(url) {
  const response = await fetch(url,{headers:{'User-Agent':'BoredKrillion/1.0 (+https://bassdrum4.github.io/bored/)'},signal:AbortSignal.timeout(150000)});
  if (!response.ok) throw new Error('Upstream HTTP '+response.status);
  return response.json();
}
export async function build(root, date, today, reveal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (today.date && today.date !== date) || (reveal.date && reveal.date !== date) || !Number.isInteger(Number(today.dayNumber)) || today.prompts?.length !== 7 || reveal.prompts?.length !== 7) throw new Error('Daily snapshot does not match the requested date');
  const dir=join(root,date);
  await mkdir(dir,{recursive:true});
  const manifest={date,dayNumber:Number(today.dayNumber),source:'Reference snapshot from krillion.io',staticAnswers:true,prompts:[]};
  for (let i=0;i<7;i++) {
    const prompt=today.prompts[i], source=reveal.prompts.find(p=>String(p.id)===String(prompt.id));
    if (!source || !Array.isArray(source.answers) || typeof prompt.text!=='string' || !prompt.text.trim() || !prompt.id) throw new Error('Missing prompt '+i);
    const {rows,shards,sheet}=compileRound(source.answers);
    const round=String(i);
    await mkdir(join(dir,round),{recursive:true});
    await writeFile(join(dir,round,'answers.json.gz'),gzipSync(JSON.stringify(rows),{level:6}));
    await writeFile(join(dir,round,'sheet.json'),JSON.stringify(sheet));
    // Empty shards are written too: a 404 means missing data, not a wrong answer.
    await Promise.all(shards.map((s,j)=>writeFile(join(dir,round,j+'.json'),JSON.stringify(s))));
    manifest.prompts.push({id:String(prompt.id),text:prompt.text});
  }
  // Manifest is the commit marker; never publish a partial day.
  await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest));
  return manifest;
}
if (process.argv[1] && import.meta.url===new URL('file:'+process.argv[1]).href) {
  const root=process.argv[2], date=process.argv[3]||etDate();
  if (!root) throw new Error('Usage: node scripts/krillion-static.mjs OUTPUT [YYYY-MM-DD]');
  const [today,reveal]=await Promise.all([fetchJson('https://krillion.io/api/today'),fetchJson('https://krillion.io/api/reveal?date='+date)]);
  await build(root,date,today,reveal);
  console.log('Built static Krillion snapshot '+date);
}

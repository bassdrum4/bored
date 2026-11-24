// Compile one round in a worker. Exact matches are O(1), typos only visit
// plausible lengths; do not allocate and sort hundreds of thousands of candidates.
import { TIERS, normalize, stripArticle, numberValue } from './rules.mjs';
const bare = value => normalize(stripArticle(value));
const COMMON = { mashedpotatoes:['mashed','mash'], frenchfries:['fries'], bakedpotato:['baked potato','jacket potato'] };
export function createMatcher(answers) {
  const entries = new Map(), numeric = new Map(), lengths = new Map();
  for (const answer of answers) {
    const own=bare(answer.answer);
    for (const word of [answer.answer,...(answer.aliases||[]),...(Object.hasOwn(COMMON,own)?COMMON[own]:[])]) {
      const key=bare(word);
      if (!key || key.length>256 || entries.has(key)) continue;
      const entry={key,score:TIERS[answer.tier]?.score||0,ord:entries.size};
      entries.set(key,entry);
      const num=numberValue(key);
      if(Number.isInteger(num)&&!numeric.has(num))numeric.set(num,entry);
      if(!lengths.has(key.length))lengths.set(key.length,[]);
      lengths.get(key.length).push(entry);
    }
  }
  return function find(input) {
    const key=bare(input);
    if(!key||key.length>256)return null;
    if(entries.has(key))return key;
    if(key.length>4&&key.endsWith('s')&&entries.has(key.slice(0,-1)))return key.slice(0,-1);
    const number=numberValue(input);
    if(numeric.has(number))return numeric.get(number).key;
    const allowance=key.length<4?0:key.length<8?1:2;
    let best=null,bestDistance=allowance+1;
    const a=new Uint16Array(257), b=new Uint16Array(257);
    const bounded=(other,limit)=>{
      const infinity=limit+1;
      let previous=a,next=b;
      for(let j=0;j<=other.length;j++)previous[j]=j<=limit?j:infinity;
      for(let i=1;i<=key.length;i++){
        const lo=Math.max(1,i-limit),hi=Math.min(other.length,i+limit);
        next[0]=i<=limit?i:infinity;
        if(lo>1)next[lo-1]=infinity;
        if(hi<other.length)next[hi+1]=infinity;
        let min=next[0];
        for(let j=lo;j<=hi;j++){
          const v=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(key[i-1]===other[j-1]?0:1));
          next[j]=v;min=Math.min(min,v);
        }
        if(min>limit)return infinity;
        [previous,next]=[next,previous];
      }
      return previous[other.length];
    };
    if(allowance)for(let length=key.length-allowance;length<=key.length+allowance;length++){
      for(const entry of lengths.get(length)||[]){
        const d=bounded(entry.key,allowance);
        if(d<=allowance&&(d<bestDistance||d===bestDistance&&(entry.score<best.score||entry.score===best.score&&entry.ord<best.ord))){
          best=entry;bestDistance=d;
        }
      }
    }
    if(best)return best.key;
    const prefixes=[];
    for(let length=Math.max(4,key.length-16);length<key.length;length++)if(entries.has(key.slice(0,length)))prefixes.push(key.slice(0,length));
    return prefixes.length===1?prefixes[0]:null;
  };
}

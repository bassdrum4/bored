import { createMatcher } from './static-match.mjs';
let current='',loading=null;
async function load(date,round) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(round)||round<0||round>6)throw Error('Invalid round');
  const key=date+'/'+round;
  if(key!==current||!loading){
    current=key;
    const task=(async()=>{
      const url=new URL('../../../krillion-data/'+key+'/answers.json.gz',import.meta.url);
      const raw='https://raw.githubusercontent.com/bassdrum4/bored/';
      const archive=raw+'krillion-archive-'+date+'/'+key+'/answers.json.gz';
      for(const source of [url,raw+'krillion-data/'+key+'/answers.json.gz',archive]){
        try{
          const res=await fetch(source,{signal:AbortSignal.timeout(20000)});
          if(!res.ok||!res.body)continue;
          const answers=await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
          return createMatcher(answers);
        }catch{}
      }
      throw Error('Answer file unavailable');
    })();
    loading=task;
    task.catch(()=>{if(loading===task){loading=null;current='';}});
  }
  return loading;
}
self.onmessage=async({data})=>{
  const {id,date,round,input}=data;
  try{const find=await load(date,round);if(id)self.postMessage({id,key:find(input)});}
  catch{if(id)self.postMessage({id,key:null});}
};

import { createMatcher } from './static-match.mjs';
let current='',loading=null;
async function load(date,round) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(round)||round<0||round>6)throw Error('Invalid round');
  const key=date+'/'+round;
  if(key!==current||!loading){
    current=key;
    const task=(async()=>{
      const url=new URL('../../../krillion-data/'+key+'/answers.json.gz',import.meta.url);
      const res=await fetch(url,{signal:AbortSignal.timeout(20000)});
      if(!res.ok||!res.body)throw Error('Answer file unavailable');
      const answers=await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
      return createMatcher(answers);
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

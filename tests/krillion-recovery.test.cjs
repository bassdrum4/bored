const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const source = stripTypeScriptTypes(readFileSync('supabase/functions/krillion/index.ts', 'utf8'));
const date = '2026-11-24';
const book = { date, dayNumber: 1, source: 'test', prompts: Array.from({length:7}, (_,i)=>({id:String(i),text:'Name a planet '+i,answers:[{answer:'Mercury',tier:'schooler'}]})) };
function harness({missingBook=false, failRead=0, failInsert=0}={}) {
  let handler, now=Date.parse(date+'T12:00:00Z'), reads=0, inserts=0, upstream=0;
  const rows=new Map();
  let bank=[];
  class Clock extends Date { static now(){return now;} }
  const json=(data,status=200)=>Response.json(data,{status});
  const fetch=async(input,init={})=>{
    const url=new URL(input), path=url.pathname, method=init.method||'GET', q=url.searchParams;
    if(url.hostname==='krillion.io'){upstream++;return json(book);}
    if(path.endsWith('/krillion_books')){
      if(method==='POST')return missingBook?json({},522):json({},201);
      reads++;
      if(failRead-->0)return json({},522);
      return json(missingBook?[]:[{book}]);
    }
    if(path.endsWith('/krillion_answer_keys')){
      if(method==='POST'){for(const row of JSON.parse(init.body))if(!bank.some(hit=>hit.date===row.date&&hit.prompt_id===row.prompt_id&&hit.key===row.key))bank.push(row);return json({},201);}
      const found=bank.filter(row=>row.date===q.get('date')?.slice(3));
      return json(found.slice(0,1).map(row=>({prompt_id:row.prompt_id})));
    }
    if(path.endsWith('/rpc/krillion_clear_bank')){const body=JSON.parse(init.body);bank=bank.filter(row=>row.date!==body.p_date);return json(null);}
    if(path.endsWith('/rpc/krillion_refresh')){const body=JSON.parse(init.body);return json({date:body.p_date,status:'queued'});}
    // These fixtures always carry a complete book, so every day is ready.
    if(path.endsWith('/rpc/krillion_bank_ready'))return json(true);
    if(path.endsWith('/rpc/krillion_match_answer')){
      const body=JSON.parse(init.body);
      const key=String(body.p_input||'').trim().toLowerCase().replace(/^(the|a|an)\s+/,'').replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
      const hit=bank.find(row=>row.date===body.p_date&&row.prompt_id===body.p_prompt&&row.key===key);
      return json(hit?{answer:hit.answer,tier:hit.tier,quip:hit.quip,correction:!hit.own}:null);
    }
    if(path.endsWith('/krillion_runs')){
      const id=q.get('id')?.slice(3);
      if(method==='GET')return json(rows.has(id)?[rows.get(id)]:[]);
      const body=JSON.parse(init.body);
      if(method==='POST'){
        inserts++;
        if(rows.has(body.id))return json([]);
        rows.set(body.id,body);
        if(failInsert-->0)return json({},522); // committed, but response lost
        return json([body],201);
      }
      if(method==='PATCH'){
        const row=rows.get(id);
        if(!row||q.has('round')&&row.round!==Number(q.get('round').slice(3)))return json([]);
        Object.assign(row,body);
        return json([row]);
      }
    }
    throw new Error('Unexpected URL '+url);
  };
  vm.runInNewContext(source,{Deno:{env:{get:()=> 'https://db.test'},serve:fn=>{handler=fn}},fetch,Date:Clock,Intl,URL,Response,Headers,AbortSignal,crypto:{randomUUID},console,setTimeout:fn=>fn()});
  return {rows, advance:ms=>{now+=ms;}, stats:()=>({reads,inserts,upstream}), bank:()=>bank, call:async(path,body)=>{
    const req=new Request('https://db.test/functions/v1/krillion/'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
    const res=await handler(req);return {status:res.status,body:await res.json()};
  }};
}
test('a transient database read retries without refetching the cached daily',async()=>{
  const h=harness({failRead:1});
  const res=await h.call('today');
  assert.equal(res.status,200);
  assert.equal(res.body.date,date);
  assert.equal(h.stats().reads,2);
  assert.equal(h.stats().upstream,0);
  assert.ok(!('answers' in res.body.prompts[0]));
});
test('a daily start whose insert response was lost is idempotent and recoverable',async()=>{
  const h=harness({failInsert:1}), runId=randomUUID();
  const first=await h.call('start',{runId});
  assert.equal(first.status,200);
  assert.equal(first.body.runId,runId);
  const again=await h.call('start',{runId});
  assert.equal(again.body.runId,runId);
  assert.equal(h.rows.size,1);
  assert.equal(h.stats().inserts,2);
});
test('a failed cache write never starts a ranked run against an unsaved book',async()=>{
  const h=harness({missingBook:true});
  const r=await h.call('start',{runId:randomUUID()});
  assert.equal(r.status,503);
  assert.equal(h.rows.size,0);
});
test('a retried answer returns saved state and does not score twice',async()=>{
  const h=harness(), runId=randomUUID();
  await h.call('start',{runId});
  h.advance(4000);
  const answer={runId,round:0,answer:'Mercury'};
  const a=await h.call('answer',answer), b=await h.call('answer',answer);
  assert.equal(a.body.result.score,30);
  assert.equal(b.body.alreadyScored,true);
  assert.equal(b.body.state.score,30);
  assert.equal(h.rows.get(runId).results.length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoster } from './core.mjs';

test('deduplicate guests and signed-in accounts across tabs',()=>{
  const r=createRoster(),a={},b={},c={},d={};
  r.add(a,{guest:true,id:'g'});r.add(b,{guest:true,id:'g'});
  r.add(c,{guest:false,id:'u',name:'Penguin'});r.add(d,{guest:false,id:'u',name:'Penguin'});
  assert.deepEqual(r.counts(),{g:1,a:1});
  r.remove(a);r.remove(c);
  assert.deepEqual(r.counts(),{g:1,a:1});
  r.remove(b);r.remove(d);
  assert.deepEqual(r.counts(),{g:0,a:0});
});
test('rename and account eviction use verified identity',()=>{
  const r=createRoster(),a={},b={},c={};
  r.add(a,{guest:false,id:'u',name:'Old'});
  r.add(b,{guest:false,id:'u',name:'New'});
  r.add(c,{guest:false,id:'v',name:'Alice'});
  assert.deepEqual(r.names(),['Alice','New']);
  assert.deepEqual(r.accountClients('u'),[a,b]);
  for(const client of r.accountClients('u'))r.remove(client);
  assert.deepEqual(r.names(),['Alice']);
  assert.deepEqual(r.counts(),{g:0,a:1});
});
test('switching identity cannot leave a ghost member',()=>{
  const r=createRoster(),a={};
  r.add(a,{guest:true,id:'g'});
  r.add(a,{guest:false,id:'u',name:'Player'});
  assert.deepEqual(r.counts(),{g:0,a:1});
  r.remove(a);assert.equal(r.remove(a),false);
  assert.deepEqual(r.counts(),{g:0,a:0});
});

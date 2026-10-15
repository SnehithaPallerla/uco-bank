import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {initialState,traceFunds,chronologicalPaths} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';
import {Store,createPlatformServer} from '../server/platform.mjs';
import {OracleStore} from '../server/oracle-store.mjs';
import {graphProjection,synchronizeGraphRecords,queryOracleGraph,ENTITY_QUERY,PAYMENT_QUERY,RELATIONSHIP_QUERY,returnPathQuery} from '../server/oracle-graph.mjs';
import {localFundsGraph} from '../src/platform/funds-graph.js';

const driver={STRING:1,NUMBER:2,CLOB:3,OUT_FORMAT_OBJECT:4};
const record=()=>initialState().records.find(r=>r.id==='MT-BLUEFIN');
const userFor=r=>personas.find(p=>p.branches.includes(r.branch));
const uppercase=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toUpperCase(),v]));
function fakeQueries(r,{alterPayment=false,tooManyPaths=false}={}){
 const p=graphProjection(r);let calls=0;
 return {calls:()=>calls,async execute(sql,binds){
  calls++;assert.equal(binds.case_id,r.id);
  if(sql===ENTITY_QUERY)return {rows:p.entities.map(uppercase)};
  if(sql===PAYMENT_QUERY)return {rows:p.payments.filter(t=>t.posting_status==='posted'&&t.observed!==0&&Date.parse(t.original_event_time)<=Date.parse(r.asOf)).map(t=>({...uppercase(t),POSTED_AT_UTC:t.posted_at,FROM_ID:t.from_entity,TO_ID:t.to_entity,AMOUNT_INR:t.amount_inr+(alterPayment?1:0)}))};
  if(sql===RELATIONSHIP_QUERY)return {rows:p.relationships.filter(t=>t.verified===1).map(t=>({...uppercase(t),FROM_ID:t.from_entity,TO_ID:t.to_entity}))};
  const hops=[3,4,5,6].find(n=>sql===returnPathQuery(n));assert.ok(hops);
  const allowed=new Set(JSON.parse(binds.eligible_json.val));
  const rows=chronologicalPaths({...r,transactions:traceFunds(r).transactions.filter(t=>Date.parse(t.postedAt)<=Date.parse(r.asOf))}).filter(xs=>xs.length===hops&&xs.every(t=>allowed.has(r.id+':'+t.id))).map(xs=>Object.fromEntries(xs.map((t,i)=>['TX'+i,r.id+':'+t.id])));
  return {rows:tooManyPaths?Array.from({length:501},()=>rows[0]):rows};
 }};
}

test('graph projections canonicalize corrections, exclude invalid payments and give relationships stable distinct keys',()=>{
 const r=record(),tx=r.transactions[0];r.transactions.push({...tx,version:2,amountInr:tx.amountInr+50});r.transactions.push({...tx,id:'INVALID',amountInr:-1});
 r.relationships=[{from:r.entities[0].id,to:r.entities[1].id,type:'common_director',verified:true,evidenceId:'E1'},{from:r.entities[1].id,to:r.entities[0].id,type:'ownership',verified:false,evidenceId:'E2'}];
 const p=graphProjection(r);assert.equal(p.payments.filter(t=>t.tx_id===r.id+':'+tx.id).length,1);assert.equal(p.payments.find(t=>t.tx_id===r.id+':'+tx.id).amount_inr,tx.amountInr+50);assert.ok(!p.payments.some(t=>t.tx_id.endsWith(':INVALID')));
 assert.notEqual(p.relationships[0].relationship_id,p.relationships[1].relationship_id);assert.equal(p.relationships[0].verified,1);assert.equal(p.relationships[1].verified,0);
 assert.equal(p.payments[0].original_event_time,tx.postedAt);assert.equal(p.payments[0].posted_at,new Date(tx.postedAt).toISOString().replace('Z',''));
});

test('projection synchronization is scoped to selected cases and leaves transaction commit to the store',async()=>{
 const calls=[],r=record();await synchronizeGraphRecords({executeMany:async(sql,rows)=>calls.push({sql,rows})},driver,[r]);
 for(const call of calls.filter(c=>c.sql.startsWith('DELETE')))assert.deepEqual(call.rows,[{case_id:r.id}]);
 assert.equal(calls.filter(c=>c.sql.startsWith('DELETE')).length,3);
 assert.ok(calls.some(c=>c.sql.startsWith('MERGE INTO uco_payment')));assert.ok(calls.every(c=>!c.sql.includes('TRUNCATE')));
});

test('Oracle graph mapping preserves case evidence, funds totals and chronological paths',async()=>{
 for(const r of initialState().records){
  const graph=await queryOracleGraph(fakeQueries(r),driver,r,userFor(r),7),trace=traceFunds(r);
  assert.equal(graph.source,'Oracle SQL Property Graph');assert.equal(graph.revision,7);
  assert.deepEqual(graph.metrics,{directInr:trace.directInr,grossInr:trace.grossInr,returnsInr:trace.returnsInr,netInr:trace.netInr},r.id);
  assert.deepEqual(graph.paths.map(xs=>xs.map(t=>t.id)),localFundsGraph(r).paths.map(xs=>xs.map(t=>t.id)).sort((a,b)=>a.join('|').localeCompare(b.join('|'))),r.id);
  for(const tx of graph.payments)assert.ok(r.evidence.some(e=>e.id===tx.evidenceId),r.id+' retains payment evidence');
 }
});

test('scope denial, projection drift and excess paths fail explicitly',async()=>{
 const r=record(),denied=fakeQueries(r);await assert.rejects(queryOracleGraph(denied,driver,r,personas.find(p=>p.id==='neha'),0),/branch scope/);assert.equal(denied.calls(),0);
 await assert.rejects(queryOracleGraph(fakeQueries(r,{alterPayment:true}),driver,r,userFor(r),0),e=>e.status===409);
 const cycle=initialState().records.find(r=>r.id==='CL05');await assert.rejects(queryOracleGraph(fakeQueries(cycle,{tooManyPaths:true}),driver,cycle,userFor(cycle),0),e=>e.status===422);
 for(const n of [0,2,7,3.5])assert.throws(()=>returnPathQuery(n));
});

test('failed graph projection updates roll back the complete Oracle save',async()=>{
 const state=initialState(),next=structuredClone(state),r=next.records[0];r.entities[0].name+=' updated';
 let commits=0,rollbacks=0;const conn={execute:async()=>({rows:[{REVISION:state.revision}]}),executeMany:async()=>{throw Error('projection failure');},commit:async()=>commits++,rollback:async()=>rollbacks++};
 const store=new OracleStore({},driver);store.state=state;store.withConnection=fn=>fn(conn);
 await assert.rejects(store.save(next),/projection failure/);assert.equal(commits,0);assert.equal(rollbacks,1);assert.equal(store.state,state);
});

test('graph HTTP route authorizes first, rejects stale revisions and never disguises Oracle failure as a local result',async()=>{
 const dir=await mkdtemp(path.resolve('test-output','graph-api-')),store=await new Store(dir).init();store.backend='oracle';let reads=0;
 store.readGraph=async(r,user)=>{reads++;return {...localFundsGraph(r,store.state.revision),source:'Oracle SQL Property Graph',graph:'UCO_FLOW'};};
 const server=createPlatformServer({store});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const login=async persona=>(await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona})})).headers.get('set-cookie').split(';')[0];
 try{
  const url=base+'/api/records/MT-BLUEFIN/graph';assert.equal((await fetch(url)).status,401);
  const restricted=await login('neha');assert.equal((await fetch(url,{headers:{cookie:restricted}})).status,403);assert.equal(reads,0);
  const cookie=await login('asha');assert.equal((await fetch(url+'?revision=999',{headers:{cookie}})).status,409);assert.equal(reads,0);
  const response=await fetch(url+'?revision=0',{headers:{cookie}}),graph=await response.json();assert.equal(response.status,200);assert.equal(graph.source,'Oracle SQL Property Graph');assert.equal(reads,1);
  store.readGraph=async()=>{throw Object.assign(Error('Graph unavailable'),{status:502});};const failed=await fetch(url,{headers:{cookie}});assert.equal(failed.status,502);assert.ok(!('entities' in await failed.json()));
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

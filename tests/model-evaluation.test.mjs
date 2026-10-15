import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {initialState,assess,upgradeState,command} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';
import {validationPacket,preparedValidation} from '../src/platform/assistant/validation.js';
import {MODEL_EXPECTATIONS,evaluateReview,evaluationTotals,preparedEvaluation} from '../src/platform/assistant/evaluation.js';
import {ModelEvaluation} from '../server/model-evaluation.mjs';
import {Store,createPlatformServer,verifyChain} from '../server/platform.mjs';

test('20 additional cases have unique scoped sources, diverse expected outcomes and no rubric in model input',()=>{
 const s=initialState(),samples=s.records.filter(r=>r.profile==='model-lab');assert.equal(samples.length,20);assert.equal(s.records.length,101);
 const ids=new Set();for(const r of samples){const expected=MODEL_EXPECTATIONS.find(e=>e.recordId===r.id);assert.equal(assess(r).outcome,expected.ruleOutcome,r.id);for(const e of r.evidence){assert.ok(!ids.has(e.id));ids.add(e.id);}const p=validationPacket(r,assess(r),s.policy);assert.ok(!JSON.stringify(p).includes('acceptableDispositions'));assert.ok(!JSON.stringify(p).includes('concepts'));assert.ok(p.transactions.every(t=>r.evidence.some(e=>e.id===t.evidenceId)));}
 assert.equal(new Set(samples.map(r=>r.borrower.name)).size,20);assert.ok(samples.some(r=>r.branch==='BBS'));assert.ok(samples.some(r=>r.branch==='KOL'));
});
test('existing workspaces gain samples once without replacing officer work or saved OCI reviews',()=>{
 let old=initialState();old.records=old.records.filter(r=>r.profile!=='model-lab');old.appVersion='4.1.0';old=command(old,personas[0],{type:'openCase',recordId:'MT-BLUEFIN'});old.records.find(r=>r.id==='MT-BLUEFIN').llmValidations=[{id:'EXISTING'}];old.policy.repeatHours=72;
 const next=upgradeState(old);assert.equal(next.records.length,101);assert.deepEqual(next.cases,old.cases);assert.equal(next.policy.repeatHours,72);assert.deepEqual(next.records.find(r=>r.id==='MT-BLUEFIN').llmValidations,[{id:'EXISTING'}]);assert.deepEqual(upgradeState(next),next);
});
test('test reports distinguish checks, errors and varying repeated dispositions',()=>{
 const s=initialState(),r=s.records.find(r=>r.id==='LAB-002'),packet=validationPacket(r,assess(r),s.policy),expected=MODEL_EXPECTATIONS.find(e=>e.recordId===r.id),result={packet,review:preparedValidation(packet)};
 assert.ok(evaluateReview(result,expected).checksPassed);
 const changed={...result,review:{...result.review,disposition:'Review required'}};assert.equal(evaluateReview(changed,expected).dispositionAgrees,false);
 const totals=evaluationTotals([{recordId:r.id,result,checks:evaluateReview(result,expected)},{recordId:r.id,result:changed,checks:evaluateReview(changed,expected)},{recordId:'LAB-001',error:'Unavailable'}]);
 assert.deepEqual([totals.completed,totals.errors,totals.checksPassed,totals.agreement],[2,1,1,0.5]);assert.deepEqual(totals.unstableCases,[r.id]);assert.equal(evaluationTotals([]).agreement,null);
 assert.equal(preparedEvaluation(s.records,s.policy,['LAB-001','LAB-002'],assess).mode,'Prepared test walkthrough');
});
test('model evaluation jobs enforce access and limits, persist reviews and record individual provider failures',async()=>{
 const dir=await mkdtemp(path.resolve('test-output','model-evaluation-')),store=await new Store(dir).init();let release;
 const gate=new Promise(resolve=>release=resolve);let calls=0;
 const service=new ModelEvaluation({store,config:()=>({configured:true}),validate:async packet=>{calls++;if(calls===1)await gate;if(packet.recordId==='LAB-002')throw Error('Controlled unavailable provider');return {id:'MOCK-'+calls,recordId:packet.recordId,mode:'Live OCI model',packet,review:preparedValidation(packet)};}});
 try{
  assert.throws(()=>service.start(personas[2],{recordIds:['LAB-002']}),/branch/);assert.throws(()=>service.start(personas[3],{recordIds:['LAB-001']}),/role/);assert.throws(()=>service.start(personas[0],{recordIds:['MT-BLUEFIN']}),/samples/);
  assert.throws(()=>service.start(personas[0],{recordIds:['LAB-001'],repeats:3}),/repetitions/);
  const before=assess(store.state.records.find(r=>r.id==='LAB-001')),job=service.start(personas[0],{recordIds:['LAB-001','LAB-002'],repeats:1});
  assert.throws(()=>service.read(personas[1],job.id),/unavailable/);assert.throws(()=>service.start(personas[0],{recordIds:['LAB-001']}),e=>e.status===409);release();
  while(service.read(personas[0],job.id).status==='Running')await new Promise(resolve=>setTimeout(resolve,10));
  const report=service.read(personas[0],job.id);assert.equal(report.rows.length,2);assert.equal(report.totals.errors,1);assert.equal(report.totals.completed,1);assert.deepEqual(assess(store.state.records.find(r=>r.id==='LAB-001')),before);assert.ok(verifyChain(store.state));
 }finally{release();await rm(dir,{recursive:true,force:true});}
});
test('stopping an evaluation prevents later requests while retaining the in-flight result',async()=>{
 const dir=await mkdtemp(path.resolve('test-output','model-stop-')),store=await new Store(dir).init();let release,calls=0;const gate=new Promise(resolve=>release=resolve);
 const service=new ModelEvaluation({store,config:()=>({configured:true}),validate:async packet=>{calls++;await gate;return {id:'MOCK-STOP',recordId:packet.recordId,mode:'Live OCI model',packet,review:preparedValidation(packet)};}});
 try{const job=service.start(personas[0],{recordIds:['LAB-001','LAB-002'],repeats:2});while(calls===0)await new Promise(resolve=>setTimeout(resolve,10));service.stop(personas[0],job.id);release();while(service.read(personas[0],job.id).status==='Running')await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls,1);assert.equal(service.read(personas[0],job.id).status,'Stopped');}finally{release();await rm(dir,{recursive:true,force:true});}
});
test('HTTP evaluation reports require the owning officer and reject client labels',async()=>{
 const dir=await mkdtemp(path.resolve('test-output','model-http-')),store=await new Store(dir).init();
 const server=createPlatformServer({store,ociStatus:()=>({configured:true}),ociValidate:async packet=>({id:'MOCK-'+packet.recordId,recordId:packet.recordId,mode:'Live OCI model',packet,review:preparedValidation(packet)})});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const request=(route,cookie,body)=>fetch(base+route,{method:body?'POST':'GET',headers:{cookie:cookie||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const login=async persona=>(await request('/api/session','',{persona})).headers.get('set-cookie').split(';')[0];
 try{assert.equal((await request('/api/assistant/evaluation')).status,401);const cookie=await login('asha');assert.equal((await request('/api/assistant/evaluation',cookie,{recordIds:['LAB-001'],expected:'Supported'})).status,400);const response=await request('/api/assistant/evaluation',cookie,{recordIds:['LAB-001']});assert.equal(response.status,202);const {job}=await response.json();const other=await login('ravi');assert.equal((await request('/api/assistant/evaluation/'+job.id,other)).status,404);let report;do{await new Promise(resolve=>setTimeout(resolve,10));report=(await (await request('/api/assistant/evaluation/'+job.id,cookie)).json()).job;}while(report.status==='Running');assert.equal(report.status,'Completed');assert.equal(report.rows.length,1);}finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

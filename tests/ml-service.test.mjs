import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {MLService,reviewState} from '../server/ml-service.mjs';
import {MLRepository} from '../server/ml-repository.mjs';
import {createPlatformServer} from '../server/platform.mjs';
import {featureDigest,FEATURE_VERSION,FEATURES,featurePolicy} from '../server/ml-features.mjs';
import {initialState,command} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';

async function harness(){
 await mkdir('test-output',{recursive:true});const directory=await mkdtemp(path.resolve('test-output','ml-service-'));
 const model={modelVersion:'WS-0123456789abcdef',featureVersion:FEATURE_VERSION,trainedAt:'2026-10-15T00:00:00Z',algorithm:'LogisticRegression',policyDigest:featureDigest(featurePolicy()),scope:'test',evaluation:{trainingGroups:['private-group'],testGroups:[],accuracy:null}};
 await writeFile(path.join(directory,model.modelVersion+'.json'),JSON.stringify(model));await writeFile(path.join(directory,'active.json'),JSON.stringify({file:model.modelVersion+'.json',modelVersion:model.modelVersion,sha256:featureDigest(model)}));
 const store={state:initialState()},saved=[],repository={save:async(m,f,p)=>{saved.push(...p);return p;},saveLabel:async label=>label};
 const worker=async(op,{rows})=>rows.map(r=>({recordId:r.recordId,modelVersion:model.modelVersion,featureDigest:r.digest,flagged:r.eligible?true:null,score:r.eligible?.7:null,threshold:.6,status:r.eligible?'Flagged for review':'Unable to score',comparisons:[],reasons:r.reasons,warnings:r.warnings}));
 const service=new MLService(store,{directory,repository,worker});return {directory,model,store,saved,service,close:()=>rm(directory,{recursive:true,force:true})};
}
test('ML model is the flag authority, predictions are reused, and missing artifacts never clear cases',async()=>{
 const h=await harness();try{const result=await h.service.score(personas[0],'MT-BLUEFIN-OK');assert.equal(result.predictions[0].flagged,true);assert.ok(!('trainingGroups' in result.model.evaluation));await h.service.score(personas[0],'MT-BLUEFIN-OK');assert.equal(h.saved.length,1);
  h.service.directory=path.join(h.directory,'missing');await assert.rejects(h.service.score(personas[0],'MT-BLUEFIN-OK'),e=>e.status===503&&/not trained/.test(e.message));
 }finally{await h.close();}
});
test('stale inference cannot persist and a new feature snapshot is rescored',async()=>{
 const h=await harness();try{const original=h.service.worker;h.service.worker=async(...args)=>{const out=await original(...args);h.store.state.revision++;return out;};await assert.rejects(h.service.score(personas[0],'MT-BLUEFIN'),e=>e.status===409);assert.equal(h.saved.length,0);
  h.service.worker=original;await h.service.score(personas[0],'MT-BLUEFIN');h.store.state.records.find(r=>r.id==='MT-BLUEFIN').transactions[0].amountInr+=1000;h.store.state.revision++;await h.service.score(personas[0],'MT-BLUEFIN');assert.equal(h.saved.length,2);
 }finally{await h.close();}
});
test('artifact integrity, mismatched inference and unapproved officer labels are rejected',async()=>{
 const h=await harness();try{await assert.rejects(h.service.score(personas[2],'MT-BLUEFIN'),/Access denied/);
  await assert.rejects(h.service.recordOutcome(personas[1],{recordId:'MT-BLUEFIN',expectedRevision:0}),/independently closed/);
  await assert.rejects(h.service.recordOutcome(personas[1],{recordId:'MT-BLUEFIN',expectedRevision:0,outcome:'explained'}),/Only recordId/);
  h.service.worker=async()=>[];await assert.rejects(h.service.score(personas[0],'MT-BLUEFIN'),/mismatched/);
  await writeFile(path.join(h.directory,h.model.modelVersion+'.json'),JSON.stringify({...h.model,algorithm:'tampered'}));await assert.rejects(h.service.status(),/integrity/);
 }finally{await h.close();}
});
test('case opening freezes an ML flag independently of legacy reference checks',()=>{
 const state=command(initialState(),personas[0],{type:'openCase',recordId:'MT-BLUEFIN-OK'},{mlPrediction:{modelVersion:'test',flagged:true,score:.7}});assert.equal(state.cases[0].priority,'ML review');assert.equal(state.cases[0].mlPrediction.flagged,true);assert.equal(state.cases[0].assessment.outcome,'Supported');
});
test('review entry survives a lower score and leaves the queue only after officer closure',()=>{
 const initial={recordId:'case',modelVersion:'WS-current',flagged:true,status:'Flagged for review',featureDigest:'before',scoredAt:'2026-10-15T10:00:00Z'};
 assert.equal(reviewState(initial,null,null).reviewRequired,true);
 const updated={...initial,flagged:false,status:'Not flagged by model',featureDigest:'after',scoredAt:'2026-10-15T11:00:00Z'};
 assert.equal(reviewState(updated,null,initial).reviewHeld,true);
 assert.equal(reviewState(updated,{status:'Open concern'},initial).reviewRequired,true);
 const closed={status:'Closed',closedAt:'2026-10-15T12:00:00Z',mlDecisionSnapshot:{featureDigest:'after'}};
 assert.equal(reviewState(updated,closed,initial).reviewRequired,false);
 assert.equal(reviewState(updated,closed,initial).status,'Closed by officer');
 assert.equal(reviewState({...initial,featureDigest:'new',scoredAt:'2026-10-15T13:00:00Z'},closed,initial).reviewRequired,true);
 const closedWhileUnavailable={status:'Closed',closedAt:'2026-10-15T12:00:00Z',mlDecisionSourceDigest:'reviewed-source'};
 assert.equal(reviewState({...initial,sourceRecordDigest:'reviewed-source'},closedWhileUnavailable,initial).reviewRequired,false);
 assert.equal(reviewState({...initial,sourceRecordDigest:'changed-source',scoredAt:'2026-10-15T13:00:00Z'},closedWhileUnavailable,initial).reviewRequired,true);
});

test('old model alerts do not retain review, while open investigations and current model alerts do',()=>{
 const current={modelVersion:'WS-current',flagged:false,status:'Not flagged by model'};
 const old={modelVersion:'WS-old',flagged:true,scoredAt:'2026-10-15T10:00:00Z'};
 assert.equal(reviewState(current,null,old).reviewRequired,false);
 assert.equal(reviewState(current,null,old).status,'Not flagged by model');
 assert.equal(reviewState(current,{status:'Open concern'},old).reviewRequired,true);
 assert.equal(reviewState(current,null,{...old,modelVersion:'WS-current'}).reviewHeld,true);
});

test('review hold storage scopes history to the active model in file and Oracle backends',async()=>{
 const h=await harness();try{
  const prediction={recordId:'case',modelFamily:'weak-supervised-review',flagged:true,scoredAt:'2026-10-15T10:00:00Z'};
  const old={...prediction,modelVersion:'WS-old'},current={...prediction,modelVersion:'WS-current'};
  await writeFile(path.join(h.directory,'history.json'),JSON.stringify({predictions:{old,current,foreign:{...current,recordId:'other'}}}));
  const local=new MLRepository(h.store,{directory:h.directory});
  assert.deepEqual([...(await local.reviewHolds([{id:'case'}],'WS-current')).values()],[current]);
  assert.equal((await local.reviewHolds([{id:'case'}],'WS-new')).size,0);
  await assert.rejects(local.reviewHolds([{id:'case'}]),/active model version/);
  const oracle=new MLRepository({backend:'oracle',driver:{},withConnection:async fn=>fn({execute:async(sql,binds)=>{
   assert.match(sql,/model_version=:modelVersion/);assert.equal(binds.modelVersion,'WS-current');assert.equal(binds.ids.val,'["case"]');
   return {rows:[{PAYLOAD:JSON.stringify(current)}]};
  }})});
  oracle.ready=Promise.resolve();
  assert.deepEqual([...(await oracle.reviewHolds([{id:'case'}],'WS-current')).values()],[current]);
 }finally{await h.close();}
});
test('a changed trigger policy requires retraining rather than silently reusing old inputs',async()=>{
 const h=await harness();try{h.store.state.policy.repeatCount++;await assert.rejects(h.service.status(),e=>e.status===503&&/policy changed/.test(e.message));}finally{await h.close();}
});


test('HTTP flag explanations use ML and unavailable models allow an unscored manual investigation',async()=>{
 const h=await harness();let server;
 try{
  h.store.mutate=async(user,cmd,context)=>{h.store.state=command(h.store.state,user,cmd,context);return h.store.state;};
  server=createPlatformServer({store:h.store,mlService:h.service});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const login=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona:'asha'})}),cookie=login.headers.get('set-cookie').split(';')[0],headers={cookie,'Content-Type':'application/json'};
  const response=await fetch(base+'/api/assistant',{method:'POST',headers,body:JSON.stringify({recordId:'MT-BLUEFIN-OK',question:'Why is this flagged?'})});assert.equal(response.status,200);const answer=await response.json();assert.match(answer.text,/review score 0.7000/);assert.equal(answer.mode,'Weakly supervised ML case explanation');
  h.service.directory=path.join(h.directory,'missing');const opened=await fetch(base+'/api/command',{method:'POST',headers,body:JSON.stringify({type:'openCase',recordId:'MT-BLUEFIN-OK',expectedRevision:0})});assert.equal(opened.status,200);assert.equal(h.store.state.cases[0].priority,'Unscored');assert.equal(h.store.state.cases[0].mlPrediction,null);
 }finally{await new Promise(resolve=>server?server.close(resolve):resolve());await h.close();}
});

import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {loadEnvFile} from 'node:process';
import {catalogue,personas,clone} from '../src/platform/catalogue.js';
import {initialState,command} from '../src/platform/domain.js';
import {MLService} from '../server/ml-service.mjs';
import {ML_DIR} from '../server/ml-worker.mjs';
import {Store,createPlatformServer} from '../server/platform.mjs';
import {MLRepository} from '../server/ml-repository.mjs';
import {proxyTarget} from '../server/ml-proxy-targets.mjs';
import {extractFeatures,FEATURE_VERSION} from '../server/ml-features.mjs';
import {runMLWorker} from '../server/ml-worker.mjs';
const getModel=async()=>{const manifest=JSON.parse(await readFile(path.join(ML_DIR,'active.json'),'utf8'));return JSON.parse(await readFile(path.join(ML_DIR,manifest.file),'utf8'));};
const model=await getModel();assert.equal(model.evaluation.accuracy,null);assert.ok(model.evaluation.scoringParityMaxError<1e-10);
const split=model.holdoutSplit,trainingIds=new Set(split.trainingRecordIds),testIds=new Set(split.testRecordIds);
assert.equal(model.evaluation.protocol,'fixed-group-holdout-1');assert.ok(split.trainingGroups.every(g=>!split.testGroups.includes(g)));
assert.ok([...trainingIds].every(id=>!testIds.has(id)));assert.ok(model.fitRecordIds.every(id=>trainingIds.has(id)));
for(const fold of model.tuningAudit)for(const id of [...fold.trainingRecordIds,...fold.validationRecordIds])assert.ok(trainingIds.has(id));
assert.equal(model.evaluation.selectedInputCount<=24,true);assert.equal(model.holdoutPredictions.length,model.evaluation.testCases);
assert.equal(new Set(model.holdoutPredictions.map(p=>p.recordId)).size,testIds.size);
for(const p of model.holdoutPredictions){assert.ok(testIds.has(p.recordId));assert.ok(split.testGroups.includes(p.group));}
const actualAgreement=model.holdoutPredictions.filter(p=>Number(p.flagged)===p.proxyTarget).length/model.holdoutPredictions.length;
assert.equal(actualAgreement,model.evaluation.holdoutEvaluation.allScoreableCases.agreement);
await mkdir('test-output',{recursive:true});const dir=await mkdtemp(path.resolve('test-output','ml-'));
let store,server;
try{
 if(process.argv.includes('--oracle')){loadEnvFile('.env');const {OracleStore}=await import('../server/oracle-store.mjs');store=await new OracleStore().init();}else store=await new Store(dir).init();
 const repository=new MLRepository(store,{directory:dir}),ml=new MLService(store,{repository});
 console.log('Checking authorized case scoring and persistence...');
 const original=JSON.stringify(store.state),first=await ml.score(personas[0]);assert.equal(first.predictions.length,store.state.records.length);assert.equal(JSON.stringify(store.state),original);
 const holds=await repository.reviewHolds(store.state.records,model.modelVersion);assert.ok([...holds.values()].every(p=>p.modelVersion===model.modelVersion));
 console.log(JSON.stringify({modelVersion:model.modelVersion,records:first.predictions.length,currentModelFlags:first.predictions.filter(p=>p.flagged===true).length,needsOfficerReview:first.predictions.filter(p=>p.reviewRequired).length,unscored:first.predictions.filter(p=>p.flagged===null).length}));
 for(const p of first.predictions){assert.equal(p.flagged,p.score===null?null:p.score>=p.threshold);assert.ok(p.score===null||Number.isFinite(p.score));}
 const blue=first.predictions.find(p=>p.recordId==='MT-BLUEFIN'),documented=first.predictions.find(p=>p.recordId==='MT-BLUEFIN-OK');assert.equal(blue.flagged,true);assert.equal(documented.flagged,false);
 if(store.backend!=='oracle'){
  const {rename}=await import('../src/platform/catalogue.js');
  const disguised=store.state.records.filter(r=>['MT-BLUEFIN','MT-BLUEFIN-OK'].includes(r.id)).map((r,i)=>extractFeatures(rename(r,'UNSEEN-NAME-'+i)));
  const predicted=await runMLWorker('score',{featureVersion:FEATURE_VERSION,rows:disguised},path.join(ML_DIR,model.modelVersion+'.json'));
  assert.deepEqual(predicted.map(p=>p.score),store.state.records.filter(r=>['MT-BLUEFIN','MT-BLUEFIN-OK'].includes(r.id)).map(r=>first.predictions.find(p=>p.recordId===r.id).score));
 }
 for(const id of ['MT-CAPITAL','MT-FD','MT-REOPEN','MT-RETAIL']){assert.equal(first.predictions.find(p=>p.recordId===id).flagged,true,id);assert.equal(first.predictions.find(p=>p.recordId===id+'-OK').flagged,false,id+'-OK');}
 const again=await ml.score(personas[0]);assert.deepEqual(again.predictions,first.predictions);
 const scoped=await ml.score(personas[2]);assert.ok(scoped.predictions.every(p=>store.state.records.find(r=>r.id===p.recordId).branch==='BBS'));await assert.rejects(ml.score(personas[2],'MT-BLUEFIN'),/Access denied/);
 server=createPlatformServer({store,mlService:ml});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/ml/predictions')).status,401);
 const login=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona:'neha'})}),cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/ml/predictions?recordId=MT-BLUEFIN',{headers:{cookie}})).status,403);
 assert.equal((await fetch(base+'/api/ml/predictions?revision=-1',{headers:{cookie}})).status,409);
 const resp=await fetch(base+'/api/ml/predictions',{headers:{cookie}});assert.equal(resp.status,200);assert.equal((await resp.json()).predictions.length,scoped.predictions.length);
 await assert.rejects(ml.recordOutcome(personas[0],{recordId:'MT-BLUEFIN',expectedRevision:store.state.revision}),/reviewer/);
 if(store.backend!=='oracle'){
  const {support}=await import('../src/platform/catalogue.js');
  const changing=store.state.records.find(r=>r.id==='MT-BLUEFIN');
  changing.transactions.forEach(t=>support(changing,t));store.state.revision++;
  const reassessed=(await ml.score(personas[0],'MT-BLUEFIN')).predictions[0];assert.equal(reassessed.flagged,false);assert.equal(reassessed.reviewRequired,true);assert.equal(reassessed.reviewHeld,true);

  store.state=command(store.state,personas[0],{type:'openCase',recordId:'MT-BLUEFIN'},{mlPrediction:first.predictions.find(p=>p.recordId==='MT-BLUEFIN')});
  store.state=command(store.state,personas[0],{type:'submit',recordId:'MT-BLUEFIN',note:'Independent documents requested and reviewed',outcome:'Explained transaction',evidenceIds:['MT-BLUEFIN-SAN']});
  const closurePrediction=(await ml.score(personas[1],'MT-BLUEFIN')).predictions[0];
  store.state=command(store.state,personas[1],{type:'approve',recordId:'MT-BLUEFIN',note:'Independent officer accepts the commercial explanation'},{mlPrediction:closurePrediction});
  assert.equal((await ml.score(personas[1],'MT-BLUEFIN')).predictions[0].reviewRequired,false);
  const label=await ml.recordOutcome(personas[1],{recordId:'MT-BLUEFIN',expectedRevision:store.state.revision});assert.equal(label.outcome,'explained');assert.equal(label.usedForTraining,false);
  assert.equal((await repository.labels('MT-BLUEFIN')).length,1);
  const reloaded=new MLRepository(store,{directory:dir});assert.equal((await reloaded.labels('MT-BLUEFIN'))[0].outcome,'explained');
 }
 if(store.backend!=='oracle')store.state.records=JSON.parse(original).records;
 console.log('Checking cold reload of saved feature snapshots and predictions...');
 const reloaded=new MLService(store,{repository:new MLRepository(store,{directory:dir})}),restart=await reloaded.score(personas[0]);assert.deepEqual(restart.predictions.map(p=>[p.recordId,p.score,p.flagged]),first.predictions.map(p=>[p.recordId,p.score,p.flagged]));
 const report={modelVersion:model.modelVersion,backend:store.backend||'file',records:first.predictions.length,flagged:first.predictions.filter(p=>p.flagged===true).length,unscored:first.predictions.filter(p=>p.flagged===null).length,evaluation:model.evaluation,checks:['score parity with scikit-learn','group isolation','no workspace mutation','branch/session authorization','stale revision rejected','prediction persistence and reload','independent officer outcomes remain separate','Bluefin initial/documented contrast','evidence reassessment retains review until officer closure']};
 await writeFile('test-output/ml-'+(store.backend||'file')+'-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await new Promise(resolve=>server?server.close(resolve):resolve());await store?.close?.();await rm(dir,{recursive:true,force:true});}

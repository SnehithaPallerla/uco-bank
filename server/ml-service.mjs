import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {authorize} from '../src/platform/domain.js';
import {localFundsGraph} from '../src/platform/funds-graph.js';
import {FEATURES,FEATURE_VERSION,extractFeatures,featureDigest,featurePolicy} from './ml-features.mjs';
import {ML_DIR,runMLWorker} from './ml-worker.mjs';
import {MLRepository} from './ml-repository.mjs';

export class MLService{
 constructor(store,{directory=ML_DIR,repository=null,worker=runMLWorker}={}){this.store=store;this.directory=directory;this.repository=repository||new MLRepository(store,{directory:store.directory?path.join(store.directory,'ml'):directory});this.worker=worker;this.featureCache=new Map();this.pending=new Map();this.predictions=new Map();}
 async artifact(){
  try{const manifest=JSON.parse(await readFile(path.join(this.directory,'active.json'),'utf8'));
   if(!/^WS-[a-f0-9]{16}\.json$/.test(manifest.file)||manifest.file!==manifest.modelVersion+'.json')throw Error('Invalid review-classifier manifest. Retrain the model.');
   const file=path.join(this.directory,manifest.file),model=JSON.parse(await readFile(file,'utf8'));
   if(featureDigest(model)!==manifest.sha256||model.modelVersion!==manifest.modelVersion||model.featureVersion!==FEATURE_VERSION)throw Error('ML artifact integrity or feature version mismatch. Retrain the model.');
   if(model.policyDigest!==featureDigest(featurePolicy(this.store.state.policy)))throw Error('Trigger policy changed. Retrain the ML classifier before using its flags.');
   return {model,file};
  }catch(e){throw Object.assign(Error(e.code==='ENOENT'?'ML model is not trained. Run npm run ml:train, then retry.':e.message),{status:503});}
 }
 summary(model){const {trainingGroups,testGroups,conflictingFeatureTargets,...evaluation}=model.evaluation;return {modelVersion:model.modelVersion,modelFamily:model.modelFamily,algorithm:model.algorithm,trainedAt:model.trainedAt,scope:model.scope,trainingSource:model.trainingSource,featureVersion:model.featureVersion,evaluation:{...evaluation,conflictingFeatureTargetGroups:conflictingFeatureTargets?.length||0}};}
 async status(){const {model}=await this.artifact();return this.summary(model);}
 async score(user,recordId=null){
  authorize(user);const records=recordId?[this.store.state.records.find(r=>r.id===recordId)]:this.store.state.records.filter(r=>user.branches.includes(r.branch));
  if(records.some(r=>!r))throw Object.assign(Error('Record unavailable'),{status:404});records.forEach(r=>authorize(user,r));
  const revision=this.store.state.revision,{model,file}=await this.artifact(),key=featureDigest({revision,model:model.modelVersion,ids:records.map(r=>r.id)});
  if(this.pending.has(key))return this.pending.get(key);
  const work=(async()=>{
   const features=[];
   const restored=typeof this.repository.loadFeatures==='function'?await this.repository.loadFeatures(records):new Map();
   for(const record of records){
    const cacheKey=featureDigest({record,policy:featurePolicy(this.store.state.policy)});let entry=this.featureCache.get(record.id);
    if(entry?.key!==cacheKey&&restored.get(record.id)?.sourceRecordDigest===cacheKey)entry={key:cacheKey,feature:restored.get(record.id)};
    if(entry?.key!==cacheKey){const graph=this.store.backend==='oracle'?await this.store.readGraph(record,user):localFundsGraph(record,revision);entry={key:cacheKey,feature:extractFeatures(record,graph,this.store.state.policy)};this.featureCache.set(record.id,entry);}
    entry.feature.sourceRecordDigest=cacheKey;this.featureCache.set(record.id,entry);
    features.push(entry.feature);
   }
   const uncached=features.filter(f=>!this.predictions.has(model.modelVersion+':'+f.recordId+':'+f.digest));
   if(uncached.length){let raw;try{raw=await this.worker('score',{featureVersion:FEATURE_VERSION,rows:uncached},file);}catch(e){throw Object.assign(e,{status:503});}
    if(this.store.state.revision!==revision)throw Object.assign(Error('Workspace changed during ML scoring. Refresh and retry.'),{status:409});
    if(!Array.isArray(raw)||raw.length!==uncached.length||raw.some((p,i)=>p.recordId!==uncached[i].recordId||p.featureDigest!==uncached[i].digest||p.modelVersion!==model.modelVersion))throw Error('ML worker returned mismatched predictions.');
    const saved=await this.repository.save(model,uncached,raw,revision);
    for(let i=0;i<uncached.length;i++)this.predictions.set(model.modelVersion+':'+uncached[i].recordId+':'+uncached[i].digest,saved[i]);
   }
   if(this.store.state.revision!==revision)throw Object.assign(Error('Workspace changed during ML scoring. Refresh and retry.'),{status:409});
   const holds=typeof this.repository.reviewHolds==='function'?await this.repository.reviewHolds(records,model.modelVersion):new Map();
   if(this.store.state.revision!==revision)throw Object.assign(Error('Workspace changed during ML scoring. Refresh and retry.'),{status:409});
   const predictions=features.map(f=>{const p=this.predictions.get(model.modelVersion+':'+f.recordId+':'+f.digest);return reviewState({...p,sourceRecordDigest:p.sourceRecordDigest||f.sourceRecordDigest},this.store.state.cases.filter(c=>c.recordId===f.recordId).at(-1),holds.get(f.recordId));});
   return {revision,model:this.summary(model),features:FEATURES.map(([key,label,group])=>({key,label,group})),predictions,storage:this.store.backend==='oracle'?'Oracle ML tables':'Local runtime/ml/history.json'};
  })();this.pending.set(key,work);try{return await work;}finally{this.pending.delete(key);}
 }
 async recordOutcome(user,{recordId,expectedRevision,...extra}){
  if(Object.keys(extra).length)throw Error('Only recordId and expectedRevision are permitted.');
  const r=this.store.state.records.find(r=>r.id===recordId);if(!r)throw Error('Record unavailable');authorize(user,r,'approve');
  if(expectedRevision!==this.store.state.revision)throw Object.assign(Error('Workspace changed. Refresh before saving the reviewed outcome.'),{status:409});
  const c=this.store.state.cases.filter(c=>c.recordId===recordId).at(-1);
  if(!c||c.status!=='Closed'||c.reviewer!==user.id||c.maker===user.id||c.submittedBy===user.id)throw Error('An independently closed case reviewed by this officer is required.');
  const outcome=c.outcome==='Refer suspected diversion'?'concern_retained':c.outcome==='Explained transaction'?'explained':'inconclusive';
  return this.repository.saveLabel({labelId:featureDigest({caseId:c.id,closedAt:c.closedAt}),recordId,investigationId:c.id,reviewer:user.id,maker:c.maker,recordedAt:new Date().toISOString(),closedAt:c.closedAt,outcome,sourceOutcome:c.outcome,note:c.history.at(-1)?.note||'',usedForTraining:false},expectedRevision);
 }
}

export function reviewState(prediction,investigation,hold){
 const closed=investigation?.status==='Closed',decision=investigation?.mlDecisionSnapshot||investigation?.mlPrediction;
 const sameClosedSnapshot=closed&&(investigation.mlDecisionSourceDigest?investigation.mlDecisionSourceDigest===prediction.sourceRecordDigest:!decision||decision.featureDigest===prediction.featureDigest);
 const priorFlag=hold&&prediction.modelVersion&&hold.modelVersion===prediction.modelVersion&&(!closed||Date.parse(hold.scoredAt)>Date.parse(investigation.closedAt));
 const active=investigation&&investigation.status!=='Closed';
 const retained=!!(active||priorFlag||prediction.flagged===true)&&!sameClosedSnapshot;
 return {...prediction,modelStatus:prediction.status,reviewRequired:retained,reviewHeld:retained&&prediction.flagged!==true,reviewReason:sameClosedSnapshot?'Officer closed this investigation':active?'Investigation remains open until officer closure':priorFlag?'Earlier flag from the current model retained pending officer decision':prediction.flagged===true?'Current classifier flag':null,
  status:sameClosedSnapshot?'Closed by officer':retained&&prediction.flagged!==true?'Review pending officer decision':prediction.status};
}

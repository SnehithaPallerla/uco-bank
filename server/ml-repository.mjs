import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {ML_DIR} from './ml-worker.mjs';
import {featureDigest} from './ml-features.mjs';
import {FEATURE_VERSION,featurePolicy} from './ml-features.mjs';

export class MLRepository{
 constructor(store,{directory=ML_DIR}={}){this.store=store;this.directory=directory;this.tail=Promise.resolve();this.ready=null;}
 async init(){
  if(!this.ready)this.ready=(async()=>{
   if(this.store.backend==='oracle')await this.store.withConnection(async c=>{
    const sql=await readFile(new URL('../oracle/09_ml_tables.sql',import.meta.url),'utf8');
    for(const statement of sql.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))try{await c.execute(statement);}catch(e){if(e.errorNum!==955)throw e;}
   });else{await mkdir(this.directory,{recursive:true});try{this.data=JSON.parse(await readFile(path.join(this.directory,'history.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.data={models:{},features:{},predictions:{},labels:[]};}}
  })().catch(e=>{this.ready=null;throw e;});
  await this.ready;
 }
 enqueue(fn){const work=this.tail.then(fn);this.tail=work.catch(()=>{});return work;}
 async persistFile(){const file=path.join(this.directory,'history.json');await writeFile(file+'.tmp',JSON.stringify(this.data));await rename(file+'.tmp',file);}
 async loadFeatures(records){
  await this.init();const ids=new Set(records.map(r=>r.id)),digests=new Map(records.map(r=>[r.id,featureDigest({record:r,policy:featurePolicy(this.store.state.policy)})]));let rows;
  if(this.store.backend==='oracle')rows=await this.store.withConnection(async c=>(await c.execute(`SELECT payload FROM uco_ml_feature WHERE feature_version=:version AND case_id IN (SELECT id FROM JSON_TABLE(:ids, '$[*]' COLUMNS (id VARCHAR2(120) PATH '$')))`,{version:FEATURE_VERSION,ids:{val:JSON.stringify([...ids]),type:this.store.driver.CLOB}},{outFormat:this.store.driver.OUT_FORMAT_OBJECT,fetchInfo:{PAYLOAD:{type:this.store.driver.STRING}}})).rows.map(row=>JSON.parse(row.PAYLOAD)));
  else rows=Object.values(this.data.features);
  return new Map(rows.filter(f=>ids.has(f.recordId)&&f.featureVersion===FEATURE_VERSION&&f.sourceRecordDigest===digests.get(f.recordId)).map(f=>[f.recordId,f]));
 }
 async reviewHolds(records,modelVersion){
  if(!modelVersion)throw Error('An active model version is required for review holds.');
  await this.init();const ids=new Set(records.map(r=>r.id));let rows;
  if(this.store.backend==='oracle')rows=await this.store.withConnection(async c=>(await c.execute(`SELECT payload FROM uco_ml_prediction WHERE model_version=:modelVersion AND flagged=1 AND JSON_VALUE(payload, '$.modelFamily')='weak-supervised-review' AND case_id IN (SELECT id FROM JSON_TABLE(:ids, '$[*]' COLUMNS (id VARCHAR2(120) PATH '$')))`,{modelVersion,ids:{val:JSON.stringify([...ids]),type:this.store.driver.CLOB}},{outFormat:this.store.driver.OUT_FORMAT_OBJECT,fetchInfo:{PAYLOAD:{type:this.store.driver.STRING}}})).rows.map(row=>JSON.parse(row.PAYLOAD)));
  else rows=Object.values(this.data.predictions).filter(p=>ids.has(p.recordId)&&p.flagged===true&&p.modelFamily==='weak-supervised-review'&&p.modelVersion===modelVersion);
  const result=new Map();for(const p of rows)if(!result.has(p.recordId)||Date.parse(p.scoredAt)>Date.parse(result.get(p.recordId).scoredAt))result.set(p.recordId,p);return result;
 }
 async save(model,features,predictions,revision){return this.enqueue(async()=>{
  await this.init();const at=new Date().toISOString(),artifactHash=featureDigest(model);
  const entries=features.map((feature,i)=>{const snapshotId=featureDigest({recordId:feature.recordId,digest:feature.digest,sourceRecordDigest:feature.sourceRecordDigest}),prediction=predictions[i];return {feature,snapshotId,prediction:{...prediction,predictionId:featureDigest({snapshotId,modelVersion:model.modelVersion}),snapshotId,sourceRecordDigest:feature.sourceRecordDigest,scoredAt:at,assessmentCutoff:feature.cutoff,sourceRevision:revision,graphSource:feature.graphSource,featureVersion:feature.featureVersion,directOutflowInr:feature.directOutflowInr}};});
  if(this.store.backend==='oracle')await this.store.withConnection(async c=>{
   const driver=this.store.driver,clob=value=>({val:JSON.stringify(value),type:driver.CLOB});
   try{
    const result=await c.execute('SELECT revision FROM uco_workspace_payload WHERE workspace_key = :key FOR UPDATE',{key:'CURRENT'},{outFormat:driver.OUT_FORMAT_OBJECT});
    if(Number(result.rows?.[0]?.REVISION)!==revision)throw Object.assign(Error('Workspace changed during ML scoring. Refresh and retry.'),{status:409});
    await c.execute(`MERGE INTO uco_ml_model t USING (SELECT :id id FROM dual) s ON (t.model_version=s.id) WHEN NOT MATCHED THEN INSERT (model_version,trained_at,artifact_hash,payload) VALUES (:id,:at,:hash,:payload)`,{id:model.modelVersion,at:model.trainedAt,hash:artifactHash,payload:clob(model)});
    const string=size=>({type:driver.STRING,maxSize:size});
    await c.executeMany(`MERGE INTO uco_ml_feature t USING (SELECT :id id FROM dual) s ON (t.snapshot_id=s.id) WHEN NOT MATCHED THEN INSERT (snapshot_id,case_id,feature_version,captured_at,payload) VALUES (:id,:case_id,:version,:at,:payload)`,entries.map(entry=>({id:entry.snapshotId,case_id:entry.feature.recordId,version:entry.feature.featureVersion,at,payload:JSON.stringify(entry.feature)})),{bindDefs:{id:string(64),case_id:string(120),version:string(80),at:string(50),payload:{type:driver.CLOB}}});
    await c.executeMany(`MERGE INTO uco_ml_prediction t USING (SELECT :id id FROM dual) s ON (t.prediction_id=s.id) WHEN NOT MATCHED THEN INSERT (prediction_id,case_id,model_version,snapshot_id,scored_at,flagged,payload) VALUES (:id,:case_id,:model,:snapshot,:at,:flagged,:payload)`,entries.map(entry=>({id:entry.prediction.predictionId,case_id:entry.feature.recordId,model:model.modelVersion,snapshot:entry.snapshotId,at,flagged:entry.prediction.flagged===null?null:Number(entry.prediction.flagged),payload:JSON.stringify(entry.prediction)})),{bindDefs:{id:string(64),case_id:string(120),model:string(80),snapshot:string(64),at:string(50),flagged:{type:driver.NUMBER},payload:{type:driver.CLOB}}});
    const persisted=await c.execute(`SELECT payload FROM uco_ml_prediction WHERE prediction_id IN (SELECT id FROM JSON_TABLE(:ids, '$[*]' COLUMNS (id VARCHAR2(64) PATH '$')))`,{ids:clob(entries.map(e=>e.prediction.predictionId))},{outFormat:driver.OUT_FORMAT_OBJECT,fetchInfo:{PAYLOAD:{type:driver.STRING}}});
    const byId=new Map(persisted.rows.map(row=>{const p=JSON.parse(row.PAYLOAD);return [p.predictionId,p];}));
    for(const entry of entries){if(!byId.has(entry.prediction.predictionId))throw Error('Saved ML prediction could not be read back.');entry.prediction=byId.get(entry.prediction.predictionId);}
    await c.commit();
   }catch(e){await c.rollback();throw e;}
  });else{
   this.data.models[model.modelVersion]=model;
   for(const e of entries){this.data.features[e.snapshotId]??=e.feature;this.data.predictions[e.prediction.predictionId]??=e.prediction;e.prediction=this.data.predictions[e.prediction.predictionId];}
   await this.persistFile();
  }
  return entries.map(e=>e.prediction);
 });}
 async labels(recordId){await this.init();if(this.store.backend!=='oracle')return this.data.labels.filter(x=>x.recordId===recordId);
  return this.store.withConnection(async c=>(await c.execute('SELECT payload FROM uco_ml_label WHERE case_id=:id ORDER BY recorded_at',{id:recordId},{outFormat:this.store.driver.OUT_FORMAT_OBJECT,fetchInfo:{PAYLOAD:{type:this.store.driver.STRING}}})).rows.map(row=>JSON.parse(row.PAYLOAD)));
 }
 async saveLabel(label,revision){return this.enqueue(async()=>{await this.init();if(this.store.state.revision!==revision)throw Object.assign(Error('Workspace changed before saving the reviewed outcome.'),{status:409});if(this.store.backend!=='oracle'){if(!this.data.labels.some(x=>x.labelId===label.labelId)){this.data.labels.push(label);await this.persistFile();}return this.data.labels.find(x=>x.labelId===label.labelId);}
  return this.store.withConnection(async c=>{try{
   const current=await c.execute('SELECT revision FROM uco_workspace_payload WHERE workspace_key = :key FOR UPDATE',{key:'CURRENT'},{outFormat:this.store.driver.OUT_FORMAT_OBJECT});
   if(Number(current.rows?.[0]?.REVISION)!==revision)throw Object.assign(Error('Workspace changed before saving the reviewed outcome.'),{status:409});
   await c.execute(`MERGE INTO uco_ml_label t USING (SELECT :id id FROM dual) s ON (t.label_id=s.id) WHEN NOT MATCHED THEN INSERT (label_id,case_id,reviewer_id,recorded_at,outcome,payload) VALUES (:id,:case_id,:reviewer,:at,:outcome,:payload)`,{id:label.labelId,case_id:label.recordId,reviewer:label.reviewer,at:label.recordedAt,outcome:label.outcome,payload:{val:JSON.stringify(label),type:this.store.driver.CLOB}});await c.commit();return label;}catch(e){await c.rollback();throw e;}});
 });}
}

import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogue} from '../src/platform/catalogue.js';
import {localFundsGraph} from '../src/platform/funds-graph.js';
import {extractFeatures,FEATURE_VERSION,FEATURES,featureDigest,featurePolicy} from '../server/ml-features.mjs';
import {proxyTarget,TARGET_MAPPING} from '../server/ml-proxy-targets.mjs';
import {runMLWorker,ML_DIR} from '../server/ml-worker.mjs';

// Group identical payment structures and authored comparator families together.
// These identifiers are split metadata, never predictive features.
export function trainingGroups(records){
 const parent=new Map(records.map(r=>[r.id,r.id])),find=id=>parent.get(id)===id?id:find(parent.get(id));
 const join=(a,b)=>{if(parent.has(a)&&parent.has(b))parent.set(find(a),find(b));};
 const signatures=new Map(),families=new Map();
 for(const r of records){
  const sig=featureDigest({loan:r.facility.loanType,transactions:r.transactions.map(t=>({amount:t.amountInr,from:t.from===r.borrower.id?'borrower':'other',to:t.to===r.borrower.id?'borrower':'other',kind:t.kind})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))});
  if(signatures.has(sig))join(r.id,signatures.get(sig));else signatures.set(sig,r.id);
  if(r.family){if(families.has(r.family))join(r.id,families.get(r.family));else families.set(r.family,r.id);}
  if(r.comparatorOf)join(r.id,r.comparatorOf);
 }
 return Object.fromEntries(records.map(r=>[r.id,find(r.id)]));
}
export async function trainML({records,graphs=null,features=null,policy,source='Generated project catalogue (101 synthetic scenarios)'}={}){
 policy=featurePolicy(policy);
 records=[...(records??catalogue())].sort((a,b)=>a.id.localeCompare(b.id,'en'));const groups=trainingGroups(records),rows=records.map(r=>({...features?.get(r.id)||extractFeatures(r,graphs?.get(r.id)||localFundsGraph(r),policy),group:groups[r.id],target:proxyTarget(r,policy)}));
 const input={featureVersion:FEATURE_VERSION,policyDigest:featureDigest(policy),keys:FEATURES.map(x=>x[0]),rows,source,targetMapping:TARGET_MAPPING};
 await mkdir(ML_DIR,{recursive:true});const splitFile=path.join(ML_DIR,'holdout-split.json');let holdoutSplit;
 try{holdoutSplit=JSON.parse(await readFile(splitFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;holdoutSplit=await runMLWorker('split',input);await writeFile(splitFile,JSON.stringify(holdoutSplit,null,2),{flag:'wx'});}
 let model=await runMLWorker('train',{...input,holdoutSplit});
 await mkdir(ML_DIR,{recursive:true});const file=path.join(ML_DIR,model.modelVersion+'.json');
 try{const existing=JSON.parse(await readFile(file,'utf8'));if(existing.modelVersion===model.modelVersion)model=existing;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!existsSync(file)){await writeFile(file+'.tmp',JSON.stringify(model));await rename(file+'.tmp',file);}
 const predictions=await runMLWorker('score',{featureVersion:FEATURE_VERSION,rows:rows.map(({target,group,...row})=>row)},file);
 if(model.evaluation.protocol!=='fixed-group-holdout-1'||model.evaluation.scoringParityMaxError>1e-10||model.fitRecordIds.some(id=>holdoutSplit.testRecordIds.includes(id)))throw Error('Training isolation or inference parity check failed. Previous active model retained.');
 // Held-out outcomes are reported, never used as an activation gate or a reason to retry a split.
 const manifest={modelVersion:model.modelVersion,file:path.basename(file),sha256:featureDigest(model),featureVersion:FEATURE_VERSION};
 try{await writeFile(path.join(ML_DIR,'previous-active.json'),await readFile(path.join(ML_DIR,'active.json')));}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(path.join(ML_DIR,'active.json.tmp'),JSON.stringify(manifest));await rename(path.join(ML_DIR,'active.json.tmp'),path.join(ML_DIR,'active.json'));
 const report={...model.evaluation,modelVersion:model.modelVersion,flagged:predictions.filter(p=>p.flagged===true).length,notFlagged:predictions.filter(p=>p.flagged===false).length,unable:predictions.filter(p=>p.flagged===null).length,
  holdoutPredictions:model.holdoutPredictions,byPeer:Object.fromEntries([...new Set(rows.map(r=>r.peer))].map(peer=>[peer,{total:rows.filter(r=>r.peer===peer).length,flagged:predictions.filter(p=>p.peer===peer&&p.flagged===true).length}])),predictions};
 await writeFile(path.join(ML_DIR,'evaluation.json'),JSON.stringify(report,null,2));
 return {model,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let store;
 try{
  let records,graphs,features,source,policy;
  if(process.argv.includes('--oracle')){
   if(existsSync('.env'))loadEnvFile('.env');
   const {OracleStore}=await import('../server/oracle-store.mjs');const {personas}=await import('../src/platform/catalogue.js');
   store=await new OracleStore().init();records=store.state.records;policy=store.state.policy;graphs=new Map();
   const {MLRepository}=await import('../server/ml-repository.mjs');features=await new MLRepository(store).loadFeatures(records);
   for(const r of records)if(!features.has(r.id))graphs.set(r.id,await store.readGraph(r,personas.find(p=>p.role==='Administrator'&&p.branches.includes(r.branch))));
   source='Current Oracle case payloads and UCO_FLOW; synthetic demonstration data';
  }
  const {model,report}=await trainML({records,graphs,features,source,policy});
  console.log(JSON.stringify({modelVersion:model.modelVersion,algorithm:model.algorithm,specification:model.evaluation.selected.specification,sourceCases:report.sourceRows,scoreableCases:report.eligibleRows,trainingCases:report.trainingCases,testCases:report.testCases,distinctTrainingExamples:report.trainingRows,distinctTestExamples:report.testRows,selectedInputs:report.selectedInputCount,testAgreement:report.holdoutEvaluation.allScoreableCases,uniqueTestAgreement:report.holdoutEvaluation.uniqueRows,trainingAgreement:report.trainingFit.allScoreableCases,flagged:report.flagged,notFlagged:report.notFlagged,unscored:report.unable},null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}finally{await store?.close();}
}

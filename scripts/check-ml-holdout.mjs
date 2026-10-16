import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {catalogue} from '../src/platform/catalogue.js';
import {trainingGroups} from './train-ml.mjs';
import {extractFeatures,FEATURES,FEATURE_VERSION,featureDigest,featurePolicy} from '../server/ml-features.mjs';
import {proxyTarget,TARGET_MAPPING} from '../server/ml-proxy-targets.mjs';
import {ML_DIR,runMLWorker} from '../server/ml-worker.mjs';

const splitText=await readFile(path.join(ML_DIR,'holdout-split.json'),'utf8'),split=JSON.parse(splitText);
const records=catalogue().sort((a,b)=>a.id.localeCompare(b.id,'en')),groups=trainingGroups(records);
const rows=records.map(r=>({...extractFeatures(r),group:groups[r.id],target:proxyTarget(r)}));
const input={rows,keys:FEATURES.map(([key])=>key),featureVersion:FEATURE_VERSION,policyDigest:featureDigest(featurePolicy()),targetMapping:TARGET_MAPPING,source:'Isolation verification',holdoutSplit:split};
const original=await runMLWorker('train',input),testIds=new Set(split.testRecordIds),trainIds=new Set(split.trainingRecordIds);
const manifest=JSON.parse(await readFile(path.join(ML_DIR,'active.json'),'utf8'));
const deployed=JSON.parse(await readFile(path.join(ML_DIR,manifest.file),'utf8'));
assert.equal(original.modelVersion,deployed.modelVersion);
assert.deepEqual(original.bundle,deployed.bundle);
assert.deepEqual(original.fitRecordIds,deployed.fitRecordIds);
assert.ok(original.fitRecordIds.length>0&&original.fitRecordIds.every(id=>trainIds.has(id)&&!testIds.has(id)));
assert.ok(original.trainingTargets.every(r=>trainIds.has(r.recordId)));
for(const fold of original.tuningAudit){
 const fit=new Set(fold.trainingRecordIds),valid=new Set(fold.validationRecordIds);
 assert.ok([...fit,...valid].every(id=>trainIds.has(id)&&!testIds.has(id)));
 assert.ok([...fit].every(id=>!valid.has(id)));
}
// Flipping every test answer must change reported test accuracy, never deployed weights or selection.
const altered=structuredClone(input);
for(const row of altered.rows)if(testIds.has(row.recordId))row.target.label=1-row.target.label;
const flipped=await runMLWorker('train',altered);
assert.deepEqual(flipped.bundle,original.bundle);
assert.deepEqual(flipped.evaluation.selected,original.evaluation.selected);
assert.equal(flipped.modelVersion,original.modelVersion);
assert.ok(Math.abs(flipped.evaluation.holdoutEvaluation.allScoreableCases.agreement+original.evaluation.holdoutEvaluation.allScoreableCases.agreement-1)<1e-12);
// Verify every imputation median and reference baseline against actual distinct training rows only.
const fitRows=original.fitRecordIds.map(id=>rows.find(r=>r.recordId===id));
const quantile=(a,q)=>{const x=[...a].sort((a,b)=>a-b),i=(x.length-1)*q,k=Math.floor(i);return x[k]+(x[Math.ceil(i)]-x[k])*(i-k);};
for(const [i,key] of input.keys.entries()){
 const values=fitRows.map(r=>r.values[key]).filter(v=>v!==null);
 const transformed=values.map(v=>Math.sign(v)*Math.log1p(Math.abs(v)));
 assert.ok(Math.abs(original.bundle.preprocessing.median[i]-(transformed.length?quantile(transformed,.5):0))<1e-12,key);
 const baseline=original.bundle.referenceBaseline[key];
 assert.equal(baseline.median,values.length?quantile(values,.5):null,key);
 const full=fitRows.map(r=>r.values[key]===null?original.bundle.preprocessing.median[i]:Math.sign(r.values[key])*Math.log1p(Math.abs(r.values[key])));
 assert.ok(Math.abs(original.bundle.preprocessing.mean[i]-full.reduce((a,b)=>a+b,0)/full.length)<1e-12,key);
}
const changed=structuredClone(input);changed.rows.find(r=>testIds.has(r.recordId)).values.payment_count+=1;
await assert.rejects(runMLWorker('train',changed),/Frozen holdout does not match/);
const overlap=structuredClone(input);overlap.holdoutSplit.trainingGroups.push(split.testGroups[0]);
await assert.rejects(runMLWorker('train',overlap),/overlapping holdout/);
assert.equal(await readFile(path.join(ML_DIR,'holdout-split.json'),'utf8'),splitText);
console.log('PASS: frozen grouped partition, training-only preprocessing/tuning/fitting, unchanged model after test-label flips, and rejection of changed or overlapping splits.');

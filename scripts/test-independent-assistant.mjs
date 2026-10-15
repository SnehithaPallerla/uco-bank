import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {createHash} from 'node:crypto';
import {independentAnswer,assistantPacket,RULEBOOK} from '../server/oci-assistant.mjs';
import {initialState,assess} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';
import {MODEL_EXPECTATIONS} from '../src/platform/assistant/evaluation.js';
if(existsSync('.env'))loadEnvFile('.env');
const live=process.argv.includes('--live');
if(!live){console.log('Run with --live to make 40 chargeable OCI requests (20 cases, twice). No requests made.');process.exit(0);}
const source=process.env.UCO_STATE_DIR?process.env.UCO_STATE_DIR+'/state.json':'runtime/state.json';
const state=existsSync(source)?JSON.parse(await readFile(source,'utf8')):initialState();
const question='Independently apply all supplied rules. What is the exact outcome and unique loan-linked amount requiring review? Explain the applicable rules, supporting evidence, legitimate explanations and any data contradictions.';
const conflicting=new Set(['LAB-015','LAB-016','LAB-018','LAB-019']);
const key=rows=>rows.map(f=>({rule:f.rule,transactionIds:[...f.transactionIds].sort(),amountInr:f.amountInr})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const signature=a=>JSON.stringify({outcome:a.outcome,reviewInr:a.reviewInr,findings:key(a.findings),gaps:key(a.gaps),contexts:key(a.contexts)});
const report={createdAt:new Date().toISOString(),model:process.env.OCI_MODEL_ID,region:process.env.OCI_REGION,promptVersion:'uco-independent-rules-v1',question,repetitions:2,total:40,status:'Running',rulebookDigest:createHash('sha256').update(RULEBOOK).digest('hex'),rows:[],gate:'All clean-case outputs must be valid and match exact coded outcomes, review amounts and finding/gap/context rules on both runs; identical structured results across runs.',limitations:['Four known conflicting-input cases excluded from activation gate, reported separately.','These are generated scenarios, not independent bank labels.','Automatic rule/amount checks do not verify every natural-language statement or citation entailment.']};
await mkdir('test-output',{recursive:true});const target='test-output/independent-assistant-report.json';
console.log('Starting 40 OCI calls; no computed assessments or answer keys are sent to OCI.');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const expected of MODEL_EXPECTATIONS){const r=state.records.find(r=>r.id===expected.recordId),baseline=assess(r,state.policy);
 for(let repeat=1;repeat<=2;repeat++){
  const row={recordId:r.id,repeat,conflictingInput:conflicting.has(r.id),packet:assistantPacket(r,state.policy),baseline:{outcome:baseline.outcome,reviewInr:baseline.reviewInr,findings:key(baseline.findings),gaps:key(baseline.gaps),contexts:key(baseline.contexts)}};
  if(report.rows.length){console.log('Waiting 30 seconds before the next provider request.');await pause(30000);}
  try{
   for(let attempt=1;attempt<=3;attempt++){
    try{row.result=await independentAnswer(r,personas[0],question,state.policy);break;}
    catch(e){if(e.providerStatus!==429||attempt===3)throw e;row.throttleRetries=(row.throttleRetries||0)+1;console.log(`${r.id}: throttled; waiting 60 seconds before retry.`);await pause(60000);}
   }
   const a=row.result.assessment;
   row.checks={outcome:a.outcome===baseline.outcome,reviewAmount:a.reviewInr===baseline.reviewInr,findings:JSON.stringify(key(a.findings))===JSON.stringify(key(baseline.findings)),gaps:JSON.stringify(key(a.gaps))===JSON.stringify(key(baseline.gaps)),contexts:JSON.stringify(key(a.contexts))===JSON.stringify(key(baseline.contexts)),citationsValid:true};row.pass=Object.values(row.checks).every(Boolean);
  }catch(e){row.error=e.message;if(e.providerStatus)row.providerStatus=e.providerStatus;if(e.diagnostic)row.diagnostic=e.diagnostic;row.pass=false;}
  report.rows.push(row);await writeFile(target,JSON.stringify(report,null,2));console.log(`${r.id} run ${repeat}: ${row.error||`${row.result.assessment.outcome}; amount ${row.result.assessment.reviewInr}; exact checks ${row.pass}`}`);
 }
}
const clean=report.rows.filter(r=>!r.conflictingInput),valid=clean.filter(r=>r.result);
const unstable=MODEL_EXPECTATIONS.filter(e=>!conflicting.has(e.recordId)).map(e=>({id:e.recordId,rows:clean.filter(r=>r.recordId===e.recordId)})).filter(x=>x.rows.length!==2||x.rows.some(r=>!r.result)||signature(x.rows[0].result.assessment)!==signature(x.rows[1].result.assessment)).map(x=>x.id);
report.summary={requests:report.rows.length,accepted:report.rows.filter(r=>r.result).length,errors:report.rows.filter(r=>r.error).length,cleanRequests:clean.length,cleanAccepted:valid.length,cleanOutcomeMatches:valid.filter(r=>r.checks.outcome).length,cleanAmountMatches:valid.filter(r=>r.checks.reviewAmount).length,cleanAllChecksPassed:clean.filter(r=>r.pass).length,cleanCasesConsistent:16-unstable.length,unstableOrRejectedCases:unstable,conflictingRequestsPassed:report.rows.filter(r=>r.conflictingInput&&r.pass).length};
report.recommendOCI=clean.length===32&&clean.every(r=>r.pass)&&unstable.length===0;
report.status='Completed';report.finishedAt=new Date().toISOString();await writeFile(target,JSON.stringify(report,null,2));console.log(JSON.stringify({summary:report.summary,recommendOCI:report.recommendOCI,report:target},null,2));

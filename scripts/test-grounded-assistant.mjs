import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {groundedAnswer,groundedPacket,GROUNDED_VERSION} from '../server/oci-grounded-assistant.mjs';
import {initialState} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';
import {MODEL_EXPECTATIONS} from '../src/platform/assistant/evaluation.js';
if(existsSync('.env'))loadEnvFile('.env');
if(!process.argv.includes('--live')){console.log('Use --live for 26 chargeable requests: 20 cases plus six repeat checks.');process.exit(0);}
const s=existsSync('runtime/state.json')?JSON.parse(await readFile('runtime/state.json','utf8')):initialState();
const question='Explain the current assessment and amount requiring review. What evidence supports it, what legitimate explanation exists, and what should the officer check next?';
const plan=[...MODEL_EXPECTATIONS,...MODEL_EXPECTATIONS.filter(e=>e.pack==='quick')],conflicts=new Set(['LAB-015','LAB-016','LAB-018','LAB-019']);
const report={version:GROUNDED_VERSION,model:process.env.OCI_MODEL_ID,createdAt:new Date().toISOString(),status:'Running',total:plan.length,question,rows:[],activation:'Requires complete valid clean-case responses and human review; never activates automatically.'};
const file='test-output/grounded-assistant-report.json';await mkdir('test-output',{recursive:true});const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const expected of plan){const r=s.records.find(r=>r.id===expected.recordId),packet=groundedPacket(r,s.policy),repeat=report.rows.filter(x=>x.recordId===r.id).length+1;
 const row={recordId:r.id,repeat,conflictingInput:conflicts.has(r.id),question,packet,expectedFocus:expected.focus};
 if(report.rows.length){console.log('Waiting 20 seconds before next request.');await pause(20000);}
 try{for(let attempt=1;attempt<=3;attempt++){try{row.result=await groundedAnswer(r,personas[0],question,s.policy);break;}catch(e){if(e.providerStatus!==429||attempt===3)throw e;row.throttleRetries=(row.throttleRetries||0)+1;console.log(r.id+': throttled; waiting 60 seconds.');await pause(60000);}}
  const text=row.result.text.toLowerCase();row.checks={outcome:row.result.assessment.outcome===packet.ruleResult.outcome,reviewAmount:row.result.assessment.reviewInr===packet.ruleResult.reviewInr,citationsValid:true,topics:expected.concepts.map(c=>({name:c.name,mentioned:c.terms.some(t=>text.includes(t.toLowerCase()))}))};row.pass=row.checks.outcome&&row.checks.reviewAmount&&row.checks.topics.every(c=>c.mentioned);
 }catch(e){row.error=e.message;row.providerStatus=e.providerStatus;if(e.diagnostic)row.diagnostic=e.diagnostic;row.pass=false;}
 report.rows.push(row);await writeFile(file,JSON.stringify(report,null,2));console.log(`${r.id} run ${repeat}: ${row.error||'valid answer; topic checks '+row.pass}`);
}
const clean=report.rows.filter(r=>!r.conflictingInput),accepted=clean.filter(r=>r.result);
report.summary={requests:report.rows.length,accepted:report.rows.filter(r=>r.result).length,errors:report.rows.filter(r=>r.error).length,cleanRequests:clean.length,cleanAccepted:accepted.length,cleanAllChecksPassed:clean.filter(r=>r.pass).length,conflictingRequests:report.rows.filter(r=>r.conflictingInput).length,providerThrottles:report.rows.filter(r=>r.providerStatus===429).length};
report.repeatChecks=MODEL_EXPECTATIONS.filter(e=>e.pack==='quick').map(e=>{const rows=report.rows.filter(r=>r.recordId===e.recordId);return {recordId:e.recordId,bothAccepted:rows.length===2&&rows.every(r=>r.result),bothTopicChecksPassed:rows.every(r=>r.pass)};});
report.status='Completed';report.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify({summary:report.summary,repeatChecks:report.repeatChecks,report:file},null,2));

import {readFile,writeFile,mkdir} from 'node:fs/promises';import {existsSync} from 'node:fs';import {loadEnvFile} from 'node:process';
import {initialState} from '../src/platform/domain.js';import {personas} from '../src/platform/catalogue.js';
import {verifiedAnswer,verifiedPacket} from '../server/oci-verified-assistant.mjs';
if(existsSync('.env'))loadEnvFile('.env');if(!process.argv.includes('--live')){console.log('Use --live for 28 OCI requests: 20 scenarios and eight intent/boundary checks.');process.exit(0);}
const s=existsSync('runtime/state.json')?JSON.parse(await readFile('runtime/state.json','utf8')):initialState();
const topics=['assessment','assessment','purpose','assessment','identity','missing','assessment','assessment','assessment','assessment','next','relationships','flows','flows','assessment','assessment','assessment','flows','missing','assessment'];
const qs={assessment:'Explain the current assessment and the reasons for it.',purpose:'Which uses does this loan allow?',identity:'Do we know the legal identity of the person or business receiving the money?',missing:'Which supporting records do we still need?',next:'What should I check next?',relationships:'How are these parties connected?',flows:'Show where the money went and what came back.'};
const plan=topics.map((topic,i)=>({id:'LAB-'+String(i+1).padStart(3,'0'),question:qs[topic],expectedTopic:topic}));
plan.push(...[
 ['LAB-001','Has this firm received payments from us before?','history'],['LAB-005','Is this recipient an individual, proprietor or company?','identity'],
 ['LAB-002','What does the sanction permit?','purpose'],['LAB-014','Does the circular pattern prove fraud?','fraud'],
 ['MT-BLUEFIN','What does the company research show?','research'],['LAB-001','Are you connected to Finacle or Oracle Database?','status'],
 ['LAB-001','What is the capital of France?','unsupported'],['LAB-001','Close this case and freeze the account now.','unsupported']
].map(([id,question,expectedTopic])=>({id,question,expectedTopic})));
const report={version:'uco-verified-chat-v1',createdAt:new Date().toISOString(),model:process.env.OCI_MODEL_ID,status:'Running',rows:[]};const target='test-output/verified-assistant-report.json';await mkdir('test-output',{recursive:true});
for(const item of plan){if(report.rows.length)await new Promise(r=>setTimeout(r,20000));const r=s.records.find(r=>r.id===item.id),row={...item,packet:verifiedPacket(r,personas[0],s.policy)};
 try{for(let attempt=1;attempt<=3;attempt++){try{row.result=await verifiedAnswer(r,personas[0],item.question,s.policy);break;}catch(e){if(e.providerStatus!==429||attempt===3)throw e;row.throttleRetries=(row.throttleRetries||0)+1;console.log(item.id+': throttled; waiting 60 seconds.');await new Promise(r=>setTimeout(r,60000));}}
 row.correctTopic=row.result.plan.topic===item.expectedTopic;row.pass=row.correctTopic&&row.result.assessment.outcome===row.packet.outcome&&row.result.assessment.reviewInr===row.packet.reviewInr;
 }catch(e){row.error=e.message;row.providerStatus=e.providerStatus;if(e.diagnostic)row.diagnostic=e.diagnostic;row.pass=false;}
 report.rows.push(row);await writeFile(target,JSON.stringify(report,null,2));console.log(item.id+' / '+item.expectedTopic+': '+(row.error||'topic '+row.result.plan.topic+'; pass '+row.pass));
}
report.status='Completed';report.summary={requests:report.rows.length,accepted:report.rows.filter(r=>r.result).length,passed:report.rows.filter(r=>r.pass).length,wrongTopic:report.rows.filter(r=>r.result&&!r.correctTopic).length,rejected:report.rows.filter(r=>r.error).length,throttled:report.rows.filter(r=>r.providerStatus===429).length};report.finishedAt=new Date().toISOString();await writeFile(target,JSON.stringify(report,null,2));console.log(JSON.stringify({summary:report.summary,report:target}));

import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {initialState,assess} from '../src/platform/domain.js';
import {MODEL_EXPECTATIONS,preparedEvaluation} from '../src/platform/assistant/evaluation.js';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const ids=option('--cases')?.split(',')||MODEL_EXPECTATIONS.filter(e=>e.pack==='quick').map(e=>e.recordId);
const repeats=Number(option('--repeats')||1),live=args.includes('--live');let report;
if(!live){const s=initialState();report=preparedEvaluation(s.records,s.policy,ids,assess);}
else{
 const base=process.env.UCO_DEMO_URL||'http://localhost:4173';
 const login=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona:'asha'})});if(!login.ok)throw Error('Start the demo server first.');
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const request=async(url,body)=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
 console.log('Starting live OCI test:',ids.length*repeats,'chargeable model requests.');
 report=(await request('/api/assistant/evaluation',{recordIds:ids,repeats})).job;
 let printed=-1;
 while(report.status==='Running'){
  if(report.rows.length!==printed){console.log('Completed',report.rows.length,'of',report.total,'·',report.currentRecordId||'starting');printed=report.rows.length;}
  await new Promise(resolve=>setTimeout(resolve,1500));report=(await request('/api/assistant/evaluation/'+report.id)).job;
 }
}
const target=option('--output')||path.join('test-output',live?'model-test-live.json':'model-test-prepared.json');await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(report,null,2));
console.log(JSON.stringify({mode:report.mode,status:report.status,totals:report.totals,report:target,limitations:report.limitations},null,2));
if(report.status!=='Completed'||report.totals.errors)process.exitCode=1;

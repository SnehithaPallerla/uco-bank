import {randomUUID} from 'node:crypto';
import {assess,authorize} from '../src/platform/domain.js';
import {validationPacket} from '../src/platform/assistant/validation.js';
import {MODEL_EXPECTATIONS,evaluateReview,evaluationTotals,MODEL_TEST_LIMITATION} from '../src/platform/assistant/evaluation.js';

export class ModelEvaluation{
 constructor({store,validate,config}){this.store=store;this.validate=validate;this.config=config;this.jobs=new Map();}
 list(user){return [...this.jobs.values()].filter(j=>j.userId===user.id).reverse().map(j=>structuredClone(j));}
 read(user,id){const job=this.jobs.get(id);if(!job||job.userId!==user.id)throw Object.assign(Error('Test run unavailable.'),{status:404});return structuredClone(job);}
 start(user,input){
  if(Object.keys(input).some(k=>!['recordIds','repeats'].includes(k)))throw Error('Select test cases and a repetition count only.');
  const ids=input.recordIds,repeats=input.repeats??1;
  if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length||![1,2].includes(repeats))throw Error('Select 1 to 20 distinct sample cases and one or two repetitions.');
  for(const id of ids){if(!MODEL_EXPECTATIONS.some(e=>e.recordId===id))throw Error('Only model-test samples are permitted.');const r=this.store.state.records.find(r=>r.id===id);if(!r)throw Error('Sample record unavailable.');authorize(user,r,'write');}
  if(!this.config().configured)throw Object.assign(Error('Configure OCI before starting a live model test.'),{status:503});
  if([...this.jobs.values()].some(j=>j.status==='Running'))throw Object.assign(Error('A model test is already running. Wait for it or stop it first.'),{status:409});
  while(this.jobs.size>=8)this.jobs.delete(this.jobs.keys().next().value);
  const job={id:'EVAL-'+randomUUID(),userId:user.id,mode:'Live OCI model test',status:'Running',recordIds:ids,repeats,total:ids.length*repeats,createdAt:new Date().toISOString(),rows:[],totals:evaluationTotals([]),limitations:MODEL_TEST_LIMITATION};
  this.jobs.set(job.id,job);setImmediate(()=>this.run(job,user).catch(error=>{job.status='Failed';job.error=error.message;job.finishedAt=new Date().toISOString();}));return structuredClone(job);
 }
 stop(user,id){const job=this.jobs.get(id);this.read(user,id);if(job.status==='Running')job.stopRequested=true;return structuredClone(job);}
 async run(job,user){
  for(let repeat=1;repeat<=job.repeats;repeat++)for(const id of job.recordIds){
   if(job.stopRequested){job.status='Stopped';job.finishedAt=new Date().toISOString();return;}
   const r=this.store.state.records.find(r=>r.id===id),expected=MODEL_EXPECTATIONS.find(e=>e.recordId===id),revision=this.store.state.revision;
   job.currentRecordId=id;const row={recordId:id,borrower:r.borrower.name,repeat,expected:structuredClone(expected),ruleOutcome:assess(r,this.store.state.policy).outcome};
   try{
    authorize(user,r,'write');const packet=validationPacket(r,assess(r,this.store.state.policy),this.store.state.policy);
    const result=await this.validate(packet);
    await this.store.mutate(user,{type:'validationSave',recordId:id,expectedRevision:revision},{trustedValidation:result});
    row.result=result;row.checks=evaluateReview(result,expected);
   }catch(error){row.error=error.message;if(error.diagnostic)row.diagnostic=error.diagnostic;}
   job.rows.push(row);job.totals=evaluationTotals(job.rows);
  }
  job.status='Completed';job.currentRecordId=null;job.finishedAt=new Date().toISOString();
 }
}


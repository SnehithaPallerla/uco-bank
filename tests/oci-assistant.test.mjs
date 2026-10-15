import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {assistantPacket,independentRequest,parseIndependent,independentAnswer,assistantAnswer,RULEBOOK} from '../server/oci-assistant.mjs';
import {initialState,answer} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';
import {Store,createPlatformServer} from '../server/platform.mjs';
const state=()=>initialState(),user=personas[0];
const fixture=p=>({answer:'The sanction defines permitted uses; review the supplied payment evidence.',outcome:'Supported',reviewInr:0,findings:[],gaps:[],contexts:[],claims:[{text:'The sanction sets permitted uses.',evidenceIds:[p.record.facility.sanctionEvidenceId]}]});

test('independent packet excludes computed outcomes, answer labels and prior model output',()=>{
 const s=state(),r=s.records.find(r=>r.id==='LAB-002');r.llmValidations=[{secret:'previous answer'}];r.nextAction='answer hint';
 const p=assistantPacket(r,s.policy);assert.equal(p.ruleResult,undefined);assert.equal(p.record.nextAction,undefined);assert.equal(p.record.title,undefined);assert.equal(p.record.llmValidations,undefined);assert.equal(p.record.borrower.cif,undefined);
 const req=independentRequest(p,'Explain this case',{OCI_CHAT_FORMAT:'COHERE',OCI_MODEL_ID:'demo',OCI_COMPARTMENT_ID:'demo'});assert.ok(req.chatDetails.chatRequest.message.includes(RULEBOOK));assert.ok(!req.chatDetails.chatRequest.message.includes('previous answer'));assert.equal(req.chatDetails.chatRequest.maxTokens,4000);
});
test('independent response rejects invented evidence, transaction/rule references and invalid amounts',()=>{
 const s=state(),p=assistantPacket(s.records[0],s.policy),v=fixture(p);assert.equal(parseIndependent(JSON.stringify(v),p).outcome,'Supported');
 for(const patch of [{reviewInr:-1},{reviewInr:1.1},{outcome:'Fraud confirmed'},{claims:[{text:'Claim',evidenceIds:['foreign']}]},{claims:[{text:'Claim',evidenceIds:[]}]}])assert.throws(()=>parseIndependent(JSON.stringify({...v,...patch}),p));
 assert.throws(()=>parseIndependent(JSON.stringify({...v,findings:[{rule:'UNKNOWN',transactionIds:[],amountInr:0,explanation:'x',evidenceIds:v.claims[0].evidenceIds}]}),p));
});
test('OCI inference is read-only and authorization precedes any provider call',async()=>{
 const s=state(),r=s.records.find(r=>r.branch==='KOL'),before=JSON.stringify(r);let calls=0;
 const options={config:()=>({configured:true,model:'test',region:'test'}),invoke:async()=>{calls++;return {chatResult:{chatResponse:{text:JSON.stringify(fixture(assistantPacket(r,s.policy)))}},opcRequestId:'test'};}};
 const result=await independentAnswer(r,user,'Explain',s.policy,options);assert.equal(calls,1);assert.equal(JSON.stringify(r),before);assert.ok(result.mode.includes('Experimental OCI'));assert.equal(result.requestId,'test');
 await assert.rejects(independentAnswer(r,personas.find(p=>p.id==='neha'),'Explain',s.policy,options),/Access denied/);assert.equal(calls,1);
});
test('local switch makes no OCI calls; failed OCI response returns clearly labelled local fallback',async()=>{
 const s=state(),r=s.records[0];let calls=0;const live=async()=>{calls++;throw Error('provider failed');};
 assert.deepEqual((await assistantAnswer(r,user,'Why flagged?',s.policy,{env:{UCO_ASSISTANT_MODE:'local'},live})).text,answer(r,user,'Why flagged?',s.policy).text);assert.equal(calls,0);
 const result=await assistantAnswer(r,user,'Why flagged?',s.policy,{env:{UCO_ASSISTANT_MODE:'oci-rules'},live});assert.equal(calls,1);assert.equal(result.fallback,true);assert.ok(result.text.includes('existing local assistant'));
});
test('provider throttling is distinguished from invalid model answers without exposing provider details',async()=>{
 const s=state(),r=s.records[0];
 await assert.rejects(independentAnswer(r,user,'Explain',s.policy,{config:()=>({configured:true}),invoke:async()=>{throw Object.assign(Error('private provider diagnostic'),{statusCode:429});}}),e=>e.providerStatus===429&&e.message==='OCI assistant request was throttled.');
});
test('HTTP assistant enforces branch, rate and revision checks around OCI and accepts live chat',async()=>{
 const dir=await mkdtemp(path.resolve('test-output','assistant-service-')),store=await new Store(dir).init();let calls=0,change=false;
 const server=createPlatformServer({store,assistantEnv:{UCO_ASSISTANT_MODE:'oci-rules'},assistantRespond:async()=>{calls++;if(change)store.state.revision++;return {text:'Live answer',refs:[],tools:[],mode:'Experimental OCI assistant'};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const login=async persona=>{const r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona})});return r.headers.get('set-cookie').split(';')[0];};
  const post=(cookie,extra={})=>fetch(base+'/api/assistant',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({recordId:'HL01',question:'Explain',...extra})});
  const neha=await login('neha');assert.equal((await post(neha)).status,403);assert.equal(calls,0);
  const cookie=await login('asha');assert.equal((await post(cookie,{ruleResult:{outcome:'Supported'}})).status,400);assert.equal(calls,0);
  assert.equal((await post(cookie)).status,200);change=true;assert.equal((await post(cookie)).status,409);change=false;
  await post(cookie);await post(cookie);assert.equal((await post(cookie)).status,429);assert.equal(calls,4);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});

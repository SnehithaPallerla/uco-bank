import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,command,assess,exportRecord,accepted} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';
import {SCENARIOS,bloombergMock,enrichmentAnswer,payees} from '../src/platform/assistant/enrichment.js';
import {validateSubject,googleURL,publicURL} from '../src/platform/assistant/web-research.js';
import {searchWeb,searchConfig,normaliseOCIResponse} from '../server/web-search.mjs';

import {grokResponse} from './fixtures/grok-response.mjs';

const analyst=personas[0],recordId='MT-BLUEFIN',subject={name:'Kaveri Trading',city:'',publicId:'',intent:'activity'};
const find=s=>s.records.find(r=>r.id===recordId);
const review={type:'assistantAttachResearch',recordId,identity:'Possible match',note:'Name match only; request registration, invoices and delivery documents.'};

test('public web search rejects customer identifiers, injected fields and unsafe citation links',()=>{
 assert.equal(validateSubject(subject).name,'Kaveri Trading');
 for(const bad of [{...subject,recordId},{...subject,accountNumber:'1234'},{...subject,name:'Company account number 1234567890'},{...subject,publicId:'123456789012'},{...subject,name:'person@example.com'}])assert.throws(()=>validateSubject(bad));
 assert.equal(new URL(googleURL(subject)).hostname,'www.google.com');
 for(const url of ['javascript:alert(1)','http://example.com','https://127.0.0.1','https://localhost','https://private.local','https://a:secret@example.com','https://[::1]'])assert.equal(publicURL(url),null);
});
test('Grok research requires completed searches, safe citations and a completed response',()=>{
 const response=grokResponse(),result=normaliseOCIResponse(response,subject);
 assert.equal(result.status,'Grounded');assert.deepEqual(result.claims[0].sourceIds,['S1']);assert.equal(result.provider,'OCI Generative AI - Grok');assert.equal(result.identity,'Unverified');assert.equal(result.sources[0].sourceDate,null);assert.equal(result.sha256.length,64);
 const missingSearch=structuredClone(response);missingSearch.output.shift();
 const missingCitation=structuredClone(response);missingCitation.output[1].content[0].annotations=[];
 const invalid=structuredClone(response);invalid.output[1].content[0].annotations[0].end_index=999;
 const unsafe=structuredClone(response);unsafe.output[1].content[0].annotations[0].url='https://127.0.0.1';
 const incomplete={...response,status:'incomplete'};
 const running=structuredClone(response);running.output[0].status='in_progress';
 for(const data of [missingSearch,missingCitation,invalid,unsafe,incomplete,running]){const result=normaliseOCIResponse(data,subject);assert.equal(result.status,'No grounded result');assert.equal(result.sources.length,0);assert.equal(result.claims.length,0);assert.ok(!result.summary.includes('Trading company supplies'));}
});

test('Grok Responses research sends only validated public subject details and handles provider failures',async()=>{
 const env={OCI_REGION:'us-chicago-1',OCI_COMPARTMENT_ID:'ocid1.compartment.oc1..test',OCI_MODEL_ID:'openai.gpt-5.4-mini',OCI_CHAT_FORMAT:'GENERIC',OCI_WEB_SEARCH_MODEL_ID:'xai.grok-4.20-multi-agent'};
 const config=()=>({configured:true,missing:[]});let sent;
 const result=await searchWeb(subject,{env,config,invoke:async(request,receivedEnv)=>{sent=request;assert.equal(receivedEnv,env);return grokResponse();}});
 assert.equal(result.status,'Grounded');assert.equal(sent.model,env.OCI_WEB_SEARCH_MODEL_ID);assert.deepEqual(sent.tools,[{type:'web_search'}]);assert.equal(sent.store,false);assert.ok(sent.input.includes('Kaveri Trading'));
 for(const privateField of ['MT-BLUEFIN','amountInr',env.OCI_COMPARTMENT_ID,env.OCI_MODEL_ID])assert.ok(!JSON.stringify(sent).includes(privateField));
 for(const model of ['google.gemini-2.5-flash','openai.gpt-5.4-mini']){
  const unsupported={...env,OCI_WEB_SEARCH_MODEL_ID:model};let calls=0;
  assert.equal(searchConfig(unsupported,{config}).configured,false);
  await assert.rejects(searchWeb(subject,{env:unsupported,config,invoke:async()=>{calls++;}}),e=>e.status===503);assert.equal(calls,0);
 }
 assert.equal(searchConfig({...env,OCI_REGION:'ap-hyderabad-1'},{config}).configured,false);
 assert.equal(searchConfig({}).configured,false);
 for(const code of [401,403,429,400,404,500])await assert.rejects(searchWeb(subject,{env,config,invoke:async()=>{throw Object.assign(Error('provider secret'),{statusCode:code});}}),e=>e.status===502&&!e.message.includes('secret'));
});

test('all seven Bloomberg examples preserve the existing assessment and identify their provenance',()=>{
 let s=initialState();const before=assess(find(s),s.policy),entityId=payees(find(s))[0].id;
 for(const scenario of Object.keys(SCENARIOS)){
  s=command(s,analyst,{type:'assistantBloombergRun',recordId,entityId,scenario});const r=find(s),result=r.assistantResearch[0];
  assert.equal(result.mode,'Bloomberg mock');assert.equal(result.retrievedAt,null);assert.deepEqual(assess(r,s.policy),before);assert.ok(result.limitations.includes('no Bloomberg feed'));
  assert.ok(enrichmentAnswer(r,result,'purpose').length>40);
 }
 assert.equal(find(s).assistantResearch.length,7);assert.equal(s.audit.length,7);
 const r=find(s);assert.equal(bloombergMock(r,entityId,'stale').profile.asOf,'2024-03-31');assert.equal(bloombergMock(r,entityId,'ambiguous').candidates.length,2);assert.equal(bloombergMock(r,entityId,'ownership').commonParent.borrowerPercent,60);
 assert.throws(()=>bloombergMock(r,'foreign-payee','supplier'),/observed/);
 const individual=structuredClone(r);individual.entities.find(e=>e.id===entityId).type='individual';assert.equal(bloombergMock(individual,entityId,'supplier').status,'No company coverage');
});
test('reviewed enrichment opens the existing case workflow and exports recorded evidence without changing scores',()=>{
 let s=initialState();const before=assess(find(s),s.policy);
 s=command(s,analyst,{type:'assistantWebWalkthrough',recordId,subject});const id=find(s).assistantResearch[0].id;
 s=command(s,analyst,{...review,runId:id});const r=find(s),ev=r.evidence.at(-1),c=s.cases[0];
 assert.equal(c.status,'Open concern');assert.equal(ev.status,'recorded');assert.equal(accepted(ev),false);assert.equal(ev.payload.review.by,analyst.id);assert.equal(c.history.at(-1).action,'assistant_enrichment');assert.deepEqual(assess(r,s.policy),before);
 assert.equal(exportRecord(r,analyst,s).record.evidence.at(-1).payload.research.mode,'Recorded walkthrough');assert.ok(s.audit.some(a=>a.action==='assistant_evidence_attached'));
 assert.throws(()=>command(s,analyst,{...review,runId:id}),/already attached/);
});
test('branch, role, identity, stale source and pending review boundaries apply to added evidence',()=>{
 let s=initialState();const entityId=payees(find(s))[0].id;
 assert.throws(()=>command(s,personas.find(p=>p.id==='neha'),{type:'assistantWebWalkthrough',recordId,subject}),/branch scope/);
 assert.throws(()=>command(s,personas.find(p=>p.id==='admin'),{type:'assistantBloombergRun',recordId,entityId,scenario:'supplier'}),/role required/);
 s=command(s,analyst,{type:'assistantBloombergRun',recordId,entityId,scenario:'stale'});const id=find(s).assistantResearch[0].id;
 assert.throws(()=>command(s,analyst,{...review,runId:id,identity:'Identifier corroborated'}),/requires a live result/);
 assert.throws(()=>command(s,analyst,{...review,runId:id,identity:'Different entity'}),/different entity/);
 const attached=command(s,analyst,{...review,runId:id});assert.equal(find(attached).evidence.at(-1).status,'stale');
 s=command(s,analyst,{type:'openCase',recordId});s=command(s,analyst,{type:'submit',recordId,note:'Request independent review of current evidence',outcome:'Evidence still required',evidenceIds:[find(s).evidence[0].id]});
 assert.throws(()=>command(s,analyst,{...review,runId:id}),/snapshot is locked/);
 s=command(s,personas[1],{type:'approve',recordId,note:'Independent review completed with evidence required'});
 assert.throws(()=>command(s,analyst,{...review,runId:id}),/Reopen the case/);
});
test('unavailable profiles cannot attach and client-created live results are rejected',()=>{
 let s=initialState();s=command(s,analyst,{type:'assistantBloombergRun',recordId,entityId:payees(find(s))[0].id,scenario:'unavailable'});
 assert.throws(()=>command(s,analyst,{...review,runId:find(s).assistantResearch[0].id}),/no source/);
 assert.throws(()=>command(s,analyst,{type:'assistantSaveRun',recordId,run:{id:'WEB-TEST',mode:'Live web research',status:'Grounded'}}),/authenticated server/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {readResearchStatus,searchAndSaveResearch,companyResearchRuns} from '../src/platform/assistant/research-client.js';
import {Store,createPlatformServer,verifyChain} from '../server/platform.mjs';
import {normaliseOCIResponse} from '../server/web-search.mjs';
import {grokResponse} from './fixtures/grok-response.mjs';
import {assess} from '../src/platform/domain.js';

const subject={name:'Kaveri Trading',city:'',publicId:'',intent:'activity'},recordId='MT-BLUEFIN';
const result=()=>normaliseOCIResponse(grokResponse('Trading company.'),subject);

test('availability uses the existing status endpoint without starting or saving research',async()=>{
 const calls=[],info=await readResearchStatus({request:async(url,options)=>{calls.push(url);return Response.json({configured:true,status:'Configured - Grok web search'});}});
 assert.deepEqual(calls,['/api/assistant/research/status']);assert.equal(info.configured,true);
});

test('live research sends the validated public subject and saves through the existing canonical capture command',async()=>{
 let sent,saved;const captured=result();
 const id=await searchAndSaveResearch({recordId,subject:{...subject,name:' Kaveri Trading '},request:async(url,options)=>{assert.equal(url,'/api/assistant/research');sent=JSON.parse(options.body);return Response.json({result:captured});},save:async cmd=>{saved=cmd;return true;}});
 assert.deepEqual(sent,{recordId,subject});assert.equal(id,captured.id);assert.deepEqual(saved,{type:'assistantSaveRun',recordId,run:captured});
 let calls=0;await assert.rejects(searchAndSaveResearch({recordId,subject:{...subject,accountNumber:'1234567890'},request:async()=>calls++,save:async()=>true}),/public company/);assert.equal(calls,0);
});

test('provider errors, failed saves and abandoned borrower requests do not create a successful saved result',async()=>{
 let saves=0;
 await assert.rejects(searchAndSaveResearch({recordId,subject,request:async()=>Response.json({error:'OCI quota reached'},{status:429}),save:async()=>saves++}),/quota reached/);assert.equal(saves,0);
 await assert.rejects(searchAndSaveResearch({recordId,subject,request:async()=>Response.json({result:result()}),save:async()=>false}),/could not be saved/);
 const controller=new AbortController();
 await assert.rejects(searchAndSaveResearch({recordId,subject,signal:controller.signal,request:async()=>{controller.abort();return Response.json({result:result()});},save:async()=>saves++}),e=>e.name==='AbortError');assert.equal(saves,0);
});

test('recipient history includes only that company’s saved live web results',()=>{
 const live={...result(),kind:'web'},other={...live,id:'OTHER',subject:{...subject,name:'Other Company'}},prepared={...live,id:'EXAMPLE',mode:'Recorded walkthrough'},bloomberg={...live,id:'BB',kind:'bloomberg'};
 assert.deepEqual(companyResearchRuns({assistantResearch:[live,other,prepared,bloomberg]},' kaveri trading '),[live]);
});

test('Evidence Research client completes status, search, canonical save and officer attachment over HTTP',async()=>{
 const directory=await mkdtemp(path.resolve('test-output','evidence-live-')),store=await new Store(directory).init();let providerCalls=0;
 const before=structuredClone(store.state.records.find(r=>r.id===recordId));
 const server=createPlatformServer({store,researchConfig:()=>({configured:true,status:'Configured - Grok web search'}),researchSearch:async input=>{providerCalls++;assert.deepEqual(input,subject);return result();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const login=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona:'asha'})}),cookie=login.headers.get('set-cookie').split(';')[0];
  const request=(url,options={})=>fetch(base+url,{...options,headers:{...options.headers,cookie}});
  assert.equal((await readResearchStatus({request})).configured,true);assert.equal(providerCalls,0);
  const save=async cmd=>(await request('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...cmd,expectedRevision:store.state.revision})})).ok;
  const id=await searchAndSaveResearch({recordId,subject,request,save});assert.equal(providerCalls,1);
  let record=store.state.records.find(r=>r.id===recordId);assert.equal(companyResearchRuns(record,subject.name)[0].id,id);assert.equal(record.research.completed,false);
  assert.equal(await save({type:'assistantAttachResearch',recordId,runId:id,identity:'Possible match',note:'Public name match only; obtain bank-held registration and delivery evidence.'}),true);
  record=store.state.records.find(r=>r.id===recordId);assert.equal(record.evidence.at(-1).kind,'assistant_web_research');assert.equal(record.evidence.at(-1).status,'recorded');assert.equal(record.assistantResearch[0].attachedEvidenceId,record.evidence.at(-1).id);
  assert.deepEqual(assess(record,store.state.policy),assess(before,store.state.policy));assert.deepEqual(record.relationships,before.relationships);assert.equal(record.research.completed,false);assert.ok(verifyChain(store.state));assert.ok(!store.state.audit.some(item=>item.action==='research_unavailable'));
  const reloaded=await new Store(directory).init();assert.equal(companyResearchRuns(reloaded.state.records.find(r=>r.id===recordId),subject.name)[0].id,id);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

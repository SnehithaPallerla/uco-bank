import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {generateKeyPairSync,createHash} from 'node:crypto';
import path from 'node:path';
import {initialState,assess,command,exportRecord} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';
import {validationPacket,preparedValidation,parseValidation} from '../src/platform/assistant/validation.js';
import {validateWithOCI,chatRequest,ociConfig,sdkChat,prepareChatRequest} from '../server/oci-validation.mjs';
import {Store,createPlatformServer,verifyChain} from '../server/platform.mjs';
const recordId='MT-BLUEFIN',get=s=>s.records.find(r=>r.id===recordId);
const settings={OCI_REGION:'us-chicago-1',OCI_COMPARTMENT_ID:'ocid1.compartment.oc1..demo',OCI_MODEL_ID:'meta.demo'};
const configured=()=>({configured:true,model:settings.OCI_MODEL_ID,region:settings.OCI_REGION});
const packet=()=>{const s=initialState();return validationPacket(get(s),assess(get(s),s.policy),s.policy);};
const response=p=>({chatResult:{chatResponse:{choices:[{message:{content:[{type:'TEXT',text:JSON.stringify(preparedValidation(p))}]}}]}},opcRequestId:'test-request'});

test('prepared validation preserves assessments, exports snapshots and handles every generated case',()=>{
 const s=initialState();for(const r of s.records){const p=validationPacket(r,assess(r,s.policy),s.policy),review=preparedValidation(p);assert.ok(review.claims.length);}
 const before=assess(get(s),s.policy),next=command(s,personas[0],{type:'validationPrepared',recordId});
 assert.deepEqual(assess(get(next),next.policy),before);assert.equal(next.cases.length,0);assert.equal(get(next).llmValidations[0].mode,'Prepared example');assert.equal(next.audit.at(-1).action,'llm_validation');
 assert.equal(exportRecord(get(next),personas[0],next).record.llmValidations.length,1);assert.equal(exportRecord(get(next),personas[0],next).provenance.liveModel,false);
 assert.throws(()=>command(s,personas[2],{type:'validationPrepared',recordId}),/branch/);
 assert.throws(()=>command(s,personas[3],{type:'validationPrepared',recordId}),/role/);
 assert.throws(()=>command(s,personas[0],{type:'validationSave',recordId}),/authenticated OCI/);
});
test('model review rejects fabricated citations, malformed output and unsupported dispositions',()=>{
 const p=packet(),review=preparedValidation(p);
 assert.throws(()=>parseValidation('not json',p),/valid JSON/);
 assert.throws(()=>parseValidation(JSON.stringify({...review,disposition:'Confirmed fraud'}),p),/unsupported/);
 assert.throws(()=>parseValidation(JSON.stringify({...review,claims:[{text:'Claim',evidenceIds:['OTHER-CASE']}]}),p),/outside this case/);
 assert.throws(()=>parseValidation(JSON.stringify({...review,claims:[]}),p),/cite evidence/);
 assert.equal(parseValidation('```json\n'+JSON.stringify(review)+'\n```',p).disposition,review.disposition);
 assert.throws(()=>parseValidation('null',p),/object required/);
 assert.throws(()=>parseValidation(JSON.stringify({...review,legitimateExplanation:null}),p),/legitimateExplanation/);
});
test('OCI requests support generic and Cohere formats and retain provider provenance',async()=>{
 const p=packet();let sent;
 const result=await validateWithOCI(p,{env:settings,config:configured,invoke:async request=>{sent=request;return response(p);}});
 assert.equal(sent.chatDetails.servingMode.servingType,'ON_DEMAND');assert.equal(sent.chatDetails.chatRequest.apiFormat,'GENERIC');assert.equal(sent.chatDetails.chatRequest.isStream,false);
 assert.ok(sent.chatDetails.chatRequest.messages[0].content[0].text.includes('untrusted data'));assert.equal(result.inputDigest.length,64);assert.equal(result.requestId,'test-request');assert.deepEqual(result.packet,p);
 const cohere=await validateWithOCI(p,{env:{...settings,OCI_CHAT_FORMAT:'COHERE'},config:configured,invoke:async request=>{assert.equal(request.chatDetails.chatRequest.apiFormat,'COHERE');assert.equal(request.chatDetails.chatRequest.responseFormat.type,'JSON_OBJECT');return {chatResult:{chatResponse:{text:JSON.stringify(preparedValidation(p))}}};}});assert.equal(cohere.mode,'Live OCI model');
 assert.ok(!JSON.stringify(chatRequest(p,settings)).includes('key_file'));
 assert.equal(ociConfig({}).configured,false);
 await assert.rejects(validateWithOCI(p,{env:{},config:()=>({configured:false})}),e=>e.status===503);
 await assert.rejects(validateWithOCI(p,{env:settings,config:configured,invoke:async()=>{throw Object.assign(Error('private key secret'),{statusCode:403});}}),e=>e.status===502&&!e.message.includes('secret'));
});
test('GPT Mini keeps prompts and explicit completion budgets without mutating other model requests',()=>{
 const original=chatRequest(packet(),{...settings,OCI_MODEL_ID:'openai.gpt-5.4-mini'}),snapshot=structuredClone(original);
 const adapted=prepareChatRequest(original).chatDetails.chatRequest;
 assert.equal(adapted.maxCompletionTokens,2000);assert.equal(adapted.reasoningEffort,'NONE');
 assert.ok(!('maxTokens' in adapted));assert.ok(!('temperature' in adapted));
 assert.deepEqual(adapted.messages,original.chatDetails.chatRequest.messages);assert.deepEqual(original,snapshot);
 original.chatDetails.chatRequest.maxCompletionTokens=3500;original.chatDetails.chatRequest.reasoningEffort='LOW';
 assert.equal(prepareChatRequest(original).chatDetails.chatRequest.maxCompletionTokens,3500);
 assert.equal(prepareChatRequest(original).chatDetails.chatRequest.reasoningEffort,'LOW');
 const cohere=chatRequest(packet(),{...settings,OCI_CHAT_FORMAT:'COHERE'});assert.equal(prepareChatRequest(cohere),cohere);
 const generic=chatRequest(packet(),settings);assert.equal(prepareChatRequest(generic),generic);
});

test('official OCI SDK signs and serialises the request without retries using synthetic credentials',async()=>{
 const dir=await mkdtemp(path.resolve('test-output','oci-sdk-')),savedFetch=globalThis.fetch;
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const keyPath=path.join(dir,'test.pem'),configPath=path.join(dir,'config');
 await writeFile(keyPath,privateKey);await writeFile(configPath,'[DEFAULT]\nuser=ocid1.user.oc1..test\ntenancy=ocid1.tenancy.oc1..test\nfingerprint='+createHash('md5').update(publicKey).digest('hex').match(/../g).join(':')+'\nregion=us-chicago-1\nkey_file='+keyPath.replaceAll('\\','/')+'\n');
 let calls=0,expectedFormat='COHERE';
 globalThis.fetch=async(request,options)=>{calls++;assert.equal(new URL(request.url).hostname,'inference.generativeai.us-chicago-1.oci.oraclecloud.com');assert.match(request.headers.get('authorization'),/^Signature /);assert.ok(request.headers.get('x-content-sha256'));assert.ok(options.signal);const body=JSON.parse(await request.text());assert.equal(body.chatRequest.apiFormat,expectedFormat);if(expectedFormat==='GENERIC'){assert.equal(body.servingMode.modelId,'openai.gpt-5.4-mini');assert.equal(body.chatRequest.maxCompletionTokens,2000);assert.equal(body.chatRequest.reasoningEffort,'NONE');assert.ok(!('temperature' in body.chatRequest));assert.ok(!('maxTokens' in body.chatRequest));}return new Response(JSON.stringify({modelId:settings.OCI_MODEL_ID,modelVersion:'test',chatResponse:{apiFormat:'COHERE',text:JSON.stringify(preparedValidation(packet()))}}),{headers:{'Content-Type':'application/json','opc-request-id':'sdk-test-request'}});};
 try{const result=await sdkChat(chatRequest(packet(),{...settings,OCI_CHAT_FORMAT:'COHERE'}),{...settings,OCI_CONFIG_FILE:configPath});assert.equal(calls,1);assert.equal(result.opcRequestId,'sdk-test-request');assert.ok(result.chatResult.chatResponse.text);expectedFormat='GENERIC';await sdkChat(chatRequest(packet(),{...settings,OCI_MODEL_ID:'openai.gpt-5.4-mini'}),{...settings,OCI_CONFIG_FILE:configPath});assert.equal(calls,2);}finally{globalThis.fetch=savedFetch;await rm(dir,{recursive:true,force:true});}
});
test('OCI service scopes access, persists server reviews and blocks forged or stale writes',async()=>{
 const dir=await mkdtemp(path.resolve('test-output','oci-service-')),store=await new Store(dir).init();let calls=0,change=false;
 const server=createPlatformServer({store,ociStatus:configured,ociValidate:async p=>{calls++;if(change)await store.mutate(personas[0],{type:'validationPrepared',recordId});return validateWithOCI(p,{env:settings,config:configured,invoke:async()=>response(p)});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const req=(route,cookie,body)=>fetch(base+route,{method:body?'POST':'GET',headers:{cookie:cookie||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const login=async persona=>(await req('/api/session','',{persona})).headers.get('set-cookie').split(';')[0];
 try{
  assert.equal((await req('/api/assistant/validation','',{recordId,expectedRevision:0})).status,401);
  const restricted=await login('neha');assert.equal((await req('/api/assistant/validation',restricted,{recordId,expectedRevision:0})).status,403);assert.equal(calls,0);
  const cookie=await login('asha'),before=assess(get(store.state),store.state.policy);
  assert.equal((await req('/api/command',cookie,{type:'validationSave',recordId,result:{review:{disposition:'Supported'}}})).status,400);
  assert.equal((await req('/api/assistant/validation',cookie,{recordId,expectedRevision:0,prompt:'injected'})).status,400);
  const reply=await req('/api/assistant/validation',cookie,{recordId,expectedRevision:0});assert.equal(reply.status,200);assert.equal(calls,1);assert.deepEqual(assess(get(store.state),store.state.policy),before);assert.ok(verifyChain(store.state));
  const reloaded=await new Store(dir).init();assert.equal(get(reloaded.state).llmValidations[0].model,settings.OCI_MODEL_ID);assert.equal(exportRecord(get(reloaded.state),personas[0],reloaded.state).provenance.liveModel,true);
  assert.equal((await req('/api/assistant/validation',cookie,{recordId,expectedRevision:0})).status,409);assert.equal(calls,1);
  change=true;assert.equal((await req('/api/assistant/validation',cookie,{recordId,expectedRevision:store.state.revision})).status,409);assert.equal(get(store.state).llmValidations.filter(x=>x.mode==='Live OCI model').length,1);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

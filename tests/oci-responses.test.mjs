import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {generateKeyPairSync} from 'node:crypto';
import path from 'node:path';
import {sdkResponses} from '../server/oci-responses.mjs';
import {normaliseOCIResponse} from '../server/web-search.mjs';
import {grokResponse} from './fixtures/grok-response.mjs';

test('Grok transport signs the model-specific Chicago route and never retries provider errors',async()=>{
 const dir=await mkdtemp(path.resolve('test-output','grok-sdk-')),originalFetch=globalThis.fetch;
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const keyPath=path.join(dir,'test.pem'),configPath=path.join(dir,'config');
 await writeFile(keyPath,privateKey);
 await writeFile(configPath,'[DEFAULT]\nuser=ocid1.user.oc1..test\ntenancy=ocid1.tenancy.oc1..test\nfingerprint=00:11:22:33\nregion=us-chicago-1\nkey_file='+keyPath.replaceAll('\\','/')+'\n');
 const env={OCI_REGION:'us-chicago-1',OCI_COMPARTMENT_ID:'ocid1.compartment.oc1..test',OCI_CONFIG_FILE:configPath};
 const body={model:'xai.grok-4.20-multi-agent',input:'Public query',tools:[{type:'web_search'}],store:false};
 let calls=0,status=200;
 globalThis.fetch=async(uri,options)=>{
  calls++;assert.equal(uri,'https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/v1/responses');
  assert.match(options.headers.get('authorization'),/^Signature /);assert.ok(options.headers.get('x-content-sha256'));
  assert.equal(options.headers.get('opc-compartment-id'),env.OCI_COMPARTMENT_ID);assert.equal(options.redirect,'error');assert.ok(options.signal);
  assert.deepEqual(JSON.parse(options.body),body);
  return new Response(JSON.stringify(status===200?grokResponse():{message:'private provider detail'}),{status,headers:{'Content-Type':'application/json'}});
 };
 try{
  assert.equal((await sdkResponses(body,env)).status,'completed');assert.equal(calls,1);
  status=429;await assert.rejects(sdkResponses(body,env),e=>e.statusCode===429&&!e.message.includes('private'));assert.equal(calls,2);
  status=302;await assert.rejects(sdkResponses(body,env),e=>e.statusCode===302);assert.equal(calls,3);
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});

test('Grok citation markers retain their factual paragraph and use offsets local to each text block',()=>{
 const subject={name:'Kaveri Trading',city:'',publicId:'',intent:'activity'},response=grokResponse();
 const text='Company profile\n\nIt supplies materials. [[1]](https://example.com/about)';
 response.output[1].content=[{type:'output_text',text:'Introduction without a citation.',annotations:[]},{type:'output_text',text,annotations:[{type:'url_citation',title:'1',url:'https://example.com/about',start_index:text.indexOf('[[1]]'),end_index:text.length}]}];
 const result=normaliseOCIResponse(response,subject);
 assert.equal(result.status,'Grounded');assert.ok(result.claims[0].text.startsWith('It supplies materials.'));
 assert.ok(!result.claims[0].text.includes('Introduction'));assert.ok(!result.claims[0].text.includes('Company profile'));
 assert.ok(result.sources[0].excerpt.startsWith('It supplies materials.'));assert.equal(result.sources[0].sourceDate,null);assert.equal(result.sources[0].title,'example.com');
 const social=structuredClone(response);social.output[0].type='x_search_call';assert.equal(normaliseOCIResponse(social,subject).status,'No grounded result');
});

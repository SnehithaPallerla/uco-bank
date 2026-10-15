import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {Store,createPlatformServer,verifyChain} from '../server/platform.mjs';
import {normaliseOCIResponse} from '../server/web-search.mjs';
import {grokResponse} from './fixtures/grok-response.mjs';
const subject={name:'Kaveri Trading',city:'',publicId:'',intent:'activity'},recordId='MT-BLUEFIN';
async function start(configured=true){
 const directory=await mkdtemp(path.resolve('test-output','enrichment-service-')),store=await new Store(directory).init();let seen;
 const server=createPlatformServer({store,researchConfig:()=>({configured}),researchSearch:async input=>{seen=input;return normaliseOCIResponse(grokResponse('Trading company.'),input);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 const request=(route,cookie,body)=>fetch(url+route,{method:body?'POST':'GET',headers:{cookie:cookie||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const login=async id=>(await request('/api/session','',{persona:id})).headers.get('set-cookie').split(';')[0];
 return {store,request,login,seen:()=>seen,close:async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}};
}
test('live search is session- and branch-scoped and saves the canonical server capture',async()=>{
 const h=await start();try{
  assert.equal((await h.request('/api/assistant/research','',{recordId,subject})).status,401);
  const restricted=await h.login('neha');assert.equal((await h.request('/api/assistant/research',restricted,{recordId,subject})).status,403);assert.equal(h.seen(),undefined);
  const cookie=await h.login('asha'),payload={recordId,subject};
  const res=await h.request('/api/assistant/research',cookie,payload);assert.equal(res.status,200);const {result}=await res.json();assert.deepEqual(h.seen(),subject);
  const other=await h.login('ravi');assert.equal((await h.request('/api/command',other,{type:'assistantSaveRun',recordId,run:result})).status,400);
  const forged={...result,summary:'Forged fraudulent company finding'};
  assert.equal((await h.request('/api/command',cookie,{type:'assistantSaveRun',recordId,run:forged,expectedRevision:0})).status,200);
  const r=h.store.state.records.find(r=>r.id===recordId);assert.equal(r.assistantResearch[0].summary,'Trading company.');assert.ok(verifyChain(h.store.state));
  const attach=await h.request('/api/command',cookie,{type:'assistantAttachResearch',recordId,runId:result.id,identity:'Possible match',note:'Corroborate bank-held identifiers and commercial evidence.'});assert.equal(attach.status,200);
  assert.equal(h.store.state.records.find(r=>r.id===recordId).evidence.at(-1).captureDigest.length,64);assert.ok(verifyChain(h.store.state));
  const reloaded=await new Store(h.store.directory).init();assert.equal(reloaded.state.records.find(r=>r.id===recordId).assistantResearch[0].id,result.id);
 }finally{await h.close();}
});
test('unconfigured search is explicit and client-provided live evidence is rejected',async()=>{
 const h=await start(false);try{const cookie=await h.login('asha');assert.equal((await h.request('/api/assistant/research',cookie,{recordId,subject})).status,503);assert.equal(h.seen(),undefined);assert.equal((await h.request('/api/command',cookie,{type:'assistantSaveRun',recordId,run:{id:'forged',mode:'Live web research'}})).status,400);assert.equal(h.store.state.revision,0);}finally{await h.close();}
});

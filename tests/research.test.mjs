import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {collect,validOrigin,researchHandler} from '../server/research.mjs';
const response=html=>new Response(html,{headers:{'content-type':'text/html'}});
test('collector only accepts fixed source IDs, including prototype-safe checking',async()=>{for(const id of ['https://127.0.0.1','http://169.254.169.254','constructor','__proto__'])await assert.rejects(collect(id),/not approved/);});
test('capture includes timestamp, matching status and reproducible integrity hash',async()=>{
 let opts;const e=await collect('uco',{useCache:false,clock:()=>1e12,fetcher:async(url,o)=>{opts=o;assert.equal(url,'https://www.uco.bank.in/en/');return response('<html><script>steal secrets</script><p>This is an institutional information page for the demonstration, with sufficient text for an evidence capture.</p></html>');}});
 assert.equal(opts.redirect,'error');assert.ok(opts.signal);assert.equal(e.mode,'Live public-source evidence');assert.equal(e.match,'No borrower identity matched');assert.ok(!e.captureText.includes('steal'));assert.equal(e.sha256,createHash('sha256').update(e.captureText).digest('hex'));assert.ok(e.excerpt.split(' ').length<=25);
});
test('collector respects failure, content types, size and access restriction',async()=>{
 await assert.rejects(collect('uco',{useCache:false,fetcher:async()=>new Response('bad',{status:403})}),/unavailable/);
 await assert.rejects(collect('uco',{useCache:false,fetcher:async()=>new Response('pdf',{headers:{'content-type':'application/pdf'}})}),/content type/);
 await assert.rejects(collect('uco',{useCache:false,fetcher:async()=>response('x'.repeat(1024*1024+1))}),/size limit/);
 await assert.rejects(collect('uco',{useCache:false,fetcher:async()=>response('Access denied. Please verify you are human to continue using this website.')}),/restricted/);
});
test('collector caches original capture timestamp within TTL',async()=>{let calls=0;const opts={clock:()=>1e12,fetcher:async()=>{calls++;return response('An approved public page containing sufficient background context for our synthetic demo application.');}};const a=await collect('oracle-rag',opts),b=await collect('oracle-rag',opts);assert.equal(calls,1);assert.equal(b.cached,true);assert.equal(a.retrievedAt,b.retrievedAt);});
test('cross-origin requests fail and null origins are not accepted',()=>{assert.equal(validOrigin({headers:{host:'localhost:4173',origin:'http://localhost:4173'}}),true);assert.equal(validOrigin({headers:{host:'localhost:4173',origin:'https://evil.example'}}),false);assert.equal(validOrigin({headers:{host:'localhost:4173',origin:'null'}}),false);});
async function invoke(body,headers={}){const req=Readable.from([body]);req.method='POST';req.headers={host:'localhost:4173','content-type':'application/json',...headers};const out={};const res={writeHead:(code)=>out.code=code,end:b=>out.body=JSON.parse(b)};await researchHandler(req,res,{collector:async()=>({mode:'Live public-source evidence'})});return out;}
test('API rejects customer payloads, malformed JSON, large bodies and cross-origin calls',async()=>{
 assert.equal((await invoke('{')).code,400);assert.equal((await invoke(JSON.stringify({sourceId:'uco',cif:'secret'}))).code,400);assert.equal((await invoke('x'.repeat(2050))).code,413);assert.equal((await invoke('{"sourceId":"uco"}',{origin:'https://evil.example'})).code,403);assert.equal((await invoke('{"sourceId":"uco"}')).code,200);
});

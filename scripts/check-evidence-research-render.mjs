import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
import {initialState,command,assess} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';
import {normaliseOCIResponse} from '../server/web-search.mjs';
import {grokResponse} from '../tests/fixtures/grok-response.mjs';

await mkdir('test-output',{recursive:true});
await build({stdin:{contents:"export {CounterpartyResearch} from './src/platform/Meeting.jsx'; export {LiveCompanyResult} from './src/platform/assistant/CounterpartyLiveResearch.jsx';",resolveDir:process.cwd(),sourcefile:'evidence-render-entry.mjs'},bundle:true,platform:'node',format:'esm',outfile:'test-output/evidence-components.mjs',loader:{'.png':'dataurl'},external:['react','react-dom','lucide-react']});
const {CounterpartyResearch,LiveCompanyResult}=await import('../test-output/evidence-components.mjs'),noop=()=>{};
const state=initialState();let count=0;
for(const r of state.records.filter(r=>r.research)){
 const user=personas.find(p=>p.branches.includes(r.branch)),props={r,a:assess(r,state.policy),s:state,user,run:noop,nav:noop,showEvidence:noop,busy:false};
 for(const mode of ['Offline workspace','Server workspace']){
  const html=renderToStaticMarkup(React.createElement(CounterpartyResearch,{...props,mode}));
  assert.ok(html.includes('Live company research'));assert.ok(html.includes('Recorded research example'));assert.ok(html.includes('Search &amp; summarise live'));assert.ok(!html.includes('no approved search, GST or MCA provider is configured'));assert.ok(!/\bNaN\b|>undefined</.test(html));count++;
 }
}
const s=command(initialState(),personas[0],{type:'researchReplay',recordId:'MT-BLUEFIN'}),r=s.records.find(r=>r.id==='MT-BLUEFIN'),subject={name:'Kaveri Trading',city:'',publicId:'',intent:'activity'};
const result=normaliseOCIResponse(grokResponse('Live company finding.'),subject);r.assistantResearch=[{...result,kind:'web'}];
const props={r,a:assess(r,s.policy),s,user:personas[0],run:noop,nav:noop,showEvidence:noop,busy:false,mode:'Server workspace'};
const html=renderToStaticMarkup(React.createElement(CounterpartyResearch,props));
for(const text of ['Live company finding.','Live source evidence','Officer review','Recorded research example','Company identity &amp; business activity','https://example.com/about'])assert.ok(html.includes(text),text);
assert.ok(html.includes('Attach to investigation'));assert.ok(html.includes('recorded 180 days'));
const empty=normaliseOCIResponse({status:'completed',output:[]},subject),blocked=renderToStaticMarkup(React.createElement(LiveCompanyResult,{...props,result:empty}));
assert.ok(blocked.includes('There is no source result to attach.'));assert.ok(/disabled=""[^>]*>.*?Attach to investigation/.test(blocked));
console.log('PASS: '+count+' counterparty renders, saved live sources alongside recorded examples, and uncited attachment blocked.');

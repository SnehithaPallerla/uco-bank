import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {initialState,assess} from '../src/platform/domain.js';
import {personas} from '../src/platform/catalogue.js';

await mkdir('test-output',{recursive:true});
await build({entryPoints:['src/platform/App.jsx'],bundle:true,platform:'node',format:'esm',outfile:'test-output/graph-components.mjs',loader:{'.png':'dataurl'},external:['react','react-dom','lucide-react']});
const {Workspace}=await import('../test-output/graph-components.mjs'),s=initialState(),noop=()=>{};
for(const r of s.records){
 const props={page:'graph',s,r,a:assess(r,s.policy),user:personas.find(p=>p.branches.includes(r.branch)),showEvidence:noop};
 const local=renderToStaticMarkup(React.createElement(Workspace,{...props,mode:'Offline workspace'}));
 assert.ok(local.includes('Local demonstration graph'));assert.ok(local.includes('network-canvas'));assert.ok(!/\bNaN\b|>undefined</.test(local),r.id);
 if(r.id==='MT-BLUEFIN'){assert.equal((local.match(/class="graph-edge-line"/g)||[]).length,3);for(const amount of ['12,00,000','15,00,000','18,00,000'])assert.ok(local.includes(amount));assert.ok(local.includes('aria-pressed="false"'));}
 const server=renderToStaticMarkup(React.createElement(Workspace,{...props,mode:'Server workspace'}));
 assert.ok(server.includes('Loading the funds graph'));assert.ok(!server.includes('network-canvas'));assert.ok(!server.includes('Local demonstration graph'));
}
console.log('PASS: '+s.records.length+' local graph renders and '+s.records.length+' server loading renders.');

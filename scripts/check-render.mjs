import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
import {initialState,evaluate,createCase,caseAction} from '../src/diversion/engine.js';
import {makeRecord,templates} from '../src/diversion/data.js';
await mkdir('test-output',{recursive:true});
await build({entryPoints:['src/App.jsx'],bundle:true,platform:'node',format:'esm',outfile:'test-output/components.mjs',loader:{'.png':'dataurl'},external:['react','react-dom','lucide-react']});
const screens=await import('../test-output/components.mjs');
const s=initialState(),user={id:'analyst01',role:'Analyst'},noop=()=>{};
const caseId=createCase(s,s.records[0].id,user);
const props={s,r:s.records[0],e:evaluate(s.records[0],s.policy),user,update:noop,nav:noop,openRecord:noop,startCase:noop,caseId,setCaseId:noop};
for(const page of ['overview','borrower','transactions','graph','research','cases','assistant','rules','lab','validation','operations','architecture']){
 const html=renderToStaticMarkup(React.createElement(screens.Screen,{...props,page}));
 assert.ok(html.length>200,page+' renders markup');assert.ok(!/undefined|NaN/.test(html),page+' contains no undefined or NaN text');console.log('PASS screen:',page);
}
for(const template of templates){const r=makeRecord(template.id,800);for(const page of ['borrower','transactions','graph']){const html=renderToStaticMarkup(React.createElement(screens.Screen,{...props,r,e:evaluate(r,s.policy),page}));assert.ok(!/undefined|NaN/.test(html),template.id+' / '+page);}}
caseAction(s,caseId,'submit',user,'Review this synthetic payment','Suspected diversion',[s.records[0].transactions[0].id]);
for(const phase of ['pending','closed']){if(phase==='closed')caseAction(s,caseId,'approve',{id:'reviewer01',role:'Reviewer'},'Independent evidence review completed');const html=renderToStaticMarkup(React.createElement(screens.Screen,{...props,page:'cases'}));assert.ok(!/undefined|NaN/.test(html));console.log('PASS case state:',phase);}
const shell=renderToStaticMarkup(React.createElement(screens.default));assert.ok(shell.includes('UCO BANK'));assert.ok(shell.includes('data:image/png;base64,'));assert.ok(shell.includes('AI Assistant'));
const html=await readFile('dist/index.html','utf8');assert.ok(html.startsWith('<!doctype html>'));assert.ok(!/<script[^>]+src=/i.test(html));assert.ok(!/<link[^>]+stylesheet/i.test(html));assert.ok(html.includes('<style>'));console.log('PASS self-contained HTML and 54 scenario screen renders');

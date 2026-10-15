import {loadEnvFile} from 'node:process';
import {existsSync} from 'node:fs';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {OracleStore} from '../server/oracle-store.mjs';
import {personas} from '../src/platform/catalogue.js';
import {localFundsGraph} from '../src/platform/funds-graph.js';

if(existsSync('.env'))loadEnvFile('.env');
// init refreshes only the normalized graph projections from canonical Oracle
// record JSON. This check does not create tables/graphs or alter case decisions.
const store=await new OracleStore(process.env).init(),results=[];
const ids=paths=>paths.map(xs=>xs.map(t=>t.id).join('|')).sort();
try{
 for(const r of store.state.records){
  const user=personas.find(p=>p.branches.includes(r.branch));
  const actual=await store.readGraph(r,user),expected=localFundsGraph(r,store.state.revision);
  assert.deepEqual(actual.metrics,expected.metrics,r.id+' metrics');
  assert.deepEqual(ids(actual.paths),ids(expected.paths),r.id+' chronological paths');
  assert.deepEqual(actual.payments.map(t=>t.id).sort(),expected.payments.map(t=>t.id).sort(),r.id+' payment IDs');
  assert.equal(actual.relationships.length,expected.relationships.length,r.id+' verified relationships');
  results.push({recordId:r.id,payments:actual.payments.length,relationships:actual.relationships.length,paths:actual.paths.length});
  if(results.length%20===0)console.log('Verified '+results.length+' Oracle graphs');
 }
 await mkdir('test-output',{recursive:true});
 await writeFile('test-output/sql-graph-live-check.json',JSON.stringify({checkedAt:new Date().toISOString(),graph:'UCO_FLOW',source:'Live Oracle GRAPH_TABLE queries',revision:store.state.revision,records:results.length,results},null,2));
 console.log('PASS: live SQL graph parity across '+results.length+' records.');
}finally{await store.close();}

import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,scenario,ingest,setOnline,repair,queryGraph,score,alerts,createCase,caseAction,modelAction,activatePolicy,enrich,csv} from '../src/engine.js';

test('event reconciliation preserves raw exceptions and idempotent acceptance',()=>{
 const s=initialState();const initial=s.transactions.length;ingest(s,scenario(s,'duplicate')[0]);assert.equal(s.transactions.length,initial);assert.equal(s.events.at(-1).status,'Duplicate');
 ingest(s,scenario(s,'invalid')[0]);assert.equal(s.quarantine.length,1);assert.equal(s.quarantine[0].raw.amount,-12000);
 repair(s,s.quarantine[0].id,12000,'Analyst');assert.equal(s.transactions.length,initial+1);assert.equal(s.quarantine[0].raw.amount,-12000);assert.equal(s.quarantine[0].status,'Repaired');
 const counts=['Accepted','Duplicate','Pending','Quarantined'].map(k=>s.events.filter(e=>e.status===k).length);assert.equal(counts.reduce((a,b)=>a+b,0),s.events.length);
});
test('outage replay processes queued events exactly once',()=>{
 const s=initialState();const initial=s.transactions.length;setOnline(s,false);const event=scenario(s,'salary')[0];ingest(s,event);ingest(s,event);assert.equal(s.queue.length,2);assert.equal(s.transactions.length,initial);setOnline(s,true);assert.equal(s.transactions.length,initial+1);assert.equal(s.queue.length,0);assert.equal(s.events.at(-1).status,'Duplicate');setOnline(s,true);assert.equal(s.transactions.length,initial+1);
});
test('unknown accounts and corrections cannot silently overwrite ledger evidence',()=>{
 const s=initialState();const original=JSON.stringify(s.transactions[0]);ingest(s,{...s.transactions[0],version:2,amount:900000});assert.match(s.quarantine[0].reason,/correction/);assert.equal(JSON.stringify(s.transactions[0]),original);ingest(s,{...scenario(s,'salary')[0],to:'UNKNOWN'});assert.match(s.quarantine[1].reason,/known accounts/);
});
test('cycle query requires bounded, time-ordered transfers',()=>{
 const s=initialState();const q=queryGraph(s,'cycles',24,3);assert.equal(q.results.length,1);assert.deepEqual(q.results[0].edges,['TX1008','TX1009','TX1010']);assert.equal(queryGraph(s,'cycles',24,2).results.length,0);assert.equal(queryGraph(s,'cycles',1,3).results.length,0);
 s.transactions.find(t=>t.id==='TX1010').at=s.transactions.find(t=>t.id==='TX1008').at;assert.equal(queryGraph(s,'cycles',24,3).results.length,0);
});
test('fan-in, shared device and proximity queries derive relationships',()=>{
 const s=initialState();const fan=queryGraph(s,'fanin',24,3).results.find(r=>r.id==='F-A112');assert.ok(fan);assert.ok(fan.edges.includes('TX1015'));const device=queryGraph(s,'devices').results.find(r=>r.id==='D01');assert.deepEqual(device.nodes,['A101','A102','A111']);const prox=queryGraph(s,'proximity',24,2);assert.ok(prox.results[0].nodes.includes('A103'));assert.ok(prox.results[0].nodes.includes('A104'));
});
test('scoring excludes future events and is not changed by model registry activation',()=>{
 const s=initialState();const tx=s.transactions[0];const before=score(tx,s.transactions,s.policy);const future={...tx,id:'FUTURE',amount:10000000,from:'A101',at:'2026-09-23T00:00:00Z'};assert.deepEqual(score(tx,[...s.transactions,future],s.policy),before);
 const candidate=s.models[1];modelAction(s,candidate.id,'validate','Analyst');modelAction(s,candidate.id,'approve','Reviewer');modelAction(s,candidate.id,'activate','Reviewer');assert.deepEqual(score(tx,s.transactions,s.policy),before);
});
test('case evidence is frozen; enrichment and new policies do not rewrite snapshots',()=>{
 const s=initialState();const c=s.cases[0];const frozen=JSON.stringify(c.evidence);assert.equal(createCase(s,c.alertId,'Analyst'),c.id);assert.equal(s.cases.length,3);enrich(s,queryGraph(s),'Analyst');activatePolicy(s,{...s.policy,threshold:99},'Reviewer');assert.equal(JSON.stringify(c.evidence),frozen);assert.equal(c.evidence.policyVersion,1);assert.equal(s.policy.version,2);assert.throws(()=>activatePolicy(s,{...s.policy,fanIn:NaN},'Reviewer'),/values/);
});
test('case closure requires rationale and escalations require reviewer authority',()=>{
 const s=initialState();const id=s.cases[0].id;assert.throws(()=>caseAction(s,id,'close','Analyst','short'),/rationale/);caseAction(s,id,'claim','Analyst');caseAction(s,id,'note','Analyst','Reviewed sample customer profile.');caseAction(s,id,'escalate','Analyst','Potential cycle requires further review.');assert.throws(()=>caseAction(s,id,'approve','Analyst','Evidence reviewed and approved.'),/Reviewer/);caseAction(s,id,'approve','Reviewer','Evidence reviewed; demonstration closed.');assert.equal(s.cases[0].status,'Closed');assert.throws(()=>caseAction(s,id,'note','Reviewer','Should be immutable'),/read only/);assert.ok(!s.cases[0].regulatorySubmission);
});
test('model lifecycle enforces validation, approval and rollback transitions',()=>{
 const s=initialState();const id=s.models[1].id;assert.throws(()=>modelAction(s,id,'activate','Reviewer'),/approved/);modelAction(s,id,'validate','Analyst');assert.throws(()=>modelAction(s,id,'approve','Analyst'),/Reviewer/);modelAction(s,id,'approve','Reviewer');modelAction(s,id,'activate','Reviewer');assert.equal(s.models.filter(x=>x.status==='Active').length,1);assert.equal(s.activeModel,id);modelAction(s,'OML-01','rollback','Reviewer');assert.equal(s.activeModel,'OML-01');assert.equal(s.models.filter(x=>x.status==='Active').length,1);
});
test('CSV exports quote cells and neutralize spreadsheet formulas',()=>{assert.equal(csv([['=HYPERLINK("bad")','simple,comma','line\nbreak']]),'"\'=HYPERLINK(""bad"")","simple,comma","line\nbreak"');});

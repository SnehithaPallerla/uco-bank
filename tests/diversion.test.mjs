import test from 'node:test';
import assert from 'node:assert/strict';
import {copy,makeRecord,templates,syntheticResearch,sampleQuestions} from '../src/diversion/data.js';
import {initialState,evaluate,fundTrace,validation,addScenario,setOnline,ingest,createCase,caseAction,proposePolicy,approvePolicy,answer,packet} from '../src/diversion/engine.js';
const analyst={id:'a1',role:'Analyst'},reviewer={id:'r1',role:'Reviewer'};
const has=(r,id,p=initialState().policy)=>evaluate(r,p).findings.some(f=>f.id===id);

test('all 16 rules have meaningful scenario coverage, including context-only T04',()=>{
 const s=initialState(),v=validation(s,templates.map((t,i)=>makeRecord(t.id,1000+i)));
 assert.equal(v.coverage.length,16);assert.equal(v.tp,13);assert.equal(v.tn,5);assert.equal(v.fp,0);assert.equal(v.fn,0);
 assert.equal(evaluate(makeRecord('reopen'),s.policy).severity,'Context');
});
test('written approved supplier, FD margin and dealer cases are excluded',()=>{
 for(const kind of ['approved','margin','dealer'])assert.equal(evaluate(makeRecord(kind),initialState().policy).findings.length,0);
 const r=makeRecord('margin');r.transactions[0].approval='Unknown';assert.ok(has(r,'T03'));
});
test('unlinked sales receipts do not create loan-funded investment findings',()=>{
 const r=makeRecord('unlinked');assert.equal(evaluate(r,initialState().policy).findings.length,0);assert.equal(fundTrace(r).reduce((n,t)=>n+t.allocated,0),0);
});
test('fund attribution does not double-count cycle legs or exceed drawdown',()=>{
 const r=makeRecord('cycle');assert.equal(fundTrace(r).reduce((n,t)=>n+t.allocated,0),1500000);
 r.facility.drawn=1000000;assert.equal(fundTrace(r).reduce((n,t)=>n+t.allocated,0),1000000);
});
test('pre-drawdown payments cannot be attributed to the facility drawdown',()=>{
 const r=makeRecord('related');r.transactions[0].at=new Date(Date.parse(r.facility.drawnAt)-1).toISOString();assert.equal(fundTrace(r)[0].allocated,0);assert.equal(has(r,'T07'),false);
});
test('a time-reversed cycle fails chronological cycle detection',()=>{
 const r=makeRecord('cycle');assert.ok(has(r,'T13'));r.transactions[2].at=r.facility.drawnAt;assert.equal(has(r,'T13'),false);
});
test('investment classification, related-party verification and FD linkage are required',()=>{
 const a=makeRecord('investment');a.classifications[0].verified=false;assert.equal(has(a,'T02'),false);
 const b=makeRecord('related');b.relations[0].verified=false;assert.equal(has(b,'T07'),false);
 const c=makeRecord('fd');c.fds[0].fundingTx='UNRELATED';assert.equal(has(c,'T03'),false);
});
test('T04 checks matching CIF and closure before opening',()=>{
 const r=makeRecord('reopen');assert.ok(has(r,'T04'));r.history[1].cif='other';assert.equal(has(r,'T04'),false);
});
test('threshold/window changes alter findings without reading fixture truth',()=>{
 const r=makeRecord('related'),s=initialState(),original=evaluate(r,s.policy);r.kind='approved';assert.deepEqual(evaluate(r,s.policy),original);
 s.policy.rules=s.policy.rules.map(x=>({...x,minAmount:50000000}));assert.equal(evaluate(r,s.policy).findings.length,0);
});
test('duplicates are idempotent; paused events replay; invalid amounts quarantine',()=>{
 const s=initialState(),n=s.records.length;addScenario(s,'related',1,'Duplicate');assert.equal(s.records.length,n);assert.equal(s.events[0].status,'Duplicate');
 setOnline(s,false);addScenario(s,'cycle');assert.equal(s.records.length,n);assert.equal(s.queue.length,1);setOnline(s,true);assert.equal(s.records.length,n+1);assert.equal(s.queue.length,0);
 addScenario(s,'related',1,'Invalid amount');assert.equal(s.quarantine.length,1);assert.equal(s.records.length,n+1);
});
test('late events are accepted with explicit late indicator',()=>{const s=initialState();addScenario(s,'related',1,'Late delivery');assert.equal(s.events[0].status,'Accepted');assert.ok(s.events[0].late);});
test('duplicate transaction IDs are quarantined',()=>{const s=initialState(),r=makeRecord('repeat',900);r.transactions[1].id=r.transactions[0].id;ingest(s,r);assert.equal(s.events[0].status,'Quarantined');});
test('case snapshot stays frozen after record and policy changes',()=>{
 const s=initialState(),id=createCase(s,s.records[0].id,analyst),c=s.cases[0],frozen=copy(c.snapshot);s.records[0].transactions[0].amount=5;s.policy.version=9;assert.deepEqual(c.snapshot,frozen);assert.equal(packet(s,c).mode,'Synthetic');assert.equal(id,c.id);
});
test('case review enforces separate reviewer, evidence and immutable closure',()=>{
 const s=initialState(),id=createCase(s,s.records[0].id,analyst),ref=s.records[0].transactions[0].id;
 assert.throws(()=>caseAction(s,id,'submit',analyst,'Reviewed the record','Suspected diversion',[]),/evidence/);
 assert.throws(()=>caseAction(s,id,'response',analyst,'Documents supplied'),/request first/);
 caseAction(s,id,'request',analyst,'Request supplier invoices');caseAction(s,id,'response',analyst,'Borrower supplied documents');
 caseAction(s,id,'submit',analyst,'Insufficient approval support','Suspected diversion',[ref]);
 assert.throws(()=>caseAction(s,id,'request',analyst,'Another request'),/independent/);
 assert.throws(()=>caseAction(s,id,'approve',analyst,'Approve the outcome'),/Reviewer/);
 assert.throws(()=>caseAction(s,id,'approve',{...reviewer,id:'a1'},'Approve the outcome'),/different/);
 caseAction(s,id,'approve',reviewer,'Evidence reviewed independently');assert.equal(s.cases[0].outcome,'Suspected diversion');assert.equal(s.cases[0].status,'Closed');
 assert.throws(()=>caseAction(s,id,'note',analyst,'Changing a closed record'),/read only/);
});
test('case references must exist and unavailable research cannot support decision',()=>{
 const s=initialState(),r=s.records[0],id=createCase(s,r.id,analyst);const x=syntheticResearch(r,'Unavailable');s.research.push(x);
 assert.throws(()=>caseAction(s,id,'submit',analyst,'Reviewed this evidence','Confirmed diversion',[x.id]),/evidence/);
});
test('policy approval requires independent reviewer and valid rules',()=>{
 const s=initialState(),rules=copy(s.policy.rules);rules[0].minAmount=1;proposePolicy(s,rules,analyst);assert.throws(()=>approvePolicy(s,analyst),/Reviewer/);assert.throws(()=>approvePolicy(s,{id:'a1',role:'Reviewer'}),/different/);approvePolicy(s,reviewer);assert.equal(s.policy.version,2);assert.equal(s.policy.rules[0].minAmount,1);
 const bad=copy(rules);bad[1]=copy(bad[0]);assert.throws(()=>proposePolicy(s,bad,analyst),/Check/);
});
test('synthetic metrics respond to false negatives, zero denominators and false positives',()=>{
 const s=initialState();s.policy.rules.forEach(r=>r.enabled=false);const v=validation(s,[makeRecord('related')]);assert.equal(v.fn,1);assert.equal(v.precision,null);assert.equal(v.recall,0);
 const other=initialState();other.policy.rules.forEach(r=>{r.excludeApproved=false;r.excludeApprovedPayee=false;});assert.ok(validation(other,[makeRecord('margin')]).fp>0);
});
test('assistant answers are grounded, read-only and explicit about limitations',()=>{
 const s=initialState(),before=copy(s),r=s.records[0];for(const q of sampleQuestions){const a=answer(q,r,s);assert.ok(a.text.length>30);assert.ok(!/undefined|NaN/.test(a.text));}assert.deepEqual(s,before);
 assert.match(answer('Does this prove fraud?',r,s).text,/does not by itself establish fraud/);
 assert.match(answer('What evidence links the beneficiary?',makeRecord('investment'),s).text,/No verified relationship/);
});

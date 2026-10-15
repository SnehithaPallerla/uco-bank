import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,scenario,ingest,activatePolicy,caseAction,queryGraph} from '../src/engine.js';
import {answerQuestion,sampleQuestions} from '../src/assistant.js';

test('all sample questions have supported, evidenced answers',()=>{
 const s=initialState();for(const q of sampleQuestions){const a=answerQuestion(q.question,s);assert.ok(!['unsupported','missing'].includes(a.intent),q.question);assert.ok(a.summary.length>30);assert.ok(a.sources.length>0,q.question);assert.ok(a.actions.length>0,q.question);assert.equal(a.snapshot.transactionCount,s.transactions.length);}
});
test('assistant is read only and summaries reflect new events',()=>{
 const s=initialState(),before=JSON.stringify(s);const a=answerQuestion('Give me today’s monitoring summary.',s);assert.equal(a.metrics[0].value,24);assert.equal(JSON.stringify(s),before);ingest(s,scenario(s,'salary')[0]);const b=answerQuestion('Give me today’s monitoring summary.',s);assert.equal(b.metrics[0].value,25);assert.equal(a.metrics[0].value,24);
});
test('transaction explanations reference current policy while case briefs preserve captured evidence',()=>{
 const s=initialState();activatePolicy(s,{...s.policy,minAmount:950000},'Reviewer');const a=answerQuestion('Explain why TX1008 was flagged.',s);assert.equal(a.context.txId,'TX1008');assert.ok(a.sources.some(x=>x.label==='Policy v2'));const c=s.cases[0];const b=answerQuestion('Summarise '+c.id+' for the reviewer.',s);assert.ok(b.bullets.some(x=>x.includes('policy v1; current policy is v2')));assert.equal(b.context.caseId,c.id);
});
test('graph answers have exact computed cycle references and valid routes',()=>{
 const s=initialState();const a=answerQuestion('Show circular money movements.',s);assert.equal(a.table.rows.length,queryGraph(s).results.length);assert.ok(a.sources.some(x=>x.label==='TX1008'));assert.equal(a.actions[0].pattern,'cycles');const d=answerQuestion('Which accounts share a device?',s);assert.equal(d.table.rows[0][1],'A101, A102, A111');const f=answerQuestion('Show fan-in activity for A112.',s);assert.equal(f.table.rows.length,1);assert.equal(f.context.accountId,'A112');
});
test('follow-up review steps retain case context',()=>{
 const s=initialState();const a=answerQuestion('Summarise CASE-1001 for the reviewer.',s);const b=answerQuestion('What should I review next?',s,a.context);assert.equal(b.context.caseId,'CASE-1001');assert.equal(b.actions[0].caseId,'CASE-1001');
});
test('unknown IDs, unsupported requests and official-policy questions do not invent evidence',()=>{
 const s=initialState();for(const q of ['Explain TX99999','Summarise CASE-9999','Show fan-in for A999'])assert.equal(answerQuestion(q,s).intent,'missing');assert.equal(answerQuestion('What is the capital of France?',s).intent,'unsupported');assert.equal(answerQuestion('What is UCO Bank internal policy?',s).intent,'policy-boundary');assert.ok(answerQuestion('What is UCO Bank internal policy?',s).summary.includes('does not contain'));
});
test('assistant does not perform decisions or operational actions',()=>{
 const s=initialState(),before=JSON.stringify(s);for(const q of ['Close CASE-1001','Approve CASE-1001','Delete TX1008','Pause consumer'])assert.equal(answerQuestion(q,s).intent,'read-only');assert.equal(JSON.stringify(s),before);
});
test('case brief reflects notes without changing their content',()=>{
 const s=initialState();caseAction(s,'CASE-1001','note','Analyst','Reviewed the fictional invoice and account context.');const a=answerQuestion('Summarise CASE-1001 for the reviewer.',s);assert.ok(a.bullets.some(x=>x.includes('fictional invoice')));assert.ok(a.sources.some(x=>x.caseId==='CASE-1001'));
});

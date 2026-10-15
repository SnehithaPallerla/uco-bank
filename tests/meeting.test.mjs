import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,assess,command,answer,upgradeState,exportRecord} from '../src/platform/domain.js';
import {personas,clone} from '../src/platform/catalogue.js';
const analyst=personas[0],restricted=personas.find(p=>p.id==='neha');
const get=id=>initialState().records.find(r=>r.id===id);
test('five meeting triggers have distinct review and documented-explanation cases',()=>{
 for(const [id,rule] of [['BLUEFIN','T01'],['CAPITAL','T02'],['FD','T03'],['REOPEN','T04'],['RETAIL','T05']]){
  const a=assess(get('MT-'+id));assert.ok([...a.findings,...a.contexts].some(f=>f.rule===rule),id);
  assert.equal(assess(get('MT-'+id+'-OK')).outcome,'Supported',id+' explained');
 }
 const blue=assess(get('MT-BLUEFIN'));assert.equal(blue.reviewInr,4500000);assert.equal(blue.findings.length,1);assert.deepEqual(blue.flaggedIds,['MT-BLUEFIN-TX01','MT-BLUEFIN-TX02','MT-BLUEFIN-TX03']);
});
test('credit-only repetitions are context tasks, exclude future/refund/failed events, and accept receipt reconciliation',()=>{
 const r=get('MT-CREDITS'),a=assess(r);assert.equal(a.outcome,'Context review');assert.equal(a.reviewInr,0);assert.equal(a.findings.length,0);assert.equal(a.attentionIds.length,3);
 for(const mutate of [t=>t.postedAt='2026-10-01T12:00:00+05:30',t=>t.kind='refund',t=>t.status='failed']){const x=clone(r);mutate(x.transactions[2]);assert.equal(assess(x).contexts.length,0);}
 r.evidence.push({id:'RECONCILIATION',kind:'receipt_reconciliation',status:'accepted',payload:{transactionIds:r.transactions.map(t=>t.id)}});assert.equal(assess(r).contexts.length,0);
});
test('market narration creates an evidence task without a verified investment classification',()=>{
 const r=get('MT-CAPITAL-PATTERN'),a=assess(r);assert.equal(a.reviewInr,0);assert.equal(a.findings.length,0);assert.ok(a.gaps.some(f=>f.rule==='T02'));
 r.evidence.find(e=>e.kind==='payment_narration').status='unverified';assert.ok(!assess(r).gaps.some(f=>f.rule==='T02'));
});
test('research replay preserves captures, resolves citations, remains idempotent and does not clear T01',()=>{
 let s=initialState();const before=answer(s.records.find(r=>r.id==='MT-BLUEFIN'),analyst,'What does the company research show?',s.policy);assert.match(before.text,/not yet been assessed/);
 s=command(s,analyst,{type:'researchReplay',recordId:'MT-BLUEFIN'});const r=s.records.find(r=>r.id==='MT-BLUEFIN');assert.equal(r.research.evidenceIds.length,2);assert.equal(assess(r).reviewInr,4500000);assert.equal(r.relationships.length,0);
 for(const id of r.research.evidenceIds){const e=r.evidence.find(e=>e.id===id);assert.equal(e.status,'recorded');assert.match(e.payload.url,/\.example\//);assert.match(e.capturedAt,/2026-09-24/);}
 const response=answer(r,analyst,'What does the company research show?',s.policy);assert.match(response.text,/no live search/i);assert.ok(response.refs.every(id=>r.evidence.some(e=>e.id===id)));assert.equal(response.refs.length,3);
 const again=command(s,analyst,{type:'researchReplay',recordId:r.id});assert.equal(again.revision,s.revision);assert.equal(again.records.find(r=>r.id==='MT-BLUEFIN').evidence.length,r.evidence.length);
});
test('provider outage retains prior evidence and adds no adverse finding',()=>{
 let s=command(initialState(),analyst,{type:'researchReplay',recordId:'MT-BLUEFIN'});const before=clone(s.records.find(r=>r.id==='MT-BLUEFIN'));
 s=command(s,analyst,{type:'researchUnavailable',recordId:'MT-BLUEFIN'});const after=s.records.find(r=>r.id==='MT-BLUEFIN');assert.deepEqual(after.evidence,before.evidence);assert.deepEqual(assess(after),assess(before));assert.equal(after.researchAttempts[0].liveRequestMade,false);
});
test('research request is a transaction-specific draft with source snapshots and branch authorization',()=>{
 let s=initialState();assert.throws(()=>command(s,restricted,{type:'researchReplay',recordId:'MT-BLUEFIN'}),/Access denied/);assert.throws(()=>command(s,analyst,{type:'prepareResearchRequest',recordId:'MT-BLUEFIN'}),/Review the counterparty/);
 s=command(s,analyst,{type:'researchReplay',recordId:'MT-BLUEFIN'});s=command(s,analyst,{type:'prepareResearchRequest',recordId:'MT-BLUEFIN'});const c=s.cases.at(-1);assert.equal(c.status,'Evidence needed');assert.equal(c.drafts[0].status,'Draft · not sent');for(const n of ['01','02','03'])assert.match(c.drafts[0].text,new RegExp('MT-BLUEFIN-TX'+n));assert.ok(c.evidenceSnapshot.some(e=>e.kind==='recorded_company_research'));const packet=exportRecord(s.records.find(r=>r.id==='MT-BLUEFIN'),analyst,s);assert.equal(packet.record.research.completed,true);
});
test('old workspaces gain meeting records without replacing cases, evidence, or approved policy',()=>{
 let old=initialState();old.records=old.records.filter(r=>r.profile!=='meeting');delete old.appVersion;old.policy.repeatHours=72;old=command(old,analyst,{type:'openCase',recordId:'HL01'});const before=clone(old.cases);
 const next=upgradeState(old);assert.equal(next.records.filter(r=>r.profile==='meeting').length,12);assert.deepEqual(next.cases,before);assert.equal(next.policy.repeatHours,72);assert.equal(next.revision,old.revision+1);assert.deepEqual(upgradeState(next),next);
});

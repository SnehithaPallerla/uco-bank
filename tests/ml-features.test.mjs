import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogue,clone} from '../src/platform/catalogue.js';
import {extractFeatures,FEATURES} from '../server/ml-features.mjs';
import {localFundsGraph} from '../src/platform/funds-graph.js';
import {trainingGroups} from '../scripts/train-ml.mjs';
import {proxyTarget,TARGET_MAPPING} from '../server/ml-proxy-targets.mjs';
const rows=catalogue(),get=id=>clone(rows.find(r=>r.id===id));
test('ML features use measurements, not rule results, labels, profile or names',async()=>{
 const r=get('MT-BLUEFIN'),before=extractFeatures(r);r.expected={flagged:false};r.ruleScore=100;r.outcome='Supported';r.primaryTrigger='T03';r.profile='invented';r.borrower.name='Another name';r.title='flagged';
 assert.deepEqual(extractFeatures(r).values,before.values);assert.equal(Object.keys(before.values).length,FEATURES.length);assert.equal(before.values.max_party_count,3);assert.equal(before.values.party_concentration,1);
 const source=await readFile(new URL('../server/ml-features.mjs',import.meta.url),'utf8');assert.ok(!/\bassess\s*\(/.test(source));
});
test('commercial context changes features without changing repeated-payment behaviour',()=>{
 const a=extractFeatures(get('MT-BLUEFIN')),b=extractFeatures(get('MT-BLUEFIN-OK'));assert.equal(a.values.max_party_count,b.values.max_party_count);assert.equal(a.values.delivery_share,0);assert.equal(b.values.delivery_share,1);
});
test('future transactions and evidence never enter a historical snapshot',()=>{
 const r=get('MT-BLUEFIN-OK'),base=extractFeatures(r);const future=clone(r.transactions[0]);future.id='FUTURE';future.amountInr=99999999;future.postedAt='2030-01-01T00:00:00Z';future.receivedAt=future.postedAt;r.transactions.push(future);
 assert.deepEqual(extractFeatures(r).values,base.values);r.evidence.filter(e=>e.kind==='invoice').forEach(e=>e.capturedAt='2030-01-01T00:00:00Z');assert.equal(extractFeatures(r).values.invoice_share,0);
});
test('invalid and empty observations are unscored; unknown history stays missing',()=>{
 assert.equal(extractFeatures(get('BOUND-INVALID')).eligible,false);assert.equal(extractFeatures(get('BOUND-FAILED')).eligible,false);
 const r=get('MT-BLUEFIN');r.entities.forEach(e=>delete e.historyPaymentCount180d);assert.equal(extractFeatures(r).values.new_party_share,null);
});
test('graph paths, explicit FD linkage and approvals are measured with evidence',()=>{
 assert.ok(extractFeatures(get('CL05')).values.cycle_count>0);assert.ok(extractFeatures(get('MT-FD')).values.fd_share>0);
 assert.equal(extractFeatures(get('MT-FD')).values.approval_share,0);assert.equal(extractFeatures(get('MT-FD-OK')).values.approval_share,1);
 for(const r of rows)assert.deepEqual(extractFeatures(r).values,extractFeatures(r,localFundsGraph(r)).values);
});
test('authored clones and comparator payment structures stay in one split group',()=>{
 const groups=trainingGroups(rows);assert.equal(groups['MT-BLUEFIN'],groups['MT-BLUEFIN-OK']);assert.equal(groups['MT-BLUEFIN'],groups['LAB-001']);assert.ok(new Set(Object.values(groups)).size>=4);
});
test('direct trigger indicators remain visible when supporting evidence explains the pattern',()=>{
 const a=extractFeatures(get('MT-BLUEFIN')),b=extractFeatures(get('MT-BLUEFIN-OK'));
 assert.equal(a.values.trigger_T01,1);assert.equal(b.values.trigger_T01,1);
 assert.equal(proxyTarget(get('MT-BLUEFIN')).label,1);assert.equal(proxyTarget(get('MT-BLUEFIN-OK')).label,0);
 assert.equal(a.values.commercial_share,0);assert.equal(b.values.commercial_share,1);
 for(const id of ['T02','T03','T04','T05'])assert.equal(extractFeatures(get(({T02:'MT-CAPITAL',T03:'MT-FD',T04:'MT-REOPEN',T05:'MT-RETAIL'})[id])).values['trigger_'+id],1);
});
test('proxy targets explicitly route evidence/context work to review and exclude data-quality failures',()=>{
 assert.equal(TARGET_MAPPING['Evidence needed'],1);assert.equal(TARGET_MAPPING['Context review'],1);assert.equal(proxyTarget(get('BOUND-INVALID')).label,null);
 const r=get('MT-BLUEFIN');r.expected={flagged:false};r.ruleScore=0;r.outcome='Supported';assert.equal(proxyTarget(r).label,1);
 const source=extractFeatures(r);assert.ok(!Object.keys(source.values).some(k=>/outcome|label|score|finding_count/.test(k)));
});

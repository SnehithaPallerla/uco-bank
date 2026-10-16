import {createHash} from 'node:crypto';
import {traceFunds,chronologicalPaths} from '../src/platform/domain.js';
import {policyDefault} from '../src/platform/catalogue.js';

export const FEATURE_VERSION='uco-review-features-2';
export const featurePolicy=policy=>({...policyDefault,...policy});
export const WINDOW_DAYS=30;
export const FEATURES=[
 ...['T01','T02','T03','T04','T05','EU01','EU02','EU04','EU06','EU07','T08','T09','T10','T11','T12','T14','T15','T16'].map(id=>['trigger_'+id,id+' observed pattern',id]),
 ['payment_count','Outgoing payment count','T01'],
 ['max_party_count','Maximum payments to one party','T01'],
 ['party_concentration','Largest recipient share','T01'],
 ['max_credit_count','Maximum credits from one party','T01'],
 ['return_share','Observed return / direct outflow','Graph'],
 ['investment_share','Verified investment outflow share','T02'],
 ['fd_share','Loan-linked UCO FD / drawdown','T03'],
 ['reopen_count','Same-CIF reopening events','T04'],
 ['reopen_gap_days','Shortest closure-to-reopening days','T04'],
 ['migration_documented','Accepted migration explanation','T04'],
 ['external_share','External-bank outflow share','T05'],
 ['payee_mismatch_share','Sanctioned-payee mismatch share','T05'],
 ['outflow_drawdown_share','Direct outflow / drawdown','Flow'],
 ['first_outflow_hours','First outflow after drawdown (hours)','Flow'],
 ['new_party_share','Outflow to parties with no recorded 180-day payments','Flow'],
 ['cash_share','Cash outflow share','Flow'],
 ['cycle_count','Observed chronological return paths','Graph'],
 ['cycle_hops','Shortest return-path length','Graph'],
 ['related_share','Verified related-party outflow share','Graph'],
 ['intermediary_count','Observed intermediaries reaching related parties','Graph'],
 ['invoice_share','Accepted matching invoice coverage','Evidence'],
 ['delivery_share','Accepted invoice and delivery coverage','Evidence'],
 ['approval_share','Applicable approval coverage','Evidence'],
 ['use_mismatch_share','Documented use outside sanctioned categories','Evidence'],
 ['identity_unknown_share','Unresolved recipient identity share','Coverage'],
 ['unlinked_share','Outflow without established loan allocation','Coverage'],
 ['reversal_share','Confirmed reversed / direct outflow','Coverage'],
 ['mixed_balance','Pre-drawdown balance present','Coverage'],
 ['commercial_share','Accepted commercial support coverage','Evidence'],
 ['invoice_amount_mismatch','Invoice amount discrepancies','Evidence'],
 ['invoice_duplicate_count','Duplicate accepted invoice numbers','Evidence'],
 ['external_evidence_gap','Incomplete external verification records','Evidence'],
 ['utilisation_shortfall_share','Overdue utilisation evidence / drawdown','Evidence'],
 ['route_approval','Accepted route or settlement approval','Evidence'],
 ['receipt_reconciled','Accepted receipt reconciliation','Evidence'],
];
const sum=(rows,f=x=>x)=>rows.reduce((n,x)=>n+f(x),0);
const time=Date.parse;
const ratio=(n,d)=>d>0?n/d:0;
export const featureDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function availableRecord(record){
 const cutoff=time(record.asOf);
 return {...record,evidence:(record.evidence||[]).filter(e=>['accepted','verified_fixture'].includes(e.status)&&(!e.capturedAt||time(e.capturedAt)<=cutoff)&&(!e.effectiveAt||time(e.effectiveAt)<=cutoff)),transactions:(record.transactions||[]).filter(t=>(!Number.isFinite(time(t.postedAt))||time(t.postedAt)<=cutoff)&&(!t.receivedAt||time(t.receivedAt)<=cutoff))};
}
export function extractFeatures(record,graph=null,policy=policyDefault){
 policy=featurePolicy(policy);
 const cutoff=time(record.asOf),start=cutoff-WINDOW_DAYS*86400000;
 const available=e=>['accepted','verified_fixture'].includes(e.status)&&(!e.capturedAt||time(e.capturedAt)<=cutoff)&&(!e.effectiveAt||time(e.effectiveAt)<=cutoff);
 const evidence=(record.evidence||[]).filter(available),acceptedIds=new Set(evidence.map(e=>e.id));
 const transactions=(record.transactions||[]).filter(t=>(!Number.isFinite(time(t.postedAt))||time(t.postedAt)<=cutoff)&&(!t.receivedAt||time(t.receivedAt)<=cutoff));
 const r={...record,transactions,evidence},trace=traceFunds(r);
 const posted=trace.transactions.filter(t=>t.status==='posted'&&t.observed!==false&&time(t.postedAt)>=start&&time(t.postedAt)<=cutoff);
 const direct=posted.filter(t=>t.from===r.borrower.id&&t.kind!=='reversal'),credits=posted.filter(t=>t.to===r.borrower.id&&t.kind!=='reversal');
 const total=sum(direct,t=>t.residualInr),outflow=sum(direct,t=>t.amountInr),drawn=sum(trace.drawdowns.filter(d=>time(d.at)<=cutoff),d=>d.amountInr);
 const entity=id=>r.entities.find(e=>e.id===id),share=predicate=>ratio(sum(direct.filter(predicate),t=>t.residualInr),total);
 const counts=rows=>Object.values(rows.reduce((a,t)=>(a[t.from===r.borrower.id?t.to:t.from]=(a[t.from===r.borrower.id?t.to:t.from]||0)+1,a),{}));
 const partyTotals=Object.values(direct.reduce((a,t)=>(a[t.to]=(a[t.to]||0)+t.residualInr,a),{}));
 const relationships=(graph?.relationships||r.relationships||[]).filter(x=>x.verified&&acceptedIds.has(x.evidenceId)&&(!x.validFrom||time(x.validFrom)<=cutoff)&&(!x.validTo||time(x.validTo)>=cutoff));
 const related=new Set(relationships.filter(x=>x.from===r.borrower.id).map(x=>x.to));
 // Recalculate paths from the time-filtered graph payments: GRAPH_TABLE paths may
 // include documents/transactions that became available after this snapshot.
 const graphTx=graph?transactions.filter(t=>graph.payments.some(g=>g.id===t.id)):transactions;
 const paths=chronologicalPaths({...r,transactions:graphTx.filter(t=>time(t.postedAt)>=start)});
 let invoiceAmount=0,deliveryAmount=0,approvalAmount=0,commercialAmount=0,invoiceMismatch=0,recipientMismatch=0;const used={};
 for(const t of direct){
  const inv=evidence.find(e=>e.kind==='invoice'&&(e.id===t.useEvidenceId||e.payload.transactionId===t.id)&&e.payload.project===r.facility.project&&e.payload.amountInr===t.amountInr&&(e.payload.sellerEntityId===t.to||evidence.some(a=>a.kind==='payment_assignment'&&a.payload.transactionId===t.id&&a.payload.payeeId===t.to&&a.payload.sellerEntityId===e.payload.sellerEntityId)));
  if(inv){invoiceAmount+=t.residualInr;const delivered=evidence.some(e=>e.kind==='goods_receipt'&&e.payload.project===r.facility.project&&(e.payload.invoiceId===inv.id||e.payload.transactionId===t.id));if(delivered)deliveryAmount+=t.residualInr;if(delivered||['builder_payment','vehicle','fixed_deposit','investment','debt_repayment'].includes(t.documentedUseCategory))commercialAmount+=t.residualInr;}
  const invoices=evidence.filter(e=>e.kind==='invoice'&&(e.id===t.useEvidenceId||e.payload.transactionId===t.id));
  if(invoices.some(e=>e.payload.amountInr!==t.amountInr))invoiceMismatch++;
  if(invoices.some(e=>e.payload.sellerEntityId!==t.to&&!evidence.some(a=>a.kind==='payment_assignment'&&a.payload.transactionId===t.id)))recipientMismatch++;
  let uncovered=t.residualInr;
  for(const a of r.exceptions||[]){if(a.status!=='approved'||!acceptedIds.has(a.evidenceId)||a.payeeId!==t.to||a.project!==r.facility.project||a.category!==t.documentedUseCategory||time(t.postedAt)<time(a.validFrom)||time(t.postedAt)>time(a.validTo))continue;const cover=Math.min(uncovered,Math.max(0,a.maxAmountInr-(used[a.id]||0)));used[a.id]=(used[a.id]||0)+cover;uncovered-=cover;approvalAmount+=cover;}
 }
 const history=r.history||[],gaps=[];
 for(const a of history.filter(x=>x.cif===r.borrower.cif&&x.closed&&time(x.closed)<=cutoff))for(const b of history.filter(x=>x.cif===a.cif&&x.opened&&time(x.opened)<=cutoff&&time(x.opened)>time(a.closed)))gaps.push((time(b.opened)-time(a.closed))/86400000);
 const first=direct.length?Math.min(...direct.map(t=>(time(t.postedAt)-time(r.facility.drawdownAt))/3600000)):null;
 const v={payment_count:direct.length,max_party_count:Math.max(0,...counts(direct)),party_concentration:ratio(Math.max(0,...partyTotals),total),max_credit_count:Math.max(0,...counts(credits)),return_share:ratio(sum(credits,t=>t.amountInr),outflow),
  investment_share:share(t=>(r.classifications||[]).some(c=>c.entity===t.to&&c.verified&&c.category==='Investment'&&acceptedIds.has(c.evidenceId))),
  fd_share:ratio(sum(direct.filter(t=>(r.fds||[]).some(f=>f.bank==='UCO'&&f.fundingTx===t.id&&acceptedIds.has(f.evidenceId))),t=>Math.min(t.residualInr,t.activeLoanInr)),drawn),
  reopen_count:gaps.length,reopen_gap_days:gaps.length?Math.min(...gaps):null,migration_documented:Number(acceptedIds.has(r.historyApproval)),external_share:share(t=>/Other|External/i.test(entity(t.to)?.bankScope||'')),
  payee_mismatch_share:share(t=>(r.facility.restrictedPayeeIds||[]).length>0&&!r.facility.restrictedPayeeIds.includes(t.to)),outflow_drawdown_share:drawn>0?total/drawn:null,first_outflow_hours:first,
  new_party_share:direct.some(t=>entity(t.to)?.historyPaymentCount180d===undefined)?null:share(t=>entity(t.to)?.historyPaymentCount180d===0),cash_share:share(t=>t.kind==='cash'),cycle_count:paths.length,cycle_hops:paths.length?Math.min(...paths.map(p=>p.length)):null,
  related_share:share(t=>related.has(t.to)),intermediary_count:direct.filter(t=>posted.some(x=>x.from===t.to&&related.has(x.to)&&time(x.postedAt)>time(t.postedAt))).length,
  invoice_share:ratio(invoiceAmount,total),delivery_share:ratio(deliveryAmount,total),approval_share:ratio(approvalAmount,total),use_mismatch_share:share(t=>acceptedIds.has(t.useEvidenceId)&&t.documentedUseCategory&&!['unknown','Unspecified'].includes(t.documentedUseCategory)&&!r.facility.allowedUseCategories.includes(t.documentedUseCategory)),
  identity_unknown_share:share(t=>!['verified','verified_fixture'].includes(entity(t.to)?.identityStatus)),unlinked_share:share(t=>t.allocatedInr===0),reversal_share:ratio(sum(direct,t=>t.reversedInr),outflow),mixed_balance:Number(r.facility.preDrawdownBalanceInr>0)};
 const active=direct.filter(t=>t.activeLoanInr>0),within=(a,b,hours)=>time(b.postedAt)>=time(a.postedAt)&&time(b.postedAt)-time(a.postedAt)<=hours*3600000;
 let repeated=false,split=false,batch=false;
 for(const t of active){const same=active.filter(x=>x.to===t.to&&within(t,x,policy.repeatHours));if((same.length>=policy.repeatCount||(same.length>=policy.returnDebitCount&&credits.some(x=>x.from===t.to&&within(t,x,policy.repeatHours))))&&sum(same,x=>x.activeLoanInr)>=policy.minAmount)repeated=true;
  const small=same.filter(x=>x.activeLoanInr<policy.splitAmount);if(small.length>=policy.splitCount&&sum(small,x=>x.activeLoanInr)>=policy.splitAmount)split=true;
  const nearby=active.filter(x=>within(t,x,policy.batchMinutes/60)&&entity(x.to)?.historyPaymentCount180d===0);if(new Set(nearby.map(x=>x.to)).size>=policy.batchCount&&sum(nearby,x=>x.activeLoanInr)>=policy.batchAmount)batch=true;
 }
 for(const t of credits){const same=credits.filter(x=>x.from===t.from&&x.kind==='payment'&&!x.refundOf&&!x.reversalOf&&within(t,x,policy.repeatHours));if(same.length>=policy.repeatCount&&sum(same,x=>x.amountInr)>=policy.minAmount)repeated=true;}
 const invoiceNumbers=evidence.filter(e=>e.kind==='invoice'&&e.payload.invoiceNumber).map(e=>e.payload.invoiceNumber);
 const utilisation=r.utilisation&&time(r.utilisation.due)<cutoff?Math.max(0,drawn-r.utilisation.acceptedAmountInr):0;
 Object.assign(v,{commercial_share:ratio(commercialAmount,total),invoice_amount_mismatch:invoiceMismatch,invoice_duplicate_count:invoiceNumbers.length-new Set(invoiceNumbers).size,external_evidence_gap:(r.externalChecks||[]).filter(c=>['unavailable','stale','conflicting','not_found'].includes(c.status)).length,utilisation_shortfall_share:ratio(utilisation,drawn),route_approval:Number(acceptedIds.has(r.routeApproval)),receipt_reconciled:Number(evidence.some(e=>e.kind==='receipt_reconciliation'&&credits.every(t=>e.payload.transactionIds?.includes(t.id))))});
 const indicators={T01:repeated,T02:r.facility.loanType==='CC/OD'&&(v.investment_share>0||(r.marketIndicators||[]).some(i=>acceptedIds.has(i.evidenceId))),T03:v.fd_share>0,T04:gaps.some(d=>d<=policy.reopenHours/24),T05:['Housing loan','Car loan'].includes(r.facility.loanType)&&v.external_share>0,EU01:v.payee_mismatch_share>0,EU02:v.use_mismatch_share>0,EU04:v.related_share>0,EU06:batch,EU07:paths.length>0,T08:!!r.rapidReviewEnabled&&active.some(t=>t.activeLoanInr>=policy.rapidAmount&&(time(t.postedAt)-time(r.facility.drawdownAt))/3600000<=policy.rapidHours),T09:split,T10:active.some(t=>entity(t.to)?.owner==='Borrower'&&/Other|External/.test(entity(t.to)?.bankScope||'')),T11:active.some(t=>t.documentedUseCategory==='debt_repayment'&&acceptedIds.has(t.useEvidenceId)),T12:active.some(t=>t.kind==='cash'&&t.activeLoanInr>=200000),T14:v.intermediary_count>0,T15:utilisation>=500000,T16:recipientMismatch>0};
 for(const [id,value] of Object.entries(indicators))v['trigger_'+id]=Number(value);
 const values=Object.fromEntries(FEATURES.map(([key])=>[key,Number.isFinite(v[key])?v[key]:null]));
 const warnings=[];if(!graph)warnings.push('Graph features use local chronological traversal.');if(direct.some(t=>entity(t.to)?.historyPaymentCount180d===undefined))warnings.push('Some beneficiary history is unavailable; unknown is not established newness.');
 const reasons=[];if(!Number.isFinite(cutoff))reasons.push('Invalid assessment cutoff');if(trace.quarantine.length)reasons.push('Invalid or conflicting transaction data');if(!posted.length&&!gaps.length)reasons.push('No observed payments or account-history events in this snapshot');
 return {recordId:r.id,featureVersion:FEATURE_VERSION,policyDigest:featureDigest(policy),cutoff:r.asOf,windowDays:WINDOW_DAYS,peer:['Housing loan','Car loan'].includes(r.facility.loanType)?'retail':r.facility.loanType==='CC/OD'?'cc-od':'business-term',values,digest:featureDigest({featureVersion:FEATURE_VERSION,policy,cutoff:r.asOf,values,evidence:evidence.map(e=>({id:e.id,version:e.version,payload:e.payload})),transactions:posted.map(t=>({id:t.id,version:t.version,amountInr:t.amountInr}))}),eligible:!reasons.length,reasons,warnings,graphSource:graph?.source||'Local chronological traversal',evidenceIds:evidence.map(e=>e.id),transactionIds:posted.map(t=>t.id),directOutflowInr:outflow};
}

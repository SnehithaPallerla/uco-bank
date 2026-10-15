import {meetingCatalogue} from './meeting-data.js';
import {modelSamples} from './model-samples.js';
import original from './original.json' with {type:'json'};
import {makeRecord,templates} from '../diversion/data.js';
export const clone=x=>structuredClone(x);
export const clean=s=>String(s??'').replace(/\bDemo\b|\bExample\s*/g,'').replace(/\s+/g,' ').trim();
export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
export const stamp=s=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}):'Not available';
export const ORIGINAL=clone(original);
const category=p=>({'Raw materials':'building_materials','Investment':'investment','FD placement':'fixed_deposit','Debt repayment':'debt_repayment','Vehicle purchase':'vehicle','Housing purchase':'builder_payment','Sales receipt':'sales_receipt','Unspecified':null}[p]??null);
const family={repeat:'BR01',investment:'BR02',fd:'BR03',margin:'BR03',reopen:'BR04',retail:'BR05',dealer:'BR05',own:'EX02',debt:'EX03',cash:'EX04',shortfall:'EX05',invoice:'EX06',intermediary:'EX07',split:'EX08',unlinked:'EX09',related:'CL03',cycle:'CL05',approved:'CL01'};
export function legacyRecord(kind,index){
 const r=makeRecord(kind,index+101),id='LEG-'+kind,entity=x=>id+'-'+x;
 const evidence=[],add=(suffix,kind,payload)=>{const eid=id+'-'+suffix;evidence.push({id:eid,kind,title:kind.replaceAll('_',' '),status:'verified_fixture',version:1,source:'Evaluation bank records',capturedAt:r.observedAt,effectiveAt:r.facility.drawnAt,payload});return eid;};
 const s={id,title:templates.find(x=>x.id===kind).name,origin:'Original 18-fixture catalogue',rapidReviewEnabled:true,family:family[kind],profile:'extended',branch:index%4===0?'BBS':'KOL',circle:'East',asOf:r.observedAt,borrower:{id:entity('BOR'),name:clean(r.name),cif:r.cif,entityType:r.industry==='Retail borrower'?'individual':'company'},facility:{id:r.facility.id,loanType:r.facility.type,purpose:r.facility.purpose,project:id+'-PROJECT',sanctionedAmountInr:r.facility.limit,drawdownAmountInr:r.facility.drawn,drawdownId:r.facility.drawdownId,drawdownAt:r.facility.drawnAt,allowedUseCategories:[category(r.facility.purpose)||'building_materials'],restrictedPayeeIds:['Housing loan','Car loan'].includes(r.facility.type)?[entity('SUP')]:[],sanctionClause:r.facility.clause,preDrawdownBalanceInr:0},entities:r.accounts.map(a=>({id:entity(a.id),name:clean(a.name),type:a.type.toLowerCase(),bankScope:a.bank,owner:a.owner,identityStatus:'verified_fixture',identityEvidenceIds:[],historyPaymentCount180d:0})),transactions:[],events:[],evidence,relationships:r.relations.map(x=>({from:entity(x.from),to:entity(x.to),type:x.type,verified:x.verified,evidenceId:add(x.id,'verified_relationship',x)})),exceptions:[],externalChecks:[],history:r.history,fds:r.fds.map(x=>({...x,fundingTx:x.fundingTx.replace(r.id,id)})),classifications:r.classifications.map(x=>({...x,entity:entity(x.entity),evidenceId:add('CLASS','counterparty_classification',x)}))};
 s.facility.sanctionEvidenceId=add('SAN','sanction',{clause:s.facility.sanctionClause,allowedUseCategories:s.facility.allowedUseCategories});
 s.entities.forEach(e=>e.identityEvidenceIds=[add(e.id+'-IDENTITY','bank_beneficiary_mapping',{entityId:e.id,legalName:e.name,ownership:e.owner})]);
 for(const t of r.transactions){const tx={id:t.id.replace(r.id,id),version:1,from:entity(t.from),to:entity(t.to),amountInr:t.amount,currency:'INR',postedAt:t.at,receivedAt:t.receivedAt,status:'posted',kind:t.channel==='CASH'?'cash':'payment',channel:t.channel,observed:true,drawdownReference:t.fundingLink,documentedUseCategory:category(t.purpose)};tx.evidenceId=add(tx.id+'-LEDGER','bank_transaction',clone(tx));s.transactions.push(tx);s.events.push({id:tx.id+'-EV1',transactionId:tx.id,receivedAt:tx.receivedAt});
  if(tx.documentedUseCategory)tx.useEvidenceId=add(tx.id+'-USE','payment_instruction',{transactionId:tx.id,useCategory:tx.documentedUseCategory});
  if(t.approval==='Approved'){const use=tx.documentedUseCategory||'building_materials';s.exceptions.push({id:tx.id+'-APP',payeeId:tx.to,project:s.facility.project,category:use,maxAmountInr:tx.amountInr,validFrom:s.facility.drawdownAt,validTo:s.asOf,status:'approved',evidenceId:add(tx.id+'-APP','approval',{transactionId:tx.id,purpose:use,amountInr:tx.amountInr})});support(s,tx);}
 }
 if(kind==='invoice')add('INVOICE','invoice',{sellerEntityId:entity('SUP'),transactionId:s.transactions[0].id,amountInr:s.transactions[0].amountInr,project:s.facility.project});
 if(kind==='shortfall')s.utilisation={due:r.utilisation.due,acceptedAmountInr:r.utilisation.acceptedAmount,evidenceId:add('UTIL','utilisation',r.utilisation)};
 return s;
}
export function addEvidence(s,kind,payload,suffix=kind){const id=s.id+'-'+suffix+'-'+(s.evidence.length+1);s.evidence.push({id,kind,title:kind.replaceAll('_',' '),status:'verified_fixture',version:1,source:'Evaluation case file',capturedAt:s.asOf,effectiveAt:s.facility.drawdownAt,payload});return id;}
export function support(s,t){t.documentedUseCategory=(!t.documentedUseCategory||t.documentedUseCategory==='unknown')?'building_materials':t.documentedUseCategory;t.useEvidenceId=addEvidence(s,'invoice',{transactionId:t.id,sellerEntityId:t.to,amountInr:t.amountInr,project:s.facility.project,useCategory:t.documentedUseCategory,items:['Documented project procurement']},'INVOICE');addEvidence(s,'goods_receipt',{transactionId:t.id,invoiceId:t.useEvidenceId,project:s.facility.project,accepted:true},'DELIVERY');}
export function rename(s,id){const old=s.id;return JSON.parse(JSON.stringify(s).replaceAll(old,id));}
export function extendedCatalogue(){
 const records=templates.map((t,i)=>legacyRecord(t.id,i));
 const goodKinds=['repeat','investment','reopen','own','debt','cash','shortfall','invoice','intermediary','split','cycle','related'];
 for(const [i,kind] of goodKinds.entries()){
  const s=rename(legacyRecord(kind,i+30),'GOOD-'+kind);s.title+=' · documented explanation';s.comparatorOf='LEG-'+kind;
  s.transactions.filter(t=>t.from===s.borrower.id).forEach(t=>{support(s,t);s.exceptions.push({id:t.id+'-APP',payeeId:t.to,project:s.facility.project,category:t.documentedUseCategory,maxAmountInr:t.amountInr,validFrom:s.facility.drawdownAt,validTo:s.asOf,status:'approved',evidenceId:addEvidence(s,'approval',{transactionId:t.id,scope:'Project payment and commercial arrangement'})});});
  if(kind==='reopen')s.historyApproval=addEvidence(s,'account_migration',{reason:'Approved branch migration',cif:s.borrower.cif});
  if(kind==='shortfall')s.utilisation.due='2026-10-30T10:00:00+05:30';
  if(kind==='invoice')s.evidence=s.evidence.filter(e=>!(e.kind==='invoice'&&e.id.endsWith('-INVOICE')));
  if(['intermediary','cycle'].includes(kind))s.routeApproval=addEvidence(s,'settlement_agreement',{transactionIds:s.transactions.map(t=>t.id),reason:'Documented distributor settlement and return'});
  records.push(s);
 }
 for(const good of [false,true]){const s=rename(legacyRecord('approved',61),'EX10-'+(good?'OK':'REVIEW'));s.family='EX10';s.title=good?'Immediate supported supplier settlement':'Immediate outflow without commercial evidence';if(!good){s.exceptions=[];s.evidence=s.evidence.filter(e=>!['invoice','goods_receipt','approval'].includes(e.kind));s.transactions[0].documentedUseCategory=null;s.transactions[0].useEvidenceId=null;}records.push(s);}
 const batch=rename(ORIGINAL.find(x=>x.id==='CL04'),'GOOD-BATCH');batch.profile='extended';batch.title='Documented supplier batch';batch.comparatorOf='CL04';batch.transactions.forEach(t=>support(batch,t));records.push(batch);
 return records;
}
export function boundaryCatalogue(){
 const out=[];const make=(base,id,title,change)=>{const s=rename(clone(base),'BOUND-'+id);s.profile='boundary';s.origin='Boundary acceptance';s.title=title;change(s);out.push(s);return s;};
 const ex=ORIGINAL.find(s=>s.id==='EX01'),op=ORIGINAL.find(s=>s.id==='OP01'),hl=ORIGINAL[0],du=ORIGINAL.find(s=>s.id==='DU02');
 make(ex,'PARTIAL','Partial approval · ₹1 lakh overage',s=>{s.transactions[0].amountInr=900000;s.evidence.find(e=>e.kind==='invoice').payload.amountInr=900000;});
 make(ex,'EXHAUSTED','Two payments exhaust one cumulative approval',s=>{const t=clone(s.transactions[0]);t.id+='B';t.postedAt='2026-09-21T12:00:00+05:30';s.transactions[0].amountInr=500000;t.amountInr=500000;t.evidenceId=addEvidence(s,'bank_transaction',clone(t));s.transactions.push(t);s.events.push({id:t.id+'-EV1',transactionId:t.id,receivedAt:t.postedAt});});
 make(ex,'EXPIRED','Expired equipment approval',s=>s.exceptions[0].validTo='2026-09-21T10:30:00+05:30');
 make(ex,'WRONGPAYEE','Approval cannot transfer to another payee',s=>s.exceptions[0].payeeId='UNRELATED');
 make(hl,'MIXED','Commingled account · attribution uncertainty',s=>s.facility.preDrawdownBalanceInr=2000000);
 make(hl,'MULTIDRAW','Two drawdowns with separately capped allocation',s=>{s.drawdowns=[{id:s.facility.drawdownId,amountInr:700000,at:s.facility.drawdownAt},{id:s.id+'-DD2',amountInr:500000,at:'2026-09-21T13:00:00+05:30'}];const t=clone(s.transactions[0]);t.id+='B';t.drawdownReference=s.drawdowns[1].id;t.amountInr=600000;t.postedAt='2026-09-21T14:00:00+05:30';t.evidenceId=addEvidence(s,'bank_transaction',clone(t));s.transactions.push(t);s.events.push({id:t.id+'-EV',transactionId:t.id,receivedAt:t.postedAt});});
 make(op,'PARTIALRETURN','Partial reversal leaves residual review',s=>s.transactions[1].amountInr=500000);
 for(const status of ['cancelled','failed'])make(hl,status.toUpperCase(),status+' payment excluded',s=>s.transactions[0].status=status);
 make(hl,'UNLINKED','Missing drawdown reference',s=>s.transactions[0].drawdownReference=null);
 make(hl,'CORRECTED','Corrected version replaces original amount',s=>{const t=clone(s.transactions[0]);t.version=2;t.amountInr=400000;t.evidenceId=addEvidence(s,'bank_transaction',clone(t),'CORRECTED');s.transactions.push(t);s.events.push({id:t.id+'-EV2',transactionId:t.id,receivedAt:s.asOf});});
 make(du,'RESTORED','Research service restored',s=>s.externalChecks.forEach(c=>{c.status='matched_fixture';c.matchedOn='identifier and bank account evidence';c.effectiveAt=s.asOf;}));
 make(du,'CONFLICT','Conflicting registry records',s=>s.externalChecks[0].status='conflicting');
 make(ORIGINAL[1],'DELAYED','Delivery evidence not yet accepted',s=>s.evidence.filter(e=>e.kind==='goods_receipt').forEach(e=>e.status='submitted'));
 make(ORIGINAL[1],'DUPINVOICE','Invoice number reused across documents',s=>{const e=clone(s.evidence.find(e=>e.kind==='invoice'));e.id+='-COPY';s.evidence.push(e);});
 make(ORIGINAL[1],'INFLATED','Invoice amount differs from payment',s=>s.evidence.find(e=>e.kind==='invoice').payload.amountInr=1600000);
 make(hl,'INVALID','Missing amount quarantined',s=>s.transactions[0].amountInr=null);
 make(hl,'PARTIALREFUND','Partial supplier refund · net and review kept separate',s=>{const t={...clone(s.transactions[0]),id:s.id+'-REFUND',from:s.transactions[0].to,to:s.borrower.id,amountInr:500000,kind:'refund',refundOf:s.transactions[0].id,postedAt:'2026-09-21T13:00:00+05:30',receivedAt:'2026-09-21T13:01:00+05:30',drawdownReference:null,documentedUseCategory:null,useEvidenceId:null};t.evidenceId=addEvidence(s,'bank_transaction',clone(t));s.transactions.push(t);s.events.push({id:t.id+'-EV',transactionId:t.id,receivedAt:t.receivedAt});});
 make(legacyRecord('invoice',70),'ASSIGNMENT','Seller-authorised collection account',s=>{const t=s.transactions[0],inv=s.evidence.find(e=>e.kind==='invoice');inv.payload.project=s.facility.project;addEvidence(s,'payment_assignment',{transactionId:t.id,sellerEntityId:inv.payload.sellerEntityId,payeeId:t.to,approval:'Approved seller collection arrangement'});addEvidence(s,'goods_receipt',{transactionId:t.id,invoiceId:inv.id,project:s.facility.project,accepted:true});});

 const batch=ORIGINAL.find(s=>s.id==='CL04');
 for(const [id,minutes,start] of [['MIDNIGHT',5,'2026-09-30T23:40:00+05:30'],['EXACTWINDOW',60/9,'2026-09-30T23:40:00+05:30'],['OUTSIDEWINDOW',10,'2026-09-30T23:40:00+05:30']])make(batch,id,'Rolling batch · '+id.toLowerCase(),s=>{s.facility.drawdownAt=start;s.transactions.forEach((t,i)=>t.postedAt=new Date(Date.parse(start)+i*minutes*60000).toISOString());s.asOf='2026-10-02T10:00:00+05:30';});
 make(batch,'OUTOFORDER','Events received out of order',s=>s.transactions.reverse());
 make(ex,'EXACTAMOUNT','Approval amount exactly at limit',()=>{});
 return out;
}
export function catalogue(){const base=[...clone(ORIGINAL),...extendedCatalogue(),...boundaryCatalogue(),...meetingCatalogue()];return [...base,...modelSamples(base)];}
export const personas=[{id:'asha',name:'Asha Sen',role:'Analyst',branches:['KOL','BBS'],circle:'East'},{id:'ravi',name:'Ravi Das',role:'Reviewer',branches:['KOL','BBS'],circle:'East'},{id:'neha',name:'Neha Roy',role:'Analyst',branches:['BBS'],circle:'East'},{id:'admin',name:'Platform Administrator',role:'Administrator',branches:['KOL','BBS'],circle:'East'}];
export const policyDefault={version:1,mode:'Evaluation policy · bank approval pending',minAmount:100000,rapidAmount:500000,rapidHours:4,repeatHours:168,repeatCount:3,returnDebitCount:2,reopenHours:720,splitAmount:500000,splitCount:3,batchAmount:4000000,batchCount:8,batchMinutes:60};

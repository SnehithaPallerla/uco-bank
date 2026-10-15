import {copy,makeRecord,ruleDefinitions,truth,money,DAY} from './data.js';
export const KEY='uco-credit-diversion-v3';
const now=()=>new Date().toISOString();
export function audit(s,action,detail,user='System'){s.audit.unshift({id:'AUD-'+(++s.seq),at:now(),action,detail,user});}
export function fundTrace(r){
 let remaining=r.facility.drawn;const drawAt=Date.parse(r.facility.drawnAt);
 return [...r.transactions].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).map(t=>{
  const linked=t.fundingLink===r.facility.drawdownId&&Date.parse(t.at)>=drawAt;
  const allocated=t.from==='BOR'&&linked?Math.min(remaining,t.amount):0;
  if(allocated)remaining-=allocated;
  return {...t,allocated,linkStatus:linked?(t.from==='BOR'?'Explicit drawdown link':'Observed downstream leg; attribution not independently verified'):'Funding unverified',remaining};
 });
}
export function evaluate(r,policy){
 const findings=[],excluded=[],trace=fundTrace(r),related=id=>r.relations.some(x=>x.from==='BOR'&&x.to===id&&x.verified),acct=id=>r.accounts.find(x=>x.id===id);
 const version=policy.version;
 for(const rule of policy.rules.filter(x=>x.enabled)){
  const within=t=>Date.parse(t.at)>=Date.parse(r.facility.drawnAt)&&Date.parse(t.at)-Date.parse(r.facility.drawnAt)<=rule.hours*3600000;
  const all=trace.filter(t=>within(t)&&t.from==='BOR'&&t.allocated>0);
  const approved=t=>(rule.excludeApproved&&t.approval==='Approved'&&!!t.approvalRef)||(rule.excludeApprovedPayee&&r.facility.approvedPayees.includes(t.to)&&t.approval==='Approved'&&t.purpose===r.facility.purpose);
  const usable=all.filter(t=>!approved(t));
  const big=usable.filter(t=>t.allocated>=rule.minAmount);
  let hits=[],detail='',contextOnly=false;
  switch(rule.id){
   case 'T01':{for(const id of new Set(usable.map(t=>t.to))){const group=usable.filter(t=>t.to===id),credits=trace.filter(t=>within(t)&&t.from===id&&t.to==='BOR');if((group.length>=3||(group.length>=2&&credits.length>=1))&&group.reduce((n,t)=>n+t.allocated,0)>=rule.minAmount)hits.push(...group,...credits);}detail='Repeated activity with the same counterparty in the configured window.';break;}
   case 'T02':hits=r.facility.type==='CC/OD'?big.filter(t=>r.classifications.some(c=>c.entity===t.to&&c.verified&&c.category==='Investment')):[];detail='CC/OD funding linked to a counterparty classified as Investment.';break;
   case 'T03':hits=['Term loan','CC/OD'].includes(r.facility.type)?big.filter(t=>r.fds.some(f=>f.bank==='UCO'&&f.fundingTx===t.id)):[];detail='Observed UCO FD placement has an explicit loan-funding link.';break;
   case 'T04':{const prior=r.history.filter(x=>x.cif===r.cif&&x.closed),opens=r.history.filter(x=>x.cif===r.cif&&x.opened);if(opens.some(o=>prior.some(p=>Date.parse(o.opened)>Date.parse(p.closed)&&Date.parse(o.opened)-Date.parse(p.closed)<=rule.hours*3600000)))hits=[{id:r.cif,amount:0}];contextOnly=true;detail='Same-customer account closure/opening requires context review; it is not evidence of diversion.';break;}
   case 'T05':hits=['Housing loan','Car loan'].includes(r.facility.type)?big.filter(t=>acct(t.to)?.bank==='Other bank'):[];detail='Retail loan proceeds transferred to an external bank without a recorded approved exception.';break;
   case 'T06':hits=big.filter(t=>t.purpose!=='Unspecified'&&t.purpose!==r.facility.purpose);detail='Recorded transaction use differs from the sanction purpose.';break;
   case 'T07':hits=big.filter(t=>related(t.to));detail='Transfer to a verified related party; business justification and approval require review.';break;
   case 'T08':hits=big;detail='Material outward movement within '+rule.hours+' hours of drawdown.';break;
   case 'T09':for(const id of new Set(usable.map(t=>t.to))){const group=usable.filter(t=>t.to===id&&t.allocated<rule.minAmount);if(group.length>=3&&group.reduce((n,t)=>n+t.allocated,0)>=rule.minAmount)hits.push(...group);}detail='Several smaller transfers aggregate above the configured threshold.';break;
   case 'T10':hits=big.filter(t=>acct(t.to)?.owner==='Borrower'&&acct(t.to)?.bank==='Other bank');detail='Transfer to a verified borrower-owned external account; downstream use unavailable.';break;
   case 'T11':hits=big.filter(t=>t.purpose==='Debt repayment');detail='Loan-funded repayment of other debt without recorded approval.';break;
   case 'T12':hits=big.filter(t=>t.channel==='CASH');detail='Material loan-linked cash withdrawal; utilisation evidence required.';break;
   case 'T13':{for(const a of big)for(const b of trace.filter(t=>within(t)&&t.from===a.to&&Date.parse(t.at)>Date.parse(a.at)&&t.to!=='BOR'))for(const c of trace.filter(t=>within(t)&&t.from===b.to&&t.to==='BOR'&&Date.parse(t.at)>Date.parse(b.at)))if(Math.min(a.allocated,b.amount,c.amount)>=rule.minAmount)hits.push(a,b,c);detail='Three chronological observed legs return to the borrower. Gross leg values must not be treated as unique funds.';break;}
   case 'T14':for(const a of big)for(const b of trace.filter(t=>within(t)&&t.from===a.to&&related(t.to)&&Date.parse(t.at)>Date.parse(a.at)&&t.amount>=rule.minAmount))hits.push(a,b);detail='Observed intermediary payment reaches a related company; no external legs inferred.';break;
   case 'T15':if(r.utilisation&&Date.parse(r.utilisation.due)<Date.parse(r.observedAt)&&r.facility.drawn-r.utilisation.acceptedAmount>=rule.minAmount)hits=[{id:r.utilisation.source,amount:r.facility.drawn-r.utilisation.acceptedAmount}];detail='Deployment evidence is below the drawdown amount after the milestone. Missing documents do not prove misuse.';break;
   case 'T16':hits=big.filter(t=>r.documents.some(d=>d.type==='Invoice'&&d.transaction===t.id&&d.payee!==t.to));detail='Invoice beneficiary differs from the actual payment beneficiary.';break;
  }
  if(hits.length){const refs=[...new Set(hits.map(t=>t.id))];findings.push({id:rule.id,name:rule.name,scope:rule.scope,severity:rule.severity,contextOnly,detail,refs,policyVersion:version,amount:all.filter(t=>refs.includes(t.id)).reduce((n,t)=>n+t.allocated,0),approval:usable.some(t=>refs.includes(t.id)&&t.approval==='Unknown')?'Unknown':'Not approved / context required'});}
  else if(all.some(approved))excluded.push({id:rule.id,reason:'Approved payment excluded where this rule applies.',refs:all.filter(approved).map(t=>t.id)});
 }
 const risk=findings.filter(x=>!x.contextOnly),severity=risk.some(x=>x.severity==='High')?'High':risk.length?'Medium':findings.length?'Context':'Clear';
 const hitIds=new Set(risk.flatMap(x=>x.refs));const exposed=trace.filter(t=>t.from==='BOR'&&hitIds.has(t.id)).reduce((n,t)=>n+t.allocated,0);
 const missing=[];if(trace.some(t=>t.from==='BOR'&&t.approval==='Unknown'))missing.push('Written approval / business-purpose confirmation');if(trace.some(t=>t.from==='BOR'&&t.linkStatus==='Funding unverified'))missing.push('Reliable drawdown-to-payment linkage');if(trace.some(t=>acct(t.to)?.bank==='Other bank'))missing.push('Downstream external-bank utilisation records');if(!r.documents.length)missing.push('Invoices or accepted end-use documents');
 return {findings,excluded,severity,exposed,missing,score:Math.min(99,risk.reduce((n,x)=>n+(x.severity==='High'?25:12),0)),confidence:risk.length?(missing.length>1?'Evidence incomplete':'Reviewable evidence'):'No risk-rule match',trace,policyVersion:version};
}
export function initialState(){
 const records=['related','investment','fd','cycle','split','approved','margin','dealer','reopen','unlinked','invoice','shortfall'].map((k,i)=>makeRecord(k,i+1));
 const s={schema:3,seq:100,records,policy:{version:1,rules:copy(ruleDefinitions)},proposal:null,cases:[],research:[],liveEvidence:[],audit:[],events:records.map(r=>({id:'EV-'+r.id,record:copy(r),receivedAt:now(),status:'Accepted'})),queue:[],quarantine:[],online:true,mode:'Synthetic',model:{name:'Explainable rule prioritisation',version:'3.0',status:'Illustrative heuristic',candidate:'Not trained'},benchmarks:[]};
 audit(s,'Initialised','Synthetic data loaded; no bank connection.');return s;
}
export function ingest(s,r,eventId='EV-'+r.id){
 const event={id:eventId,record:copy(r),receivedAt:now(),status:'Queued'};s.events.unshift(event);
 if(!s.online){s.queue.push(eventId);audit(s,'Queued',eventId);return;}
 process(s,event);audit(s,'Event '+event.status,eventId);
}
function process(s,event){
 const r=event.record;
 if(s.records.some(x=>x.id===r.id)){event.status='Duplicate';return;}
 const invalid=!r.id||!r.facility||!Array.isArray(r.transactions)||r.transactions.some(t=>!Number.isFinite(t.amount)||t.amount<=0||!Number.isFinite(Date.parse(t.at))||!r.accounts.some(a=>a.id===t.from)||!r.accounts.some(a=>a.id===t.to))||new Set(r.transactions.map(t=>t.id)).size!==r.transactions.length;
 if(invalid){event.status='Quarantined';s.quarantine.push({eventId:event.id,reason:'Invalid amount, timestamp, reference or duplicate transaction ID.',record:copy(r),status:'Open'});return;}
 s.records.push(copy(r));event.status='Accepted';event.completedAt=now();event.late=r.transactions.some(t=>Date.parse(t.receivedAt)-Date.parse(t.at)>3600000);
}
export function setOnline(s,online){s.online=online;if(online){for(const e of s.events.filter(x=>x.status==='Queued'))process(s,e);s.queue=[];}audit(s,online?'Consumer resumed':'Consumer paused','Local replay with record-ID deduplication');}
export function addScenario(s,kind,scale=1,quality='Clean'){
 const serial=++s.seq;const r=makeRecord(kind,serial,scale);
 if(quality==='Duplicate'){if(!s.records.length)throw Error('No record to duplicate');ingest(s,s.records[0],'DUP-'+serial);return s.records[0].id;}
 if(quality==='Invalid amount')r.transactions[0].amount=-1;
 if(quality==='Late delivery')r.transactions.forEach(t=>t.receivedAt=new Date(Date.parse(t.at)+86400000).toISOString());
 if(quality==='Missing approval')r.transactions.forEach(t=>{t.approval='Unknown';t.approvalRef=null;});
 if(quality==='Missing funding link')r.transactions.forEach(t=>t.fundingLink=null);
 ingest(s,r);return r.id;
}
export function createCase(s,recordId,user){
 const prior=s.cases.find(c=>c.recordId===recordId&&c.status!=='Closed');if(prior)return prior.id;
 const r=s.records.find(x=>x.id===recordId);if(!r)throw Error('Borrower not found');
 const c={id:'CASE-'+(++s.seq),recordId,title:r.name,created:now(),owner:user.id,status:'In review',outcome:null,notes:[],requests:[],responses:[],snapshot:{record:copy(r),assessment:evaluate(r,s.policy),policy:copy(s.policy),research:copy(s.research.filter(e=>e.recordId===recordId))},evidenceIds:[],review:null,closed:null};
 s.cases.unshift(c);audit(s,'Case created',c.id+' · frozen assessment v'+s.policy.version,user.id);return c.id;
}
export function caseAction(s,id,action,user,text='',outcome='',evidenceIds=[]){
 const c=s.cases.find(x=>x.id===id);if(!c)throw Error('Case not found');if(c.status==='Closed')throw Error('Closed cases are read only');
 if(text.trim().length<10)throw Error('Enter at least 10 characters of rationale.');
 if(c.status==='Pending review'&&['request','response','submit'].includes(action))throw Error('Pending cases require an independent reviewer decision.');
 const note={at:now(),user:user.id,text,action};
 if(action==='note')c.notes.push(note);
 else if(action==='request'){c.requests.push(note);c.status='Awaiting documents';}
 else if(action==='response'){if(!c.requests.length)throw Error('Record a document request first.');c.responses.push(note);c.status='In review';}
 else if(action==='submit'){
  if(c.status==='Pending review')throw Error('This case is already awaiting review.');
  if(!['Explained / approved','Insufficient evidence','Suspected diversion','Confirmed diversion'].includes(outcome))throw Error('Select an outcome.');
  const validIds=new Set([c.snapshot.record.facility.documentId,...c.snapshot.record.transactions.map(t=>t.id),...c.snapshot.record.documents.map(d=>d.id),...s.research.filter(e=>e.recordId===c.recordId&&e.status==='Available').map(e=>e.id)]);
  if(!evidenceIds.length||evidenceIds.some(id=>!validIds.has(id)))throw Error('Select at least one available evidence reference.');
  c.review={submittedBy:user.id,at:now(),text,outcome,evidenceIds:copy(evidenceIds)};c.status='Pending review';
 }else if(action==='approve'||action==='return'){
  if(user.role!=='Reviewer')throw Error('Reviewer role required.');if(c.status!=='Pending review'||!c.review)throw Error('Submit a proposed outcome first.');if(c.review.submittedBy===user.id)throw Error('A different reviewer must decide.');
  if(action==='approve'){c.status='Closed';c.outcome=c.review.outcome;c.closed=now();c.decision={by:user.id,text,at:now()};c.evidenceIds=copy(c.review.evidenceIds);}else{c.status='In review';c.review=null;}c.notes.push(note);
 }else throw Error('Unknown action');
 audit(s,'Case '+action,c.id+' · '+text,user.id);
}
export function proposePolicy(s,rules,user){
 if(rules.length!==ruleDefinitions.length||new Set(rules.map(r=>r.id)).size!==ruleDefinitions.length||rules.some(r=>!ruleDefinitions.some(d=>d.id===r.id)||!Number.isFinite(r.minAmount)||r.minAmount<0||!Number.isFinite(r.hours)||r.hours<=0||r.hours>8760||!['Low','Medium','High'].includes(r.severity)||typeof r.enabled!=='boolean'||typeof r.excludeApproved!=='boolean'||typeof r.excludeApprovedPayee!=='boolean'))throw Error('Check rule thresholds, windows and severity.');
 s.proposal={rules:copy(rules),by:user.id,at:now(),baseVersion:s.policy.version};audit(s,'Policy proposed','Candidate for v'+(s.policy.version+1),user.id);
}
export function approvePolicy(s,user){if(user.role!=='Reviewer')throw Error('Reviewer role required');if(!s.proposal)throw Error('No policy proposal');if(user.id===s.proposal.by)throw Error('A different reviewer must approve');if(s.proposal.baseVersion!==s.policy.version)throw Error('Policy changed; resubmit the proposal');s.policy={version:s.policy.version+1,rules:copy(s.proposal.rules)};s.proposal=null;audit(s,'Policy activated','Version '+s.policy.version+'; frozen case evidence preserved',user.id);}
export function validation(s,records=s.records){
 let tp=0,fp=0,tn=0,fn=0;const rows=records.map(r=>{const e=evaluate(r,s.policy),predicted=e.findings.some(f=>!f.contextOnly),actual=truth[r.kind];if(predicted&&actual)tp++;else if(predicted)fp++;else if(actual)fn++;else tn++;return {id:r.id,scenario:r.kind,expected:actual?'Review risk':'Legitimate / context',predicted:predicted?'Review risk':'No risk match',correct:predicted===actual,rules:e.findings.map(f=>f.id).join(', ')};});
 return {tp,fp,tn,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,fpr:fp+tn?fp/(fp+tn):null,rows,coverage:[...new Set(records.flatMap(r=>evaluate(r,s.policy).findings.map(f=>f.id)))],total:records.length};
}
export function answer(question,r,s){
 const e=evaluate(r,s.policy),q=question.toLowerCase();let text='',refs=[];
 if(/portfolio|summary|summarise|summarize/.test(q)&&!/case|borrower/.test(q)){const assessments=s.records.map(x=>evaluate(x,s.policy));text=`${s.records.length} fictional borrowers are loaded. ${assessments.filter(x=>x.findings.some(f=>!f.contextOnly)).length} have risk-rule matches; ${s.cases.filter(c=>c.status!=='Closed').length} cases remain open. These are synthetic screening results, not confirmed fraud.`;refs=['Portfolio · active policy v'+s.policy.version];}
 else if(/oracle|component|architecture/.test(q)){text='Oracle 26ai is the proposed data, graph and evidence-retrieval layer; OCI Streaming ingests events; Functions/OKE run APIs and collectors; Object Storage retains evidence; GenAI Agents can ground answers; APEX supports internal review workflows. This download runs locally without those services.';refs=['Architecture · integration design'];}
 else if(/prove|fraud|confirm/.test(q)){text='This evidence does not by itself establish fraud. Rule matches are review signals. Public sources can support identity or relationships; actual end use requires bank records, approvals and documents. Only an authorised officer can record an investigation outcome. All selected financial records are fictional.';refs=[r.facility.documentId,...e.findings.flatMap(f=>f.refs).slice(0,3)];}
 else if(/missing|need|gap/.test(q)){text=e.missing.length?'The review still needs: '+e.missing.join('; ')+'. Unavailable evidence is an information gap, not adverse proof.':'No predefined gap was detected. An officer must still validate the source records and business explanation.';refs=[r.facility.documentId];}
 else if(/clos|justify|legitimate/.test(q)){text='A defensible closure needs a matching invoice/payee or end-use record, a permitted sanction purpose or written exception, and a recorded explanation. The analyst submits referenced evidence; a different reviewer approves the proposed outcome. An insufficient-evidence outcome must explain remaining gaps.';refs=[r.facility.documentId,...r.documents.map(d=>d.id)];}
 else if(/trace|flow|funds/.test(q)){const direct=e.trace.filter(t=>t.allocated>0);text=`Drawdown ${r.facility.drawdownId}: ${money(r.facility.drawn)}. Direct linked outflow: ${money(direct.reduce((n,t)=>n+t.allocated,0))}. ${e.trace.filter(t=>t.from!=='BOR').length} additional observed leg(s) are shown without adding them to unique funded outflow. Attribution is capped at the drawdown; unobserved external movement remains unknown.`;refs=[r.facility.drawdownId,...direct.map(t=>t.id)];}
 else if(/relation|beneficiary|links|evidence links/.test(q)){const rel=r.relations.filter(x=>x.verified&&r.transactions.some(t=>t.to===x.to));text=rel.length?'Synthetic KYC records show a common-director relationship with Sarthak Ventures Demo, an observed beneficiary. This supports a relationship, not a finding of diversion. Public-source research must be separately matched and reviewed.':'No verified relationship with the observed beneficiaries is available in the selected record.';refs=rel.map(x=>x.source);}
 else if(/why|flag|explain|rule/.test(q)){text=e.findings.length?e.findings.map(f=>f.id+': '+f.detail).join(' ')+' Approval status and missing evidence must be checked before a decision.':'No active rule matched this record. This is not a guarantee that all fraud has been excluded.';refs=[...new Set(e.findings.flatMap(f=>f.refs)),r.facility.documentId];}
 else{text='I can explain this borrower’s rule matches, trace recorded funds, list evidence gaps, outline closure requirements or explain Oracle components. This demo uses deterministic answers grounded in the displayed records; no live language model is connected.';refs=[r.id];}
 return {question,text,refs,at:now(),recordId:r.id,label:'Sample grounded answer · deterministic demo'};
}
export function packet(s,c){return {...copy(c),exportedAt:now(),mode:'Synthetic',notice:'Demo investigation packet. No real customer finding or regulated submission.',supplementalResearch:copy(s.research.filter(e=>e.recordId===c.recordId)),caseAudit:s.audit.filter(a=>a.detail.includes(c.id))};}

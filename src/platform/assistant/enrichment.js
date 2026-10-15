import {validateSubject,walkthrough} from './web-research.js';

export const SCENARIOS={supplier:'Supplier activity',markets:'Capital-market activity',ownership:'Common parent',ambiguous:'Similar company names',sanctions:'Screening name match',stale:'Stale profile',unavailable:'Provider unavailable'};
export const IDENTITIES=['Unverified','Possible match','Identifier corroborated','Different entity'];
export const payees=r=>r.entities.filter(e=>r.transactions.some(t=>t.from===r.borrower.id&&t.to===e.id&&t.status==='posted'&&t.observed!==false));
export const company=e=>!!e&&['company','corporate'].includes(e.type);
export function enrichmentAnswer(r,result,topic){
 if(!result.profile)return 'No company profile was returned. Continue with bank-held identity and transaction documents; missing provider coverage is not an adverse finding.';
 if(topic==='identity')return result.candidates.length?'The example contains two plausible names. Resolve CIN, GSTIN or LEI against the beneficiary’s bank-held records before selecting either company.':'This is a mock company profile. It cannot corroborate a real company identifier or identify the owner of the recipient bank account.';
 if(topic==='ownership')return result.commonParent?'The example parent owns 60% of the borrower and 75% of the recipient. Request group declarations and evidence of arm’s-length procurement. This is a corporate ownership illustration, not an observed payment path.':'No ownership relationship is established by this result. Missing ownership coverage does not establish that the companies are unrelated.';
 if(topic==='screening')return result.scenario==='sanctions'?'This fictional screening candidate is based on a name match only. Verify identifiers and refer to the authorised screening team; do not classify the company or freeze an account from this example.':'This example does not provide a completed sanctions or PEP screening result. No clearance or adverse finding is established.';
 return 'Sanctioned purpose: '+r.facility.purpose+'. '+result.signals.join(' ')+' Obtain the purchase order, invoice and delivery or site evidence for the linked payments. Mock enrichment does not change the current transaction assessment.';
}
export function bloombergMock(r,entityId,scenario,now=new Date().toISOString()){
 const entity=payees(r).find(e=>e.id===entityId);
 if(!entity)throw Error('Select an observed recipient in this account.');
 if(!Object.hasOwn(SCENARIOS,scenario))throw Error('Select a Bloomberg example.');
 const covered=company(entity),available=covered&&scenario!=='unavailable';
 const profile=available?{name:entity.name,entityType:'Company',identifier:'MOCK-COMPANY-'+entity.id,identifierType:'Demonstration identifier; not a real LEI or Bloomberg ID',country:'India',listing:scenario==='markets'?'Listed in example':'Unlisted in example',activity:scenario==='markets'?'Securities brokerage and investment services':'Industrial materials and general trading',industry:scenario==='markets'?'Capital markets':'Industrial distribution',asOf:scenario==='stale'?'2024-03-31':now.slice(0,10)}:null;
 const commonParent=scenario==='ownership'&&available?{name:'Horizon Industrial Holdings — example',borrower:r.borrower.name,recipient:entity.name,borrowerPercent:60,recipientPercent:75}:null;
 const candidates=scenario==='ambiguous'&&available?[{name:entity.name+' Private Limited',location:'Kolkata',id:'MOCK-CANDIDATE-01'},{name:entity.name+' Enterprises',location:'Mumbai',id:'MOCK-CANDIDATE-02'}]:[];
 const screening=scenario==='sanctions'&&available?'Fictional watchlist name-match candidate. Not a confirmed match, designation or bank finding.':'No screening conclusion established.';
 const signals=!available?['No company finding; continue the existing investigation.']:scenario==='markets'?[r.facility.loanType==='CC/OD'?'Possible T02 context: compare the recipient’s activity with the CC/OD sanction.':'Compare this recipient’s market activity with the permitted loan purpose.','A business classification does not establish what this payment purchased.']:scenario==='ownership'?['Example common parent: request related-party declarations and commercial support.','An ownership link does not establish loan diversion.']:scenario==='ambiguous'?['Multiple plausible companies: obtain a bank-held CIN, GSTIN or LEI before matching.']:scenario==='sanctions'?['Escalate identity verification through the bank’s authorised screening workflow.','Do not treat a name-only candidate as an exact sanctions match.']:scenario==='stale'?['Profile is out of date: obtain a current source before relying on it.']:['A trading supplier may legitimately supply warehouse or construction materials.','Compare purchase orders, invoices and delivery evidence with the sanction.'];
 return {id:'BB-'+entity.id+'-'+Date.parse(now),kind:'bloomberg',entityId,scenario,subject:{name:entity.name,publicId:''},mode:'Bloomberg mock',provider:'Bloomberg enrichment demonstration',status:!covered?'No company coverage':scenario==='unavailable'?'Unavailable':scenario==='stale'?'Stale':scenario==='ambiguous'?'Ambiguous':'Mock profile',createdAt:now,retrievedAt:null,identity:'Unverified',profile,commonParent,candidates,screening,signals,summary:signals.join(' '),sources:available?[{id:'BB1',title:'Prepared Bloomberg-style company profile',url:null,sourceDate:profile.asOf,kind:'Mock data',excerpt:profile.activity}]:[],limitations:'Mock data only; no Bloomberg feed was queried. Coverage depends on licensed products and entitlements. Public profiles do not identify the owner of a bank account or prove the end use of a payment.'};
}
export function attachmentBlock(r,s,run){
 if(!run)return 'Select a research result first.';
 if(!run.sources?.length)return 'There is no source result to attach.';
 if(run.attachedEvidenceId)return 'This result is already attached.';
 const c=s.cases.filter(c=>c.recordId===r.id).at(-1);
 if(c?.status==='Closed')return 'Reopen the case in Case Management before attaching evidence.';
 if(c?.status==='Awaiting independent review')return 'This case is awaiting independent review; its evidence snapshot is locked.';
 return '';
}
export function applyEnrichment({s,r,c,user,cmd,now,log,trustedResearch=false}){
 if(!r)throw Error('Record not found');
 r.assistantResearch=r.assistantResearch||[];
 const newId=prefix=>prefix+'-'+r.id+'-'+(s.revision+1);
 if(cmd.type==='assistantWebWalkthrough'){
  const result=walkthrough(validateSubject(cmd.subject),r.id);
  result.id=newId('WEB-WALK');result.kind='web';result.createdAt=now;
  r.assistantResearch.unshift(result);log('assistant_web_walkthrough','Prepared research for '+result.subject.name+'; no internet request');
 }else if(cmd.type==='assistantBloombergRun'){
  const result=bloombergMock(r,cmd.entityId,cmd.scenario,now);result.id=newId('BB');
  r.assistantResearch.unshift(result);log('assistant_bloomberg_mock',result.scenario+' · '+result.subject.name+' · no live Bloomberg request');
 }else if(cmd.type==='assistantSaveRun'){
  if(!trustedResearch||cmd.run?.mode!=='Live web research')throw Error('Live research must come from the authenticated server search.');
  if(r.assistantResearch.some(x=>x.id===cmd.run.id))throw Error('This research result is already saved.');
  const result=structuredClone(cmd.run);result.kind='web';result.recordId=r.id;
  r.assistantResearch.unshift(result);log('assistant_web_research',result.id+' · '+result.status+' · '+result.subject.name);
 }else if(cmd.type==='assistantAttachResearch'){
  const result=r.assistantResearch.find(x=>x.id===cmd.runId);
  const block=attachmentBlock(r,s,result);if(block)throw Error(block);
  if(!c)throw Error('Open a case first');
  if(!IDENTITIES.includes(cmd.identity))throw Error('Select an identity assessment.');
  if(cmd.identity==='Different entity')throw Error('Keep a different entity in research history; do not attach it as counterparty evidence.');
  if(cmd.identity==='Identifier corroborated'&&(result.mode!=='Live web research'||!result.subject.publicId))throw Error('Identifier corroboration requires a live result and a supplied public registration identifier.');
  const note=String(cmd.note||'').trim();if(note.length<15||note.length>4000)throw Error('Enter a review note of 15 to 4000 characters.');
  const id=newId('ASSISTANT-EV');
  const evidence={id,kind:result.kind==='bloomberg'?'bloomberg_mock_enrichment':'assistant_web_research',title:(result.kind==='bloomberg'?'Bloomberg enrichment':'Web research')+' · '+result.subject.name,status:result.status==='Stale'?'stale':'recorded',version:1,source:result.provider,capturedAt:now,effectiveAt:result.profile?.asOf?result.profile.asOf+'T00:00:00Z':null,payload:{research:structuredClone(result),review:{identity:cmd.identity,note,by:user.id,at:now},limitations:result.limitations}};
  r.evidence.push(evidence);result.attachedEvidenceId=id;
  c.notes.push({type:'assistant_enrichment',text:id+' · '+cmd.identity+' · '+note,user:user.id,at:now});
  c.history.push({action:'assistant_enrichment',note:id+' · '+note,at:now,user:user.id});
  log('assistant_evidence_attached',id+' · '+result.mode+' · '+cmd.identity+' · '+note);
 }
}

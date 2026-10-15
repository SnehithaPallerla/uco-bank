import {money} from '../catalogue.js';

export const VALIDATION_VERSION='uco-validation-v2';
export const DISPOSITIONS=['Review required','Evidence needed','Supported','Inconclusive'];
export const VALIDATION_LIMITATION='Advisory review only. Citation checks confirm that references exist, not that the explanation is correct. An officer must review the draft; detection rules, verified identities and case decisions are unchanged.';
// OCI's Cohere native API supports the basic schema subset; application checks
// enforce nonempty strings, bounded lists and case-scoped evidence references.
export const VALIDATION_SCHEMA={type:'object',required:['disposition','summary','claims','legitimateExplanation','missingEvidence','nextSteps'],properties:{disposition:{type:'string',enum:DISPOSITIONS},summary:{type:'string'},claims:{type:'array',items:{type:'object',required:['text','evidenceIds'],properties:{text:{type:'string'},evidenceIds:{type:'array',items:{type:'string'}}}}},legitimateExplanation:{type:'string'},missingEvidence:{type:'array',items:{type:'string'}},nextSteps:{type:'array',items:{type:'string'}}}};

export function validationPacket(r,a,policy){
 const packet={version:VALIDATION_VERSION,recordId:r.id,asOf:r.asOf,borrower:r.borrower.name,
  facility:{loanType:r.facility.loanType,purpose:r.facility.purpose,sanctionClause:r.facility.sanctionClause,allowedUseCategories:r.facility.allowedUseCategories,restrictedPayeeIds:r.facility.restrictedPayeeIds},
  policy:structuredClone(policy),ruleResult:{outcome:a.outcome,reviewInr:a.reviewInr,findings:a.findings,gaps:a.gaps,contexts:a.contexts},
  transactions:a.trace.transactions.map(t=>({id:t.id,from:t.from,to:t.to,amountInr:t.amountInr,postedAt:t.postedAt,status:t.status,observed:t.observed,activeLoanInr:t.activeLoanInr,reversedInr:t.reversedInr,fundingStatus:t.fundingStatus,evidenceId:t.evidenceId})),
  recipients:r.entities.map(e=>({id:e.id,name:e.name,type:e.type,identityStatus:e.identityStatus})),
  approvals:structuredClone(r.exceptions||[]),fixedDeposits:structuredClone(r.fds||[]),relationships:structuredClone(r.relationships||[]),accountHistory:structuredClone(r.history||[]),
  evidence:r.evidence.filter(e=>!['oci_validation','assistant_web_research','bloomberg_mock_enrichment'].includes(e.kind)).map(e=>({id:e.id,title:e.title,kind:e.kind,status:e.status,source:e.source,capturedAt:e.capturedAt,payload:e.payload}))};
 if(JSON.stringify(packet).length>100000)throw Error('This case exceeds the demo evidence limit. Use a smaller case.');
 return packet;
}

export function parseValidation(text,packet){
 if(typeof text!=='string'||text.length>30000)throw Error('The model response exceeded the demo limit.');
 let value;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('The model did not return a valid JSON review. Try again.');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('The model returned an incomplete review (object required).');
 const str=(x,field,max=2500)=>{if(typeof x!=='string'||!x.trim()||x.length>max)throw Error('The model returned an incomplete review ('+field+').');return x.trim();};
 const list=(x,field)=>{if(!Array.isArray(x)||x.length>12)throw Error('The model returned an invalid review list ('+field+').');return x.map(v=>str(v,field));};
 if(!DISPOSITIONS.includes(value.disposition))throw Error('The model returned an unsupported disposition.');
 const ids=new Set(packet.evidence.map(e=>e.id));
 if(!Array.isArray(value.claims)||!value.claims.length||value.claims.length>12)throw Error('The model must cite evidence for its observations.');
 const claims=value.claims.map(c=>{if(!c||!Array.isArray(c.evidenceIds)||!c.evidenceIds.length||c.evidenceIds.length>12||c.evidenceIds.some(id=>!ids.has(id)))throw Error('The model cited evidence outside this case. No review was saved.');return {text:str(c.text,'claim text'),evidenceIds:[...new Set(c.evidenceIds)]};});
 return {disposition:value.disposition,summary:str(value.summary,'summary'),claims,legitimateExplanation:str(value.legitimateExplanation,'legitimateExplanation'),missingEvidence:list(value.missingEvidence,'missingEvidence'),nextSteps:list(value.nextSteps,'nextSteps')};
}

export function preparedValidation(packet){
 const refs=[...new Set([...packet.ruleResult.findings,...packet.ruleResult.gaps,...packet.ruleResult.contexts].flatMap(f=>f.evidenceIds))].filter(id=>packet.evidence.some(e=>e.id===id));
 const primary=packet.ruleResult.findings[0]||packet.ruleResult.gaps[0]||packet.ruleResult.contexts[0];
 const disposition=packet.ruleResult.findings.length?'Review required':packet.ruleResult.gaps.length?'Evidence needed':packet.ruleResult.contexts.length?'Inconclusive':'Supported';
 return parseValidation(JSON.stringify({disposition,
  summary:primary?primary.title+'. '+primary.detail:'The current rules report supported payments using the supplied acceptance evidence.',
  claims:[{text:primary?primary.detail:'The loan purpose and supplied case documents underpin the current supported assessment.',evidenceIds:refs.length?refs.slice(0,5):packet.evidence.slice(0,1).map(e=>e.id)}],
  legitimateExplanation:disposition==='Supported'?'Accepted commercial records can explain the payment under the loan conditions. This remains a prepared example.':'A permitted supplier purchase, approved exception or documented account migration may explain the activity. Check the transaction-specific records before deciding.',
  missingEvidence:disposition==='Supported'?[]:['Confirm beneficiary identity against bank-held records.','Reconcile the relevant invoice, delivery record and scoped approval.'],
  nextSteps:disposition==='Supported'?['Retain the supporting evidence and continue monitoring.']:['Review the cited source records.','Request the missing commercial explanation.','Submit the officer finding for independent review.']}),packet);
}

export function validationSummary(packet){return packet.ruleResult.outcome+' · '+money(packet.ruleResult.reviewInr)+' for review';}

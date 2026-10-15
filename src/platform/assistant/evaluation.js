import expectations from '../../../fixtures/model-validation-expectations.json' with {type:'json'};
import {preparedValidation,VALIDATION_VERSION,VALIDATION_LIMITATION,validationPacket} from './validation.js';
export const MODEL_EXPECTATIONS=expectations;
export const MODEL_TEST_LIMITATION='Authored synthetic test cases, not independent bank labels. Checks measure disposition agreement, citation validity and mention of expected topics. They do not verify source truth, detect all hallucinations or establish fraud accuracy. Review each answer yourself.';
export function evaluateReview(result,expected){
 const review=result.review,text=JSON.stringify(review).toLowerCase(),ids=new Set(result.packet.evidence.map(e=>e.id));
 const dispositionAgrees=expected.acceptableDispositions.includes(review.disposition);
 const citationsValid=review.claims.length>0&&review.claims.every(c=>c.evidenceIds.length&&c.evidenceIds.every(id=>ids.has(id)));
 const concepts=expected.concepts.map(c=>({name:c.name,mentioned:c.terms.some(term=>text.includes(term.toLowerCase()))}));
 return {dispositionAgrees,citationsValid,concepts,checksPassed:dispositionAgrees&&citationsValid&&concepts.every(c=>c.mentioned),limitations:MODEL_TEST_LIMITATION};
}
export function evaluationTotals(rows){
 const completed=rows.filter(r=>r.result),errors=rows.filter(r=>r.error),passed=completed.filter(r=>r.checks.checksPassed);
 return {attempted:rows.length,completed:completed.length,errors:errors.length,checksPassed:passed.length,needsReview:completed.length-passed.length,agreement:completed.length?completed.filter(r=>r.checks.dispositionAgrees).length/completed.length:null,
  unstableCases:[...new Set(completed.map(r=>r.recordId))].filter(id=>new Set(completed.filter(r=>r.recordId===id).map(r=>r.result.review.disposition)).size>1)};
}
export function preparedEvaluation(records,policy,ids,assess){
 const rows=ids.map(id=>{const r=records.find(r=>r.id===id),expected=MODEL_EXPECTATIONS.find(e=>e.recordId===id);if(!r||!expected)throw Error('Select an available model-test case.');const a=assess(r,policy),packet=validationPacket(r,a,policy),result={recordId:id,mode:'Prepared example',provider:'Local demonstration',promptVersion:VALIDATION_VERSION,ruleOutcome:a.outcome,packet,review:preparedValidation(packet),limitations:VALIDATION_LIMITATION};return {recordId:id,borrower:r.borrower.name,repeat:1,ruleOutcome:a.outcome,expected,result,checks:evaluateReview(result,expected)};});
 return {id:'PREPARED-EVAL',mode:'Prepared test walkthrough',status:'Completed',total:rows.length,createdAt:new Date().toISOString(),rows,totals:evaluationTotals(rows),limitations:MODEL_TEST_LIMITATION};
}

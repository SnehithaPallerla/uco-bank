// Generated evaluation examples. Labels and model rubrics live in separate fixtures.
export const MODEL_SAMPLE_VERSION=1;
const definitions=[
 ['MT-BLUEFIN','Eastern Freight Services','Repeated procurement payments','Prakash Industrial Traders'],
 ['MT-BLUEFIN-OK','Harbour Distribution','Documented warehouse procurement','Narmada Materials'],
 ['MT-CAPITAL','Seabrook Engineering','CC/OD payment to a securities business','Summit Securities'],
 ['MT-FD-OK','Lotus Fabrication','Approved margin deposit'],
 ['DU01','Cedar Packaging','Two possible beneficiary identities'],
 ['BOUND-DELAYED','Riverbend Construction','Invoice present; delivery outstanding'],
 ['MT-FD','Marigold Textiles','Loan-linked fixed deposit'],
 ['MT-REOPEN','Western Components','Account closure followed by reopening'],
 ['MT-REOPEN-OK','Maple Manufacturing','Documented account migration'],
 ['MT-RETAIL','Aarav Mehta','Housing payment outside sanctioned recipient'],
 ['MT-RETAIL-OK','Diya Nair','Documented builder payment'],
 ['CL03','Clearwater Projects','Related-party payment requiring support'],
 ['CL04','Cobalt Infrastructure','Payments to ten new recipients'],
 ['CL05','Saffron Engineering','Observed payment cycle'],
 ['BOUND-PARTIAL','Meadow Logistics','Approval covers only part of a payment'],
 ['BOUND-EXPIRED','Stonebridge Industries','Approval validity has expired'],
 ['OP01','Silverline Manufacturing','Confirmed reversal and corrected payment'],
 ['BOUND-PARTIALRETURN','Northshore Developers','Partial reversal leaves a residual'],
 ['BOUND-CONFLICT','Palmleaf Industries','Conflicting registry evidence'],
 ['BOUND-ASSIGNMENT','Greenfield Warehousing','Documented seller collection arrangement']
];
export function modelSamples(base){return definitions.map(([source,name,title,payee],i)=>{
 const original=base.find(r=>r.id===source);if(!original)throw Error('Missing model sample source '+source);
 const id='LAB-'+String(i+1).padStart(3,'0');let bytes=JSON.stringify(original).replaceAll(original.id,id).replaceAll(original.borrower.name,name);
 if(payee){const receiver=original.entities.find(e=>original.transactions.some(t=>t.from===original.borrower.id&&t.to===e.id));if(receiver)bytes=bytes.replaceAll(receiver.name,payee);}
 const r=JSON.parse(bytes);r.title=title;r.profile='model-lab';r.origin='Generated model-test sample';r.branch=i%3===0?'BBS':'KOL';r.modelSampleVersion=MODEL_SAMPLE_VERSION;delete r.comparatorOf;
 return r;
});}

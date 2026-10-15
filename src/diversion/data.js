export const DAY='2026-09-25T04:30:00.000Z';
export const copy=x=>JSON.parse(JSON.stringify(x));
export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
export const stamp=s=>new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
export const templates=[
 ['related','Related-party outflow','Term loan → promoter-linked company; approval unknown.',true],
 ['repeat','Repeated transfers','Repeated debits and a return credit with one party.',true],
 ['investment','CC/OD investment','Drawdown paid to a verified investment counterparty.',true],
 ['fd','Linked UCO fixed deposit','Loan proceeds linked to an unapproved UCO FD.',true],
 ['reopen','Account reopened','Same customer opens an account after closure; contextual review.',false],
 ['retail','Retail external transfer','Housing-loan proceeds move to an unapproved external payee.',true],
 ['split','Gradual split transfers','Several smaller transfers aggregate over the review window.',true],
 ['cycle','Circular movement','Three chronological transfers return to the borrower.',true],
 ['own','External own account','Borrower routes loan funds to its own external account.',true],
 ['debt','Other debt repayment','Loan-funded repayment of an unrelated debt.',true],
 ['cash','Cash withdrawal','Material cash use without a recorded permitted purpose.',true],
 ['intermediary','Intermediary routing','An observed intermediary transfer reaches a related company.',true],
 ['shortfall','Utilisation shortfall','Deployment milestone passed; utilisation evidence is incomplete.',true],
 ['invoice','Invoice mismatch','Payee and invoice beneficiary do not match.',true],
 ['approved','Approved supplier payment','Sanction-aligned purchase with invoice and approval.',false],
 ['margin','Approved margin FD','UCO FD placement is explicitly approved as margin.',false],
 ['dealer','Approved car dealer','External-bank dealer payment is permitted and evidenced.',false],
 ['unlinked','Unlinked working-capital credit','Customer sales receipt; no loan-funding linkage.',false]
].map(([id,name,description,positive])=>({id,name,description,positive}));
export const truth=Object.fromEntries(templates.map(t=>[t.id,t.positive]));
export const ruleDefinitions=[
 ['T01','Repeated same-party flows','BRD',100000,168,'Medium','3+ outgoing payments or repeated two-way flows; approved business payments excluded.','Finacle transaction IDs, CIF and counterparty mapping'],
 ['T02','CC/OD investment use','BRD',100000,168,'High','CC/OD funding linked to a verified investment counterparty.','Drawdown linkage and verified counterparty classification'],
 ['T03','Loan-funded UCO FD','BRD',100000,168,'High','Explicit Finacle funding link to a UCO fixed deposit; approved margin excluded.','Facility, drawdown and FD placement linkage'],
 ['T04','New account after closure','BRD',0,720,'Low','Same CIF; new account opens after closure in the configured window. Context only.','CIF, closed/opened account dates'],
 ['T05','Retail external-bank transfer','BRD',100000,168,'Medium','Housing/car-loan proceeds to an external bank; approved builder/dealer excluded.','Retail product, transfer, beneficiary and approval'],
 ['T06','Sanctioned-purpose mismatch','Extension',100000,168,'High','Observed use conflicts with the recorded sanction purpose.','Sanction clause and transaction purpose'],
 ['T07','Related-party routing','Extension',100000,168,'Medium','Loan-funded payment to a verified related entity without recorded approval.','Sourced ownership/director relation'],
 ['T08','Rapid outward movement','Extension',500000,4,'Medium','Material linked outward payment soon after drawdown.','Drawdown and outward timestamps'],
 ['T09','Gradual splitting','Extension',500000,168,'Medium','3+ sub-threshold transfers reach an aggregate threshold.','Time-window aggregation by facility and party'],
 ['T10','External own-account routing','Extension',100000,168,'Medium','Linked transfer to a verified own account at another bank.','Verified beneficial ownership and bank identifier'],
 ['T11','Unapproved debt repayment','Extension',100000,168,'High','Loan-linked payment identified as repayment of other debt.','Payment purpose and creditor classification'],
 ['T12','Material cash use','Extension',200000,168,'Medium','Linked cash withdrawal without a recorded business approval.','Cash transaction code and funding link'],
 ['T13','Circular transfer path','Extension',100000,168,'High','Chronological 3-leg observed path returns to the borrower.','Observed transfer IDs; no invented external legs'],
 ['T14','Intermediary onward transfer','Extension',100000,24,'High','Observed onward transfer reaches a verified related entity.','Both observed legs and sourced entity relationship'],
 ['T15','Deployment evidence shortfall','Extension',500000,720,'Medium','Due milestone has a material gap between drawdown and evidenced utilisation.','Sanction milestone and accepted utilisation documents'],
 ['T16','Invoice/payee mismatch','Extension',100000,168,'High','Submitted invoice names a different beneficiary from the funded payment.','Invoice beneficiary and transaction payee']
].map(([id,name,scope,minAmount,hours,severity,description,fields])=>({id,name,scope,minAmount,hours,severity,description,fields,enabled:true,excludeApproved:true,excludeApprovedPayee:true}));

export function makeRecord(kind='related',serial=1,scale=1){
 const template=templates.find(t=>t.id===kind);if(!template)throw Error('Unknown scenario');
 if(!Number.isFinite(scale)||scale<.1||scale>10)throw Error('Amount scale must be between 0.1 and 10');
 const id='DEMO-'+String(serial).padStart(3,'0'),at=m=>new Date(Date.parse(DAY)+m*60000).toISOString();
 const r={id,kind,mode:'Synthetic',name:['Prerna Components','Nilaya Engineering','Sahyog Manufacturing','Kaveri Packaging'][serial%4]+' Demo '+serial,city:['Kolkata','Bhubaneswar','Lucknow'][serial%3],cif:'SYN-CIF-'+serial,industry:'Manufacturing',facility:{id:'FAC-'+serial,type:'Term loan',limit:20000000*scale,drawn:10000000*scale,purpose:'Raw materials',clause:'SC-04: funds for raw materials from approved suppliers; other use requires written approval.',approvedPayees:['SUP'],drawdownId:'DD-'+serial,drawnAt:at(0),milestone:at(1440),documentId:'SAN-'+serial},accounts:[{id:'BOR',name:'Borrower UCO account',bank:'UCO',owner:'Borrower',type:'Account'},{id:'SUP',name:'Aarambh Metals Demo',bank:'Other bank',owner:'Supplier',type:'Company'},{id:'REL',name:'Sarthak Ventures Demo',bank:'Other bank',owner:'Related company',type:'Company'},{id:'INV',name:'Demo Investment Company',bank:'Other bank',owner:'Investment company',type:'Company'},{id:'MID',name:'Prakash Services Demo',bank:'UCO',owner:'Intermediary',type:'Company'},{id:'OWN',name:'Borrower external account',bank:'Other bank',owner:'Borrower',type:'Account'},{id:'FD',name:'UCO fixed deposit',bank:'UCO',owner:'Borrower',type:'Fixed deposit'},{id:'CASH',name:'Cash withdrawal',bank:'UCO',owner:'Cash',type:'Cash'},{id:'DEBT',name:'Other debt creditor',bank:'Other bank',owner:'Creditor',type:'Company'}],transactions:[],relations:[{id:'RELATION-'+serial,from:'BOR',to:'REL',type:'Common director',source:'SYN-KYC-'+serial,verified:true,asOf:at(-1440),certainty:'Observed synthetic KYC'}],fds:[],history:[],documents:[],classifications:[{entity:'INV',category:'Investment',verified:true,source:'SYN-PUBLIC-'+serial}],observedAt:at(4320),source:'Synthetic Finacle fixture'};
 const tx=(n,from,to,amount,minute,purpose='Unspecified',approval='Unknown',linked=true)=>({id:id+'-TX'+n,version:1,from,to,amount:Math.round(amount*scale),at:at(minute),receivedAt:at(minute+1),channel:to==='CASH'?'CASH':'RTGS',purpose,approval,approvalRef:approval==='Approved'?'APR-'+serial+'-'+n:null,fundingLink:linked?r.facility.drawdownId:null,source:'Synthetic Finacle',certainty:'Observed'});
 const push=(...args)=>r.transactions.push(tx(...args));
 if(kind==='related')push(1,'BOR','REL',3000000,120);
 if(kind==='repeat'){for(let n=1;n<=4;n++)push(n,'BOR','REL',200000,n*120);push(5,'REL','BOR',100000,700);}
 if(kind==='investment'){r.facility.type='CC/OD';push(1,'BOR','INV',1500000,60,'Investment','Not approved');}
 if(['fd','margin'].includes(kind)){push(1,'BOR','FD',2500000,90,'FD placement',kind==='margin'?'Approved':'Not approved');r.fds=[{id:'FD-'+serial,amount:2500000*scale,bank:'UCO',fundingTx:r.transactions[0].id,source:'Synthetic Finacle FD linkage',approval:kind==='margin'?'Approved':'Not approved'}];}
 if(kind==='reopen'){r.history=[{cif:r.cif,account:'OLD-'+serial,closed:at(-7200)},{cif:r.cif,account:'NEW-'+serial,opened:at(0)}];push(1,'BOR','SUP',100000,300,'Raw materials','Approved');}
 if(['retail','dealer'].includes(kind)){r.industry='Retail borrower';r.facility.type=kind==='dealer'?'Car loan':'Housing loan';r.facility.purpose=kind==='dealer'?'Vehicle purchase':'Housing purchase';r.facility.clause='SC-09: payment only to the approved dealer/builder.';push(1,'BOR',kind==='dealer'?'SUP':'REL',2000000,30,kind==='dealer'?'Vehicle purchase':'Unspecified',kind==='dealer'?'Approved':'Unknown');}
 if(kind==='split')for(let n=1;n<=5;n++)push(n,'BOR','REL',150000,n*500);
 if(kind==='cycle'){push(1,'BOR','MID',1500000,60);push(2,'MID','REL',1400000,90);push(3,'REL','BOR',1300000,120);}
 if(kind==='own')push(1,'BOR','OWN',2000000,90);
 if(kind==='debt')push(1,'BOR','DEBT',2000000,60,'Debt repayment','Not approved');
 if(kind==='cash')push(1,'BOR','CASH',900000,300,'Unspecified','Unknown');
 if(kind==='intermediary'){push(1,'BOR','MID',2500000,60);push(2,'MID','REL',2300000,90);}
 if(kind==='shortfall'){push(1,'BOR','SUP',1000000,300,'Raw materials','Approved');r.utilisation={due:at(1440),acceptedAmount:1000000*scale,source:'UTIL-'+serial};}
 if(kind==='invoice'){push(1,'BOR','MID',1200000,300,'Raw materials','Unknown');r.documents=[{id:'INV-'+serial,type:'Invoice',payee:'SUP',amount:1200000*scale,transaction:r.transactions[0].id,status:'Submitted',source:'Synthetic document'}];}
 if(kind==='approved'){push(1,'BOR','SUP',3500000,90,'Raw materials','Approved');r.documents=[{id:'INV-'+serial,type:'Invoice',payee:'SUP',amount:3500000*scale,transaction:r.transactions[0].id,status:'Accepted',source:'Synthetic document'}];}
 if(kind==='unlinked'){r.facility.type='CC/OD';push(1,'SUP','BOR',1200000,60,'Sales receipt','Unknown',false);push(2,'BOR','INV',900000,300,'Investment','Unknown',false);}
 return r;
}
export function syntheticResearch(r,status='Available'){
 return {id:'EVID-'+r.id+'-'+status,recordId:r.id,mode:'Synthetic',title:'Illustrative counterparty filing',publisher:'Synthetic registry fixture',url:null,sourceDate:'2026-09-20',retrievedAt:new Date().toISOString(),status,match:status==='Available'?'Matched synthetic identifier':'Not established',entity:'Sarthak Ventures Demo',entityId:'SYN-ENTITY-'+r.id,excerpt:status==='Available'?'The fictional borrower and Sarthak Ventures Demo share a director in this fixture. This supports a relationship; it does not establish end use or wrongdoing.':null,claim:'Relationship context only',limitations:'No evidence of downstream external-bank transactions. This is an invented demonstration source.',stale:status==='Stale',contradiction:status==='Conflicting'?'Fixture contains two different director records; resolve the discrepancy before use.':null};
}
export const sampleQuestions=['Why was this borrower flagged?','Trace the loan funds.','What evidence links the beneficiary?','What evidence is missing?','What would justify closing this alert?','Does this prove fraud?','Summarise the monitoring portfolio.','Which Oracle components support this case?'];

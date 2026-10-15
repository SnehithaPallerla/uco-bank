import {accounts,accountById,initialTransactions} from './data.js';
export const clone=x=>JSON.parse(JSON.stringify(x));
export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
export const time=s=>new Date(s).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'});
export const KEY='uco-credit-monitoring-v2';
export const defaultPolicy={version:1,minAmount:250000,multiplier:3,fanIn:4,threshold:62};
function audit(s,action,detail,role='System'){s.audit.unshift({id:'AUD'+(++s.seq),at:new Date().toISOString(),action,detail,role});}
export function score(tx,ledger,policy){
 const prior=ledger.filter(x=>x.id!==tx.id&&Date.parse(x.at)<=Date.parse(tx.at));
 const recent=prior.filter(x=>x.to===tx.to&&Date.parse(tx.at)-Date.parse(x.at)<=3600000);
 const senders=new Set([...recent.map(x=>x.from),tx.from]);
 const ratio=tx.amount/accountById[tx.to].usual;
 const reasons=[];
 if(tx.amount>=policy.minAmount&&ratio>=policy.multiplier)reasons.push('Amount above account profile');
 if(senders.size>=policy.fanIn)reasons.push('Multiple senders within 1 hour');
 const receipts=prior.filter(x=>x.to===tx.from&&Date.parse(tx.at)-Date.parse(x.at)<=1800000).reduce((n,x)=>n+x.amount,0);
 if(receipts>=100000&&tx.amount>=receipts*.75)reasons.push('Rapid onward transfer');
 if(accountById[tx.to].flag)reasons.push('Internal review flag on recipient');
 const anomaly=Math.min(99,Math.round(12+Math.min(45,ratio*8)+Math.max(0,senders.size-1)*7+(accountById[tx.to].flag?18:0)));
 if(anomaly>=policy.threshold)reasons.push('Illustrative anomaly threshold');
 return {score:anomaly,reasons,ratio:ratio.toFixed(1),senders:senders.size};
}
export function alerts(s){
 return s.transactions.map(tx=>{const scored=score(tx,s.transactions,s.policy);return {id:'AL-'+tx.id,tx,...scored,severity:scored.score>=80?'High':'Medium',graph:(s.graphEvidence[tx.to]||[])};}).filter(a=>a.reasons.length||a.graph.length);
}
export function initialState(){
 const s={schema:1,seq:100,transactions:clone(initialTransactions),policy:clone(defaultPolicy),events:initialTransactions.map(t=>({event:clone(t),status:'Accepted',reason:'Seed event'})),queue:[],quarantine:[],online:true,cases:[],audit:[],outbox:[],graphEvidence:{},models:[{id:'OML-01',name:'Baseline candidate',algorithm:'One-Class SVM',status:'Active',version:'1.0',validation:null},{id:'OML-02',name:'Challenger candidate',algorithm:'One-Class SVM',status:'Draft',version:'1.1',validation:null}],activeModel:'OML-01'};
 const aa=alerts(s).slice(0,3);for(const a of aa)createCase(s,a.id,'Analyst');
 audit(s,'Demo initialized','Fictional account data loaded; no live Oracle services.');return s;
}
export function validate(t){
 if(!t.id||!Number.isInteger(t.version)||t.version<1)return 'An event ID and positive integer version are required';
 if(!accountById[t.from]||!accountById[t.to]||t.from===t.to)return 'Two different known accounts are required';
 if(!Number.isFinite(t.amount)||t.amount<=0)return 'Amount must be a positive INR value';
 if(!['UPI','NEFT','IMPS','RTGS'].includes(t.channel))return 'Unsupported channel';
 if(!Number.isFinite(Date.parse(t.at)))return 'A valid timestamp is required';
 return '';
}
function processEvent(s,event,record){
 const duplicate=s.transactions.find(t=>t.id===event.id&&t.version===event.version);
 if(duplicate){record.status='Duplicate';record.reason='ID/version already accepted';return;}
 const reason=validate(event)||(s.transactions.some(t=>t.id===event.id)?'New version requires a reviewed correction workflow':'');
 if(reason){record.status='Quarantined';record.reason=reason;s.quarantine.push({id:'Q'+(++s.seq),raw:clone(event),reason,status:'Open'});return;}
 record.status='Accepted';record.reason='Validated';s.transactions.push(clone(event));
}
export function ingest(s,event){const record={event:clone(event),status:'Pending',reason:'Consumer unavailable'};s.events.push(record);if(!s.online)s.queue.push(s.events.length-1);else processEvent(s,event,record);audit(s,'Event received',event.id+' · '+record.status);}
export function setOnline(s,online){s.online=online;if(online){for(const idx of s.queue){const r=s.events[idx];processEvent(s,r.event,r);}s.queue=[];}audit(s,online?'Consumer resumed':'Consumer paused',online?'Pending events replayed with ID/version deduplication':'New events will remain queued');}
export function repair(s,id,amount,role){const q=s.quarantine.find(x=>x.id===id);if(!q||q.status!=='Open')throw Error('No open quarantine item');const fixed={...q.raw,amount:Number(amount)};const reason=validate(fixed);if(reason)throw Error(reason);if(s.transactions.some(t=>t.id===fixed.id))throw Error('Existing IDs require a separate correction workflow');q.status='Repaired';q.corrected=clone(fixed);ingest(s,fixed);audit(s,'Quarantine repair',id+' · source evidence preserved',role);}
export function scenario(s,type){const at=(delta)=>new Date(Math.max(...s.transactions.map(t=>Date.parse(t.at)))+delta*60000).toISOString();const base='TX'+(++s.seq)+'-';const tx=(n,from,to,amount,m,channel='NEFT')=>({id:base+n,version:1,from,to,amount,at:at(m),channel,purpose:'Simulated '+type});
 if(type==='cycle')return [tx(1,'A101','A102',920000,2,'RTGS'),tx(2,'A102','A103',900000,4,'RTGS'),tx(3,'A103','A101',870000,6,'RTGS')];
 if(type==='fan-in')return [tx(1,'A104','A112',48000,1,'UPI'),tx(2,'A105','A112',49000,2,'IMPS'),tx(3,'A108','A112',47000,3,'UPI'),tx(4,'A110','A112',48000,4,'IMPS'),tx(5,'A112','A103',185000,6)];
 if(type==='invalid')return [tx(1,'A104','A107',-12000,1,'UPI')];
 if(type==='duplicate')return [clone(s.transactions[0])];
 return [tx(1,'A109','A104',65000,1)];
}
export function queryGraph(s,kind='cycles',hours=24,maxHops=3){
 const end=Math.max(...s.transactions.map(t=>Date.parse(t.at))),start=end-hours*3600000;
 const ledger=s.transactions.filter(t=>Date.parse(t.at)>=start&&Date.parse(t.at)<=end).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const results=[];const seen=new Set();
 if(kind==='cycles'){
  const walk=(root,current,path,visited)=>{for(const tx of ledger.filter(t=>t.from===current&&(!path.length||Date.parse(t.at)>Date.parse(path.at(-1).at)))){const next=[...path,tx];if(tx.to===root&&next.length>=3){const key=next.map(t=>t.id).join('|');if(!seen.has(key)){seen.add(key);results.push({id:key,label:next.length+'-transfer cycle',nodes:[...new Set(next.flatMap(t=>[t.from,t.to]))],edges:next.map(t=>t.id),amount:next.reduce((n,t)=>n+t.amount,0),detail:next.map(t=>t.from).concat(root).join(' → ')});}continue;}if(next.length<maxHops&&!visited.has(tx.to))walk(root,tx.to,next,new Set([...visited,tx.to]));}};
  for(const a of accounts)walk(a.id,a.id,[],new Set([a.id]));
 }else if(kind==='fanin'){
  for(const a of accounts){const incoming=ledger.filter(t=>t.to===a.id);const senders=[...new Set(incoming.map(t=>t.from))];if(senders.length>=s.policy.fanIn){const last=Math.max(...incoming.map(t=>Date.parse(t.at)));const outgoing=ledger.filter(t=>t.from===a.id&&Date.parse(t.at)>last&&Date.parse(t.at)-last<=1800000);results.push({id:'F-'+a.id,label:senders.length+' distinct senders',nodes:[a.id,...senders,...outgoing.map(t=>t.to)],edges:[...incoming,...outgoing].map(t=>t.id),amount:incoming.reduce((n,t)=>n+t.amount,0),detail:a.name+(outgoing.length?' · onward transfer within 30m':' · no onward transfer after last receipt')});}}
 }else if(kind==='devices'){
  for(const device of [...new Set(accounts.map(a=>a.device))]){const nodes=accounts.filter(a=>a.device===device).map(a=>a.id);if(nodes.length>1)results.push({id:device,label:'Shared device '+device,nodes,edges:[],amount:0,detail:nodes.length+' accounts · entity metadata; not time filtered'});}
 }else if(kind==='proximity'){
  for(const root of accounts.filter(a=>a.flag)){const visited=new Set([root.id]);let frontier=[root.id];const edges=new Set();for(let hop=0;hop<maxHops;hop++){const next=[];for(const n of frontier)for(const tx of ledger.filter(t=>t.from===n||t.to===n)){const other=tx.from===n?tx.to:tx.from;edges.add(tx.id);if(!visited.has(other)){visited.add(other);next.push(other);}}frontier=next;}results.push({id:'P-'+root.id,label:'Within '+maxHops+' hops of review flag',nodes:[...visited],edges:[...edges],amount:0,detail:root.name+' · undirected relationship reachability'});}
 }else results.push({id:'all',label:'Observed transfers',nodes:[...new Set(ledger.flatMap(t=>[t.from,t.to]))],edges:ledger.map(t=>t.id),amount:ledger.reduce((n,t)=>n+t.amount,0),detail:ledger.length+' transfers in selected window'});
 return {kind,hours,maxHops,start,end,results};
}
export function enrich(s,query,role){for(const row of query.results)for(const id of row.nodes)s.graphEvidence[id]=[...new Set([...(s.graphEvidence[id]||[]),row.label])];audit(s,'Graph evidence published',query.kind+' · '+query.results.length+' matches',role);}
export function createCase(s,alertId,role){const existing=s.cases.find(c=>c.alertId===alertId);if(existing)return existing.id;const a=alerts(s).find(a=>a.id===alertId);if(!a)throw Error('Alert no longer exists');const id='CASE-'+(s.cases.length+1001);s.cases.push({id,alertId,account:a.tx.to,title:accountById[a.tx.to].name,status:'New',owner:'Unassigned',created:new Date().toISOString(),priority:a.severity,evidence:clone({...a,policyVersion:s.policy.version,modelRegistryEntry:s.activeModel,scoreEngine:'Demonstration heuristic; not trained ML'}),notes:[],graphSnapshots:[]});s.outbox.unshift({id:'N'+(++s.seq),caseId:id,status:'Pending',text:'New investigation '+id});audit(s,'Case created',id+' · evidence snapshot captured',role);return id;}
export function caseAction(s,id,action,role,text=''){
 const c=s.cases.find(c=>c.id===id);if(!c)throw Error('Case not found');if(c.status==='Closed')throw Error('Closed cases are read only');
 if(['close','escalate','approve','return'].includes(action)&&text.trim().length<10)throw Error('Enter a rationale of at least 10 characters');
 if(c.status==='Escalated'&&['approve','return'].includes(action)&&role!=='Reviewer')throw Error('A Reviewer must perform this action');
 if(c.status==='Escalated'&&['close','claim','escalate'].includes(action))throw Error('Escalated cases require a Reviewer decision');
 if(['approve','return'].includes(action)&&c.status!=='Escalated')throw Error('Only escalated cases can be reviewed');
 if(action==='claim'){c.owner=role;c.status='In review';}
 else if(action==='note'){if(!text.trim())throw Error('Enter a note');c.notes.push({text,role,at:new Date().toISOString()});}
 else if(action==='snapshot')c.graphSnapshots.push(clone(queryGraph(s,'cycles',24,3)));
 else if(action==='escalate')c.status='Escalated';
 else if(action==='close'||action==='approve')c.status='Closed';
 else if(action==='return')c.status='In review';
 else throw Error('Unknown case action');
 if(text.trim()&&action!=='note')c.notes.push({text,role,at:new Date().toISOString()});audit(s,'Case '+action,id,role);
}
export function activatePolicy(s,policy,role){if(role!=='Reviewer')throw Error('Reviewer role required');if(!['minAmount','multiplier','fanIn','threshold'].every(k=>Number.isFinite(policy[k]))||policy.minAmount<=0||policy.multiplier<1||!Number.isInteger(policy.fanIn)||policy.fanIn<2||policy.threshold<1||policy.threshold>99)throw Error('Check policy values');s.policy={...policy,version:s.policy.version+1};audit(s,'Policy activated','Version '+s.policy.version,role);}
export function modelAction(s,id,action,role){const m=s.models.find(x=>x.id===id);if(!m)throw Error('Model not found');if(action==='validate'){if(!['Draft','Validated'].includes(m.status))throw Error('Only draft candidates can be validated');m.validation={rows:s.transactions.length,invalid:s.transactions.filter(t=>validate(t)).length,at:new Date().toISOString(),note:'Data checks only. No trained model or accuracy evaluation.'};m.status='Validated';}else{if(role!=='Reviewer')throw Error('Reviewer role required');if(action==='approve'){if(m.status!=='Validated')throw Error('Validate first');m.status='Approved';}else if(action==='activate'||action==='rollback'){if(!['Approved','Retired'].includes(m.status))throw Error('An approved or previously active model is required');const current=s.models.find(x=>x.status==='Active');if(current)current.status='Retired';m.status='Active';s.activeModel=m.id;}else throw Error('Unknown model action');}audit(s,'Model '+action,id+' · demonstration metadata only',role);}
export function dispatch(s,role){s.outbox.forEach(n=>n.status='Simulated delivery');audit(s,'Notification simulation','Outbox marked delivered locally; no messages sent',role);}
export function mutate(state,fn){const next=clone(state);fn(next);return next;}
export function csv(rows){return rows.map(row=>row.map(v=>{let t=String(v??'');if(/^[=+@-]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}

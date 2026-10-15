import {canonical,traceFunds,authorize} from '../src/platform/domain.js';

const stamp=value=>value?new Date(value).toISOString().replace(/Z$/,''):null;
const flag=value=>value===true?1:value===false?0:null;
const dbId=(record,id)=>record.id+':'+id;
const graphError=(message,status=409)=>Object.assign(Error(message),{status});

// These tables are projections of the canonical record JSON, not independent
// editable sources. Synchronize them in the same transaction as record changes.
export function graphProjection(record){
 const case_id=record.id,entities=record.entities.map(e=>({case_id,entity_id:e.id,name:e.name,entity_type:e.type,identity_status:e.identityStatus??null,identity_evidence_id:e.identityEvidenceIds?.[0]??null}));
 const drawdowns=(record.drawdowns?.length?record.drawdowns:[{id:record.facility.drawdownId,amountInr:record.facility.drawdownAmountInr,at:record.facility.drawdownAt}]).filter(d=>d.id).map(d=>({drawdown_id:dbId(record,d.id),case_id,amount_inr:d.amountInr,posted_at:stamp(d.at)+'+00:00',source_ref:d.id}));
 const payments=canonical(record).transactions.map(t=>({tx_id:dbId(record,t.id),case_id,from_entity:t.from,to_entity:t.to,amount_inr:t.amountInr,posted_at:stamp(t.postedAt),original_event_time:t.postedAt,currency:t.currency,posting_status:t.status??null,payment_kind:t.kind??null,observed:flag(t.observed),drawdown_id:drawdowns.some(d=>d.drawdown_id===dbId(record,t.drawdownReference))?dbId(record,t.drawdownReference):null,reversal_of:t.reversalOf?dbId(record,t.reversalOf):null,corrected_version:t.version||1,evidence_id:t.evidenceId??null,source_ref:t.bankTransactionId||t.id}));
 const relationships=(record.relationships||[]).map((r,i)=>({relationship_id:dbId(record,r.id||'REL-'+(i+1)),case_id,from_entity:r.from,to_entity:r.to,relationship_type:r.type,verified:flag(r.verified),evidence_id:r.evidenceId??null,valid_from:stamp(r.validFrom),valid_to:stamp(r.validTo)}));
 return {entities,drawdowns,payments,relationships};
}

const specs={
 uco_entity:{keys:['case_id','entity_id'],strings:{case_id:80,entity_id:100,name:250,entity_type:50,identity_status:40,identity_evidence_id:120}},
 uco_drawdown:{keys:['drawdown_id'],strings:{drawdown_id:100,case_id:80,posted_at:40,source_ref:200},dates:{posted_at:'TZ'}},
 uco_payment:{keys:['tx_id'],strings:{tx_id:120,case_id:80,from_entity:100,to_entity:100,posted_at:40,original_event_time:50,currency:3,posting_status:20,payment_kind:30,drawdown_id:100,reversal_of:120,evidence_id:120,source_ref:200},dates:{posted_at:'UTC'}},
 uco_relationship:{keys:['relationship_id'],strings:{relationship_id:120,case_id:80,from_entity:100,to_entity:100,relationship_type:60,evidence_id:120,valid_from:40,valid_to:40},dates:{valid_from:'UTC',valid_to:'UTC'}}
};
async function mergeRows(connection,driver,table,rows){
 if(!rows.length)return;
 const spec=specs[table],columns=Object.keys(rows[0]);
 const expr=column=>spec.dates?.[column]?`TO_TIMESTAMP${spec.dates[column]==='TZ'?'_TZ':''}(:${column},'YYYY-MM-DD"T"HH24:MI:SS.FF3${spec.dates[column]==='TZ'?'TZH:TZM':''}')`:`:${column}`;
 const sql=`MERGE INTO ${table} t USING (SELECT ${columns.map(c=>expr(c)+' '+c).join(', ')} FROM dual) s ON (${spec.keys.map(c=>'t.'+c+'=s.'+c).join(' AND ')}) WHEN MATCHED THEN UPDATE SET ${columns.filter(c=>!spec.keys.includes(c)).map(c=>'t.'+c+'=s.'+c).join(', ')} WHEN NOT MATCHED THEN INSERT (${columns.join(', ')}) VALUES (${columns.map(c=>'s.'+c).join(', ')})`;
 const bindDefs=Object.fromEntries(columns.map(c=>[c,spec.strings[c]?{type:driver.STRING,maxSize:spec.strings[c]*4}:{type:driver.NUMBER}]));
 await connection.executeMany(sql,rows,{bindDefs});
}

export async function synchronizeGraphRecords(connection,driver,records){
 if(!records.length)return;
 const cases=records.map(r=>({case_id:r.id})),options={bindDefs:{case_id:{type:driver.STRING,maxSize:320}}};
 // Scoped replacement removes obsolete corrected rows, including rows that have
 // become invalid. Other cases and all evidence/audit tables remain untouched.
 for(const table of ['uco_payment','uco_relationship','uco_entity'])await connection.executeMany(`DELETE FROM ${table} WHERE case_id=:case_id`,cases,options);
 const projections=records.map(graphProjection);
 for(const [table,key] of [['uco_entity','entities'],['uco_drawdown','drawdowns'],['uco_payment','payments'],['uco_relationship','relationships']])await mergeRows(connection,driver,table,projections.flatMap(p=>p[key]));
}

export const ENTITY_QUERY=`SELECT * FROM GRAPH_TABLE(uco_flow
 MATCH (n IS entity) WHERE n.case_id=:case_id
 COLUMNS(n.entity_id AS entity_id,n.name AS name,n.entity_type AS entity_type,n.identity_status AS identity_status,n.identity_evidence_id AS identity_evidence_id)) ORDER BY entity_id`;
export const PAYMENT_QUERY=`SELECT g.*,TO_CHAR(g.posted_at,'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS posted_at_utc,p.original_event_time,p.reversal_of,p.corrected_version,p.currency
 FROM GRAPH_TABLE(uco_flow MATCH (a IS entity)-[e IS payment]->(b IS entity)
 WHERE a.case_id=:case_id AND b.case_id=:case_id AND e.case_id=:case_id
 AND e.posting_status='posted' AND (e.observed=1 OR e.observed IS NULL)
 AND e.posted_at<=TO_TIMESTAMP(:as_of,'YYYY-MM-DD"T"HH24:MI:SS.FF3')
 COLUMNS(e.tx_id AS tx_id,a.entity_id AS from_id,b.entity_id AS to_id,e.amount_inr AS amount_inr,e.posted_at AS posted_at,e.posting_status AS posting_status,e.payment_kind AS payment_kind,e.observed AS observed,e.evidence_id AS evidence_id)) g
 JOIN uco_payment p ON p.tx_id=g.tx_id AND p.case_id=:case_id
 ORDER BY p.posted_at,g.tx_id`;
export const RELATIONSHIP_QUERY=`SELECT * FROM GRAPH_TABLE(uco_flow
 MATCH (a IS entity)-[e IS relationship]->(b IS entity)
 WHERE a.case_id=:case_id AND b.case_id=:case_id AND e.case_id=:case_id AND e.verified=1
 COLUMNS(e.relationship_id AS relationship_id,a.entity_id AS from_id,b.entity_id AS to_id,e.relationship_type AS relationship_type,e.evidence_id AS evidence_id)) ORDER BY relationship_id`;

export function returnPathQuery(hops){
 if(!Number.isInteger(hops)||hops<3||hops>6)throw Error('Return paths support 3 to 6 payments.');
 const indices=Array.from({length:hops},(_,i)=>i),node=i=>'v'+(i===hops?0:i);
 let pattern='(v0 IS entity)';for(const i of indices)pattern+=`-[p${i} IS payment]->(${node(i+1)}${i===hops-1?'':' IS entity'})`;
 const conditions=["v0.case_id=:case_id","v0.entity_id=:borrower_id"];
 for(const i of indices){conditions.push(`p${i}.case_id=:case_id`,`p${i}.posting_status='posted'`,`p${i}.observed=1`,`(p${i}.payment_kind IS NULL OR p${i}.payment_kind<>'reversal')`,`p${i}.posted_at<=TO_TIMESTAMP(:as_of,'YYYY-MM-DD"T"HH24:MI:SS.FF3')`);if(i)conditions.push(`p${i-1}.posted_at<p${i}.posted_at`);for(let j=0;j<i;j++)conditions.push(`${node(j)}.entity_id<>${node(i)}.entity_id`);}
 return `WITH eligible AS (SELECT tx_id FROM JSON_TABLE(:eligible_json,'$[*]' COLUMNS(tx_id VARCHAR2(120) PATH '$')))
 SELECT g.* FROM GRAPH_TABLE(uco_flow MATCH ${pattern} WHERE ${conditions.join(' AND ')} COLUMNS(${indices.map(i=>`p${i}.tx_id AS tx${i}`).join(', ')})) g
 ${indices.map(i=>`JOIN eligible e${i} ON e${i}.tx_id=g.tx${i}`).join(' ')} FETCH FIRST 501 ROWS ONLY`;
}

export async function queryOracleGraph(connection,driver,record,user,revision){
 authorize(user,record);
 const options={outFormat:driver.OUT_FORMAT_OBJECT,maxRows:20001};
 const binds={case_id:record.id,as_of:stamp(record.asOf)};
 const entityRows=(await connection.execute(ENTITY_QUERY,{case_id:record.id},options)).rows||[];
 const paymentRows=(await connection.execute(PAYMENT_QUERY,binds,options)).rows||[];
 const relationRows=(await connection.execute(RELATIONSHIP_QUERY,{case_id:record.id},options)).rows||[];
 if([entityRows,paymentRows,relationRows].some(rows=>rows.length>20000))throw graphError('This graph exceeds the current display limit. Narrow the case data before continuing.',422);
 const canonicalTransactions=canonical(record).transactions;
 const txById=new Map(canonicalTransactions.map(t=>[dbId(record,t.id),t]));
 const entities=entityRows.map(row=>{
  const original=record.entities.find(e=>e.id===row.ENTITY_ID);
  if(!original||original.name!==row.NAME||original.type!==row.ENTITY_TYPE||original.identityStatus!==row.IDENTITY_STATUS||(original.identityEvidenceIds?.[0]??null)!==row.IDENTITY_EVIDENCE_ID)throw graphError('Oracle graph entities are out of date. Restart the server to synchronize them.');
  return {...original,name:row.NAME,type:row.ENTITY_TYPE,identityStatus:row.IDENTITY_STATUS};
 });
 if(entities.length!==record.entities.length)throw graphError('Oracle graph entities are out of date. Restart the server to synchronize them.');
 const payments=paymentRows.map(row=>{
  const original=txById.get(row.TX_ID);
  if(!original||original.from!==row.FROM_ID||original.to!==row.TO_ID||original.amountInr!==row.AMOUNT_INR||stamp(original.postedAt)!==row.POSTED_AT_UTC||Date.parse(original.postedAt)!==Date.parse(row.ORIGINAL_EVENT_TIME)||original.status!==row.POSTING_STATUS||(original.kind??null)!==row.PAYMENT_KIND||(original.evidenceId??null)!==row.EVIDENCE_ID||original.currency!==row.CURRENCY||(original.version||1)!==row.CORRECTED_VERSION||flag(original.observed)!==row.OBSERVED||(original.reversalOf?dbId(record,original.reversalOf):null)!==row.REVERSAL_OF)throw graphError('Oracle graph payments are out of date. Restart the server to synchronize them.');
  return {...original,from:row.FROM_ID,to:row.TO_ID,amountInr:row.AMOUNT_INR,postedAt:row.ORIGINAL_EVENT_TIME};
 });
 const expected=canonicalTransactions.filter(t=>t.status==='posted'&&t.observed!==false&&Date.parse(t.postedAt)<=Date.parse(record.asOf));
 if(payments.length!==expected.length)throw graphError('Oracle graph payments are out of date. Restart the server to synchronize them.');
 const relationships=relationRows.map(row=>{
  const original=(record.relationships||[]).find((r,i)=>dbId(record,r.id||'REL-'+(i+1))===row.RELATIONSHIP_ID);
  if(!original||!original.verified||original.from!==row.FROM_ID||original.to!==row.TO_ID||original.type!==row.RELATIONSHIP_TYPE||(original.evidenceId??null)!==row.EVIDENCE_ID)throw graphError('Oracle graph relationships are out of date. Restart the server to synchronize them.');
  return {...original,from:row.FROM_ID,to:row.TO_ID,type:row.RELATIONSHIP_TYPE};
 });
 if(relationships.length!==(record.relationships||[]).filter(r=>r.verified).length)throw graphError('Oracle graph relationships are out of date. Restart the server to synchronize them.');
 const trace=traceFunds({...record,transactions:payments}),byId=new Map(trace.transactions.map(t=>[dbId(record,t.id),t]));
 const eligible=trace.transactions.filter(t=>t.observed&&t.kind!=='reversal'&&t.residualInr>0).map(t=>dbId(record,t.id)),paths=[];
 if(eligible.length>=3)for(let hops=3;hops<=Math.min(6,eligible.length);hops++){
  const rows=(await connection.execute(returnPathQuery(hops),{...binds,borrower_id:record.borrower.id,eligible_json:{val:JSON.stringify(eligible),type:driver.CLOB}},{outFormat:driver.OUT_FORMAT_OBJECT,maxRows:501})).rows||[];
  if(paths.length+rows.length>500)throw graphError('More than 500 return paths were found. This graph needs a narrower investigation scope.',422);
  for(const row of rows)paths.push(Array.from({length:hops},(_,i)=>byId.get(row['TX'+i])));
 }
 paths.sort((a,b)=>a.map(t=>t.id).join('|').localeCompare(b.map(t=>t.id).join('|')));
 return {recordId:record.id,revision,entities,payments:trace.transactions.filter(t=>t.observed),relationships,paths,metrics:{directInr:trace.directInr,grossInr:trace.grossInr,returnsInr:trace.returnsInr,netInr:trace.netInr},source:'Oracle SQL Property Graph',graph:'UCO_FLOW',pathEngine:'GRAPH_TABLE - chronological return paths, 3 to 6 payments',retrievedAt:new Date().toISOString()};
}

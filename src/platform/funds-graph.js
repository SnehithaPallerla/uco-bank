import {traceFunds,chronologicalPaths} from './domain.js';

export function localFundsGraph(record,revision=0){
 const trace=traceFunds(record),posted=trace.transactions.filter(t=>t.observed&&t.status==='posted'&&Date.parse(t.postedAt)<=Date.parse(record.asOf));
 return {recordId:record.id,revision,entities:record.entities,payments:posted,relationships:record.relationships.filter(r=>r.verified),paths:chronologicalPaths({...record,transactions:posted}),metrics:{directInr:trace.directInr,grossInr:trace.grossInr,returnsInr:trace.returnsInr,netInr:trace.netInr},source:'Local demonstration graph',graph:null,pathEngine:'Local chronological traversal'};
}

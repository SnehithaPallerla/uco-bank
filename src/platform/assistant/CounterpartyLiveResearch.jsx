import React,{useEffect,useRef,useState} from 'react';
import {Sparkles,RefreshCw} from 'lucide-react';
import {RESEARCH_INTENTS,validateSubject,queryFor} from './web-research.js';
import {readResearchStatus,searchAndSaveResearch,companyResearchRuns} from './research-client.js';
import {Panel,Badge,Note,SourceList,Review,History,date} from './Shared.jsx';

export function LiveCompanyResult({result,...props}){
 return <div className="ax-layout">
  <div>
   <Panel title={'Live research - '+result.subject.name} action={<Badge>{result.status}</Badge>} caption={result.provider+' - '+date(result.retrievedAt)}>
    <p className="ax-summary">{result.summary}</p>
    {result.claims?.length>0&&<><h3>Claims linked to sources</h3><div className="ax-claims">{result.claims.map((claim,index)=><div key={index}><p>{claim.text}</p><small>{claim.sourceIds.join(' / ')}</small></div>)}</div></>}
    <Note>{result.limitations}</Note>
    <details><summary>Search provenance</summary><p>Query: {result.query}</p><p>Executed searches: {result.queries?.join(' / ')||'None returned by the provider'}</p>{result.sha256&&<><small>Provider response SHA-256</small><code>{result.sha256}</code><p>{result.hashScope}</p></>}</details>
   </Panel>
   <Panel title="Live source evidence"><SourceList result={result}/></Panel>
  </div>
  <aside><Review key={result.id} result={result} {...props}/></aside>
 </div>;
}

export default function CounterpartyLiveResearch(props){
 const {r,entity,user,run,busy,mode,onWorkingChange}=props,server=mode==='Server workspace';
 const [city,setCity]=useState(''),[publicId,setPublicId]=useState(''),[intent,setIntent]=useState('activity');
 const [status,setStatus]=useState(null),[checking,setChecking]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(null);
 const controller=useRef(null),statusController=useRef(null),mounted=useRef(true);
 const runs=companyResearchRuns(r,entity.name),result=runs.find(item=>item.id===selected)||runs[0];
 const subject={name:entity.name,city,publicId,intent},writable=['Analyst','Reviewer'].includes(user?.role);
 let validation='',query='';try{validateSubject(subject);query=queryFor(subject);}catch(e){validation=e.message;}
 const refresh=async()=>{
  statusController.current?.abort();const pending=new AbortController();statusController.current=pending;setChecking(true);setError('');
  try{const info=await readResearchStatus({signal:pending.signal});if(!pending.signal.aborted&&mounted.current)setStatus(info);}
  catch(e){if(!pending.signal.aborted&&mounted.current){setStatus(null);setError(e.message);}}
  finally{if(!pending.signal.aborted&&mounted.current)setChecking(false);}
 };
 useEffect(()=>{
  mounted.current=true;if(server)refresh();
  return()=>{mounted.current=false;controller.current?.abort();statusController.current?.abort();onWorkingChange?.(false);};
 },[server]);
 const search=async()=>{
  const pending=new AbortController();controller.current=pending;setError('');setWorking(true);onWorkingChange?.(true);
  try{const id=await searchAndSaveResearch({recordId:r.id,subject,save:run,signal:pending.signal});if(mounted.current&&!pending.signal.aborted)setSelected(id);}
  catch(e){if(mounted.current&&!pending.signal.aborted)setError(e.message);}
  finally{if(mounted.current&&!pending.signal.aborted){setWorking(false);onWorkingChange?.(false);}}
 };
 const locked=busy||working||!writable;
 return <div className="assistant-extensions evidence-live-research" aria-label="Live counterparty research">
  <Panel title="Live company research" caption="Search public websites and review cited findings for this recipient." action={<Badge>{server?(checking?'Checking availability...':status?.status||'Availability not confirmed'):'Local server required'}</Badge>}>
   <div className="ax-fields">
    <label>Public company name<input value={entity.name} readOnly/></label>
    <label>City (optional)<input value={city} maxLength={80} disabled={locked} onChange={e=>setCity(e.target.value)}/></label>
    <label>Public CIN / GSTIN / LEI (optional)<input value={publicId} maxLength={24} disabled={locked} onChange={e=>setPublicId(e.target.value)}/></label>
    <label>Research topic<select value={intent} disabled={locked} onChange={e=>setIntent(e.target.value)}>{Object.entries(RESEARCH_INTENTS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   </div>
   <div className="ax-query"><div><small>Public search query</small><b>{query||'Check the public company details.'}</b></div></div>
   <p className="ax-small">Only these public search fields are sent to OCI/xAI. Bank account details and transaction amounts are excluded. Web search does not perform an official GST/MCA verification.</p>
   <div className="ax-actions">
    <button className="btn primary" disabled={!server||!status?.configured||checking||locked||!!validation} onClick={search}><Sparkles size={16}/>{working?'Researching live sources...':'Search & summarise live'}</button>
    <button className="btn" disabled={!server||checking||working||busy} onClick={refresh}><RefreshCw size={15}/>Check live research availability</button>
   </div>
   {!server&&<Note>Start the local server and open the server workspace to run live research. The recorded example below remains available offline.</Note>}
   {server&&status&&<p className="ax-small" role="status">{status.message||status.status}</p>}
   {validation&&<Note error>{validation}</Note>}{error&&<Note error>{error}</Note>}
  </Panel>
  {result&&<LiveCompanyResult result={result} {...props} busy={busy||working}/>}
  <History items={runs} selected={result?.id} onSelect={setSelected}/>
 </div>;
}

import {searchAndSaveResearch} from './research-client.js';
import React,{useEffect,useState} from 'react';
import {Globe2,Search,ExternalLink,Play,Sparkles} from 'lucide-react';
import {RESEARCH_INTENTS,validateSubject,queryFor,googleURL} from './web-research.js';
import {payees,company} from './enrichment.js';
import {Panel,Badge,Note,SourceList,Review,History,date} from './Shared.jsx';

export default function WebResearch(p){
 const {r,s,user,run,busy}=p,candidates=payees(r).filter(company);
 const [subject,setSubject]=useState({name:candidates[0]?.name||'',city:'',publicId:'',intent:'activity'}),[configured,setConfigured]=useState(false),[status,setStatus]=useState('Checking server availability…'),[working,setWorking]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(null),[answer,setAnswer]=useState('');
 const [setupMessage,setSetupMessage]=useState('');
 const runs=(r.assistantResearch||[]).filter(x=>x.kind==='web'),result=runs.find(x=>x.id===selected)||runs[0];
 const writable=['Analyst','Reviewer'].includes(user.role),locked=busy||working||!writable;
 let validation='',query='',google='';try{validateSubject(subject);query=queryFor(subject);google=googleURL(subject);}catch(e){validation=e.message;}
 useEffect(()=>{let active=true;(async()=>{try{const response=await fetch('/api/assistant/research/status');if(!response.ok)throw Error();const info=await response.json();if(active){setConfigured(info.configured===true);setSetupMessage(info.message||'');setStatus(info.status||'Not configured');}}catch{if(active)setStatus('Offline workspace · live search unavailable');}})();return()=>{active=false;};},[]);
 const change=(key,value)=>{setSubject(v=>({...v,[key]:value}));setError('');};
 const search=async()=>{setError('');setAnswer('');setWorking(true);try{const id=await searchAndSaveResearch({recordId:r.id,subject,save:run});setSelected(id);}catch(e){setError(e.message);}finally{setWorking(false);}};
 return <div className="ax-tool"><div className="ax-intro"><div className="ax-intro-icon"><Globe2 size={24}/></div><div><h2>Research the web</h2><p>Research the recipient’s business, review the sources, and add the relevant findings to your investigation.</p></div><Badge>{status}</Badge></div>
  <div className="ax-layout"><div>
   <Panel title="Public company search" caption={r.borrower.name+' · '+r.facility.purpose}>
    {candidates.length>0&&<label>Start with a transaction recipient<select aria-label="Web research recipient" value={candidates.some(e=>e.name===subject.name)?subject.name:''} onChange={e=>change('name',e.target.value)}><option value="">Enter another public company</option>{candidates.map(e=><option key={e.id} value={e.name}>{e.name}</option>)}</select></label>}
    <div className="ax-fields"><label>Public company name<input value={subject.name} maxLength={120} onChange={e=>change('name',e.target.value)}/></label><label>City (optional)<input value={subject.city} maxLength={80} onChange={e=>change('city',e.target.value)}/></label><label>Public CIN / GSTIN / LEI (optional)<input value={subject.publicId} maxLength={24} onChange={e=>change('publicId',e.target.value)}/></label><label>Research topic<select value={subject.intent} onChange={e=>change('intent',e.target.value)}>{Object.entries(RESEARCH_INTENTS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
    <div className="ax-query"><Search size={17}/><div><small>Public search query</small><b>{query||'Complete the company details to preview the query.'}</b></div></div>
    <p className="ax-small">Live research sends only the public search details above to OCI/xAI. Open in Google sends those details to Google. Account numbers, transaction amounts and internal case IDs are excluded. Do not enter private customer information.</p>
    <div className="ax-actions"><button className="btn primary" disabled={locked||!!validation||!configured} onClick={search}><Sparkles size={16}/>{working?'Researching…':'Search & summarise'}</button>{google&&<a className="btn" href={google} target="_blank" rel="noopener noreferrer">Open in Google <ExternalLink size={14}/></a>}<button className="btn" disabled={locked||!!validation} onClick={async()=>{setError('');setAnswer('');if(await run({type:'assistantWebWalkthrough',recordId:r.id,subject}))setSelected(null);}}><Play size={15}/> Recorded walkthrough</button></div>
    {!configured&&setupMessage&&<Note>{setupMessage}</Note>}{validation&&<p className="ax-small">{validation}</p>}{error&&<Note error>{error}</Note>}
    <p className="ax-small">Open in Google launches a separate browser tab; this app cannot read that tab. The recorded walkthrough makes no internet request.</p>
   </Panel>
   {result?<><Panel title={'Research · '+result.subject.name} action={<Badge>{result.status}</Badge>} caption={result.mode+' · '+date(result.retrievedAt||result.createdAt)}>
    <p className="ax-summary">{result.summary}</p>
    {result.claims?.length>0&&<><h3>Claims linked to sources</h3><div className="ax-claims">{result.claims.map((claim,i)=><div key={i}><p>{claim.text}</p><small>{claim.sourceIds.join(' · ')}</small></div>)}</div></>}
    <Note>{result.limitations}</Note>
    <div className="ax-actions"><button className="btn" onClick={()=>setAnswer('The source result is an investigation lead. Compare the researched company’s public identifier with bank-held beneficiary details, then request invoices, delivery or site evidence against '+r.facility.purpose+'. A company name or business activity does not prove what the payment purchased.')}>What should I verify next?</button><button className="btn" onClick={()=>setAnswer('No. '+result.mode+' does not prove fraud. The existing transaction triggers remain the basis for investigation; an authorised officer must reconcile identity, permitted purpose and transaction-specific evidence.')}>Does this establish fraud?</button></div>{answer&&<div className="ax-answer"><Sparkles size={16}/><p>{answer}</p></div>}
    {result.suggestionsHTML&&<iframe title="Web search suggestions" className="ax-suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={result.suggestionsHTML}/>}
    <details><summary>Search provenance</summary><p>Provider: {result.provider}</p><p>Query: {result.query}</p><p>Executed searches: {result.queries?.join(' · ')||(result.mode==='Live web research'?'None returned by the provider':'None; prepared example')}</p>{result.sha256&&<><small>Provider response SHA-256</small><code>{result.sha256}</code><p>{result.hashScope}</p></>}</details>
   </Panel><Panel title="Source evidence"><SourceList result={result}/></Panel></>:<Panel title="Begin with a flagged counterparty"><p>For Bluefin Logistics, select Kaveri Trading and research its business activity. Review whether its goods could support warehouse expansion, then record the identity match and missing commercial evidence.</p><Note>Search results are leads for investigation. A name-only match is not an identified bank-account owner.</Note></Panel>}
  </div><aside>{result&&<Review key={result.id} result={result} {...p}/>}<History items={runs} selected={result?.id} onSelect={id=>{setSelected(id);setAnswer('');}}/><Panel title="From research to a decision"><ol className="ax-steps"><li>Find the public company profile.</li><li>Resolve the recipient’s identity.</li><li>Compare its activity with the sanction.</li><li>Request transaction-specific documents.</li><li>Record an officer-reviewed finding.</li></ol></Panel></aside></div>
 </div>;
}

import React,{useEffect,useState} from 'react';
import {Sparkles,Play,Download,FileText,CheckCircle2} from 'lucide-react';
import {Panel,Badge,Note,date} from './Shared.jsx';
import {validationPacket,validationSummary} from './validation.js';

export default function OCIValidation({r,a,s,user,run,busy,mode,validateOCI,showEvidence,open}){
 const [status,setStatus]=useState({configured:false,status:'Checking OCI configuration…',missing:[]}),[error,setError]=useState(''),[working,setWorking]=useState(false),[selected,setSelected]=useState(null);
 const runs=r.llmValidations||[],result=runs.find(x=>x.id===selected)||runs[0],locked=busy||working||!['Analyst','Reviewer'].includes(user.role);
 let packet,packetError;try{packet=validationPacket(r,a,s.policy);}catch(e){packetError=e.message;}
 const refresh=async()=>{try{const response=await fetch('/api/assistant/validation/status');if(!response.ok)throw Error();setStatus(await response.json());}catch{setStatus({configured:false,status:'Offline workspace · use prepared example',missing:[]});}};
 useEffect(()=>{refresh();},[mode]);
 useEffect(()=>{setSelected(null);setError('');},[r.id]);
 const live=async()=>{setError('');setWorking(true);try{const next=await validateOCI();setSelected(next.id);setStatus(v=>({...v,status:'Connected · last review succeeded'}));}catch(e){setError(e.message);setStatus(v=>({...v,status:'Last OCI validation attempt failed'}));}finally{setWorking(false);}};
 const download=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='UCO_'+r.id+'_Validation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const stale=result&&JSON.stringify(result.packet)!==JSON.stringify(packet);
 return <div className="ax-tool"><div className="ax-intro"><div className="ax-intro-icon"><Sparkles size={24}/></div><div><h2>Review the alert with OCI</h2><p>Compare the rule assessment with a cited advisory review, then decide what an officer should verify.</p></div><Badge>{status.status}</Badge></div>
  <div className="ax-layout"><div>
   <Panel title="Run a case review" caption={r.borrower.name+' · '+r.facility.purpose}>
    <div className="oci-rule"><small>Current rule assessment</small><b>{packet?validationSummary(packet):a.outcome}</b><span>{a.findings.length} findings · {a.gaps.length} evidence gaps · {a.contexts.length} context tasks</span></div>
    <div className="ax-actions"><button className="btn primary" disabled={locked||!!packetError} onClick={async()=>{setError('');if(await run({type:'validationPrepared',recordId:r.id}))setSelected(null);}}><Play size={16}/>Show prepared review</button><button className="btn" disabled={locked||!!packetError||!status.configured||mode!=='Server workspace'} onClick={live}><Sparkles size={16}/>{working?'OCI is reviewing…':'Validate with OCI model'}</button></div>
    <p className="ax-small">The prepared review runs locally without AI. Live validation sends this case's loan conditions, rule settings, transactions and evidence to your configured OCI model and can incur usage charges.</p>
    {(error||packetError)&&<Note error>{error||packetError}</Note>}
    <details><summary>Inspect the case packet sent to the model</summary><pre className="oci-packet">{packet&&JSON.stringify(packet,null,2)}</pre></details>
   </Panel>
   {result?<><Panel title="Advisory review" caption={result.mode+' · '+date(result.createdAt)} action={<Badge>{result.review.disposition}</Badge>}>
    {stale&&<Note>This review describes an earlier assessment. Run another review for the current case.</Note>}
    <p className="ax-summary">{result.review.summary}</p><h3>Evidence behind the explanation</h3><div className="ax-claims">{result.review.claims.map((claim,i)=><div key={i}><p>{claim.text}</p><div className="ax-actions">{claim.evidenceIds.map(id=><button key={id} className="text-button" onClick={()=>showEvidence(id)}><FileText size={13}/>{id}</button>)}</div></div>)}</div>
    <h3>Possible legitimate explanation</h3><p>{result.review.legitimateExplanation}</p><h3>What remains to be checked</h3>{result.review.missingEvidence.length?<ul>{result.review.missingEvidence.map((x,i)=><li key={i}>{x}</li>)}</ul>:<p>No additional gap listed in this review.</p>}
    <h3>Suggested next steps</h3><ol className="ax-steps">{result.review.nextSteps.map((x,i)=><li key={i}>{x}</li>)}</ol><Note>{result.limitations}</Note>
    <div className="ax-actions"><button className="btn" onClick={download}><Download size={15}/>Download review</button></div><details><summary>Review provenance</summary><p>Provider: {result.provider} · Model: {result.model||'No model called'} · Region: {result.region||'Local'}</p><p>Prompt version: {result.promptVersion}</p>{result.durationMs!==undefined&&<p>Response time: {result.durationMs} ms</p>}{result.inputDigest&&<p>Case packet SHA-256: <code>{result.inputDigest}</code></p>}{result.requestId&&<p>OCI request ID: {result.requestId}</p>}<p>Rule outcome at review: {result.ruleOutcome}</p></details>
   </Panel></>:<Panel title="A simple presentation journey"><ol className="ax-steps"><li>Choose Bluefin Logistics to show the repeated-payment concern.</li><li>Run the prepared review and open a cited payment record.</li><li>Open the documented comparison below and run the review again.</li><li>Configure OCI to repeat the same journey with a live model.</li></ol></Panel>}
  </div><aside><Panel title="Compare two outcomes" caption="Same type of payment pattern; different supporting evidence."><div className="ax-actions"><button className="btn" onClick={()=>open('MT-BLUEFIN','assistant')}>Bluefin · needs review</button><button className="btn" onClick={()=>open('MT-BLUEFIN-OK','assistant')}>Documented procurement</button></div><p className="ax-small">Company activity alone does not prove what a payment purchased.</p></Panel>
   <Panel title="OCI connection" action={<button className="text-button" onClick={refresh}>Refresh</button>}><p>{status.status}</p><p>Model: {status.model||'Not selected'}<br/>Region: {status.region||'Not selected'}</p>{status.missing?.length>0&&<><h3>Configuration needed</h3><ul>{status.missing.map(x=><li key={x}>{x}</li>)}</ul></>}<ol className="ax-steps"><li>Choose a chat model in OCI Generative AI.</li><li>Set up an API signing key and inference permission.</li><li>Fill in the project's .env configuration.</li><li>Restart the server and select Validate with OCI model.</li></ol><p className="ax-small">Detailed instructions: docs/OCI_VALIDATION_SETUP.md</p><Note><CheckCircle2 size={15}/> A saved live review confirms that call succeeded. Configuration alone does not prove connectivity.</Note></Panel>
   {runs.length>0&&<Panel title="Review history"><div className="ax-history">{runs.map(x=><button key={x.id} aria-pressed={result?.id===x.id} onClick={()=>setSelected(x.id)}><b>{x.review.disposition}</b><span>{x.mode} · {date(x.createdAt)}</span></button>)}</div></Panel>}
  </aside></div>
 </div>;
}

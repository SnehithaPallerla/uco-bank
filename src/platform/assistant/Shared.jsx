import React,{useState} from 'react';
import {Check,ExternalLink,FileCheck2} from 'lucide-react';
import {IDENTITIES,attachmentBlock} from './enrichment.js';
import {publicURL} from './web-research.js';

export const date=value=>value?new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Not supplied';
export function Panel({title,caption,children,action}){return <section className="ax-card"><header><div><h2>{title}</h2>{caption&&<p>{caption}</p>}</div>{action}</header><div className="ax-body">{children}</div></section>;}
export function Badge({children}){return <span className="ax-badge">{children}</span>;}
export function Note({children,error=false}){return <div className={'ax-note'+(error?' ax-error':'')} role={error?'alert':undefined}>{children}</div>;}
export function SourceList({result}){return <div className="ax-sources">{result.sources.map(source=><article key={source.id}><div><Badge>{source.id}</Badge><b>{source.title}</b></div>{publicURL(source.url)?<a href={publicURL(source.url)} target="_blank" rel="noopener noreferrer">Open source <ExternalLink size={12}/></a>:<small>{source.kind} · no live source link</small>}<p>{source.excerpt}</p><small>Source date: {source.sourceDate||'Not supplied'} · Captured: {date(result.retrievedAt||result.createdAt)}</small></article>)}</div>;}
export function Review({result,r,s,user,run,busy,showEvidence,nav}){
 const [identity,setIdentity]=useState('Unverified'),[note,setNote]=useState(''),[saved,setSaved]=useState(false);
 const block=attachmentBlock(r,s,result),writable=['Analyst','Reviewer'].includes(user.role);
 const attached=result.attachedEvidenceId;
 return <Panel title="Officer review" caption="Record the match basis and remaining gaps before attaching this result.">
  {attached?<><Note><Check size={16}/> Attached as supplementary evidence. Detection and case outcome are unchanged.</Note><div className="ax-actions"><button className="btn" onClick={()=>showEvidence(attached)}>View evidence</button><button className="btn" onClick={()=>nav('cases')}>Open case</button></div></>:<>
   <label>Identity assessment<select value={identity} onChange={e=>setIdentity(e.target.value)}>{IDENTITIES.map(x=><option key={x} disabled={x==='Identifier corroborated'&&(result.mode!=='Live web research'||!result.subject.publicId)}>{x}</option>)}</select></label>
   <label>Review note<textarea value={note} maxLength={4000} onChange={e=>setNote(e.target.value)} placeholder="Explain the match, what the source supports and which transaction documents remain outstanding…"/></label>
   {block&&<Note>{block}</Note>}
   <button className="btn primary" disabled={busy||!writable||!!block||note.trim().length<15||identity==='Different entity'} onClick={async()=>{if(await run({type:'assistantAttachResearch',recordId:r.id,runId:result.id,identity,note}))setSaved(true);}}><FileCheck2 size={16}/> Attach to investigation</button>
   {!s.cases.some(c=>c.recordId===r.id)&&<p className="ax-small">Attaching opens an investigation with the existing case workflow.</p>}
   {saved&&<p role="status">Evidence attached.</p>}
  </>}
 </Panel>;
}
export function History({items,selected,onSelect}){return items.length>0&&<Panel title="Research history" caption="Saved for the selected borrower and included in its evidence packet."><div className="ax-history">{items.map(item=><button key={item.id} aria-pressed={selected===item.id} onClick={()=>onSelect(item.id)}><b>{item.subject.name}</b><span>{item.status} · {date(item.retrievedAt||item.createdAt)}</span>{item.attachedEvidenceId&&<small>Attached to investigation</small>}</button>)}</div></Panel>;}

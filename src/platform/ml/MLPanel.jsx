import React,{useState} from 'react';
export const mlPrediction=(ml,id)=>ml?.data?.predictions.find(p=>p.recordId===id);
export default function MLPanel({ml,r,user,s}){
 const [message,setMessage]=useState(''),[saving,setSaving]=useState(false),p=mlPrediction(ml,r.id),model=ml?.data?.model;
 const labels=Object.fromEntries((ml?.data?.features||[]).map(f=>[f.key,f.label]));
 const closed=s.cases.filter(c=>c.recordId===r.id).at(-1);
 const evaluation=model?.evaluation;
 const saveOutcome=async()=>{setSaving(true);try{const res=await fetch('/api/ml/labels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recordId:r.id,expectedRevision:s.revision})}),data=await res.json();if(!res.ok)throw Error(data.error);setMessage('Reviewed outcome saved separately. It does not automatically retrain the classifier.');}catch(e){setMessage(e.message);}finally{setSaving(false);}};
 return <section className="card ml-panel"><div className="card-head"><div><h2>ML case flag</h2><p>{model?.algorithm||'Review classifier'} / provisional rule-derived targets</p></div><span className={'badge '+(p?.reviewRequired?'amber':p?.flagged===false?'green':'blue')}>{ml?.loading?'Scoring…':p?.status||'Unavailable'}</span></div><div className="card-body">
  {ml?.error&&<p role="alert">{ml.error} <button className="text-button" onClick={ml.reload}>Retry ML scoring</button></p>}
  {p&&<><dl className="kv"><div><dt>Current review score</dt><dd>{p.score===null?'Unavailable':p.score.toFixed(4)}</dd></div><div><dt>Current model result</dt><dd>{p.modelStatus||p.status}</dd></div><div><dt>Flag cutoff</dt><dd>{p.threshold.toFixed(4)}</dd></div><div><dt>Model</dt><dd>{p.modelVersion}</dd></div><div><dt>Assessment cutoff</dt><dd>{p.assessmentCutoff}</dd></div><div><dt>Graph source</dt><dd>{p.graphSource}</dd></div><div><dt>Saved predictions</dt><dd>{ml.data.storage}</dd></div></dl>
  {p.reviewHeld&&<p className="notice">Review remains open. Updated evidence may lower the model score; an officer must conclude the investigation.</p>}
  <h3>Trigger inputs and accepted evidence</h3><p>{p.activeTriggers?.length?p.activeTriggers.join(' / '):'No configured trigger pattern is present in these inputs.'}</p>
  {p.evidenceCoverage&&<dl className="kv">{Object.entries(p.evidenceCoverage).map(([key,value])=><div key={key}><dt>{labels[key]||key}</dt><dd>{value===null?'Unknown':Math.round(value*100)+'%'}</dd></div>)}</dl>}
  <p className="subtle">Trigger indicators and accepted evidence are model inputs. Document upload alone does not establish authenticity or accepted commercial support.</p>
  {p.reasons.map(x=><p key={x}>{x}</p>)}
  <h3>Feature comparisons</h3><p className="subtle">These comparisons describe input values; they are not exact model contributions or proof of misuse.</p>
  {p.comparisons.length?<ul>{p.comparisons.map(c=><li key={c.feature}>{labels[c.feature]||c.feature}: <b>{Number(c.value.toFixed(3))}</b> ({c.direction} than reference median {Number(c.referenceMedian.toFixed(3))})</li>)}</ul>:<p>No feature lies outside the reference comparison range.</p>}
  {!!p.warnings.length&&<details><summary>Data coverage</summary><ul>{p.warnings.map(x=><li key={x}>{x}</li>)}</ul></details>}
  <details><summary>Model evaluation and limitations</summary><p>{evaluation.reason}</p><p>Reserved test agreement: {(evaluation.holdoutEvaluation.allScoreableCases.agreement*100).toFixed(1)}% across {evaluation.testCases} cases ({evaluation.testRows} distinct examples). Training fit: {(evaluation.trainingFit.allScoreableCases.agreement*100).toFixed(1)}% across {evaluation.trainingCases} cases ({evaluation.trainingRows} distinct examples).</p><p>The deployed model uses only the training partition and {evaluation.selectedInputCount} selected inputs. It is never refitted on reserved test cases.</p><p>Training/test gap: {(evaluation.generalizationGap.trainMinusTest*100).toFixed(1)} percentage points. This indicates remaining generalization limits; absence of overfitting is not proven.</p><p>Independent suspicious-activity accuracy is not measured. The review score is not a fraud probability.</p><p>{evaluation.holdoutLimitation}</p><p>{evaluation.warning}</p><p>{evaluation.cutoffMethod}</p></details>
  </>}
  <p className="notice">The classifier produces the current flag. Previously flagged or open investigations remain in the queue until an officer decides the outcome.</p>
  {user.role==='Reviewer'&&closed?.status==='Closed'&&closed.reviewer===user.id&&<button className="btn" disabled={saving} onClick={saveOutcome}>Save independently reviewed outcome for ML evaluation</button>}
  {message&&<p role="status">{message}</p>}
 </div></section>;
}

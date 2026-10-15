import {validateSubject} from './web-research.js';

async function json(response){
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Research service unavailable.');
 return data;
}

export async function readResearchStatus({request=fetch,signal}={}){
 return json(await request('/api/assistant/research/status',{signal}));
}

export async function searchAndSaveResearch({recordId,subject,save,request=fetch,signal}){
 const clean=validateSubject(subject);
 if(typeof save!=='function')throw Error('The research save action is unavailable.');
 const {result}=await json(await request('/api/assistant/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recordId,subject:clean}),signal}));
 // Navigating to another borrower must not save or display a completed request
 // through the previous screen's action handler.
 if(signal?.aborted)throw Object.assign(Error('Research cancelled.'),{name:'AbortError'});
 if(!result?.id||result.mode!=='Live web research')throw Error('No live research result was returned.');
 if(!await save({type:'assistantSaveRun',recordId,run:result}))throw Error('Research returned but could not be saved. Refresh the workspace and try again.');
 return result.id;
}

export function companyResearchRuns(record,name){
 const normalize=value=>String(value||'').trim().toLocaleLowerCase();
 return (record.assistantResearch||[]).filter(run=>run.kind==='web'&&run.mode==='Live web research'&&normalize(run.subject?.name)===normalize(name));
}

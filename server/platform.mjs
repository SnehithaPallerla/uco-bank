import {searchConfig,searchWeb} from './web-search.mjs';
import {localFundsGraph} from '../src/platform/funds-graph.js';
import {ociConfig,validateWithOCI} from './oci-validation.mjs';
import {validationPacket} from '../src/platform/assistant/validation.js';
import {ModelEvaluation} from './model-evaluation.mjs';
import {assistantAnswer} from './oci-assistant.mjs';
import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,rename,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {personas,clone} from '../src/platform/catalogue.js';
import {VERSION,initialState,upgradeState,scopedState,command,authorize,answer,exportRecord,assess,retrieve} from '../src/platform/domain.js';
import {researchHandler,SOURCES} from './research.mjs';
export const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export class Store{
 constructor(directory){this.directory=directory;this.file=path.join(directory,'state.json');this.tail=Promise.resolve();}
 async init(){await mkdir(this.directory,{recursive:true});try{this.state=JSON.parse(await readFile(this.file,'utf8'));if(this.state.schema!==4)throw Error('Unsupported state schema');if(this.state.appVersion!==VERSION){if(!verifyChain(this.state))throw Error('Audit integrity failure before upgrade');await this.save(upgradeState(this.state));}}catch(e){if(e.code!=='ENOENT')throw e;this.state=initialState();await this.save(this.state);}return this;}
 async save(state){
  for(const r of state.records)for(const e of r.evidence){e.version=e.version||1;e.captureDigest=digest(e.payload);e.digestAlgorithm='SHA-256 over JSON.stringify payload';}
  const previous=state.auditHashChain||[],start=previous.length;for(let i=start;i<state.audit.length;i++){const previousHash=previous.at(-1)?.hash||'GENESIS';previous.push({index:i,previousHash,hash:digest({previousHash,event:state.audit[i]})});}state.auditHashChain=previous;
  const bytes=JSON.stringify(state);try{await copyFile(this.file,path.join(this.directory,'state.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(this.file+'.tmp',bytes,{mode:0o600});await rename(this.file+'.tmp',this.file);this.state=state;
 }
 mutate(user,cmd,context={}){const work=this.tail.then(async()=>{if(!verifyChain(this.state))throw Error('Audit integrity failure; restore a verified state before writing');if(cmd.expectedRevision!==undefined&&cmd.expectedRevision!==this.state.revision)throw Error('Workspace changed. Refresh before retrying.');const next=command(this.state,user,cmd,context);await this.save(next);return scopedState(next,user);});this.tail=work.catch(()=>{});return work;}
 async backup(target){await this.tail;await copyFile(this.file,target);return digest(await readFile(target,'utf8'));}
}
export function verifyChain(state){let previousHash='GENESIS';for(let i=0;i<state.audit.length;i++){const row=state.auditHashChain?.[i];if(!row||row.previousHash!==previousHash||row.hash!==digest({previousHash,event:state.audit[i]}))return false;previousHash=row.hash;}return (state.auditHashChain?.length||0)===state.audit.length;}
export function createPlatformServer({store,clock=()=>Date.now(),researchSearch=searchWeb,researchConfig=searchConfig,ociStatus=ociConfig,ociValidate=validateWithOCI,assistantRespond=assistantAnswer,assistantEnv=process.env}={}){
 const sessions=new Map(),rate=new Map(),captures=new Map(),searchRate=new Map();
 const evaluation=new ModelEvaluation({store,validate:ociValidate,config:ociStatus});
 const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
 const body=async req=>{let text='';for await(const chunk of req){text+=chunk;if(text.length>512000)throw Error('Request too large');}return JSON.parse(text||'{}');};
 return http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host))return json(res,403,{error:'Unrecognised host'});
  if(req.headers.origin&&![`http://${host}`].includes(req.headers.origin))return json(res,403,{error:'Cross-origin request denied'});
  if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Cross-site request denied'});
  const url=new URL(req.url,'http://'+host),route=url.pathname;
  if(route==='/api/health')return json(res,200,{status:'available',platformVersion:4,bankConnected:false,oracleConnected:store.backend==='oracle'&&store.connected===true,storageBackend:store.backend||'file',approvedSources:Object.keys(SOURCES),mode:store.backend==='oracle'?'Oracle-backed local evaluation':'Local evaluation',revision:store.state.revision,auditChainValid:verifyChain(store.state)});
  if(route==='/api/session'&&req.method==='POST'){
   const at=clock(),key=req.socket.remoteAddress||'local',attempts=(rate.get(key)||[]).filter(t=>at-t<60000);if(attempts.length>=30)return json(res,429,{error:'Session limit reached'});rate.set(key,[...attempts,at]);const b=await body(req),user=personas.find(p=>p.id===b.persona);if(!user)return json(res,401,{error:'Unknown local persona'});const sid=randomBytes(32).toString('hex');sessions.set(sid,{user,expires:at+30*60000});res.setHeader('Set-Cookie',`uco_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`);return json(res,200,{user,state:scopedState(store.state,user),authentication:'Local evaluation persona; not bank SSO'});
  }
  if(route.startsWith('/api/')){
   const sid=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('uco_session='))?.slice(12),session=sessions.get(sid);if(!session||session.expires<=clock())return json(res,401,{error:'Session expired or authentication required'});const user=session.user;
   if(route==='/api/state'&&req.method==='GET')return json(res,200,{state:scopedState(store.state,user)});
   if(route==='/api/command'&&req.method==='POST'){
    const cmd=await body(req);let context={};
    if(cmd.type==='validationSave')throw Error('Live validation must be generated by the OCI validation endpoint.');
    if(cmd.type==='assistantSaveRun'){
     const entry=captures.get(sid+':'+cmd.run?.id);
     if(!entry||entry.recordId!==cmd.recordId||entry.expires<clock())throw Error('Live research must come from the authenticated server search.');
     cmd.run=entry.result;context={trustedResearch:true};
    }
    return json(res,200,{state:await store.mutate(user,cmd,context)});
   }
   if(route==='/api/assistant/research/status'&&req.method==='GET')return json(res,200,researchConfig());
   if(route==='/api/assistant/validation/status'&&req.method==='GET')return json(res,200,ociStatus());
   if(route==='/api/assistant/evaluation'&&req.method==='GET')return json(res,200,{jobs:evaluation.list(user)});
   if(route==='/api/assistant/evaluation'&&req.method==='POST')return json(res,202,{job:evaluation.start(user,await body(req))});
   const evaluationRoute=route.match(/^\/api\/assistant\/evaluation\/([^/]+)(\/stop)?$/);
   if(evaluationRoute&&req.method==='GET'&&!evaluationRoute[2])return json(res,200,{job:evaluation.read(user,evaluationRoute[1])});
   if(evaluationRoute&&req.method==='POST'&&evaluationRoute[2])return json(res,200,{job:evaluation.stop(user,evaluationRoute[1])});
   if(route==='/api/assistant/validation'&&req.method==='POST'){
    const b=await body(req);if(Object.keys(b).some(k=>!['recordId','expectedRevision'].includes(k)))throw Error('Only the selected case and workspace revision are permitted.');
    const record=store.state.records.find(r=>r.id===b.recordId);if(!record)return json(res,404,{error:'Record unavailable'});authorize(user,record,'write');
    if(b.expectedRevision!==store.state.revision)throw Error('Workspace changed. Refresh before retrying.');
    if(!ociStatus().configured)return json(res,503,{error:'OCI validation is not configured. Use the prepared example or complete the setup checklist.'});
    const rateKey='oci:'+sid,attempts=(searchRate.get(rateKey)||[]).filter(at=>clock()-at<60000);if(attempts.length>=4)return json(res,429,{error:'Validation limit reached. Wait a minute before retrying.'});searchRate.set(rateKey,[...attempts,clock()]);
    const result=await ociValidate(validationPacket(record,assess(record,store.state.policy),store.state.policy));
    return json(res,200,{state:await store.mutate(user,{type:'validationSave',recordId:record.id,expectedRevision:b.expectedRevision},{trustedValidation:result}),result});
   }
   if(route==='/api/assistant/research'&&req.method==='POST'){
    const b=await body(req);if(Object.keys(b).some(k=>!['recordId','subject'].includes(k)))throw Error('Use only the selected record and public company details.');
    const record=store.state.records.find(r=>r.id===b.recordId);if(!record)return json(res,404,{error:'Record unavailable'});authorize(user,record,'write');
    const researchSettings=researchConfig();if(!researchSettings.configured)return json(res,503,{error:researchSettings.message||'Live search needs a search-provider integration. Use Open in Google or Recorded walkthrough.'});
    const attempts=(searchRate.get(sid)||[]).filter(at=>clock()-at<60000);if(attempts.length>=8)return json(res,429,{error:'Research limit reached. Wait a minute before retrying.'});searchRate.set(sid,[...attempts,clock()]);
    const result=await researchSearch(b.subject);for(const [key,value] of captures)if(value.expires<clock())captures.delete(key);
    while(captures.size>=64)captures.delete(captures.keys().next().value);
    captures.set(sid+':'+result.id,{recordId:record.id,result,expires:clock()+15*60000});
    return json(res,200,{result});
   }
   if(route==='/api/assistant/status'&&req.method==='GET')return json(res,200,{mode:assistantEnv.UCO_ASSISTANT_MODE==='oci-rules'?'Experimental OCI independent rules':assistantEnv.UCO_ASSISTANT_MODE==='oci-grounded'?'Experimental OCI grounded explanation':assistantEnv.UCO_ASSISTANT_MODE==='oci-verified'?'OCI verified response blocks':'Local deterministic assistant',...ociStatus()});
   if(route==='/api/assistant'&&req.method==='POST'){
    const b=await body(req);if(Object.keys(b).some(k=>!['recordId','question'].includes(k)))throw Error('Only recordId and question are permitted.');
    if(typeof b.question!=='string'||!b.question.trim()||b.question.length>2000)throw Error('Question must contain up to 2000 characters');
    const r=store.state.records.find(r=>r.id===b.recordId);if(!r)return json(res,404,{error:'Record unavailable'});authorize(user,r);
    if(['oci-rules','oci-grounded','oci-verified'].includes(assistantEnv.UCO_ASSISTANT_MODE)){const key='assistant:'+sid,attempts=(searchRate.get(key)||[]).filter(at=>clock()-at<60000);if(attempts.length>=4)return json(res,429,{error:'Assistant limit reached. Wait a minute before retrying.'});searchRate.set(key,[...attempts,clock()]);}
    const revision=store.state.revision,result=await assistantRespond(clone(r),user,b.question,clone(store.state.policy),{env:assistantEnv});
    if(store.state.revision!==revision)return json(res,409,{error:'Workspace changed during the answer. Refresh and ask again.'});return json(res,200,result);
   }
   if(route==='/api/providers/status')return json(res,200,{message:'GST, MCA and search provider contracts are ready. No authorised live provider is configured.',providers:['GST','MCA','Search'].map(name=>({name,connected:false,status:'unavailable',reason:'Provider agreement, endpoint and credentials required'}))});
   if(route==='/api/verify'&&req.method==='POST'){const b=await body(req),r=store.state.records.find(r=>r.id===b.recordId);if(!r)throw Error('Record unavailable');authorize(user,r);if(!['GST','MCA','Search'].includes(b.provider))throw Error('Provider is not permitted');return json(res,200,{provider:b.provider,status:'unavailable',retrievedAt:new Date().toISOString(),liveRequestMade:false,recordId:r.id,reason:'Authorised provider not configured',adverseFinding:false});}
   if(route==='/api/research'){await researchHandler(req,res);return;}
   const m=route.match(/^\/api\/records\/([^/]+)(?:\/(export|graph|evidence|search)(?:\/([^/]+))?)?$/);
   if(m&&req.method==='GET'){const r=store.state.records.find(r=>r.id===decodeURIComponent(m[1]));if(!r)return json(res,404,{error:'Record unavailable'});authorize(user,r);if(m[2]==='export')return json(res,200,exportRecord(r,user,store.state));if(m[2]==='graph'){
    const revision=store.state.revision,requested=url.searchParams.get('revision');
    if(requested!==null&&(!/^\d+$/.test(requested)||Number(requested)!==revision))return json(res,409,{error:'Workspace changed. Refresh before loading the graph.'});
    if(store.backend==='oracle'&&typeof store.readGraph!=='function')return json(res,503,{error:'Oracle graph querying is unavailable.'});
    const graph=store.backend==='oracle'?await store.readGraph(clone(r),user):localFundsGraph(r,revision);
    if(store.state.revision!==revision)return json(res,409,{error:'Workspace changed while loading the graph. Refresh and try again.'});
    return json(res,200,graph);
   }if(m[2]==='search')return json(res,200,{passages:retrieve(r,user,url.searchParams.get('q')||'')});if(m[2]==='evidence'){const e=r.evidence.find(e=>e.id===decodeURIComponent(m[3]||''));if(!e)return json(res,404,{error:'Evidence unavailable in this case'});return json(res,200,e);}return json(res,200,{record:r,assessment:assess(r,store.state.policy)});}
   return json(res,404,{error:'Tool or endpoint not allowed'});
  }
  if(req.method!=='GET'||!['/','/index.html'].includes(route))return json(res,404,{error:'Not found'});
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(await readFile(new URL('../dist/index.html',import.meta.url)));
 }catch(e){const status=/Access denied|reviewer|Maker cannot|role required|Administrator required|proposer required|Independent pending/.test(e.message)?403:/Authentication/.test(e.message)?401:/Workspace changed/.test(e.message)?409:400;json(res,e.status||status,{error:e.message});}
 });
}

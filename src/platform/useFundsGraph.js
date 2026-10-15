import {useEffect,useState,useMemo} from 'react';
import {localFundsGraph} from './funds-graph.js';

export function useFundsGraph({r,mode,revision=0,userId=''}){
 const [attempt,retry]=useState(0),[state,setState]=useState({});
 const server=mode==='Server workspace',key=[r.id,revision,userId,attempt].join(':');
 const local=useMemo(()=>server?null:localFundsGraph(r,revision),[server,r,revision]);
 useEffect(()=>{
  if(!server)return;
  const controller=new AbortController();
  (async()=>{
   try{
    const response=await fetch('/api/records/'+encodeURIComponent(r.id)+'/graph?revision='+encodeURIComponent(revision),{signal:controller.signal});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load the funds graph.');
    if(data.recordId!==r.id||data.revision!==revision)throw Error('Workspace changed. Refresh before loading the graph.');
    if(!controller.signal.aborted)setState({key,data});
   }catch(error){if(!controller.signal.aborted)setState({key,error:error.message});}
  })();
  return()=>controller.abort();
 },[server,key,r.id,revision]);
 if(!server)return {data:local,loading:false,reload:()=>{}};
 return {...(state.key===key?state:{}),loading:state.key!==key,reload:()=>retry(value=>value+1)};
}

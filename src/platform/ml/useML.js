import {useEffect,useState} from 'react';
export function useML({mode,userId,revision,enabled=true}){
 const [attempt,setAttempt]=useState(0),[state,setState]=useState({});
 const key=[mode,userId,revision,attempt].join(':');
 useEffect(()=>{
  if(!enabled||mode!=='Server workspace')return;
  const controller=new AbortController();
  (async()=>{try{const response=await fetch('/api/ml/predictions?revision='+encodeURIComponent(revision),{signal:controller.signal}),data=await response.json();
   if(!response.ok)throw Error(data.error||'ML scoring is unavailable');if(data.revision!==revision)throw Error('Workspace changed. Refresh ML results.');
   if(!controller.signal.aborted)setState({key,data});
  }catch(e){if(!controller.signal.aborted)setState({key,error:e.message});}})();
  return()=>controller.abort();
 },[key,mode,revision,enabled]);
 const reload=()=>setAttempt(x=>x+1);
 if(mode!=='Server workspace')return {loading:false,error:'ML scoring requires the server workspace. No rule-based flag is substituted.',reload};
 return {...(state.key===key?state:{}),loading:state.key!==key,reload};
}

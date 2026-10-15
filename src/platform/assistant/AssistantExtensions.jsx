import React,{useState} from 'react';
import {Sparkles,Globe2,Building2} from 'lucide-react';
import WebResearch from './WebResearch.jsx';
import Bloomberg from './Bloomberg.jsx';
import OCIValidation from './OCIValidation.jsx';
import ModelTesting from './ModelTesting.jsx';

const tabs=[['original','AI Assistant',Sparkles],['validation','OCI validation',Sparkles],['testing','Model testing',Sparkles],['web','Research the web',Globe2],['bloomberg','Bloomberg enrichment',Building2]];
export default function AssistantExtensions({BaseAssistant,...props}){
 const [active,setActive]=useState(props.assistantTab||'original'),[visited,setVisited]=useState({original:true,[props.assistantTab||'original']:true});
 const choose=id=>{setActive(id);props.setAssistantTab?.(id);setVisited(v=>({...v,[id]:true}));};
 function keyboard(e,index){let next;if(e.key==='ArrowRight')next=(index+1)%tabs.length;else if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();choose(tabs[next][0]);e.currentTarget.parentElement.children[next].focus();}
 return <div className="assistant-extensions">
  <div className="ax-tabs" role="tablist" aria-label="AI Assistant tools">{tabs.map(([id,label,Icon],i)=><button key={id} id={'ax-tab-'+id} role="tab" aria-selected={active===id} aria-controls={'ax-panel-'+id} tabIndex={active===id?0:-1} onClick={()=>choose(id)} onKeyDown={e=>keyboard(e,i)}><Icon size={16}/>{label}</button>)}</div>
  <div id="ax-panel-original" role="tabpanel" aria-labelledby="ax-tab-original" hidden={active!=='original'}><BaseAssistant {...props}/></div>
  <div id="ax-panel-validation" role="tabpanel" aria-labelledby="ax-tab-validation" hidden={active!=='validation'}>{visited.validation&&<OCIValidation {...props}/>}</div>
  <div id="ax-panel-testing" role="tabpanel" aria-labelledby="ax-tab-testing" hidden={active!=='testing'}>{visited.testing&&<ModelTesting {...props}/>}</div>
  <div id="ax-panel-web" role="tabpanel" aria-labelledby="ax-tab-web" hidden={active!=='web'}>{visited.web&&<WebResearch {...props}/>}</div>
  <div id="ax-panel-bloomberg" role="tabpanel" aria-labelledby="ax-tab-bloomberg" hidden={active!=='bloomberg'}>{visited.bloomberg&&<Bloomberg {...props}/>}</div>
 </div>;
}

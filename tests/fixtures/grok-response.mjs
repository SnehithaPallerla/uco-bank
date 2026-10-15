export function grokResponse(text='Trading company supplies materials.'){
 return {status:'completed',model:'xai.grok-4.20-multi-agent',output:[
  {type:'web_search_call',status:'completed',action:{type:'search',query:'Kaveri Trading company profile',sources:[{type:'url',url:'https://example.com/about'}]}},
  {type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[{type:'url_citation',url:'https://example.com/about',title:'Company profile',start_index:0,end_index:text.length}]}]}
 ]};
}

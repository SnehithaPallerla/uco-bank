// Give payments between the same pair of entities separate visible routes.
// Group opposite directions together so their arrows do not overlap either.
export function paymentRoutes(edges,positions){
 const groups=new Map();
 for(const edge of edges){const key=JSON.stringify([edge.from,edge.to].sort());if(!groups.has(key))groups.set(key,[]);groups.get(key).push(edge);}
 const routes=new Map();
 for(const group of groups.values()){
  const ordered=[...group].sort((a,b)=>a.id.localeCompare(b.id)),[first]=ordered;
  const [left,right]=[first.from,first.to].sort(),a=positions[left],b=positions[right];if(!a||!b)continue;
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const normal=length?{x:-dy/length,y:dx/length}:{x:1,y:0};
  let lower=-Infinity,upper=Infinity;
  for(const [axis,min,max] of [['x',65,655],['y',30,450]])if(Math.abs(normal[axis])>0.001){const bounds=[(min-mid[axis])/normal[axis],(max-mid[axis])/normal[axis]].sort((a,b)=>a-b);lower=Math.max(lower,bounds[0]);upper=Math.min(upper,bounds[1]);}
  const gap=ordered.length>1?Math.min(84,260/(ordered.length-1),(upper-lower)/(ordered.length-1)):0,span=gap*(ordered.length-1);
  const center=Math.max(lower+span/2,Math.min(upper-span/2,0));
  ordered.forEach((edge,index)=>{
   const from=positions[edge.from],to=positions[edge.to];
   if(!length){const radius=55+index*24;routes.set(edge.id,{path:`M ${from.x+22} ${from.y-20} C ${from.x+radius*2} ${from.y-radius*2}, ${from.x-radius*2} ${from.y-radius*2}, ${from.x-22} ${from.y-20}`,labelX:from.x,labelY:from.y-radius*1.5-8});return;}
   const offset=center+(index-(ordered.length-1)/2)*gap,control={x:mid.x+normal.x*offset*2,y:mid.y+normal.y*offset*2};
   const startAngle=Math.atan2(control.y-from.y,control.x-from.x),endAngle=Math.atan2(control.y-to.y,control.x-to.x);
   const start={x:from.x+Math.cos(startAngle)*34,y:from.y+Math.sin(startAngle)*34},end={x:to.x+Math.cos(endAngle)*38,y:to.y+Math.sin(endAngle)*38};
   routes.set(edge.id,{path:`M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,labelX:(start.x+2*control.x+end.x)/4,labelY:(start.y+2*control.y+end.y)/4-8});
  });
 }
 return routes;
}

export function graphSelection(selection,nodes,edges){
 if(selection?.nodeId){const node=nodes.find(n=>n.id===selection.nodeId);return node?{node}:null;}
 return edges.find(e=>e.id===selection?.edgeId)||null;
}

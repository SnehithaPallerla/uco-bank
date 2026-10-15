import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentRoutes,graphSelection} from '../src/platform/graph-layout.js';

test('repeated payments have separate routes and readable labels rather than one overlaid amount',()=>{
 const edges=[{id:'TX01',from:'borrower',to:'supplier',amount:1200000},{id:'TX02',from:'borrower',to:'supplier',amount:1500000},{id:'TX03',from:'borrower',to:'supplier',amount:1800000}];
 const positions={borrower:{x:360,y:245},supplier:{x:360,y:65}},routes=paymentRoutes(edges,positions);
 assert.equal(routes.size,3);assert.equal(new Set([...routes.values()].map(r=>r.path)).size,3);
 const labels=[...routes.values()].map(r=>r.labelX).sort((a,b)=>a-b);assert.ok(labels[1]-labels[0]>70);assert.ok(labels[2]-labels[1]>70);
 for(const route of routes.values())assert.ok(Number.isFinite(route.labelY)&&!route.path.includes('NaN'));
 assert.deepEqual(paymentRoutes([...edges].reverse(),positions),routes);
});

test('opposite payments and a relationship do not share a route',()=>{
 const edges=[{id:'out',from:'a',to:'b'},{id:'return',from:'b',to:'a'},{id:'relationship',from:'a',to:'b'}];
 const routes=paymentRoutes(edges,{a:{x:100,y:100},b:{x:580,y:100}});
 assert.equal(new Set([...routes.values()].map(r=>r.path)).size,3);
 assert.equal(new Set([...routes.values()].map(r=>r.labelY)).size,3);
});

test('selection follows the current payment data after refresh and clears when filtered out',()=>{
 const selection={edgeId:'TX01'},old={id:'TX01',label:'12 lakh'},updated={id:'TX01',label:'13 lakh',evidenceId:'E2'};
 assert.equal(graphSelection(selection,[],[old]),old);assert.equal(graphSelection(selection,[],[updated]),updated);
 assert.equal(graphSelection(selection,[],[]),null);
 const node={id:'supplier',name:'Supplier'};assert.deepEqual(graphSelection({nodeId:node.id},[node],[]),{node});
});

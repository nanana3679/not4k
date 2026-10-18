// A working hangar stack: service floors beside the void and a cargo transfer base.
import {createBuilder} from '../blueprint-kit.mjs';

export function createExtensionBlueprint(){
 const b=createBuilder(),levels=[];
 const boxBetween=(id,x0,x1,y0,y1,z0,z1,tone='hull')=>
  b.box(id,[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],[x1-x0,y1-y0,z1-z0],tone);

 // A room at the back of each deck leaves a genuinely open work apron in front.
 // Door heights stay at 2.8; the six-unit floor pitch belongs to the same building.
 function serviceFloor(id,x0,x1,y,{front=16,back=-17,lit=false,roof=false,side=null,apronBack=null}={}){
  const wallFront=back+9,outer=x0<0?x0:x1-.65;
  boxBetween(`${id}-floor`,x0,x1,y-.7,y,back,front,'side');
  boxBetween(`${id}-room`,x0,x1,y,y+5.3,back,wallFront,'hull');
  boxBetween(`${id}-side-wall`,outer,outer+.65,y,y+5.3,wallFront,front,'side');
  // A solid low edge guards the work apron without a forest of thin railing posts.
  boxBetween(`${id}-apron-edge`,x0,x1,y,y+.75,front-.45,front,'under');
  // Keep room access and glass on the outer side, away from the shared lift core.
  b.panel(`${id}-access-door`,side==='right'?x1-2.8:x0+1.2,y,wallFront+.045,1.6,2.8,'door');
  if(lit)b.panel(`${id}-occupied-room`,side==='left'?x0+3.6:side==='right'?x1-5.8:x1-6.4,y+1.7,wallFront+.05,side?2.2:4.7,1.3,'window');
  if(roof)boxBetween(`${id}-roof`,x0,x1,y+5.3,y+6,back,front,'under');
  levels.push({id,floor:y,height:6,apron:{min:[x0+.8,y+.85,apronBack??wallFront+.1],max:[x1-.8,y+5.2,front-.6]}});
 }

 for(const [side,x0,x1] of [['left',0,6.7],['right',25.3,32]]){
  // Full-width sockets join the original piers; narrower rear cores free the front.
  boxBetween(`${side}-pier-socket`,x0,x1,-10,-3.6,-16,16,'mount');
  for(let i=0;i<4;i++)boxBetween(`${side}-service-core-${i}`,x0+1,x1-1,-40-i*28,-8-i*28,-16,1,'hull');
  boxBetween(`${side}-lift-guide`,x0+2.6,x0+3.1,-124,-8,1,1.4,'dark');
  const bands=side==='left'?[-26,-56,-92,-116]:[-22,-62,-86,-116];
  for(const [i,y] of bands.entries()){
   const width=i%2?13:17;
   const a=side==='left'?x1-width:x0,c=side==='left'?x1:x0+width;
   serviceFloor(`${side}-service-${i}-lower`,a,c,y,{lit:i===1,side,apronBack:1.5});
   serviceFloor(`${side}-service-${i}-upper`,a,c,y+6,{lit:i===0,roof:true,side,apronBack:1.5});
   // Broad load paths attach the projecting bay to the core underneath it.
   const outside=side==='left'?a+1:c-1,inside=(x0+x1)/2;
   b.beam(`${side}-service-${i}-haunch`,[outside,y-.5,-7],[inside,y-6,-7],.85,2,'under');
  }
 }

 // The former solid receiving block becomes a three-floor transfer terminal.
 boxBetween('receiving-deck',-10,44,-142,-140,-54,22,'under');
 boxBetween('receiving-rear-core',7,25,-142,-115,-54,-30,'hull');
 for(const [i,y] of [-140,-134,-128].entries()){
  serviceFloor(`cargo-transfer-${i}`,-10,44,y,{front:22,back:-38,lit:i===1,roof:i===2,apronBack:1.5});
 }
 b.beam('left-deck-brace',[-8,-141,8],[10,-162,-27],2,2,'under');
 b.beam('right-deck-brace',[42,-141,8],[22,-162,-27],2,2,'under');

 // Continuous cargo shaft, with sparse loading stations well below the hangar.
 for(let i=0;i<8;i++)boxBetween(`cargo-lift-core-${i}`,8,24,-202.5-i*62.5,-139-i*62.5,-49,-27,'hull');
 boxBetween('cargo-lift-guide-left',10,10.6,-640,-140,-26.9,-26.4,'dark');
 boxBetween('cargo-lift-guide-right',21.4,22,-640,-140,-26.9,-26.4,'dark');
 for(const [i,y] of [-184,-278,-418,-564].entries()){
  const x0=i%2?-4:2,x1=i%2?30:40;
  serviceFloor(`lower-loading-${i}-lower`,x0,x1,y,{front:-13,back:-49,lit:i===0,apronBack:-26.3});
  serviceFloor(`lower-loading-${i}-upper`,x0,x1,y+6,{front:-13,back:-49,roof:true,apronBack:-26.3});
 }
 b.model.levels=levels;
 return b.model;
}

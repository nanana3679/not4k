// PROTOTYPE: one freight interchange designed around a traversable central void.
// Question: do approach, enclosure and emergence read as one flight through a facility?
import {createBuilder} from './blueprint-kit.mjs';
export const PASSAGE_START=1800,PASSAGE_END=-800,PASSAGE_PERIOD=2600;
export const PASSAGE_STOPS=Object.freeze({approach:650,entry:320,inside:0,exit:-350});
export const passageProgressAt=travel=>((travel*.956/PASSAGE_PERIOD)%1+1)%1;
export const passageProgressForDepth=depth=>Math.max(0,Math.min(1,(PASSAGE_START-depth)/PASSAGE_PERIOD));
export const passageTravelAt=progress=>progress*PASSAGE_PERIOD/.956;
export function passagePyramid(base,altitude){
 const cameraHeight=-50+90*Math.max(0,Math.min(1,altitude));
 return {...base,cameraHeight,apexHeight:cameraHeight+(base.apexHeight-(base.cameraHeight??12))};
}
export function passagePose(travel){
 const phase=passageProgressAt(travel),depth=PASSAGE_START-phase*PASSAGE_PERIOD;
 return {center:[0,0,depth],scale:1,phase,visible:depth>-380,
  stage:depth>360?'접근':depth>190?'입구':depth>-328?'시설 내부':'출구 너머'};
}
export function createPassageBlueprint(){
 const b=createBuilder(),levels=[];
 const block=(id,x0,x1,y0,y1,z0,z1,tone='hull')=>b.box(id,[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],[x1-x0,y1-y0,z1-z0],tone);
 // Continuous outer service spines connect all decks, bridges and occupied wings.
 block('west-service-spine',-132,-84,-260,154,-320,320);
 block('east-service-spine',88,140,-260,126,-320,320);
 block('west-control-head',-160,-70,102,148,170,320);
 block('east-transfer-head',70,172,72,116,-310,-120);
 // Three separated overhead bridges leave open sky between them.
 for(const [id,z0,z1,y0,y1] of [['arrival',236,282,64,82],['transfer',-18,28,58,76],['departure',-294,-250,90,108]]){
  block(`${id}-bridge`,-106,114,y0,y1,z0,z1);
  block(`${id}-underside-channel`,-78,80,y0-.35,y0,z0+14,z1-14,'dark');
  for(const x of [-63,54])block(`${id}-underside-beacon`,x,x+2,y0-.55,y0-.35,z0+16,z0+19,'warm');
 }
 // Freight transfer decks cross beneath the flight envelope, not through it.
 for(const [id,z0,z1] of [['arrival',230,300],['sorting',-46,30],['departure',-300,-228]]){
  block(`${id}-lower-transfer`,-112,120,-72,-56,z0,z1,'under');
  block(`${id}-deck-edge`,-76,78,-56,-55.2,z1-1.4,z1,'side');
 }
 // Offset cargo wings make low altitude tight; their roofs open up at higher altitude.
 block('west-arrival-bay',-100,-28,-170,-29,170,308);
 block('east-arrival-bay',34,116,-170,-23,108,300);
 block('west-inner-cargo-bank',-100,-14,-180,-32,-146,116);
 block('east-inner-cargo-bank',18,120,-180,-25,-216,16);
 block('west-departure-bay',-112,-32,-160,-18,-316,-182);
 block('east-departure-bay',38,122,-160,-16,-316,-202);
 // High-level rooms stand farther back, revealing the lower wings' roofs.
 block('west-operations-wing',-116,-54,4,35,92,196);
 block('east-dispatch-wing',56,128,18,48,-164,-58);
 block('west-upper-workshop',-114,-62,51,86,-222,-98);
 // Real projecting work decks connect to the side spines; the center stays free.
 function workLevels(id,x0,x1,z0,z1,floors,side){
  for(const [i,y] of floors.entries()){
   block(`${id}-${i}-deck`,x0,x1,y-.8,y,z0,z1,'side');
   const back=side==='west'?x0:x1-8;
   block(`${id}-${i}-room`,back,back+8,y,y+5.2,z0+4,z1-4);
   block(`${id}-${i}-roof`,back,back+8,y+5.2,y+5.9,z0+4,z1-4,'under');
   // Doors face into the actual work apron, on an X-facing wall.
   const x=side==='west'?back+8.045:back-.045,z=z1-12,n=side==='west'?1:-1;
   const points=[[x,y,z+1.6],[x,y,z],[x,y+2.8,z],[x,y+2.8,z+1.6]];
   b.model.panels.push({id:`${id}-${i}-door`,texture:'door',points:n>0?points:points.toReversed(),uv:[[0,0],[1,0],[1,1],[0,1]]});
   if(i===0){const q=[[x,y+1.8,z0+20],[x,y+1.8,z0+15],[x,y+3.1,z0+15],[x,y+3.1,z0+20]];b.model.panels.push({id:`${id}-${i}-window`,texture:'window',points:n>0?q:q.toReversed(),uv:[[0,0],[1,0],[1,1],[0,1]]});}
   levels.push({id:`${id}-${i}`,floor:y});
  }
 }
 workLevels('west-repair',-89,-24,42,82,[-20,-14],'west');
 workLevels('east-cargo-control',25,93,-96,-52,[-8,-2],'east');
 workLevels('west-high-control',-89,-44,-186,-152,[40,46],'west');
 // Large diagonal load paths frame the opening and never enter its swept envelope.
 for(const [side,x,tip] of [['west',-90,-32],['east',96,38]]){
  b.beam(`${side}-arrival-haunch`,[x,63,246],[tip,-34,216],5,10,'under');
  b.beam(`${side}-departure-haunch`,[x,88,-264],[side==='west'?-38:42,-20,-232],5,10,'under');
 }
 // Sparse inset strips point through the facility; they are attached to real banks.
 for(const [side,x] of [['west',-13.96],['east',17.96]])for(const [i,z] of [-100,-60,-20].entries()){
  if(side==='east'&&z>16)continue;
  block(`${side}-cargo-marker-${i}`,x-.05,x+.05,-46.77,-46.53,z-1,z+1,'warm');
 }
 b.model.levels=levels;
 b.model.flightEnvelope={min:[-6,-53,-320],max:[6,43,320]};
 return b.model;
}

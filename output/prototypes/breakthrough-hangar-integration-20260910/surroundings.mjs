// PROTOTYPE: persistent structural continuations for A-H; E also has a distant city.
import * as THREE from './vendor/three.module.js';
import {createBuilder,chamfer} from './blueprint-kit.mjs';
import {buildModel} from './render-model.mjs';
import {applyArchitecturalMaterials} from './architectural-materials.mjs';
import {createExtensionBlueprint as extendA} from './extensions/a-wedge.mjs';
import {createExtensionBlueprint as extendB} from './extensions/b-maintenance.mjs';
import {createExtensionBlueprint as extendC} from './extensions/c-service-tower.mjs';
import {createExtensionBlueprint as extendD} from './extensions/d-twin-gallery.mjs';
import {createExtensionBlueprint as extensionBlueprint} from './extensions/e-hangar.mjs';
export {extensionBlueprint};
import {createExtensionBlueprint as extendF} from './extensions/f-open-dock.mjs';
import {createExtensionBlueprint as extendG} from './extensions/g-transfer-spine.mjs';
import {createExtensionBlueprint as extendH} from './extensions/h-logistics-hub.mjs';
export const FAR_START=1800,FAR_PERIOD=2200;
export const FAR_ANCHORS=Object.freeze([
 [-280,-185,130,270,160], [350,240,170,200,110], [250,-230,170,330,150],
 [-340,250,140,240,130], [-470,-140,190,240,140], [90,-460,180,330,200],
 [430,-150,180,280,160], [-240,330,180,270,170], [-210,-260,130,330,180],
 [260,300,150,240,130], [560,-200,240,300,150], [-560,200,210,280,170]
]);
export function farLayout(){return FAR_ANCHORS.map(([x,y,w,h,d],i)=>{
 const upper=y>0,continuation=upper?600:-600;
 const boxes=[{at:[0,continuation,0],size:[w,h+1200,d],tone:i%3},
  {at:[w*.4,-h*.12+continuation,d*.07],size:[w*.42,h*.76+1200,d*.8],tone:(i+1)%3},
  {at:[-w*.12,h*.48,-d*.05],size:[w*(upper?1.3:.68),h*.14,d*1.1],tone:1},
  {at:[w*.1,-h*.46,d*.12],size:[w*1.15,h*.14,d*1.1],tone:2}];
 const lamps=[0,1,2].map(j=>({at:[-w*.25+j*w*.2,h*(upper?-.3:.27-j*.19),d*.505],size:[w*(j===1?.13:.065),1.1,1],tone:j===1?1:0}));
 return {id:`city-${i}`,x,y,phase:.03+i/FAR_ANCHORS.length,boxes,lamps};
});}
export function farPose(cluster,pyramid,travel){
 const phase=((cluster.phase+travel*.956/FAR_PERIOD)%1+1)%1,z=FAR_START-phase*FAR_PERIOD;
 const cameraHeight=pyramid.cameraHeight??12,slope=(pyramid.apexHeight-cameraHeight)/(pyramid.depth+8);
 const base=pyramid.clearance?pyramid.baseCenter-pyramid.height/2:pyramid.baseCenter-29.205;
 return {x:cluster.x,y:base+cluster.y+slope*z,z};
}
export function stationBlueprint(){
 const b=createBuilder();
 // Offset rear masses and bridges leave both a deep hangar opening and open sky.
 b.prism('rear-spine',chamfer(-43,-350,-9,132,3),-37,-105,'hull');
 b.prism('rear-upper-block',chamfer(-76,89,-7,135,4),-46,-137,'side');
 b.prism('offset-lower-wing',chamfer(-104,-228,-24,-153,4),-27,-116,'hull');
 b.box('rear-link-upper',[-2,31,-34],[58,5,18],'under');
 b.box('rear-link-lower',[-5,-67,-28],[64,5,23],'side');
 b.beam('lower-link-diagonal',[-32,-99,-31],[30,-68,-31],1.5,2,'under');
 b.box('rear-deck-join',[-9,-130,-31],[79,9,38],'under');
 for(const y of [-310,-250,-190,-130,-70,-10,50,110]){
  b.box(`spine-ring-${y}`,[-26,y,-69],[36,1.4,74],'under');
  if(y<80)b.panel(`rear-lit-room-${y}`,-35,y+7,-36.94,11,1.2,'window');
 }
 b.box('upper-underside-slot',[-40,88,-76],[38,.4,32],'dark');
 b.box('upper-guide-lamp',[-52,89.3,-45.9],[9,.35,.15],'warm');
 return b.model;
}
function createFarField(){
 const layout=farLayout(),geometry=new THREE.BoxGeometry(1,1,1),normals=geometry.attributes.normal,colors=[];
 for(let i=0;i<normals.count;i++){const n=[normals.getX(i),normals.getY(i),normals.getZ(i)];const shade=n[1]>.5?1:n[1]<-.5?.38:n[2]>.5?.76:.52;colors.push(shade,shade,shade);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const solids=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,fog:true}),layout.reduce((n,c)=>n+c.boxes.length,0));
 const lampGeometry=new THREE.BoxGeometry(1,1,1),lamps=new THREE.InstancedMesh(lampGeometry,new THREE.MeshBasicMaterial({fog:true}),layout.reduce((n,c)=>n+c.lamps.length,0));
 solids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);solids.frustumCulled=false;lamps.frustumCulled=false;
 const tones=['#1e2d40','#26354a','#192a3e'],lampTones=['#947354','#55798e'];let i=0,j=0;
 for(const c of layout){for(const part of c.boxes)solids.setColorAt(i++,new THREE.Color(tones[part.tone]));for(const part of c.lamps)lamps.setColorAt(j++,new THREE.Color(lampTones[part.tone]));}
 const group=new THREE.Group();group.name='distant-architecture';group.add(solids,lamps);const matrix=new THREE.Matrix4();
 function update(pyramid,travel){let i=0,j=0;for(const c of layout){const p=farPose(c,pyramid,travel);for(const [parts,mesh] of [[c.boxes,solids],[c.lamps,lamps]])for(const part of parts){matrix.makeScale(...part.size);matrix.setPosition(p.x+part.at[0],p.y+part.at[1],-p.z+part.at[2]);mesh.setMatrixAt(mesh===solids?i++:j++,matrix);}}solids.instanceMatrix.needsUpdate=true;lamps.instanceMatrix.needsUpdate=true;}
 return{group,update,layout,solids,lamps};
}
export function createSurroundings(textures){
 const extensions=new Map();
 for(const [id,create] of [['A',extendA],['B',extendB],['C',extendC],['D',extendD],['E',extensionBlueprint],['F',extendF],['G',extendG],['H',extendH]]){
  const family=id==='A'?'wedge':'standard';
  const model=applyArchitecturalMaterials(buildModel(create(),textures,family),textures,family);
  model.group.name=`${id}-lower-connections`;model.group.visible=false;
  model.bounds=new THREE.Box3().setFromObject(model.group);
  extensions.set(id,model);
 }
 const station=applyArchitecturalMaterials(buildModel(stationBlueprint(),textures),textures),far=createFarField();station.group.name='E-station';
 for(const model of [...extensions.values(),station])model.group.traverse(o=>{if(o.isLineSegments){o.material.depthWrite=false;o.renderOrder=0;}});
 const group=new THREE.Group();group.name='surrounding-space';group.add(far.group,station.group,...[...extensions.values()].map(m=>m.group));
 let selectedId='E';
 function update(state,pyramid,travel,building){
  selectedId=extensions.has(state.module)?state.module:'E';
  const extension=extensions.get(selectedId),enabled=selectedId==='E';
  far.group.visible=station.group.visible=enabled&&state.surroundings;
  for(const model of extensions.values())model.group.visible=model===extension&&state.extensions&&state.building;
  for(const model of [station,extension]){model.group.position.copy(building.group.position);model.group.quaternion.copy(building.group.quaternion);model.group.scale.copy(building.group.scale);}
  if(far.group.visible)far.update(pyramid,travel);
 }
 function setArt(enabled){for(const model of extensions.values())model.setArt(enabled);station.setArt(enabled);}
 function snapshot(){const extension=extensions.get(selectedId);return{farVisible:far.group.visible,stationVisible:station.group.visible,extensionVisible:extension.group.visible,extensionModule:selectedId,extensionBounds:{min:extension.bounds.min.toArray(),max:extension.bounds.max.toArray()},extensionPosition:extension.group.position.toArray(),extensionScale:extension.group.scale.toArray(),visibleExtensions:[...extensions].filter(([,m])=>m.group.visible).map(([id])=>id),extensionIds:Object.fromEntries([...extensions].map(([id,m])=>[id,m.group.uuid])),groupId:group.uuid,farId:far.group.uuid,extensionId:extension.group.uuid,stationId:station.group.uuid,instanceCount:far.solids.count+far.lamps.count,farSample:Array.from(far.solids.instanceMatrix.array.slice(12,15))};}
 return{group,update,setArt,snapshot,get extension(){return extensions.get(selectedId);},extensions,station,far};
}

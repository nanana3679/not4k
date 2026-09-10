import * as THREE from './vendor/three.module.js';
import {modules} from './catalog.mjs';
import {buildModel} from './render-model.mjs';
// One persistent copy per approved study model; all five textures are shared.
export function createModelLibrary(textures){
 const records=new Map();
 for(const module of modules){
  const model=buildModel(module.createBlueprint(),textures,module.metadata.id==='A'?'wedge':'standard');
  const bounds=new THREE.Box3().setFromObject(model.group);
  const record={...model,metadata:module.metadata,bounds,center:bounds.getCenter(new THREE.Vector3()),dimensions:bounds.getSize(new THREE.Vector3()).toArray()};
  record.group.name=module.metadata.id;record.group.visible=false;
  record.group.traverse(o=>{if(o.isLineSegments){o.material.depthWrite=false;o.renderOrder=0;}});
  records.set(module.metadata.id,record);
 }
 return records;
}
export function showModel(records,id,visible=true){
 const selected=records.get(id)||records.get('E');
 for(const record of records.values())record.group.visible=record===selected&&visible;
 return selected;
}

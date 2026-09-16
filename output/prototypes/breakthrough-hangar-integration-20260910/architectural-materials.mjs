// One cladding palette and physical pattern scale for the body and its lower floors.
// Original geometry, openings and door/window artwork keep their own definitions.
import * as THREE from './vendor/three.module.js';

const palettes=new WeakMap();
function paletteFor(textures,family){
 let families=palettes.get(textures);
 if(!families){families=new Map();palettes.set(textures,families);}
 if(families.has(family))return families.get(family);
 const wall=family==='wedge'?textures.armor:textures.hull;
 const underside=family==='wedge'?textures.armor:textures.soffit;
 for(const texture of new Set([wall,underside]))if(texture){
  texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping;texture.needsUpdate=true;
 }
 const definitions={front:[wall,'#e1e6ee','#42536b'],side:[wall,'#cad5e4','#3b4a60'],
  back:[wall,'#7b8da7','#2b3546'],roof:[wall,'#ffffff','#4b5f79'],
  underside:[underside,'#bac9da','#364659']};
 const entries=Object.fromEntries(Object.entries(definitions).map(([role,[map,color,plain]])=>
  [role,{map,color,plain,material:new THREE.MeshBasicMaterial({map:map??null,color,fog:true})}]));
 families.set(family,entries);return entries;
}

export function applyArchitecturalMaterials(model,textures,family='standard'){
 const entries=paletteFor(textures,family),cladding=new Set([textures.hull,textures.armor,textures.soffit].filter(Boolean));
 const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
 for(const mesh of model.group.children){
  if(!mesh.isMesh)continue;
  const before=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  // Colored rails, lift slots, lights, glass and doors retain their own materials.
  if(!before.some(m=>m.map&&cladding.has(m.map)))continue;
  mesh.updateMatrix();normalMatrix.getNormalMatrix(mesh.matrix);
  const geometry=mesh.geometry.clone(),positions=geometry.attributes.position,normals=geometry.attributes.normal;
  const uv=geometry.attributes.uv,roles=[];
  for(let i=0;i<positions.count;i++){
   point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrix);
   normal.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
   const vertical=Math.abs(normal.y)>.7,side=!vertical&&Math.abs(normal.x)>Math.abs(normal.z);
   roles[i]=vertical?(normal.y>0?'roof':'underside'):side?'side':normal.z>0?'front':'back';
   const u=side?(normal.x>0?-point.z:point.z):normal.z<0&&!vertical?-point.x:point.x;
   const v=vertical?(normal.y>0?-point.z:point.z):point.y;
   const underside=roles[i]==='underside'&&family!=='wedge';
   uv.setXY(i,u/(underside?18:12),v/(family==='wedge'||underside?12:18));
  }
  const vertexAt=start=>geometry.index?geometry.index.getX(start):start;
  mesh.material=Array.isArray(mesh.material)?geometry.groups.map(g=>entries[roles[vertexAt(g.start)]].material):entries[roles[0]].material;
  uv.needsUpdate=true;mesh.geometry=geometry;
 }
 const originalSetArt=model.setArt;
 model.setArt=enabled=>{
  originalSetArt(enabled);
  for(const entry of Object.values(entries)){
   entry.material.map=enabled?entry.map??null:null;
   entry.material.color.set(enabled?entry.color:entry.plain);entry.material.needsUpdate=true;
  }
 };
 return model;
}

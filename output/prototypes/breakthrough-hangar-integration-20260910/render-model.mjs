import * as THREE from './vendor/three.module.js';
import {surfaceData} from './surface-geometry.mjs';
export function buildModel(blueprint,textures,family='standard'){
const building=new THREE.Group(),mappedMaterials=[],materials={};
function material(tone,map=null) {
  const colors={hull:'#e1e6ee',soffit:'#bac9da',roof:'#ffffff',side:'#cad5e4',back:'#7b8da7',under:'#7e90ab',mount:'#9aabc0',beam:'#344257',rail:'#869ab4',dark:'#101720',red:'#f47836',warm:'#fff1c3',window:'#ffe8c5',door:'#d1d7e2'};
  const m=new THREE.MeshBasicMaterial({color:colors[tone],map,fog:true});
  if(map)mappedMaterials.push({material:m,map,artColor:m.color.clone(),plainColor:new THREE.Color(tone==='window'?'#8b6741':tone==='door'?'#6b7d92':'#42536b')});
  return m;
}
function surface(points,uv) {
  const {positions,texcoords,indices}=surfaceData(points,uv);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(texcoords,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
const edgeMaterial=new THREE.LineBasicMaterial({color:'#050a12',transparent:true,opacity:.88});
function mesh(geometry,mat,id,edges=true) {
  const m=new THREE.Mesh(geometry,mat);m.name=id;building.add(m);
  if(edges){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),edgeMaterial);m.add(edge);}
  return m;
}
function createBuilding() {
  for(const tone of ['side','under','mount'])materials[tone]=material(tone,textures.armor);
  for(const tone of ['hull','roof','back'])materials[tone]=material(tone,family==='wedge'?textures.armor:textures.hull);
  materials.soffit=material('soffit',textures.soffit);
  for(const tone of ['beam','rail','dark','red','warm'])materials[tone]=material(tone);
  materials.window=material('window',textures.window);materials.door=material('door',textures.door);
  for(const face of blueprint.faces)mesh(surface(face.points,face.uv),materials[face.tone],face.id);
  for(const panel of blueprint.panels)mesh(surface(panel.points,panel.uv),materials[panel.texture],panel.id,false);
  const unitBox=new THREE.BoxGeometry(1,1,1);
  const boxMaterials=tone=>['side','mount','under','hull'].includes(tone)?[materials[tone],materials.under,materials.roof,materials.soffit,materials[tone],materials.back]:materials[tone];
  for(const part of blueprint.boxes){const m=mesh(unitBox,boxMaterials(part.tone),part.id,!['red','warm'].includes(part.tone));m.position.set(...part.position);m.scale.set(...part.size);}
  for(const part of blueprint.beams) {
    const a=new THREE.Vector3(...part.start),b=new THREE.Vector3(...part.end),direction=b.clone().sub(a);
    const m=mesh(unitBox,boxMaterials(part.tone),part.id,!['red','warm'].includes(part.tone));
    m.position.copy(a.add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());m.scale.set(part.width,direction.length(),part.depth);
  }
}

createBuilding();
return {group:building,setArt(enabled){for(const r of mappedMaterials){r.material.map=enabled?r.map:null;r.material.color.copy(enabled?r.artColor:r.plainColor);r.material.needsUpdate=true;}}};
}

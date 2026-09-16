import {expect,it} from 'vitest';
import * as THREE from './vendor/three.module.js';
import {createBuilder} from './blueprint-kit.mjs';
import {buildModel} from './render-model.mjs';
import {applyArchitecturalMaterials} from './architectural-materials.mjs';
import {createModelLibrary} from './model-library.mjs';
import {createSurroundings} from './surroundings.mjs';

const textures=()=>Object.fromEntries(['hull','armor','soffit','window','door'].map(id=>[id,new THREE.Texture()]));
function fixture(t,at=[0,0,0],size=[12,18,12],tone='hull',family='standard'){
 const b=createBuilder();b.box('wall',at,size,tone);
 return applyArchitecturalMaterials(buildModel(b.model,t,family),t,family);
}
it('본체 hull과 기둥 under는 같은 외벽·측면·지붕 재질 객체를 공유하고 밑면만 soffit을 쓴다',()=>{
 const t=textures(),body=fixture(t),pillar=fixture(t,[0,-18,0],[12,18,12],'under');
 const a=body.group.children[0].material,b=pillar.group.children[0].material;
 expect(a).toEqual(b);expect(a[0]).toBe(b[0]);expect(a[4]).toBe(b[4]);
 for(const i of [0,1,2,4,5])expect(a[i].map).toBe(t.hull);
 expect(a[3].map).toBe(t.soffit);expect(a[0]).toBe(a[1]);
});
it('높이18과90의 기둥은 UV 세로 범위가1과5여서 무늬를 같은 크기로 반복한다',()=>{
 const t=textures();
 for(const [height,repeats] of [[18,1],[90,5]]){
  const geometry=fixture(t,[0,0,0],[12,height,12]).group.children[0].geometry;
  const uv=geometry.attributes.uv,values=[16,17,18,19].map(i=>uv.getY(i));
  expect(Math.max(...values)-Math.min(...values)).toBeCloseTo(repeats);
 }
 expect(t.hull.wrapS).toBe(THREE.MirroredRepeatWrapping);expect(t.hull.wrapT).toBe(THREE.MirroredRepeatWrapping);
});
it('높이0에서 맞닿는 본체와 연결부의 앞면 UV 좌표가 같아 표면 무늬의 위상이 이어진다',()=>{
 const t=textures(),body=fixture(t,[0,9,0]),pillar=fixture(t,[0,-9,0]);
 function seam(model){const mesh=model.group.children[0],p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,out=[];
  mesh.updateMatrix();for(let i=16;i<20;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrix);if(v.y===0)out.push([v.x,uv.getX(i),uv.getY(i)]);}return out.sort((a,b)=>a[0]-b[0]);}
 expect(seam(body)).toHaveLength(2);expect(seam(pillar)).toEqual(seam(body));
});
it('외장 재질 통일은 위치·법선·윤곽선과 문·창의 재질 및 UV를 변형하지 않는다',()=>{
 const t=textures(),b=createBuilder();b.box('wall',[2,3,4],[6,12,5],'side');
 b.panel('door',0,0,7,1.6,2.8,'door');b.panel('window',2,2,7,2,1,'window');b.box('guide',[1,1,1],[1,2,1],'dark');
 const model=buildModel(b.model,t),before=model.group.children.map(m=>({geometry:m.geometry,normals:Array.from(m.geometry.attributes.normal.array),positions:Array.from(m.geometry.attributes.position.array),material:m.material,edges:m.children.map(c=>c.geometry)}));
 const bounds=new THREE.Box3().setFromObject(model.group);applyArchitecturalMaterials(model,t);
 expect(new THREE.Box3().setFromObject(model.group)).toEqual(bounds);
 for(const [i,m] of model.group.children.entries()){
  expect(Array.from(m.geometry.attributes.position.array)).toEqual(before[i].positions);expect(m.children.map(c=>c.geometry)).toEqual(before[i].edges);expect(Array.from(m.geometry.attributes.normal.array)).toEqual(before[i].normals);
  if(['door','window','guide'].includes(m.name)){expect(m.geometry).toBe(before[i].geometry);expect(m.material).toBe(before[i].material);}
 }
 expect(t.door.wrapS).toBe(THREE.ClampToEdgeWrapping);expect(t.window.wrapS).toBe(THREE.ClampToEdgeWrapping);
});
it('A의 본체·기둥은 기존 armor 계열을 유지하고 B~H 외벽은 hull 계열로 통일된다',()=>{
 const t=textures(),bodies=createModelLibrary(t),space=createSurroundings(t);
 for(const [id,body] of bodies){
  const expected=id==='A'?t.armor:t.hull;
  const materials=new Set();
  for(const group of [body.group,space.extensions.get(id).group]){
   let found=false;group.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map===expected){materials.add(m);found=true;}});expect(found,id).toBe(true);
  }
  expect(materials.size,id).toBeLessThanOrEqual(5);
 }
});
it('표면 그림을 껐다 켜도 본체·기둥의 공유 그림과 geometry를 그대로 복원한다',()=>{
 const t=textures(),body=fixture(t),pillar=fixture(t,[0,-18,0],[12,18,12],'under');
 const mesh=pillar.group.children[0],geometry=mesh.geometry,material=mesh.material[4];
 body.setArt(false);pillar.setArt(false);expect(material.map).toBeNull();
 body.setArt(true);pillar.setArt(true);expect(material.map).toBe(t.hull);expect(mesh.material[4]).toBe(body.group.children[0].material[4]);expect(mesh.geometry).toBe(geometry);
});

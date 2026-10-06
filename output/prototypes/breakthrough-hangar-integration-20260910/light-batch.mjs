import * as THREE from './vendor/three.module.js';
import {trailAlpha} from './world-trails.mjs';
import {hypot2} from './hypot.mjs';
// One persistent geometry per pass. All cores/halos/trails test the building depth.
// 정점은 typed array에 바로 쓴다. 게임은 프레임마다 수만~수십만 정점을 쓰므로 정점마다 배열·좌표 객체를 만들지 않는다.
const NO_OFFSET=Object.freeze([0,0]);
// 윤곽선·발광 변의 정점 여섯 개: 끝점(0=a, 1=b)과 화면 오프셋 부호.
const EDGE_ENDS=Object.freeze([0,0,1,0,1,1]),EDGE_SIGNS=Object.freeze([1,-1,-1,1,-1,1]);
export class LightBatch{
 constructor(additive=false){
  this.material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
   vertexShader:'attribute vec4 tint; attribute vec2 offset; varying vec4 vTint; void main(){vTint=tint; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); p.xy+=offset*p.w; gl_Position=p;}',
   fragmentShader:'precision highp float; varying vec4 vTint; void main(){gl_FragColor=vTint;}'});
  this.geometry=new THREE.BufferGeometry();this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.capacity=0;this.count=0;
  // 지금 쓰는 면의 색과 화면 오프셋. face·vertex가 정하고 이후 write가 쓴다.
  // (정점마다 실수를 인자로 넘기면 V8이 숫자를 boxing해 할당이 생기므로 필드로 전달한다.)
  this.red=0;this.green=0;this.blue=0;this.alpha=0;this.offsetX=0;this.offsetY=0;
  this.reserve(8192);
 }
 reserve(required){if(required<=this.capacity)return;const capacity=2**Math.ceil(Math.log2(required));
  const old=this.geometry,next=new THREE.BufferGeometry();
  for(const [name,n] of [['position',3],['tint',4],['offset',2]]){const a=new Float32Array(capacity*n);if(old.getAttribute(name))a.set(old.getAttribute(name).array);next.setAttribute(name,new THREE.BufferAttribute(a,n).setUsage(THREE.DynamicDrawUsage));}
  this.geometry=next;this.mesh.geometry=next;this.capacity=capacity;old.dispose();
  this.positions=next.attributes.position;this.tints=next.attributes.tint;this.offsets=next.attributes.offset;
 }
 begin(){this.count=0;}
 vertex(p,rgb,alpha,offset=NO_OFFSET){
  this.red=rgb[0]/255;this.green=rgb[1]/255;this.blue=rgb[2]/255;this.alpha=alpha;
  this.offsetX=offset[0];this.offsetY=offset[1];
  this.write(p,1);
 }
 // 지금 색으로 old +Z 좌표 p를 Three −Z로 바꿔 정점 하나를 쓴다. 화면 오프셋은 sign(1 또는 −1)×(offsetX, offsetY)다.
 write(p,sign){
  this.reserve(this.count+1);const i=this.count++;
  const position=this.positions.array,tint=this.tints.array,offset=this.offsets.array;
  position[i*3]=p[0];position[i*3+1]=p[1];position[i*3+2]=-p[2];
  tint[i*4]=this.red;tint[i*4+1]=this.green;tint[i*4+2]=this.blue;tint[i*4+3]=this.alpha;
  offset[i*2]=sign*this.offsetX;offset[i*2+1]=sign*this.offsetY;
 }
 face(face,view,alpha=face.alpha,halo=0){
  if(alpha<.0001)return;
  const rgb=face.rgb;
  this.red=rgb[0]/255;this.green=rgb[1]/255;this.blue=rgb[2]/255;this.alpha=alpha;
  this.writeFace(face,view,halo);
 }
 // 지금 색(red·green·blue·alpha 필드)으로 면 하나를 쓴다. 채움은 부채꼴 삼각형, 윤곽선·발광은 변마다 사각형이다.
 writeFace(face,view,halo){
  const points=face.points;
  if(face.outline||halo){
   const pixels=face.outline?face.lineWidth:0;
   for(let i=0;i<points.length;i++){
    if(face.edges?.[i]===false)continue;
    // legacy project(a,view)·project(b,view)와 같은 식으로 화면 좌표만 계산한다. 좌표 객체를 만들지 않는다.
    const a=points[i],b=points[(i+1)%points.length],depthA=a[2]+view.back,depthB=b[2]+view.back;
    const ax=view.width/2+a[0]*view.focal/depthA,ay=view.principalY+(view.cameraHeight-a[1])*view.focal/depthA;
    const bx=view.width/2+b[0]*view.focal/depthB,by=view.principalY+(view.cameraHeight-b[1])*view.focal/depthB;
    const dx=bx-ax,dy=by-ay,len=hypot2(dx,dy);
    if(len<.001)continue;
    const half=(pixels+halo)/2;
    this.offsetX=-dy/len*half*2/view.width;this.offsetY=-dx/len*half*2/view.height;
    // 변 하나를 삼각형 둘로 쓴다: (a,+)(a,−)(b,−) · (a,+)(b,−)(b,+). 호출 지점을 하나로 두어 V8이 write를 인라인하게 한다.
    for(let k=0;k<6;k++)this.write(EDGE_ENDS[k]===0?a:b,EDGE_SIGNS[k]);
   }
  }else{
   this.offsetX=0;this.offsetY=0;
   const first=points[0];
   for(let i=1;i<points.length-1;i++)for(let k=0;k<3;k++)this.write(k===0?first:points[i+k-1],1);
  }
 }
 end(){
  this.geometry.setDrawRange(0,this.count);
  updateRange(this.positions,this.count);updateRange(this.tints,this.count);updateRange(this.offsets,this.count);
  this.mesh.visible=this.count>0;
 }
 dispose(){this.geometry.dispose();this.material.dispose();}
}

// 게임 프레임의 광원 면 세 겹(본체 core, 3px·8px 발광 halo)을 쓴다. 면마다 face(face)·face(face,α×.07,3)·face(face,α×.025,8)과 같다.
// 면마다 밝기를 함수 인자로 넘기면 V8이 숫자를 boxing해 할당이 생기므로 batch 필드로 넘긴다.
export function writeFaceLayers(core,halo,faces,view){
 for(let i=0;i<faces.length;i++){
  const face=faces[i],rgb=face.rgb;
  core.face(face,view);
  halo.red=rgb[0]/255;halo.green=rgb[1]/255;halo.blue=rgb[2]/255;
  halo.alpha=face.alpha*.07;
  if(!(halo.alpha<.0001))halo.writeFace(face,view,3);
  halo.alpha=face.alpha*.025;
  if(!(halo.alpha<.0001))halo.writeFace(face,view,8);
 }
}

// 잔상 표본을 trailAlpha(sample,now,duration) 밝기로 쓴다. face(sample,view,trailAlpha(...))와 같다.
export function writeTrailFaces(batch,samples,view,now,duration){
 for(let i=0;i<samples.length;i++){
  const sample=samples[i],rgb=sample.rgb;
  batch.alpha=trailAlpha(sample,now,duration);
  if(batch.alpha<.0001)continue;
  batch.red=rgb[0]/255;batch.green=rgb[1]/255;batch.blue=rgb[2]/255;
  batch.writeFace(sample,view,0);
 }
}
function updateRange(attribute,count){attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*attribute.itemSize);attribute.needsUpdate=true;}

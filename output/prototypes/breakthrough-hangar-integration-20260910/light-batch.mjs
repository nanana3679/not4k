import * as THREE from './vendor/three.module.js';
import {project} from './legacy/geometry.mjs';
// One persistent geometry per pass. All cores/halos/trails test the building depth.
export class LightBatch{
 constructor(additive=false){
  this.material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
   vertexShader:'attribute vec4 tint; attribute vec2 offset; varying vec4 vTint; void main(){vTint=tint; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); p.xy+=offset*p.w; gl_Position=p;}',
   fragmentShader:'precision highp float; varying vec4 vTint; void main(){gl_FragColor=vTint;}'});
  this.geometry=new THREE.BufferGeometry();this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.capacity=0;this.count=0;this.reserve(8192);
 }
 reserve(required){if(required<=this.capacity)return;const capacity=2**Math.ceil(Math.log2(required));
  const old=this.geometry,next=new THREE.BufferGeometry();
  for(const [name,n] of [['position',3],['tint',4],['offset',2]]){const a=new Float32Array(capacity*n);if(old.getAttribute(name))a.set(old.getAttribute(name).array);next.setAttribute(name,new THREE.BufferAttribute(a,n).setUsage(THREE.DynamicDrawUsage));}
  this.geometry=next;this.mesh.geometry=next;this.capacity=capacity;old.dispose();
 }
 begin(){this.count=0;}
 vertex(p,rgb,alpha,offset=[0,0]){this.reserve(this.count+1);const i=this.count++;this.geometry.attributes.position.array.set([p[0],p[1],-p[2]],i*3);this.geometry.attributes.tint.array.set([rgb[0]/255,rgb[1]/255,rgb[2]/255,alpha],i*4);this.geometry.attributes.offset.array.set(offset,i*2);}
 face(face,view,alpha=face.alpha,halo=0){
  if(alpha<.0001)return;
  const {points,rgb}=face;
  if(face.outline||halo){
   const pixels=face.outline?face.lineWidth:0;
   for(let i=0;i<points.length;i++){
    if(face.edges?.[i]===false)continue;
    const a=points[i],b=points[(i+1)%points.length],sa=project(a,view),sb=project(b,view),dx=sb.x-sa.x,dy=sb.y-sa.y,len=Math.hypot(dx,dy);
    if(len<.001)continue;
    const half=(pixels+halo)/2,o=[-dy/len*half*2/view.width,-dx/len*half*2/view.height],neg=o.map(v=>-v);
    for(const [p,off] of [[a,o],[a,neg],[b,neg],[a,o],[b,neg],[b,o]])this.vertex(p,rgb,alpha,off);
   }
  }else for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]])this.vertex(p,rgb,alpha);
 }
 end(){this.geometry.setDrawRange(0,this.count);for(const a of Object.values(this.geometry.attributes)){a.clearUpdateRanges();a.addUpdateRange(0,this.count*a.itemSize);a.needsUpdate=true;}this.mesh.visible=this.count>0;}
 dispose(){this.geometry.dispose();this.material.dispose();}
}

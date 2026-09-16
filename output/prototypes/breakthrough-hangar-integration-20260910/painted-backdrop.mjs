import * as THREE from './vendor/three.module.js';
import {scenePyramid} from './integration.mjs';
import {viewAt} from './legacy/geometry.mjs';

// One image, recursively sampled around the same focus. Adjacent scale bands
// blend at their join; advancing a whole cycle gives the identical composition.
export const RECURSIVE_RATIO=4,RECURSIVE_TRAVEL=280*80;
export function advanceBackdropPhase(phase,travelDelta,rate=100){
 if(travelDelta<=0||rate===0)return phase;
 return ((phase+Math.max(0,travelDelta)/RECURSIVE_TRAVEL*rate/100)%1+1)%1;
}
export const PAINTED_FOCUS=[.5,.6]; // image UV: x=50%, y=40% from the top
export function backdropFrame(view,imageAspect=16/9,fixedZoom){
 const target=[view.focus.x/view.width,1-view.focus.y/view.height],r=imageAspect*view.height/view.width;
 const zoom=fixedZoom??Math.max(1,target[0]/PAINTED_FOCUS[0],(1-target[0])/(1-PAINTED_FOCUS[0]),target[1]*r/PAINTED_FOCUS[1],(1-target[1])*r/(1-PAINTED_FOCUS[1]))*1.015;
 const scale=[1/zoom,r/zoom];
 return{scale,offset:PAINTED_FOCUS.map((v,i)=>v-target[i]*scale[i]),target,zoom};
}
const sampling=`
uniform sampler2D paintedMap;
uniform vec2 paintedScale;
uniform vec2 paintedOffset;
uniform vec2 paintedResolution;
uniform vec3 paintedBase;
uniform float paintedStrength;
uniform float paintedEnabled;
uniform float paintedRecursive;
uniform float paintedPhase;
vec3 recursivePaint(vec2 uv){
 const vec2 focus=vec2(.5,.6);
 vec2 p=uv-focus;
 vec2 extent=mix(focus,vec2(1.0)-focus,step(vec2(0.0),p));
 float radius=max(length(p/extent),.000001);
 // Radius goes inward under zoom. log4 wraps the infinite hierarchy into one
 // annulus, so a full turn only changes which identical level is being sampled.
 float band=fract(log(radius)/log(4.0)-paintedPhase);
 float localRadius=pow(4.0,band-1.0);
 float magnify=localRadius/radius;
 vec2 q=p*magnify;
 // Explicit derivatives keep the logarithmic level boundary out of mip choice.
 vec2 dx=vec2(paintedScale.x/paintedResolution.x,0.0)*magnify,dy=vec2(0.0,paintedScale.y/paintedResolution.y)*magnify;
 vec3 outer=textureGrad(paintedMap,focus+q,dx,dy).rgb;
 vec3 inner=textureGrad(paintedMap,focus+q/4.0,dx/4.0,dy/4.0).rgb;
 vec3 color=mix(outer,inner,smoothstep(.68,1.0,localRadius));
 float pixelRadius=length(p/paintedScale*paintedResolution);
 return mix(texture2D(paintedMap,focus).rgb,color,smoothstep(.75,3.0,pixelRadius));
}
vec3 paintedColor(vec2 screenUV){
 vec2 uv=screenUV*paintedScale+paintedOffset;
 vec3 color=paintedRecursive>.5?recursivePaint(uv):texture2D(paintedMap,uv).rgb;
 return mix(paintedBase,color,paintedStrength);
}`;
export function createPaintedBackdrop(texture){
 const uniforms={paintedMap:{value:texture},paintedScale:{value:new THREE.Vector2(1,1)},paintedOffset:{value:new THREE.Vector2()},paintedResolution:{value:new THREE.Vector2(1,1)},paintedBase:{value:new THREE.Color('#080e1b')},paintedStrength:{value:.5},paintedEnabled:{value:0},paintedRecursive:{value:0},paintedPhase:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,fog:false,
  vertexShader:'varying vec2 screenUV; void main(){screenUV=uv;gl_Position=vec4(position.xy,.999,1.0);}',
  fragmentShader:`varying vec2 screenUV; ${sampling}
  void main(){gl_FragColor=vec4(paintedColor(screenUV),1.0);
  #include <colorspace_fragment>
  }`});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.name='painted-distant-environment';mesh.renderOrder=-1000;mesh.frustumCulled=false;mesh.visible=false;
 let frame,patchedCount=0,coverageKey='',coverageZoom;const patched=new WeakSet();
 function connectFog(root){root.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material]){
  if(!m?.fog||patched.has(m))continue;patched.add(m);patchedCount++;
  const original=m.onBeforeCompile,cacheKey=m.customProgramCacheKey();
  m.onBeforeCompile=function(shader,renderer){original.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
   shader.fragmentShader=shader.fragmentShader.replace('#include <fog_pars_fragment>',`#include <fog_pars_fragment>\n${sampling}`);
   // MeshBasic fog is applied after output color conversion. Fade into the same
   // painted pixel, so a fully fogged distant model cannot make a black cutout.
   shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`#ifdef USE_FOG
    vec3 beforePaintedFog=gl_FragColor.rgb;
    #endif
    #include <fog_fragment>
    #ifdef USE_FOG
    if(paintedEnabled>.5&&fogFactor>0.0)gl_FragColor.rgb=mix(beforePaintedFog,linearToOutputTexel(vec4(paintedColor(gl_FragCoord.xy/paintedResolution),1.0)).rgb,fogFactor);
    #endif`);
  };
  m.customProgramCacheKey=()=>cacheKey+'|painted-environment-v2';m.needsUpdate=true;
 }});}
 function update(state,view,resolution){
  const aspect=texture.image?texture.image.width/texture.image.height:16/9;
  const key=[view.width,view.height,aspect,state.clearance,state.depth,state.height,state.apexLow,state.apexHigh,state.apexGain,state.apexLinked,state.obstacleMode,state.originalCameraLinked].join('|');
  if(key!==coverageKey){
   // Reserve enough image for the ENTIRE altitude range once. Re-fitting the
   // current altitude creates a second zoom, whose speed can reverse the flight.
   coverageZoom=Math.max(...[0,1].map(altitude=>{
    const s={...state,altitude},v=viewAt(view.width,view.height,altitude,scenePyramid(s));
    return backdropFrame(v,aspect).zoom;
   }));coverageKey=key;
  }
  frame=backdropFrame(view,aspect,coverageZoom);
  mesh.visible=state.backdrop==='architecture';uniforms.paintedEnabled.value=Number(mesh.visible);uniforms.paintedStrength.value=state.backdropBrightness/100;
  uniforms.paintedRecursive.value=Number(state.backdropMotion==='recursive');uniforms.paintedPhase.value=state.backdropPhase??0;
  uniforms.paintedScale.value.set(...frame.scale);uniforms.paintedOffset.value.set(...frame.offset);uniforms.paintedResolution.value.copy(resolution);
 }
 function snapshot(){return{visible:mesh.visible,frame,strength:uniforms.paintedStrength.value,recursive:Boolean(uniforms.paintedRecursive.value),phase:uniforms.paintedPhase.value,textureId:texture.uuid,meshId:mesh.uuid,patchedMaterials:patchedCount};}
 return{mesh,uniforms,connectFog,update,snapshot};
}

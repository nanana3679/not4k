import * as THREE from './vendor/three.module.js';
import {modules} from './catalog.mjs';
import {createModelLibrary,showModel} from './model-library.mjs';
import {viewAt,advanceMotion,laneAt,planeOffsets,sectionVertices,project} from './legacy/geometry.mjs';
import {TEXTURES,BUILDING_FOG,progressForDepth,readSettings,writeSettings,scenePyramid,matchCamera,progressAt,travelAt,buildingPose,lightLayout,collectFaces} from './integration.mjs';
import {advanceTrails,trailAlpha} from './world-trails.mjs';
import {LightBatch} from './light-batch.mjs';
import {createSurroundings} from './surroundings.mjs';
import {createPaintedBackdrop,advanceBackdropPhase} from './painted-backdrop.mjs';
const $=id=>document.getElementById(id),state=readSettings(location.search,matchMedia('(prefers-reduced-motion: reduce)').matches);
let motion={time:0,travel:travelAt(state.progress,scenePyramid(state)),noteTime:0},lights=lightLayout(state),trails=[],previous=[],faces=[],view,pyramid,pose,ready=false,lost=false,last=0,lastUI=0,autoTime=0,dirty=true;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),textures={},overlay=$('overlay'),pen=overlay.getContext('2d');
scene.background=new THREE.Color('#080e1b');scene.fog=new THREE.Fog('#080e1b',BUILDING_FOG.near,BUILDING_FOG.far);
const core=new LightBatch(),halo=new LightBatch(true),after=new LightBatch(true);
for(const [batch,order] of [[after,1],[halo,2],[core,3]]){batch.mesh.renderOrder=order;scene.add(batch.mesh);}
let renderer,building,surroundings,backdrop,records=new Map();
const drawingSize=new THREE.Vector2();
try{renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;}
catch{$('loading').textContent='그래픽 화면을 열지 못했어요. WebGL을 지원하는 브라우저에서 다시 열어 주세요.';document.body.dataset.error='webgl';}
$('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;$('loading').hidden=false;$('loading').textContent='그래픽 연결이 끊겼어요. 새로고침해 주세요.';});
for(const {metadata:m} of modules){const button=document.createElement('button');button.dataset.module=m.id;button.disabled=true;const id=document.createElement('strong'),name=document.createElement('span');id.textContent=m.id;name.textContent=m.name;button.append(id,name);button.addEventListener('click',()=>change({module:m.id},{reset:false}));$('model-picker').append(button);}
function selectModel(){if(!ready)return;building=showModel(records,state.module,state.building);}
function clearTrails(){trails=[];previous=[];}
function controls(){
 const values={backdropRate:state.backdropRate,backdropBrightness:state.backdropBrightness,altitude:state.altitude*100,speed:state.speed,size:state.size*40,progress:progressAt(motion.travel,scenePyramid(state))*10000,buildingSize:state.buildingSize,trail:state.trail*1000,outline:state.outline*100,secondary:state.secondary*100,density:state.density,height:state.height,apexGain:state.apexGain,nearStretch:state.nearStretch};
 for(const [id,v] of Object.entries(values)){$(id).value=v;$(id+'-value').value=id==='progress'?`${Math.round(v/100)}%`:id==='trail'?`${Math.round(v)} ms`:['height','apexGain','nearStretch'].includes(id)?`${Math.round(v*10)/10}${id==='height'?'':'배'}`:`${Math.round(v)}%`;}
 for(const k of ['building','lanes','auto','guides','art','surroundings','extensions'])$(k).checked=state[k];
 $('context-controls').disabled=state.module!=='E';
 $('backdropMotion').value=state.backdropMotion;$('backdropMotion').disabled=state.backdrop==='none';$('backdropRate').disabled=state.backdrop==='none'||state.backdropMotion==='static';
 $('backdrop').value=state.backdrop;$('backdropBrightness').disabled=state.backdrop==='none';
 $('variant').value=state.variant;$('clearance').value=state.clearance?'1':'0';$('play').textContent=state.running?'일시정지':'재생';$('play').setAttribute('aria-pressed',String(state.running));
 document.querySelectorAll('[data-alt]').forEach(b=>b.setAttribute('aria-pressed',String(Math.abs(state.altitude-Number(b.dataset.alt))<.001)));
 const m=modules.find(m=>m.metadata.id===state.module).metadata;
 $('model-name').textContent=`${m.id} · ${m.name}`;$('model-description').textContent=m.description;
 document.querySelectorAll('[data-module]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.module===state.module)));
 $('flight-label').textContent=`돌파 · ${m.id} · 고도 ${Math.round(state.altitude*100)}% · ${state.running?'재생':'정지'}`;$('mode-label').textContent=state.building?`광원 + ${m.id} ${m.name}`:'광원만 보기';
}
function save(){history.replaceState(null,'',location.pathname+'?'+writeSettings(state,progressAt(motion.travel,scenePyramid(state))));}
function change(update,{reset=true}={}){Object.assign(state,update);if(reset){clearTrails();lights=lightLayout(state);}if('art' in update){for(const r of records.values())r.setArt(state.art);surroundings?.setArt(state.art);}if('module' in update||'building' in update)selectModel();dirty=true;controls();save();}
$('play').addEventListener('click',()=>{last=0;change({running:!state.running},{reset:false});});
$('far').addEventListener('click',()=>{motion.travel=0;change({running:true});});
$('middle').addEventListener('click',()=>{motion.travel=travelAt(progressForDepth(160),scenePyramid(state));change({running:false});});
$('near').addEventListener('click',()=>{motion.travel=travelAt(progressForDepth(44),scenePyramid(state));change({running:false});});
$('progress').addEventListener('input',()=>{motion.travel=travelAt(Number($('progress').value)/10000,scenePyramid(state));change({running:false});});
const factors={altitude:.01,size:.025,outline:.01,secondary:.01,trail:.001};
for(const id of ['altitude','speed','size','buildingSize','trail','outline','secondary','density','height','apexGain','nearStretch'])$(id).addEventListener('input',()=>change({[id]:Number($(id).value)*(factors[id]||1),...(id==='altitude'?{auto:false}:{})},{reset:id!=='speed'}));
for(const id of ['building','lanes','guides','art','surroundings','extensions'])$(id).addEventListener('change',()=>change({[id]:$(id).checked},{reset:false}));
$('backdrop').addEventListener('change',()=>change({backdrop:$('backdrop').value},{reset:false}));
for(const id of ['backdropBrightness','backdropRate'])$(id).addEventListener('input',()=>change({[id]:Number($(id).value)},{reset:false}));
$('backdropMotion').addEventListener('change',()=>change({backdropMotion:$('backdropMotion').value},{reset:false}));
$('auto').addEventListener('change',()=>{autoTime=Math.acos(1-2*state.altitude)*6/Math.PI;change({auto:$('auto').checked},{reset:false});});
$('variant').addEventListener('change',()=>change({variant:$('variant').value}));$('clearance').addEventListener('change',()=>change({clearance:$('clearance').value==='1'}));
for(const b of document.querySelectorAll('[data-alt]'))b.addEventListener('click',()=>change({altitude:Number(b.dataset.alt),auto:false}));
window.addEventListener('popstate',()=>{Object.assign(state,readSettings(location.search));motion.travel=travelAt(state.progress,scenePyramid(state));change(state);});
function resize(){if(!renderer)return;const w=$('scene').clientWidth,h=$('scene').clientHeight;renderer.setSize(w,h,false);overlay.width=Math.round(w);overlay.height=Math.round(h);clearTrails();dirty=true;}
new ResizeObserver(resize).observe($('scene'));
function drawOverlay(){
 const w=overlay.width,h=overlay.height;pen.clearRect(0,0,w,h);
 if(state.guides){pen.strokeStyle='#6386a75c';pen.lineWidth=.6;for(const d of planeOffsets(pyramid,state.planes)){const pts=sectionVertices(d,pyramid).map(p=>project(p,view));pen.beginPath();pen.moveTo(pts[1].x,pts[1].y);pen.lineTo(pts[0].x,pts[0].y);pen.lineTo(pts[2].x,pts[2].y);pen.stroke();}pen.fillStyle='#ecd5a5';pen.beginPath();pen.arc(view.focus.x,view.focus.y,3,0,Math.PI*2);pen.fill();}
 if(!state.lanes)return;const lane=laneAt(w,h),cw=lane.width/4;
 pen.fillStyle='rgba(4,9,17,.9)';pen.fillRect(lane.left,lane.top,lane.width,h-lane.top);pen.strokeStyle='#a6c1dc44';pen.lineWidth=1;
 for(let i=0;i<=4;i++){const x=lane.left+cw*i;pen.beginPath();pen.moveTo(x,lane.top);pen.lineTo(x,h);pen.stroke();}
 for(let i=0;i<13;i++){const phase=(motion.noteTime*.72+i*.173)%1,column=(i*7+Math.floor(i/3))%4;pen.fillStyle=i%5===0?'#ffd39e':'#89c9e0';pen.fillRect(lane.left+column*cw+3,lane.top+phase*(h-lane.top),cw-6,5);}
 pen.fillStyle='#e8bfac';pen.fillRect(lane.left,lane.hit,lane.width,2);
}
function render(dt=0){
 pyramid=scenePyramid(state);view=viewAt(overlay.width,overlay.height,state.altitude,pyramid);matchCamera(camera,view);
 pose=buildingPose(state,pyramid,motion.travel,building.dimensions);const scale=pose.scale,center=building.center;
 building.group.scale.setScalar(scale);building.group.position.set(pose.center[0]-center.x*scale,pose.center[1]-center.y*scale,-pose.center[2]-center.z*scale);building.group.visible=state.building&&pose.visible;
 surroundings.update(state,pyramid,motion.travel,building);
 backdrop.update(state,view,renderer.getDrawingBufferSize(drawingSize));
 faces=collectFaces(lights,motion.travel,state,pyramid,view);trails=advanceTrails(trails,previous,faces,motion.time,state.trail,dt);previous=faces;
 core.begin();halo.begin();after.begin();
 for(const f of trails)after.face(f,view,trailAlpha(f,motion.time,state.trail));
 for(const f of faces){core.face(f,view);halo.face(f,view,f.alpha*.07,3);halo.face(f,view,f.alpha*.025,8);}
 core.end();halo.end();after.end();renderer.render(scene,camera);drawOverlay();dirty=false;
}
function tick(now){const dt=last?Math.max(0,(now-last)/1000):0;last=now;
 if(ready&&!lost&&!document.hidden){const old=motion.time,oldTravel=motion.travel;motion=advanceMotion(motion,dt,state.speed,state.running);const elapsed=motion.time-old;
  if(state.backdrop==='architecture'&&state.backdropMotion==='recursive')state.backdropPhase=advanceBackdropPhase(state.backdropPhase,motion.travel-oldTravel,state.backdropRate);
  if(state.auto&&state.running){autoTime+=elapsed;state.altitude=(1-Math.cos(autoTime*Math.PI/6))/2;}
  if(dirty||elapsed>0)render(elapsed);if(now-lastUI>100){controls();lastUI=now;}
 }requestAnimationFrame(tick);}
function freezeHidden(){last=0;clearTrails();dirty=true;}document.addEventListener('visibilitychange',freezeHidden);
async function load(){if(!renderer)return;try{const loader=new THREE.TextureLoader();await Promise.all(TEXTURES.map(async id=>{const t=await loader.loadAsync(`assets/${id}.png`);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures[id]=t;}));
 records=createModelLibrary(textures);for(const r of records.values()){r.setArt(state.art);scene.add(r.group);}building=showModel(records,state.module,state.building);
 surroundings=createSurroundings(textures);surroundings.setArt(state.art);scene.add(surroundings.group);
 const paintedTexture=await loader.loadAsync('assets/distant-architecture.png');paintedTexture.colorSpace=THREE.SRGBColorSpace;
 backdrop=createPaintedBackdrop(paintedTexture);backdrop.connectFog(scene);scene.add(backdrop.mesh);
 document.querySelectorAll('[data-module]').forEach(b=>b.disabled=false);
 autoTime=Math.acos(1-2*state.altitude)*6/Math.PI;ready=true;resize();render();$('loading').hidden=true;$('play').disabled=false;document.body.dataset.ready='true';
 const response=await fetch('share.json');if(response.ok){const s=await response.json();$('expiry').textContent=`링크 만료 · ${new Date(s.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} KST`;}
 }catch(e){$('loading').textContent=`불러오지 못했어요. 새로고침해 주세요. (${e.message})`;document.body.dataset.error='assets';}}
// Read-only test inspection; no game state or private files exposed.
window.flightStudy={snapshot(){return{...state,ready,paintedBackdrop:backdrop?.snapshot(),space:surroundings?.snapshot(),fog:{near:scene.fog.near,far:scene.fog.far},motion:{...motion},progress:progressAt(motion.travel,scenePyramid(state)),pyramid,pose,view,objectId:building?.group.uuid,visibleModels:[...records.values()].filter(r=>r.group.visible).map(r=>r.metadata.id),modelDimensions:building?.dimensions,modelCount:records.size,geometryIds:building?.group.children.map(m=>m.geometry.uuid),textures:Object.values(textures).map(t=>t.uuid),lightIds:lights.map(l=>l.id),colors:faces.map(f=>[f.id,f.rgb]),faceCount:faces.length,trailCount:trails.length,vertices:{core:core.count,trail:after.count},calls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles,geometries:renderer?.info.memory.geometries,cameraQuaternion:camera.quaternion.toArray(),depthTest:[core,halo,after].every(b=>b.material.depthTest&&!b.material.depthWrite)};},
 probeDepth(kind='building'){
  // Test the selected actual solids, the real shared projection, and the same light material.
  const testScene=new THREE.Scene();testScene.background=scene.background;testScene.fog=scene.fog;
  const targetGroup=kind==='extension'?surroundings.extension.group:kind==='station'?surroundings.station.group:building.group;
  const copy=targetGroup.clone(true);copy.visible=true;testScene.add(copy);testScene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();let sample;
  for(let y=.05;y<.98&&!sample;y+=.04)for(let x=.02;x<.48&&!sample;x+=.04){const px=Math.floor(x*view.width),py=Math.floor(y*view.height);ray.setFromCamera(new THREE.Vector2((px+.5)/view.width*2-1,1-(py+.5)/view.height*2),camera);const hits=ray.intersectObject(copy,true).filter(h=>h.object.isMesh);if(hits.length)sample={x:px,y:py,hit:hits[0]};}
  if(!sample)return {error:'No building surface in view'};
  const target=new THREE.WebGLRenderTarget(view.width,view.height),batch=new LightBatch();batch.mesh.renderOrder=3;testScene.add(batch.mesh);
  const read=()=>{renderer.setRenderTarget(target);renderer.render(testScene,camera);const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,sample.x,view.height-1-sample.y,1,1,pixel);return [...pixel];};
  const baseline=read(),z=-sample.hit.point.z;
  function draw(depth,alpha=1){const pts=[[-5,-5],[5,-5],[5,5],[-5,5]].map(([dx,dy])=>[(sample.x+dx-view.width/2)*(depth+view.back)/view.focal,view.cameraHeight-(sample.y+dy-view.principalY)*(depth+view.back)/view.focal,depth]);batch.begin();batch.face({points:pts,rgb:[0,255,255],alpha,outline:false},view);batch.end();return read();}
  const behind=draw(z+8),front=draw(Math.max(-view.back+2.1,z-8));batch.material.blending=THREE.AdditiveBlending;const behindTrail=draw(z+8,.5),frontTrail=draw(Math.max(-view.back+2.1,z-8),.5);
  renderer.setRenderTarget(null);target.dispose();batch.dispose();dirty=true;return{baseline,behind,front,behindTrail,frontTrail,sample:{x:sample.x,y:sample.y,z},solid:sample.hit.object.name};
 }};
controls();resize();requestAnimationFrame(tick);load();

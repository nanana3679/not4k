import {it,expect} from 'vitest';
import * as THREE from './vendor/three.module.js';
import {readSettings,writeSettings,scenePyramid} from './integration.mjs';
import {viewAt} from './legacy/geometry.mjs';
import {PAINTED_FOCUS,backdropFrame,createPaintedBackdrop,advanceBackdropPhase,RECURSIVE_TRAVEL} from './painted-backdrop.mjs';

it('기존 링크는 검은 배경을 유지하고 먼 건축 배경·밝기65%는 URL로 복원한다',()=>{
 expect(readSettings().backdrop).toBe('none');
 const r=readSettings(writeSettings(readSettings('backdrop=architecture&backdropBrightness=65'),.72));
 expect([r.backdrop,r.backdropBrightness]).toEqual(['architecture',65]);
});
it('배경 밝기-20·200·NaN은 각각0·100·50으로 제한하고 알 수 없는 그림은 끈다',()=>{
 expect([-20,200,'NaN'].map(n=>readSettings('backdropBrightness='+n).backdropBrightness)).toEqual([0,100,50]);
 expect(readSettings('backdrop=unknown').backdrop).toBe('none');
});
for(const clearance of [0,1])for(const altitude of [0,.5,1])it(`근접${clearance}·고도${altitude*100}%에서 그림의 소실점을 광원 A에 맞추고 화면 가장자리에 빈 띠가 없다`,()=>{
 const s=readSettings(`altitude=${altitude}&clearance=${clearance}`),v=viewAt(1440,810,altitude,scenePyramid(s)),f=backdropFrame(v);
 for(let i=0;i<2;i++){
  expect(f.target[i]*f.scale[i]+f.offset[i]).toBeCloseTo(PAINTED_FOCUS[i],10);
  expect(f.offset[i]).toBeGreaterThanOrEqual(0);
  expect(f.offset[i]+f.scale[i]).toBeLessThanOrEqual(1);
 }
});
it('원본 그림의16:9와 다른 화면비에서도 그림을 찌그러뜨리지 않고 덮는다',()=>{
 const v={width:800,height:800,focus:{x:400,y:320}},f=backdropFrame(v,16/9);
 expect(f.scale[1]/f.scale[0]).toBeCloseTo(16/9);
 expect(f.offset[1]+f.scale[1]).toBeLessThanOrEqual(1);
});
it('배경은 단일2삼각형으로 그리며 깊이를 기록하지 않아 가까운 건축을 가리지 않는다',()=>{
 const b=createPaintedBackdrop(new THREE.Texture());
 expect(b.mesh.geometry.index.count).toBe(6);expect(b.mesh.material.depthWrite).toBe(false);expect(b.mesh.renderOrder).toBeLessThan(0);
});
it('E→A 선택과 배경 밝기 변경은 같은 그림·메시를 재사용하고 A에서도 표시한다',()=>{
 const b=createPaintedBackdrop(new THREE.Texture()),s=readSettings('backdrop=architecture&backdropBrightness=65'),v=viewAt(1440,810,s.altitude,scenePyramid(s)),r=new THREE.Vector2(1440,810);
 b.update(s,v,r);const original=b.snapshot();b.update({...s,module:'A',backdropBrightness:20},v,r);
 expect(b.snapshot()).toMatchObject({meshId:original.meshId,textureId:original.textureId,visible:true,strength:.2});
 b.update({...s,backdrop:'none'},v,r);expect(b.snapshot().visible).toBe(false);
});
it('원경 안개는 배경 그림 픽셀로 이어지고 공유 재질을 두 번 연결해도 중복되지 않는다',()=>{
 const b=createPaintedBackdrop(new THREE.Texture()),group=new THREE.Group(),m=new THREE.MeshBasicMaterial();group.add(new THREE.Mesh(new THREE.BoxGeometry(),m),new THREE.Mesh(new THREE.BoxGeometry(),m));
 b.connectFog(group);b.connectFog(group);expect(b.snapshot().patchedMaterials).toBe(1);
 const shader={uniforms:{},fragmentShader:'#include <fog_pars_fragment>\nvoid main(){\n#include <fog_fragment>\n}'};m.onBeforeCompile(shader,{});
 expect(shader.uniforms.paintedMap).toBe(b.uniforms.paintedMap);
 expect(shader.fragmentShader).toContain('paintedColor(gl_FragCoord.xy/paintedResolution)');
 expect(shader.fragmentShader).toContain('paintedEnabled>.5&&fogFactor>0.0');
});

it('새 원경 기본은 밝기50%·재귀 확대·확대 속도100%이며 기존 명시 밝기는 유지한다',()=>{
 const s=readSettings('backdrop=architecture');expect([s.backdropBrightness,s.backdropMotion,s.backdropRate]).toEqual([50,'recursive',100]);expect(readSettings('backdropBrightness=70').backdropBrightness).toBe(70);
});
it('전진량22400은1000%속도80초에 대응하고 재귀 한 주기 후 같은 위상으로 돌아온다',()=>{
 expect(RECURSIVE_TRAVEL/280).toBe(80);expect(advanceBackdropPhase(.23,RECURSIVE_TRAVEL)).toBeCloseTo(.23);
});
it('80초 주기의1초는 위상1/80만큼 전진하고 확대200%는 두 배다',()=>{
 expect(advanceBackdropPhase(0,280)).toBeCloseTo(1/80);expect(advanceBackdropPhase(0,280,200)).toBeCloseTo(2/80);
});
it('전진량0이나 확대 속도0%에서는 위상이 멈추며 음수 전진은 역주행하지 않는다',()=>{
 expect(advanceBackdropPhase(.4,0)).toBe(.4);expect(advanceBackdropPhase(.4,280,0)).toBe(.4);expect(advanceBackdropPhase(.4,-280)).toBe(.4);
});
it('확대99.99%에서 주기를 넘어도0~1 위상에 머물고10000주기에서도 값이 커지지 않는다',()=>{
 expect(advanceBackdropPhase(.9999,280)).toBeCloseTo(.0124);expect(advanceBackdropPhase(.25,RECURSIVE_TRAVEL*10000)).toBeCloseTo(.25);
});
it('그림 고정·확대 속도75%·재귀 위상.83은 URL로 복원하며 잘못된 속도는0~300으로 제한한다',()=>{
 const s=readSettings(writeSettings(readSettings('backdropMotion=static&backdropRate=75&backdropPhase=.83'),.72));expect([s.backdropMotion,s.backdropRate,s.backdropPhase]).toEqual(['static',75,.83]);expect(readSettings('backdropPhase=1').backdropPhase).toBe(0);expect(readSettings('backdropRate=900').backdropRate).toBe(300);expect(readSettings('backdropRate=-9').backdropRate).toBe(0);
});

it('고도 반복12초 동안 재귀 확대는80초4배 속도를 유지하며 축소 구간이 없다',()=>{
 const b=createPaintedBackdrop(new THREE.Texture()),r=new THREE.Vector2(1440,810),ratios=[];let previous;
 for(let step=0;step<=1200;step++){
  const t=step/100,a=(1-Math.cos(t*Math.PI/6))/2,s=readSettings('backdrop=architecture&altitude='+a);s.backdropPhase=t/80;
  b.update(s,viewAt(1440,810,a,scenePyramid(s)),r);const z=b.snapshot().frame.zoom*4**s.backdropPhase;
  if(previous!==undefined)ratios.push(z/previous);
  previous=z;
 }
 expect(Math.min(...ratios)).toBeGreaterThan(1);
 expect(Math.max(...ratios)-Math.min(...ratios)).toBeLessThan(1e-10);
 expect(ratios[0]).toBeCloseTo(4**(.01/80),10);
});
it('정지한 채 고도0→50→100%를 바꿔도 배경 배율은 고정하고 소실점 위치만 이동한다',()=>{
 const b=createPaintedBackdrop(new THREE.Texture()),r=new THREE.Vector2(1440,810),frames=[];
 for(const a of [0,.5,1]){const s=readSettings('backdrop=architecture&altitude='+a);b.update(s,viewAt(1440,810,a,scenePyramid(s)),r);frames.push(b.snapshot().frame);}
 expect(new Set(frames.map(f=>f.zoom)).size).toBe(1);expect(new Set(frames.map(f=>f.target[1])).size).toBe(3);
});
it('고정 배율은 최신·이전 시점의 극단 A 이동10배·깊이100에서도 고도 전체를 빈 띠 없이 덮는다',()=>{
 const b=createPaintedBackdrop(new THREE.Texture()),r=new THREE.Vector2(1440,810);
 for(const clearance of [0,1])for(const a of [0,.1,.5,.9,1]){
  const s=readSettings(`backdrop=architecture&altitude=${a}&clearance=${clearance}&apexGain=10&depth=100`),v=viewAt(1440,810,a,scenePyramid(s));b.update(s,v,r);const f=b.snapshot().frame;
  for(let i=0;i<2;i++){expect(f.offset[i]).toBeGreaterThanOrEqual(-1e-12);expect(f.offset[i]+f.scale[i]).toBeLessThanOrEqual(1+1e-12);expect(f.target[i]*f.scale[i]+f.offset[i]).toBeCloseTo(PAINTED_FOCUS[i],10);}
 }
});
it('깊이420→100과 화면비16:9→1:1 변경 시 필요한 여백만 다시 계산하고 같은 배경 메시를 재사용한다',()=>{
 const b=createPaintedBackdrop(new THREE.Texture()),r=new THREE.Vector2(1440,810),frames=[];
 for(const [depth,w,h] of [[420,1440,810],[100,1440,810],[100,800,800]]){
  const s=readSettings(`backdrop=architecture&clearance=0&altitude=.5&depth=${depth}`);b.update(s,viewAt(w,h,.5,scenePyramid(s)),r);frames.push(b.snapshot());
 }
 expect(frames[1].frame.zoom).toBeGreaterThan(frames[0].frame.zoom);expect(frames[2].frame.zoom).not.toBe(frames[1].frame.zoom);expect(new Set(frames.map(f=>f.meshId)).size).toBe(1);
});

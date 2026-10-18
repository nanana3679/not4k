import {expect,it} from 'vitest';
import * as THREE from './vendor/three.module.js';
import {createPassageBlueprint,passagePose,passageProgressAt,passageProgressForDepth,passageTravelAt,PASSAGE_STOPS} from './passage.mjs';
import {readSettings,writeSettings,scenePyramid,matchCamera} from './integration.mjs';
import {buildModel} from './render-model.mjs';
import {viewAt} from './legacy/geometry.mjs';
const blueprint=createPassageBlueprint();
const bounds=part=>({min:part.position.map((v,i)=>v-part.size[i]/2),max:part.position.map((v,i)=>v+part.size[i]/2)});
const touches=(a,b)=>a.min.every((v,i)=>v<=b.max[i]+1e-6&&a.max[i]>=b.min[i]-1e-6);

it('시설의 x=-6~6・고도-53~43・깊이-320~320 비행 공간에는 벽·층·사선 보가 들어오지 않는다',()=>{
 const model=buildModel(blueprint,{}),e=blueprint.flightEnvelope;
 const volume=new THREE.Box3(new THREE.Vector3(...e.min),new THREE.Vector3(...e.max));
 for(const mesh of model.group.children)expect(new THREE.Box3().setFromObject(mesh).intersectsBox(volume),mesh.name).toBe(false);
});
it('고도0~100%의 모든 중간값에서 시점은 y=-50~40으로 이동하며 좌우 이동 없이 빈 공간을 통과한다',()=>{
 for(let i=0;i<=100;i++){
  const state=readSettings(`study=passage&altitude=${i/100}`),p=scenePyramid(state),view=viewAt(1280,720,state.altitude,p),camera=new THREE.PerspectiveCamera();matchCamera(camera,view);
  expect(camera.position.x).toBe(0);expect(camera.position.y).toBeCloseTo(-50+.9*i);
  expect(camera.position.y-3).toBeGreaterThanOrEqual(blueprint.flightEnvelope.min[1]);expect(camera.position.y+3).toBeLessThanOrEqual(blueprint.flightEnvelope.max[1]);
 }
});
it('저고도는 중앙 적재동 사이32 폭과 하부 데크 위6 여유를 지나며 중간·높은 고도는 적재동 위로 올라간다',()=>{
 const left=blueprint.boxes.find(p=>p.id==='west-inner-cargo-bank'),right=blueprint.boxes.find(p=>p.id==='east-inner-cargo-bank');
 expect(bounds(right).min[0]-bounds(left).max[0]).toBe(32);
 expect(scenePyramid(readSettings('study=passage&altitude=0')).cameraHeight+56).toBe(6);
 for(const altitude of [.5,1])expect(scenePyramid(readSettings(`study=passage&altitude=${altitude}`)).cameraHeight).toBeGreaterThan(Math.max(bounds(left).max[1],bounds(right).max[1]));
});
it('전체 깊이640의 시설은 긴 단일 천장·바닥 대신 분리된 상하 연결층3개씩을 가진다',()=>{
 const upper=blueprint.boxes.filter(p=>p.id.endsWith('-bridge')),lower=blueprint.boxes.filter(p=>p.id.endsWith('-lower-transfer'));
 expect(upper).toHaveLength(3);expect(lower).toHaveLength(3);
 expect(upper.every(p=>p.size[2]<60)).toBe(true);expect(lower.every(p=>p.size[2]<80)).toBe(true);
 expect(new Set(upper.map(p=>p.position[1])).size).toBe(3);
});
it('큰 몸통·연결 교량·작업층·표시등은 양쪽 서비스 축까지 이어지고 독립 상자로 떠 있지 않는다',()=>{
 const parts=blueprint.boxes.map(p=>({id:p.id,...bounds(p)})),reached=parts.filter(p=>p.id.endsWith('-service-spine')),remaining=new Set(parts.filter(p=>!reached.includes(p)));
 for(let i=0;i<parts.length&&remaining.size;i++)for(const part of remaining)if(reached.some(r=>touches(r,part))){reached.push(part);remaining.delete(part);}
 expect([...remaining].map(p=>p.id)).toEqual([]);
});
it('접근650→입구320→내부0→출구-350을 선택하면 위치를 정확히 복원하고 시설 크기는 항상100%다',()=>{
 for(const [stage,depth] of Object.entries(PASSAGE_STOPS)){
  const progress=passageProgressForDepth(depth),travel=passageTravelAt(progress),pose=passagePose(travel);
  expect(pose.center).toEqual([0,0,expect.closeTo(depth,6)]);expect(pose.scale,stage).toBe(1);expect(passageProgressAt(travel)).toBeCloseTo(progress);
  expect(pose.stage).toBe({approach:'접근',entry:'입구',inside:'시설 내부',exit:'출구 너머'}[stage]);
 }
});
it('전진량14에서 시설도 기존 광원 연출과 같은13.384만큼 접근한다',()=>{
 expect(passagePose(100).center[2]-passagePose(114).center[2]).toBeCloseTo(13.384);
});
it('반복 출발1800에서는 가장 가까운 면도 안개1400 너머이며 끝-800에서는 시설 전체가 카메라 뒤다',()=>{
 const box=new THREE.Box3().setFromObject(buildModel(blueprint,{}).group);
 expect(passagePose(0).center[2]-box.max.z+8).toBeGreaterThan(1400);
 const end=passagePose(passageTravelAt(.999999)).center[2];expect(-end+box.min.z).toBeGreaterThan(8);
});
it('시설 통과 링크의 고도·진행·표면·정지를 URL로 복원하고 기존 링크는 A~H 비교로 열린다',()=>{
 const state=readSettings('study=passage&altitude=.7&paused=1&art=0'),progress=passageProgressForDepth(0),restored=readSettings(writeSettings(state,progress));
 expect(restored).toMatchObject({study:'passage',altitude:.7,running:false,art:false,progress});
 expect(readSettings().study).toBe('modules');expect(readSettings('study=unknown').study).toBe('modules');
});

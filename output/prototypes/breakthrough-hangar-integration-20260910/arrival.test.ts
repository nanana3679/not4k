import {it,expect} from 'vitest';
import {BUILDING_FOG,readSettings,scenePyramid,travelAt,buildingPose} from './integration.mjs';
import {viewAt,project} from './legacy/geometry.mjs';
const s=readSettings(),p=scenePyramid(s),view=viewAt(1440,810,s.altitude,p);
const heightAt=(pose)=>{const [x,y,z]=pose.center,scale=pose.scale;const ys=[];for(const dy of [-29.205,29.205])for(const dz of [-20.5,20.5])ys.push(project([x,y+dy*scale,z+dz*scale],view).y);return Math.max(...ys)-Math.min(...ys);};

it('처음 열면 E는 화면 높이8% 이하의 먼 모습으로 시작한다',()=>{const pose=buildingPose(s,p,travelAt(s.progress,p));expect(heightAt(pose)/view.height).toBeLessThan(.08);});
it('속도1000% 한 주기에서 높이12% 이하·안개 대비15% 이상의 원거리 접근이1초 이상 보인다',()=>{const {near,far}=BUILDING_FOG;let seconds=0;const dt=1/120;for(let travel=0;travel<travelAt(1,p);travel+=280*dt){const pose=buildingPose(s,p,travel);if(!pose.visible||pose.center[2]<40)continue;const k=Math.max(0,Math.min(1,(pose.center[2]+8-near)/(far-near))),contrast=1-k*k*(3-2*k);if(heightAt(pose)/view.height<.12&&contrast>=.15)seconds+=dt;}expect(seconds).toBeGreaterThanOrEqual(1);});

import {it,expect} from 'vitest';
import {LightBatch} from './light-batch.mjs';
const view={width:800,height:450,focal:495,back:8,cameraHeight:12,principalY:180};
const face={points:[[0,0,10],[1,0,10],[0,1,10]],rgb:[255,80,30],alpha:1,outline:false,lineWidth:2};
it('광원·잔상 재질은 건물 깊이를 검사하고 자기 깊이는 기록하지 않는다',()=>{for(const additive of [false,true]){const b=new LightBatch(additive);expect(b.material.depthTest).toBe(true);expect(b.material.depthWrite).toBe(false);b.dispose();}});
it('삼각형은3정점으로 그리고 old +Z는 Three -Z로 변환한다',()=>{const b=new LightBatch();b.begin();b.face(face,view);b.end();expect(b.count).toBe(3);expect(b.geometry.attributes.position.array[2]).toBe(-10);b.dispose();});
it('열린 윤곽선은 지정한 두 변만12정점으로 그리고 내부를 채우지 않는다',()=>{const b=new LightBatch();b.begin();b.face({...face,outline:true,edges:[true,false,true]},view);b.end();expect(b.count).toBe(12);b.dispose();});
it('다음 프레임의 빈 광원 목록은 기존 버퍼를 재사용하고 그리기 범위를0으로 만든다',()=>{const b=new LightBatch(),id=b.geometry.uuid;b.begin();b.face(face,view);b.end();b.begin();b.end();expect(b.geometry.uuid).toBe(id);expect(b.geometry.drawRange.count).toBe(0);expect(b.mesh.visible).toBe(false);b.dispose();});

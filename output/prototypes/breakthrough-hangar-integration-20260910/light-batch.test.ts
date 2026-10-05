import {it,expect} from 'vitest';
import {LightBatch} from './light-batch.mjs';
const view={width:800,height:450,focal:495,back:8,cameraHeight:12,principalY:180};
const face={points:[[0,0,10],[1,0,10],[0,1,10]],rgb:[255,80,30],alpha:1,outline:false,lineWidth:2};
it('광원·잔상 재질은 건물 깊이를 검사하고 자기 깊이는 기록하지 않는다',()=>{for(const additive of [false,true]){const b=new LightBatch(additive);expect(b.material.depthTest).toBe(true);expect(b.material.depthWrite).toBe(false);b.dispose();}});
it('삼각형은3정점으로 그리고 old +Z는 Three -Z로 변환한다',()=>{const b=new LightBatch();b.begin();b.face(face,view);b.end();expect(b.count).toBe(3);expect(b.geometry.attributes.position.array[2]).toBe(-10);b.dispose();});
it('열린 윤곽선은 지정한 두 변만12정점으로 그리고 내부를 채우지 않는다',()=>{const b=new LightBatch();b.begin();b.face({...face,outline:true,edges:[true,false,true]},view);b.end();expect(b.count).toBe(12);b.dispose();});
it('다음 프레임의 빈 광원 목록은 기존 버퍼를 재사용하고 그리기 범위를0으로 만든다',()=>{const b=new LightBatch(),id=b.geometry.uuid;b.begin();b.face(face,view);b.end();b.begin();b.end();expect(b.geometry.uuid).toBe(id);expect(b.geometry.drawRange.count).toBe(0);expect(b.mesh.visible).toBe(false);b.dispose();});
it('채움·열린 윤곽선·3px 발광 면과 오프셋 정점은 버퍼 재사용 전과 같은 49정점을 쓴다',()=>{
 const v={width:800,height:450,focal:495,back:8,cameraHeight:12,principalY:180};
 const f={points:[[0,0,10],[1.5,.25,9.5],[1.25,1.75,11],[-.5,1,10.25]],rgb:[255,80,30],alpha:.8,outline:false,lineWidth:1.7};
 const b=new LightBatch(true);b.begin();
 b.face(f,v);b.face({...f,outline:true,edges:[true,false,true,true]},v);b.face(f,v,f.alpha*.07,3);b.vertex([2,3,4],[10,20,30],.5,[.25,-.5]);
 b.end();
 const at=b.geometry.attributes;let h1=0x811c9dc5,h2=(0x01000193^0x5bd1e995)>>>0;
 for(const [array,size] of [[at.position.array,3],[at.tint.array,4],[at.offset.array,2]] as const)for(const byte of new Uint8Array(array.buffer,array.byteOffset,b.count*size*4)){h1=Math.imul(h1^byte,16777619)>>>0;h2=Math.imul(h2^byte,0x5bd1e995)>>>0;h2=(h2^(h2>>>13))>>>0;}
 expect(b.count).toBe(49);
 expect(h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0')).toBe('f761b3111a171c2b');
 expect(Array.from(at.offset.array.subarray(96,98))).toEqual([.25,-.5]);
 b.dispose();
});

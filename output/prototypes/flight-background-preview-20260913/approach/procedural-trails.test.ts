import { describe, expect, it } from 'vitest';
import { proceduralTrailBatchStyle, proceduralTrailGlowAlpha, proceduralTrailQuality, proceduralTrailSegments, proceduralTrailStrength } from './procedural-trails.mjs';

const light = (id: string, x: number, y: number) => ({
  id,
  x,
  y,
  size: 1,
  alpha: 1,
  kind: 'point',
  base: { depth: 180 },
});

const view = { center: 200, horizon: 120, worldSpeed: 180 };

describe('절대 고도에 비례하는 절차적 잔광', () => {
  it('절대 고도 80%는 20%보다 잔광 강도가 크다', () => {
    expect(proceduralTrailStrength(.8)).toBeGreaterThan(proceduralTrailStrength(.2));
  });

  it('절대 고도가 0% 미만 또는 100% 초과이면 잔광 강도는 각각 경계값으로 고정된다', () => {
    expect(proceduralTrailStrength(-1)).toBe(proceduralTrailStrength(0));
    expect(proceduralTrailStrength(2)).toBe(proceduralTrailStrength(1));
  });

  it('광원 720개는 처음과 마지막을 포함한 최대 120개 절차적 선분으로 제한된다', () => {
    const lights = Array.from({ length: 720 }, (_, index) => ({...light(String(index), index, index / 2),lod:'point'}));
    const segments = proceduralTrailSegments(lights, view, { altitude: .8 });
    expect(segments).toHaveLength(proceduralTrailQuality.maxSegments);
    expect(segments[0].id).toBe('0');
    expect(segments.at(-1)?.id).toBe('719');
  });

  it('현재 광원이 없으면 절차적 잔광 선분도 만들지 않는다', () => {
    expect(proceduralTrailSegments([], view, { altitude: .8 })).toEqual([]);
  });

  it('원거리 point 200개와 근거리 detail 20개가 있으면 120개 잔광에 detail 20개를 모두 포함한다', () => {
    const distant=Array.from({length:200},(_,index)=>({...light(`point-${index}`,index,index/2),lod:'point'}));
    const detailed=Array.from({length:20},(_,index)=>({...light(`detail-${index}`,index,index/2),lod:'detail'}));
    const segments=proceduralTrailSegments([...distant,...detailed],view,{altitude:.8});
    expect(segments).toHaveLength(120);
    expect(segments.filter(segment=>segment.id.startsWith('detail-'))).toHaveLength(20);
  });

  it('잔광 예산이 3개이면 원거리 point보다 depth 40·80·120의 가까운 detail을 먼저 남긴다', () => {
    const distant=Array.from({length:20},(_,index)=>({...light(`point-${index}`,index,index/2),lod:'point'}));
    const detailed=[240,80,160,40,120].map(depth=>({...light(`detail-${depth}`,depth,depth/2),lod:'detail',base:{depth}}));
    const segments=proceduralTrailSegments([...distant,...detailed],view,{altitude:.8,maxSegments:3});
    expect(segments.map(segment=>segment.id)).toEqual(['detail-40','detail-80','detail-120']);
  });

  it('잔광 굵기 0.7·1.4·1.5·5는 0.5px 단위로, 밝기 0.23·0.77은 0.2 단위로 보존한다', () => {
    expect(proceduralTrailBatchStyle({size:.7,alpha:.23})).toEqual({width:.5,alpha:.2});
    expect(proceduralTrailBatchStyle({size:1.4,alpha:.77})).toEqual({width:1.5,alpha:.8});
    expect(proceduralTrailBatchStyle({size:1.5,alpha:.6})).toEqual({width:1.5,alpha:.6});
    expect(proceduralTrailBatchStyle({size:5,alpha:1})).toEqual({width:5,alpha:1});
  });

  it('minimal은 자연스러운 본선 한 겹만 그리고 reduced 이상은 바깥 번짐 13%를 더한다', () => {
    expect(proceduralTrailGlowAlpha('minimal')).toBe(0);
    expect(proceduralTrailGlowAlpha('reduced')).toBe(.13);
    expect(proceduralTrailGlowAlpha('high')).toBe(.13);
  });

});

import { describe, expect, it } from 'vitest';
import {
  adaptiveQualityState,
  advanceAdaptiveQuality,
  capDistantLights,
  renderPixelRatio,
  renderQualityProfile,
  screenSpaceLod,
  shouldProjectLight,
} from './render-quality.mjs';

describe('화면 크기에 따른 원거리 광원 LOD', () => {
  it('GPU 배치는 0.01px² 원거리 광원도 원래 panel로 유지하고 500개 예산을 자르지 않는다', () => {
    expect(screenSpaceLod(.01, 'panel/42', 'gpu')).toBe('detail');
    expect(shouldProjectLight('panel/42', 1200, 'gpu')).toBe(true);
    const lights = Array.from({length:500},(_,index)=>({id:String(index),stableId:String(index),lod:'detail'}));
    expect(capDistantLights(lights,'gpu')).toHaveLength(500);
  });

  it('화면 면적 1.25px² 이상인 광원은 모든 품질 단계에서 원래 면으로 유지한다', () => {
    for (const quality of ['high', 'balanced', 'reduced']) {
      expect(screenSpaceLod(1.25, 'panel/42', quality)).toBe('detail');
      expect(screenSpaceLod(12, 'panel/42', quality)).toBe('detail');
    }
  });

  it('화면 면적 0.5px²인 같은 광원은 프레임이 바뀌어도 point 또는 hidden 결정이 고정된다', () => {
    const first = screenSpaceLod(.5, 'panel/42', 'high');
    expect(['point', 'hidden']).toContain(first);
    for (let frame = 0; frame < 120; frame++) {
      expect(screenSpaceLod(.5, 'panel/42', 'high')).toBe(first);
    }
  });

  it('high → balanced → reduced → minimal 순서로 먼 점과 잔광 예산이 작아진다', () => {
    const high = renderQualityProfile('high');
    const balanced = renderQualityProfile('balanced');
    const reduced = renderQualityProfile('reduced');
    const minimal = renderQualityProfile('minimal');
    expect(high.distantKeep).toBeGreaterThan(balanced.distantKeep);
    expect(balanced.distantKeep).toBeGreaterThan(reduced.distantKeep);
    expect(reduced.distantKeep).toBeGreaterThan(minimal.distantKeep);
    expect(high.preProjectionKeep).toBeGreaterThan(balanced.preProjectionKeep);
    expect(balanced.preProjectionKeep).toBeGreaterThan(reduced.preProjectionKeep);
    expect(reduced.preProjectionKeep).toBeGreaterThan(minimal.preProjectionKeep);
    expect(high.maxTrailSegments).toBeGreaterThan(balanced.maxTrailSegments);
    expect(balanced.maxTrailSegments).toBeGreaterThan(reduced.maxTrailSegments);
    expect(reduced.maxTrailSegments).toBeGreaterThan(minimal.maxTrailSegments);
    expect(minimal.maxTrailSegments).toBe(3);
  });

  it('minimal은 2px² 광원을 면으로 투영하지 않고 원거리 점을 최대 48개만 남긴다', () => {
    expect(screenSpaceLod(2, 'panel/42', 'minimal')).not.toBe('detail');
    const lights = Array.from({length:120},(_,index)=>({id:String(index),stableId:String(index),lod:'point'}));
    expect(capDistantLights(lights,'minimal')).toHaveLength(48);
  });

  it('minimal은 depth 180의 가까운 광원 100개를 모두 투영하고 depth 600의 먼 광원은 15~35개만 투영한다', () => {
    const ids=Array.from({length:100},(_,index)=>`panel/${index}`);
    expect(ids.filter(id=>shouldProjectLight(id,180,'minimal'))).toHaveLength(100);
    expect(ids.filter(id=>shouldProjectLight(id,600,'minimal')).length).toBeGreaterThanOrEqual(15);
    expect(ids.filter(id=>shouldProjectLight(id,600,'minimal')).length).toBeLessThanOrEqual(35);
    expect(ids.filter(id=>shouldProjectLight(id,600,'high'))).toHaveLength(100);
  });

  it('DPR 3 기기는 high에서 1.5배, minimal에서 1배로 그리며 DPR 0.8 기기는 0.8배를 유지한다', () => {
    expect(renderPixelRatio(3,'high')).toBe(1.5);
    expect(renderPixelRatio(3,'minimal')).toBe(1);
    expect(renderPixelRatio(.8,'minimal')).toBe(.8);
  });
});

describe('프레임 시간에 따른 자동 품질 조절', () => {
  it('24ms 프레임이 8번 이어지면 high에서 balanced로 한 단계만 낮춘다', () => {
    let state = adaptiveQualityState();
    for (let frame = 0; frame < 8; frame++) state = advanceAdaptiveQuality(state, 24);
    expect(state.name).toBe('balanced');
  });

  it('24ms 프레임이 16번 이어지면 high에서 reduced까지 단계적으로 낮춘다', () => {
    let state = adaptiveQualityState();
    for (let frame = 0; frame < 16; frame++) state = advanceAdaptiveQuality(state, 24);
    expect(state.name).toBe('reduced');
  });

  it('24ms 프레임이 24번 이어지면 high에서 minimal까지 단계적으로 낮춘다', () => {
    let state = adaptiveQualityState();
    for (let frame = 0; frame < 24; frame++) state = advanceAdaptiveQuality(state, 24);
    expect(state.name).toBe('minimal');
  });

  it('reduced에서 17ms 프레임이 240번 이어지면 balanced로 한 단계만 회복한다', () => {
    let state = adaptiveQualityState('reduced');
    for (let frame = 0; frame < 240; frame++) state = advanceAdaptiveQuality(state, 17);
    expect(state.name).toBe('balanced');
  });

  it('minimal에서 17ms 프레임이 240번 이어지면 reduced로 한 단계만 회복한다', () => {
    let state = adaptiveQualityState('minimal');
    for (let frame = 0; frame < 240; frame++) state = advanceAdaptiveQuality(state, 17);
    expect(state.name).toBe('reduced');
  });

  it('minimal에서 17ms 프레임 사이에 120프레임마다 33ms 한 번이 섞여도 누적 여유로 reduced까지 회복한다', () => {
    let state = adaptiveQualityState('minimal');
    for (let frame = 1; frame <= 300; frame++) state = advanceAdaptiveQuality(state, frame % 120 === 0 ? 33 : 17);
    expect(state.name).toBe('reduced');
  });

  it('18ms 중립 프레임과 250ms 이상 중단 프레임은 품질 단계를 바꾸지 않는다', () => {
    let state = adaptiveQualityState();
    for (let frame = 0; frame < 600; frame++) state = advanceAdaptiveQuality(state, 18);
    state = advanceAdaptiveQuality(state, 400);
    expect(state.name).toBe('high');
  });

  it('16.7ms·16.7ms·33.4ms 패턴이 30회 반복되면 누적된 누락 프레임을 감지해 high보다 낮은 단계로 전환한다', () => {
    let state = adaptiveQualityState();
    for (let repeat = 0; repeat < 30; repeat++) {
      for (const frameMs of [16.7,16.7,33.4]) state = advanceAdaptiveQuality(state, frameMs);
    }
    expect(state.name).not.toBe('high');
  });
});

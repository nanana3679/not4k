import { describe, expect, it } from 'vitest';
import { hexRgb, LightVertexBatch, writeLightFrame } from './gpu-light-batch.mjs';

const panel = (overrides = {}) => ({
  id:'panel/1', lod:'detail', surface:[{x:10,y:10},{x:20,y:10},{x:20,y:20},{x:10,y:20}],
  rgb:[100,200,250], alpha:1, size:2, ...overrides,
});

describe('GPU 광원 배치 정점 생성', () => {
  it('꼭짓점 4개인 발광 면 1개는 삼각형 2개·정점 6개로 한 버퍼에 기록한다', () => {
    const batch = new LightVertexBatch();
    const metrics = writeLightFrame(batch, { lights:[panel()] });
    expect(metrics).toMatchObject({ lightCount:1, trailCount:0, triangleCount:2, vertexCount:6 });
    expect(batch.view()).toHaveLength(36);
  });

  it('원거리 point 1개는 후광과 본체 사각형을 합쳐 삼각형 4개·정점 12개로 기록한다', () => {
    const metrics = writeLightFrame(new LightVertexBatch(), {
      lights:[panel({ lod:'point', surface:undefined, x:100, y:80, size:1, alpha:.8 })],
    });
    expect(metrics).toMatchObject({ lightCount:1, triangleCount:4, vertexCount:12 });
  });

  it('절대고도 잔광 선분 3개는 후광과 본체를 포함해 한 배치의 삼각형 12개로 기록한다', () => {
    const trails = Array.from({ length:3 }, (_, index) => ({ x1:index*10, y1:5, x2:index*10+8, y2:9, size:1, alpha:.8 }));
    const metrics = writeLightFrame(new LightVertexBatch(), { trails, trailGlowAlpha:.13, trailStrength:.4 });
    expect(metrics).toMatchObject({ trailCount:3, triangleCount:12, vertexCount:36 });
  });

  it('밀집 장면 뒤 빈 장면을 기록해도 기존 typed buffer를 재사용하고 정점 수만 0으로 만든다', () => {
    const batch = new LightVertexBatch(3);
    writeLightFrame(batch, { lights:Array.from({ length:80 }, (_, index) => panel({ id:String(index) })) });
    const denseBuffer = batch.data;
    expect(denseBuffer.length).toBeGreaterThan(3 * 6);
    expect(writeLightFrame(batch, { lights:[] }).vertexCount).toBe(0);
    expect(batch.data).toBe(denseBuffer);
  });

  it('#c7f7ff는 GPU 중심광 색상 [199,247,255]로 변환한다', () => {
    expect(hexRgb('#c7f7ff')).toEqual([199,247,255]);
  });
});

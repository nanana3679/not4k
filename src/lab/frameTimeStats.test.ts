import { describe, expect, it } from 'vitest';
import { createFrameTimeWindow, summarizeFrameDeltas } from './frameTimeStats';

describe('summarizeFrameDeltas', () => {
  it('프레임 간격 10·20·30·40ms면 평균 25ms·p95 40ms', () => {
    expect(summarizeFrameDeltas([10, 20, 30, 40])).toEqual({ count: 4, averageMs: 25, p95Ms: 40 });
  });

  it('간격이 하나도 없으면 null', () => {
    expect(summarizeFrameDeltas([])).toBeNull();
  });

  it('100개 중 95개가 16ms·5개가 50ms면 p95는 95번째 값 16ms, 50ms가 6개면 p95 50ms', () => {
    const fiveSpikes = [...Array<number>(95).fill(16), ...Array<number>(5).fill(50)];
    expect(summarizeFrameDeltas(fiveSpikes)?.p95Ms).toBe(16);
    const sixSpikes = [...Array<number>(94).fill(16), ...Array<number>(6).fill(50)];
    expect(summarizeFrameDeltas(sixSpikes)?.p95Ms).toBe(50);
  });
});

describe('createFrameTimeWindow', () => {
  it('120칸 창에 100ms 10개 뒤 16ms 120개를 넣으면 앞의 10개가 밀려나 평균 16ms·120개', () => {
    const window = createFrameTimeWindow(120);
    for (let i = 0; i < 10; i++) window.push(100);
    for (let i = 0; i < 120; i++) window.push(16);
    expect(window.summary()).toEqual({ count: 120, averageMs: 16, p95Ms: 16 });
  });

  it('clear 뒤에는 요약이 null이고, 음수·무한대 간격은 버린다', () => {
    const window = createFrameTimeWindow(4);
    window.push(16);
    window.clear();
    expect(window.summary()).toBeNull();
    window.push(-1);
    window.push(Number.POSITIVE_INFINITY);
    expect(window.summary()).toBeNull();
  });
});

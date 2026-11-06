import { describe, expect, it } from "vitest";
import { TimelineRenderer } from "./TimelineRenderer";

function renderer() {
  return new TimelineRenderer({
    canvas: {} as HTMLCanvasElement, width: 1000, height: 600,
    layoutConfig: { auxiliaryLaneCount: 2, songCommonColumns: [] },
    viewport: {
      get: () => ({ zoom: 200, snapDivision: 4, scrollY: 0, horizontalPanX: 0 }),
      subscribe: () => () => {},
    },
  });
}

describe('TimelineRenderer 레이아웃 캐시', () => {
  it('auxiliary lane 2개를 유지하고 song-common 열을 0→60px로 바꾸면 폭 360→420px로 갱신한다', () => {
    const timeline = renderer();
    const initial = timeline.layout;
    expect(initial.contentWidth).toBe(360);
    timeline.setLayoutConfig({ auxiliaryLaneCount: 2, songCommonColumns: [{ id: 'bpm', width: 60 }] });
    expect(timeline.layout).not.toBe(initial);
    expect(timeline.currentTimelineWidth).toBe(420);
    expect(timeline.layout.noteLaneRange(1)).toEqual({ x: 60, width: 60 });
    expect(timeline.getLayout({ auxiliaryLaneCount: 2, songCommonColumns: [{ id: 'bpm', width: 60 }] }))
      .toBe(timeline.layout);
  });
});

it('auxiliary lane 2개에서 같은 총폭 120px의 song-common 열 순서를 바꾸면 열 위치 캐시도 바뀐다', () => {
  const timeline = renderer();
  const first = timeline.getLayout({ auxiliaryLaneCount: 2,
    songCommonColumns: [{ id: 'bpm', width: 40 }, { id: 'signature', width: 80 }] });
  const second = timeline.getLayout({ auxiliaryLaneCount: 2,
    songCommonColumns: [{ id: 'signature', width: 80 }, { id: 'bpm', width: 40 }] });
  expect(second).not.toBe(first);
  expect(second.contentWidth).toBe(480);
  expect(second.commonColumnRange('bpm')).toEqual({ x: 80, width: 40 });
  expect(second.commonColumnRange('signature')).toEqual({ x: 0, width: 80 });
});

it('song-common 열 객체를 폭 40→80px·id bpm→signature로 수정해 다시 주면 캐시는 이전 배치와 분리된다', () => {
  const timeline = renderer();
  const config = { auxiliaryLaneCount: 2, songCommonColumns: [{ id: 'bpm', width: 40 }] };
  const first = timeline.getLayout(config);
  config.songCommonColumns[0].width = 80;
  config.songCommonColumns[0].id = 'signature';
  const second = timeline.getLayout(config);
  expect(second).not.toBe(first);
  expect(first.commonColumnRange('bpm')).toEqual({ x: 0, width: 40 });
  expect(second.commonColumnRange('bpm')).toBeUndefined();
  expect(second.commonColumnRange('signature')).toEqual({ x: 0, width: 80 });
  expect(second.contentWidth).toBe(440);
});

it('60px song-common 열에서 auxiliary lane 2→3개 설정을 입력이 먼저 읽고 렌더러에 반영하면 같은 480px 배치를 쓴다', () => {
  const timeline = renderer();
  timeline.setLayoutConfig({ auxiliaryLaneCount: 2, songCommonColumns: [{ id: 'bpm', width: 60 }] });
  const nextConfig = { auxiliaryLaneCount: 3, songCommonColumns: [{ id: 'bpm', width: 60 }] };
  const next = timeline.getLayout(nextConfig);
  expect(next.contentWidth).toBe(480);
  timeline.setLayoutConfig(nextConfig);
  expect(timeline.layout).toBe(next);
  expect(timeline.extraLaneCount).toBe(3);
  expect(timeline.layout.classifyX(450)).toEqual({ kind: 'auxiliary', lane: 3 });
});

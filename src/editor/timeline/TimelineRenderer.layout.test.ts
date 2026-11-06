import { describe, expect, it } from "vitest";
import { TimelineRenderer } from "./TimelineRenderer";
import type { SongCommonColumnId } from "./TimelineLayout";

function renderer(width = 1000) {
  return new TimelineRenderer({
    canvas: {} as HTMLCanvasElement, width, height: 600,
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
    songCommonColumns: [{ id: 'bpm', width: 40 }, { id: 'timeSignature', width: 80 }] });
  const second = timeline.getLayout({ auxiliaryLaneCount: 2,
    songCommonColumns: [{ id: 'timeSignature', width: 80 }, { id: 'bpm', width: 40 }] });
  expect(second).not.toBe(first);
  expect(second.contentWidth).toBe(480);
  expect(second.commonColumnRange('bpm')).toEqual({ x: 80, width: 40 });
  expect(second.commonColumnRange('timeSignature')).toEqual({ x: 0, width: 80 });
});

it('song-common 열 객체를 폭 40→80px·id bpm→timeSignature로 수정해 다시 주면 캐시는 이전 배치와 분리된다', () => {
  const timeline = renderer();
  const config = { auxiliaryLaneCount: 2, songCommonColumns: [{ id: 'bpm' as SongCommonColumnId, width: 40 }] };
  const first = timeline.getLayout(config);
  config.songCommonColumns[0].width = 80;
  config.songCommonColumns[0].id = 'timeSignature';
  const second = timeline.getLayout(config);
  expect(second).not.toBe(first);
  expect(first.commonColumnRange('bpm')).toEqual({ x: 0, width: 40 });
  expect(second.commonColumnRange('bpm')).toBeUndefined();
  expect(second.commonColumnRange('timeSignature')).toEqual({ x: 0, width: 80 });
  expect(second.contentWidth).toBe(440);
});

it('60px song-common 열에서 auxiliary lane 2→3개 설정을 입력이 먼저 읽고 렌더러에 반영하면 같은 480px 배치를 쓴다', () => {
  const timeline = renderer();
  timeline.setLayoutConfig({ auxiliaryLaneCount: 2, songCommonColumns: [{ id: 'bpm', width: 60 }] });
  const nextConfig = { auxiliaryLaneCount: 3, songCommonColumns: [{ id: 'bpm' as const, width: 60 }] };
  const next = timeline.getLayout(nextConfig);
  expect(next.contentWidth).toBe(480);
  timeline.setLayoutConfig(nextConfig);
  expect(timeline.layout).toBe(next);
  expect(timeline.extraLaneCount).toBe(3);
  expect(timeline.layout.classifyX(450)).toEqual({ kind: 'auxiliary', lane: 3 });
});

it('곡 공통 표기는 기본으로 꺼져 있고 setSongCommonLabelVisible(true)로 켠다', () => {
  const timeline = renderer();
  expect(timeline.songCommonLabelVisible).toBe(false);
  timeline.setSongCommonLabelVisible(true);
  expect(timeline.songCommonLabelVisible).toBe(true);
});

describe('곡 공통 영역을 접고 펼칠 때의 가로 배치(RFD 0095)', () => {
  const expanded = { auxiliaryLaneCount: 2, songCommonColumns: [{ id: 'bpm' as const, width: 60 }, { id: 'timeSignature' as const, width: 48 }] };
  const collapsed = { auxiliaryLaneCount: 2, songCommonColumns: [], collapsedSongCommonWidth: 108 };
  const withPan = (timeline: TimelineRenderer, panX: number) =>
    Object.assign(timeline as unknown as { _horizontalPanX: number }, { _horizontalPanX: panX });
  const laneOneScreenX = (timeline: TimelineRenderer) => timeline.contentOffsetX + timeline.layout.noteLaneRange(1).x;

  it('너비 300px에서 팬 150px로 곡 공통 108px를 접으면 팬 42px가 되어 메인 레인 1이 화면 x=-10에 남는다', () => {
    const timeline = renderer(300);
    timeline.setLayoutConfig(expanded);
    withPan(timeline, 150);
    expect(laneOneScreenX(timeline)).toBe(-10);
    timeline.setLayoutConfig(collapsed);
    expect(timeline.horizontalPanX).toBe(42);
    expect(laneOneScreenX(timeline)).toBe(-10);
  });

  it('너비 300px에서 접은 채 팬 100px로 펼치면 팬 0으로 돌아가 bpm 열이 마디 레일 바로 오른쪽 x=32에 보인다', () => {
    const timeline = renderer(300);
    timeline.setLayoutConfig(collapsed);
    withPan(timeline, 100);
    timeline.setLayoutConfig(expanded);
    expect(timeline.horizontalPanX).toBe(0);
    expect(timeline.contentOffsetX + timeline.layout.commonColumnRange('bpm')!.x).toBe(32);
  });

  it('너비 1000px에서 접어도 중앙 정렬 여백이 234px로 같아 마디 레일과 버튼이 움직이지 않고 메인 레인 1만 108px 왼쪽으로 온다', () => {
    const timeline = renderer(1000);
    timeline.setLayoutConfig(expanded);
    expect(timeline.contentCenterShiftX).toBe(234);
    const before = laneOneScreenX(timeline);
    timeline.setLayoutConfig(collapsed);
    expect(timeline.contentCenterShiftX).toBe(234);
    expect(laneOneScreenX(timeline)).toBe(before - 108);
    expect(timeline.horizontalPanX).toBe(0);
  });

  it('너비 500px에서 펼친 폭이 가용 폭보다 넓으면 접어도 중앙 정렬 여백이 0px라 왼쪽 빈칸이 생기지 않는다', () => {
    const timeline = renderer(500);
    timeline.setLayoutConfig(expanded);
    expect(timeline.contentCenterShiftX).toBe(0);
    timeline.setLayoutConfig(collapsed);
    expect(timeline.contentCenterShiftX).toBe(0);
    expect(laneOneScreenX(timeline)).toBe(32);
  });

  it('보조 레인 수만 바꾸면 곡 공통 폭이 같아 팬 150px를 범위 안에서 유지한다', () => {
    const timeline = renderer(300);
    timeline.setLayoutConfig(expanded);
    withPan(timeline, 150);
    timeline.setLayoutConfig({ ...expanded, auxiliaryLaneCount: 3 });
    expect(timeline.horizontalPanX).toBe(150);
  });

  it('접힌 배치를 입력이 먼저 읽어 캐시를 바꿔도 렌더러 배치는 setLayoutConfig 뒤 같은 객체를 쓴다', () => {
    const timeline = renderer();
    timeline.setLayoutConfig(expanded);
    const next = timeline.getLayout(collapsed);
    expect(next.songCommonWidth).toBe(0);
    timeline.setLayoutConfig(collapsed);
    expect(timeline.layout).toBe(next);
  });
});

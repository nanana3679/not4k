import { describe, expect, it } from 'vitest';
import {
  buildFrameFitDemo,
  buildFrameFitSchedule,
  FRAME_FIT_MISS_DELAY_MS,
  initialFrameFitLoopState,
  stepFrameFitLoop,
} from './classicFrameFitChart';

describe('classicFrameFitChart 데모 차트', () => {
  it('90마디 데모 차트는 120 BPM에서 첫 노트가 2000ms에 오고 전체 길이는 184000ms', () => {
    const demo = buildFrameFitDemo(90);
    expect(demo.hits[0].startMs).toBe(2000);
    expect(demo.durationMs).toBe(184000);
    expect(demo.chart.meta.difficultyLabel).toBe('INFILTRATION');
  });

  it('4마디째(8000ms)에는 레인 1 롱노트 8000~9000ms와 레인 4 롱노트 9000~10000ms가 이어진다', () => {
    const longs = buildFrameFitDemo(90).hits.filter((hit) => hit.long && hit.startMs < 10000);
    expect(longs.map(({ lane, startMs, endMs }) => ({ lane, startMs, endMs }))).toEqual([
      { lane: 1, startMs: 8000, endMs: 9000 },
      { lane: 4, startMs: 9000, endMs: 10000 },
    ]);
  });

  it('보통 마디(2000ms)는 8분음표 싱글 8개가 레인 1·2·3·4·4·3·2·1 순서로 250ms 간격', () => {
    const measure = buildFrameFitDemo(90).hits.filter((hit) => hit.startMs >= 2000 && hit.startMs < 4000);
    expect(measure.map((hit) => hit.lane)).toEqual([1, 2, 3, 4, 4, 3, 2, 1]);
    expect(measure.map((hit) => hit.startMs)).toEqual([2000, 2250, 2500, 2750, 3000, 3250, 3500, 3750]);
  });

  it('모든 노트는 레인 1~4에 있고 같은 레인의 롱노트 구간 안에 다른 노트가 없다', () => {
    const { hits } = buildFrameFitDemo(90);
    expect(hits.every((hit) => hit.lane >= 1 && hit.lane <= 4)).toBe(true);
    for (const long of hits.filter((hit) => hit.endMs > hit.startMs)) {
      const inside = hits.filter((hit) => hit !== long && hit.lane === long.lane && hit.startMs >= long.startMs && hit.startMs <= long.endMs);
      expect(inside).toEqual([]);
    }
  });

  it('차트 노트 수와 키 입력 목록 수가 같다(90마디 = 보통 68마디 × 8 + 롱 마디 22 × 6 = 676)', () => {
    const demo = buildFrameFitDemo(90);
    expect(demo.chart.notes).toHaveLength(demo.hits.length);
    expect(demo.hits).toHaveLength(676);
  });
});

describe('classicFrameFitChart 데모 판정', () => {
  const demo = buildFrameFitDemo(90);
  const schedule = buildFrameFitSchedule(demo.hits);
  const eventsOf = (index: number) => schedule.events.filter((event) => event.index === index);
  const indexAt = (lane: number, startMs: number) => demo.hits.find((hit) => hit.lane === lane && hit.startMs === startMs)!.index;

  it('90마디 데모의 포인트 노트 632개 중 5번째마다 126개, 롱노트 44개 중 4마디마다 레인 4의 22개를 놓친다', () => {
    const points = demo.hits.filter((hit) => !hit.long);
    const longs = demo.hits.filter((hit) => hit.long);
    const missed = new Set(schedule.events.filter((event) => event.type === 'miss').map((event) => event.index));
    expect(points).toHaveLength(632);
    expect(points.filter((hit) => missed.has(hit.index))).toHaveLength(126);
    expect(longs).toHaveLength(44);
    expect(longs.filter((hit) => missed.has(hit.index)).map((hit) => hit.lane)).toEqual(new Array(22).fill(4));
  });

  it('맞힌 첫 포인트 노트(레인 1, 2000ms)는 2000ms에 hit과 processed가 함께 오고 키빔은 2000~2079ms', () => {
    const index = indexAt(1, 2000);
    expect(eventsOf(index)).toEqual([
      { type: 'hit', index, lane: 1, atMs: 2000 },
      { type: 'processed', index, atMs: 2000 },
    ]);
    expect(schedule.beams).toContainEqual({ lane: 1, fromMs: 2000, toMs: 2080 });
  });

  it('놓친 5번째 포인트 노트(레인 4, 3000ms)는 120ms 뒤 3120ms에 miss만 있고 hit·processed·키빔이 없다', () => {
    const index = indexAt(4, 3000);
    expect(FRAME_FIT_MISS_DELAY_MS).toBe(120);
    expect(eventsOf(index)).toEqual([{ type: 'miss', index, lane: 4, atMs: 3120 }]);
    expect(schedule.beams.filter((beam) => beam.lane === 4 && beam.fromMs === 3000)).toEqual([]);
  });

  it('4마디째 레인 1 롱노트(8000~9000ms)는 머리에 hit, 끝 9000ms에 processed이고 그 사이 키빔을 유지한다', () => {
    const index = indexAt(1, 8000);
    expect(eventsOf(index)).toEqual([
      { type: 'hit', index, lane: 1, atMs: 8000 },
      { type: 'processed', index, atMs: 9000 },
    ]);
    expect(schedule.beams).toContainEqual({ lane: 1, fromMs: 8000, toMs: 9000 });
  });

  it('4마디째 레인 4 롱노트(9000~10000ms)는 머리 120ms 뒤 9120ms에 miss만 있다', () => {
    const index = indexAt(4, 9000);
    expect(eventsOf(index)).toEqual([{ type: 'miss', index, lane: 4, atMs: 9120 }]);
  });
});

describe('classicFrameFitChart 재생 루프', () => {
  const demo = buildFrameFitDemo(90);
  const schedule = buildFrameFitSchedule(demo.hits);

  it('처음 1990 → 2010ms 프레임은 첫 노트 hit으로 콤보 1, 레인 1 키빔이 켜진다', () => {
    const step = stepFrameFitLoop(schedule, { ...initialFrameFitLoopState(), previousMs: 1990 }, 2010);
    expect(step.events.map((event) => event.type)).toEqual(['hit', 'processed']);
    expect(step.events.every((event) => !event.stale)).toBe(true);
    expect(step.state.combo).toBe(1);
    expect(step.beamLanes).toEqual([true, false, false, false]);
    expect(step.wrapped).toBe(false);
  });

  it('3110 → 3130ms 프레임의 miss는 콤보를 0으로 끊고 놓친 수를 1 늘린다', () => {
    const step = stepFrameFitLoop(schedule, { previousMs: 3110, combo: 4, missed: 0 }, 3130);
    expect(step.events.map((event) => event.type)).toEqual(['miss']);
    expect(step.state).toEqual({ previousMs: 3130, combo: 0, missed: 1 });
  });

  it('차트 끝에서 처음으로 되감긴 프레임(183990 → 10ms)은 wrapped이고 콤보를 0으로 돌리며 0~10ms 이벤트만 보고 놓친 수는 누적한다', () => {
    const step = stepFrameFitLoop(schedule, { previousMs: 183990, combo: 37, missed: 148 }, 10);
    expect(step.wrapped).toBe(true);
    expect(step.events).toEqual([]);
    expect(step.state).toEqual({ previousMs: 10, combo: 0, missed: 148 });
  });

  it('숨은 탭에서 돌아와 한 번에 1990 → 4000ms로 건너뛰면 100ms보다 오래된 이벤트(3900ms 이전)는 stale, 3900ms 이후는 아니다', () => {
    const step = stepFrameFitLoop(schedule, { previousMs: 1990, combo: 0, missed: 0 }, 4000);
    const stale = step.events.filter((event) => event.stale).map((event) => event.atMs);
    const fresh = step.events.filter((event) => !event.stale).map((event) => event.atMs);
    expect(stale.every((atMs) => atMs < 3900)).toBe(true);
    expect(fresh).toEqual([4000, 4000]);
    // 표시 효과(처리·놓침)는 오래된 이벤트도 모두 받는다.
    expect(step.events.filter((event) => event.type === 'miss').map((event) => event.atMs)).toEqual([3120]);
    expect(step.state.missed).toBe(1);
  });

  it('같은 시각으로 다시 그리면(2000 → 2000ms) 이벤트를 다시 내지 않는다', () => {
    const step = stepFrameFitLoop(schedule, { previousMs: 2000, combo: 1, missed: 0 }, 2000);
    expect(step.events).toEqual([]);
  });
});

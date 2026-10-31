import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat, BEAT_ZERO, beatToMs } from '../../shared';
import type { BpmChange, ChartDocument, Lane } from '../../shared';
import { timelineRangeMsOf } from '../timeline/timelineRange';
import { useEditorStore } from '../stores/editorStore';
import type { TimelineRangeMs } from '../stores/viewportSlice';
import { PlaybackController } from './PlaybackController';
import {
  createCursorBeatKeeper,
  type CursorBeatKeeperPlayback,
} from './cursorBeatKeeper';

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

/** 첫 chart effect가 세션의 비교 기준을 만든다. */
function createKeeper(initial: { chart: ChartDocument; loadGeneration: number }) {
  const keeper = createCursorBeatKeeper(useEditorStore);
  keeper.syncToChart({ ...initial, cursorMs: 0, playback: null, timelineRange: null });
  return keeper;
}

// ---------------------------------------------------------------------------
// createCursorBeatKeeper — 수정 전 타이밍의 커서 박을 수정 후 타이밍의 음원 시각으로 옮긴다(RFD 0099)
// ---------------------------------------------------------------------------

const BPM_120: BpmChange[] = [{ beat: BEAT_ZERO, bpm: 120 }]; // 500ms/beat

/** 범위 제한 없는 박↔시각 변환도 실제 keeper의 seek 경로를 거친다. */
function syncTimingChange(cursorMs: number, before: {
  bpmChanges: BpmChange[];
  offsetMs: number;
}, after: typeof before): number {
  const toChart = (timing: typeof before): ChartDocument => {
    const chart = chartWith({ offsetMs: timing.offsetMs });
    return {
      ...chart,
      events: [
        ...chart.events.filter(event => event.type !== 'bpm'),
        ...timing.bpmChanges.map(change => ({ ...change, type: 'bpm' as const, editorLane: 1 })),
      ],
    };
  };
  const keeper = createKeeper({ chart: toChart(before), loadGeneration: 1 });
  const playback = fakePlayback(cursorMs);
  keeper.syncToChart({
    chart: toChart(after), loadGeneration: 1, cursorMs, playback, timelineRange: null,
  });
  return playback.cursorMs;
}

describe('createCursorBeatKeeper — 박↔시각 변환', () => {
  it('offset 0→100이면 커서 1000ms(2박)는 1100ms', () => {
    expect(syncTimingChange(1000, { bpmChanges: BPM_120, offsetMs: 0 }, { bpmChanges: BPM_120, offsetMs: 100 })).toBe(1100);
  });

  it('BPM 120→60이면 4박의 커서 2000ms는 4000ms', () => {
    expect(syncTimingChange(
      2000,
      { bpmChanges: BPM_120, offsetMs: 0 },
      { bpmChanges: [{ beat: BEAT_ZERO, bpm: 60 }], offsetMs: 0 },
    )).toBe(4000);
  });

  it('커서(2박, 1000ms)보다 뒤인 8박에 BPM 60 변경을 넣으면 커서는 1000ms 그대로', () => {
    expect(syncTimingChange(
      1000,
      { bpmChanges: BPM_120, offsetMs: 0 },
      { bpmChanges: [...BPM_120, { beat: beat(8), bpm: 60 }], offsetMs: 0 },
    )).toBe(1000);
  });

  it('커서(6박, 3000ms)보다 앞인 4박에 BPM 60 변경을 넣으면 커서는 2000 + 2×1000 = 4000ms', () => {
    expect(syncTimingChange(
      3000,
      { bpmChanges: BPM_120, offsetMs: 0 },
      { bpmChanges: [...BPM_120, { beat: beat(4), bpm: 60 }], offsetMs: 0 },
    )).toBe(4000);
  });

  it('BPM 60 변경을 4박에서 2박으로 옮기면 6박 커서는 4000ms → 1000 + 4×1000 = 5000ms', () => {
    expect(syncTimingChange(
      4000,
      { bpmChanges: [...BPM_120, { beat: beat(4), bpm: 60 }], offsetMs: 0 },
      { bpmChanges: [...BPM_120, { beat: beat(2), bpm: 60 }], offsetMs: 0 },
    )).toBe(5000);
  });

  it('4박의 BPM 60 변경을 지우면 6박 커서는 4000ms → 3000ms', () => {
    expect(syncTimingChange(
      4000,
      { bpmChanges: [...BPM_120, { beat: beat(4), bpm: 60 }], offsetMs: 0 },
      { bpmChanges: BPM_120, offsetMs: 0 },
    )).toBe(3000);
  });

  it('렌더러 범위가 없어도 offset 500→700이면 0박 앞인 커서 0ms를 새 0박인 700ms로 자른다', () => {
    expect(syncTimingChange(0, { bpmChanges: BPM_120, offsetMs: 500 }, { bpmChanges: BPM_120, offsetMs: 700 })).toBe(700);
  });

  it('offset과 BPM 목록이 값으로 같으면 배열 참조가 달라도 커서 1234.5ms를 그대로 유지한다', () => {
    expect(syncTimingChange(
      1234.5,
      { bpmChanges: [{ beat: beat(0), bpm: 120 }, { beat: beat(4), bpm: 90 }], offsetMs: 30 },
      { bpmChanges: [{ beat: beat(0), bpm: 120 }, { beat: beat(8, 2), bpm: 90 }], offsetMs: 30 },
    )).toBe(1234.5);
  });

  it('수정 전이나 후의 BPM 목록이 비어 있으면(구조 위반 차트) 커서 1000ms를 그대로 둔다', () => {
    expect(syncTimingChange(1000, { bpmChanges: [], offsetMs: 0 }, { bpmChanges: BPM_120, offsetMs: 100 })).toBe(1000);
    expect(syncTimingChange(1000, { bpmChanges: BPM_120, offsetMs: 0 }, { bpmChanges: [], offsetMs: 100 })).toBe(1000);
  });

  it('수정 전이나 후의 첫 BPM 변경이 0박이 아니라 2박에 있으면(구조 위반 차트) 커서 1000ms를 그대로 둔다', () => {
    const startsAtBeat2: BpmChange[] = [{ beat: beat(2), bpm: 120 }];
    expect(syncTimingChange(1000, { bpmChanges: startsAtBeat2, offsetMs: 0 }, { bpmChanges: BPM_120, offsetMs: 100 })).toBe(1000);
    expect(syncTimingChange(1000, { bpmChanges: BPM_120, offsetMs: 0 }, { bpmChanges: startsAtBeat2, offsetMs: 100 })).toBe(1000);
  });

  it('4박에 BPM 60·90 두 변경이 겹치면 배열 뒤의 90이 4박부터 적용돼 6박 커서 3000ms는 2000 + 2×666.67 = 3333.33ms(beatToMs와 같은 시각)', () => {
    const overlapping: BpmChange[] = [...BPM_120, { beat: beat(4), bpm: 60 }, { beat: beat(4), bpm: 90 }];

    const remapped = syncTimingChange(3000, { bpmChanges: BPM_120, offsetMs: 0 }, { bpmChanges: overlapping, offsetMs: 0 });

    expect(remapped).toBeCloseTo(2000 + 2 * (60000 / 90), 9);
    expect(remapped).toBeCloseTo(beatToMs(beat(6), overlapping, 0), 9);
  });
});

// ---------------------------------------------------------------------------
// createCursorBeatKeeper — 차트가 바뀔 때 정지 중이면 커서를 수정 직전 박의 새 시각으로 seek한다
// ---------------------------------------------------------------------------

type TimingEvent = ChartDocument['events'][number];

function chartWith({ offsetMs = 0, events = [], notes = [] }: {
  offsetMs?: number;
  events?: TimingEvent[];
  notes?: ChartDocument['notes'];
} = {}): ChartDocument {
  return {
    meta: {
      title: 'Test', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs,
    },
    notes,
    trillZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      ...events,
    ],
  };
}

function chartWithInitialBpm(bpm: number): ChartDocument {
  const chart = chartWith();
  return { ...chart, events: chart.events.map(event => event.type === 'bpm' ? { ...event, bpm } : event) };
}

/**
 * PlaybackController처럼 seekTo가 store의 커서(cursorMs)도 함께 옮기는 가짜 재생기.
 * PlaybackController는 seek 위치를 초로 저장했다가 ms로 알리므로(`timeMs / 1000 * 1000`) 같은 왕복 오차를 낸다.
 */
function fakePlayback(cursorMs: number, isPlaying = false) {
  useEditorStore.getState().setCurrentTimeMs(cursorMs);
  const playback = {
    isPlaying,
    get cursorMs() { return useEditorStore.getState().currentTimeMs; },
    seekTo: vi.fn((timeMs: number) => {
      useEditorStore.getState().setCurrentTimeMs((timeMs / 1000) * 1000);
    }),
  } satisfies CursorBeatKeeperPlayback & { cursorMs: number };
  return playback;
}

/** 0ms부터 60000ms까지의 타임라인(offset 0). */
const RANGE_0_TO_60000 = timelineRangeMsOf(0, 60000);

function bpmEvent(at: number, bpm: number): TimingEvent {
  return { type: 'bpm', beat: beat(at), bpm, editorLane: 1 };
}

const tapAtBeat2: ChartDocument['notes'] = [{ type: 'tap', kind: 'single', lane: 1 as Lane, beat: beat(2) }];

describe('createCursorBeatKeeper', () => {
  it('정지 중 offset을 0→100으로 바꾸면 커서 1000ms를 같은 2박의 1100ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.syncToChart({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(1100);
  });

  it('정지 중 초기 BPM을 120→60으로 바꾸면 4박의 커서 2000ms를 4000ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(2000);

    keeper.syncToChart({ chart: chartWithInitialBpm(60), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(4000);
  });

  it('새 박의 시각 4000ms가 타임라인 범위 끝 3000ms를 넘으면 3000ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(2000);

    keeper.syncToChart({
      chart: chartWithInitialBpm(60), loadGeneration: 1, cursorMs: playback.cursorMs, playback,
      timelineRange: timelineRangeMsOf(0, 3000),
    });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(3000);
  });

  it('일시정지 뒤 커서를 3000ms(6박)로 seek하고 BPM을 120→60으로 바꾸면 정지 위치가 아니라 seek한 6박의 6000ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);
    playback.seekTo(3000);
    playback.seekTo.mockClear();

    keeper.syncToChart({ chart: chartWithInitialBpm(60), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(6000);
  });

  it('offset을 0→100→250으로 두 번 바꾸면 커서는 1000 → 1100 → 1250ms로 매번 수정 직전 박(2박)을 유지한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.syncToChart({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });
    keeper.syncToChart({ chart: chartWith({ offsetMs: 250 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo.mock.calls).toEqual([[1100], [1250]]);
    expect(playback.cursorMs).toBe(1250);
  });

  it('재생 중에는 offset을 0→100으로 바꿔도 seek하지 않는다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000, true);

    keeper.syncToChart({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('재생 중 offset 0→100 변경 뒤 정지해 100→200으로 바꾸면 기준은 100이라 커서 1000ms를 1100ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000, true);
    keeper.syncToChart({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });
    playback.isPlaying = false;

    keeper.syncToChart({ chart: chartWith({ offsetMs: 200 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(1100);
  });

  it('chartLoadGeneration이 1→2로 바뀐 차트 교체(새로 불러옴)는 offset이 0→500으로 달라도 seek하지 않는다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.syncToChart({ chart: chartWith({ offsetMs: 500 }), loadGeneration: 2, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('새로 불러온 차트(offset 500)에서 offset을 600으로 바꾸면 불러온 타이밍을 기준으로 커서 1000ms를 1100ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);
    keeper.syncToChart({ chart: chartWith({ offsetMs: 500 }), loadGeneration: 2, cursorMs: playback.cursorMs, playback, timelineRange: null });

    keeper.syncToChart({ chart: chartWith({ offsetMs: 600 }), loadGeneration: 2, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(1100);
  });

  it('8박에 박자표 3/4 변경만 더하면 박↔시각 변환이 같아 seek하지 않는다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.syncToChart({
      chart: chartWith({ events: [{ type: 'timeSignature', beat: beat(8), beatPerMeasure: beat(3), editorLane: 2 }] }),
      loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null,
    });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('노트만 더한 차트 교체는 seek하지 않는다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.syncToChart({
      chart: chartWith({ notes: [{ type: 'tap', kind: 'single', lane: 1 as Lane, beat: beat(2) }] }),
      loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null,
    });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('커서(2박)보다 뒤인 8박에 BPM 60 변경을 더하면 커서 시각이 그대로라 seek하지 않는다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.syncToChart({
      chart: chartWith({ events: [{ type: 'bpm', beat: beat(8), bpm: 60, editorLane: 1 }] }),
      loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null,
    });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('재생기가 아직 없으면(null) seek 없이 넘어가고, 그 뒤 offset 100→200 수정은 100을 기준으로 커서 1000ms를 1100ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    keeper.syncToChart({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: 1000, playback: null, timelineRange: null });
    const playback = fakePlayback(1000);

    keeper.syncToChart({ chart: chartWith({ offsetMs: 200 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: null });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(1100);
  });
});

// ---------------------------------------------------------------------------
// 범위에 묶인 커서 — 묶기 전 박을 기억했다가 타이밍이 돌아오면 그 박으로 되돌린다
// ---------------------------------------------------------------------------

describe('createCursorBeatKeeper — 범위에 묶인 뒤 되돌리기', () => {
  it('960→120 BPM으로 2000ms에 묶인 뒤 같은 2000ms의 재생 tick을 받으면 정지 후 Undo는 250ms로 옮긴다', () => {
    const keeper = createKeeper({ chart: chartWithInitialBpm(960), loadGeneration: 1 });
    const playback = fakePlayback(375);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback,
      timelineRange: timelineRangeMsOf(0, 2000),
    });
    sync(chartWithInitialBpm(120));

    playback.isPlaying = true;
    // 차트 변경 없이 재생했다 멈춘 경우도 onTimeUpdate 경로로 기억을 무효화한다.
    useEditorStore.getState().setCurrentTimeMs(2000);
    playback.isPlaying = false;
    sync(chartWithInitialBpm(960));

    expect(playback.cursorMs).toBe(250);
  });

  it('6박을 2000ms에 묶은 뒤 loadChart로 offset 0 차트를 열면 기억을 비우고 960 BPM 수정에도 0박인 0ms를 유지한다', () => {
    useEditorStore.getState().loadChart(chartWithInitialBpm(960));
    const keeper = createKeeper({ chart: useEditorStore.getState().chart, loadGeneration: 1 });
    const playback = fakePlayback(375);
    const sync = () => keeper.syncToChart({
      chart: useEditorStore.getState().chart,
      loadGeneration: useEditorStore.getState().chartLoadGeneration,
      cursorMs: playback.cursorMs, playback, timelineRange: timelineRangeMsOf(0, 2000),
    });
    useEditorStore.getState().setChart(chartWithInitialBpm(120));
    sync();
    expect(playback.cursorMs).toBe(2000);

    useEditorStore.getState().loadChart(chartWithInitialBpm(120));
    expect(useEditorStore.getState().cursorBeatKeeperState).toBeNull();
    expect(playback.cursorMs).toBe(0);
    playback.seekTo.mockClear();
    sync();
    expect(playback.seekTo).not.toHaveBeenCalled();

    useEditorStore.getState().setChart(chartWithInitialBpm(960));
    sync();
    expect(playback.cursorMs).toBe(0);
  });

  it('6박이 375→2000ms에 묶인 뒤 재마운트하면 재생기도 2000ms에서 시작하고 이동 횟수 유지로 Undo는 375ms를 복원한다', () => {
    const keeper = createKeeper({ chart: chartWithInitialBpm(960), loadGeneration: 1 });
    const playback = fakePlayback(375);
    keeper.syncToChart({
      chart: chartWithInitialBpm(120), loadGeneration: 1, cursorMs: playback.cursorMs, playback,
      timelineRange: timelineRangeMsOf(0, 2000),
    });

    const moveCount = useEditorStore.getState().cursorMoveCount;
    const remounted = createCursorBeatKeeper(useEditorStore);
    const newPlayback = new PlaybackController({
      getCursorTimeMs: () => useEditorStore.getState().currentTimeMs,
      onTimeUpdate: useEditorStore.getState().setCurrentTimeMs,
      onPlayStateChange: useEditorStore.getState().setIsPlaying,
    });
    const sync = (chart: ChartDocument, timelineRange: TimelineRangeMs | null) => remounted.syncToChart({
      chart, loadGeneration: 1, cursorMs: useEditorStore.getState().currentTimeMs, playback: newPlayback,
      timelineRange,
    });
    sync(chartWithInitialBpm(120), null); // 첫 effect는 비동기 렌더러 준비보다 먼저 실행된다.
    expect(useEditorStore.getState().currentTimeMs).toBe(2000);
    expect(newPlayback.currentTimeMs).toBe(2000);
    expect(useEditorStore.getState().cursorMoveCount).toBe(moveCount);

    sync(chartWithInitialBpm(960), timelineRangeMsOf(0, 2000));

    expect(useEditorStore.getState().currentTimeMs).toBe(375);
    expect(newPlayback.currentTimeMs).toBe(375);
    newPlayback.dispose();
  });

  it('120 BPM에서 4/4→3/4로 끝이 2000→1500ms가 되면 4박 커서를 자르고 Undo·Redo는 2000→1500ms로 옮긴다', () => {
    const chart = chartWith();
    useEditorStore.getState().loadChart(chart);
    const keeper = createKeeper({ chart, loadGeneration: 1 });
    const playback = fakePlayback(2000);
    const sync = (totalTimelineMs: number) => keeper.syncToChart({
      chart: useEditorStore.getState().chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback,
      timelineRange: timelineRangeMsOf(0, totalTimelineMs),
    });
    const threeFour = {
      ...chart,
      events: chart.events.map(event => event.type === 'timeSignature'
        ? { ...event, beatPerMeasure: beat(3) } : event),
    };

    useEditorStore.getState().setChart(threeFour);
    sync(1500); // 500ms 음원은 4/4·3/4 모두 1마디가 덮으므로 마디 끝이 범위 끝이다.
    expect(playback.cursorMs).toBe(1500);

    useEditorStore.getState().undo();
    sync(2000);
    useEditorStore.getState().redo();
    sync(1500);
    expect(playback.seekTo.mock.calls).toEqual([[1500], [2000], [1500]]);
  });

  it('960→120 BPM으로 2000ms에 묶인 뒤 1000→2000ms로 seek하면 Undo는 새 4박의 250ms로 옮긴다', () => {
    const keeper = createKeeper({ chart: chartWithInitialBpm(960), loadGeneration: 1 });
    const playback = fakePlayback(375);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback,
      timelineRange: timelineRangeMsOf(0, 2000),
    });

    sync(chartWithInitialBpm(120));
    playback.seekTo(1000);
    playback.seekTo(2000);
    sync(chartWithInitialBpm(960));

    expect(playback.cursorMs).toBe(250);
  });

  it('64박 BPM 60 변경을 32박·8박으로 끄는 동안 90박 커서(58000ms)가 끝 60000ms에 묶여도, Escape로 64박에 되돌리면 다시 90박의 58000ms로 seek한다', () => {
    const atBeat64 = chartWith({ events: [bpmEvent(64, 60)] });
    const keeper = createKeeper({ chart: atBeat64, loadGeneration: 1 });
    const playback = fakePlayback(58000);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: RANGE_0_TO_60000,
    });

    sync(chartWith({ events: [bpmEvent(32, 60)] })); // 90박 = 16000 + 58×1000 = 74000ms → 60000ms
    sync(chartWith({ events: [bpmEvent(8, 60)] })); // 90박 = 4000 + 82×1000 = 86000ms → 60000ms(이미 그 자리)
    sync(atBeat64);

    expect(playback.seekTo.mock.calls).toEqual([[60000], [58000]]);
  });

  it('커서 40000ms(80박)가 초기 BPM 120→60 수정으로 끝 60000ms에 묶인 뒤 Undo로 120에 돌아오면 30000ms가 아니라 80박의 40000ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(40000);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: RANGE_0_TO_60000,
    });

    sync(chartWithInitialBpm(60));
    sync(chartWith());

    expect(playback.seekTo.mock.calls).toEqual([[60000], [40000]]);
  });

  it('끝 2010ms에 묶인 seek를 재생기가 2009.9999999999998ms로 알려도(초 단위 왕복 오차) Undo하면 3박의 1500ms로 돌아온다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1500);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: timelineRangeMsOf(0, 2010),
    });

    sync(chartWithInitialBpm(60)); // 3박 = 3000ms → 2010ms
    expect(playback.cursorMs).toBe(2009.9999999999998);
    sync(chartWith());

    expect(playback.seekTo.mock.calls).toEqual([[2010], [1500]]);
  });

  it('끝 60000ms에 묶인 뒤 노트만 바꾼 차트 교체가 끼어도, BPM을 120으로 되돌리면 80박의 40000ms로 돌아온다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(40000);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: RANGE_0_TO_60000,
    });

    sync(chartWithInitialBpm(60));
    sync({ ...chartWithInitialBpm(60), notes: tapAtBeat2 });
    sync(chartWith({ notes: tapAtBeat2 }));

    expect(playback.seekTo.mock.calls).toEqual([[60000], [40000]]);
  });

  it('끝 60000ms에 묶인 뒤 사용자가 커서를 50000ms(60 BPM에서 50박)로 옮기면, Undo로 120에 돌아올 때 80박이 아니라 50박의 25000ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(40000);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: RANGE_0_TO_60000,
    });

    sync(chartWithInitialBpm(60));
    playback.seekTo(50000); // 사용자의 레일 seek
    sync(chartWith());

    expect(playback.seekTo.mock.calls).toEqual([[60000], [50000], [25000]]);
  });

  it('끝 60000ms에 묶인 뒤 재생 중에 차트가 한 번 바뀌면 기억한 박을 버려, 정지 뒤 Undo로 120에 돌아오면 커서 60000ms의 60박인 30000ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(40000);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: RANGE_0_TO_60000,
    });

    sync(chartWithInitialBpm(60));
    playback.isPlaying = true;
    sync({ ...chartWithInitialBpm(60), notes: tapAtBeat2 });
    playback.isPlaying = false;
    sync(chartWith({ notes: tapAtBeat2 }));

    expect(playback.seekTo.mock.calls).toEqual([[60000], [30000]]);
  });

  it('끝 60000ms에 묶인 뒤 60 BPM 차트를 새로 불러오면(loadGeneration 1→2) 기억한 박을 버려, 그 차트의 BPM을 120으로 바꾸면 커서 60000ms의 60박인 30000ms로 seek한다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(40000);
    const sync = (chart: ChartDocument, loadGeneration: number) => keeper.syncToChart({
      chart, loadGeneration, cursorMs: playback.cursorMs, playback, timelineRange: RANGE_0_TO_60000,
    });

    sync(chartWithInitialBpm(60), 1);
    sync(chartWithInitialBpm(60), 2);
    sync(chartWith(), 2);

    expect(playback.seekTo.mock.calls).toEqual([[60000], [30000]]);
  });

  it('6박 커서 3000ms는 4박에 BPM 60·90이 겹친 드래그 중간 차트에서 3333.33ms로 옮겨졌다가, 겹침을 되돌리면 다시 3000ms로 돌아온다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(3000);
    const sync = (chart: ChartDocument) => keeper.syncToChart({
      chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: RANGE_0_TO_60000,
    });

    sync(chartWith({ events: [bpmEvent(4, 60), bpmEvent(4, 90)] }));
    sync(chartWith());

    expect(playback.seekTo).toHaveBeenCalledTimes(2);
    expect(playback.seekTo.mock.calls[0][0]).toBeCloseTo(2000 + 2 * (60000 / 90), 9);
    expect(playback.seekTo.mock.calls[1][0]).toBe(3000);
  });

  it('첫 BPM 변경이 0박이 아니라 2박에 있는 차트(구조 위반)로 바뀌면 커서 1000ms를 seek하지 않는다', () => {
    const keeper = createKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);
    const startsAtBeat2 = chartWith();
    startsAtBeat2.events = startsAtBeat2.events.map(event => event.type === 'bpm' ? { ...event, beat: beat(2), bpm: 60 } : event);

    keeper.syncToChart({ chart: startsAtBeat2, loadGeneration: 1, cursorMs: playback.cursorMs, playback, timelineRange: RANGE_0_TO_60000 });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 0박 앞(음수 박) 커서 — 그리기 범위와 달리 커서 범위 아래 끝은 offset이다
// ---------------------------------------------------------------------------

describe('createCursorBeatKeeper — 0박 앞 커서', () => {
  it('offset 2000에서 0박 앞인 −1박 커서 1500ms는 offset 2010으로 바꾸면 새 0박인 2010ms로 자른다', () => {
    const keeper = createKeeper({ chart: chartWith({ offsetMs: 2000 }), loadGeneration: 1 });
    const playback = fakePlayback(1500);

    keeper.syncToChart({
      chart: chartWith({ offsetMs: 2010 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback,
      timelineRange: timelineRangeMsOf(2010, 60000),
    });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(2010);
  });

  it('offset 2000 차트를 열고 2001로 바꾸면 0박 커서는 2000→2001ms로 옮겨지고 Undo하면 2000ms로 돌아온다', () => {
    const chart = chartWith({ offsetMs: 2000 });
    useEditorStore.getState().loadChart(chart);
    const keeper = createKeeper({ chart, loadGeneration: 1 });
    const playback = fakePlayback(useEditorStore.getState().currentTimeMs);
    const sync = () => keeper.syncToChart({
      chart: useEditorStore.getState().chart, loadGeneration: 1, cursorMs: playback.cursorMs, playback,
      timelineRange: timelineRangeMsOf(useEditorStore.getState().chart.meta.offsetMs, 60000),
    });

    expect(playback.cursorMs).toBe(2000);
    useEditorStore.getState().setChart(chartWith({ offsetMs: 2001 }));
    sync();
    useEditorStore.getState().undo();
    sync();

    expect(playback.seekTo.mock.calls).toEqual([[2001], [2000]]);
  });

  it('offset 2000→100으로 −1박 커서 1500ms를 새 0박인 100ms에 묶고 offset을 2000으로 되돌려도 0박인 2000ms 안에 둔다', () => {
    const keeper = createKeeper({ chart: chartWith({ offsetMs: 2000 }), loadGeneration: 1 });
    const playback = fakePlayback(1500);
    const sync = (offsetMs: number) => keeper.syncToChart({
      chart: chartWith({ offsetMs }), loadGeneration: 1, cursorMs: playback.cursorMs, playback,
      timelineRange: timelineRangeMsOf(offsetMs, 60000),
    });

    sync(100);
    sync(2000);

    expect(playback.seekTo.mock.calls).toEqual([[100], [2000]]);
  });
});

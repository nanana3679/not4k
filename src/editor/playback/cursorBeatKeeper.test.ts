import { describe, expect, it, vi } from 'vitest';
import { beat, BEAT_ZERO } from '../../shared';
import type { BpmChange, ChartDocument, Lane } from '../../shared';
import {
  createCursorBeatKeeper,
  remapCursorMs,
  type CursorBeatKeeperPlayback,
} from './cursorBeatKeeper';

// ---------------------------------------------------------------------------
// remapCursorMs — 수정 전 타이밍의 커서 박을 수정 후 타이밍의 음원 시각으로 옮긴다(RFD 0099)
// ---------------------------------------------------------------------------

const BPM_120: BpmChange[] = [{ beat: BEAT_ZERO, bpm: 120 }]; // 500ms/beat

describe('remapCursorMs', () => {
  it('offset 0→100이면 커서 1000ms(2박)는 1100ms', () => {
    expect(remapCursorMs(1000, { bpmChanges: BPM_120, offsetMs: 0 }, { bpmChanges: BPM_120, offsetMs: 100 })).toBe(1100);
  });

  it('BPM 120→60이면 4박의 커서 2000ms는 4000ms', () => {
    expect(remapCursorMs(
      2000,
      { bpmChanges: BPM_120, offsetMs: 0 },
      { bpmChanges: [{ beat: BEAT_ZERO, bpm: 60 }], offsetMs: 0 },
    )).toBe(4000);
  });

  it('커서(2박, 1000ms)보다 뒤인 8박에 BPM 60 변경을 넣으면 커서는 1000ms 그대로', () => {
    expect(remapCursorMs(
      1000,
      { bpmChanges: BPM_120, offsetMs: 0 },
      { bpmChanges: [...BPM_120, { beat: beat(8), bpm: 60 }], offsetMs: 0 },
    )).toBe(1000);
  });

  it('커서(6박, 3000ms)보다 앞인 4박에 BPM 60 변경을 넣으면 커서는 2000 + 2×1000 = 4000ms', () => {
    expect(remapCursorMs(
      3000,
      { bpmChanges: BPM_120, offsetMs: 0 },
      { bpmChanges: [...BPM_120, { beat: beat(4), bpm: 60 }], offsetMs: 0 },
    )).toBe(4000);
  });

  it('BPM 60 변경을 4박에서 2박으로 옮기면 6박 커서는 4000ms → 1000 + 4×1000 = 5000ms', () => {
    expect(remapCursorMs(
      4000,
      { bpmChanges: [...BPM_120, { beat: beat(4), bpm: 60 }], offsetMs: 0 },
      { bpmChanges: [...BPM_120, { beat: beat(2), bpm: 60 }], offsetMs: 0 },
    )).toBe(5000);
  });

  it('4박의 BPM 60 변경을 지우면 6박 커서는 4000ms → 3000ms', () => {
    expect(remapCursorMs(
      4000,
      { bpmChanges: [...BPM_120, { beat: beat(4), bpm: 60 }], offsetMs: 0 },
      { bpmChanges: BPM_120, offsetMs: 0 },
    )).toBe(3000);
  });

  it('0박보다 앞(-1박)인 커서 0ms는 offset 500→700이면 200ms', () => {
    expect(remapCursorMs(0, { bpmChanges: BPM_120, offsetMs: 500 }, { bpmChanges: BPM_120, offsetMs: 700 })).toBe(200);
  });

  it('offset과 BPM 목록이 값으로 같으면 배열 참조가 달라도 커서 1234.5ms를 그대로 돌려준다', () => {
    expect(remapCursorMs(
      1234.5,
      { bpmChanges: [{ beat: beat(0), bpm: 120 }, { beat: beat(4), bpm: 90 }], offsetMs: 30 },
      { bpmChanges: [{ beat: beat(0), bpm: 120 }, { beat: beat(8, 2), bpm: 90 }], offsetMs: 30 },
    )).toBe(1234.5);
  });

  it('수정 전이나 후의 BPM 목록이 비어 있으면(구조 위반 차트) 커서 1000ms를 그대로 둔다', () => {
    expect(remapCursorMs(1000, { bpmChanges: [], offsetMs: 0 }, { bpmChanges: BPM_120, offsetMs: 100 })).toBe(1000);
    expect(remapCursorMs(1000, { bpmChanges: BPM_120, offsetMs: 0 }, { bpmChanges: [], offsetMs: 100 })).toBe(1000);
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

/** PlaybackController처럼 seekTo가 store의 커서(cursorMs)도 함께 옮기는 가짜 재생기. */
function fakePlayback(cursorMs: number, isPlaying = false) {
  const playback = {
    isPlaying,
    cursorMs,
    seekTo: vi.fn((timeMs: number) => { playback.cursorMs = timeMs; }),
  } satisfies CursorBeatKeeperPlayback & { cursorMs: number };
  return playback;
}

const noClamp = (ms: number) => ms;

describe('createCursorBeatKeeper', () => {
  it('정지 중 offset을 0→100으로 바꾸면 커서 1000ms를 같은 2박의 1100ms로 seek한다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.chartChanged({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(1100);
  });

  it('정지 중 초기 BPM을 120→60으로 바꾸면 4박의 커서 2000ms를 4000ms로 seek한다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(2000);

    keeper.chartChanged({ chart: chartWithInitialBpm(60), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(4000);
  });

  it('새 박의 시각 4000ms가 마디 범위 끝 3000ms를 넘으면 clampMs가 돌려준 3000ms로 seek한다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(2000);
    const clampMs = vi.fn((ms: number) => Math.min(ms, 3000));

    keeper.chartChanged({ chart: chartWithInitialBpm(60), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs });

    expect(clampMs).toHaveBeenCalledWith(4000);
    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(3000);
  });

  it('일시정지 뒤 커서를 3000ms(6박)로 seek하고 BPM을 120→60으로 바꾸면 정지 위치가 아니라 seek한 6박의 6000ms로 seek한다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);
    playback.seekTo(3000);
    playback.seekTo.mockClear();

    keeper.chartChanged({ chart: chartWithInitialBpm(60), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(6000);
  });

  it('offset을 0→100→250으로 두 번 바꾸면 커서는 1000 → 1100 → 1250ms로 매번 수정 직전 박(2박)을 유지한다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.chartChanged({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });
    keeper.chartChanged({ chart: chartWith({ offsetMs: 250 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo.mock.calls).toEqual([[1100], [1250]]);
    expect(playback.cursorMs).toBe(1250);
  });

  it('재생 중에는 offset을 0→100으로 바꿔도 seek하지 않는다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000, true);

    keeper.chartChanged({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('재생 중 offset 0→100 변경 뒤 정지해 100→200으로 바꾸면 기준은 100이라 커서 1000ms를 1100ms로 seek한다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000, true);
    keeper.chartChanged({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });
    playback.isPlaying = false;

    keeper.chartChanged({ chart: chartWith({ offsetMs: 200 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(1100);
  });

  it('chartLoadGeneration이 1→2로 바뀐 차트 교체(새로 불러옴)는 offset이 0→500으로 달라도 seek하지 않는다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.chartChanged({ chart: chartWith({ offsetMs: 500 }), loadGeneration: 2, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('새로 불러온 차트(offset 500)에서 offset을 600으로 바꾸면 불러온 타이밍을 기준으로 커서 1000ms를 1100ms로 seek한다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);
    keeper.chartChanged({ chart: chartWith({ offsetMs: 500 }), loadGeneration: 2, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    keeper.chartChanged({ chart: chartWith({ offsetMs: 600 }), loadGeneration: 2, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(1100);
  });

  it('8박에 박자표 3/4 변경만 더하면 박↔시각 변환이 같아 seek하지 않는다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.chartChanged({
      chart: chartWith({ events: [{ type: 'timeSignature', beat: beat(8), beatPerMeasure: beat(3), editorLane: 2 }] }),
      loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp,
    });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('노트만 더한 차트 교체는 seek하지 않는다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.chartChanged({
      chart: chartWith({ notes: [{ type: 'tap', kind: 'single', lane: 1 as Lane, beat: beat(2) }] }),
      loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp,
    });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('커서(2박)보다 뒤인 8박에 BPM 60 변경을 더하면 커서 시각이 그대로라 seek하지 않는다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    const playback = fakePlayback(1000);

    keeper.chartChanged({
      chart: chartWith({ events: [{ type: 'bpm', beat: beat(8), bpm: 60, editorLane: 1 }] }),
      loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp,
    });

    expect(playback.seekTo).not.toHaveBeenCalled();
  });

  it('재생기가 아직 없으면(null) seek 없이 넘어가고, 그 뒤 offset 100→200 수정은 100을 기준으로 커서 1000ms를 1100ms로 seek한다', () => {
    const keeper = createCursorBeatKeeper({ chart: chartWith(), loadGeneration: 1 });
    keeper.chartChanged({ chart: chartWith({ offsetMs: 100 }), loadGeneration: 1, cursorMs: 1000, playback: null, clampMs: noClamp });
    const playback = fakePlayback(1000);

    keeper.chartChanged({ chart: chartWith({ offsetMs: 200 }), loadGeneration: 1, cursorMs: playback.cursorMs, playback, clampMs: noClamp });

    expect(playback.seekTo).toHaveBeenCalledExactlyOnceWith(1100);
  });
});

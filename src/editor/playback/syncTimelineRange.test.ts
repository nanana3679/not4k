import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import { useEditorStore } from '../stores/editorStore';
import { timelineRangeMsOf } from '../timeline/timelineRange';
import { createCursorBeatKeeper } from './cursorBeatKeeper';
import { PlaybackController } from './PlaybackController';
import { syncTimelineRange } from './syncTimelineRange';

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

function setupTimeline() {
  const store = useEditorStore;
  store.getState().loadChart({
    ...store.getState().chart,
    meta: { ...store.getState().chart.meta, offsetMs: 0 },
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ],
  });
  const playback = new PlaybackController({
    getCursorTimeMs: () => store.getState().currentTimeMs,
    onTimeUpdate: store.getState().setCurrentTimeMs,
    onPlayStateChange: store.getState().setIsPlaying,
  });
  const cursorBeatKeeper = createCursorBeatKeeper(store);
  const sync = (endTimeMs: number) => syncTimelineRange({
    store, playback, cursorBeatKeeper, timelineRange: timelineRangeMsOf(0, endTimeMs),
  });
  sync(60000);
  playback.seekTo(30000);
  return { store, playback, sync };
}

describe('syncTimelineRange — 렌더러 커서 동기화', () => {
  it('offset 100의 커서 100ms에서 렌더러가 늦게 준비되면 100ms를 그리고 cursorMoveCount를 유지한다', () => {
    const { store, playback } = setupTimeline();
    store.getState().loadChart({
      ...store.getState().chart,
      meta: { ...store.getState().chart.meta, offsetMs: 100 },
    });
    const cursorBeatKeeper = createCursorBeatKeeper(store);
    const renderer = { updatePlaybackCursor: vi.fn() };
    const moveCount = store.getState().cursorMoveCount;

    syncTimelineRange({
      store, playback, cursorBeatKeeper, renderer,
      timelineRange: timelineRangeMsOf(100, 60000),
    });

    expect(renderer.updatePlaybackCursor).toHaveBeenCalledExactlyOnceWith(100);
    expect(store.getState().currentTimeMs).toBe(100);
    expect(store.getState().cursorMoveCount).toBe(moveCount);
    playback.dispose();
  });

  it('파형 끝이 60000→10000ms로 줄면 커서를 자른 뒤 10000ms를 그리고 같은 범위 재적용은 이동 횟수를 유지한다', () => {
    const { store, playback } = setupTimeline();
    const cursorBeatKeeper = createCursorBeatKeeper(store);
    const renderer = { updatePlaybackCursor: vi.fn() };
    const moveCount = store.getState().cursorMoveCount;
    const sync = () => syncTimelineRange({
      store, playback, cursorBeatKeeper, renderer,
      timelineRange: timelineRangeMsOf(0, 10000),
    });

    sync();
    sync();

    expect(renderer.updatePlaybackCursor.mock.calls).toEqual([[10000], [10000]]);
    expect(store.getState().currentTimeMs).toBe(10000);
    expect(store.getState().cursorMoveCount).toBe(moveCount + 1);
    playback.dispose();
  });
});

describe('syncTimelineRange — 차트 변경 없는 음원 교체', () => {
  it('120 BPM에서 60초 음원을 10초로 교체하면 커서 30000ms를 새 끝 10000ms로 옮긴다', () => {
    const { store, playback, sync } = setupTimeline();
    const chart = store.getState().chart;

    sync(10000);

    expect(store.getState().chart).toBe(chart);
    expect(store.getState().timelineRangeMs?.totalTimelineMs).toBe(10000);
    expect(store.getState().currentTimeMs).toBe(10000);
    expect(playback.currentTimeMs).toBe(10000);
    playback.dispose();
  });

  it('120 BPM에서 10초 음원 끝 10000ms에 묶인 뒤 60초로 교체하면 원래 60박인 30000ms로 돌아온다', () => {
    const { store, playback, sync } = setupTimeline();
    sync(10000);
    expect(playback.currentTimeMs).toBe(10000);

    sync(60000);

    expect(store.getState().currentTimeMs).toBe(30000);
    expect(playback.currentTimeMs).toBe(30000);
    playback.dispose();
  });
});

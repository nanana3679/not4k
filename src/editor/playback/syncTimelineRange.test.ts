import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import { useEditorStore } from '../stores/editorStore';
import { timelineRangeMsOf } from '../timeline/timelineRange';
import { createCursorBeatKeeper } from './cursorBeatKeeper';
import { PlaybackController } from './PlaybackController';
import { syncTimelineRange } from './syncTimelineRange';

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('10초 음원 로드 완료 전 30000→20000ms로 seek하면 10000ms에 묶이고 60초로 늘릴 때 20000ms로 돌아온다', async () => {
    const { store, playback, sync } = setupTimeline();
    let finishDecode!: (buffer: AudioBuffer) => void;
    const decoded = new Promise<AudioBuffer>((resolve) => { finishDecode = resolve; });
    vi.stubGlobal('AudioContext', function () {
      return {
        destination: {},
        createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
        decodeAudioData: () => decoded,
        close: () => {},
      };
    });
    const loading = playback.loadAudioFile(new File([''], 'replacement.wav')).then(() => {
      sync(playback.durationMs);
    });

    playback.seekTo(20000);
    finishDecode({ duration: 10 } as AudioBuffer);
    await loading;

    expect(store.getState().currentTimeMs).toBe(10000);
    expect(playback.currentTimeMs).toBe(10000);
    sync(60000);
    expect(store.getState().currentTimeMs).toBe(20000);
    expect(playback.currentTimeMs).toBe(20000);
    playback.dispose();
  });
});

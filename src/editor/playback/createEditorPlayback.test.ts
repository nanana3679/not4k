import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../stores/editorStore';
import { timelineRangeMsOf } from '../timeline/timelineRange';
import { createCursorBeatKeeper } from './cursorBeatKeeper';
import { createEditorPlayback } from './createEditorPlayback';
import { syncTimelineRange } from './syncTimelineRange';

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setupPlayback() {
  const store = useEditorStore;
  const cursorBeatKeeper = createCursorBeatKeeper(store);
  let totalTimelineMs = 60000;
  const renderer = {
    setWaveformData: vi.fn((_peaks: Float32Array, durationMs: number) => { totalTimelineMs = durationMs; }),
    getTotalTimelineMs: () => totalTimelineMs,
    updatePlaybackCursor: vi.fn(),
  };
  const setLoadedAudioBuffer = vi.fn();
  const { playback, waveformFeed } = createEditorPlayback({
    store, cursorBeatKeeper, getRenderer: () => renderer, setLoadedAudioBuffer,
  });
  const sync = (endTimeMs: number) => syncTimelineRange({
    store, playback, cursorBeatKeeper,
    timelineRange: timelineRangeMsOf(store.getState().chart.meta.offsetMs, endTimeMs),
  });
  sync(60000);
  playback.seekTo(30000);
  return { store, playback, sync, waveformFeed, renderer, setLoadedAudioBuffer };
}

function audioBuffer(duration: number): AudioBuffer {
  return {
    duration, sampleRate: 50, numberOfChannels: 1, length: 1,
    getChannelData: () => new Float32Array([0.5]),
    copyFromChannel: vi.fn(), copyToChannel: vi.fn(),
  };
}

describe('createEditorPlayback — 음원 로드 완료', () => {
  it.each([true, false])('렌더러 준비=%s에서 60초 URL이 먼저 완료되면 늦은 10초 파일은 파형·60000ms 범위·30000ms 커서를 바꾸지 않는다', async (rendererReady) => {
    let finishOldDecode!: (buffer: AudioBuffer) => void;
    const oldDecoded = new Promise<AudioBuffer>(resolve => { finishOldDecode = resolve; });
    const latestBuffer = audioBuffer(60);
    const decodeAudioData = vi.fn().mockReturnValueOnce(oldDecoded).mockResolvedValueOnce(latestBuffer);
    vi.stubGlobal('AudioContext', function () {
      return {
        createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
        decodeAudioData, close: () => {},
      };
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(0))));
    const { store, playback, waveformFeed, renderer, setLoadedAudioBuffer } = setupPlayback();
    if (rendererReady) waveformFeed.rendererReady();
    const moveCount = store.getState().cursorMoveCount;
    const oldLoading = playback.loadAudioFile(new File([''], 'old.wav'));
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));

    await playback.loadAudioUrl('https://audio.invalid/latest.wav');
    finishOldDecode(audioBuffer(10));
    await oldLoading;
    if (!rendererReady) waveformFeed.rendererReady();

    expect(playback.audioBufferData).toBe(latestBuffer);
    expect(setLoadedAudioBuffer).toHaveBeenCalledExactlyOnceWith(latestBuffer);
    expect(renderer.setWaveformData).toHaveBeenCalledExactlyOnceWith(new Float32Array([0.5]), 60000);
    expect(renderer.updatePlaybackCursor).toHaveBeenCalledExactlyOnceWith(30000);
    expect(store.getState().timelineRangeMs?.totalTimelineMs).toBe(60000);
    expect(store.getState().currentTimeMs).toBe(30000);
    expect(playback.currentTimeMs).toBe(30000);
    expect(store.getState().cursorMoveCount).toBe(moveCount);
    playback.dispose();
  });

  it('10초 로드 중 30000→20000ms로 seek하면 완료 시 10000ms로 자르고 60초 재로드는 20000ms를 복원한다', async () => {
    let finishDecode!: (buffer: AudioBuffer) => void;
    const decoded = new Promise<AudioBuffer>(resolve => { finishDecode = resolve; });
    const decodeAudioData = vi.fn().mockReturnValueOnce(decoded).mockResolvedValueOnce(audioBuffer(60));
    vi.stubGlobal('AudioContext', function () {
      return {
        createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
        decodeAudioData, close: () => {},
      };
    });
    const { store, playback, waveformFeed, renderer, setLoadedAudioBuffer } = setupPlayback();
    waveformFeed.rendererReady();
    const loading = playback.loadAudioFile(new File([''], 'replacement.wav'));
    playback.seekTo(20000);

    const shorterBuffer = audioBuffer(10);
    finishDecode(shorterBuffer);
    await loading;

    expect(store.getState().currentTimeMs).toBe(10000);
    expect(playback.currentTimeMs).toBe(10000);
    expect(setLoadedAudioBuffer).toHaveBeenCalledExactlyOnceWith(shorterBuffer);
    expect(renderer.updatePlaybackCursor).toHaveBeenLastCalledWith(10000);
    await playback.loadAudioFile(new File([''], 'longer.wav'));
    expect(store.getState().currentTimeMs).toBe(20000);
    expect(playback.currentTimeMs).toBe(20000);
    expect(renderer.updatePlaybackCursor).toHaveBeenLastCalledWith(20000);
    playback.dispose();
  });
});

describe('createEditorPlayback — 일시정지 경계', () => {
  it('재생 중 끝이 60000→10000ms로 줄면 30000ms를 유지하다 일시정지 시 10000ms로 자른다', async () => {
    vi.stubGlobal('AudioContext', function () {
      return {
        currentTime: 0,
        createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
        decodeAudioData: async () => ({ duration: 10 }),
        close: () => {},
      };
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { store, playback, sync } = setupPlayback();
    await playback.loadAudioFile(new File([''], 'test.wav'));
    playback.play();

    sync(10000);
    expect(store.getState().currentTimeMs).toBe(30000);
    playback.pause();

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTimeMs).toBe(10000);
    expect(playback.currentTimeMs).toBe(10000);
    playback.dispose();
  });

  it('재생 중 offset이 0→40000ms로 바뀐 상태가 되면 일시정지 시 커서 30000ms를 새 0박인 40000ms로 자른다', async () => {
    vi.stubGlobal('AudioContext', function () {
      return {
        currentTime: 0,
        createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
        decodeAudioData: async () => audioBuffer(10),
        close: () => {},
      };
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { store, playback, sync } = setupPlayback();
    await playback.loadAudioFile(new File([''], 'test.wav'));
    playback.play();
    const chart = store.getState().chart;
    // 재생 중 setChart는 편집 제한(RFD 0099)으로 거부되므로, 정지 시 범위 재확인(방어 장치)을 보려고
    // 재생 중에 범위가 바뀐 상태를 store에 직접 만든다.
    store.setState({ chart: { ...chart, meta: { ...chart.meta, offsetMs: 40000 } } });
    sync(60000);
    expect(store.getState().currentTimeMs).toBe(30000);

    playback.pause();

    expect(store.getState().currentTimeMs).toBe(40000);
    expect(playback.currentTimeMs).toBe(40000);
    playback.dispose();
  });

  it('30000ms의 박을 기억한 뒤 재생 tick이 31000ms를 알리면 일시정지해도 30000ms로 되돌아가지 않는다', async () => {
    const context = {
      currentTime: 0,
      createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
      decodeAudioData: async () => audioBuffer(10),
      close: () => {},
    };
    vi.stubGlobal('AudioContext', function () { return context; });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { store, playback, sync } = setupPlayback();
    sync(60000);
    await playback.loadAudioFile(new File([''], 'test.wav'));
    playback.play();
    context.currentTime = 1;
    vi.mocked(requestAnimationFrame).mock.calls[0][0](0);
    const moveCount = store.getState().cursorMoveCount;

    playback.pause();

    expect(store.getState().currentTimeMs).toBe(31000);
    expect(playback.currentTimeMs).toBe(31000);
    expect(store.getState().cursorMoveCount).toBe(moveCount);
    playback.dispose();
  });
});

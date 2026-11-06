import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../../shared';
import { handleEditorKeyDown } from '../hooks/useEditorKeyboard';
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
    // 실제 렌더러처럼 파형이 없으면(길이 0) 기본 길이로 돌아간다.
    setWaveformData: vi.fn((_peaks: Float32Array | null, durationMs: number) => { totalTimelineMs = durationMs > 0 ? durationMs : 16000; }),
    getTotalTimelineMs: () => totalTimelineMs,
    setChart: vi.fn(),
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

describe('createEditorPlayback — 음원 비우기', () => {
  function stubDecoder(duration: number) {
    vi.stubGlobal('AudioContext', function () {
      return {
        createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
        decodeAudioData: vi.fn().mockResolvedValue(audioBuffer(duration)), close: () => {},
      };
    });
  }

  it('곡 길이 60초인 음원을 비우면 파형만 비우고 타임라인 끝 60000ms·스크롤 900·커서 30000ms를 유지한다', async () => {
    stubDecoder(60);
    const { store, playback, waveformFeed, renderer } = setupPlayback();
    waveformFeed.rendererReady();
    await playback.loadAudioFile(new File([''], 'a.wav'));
    useEditorStore.setState({ song: { duration: 60 } as NonNullable<ReturnType<typeof useEditorStore.getState>['song']> });
    store.getState().setViewportHeightPx(600);
    store.getState().setScrollY(900);
    const scrollY = store.getState().scrollY;
    expect(scrollY).toBe(900);

    playback.clearAudio();

    expect(renderer.setWaveformData).toHaveBeenLastCalledWith(null, 60000);
    expect(store.getState().timelineRangeMs?.totalTimelineMs).toBe(60000);
    expect(store.getState().scrollY).toBe(scrollY);
    expect(store.getState().currentTimeMs).toBe(30000);
    playback.dispose();
  });

  it('Undo가 곡 길이를 120초로 되돌린 뒤 60초 음원을 비우면 타임라인 끝이 복원한 곡 길이 120000ms다', async () => {
    stubDecoder(60);
    const { store, playback, waveformFeed, renderer } = setupPlayback();
    waveformFeed.rendererReady();
    await playback.loadAudioFile(new File([''], 'a.wav'));
    useEditorStore.setState({ song: { duration: 120 } as NonNullable<ReturnType<typeof useEditorStore.getState>['song']> });

    playback.clearAudio();

    expect(renderer.setWaveformData).toHaveBeenLastCalledWith(null, 120000);
    expect(store.getState().timelineRangeMs?.totalTimelineMs).toBe(120000);
    playback.dispose();
  });

  it('곡 길이를 모르는 곡의 음원을 비우면 타임라인이 기본 16000ms로 돌아가 커서를 자르고, 60초를 다시 불러오면 30000ms를 복원한다', async () => {
    stubDecoder(60);
    const { store, playback, waveformFeed, renderer } = setupPlayback();
    waveformFeed.rendererReady();
    await playback.loadAudioFile(new File([''], 'a.wav'));
    expect(store.getState().timelineRangeMs?.totalTimelineMs).toBe(60000);

    playback.clearAudio();

    expect(renderer.setWaveformData).toHaveBeenLastCalledWith(null, 0);
    expect(store.getState().timelineRangeMs?.totalTimelineMs).toBe(16000);
    expect(store.getState().currentTimeMs).toBe(16000);
    expect(renderer.updatePlaybackCursor).toHaveBeenLastCalledWith(16000);

    await playback.loadAudioFile(new File([''], 'a.wav'));

    expect(store.getState().timelineRangeMs?.totalTimelineMs).toBe(60000);
    expect(store.getState().currentTimeMs).toBe(30000);
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

describe('createEditorPlayback — 재생 시작 전 편집 취소(RFD 0099)', () => {
  // 120 BPM에서 4박에 BPM 60으로 바뀐다. 6박 = 4박(2000ms) + 2박 × 1000ms = 4000ms.
  const bpm60At = (at: number) => ({ type: 'bpm' as const, beat: beat(at), bpm: 60 });

  it.each<[string, 'selectModeEdit' | 'erase', ReturnType<typeof bpm60At>[]]>([
    ['4박 BPM 60 이벤트를 8박으로 옮기는 이동 드래그', 'selectModeEdit', [bpm60At(8)]],
    ['4박 BPM 60 이벤트를 지우는 우클릭 삭제', 'erase', []],
  ])('%s가 6박 커서를 4000→3000ms로 옮긴 채 Space를 누르면 편집을 취소하고 6박인 4000ms부터 재생한다', async (_gesture, kind, edited) => {
    const source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    vi.stubGlobal('AudioContext', function () {
      return {
        currentTime: 0,
        createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
        createBufferSource: () => source,
        decodeAudioData: async () => audioBuffer(10),
        close: () => {},
      };
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const initial = useEditorStore.getState().chart;
    const timed = { ...initial, events: [...initial.events, bpm60At(4)] };
    useEditorStore.setState({ chart: timed });
    const { store, playback, sync } = setupPlayback();
    await playback.loadAudioFile(new File([''], 'test.wav'));
    playback.seekTo(4000);

    // 정지 중 드래그 프레임: 차트 effect가 커서 박 유지로 6박을 새 타이밍의 3000ms로 옮긴다.
    const onInterrupt = vi.fn();
    const token = store.getState().beginEditTransaction(kind, onInterrupt)!;
    store.getState().setChart({ ...timed, events: [...initial.events, ...edited] }, { transaction: token });
    sync(60000);
    expect(store.getState().currentTimeMs).toBe(3000);

    handleEditorKeyDown({ key: ' ', ctrlKey: false, metaKey: false, shiftKey: false, preventDefault() {} }, {
      mode: 'select', selectMode: null, playback, bpmChanges: [], offsetMs: 0,
      shortcutsBlocked: false, isPlaying: false, setMode: vi.fn(), addToast: vi.fn(),
    });

    expect(store.getState().editTransaction).toBeNull();
    expect(onInterrupt).toHaveBeenCalledOnce();
    expect(store.getState().chart).toBe(timed);
    expect(store.getState().historyPast).toHaveLength(0);
    expect(store.getState().isPlaying).toBe(true);
    expect(source.start).toHaveBeenCalledExactlyOnceWith(0, 4);
    expect(playback.currentTimeMs).toBe(4000);
    expect(store.getState().currentTimeMs).toBe(4000);
    playback.dispose();
  });
});

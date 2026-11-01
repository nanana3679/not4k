import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditorApp from '../App';
import { useEditorAudioLoad } from './useEditorAudioLoad';
import { useEditorStore } from '../stores/editorStore';
import { useGameStore } from '../../game/stores';
import { openEditorChart } from '../openEditorChart';
import { createEditorPlayback } from '../playback/createEditorPlayback';
import { createCursorBeatKeeper } from '../playback/cursorBeatKeeper';
import { performPlayTest } from '../playtest/performPlayTest';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { encodeWavBlob } from '../../shared';
import { isSongDirty } from '../songState';
import { fetchSongSharedData } from '../../supabase/songSharedData';
import { showToast } from '../../shared/toast';

// DOM 없이 App의 복귀 effect와 같은 오디오 훅을 실행한다. store·재생기·테스트 진입은 실제 구현이다.
const lifecycle = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => void | (() => void)) => { lifecycle.effects.push(effect); },
}));
vi.mock('../stores', async original => {
  const actual = await original<typeof import('../stores')>();
  const store = actual.useEditorStore;
  return { ...actual, useEditorStore: Object.assign(
    <T,>(select: (state: ReturnType<typeof store.getState>) => T) => select(store.getState()), store,
  ) };
});
vi.mock('../../shared/hooks/useAuth', () => ({ useAuth: () => ({ user: {}, isAdmin: true, loading: false }) }));
vi.mock('../../shared/toast', () => ({ showToast: vi.fn() }));
vi.mock('../../supabase/songSharedData', () => ({ fetchSongSharedData: vi.fn() }));
vi.mock('../../supabase/client', () => ({ supabase: {
  storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://audio.invalid/${path}` } }) }) },
} }));

const state = () => useEditorStore.getState();
const loadedSong = {
  title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: 'saved.wav', duration: 10,
  previewUrl: 'preview.wav', previewStart: 0, previewEnd: 1,
  gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null,
  timing: null, revision: 42,
};
const decoded: AudioBuffer = {
  duration: 2, sampleRate: 4, numberOfChannels: 1, length: 8,
  getChannelData: () => new Float32Array([0.5, 0, -0.5, 0, 0.5, 0, -0.5, 0]),
  copyFromChannel: vi.fn(), copyToChannel: vi.fn(),
};
const controllers: Array<ReturnType<typeof createEditorPlayback>['playback']> = [];
const decodeAudioData = vi.fn(async (_bytes: ArrayBuffer) => decoded);

function newPlayback() {
  const setLoadedAudioBuffer = vi.fn();
  const { playback } = createEditorPlayback({ store: useEditorStore,
    cursorBeatKeeper: createCursorBeatKeeper(useEditorStore), getRenderer: () => null, setLoadedAudioBuffer });
  controllers.push(playback);
  return { playback, setLoadedAudioBuffer };
}

function runEffects() {
  lifecycle.effects.splice(0).forEach(effect => effect());
}

async function returnToEditor() {
  renderToStaticMarkup(createElement(EditorApp));
  runEffects();
  // 조회 mock이 즉시 resolve하므로 App의 then에서 오디오 요청을 준비한 뒤 훅을 마운트한다.
  await Promise.resolve();
  const { playback, setLoadedAudioBuffer } = newPlayback();
  function AudioLoadProbe() {
    useEditorAudioLoad({ current: playback }, setLoadedAudioBuffer);
    return null;
  }
  renderToStaticMarkup(createElement(AudioLoadProbe));
  runEffects();
  return { playback, setLoadedAudioBuffer };
}

beforeEach(() => {
  vi.clearAllMocks();
  lifecycle.effects.length = 0;
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  useGameStore.setState(useGameStore.getInitialState(), true);
  vi.mocked(fetchSongSharedData).mockResolvedValue(loadedSong);
  vi.stubGlobal('window', { location: { pathname: '/editor', search: '?songId=song&difficulty=normal' } });
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('connect-src: 네트워크·blob fetch 차단'); }));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('AudioContext', function () {
    return { currentTime: 0, destination: {},
      createGain: () => ({ gain: { value: 1 }, connect: vi.fn() }),
      decodeAudioData, close: vi.fn(),
      createBufferSource: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }),
    };
  });
  openEditorChart({ chart: structuredClone(explicitPlaytestCharts[0].chart), extraLaneCount: 2, hasExtraLaneCount: true }, loadedSong);
  state().setActiveSongId('song');
});

afterEach(() => {
  controllers.splice(0).forEach(playback => playback.dispose());
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  useGameStore.setState(useGameStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

it('2초 음원을 Meta에 적용하고 미저장 테스트 플레이에서 복귀하면 fetch 없이 재생·1초 프리뷰 생성이 가능하고 대기 File·리비전 42를 유지한다', async () => {
  const file = new File(['replacement'], 'replacement.wav');
  const before = newPlayback();
  await before.playback.loadAudioFile(file);
  // Meta 적용 후의 초안: 파일은 다음 곡 저장까지 store에 남는다.
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, audioFile: file.name } });
  state().setSong({ ...state().song!, pendingAudioFile: file, duration: 2 });
  const draft = state().chart;
  const baseline = state().song!.baseline;
  const savedChartJson = state().savedChartJson;
  expect(performPlayTest({
    fromCursor: false, audioBuffer: before.playback.audioBufferData, isPlaying: false,
    pause: () => before.playback.pause(), chart: draft, currentTimeMs: 0,
    returnUrl: '/editor?songId=song&difficulty=normal', game: useGameStore.getState(),
    addToast: state().addToast, closeMenu: vi.fn(), navigate: vi.fn(),
  })).toBe(true);
  expect(useGameStore.getState().explicitPlay?.audioBuffer).toBe(decoded);
  before.playback.dispose();
  useGameStore.getState().clearExplicitPlayTest();

  const restored = await returnToEditor();
  await vi.waitFor(() => expect(restored.playback.audioBufferData).toBe(decoded));
  expect(restored.setLoadedAudioBuffer).toHaveBeenCalledExactlyOnceWith(decoded);
  expect(decodeAudioData).toHaveBeenNthCalledWith(2, await file.arrayBuffer());
  expect(fetch).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
  restored.playback.play();
  expect(restored.playback.isPlaying).toBe(true);
  expect(encodeWavBlob(restored.playback.audioBufferData!, 0, 1).size).toBe(52);
  expect(state().song?.pendingAudioFile).toBe(file);
  expect(state().song?.revision).toBe(42);
  expect(state().song?.baseline).toBe(baseline);
  expect(state().chart).toBe(draft);
  expect(state().savedChartJson).toBe(savedChartJson);
  expect(isSongDirty(state().chart, state().song)).toBe(true);
});

it('대기 File 없이 복귀하면 초안의 stale.wav 대신 다시 조회한 latest.wav를 1회 로드하고 초안·저장 기준은 유지한다', async () => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, audioFile: 'stale.wav' } });
  const draft = state().chart;
  const song = state().song;
  vi.mocked(fetchSongSharedData).mockResolvedValue({ ...loadedSong, audioUrl: 'latest.wav' });
  vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));

  const restored = await returnToEditor();
  await vi.waitFor(() => expect(restored.playback.audioBufferData).toBe(decoded));

  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://audio.invalid/latest.wav');
  expect(state().chart).toBe(draft);
  expect(state().song).toBe(song);
  expect(state().pendingAudioUrl).toBeNull();
});

it.each([
  ['곡 행이 없음', null],
  ['곡 음원 경로가 빈 문자열', { ...loadedSong, audioUrl: '' }],
] as const)('%s이고 대기 File 없이 복귀하면 차트의 음원 경로를 대신 fetch하지 않는다', async (_condition, loaded) => {
  vi.mocked(fetchSongSharedData).mockResolvedValue(loaded);
  const restored = await returnToEditor();

  expect(restored.playback.audioBufferData).toBeNull();
  expect(restored.setLoadedAudioBuffer).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

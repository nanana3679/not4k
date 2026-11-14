import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorApp from '../App';
import { startEditorAudioLoad, useEditorAudioLoad } from './useEditorAudioLoad';
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
  // App의 복귀 effect가 오디오 요청을 정한 뒤 훅을 마운트한다.
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
  // Meta 적용 후의 지금 값: 파일은 다음 곡 저장까지 store에 남는다.
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, audioFile: file.name } });
  state().setSong({ ...state().song!, pendingAudioFile: file, duration: 2 });
  const draft = state().chart;
  const lastSaved = state().song!.lastSaved;
  const lastSavedChartJson = state().lastSavedChartJson;
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
  expect(state().song?.lastSaved).toBe(lastSaved);
  expect(state().chart).toBe(draft);
  expect(state().lastSavedChartJson).toBe(lastSavedChartJson);
  expect(isSongDirty(state().chart, state().song)).toBe(true);
});

it('대기 File 없이 복귀하면 곡 행을 조회하지 않고 지금 값의 stale.wav를 1회 로드하며 지금 값·마지막 저장 값은 유지한다', async () => {
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, audioFile: 'stale.wav' } });
  const draft = state().chart;
  const song = state().song;
  vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));

  const restored = await returnToEditor();
  await vi.waitFor(() => expect(restored.playback.audioBufferData).toBe(decoded));

  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://audio.invalid/stale.wav');
  expect(fetchSongSharedData).not.toHaveBeenCalled();
  expect(state().chart).toBe(draft);
  expect(state().song).toBe(song);
  expect(state().pendingAudioUrl).toBeNull();
});

it('곡 음원 경로가 빈 문자열인 곡으로 복귀하면 fetch 없이 재생기 음원이 없고 알림도 없다', async () => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  openEditorChart({ chart: structuredClone(explicitPlaytestCharts[0].chart), extraLaneCount: 2, hasExtraLaneCount: true }, { ...loadedSong, audioUrl: '' });
  state().setActiveSongId('song');

  const restored = await returnToEditor();

  expect(fetch).not.toHaveBeenCalled();
  expect(restored.playback.audioBufferData).toBeNull();
  expect(restored.setLoadedAudioBuffer).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it('곡 행이 없는 차트(song=null)에 Meta에서 고른 local.wav로 복귀하면 공개 URL을 fetch하지 않고 Audio load failed도 없다', async () => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  openEditorChart({ chart: structuredClone(explicitPlaytestCharts[0].chart), extraLaneCount: 2, hasExtraLaneCount: true }, null);
  state().setActiveSongId('song');
  state().applyMetaEdit({ audioFile: 'local.wav' });
  expect(state().song).toBeNull();

  const restored = await returnToEditor();
  await Promise.resolve();

  expect(fetch).not.toHaveBeenCalled();
  expect(fetchSongSharedData).not.toHaveBeenCalled();
  expect(restored.playback.audioBufferData).toBeNull();
  expect(showToast).not.toHaveBeenCalled();
});

it('대기 File이 있는 채 복귀하면 곡 행 조회 없이 대기 File로 음원을 복원하고 알림 없이 지금 값을 유지한다', async () => {
  const file = new File(['replacement'], 'replacement.wav');
  state().setChart({ ...state().chart, meta: { ...state().chart.meta, audioFile: file.name } });
  state().setSong({ ...state().song!, pendingAudioFile: file, duration: 2 });
  const draft = state().chart;

  const restored = await returnToEditor();

  await vi.waitFor(() => expect(restored.playback.audioBufferData).toBe(decoded));
  await Promise.resolve();
  expect(fetchSongSharedData).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
  expect(state().chart).toBe(draft);
  expect(state().song?.pendingAudioFile).toBe(file);
  expect(fetch).not.toHaveBeenCalled();
});

it('재마운트 뒤 saved.wav 재로드 중 Meta 창 선택 취소가 restoreAudioBuffer로 B를 되돌리고 옛 fetch가 실패하면 표시 음원을 비우지 않고 알림도 없다', async () => {
  let failFetch!: (reason: Error) => void;
  vi.mocked(fetch).mockReturnValue(new Promise<Response>((_resolve, reject) => { failFetch = reject; }));
  const restored = await returnToEditor();
  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://audio.invalid/saved.wav');

  restored.playback.restoreAudioBuffer(decoded);
  failFetch(new TypeError('Failed to fetch'));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve));

  expect(restored.setLoadedAudioBuffer).toHaveBeenCalledExactlyOnceWith(decoded);
  expect(restored.playback.audioBufferData).toBe(decoded);
  expect(showToast).not.toHaveBeenCalled();
});

it('saved.wav fetch가 지금 재생기의 최신 로드로 실패하면 표시 음원을 비우고 Audio load failed 알림을 1회 띄운다', async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

  const restored = await returnToEditor();

  await vi.waitFor(() => expect(showToast).toHaveBeenCalledExactlyOnceWith('Audio load failed: Failed to fetch', 'error'));
  expect(restored.setLoadedAudioBuffer).toHaveBeenCalledExactlyOnceWith(null);
});

describe('startEditorAudioLoad 요청 순서', () => {
  /** 로드를 시작할 때마다 재생기 세대를 올리고, 테스트가 끝낼 때까지 기다리는 재생기. */
  function fakePlayback() {
    const loads: { resolve: () => void; reject: (reason: Error) => void }[] = [];
    const playback = {
      audioLoadGeneration: 0,
      loadAudioUrl: () => { playback.audioLoadGeneration++; return new Promise<void>((resolve, reject) => { loads.push({ resolve, reject }); }); },
      loadAudioFile: () => { playback.audioLoadGeneration++; return new Promise<void>((resolve, reject) => { loads.push({ resolve, reject }); }); },
    };
    return { playback, loads };
  }
  const settle = () => new Promise(resolve => setTimeout(resolve));

  it('새 로드가 시작된 뒤 이전 로드가 실패하면 onFailed·onSettled를 부르지 않고 새 로드가 끝날 때 onSettled를 1회 부른다', async () => {
    const { playback, loads } = fakePlayback();
    const latest = { current: 0 };
    const handlers = { onFailed: vi.fn(), onSettled: vi.fn() };
    startEditorAudioLoad(playback, 'https://audio.invalid/a.ogg', latest, handlers);
    startEditorAudioLoad(playback, new File(['b'], 'b.ogg'), latest, handlers);

    loads[0].reject(new Error('stale'));
    await settle();
    expect(handlers.onFailed).not.toHaveBeenCalled();
    expect(handlers.onSettled).not.toHaveBeenCalled();

    loads[1].resolve();
    await settle();
    expect(handlers.onSettled).toHaveBeenCalledOnce();
  });

  it('새 로드 없이 재생기 복원으로 세대만 올라간 뒤 실패하면 onFailed는 부르지 않고 onSettled는 1회 불러 로딩 표시를 끝낸다', async () => {
    const { playback, loads } = fakePlayback();
    const handlers = { onFailed: vi.fn(), onSettled: vi.fn() };
    startEditorAudioLoad(playback, 'https://audio.invalid/a.ogg', { current: 0 }, handlers);

    playback.audioLoadGeneration++;
    loads[0].reject(new Error('stale'));
    await settle();

    expect(handlers.onFailed).not.toHaveBeenCalled();
    expect(handlers.onSettled).toHaveBeenCalledOnce();
  });

  it('최신 로드가 boom 오류로 실패하면 onFailed를 boom으로 1회, onSettled를 1회 부른다', async () => {
    const { playback, loads } = fakePlayback();
    const handlers = { onFailed: vi.fn(), onSettled: vi.fn() };
    startEditorAudioLoad(playback, 'https://audio.invalid/a.ogg', { current: 0 }, handlers);

    loads[0].reject(new Error('boom'));
    await settle();

    expect(handlers.onFailed).toHaveBeenCalledExactlyOnceWith('boom');
    expect(handlers.onSettled).toHaveBeenCalledOnce();
  });
});

import { afterEach, expect, it, vi } from 'vitest';
import { usePreviewAudio } from './usePreviewAudio';
import type { DbSong } from '../screens/songSelect/types';

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[], cleanups: [] as (() => void)[] }));
vi.mock('react', () => {
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const index = hooks.cursor++;
    const old = hooks.slots[index] as { value: unknown; deps: unknown[] } | undefined;
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) hooks.slots[index] = { value: factory(), deps };
    return (hooks.slots[index] as { value: unknown }).value;
  };
  return {
    useRef: (value: unknown) => memo(() => ({ current: value }), []),
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = hooks.cursor;
      memo(() => hooks.effects.push(() => { hooks.cleanups[index]?.(); hooks.cleanups[index] = effect() ?? (() => {}); }), deps);
    },
  };
});
vi.mock('../stores', () => ({ useGameStore: (select: (state: unknown) => unknown) => select({ settings: { masterVolume: 1 } }) }));
vi.mock('../../supabase/client', () => ({ supabase: { storage: { from: () => ({
  getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.invalid/${path}` } }),
}) } } }));
const songs = [{ id: 'a', preview_url: 'a.ogg' }, { id: 'b', preview_url: 'b.ogg' }] as DbSong[];
const PreviewAudioHarness = (index: number, tutorialOpen: boolean, autoPlay: boolean) => usePreviewAudio(songs, index, { tutorialOpen, autoPlay });
function render(index: number, tutorialOpen: boolean, autoPlay = true) {
  hooks.cursor = 0;
  const result = PreviewAudioHarness(index, tutorialOpen, autoPlay);
  hooks.effects.splice(0).forEach(effect => effect());
  return result;
}
afterEach(() => {
  hooks.cleanups.forEach(cleanup => cleanup?.());
  hooks.slots = []; hooks.cleanups = []; hooks.effects = [];
  vi.useRealTimers(); vi.unstubAllGlobals();
});

function mockAudio() {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setInterval, clearInterval, setTimeout, clearTimeout });
  const audio = { volume: 0, currentTime: 0, loop: false, paused: true,
    play: vi.fn(async () => { audio.paused = false; }), pause: vi.fn(() => { audio.paused = true; }),
    addEventListener() {}, removeEventListener() {}, removeAttribute() {}, load() {} };
  const create = vi.fn(function () { return audio; });
  vi.stubGlobal('Audio', create);
  return { audio, create };
}

it('곡 선택은 a를 즉시 재생하고 b로 포커스를 바꾸면 1초 대기 없이 b를 재생한다', () => {
  const { create } = mockAudio();
  render(0, false);
  expect(create).toHaveBeenLastCalledWith('https://example.invalid/a.ogg');
  render(1, false);
  expect(create).toHaveBeenLastCalledWith('https://example.invalid/b.ogg');
  expect(create).toHaveBeenCalledTimes(2);
});

it.each([false, true])('autoPlay=false·열기 전 재생=%s이면 닫은 뒤 1초에는 이전에 재생했을 때만 b를 처음부터 재생한다', playing => {
  const { create, audio } = mockAudio();
  const preview = render(0, false, false);
  if (playing) preview.playPreviewAt(0);
  render(0, true, false);
  if (playing) expect(audio.pause).toHaveBeenCalledTimes(1);
  render(1, true, false).playPreviewAt(1);
  const count = create.mock.calls.length;
  render(1, false, false);
  vi.advanceTimersByTime(999);
  expect(create).toHaveBeenCalledTimes(count);
  vi.advanceTimersByTime(1);
  expect(create).toHaveBeenCalledTimes(count + Number(playing));
  if (playing) expect(create).toHaveBeenLastCalledWith('https://example.invalid/b.ogg');
});

it('튜토리얼을 열면 a를 즉시 끊고 닫은 뒤 500ms에 다시 열면 대기 중인 b 시작도 취소한다', () => {
  const { create, audio } = mockAudio();
  render(0, false);
  render(0, true);
  expect(audio.pause).toHaveBeenCalledTimes(1);
  render(1, true).playPreviewAt(1);
  vi.advanceTimersByTime(3000);
  expect(create).toHaveBeenCalledTimes(1);
  render(1, false);
  vi.advanceTimersByTime(500);
  render(1, true);
  vi.advanceTimersByTime(1000);
  expect(create).toHaveBeenCalledTimes(1);
  render(1, false);
  vi.advanceTimersByTime(999);
  expect(create).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(create).toHaveBeenLastCalledWith('https://example.invalid/b.ogg');
  expect(create).toHaveBeenCalledTimes(2);
});

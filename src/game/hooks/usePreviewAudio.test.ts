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
const PreviewAudioHarness = (index: number, tutorialOpen: boolean) => usePreviewAudio(songs, index, { tutorialOpen });
function render(index: number, tutorialOpen: boolean) {
  hooks.cursor = 0;
  const result = PreviewAudioHarness(index, tutorialOpen);
  hooks.effects.splice(0).forEach(effect => effect());
  return result;
}
afterEach(() => {
  hooks.cleanups.forEach(cleanup => cleanup?.());
  hooks.slots = []; hooks.cleanups = []; hooks.effects = [];
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it('프리뷰 대기 500ms에 튜토리얼을 열면 예약을 취소하고 닫은 뒤 현재 곡 b를 1초 뒤 처음부터 재생한다', () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setInterval, clearInterval, setTimeout, clearTimeout });
  const audio = { volume: 0, currentTime: 0, loop: false, play: vi.fn(async () => {}), pause: vi.fn(),
    addEventListener() {}, removeEventListener() {}, removeAttribute() {}, load() {} };
  const create = vi.fn(function () { return audio; });
  vi.stubGlobal('Audio', create);
  render(0, false);
  vi.advanceTimersByTime(500);
  expect(create).not.toHaveBeenCalled();
  render(0, true);
  render(1, true).playPreviewAt(1);
  vi.advanceTimersByTime(3000);
  expect(create).not.toHaveBeenCalled();
  render(1, false);
  vi.advanceTimersByTime(999);
  expect(create).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(create).toHaveBeenCalledExactlyOnceWith('https://example.invalid/b.ogg');
  expect(audio.play).toHaveBeenCalledTimes(1);
  render(1, true);
  expect(audio.pause).toHaveBeenCalledTimes(1);
});

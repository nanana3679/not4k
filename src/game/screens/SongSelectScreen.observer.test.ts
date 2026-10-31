import { isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../stores/gameStore';
import type { DbSong } from './songSelect/types';

const harness = vi.hoisted(() => ({
  cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[],
  cleanups: new Map<number, () => void>(), songs: [] as DbSong[], stopPreview: vi.fn(),
}));

// 기존 화면 테스트와 같은 ref/effect harness. 곡 탐색·Enter·store 전이는 실제 구현을 사용한다.
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => harness.slots[harness.cursor++] ??= { current: initial },
  useState: (initial: unknown) => {
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) harness.slots[slot] = initial;
    return [harness.slots[slot], (value: unknown) => {
      harness.slots[slot] = typeof value === 'function' ? value(harness.slots[slot]) : value;
    }];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const slot = harness.cursor++;
    const previous = harness.slots[slot] as unknown[] | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      harness.effects.push(() => {
        harness.cleanups.get(slot)?.(); harness.cleanups.delete(slot);
        const cleanup = effect(); if (cleanup) harness.cleanups.set(slot, cleanup);
      });
      harness.slots[slot] = deps;
    }
  },
}));
vi.mock('../stores', () => ({ useGameStore: Object.assign(
  (select?: (state: ReturnType<typeof useGameStore.getState>) => unknown) =>
    select ? select(useGameStore.getState()) : useGameStore.getState(),
  { getState: useGameStore.getState },
) }));
vi.mock('../../supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ order: () => {
    const query = Promise.resolve({ data: harness.songs, error: null });
    return Object.assign(query, { abortSignal: () => query });
  } }) }),
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'offline-jacket.png' } }) }) },
} }));
vi.mock('../../shared/hooks/useAuth', () => ({ useAuth: () => ({ user: null, isAdmin: true, loading: false }) }));
vi.mock('../hooks/usePreviewAudio', () => ({ usePreviewAudio: () => ({
  stopPreview: harness.stopPreview, playPreviewAt: vi.fn(),
}) }));
const { SongSelectScreen } = await import('./SongSelectScreen');

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
function buttonsIn(node: ReactNode, buttons = new Map<string, ButtonProps>()) {
  if (Array.isArray(node)) node.forEach(child => buttonsIn(child, buttons));
  else if (isValidElement<ButtonProps>(node)) {
    if (node.type === 'button') buttons.set(String(node.props.children), node.props);
    buttonsIn(node.props.children, buttons);
  }
  return buttons;
}
function render(mobileListOnly = false) {
  harness.cursor = 0;
  const buttons = buttonsIn(SongSelectScreen({ mobileListOnly }));
  for (const effect of harness.effects.splice(0)) effect();
  return buttons;
}
async function open(mobileListOnly = false) {
  render(mobileListOnly);
  await Promise.resolve(); // 실제 useSongNavigation의 곡 목록 응답을 반영한다.
  return render(mobileListOnly);
}
function click(button: ButtonProps) {
  expect(button.disabled).not.toBe(true);
  button.onClick!({} as Parameters<NonNullable<ButtonProps['onClick']>>[0]);
}
function pressEnter() {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter', code: 'Enter' });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  harness.cursor = 0; harness.slots = []; harness.effects = []; harness.stopPreview.mockReset();
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.getState().setScreen('songSelect');
  vi.stubGlobal('window', new EventTarget());
  harness.songs = [{ id: 'song-1', title: 'Selected song', artist: 'Offline', audio_url: 'selected.wav',
    duration: 10, preview_start: null, preview_end: null, preview_url: null, jacket_url: null,
    gameplay_start: 2, gameplay_end: 8, gameplay_fade_in: .2, gameplay_fade_out: .3,
    charts: [
      { id: 'hard-chart', song_id: 'song-1', difficulty_label: 'hard', difficulty_level: 7 },
      { id: 'easy-chart', song_id: 'song-1', difficulty_label: 'easy', difficulty_level: 2 },
    ] }];
});
afterEach(() => {
  for (const cleanup of harness.cleanups.values()) cleanup();
  harness.cleanups.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('곡 선택의 Observer 진입', () => {
  it('song-1의 easy 차트가 선택되면 Play 아래 Observer 버튼이 활성화된다', async () => {
    const buttons = await open();
    expect(buttons.get('Observer')).toMatchObject({ type: 'button', disabled: false });
    const names = [...buttons.keys()];
    expect(names.indexOf('Observer')).toBe(names.indexOf('Play') + 1);
  });

  it('선택한 song-1에 차트가 0개면 Observer와 Play가 비활성화된다', async () => {
    harness.songs[0].charts = [];
    const buttons = await open();
    expect(buttons.get('Observer')?.disabled).toBe(true);
    expect(buttons.get('Play')?.disabled).toBe(true);
    pressEnter();
    expect(useGameStore.getState().screen).toBe('songSelect');
    expect(harness.stopPreview).not.toHaveBeenCalled();
  });

  it('곡 목록이 비어 선택한 곡이 없으면 Observer와 Play를 표시하지 않는다', async () => {
    harness.songs = [];
    const buttons = await open();
    expect(buttons.has('Observer')).toBe(false);
    expect(buttons.has('Play')).toBe(false);
    pressEnter();
    expect(useGameStore.getState().screen).toBe('songSelect');
    expect(harness.stopPreview).not.toHaveBeenCalled();
  });

  it('song-1·hard에서 Observer를 누르면 프리뷰를 먼저 멈추고 2～8초 범위로 observer 로딩을 시작한다', async () => {
    useGameStore.setState({ selectedSongId: 'song-1', selectedDifficulty: 'hard' });
    const state = useGameStore.getState();
    const select = vi.spyOn(state, 'selectSong');
    const load = vi.spyOn(state, 'beginPlayLoad');
    click((await open()).get('Observer')!);
    expect(harness.stopPreview).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledExactlyOnceWith('song-1', 'hard', 'selected.wav', {
      startTime: 2, endTime: 8, fadeInTime: .2, fadeOutTime: .3,
    });
    expect(load).toHaveBeenCalledExactlyOnceWith('observer');
    expect(harness.stopPreview.mock.invocationCallOrder[0]).toBeLessThan(select.mock.invocationCallOrder[0]);
    expect(select.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', playLoadTarget: 'observer',
      selectedSongId: 'song-1', selectedDifficulty: 'hard', selectedAudioUrl: 'selected.wav' });
  });

  it('Observer 진입 대상이 남아 있어도 Enter는 프리뷰를 멈추고 일반 Play 로딩을 시작한다', async () => {
    useGameStore.setState({ playLoadTarget: 'observer' });
    await open();
    expect(pressEnter().defaultPrevented).toBe(true);
    expect(harness.stopPreview).toHaveBeenCalledOnce();
    expect(useGameStore.getState()).toMatchObject({ screen: 'loading', playLoadTarget: 'play',
      selectedSongId: 'song-1', selectedDifficulty: 'easy' });
  });

  it('모바일 곡 목록은 Observer와 Play를 숨기고 Enter로도 로딩을 시작하지 않는다', async () => {
    const buttons = await open(true);
    expect(buttons.has('Observer')).toBe(false);
    expect(buttons.has('Play')).toBe(false);
    pressEnter();
    expect(harness.stopPreview).not.toHaveBeenCalled();
    expect(useGameStore.getState().screen).toBe('songSelect');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { beat, type Chart } from '../../shared';
import type { GameRendererOptions } from '../renderer/GameRenderer';
import { useGameStore } from '../stores/gameStore';

// 구형 PlayScreen(에디터 테스트 재생)의 init effect를 React 없이 돌려, 렌더러를 만들 때 넘긴 옵션만 본다.
// 렌더러 init은 끝나지 않게 두어 그 뒤의 차트 설정·재생은 진행하지 않는다.
const fixture = vi.hoisted(() => ({
  refs: 0,
  effects: [] as (() => (() => void) | void)[],
  errors: [] as string[],
  rendererOptions: [] as unknown[],
}));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useRef: (value: unknown) => ({ current: ++fixture.refs <= 2 ? { clientWidth: 800, clientHeight: 600, style: {} } : value }),
  useState: (value: unknown) => [value, (next: unknown) => { if (typeof next === 'string') fixture.errors.push(next); }],
  useEffect: (effect: () => (() => void) | void) => { fixture.effects.push(effect); },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../stores', () => ({ useGameStore: Object.assign(() => useGameStore.getState(), { getState: () => useGameStore.getState() }) }));
vi.mock('../audio', () => ({ AudioEngine: class {
  masterVolume = 1; playbackRate = 1; duration = 4000;
  prepareForPlayback = async () => {}; getOutputLatencyMs = () => 0; dispose = vi.fn();
} }));
vi.mock('../renderer', () => ({ GameRenderer: class {
  constructor(options: unknown) { fixture.rendererOptions.push(options); }
  init = () => new Promise<void>(() => {});
  dispose = vi.fn();
} }));
vi.mock('../skin', () => ({ SkinManager: class { loadSkin = async () => {}; dispose = vi.fn(); } }));
vi.mock('./gearMotionKeepAlive', () => ({ keepGearMotionAssets: () => null }));
const { PlayScreen } = await import('./PlayScreen');

afterEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  fixture.refs = 0; fixture.effects = []; fixture.errors = []; fixture.rendererOptions = [];
});

const legacyChart = {
  meta: { title: '', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [{ type: 'single', lane: 1, beat: beat(0) }],
  trillZones: [],
  restZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120 }],
} as unknown as Chart;

describe('구형 PlayScreen(에디터 테스트 재생) — 설정 Background Motion·Gear Motion 렌더러 배선(RFD 0100)', () => {
  it.each([
    { flightBackgroundMotion: false, gearMotion: true },
    { flightBackgroundMotion: true, gearMotion: false },
  ])('Background Motion=$flightBackgroundMotion·Gear Motion=$gearMotion이면 렌더러를 같은 값의 showFlightBackground·gearMotion 옵션으로 만든다', async ({ flightBackgroundMotion, gearMotion }) => {
    useGameStore.setState({
      chartData: legacyChart, audioBuffer: { duration: 4 } as AudioBuffer, editorReturnUrl: '/editor?draft=1', screen: 'play',
      settings: { ...useGameStore.getInitialState().settings, flightBackgroundMotion, gearMotion },
    });
    PlayScreen();
    const cleanup = fixture.effects[0]();
    await vi.waitFor(() => expect(fixture.rendererOptions).toHaveLength(1));
    expect(fixture.errors).toEqual([]);
    expect(fixture.rendererOptions[0]).toMatchObject({ showFlightBackground: flightBackgroundMotion, gearMotion } satisfies Partial<GameRendererOptions>);
    cleanup?.();
  });
});

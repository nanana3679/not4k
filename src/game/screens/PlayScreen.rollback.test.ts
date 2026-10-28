import { afterEach, describe, expect, it, vi } from 'vitest';
import { beat, type Chart, type DocumentNoteEntity } from '../../shared';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { useGameStore } from '../stores/gameStore';

const fixture = vi.hoisted(() => ({ refs: 0, effects: [] as (() => (() => void) | void)[], errors: [] as string[],
  audio: vi.fn(), renderer: vi.fn(), skin: vi.fn() }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useRef: (value: unknown) => ({ current: ++fixture.refs <= 2 ? { clientWidth: 800, clientHeight: 600, style: {} } : value }),
  useState: (value: unknown) => [value, (next: unknown) => { if (typeof next === 'string') fixture.errors.push(next); }],
  useEffect: (effect: () => (() => void) | void) => { fixture.effects.push(effect); },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../stores', () => ({ useGameStore: Object.assign(() => useGameStore.getState(), { getState: () => useGameStore.getState() }) }));
vi.mock('../audio', () => ({ AudioEngine: fixture.audio }));
vi.mock('../renderer', () => ({ GameRenderer: fixture.renderer }));
vi.mock('../skin', () => ({ SkinManager: fixture.skin }));
const { PlayScreen } = await import('./PlayScreen');
afterEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  fixture.refs = 0; fixture.effects = []; fixture.errors = []; vi.clearAllMocks();
});

describe('구형 PlayScreen 롤백 거부 경계', () => {
  const notes: DocumentNoteEntity[] = [
    { type: 'tap', kind: 'single', lane: 1, beat: beat(0) },
    { type: 'body', holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(2) },
    { type: 'release', count: 1, lane: 1, beat: beat(2) },
    { type: 'tick', count: 1, lane: 5, beat: beat(1) },
  ];
  it.each(notes)('$type lane$lane 문서를 구형 화면에 직접 넣어도 장치·렌더러 준비 전에 거부하며 원본을 보존한다', note => {
    const document = { ...structuredClone(explicitPlaytestCharts[0].chart), notes: [note] };
    const original = structuredClone(document);
    // 롤백 시 외부 JS가 좁은 구형 타입을 우회한 입력도 실제 화면에서 검사한다.
    useGameStore.setState({ chartData: document as Chart, audioBuffer: { duration: 4 } as AudioBuffer,
      editorReturnUrl: '/editor?draft=1', screen: 'play' });
    PlayScreen();
    const cleanup = fixture.effects[0]();
    expect(fixture.errors).toEqual([expect.stringContaining('명시적 노트 형식')]);
    expect(fixture.audio).not.toHaveBeenCalled();
    expect(fixture.renderer).not.toHaveBeenCalled();
    expect(fixture.skin).not.toHaveBeenCalled();
    expect(document).toEqual(original);
    expect(useGameStore.getState().chartData).toBe(document);
    cleanup?.();
  });
});

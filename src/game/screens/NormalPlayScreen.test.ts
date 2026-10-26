import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../stores/gameStore';
import { openNormalPlayForTest } from '../stores/normalPlayTestHarness';
import type { ExplicitPlayRequest } from '../stores/explicitPlayRequest';
import { ExplicitJudgmentSession, type ExplicitSessionResult } from '../judgment/ExplicitJudgmentSession';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';

interface PlayerProps {
  request: ExplicitPlayRequest;
  presentation: string;
  onComplete: (result: ExplicitSessionResult) => void;
  onExit: () => void;
}
const fixture = vi.hoisted(() => ({ props: null as PlayerProps | null, effect: null as (() => () => void) | null }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => () => void) => { fixture.effect = effect; },
}));
vi.mock('../stores', () => ({ useGameStore: (select: (state: ReturnType<typeof useGameStore.getState>) => unknown) => select(useGameStore.getState()) }));
vi.mock('./ExplicitPlayScreen', () => ({ ExplicitPlayScreen: (props: PlayerProps) => { fixture.props = props; return 'normal-runtime'; } }));
const { NormalPlayScreen } = await import('./NormalPlayScreen');
afterEach(() => { useGameStore.setState(useGameStore.getInitialState(), true); fixture.props = null; fixture.effect = null; });
function mount(index = 0) {
  useGameStore.getState().selectSong('song-1', 'NORMAL', 'custom.mp3');
  openNormalPlayForTest(explicitPlaytestCharts[index].chart, { duration: 4 } as AudioBuffer);
  renderToStaticMarkup(createElement(NormalPlayScreen));
  return fixture.props!;
}

describe('NormalPlayScreen 세션 연결', () => {
  it('일반 곡 요청은 purpose=play와 presentation=play로 공유 화면에 전달한다', () => {
    const props = mount();
    expect(props.presentation).toBe('play');
    expect(props.request).toBe(useGameStore.getState().normalPlay);
    expect(props.request).toMatchObject({ purpose: 'play', auto: false, startTimeMs: 0 });
    expect(useGameStore.getState().explicitPlay).toBeNull();
  });

  it('바디만 있는 실제 세션 완료는 공식 result로 이동하며 분모0·Miss1을 보존한다', () => {
    const props = mount(2);
    props.onComplete(new ExplicitJudgmentSession(props.request.compiled).finalize());
    expect(useGameStore.getState()).toMatchObject({ screen: 'result', normalPlay: null,
      lastResult: { finalDenominatorWeight: 0, judgmentCounts: { miss: 1 }, isFullCombo: false } });
  });

  it('Quit는 곡 선택으로 돌아가며 늦은 완료 콜백도 결과를 남기지 않는다', () => {
    const props = mount();
    const result = new ExplicitJudgmentSession(props.request.compiled).finalize();
    props.onExit();
    props.onComplete(result);
    expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', normalPlay: null, lastResult: null });
  });

  it('완료 전 unmount는 요청·오디오 참조를 해제하고 곡 선택으로 돌아간다', () => {
    mount();
    const cleanup = fixture.effect!();
    cleanup();
    expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', normalPlay: null, audioBuffer: null });
  });

  it('완료 직후 unmount는 이미 확정한 공식 결과를 지우지 않는다', () => {
    const props = mount();
    const cleanup = fixture.effect!();
    props.onComplete(new ExplicitJudgmentSession(props.request.compiled).finalize());
    const completed = useGameStore.getState();
    cleanup();
    expect(useGameStore.getState()).toBe(completed);
  });

  it('일반 요청이 없으면 공유 런타임을 만들지 않고 곡 선택 복귀를 제공한다', () => {
    const html = renderToStaticMarkup(createElement(NormalPlayScreen));
    expect(fixture.props).toBeNull();
    expect(html).toContain('No song loaded');
    expect(html).toContain('Back to Song Select');
  });
});

import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../stores/gameStore';
import { ExplicitJudgmentSession } from '../judgment/ExplicitJudgmentSession';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';

const fixture = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('../stores', () => ({ useGameStore: () => useGameStore.getState() }));
const { ResultScreen } = await import('./ResultScreen');
afterEach(() => { useGameStore.setState(useGameStore.getInitialState(), true); fixture.navigate.mockReset(); });
function finish(index: number, success = false) {
  useGameStore.getState().startNormalPlay({ document: explicitPlaytestCharts[index].chart, audioBuffer: { duration: 4 } as AudioBuffer });
  const request = useGameStore.getState().normalPlay!;
  const session = new ExplicitJudgmentSession(request.compiled);
  if (success) {
    session.processBatch(1000, [{ key: 'A', lane: 1, type: 'down' }]);
    session.advance(2000);
  }
  useGameStore.getState().completeNormalPlay(request, session.finalize());
  return renderToStaticMarkup(createElement(ResultScreen));
}
function findButton(node: ReactNode): ReactElement<{ onClick: () => void }> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  if (node.type === 'button') return node as ReactElement<{ onClick: () => void }>;
  for (const child of Children.toArray(node.props.children)) {
    const button = findButton(child);
    if (button) return button;
  }
}

describe('공식 ResultScreen', () => {
  it('Body 실패의 분모0 결과는 달성률·F만 숨기고 Miss1·Full Combo NO와 타이밍을 표시한다', () => {
    const html = finish(2);
    expect(html).not.toContain('0.00%');
    expect(html).not.toMatch(/>F</);
    expect(html).toContain('MISS:');
    expect(html).toContain('>1<');
    expect(html).toContain('>NO<');
    expect(html).toContain('FAST:');
    expect(html).toContain('SLOW:');
    expect(html).toContain('GOOD◇:');
  });

  it('Body 정상 완료의 분모0 결과도 100%·SSS를 만들지 않고 Full Combo YES를 유지한다', () => {
    const html = finish(2, true);
    expect(html).not.toMatch(/>\d+(?:\.\d+)?%</);
    expect(html).not.toContain('>SSS<');
    expect(html).toContain('>YES<');
    expect(useGameStore.getState().lastResult?.judgmentCounts.miss).toBe(0);
  });

  it('분모12의 점수 항목을 전부 놓친 결과는 0.00%·F와 실제 판정 수를 표시한다', () => {
    const html = finish(0);
    expect(html).toContain('0.00%');
    expect(html).toContain('>F<');
    expect(html).toContain('MISS:');
    expect(useGameStore.getState().lastResult?.finalDenominatorWeight).toBe(12);
  });

  it('일반 결과의 Back은 곡 선택으로 돌아가고 결과·요청을 지운다', () => {
    finish(0);
    findButton(ResultScreen())!.props.onClick();
    expect(useGameStore.getState()).toMatchObject({ screen: 'songSelect', normalPlay: null, lastResult: null });
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it.each(['/editor?draft=1', '/lab/judgment-case'])('구형 결과에서 %s로 Back하면 Perfect3 결과를 보존하고 커서·복귀URL을 비운다', returnUrl => {
    const legacyResult = { songId: 'legacy-fixture', difficulty: 'NORMAL', achievementRate: 100, rank: 'SSS',
      isFullCombo: true, judgmentCounts: { perfect: 3, great: 0, good: 0, goodTrill: 0, bad: 0, miss: 0 },
      goodTrillCount: 0, fastCount: 0, slowCount: 0 };
    useGameStore.setState({ screen: 'result', lastResult: legacyResult,
      editorReturnUrl: returnUrl, startTimeMs: 1500 });
    findButton(ResultScreen())!.props.onClick();
    expect(fixture.navigate).toHaveBeenCalledWith(returnUrl);
    expect(useGameStore.getState()).toMatchObject({ screen: 'result', startTimeMs: 0, editorReturnUrl: null });
    expect(useGameStore.getState().lastResult).toBe(legacyResult);
    useGameStore.getState().selectSong('next-song', 'NORMAL', 'next.ogg');
    expect(useGameStore.getState().lastResult).toBeNull();
  });
});

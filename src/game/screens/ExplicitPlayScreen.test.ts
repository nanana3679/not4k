import { isValidElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explicitPlaytestCharts } from '../../lab/explicitPlaytestCharts';
import { prepareExplicitPlayTest, prepareNormalPlay } from '../stores/explicitPlayRequest';
import type { ExplicitPlayRequest } from '../stores/explicitPlayRequest';
import { ExplicitJudgmentSession } from '../judgment/ExplicitJudgmentSession';
import type { ExplicitPlayRuntimeOptions } from './ExplicitPlayRuntime';
import type { ExplicitPlayScreenProps } from './ExplicitPlayScreen';

const harness = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[],
  cleanups: new Map<number, () => void>(), players: [] as FakeRuntime[], navigate: vi.fn(), clear: vi.fn(),
  setScreen: vi.fn(), storedRequest: null as ExplicitPlayRequest | null,
  mountedRefs: new Set<{ current: unknown }>() }));
class FakeRuntime {
  start = vi.fn(async () => { this.options.onPhase('loading'); });
  dispose = vi.fn(); togglePause = vi.fn(); downloadDebugLog = vi.fn();
  constructor(readonly options: ExplicitPlayRuntimeOptions) { harness.players.push(this); }
}
// React DOM 대신 ref 부착과 effect commit을 구동해 화면이 소유한 시도·콜백 수명을 검사한다.
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const slot = harness.cursor++;
    return harness.slots[slot] ??= { current: initial };
  },
  useState: (initial: unknown) => {
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) harness.slots[slot] = initial;
    return [harness.slots[slot], (value: unknown) => {
      harness.slots[slot] = typeof value === 'function' ? value(harness.slots[slot]) : value;
    }];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const slot = harness.cursor++; const previous = harness.slots[slot] as unknown[] | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      harness.effects.push(() => {
        harness.cleanups.get(slot)?.(); harness.cleanups.delete(slot);
        const cleanup = effect(); if (cleanup) harness.cleanups.set(slot, cleanup);
      });
      harness.slots[slot] = deps;
    }
  },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => harness.navigate }));
vi.mock('../stores', () => ({ useGameStore: Object.assign(
  (select: (state: { explicitPlay: ExplicitPlayRequest | null }) => unknown) => select({ explicitPlay: harness.storedRequest }),
  { getState: () => ({ settings: {}, clearExplicitPlayTest: harness.clear, setScreen: harness.setScreen }) },
) }));
vi.mock('./ExplicitPlayRuntime', () => ({ ExplicitPlayRuntime: class extends FakeRuntime {} }));
const { ExplicitPlayScreen } = await import('./ExplicitPlayScreen');

interface ElementProps { children?: ReactNode; ref?: { current: unknown }; onClick?: () => void }
function visit(node: ReactNode, action: (type: unknown, props: ElementProps) => void): void {
  if (Array.isArray(node)) { node.forEach(child => visit(child, action)); return; }
  if (!isValidElement<ElementProps>(node)) return;
  action(node.type, node.props); visit(node.props.children, action);
}
function render(props: ExplicitPlayScreenProps = {}) {
  harness.cursor = 0;
  const tree = ExplicitPlayScreen(props);
  const html = renderToStaticMarkup(tree);
  for (const ref of harness.mountedRefs) ref.current = null;
  harness.mountedRefs.clear();
  visit(tree, (_type, attributes) => {
    if (attributes.ref) {
      attributes.ref.current = { clientWidth: 1200, clientHeight: 700 };
      harness.mountedRefs.add(attributes.ref);
    }
  });
  for (const commit of harness.effects.splice(0)) commit();
  return { html, click(label: string) {
    let handler: (() => void) | undefined;
    visit(tree, (type, attributes) => { if (type === 'button' && attributes.children === label) handler = attributes.onClick; });
    expect(handler, `button ${label}`).toBeDefined(); handler!();
  } };
}
function normalRequest() {
  return prepareNormalPlay({ document: explicitPlaytestCharts[0].chart, audioBuffer: { duration: 4 } as AudioBuffer });
}
function unmount() { for (const cleanup of harness.cleanups.values()) cleanup(); harness.cleanups.clear(); }
beforeEach(() => {
  harness.cursor = 0; harness.slots = []; harness.effects = []; harness.players = []; harness.cleanups.clear();
  harness.storedRequest = null;
  harness.mountedRefs.clear();
  harness.setScreen.mockClear();
  harness.navigate.mockClear(); harness.clear.mockClear(); vi.stubGlobal('window', {});
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

describe('명시 화면의 일반·테스트 표현과 시도 수명', () => {
  it('일반 playing에는 gameplay-canvas만 표시하고 테스트 도구·반복·정산을 노출하지 않는다', () => {
    const props = { request: normalRequest(), presentation: 'play' as const };
    render(props); harness.players[0].options.onPhase('playing'); const { html } = render(props);
    expect(html).toContain('data-testid="gameplay-canvas"');
    for (const text of ['처음부터 테스트', '반복', '테스트 정산', 'explicit-play-canvas', '<button']) expect(html).not.toContain(text);
  });

  it('일반 paused는 Paused·Resume·Retry·Quit를 표시하며 Resume은 같은 runtime을 계속한다', () => {
    const props = { request: normalRequest(), presentation: 'play' as const };
    render(props); harness.players[0].options.onPhase('paused'); const page = render(props);
    for (const text of ['Paused', 'Resume', 'Retry', 'Quit']) expect(page.html).toContain(text);
    page.click('Resume'); expect(harness.players[0].togglePause).toHaveBeenCalledOnce();
    expect(harness.players).toHaveLength(1);
  });

  it('onComplete가 다시 생성되어도 runtime1개를 유지하고 최신 콜백에 결과를1회만 전달한다', () => {
    const request = normalRequest(); const before = vi.fn(); const latest = vi.fn();
    render({ request, presentation: 'play', onComplete: before });
    render({ request, presentation: 'play', onComplete: latest });
    expect(harness.players).toHaveLength(1);
    const result = new ExplicitJudgmentSession(request.compiled).finalize();
    harness.players[0].options.onResult(result); harness.players[0].options.onResult(result);
    expect(before).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledExactlyOnceWith(result);
    expect(render({ request, presentation: 'play', onComplete: latest }).html).not.toContain('테스트 정산');
  });

  it('Retry는 이전 runtime을1회 dispose하고 늦은 완료를 버리며 새 runtime을 생성하고 debug를 다운로드하지 않는다', () => {
    const request = normalRequest(); const onComplete = vi.fn(); const props = { request, presentation: 'play' as const, onComplete };
    render(props); const previous = harness.players[0]; previous.options.onPhase('paused');
    render(props).click('Retry'); previous.options.onResult(new ExplicitJudgmentSession(request.compiled).finalize());
    render(props);
    expect(harness.players).toHaveLength(2); expect(previous.dispose).toHaveBeenCalledOnce();
    expect(previous.downloadDebugLog).not.toHaveBeenCalled(); expect(onComplete).not.toHaveBeenCalled();
    expect(harness.players[1].start).toHaveBeenCalledOnce();
  });

  it('Quit는 debug export·dispose 후 onExit를1회 호출하고 unmount로 이전 runtime을 다시 정리하지 않는다', () => {
    const onExit = vi.fn(); const props = { request: normalRequest(), presentation: 'play' as const, onExit };
    render(props); const player = harness.players[0]; player.options.onPhase('paused'); render(props).click('Quit'); unmount();
    expect(player.downloadDebugLog).toHaveBeenCalledOnce(); expect(player.dispose).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce(); expect(harness.navigate).not.toHaveBeenCalled();
  });

  it('요청 없는 일반 화면은 로딩 대신 오류와 Back to Song Select를 표시하고 runtime을 만들지 않는다', () => {
    harness.storedRequest = prepareExplicitPlayTest({ document: explicitPlaytestCharts[0].chart,
      audioBuffer: { duration: 4 } as AudioBuffer, returnUrl: '/editor' });
    const page = render({ presentation: 'play' });
    expect(page.html).toContain('No chart to play.'); expect(page.html).not.toContain('Preparing');
    page.click('Back to Song Select'); expect(harness.setScreen).toHaveBeenCalledExactlyOnceWith('songSelect');
    expect(harness.clear).not.toHaveBeenCalled(); expect(harness.players).toHaveLength(0);
  });

  it('오류 뒤 다른 요청을 받으면 이전 runtime을 정리하고 오류를 지우며 이전 완료를 무시한다', () => {
    const onComplete = vi.fn(); const first = normalRequest();
    render({ request: first, presentation: 'play', onComplete });
    const previous = harness.players[0]; previous.options.onError(new Error('old error'));
    const second = normalRequest(); render({ request: second, presentation: 'play', onComplete });
    previous.options.onResult(new ExplicitJudgmentSession(first.compiled).finalize());
    expect(render({ request: second, presentation: 'play', onComplete }).html).not.toContain('old error');
    expect(previous.dispose).toHaveBeenCalledOnce(); expect(harness.players).toHaveLength(2);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('일반 스킨 오류는 canvas를 제거하고 오류·Back to Song Select를 표시하며 화면 종료에서 dispose한다', () => {
    const props = { request: normalRequest(), presentation: 'play' as const, onExit: vi.fn() };
    render(props); harness.players[0].options.onError(new Error('skin failed')); const page = render(props);
    expect(page.html).toContain('skin failed');
    expect(page.html).not.toContain('data-testid="gameplay-canvas"');
    page.click('Back to Song Select');
    expect(harness.players[0].dispose).toHaveBeenCalledOnce(); expect(props.onExit).toHaveBeenCalledOnce();
  });

  it('일반 loading·music-preparation 안내는 영어 Preparing audio and graphics·Get ready이고 한국어 안내를 표시하지 않는다', () => {
    const props = { request: normalRequest(), presentation: 'play' as const };
    render(props); expect(render(props).html).toContain('Preparing audio and graphics');
    harness.players[0].options.onPhase('music-preparation'); const { html } = render(props);
    expect(html).toContain('Get ready · You can switch keys freely');
    for (const text of ['준비 중', '키를 자유롭게']) expect(html).not.toContain(text);
  });

  it('테스트 loading·music-preparation 안내는 에디터 언어인 한국어를 유지한다', () => {
    const request = prepareExplicitPlayTest({ document: explicitPlaytestCharts[0].chart,
      audioBuffer: { duration: 4 } as AudioBuffer, returnUrl: '/editor' });
    render({ request }); expect(render({ request }).html).toContain('음원과 표시 준비 중');
    harness.players[0].options.onPhase('music-preparation');
    expect(render({ request }).html).toContain('음악 준비 중 · 키를 자유롭게 바꿀 수 있습니다');
  });

  it('presentation 생략은 기존 테스트 도구·canvas·정산 testid를 유지하고 onComplete를 호출하지 않는다', () => {
    const request = prepareExplicitPlayTest({ document: explicitPlaytestCharts[0].chart,
      audioBuffer: { duration: 4 } as AudioBuffer, returnUrl: '/editor' });
    const onComplete = vi.fn(); const props = { request, onComplete }; const page = render(props);
    for (const text of ['explicit-play-canvas', '처음부터 테스트', '반복', '돌아가기']) expect(page.html).toContain(text);
    harness.players[0].options.onResult(new ExplicitJudgmentSession(request.compiled).finalize());
    const { html } = render(props);
    for (const id of ['explicit-play-result', 'explicit-settled', 'explicit-earned', 'explicit-denominator', 'explicit-dependent-zero', 'explicit-bodies']) expect(html).toContain(id);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

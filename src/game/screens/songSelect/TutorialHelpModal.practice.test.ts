import { isValidElement, type ReactElement, type ReactNode, type ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TutorialHelpModal } from './TutorialHelpModal';
import { TutorialPreviewPlayer } from './TutorialPreviewPlayer';
import { useGameStore } from '../../stores';
import { createExplicitTutorialPreviewPlayback, createTutorialTimingsInputPlan } from './explicitTutorialPreviewPlayback';
import { useTutorialPractice } from './useTutorialPractice';
import { beat } from '../../../shared/types/beat';
import { createExplicitTutorialPreview } from './explicitTutorialPreviewChart';
import { createTutorialPracticeSpec } from './tutorialPractice';
import { ALL_TUTORIAL_PREVIEWS } from './tutorialCatalog';
import { getTutorialInputTimings } from './tutorialPreviewChart';

// 기존 Lab 상호작용 테스트처럼 DOM/Pixi 없이 React 이벤트와 실제 reducer를 실행한다.
// effect 수명과 ref도 보존해 캐러셀 전환·키보드 핸들러를 함께 검사한다.
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as (() => void)[], cleanups: [] as (() => void)[] }));
vi.mock('react', async original => {
  const react = await original<typeof import('react')>();
  const memo = (factory: () => unknown, deps?: unknown[]) => {
    const index = hooks.cursor++;
    const old = hooks.slots[index] as { deps?: unknown[]; value: unknown } | undefined;
    if (!old || !deps || deps.some((value, i) => !Object.is(value, old.deps?.[i]))) {
      hooks.slots[index] = { deps, value: factory() };
    }
    return (hooks.slots[index] as { value: unknown }).value;
  };
  return { ...react,
    useState(initial: unknown) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks.slots[index], (value: unknown) => {
        hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value;
      }];
    },
    useRef: (initial: unknown) => memo(() => ({ current: initial }), []),
    useMemo: memo,
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const index = hooks.cursor;
      memo(() => {
        hooks.effects.push(() => {
          hooks.cleanups[index]?.();
          hooks.cleanups[index] = effect() ?? (() => {});
        });
      }, deps);
    },
  };
});
vi.mock('../../stores', async original => {
  const stores = await original<typeof import('../../stores')>();
  return { ...stores, useGameStore: Object.assign(
    (select: (state: ReturnType<typeof stores.useGameStore.getState>) => unknown) => select(stores.useGameStore.getState()),
    stores.useGameStore,
  ) };
});

type Props = { children?: ReactNode; onClick?: () => void; disabled?: boolean; 'aria-pressed'?: boolean;
  onKeyDown?: ComponentProps<'button'>['onKeyDown'];
  'data-tutorial-index-item'?: string; 'data-tutorial-condition-status'?: string;
  'data-tutorial-progress'?: string; 'data-tutorial-pattern-id'?: number; };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  if (typeof node.type === 'function' && node.type !== TutorialPreviewPlayer) {
    return elements((node.type as (props: Props) => ReactNode)(node.props));
  }
  return [node, ...elements(node.props.children)];
}
const initialSettings = useGameStore.getState().settings;
let onClose = vi.fn();
let onItemPassed = vi.fn();
function renderModal() {
  hooks.cursor = 0;
  const nodes = elements(TutorialHelpModal({ onClose, onItemPassed }));
  hooks.effects.splice(0).forEach(effect => effect());
  return {
    nodes,
    button(label: string) { return nodes.find(node => node.type === 'button' && node.props.children === label)!; },
    click(label: string) { const button = this.button(label); expect(button, label).toBeDefined(); button.props.onClick!(); },
    select(id: string) { nodes.find(node => node.props['data-tutorial-index-item'] === id)!.props.onClick!(); },
    player(id = 'single-note') {
      return nodes.filter(node => node.type === TutorialPreviewPlayer)
        .map(node => node.props as ComponentProps<typeof TutorialPreviewPlayer>)
        .find(props => props.preview?.id === id)!;
    },
    get progress() { return nodes.find(node => node.props['data-tutorial-progress'])?.props['data-tutorial-progress']; },
    get patternId() { return nodes.find(node => node.props['data-tutorial-pattern-id'] !== undefined)?.props['data-tutorial-pattern-id']; },
  };
}
function settle() {
  for (let i = 0; i < 24; i++) {
    renderModal().nodes.filter(node => node.type === TutorialPreviewPlayer)
      .forEach(node => (node.props as ComponentProps<typeof TutorialPreviewPlayer>).onReady?.());
    vi.advanceTimersByTime(20);
  }
  return renderModal();
}
function result(id = 'single-note') {
  const preview = ALL_TUTORIAL_PREVIEWS.find(item => item.id === id)!;
  const playback = createExplicitTutorialPreviewPlayback(preview, createTutorialTimingsInputPlan(getTutorialInputTimings(preview.chart)), {
    showJudgmentGroup() {}, recordFlightJudgment() {}, showBombEffect() {},
  });
  const finished = playback.finishPattern();
  playback.stop();
  return finished;
}
function openLesson(id = 'single-note') {
  renderModal().select(id);
  const page = settle();
  page.player(id).onPatternStarted?.(0);
  return renderModal();
}
beforeEach(() => {
  vi.useFakeTimers();
  hooks.cursor = 0; hooks.slots = []; hooks.effects = []; hooks.cleanups = [];
  onClose = vi.fn(); onItemPassed = vi.fn();
  useGameStore.setState({ settings: initialSettings, settingsOpen: false });
  const target = new EventTarget();
  vi.stubGlobal('window', Object.assign(target, {
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout, clearTimeout,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16),
    cancelAnimationFrame: clearTimeout,
  }));
});
afterEach(() => { hooks.cleanups.forEach(cleanup => cleanup?.()); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('손배치에는 토글이 없고 싱글 노트의 시연 중 직접 입력을 선택하면 즉시 player inputMode만 바뀌며 현재 패턴은 0/3이다', () => {
  expect(renderModal().button('직접 입력')).toBeUndefined();
  let page = openLesson();
  expect(page.player().inputMode).toBe('demonstration');
  page.click('직접 입력');
  page = renderModal();
  expect(page.player().inputMode).toBe('directInput');
  page.player().onPatternFinished?.(result());
  expect(renderModal().progress).toBe('0/3');
});

it.each(['connected-long-note-switch', 'connected-long-note-overlap'])('%s에서 직접 입력으로 3회 성공하면 도식 없이 다음을 표시하고 시연으로 돌아가면 도식을 복원한다', id => {
  let page = openLesson(id);
  expect(page.player(id).diagramModalEnabled).toBe(true);
  page.click('직접 입력');
  page = renderModal();
  expect(page.player(id).diagramModalEnabled).toBe(false);
  expect(page.player(id).diagramModalVisible).toBe(false);
  for (let iteration = 1; iteration <= 3; iteration++) {
    page.player(id).onPatternStarted?.(iteration);
    page.player(id).onPatternFinished?.(result(id));
    page = renderModal();
    expect(page.player(id).diagramModalEnabled).toBe(false);
    expect(page.player(id).paused).toBe(iteration === 3);
  }
  expect(page.progress).toBe('3/3');
  expect(page.button('다음')).toBeDefined();
  page.click('시연');
  page = renderModal();
  expect(page.player(id).inputMode).toBe('demonstration');
  expect(page.player(id).diagramModalEnabled).toBe(true);
  expect(page.player(id).diagramModalVisible).toBe(true);
});

it('직접 입력 패턴 도중 시연을 골라도 종료까지 inputMode는 directInput이며 종료 뒤 다음 패턴만 demonstration이다', () => {
  openLesson().click('직접 입력');
  let page = renderModal();
  page.player().onPatternStarted?.(1);
  page.click('시연');
  page = renderModal();
  expect(page.button('시연').props['aria-pressed']).toBe(true);
  expect(page.player().inputMode).toBe('directInput');
  page.player().onPatternFinished?.(result());
  expect(page.player().onPatternStarted?.(2)).toBe('demonstration');
  page = renderModal();
  expect(page.player().inputMode).toBe('demonstration');
  expect(page.progress).toBe('1/3');
});

it('정산 전 조건은 neutral, 성공 정산은 met·1/3이며 다음 시작 뒤에도 유지하다 첫 Miss 정산에서 failed로 바뀐다', () => {
  openLesson().click('직접 입력');
  let page = renderModal();
  expect(page.nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('neutral');
  const finished = result();
  page.player().onPatternStarted?.(1);
  page.player().onScoreChanged?.(finished.result.score, 3);
  page = renderModal();
  expect(page.nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('met');
  expect(page.nodes.find(node => node.props.children === '콤보 3')).toBeDefined();
  page.player().onPatternFinished?.(finished);
  page.player().onPatternStarted?.(2);
  page = renderModal();
  expect(page.progress).toBe('1/3');
  expect(page.nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('met');
  page.player().onScoreChanged?.({ ...finished.result.score, processedNotes: 0, liveDenominatorWeight: 0, earnedScore: 0 }, 0);
  expect(renderModal().nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('met');
  page.player().onScoreChanged?.({ ...finished.result.score, processedNotes: 1, liveDenominatorWeight: 3, earnedScore: 0 }, 0);
  expect(renderModal().nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('failed');
});

it('누적 3회 성공이면 반복은 정지·통과 콜백은 1회·다음을 눌러야 double-note가 시연 0/3으로 열린다', () => {
  openLesson().click('직접 입력');
  let page = renderModal();
  expect(page.player().paused).toBe(false);
  expect(page.button('다음')).toBeUndefined();
  const ids: number[] = [];
  for (let iteration = 1; iteration <= 3; iteration++) {
    page.player().onPatternStarted?.(iteration);
    page = renderModal();
    ids.push(page.patternId!);
    expect(page.player().onPatternFinished?.(result())).toBe(iteration === 3 ? false : undefined);
    page = renderModal();
  }
  expect(page.progress).toBe('3/3');
  expect(page.player().paused).toBe(true);
  expect(page.player().preview?.id).toBe('single-note');
  expect(onItemPassed).toHaveBeenCalledExactlyOnceWith('single-note');
  page.player().onPatternFinished?.(result());
  expect(onItemPassed).toHaveBeenCalledTimes(1);
  page.click('다음');
  page = settle();
  expect(page.player('double-note').inputMode).toBe('demonstration');
  expect(page.progress).toBe('0/3');
  page.player('double-note').onPatternStarted?.(0);
  ids.push(renderModal().patternId!);
  expect(ids).toEqual([2, 3, 4, 5]);
});

it('성공 1회 후 다른 레슨을 갔다 돌아오면 시연 0/3이며 이전 콜백은 무시하고 id는 증가한다', () => {
  openLesson().click('직접 입력');
  const oldPlayer = renderModal().player();
  oldPlayer.onPatternStarted?.(1);
  oldPlayer.onPatternFinished?.(result());
  expect(renderModal().progress).toBe('1/3');
  renderModal().select('double-note');
  settle().select('single-note');
  let page = settle();
  oldPlayer.onPatternStarted?.(99);
  oldPlayer.onPatternFinished?.(result());
  page.player().onPatternStarted?.(0);
  page = renderModal();
  expect(page.patternId).toBe(3);
  expect(page.player().inputMode).toBe('demonstration');
  expect(page.progress).toBe('0/3');
  // 모달을 닫아 hook 수명을 끝낸 뒤 다시 열어도 성공 횟수를 복원하지 않는다.
  hooks.cleanups.forEach(cleanup => cleanup?.());
  hooks.slots = []; hooks.cleanups = []; hooks.effects = [];
  page = openLesson();
  expect(page.player().inputMode).toBe('demonstration');
  expect(page.progress).toBe('0/3');
});

it('advanced-double-hold의 1레인이 Q·W 2키이면 직접 입력 비활성·4키 필요 안내와 키 설정 경로를 보여준다', () => {
  useGameStore.setState({ settings: { ...initialSettings, keyBindings: { ...initialSettings.keyBindings, lane1: ['KeyQ', 'KeyW'] } } });
  renderModal().click('Advanced');
  const page = settle();
  expect(page.button('직접 입력').props.disabled).toBe(true);
  expect(page.nodes.find(node => node.props.children === '1번 레인에 키가 4개 필요하지만 2개만 설정되어 있습니다')).toBeDefined();
  page.click('키 설정');
  expect(useGameStore.getState().settingsOpen).toBe(true);
  expect(renderModal().player('advanced-double-hold').paused).toBe(true);
  useGameStore.setState({ settings: initialSettings, settingsOpen: false });
  const updated = renderModal();
  expect(updated.button('직접 입력').props.disabled).toBe(false);
  expect(updated.player('advanced-double-hold').inputMode).toBe('demonstration');
});

it('직접 입력에서 레인에 바인딩한 ArrowRight와 소비된 ArrowLeft는 레슨을 넘기지 않고 Escape만 닫는다', () => {
  useGameStore.setState({ settings: { ...initialSettings, keyBindings: {
    ...initialSettings.keyBindings, lane2: ['ArrowRight', 'KeyE'],
  } } });
  openLesson().click('직접 입력');
  renderModal();
  const send = (key: string, consumed = false) => {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperties(event, { key: { value: key }, code: { value: key } });
    if (consumed) event.preventDefault();
    window.dispatchEvent(event);
  };
  send('ArrowRight');
  send('ArrowLeft', true);
  expect(renderModal().player().preview?.id).toBe('single-note');
  expect(onClose).not.toHaveBeenCalled();
  useGameStore.setState({ settingsOpen: true });
  renderModal();
  send('Escape');
  vi.advanceTimersByTime(120);
  expect(onClose).not.toHaveBeenCalled();
  useGameStore.setState({ settingsOpen: false });
  renderModal();
  send('Escape');
  vi.advanceTimersByTime(120);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it.each([
  { name: 'button', code: 'Enter', target: { tagName: 'BUTTON' } },
  { name: 'button', code: 'Space', target: { tagName: 'BUTTON' } },
  { name: 'button 자식', code: 'NumpadEnter', target: { parentElement: { tagName: 'BUTTON' } } },
  { name: 'switch', code: 'Space', target: { tagName: 'DIV', getAttribute: () => 'switch' } },
  { name: 'checkbox', code: 'Space', target: { tagName: 'INPUT', type: 'checkbox' } },
  { name: 'tab', code: 'ArrowRight', target: { tagName: 'BUTTON', getAttribute: () => 'tab' } },
  { name: 'text input', code: 'KeyD', target: { tagName: 'INPUT', type: 'text' } },
  { name: 'textarea', code: 'ArrowLeft', target: { tagName: 'TEXTAREA' } },
  { name: 'contenteditable 자식', code: 'ArrowRight', target: { parentElement: { isContentEditable: true } } },
])('직접 입력 중 $name에서 바인딩된 $code를 누르면 기본 동작을 허용하고 single-note에 머문다', ({ code, target }) => {
  useGameStore.setState({ settings: { ...initialSettings, keyBindings: {
    ...initialSettings.keyBindings, lane2: [code, 'KeyE'],
  } } });
  openLesson().click('직접 입력');
  renderModal();
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    key: { value: code === 'Space' ? ' ' : code }, code: { value: code }, target: { value: target },
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(renderModal().player().preview?.id).toBe('single-note');
  expect(onClose).not.toHaveBeenCalled();
});

it.each(['Enter', 'Space', 'ArrowRight'])('직접 입력 중 Basic 탭의 바인딩된 %s는 레인 예약을 건너뛰고 탭 동작으로 처리한다', code => {
  useGameStore.setState({ settings: { ...initialSettings, keyBindings: {
    ...initialSettings.keyBindings, lane2: [code, 'KeyE'],
  } } });
  const focus = vi.fn();
  vi.stubGlobal('document', { getElementById: () => ({ focus }) });
  openLesson().click('직접 입력');
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    key: { value: code === 'Space' ? ' ' : code }, code: { value: code }, nativeEvent: { value: event },
    target: { value: { tagName: 'BUTTON', getAttribute: () => 'tab' } },
  });
  renderModal().button('Basic').props.onKeyDown!(event as unknown as React.KeyboardEvent<HTMLButtonElement>);
  if (code === 'ArrowRight') {
    expect(focus).toHaveBeenCalledTimes(1);
    expect(settle().player('advanced-double-hold')).toBeDefined();
  } else {
    expect(event.defaultPrevented).toBe(false);
    expect(renderModal().player()).toBeDefined();
  }
});

it('시연 중 text input에서 바인딩되지 않은 ArrowRight를 누르면 커서를 이동하고 single-note에 머문다', () => {
  openLesson();
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    key: { value: 'ArrowRight' }, code: { value: 'ArrowRight' }, target: { value: { tagName: 'INPUT', type: 'text' } },
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(renderModal().player().preview?.id).toBe('single-note');
});

it('trill-note는 달성률과 GOOD◇ 조건을 한 줄씩 표시하고 GOOD◇ 1회이면 추가 조건만 즉시 실패한다', () => {
  openLesson('trill-note').click('직접 입력');
  let page = renderModal();
  const score = result('trill-note').result.score;
  page.player('trill-note').onScoreChanged?.({ ...score,
    processedNotes: 1, liveDenominatorWeight: 3, earnedScore: 1, goodTrillCount: 1,
  }, 1);
  page = renderModal();
  const conditions = page.nodes.filter(node => node.props['data-tutorial-condition-status']);
  expect(conditions.map(node => node.props['data-tutorial-condition-status'])).toEqual(['neutral', 'failed']);
  expect(conditions[1].props.children).toContain('GOOD◇ 0회 이하');
});


it('방법이 2개인 항목에서 nextPressed를 누르면 재생을 새로 걸고 다음 방법의 pattern id는 4로 증가한다', () => {
  const lesson = { ...ALL_TUTORIAL_PREVIEWS[1], practice: createTutorialPracticeSpec({
    conditions: [{ kind: 'targetAchievementRate', percent: 90 }], playingMethods: [{ id: 'hold' }, { id: 'swap' }],
  }) };
  const PracticeHarness = () => useTutorialPractice(lesson, onItemPassed);
  const renderPractice = () => { hooks.cursor = 0; return PracticeHarness(); };
  let practice = renderPractice();
  practice.dispatch({ type: 'modeSelected', mode: 'directInput' });
  for (let i = 0; i < 3; i++) {
    practice.playerProps.onPatternStarted?.(i);
    practice.playerProps.onPatternFinished?.(result());
  }
  practice = renderPractice();
  expect(practice.stopped).toBe(true);
  expect(onItemPassed).not.toHaveBeenCalled();
  practice.dispatch({ type: 'nextPressed' });
  practice = renderPractice();
  expect(practice.playerProps.playbackRevision).toBe(1);
  expect(practice.playerProps.inputMode).toBe('demonstration');
  expect(practice.progress).toEqual({ current: 0, required: 3 });
  practice.playerProps.onPatternStarted?.(0);
  expect(renderPractice().state?.currentPatternId).toBe(4);
});

// 이 테스트 파일의 player 경로에서는 GPU·에셋 I/O만 대체하고 입력·세션·반복은 실제 구현을 쓴다.
vi.mock('../../renderer', () => ({ GameRenderer: class {
  init = async () => {};
  dispose() {}
  resetTransientState() {}
  updateAccuracy() {}
  setPerfectWindow() {}
  setExplicitChart() {}
  updateTutorialKeyboardKeys() {}
  setLaneKeyLabels() {}
  setKeyBeam() {}
  setKeyState() {}
  renderFrame() {}
  showJudgmentGroup() {}
  recordFlightJudgment() {}
  showBombEffect() {}
} }));
vi.mock('../../skin', () => ({ SkinManager: class { async loadSkin() {} dispose() {} } }));
vi.mock('../../skin/ExplicitSkinLoader', () => ({ ExplicitSkinLoader: class { async load() {} dispose() {} } }));

it('실제 player는 +100ms offset으로 150ms E를 Perfect로 판정하고 완료 후 시연을 선택해야 다음 시작을 알린다', async () => {
  useGameStore.setState({ settings: { ...initialSettings, inputOffsetMs: 100 } });
  vi.stubGlobal('requestAnimationFrame', window.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', window.cancelAnimationFrame);
  const onPatternStarted = vi.fn(() => 'directInput' as const);
  const onPatternFinished = vi.fn(() => false as const);
  const onScoreChanged = vi.fn();
  const onReady = vi.fn();
  const props = { preview: ALL_TUTORIAL_PREVIEWS[1], inputMode: 'directInput' as const,
    onPatternStarted, onPatternFinished, onScoreChanged, onReady };
  hooks.cursor = 0;
  const nodes = elements(TutorialPreviewPlayer(props));
  for (const node of nodes) {
    const ref = (node.props as { ref?: { current: unknown } }).ref;
    if (ref) ref.current = node.type === 'canvas' ? {} : { dataset: {} };
  }
  hooks.effects.splice(0).forEach(effect => effect());
  await vi.dynamicImportSettled();
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(onPatternStarted).toHaveBeenCalledExactlyOnceWith(0);
  onScoreChanged.mockClear();
  vi.advanceTimersByTime(150);
  const down = new Event('keydown', { cancelable: true });
  Object.defineProperties(down, { code: { value: 'KeyE' }, timeStamp: { value: performance.now() }, repeat: { value: false } });
  window.dispatchEvent(down);
  vi.advanceTimersByTime(150);
  expect(onScoreChanged).toHaveBeenCalledWith(expect.objectContaining({ processedNotes: 1, judgmentCounts: expect.objectContaining({ perfect: 1 }) }), 1);
  vi.advanceTimersByTime(1400);
  expect(onPatternFinished).toHaveBeenCalledTimes(1);
  expect(onPatternStarted).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(5000);
  expect(onPatternFinished).toHaveBeenCalledTimes(1);
  hooks.cursor = 0;
  TutorialPreviewPlayer({ ...props, paused: true });
  hooks.effects.splice(0).forEach(effect => effect());
  const onDemonstrationStarted = vi.fn(() => 'demonstration' as const);
  hooks.cursor = 0;
  TutorialPreviewPlayer({ ...props, inputMode: 'demonstration', paused: false, onPatternStarted: onDemonstrationStarted });
  hooks.effects.splice(0).forEach(effect => effect());
  vi.advanceTimersByTime(32);
  expect(onDemonstrationStarted).toHaveBeenCalledExactlyOnceWith(1);
});

it('0ms 탭이 있는 player에서 시작 콜백이 directInput을 반환하면 첫 프레임에 시연 점수를 만들지 않는다', async () => {
  vi.stubGlobal('requestAnimationFrame', window.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', window.cancelAnimationFrame);
  const onScoreChanged = vi.fn();
  const base = ALL_TUTORIAL_PREVIEWS[1];
  const preview = createExplicitTutorialPreview('zero-tap', '0ms 탭', [], 3, {
    ...base.chart, notes: [{ type: 'tap', kind: 'single', lane: 2, beat: beat(0) }],
    events: [base.chart.events[0], { type: 'tutorialInput', lane: 2, keyCode: 'KeyE', keyLabel: 'E',
      beat: beat(0), endBeat: beat(1), editorLane: 3 }],
  });
  hooks.cursor = 0;
  const nodes = elements(TutorialPreviewPlayer({ preview, onPatternStarted: () => 'directInput', onScoreChanged }));
  for (const node of nodes) {
    const ref = (node.props as { ref?: { current: unknown } }).ref;
    if (ref) ref.current = node.type === 'canvas' ? {} : { dataset: {} };
  }
  hooks.effects.splice(0).forEach(effect => effect());
  await vi.dynamicImportSettled();
  // 0ms의 tutorialInput도 함께 두어 자동 입력이 앞서 실행되면 Perfect로 드러나게 한다.
  expect(onScoreChanged.mock.calls.every(([score]) => score.processedNotes === 0)).toBe(true);
});

it('실습 중 설정을 4키에서 2키로 줄이면 다음 차트 시작은 시연이고 키를 복구해도 자동으로 직접 입력하지 않는다', () => {
  renderModal().click('Advanced');
  settle().click('직접 입력');
  useGameStore.setState({ settings: { ...initialSettings, keyBindings: { ...initialSettings.keyBindings, lane1: ['KeyQ', 'KeyW'] } } });
  let page = renderModal();
  expect(page.player('advanced-double-hold').onPatternStarted?.(0)).toBe('demonstration');
  useGameStore.setState({ settings: initialSettings });
  page = renderModal();
  expect(page.player('advanced-double-hold').inputMode).toBe('demonstration');
});

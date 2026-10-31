import { isValidElement, type ReactElement, type ReactNode, type ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TutorialHelpModal } from './TutorialHelpModal';
import { TutorialPreviewPlayer } from './TutorialPreviewPlayer';
import { useGameStore } from '../../stores';
import { createExplicitTutorialPreviewPlayback, createTutorialTimingsInputPlan } from './explicitTutorialPreviewPlayback';
import { useTutorialPractice } from './useTutorialPractice';
import { beat } from '../../../shared/types/beat';
import { createExplicitTutorialPreview } from './explicitTutorialPreviewChart';
import { DEFAULT_MAX_GREAT_OR_WORSE_COUNT, createTutorialPracticeSpec } from './tutorialPractice';
import { ALL_TUTORIAL_PREVIEWS } from './tutorialCatalog';
import { getTutorialInputTimings } from './tutorialPreviewChart';
import { useTutorialPassRecords } from './useTutorialPassRecords';
import { createExplicitTutorialPreviewSessionController } from './explicitTutorialPreviewSession';
import { createTutorialPassSync } from './tutorialPassSync';
import { useAuth } from '../../../shared/hooks/useAuth';
import type { ExplicitJudgmentSnapshot } from '../../judgment/ExplicitJudgmentState';

vi.mock('react-dom', () => ({ createPortal: (children: ReactNode) => children }));
vi.mock('./TutorialPatternDiagram', () => ({ TutorialPatternDiagram: () => null }));

const client = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), upsert: vi.fn(), rpc: vi.fn(),
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
}));
vi.mock('../../../supabase/client', () => ({ supabase: client }));

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
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
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
  'aria-label'?: string;
  onKeyDown?: ComponentProps<'button'>['onKeyDown'];
  'data-tutorial-index-item'?: string; 'data-tutorial-condition-status'?: string; 'data-tutorial-condition'?: string;
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
let valueByKey: Map<string, string>;
let authUserId: string | null;
let authLoading: boolean;
let modalOpen: boolean;
const PassRecordsHarness = () => useTutorialPassRecords(authUserId, authLoading, modalOpen);
function renderModal(isAdmin = false) {
  hooks.cursor = 0;
  const passRecords = PassRecordsHarness();
  const nodes = elements(TutorialHelpModal({ onClose, onItemPassed, isAdmin, passRecords }));
  hooks.effects.splice(0).forEach(effect => effect());
  return {
    nodes,
    button(label: string) { return nodes.find(node => node.type === 'button' && node.props.children === label)!; },
    click(label: string) { const button = this.button(label); expect(button, label).toBeDefined(); button.props.onClick!(); },
    select(id: string) { nodes.find(node => node.props['data-tutorial-index-item'] === id)!.props.onClick!(); },
    get passedIds() {
      return nodes.filter(node => node.props['data-tutorial-index-item']
        && elements(node.props.children).some(child => child.props['aria-label'] === 'Passed tutorial'))
        .map(node => node.props['data-tutorial-index-item']);
    },
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
  rendered.frames = [];
  authUserId = null; authLoading = false; modalOpen = true;
  client.from.mockReset().mockReturnValue(client);
  client.select.mockReset().mockReturnValue(client);
  client.eq.mockReset().mockResolvedValue({ data: [], error: null });
  client.upsert.mockReset().mockResolvedValue({ error: null });
  client.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  client.auth.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'A' } } }, error: null });
  client.auth.onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  useGameStore.setState({ settings: initialSettings, settingsOpen: false });
  const target = new EventTarget();
  valueByKey = new Map();
  vi.stubGlobal('window', Object.assign(target, {
    localStorage: {
      getItem: vi.fn((key: string) => valueByKey.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { valueByKey.set(key, value); }),
      removeItem: vi.fn((key: string) => { valueByKey.delete(key); }),
    },
    setTimeout, clearTimeout,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16),
    cancelAnimationFrame: clearTimeout,
  }));
});
afterEach(() => {
  hooks.cleanups.forEach(cleanup => cleanup?.());
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
});

it('팝업이 닫힌 채 A로 로그인해도 게스트 single-note를 인계하고 열면 서버 double-note와 함께 보이며 로그아웃에는 숨긴다', async () => {
  vi.stubGlobal('navigator', { locks: { request: (_name: string, run: () => unknown) => Promise.resolve(run()) } });
  valueByKey.set('not4k-tutorial-passed-ids', '["single-note"]');
  client.eq.mockResolvedValue({ data: [{ tutorial_id: 'double-note' }], error: null });
  modalOpen = false;
  renderModal();
  authUserId = 'A';
  renderModal();
  await vi.advanceTimersByTimeAsync(0);
  expect(client.rpc).toHaveBeenCalledTimes(1);
  modalOpen = true;
  expect(renderModal().passedIds).toEqual(['single-note', 'double-note']);
  await vi.advanceTimersByTimeAsync(0);
  expect(client.eq).toHaveBeenCalledTimes(2);
  expect(renderModal().button('Reset Passed')).toBeUndefined();
  authUserId = null;
  expect(renderModal().passedIds).toEqual([]);
  authUserId = 'B';
  expect(renderModal().passedIds).toEqual([]);
  await vi.advanceTimersByTimeAsync(0);
});

it('A의 프로필 로딩 중 single-note 통과 뒤 B로 바꾸고 화면을 나가도 A의 저장 기록만 남는다', async () => {
  authUserId = 'A'; authLoading = true;
  openLesson().click('직접 입력');
  let page = renderModal();
  for (let iteration = 1; iteration <= 3; iteration++) {
    page.player().onPatternStarted?.(iteration);
    page.player().onPatternFinished?.(result());
    page = renderModal();
  }
  authUserId = 'B'; authLoading = false;
  renderModal();
  hooks.cleanups.forEach(cleanup => cleanup?.());
  await vi.advanceTimersByTimeAsync(0);
  const reopened = createTutorialPassSync(window.localStorage);
  expect(reopened.getPassedIds('A')).toEqual(['single-note']);
  expect(reopened.getPassedIds('B')).toEqual([]);
  expect(reopened.getPassedIds(null)).toEqual([]);
});

it('인증 확인 중 single-note를 3회 성공하면 게스트에 쓰지 않고 A 확인 뒤 A의 캐시와 서버에만 저장한다', async () => {
  authLoading = true;
  openLesson().click('직접 입력');
  let page = renderModal();
  for (let iteration = 1; iteration <= 3; iteration++) {
    page.player().onPatternStarted?.(iteration);
    page.player().onPatternFinished?.(result());
    page = renderModal();
  }
  authUserId = 'A'; authLoading = false;
  renderModal();
  await vi.advanceTimersByTimeAsync(0);
  expect(renderModal().passedIds).toEqual(['single-note']);
  expect(client.upsert).toHaveBeenCalledWith({ user_id: 'A', tutorial_id: 'single-note' }, expect.any(Object));
  expect(JSON.parse(valueByKey.get('not4k-tutorial-pass-state')!).guestIds).toEqual([]);
  authUserId = null;
  expect(renderModal().passedIds).toEqual([]);
});

it('초기 인증 조회 실패 뒤 single-note 통과는 영구 미확정으로 남고 완료 시 조회가 A를 확인하면 A에만 저장한다', async () => {
  client.auth.getSession.mockRejectedValueOnce(new Error('offline'));
  let finishOwner!: () => void;
  client.auth.getSession.mockReturnValueOnce(new Promise(resolve => {
    finishOwner = () => resolve({ data: { session: { user: { id: 'A' } } }, error: null });
  }));
  function AuthAndPassRecordsHarness() {
    const auth = useAuth();
    return { auth, records: useTutorialPassRecords(auth.user?.id ?? null, auth.sessionLoading, true) };
  }
  function renderRecords() {
    hooks.cursor = 0;
    const result = AuthAndPassRecordsHarness();
    hooks.effects.splice(0).forEach(effect => effect());
    return result;
  }
  renderRecords();
  await vi.advanceTimersByTimeAsync(0);
  const { auth, records } = renderRecords();
  expect(auth).toMatchObject({ user: null, sessionLoading: true, loading: false });
  expect(records.isGuest).toBe(false);

  records.recordPass('single-note');
  await vi.advanceTimersByTimeAsync(0);
  const pending = createTutorialPassSync(window.localStorage);
  expect(pending.getSnapshot().unresolvedPasses).toEqual([
    { completionId: expect.any(String), tutorialId: 'single-note' },
  ]);
  expect(pending.getPassedIds(null)).toEqual([]);
  expect(client.upsert).not.toHaveBeenCalled();
  expect(client.rpc).not.toHaveBeenCalled();

  finishOwner();
  await vi.advanceTimersByTimeAsync(0);
  const resolved = createTutorialPassSync(window.localStorage);
  expect(resolved.getSnapshot().unresolvedPasses).toEqual([]);
  expect(resolved.getPassedIds('A')).toEqual(['single-note']);
  expect(resolved.getPassedIds('B')).toEqual([]);
  expect(resolved.getPassedIds(null)).toEqual([]);
});

it('세션 미확정 통과는 먼저 영구 보관하고 화면 종료·B 로그인 뒤에도 완료 때 시작한 세션 조회의 A에만 귀속한다', async () => {
  let finishSession!: () => void;
  client.auth.getSession.mockReturnValueOnce(new Promise(resolve => {
    finishSession = () => resolve({ data: { session: { user: { id: 'A' } } }, error: null });
  }));
  authLoading = true;
  openLesson().click('직접 입력');
  let page = renderModal();
  for (let iteration = 1; iteration <= 3; iteration++) {
    page.player().onPatternStarted?.(iteration);
    page.player().onPatternFinished?.(result());
    page = renderModal();
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(valueByKey.get('not4k-tutorial-pass-state')).toContain('single-note');
  hooks.cleanups.forEach(cleanup => cleanup?.());
  hooks.cursor = 0; hooks.slots = []; hooks.effects = []; hooks.cleanups = [];
  authUserId = 'B'; authLoading = false;
  renderModal();
  await vi.advanceTimersByTimeAsync(0);
  finishSession();
  await vi.advanceTimersByTimeAsync(0);
  const reopened = createTutorialPassSync(window.localStorage);
  expect(reopened.getPassedIds('A')).toEqual(['single-note']);
  expect(reopened.getPassedIds('B')).toEqual([]);
  expect(reopened.getPassedIds(null)).toEqual([]);
  expect(client.upsert).not.toHaveBeenCalled();
});

it.each([null, 'A'])('%s의 팝업이 열린 상태에서 새 통과 저장소의 storage 이벤트를 받으면 해당 주체의 double-note 체크만 추가한다', async userId => {
  authUserId = userId;
  const state = {
    guestIds: ['single-note'],
    accountPassedIdsByUser: { A: ['single-note'], B: ['trill-note'] },
    pendingHandoff: null,
  };
  // 인계 없이 게스트·계정 캐시의 storage 동기화만 확인한다.
  vi.stubGlobal('navigator', {});
  valueByKey.set('not4k-tutorial-pass-state', JSON.stringify(state));
  renderModal();
  await vi.advanceTimersByTimeAsync(0);
  expect(renderModal().passedIds).toEqual(['single-note']);

  if (userId === null) state.guestIds.push('double-note');
  else state.accountPassedIdsByUser.A.push('double-note');
  valueByKey.set('not4k-tutorial-pass-state', JSON.stringify(state));
  expect(renderModal().passedIds).toEqual(['single-note']);
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'not4k-tutorial-pass-state' }));
  expect(renderModal().passedIds).toEqual(['single-note', 'double-note']);

  authUserId = userId === null ? 'A' : null;
  expect(renderModal().passedIds).toEqual(['single-note']);
  await vi.advanceTimersByTimeAsync(0);
  authUserId = 'B';
  expect(renderModal().passedIds).toEqual(['trill-note']);
  await vi.advanceTimersByTimeAsync(0);
});

it('single-note가 2/3에서 3/3이 되면 1회 저장하고 목록 체크가 즉시 나타나며 중복 완료는 다시 저장하지 않는다', () => {
  openLesson().click('직접 입력');
  let page = renderModal();
  for (let iteration = 1; iteration <= 2; iteration++) {
    page.player().onPatternStarted?.(iteration);
    page.player().onPatternFinished?.(result());
    page = renderModal();
  }
  expect(page.progress).toBe('2/3');
  expect(page.passedIds).toEqual([]);
  expect(window.localStorage.setItem).not.toHaveBeenCalled();
  page.player().onPatternStarted?.(3);
  page.player().onPatternFinished?.(result());
  page = renderModal();
  expect(page.passedIds).toEqual(['single-note']);
  expect(window.localStorage.setItem).toHaveBeenCalledExactlyOnceWith(
    'not4k-tutorial-pass-state', JSON.stringify({ guestIds: ['single-note'], accountPassedIdsByUser: {}, pendingHandoffs: [], unresolvedPasses: [] }),
  );
  page.player().onPatternFinished?.(result());
  renderModal();
  expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
  page.click('Reset Passed');
  page = renderModal();
  expect(page.progress).toBe('3/3');
  expect(page.passedIds).toEqual([]);
  page.player().onPatternFinished?.(result());
  expect(renderModal().passedIds).toEqual([]);
  expect(JSON.parse(valueByKey.get('not4k-tutorial-pass-state')!).guestIds).toEqual([]);
  expect(window.localStorage.setItem).toHaveBeenCalledTimes(2);
});

it('single-note·알 수 없는 ID·기존 viewed 기록으로 목록을 열면 single-note만 체크하고 시연·항목 이동은 저장하지 않는다', () => {
  valueByKey.set('not4k-tutorial-passed-ids', '["single-note","future-lesson"]');
  valueByKey.set('not4k-tutorial-viewed-ids', '["double-note"]');
  expect(renderModal().passedIds).toEqual(['single-note']);
  const page = openLesson('double-note');
  page.player('double-note').onPatternFinished?.(result('double-note'));
  const updated = renderModal();
  expect(updated.passedIds).toEqual(['single-note']);
  expect(updated.nodes.some(node => node.props['aria-label'] === 'Viewed tutorial')).toBe(false);
  expect(updated.nodes.some(node => node.props['data-tutorial-index-item'] === 'future-lesson')).toBe(false);
  expect(window.localStorage.getItem).not.toHaveBeenCalledWith('not4k-tutorial-viewed-ids');
  expect(window.localStorage.setItem).not.toHaveBeenCalled();
  expect(valueByKey.get('not4k-tutorial-viewed-ids')).toBe('["double-note"]');
});

it('single-note를 통과한 뒤 Miss 3회로 실패하고 재방문·재개방·재통과해도 체크와 기존 알 수 없는 ID를 유지한다', () => {
  valueByKey.set('not4k-tutorial-passed-ids', '["future-lesson"]');
  openLesson().click('직접 입력');
  let page = renderModal();
  for (let iteration = 1; iteration <= 3; iteration++) {
    page.player().onPatternStarted?.(iteration);
    page.player().onPatternFinished?.(result());
    page = renderModal();
  }
  page.select('double-note');
  settle().select('single-note');
  page = settle();
  expect(page.progress).toBe('0/3');
  expect(page.passedIds).toEqual(['single-note']);
  page.click('직접 입력');
  page = renderModal();
  page.player().onPatternStarted?.(0);
  const finished = result();
  page.player().onPatternFinished?.({ ...finished, result: { ...finished.result,
    score: { ...finished.result.score, earnedScore: 0,
      judgmentCounts: { ...finished.result.score.judgmentCounts, perfect: 0, miss: 3 },
    },
  } });
  expect(renderModal().progress).toBe('0/3');
  expect(renderModal().passedIds).toEqual(['single-note']);
  hooks.cleanups.forEach(cleanup => cleanup?.());
  hooks.slots = []; hooks.cleanups = []; hooks.effects = [];
  page = openLesson();
  expect(page.progress).toBe('0/3');
  expect(page.passedIds).toEqual(['single-note']);
  page.click('직접 입력');
  page = renderModal();
  for (let iteration = 1; iteration <= 3; iteration++) {
    page.player().onPatternStarted?.(iteration);
    page.player().onPatternFinished?.(result());
    page = renderModal();
  }
  expect(page.progress).toBe('3/3');
  expect(page.passedIds).toEqual(['single-note']);
  expect(onItemPassed).toHaveBeenCalledTimes(2);
  expect(window.localStorage.setItem).toHaveBeenCalledExactlyOnceWith(
    'not4k-tutorial-pass-state', JSON.stringify({ guestIds: ['future-lesson', 'single-note'], accountPassedIdsByUser: {}, pendingHandoffs: [], unresolvedPasses: [] }),
  );
});

it.each([
  [false, false, false], [false, true, true], [true, false, true], [true, true, true],
])('dev=%s·admin=%s에서 목록을 열면 Reset Passed 표시가 %s이다', (isDev, isAdmin, visible) => {
  vi.stubEnv('DEV', isDev);
  expect(!!renderModal(isAdmin).button('Reset Passed')).toBe(visible);
});

it('통과 기록과 viewed·설정이 있을 때 Reset Passed를 누르면 모든 통과 체크만 즉시 지우고 재개방해도 복원하지 않는다', () => {
  valueByKey.set('not4k-tutorial-passed-ids', '["single-note","advanced-recovery","future-lesson"]');
  valueByKey.set('not4k-tutorial-viewed-ids', '["double-note"]');
  valueByKey.set('not4k-settings', '{"volume":0.5}');
  expect(renderModal().passedIds).toEqual(['single-note']);
  renderModal().click('Reset Passed');
  expect(renderModal().passedIds).toEqual([]);
  renderModal().click('Advanced');
  expect(settle().passedIds).toEqual([]);
  expect(valueByKey.get('not4k-tutorial-viewed-ids')).toBe('["double-note"]');
  expect(valueByKey.get('not4k-settings')).toBe('{"volume":0.5}');
  expect(JSON.parse(valueByKey.get('not4k-tutorial-pass-state')!).guestIds).toEqual([]);
  hooks.cleanups.forEach(cleanup => cleanup?.());
  hooks.slots = []; hooks.cleanups = []; hooks.effects = [];
  expect(renderModal().passedIds).toEqual([]);
  expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
});

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

it('성공 정산의 met·1/3은 다음 첫 판정까지 유지하며 Miss 1개면 neutral, 2개면 failed로 바뀐다', () => {
  openLesson().click('직접 입력');
  let page = renderModal();
  expect(page.nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('neutral');
  const finished = result();
  page.player().onPatternStarted?.(1);
  page.player().onScoreChanged?.(finished.result.score, 3);
  page = renderModal();
  expect(page.nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('met');
  expect(page.progress).toBe('0/3');
  expect(page.nodes.find(node => node.props.children === '콤보 3')).toBeDefined();
  page.player().onPatternFinished?.(finished);
  page.player().onPatternStarted?.(2);
  page = renderModal();
  expect(page.progress).toBe('1/3');
  expect(page.nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('met');
  page.player().onScoreChanged?.({ ...finished.result.score, processedNotes: 0, liveDenominatorWeight: 0, earnedScore: 0 }, 0);
  expect(renderModal().nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('met');
  page.player().onScoreChanged?.({ ...finished.result.score, processedNotes: 1, liveDenominatorWeight: 3, earnedScore: 0,
    judgmentCounts: { ...finished.result.score.judgmentCounts, perfect: 0, miss: 1 },
  }, 0);
  expect(renderModal().nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('neutral');
  page.player().onScoreChanged?.({ ...finished.result.score, processedNotes: 2, liveDenominatorWeight: 6, earnedScore: 0,
    judgmentCounts: { ...finished.result.score.judgmentCounts, perfect: 0, miss: 2 },
  }, 0);
  expect(renderModal().nodes.find(node => node.props['data-tutorial-condition-status'])?.props['data-tutorial-condition-status']).toBe('failed');
});

it.each([
  ['long-note', 2500], ['connected-trill-long', 3000],
] as const)('%s는 %ims까지 점수 판정을 모두 Perfect로 정산해도 이후 바디 Miss 1개를 최종 평가해 성공 0/3이다', (id, lastTapMs) => {
  openLesson(id).click('직접 입력');
  let page = renderModal();
  page.player(id).onPatternStarted?.(1);
  const lesson = ALL_TUTORIAL_PREVIEWS.find(item => item.id === id)!;
  const timings = getTutorialInputTimings(lesson.chart).map(timing => ({ ...timing,
    endMs: timing.endMs > lastTapMs ? lastTapMs + 100 : timing.endMs,
  }));
  const controller = createExplicitTutorialPreviewSessionController(lesson.chart, createTutorialTimingsInputPlan(timings));
  try {
    controller.advanceTo(lastTapMs);
    const liveScore = controller.session.score;
    expect(liveScore.processedNotes).toBe(liveScore.totalNotes);
    expect(liveScore.judgmentCounts.miss).toBe(0);
    page.player(id).onScoreChanged?.(liveScore, controller.session.combo);
    page = renderModal();
    expect(page.nodes.filter(node => node.props['data-tutorial-condition-status'])
      .every(node => node.props['data-tutorial-condition-status'] === 'met')).toBe(true);
    expect(page.progress).toBe('0/3');

    const finalized = controller.finish(lesson.loopMs);
    expect(finalized.score.achievementRate).toBe(100);
    expect(finalized.score.judgmentCounts.miss).toBe(1);
    expect(finalized.facts.filter(fact => fact.kind === 'bodyFailed'))
      .toMatchObject([{ unscoredMiss: true }]);
    page.player(id).onPatternFinished?.({ iteration: 1, result: finalized });
    page = renderModal();
    expect(page.nodes.find(node => node.props['data-tutorial-condition'] === 'maxGreatOrWorseCount')
      ?.props['data-tutorial-condition-status']).toBe('met');
    expect(page.nodes.find(node => node.props['data-tutorial-condition'] === 'maxMissCount')
      ?.props['data-tutorial-condition-status']).toBe('failed');
    expect(page.nodes.find(node => node.props['aria-label'] === '실패')?.props.children).toBe('✕');
    expect(page.progress).toBe('0/3');
    expect(onItemPassed).not.toHaveBeenCalled();
  } finally {
    controller.dispose();
  }
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

it.each([
  ['single-note', ['Great 이하 1개 이하']],
  ['trill-note', ['Great 이하 1개 이하', 'goodTrill 0회']],
  ['long-note', ['Great 이하 1개 이하', 'Miss 0회']],
  ['connected-trill-long', ['Great 이하 1개 이하', 'Miss 0회', 'goodTrill 0회']],
] as const)('%s의 직접 입력은 조건 %j를 한 줄씩 중립 아이콘과 함께 표시한다', (id, labels) => {
  openLesson(id).click('직접 입력');
  const page = renderModal();
  const conditions = page.nodes.filter(node => node.props['data-tutorial-condition-status']);
  expect(conditions).toHaveLength(labels.length);
  conditions.forEach((condition, index) => {
    expect(condition.props.children).toContain(labels[index]);
    expect(condition.props['data-tutorial-condition-status']).toBe('neutral');
    expect(elements(condition).find(node => node.props['aria-label'] === '진행 중')?.props.children).toBe('·');
  });
});

it('trill-note에서 goodTrill 1회이면 Great 이하 1개 조건은 neutral이고 goodTrill 0회 조건만 즉시 실패한다', () => {
  openLesson('trill-note').click('직접 입력');
  let page = renderModal();
  const score = result('trill-note').result.score;
  page.player('trill-note').onScoreChanged?.({ ...score,
    processedNotes: 1, liveDenominatorWeight: 3, earnedScore: 1, goodTrillCount: 1,
    judgmentCounts: { ...score.judgmentCounts, perfect: 0, goodTrill: 1 },
  }, 1);
  page = renderModal();
  const conditions = page.nodes.filter(node => node.props['data-tutorial-condition-status']);
  expect(conditions.map(node => node.props['data-tutorial-condition-status'])).toEqual(['neutral', 'failed']);
  expect(conditions[1].props.children).toContain('goodTrill 0회');
});


it('방법이 2개인 항목에서 첫 방법 3/3은 통과를 알리지 않고 다음 방법도 3/3이 되어야 통과를 1회 알린다', () => {
  const lesson = { ...ALL_TUTORIAL_PREVIEWS[1], practice: createTutorialPracticeSpec({
    conditions: [{ kind: 'maxGreatOrWorseCount', count: DEFAULT_MAX_GREAT_OR_WORSE_COUNT }], playingMethods: [{ id: 'hold' }, { id: 'swap' }],
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
  practice.dispatch({ type: 'modeSelected', mode: 'directInput' });
  practice = renderPractice();
  practice.playerProps.onPatternFinished?.(result());
  expect(onItemPassed).not.toHaveBeenCalled();
  for (let i = 1; i <= 3; i++) {
    practice.playerProps.onPatternStarted?.(i);
    practice.playerProps.onPatternFinished?.(result());
    expect(onItemPassed).toHaveBeenCalledTimes(i === 3 ? 1 : 0);
  }
  expect(onItemPassed).toHaveBeenCalledExactlyOnceWith('single-note');
  practice.playerProps.onPatternFinished?.(result());
  expect(onItemPassed).toHaveBeenCalledTimes(1);
});

const rendered = vi.hoisted(() => ({ frames: [] as { timeMs: number; snapshot?: ExplicitJudgmentSnapshot }[] }));

// 이 테스트 파일의 player 경로에서는 GPU·에셋 I/O만 대체하고 입력·세션·반복은 실제 구현을 쓴다.
vi.mock('../../renderer', () => ({ GameRenderer: class {
  init = async () => {};
  dispose() {}
  resetTransientState() {}
  updateAccuracy() {}
  setPerfectWindow() {}
  snapshot?: () => ExplicitJudgmentSnapshot;
  setExplicitChart(_chart: unknown, _skin: unknown, snapshot: () => ExplicitJudgmentSnapshot) { this.snapshot = snapshot; }
  updateTutorialKeyboardKeys() {}
  setLaneKeyLabels() {}
  setKeyBeam() {}
  setKeyState() {}
  renderFrame(timeMs: number) { rendered.frames.push({ timeMs, snapshot: this.snapshot?.() }); }
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

function mockMetronomeAudio(state: AudioContextState = 'running') {
  const starts: number[] = [];
  const stop = vi.fn();
  const gain = { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  const gains: { value: number }[] = [];
  let runningSince = state === 'running' ? performance.now() : null;
  const audio = { state, baseLatency: 0.01, outputLatency: 0.07, destination: {},
    get currentTime() { return runningSince === null ? 0 : (performance.now() - runningSince) / 1000; },
    createGain: () => { const next = { ...gain }; gains.push(next); return { gain: next, connect() {}, disconnect() {} }; },
    createOscillator: () => ({ frequency: { value: 0 }, start: (at: number) => starts.push(at), stop,
      connect() {}, disconnect() {}, onended: null }),
    resume: vi.fn(async () => { runningSince ??= performance.now(); audio.state = 'running'; }), close: vi.fn(async () => {}),
  };
  const create = vi.fn(function () { return audio; });
  vi.stubGlobal('AudioContext', create);
  return { audio, starts, stop, create, gains };
}

function renderMetronomePlayer(props: ComponentProps<typeof TutorialPreviewPlayer>) {
  hooks.cursor = 0;
  const nodes = elements(TutorialPreviewPlayer(props));
  let dataset: Record<string, string> = {};
  for (const node of nodes) {
    const ref = (node.props as { ref?: { current: unknown } }).ref;
    if (ref) {
      ref.current ??= node.type === 'canvas' ? {} : { dataset: {} };
      if (node.type !== 'canvas') dataset = (ref.current as { dataset: typeof dataset }).dataset;
    }
  }
  hooks.effects.splice(0).forEach(effect => effect());
  return { dataset, nodes };
}

it('120 BPM의 직접 입력은 준비 4박 동안 0ms에 멈추고 E를 채점하지 않다가 출력 원점 기준 입력을 Perfect로 판정한다', async () => {
  const { TutorialMetronome } = await import('../../audio/TutorialMetronome');
  const { starts } = mockMetronomeAudio();
  const metronome = new TutorialMetronome();
  useGameStore.setState({ settings: { ...initialSettings, inputOffsetMs: 100 } });
  vi.stubGlobal('requestAnimationFrame', window.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', window.cancelAnimationFrame);
  const onScoreChanged = vi.fn();
  const { dataset } = renderMetronomePlayer({ preview: ALL_TUTORIAL_PREVIEWS[1],
    inputMode: 'directInput', metronome, onScoreChanged });
  await vi.dynamicImportSettled();
  const key = (type: string) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: 'KeyE' }, timeStamp: { value: performance.now() }, repeat: { value: false } });
    window.dispatchEvent(event);
  };
  vi.advanceTimersByTime(500);
  key('keydown'); key('keyup');
  vi.advanceTimersByTime(1500);
  expect(dataset.tutorialElapsedMs).toBe('0');
  expect(starts.filter(at => at + 0.08 <= 2)).toHaveLength(4);
  expect(onScoreChanged.mock.calls.every(([score]) => score.processedNotes === 0)).toBe(true);
  vi.advanceTimersByTime(Number(dataset.tutorialLoopOriginNow) + 150 - performance.now());
  key('keydown');
  vi.advanceTimersByTime(150);
  expect(onScoreChanged).toHaveBeenCalledWith(expect.objectContaining({ judgmentCounts: expect.objectContaining({ perfect: 1 }) }), 1);
  metronome.dispose();
});

it.each(['pointerdown', 'keydown'])('모달의 두 슬롯은 같은 메트로놈을 공유하고 첫 %s으로 suspended 출력을 재개하며 닫으면 context를 해제한다', gesture => {
  const { audio, create } = mockMetronomeAudio('suspended');
  const players = renderModal().nodes.filter(node => node.type === TutorialPreviewPlayer)
    .map(node => node.props as ComponentProps<typeof TutorialPreviewPlayer>);
  expect(players).toHaveLength(2);
  expect(players[0].metronome).toBeDefined();
  expect(players[0].metronome).toBe(players[1].metronome);
  expect(players.map(player => player.metronomeActive)).toEqual([true, false]);
  expect(create).not.toHaveBeenCalled();
  window.dispatchEvent(new Event(gesture));
  expect(create).toHaveBeenCalledTimes(1);
  expect(audio.resume).toHaveBeenCalledTimes(1);
  hooks.cleanups.forEach(cleanup => cleanup?.());
  hooks.cleanups = [];
  expect(audio.close).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('keydown'));
  expect(create).toHaveBeenCalledTimes(1);
});

it('대기 슬롯을 5초 뒤 활성화하면 그때 4박을 시작하고 반복·모드 전환·2초 일시정지 재개에는 준비를 반복하지 않는다', async () => {
  const { TutorialMetronome } = await import('../../audio/TutorialMetronome');
  const { starts, create, stop } = mockMetronomeAudio();
  const metronome = new TutorialMetronome();
  vi.stubGlobal('requestAnimationFrame', window.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', window.cancelAnimationFrame);
  const onPatternStarted = vi.fn();
  const props = { preview: ALL_TUTORIAL_PREVIEWS[1], metronome, onPatternStarted };
  const { dataset } = renderMetronomePlayer({ ...props, paused: true, metronomeActive: false });
  await vi.dynamicImportSettled();
  vi.advanceTimersByTime(5000);
  expect(create).not.toHaveBeenCalled();
  renderMetronomePlayer({ ...props, paused: false, metronomeActive: true });
  vi.advanceTimersByTime(2306);
  expect(starts.slice(0, 5).map(at => Math.round(at * 1000))).toEqual([5225, 5725, 6225, 6725, 7225]);
  vi.advanceTimersByTime(3200);
  expect(onPatternStarted).toHaveBeenCalledTimes(3);
  expect(dataset.tutorialCountIn).toBe('false');
  renderMetronomePlayer({ ...props, inputMode: 'directInput' });
  renderMetronomePlayer({ ...props, inputMode: 'demonstration' });
  const elapsed = Number(dataset.tutorialElapsedMs);
  renderMetronomePlayer({ ...props, paused: true });
  const count = starts.length;
  expect(stop).toHaveBeenCalled();
  vi.advanceTimersByTime(2000);
  expect(starts).toHaveLength(count);
  renderMetronomePlayer({ ...props, paused: false });
  vi.advanceTimersByTime(32);
  expect(Number(dataset.tutorialElapsedMs) - elapsed).toBeLessThan(60);
  expect(dataset.tutorialCountIn).toBe('false');
  vi.advanceTimersByTime(600);
  expect(starts.length).toBeGreaterThan(count);
  // 재방문은 같은 렌더러를 재사용해도 준비를 새로 시작한다.
  renderMetronomePlayer({ ...props, previewInstanceId: 1 });
  await vi.dynamicImportSettled();
  vi.advanceTimersByTime(1000);
  expect(dataset.tutorialCountIn).toBe('true');
  expect(dataset.tutorialElapsedMs).toBe('0');
  metronome.dispose();
});

it('0박 도식은 4박 준비 뒤 소리를 멈추고 OK 뒤에는 새 준비 없이 도식 끝 1000ms에서 이어진다', async () => {
  const { TutorialMetronome } = await import('../../audio/TutorialMetronome');
  const { starts } = mockMetronomeAudio();
  const metronome = new TutorialMetronome();
  vi.stubGlobal('requestAnimationFrame', window.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', window.cancelAnimationFrame);
  vi.stubGlobal('document', { body: {} });
  const props = { preview: ALL_TUTORIAL_PREVIEWS.find(preview => preview.id === 'connected-long-note-switch')!, metronome };
  const { dataset } = renderMetronomePlayer(props);
  await vi.dynamicImportSettled();
  vi.advanceTimersByTime(2400);
  expect(starts).toHaveLength(4);
  vi.advanceTimersByTime(5000);
  expect(starts).toHaveLength(4);
  // createPortal은 테스트에서 DOM 없이 React 트리만 돌려준다.
  renderMetronomePlayer(props);
  const { nodes } = renderMetronomePlayer(props);
  const ok = nodes.find(node => (node.props as Record<string, unknown>)['data-tutorial-diagram-ok']);
  expect(ok).toBeDefined();
  const resumeNow = performance.now();
  ok!.props.onClick!();
  vi.advanceTimersByTime(100);
  expect(starts).toHaveLength(5);
  expect(starts[4] * 1000 + 80).toBeCloseTo(resumeNow + 105);
  expect(Number(dataset.tutorialLoopTimeMs)).toBe(0);
  vi.advanceTimersByTime(20);
  expect(dataset.tutorialCountIn).toBe('false');
  expect(Number(dataset.tutorialLoopTimeMs)).toBeGreaterThanOrEqual(1000);
  vi.advanceTimersByTime(500);
  expect(starts.length).toBeGreaterThan(4);
  metronome.dispose();
});

it('suspended 자동 시작은 무음으로 진행하고 3초 뒤 제스처로 재개하면 다음 루프 박자에 합류하며 볼륨 0도 즉시 반영한다', async () => {
  const { TutorialMetronome } = await import('../../audio/TutorialMetronome');
  const { audio, starts, gains } = mockMetronomeAudio('suspended');
  const metronome = new TutorialMetronome();
  metronome.setMasterVolume(0.4);
  vi.stubGlobal('requestAnimationFrame', window.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', window.cancelAnimationFrame);
  const props = { preview: ALL_TUTORIAL_PREVIEWS[1], metronome };
  const { dataset } = renderMetronomePlayer(props);
  await vi.dynamicImportSettled();
  vi.advanceTimersByTime(3000);
  expect(starts).toHaveLength(0);
  expect(dataset.tutorialCountIn).toBe('false');
  expect(Number(dataset.tutorialElapsedMs)).toBeGreaterThan(800);
  const origin = Number(dataset.tutorialLoopOriginNow);
  expect(audio.currentTime).toBe(0);
  metronome.resumeFromGesture();
  expect(audio.resume).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(600);
  expect(starts).toHaveLength(1);
  expect(starts[0]).toBeCloseTo(0.525);
  expect(starts[0] * 1000 + 3000 + 80).toBeCloseTo(origin + 1500);
  expect(Number(dataset.tutorialLoopOriginNow)).toBe(origin);
  expect(Number(dataset.tutorialElapsedMs)).toBeGreaterThan(1400);
  expect(gains[0].value).toBe(0.4);
  metronome.setMasterVolume(0);
  expect(gains[0].value).toBe(0);
  metronome.dispose();
});

it('active 슬롯도 로딩 가림막이 보일 때는 멈추고 onReady로 실제 재생기가 보인 뒤에만 준비를 시작한다', () => {
  let page = renderModal();
  const first = page.player('hand-placement');
  expect(first.paused).toBe(true);
  first.onReady?.();
  page = renderModal();
  expect(page.player('hand-placement').paused).toBe(false);
});

function manualFrames() {
  let callback: FrameRequestCallback;
  vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => { callback = next; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  return (ms: number) => {
    vi.advanceTimersByTime(ms);
    callback(performance.now());
  };
}

it('출력 지연 80ms에서 480ms에 멈췄다가 재개하면 105ms 동안 시계도 기다린 뒤 500ms 클릭을 들려준다', async () => {
  const { TutorialMetronome } = await import('../../audio/TutorialMetronome');
  const { starts } = mockMetronomeAudio();
  const metronome = new TutorialMetronome();
  const frame = manualFrames();
  const base = ALL_TUTORIAL_PREVIEWS[1];
  const preview = createExplicitTutorialPreview('resume-tap', '500ms 탭', [], 3, {
    ...base.chart, notes: [{ type: 'tap', kind: 'single', lane: 2, beat: beat(1) }],
  });
  const onScoreChanged = vi.fn();
  const props = { preview, metronome, inputMode: 'directInput' as const, onScoreChanged };
  const { dataset } = renderMetronomePlayer(props);
  await vi.dynamicImportSettled();
  frame(200);
  frame(2105);
  frame(480);
  expect(Number(dataset.tutorialElapsedMs)).toBeCloseTo(480);
  renderMetronomePlayer({ ...props, paused: true });
  frame(2000);
  const count = starts.length;
  renderMetronomePlayer({ ...props, paused: false });
  const resumeNow = performance.now();
  const renderedBeforeResume = rendered.frames.length;
  const scoresBeforeResume = onScoreChanged.mock.calls.length;
  const key = (type: string) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: 'KeyE' }, timeStamp: { value: performance.now() }, repeat: { value: false } });
    window.dispatchEvent(event);
  };
  frame(80);
  key('keydown'); key('keyup');
  expect(rendered.frames).toHaveLength(renderedBeforeResume);
  expect(onScoreChanged).toHaveBeenCalledTimes(scoresBeforeResume);
  expect(Number(dataset.tutorialElapsedMs)).toBeCloseTo(480);
  frame(45);
  expect(Number(dataset.tutorialElapsedMs)).toBeCloseTo(500);
  expect(starts.slice(count)).toHaveLength(1);
  expect(starts[count] * 1000 + 80).toBeCloseTo(resumeNow + 125);
  key('keydown');
  frame(1);
  expect(onScoreChanged).toHaveBeenCalledWith(expect.objectContaining({
    judgmentCounts: expect.objectContaining({ perfect: 1 }),
  }), 1);
  metronome.dispose();
});

it.each([
  { offset: 100, countInRender: 1550, elapsed: 1450, renderTime: 1550, successIndex: 0, finished: 0 },
  { offset: -100, countInRender: 2850, elapsed: 1550, renderTime: 2950, successIndex: 2, finished: 1 },
])('visualOffsetMs=$offset이면 준비 중 V와 반복 경계 표시를 옮기되 $elapsed ms의 세션 판정은 J를 따른다', async ({ offset, countInRender, elapsed, renderTime, successIndex, finished }) => {
  const { TutorialMetronome } = await import('../../audio/TutorialMetronome');
  mockMetronomeAudio();
  const metronome = new TutorialMetronome();
  const frame = manualFrames();
  useGameStore.setState({ settings: { ...initialSettings, visualOffsetMs: offset } });
  const base = ALL_TUTORIAL_PREVIEWS[1];
  const preview = createExplicitTutorialPreview('offset-tap', '0ms 탭', [], 3, {
    ...base.chart, notes: [{ type: 'tap', kind: 'single', lane: 2, beat: beat(0) }],
    events: [base.chart.events[0], { type: 'tutorialInput', lane: 2, keyCode: 'KeyE', keyLabel: 'E',
      beat: beat(0), endBeat: beat(1), editorLane: 3 }],
  });
  const onPatternFinished = vi.fn();
  const { dataset } = renderMetronomePlayer({ preview, metronome, onPatternFinished });
  await vi.dynamicImportSettled();
  frame(200);
  frame(2055); // J=-50ms, V=50ms 또는 -150ms
  expect(rendered.frames.at(-1)?.timeMs).toBeCloseTo(countInRender);
  expect(rendered.frames.at(-1)?.snapshot?.items.every(item => item.state === 'pending')).toBe(true);
  expect(dataset.tutorialElapsedMs).toBe('0');
  expect(onPatternFinished).not.toHaveBeenCalled();
  frame(elapsed + 50);
  expect(rendered.frames.at(-1)?.timeMs).toBeCloseTo(renderTime);
  expect(rendered.frames.at(-1)?.snapshot?.items.filter(item => item.state === 'success')
    .map(item => item.sourceNoteIndex)).toEqual([successIndex]);
  expect(onPatternFinished).toHaveBeenCalledTimes(finished);
  expect(Number(dataset.tutorialElapsedMs)).toBeCloseTo(elapsed);
  metronome.dispose();
});

it.each([-100, 100])('무음 Lab에서 visualOffsetMs=%i여도 250ms를 1750ms에 표시하고 시연 Perfect는 현재 복사본에 둔다', async offset => {
  const frame = manualFrames();
  useGameStore.setState({ settings: { ...initialSettings, visualOffsetMs: offset } });
  renderMetronomePlayer({ preview: ALL_TUTORIAL_PREVIEWS[1] });
  await vi.dynamicImportSettled();
  frame(250);
  expect(rendered.frames.at(-1)?.timeMs).toBeCloseTo(1750);
  expect(rendered.frames.at(-1)?.snapshot?.items.filter(item => item.state === 'success')
    .map(item => item.sourceNoteIndex)).toEqual([3]);
});

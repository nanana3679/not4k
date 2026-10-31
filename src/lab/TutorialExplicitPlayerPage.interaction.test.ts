import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutorialPreviewPlayer } from '../game/screens/songSelect/TutorialPreviewPlayer';
import {
  createExplicitTutorialPreviewPlayback,
  createTutorialTimingsInputPlan,
  type ExplicitTutorialPatternResult,
} from '../game/screens/songSelect/explicitTutorialPreviewPlayback';
import { getTutorialInputTimings } from '../game/screens/songSelect/tutorialPreviewChart';
import TutorialExplicitPlayerPage from './TutorialExplicitPlayerPage';
import { tutorialExplicitPlayerPreviews } from './tutorialExplicitPlayerPreviews';

// DOM 없이 페이지의 선택·완료 콜백을 실행한다. 렌더러 자식은 마운트하지 않는다.
const harness = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) harness.slots[slot] = initial;
    return [harness.slots[slot], (value: unknown) => {
      harness.slots[slot] = typeof value === 'function' ? value(harness.slots[slot]) : value;
    }];
  },
}));

interface ElementProps {
  children?: ReactNode;
  onClick?: () => void;
  onChange?: () => void;
  inputMode?: 'demonstration' | 'directInput';
  onPatternStarted?: (iteration: number) => void;
  'data-started-patterns'?: number;
  onPatternFinished?: (pattern: ExplicitTutorialPatternResult) => void;
  'data-finished-patterns'?: number;
  'data-last-iteration'?: number | '';
  'data-last-perfect'?: number | '';
  'data-selected-preview'?: string;
}

function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function renderPage() {
  harness.cursor = 0;
  const tree = TutorialExplicitPlayerPage();
  const nodes = elements(tree);
  return {
    mode: nodes.find(node => node.type === TutorialPreviewPlayer)!.props.inputMode,
    start: nodes.find(node => node.type === TutorialPreviewPlayer)!.props.onPatternStarted!,
    toggle: () => nodes.find(node => node.type === 'input')!.props.onChange!(),
    selectedId: tree.props['data-selected-preview'],
    stats: nodes.find(node => node.type === 'dl')!.props,
    finish: nodes.find(node => node.type === TutorialPreviewPlayer)!.props.onPatternFinished!,
    click(label: string) {
      const button = nodes.find(node => node.type === 'button' && node.props.children === label);
      expect(button, `button ${label}`).toBeDefined();
      button!.props.onClick!();
    },
  };
}

beforeEach(() => { harness.cursor = 0; harness.slots = []; });

function finishTwoPatterns() {
  const page = renderPage();
  const { preview } = tutorialExplicitPlayerPreviews[0];
  const playback = createExplicitTutorialPreviewPlayback(
    preview, createTutorialTimingsInputPlan(getTutorialInputTimings(preview.chart)), {
      showJudgmentGroup() {}, recordFlightJudgment() {}, showBombEffect() {},
    },
  );
  page.finish(playback.finishPattern());
  page.finish(playback.finishPattern());
  playback.stop();
  return renderPage();
}

describe('명시 튜토리얼 Lab 시연 선택', () => {
  it('싱글 탭 2회 완료 후 선택된 싱글 탭을 다시 누르면 완료 2회·마지막 반복 1·Perfect 3을 유지', () => {
    const page = finishTwoPatterns();
    expect(page.stats).toMatchObject({
      'data-finished-patterns': 2, 'data-last-iteration': 1, 'data-last-perfect': 3,
    });

    page.click('싱글 탭 노트');

    const next = renderPage();
    expect(next.selectedId).toBe('tap');
    expect(next.stats).toMatchObject({
      'data-finished-patterns': 2, 'data-last-iteration': 1, 'data-last-perfect': 3,
    });
  });

  it('싱글 탭 2회 완료 후 바디·틱·릴리즈를 고르면 선택은 body-release로 바뀌고 완료 0회·마지막 결과 비움', () => {
    const page = finishTwoPatterns();

    page.click('바디·틱·릴리즈');

    const next = renderPage();
    expect(next.selectedId).toBe('body-release');
    expect(next.stats).toMatchObject({
      'data-finished-patterns': 0, 'data-last-iteration': '', 'data-last-perfect': '',
    });
  });
});


it('시연에서 직접 입력 스위치를 누르면 즉시 directInput prop을 전달하고 시작 2회·완료 1회는 모드 복귀에도 유지', () => {
  let page = renderPage();
  expect(page.mode).toBe('demonstration');
  page.start(0);
  page.toggle();
  page = renderPage();
  expect(page.mode).toBe('directInput');
  const { preview } = tutorialExplicitPlayerPreviews[0];
  const playback = createExplicitTutorialPreviewPlayback(preview, { kind: 'live' }, {
    showJudgmentGroup() {}, recordFlightJudgment() {}, showBombEffect() {},
  });
  page.finish(playback.finishPattern());
  page.start(1);
  page.toggle();
  page = renderPage();
  expect(page.mode).toBe('demonstration');
  expect(page.stats).toMatchObject({ 'data-started-patterns': 2, 'data-finished-patterns': 1, 'data-last-perfect': 0 });
  playback.stop();
});

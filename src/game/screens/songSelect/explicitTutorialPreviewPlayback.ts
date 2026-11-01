import type { TimedJudgmentInput } from "../../input/InputTimeline";
import type { ExplicitHeldKey } from "../../judgment/ExplicitJudgmentState";
import type { JudgmentWindows } from '../../../shared/constants';
import { JUDGMENT_WINDOWS } from '../../../shared/constants';
import type { ExplicitCompiledChart } from '../../judgment/explicitCompiledChart';
import { ExplicitJudgmentEffectSink } from '../../judgment/ExplicitJudgmentEffectSink';
import type { ExplicitJudgmentEffectPort } from '../../judgment/ExplicitJudgmentEffectSink';
import type { ExplicitJudgmentSession, ExplicitSessionResult } from '../../judgment/ExplicitJudgmentSession';
import type { ExplicitJudgmentSnapshot } from '../../judgment/ExplicitJudgmentState';
import type { ExplicitTutorialPreviewDefinition } from './explicitTutorialPreviewChart';
import { createExplicitTutorialPreviewSessionController } from './explicitTutorialPreviewSession';
import type { ExplicitTutorialInputPlan, ExplicitTutorialPreviewSessionController } from './explicitTutorialPreviewSession';
import { createExplicitTutorialRenderSnapshotQuery } from './explicitTutorialRenderSnapshot';
import { createExplicitTutorialRenderChart } from './explicitTutorialRenderChart';
import type { ExplicitRenderSnapshot } from '../../renderer/ExplicitNotePresenter';
import { TUTORIAL_PREVIEW_RENDER_CYCLES, type TutorialInputTiming } from './tutorialPreviewChart';
import type { ScoreState } from '../../scoring/ScoreManager';

export type TutorialInputMode = 'demonstration' | 'directInput';

/** 시연은 반복 경계, 직접 입력은 마지막 판정 기한까지 마친 패턴 한 차례의 정산 결과 */
export interface ExplicitTutorialPatternResult {
  /**
   * controller가 0부터 세는 반복 차수. 재생기를 다시 걸면 0부터 다시 센다.
   * 실습의 패턴 id로 그대로 쓰지 않고 실습 UI가 소유한 카운터와 대응시킨다.
   */
  readonly iteration: number;
  /** 물리 반복의 시작부터 경계까지 전환했는지 기록한다. 시작 뒤 일시정지·도식 대기도 포함하며 최초 준비는 제외한다. */
  readonly modeSwitchedDuringPattern: boolean;
  readonly result: ExplicitSessionResult;
}

/** 다음 물리 세션이 시작한 뒤에도 자기 입력·hold·결과를 소유하는 이전 패턴. */
export interface ExplicitTutorialClosingPattern {
  enqueue(input: TimedJudgmentInput): void;
  advanceTo(timeMs: number): void;
  syncHeldKeys(heldKeys: readonly ExplicitHeldKey[]): void;
  finish(): ExplicitTutorialPatternResult;
}

/** 튜토리얼 재생기 한 번 걸기 동안의 명시 판정. 렌더러·시계·키 표시는 재생기가 소유한다. */
export interface ExplicitTutorialPreviewPlayback {
  /** 원본 compile의 시각·참조를 옮긴 3벌 표시 데이터. 렌더러 표시 전용이며 판정에 쓰지 않는다. */
  readonly renderChart: ExplicitCompiledChart;
  /** 원본 판정 세션과 설정의 판정 창으로 계산한 마지막 기한. loopMs보다 클 수 있다. */
  readonly latestJudgmentDeadlineMs: number;
  /** 렌더러의 3벌 표시 상태. 화면 대비 세션 차수 차이(-1이면 이전 반복)를 적용하고 화면 밖의 종료 이력을 정리한다.
   * 차수 차이를 생략한 입력 진행용 조회는 이력을 정리하지 않는다.
   * countIn을 넘기는 메트로놈 경로는 시작 전의 가짜 반복을 숨기며, true면 첫 실제 반복만 표시한다. */
  renderSnapshot(activeRenderCycle: number, sessionIterationOffset?: number, countIn?: boolean): ExplicitRenderSnapshot;
  /** 이번 반복의 loopTimeMs까지 입력·판정·효과를 진행한다. 더 이른 시각이면 controller가 새 반복으로 되돌린다. */
  advanceTo(loopTimeMs: number): void;
  setInputMode(mode: TutorialInputMode, heldKeys?: readonly ExplicitHeldKey[]): void;
  enqueue(input: TimedJudgmentInput): void;
  syncHeldKeys(heldKeys: readonly ExplicitHeldKey[]): void;
  /** 이전 세션은 정산하지 않고 보존한다. 반환한 이전 패턴은 판정 기한에 finish해야 한다. */
  startNextPattern(preheldKeys: readonly ExplicitHeldKey[], nextIteration?: number, modeSwitchedDuringPattern?: boolean): ExplicitTutorialClosingPattern;
  /** 시연 또는 판정 기한이 경계 안인 반복을 finalize하고 다음 세션을 준비한다. */
  finishPattern(preheldKeys?: readonly ExplicitHeldKey[], nextIteration?: number, modeSwitchedDuringPattern?: boolean): ExplicitTutorialPatternResult;
  /** 도식 OK가 시계의 현재 반복을 0으로 옮길 때 표시 이력의 상대 위치도 보존한다. */
  rebaseIteration(): void;
  /** 세션·효과 연결을 정리한다. 멈춘 재생은 다시 진행하지 않는다. */
  stop(): void;
}

export interface ExplicitTutorialPreviewPlaybackOptions {
  /** 호출자가 판정 창을 지정한다. 팝업·Lab 재생기는 설정의 judgmentMode를 전달하고, 생략한 독립 호출은 Normal을 쓴다. */
  readonly windows?: JudgmentWindows;
  /** 세션 준비와 확정 효과가 생긴 때만 알린다. 프레임별 점수 복사·React 갱신을 하지 않는다. */
  readonly onScoreChanged?: (score: Readonly<ScoreState>, combo: number) => void;
}

/** 재생기가 현재 바인딩으로 옮긴 `tutorialInput` 구간을 명시 controller의 시연 입력 계획으로 바꾼다. */
export function createTutorialTimingsInputPlan(timings: readonly TutorialInputTiming[]): ExplicitTutorialInputPlan {
  return {
    kind: 'timings',
    timings: timings.map(({ event, startMs, endMs }) => ({ lane: event.lane, key: event.keyCode, startMs, endMs })),
  };
}

/**
 * 명시 튜토리얼 정의를 재생기 반복에 연결한다. 판정은 `createExplicitTutorialPreviewSessionController`가, 확정 효과는
 * `ExplicitJudgmentEffectSink`가 port로 보낸다. 입력은 `plan`으로 받아 시연 계획과 이후 직접 입력을 같은 자리에서 바꿔 끼운다.
 */
export function createExplicitTutorialPreviewPlayback(
  preview: ExplicitTutorialPreviewDefinition,
  plan: ExplicitTutorialInputPlan,
  effects: ExplicitJudgmentEffectPort,
  options: ExplicitTutorialPreviewPlaybackOptions = {},
): ExplicitTutorialPreviewPlayback {
  let reportedSession: ExplicitJudgmentSession;
  // reducer는 이전 패턴의 finish 뒤에 다음 start를 받는다. 그동안 HUD도 이전 점수를 유지한다.
  let preparingNextPattern = false;
  let publishCurrentScore = false;
  let previous: ExplicitTutorialPreviewSessionController | null = null;
  // 결과 통지의 controller.iteration과 달리 건너뛴 반복·도식 OK의 시계 재기준화를 반영한다.
  let timelineIteration = 0;
  let firstTimelineIteration = 0;
  let previousIteration: number | null = null;
  const finishedSnapshotByIteration = new Map<number, ExplicitJudgmentSnapshot>();
  let controller = createExplicitTutorialPreviewSessionController(preview.chart, plan, {
    windows: options.windows ?? JUDGMENT_WINDOWS,
    // 반복마다 새 sink를 만들어 이전 반복의 효과가 다음 반복에 붙지 않게 한다. 렌더러는 snapshot 조회로 따로 그린다.
    createPresentation: session => {
      const sink = new ExplicitJudgmentEffectSink(effects);
      if (!preparingNextPattern) {
        reportedSession = session;
        options.onScoreChanged?.(session.score, session.combo);
      }
      return {
        applyConfirmedEffects: confirmed => {
          sink.applyConfirmedEffects(confirmed);
          if (confirmed.length && session === reportedSession) options.onScoreChanged?.(session.score, session.combo);
        },
        dispose() {},
      };
    },
  });
  // controller가 한 번 compile한 원본을 재사용한다. 표시용 3벌 문서는 하나의 판정 차트로 검증하지 않는다.
  const renderChart = createExplicitTutorialRenderChart(controller.session.playbackChart, preview);
  // 아직 아무 입력도 진행하지 않은 첫 세션의 상태가 앞뒤 반복 복사본의 판정 전 상태다.
  const composeRenderSnapshot = createExplicitTutorialRenderSnapshotQuery(
    renderChart, preview.chart.notes.length, preview.loopMs, controller.session.snapshot);

  return {
    renderChart,
    get latestJudgmentDeadlineMs() { return controller.session.latestJudgmentDeadlineMs; },
    renderSnapshot: (activeRenderCycle, sessionIterationOffset, countIn) => {
      const sessionCycle = activeRenderCycle + (sessionIterationOffset ?? 0);
      const retainedByCycle = new Map<number, ExplicitJudgmentSnapshot>();
      for (const [iteration, snapshot] of finishedSnapshotByIteration) {
        const cycle = sessionCycle + iteration - timelineIteration;
        // 실제 화면 조회만 표시 수명을 정리한다. 입력 진행용 renderSnapshot(0)은 정리하지 않는다.
        if (cycle < 0 && sessionIterationOffset !== undefined) finishedSnapshotByIteration.delete(iteration);
        if (cycle >= 0 && cycle < TUTORIAL_PREVIEW_RENDER_CYCLES) retainedByCycle.set(cycle, snapshot);
      }
      if (previous && previousIteration !== null) {
        retainedByCycle.set(sessionCycle + previousIteration - timelineIteration, previous.session.snapshot);
      }
      const snapshot = composeRenderSnapshot(controller.session.snapshot, activeRenderCycle, sessionIterationOffset,
        retainedByCycle);
      if (countIn === undefined) return snapshot;
      const hiddenSourceNoteIndices = new Set<number>();
      for (let cycle = 0; cycle < TUTORIAL_PREVIEW_RENDER_CYCLES; cycle++) {
        const iteration = timelineIteration + cycle - sessionCycle;
        if (iteration >= firstTimelineIteration && (!countIn || iteration === firstTimelineIteration)) continue;
        for (let index = 0; index < preview.chart.notes.length; index++) {
          hiddenSourceNoteIndices.add(cycle * preview.chart.notes.length + index);
        }
      }
      return { ...snapshot, hiddenSourceNoteIndices };
    },
    advanceTo: loopTimeMs => {
      controller.advanceTo(loopTimeMs);
      if (publishCurrentScore) {
        publishCurrentScore = false;
        reportedSession = controller.session;
        options.onScoreChanged?.(reportedSession.score, reportedSession.combo);
      }
    },
    setInputMode: (mode, heldKeys = []) => controller.setInputPlan(
      mode === "directInput" ? { kind: "live" } : plan, mode === "directInput" ? heldKeys : undefined),
    enqueue: input => controller.enqueue(input),
    syncHeldKeys: heldKeys => controller.syncHeldKeys(heldKeys),
    startNextPattern: (preheldKeys, nextIteration = timelineIteration + 1, modeSwitchedDuringPattern = false) => {
      const closing = controller;
      previous = closing;
      previousIteration = timelineIteration;
      timelineIteration = nextIteration;
      preparingNextPattern = true;
      controller = closing.startNextPattern(preheldKeys);
      preparingNextPattern = false;
      return {
        enqueue: input => closing.enqueue(input),
        advanceTo: timeMs => closing.advanceTo(Math.max(closing.session.snapshot.atMs, timeMs)),
        syncHeldKeys: heldKeys => closing.syncHeldKeys(heldKeys),
        finish: () => {
          const result = closing.finish(Math.max(closing.session.snapshot.atMs, closing.session.latestJudgmentDeadlineMs));
          finishedSnapshotByIteration.set(previousIteration!, closing.session.snapshot);
          closing.dispose();
          previous = null;
          previousIteration = null;
          publishCurrentScore = true;
          return { iteration: closing.iteration, modeSwitchedDuringPattern, result };
        },
      };
    },
    finishPattern: (preheldKeys, nextIteration = timelineIteration + 1, modeSwitchedDuringPattern = false) => {
      const iteration = controller.iteration;
      const result = controller.finish(preview.loopMs);
      finishedSnapshotByIteration.set(timelineIteration, controller.session.snapshot);
      timelineIteration = nextIteration;
      const closing = controller;
      controller = closing.startNextPattern(preheldKeys ?? []);
      closing.dispose();
      return { iteration, modeSwitchedDuringPattern, result };
    },
    rebaseIteration: () => {
      const snapshots = [...finishedSnapshotByIteration];
      finishedSnapshotByIteration.clear();
      for (const [iteration, snapshot] of snapshots) finishedSnapshotByIteration.set(iteration - timelineIteration, snapshot);
      if (previousIteration !== null) previousIteration -= timelineIteration;
      firstTimelineIteration -= timelineIteration;
      timelineIteration = 0;
    },
    stop: () => { previous?.dispose(); controller.dispose(); finishedSnapshotByIteration.clear(); },
  };
}

import type { JudgmentWindows } from '../../../shared/constants';
import { JUDGMENT_WINDOWS } from '../../../shared/constants';
import type { ExplicitCompiledChart } from '../../judgment/explicitCompiledChart';
import { ExplicitJudgmentEffectSink } from '../../judgment/ExplicitJudgmentEffectSink';
import type { ExplicitJudgmentEffectPort } from '../../judgment/ExplicitJudgmentEffectSink';
import type { ExplicitSessionResult } from '../../judgment/ExplicitJudgmentSession';
import type { ExplicitJudgmentSnapshot } from '../../judgment/ExplicitJudgmentState';
import type { ExplicitTutorialPreviewDefinition } from './explicitTutorialPreviewChart';
import { createExplicitTutorialPreviewSessionController } from './explicitTutorialPreviewSession';
import type { ExplicitTutorialInputPlan } from './explicitTutorialPreviewSession';
import { createExplicitTutorialRenderSnapshotQuery } from './explicitTutorialRenderSnapshot';
import { createExplicitTutorialRenderChart } from './explicitTutorialRenderChart';
import type { TutorialInputTiming } from './tutorialPreviewChart';

/** 반복 경계에서 끝난 패턴 한 차례를 controller가 정산한 결과 */
export interface ExplicitTutorialPatternResult {
  /**
   * controller가 0부터 세는 반복 차수. 재생기를 다시 걸면 0부터 다시 센다.
   * 실습의 패턴 id로 그대로 쓰지 않고 실습 UI가 소유한 카운터와 대응시킨다.
   */
  readonly iteration: number;
  readonly result: ExplicitSessionResult;
}

/** 튜토리얼 재생기 한 번 걸기 동안의 명시 판정. 렌더러·시계·키 표시는 재생기가 소유한다. */
export interface ExplicitTutorialPreviewPlayback {
  /** 원본 compile의 시각·참조를 옮긴 3벌 표시 데이터. 렌더러 표시 전용이며 판정에 쓰지 않는다. */
  readonly renderChart: ExplicitCompiledChart;
  /** 렌더러가 프레임마다 읽는 3벌 표시 상태. 활성 복사본만 현재 반복의 판정 상태다. */
  renderSnapshot(activeRenderCycle: number): ExplicitJudgmentSnapshot;
  /** 이번 반복의 loopTimeMs까지 입력·판정·효과를 진행한다. 더 이른 시각이면 controller가 새 반복으로 되돌린다. */
  advanceTo(loopTimeMs: number): void;
  /** 끝난 반복을 loopMs까지 진행·finalize하고 다음 반복의 새 세션을 준비한다. 경계 입력·정산 효과는 끝난 반복에 속한다. */
  finishPattern(): ExplicitTutorialPatternResult;
  /** 세션·효과 연결을 정리한다. 멈춘 재생은 다시 진행하지 않는다. */
  stop(): void;
}

export interface ExplicitTutorialPreviewPlaybackOptions {
  /** 생략하면 구형 재생기와 같은 고정 `JUDGMENT_WINDOWS`. 설정의 판정 모드는 따르지 않는다. */
  readonly windows?: JudgmentWindows;
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
  const controller = createExplicitTutorialPreviewSessionController(preview.chart, plan, {
    windows: options.windows ?? JUDGMENT_WINDOWS,
    // 반복마다 새 sink를 만들어 이전 반복의 효과가 다음 반복에 붙지 않게 한다. 렌더러는 snapshot 조회로 따로 그린다.
    createPresentation: () => {
      const sink = new ExplicitJudgmentEffectSink(effects);
      return { applyConfirmedEffects: confirmed => sink.applyConfirmedEffects(confirmed), dispose() {} };
    },
  });
  // controller가 한 번 compile한 원본을 재사용한다. 표시용 3벌 문서는 하나의 판정 차트로 검증하지 않는다.
  const renderChart = createExplicitTutorialRenderChart(controller.session.playbackChart, preview);
  // 아직 아무 입력도 진행하지 않은 첫 세션의 상태가 앞뒤 반복 복사본의 판정 전 상태다.
  const composeRenderSnapshot = createExplicitTutorialRenderSnapshotQuery(
    renderChart, preview.chart.notes.length, preview.loopMs, controller.session.snapshot);

  return {
    renderChart,
    renderSnapshot: activeRenderCycle => composeRenderSnapshot(controller.session.snapshot, activeRenderCycle),
    advanceTo: loopTimeMs => controller.advanceTo(loopTimeMs),
    finishPattern: () => {
      const iteration = controller.iteration;
      return { iteration, result: controller.repeat(preview.loopMs) };
    },
    stop: () => controller.dispose(),
  };
}

import type { ChartDocument } from "../../../shared/types/chart";
import { ExplicitAutoPlayer } from "../../input/ExplicitAutoPlayer";
import type { ExplicitAutoInput, ExplicitAutoPlayerOptions } from "../../input/ExplicitAutoPlayer";
import { InputTimeline } from "../../input/InputTimeline";
import { compileExplicitJudgmentChart } from "../../judgment/explicitCompiledChart";
import { ExplicitJudgmentSession } from "../../judgment/ExplicitJudgmentSession";
import type { ExplicitSessionResult } from "../../judgment/ExplicitJudgmentSession";
import type { ExplicitJudgmentCoreOptions } from "../../judgment/ExplicitJudgmentCore";
import { ExplicitSessionRendererAdapter } from "../../judgment/ExplicitSessionRendererAdapter";
import type { ExplicitConfirmedEffectSink, ExplicitSnapshotRendererPort } from "../../judgment/ExplicitSessionRendererAdapter";
import { drainExplicitPlaySessionInputs } from "../explicitPlaySessionInput";

export interface ExplicitTutorialInputTiming {
  readonly lane: number;
  readonly key: string;
  readonly startMs: number;
  readonly endMs: number;
}

export type ExplicitTutorialInputPlan =
  | { readonly kind: "timings"; readonly timings: readonly ExplicitTutorialInputTiming[] }
  | { readonly kind: "events"; readonly events: readonly ExplicitAutoInput[] }
  | { readonly kind: "auto"; readonly options?: ExplicitAutoPlayerOptions };

/** 반복마다 factory가 새 표시 인스턴스를 만든다. effects는 원본 배열을 그대로 받는다. */
export interface ExplicitTutorialPresentation extends ExplicitConfirmedEffectSink {
  readonly renderer?: ExplicitSnapshotRendererPort;
  dispose(): void;
}

export interface ExplicitTutorialPreviewOptions extends ExplicitJudgmentCoreOptions {
  readonly createPresentation?: (session: ExplicitJudgmentSession, iteration: number) => ExplicitTutorialPresentation;
}

export interface ExplicitTutorialPreviewSessionController {
  readonly session: ExplicitJudgmentSession;
  readonly iteration: number;
  advanceTo(timeMs: number, visualTimeMs?: number): void;
  attachRenderer(renderer: ExplicitSnapshotRendererPort | null, visualTimeMs?: number): void;
  reset(): void;
  /** 경계 입력·정산·효과는 이전 세션에서 마친 뒤 다음 반복을 만든다. */
  repeat(endTimeMs: number): ExplicitSessionResult;
  dispose(): void;
}

/** 명시 문서만 compile하며 구형 튜토리얼 데이터나 노트를 변환하지 않는다. */
export function createExplicitTutorialPreviewSessionController(
  chart: ChartDocument,
  plan: ExplicitTutorialInputPlan = { kind: "auto" },
  options: ExplicitTutorialPreviewOptions = {},
): ExplicitTutorialPreviewSessionController {
  const compiled = compileExplicitJudgmentChart(chart);
  // 외부 배열 수정이나 이전 AutoPlayer cursor를 다음 반복에 들고 가지 않는다.
  const events: readonly ExplicitAutoInput[] = (plan.kind === "auto"
    ? new ExplicitAutoPlayer(compiled, plan.options).eventsThrough(Infinity)
    : plan.kind === "events" ? plan.events
      : plan.timings.flatMap(timing => {
        if (timing.endMs < timing.startMs) throw new RangeError("튜토리얼 입력의 끝이 시작보다 이릅니다");
        return [{ lane: timing.lane, key: timing.key, timeMs: timing.startMs, type: "down" as const },
          { lane: timing.lane, key: timing.key, timeMs: timing.endMs, type: "up" as const }];
      }))
    .map(event => Object.freeze({ ...event })).sort((a, b) => a.timeMs - b.timeMs);
  if (events.some(event => !Number.isFinite(event.timeMs))) throw new RangeError("튜토리얼 입력 시각은 유한해야 합니다");
  let current: ExplicitJudgmentSession;
  let timeline: InputTimeline;
  let adapter: ExplicitSessionRendererAdapter;
  let presentation: ExplicitTutorialPresentation | undefined;
  let iteration = 0;
  let time = -Infinity;
  let disposed = false;
  const assertOpen = () => { if (disposed) throw new Error("dispose된 명시 튜토리얼 세션입니다"); };
  const replace = () => {
    current = new ExplicitJudgmentSession(compiled, options);
    timeline = new InputTimeline();
    timeline.enqueueMany(events.map(event => ({ lane: event.lane, key: event.key, type: event.type, inputAt: event.timeMs })));
    presentation = options.createPresentation?.(current, iteration);
    adapter = new ExplicitSessionRendererAdapter(current, presentation ?? { applyConfirmedEffects() {} });
    adapter.attach(presentation?.renderer ?? null, 0);
    time = -Infinity;
  };
  const release = () => {
    timeline.clear();
    adapter.dispose();
    presentation?.dispose();
    presentation = undefined;
  };
  replace();
  const controller: ExplicitTutorialPreviewSessionController = {
    get session() { return current; },
    get iteration() { return iteration; },
    advanceTo(timeMs, visualTimeMs = timeMs) {
      assertOpen();
      if (!Number.isFinite(timeMs) || !Number.isFinite(visualTimeMs)) throw new RangeError("튜토리얼 재생 시각은 유한해야 합니다");
      const target = Math.max(0, timeMs);
      if (target < time) controller.reset();
      drainExplicitPlaySessionInputs(timeline, current, target);
      current.advance(target);
      adapter.sync(visualTimeMs);
      time = target;
    },
    attachRenderer(renderer, visualTimeMs = Math.max(0, time)) {
      assertOpen();
      adapter.attach(renderer, visualTimeMs);
    },
    reset() {
      assertOpen();
      release();
      iteration++;
      replace();
    },
    repeat(endTimeMs) {
      assertOpen();
      controller.advanceTo(endTimeMs);
      const result = current.finalize();
      adapter.sync(endTimeMs);
      controller.reset();
      return result;
    },
    dispose() {
      if (disposed) return;
      release();
      disposed = true;
    },
  };
  return controller;
}

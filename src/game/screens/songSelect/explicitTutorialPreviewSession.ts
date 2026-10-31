import type { ChartDocument } from "../../../shared/types/chart";
import { ExplicitAutoPlayer } from "../../input/ExplicitAutoPlayer";
import type { ExplicitAutoInput, ExplicitAutoPlayerOptions } from "../../input/ExplicitAutoPlayer";
import type { TimedJudgmentInput } from "../../input/InputTimeline";
import { InputTimeline } from "../../input/InputTimeline";
import { compileExplicitJudgmentChart } from "../../judgment/explicitCompiledChart";
import type { ExplicitCompiledChart } from "../../judgment/explicitCompiledChart";
import { ExplicitJudgmentSession } from "../../judgment/ExplicitJudgmentSession";
import type { ExplicitHeldKey } from "../../judgment/ExplicitJudgmentState";
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
  | { readonly kind: "live" }
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
  /** 현재 위치 이전의 계획을 버리고 hold를 무점수 동기화한다. 되감기 없이 현재 시각부터 새 계획을 쓴다. */
  setInputPlan(plan: ExplicitTutorialInputPlan, heldKeys?: readonly ExplicitHeldKey[]): void;
  /** 멈춘 동안의 물리 hold 변화는 점수 입력을 만들지 않고 현재 판정 시각에서 맞춘다. */
  syncHeldKeys(heldKeys: readonly ExplicitHeldKey[]): void;
  /** live 계획에서만 받는다. inputAt은 이미 현재 반복의 시각으로 환산한 값이다. */
  enqueue(input: TimedJudgmentInput): void;
  advanceTo(timeMs: number, visualTimeMs?: number): void;
  attachRenderer(renderer: ExplicitSnapshotRendererPort | null, visualTimeMs?: number): void;
  reset(): void;
  /** 원본 compile을 공유하는 다음 세션을 만든다. 현재 세션은 자기 판정 기한까지 별도로 유지한다. */
  startNextPattern(preheldKeys: readonly ExplicitHeldKey[]): ExplicitTutorialPreviewSessionController;
  finish(endTimeMs: number): ExplicitSessionResult;
  /** 경계 입력·정산·효과는 이전 세션에서 마친 뒤 다음 반복을 만든다. */
  repeat(endTimeMs: number, preheldKeys?: readonly ExplicitHeldKey[]): ExplicitSessionResult;
  dispose(): void;
}

/** 명시 문서만 compile하며 구형 튜토리얼 데이터나 노트를 변환하지 않는다. */
export function createExplicitTutorialPreviewSessionController(
  chart: ChartDocument,
  plan: ExplicitTutorialInputPlan = { kind: "auto" },
  options: ExplicitTutorialPreviewOptions = {},
): ExplicitTutorialPreviewSessionController {
  const compiled = compileExplicitJudgmentChart(chart);
  return createController(compiled, plan, options);
}

function createController(
  compiled: ExplicitCompiledChart,
  plan: ExplicitTutorialInputPlan,
  options: ExplicitTutorialPreviewOptions,
  initialIteration = 0,
  preheldKeys?: readonly ExplicitHeldKey[],
): ExplicitTutorialPreviewSessionController {
  // 외부 배열 수정이나 이전 AutoPlayer cursor를 다음 반복에 들고 가지 않는다.
  const createEvents = (plan: ExplicitTutorialInputPlan): readonly ExplicitAutoInput[] => (plan.kind === "auto"
    ? new ExplicitAutoPlayer(compiled, plan.options).eventsThrough(Infinity)
    : plan.kind === "live" ? [] : plan.kind === "events" ? plan.events
      : plan.timings.flatMap(timing => {
        if (timing.endMs < timing.startMs) throw new RangeError("튜토리얼 입력의 끝이 시작보다 이릅니다");
        return [{ lane: timing.lane, key: timing.key, timeMs: timing.startMs, type: "down" as const },
          { lane: timing.lane, key: timing.key, timeMs: timing.endMs, type: "up" as const }];
      }))
    .map(event => Object.freeze({ ...event })).sort((a, b) => a.timeMs - b.timeMs);
  let events = createEvents(plan);
  if (events.some(event => !Number.isFinite(event.timeMs))) throw new RangeError("튜토리얼 입력 시각은 유한해야 합니다");
  let current: ExplicitJudgmentSession;
  let timeline: InputTimeline;
  let adapter: ExplicitSessionRendererAdapter;
  let presentation: ExplicitTutorialPresentation | undefined;
  let iteration = initialIteration;
  let time = -Infinity;
  let disposed = false;
  const assertOpen = () => { if (disposed) throw new Error("dispose된 명시 튜토리얼 세션입니다"); };
  const replace = (preheldKeys?: readonly ExplicitHeldKey[]) => {
    current = new ExplicitJudgmentSession(compiled, preheldKeys
      ? { ...options, startTimeMs: 0, preheldKeys } : options);
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
  replace(preheldKeys);
  const controller: ExplicitTutorialPreviewSessionController = {
    get session() { return current; },
    get iteration() { return iteration; },
    setInputPlan(nextPlan, heldKeys = []) {
      assertOpen();
      const nextEvents = createEvents(nextPlan);
      if (nextEvents.some(event => !Number.isFinite(event.timeMs))) throw new RangeError("튜토리얼 입력 시각은 유한해야 합니다");
      timeline.clear();
      plan = nextPlan;
      events = nextEvents;
      controller.syncHeldKeys(heldKeys);
      timeline.enqueueMany(events.filter(event => event.timeMs >= time).map(event => ({
        lane: event.lane, key: event.key, type: event.type, inputAt: event.timeMs,
      })));
    },
    syncHeldKeys(heldKeys) {
      assertOpen();
      if (time === -Infinity) { current.advance(0); time = 0; }
      current.syncHeldKeys(current.snapshot.atMs, heldKeys);
      adapter.sync(time);
    },
    enqueue(input) {
      assertOpen();
      if (plan.kind === "live") timeline.enqueue(input);
    },
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
    startNextPattern(heldKeys) {
      assertOpen();
      return createController(compiled, plan, options, iteration + 1, heldKeys);
    },
    finish(endTimeMs) {
      assertOpen();
      controller.advanceTo(endTimeMs);
      const result = current.finalize();
      adapter.sync(endTimeMs);
      return result;
    },
    repeat(endTimeMs, preheldKeys) {
      const result = controller.finish(endTimeMs);
      release();
      iteration++;
      replace(preheldKeys);
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

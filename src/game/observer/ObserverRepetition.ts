import { JUDGMENT_WINDOWS } from "../../shared/constants/judgment";
import type { JudgmentWindows } from "../../shared/constants/judgment";
import { ExplicitAutoPlayer } from "../input/ExplicitAutoPlayer";
import type { ExplicitAutoInput } from "../input/ExplicitAutoPlayer";
import type { KeyBinding } from "../input/InputSystem";
import { InputTimeline } from "../input/InputTimeline";
import type { ExplicitCompiledChart } from "../judgment/explicitCompiledChart";
import { selectExplicitRangePlaybackChart } from "../judgment/explicitPlaybackChart";
import { ExplicitJudgmentSession } from "../judgment/ExplicitJudgmentSession";
import type { ExplicitHeldKey, ExplicitJudgmentEffect } from "../judgment/ExplicitJudgmentState";
import type { ExplicitConfirmedEffectSink } from "../judgment/ExplicitSessionRendererAdapter";
import { drainExplicitPlaySessionInputs } from "../screens/explicitPlaySessionInput";
import type { createExplicitPlayInput } from "../screens/explicitPlaySessionInput";
import type { GameClock } from "../time/GameClock";
import { ObserverManualTally } from "./ObserverManualTally";
import type { ObserverManualStats } from "./ObserverManualTally";
import { planObserverFadedSpan } from "./observerRepetitionPlan";
import type { ObserverFadedSpan, ObserverRange } from "./observerRepetitionPlan";

export interface ObserverRepetitionOptions {
  readonly range: ObserverRange;
  readonly audioDurationMs: number;
  /** 앞뒤 페이드의 곡 시간 길이만 정한다. 판정 시각은 곡 시간이다. */
  readonly playbackRate: number;
  /** 출력 지연·음수 입력 오프셋을 수용하는 판정 시작점. 기본값은 fromMs이며 이보다 늦출 수 없다. 선택 차트 범위는 그대로다. */
  readonly sessionStartTimeMs?: number;
  /** 이 반복을 Auto로 시작하는지. */
  readonly auto: boolean;
  /** 앞 준비 구간 시작에 사람이 이미 누르고 있는 키. 수동으로 시작할 때만 preheld로 넘긴다. */
  readonly humanHeldKeys: readonly ExplicitHeldKey[];
  readonly windows?: JudgmentWindows;
  readonly maintenanceGraceMs?: number;
  /** Auto 입력 계획의 레인별 키. 생략하면 ExplicitAutoPlayer 기본 바인딩. */
  readonly bindings?: readonly KeyBinding[];
}

const NO_AUTO_INPUTS: readonly ExplicitAutoInput[] = Object.freeze([]);

/**
 * 옵저버 구간 반복 1회. 반복·Retry·구간 변경은 시간이 되돌아가므로 매번 새 인스턴스(새 세션·새 수동 집계)로 시작한다.
 * 한 반복 안의 Auto 전환은 같은 판정 세션을 이어 쓰고 수동 집계만 끊는다(RFD 0062·0075).
 */
export class ObserverRepetition implements ExplicitConfirmedEffectSink {
  readonly range: ObserverRange;
  /** `AudioEngine.playFadedSpan`에 넘길 음원 재생 범위. 판정 시작점은 출력 지연만큼 더 이를 수 있다. */
  readonly fadedSpan: ObserverFadedSpan;
  /** 선택 구간 밖 점수 항목을 빼고 경계에 걸친 바디를 자른 재생 범위(RFD 0063). */
  readonly playbackChart: ExplicitCompiledChart;
  readonly session: ExplicitJudgmentSession;
  /** 런타임의 `ExplicitAutoInputSource`. Auto가 꺼져 있으면 아무 입력도 내지 않는다. */
  readonly autoInputSource: Pick<ExplicitAutoPlayer, "eventsThrough">;
  private autoPlayer: ExplicitAutoPlayer;
  private readonly bindings: readonly KeyBinding[] | undefined;
  private readonly manualTally: ObserverManualTally;
  private manualStartSequence = 0;
  private autoOn: boolean;
  private readonly autoHeldByKey = new Map<string, ExplicitHeldKey>();

  constructor(compiled: ExplicitCompiledChart, options: ObserverRepetitionOptions) {
    this.range = Object.freeze({ startMs: options.range.startMs, endMs: options.range.endMs });
    this.fadedSpan = planObserverFadedSpan(this.range, options.audioDurationMs, options.playbackRate);
    const sessionStartTimeMs = options.sessionStartTimeMs ?? this.fadedSpan.fromMs;
    if (!Number.isFinite(sessionStartTimeMs) || sessionStartTimeMs > this.fadedSpan.fromMs) {
      throw new RangeError("판정 시작 시각은 음원 재생 시작 이하의 유한한 값이어야 합니다");
    }
    this.playbackChart = selectExplicitRangePlaybackChart(compiled, this.range.startMs, this.range.endMs);
    const windows = options.windows ?? JUDGMENT_WINDOWS;
    this.autoOn = options.auto;
    this.bindings = options.bindings;
    this.session = new ExplicitJudgmentSession(this.playbackChart, {
      windows, startTimeMs: sessionStartTimeMs,
      ...(options.maintenanceGraceMs === undefined ? {} : { maintenanceGraceMs: options.maintenanceGraceMs }),
      preheldKeys: options.auto ? [] : options.humanHeldKeys,
    });
    // 구간 전체를 Auto로 계획해 두고 Auto가 켜진 동안만 꺼내 쓴다. 꺼진 동안의 입력은 다시 켤 때 건너뛴다.
    this.autoPlayer = new ExplicitAutoPlayer(this.playbackChart, options.bindings ? { bindings: options.bindings } : {});
    this.autoInputSource = Object.freeze({
      eventsThrough: (timeMs: number) => {
        if (!this.autoOn) return NO_AUTO_INPUTS;
        const events = this.autoPlayer.eventsThrough(timeMs);
        for (const event of events) {
          if (event.type === "down") this.autoHeldByKey.set(event.key, Object.freeze({ lane: event.lane, key: event.key }));
          else this.autoHeldByKey.delete(event.key);
        }
        return events;
      },
    });
    this.manualTally = new ObserverManualTally(this.playbackChart, windows);
    if (!options.auto) this.manualTally.start(sessionStartTimeMs);
  }

  get autoEnabled(): boolean { return this.autoOn; }
  /** 프레임 입력과 setAuto 내부의 hold 인계를 모두 반영한 현재 Auto 키. 수동 중에는 빈 배열이다. */
  get autoHeldKeys(): readonly ExplicitHeldKey[] { return Object.freeze([...this.autoHeldByKey.values()]); }
  /** 런타임이 실제 키 입력을 판정 입력 큐에 넣어야 하는지. Auto 중에는 넣지 않는다. */
  get judgesHumanInput(): boolean { return !this.autoOn; }
  /** 수동 콤보·달성률. Auto 중에는 숨기므로 null이다. */
  get manualStats(): ObserverManualStats | null { return this.manualTally.stats; }

  /**
   * 같은 세션에서 입력 주체를 즉시 바꾼다. 같은 모드면 아무것도 하지 않는다.
   * 1. 이전 주체의 경계 전 입력을 drain한다. 사람 큐는 보정 입력 시각, Auto는 프레임과 같은 advance 시각을 경계로 쓴다.
   *    경계와 같은 시각부터는 새 주체의 입력이다. 이전 사람 큐의 나머지는 버리고 새 Auto의 경계 입력은 남긴다.
   * 2. core를 진행하고 효과 순번을 저장한다. 곡 관측 시각은 core와 별도로 넘겨 입력 오프셋을 보존한다.
   * 3. hold를 새 주체로 교체하고 수동 집계를 끊는다. Auto는 활성 바디를 즉시 이어받고 수동은 새 시작 창 없이 일반 유지 규칙을 따른다.
   * 4. 마지막으로 사람 입력 수집을 전환한다. setJudging(false)가 큐를 지우므로 drain보다 먼저 호출하지 않는다.
   * hold 교체는 탭·릴리즈 입력이 아니며 효과는 소비하지 않는다. 런타임은 평소처럼 한 번만 drain해 모든 sink에 전달한다.
   */
  setAuto(enabled: boolean, input: Pick<ReturnType<typeof createExplicitPlayInput>, "timeline" | "heldKeys" | "setJudging">,
    clock: GameClock, eventTimestamp: number): void {
    if (enabled === this.autoOn) return;
    const songTimeMs = clock.judgmentTimeMs();
    const inputAtMs = clock.toInputTimeMs(eventTimestamp);
    const advanceAtMs = Math.min(songTimeMs, inputAtMs);
    if (!Number.isFinite(inputAtMs)) throw new RangeError("Auto 전환 입력 시각은 유한해야 합니다");
    // 큐·Auto 커서를 움직이기 전에 곡 관측 시각을 검증한다. 현재 core 시각에서는 새 기한을 넘지 않는다.
    this.session.advance(this.session.snapshot.atMs, songTimeMs);
    const outgoing = new InputTimeline();
    if (this.autoOn) {
      outgoing.enqueueMany(this.autoPlayer.eventsBefore(advanceAtMs)
        .map(event => ({ ...event, inputAt: event.timeMs })));
      input.timeline.clear();
    } else {
      input.timeline.flushThrough(Infinity, (rawAtMs, inputs) => {
        if (rawAtMs < inputAtMs) outgoing.enqueueMany(inputs.map(event => ({ ...event, inputAt: rawAtMs })));
      });
    }
    drainExplicitPlaySessionInputs(outgoing, this.session, Infinity, songTimeMs);
    const coreAtMs = Math.max(advanceAtMs, this.session.snapshot.atMs);
    this.session.advance(coreAtMs, songTimeMs);
    if (enabled) {
      this.autoPlayer = this.planRemainingAutoInputs();
      this.autoPlayer.eventsBefore(advanceAtMs);
      const heldKeys = this.autoPlayer.restoreCursor(this.autoPlayer.processedEventCount);
      this.autoHeldByKey.clear();
      for (const key of heldKeys) this.autoHeldByKey.set(key.key, Object.freeze({ ...key }));
      this.session.syncHeldKeys(coreAtMs, heldKeys, songTimeMs);
      this.manualTally.stop();
    } else {
      this.autoHeldByKey.clear();
      this.manualStartSequence = this.session.effects.length;
      this.session.syncHeldKeys(coreAtMs, input.heldKeys, songTimeMs);
      this.manualTally.start(coreAtMs);
    }
    this.autoOn = enabled;
    input.setJudging(!enabled, eventTimestamp);
  }

  /** 판정 차트는 그대로 두고, 이미 정산한 입력을 빼고 이르게 시작한 바디의 유지도 포함해 Auto 계획만 다시 만든다. */
  private planRemainingAutoInputs(): ExplicitAutoPlayer {
    const snapshot = this.session.snapshot;
    const settledItems = new Set(snapshot.items.filter(item => item.settlementFactId !== null).map(item => item.id));
    const openBodies = new Set(snapshot.bodyUnits.filter(unit => unit.state !== "complete" && unit.state !== "failed")
      .map(unit => unit.ref.bodyIndex));
    const activeBodies = new Set(snapshot.bodyUnits.filter(unit => unit.state === "active" || unit.state === "recovering")
      .map(unit => unit.ref.bodyIndex));
    // 활성 바디의 down은 버릴 prefix에 둔다. 같은 시각에 시작했어도 즉시 hold를 seed하고 미래에 중복 down을 내지 않는다.
    return new ExplicitAutoPlayer({ ...this.playbackChart,
      scoreItems: this.playbackChart.scoreItems.filter(item => !settledItems.has(item.id)),
      bodies: this.playbackChart.bodies.filter(body => openBodies.has(body.source.noteIndex)).map(body => ({ ...body,
        startMs: activeBodies.has(body.source.noteIndex) ? -Infinity : body.startMs })),
    }, this.bindings ? { bindings: this.bindings } : {});
  }

  /** 렌더러와 같은 효과를 받되 전환 전 순번은 제외한다. 같은 확정 시각의 Auto 효과도 새 수동 집계에 넣지 않는다. */
  applyConfirmedEffects(effects: readonly ExplicitJudgmentEffect[]): void {
    this.manualTally.applyConfirmedEffects(effects.filter(effect => effect.sequence > this.manualStartSequence));
  }

  /** 음원 재생이 toMs에 닿고 구간 끝 근처의 늦은 Miss까지 확정된 뒤에 다음 반복으로 넘어간다. */
  isFinished(songTimeMs: number, advanceAtMs: number): boolean {
    return songTimeMs >= this.fadedSpan.toMs && advanceAtMs > this.session.latestJudgmentDeadlineMs;
  }
}

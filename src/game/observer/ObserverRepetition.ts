import { JUDGMENT_WINDOWS } from "../../shared/constants/judgment";
import type { JudgmentWindows } from "../../shared/constants/judgment";
import { ExplicitAutoPlayer } from "../input/ExplicitAutoPlayer";
import type { ExplicitAutoInput } from "../input/ExplicitAutoPlayer";
import type { KeyBinding } from "../input/InputSystem";
import type { ExplicitCompiledChart } from "../judgment/explicitCompiledChart";
import { selectExplicitRangePlaybackChart } from "../judgment/explicitPlaybackChart";
import { ExplicitJudgmentSession } from "../judgment/ExplicitJudgmentSession";
import type { ExplicitHeldKey, ExplicitJudgmentEffect } from "../judgment/ExplicitJudgmentState";
import type { ExplicitConfirmedEffectSink } from "../judgment/ExplicitSessionRendererAdapter";
import { ObserverManualTally } from "./ObserverManualTally";
import type { ObserverManualStats } from "./ObserverManualTally";
import { planObserverAudioSection } from "./observerRepetitionPlan";
import type { ObserverAudioSection, ObserverRange } from "./observerRepetitionPlan";

export interface ObserverRepetitionOptions {
  readonly range: ObserverRange;
  readonly audioDurationMs: number;
  /** 앞뒤 페이드의 곡 시간 길이만 정한다. 판정 시각은 곡 시간이다. */
  readonly playbackRate: number;
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
  /** `AudioEngine.playSection`에 넘길 음원 재생 범위. 판정 세션도 fromMs부터 시작한다. */
  readonly audioSection: ObserverAudioSection;
  /** 선택 구간 밖 점수 항목을 빼고 경계에 걸친 바디를 자른 재생 범위(RFD 0063). */
  readonly playbackChart: ExplicitCompiledChart;
  readonly session: ExplicitJudgmentSession;
  /** 런타임의 `ExplicitAutoInputSource`. Auto가 꺼져 있으면 아무 입력도 내지 않는다. */
  readonly autoInputSource: Pick<ExplicitAutoPlayer, "eventsThrough">;
  private readonly autoPlayer: ExplicitAutoPlayer;
  private readonly manualTally: ObserverManualTally;
  private autoOn: boolean;

  constructor(compiled: ExplicitCompiledChart, options: ObserverRepetitionOptions) {
    this.range = Object.freeze({ startMs: options.range.startMs, endMs: options.range.endMs });
    this.audioSection = planObserverAudioSection(this.range, options.audioDurationMs, options.playbackRate);
    this.playbackChart = selectExplicitRangePlaybackChart(compiled, this.range.startMs, this.range.endMs);
    const windows = options.windows ?? JUDGMENT_WINDOWS;
    this.autoOn = options.auto;
    this.session = new ExplicitJudgmentSession(this.playbackChart, {
      windows, startTimeMs: this.audioSection.fromMs,
      ...(options.maintenanceGraceMs === undefined ? {} : { maintenanceGraceMs: options.maintenanceGraceMs }),
      preheldKeys: options.auto ? [] : options.humanHeldKeys,
    });
    // 구간 전체를 Auto로 계획해 두고 Auto가 켜진 동안만 꺼내 쓴다. 꺼진 동안의 입력은 다시 켤 때 건너뛴다.
    this.autoPlayer = new ExplicitAutoPlayer(this.playbackChart, options.bindings ? { bindings: options.bindings } : {});
    this.autoInputSource = Object.freeze({
      eventsThrough: (timeMs: number) => this.autoOn ? this.autoPlayer.eventsThrough(timeMs) : NO_AUTO_INPUTS,
    });
    this.manualTally = new ObserverManualTally(this.playbackChart, windows);
    if (!options.auto) this.manualTally.start(this.audioSection.fromMs);
  }

  get autoEnabled(): boolean { return this.autoOn; }
  /** 런타임이 실제 키 입력을 판정 입력 큐에 넣어야 하는지. Auto 중에는 넣지 않는다. */
  get judgesHumanInput(): boolean { return !this.autoOn; }
  /** 수동 콤보·달성률. Auto 중에는 숨기므로 null이다. */
  get manualStats(): ObserverManualStats | null { return this.manualTally.stats; }

  /**
   * 현재 재생 위치 atMs에서 같은 세션의 입력 주체만 바꾼다. 구간을 다시 시작하지 않고 같은 모드면 아무것도 하지 않는다.
   * - Auto→수동: 그 시각의 hold를 사람이 실제로 누르는 키로 바꾼다. 진행 중 바디는 일반 유지 규칙으로 판단하며 새 시작 창을 열지 않는다.
   *   수동 집계는 atMs부터 0으로 다시 센다.
   * - 수동→Auto: atMs 앞의 Auto 입력은 버리고 그 시점 Auto 계획이 누르고 있을 키로 hold를 바꿔 진행 중 바디를 바로 이어받는다.
   *   atMs와 같은 시각의 Auto 입력은 이후에 전달한다. 수동 집계는 끝내고 버린다.
   * hold 교체는 탭·릴리즈 입력이 아니다. atMs는 세션의 현재 판정 시각 이상이어야 한다.
   */
  setAuto(enabled: boolean, atMs: number, humanHeldKeys: readonly ExplicitHeldKey[]): void {
    if (enabled === this.autoOn) return;
    if (!Number.isFinite(atMs) || atMs < this.session.snapshot.atMs) {
      throw new RangeError("Auto 전환 시각은 현재 판정 시각 이상이어야 합니다");
    }
    this.session.advance(atMs);
    if (enabled) {
      this.autoPlayer.eventsBefore(atMs);
      this.session.syncHeldKeys(atMs, this.autoPlayer.restoreCursor(this.autoPlayer.processedEventCount));
      this.manualTally.stop();
    } else {
      this.session.syncHeldKeys(atMs, humanHeldKeys);
      this.manualTally.start(atMs);
    }
    this.autoOn = enabled;
  }

  /** 렌더러 효과 sink와 함께 받는다. 세션의 효과 소비 커서는 런타임이 한 번만 drain한다. */
  applyConfirmedEffects(effects: readonly ExplicitJudgmentEffect[]): void {
    this.manualTally.applyConfirmedEffects(effects);
  }

  /** 음원 재생이 toMs에 닿고 구간 끝 근처의 늦은 Miss까지 확정된 뒤에 다음 반복으로 넘어간다. */
  isFinished(advanceAtMs: number): boolean {
    return advanceAtMs >= this.audioSection.toMs && advanceAtMs > this.session.latestJudgmentDeadlineMs;
  }
}

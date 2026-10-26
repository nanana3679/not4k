import type { ExplicitAutoInput } from "../input/ExplicitAutoPlayer";
import { InputSystem } from "../input/InputSystem";
import type { KeyBinding } from "../input/InputSystem";
import { InputTimeline } from "../input/InputTimeline";
import type { ExplicitJudgmentInput, ExplicitObservedInputBatch } from "../judgment/ExplicitJudgmentState";
import type { GameClock } from "../time/GameClock";

/** 구형 session cast 없이 실제 명시 session이 만족하는 입력 포트. */
export interface ExplicitPlayInputSession {
  readonly snapshot: { readonly atMs: number };
  readonly latestJudgmentDeadlineMs: number;
  processBatch(rawAt: number, inputs: readonly ExplicitJudgmentInput[], observedSongTimeMs?: number): void;
  processObservedBatches(groups: readonly ExplicitObservedInputBatch[], observedAt: number, observedSongTimeMs?: number): void;
  advance(at: number, observedSongTimeMs?: number): void;
}

export interface ExplicitAutoInputSource {
  eventsThrough(timeMs: number): readonly ExplicitAutoInput[];
}

export interface ExplicitPlayInputHooks {
  /** 경계 뒤 첫 실제 입력보다 먼저 준비 종료를 적용해 직전 hold만 seed한다. */
  beforeInput?(eventTimestamp: number): void;
  /**
   * 판정 재개 시각보다 앞선 down/up이 재개 뒤에 도착했다. 점수 입력으로 넣지 않으며,
   * 이미 바뀐 `heldKeys`를 판정 hold에 반영하는 것은 호출자 몫이다.
   */
  onLatePreparationHoldChange?(): void;
}

/** 입력 시각은 수집 시 GameClock으로 한 번만 변환한다. dispose는 물리 hold와 raw 큐를 함께 비운다. */
export function createExplicitPlayInput(
  bindings: readonly KeyBinding[],
  clock: Pick<GameClock, "toInputTimeMs">,
  hooks: ExplicitPlayInputHooks = {},
) {
  const timeline = new InputTimeline();
  const heldByKey = new Map<string, KeyBinding>();
  let disposed = false;
  let judging = true;
  let judgingFromTimestamp = -Infinity;
  const record = (lane: KeyBinding['lane'], at: number, key: string, type: 'down' | 'up') => {
    hooks.beforeInput?.(at);
    if (disposed) return;
    if (type === 'down') heldByKey.set(key, { lane, key }); else heldByKey.delete(key);
    if (!judging) return;
    if (at >= judgingFromTimestamp) timeline.enqueue({ lane, key, type, inputAt: clock.toInputTimeMs(at) });
    else hooks.onLatePreparationHoldChange?.();
  };
  const inputSystem = new InputSystem([...bindings], {
    onLanePress: (lane, at, key) => record(lane, at, key, 'down'),
    onLaneRelease: (lane, at, key) => record(lane, at, key, 'up'),
  });
  return {
    timeline, inputSystem,
    get heldKeys(): readonly KeyBinding[] { return [...heldByKey.values()]; },
    setJudging(enabled: boolean, fromTimestamp = -Infinity): void {
      judging = enabled;
      judgingFromTimestamp = fromTimestamp;
      if (!enabled) timeline.clear();
    },
    attach(nextTarget: EventTarget): void {
      if (disposed) throw new Error("dispose된 명시 입력 소스입니다");
      inputSystem.attach(nextTarget);
    },
    dispose(): void {
      inputSystem.detach();
      timeline.clear();
      heldByKey.clear();
      disposed = true;
    },
  };
}

/**
 * 한 drain의 과거 raw는 모두 함께 재생한다. 관측은 wall/frame 시각이 아니라 drain 시작 core 시각이다.
 * 미래 raw를 같은 관측 묶음에 넣으면 그 시각 전의 아직 합법적인 입력 기한을 먼저 확정할 수 있다.
 */
export function drainExplicitPlaySessionInputs(
  timeline: InputTimeline,
  session: ExplicitPlayInputSession,
  through = Infinity,
  observedSongTimeMs?: number,
): number {
  const startAt = session.snapshot.atMs;
  const groups: ExplicitObservedInputBatch[] = [];
  const flushed = timeline.flushThrough(through, (rawAtMs, inputs) => groups.push({ rawAtMs, inputs }));
  const late = groups.filter(group => group.rawAtMs < startAt);
  if (late.length) session.processObservedBatches(late, startAt, observedSongTimeMs);
  for (const group of groups) if (group.rawAtMs >= startAt) session.processBatch(group.rawAtMs, group.inputs, observedSongTimeMs);
  return flushed;
}

function enqueueAutoInputs(timeline: InputTimeline, events: readonly ExplicitAutoInput[]): void {
  timeline.enqueueMany(events.map(event => ({ lane: event.lane, key: event.key, type: event.type, inputAt: event.timeMs })));
}

/** offset·배속은 GameClock이 합성하고, raw/hold clamp/확정 시간은 session이 소유한다. */
export function stepExplicitPlaySession(
  timeline: InputTimeline,
  session: ExplicitPlayInputSession,
  autoPlayer: ExplicitAutoInputSource,
  clock: GameClock,
  frameTimestamp: number,
  songTimeMs = clock.judgmentTimeMs(),
): readonly ExplicitAutoInput[] {
  const advanceAt = Math.min(songTimeMs, clock.toInputTimeMs(frameTimestamp));
  const autoEvents = autoPlayer.eventsThrough(Math.max(advanceAt, timeline.latestTime));
  enqueueAutoInputs(timeline, autoEvents);
  drainExplicitPlaySessionInputs(timeline, session, Infinity, songTimeMs);
  // 앞선 raw 입력으로 core가 advanceAt보다 앞서 있어도 이번 곡 관측은 남긴다. 그래야 멈춘 곡 시각까지 되감을 수 있다.
  session.advance(Math.max(advanceAt, session.snapshot.atMs), songTimeMs);
  return autoEvents;
}

export function canFinishExplicitPlaySession(
  session: ExplicitPlayInputSession, clock: GameClock, playableEndMs: number, frameTimestamp: number,
): boolean {
  const judgmentTime = clock.judgmentTimeMs();
  const advanceAt = Math.min(judgmentTime, clock.toInputTimeMs(frameTimestamp));
  return playableEndMs > 0 && judgmentTime >= playableEndMs && advanceAt > session.latestJudgmentDeadlineMs;
}

/** canFinish 통과 뒤의 flush. 최종 정산은 session.finalize가 소유한다. */
export function finishExplicitPlaySession(
  timeline: InputTimeline, session: ExplicitPlayInputSession, autoPlayer: ExplicitAutoInputSource,
): void {
  enqueueAutoInputs(timeline, autoPlayer.eventsThrough(Infinity));
  drainExplicitPlaySessionInputs(timeline, session);
}

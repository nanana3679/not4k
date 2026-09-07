import type { InputTimeline } from "../input/InputTimeline";
import type { NoteJudgmentSession } from "../judgment/NoteJudgmentSession";
import type { AutoPlayer, AutoInput } from "../input/AutoPlayer";
import type { GameClock } from "../time/GameClock";

/**
 * 관측 시각과 원본 입력 시각을 분리해 session에 전달한다.
 * 이미 core 시각을 지난 raw 입력만 observed batch로 보정하고, 미래 raw 입력은
 * 원래 timestamp를 보존한 processBatch로 처리한다.
 */
export function drainPlaySessionInputs(
  timeline: InputTimeline,
  session: NoteJudgmentSession,
  observedAt: number,
  through = observedAt,
): number {
  return timeline.flushThrough(through, (rawAt, inputs) => {
    if (rawAt >= session.core.time) session.processBatch(rawAt, inputs);
    else session.processObservedBatch(rawAt, inputs, session.core.time);
  });
}

/** 실제 플레이가 사용하는 입력 수집·기한 진행 경계. 오프셋 합성은 GameClock에만 둔다. */
export function stepPlaySession(
  timeline: InputTimeline,
  session: NoteJudgmentSession,
  autoPlayer: Pick<AutoPlayer, "eventsThrough">,
  clock: GameClock,
  frameTimestamp: number,
): readonly AutoInput[] {
  const songTime = clock.judgmentTimeMs();
  // 양수 오프셋 입력으로 core가 앞서더라도, 그보다 앞선 합성 입력을
  // 생성하기 전에 deadline부터 확정하지 않도록 같은 논리 시각까지 수집한다.
  const autoEvents = autoPlayer.eventsThrough(Math.max(songTime, timeline.latestTime));
  timeline.enqueueMany(autoEvents.map(event => ({
    lane: event.lane, inputAt: event.timeMs, key: event.key,
    type: event.type === "release" ? "up" : "down",
  })));
  drainPlaySessionInputs(timeline, session, songTime, Infinity);
  const advanceAt = Math.min(songTime, clock.toInputTimeMs(frameTimestamp));
  if (advanceAt >= session.core.time) session.advance(advanceAt);
  return autoEvents;
}

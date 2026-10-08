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
  // 이번 프레임에 기한을 진행할 시각. 입력 오프셋(늦음 양)이 양수면 입력 시간이 곡 시간보다 뒤처지므로
  // 실제 입력이 아직 도착할 수 있는 입력 시간까지만 진행한다.
  const advanceAt = Math.min(songTime, clock.toInputTimeMs(frameTimestamp));
  // 합성(auto) 입력은 진행할 시각까지만 만든다. 곡 시간까지 만들면, 입력이 늦은 사람의 정당한 늦은 입력보다
  // 뒤의 auto 입력이 먼저 core를 앞당겨 수동 노트의 기한을 넘기고 Miss로 확정한다.
  // 음수 오프셋(입력이 앞섬)으로 큐가 앞서 있으면 그 시각까지 만들어, 앞선 합성 입력을 기한보다 먼저 넣는다.
  const autoEvents = autoPlayer.eventsThrough(Math.max(advanceAt, timeline.latestTime));
  enqueueAutoInputs(timeline, autoEvents);
  drainPlaySessionInputs(timeline, session, songTime, Infinity);
  if (advanceAt >= session.core.time) session.advance(advanceAt);
  return autoEvents;
}

/**
 * 곡 끝 정산 직전에 부른다. 입력 오프셋(늦음 양)이 양수면 진행 시각이 곡 시간보다 뒤처져, 곡 끝 직전의 auto 입력이
 * 마지막 프레임까지 만들어지지 않을 수 있다. 남은 auto 입력을 모두 만들고 큐를 비운 뒤 finalize하게 한다.
 */
export function finishPlaySession(
  timeline: InputTimeline,
  session: NoteJudgmentSession,
  autoPlayer: Pick<AutoPlayer, "eventsThrough">,
): void {
  enqueueAutoInputs(timeline, autoPlayer.eventsThrough(Number.POSITIVE_INFINITY));
  drainPlaySessionInputs(timeline, session, session.core.time, Number.POSITIVE_INFINITY);
}

function enqueueAutoInputs(timeline: InputTimeline, events: readonly AutoInput[]): void {
  timeline.enqueueMany(events.map(event => ({
    lane: event.lane, inputAt: event.timeMs, key: event.key,
    type: event.type === "release" ? "up" : "down",
  })));
}

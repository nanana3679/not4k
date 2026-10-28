import { beat } from "../shared/types/beat";
import { compileExplicitJudgmentChart } from "../game/judgment/explicitCompiledChart";
import { ExplicitJudgmentSession } from "../game/judgment/ExplicitJudgmentSession";
import { explicitEnjFixtures } from "../game/judgment/explicitEnjFixtures";
import type { ExplicitBodyUnitSnapshot, ExplicitItemSnapshot } from "../game/judgment/ExplicitJudgmentState";
import { explicitRenderChart, explicitRenderSnapshot } from "../game/renderer/ExplicitRenderFixtures";

type BodyState = ExplicitBodyUnitSnapshot["state"];
type ItemState = ExplicitItemSnapshot["state"];
export const explicitPreviewPresets = {
  waiting: { label: "대기", body: ["waiting", "waiting"], items: ["pending", "pending"] },
  held: { label: "유지 중", body: ["active", "active"], items: ["pending", "pending"] },
  recovery: { label: "회복 대기", body: ["recovering", "recovering"], items: ["waiting", "waiting"] },
  partialSuccess: { label: "왼쪽 성공", body: ["complete", "active"], items: ["success", "pending"] },
  partialFailure: { label: "왼쪽 실패", body: ["failed", "active"], items: ["miss", "pending"] },
  mixed: { label: "왼쪽 성공·오른쪽 실패", body: ["complete", "failed"], items: ["success", "miss"] },
  complete: { label: "모두 성공", body: ["complete", "complete"], items: ["success", "success"] },
  failed: { label: "모두 실패", body: ["failed", "failed"], items: ["miss", "miss"] },
} satisfies Record<string, { label: string; body: [BodyState, BodyState]; items: [ItemState, ItemState] }>;
export type ExplicitPreviewPreset = keyof typeof explicitPreviewPresets;

/** double/trill은 G1 공개 상태 fixture이며 실제 session 성공의 증거와 구분한다. */
export const explicitPreviewChart = explicitRenderChart([
  { type: "release", beat: beat(6), lane: 1, count: 2, grace: true },
  { type: "tick", beat: beat(4), lane: 1, count: 2 },
  { type: "body", beat: beat(2), endBeat: beat(6), lane: 1, holdCount: 2 },
  { type: "tap", beat: beat(2), lane: 1, kind: "double", grace: true },
  { type: "tap", beat: beat(2), lane: 2, kind: "single", grace: true },
  { type: "body", beat: beat(2), endBeat: beat(6), lane: 2, holdCount: 1 },
  { type: "tick", beat: beat(4), lane: 2, count: 1 },
  { type: "release", beat: beat(6), lane: 2, count: 1, grace: true },
  { type: "tap", beat: beat(2), lane: 3, kind: "trill", grace: true },
  { type: "body", beat: beat(2), endBeat: beat(6), lane: 3, holdCount: 1, trill: true },
  { type: "release", beat: beat(4), lane: 4, count: 2, grace: true },
], [{ lane: 3, beat: beat(2), endBeat: beat(6) }]);

export function explicitPreviewSnapshot(preset: ExplicitPreviewPreset, atMs: number) {
  const state = explicitPreviewPresets[preset];
  const single = state.items[0];
  const sustain = state.items.map(item => item === "miss" ? "dependentZero" : item);
  return explicitRenderSnapshot(explicitPreviewChart, { atMs,
    body: [...state.body, state.body[0], state.body[0]],
    items: { 0: state.items, 1: sustain, 3: state.items, 4: [single], 6: [sustain[0]], 7: [single], 8: [single], 10: state.items } });
}

export const explicitPreviewReplayFixture = explicitEnjFixtures.find(fixture => fixture.id === "ENJ-05")!;
export const explicitPreviewReplayChart = compileExplicitJudgmentChart(explicitPreviewReplayFixture.chart);
export function createExplicitPreviewSession() {
  return new ExplicitJudgmentSession(explicitPreviewReplayChart, { maintenanceGraceMs: 20 });
}

/** 실제 M1 입력을 시간순으로 전달한다. 탐색으로 되돌아갈 때는 호출자가 새 세션을 만든다. */
export function advanceExplicitPreviewSession(session: ExplicitJudgmentSession, atMs: number, nextBatch: number): number {
  while (nextBatch < explicitPreviewReplayFixture.batches.length && explicitPreviewReplayFixture.batches[nextBatch].observedAtMs <= atMs) {
    const batch = explicitPreviewReplayFixture.batches[nextBatch++];
    session.processObservedBatch(batch.rawAtMs, batch.inputs, batch.observedAtMs);
  }
  session.advance(atMs);
  return nextBatch;
}

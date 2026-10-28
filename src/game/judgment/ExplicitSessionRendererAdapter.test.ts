import { describe, expect, it, vi } from "vitest";
import { compileExplicitJudgmentChart } from "./explicitCompiledChart";
import { explicitEnjFixtures } from "./explicitEnjFixtures";
import { ExplicitJudgmentSession } from "./ExplicitJudgmentSession";
import type { ExplicitJudgmentEffect } from "./ExplicitJudgmentState";
import { ExplicitSessionRendererAdapter } from "./ExplicitSessionRendererAdapter";
import { beat } from "../../shared/types/beat";
import type { ChartDocument } from "../../shared/types/chart";

// Lab의 single 차트와 같은 입력을 로컬 fixture로 보존한다. 코어 테스트는 화면·오디오에 의존하지 않는다.
const reconstructionChart: ChartDocument = {
  meta: { title: "명시 입력 연습", artist: "Lab", difficultyLevel: 1, difficultyLabel: "Liftoff",
    imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
  trillZones: [],
  events: [{ type: "bpm", beat: beat(0), bpm: 120 }, { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) }],
  notes: [
    { type: "tap", kind: "single", lane: 1, beat: beat(2) },
    { type: "body", holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(4) },
    { type: "tick", count: 1, lane: 1, beat: beat(3) },
    { type: "release", count: 1, lane: 1, beat: beat(4) },
    { type: "tap", kind: "single", lane: 2, beat: beat(6), grace: true },
  ],
};

const sessionFor = (id: string) => new ExplicitJudgmentSession(compileExplicitJudgmentChart(
  explicitEnjFixtures.find(fixture => fixture.id === id)!.chart), { maintenanceGraceMs: 20 });

describe("snapshot 복구와 확정 effect sink 경계", () => {
  it('1000 Point·1500 sustain 처리 뒤1200으로 복원하면 prefix Point 효과는 재생하지 않고1500 재정산 효과만 한 번 전달한다', () => {
    const session = new ExplicitJudgmentSession(compileExplicitJudgmentChart(reconstructionChart));
    const sink = { applyConfirmedEffects: vi.fn() }, port = { render: vi.fn() };
    const first = new ExplicitSessionRendererAdapter(session, sink);
    session.processBatch(1000, [{ lane: 1, key: 'A', type: 'down' }]);
    session.advance(1500); first.sync(); first.dispose();
    expect(sink.applyConfirmedEffects.mock.calls[0][0]).toHaveLength(2);
    const restored = session.reconstructAt(1200);
    expect(restored.prefixEffects).toHaveLength(1);
    const next = new ExplicitSessionRendererAdapter(restored.session, sink);
    next.attach(port); next.sync(); next.sync();
    expect(port.render).toHaveBeenLastCalledWith(restored.session.snapshot, 1000);
    expect(sink.applyConfirmedEffects).toHaveBeenCalledTimes(1);
    restored.session.advance(1500); next.sync(); next.sync();
    expect(sink.applyConfirmedEffects).toHaveBeenCalledTimes(2);
    expect(sink.applyConfirmedEffects.mock.calls[1][0]).toHaveLength(1);
    expect(restored.session.score.earnedScore).toBe(6);
  });

  it("ENJ-05 회복 뒤 유지 성공은 Perfect·lane 1 타격·타이밍 null 효과를 한 번만 sink에 전달한다", () => {
    const session = sessionFor("ENJ-05");
    const sink = { applyConfirmedEffects: vi.fn() }, port = { render: vi.fn() };
    const adapter = new ExplicitSessionRendererAdapter(session, sink);
    adapter.attach(port);
    session.processBatch(1000, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(1490, [{ key: "A", lane: 1, type: "up" }]);
    session.advance(1500); adapter.sync();
    expect(sink.applyConfirmedEffects).not.toHaveBeenCalled();
    session.processBatch(1505, [{ key: "B", lane: 1, type: "down" }]);
    adapter.sync(1510);
    expect(port.render).toHaveBeenLastCalledWith(session.snapshot, 1510);
    expect(sink.applyConfirmedEffects).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ displayGrade: "perfect", hitGrade: "perfect", timingDeltaMs: null, lane: 1, scoreAction: "settleItem" }),
    ]);
    adapter.sync(); adapter.attach(null); adapter.attach(port); adapter.sync();
    expect(sink.applyConfirmedEffects).toHaveBeenCalledTimes(1);
  });

  it("ENJ-04 시작 실패 뒤 attach는 즉시 실패 snapshot만 복구하고 종속 0점에 별도 효과를 발명하지 않는다", () => {
    const session = sessionFor("ENJ-04");
    session.advance(1121);
    const sink = { applyConfirmedEffects: vi.fn() }, port = { render: vi.fn() };
    const adapter = new ExplicitSessionRendererAdapter(session, sink);
    adapter.attach(port);
    expect(port.render).toHaveBeenCalledWith(session.snapshot, 1121);
    expect(session.snapshot.bodyUnits[0].state).toBe("failed");
    expect(sink.applyConfirmedEffects).not.toHaveBeenCalled();
    adapter.sync();
    const effects = sink.applyConfirmedEffects.mock.calls[0][0];
    expect(effects.map((effect: ExplicitJudgmentEffect) => effect.scoreAction)).toEqual(["unscoredMiss", "dependentZero"]);
    expect(effects[1]).toMatchObject({ displayGrade: null, hitGrade: null, comboAction: "none", altitudeAction: "none" });
    adapter.dispose();
    const next = new ExplicitSessionRendererAdapter(session, sink);
    next.attach(port); next.sync();
    expect(sink.applyConfirmedEffects).toHaveBeenCalledTimes(1);
  });

  it("한 번 drain한 세션은 adapter를 새로 만들거나 snapshot을 반복 조회해도 과거 효과를 재생하지 않는다", () => {
    const session = sessionFor("ENJ-03");
    const sink = { applyConfirmedEffects: vi.fn() }, port = { render: vi.fn() };
    session.processBatch(900, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(950, [{ key: "A", lane: 1, type: "up" }]);
    const first = new ExplicitSessionRendererAdapter(session, sink);
    first.attach(port); first.sync(); first.dispose();
    const next = new ExplicitSessionRendererAdapter(session, sink);
    next.attach(port, 900); next.sync(); next.sync();
    expect(sink.applyConfirmedEffects).toHaveBeenCalledTimes(1);
    expect(session.effects).toHaveLength(1);
    next.dispose();
  });

  it("같은 확정 시각의 원본 효과 배열을 sink에 그대로 넘겨 대표 등급이나 시간 묶음을 선택하지 않는다", () => {
    const session = sessionFor("ENJ-03");
    session.processBatch(900, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(950, [{ key: "A", lane: 1, type: "up" }]);
    const effects = session.drainEffects();
    const source = { snapshot: session.snapshot, drainEffects: vi.fn().mockReturnValue(effects) };
    const sink = { applyConfirmedEffects: vi.fn() };
    const adapter = new ExplicitSessionRendererAdapter(source, sink);
    adapter.sync();
    expect(sink.applyConfirmedEffects.mock.calls[0][0]).toBe(effects);
  });
});

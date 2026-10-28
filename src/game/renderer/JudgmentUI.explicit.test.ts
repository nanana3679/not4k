import { describe, expect, it, vi } from "vitest";
import { Container, Text } from "pixi.js";
import { compileExplicitJudgmentChart } from "../judgment/explicitCompiledChart";
import { explicitFixtureTap as p, makeExplicitReplayFixture } from "../judgment/explicitJudgmentTestHarness";
import { ExplicitJudgmentSession } from "../judgment/ExplicitJudgmentSession";
import type { ExplicitJudgmentDisplayState } from "../judgment/ExplicitJudgmentState";
import { ExplicitJudgmentEffectSink } from "../judgment/ExplicitJudgmentEffectSink";
import { ExplicitSessionRendererAdapter } from "../judgment/ExplicitSessionRendererAdapter";
import { JudgmentUI } from "./JudgmentUI";

vi.mock("../../supabase/client", () => ({ supabase: {} }));

function create(notes = [p(1500, "single", 1), p(1600, "single", 2)], perfectWindow = 41) {
  const chart = makeExplicitReplayFixture("ENJ-M3-UI", "실제 Pixi 글자", notes, [],
    { earnedScore: 0, scoreItemCount: 0, theoreticalWeight: 0, scope: "whole" }).chart;
  const session = new ExplicitJudgmentSession(compileExplicitJudgmentChart(chart), {
    windows: { PERFECT: perfectWindow, GREAT: 82, GOOD: 120, BAD: 160 }, maintenanceGraceMs: 20,
  });
  const layer = new Container();
  const ui = new JudgmentUI(layer, 416, 1067, 600);
  ui.setPerfectWindow(perfectWindow);
  const [judgment, fastSlow, timing] = layer.children as Text[];
  const port = { showJudgmentGroup: vi.fn((state: ExplicitJudgmentDisplayState) => ui.showJudgmentGroup(state)),
    showBombEffect: vi.fn(), recordFlightJudgment: vi.fn() };
  const adapter = new ExplicitSessionRendererAdapter(session, new ExplicitJudgmentEffectSink(port));
  return { session, layer, ui, judgment, fastSlow, timing, adapter, port };
}

describe("실제 Pixi JudgmentUI의 같은 확정 group 개정", () => {
  it("Perfect 표시 200ms 뒤 같은 1500ms의 Good -100ms가 오면 글자만 바뀌고 alpha 0.6과 남은 300ms를 보존한다", () => {
    const { session, layer, ui, judgment, fastSlow, timing, adapter, port } = create();
    ui.setShowTimingDiff(true);
    expect(layer.children.every(child => child instanceof Text)).toBe(true);
    session.processBatch(1500, [{ key: "A", lane: 1, type: "down" }]); adapter.sync();
    ui.updateFade(200);
    expect(judgment.alpha).toBeCloseTo(0.6);
    session.processBatch(1500, [{ key: "B", lane: 2, type: "down" }]); adapter.sync();
    expect(judgment.text).toBe("GOOD");
    expect(fastSlow.text).toBe("FAST");
    expect(timing.text).toContain("100");
    for (const text of [judgment, fastSlow, timing]) expect(text.alpha).toBeCloseTo(0.6);
    expect(port.showBombEffect).toHaveBeenCalledTimes(2);
    expect(port.recordFlightJudgment.mock.calls.map(([grade]) => grade)).toEqual(["perfect", "good"]);
    ui.updateFade(300);
    for (const text of [judgment, fastSlow, timing]) expect(text.alpha).toBe(0);
    ui.dispose(); layer.destroy();
  });

  it("500ms fade가 끝난 같은 group의 개정은 alpha 0이고 다음 1501ms group만 alpha 1로 시작한다", () => {
    const { session, layer, ui, judgment, adapter } = create([p(1500, "single", 1), p(1600, "single", 2), p(1501, "single", 3)]);
    session.processBatch(1500, [{ key: "A", lane: 1, type: "down" }]); adapter.sync();
    ui.updateFade(500);
    session.processBatch(1500, [{ key: "B", lane: 2, type: "down" }]); adapter.sync();
    expect(judgment.text).toBe("GOOD");
    expect(judgment.alpha).toBe(0);
    session.processBatch(1501, [{ key: "C", lane: 3, type: "down" }]); adapter.sync();
    expect(judgment.text).toBe("PERFECT");
    expect(judgment.alpha).toBe(1);
    ui.dispose(); layer.destroy();
  });

  it.each([
    { perfectWindow: 41, delta: -20.5, expected: "" },
    { perfectWindow: 41, delta: -21, expected: "FAST" },
    { perfectWindow: 41, delta: 21, expected: "SLOW" },
    { perfectWindow: 50, delta: 25, expected: "" },
    { perfectWindow: 50, delta: 26, expected: "SLOW" },
  ])("Perfect 창 $perfectWindow·오차 $delta ms는 기존 절반 임계값대로 '$expected'와 개별 통계를 만든다", test => {
    const { session, layer, ui, judgment, fastSlow, timing, adapter } = create([p(1500)], test.perfectWindow);
    ui.setShowTimingDiff(true);
    session.processBatch(1500 + test.delta, [{ key: "A", lane: 1, type: "down" }]); adapter.sync();
    expect(judgment.text).toBe("PERFECT");
    expect(fastSlow.text).toBe(test.expected);
    expect(fastSlow.alpha).toBe(test.expected ? 1 : 0);
    expect(timing.alpha).toBe(1);
    expect(session.result().score).toMatchObject({ fastCount: test.expected === "FAST" ? 1 : 0, slowCount: test.expected === "SLOW" ? 1 : 0 });
    ui.updateFade(100);
    expect(fastSlow.alpha).toBe(test.expected ? 0.8 : 0);
    ui.dispose(); layer.destroy();
  });

  it("FAST/SLOW·타이밍 설정을 끈 상태의 -30ms 표시와 fade는 보조 글자를 만들지 않는다", () => {
    const { session, layer, ui, judgment, fastSlow, timing, adapter } = create([p(1500)]);
    ui.setShowFastSlow(false); ui.setShowTimingDiff(false);
    session.processBatch(1470, [{ key: "A", lane: 1, type: "down" }]); adapter.sync();
    ui.updateFade(100);
    expect(judgment.text).toBe("PERFECT");
    expect([fastSlow.text, timing.text]).toEqual(["", ""]);
    expect([fastSlow.alpha, timing.alpha]).toEqual([0, 0]);
    expect(session.result().score.fastCount).toBe(1);
    ui.dispose(); layer.destroy();
  });

  it("reset·detach·재attach·result·finalize 재호출은 과거 글자·고도·타격 효과를 다시 실행하지 않는다", () => {
    const { session, layer, ui, judgment, adapter, port } = create([p(1500)]);
    session.processBatch(1500, [{ key: "A", lane: 1, type: "down" }]); adapter.sync();
    ui.reset(); adapter.attach(null); adapter.attach({ render: vi.fn() }); session.result(); session.finalize(); session.finalize(); adapter.sync();
    expect(judgment.text).toBe("");
    expect(judgment.alpha).toBe(0);
    expect(port.showJudgmentGroup).toHaveBeenCalledTimes(1);
    expect(port.recordFlightJudgment).toHaveBeenCalledTimes(1);
    expect(port.showBombEffect).toHaveBeenCalledTimes(1);
    ui.dispose(); layer.destroy();
  });
});

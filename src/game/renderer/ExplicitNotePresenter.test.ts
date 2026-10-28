import { describe, expect, it } from "vitest";
import { beat } from "../../shared/types/beat";
import { compileExplicitJudgmentChart } from "../judgment/explicitCompiledChart";
import { ExplicitJudgmentSession } from "../judgment/ExplicitJudgmentSession";
import type { ExplicitBodyUnitSnapshot } from "../judgment/ExplicitJudgmentState";
import { explicitEnjFixtures } from "../judgment/explicitEnjFixtures";
import { buildExplicitSkinView } from "../skin/explicitSkin";
import { ExplicitNotePresenter } from "./ExplicitNotePresenter";
import { explicitRenderChart, explicitRenderSnapshot } from "./ExplicitRenderFixtures";

const skin = buildExplicitSkinView("/");
const chart = explicitRenderChart();
const presenter = new ExplicitNotePresenter(chart, skin);
const layout = { judgmentLineY: 426, scrollSpeed: 200, laneAreaX: 20, height: 600 };
const show = (options: Parameters<typeof explicitRenderSnapshot>[1] = {}, at?: number) => presenter.present(explicitRenderSnapshot(chart, options), layout, at);
const body = (states: readonly ExplicitBodyUnitSnapshot["state"][]) => show({ body: states }).find(note => note.kind === "body")!;

describe("G1 공개 snapshot 표시 presenter", () => {
  it.each([
    [["waiting", "waiting"], "idle", 1, true], [["active", "active"], "held", 1, true],
    [["recovering", "recovering"], "idle", 1, true], [["waiting", "active"], "partialHeld.left", 1, true],
    [["active", "recovering"], "partialHeld.right", 1, true], [["complete", "active"], "held", 0.7, true],
    [["failed", "active"], "partialFailed.left", 1, true], [["active", "failed"], "partialFailed.right", 1, true],
    [["complete", "failed"], "partialFailed.right", 0.7, true], [["failed", "complete"], "partialFailed.left", 0.7, true],
    [["complete", "complete"], "held", 1, false], [["failed", "failed"], "failed", 1, true],
  ] as const)("더블 바디 %j를 읽으면 %s·alpha %s·visible %s로 합성한다", (states, artwork, alpha, visible) => {
    const result = body(states);
    expect(result.layers[0]).toMatchObject({ assetId: `body.double.${artwork}`, alpha, visible });
    expect(result.bodyAlpha).toBe(alpha);
    expect(result.layers).toHaveLength(1);
  });

  it("snapshot 배열 순서가 뒤집혀도 source index 0·1·2·3과 ordinal 0=왼쪽·1=오른쪽을 보존한다", () => {
    const snapshot = explicitRenderSnapshot(chart, { body: ["failed", "active"] });
    const notes = presenter.present({ ...snapshot, bodyUnits: [...snapshot.bodyUnits].reverse(), items: [...snapshot.items].reverse() }, layout);
    expect(notes.map(note => note.sourceNoteIndex)).toEqual([0, 1, 2, 3]);
    expect(notes.find(note => note.kind === "body")!.layers[0].assetId).toBe("body.double.partialFailed.left");
    expect(notes.find(note => note.kind === "tick")!.layers.map(layer => layer.ordinal)).toEqual([0, 1]);
  });

  it("두 바디 몫이 이르게 완료돼도 대기 중인 Grace double release는 alpha 1로 남는다", () => {
    const notes = show({ body: ["complete", "complete"] }, 1900);
    expect(notes.find(note => note.kind === "body")!.layers[0].visible).toBe(false);
    expect(notes[0]).toMatchObject({ bodyAlpha: 1, overlayAlpha: 1 });
    expect(notes[0].layers.every(layer => layer.visible)).toBe(true);
  });

  it("release 한 몫 성공·한 몫 실패면 오른쪽 실패 도안 alpha 0.7과 sibling Grace 외곽 alpha 1을 유지한다", () => {
    const note = show({ items: { 0: ["success", "miss"] }, body: ["active", "active"] })[0];
    expect(note.layers[0]).toMatchObject({ assetId: "release.double.partialFailed.right", alpha: 0.7, visible: true });
    expect(note.layers[1]).toMatchObject({ assetId: "graceOverlay.release.overlay", alpha: 1, visible: true, overlay: true });
    expect(show({ items: { 0: ["success", "success"] } })[0].layers.every(layer => !layer.visible)).toBe(true);
    expect(show({ items: { 0: ["miss", "miss"] } })[0].layers).toMatchObject([
      { assetId: "release.double.failed", alpha: 1 }, { alpha: 1, visible: true },
    ]);
    expect(show({ items: { 0: ["success", "pending"] } }).find(note => note.kind === "body")!.bodyAlpha).toBe(1);
  });

  it("틱 왼쪽만 성공하면 해당 쪽 도안만 숨기고 오른쪽 200×40 캔버스·x116 틱의 크기·밝기를 유지한다", () => {
    const before = show()[1].layers;
    const after = show({ items: { 1: ["success", "pending"] } })[1].layers;
    expect(after[0].visible).toBe(false);
    expect(after[1]).toEqual(before[1]);
    expect(after[1]).toMatchObject({ assetId: "tick.double.pending.right", ordinal: 1, alpha: 1 });
    expect(after[1].width).toBeCloseTo(200 * 62.5 / 212);
    expect(after[1].height).toBe(12.5);
    expect(skin.assetsById[after[1].assetId].markerCenter).toEqual({ x: 116, y: 20 });
    const failed = show({ items: { 1: ["dependentZero", "waiting"] } })[1].layers;
    expect(failed[0]).toMatchObject({ assetId: "tick.double.failed.left", visible: true, alpha: 1 });
    expect(failed[1]).toEqual(before[1]);
  });

  it("실패 바디·릴리즈·미래 종속 0점 틱은 판정선에 붙지 않고 100ms마다 20px씩 원위치에서 스크롤한다", () => {
    const state = { body: ["failed", "failed"] as const, items: { 0: ["miss", "miss"] as const, 1: ["dependentZero", "dependentZero"] as const } };
    const first = show(state, 3200), second = show(state, 3300);
    for (const index of [0, 1, 2]) expect(second[index].layers[0].y - first[index].layers[0].y).toBeCloseTo(20);
    expect(first[2].layers[0].y + first[2].layers[0].height).toBeGreaterThan(426);
    expect(show(state, 6500).slice(0, 3).every(note => note.layers.every(layer => !layer.inViewport))).toBe(true);
  });

  it("대기 바디는 시각이 시작을 지나도 켜지거나 판정선에 붙지 않고 active snapshot만 실제 유지 모양을 만든다", () => {
    const waiting = show({}, 1500).find(note => note.kind === "body")!.layers[0];
    const active = show({ body: ["active", "active"] }, 1500).find(note => note.kind === "body")!.layers[0];
    expect(waiting.assetId).toBe("body.double.idle");
    expect(waiting.y + waiting.height).toBeCloseTo(532.25);
    expect(active.y + active.height).toBeCloseTo(432.25);
  });

  it.each([
    [["active", "active"], "held", 432.25],
    [["failed", "active"], "partialFailed.left", 432.25],
    [["failed", "recovering"], "partialFailed.left", 432.25],
    [["complete", "failed"], "partialFailed.right", 532.25],
    [["failed", "failed"], "failed", 532.25],
  ] as const)("1500ms에서 더블 바디 %j는 %s 도안의 아래끝을 y %s에 둔다 - 시작해 유지·회복 중인 몫이 남으면 판정선 426에 붙고 남은 몫이 없으면 원래 위치로 스크롤", (states, artwork, bottom) => {
    const layer = show({ body: states }, 1500).find(note => note.kind === "body")!.layers[0];
    expect(layer.assetId).toBe(`body.double.${artwork}`);
    expect(layer.y).toBeCloseTo(119.75);
    expect(layer.y + layer.height).toBeCloseTo(bottom);
  });

  it("Grace 24px 패딩은 본체와 같은 x·y 배율로 정렬되고 탭 212×40과 release 200×40을 구별한다", () => {
    const notes = show();
    for (const note of [notes[0], notes[3]]) {
      const [base, overlay] = note.layers;
      expect(base.x - overlay.x).toBeCloseTo(24 * 62.5 / 212);
      expect(base.y - overlay.y).toBeCloseTo(24 * 12.5 / 40);
    }
    expect(notes[3].layers[0].width).toBeCloseTo(62.5);
    expect(notes[0].layers[0].width).toBeCloseTo(200 * 62.5 / 212);
  });

  it("탭 싱글 성공은 즉시 숨기고 Miss는 원래 도안·Grace 없음으로 화면 밖까지 남는다", () => {
    const single = explicitRenderChart([{ type: "tap", lane: 2, beat: beat(2), kind: "single", grace: true }]);
    const present = new ExplicitNotePresenter(single, skin);
    expect(present.present(explicitRenderSnapshot(single, { items: { 0: ["success"] } }), layout)[0].layers.every(layer => !layer.visible)).toBe(true);
    expect(present.present(explicitRenderSnapshot(single, { items: { 0: ["miss"] } }), layout)[0].layers).toMatchObject([
      { assetId: "tap.single.pending", alpha: 1, visible: true }, { visible: false },
    ]);
  });

  it("탭 더블 왼쪽 Miss·오른쪽 대기는 실패 절반만 alpha 1이고 오른쪽 성공 뒤에는 두 절반 모두 alpha 0.7이다", () => {
    const pending = show({ items: { 3: ["miss", "pending"] } })[3].layers;
    expect(pending).toMatchObject([
      { assetId: "tap.double.failed", crop: "left", alpha: 1 },
      { assetId: "tap.double.pending", crop: "right", alpha: 1 }, { visible: false },
    ]);
    expect(pending[0].x + pending[0].width).toBeCloseTo(pending[1].x);
    expect(show({ items: { 3: ["miss", "success"] } })[3].layers).toMatchObject([
      { assetId: "tap.double.failed", crop: "left", alpha: 0.7, visible: true },
      { assetId: "tap.double.pending", crop: "right", alpha: 0.7, visible: true }, { visible: false },
    ]);
    expect(show({ items: { 3: ["success", "success"] } })[3].layers[0].visible).toBe(false);
  });

  it("공개 snapshot에 b2:hold:1이 없으면 geometry로 추정하지 않고 누락 ID를 보고한다", () => {
    const snapshot = explicitRenderSnapshot(chart);
    expect(() => presenter.present({ ...snapshot, bodyUnits: snapshot.bodyUnits.slice(0, 1) }, layout)).toThrow("b2:hold:1");
  });

  it("싱글 바디의 틱은 x100 중앙·200×40 캔버스를 보존하고 성공 시 그 틱만 숨긴다", () => {
    const single = explicitRenderChart([
      { type: "body", lane: 2, beat: beat(2), endBeat: beat(6), holdCount: 1 },
      { type: "tick", lane: 2, beat: beat(4), count: 1 },
    ]);
    const p = new ExplicitNotePresenter(single, skin);
    const shown = p.present(explicitRenderSnapshot(single, { body: ["active"] }), layout);
    expect(shown[1].layers[0]).toMatchObject({ assetId: "tick.single.pending", alpha: 1, visible: true });
    expect(skin.assetsById[shown[1].layers[0].assetId].markerCenter).toEqual({ x: 100, y: 20 });
    const done = p.present(explicitRenderSnapshot(single, { body: ["active"], items: { 1: ["success"] } }), layout);
    expect(done[1].layers[0].visible).toBe(false);
    expect(done[0].layers[0].visible).toBe(true);
  });

  it("trill 바디·탭은 200×40과 자기 snapshot만 사용하고 끝에 release·cap·자동 점수 표시를 만들지 않는다", () => {
    const trill = explicitRenderChart([
      { type: "tap", kind: "trill", lane: 3, beat: beat(2), grace: true },
      { type: "body", lane: 3, beat: beat(2), endBeat: beat(6), holdCount: 1, trill: true },
    ], [{ lane: 3, beat: beat(2), endBeat: beat(6) }]);
    const p = new ExplicitNotePresenter(trill, skin);
    const notes = p.present(explicitRenderSnapshot(trill, { body: ["active"] }), layout);
    expect(notes.map(note => note.kind)).toEqual(["tap", "body"]);
    expect(notes[0].layers.map(layer => layer.assetId)).toEqual(["tap.trill.pending", "graceOverlay.trill.overlay"]);
    expect(notes[0].layers[0].width).toBeCloseTo(200 * 62.5 / 212);
    expect(notes[1].layers[0].assetId).toBe("body.trill.held");
    const failed = p.present(explicitRenderSnapshot(trill, { body: ["failed"], items: { 0: ["miss"] } }), layout);
    expect(failed[0].layers[0].assetId).toBe("tap.trill.failed");
    expect(failed[1].layers[0].assetId).toBe("body.trill.failed");
    expect(trill.totalJudgments).toBe(1);
  });

  it("M1 ENJ-03 실제 이른 종료 snapshot은 바디와 성공 틱을 즉시 숨기며 별도 마감을 만들지 않는다", () => {
    const actual = compileExplicitJudgmentChart(explicitEnjFixtures.find(fixture => fixture.id === "ENJ-03")!.chart);
    const session = new ExplicitJudgmentSession(actual, { maintenanceGraceMs: 20 });
    session.processBatch(900, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(950, [{ key: "A", lane: 1, type: "up" }]);
    const notes = new ExplicitNotePresenter(actual, skin).present(session.snapshot, layout);
    expect(notes.map(note => note.kind)).toEqual(["body", "tick"]);
    expect(notes.flatMap(note => note.layers).every(layer => !layer.visible)).toBe(true);
  });

  it("실제 세션의 double 1070ms 늦은 시작·1080ms up 뒤 다른 몫 실패는 부분 실패 바디 alpha 0.7과 남은 실패 틱을 보존한다", () => {
    const actual = explicitRenderChart([
      { type: "body", lane: 1, beat: beat(2), endBeat: beat(53, 25), holdCount: 2 },
      { type: "tick", lane: 1, beat: beat(103, 50), count: 2 },
      { type: "release", lane: 1, beat: beat(53, 25), count: 2 },
    ]);
    const session = new ExplicitJudgmentSession(actual, { maintenanceGraceMs: 20 });
    session.processBatch(1070, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(1080, [{ key: "A", lane: 1, type: "up" }]);
    session.processBatch(1090, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(1100, [{ key: "A", lane: 1, type: "up" }]);
    session.finalize();
    expect(session.snapshot.bodyUnits.map(unit => unit.state)).toEqual(["complete", "failed"]);
    const notes = new ExplicitNotePresenter(actual, skin).present(session.snapshot, layout);
    expect(notes[0].layers[0]).toMatchObject({ assetId: "body.double.partialFailed.right", alpha: 0.7, visible: true });
    expect(notes[1].layers).toMatchObject([
      { visible: false, alpha: 1 }, { assetId: "tick.double.failed.right", visible: true, alpha: 1 },
    ]);
    expect(notes[2].layers[0]).toMatchObject({ assetId: "release.double.partialFailed.right", alpha: 0.7, visible: true });
  });

  it("실제 세션의 double 1000～3000ms를 두 키로 시작하고 1500ms B만 떼면 2950ms [active,failed]는 아래끝 432.25로 판정선에 붙고 3000ms 남은 몫 완료로 [complete,failed]가 되면 원래 차트 위치 832.25에서 100ms마다 20px 스크롤한다", () => {
    const session = new ExplicitJudgmentSession(chart, { maintenanceGraceMs: 20 });
    session.processBatch(1000, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]);
    session.processBatch(1500, [{ key: "B", lane: 1, type: "up" }]);
    const bodyAt = (at: number) => {
      session.advance(at);
      const layer = presenter.present(session.snapshot, layout, at).find(note => note.kind === "body")!.layers[0];
      return { states: session.snapshot.bodyUnits.map(unit => unit.state), layer, bottom: layer.y + layer.height };
    };
    const held = bodyAt(2950);
    expect(held.states).toEqual(["active", "failed"]);
    expect(held.layer).toMatchObject({ assetId: "body.double.partialFailed.right", alpha: 1, visible: true });
    expect(held.layer.y).toBeCloseTo(409.75);
    expect(held.bottom).toBeCloseTo(432.25);
    const released = bodyAt(3000);
    expect(released.states).toEqual(["complete", "failed"]);
    expect(released.layer).toMatchObject({ assetId: "body.double.partialFailed.right", alpha: 0.7, visible: true });
    expect(released.layer.y).toBeCloseTo(419.75);
    expect(released.bottom).toBeCloseTo(832.25);
    expect(bodyAt(3100).bottom).toBeCloseTo(852.25);
  });
});

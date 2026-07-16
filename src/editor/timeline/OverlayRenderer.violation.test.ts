import { describe, it, expect, vi } from "vitest";
import { Container } from "pixi.js";
import { beat } from "../../shared";
import type { Chart, BpmMarker, NoteEntity, TrillZone, RestZone, ChartEvent } from "../../shared";
import { LANE_WIDTH, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from "./constants";
import { OverlayRenderer } from "./OverlayRenderer";
import type { OverlayHost } from "./OverlayRenderer";

function makeChart(
  notes: NoteEntity[],
  trillZones: TrillZone[] = [],
  events: ChartEvent[] = [
    { type: "bpm", beat: beat(0), bpm: 120 },
    { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
  ],
  restZones?: RestZone[],
): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes,
    trillZones,
    ...(restZones ? { restZones } : {}),
    events,
  };
}

/** private 해칭 코어를 스파이해 rectX·startMs·endMs 인자를 검증한다. */
function spyHatchCore(r: OverlayRenderer) {
  return vi.spyOn(
    r as unknown as {
      drawViolationHatchAt(rectX: number, startMs: number, endMs: number | null, minTimeMs: number, maxTimeMs: number): void;
    },
    "drawViolationHatchAt",
  );
}

function makeHost(
  chart: Chart,
  violatingNotes: Set<number>,
  violatingZones: Set<number>,
  violatingEvents: Set<number> = new Set(),
  violatingRestZones: Set<number> = new Set(),
): OverlayHost {
  return {
    chart,
    selectedNotes: new Set(),
    selectedTrillZones: new Set(),
    resizeHoverNoteIndex: null,
    violatingNoteIndices: violatingNotes,
    violatingTrillZoneIndices: violatingZones,
    violatingRestZoneIndices: violatingRestZones,
    violatingEventIndices: violatingEvents,
    moveOrigins: null,
    boxSelectRect: null,
    scrollY: 0,
    contentOffsetX: 0,
    cachedBpmMarkers: [{ beat: beat(0), bpm: 120 }] as BpmMarker[],
    getVisibleTimeRange: () => ({ minTimeMs: -1_000_000, maxTimeMs: 1_000_000 }),
    timeToY: (ms: number) => ms / 10,
    ghostLayer: new Container(),
    hoverLayer: new Container(),
    violationLayer: new Container(),
    moveOriginLayer: new Container(),
    boxSelectLayer: new Container(),
    noteRenderer: {} as unknown as OverlayHost["noteRenderer"],
  };
}

describe("OverlayRenderer.renderViolationOverlay", () => {
  it("위반 노트가 있으면 violationLayer에 해칭 그래픽이 추가된다", () => {
    const chart = makeChart([
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 1, beat: beat(0) },
    ]);
    const host = makeHost(chart, new Set([0, 1]), new Set());
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBeGreaterThan(0);
  });

  it("위반 트릴존이 있으면 violationLayer에 해칭이 추가된다", () => {
    const chart = makeChart([], [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
      { lane: 1, beat: beat(2), endBeat: beat(6) },
    ]);
    const host = makeHost(chart, new Set(), new Set([0, 1]));
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBeGreaterThan(0);
  });

  it("보조 레인(lane 5) 위반 노트도 같은 통합 경로로 violationLayer에 해칭이 추가된다 (RFD 0018)", () => {
    const chart = makeChart([
      { type: "single", lane: 5, beat: beat(0) },
      { type: "single", lane: 5, beat: beat(0) }, // 같은 보조 레인·같은 박 중복
    ]);
    const host = makeHost(chart, new Set([0, 1]), new Set());
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBeGreaterThan(0);
  });

  it("위반이 없으면 violationLayer가 비어 있다", () => {
    const chart = makeChart([{ type: "single", lane: 1, beat: beat(0) }]);
    const host = makeHost(chart, new Set(), new Set());
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBe(0);
  });

  it("BpmEvent 중복 위반(editorLane 없음→1)은 x=TIMELINE_WIDTH에 포인트 해칭(endMs=null) 2개 (RFD 0017 §7)", () => {
    const chart = makeChart([], [], [
      { type: "bpm", beat: beat(2), bpm: 120 },
      { type: "bpm", beat: beat(2), bpm: 180 }, // 같은 박 BPM 중복
    ]);
    const host = makeHost(chart, new Set(), new Set(), new Set([0, 1]));
    const r = new OverlayRenderer(host);
    const spy = spyHatchCore(r);
    r.renderViolationOverlay();
    // 120 BPM에서 beat 2 = 1000ms, 포인트 이벤트라 endMs=null
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, TIMELINE_WIDTH, 1000, null, expect.any(Number), expect.any(Number));
    expect(spy).toHaveBeenNthCalledWith(2, TIMELINE_WIDTH, 1000, null, expect.any(Number), expect.any(Number));
    expect(host.violationLayer.children.length).toBe(2);
  });

  it("StopEvent 구간 위반(editorLane 2)은 x=TIMELINE_WIDTH+EXTRA_LANE_WIDTH에 beat 0→4(0→2000ms) 구간 해칭 (RFD 0017 §7)", () => {
    const chart = makeChart([], [], [
      { type: "stop", beat: beat(0), endBeat: beat(4), editorLane: 2 },
    ]);
    const host = makeHost(chart, new Set(), new Set(), new Set([0]));
    const r = new OverlayRenderer(host);
    const spy = spyHatchCore(r);
    r.renderViolationOverlay();
    expect(spy).toHaveBeenCalledExactlyOnceWith(
      TIMELINE_WIDTH + EXTRA_LANE_WIDTH, 0, 2000, expect.any(Number), expect.any(Number),
    );
    expect(host.violationLayer.children.length).toBe(1);
  });

  it("AutoEvent도 'endBeat' 보유 구간 이벤트로 beat 0→2(0→1000ms) 구간 해칭된다", () => {
    const chart = makeChart([], [], [
      { type: "auto", beat: beat(0), endBeat: beat(2) },
    ]);
    const host = makeHost(chart, new Set(), new Set(), new Set([0]));
    const r = new OverlayRenderer(host);
    const spy = spyHatchCore(r);
    r.renderViolationOverlay();
    expect(spy).toHaveBeenCalledExactlyOnceWith(
      TIMELINE_WIDTH, 0, 1000, expect.any(Number), expect.any(Number),
    );
  });

  it("이벤트 위반만 있어도(노트·트릴존 위반 0) 조기 반환 게이트를 통과해 해칭이 그려진다", () => {
    const chart = makeChart([{ type: "single", lane: 1, beat: beat(0) }], [], [
      { type: "stop", beat: beat(0), endBeat: beat(1) },
    ]);
    const host = makeHost(chart, new Set(), new Set(), new Set([0]));
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBeGreaterThan(0);
  });

  it("events 길이를 벗어난 stale 이벤트 인덱스는 건너뛴다(그리기 0개)", () => {
    const chart = makeChart([], [], [
      { type: "bpm", beat: beat(0), bpm: 120 },
    ]);
    const host = makeHost(chart, new Set(), new Set(), new Set([5]));
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBe(0);
  });

  it("위반 restZone(lane 3, beat 0→4)은 노트와 동일 레인 기하(x=2*LANE_WIDTH)로 0→2000ms 구간 해칭된다 (RFD 0019)", () => {
    const chart = makeChart([], [], undefined, [
      { lane: 3, beat: beat(0), endBeat: beat(4) },
    ]);
    const host = makeHost(chart, new Set(), new Set(), new Set(), new Set([0]));
    const r = new OverlayRenderer(host);
    const spy = spyHatchCore(r);
    r.renderViolationOverlay();
    // rectX = laneToX(3) + (LANE_WIDTH - NOTE_HEIGHT*5)/2 = 2*LANE_WIDTH + 0
    expect(spy).toHaveBeenCalledExactlyOnceWith(
      2 * LANE_WIDTH, 0, 2000, expect.any(Number), expect.any(Number),
    );
  });

  it("restZone 위반만 있어도(노트·트릴존·이벤트 위반 0) 조기 반환 게이트를 통과해 해칭이 그려진다", () => {
    const chart = makeChart([], [], undefined, [
      { lane: 1, beat: beat(0), endBeat: beat(2) },
    ]);
    const host = makeHost(chart, new Set(), new Set(), new Set(), new Set([0]));
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBeGreaterThan(0);
  });

  it("restZones 길이를 벗어난 stale restZone 인덱스는 건너뛴다(그리기 0개)", () => {
    const chart = makeChart([], [], undefined, [
      { lane: 1, beat: beat(0), endBeat: beat(2) },
    ]);
    const host = makeHost(chart, new Set(), new Set(), new Set(), new Set([7]));
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBe(0);
  });

  it("chart.restZones가 없으면(undefined) restZone 위반 인덱스가 있어도 그리지 않는다(하위호환)", () => {
    const chart = makeChart([], [], undefined, undefined);
    const host = makeHost(chart, new Set(), new Set(), new Set(), new Set([0]));
    const r = new OverlayRenderer(host);
    r.renderViolationOverlay();
    expect(host.violationLayer.children.length).toBe(0);
  });
});

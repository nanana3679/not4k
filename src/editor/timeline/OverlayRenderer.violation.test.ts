import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { beat } from "../../shared";
import type { Chart, BpmMarker, NoteEntity, TrillZone, ExtraNoteEntity } from "../../shared";
import { OverlayRenderer } from "./OverlayRenderer";
import type { OverlayHost } from "./OverlayRenderer";

function makeChart(notes: NoteEntity[], trillZones: TrillZone[] = []): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes,
    trillZones,
    events: [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
    ],
  };
}

function makeHost(
  chart: Chart,
  violatingNotes: Set<number>,
  violatingZones: Set<number>,
  extras: { extraNotes?: ExtraNoteEntity[]; violatingExtraNotes?: Set<number> } = {},
): OverlayHost {
  return {
    chart,
    extraNotes: extras.extraNotes ?? [],
    selectedNotes: new Set(),
    selectedTrillZones: new Set(),
    resizeHoverNoteIndex: null,
    violatingNoteIndices: violatingNotes,
    violatingTrillZoneIndices: violatingZones,
    violatingExtraNoteIndices: extras.violatingExtraNotes ?? new Set(),
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

  it("위반 엑스트라 노트가 있으면 violationLayer에 해칭이 추가된다 (extraLane 축, RFD 0017)", () => {
    const chart = makeChart([]);
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(0) },
      { type: "single", extraLane: 1, beat: beat(0) }, // 같은 extraLane·같은 박 중복
    ];
    const host = makeHost(chart, new Set(), new Set(), {
      extraNotes,
      violatingExtraNotes: new Set([0, 1]),
    });
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
});

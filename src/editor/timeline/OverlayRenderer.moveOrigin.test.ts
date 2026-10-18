import { describe, it, expect } from "vitest";
import { Container, Graphics } from "pixi.js";
import type { GraphicsPath } from "pixi.js";
import { beat } from "../../shared";
import type { Chart, BpmMarker, TimeSignatureMarker, NoteEntity, TrillZone, RestZone } from "../../shared";
import { COLORS, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from "./constants";
import { OverlayRenderer } from "./OverlayRenderer";
import type { OverlayHost } from "./OverlayRenderer";
import { GridRenderer } from "./GridRenderer";
import type { GridHost } from "./GridRenderer";

// 이동 원위치 고스트(#94) — 구간 유닛 이동 중 trillZone·restZone의 원래 위치에 타임라인과 같은 모양을
// 흐리게(그래픽 alpha 0.3) 남긴다. "같은 모양"은 GridRenderer가 같은 구간을 그린 결과와 비교해 검증한다.

const BPM_MARKERS: BpmMarker[] = [{ beat: beat(0), bpm: 120 }];
// 실제 타임라인처럼 시간이 갈수록 y가 작아진다(120 BPM에서 1박 = 500ms = 50px).
const timeToY = (ms: number) => (100_000 - ms) / 10;
const ALL_VISIBLE = { minTimeMs: -1_000_000, maxTimeMs: 1_000_000 };

function makeChart(trillZones: TrillZone[] = [], restZones: RestZone[] = [], notes: NoteEntity[] = []): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes,
    trillZones,
    restZones,
    events: [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
    ],
  };
}

function makeOverlayHost(
  chart: Chart,
  origins: {
    notes?: OverlayHost["moveOrigins"];
    trillZones?: OverlayHost["trillZoneMoveOrigins"];
    restZones?: OverlayHost["restZoneMoveOrigins"];
  },
  visible = ALL_VISIBLE,
): OverlayHost {
  return {
    chart,
    selectedNotes: new Set(),
    selectedTrillZones: new Set(),
    selectedRestZones: new Set(),
    resizeHoverNoteIndex: null,
    violatingNoteIndices: new Set(),
    violatingTrillZoneIndices: new Set(),
    violatingRestZoneIndices: new Set(),
    violatingEventIndices: new Set(),
    moveOrigins: origins.notes ?? null,
    trillZoneMoveOrigins: origins.trillZones ?? null,
    restZoneMoveOrigins: origins.restZones ?? null,
    boxSelectRect: null,
    scrollY: 0,
    contentOffsetX: 0,
    cachedBpmMarkers: BPM_MARKERS,
    getVisibleTimeRange: () => visible,
    timeToY,
    ghostLayer: new Container(),
    hoverLayer: new Container(),
    violationLayer: new Container(),
    moveOriginLayer: new Container(),
    boxSelectLayer: new Container(),
    noteRenderer: {} as unknown as OverlayHost["noteRenderer"],
  };
}

/** 같은 구간을 타임라인(GridRenderer)이 그린 밴드 — 고스트가 따라야 할 기준 모양. */
function timelineBand(chart: Chart, kind: "trillZone" | "restZone", visible = ALL_VISIBLE): Graphics {
  const timeSignatures: TimeSignatureMarker[] = [{ measure: 0, beatPerMeasure: beat(4) }];
  const host: GridHost = {
    chart,
    zoom: 100,
    snap: 4,
    extraLaneCount: 0,
    selectedTrillZones: new Set(),
    selectedRestZones: new Set(),
    currentTimelineWidth: TIMELINE_WIDTH + 0 * EXTRA_LANE_WIDTH,
    waveformPeaks: null,
    waveformDurationMs: 0,
    cachedBpmMarkers: BPM_MARKERS,
    cachedTimeSignatures: timeSignatures,
    measureLabelStyle: null,
    setMeasureLabelStyle: () => undefined,
    getVisibleTimeRange: () => visible,
    timeToY,
    getTotalTimelineMs: () => 100_000,
    laneBackgrounds: new Container(),
    waveformLayer: new Container(),
    measureLines: new Container(),
    beatLines: new Container(),
    snapLines: new Container(),
    trillZoneLayer: new Container(),
    restZoneLayer: new Container(),
    measureLabels: new Container(),
  };
  const grid = new GridRenderer(host);
  if (kind === "trillZone") {
    grid.renderTrillZones();
    return host.trillZoneLayer.children[0] as Graphics;
  }
  grid.renderRestZones();
  return host.restZoneLayer.children[0] as Graphics;
}

/** Graphics의 채우기 명령(색·alpha·도형)을 비교 가능한 값으로 펼친다. */
function fillsOf(g: Graphics): { color: number; alpha: number; shapes: unknown[] }[] {
  return g.context.instructions
    .filter((instruction) => instruction.action === "fill")
    .map((instruction) => {
      const data = instruction.data as { style: { color: number; alpha: number }; path: GraphicsPath };
      return {
        color: data.style.color,
        alpha: data.style.alpha,
        shapes: data.path.shapePath.shapePrimitives.map((primitive) => primitive.shape),
      };
    });
}

function renderOrigins(host: OverlayHost): Graphics[] {
  new OverlayRenderer(host).renderMoveOrigins();
  return host.moveOriginLayer.children as Graphics[];
}

describe("OverlayRenderer.renderMoveOrigins 구간 원위치 고스트 (#94)", () => {
  it("trillZone 원위치(lane 2, 0~4박) 고스트는 타임라인 trillZone 밴드와 같은 사각형·채우기(0x00ff88 α0.2)로 moveOriginLayer에 그려지고 그래픽 alpha만 0.3이다", () => {
    const zone: TrillZone = { lane: 2, beat: beat(0), endBeat: beat(4) };
    const chart = makeChart([zone]);

    const children = renderOrigins(makeOverlayHost(chart, { trillZones: [zone] }));

    expect(children).toHaveLength(1);
    expect(children[0].alpha).toBe(0.3);
    const band = timelineBand(chart, "trillZone");
    expect(fillsOf(children[0])).toEqual(fillsOf(band));
    expect(fillsOf(children[0]).map((fill) => [fill.color, fill.alpha])).toEqual([[COLORS.TRILL_ZONE, COLORS.TRILL_ZONE_ALPHA]]);
    expect(children[0].getLocalBounds()).toEqual(band.getLocalBounds());
  });

  it("restZone 원위치(lane 3, 0~4박) 고스트는 타임라인 restZone 밴드와 같은 바탕(검정 α0.2)·빗금(검정 α0.6) 채우기로 그려지고 그래픽 alpha만 0.3이다", () => {
    const zone: RestZone = { lane: 3, beat: beat(0), endBeat: beat(4) };
    const chart = makeChart([], [zone]);

    const children = renderOrigins(makeOverlayHost(chart, { restZones: [zone] }));

    expect(children).toHaveLength(1);
    expect(children[0].alpha).toBe(0.3);
    const fills = fillsOf(children[0]);
    expect(fills).toEqual(fillsOf(timelineBand(chart, "restZone")));
    expect(fills.map((fill) => [fill.color, fill.alpha])).toEqual([
      [COLORS.REST_ZONE, COLORS.REST_ZONE_BASE_ALPHA],
      [COLORS.REST_ZONE, COLORS.REST_ZONE_STRIPE_ALPHA],
    ]);
  });

  it("보이는 범위가 1000~1500ms뿐이면 0~8박(0~4000ms) restZone 고스트의 빗금도 타임라인처럼 그 범위만 같은 위상으로 만든다", () => {
    const zone: RestZone = { lane: 2, beat: beat(0), endBeat: beat(8) };
    const chart = makeChart([], [zone]);
    const visible = { minTimeMs: 1000, maxTimeMs: 1500 };

    const children = renderOrigins(makeOverlayHost(chart, { restZones: [zone] }, visible));

    expect(fillsOf(children[0])).toEqual(fillsOf(timelineBand(chart, "restZone", visible)));
  });

  it("beat와 endBeat가 같은 trillZone 원위치(beat 2)는 타임라인처럼 beat 위치 중심 NOTE_HEIGHT 높이 고스트로 그려진다", () => {
    const zone: TrillZone = { lane: 1, beat: beat(2), endBeat: beat(2) };
    const chart = makeChart([zone]);

    const children = renderOrigins(makeOverlayHost(chart, { trillZones: [zone] }));

    expect(children[0].getLocalBounds()).toEqual(timelineBand(chart, "trillZone").getLocalBounds());
  });

  it("노트 원위치(moveOrigins)가 null이어도 restZone 원위치 1개만 있으면 고스트 1개를 그린다(노트 없는 구간 이동)", () => {
    const zone: RestZone = { lane: 1, beat: beat(2), endBeat: beat(4) };

    const children = renderOrigins(makeOverlayHost(makeChart([], [zone]), { notes: null, restZones: [zone] }));

    expect(children).toHaveLength(1);
  });

  it("구간 원위치가 둘 다 null이면(노트만 이동) moveOriginLayer에는 single 노트 고스트 1개만 그려진다", () => {
    const note: NoteEntity = { type: "single", lane: 1, beat: beat(1) };
    const chart = makeChart([{ lane: 3, beat: beat(0), endBeat: beat(4) }], [{ lane: 4, beat: beat(0), endBeat: beat(4) }], [note]);

    const children = renderOrigins(makeOverlayHost(chart, { notes: [{ note, beat: beat(1), lane: 1 }] }));

    expect(children).toHaveLength(1);
    expect(fillsOf(children[0]).map((fill) => fill.color)).toEqual([COLORS.SINGLE_NOTE]);
  });

  it("restZone·trillZone·노트 원위치가 함께 있으면 restZone → trillZone → 노트 고스트 순으로 추가돼 타임라인 z-order와 같다", () => {
    const trillZone: TrillZone = { lane: 2, beat: beat(0), endBeat: beat(4) };
    const restZone: RestZone = { lane: 4, beat: beat(0), endBeat: beat(4) };
    const note: NoteEntity = { type: "trill", lane: 2, beat: beat(1) };
    const chart = makeChart([trillZone], [restZone], [note]);

    const children = renderOrigins(makeOverlayHost(chart, {
      notes: [{ note, beat: beat(1), lane: 2 }],
      trillZones: [trillZone],
      restZones: [restZone],
    }));

    expect(children.map((child) => fillsOf(child)[0].color)).toEqual([
      COLORS.REST_ZONE,
      COLORS.TRILL_ZONE,
      COLORS.TRILL_NOTE,
    ]);
  });

  it("가시 범위(5000~6000ms) 밖 trillZone 원위치(0~4박 = 0~2000ms)는 고스트를 그리지 않는다(컬링)", () => {
    const zone: TrillZone = { lane: 1, beat: beat(0), endBeat: beat(4) };

    const children = renderOrigins(makeOverlayHost(makeChart([zone]), { trillZones: [zone] }, { minTimeMs: 5000, maxTimeMs: 6000 }));

    expect(children).toHaveLength(0);
  });
});

describe("OverlayRenderer.clearMoveOriginGhosts", () => {
  it("restZone·trillZone·노트 고스트 3개를 그린 뒤 clearMoveOriginGhosts()하면 다음 전체 렌더를 기다리지 않고 moveOriginLayer가 바로 빈다", () => {
    const trillZone: TrillZone = { lane: 2, beat: beat(0), endBeat: beat(4) };
    const restZone: RestZone = { lane: 4, beat: beat(0), endBeat: beat(4) };
    const note: NoteEntity = { type: "trill", lane: 2, beat: beat(1) };
    const host = makeOverlayHost(makeChart([trillZone], [restZone], [note]), {
      notes: [{ note, beat: beat(1), lane: 2 }],
      trillZones: [trillZone],
      restZones: [restZone],
    });
    const overlay = new OverlayRenderer(host);
    overlay.renderMoveOrigins();
    expect(host.moveOriginLayer.children).toHaveLength(3);

    overlay.clearMoveOriginGhosts();

    expect(host.moveOriginLayer.children).toHaveLength(0);
  });
});

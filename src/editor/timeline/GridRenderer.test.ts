import { describe, it, expect, vi } from "vitest";
import { Container, Graphics } from "pixi.js";
import { beat } from "../../shared";
import type { Chart, ChartEvent, RestZone, BpmMarker, TimeSignatureMarker } from "../../shared";
import { NOTE_HEIGHT, LANE_WIDTH, TIMELINE_WIDTH, EXTRA_LANE_WIDTH, COLORS } from "./constants";
import { GridRenderer } from "./GridRenderer";
import type { GridHost } from "./GridRenderer";

// Pixi Text는 node 환경에서 캔버스 텍스트 측정(DOM)을 요구하므로 Container 기반 스텁으로 대체한다.
// 이 테스트의 관심사는 이벤트 마커 Graphics 기하뿐이다.
vi.mock("pixi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pixi.js")>();
  class TextStub extends actual.Container {
    text: unknown;
    style: unknown;
    anchor = { set: () => undefined };
    constructor(opts?: { text?: unknown; style?: unknown }) {
      super();
      this.text = opts?.text;
      this.style = opts?.style;
    }
  }
  return { ...actual, Text: TextStub };
});

function makeChart(events: ChartEvent[], restZones?: RestZone[]): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    ...(restZones ? { restZones } : {}),
    events,
  };
}

function makeHost(chart: Chart): GridHost {
  const bpmMarkers: BpmMarker[] = [{ beat: beat(0), bpm: 120 }];
  const timeSignatures: TimeSignatureMarker[] = [{ measure: 0, beatPerMeasure: beat(4) }];
  return {
    chart,
    zoom: 100,
    snap: 4,
    extraLaneCount: 3,
    selectedTrillZones: new Set(),
    selectedRestZones: new Set(),
    currentTimelineWidth: TIMELINE_WIDTH + 3 * EXTRA_LANE_WIDTH,
    waveformPeaks: null,
    waveformDurationMs: 0,
    cachedBpmMarkers: bpmMarkers,
    cachedTimeSignatures: timeSignatures,
    measureLabelStyle: null,
    setMeasureLabelStyle: () => undefined,
    getVisibleTimeRange: () => ({ minTimeMs: -1_000_000, maxTimeMs: 1_000_000 }),
    timeToY: (ms: number) => ms / 10,
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
}

function renderEvents(events: ChartEvent[]): Container {
  const host = makeHost(makeChart(events));
  const r = new GridRenderer(host);
  const noteLayer = new Container();
  r.renderMarkers(noteLayer, null, () => undefined);
  return noteLayer;
}

// 마커 테두리(width 1.5, alignment 0=outer)가 사방으로 바깥 확장돼 로컬 바운즈에 포함된다.
const STROKE = 1.5;

describe("GridRenderer.renderMarkers 이벤트 기하", () => {
  it("editorLane 없는 이벤트는 기본 1로 첫 엑스트라 칸(x=TIMELINE_WIDTH)에 그려진다", () => {
    const layer = renderEvents([{ type: "bpm", beat: beat(0), bpm: 120 }]);
    const gfx = layer.children[0] as Graphics;
    expect(gfx.getLocalBounds().minX).toBe(TIMELINE_WIDTH - STROKE);
  });

  it("editorLane 3 이벤트는 x=TIMELINE_WIDTH+2*EXTRA_LANE_WIDTH 칸에 폭 EXTRA_LANE_WIDTH로 그려진다 (eventLaneToX)", () => {
    const layer = renderEvents([
      { type: "text", beat: beat(0), endBeat: beat(2), text: "hi", editorLane: 3 },
    ]);
    const gfx = layer.children[0] as Graphics;
    const b = gfx.getLocalBounds();
    expect(b.minX).toBe(TIMELINE_WIDTH + 2 * EXTRA_LANE_WIDTH - STROKE);
    expect(b.width).toBe(EXTRA_LANE_WIDTH + 2 * STROKE);
  });

  it("포인트 이벤트(BpmEvent)는 beat 위치(120 BPM에서 beat 2=1000ms→y100) 중심 NOTE_HEIGHT 높이 마커", () => {
    const layer = renderEvents([{ type: "bpm", beat: beat(2), bpm: 120 }]);
    const gfx = layer.children[0] as Graphics;
    const b = gfx.getLocalBounds();
    expect(b.minY).toBe(100 - NOTE_HEIGHT / 2 - STROKE);
    expect(b.height).toBe(NOTE_HEIGHT + 2 * STROKE);
  });

  it("구간 이벤트(StopEvent beat 0→4)는 y 0→200으로 구간 높이 200 마커 — 포인트와 달리 endBeat까지 늘어난다", () => {
    const layer = renderEvents([
      { type: "stop", beat: beat(0), endBeat: beat(4) },
    ]);
    const gfx = layer.children[0] as Graphics;
    const b = gfx.getLocalBounds();
    expect(b.minY).toBe(0 - STROKE);
    expect(b.height).toBe(200 + 2 * STROKE);
  });

  it("가시 범위 밖 이벤트는 마커를 그리지 않는다(컬링)", () => {
    const host = makeHost(makeChart([{ type: "bpm", beat: beat(2), bpm: 120 }]));
    (host as { getVisibleTimeRange: GridHost["getVisibleTimeRange"] }).getVisibleTimeRange =
      () => ({ minTimeMs: 5000, maxTimeMs: 6000 });
    const r = new GridRenderer(host);
    const noteLayer = new Container();
    r.renderMarkers(noteLayer, null, () => undefined);
    expect(noteLayer.children.length).toBe(0);
  });
});

function renderRestZones(restZones: RestZone[] | undefined): GridHost {
  const host = makeHost(makeChart([], restZones));
  new GridRenderer(host).renderRestZones();
  return host;
}

describe("GridRenderer.renderRestZones 밴드 기하 (RFD 0019)", () => {
  it("restZone(lane 2, beat 0→4)은 120 BPM에서 x=LANE_WIDTH·y 0→200 풀레인 밴드로 restZoneLayer에 그려진다", () => {
    const host = renderRestZones([{ lane: 2, beat: beat(0), endBeat: beat(4) }]);
    expect(host.restZoneLayer.children.length).toBe(1);
    const b = (host.restZoneLayer.children[0] as Graphics).getLocalBounds();
    expect(b.minX).toBe(LANE_WIDTH);
    expect(b.width).toBe(LANE_WIDTH);
    expect(b.minY).toBe(0);
    expect(b.height).toBe(200);
  });

  it("beat와 endBeat가 같은 restZone(beat 2)은 y100 중심 NOTE_HEIGHT 높이 밴드로 그려진다(0높이 방어, trillZone 미러)", () => {
    const host = renderRestZones([{ lane: 1, beat: beat(2), endBeat: beat(2) }]);
    const b = (host.restZoneLayer.children[0] as Graphics).getLocalBounds();
    expect(b.minY).toBe(100 - NOTE_HEIGHT / 2);
    expect(b.height).toBe(NOTE_HEIGHT);
  });

  it("가시 범위(5000~6000ms) 밖 restZone(beat 0→4=0~2000ms)은 그리지 않는다(컬링)", () => {
    const host = makeHost(makeChart([], [{ lane: 1, beat: beat(0), endBeat: beat(4) }]));
    (host as { getVisibleTimeRange: GridHost["getVisibleTimeRange"] }).getVisibleTimeRange =
      () => ({ minTimeMs: 5000, maxTimeMs: 6000 });
    new GridRenderer(host).renderRestZones();
    expect(host.restZoneLayer.children.length).toBe(0);
  });

  it("chart.restZones가 없으면(undefined) restZoneLayer에 아무것도 그리지 않는다(하위호환)", () => {
    const host = renderRestZones(undefined);
    expect(host.restZoneLayer.children.length).toBe(0);
  });

  it("restZone은 trillZoneLayer가 아닌 restZoneLayer에만 그려지고, 밴드 색은 trillZone(0x00ff88)과 다른 인게임 dim(검정 오버레이)이다", () => {
    const host = renderRestZones([{ lane: 3, beat: beat(0), endBeat: beat(2) }]);
    expect(host.restZoneLayer.children.length).toBe(1);
    expect(host.trillZoneLayer.children.length).toBe(0);
    expect(COLORS.REST_ZONE).not.toBe(COLORS.TRILL_ZONE);
    expect(COLORS.REST_ZONE).toBe(0x000000);
  });

  it("유닛 선택된 restZone(인덱스 0)은 SELECTED_OUTLINE 테두리가 더해져 바운즈가 레인 폭(LANE_WIDTH)보다 넓어지고, 미선택은 정확히 레인 폭이다 (RFD 0019 선택 표시)", () => {
    const restZones: RestZone[] = [{ lane: 2, beat: beat(0), endBeat: beat(4) }];
    const selectedHost = makeHost(makeChart([], restZones));
    (selectedHost as { selectedRestZones: ReadonlySet<number> }).selectedRestZones = new Set([0]);
    new GridRenderer(selectedHost).renderRestZones();
    const selectedBounds = (selectedHost.restZoneLayer.children[0] as Graphics).getLocalBounds();
    expect(selectedBounds.width).toBeGreaterThan(LANE_WIDTH); // 테두리(width 2)만큼 확장

    const unselectedHost = renderRestZones(restZones);
    const unselectedBounds = (unselectedHost.restZoneLayer.children[0] as Graphics).getLocalBounds();
    expect(unselectedBounds.width).toBe(LANE_WIDTH); // 테두리 없음
  });
});

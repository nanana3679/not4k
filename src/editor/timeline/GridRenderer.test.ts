import { describe, it, expect, vi } from "vitest";
import { Container, Graphics } from "pixi.js";
import { beat } from "../../shared";
import type { Chart, ChartEvent, BpmMarker, TimeSignatureMarker } from "../../shared";
import { NOTE_HEIGHT, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from "./constants";
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

function makeChart(events: ChartEvent[]): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes: [],
    trillZones: [],
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

/**
 * 롱노트 끝 리사이즈 캡의 x·폭이 레인 기하(laneToX·laneWidth)를 따르는지 검증한다 (#100).
 *
 * 실제 상수는 LANE_WIDTH === EXTRA_LANE_WIDTH(둘 다 60)라, 보조 레인에서도
 * (lane - 1) * LANE_WIDTH가 laneToX(lane)와 우연히 같다. 보조 칸 폭만 50으로 바꿔
 * 그 우연에 기대지 않고 노트 몸통과 같은 투영을 쓰는지 본다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "pixi.js";
import { beat } from "../../shared";
import type { BpmMarker, Chart, NoteEntity } from "../../shared";
import { OverlayRenderer } from "./OverlayRenderer";
import type { OverlayHost } from "./OverlayRenderer";
import { drawNoteResizeHandle } from "./trillZoneHandles";
import { laneToX, laneWidth } from "./laneGeometry";
import { LANE_WIDTH, EXTRA_LANE_WIDTH } from "./constants";

vi.mock("./constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./constants")>()),
  EXTRA_LANE_WIDTH: 50,
}));

vi.mock("./trillZoneHandles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./trillZoneHandles")>();
  return { ...actual, drawNoteResizeHandle: vi.fn(actual.drawNoteResizeHandle) };
});

function makeChart(notes: NoteEntity[]): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes,
    trillZones: [],
    events: [{ type: "bpm", beat: beat(0), bpm: 120 }],
  };
}

// 120 BPM에서 4박 = 2000ms, timeToY = ms / 10 → 끝 캡 y = 200
function makeHost(
  chart: Chart,
  opts: { selectedNotes?: Set<number>; resizeHoverNoteIndex?: number | null } = {},
): OverlayHost {
  return {
    chart,
    selectedNotes: opts.selectedNotes ?? new Set(),
    selectedTrillZones: new Set(),
    selectedRestZones: new Set(),
    resizeHoverNoteIndex: opts.resizeHoverNoteIndex ?? null,
    violatingNoteIndices: new Set(),
    violatingTrillZoneIndices: new Set(),
    violatingRestZoneIndices: new Set(),
    violatingEventIndices: new Set(),
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

/** drawNoteResizeHandle 호출 인자를 {x, 폭, y, 선택 여부} 객체로 바꾼다. 그리는 layer는 hoverLayer여야 한다. */
function capDraws(host: OverlayHost) {
  return vi.mocked(drawNoteResizeHandle).mock.calls.map(([layer, x, w, endY, selected]) => {
    expect(layer).toBe(host.hoverLayer);
    return { x, laneWidth: w, endY, selected };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OverlayRenderer 롱노트 끝 캡 기하 — 보조 칸 폭 50(EXTRA_LANE_WIDTH)", () => {
  it("EXTRA_LANE_WIDTH를 50으로 바꾸면 laneToX(6)=290·laneWidth(6)=50이 되어 (6-1)*LANE_WIDTH=300·LANE_WIDTH=60과 갈린다", () => {
    expect(EXTRA_LANE_WIDTH).toBe(50);
    expect(laneToX(6)).toBe(290);
    expect(laneWidth(6)).toBe(50);
    expect((6 - 1) * LANE_WIDTH).toBe(300);
  });

  it("선택된 보조 lane 6 롱노트(0→4박) 끝 캡은 x=laneToX(6)=290·폭 laneWidth(6)=50·y=200에 선택색으로 그린다", () => {
    const host = makeHost(
      makeChart([{ type: "long", lane: 6, beat: beat(0), endBeat: beat(4) }]),
      { selectedNotes: new Set([0]) },
    );
    new OverlayRenderer(host).updateHoverOverlay(null);
    expect(capDraws(host)).toEqual([{ x: 290, laneWidth: 50, endY: 200, selected: true }]);
  });

  it("hover 중인 미선택 보조 lane 5 롱노트(resizeHoverNoteIndex=0) 끝 캡은 x=laneToX(5)=240·폭 50에 hover색(selected=false)으로 그린다", () => {
    const host = makeHost(
      makeChart([{ type: "long", lane: 5, beat: beat(0), endBeat: beat(4) }]),
      { resizeHoverNoteIndex: 0 },
    );
    new OverlayRenderer(host).updateHoverOverlay(null);
    expect(capDraws(host)).toEqual([{ x: 240, laneWidth: 50, endY: 200, selected: false }]);
  });

  it("선택된 메인 lane 2 롱노트 끝 캡은 보조 칸 폭과 무관하게 x=60·폭 LANE_WIDTH=60", () => {
    const host = makeHost(
      makeChart([{ type: "long", lane: 2, beat: beat(0), endBeat: beat(4) }]),
      { selectedNotes: new Set([0]) },
    );
    new OverlayRenderer(host).updateHoverOverlay(null);
    expect(capDraws(host)).toEqual([{ x: 60, laneWidth: 60, endY: 200, selected: true }]);
  });
});

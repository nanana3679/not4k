import { describe, it, expect, vi } from "vitest";
import { Container } from "pixi.js";
import type { Graphics, GraphicsPath, Rectangle } from "pixi.js";
import { beat } from "../../shared";
import type { Chart, BpmChange, NoteEntity, ChartEvent } from "../../shared";
import { OverlayRenderer } from "./OverlayRenderer";
import type { OverlayHost } from "./OverlayRenderer";

// 실제 상수는 NOTE_HEIGHT*5 = LANE_WIDTH = EXTRA_LANE_WIDTH = 60이라 해칭이 어느 폭을 썼는지 구분되지 않는다(#104).
// 이 파일만 노트 폭 NOTE_HEIGHT*5를 60(NOTE_HEIGHT 12)으로 고정하고 메인 레인 칸 70·엑스트라 레인 칸 80으로 바꿔,
// 호출처가 넘기는 폭을 공개 경로(renderViolationOverlay)로 확인한다.
// TIMELINE_WIDTH는 constants.ts 안에서 LANE_COUNT * LANE_WIDTH로 계산되므로 함께 덮어쓴다.
vi.mock("./constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants")>();
  return {
    ...actual,
    NOTE_HEIGHT: 12,
    LANE_WIDTH: 70,
    TIMELINE_WIDTH: actual.LANE_COUNT * 70,
    EXTRA_LANE_WIDTH: 80,
  };
});

function makeChart(notes: NoteEntity[], events: ChartEvent[] = []): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes,
    trillZones: [],
    events,
  };
}

/** 위반 인덱스를 받아 renderViolationOverlay로 그린 해칭 Graphics들을 돌려준다. */
function renderViolations(chart: Chart, violating: { notes?: number[]; events?: number[] }): Graphics[] {
  const host: OverlayHost = {
    chart,
    extraLaneCount: 4,
    selectedNotes: new Set(),
    selectedTrillZones: new Set(),
    selectedRestZones: new Set(),
    resizeHoverNoteIndex: null,
    violatingNoteIndices: new Set(violating.notes ?? []),
    violatingTrillZoneIndices: new Set(),
    violatingRestZoneIndices: new Set(),
    violatingEventIndices: new Set(violating.events ?? []),
    moveOrigins: null,
    boxSelectRect: null,
    scrollY: 0,
    contentOffsetX: 0,
    cachedBpmChanges: [{ beat: beat(0), bpm: 120 }] as BpmChange[],
    getVisibleTimeRange: () => ({ minTimeMs: -1_000_000, maxTimeMs: 1_000_000 }),
    timeToY: (ms: number) => ms / 10,
    ghostLayer: new Container(),
    hoverLayer: new Container(),
    violationLayer: new Container(),
    moveOriginLayer: new Container(),
    boxSelectLayer: new Container(),
    noteRenderer: {} as unknown as OverlayHost["noteRenderer"],
  };
  new OverlayRenderer(host).renderViolationOverlay();
  return host.violationLayer.children as Graphics[];
}

/** 해칭 Graphics의 반투명 사각형(fill)을 꺼낸다. */
function hatchRect(g: Graphics): Rectangle {
  const fills = g.context.instructions.filter(instruction => instruction.action === "fill");
  // 해칭이 그려지지 않았으면 TypeError 대신 읽을 수 있는 실패로 끝낸다.
  expect(fills).toHaveLength(1);
  return (fills[0].data as { path: GraphicsPath }).path.shapePath.shapePrimitives[0].shape as Rectangle;
}

describe("OverlayRenderer 위반 해칭 폭 — 노트 폭 NOTE_HEIGHT*5=60·LANE_WIDTH=70·EXTRA_LANE_WIDTH=80으로 서로 다른 상수", () => {
  it("editorLane 2 위반 이벤트 해칭은 x 360(TIMELINE_WIDTH 280 + EXTRA_LANE_WIDTH 80)에서 폭 80으로 그려진다", () => {
    const hatches = renderViolations(
      makeChart([], [{ type: "stop", beat: beat(0), endBeat: beat(4), editorLane: 2 }]),
      { events: [0] },
    );
    expect(hatches).toHaveLength(1);
    const rect = hatchRect(hatches[0]);
    expect(rect.x).toBe(360);
    expect(rect.width).toBe(80);
  });

  it("보조 lane 5 위반 노트 해칭은 x 280(TIMELINE_WIDTH)에서 폭 80(laneWidth(5) = EXTRA_LANE_WIDTH)으로 그려진다", () => {
    const hatches = renderViolations(makeChart([{ type: "single", lane: 5, beat: beat(0) }]), { notes: [0] });
    expect(hatches).toHaveLength(1);
    const rect = hatchRect(hatches[0]);
    expect(rect.x).toBe(280);
    expect(rect.width).toBe(80);
  });

  it("메인 lane 2 위반 노트 해칭은 x 70(laneToX(2))에서 폭 70(laneWidth(2) = LANE_WIDTH)으로 그려진다", () => {
    const hatches = renderViolations(makeChart([{ type: "single", lane: 2, beat: beat(0) }]), { notes: [0] });
    expect(hatches).toHaveLength(1);
    const rect = hatchRect(hatches[0]);
    expect(rect.x).toBe(70);
    expect(rect.width).toBe(70);
  });
});

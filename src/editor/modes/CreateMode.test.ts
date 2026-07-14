import { describe, it, expect, vi } from "vitest";
import { CreateMode, isEventEntityType } from "./CreateMode";
import { beat, validateChart, violationsInvolving } from "../../shared";
import { hitTestNoteAt } from "../timeline/hitTest";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import type { TimelineSpace } from "../timeline/TimelineSpace";
import type { Chart, NoteEntity } from "../../shared";

function makeChart(overrides?: Partial<Chart>): Chart {
  return {
    meta: { title: "", artist: "", difficultyLabel: "", difficultyLevel: 0, imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
    notes: [],
    trillZones: [],
    events: [],
    ...overrides,
  };
}

function makeCallbacks(
  _chart: Chart,
  spaceOverrides: Partial<TimelineSpace> = {},
  callbackOverrides: { isTimeInBounds?: (y: number) => boolean } = {},
) {
  return {
    onChartUpdate: vi.fn((_c: Chart) => {}),
    space: makeFakeSpace(spaceOverrides),
    isTimeInBounds: (_y: number): boolean => true,
    ...callbackOverrides,
  };
}

// ---------------------------------------------------------------------------
// handlePointerDown 배치 제약 (가드 흡수)
// ---------------------------------------------------------------------------

describe("CreateMode — handlePointerDown 배치 제약(가드 흡수)", () => {
  it("isPlacementBlocked: 점노트를 히트하면 true", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 1, beat: beat(2) }] });
    const callbacks = makeCallbacks(chart, { hitTestNote: () => 0 });
    const mode = new CreateMode(chart, callbacks);
    expect(mode.isPlacementBlocked(1, 2)).toBe(true);
  });

  it("isPlacementBlocked: 빈 곳(히트 없음)이면 false", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    expect(mode.isPlacementBlocked(1, 2)).toBe(false);
  });

  it("isPlacementBlocked: 시간 범위 밖이면 true", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart, {}, { isTimeInBounds: () => false });
    const mode = new CreateMode(chart, callbacks);
    expect(mode.isPlacementBlocked(1, 2)).toBe(true);
  });

  it("handlePointerDown: 배치 제약 통과 시 배치를 시작한다(dragging=true)", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";
    mode.handlePointerDown({ x: 1, y: 2, shiftKey: false, altKey: false, toggleSelection: false });
    expect(mode.dragging).toBe(true);
  });

  it("handlePointerDown: 배치 제약에 걸리면 배치를 시작하지 않는다(dragging=false)", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 1, beat: beat(2) }] });
    const callbacks = makeCallbacks(chart, { hitTestNote: () => 0 });
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";
    mode.handlePointerDown({ x: 1, y: 2, shiftKey: false, altKey: false, toggleSelection: false });
    expect(mode.dragging).toBe(false);
  });
});

describe("CreateMode — handlePointerUp", () => {
  it("범위 밖이면 드래그 취소 + hideGhost 신호", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart, {}, { isTimeInBounds: () => false });
    const mode = new CreateMode(chart, callbacks);
    const cancelSpy = vi.spyOn(mode, "cancelDrag");
    const result = mode.handlePointerUp({ x: 1, y: 2, shiftKey: false, altKey: false, toggleSelection: false });
    expect(cancelSpy).toHaveBeenCalled();
    expect(result.hideGhost).toBe(true);
  });

  it("범위 안이면 onPointerUp으로 배치 확정(hideGhost 없음)", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart, {}, { isTimeInBounds: () => true });
    const mode = new CreateMode(chart, callbacks);
    const upSpy = vi.spyOn(mode, "onPointerUp");
    const result = mode.handlePointerUp({ x: 1, y: 2, shiftKey: false, altKey: false, toggleSelection: false });
    expect(upSpy).toHaveBeenCalledWith(1, 2);
    expect(result.hideGhost).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// graceMode 배치 (면제 플래그 부여)
// ---------------------------------------------------------------------------

describe("CreateMode — graceMode 배치", () => {
  it("graceMode ON에서 single 배치 시 grace 플래그 부여", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";
    mode.graceMode = true;

    mode.onPointerDown(1, 2); // 통합 입력: 클릭(길이 0)=단노트
    mode.onPointerUp(1, 2);

    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect((updated.notes[0] as { grace?: boolean }).grace).toBe(true);
  });

  it("graceMode ON에서 싱글 롱노트 배치 시 바디에 holdOnly 부여, 헤드엔 미부여", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";
    mode.graceMode = true;

    mode.onPointerDown(1, 0);
    mode.onPointerUp(1, 3); // 길이 > 0

    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    const body = updated.notes.find((n) => "endBeat" in n) as { holdOnly?: boolean };
    const head = updated.notes.find((n) => !("endBeat" in n)) as { grace?: boolean };
    expect(body.holdOnly).toBe(true);
    expect(head.grace).toBeUndefined();
  });

  it("graceMode ON에서 더블 롱노트 배치 시 바디에 holdOnly 부여", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "doubleLong";
    mode.graceMode = true;

    mode.onPointerDown(1, 0);
    mode.onPointerUp(1, 3);

    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    const body = updated.notes.find((n) => "endBeat" in n) as { holdOnly?: boolean };
    expect(body.holdOnly).toBe(true);
  });

  it("graceMode OFF에서 배치 시 면제 플래그 없음", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    mode.onPointerDown(1, 2);
    mode.onPointerUp(1, 2);

    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect((updated.notes[0] as { grace?: boolean }).grace).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 통합 입력 (single/double: 클릭=단노트 / 드래그=롱노트)
// ---------------------------------------------------------------------------

describe("CreateMode — 통합 입력 (single/double)", () => {
  it("single 선택 후 클릭만(드래그 0) 하면 단노트 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    mode.onPointerDown(1, 2);
    mode.onPointerUp(1, 2); // 같은 위치 = 길이 0

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(1);
    expect(updated.notes[0].type).toBe("single");
    expect("endBeat" in updated.notes[0]).toBe(false);
  });

  it("single 선택 후 누른 채 드래그하면 헤드(single)+롱 바디 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    mode.onPointerDown(1, 2);
    mode.onPointerUp(1, 5); // 길이 > 0

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(2);
    expect(updated.notes[0].type).toBe("single"); // 헤드
    expect(updated.notes[1].type).toBe("long"); // 바디
  });

  it("double 선택 후 클릭만 하면 더블 단노트 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "double";

    mode.onPointerDown(2, 1);
    mode.onPointerUp(2, 1);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(1);
    expect(updated.notes[0].type).toBe("double");
    expect("endBeat" in updated.notes[0]).toBe(false);
  });

  it("double 선택 후 누른 채 드래그하면 더블 헤드+더블롱 바디 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "double";

    mode.onPointerDown(1, 0);
    mode.onPointerUp(1, 3);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(2);
    expect(updated.notes[0].type).toBe("double");
    expect(updated.notes[1].type).toBe("doubleLong");
  });

  it("single 선택 후 Extra 레인(1) 클릭만 하면 lane5 단노트, 드래그하면 lane5 헤드+롱이 chart.notes에 append", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart, {
      xToLane: () => null,
      xToExtraLane: (x: number) => (x >= 10 && x <= 12 ? x - 9 : null),
    });
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    // 클릭만 → 단노트 (extraLane 1 → lane 5)
    mode.onPointerDown(10, 3);
    mode.onPointerUp(10, 3);
    let notes = (callbacks.onChartUpdate.mock.calls.at(-1)?.[0] as Chart).notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: "single", lane: 5 });
    expect("endBeat" in notes[0]).toBe(false);

    // 드래그 → 헤드+롱
    mode.onPointerDown(10, 1);
    mode.onPointerUp(10, 5);
    notes = (callbacks.onChartUpdate.mock.calls.at(-1)?.[0] as Chart).notes;
    expect(notes).toHaveLength(3); // 기존 단노트1 + 헤드 + 롱
    expect(notes[1]).toMatchObject({ type: "single", lane: 5 });
    expect(notes[2]).toMatchObject({ type: "long", lane: 5 });
  });
});

// ---------------------------------------------------------------------------
// 롱노트 생성 시 헤드 노트 동작
// ---------------------------------------------------------------------------

describe("CreateMode — 롱노트 생성 시 헤드 노트", () => {
  it("길이 0인 롱노트 생성 시 헤드 노트 없이 바디만 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";

    // 클릭(pointerDown) → 같은 위치에서 pointerUp = 길이 0
    mode.onPointerDown(1, 2); // lane 1, beat(2)
    mode.onPointerUp(1, 2);  // same beat

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updatedChart = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    // 바디만 1개
    expect(updatedChart.notes).toHaveLength(1);
    expect(updatedChart.notes[0].type).toBe("long");
    expect("endBeat" in updatedChart.notes[0]).toBe(true);
  });

  it("single 입력 상태에서도 명시적 롱노트 시작은 길이 0 롱노트를 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    expect(mode.beginRangeNoteAt(1, 2, "long")).toBe(true);
    mode.onPointerUp(1, 2);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updatedChart = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updatedChart.notes).toHaveLength(1);
    expect(updatedChart.notes[0].type).toBe("long");
    expect("endBeat" in updatedChart.notes[0]).toBe(true);
  });

  it("double 입력 상태에서도 명시적 더블 롱노트 시작은 더블 헤드와 바디를 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "double";

    expect(mode.beginRangeNoteAt(1, 0, "doubleLong")).toBe(true);
    mode.onPointerUp(1, 3);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updatedChart = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updatedChart.notes).toHaveLength(2);
    expect(updatedChart.notes[0].type).toBe("double");
    expect(updatedChart.notes[1].type).toBe("doubleLong");
  });

  it("길이가 있는 롱노트 생성 시 헤드 노트 + 바디 함께 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";

    mode.onPointerDown(1, 2); // lane 1, beat(2)
    mode.onPointerUp(1, 4);  // beat(4)

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updatedChart = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    // 헤드 + 바디 = 2개
    expect(updatedChart.notes).toHaveLength(2);
    expect(updatedChart.notes[0].type).toBe("single"); // 헤드
    expect("endBeat" in updatedChart.notes[0]).toBe(false);
    expect(updatedChart.notes[1].type).toBe("long"); // 바디
    expect("endBeat" in updatedChart.notes[1]).toBe(true);
  });

  it("길이가 있는 더블 롱노트 생성 시 더블 헤드 + 바디 함께 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "doubleLong";

    mode.onPointerDown(1, 0); // lane 1, beat(0)
    mode.onPointerUp(1, 3);  // beat(3)

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updatedChart = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updatedChart.notes).toHaveLength(2);
    expect(updatedChart.notes[0].type).toBe("double");
    expect(updatedChart.notes[1].type).toBe("doubleLong");
  });

  it("길이 0인 더블 롱노트 생성 시 헤드 없이 바디만 생성", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "doubleLong";

    mode.onPointerDown(2, 1);
    mode.onPointerUp(2, 1);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updatedChart = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updatedChart.notes).toHaveLength(1);
    expect(updatedChart.notes[0].type).toBe("doubleLong");
  });

  it("역방향 드래그(끝점 < 시작점)로 길이가 있는 롱노트 생성 시 헤드 포함", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";

    mode.onPointerDown(1, 4); // beat(4)
    mode.onPointerUp(1, 2);  // beat(2) — 역방향

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updatedChart = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updatedChart.notes).toHaveLength(2);
    expect(updatedChart.notes[0].type).toBe("single");
    expect(updatedChart.notes[1].type).toBe("long");
  });
});

// ---------------------------------------------------------------------------
// Extra 레인 롱노트 생성 시 헤드 노트 동작
// ---------------------------------------------------------------------------

describe("CreateMode — Extra 레인 롱노트 생성 시 헤드 노트", () => {
  function makeExtraCallbacks(chart: Chart) {
    return makeCallbacks(chart, {
      xToLane: () => null,
      xToExtraLane: (x: number) => (x >= 10 && x <= 12 ? x - 9 : null),
    });
  }

  it("길이 0인 Extra 롱노트 생성 시 헤드 없이 lane5 바디만 chart.notes에 생성", () => {
    const chart = makeChart();
    const callbacks = makeExtraCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";

    mode.onPointerDown(10, 3); // extraLane 1, beat(3)
    mode.onPointerUp(10, 3);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const notes = (callbacks.onChartUpdate.mock.calls[0][0] as Chart).notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: "long", lane: 5 });
    expect("endBeat" in notes[0]).toBe(true);
  });

  it("길이가 있는 Extra 롱노트 생성 시 lane5 헤드 + 바디 함께 생성", () => {
    const chart = makeChart();
    const callbacks = makeExtraCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";

    mode.onPointerDown(10, 1); // extraLane 1, beat(1)
    mode.onPointerUp(10, 5);  // beat(5)

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const notes = (callbacks.onChartUpdate.mock.calls[0][0] as Chart).notes;
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ type: "single", lane: 5 });
    expect(notes[1]).toMatchObject({ type: "long", lane: 5 });
  });

  it("single 입력 상태의 명시적 롱노트 시작은 Extra 레인에도 길이 0 lane5 롱노트를 생성", () => {
    const chart = makeChart();
    const callbacks = makeExtraCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    expect(mode.beginRangeNoteAt(10, 3, "long")).toBe(true);
    mode.onPointerUp(10, 3);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const notes = (callbacks.onChartUpdate.mock.calls[0][0] as Chart).notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: "long", lane: 5 });
    expect("endBeat" in notes[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isEventEntityType 헬퍼
// ---------------------------------------------------------------------------

describe("isEventEntityType", () => {
  it("bpm, timeSignature, text, auto, stop, tutorialInput, tutorialDiagram은 이벤트 타입", () => {
    expect(isEventEntityType("bpm")).toBe(true);
    expect(isEventEntityType("timeSignature")).toBe(true);
    expect(isEventEntityType("text")).toBe(true);
    expect(isEventEntityType("auto")).toBe(true);
    expect(isEventEntityType("stop")).toBe(true);
    expect(isEventEntityType("tutorialInput")).toBe(true);
    expect(isEventEntityType("tutorialDiagram")).toBe(true);
  });

  it("single, double, long, doubleLong, trillZone은 이벤트 타입이 아님", () => {
    expect(isEventEntityType("single")).toBe(false);
    expect(isEventEntityType("double")).toBe(false);
    expect(isEventEntityType("long")).toBe(false);
    expect(isEventEntityType("doubleLong")).toBe(false);
    expect(isEventEntityType("trillZone")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Extra 레인에서 이벤트 생성
// ---------------------------------------------------------------------------

describe("CreateMode — Extra 레인에서 이벤트 생성", () => {
  function makeEventCallbacks(chart: Chart) {
    return makeCallbacks(chart, {
      xToLane: () => null,
      xToExtraLane: (x: number) => (x >= 10 && x <= 12 ? x - 9 : null),
    });
  }

  it("bpm 타입 선택 후 Extra 레인 클릭 시 BPM 이벤트 즉시 생성 (드래그 불필요)", () => {
    const chart = makeChart();
    const callbacks = makeEventCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "bpm";

    mode.onPointerDown(10, 4); // extraLane 1, beat(4)
    // 드래그 없이 바로 생성됨 — pointerUp 불필요

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.events).toHaveLength(1);
    expect(updated.events[0].type).toBe("bpm");
    expect(updated.events[0]).toHaveProperty("bpm", 120);
    expect("endBeat" in updated.events[0]).toBe(false);
  });

  it("timeSignature 타입 선택 후 Extra 레인 클릭 시 박자표 이벤트 즉시 생성", () => {
    const chart = makeChart();
    const callbacks = makeEventCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "timeSignature";

    mode.onPointerDown(10, 0); // extraLane 1, beat(0)

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.events).toHaveLength(1);
    expect(updated.events[0].type).toBe("timeSignature");
    expect(updated.events[0]).toHaveProperty("beatPerMeasure");
  });

  it("text 타입 선택 후 Extra 레인 드래그 시 TextEvent 생성 (구간)", () => {
    const chart = makeChart();
    const callbacks = makeEventCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "text";

    mode.onPointerDown(10, 2); // extraLane 1, beat(2)
    expect(mode.dragging).toBe(true);
    expect(mode.dragType).toBe("event");

    mode.onPointerUp(10, 6); // beat(6)

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.events).toHaveLength(1);
    expect(updated.events[0].type).toBe("text");
    expect(updated.events[0]).toHaveProperty("text", "New Message");
    expect("endBeat" in updated.events[0]).toBe(true);
  });

  it("auto 타입 선택 후 Extra 레인 드래그 시 auto 이벤트 생성", () => {
    const chart = makeChart();
    const callbacks = makeEventCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "auto";

    mode.onPointerDown(10, 1);
    mode.onPointerUp(10, 3);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.events[0].type).toBe("auto");
    expect("endBeat" in updated.events[0]).toBe(true);
  });

  it("stop 타입 선택 후 Extra 레인 드래그 시 stop 이벤트 생성", () => {
    const chart = makeChart();
    const callbacks = makeEventCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "stop";

    mode.onPointerDown(10, 0);
    mode.onPointerUp(10, 2);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.events[0].type).toBe("stop");
    expect("endBeat" in updated.events[0]).toBe(true);
  });

  it("tutorialInput 타입 선택 후 Extra 레인 드래그 시 L1 KeyD 입력 이벤트 생성", () => {
    const chart = makeChart();
    const callbacks = makeEventCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "tutorialInput";

    mode.onPointerDown(10, 1);
    mode.onPointerUp(10, 3);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.events[0]).toMatchObject({
      type: "tutorialInput",
      beat: beat(1),
      endBeat: beat(3),
      lane: 1,
      keyCode: "KeyD",
      keyLabel: "D",
      editorLane: 1,
    });
  });

  it("tutorialDiagram 타입 선택 후 Extra 레인 드래그 시 connected-switch 도식 이벤트 생성", () => {
    const chart = makeChart();
    const callbacks = makeEventCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "tutorialDiagram";

    mode.onPointerDown(11, 2);
    mode.onPointerUp(11, 6);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.events[0]).toMatchObject({
      type: "tutorialDiagram",
      beat: beat(2),
      endBeat: beat(6),
      diagramId: "connected-switch",
      editorLane: 2,
    });
  });

  it("이벤트 타입 선택 시 노트 레인 클릭하면 아무것도 생성되지 않음", () => {
    const chart = makeChart();
    const callbacks = makeEventCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "bpm";

    // x=1 is outside extra lane range (10~12), and xToLane returns null
    mode.onPointerDown(1, 2);

    expect(callbacks.onChartUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 파티션 깨진 통합 차트 (RFD 0018 ④d) — 통합 이동·paste 후 정규형 [...main, ...aux]가
// 깨져도 배치 제약·생성이 통합 인덱스를 오해석하지 않는다
// ---------------------------------------------------------------------------

describe("CreateMode — 파티션 깨진 통합 차트 (RFD 0018 ④d)", () => {
  // 파티션 깨진 차트: 메인 구역에 보조(lane5) 노트가 끼어 있다
  const brokenNotes: NoteEntity[] = [
    { type: "single", lane: 1, beat: beat(0) },
    { type: "single", lane: 5, beat: beat(0) }, // 보조 — 통합 이동이 남긴 제자리 lane 변경
    { type: "long", lane: 2, beat: beat(0), endBeat: beat(4) },
  ];

  /**
   * App.tsx의 CreateMode 배선 미러 (RFD 0018 ④d) — 통합 차트(chart.notes 전체)를 들고,
   * hitTestNote(메인 한정)도 chart.notes 통합 인덱스를 반환한다.
   */
  function wireCreateModeAsApp(chart: Chart) {
    const callbacks = makeCallbacks(chart, {
      hitTestNote: (x: number, y: number) =>
        x >= 1 && x <= 4 ? hitTestNoteAt(chart.notes, x, y) : null,
    });
    return { mode: new CreateMode(chart, callbacks), callbacks };
  }

  it("보조 노트가 메인 구역에 낀 차트에서 롱노트(lane2) 바디 클릭은 히트 인덱스를 오해석하지 않고 차단된다", () => {
    const chart = makeChart({ notes: brokenNotes });
    const { mode } = wireCreateModeAsApp(chart);
    // 통합 인덱스 2(long)가 메인-only 배열에 적용되면 undefined 참조로 폭발하거나 오판한다
    expect(mode.isPlacementBlocked(2, 2)).toBe(true);
  });

  it("보조 노트가 메인 구역에 낀 차트에서 빈 자리(lane3@2) 단노트 생성은 성공하고 보조 노트 위치를 재정렬하지 않는다", () => {
    const chart = makeChart({ notes: brokenNotes });
    const { mode, callbacks } = wireCreateModeAsApp(chart);
    mode.entityType = "single";

    mode.onPointerDown(3, 2);
    mode.onPointerUp(3, 2);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    // 기존 3개(순서 보존) + 새 노트 append
    expect(updated.notes.map((n) => `${n.type}:${n.lane}`)).toEqual([
      "single:1",
      "single:5",
      "long:2",
      "single:3",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 낙관적 편집 (RFD 0017) — 생성은 의미 위반이어도 조용히 커밋된다 (완전 낙관).
// 피드백은 해칭+미니맵 틱, 강제는 저장·플레이 게이트 몫.
// ---------------------------------------------------------------------------

describe("CreateMode — 생성 낙관 커밋 (RFD 0017 낙관적 편집)", () => {
  it("무관한 기존 중복(레인1)이 상주해도 빈 곳(레인2) 단노트 생성은 차단되지 않는다", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1, beat: beat(0) },
        { type: "single", lane: 1, beat: beat(0) }, // 상주 위반 — 새 노트와 무관
      ],
    });
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    mode.onPointerDown(2, 4);
    mode.onPointerUp(2, 4);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(3);
  });

  it("기존 노트와 같은 lane·beat에 단노트를 생성하면 중복 위반이어도 낙관적으로 커밋된다", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1, beat: beat(2) }],
    });
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    mode.onPointerDown(1, 2);
    mode.onPointerUp(1, 2);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(2); // 기존 1 + 중복 신규 1
    expect(updated.notes[1]).toMatchObject({ type: "single", lane: 1, beat: beat(2) });
    // 커밋된 상태가 실제로 의미 위반임을 고정 — 향후 규칙이 바뀌어 시나리오가 위반이 아니게 되면
    // 이 테스트가 "낙관 커밋"의 의미를 잃지 않도록 (리뷰 LOW).
    expect(violationsInvolving(validateChart(updated), [{ kind: "note", index: 1 }])).not.toHaveLength(0);
  });

  it("무관한 상주 위반이 있어도 롱노트(헤드+바디) 드래그 생성은 차단되지 않는다", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1, beat: beat(0) },
        { type: "single", lane: 1, beat: beat(0) },
      ],
    });
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    mode.onPointerDown(3, 2);
    mode.onPointerUp(3, 5);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(4); // 기존 2 + 헤드 + 바디
  });

  it("기존 롱노트 바디(레인1, 0~4)와 겹치는 구간(2~6)에 롱노트를 드래그 생성하면 겹침 위반이어도 헤드+바디가 커밋된다", () => {
    const chart = makeChart({
      notes: [{ type: "long", lane: 1, beat: beat(0), endBeat: beat(4) }],
    });
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";

    // 빈 beat 6에서 눌러 2로 드래그(정규화로 헤드@2·바디 2~6) — 실 UI에서 down 지점이
    // 기존 바디 위면 좌표 가드에 막히므로, 빈 곳에서 시작하는 재현 가능한 방향으로 (리뷰 LOW).
    mode.onPointerDown(1, 6);
    mode.onPointerUp(1, 2);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(3); // 기존 바디 1 + 새 헤드 + 새 바디
    expect(updated.notes[1]).toMatchObject({ type: "single", lane: 1, beat: beat(2) });
    expect(updated.notes[2]).toMatchObject({ type: "long", lane: 1, beat: beat(2), endBeat: beat(6) });
    expect(violationsInvolving(validateChart(updated), [{ kind: "note", index: 2 }])).not.toHaveLength(0);
  });

  it("기존 트릴존(레인1, 0~4)과 겹치는 구간(2~6)에 트릴존을 생성하면 겹침 위반이어도 커밋된다", () => {
    const chart = makeChart({
      trillZones: [{ lane: 1, beat: beat(0), endBeat: beat(4) }],
    });
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "trillZone";

    mode.onPointerDown(1, 2);
    mode.onPointerUp(1, 6);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.trillZones).toHaveLength(2); // 기존 1 + 겹침 신규 1
    expect(updated.trillZones[1]).toMatchObject({ lane: 1, beat: beat(2), endBeat: beat(6) });
    expect(violationsInvolving(validateChart(updated), [{ kind: "trillZone", index: 1 }])).not.toHaveLength(0);
  });

  it("같은 beat에 bpm 이벤트를 두 번 생성하면 중복 위반이어도 두 번째도 커밋된다", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart, {
      xToLane: () => null,
      xToExtraLane: (x: number) => (x >= 10 && x <= 12 ? x - 9 : null),
    });
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "bpm";

    mode.onPointerDown(10, 4); // 첫 번째 bpm@4 — 즉시 생성
    mode.onPointerDown(10, 4); // 두 번째 bpm@4 — 중복 위반이지만 커밋

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(2);
    const updated = callbacks.onChartUpdate.mock.calls[1][0] as Chart;
    expect(updated.events).toHaveLength(2); // 기존 1 + 중복 신규 1
    expect(updated.events[0]).toMatchObject({ type: "bpm", beat: beat(4) });
    expect(updated.events[1]).toMatchObject({ type: "bpm", beat: beat(4) });
    expect(violationsInvolving(validateChart(updated), [{ kind: "event", index: 1 }])).not.toHaveLength(0);
  });
});

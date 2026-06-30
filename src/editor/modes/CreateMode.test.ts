import { describe, it, expect, vi } from "vitest";
import { CreateMode, isEventEntityType } from "./CreateMode";
import { beat } from "../../shared";
import type { Chart, Beat, Lane, ExtraNoteEntity } from "../../shared";

function makeChart(overrides?: Partial<Chart>): Chart {
  return {
    meta: { title: "", artist: "", difficultyLabel: "", difficultyLevel: 0, imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
    notes: [],
    trillZones: [],
    events: [],
    ...overrides,
  };
}

function makeCallbacks(_chart: Chart, overrides?: Record<string, unknown>) {
  return {
    onChartUpdate: vi.fn((_c: Chart) => {}),
    yToBeat: (y: number): Beat => beat(y),
    snapBeat: (b: Beat): Beat => b,
    xToLane: (x: number): Lane | null => (x >= 1 && x <= 4 ? x as Lane : null),
    onWarn: vi.fn(),
    ...overrides,
  };
}

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

  it("single 선택 후 Extra 레인 클릭만 하면 단노트, 드래그하면 헤드+롱", () => {
    const chart = makeChart();
    let extraNotes: ExtraNoteEntity[] = [];
    const callbacks = {
      ...makeCallbacks(chart),
      xToLane: () => null,
      xToExtraLane: (x: number) => (x >= 10 && x <= 12 ? x - 9 : null),
      getExtraNotes: () => extraNotes,
      onExtraNotesUpdate: vi.fn((notes: ExtraNoteEntity[]) => { extraNotes = notes; }),
    };
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    // 클릭만 → 단노트
    mode.onPointerDown(10, 3);
    mode.onPointerUp(10, 3);
    let notes = callbacks.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("single");
    expect("endBeat" in notes[0]).toBe(false);

    // 드래그 → 헤드+롱
    mode.onPointerDown(10, 1);
    mode.onPointerUp(10, 5);
    notes = callbacks.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(notes).toHaveLength(3); // 기존 단노트1 + 헤드 + 롱
    expect(notes[1].type).toBe("single");
    expect(notes[2].type).toBe("long");
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
    let extraNotes: ExtraNoteEntity[] = [];
    return {
      ...makeCallbacks(chart),
      xToLane: () => null,
      xToExtraLane: (x: number) => (x >= 10 && x <= 12 ? x - 9 : null),
      getExtraNotes: () => extraNotes,
      onExtraNotesUpdate: vi.fn((notes: ExtraNoteEntity[]) => { extraNotes = notes; }),
    };
  }

  it("길이 0인 Extra 롱노트 생성 시 헤드 없이 바디만 생성", () => {
    const chart = makeChart();
    const callbacks = makeExtraCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";

    mode.onPointerDown(10, 3); // extraLane 1, beat(3)
    mode.onPointerUp(10, 3);

    expect(callbacks.onExtraNotesUpdate).toHaveBeenCalledTimes(1);
    const notes = callbacks.onExtraNotesUpdate.mock.calls[0][0];
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("long");
    expect("endBeat" in notes[0]).toBe(true);
  });

  it("길이가 있는 Extra 롱노트 생성 시 헤드 + 바디 함께 생성", () => {
    const chart = makeChart();
    const callbacks = makeExtraCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "long";

    mode.onPointerDown(10, 1); // extraLane 1, beat(1)
    mode.onPointerUp(10, 5);  // beat(5)

    expect(callbacks.onExtraNotesUpdate).toHaveBeenCalledTimes(1);
    const notes = callbacks.onExtraNotesUpdate.mock.calls[0][0];
    expect(notes).toHaveLength(2);
    expect(notes[0].type).toBe("single");
    expect(notes[1].type).toBe("long");
  });

  it("single 입력 상태의 명시적 롱노트 시작은 Extra 레인에도 길이 0 롱노트를 생성", () => {
    const chart = makeChart();
    const callbacks = makeExtraCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "single";

    expect(mode.beginRangeNoteAt(10, 3, "long")).toBe(true);
    mode.onPointerUp(10, 3);

    expect(callbacks.onExtraNotesUpdate).toHaveBeenCalledTimes(1);
    const notes = callbacks.onExtraNotesUpdate.mock.calls[0][0];
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("long");
    expect("endBeat" in notes[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isEventEntityType 헬퍼
// ---------------------------------------------------------------------------

describe("isEventEntityType", () => {
  it("bpm, timeSignature, text, auto, stop은 이벤트 타입", () => {
    expect(isEventEntityType("bpm")).toBe(true);
    expect(isEventEntityType("timeSignature")).toBe(true);
    expect(isEventEntityType("text")).toBe(true);
    expect(isEventEntityType("auto")).toBe(true);
    expect(isEventEntityType("stop")).toBe(true);
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
    return {
      ...makeCallbacks(chart),
      xToLane: () => null,
      xToExtraLane: (x: number) => (x >= 10 && x <= 12 ? x - 9 : null),
      getExtraNotes: () => [],
      onExtraNotesUpdate: vi.fn(),
    };
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

  it("text 타입 선택 후 Extra 레인 드래그 시 텍스트 이벤트 생성 (구간)", () => {
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

import { describe, it, expect, vi } from "vitest";
import { CreateMode } from "./CreateMode";
import { beat } from "../../shared";
import type { Chart, Beat, Lane } from "../../shared";

function makeChart(overrides?: Partial<Chart>): Chart {
  return {
    meta: { title: "", artist: "", bpm: 120, offset: 0, music: "" },
    notes: [],
    trillZones: [],
    events: [],
    ...overrides,
  };
}

function makeCallbacks(chart: Chart, overrides?: Record<string, unknown>) {
  return {
    onChartUpdate: vi.fn((c: Chart) => { chart = c; }),
    yToBeat: (y: number): Beat => beat(y),
    snapBeat: (b: Beat): Beat => b,
    xToLane: (x: number): Lane | null => (x >= 1 && x <= 4 ? x as Lane : null),
    xToAuxLane: () => null,
    onWarn: vi.fn(),
    ...overrides,
  };
}

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
    let extraNotes: any[] = [];
    return {
      ...makeCallbacks(chart),
      xToLane: () => null,
      xToExtraLane: (x: number) => (x >= 10 && x <= 12 ? x - 9 : null),
      getExtraNotes: () => extraNotes,
      onExtraNotesUpdate: vi.fn((notes: any[]) => { extraNotes = notes; }),
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
});

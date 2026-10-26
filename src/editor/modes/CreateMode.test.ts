import { editorChartErrors } from '../documentValidation';
import { describe, it, expect, vi } from "vitest";
import { CreateMode, isEventEntityType } from "./CreateMode";
import { beat, violationsInvolving } from "../../shared";
import { hitTestNoteAt } from "../timeline/hitTest";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import type { TimelineSpace } from "../timeline/TimelineSpace";
import type { ChartDocument, DocumentNoteEntity } from "../../shared";

function makeChart(overrides?: Partial<ChartDocument>): ChartDocument {
  return {
    meta: { title: "", artist: "", difficultyLabel: "", difficultyLevel: 0, imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
    notes: [],
    trillZones: [],
    events: [],
    ...overrides,
  };
}

function makeCallbacks(
  _chart: ChartDocument,
  spaceOverrides: Partial<TimelineSpace> = {},
  callbackOverrides: { isTimeInBounds?: (y: number) => boolean } = {},
) {
  return {
    onChartUpdate: vi.fn((_c: ChartDocument) => {}),
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

describe("CreateMode — 명시 Point·바디·릴리즈 생성", () => {
  it.each(["single", "double"] as const)("%s 입력에서 2박 클릭은 명시 Point 하나를 만든다", kind => {
    const callbacks = makeCallbacks(makeChart());
    const mode = new CreateMode(makeChart(), callbacks);
    mode.entityType = kind;
    mode.onPointerDown(1, 2); mode.onPointerUp(1, 2);
    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([{ type: "point", kind, lane: 1, beat: beat(2) }]);
  });

  it.each([
    ["single", 1, false, false], ["double", 2, false, false],
    ["single", 1, true, false], ["double", 2, true, false],
    ["single", 1, true, true], ["double", 2, false, true],
  ] as const)("%s 입력·수량 %i·Grace=%s·보조=%s에서 2→5박 드래그는 Point+바디+릴리즈를 한 번에 만든다", (kind, count, grace, aux) => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart, aux ? { xToLane: () => null, xToExtraLane: () => 1 } : {});
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = kind; mode.graceMode = grace;
    mode.onPointerDown(1, 5); mode.onPointerUp(1, 2);
    const lane = aux ? 5 : 1;
    const flags = grace ? { grace: true } : {};
    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
      { type: "point", kind, lane, beat: beat(2), ...flags },
      { type: "body", holdCount: count, lane, beat: beat(2), endBeat: beat(5) },
      { type: "release", count, lane, beat: beat(5), ...flags },
    ]);
  });

  it.each(["long", "doubleLong"] as const)("%s 바디 도구의 2→4박·길이 0·보조 생성은 Grace에서도 바디만 만든다", type => {
    for (const end of [2, 4]) for (const aux of [false, true]) {
      const chart = makeChart();
      const callbacks = makeCallbacks(chart, aux ? { xToLane: () => null, xToExtraLane: () => 1 } : {});
      const mode = new CreateMode(chart, callbacks);
      mode.entityType = type; mode.graceMode = true;
      mode.onPointerDown(1, 2); mode.onPointerUp(1, end);
      expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
        { type: "body", lane: aux ? 5 : 1, beat: beat(2), endBeat: beat(end), holdCount: type === "doubleLong" ? 2 : 1 },
      ]);
    }
  });

  it.each(["long", "doubleLong"] as const)("single 입력에서 명시 %s 시작은 2→4박에도 Point나 릴리즈를 만들지 않는다", type => {
    const chart = makeChart(); const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    expect(mode.beginRangeNoteAt(1, 2, type)).toBe(true);
    mode.onPointerUp(1, 4);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
      { type: "body", holdCount: type === "doubleLong" ? 2 : 1, lane: 1, beat: beat(2), endBeat: beat(4) },
    ]);
  });

  it.each([false, true])("0～4박 trillZone의 1→3박 드래그·Grace=%s는 트릴 Point와 바디만 만든다", grace => {
    const chart = makeChart({ trillZones: [{ lane: 1, beat: beat(0), endBeat: beat(4) }] });
    const callbacks = makeCallbacks(chart); const mode = new CreateMode(chart, callbacks);
    mode.graceMode = grace;
    mode.onPointerDown(1, 1); mode.onPointerUp(1, 3);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
      { type: "point", kind: "trill", lane: 1, beat: beat(1), ...(grace ? { grace: true } : {}) },
      { type: "body", holdCount: 1, trill: true, lane: 1, beat: beat(1), endBeat: beat(3) },
    ]);
    expect(editorChartErrors(callbacks.onChartUpdate.mock.calls[0][0])).toEqual([]);
  });

  it("single 2→5박 드래그를 취소하면 노트와 콜백을 만들지 않고 다음 클릭은 Point만 만든다", () => {
    const chart = makeChart(); const callbacks = makeCallbacks(chart); const mode = new CreateMode(chart, callbacks);
    mode.onPointerDown(1, 2); mode.cancelDrag(); mode.onPointerUp(1, 5);
    expect(callbacks.onChartUpdate).not.toHaveBeenCalled();
    mode.onPointerDown(1, 2); mode.onPointerUp(1, 2);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([{ type: "point", kind: "single", lane: 1, beat: beat(2) }]);
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

  it("single, double, long, doubleLong, trillZone, restZone은 이벤트 타입이 아님", () => {
    expect(isEventEntityType("single")).toBe(false);
    expect(isEventEntityType("double")).toBe(false);
    expect(isEventEntityType("long")).toBe(false);
    expect(isEventEntityType("doubleLong")).toBe(false);
    expect(isEventEntityType("trillZone")).toBe(false);
    expect(isEventEntityType("restZone")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Extra 레인에서 이벤트 생성
// ---------------------------------------------------------------------------

describe("CreateMode — Extra 레인에서 이벤트 생성", () => {
  function makeEventCallbacks(chart: ChartDocument) {
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
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
  const brokenNotes: DocumentNoteEntity[] = [
    { type: "single", lane: 1, beat: beat(0) },
    { type: "single", lane: 5, beat: beat(0) }, // 보조 — 통합 이동이 남긴 제자리 lane 변경
    { type: "long", lane: 2, beat: beat(0), endBeat: beat(4) },
  ];

  /**
   * App.tsx의 CreateMode 배선 미러 (RFD 0018 ④d) — 통합 차트(chart.notes 전체)를 들고,
   * hitTestNote(메인 한정)도 chart.notes 통합 인덱스를 반환한다.
   */
  function wireCreateModeAsApp(chart: ChartDocument) {
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    // 기존 3개(순서 보존) + 새 노트 append
    expect(updated.notes.map((n) => `${n.type}:${n.lane}`)).toEqual([
      "single:1",
      "single:5",
      "long:2",
      "point:3",
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.notes).toHaveLength(2); // 기존 1 + 중복 신규 1
    expect(updated.notes[1]).toMatchObject({ type: "point", kind: "single", lane: 1, beat: beat(2) });
    // 커밋된 상태가 실제로 의미 위반임을 고정 — 향후 규칙이 바뀌어 시나리오가 위반이 아니게 되면
    // 이 테스트가 "낙관 커밋"의 의미를 잃지 않도록 (리뷰 LOW).
    expect(violationsInvolving(editorChartErrors(updated), [{ kind: "note", index: 1 }])).not.toHaveLength(0);
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.notes).toHaveLength(5); // 기존 2 + Point + 바디 + 릴리즈
  });

  it("구형 롱노트 0～4박과 겹치는 2～6박에 바디 도구로 생성하면 의미 위반 바디 하나를 커밋한다", () => {
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.notes).toHaveLength(2);
    expect(updated.notes[1]).toMatchObject({ type: "body", holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(6) });
    expect(violationsInvolving(editorChartErrors(updated), [{ kind: "note", index: 1 }])).not.toHaveLength(0);
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
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.trillZones).toHaveLength(2); // 기존 1 + 겹침 신규 1
    expect(updated.trillZones[1]).toMatchObject({ lane: 1, beat: beat(2), endBeat: beat(6) });
    expect(violationsInvolving(editorChartErrors(updated), [{ kind: "trillZone", index: 1 }])).not.toHaveLength(0);
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
    const updated = callbacks.onChartUpdate.mock.calls[1][0] as ChartDocument;
    expect(updated.events).toHaveLength(2); // 기존 1 + 중복 신규 1
    expect(updated.events[0]).toMatchObject({ type: "bpm", beat: beat(4) });
    expect(updated.events[1]).toMatchObject({ type: "bpm", beat: beat(4) });
    expect(violationsInvolving(editorChartErrors(updated), [{ kind: "event", index: 1 }])).not.toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// restZone 배치 (RFD 0019 — trillZone 생성 경로 미러)
// ---------------------------------------------------------------------------

describe("CreateMode — restZone 배치 (RFD 0019)", () => {
  it("restZone entity로 레인2에 beat 0→4 드래그하면 chart.restZones에 {lane:2, beat:0, endBeat:4} 추가", () => {
    const chart = makeChart(); // restZones 필드 부재 → ?? []로 방어되는 경로
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "restZone";

    mode.onPointerDown(2, 0);
    mode.onPointerUp(2, 4);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.restZones).toHaveLength(1);
    expect(updated.restZones![0]).toMatchObject({ lane: 2, beat: beat(0), endBeat: beat(4) });
  });

  it("restZone을 클릭(무드래그, beat 4→4)하면 길이 0이라 커밋하지 않는다 (구조 위반·고스트 방지, 리뷰 C1)", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "restZone";

    mode.onPointerDown(2, 4);
    mode.onPointerUp(2, 4);

    expect(callbacks.onChartUpdate).not.toHaveBeenCalled();
  });

  it("역방향 드래그(beat 6→2)는 beat 2~6으로 정규화되어 커밋", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "restZone";

    mode.onPointerDown(1, 6);
    mode.onPointerUp(1, 2);

    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.restZones![0]).toMatchObject({ lane: 1, beat: beat(2), endBeat: beat(6) });
  });

  it("기존 restZone(레인1)이 있으면 뒤에 append — 레인3 신규 생성 시 총 2개", () => {
    const chart = makeChart({ restZones: [{ lane: 1, beat: beat(0), endBeat: beat(4) }] });
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "restZone";

    mode.onPointerDown(3, 8);
    mode.onPointerUp(3, 12);

    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.restZones).toHaveLength(2);
    expect(updated.restZones![0]).toMatchObject({ lane: 1, beat: beat(0), endBeat: beat(4) });
    expect(updated.restZones![1]).toMatchObject({ lane: 3, beat: beat(8), endBeat: beat(12) });
  });

  it("restZone은 extra 레인에서는 생성되지 않는다(가시 레인 1~4 전용)", () => {
    const chart = makeChart();
    const callbacks = makeCallbacks(chart, {
      xToLane: () => null,
      xToExtraLane: () => 1,
    });
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "restZone";

    mode.onPointerDown(10, 0);
    mode.onPointerUp(10, 4);

    expect(mode.dragging).toBe(false);
    expect(callbacks.onChartUpdate).not.toHaveBeenCalled();
  });

  it("노트(레인2, beat 2)를 덮는 restZone(0→4)을 드래그해도 낙관 커밋된다(사전 차단 없음)", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 2, beat: beat(2) }] });
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "restZone";

    mode.onPointerDown(2, 0);
    mode.onPointerUp(2, 4);

    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.restZones).toHaveLength(1);
    expect(updated.restZones![0]).toMatchObject({ lane: 2, beat: beat(0), endBeat: beat(4) });
    // 커밋된 상태가 실제로 의미 위반(restZone×노트 배타)임을 고정 — 낙관 커밋의 의미 보존
    expect(violationsInvolving(editorChartErrors(updated), [{ kind: "restZone", index: 0 }])).not.toHaveLength(0);
  });

  it("trillZone(레인2, 1~3)을 덮는 restZone(0→4)도 낙관 커밋되고 배타 위반으로 표시된다", () => {
    const chart = makeChart({ trillZones: [{ lane: 2, beat: beat(1), endBeat: beat(3) }] });
    const callbacks = makeCallbacks(chart);
    const mode = new CreateMode(chart, callbacks);
    mode.entityType = "restZone";

    mode.onPointerDown(2, 0);
    mode.onPointerUp(2, 4);

    const updated = callbacks.onChartUpdate.mock.calls[0][0] as ChartDocument;
    expect(updated.restZones).toHaveLength(1);
    expect(violationsInvolving(editorChartErrors(updated), [{ kind: "restZone", index: 0 }])).not.toHaveLength(0);
  });

  it("C+휠 엔티티 사이클: trillZone 다음은 restZone, restZone 다음은 single로 순환", () => {
    const chart = makeChart();
    const mode = new CreateMode(chart, makeCallbacks(chart));
    mode.entityType = "trillZone";

    mode.nextEntityType();
    expect(mode.entityType).toBe("restZone");

    mode.nextEntityType();
    expect(mode.entityType).toBe("single");
  });

  it("C+휠 역방향 사이클: single 이전은 restZone", () => {
    const chart = makeChart();
    const mode = new CreateMode(chart, makeCallbacks(chart));
    mode.entityType = "single";

    mode.prevEntityType();
    expect(mode.entityType).toBe("restZone");
  });
});

describe("CreateMode — 명시 릴리즈·유지 배치", () => {
  it.each(["release", "doubleRelease"] as const)("%s의 일반·Grace 단독 클릭은 수량 1/2를 하나의 항목에 보존한다", type => {
    for (const grace of [false, true]) for (const lane of [1, 7]) {
      const chart = makeChart(); const callbacks = makeCallbacks(chart, { xToUnifiedLane: () => lane });
      const mode = new CreateMode(chart, callbacks); mode.entityType = type; mode.graceMode = grace;
      mode.handlePointerDown({ x: 1, y: 2, shiftKey: false, altKey: false, toggleSelection: false });
      expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
        { type: "release", count: type === "release" ? 1 : 2, lane, beat: beat(2), ...(grace ? { grace: true } : {}) },
      ]);
    }
  });

  it.each([1, 2] as const)("holdCount=%i 바디 내부 2박에 유지를 두 번 클릭하면 그 수량의 표식 항목 하나만 만든다", holdCount => {
    const chart = makeChart({ notes: [{ type: "body", holdCount, lane: 1, beat: beat(0), endBeat: beat(4) }] });
    const callbacks = makeCallbacks(chart, { hitTestUnifiedNote: () => 0 });
    const mode = new CreateMode(chart, callbacks); mode.entityType = "sustain"; mode.graceMode = true;
    expect(mode.isPlacementBlocked(1, 2)).toBe(false);
    mode.onPointerDown(1, 2); mode.onPointerDown(1, 2);
    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
      chart.notes[0], { type: "sustain", lane: 1, beat: beat(2), count: holdCount },
    ]);
  });

  it("빈 보조 lane7의 2박 유지는 길이 0 싱글+표식1을 만들고 재클릭은 더블+표식2, 세 번째는 no-op이다", () => {
    const chart = makeChart(); const callbacks = makeCallbacks(chart, { xToUnifiedLane: () => 7 });
    const mode = new CreateMode(chart, callbacks); mode.entityType = "sustain";
    mode.onPointerDown(7, 2);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
      { type: "body", holdCount: 1, lane: 7, beat: beat(2), endBeat: beat(2) },
      { type: "sustain", count: 1, lane: 7, beat: beat(2) },
    ]);
    mode.onPointerDown(7, 2); mode.onPointerDown(7, 2);
    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(2);
    expect(callbacks.onChartUpdate.mock.calls[1][0].notes).toEqual([
      { type: "body", holdCount: 2, lane: 7, beat: beat(2), endBeat: beat(2) },
      { type: "sustain", count: 2, lane: 7, beat: beat(2) },
    ]);
  });

  it("1→2 바디 공유 경계 2박의 유지는 뒤 바디 holdCount=2를 사용한다", () => {
    const chart = makeChart({ notes: [
      { type: "body", holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(2) },
      { type: "body", holdCount: 2, lane: 1, beat: beat(2), endBeat: beat(4) },
    ] });
    const callbacks = makeCallbacks(chart); const mode = new CreateMode(chart, callbacks); mode.entityType = "sustain";
    mode.onPointerDown(1, 2);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes.at(-1)).toEqual({ type: "sustain", count: 2, lane: 1, beat: beat(2) });
  });

  it("trill 바디 0～4박의 2박에 유지를 클릭하면 표식이나 길이 0 바디를 만들지 않는다", () => {
    const chart = makeChart({ notes: [{ type: "body", trill: true, holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(4) }] });
    const callbacks = makeCallbacks(chart); const mode = new CreateMode(chart, callbacks); mode.entityType = "sustain";
    mode.onPointerDown(1, 2);
    expect(callbacks.onChartUpdate).not.toHaveBeenCalled();
  });

  it.each(["release", "doubleRelease"] as const)("trillZone 시작0·중간2·끝4박의 %s는 일반·Grace 모두 확정 후 저장 위반이다", type => {
    for (const at of [0, 2, 4]) for (const grace of [false, true]) {
      const chart = makeChart({ trillZones: [{ lane: 1, beat: beat(0), endBeat: beat(4) }] });
      const callbacks = makeCallbacks(chart); const mode = new CreateMode(chart, callbacks); mode.entityType = type; mode.graceMode = grace;
      mode.onPointerDown(1, at);
      expect(editorChartErrors(callbacks.onChartUpdate.mock.calls[0][0])).toContainEqual(expect.objectContaining({ rule: "trillExclusive", refs: expect.arrayContaining([{ kind: "note", index: 0 }]) }));
    }
  });
});

  it('터치 double 롱프레스의 1→3박 드래그도 Grace Point·바디·릴리즈 수량2를 한 번에 만든다', () => {
    const chart = makeChart(); const callbacks = makeCallbacks(chart); const mode = new CreateMode(chart, callbacks);
    mode.entityType = 'double'; mode.graceMode = true;
    expect(mode.beginPointDragAt(1, 1, 'double')).toBe(true); mode.onPointerUp(1, 3);
    expect(callbacks.onChartUpdate).toHaveBeenCalledTimes(1);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
      { type: 'point', kind: 'double', lane: 1, beat: beat(1), grace: true },
      { type: 'body', holdCount: 2, lane: 1, beat: beat(1), endBeat: beat(3) },
      { type: 'release', count: 2, lane: 1, beat: beat(3), grace: true },
    ]);
  });

  it('새 바디 0～4박 내부 2박은 Single Point 배치를 허용하고 구형 바디 생성으로 되돌리지 않는다', () => {
    const chart = makeChart({ notes: [{ type: 'body', holdCount: 1, lane: 1, beat: beat(0), endBeat: beat(4) }] });
    const callbacks = makeCallbacks(chart, { hitTestUnifiedNote: () => 0, hitTestNote: () => 0 });
    const mode = new CreateMode(chart, callbacks);
    mode.handlePointerDown({ x: 1, y: 2, shiftKey: false, altKey: false, toggleSelection: false });
    mode.onPointerUp(1, 2);
    expect(callbacks.onChartUpdate.mock.calls[0][0].notes).toEqual([
      chart.notes[0], { type: 'point', kind: 'single', lane: 1, beat: beat(2) },
    ]);
    expect(editorChartErrors(callbacks.onChartUpdate.mock.calls[0][0])).toEqual([]);
  });

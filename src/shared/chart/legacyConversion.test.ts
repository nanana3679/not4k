import { describe, expect, it } from "vitest";
import { beat } from "../types/beat";
import type {
  BodyNote, ChartDocument, DocumentNoteEntity, PointNote, RangeNote, ReleaseNote, TapNote, TickNote, TrillZone,
} from "../types/chart";
import { validateChartDocument } from "../validation/documentValidation";
import type { ValidationErrorRule } from "../validation";
import { convertLegacyChart, hasLegacyNotes, type LegacyConversionItem } from "./index";

// 박은 정수 박(beat(n))만 쓴다. 레인 1～4는 메인, 5 이후는 보조 레인이다.
const meta: ChartDocument["meta"] = { title: "t", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
  imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 };
const zone = (start: number, end: number, lane: TrillZone["lane"] = 1): TrillZone => ({ lane, beat: beat(start), endBeat: beat(end) });
const chart = (notes: DocumentNoteEntity[], trillZones: TrillZone[] = []): ChartDocument =>
  ({ meta, notes, trillZones, restZones: [], events: [{ type: "bpm", beat: beat(0), bpm: 120 }] });

// 구형 입력
const point = (type: PointNote["type"], at: number, options: { lane?: number; grace?: boolean } = {}): PointNote =>
  ({ type, lane: options.lane ?? 1, beat: beat(at), ...(options.grace ? { grace: true } : {}) });
const range = (type: RangeNote["type"], start: number, end: number, options: { lane?: number; holdOnly?: boolean } = {}): RangeNote =>
  ({ type, lane: options.lane ?? 1, beat: beat(start), endBeat: beat(end), ...(options.holdOnly ? { holdOnly: true } : {}) });

// 명시 출력
const tap = (kind: TapNote["kind"], at: number, options: { lane?: number; grace?: boolean } = {}): TapNote =>
  ({ type: "tap", kind, lane: options.lane ?? 1, beat: beat(at), ...(options.grace ? { grace: true } : {}) });
const body = (start: number, end: number, holdCount: 1 | 2 = 1, options: { lane?: number; trill?: boolean } = {}): BodyNote =>
  holdCount === 2
    ? { type: "body", lane: options.lane ?? 1, beat: beat(start), endBeat: beat(end), holdCount: 2 }
    : { type: "body", lane: options.lane ?? 1, beat: beat(start), endBeat: beat(end), holdCount: 1, ...(options.trill ? { trill: true as const } : {}) };
const release = (at: number, count: 1 | 2 = 1, lane = 1): ReleaseNote => ({ type: "release", lane, beat: beat(at), count });
const tick = (at: number, count: 1 | 2 = 1, lane = 1): TickNote => ({ type: "tick", lane, beat: beat(at), count });

const item = (kind: Exclude<LegacyConversionItem["kind"], "holdCountChangeConnection" | "violationBeforeConversion">, at: number,
  legacyItemCount: number, legacyNoteIndices: number[], lane = 1): LegacyConversionItem =>
  ({ kind, lane, beat: beat(at), legacyItemCount, legacyNoteIndices });
/** 변환 전 입력의 위반 항목. 손실 수는 세지 않아 0이다. */
const inputViolation = (rule: ValidationErrorRule, at: number, legacyNoteIndices: number[], lane = 1): LegacyConversionItem =>
  ({ kind: "violationBeforeConversion", rule, lane, beat: beat(at), legacyItemCount: 0, legacyNoteIndices });

/** 변환 결과의 구조·의미 위반 rule 이름. 빈 배열이면 저장할 수 있다. */
const violations = (document: ChartDocument) => {
  const validation = validateChartDocument(document);
  return [...validation.structural, ...validation.semantic].map(error => error.rule);
};

describe("convertLegacyChart — 구형 패턴 대응표 M1～M13", () => {
  it("M1: 구형 single 0·Grace double 1·trill 2는 kind와 Grace가 같은 탭 노트 3개로 바뀌고 보고 항목이 없다", () => {
    const result = convertLegacyChart(chart([point("single", 0), point("double", 1, { grace: true }), point("trill", 2)], [zone(2, 3)]));
    expect(result.chart.notes).toEqual([tap("single", 0), tap("double", 1, { grace: true }), tap("trill", 2)]);
    expect(result.report.items).toEqual([]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M2: 양수 길이 long [0,2]·doubleLong [4,6]·trillLong [8,10]은 같은 박의 hold 수 1·2·1(트릴) 바디가 된다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 2), range("doubleLong", 4, 6), point("trill", 8), range("trillLong", 8, 10)],
      [zone(8, 10)]));
    expect(result.chart.notes.filter(note => note.type === "body"))
      .toEqual([body(0, 2), body(4, 6, 2), body(8, 10, 1, { trill: true })]);
  });

  it("M3: head single 0이 있는 long [0,2]는 탭 노트 0·바디 [0,2]·릴리즈 2가 되고 탭 노트가 바디 시작으로 묶인다", () => {
    const result = convertLegacyChart(chart([point("single", 0), range("long", 0, 2)]));
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 2), release(2)]);
    expect(validateChartDocument(result.chart).relations.bodyByNote.get(1)?.startTapIndices).toEqual([0]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M4: head 없는 long [1,3]은 탭 노트 없이 바디 [1,3]과 릴리즈 3이 된다", () => {
    const result = convertLegacyChart(chart([range("long", 1, 3)]));
    expect(result.chart.notes).toEqual([body(1, 3), release(3)]);
    expect(result.report.items).toEqual([]);
  });

  it("M5: 끝 2가 holdOnly가 아닌 doubleLong [0,2]는 hold 수 2 바디와 count 2 릴리즈 2가 된다", () => {
    const result = convertLegacyChart(chart([point("double", 0), range("doubleLong", 0, 2)]));
    expect(result.chart.notes).toEqual([tap("double", 0), body(0, 2, 2), release(2, 2)]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M6: 사슬 끝 2가 holdOnly인 head 0 + long [0,2]는 릴리즈 없는 바디 [0,2]가 되고 보고 항목 없이 잃은 holdOnly 항목 1개만 센다", () => {
    const result = convertLegacyChart(chart([point("single", 0), range("long", 0, 2, { holdOnly: true })]));
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 2)]);
    expect(result.report.items).toEqual([]);
    expect(result.report.counts.terminalHoldOnlyItemsDropped).toBe(1);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M6: 사슬 끝 2가 holdOnly인 doubleLong [0,2]는 릴리즈 없는 hold 수 2 바디만 되고 보고 항목 없이 terminalHoldOnlyItemsDropped 2를 센다", () => {
    const result = convertLegacyChart(chart([range("doubleLong", 0, 2, { holdOnly: true })]));
    expect(result.chart.notes).toEqual([body(0, 2, 2)]);
    expect(result.report.items).toEqual([]);
    expect(result.report.counts).toEqual({ taps: 0, bodies: 1, releases: 0, ticks: 0, mergedConnections: 0, terminalHoldOnlyItemsDropped: 2 });
  });

  it("M7: head 1·2가 있는 같은 hold 수 사슬 long [0,1]→[1,2]→[2,3]은 경계 1·2에 탭 노트만 두고 사슬 끝 3에만 릴리즈를 둔다", () => {
    const result = convertLegacyChart(chart([point("single", 0), range("long", 0, 1), point("single", 1), range("long", 1, 2),
      point("single", 2), range("long", 2, 3)]));
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 1), tap("single", 1), body(1, 2), tap("single", 2), body(2, 3),
      release(3)]);
    expect(result.report.items).toEqual([]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M8: head 없는 holdOnly 끝 1로 이어진 long [0,1]→long [1,2]는 바디 [0,2] 하나와 옛 경계 1의 틱 노트, 끝 2의 릴리즈가 된다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 1, { holdOnly: true }), range("long", 1, 2)]));
    expect(result.chart.notes).toEqual([body(0, 2), tick(1), release(2)]);
    expect(result.report.counts.mergedConnections).toBe(1);
    expect(result.report.items).toEqual([]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M8: o-*-*-* 사슬(head 0 + holdOnly long [0,1]·[1,2]·[2,3])은 바디 [0,3] 하나와 틱 노트 1·2가 되고 끝 3에 릴리즈가 없다", () => {
    const result = convertLegacyChart(chart([point("single", 0), range("long", 0, 1, { holdOnly: true }),
      range("long", 1, 2, { holdOnly: true }), range("long", 2, 3, { holdOnly: true })]));
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 3), tick(1), tick(2)]);
    expect(result.report.counts.mergedConnections).toBe(2);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M8: holdOnly 끝 1로 이어진 doubleLong [0,1]→doubleLong [1,2]는 hold 수 2 바디 [0,2]와 count 2 틱 노트 1·count 2 릴리즈 2가 된다", () => {
    const result = convertLegacyChart(chart([range("doubleLong", 0, 1, { holdOnly: true }), range("doubleLong", 1, 2)]));
    expect(result.chart.notes).toEqual([body(0, 2, 2), tick(1, 2), release(2, 2)]);
    expect(violations(result.chart)).toEqual([]);
  });

  const holdCountChanges = [
    { name: "1→2 head 없음", notes: [range("long", 0, 1), range("doubleLong", 1, 2)],
      expected: [body(0, 1), body(1, 2, 2), release(2, 2)], counts: [1, 2], hasHead: false, holdOnly: false, lost: 0, indices: [0, 1] },
    { name: "1→2 head 1", notes: [range("long", 0, 1), point("single", 1), range("doubleLong", 1, 2)],
      expected: [body(0, 1), tap("single", 1), body(1, 2, 2), release(2, 2)], counts: [1, 2], hasHead: true, holdOnly: false, lost: 0, indices: [0, 2] },
    { name: "1→2 holdOnly 1", notes: [range("long", 0, 1, { holdOnly: true }), range("doubleLong", 1, 2)],
      expected: [body(0, 1), body(1, 2, 2), release(2, 2)], counts: [1, 2], hasHead: false, holdOnly: true, lost: 1, indices: [0, 1] },
    { name: "2→1 head 없음(D=-)", notes: [range("doubleLong", 0, 1), range("long", 1, 2)],
      expected: [body(0, 1, 2), body(1, 2), release(2)], counts: [2, 1], hasHead: false, holdOnly: false, lost: 1, indices: [0, 1] },
    { name: "2→1 head 1", notes: [range("doubleLong", 0, 1), point("single", 1), range("long", 1, 2)],
      expected: [body(0, 1, 2), tap("single", 1), body(1, 2), release(2)], counts: [2, 1], hasHead: true, holdOnly: false, lost: 1, indices: [0, 2] },
    { name: "2→1 holdOnly 1", notes: [range("doubleLong", 0, 1, { holdOnly: true }), range("long", 1, 2)],
      expected: [body(0, 1, 2), body(1, 2), release(2)], counts: [2, 1], hasHead: false, holdOnly: true, lost: 2, indices: [0, 1] },
  ];
  it.each(holdCountChanges)("M9: $name 연결은 두 바디만 옮기고 경계 1에 노트를 더하지 않으며 구형 점수 항목 $lost개를 잃은 증가·감소 연결로 보고한다",
    ({ notes, expected, counts, hasHead, holdOnly, lost, indices }) => {
      const result = convertLegacyChart(chart(notes));
      expect(result.chart.notes).toEqual(expected);
      expect(result.report.items).toEqual([{ kind: "holdCountChangeConnection", lane: 1, beat: beat(1),
        predecessorHoldCount: counts[0], successorHoldCount: counts[1], hasHead, predecessorHoldOnly: holdOnly,
        legacyItemCount: lost, legacyNoteIndices: indices }]);
      expect(violations(result.chart)).toEqual([]);
    });

  it("M9: double 0 + doubleLong [0,2]에서 trill 2 + trillLong [2,4](trillZone [2,4])로 이어지는 2→1 연결은 트릴 탭 노트 2만 두고 hasHead인 감소 연결로 1개 손실을 보고한다", () => {
    const input = chart([point("double", 0), range("doubleLong", 0, 2), point("trill", 2), range("trillLong", 2, 4)], [zone(2, 4)]);
    expect(violations(input)).toEqual([]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([tap("double", 0), body(0, 2, 2), tap("trill", 2), body(2, 4, 1, { trill: true })]);
    expect(result.report.items).toEqual([
      { kind: "holdCountChangeConnection", lane: 1, beat: beat(2), predecessorHoldCount: 2, successorHoldCount: 1, hasHead: true,
        predecessorHoldOnly: false, legacyItemCount: 1, legacyNoteIndices: [1, 3] },
      item("releaseOmittedTrillBodyEnd", 4, 1, [3]),
    ]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M10: head·holdOnly 없이 같은 hold 수로 맞닿은 long [0,1]→long [1,2](구형 NJ-C02 위반)는 두 바디로 옮겨 연결과 변환 전 noteConstraint를 보고하고 명시 검증도 막는다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 1), range("long", 1, 2)]));
    expect(result.chart.notes).toEqual([body(0, 1), body(1, 2), release(2)]);
    expect(result.report.items).toEqual([item("sameHoldCountConnectionWithoutHeadOrHoldOnly", 1, 0, [0, 1]),
      inputViolation("noteConstraint", 1, [0, 1])]);
    expect(violations(result.chart)).toEqual(["sameHoldCountConnectionWithoutTapOrRelease"]);
  });

  it("M11: trillZone [0,4] 안의 trill 0 + trillLong [0,2]는 트릴 탭 노트와 트릴 바디만 되고 끝 2에 릴리즈 없이 보고한다(RFD 0038)", () => {
    const result = convertLegacyChart(chart([point("trill", 0), range("trillLong", 0, 2)], [zone(0, 4)]));
    expect(result.chart.notes).toEqual([tap("trill", 0), body(0, 2, 1, { trill: true })]);
    expect(result.report.items).toEqual([item("releaseOmittedTrillBodyEnd", 2, 1, [1])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M12: 같은 레인 trillZone [4,8]의 시작 4에서 끝나는 head 0 + long [0,4]는 끝 4에 릴리즈를 두지 않고 보고한다", () => {
    const result = convertLegacyChart(chart([point("single", 0), range("long", 0, 4)], [zone(4, 8)]));
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 4)]);
    expect(result.report.items).toEqual([item("releaseOmittedInTrillZone", 4, 1, [1])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M12: 같은 레인 trillZone [2,4]의 끝 4에서 끝나는 head 0 + long [0,4]는 구간 끝을 구간 안으로 보아 끝 4에 릴리즈를 두지 않고 보고한다", () => {
    const input = chart([point("single", 0), range("long", 0, 4)], [zone(2, 4)]);
    expect(violations(input)).toEqual([]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 4)]);
    expect(result.report.items).toEqual([item("releaseOmittedInTrillZone", 4, 1, [1])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("M12: 다른 레인 2의 trillZone [4,8]은 레인 1 long [0,4]의 끝 릴리즈 4를 막지 않는다", () => {
    const result = convertLegacyChart(chart([point("single", 0), range("long", 0, 4)], [zone(4, 8, 2)]));
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 4), release(4)]);
    expect(result.report.items).toEqual([]);
  });

  it("M13: 끝 2에 single이 놓인 head 0 + long [0,2](o-o 끝)는 탭 노트 2만 두고 릴리즈를 두지 않으며 보고한다", () => {
    const result = convertLegacyChart(chart([point("single", 0), range("long", 0, 2), point("single", 2)]));
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 2), tap("single", 2)]);
    expect(result.report.items).toEqual([item("releaseOmittedTapAtEnd", 2, 1, [1])]);
    expect(violations(result.chart)).toEqual([]);
  });
});

describe("convertLegacyChart — 규칙이 바로 정하지 않은 경우", () => {
  it("(a) 보조 레인 6의 holdOnly trillLong [0,1]→trillLong [1,2]는 트릴 바디 [0,2] 하나로 합치되 zone·head 누락을 보고하고 결과의 수리도 필요하다", () => {
    const result = convertLegacyChart(chart([range("trillLong", 0, 1, { lane: 6, holdOnly: true }), range("trillLong", 1, 2, { lane: 6 })]));
    expect(result.chart.notes).toEqual([body(0, 2, 1, { lane: 6, trill: true })]);
    expect(result.report.counts.mergedConnections).toBe(1);
    expect(result.report.items).toEqual([inputViolation("trillExclusive", 0, [0], 6),
      inputViolation("trillLongInvalid", 0, [0], 6), item("holdOnlyConnectionNotTickable", 1, 1, [0, 1], 6),
      inputViolation("trillExclusive", 1, [1], 6), inputViolation("trillLongInvalid", 1, [1], 6),
      item("releaseOmittedTrillBodyEnd", 2, 1, [1], 6)]);
    expect(violations(result.chart)).toEqual(["trillExclusive", "trillLongInvalid"]);
  });

  it("(a) 보조 레인 6의 holdOnly long [0,1]→trillLong [1,2]는 바디를 합치지 않고 경계 처리와 zone·head 누락을 보고하며 결과의 수리도 필요하다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 1, { lane: 6, holdOnly: true }), range("trillLong", 1, 2, { lane: 6 })]));
    expect(result.chart.notes).toEqual([body(0, 1, 1, { lane: 6 }), body(1, 2, 1, { lane: 6, trill: true })]);
    expect(result.report.counts.mergedConnections).toBe(0);
    expect(result.report.items).toEqual([item("holdOnlyConnectionNotTickable", 1, 1, [0, 1], 6),
      inputViolation("trillExclusive", 1, [1], 6), inputViolation("trillLongInvalid", 1, [1], 6),
      item("releaseOmittedTrillBodyEnd", 2, 1, [1], 6)]);
    expect(violations(result.chart)).toEqual(["trillExclusive", "trillLongInvalid"]);
  });

  it("(e) 길이 0 long 1·doubleLong 2는 단독 릴리즈 count 1·2가 되고 길이 0 holdOnly long 3·doubleLong 4는 길이 0 바디와 count 1·2 틱 노트가 된다", () => {
    const result = convertLegacyChart(chart([range("long", 1, 1), range("doubleLong", 2, 2),
      range("long", 3, 3, { holdOnly: true }), range("doubleLong", 4, 4, { holdOnly: true })]));
    expect(result.chart.notes).toEqual([release(1), release(2, 2), body(3, 3), tick(3), body(4, 4, 2), tick(4, 2)]);
    expect(result.report.items).toEqual([]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("(e) 메인 레인에서 구형에서도 위반인 길이 0 trillLong 1은 길이 0 트릴 바디로 그대로 옮겨 trillLongInvalid로 남기고 변환 전 위반으로 보고한다", () => {
    const result = convertLegacyChart(chart([range("trillLong", 1, 1)], [zone(0, 2)]));
    expect(result.chart.notes).toEqual([body(1, 1, 1, { trill: true })]);
    expect(result.report.items).toEqual([inputViolation("trillLongInvalid", 1, [0])]);
    expect(violations(result.chart)).toEqual(["trillLongInvalid"]);
  });

  it("(f) Grace head single 0의 long [0,2]는 탭 노트 0만 Grace이고 끝 릴리즈 2는 일반이다", () => {
    const result = convertLegacyChart(chart([point("single", 0, { grace: true }), range("long", 0, 2)]));
    expect(result.chart.notes).toEqual([tap("single", 0, { grace: true }), body(0, 2), release(2)]);
  });

  it("(g) 명시 릴리즈 2가 이미 있는 구형 long [0,2]의 끝에는 릴리즈를 더하지 않고 그 릴리즈가 맡으므로 잃은 항목 0개로 보고하며 명시 노트는 같은 참조로 남긴다", () => {
    const input = chart([range("long", 0, 2), release(2)]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([body(0, 2), release(2)]);
    expect(result.chart.notes[1]).toBe(input.notes[1]);
    expect(result.report.items).toEqual([item("explicitNoteAtLegacyPosition", 2, 0, [0])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("(g) 명시 릴리즈 ×1이 있는 구형 doubleLong [0,2]의 끝 2에는 릴리즈를 더하지 않고 모자란 1몫을 잃은 항목 1개로 보고한다", () => {
    const result = convertLegacyChart(chart([range("doubleLong", 0, 2), release(2)]));
    expect(result.chart.notes).toEqual([body(0, 2, 2), release(2)]);
    expect(result.report.items).toEqual([item("explicitNoteAtLegacyPosition", 2, 1, [0])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("(g) 구형 long [0,2]의 끝 2에서 명시 바디 [2,4]가 시작하면 경계에 아무것도 더하지 않고 head 없는 같은 hold 수 연결로 보아 잃은 항목 0개로 보고한다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 2), body(2, 4), release(4)]));
    expect(result.chart.notes).toEqual([body(0, 2), body(2, 4), release(4)]);
    expect(result.report.items).toEqual([item("explicitNoteAtLegacyPosition", 2, 0, [0])]);
    expect(violations(result.chart)).toEqual(["sameHoldCountConnectionWithoutTapOrRelease"]);
  });

  it("(g) 명시 탭 노트 2와 명시 바디 [2,4]가 이어지는 구형 long [0,2]의 끝 2는 head 있는 같은 hold 수 연결로 보아 잃은 항목 0개로 보고한다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 2), tap("single", 2), body(2, 4), release(4)]));
    expect(result.chart.notes).toEqual([body(0, 2), tap("single", 2), body(2, 4), release(4)]);
    expect(result.report.items).toEqual([item("explicitNoteAtLegacyPosition", 2, 0, [0])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("(g) 명시 탭 노트 1이 있는 구형 long [0,1]→long [1,2] 경계는 head로 보아 아무것도 더하지 않고 보고하지 않는다", () => {
    const input = chart([range("long", 0, 1), tap("single", 1), range("long", 1, 2)]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([body(0, 1), tap("single", 1), body(1, 2), release(2)]);
    expect(result.chart.notes[1]).toBe(input.notes[1]);
    expect(result.report.items).toEqual([]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("보조 레인 5의 head 없는 holdOnly long [4,6]은 메인과 같은 규칙으로 릴리즈 없는 바디 [4,6]이 되고 long [0,2]에는 끝 릴리즈 2를 둔다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 2, { lane: 5 }), range("long", 4, 6, { lane: 5, holdOnly: true })]));
    expect(result.chart.notes).toEqual([body(0, 2, 1, { lane: 5 }), release(2, 1, 5), body(4, 6, 1, { lane: 5 })]);
    expect(result.report.items).toEqual([]);
    expect(result.report.counts.terminalHoldOnlyItemsDropped).toBe(1);
  });
});

describe("convertLegacyChart — 보조 레인 트릴 롱노트(사용자 결정, 2026-10-28)", () => {
  it("보조 레인 5의 head 없는 trillLong [0,2]는 바디로 옮기되 zone·head 위반을 보고하고 자동 수리하지 않는다", () => {
    const input = chart([range("trillLong", 0, 2, { lane: 5 })]);
    expect(violations(input)).toEqual(["trillExclusive", "trillLongInvalid"]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([body(0, 2, 1, { lane: 5, trill: true })]);
    expect(result.report.items).toEqual([inputViolation("trillExclusive", 0, [0], 5),
      inputViolation("trillLongInvalid", 0, [0], 5), item("releaseOmittedTrillBodyEnd", 2, 1, [0], 5)]);
    expect(violations(result.chart)).toEqual(["trillExclusive", "trillLongInvalid"]);
  });

  it.each([{ holdOnly: false }, { holdOnly: true }])(
    "보조 레인 5의 금지된 길이 0 trillLong 1(holdOnly $holdOnly)은 길이 0 트릴 바디로 옮기고 릴리즈·틱 노트 없이 1개 손실의 auxZeroLengthTrillBody와 변환 전 위반으로 보고한다",
    ({ holdOnly }) => {
      const input = chart([range("trillLong", 1, 1, { lane: 5, holdOnly })]);
      expect(violations(input)).toEqual(holdOnly
        ? ["trillExclusive", "trillLongInvalid", "trillLongInvalid"] : ["trillExclusive", "trillLongInvalid"]);
      const result = convertLegacyChart(input);
      expect(result.chart.notes).toEqual([body(1, 1, 1, { lane: 5, trill: true })]);
      expect(result.report.items).toEqual([item("auxZeroLengthTrillBody", 1, 1, [0], 5),
        inputViolation("trillExclusive", 1, [0], 5), inputViolation("trillLongInvalid", 1, [0], 5)]);
      expect(result.report.counts).toEqual({ taps: 0, bodies: 1, releases: 0, ticks: 0, mergedConnections: 0, terminalHoldOnlyItemsDropped: 0 });
      expect(violations(result.chart)).toEqual(["trillExclusive", "trillLongInvalid"]);
    });
});

describe("convertLegacyChart — 명시 노트가 섞인 입력", () => {
  it.each([
    { name: "long [2,4]", explicit: body(0, 2), legacy: range("long", 2, 4), converted: [body(2, 4), release(4)], dropped: 0 },
    { name: "holdOnly long [2,4]", explicit: body(0, 2), legacy: range("long", 2, 4, { holdOnly: true }), converted: [body(2, 4)], dropped: 1 },
    { name: "doubleLong [2,4]", explicit: body(0, 2, 2), legacy: range("doubleLong", 2, 4), converted: [body(2, 4, 2), release(4, 2)], dropped: 0 },
  ])("(a) 명시 바디 [0,2]가 끝나는 2에서 시작하는 구형 $name은 경계 2에 아무것도 더하지 않고 잃은 항목 0개로 보고하며 명시 검증이 그 경계를 막는다",
    ({ explicit, legacy, converted, dropped }) => {
      const input = chart([explicit, legacy]);
      expect(violations(input)).toEqual([]);
      const result = convertLegacyChart(input);
      expect(result.chart.notes).toEqual([explicit, ...converted]);
      expect(result.chart.notes[0]).toBe(input.notes[0]);
      expect(result.report.items).toEqual([item("explicitNoteAtLegacyPosition", 2, 0, [1])]);
      expect(result.report.counts.terminalHoldOnlyItemsDropped).toBe(dropped);
      expect(violations(result.chart)).toEqual(["sameHoldCountConnectionWithoutTapOrRelease"]);
    });

  it("(b) 명시 릴리즈 2가 있는 길이 0 long 2는 릴리즈를 더하지 않고 기존 릴리즈만 남기며 그 릴리즈가 맡으므로 잃은 항목 0개로 보고한다", () => {
    const input = chart([range("long", 2, 2), release(2)]);
    expect(violations(input)).toEqual([]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([release(2)]);
    expect(result.chart.notes[0]).toBe(input.notes[1]);
    expect(result.report.items).toEqual([item("explicitNoteAtLegacyPosition", 2, 0, [0])]);
    expect(result.report.counts.releases).toBe(0);
    expect(violations(result.chart)).toEqual([]);
  });

  it("(c) 명시 릴리즈 ×2가 있는 길이 0 holdOnly long 2는 길이 0 바디·틱 노트를 더하지 않고 릴리즈가 맡지 못하는 holdOnly 항목 1개를 잃은 것으로 보고한다", () => {
    const input = chart([range("long", 2, 2, { holdOnly: true }), release(2, 2)]);
    expect(violations(input)).toEqual([]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([release(2, 2)]);
    expect(result.report.items).toEqual([item("explicitNoteAtLegacyPosition", 2, 1, [0])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("(d) 명시 바디 [2,5]의 끝 5에 놓인 길이 0 holdOnly long 5는 길이 0 바디·틱 노트를 더하지 않고 holdOnly 항목 1개를 잃은 것으로 보고한다", () => {
    const input = chart([body(2, 5), range("long", 5, 5, { holdOnly: true })]);
    expect(violations(input)).toEqual([]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([body(2, 5)]);
    expect(result.report.items).toEqual([item("explicitNoteAtLegacyPosition", 5, 1, [1])]);
    expect(violations(result.chart)).toEqual([]);
  });
});

describe("convertLegacyChart — 변환 전 입력의 위반", () => {
  it("구형 long [0,4] 안의 single 2(구형 longOverlap)는 합법인 바디 중간 탭 노트가 되므로 레인 1 박 2의 변환 전 longOverlap으로 보고한다", () => {
    const result = convertLegacyChart(chart([point("single", 0), range("long", 0, 4), point("single", 2)]));
    expect(result.chart.notes).toEqual([tap("single", 0), body(0, 4), release(4), tap("single", 2)]);
    expect(result.report.items).toEqual([inputViolation("longOverlap", 2, [1, 2])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("holdOnly long [0,1]의 끝 1에 single이 놓인 구형 위반은 탭 노트 1과 두 바디로 옮기고 박 1의 변환 전 noteConstraint로 보고한다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 1, { holdOnly: true }), point("single", 1), range("long", 1, 2)]));
    expect(result.chart.notes).toEqual([body(0, 1), tap("single", 1), body(1, 2), release(2)]);
    expect(result.report.items).toEqual([inputViolation("noteConstraint", 1, [0, 1])]);
    expect(violations(result.chart)).toEqual([]);
  });

  it("끝이 시작보다 앞선 holdOnly long [1,0](rangeInverted)은 사슬·합침에서 빼고 구형 노트 그대로 남기며 박 1의 변환 전 rangeInverted로 보고한다", () => {
    const input = chart([range("long", 0, 1, { holdOnly: true }), range("long", 1, 0, { holdOnly: true })]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([body(0, 1), input.notes[1]]);
    expect(result.chart.notes[1]).toBe(input.notes[1]);
    expect(hasLegacyNotes(result.chart.notes)).toBe(true);
    expect(result.report.items).toEqual([inputViolation("rangeInverted", 1, [1])]);
    expect(result.report.counts).toEqual({ taps: 0, bodies: 1, releases: 0, ticks: 0, mergedConnections: 0, terminalHoldOnlyItemsDropped: 1 });
  });

  it("보조 레인 5의 head 없는 long [0,1]→trillLong [1,2](구형 NJ-C02 위반)는 두 바디로 옮겨 연결과 변환 전 noteConstraint를 보고하며 zone·시작 트릴 탭 누락은 변환 후에도 저장을 막는다", () => {
    const result = convertLegacyChart(chart([range("long", 0, 1, { lane: 5 }), range("trillLong", 1, 2, { lane: 5 })]));
    expect(result.chart.notes).toEqual([body(0, 1, 1, { lane: 5 }), body(1, 2, 1, { lane: 5, trill: true })]);
    expect(result.report.items).toEqual([
      item("sameHoldCountConnectionWithoutHeadOrHoldOnly", 1, 0, [0, 1], 5),
      inputViolation("noteConstraint", 1, [0, 1], 5),
      inputViolation("trillExclusive", 1, [1], 5), inputViolation("trillLongInvalid", 1, [1], 5),
      item("releaseOmittedTrillBodyEnd", 2, 1, [1], 5),
    ]);
    expect(violations(result.chart)).toEqual(["trillExclusive", "trillLongInvalid"]);
  });
});

describe("convertLegacyChart — 입출력 계약", () => {
  it("구형 노트가 없는 차트는 같은 참조와 모든 개수 0·항목 0개인 보고를 돌려준다", () => {
    const input = chart([tap("single", 0), body(0, 2), release(2)]);
    const result = convertLegacyChart(input);
    expect(result.chart).toBe(input);
    expect(result.report).toEqual({ counts: { taps: 0, bodies: 0, releases: 0, ticks: 0, mergedConnections: 0, terminalHoldOnlyItemsDropped: 0 }, items: [] });
  });

  it("변환 결과를 다시 변환하면 첫 결과 차트와 같은 참조를 돌려준다", () => {
    const first = convertLegacyChart(chart([point("single", 0), range("long", 0, 1, { holdOnly: true }), range("doubleLong", 1, 2)]));
    expect(convertLegacyChart(first.chart).chart).toBe(first.chart);
  });

  it("meta·trillZones·restZones·events는 같은 참조로 두고 notes만 새 배열로 바꾼다", () => {
    const input = chart([range("long", 0, 2)], [zone(4, 8)]);
    const result = convertLegacyChart(input);
    expect(result.chart.meta).toBe(input.meta);
    expect(result.chart.trillZones).toBe(input.trillZones);
    expect(result.chart.restZones).toBe(input.restZones);
    expect(result.chart.events).toBe(input.events);
    expect(result.chart.notes).not.toBe(input.notes);
  });

  it("입력 차트의 notes 배열과 각 노트를 바꾸지 않는다", () => {
    const notes = [point("single", 0), range("long", 0, 1, { holdOnly: true }), range("long", 1, 2), range("long", 3, 3)];
    const snapshot = structuredClone(notes);
    notes.forEach(note => Object.freeze(note));
    convertLegacyChart(chart(Object.freeze(notes) as DocumentNoteEntity[]));
    expect(notes).toEqual(snapshot);
  });

  it("보고 항목은 입력 순서(레인 2 박 5·레인 2 박 1·레인 1 박 3)와 관계없이 레인 1 박 3 → 레인 2 박 1 → 레인 2 박 5 순으로 정렬한다", () => {
    const result = convertLegacyChart(chart([
      range("doubleLong", 4, 5, { lane: 2 }), range("long", 5, 6, { lane: 2 }),
      range("doubleLong", 0, 1, { lane: 2 }), range("long", 1, 2, { lane: 2 }),
      range("long", 2, 3), range("doubleLong", 3, 4),
    ]));
    expect(result.report.items.map(entry => [entry.lane, entry.beat.n])).toEqual([[1, 3], [2, 1], [2, 5]]);
  });

  it("hasLegacyNotes는 보조 레인 5의 구형 long 하나만 있어도 true, 명시 노트만 있으면 false다", () => {
    expect(hasLegacyNotes([body(0, 2), range("long", 0, 2, { lane: 5 })])).toBe(true);
    expect(hasLegacyNotes([tap("single", 0), body(0, 2), release(2), tick(1)])).toBe(false);
  });

  it("o-*-*-*·Grace o-o-·D=-·트릴·길이 0 holdOnly·보조 holdOnly 예시 차트는 탭 5·바디 8·릴리즈 2·틱 3·합친 연결 2·사슬 끝 holdOnly 손실 2와 보고 2건이 되고 위반이 없다", () => {
    const input = chart([
      point("single", 0), range("long", 0, 1, { holdOnly: true }), range("long", 1, 2, { holdOnly: true }), range("long", 2, 3, { holdOnly: true }),
      point("single", 0, { lane: 2, grace: true }), range("long", 0, 1, { lane: 2 }), point("single", 1, { lane: 2 }), range("long", 1, 2, { lane: 2 }),
      point("double", 0, { lane: 3 }), range("doubleLong", 0, 1, { lane: 3 }), range("long", 1, 2, { lane: 3 }),
      point("trill", 4, { lane: 4 }), range("trillLong", 4, 6, { lane: 4 }), range("long", 8, 8, { lane: 4, holdOnly: true }),
      range("long", 4, 6, { lane: 5, holdOnly: true }),
    ], [zone(4, 6, 4)]);
    const result = convertLegacyChart(input);
    expect(result.chart.notes).toEqual([
      tap("single", 0), body(0, 3), tick(1), tick(2),
      tap("single", 0, { lane: 2, grace: true }), body(0, 1, 1, { lane: 2 }), tap("single", 1, { lane: 2 }), body(1, 2, 1, { lane: 2 }), release(2, 1, 2),
      tap("double", 0, { lane: 3 }), body(0, 1, 2, { lane: 3 }), body(1, 2, 1, { lane: 3 }), release(2, 1, 3),
      tap("trill", 4, { lane: 4 }), body(4, 6, 1, { lane: 4, trill: true }), body(8, 8, 1, { lane: 4 }), tick(8, 1, 4),
      body(4, 6, 1, { lane: 5 }),
    ]);
    expect(result.report.counts).toEqual({ taps: 5, bodies: 8, releases: 2, ticks: 3, mergedConnections: 2, terminalHoldOnlyItemsDropped: 2 });
    expect(result.report.items).toEqual([
      { kind: "holdCountChangeConnection", lane: 3, beat: beat(1), predecessorHoldCount: 2, successorHoldCount: 1,
        hasHead: false, predecessorHoldOnly: false, legacyItemCount: 1, legacyNoteIndices: [9, 10] },
      item("releaseOmittedTrillBodyEnd", 6, 1, [12], 4),
    ]);
    expect(violations(result.chart)).toEqual([]);
    expect(validateChartDocument(result.chart).canPlayExplicit).toBe(true);
  });
});

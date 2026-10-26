import { describe, expect, it } from "vitest";
import type { Chart, ChartDocument, DocumentNoteEntity } from "../types/chart";
import { beat } from "../types/beat";
import { chartDocumentFromJson, chartToJson } from "../chart";
import { validateChartDocument, validateChartDocumentStructural, validateExplicitRuntimeCompatibility } from "./documentValidation";
import { validateChart } from "./index";

const body = (start = 0, end = 4, holdCount: 1 | 2 = 1, lane = 1): DocumentNoteEntity =>
  ({ type: "body", lane, beat: beat(start), endBeat: beat(end), holdCount });
const mark = (type: "release" | "sustain", at: number, count: 1 | 2 = 1, lane = 1): DocumentNoteEntity =>
  ({ type, lane, beat: beat(at), count });
const point = (at: number, lane = 1): DocumentNoteEntity => ({ type: "point", kind: "single", lane, beat: beat(at) });
const createEmptyChart = (): Chart => ({ meta: { title: "C2", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
  imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 }, notes: [], trillZones: [],
  events: [{ type: "bpm", beat: beat(0), bpm: 120 }] });
const document = (notes: DocumentNoteEntity[]): ChartDocument => ({ ...createEmptyChart(), notes });
const rules = (notes: DocumentNoteEntity[]) => validateChartDocument(document(notes)).semantic.map(e => e.rule);

describe("명시 문서의 구조·의미·재생 진단", () => {
  it("서로 다른 레인의 구형 single과 explicit body·sustain 혼합 문서는 저장 가능하고 새 재생만 거부한다", () => {
    const chart = document([{ type: "single", lane: 2, beat: beat(1) }, body(), mark("sustain", 2)]);
    const result = validateChartDocument(chart);
    expect(result.structural).toEqual([]);
    expect(result.semantic).toEqual([]);
    expect(result.canSave).toBe(true);
    expect(result.canPlayExplicit).toBe(false);
    expect(result.runtimeIncompatible[0].refs).toEqual([{ kind: "note", index: 0 }]);
    expect(chartDocumentFromJson(chartToJson(chart)).notes).toEqual(chart.notes);
  });

  it("구형 노트만 있는 문서는 기존 validator의 규칙·refs를 그대로 유지한다", () => {
    const chart = createEmptyChart();
    chart.notes = [{ type: "single", lane: 1, beat: beat(2) }, { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateChartDocument(chart).semantic).toEqual(validateChart(chart));
  });

  it("legacy subset의 중복은 문서 원본 index 1·3으로 refs와 메시지를 반환한다", () => {
    const result = validateChartDocument(document([body(0, 4, 1, 4),
      { type: "single", lane: 1, beat: beat(1) }, point(2, 2), { type: "double", lane: 1, beat: beat(1) }]));
    const duplicate = result.semantic.find(e => e.rule === "duplicate");
    expect(duplicate?.refs).toEqual([{ kind: "note", index: 1 }, { kind: "note", index: 3 }]);
    expect(duplicate?.message).toContain("notes 1, 3");
  });

  it.each([0, 0.5, -1, NaN, Infinity])("lane=%s의 explicit body는 구조 위반이며 수리용 객체를 변경하지 않는다", lane => {
    const chart = document([body(0, 4, 1, lane)]);
    expect(validateChartDocument(chart).structural.map(e => e.rule)).toContain("laneMalformed");
    expect(chart.notes[0].lane).toBe(lane);
  });

  it("역전 body 4→2와 분모0 sustain은 구조 오류이며 의미 오류로 바꾸지 않는다", () => {
    const chart = document([body(4, 2), { type: "sustain", lane: 1, beat: { n: 1, d: 0 }, count: 1 }]);
    const result = validateChartDocument(chart);
    expect(result.structural.map(e => e.rule)).toEqual(expect.arrayContaining(["rangeInverted", "beatMalformed"]));
    expect(result.semantic).toEqual([]);
    expect(result.canSave).toBe(false);
  });

  it("저장 왕복에서 0박이 되는 explicit Point n=0.5와 음수 분모 body 끝 d=-2는 beatMalformed 구조 위반이다", () => {
    const chart = document([{ type: "point", kind: "single", lane: 1, beat: { n: 0.5, d: 1 } },
      { type: "body", lane: 2, beat: beat(0), endBeat: { n: 1, d: -2 }, holdCount: 1 }]);
    const result = validateChartDocument(chart);
    expect(result.structural.map(e => [e.rule, e.refs])).toEqual([
      ["beatMalformed", [{ kind: "note", index: 0 }]], ["beatMalformed", [{ kind: "note", index: 1 }]]]);
    expect(result.canSave).toBe(false);
  });

  it("문서의 trillZone 끝 n=4.5와 stop 이벤트 시작 n=2.5도 beatMalformed 구조 위반이다", () => {
    const chart = document([point(1)]);
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: { n: 4.5, d: 1 } }];
    chart.events.push({ type: "stop", beat: { n: 2.5, d: 1 }, endBeat: beat(3) });
    const result = validateChartDocument(chart);
    expect(result.structural.filter(e => e.rule === "beatMalformed").map(e => e.refs))
      .toEqual([[{ kind: "trillZone", index: 0 }], [{ kind: "event", index: 1 }]]);
    expect(result.canSave).toBe(false);
  });

  it("JS 경계에서 sustain count3·double trill body는 noteMalformed 구조 진단이다", () => {
    const notes = [{ type: "sustain", lane: 1, beat: beat(0), count: 3 },
      { type: "body", lane: 2, beat: beat(0), endBeat: beat(4), holdCount: 2, trill: true }] as unknown as DocumentNoteEntity[];
    expect(validateChartDocumentStructural(document(notes)).map(e => e.rule)).toEqual(["noteMalformed", "noteMalformed"]);
  });

  it.each([
    { ...body(), holdOnly: false }, { ...body(), grace: false },
    { ...mark("sustain", 2), grace: true }, { ...mark("release", 4), holdOnly: true },
    { ...point(2), count: 2 }, { ...body(), unexpected: "유실 금지" },
  ])("JS 우회 노트의 지원하지 않는 속성 $type은 noteMalformed이며 codec과 검증을 일치시킨다", raw => {
    const chart = document([raw as unknown as DocumentNoteEntity]);
    const result = validateChartDocument(chart);
    expect(result.structural.map(e => e.rule)).toContain("noteMalformed");
    expect(result.canSave).toBe(false);
    expect(chart.notes[0]).toBe(raw);
  });

  it.each([null, undefined, 3, {}, { type: "body", lane: 1, beat: beat(0), holdCount: 1 },
    { type: "body", lane: 1, beat: null, endBeat: beat(2), holdCount: 1 },
    { type: "body", lane: 1, beat: beat(0), endBeat: {}, holdCount: 1 },
  ])("누락·잘못된 raw shape %j는 관계 계산으로 throw하지 않고 구조 진단을 반환한다", raw => {
    const result = validateChartDocument(document([raw as unknown as DocumentNoteEntity, body(2, 4)]));
    expect(result.structural.length).toBeGreaterThan(0);
    expect(result.structural[0].refs).toEqual([{ kind: "note", index: 0 }]);
    expect(result.relations.bodies).toEqual([]);
    expect(result.semantic).toEqual([]);
    expect(result.canSave).toBe(false);
  });

  it.each([0, 2, 4])("body [0,4]의 sustain %s는 양 끝을 포함해 유효하다", at => {
    expect(rules([body(), mark("sustain", at)])).toEqual([]);
  });
  it.each([-1, 5])("body [0,4] 밖 sustain %s는 의미 위반으로 보존한다", at => {
    const chart = document([body(), mark("sustain", at)]);
    expect(validateChartDocument(chart).semantic.map(e => e.rule)).toContain("sustainPlacement");
    expect(chartDocumentFromJson(chartToJson(chart)).notes).toEqual(chart.notes);
  });
  it("double body에 single sustain은 sustainCount지만 single release는 허용한다", () => {
    expect(rules([body(0, 4, 2), mark("sustain", 2)])).toEqual(["sustainCount"]);
    expect(rules([body(0, 4, 2), mark("release", 4)])).toEqual([]);
  });
  it("single body의 double release 수량2는 수량1로 제한하거나 보정하지 않는다", () => {
    expect(rules([body(), mark("release", 4, 2)])).toEqual([]);
  });
  it.each([[1, 2], [2, 1]] as const)("%s→%s 경계 유지 표식은 뒤 바디 hold 수를 사용한다", (before, after) => {
    expect(rules([body(0, 2, before), body(2, 4, after), mark("sustain", 2, after)])).toEqual([]);
  });
  it.each([1, 2] as const)("%s→같은 수 연결점의 sustain은 의미 위반이고 표식 없는 경계는 유효하다", count => {
    expect(rules([body(0, 2, count), body(2, 4, count)])).toEqual([]);
    expect(rules([body(0, 2, count), body(2, 4, count), mark("sustain", 2, count)])).toEqual(["sustainPlacement"]);
  });
  it.each([1, 2] as const)("길이0 body hold%s는 단독·동일 수 sustain과 유효하다", count => {
    expect(rules([body(2, 2, count)])).toEqual([]);
    expect(rules([body(2, 2, count), mark("sustain", 2, count)])).toEqual([]);
  });
  it.each(["point", "release"] as const)("길이0 body+%s는 zeroBodyScore 의미 위반이다", kind => {
    expect(rules([body(2, 2), kind === "point" ? point(2) : mark("release", 2)])).toContain("zeroBodyScore");
  });
  it.each([["point", "release"], ["point", "sustain"], ["release", "sustain"]] as const)("같은 위치의 %s+%s는 scoreOverlap이다", (a, b) => {
    const note = (kind: typeof a | typeof b) => kind === "point" ? point(4) : mark(kind, 4);
    expect(rules([body(), note(a), note(b)])).toContain("scoreOverlap");
  });
  it("같은 sustain 4/2=2/1 두 노트는 double이 아니라 duplicate다", () => {
    expect(rules([body(), mark("sustain", 2), { type: "sustain", lane: 1, beat: { n: 4, d: 2 }, count: 1 }])).toEqual(["duplicate"]);
  });
  it.each([0, 2])("body [0,4]의 끝이 아닌 release %s는 바디 밖 단독으로 해석하지 않는다", at => {
    expect(rules([body(), mark("release", at)])).toEqual(["releasePlacement"]);
  });
  it("release는 body 끝4·공유 경계4·바깥6에서 유효하고 바디 내부 Point2도 허용한다", () => {
    expect(rules([body(), body(4, 8), mark("release", 4), mark("release", 10), point(2)])).toEqual([]);
  });
  it("겹친 body [0,4]·[1,3]은 longOverlap이며 경계가 같은 복제 body는 duplicate다", () => {
    expect(rules([body(), body(1, 3)])).toContain("longOverlap");
    expect(rules([body(), body()])).toContain("duplicate");
  });
  it("메인1과 보조5의 위치 규칙은 각각 검사하되 legacy aux만으로 새 재생을 거부하지 않는다", () => {
    expect(validateExplicitRuntimeCompatibility(document([{ type: "long", lane: 5, beat: beat(0), endBeat: beat(4) }]))).toEqual([]);
    expect(rules([body(0, 4, 1, 5), mark("release", 2, 1, 5)])).toEqual(["releasePlacement"]);
  });
  it("stop [2,3]은 main Point2를 막고 aux Point2와 관통 body [0,4]는 허용한다", () => {
    const chart = document([body(), point(2), point(2, 5)]);
    chart.events.push({ type: "stop", beat: beat(2), endBeat: beat(3) });
    const errors = validateChartDocument(chart).semantic;
    expect(errors.filter(e => e.rule === "stopZone").map(e => e.refs?.[0])).toEqual([{ kind: "note", index: 1 }]);
  });
  it("restZone (1,3)은 main body를 막되 경계 Point1·3과 다른 aux lane은 허용한다", () => {
    const chart = document([body(), point(1), point(3), body(0, 4, 1, 5)]);
    chart.restZones = [{ lane: 1, beat: beat(1), endBeat: beat(3) }];
    expect(validateChartDocument(chart).semantic.filter(e => e.rule === "restZoneExclusive").map(e => e.refs?.[1]))
      .toEqual([{ kind: "note", index: 0 }]);
  });

  it("trillZone [0,4]의 트릴 body 끝3 릴리즈도 trillExclusive이며 저장·새 재생을 막는다", () => {
    const chart = document([{ type: "point", kind: "trill", lane: 1, beat: beat(1) },
      { type: "body", lane: 1, beat: beat(1), endBeat: beat(3), holdCount: 1, trill: true }, mark("release", 3)]);
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    const result = validateChartDocument(chart);
    expect(result.semantic.map(e => [e.rule, e.refs])).toEqual([["trillExclusive", [{ kind: "note", index: 2 }]]]);
    expect(result.runtimeIncompatible).toEqual([]);
    expect(result.canSave).toBe(false);
    expect(result.canPlayExplicit).toBe(false);
  });

  const zoneReleases = [0, 2, 4].flatMap(at => ([1, 2] as const).flatMap(count =>
    [false, true].flatMap(grace => [false, true].map(attached => ({ at, count, grace, attached })))));
  it.each(zoneReleases)("zone [0,4]의 $at박 release count$count·Grace=$grace·바디끝=$attached는 의미 위반이다", ({ at, count, grace, attached }) => {
    const before: DocumentNoteEntity[] = !attached ? [] : at === 0 ? [point(-2), body(-2, 0)] : [
      { type: "point", kind: "trill", lane: 1, beat: beat(0) },
      { type: "body", lane: 1, beat: beat(0), endBeat: beat(at), holdCount: 1, trill: true }];
    const chart = document([...before, { type: "release", lane: 1, beat: beat(at), count, grace }]);
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    const result = validateChartDocument(chart);
    expect(result.semantic).toEqual([expect.objectContaining({ rule: "trillExclusive", refs: [{ kind: "note", index: before.length }] })]);
    expect(result.runtimeIncompatible).toEqual([]);
    expect(result.canSave).toBe(false);
    expect(result.canPlayExplicit).toBe(false);
  });

  it("zone [0,4] 밖 release -1·5와 다른 main lane2·aux lane5의 release2는 유효하다", () => {
    const chart = document([mark("release", -1), mark("release", 5), mark("release", 2, 2, 2), mark("release", 2, 2, 5)]);
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateChartDocument(chart)).toMatchObject({ canSave: true, canPlayExplicit: true, semantic: [], runtimeIncompatible: [] });
  });

  it("구형 trill Point+양수 trillLong holdOnly는 기존 배치 의미를 보존하고 새 runtime만 거부한다", () => {
    const chart: Chart = { ...createEmptyChart(), notes: [{ type: "trill", lane: 1, beat: beat(1) },
      { type: "trillLong", lane: 1, beat: beat(1), endBeat: beat(3), holdOnly: true }],
    trillZones: [{ lane: 1, beat: beat(0), endBeat: beat(4) }] };
    expect(validateChart(chart)).toEqual([]);
    expect(validateChartDocument(chart)).toMatchObject({ canSave: true, canPlayExplicit: false, semantic: [] });
    expect(chart.notes[1]).toMatchObject({ type: "trillLong", holdOnly: true });
  });

  it("트릴 바디는 시작 트릴 Point가 없거나 길이0이면 trillLongInvalid다", () => {
    for (const end of [1, 3]) {
      const chart = document([{ type: "body", lane: 1, beat: beat(1), endBeat: beat(end), holdCount: 1, trill: true }]);
      chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
      expect(validateChartDocument(chart).semantic.map(e => e.rule)).toContain("trillLongInvalid");
    }
  });

  it("트릴 바디 [1,3]이 서로 다른 zone [0,2]·[2,4]를 걸치면 trillExclusive다", () => {
    const chart = document([{ type: "point", kind: "trill", lane: 1, beat: beat(1) },
      { type: "body", lane: 1, beat: beat(1), endBeat: beat(3), holdCount: 1, trill: true }]);
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(2) }, { lane: 1, beat: beat(2), endBeat: beat(4) }];
    expect(validateChartDocument(chart).semantic.find(e => e.rule === "trillExclusive")?.refs).toEqual([{ kind: "note", index: 1 }]);
  });

  it("트릴 바디 내부 sustain은 sustainPlacement이며 일반 Point의 zone배타도 보존한다", () => {
    const chart = document([{ type: "point", kind: "trill", lane: 1, beat: beat(1) },
      { type: "body", lane: 1, beat: beat(1), endBeat: beat(3), holdCount: 1, trill: true }, mark("sustain", 2), point(2, 2)]);
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }, { lane: 2, beat: beat(0), endBeat: beat(4) }];
    const result = validateChartDocument(chart);
    expect(result.semantic.filter(e => e.rule === "sustainPlacement")[0].refs)
      .toEqual([{ kind: "note", index: 2 }, { kind: "note", index: 1 }]);
    expect(result.semantic.filter(e => e.rule === "trillExclusive").flatMap(e => e.refs ?? []))
      .toEqual([{ kind: "note", index: 2 }, { kind: "note", index: 3 }]);
  });

  it("보조 lane5의 트릴 Point·body는 zone과 head를 요구하지 않는다", () => {
    expect(rules([{ type: "body", lane: 5, beat: beat(1), endBeat: beat(3), holdCount: 1, trill: true },
      { type: "point", kind: "trill", lane: 5, beat: beat(2) }])).toEqual([]);
  });

  it("explicit Point와 legacy single의 같은 위치는 duplicate이며 원본 index0·2를 가리킨다", () => {
    const result = validateChartDocument(document([point(2), body(0, 4, 1, 3), { type: "single", lane: 1, beat: { n: 8, d: 4 } }]));
    expect(result.semantic[0]).toMatchObject({ rule: "duplicate", refs: [{ kind: "note", index: 0 }, { kind: "note", index: 2 }] });
  });

  it("구형 holdOnly long [0,4] 끝 4의 Point는 구형 single이든 명시 Point든 noteConstraint이고 저장을 막는다", () => {
    const holdOnly: DocumentNoteEntity = { type: "long", lane: 1, beat: beat(0), endBeat: beat(4), holdOnly: true };
    expect(rules([holdOnly, { type: "single", lane: 1, beat: beat(4) }])).toEqual(["noteConstraint"]);
    const result = validateChartDocument(document([holdOnly, point(4)]));
    expect(result.semantic.map(e => [e.rule, e.refs])).toEqual([
      ["noteConstraint", [{ kind: "note", index: 0 }, { kind: "note", index: 1 }]]]);
    expect(result.canSave).toBe(false);
  });

  it("구형 길이 0 long [2,2]와 같은 박 2의 명시 Point는 noteConstraint이고 저장을 막는다", () => {
    const result = validateChartDocument(document([point(2), { type: "long", lane: 1, beat: beat(2), endBeat: beat(2) }]));
    expect(result.semantic.map(e => [e.rule, e.refs])).toEqual([
      ["noteConstraint", [{ kind: "note", index: 1 }, { kind: "note", index: 0 }]]]);
    expect(result.canSave).toBe(false);
  });

  it("맞닿은 구형 long [0,2]·[2,4]는 경계 2의 명시 Point를 head로 인식하고 head가 없으면 noteConstraint다", () => {
    const ranges: DocumentNoteEntity[] = [{ type: "long", lane: 1, beat: beat(0), endBeat: beat(2) },
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(4) }];
    expect(rules(ranges)).toEqual(["noteConstraint"]);
    expect(rules([...ranges, point(2)])).toEqual([]);
  });

  it("구형 trillLong [1,3]은 시작 1의 명시 트릴 Point를 head로 인식해 trillLongInvalid가 아니다", () => {
    const chart = document([{ type: "trillLong", lane: 1, beat: beat(1), endBeat: beat(3) },
      { type: "point", kind: "trill", lane: 1, beat: beat(1) }]);
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateChartDocument(chart).semantic).toEqual([]);
  });

  it("의미 위반 sustain을 유효한 body로 옮겨 수리하면 canSave가 false→true가 된다", () => {
    const invalid = document([body(), mark("sustain", 6)]);
    expect(validateChartDocument(invalid).canSave).toBe(false);
    const repaired = { ...invalid, notes: [invalid.notes[0], mark("sustain", 2)] };
    expect(validateChartDocument(repaired)).toMatchObject({ canSave: true, canPlayExplicit: true });
  });
});

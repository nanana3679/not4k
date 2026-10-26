import { describe, expect, it } from "vitest";
import { beat } from "../types/beat";
import type { ChartDocument, DocumentNoteEntity } from "../types/chart";
import { isGraceNote, isHoldOnlyNote } from "../types/chart";
import {
  auxNotesAsExtra, chartDocumentFromJson, chartFromJson, chartToJson,
  deserializeChart, deserializeChartDocument, mainNotes, parseExtraNotes,
  parseExtraNotesDocument, serializeChart, serializeExtraNotes, withAuxNotes,
  ChartFormatError, UnsupportedChartContentError,
} from "./index";
import type { ChartJson } from "./index";

function document(notes: DocumentNoteEntity[]): ChartDocument {
  return {
    meta: {
      title: "C1 혼합 차트", artist: "제작자", difficultyLabel: "EXPERT", difficultyLevel: 17,
      imageFile: "jacket.png", audioFile: "audio.ogg", previewAudioFile: "preview.wav",
      offsetMs: -25, previewStart: 1.25, previewEnd: 18.75,
    },
    notes,
    trillZones: [{ lane: 3, beat: beat(0), endBeat: beat(4) }],
    restZones: [{ lane: 4, beat: beat(2), endBeat: beat(8) }],
    events: [
      { type: "bpm", beat: beat(0), bpm: 123, editorLane: 1 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(7, 2), editorLane: 2 },
      { type: "text", beat: beat(1, 3), endBeat: beat(5, 3), text: "유니코드 설명", editorLane: 3 },
      { type: "auto", beat: beat(2), endBeat: beat(3), editorLane: 4 },
      { type: "stop", beat: beat(4), endBeat: beat(5), editorLane: 5 },
      { type: "tutorialInput", beat: beat(6), endBeat: beat(7), lane: 2, keyCode: "KeyF", keyLabel: "F", editorLane: 6 },
      { type: "tutorialDiagram", beat: beat(8), endBeat: beat(9), diagramId: "connected-overlap", editorLane: 7 },
    ],
  };
}

const cases: [string, DocumentNoteEntity][] = [
  ["싱글 Point", { type: "point", kind: "single", lane: 1, beat: beat(1, 3) }],
  ["더블 Grace Point", { type: "point", kind: "double", lane: 1, beat: beat(1, 3), grace: true }],
  ["트릴 일반 Point", { type: "point", kind: "trill", lane: 3, beat: beat(1, 3), grace: false }],
  ["holdCount=1 양수 바디", { type: "body", lane: 1, beat: beat(1, 3), endBeat: beat(5, 3), holdCount: 1 }],
  ["holdCount=2 양수 바디", { type: "body", lane: 1, beat: beat(1, 3), endBeat: beat(5, 3), holdCount: 2 }],
  ["holdCount=1 길이 0 바디", { type: "body", lane: 1, beat: beat(1, 3), endBeat: beat(1, 3), holdCount: 1 }],
  ["holdCount=2 길이 0 바디", { type: "body", lane: 1, beat: beat(1, 3), endBeat: beat(1, 3), holdCount: 2 }],
  ["holdCount=1 트릴 바디", { type: "body", lane: 3, beat: beat(1, 3), endBeat: beat(5, 3), holdCount: 1, trill: true }],
  ["count=1 일반 릴리즈", { type: "release", lane: 1, beat: beat(5, 3), count: 1 }],
  ["count=2 일반 릴리즈", { type: "release", lane: 1, beat: beat(5, 3), count: 2, grace: false }],
  ["count=1 Grace 릴리즈", { type: "release", lane: 1, beat: beat(5, 3), count: 1, grace: true }],
  ["count=2 Grace 릴리즈", { type: "release", lane: 1, beat: beat(5, 3), count: 2, grace: true }],
  ["count=1 유지", { type: "sustain", lane: 1, beat: beat(1), count: 1 }],
  ["count=2 유지", { type: "sustain", lane: 1, beat: beat(1), count: 2 }],
];

describe("C1 명시 문서 왕복", () => {
  it.each(cases)("%s를 v4로 저장하면 수량·Grace·박·메타데이터·모든 이벤트를 보존한다", (_name, note) => {
    const source = document([note]);
    const json = chartToJson(source);
    expect(json.version).toBe(4);
    expect(chartDocumentFromJson(json)).toEqual(source);
    expect(deserializeChartDocument(serializeChart(source))).toEqual(source);
  });

  it.each(cases)("%s를 lane 7 보조 파일에 저장하면 extraLane 3과 의미·dirty 스냅샷을 보존한다", (_name, note) => {
    const source = [{ ...note, lane: 7 }];
    const extraJson = serializeExtraNotes(auxNotesAsExtra(source), 4);
    const parsed = parseExtraNotesDocument(JSON.parse(extraJson));
    expect(JSON.parse(extraJson).version).toBe(4);
    expect(parsed.extraLaneCount).toBe(4);
    expect(withAuxNotes([], parsed.extraNotes)).toEqual(source);
    expect(serializeExtraNotes(parsed.extraNotes, parsed.extraLaneCount)).toBe(extraJson);
  });

  it("구형 holdOnly·Grace와 신형 4종이 섞인 main/aux는 재저장 바이트와 의미를 보존한다", () => {
    const source = document([
      { type: "double", lane: 2, beat: beat(0), grace: true },
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(1), holdOnly: true },
      ...cases.map(([, note]) => note),
      { type: "single", lane: 5, beat: beat(0), grace: true },
      { type: "doubleLong", lane: 8, beat: beat(2), endBeat: beat(2), holdOnly: true },
      ...cases.map(([, note]) => ({ ...note, lane: 6 })),
    ]);
    const main = serializeChart({ ...source, notes: mainNotes(source.notes) });
    const aux = serializeExtraNotes(auxNotesAsExtra(source.notes), 4);
    const parsed = deserializeChartDocument(main);
    const extra = parseExtraNotesDocument(JSON.parse(aux));
    const merged = { ...parsed, notes: withAuxNotes(parsed.notes, extra.extraNotes) };
    expect(merged).toEqual(source);
    expect(serializeChart({ ...merged, notes: mainNotes(merged.notes) })).toBe(main);
    expect(serializeExtraNotes(auxNotesAsExtra(merged.notes), extra.extraLaneCount)).toBe(aux);
    merged.notes[2] = { type: "point", kind: "double", lane: 1, beat: beat(1, 3) };
    expect(serializeChart({ ...merged, notes: mainNotes(merged.notes) })).not.toBe(main);
  });

  it("holdCount=1 바디와 count=2 릴리즈를 왕복해도 수량을 자동 보정하지 않는다", () => {
    const source = document([
      { type: "body", lane: 1, beat: beat(0), endBeat: beat(2), holdCount: 1 },
      { type: "release", lane: 1, beat: beat(2), count: 2, grace: true },
      { type: "body", lane: 2, beat: beat(0), endBeat: beat(2), holdCount: 2 },
      { type: "release", lane: 2, beat: beat(2), count: 1 },
    ]);
    expect(deserializeChartDocument(serializeChart(source))).toEqual(source);
  });

  it("맞닿은 바디 2개와 길이 0 바디만 읽으면 경계를 보존하고 점수 노트를 추가하지 않는다", () => {
    const source = document([
      { type: "body", lane: 1, beat: beat(0), endBeat: beat(2), holdCount: 1 },
      { type: "body", lane: 1, beat: beat(2), endBeat: beat(4), holdCount: 1 },
      { type: "body", lane: 2, beat: beat(0), endBeat: beat(0), holdCount: 2 },
    ]);
    expect(deserializeChartDocument(serializeChart(source)).notes).toEqual(source.notes);
  });

  it("바디 밖 유지·내부 릴리즈·길이 0+Point 위반도 수리를 위해 그대로 읽고 dirty 직렬화한다", () => {
    const source = document([
      { type: "sustain", lane: 1, beat: beat(8), count: 2 },
      { type: "body", lane: 2, beat: beat(0), endBeat: beat(4), holdCount: 1 },
      { type: "release", lane: 2, beat: beat(2), count: 1 },
      { type: "body", lane: 3, beat: beat(0), endBeat: beat(0), holdCount: 1 },
      { type: "point", lane: 3, beat: beat(0), kind: "single" },
    ]);
    const snapshot = serializeChart(source);
    expect(serializeChart(deserializeChartDocument(snapshot))).toBe(snapshot);
  });

  it.each(["long", "body"])("%s의 lane=0·비정수 lane·역전 구간도 읽어 수리할 수 있고 숫자와 박을 보존한다", (type) => {
    const source = { ...chartToJson(document([])), version: 4, notes: [
      { type, lane: 0, beat: "2", endBeat: "1", ...(type === "body" ? { holdCount: 1 } : { holdOnly: true }) },
      { type: "single", lane: 1.5, beat: "0" },
    ] };
    const parsed = deserializeChartDocument(JSON.stringify(source));
    expect(parsed.notes[0]).toMatchObject({ lane: 0, beat: beat(2), endBeat: beat(1) });
    expect(parsed.notes[1].lane).toBe(1.5);
    expect(deserializeChartDocument(serializeChart(parsed)).notes).toEqual(parsed.notes);
  });

  it("구형·명시 Grace 릴리즈는 true이고 바디·유지는 Grace/holdOnly가 아니다", () => {
    expect(isGraceNote({ type: "release", lane: 1, beat: beat(0), count: 2, grace: true })).toBe(true);
    expect(isGraceNote({ type: "body", lane: 1, beat: beat(0), endBeat: beat(0), holdCount: 1 })).toBe(false);
    expect(isHoldOnlyNote({ type: "sustain", lane: 1, beat: beat(0), count: 1 })).toBe(false);
  });

  it("명시 릴리즈 Grace·수량·구형/신형 의미·메타·보조 레인 수 변경은 각각 dirty 스냅샷을 바꾼다", () => {
    const source = document([{ type: "release", lane: 1, beat: beat(0), count: 1 }]);
    const snapshot = serializeChart(source);
    expect(serializeChart({ ...source, notes: [{ type: "release", lane: 1, beat: beat(0), count: 1, grace: true }] })).not.toBe(snapshot);
    expect(serializeChart({ ...source, notes: [{ type: "release", lane: 1, beat: beat(0), count: 2 }] })).not.toBe(snapshot);
    expect(serializeChart({ ...source, notes: [{ type: "single", lane: 1, beat: beat(0) }] })).not.toBe(snapshot);
    expect(serializeChart({ ...source, meta: { ...source.meta, offsetMs: -24 } })).not.toBe(snapshot);
    const extra = auxNotesAsExtra([{ ...source.notes[0], lane: 5 }]);
    expect(serializeExtraNotes(extra, 2)).not.toBe(serializeExtraNotes(extra, 1));
  });

  it("lane 4→5→4 왕복은 Point Grace·구형 holdOnly·명시 수량의 항목 의미를 바꾸지 않는다", () => {
    const original = document([
      { type: "double", lane: 4, beat: beat(0), grace: true },
      { type: "doubleLong", lane: 4, beat: beat(0), endBeat: beat(2), holdOnly: true },
      { type: "release", lane: 4, beat: beat(2), count: 2, grace: true },
    ]);
    const extra = auxNotesAsExtra(original.notes.map((note) => ({ ...note, lane: 5 })));
    const read = parseExtraNotesDocument(JSON.parse(serializeExtraNotes(extra, 1)));
    const returned = withAuxNotes([], read.extraNotes).map((note) => ({ ...note, lane: 4 }));
    expect(returned).toEqual(original.notes);
    expect(serializeChart({ ...original, notes: returned })).toBe(serializeChart(original));
  });
});

describe("C1 구형 의미와 버전 경계", () => {
  it.each([undefined, 1, 2, 3, 4])("version=%s 구형 3항목을 읽으면 구형 type·holdOnly·Grace만 유지하고 v3로 재저장한다", (version) => {
    const json = {
      ...chartToJson(document([])), version,
      notes: [
        { type: "double", lane: 1, beat: "0", grace: true },
        { type: version === undefined || version === 1 ? "singleLong" : "long", lane: 1, beat: "0", endBeat: "2", holdOnly: true },
        { type: "doubleLong", lane: 2, beat: "2", endBeat: "2", holdOnly: false },
      ],
      events: version === undefined || version <= 2 ? [{ beat: "0", endBeat: "0", bpm: 120, beatPerMeasure: "4", text: "이전 이벤트" }] : [],
    };
    const parsed = deserializeChartDocument(JSON.stringify(json));
    expect(parsed.notes).toEqual([
      { type: "double", lane: 1, beat: beat(0), grace: true },
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(2), holdOnly: true },
      { type: "doubleLong", lane: 2, beat: beat(2), endBeat: beat(2), holdOnly: false },
    ]);
    expect(chartToJson(parsed).version).toBe(3);
    if (version === undefined || version <= 2) expect(parsed.events.map((event) => event.type)).toEqual(["bpm", "timeSignature", "text"]);
  });

  it("구형 aux의 Grace=true·false와 holdOnly=true·false는 무버전 형식으로 모두 보존한다", () => {
    const source = [
      { type: "single" as const, extraLane: 1, beat: beat(0), grace: true },
      { type: "double" as const, extraLane: 2, beat: beat(1), grace: false },
      { type: "long" as const, extraLane: 3, beat: beat(0), endBeat: beat(2), holdOnly: true },
      { type: "doubleLong" as const, extraLane: 4, beat: beat(2), endBeat: beat(2), holdOnly: false },
    ];
    const snapshot = serializeExtraNotes(source, 4);
    expect(JSON.parse(snapshot)).not.toHaveProperty("version");
    expect(parseExtraNotes(JSON.parse(snapshot)).extraNotes).toEqual(source);
    expect(serializeExtraNotes(parseExtraNotes(JSON.parse(snapshot)).extraNotes, 4)).toBe(snapshot);
  });

  it.each([undefined, 1, 2, 3, 4])("version=%s aux의 구형 Grace·holdOnly를 읽어도 명시 노트를 만들지 않는다", (version) => {
    const parsed = parseExtraNotesDocument({ version, extraLaneCount: 2, extraNotes: [
      { type: "double", extraLane: 1, beat: "0", grace: true },
      { type: version === undefined || version === 1 ? "singleLong" : "long", extraLane: 2, beat: "1", endBeat: "1", holdOnly: true },
    ] });
    expect(withAuxNotes([], parsed.extraNotes)).toEqual([
      { type: "double", lane: 5, beat: beat(0), grace: true },
      { type: "long", lane: 6, beat: beat(1), endBeat: beat(1), holdOnly: true },
    ]);
    expect(JSON.parse(serializeExtraNotes(parsed.extraNotes, parsed.extraLaneCount))).not.toHaveProperty("version");
  });

  it.each([0, -1, 2.5, 5, 99, "4", null])("version=%s는 main/aux reader에서 지원하지 않는 버전 오류이며 v3로 추정하지 않는다", (version) => {
    expect(() => deserializeChartDocument(JSON.stringify({ ...chartToJson(document([])), version }))).toThrow("지원하지 않는 version");
    expect(() => parseExtraNotesDocument(JSON.parse(JSON.stringify({ version, extraNotes: [] })))).toThrow("지원하지 않는 version");
  });

  it.each([undefined, 1, 2, 3])("version=%s에 명시 release를 넣으면 신형 의미를 구형으로 읽지 않고 거부한다", (version) => {
    expect(() => deserializeChartDocument(JSON.stringify({ ...chartToJson(document([])), version, notes: [{ type: "release", lane: 1, beat: "0", count: 1 }] }))).toThrow("version 4");
  });

  it("v4 신형/혼합 main·aux를 구형 reader로 읽으면 UnsupportedChartContentError다", () => {
    const source = document([{ type: "single", lane: 1, beat: beat(0) }, ...cases.map(([, note]) => note)]);
    expect(() => deserializeChart(serializeChart(source))).toThrow(UnsupportedChartContentError);
    expect(() => chartFromJson(chartToJson(source))).toThrow(UnsupportedChartContentError);
    expect(() => parseExtraNotes(JSON.parse(serializeExtraNotes(auxNotesAsExtra([{ ...cases[0][1], lane: 5 }]), 1)))).toThrow(UnsupportedChartContentError);
  });

  it.each(["1.5", "1/2.5", "1oops", "0.5"])("v4 Point의 박 문자열 %j는 정수로 잘라 옮기지 않고 거부한다", (value) => {
    expect(() => deserializeChartDocument(JSON.stringify({ ...chartToJson(document([])), version: 4,
      notes: [{ type: "point", kind: "single", lane: 1, beat: value }] }))).toThrow("박 문자열이 유효하지 않습니다");
  });

  it("v3 구형 노트의 기존 박 문자열 \"-1/2\"·\"7/2\"·\"0\"은 그대로 읽는다", () => {
    const parsed = deserializeChartDocument(JSON.stringify({ ...chartToJson(document([])), version: 3, notes: [
      { type: "single", lane: 1, beat: "-1/2" }, { type: "long", lane: 2, beat: "0", endBeat: "7/2" },
    ] }));
    expect(parsed.notes).toEqual([
      { type: "single", lane: 1, beat: beat(-1, 2) }, { type: "long", lane: 2, beat: beat(0), endBeat: beat(7, 2) },
    ]);
  });

  it.each([
    [{ type: "release", count: 2, grace: [true, false] }, "grace는 boolean"],
    [{ type: "release", count: 2, graceByUnit: [true, false] }, "지원하지 않는 필드"],
    [{ type: "body", endBeat: "0", holdCount: 2, trill: true }, "trill 바디"],
    [{ type: "body", endBeat: "0", holdCount: 1, holdOnly: true }, "지원하지 않는 필드"],
    [{ type: "sustain", count: 1, grace: true }, "지원하지 않는 필드"],
    [{ type: "release", count: 3 }, "count는 1 또는 2"],
    [{ type: "sustain", count: 0 }, "count는 1 또는 2"],
    [{ type: "body", endBeat: "0", holdCount: 0 }, "holdCount는 1 또는 2"],
    [{ type: "unknown" }, "지원하지 않는 노트 type"],
    [{ type: "point", kind: "unknown" }, "Point kind"],
  ])("구조 오류 %j는 %s로 거부하고 항목을 유실하지 않는다", (note, message) => {
    expect(() => deserializeChartDocument(JSON.stringify({ ...chartToJson(document([])), version: 4, notes: [{ lane: 1, beat: "0", ...note }] }))).toThrow(message);
  });
});

describe("C1 형식 오류 분류와 미지원 필드 정책", () => {
  const v4 = (patch: Record<string, unknown>) => JSON.stringify({ ...chartToJson(document([])), version: 4, ...patch });

  it.each([
    ["trillZones 끝 박 \"x\"", { trillZones: [{ lane: 1, beat: "0", endBeat: "x" }] }],
    ["restZones 시작 박 \"1.5\"", { restZones: [{ lane: 1, beat: "1.5", endBeat: "2" }] }],
    ["bpm 이벤트 박 \"1oops\"", { events: [{ type: "bpm", beat: "1oops", bpm: 120 }] }],
    ["timeSignature beatPerMeasure \"4/x\"", { events: [{ type: "timeSignature", beat: "0", beatPerMeasure: "4/x" }] }],
    ["trillZones 항목 null", { trillZones: [null] }],
    ["events 항목 null", { events: [null] }],
    ["version 2 구형 이벤트 박 \"x\"", { version: 2, events: [{ beat: "x", endBeat: "0", bpm: 120 }] }],
  ])("%s는 일반 Error가 아니라 ChartFormatError로 거부한다", (_label, patch) => {
    expect(() => deserializeChartDocument(v4(patch))).toThrow(ChartFormatError);
  });

  it("JSON 객체 진입 chartDocumentFromJson도 notes 배열이 없으면 ChartFormatError다", () => {
    const { notes: _notes, ...withoutNotes } = chartToJson(document([]));
    expect(() => chartDocumentFromJson(withoutNotes as unknown as ChartJson)).toThrow(ChartFormatError);
  });

  it("보조 노트에 메인 전용 lane 3이 있으면 extraLane 1로 덮어쓰지 않고 ChartFormatError로 거부한다", () => {
    expect(() => parseExtraNotesDocument(JSON.parse(JSON.stringify({
      extraNotes: [{ type: "single", lane: 3, extraLane: 1, beat: "0" }],
    })))).toThrow("보조 노트에는 lane 대신 extraLane");
  });

  it.each([0, -1, 1.5, "1", null])("보조 노트 extraLane=%j는 메인 레인이나 비정수 레인으로 옮기지 않고 ChartFormatError로 거부한다", (extraLane) => {
    expect(() => parseExtraNotesDocument(JSON.parse(JSON.stringify({
      extraNotes: [{ type: "single", extraLane, beat: "0" }],
    })))).toThrow("extraLane은 1 이상의 정수여야 합니다");
  });

  it("보조 노트에 extraLane이 없으면 ChartFormatError로 거부한다", () => {
    expect(() => parseExtraNotesDocument(JSON.parse(JSON.stringify({
      extraNotes: [{ type: "single", beat: "0" }],
    })))).toThrow("extraLane은 1 이상의 정수여야 합니다");
  });

  it("최상위·bpm 이벤트·trillZone·보조 최상위의 미지원 필드는 읽기를 막지 않고 재저장에서 빠지며 meta 필드는 남는다", () => {
    const source = chartToJson(document([{ type: "point", kind: "single", lane: 1, beat: beat(0) }]));
    const resaved = JSON.parse(serializeChart(deserializeChartDocument(JSON.stringify({
      ...source, future: 1, meta: { ...source.meta, future: 1 },
      trillZones: [{ lane: 3, beat: "0", endBeat: "4", future: 1 }],
      events: [{ type: "bpm", beat: "0", bpm: 120, future: 1 }],
    }))));
    expect(resaved).not.toHaveProperty("future");
    expect(resaved.trillZones[0]).not.toHaveProperty("future");
    expect(resaved.events[0]).not.toHaveProperty("future");
    expect(resaved.meta.future).toBe(1);
    const aux = parseExtraNotesDocument(JSON.parse(JSON.stringify({ extraNotes: [], extraLaneCount: 1, future: 1 })));
    expect(JSON.parse(serializeExtraNotes(aux.extraNotes, aux.extraLaneCount))).toEqual({ extraNotes: [], extraLaneCount: 1 });
  });

  it("바디 trill:false는 holdCount 오류가 아니라 trill은 true만 쓴다는 오류로 거부한다", () => {
    expect(() => deserializeChartDocument(v4({ notes: [
      { type: "body", lane: 1, beat: "0", endBeat: "2", holdCount: 1, trill: false },
    ] }))).toThrow("바디 trill은 true만 쓸 수 있습니다");
  });

  it("구형 reader로 명시 Point를 읽으면 \"구형 차트 reader에서는 명시적 노트 형식을 지원하지 않습니다\" 오류다", () => {
    const source = document([{ type: "point", kind: "single", lane: 1, beat: beat(0) }]);
    expect(() => deserializeChart(serializeChart(source))).toThrow("구형 차트 reader에서는 명시적 노트 형식을 지원하지 않습니다");
  });
});

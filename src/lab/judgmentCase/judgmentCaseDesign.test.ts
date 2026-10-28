import { describe, expect, it } from "vitest";
import { serializeChart } from "../../shared/chart";
import { beat } from "../../shared/types/beat";
import type { ChartDocument } from "../../shared/types/chart";
import { parseJudgmentCaseDesign, summarizeJudgmentCaseDesign } from "./judgmentCaseDesign";

const base = { format: "judgment-case-design", notes: [{ kind: "tap", atMs: 1000 }] };
const parse = (value: unknown) => parseJudgmentCaseDesign(JSON.stringify(value));

describe("수동 설계 입력", () => {
  it("같은 1000ms의 Point·release·유지 노트를 받아 현행 차트의 배치 금지를 적용하지 않음", () => {
    const design = parse({ ...base, notes: ["tap", "release", "tick", "marker"].map(kind => ({ kind, atMs: 1000 })) });
    expect(design.notes.map(note => note.id)).toEqual(["N1", "N2", "N3", "N4"]);
    expect(design.notes.map(note => note.kind)).toEqual(["tap", "release", "tick", "marker"]);
  });

  it("입력 없이 Perfect라고 적으면 검증하거나 집계하지 않고 수동 설명과 엔진 미실행 표시를 유지", () => {
    const design = parse({ ...base, annotations: [{ note: "N1", atMs: 1000, text: "Perfect라고 가정", tone: "success" }] });
    const summary = summarizeJudgmentCaseDesign(design);
    expect(summary).toContain("엔진 미실행");
    expect(summary).toContain("[성공 가정] N1 @1000ms: Perfect라고 가정");
    expect(summary).not.toMatch(/달성률|Full Combo|Perfect 1/);
  });

  it("음수 -80ms와 비대칭 창 -120～30ms를 지정하면 Normal 창으로 치환하지 않음", () => {
    const design = parse({ ...base, notes: [{ id: "시작", kind: "body", count: 2, startMs: -80, endMs: 1000 }],
      windows: [{ note: "시작", label: "비대칭", startMs: -120, endMs: 30 }], inputs: [{ key: "A", downMs: -90 }] });
    expect(design.notes[0]).toMatchObject({ count: 2, startMs: -80 });
    expect(design.windows[0]).toMatchObject({ startMs: -120, endMs: 30 });
    expect(design.inputs[0].upMs).toBeNull();
    expect(summarizeJudgmentCaseDesign(design)).toContain("창: 시작 비대칭 -120～30ms");
  });

  it.each([
    ["창이 없는 N9를 참조", { windows: [{ note: "N9", label: "창", startMs: 0, endMs: 1 }] }, /windows\[0\].note.*N9/],
    ["설명이 없는 N9를 참조", { annotations: [{ note: "N9", atMs: 0, text: "가정" }] }, /annotations\[0\].note.*N9/],
    ["창 끝 0ms가 시작 1ms보다 이름", { windows: [{ note: "N1", label: "창", startMs: 1, endMs: 0 }] }, /windows\[0\].*끝/],
    ["키 뗌 0ms가 누름 1ms보다 이름", { inputs: [{ key: "A", downMs: 1, upMs: 0 }] }, /inputs\[0\].*끝/],
    ["startMs를 startMS로 잘못 씀", { windows: [{ note: "N1", startMS: 0 }] }, /windows\[0\].startMS.*알 수 없는/],
    ["annotations를 null로 지정", { annotations: null }, /annotations.*배열/],
  ])("%s이면 위치를 붙인 오류로 그림 생성을 중단", (_name, fields, message) => {
    expect(() => parse({ ...base, ...fields })).toThrow(message);
  });

  it.each([
    ["노트 수 0", []],
    ["동일한 N1 이름 2개", [{ id: "N1", kind: "tap", atMs: 0 }, { id: "N1", kind: "tap", atMs: 1 }]],
    ["수량 0", [{ kind: "tap", atMs: 0, count: 0 }]],
    ["레인 1.5", [{ kind: "tap", atMs: 0, lane: 1.5 }]],
    ["문자열 시각", [{ kind: "tap", atMs: "1000" }]],
    ["바디 역전 1000→900", [{ kind: "body", startMs: 1000, endMs: 900 }]],
    ["Point에 구간 시각 혼합", [{ kind: "tap", atMs: 0, startMs: 0, endMs: 10 }]],
  ])("%s이면 잘못된 도식을 만들지 않고 notes 오류", (_name, notes) => {
    expect(() => parse({ ...base, notes })).toThrow(/notes/);
  });

  it("유한 범위를 벗어난 JSON 숫자 1e400은 거부", () => {
    expect(() => parseJudgmentCaseDesign('{"format":"judgment-case-design","notes":[{"kind":"tap","atMs":1e400}]}')).toThrow(/유한/);
  });

  it("format 없는 { notes: [] }를 --design에 주면 설계 형식을 명시하라는 오류", () => {
    expect(() => parse({ notes: [] })).toThrow(/format.*judgment-case-design/);
  });

  it("version·meta가 있는 v4 ChartDocument JSON을 --design에 주면 '알 수 없는 필드' 대신 format 안내 오류", () => {
    const chart: ChartDocument = {
      meta: { title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1, imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
      notes: [{ type: "tap", kind: "single", lane: 1, beat: beat(2) }], trillZones: [], restZones: [],
      events: [{ type: "bpm", beat: beat(0), bpm: 120 }],
    };
    const source = serializeChart(chart);
    expect(JSON.parse(source).version).toBe(4);
    expect(() => parseJudgmentCaseDesign(source)).toThrow(/format.*judgment-case-design/);
  });
});

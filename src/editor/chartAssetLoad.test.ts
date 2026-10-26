import { describe, expect, it } from "vitest";
import { beat } from "../shared/types/beat";
import { ChartFormatError, UnsupportedChartContentError } from "../shared/chart";
import { loadLegacyEditorChartAsset } from "./chartAssetLoad";

const main = {
  version: 3, meta: { title: "기존 메타데이터", offsetMs: -20 }, notes: [], trillZones: [], events: [],
};

describe("loadLegacyEditorChartAsset", () => {
  it("별도 보조 파일이 없으면 메인 내장 extraLane 3을 lane 7로 병합하고 레인 수를 확장한다", () => {
    const loaded = loadLegacyEditorChartAsset(JSON.stringify({
      ...main,
      extraNotes: [{ type: "doubleLong", extraLane: 3, beat: "1", endBeat: "1", holdOnly: true }],
      extraLaneCount: 1,
    }), null);
    expect(loaded.chart.notes).toEqual([{ type: "doubleLong", lane: 7, beat: beat(1), endBeat: beat(1), holdOnly: true }]);
    expect(loaded.chart.meta).toEqual(main.meta);
    expect(loaded.extraLaneCount).toBe(3);
  });

  it("별도 보조 파일이 있으면 내장 보조 대신 별도 파일의 Grace=true를 보존한다", () => {
    const loaded = loadLegacyEditorChartAsset(JSON.stringify({
      ...main, extraNotes: [{ type: "single", extraLane: 1, beat: "0" }],
    }), JSON.stringify({ extraNotes: [{ type: "double", extraLane: 2, beat: "2", grace: true }], extraLaneCount: 4 }));
    expect(loaded.chart.notes).toEqual([{ type: "double", lane: 6, beat: beat(2), grace: true }]);
    expect(loaded.extraLaneCount).toBe(4);
  });

  it("보조 파일도 내장 자료도 없으면 기존 메인 차트와 extraLaneCount=0을 반환한다", () => {
    const loaded = loadLegacyEditorChartAsset(JSON.stringify(main), null);
    expect(loaded.chart.notes).toEqual([]);
    expect(loaded.extraLaneCount).toBe(0);
  });

  it("별도 보조 응답이 빈 문자열이면 기존처럼 메인 내장 Grace 보조 노트를 불러온다", () => {
    const loaded = loadLegacyEditorChartAsset(JSON.stringify({ ...main, extraNotes: [{ type: "single", extraLane: 1, beat: "0", grace: true }] }), "");
    expect(loaded.chart.notes).toEqual([{ type: "single", lane: 5, beat: beat(0), grace: true }]);
  });

  it("과거 손상 JSON 보조 파일은 기존처럼 무시한다", () => {
    expect(loadLegacyEditorChartAsset(JSON.stringify(main), "not json").extraLaneCount).toBe(0);
  });

  it("v4 명시 메인 Point는 에디터 store에 적재하지 않고 지원 오류를 전달한다", () => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify({ ...main, version: 4, notes: [{ type: "point", kind: "single", lane: 1, beat: "0" }] }), null)).toThrow(UnsupportedChartContentError);
  });

  it("메인 notes에 명시 lane 5 노트가 있으면 별도 구형 보조 병합으로 숨기지 않고 거부한다", () => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify({ ...main, version: 4, notes: [{ type: "point", kind: "single", lane: 5, beat: "0" }] }), JSON.stringify({ extraNotes: [{ type: "single", extraLane: 1, beat: "0" }] }))).toThrow(UnsupportedChartContentError);
  });

  it("구형 메인+v4 명시 보조 sustain은 빈 보조 데이터로 열지 않고 지원 오류를 전달한다", () => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify(main), JSON.stringify({
      version: 4, extraNotes: [{ type: "sustain", extraLane: 1, beat: "0", count: 1 }], extraLaneCount: 1,
    }))).toThrow(UnsupportedChartContentError);
  });

  it("v4 메인 내장 명시 보조 release도 지원 오류를 전달한다", () => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify({
      ...main, version: 4, extraNotes: [{ type: "release", extraLane: 1, beat: "0", count: 2 }],
    }), null)).toThrow(UnsupportedChartContentError);
  });

  it.each([
    { version: 5, extraNotes: [] },
    { version: 3, extraNotes: [{ type: "sustain", extraLane: 1, beat: "0", count: 1 }] },
    { version: 4, extraNotes: [{ type: "release", extraLane: 1, beat: "0", count: 0 }] },
    { extraNotes: "bad" },
  ])("보조 형식 오류 %j는 무시하지 않고 ChartFormatError를 전달한다", (extra) => {
    expect(() => loadLegacyEditorChartAsset(JSON.stringify(main), JSON.stringify(extra))).toThrow(ChartFormatError);
  });
});

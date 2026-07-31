import { describe, expect, it } from "vitest";
import { loadEditorChartAssets } from "./chartLoad";

const baseChart = {
  version: 3,
  meta: {
    title: "test",
    artist: "test",
    difficultyLabel: "NORMAL",
    difficultyLevel: 1,
    imageFile: "",
    audioFile: "",
    previewAudioFile: "",
    offsetMs: 0,
  },
  notes: [{ type: "single", lane: 2, beat: "0/1" }],
  trillZones: [],
  events: [],
};

describe("loadEditorChartAssets", () => {
  it("메인 lane=2와 별도 extraLane=3을 불러오면 통합 notes의 lane은 [2,7]이고 보조 레인 수는 3", () => {
    const result = loadEditorChartAssets(
      JSON.stringify(baseChart),
      JSON.stringify({
        extraNotes: [{ type: "single", extraLane: 3, beat: "1/1" }],
        extraLaneCount: 2,
      }),
    );

    expect(result.chart.notes.map((note) => note.lane)).toEqual([2, 7]);
    expect(result.extraLaneCount).toBe(3);
  });

  it("별도 extra 파일이 없고 메인 JSON에 extraLane=1이 내장되어 있으면 lane=5로 병합된다", () => {
    const result = loadEditorChartAssets(
      JSON.stringify({
        ...baseChart,
        extraNotes: [{ type: "single", extraLane: 1, beat: "2/1" }],
        extraLaneCount: 2,
      }),
      null,
    );

    expect(result.chart.notes.map((note) => note.lane)).toEqual([2, 5]);
    expect(result.extraLaneCount).toBe(2);
  });

  it("보조 에셋 JSON이 손상되어도 유효한 메인 lane=2 차트는 보조 레인 없이 열린다", () => {
    const result = loadEditorChartAssets(JSON.stringify(baseChart), "{broken");

    expect(result.chart.notes.map((note) => note.lane)).toEqual([2]);
    expect(result.extraLaneCount).toBe(0);
  });
});

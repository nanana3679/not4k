import { describe, it, expect } from "vitest";
import { serializeChart, deserializeChart, chartToJson, chartFromJson } from "./index";
import { beat } from "../types/beat";
import type { Chart } from "../types/chart";

const SAMPLE_CHART: Chart = {
  meta: {
    title: "Test Song",
    artist: "Test Artist",
    difficultyLabel: "NORMAL",
    difficultyLevel: 5,
    imageFile: "jacket.png",
    audioFile: "audio.ogg",
    previewAudioFile: "preview.ogg",
    offsetMs: 100,
  },
  notes: [
    { type: "single", lane: 1, beat: beat(0) },
    { type: "double", lane: 2, beat: beat(1, 2) },
    { type: "trill", lane: 3, beat: beat(3, 4) },
    { type: "singleLong", lane: 1, beat: beat(4), endBeat: beat(8) },
    { type: "doubleLong", lane: 2, beat: beat(4), endBeat: beat(6) },
    { type: "trillLong", lane: 3, beat: beat(4), endBeat: beat(4) }, // 길이 0
  ],
  trillZones: [
    { lane: 3, beat: beat(0), endBeat: beat(8) },
  ],
  events: [
    { beat: beat(0), endBeat: beat(4), bpm: 120, beatPerMeasure: beat(4), text: "첫 번째 메시지" },
    { beat: beat(4), endBeat: beat(8), text: "두 번째 메시지" },
  ],
};

describe("chartToJson / chartFromJson", () => {
  it("Beat가 문자열로 직렬화된다", () => {
    const json = chartToJson(SAMPLE_CHART);

    expect(json.notes[1].beat).toBe("1/2");
    expect(json.notes[2].beat).toBe("3/4");
    expect(json.events[0].bpm).toBe(120);
    expect(json.events[0].beatPerMeasure).toBe("4");
  });

  it("구간 엔티티의 endBeat도 문자열로 직렬화된다", () => {
    const json = chartToJson(SAMPLE_CHART);
    const longNote = json.notes[3];
    expect("endBeat" in longNote && longNote.endBeat).toBe("8");
  });

  it("메타데이터는 그대로 유지된다", () => {
    const json = chartToJson(SAMPLE_CHART);
    expect(json.meta).toEqual(SAMPLE_CHART.meta);
  });

  it("라운드트립: chartFromJson(chartToJson(chart)) === chart", () => {
    const json = chartToJson(SAMPLE_CHART);
    const restored = chartFromJson(json);
    expect(restored).toEqual(SAMPLE_CHART);
  });
});

describe("serializeChart / deserializeChart", () => {
  it("라운드트립: deserializeChart(serializeChart(chart)) === chart", () => {
    const str = serializeChart(SAMPLE_CHART);
    const restored = deserializeChart(str);
    expect(restored).toEqual(SAMPLE_CHART);
  });

  it("직렬화 결과는 유효한 JSON 문자열이다", () => {
    const str = serializeChart(SAMPLE_CHART);
    expect(() => JSON.parse(str)).not.toThrow();
  });

  it("직렬화 결과에 Beat 문자열이 포함된다", () => {
    const str = serializeChart(SAMPLE_CHART);
    expect(str).toContain('"1/2"');
    expect(str).toContain('"3/4"');
  });

  it("빈 차트도 라운드트립 가능", () => {
    const emptyChart: Chart = {
      meta: {
        title: "",
        artist: "",
        difficultyLabel: "",
        difficultyLevel: 0,
        imageFile: "",
        audioFile: "",
        previewAudioFile: "",
        offsetMs: 0,
      },
      notes: [],
      trillZones: [],
      events: [],
    };
    const restored = deserializeChart(serializeChart(emptyChart));
    expect(restored).toEqual(emptyChart);
  });

  it("복합 이벤트(bpm + beatPerMeasure + text) 라운드트립", () => {
    const chartWithComposite: Chart = {
      ...SAMPLE_CHART,
      events: [
        { beat: beat(0), endBeat: beat(4), text: "메시지", bpm: 180, beatPerMeasure: beat(3, 4) },
        { beat: beat(4), endBeat: beat(8), bpm: 200 },
        { beat: beat(8), endBeat: beat(12), beatPerMeasure: beat(7, 8) },
      ],
    };
    const restored = deserializeChart(serializeChart(chartWithComposite));
    expect(restored).toEqual(chartWithComposite);
  });

  it("레거시 { type: 'message' } JSON도 파싱 가능", () => {
    const legacyJson = {
      ...chartToJson(SAMPLE_CHART),
      events: [{ type: "message", beat: "0", endBeat: "4", text: "legacy" }],
    };
    const parsed = chartFromJson(legacyJson as any);
    expect(parsed.events[0]).toEqual({ beat: beat(0), endBeat: beat(4), text: "legacy" });
  });
});

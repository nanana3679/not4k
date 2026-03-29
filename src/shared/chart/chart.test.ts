import { describe, it, expect } from "vitest";
import { serializeChart, deserializeChart, chartToJson, chartFromJson } from "./index";
import { beat } from "../types/beat";
import type { Chart, PointNote } from "../types/chart";

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
    // 롱노트: 헤드(PointNote) + 바디(RangeNote) 쌍
    { type: "single", lane: 1, beat: beat(4) },
    { type: "long", lane: 1, beat: beat(4), endBeat: beat(8) },
    { type: "double", lane: 2, beat: beat(4) },
    { type: "doubleLong", lane: 2, beat: beat(4), endBeat: beat(6) },
    { type: "trill", lane: 3, beat: beat(4) },
    { type: "trillLong", lane: 3, beat: beat(4), endBeat: beat(4) }, // 길이 0
  ],
  trillZones: [
    { lane: 3, beat: beat(0), endBeat: beat(8) },
  ],
  events: [
    { type: "bpm" as const, beat: beat(0), bpm: 120 },
    { type: "timeSignature" as const, beat: beat(0), beatPerMeasure: beat(4) },
    { type: "text" as const, beat: beat(0), endBeat: beat(4), text: "첫 번째 메시지" },
    { type: "text" as const, beat: beat(4), endBeat: beat(8), text: "두 번째 메시지" },
  ],
};

describe("chartToJson / chartFromJson", () => {
  it("Beat가 문자열로 직렬화된다", () => {
    const json = chartToJson(SAMPLE_CHART);

    expect(json.notes[1].beat).toBe("1/2");
    expect(json.notes[2].beat).toBe("3/4");
    expect(json.events[0].type).toBe("bpm");
    expect((json.events[0] as { bpm?: number }).bpm).toBe(120);
    expect(json.events[1].type).toBe("timeSignature");
    expect((json.events[1] as { beatPerMeasure?: string }).beatPerMeasure).toBe("4");
  });

  it("구간 엔티티의 endBeat도 문자열로 직렬화된다", () => {
    const json = chartToJson(SAMPLE_CHART);
    const longNote = json.notes[4]; // index 4 = long body (index 3 = single head)
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

  it("여러 이벤트 타입 혼합 라운드트립", () => {
    const chartWithMixed: Chart = {
      ...SAMPLE_CHART,
      events: [
        { type: "bpm" as const, beat: beat(0), bpm: 180 },
        { type: "timeSignature" as const, beat: beat(0), beatPerMeasure: beat(3, 4) },
        { type: "text" as const, beat: beat(0), endBeat: beat(4), text: "메시지" },
        { type: "bpm" as const, beat: beat(4), bpm: 200 },
        { type: "timeSignature" as const, beat: beat(8), beatPerMeasure: beat(7, 8) },
      ],
    };
    const restored = deserializeChart(serializeChart(chartWithMixed));
    expect(restored).toEqual(chartWithMixed);
  });

});

describe("레거시 마이그레이션 (v1 → v2)", () => {
  it("singleLong → long 타입명 변경 (헤드는 이미 별도 엔티티)", () => {
    const legacyJson = {
      meta: SAMPLE_CHART.meta,
      notes: [
        { type: "single", lane: 1, beat: "0" },
        { type: "singleLong", lane: 1, beat: "0", endBeat: "4" },
      ],
      trillZones: [],
      events: [],
    };
    const chart = chartFromJson(legacyJson as any);
    expect(chart.notes).toHaveLength(2);
    expect(chart.notes[0]).toEqual({ type: "single", lane: 1, beat: beat(0) });
    expect(chart.notes[1]).toEqual({ type: "long", lane: 1, beat: beat(0), endBeat: beat(4) });
  });

  it("doubleLong은 타입명 유지", () => {
    const legacyJson = {
      meta: SAMPLE_CHART.meta,
      notes: [
        { type: "double", lane: 2, beat: "0" },
        { type: "doubleLong", lane: 2, beat: "0", endBeat: "8" },
      ],
      trillZones: [],
      events: [],
    };
    const chart = chartFromJson(legacyJson as any);
    expect(chart.notes).toHaveLength(2);
    expect(chart.notes[0]).toEqual({ type: "double", lane: 2, beat: beat(0) });
    expect(chart.notes[1]).toEqual({ type: "doubleLong", lane: 2, beat: beat(0), endBeat: beat(8) });
  });

  it("trillLong은 타입명 유지", () => {
    const legacyJson = {
      meta: SAMPLE_CHART.meta,
      notes: [
        { type: "trill", lane: 3, beat: "2" },
        { type: "trillLong", lane: 3, beat: "2", endBeat: "6" },
      ],
      trillZones: [],
      events: [],
    };
    const chart = chartFromJson(legacyJson as any);
    expect(chart.notes).toHaveLength(2);
    expect(chart.notes[0]).toEqual({ type: "trill", lane: 3, beat: beat(2) });
    expect(chart.notes[1]).toEqual({ type: "trillLong", lane: 3, beat: beat(2), endBeat: beat(6) });
  });

  it("포인트 노트는 그대로 유지", () => {
    const legacyJson = {
      meta: SAMPLE_CHART.meta,
      notes: [
        { type: "single", lane: 1, beat: "0" },
        { type: "double", lane: 2, beat: "1" },
      ],
      trillZones: [],
      events: [],
    };
    const chart = chartFromJson(legacyJson as any);
    expect(chart.notes).toHaveLength(2);
    expect(chart.notes[0]).toEqual({ type: "single", lane: 1, beat: beat(0) });
    expect(chart.notes[1]).toEqual({ type: "double", lane: 2, beat: beat(1) });
  });

  it("v2 JSON은 마이그레이션하지 않음", () => {
    const v2Json = chartToJson(SAMPLE_CHART);
    const chart = chartFromJson(v2Json);
    expect(chart).toEqual(SAMPLE_CHART);
  });
});

describe("grace 플래그 직렬화/역직렬화", () => {
  it("grace: true인 포인트 노트를 직렬화하면 JSON에 grace: true 포함", () => {
    const note: PointNote = { type: "single", lane: 1, beat: beat(0), grace: true };
    const chart: Chart = { meta: SAMPLE_CHART.meta, notes: [note], trillZones: [], events: [] };
    const json = chartToJson(chart);
    expect(json.notes[0]).toHaveProperty("grace", true);
  });

  it("grace 플래그가 없는 포인트 노트를 직렬화하면 JSON에 grace 미포함", () => {
    const note: PointNote = { type: "single", lane: 1, beat: beat(0) };
    const chart: Chart = { meta: SAMPLE_CHART.meta, notes: [note], trillZones: [], events: [] };
    const json = chartToJson(chart);
    expect(json.notes[0]).not.toHaveProperty("grace");
  });

  it("grace: true인 JSON을 역직렬화하면 NoteEntity에 grace: true 복원", () => {
    const json = {
      version: 2,
      meta: SAMPLE_CHART.meta,
      notes: [{ type: "single" as const, lane: 1 as const, beat: "0", grace: true }],
      trillZones: [],
      events: [],
    };
    const chart = chartFromJson(json);
    expect((chart.notes[0] as PointNote).grace).toBe(true);
  });

  it("grace가 없는 JSON을 역직렬화하면 grace 프로퍼티 없음", () => {
    const json = {
      version: 2,
      meta: SAMPLE_CHART.meta,
      notes: [{ type: "single" as const, lane: 1 as const, beat: "0" }],
      trillZones: [],
      events: [],
    };
    const chart = chartFromJson(json);
    expect(chart.notes[0]).not.toHaveProperty("grace");
  });

  it("전체 차트 직렬화→역직렬화 라운드트립에서 grace 플래그 보존", () => {
    const graceNote: PointNote = { type: "single", lane: 2, beat: beat(4), grace: true };
    const normalNote: PointNote = { type: "double", lane: 3, beat: beat(8) };
    const chart: Chart = { meta: SAMPLE_CHART.meta, notes: [graceNote, normalNote], trillZones: [], events: [] };

    const restored = deserializeChart(serializeChart(chart));

    expect((restored.notes[0] as PointNote).grace).toBe(true);
    expect(restored.notes[1]).not.toHaveProperty("grace");
  });
});

describe("editorLane 직렬화/역직렬화", () => {
  it("editorLane이 있는 이벤트를 직렬화하면 JSON에 editorLane 포함", () => {
    const chart: Chart = {
      meta: SAMPLE_CHART.meta,
      notes: [],
      trillZones: [],
      events: [
        { type: "bpm", beat: beat(0), bpm: 120, editorLane: 2 },
        { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 3 },
      ],
    };
    const json = chartToJson(chart);
    expect((json.events[0] as any).editorLane).toBe(2);
    expect((json.events[1] as any).editorLane).toBe(3);
  });

  it("editorLane이 없는 이벤트를 직렬화하면 JSON에 editorLane 미포함", () => {
    const chart: Chart = {
      meta: SAMPLE_CHART.meta,
      notes: [],
      trillZones: [],
      events: [{ type: "bpm", beat: beat(0), bpm: 120 }],
    };
    const json = chartToJson(chart);
    expect(json.events[0]).not.toHaveProperty("editorLane");
  });

  it("editorLane이 있는 JSON을 역직렬화하면 ChartEvent에 editorLane 복원", () => {
    const json = {
      version: 3,
      meta: SAMPLE_CHART.meta,
      notes: [],
      trillZones: [],
      events: [
        { type: "bpm" as const, beat: "0", bpm: 120, editorLane: 2 },
        { type: "text" as const, beat: "0", endBeat: "4", text: "msg", editorLane: 5 },
        { type: "auto" as const, beat: "0", endBeat: "4", editorLane: 1 },
        { type: "stop" as const, beat: "0", endBeat: "4", editorLane: 3 },
        { type: "timeSignature" as const, beat: "0", beatPerMeasure: "4", editorLane: 4 },
      ],
    };
    const chart = chartFromJson(json);
    expect(chart.events[0].editorLane).toBe(2);
    expect(chart.events[1].editorLane).toBe(5);
    expect(chart.events[2].editorLane).toBe(1);
    expect(chart.events[3].editorLane).toBe(3);
    expect(chart.events[4].editorLane).toBe(4);
  });

  it("editorLane이 없는 JSON을 역직렬화하면 editorLane 프로퍼티 없음", () => {
    const json = {
      version: 3,
      meta: SAMPLE_CHART.meta,
      notes: [],
      trillZones: [],
      events: [{ type: "bpm" as const, beat: "0", bpm: 120 }],
    };
    const chart = chartFromJson(json);
    expect(chart.events[0]).not.toHaveProperty("editorLane");
  });

  it("전체 차트 직렬화→역직렬화 라운드트립에서 editorLane 보존", () => {
    const chart: Chart = {
      meta: SAMPLE_CHART.meta,
      notes: [],
      trillZones: [],
      events: [
        { type: "bpm", beat: beat(0), bpm: 120, editorLane: 2 },
        { type: "text", beat: beat(0), endBeat: beat(4), text: "msg" },
        { type: "stop", beat: beat(4), endBeat: beat(8), editorLane: 3 },
      ],
    };
    const restored = deserializeChart(serializeChart(chart));
    expect(restored.events[0].editorLane).toBe(2);
    expect(restored.events[1]).not.toHaveProperty("editorLane");
    expect(restored.events[2].editorLane).toBe(3);
  });

  it("레거시 이벤트 마이그레이션에서 editorLane 없음 (기본값 1로 취급)", () => {
    const legacyJson = {
      version: 2,
      meta: SAMPLE_CHART.meta,
      notes: [],
      trillZones: [],
      events: [{ beat: "0", endBeat: "0", bpm: 120 }],
    };
    const chart = chartFromJson(legacyJson as any);
    expect(chart.events[0]).not.toHaveProperty("editorLane");
  });
});

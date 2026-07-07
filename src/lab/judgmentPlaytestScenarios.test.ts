import { describe, it, expect } from "vitest";
import { PLAYTEST_SCENARIOS, chartEndMs, metronomeClickTimesMs, noteOnsetTimesMs } from "./judgmentPlaytestScenarios";
import { isHoldOnlyNote } from "../shared/types/chart";
import { beatToMs, extractBpmMarkers } from "../shared/timing";

describe("판정 실플레이 시나리오", () => {
  const byId = (id: string) => PLAYTEST_SCENARIOS.find((s) => s.id === id)!;

  it("세 시나리오(S1/S2/S3)가 모두 존재하고 BPM 120 이벤트를 가진다", () => {
    expect(PLAYTEST_SCENARIOS.map((s) => s.id)).toEqual([
      "hold-trill-chain",
      "hold-trill-chain-250",
      "hold-trill-chain-125",
      "holdonly-then-slide",
      "timeout-then-slide",
    ]);
    for (const s of PLAYTEST_SCENARIOS) {
      const bpm = extractBpmMarkers(s.chart.events);
      expect(bpm[0].bpm).toBe(120);
    }
  });

  it("S1 홀드 트릴 체인은 헤드있는 롱 6개(single 헤드 + long 바디, o-o-o-o-)", () => {
    const notes = byId("hold-trill-chain").chart.notes;
    const heads = notes.filter((n) => n.type === "single");
    const bodies = notes.filter((n) => n.type === "long");
    expect(heads).toHaveLength(6);
    expect(bodies).toHaveLength(6);
    expect(notes.every((n) => n.lane === 1)).toBe(true);
    // 각 헤드는 대응 롱과 같은 박에 겹친다 (헤드있는 롱)
    for (let i = 0; i < 6; i++) {
      expect(heads[i].beat).toEqual((bodies[i] as { beat: import("../shared/types/beat").Beat }).beat);
    }
  });

  it("S1 인접 롱은 끝=시작으로 맞닿아 connection이고, 각 롱은 500ms(1박)", () => {
    const markers = extractBpmMarkers(byId("hold-trill-chain").chart.events);
    const bodies = byId("hold-trill-chain").chart.notes.filter((n) => n.type === "long") as Array<{
      beat: import("../shared/types/beat").Beat;
      endBeat: import("../shared/types/beat").Beat;
    }>;
    for (let i = 0; i < bodies.length - 1; i++) {
      expect(beatToMs(bodies[i].endBeat, markers)).toBe(beatToMs(bodies[i + 1].beat, markers));
    }
    expect(beatToMs(bodies[0].endBeat, markers) - beatToMs(bodies[0].beat, markers)).toBe(500);
  });

  it("S1b/S1c 빠른 변형은 세그먼트가 각각 250ms(8분)·125ms(16분)이고 헤드있는 롱 구조 유지", () => {
    const segMs = (id: string) => {
      const chart = byId(id).chart;
      const markers = extractBpmMarkers(chart.events);
      const bodies = chart.notes.filter((n) => n.type === "long") as Array<{
        beat: import("../shared/types/beat").Beat;
        endBeat: import("../shared/types/beat").Beat;
      }>;
      // 헤드 수 = 롱 수 (헤드있는 롱), 인접 끝=시작(connection)
      const heads = chart.notes.filter((n) => n.type === "single");
      expect(heads).toHaveLength(bodies.length);
      for (let i = 0; i < bodies.length - 1; i++) {
        expect(beatToMs(bodies[i].endBeat, markers)).toBe(beatToMs(bodies[i + 1].beat, markers));
      }
      return beatToMs(bodies[0].endBeat, markers) - beatToMs(bodies[0].beat, markers);
    };
    expect(segMs("hold-trill-chain-250")).toBe(250);
    expect(segMs("hold-trill-chain-125")).toBe(125);
  });

  it("S2는 hold-only 롱[4~6박] + 길이0 hold-only 슬라이드[6.5박], 둘 다 hold-only", () => {
    const notes = byId("holdonly-then-slide").chart.notes;
    expect(notes).toHaveLength(2);
    expect(notes.every(isHoldOnlyNote)).toBe(true);
    const slide = notes[1] as { beat: import("../shared/types/beat").Beat; endBeat: import("../shared/types/beat").Beat };
    expect(slide.beat).toEqual(slide.endBeat); // 길이 0
  });

  it("S3는 일반 롱[4~6박](떼는 판정 있음) + 길이0 슬라이드 — 롱은 hold-only 아님", () => {
    const notes = byId("timeout-then-slide").chart.notes;
    expect(isHoldOnlyNote(notes[0])).toBe(false);
    expect(isHoldOnlyNote(notes[1])).toBe(true);
  });

  it("chartEndMs는 마지막 노트 끝 + 여유(1500ms)를 반영한다", () => {
    const s1 = byId("hold-trill-chain").chart;
    const markers = extractBpmMarkers(s1.events);
    // 롱 6개, 4박 시작 → 마지막 롱 끝 = 10박(=5초=5000ms) → +1500
    const lastEnd = beatToMs({ n: 10, d: 1 }, markers);
    expect(chartEndMs(s1)).toBe(lastEnd + 1500);
  });

  it("메트로놈 클릭은 매 박(500ms 간격)이고 0에서 시작한다", () => {
    const clicks = metronomeClickTimesMs(byId("hold-trill-chain").chart);
    expect(clicks[0]).toBe(0);
    expect(clicks[1] - clicks[0]).toBe(500);
  });

  it("노트 온셋 시각은 노트 수(헤드6+롱6=12)만큼 나오고 첫 온셋은 리드인 4박(2000ms)이다", () => {
    const onsets = noteOnsetTimesMs(byId("hold-trill-chain").chart);
    expect(onsets).toHaveLength(12);
    expect(Math.min(...onsets)).toBe(2000); // 4박 @120BPM
  });
});

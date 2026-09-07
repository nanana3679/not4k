import { describe, it, expect } from "vitest";
import { PLAYTEST_SCENARIOS, chartEndMs, metronomeClickTimesMs, noteOnsetTimesMs } from "./judgmentPlaytestScenarios";
import { isHoldOnlyNote } from "../shared/types/chart";
import { beatToMs, extractBpmMarkers } from "../shared/timing";
import { compileJudgmentChart } from "../game/judgment/compiledJudgmentChart";
import { NoteJudgmentSession } from "../game/judgment/NoteJudgmentSession";

describe("판정 실플레이 시나리오", () => {
  const byId = (id: string) => PLAYTEST_SCENARIOS.find((s) => s.id === id)!;

  it("수동 사례 ID는 중복되지 않고 모든 차트의 BPM은 120이다", () => {
    const ids = PLAYTEST_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      "connected-single-swap", "connected-double-swap", "single-head-double-connection",
      "decrease-chain", "holdonly-decrease-chain", "failure-recovery", "partial-double-head",
      "same-key-short-connection", "independent-holdonly-start", "late-holdonly-start",
    ]));
    for (const s of PLAYTEST_SCENARIOS) {
      const bpm = extractBpmMarkers(s.chart.events);
      expect(bpm[0].bpm).toBe(120);
    }
  });

  it("새 RFD0019 시나리오는 group·pattern·caseIds와 구조·의미 validation을 모두 갖춘다", async () => {
    const { validateChart } = await import("../shared/validation");
    for (const scenario of PLAYTEST_SCENARIOS) {
      expect(scenario.group).toMatch(/connection|release|holdOnly|failure/);
      expect(scenario.pattern.length).toBeGreaterThan(0);
      expect(scenario.caseIds.length).toBeGreaterThan(0);
      expect(validateChart(scenario.chart)).toEqual([]);
    }
  });

  function sessionFor(id: string): NoteJudgmentSession {
    const scenario = byId(id);
    const markers = extractBpmMarkers(scenario.chart.events);
    const starts = new Map(scenario.chart.notes.map((note, index) => [index, beatToMs(note.beat, markers)] as [number, number]));
    const ends = new Map(scenario.chart.notes.flatMap((note, index) => "endBeat" in note ? [[index, beatToMs(note.endBeat, markers)] as [number, number]] : []));
    return new NoteJudgmentSession(compileJudgmentChart(scenario.chart.notes, starts, ends));
  }

  function play(id: string, batches: Array<[number, Array<{ key: string; lane: 1; type: "down" | "up" }>]>) {
    const session = sessionFor(id);
    for (const [at, inputs] of batches) session.processBatch(at, inputs);
    return session.finalize();
  }

  it("전체 카드가 4박(2000ms) 리드인과 BPM120을 공유하고 chart validation을 통과한다", async () => {
    const { validateChart } = await import("../shared/validation");
    for (const scenario of PLAYTEST_SCENARIOS) {
      const markers = extractBpmMarkers(scenario.chart.events);
      expect(markers[0].bpm).toBe(120);
      expect(Math.min(...noteOnsetTimesMs(scenario.chart))).toBe(2000);
      expect(validateChart(scenario.chart)).toEqual([]);
    }
  });

  it("connected-single-swap은 유지와 교대 두 방법 모두 Perfect 3·Miss 0·FC다", () => {
    const keep = play("connected-single-swap", [[2000, [{ key: "A", lane: 1, type: "down" }]], [2500, [{ key: "B", lane: 1, type: "down" }]], [2520, [{ key: "B", lane: 1, type: "up" }]], [3000, [{ key: "A", lane: 1, type: "up" }]]]);
    const swap = play("connected-single-swap", [[2000, [{ key: "A", lane: 1, type: "down" }]], [2500, [{ key: "A", lane: 1, type: "up" }, { key: "B", lane: 1, type: "down" }]], [3000, [{ key: "B", lane: 1, type: "up" }]]]);
    for (const state of [keep, swap]) { expect(state.judgmentCounts.perfect).toBe(3); expect(state.judgmentCounts.miss).toBe(0); expect(state.isFullCombo).toBe(true); expect(state.achievementRate).toBe(100); }
  });

  it("connected-double-swap은 유지와 전체 교대 두 방법 모두 Perfect 6·Miss 0·FC다", () => {
    const keep = play("connected-double-swap", [[2000, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]], [2500, [{ key: "C", lane: 1, type: "down" }, { key: "D", lane: 1, type: "down" }]], [2520, [{ key: "C", lane: 1, type: "up" }, { key: "D", lane: 1, type: "up" }]], [3000, [{ key: "A", lane: 1, type: "up" }, { key: "B", lane: 1, type: "up" }]]]);
    const swap = play("connected-double-swap", [[2000, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]], [2500, [{ key: "A", lane: 1, type: "up" }, { key: "B", lane: 1, type: "up" }, { key: "C", lane: 1, type: "down" }, { key: "D", lane: 1, type: "down" }]], [3000, [{ key: "C", lane: 1, type: "up" }, { key: "D", lane: 1, type: "up" }]]]);
    for (const state of [keep, swap]) { expect(state.judgmentCounts.perfect).toBe(6); expect(state.judgmentCounts.miss).toBe(0); expect(state.isFullCombo).toBe(true); }
  });

  it("single-head-double-connection은 유지와 한 몫 교대 모두 Perfect 5·Miss 0이다", () => {
    const keep = play("single-head-double-connection", [[2000, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]], [2500, [{ key: "C", lane: 1, type: "down" }]], [2520, [{ key: "C", lane: 1, type: "up" }]], [3000, [{ key: "A", lane: 1, type: "up" }, { key: "B", lane: 1, type: "up" }]]]);
    const swap = play("single-head-double-connection", [[2000, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]], [2500, [{ key: "B", lane: 1, type: "up" }, { key: "C", lane: 1, type: "down" }]], [3000, [{ key: "A", lane: 1, type: "up" }, { key: "C", lane: 1, type: "up" }]]]);
    for (const state of [keep, swap]) { expect(state.judgmentCounts.perfect).toBe(5); expect(state.judgmentCounts.miss).toBe(0); }
  });

  it("decrease-chain은 정상 3 down·3 up에서 Perfect 5이고 두 held 무입력 대조는 Miss다", () => {
    const good = play("decrease-chain", [[2000, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]], [2500, [{ key: "A", lane: 1, type: "up" }]], [3000, [{ key: "C", lane: 1, type: "down" }]], [3500, [{ key: "C", lane: 1, type: "up" }]], [4000, [{ key: "B", lane: 1, type: "up" }]]]);
    const bad = play("decrease-chain", [[2000, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]]]);
    expect(good.judgmentCounts.perfect).toBe(5); expect(good.judgmentCounts.miss).toBe(0); expect(good.isFullCombo).toBe(true);
    expect(bad.judgmentCounts.miss).toBeGreaterThan(0); expect(bad.isFullCombo).toBe(false);
  });

  it("holdonly-decrease-chain은 2000ms A/B down 후 A 4000·B 4500 release로 Perfect 7이다", () => {
    const state = play("holdonly-decrease-chain", [[2000, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 1, type: "down" }]], [4000, [{ key: "A", lane: 1, type: "up" }]], [4500, [{ key: "B", lane: 1, type: "up" }]]]);
    expect(state.judgmentCounts.perfect).toBe(7); expect(state.judgmentCounts.miss).toBe(0); expect(state.isFullCombo).toBe(true);
  });

  it("failure-recovery는 첫 실패 후 B head를 복구해 Perfect 3·Miss 1·FC false다", () => {
    const state = play("failure-recovery", [[2000, [{ key: "A", lane: 1, type: "down" }]], [2250, [{ key: "A", lane: 1, type: "up" }]], [2500, [{ key: "B", lane: 1, type: "down" }]], [3000, [{ key: "B", lane: 1, type: "up" }]]]);
    expect(state.judgmentCounts.perfect).toBe(3); expect(state.judgmentCounts.miss).toBe(1); expect(state.isFullCombo).toBe(false); expect(state.achievementRate).toBe(100);
  });

  it("partial-double-head는 A만 2000 down 후 3000 up하면 Perfect 2·Miss 1·50%다", () => {
    const state = play("partial-double-head", [[2000, [{ key: "A", lane: 1, type: "down" }]], [3000, [{ key: "A", lane: 1, type: "up" }]]]);
    expect(state.judgmentCounts.perfect).toBe(2); expect(state.judgmentCounts.miss).toBe(1); expect(state.achievementRate).toBe(50); expect(state.isFullCombo).toBe(false);
  });

  it("same-key-short-connection은 2495 up을 실제 terminal release에 재사용하지 않고 Perfect 3·Miss 0이다", () => {
    const session = sessionFor("same-key-short-connection");
    session.processBatch(2000, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(2495, [{ key: "A", lane: 1, type: "up" }]);
    session.processBatch(2500, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(2600, [{ key: "A", lane: 1, type: "up" }]);
    const state = session.finalize();
    expect(state.judgmentCounts.perfect).toBe(3); expect(state.judgmentCounts.miss).toBe(0); expect(state.isFullCombo).toBe(true);
    expect(session.events.filter(event => event.kind === "release").map(event => event.inputAt)).toContain(2600);
    expect(session.events.filter(event => event.kind === "release").map(event => event.inputAt)).not.toContain(2495);
  });

  it("independent-holdonly는 500ms held만으로 Miss 1이고 2000ms 새 down 재시도는 Perfect 1이다", () => {
    const miss = play("independent-holdonly-start", [[500, [{ key: "A", lane: 1, type: "down" }]]]);
    const success = play("independent-holdonly-start", [[2000, [{ key: "A", lane: 1, type: "down" }]]]);
    expect(miss.judgmentCounts.miss).toBe(1); expect(miss.isFullCombo).toBe(false);
    expect(success.judgmentCounts.perfect).toBe(1); expect(success.judgmentCounts.miss).toBe(0); expect(success.isFullCombo).toBe(true);
  });

  it("late-holdonly는 2100ms down이면 Perfect 1이고 2121ms down은 Miss 1이다", () => {
    const onTime = play("late-holdonly-start", [[2100, [{ key: "A", lane: 1, type: "down" }]]]);
    const late = play("late-holdonly-start", [[2121, [{ key: "A", lane: 1, type: "down" }]]]);
    expect(onTime.judgmentCounts.perfect).toBe(1); expect(onTime.judgmentCounts.miss).toBe(0);
    expect(late.judgmentCounts.miss).toBe(1); expect(late.isFullCombo).toBe(false);
  });

  it("S2 holdOnly는 2000ms down과 3250ms up으로 두 Perfect를 만들고 FC를 유지한다", () => {
    const session = sessionFor("holdonly-then-slide");
    session.processBatch(2000, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(3250, [{ key: "A", lane: 1, type: "up" }]);
    const state = session.finalize();
    expect(state.judgmentCounts.perfect).toBe(2);
    expect(state.judgmentCounts.miss).toBe(0);
    expect(state.isFullCombo).toBe(true);
    expect(state.achievementRate).toBe(100);
  });

  it("S3 일반 롱은 3250ms 늦은 up으로 Miss가 되고 zero-H는 Perfect로 남는다", () => {
    const session = sessionFor("timeout-then-slide");
    session.processBatch(2000, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(3250, [{ key: "A", lane: 1, type: "up" }]);
    const state = session.finalize();
    expect(state.judgmentCounts.perfect).toBe(1);
    expect(state.judgmentCounts.miss).toBe(1);
    expect(state.isFullCombo).toBe(false);
    expect(state.achievementRate).toBe(50);
  });

  it("S1 세 속도는 각 segment의 A/B 교대 입력으로 head와 마지막 release만 판정한다", () => {
    for (const id of ["hold-trill-chain", "hold-trill-chain-250", "hold-trill-chain-125"]) {
      const scenario = byId(id);
      const session = sessionFor(id);
      const markers = extractBpmMarkers(scenario.chart.events);
      const bodies = scenario.chart.notes.filter((note) => note.type === "long") as Array<{ beat: import("../shared/types/beat").Beat; endBeat: import("../shared/types/beat").Beat }>;
      const keys = ["A", "B"];
      for (let index = 0; index < bodies.length; index++) {
        const start = beatToMs(bodies[index].beat, markers);
        const inputs: Array<{ key: string; lane: 1; type: "down" | "up" }> = [{ key: keys[index % 2], lane: 1, type: "down" }];
        if (index > 0) inputs.unshift({ key: keys[(index - 1) % 2], lane: 1 as const, type: "up" as const });
        session.processBatch(start, inputs);
      }
      const end = beatToMs(bodies[bodies.length - 1].endBeat, markers);
      session.processBatch(end, [{ key: keys[(bodies.length - 1) % 2], lane: 1, type: "up" }]);
      const state = session.finalize();
      expect(state.judgmentCounts.miss, id).toBe(0);
      expect(state.judgmentCounts.perfect, id).toBe(bodies.length + 1);
      expect(state.achievementRate, id).toBe(100);
      expect(state.isFullCombo, id).toBe(true);
      expect(state.processedNotes, id).toBe(state.totalNotes);
    }
  });

  it("NJ-R06 o-o-은 2500ms 교대 뒤 3000ms 마지막 release로 100%와 FC를 유지한다", () => {
    const scenario = byId("connected-single-swap");
    const markers = extractBpmMarkers(scenario.chart.events);
    const starts = new Map(scenario.chart.notes.map((note, index) => [index, beatToMs(note.beat, markers)] as [number, number]));
    const ends = new Map(scenario.chart.notes.flatMap((note, index) => "endBeat" in note ? [[index, beatToMs(note.endBeat, markers)] as [number, number]] : []));
    const session = new NoteJudgmentSession(compileJudgmentChart(scenario.chart.notes, starts, ends));
    session.processBatch(2000, [{ key: "A", lane: 1, type: "down" }]);
    session.processBatch(2500, [{ key: "A", lane: 1, type: "up" }, { key: "B", lane: 1, type: "down" }]);
    session.processBatch(3000, [{ key: "B", lane: 1, type: "up" }]);
    const state = session.finalize();
    expect(state.achievementRate).toBe(100);
    expect(state.isFullCombo).toBe(true);
    expect(state.judgmentCounts.miss).toBe(0);
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

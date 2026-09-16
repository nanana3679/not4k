import { describe, expect, it } from "vitest";
import { JUDGMENT_WINDOWS, JUDGMENT_WINDOWS_EASY, type JudgmentWindows } from "../../shared/constants";
import { beat, type TrillZone } from "../../shared";
import { decideConfirmedJudgmentEffects } from "./confirmedJudgmentEffects";
import { counts, createHarness, down, point, up } from "./noteJudgmentTestHarness";

const zone = (start: number, end: number): TrillZone => ({ lane: 1, beat: beat(start), endBeat: beat(end) });

describe("실제 NoteJudgmentCore의 Point·Grace·trill 회귀", () => {
  const modes: [string, JudgmentWindows][] = [["Normal", JUDGMENT_WINDOWS], ["Easy", JUDGMENT_WINDOWS_EASY]];
  for (const [mode, windows] of modes) {
    const boundaries = [[windows.PERFECT, "perfect"], [windows.PERFECT + 0.01, "great"], [windows.GREAT, "great"], [windows.GREAT + 0.01, "good"], [windows.GOOD, "good"]] as const;
    for (const [distance, grade] of boundaries) {
      it.each([-1, 1])(`${mode} Point의 ${distance}ms 경계에서 방향 %i 입력은 ${grade} 하나를 소비함`, sign => {
        const h = createHarness([point(1000)], { windows });
        h.at(1000 + sign * distance, down("A")); h.at(1300);
        expect(h.events).toHaveLength(1);
        expect(h.events[0]).toMatchObject({ kind: "head", grade, consumed: true, inputAt: 1000 + sign * distance });
      });
    }
    it.each([-1, 1])(`${mode} Good보다 1ms 밖의 방향 %i 입력은 소비되지 않고 기한에 Miss 하나`, sign => {
      const h = createHarness([point(1000)], { windows });
      h.at(1000 + sign * (windows.GOOD + 1), down("A")); h.at(1300);
      expect(h.events).toHaveLength(1);
      expect(h.events[0]).toMatchObject({ kind: "head", grade: "miss", consumed: false, confirmedAt: 1000 + windows.GOOD });
    });
  }

  it("1000/1050ms 두 Point에 1040ms 입력 하나면 먼저 도착하는 1000ms Point만 Perfect", () => {
    const h = createHarness([point(1000), point(1050)]); h.at(1040, down("A"));
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ noteIndex: 0, kind: "head", grade: "perfect" });
  });

  it("Grace Point의 1120ms 입력은 Perfect이며 표시와 FAST/SLOW에서 raw timing을 제외함", () => {
    const note = { ...point(1000), grace: true }; const h = createHarness([note]); h.at(1120, down("A"));
    expect(h.events[0]).toMatchObject({ kind: "head", grade: "perfect", deltaMs: 120 });
    expect(decideConfirmedJudgmentEffects(h.events[0], note).display.judgment?.deltaMs).toBeUndefined();
    expect(h.score.getState()).toMatchObject({ earnedScore: 3, fastCount: 0, slowCount: 0 });
  });

  it("같은 zone에서 A·A·B로 세 head를 치면 Perfect·goodTrill·Perfect이고 release는 교대 상태를 바꾸지 않음", () => {
    const h = createHarness([point(1000, "trill"), point(1500, "trill"), point(2000, "trill")], {}, [zone(1000, 2000)]);
    h.at(1000, down("A")); h.at(1001, up("A")); h.at(1500, down("A")); h.at(1501, up("A"));
    h.at(2000, down("B")); h.at(2001, up("B")); h.at(2200);
    expect(h.events.map(event => event.grade)).toEqual(["perfect", "goodTrill", "perfect"]);
    expect(h.score.getState()).toMatchObject({ earnedScore: 7, goodTrillCount: 1, processedNotes: 3 });
  });

  it("같은 zone에서 A 성공 후 1500ms head를 놓치면 2000ms의 A는 새 교대 Perfect", () => {
    const h = createHarness([point(1000, "trill"), point(1500, "trill"), point(2000, "trill")], {}, [zone(1000, 2000)]);
    h.at(1000, down("A")); h.at(1001, up("A")); h.at(1621); h.at(2000, down("A")); h.at(2200);
    expect(h.events.map(event => event.grade)).toEqual(["perfect", "miss", "perfect"]);
  });

  it("zone0의 늦은 A head를 zone1 시각에 쳐도 zone1의 첫 A head는 독립 Perfect", () => {
    const h = createHarness([point(1000, "trill"), point(1100, "trill")], {}, [zone(900, 1000), zone(1050, 1200)]);
    h.at(1080, down("A")); h.at(1081, up("A")); h.at(1100, down("A")); h.at(1300);
    expect(h.events.map(event => event.grade)).toEqual(["great", "perfect"]);
  });

  it("zone 시작 전 1900ms에 친 2000ms head도 해당 zone에 등록되어 2500ms의 A는 goodTrill", () => {
    const h = createHarness([point(2000, "trill"), point(2500, "trill")], {}, [zone(2000, 2500)]);
    h.at(1900, down("A")); h.at(1901, up("A")); h.at(2500, down("A")); h.at(2700);
    expect(h.events.map(event => event.grade)).toEqual(["good", "goodTrill"]);
  });

  it("노트를 소비하지 않은 B down은 교대 세트에 등록되지 않아 다음 A head는 goodTrill", () => {
    const h = createHarness([point(1000, "trill"), point(2000, "trill")], {}, [zone(1000, 2000)]);
    h.at(1000, down("A")); h.at(1001, up("A")); h.at(1500, down("B")); h.at(1501, up("B")); h.at(2000, down("A"));
    expect(h.events.map(event => event.grade)).toEqual(["perfect", "goodTrill"]);
  });

  it("1040ms A/B 동시 head는 교대 성공 하나와 goodTrill 하나이며 입력 순서를 바꿔도 점수가 같음", () => {
    const run = (keys: string[]) => {
      const h = createHarness([point(1000, "trill"), point(1050, "trill")], {}, [zone(1000, 1050)]);
      h.at(1040, ...keys.map(key => down(key))); h.at(1300);
      return { counts: counts(h.events), score: h.score.getState() };
    };
    const result = run(["A", "B"]);
    expect(result.counts).toEqual({ perfect: 1, great: 0, good: 0, goodTrill: 1, miss: 0 });
    expect(result.score.earnedScore).toBe(4);
    expect(run(["B", "A"])).toEqual(result);
  });

  it.each([1040, 1060])("직전 A 뒤 %ims의 A/B 동시 입력은 수집 순서와 관계없이 최고 등급 Perfect 하나만 교대 성공", at => {
    const run = (keys: string[]) => {
      const h = createHarness([point(500, "trill"), point(1000, "trill"), point(1100, "trill")], {}, [zone(500, 1100)]);
      h.at(500, down("A")); h.at(501, up("A")); h.at(at, ...keys.map(key => down(key))); h.at(1300);
      return { counts: counts(h.events), score: h.score.getState() };
    };
    const expected = { perfect: 2, great: 0, good: 0, goodTrill: 1, miss: 0 };
    expect(run(["A", "B"]).counts).toEqual(expected);
    expect(run(["B", "A"])).toEqual(run(["A", "B"]));
  });

  it("Grace trill도 같은 A로 교대에 실패하면 goodTrill이며 +100ms SLOW는 기록하지 않음", () => {
    const h = createHarness([point(1000, "trill"), { ...point(2000, "trill"), grace: true }], {}, [zone(1000, 2000)]);
    h.at(1000, down("A")); h.at(1001, up("A")); h.at(2100, down("A")); h.at(2300);
    expect(h.events.map(event => event.grade)).toEqual(["perfect", "goodTrill"]);
    expect(h.score.getState()).toMatchObject({ earnedScore: 4, slowCount: 0 });
  });

  it("1000ms double head를 하나도 누르지 않으면 1120ms에 두 score item을 각각 Miss로 정산함", () => {
    const h = createHarness([point(1000, "double")]); h.at(1121);
    expect(h.events).toHaveLength(2);
    expect(h.events.every(event => event.kind === "head" && event.grade === "miss" && event.confirmedAt === 1120)).toBe(true);
    expect(h.score.getState()).toMatchObject({ processedNotes: 2, liveDenominatorWeight: 6 });
  });
});

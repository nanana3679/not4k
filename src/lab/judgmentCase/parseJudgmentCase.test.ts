import { describe, expect, it } from "vitest";
import type { RangeNote, TutorialInputEvent } from "../../shared/types";
import { beat } from "../../shared/types/beat";
import { beatToMs, extractBpmMarkers } from "../../shared/timing";
import { JudgmentCaseSyntaxError, parseJudgmentCase } from "./parseJudgmentCase";

const D4 = [
  "제목: 결정 ④ — A를 1430에 뗌",
  "노트: holdOnly 1000-1500 | long 1500-1560 | head 1560 | long 1560-1760",
  "입력: A 1000-1430 | D 1490-1760",
  "메모: 가설 — A↑1430이 holdOnly를 끝낸다",
].join("\n");

function inputs(text: string): TutorialInputEvent[] {
  return parseJudgmentCase(text).chart.events.filter((event): event is TutorialInputEvent => event.type === "tutorialInput");
}

describe("parseJudgmentCase — 머리글", () => {
  it("한국어 머리글(제목·노트·입력·메모)을 읽어 제목과 메모를 그대로 돌려줌", () => {
    const parsed = parseJudgmentCase(D4);
    expect(parsed.title).toBe("결정 ④ — A를 1430에 뗌");
    expect(parsed.memo).toBe("가설 — A↑1430이 holdOnly를 끝낸다");
  });

  it("영어 머리글 title:/notes:/inputs:/memo:도 같은 차트로 읽음", () => {
    const english = parseJudgmentCase([
      "Title: 결정 ④ — A를 1430에 뗌",
      "notes: holdOnly 1000-1500 | long 1500-1560 | head 1560 | long 1560-1760",
      "INPUTS: A 1000-1430 | D 1490-1760",
      "memo: 가설 — A↑1430이 holdOnly를 끝낸다",
    ].join("\n"));
    expect(english).toEqual(parseJudgmentCase(D4));
  });

  it("메모 다음 머리글 없는 줄은 메모의 다음 줄로 이어 붙임", () => {
    const parsed = parseJudgmentCase("노트: head 1000\n메모: 첫 줄\n둘째 줄\n입력: A 1000-1100");
    expect(parsed.memo).toBe("첫 줄\n둘째 줄");
    expect(inputs("노트: head 1000\n메모: 첫 줄\n둘째 줄\n입력: A 1000-1100")).toHaveLength(1);
  });

  it("노트: 줄을 두 번 쓰면 두 줄의 노트를 이어 붙임", () => {
    const parsed = parseJudgmentCase("노트: head 1000\n노트: long 1000-1200");
    expect(parsed.chart.notes.map((note) => note.type)).toEqual(["single", "long"]);
  });

  it("#으로 시작하는 줄과 빈 줄은 무시", () => {
    expect(parseJudgmentCase("# 주석\n\n노트: head 1000").chart.notes).toHaveLength(1);
  });

  it("제목·메모가 없으면 빈 문자열", () => {
    const parsed = parseJudgmentCase("노트: head 1000");
    expect(parsed.title).toBe("");
    expect(parsed.memo).toBe("");
  });

  it("머리글 없는 줄이 메모 밖에 있으면 줄 번호를 담은 JudgmentCaseSyntaxError", () => {
    expect(() => parseJudgmentCase("노트: head 1000\nhead 1200")).toThrow(JudgmentCaseSyntaxError);
    expect(() => parseJudgmentCase("노트: head 1000\nhead 1200")).toThrow(/2행/);
  });

  it("제목: 줄이 두 번 나오면 에러", () => {
    expect(() => parseJudgmentCase("제목: a\n제목: b")).toThrow(/제목/);
  });
});

describe("parseJudgmentCase — 노트 토큰", () => {
  it("1ms = 1박(BPM 60000)으로 저장해 beatToMs가 적은 ms를 그대로 돌려줌", () => {
    const { chart } = parseJudgmentCase("노트: long 1500-1560");
    const markers = extractBpmMarkers(chart.events);
    const note = chart.notes[0] as RangeNote;
    expect(beatToMs(note.beat, markers, chart.meta.offsetMs)).toBe(1500);
    expect(beatToMs(note.endBeat, markers, chart.meta.offsetMs)).toBe(1560);
  });

  it("소수 ms 1000.5는 Beat 2001/2로 저장", () => {
    expect(parseJudgmentCase("노트: head 1000.5").chart.notes[0].beat).toEqual(beat(2001, 2));
  });

  it("head·dhead·trill은 single·double·trill 포인트 노트, 기본 레인 1", () => {
    const { chart } = parseJudgmentCase("노트: head 1000 | dhead 1100 | trill 1200");
    expect(chart.notes).toEqual([
      { type: "single", lane: 1, beat: beat(1000) },
      { type: "double", lane: 1, beat: beat(1100) },
      { type: "trill", lane: 1, beat: beat(1200) },
    ]);
  });

  it("grace head 1000은 grace 플래그가 붙은 single", () => {
    expect(parseJudgmentCase("노트: grace head 1000").chart.notes[0]).toEqual({ type: "single", lane: 1, beat: beat(1000), grace: true });
  });

  it("long·dlong·tlong은 long·doubleLong·trillLong 구간 노트", () => {
    const { chart } = parseJudgmentCase("노트: long 0-100 | dlong 100-200 | tlong 200-300");
    expect(chart.notes.map((note) => note.type)).toEqual(["long", "doubleLong", "trillLong"]);
  });

  it("holdOnly 1000-1500은 holdOnly long, dholdOnly는 holdOnly doubleLong", () => {
    const { chart } = parseJudgmentCase("노트: holdOnly 1000-1500 | dholdOnly 1500-1600");
    expect(chart.notes).toEqual([
      { type: "long", lane: 1, beat: beat(1000), endBeat: beat(1500), holdOnly: true },
      { type: "doubleLong", lane: 1, beat: beat(1500), endBeat: beat(1600), holdOnly: true },
    ]);
  });

  it("수식어 holdOnly dlong 1000-1500은 dholdOnly와 같은 노트", () => {
    expect(parseJudgmentCase("노트: holdOnly dlong 1000-1500").chart.notes)
      .toEqual(parseJudgmentCase("노트: dholdOnly 1000-1500").chart.notes);
  });

  it("길이 0 holdOnly 1200-1200도 그대로 구간 노트로 만듦", () => {
    expect(parseJudgmentCase("노트: holdOnly 1200-1200").chart.notes[0])
      .toEqual({ type: "long", lane: 1, beat: beat(1200), endBeat: beat(1200), holdOnly: true });
  });

  it("L2: 접두사는 레인 2에 배치", () => {
    expect(parseJudgmentCase("노트: L2: head 1000 | L2:long 1000-1200").chart.notes.map((note) => note.lane)).toEqual([2, 2]);
  });

  it("종류 이름은 대소문자를 가리지 않아 HOLDONLY·Head도 읽음", () => {
    expect(parseJudgmentCase("노트: Head 1000 | HOLDONLY 1000-1200").chart.notes.map((note) => note.type)).toEqual(["single", "long"]);
  });

  it("시간 사이 공백 1000 - 1200도 구간으로 읽음", () => {
    expect((parseJudgmentCase("노트: long 1000 - 1200").chart.notes[0] as RangeNote).endBeat).toEqual(beat(1200));
  });

  it("끝이 시작보다 앞선 long 1200-1000도 거부하지 않고 차트에 남겨 검증이 잡게 함", () => {
    expect(parseJudgmentCase("노트: long 1200-1000").chart.notes).toHaveLength(1);
  });

  it("알 수 없는 노트 종류 hed 1000은 토큰을 담은 에러", () => {
    expect(() => parseJudgmentCase("노트: hed 1000")).toThrow(/hed/);
  });

  it("포인트 종류에 구간 시간 head 1000-1200을 쓰면 에러", () => {
    expect(() => parseJudgmentCase("노트: head 1000-1200")).toThrow(/head/);
  });

  it("구간 종류에 한 시각만 쓴 long 1000은 에러", () => {
    expect(() => parseJudgmentCase("노트: long 1000")).toThrow(/long/);
  });

  it("grace를 구간 노트에 붙인 grace long 0-100은 에러", () => {
    expect(() => parseJudgmentCase("노트: grace long 0-100")).toThrow(/grace/);
  });
});

describe("parseJudgmentCase — 노트 이름", () => {
  it("long 1500-1560 [가운데]는 둘째 노트 이름 가운데, 이름 없는 노트는 undefined", () => {
    const parsed = parseJudgmentCase("노트: holdOnly 1000-1500 | long 1500-1560 [가운데] | head 1560");
    expect(parsed.noteNames).toEqual([undefined, "가운데", undefined]);
    expect(parsed.chart.notes[1]).toEqual({ type: "long", lane: 1, beat: beat(1500), endBeat: beat(1560) });
  });

  it("이름을 하나도 붙이지 않으면 noteNames는 노트 수만큼 undefined", () => {
    expect(parseJudgmentCase("노트: head 1000 | long 1000-1200").noteNames).toEqual([undefined, undefined]);
  });

  it("레인 접두사·수식어와 함께 쓴 L2: grace head 1000 [왼손]은 레인 2 grace single, 이름 왼손", () => {
    const parsed = parseJudgmentCase("노트: L2: grace head 1000 [왼손]");
    expect(parsed.chart.notes[0]).toEqual({ type: "single", lane: 2, beat: beat(1000), grace: true });
    expect(parsed.noteNames).toEqual(["왼손"]);
  });

  it("이름 안의 하이픈과 공백 [교대 - 실패]는 시간 정규화의 영향을 받지 않고 그대로", () => {
    expect(parseJudgmentCase("노트: long 1000 - 1200 [교대 - 실패]").noteNames).toEqual(["교대 - 실패"]);
  });

  it("빈 이름 []는 줄 번호를 담은 에러", () => {
    expect(() => parseJudgmentCase("노트: head 1000 []")).toThrow(JudgmentCaseSyntaxError);
    expect(() => parseJudgmentCase("노트: head 1000 []")).toThrow(/1행.*이름이 비어/);
  });

  it("두 노트에 같은 이름 [가운데]를 쓰면 에러", () => {
    expect(() => parseJudgmentCase("노트: head 1000 [가운데] | long 1000-1200 [가운데]")).toThrow(/같은 이름 \[가운데\]/);
  });

  it("자동 이름 형식 [N2]·[n2]는 예약어라 에러", () => {
    expect(() => parseJudgmentCase("노트: head 1000 [N2]")).toThrow(/\[N2\].*자동 이름/);
    expect(() => parseJudgmentCase("노트: head 1000 [n2]")).toThrow(/\[n2\].*자동 이름/);
  });

  it("이름이 토큰 끝이 아닌 head [가운데] 1000은 에러", () => {
    expect(() => parseJudgmentCase("노트: head [가운데] 1000")).toThrow(/\[이름\]/);
  });

  it("zone 1000-2000 [구간]처럼 zone에 이름을 붙이면 에러", () => {
    expect(() => parseJudgmentCase("노트: zone 1000-2000 [구간] | trill 1000")).toThrow(/zone에는 이름/);
  });
});

describe("parseJudgmentCase — trillZone", () => {
  it("zone 1000-2000은 레인 1 trillZone", () => {
    expect(parseJudgmentCase("노트: zone 1000-2000 | trill 1000").chart.trillZones)
      .toEqual([{ lane: 1, beat: beat(1000), endBeat: beat(2000) }]);
  });

  it("zone 없이 trill 1000·tlong 1000-1500만 쓰면 레인 1에 1000~1500 trillZone을 자동 생성", () => {
    expect(parseJudgmentCase("노트: trill 1000 | tlong 1000-1500").chart.trillZones)
      .toEqual([{ lane: 1, beat: beat(1000), endBeat: beat(1500) }]);
  });

  it("trill 노트가 없으면 trillZone을 만들지 않음", () => {
    expect(parseJudgmentCase("노트: head 1000").chart.trillZones).toEqual([]);
  });
});

describe("parseJudgmentCase — 입력 토큰", () => {
  it("A 1000-1430은 1000에 누르고 1430에 떼는 tutorialInput 하나", () => {
    expect(inputs("입력: A 1000-1430")).toEqual([
      { type: "tutorialInput", lane: 1, keyCode: "A", keyLabel: "A", beat: beat(1000), endBeat: beat(1430) },
    ]);
  });

  it("같은 키를 | 로 이어 A 0-100 | A 200-300이면 tutorialInput 두 개를 적은 순서대로 만듦", () => {
    expect(inputs("입력: A 0-100 | A 200-300").map((event) => [event.beat.n, event.endBeat.n])).toEqual([[0, 100], [200, 300]]);
  });

  it("A 1000- 처럼 끝이 없으면 떼지 않은 입력으로 표시하고 endBeat는 마지막 시각 뒤에 둠", () => {
    const parsed = parseJudgmentCase("노트: long 1000-2000\n입력: A 1000- | B 1500-1600");
    const firstInputIndex = parsed.chart.events.findIndex((event) => event.type === "tutorialInput");
    expect(parsed.unreleasedInputEventIndices).toEqual([firstInputIndex]);
    const open = parsed.chart.events[firstInputIndex] as TutorialInputEvent;
    expect(open.endBeat.n / open.endBeat.d).toBeGreaterThan(2000);
  });

  it("L2:A 1000-1100은 레인 2 입력", () => {
    expect(inputs("입력: L2:A 1000-1100")[0].lane).toBe(2);
  });

  it("레인 5 입력 L5:A 0-100은 tutorialInput 레인 범위(1~4) 밖이라 에러", () => {
    expect(() => parseJudgmentCase("입력: L5:A 0-100")).toThrow(/레인/);
  });

  it("시간 구분자가 없는 A 1000은 에러", () => {
    expect(() => parseJudgmentCase("입력: A 1000")).toThrow(/A 1000/);
  });
});

describe("parseJudgmentCase — 차트 모델", () => {
  it("차트에는 0박 BPM 60000과 1000박 마디 박자표가 있고 restZones는 빈 배열", () => {
    const { chart } = parseJudgmentCase(D4);
    expect(chart.events.slice(0, 2)).toEqual([
      { type: "bpm", beat: beat(0), bpm: 60000 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(1000) },
    ]);
    expect(chart.restZones).toEqual([]);
    expect(chart.meta.offsetMs).toBe(0);
    expect(chart.meta.title).toBe("결정 ④ — A를 1430에 뗌");
  });
});

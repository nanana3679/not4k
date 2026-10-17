import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import type { NoteJudgmentEvent } from "./NoteJudgmentCore";
import { body, counts, judgments, playHolds, point, unsettledItemIds, type KeyHold } from "./noteJudgmentTestHarness";

/**
 * RFD 0032(hold 수로 바디의 시작과 유지 판단)가 기대 결과를 적은 차트·입력의 회귀 사례.
 * docs/rfd/0032-body-held-count.md §1~§9 본문·표·예시에서 채택한 결과만 옮긴다(부록 A의 기각안은 제외).
 *
 * 엔진은 아직 RFD 0020(등록 키) 모델이다. main이 이미 RFD 결과를 내는 사례는 it, 아직 다른 사례는 it.fails로 두고
 * 바로 위 주석에 main의 실제 결과를 적는다. 엔진을 RFD 0032로 옮기면 it.fails가 통과로 바뀌어 실패하므로 it으로 고친다.
 *
 * 노트 이름은 차트 배열 순서의 N1, N2, …(RFD와 같은 순서)이다. 판정 창은 Normal(Perfect ±41ms, Great ±82ms, Good ±120ms),
 * 시각은 ms이며 Beat에도 같은 수를 쓴다. 입력 [키, down, up]은 RFD의 "A 1000–1800"과 같다.
 */

type Harness = ReturnType<typeof playHolds>;
interface Outcome { lines: string[]; perfect: number; great: number; good: number; miss: number; unsettled: string[] }

const signed = (value: number) => value > 0 ? `+${value}` : `${value}`;

/**
 * 판정 하나를 한 줄로 적는다. 종속 0점(dependentZero)은 Miss가 아니므로 줄로 만들지 않고, 미정산 항목 검사로 확인한다.
 * - 성공: "N3 head great +50", "N1 release perfect -10", "N1 holdOnly perfect"
 * - Miss: "N2 head miss@2120", "N1 release miss@2120", "N3 maintenanceMiss@2220" (@ 뒤는 확정 시각)
 */
function line(event: NoteJudgmentEvent): string {
  const note = `N${event.noteIndex + 1}`;
  if (event.kind === "maintenanceMiss") return `${note} maintenanceMiss@${event.confirmedAt}`;
  if (event.grade === "miss") return `${note} ${event.kind} miss@${event.confirmedAt}`;
  if (event.kind === "holdOnly") return `${note} holdOnly ${event.grade}`;
  return `${note} ${event.kind} ${event.grade} ${signed(event.deltaMs)}`;
}

const noteOrder = (text: string) => Number(text.slice(1, text.indexOf(" ")));
const sortLines = (lines: readonly string[]) => [...lines].sort((a, b) => noteOrder(a) - noteOrder(b) || a.localeCompare(b));

function outcome(h: Harness): Outcome {
  const tally = counts(h.events);
  return {
    lines: sortLines(judgments(h.events).map(line)),
    perfect: tally.perfect, great: tally.great, good: tally.good + tally.goodTrill, miss: tally.miss,
    unsettled: unsettledItemIds(h),
  };
}

/** 노트별 판정 줄과 Perfect/Great/Good/Miss 합계를 확인하고, 모든 점수 항목이 정산됐는지도 본다. */
function expectOutcome(h: Harness, lines: readonly string[], total: Partial<Pick<Outcome, "perfect" | "great" | "good" | "miss">>) {
  expect(outcome(h)).toEqual({ lines: sortLines(lines), perfect: 0, great: 0, good: 0, miss: 0, ...total, unsettled: [] });
}

function play(notes: readonly NoteEntity[], ...holds: KeyHold[]) {
  return playHolds(notes, holds);
}

/** `long [1000,2000]` → `head 2000` + `long [2000,end]`: 같은 unit 수 single 연결. */
const singleConnection = (end = 3000) => [body(1000, 2000), point(2000), body(2000, end)];
/** `doubleLong [1000,2000]` → `head 2000` + `doubleLong [2000,end]`: single head가 있는 double 연결. */
const doubleConnection = (end: number) => [body(1000, 2000, "doubleLong"), point(2000), body(2000, end, "doubleLong")];
/** `doubleLong [1000,2000]` → `head 2000` + `long [2000,end]`: head가 있는 2→1 감소. */
const headDecrease = (end = 3000) => [body(1000, 2000, "doubleLong"), point(2000), body(2000, end)];
/** `doubleLong [1000,1950]` → `head 1950` + `doubleLong [1950,2000]` → `long [2000,3000]`: 감소 지점 50ms 앞의 head. */
const headBeforeDecrease = () => [body(1000, 1950, "doubleLong"), point(1950), body(1950, 2000, "doubleLong"), body(2000, 3000)];

describe("RFD 0032 §1-1 기존 결정과 문제", () => {
  // main: head 없는 N2 시작에 새 down을 요구해 S+Good 1620에 N2 유지 Miss — Perfect 2·Great 1·Miss 1
  it.fails("holdOnly [1000,1500] → long [1500,1560] → head 1560 + long [1560,1760]에서 A 1000–1430·D 1490–1760이면 D down이 N3를 Great(−70)로 치고 D의 hold 1개로 N2·N4를 유지해 Perfect 2·Great 1·Miss 0", () => {
    const h = play([body(1000, 1500, "long", true), body(1500, 1560), point(1560), body(1560, 1760)], ["A", 1000, 1430], ["D", 1490, 1760]);
    expectOutcome(h, ["N1 holdOnly perfect", "N3 head great -70", "N4 release perfect 0"], { perfect: 2, great: 1 });
  });
});

describe("RFD 0032 §2-1 hold 수로 시작과 유지 판단", () => {
  // §2-1의 변형: B를 끝 창 밖인 2500에 떼도(RFD에 B up 시각이 없어 끝 창 밖으로 둠) C의 hold로 남은 몫을 유지한다.
  // main: 유예 없이 1800에 한 몫, B up 2500에 남은 몫까지 유지 Miss — Miss 2
  it.fails("doubleLong [1000,3000]에서 A 1000–1800·B 1000–2500·C 1830–3000이면 한 몫은 1820에 유지 Miss이고 B를 2500에 떼도 C의 hold로 남은 몫을 유지해 C up이 release Perfect", () => {
    const h = play([body(1000, 3000, "doubleLong")], ["A", 1000, 1800], ["B", 1000, 2500], ["C", 1830, 3000]);
    expectOutcome(h, ["N1 maintenanceMiss@1820", "N1 release perfect 0"], { perfect: 1, miss: 1 });
  });
});

describe("RFD 0032 §2-2 유지 유예", () => {
  // main: 유예 없이 A up 1800에 바로 유지 Miss(@1800) — 합계는 같은 Perfect 1·Miss 1
  it.fails("doubleLong [1000,3000]에서 A 1000–1800·B 1000–3000·C 1830–3000이면 hold 1개인 30ms 공백이 유예 20ms보다 길어 한 몫이 1820에 유지 Miss이고 남은 몫은 release Perfect", () => {
    const h = play([body(1000, 3000, "doubleLong")], ["A", 1000, 1800], ["B", 1000, 3000], ["C", 1830, 3000]);
    expectOutcome(h, ["N1 maintenanceMiss@1820", "N1 release perfect 0"], { perfect: 1, miss: 1 });
  });

  // main: 유예 없이 1800·1810에 두 몫 모두 유지 Miss — Miss 2
  it.fails("doubleLong [1000,3000]에서 hold 수가 2→1→0→1→2(A up 1800·B up 1810·C down 1815·D down 1825)면 2 기준 공백 25ms로 한 몫만 1820에 유지 Miss이고 1 기준 공백 5ms는 유예 안이라 남은 몫은 release Perfect", () => {
    const h = play([body(1000, 3000, "doubleLong")], ["A", 1000, 1800], ["B", 1000, 1810], ["C", 1815, 3000], ["D", 1825, 3000]);
    expectOutcome(h, ["N1 maintenanceMiss@1820", "N1 release perfect 0"], { perfect: 1, miss: 1 });
  });
});

describe("RFD 0032 §2-3 release 등급과 자격, 판정 창 기준", () => {
  it("doubleLong holdOnly [1000,1500] → long [1500,2000]에서 A 1000–2000·B 1000–2500이면 2→1인 A up 2000도 N2의 release 후보라 Perfect 3", () => {
    const h = play([body(1000, 1500, "doubleLong", true), body(1500, 2000)], ["A", 1000, 2000], ["B", 1000, 2500]);
    expectOutcome(h, ["N1 holdOnly perfect", "N1 holdOnly perfect", "N2 release perfect 0"], { perfect: 3 });
  });

  // main: A up 1090은 시작 안 한 N2의 release가 아니고 A down 1140이 N2를 시작해 A up 1200으로 Perfect — Perfect 2
  it.fails("head 1000 → head 없는 long [1100,1200]에서 A 1000–1090·1140–1200이면 시작 전 A up 1090도 N2 끝의 Good 창 안이라 N2 release Good(−110)이고 Perfect 1·Good 1", () => {
    const h = play([point(1000), body(1100, 1200)], ["A", 1000, 1090], ["A", 1140, 1200]);
    expectOutcome(h, ["N1 head perfect 0", "N2 release good -110"], { perfect: 1, good: 1 });
  });

  // main: A up 1105는 N2에 쓰이지 않고 A down 1140이 N2를 시작해 A up 1200으로 Perfect — Perfect 2
  it.fails("head 1000 → head 없는 long [1100,1200]에서 A 1000–1105·1140–1200이면 A up 1105가 N2 release Good(−95)이고 Perfect 1·Good 1", () => {
    const h = play([point(1000), body(1100, 1200)], ["A", 1000, 1105], ["A", 1140, 1200]);
    expectOutcome(h, ["N1 head perfect 0", "N2 release good -95"], { perfect: 1, good: 1 });
  });

  it("head 1000 → head 없는 long [1100,1200]에서 A 1000–1050·1080–1090·1140–1200으로 A를 1080–1090에 탭해도 A up 1090이 N2 release Good(−110)이라 Perfect 1·Good 1", () => {
    const h = play([point(1000), body(1100, 1200)], ["A", 1000, 1050], ["A", 1080, 1090], ["A", 1140, 1200]);
    expectOutcome(h, ["N1 head perfect 0", "N2 release good -110"], { perfect: 1, good: 1 });
  });
});

describe("RFD 0032 §2-4 여러 끝에 적격인 up의 순서와 키 재사용", () => {
  it("doubleLong [1000,2000] → 10ms 뒤 long [2010,2060]에서 A 1000–2500·B 1000–1990·2010–2060이면 두 번째 B up은 N1에 이미 쓴 키라 N2를 처리해 N1u1 Perfect(−10)·N2 Perfect·N1 남은 release Miss", () => {
    const h = play([body(1000, 2000, "doubleLong"), body(2010, 2060)], ["A", 1000, 2500], ["B", 1000, 1990], ["B", 2010, 2060]);
    expectOutcome(h, ["N1 release perfect -10", "N1 release miss@2120", "N2 release perfect 0"], { perfect: 2, miss: 1 });
  });

  // main: C up이 N2를 Perfect로 처리하고 N1u2는 2120에 Miss — Perfect 2·Miss 1
  it.fails("doubleLong [1000,2000] → 10ms 뒤 long [2010,2060]에서 A 1000–2500·B 1000–1990·C 2010–2060이면 N1에 쓰지 않은 C의 up은 더 이른 끝인 N1u2를 Great(+60)로 처리하고 N2는 Miss", () => {
    const h = play([body(1000, 2000, "doubleLong"), body(2010, 2060)], ["A", 1000, 2500], ["B", 1000, 1990], ["C", 2010, 2060]);
    expectOutcome(h, ["N1 release perfect -10", "N1 release great +60", "N2 release miss@2180"], { perfect: 1, great: 1, miss: 1 });
  });
});

describe("RFD 0032 §2-5 바디 중간 교대와 끝 창 안의 교대", () => {
  // main: 등록 키 A를 떼는 1500에 바로 유지 Miss — Miss 1
  it.fails("long [1000,2000]에서 A 1000–1500·B 1490–2000으로 끝 창 밖에서 교대하면 A up은 중립이고 B up이 끝을 처리해 Perfect 1", () => {
    const h = play([body(1000, 2000)], ["A", 1000, 1500], ["B", 1490, 2000]);
    expectOutcome(h, ["N1 release perfect 0"], { perfect: 1 });
  });

  it("long [1000,2000]에서 A 1000–1900·B 1895–2500으로 끝 창 안에서 교대하면 A up 1900이 이른 release Good(−100)", () => {
    const h = play([body(1000, 2000)], ["A", 1000, 1900], ["B", 1895, 2500]);
    expectOutcome(h, ["N1 release good -100"], { good: 1 });
  });
});

describe("RFD 0032 §2-6 짧게 떨어진 독립 롱노트와 분리 표시", () => {
  it("long [1000,2000] → 10ms 뒤 long [2010,3000]에서 A 1000–1950·B 1960–3000이면 A up은 hold 회복과 관계없이 N1 release Great(−50)이고 N2 Perfect", () => {
    const h = play([body(1000, 2000), body(2010, 3000)], ["A", 1000, 1950], ["B", 1960, 3000]);
    expectOutcome(h, ["N1 release great -50", "N2 release perfect 0"], { perfect: 1, great: 1 });
  });

  it("long [1000,2000] → 10ms 뒤 long [2010,3000]에서 A 1000–2000·B 1995–3000으로 겹쳐 누르면 hold 2→1인 A up 2000도 N1 release Perfect이고 N2 Perfect", () => {
    const h = play([body(1000, 2000), body(2010, 3000)], ["A", 1000, 2000], ["B", 1995, 3000]);
    expectOutcome(h, ["N1 release perfect 0", "N2 release perfect 0"], { perfect: 2 });
  });
});

describe("RFD 0032 §3-1 두 release는 서로 다른 키", () => {
  it("doubleLong [1000,2000]에서 A 1000–2500·B 1000–1980·1990–2000으로 B만 두 번 떼면 두 번째 B up은 같은 double 끝에 쓰지 못해 Perfect 1·Miss 1", () => {
    const h = play([body(1000, 2000, "doubleLong")], ["A", 1000, 2500], ["B", 1000, 1980], ["B", 1990, 2000]);
    expectOutcome(h, ["N1 release perfect -20", "N1 release miss@2120"], { perfect: 1, miss: 1 });
  });
});

describe("RFD 0032 §3-2 유지 키와 다른 키의 up", () => {
  // main: 유지·시작에 등록되지 않은 C/D의 up을 release로 인정하지 않아 2120에 두 release Miss — Miss 2
  it.fails("doubleLong [1000,2000]에서 A/B 1000–2500을 유지하고 C 1970–1980·D 1990–2000을 치면 C·D up이 두 release를 처리해 Perfect 2", () => {
    const h = play([body(1000, 2000, "doubleLong")], ["A", 1000, 2500], ["B", 1000, 2500], ["C", 1970, 1980], ["D", 1990, 2000]);
    expectOutcome(h, ["N1 release perfect -20", "N1 release perfect 0"], { perfect: 2 });
  });
});

describe("RFD 0032 §3-3 노트를 처리한 같은 키의 재누름", () => {
  it("doubleLong [1000,2000] → head 2000 + doubleLong [2000,2100]에서 A 1000–2010·B 1000–2040·2050–2100이면 head를 친 B의 재누름 up이 N3u2를 처리해 Perfect 1·Great 2", () => {
    const h = play(doubleConnection(2100), ["A", 1000, 2010], ["B", 1000, 2040], ["B", 2050, 2100]);
    expectOutcome(h, ["N2 head great +50", "N3 release great -60", "N3 release perfect 0"], { perfect: 1, great: 2 });
  });

  it("doubleLong [1000,2000] → head 2000 + doubleLong [2000,2100]에서 A/B를 2040에 함께 떼고 B 2050–2100이면 어느 up을 연결 release에 배정해도 Perfect 1·Great 2", () => {
    const h = play(doubleConnection(2100), ["A", 1000, 2040], ["B", 1000, 2040], ["B", 2050, 2100]);
    expectOutcome(h, ["N2 head great +50", "N3 release great -60", "N3 release perfect 0"], { perfect: 1, great: 2 });
  });
});

describe("RFD 0032 §4-1 연결 release", () => {
  it("long [1000,2000] → head 2000 + long [2000,2060]을 교대(A 1000–2010·B 2000–2060)로 치면 A up이 연결 release이고 B up이 N3 끝이라 Perfect 2", () => {
    const h = play(singleConnection(2060), ["A", 1000, 2010], ["B", 2000, 2060]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release perfect 0"], { perfect: 2 });
  });

  // main: A up 2060이 연결 보정 몫으로 쓰여 N3 release Miss — Perfect 1·Miss 1 (#281)
  it.fails("long [1000,2000] → head 2000 + long [2000,2060]을 A 1000–2060 유지 중 B 2000–2010 탭으로 치면 B up이 연결 release이고 A up이 N3 끝이라 Perfect 2", () => {
    const h = play(singleConnection(2060), ["A", 1000, 2060], ["B", 2000, 2010]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release perfect 0"], { perfect: 2 });
  });

  it("long [1000,2000] → head 2000 + long [2000,2060]에서 A 1000–2010·B 2000–2500이면 A up이 연결 release라 N3 창 안의 up이 없어 N3 release Miss", () => {
    const h = play(singleConnection(2060), ["A", 1000, 2010], ["B", 2000, 2500]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release miss@2180"], { perfect: 1, miss: 1 });
  });

  // main: B up 2150을 N3 release로 쓰지 않고 A up 2200이 N3 Perfect — Perfect 2
  it.fails("long [1000,2000] → head 2000 + long [2000,2200]에서 A 1000–2200·B 2000–2150이면 B up 2150은 head의 Good 창 밖이라 연결 release가 아니고 N3 이른 release Great(−50)", () => {
    const h = play(singleConnection(2200), ["A", 1000, 2200], ["B", 2000, 2150]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release great -50"], { perfect: 1, great: 1 });
  });
});

describe("RFD 0032 §4-2 경계 전에 뗀 연결 release", () => {
  it("long [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–1960·B 2000–3000이면 A up이 N1 끝의 Good 창 안에서 앞 바디를 끝내 유지 실패 없이 Perfect 2", () => {
    const h = play(singleConnection(), ["A", 1000, 1960], ["B", 2000, 3000]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release perfect 0"], { perfect: 2 });
  });
});

describe("RFD 0032 §4-3 head를 처리한 down부터 뒤 바디 유지", () => {
  it("long [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–2010·B 2030–3000이면 hold가 빈 20ms와 관계없이 N3 유지를 B down부터 판단해 Perfect 2", () => {
    const h = play(singleConnection(), ["A", 1000, 2010], ["B", 2030, 3000]);
    expectOutcome(h, ["N2 head perfect +30", "N3 release perfect 0"], { perfect: 2 });
  });

  it("long [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–2010·B 2040–3000이면 30ms 공백도 head를 친 B down 전이라 유지 실패가 아니고 Perfect 2", () => {
    const h = play(singleConnection(), ["A", 1000, 2010], ["B", 2040, 3000]);
    expectOutcome(h, ["N2 head perfect +40", "N3 release perfect 0"], { perfect: 2 });
  });

  it("long [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–2010·B 2100–3000으로 head를 늦게 치면 N2 Good(+100)이고 N3는 B down부터 유지해 Perfect 1·Good 1", () => {
    const h = play(singleConnection(), ["A", 1000, 2010], ["B", 2100, 3000]);
    expectOutcome(h, ["N2 head good +100", "N3 release perfect 0"], { perfect: 1, good: 1 });
  });

  // main: N3가 A up 1980에 바로 유지 Miss(@1980)이고 N1도 2120에 유지 Miss
  it.fails("long [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–1980·B 1960–1990·C 2015–3000으로 head를 일찍 치면 N3 유지를 B down 1960부터 판단해 1990부터 빈 hold가 2010에 N3 유지 Miss", () => {
    const h = play(singleConnection(), ["A", 1000, 1980], ["B", 1960, 1990], ["C", 2015, 3000]);
    // RFD는 N2·N3만 정했다. N1의 실패 여부와 전체 Miss 수는 승인하지 않았으므로 확인하지 않는다.
    const { lines, unsettled } = outcome(h);
    expect({ lines: lines.filter(text => /^N[23] /.test(text)), unsettled }).toEqual({ lines: ["N2 head perfect -40", "N3 maintenanceMiss@2010"], unsettled: [] });
  });

  it("doubleLong [1000,2000] → head 2000 + doubleLong [2000,2100]에서 A 1000–2010·C 1000–2100·B 2050–2100이면 head가 맡는 몫을 B down부터 판단해 N2 Great(+50)·N3 두 끝 Perfect", () => {
    const h = play(doubleConnection(2100), ["A", 1000, 2010], ["C", 1000, 2100], ["B", 2050, 2100]);
    expectOutcome(h, ["N2 head great +50", "N3 release perfect 0", "N3 release perfect 0"], { perfect: 2, great: 1 });
  });

  // main: 합계는 Perfect 3이지만 연결 보정이 A up 2010을 먼저 가져가 B up 2015가 감소 release(+15)
  it.fails("doubleLong [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–2010·B 1000–2015·C 2040–3000이면 N3 유지를 C down부터 판단해 감소 release·head·끝 모두 Perfect 3", () => {
    const h = play(headDecrease(), ["A", 1000, 2010], ["B", 1000, 2015], ["C", 2040, 3000]);
    expectOutcome(h, ["N1 release perfect +10", "N2 head perfect +40", "N3 release perfect 0"], { perfect: 3 });
  });
});

describe("RFD 0032 §4-4 single head가 있는 double 연결의 연주", () => {
  // main: A/B up 2100 중 하나가 연결 보정 몫으로 쓰여 N3 한 끝 Miss — Perfect 2·Miss 1 (#281)
  it.fails("doubleLong [1000,2000] → head 2000 + doubleLong [2000,2100]을 두 키 유지 중 탭(A/B 1000–2100·C 2000–2020)으로 치면 C up이 연결 release이고 A/B up이 N3 두 끝이라 Perfect 3", () => {
    const h = play(doubleConnection(2100), ["A", 1000, 2100], ["B", 1000, 2100], ["C", 2000, 2020]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release perfect 0", "N3 release perfect 0"], { perfect: 3 });
  });

  it("doubleLong [1000,2000] → head 2000 + doubleLong [2000,2100]을 한 키 유지 중 교대(C 1000–2100·A 1000–2010·B 2000–2100)로 치면 A up이 연결 release이고 B/C up이 N3 두 끝이라 Perfect 3", () => {
    const h = play(doubleConnection(2100), ["C", 1000, 2100], ["A", 1000, 2010], ["B", 2000, 2100]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release perfect 0", "N3 release perfect 0"], { perfect: 3 });
  });
});

describe("RFD 0032 §4-5 double head가 있는 double 연결", () => {
  const chart = () => [body(1000, 2000, "doubleLong"), point(2000, "double"), body(2000, 2100, "doubleLong")];
  const fourPerfect = ["N2 head perfect 0", "N2 head perfect 0", "N3 release perfect 0", "N3 release perfect 0"];

  it("doubleLong [1000,2000] → double head 2000 + doubleLong [2000,2100]을 다른 두 키로 교대(A/B 1000–2010·C/D 2000–2100)하면 Perfect 4", () => {
    const h = play(chart(), ["A", 1000, 2010], ["B", 1000, 2010], ["C", 2000, 2100], ["D", 2000, 2100]);
    expectOutcome(h, fourPerfect, { perfect: 4 });
  });

  // main: A/B up 2100이 연결 보정 몫으로 쓰여 N3 두 끝 Miss — Perfect 2·Miss 2 (#281)
  it.fails("doubleLong [1000,2000] → double head 2000 + doubleLong [2000,2100]을 두 키 유지 중 다른 두 키로 탭(A/B 1000–2100·C/D 2000–2020)하면 C/D up이 연결 release이고 A/B up이 N3 두 끝이라 Perfect 4", () => {
    const h = play(chart(), ["A", 1000, 2100], ["B", 1000, 2100], ["C", 2000, 2020], ["D", 2000, 2020]);
    expectOutcome(h, fourPerfect, { perfect: 4 });
  });

  it("doubleLong [1000,2000] → double head 2000 + doubleLong [2000,2100]을 같은 두 키로 재타격(A/B 1000–1990·2000–2100)하면 Perfect 4", () => {
    const h = play(chart(), ["A", 1000, 1990], ["B", 1000, 1990], ["A", 2000, 2100], ["B", 2000, 2100]);
    expectOutcome(h, fourPerfect, { perfect: 4 });
  });
});

describe("RFD 0032 §5-1 계속 유지한 뒤 바디", () => {
  it("long [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–3000만 누르면 2120에 N2 Miss이고 계속 유지한 N3는 A up 3000으로 release Perfect", () => {
    const h = play(singleConnection(), ["A", 1000, 3000]);
    expectOutcome(h, ["N2 head miss@2120", "N3 release perfect 0"], { perfect: 1, miss: 1 });
  });
});

describe("RFD 0032 §5-2 head 창 안에서 끊김", () => {
  it("long [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–2010만 누르면 head 창 안에서 끊겨 N2 Miss 하나만 내고 N3 끝은 종속 0점", () => {
    const h = play(singleConnection(), ["A", 1000, 2010]);
    expectOutcome(h, ["N2 head miss@2120"], { miss: 1 });
  });
});

describe("RFD 0032 §5-3 head 창 뒤에 끊김", () => {
  // main: 유예 없이 A up 2200에 바로 N3 유지 Miss(@2200)
  it.fails("long [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–2200만 누르면 2120에 N2 Miss이고 head 창 뒤 끊김은 유예 뒤 2220에 N3 유지 Miss라 Miss 2", () => {
    const h = play(singleConnection(), ["A", 1000, 2200]);
    expectOutcome(h, ["N2 head miss@2120", "N3 maintenanceMiss@2220"], { miss: 2 });
  });
});

describe("RFD 0032 §5-4 double 연결에서 head가 맡는 몫", () => {
  it("doubleLong [1000,2000] → head 2000 + doubleLong [2000,3000]에서 C·A 1000–3000이면 2120에 N2 Miss이고 A·C up이 N3 두 release Perfect", () => {
    const h = play(doubleConnection(3000), ["C", 1000, 3000], ["A", 1000, 3000]);
    expectOutcome(h, ["N2 head miss@2120", "N3 release perfect 0", "N3 release perfect 0"], { perfect: 2, miss: 1 });
  });

  it("doubleLong [1000,2000] → head 2000 + doubleLong [2000,3000]에서 C 1000–3000·A 1000–2010이면 2120에 N2 Miss, head가 맡는 몫은 종속 0점이고 C up이 남은 release Perfect", () => {
    const h = play(doubleConnection(3000), ["C", 1000, 3000], ["A", 1000, 2010]);
    expectOutcome(h, ["N2 head miss@2120", "N3 release perfect 0"], { perfect: 1, miss: 1 });
  });

  // main: 유예 없이 A up 2200에 바로 N3 한 몫 유지 Miss(@2200)
  it.fails("doubleLong [1000,2000] → head 2000 + doubleLong [2000,3000]에서 C 1000–3000·A 1000–2200이면 2120에 N2 Miss, 2220에 N3 한 몫 유지 Miss이고 C up이 남은 release Perfect", () => {
    const h = play(doubleConnection(3000), ["C", 1000, 3000], ["A", 1000, 2200]);
    expectOutcome(h, ["N2 head miss@2120", "N3 maintenanceMiss@2220", "N3 release perfect 0"], { perfect: 1, miss: 2 });
  });
});

describe("RFD 0032 §5-5 짧은 뒤 바디", () => {
  it("long [1000,2000] → head 2000 + 짧은 long [2000,2060]에서 A 1000–2060만 누르면 head 전 A up이 연결 release라 2120에 N2 Miss와 N3 끝 종속 0점으로 Miss 1", () => {
    const h = play(singleConnection(2060), ["A", 1000, 2060]);
    expectOutcome(h, ["N2 head miss@2120"], { miss: 1 });
  });

  it("doubleLong [1000,2000] → head 2000 + 짧은 doubleLong [2000,2060]에서 A/B 1000–2060만 누르면 한 up이 연결 release, 다른 up이 N3 한 끝 Perfect이고 N2 Miss라 Perfect 1·Miss 1", () => {
    const h = play(doubleConnection(2060), ["A", 1000, 2060], ["B", 1000, 2060]);
    expectOutcome(h, ["N2 head miss@2120", "N3 release perfect 0"], { perfect: 1, miss: 1 });
  });
});

describe("RFD 0032 §6-1 1→2 증가", () => {
  const chart = () => [body(1000, 2000), body(2000, 3000, "doubleLong")];
  const twoPerfect = ["N2 release perfect 0", "N2 release perfect 0"];

  it("long [1000,2000] → head 없는 doubleLong [2000,3000]에서 A 1000–3000·B 2000–3000이면 Perfect 2", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 2000, 3000]), twoPerfect, { perfect: 2 });
  });

  // main: 미리 누른 B를 시작 입력으로 인정하지 않아 2120에 N2u2 시작 실패 — Perfect 1·Miss 1
  it.fails("long [1000,2000] → head 없는 doubleLong [2000,3000]에서 늘어난 몫의 B를 1500에 미리 눌러도 hold 수에 들어가 Perfect 2", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 1500, 3000]), twoPerfect, { perfect: 2 });
  });

  it("long [1000,2000] → head 없는 doubleLong [2000,3000]에서 B를 S+Good(2120) 안인 2050에 눌러도 시작 점수가 없어 Perfect 2", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 2050, 3000]), twoPerfect, { perfect: 2 });
  });

  it("long [1000,2000] → head 없는 doubleLong [2000,3000]에서 B를 2200에 누르면 2120에 N2u2 시작 실패 Miss이고 B는 실패한 몫을 되살리지 않아 Perfect 1·Miss 1", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 2200, 3000]), ["N2 maintenanceMiss@2120", "N2 release perfect 0"], { perfect: 1, miss: 1 });
  });

  // main: B down 2040을 head에만 써서 늘어난 몫이 2120에 시작 실패 — Perfect 2·Miss 1
  it.fails("long [1000,2000] → head 2000 + doubleLong [2000,3000]에서 A 1000–3000·B 2040–3000이면 B down이 head를 치고 늘어난 몫도 채워 Perfect 3", () => {
    const h = play([body(1000, 2000), point(2000), body(2000, 3000, "doubleLong")], ["A", 1000, 3000], ["B", 2040, 3000]);
    expectOutcome(h, ["N2 head perfect +40", "N3 release perfect 0", "N3 release perfect 0"], { perfect: 3 });
  });
});

describe("RFD 0032 §6-2 head 없는 2→1", () => {
  const chart = () => [body(1000, 2000, "doubleLong"), body(2000, 3000)];

  it("doubleLong [1000,2000] → head 없는 long [2000,3000]에서 A 1000–3000·B 1000–2000이면 B up이 감소 release Perfect이고 Perfect 2", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 1000, 2000]), ["N1 release perfect 0", "N2 release perfect 0"], { perfect: 2 });
  });

  it("doubleLong [1000,2000] → head 없는 long [2000,3000]에서 B를 1950에 떼면 감소 release Great(−50)이고 N2 Perfect", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 1000, 1950]), ["N1 release great -50", "N2 release perfect 0"], { perfect: 1, great: 1 });
  });

  it("doubleLong [1000,2000] → head 없는 long [2000,3000]에서 B를 3000까지 유지하면 hold 수가 남아도 2120에 감소 release Miss이고 Perfect 1·Miss 1", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 1000, 3000]), ["N1 release miss@2120", "N2 release perfect 0"], { perfect: 1, miss: 1 });
  });
});

describe("RFD 0032 §6-3 head가 있는 2→1과 감소 release", () => {
  // main: 합계는 Perfect 3이지만 연결 보정이 A up 2015를 먼저 가져가 B up 2030이 감소 release(+30)
  it.fails("doubleLong [1000,2000] → head 2000 + long [2000,3000]에서 A up 2015·C 2020–3000·B up 2030이면 첫 A up이 감소 release, B up이 연결 release라 Perfect 3", () => {
    const h = play(headDecrease(), ["A", 1000, 2015], ["B", 1000, 2030], ["C", 2020, 3000]);
    expectOutcome(h, ["N1 release perfect +15", "N2 head perfect +20", "N3 release perfect 0"], { perfect: 3 });
  });

  // main: B up 2015가 연결 보정 몫으로 쓰여 감소 release가 2120에 Miss — Perfect 2·Miss 1
  it.fails("doubleLong [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–3000을 유지하고 B up 2015 뒤 C 2020–3000(ab--c--)이면 경계 근처 up 1개가 감소 release라 Perfect 3", () => {
    const h = play(headDecrease(), ["A", 1000, 3000], ["B", 1000, 2015], ["C", 2020, 3000]);
    expectOutcome(h, ["N1 release perfect +15", "N2 head perfect +20", "N3 release perfect 0"], { perfect: 3 });
  });

  // main: C up 2020이 연결 보정 몫으로 쓰여 감소 release가 2120에 Miss — Perfect 2·Miss 1
  it.fails("doubleLong [1000,2000] → head 2000 + long [2000,3000]에서 A/B 1000–3000 유지 중 C 2000–2020 탭이면 C up이 감소 release라 Perfect 3", () => {
    const h = play(headDecrease(), ["A", 1000, 3000], ["B", 1000, 3000], ["C", 2000, 2020]);
    expectOutcome(h, ["N1 release perfect +20", "N2 head perfect 0", "N3 release perfect 0"], { perfect: 3 });
  });

  // main: 합계는 Perfect 3이지만 B up 2010이 연결 보정 몫으로 쓰이고 C up 2020이 감소 release(+20)
  it.fails("doubleLong [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–3000 유지, C 2000–2020 탭, B up 2010이면 B up이 감소 release, C up이 연결 release라 Perfect 3", () => {
    const h = play(headDecrease(), ["A", 1000, 3000], ["B", 1000, 2010], ["C", 2000, 2020]);
    expectOutcome(h, ["N1 release perfect +10", "N2 head perfect 0", "N3 release perfect 0"], { perfect: 3 });
  });

  // main: 합계는 Perfect 3이지만 B up 2015가 연결 보정 몫으로 쓰이고 C up 2040이 감소 release(+40)
  it.fails("doubleLong [1000,2000] → head 2000 + long [2000,3000]에서 A 1000–3000 유지, B up 2015 뒤 C 2020–2040 탭이면 B up이 감소 release, C up이 연결 release라 Perfect 3", () => {
    const h = play(headDecrease(), ["A", 1000, 3000], ["B", 1000, 2015], ["C", 2020, 2040]);
    expectOutcome(h, ["N1 release perfect +15", "N2 head perfect +20", "N3 release perfect 0"], { perfect: 3 });
  });

  // main: B up 2015가 연결 보정 몫으로 쓰이고 C up 2060이 감소 release Great(+60), N3 끝 Miss — Perfect 1·Great 1·Miss 1
  it.fails("doubleLong [1000,2000] → head 2000 + 짧은 long [2000,2060]에서 A를 2500까지 쥐고 B up 2015·C 2020–2060이면 C up이 연결 release라 N3 끝 Miss이고 Perfect 2·Miss 1", () => {
    const h = play(headDecrease(2060), ["A", 1000, 2500], ["B", 1000, 2015], ["C", 2020, 2060]);
    expectOutcome(h, ["N1 release perfect +15", "N2 head perfect +20", "N3 release miss@2180"], { perfect: 2, miss: 1 });
  });

  // main: 합계는 Perfect 3이지만 A up 2010이 연결 보정 몫으로 쓰이고 B up 2015가 감소 release(+15)
  it.fails("doubleLong [1000,2000] → head 2000 + 짧은 long [2000,2060]을 ab-c-(A up 2010·B up 2015·C 2020–2060)로 치면 A up 감소 release, B up 연결 release, C up N3 끝이라 Perfect 3", () => {
    const h = play(headDecrease(2060), ["A", 1000, 2010], ["B", 1000, 2015], ["C", 2020, 2060]);
    expectOutcome(h, ["N1 release perfect +10", "N2 head perfect +20", "N3 release perfect 0"], { perfect: 3 });
  });

  // main: 합계는 Perfect 3이지만 B up 2015가 연결 보정 몫으로 쓰이고 C up 2040이 감소 release(+40)
  it.fails("doubleLong [1000,2000] → head 2000 + 짧은 long [2000,2060]에서 A 1000–2060 유지·B up 2015·C 2020–2040 탭이면 B up 감소 release, C up 연결 release, A up N3 끝이라 Perfect 3", () => {
    const h = play(headDecrease(2060), ["A", 1000, 2060], ["B", 1000, 2015], ["C", 2020, 2040]);
    expectOutcome(h, ["N1 release perfect +15", "N2 head perfect +20", "N3 release perfect 0"], { perfect: 3 });
  });

  // main: B up 2015가 연결 보정 몫으로 쓰이고 C up 2100이 감소 release Good(+100), N3 끝 Miss — Perfect 1·Good 1·Miss 1
  it.fails("doubleLong [1000,2000] → head 2000 + long [2000,2200]에서 A를 2500까지 쥐고 B up 2015·C 2020–2100이면 head 창 안의 C up 2100이 연결 release라 N3 끝 Miss이고 Perfect 2·Miss 1", () => {
    const h = play(headDecrease(2200), ["A", 1000, 2500], ["B", 1000, 2015], ["C", 2020, 2100]);
    expectOutcome(h, ["N1 release perfect +15", "N2 head perfect +20", "N3 release miss@2320"], { perfect: 2, miss: 1 });
  });
});

describe("RFD 0032 §6-4 감소 지점 앞뒤의 head", () => {
  it("doubleLong [1000,2000] → long [2000,2050] → head 2050 + long [2050,3000]에서 A 1000–3000·B 1000–2010·C 2050–3000이면 B up이 감소 release(+10)라 Perfect 3", () => {
    const h = play([body(1000, 2000, "doubleLong"), body(2000, 2050), point(2050), body(2050, 3000)], ["A", 1000, 3000], ["B", 1000, 2010], ["C", 2050, 3000]);
    expectOutcome(h, ["N1 release perfect +10", "N3 head perfect 0", "N4 release perfect 0"], { perfect: 3 });
  });

  it("감소 지점 50ms 앞 head 1950에서 A 1000–3000·B 1000–2010·C 1950–3000이면 B up 2010이 head 창 안이라 연결 release이고 감소 release Miss로 Perfect 2·Miss 1", () => {
    const h = play(headBeforeDecrease(), ["A", 1000, 3000], ["B", 1000, 2010], ["C", 1950, 3000]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release miss@2120", "N4 release perfect 0"], { perfect: 2, miss: 1 });
  });

  // main: B up 2010에 N4가 바로 유지 Miss(@2010)이고 감소 release도 2120에 Miss — Perfect 1·Miss 2
  it.fails("감소 지점 50ms 앞 head 1950에서 A 1000–3000·B 1000–2010·C 1950–1970 탭이면 C up 연결 release, B up 감소 release(+10), A up N4 끝이라 Perfect 3", () => {
    const h = play(headBeforeDecrease(), ["A", 1000, 3000], ["B", 1000, 2010], ["C", 1950, 1970]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release perfect +10", "N4 release perfect 0"], { perfect: 3 });
  });

  it("감소 지점 50ms 앞 head 1950에서 A 1000–3000·B 1000–1945·C 1950–2010으로 B를 C로 넘기면 B up이 앞 바디를 끝내 연결 release 몫을 채우고 C up이 감소 release(+10)라 Perfect 3", () => {
    const h = play(headBeforeDecrease(), ["A", 1000, 3000], ["B", 1000, 1945], ["C", 1950, 2010]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release perfect +10", "N4 release perfect 0"], { perfect: 3 });
  });
});

describe("RFD 0032 §7-1 holdOnly 끝은 Good 창 안의 up을 가져간다", () => {
  // main: holdOnly 완료가 up을 가져가지 않아 A up 2041이 N2 이른 release Good(−119) — Perfect 1·Good 1
  it.fails("holdOnly [1000,2000] → long [2000,2160]에서 A 1000–2041·B 2040–2160이면 A up을 holdOnly 끝이 가져가 N2는 B up으로 Perfect 2", () => {
    const h = play([body(1000, 2000, "long", true), body(2000, 2160)], ["A", 1000, 2041], ["B", 2040, 2160]);
    expectOutcome(h, ["N1 holdOnly perfect", "N2 release perfect 0"], { perfect: 2 });
  });

  // main: B up 2015·C up 2060이 감소 release에 쓰이지 않아 감소 release가 2120에 Miss — Perfect 2·Miss 1
  it.fails("doubleLong [1000,2000] → head 2000 + 짧은 holdOnly [2000,2060]에서 A 1000–2500·B 1000–2015·C 2020–2060이면 B up이 더 이른 감소 release, C up이 연결 release이고 holdOnly는 유지로 완료해 Perfect 3", () => {
    const h = play([body(1000, 2000, "doubleLong"), point(2000), body(2000, 2060, "long", true)], ["A", 1000, 2500], ["B", 1000, 2015], ["C", 2020, 2060]);
    expectOutcome(h, ["N1 release perfect +15", "N2 head perfect +20", "N3 holdOnly perfect"], { perfect: 3 });
  });

  it("doubleLong [1000,1950] → head 1950 + doubleLong holdOnly [1950,2000] → long [2000,3000]에서 A 1000–3000·B 1000–2010·C 1950–3000이면 감소 release가 면제되고 B up은 연결 release라 Perfect 4", () => {
    const h = play([body(1000, 1950, "doubleLong"), point(1950), body(1950, 2000, "doubleLong", true), body(2000, 3000)],
      ["A", 1000, 3000], ["B", 1000, 2010], ["C", 1950, 3000]);
    expectOutcome(h, ["N2 head perfect 0", "N3 holdOnly perfect", "N3 holdOnly perfect", "N4 release perfect 0"], { perfect: 4 });
  });
});

describe("RFD 0032 §7-2 holdOnly 감소에서 키를 남기는 연주", () => {
  const chart = () => [body(1000, 2000, "doubleLong", true), body(2000, 3000)];
  const threePerfect = ["N1 holdOnly perfect", "N1 holdOnly perfect", "N2 release perfect 0"];

  it("doubleLong holdOnly [1000,2000] → long [2000,3000]에서 B를 2000에 떼고 A로 3000까지 유지하면 Perfect 3", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 1000, 2000]), threePerfect, { perfect: 3 });
  });

  it("doubleLong holdOnly [1000,2000] → long [2000,3000]에서 A/B를 3000까지 함께 누르면 Perfect 3", () => {
    expectOutcome(play(chart(), ["A", 1000, 3000], ["B", 1000, 3000]), threePerfect, { perfect: 3 });
  });

  it("120 BPM 16분음표 =-=- 반복(doubleLong holdOnly [1000,1125] → long [1125,1250] → doubleLong holdOnly [1250,1375] → long [1375,1750])을 A/B 1000–1750으로 계속 누르면 Perfect 5", () => {
    const h = play([body(1000, 1125, "doubleLong", true), body(1125, 1250), body(1250, 1375, "doubleLong", true), body(1375, 1750)],
      ["A", 1000, 1750], ["B", 1000, 1750]);
    expectOutcome(h, ["N1 holdOnly perfect", "N1 holdOnly perfect", "N3 holdOnly perfect", "N3 holdOnly perfect", "N4 release perfect 0"], { perfect: 5 });
  });
});

describe("RFD 0032 §8-1 시작 직후의 재충전", () => {
  const chart = () => [point(1000), body(1100, 1500)];

  it("head 1000 → head 없는 long [1100,1500]에서 A 1000–1090·1140–1500이면 A down 1140으로 시작해 Perfect 2", () => {
    expectOutcome(play(chart(), ["A", 1000, 1090], ["A", 1140, 1500]), ["N1 head perfect 0", "N2 release perfect 0"], { perfect: 2 });
  });

  it("head 1000 → head 없는 long [1100,1500]에서 A 1000–1105·1140–1500이면 1100에 시작한 N2의 실패를 S+Good 1220까지 미뤄 A down 1140으로 이어 가 Perfect 2", () => {
    expectOutcome(play(chart(), ["A", 1000, 1105], ["A", 1140, 1500]), ["N1 head perfect 0", "N2 release perfect 0"], { perfect: 2 });
  });

  it("head 1000 → head 없는 long [1100,1500]에서 A 1000–1105 뒤 다시 누르지 않으면 1125가 아닌 S+Good 1220에 N2 유지 Miss", () => {
    expectOutcome(play(chart(), ["A", 1000, 1105]), ["N1 head perfect 0", "N2 maintenanceMiss@1220"], { perfect: 1, miss: 1 });
  });

  // main: head 없는 N2 시작에 새 down을 요구해 S+Good 1220에 시작 실패(@1220)
  it.fails("head 1000 → head 없는 long [1100,1500]에서 A 1000–1210으로 S+Good 직전에 hold를 잃으면 1210+20=1230에 N2 유지 Miss", () => {
    expectOutcome(play(chart(), ["A", 1000, 1210]), ["N1 head perfect 0", "N2 maintenanceMiss@1230"], { perfect: 1, miss: 1 });
  });

  // main: A up 2010에 N2 한 몫이 바로 유지 Miss(@2010) — Perfect 1·Miss 1
  it.fails("long [1000,2000] → head 없는 doubleLong [2000,3000]에서 A 1000–2010·2080–3000·B 1990–3000이면 증가 직후 끊긴 A도 S+Good 2120까지 다시 채울 수 있어 Perfect 2", () => {
    const h = play([body(1000, 2000), body(2000, 3000, "doubleLong")], ["A", 1000, 2010], ["A", 2080, 3000], ["B", 1990, 3000]);
    expectOutcome(h, ["N2 release perfect 0", "N2 release perfect 0"], { perfect: 2 });
  });
});

describe("RFD 0032 §8-1 §1-4의 holdOnly 예", () => {
  const chart = () => [point(1000), body(1010, 1500, "long", true)];

  it("Point 1000 → head 없는 holdOnly [1010,1500]에서 A 1000–1030 탭 뒤 B 1060–1500이면 실패 기한이 1050이 아닌 S+Good 1130이라 B down으로 이어 가 Perfect 2", () => {
    expectOutcome(play(chart(), ["A", 1000, 1030], ["B", 1060, 1500]), ["N1 head perfect 0", "N2 holdOnly perfect"], { perfect: 2 });
  });

  it("Point 1000 → head 없는 holdOnly [1010,1500]에서 A 1000–1030 탭 뒤 아무것도 누르지 않으면 1050이 아닌 S+Good 1130에 N2 유지 Miss", () => {
    expectOutcome(play(chart(), ["A", 1000, 1030]), ["N1 head perfect 0", "N2 maintenanceMiss@1130"], { perfect: 1, miss: 1 });
  });
});

describe("RFD 0032 §8-2 head 없는 경계", () => {
  it("holdOnly [1000,2000] → head 없는 long [2000,3000]에서 A 1000–1990·B 2030–3000이면 A up이 N1을 끝내고 N2는 S+Good까지 채우면 되어 Perfect 2", () => {
    const h = play([body(1000, 2000, "long", true), body(2000, 3000)], ["A", 1000, 1990], ["B", 2030, 3000]);
    expectOutcome(h, ["N1 holdOnly perfect", "N2 release perfect 0"], { perfect: 2 });
  });

  // main: A up 2010에 이어지는 몫이 바로 유지 Miss(@2010) — Perfect 1·Miss 1
  it.fails("long [1000,2000] → head 없는 doubleLong [2000,3000]에서 A 1000–2010·B 2040–3000·A 2060–3000이면 이어지는 몫도 S+Good까지 채우면 되어 Perfect 2", () => {
    const h = play([body(1000, 2000), body(2000, 3000, "doubleLong")], ["A", 1000, 2010], ["B", 2040, 3000], ["A", 2060, 3000]);
    expectOutcome(h, ["N2 release perfect 0", "N2 release perfect 0"], { perfect: 2 });
  });
});

describe("RFD 0032 §9-2 허용 입력(탈출구)", () => {
  it("long [1000,2000] → head 2000 + long [2000,3000]을 같은 키 A로 40ms 일찍 떼고 40ms 늦게 다시 쳐도(A 1000–1960·2040–3000) Perfect 2", () => {
    expectOutcome(play(singleConnection(), ["A", 1000, 1960], ["A", 2040, 3000]), ["N2 head perfect +40", "N3 release perfect 0"], { perfect: 2 });
  });

  it("doubleLong [1000,2000] → double head 2000 + doubleLong [2000,2100]을 같은 두 키로 40ms 일찍 떼고 40ms 늦게 다시 쳐도(A/B 1000–1960·2040–2100) Perfect 4", () => {
    const h = play([body(1000, 2000, "doubleLong"), point(2000, "double"), body(2000, 2100, "doubleLong")],
      ["A", 1000, 1960], ["B", 1000, 1960], ["A", 2040, 2100], ["B", 2040, 2100]);
    expectOutcome(h, ["N2 head perfect +40", "N2 head perfect +40", "N3 release perfect 0", "N3 release perfect 0"], { perfect: 4 });
  });
});

describe("RFD 0032 §9-3 제작 지침 4~8항", () => {
  // main: A up 1560이 연결 보정 몫으로 쓰여 N3 release Miss — Perfect 1·Miss 1 (#281)
  it.fails("long [1000,1500] → head 1500 + long [1500,1560]에서 A 1000–1560 유지 중 B 1500–1510으로 head만 탭하면 B up이 연결 release라 Perfect 2(5항)", () => {
    const h = play([body(1000, 1500), point(1500), body(1500, 1560)], ["A", 1000, 1560], ["B", 1500, 1510]);
    expectOutcome(h, ["N2 head perfect 0", "N3 release perfect 0"], { perfect: 2 });
  });
});

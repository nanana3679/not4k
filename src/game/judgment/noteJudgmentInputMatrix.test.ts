import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { body, createHarness, down, point, up, type CaseInput } from "./noteJudgmentTestHarness";

/**
 * 독립 노트 하나(head 0/1/2개 × single/double 바디 × 일반/holdOnly)에 두 키 A·B의 입력 조합을 전부 넣고,
 * 판정 모델(RFD 0020 등록 키 / RFD 0032 hold 수)과 무관한 정산 성질만 확인한다.
 * 예외 없이 끝나고, 끝까지 진행하면 모든 점수 항목을 정확히 한 번씩 정산해야 한다.
 * 등급·Miss 수 같은 모델별 기대 결과는 여기서 보지 않는다(RFD 0032 사례는 noteJudgmentBodyHeldCountCases.test.ts).
 */

const S = 1000;
const E = 2000;
/** 모든 S/E + Good 기한(2120)을 지난 시각. 여기까지 진행하면 남은 판정이 모두 확정된다. */
const AFTER_ALL = 3000;

type Heads = 0 | 1 | 2;
type Units = 1 | 2;

function independentNote(heads: Heads, units: Units, holdOnly: boolean): NoteEntity[] {
  const range = body(S, E, units === 2 ? "doubleLong" : "long", holdOnly);
  if (heads === 0) return [range];
  return [point(S, heads === 2 ? "double" : "single"), range];
}

/** 키 하나의 입력: 누르지 않음, 또는 down 시각과 up 시각(없으면 끝까지 누름). */
type KeyPress = readonly [down: number, up: number | undefined] | undefined;

// 두 키 A/B 각각: 없음 또는 (down 시각 × up 시점). 창 안·밖 down, S 전 짧은 tap(#180 경로), 이른·정상·늦은 release, 유지 후 미해제를 포함한다.
const downTimes = [S - 120, S - 100, S, S + 100, S + 150];
const upAfter = (d: number) => [d + 10, S + 300, E - 60, E, E + 200, undefined];
const keyOptions: KeyPress[] = [undefined, ...downTimes.flatMap(d => upAfter(d).map(u => [d, u] as const))];
const combos = keyOptions.flatMap(a => keyOptions.map(b => ({ A: a, B: b })));

/** 래칫에 쓰는 조합 표기. 예: "A880-890 B1000-"(B는 1000에 눌러 떼지 않음). 두 키 모두 누르지 않으면 빈 문자열. */
const comboName = (combo: { A: KeyPress; B: KeyPress }) => (["A", "B"] as const)
  .flatMap(key => combo[key] === undefined ? [] : [`${key}${combo[key]![0]}-${combo[key]![1] ?? ""}`]).join(" ");

/** 조합을 재생하고 정산 위반을 문자열로 돌려준다. 위반이 없으면 undefined. */
function settlementViolation(notes: readonly NoteEntity[], combo: { A: KeyPress; B: KeyPress }): string | undefined {
  const byTime = new Map<number, CaseInput[]>();
  const add = (at: number, input: CaseInput) => byTime.set(at, [...(byTime.get(at) ?? []), input]);
  for (const key of ["A", "B"] as const) {
    const press = combo[key];
    if (press === undefined) continue;
    add(press[0], down(key));
    if (press[1] !== undefined) add(press[1], up(key));
  }
  try {
    const h = createHarness(notes);
    for (const at of [...byTime.keys()].sort((a, b) => a - b)) h.at(at, ...byTime.get(at)!);
    h.at(AFTER_ALL);
    const state = h.score.getState();
    // maintenanceMiss는 무득점 Miss라 점수 항목을 정산하지 않는다. 나머지 이벤트의 itemId가 정산한 항목이다.
    const ids = h.events.filter(event => event.kind !== "maintenanceMiss" && event.itemId !== undefined).map(event => event.itemId);
    if (ids.length !== new Set(ids).size) return "중복 정산";
    if (state.processedNotes !== state.totalNotes) return `미정산 ${state.totalNotes - state.processedNotes}개`;
    return undefined;
  } catch (error) {
    return `예외: ${(error as Error).message}`;
  }
}

/* ── 래칫 ──────────────────────────────────────────────────────────────────────────────────────────────
 * main 엔진이 정산 성질을 어기는 조합. 모두 #180(뒤 바디가 없는 끝 holdOnly unit이 E+Good까지 미확정이면 holdOnly 대신
 * release 판정을 내보내 세션이 미등록 score item 예외를 던짐)이며, 위반 조합마다 한 키 이상이 S 전에 10ms 탭(880–890 또는
 * 900–910)을 친다. 결함을 고쳐도, 새로 어겨도 목록이 달라져 테스트가 실패하므로 그때 목록과 주석을 갱신한다.
 */
/** head 0·1개 + single holdOnly: S 전 짧은 탭이 있으면 끝 holdOnly가 release를 내보내 정산 예외(#180). head 0개와 1개가 같은 목록이다. */
const SINGLE_HOLD_ONLY_THROWS = [
  "B880-890", "B900-910", "A880-890", "A880-890 B880-890", "A880-890 B880-1300", "A880-890 B880-2200",
  "A880-890 B880-", "A880-890 B900-910", "A880-890 B900-1300", "A880-890 B900-2200", "A880-890 B900-",
  "A880-890 B1000-1010", "A880-890 B1000-1300", "A880-890 B1000-2200", "A880-890 B1000-", "A880-890 B1100-1110",
  "A880-890 B1100-1300", "A880-890 B1100-2200", "A880-890 B1100-", "A880-890 B1150-1160", "A880-890 B1150-1300",
  "A880-890 B1150-2200", "A880-890 B1150-", "A900-910", "A900-910 B880-890", "A900-910 B900-910",
  "A900-910 B900-1300", "A900-910 B900-2200", "A900-910 B900-", "A900-910 B1000-1010", "A900-910 B1000-1300",
  "A900-910 B1000-2200", "A900-910 B1000-", "A900-910 B1100-1110", "A900-910 B1100-1300", "A900-910 B1100-2200",
  "A900-910 B1100-", "A900-910 B1150-1160", "A900-910 B1150-1300", "A900-910 B1150-2200", "A900-910 B1150-",
  "A900-1300 B880-890", "A900-2200 B880-890", "A900- B880-890", "A1000-1010 B880-890", "A1000-1010 B900-910",
  "A1000-1300 B880-890", "A1000-1300 B900-910", "A1000-2200 B880-890", "A1000-2200 B900-910", "A1000- B880-890",
  "A1000- B900-910", "A1100-1110 B880-890", "A1100-1110 B900-910", "A1100-1300 B880-890", "A1100-1300 B900-910",
  "A1100-2200 B880-890", "A1100-2200 B900-910", "A1100- B880-890", "A1100- B900-910", "A1150-1160 B880-890",
  "A1150-1160 B900-910", "A1150-1300 B880-890", "A1150-1300 B900-910", "A1150-2200 B880-890", "A1150-2200 B900-910",
  "A1150- B880-890", "A1150- B900-910",
];

/** head 0·1개 + double holdOnly: S 전 짧은 탭이 있으면 끝 holdOnly가 release를 내보내 정산 예외(#180). head 0개와 1개가 같은 목록이다. */
const DOUBLE_HOLD_ONLY_THROWS = [
  "B880-890", "B900-910", "A880-890", "A880-890 B880-890", "A880-890 B880-1300", "A880-890 B900-910",
  "A880-890 B900-1300", "A880-890 B1000-1010", "A880-890 B1000-1300", "A880-890 B1100-1110", "A880-890 B1100-1300",
  "A880-890 B1150-1160", "A880-890 B1150-1300", "A880-890 B1150-2200", "A880-890 B1150-", "A880-1300 B880-890",
  "A880-1300 B900-910", "A900-910", "A900-910 B880-890", "A900-910 B880-1300", "A900-910 B900-910",
  "A900-910 B900-1300", "A900-910 B1000-1010", "A900-910 B1000-1300", "A900-910 B1100-1110", "A900-910 B1100-1300",
  "A900-910 B1150-1160", "A900-910 B1150-1300", "A900-910 B1150-2200", "A900-910 B1150-", "A900-1300 B880-890",
  "A900-1300 B900-910", "A1000-1010 B880-890", "A1000-1010 B900-910", "A1000-1300 B880-890", "A1000-1300 B900-910",
  "A1100-1110 B880-890", "A1100-1110 B900-910", "A1100-1300 B880-890", "A1100-1300 B900-910", "A1150-1160 B880-890",
  "A1150-1160 B900-910", "A1150-1300 B880-890", "A1150-1300 B900-910", "A1150-2200 B880-890", "A1150-2200 B900-910",
  "A1150- B880-890", "A1150- B900-910",
];

/** double head + holdOnly: S 전 짧은 탭이 있으면 끝 holdOnly가 release를 내보내 정산 예외(#180). single·double 바디가 같은 목록이다. */
const DOUBLE_HEAD_HOLD_ONLY_THROWS = [
  "A880-890 B880-890", "A880-890 B880-1300", "A880-890 B900-910", "A880-890 B900-1300", "A880-890 B1000-1010",
  "A880-890 B1000-1300", "A880-890 B1100-1110", "A880-890 B1100-1300", "A880-1300 B880-890", "A880-1300 B900-910",
  "A900-910 B880-890", "A900-910 B880-1300", "A900-910 B900-910", "A900-910 B900-1300", "A900-910 B1000-1010",
  "A900-910 B1000-1300", "A900-910 B1100-1110", "A900-910 B1100-1300", "A900-1300 B880-890", "A900-1300 B900-910",
  "A1000-1010 B880-890", "A1000-1010 B900-910", "A1000-1300 B880-890", "A1000-1300 B900-910", "A1100-1110 B880-890",
  "A1100-1110 B900-910", "A1100-1300 B880-890", "A1100-1300 B900-910",
];
const KNOWN_TERMINAL_HOLD_ONLY_THROWS: Record<string, readonly string[]> = {
  "head 없음 + single holdOnly [1000,2000]": SINGLE_HOLD_ONLY_THROWS,
  "single head + single holdOnly [1000,2000]": SINGLE_HOLD_ONLY_THROWS,
  "head 없음 + double holdOnly [1000,2000]": DOUBLE_HOLD_ONLY_THROWS,
  "single head + double holdOnly [1000,2000]": DOUBLE_HOLD_ONLY_THROWS,
  "double head + single holdOnly [1000,2000]": DOUBLE_HEAD_HOLD_ONLY_THROWS,
  "double head + double holdOnly [1000,2000]": DOUBLE_HEAD_HOLD_ONLY_THROWS,
};
/** #180 예외 메시지: holdOnly 노트에는 없는 release 항목을 정산하려 한다. */
const TERMINAL_HOLD_ONLY_THROW = /^예외: 미등록 또는 중복 점수 정산: n\d+:release:\d+$/;

const label = (heads: Heads, units: Units, holdOnly: boolean) =>
  `${["head 없음", "single head", "double head"][heads]} + ${units === 2 ? "double" : "single"}${holdOnly ? " holdOnly" : ""} [1000,2000]`;

const configs = ([0, 1, 2] as const).flatMap(heads => ([1, 2] as const).flatMap(units =>
  [false, true].map(holdOnly => ({ name: label(heads, units, holdOnly), heads, units, holdOnly }))));

describe("독립 노트의 A/B 입력 조합 961가지 정산", () => {
  it("한 키당 입력 없음 또는 down 5시각 × up 6가지(끝까지 누름 포함)라 조합은 31 × 31 = 961가지", () => {
    expect(combos).toHaveLength(961);
    expect(new Set(combos.map(comboName)).size).toBe(961);
  });

  for (const { name, heads, units, holdOnly } of configs) {
    const known = KNOWN_TERMINAL_HOLD_ONLY_THROWS[name] ?? [];
    const expectation = known.length === 0
      ? "예외 없이 모든 점수 항목을 정확히 한 번씩 정산"
      : `S 전 짧은 탭이 낀 ${known.length}가지(#180 래칫)만 정산 예외이고 나머지는 모든 점수 항목을 정확히 한 번씩 정산`;
    it(`${name}에서 961가지 조합을 끝까지 진행하면 ${expectation}`, () => {
      const violations = combos.flatMap(combo => {
        const violation = settlementViolation(independentNote(heads, units, holdOnly), combo);
        return violation === undefined ? [] : [{ combo: comboName(combo), violation }];
      });
      expect(violations.map(entry => entry.combo)).toEqual(known);
      expect(violations.filter(entry => !TERMINAL_HOLD_ONLY_THROW.test(entry.violation))).toEqual([]);
    });
  }
});

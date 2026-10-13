import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { NoteJudgmentSession } from "./NoteJudgmentSession";
import { body, createHarness, down, point, up } from "./noteJudgmentTestHarness";

// onDownConsumed는 기어 버튼 색처럼 "이 누름이 어느 노트를 쳤는가"만 필요한 표시를 위한 관찰이다(판정 결과는 바꾸지 않는다).
function observe(notes: readonly NoteEntity[]) {
  const consumed: [string, number, number][] = [];
  const harness = createHarness(notes, { onDownConsumed: (key, lane, noteIndex) => consumed.push([key, lane, noteIndex]) });
  return { ...harness, consumed };
}

describe("NoteJudgmentCore onDownConsumed — keydown이 노트에 소비된 순간만 알림", () => {
  it("1000ms 싱글 노트(레인 2)를 1010ms에 누르면 키 A·레인 2·노트 0을 한 번 알린다", () => {
    const h = observe([point(1000, "single", 2)]);
    h.at(1010, down("A", 2));
    expect(h.consumed).toEqual([["A", 2, 0]]);
  });

  it("1000ms 더블 노트를 A·B로 누르면 두 누름 모두 노트 0으로 알리고, 이미 두 키를 받은 뒤 누른 C는 알리지 않는다(공입력)", () => {
    const h = observe([point(1000, "double")]);
    h.at(1000, down("A"));
    h.at(1005, down("B"));
    h.at(1010, down("C"));
    expect(h.consumed).toEqual([["A", 1, 0], ["B", 1, 0]]);
  });

  it("Good 창(120ms) 밖인 879ms에 누른 키와 노트가 Miss로 지나간 뒤 1200ms에 누른 키는 알리지 않는다(공입력)", () => {
    const h = observe([point(1000)]);
    h.at(879, down("A"));
    h.at(880, up("A"));
    h.at(1200, down("B"));
    expect(h.consumed).toEqual([]);
  });

  it("헤드 없는 롱노트(1000~2000ms) 시작을 A로 누르면 노트 0으로 알리고, doubleLong 시작은 A·B 두 누름 모두 알린다", () => {
    const single = observe([body(1000, 2000, "long")]);
    single.at(1000, down("A"));
    expect(single.consumed).toEqual([["A", 1, 0]]);
    const double = observe([body(1000, 2000, "doubleLong")]);
    double.at(1000, down("A"), down("B"));
    expect(double.consumed).toEqual([["A", 1, 0], ["B", 1, 0]]);
  });

  it("롱노트(1000~3000ms)를 A로 잡은 채 2000ms 싱글 노트를 B로 치면 B는 노트 1(싱글)로 알린다(레인 내 분리)", () => {
    const h = observe([body(1000, 3000, "long"), point(2000)]);
    h.at(1000, down("A"));
    h.at(2000, down("B"));
    expect(h.consumed).toEqual([["A", 1, 0], ["B", 1, 1]]);
  });

  it("A로 잡은 롱노트가 2000ms에 다음 롱노트로 이어질 때(헤드 없는 연결) 2000ms에 누른 B는 승계가 충분해 소비되지 않아 알리지 않는다", () => {
    const h = observe([body(1000, 2000, "long"), body(2000, 3000, "long")]);
    h.at(1000, down("A"));
    h.at(2000, down("B"));
    expect(h.consumed).toEqual([["A", 1, 0]]);
  });

  it("onDownConsumed를 주어도 판정 이벤트·점수는 주지 않을 때와 같다(표시 전용)", () => {
    const notes = [point(1000, "double"), body(1500, 2500, "long"), point(2000)];
    const run = (withObserver: boolean) => {
      const h = withObserver ? observe(notes) : { ...createHarness(notes), consumed: [] };
      h.at(1000, down("A"), down("B"));
      h.at(1020, up("A"), up("B"));
      h.at(1510, down("C"));
      h.at(2005, down("D"));
      h.at(2030, up("D"));
      h.at(2500, up("C"));
      h.core.advance(4000);
      return { events: h.events, score: h.score.getState() };
    };
    expect(run(true)).toEqual(run(false));
  });

  it("NoteJudgmentSession의 onDownConsumed는 core 알림을 그대로 넘긴다(1000ms 더블 노트를 레인 3의 A로 치면 A·3·0)", () => {
    const consumed: [string, number, number][] = [];
    const notes = [point(1000, "double", 3)];
    const session = new NoteJudgmentSession(compileJudgmentChart(notes, [1000], new Map()), {
      onDownConsumed: (key, lane, noteIndex) => consumed.push([key, lane, noteIndex]),
    });
    session.processBatch(1000, [down("A", 3)]);
    expect(consumed).toEqual([["A", 3, 0]]);
  });
});

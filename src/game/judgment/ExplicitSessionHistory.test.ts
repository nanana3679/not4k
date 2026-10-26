import { describe, expect, it } from "vitest";
import { ExplicitSessionHistory } from "./ExplicitSessionHistory";

describe("곡 관측 시각으로 제한한 세션 연산 이력", () => {
  it("T2000의 연산 두 개는 모두 포함하고 raw1900이어도 관측2001의 입력은 제외", () => {
    const history = new ExplicitSessionHistory(0);
    history.append({ kind: "advance", atMs: 1800 }, 2000);
    history.append({ kind: "advance", atMs: 1900 }, 2000);
    history.append({ kind: "batch", atMs: 1900, inputs: [{ key: "A", lane: 1, type: "down" }] }, 2001);
    expect([...history.prefixThrough(2000)].map(entry => entry.operation.kind)).toEqual(["advance", "advance"]);
  });

  it("관측2000 뒤1999·NaN·Infinity를 추가하면 거부하고 기존 연산 하나만 유지", () => {
    const history = new ExplicitSessionHistory(1500);
    history.append({ kind: "advance", atMs: 1900 }, 2000);
    for (const time of [1999, NaN, Infinity]) {
      expect(() => history.append({ kind: "advance", atMs: 1950 }, time)).toThrow(RangeError);
    }
    expect([...history.prefixThrough(2000)]).toHaveLength(1);
  });

  it("시작1500과 마지막 관측2000은 포함하며1499·2001·NaN 복원은 거부", () => {
    const history = new ExplicitSessionHistory(1500);
    history.append({ kind: "advance", atMs: 2000 }, 2000);
    expect([...history.prefixThrough(1500)]).toEqual([]);
    expect([...history.prefixThrough(2000)]).toHaveLength(1);
    for (const time of [1499, 2001, NaN]) expect(() => [...history.prefixThrough(time)]).toThrow(RangeError);
  });

  it("원본 groups의 raw·입력·held를 나중에 수정해도 저장한 raw950와 A·B는 불변", () => {
    const history = new ExplicitSessionHistory(0);
    const groups = [{ rawAtMs: 950, inputs: [{ key: "A", lane: 1, type: "up" as const }] }];
    const heldKeys = [{ key: "B", lane: 1 }];
    history.append({ kind: "observedBatches", observedAtMs: 1000, groups }, 1000);
    history.append({ kind: "resume", atMs: 1000, heldKeys, playbackStartMs: 1100 }, 1100);
    groups[0].rawAtMs = 900;
    groups[0].inputs[0].key = "C";
    heldKeys[0].key = "D";
    const prefix = [...history.prefixThrough(1100)];
    expect(prefix[0].operation).toMatchObject({ groups: [{ rawAtMs: 950, inputs: [{ key: "A" }] }] });
    expect(prefix[1].operation).toMatchObject({ heldKeys: [{ key: "B" }] });
    expect(Object.isFrozen(prefix[0])).toBe(true);
    expect(Object.isFrozen(prefix[0].operation)).toBe(true);
  });

  it("syncHeldKeys 연산의 원본 held를 나중에 B에서 D로 바꿔도 저장한 B는 불변", () => {
    const history = new ExplicitSessionHistory(0);
    const heldKeys = [{ key: "B", lane: 2 }];
    history.append({ kind: "syncHeldKeys", atMs: 1000, heldKeys }, 1000);
    heldKeys[0].key = "D";
    const [entry] = [...history.prefixThrough(1000)];
    expect(entry.operation).toEqual({ kind: "syncHeldKeys", atMs: 1000, heldKeys: [{ key: "B", lane: 2 }] });
    expect(entry.operation.kind === "syncHeldKeys" && Object.isFrozen(entry.operation.heldKeys[0])).toBe(true);
  });

  it("연산 없는 재구성 경계2050은 상태를 추가하지 않고 새 관측2049를 거부", () => {
    const history = new ExplicitSessionHistory(0);
    history.append({ kind: "advance", atMs: 2000 }, 2000);
    history.observeThrough(2050);
    expect(history.latestSongTimeMs).toBe(2050);
    expect([...history.prefixThrough(2050)]).toHaveLength(1);
    expect(() => history.append({ kind: "advance", atMs: 2001 }, 2049)).toThrow(RangeError);
  });
});

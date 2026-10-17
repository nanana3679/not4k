import { describe, expect, it } from "vitest";
import { MAINTENANCE_GRACE_MS } from "../../shared/constants";
import { LaneHoldTracker } from "./LaneHoldTracker";

describe("LaneHoldTracker 레인별 hold 수", () => {
  it("입력이 없으면 모든 레인의 count는 0", () => {
    const tracker = new LaneHoldTracker();
    expect(tracker.count(1)).toBe(0);
    expect(tracker.count(4)).toBe(0);
  });

  it("레인 1에 서로 다른 키 A·B를 누르면 count(1)=2, A를 떼면 count(1)=1", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    expect(tracker.count(1)).toBe(2);
    tracker.up("A", 1800);
    expect(tracker.count(1)).toBe(1);
  });

  it("레인 1의 A와 레인 2의 B는 따로 세어 B up 1500이 레인 1의 count와 부족 시각을 바꾸지 않음", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 2, 1000);
    tracker.up("B", 1500);
    expect(tracker.count(1)).toBe(1);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
    expect(tracker.count(2)).toBe(0);
    expect(tracker.shortSince(2, 1)).toBe(1500);
  });

  it("up은 레인을 받지 않고 down 때 기록한 레인에서 키를 뺀다", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 3, 1000);
    tracker.up("A", 1200);
    expect(tracker.count(3)).toBe(0);
    expect(tracker.shortSince(3, 1)).toBe(1200);
  });

  it("누르지 않은 키 Z의 up 1500은 무시해 count와 부족 시각이 그대로", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("Z", 1500);
    expect(tracker.count(1)).toBe(1);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
  });

  it("이미 뗀 키 A의 두 번째 up 1600은 무시해 부족 시각이 첫 up 1500으로 남음", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1500);
    tracker.up("A", 1600);
    expect(tracker.count(1)).toBe(0);
    expect(tracker.shortSince(1, 1)).toBe(1500);
  });

  it("누른 키 A를 같은 레인에 1500에 다시 down하면 count(1)=1이고 부족이 남지 않음", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("A", 1, 1500);
    expect(tracker.count(1)).toBe(1);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
  });

  it("누른 키 A를 레인 2로 1500에 다시 down하면 레인 1은 count 0에 1500부터 부족, 레인 2는 count 1", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("A", 2, 1500);
    expect(tracker.count(1)).toBe(0);
    expect(tracker.shortSince(1, 1)).toBe(1500);
    expect(tracker.count(2)).toBe(1);
    expect(tracker.shortSince(2, 1)).toBeUndefined();
  });

  it("레인 2로 옮긴 키 A의 up 1700은 레인 2에서 빠지고 레인 1의 부족 시각 1500은 그대로", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("A", 2, 1500);
    tracker.up("A", 1700);
    expect(tracker.count(2)).toBe(0);
    expect(tracker.shortSince(2, 1)).toBe(1700);
    expect(tracker.shortSince(1, 1)).toBe(1500);
  });
});

describe("LaneHoldTracker 기준별 부족 시각 (RFD 0032 §2-2)", () => {
  it("count가 need 이상이면 shortSince는 undefined", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
    expect(tracker.shortSince(1, 2)).toBeUndefined();
  });

  it("need 0 이하는 언제나 충족되어 입력이 없어도 shortSince(1, 0)은 undefined", () => {
    const tracker = new LaneHoldTracker();
    expect(tracker.shortSince(1, 0)).toBeUndefined();
    expect(tracker.failureDeadline(1, 0)).toBeUndefined();
  });

  it("사례 1: A 1000–1800·B 1000–3000에서 A up 1800 뒤 need 2는 1800부터 부족해 기한 1820, need 1은 충족", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    tracker.up("A", 1800);
    expect(tracker.shortSince(1, 2)).toBe(1800);
    expect(tracker.failureDeadline(1, 2)).toBe(1820);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
    expect(tracker.failureDeadline(1, 1)).toBeUndefined();
  });

  it("사례 1: C down 1830으로 count가 2로 회복하면 need 2의 shortSince는 undefined", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    tracker.up("A", 1800);
    tracker.down("C", 1, 1830);
    expect(tracker.count(1)).toBe(2);
    expect(tracker.shortSince(1, 2)).toBeUndefined();
    expect(tracker.failureDeadline(1, 2)).toBeUndefined();
  });

  it("사례 2: A up 1800·B up 1810 뒤 need 2는 1800, need 1은 1810부터 부족", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    tracker.up("A", 1800);
    tracker.up("B", 1810);
    expect(tracker.count(1)).toBe(0);
    expect(tracker.shortSince(1, 2)).toBe(1800);
    expect(tracker.shortSince(1, 1)).toBe(1810);
    expect(tracker.failureDeadline(1, 2)).toBe(1820);
    expect(tracker.failureDeadline(1, 1)).toBe(1830);
  });

  it("사례 2: C down 1815는 need 1만 회복하고 need 2의 부족 시작 1800을 새로 시작하지 않음", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    tracker.up("A", 1800);
    tracker.up("B", 1810);
    tracker.down("C", 1, 1815);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
    expect(tracker.shortSince(1, 2)).toBe(1800);
    expect(tracker.failureDeadline(1, 2)).toBe(1820);
  });

  it("사례 2: D down 1825로 count 2가 되면 need 2도 회복해 두 기준 모두 undefined", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    tracker.up("A", 1800);
    tracker.up("B", 1810);
    tracker.down("C", 1, 1815);
    tracker.down("D", 1, 1825);
    expect(tracker.count(1)).toBe(2);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
    expect(tracker.shortSince(1, 2)).toBeUndefined();
  });

  it("회복 뒤 다시 떨어지면 새 시각부터 부족: A up 1105·down 1140·up 1300이면 shortSince(1, 1)=1300", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1105);
    tracker.down("A", 1, 1140);
    tracker.up("A", 1300);
    expect(tracker.shortSince(1, 1)).toBe(1300);
    expect(tracker.failureDeadline(1, 1)).toBe(1320);
  });

  it("need 3에 한 번 도달했다가 1500에 2로 내려간 뒤 1→2로 회복해도 need 3의 부족 시작은 1500", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    tracker.down("C", 1, 1000);
    tracker.up("C", 1500);
    tracker.up("B", 1600);
    tracker.down("D", 1, 1700);
    expect(tracker.count(1)).toBe(2);
    expect(tracker.shortSince(1, 2)).toBeUndefined();
    expect(tracker.shortSince(1, 3)).toBe(1500);
  });
});

describe("LaneHoldTracker 한 번도 도달하지 않은 기준", () => {
  it("입력이 없으면 shortSince(1, 1)=-Infinity", () => {
    const tracker = new LaneHoldTracker();
    expect(tracker.shortSince(1, 1)).toBe(-Infinity);
  });

  it("입력이 없으면 failureDeadline(1, 1)=-Infinity, refillUntil 1220을 주면 1220", () => {
    const tracker = new LaneHoldTracker();
    expect(tracker.failureDeadline(1, 1)).toBe(-Infinity);
    expect(tracker.failureDeadline(1, 1, 1220)).toBe(1220);
  });

  it("키 하나만 누른 레인에서 need 2는 한 번도 도달하지 않아 shortSince(1, 2)=-Infinity", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    expect(tracker.shortSince(1, 2)).toBe(-Infinity);
  });
});

describe("LaneHoldTracker 시작 직후 재충전 기한 (RFD 0032 §8-1)", () => {
  it("A down 1000·up 1105에서 refillUntil 1220이면 실패 기한은 1125가 아닌 1220", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1105);
    expect(tracker.failureDeadline(1, 1)).toBe(1125);
    expect(tracker.failureDeadline(1, 1, 1220)).toBe(1220);
  });

  it("A down 1000·up 1210에서 refillUntil 1220이면 부족+유예 1230이 더 늦어 실패 기한 1230", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1210);
    expect(tracker.failureDeadline(1, 1, 1220)).toBe(1230);
  });

  it("A up 1105 뒤 down 1140으로 회복하면 refillUntil 1220이 있어도 failureDeadline은 undefined", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1105);
    tracker.down("A", 1, 1140);
    expect(tracker.failureDeadline(1, 1, 1220)).toBeUndefined();
  });

  it("A up 1105·down 1140 회복 뒤 up 1400이면 refillUntil 1220보다 새 부족+유예 1420이 늦어 기한 1420", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1105);
    tracker.down("A", 1, 1140);
    tracker.up("A", 1400);
    expect(tracker.failureDeadline(1, 1, 1220)).toBe(1420);
  });
});

describe("LaneHoldTracker 유예 길이", () => {
  it("기본 유예는 MAINTENANCE_GRACE_MS=20", () => {
    expect(MAINTENANCE_GRACE_MS).toBe(20);
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1800);
    expect(tracker.failureDeadline(1, 1)).toBe(1800 + MAINTENANCE_GRACE_MS);
  });

  it("graceMs 50으로 만들면 A up 1800의 실패 기한은 1850", () => {
    const tracker = new LaneHoldTracker(50);
    tracker.down("A", 1, 1000);
    tracker.up("A", 1800);
    expect(tracker.failureDeadline(1, 1)).toBe(1850);
  });
});

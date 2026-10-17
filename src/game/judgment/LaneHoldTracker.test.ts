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

  it("레인 3에 누른 A의 up 1200은 레인을 받지 않아도 down 때 기록한 레인 3에서 빠져 count(3)=0·shortSince(3, 1)=1200", () => {
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
  it("A·B를 누른 레인 1은 count 2라 need 1·2 모두 shortSince가 undefined", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
    expect(tracker.shortSince(1, 2)).toBeUndefined();
  });

  it("need 0 이하는 언제나 충족되어 입력이 없어도 shortSince(1, 0)은 undefined", () => {
    const tracker = new LaneHoldTracker();
    expect(tracker.shortSince(1, 0)).toBeUndefined();
    expect(tracker.failureDeadline(1, 0, { judgedFrom: 1000 })).toBeUndefined();
  });

  it("사례 1: A 1000–1800·B 1000–3000에서 A up 1800 뒤 need 2는 1800부터 부족해 기한 1820, need 1은 충족", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    tracker.up("A", 1800);
    expect(tracker.shortSince(1, 2)).toBe(1800);
    expect(tracker.failureDeadline(1, 2, { judgedFrom: 1000 })).toBe(1820);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1000 })).toBeUndefined();
  });

  it("사례 1: C down 1830으로 count가 2가 되면 need 2의 shortSince는 undefined라 지난 기한 1820의 실패는 호출하는 쪽이 C 전에 확정해야 함", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("B", 1, 1000);
    tracker.up("A", 1800);
    tracker.down("C", 1, 1830);
    expect(tracker.count(1)).toBe(2);
    expect(tracker.shortSince(1, 2)).toBeUndefined();
    expect(tracker.failureDeadline(1, 2, { judgedFrom: 1000 })).toBeUndefined();
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
    expect(tracker.failureDeadline(1, 2, { judgedFrom: 1000 })).toBe(1820);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1000 })).toBe(1830);
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
    expect(tracker.failureDeadline(1, 2, { judgedFrom: 1000 })).toBe(1820);
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
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1000 })).toBe(1320);
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

  it("입력이 없으면 failureDeadline은 judgedFrom 1100+20=1120이고 refillUntil 1220을 주면 1220", () => {
    const tracker = new LaneHoldTracker();
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1100 })).toBe(1120);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1100, refillUntil: 1220 })).toBe(1220);
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
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1100 })).toBe(1125);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1100, refillUntil: 1220 })).toBe(1220);
  });

  it("A down 1000·up 1210에서 refillUntil 1220이면 부족+유예 1230이 더 늦어 실패 기한 1230", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1210);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1100, refillUntil: 1220 })).toBe(1230);
  });

  it("A up 1105 뒤 down 1140으로 회복하면 refillUntil 1220이 있어도 failureDeadline은 undefined", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1105);
    tracker.down("A", 1, 1140);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1100, refillUntil: 1220 })).toBeUndefined();
  });

  it("A up 1105·down 1140 회복 뒤 up 1400이면 refillUntil 1220보다 새 부족+유예 1420이 늦어 기한 1420", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1105);
    tracker.down("A", 1, 1140);
    tracker.up("A", 1400);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1100, refillUntil: 1220 })).toBe(1420);
  });
});

describe("LaneHoldTracker 유예 길이", () => {
  it("기본 유예는 MAINTENANCE_GRACE_MS=20", () => {
    expect(MAINTENANCE_GRACE_MS).toBe(20);
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1800);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1000 })).toBe(1800 + MAINTENANCE_GRACE_MS);
  });

  it("graceMs 50으로 만들면 A up 1800의 실패 기한은 1850", () => {
    const tracker = new LaneHoldTracker(50);
    tracker.down("A", 1, 1000);
    tracker.up("A", 1800);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1000 })).toBe(1850);
  });
});

describe("LaneHoldTracker 유지를 요구하기 시작한 시각 judgedFrom (RFD 0032 §4-3, §5-4)", () => {
  it("A·C 1000에 누르고 A up 2010·C up 2040 뒤 head를 친 B down 2050부터 need 2를 요구하면 실패 기한은 2010+20이 아닌 2050+20=2070", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("C", 1, 1000);
    tracker.up("A", 2010);
    tracker.up("C", 2040);
    tracker.down("B", 1, 2050);
    expect(tracker.shortSince(1, 2)).toBe(2010);
    expect(tracker.failureDeadline(1, 2, { judgedFrom: 2050 })).toBe(2070);
  });

  it("head를 친 B down 2050 뒤 D down 2055로 count 2가 되면 judgedFrom 2050의 실패 기한은 undefined", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("C", 1, 1000);
    tracker.up("A", 2010);
    tracker.up("C", 2040);
    tracker.down("B", 1, 2050);
    tracker.down("D", 1, 2055);
    expect(tracker.failureDeadline(1, 2, { judgedFrom: 2050 })).toBeUndefined();
  });

  it("§5-4 head Miss: A·C 1000–, A up 2010이면 head 기한 2120에 shortSince(1, 2)=2010이라 그 몫은 유예 없이 바로 정리할 대상", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("C", 1, 1000);
    tracker.up("A", 2010);
    expect(tracker.shortSince(1, 2)).toBe(2010);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
  });

  it("§5-4 head Miss: A·C 1000–, A up 2200이면 head 기한 2120에는 채워 이어서 판단하고 judgedFrom 2120의 실패 기한은 2220", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.down("C", 1, 1000);
    expect(tracker.shortSince(1, 2)).toBeUndefined();
    tracker.up("A", 2200);
    expect(tracker.failureDeadline(1, 2, { judgedFrom: 2120 })).toBe(2220);
  });

  it("judgedFrom보다 늦게 부족해지면 부족 시각 기준: judgedFrom 1000에 A up 1800이면 기한 1820", () => {
    const tracker = new LaneHoldTracker();
    tracker.down("A", 1, 1000);
    tracker.up("A", 1800);
    expect(tracker.failureDeadline(1, 1, { judgedFrom: 1000 })).toBe(1820);
  });
});

describe("LaneHoldTracker 같은 시각 입력의 순서", () => {
  /** X 1000–1500과 A 1000–를 누른 레인 1에 1800의 A up과 B down을 받은 순서대로 넣는다. */
  function alternateAt1800(order: "upFirst" | "downFirst") {
    const tracker = new LaneHoldTracker();
    tracker.down("X", 1, 1000);
    tracker.down("A", 1, 1000);
    tracker.up("X", 1500);
    if (order === "upFirst") { tracker.up("A", 1800); tracker.down("B", 1, 1800); }
    else { tracker.down("B", 1, 1800); tracker.up("A", 1800); }
    return tracker;
  }

  it("1800에 A up을 B down보다 먼저 넣으면 need 2의 부족 시작은 X up 1500 그대로이고 need 1은 충족", () => {
    const tracker = alternateAt1800("upFirst");
    expect(tracker.shortSince(1, 2)).toBe(1500);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
  });

  it("1800에 B down을 A up보다 먼저 넣으면 count가 잠시 2가 되어 need 2의 부족 시작이 1800으로 바뀜", () => {
    const tracker = alternateAt1800("downFirst");
    expect(tracker.shortSince(1, 2)).toBe(1800);
    expect(tracker.shortSince(1, 1)).toBeUndefined();
  });
});

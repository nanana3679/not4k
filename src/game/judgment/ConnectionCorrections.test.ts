import { describe, expect, it } from "vitest";
import { ConnectionCorrections } from "./ConnectionCorrections";

const statuses = (ledger: ConnectionCorrections) =>
  ledger.all.map(record => [record.id, record.status]);

describe("ConnectionCorrections: 익명 FIFO 경계 up 보정", () => {
  it("R10은 A995를 head 성공 후 흡수하고 B1030은 pending, 이후 up은 available로 남긴다", () => {
    const ledger = new ConnectionCorrections({ boundaryAt: 1000, headWindow: 120, correctionCapacity: 2 });
    ledger.up("A995", "A", 995);
    ledger.headSucceeded();
    expect(statuses(ledger)).toEqual([["A995", "absorbed"]]);
    ledger.up("B1030", "B", 1030);
    expect(statuses(ledger)).toEqual([["A995", "absorbed"], ["B1030", "pending"]]);
    ledger.up("C1100", "C", 1100);
    expect(statuses(ledger)).toEqual([
      ["A995", "absorbed"], ["B1030", "pending"], ["C1100", "available"],
    ]);
    ledger.headWindowClose();
    expect(statuses(ledger)).toEqual([
      ["A995", "absorbed"], ["B1030", "available"], ["C1100", "available"],
    ]);
  });

  it("R12는 cap1에서 head보다 앞선 A를 흡수하고 B를 available로 분류한다", () => {
    const ledger = new ConnectionCorrections({ boundaryAt: 1000, headWindow: 120, correctionCapacity: 1 });
    ledger.up("A1010", "A", 1010);
    ledger.up("B1040", "B", 1040);
    expect(statuses(ledger)).toEqual([["A1010", "pending"], ["B1040", "available"]]);
    ledger.headSucceeded();
    expect(statuses(ledger)).toEqual([["A1010", "absorbed"], ["B1040", "available"]]);
    const later = new ConnectionCorrections({ boundaryAt: 1000, headWindow: 120, correctionCapacity: 1 });
    later.headSucceeded();
    expect(later.up("C1100", "C", 1100).status).toBe("absorbed");
    expect(later.up("A1100", "A", 1100).status).toBe("available");
  });

  it("R14는 같은 timestamp의 AB up을 key 선호 없이 하나 pending과 하나 available로 만든다", () => {
    const ledger = new ConnectionCorrections({ boundaryAt: 1000, headWindow: 100, correctionCapacity: 1 });
    ledger.up("A1040", "A", 1040);
    ledger.up("B1040", "B", 1040);
    expect(ledger.pending.map(record => record.id)).toEqual(["A1040"]);
    expect(ledger.available.map(record => record.id)).toEqual(["B1040"]);
    ledger.headSucceeded();
    expect(ledger.absorbed.map(record => record.id)).toEqual(["A1040"]);
  });

  it("후속 head가 먼저 성공하면 앞서 등록된 pending up을 즉시 흡수하고 이후 up은 available로 고정한다", () => {
    const ledger = new ConnectionCorrections({ boundaryAt: 1000, headWindow: 20, correctionCapacity: 1 });
    ledger.up("A999", "A", 999);
    ledger.headSucceeded();
    expect(ledger.absorbed.map(record => record.id)).toEqual(["A999"]);
    ledger.up("C1001", "C", 1001);
    expect(ledger.available.map(record => record.id)).toEqual(["C1001"]);
  });

  it("경계 밖 up과 중복 id를 각각 available 및 오류로 처리한다", () => {
    const ledger = new ConnectionCorrections({ boundaryAt: 1000, headWindow: 10, correctionCapacity: 1 });
    expect(ledger.up("late", "A", 1011).status).toBe("available");
    expect(() => ledger.up("late", "A", 1011)).toThrow("중복 correction up id");
  });
});

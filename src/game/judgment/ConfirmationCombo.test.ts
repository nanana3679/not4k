import { describe, expect, it } from "vitest";
import { ConfirmationCombo } from "./ConfirmationCombo";
import type { NoteJudgmentEvent } from "./NoteJudgmentCore";

const event = (kind: NoteJudgmentEvent["kind"], grade: NoteJudgmentEvent["grade"] = "perfect"): NoteJudgmentEvent => ({
  kind, noteIndex: 0, unitIndex: 0, grade, deltaMs: 0, inputAt: 0, confirmedAt: 0, consumed: kind === "head" || kind === "release",
});

describe("ConfirmationCombo", () => {
  it("NJ-S03: 2P→1P→Miss→1P→(Miss+Gr)는 현재 콤보를 2,3,0,1,0으로 확정", () => {
    const combo = new ConfirmationCombo();
    expect(combo.applyBatch([event("head"), event("release")])).toBe(2);
    expect(combo.applyBatch([event("head")])).toBe(3);
    expect(combo.applyBatch([event("release", "miss")])).toBe(0);
    expect(combo.applyBatch([event("holdOnly")])).toBe(1);
    expect(combo.applyBatch([event("maintenanceMiss"), event("release", "great")])).toBe(0);
  });

  it("같은 batch의 Miss와 성공 판정 입력 순서를 바꿔도 Miss가 성공 증가를 무효화", () => {
    for (const batch of [[event("maintenanceMiss"), event("head")], [event("head"), event("maintenanceMiss")]]) {
      const combo = new ConfirmationCombo();
      combo.applyBatch([event("head")]);
      expect(combo.applyBatch(batch)).toBe(0);
    }
  });

  it("dependentZero는 현재 콤보에 영향을 주지 않고 reset은 0으로 복귀", () => {
    const combo = new ConfirmationCombo();
    combo.applyBatch([event("head")]);
    expect(combo.applyBatch([event("dependentZero", "miss")])).toBe(1);
    combo.reset();
    expect(combo.value).toBe(0);
  });
});

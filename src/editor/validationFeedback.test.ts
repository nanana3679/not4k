import { describe, expect, it } from "vitest";
import { beat } from "../shared";
import type { NoteEntity, ValidationError } from "../shared";
import { hiddenAuxViolationMessage } from "./validationFeedback";

describe("hiddenAuxViolationMessage", () => {
  it("extraLaneCount=2에서 lane=8 위반이면 보조 레인 4와 필요한 레인 수 4를 안내", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 8, beat: beat(1) },
    ];
    const errors: ValidationError[] = [{
      rule: "duplicate",
      message: "duplicate",
      refs: [{ kind: "note", index: 1 }],
    }];

    expect(hiddenAuxViolationMessage(errors, notes, 2)).toBe(
      "숨겨진 보조 레인 4에 수정할 노트가 있습니다. 보조 레인 수를 4 이상으로 늘려 주세요.",
    );
  });

  it("위반 노트가 현재 표시 범위 안이면 별도 안내 없음", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 6, beat: beat(1) }];
    const errors: ValidationError[] = [{
      rule: "duplicate",
      message: "duplicate",
      refs: [{ kind: "note", index: 0 }],
    }];

    expect(hiddenAuxViolationMessage(errors, notes, 2)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { LEAVE_CONFIRM_COPY, PAUSE_TO_EDIT_COPY } from "./editorCopy";

describe("editor leave confirmation copy", () => {
  it("uses English copy for leaving with unsaved changes", () => {
    expect(LEAVE_CONFIRM_COPY.body).toBe(
      "You have unsaved changes. If you leave now, they will be lost.",
    );
  });
});

describe("editor playback editing lock copy", () => {
  it("재생 중 막힌 편집 안내는 영어 'Pause playback to edit'이다", () => {
    expect(PAUSE_TO_EDIT_COPY).toBe("Pause playback to edit");
  });
});

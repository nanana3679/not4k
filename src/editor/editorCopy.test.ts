import { describe, expect, it } from "vitest";
import { INITIAL_TIMING_EXISTS_COPY, LEAVE_CONFIRM_COPY, PAUSE_TO_EDIT_COPY } from "./editorCopy";

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

describe("editor initial timing copy", () => {
  it("0박에 같은 종류 초기 설정이 이미 있어 막은 편집 안내는 영어 'An initial BPM/time signature already exists at beat 0'이다", () => {
    expect(INITIAL_TIMING_EXISTS_COPY).toBe("An initial BPM/time signature already exists at beat 0");
  });
});

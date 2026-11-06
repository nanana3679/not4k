import { describe, expect, it } from "vitest";
import { AUDIO_RANGE_RESET_COPY, INITIAL_TIMING_EXISTS_COPY, LEAVE_CONFIRM_COPY, PAUSE_TO_EDIT_COPY } from "./editorCopy";

describe("editor leave confirmation copy", () => {
  it("미저장 변경이 있는 이탈 확인은 제목 Unsaved Changes와 저장 후 이동·버리고 이동·취소 세 선택을 쓴다", () => {
    expect(LEAVE_CONFIRM_COPY).toMatchObject({ title: "Unsaved Changes", save: "저장 후 이동", discard: "버리고 이동", cancel: "취소" });
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

describe("음원 교체로 기본값으로 돌린 구간의 안내", () => {
  it.each([
    ["preview", "새 음원에 들어가지 않는 프리뷰 구간을 기본값으로 되돌렸습니다."],
    ["gameplay", "새 음원에 들어가지 않는 인게임 구간을 기본값으로 되돌렸습니다."],
    ["both", "새 음원에 들어가지 않는 프리뷰·인게임 구간을 기본값으로 되돌렸습니다."],
  ] as const)("돌린 구간이 %s이면 안내는 '%s'이다", (reset, copy) => {
    expect(AUDIO_RANGE_RESET_COPY[reset]).toBe(copy);
  });
});

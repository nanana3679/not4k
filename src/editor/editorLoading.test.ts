import { describe, expect, it } from "vitest";
import { getEditorAudioLoadingSurface, isStoreAudioLoading } from "./editorLoading";

describe("getEditorAudioLoadingSurface", () => {
  it("keeps the first audio load on a transparent page loading surface", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: false,
      initialAudioPending: true,
    })).toBe("transparentPage");

    expect(getEditorAudioLoadingSurface({
      audioLoading: true,
      initialAudioPending: true,
    })).toBe("transparentPage");
  });

  it("uses canvas overlay for later audio loads after editor boot", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: true,
      initialAudioPending: false,
    })).toBe("overlay");
  });

  it("does not show an audio loading surface when audio is ready", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: false,
      initialAudioPending: false,
    })).toBeNull();
  });
});

describe("isStoreAudioLoading", () => {
  it.each([
    ["드로어 음원을 읽는 중", true, null, true],
    ["받지 않은 URL이 남음", false, "https://audio.invalid/a.ogg", true],
    ["읽는 음원도 남은 URL도 없음", false, null, false],
  ])("%s이면 Save를 막는 음원 로딩 판단은 isLoadingSongAudio=%s·pendingAudioUrl=%s에서 %s다", (_situation, isLoadingSongAudio, pendingAudioUrl, loading) => {
    expect(isStoreAudioLoading({ isLoadingSongAudio, pendingAudioUrl })).toBe(loading);
  });
});

import { describe, expect, it } from "vitest";
import { getEditorAudioLoadingSurface } from "./editorLoading";

describe("getEditorAudioLoadingSurface", () => {
  it("keeps the first audio load on the page loading surface", () => {
    expect(getEditorAudioLoadingSurface({
      audioLoading: false,
      initialAudioPending: true,
    })).toBe("page");

    expect(getEditorAudioLoadingSurface({
      audioLoading: true,
      initialAudioPending: true,
    })).toBe("page");
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

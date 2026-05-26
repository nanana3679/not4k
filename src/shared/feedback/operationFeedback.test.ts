import { describe, expect, it } from "vitest";
import { getOperationLoadingSurface } from "./operationFeedback";

describe("getOperationLoadingSurface", () => {
  it("uses page-level loading for operations that run before page chrome is ready", () => {
    expect(getOperationLoadingSurface({
      operation: "editor.pageLoad",
      running: true,
    })).toBe("solidPage");

    expect(getOperationLoadingSurface({
      operation: "game.songLoad",
      running: true,
    })).toBe("solidPage");
  });

  it("keeps the first editor audio load on a transparent page surface", () => {
    expect(getOperationLoadingSurface({
      operation: "editor.initialAudioLoad",
      running: true,
    })).toBe("transparentPage");
  });

  it("uses an overlay for editor audio reloads after the editor surface exists", () => {
    expect(getOperationLoadingSurface({
      operation: "editor.audioReload",
      running: true,
    })).toBe("overlay");
  });

  it("keeps button-scoped operations out of page and overlay loading surfaces", () => {
    expect(getOperationLoadingSurface({
      operation: "chart.save",
      running: true,
    })).toBe("button");

    expect(getOperationLoadingSurface({
      operation: "song.delete",
      running: true,
    })).toBe("button");
  });

  it("returns no surface when the operation is idle", () => {
    expect(getOperationLoadingSurface({
      operation: "editor.audioReload",
      running: false,
    })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  canAutoPreviewSongs,
  canPreviewSongs,
  canStartGameplay,
  getGameExperience,
} from "./useGameExperience";

describe("getGameExperience", () => {
  it("uses the mobile song list on narrow viewports", () => {
    expect(getGameExperience({ viewportWidth: 390, pointer: "fine" })).toBe(
      "mobileSongList",
    );
  });

  it("uses the mobile song list for coarse pointer devices", () => {
    expect(getGameExperience({ viewportWidth: 1024, pointer: "coarse" })).toBe(
      "mobileSongList",
    );
  });

  it("uses the full game on desktop pointer layouts", () => {
    expect(getGameExperience({ viewportWidth: 1280, pointer: "fine" })).toBe(
      "fullGame",
    );
  });
});

describe("canStartGameplay", () => {
  it("blocks gameplay in the mobile song list experience", () => {
    expect(canStartGameplay("mobileSongList")).toBe(false);
  });

  it("allows gameplay in the full game experience", () => {
    expect(canStartGameplay("fullGame")).toBe(true);
  });
});

describe("canPreviewSongs", () => {
  it("allows preview audio in the mobile song list experience", () => {
    expect(canPreviewSongs("mobileSongList")).toBe(true);
  });

  it("allows preview audio in the full game experience", () => {
    expect(canPreviewSongs("fullGame")).toBe(true);
  });
});

describe("canAutoPreviewSongs", () => {
  it("does not auto-preview on mobile because playback needs a tap gesture", () => {
    expect(canAutoPreviewSongs("mobileSongList")).toBe(false);
  });

  it("keeps desktop auto-preview behavior", () => {
    expect(canAutoPreviewSongs("fullGame")).toBe(true);
  });
});

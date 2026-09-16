import { describe, expect, it } from "vitest";
import {
  BODY_ASSETS,
  KEYBOMB_VARIANTS,
  TERMINAL_ASSETS,
  getPointNoteAsset,
} from "./noteAssetShowcase";

describe("noteAssetShowcase", () => {
  it("싱글은 대기·켜짐·꺼짐 3개, 더블은 대기·켜짐·중앙광·꺼짐 4개 바디 상태를 제공", () => {
    expect(BODY_ASSETS).toHaveLength(7);
    expect(BODY_ASSETS.filter(({ kind }) => kind === "single").map(({ state }) => state)).toEqual(["idle", "on", "off"]);
    expect(BODY_ASSETS.filter(({ kind }) => kind === "double").map(({ state }) => state)).toEqual(["idle", "on", "partial-off", "off"]);
  });

  it("터미널은 싱글·더블마다 대기·켜짐·실패·Grace 4개 상태를 제공", () => {
    expect(TERMINAL_ASSETS).toHaveLength(8);
    expect(TERMINAL_ASSETS.filter(({ kind }) => kind === "single").map(({ state }) => state))
      .toEqual(["idle", "on", "failed", "grace"]);
    expect(TERMINAL_ASSETS.find(({ kind, state }) => kind === "double" && state === "grace")?.src)
      .toBe("/lab/note-assets/terminal-double-grace.svg");
  });

  it("포인트 노트 원본은 싱글·더블 경로를 각각 제공", () => {
    expect(getPointNoteAsset("single")).toBe("/lab/note-assets/note-single.png");
    expect(getPointNoteAsset("double")).toBe("/lab/note-assets/note-double.png");
  });

  it("공통 키봄 6개는 200ms에서 300ms 안에 종료", () => {
    expect(KEYBOMB_VARIANTS).toHaveLength(6);
    expect(KEYBOMB_VARIANTS.every(({ duration }) => duration >= 200 && duration <= 300)).toBe(true);
  });
});

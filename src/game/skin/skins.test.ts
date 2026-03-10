import { describe, it, expect } from "vitest";
import { SKIN_LIST, getSkinManifest } from "./skins";

describe("SKIN_LIST", () => {
  it("8개 스킨이 등록되어 있음", () => {
    expect(SKIN_LIST).toHaveLength(8);
  });

  it("모든 스킨 ID가 고유함", () => {
    const ids = SKIN_LIST.map((s) => s.theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 스킨의 에셋 경로가 올바른 패턴", () => {
    for (const skin of SKIN_LIST) {
      const id = skin.theme.id;
      expect(skin.assets.noteSingle).toBe(`/skins/${id}/note-single.png`);
      expect(skin.assets.bomb).toHaveLength(16);
      expect(skin.assets.bomb[0]).toBe(`/skins/${id}/bomb-00.png`);
      expect(skin.assets.bomb[15]).toBe(`/skins/${id}/bomb-15.png`);
      expect(skin.assets.buttonIdle).toHaveLength(4);
      expect(skin.assets.buttonPressed).toHaveLength(4);
    }
  });
});

describe("getSkinManifest", () => {
  it("유효한 skinId로 매니페스트 조회 성공", () => {
    const crystal = getSkinManifest("crystal");
    expect(crystal.theme.name).toBe("Crystal");
  });

  it("잘못된 skinId로 에러 throw", () => {
    expect(() => getSkinManifest("nonexistent")).toThrowError(
      "Unknown skin: nonexistent"
    );
  });
});

describe("SkinTheme", () => {
  it("모든 스킨의 테마 색상값이 유효한 24비트 정수", () => {
    const colorKeys = ["accent", "beamColor", "heldLine", "heldGlow", "bg", "text"] as const;
    for (const skin of SKIN_LIST) {
      for (const key of colorKeys) {
        const value = skin.theme[key];
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(0xffffff);
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("모든 스킨의 에셋 경로가 .png 확장자", () => {
    for (const skin of SKIN_LIST) {
      const { assets } = skin;
      const paths = [
        assets.noteSingle, assets.noteDouble,
        assets.terminalSingle, assets.terminalDouble,
        assets.bodySingle, assets.bodyDouble,
        assets.bodySingleHeld, assets.bodyDoubleHeld,
        assets.gearFrame,
        ...assets.bomb, ...assets.buttonIdle, ...assets.buttonPressed,
      ];
      for (const p of paths) {
        expect(p).toMatch(/\.png$/);
      }
    }
  });
});

import { describe, it, expect } from "vitest";
import { SKIN_LIST, AVAILABLE_SKINS, getSkinManifest } from "./skins";

describe("SKIN_LIST", () => {
  it("3개 스킨이 등록되어 있음", () => {
    expect(SKIN_LIST).toHaveLength(3);
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

  it("기어 프레임과 기둥 게이지는 모든 스킨이 공통 /gear/ 경로를 사용", () => {
    for (const skin of SKIN_LIST) {
      expect(skin.assets.gearFrame).toBe("/gear/gear-frame.png");
      expect(skin.assets.gearGaugeLeft).toBe("/gear/gear-gauge-left.png");
      expect(skin.assets.gearGaugeRight).toBe("/gear/gear-gauge-right.png");
    }
  });
});

describe("AVAILABLE_SKINS", () => {
  it("available=true인 스킨만 포함하며 crystal만 선택 가능", () => {
    const ids = AVAILABLE_SKINS.map((s) => s.theme.id);
    expect(ids).toEqual(["crystal"]);
  });

  it("prism, classic은 available=false라 선택지에서 제외됨", () => {
    const ids = AVAILABLE_SKINS.map((s) => s.theme.id);
    expect(ids).not.toContain("prism");
    expect(ids).not.toContain("classic");
  });

  it("AVAILABLE_SKINS의 모든 스킨은 available 플래그가 true", () => {
    for (const skin of AVAILABLE_SKINS) {
      expect(skin.theme.available).toBe(true);
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
        assets.gearFrame, assets.gearGaugeLeft, assets.gearGaugeRight,
        ...assets.bomb, ...assets.buttonIdle, ...assets.buttonPressed,
      ];
      for (const p of paths) {
        expect(p).toMatch(/\.png$/);
      }
    }
  });
});

describe("롱노트 캡 에셋", () => {
  it("crystal은 전용 endCap 경로 4종(single/double/single-failed/double-failed)을 가짐", () => {
    const crystal = getSkinManifest("crystal");
    expect(crystal.assets.endCapSingle).toBe("/skins/crystal/end-cap-single.png");
    expect(crystal.assets.endCapDouble).toBe("/skins/crystal/end-cap-double.png");
    expect(crystal.assets.endCapSingleFailed).toBe("/skins/crystal/end-cap-single-failed.png");
    expect(crystal.assets.endCapDoubleFailed).toBe("/skins/crystal/end-cap-double-failed.png");
  });

  it("prism·classic은 endCap 경로가 없어 terminal crop으로 fallback함", () => {
    for (const id of ["prism", "classic"]) {
      const skin = getSkinManifest(id);
      expect(skin.assets.endCapSingle).toBeUndefined();
      expect(skin.assets.endCapDouble).toBeUndefined();
      expect(skin.assets.endCapSingleFailed).toBeUndefined();
      expect(skin.assets.endCapDoubleFailed).toBeUndefined();
    }
  });
});

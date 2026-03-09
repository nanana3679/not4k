import { describe, it, expect } from "vitest";
import { SKIN_LIST, getSkinManifest } from "./skins";

describe("SKIN_LIST", () => {
  it("7개 스킨이 등록되어 있음", () => {
    expect(SKIN_LIST).toHaveLength(7);
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

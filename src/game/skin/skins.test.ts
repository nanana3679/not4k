import { afterEach, describe, it, expect, vi } from "vitest";
import { SKIN_LIST, AVAILABLE_SKINS, getSkinManifest, buildManifest } from "./skins";

describe("SKIN_LIST", () => {
  it("Classic과 미공개 Crystal·Prism·Simple·Note Asset Lab 5개 스킨을 등록", () => {
    expect(SKIN_LIST).toHaveLength(5);
  });

  it("모든 스킨 ID가 고유함", () => {
    const ids = SKIN_LIST.map((s) => s.theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 스킨의 에셋 경로가 올바른 패턴", () => {
    for (const skin of SKIN_LIST) {
      const id = skin.theme.id;
      const base = id === "note-asset-lab" ? "/lab/note-assets/skin" : `/skins/${id}`;
      expect(skin.assets.noteSingle).toBe(`${base}/note-single.png`);
      expect(skin.assets.bomb).toHaveLength(16);
      expect(skin.assets.bomb[0]).toBe(`${base}/bomb-00.png`);
      expect(skin.assets.bomb[15]).toBe(`${base}/bomb-15.png`);
      expect(skin.assets.buttonIdle).toHaveLength(4);
      expect(skin.assets.buttonPressed).toHaveLength(4);
    }
  });

  it("기어 프레임은 모든 스킨이 공통 새 Classic 프레임 /gear/classic-frame.png를 쓰고 옛 기둥 게이지 에셋은 없다", () => {
    for (const skin of SKIN_LIST) {
      expect(skin.assets.gearFrame).toBe("/gear/classic-frame.png");
      expect(skin.assets).not.toHaveProperty("gearGaugeLeft");
      expect(skin.assets).not.toHaveProperty("gearGaugeRight");
    }
  });
});

describe("공개 배포의 스킨 에셋 주소", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("/not4k/ 배포에서 5개 스킨의 모든 PNG는 기존 저장 위치에 접두사를 한 번만 붙인다", async () => {
    vi.stubEnv("BASE_URL", "/not4k/");
    vi.resetModules();
    const { getSkinManifest: getPublicSkinManifest } = await import("./skins");

    for (const original of SKIN_LIST) {
      const deployed = getPublicSkinManifest(original.theme.id);
      expect(deployed.theme).toEqual(original.theme);
      for (const [key, paths] of Object.entries(original.assets)) {
        expect(deployed.assets).toHaveProperty(
          key,
          Array.isArray(paths) ? paths.map(path => `/not4k${path}`) : `/not4k${paths}`,
        );
      }
    }
  });
});

describe("AVAILABLE_SKINS", () => {
  it("available=true인 classic만 인게임 스킨 선택지로 제공", () => {
    const ids = AVAILABLE_SKINS.map((s) => s.theme.id);
    expect(ids).toEqual(["classic"]);
  });

  it("완성도가 낮아 개발 중으로 돌린 crystal은 available=false라 선택지에서 빠지지만 매니페스트는 남아 있다", () => {
    expect(getSkinManifest("crystal").theme.available).toBe(false);
    expect(AVAILABLE_SKINS.some((s) => s.theme.id === "crystal")).toBe(false);
  });

  it("prism, simple, note-asset-lab은 available=false라 선택지에서 제외됨", () => {
    const ids = AVAILABLE_SKINS.map((s) => s.theme.id);
    expect(ids).not.toContain("prism");
    expect(ids).not.toContain("simple");
    expect(ids).not.toContain("note-asset-lab");
  });

  it("AVAILABLE_SKINS의 모든 스킨은 available 플래그가 true", () => {
    for (const skin of AVAILABLE_SKINS) {
      expect(skin.theme.available).toBe(true);
    }
  });
});

describe("getSkinManifest", () => {
  it("Classic 터미널은 바디와 같은100px 폭으로 돌출 없이 표시", () => {
    const classic = getSkinManifest('classic');
    expect(classic.theme.longNoteTerminalFrameOverhangPx).toBe(0);
    expect(classic.theme.longNoteTerminalMode).toBe('full-height');
  });
  it("유효한 skinId로 매니페스트 조회 성공", () => {
    const crystal = getSkinManifest("crystal");
    expect(crystal.theme.name).toBe("Crystal");
  });

  it("잘못된 skinId로 에러 throw", () => {
    expect(() => getSkinManifest("nonexistent")).toThrowError(
      "Unknown skin: nonexistent"
    );
  });

  it("note-asset-lab은 개발 전용 public/lab 에셋을 사용", () => {
    const lab = getSkinManifest("note-asset-lab");
    expect(lab.theme.available).toBe(false);
    expect(lab.theme.longNoteTerminalMode).toBe("full-height");
    expect(lab.theme.longNoteTerminalFrameOverhangPx).toBe(2);
    expect(lab.assets.noteSingle).toBe("/lab/note-assets/skin/note-single.png");
    expect(lab.assets.terminalSingleIdle).toBe("/lab/note-assets/skin/terminal-single-idle.png");
    expect(lab.assets.terminalDoubleIdle).toBe("/lab/note-assets/skin/terminal-double-idle.png");
    expect(lab.assets.terminalTrillIdle).toBe("/lab/note-assets/skin/terminal-trill-idle.png");
    expect(lab.assets.bodyDoublePartialHeldLeft).toBe("/lab/note-assets/skin/body-double-partial-held-left.png");
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
        ...(assets.terminalSingleIdle ? [assets.terminalSingleIdle] : []),
        ...(assets.terminalDoubleIdle ? [assets.terminalDoubleIdle] : []),
        ...(assets.terminalTrillIdle ? [assets.terminalTrillIdle] : []),
        assets.bodySingle, assets.bodyDouble,
        // 켜짐 에셋은 heldEffect: false 스킨(Simple)에 없다.
        ...(assets.bodySingleHeld ? [assets.bodySingleHeld] : []),
        ...(assets.bodyDoubleHeld ? [assets.bodyDoubleHeld] : []),
        assets.gearFrame,
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

  it("prism·simple은 endCap 경로가 없어 terminal crop으로 fallback함", () => {
    for (const id of ["prism", "simple"]) {
      const skin = getSkinManifest(id);
      expect(skin.assets.endCapSingle).toBeUndefined();
      expect(skin.assets.endCapDouble).toBeUndefined();
      expect(skin.assets.endCapSingleFailed).toBeUndefined();
      expect(skin.assets.endCapDoubleFailed).toBeUndefined();
    }
  });
});

describe("부분 충족 held 바디 에셋 (더블 롱노트 1/2)", () => {
  it("crystal은 waitingSide별 left/right 2종 경로를 가짐", () => {
    const crystal = getSkinManifest("crystal");
    expect(crystal.assets.bodyDoublePartialHeldLeft).toBe("/skins/crystal/body-double-partial-held-left.png");
    expect(crystal.assets.bodyDoublePartialHeldRight).toBe("/skins/crystal/body-double-partial-held-right.png");
  });

  it("켜짐 효과가 있는 모든 스킨은 부분 held 경로를 .png로 가지고, 효과 없는 스킨은 갖지 않는다", () => {
    for (const skin of SKIN_LIST) {
      if (skin.theme.heldEffect === false) {
        expect(skin.assets.bodyDoublePartialHeldLeft, skin.theme.id).toBeUndefined();
        expect(skin.assets.bodyDoublePartialHeldRight, skin.theme.id).toBeUndefined();
        continue;
      }
      expect(skin.assets.bodyDoublePartialHeldLeft).toMatch(/body-double-partial-held-left\.png$/);
      expect(skin.assets.bodyDoublePartialHeldRight).toMatch(/body-double-partial-held-right\.png$/);
    }
  });
});

describe("heldEffect 선언 (RFD 0028)", () => {
  const theme = getSkinManifest("classic").theme;

  it("heldEffect: false 테마로 만든 매니페스트에는 켜짐 에셋 5종 경로가 없고 부분 실패 에셋 경로는 남는다", () => {
    const manifest = buildManifest("no-effect", { ...theme, id: "no-effect", heldEffect: false });
    for (const key of ["bodySingleHeld", "bodyDoubleHeld", "bodyDoublePartialHeldLeft", "bodyDoublePartialHeldRight", "bodyTrillHeld"] as const) {
      expect(manifest.assets[key], key).toBeUndefined();
    }
    expect(manifest.assets.bodyDoublePartialFailedLeft).toBe("/skins/no-effect/body-double-partial-failed-left.png");
  });

  it("heldEffect를 생략하면 지금처럼 켜짐 에셋 경로를 만든다", () => {
    const manifest = buildManifest("with-effect", { ...theme, id: "with-effect" });
    expect(manifest.assets.bodySingleHeld).toBe("/skins/with-effect/body-single-held.png");
    expect(manifest.assets.bodyTrillHeld).toBe("/skins/with-effect/body-trill-held.png");
  });

  it("Classic·Crystal은 켜짐 효과를 유지하고 켜짐 에셋 경로가 있다", () => {
    for (const id of ["classic", "crystal"]) {
      expect(getSkinManifest(id).theme.heldEffect, id).not.toBe(false);
      expect(getSkinManifest(id).assets.bodySingleHeld, id).toBeDefined();
    }
  });

  it("Simple은 heldEffect: false라 켜짐 에셋 경로가 없고 부분 실패 경로는 남는다", () => {
    const simple = getSkinManifest("simple");
    expect(simple.theme.heldEffect).toBe(false);
    for (const key of ["bodySingleHeld", "bodyDoubleHeld", "bodyDoublePartialHeldLeft", "bodyDoublePartialHeldRight", "bodyTrillHeld"] as const) {
      expect(simple.assets[key], key).toBeUndefined();
    }
    expect(simple.assets.bodyDoublePartialFailedLeft).toBe("/skins/simple/body-double-partial-failed-left.png");
  });
});

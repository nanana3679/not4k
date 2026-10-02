import { describe, expect, it } from "vitest";
import { getSkinManifest } from "../../game/skin/skins";
import {
  createJudgmentCaseSkin,
  judgmentCaseSkinAssetPaths,
  readPngSize,
  type JudgmentCaseSkinImage,
} from "./judgmentCaseSkin";

/** public/skins PNG의 실제 크기(원본 픽셀) */
function assetSize(assetPath: string): { width: number; height: number } {
  if (assetPath.includes("grace-overlay")) return { width: 248, height: 88 };
  if (assetPath.includes("contact-shadow-trill")) return { width: 200, height: 60 };
  if (assetPath.includes("contact-shadow")) return { width: 200, height: 20 };
  if (assetPath.includes("end-cap")) return { width: 100, height: 10 };
  if (assetPath.startsWith("/skins/classic/note-single") || assetPath.startsWith("/skins/classic/note-double")) return { width: 212, height: 40 };
  if (assetPath.startsWith("/skins/classic/")) return { width: 200, height: 40 };
  return assetPath.includes("/body-") ? { width: 100, height: 60 } : { width: 100, height: 20 };
}

/** 실제 PNG 크기로 만든 가짜 이미지(내용은 쓰지 않는다) */
function fakeImages(paths: Partial<Record<string, string>>): Record<string, JudgmentCaseSkinImage> {
  return Object.fromEntries(Object.entries(paths).map(([key, assetPath]) => [key, { href: `data:image/png;base64,${key}`, ...assetSize(assetPath!) }]));
}

function skinFor(id: string) {
  const manifest = getSkinManifest(id);
  return createJudgmentCaseSkin(manifest, fakeImages(judgmentCaseSkinAssetPaths(manifest)));
}

describe("judgmentCaseSkinAssetPaths — 판정 전(대기) 에셋만 고름", () => {
  it("Classic은 포인트 3종·대기 바디 3종·중앙광이 꺼진 대기 터미널 3종·Grace overlay 2종·접촉 그림자 2종을 고름", () => {
    expect(judgmentCaseSkinAssetPaths(getSkinManifest("classic"))).toEqual({
      noteSingle: "/skins/classic/note-single.png",
      noteDouble: "/skins/classic/note-double.png",
      noteTrill: "/skins/classic/note-trill.png",
      bodySingle: "/skins/classic/body-single.png",
      bodyDouble: "/skins/classic/body-double.png",
      bodyTrill: "/skins/classic/body-trill.png",
      terminalSingleIdle: "/skins/classic/terminal-single-idle.png",
      terminalDoubleIdle: "/skins/classic/terminal-double-idle.png",
      terminalTrillIdle: "/skins/classic/terminal-trill-idle.png",
      pointGraceOverlay: "/skins/classic/point-grace-overlay.png",
      terminalGraceOverlay: "/skins/classic/terminal-grace-overlay.png",
      pointContactShadow: "/skins/classic/point-contact-shadow.png",
      pointContactShadowTrill: "/skins/classic/point-contact-shadow-trill.png",
    });
  });

  it("세 스킨 모두 켜짐(Held)·실패(Failed)·부분 상태 에셋 경로를 고르지 않음", () => {
    for (const id of ["classic", "crystal", "simple"]) {
      const paths = judgmentCaseSkinAssetPaths(getSkinManifest(id));
      expect(Object.keys(paths).join(" ")).not.toMatch(/Held|Failed|Partial/);
      expect(Object.values(paths).join(" ")).not.toMatch(/held|failed|partial/);
    }
  });

  it("대기 터미널이 없는 Crystal(반쪽 캡)은 terminalSingle과 전용 캡 endCapSingle·endCapDouble을 고름", () => {
    const paths = judgmentCaseSkinAssetPaths(getSkinManifest("crystal"));
    expect(paths.terminalSingle).toBe("/skins/crystal/terminal-single.png");
    expect(paths.endCapSingle).toBe("/skins/crystal/end-cap-single.png");
    expect(paths.endCapDouble).toBe("/skins/crystal/end-cap-double.png");
    expect(paths.terminalSingleIdle).toBeUndefined();
  });

  it("Grace overlay·접촉 그림자 에셋이 없는 Simple은 그 경로를 고르지 않음", () => {
    const paths = judgmentCaseSkinAssetPaths(getSkinManifest("simple"));
    expect(paths.pointGraceOverlay).toBeUndefined();
    expect(paths.pointContactShadow).toBeUndefined();
    expect(paths.endCapSingle).toBeUndefined();
  });
});

describe("createJudgmentCaseSkin — 게임 그리기 규칙에 필요한 값", () => {
  it("Classic은 전체 높이 터미널·바디 반복, Grace overlay 여백 12px, 접촉 그림자 위아래 5px", () => {
    const skin = skinFor("classic");
    expect(skin.terminalMode).toBe("full-height");
    expect(skin.bodyMode).toBe("repeat");
    expect(skin.graceOverlayPaddingPx).toBe(12);
    expect(skin.pointContactShadow).toEqual({ above: 5, below: 5 });
    expect(skin.terminal.single.key).toBe("terminalSingleIdle");
    expect(skin.cap).toBeUndefined();
  });

  it("Classic 포인트 212px·바디 200px이면 싱글·더블 바디 폭 비율 200/212, 트릴은 포인트·바디 모두 200px라 1", () => {
    const skin = skinFor("classic");
    expect(skin.bodyWidthScale.single).toBeCloseTo(200 / 212);
    expect(skin.bodyWidthScale.double).toBeCloseTo(200 / 212);
    expect(skin.bodyWidthScale.trill).toBe(1);
  });

  it("Crystal은 반쪽 캡·바디 늘이기이고 캡은 전용 endCapSingle 이미지 전체(100×10)", () => {
    const skin = skinFor("crystal");
    expect(skin.terminalMode).toBe("split-cap");
    expect(skin.bodyMode).toBe("stretch");
    expect(skin.cap?.single).toEqual({ key: "endCapSingle", x: 0, y: 0, width: 100, height: 10 });
  });

  it("전용 캡이 없는 Simple은 terminalSingle(100×20) 윗부분 절반 0,0,100,10을 캡으로 자름", () => {
    const skin = skinFor("simple");
    expect(skin.cap?.single).toEqual({ key: "terminalSingle", x: 0, y: 0, width: 100, height: 10 });
    expect(skin.cap?.double).toEqual({ key: "terminalDouble", x: 0, y: 0, width: 100, height: 10 });
  });

  it("Simple은 Grace overlay·접촉 그림자가 없어 비워 둠(렌더러가 게임 대체 글로우를 그림)", () => {
    const skin = skinFor("simple");
    expect(skin.pointGraceOverlay).toBeUndefined();
    expect(skin.terminalGraceOverlay).toBeUndefined();
    expect(skin.pointContactShadow).toBeUndefined();
    expect(skin.contactShadow).toBeUndefined();
  });

  it("고른 에셋의 이미지가 하나라도 빠지면 그 키를 담은 에러", () => {
    const manifest = getSkinManifest("classic");
    const images = fakeImages(judgmentCaseSkinAssetPaths(manifest));
    delete images.bodySingle;
    expect(() => createJudgmentCaseSkin(manifest, images)).toThrow(/bodySingle/);
  });
});

describe("readPngSize", () => {
  it("IHDR의 폭·높이 212×40을 읽음", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0, 0, 0, 212, 0, 0, 0, 40], 16);
    expect(readPngSize(bytes)).toEqual({ width: 212, height: 40 });
  });

  it("PNG 서명이 아니면 에러", () => {
    expect(() => readPngSize(new Uint8Array(24))).toThrow(/PNG/);
  });
});

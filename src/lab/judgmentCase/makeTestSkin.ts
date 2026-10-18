/**
 * makeTestSkin — 판정 사례 테스트용 스킨 팩토리.
 *
 * 스킨 매니페스트가 고른 public/ PNG의 실제 크기를 readPngSize로 읽고, 이미지 주소는 에셋 키만 담은 짧은 가짜 data URI로 둔다.
 * 크기를 손으로 적은 표를 테스트마다 두지 않도록 한 곳에 모은다.
 * src는 Node 타입 없이 타입 검사하므로 node:fs 대신 Vite `?inline`(base64 data URI)으로 PNG 바이트를 읽는다.
 * 프로덕션 코드가 아니라 테스트 지원 모듈이다 (judgmentCaseSkin·renderJudgmentCaseSvg의 *.test.ts가 import).
 */

import { getSkinManifest } from "../../game/skin/skins";
import {
  createJudgmentCaseSkin,
  judgmentCaseSkinAssetPaths,
  readPngSize,
  type JudgmentCaseSkin,
  type JudgmentCaseSkinImage,
} from "./judgmentCaseSkin";

/** public/skins/<스킨>/*.png(폭발·버튼 프레임 제외)의 data URI. 키는 이 파일 기준 상대 경로 */
const PUBLIC_SKIN_PNGS = import.meta.glob<string>(
  ["../../../public/skins/*/*.png", "!**/bomb-*.png", "!**/button-*.png"],
  { query: "?inline", import: "default", eager: true },
);

/** 매니페스트 에셋 경로(`/skins/<id>/…png`)가 가리키는 public/ 파일의 바이트. 파일이 없으면 undefined */
export function readPublicSkinAsset(assetPath: string): Uint8Array | undefined {
  const dataUri = PUBLIC_SKIN_PNGS[`../../../public/${assetPath.replace(/^\/+/, "")}`];
  if (dataUri === undefined) return undefined;
  const binary = atob(dataUri.slice(dataUri.indexOf(",") + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** 에셋 키별 가짜 이미지: 크기는 public/ PNG 실측, 주소는 `data:image/png;base64,<키>` */
export function fakeSkinImages(paths: Partial<Record<string, string>>): Record<string, JudgmentCaseSkinImage> {
  return Object.fromEntries(Object.entries(paths).map(([key, assetPath]) => {
    const bytes = readPublicSkinAsset(assetPath!);
    if (!bytes) throw new Error(`public${assetPath} 파일이 없습니다 (${key})`);
    return [key, { href: `data:image/png;base64,${key}`, ...readPngSize(bytes) }];
  }));
}

/** 실제 PNG 크기로 만든 렌더러용 스킨(이미지 내용은 짧은 가짜 주소) */
export function makeTestSkin(id: string): JudgmentCaseSkin {
  const manifest = getSkinManifest(id);
  return createJudgmentCaseSkin(manifest, fakeSkinImages(judgmentCaseSkinAssetPaths(manifest)));
}

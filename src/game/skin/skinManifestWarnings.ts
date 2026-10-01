import type { SkinManifest } from "./types";

/** 켜짐(홀드) 에셋. `theme.heldEffect`가 false가 아니면 모두 필요하다(RFD 0028). */
export const HELD_ASSET_KEYS = [
  "bodySingleHeld", "bodyDoubleHeld", "bodyDoublePartialHeldLeft", "bodyDoublePartialHeldRight", "bodyTrillHeld",
] as const;

const CONTACT_SHADOW_ASSET_KEYS = ["pointContactShadow", "pointContactShadowTrill"] as const;

/**
 * 로딩은 되지만 화면에 반영되지 않는 스킨 설정·에셋 불일치를 찾는다(#174).
 * 스킨 제작자가 실수를 알아챌 수 있게 문제마다 경고 문장 하나를 돌려준다. 없으면 빈 배열이다.
 * 트릴 접촉 그림자 이미지(`pointContactShadowTrill`)만 없는 경우는 의도한 fallback이라 경고하지 않는다.
 */
export function findSkinManifestWarnings(manifest: SkinManifest): string[] {
  const { theme, assets } = manifest;
  const warnings: string[] = [];

  if (theme.pointContactShadow && !assets.pointContactShadow) {
    warnings.push(
      `스킨 "${theme.id}"에 theme.pointContactShadow는 있지만 assets.pointContactShadow가 없습니다. `
      + "싱글·더블 포인트에 접촉 그림자를 그리지 않고, pointShadow가 있으면 그것으로 대신합니다.",
    );
  }

  // 접촉 그림자 이미지는 선언만 있으면 SkinManager가 불러오지만, 렌더러는 테마 설정이 함께 있을 때만 쓴다.
  const unusedContactShadows = theme.pointContactShadow
    ? []
    : CONTACT_SHADOW_ASSET_KEYS.filter((key) => assets[key]);
  if (unusedContactShadows.length > 0) {
    warnings.push(
      `스킨 "${theme.id}"에 theme.pointContactShadow가 없어 불러온 접촉 그림자 이미지를 쓰지 않습니다: `
      + `${unusedContactShadows.map((key) => `assets.${key}`).join(", ")}. 접촉 그림자를 쓰려면 theme.pointContactShadow도 선언합니다.`,
    );
  }

  // heldEffect: false 스킨은 SkinManager가 켜짐 에셋을 걸러 내므로 선언해도 불러오지 않는다(RFD 0028).
  const ignoredHeldAssets = theme.heldEffect === false
    ? HELD_ASSET_KEYS.filter((key) => assets[key])
    : [];
  if (ignoredHeldAssets.length > 0) {
    warnings.push(
      `heldEffect: false인 스킨 "${theme.id}"에 선언한 켜짐 에셋은 불러오지 않습니다: `
      + `${ignoredHeldAssets.map((key) => `assets.${key}`).join(", ")}. 효과 없는 스킨이면 이 선언을 지웁니다.`,
    );
  }

  return warnings;
}

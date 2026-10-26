import { buildExplicitSkinView, getExplicitSkinAsset } from "../../game/skin/explicitSkin";
import type { ExplicitSkinAssetId, ExplicitSkinView } from "../../game/skin/explicitSkin";
import type { JudgmentCaseSkinImage } from "./judgmentCaseSkin";

export interface ExplicitCaseSkin {
  readonly name: "classic-explicit";
  readonly view: ExplicitSkinView;
  readonly images: Readonly<Partial<Record<ExplicitSkinAssetId, JudgmentCaseSkinImage>>>;
}

/** 정식 manifest의 경로·논리 좌표를 사용하며 legacy terminal/cap으로 대체하지 않는다. */
export function explicitCaseSkinAssetPaths(): Record<ExplicitSkinAssetId, string> {
  const view = buildExplicitSkinView("/");
  return Object.fromEntries(Object.keys(view.assetsById).map(id => [id, getExplicitSkinAsset(view, id).url])) as Record<ExplicitSkinAssetId, string>;
}

export function createExplicitCaseSkin(images: ExplicitCaseSkin["images"]): ExplicitCaseSkin {
  const view = buildExplicitSkinView("/");
  for (const id of Object.keys(view.assetsById)) {
    const asset = getExplicitSkinAsset(view, id);
    const image = images[asset.id];
    if (!image || image.width !== asset.pixelSize.width || image.height !== asset.pixelSize.height) {
      throw new Error(`classic-explicit 에셋이 없거나 PNG 크기가 다릅니다: ${id}`);
    }
  }
  return { name: "classic-explicit", view, images };
}

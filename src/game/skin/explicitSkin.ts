import generatedManifest from "./explicitSkinManifest.json";
import { withPublicBase } from "../../shared/publicPath";
import { validateExplicitSkinManifest } from "./explicitSkinContract";
import type { ExplicitSkinAssetId, ExplicitSkinAssetMetadata, ExplicitSkinImage, ExplicitSkinManifest } from "./explicitSkinContract";

export type { ExplicitSkinAssetId, ExplicitSkinAssetMetadata, ExplicitSkinManifest } from "./explicitSkinContract";
export { EXPLICIT_SKIN_ASSET_IDS } from "./explicitSkinContract";

export interface ExplicitSkinAsset extends ExplicitSkinAssetMetadata {
  url: string;
  highResolution?: ExplicitSkinImage & { url: string };
}

export interface ExplicitSkinView {
  id: "classic-explicit";
  body: ExplicitSkinManifest["body"];
  assetsById: Readonly<Record<ExplicitSkinAssetId, ExplicitSkinAsset>>;
}

/** URL·좌표만 준비한다. Pixi 로드나 판정 상태 선택을 호출하지 않는다. */
export function buildExplicitSkinView(
  baseUrl = import.meta.env.BASE_URL,
  manifest: ExplicitSkinManifest = generatedManifest as ExplicitSkinManifest,
): ExplicitSkinView {
  validateExplicitSkinManifest(manifest);
  const url = (file: string) => withPublicBase(`${manifest.runtimePath}/${file}`, baseUrl);
  const assetsById = Object.fromEntries(manifest.assets.map(asset => [asset.id, {
    ...asset,
    url: url(asset.file),
    ...(asset.highResolution ? { highResolution: { ...asset.highResolution, url: url(asset.highResolution.file) } } : {}),
  }])) as Record<ExplicitSkinAssetId, ExplicitSkinAsset>;
  return { id: manifest.id, body: manifest.body, assetsById };
}

/** 없는 역할을 다른 스킨·terminal·정상 도안으로 대체하지 않는다. */
export function getExplicitSkinAsset(view: ExplicitSkinView, id: string): ExplicitSkinAsset {
  if (!Object.hasOwn(view.assetsById, id)) throw new Error(`Unsupported explicit skin asset: ${id}`);
  return view.assetsById[id as ExplicitSkinAssetId];
}

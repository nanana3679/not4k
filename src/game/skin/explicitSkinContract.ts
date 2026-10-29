/** 정적 도안 가용성이다. 판정 상태 선택·성공 알파·표시 수명은 포함하지 않는다. */
export const EXPLICIT_SKIN_ASSET_IDS = [
  "tap.single.pending", "tap.double.pending", "tap.double.failed",
  "tap.trill.pending", "tap.trill.failed",
  "body.single.idle", "body.single.held", "body.single.failed",
  "body.double.idle", "body.double.held", "body.double.failed",
  "body.trill.idle", "body.trill.held", "body.trill.failed",
  "body.double.partialHeld.left", "body.double.partialHeld.right",
  "body.double.partialFailed.left", "body.double.partialFailed.right",
  "release.single.pending", "release.single.failed",
  "release.double.pending", "release.double.failed",
  "release.double.partialFailed.left", "release.double.partialFailed.right",
  "tick.single.pending", "tick.single.failed",
  "tick.double.pending.left", "tick.double.pending.right",
  "tick.double.failed.left", "tick.double.failed.right",
  "graceOverlay.tap.overlay", "graceOverlay.trill.overlay", "graceOverlay.release.overlay",
] as const;

export type ExplicitSkinAssetId = typeof EXPLICIT_SKIN_ASSET_IDS[number];
export type ExplicitSkinRole = "tap" | "body" | "release" | "tick" | "graceOverlay";
export type ExplicitSkinVariant = "single" | "double" | "trill" | "tap" | "release";
export type ExplicitSkinArtworkState = "pending" | "idle" | "held" | "failed" | "partialHeld" | "partialFailed" | "overlay";
export interface ExplicitSkinSize { width: number; height: number }
export interface ExplicitSkinPosition { x: number; y: number }
export interface ExplicitSkinRect extends ExplicitSkinSize, ExplicitSkinPosition {}

export interface ExplicitSkinImage {
  /** classic-explicit/ 아래 파일명. 원본 PNG를 변환하지 않고 복사한다. */
  file: string;
  source: string;
  pixelSize: ExplicitSkinSize;
  resolution: 1 | 2;
  bytes: number;
  sha256: string;
}

export interface ExplicitSkinAssetMetadata extends ExplicitSkinImage {
  id: ExplicitSkinAssetId;
  role: ExplicitSkinRole;
  variant: ExplicitSkinVariant;
  state: ExplicitSkinArtworkState;
  side?: "left" | "right";
  /** partialHeld는 미충족 쪽, partialFailed는 실패 쪽, tick은 표식 쪽이다. */
  sideMeaning?: "unmet" | "failed" | "marker";
  /** 투명 여백을 포함한 전체 캔버스의 논리 크기. */
  logicalSize: ExplicitSkinSize;
  /** 겹칠 본체 영역. Grace 패딩은 이 영역 밖이며 잘라내지 않는다. */
  contentRect: ExplicitSkinRect;
  /** 전체 캔버스에 대한 정규화 좌표. 레인 중앙·자기 beat에 맞춘다. */
  anchor: ExplicitSkinPosition;
  markerCenter?: ExplicitSkinPosition;
  sourceApproval: string;
  highResolution?: ExplicitSkinImage;
}

export interface ExplicitSkinManifest {
  schemaVersion: 1;
  id: "classic-explicit";
  runtimePath: "/skins/classic-explicit";
  /** 트릴을 뺀 역할은 #348 선택 도안, 트릴 Grace overlay는 #339 보관본, 트릴 탭·바디는 v014 기록에서 온다. */
  provenance: {
    selected: { sourceCommit: string; sourcePullRequest: 348; manifestSha256: string };
    approved: { sourceCommit: string; sourcePullRequest: 339; manifestSha256: string };
    historicalManifestSha256: string;
  };
  body: {
    mode: "repeat";
    axis: "y";
    tileSize: ExplicitSkinSize;
    laneReferenceWidth: 212;
    startCap: false;
    endCap: false;
  };
  assets: readonly ExplicitSkinAssetMetadata[];
}

/** 빌더와 순수 view가 같은 필수 역할·좌표 계약을 확인한다. */
export function validateExplicitSkinManifest(manifest: ExplicitSkinManifest): void {
  if (manifest.schemaVersion !== 1 || manifest.id !== "classic-explicit" || manifest.runtimePath !== "/skins/classic-explicit") {
    throw new Error("Unsupported explicit skin manifest");
  }
  const expectedIds = new Set<string>(EXPLICIT_SKIN_ASSET_IDS);
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    if (!expectedIds.has(asset.id)) throw new Error(`Unsupported explicit skin asset: ${asset.id}`);
    if (seen.has(asset.id)) throw new Error(`Duplicate explicit skin asset: ${asset.id}`);
    seen.add(asset.id);
    if ([asset.role, asset.variant, asset.state, asset.side].filter(Boolean).join(".") !== asset.id) {
      throw new Error(`Explicit skin role/side mismatch: ${asset.id}`);
    }
    const overlay = asset.role === "graceOverlay";
    const contentWidth = (asset.role === "tap" && asset.variant !== "trill") || (overlay && asset.variant === "tap") ? 212 : 200;
    const padding = overlay ? 24 : 0;
    if (asset.logicalSize.width !== contentWidth + padding * 2 || asset.logicalSize.height !== 40 + padding * 2
      || asset.contentRect.x !== padding || asset.contentRect.y !== padding
      || asset.contentRect.width !== contentWidth || asset.contentRect.height !== 40
      || asset.anchor.x !== 0.5 || asset.anchor.y !== 0.5) {
      throw new Error(`Invalid explicit skin geometry: ${asset.id}`);
    }
    const sideMeaning = asset.state === "partialHeld" ? "unmet" : asset.state === "partialFailed" ? "failed"
      : asset.role === "tick" && asset.variant === "double" ? "marker" : undefined;
    if (asset.sideMeaning !== sideMeaning || Boolean(asset.side) !== Boolean(sideMeaning)) {
      throw new Error(`Invalid explicit skin side: ${asset.id}`);
    }
    if (asset.role === "tick") {
      const x = asset.variant === "single" ? 100 : asset.side === "left" ? 84 : 116;
      if (asset.markerCenter?.x !== x || asset.markerCenter.y !== 20) {
        throw new Error(`Invalid tick marker position: ${asset.id}`);
      }
    } else if (asset.markerCenter) throw new Error(`Unexpected tick marker: ${asset.id}`);
    for (const image of [asset, ...(asset.highResolution ? [asset.highResolution] : [])]) {
      const expectedResolution = image === asset ? 1 : 2;
      if (image.resolution !== expectedResolution
        || image.pixelSize.width !== asset.logicalSize.width * expectedResolution
        || image.pixelSize.height !== asset.logicalSize.height * expectedResolution
        || !/^[a-z0-9-]+(?:@2x)?\.png$/.test(image.file)
        || !/^[a-f0-9]{64}$/.test(image.sha256) || image.bytes <= 0 || !image.source) {
        throw new Error(`Invalid explicit skin image: ${asset.id}`);
      }
    }
  }
  for (const id of expectedIds) if (!seen.has(id)) throw new Error(`Missing explicit skin asset: ${id}`);
  if (manifest.body.mode !== "repeat" || manifest.body.axis !== "y"
    || manifest.body.tileSize.width !== 200 || manifest.body.tileSize.height !== 40
    || manifest.body.laneReferenceWidth !== 212 || manifest.body.startCap !== false || manifest.body.endCap !== false) {
    throw new Error("Invalid explicit body tiling; caps are unsupported");
  }
}

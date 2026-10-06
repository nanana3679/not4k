import { Texture, Rectangle, type TextureSourceOptions } from "pixi.js";
import type { SkinManifest, SkinTheme } from "./types";
import { CLASSIC_GEAR_TEXTURE_OPTIONS } from "../renderer/classicGearLayout";
import { getSkinManifest } from "./skins";
import { findSkinManifestWarnings, HELD_ASSET_KEYS } from "./skinManifestWarnings";
import { loadSharedAsset, releaseSharedAsset, retainSharedAsset } from "./sharedAssets";

interface SkinAssetOwnership {
  readonly paths: Set<string>;
  released: boolean;
}

function releaseSkinAssetOwnership(ownership: SkinAssetOwnership): void {
  if (ownership.released) return;
  ownership.released = true;
  for (const path of ownership.paths) releaseSharedAsset(path);
}

/**
 * 기본(선형·밉맵 없음)과 다르게 읽어야 하는 텍스처. 기어는 원본보다 작게(렌더 높이 1080에서 약 0.82배) 그려지므로
 * 밉맵·삼선형 필터로 읽는다. 업로드할 때 밉맵이 만들어지므로 로드 시점에 정해야 한다.
 */
const TEXTURE_LOAD_OPTIONS: Readonly<Record<string, Partial<TextureSourceOptions>>> = {
  gearImage: CLASSIC_GEAR_TEXTURE_OPTIONS,
};

/**
 * 롱노트 캡 텍스처 키 매핑: terminal texKey → 전용 endCap texKey.
 * 전용 캡 에셋이 로드된 스킨이면 이 키의 텍스처를 사용하고, 없으면 crop fallback한다.
 * partial-failed 캡은 윗부분 색이 double과 같아 endCapDouble을 재사용한다.
 */
const CAP_TEXTURE_KEY: Record<string, string> = {
  terminalSingle: "endCapSingle",
  terminalDouble: "endCapDouble",
  terminalSingleFailed: "endCapSingleFailed",
  terminalDoubleFailed: "endCapDoubleFailed",
  terminalDoublePartialFailedLeft: "endCapDouble",
  terminalDoublePartialFailedRight: "endCapDouble",
};

/**
 * 스킨 에셋 로더 + 텍스처 캐시 관리
 *
 * 사용:
 *   const sm = new SkinManager();
 *   await sm.loadSkin("crystal");
 *   const tex = sm.getTexture("noteSingle");
 */
export class SkinManager {
  private manifest: SkinManifest | null = null;
  private textures = new Map<string, { texture: Texture; path: string }>();
  private bombTextures: Texture[] = [];
  /** terminal 텍스처에서 잘라낸 캡 텍스처 캐시 (texKey → 윗부분 절반) */
  private capTextures = new Map<string, Texture>();
  private loaded = false;
  private disposed = false;
  private loadGeneration = 0;
  private assetOwnership: SkinAssetOwnership | null = null;

  /** 현재 로드된 스킨 ID */
  get skinId(): string | null {
    return this.manifest?.theme.id ?? null;
  }

  /** 스킨의 모든 에셋을 로드 */
  async loadSkin(skin: string | SkinManifest): Promise<void> {
    const manifest = typeof skin === 'string' ? getSkinManifest(skin) : skin;
    // A preview may supply a different version with the same theme ID.
    if (this.loaded && this.manifest === manifest) return;

    // 켜짐 효과가 있는 스킨은 켜짐 에셋이 모두 있어야 한다. 기존 텍스처를 해제하기 전에 확인한다.
    const heldEffect = manifest.theme.heldEffect !== false;
    if (heldEffect) {
      const missing = HELD_ASSET_KEYS.filter((key) => !manifest.assets[key]);
      if (missing.length > 0) {
        throw new Error(
          `켜짐 효과가 있는 스킨 "${manifest.theme.id}"에 켜짐 에셋이 없습니다: ${missing.join(", ")}. `
          + "효과 없는 스킨이면 theme.heldEffect를 false로 선언합니다.",
        );
      }
    }

    // 로딩은 되지만 화면에 반영되지 않는 설정·에셋 불일치를 개발 환경에서만 알린다(#174). 배포 빌드에서는 분기째 제거된다.
    if (import.meta.env.DEV) {
      for (const warning of findSkinManifestWarnings(manifest)) console.warn(warning);
    }

    // 기존 텍스처 해제
    this.dispose();
    this.disposed = false;
    const generation = ++this.loadGeneration;

    this.manifest = manifest;

    const { assets } = manifest;

    // 개별 에셋 로드. 켜짐 에셋은 heldEffect가 false인 스킨에서 빠지므로 경로가 있는 항목만 남긴다.
    const entries: [string, string][] = ([
      ["noteSingle", assets.noteSingle],
      ["noteDouble", assets.noteDouble],
      ["terminalSingle", assets.terminalSingle],
      ["terminalDouble", assets.terminalDouble],
      ["bodySingle", assets.bodySingle],
      ["bodyDouble", assets.bodyDouble],
      ["bodySingleHeld", assets.bodySingleHeld],
      ["bodyDoubleHeld", assets.bodyDoubleHeld],
      // 실패 에셋
      ["noteDoubleFailed", assets.noteDoubleFailed],
      ["bodySingleFailed", assets.bodySingleFailed],
      ["bodyDoubleFailed", assets.bodyDoubleFailed],
      ["terminalSingleFailed", assets.terminalSingleFailed],
      ["terminalDoubleFailed", assets.terminalDoubleFailed],
      // 부분 실패 에셋
      ["bodyDoublePartialFailedLeft", assets.bodyDoublePartialFailedLeft],
      ["bodyDoublePartialFailedRight", assets.bodyDoublePartialFailedRight],
      ["terminalDoublePartialFailedLeft", assets.terminalDoublePartialFailedLeft],
      ["terminalDoublePartialFailedRight", assets.terminalDoublePartialFailedRight],
      ["noteDoublePartialFailedLeft", assets.noteDoublePartialFailedLeft],
      ["noteDoublePartialFailedRight", assets.noteDoublePartialFailedRight],
      // 부분 충족 held 에셋
      ["bodyDoublePartialHeldLeft", assets.bodyDoublePartialHeldLeft],
      ["bodyDoublePartialHeldRight", assets.bodyDoublePartialHeldRight],
      // 트릴 에셋
      ["noteTrill", assets.noteTrill],
      ["terminalTrill", assets.terminalTrill],
      ["bodyTrill", assets.bodyTrill],
      ["bodyTrillHeld", assets.bodyTrillHeld],
      ["noteTrillFailed", assets.noteTrillFailed],
      ["bodyTrillFailed", assets.bodyTrillFailed],
      ["terminalTrillFailed", assets.terminalTrillFailed],
      // 기어
      ["gearImage", assets.gearImage],
    ] as [string, string | undefined][])
      .filter((entry): entry is [string, string] =>
        entry[1] !== undefined && (heldEffect || !(HELD_ASSET_KEYS as readonly string[]).includes(entry[0])));

    if (assets.terminalSingleIdle) entries.push(["terminalSingleIdle", assets.terminalSingleIdle]);
    if (assets.terminalDoubleIdle) entries.push(["terminalDoubleIdle", assets.terminalDoubleIdle]);
    if (assets.terminalTrillIdle) entries.push(["terminalTrillIdle", assets.terminalTrillIdle]);
    if (assets.pointGraceOverlay) entries.push(["pointGraceOverlay", assets.pointGraceOverlay]);
    if (assets.terminalGraceOverlay) entries.push(["terminalGraceOverlay", assets.terminalGraceOverlay]);
    if (assets.pointShadow) entries.push(["pointShadow", assets.pointShadow]);
    if (assets.pointContactShadow) entries.push(["pointContactShadow", assets.pointContactShadow]);
    if (assets.pointContactShadowTrill) entries.push(["pointContactShadowTrill", assets.pointContactShadowTrill]);

    // 롱노트 전용 캡 에셋 (있는 스킨만 — 없으면 getHalfCapTexture가 terminal crop으로 fallback)
    if (assets.endCapSingle) entries.push(["endCapSingle", assets.endCapSingle]);
    if (assets.endCapDouble) entries.push(["endCapDouble", assets.endCapDouble]);
    if (assets.endCapSingleFailed) entries.push(["endCapSingleFailed", assets.endCapSingleFailed]);
    if (assets.endCapDoubleFailed) entries.push(["endCapDoubleFailed", assets.endCapDoubleFailed]);

    // 봄 프레임
    for (let i = 0; i < assets.bomb.length; i++) {
      entries.push([`bomb${i}`, assets.bomb[i]]);
    }

    // 버튼 (idle + pressed × 4)
    for (let i = 0; i < assets.buttonIdle.length; i++) {
      entries.push([`buttonIdle${i}`, assets.buttonIdle[i]]);
    }
    for (let i = 0; i < assets.buttonPressed.length; i++) {
      entries.push([`buttonPressed${i}`, assets.buttonPressed[i]]);
    }

    const assetOwnership: SkinAssetOwnership = {
      paths: new Set(entries.map(([, path]) => path)),
      released: false,
    };
    this.assetOwnership = assetOwnership;
    for (const path of assetOwnership.paths) {
      retainSharedAsset(path);
    }

    // 모든 텍스처를 병렬 로드
    const loadPromises = entries.map(async ([key, path]) => {
      const texture = await loadSharedAsset<Texture>(path, TEXTURE_LOAD_OPTIONS[key]);
      if (!this.disposed && generation === this.loadGeneration) {
        this.textures.set(key, { texture, path });
      }
    });

    try {
      await Promise.all(loadPromises);
    } catch (error) {
      releaseSkinAssetOwnership(assetOwnership);
      if (this.assetOwnership === assetOwnership) this.assetOwnership = null;
      throw error;
    }

    if (this.disposed || generation !== this.loadGeneration) return;

    // 봄 텍스처 배열 구성
    this.bombTextures = [];
    for (let i = 0; i < assets.bomb.length; i++) {
      this.bombTextures.push(this.textures.get(`bomb${i}`)!.texture);
    }

    this.loaded = true;
  }

  /** 개별 텍스처 조회 */
  getTexture(key: string): Texture {
    if (!this.loaded) {
      throw new Error("SkinManager: no skin loaded");
    }
    const entry = this.textures.get(key);
    if (!entry) {
      throw new Error(`SkinManager: unknown texture key "${key}"`);
    }
    return entry.texture;
  }

  /** 현재 스킨에서 선택 에셋 키가 로드되어 있는지 확인 */
  hasTexture(key: string): boolean {
    return this.textures.has(key);
  }

  /**
   * 포인트 이미지 폭 대비 바디 이미지 폭(최대 1). 포인트 이미지 전체가 레인 폭이므로,
   * 바디 이미지가 포인트보다 좁은 스킨은 이 비율로 바디·끝 터미널·그림자를 줄여 가운데에 둔다.
   * 두 이미지는 같은 배율로 내보냈다고 본다. 텍스처가 없으면 1이다.
   */
  getBodyWidthScale(kind: "single" | "double" | "trill"): number {
    const suffix = kind === "single" ? "Single" : kind === "double" ? "Double" : "Trill";
    const point = this.textures.get(`note${suffix}`)?.texture;
    const body = this.textures.get(`body${suffix}`)?.texture;
    if (!point || !body || point.width <= 0) return 1;
    return Math.min(1, body.width / point.width);
  }

  /**
   * 롱노트 캡 텍스처. 전용 캡 에셋(endCap*)이 로드된 스킨은 그것을 사용하고,
   * 없는 스킨은 terminal 텍스처의 윗부분 절반(=캡 모양)을 런타임 crop해 fallback한다.
   * 시작 캡(상하반전)·끝 캡 양쪽에서 같은 텍스처를 공유한다.
   *
   * TODO(assets-lab): prism/simple은 아직 crop fallback을 쓴다.
   * 추후 해당 스킨에도 전용 캡 에셋(assets-lab의 EndCap)을 추가하면 crop 경로를 제거할 수 있다.
   */
  getHalfCapTexture(key: string): Texture {
    // 전용 캡 에셋 우선
    const dedicatedKey = CAP_TEXTURE_KEY[key];
    if (dedicatedKey) {
      const entry = this.textures.get(dedicatedKey);
      if (entry) return entry.texture;
    }

    // fallback: terminal 텍스처의 윗부분 절반을 런타임 crop
    const cached = this.capTextures.get(key);
    if (cached) return cached;

    const base = this.getTexture(key);
    const f = base.frame;
    const cap = new Texture({
      source: base.source,
      frame: new Rectangle(f.x, f.y, f.width, f.height / 2),
    });
    this.capTextures.set(key, cap);
    return cap;
  }

  /** 봄 AnimatedSprite용 16프레임 텍스처 배열 */
  getBombTextures(): Texture[] {
    if (!this.loaded) {
      throw new Error("SkinManager: no skin loaded");
    }
    return this.bombTextures;
  }

  /** 런타임 테마 (키빔, 글로우 등 동적 색상) */
  getTheme(): SkinTheme {
    if (!this.manifest) {
      throw new Error("SkinManager: no skin loaded");
    }
    return this.manifest.theme;
  }

  /** 텍스처 메모리 해제 */
  dispose(): void {
    this.disposed = true;
    this.loadGeneration += 1;
    if (this.assetOwnership) {
      releaseSkinAssetOwnership(this.assetOwnership);
      this.assetOwnership = null;
    }
    this.textures.clear();
    // 캡 텍스처는 base의 source를 공유하므로 unload 없이 캐시만 비운다
    this.capTextures.clear();
    this.bombTextures = [];
    this.manifest = null;
    this.loaded = false;
  }

}

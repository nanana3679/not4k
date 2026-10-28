import type { Texture } from "pixi.js";
import { buildExplicitSkinView, getExplicitSkinAsset } from "./explicitSkin";
import type { ExplicitSkinAssetId, ExplicitSkinView } from "./explicitSkin";
import { loadSharedAsset, releaseSharedAsset, retainSharedAsset } from "./sharedAssets";

/** 에디터와 인게임이 공유하는 읽기 전용 텍스처 seam. 사용자가 loader의 수명을 소유한다. */
export interface ExplicitSkinTextures {
  readonly view: ExplicitSkinView;
  getTexture(id: string): Texture;
}

interface LoadOwnership {
  readonly paths: ReadonlySet<string>;
  released: boolean;
}

/** 기존 SkinManager·선택 가능한 스킨과 분리된 명시 도안 loader. */
export class ExplicitSkinLoader implements ExplicitSkinTextures {
  private texturesById = new Map<ExplicitSkinAssetId, Texture>();
  private ownership: LoadOwnership | null = null;
  private generation = 0;
  private resolution: 1 | 2 | null = null;
  private pending: Promise<void> | null = null;

  constructor(readonly view: ExplicitSkinView = buildExplicitSkinView()) {}

  load({ resolution = 1 }: { resolution?: 1 | 2 } = {}): Promise<void> {
    if (this.resolution === resolution) return this.pending ?? Promise.resolve();
    this.dispose();
    const generation = this.generation;
    this.resolution = resolution;
    const entries = Object.values(this.view.assetsById).map(asset => {
      const image = resolution === 2 && asset.highResolution ? asset.highResolution : asset;
      return { id: asset.id, path: image.url, resolution: image.resolution };
    });
    const ownership: LoadOwnership = { paths: new Set(entries.map(entry => entry.path)), released: false };
    this.ownership = ownership;
    for (const path of ownership.paths) retainSharedAsset(path);
    // 모두 성공하기 전에는 조회할 수 없다. 실패 후 늦게 resolve하는 load도 sharedAssets가 unload한다.
    const operation = Promise.all(entries.map(async entry => [entry.id,
      await loadSharedAsset<Texture>(entry.path, { resolution: entry.resolution }),
    ] as const)).then(loaded => {
      if (generation !== this.generation) {
        throw new DOMException("명시 스킨 로드가 취소되었습니다", "AbortError");
      }
      this.texturesById = new Map(loaded);
    }).catch((error: unknown) => {
      this.release(ownership);
      if (generation === this.generation) {
        this.ownership = null;
        this.texturesById.clear();
        this.resolution = null;
      }
      throw error;
    }).finally(() => {
      if (generation === this.generation) this.pending = null;
    });
    this.pending = operation;
    return operation;
  }

  getTexture(id: string): Texture {
    const asset = getExplicitSkinAsset(this.view, id);
    const texture = this.texturesById.get(asset.id);
    if (!texture) throw new Error(`ExplicitSkinLoader: texture not loaded: ${id}`);
    return texture;
  }

  getLoadedTextures(): ReadonlyMap<ExplicitSkinAssetId, Texture> {
    if (this.texturesById.size !== Object.keys(this.view.assetsById).length) {
      throw new Error("ExplicitSkinLoader: no skin loaded");
    }
    return new Map(this.texturesById);
  }

  dispose(): void {
    this.generation++;
    if (this.ownership) this.release(this.ownership);
    this.ownership = null;
    this.pending = null;
    this.resolution = null;
    this.texturesById.clear();
  }

  private release(ownership: LoadOwnership): void {
    if (ownership.released) return;
    ownership.released = true;
    for (const path of ownership.paths) releaseSharedAsset(path);
  }
}

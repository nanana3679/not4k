export interface StaticLayerCacheTarget {
  readonly children: readonly unknown[];
  readonly isCachedAsTexture: boolean;
  cacheAsTexture(value: boolean): void;
  updateCacheTexture(): void;
}

/**
 * Caches populated static layers so playback cursor frames composite textures
 * instead of re-walking every note Graphics object.
 */
export function enableStaticLayerCache(layers: readonly StaticLayerCacheTarget[]): void {
  for (const layer of layers) {
    if (layer.children.length === 0) {
      if (layer.isCachedAsTexture) layer.cacheAsTexture(false);
      continue;
    }

    if (layer.isCachedAsTexture) {
      layer.updateCacheTexture();
    } else {
      layer.cacheAsTexture(true);
    }
  }
}

export function disableStaticLayerCache(layers: readonly StaticLayerCacheTarget[]): void {
  for (const layer of layers) {
    if (layer.isCachedAsTexture) layer.cacheAsTexture(false);
  }
}

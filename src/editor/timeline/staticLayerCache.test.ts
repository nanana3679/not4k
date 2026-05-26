import { describe, expect, it } from "vitest";
import {
  disableStaticLayerCache,
  enableStaticLayerCache,
} from "./staticLayerCache";

class FakeLayer {
  children: unknown[] = [];
  isCachedAsTexture = false;
  cacheCalls: boolean[] = [];
  updateCalls = 0;

  cacheAsTexture(value: boolean): void {
    this.cacheCalls.push(value);
    this.isCachedAsTexture = value;
  }

  updateCacheTexture(): void {
    this.updateCalls++;
  }
}

describe("static timeline layer cache", () => {
  it("enables caching only for layers that have visible content", () => {
    const empty = new FakeLayer();
    const populated = new FakeLayer();
    populated.children = [{}];

    enableStaticLayerCache([empty, populated]);

    expect(empty.cacheCalls).toEqual([]);
    expect(populated.cacheCalls).toEqual([true]);
  });

  it("refreshes existing cached layers instead of re-enabling them", () => {
    const layer = new FakeLayer();
    layer.children = [{}];
    layer.isCachedAsTexture = true;

    enableStaticLayerCache([layer]);

    expect(layer.cacheCalls).toEqual([]);
    expect(layer.updateCalls).toBe(1);
  });

  it("disables stale caches when a cached layer becomes empty", () => {
    const layer = new FakeLayer();
    layer.isCachedAsTexture = true;

    enableStaticLayerCache([layer]);

    expect(layer.cacheCalls).toEqual([false]);
  });

  it("turns off every active static cache before rebuilding layers", () => {
    const uncached = new FakeLayer();
    const cached = new FakeLayer();
    cached.isCachedAsTexture = true;

    disableStaticLayerCache([uncached, cached]);

    expect(uncached.cacheCalls).toEqual([]);
    expect(cached.cacheCalls).toEqual([false]);
  });
});

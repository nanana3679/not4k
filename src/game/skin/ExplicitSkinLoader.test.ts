import { beforeEach, describe, expect, it, vi } from "vitest";
const { load, unload } = vi.hoisted(() => ({ load: vi.fn(), unload: vi.fn(async () => undefined) }));
vi.mock("pixi.js", () => ({ Assets: { load, unload } }));
import { ExplicitSkinLoader } from "./ExplicitSkinLoader";
import { buildExplicitSkinView } from "./explicitSkin";
import { sharedAssetReferenceCount } from "./sharedAssets";

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const requestPath = (request: { src: string }) => request.src;
let testNumber = 0;
const view = () => buildExplicitSkinView(`/loader-test-${++testNumber}/`);

describe("명시 스킨 shared asset 수명", () => {
  beforeEach(() => { load.mockReset(); unload.mockClear(); load.mockImplementation(async request => ({ path: requestPath(request) })); });

  it("load 전·dispose 뒤 texture 조회는 거부하고 같은 resolution을 두 번 load하면 33개 역할만 한 번 준비한다", async () => {
    const loader = new ExplicitSkinLoader(view());
    expect(() => loader.getTexture("body.single.idle")).toThrow("not loaded");
    const first = loader.load();
    expect(loader.load({ resolution: 1 })).toBe(first);
    await first;
    expect(load).toHaveBeenCalledTimes(33);
    expect(loader.getLoadedTextures().size).toBe(33);
    await loader.load();
    expect(load).toHaveBeenCalledTimes(33);
    expect(() => loader.getTexture("terminal.single.idle")).toThrow("Unsupported explicit skin asset");
    loader.dispose(); loader.dispose();
    expect(() => loader.getLoadedTextures()).toThrow("no skin loaded");
    await flush();
    expect(unload).toHaveBeenCalledTimes(33);
  });

  it("2배 도안이 있는 역할은 @2x와 resolution 2로 읽고 33개 역할의 논리 geometry는 1배와 같다", async () => {
    const loader = new ExplicitSkinLoader(view());
    const before = structuredClone(loader.view);
    await loader.load({ resolution: 2 });
    for (const [request] of load.mock.calls) {
      expect(request.data.resolution).toBe(request.src.includes("@2x") ? 2 : 1);
    }
    expect(load.mock.calls.filter(([request]) => request.src.includes("@2x"))).toHaveLength(22);
    expect(loader.view).toEqual(before);
    loader.dispose(); await flush();
  });

  it("같은 도안의 loader 두 개 중 하나만 dispose하면 다른 소유자 texture를 unload하지 않는다", async () => {
    const metadata = view();
    const a = new ExplicitSkinLoader(metadata), b = new ExplicitSkinLoader(metadata);
    await Promise.all([a.load(), b.load()]);
    const path = metadata.assetsById["sustain.single.pending"].url;
    expect(sharedAssetReferenceCount(path)).toBe(2);
    a.dispose(); await flush();
    expect(unload).not.toHaveBeenCalled();
    expect(b.getTexture("sustain.single.pending")).toBeTruthy();
    b.dispose(); await flush();
    expect(sharedAssetReferenceCount(path)).toBe(0);
    expect(unload).toHaveBeenCalledTimes(33);
  });

  it("33개 중 한 load가 실패하면 부분 texture 조회를 막고 늦게 성공한 나머지 경로까지 모두 release한다", async () => {
    const pending = deferred<object>();
    load.mockImplementationOnce(async () => { throw new Error("PNG 404"); });
    load.mockImplementationOnce(() => pending.promise);
    const loader = new ExplicitSkinLoader(view());
    await expect(loader.load()).rejects.toThrow("PNG 404");
    expect(() => loader.getTexture("point.single.pending")).toThrow("not loaded");
    pending.resolve({}); await flush();
    expect(unload).toHaveBeenCalledTimes(33);
    expect(Object.values(loader.view.assetsById).every(asset => sharedAssetReferenceCount(asset.url) === 0)).toBe(true);
    await loader.load();
    expect(loader.getLoadedTextures().size).toBe(33);
    loader.dispose(); await flush();
  });

  it("load 중 dispose한 뒤 늦게 resolve하면 AbortError로 거부하고 cache를 되살리지 않는다", async () => {
    const pending = deferred<object>();
    load.mockImplementation(() => pending.promise);
    const loader = new ExplicitSkinLoader(view());
    const operation = loader.load();
    const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });
    await flush(); loader.dispose();
    pending.resolve({}); await rejected; await flush();
    expect(() => loader.getLoadedTextures()).toThrow("no skin loaded");
    expect(unload).toHaveBeenCalledTimes(33);
  });

  it("1배 load 도중 2배 load로 바꾸면 이전 generation은 거부하고 새 generation의 texture만 제공한다", async () => {
    const pending = deferred<object>();
    load.mockImplementation(request => request.data.resolution === 1 ? pending.promise : Promise.resolve({ resolution: 2 }));
    const loader = new ExplicitSkinLoader(view());
    const first = loader.load({ resolution: 1 });
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    const second = loader.load({ resolution: 2 });
    pending.resolve({ resolution: 1 });
    await rejected; await second;
    expect(loader.getTexture("release.single.pending")).toMatchObject({ resolution: 2 });
    loader.dispose(); await flush();
  });
});

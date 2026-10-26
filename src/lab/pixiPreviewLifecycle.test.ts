import { describe, expect, it } from "vitest";
import { startPixiPreview } from "./pixiPreviewLifecycle";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function startFake() {
  const calls: string[] = [];
  const destroyArgs: unknown[][] = [];
  const errors: unknown[] = [];
  const beforeInit = deferred(), init = deferred(), load = deferred();
  const cancel = startPixiPreview({
    app: { destroy: (...args: unknown[]) => { calls.push("destroy"); destroyArgs.push(args); } },
    beforeInit: () => { calls.push("beforeInit"); return beforeInit.promise; },
    init: () => { calls.push("init"); return init.promise; },
    load: () => { calls.push("load"); return load.promise; },
    mount: () => { calls.push("mount"); },
    release: () => { calls.push("release"); },
    onError: error => { errors.push(error); },
  });
  const ready = async () => { beforeInit.resolve(); await flush(); init.resolve(); await flush(); load.resolve(); await flush(); };
  return { calls, destroyArgs, errors, cancel, beforeInit, init, load, ready };
}

const keepGlobalResources = [{ removeView: true, releaseGlobalResources: false }, { children: true, texture: false }];

describe("Lab Pixi 미리보기 수명", () => {
  it("beforeInit(Pixi 호환 모듈)이 끝나기 전에는 init을 부르지 않고 그 사이 취소하면 init·앱 파괴 없이 장면·로더만 해제한다", async () => {
    const preview = startFake();
    await flush();
    expect(preview.calls).toEqual(["beforeInit"]);
    preview.cancel();
    preview.beforeInit.resolve();
    await flush();
    expect(preview.calls).toEqual(["beforeInit", "release"]);
  });

  it("준비를 마친 미리보기를 취소하면 장면·로더 해제 뒤 앱을 releaseGlobalResources false로 한 번만 파괴한다", async () => {
    const preview = startFake();
    await preview.ready();
    preview.cancel();
    preview.cancel();
    expect(preview.calls).toEqual(["beforeInit", "init", "load", "mount", "release", "destroy"]);
    expect(preview.destroyArgs).toEqual([keepGlobalResources]);
  });

  it("init 대기 중 취소한 미리보기의 init이 새 미리보기 mount 뒤에 끝나면 취소한 앱만 releaseGlobalResources false로 한 번 파괴하고 새 앱은 파괴하지 않는다", async () => {
    const cancelled = startFake();
    cancelled.beforeInit.resolve();
    await flush();
    cancelled.cancel();
    const replacement = startFake();
    await replacement.ready();
    expect(replacement.calls).toContain("mount");
    cancelled.init.resolve();
    await flush();
    expect(cancelled.calls).toEqual(["beforeInit", "init", "release", "destroy"]);
    expect(cancelled.destroyArgs).toEqual([keepGlobalResources]);
    expect(replacement.destroyArgs).toEqual([]);
  });

  it("스킨 로드 대기 중 취소하면 즉시 장면·로더 해제와 앱 파괴를 한 번 하고 로드가 늦게 끝나도 mount하지 않는다", async () => {
    const preview = startFake();
    preview.beforeInit.resolve();
    await flush();
    preview.init.resolve();
    await flush();
    preview.cancel();
    expect(preview.calls).toEqual(["beforeInit", "init", "load", "release", "destroy"]);
    preview.load.resolve();
    await flush();
    expect(preview.calls).toEqual(["beforeInit", "init", "load", "release", "destroy"]);
    expect(preview.destroyArgs).toEqual([keepGlobalResources]);
  });
});

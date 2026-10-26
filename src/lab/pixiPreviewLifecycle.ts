import type { Application } from "pixi.js";

export interface PixiPreviewSteps {
  /** 이 미리보기만 소유하는 앱. 초기화가 끝난 뒤에만 파괴한다. */
  readonly app: Pick<Application, "destroy">;
  /** init 전 준비(예: CSP용 Pixi 호환 모듈). 이 단계에서 취소되면 init을 부르지 않는다. */
  readonly beforeInit: () => Promise<unknown>;
  readonly init: () => Promise<void>;
  /** init 뒤 에셋 로드. */
  readonly load: () => Promise<void>;
  /** 모든 준비가 끝나고 취소되지 않았을 때 장면을 만든다. */
  readonly mount: () => void;
  /** 장면·로더를 해제한다. 앱 파괴보다 먼저 부른다. */
  readonly release: () => void;
  /** 취소되지 않은 미리보기의 준비 실패를 알린다. */
  readonly onError: (error: unknown) => void;
}

/**
 * Lab Pixi 미리보기 하나를 시작하고 취소 함수를 돌려준다(React effect cleanup에서 부른다).
 * StrictMode 이중 mount·해상도 변경으로 취소된 init이 새 미리보기보다 늦게 끝나도 그 앱만 한 번 파괴한다.
 */
export function startPixiPreview(steps: PixiPreviewSteps): () => void {
  let cancelled = false;
  let initialized = false;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    steps.release();
  };
  let appDestroyed = false;
  const destroyApp = () => {
    if (!initialized || appDestroyed) return;
    appDestroyed = true;
    // GameRenderer와 같은 정책: true는 Pixi 전역 풀까지 비워, 취소된 init이 늦게 끝날 때
    // 이미 그리고 있는 새 미리보기 앱의 batch를 깨뜨린다. 이 앱만 정리하고 공유 텍스처는 loader가 해제한다.
    steps.app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: false });
  };
  const run = async () => {
    await steps.beforeInit();
    if (cancelled) return;
    await steps.init();
    initialized = true;
    if (cancelled) { destroyApp(); return; }
    await steps.load();
    if (cancelled) return;
    steps.mount();
  };
  void run().catch((error: unknown) => {
    if (!cancelled) steps.onError(error);
    release();
  });
  return () => {
    cancelled = true;
    release();
    destroyApp();
  };
}

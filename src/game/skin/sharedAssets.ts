import { Assets, type TextureSourceOptions } from "pixi.js";

/**
 * 경로별 참조 세기로 Pixi Assets 전역 캐시를 나눠 쓴다. Pixi Assets는 경로마다 한 번 읽은 에셋을 전역에 캐시하므로
 * 여러 렌더러(튜토리얼 캐러셀 두 슬롯, 게임 렌더러와 Lab 비교 화면이 함께 쓰는 기어 움직임)가 같은 텍스처를 공유한다.
 * 소유자는 읽기 전에 retain하고 다 쓰면 release한다. 마지막 소유자가 놓으면 unload하고, 같은 경로의 load·unload는 차례로 실행한다.
 * SkinManager(스킨 에셋)와 classicGearMotionAssets(기어 움직임 자료)가 쓴다.
 */
const references = new Map<string, number>();
const operations = new Map<string, Promise<void>>();

export function retainSharedAsset(path: string): void {
  references.set(path, (references.get(path) ?? 0) + 1);
}

export function releaseSharedAsset(path: string): void {
  const nextCount = (references.get(path) ?? 0) - 1;
  if (nextCount > 0) {
    references.set(path, nextCount);
    return;
  }

  references.delete(path);
  const previous = operations.get(path) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    // A new owner may have appeared while the previous unload was queued.
    if ((references.get(path) ?? 0) > 0) return;
    await Assets.unload(path);
  });
  operations.set(path, operation.then(() => undefined, () => undefined));
}

/** retain한 경로를 읽는다. 텍스처 설정이 있는 에셋은 경로를 별칭으로 등록해 unload(path)가 같은 캐시 항목을 찾게 한다. */
export function loadSharedAsset<T>(path: string, data?: Partial<TextureSourceOptions>): Promise<T> {
  const previous = operations.get(path) ?? Promise.resolve();
  const operation = previous.catch(() => undefined)
    .then(() => Assets.load<T>(data ? { alias: path, src: path, data } : path));
  operations.set(path, operation.then(() => undefined, () => undefined));
  return operation;
}

/** @internal 테스트용: 경로의 현재 소유자 수. */
export function sharedAssetReferenceCount(path: string): number {
  return references.get(path) ?? 0;
}

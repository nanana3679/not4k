import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assetsLoad, assetsUnload } = vi.hoisted(() => ({
  assetsLoad: vi.fn(async (request: string | { src: string }) => ({ path: typeof request === 'string' ? request : request.src })),
  assetsUnload: vi.fn(async (_path: string) => undefined),
}));

vi.mock('pixi.js', () => ({ Assets: { load: assetsLoad, unload: assetsUnload } }));

import { loadSharedAsset, releaseSharedAsset, retainSharedAsset, sharedAssetReferenceCount } from './sharedAssets';

describe('공유 에셋 참조 세기(sharedAssets)', () => {
  beforeEach(() => {
    assetsLoad.mockClear();
    assetsUnload.mockClear();
  });

  it('같은 경로 /a.png를 두 소유자가 retain하면 참조 2, 하나가 release해도 unload하지 않고 마지막 release에서 Assets.unload를 1번 부른다', async () => {
    retainSharedAsset('/a.png');
    retainSharedAsset('/a.png');
    await loadSharedAsset('/a.png');
    expect(sharedAssetReferenceCount('/a.png')).toBe(2);
    releaseSharedAsset('/a.png');
    expect(sharedAssetReferenceCount('/a.png')).toBe(1);
    releaseSharedAsset('/a.png');
    expect(sharedAssetReferenceCount('/a.png')).toBe(0);
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalledTimes(1));
    expect(assetsUnload).toHaveBeenCalledWith('/a.png');
  });

  it('텍스처 설정을 넘기면 경로를 별칭으로 등록해 { alias, src, data }로 읽고, 설정이 없으면 경로 문자열 그대로 읽는다', async () => {
    retainSharedAsset('/b.png');
    retainSharedAsset('/b.json');
    await loadSharedAsset('/b.png', { autoGenerateMipmaps: true, scaleMode: 'linear' });
    await loadSharedAsset('/b.json');
    expect(assetsLoad.mock.calls.map(([request]) => request)).toEqual([
      { alias: '/b.png', src: '/b.png', data: { autoGenerateMipmaps: true, scaleMode: 'linear' } },
      '/b.json',
    ]);
    releaseSharedAsset('/b.png');
    releaseSharedAsset('/b.json');
  });

  it('마지막 release 뒤 unload가 끝나기 전에 새 소유자가 retain하면 unload를 건너뛰고 새 load는 그 뒤에 실행된다', async () => {
    let finishLoad: (() => void) | null = null;
    assetsLoad.mockImplementationOnce(() => new Promise((resolve) => { finishLoad = () => resolve({ path: '/c.png' }); }));
    retainSharedAsset('/c.png');
    const first = loadSharedAsset('/c.png');
    releaseSharedAsset('/c.png');
    retainSharedAsset('/c.png');
    const second = loadSharedAsset('/c.png');
    await vi.waitFor(() => expect(finishLoad).not.toBeNull());
    finishLoad!();
    await Promise.all([first, second]);
    // 첫 load가 끝난 뒤 줄 선 unload는 새 소유자(참조 1)를 보고 건너뛴다.
    await Promise.resolve();
    expect(assetsUnload).not.toHaveBeenCalled();
    expect(sharedAssetReferenceCount('/c.png')).toBe(1);
    releaseSharedAsset('/c.png');
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalledWith('/c.png'));
  });
});

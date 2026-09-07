import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assetsLoad, assetsUnload } = vi.hoisted(() => ({
  assetsLoad: vi.fn(async (path: string) => ({
    path,
    frame: { x: 0, y: 0, width: 16, height: 16 },
    source: {},
  })),
  assetsUnload: vi.fn(async (_path: string) => undefined),
}));

vi.mock('pixi.js', () => ({
  Assets: { load: assetsLoad, unload: assetsUnload },
  Rectangle: class Rectangle {},
  Texture: class Texture {},
}));

import { SkinManager } from './SkinManager';

describe('SkinManager', () => {
  beforeEach(() => {
    assetsLoad.mockClear();
    assetsUnload.mockClear();
  });

  it('두 매니저가 crystal을 공유하면 먼저 dispose한 슬롯은 전역 texture를 unload하지 않음', async () => {
    const first = new SkinManager();
    const second = new SkinManager();

    await first.loadSkin('crystal');
    await second.loadSkin('crystal');
    first.dispose();

    expect(assetsUnload).not.toHaveBeenCalled();

    second.dispose();
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalled());
    expect(new Set(assetsUnload.mock.calls.map(([path]) => path)).size).toBe(
      assetsUnload.mock.calls.length,
    );
  });

  it('이전 unload가 끝나기 전 새 슬롯이 열리면 새 load는 unload 뒤에 실행', async () => {
    const first = new SkinManager();
    await first.loadSkin('crystal');

    let releaseUnload!: () => void;
    const unloadFinished = new Promise<void>(resolve => { releaseUnload = resolve; });
    assetsUnload.mockImplementationOnce(async () => {
      await unloadFinished;
      return undefined;
    });
    first.dispose();
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalled());

    const loadCountBeforeSecond = assetsLoad.mock.calls.length;
    const second = new SkinManager();
    const secondLoad = second.loadSkin('crystal');
    await Promise.resolve();
    expect(assetsLoad.mock.calls.length).toBe(loadCountBeforeSecond);

    releaseUnload();
    await secondLoad;
    expect(assetsLoad.mock.calls.length).toBeGreaterThan(loadCountBeforeSecond);
    second.dispose();
  });

  it('이전 generation load 실패가 새 generation 소유권을 해제하지 않음', async () => {
    const manager = new SkinManager();
    let rejectFirstLoad!: (error: Error) => void;
    const firstLoad = new Promise<never>((_, reject) => { rejectFirstLoad = reject; });
    assetsLoad.mockImplementationOnce(() => firstLoad);

    const stale = manager.loadSkin('crystal');
    const current = manager.loadSkin('crystal');
    rejectFirstLoad(new Error('stale load failed'));
    await expect(stale).rejects.toThrow('stale load failed');
    await current;

    assetsUnload.mockClear();
    manager.dispose();
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalled());
  });
});

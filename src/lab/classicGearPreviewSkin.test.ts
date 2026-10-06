import { describe, expect, it, vi } from 'vitest';
import { createSharedSkin } from './classicGearPreviewSkin';

const fakeSkin = () => ({ dispose: vi.fn() });

describe('createSharedSkin', () => {
  it('렌더러 두 개가 차례로 빌렸다 놓아도(렌더러 다시 만들기) 스킨은 한 번만 읽고 같은 인스턴스를 준다', async () => {
    const skin = fakeSkin();
    const load = vi.fn(async () => skin);
    const shared = createSharedSkin(load);

    const first = await shared.acquire();
    shared.release();
    const second = await shared.acquire();

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(skin.dispose).not.toHaveBeenCalled();
  });

  it('페이지를 닫아도 빌린 렌더러가 놓아줄 때까지 dispose를 미루고, 놓으면 한 번만 dispose한다', async () => {
    const skin = fakeSkin();
    const shared = createSharedSkin(async () => skin);
    await shared.acquire();

    shared.close();
    expect(skin.dispose).not.toHaveBeenCalled();
    shared.release();
    await Promise.resolve();
    expect(skin.dispose).toHaveBeenCalledTimes(1);
    shared.release();
    await Promise.resolve();
    expect(skin.dispose).toHaveBeenCalledTimes(1);
  });

  it('읽는 도중 페이지를 닫고 빌린 렌더러도 없으면 읽기가 끝난 뒤 dispose한다', async () => {
    const skin = fakeSkin();
    let finish!: () => void;
    const shared = createSharedSkin(() => new Promise<typeof skin>((resolve) => { finish = () => resolve(skin); }));
    const pending = shared.acquire();
    shared.release();
    shared.close();
    finish();
    await pending;
    await Promise.resolve();
    expect(skin.dispose).toHaveBeenCalledTimes(1);
  });

  it('읽기에 실패하면 다음 acquire에서 다시 읽는다', async () => {
    const skin = fakeSkin();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(skin);
    const shared = createSharedSkin(load);

    await expect(shared.acquire()).rejects.toThrow('network');
    shared.release();
    await expect(shared.acquire()).resolves.toBe(skin);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

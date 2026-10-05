import { beforeEach, describe, expect, it, vi } from 'vitest';
import motionJsonText from '../../../public/gear/classic-frame-motion/frame-motion.json?raw';

const { assetsLoad, assetsUnload, gate } = vi.hoisted(() => ({
  gate: { json: null as Promise<void> | null },
  assetsLoad: vi.fn(),
  assetsUnload: vi.fn(async (_path: string) => undefined),
}));

vi.mock('pixi.js', () => ({ Assets: { load: assetsLoad, unload: assetsUnload } }));

import { acquireFrameMotionAssets } from './classicFrameMotionAssets';
import { FRAME_MOTION_TEXTURE_KEYS } from './classicFrameMotionData';
import { sharedAssetReferenceCount } from '../skin/sharedAssets';

const requestPath = (request: unknown) => (typeof request === 'string' ? request : (request as { src: string }).src);
const loadedPaths = () => assetsLoad.mock.calls.map(([request]) => requestPath(request));

describe('acquireFrameMotionAssets — 프레임 움직임 자료 공유 로더', () => {
  beforeEach(() => {
    gate.json = null;
    assetsUnload.mockClear();
    assetsLoad.mockReset();
    assetsLoad.mockImplementation(async (request: unknown) => {
      const path = requestPath(request);
      if (path.endsWith('.json')) {
        if (gate.json) await gate.json;
        return JSON.parse(motionJsonText);
      }
      return { path, source: { path } };
    });
  });

  it('임대하면 frame-motion.json을 먼저 읽고 텍스처 9장을 프레임과 같은 밉맵·삼선형 설정으로 경로 별칭 로드해 키별 텍스처를 준다', async () => {
    const lease = acquireFrameMotionAssets((path) => path);
    const resources = await lease.ready;
    expect(loadedPaths()[0]).toBe('/gear/classic-frame-motion/frame-motion.json');
    expect(assetsLoad.mock.calls[0][0]).toBe('/gear/classic-frame-motion/frame-motion.json');
    const textureRequests = assetsLoad.mock.calls.slice(1).map(([request]) => request);
    expect(textureRequests).toHaveLength(9);
    for (const request of textureRequests) {
      expect(request).toMatchObject({ data: { autoGenerateMipmaps: true, scaleMode: 'linear' } });
      expect((request as { alias: string }).alias).toBe((request as { src: string }).src);
    }
    expect(resources.data.frame).toEqual({ width: 1024, height: 1536 });
    expect(Object.keys(resources.textures)).toEqual([...FRAME_MOTION_TEXTURE_KEYS]);
    expect((resources.textures.armorLit as unknown as { path: string }).path).toBe('/gear/classic-frame-motion/armor-lit.png');
    lease.release();
  });

  it('배포 base가 /not4k/면 /not4k/gear/classic-frame-motion/ 아래를 읽는다', async () => {
    const lease = acquireFrameMotionAssets((path) => `/not4k${path}`);
    await lease.ready;
    expect(loadedPaths().every((path) => path.startsWith('/not4k/gear/classic-frame-motion/'))).toBe(true);
    lease.release();
  });

  it('두 임대가 함께 쓰면 먼저 놓아도 unload하지 않고, 마지막 임대를 놓을 때 JSON과 PNG 9장(10개)을 unload한다', async () => {
    const first = acquireFrameMotionAssets((path) => path);
    const second = acquireFrameMotionAssets((path) => path);
    await Promise.all([first.ready, second.ready]);
    expect(sharedAssetReferenceCount('/gear/classic-frame-motion/armor-lit.png')).toBe(2);
    first.release();
    await Promise.resolve();
    expect(assetsUnload).not.toHaveBeenCalled();
    second.release();
    await vi.waitFor(() => expect(assetsUnload).toHaveBeenCalledTimes(10));
    expect(assetsUnload).toHaveBeenCalledWith('/gear/classic-frame-motion/frame-motion.json');
    expect(sharedAssetReferenceCount('/gear/classic-frame-motion/armor-lit.png')).toBe(0);
  });

  it('JSON을 읽는 동안 놓으면 PNG를 하나도 읽지 않고 ready는 거절되며, release를 두 번 불러도 JSON 참조는 한 번만 놓는다', async () => {
    let open!: () => void;
    gate.json = new Promise<void>((resolve) => { open = resolve; });
    const lease = acquireFrameMotionAssets((path) => path);
    lease.release();
    lease.release();
    expect(sharedAssetReferenceCount('/gear/classic-frame-motion/frame-motion.json')).toBe(0);
    open();
    await expect(lease.ready).rejects.toThrow('released');
    expect(loadedPaths().filter((path) => path.endsWith('.png'))).toEqual([]);
  });

  it('JSON이 계약과 다르면(텍스처 상자 armorLit 없음) ready가 그 키 이름을 담아 거절되고 PNG를 읽지 않는다', async () => {
    assetsLoad.mockImplementation(async (request: unknown) => {
      const value = JSON.parse(motionJsonText);
      delete value.textures.armorLit;
      return requestPath(request).endsWith('.json') ? value : {};
    });
    const lease = acquireFrameMotionAssets((path) => path);
    await expect(lease.ready).rejects.toThrow('armorLit');
    expect(loadedPaths().filter((path) => path.endsWith('.png'))).toEqual([]);
    lease.release();
  });
});

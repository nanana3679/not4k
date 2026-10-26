import { describe, expect, it, vi } from 'vitest';
import { AbstractRenderer, Texture, TexturePool, type Application } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { GAME_HEIGHT } from './constants';
import type { SkinManager } from '../skin';

describe('GameRenderer 리소스 수명', () => {
  it('초기화 실패로 dispose(false)를 호출하면 GPU를 해제하되 React가 제거할 캔버스는 남긴다', () => {
    const destroyApplication = vi.fn();
    const disposeBackground = vi.fn();
    const state = {
      initialized: true,
      autoGarbageCollectBeforePlayback: new Map(),
      flightBackground: { dispose: disposeBackground },
      noteRenderer: { dispose: vi.fn() },
      app: { destroy: destroyApplication },
    };
    Reflect.apply(GameRenderer.prototype.dispose, state, [false]);
    expect(disposeBackground).toHaveBeenCalledOnce();
    expect(destroyApplication).toHaveBeenCalledWith(
      { removeView: false, releaseGlobalResources: false }, { children: true, texture: false },
    );
    expect(state.initialized).toBe(false);
  });

  it('프리뷰 하나를 닫아도 다른 슬롯이 TexturePool.getOptimalTexture로 받은 32×16 텍스처를 returnTexture로 반환하면 같은 요청에 그 텍스처를 다시 받는다', () => {
    const borrowedTexture = TexturePool.getOptimalTexture({ width: 32, height: 16, resolution: 1, antialias: false });
    const pixiRenderer = {
      runners: { destroy: { items: [], emit: vi.fn(), destroy: vi.fn() } },
      // pixi.js 8.17+ AbstractRenderer.destroy()가 마지막에 removeAllListeners()를 부른다.
      removeAllListeners: vi.fn(),
    };
    const destroyApplication = vi.fn((...args: Parameters<Application['destroy']>) => {
      // Use Pixi's real destruction policy, without requiring a GPU in Vitest.
      Reflect.apply(AbstractRenderer.prototype.destroy, pixiRenderer, [args[0]]);
    });
    const state = {
      initialized: true,
      autoGarbageCollectBeforePlayback: new Map(),
      noteRenderer: { dispose: vi.fn() },
      app: { destroy: destroyApplication },
    };

    Reflect.apply(GameRenderer.prototype.dispose, state, []);
    expect(() => TexturePool.returnTexture(borrowedTexture)).not.toThrow();
    const reusedTexture = TexturePool.getOptimalTexture({ width: 32, height: 16, resolution: 1, antialias: false });
    expect(reusedTexture).toBe(borrowedTexture);
    expect(destroyApplication).toHaveBeenCalledTimes(1);
    Reflect.apply(GameRenderer.prototype.dispose, state, []);
    expect(destroyApplication).toHaveBeenCalledTimes(1);
    TexturePool.returnTexture(reusedTexture);
    TexturePool.clear();
  });

  it('app.init 뒤 장면 구성의 키 빔 단계가 실패하면 init은 그 오류로 실패하고 캔버스는 남긴 채 Pixi 앱을 1회 파괴하며 뒤늦은 dispose는 다시 파괴하지 않는다', async () => {
    const skinManager = {
      getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
      getBodyWidthScale: () => 1,
      hasTexture: () => false,
      getLoadedTextures: () => new Map<string, Texture>(),
      getTexture: () => { throw new Error('텍스처 없음'); },
    } as unknown as SkinManager;
    const renderer = new GameRenderer({ canvas: {} as HTMLCanvasElement, width: 1067, height: GAME_HEIGHT, skinManager,
      showFlightBackground: false, gearMotion: false });
    const app = Reflect.get(renderer, 'app') as Application;
    vi.spyOn(app, 'init').mockResolvedValue(undefined);
    const destroy = vi.spyOn(app, 'destroy').mockImplementation(() => {});
    vi.spyOn(renderer as unknown as { buildKeyBeams(): void }, 'buildKeyBeams').mockImplementation(() => { throw new Error('해제된 스킨'); });
    await expect(renderer.init()).rejects.toThrow('해제된 스킨');
    expect(destroy).toHaveBeenCalledExactlyOnceWith({ removeView: false, releaseGlobalResources: false }, { children: true, texture: false });
    renderer.dispose(false);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('dispose 후 늦게 도착한 프레임은 파괴된 판정 UI와 Graphics에 접근하지 않는다', () => {
    const state = { initialized: false };
    expect(() => Reflect.apply(GameRenderer.prototype.renderFrame, state, [1000, 16])).not.toThrow();
  });
});

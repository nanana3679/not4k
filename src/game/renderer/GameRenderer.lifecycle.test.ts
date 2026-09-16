import { describe, expect, it, vi } from 'vitest';
import { AbstractRenderer, TexturePool, type Application } from 'pixi.js';
import { GameRenderer } from './GameRenderer';

describe('GameRenderer 리소스 수명', () => {
  it('프리뷰 하나를 닫아도 다른 슬롯이 빌린 Pixi 텍스처를 정상 반환할 수 있다', () => {
    const borrowedTexture = TexturePool.getOptimalTexture(32, 16, 1, false);
    const pixiRenderer = {
      runners: { destroy: { items: [], emit: vi.fn(), destroy: vi.fn() } },
    };
    const destroyApplication = vi.fn((...args: Parameters<Application['destroy']>) => {
      // Use Pixi's real destruction policy, without requiring a GPU in Vitest.
      Reflect.apply(AbstractRenderer.prototype.destroy, pixiRenderer, [args[0]]);
    });
    const state = {
      initialized: true,
      noteRenderer: { dispose: vi.fn() },
      app: { destroy: destroyApplication },
      gearGauges: [],
    };

    Reflect.apply(GameRenderer.prototype.dispose, state, []);
    expect(() => TexturePool.returnTexture(borrowedTexture)).not.toThrow();
    const reusedTexture = TexturePool.getOptimalTexture(32, 16, 1, false);
    expect(reusedTexture).toBe(borrowedTexture);
    expect(destroyApplication).toHaveBeenCalledTimes(1);
    Reflect.apply(GameRenderer.prototype.dispose, state, []);
    expect(destroyApplication).toHaveBeenCalledTimes(1);
    TexturePool.returnTexture(reusedTexture);
    TexturePool.clear();
  });

  it('dispose 후 늦게 도착한 프레임은 파괴된 판정 UI와 Graphics에 접근하지 않는다', () => {
    const state = { initialized: false };
    expect(() => Reflect.apply(GameRenderer.prototype.renderFrame, state, [1000, 16])).not.toThrow();
  });
});

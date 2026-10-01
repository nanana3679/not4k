import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// PIXI GC 후 teardown 크래시 회귀 테스트.
// pixi.js 8.16.0의 GCSystem은 오래 안 쓴 텍스처를 내릴 때 hash 항목을 먼저 비우고 unload()를 불러,
// GlTextureSystem이 그 source의 styleChange 리스너를 떼지 못했다. 그 뒤 app.destroy()로 렌더러가
// 사라지고 나서 텍스처를 파괴하면 남은 리스너가 getGlSource()에서 "Cannot read properties of null
// (reading 'gc')"로 크래시했다. 앱에서는 아래 경로가 app.destroy 뒤에 텍스처를 파괴한다.
// - TimelineRenderer.dispose()의 bodyGradientCache, GameRenderer.dispose()의 keyBeamGradient (동기)
// - SkinManager.dispose()의 Assets.unload (비동기, 스킨 PNG = ImageSource)
// 8.19.0에서 upstream이 unload()를 먼저 부르도록 고쳤다(pixijs/pixijs#12038). 설치된 pixi.js 번들로
// 이 계약을 고정한다. 실제 WebGL이 필요해 vitest로는 재현할 수 없다.

const PIXI_BUNDLE = fileURLToPath(new URL('../../node_modules/pixi.js/dist/pixi.min.js', import.meta.url));

type TextureKind = 'fillGradient' | 'imageSource';

interface TeardownResult {
  unloadedByGc: boolean;
  error: string | null;
}

async function runGcThenDestroyAfterApp(page: Page, kind: TextureKind): Promise<TeardownResult> {
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ path: PIXI_BUNDLE });
  return page.evaluate(async (textureKind) => {
    // pixi.min.js는 타입 없이 window.PIXI 전역으로 붙는다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PIXI = (window as any).PIXI;
    const app = new PIXI.Application();
    // gcMaxUnusedTime 0: 다음 GC 패스에서 GC 대상 텍스처를 모두 내린다(실제 기본값은 60초 미사용).
    await app.init({ width: 64, height: 64, preference: 'webgl', gcMaxUnusedTime: 0 });
    document.body.appendChild(app.canvas);

    const createTexture = () => {
      if (textureKind === 'fillGradient') {
        const gradient = new PIXI.FillGradient({
          type: 'linear',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 1 },
          colorStops: [{ offset: 0, color: 0xffffff }, { offset: 1, color: 0x000000 }],
        });
        app.stage.addChild(new PIXI.Graphics().rect(0, 0, 10, 10).fill(gradient));
        return { texture: gradient.texture, destroyTexture: () => gradient.destroy() };
      }
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const texture = new PIXI.Texture({ source: new PIXI.ImageSource({ resource: canvas }) });
      app.stage.addChild(new PIXI.Sprite(texture));
      // Assets.unload가 하는 것과 같은 파괴
      return { texture, destroyTexture: () => texture.destroy(true) };
    };
    const { texture, destroyTexture } = createTexture();

    app.render();
    let unloadedByGc = false;
    texture.source.on('unload', () => { unloadedByGc = true; });
    app.renderer.gc.run();

    // 앱의 dispose 순서: 렌더러를 먼저 파괴하고 텍스처를 나중에 파괴한다.
    app.destroy(true, { children: true, texture: false });
    try {
      destroyTexture();
      return { unloadedByGc, error: null };
    } catch (e) {
      return { unloadedByGc, error: e instanceof Error ? e.message : String(e) };
    }
  }, kind);
}

test('GC가 내린 FillGradient 텍스처를 app.destroy 뒤에 destroy()해도 예외 없음', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const result = await runGcThenDestroyAfterApp(page, 'fillGradient');

  expect(result.unloadedByGc).toBe(true);
  expect(result.error).toBeNull();
  expect(pageErrors).toEqual([]);
});

test('GC가 내린 ImageSource 스킨 텍스처를 app.destroy 뒤에 destroy(true)해도 예외 없음', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const result = await runGcThenDestroyAfterApp(page, 'imageSource');

  expect(result.unloadedByGc).toBe(true);
  expect(result.error).toBeNull();
  expect(pageErrors).toEqual([]);
});

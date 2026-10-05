import { expect, test } from "@playwright/test";

test.describe("Note Assets Lab", () => {
  for (const width of [1280, 390]) {
    test(`${width}px 일시정지하면 재생기 화면이 멈추고 재생하면 이어지며 처음부터 재생은 일시정지를 해제한다`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/lab/note-assets?design=classic');
      await expect(page.getByText('PLAYER READY')).toBeVisible();
      const canvas = page.locator('.asset-lab-player-canvas canvas').first();
      const pause = page.locator('[data-player-pause="true"]');
      await expect(pause).toHaveText('일시정지');
      expect((await pause.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await page.waitForTimeout(600);
      await pause.click();
      await expect(pause).toHaveAttribute('aria-pressed', 'true');
      await expect(pause).toHaveText('재생');
      await expect(page.locator('.asset-lab-player-canvas')).toHaveAttribute('data-paused', 'true');
      await page.waitForTimeout(500);
      const frozen = await canvas.screenshot();
      await page.waitForTimeout(800);
      expect((await canvas.screenshot()).equals(frozen), '일시정지 중 화면 유지').toBe(true);
      await page.screenshot({ path: testInfo.outputPath('paused.png') });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      await pause.click();
      await expect(pause).toHaveText('일시정지');
      await expect(page.locator('.asset-lab-player-canvas')).toHaveAttribute('data-paused', 'false');
      await page.waitForTimeout(800);
      expect((await canvas.screenshot()).equals(frozen), '재생하면 화면이 다시 움직임').toBe(false);

      await pause.click();
      await expect(pause).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '처음부터 재생', exact: true }).click();
      await expect(pause).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText('PLAYER READY')).toBeVisible();
    });
  }

  for (const width of [1280, 390]) {
    test(`${width}px Lab 목록에서 노트 에셋 시연실을 열면 Classic 재생기가 준비되고 목록으로 돌아올 수 있다`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/lab');
      await expect(page.getByRole('heading', { name: 'Preview Archive', exact: true })).toBeVisible();
      const entry = page.getByRole('link', { name: /^노트 에셋 시연실/ });
      await expect(entry).toBeVisible();
      expect((await entry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect(await page.locator('[data-lab-page="preview-catalog"]').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('lab-index.png') });

      await entry.click();
      await expect(page).toHaveURL(/\/lab\/note-assets$/);
      await expect(page.getByText('PLAYER READY')).toBeVisible();
      await expect(page.locator('[data-tutorial-skin-id="classic"]')).toBeVisible();
      await page.getByRole('link', { name: '← Lab 목록' }).click();
      await expect(page).toHaveURL(/\/lab$/);
      await expect(entry).toBeVisible();
    });
  }

  test('Simple 트릴 롱 끝은 에디터와 같은 회색 마름모 터미널 이미지 전체(100×20)로 그려진다', async ({ page }) => {
    await page.goto('/lab/note-assets?design=simple');
    await expect(page.getByText('PLAYER READY')).toBeVisible();
    const shape = await page.evaluate(async () => {
      const image = new Image(); image.src = '/skins/simple/terminal-trill.png'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const at = (x: number, y: number) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
      return { size: [width, height], center: at(width / 2, height / 2), corners: [at(1, 1), at(width - 2, 1), at(1, height - 2), at(width - 2, height - 2)].map(pixel => pixel[3]) };
    });
    expect(shape).toEqual({ size: [100, 20], center: [135, 135, 135, 179], corners: [0, 0, 0, 0] });
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map(entry => entry.name)
        .find(name => new URL(name).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
      const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(url);
      const render = GameRenderer.prototype.renderFrame;
      GameRenderer.prototype.renderFrame = function (...args) {
        const result = render.apply(this, args);
        const self = this as unknown as {
          skinManager: { getTexture: (key: string) => unknown };
          longNoteEndLayer: { children: Array<{ texture: { frame: { height: number } }; height: number }> };
        };
        const cap = self.skinManager.getTexture('terminalTrill');
        const drawn = self.longNoteEndLayer.children.filter(sprite => sprite.texture === cap);
        if (drawn.length > 0) (window as unknown as Record<string, unknown>).__trillCaps = drawn.map(sprite => ({ frameHeight: sprite.texture.frame.height, height: sprite.height }));
        return result;
      };
    });
    await page.getByRole('button', { name: '트릴 롱', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__trillCaps)).toBeTruthy();
    const caps = await page.evaluate(() => (window as unknown as { __trillCaps: Array<{ frameHeight: number; height: number }> }).__trillCaps);
    for (const cap of caps) expect(cap).toEqual({ frameHeight: 20, height: 20 });
  });

  test('Classic 트릴 3연결은 실제 홀드한 구간만 켜지고 포인트 마름모 위아래 테두리를 따라 옅어지는 접촉 그림자가 바디와 구분된다', async ({ page }, testInfo) => {
    await page.goto('/assets-lab/classic/trill-quartz-preview.html');
    const result = await page.evaluate(async () => {
      const rendererPath = '/src/game/renderer/GameRenderer.ts';
      const skinPath = '/src/game/skin/SkinManager.ts';
      const timingPath = '/src/shared/timing/chartTiming.ts';
      const [{ GameRenderer }, { SkinManager }, { createChartTiming }] = await Promise.all([
        import(rendererPath), import(skinPath), import(timingPath),
      ]);
      const skin = new SkinManager();
      await skin.loadSkin('classic');
      const canvas = document.createElement('canvas');
      canvas.id = 'connected-trill-runtime';
      canvas.style.cssText = 'display:block;max-width:100%;margin:20px auto';
      document.body.prepend(canvas);
      // 플레이필드 배율 0.625(RFD 0029)로 줄어든 렌더러를 해상도 1.6으로 그려, 이전 레인 100·노트 20 기준 픽셀 좌표를
      // 그대로 쓴다(논리 250×320 → 400×512px, 판정선 y 262.5 → 420px, 스크롤 250 → 400px/s).
      const renderer = new GameRenderer({
        canvas, width: 250, height: 320, resolution: 1.6, judgmentLineOffset: 57.5, skinManager: skin,
        showGearFrame: false, showFlightBackground: false, showComboAndAccuracy: false,
      });
      await renderer.init();
      renderer.scrollSpeed = 250;
      const beat = (n: number, d = 1) => ({ n, d });
      const notes = [
        { type: 'trillLong', lane: 2, beat: beat(1), endBeat: beat(3, 2) },
        { type: 'trillLong', lane: 2, beat: beat(3, 2), endBeat: beat(2) },
        { type: 'trillLong', lane: 2, beat: beat(2), endBeat: beat(5, 2) },
        { type: 'trill', lane: 2, beat: beat(1) },
        { type: 'trill', lane: 2, beat: beat(3, 2) },
        { type: 'trill', lane: 2, beat: beat(2) },
      ];
      const events = [{ type: 'bpm', beat: beat(0), bpm: 120 }];
      const timing = createChartTiming({ notes, events, trillZones: [], meta: { offsetMs: 0 } });
      renderer.setChart(notes, [], [], events, timing);
      renderer.applyNoteDisplayEffect(3, { body: null, visibility: 'processed' });
      let phase = 'idle';
      let activeSegment = 0;
      renderer.setJudgmentBodyStateQuery((index: number) => index >= 3 ? null : ({
        successorIndex: index < 2 ? index + 1 : undefined,
        units: [{
          unitIndex: 0, active: index === activeSegment && phase !== 'idle', complete: index < activeSegment,
          failed: index === activeSegment && phase === 'failed',
          registeredKeys: index === activeSegment && phase === 'held' ? ['KeyF'] : [],
        }],
      }));
      const texturesMatch = (layer: typeof renderer.longNoteBodyLayer, keys: string[]) =>
        layer.children.map((sprite: { texture: unknown }, index: number) => sprite.texture === skin.getTexture(keys[index]));
      renderer.renderFrame(650);
      const idle = texturesMatch(renderer.longNoteBodyLayer, Array(3).fill('bodyTrill'));
      phase = 'held';
      renderer.renderFrame(650);
      const held = texturesMatch(renderer.longNoteBodyLayer, ['bodyTrillHeld', 'bodyTrill', 'bodyTrill']);
      const terminals = texturesMatch(renderer.longNoteEndLayer, ['terminalTrill', 'terminalTrillIdle', 'terminalTrillIdle']);
      const screen = () => renderer.app.renderer.extract.canvas({ target: renderer.app.stage, frame: renderer.app.renderer.screen });
      const withShadow = screen();
      const shadows = renderer.noteLayer.children.filter((sprite: { texture: unknown }) => sprite.texture === skin.getTexture('pointContactShadowTrill'));
      shadows.forEach((shadow: { visible: boolean }) => { shadow.visible = false; });
      const withoutShadow = screen();
      shadows.forEach((shadow: { visible: boolean }) => { shadow.visible = true; });
      const shadeAt = (x: number, y: number) => {
        const before = withoutShadow.getContext('2d').getImageData(x, y, 1, 1).data;
        const after = withShadow.getContext('2d').getImageData(x, y, 1, 1).data;
        return (before[0] + before[1] + before[2] - after[0] - after[1] - after[2]) / 3;
      };
      // 연결점의 두 번째 포인트(y=380~400, 중심 150·390)는 네 사선 바로 바깥이 가장 짙고 5px 안에서 옅어진다.
      // x=125·175에서 아래 사선은 y=395, 위 사선은 y=385다.
      const lowerEdgeShadow = [shadeAt(125, 396), shadeAt(175, 396)];
      const upperEdgeShadow = [shadeAt(125, 384), shadeAt(175, 384)];
      // 아래 사선에서 3px 떨어진 곳은 옅지만 아직 그림자가 남는다.
      const softShadowTail = [shadeAt(125, 398), shadeAt(175, 398)];
      // 사선에서 약10px 떨어진 곳은 5px 퍼짐 밖이다.
      const oldRectangularShadow = shadeAt(105, 401);
      const samplePoint = () => {
        const image = screen();
        const context = image.getContext('2d');
        return [...context.getImageData(125, 390, 1, 1).data];
      };
      const withTerminal = samplePoint();
      renderer.longNoteEndLayer.visible = false;
      const withoutTerminal = samplePoint();
      renderer.longNoteBodyLayer.visible = false;
      const pointOnly = samplePoint();
      const barePointCanvas = screen();
      const barePointPixels = barePointCanvas.getContext('2d').getImageData(0, 0, 400, 500).data;
      const compositePixels = withShadow.getContext('2d').getImageData(0, 0, 400, 500).data;
      let changedPointPixels = 0;
      for (let y = 2; y <= 18; y++) {
        for (let x = 5; x < 95; x++) {
          // 마름모 윤곽의 안티앨리어싱을 제외하고 하단을 포함한 전체 내부를 비교한다.
          if (Math.abs(x - 50) / 5 + Math.abs(y - 10) > 8) continue;
          const i = ((380 + y) * 400 + 100 + x) * 4;
          if ([0, 1, 2].some(channel => Math.abs(barePointPixels[i + channel] - compositePixels[i + channel]) > 3)) changedPointPixels++;
        }
      }
      renderer.longNoteBodyLayer.visible = true;
      renderer.noteLayer.visible = false;
      const bodyOnly = samplePoint();
      renderer.noteLayer.visible = true;
      renderer.longNoteEndLayer.visible = true;
      renderer.noteLayer.visible = false;
      const terminalOnly = samplePoint();
      renderer.noteLayer.visible = true;
      phase = 'failed';
      renderer.renderFrame(650);
      const failed = texturesMatch(renderer.longNoteBodyLayer, ['bodyTrillFailed', 'bodyTrill', 'bodyTrill']);
      phase = 'held';
      activeSegment = 1;
      renderer.renderFrame(650);
      const secondHeld = texturesMatch(renderer.longNoteBodyLayer, ['bodyTrill', 'bodyTrillHeld', 'bodyTrill']);
      const secondTerminals = texturesMatch(renderer.longNoteEndLayer, ['terminalTrillIdle', 'terminalTrill', 'terminalTrillIdle']);
      activeSegment = 0;
      renderer.renderFrame(650);
      return { idle, held, terminals, failed, secondHeld, secondTerminals, withTerminal, withoutTerminal, pointOnly, bodyOnly, terminalOnly, lowerEdgeShadow, upperEdgeShadow, softShadowTail, oldRectangularShadow, changedPointPixels, shadowCount: shadows.length };
    });
    expect(result.idle).toEqual([true, true, true]);
    expect(result.held).toEqual([true, true, true]);
    expect(result.terminals).toEqual([true, true, true]);
    expect(result.failed).toEqual([true, true, true]);
    expect(result.secondHeld).toEqual([true, true, true]);
    expect(result.secondTerminals).toEqual([true, true, true]);
    expect(result.withTerminal).toEqual(result.withoutTerminal);
    expect(result.withTerminal).not.toEqual(result.terminalOnly);
    expect(result.withoutTerminal).toEqual(result.pointOnly);
    expect(result.withoutTerminal).not.toEqual(result.bodyOnly);
    // 첫 트릴 포인트(인덱스 3)는 처리된 것으로 숨겨 남은 두 포인트만 그림자를 깐다.
    expect(result.shadowCount).toBe(2);
    for (const shade of [...result.lowerEdgeShadow, ...result.upperEdgeShadow]) expect(shade).toBeGreaterThan(25);
    result.softShadowTail.forEach((shade, index) => {
      expect(shade).toBeGreaterThan(8);
      expect(shade).toBeLessThan(result.lowerEdgeShadow[index]);
    });
    expect(result.oldRectangularShadow).toBeLessThanOrEqual(3);
    expect(result.changedPointPixels).toBe(0);
    await page.locator('#connected-trill-runtime').screenshot({ path: testInfo.outputPath('connected-trill-runtime.png') });
  });

  test('Classic→Simple→Classic으로 바꾸면 선택한 차트는 유지하고 노트·터미널·봄을 함께 교체', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/lab/note-assets?design=classic');
    await expect(page.getByText('PLAYER READY')).toBeVisible();
    await page.getByRole('button',{name:'독립 롱',exact:true}).click();
    await page.getByRole('button',{name:'Simple',exact:true}).click();
    await expect(page).toHaveURL(/design=simple/);
    await expect(page.locator('[data-tutorial-skin-id="simple"]')).toBeVisible();
    await expect(page.getByText('PLAYER READY')).toBeVisible();
    await expect(page.locator('.asset-lab-player-canvas')).toHaveAttribute('data-active-preview','headless-long-note');
    await expect(page.locator('[data-point-rack-item] img').first()).toHaveAttribute('src','/skins/simple/note-single.png');
    await expect(page.locator('.asset-lab-bomb-rack > button')).toHaveCount(1);
    await expect(page.locator('.asset-lab-bomb-rack img').first()).toHaveAttribute('src','/skins/simple/bomb-00.png');
    await page.getByRole('button',{name:'Classic',exact:true}).click();
    await expect(page.getByText('PLAYER READY')).toBeVisible();
    await expect(page.locator('[data-tutorial-skin-id="classic"]')).toBeVisible();
    await expect(page.locator('.asset-lab-bomb-rack > button')).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test('Classic 시안은 공통 봄16프레임을 포함하고 첫·끝 프레임은 투명하며 중간에 발광', async ({page}) => {
    await page.goto('/lab/note-assets');
    const frames = await page.evaluate(async () => Promise.all([0,3,15].map(async frame => {
      const image = new Image();
      image.src = `/skins/classic/bomb-${String(frame).padStart(2,'0')}.png`;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image,0,0);
      const pixels = context.getImageData(0,0,canvas.width,canvas.height).data;
      let alpha = 0; for(let i=3;i<pixels.length;i+=4) alpha += pixels[i];
      return {width:image.width,height:image.height,alpha};
    })));
    expect(frames.map(({width,height}) => ({width,height}))).toEqual(Array(3).fill({width:120,height:120}));
    expect(frames[0].alpha).toBe(0);
    expect(frames[1].alpha).toBeGreaterThan(10000);
    expect(frames[2].alpha).toBe(0);
  });

  test("튜토리얼 재생기가 Classic 시안을 로드하고 에셋 랙 전체를 표시", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const skinResponse = page.waitForResponse((response) => response.url().endsWith("/skins/classic/note-single.png"));

    await page.goto("/lab/note-assets");

    expect((await skinResponse).status()).toBe(200);
    await expect(page.locator('[data-tutorial-skin-id="classic"]')).toBeVisible();
    await expect(page.locator('[data-tutorial-preview-canvas="true"]')).toBeVisible();
    await expect(page.getByText("PLAYER READY")).toBeVisible();
    await expect(page.locator("[data-point-rack-item]")).toHaveCount(3);
    await expect(page.locator("[data-body-rack-item]")).toHaveCount(10);
    await expect(page.locator("[data-terminal-rack-item]")).toHaveCount(11);
    await expect(page.locator(".asset-lab-bomb-rack > button")).toHaveCount(6);
    const runtimeTextures = await page.evaluate(async () => Promise.all([
      "/skins/classic/note-single.png",
      "/skins/classic/body-double.png",
      "/skins/classic/body-double-held.png",
      "/skins/classic/terminal-single.png",
      "/skins/classic/terminal-single-idle.png",
      "/skins/classic/terminal-single-failed.png",
      "/skins/classic/terminal-double.png",
      "/skins/classic/terminal-double-idle.png",
      "/skins/classic/terminal-double-failed.png",
    ].map((src) => new Promise<{ width: number; height: number; centerLuma: number; averageChroma: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context?.drawImage(image, 0, 0);
        const [red = 0, green = 0, blue = 0] = context?.getImageData(
          Math.floor(image.naturalWidth / 2),
          Math.floor(image.naturalHeight / 2),
          1,
          1,
        ).data ?? [];
        const pixels = context?.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data ?? [];
        let chroma = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          chroma += Math.max(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0)
            - Math.min(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0);
        }
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          centerLuma: Math.round((red + green + blue) / 3),
          averageChroma: chroma / Math.max(1, image.naturalWidth * image.naturalHeight),
        });
      };
      image.onerror = () => reject(new Error(`에셋 로드 실패: ${src}`));
      image.src = src;
    }))));
    expect(runtimeTextures.map(({ width, height }) => ({ width, height }))).toEqual([
      { width: 212, height: 40 },
      { width: 200, height: 40 },
      { width: 200, height: 40 },
      { width: 200, height: 40 },
      { width: 200, height: 40 },
      { width: 200, height: 40 },
      { width: 200, height: 40 },
      { width: 200, height: 40 },
      { width: 200, height: 40 },
    ]);
    expect(runtimeTextures[2].centerLuma).toBeGreaterThan(runtimeTextures[1].centerLuma + 15);
    expect(runtimeTextures[3].averageChroma).toBeGreaterThan(30);
    expect(runtimeTextures[3].centerLuma).toBeGreaterThan(runtimeTextures[4].centerLuma + 25);
    expect(runtimeTextures[5].averageChroma).toBeLessThan(1);
    expect(runtimeTextures[6].averageChroma).toBeGreaterThan(30);
    expect(runtimeTextures[6].centerLuma).toBeGreaterThan(runtimeTextures[7].centerLuma + 15);
    expect(runtimeTextures[8].averageChroma).toBeLessThan(1);
    for (const asset of [
      "terminal-single-idle.svg",
      "terminal-single-failed.svg",
      "terminal-double-idle.svg",
      "terminal-double-failed.svg",
    ]) {
      expect((await page.request.get(`/lab/note-assets/classic/${asset}`)).status(), asset).toBe(200);
    }
    expect(errors).toEqual([]);
  });

  test("싱글·더블·길이 0·Grace 버튼은 실제 튜토리얼 차트를 교체", async ({ page }) => {
    await page.goto("/lab/note-assets");

    const stage = page.locator(".asset-lab-player-canvas");
    await page.getByRole("button", { name: "더블", exact: true }).click();
    await expect(stage).toHaveAttribute("data-active-preview", "double-note");
    await page.getByRole("button", { name: "길이 0", exact: true }).click();
    await expect(stage).toHaveAttribute("data-active-preview", "zero-length-long-note");
    await page.getByRole("button", { name: "Grace 롱", exact: true }).click();
    await expect(stage).toHaveAttribute("data-active-preview", "hold-only-long-note");
    await page.getByRole("button", { name: "중간 해제", exact: true }).click();
    await expect(stage).toHaveAttribute("data-active-preview", "early-release-long-note");
    await expect(page.getByText("PLAYER READY")).toBeVisible();
  });

  test('트릴과 트릴 롱을 선택하면 석영 포인트·대기·실패 바디, 반투명 기둥 켜짐 바디, 에디터 회색 마름모 끝 터미널 200×40 텍스처와 마름모 테두리 접촉 그림자로 재생하며 원본 SVG와 색·형태가 같음', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const requests = new Set<string>();
    page.on('response', response => {
      if (response.ok() && response.url().includes('/skins/classic/') && response.url().includes('trill')) {
        requests.add(new URL(response.url()).pathname.split('/').at(-1)!);
      }
    });
    await page.goto('/lab/note-assets?design=classic');
    await expect(page.getByText('PLAYER READY')).toBeVisible();
    expect([...requests].sort()).toEqual([
      'body-trill-failed.png','body-trill-held.png','body-trill.png','note-trill-failed.png',
      'note-trill.png','point-contact-shadow-trill.png','terminal-trill-failed.png','terminal-trill-idle.png','terminal-trill.png',
    ]);
    await expect(page.locator('[data-point-rack-item="trill"] img')).toHaveAttribute('src','/lab/note-assets/classic/note-trill.svg');
    await expect(page.locator('[data-body-rack-item="trill"]')).toHaveCount(3);
    await expect(page.locator('[data-terminal-rack-item="trill"]')).toHaveCount(3);
    const comparisons = await page.evaluate(async () => {
      const draw = async (src: string) => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 40;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image,0,0,200,40);
        return {width:image.naturalWidth,height:image.naturalHeight,pixels:ctx.getImageData(0,0,200,40).data};
      };
      return Promise.all([
        ['note-trill','point-trill'],['body-trill','body-trill'],['body-trill-held','body-trill-on-frosted'],['body-trill-failed','body-trill-failed'],
        ['terminal-trill','terminal-end-trill-editor'],['terminal-trill-idle','terminal-end-trill-editor'],['terminal-trill-failed','terminal-end-trill-editor'],
      ].map(async ([runtime,source]) => {
        const png = await draw(`/skins/classic/${runtime}.png`);
        const svg = await draw(`/assets-lab/classic/sources/${source}.svg`);
        let maxDifference=0;
        for(let i=0;i<png.pixels.length;i++) maxDifference=Math.max(maxDifference,Math.abs(png.pixels[i]-svg.pixels[i]));
        return {width:png.width,height:png.height,maxDifference};
      }));
    });
    for (const result of comparisons) {
      expect(result.width).toBe(200);
      expect(result.height).toBe(40);
      expect(result.maxDifference).toBeLessThanOrEqual(3);
    }
    for (const [label,id] of [['트릴','trill-note'],['트릴 롱','connected-trill-long']]) {
      await page.getByRole('button',{name:label,exact:true}).click();
      await expect(page.locator('.asset-lab-player-canvas')).toHaveAttribute('data-active-preview',id);
      await expect(page.getByText('PLAYER READY')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("선택한 CSS 키봄은 튜토리얼 판정 콜백의 실제 레인 위치에서 재생", async ({ page }) => {
    await page.goto("/lab/note-assets");

    await page.getByRole("button", { name: /대각 섬광/ }).first().click();
    // 키봄은 판정마다 약 0.3초만 붙었다 사라진다(0.5초 간격). 간격 폴링은 빈틈과 위상이 맞으면 계속 놓치므로
    // 첫 키봄이 붙는 순간을 페이지 안에서 잡아 그 시점의 속성과 위치를 잰다.
    const firstBomb = page.evaluate(() => new Promise<{
      style: string | null;
      lane: string | null;
      centerDx: number | null;
      centerDy: number | null;
    } | null>((resolve) => {
      const timeoutId = window.setTimeout(() => { observer.disconnect(); resolve(null); }, 5000);
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (!(node instanceof HTMLElement) || !node.classList.contains("asset-lab-live-bomb")) continue;
            observer.disconnect();
            window.clearTimeout(timeoutId);
            const canvas = document.querySelector('[data-tutorial-preview-canvas="true"]')!.getBoundingClientRect();
            const effectElement = node.querySelector(".asset-lab-keybomb");
            const effect = effectElement?.getBoundingClientRect();
            resolve({
              style: effectElement?.getAttribute("data-style") ?? null,
              lane: node.getAttribute("data-live-bomb-lane"),
              centerDx: effect ? effect.x + effect.width / 2 - (canvas.x + canvas.width * .375) : null,
              centerDy: effect ? effect.y + effect.height / 2 - (canvas.y + canvas.width * 280 / 400) : null,
            });
            return;
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }));
    await page.getByRole("button", { name: "싱글", exact: true }).click();

    const bomb = await firstBomb;
    expect(bomb, "5초 안에 키봄이 붙지 않음").not.toBeNull();
    expect(bomb?.style).toBe("diagonal");
    expect(bomb?.lane).toBe("2");
    expect(Math.abs(bomb?.centerDx ?? Infinity)).toBeLessThan(2);
    expect(Math.abs(bomb?.centerDy ?? Infinity)).toBeLessThan(2);
  });

  test("390px 화면에서 튜토리얼 재생기와 44px 조절 버튼이 문서 너비 안에 표시", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lab/note-assets");

    const canvas = page.locator('[data-tutorial-preview-canvas="true"]');
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox?.width).toBeLessThanOrEqual(370);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of await page.locator(".asset-lab-preview-options button, .asset-lab-bomb-options button, .asset-lab-player-toolbar button").all()) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("키봄 랙 카드를 누르면 해당 카드 안의 200–300ms CSS 효과를 다시 재생", async ({ page }) => {
    await page.goto("/lab/note-assets");

    const card = page.getByRole("button", { name: "백색 충격파 랙에서 다시 재생" });
    await card.click();
    await expect.poll(() => card.locator(".asset-lab-keybomb").evaluate((node) => (
      node.getAnimations({ subtree: true }).some((animation) => animation.playState === "running")
    ))).toBe(true);
    await expect(page.getByRole("button", { name: /백색 충격파/ }).first()).toHaveAttribute("aria-pressed", "true");
  });
});

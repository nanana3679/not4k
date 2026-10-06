import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const geometry = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/game/renderer/classicFrame.json', import.meta.url)), 'utf8')) as {
  laneLeft: number; laneRight: number; laneBottom: number;
};

type LayerName = 'armor' | 'gauge' | 'accent' | 'bar';
const ALL_LAYERS: LayerName[] = ['armor', 'gauge', 'accent', 'bar'];
interface Box { x0: number; x1: number; y0: number; y1: number }
// 레이어별 비교 영역(포함 경계, 프레임 실루엣과 겹치는 부분만). 게이지는 두 유리관 상자, 하단 바는 바 상자다.
const GAUGE_BOXES: Box[] = [{ x0: 118, x1: 221, y0: 150, y1: 1049 }, { x0: 802, x1: 905, y0: 150, y1: 1049 }];
const BAR_BOXES: Box[] = [{ x0: 360, x1: 663, y0: 1355, y1: 1420 }];

interface MeasureCase {
  timeMs: number;
  layers: LayerName[];
  /** 없으면 프레임 실루엣 전체(레인 창 제외). */
  boxes?: Box[];
  /** 실루엣 중 그 시각 광원 띠 네 경계(바깥 ±690·가운데 ±420)에서 수직 거리 1.5px 안의 픽셀만 본다. */
  bandEdgesOnly?: boolean;
  /** 비교 Pixi 앱 설정. 기본은 게임과 같은 MSAA 없음·스텐실 띠. */
  antialias?: boolean;
  bandEdges?: 'stencil' | 'soft';
}

interface Difference extends MeasureCase {
  pixels: number;
  /** 영역 픽셀·RGB 채널 평균 절대 차이(0~255). */
  mean: number;
  /** 픽셀별 RGB 평균 차이의 99번째 백분위(0~255, 정수로 반올림). */
  p99: number;
  max: number;
  /** 같은 SVG 시각과 움직임 없는 바탕의 차이. 움직임이 바꾼 양이라 비교가 민감한지 보는 기준이다. */
  baselineMean: number;
  baselineP99: number;
  /** 비교 앱이 실제로 얻은 MSAA 샘플 수. */
  samples: number;
}

/**
 * 프레임만 그리는 Pixi 비교 화면(createFrameMotionPreview, 1024×1536, 해상도 1)과 같은 시각으로 멈춘 승인 SVG를
 * 같은 크기 캔버스에 그려 픽셀을 비교한다. 비교 영역은 게임 프레임 그림(classic-frame.png) 알파 > 0(프레임 실루엣)이고 레인 창은 뺀다.
 * SVG는 각 애니메이션의 delay를 (원래 delay − t)로 바꾸고 일시정지해 정확히 t의 모습을 그린다. 두 화면 모두 SVG에
 * 들어 있는 같은 바탕 그림을 쓴다. 꺼 둔 레이어는 양쪽에서 함께 숨긴다.
 */
async function measure(page: Page, cases: MeasureCase[]): Promise<Difference[]> {
  return page.evaluate(async ({ cases, lane, allLayers }) => {
    const compareModule = '/src/lab/classicFrameMotionCompare.ts';
    const viewModule = '/src/lab/classicFrameMotionView.ts';
    const assetsModule = '/src/game/renderer/classicFrameMotionAssets.ts';
    const { createFrameMotionPreview } = await import(/* @vite-ignore */ compareModule);
    const { FRAME_MOTION_SVG_PATH, readSvgBaseHref } = await import(/* @vite-ignore */ viewModule);
    const { acquireFrameMotionAssets } = await import(/* @vite-ignore */ assetsModule);
    const width = 1024;
    const height = 1536;
    // 게임 렌더러와 같은 공유 로더(프레임과 같은 밉맵·삼선형 설정)로 움직임 자료를 빌린다.
    const lease = acquireFrameMotionAssets((path: string) => path);
    const motion = await lease.ready;
    const markup = await (await fetch(FRAME_MOTION_SVG_PATH)).text();
    const svgDocument = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const loadImage = async (url: string) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    };
    const base = await loadImage(readSvgBaseHref(svgDocument));
    const readPixels = (source: CanvasImageSource) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(source, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const cutout = readPixels(await loadImage('/gear/classic-frame.png'));
    const { light } = motion.data;
    const tilt = (light.tiltDeg * Math.PI) / 180;
    const regionFor = (item: { timeMs: number; boxes?: { x0: number; x1: number; y0: number; y1: number }[]; bandEdgesOnly?: boolean }) => {
      const { boxes } = item;
      const centreY = light.fromY + (light.toY - light.fromY) * ((item.timeMs % light.periodMs) / light.periodMs);
      const edges = [light.outerHeight / 2, light.coreHeight / 2];
      const nearBandEdge = (x: number, y: number) => {
        const dx = x + 0.5 - light.pivotX;
        const dy = y + 0.5 - centreY;
        const v = Math.abs(-dx * Math.sin(tilt) + dy * Math.cos(tilt));
        return edges.some((edge) => Math.abs(v - edge) <= 1.5);
      };
      const region: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const inLane = x >= lane.laneLeft && x <= lane.laneRight && y <= lane.laneBottom;
          const inBoxes = !boxes || boxes.some((box) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1);
          if (inLane || !inBoxes || cutout[(y * width + x) * 4 + 3] === 0) continue;
          if (item.bandEdgesOnly && !nearBandEdge(x, y)) continue;
          region.push((y * width + x) * 4);
        }
      }
      return region;
    };
    const basePixels = readPixels(base);

    // 설정(MSAA·띠 가장자리)마다 새 캔버스의 앱 하나. WebGL 컨텍스트 속성은 캔버스마다 한 번만 정해진다.
    type Preview = { render(time: number): void; destroy(): void; samples: number; motion: { setLayerVisible(layer: string, on: boolean): void } };
    const previews = new Map<string, { preview: Preview; canvas: HTMLCanvasElement }>();
    const previewFor = async (antialias: boolean, bandEdges: string) => {
      const key = `${antialias}:${bandEdges}`;
      const cached = previews.get(key);
      if (cached) return cached;
      const canvas = document.createElement('canvas');
      const preview: Preview = await createFrameMotionPreview({
        canvas, width, height, resolution: 1, base, motion, preserveDrawingBuffer: true, antialias, bandEdges,
      });
      const entry = { preview, canvas };
      previews.set(key, entry);
      return entry;
    };
    const frozenSvg = async (timeMs: number, layers: string[]) => {
      const clone = svgDocument.documentElement.cloneNode(true) as SVGSVGElement;
      for (const element of clone.querySelectorAll<SVGElement>('.fm-orbit, .fm-liquid-flow, .fm-bubble, .fm-accent, .fm-glint')) {
        const delay = Number.parseFloat(element.style.animationDelay || '0');
        element.style.animationDelay = `${delay - timeMs / 1000}s`;
        element.style.animationPlayState = 'paused';
      }
      for (const layer of allLayers) {
        if (!layers.includes(layer)) clone.querySelector(`#fm-${layer}`)!.setAttribute('display', 'none');
      }
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      try {
        return readPixels(await loadImage(url));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    const compare = (a: Uint8ClampedArray, b: Uint8ClampedArray, region: number[]) => {
      const histogram = new Uint32Array(256);
      let total = 0;
      let max = 0;
      for (const i of region) {
        const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
        total += d;
        if (d > max) max = d;
        histogram[Math.min(255, Math.round(d))]++;
      }
      const target = Math.ceil(region.length * 0.99);
      let seen = 0;
      let p99 = 0;
      for (let value = 0; value < 256; value++) {
        seen += histogram[value];
        if (seen >= target) { p99 = value; break; }
      }
      return { mean: total / region.length, p99, max };
    };

    const results = [];
    for (const item of cases) {
      const region = regionFor(item);
      const { preview, canvas } = await previewFor(item.antialias ?? false, item.bandEdges ?? 'stencil');
      for (const layer of allLayers) preview.motion.setLayerVisible(layer, item.layers.includes(layer));
      preview.render(item.timeMs);
      const pixi = readPixels(canvas);
      const svg = await frozenSvg(item.timeMs, item.layers);
      const difference = compare(pixi, svg, region);
      const baseline = compare(basePixels, svg, region);
      results.push({
        ...item, pixels: region.length, ...difference, baselineMean: baseline.mean, baselineP99: baseline.p99, samples: preview.samples,
      });
    }
    for (const { preview } of previews.values()) preview.destroy();
    lease.release();
    return results;
  }, { cases, lane: geometry, allLayers: ALL_LAYERS });
}

function report(label: string, results: Difference[]) {
  for (const result of results) {
    const config = `${result.antialias ? `msaa(${result.samples})` : 'no-aa'} ${result.bandEdges ?? 'stencil'}${result.bandEdgesOnly ? ' edges' : ''}`;
    console.log(`[frame-motion ${label}] ${config} t=${result.timeMs}ms layers=${result.layers.join('+')} px=${result.pixels} `
      + `mean=${result.mean.toFixed(3)} p99=${result.p99} max=${result.max.toFixed(1)} | 움직임 없음 mean=${result.baselineMean.toFixed(3)} p99=${result.baselineP99}`);
  }
}

test.describe('Classic 프레임 움직임 Pixi ↔ 승인 SVG 픽셀 비교', () => {
  // 원본 크기 Pixi 앱과 SVG를 swiftshader로 여러 번 그리므로 다른 무거운 파일과 겹쳐도 시간 안에 끝나게 한 워커에서 차례로 돌린다.
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('0·15·30·45초에 네 레이어를 모두 켠 Pixi와 SVG의 프레임 실루엣 평균 차이 ≤ 1.5/255·99번째 백분위 ≤ 6/255이고, 움직임 없는 바탕보다 4배 이상 가깝다', async ({ page }) => {
    await page.goto('/lab');
    const results = await measure(page, [0, 15_000, 30_000, 45_000].map((timeMs) => ({ timeMs, layers: ALL_LAYERS })));
    report('all', results);
    for (const result of results) {
      expect(result.pixels).toBeGreaterThan(700_000);
      expect(result.mean).toBeLessThanOrEqual(1.5);
      expect(result.p99).toBeLessThanOrEqual(6);
      // 비교가 움직임을 실제로 본다: 움직임 없는 바탕은 같은 SVG와 평균 4/255 이상 다르다.
      expect(result.baselineMean).toBeGreaterThan(4);
      expect(result.baselineMean).toBeGreaterThan(result.mean * 4);
    }
  });

  test('레이어 하나만 켜면 A 큰 광원(15·30초, 실루엣)·B 게이지(10·30초, 유리관 상자)·C 발광선(1.1·2.2초, 실루엣)·D 하단 바(0.48·0.88초, 바 상자)가 각자 SVG의 같은 레이어와 평균 ≤ 1/255로 맞는다', async ({ page }) => {
    await page.goto('/lab');
    const cases: MeasureCase[] = [
      { timeMs: 15_000, layers: ['armor'] },
      { timeMs: 30_000, layers: ['armor'] },
      { timeMs: 10_000, layers: ['gauge'], boxes: GAUGE_BOXES },
      { timeMs: 30_000, layers: ['gauge'], boxes: GAUGE_BOXES },
      { timeMs: 1_100, layers: ['accent'] },
      { timeMs: 2_200, layers: ['accent'] },
      { timeMs: 480, layers: ['bar'], boxes: BAR_BOXES },
      { timeMs: 880, layers: ['bar'], boxes: BAR_BOXES },
    ];
    const results = await measure(page, cases);
    report('layer', results);
    const limits: Record<LayerName, { p99: number }> = { armor: { p99: 4 }, gauge: { p99: 6 }, accent: { p99: 3 }, bar: { p99: 3 } };
    for (const result of results) {
      const [layer] = result.layers;
      expect(result.mean).toBeLessThanOrEqual(1);
      expect(result.p99).toBeLessThanOrEqual(limits[layer].p99);
      expect(result.baselineMean).toBeGreaterThan(result.mean * 4);
    }
  });

  test('15·30초 광원 띠 경계(1.5px 안) 최대 차이가 스텐실(MSAA 없음, 게임과 같음) 약 12/255에서 MSAA로 절반 넘게, 알파 마스크 띠로 4/255 이하로 줄고 실루엣 전체 평균은 나빠지지 않는다', async ({ page }) => {
    await page.goto('/lab');
    const cases: MeasureCase[] = [];
    for (const timeMs of [15_000, 30_000]) {
      for (const config of [{}, { antialias: true }, { bandEdges: 'soft' as const }]) {
        cases.push({ timeMs, layers: ['armor'], bandEdgesOnly: true, ...config });
        cases.push({ timeMs, layers: ['armor'], ...config });
      }
    }
    const results = await measure(page, cases);
    report('edge', results);
    const find = (timeMs: number, edgesOnly: boolean, config: { antialias?: boolean; bandEdges?: string }) => results.find((result) => (
      result.timeMs === timeMs && !!result.bandEdgesOnly === edgesOnly
      && !!result.antialias === !!config.antialias && (result.bandEdges ?? 'stencil') === (config.bandEdges ?? 'stencil')
    ))!;
    for (const timeMs of [15_000, 30_000]) {
      const stencil = find(timeMs, true, {});
      const msaa = find(timeMs, true, { antialias: true });
      const soft = find(timeMs, true, { bandEdges: 'soft' });
      expect(stencil.pixels).toBeGreaterThan(1000);
      // 스텐실 경계는 계단이라 경계 픽셀에서 최대 차이가 크다(측정 12.0·12.7).
      expect(stencil.max).toBeGreaterThan(8);
      // swiftshader도 MSAA 4×를 준다. 지원하지 않는 환경이면 효과 비교는 건너뛴다.
      if (msaa.samples > 0) expect(msaa.max).toBeLessThan(stencil.max * 0.6);
      expect(soft.max).toBeLessThanOrEqual(4);
      expect(soft.mean).toBeLessThan(stencil.mean);
      for (const config of [{ antialias: true }, { bandEdges: 'soft' as const }]) {
        expect(find(timeMs, false, config).mean).toBeLessThanOrEqual(find(timeMs, false, {}).mean + 0.05);
      }
    }
  });

  test('구성 도중 실패하면(하단 바 빛 조각이 빔) createFrameMotionPreview가 오류를 올리고 만든 앱을 정리해 캔버스의 WebGL 컨텍스트를 놓는다', async ({ page }) => {
    await page.goto('/lab');
    const result = await page.evaluate(async () => {
      const compareModule = '/src/lab/classicFrameMotionCompare.ts';
      const assetsModule = '/src/game/renderer/classicFrameMotionAssets.ts';
      const { createFrameMotionPreview } = await import(/* @vite-ignore */ compareModule);
      const { acquireFrameMotionAssets } = await import(/* @vite-ignore */ assetsModule);
      const lease = acquireFrameMotionAssets((path: string) => path);
      const motion = await lease.ready;
      const broken = { ...motion, data: { ...motion.data, textures: { ...motion.data.textures, glint: { ...motion.data.textures.glint, pieces: [] } } } };
      const canvas = document.createElement('canvas');
      const base = new Image();
      base.src = '/gear/classic-frame.png';
      await base.decode();
      try {
        await createFrameMotionPreview({ canvas, width: 64, height: 96, resolution: 1, base, motion: broken });
        return { threw: false, lost: false };
      } catch (error) {
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        return { threw: true, message: String(error), lost: gl ? gl.isContextLost() : true };
      } finally {
        lease.release();
      }
    });
    expect(result.threw).toBe(true);
    expect(result.message).toContain('glint');
    expect(result.lost).toBe(true);
  });
});

const compareSelector = '[data-frame-motion-compare]';

/** 비교 구역은 화면 가까이 와야 승인 SVG와 Pixi 앱을 만든다. */
async function waitForCompare(page: Page) {
  const section = page.locator(compareSelector);
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute('data-compare-ready', 'true', { timeout: 60_000 });
}

test.describe('Classic Frame Fit의 Pixi ↔ SVG 비교 화면', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test('가장자리 부드럽게(안티앨리어싱)를 켜면 비교 Pixi 앱을 새 캔버스로 다시 만들어 MSAA를 얻고(generation 증가), 알파 마스크도 같은 방식으로 다시 만들며 끄면 게임과 같은 설정으로 돌아온다', async ({ page }) => {
    await page.goto('/lab/classic-frame-fit');
    await waitForCompare(page);
    const section = page.locator(compareSelector);
    await expect(section).toHaveAttribute('data-compare-antialias', 'off');
    await expect(section).toHaveAttribute('data-compare-samples', '0');
    const generation = Number(await section.getAttribute('data-compare-generation'));
    await page.locator('canvas[data-frame-motion-compare-canvas]').evaluate((canvas) => { canvas.dataset.probe = 'first'; });

    await page.getByLabel('가장자리 부드럽게(안티앨리어싱)').check();
    await expect(section).toHaveAttribute('data-compare-antialias', 'on');
    await expect(section).toHaveAttribute('data-compare-ready', 'true', { timeout: 60_000 });
    await expect(section).toHaveAttribute('data-compare-generation', String(generation + 1));
    // 새 캔버스 하나만 남고(이전 캔버스는 떨어짐) MSAA 샘플을 얻는다(swiftshader 4×).
    await expect(page.locator('canvas[data-frame-motion-compare-canvas]')).toHaveCount(1);
    await expect(page.locator('canvas[data-frame-motion-compare-canvas][data-probe="first"]')).toHaveCount(0);
    expect(Number(await section.getAttribute('data-compare-samples'))).toBeGreaterThan(0);
    await expect(page.locator('.frame-motion-edges')).toContainText('MSAA');

    await page.getByLabel('띠를 알파 마스크로(실험)').check();
    await expect(section).toHaveAttribute('data-compare-band-edges', 'soft');
    await expect(section).toHaveAttribute('data-compare-generation', String(generation + 2), { timeout: 60_000 });
    await page.getByLabel('띠를 알파 마스크로(실험)').uncheck();
    await page.getByLabel('가장자리 부드럽게(안티앨리어싱)').uncheck();
    await expect(section).toHaveAttribute('data-compare-antialias', 'off');
    await expect(section).toHaveAttribute('data-compare-band-edges', 'stencil');
    await expect(section).toHaveAttribute('data-compare-ready', 'true', { timeout: 60_000 });
    await expect(section).toHaveAttribute('data-compare-samples', '0');
    await expect(page.locator('canvas[data-frame-motion-compare-canvas]')).toHaveCount(1);
  });

  test('비교 시각을 30초로 옮기면 Pixi와 SVG가 같은 시각(30000ms)을 그리고, SVG 애니메이션은 모두 멈춘 채 광원 표시점이 y 768에 있으며 왼쪽 장갑 보기의 같은 크기 두 화면 평균 차이가 움직임을 끈 Pixi의 절반 아래다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('/lab/classic-frame-fit');
    await waitForCompare(page);
    const section = page.locator(compareSelector);
    await page.getByLabel('비교 시각').fill('30');
    await expect(section).toHaveAttribute('data-compare-time-ms', '30000');
    const svgState = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-frame-motion-svg-host] svg')!;
      const animations = svg.getAnimations({ subtree: true });
      const box = svg.getBoundingClientRect();
      const marker = svg.querySelector('#fm-light-marker')!.getBoundingClientRect();
      return {
        count: animations.length,
        paused: animations.every((animation) => animation.playState === 'paused'),
        times: [...new Set(animations.map((animation) => Math.round(Number(animation.currentTime))))],
        markerY: ((marker.top + marker.height / 2 - box.top) * 1536) / box.height,
      };
    });
    expect(svgState.count).toBeGreaterThan(10);
    expect(svgState.paused).toBe(true);
    expect(svgState.times).toEqual([30000]);
    expect(Math.abs(svgState.markerY - 768)).toBeLessThan(3);

    // 화면에 보이는 두 패널(같은 CSS 크기)을 그대로 찍어 비교한다. 전체 보기는 1024px를 480px로 줄이며 두 쪽의 축소 필터가
    // 달라(Pixi 밉맵 삼선형, SVG는 브라우저 이미지 축소) 평균 약 2.2/255가 움직임과 무관하게 남는다. 그래서 장갑이 패널을 채우고
    // 1.5배로 그려지는 왼쪽 장갑 보기를, 크기(1280×1000 창, 패널 480×720)와 devicePixelRatio 1을 고정해 비교한다
    // (측정: 움직임 켬 약 0.9 vs 끔 약 3.8). 정밀한 일치는 위의 원본 크기 비교가 확인한다.
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
    await page.getByLabel('왼쪽 장갑', { exact: true }).check();
    await expect(section).toHaveAttribute('data-compare-view', 'left');
    const [pixiPanel, svgPanel] = await page.locator('.frame-motion-viewport').all();
    const pixiBox = (await pixiPanel.boundingBox())!;
    const svgBox = (await svgPanel.boundingBox())!;
    expect(Math.abs(pixiBox.width - svgBox.width)).toBeLessThan(0.5);
    expect(Math.abs(pixiBox.height - svgBox.height)).toBeLessThan(0.5);
    const diff = async () => panelDifference(page, await pixiPanel.screenshot(), await svgPanel.screenshot());
    const withMotion = await diff();
    for (const label of ['A 큰 광원', 'B 게이지 액체', 'C 발광선 호흡', 'D 하단 바 흐름']) await page.getByLabel(label, { exact: true }).uncheck();
    // 레이어를 모두 끄면 SVG 쪽도 함께 숨으므로, Pixi만 끈 기준은 SVG를 다시 켠 채로 만든다.
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('[data-frame-motion-svg-host]')!;
      for (const layer of ['armor', 'gauge', 'accent', 'bar']) host.removeAttribute(`data-off-${layer}`);
    });
    const withoutPixiMotion = await diff();
    console.log(`[frame-motion panel] 30s left view ${Math.round(pixiBox.width)}x${Math.round(pixiBox.height)} mean=${withMotion.toFixed(3)} | Pixi 움직임 끔 mean=${withoutPixiMotion.toFixed(3)}`);
    expect([Math.round(pixiBox.width), Math.round(pixiBox.height)]).toEqual([480, 720]);
    expect(withMotion).toBeLessThan(1.5);
    expect(withMotion).toBeLessThan(withoutPixiMotion * 0.5);
  });

  test('보기를 왼쪽 장갑·하단으로 바꾸면 SVG viewBox가 0 420 320 480·300 1240 424 212가 되고 두 패널이 같은 크기(2:3·2:1)로 바뀐다', async ({ page }) => {
    await page.goto('/lab/classic-frame-fit');
    await waitForCompare(page);
    const section = page.locator(compareSelector);
    const svg = page.locator('[data-frame-motion-svg-host] svg');
    await expect(svg).toHaveAttribute('viewBox', '0 0 1024 1536');
    for (const [label, view, viewBox, ratio] of [['왼쪽 장갑', 'left', '0 420 320 480', 2 / 3], ['하단', 'bottom', '300 1240 424 212', 2]] as const) {
      await page.getByLabel(label, { exact: true }).check();
      await expect(section).toHaveAttribute('data-compare-view', view);
      await expect(svg).toHaveAttribute('viewBox', viewBox);
      const [pixiBox, svgBox] = await Promise.all((await page.locator('.frame-motion-viewport').all()).map((panel) => panel.boundingBox()));
      expect(pixiBox!.width / pixiBox!.height).toBeCloseTo(ratio, 1);
      expect(Math.abs(pixiBox!.width - svgBox!.width)).toBeLessThan(0.5);
    }
  });

  test('재생을 누르면 비교 시각이 흐르고 일시정지하면 멈추며, A 큰 광원 체크를 끄면 비교 SVG의 #fm-armor도 숨는다', async ({ page }) => {
    await page.goto('/lab/classic-frame-fit');
    await waitForCompare(page);
    const section = page.locator(compareSelector);
    const time = async () => Number(await section.getAttribute('data-compare-time-ms'));
    await page.getByRole('button', { name: '재생', exact: true }).click();
    await expect(section).toHaveAttribute('data-compare-playing', 'true');
    await expect.poll(time, { timeout: 10_000 }).toBeGreaterThan(500);
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await expect(section).toHaveAttribute('data-compare-playing', 'false');
    const stopped = await time();
    await page.waitForTimeout(500);
    expect(await time()).toBe(stopped);

    await expect(page.locator('[data-frame-motion-svg-host] svg #fm-armor')).toBeVisible();
    await page.getByLabel('A 큰 광원', { exact: true }).uncheck();
    await expect(page.locator('[data-frame-motion-svg-host] svg #fm-armor')).toBeHidden();
    await expect(page.locator('[data-frame-motion-svg-host] svg #fm-gauge')).toBeVisible();
  });

  test('비교 구역이 화면에서 멀면 승인 SVG를 읽지 않고(data-compare-ready false), 스크롤해 가까워지면 준비된다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const svgRequests: string[] = [];
    page.on('request', (request) => { if (request.url().includes('54-ambient-motion-v19.svg')) svgRequests.push(request.url()); });
    await page.goto('/lab/classic-frame-fit');
    await expect(page.locator('[data-frame-fit-stage="true"]')).toHaveAttribute('data-motion-ready', 'true', { timeout: 60_000 });
    await expect(page.locator(compareSelector)).toHaveAttribute('data-compare-ready', 'false');
    expect(svgRequests).toEqual([]);
    await waitForCompare(page);
    expect(svgRequests).toHaveLength(1);
  });

  test('390px 화면에서는 비교 조절과 두 패널이 세로로 쌓이고 페이지에 가로 넘침이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/lab/classic-frame-fit');
    await waitForCompare(page);
    const [pixiBox, svgBox] = await Promise.all((await page.locator('.frame-motion-viewport').all()).map((panel) => panel.boundingBox()));
    expect(svgBox!.y).toBeGreaterThan(pixiBox!.y + pixiBox!.height);
    expect(Math.abs(pixiBox!.width - svgBox!.width)).toBeLessThan(0.5);
    const main = page.locator('[data-lab-page="classic-frame-fit"]');
    expect(await main.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    for (const control of await page.locator('.frame-motion-compare .frame-fit-button, .frame-motion-compare .frame-fit-option').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

/** 두 패널 스크린샷의 RGB 채널 평균 절대 차이(0~255). 크기가 1px 다르면 겹치는 부분만 본다. */
async function panelDifference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([first, second]) => {
    const decode = async (data: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      return image;
    };
    const [x, y] = await Promise.all([decode(first), decode(second)]);
    const width = Math.min(x.naturalWidth, y.naturalWidth);
    const height = Math.min(x.naturalHeight, y.naturalHeight);
    const read = (image: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    };
    const [p, q] = [read(x), read(y)];
    let total = 0;
    for (let i = 0; i < p.length; i += 4) total += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
    return total / ((p.length / 4) * 3);
  }, [a.toString('base64'), b.toString('base64')]);
}

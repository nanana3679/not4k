import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Sprite, Texture, TextureSource } from 'pixi.js';
import motionJsonText from '../../../public/gear/classic-frame-motion/frame-motion.json?raw';
import type { FrameMotionTextures } from './classicFrameMotion';
import type { FrameMotionAssetLease, FrameMotionResources } from './classicFrameMotionAssets';
import { FRAME_MOTION_TEXTURE_KEYS, parseFrameMotionData } from './classicFrameMotionData';
import { createChartTiming } from '../../shared';
import type { Chart } from '../../shared';
import type { SkinManager } from '../skin';

// 공유 로더 대신 준비 시점을 테스트가 정하는 임대를 준다(네트워크·Pixi Assets 없이).
const loader = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('./classicFrameMotionAssets', () => ({ acquireFrameMotionAssets: loader.acquire }));
// 비행 배경 초기화 실패(init 도중 실패) 경로를 흉내 낸다.
const flight = vi.hoisted(() => ({ fail: false }));
vi.mock('./flight/FlightBackground', () => ({
  FlightBackground: class {
    async init() { if (flight.fail) throw new Error('flight init failed'); }
    render() {}
    reset() {}
    dispose() {}
  },
}));

const { GameRenderer } = await import('./GameRenderer');
const { CLASSIC_FRAME_GEOMETRY, layoutClassicFrame } = await import('./classicFrameLayout');
const { GAME_HEIGHT, LANE_AREA_WIDTH } = await import('./constants');

interface Scene {
  app: Application;
  gearFrameLayer: Container;
  buildKeyBeams(): void;
}

const data = parseFrameMotionData(JSON.parse(motionJsonText));
const fakeTextures = () => Object.fromEntries(FRAME_MOTION_TEXTURE_KEYS.map((key) => {
  const box = data.textures[key];
  return [key, new Texture({ source: new TextureSource({ width: box.width, height: box.height }) })];
})) as FrameMotionTextures;

function controllableLease() {
  let resolve!: (resources: FrameMotionResources) => void;
  const ready = new Promise<FrameMotionResources>((onResolve) => { resolve = onResolve; });
  const lease = { ready, release: vi.fn<() => void>() } satisfies FrameMotionAssetLease;
  return { lease, resolve: () => resolve({ data, textures: fakeTextures() }) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const created: InstanceType<typeof GameRenderer>[] = [];
let current: ReturnType<typeof controllableLease>;

beforeEach(() => {
  current = controllableLease();
  loader.acquire.mockReset();
  loader.acquire.mockImplementation(() => current.lease);
  flight.fail = false;
});

afterEach(() => {
  for (const renderer of created.splice(0)) (renderer as unknown as Scene).app.stage.destroy({ children: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function createRenderer(options: {
  frameMotion?: boolean;
  frameMotionReducedMotion?: 'omit' | 'hide';
  showGearFrame?: boolean;
  showFlightBackground?: boolean;
  beforeInit?: (scene: Scene) => void;
} = {}) {
  const frame = new Texture({ source: new TextureSource({ width: 1024, height: 1536 }) });
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
    getBodyWidthScale: () => 1,
    hasTexture: () => false,
    getTexture: (key: string) => {
      if (key === 'gearFrame') return frame;
      throw new Error(`unknown texture ${key}`);
    },
  } as unknown as SkinManager;
  const { showGearFrame = true, showFlightBackground = false, frameMotion, frameMotionReducedMotion, beforeInit } = options;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width: 1067, height: GAME_HEIGHT, skinManager, showGearFrame, showFlightBackground,
    frameMotion, frameMotionReducedMotion,
  });
  const scene = renderer as unknown as Scene;
  // GPU 초기화만 생략하고 실제 Container/Sprite와 init을 쓴다. renderFrame은 가짜 GPU 렌더러로 그리기만 건너뛴다.
  vi.spyOn(scene.app, 'init').mockResolvedValue(undefined);
  vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {});
  const initSource = vi.fn();
  Object.assign(scene.app, { renderer: { texture: { initSource } } });
  const render = vi.spyOn(scene.app, 'render').mockImplementation(() => {});
  const destroy = vi.spyOn(scene.app, 'destroy').mockImplementation(() => {});
  beforeInit?.(scene);
  created.push(renderer);
  await renderer.init();
  return { renderer, scene, initSource, render, destroy };
}

const chart: Chart = {
  meta: { title: '', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [],
  trillZones: [],
  events: [{ type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 }],
} as unknown as Chart;

describe('GameRenderer 프레임 움직임 (RFD 0029)', () => {
  it('프레임이 있고 frameMotion을 생략(기본 켬)하면 자료를 한 번 빌리고, 프레임 스프라이트 바로 위에 프레임과 같은 변환(250/552배)으로 움직임 자리를 붙인다', async () => {
    const { renderer, scene } = await createRenderer();
    expect(loader.acquire).toHaveBeenCalledTimes(1);
    const [frame, holder] = scene.gearFrameLayer.children;
    expect(frame).toBeInstanceOf(Sprite);
    expect(holder.label).toBe('classic-frame-motion-holder');
    const layout = layoutClassicFrame(CLASSIC_FRAME_GEOMETRY, { laneAreaX: (1067 - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT });
    expect([holder.x, holder.y]).toEqual([layout.x, layout.y]);
    expect(holder.scale.x).toBeCloseTo(250 / 552, 12);
    expect(renderer.frameMotion).not.toBeNull();
  });

  it('자료가 준비되기 전 frameMotion.status는 loading이고 프레임만 그리며, 준비되면 렌더러를 다시 만들지 않고 자리에 움직임을 얹어 ready가 된다', async () => {
    const { renderer, scene } = await createRenderer();
    const holder = scene.gearFrameLayer.children[1] as Container;
    expect(renderer.frameMotion!.status).toBe('loading');
    expect(holder.children).toHaveLength(0);
    renderer.renderFrame(0, 16);
    current.resolve();
    await flush();
    expect(renderer.frameMotion!.status).toBe('ready');
    expect(holder.children.map((child) => child.label)).toEqual(['classic-frame-motion']);
  });

  it('자료가 준비되면 얹기 전에 렌더러 GPU에 움직임 텍스처 9장을 올린다(initSource 9번)', async () => {
    const { initSource } = await createRenderer();
    current.resolve();
    await flush();
    expect(initSource).toHaveBeenCalledTimes(9);
  });

  it('frameMotion: false(설정 끔)면 자료를 빌리지 않고 frameMotion은 null이며 프레임 레이어에는 프레임 스프라이트 하나뿐이다', async () => {
    const { renderer, scene } = await createRenderer({ frameMotion: false });
    expect(loader.acquire).not.toHaveBeenCalled();
    expect(renderer.frameMotion).toBeNull();
    expect(scene.gearFrameLayer.children).toHaveLength(1);
    expect(scene.app.stage.getChildByLabel('classic-frame-motion', true)).toBeNull();
    renderer.renderFrame(0, 16);
  });

  it('showGearFrame: false(튜토리얼·노트 에셋 재생기)면 frameMotion을 켜도 움직임을 만들지 않는다(null, 임대 0번)', async () => {
    const { renderer } = await createRenderer({ showGearFrame: false, frameMotion: true });
    expect(loader.acquire).not.toHaveBeenCalled();
    expect(renderer.frameMotion).toBeNull();
  });

  it('움직임 줄이기(prefers-reduced-motion: reduce)면 기본(omit)으로 자료를 빌리지도 움직임 자리를 만들지도 않는다(설정 끔과 같은 0 비용)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { renderer, scene } = await createRenderer();
    expect(loader.acquire).not.toHaveBeenCalled();
    expect(renderer.frameMotion).toBeNull();
    expect(scene.gearFrameLayer.children).toHaveLength(1);
  });

  it('움직임 줄이기라도 frameMotionReducedMotion: hide(Lab)면 자료를 빌려 얹되 숨기고, renderFrame(…, 16)이 시계를 0에 둔다', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { renderer, scene, initSource } = await createRenderer({ frameMotionReducedMotion: 'hide' });
    current.resolve();
    await flush();
    renderer.renderFrame(0, 16);
    expect(loader.acquire).toHaveBeenCalledTimes(1);
    expect(renderer.frameMotion!.status).toBe('ready');
    expect(renderer.frameMotion!.running).toBe(false);
    expect(renderer.frameMotion!.timeMs).toBe(0);
    expect(scene.app.stage.getChildByLabel('classic-frame-motion', true)!.visible).toBe(false);
    // 그리지 않는 텍스처는 GPU에 미리 올리지 않는다.
    expect(initSource).not.toHaveBeenCalled();
  });

  it('곡 시각 10000ms에서 renderFrame(…, 16)을 3번 부르면 움직임 시계는 곡 시각이 아니라 게임 프레임 간격만 따라 48ms가 된다', async () => {
    const { renderer } = await createRenderer();
    current.resolve();
    await flush();
    for (let i = 0; i < 3; i++) renderer.renderFrame(10_000, 16);
    expect(renderer.frameMotion!.timeMs).toBe(48);
  });

  it('renderFrame에 5000ms 간격이 들어와도(숨은 탭 복귀·긴 프레임) 움직임 시계는 50ms만 나아간다', async () => {
    const { renderer } = await createRenderer();
    current.resolve();
    await flush();
    renderer.renderFrame(0, 5000);
    expect(renderer.frameMotion!.timeMs).toBe(50);
  });

  it('setChart로 차트를 다시 걸어도(같은 렌더러로 되감기) 움직임 시계는 32ms에서 이어 간다', async () => {
    const { renderer } = await createRenderer();
    current.resolve();
    await flush();
    renderer.renderFrame(0, 16);
    renderer.renderFrame(16, 16);
    renderer.setChart([], [], [], chart.events, createChartTiming(chart), 1000);
    expect(renderer.frameMotion!.timeMs).toBe(32);
    renderer.renderFrame(0, 16);
    expect(renderer.frameMotion!.timeMs).toBe(48);
  });

  it('warmUp(1000)은 곡 시작 전 한 장을 그리되(app.render 1번) 움직임 시계를 0에 두고, 그 한 장 동안만 빛이 투명한 하단 바를 그린다', async () => {
    const { renderer, scene, render } = await createRenderer();
    current.resolve();
    await flush();
    const bar = scene.app.stage.getChildByLabel('frame-motion-bar', true)!;
    const barDuringRender: boolean[] = [];
    render.mockImplementation(() => { barDuringRender.push(bar.visible); });
    renderer.warmUp(1000);
    expect(barDuringRender).toEqual([true]);
    expect(bar.visible).toBe(false);
    expect(renderer.frameMotion!.timeMs).toBe(0);
  });

  it('재생 중 얹기를 미룬 채(setAttachDeferred(true)) 자료가 오면 renderFrame 동안 얹지 않고(deferred), 일시정지로 풀면 그때 얹고 한 장 그린다', async () => {
    const { renderer, scene, render, initSource } = await createRenderer();
    renderer.frameMotion!.setAttachDeferred(true);
    current.resolve();
    await flush();
    renderer.renderFrame(500, 16);
    expect(renderer.frameMotion!.status).toBe('deferred');
    expect(scene.app.stage.getChildByLabel('classic-frame-motion', true)).toBeNull();
    expect(initSource).not.toHaveBeenCalled();
    render.mockClear();
    renderer.frameMotion!.setAttachDeferred(false);
    expect(renderer.frameMotion!.status).toBe('ready');
    expect(initSource).toHaveBeenCalledTimes(9);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('dispose하면 움직임을 정리하고 빌린 자료를 한 번 놓으며 frameMotion은 null이 된다', async () => {
    const { renderer, scene } = await createRenderer();
    current.resolve();
    await flush();
    const motionRoot = scene.app.stage.getChildByLabel('classic-frame-motion', true)!;
    renderer.dispose();
    expect(motionRoot.destroyed).toBe(true);
    expect(current.lease.release).toHaveBeenCalledTimes(1);
    expect(renderer.frameMotion).toBeNull();
  });

  it('dispose한 뒤에 자료가 준비되면 GPU에 올리지도(initSource 0번) 얹지도 않고 임대는 정확히 한 번 놓는다', async () => {
    const { renderer, scene, initSource } = await createRenderer();
    const holder = scene.gearFrameLayer.children[1] as Container;
    renderer.dispose();
    current.resolve();
    await flush();
    expect(initSource).not.toHaveBeenCalled();
    expect(holder.children).toHaveLength(0);
    expect(current.lease.release).toHaveBeenCalledTimes(1);
  });

  it('init 도중 키빔 만들기가 실패하면(초기화 전 실패) 움직임 자료를 빌리지 않아 dispose할 수 없는 임대가 남지 않는다', async () => {
    await expect(createRenderer({
      beforeInit: (scene) => { vi.mocked(scene.buildKeyBeams).mockImplementation(() => { throw new Error('beams'); }); },
    })).rejects.toThrow('beams');
    expect(loader.acquire).not.toHaveBeenCalled();
  });

  it('init 끝의 비행 배경 준비가 실패하면 렌더러가 스스로 정리하며 빌린 움직임 자료를 한 번 놓는다', async () => {
    flight.fail = true;
    await expect(createRenderer({ showFlightBackground: true })).rejects.toThrow('flight init failed');
    expect(loader.acquire).toHaveBeenCalledTimes(1);
    expect(current.lease.release).toHaveBeenCalledTimes(1);
  });
});

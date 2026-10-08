import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Sprite, Texture, TextureSource } from 'pixi.js';
import motionJsonText from '../../../public/gear/gear-motion/gear-motion.json?raw';
import type { GearMotionTextures } from './gearMotion';
import type { GearMotionAssetLease, GearMotionResources } from './gearMotionAssets';
import { GEAR_MOTION_TEXTURE_KEYS, parseGearMotionData } from './gearMotionData';
import { createChartTiming } from '../../shared';
import type { Chart } from '../../shared';
import type { SkinManager } from '../skin';

// 공유 로더 대신 준비 시점을 테스트가 정하는 임대를 준다(네트워크·Pixi Assets 없이).
const loader = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('./gearMotionAssets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./gearMotionAssets')>()),
  acquireGearMotionAssets: loader.acquire,
}));
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
const { GEAR_GEOMETRY, layoutGear } = await import('./gearLayout');
const { GAME_HEIGHT, LANE_AREA_WIDTH } = await import('./constants');

interface Scene {
  app: Application;
  gearLayer: Container;
  buildKeyBeams(): void;
}

const data = parseGearMotionData(JSON.parse(motionJsonText));
const fakeTextures = () => Object.fromEntries(GEAR_MOTION_TEXTURE_KEYS.map((key) => {
  const box = data.textures[key];
  return [key, new Texture({ source: new TextureSource({ width: box.width, height: box.height }) })];
})) as GearMotionTextures;

function controllableLease() {
  let resolve!: (resources: GearMotionResources) => void;
  let reject!: (error: unknown) => void;
  const ready = new Promise<GearMotionResources>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  ready.catch(() => undefined);
  const lease = { ready, release: vi.fn<() => void>() } satisfies GearMotionAssetLease;
  return { lease, resolve: () => resolve({ data, textures: fakeTextures() }), reject };
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

/** 렌더러를 만들고 init을 시작한다. init은 움직임 자료를 기다리므로 resolveLease(기본 true)면 임대를 이행시킨 뒤 init을 기다린다. */
async function createRenderer(options: {
  gearMotion?: boolean;
  gearMotionReducedMotion?: 'omit' | 'hide';
  showGear?: boolean;
  showFlightBackground?: boolean;
  beforeInit?: (scene: Scene) => void;
  resolveLease?: boolean;
} = {}) {
  const started = startRenderer(options);
  if (options.resolveLease ?? true) current.resolve();
  await started.init;
  return started;
}

function startRenderer(options: Parameters<typeof createRenderer>[0] = {}) {
  const gear = new Texture({ source: new TextureSource({ width: 1024, height: 1536 }) });
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
    getBodyWidthScale: () => 1,
    hasTexture: () => false,
    getLoadedTextures: () => new Map([['gearImage', gear]]),
    getTexture: (key: string) => {
      if (key === 'gearImage') return gear;
      throw new Error(`unknown texture ${key}`);
    },
  } as unknown as SkinManager;
  const { showGear = true, showFlightBackground = false, gearMotion, gearMotionReducedMotion, beforeInit } = options;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width: 1067, height: GAME_HEIGHT, skinManager, showGear, showFlightBackground,
    gearMotion, gearMotionReducedMotion,
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
  const init = renderer.init();
  init.catch(() => undefined);
  return { renderer, scene, initSource, render, destroy, init };
}

const chart: Chart = {
  meta: { title: '', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [],
  trillZones: [],
  events: [{ type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 }],
} as unknown as Chart;

describe('GameRenderer 기어 움직임 (RFD 0029)', () => {
  it('기어가 있고 gearMotion을 생략(기본 켬)하면 자료를 한 번 빌리고, 기어 스프라이트 바로 위에 기어와 같은 변환(250/552배)으로 움직임 자리를 붙인다', async () => {
    const { renderer, scene } = await createRenderer();
    expect(loader.acquire).toHaveBeenCalledTimes(1);
    const [gear, holder] = scene.gearLayer.children;
    expect(gear).toBeInstanceOf(Sprite);
    expect(holder.label).toBe('gear-motion-holder');
    const layout = layoutGear(GEAR_GEOMETRY, { laneAreaX: (1067 - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT });
    expect([holder.x, holder.y]).toEqual([layout.x, layout.y]);
    expect(holder.scale.x).toBeCloseTo(250 / 552, 12);
    expect(renderer.gearMotion).not.toBeNull();
  });

  it('init은 움직임 자료(필수)가 준비될 때까지 끝나지 않고(status loading), 준비되면 움직임을 얹은 뒤에 끝나 첫 renderFrame 전에 status ready', async () => {
    const { renderer, scene, init } = startRenderer();
    const finished = vi.fn();
    void init.then(finished);
    await flush();
    expect(finished).not.toHaveBeenCalled();
    expect(renderer.gearMotion!.status).toBe('loading');
    current.resolve();
    await init;
    const holder = scene.gearLayer.children[1] as Container;
    expect(renderer.gearMotion!.status).toBe('ready');
    expect(holder.children.map((child) => child.label)).toEqual(['gear-motion']);
  });

  it('init은 움직임 텍스처를 GPU 업로드하지 않고(initSource 0번), 곡 시작 전 준비 prepareForPlayback(0)이 움직임 텍스처 9장과 기어 그림을 한 번씩 GPU 업로드한다(10번)', async () => {
    const { renderer, initSource } = await createRenderer();
    expect(initSource).not.toHaveBeenCalled();
    renderer.prepareForPlayback(0);
    expect(initSource).toHaveBeenCalledTimes(10);
  });

  it('움직임 자료 읽기가 거절되면 init이 그 오류로 거절되고 렌더러가 비행 배경 실패와 같이 스스로 정리하며(app.destroy, 캔버스는 남김) 임대를 한 번 놓는다', async () => {
    const { renderer, init, destroy } = startRenderer();
    const failure = new Error('[Loader.load] Failed to load /gear/gear-motion/gear-motion.json');
    current.reject(failure);
    await expect(init).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledWith(expect.objectContaining({ removeView: false }), expect.anything());
    expect(renderer.gearMotion).toBeNull();
    expect(current.lease.release).toHaveBeenCalledTimes(1);
  });

  it('gearMotion: false(설정 끔)면 자료를 빌리지도 기다리지도 않아 init이 바로 끝나고, gearMotion은 null이며 기어 레이어에는 기어 스프라이트 하나뿐이다', async () => {
    const { renderer, scene } = await createRenderer({ gearMotion: false, resolveLease: false });
    expect(loader.acquire).not.toHaveBeenCalled();
    expect(renderer.gearMotion).toBeNull();
    expect(scene.gearLayer.children).toHaveLength(1);
    expect(scene.app.stage.getChildByLabel('gear-motion', true)).toBeNull();
    renderer.renderFrame(0, 16);
  });

  it('showGear: false(튜토리얼·노트 에셋 재생기)면 gearMotion을 켜도 움직임을 만들지 않는다(null, 임대 0번)', async () => {
    const { renderer } = await createRenderer({ showGear: false, gearMotion: true, resolveLease: false });
    expect(loader.acquire).not.toHaveBeenCalled();
    expect(renderer.gearMotion).toBeNull();
  });

  it('움직임 줄이기(prefers-reduced-motion: reduce)면 기본(omit)으로 자료를 빌리지도 움직임 자리를 만들지도 않는다(설정 끔과 같은 0 비용)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { renderer, scene } = await createRenderer({ resolveLease: false });
    expect(loader.acquire).not.toHaveBeenCalled();
    expect(renderer.gearMotion).toBeNull();
    expect(scene.gearLayer.children).toHaveLength(1);
  });

  it('움직임 줄이기라도 gearMotionReducedMotion: hide(Lab)면 자료를 빌려 얹되 숨기고, renderFrame(…, 16)이 시계를 0에 둔다', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { renderer, scene, initSource } = await createRenderer({ gearMotionReducedMotion: 'hide' });
    renderer.renderFrame(0, 16);
    expect(loader.acquire).toHaveBeenCalledTimes(1);
    expect(renderer.gearMotion!.status).toBe('ready');
    expect(renderer.gearMotion!.running).toBe(false);
    expect(renderer.gearMotion!.timeMs).toBe(0);
    expect(scene.app.stage.getChildByLabel('gear-motion', true)!.visible).toBe(false);
    // 그리지 않는 텍스처는 GPU에 미리 올리지 않는다.
    expect(initSource).not.toHaveBeenCalled();
  });

  it('곡 시각 10000ms에서 renderFrame(…, 16)을 3번 부르면 움직임 시계는 곡 시각이 아니라 게임 프레임 간격만 따라 48ms가 된다', async () => {
    const { renderer } = await createRenderer();
    for (let i = 0; i < 3; i++) renderer.renderFrame(10_000, 16);
    expect(renderer.gearMotion!.timeMs).toBe(48);
  });

  it('renderFrame에 5000ms 간격이 들어와도(숨은 탭 복귀·긴 프레임) 움직임 시계는 50ms만 나아간다', async () => {
    const { renderer } = await createRenderer();
    renderer.renderFrame(0, 5000);
    expect(renderer.gearMotion!.timeMs).toBe(50);
  });

  it('setChart로 차트를 다시 걸어도(같은 렌더러로 되감기) 움직임 시계는 32ms에서 이어 간다', async () => {
    const { renderer } = await createRenderer();
    renderer.renderFrame(0, 16);
    renderer.renderFrame(16, 16);
    renderer.setChart([], [], [], chart.events, createChartTiming(chart), 1000);
    expect(renderer.gearMotion!.timeMs).toBe(32);
    renderer.renderFrame(0, 16);
    expect(renderer.gearMotion!.timeMs).toBe(48);
  });

  it('prepareForPlayback(1000)은 곡 시작 전 첫 프레임을 그리되(app.render 1번) 움직임 시계를 0에 두고, 그 첫 프레임 동안만 빛이 투명한 하단 바를 그린다', async () => {
    const { renderer, scene, render } = await createRenderer();
    const bar = scene.app.stage.getChildByLabel('gear-motion-bar', true)!;
    const barDuringRender: boolean[] = [];
    render.mockImplementation(() => { barDuringRender.push(bar.visible); });
    renderer.prepareForPlayback(1000);
    expect(barDuringRender).toEqual([true]);
    expect(bar.visible).toBe(false);
    expect(renderer.gearMotion!.timeMs).toBe(0);
  });

  it('dispose하면 움직임을 정리하고 빌린 자료를 한 번 놓으며 gearMotion은 null이 된다', async () => {
    const { renderer, scene } = await createRenderer();
    const motionRoot = scene.app.stage.getChildByLabel('gear-motion', true)!;
    renderer.dispose();
    expect(motionRoot.destroyed).toBe(true);
    expect(current.lease.release).toHaveBeenCalledTimes(1);
    expect(renderer.gearMotion).toBeNull();
  });

  it('init이 자료를 기다리는 동안 dispose하면(화면 이탈) 나중에 자료가 와도 GPU에 올리지도(initSource 0번) 얹지도 않고 init은 거절되며 임대는 정확히 한 번 놓는다', async () => {
    const { renderer, scene, initSource, init } = startRenderer();
    await flush();
    const holder = scene.gearLayer.children[1] as Container;
    renderer.dispose();
    current.resolve();
    await expect(init).rejects.toThrow('released');
    expect(initSource).not.toHaveBeenCalled();
    expect(holder.children).toHaveLength(0);
    expect(current.lease.release).toHaveBeenCalledTimes(1);
  });

  it('init 도중 키빔 만들기가 실패하면(초기화 전 실패) 움직임 자료를 빌리지 않아 dispose할 수 없는 임대가 남지 않는다', async () => {
    await expect(createRenderer({
      resolveLease: false,
      beforeInit: (scene) => { vi.mocked(scene.buildKeyBeams).mockImplementation(() => { throw new Error('beams'); }); },
    })).rejects.toThrow('beams');
    expect(loader.acquire).not.toHaveBeenCalled();
  });

  it('init 끝의 비행 배경 준비가 실패하면 렌더러가 스스로 정리하며 빌린 움직임 자료를 한 번 놓는다', async () => {
    flight.fail = true;
    await expect(createRenderer({ showFlightBackground: true, resolveLease: false })).rejects.toThrow('flight init failed');
    expect(loader.acquire).toHaveBeenCalledTimes(1);
    expect(current.lease.release).toHaveBeenCalledTimes(1);
  });
});

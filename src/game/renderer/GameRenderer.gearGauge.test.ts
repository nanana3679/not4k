import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Texture, TextureSource } from 'pixi.js';
import motionJsonText from '../../../public/gear/gear-motion/gear-motion.json?raw';
import type { GearMotionTextures } from './gearMotion';
import type { GearMotionAssetLease, GearMotionResources } from './gearMotionAssets';
import { GEAR_MOTION_TEXTURE_KEYS, parseGearMotionData } from './gearMotionData';
import { createChartTiming, JudgmentGrade } from '../../shared';
import type { Chart } from '../../shared';
import type { SkinManager } from '../skin';

// 공유 로더 대신 바로 준비되는 움직임 자료 임대를 준다(네트워크·Pixi Assets 없이).
const loader = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('./gearMotionAssets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./gearMotionAssets')>()),
  acquireGearMotionAssets: loader.acquire,
}));
// 비행 배경은 받은 고도만 기록한다.
const flight = vi.hoisted(() => ({ renders: [] as [number, number][] }));
vi.mock('./flight/FlightBackground', () => ({
  FlightBackground: class {
    async init() {}
    render(altitude: number, deltaMs: number) { flight.renders.push([altitude, deltaMs]); }
    reset() {}
    dispose() {}
  },
}));

const { GameRenderer } = await import('./GameRenderer');
const { GEAR_GEOMETRY, layoutGear } = await import('./gearLayout');
const { GAME_HEIGHT, LANE_AREA_WIDTH } = await import('./constants');
const { gaugeEmptyRows } = await import('./gearGauge');

interface Scene {
  app: Application;
  gearLayer: Container;
  buildKeyBeams(): void;
  flightAltitudeState: { offset: number; recoveryVelocityPerSecond: number };
}

const data = parseGearMotionData(JSON.parse(motionJsonText));
const motionResources = (): GearMotionResources => ({
  data,
  textures: Object.fromEntries(GEAR_MOTION_TEXTURE_KEYS.map((key) => {
    const box = data.textures[key];
    return [key, new Texture({ source: new TextureSource({ width: box.width, height: box.height }) })];
  })) as GearMotionTextures,
});

const created: InstanceType<typeof GameRenderer>[] = [];

beforeEach(() => {
  flight.renders = [];
  loader.acquire.mockReset();
  loader.acquire.mockImplementation((): GearMotionAssetLease => ({ ready: Promise.resolve(motionResources()), release: vi.fn() }));
});

afterEach(() => {
  for (const renderer of created.splice(0)) (renderer as unknown as Scene).app.stage.destroy({ children: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function createRenderer({
  showGear = true, showFlightBackground = false, gearMotion = false, gaugeTexture = true,
}: { showGear?: boolean; showFlightBackground?: boolean; gearMotion?: boolean; gaugeTexture?: boolean } = {}) {
  const gear = new Texture({ source: new TextureSource({ width: 1024, height: 1536 }) });
  const gauge = new Texture({ source: new TextureSource({ width: GEAR_GEOMETRY.gauge.atlasWidth, height: GEAR_GEOMETRY.gauge.atlasHeight }) });
  const requested: string[] = [];
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
    getBodyWidthScale: () => 1,
    hasTexture: () => false,
    getLoadedTextures: () => new Map<string, Texture>(gaugeTexture ? [['gearImage', gear], ['gearGaugeEmpty', gauge]] : [['gearImage', gear]]),
    getTexture: (key: string) => {
      requested.push(key);
      if (key === 'gearImage') return gear;
      if (key === 'gearGaugeEmpty' && gaugeTexture) return gauge;
      throw new Error(`unknown texture ${key}`);
    },
  } as unknown as SkinManager;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width: 1067, height: GAME_HEIGHT, skinManager, showGear, showFlightBackground, gearMotion,
  });
  const scene = renderer as unknown as Scene;
  // GPU 초기화만 생략하고 실제 Container/Sprite와 init을 쓴다. renderFrame은 가짜 GPU 렌더러로 그리기만 건너뛴다.
  vi.spyOn(scene.app, 'init').mockResolvedValue(undefined);
  vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {});
  const initSource = vi.fn();
  Object.assign(scene.app, { renderer: { texture: { initSource } } });
  vi.spyOn(scene.app, 'render').mockImplementation(() => {});
  vi.spyOn(scene.app, 'destroy').mockImplementation(() => {});
  created.push(renderer);
  await renderer.init();
  return { renderer, scene, gauge, requested, initSource };
}

const chart: Chart = {
  meta: { title: '', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [],
  trillZones: [],
  events: [{ type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 }],
} as unknown as Chart;
const setChart = (renderer: InstanceType<typeof GameRenderer>, durationMs = 10_000) =>
  renderer.setChart([], [], [], chart.events, createChartTiming(chart), durationMs);
const gaugeContainer = (scene: Scene) => scene.gearLayer.getChildByLabel('gear-gauge') as Container;

describe('GameRenderer 기어 고도 게이지 — 배치와 레이어 순서', () => {
  it('기어 움직임 켬: 기어 레이어는 [기어, 움직임 자리, 게이지] 순서라 게이지 덮개가 움직임의 액체·기포 위에 있고 기어와 같은 변환(250/552배)이다', async () => {
    const { scene } = await createRenderer({ gearMotion: true });
    expect(scene.gearLayer.children.map((child) => child.label)).toEqual(['gear', 'gear-motion-holder', 'gear-gauge']);
    const layout = layoutGear(GEAR_GEOMETRY, { laneAreaX: (1067 - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT });
    const gauge = gaugeContainer(scene);
    expect([gauge.x, gauge.y]).toEqual([layout.x, layout.y]);
    expect(gauge.scale.x).toBeCloseTo(250 / 552, 12);
    expect(gauge.scale.y).toBeCloseTo(250 / 552, 12);
  });

  it('기어 움직임 끔이어도 게이지는 기어 바로 위에 있다([기어, 게이지])', async () => {
    const { renderer, scene } = await createRenderer({ gearMotion: false });
    expect(scene.gearLayer.children.map((child) => child.label)).toEqual(['gear', 'gear-gauge']);
    expect(renderer.gearGaugeLevel).toBe(1);
  });

  it('운영체제 prefers-reduced-motion이 reduce여도 기어 레이어는 [기어, 기어 움직임 holder, 게이지]로 움직임과 게이지가 모두 있다(RFD 0030)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { renderer, scene } = await createRenderer({ gearMotion: true });
    expect(renderer.gearMotion).not.toBeNull();
    expect(scene.gearLayer.children.map((child) => child.label)).toEqual(['gear', 'gear-motion-holder', 'gear-gauge']);
  });

  it('addGearOverlay로 붙인 레이어는 기어 바로 위·게이지 아래에 들어가 게이지가 늘 맨 위에 남는다', async () => {
    const { renderer, scene } = await createRenderer();
    const overlay = new Container({ label: 'probe-overlay' });
    renderer.addGearOverlay(overlay);
    expect(scene.gearLayer.children.map((child) => child.label)).toEqual(['gear', 'probe-overlay', 'gear-gauge']);
  });

  it('showGear: false(튜토리얼 재생기)면 게이지를 만들지 않고 빈 유리 텍스처도 찾지 않으며 gearGaugeLevel은 null', async () => {
    const { renderer, requested } = await createRenderer({ showGear: false });
    expect(renderer.gearGaugeLevel).toBeNull();
    expect(requested).not.toContain('gearGaugeEmpty');
  });

  it('스킨에 빈 유리 텍스처가 없으면 기어만 그리고 게이지는 없다(gearGaugeLevel null)', async () => {
    const { renderer, scene } = await createRenderer({ gaugeTexture: false });
    expect(renderer.gearGaugeLevel).toBeNull();
    expect(scene.gearLayer.children.map((child) => child.label)).toEqual(['gear']);
  });

  it('init은 빈 유리 아틀라스를 GPU 업로드하지 않고, 곡 시작 전 준비 prepareForPlayback(0)이 기어 그림과 함께 GPU 업로드한다(채움 1이라 숨겨 둔 덮개가 곡 중 처음 보이는 프레임에 업로드·밉맵 생성이 몰리지 않게, initSource 2번)', async () => {
    const { renderer, initSource, gauge } = await createRenderer({ gearMotion: false });
    expect(initSource).not.toHaveBeenCalled();
    renderer.prepareForPlayback(0);
    expect(initSource).toHaveBeenCalledTimes(2);
    expect(initSource).toHaveBeenCalledWith(gauge.source);
  });

  it('기어 움직임을 켜도 prepareForPlayback(0)은 빈 유리 아틀라스를 한 번만 GPU 업로드하고 기어 그림·움직임 텍스처 9장과 함께 GPU 업로드한다(initSource 11번)', async () => {
    const { renderer, initSource, gauge } = await createRenderer({ gearMotion: true });
    renderer.prepareForPlayback(0);
    expect(initSource.mock.calls.filter(([source]) => source === gauge.source)).toHaveLength(1);
    expect(initSource).toHaveBeenCalledTimes(11);
  });

  it('showGear: false(튜토리얼 재생기)면 prepareForPlayback(0)도 빈 유리·기어 그림을 GPU 업로드하지 않는다(initSource 0번)', async () => {
    const { renderer, initSource } = await createRenderer({ showGear: false });
    renderer.prepareForPlayback(0);
    expect(initSource).not.toHaveBeenCalled();
  });

  it('dispose하면 게이지 덮개를 정리하고 gearGaugeLevel은 null이 된다', async () => {
    const { renderer, scene } = await createRenderer();
    const gauge = gaugeContainer(scene);
    renderer.dispose();
    expect(gauge.destroyed).toBe(true);
    expect(renderer.gearGaugeLevel).toBeNull();
  });
});

describe('GameRenderer 고도 계산 — 프레임마다 한 번, 비행 배경과 게이지에 같은 값', () => {
  it('비행 배경과 기어가 모두 있으면 곡 10초 중 5초에서 둘 다 고도 .5를 받고, MISS 뒤 배경은 .26을 받으며 게이지도 .26으로 내려간다', async () => {
    const { renderer } = await createRenderer({ showFlightBackground: true });
    setChart(renderer);
    renderer.renderFrame(5000, 0);
    expect(flight.renders.at(-1)).toEqual([0.5, 0]);
    expect(renderer.gearGaugeLevel).toBe(0.5);
    renderer.recordFlightJudgment(JudgmentGrade.MISS);
    renderer.renderFrame(5000, 0);
    expect(flight.renders.at(-1)).toEqual([0.26, 0]);
    expect(flight.renders).toHaveLength(2);
    for (let frame = 0; frame < 30; frame++) renderer.renderFrame(5000, 16);
    expect(flight.renders.at(-1)![0]).toBeCloseTo(0.26, 12);
    expect(renderer.gearGaugeLevel).toBeCloseTo(0.26, 12);
  });

  it('비행 배경을 끄고 기어만 그려도 게이지는 곡 진행 고도를 따른다(곡 10초 중 2.5초에서 .75)', async () => {
    const { renderer } = await createRenderer({ showFlightBackground: false });
    setChart(renderer);
    renderer.renderFrame(2500, 16);
    expect(renderer.gearGaugeLevel).toBe(0.75);
    expect(flight.renders).toHaveLength(0);
  });

  it('비행 배경도 기어도 없는 렌더러(튜토리얼 재생기)는 고도를 계산하지 않아 회복 판정 뒤에도 고도 상태가 그대로다', async () => {
    const { renderer, scene } = await createRenderer({ showGear: false, showFlightBackground: false });
    setChart(renderer);
    renderer.recordFlightJudgment(JudgmentGrade.MISS);
    renderer.recordFlightJudgment(JudgmentGrade.PERFECT);
    const before = { ...scene.flightAltitudeState };
    renderer.renderFrame(1000, 16);
    expect(scene.flightAltitudeState).toEqual(before);
  });

  it('고도 상태는 프레임마다 새 객체로 바꾸지 않고 같은 객체에 쓴다', async () => {
    const { renderer, scene } = await createRenderer();
    setChart(renderer);
    renderer.recordFlightJudgment(JudgmentGrade.PERFECT);
    const state = scene.flightAltitudeState;
    renderer.renderFrame(1000, 16);
    renderer.renderFrame(1016, 16);
    expect(scene.flightAltitudeState).toBe(state);
    expect(state.offset).toBeGreaterThan(0);
  });
});

describe('GameRenderer 기어 게이지 이징·맞춤', () => {
  it('MISS로 고도가 .76으로 떨어지면 게이지는 16ms 뒤 1과 .76 사이로 다가가고 약 0.4초 뒤 .76에 붙는다', async () => {
    const { renderer } = await createRenderer();
    setChart(renderer, 0);
    renderer.renderFrame(0, 16);
    expect(renderer.gearGaugeLevel).toBe(1);
    renderer.recordFlightJudgment(JudgmentGrade.MISS);
    renderer.renderFrame(0, 16);
    expect(renderer.gearGaugeLevel!).toBeLessThan(1);
    expect(renderer.gearGaugeLevel!).toBeGreaterThan(0.76);
    for (let frame = 0; frame < 27; frame++) renderer.renderFrame(0, 16);
    expect(renderer.gearGaugeLevel).toBeCloseTo(0.76, 12);
  });

  it('setChart 뒤 첫 renderFrame은 곡 중간(10초 중 7초) 시작이어도 가득 찬 데서 내려오지 않고 바로 .3을 보여 준다', async () => {
    const { renderer, scene } = await createRenderer();
    setChart(renderer);
    renderer.renderFrame(0, 16);
    setChart(renderer);
    renderer.renderFrame(7000, 16);
    expect(renderer.gearGaugeLevel).toBeCloseTo(0.3, 12);
    const tube = gaugeContainer(scene).getChildByLabel('gear-gauge-left') as Container;
    expect(tube.getChildByLabel('gear-gauge-body')!.visible).toBe(true);
  });

  it('prepareForPlayback(7000)(곡 시작 전 첫 프레임, 간격 0)도 이징 없이 곡 시작 시각의 고도 .3으로 맞춘다', async () => {
    const { renderer } = await createRenderer();
    setChart(renderer);
    renderer.renderFrame(0, 16);
    renderer.prepareForPlayback(7000);
    expect(renderer.gearGaugeLevel).toBeCloseTo(0.3, 12);
  });

  it('운영체제 prefers-reduced-motion이 reduce여도 MISS 뒤 첫 renderFrame(0, 16)에서 게이지는 바로 .76이 되지 않고 1과 .76 사이로 이징한다(RFD 0030)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { renderer } = await createRenderer();
    setChart(renderer, 0);
    renderer.renderFrame(0, 16);
    renderer.recordFlightJudgment(JudgmentGrade.MISS);
    renderer.renderFrame(0, 16);
    expect(renderer.gearGaugeLevel!).toBeLessThan(1);
    expect(renderer.gearGaugeLevel!).toBeGreaterThan(0.76);
  });

  it('렌더 시간 간격이 0(일시정지 뒤 같은 장)이면 게이지가 다가가지 않는다', async () => {
    const { renderer } = await createRenderer();
    setChart(renderer, 0);
    renderer.renderFrame(0, 16);
    renderer.recordFlightJudgment(JudgmentGrade.MISS);
    renderer.renderFrame(0, 0);
    expect(renderer.gearGaugeLevel).toBe(1);
  });
});

describe('GameRenderer.setAltitudeOverride — Lab 미리보기 고도 고정', () => {
  it('setAltitudeOverride(0.3)이면 곡 진행(10초 중 1초 = .9)과 무관하게 배경과 게이지가 .3을 보여 주고, null이면 다시 고도 모델 .9로 돌아간다', async () => {
    const { renderer, scene } = await createRenderer({ showFlightBackground: true });
    setChart(renderer);
    renderer.renderFrame(1000, 16);
    renderer.setAltitudeOverride(0.3);
    for (let frame = 0; frame < 40; frame++) renderer.renderFrame(1000, 16);
    expect(flight.renders.at(-1)![0]).toBe(0.3);
    expect(renderer.gearGaugeLevel).toBe(0.3);
    const tube = gaugeContainer(scene).getChildByLabel('gear-gauge-left') as Container;
    expect((tube.getChildByLabel('gear-gauge-body')!).height).toBe(gaugeEmptyRows(0.3, 821) - 4);

    renderer.setAltitudeOverride(null);
    for (let frame = 0; frame < 40; frame++) renderer.renderFrame(1000, 16);
    expect(flight.renders.at(-1)![0]).toBeCloseTo(0.9, 12);
    expect(renderer.gearGaugeLevel).toBeCloseTo(0.9, 12);
  });

  it('고정값은 0~1로 자르고 NaN은 0으로 본다(1.4 → 1, NaN → 0)', async () => {
    const { renderer } = await createRenderer({ showFlightBackground: true });
    setChart(renderer);
    renderer.setAltitudeOverride(1.4);
    renderer.renderFrame(5000, 0);
    expect(flight.renders.at(-1)![0]).toBe(1);
    renderer.setAltitudeOverride(Number.NaN);
    renderer.renderFrame(5000, 0);
    expect(flight.renders.at(-1)![0]).toBe(0);
  });
});

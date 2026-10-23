import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Graphics, Texture, TextureSource } from 'pixi.js';
import motionJsonText from '../../../public/gear/gear-motion/gear-motion.json?raw';
import type { GearMotionTextures } from './gearMotion';
import type { GearMotionAssetLease, GearMotionResources } from './gearMotionAssets';
import { GEAR_MOTION_TEXTURE_KEYS, parseGearMotionData } from './gearMotionData';
import type { SkinManager } from '../skin';

// 공유 로더 대신 바로 준비되는 `gearMotion` 에셋 lease를 준다(네트워크·Pixi Assets 없이).
const loader = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('./gearMotionAssets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./gearMotionAssets')>()),
  acquireGearMotionAssets: loader.acquire,
}));

const { GameRenderer } = await import('./GameRenderer');
const { GEAR_GEOMETRY, layoutGear } = await import('./gearLayout');
const { GEAR_BUTTON_GEOMETRY } = await import('./gearButtons');
const { GAME_HEIGHT, GEAR_OFFSET_Y, LANE_AREA_WIDTH } = await import('./constants');

interface Scene {
  app: Application;
  gearLayer: Container;
  keyBeamGraphics: Graphics[];
  buildKeyBeams(): void;
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
  loader.acquire.mockReset();
  loader.acquire.mockImplementation((): GearMotionAssetLease => ({ ready: Promise.resolve(motionResources()), release: vi.fn() }));
});

afterEach(() => {
  for (const renderer of created.splice(0)) (renderer as unknown as Scene).app.stage.destroy({ children: true });
  vi.restoreAllMocks();
});

async function createRenderer({
  showGear = true, gearMotion = false, buttonsTexture = true,
}: { showGear?: boolean; gearMotion?: boolean; buttonsTexture?: boolean } = {}) {
  const gear = new Texture({ source: new TextureSource({ width: 1024, height: 1536 }) });
  const gauge = new Texture({ source: new TextureSource({ width: GEAR_GEOMETRY.gauge.atlasWidth, height: GEAR_GEOMETRY.gauge.atlasHeight }) });
  const buttons = new Texture({ source: new TextureSource({ width: GEAR_BUTTON_GEOMETRY.atlasWidth, height: GEAR_BUTTON_GEOMETRY.atlasHeight }) });
  const textures = new Map<string, Texture>([['gearImage', gear], ['gearGaugeEmpty', gauge], ...(buttonsTexture ? [['gearButtons', buttons] as const] : [])]);
  const requested: string[] = [];
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
    getBodyWidthScale: () => 1,
    hasTexture: () => false,
    getLoadedTextures: () => textures,
    getTexture: (key: string) => {
      requested.push(key);
      const texture = textures.get(key);
      if (!texture) throw new Error(`unknown texture ${key}`);
      return texture;
    },
  } as unknown as SkinManager;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width: 1067, height: GAME_HEIGHT, skinManager, showGear, showFlightBackground: false, gearMotion,
  });
  const scene = renderer as unknown as Scene;
  // GPU 초기화만 생략하고 실제 Container/Sprite와 init을 쓴다. renderFrame은 가짜 GPU 렌더러로 그리기만 건너뛴다.
  vi.spyOn(scene.app, 'init').mockResolvedValue(undefined);
  vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {
    for (let lane = 0; lane < 4; lane++) scene.keyBeamGraphics.push(new Graphics());
  });
  const initSource = vi.fn();
  Object.assign(scene.app, { renderer: { texture: { initSource } } });
  vi.spyOn(scene.app, 'render').mockImplementation(() => {});
  vi.spyOn(scene.app, 'destroy').mockImplementation(() => {});
  created.push(renderer);
  await renderer.init();
  return { renderer, scene, buttons, requested, initSource };
}

const phases = (renderer: InstanceType<typeof GameRenderer>) => renderer.gearButtonStates?.map((state) => state.phase) ?? null;

describe('GameRenderer 기어 버튼 — 배치와 레이어 순서', () => {
  it('gearMotion 켬: 기어 레이어는 [기어, 기어 버튼, gearMotion holder, 게이지] 순서이고 버튼 컨테이너는 기어와 같은 변환(250/552배)이다', async () => {
    const { scene } = await createRenderer({ gearMotion: true });
    expect(scene.gearLayer.children.map((child) => child.label)).toEqual(['gear', 'gear-buttons', 'gear-motion-holder', 'gear-gauge']);
    const layout = layoutGear(GEAR_GEOMETRY, { laneAreaX: (1067 - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT, offsetY: GEAR_OFFSET_Y });
    const container = scene.gearLayer.getChildByLabel('gear-buttons') as Container;
    expect([container.x, container.y]).toEqual([layout.x, layout.y]);
    expect(container.scale.x).toBeCloseTo(250 / 552, 12);
    expect(container.scale.y).toBeCloseTo(250 / 552, 12);
  });

  it('gearMotion 끔이어도 기어 버튼은 기어 바로 위·게이지 아래에 있다([기어, 기어 버튼, 게이지])', async () => {
    const { scene } = await createRenderer({ gearMotion: false });
    expect(scene.gearLayer.children.map((child) => child.label)).toEqual(['gear', 'gear-buttons', 'gear-gauge']);
  });

  it('showGear: false(튜토리얼 재생기)면 기어 버튼을 만들지 않고 gearButtons 텍스처도 찾지 않으며 gearButtonStates는 null, setGearButtonKey는 오류 없이 아무것도 하지 않는다', async () => {
    const { renderer, requested } = await createRenderer({ showGear: false });
    expect(renderer.gearButtonStates).toBeNull();
    expect(requested).not.toContain('gearButtons');
    expect(() => renderer.setGearButtonKey(1, 'KeyQ', true)).not.toThrow();
  });

  it('스킨에 gearButtons 텍스처가 없으면 기어와 게이지만 그리고 gearButtonStates는 null', async () => {
    const { renderer, scene } = await createRenderer({ buttonsTexture: false });
    expect(scene.gearLayer.children.map((child) => child.label)).toEqual(['gear', 'gear-gauge']);
    expect(renderer.gearButtonStates).toBeNull();
  });
});

describe('GameRenderer 기어 버튼 — 입력과 렌더 프레임', () => {
  it('setGearButtonKey(2, KeyD, 누름)는 hold 1개의 연파랑으로 버튼 2를 renderFrame 없이 바로 pressed로 바꾼다', async () => {
    const { renderer } = await createRenderer();
    renderer.setGearButtonKey(2, 'KeyD', true);
    expect(phases(renderer)).toEqual(['idle', 'pressed', 'idle', 'idle']);
    expect(renderer.gearButtonStates![1]).toMatchObject({ color: 'single', heldKeys: 1 });
  });

  it('레인 2에 KeyD·KeyO·KeyC를 누르면 hold 3개로 금색이고 KeyC·KeyO를 떼면 hold 1개로 연파랑이다', async () => {
    const { renderer } = await createRenderer();
    renderer.setGearButtonKey(2, 'KeyD', true);
    renderer.setGearButtonKey(2, 'KeyO', true);
    expect(renderer.gearButtonStates![1]).toMatchObject({ phase: 'pressed', color: 'double', heldKeys: 2 });
    renderer.setGearButtonKey(2, 'KeyC', true);
    renderer.renderFrame(0, 16);
    expect(renderer.gearButtonStates![1]).toMatchObject({ phase: 'pressed', color: 'double', heldKeys: 3 });
    renderer.setGearButtonKey(2, 'KeyC', false);
    expect(renderer.gearButtonStates![1]).toMatchObject({ color: 'double', heldKeys: 2 });
    renderer.setGearButtonKey(2, 'KeyO', false);
    expect(renderer.gearButtonStates![1]).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });

  it('서로 다른 레인 1·4에 키를 하나씩 누르면 각 레인의 hold 1개로 모두 연파랑이다', async () => {
    const { renderer } = await createRenderer();
    renderer.setGearButtonKey(4, 'BracketLeft', true);
    renderer.setGearButtonKey(1, 'KeyQ', true);
    for (const lane of [0, 3]) expect(renderer.gearButtonStates![lane]).toMatchObject({ phase: 'pressed', color: 'single', heldKeys: 1 });
  });

  it('그리기 전에 눌렀다 뗀 버튼은 renderFrame(…, 16)의 렌더 프레임 간격으로만 돌아와 뗀 뒤 첫 프레임 경과 0, 이후 16ms씩 쌓여 150ms에 idle이 된다', async () => {
    const { renderer } = await createRenderer();
    renderer.setGearButtonKey(3, 'KeyP', true);
    renderer.setGearButtonKey(3, 'KeyP', false);
    renderer.renderFrame(0, 16);
    expect(renderer.gearButtonStates![2]).toMatchObject({ phase: 'releasing', releaseMs: 0 });
    renderer.renderFrame(16, 16);
    expect(renderer.gearButtonStates![2].releaseMs).toBe(16);
    for (let frame = 0; frame < 9; frame++) renderer.renderFrame(32 + frame * 16, 16);
    expect(phases(renderer)).toEqual(['idle', 'idle', 'idle', 'idle']);
  });

  it('일시정지처럼 renderFrame을 부르지 않으면 뗀 버튼은 경과 32ms에 멈춰 있다가 다시 부르면 이어서 돌아온다', async () => {
    const { renderer } = await createRenderer();
    renderer.setGearButtonKey(1, 'KeyQ', true);
    renderer.setGearButtonKey(1, 'KeyQ', false);
    for (let frame = 0; frame < 3; frame++) renderer.renderFrame(frame * 16, 16);
    expect(renderer.gearButtonStates![0].releaseMs).toBe(32);
    renderer.renderFrame(48, 16);
    expect(renderer.gearButtonStates![0].releaseMs).toBe(48);
  });

  it('resetTransientState는 키빔을 끄지만 지금 눌린 기어 버튼은 그대로 둔다(차트가 아니라 누르고 있는 키를 보여 줌)', async () => {
    const { renderer, scene } = await createRenderer();
    renderer.setKeyBeam(2, true);
    renderer.setGearButtonKey(2, 'KeyD', true);
    renderer.resetTransientState();
    expect(scene.keyBeamGraphics[1].visible).toBe(false);
    expect(phases(renderer)).toEqual(['idle', 'pressed', 'idle', 'idle']);
  });
});

describe('GameRenderer 기어 버튼 — 곡 시작 전 준비와 정리', () => {
  it('init은 기어 버튼 아틀라스를 GPU 업로드하지 않고, prepareForPlayback(0)이 기어 그림·빈 유리와 함께 한 번 GPU 업로드한다(gearMotion 끔: initSource 3번)', async () => {
    const { renderer, initSource, buttons } = await createRenderer({ gearMotion: false });
    expect(initSource).not.toHaveBeenCalled();
    renderer.prepareForPlayback(0);
    expect(initSource).toHaveBeenCalledTimes(3);
    expect(initSource.mock.calls.filter(([source]) => source === buttons.source)).toHaveLength(1);
  });

  it('곡 시작 전 준비는 기어 버튼 아틀라스를 곡 중 Pixi 자동 GC에서 빼고(autoGarbageCollect false), dispose하면 원래 값(true)으로 돌린다', async () => {
    const { renderer, buttons } = await createRenderer();
    // 불러온 이미지 텍스처처럼 자동 GC 대상으로 둔다.
    buttons.source.autoGarbageCollect = true;
    renderer.prepareForPlayback(0);
    expect(buttons.source.autoGarbageCollect).toBe(false);
    renderer.dispose();
    expect(buttons.source.autoGarbageCollect).toBe(true);
  });

  it('dispose하면 기어 버튼 컨테이너를 정리하고 gearButtonStates는 null이 되며 아틀라스(SkinManager 소유)는 남는다', async () => {
    const { renderer, scene, buttons } = await createRenderer();
    const container = scene.gearLayer.getChildByLabel('gear-buttons') as Container;
    renderer.dispose();
    expect(container.destroyed).toBe(true);
    expect(renderer.gearButtonStates).toBeNull();
    expect(buttons.source.destroyed).toBe(false);
  });
});

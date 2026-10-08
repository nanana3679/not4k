import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Texture, TextureSource } from 'pixi.js';
import motionJsonText from '../../../public/gear/gear-motion/gear-motion.json?raw';
import type { GearMotionTextures } from './gearMotion';
import type { GearMotionAssetLease, GearMotionResources } from './gearMotionAssets';
import { GEAR_MOTION_TEXTURE_KEYS, parseGearMotionData } from './gearMotionData';
import type { SkinManager } from '../skin';

// 공유 로더 대신 바로 준비되는 움직임 자료 임대를 준다(네트워크·Pixi Assets 없이).
const loader = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('./gearMotionAssets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./gearMotionAssets')>()),
  acquireGearMotionAssets: loader.acquire,
}));
vi.mock('./flight/FlightBackground', () => ({
  FlightBackground: class {
    async init() {}
    render() {}
    reset() {}
    dispose() {}
  },
}));

const { GameRenderer } = await import('./GameRenderer');
const { GEAR_GEOMETRY } = await import('./gearLayout');
const { GAME_HEIGHT } = await import('./constants');

interface Scene {
  app: Application;
  gearLayer: Container;
  keyBeamGradient: { texture: Texture; destroy(): void } | null;
  buildKeyBeams(): void;
}

const data = parseGearMotionData(JSON.parse(motionJsonText));
const texture = (width = 16, height = 16) => new Texture({ source: new TextureSource({ width, height }) });

let motionTextures: GearMotionTextures;
const created: InstanceType<typeof GameRenderer>[] = [];

beforeEach(() => {
  motionTextures = Object.fromEntries(GEAR_MOTION_TEXTURE_KEYS.map((key) => {
    const box = data.textures[key];
    return [key, texture(box.width, box.height)];
  })) as GearMotionTextures;
  loader.acquire.mockReset();
  loader.acquire.mockImplementation((): GearMotionAssetLease => ({
    ready: Promise.resolve<GearMotionResources>({ data, textures: motionTextures }),
    release: vi.fn(),
  }));
});

afterEach(() => {
  for (const renderer of created.splice(0)) (renderer as unknown as Scene).app.stage.destroy({ children: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * SkinManager가 불러온 것처럼 보이는 텍스처 묶음. 노트·실패·켜짐·Grace·터미널 idle·봄 16프레임과 기어 그림·빈 유리를 키로 갖는다.
 * 잘라 쓴 캡처럼 두 텍스처가 한 소스를 나눠 쓰는 경우(terminalSingle과 그 위쪽 절반)를 하나 넣는다.
 */
function skinTextures({ heldEffect = true }: { heldEffect?: boolean } = {}) {
  const terminalSingle = texture(200, 40);
  const textures = new Map<string, Texture>([
    ['noteSingle', texture(212, 40)],
    ['noteDoubleFailed', texture(212, 40)],
    ['bodySingleFailed', texture(200, 40)],
    ['bodyDoublePartialFailedLeft', texture(200, 40)],
    ['terminalSingle', terminalSingle],
    ['terminalSingleCap', new Texture({ source: terminalSingle.source })],
    ['terminalSingleIdle', texture(200, 40)],
    ['pointGraceOverlay', texture(236, 64)],
    ['gearImage', texture(1024, 1536)],
    ['gearGaugeEmpty', texture(GEAR_GEOMETRY.gauge.atlasWidth, GEAR_GEOMETRY.gauge.atlasHeight)],
  ]);
  if (heldEffect) textures.set('bodySingleHeld', texture(200, 40));
  for (let i = 0; i < 16; i++) textures.set(`bomb${i}`, texture(120, 120));
  return textures;
}

async function createRenderer({
  showGear = true, gearMotion = true, gearMotionReducedMotion, keyBeams = true, textures = skinTextures(),
}: {
  showGear?: boolean;
  gearMotion?: boolean;
  gearMotionReducedMotion?: 'omit' | 'hide';
  keyBeams?: boolean;
  textures?: Map<string, Texture>;
} = {}) {
  const getLoadedTextures = vi.fn(() => textures);
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
    getBodyWidthScale: () => 1,
    hasTexture: () => false,
    getLoadedTextures,
    getTexture: (key: string) => {
      const found = textures.get(key);
      if (!found) throw new Error(`unknown texture ${key}`);
      return found;
    },
  } as unknown as SkinManager;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width: 1067, height: GAME_HEIGHT, skinManager, showGear, showFlightBackground: false,
    gearMotion, gearMotionReducedMotion,
  });
  const scene = renderer as unknown as Scene;
  // GPU 초기화만 생략하고 실제 Container/Sprite와 init을 쓴다. GPU 업로드(initSource)와 그리기(app.render)는 순서만 기록한다.
  vi.spyOn(scene.app, 'init').mockResolvedValue(undefined);
  // 키빔 그라데이션은 캔버스가 있어야 만들어지므로(노드 테스트에는 없다) 만든 것처럼 텍스처만 둔다.
  const keyBeamTexture = texture(256, 1);
  vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {
    if (keyBeams) scene.keyBeamGradient = { texture: keyBeamTexture, destroy: vi.fn() };
  });
  const calls: (TextureSource | 'render')[] = [];
  const initSource = vi.fn((source: TextureSource) => { calls.push(source); });
  Object.assign(scene.app, { renderer: { texture: { initSource } } });
  vi.spyOn(scene.app, 'render').mockImplementation(() => { calls.push('render'); });
  vi.spyOn(scene.app, 'destroy').mockImplementation(() => {});
  created.push(renderer);
  await renderer.init();
  return { renderer, scene, textures, initSource, calls, keyBeamTexture, getLoadedTextures };
}

/** 업로드한 소스마다 몇 번 올렸는지. */
const uploadCounts = (initSource: ReturnType<typeof vi.fn>) => {
  const counts = new Map<TextureSource, number>();
  for (const [source] of initSource.mock.calls as [TextureSource][]) counts.set(source, (counts.get(source) ?? 0) + 1);
  return counts;
};

describe('GameRenderer.prepareForPlayback — 곡 시작 전 텍스처 업로드와 첫 장', () => {
  it('init은 텍스처를 GPU 업로드하지 않는다(빈 유리·기어 움직임 9장 포함 initSource 0번). GPU 업로드는 곡 시작 전 준비가 한다', async () => {
    const { initSource } = await createRenderer();
    expect(initSource).not.toHaveBeenCalled();
  });

  it('prepareForPlayback(0)은 첫 장을 그리기 전에 스킨 텍스처 소스 전부(봄 16프레임·실패·켜짐·부분 실패·Grace·터미널 idle)와 기어 그림·빈 유리·기어 움직임 9장·키빔 그라데이션을 한 번씩 GPU 업로드한다', async () => {
    const { renderer, textures, initSource, calls, keyBeamTexture } = await createRenderer();
    renderer.prepareForPlayback(0);

    const expected = new Set<TextureSource>([
      ...[...textures.values()].map((t) => t.source),
      ...Object.values(motionTextures).map((t) => t.source),
      keyBeamTexture.source,
    ]);
    const counts = uploadCounts(initSource);
    expect(new Set(counts.keys())).toEqual(expected);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    // 스킨 텍스처 27개 중 소스는 26개(잘라 쓴 캡이 터미널 소스를 나눠 씀) + 움직임 9장 + 키빔 1장 = 36번
    expect(initSource).toHaveBeenCalledTimes(36);
    // 업로드가 모두 끝난 뒤에 곡 시작 시각의 한 장을 한 번 그린다.
    expect(calls.indexOf('render')).toBe(36);
    expect(calls.filter((call) => call === 'render')).toHaveLength(1);
  });

  it('두 텍스처가 한 소스를 나눠 쓰면(잘라 쓴 롱노트 캡과 터미널) 그 소스는 한 번만 GPU 업로드한다', async () => {
    const { renderer, textures, initSource } = await createRenderer();
    renderer.prepareForPlayback(0);
    const shared = textures.get('terminalSingle')!.source;
    expect(textures.get('terminalSingleCap')!.source).toBe(shared);
    expect(uploadCounts(initSource).get(shared)).toBe(1);
  });

  it('업로드 목록은 렌더러가 스스로 모은다: prepareForPlayback(0)이 SkinManager.getLoadedTextures를 한 번 읽는다', async () => {
    const { renderer, getLoadedTextures } = await createRenderer();
    expect(getLoadedTextures).not.toHaveBeenCalled();
    renderer.prepareForPlayback(0);
    expect(getLoadedTextures).toHaveBeenCalledTimes(1);
  });

  it('켜짐 효과 없는 스킨(SkinManager가 켜짐 텍스처를 불러오지 않음)이면 켜짐 텍스처 없이 불러온 것만 GPU 업로드한다', async () => {
    const textures = skinTextures({ heldEffect: false });
    const { renderer, initSource } = await createRenderer({ textures, gearMotion: false, keyBeams: false });
    renderer.prepareForPlayback(0);
    expect(textures.has('bodySingleHeld')).toBe(false);
    // 스킨 텍스처 26개, 소스 25개(캡 공유). 움직임·키빔 없음.
    expect(initSource).toHaveBeenCalledTimes(25);
  });

  it('showGear: false(튜토리얼 재생기)면 기어 그림·빈 유리는 GPU 업로드하지 않고 나머지 스킨 텍스처만 GPU 업로드한 뒤 첫 장을 그린다', async () => {
    const { renderer, textures, initSource, calls } = await createRenderer({ showGear: false, keyBeams: false });
    renderer.prepareForPlayback(0);
    const uploaded = new Set(uploadCounts(initSource).keys());
    expect(uploaded.has(textures.get('gearImage')!.source)).toBe(false);
    expect(uploaded.has(textures.get('gearGaugeEmpty')!.source)).toBe(false);
    expect(uploaded.has(textures.get('bomb15')!.source)).toBe(true);
    // 기어가 없으면 움직임도 없다. 스킨 27개 − 기어 2개 = 25개, 소스 24개.
    expect(initSource).toHaveBeenCalledTimes(24);
    expect(calls.at(-1)).toBe('render');
  });

  it('움직임 줄이기에서 숨겨 둔 기어 움직임(Lab hide)은 그리지 않으므로 움직임 텍스처 9장은 GPU 업로드하지 않는다', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { renderer, initSource } = await createRenderer({ gearMotionReducedMotion: 'hide', keyBeams: false });
    renderer.prepareForPlayback(0);
    const uploaded = new Set(uploadCounts(initSource).keys());
    for (const key of GEAR_MOTION_TEXTURE_KEYS) expect(uploaded.has(motionTextures[key].source), key).toBe(false);
    expect(initSource).toHaveBeenCalledTimes(26);
  });

  it('dispose 뒤에 prepareForPlayback(0)을 부르면 GPU 업로드도 그리기도 하지 않는다(initSource 0번·app.render 0번)', async () => {
    const { renderer, initSource, calls } = await createRenderer();
    renderer.dispose();
    renderer.prepareForPlayback(0);
    expect(initSource).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe('GameRenderer.prepareForPlayback — 곡 중 Pixi 자동 GC 제외(autoGarbageCollect)', () => {
  /** 불러온 이미지처럼 autoGarbageCollect true인 스킨 텍스처 묶음. noteSingle만 처음부터 false다. */
  function gcTextures() {
    const textures = skinTextures();
    for (const t of textures.values()) t.source.autoGarbageCollect = true;
    textures.get('noteSingle')!.source.autoGarbageCollect = false;
    return textures;
  }

  it('prepareForPlayback(0) 뒤에는 GPU 업로드한 소스 36개(스킨·기어·움직임·키빔) 모두 autoGarbageCollect가 false다', async () => {
    for (const t of Object.values(motionTextures)) t.source.autoGarbageCollect = true;
    const { renderer, initSource } = await createRenderer({ textures: gcTextures() });
    renderer.prepareForPlayback(0);
    const uploaded = [...uploadCounts(initSource).keys()];
    expect(uploaded).toHaveLength(36);
    expect(uploaded.filter((source) => source.autoGarbageCollect)).toEqual([]);
  });

  it('dispose하면 원래 값으로 되돌린다: true였던 bomb0·움직임 텍스처는 true, 처음부터 false였던 noteSingle은 false', async () => {
    for (const t of Object.values(motionTextures)) t.source.autoGarbageCollect = true;
    const textures = gcTextures();
    const { renderer } = await createRenderer({ textures });
    renderer.prepareForPlayback(0);
    renderer.dispose();
    expect(textures.get('bomb0')!.source.autoGarbageCollect).toBe(true);
    expect(textures.get('gearImage')!.source.autoGarbageCollect).toBe(true);
    expect(Object.values(motionTextures).every((t) => t.source.autoGarbageCollect)).toBe(true);
    expect(textures.get('noteSingle')!.source.autoGarbageCollect).toBe(false);
  });

  it('prepareForPlayback(0)을 두 번 불러도 dispose하면 처음 값 true로 되돌린다(두 번째 호출이 false를 원래 값으로 기록하지 않는다)', async () => {
    const textures = gcTextures();
    const { renderer } = await createRenderer({ textures });
    renderer.prepareForPlayback(0);
    renderer.prepareForPlayback(0);
    renderer.dispose();
    expect(textures.get('bodySingleFailed')!.source.autoGarbageCollect).toBe(true);
  });

  it('렌더러 dispose 전에 이미 파괴된 소스(스킨이 먼저 해제됨)는 건너뛰고 나머지만 되돌린다', async () => {
    const textures = gcTextures();
    const { renderer } = await createRenderer({ textures });
    renderer.prepareForPlayback(0);
    const destroyed = textures.get('bodySingleFailed')!.source;
    destroyed.destroy();
    renderer.dispose();
    expect(destroyed.destroyed).toBe(true);
    expect(destroyed.autoGarbageCollect).toBe(false);
    expect(textures.get('bomb15')!.source.autoGarbageCollect).toBe(true);
  });

  it('prepareForPlayback 없이 init·dispose만 하면(튜토리얼 재생기·Lab) autoGarbageCollect를 바꾸지 않는다', async () => {
    const textures = gcTextures();
    const { renderer } = await createRenderer({ textures });
    expect(textures.get('bomb0')!.source.autoGarbageCollect).toBe(true);
    renderer.dispose();
    expect(textures.get('bomb0')!.source.autoGarbageCollect).toBe(true);
    expect(textures.get('noteSingle')!.source.autoGarbageCollect).toBe(false);
  });
});

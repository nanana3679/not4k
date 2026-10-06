import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Graphics, Sprite, Text, Texture, TextureSource } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import gameRendererSource from './GameRenderer.ts?raw';
import { CLASSIC_GEAR_GEOMETRY, layoutClassicGear } from './classicGearLayout';
import { GAME_HEIGHT, LANE_AREA_WIDTH, liftPx } from './constants';
import type { SkinManager } from '../skin';

interface Scene {
  app: Application;
  maskGraphic: Graphics;
  judgmentLineGraphic: Graphics;
  gearLayer: Container;
  laneKeyLabelLayer: Container;
  effectLayer: Container;
  uiLayer: Container;
  backgroundLayer: Container;
  comboText: Text;
  accuracyText: Text;
  buildKeyBeams(): void;
}

const gearTexture = () => new Texture({ source: new TextureSource({ width: 1024, height: 1536 }) });
const created: GameRenderer[] = [];

async function createRenderer({ width = 1067, showGear = true }: { width?: number; showGear?: boolean } = {}) {
  const texture = gearTexture();
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
    getBodyWidthScale: () => 1,
    hasTexture: () => false,
    // 버튼 텍스처가 있어도 렌더러는 더 이상 40×40 버튼을 만들지 않아야 한다.
    getTexture: (key: string) => {
      if (key === 'gearImage') return texture;
      if (key.startsWith('button')) return Texture.WHITE;
      throw new Error(`unknown texture ${key}`);
    },
  } as unknown as SkinManager;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width, height: GAME_HEIGHT, skinManager, showGear, showFlightBackground: false,
    // 기어 움직임은 GameRenderer.gearMotion.test.ts에서 따로 본다(여기서는 공유 로더를 부르지 않는다).
    gearMotion: false,
  });
  const scene = renderer as unknown as Scene;
  // GPU 초기화만 생략하고 실제 Container/Sprite/Graphics와 init을 사용한다.
  vi.spyOn(scene.app, 'init').mockResolvedValue(undefined);
  vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {});
  await renderer.init();
  created.push(renderer);
  return { renderer, scene, texture };
}

const stageFor = (width: number) => ({ laneAreaX: (width - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT });
const boundsOf = (graphic: Graphics) => graphic.getLocalBounds();

afterEach(() => {
  for (const renderer of created.splice(0)) (renderer as unknown as Scene).app.stage.destroy({ children: true });
  vi.restoreAllMocks();
});

describe('GameRenderer 새 Classic 기어 (RFD 0029)', () => {
  it('16:9(1067)에서 기어 그림을 250/552배로 줄여 레인 창을 레인 영역 x 408.5~658.5에 겹치고 아래끝을 y 600에 붙인다', async () => {
    const { renderer, scene, texture } = await createRenderer();
    const expected = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(1067));
    expect(renderer.gearLayout).toEqual(expected);
    const [sprite] = scene.gearLayer.children as Sprite[];
    expect(sprite.texture).toBe(texture);
    expect([sprite.x, sprite.y]).toEqual([expected.x, expected.y]);
    expect(sprite.scale.x).toBeCloseTo(250 / 552, 12);
    expect(sprite.scale.y).toBeCloseTo(250 / 552, 12);
    expect(sprite.x + 236 * sprite.scale.x).toBeCloseTo(408.5, 9);
    expect(sprite.y + 1466 * sprite.scale.y).toBeCloseTo(600, 9);
  });

  it('gearLayout은 얼린 객체라 바깥에서 고쳐도 렌더러의 기어 배치가 바뀌지 않는다', async () => {
    const { renderer } = await createRenderer();
    const layout = renderer.gearLayout!;
    expect(Object.isFrozen(layout)).toBe(true);
    expect(() => { (layout as { keyRimY: number }).keyRimY = 0; }).toThrow(TypeError);
    expect(renderer.gearLayout!.keyRimY.toFixed(1)).toBe('446.5');
  });

  it('기어 레이어는 레인 가림막·판정선·레인 키 라벨 위, 키봄·UI 아래에 있다', async () => {
    const { scene } = await createRenderer();
    const order = (child: Container) => scene.app.stage.getChildIndex(child);
    expect(order(scene.gearLayer)).toBeGreaterThan(order(scene.maskGraphic));
    expect(order(scene.gearLayer)).toBeGreaterThan(order(scene.judgmentLineGraphic));
    expect(order(scene.gearLayer)).toBeGreaterThan(order(scene.laneKeyLabelLayer));
    expect(order(scene.gearLayer)).toBeLessThan(order(scene.effectLayer));
    expect(order(scene.gearLayer)).toBeLessThan(order(scene.uiLayer));
  });

  it('레인 가림막은 판정선(y 416)이 아니라 키 윗면 y 446.5부터 화면 아래까지 레인 영역 폭 250을 덮는다', async () => {
    const { renderer, scene } = await createRenderer();
    expect(renderer.judgmentLineY).toBe(416);
    const mask = boundsOf(scene.maskGraphic);
    expect(mask.minY).toBeCloseTo(renderer.gearLayout!.keyRimY, 9);
    expect(mask.minY.toFixed(1)).toBe('446.5');
    expect(mask.maxY).toBe(600);
    expect([mask.minX, mask.maxX]).toEqual([408.5, 658.5]);
  });

  it('판정선은 y 416을 중심으로 두께 2.5(414.75~417.25)로 그린다', async () => {
    const { scene } = await createRenderer();
    const line = boundsOf(scene.judgmentLineGraphic);
    expect([line.minY, line.maxY]).toEqual([414.75, 417.25]);
    expect([line.minX, line.maxX]).toEqual([408.5, 658.5]);
  });

  it('리프트 4%(24)는 판정선·콤보·정확도 글자만 24 올리고 기어와 레인 가림막은 그대로 둔다', async () => {
    const { renderer, scene } = await createRenderer();
    const [gear] = scene.gearLayer.children as Sprite[];
    const gearBefore = [gear.x, gear.y];
    const maskBefore = boundsOf(scene.maskGraphic);
    const comboBefore = scene.comboText.y;
    const accuracyBefore = scene.accuracyText.y;

    renderer.setLift(liftPx(4));

    expect(renderer.judgmentLineY).toBe(392);
    expect(boundsOf(scene.judgmentLineGraphic).minY).toBe(390.75);
    expect(scene.comboText.y).toBe(comboBefore - 24);
    expect(scene.accuracyText.y).toBe(accuracyBefore - 24);
    expect([gear.x, gear.y]).toEqual(gearBefore);
    expect(boundsOf(scene.maskGraphic)).toEqual(maskBefore);
  });

  it('콤보 글자(75px)는 판정선 175 위, 정확도 글자(12.5px)는 112.5 위에 놓인다', async () => {
    const { scene } = await createRenderer();
    expect(scene.comboText.y).toBe(416 - 175);
    expect(scene.accuracyText.y).toBe(416 - 112.5);
    expect(scene.comboText.style.fontSize).toBe(75);
    expect(scene.accuracyText.style.fontSize).toBe(12.5);
  });

  it('스킨에 버튼 텍스처가 있어도 판정선 아래 40×40 버튼 스프라이트를 만들지 않는다(레인 배경 하나뿐)', async () => {
    const { scene } = await createRenderer();
    expect(scene.backgroundLayer.children).toHaveLength(1);
    expect(scene.backgroundLayer.children[0]).toBeInstanceOf(Graphics);
    expect(gameRendererSource).not.toContain('buttonIdle');
    expect(gameRendererSource).not.toContain('buttonSprites');
  });

  it('addGearOverlay는 기어 그림 좌표 레이어를 기어 바로 위에 기어와 같은 위치·배율로 붙이고 배치를 돌려준다', async () => {
    const { renderer, scene } = await createRenderer();
    const overlay = new Container();
    const layout = renderer.addGearOverlay(overlay);
    expect(layout).toBe(renderer.gearLayout);
    expect(overlay.parent).toBe(scene.gearLayer);
    expect(scene.gearLayer.children.at(-1)).toBe(overlay);
    expect([overlay.x, overlay.y, overlay.scale.x, overlay.scale.y]).toEqual([layout!.x, layout!.y, layout!.scale, layout!.scale]);
  });

  it('showGear=false면 기어를 그리지 않고 gearLayout·addGearOverlay는 null이며 가림막은 판정 순간 노트 칸 아래끝(판정선 416 + 노트 반 칸 6.25 = 422.25)부터 덮는다', async () => {
    const { renderer, scene } = await createRenderer({ showGear: false });
    expect(renderer.gearLayout).toBeNull();
    expect(scene.gearLayer.children).toHaveLength(0);
    expect(renderer.addGearOverlay(new Container())).toBeNull();
    expect(boundsOf(scene.maskGraphic).minY).toBe(422.25);
  });

  it('기어가 없는 미니 렌더러는 리프트 4%면 가림막도 판정선을 따라 24 올라가 398.25부터 덮는다', async () => {
    const { renderer, scene } = await createRenderer({ showGear: false });
    renderer.setLift(liftPx(4));
    expect(boundsOf(scene.maskGraphic).minY).toBe(398.25);
  });

  it('G 키 기어 조정 모드와 기둥 게이지는 없다', () => {
    expect(gameRendererSource).not.toContain('KeyG');
    expect(gameRendererSource).not.toContain('setAdjustModeCallback');
    expect(gameRendererSource).not.toContain('gearGauge');
    expect(gameRendererSource).not.toContain('RenderTexture');
  });
});

describe('GameRenderer 키보드 표시 배치', () => {
  const TKL = new Map([['KeyD', 1], ['KeyF', 2], ['KeyJ', 3], ['KeyK', 4]]);
  const NUMPAD = new Map([['KeyD', 1], ['KeyF', 2], ['Numpad4', 3], ['Numpad5', 4]]);
  const keyboardOf = (scene: Scene) => scene.uiLayer.children.find(child => child.label === 'keyboard-display')!;

  it('16:9(1067)에서 TKL 키보드는 원래 크기로 오른쪽 아래(x 859.5, y 524.5)에 놓인다', async () => {
    const { renderer, scene } = await createRenderer();
    renderer.setupKeyboardDisplay(TKL);
    const keyboard = keyboardOf(scene);
    expect([keyboard.x, keyboard.y, keyboard.scale.x, keyboard.visible]).toEqual([859.5, 524.5, 1, true]);
  });

  it('4:3(800)에서 넘버패드 키보드는 기어 실루엣 오른쪽(624.6 + 8)에 맞춰 0.646배로 줄인다', async () => {
    const { renderer, scene } = await createRenderer({ width: 800 });
    renderer.setupKeyboardDisplay(NUMPAD);
    const keyboard = keyboardOf(scene);
    expect(keyboard.scale.x).toBeCloseTo(0.646, 3);
    expect(keyboard.x).toBeCloseTo(renderer.gearLayout!.silhouetteRightX + 8, 9);
  });

  it('기어가 없으면 레인 영역 오른쪽 끝(4:3에서 525) + 8을 피해 배치한다', async () => {
    const { renderer, scene } = await createRenderer({ width: 800, showGear: false });
    renderer.setupKeyboardDisplay(NUMPAD);
    expect(keyboardOf(scene).x).toBeCloseTo(800 - 4 - 253, 9);
  });

  it('키보드 표시를 다시 만들면 이전 컨테이너를 정리해 하나만 남긴다', async () => {
    const { renderer, scene } = await createRenderer();
    renderer.setupKeyboardDisplay(TKL);
    const first = keyboardOf(scene);
    renderer.setupKeyboardDisplay(NUMPAD);
    expect(first.destroyed).toBe(true);
    expect(scene.uiLayer.children.filter(child => child.label === 'keyboard-display')).toHaveLength(1);
  });
});

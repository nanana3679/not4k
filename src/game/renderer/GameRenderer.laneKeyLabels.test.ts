import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application, Container } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import gameRendererSource from './GameRenderer.ts?raw';
import type { SkinManager } from '../skin';

interface Scene {
  app: Application;
  laneContentLayer: Container;
  laneKeyLabelLayer: Container;
  effectLayer: Container;
  buildKeyBeams(): void;
}

const created: Scene[] = [];

/** 튜토리얼 재생기와 같은 옵션(기어 없음·레인 키 라벨 켬)의 실제 장면. GPU 초기화와 키빔만 생략한다. */
async function createTutorialRenderer(): Promise<Scene> {
  const skinManager = {
    getTheme: () => ({ bg: 0, beamColor: 0xffffff }),
    getBodyWidthScale: () => 1,
    hasTexture: () => false,
    getTexture: (key: string) => { throw new Error(`unknown texture ${key}`); },
  } as unknown as SkinManager;
  const renderer = new GameRenderer({
    canvas: {} as HTMLCanvasElement, width: 250, height: 225, judgmentLineOffset: 50, skinManager,
    showGear: false, showFlightBackground: false, showComboAndAccuracy: false, showLaneKeyLabels: true,
  });
  const scene = renderer as unknown as Scene;
  vi.spyOn(scene.app, 'init').mockResolvedValue(undefined);
  vi.spyOn(scene, 'buildKeyBeams').mockImplementation(() => {});
  await renderer.init();
  created.push(scene);
  return scene;
}

afterEach(() => {
  for (const scene of created.splice(0)) scene.app.stage.destroy({ children: true });
  vi.restoreAllMocks();
});

describe('GameRenderer 레인 키 라벨', () => {
  it('showLaneKeyLabels 기본값은 false라 플레이 화면에 라벨을 그리지 않음', () => {
    expect(gameRendererSource).toContain('showLaneKeyLabels?: boolean');
    expect(gameRendererSource).toContain('this.showLaneKeyLabels = options.showLaneKeyLabels ?? false');
  });

  it('showLaneKeyLabels=true일 때만 buildLaneKeyLabels를 조건부 호출', () => {
    expect(gameRendererSource).toContain('if (this.showLaneKeyLabels)');
    expect(gameRendererSource).toContain('this.buildLaneKeyLabels()');
  });

  it('튜토리얼 재생기 장면에서 laneKeyLabelLayer는 stage의 직접 자식으로 laneContentLayer(레인 끝 클립) 위·effectLayer(bomb) 아래에 있어 레인 끝 아래 밴드에서 잘리지 않고 bomb엔 가림', async () => {
    const scene = await createTutorialRenderer();
    const stage = scene.app.stage;
    expect(scene.laneKeyLabelLayer.parent).toBe(stage);
    expect(scene.laneKeyLabelLayer.children.length).toBeGreaterThan(0);
    expect(stage.getChildIndex(scene.laneKeyLabelLayer)).toBeGreaterThan(stage.getChildIndex(scene.laneContentLayer));
    expect(stage.getChildIndex(scene.laneKeyLabelLayer)).toBeLessThan(stage.getChildIndex(scene.effectLayer));
  });

  it('drawLaneKeyCap은 dispose로 파괴된 키캡 Graphics에 clear()를 부르지 않도록 destroyed를 먼저 확인', () => {
    expect(gameRendererSource).toContain('if (entry.cap.destroyed) return');
  });

  it('setLaneKeyLabels는 visible 인자로 laneKeyLabelLayer 표시 여부를 제어', () => {
    expect(gameRendererSource).toContain('setLaneKeyLabels(');
    expect(gameRendererSource).toContain('this.laneKeyLabelLayer.visible = visible');
  });

  it('setKeyBeam은 키빔과 함께 라벨 키캡 눌림 상태를 갱신', () => {
    expect(gameRendererSource).toContain('entry.pressed = pressed');
    expect(gameRendererSource).toContain('this.drawLaneKeyCap(entry, pressed)');
  });

  it('setKeyBeam은 눌림 상태가 실제로 바뀔 때만 다시 그려 매 프레임 재구성을 피함', () => {
    expect(gameRendererSource).toContain('if (entry.pressed !== pressed)');
  });

  it('dispose는 laneKeyLabels 배열을 비워 파괴된 Pixi 객체 참조를 남기지 않음', () => {
    expect(gameRendererSource).toContain('this.laneKeyLabels = []');
  });
});

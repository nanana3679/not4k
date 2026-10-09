import { describe, expect, it } from 'vitest';
import gameRendererSource from './GameRenderer.ts?raw';

describe('GameRenderer 레인 키 라벨', () => {
  it('showLaneKeyLabels 기본값은 false라 플레이 화면에 라벨을 그리지 않음', () => {
    expect(gameRendererSource).toContain('showLaneKeyLabels?: boolean');
    expect(gameRendererSource).toContain('this.showLaneKeyLabels = options.showLaneKeyLabels ?? false');
  });

  it('showLaneKeyLabels=true일 때만 buildLaneKeyLabels를 조건부 호출', () => {
    expect(gameRendererSource).toContain('if (this.showLaneKeyLabels)');
    expect(gameRendererSource).toContain('this.buildLaneKeyLabels()');
  });

  it('laneKeyLabelLayer는 laneContentLayer(레인 끝 클립)와 별개로 그 위·effectLayer(bomb)보다 아래에 stage에 addChild 되어 레인 끝 아래 밴드에서 잘리지 않고 bomb엔 가림', () => {
    const laneContentIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.laneContentLayer)');
    const labelLayerIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.laneKeyLabelLayer)');
    const effectIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.effectLayer)');
    expect(laneContentIndex).toBeGreaterThan(-1);
    expect(labelLayerIndex).toBeGreaterThan(-1);
    expect(effectIndex).toBeGreaterThan(-1);
    expect(labelLayerIndex).toBeGreaterThan(laneContentIndex);
    expect(labelLayerIndex).toBeLessThan(effectIndex);
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

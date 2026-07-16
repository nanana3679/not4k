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

  it('laneKeyLabelLayer는 마스크보다 위·effectLayer(bomb)보다 아래에 addChild 되어 마스크엔 안 가리고 bomb엔 가림', () => {
    const maskIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.maskGraphic)');
    const labelLayerIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.laneKeyLabelLayer)');
    const effectIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.effectLayer)');
    expect(maskIndex).toBeGreaterThan(-1);
    expect(labelLayerIndex).toBeGreaterThan(-1);
    expect(effectIndex).toBeGreaterThan(-1);
    expect(labelLayerIndex).toBeGreaterThan(maskIndex);
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

  it('dispose는 laneKeyLabels 배열을 비워 파괴된 Pixi 객체 참조를 남기지 않음', () => {
    expect(gameRendererSource).toContain('this.laneKeyLabels = []');
  });
});

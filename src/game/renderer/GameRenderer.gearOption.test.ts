import { describe, expect, it } from 'vitest';
import gameRendererSource from './GameRenderer.ts?raw';

describe('GameRenderer optional chrome', () => {
  it('showGear 옵션은 기본값 true로 기존 플레이 화면 기어를 유지', () => {
    expect(gameRendererSource).toContain('showGear?: boolean');
    expect(gameRendererSource).toContain('this.showGear = options.showGear ?? true');
    // #231 이전 이름(showGearFrame·스킨 키 gearFrame)은 남아 있지 않다.
    expect(gameRendererSource).not.toContain('showGearFrame');
    expect(gameRendererSource).toContain('const GEAR_IMAGE_KEY = "gearImage"');
    expect(gameRendererSource).toContain('getTexture(GEAR_IMAGE_KEY)');
    expect(gameRendererSource).not.toContain('"gearFrame"');
  });

  it('showFlightBackground 옵션은 기본값 true로 기존 플레이 화면 배경을 유지', () => {
    expect(gameRendererSource).toContain('showFlightBackground?: boolean');
    expect(gameRendererSource).toContain('this.showFlightBackground = options.showFlightBackground ?? true');
  });

  it('showComboAndAccuracy 옵션은 기본값 true로 기존 플레이 화면 HUD를 유지', () => {
    expect(gameRendererSource).toContain('showComboAndAccuracy?: boolean');
    expect(gameRendererSource).toContain('this.showComboAndAccuracy = options.showComboAndAccuracy ?? true');
    expect(gameRendererSource).toContain('this.comboText.visible = this.showComboAndAccuracy');
    expect(gameRendererSource).toContain('this.accuracyText.visible = this.showComboAndAccuracy');
  });

  it('judgmentLineOffset 옵션은 기본 판정선 위치를 유지하면서 미니 렌더러만 아래로 내릴 수 있음', () => {
    expect(gameRendererSource).toContain('judgmentLineOffset?: number');
    expect(gameRendererSource).toContain('this.judgmentLineOffset = options.judgmentLineOffset ?? JUDGMENT_LINE_OFFSET');
    expect(gameRendererSource).toContain('this.baseJudgmentLineY = options.height - this.judgmentLineOffset + this.gearDrop');
    expect(gameRendererSource).toContain('this._judgmentLineY = this.baseJudgmentLineY - y');
  });

  it('gearDrop 옵션은 기본이 게임 값 GEAR_DROP이고 기어를 그릴 때만 clampGearDrop(0 이상)으로 받아 기어 배치와 판정선 기본 위치에 함께 더한다', () => {
    expect(gameRendererSource).toContain('gearDrop?: number');
    expect(gameRendererSource).toContain('this.gearDrop = this.showGear ? clampGearDrop(options.gearDrop ?? GEAR_DROP) : 0');
    expect(gameRendererSource).toContain('drop: this.gearDrop');
  });

  it('showGear=false이면 buildGear 호출을 건너뛰도록 조건부 실행', () => {
    expect(gameRendererSource).toContain('if (this.showGear)');
    expect(gameRendererSource).toContain('this.buildGear()');
  });

  it('showFlightBackground=false이면 비행 배경을 만들지 않고, renderFrame은 프레임마다 한 번 계산한 고도를 있는 비행 배경·기어 게이지에만 준다', () => {
    expect(gameRendererSource).toContain('if (this.showFlightBackground)');
    expect(gameRendererSource).toContain('if (this.flightBackground || this.gearGauge)');
    expect(gameRendererSource).toContain('const altitude = this.advanceFlightAltitude(songTimeMs, deltaMs)');
    expect(gameRendererSource).toContain('this.flightBackground?.render(altitude, deltaMs)');
    expect(gameRendererSource).toContain('this.gearGauge?.update(altitude, deltaMs)');
  });

  it('렌더링은 Pixi auto ticker가 아니라 외부 renderFrame 루프에서 한 번만 수행', () => {
    expect(gameRendererSource).toContain('autoStart: false');
    expect(gameRendererSource).toContain('this.app.render();');
  });


});

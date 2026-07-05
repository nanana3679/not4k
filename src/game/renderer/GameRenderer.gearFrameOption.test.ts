import { describe, expect, it } from 'vitest';
import gameRendererSource from './GameRenderer.ts?raw';

describe('GameRenderer optional chrome', () => {
  it('showGearFrame 옵션은 기본값 true로 기존 플레이 화면 기어를 유지', () => {
    expect(gameRendererSource).toContain('showGearFrame?: boolean');
    expect(gameRendererSource).toContain('this.showGearFrame = options.showGearFrame ?? true');
  });

  it('showPerspectiveSurface 옵션은 기본값 true로 기존 플레이 화면 배경을 유지', () => {
    expect(gameRendererSource).toContain('showPerspectiveSurface?: boolean');
    expect(gameRendererSource).toContain('this.showPerspectiveSurface = options.showPerspectiveSurface ?? true');
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
    expect(gameRendererSource).toContain('this._judgmentLineY = options.height - this.judgmentLineOffset');
    expect(gameRendererSource).toContain('this._judgmentLineY = this.height - this.judgmentLineOffset - y');
  });

  it('showGearFrame=false이면 buildGearFrame 호출을 건너뛰도록 조건부 실행', () => {
    expect(gameRendererSource).toContain('if (this.showGearFrame)');
    expect(gameRendererSource).toContain('this.buildGearFrame()');
  });

  it('showPerspectiveSurface=false이면 renderFrame에서 원근 배경 렌더를 건너뜀', () => {
    expect(gameRendererSource).toContain('if (this.showPerspectiveSurface)');
    expect(gameRendererSource).toContain('this.renderPerspectiveSurface(songTimeMs, deltaMs)');
  });

  it('dispose는 SkinManager 소유 텍스처를 파괴하지 않아 다른 미니 렌더러가 같은 스킨을 계속 사용할 수 있음', () => {
    expect(gameRendererSource).toContain('this.app.destroy(true, { children: true, texture: false })');
  });

  it('렌더링은 Pixi auto ticker가 아니라 외부 renderFrame 루프에서 한 번만 수행', () => {
    expect(gameRendererSource).toContain('autoStart: false');
    expect(gameRendererSource).toContain('this.app.render();');
  });
});

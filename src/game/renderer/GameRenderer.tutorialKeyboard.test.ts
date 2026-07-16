import { describe, expect, it } from 'vitest';
import gameRendererSource from './GameRenderer.ts?raw';
import { TUTORIAL_KB_SIDE_PAD, TUTORIAL_KB_VPAD } from './constants';

describe('GameRenderer 튜토리얼 키보드 strip', () => {
  it('키보드 strip 공유 상수는 좌우 12px·상하 10px 패딩', () => {
    expect(TUTORIAL_KB_SIDE_PAD).toBe(12);
    expect(TUTORIAL_KB_VPAD).toBe(10);
  });

  it('keyboardAreaHeight 옵션 기본값은 0이라 플레이 화면 캔버스 높이가 바뀌지 않음', () => {
    expect(gameRendererSource).toContain('keyboardAreaHeight?: number');
    expect(gameRendererSource).toContain('this.keyboardAreaHeight = options.keyboardAreaHeight ?? 0');
  });

  it('app.init 캔버스 높이는 플레이 영역 높이에 keyboardAreaHeight를 더한 값', () => {
    expect(gameRendererSource).toContain('height: this.height + this.keyboardAreaHeight,');
  });

  it('tutorialKeyboard 스펙 옵션이 있을 때만 buildTutorialKeyboard를 조건부 호출', () => {
    expect(gameRendererSource).toContain('tutorialKeyboard?: TutorialKeyboardSpec');
    expect(gameRendererSource).toContain('this.tutorialKeyboardSpec = options.tutorialKeyboard ?? null');
    expect(gameRendererSource).toContain('if (this.tutorialKeyboardSpec) {');
    expect(gameRendererSource).toContain('this.buildTutorialKeyboard();');
  });

  it('키보드 strip은 y=this.height 아래 별도 영역에 그려 판정선 지오메트리를 건드리지 않음', () => {
    expect(gameRendererSource).toContain('const boardY = this.height + TUTORIAL_KB_VPAD');
    expect(gameRendererSource).toContain('const boardX = this.laneAreaX + TUTORIAL_KB_SIDE_PAD');
  });

  it('tutorialKeyboardLayer는 laneKeyLabelLayer 다음·uiLayer보다 앞에 addChild', () => {
    const labelLayerIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.laneKeyLabelLayer)');
    const kbLayerIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.tutorialKeyboardLayer)');
    const uiLayerIndex = gameRendererSource.indexOf('this.app.stage.addChild(this.uiLayer)');
    expect(labelLayerIndex).toBeGreaterThan(-1);
    expect(kbLayerIndex).toBeGreaterThan(labelLayerIndex);
    expect(kbLayerIndex).toBeLessThan(uiLayerIndex);
  });

  it('setKeyState는 tutorialKeyboardKeyByCode에서 키를 찾아 매핑된 키만 눌림을 다시 그림', () => {
    expect(gameRendererSource).toContain('this.tutorialKeyboardKeyByCode.get(keyCode)');
    expect(gameRendererSource).toContain('if (kbEntry && kbEntry.mapped) {');
    expect(gameRendererSource).toContain('kbEntry.pressed = pressed;');
    expect(gameRendererSource).toContain('this.drawTutorialKey(kbEntry, pressed);');
  });

  it('drawTutorialKey는 dispose로 파괴된 키캡 Graphics에 clear()를 부르지 않도록 destroyed를 먼저 확인', () => {
    // laneKeyLabels의 drawLaneKeyCap에도 같은 가드가 있어 소스 전체에 2회 이상 존재해야 한다
    const occurrences = gameRendererSource.split('if (entry.cap.destroyed) return').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('dispose는 tutorialKeyboardKeys 배열과 code 맵을 비워 파괴된 Pixi 객체 참조를 남기지 않음', () => {
    expect(gameRendererSource).toContain('this.tutorialKeyboardKeys = []');
    expect(gameRendererSource).toContain('this.tutorialKeyboardKeyByCode = new Map()');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { GameRenderer } from './GameRenderer';

// GameRenderer는 WebGL 없이 생성·init할 수 없어, 프로토타입 메서드를 실제 필드 모양의 가짜 상태에 적용한다.

function createFakeCap() {
  return {
    destroyed: false,
    x: 0,
    y: 0,
    alpha: 1,
    clear: vi.fn().mockReturnThis(),
    roundRect: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
  };
}

function createFakeText(text: string) {
  return { text, alpha: 1, x: 0, y: 0, style: { fill: 0 } };
}

function createKeyboardKeyEntry(code: string, options: { label: string; mapped: boolean; pressed: boolean }) {
  return {
    code,
    cap: createFakeCap(),
    text: createFakeText(options.label),
    mapped: options.mapped,
    pressed: options.pressed,
    baseX: 10,
    baseY: 400,
    kw: 20,
    kh: 18,
  };
}

function createReusableRenderer(fields: Record<string, unknown>): GameRenderer {
  const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
  Object.assign(renderer, {
    initialized: true,
    _judgmentLineY: 280,
    judgmentLineOffset: 80,
    keyBeamGraphics: [],
    buttonSprites: [],
    laneKeyLabels: [],
    tutorialKeyboardKeys: [],
    tutorialKeyboardKeyByCode: new Map(),
    ...fields,
  });
  return renderer;
}

describe('GameRenderer 튜토리얼 프리뷰 재사용', () => {
  it('resetTransientState는 재생 중인 봄 2개를 effectLayer에서 떼어 파괴하고 판정 UI·키빔·레인 키캡·키보드 눌림·이벤트 문구·body 조회를 초기화한다', () => {
    const effectLayer = new Container();
    const bombs = [new Container(), new Container()];
    effectLayer.addChild(...bombs);
    const judgmentUI = { reset: vi.fn() };
    const keyBeamGraphics = [{ visible: true }, { visible: false }, { visible: true }, { visible: true }];
    const laneKeyLabel = { cap: createFakeCap(), text: createFakeText('Q'), lane: 1, label: 'Q', empty: false, pressed: true };
    const pressedKey = createKeyboardKeyEntry('KeyQ', { label: 'Q', mapped: true, pressed: true });
    pressedKey.cap.y = pressedKey.baseY + 3;
    const eventMessageText = { text: '왼손을 올려두세요' };
    const noteRenderer = { setJudgmentBodyStateQuery: vi.fn() };
    const renderer = createReusableRenderer({
      effectLayer,
      judgmentUI,
      keyBeamGraphics,
      laneKeyLabels: [laneKeyLabel],
      tutorialKeyboardKeys: [pressedKey],
      tutorialKeyboardKeyByCode: new Map([['KeyQ', pressedKey]]),
      eventMessageText,
      noteRenderer,
    });

    renderer.resetTransientState();

    expect(effectLayer.children).toHaveLength(0);
    expect(bombs.every((bomb) => bomb.destroyed)).toBe(true);
    expect(judgmentUI.reset).toHaveBeenCalledOnce();
    expect(keyBeamGraphics.every((beam) => !beam.visible)).toBe(true);
    expect(laneKeyLabel.pressed).toBe(false);
    expect(pressedKey.pressed).toBe(false);
    expect(pressedKey.cap.y).toBe(pressedKey.baseY);
    expect(eventMessageText.text).toBe('');
    expect(noteRenderer.setJudgmentBodyStateQuery).toHaveBeenCalledWith(null);
  });

  it('init이 끝나기 전 resetTransientState는 아직 없는 판정 UI·노트 렌더러에 접근하지 않는다', () => {
    const renderer = createReusableRenderer({ initialized: false });

    expect(() => renderer.resetTransientState()).not.toThrow();
  });

  it('updateTutorialKeyboardKeys는 키캡 배치를 다시 만들지 않고 코드가 같은 키의 라벨·매핑만 바꾸며 눌림을 해제한다', () => {
    const keyQ = createKeyboardKeyEntry('KeyQ', { label: 'Q', mapped: true, pressed: true });
    const keyA = createKeyboardKeyEntry('KeyA', { label: 'A', mapped: false, pressed: false });
    const keys = [keyQ, keyA];
    const keyByCode = new Map([['KeyQ', keyQ], ['KeyA', keyA]]);
    const renderer = createReusableRenderer({ tutorialKeyboardKeys: keys, tutorialKeyboardKeyByCode: keyByCode });

    renderer.updateTutorialKeyboardKeys([
      { code: 'KeyQ', label: 'Q', mapped: false },
      { code: 'KeyA', label: 'A', mapped: true },
      { code: 'KeyZ', label: 'Z', mapped: true },
    ]);

    const state = renderer as unknown as { tutorialKeyboardKeys: unknown; tutorialKeyboardKeyByCode: Map<string, unknown> };
    expect(state.tutorialKeyboardKeys).toBe(keys);
    expect(state.tutorialKeyboardKeyByCode).toBe(keyByCode);
    expect(keyByCode.get('KeyQ')).toBe(keyQ);
    expect(keyByCode.has('KeyZ')).toBe(false);
    expect(keyQ).toMatchObject({ mapped: false, pressed: false });
    expect(keyQ.cap.y).toBe(keyQ.baseY);
    expect(keyA).toMatchObject({ mapped: true, pressed: false });
    expect(keyA.text.text).toBe('A');
    expect(keyA.cap.clear).toHaveBeenCalled();
  });

  it('updateTutorialKeyboardKeys로 라벨이 바뀐 키는 키캡 텍스트도 새 라벨로 그린다', () => {
    const key = createKeyboardKeyEntry('Numpad7', { label: '7', mapped: false, pressed: false });
    const renderer = createReusableRenderer({
      tutorialKeyboardKeys: [key],
      tutorialKeyboardKeyByCode: new Map([['Numpad7', key]]),
    });

    renderer.updateTutorialKeyboardKeys([{ code: 'Numpad7', label: 'N7', mapped: true }]);

    expect(key.text.text).toBe('N7');
  });
});

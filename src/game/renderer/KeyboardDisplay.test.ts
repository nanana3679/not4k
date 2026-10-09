import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_DISPLAY_MARGIN,
  KEYBOARD_DISPLAY_MIN_SCALE,
  KEYBOARD_DISPLAY_STYLE,
  KeyboardDisplay,
  keyboardDisplaySize,
  placeKeyboardDisplay,
} from './KeyboardDisplay';
import { GEAR_GEOMETRY, GEAR_CLEARANCE, layoutGear } from './gearLayout';
import { GAME_HEIGHT, LANE_AREA_WIDTH } from './constants';

/** 화면 논리 폭 width에서 기어 실루엣 오른쪽 끝 + 여백(키보드가 쓸 수 있는 왼쪽 경계). */
function gearFreeLeft(width: number): number {
  const layout = layoutGear(GEAR_GEOMETRY, {
    laneAreaX: (width - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT,
  });
  return layout.silhouetteRightX + GEAR_CLEARANCE;
}
const area = (width: number) => ({ width, height: GAME_HEIGHT, freeLeft: gearFreeLeft(width) });
const TKL = keyboardDisplaySize(false);
const NUMPAD = keyboardDisplaySize(true);

const bindings = (entries: [string, number][]) => new Map(entries);
const TKL_BINDINGS = bindings([['KeyD', 1], ['KeyF', 2], ['KeyJ', 3], ['KeyK', 4]]);
const NUMPAD_BINDINGS = bindings([['KeyD', 1], ['KeyF', 2], ['Numpad4', 3], ['Numpad5', 4]]);

describe('키보드 표시 크기', () => {
  it('TKL은 18.5×6.5 키 단위(1단위 11)라 203.5×71.5, 넘버패드를 붙이면 폭 253', () => {
    expect(TKL).toEqual({ width: 203.5, height: 71.5 });
    expect(NUMPAD).toEqual({ width: 253, height: 71.5 });
  });
});

describe('placeKeyboardDisplay — 기어 오른쪽 빈 곳에 맞추거나 숨긴다', () => {
  it('최소 배율은 0.6, 화면 가장자리 여백은 4', () => {
    expect(KEYBOARD_DISPLAY_MIN_SCALE).toBe(0.6);
    expect(KEYBOARD_DISPLAY_MARGIN).toBe(4);
  });

  it('16:9(1067)에서 TKL은 원래 크기로 오른쪽 아래 x 859.5, y 524.5에 놓는다', () => {
    expect(placeKeyboardDisplay(TKL, area(1067))).toEqual({ visible: true, scale: 1, x: 859.5, y: 524.5 });
  });

  it('16:9(1067)에서 넘버패드도 원래 크기로 들어간다(x 810)', () => {
    expect(placeKeyboardDisplay(NUMPAD, area(1067))).toEqual({ visible: true, scale: 1, x: 810, y: 524.5 });
  });

  it('16:10(960)에서 TKL은 원래 크기, 넘버패드는 빈 폭 243.4에 맞춰 0.962배로 줄여 기어 여백에 붙는다', () => {
    expect(placeKeyboardDisplay(TKL, area(960)).scale).toBe(1);
    const placement = placeKeyboardDisplay(NUMPAD, area(960));
    expect(placement.visible).toBe(true);
    expect(placement.scale).toBeCloseTo(0.962, 3);
    expect(placement.x).toBeCloseTo(gearFreeLeft(960), 9);
    expect(placement.x + NUMPAD.width * placement.scale).toBeCloseTo(960 - 4, 9);
    expect(placement.y + NUMPAD.height * placement.scale).toBeCloseTo(600 - 4, 9);
  });

  it('4:3(800)에서 TKL은 0.803배, 넘버패드는 0.646배로 줄여 보인다', () => {
    expect(placeKeyboardDisplay(TKL, area(800)).scale).toBeCloseTo(0.803, 3);
    const numpad = placeKeyboardDisplay(NUMPAD, area(800));
    expect(numpad.visible).toBe(true);
    expect(numpad.scale).toBeCloseTo(0.646, 3);
  });

  it('5:4(750)에서 넘버패드는 0.547배가 필요해 최소 0.6보다 작으므로 숨기고, TKL은 0.680배로 보인다', () => {
    const numpad = placeKeyboardDisplay(NUMPAD, area(750));
    expect(numpad.visible).toBe(false);
    expect(placeKeyboardDisplay(TKL, area(750))).toMatchObject({ visible: true });
    expect(placeKeyboardDisplay(TKL, area(750)).scale).toBeCloseTo(0.680, 3);
  });

  it('필요한 배율이 정확히 0.6이면(소수 오차 포함) 보이고 0.59면 숨긴다', () => {
    const at = (scale: number) => placeKeyboardDisplay(TKL, { width: 1000, height: 600, freeLeft: 1000 - 4 - TKL.width * scale });
    expect(at(0.6).visible).toBe(true);
    expect(at(0.6).scale).toBeCloseTo(0.6, 12);
    expect(at(0.59).visible).toBe(false);
  });

  it('최소 논리 폭 466에서는 빈 폭이 음수(−3.6)라 배율을 음수 대신 0으로 묶고 숨긴다', () => {
    const placement = placeKeyboardDisplay(TKL, area(466));
    expect(placement.visible).toBe(false);
    expect(placement.scale).toBe(0);
    expect(placement.x).toBe(466 - 4);
  });
});

describe('KeyboardDisplay', () => {
  function setUp(laneBindings = TKL_BINDINGS, width = 1067) {
    const parent = new Container();
    const display = new KeyboardDisplay(parent);
    display.setup(laneBindings, area(width));
    return { parent, display };
  }

  it('플레이 영역(높이 600) 오른쪽 아래에 배치 결과대로 놓고 키보드 전체 투명도 KEYBOARD_DISPLAY_STYLE.alpha(0.85)로 그린다', () => {
    const { parent, display } = setUp();
    expect(parent.children).toContain(display.container);
    expect(display.placement).toEqual({ visible: true, scale: 1, x: 859.5, y: 524.5 });
    expect([display.container.x, display.container.y, display.container.scale.x, display.container.scale.y]).toEqual([859.5, 524.5, 1, 1]);
    expect(display.container.visible).toBe(true);
    expect(KEYBOARD_DISPLAY_STYLE.alpha).toBe(0.85);
    expect(display.container.alpha).toBe(KEYBOARD_DISPLAY_STYLE.alpha);
  });

  it('넘버패드 키가 바인딩에 있으면 넘버패드까지 그리고, 4:3에서는 0.646배로 줄인다', () => {
    const { display } = setUp(NUMPAD_BINDINGS, 800);
    expect(display.placement.scale).toBeCloseTo(0.646, 3);
    expect(display.container.scale.x).toBeCloseTo(0.646, 3);
  });

  it('5:4 넘버패드처럼 최소 배율보다 작아야 하면 컨테이너를 숨긴다', () => {
    const { display } = setUp(NUMPAD_BINDINGS, 750);
    expect(display.container.visible).toBe(false);
  });

  it('바인딩된 키를 누르면 그 키의 눌림 그림만 켜고 Graphics를 새로 만들거나 다시 그리지 않는다', () => {
    const { display } = setUp();
    const before = [...display.container.children] as Graphics[];
    const contexts = before.map((graphic) => graphic.context);
    const visibleBefore = before.map((graphic) => graphic.visible);

    display.setKeyState('KeyD', true);

    const after = display.container.children as Graphics[];
    expect(after).toEqual(before);
    expect(after.map((graphic) => graphic.context)).toEqual(contexts);
    const changed = after.filter((graphic, index) => graphic.visible !== visibleBefore[index]);
    expect(changed).toHaveLength(2);
    display.setKeyState('KeyD', false);
    expect(after.map((graphic) => graphic.visible)).toEqual(visibleBefore);
  });

  it('바인딩되지 않은 키(KeyQ)나 표에 없는 키는 눌러도 아무 그림도 바꾸지 않는다', () => {
    const { display } = setUp();
    const visibleBefore = display.container.children.map((graphic) => graphic.visible);
    display.setKeyState('KeyQ', true);
    display.setKeyState('MediaPlayPause', true);
    expect(display.container.children.map((graphic) => graphic.visible)).toEqual(visibleBefore);
  });

  it('dispose하면 컨테이너와 키 그림을 파괴하고 그 뒤 키 입력은 무시한다', () => {
    const { parent, display } = setUp();
    const container = display.container;
    display.dispose();
    expect(container.destroyed).toBe(true);
    expect(parent.children).not.toContain(container);
    expect(() => display.setKeyState('KeyD', true)).not.toThrow();
  });
});

describe('KeyboardDisplay 색 — 레인 1·3 은색/청록, 레인 2·4 파란색/파란 네온, 네온은 누르는 동안만(#258)', () => {
  const { boundOdd, boundEven, pressedOdd, pressedEven, unbound } = KEYBOARD_DISPLAY_STYLE;

  function setUp() {
    const display = new KeyboardDisplay(new Container());
    display.setup(TKL_BINDINGS, area(1067));
    return display;
  }
  const keyOf = (display: KeyboardDisplay, label: string) => display.container.getChildByLabel(label) as Graphics;
  /** Graphics에 기록된 채움·테두리 순서와 색·투명도. */
  const paintOf = (graphic: Graphics) => graphic.context.instructions.map((instruction) => {
    const style = (instruction.data as { style: { color: number; alpha: number } }).style;
    return { action: instruction.action, color: style.color, alpha: style.alpha };
  });

  it('레인 1·3 바인딩 키(KeyD·KeyJ)는 은색(boundOdd), 레인 2·4 바인딩 키(KeyF·KeyK)는 파란색(boundEven) 대기 그림이고 키 alpha는 둘 다 0.5다', () => {
    const display = setUp();
    const cases: Array<[string, { fill: number; stroke: number; alpha: number }]> = [['KeyD', boundOdd], ['KeyF', boundEven], ['KeyJ', boundOdd], ['KeyK', boundEven]];
    for (const [code, style] of cases) {
      const idle = keyOf(display, `key-${code}`);
      expect(paintOf(idle)).toEqual([
        { action: 'fill', color: style.fill, alpha: 1 },
        { action: 'stroke', color: style.stroke, alpha: 1 },
      ]);
      expect(idle.alpha).toBe(style.alpha);
      expect(idle.visible).toBe(true);
    }
    expect(boundOdd.fill).not.toBe(boundEven.fill);
    expect(boundOdd.stroke).not.toBe(boundEven.stroke);
  });

  it('누르면 레인 1·3(KeyD·KeyJ)은 청록(pressedOdd), 레인 2·4(KeyF·KeyK)는 흰색에 가까운 파랑(pressedEven)으로 테두리 없이 바뀌고 대기 그림보다 불투명하다', () => {
    const display = setUp();
    type Pressed = { glow: number; glowAlpha: number; fill: number; alpha: number };
    const cases: Array<[string, Pressed]> = [['KeyD', pressedOdd], ['KeyF', pressedEven], ['KeyJ', pressedOdd], ['KeyK', pressedEven]];
    for (const [code, style] of cases) {
      display.setKeyState(code, true);
      const lit = keyOf(display, `key-${code}-pressed`);
      expect(lit.visible).toBe(true);
      expect(keyOf(display, `key-${code}`).visible).toBe(false);
      // 눌린 키는 테두리 없이 번짐과 밝은 채움만 그린다.
      expect(paintOf(lit)).toEqual([
        { action: 'fill', color: style.glow, alpha: style.glowAlpha },
        { action: 'fill', color: style.fill, alpha: 1 },
      ]);
      expect(lit.alpha).toBe(style.alpha);
      expect(style.alpha).toBeGreaterThan(Math.max(boundOdd.alpha, boundEven.alpha));
    }
    expect(pressedOdd.glow).not.toBe(pressedEven.glow);
  });

  it('바인딩되지 않은 키(KeyQ·Space·F1)는 화면 투명도(키 alpha × 키보드 alpha)가 0.07 이하이고 0보다 커 흐리게나마 보인다', () => {
    const display = setUp();
    const effective = unbound.alpha * KEYBOARD_DISPLAY_STYLE.alpha;
    expect(effective).toBeLessThanOrEqual(0.07);
    expect(effective).toBeGreaterThan(0);
    for (const code of ['KeyQ', 'Space', 'F1']) {
      const key = keyOf(display, `key-${code}`);
      expect(key.alpha * display.container.alpha).toBeCloseTo(effective, 12);
      expect(paintOf(key)).toEqual([{ action: 'fill', color: unbound.fill, alpha: 1 }]);
      expect(display.container.getChildByLabel(`key-${code}-pressed`)).toBeNull();
    }
  });

  it('네온은 상태에만: 눌림 색(채움·번짐)은 대기 색·바인딩되지 않은 키 색과 다르다', () => {
    const neon = [pressedOdd.fill, pressedOdd.glow, pressedEven.fill, pressedEven.glow];
    for (const color of [boundOdd.fill, boundOdd.stroke, boundEven.fill, boundEven.stroke, unbound.fill]) expect(neon).not.toContain(color);
  });
});

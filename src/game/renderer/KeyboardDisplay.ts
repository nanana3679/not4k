/**
 * KeyboardDisplay — 플레이 화면 오른쪽 아래에 작은 키보드 배치를 그리고(keybinding.md "키보드 레이아웃 오버레이"),
 * 레인에 바인딩된 키를 레인 1·3(은색)과 레인 2·4(파란색) 두 계열로 칠하고 누르는 동안만 테두리 없이 밝은 색(흰색·하늘색)으로 밝힌다. 레인마다 다른 색은 쓰지 않는다(#258).
 *
 * 키 그림은 setup에서 한 번만 만든다. 바인딩된 키는 대기·눌림 그림을 하나씩 두고 눌림 상태가 바뀔 때 보이는 쪽만 바꿔,
 * 키 입력마다 Graphics를 다시 그리거나 렌더 텍스처를 새로 굽지 않는다.
 * 기어 오른쪽 빈 곳이 좁으면(16:10 넘버패드·4:3 등) 줄여 넣고, 읽기 어려울 만큼 줄여야 하면 숨긴다(`placeKeyboardDisplay`).
 */

import { Container, Graphics } from "pixi.js";
import { KB_TKL_KEYS, KB_NUMPAD_KEYS, type KbKeyDef } from "./keyboardLayout";

// 키 1단위 = 키 10 + 간격 1 (논리 px)
const KB_KEY_SIZE = 10;
const KB_KEY_GAP = 1;
const KB_KEY_STEP = KB_KEY_SIZE + KB_KEY_GAP;

/**
 * 키보드 표시의 색·투명도. 조절은 여기서만 한다(#258).
 * 바인딩된 키는 레인 1·3과 레인 2·4를 두 색 계열로 나누고, PRODUCT.md "네온은 상태에만"에 따라
 * 누르는 동안만 네온으로 밝힌다. 각 `alpha`는 키 그림의 투명도이고, 화면에서는 키보드 전체 `alpha`를 곱해 보인다.
 */
export const KEYBOARD_DISPLAY_STYLE = {
  /** 키보드 전체 투명도. */
  alpha: 0.85,
  // 바인딩된 키는 레인 1·3(은색 → 누르면 흰색)과 레인 2·4(파란색 → 누르면 게이지 같은 밝은 하늘색)를 두 계열로 나눠, 처음 보는 사람도
  // 키보드만 보고 이웃 레인이 번갈아 배정된 규칙(왼손 R은 레인 3, 오른손 O는 레인 2처럼 손을 건너는 키 포함)을 알아볼 수 있게
  // 한다(#258). 대기 화면 투명도는 0.5 × 0.85 ≈ 0.43. PRODUCT.md "네온은 상태에만"에 따라 밝은 강조색은 누르는 동안만 쓴다.
  /** 레인 1·3 대기: 기어 금속(밝은 면 약 #d0d8e8)에 맞춘 차가운 은색, 테두리는 조금 더 밝게. */
  boundOdd: { fill: 0xa9b4c2, stroke: 0xdde4ee, strokeWidth: 1, alpha: 0.5 },
  /** 레인 2·4 대기: 기어 파란 장갑선(중앙값 #11538c)을 어두운 배경에서 보이도록 밝힌 차분한 파란색, 테두리는 조금 더 밝게. */
  boundEven: { fill: 0x4f7fbf, stroke: 0x9cbde8, strokeWidth: 1, alpha: 0.5 },
  /** 레인 1·3 누름: 테두리 없이 흰색으로 채우고 옅은 흰빛 번짐을 두른다. 번짐 폭은 KEYBOARD_DISPLAY_MARGIN(4)보다 작아야 화면 밖으로 잘리지 않는다. */
  pressedOdd: { fill: 0xffffff, glow: 0xeef4ff, glowAlpha: 0.35, glowSpread: 2, alpha: 1 },
  /** 레인 2·4 누름: 테두리 없이 기어 유리관 게이지 액체(중앙값 #3cddfd, 밝은 쪽 #69f6fe)처럼 밝은 하늘색으로 채우고 같은 색 번짐을 두른다. */
  pressedEven: { fill: 0x6ae4ff, glow: 0x3cddfd, glowAlpha: 0.4, glowSpread: 2, alpha: 1 },
  /** 바인딩되지 않은 키: 대기 금속 톤을 아주 흐리게. 화면 투명도 0.07 × 0.85 ≈ 0.06. */
  unbound: { fill: 0xa9b4c2, alpha: 0.07 },
} as const;

/** 화면 오른쪽·아래 가장자리와 키보드 사이 여백. 눌림 번짐(KEYBOARD_DISPLAY_STYLE.pressedOdd·pressedEven.glowSpread 2)이 화면 밖으로 잘리지 않는다. */
export const KEYBOARD_DISPLAY_MARGIN = 4;
/**
 * 이보다 줄여야 들어가면 숨긴다. 0.6배면 키 한 칸이 6 논리 단위(렌더 높이 720에서 화면 약 7px)이고 키 사이 간격이
 * 화면 1px 아래로 내려가기 시작해, 그보다 작으면 이웃 키를 구분하기 어렵다.
 */
export const KEYBOARD_DISPLAY_MIN_SCALE = 0.6;

export interface KeyboardDisplayArea {
  /** 플레이 영역 논리 크기(높이 600). 튜토리얼 키보드 strip처럼 그 아래 덧붙는 영역은 넣지 않는다. */
  width: number;
  height: number;
  /** 키보드가 쓸 수 있는 가장 왼쪽 x(기어 실루엣 오른쪽 끝 + 여백). */
  freeLeft: number;
}

export interface KeyboardDisplayPlacement {
  visible: boolean;
  scale: number;
  x: number;
  y: number;
}

function layoutKeys(hasNumpad: boolean): readonly KbKeyDef[] {
  return hasNumpad ? [...KB_TKL_KEYS, ...KB_NUMPAD_KEYS] : KB_TKL_KEYS;
}

/** 원래 크기(1배)의 키보드 표시 크기. 마지막 키의 오른쪽·아래 단위 경계까지다. */
export function keyboardDisplaySize(hasNumpad: boolean): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const def of layoutKeys(hasNumpad)) {
    width = Math.max(width, (def.x + (def.w ?? 1)) * KB_KEY_STEP);
    height = Math.max(height, (def.y + (def.h ?? 1)) * KB_KEY_STEP);
  }
  return { width, height };
}

/**
 * 오른쪽 아래 구석에 붙이되 freeLeft보다 왼쪽으로 넘어가지 않게 필요하면 줄인다(키우지는 않는다).
 * 필요한 배율이 KEYBOARD_DISPLAY_MIN_SCALE보다 작으면 숨긴다.
 */
export function placeKeyboardDisplay(
  size: { width: number; height: number },
  area: KeyboardDisplayArea,
): KeyboardDisplayPlacement {
  const right = area.width - KEYBOARD_DISPLAY_MARGIN;
  const bottom = area.height - KEYBOARD_DISPLAY_MARGIN;
  const available = right - area.freeLeft;
  // 빈 폭이 음수(기어가 오른쪽 여백까지 닿는 좁은 화면)면 음수 배율 대신 0으로 묶는다.
  const scale = Math.max(0, Math.min(1, available / size.width));
  return {
    // 경계(정확히 0.6배)에서 부동소수 오차로 숨지 않게 아주 작은 여유를 둔다.
    visible: scale >= KEYBOARD_DISPLAY_MIN_SCALE - 1e-9,
    scale,
    x: right - size.width * scale,
    y: bottom - size.height * scale,
  };
}

interface BoundKey {
  idle: Graphics;
  pressed: Graphics;
  isPressed: boolean;
}

export class KeyboardDisplay {
  private readonly keyboardContainer = new Container({ label: "keyboard-display" });
  private boundKeys = new Map<string, BoundKey>();
  private _placement: KeyboardDisplayPlacement = { visible: false, scale: 1, x: 0, y: 0 };

  constructor(parentContainer: Container) {
    parentContainer.addChild(this.keyboardContainer);
  }

  get container(): Container {
    return this.keyboardContainer;
  }

  get placement(): KeyboardDisplayPlacement {
    return this._placement;
  }

  /** 키 그림을 만들고 배치한다. 다시 부르면 이전 키 그림을 지우고 새 바인딩으로 만든다. */
  setup(laneBindings: ReadonlyMap<string, number>, area: KeyboardDisplayArea): void {
    for (const child of this.keyboardContainer.removeChildren()) child.destroy();
    this.boundKeys.clear();

    const hasNumpad = [...laneBindings.keys()].some(code => code.startsWith("Numpad"));
    for (const def of layoutKeys(hasNumpad)) {
      const x = def.x * KB_KEY_STEP;
      const y = def.y * KB_KEY_STEP;
      const w = Math.round((def.w ?? 1) * KB_KEY_STEP - KB_KEY_GAP);
      const h = Math.round((def.h ?? 1) * KB_KEY_STEP - KB_KEY_GAP);
      const lane = laneBindings.get(def.code);
      const idle = lane !== undefined ? drawBoundKey(w, h, lane) : drawUnboundKey(w, h);
      idle.label = `key-${def.code}`;
      idle.position.set(x, y);
      this.keyboardContainer.addChild(idle);
      if (lane === undefined) continue;
      const pressed = drawPressedKey(w, h, lane);
      pressed.label = `key-${def.code}-pressed`;
      pressed.position.set(x, y);
      pressed.visible = false;
      this.keyboardContainer.addChild(pressed);
      this.boundKeys.set(def.code, { idle, pressed, isPressed: false });
    }

    this._placement = placeKeyboardDisplay(keyboardDisplaySize(hasNumpad), area);
    const { visible, scale, x, y } = this._placement;
    this.keyboardContainer.position.set(x, y);
    this.keyboardContainer.scale.set(scale);
    this.keyboardContainer.visible = visible;
    this.keyboardContainer.alpha = KEYBOARD_DISPLAY_STYLE.alpha;
  }

  /** 바인딩된 키의 눌림 표시만 바꾼다. 바인딩되지 않은 키나 같은 상태는 무시한다. */
  setKeyState(keyCode: string, pressed: boolean): void {
    const key = this.boundKeys.get(keyCode);
    if (!key || key.isPressed === pressed || key.idle.destroyed) return;
    key.isPressed = pressed;
    key.idle.visible = !pressed;
    key.pressed.visible = pressed;
  }

  dispose(): void {
    this.boundKeys.clear();
    if (this.keyboardContainer.destroyed) return;
    this.keyboardContainer.removeFromParent();
    this.keyboardContainer.destroy({ children: true });
  }
}

/** 레인 번호(1부터)가 홀수면 레인 1·3 색, 짝수면 레인 2·4 색. */
function drawBoundKey(width: number, height: number, lane: number): Graphics {
  const { fill, stroke, strokeWidth, alpha } = lane % 2 === 1 ? KEYBOARD_DISPLAY_STYLE.boundOdd : KEYBOARD_DISPLAY_STYLE.boundEven;
  const graphic = new Graphics();
  graphic.roundRect(0, 0, width, height, 2);
  graphic.fill(fill);
  graphic.stroke({ width: strokeWidth, color: stroke });
  graphic.alpha = alpha;
  return graphic;
}

function drawUnboundKey(width: number, height: number): Graphics {
  const { fill, alpha } = KEYBOARD_DISPLAY_STYLE.unbound;
  const graphic = new Graphics();
  graphic.roundRect(0, 0, width, height, 2);
  graphic.fill(fill);
  graphic.alpha = alpha;
  return graphic;
}

/** 레인 번호(1부터)가 홀수면 레인 1·3 눌림 색, 짝수면 레인 2·4 눌림 색. */
function drawPressedKey(width: number, height: number, lane: number): Graphics {
  const { fill, glow, glowAlpha, glowSpread, alpha } = lane % 2 === 1 ? KEYBOARD_DISPLAY_STYLE.pressedOdd : KEYBOARD_DISPLAY_STYLE.pressedEven;
  const graphic = new Graphics();
  // 바깥에 번지는 빛을 깔고 그 위에 테두리 없이 밝은 키를 채운다.
  graphic.roundRect(-glowSpread, -glowSpread, width + glowSpread * 2, height + glowSpread * 2, 2 + glowSpread / 2);
  graphic.fill({ color: glow, alpha: glowAlpha });
  graphic.roundRect(0, 0, width, height, 2);
  graphic.fill(fill);
  graphic.alpha = alpha;
  return graphic;
}

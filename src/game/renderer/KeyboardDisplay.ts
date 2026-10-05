/**
 * KeyboardDisplay — 플레이 화면 오른쪽 아래에 작은 키보드 배치를 그리고(keybinding.md "키보드 레이아웃 오버레이"),
 * 레인에 바인딩된 키를 레인 색으로 칠해 누르는 동안 밝힌다.
 *
 * 키 그림은 setup에서 한 번만 만든다. 바인딩된 키는 대기·눌림 그림을 하나씩 두고 눌림 상태가 바뀔 때 보이는 쪽만 바꿔,
 * 키 입력마다 Graphics를 다시 그리거나 렌더 텍스처를 새로 굽지 않는다.
 * 프레임 오른쪽 빈 곳이 좁으면(16:10 넘버패드·4:3 등) 줄여 넣고, 읽기 어려울 만큼 줄여야 하면 숨긴다(`placeKeyboardDisplay`).
 */

import { Container, Graphics } from "pixi.js";
import {
  KB_TKL_KEYS,
  KB_NUMPAD_KEYS,
  KB_IDLE_COLORS,
  KB_PRESSED_COLORS,
  KB_IDLE_FILL,
  KB_PRESSED_FILL,
  type KbKeyDef,
} from "./keyboardLayout";

// 키 1단위 = 키 10 + 간격 1 (논리 px)
const KB_KEY_SIZE = 10;
const KB_KEY_GAP = 1;
const KB_KEY_STEP = KB_KEY_SIZE + KB_KEY_GAP;
const UNBOUND_COLOR = 0x00cccc;

/** 화면 오른쪽·아래 가장자리와 키보드 사이 여백. 눌림 번짐(2)이 화면 밖으로 잘리지 않는다. */
export const KEYBOARD_DISPLAY_MARGIN = 4;
/**
 * 이보다 줄여야 들어가면 숨긴다. 0.6배면 키 한 칸이 6 논리 단위(렌더 높이 720에서 화면 약 7px)이고 키 사이 간격이
 * 화면 1px 아래로 내려가기 시작해, 그보다 작으면 이웃 키와 레인 색을 구분하기 어렵다.
 */
export const KEYBOARD_DISPLAY_MIN_SCALE = 0.6;

export interface KeyboardDisplayArea {
  /** 플레이 영역 논리 크기(높이 600). 튜토리얼 키보드 strip처럼 그 아래 덧붙는 영역은 넣지 않는다. */
  width: number;
  height: number;
  /** 키보드가 쓸 수 있는 가장 왼쪽 x(프레임 실루엣 오른쪽 끝 + 여백). */
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
  const scale = Math.min(1, available / size.width);
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
      const idle = drawIdleKey(w, h, lane);
      idle.position.set(x, y);
      this.keyboardContainer.addChild(idle);
      if (!lane) continue;
      const pressed = drawPressedKey(w, h, lane);
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
    this.keyboardContainer.alpha = 0.85;
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

function drawIdleKey(width: number, height: number, lane: number | undefined): Graphics {
  const graphic = new Graphics();
  graphic.roundRect(0, 0, width, height, 2);
  if (lane) {
    graphic.fill(KB_IDLE_FILL[lane] ?? 0xddeeff);
    graphic.stroke({ width: 1.5, color: KB_IDLE_COLORS[lane] ?? UNBOUND_COLOR });
    graphic.alpha = 0.5;
  } else {
    graphic.fill(UNBOUND_COLOR);
    graphic.alpha = 0.15;
  }
  return graphic;
}

function drawPressedKey(width: number, height: number, lane: number): Graphics {
  const color = KB_PRESSED_COLORS[lane] ?? 0x888888;
  const graphic = new Graphics();
  // 레인 색으로 2px 번지는 빛 위에 밝은 키를 그린다.
  graphic.roundRect(-2, -2, width + 4, height + 4, 3);
  graphic.fill({ color, alpha: 0.3 });
  graphic.roundRect(0, 0, width, height, 2);
  graphic.fill(KB_PRESSED_FILL[lane] ?? 0xffffff);
  graphic.stroke({ width: 1.5, color });
  graphic.alpha = 0.8;
  return graphic;
}

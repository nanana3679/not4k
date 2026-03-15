/**
 * KeyboardDisplay — renders a mini keyboard layout in the UI layer.
 * Shows which keys are bound to lanes and highlights them on press.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import {
  KB_TKL_KEYS,
  KB_NUMPAD_KEYS,
  KB_IDLE_COLORS,
  KB_PRESSED_COLORS,
} from "./keyboardLayout";

// Keyboard layout display constants
const KB_KEY_SIZE = 10;
const KB_KEY_GAP = 1;
const KB_KEY_STEP = KB_KEY_SIZE + KB_KEY_GAP;

export class KeyboardDisplay {
  private keyboardContainer: Container;
  private keyGraphicsMap: Map<string, Graphics> = new Map();
  private keyTextMap: Map<string, Text> = new Map();
  private keyLaneMap: Map<string, number> = new Map();
  private keyWidthMap: Map<string, number> = new Map();

  constructor(parentContainer: Container, width: number, height: number) {
    this.keyboardContainer = new Container();
    // Position will be set during setup() once we know the keyboard bounds
    this._width = width;
    this._height = height;
    parentContainer.addChild(this.keyboardContainer);
  }

  private _width: number;
  private _height: number;

  get container(): Container {
    return this.keyboardContainer;
  }

  setup(laneBindings: Map<string, number>, _laneColors: string[]): void {
    // Clear previous state
    this.keyboardContainer.removeChildren();
    this.keyGraphicsMap.clear();
    this.keyTextMap.clear();
    this.keyWidthMap.clear();

    this.keyLaneMap = new Map(laneBindings);

    const hasNumpad = [...laneBindings.keys()].some(k => k.startsWith('Numpad'));
    const allKeys = hasNumpad ? [...KB_TKL_KEYS, ...KB_NUMPAD_KEYS] : KB_TKL_KEYS;

    for (const def of allKeys) {
      const w = def.w ?? 1;
      const px = def.x * KB_KEY_STEP;
      const py = def.y * KB_KEY_STEP;
      const pw = Math.round(w * KB_KEY_STEP - KB_KEY_GAP);
      this.createKeyDisplay(def.code, def.label, px, py, pw);
    }

    // Compute bounds and position at bottom-right
    let maxRight = 0, maxBottom = 0;
    for (const def of allKeys) {
      const w = def.w ?? 1;
      const right = (def.x + w) * KB_KEY_STEP;
      const bottom = (def.y + 1) * KB_KEY_STEP;
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    this.keyboardContainer.x = this._width - maxRight - 4;
    this.keyboardContainer.y = this._height - maxBottom - 4;
    this.keyboardContainer.alpha = 0.85;
  }

  private createKeyDisplay(
    code: string,
    label: string,
    x: number,
    y: number,
    pixelWidth: number,
  ): void {
    const lane = this.keyLaneMap.get(code);
    const color = lane ? (KB_IDLE_COLORS[lane] ?? 0x222222) : 0x222222;

    const g = new Graphics();
    g.roundRect(0, 0, pixelWidth, KB_KEY_SIZE, 2);
    g.fill(color);
    g.x = x;
    g.y = y;

    const t = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'Arial',
        fontSize: 6,
        fill: lane ? 0xbbbbbb : 0x444444,
        align: 'center',
      }),
    });
    t.anchor.set(0.5, 0.5);
    t.x = pixelWidth / 2;
    t.y = KB_KEY_SIZE / 2;
    g.addChild(t);

    this.keyboardContainer.addChild(g);
    this.keyGraphicsMap.set(code, g);
    this.keyTextMap.set(code, t);
    this.keyWidthMap.set(code, pixelWidth);
  }

  setKeyState(keyCode: string, pressed: boolean): void {
    const g = this.keyGraphicsMap.get(keyCode);
    if (!g) return;

    const lane = this.keyLaneMap.get(keyCode);
    if (!lane) return;

    const w = this.keyWidthMap.get(keyCode) ?? KB_KEY_SIZE;

    g.clear();
    if (pressed) {
      const color = KB_PRESSED_COLORS[lane] ?? 0x888888;
      // Glow effect
      g.roundRect(-2, -2, w + 4, KB_KEY_SIZE + 4, 3);
      g.fill({ color, alpha: 0.3 });
      // Key body
      g.roundRect(0, 0, w, KB_KEY_SIZE, 2);
      g.fill(color);
    } else {
      const color = KB_IDLE_COLORS[lane] ?? 0x222222;
      g.roundRect(0, 0, w, KB_KEY_SIZE, 2);
      g.fill(color);
    }

    const t = this.keyTextMap.get(keyCode);
    if (t) {
      t.style.fill = pressed ? 0xffffff : 0xbbbbbb;
    }
  }

  dispose(): void {
    this.keyboardContainer.destroy({ children: true });
    this.keyGraphicsMap.clear();
    this.keyTextMap.clear();
    this.keyLaneMap.clear();
    this.keyWidthMap.clear();
  }
}

/**
 * KeyboardDisplay — renders a mini keyboard layout in the UI layer.
 * Shows which keys are bound to lanes and highlights them on press.
 */

import { Container, Graphics } from "pixi.js";
import {
  KB_TKL_KEYS,
  KB_NUMPAD_KEYS,
  KB_IDLE_COLORS,
  KB_PRESSED_COLORS,
  KB_IDLE_FILL,
  KB_PRESSED_FILL,
} from "./keyboardLayout";

// Keyboard layout display constants
const KB_KEY_SIZE = 10;
const KB_KEY_GAP = 1;
const KB_KEY_STEP = KB_KEY_SIZE + KB_KEY_GAP;

/** 키보드 섹션 이름 */
export type KbSection = 'esc' | 'fn1' | 'fn2' | 'fn3' | 'main' | 'navTop' | 'navBottom' | 'arrows' | 'numpad';

export const KB_SECTIONS: readonly KbSection[] = ['esc', 'fn1', 'fn2', 'fn3', 'main', 'navTop', 'navBottom', 'arrows', 'numpad'];

const NAV_TOP_CODES = new Set(['PrintScreen', 'ScrollLock', 'Pause']);
const NAV_BOTTOM_CODES = new Set(['Insert', 'Home', 'PageUp', 'Delete', 'End', 'PageDown']);
const ARROW_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const FN1_CODES = new Set(['F1', 'F2', 'F3', 'F4']);
const FN2_CODES = new Set(['F5', 'F6', 'F7', 'F8']);
const FN3_CODES = new Set(['F9', 'F10', 'F11', 'F12']);

function classifyKey(code: string): KbSection {
  if (code === 'Escape') return 'esc';
  if (FN1_CODES.has(code)) return 'fn1';
  if (FN2_CODES.has(code)) return 'fn2';
  if (FN3_CODES.has(code)) return 'fn3';
  if (NAV_TOP_CODES.has(code)) return 'navTop';
  if (NAV_BOTTOM_CODES.has(code)) return 'navBottom';
  if (ARROW_CODES.has(code)) return 'arrows';
  if (code.startsWith('Numpad') || code === 'NumLock') return 'numpad';
  return 'main';
}

export class KeyboardDisplay {
  private keyboardContainer: Container;
  private keyGraphicsMap: Map<string, Graphics> = new Map();
  private keyLaneMap: Map<string, number> = new Map();
  private keyWidthMap: Map<string, number> = new Map();
  private keyHeightMap: Map<string, number> = new Map();
  private keyOriginals: Map<string, { x: number; y: number; w: number }> = new Map();
  private keyUnits: Map<string, { ux: number; uy: number; uw: number; uh: number }> = new Map();
  private keySections: Map<string, KbSection> = new Map();
  private sectionOffsets: Map<KbSection, { x: number; y: number }> = new Map();
  private sectionScales: Map<KbSection, { sx: number; sy: number }> = new Map();
  private globalSpacing = 0; // 키 간격 추가 px (양수=벌림, 음수=좁힘)

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
    this.keyWidthMap.clear();

    this.keyLaneMap = new Map(laneBindings);

    const hasNumpad = [...laneBindings.keys()].some(k => k.startsWith('Numpad'));
    const allKeys = hasNumpad ? [...KB_TKL_KEYS, ...KB_NUMPAD_KEYS] : KB_TKL_KEYS;

    for (const def of allKeys) {
      const w = def.w ?? 1;
      const h = def.h ?? 1;
      const px = def.x * KB_KEY_STEP;
      const py = def.y * KB_KEY_STEP;
      const pw = Math.round(w * KB_KEY_STEP - KB_KEY_GAP);
      const ph = Math.round(h * KB_KEY_STEP - KB_KEY_GAP);
      this.keyUnits.set(def.code, { ux: def.x, uy: def.y, uw: w, uh: h });
      this.createKeyDisplay(def.code, def.label, px, py, pw, ph);
    }

    // Compute bounds and position at bottom-right
    let maxRight = 0, maxBottom = 0;
    for (const def of allKeys) {
      const w = def.w ?? 1;
      const h = def.h ?? 1;
      const right = (def.x + w) * KB_KEY_STEP;
      const bottom = (def.y + h) * KB_KEY_STEP;
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    this.keyboardContainer.x = this._width - maxRight - 4;
    this.keyboardContainer.y = this._height - maxBottom - 4;
    this.keyboardContainer.alpha = 0.85;
  }

  private createKeyDisplay(
    code: string,
    _label: string,
    x: number,
    y: number,
    pixelWidth: number,
    pixelHeight: number = KB_KEY_SIZE,
  ): void {
    const lane = this.keyLaneMap.get(code);
    const strokeColor = lane ? (KB_IDLE_COLORS[lane] ?? 0x00cccc) : 0x00cccc;

    const g = new Graphics();
    g.roundRect(0, 0, pixelWidth, pixelHeight, 2);
    g.fill(lane ? (KB_IDLE_FILL[lane] ?? 0xddeeff) : 0x00cccc);
    if (lane) g.stroke({ width: 1.5, color: strokeColor });
    g.x = x;
    g.y = y;
    g.alpha = lane ? 0.5 : 0.15;

    this.keyboardContainer.addChild(g);
    this.keyGraphicsMap.set(code, g);
    this.keyWidthMap.set(code, pixelWidth);
    this.keyHeightMap.set(code, pixelHeight);
    this.keyOriginals.set(code, { x, y, w: pixelWidth });
    this.keySections.set(code, classifyKey(code));
  }

  setKeyState(keyCode: string, pressed: boolean): void {
    const g = this.keyGraphicsMap.get(keyCode);
    if (!g) return;

    const lane = this.keyLaneMap.get(keyCode);
    if (!lane) return;

    const w = this.keyWidthMap.get(keyCode) ?? KB_KEY_SIZE;
    const h = this.keyHeightMap.get(keyCode) ?? KB_KEY_SIZE;

    g.clear();
    if (pressed) {
      const color = KB_PRESSED_COLORS[lane] ?? 0x888888;
      const fill = KB_PRESSED_FILL[lane] ?? 0xffffff;
      g.roundRect(-2, -2, w + 4, h + 4, 3);
      g.fill({ color, alpha: 0.3 });
      g.roundRect(0, 0, w, h, 2);
      g.fill(fill);
      g.stroke({ width: 1.5, color });
      g.alpha = 0.8;
    } else {
      const color = KB_IDLE_COLORS[lane] ?? 0x00cccc;
      const fill = KB_IDLE_FILL[lane] ?? 0xddeeff;
      g.roundRect(0, 0, w, h, 2);
      g.fill(fill);
      g.stroke({ width: 1.5, color });
      g.alpha = 0.5;
    }
  }

  /** 섹션별 오프셋 설정 */
  setSectionOffset(section: KbSection, dx: number, dy: number): void {
    this.sectionOffsets.set(section, { x: dx, y: dy });
    this.applySectionTransforms();
  }

  /** 섹션별 오프셋 조회 */
  getSectionOffset(section: KbSection): { x: number; y: number } {
    return this.sectionOffsets.get(section) ?? { x: 0, y: 0 };
  }

  /** 섹션별 스케일 설정 (키 간격 조절) */
  setSectionScale(section: KbSection, sx: number, sy: number): void {
    this.sectionScales.set(section, { sx, sy });
    this.applySectionTransforms();
  }

  /** 섹션별 스케일 조회 */
  getSectionScale(section: KbSection): { sx: number; sy: number } {
    return this.sectionScales.get(section) ?? { sx: 1, sy: 1 };
  }

  /** 전체 키 간격 설정 (px 단위 추가 간격) */
  setGlobalSpacing(spacing: number): void {
    this.globalSpacing = spacing;
    // 원본 위치 재계산
    const step = KB_KEY_SIZE + KB_KEY_GAP + this.globalSpacing;
    for (const [code, units] of this.keyUnits) {
      const orig = this.keyOriginals.get(code);
      if (!orig) continue;
      orig.x = units.ux * step;
      orig.y = units.uy * step;
      orig.w = Math.round(units.uw * step - KB_KEY_GAP - this.globalSpacing);
      // 높이도 갱신
      const ph = Math.round(units.uh * step - KB_KEY_GAP - this.globalSpacing);
      this.keyHeightMap.set(code, ph);
      this.keyWidthMap.set(code, orig.w);
      // Graphics 내부 다시 그리기
      const g = this.keyGraphicsMap.get(code);
      if (g) {
        const lane = this.keyLaneMap.get(code);
        const strokeColor = lane ? (KB_IDLE_COLORS[lane] ?? 0x00cccc) : 0x00cccc;
        g.clear();
        g.roundRect(0, 0, orig.w, ph, 2);
        g.fill(lane ? (KB_IDLE_FILL[lane] ?? 0xddeeff) : 0x00cccc);
        if (lane) g.stroke({ width: 1.5, color: strokeColor });
        g.alpha = lane ? 0.5 : 0.15;
      }
    }
    this.applySectionTransforms();
  }

  getGlobalSpacing(): number {
    return this.globalSpacing;
  }

  /** 섹션 중심점 계산 */
  private getSectionCenter(section: KbSection): { cx: number; cy: number } {
    let sumX = 0, sumY = 0, count = 0;
    for (const [code, orig] of this.keyOriginals) {
      if (this.keySections.get(code) !== section) continue;
      sumX += orig.x + orig.w / 2;
      sumY += orig.y + KB_KEY_SIZE / 2;
      count++;
    }
    if (count === 0) return { cx: 0, cy: 0 };
    return { cx: sumX / count, cy: sumY / count };
  }

  /** 모든 섹션 오프셋+스케일을 키 위치에 반영 */
  private applySectionTransforms(): void {
    // 섹션별 중심점 캐시
    const centers = new Map<KbSection, { cx: number; cy: number }>();

    for (const [code, g] of this.keyGraphicsMap) {
      const orig = this.keyOriginals.get(code);
      if (!orig) continue;
      const section = this.keySections.get(code);
      if (!section) continue;

      const offset = this.sectionOffsets.get(section) ?? { x: 0, y: 0 };
      const scale = this.sectionScales.get(section);

      if (scale && (scale.sx !== 1 || scale.sy !== 1)) {
        if (!centers.has(section)) centers.set(section, this.getSectionCenter(section));
        const { cx, cy } = centers.get(section)!;
        g.x = cx + (orig.x + orig.w / 2 - cx) * scale.sx - orig.w / 2 + offset.x;
        g.y = cy + (orig.y + KB_KEY_SIZE / 2 - cy) * scale.sy - KB_KEY_SIZE / 2 + offset.y;
      } else {
        g.x = orig.x + offset.x;
        g.y = orig.y + offset.y;
      }
    }
  }

  /** 모든 섹션 오프셋/스케일 리셋 */
  resetSectionOffsets(): void {
    this.sectionOffsets.clear();
    this.sectionScales.clear();
    this.applySectionTransforms();
  }

  dispose(): void {
    this.keyboardContainer.destroy({ children: true });
    this.keyGraphicsMap.clear();
    this.keyLaneMap.clear();
    this.keyWidthMap.clear();
  }
}

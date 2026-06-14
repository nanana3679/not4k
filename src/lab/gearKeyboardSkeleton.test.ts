import { describe, expect, it } from "vitest";
import {
  GEAR_KEYBOARD_EXPECTED_CODES,
  GEAR_KEYBOARD_MODULES,
  GEAR_KEYBOARD_SKELETON_KEYS,
  getGearKeyboardSkeletonRow,
  getGearKeyboardSkeletonMetrics,
  renderGearKeyboardSkeletonSvg,
  validateGearKeyboardSkeletonLayout,
} from "./gearKeyboardSkeleton.js";

describe("gearKeyboardSkeleton", () => {
  it("Esc부터 numpad까지 표준 ANSI 104개 키가 모두 한 번씩 존재", () => {
    expect(GEAR_KEYBOARD_SKELETON_KEYS).toHaveLength(104);
    expect(validateGearKeyboardSkeletonLayout()).toEqual([]);

    const codes = GEAR_KEYBOARD_SKELETON_KEYS.map((key) => key.code);
    expect(new Set(codes).size).toBe(104);
    expect(codes).toEqual(expect.arrayContaining(GEAR_KEYBOARD_EXPECTED_CODES));
  });

  it("function row와 PrintScreen 묶음은 main block 위에 분리되어 배치", () => {
    const byCode = getKeysByCode();

    expect(byCode.Escape.y).toBe(0);
    expect(byCode.F1.x).toBeGreaterThan(byCode.Escape.x);
    expect(byCode.F12.x).toBeLessThan(byCode.PrintScreen.x);
    expect(byCode.Backquote.y).toBeGreaterThan(byCode.Escape.y);
  });

  it("navigation cluster, arrow cluster, numpad는 main block 오른쪽에 분리되어 배치", () => {
    const byCode = getKeysByCode();

    expect(byCode.Insert.x).toBeGreaterThan(byCode.Backspace.x);
    expect(byCode.ArrowLeft.x).toBeGreaterThan(byCode.ControlRight.x);
    expect(byCode.NumLock.x).toBeGreaterThan(byCode.PageUp.x);
    expect(byCode.Numpad0.x).toBeGreaterThan(byCode.ArrowRight.x);
  });

  it("arrow cluster는 inverted-T 구조로 ArrowUp이 ArrowDown 위 중앙에 위치", () => {
    const byCode = getKeysByCode();

    expect(byCode.ArrowUp.y).toBeLessThan(byCode.ArrowDown.y);
    expect(byCode.ArrowUp.x).toBe(byCode.ArrowDown.x);
    expect(byCode.ArrowLeft.x).toBeLessThan(byCode.ArrowDown.x);
    expect(byCode.ArrowRight.x).toBeGreaterThan(byCode.ArrowDown.x);
  });

  it("numpad Plus와 Enter는 세로 2칸이고 Numpad0은 가로 2칸", () => {
    const byCode = getKeysByCode();

    expect(byCode.NumpadAdd.h).toBe(2);
    expect(byCode.NumpadEnter.h).toBe(2);
    expect(byCode.Numpad0.w).toBe(2);
    expect(byCode.NumpadDecimal.x).toBe(byCode.Numpad0.x + 2);
  });

  it("SVG 출력은 visible text 없이 key rectangle과 data-code를 포함", () => {
    const svg = renderGearKeyboardSkeletonSvg();
    const metrics = getGearKeyboardSkeletonMetrics();

    expect(svg).toContain(`viewBox="0 0 ${metrics.width} ${metrics.height}"`);
    expect(svg).toContain('data-code="Escape"');
    expect(svg).toContain('data-code="NumpadEnter"');
    expect(svg).not.toContain("<text");
  });

  it("SVG 출력은 system, main, navigation, arrows, numpad를 모듈 g로 그룹화", () => {
    const svg = renderGearKeyboardSkeletonSvg();

    expect(svg).toContain('id="keyboard-skeleton" data-layout="ansi-104" data-role="keyboard-skeleton"');

    for (const module of GEAR_KEYBOARD_MODULES) {
      expect(svg).toContain(
        `id="${module.id}" data-module="${module.module}" data-role="keyboard-module"`,
      );
    }

    expect(countOccurrences(svg, 'data-role="keyboard-module"')).toBe(5);
    expect(countOccurrences(svg, 'data-role="input-key"')).toBe(104);
  });

  it("각 키는 모듈, row, 입력용 role 메타데이터를 함께 가진다", () => {
    const svg = renderGearKeyboardSkeletonSvg();

    expect(svg).toContain(
      'data-code="Escape" data-cluster="system" data-module="system-row" data-row="function-row" data-role="input-key"',
    );
    expect(svg).toContain(
      'data-code="Space" data-cluster="main" data-module="main-block" data-row="modifier-row" data-role="input-key"',
    );
    expect(svg).toContain(
      'data-code="ArrowUp" data-cluster="arrows" data-module="arrow-cluster" data-row="arrow-up-row" data-role="input-key"',
    );
    expect(svg).toContain(
      'data-code="NumpadEnter" data-cluster="numpad" data-module="numpad" data-row="numpad-1-row" data-role="input-key"',
    );
  });

  it("row 메타데이터는 main block과 numpad의 물리 행을 구분", () => {
    const byCode = getKeysByCode();

    expect(getGearKeyboardSkeletonRow(byCode.Backquote)).toBe("number-row");
    expect(getGearKeyboardSkeletonRow(byCode.KeyQ)).toBe("qwerty-row");
    expect(getGearKeyboardSkeletonRow(byCode.KeyA)).toBe("home-row");
    expect(getGearKeyboardSkeletonRow(byCode.ShiftLeft)).toBe("shift-row");
    expect(getGearKeyboardSkeletonRow(byCode.Space)).toBe("modifier-row");
    expect(getGearKeyboardSkeletonRow(byCode.Numpad7)).toBe("numpad-7-row");
    expect(getGearKeyboardSkeletonRow(byCode.Numpad0)).toBe("numpad-0-row");
  });
});

function getKeysByCode() {
  return Object.fromEntries(GEAR_KEYBOARD_SKELETON_KEYS.map((key) => [key.code, key]));
}

function countOccurrences(value: string, needle: string) {
  return value.split(needle).length - 1;
}

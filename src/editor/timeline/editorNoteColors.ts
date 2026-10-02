/**
 * 에디터 노트 색 계산 — pixi 없이 쓸 수 있는 순수 헬퍼.
 *
 * NoteRenderer.getBodyGradient의 가로 그래디언트(가장자리를 0.7만큼 흰색 쪽으로 밝힘)를
 * SVG로 재현하는 곳(튜토리얼 도식, 판정 사례 이미지)이 같은 계산을 공유한다.
 */

/** 0xRRGGBB 색을 amount(0~1)만큼 흰색 쪽으로 밝힌다. */
export function lightenEditorColor(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return (lr << 16) | (lg << 8) | lb;
}

/** 0xRRGGBB 색을 `#rrggbb` 문자열로 바꾼다. */
export function toHexColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** 에디터 롱노트 바디 그래디언트의 가장자리(light)·가운데(base) 색. */
export function editorBodyGradientStops(color: number): { light: string; base: string } {
  return {
    light: toHexColor(lightenEditorColor(color, 0.7)),
    base: toHexColor(color),
  };
}

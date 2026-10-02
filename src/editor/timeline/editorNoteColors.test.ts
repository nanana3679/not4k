import { describe, expect, it } from "vitest";
import { COLORS } from "./constants";
import { editorBodyGradientStops, lightenEditorColor, toHexColor } from "./editorNoteColors";

describe("editorNoteColors", () => {
  it("0x4488ff를 hex 문자열로 바꾸면 #4488ff", () => {
    expect(toHexColor(0x4488ff)).toBe("#4488ff");
  });

  it("상위 바이트가 0인 0x0000ff도 6자리로 채워 #0000ff", () => {
    expect(toHexColor(0x0000ff)).toBe("#0000ff");
  });

  it("SINGLE_LONG 0x88bbff를 0.7만큼 밝히면 NoteRenderer 그래디언트 가장자리와 같은 0xdbebff", () => {
    expect(lightenEditorColor(COLORS.SINGLE_LONG, 0.7)).toBe(0xdbebff);
  });

  it("DOUBLE_LONG 0xffee88의 바디 그래디언트는 가장자리 #fffadb·가운데 #ffee88", () => {
    expect(editorBodyGradientStops(COLORS.DOUBLE_LONG)).toEqual({ light: "#fffadb", base: "#ffee88" });
  });
});

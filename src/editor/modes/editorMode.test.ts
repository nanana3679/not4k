import { describe, it, expect } from "vitest";
import { activeEditorMode, type EditorMode } from "./editorMode";

describe("activeEditorMode", () => {
  const create: EditorMode = { onWheel: () => null };
  const select: EditorMode = { onWheel: () => null };
  const del: EditorMode = { onWheel: () => null };

  it("create 모드면 create 모드 객체를 반환", () => {
    expect(activeEditorMode("create", create, select, del)).toBe(create);
  });

  it("select 모드면 select 모드 객체를 반환", () => {
    expect(activeEditorMode("select", create, select, del)).toBe(select);
  });

  it("delete 모드면 delete 모드 객체를 반환", () => {
    expect(activeEditorMode("delete", create, select, del)).toBe(del);
  });

  it("활성 모드 인스턴스가 아직 null이면 null 반환", () => {
    expect(activeEditorMode("select", create, null, del)).toBeNull();
  });
});

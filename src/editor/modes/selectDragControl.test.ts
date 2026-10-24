import { describe, expect, it, vi } from "vitest";
import { createSelectDragControl } from "./selectDragControl";
import type { EditResult } from "./editorMode";
import { beat } from "../../shared";

function fakeRenderer() {
  return { clearMoveOrigins: vi.fn(), clearBoxSelectRect: vi.fn() };
}

/** 드래그 중이면 SelectMode의 끝내기 메서드는 clearDragPreview를, 아니면 빈 결과를 돌려준다. */
function fakeSelectMode(dragging: boolean, opts: { canDelete?: boolean; pastedCount?: number } = {}) {
  const ended = (): EditResult => (dragging ? { clearDragPreview: true } : {});
  return {
    cancel: vi.fn(ended),
    discardDrag: vi.fn(ended),
    endDragBeforeDelete: vi.fn(() => ({ ...ended(), canDelete: opts.canDelete ?? true })),
    confirmPlacement: vi.fn(ended),
    paste: vi.fn(() => opts.pastedCount ?? 0),
  };
}

describe("createSelectDragControl — store 액션이 진행 중 select 드래그를 끝낼 때 쓰는 selectDragControl", () => {
  it("드래그 중 cancelDrag()는 SelectMode.cancel을 부르고 렌더러의 원위치 고스트·박스 사각형을 걷은 뒤 onDragEnded를 한 번 부르고 true를 반환", () => {
    const selectMode = fakeSelectMode(true);
    const renderer = fakeRenderer();
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => selectMode, () => renderer, onDragEnded);

    expect(control.cancelDrag()).toBe(true);

    expect(selectMode.cancel).toHaveBeenCalledTimes(1);
    expect(selectMode.discardDrag).not.toHaveBeenCalled();
    expect(renderer.clearMoveOrigins).toHaveBeenCalledTimes(1);
    expect(renderer.clearBoxSelectRect).toHaveBeenCalledTimes(1);
    expect(onDragEnded).toHaveBeenCalledTimes(1);
  });

  it("드래그가 없으면 cancelDrag()는 false를 반환하고 렌더러 프리뷰와 onDragEnded를 건드리지 않는다", () => {
    const renderer = fakeRenderer();
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => fakeSelectMode(false), () => renderer, onDragEnded);

    expect(control.cancelDrag()).toBe(false);

    expect(renderer.clearMoveOrigins).not.toHaveBeenCalled();
    expect(renderer.clearBoxSelectRect).not.toHaveBeenCalled();
    expect(onDragEnded).not.toHaveBeenCalled();
  });

  it("드래그 중 discardDrag()는 SelectMode.discardDrag만 부르고(cancel 0회) 렌더러 프리뷰를 걷은 뒤 onDragEnded를 부른다", () => {
    const selectMode = fakeSelectMode(true);
    const renderer = fakeRenderer();
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => selectMode, () => renderer, onDragEnded);

    control.discardDrag();

    expect(selectMode.discardDrag).toHaveBeenCalledTimes(1);
    expect(selectMode.cancel).not.toHaveBeenCalled();
    expect(renderer.clearMoveOrigins).toHaveBeenCalledTimes(1);
    expect(renderer.clearBoxSelectRect).toHaveBeenCalledTimes(1);
    expect(onDragEnded).toHaveBeenCalledTimes(1);
  });

  it("렌더러가 아직 준비 전(null)이어도 드래그 중 cancelDrag()는 드래그를 끝내고 true를 반환", () => {
    const selectMode = fakeSelectMode(true);
    const control = createSelectDragControl(() => selectMode, () => null);

    expect(control.cancelDrag()).toBe(true);
    expect(selectMode.cancel).toHaveBeenCalledTimes(1);
  });

  it("SelectMode가 아직 만들어지기 전(null)이면 cancelDrag()는 false이고 onDragEnded를 부르지 않는다", () => {
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => null, () => fakeRenderer(), onDragEnded);

    expect(control.cancelDrag()).toBe(false);
    expect(onDragEnded).not.toHaveBeenCalled();
  });

  it("박스 드래그 중 endDragBeforeDelete()는 SelectMode가 확정을 받아들이면 렌더러 프리뷰를 걷고 onDragEnded를 부른 뒤 { canDelete: true }를 반환", () => {
    const selectMode = fakeSelectMode(true, { canDelete: true });
    const renderer = fakeRenderer();
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => selectMode, () => renderer, onDragEnded);

    expect(control.endDragBeforeDelete()).toEqual({ canDelete: true });

    expect(selectMode.endDragBeforeDelete).toHaveBeenCalledTimes(1);
    expect(renderer.clearBoxSelectRect).toHaveBeenCalledTimes(1);
    expect(onDragEnded).toHaveBeenCalledTimes(1);
  });

  it("박스 확정이 §3-5 게이트에 거부되면 endDragBeforeDelete()는 프리뷰를 걷되 { canDelete: false }를 반환", () => {
    const renderer = fakeRenderer();
    const control = createSelectDragControl(() => fakeSelectMode(true, { canDelete: false }), () => renderer);

    expect(control.endDragBeforeDelete()).toEqual({ canDelete: false });
    expect(renderer.clearBoxSelectRect).toHaveBeenCalledTimes(1);
  });

  it("SelectMode가 아직 없으면(null) endDragBeforeDelete()는 { canDelete: true }, pasteAfterCancelingDrag()는 0이고 confirmPlacement()는 throw하지 않는다", () => {
    const control = createSelectDragControl(() => null, () => null);

    expect(control.endDragBeforeDelete()).toEqual({ canDelete: true });
    expect(() => control.confirmPlacement()).not.toThrow();
    expect(control.pasteAfterCancelingDrag(beat(8))).toBe(0);
  });

  it("이동 드래그를 confirmPlacement()(Enter)로 끝내면 취소와 같이 렌더러 프리뷰를 걷고 onDragEnded(터치 후보 정리)를 부른다", () => {
    const selectMode = fakeSelectMode(true);
    const renderer = fakeRenderer();
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => selectMode, () => renderer, onDragEnded);

    control.confirmPlacement();

    expect(selectMode.confirmPlacement).toHaveBeenCalledTimes(1);
    expect(renderer.clearMoveOrigins).toHaveBeenCalledTimes(1);
    expect(onDragEnded).toHaveBeenCalledTimes(1);
  });

  it("끝낼 드래그 없이 confirmPlacement()(붙여넣기 확정 등)하면 SelectMode.confirmPlacement를 한 번 부르고 onDragEnded는 부르지 않는다", () => {
    const selectMode = fakeSelectMode(false);
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => selectMode, () => fakeRenderer(), onDragEnded);

    control.confirmPlacement();

    expect(selectMode.confirmPlacement).toHaveBeenCalledTimes(1);
    expect(onDragEnded).not.toHaveBeenCalled();
  });

  it("드래그 중 pasteAfterCancelingDrag(beat 8)는 cancel로 드래그를 끝내고 정리한 뒤 paste(beat 8)를 불러 붙여넣은 개수 1을 반환", () => {
    const selectMode = fakeSelectMode(true, { pastedCount: 1 });
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => selectMode, () => fakeRenderer(), onDragEnded);

    expect(control.pasteAfterCancelingDrag(beat(8))).toBe(1);

    expect(selectMode.paste).toHaveBeenCalledWith(beat(8));
    expect(selectMode.cancel.mock.invocationCallOrder[0])
      .toBeLessThan(selectMode.paste.mock.invocationCallOrder[0]);
    expect(onDragEnded).toHaveBeenCalledTimes(1);
  });

  it("드래그 없이 pasteAfterCancelingDrag(beat 8)도 paste(beat 8)를 불러 붙여넣은 개수 1을 반환하고 onDragEnded는 부르지 않는다", () => {
    const selectMode = fakeSelectMode(false, { pastedCount: 1 });
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => selectMode, () => fakeRenderer(), onDragEnded);

    expect(control.pasteAfterCancelingDrag(beat(8))).toBe(1);

    expect(selectMode.paste).toHaveBeenCalledWith(beat(8));
    expect(onDragEnded).not.toHaveBeenCalled();
  });
});

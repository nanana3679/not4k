import { describe, expect, it, vi } from "vitest";
import { createSelectDragControl } from "./selectDragControl";
import type { EditResult } from "./editorMode";

function fakeRenderer() {
  return { clearMoveOrigins: vi.fn(), clearBoxSelectRect: vi.fn() };
}

/** 드래그 중이면 SelectMode의 끝내기 메서드는 clearDragPreview를, 아니면 빈 결과를 돌려준다. */
function fakeSelectMode(dragging: boolean, opts: { proceed?: boolean; isPendingPaste?: boolean } = {}) {
  const ended = (): EditResult => (dragging ? { clearDragPreview: true } : {});
  return {
    cancel: vi.fn(ended),
    discardDrag: vi.fn(ended),
    endDragBeforeDelete: vi.fn(() => ({ ...ended(), proceed: opts.proceed ?? true })),
    isPendingPaste: opts.isPendingPaste ?? false,
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

  it("박스 드래그 중 endDragBeforeDelete()는 SelectMode가 확정을 받아들이면 렌더러 프리뷰를 걷고 onDragEnded를 부른 뒤 true(지워도 됨)를 반환", () => {
    const selectMode = fakeSelectMode(true, { proceed: true });
    const renderer = fakeRenderer();
    const onDragEnded = vi.fn();
    const control = createSelectDragControl(() => selectMode, () => renderer, onDragEnded);

    expect(control.endDragBeforeDelete()).toBe(true);

    expect(selectMode.endDragBeforeDelete).toHaveBeenCalledTimes(1);
    expect(renderer.clearBoxSelectRect).toHaveBeenCalledTimes(1);
    expect(onDragEnded).toHaveBeenCalledTimes(1);
  });

  it("박스 확정이 §3-5 게이트에 거부되면 endDragBeforeDelete()는 프리뷰를 걷되 false(지우지 않음)를 반환", () => {
    const renderer = fakeRenderer();
    const control = createSelectDragControl(() => fakeSelectMode(true, { proceed: false }), () => renderer);

    expect(control.endDragBeforeDelete()).toBe(false);
    expect(renderer.clearBoxSelectRect).toHaveBeenCalledTimes(1);
  });

  it("SelectMode가 아직 없으면(null) endDragBeforeDelete()는 true, hasPendingPaste()는 false", () => {
    const control = createSelectDragControl(() => null, () => null);

    expect(control.endDragBeforeDelete()).toBe(true);
    expect(control.hasPendingPaste()).toBe(false);
  });

  it("hasPendingPaste()는 SelectMode.isPendingPaste를 그대로 돌려준다(대기 중이면 true)", () => {
    const control = createSelectDragControl(() => fakeSelectMode(false, { isPendingPaste: true }), () => null);

    expect(control.hasPendingPaste()).toBe(true);
  });
});

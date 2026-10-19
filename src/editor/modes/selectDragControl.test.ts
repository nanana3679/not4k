import { describe, expect, it, vi } from "vitest";
import { createSelectDragControl } from "./selectDragControl";
import type { EditResult } from "./editorMode";

function fakeRenderer() {
  return { clearMoveOrigins: vi.fn(), clearBoxSelectRect: vi.fn() };
}

/** 드래그 중이면 SelectMode의 끝내기 메서드는 clearDragPreview를, 아니면 빈 결과를 돌려준다. */
function fakeSelectMode(dragging: boolean) {
  const ended = (): EditResult => (dragging ? { clearDragPreview: true } : {});
  return { cancel: vi.fn(ended), discardDrag: vi.fn(ended) };
}

describe("createSelectDragControl — store가 진행 중 select 드래그를 끝내는 통로", () => {
  it("드래그 중 cancel()은 SelectMode.cancel을 부르고 렌더러의 원위치 고스트·박스 사각형을 걷은 뒤 true를 반환", () => {
    const selectMode = fakeSelectMode(true);
    const renderer = fakeRenderer();
    const control = createSelectDragControl(selectMode, () => renderer);

    expect(control.cancel()).toBe(true);

    expect(selectMode.cancel).toHaveBeenCalledTimes(1);
    expect(selectMode.discardDrag).not.toHaveBeenCalled();
    expect(renderer.clearMoveOrigins).toHaveBeenCalledTimes(1);
    expect(renderer.clearBoxSelectRect).toHaveBeenCalledTimes(1);
  });

  it("드래그가 없으면 cancel()은 false를 반환하고 렌더러 프리뷰를 건드리지 않는다", () => {
    const renderer = fakeRenderer();
    const control = createSelectDragControl(fakeSelectMode(false), () => renderer);

    expect(control.cancel()).toBe(false);

    expect(renderer.clearMoveOrigins).not.toHaveBeenCalled();
    expect(renderer.clearBoxSelectRect).not.toHaveBeenCalled();
  });

  it("드래그 중 discard()는 SelectMode.discardDrag만 부르고(cancel 0회) 렌더러 프리뷰를 걷는다", () => {
    const selectMode = fakeSelectMode(true);
    const renderer = fakeRenderer();
    const control = createSelectDragControl(selectMode, () => renderer);

    control.discard();

    expect(selectMode.discardDrag).toHaveBeenCalledTimes(1);
    expect(selectMode.cancel).not.toHaveBeenCalled();
    expect(renderer.clearMoveOrigins).toHaveBeenCalledTimes(1);
    expect(renderer.clearBoxSelectRect).toHaveBeenCalledTimes(1);
  });

  it("렌더러가 아직 준비 전(null)이어도 드래그 중 cancel()은 드래그를 끝내고 true를 반환", () => {
    const selectMode = fakeSelectMode(true);
    const control = createSelectDragControl(selectMode, () => null);

    expect(control.cancel()).toBe(true);
    expect(selectMode.cancel).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import { resolveContextMenuDelete } from "./contextMenuRouting";

describe("resolveContextMenuDelete — 우클릭 삭제 뒤 contextmenu", () => {
  it("우클릭 down이 이미 지운 누름의 contextmenu 1번은 삭제하지 않고 대기를 푼다", () => {
    expect(resolveContextMenuDelete({ now: 5000, suppressUntil: 0, rightPressPending: true }))
      .toEqual({ shouldDelete: false, rightPressPending: false });
  });

  it("대기를 푼 뒤 키보드 메뉴 키처럼 우클릭 없이 온 contextmenu는 삭제한다", () => {
    const first = resolveContextMenuDelete({ now: 5000, suppressUntil: 0, rightPressPending: true });
    expect(resolveContextMenuDelete({ now: 6000, suppressUntil: 0, rightPressPending: first.rightPressPending }))
      .toEqual({ shouldDelete: true, rightPressPending: false });
  });

  it("터치 롱프레스가 정한 억제 시각 1200ms 안의 contextmenu는 삭제하지 않는다", () => {
    expect(resolveContextMenuDelete({ now: 1000, suppressUntil: 1200, rightPressPending: false }))
      .toEqual({ shouldDelete: false, rightPressPending: false });
  });
});

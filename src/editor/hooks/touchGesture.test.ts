import { describe, expect, it } from "vitest";
import {
  didTouchMoveBeyondTapSlop,
  isTouchNavigationGesture,
} from "./touchGesture";

describe("editor touch gesture policy", () => {
  it("does not treat one-finger drag as canvas navigation", () => {
    expect(isTouchNavigationGesture(1)).toBe(false);
  });

  it("treats two-finger drag as canvas navigation", () => {
    expect(isTouchNavigationGesture(2)).toBe(true);
  });

  it("keeps small one-finger movement inside tap slop", () => {
    expect(didTouchMoveBeyondTapSlop({
      startClientX: 10,
      startClientY: 10,
      clientX: 15,
      clientY: 15,
      tapSlopPx: 10,
    })).toBe(false);
  });

  it("detects movement beyond tap slop", () => {
    expect(didTouchMoveBeyondTapSlop({
      startClientX: 10,
      startClientY: 10,
      clientX: 25,
      clientY: 10,
      tapSlopPx: 10,
    })).toBe(true);
  });
});

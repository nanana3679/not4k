import { describe, expect, it } from "vitest";
import {
  didTouchMoveBeyondTapSlop,
  isTouchNavigationGesture,
  resolveTouchNavigationMode,
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

  it("locks two-finger movement to horizontal scroll when horizontal travel dominates", () => {
    expect(resolveTouchNavigationMode({
      currentMode: null,
      startCenter: { clientX: 100, clientY: 100 },
      currentCenter: { clientX: 70, clientY: 104 },
      startDistance: 100,
      currentDistance: 103,
    })).toBe("horizontalScroll");
  });

  it("locks two-finger movement to vertical scroll when vertical travel dominates", () => {
    expect(resolveTouchNavigationMode({
      currentMode: null,
      startCenter: { clientX: 100, clientY: 100 },
      currentCenter: { clientX: 104, clientY: 132 },
      startDistance: 100,
      currentDistance: 103,
    })).toBe("verticalScroll");
  });

  it("locks two-finger movement to resize when distance change dominates", () => {
    expect(resolveTouchNavigationMode({
      currentMode: null,
      startCenter: { clientX: 100, clientY: 100 },
      currentCenter: { clientX: 104, clientY: 103 },
      startDistance: 100,
      currentDistance: 132,
    })).toBe("resize");
  });

  it("keeps the existing two-finger mode once locked", () => {
    expect(resolveTouchNavigationMode({
      currentMode: "horizontalScroll",
      startCenter: { clientX: 100, clientY: 100 },
      currentCenter: { clientX: 101, clientY: 101 },
      startDistance: 100,
      currentDistance: 150,
    })).toBe("horizontalScroll");
  });

  it("waits before locking when two-finger movement is still below slop", () => {
    expect(resolveTouchNavigationMode({
      currentMode: null,
      startCenter: { clientX: 100, clientY: 100 },
      currentCenter: { clientX: 103, clientY: 104 },
      startDistance: 100,
      currentDistance: 104,
    })).toBeNull();
  });
});

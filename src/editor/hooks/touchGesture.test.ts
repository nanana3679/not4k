import { describe, expect, it } from "vitest";
import {
  advanceTouchNavigationSession,
  beginTouchNavigationSession,
  didTouchMoveBeyondTapSlop,
  isTouchNavigationGesture,
  shouldRunTouchBoxSelectDrag,
  resolveTouchNavigationMode,
} from "./touchGesture";

describe("editor touch gesture policy", () => {
  it("does not treat one-finger drag as canvas navigation", () => {
    expect(isTouchNavigationGesture(1)).toBe(false);
  });

  it("uses one-finger movement in select mode for box selection", () => {
    expect(shouldRunTouchBoxSelectDrag({
      pointerType: "touch",
      editorMode: "select",
      candidatePointerId: 7,
      pointerId: 7,
      moved: true,
      activeTouchCount: 1,
    })).toBe(true);
  });

  it("does not start touch box selection before movement or with navigation touches", () => {
    expect(shouldRunTouchBoxSelectDrag({
      pointerType: "touch",
      editorMode: "select",
      candidatePointerId: 7,
      pointerId: 7,
      moved: false,
      activeTouchCount: 1,
    })).toBe(false);

    expect(shouldRunTouchBoxSelectDrag({
      pointerType: "touch",
      editorMode: "select",
      candidatePointerId: 7,
      pointerId: 7,
      moved: true,
      activeTouchCount: 2,
    })).toBe(false);
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

  it("waits to lock while two-finger navigation modes are within the debounce margin", () => {
    const startCenter = { clientX: 100, clientY: 100 };
    const ambiguousGestures = [
      {
        currentCenter: { clientX: 112, clientY: 110 },
        startDistance: 100,
        currentDistance: 102,
      },
      {
        currentCenter: { clientX: 112, clientY: 101 },
        startDistance: 100,
        currentDistance: 110,
      },
      {
        currentCenter: { clientX: 101, clientY: 112 },
        startDistance: 100,
        currentDistance: 110,
      },
    ];

    for (const gesture of ambiguousGestures) {
      expect(resolveTouchNavigationMode({
        currentMode: null,
        startCenter,
        ...gesture,
      })).toBeNull();
    }
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

  it("keeps a two-finger navigation session locked to the first resolved mode", () => {
    const session = beginTouchNavigationSession([
      { clientX: 50, clientY: 100 },
      { clientX: 150, clientY: 100 },
    ]);
    expect(session).not.toBeNull();

    const locked = advanceTouchNavigationSession(session!, [
      { clientX: 20, clientY: 104 },
      { clientX: 120, clientY: 104 },
    ]);
    expect(locked?.mode).toBe("horizontalScroll");
    expect(locked?.deltaX).toBe(30);

    const stillHorizontal = advanceTouchNavigationSession(locked!.session, [
      { clientX: 0, clientY: 103 },
      { clientX: 180, clientY: 103 },
    ]);
    expect(stillHorizontal?.mode).toBe("horizontalScroll");
    expect(stillHorizontal?.deltaX).toBe(-20);
    expect(stillHorizontal?.session.mode).toBe("horizontalScroll");
  });

  it("keeps ambiguous two-finger movement pending while still advancing previous touch state", () => {
    const session = beginTouchNavigationSession([
      { clientX: 50, clientY: 100 },
      { clientX: 150, clientY: 100 },
    ]);

    const pending = advanceTouchNavigationSession(session!, [
      { clientX: 40, clientY: 106 },
      { clientX: 140, clientY: 106 },
    ]);

    expect(pending?.mode).toBeNull();
    expect(pending?.session.previousCenter).toEqual({ clientX: 90, clientY: 106 });
    expect(pending?.session.previousDistance).toBe(100);
  });
});

/**
 * InputSystem — Keyboard input handler for the rhythm game
 *
 * Tracks key press/release events with high-resolution timestamps and maps
 * physical keys to lanes based on key bindings. Supports multiple keys per lane
 * for trill note handling.
 */

export interface KeyBinding {
  lane: 1 | 2 | 3 | 4;
  key: string; // KeyboardEvent.code
}

export interface InputCallbacks {
  onLanePress: (lane: 1 | 2 | 3 | 4, timestampMs: number) => void;
  onLaneRelease: (lane: 1 | 2 | 3 | 4, timestampMs: number) => void;
}

/**
 * Default TKL (Tenkeyless) key bindings for 8-key preset
 * Based on the ergonomic weak-middle-index-thumb layout
 */
export const DEFAULT_BINDINGS_TKL: KeyBinding[] = [
  // Lane 1 (left outer): middle + ring finger
  { lane: 1, key: "KeyW" }, // middle finger
  { lane: 1, key: "KeyQ" }, // ring finger

  // Lane 2 (left inner): index + thumb
  { lane: 2, key: "KeyE" }, // index finger
  { lane: 2, key: "KeyC" }, // thumb

  // Lane 3 (right inner): index + thumb
  { lane: 3, key: "KeyP" }, // index finger
  { lane: 3, key: "Comma" }, // thumb

  // Lane 4 (right outer): middle + ring finger
  { lane: 4, key: "BracketLeft" }, // middle finger
  { lane: 4, key: "BracketRight" }, // ring finger
];

/**
 * InputSystem manages keyboard input for the rhythm game.
 *
 * Features:
 * - Maps physical keys to lanes based on configurable bindings
 * - Tracks which keys are currently held per lane
 * - Records the last time all keys were released in each lane (for grace period)
 * - Uses high-resolution timestamps from KeyboardEvent.timeStamp
 * - Supports multiple keys per lane (up to 4 keys per lane for 16-key preset)
 */
export class InputSystem {
  private bindings: Map<string, 1 | 2 | 3 | 4>; // key code → lane
  private callbacks: InputCallbacks;
  private target: EventTarget | null = null;

  // Track held keys globally and per-lane
  private heldKeys: Set<string>; // currently held key codes
  private laneHeldCount: Map<1 | 2 | 3 | 4, number>; // lane → number of keys held

  // Track when all keys in a lane were last released (for 12ms hold succession grace period)
  private laneLastReleaseTime: Map<1 | 2 | 3 | 4, number>; // lane → timestamp (ms)

  // Bound event handlers (for proper cleanup)
  private handleKeyDown: EventListener;
  private handleKeyUp: EventListener;

  constructor(bindings: KeyBinding[], callbacks: InputCallbacks) {
    this.bindings = new Map();
    this.callbacks = callbacks;
    this.heldKeys = new Set();
    this.laneHeldCount = new Map([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    this.laneLastReleaseTime = new Map();

    // Bind event handlers to preserve 'this' context
    this.handleKeyDown = (e: Event) => this.onKeyDown(e as KeyboardEvent);
    this.handleKeyUp = (e: Event) => this.onKeyUp(e as KeyboardEvent);

    this.updateBindings(bindings);
  }

  /**
   * Update key bindings. Can be called at runtime to change bindings.
   */
  updateBindings(bindings: KeyBinding[]): void {
    this.bindings.clear();
    for (const binding of bindings) {
      this.bindings.set(binding.key, binding.lane);
    }
  }

  /**
   * Attach input listeners to a target (defaults to window)
   */
  attach(target: EventTarget = window): void {
    if (this.target) {
      this.detach();
    }

    this.target = target;
    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("keyup", this.handleKeyUp);
  }

  /**
   * Detach input listeners
   */
  detach(): void {
    if (!this.target) return;

    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
    this.target = null;

    // Clear all held state
    this.heldKeys.clear();
    this.laneHeldCount.set(1, 0);
    this.laneHeldCount.set(2, 0);
    this.laneHeldCount.set(3, 0);
    this.laneHeldCount.set(4, 0);
  }

  /**
   * Check if any key in a lane is currently held
   */
  isLaneHeld(lane: 1 | 2 | 3 | 4): boolean {
    return (this.laneHeldCount.get(lane) ?? 0) > 0;
  }

  /**
   * Get the timestamp when all keys in a lane were last released.
   * Returns null if never released or if lane is currently held.
   */
  getLaneLastReleaseTime(lane: 1 | 2 | 3 | 4): number | null {
    if (this.isLaneHeld(lane)) {
      return null;
    }
    return this.laneLastReleaseTime.get(lane) ?? null;
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Ignore repeat events (key held down)
    if (e.repeat) return;

    const lane = this.bindings.get(e.code);
    if (!lane) return; // Key not bound to any lane

    // If this key is already held, ignore (shouldn't happen with repeat check, but be safe)
    if (this.heldKeys.has(e.code)) return;

    // Mark key as held
    this.heldKeys.add(e.code);

    // Get current lane held count
    const prevCount = this.laneHeldCount.get(lane) ?? 0;
    const newCount = prevCount + 1;
    this.laneHeldCount.set(lane, newCount);

    // Fire lane press callback only on first key press in lane (0 → 1 transition)
    if (prevCount === 0) {
      this.callbacks.onLanePress(lane, e.timeStamp);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const lane = this.bindings.get(e.code);
    if (!lane) return; // Key not bound to any lane

    // If this key wasn't held, ignore
    if (!this.heldKeys.has(e.code)) return;

    // Mark key as released
    this.heldKeys.delete(e.code);

    // Update lane held count
    const prevCount = this.laneHeldCount.get(lane) ?? 0;
    const newCount = Math.max(0, prevCount - 1);
    this.laneHeldCount.set(lane, newCount);

    // Fire lane release callback only when all keys released (1 → 0 transition)
    if (prevCount > 0 && newCount === 0) {
      this.laneLastReleaseTime.set(lane, e.timeStamp);
      this.callbacks.onLaneRelease(lane, e.timeStamp);
    }
  }
}

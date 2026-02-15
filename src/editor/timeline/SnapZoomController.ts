/**
 * SnapZoomController — 타임라인 스냅 & 줌 상태 관리
 *
 * 차트 에디터의 스냅 그리드 해상도와 줌 레벨을 제어한다.
 */

import type { Beat, BpmMarker } from "../../shared";
import { beat, beatToFloat, beatToMs, msToBeat } from "../../shared";

export interface SnapZoomState {
  zoom: number; // pixelPerSecond (default: 200)
  snapDivision: number; // 1/N beat (default: 4, meaning 1/4 beat snap)
}

export interface SnapZoomCallbacks {
  onZoomChange: (zoom: number) => void;
  onSnapChange: (snapDivision: number) => void;
}

export class SnapZoomController {
  private state: SnapZoomState;
  private callbacks: SnapZoomCallbacks;

  /** Preset snap divisions (for cycling) */
  static readonly SNAP_DIVISIONS: readonly number[] = [
    1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48,
  ] as const;

  /** Zoom limits */
  static readonly MIN_ZOOM = 50;
  static readonly MAX_ZOOM = 2000;

  /** Zoom factor per wheel tick */
  private static readonly ZOOM_FACTOR = 1.1;

  constructor(
    callbacks: SnapZoomCallbacks,
    initialState?: Partial<SnapZoomState>
  ) {
    this.callbacks = callbacks;
    this.state = {
      zoom: initialState?.zoom ?? 200,
      snapDivision: initialState?.snapDivision ?? 4,
    };
  }

  /** Get current zoom (pixelPerSecond) */
  get zoom(): number {
    return this.state.zoom;
  }

  /** Set zoom directly */
  set zoom(value: number) {
    const clamped = Math.max(
      SnapZoomController.MIN_ZOOM,
      Math.min(SnapZoomController.MAX_ZOOM, value)
    );
    if (clamped !== this.state.zoom) {
      this.state.zoom = clamped;
      this.callbacks.onZoomChange(clamped);
    }
  }

  /** Get current snap division */
  get snapDivision(): number {
    return this.state.snapDivision;
  }

  /** Set snap division directly (any positive integer) */
  set snapDivision(value: number) {
    if (value < 1) return;
    if (value !== this.state.snapDivision) {
      this.state.snapDivision = value;
      this.callbacks.onSnapChange(value);
    }
  }

  /**
   * Handle Ctrl+wheel for zoom adjustment
   * @returns true if handled (Ctrl held), false otherwise
   */
  handleWheel(event: WheelEvent): boolean {
    if (!event.ctrlKey) {
      return false;
    }

    event.preventDefault();

    // wheel up (deltaY < 0) = zoom in (increase)
    // wheel down (deltaY > 0) = zoom out (decrease)
    const factor =
      event.deltaY < 0
        ? SnapZoomController.ZOOM_FACTOR
        : 1 / SnapZoomController.ZOOM_FACTOR;

    this.zoom = this.state.zoom * factor;
    return true;
  }

  /**
   * Snap a time (ms) to the nearest grid position
   * @param timeMs Time in milliseconds
   * @param bpmMarkers BPM markers array
   * @param offsetMs Offset from audio start to beat 0
   * @returns Snapped time in milliseconds
   */
  snapTimeMs(
    timeMs: number,
    bpmMarkers: readonly BpmMarker[],
    offsetMs: number
  ): number {
    // Convert time to beat (float)
    const beatFloat = msToBeat(timeMs, bpmMarkers, offsetMs);

    // Snap to grid
    const snappedBeatFloat = this.snapBeatFloat(beatFloat);

    // Convert back to time
    const k = Math.round(snappedBeatFloat * this.state.snapDivision / 4);
    const snappedBeat = beat(k * 4, this.state.snapDivision);

    return beatToMs(snappedBeat, bpmMarkers, offsetMs);
  }

  /**
   * Snap a beat to the nearest grid position based on snap division.
   * Snap division N = N-th note (e.g., 16 = sixteenth note = 4/16 = 0.25 beats).
   */
  snapBeat(inputBeat: Beat): Beat {
    const beatFloat = beatToFloat(inputBeat);
    const snappedFloat = this.snapBeatFloat(beatFloat);

    // Convert back to Beat: snappedFloat = k * (4/snap), so n = k*4, d = snap
    const k = Math.round(snappedFloat * this.state.snapDivision / 4);
    return beat(k * 4, this.state.snapDivision);
  }

  /**
   * Snap a float beat value to the nearest grid position.
   * Grid interval = 4/snap beats (standard note value: snap=16 → 1/4 beat).
   */
  private snapBeatFloat(beatFloat: number): number {
    const grid = 4 / this.state.snapDivision;
    return Math.round(beatFloat / grid) * grid;
  }

  /** Cycle to next snap division */
  nextSnap(): void {
    const divisions = SnapZoomController.SNAP_DIVISIONS;
    const currentIndex = divisions.indexOf(this.state.snapDivision);
    const nextIndex = (currentIndex + 1) % divisions.length;
    this.snapDivision = divisions[nextIndex];
  }

  /** Cycle to previous snap division */
  prevSnap(): void {
    const divisions = SnapZoomController.SNAP_DIVISIONS;
    const currentIndex = divisions.indexOf(this.state.snapDivision);
    const prevIndex =
      (currentIndex - 1 + divisions.length) % divisions.length;
    this.snapDivision = divisions[prevIndex];
  }

  /** Dispose event listeners */
  dispose(): void {
    // Currently no event listeners to dispose
    // This method is provided for future extensibility
  }
}

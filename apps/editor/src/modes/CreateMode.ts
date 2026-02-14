/**
 * Create Mode — 차트 엔티티 생성 인터랙션 핸들러
 *
 * 포인트 노트, 구간 노트, 마커, 메시지 등을 타임라인에 배치한다.
 * 드래그로 구간 엔티티를 생성하며, 모든 배치는 validateChart로 검증한다.
 */

import type {
  Chart,
  PointNote,
  RangeNote,
  TrillZone,
  EventMarker,
  Beat,
  Lane,
} from "@not4k/shared";
import { validateChart, beatLt, beatGt, beatGte, beatLte, beatMin, beatMax } from "@not4k/shared";

export type EntityType =
  | "single"
  | "double"
  | "singleLong"
  | "doubleLong"
  | "trillZone";

/** All available entity types for cycling (note lane entities only) */
const ENTITY_TYPES: readonly EntityType[] = [
  "single",
  "double",
  "singleLong",
  "doubleLong",
  "trillZone",
] as const;

/** Internal drag type for tracking what kind of range entity is being created */
type DragType = "rangeNote" | "trillZone" | "event" | null;

export interface CreateModeCallbacks {
  /** Called when chart data is modified */
  onChartUpdate: (chart: Chart) => void;
  /** Called to convert Y coordinate to Beat */
  yToBeat: (y: number) => Beat;
  /** Called to snap a beat to grid */
  snapBeat: (beat: Beat) => Beat;
  /** Called to get which lane a X coordinate falls in (1-4 for note lanes, null for aux) */
  xToLane: (x: number) => Lane | null;
  /** Called to get what aux lane type an X falls in */
  xToAuxLane: (x: number) => "event" | null;
  /** Called to display a warning message to the user */
  onWarn?: (message: string) => void;
}

export class CreateMode {
  private chart: Chart;
  private callbacks: CreateModeCallbacks;
  private selectedEntityType: EntityType = "single";
  private isDragging: boolean = false;
  private dragStartBeat: Beat | null = null;
  private dragStartLane: Lane | null = null;
  private _dragType: DragType = null;

  constructor(chart: Chart, callbacks: CreateModeCallbacks) {
    this.chart = chart;
    this.callbacks = callbacks;
  }

  /** Get the currently selected entity type */
  get entityType(): EntityType {
    return this.selectedEntityType;
  }

  /** Set the currently selected entity type */
  set entityType(type: EntityType) {
    this.selectedEntityType = type;
  }

  /** Cycle to next entity type (for C+wheel) */
  nextEntityType(): void {
    const currentIndex = ENTITY_TYPES.indexOf(this.selectedEntityType);
    const nextIndex = (currentIndex + 1) % ENTITY_TYPES.length;
    this.selectedEntityType = ENTITY_TYPES[nextIndex];
  }

  /** Cycle to previous entity type (for C+wheel) */
  prevEntityType(): void {
    const currentIndex = ENTITY_TYPES.indexOf(this.selectedEntityType);
    const prevIndex =
      (currentIndex - 1 + ENTITY_TYPES.length) % ENTITY_TYPES.length;
    this.selectedEntityType = ENTITY_TYPES[prevIndex];
  }

  /** Whether a drag is in progress (for range entity creation) */
  get dragging(): boolean {
    return this.isDragging;
  }

  /** The beat where the drag started (null if not dragging) */
  get dragBeat(): Beat | null {
    return this.dragStartBeat;
  }

  /** The lane where the drag started (null if not dragging) */
  get dragLane(): Lane | null {
    return this.dragStartLane;
  }

  /** The type of drag in progress */
  get dragType(): DragType {
    return this._dragType;
  }

  /** Update the chart reference */
  setChart(chart: Chart): void {
    this.chart = chart;
  }

  /** Handle mouse down on timeline */
  onPointerDown(x: number, y: number): void {
    const beat = this.callbacks.snapBeat(this.callbacks.yToBeat(y));

    // --- Aux lane auto-detection (always, regardless of selectedEntityType) ---
    const auxType = this.callbacks.xToAuxLane(x);
    if (auxType === "event") {
      this.isDragging = true;
      this.dragStartBeat = beat;
      this.dragStartLane = null;
      this._dragType = "event";
      return;
    }

    // --- Note lane entities (based on selectedEntityType) ---
    const lane = this.callbacks.xToLane(x);
    if (lane === null) return; // Outside all lanes

    // Point entities: single, double
    if (
      this.selectedEntityType === "single" ||
      this.selectedEntityType === "double"
    ) {
      this.createPointNote(lane, beat);
      return;
    }

    // Range entities: long bodies
    if (
      this.selectedEntityType === "singleLong" ||
      this.selectedEntityType === "doubleLong"
    ) {
      this.isDragging = true;
      this.dragStartBeat = beat;
      this.dragStartLane = lane;
      this._dragType = "rangeNote";
      return;
    }

    // Trill zone (range entity)
    if (this.selectedEntityType === "trillZone") {
      this.isDragging = true;
      this.dragStartBeat = beat;
      this.dragStartLane = lane;
      this._dragType = "trillZone";
      return;
    }
  }

  /** Handle mouse move (for drag) */
  onPointerMove(_x: number, _y: number): void {
    // Visual preview is handled by the caller
    // This method is here for future extension
    if (!this.isDragging) return;
  }

  /** Cancel an in-progress drag without creating anything */
  cancelDrag(): void {
    this.isDragging = false;
    this.dragStartBeat = null;
    this.dragStartLane = null;
    this._dragType = null;
  }

  /** Handle mouse up (end drag, finalize placement) */
  onPointerUp(_x: number, y: number): void {
    if (!this.isDragging) return;

    const endBeat = this.callbacks.snapBeat(this.callbacks.yToBeat(y));

    if (this._dragType === "rangeNote") {
      if (this.dragStartLane !== null && this.dragStartBeat !== null) {
        this.createRangeNote(this.dragStartLane, this.dragStartBeat, endBeat);
      }
    } else if (this._dragType === "trillZone") {
      if (this.dragStartLane !== null && this.dragStartBeat !== null) {
        this.createTrillZone(this.dragStartLane, this.dragStartBeat, endBeat);
      }
    } else if (this._dragType === "event") {
      if (this.dragStartBeat !== null) {
        this.createEvent(this.dragStartBeat, endBeat);
      }
    }

    // Reset drag state
    this.isDragging = false;
    this.dragStartBeat = null;
    this.dragStartLane = null;
    this._dragType = null;
  }

  /** Handle C+wheel for entity type cycling */
  onWheel(deltaY: number, cKeyHeld: boolean): boolean {
    if (!cKeyHeld) return false;

    if (deltaY > 0) {
      this.nextEntityType();
    } else if (deltaY < 0) {
      this.prevEntityType();
    }

    return true; // Handled
  }

  // -------------------------------------------------------------------------
  // Private creation methods
  // -------------------------------------------------------------------------

  private isInsideTrillZone(lane: Lane, beat: Beat): boolean {
    return this.chart.trillZones.some(
      (z) => z.lane === lane && beatGte(beat, z.beat) && beatLte(beat, z.endBeat)
    );
  }

  private createPointNote(lane: Lane, beat: Beat): void {
    const inTrill = this.isInsideTrillZone(lane, beat);
    const newNote: PointNote = {
      type: inTrill ? "trill" : (this.selectedEntityType as "single" | "double"),
      lane,
      beat,
    };

    // Validate before adding
    const testChart = {
      notes: [...this.chart.notes, newNote],
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    };

    const errors = validateChart(testChart);
    if (errors.length > 0) {
      // Validation failed, don't add
      this.callbacks.onWarn?.(errors.map((e) => e.message).join(", "));
      return;
    }

    // Create new chart with immutable update
    const updatedChart: Chart = {
      ...this.chart,
      notes: [...this.chart.notes, newNote],
    };

    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }

  private createRangeNote(lane: Lane, startBeat: Beat, endBeat: Beat): void {
    // Ensure startBeat <= endBeat
    const actualStartBeat = beatLt(startBeat, endBeat)
      ? startBeat
      : beatMin(startBeat, endBeat);
    const actualEndBeat = beatGt(endBeat, startBeat)
      ? endBeat
      : beatMax(startBeat, endBeat);

    const inTrill = this.isInsideTrillZone(lane, actualStartBeat);
    const newNote: RangeNote = {
      type: inTrill ? "trillLong" : (this.selectedEntityType as "singleLong" | "doubleLong"),
      lane,
      beat: actualStartBeat,
      endBeat: actualEndBeat,
    };

    // Validate before adding
    const testChart = {
      notes: [...this.chart.notes, newNote],
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    };

    const errors = validateChart(testChart);
    if (errors.length > 0) {
      this.callbacks.onWarn?.(errors.map((e) => e.message).join(", "));
      return;
    }

    // Create new chart with immutable update
    const updatedChart: Chart = {
      ...this.chart,
      notes: [...this.chart.notes, newNote],
    };

    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }

  private createTrillZone(lane: Lane, startBeat: Beat, endBeat: Beat): void {
    // Ensure startBeat <= endBeat
    const actualStartBeat = beatLt(startBeat, endBeat)
      ? startBeat
      : beatMin(startBeat, endBeat);
    const actualEndBeat = beatGt(endBeat, startBeat)
      ? endBeat
      : beatMax(startBeat, endBeat);

    const newZone: TrillZone = {
      lane,
      beat: actualStartBeat,
      endBeat: actualEndBeat,
    };

    // Validate before adding
    const testChart = {
      notes: this.chart.notes,
      trillZones: [...this.chart.trillZones, newZone],
      events: this.chart.events,
    };

    const errors = validateChart(testChart);
    if (errors.length > 0) {
      this.callbacks.onWarn?.(errors.map((e) => e.message).join(", "));
      return;
    }

    // Create new chart with immutable update
    const updatedChart: Chart = {
      ...this.chart,
      trillZones: [...this.chart.trillZones, newZone],
    };

    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }

  private createEvent(startBeat: Beat, endBeat: Beat): void {
    // Ensure startBeat <= endBeat
    const actualStartBeat = beatLt(startBeat, endBeat)
      ? startBeat
      : beatMin(startBeat, endBeat);
    const actualEndBeat = beatGt(endBeat, startBeat)
      ? endBeat
      : beatMax(startBeat, endBeat);

    const newEvent: EventMarker = {
      beat: actualStartBeat,
      endBeat: actualEndBeat,
      text: "New Message",
    };

    // Validate before adding
    const testChart = {
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: [...this.chart.events, newEvent],
    };

    const errors = validateChart(testChart);
    if (errors.length > 0) {
      this.callbacks.onWarn?.(errors.map((e) => e.message).join(", "));
      return;
    }

    // Create new chart with immutable update
    const updatedChart: Chart = {
      ...this.chart,
      events: [...this.chart.events, newEvent],
    };

    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }

}

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
  Message,
  BpmMarker,
  TimeSignatureMarker,
  Beat,
  Lane,
} from "@not4k/shared";
import { validateChart, beatEq, beatLt, beatGt, beatMin, beatMax } from "@not4k/shared";

export type EntityType =
  | "single"
  | "double"
  | "trill"
  | "singleLongBody"
  | "doubleLongBody"
  | "trillLongBody"
  | "trillZone";

/** All available entity types for cycling (note lane entities only) */
const ENTITY_TYPES: readonly EntityType[] = [
  "single",
  "double",
  "trill",
  "singleLongBody",
  "doubleLongBody",
  "trillLongBody",
  "trillZone",
] as const;

/** Internal drag type for tracking what kind of range entity is being created */
type DragType = "rangeNote" | "trillZone" | "message" | null;

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
  xToAuxLane: (x: number) => "bpm" | "timeSig" | "message" | null;
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
    if (auxType === "bpm") {
      this.createBpmMarker(beat);
      return;
    }
    if (auxType === "timeSig") {
      this.createTimeSignatureMarker(beat);
      return;
    }
    if (auxType === "message") {
      this.isDragging = true;
      this.dragStartBeat = beat;
      this.dragStartLane = null;
      this._dragType = "message";
      return;
    }

    // --- Note lane entities (based on selectedEntityType) ---
    const lane = this.callbacks.xToLane(x);
    if (lane === null) return; // Outside all lanes

    // Point entities: single, double, trill
    if (
      this.selectedEntityType === "single" ||
      this.selectedEntityType === "double" ||
      this.selectedEntityType === "trill"
    ) {
      this.createPointNote(lane, beat);
      return;
    }

    // Range entities: long bodies
    if (
      this.selectedEntityType === "singleLongBody" ||
      this.selectedEntityType === "doubleLongBody" ||
      this.selectedEntityType === "trillLongBody"
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
    } else if (this._dragType === "message") {
      if (this.dragStartBeat !== null) {
        this.createMessage(this.dragStartBeat, endBeat);
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

  private createPointNote(lane: Lane, beat: Beat): void {
    const newNote: PointNote = {
      type: this.selectedEntityType as "single" | "double" | "trill",
      lane,
      beat,
    };

    // Validate before adding
    const testChart = {
      notes: [...this.chart.notes, newNote],
      trillZones: this.chart.trillZones,
      messages: this.chart.messages,
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

    const newNote: RangeNote = {
      type: this.selectedEntityType as
        | "singleLongBody"
        | "doubleLongBody"
        | "trillLongBody",
      lane,
      beat: actualStartBeat,
      endBeat: actualEndBeat,
    };

    // Validate before adding
    const testChart = {
      notes: [...this.chart.notes, newNote],
      trillZones: this.chart.trillZones,
      messages: this.chart.messages,
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
      messages: this.chart.messages,
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

  private createMessage(startBeat: Beat, endBeat: Beat): void {
    // Ensure startBeat <= endBeat
    const actualStartBeat = beatLt(startBeat, endBeat)
      ? startBeat
      : beatMin(startBeat, endBeat);
    const actualEndBeat = beatGt(endBeat, startBeat)
      ? endBeat
      : beatMax(startBeat, endBeat);

    const newMessage: Message = {
      beat: actualStartBeat,
      endBeat: actualEndBeat,
      text: "New Message", // Default text
    };

    // Validate before adding
    const testChart = {
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      messages: [...this.chart.messages, newMessage],
    };

    const errors = validateChart(testChart);
    if (errors.length > 0) {
      this.callbacks.onWarn?.(errors.map((e) => e.message).join(", "));
      return;
    }

    // Create new chart with immutable update
    const updatedChart: Chart = {
      ...this.chart,
      messages: [...this.chart.messages, newMessage],
    };

    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }

  private createBpmMarker(beat: Beat): void {
    // Find the last BPM marker before this beat
    let lastBpm = 120; // Default BPM
    for (const marker of this.chart.bpmMarkers) {
      if (beatLt(marker.beat, beat) || beatEq(marker.beat, beat)) {
        lastBpm = marker.bpm;
      }
    }

    const newMarker: BpmMarker = {
      beat,
      bpm: lastBpm, // Copy value from last marker
    };

    // No validation needed for BPM markers (no placement constraints)
    // Create new chart with immutable update
    const updatedChart: Chart = {
      ...this.chart,
      bpmMarkers: [...this.chart.bpmMarkers, newMarker],
    };

    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }

  private createTimeSignatureMarker(beat: Beat): void {
    // Find the last time signature marker before this beat
    let lastBeatPerMeasure = { n: 4, d: 1 }; // Default 4/4 time
    for (const marker of this.chart.timeSignatures) {
      if (beatLt(marker.beat, beat) || beatEq(marker.beat, beat)) {
        lastBeatPerMeasure = marker.beatPerMeasure;
      }
    }

    const newMarker: TimeSignatureMarker = {
      beat,
      beatPerMeasure: lastBeatPerMeasure, // Copy value from last marker
    };

    // No validation needed for time signature markers (no placement constraints)
    // Create new chart with immutable update
    const updatedChart: Chart = {
      ...this.chart,
      timeSignatures: [...this.chart.timeSignatures, newMarker],
    };

    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }
}

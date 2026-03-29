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
  TextEvent,
  AutoEvent,
  StopEvent,
  BpmEvent,
  TimeSignatureEvent,
  ChartEvent,
  Beat,
  Lane,
  ExtraNoteEntity,
  ExtraPointNote,
  ExtraRangeNote,
} from "../../shared";
import { validateChart, beatLt, beatGt, beatGte, beatLte, beatMin, beatMax } from "../../shared";

export type EntityType =
  | "single"
  | "double"
  | "long"
  | "doubleLong"
  | "trillZone"
  | "bpm"
  | "timeSignature"
  | "text"
  | "auto"
  | "stop";

/** All available entity types for cycling (note lane entities only) */
const ENTITY_TYPES: readonly EntityType[] = [
  "single",
  "double",
  "long",
  "doubleLong",
  "trillZone",
] as const;

/** Event entity types (created on extra lanes) */
const EVENT_ENTITY_TYPES: EntityType[] = ["bpm", "timeSignature", "text", "auto", "stop"];

/** Check if an entity type is an event type */
export function isEventEntityType(t: EntityType): boolean {
  return EVENT_ENTITY_TYPES.includes(t);
}

/** Point event types (no drag needed) */
const POINT_EVENT_TYPES: EntityType[] = ["bpm", "timeSignature"];

/** Range event types (need drag for endBeat) */
const RANGE_EVENT_TYPES: EntityType[] = ["text", "auto", "stop"];

/** Internal drag type for tracking what kind of range entity is being created */
type DragType = "rangeNote" | "trillZone" | "event" | "extraRangeNote" | null;

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
  /** Called to get extra lane number (1~N) from X, or null */
  xToExtraLane?: (x: number) => number | null;
  /** Called when extra notes are modified */
  onExtraNotesUpdate?: (extraNotes: ExtraNoteEntity[]) => void;
  /** Get current extra notes */
  getExtraNotes?: () => ExtraNoteEntity[];
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
  private _dragExtraLane: number | null = null;

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

  /** The extra lane where drag started */
  get dragExtraLane(): number | null {
    return this._dragExtraLane;
  }

  /** Update the chart reference */
  setChart(chart: Chart): void {
    this.chart = chart;
  }

  /** Handle mouse down on timeline */
  onPointerDown(x: number, y: number): void {
    const beat = this.callbacks.snapBeat(this.callbacks.yToBeat(y));

    // --- Extra lane detection ---
    if (this.callbacks.xToExtraLane) {
      const extraLane = this.callbacks.xToExtraLane(x);
      if (extraLane !== null) {
        // Event entity types on extra lanes
        if (isEventEntityType(this.selectedEntityType)) {
          if (POINT_EVENT_TYPES.includes(this.selectedEntityType)) {
            // Point events (bpm, timeSignature): create immediately, no drag
            this.createEvent(beat, beat);
            return;
          }
          if (RANGE_EVENT_TYPES.includes(this.selectedEntityType)) {
            // Range events (text, auto, stop): start drag
            this.isDragging = true;
            this.dragStartBeat = beat;
            this.dragStartLane = null;
            this._dragExtraLane = extraLane;
            this._dragType = "event";
            return;
          }
          return;
        }
        if (this.selectedEntityType === "single" || this.selectedEntityType === "double") {
          this.createExtraPointNote(extraLane, beat);
          return;
        }
        if (this.selectedEntityType === "long" || this.selectedEntityType === "doubleLong") {
          this.isDragging = true;
          this.dragStartBeat = beat;
          this.dragStartLane = null;
          this._dragExtraLane = extraLane;
          this._dragType = "extraRangeNote";
          return;
        }
        // trillZone not supported in extra lanes
        return;
      }
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
      this.selectedEntityType === "long" ||
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
    this._dragExtraLane = null;
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
    } else if (this._dragType === "extraRangeNote") {
      if (this._dragExtraLane !== null && this.dragStartBeat !== null) {
        this.createExtraRangeNote(this._dragExtraLane, this.dragStartBeat, endBeat);
      }
    }

    // Reset drag state
    this.isDragging = false;
    this.dragStartBeat = null;
    this.dragStartLane = null;
    this._dragType = null;
    this._dragExtraLane = null;
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

    // Determine head and body types
    let headType: "single" | "double" | "trill";
    let bodyType: "long" | "doubleLong" | "trillLong";
    if (inTrill) {
      headType = "trill";
      bodyType = "trillLong";
    } else if (this.selectedEntityType === "doubleLong") {
      headType = "double";
      bodyType = "doubleLong";
    } else {
      headType = "single";
      bodyType = "long";
    }

    const bodyNote: RangeNote = {
      type: bodyType,
      lane,
      beat: actualStartBeat,
      endBeat: actualEndBeat,
    };

    // Length 0 (startBeat == endBeat): body only, no head note
    const isZeroLength = actualStartBeat.n * actualEndBeat.d === actualEndBeat.n * actualStartBeat.d;
    const newNotes: (PointNote | RangeNote)[] = isZeroLength
      ? [bodyNote]
      : [{ type: headType, lane, beat: actualStartBeat } as PointNote, bodyNote];

    // Validate before adding
    const testChart = {
      notes: [...this.chart.notes, ...newNotes],
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    };

    const errors = validateChart(testChart);
    if (errors.length > 0) {
      this.callbacks.onWarn?.(errors.map((e) => e.message).join(", "));
      return;
    }

    const updatedChart: Chart = {
      ...this.chart,
      notes: [...this.chart.notes, ...newNotes],
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

    let newEvent: ChartEvent;
    switch (this.selectedEntityType) {
      case "bpm":
        newEvent = { type: "bpm", beat: actualStartBeat, bpm: 120 } as BpmEvent;
        break;
      case "timeSignature":
        newEvent = { type: "timeSignature", beat: actualStartBeat, beatPerMeasure: { n: 4, d: 1 } } as TimeSignatureEvent;
        break;
      case "text":
        newEvent = { type: "text", beat: actualStartBeat, endBeat: actualEndBeat, text: "New Message" } as TextEvent;
        break;
      case "auto":
        newEvent = { type: "auto", beat: actualStartBeat, endBeat: actualEndBeat } as AutoEvent;
        break;
      case "stop":
        newEvent = { type: "stop", beat: actualStartBeat, endBeat: actualEndBeat } as StopEvent;
        break;
      default:
        // Fallback: text event (legacy behavior)
        newEvent = { type: "text", beat: actualStartBeat, endBeat: actualEndBeat, text: "New Message" } as TextEvent;
        break;
    }

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

  // -------------------------------------------------------------------------
  // Extra lane creation (no validateChart — editor-only)
  // -------------------------------------------------------------------------

  private createExtraPointNote(extraLane: number, beat: Beat): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;
    const extraNotes = this.callbacks.getExtraNotes();
    const newNote: ExtraPointNote = {
      type: this.selectedEntityType as "single" | "double",
      extraLane,
      beat,
    };
    this.callbacks.onExtraNotesUpdate([...extraNotes, newNote]);
  }

  private createExtraRangeNote(extraLane: number, startBeat: Beat, endBeat: Beat): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;
    const extraNotes = this.callbacks.getExtraNotes();

    const actualStartBeat = beatLt(startBeat, endBeat) ? startBeat : beatMin(startBeat, endBeat);
    const actualEndBeat = beatGt(endBeat, startBeat) ? endBeat : beatMax(startBeat, endBeat);

    let headType: "single" | "double";
    let bodyType: "long" | "doubleLong";
    if (this.selectedEntityType === "doubleLong") {
      headType = "double";
      bodyType = "doubleLong";
    } else {
      headType = "single";
      bodyType = "long";
    }

    const bodyNote: ExtraRangeNote = { type: bodyType, extraLane, beat: actualStartBeat, endBeat: actualEndBeat };
    const isZeroLength = actualStartBeat.n * actualEndBeat.d === actualEndBeat.n * actualStartBeat.d;
    const newNotes: ExtraNoteEntity[] = isZeroLength
      ? [bodyNote]
      : [{ type: headType, extraLane, beat: actualStartBeat } as ExtraPointNote, bodyNote];
    this.callbacks.onExtraNotesUpdate([...extraNotes, ...newNotes]);
  }
}

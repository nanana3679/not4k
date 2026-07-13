/**
 * Create Mode — 차트 엔티티 생성 인터랙션 핸들러
 *
 * 포인트 노트, 구간 노트, 마커, 메시지 등을 타임라인에 배치한다. 드래그로 구간
 * 엔티티를 생성한다. 생성은 완전 낙관(RFD 0017) — 의미 위반(중복·겹침)을 만들어도
 * 조용히 커밋하고, 피드백은 해칭+미니맵 틱이 담당한다. 구조 위반은 setChart
 * 게이트가 거부한다. 좌표 배치 가드(isCreatePlacementBlocked)는 별도 축으로 유지.
 */

import type {
  Chart,
  PointNote,
  RangeNote,
  TrillZone,
  ChartEvent,
  Beat,
  Lane,
} from "../../shared";
import { beatLt, beatGt, beatGte, beatLte, beatMin, beatMax, fromAuxIndex } from "../../shared";
import type { EditorMode, PointerGesture, EditResult } from "./editorMode";
import { isCreatePlacementBlocked } from "./createPlacementGuard";

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
  | "stop"
  | "tutorialInput"
  | "tutorialDiagram";

/** All available entity types for cycling (note lane entities only) */
const ENTITY_TYPES: readonly EntityType[] = [
  "single",
  "double",
  "long",
  "doubleLong",
  "trillZone",
] as const;

/** Event entity types (created on extra lanes) */
const EVENT_ENTITY_TYPES: EntityType[] = ["bpm", "timeSignature", "text", "auto", "stop", "tutorialInput", "tutorialDiagram"];

/** Check if an entity type is an event type */
export function isEventEntityType(t: EntityType): boolean {
  return EVENT_ENTITY_TYPES.includes(t);
}

/** Point event types (no drag needed) */
const POINT_EVENT_TYPES: EntityType[] = ["bpm", "timeSignature"];

/** Range event types (need drag for endBeat) */
const RANGE_EVENT_TYPES: EntityType[] = ["text", "auto", "stop", "tutorialInput", "tutorialDiagram"];

/** Internal drag type for tracking what kind of range entity is being created */
type DragType = "rangeNote" | "trillZone" | "event" | "extraRangeNote" | null;
type RangeNoteEntityType = "long" | "doubleLong";

export interface CreateModeCallbacks {
  /** Called when chart data is modified */
  onChartUpdate: (chart: Chart) => void;
  /** Called to convert Y coordinate to Beat */
  yToBeat: (y: number) => Beat;
  /** Called to snap a beat to grid */
  snapBeat: (beat: Beat) => Beat;
  /** Called to get which lane a X coordinate falls in (1-4 for note lanes, null otherwise) */
  xToLane: (x: number) => Lane | null;
  /** 배치 위치가 편집 가능한 시간 범위 안인지 (배치 제약용) */
  isTimeInBounds: (y: number) => boolean;
  /** raw y→beat (스냅 전, 롱노트 head/end 캡 판정용) */
  yToBeatRaw: (y: number) => Beat;
  /** 좌표의 노트 인덱스, 없으면 null (배치 제약: 겹침 방지) */
  hitTestNote: (x: number, y: number) => number | null;
  /** 좌표의 엑스트라 노트 인덱스, 없으면 null (배치 제약: 겹침 방지) */
  hitTestExtraNote: (x: number, y: number) => number | null;
  /** Called to get extra lane number (1~N) from X, or null */
  xToExtraLane?: (x: number) => number | null;
}

export class CreateMode implements EditorMode {
  private chart: Chart;
  private callbacks: CreateModeCallbacks;
  private selectedEntityType: EntityType = "single";
  private _graceMode = false;
  private isDragging: boolean = false;
  private dragStartBeat: Beat | null = null;
  private dragStartLane: Lane | null = null;
  private _dragType: DragType = null;
  private _dragExtraLane: number | null = null;
  private _createEventLane: number | null = null;
  private _dragEntityTypeOverride: RangeNoteEntityType | null = null;
  // single/double로 시작한 드래그에서, 길이 0이면 점노트로 떨어뜨리기 위한 폴백 타입.
  // 명시적 long/doubleLong 드래그(=beginRangeNoteAt, 또는 long 엔티티)에서는 null로 둔다.
  private _dragPointFallback: "single" | "double" | null = null;

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

  /** Grace mode — 배치 시 면제 플래그 부여 (포인트→grace, 싱글롱→holdOnly) */
  get graceMode(): boolean {
    return this._graceMode;
  }

  set graceMode(v: boolean) {
    this._graceMode = v;
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

  /** Begin range-note creation with an explicit long-note type. */
  beginRangeNoteAt(x: number, y: number, type: RangeNoteEntityType): boolean {
    const beat = this.callbacks.snapBeat(this.callbacks.yToBeat(y));

    if (this.callbacks.xToExtraLane) {
      const extraLane = this.callbacks.xToExtraLane(x);
      if (extraLane !== null) {
        this.cancelDrag();
        this.isDragging = true;
        this.dragStartBeat = beat;
        this.dragStartLane = null;
        this._dragExtraLane = extraLane;
        this._dragType = "extraRangeNote";
        this._dragEntityTypeOverride = type;
        return true;
      }
    }

    const lane = this.callbacks.xToLane(x);
    if (lane === null) return false;

    this.cancelDrag();
    this.isDragging = true;
    this.dragStartBeat = beat;
    this.dragStartLane = lane;
    this._dragExtraLane = null;
    this._dragType = "rangeNote";
    this._dragEntityTypeOverride = type;
    return true;
  }

  /** Handle mouse down on timeline */
  /**
   * 통합 포인터 down 진입점. 배치 제약을 스스로 검사하고 통과 시에만 배치한다.
   * (Create 모드는 gesture의 shift/alt/toggle 수식자를 쓰지 않는다.)
   */
  handlePointerDown(gesture: PointerGesture): void {
    if (this.isPlacementBlocked(gesture.x, gesture.y)) return;
    this.onPointerDown(gesture.x, gesture.y);
  }

  /**
   * 이 좌표에 배치가 차단되는지 질의한다(배치 제약).
   * 훅의 터치 예약 게이트에서도 재사용한다.
   */
  isPlacementBlocked(x: number, y: number): boolean {
    const hitIdx = this.callbacks.hitTestNote(x, y);
    const rawBeat = this.callbacks.yToBeatRaw(y);
    return isCreatePlacementBlocked({
      inBounds: this.callbacks.isTimeInBounds(y),
      hitNote: hitIdx !== null ? this.chart.notes[hitIdx] : null,
      lane: this.callbacks.xToLane(x),
      beatFloatRaw: rawBeat.n / rawBeat.d,
      notes: this.chart.notes,
      extraHit: this.callbacks.hitTestExtraNote(x, y),
    });
  }

  /** 통합 포인터 up 진입점. 범위 밖이면 드래그 취소+고스트 숨김, 아니면 배치 확정. */
  handlePointerUp(gesture: PointerGesture): EditResult {
    if (!this.callbacks.isTimeInBounds(gesture.y)) {
      this.cancelDrag();
      return { hideGhost: true };
    }
    this.onPointerUp(gesture.x, gesture.y);
    return {};
  }

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
            this._createEventLane = extraLane;
            this.createEvent(beat, beat);
            this._createEventLane = null;
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
          // 통합 입력: 클릭(길이 0)=단노트, 누른 채 드래그=롱노트. pointerUp에서 결정.
          this.isDragging = true;
          this.dragStartBeat = beat;
          this.dragStartLane = null;
          this._dragExtraLane = extraLane;
          this._dragType = "extraRangeNote";
          this._dragEntityTypeOverride = this.selectedEntityType === "double" ? "doubleLong" : "long";
          this._dragPointFallback = this.selectedEntityType;
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

    // Point/range 통합: single/double는 클릭(길이 0)=단노트, 누른 채 드래그=롱노트.
    // 드래그로 시작하고 pointerUp에서 길이로 결정한다.
    if (
      this.selectedEntityType === "single" ||
      this.selectedEntityType === "double"
    ) {
      this.isDragging = true;
      this.dragStartBeat = beat;
      this.dragStartLane = lane;
      this._dragType = "rangeNote";
      this._dragEntityTypeOverride = this.selectedEntityType === "double" ? "doubleLong" : "long";
      this._dragPointFallback = this.selectedEntityType;
      return;
    }

    // Range entities: long bodies (명시적 long/doubleLong 엔티티 — 길이 0이면 길이 0 바디)
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
    this._dragEntityTypeOverride = null;
    this._dragPointFallback = null;
  }

  /** 두 Beat가 같은 값인지(분수 동치) */
  private isSameBeat(a: Beat, b: Beat): boolean {
    return a.n * b.d === b.n * a.d;
  }

  /** Handle mouse up (end drag, finalize placement) */
  onPointerUp(_x: number, y: number): void {
    if (!this.isDragging) return;

    const endBeat = this.callbacks.snapBeat(this.callbacks.yToBeat(y));

    if (this._dragType === "rangeNote") {
      if (this.dragStartLane !== null && this.dragStartBeat !== null) {
        // single/double 통합 드래그가 길이 0이면 단노트로 떨어뜨린다.
        if (this._dragPointFallback && this.isSameBeat(this.dragStartBeat, endBeat)) {
          this.createPointNote(this.dragStartLane, this.dragStartBeat);
        } else {
          this.createRangeNote(this.dragStartLane, this.dragStartBeat, endBeat);
        }
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
        if (this._dragPointFallback && this.isSameBeat(this.dragStartBeat, endBeat)) {
          this.createExtraPointNote(this._dragExtraLane, this.dragStartBeat);
        } else {
          this.createExtraRangeNote(this._dragExtraLane, this.dragStartBeat, endBeat);
        }
      }
    }

    // Reset drag state
    this.isDragging = false;
    this.dragStartBeat = null;
    this.dragStartLane = null;
    this._dragType = null;
    this._dragExtraLane = null;
    this._dragEntityTypeOverride = null;
    this._dragPointFallback = null;
  }

  /** Handle C+wheel for entity type cycling */
  onWheel(deltaY: number, cKeyHeld: boolean): EntityType | null {
    if (!cKeyHeld) return null;

    if (deltaY > 0) {
      this.nextEntityType();
    } else if (deltaY < 0) {
      this.prevEntityType();
    }

    return this.entityType; // Handled → 새 엔티티 타입
  }

  // -------------------------------------------------------------------------
  // Private creation methods — 완전 낙관(RFD 0017): 의미 위반이어도 그대로 커밋.
  // 검증·차단 없음. 구조 게이트는 setChart, 위반 피드백은 해칭.
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
      ...(this._graceMode ? { grace: true } : {}),
    };

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
    } else if (this.currentRangeNoteType() === "doubleLong") {
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
      ...(this._graceMode && (bodyType === "long" || bodyType === "doubleLong") ? { holdOnly: true } : {}),
    };

    // Length 0 (startBeat == endBeat): body only, no head note
    const isZeroLength = actualStartBeat.n * actualEndBeat.d === actualEndBeat.n * actualStartBeat.d;
    const newNotes: (PointNote | RangeNote)[] = isZeroLength
      ? [bodyNote]
      : [{ type: headType, lane, beat: actualStartBeat } as PointNote, bodyNote];

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

    const editorLane = this._createEventLane ?? this._dragExtraLane ?? 1;

    let newEvent: ChartEvent;
    switch (this.selectedEntityType) {
      case "bpm":
        newEvent = { type: "bpm", beat: actualStartBeat, bpm: 120, editorLane };
        break;
      case "timeSignature":
        newEvent = { type: "timeSignature", beat: actualStartBeat, beatPerMeasure: { n: 4, d: 1 }, editorLane };
        break;
      case "text":
        newEvent = { type: "text", beat: actualStartBeat, endBeat: actualEndBeat, text: "New Message", editorLane };
        break;
      case "auto":
        newEvent = { type: "auto", beat: actualStartBeat, endBeat: actualEndBeat, editorLane };
        break;
      case "stop":
        newEvent = { type: "stop", beat: actualStartBeat, endBeat: actualEndBeat, editorLane };
        break;
      case "tutorialInput":
        newEvent = {
          type: "tutorialInput",
          beat: actualStartBeat,
          endBeat: actualEndBeat,
          lane: 1,
          keyCode: "KeyD",
          keyLabel: "D",
          editorLane,
        };
        break;
      case "tutorialDiagram":
        newEvent = {
          type: "tutorialDiagram",
          beat: actualStartBeat,
          endBeat: actualEndBeat,
          diagramId: "connected-switch",
          editorLane,
        };
        break;
      default:
        throw new Error(`Unexpected entity type for event creation: ${this.selectedEntityType}`);
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
  // 보조 레인 생성 — chart.notes에 lane 5+ 노트로 append (RFD 0018 ④d, 통합 축).
  // 보조 노트는 표시 전용이라 validateChart 배치 제약을 적용하지 않는다(기존 동작 계승).
  // -------------------------------------------------------------------------

  private createExtraPointNote(extraLane: number, beat: Beat): void {
    const newNote: PointNote = {
      type: this.selectedEntityType as "single" | "double",
      lane: fromAuxIndex(extraLane),
      beat,
    };
    const updatedChart: Chart = {
      ...this.chart,
      notes: [...this.chart.notes, newNote],
    };
    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }

  private createExtraRangeNote(extraLane: number, startBeat: Beat, endBeat: Beat): void {
    const actualStartBeat = beatLt(startBeat, endBeat) ? startBeat : beatMin(startBeat, endBeat);
    const actualEndBeat = beatGt(endBeat, startBeat) ? endBeat : beatMax(startBeat, endBeat);

    let headType: "single" | "double";
    let bodyType: "long" | "doubleLong";
    if (this.currentRangeNoteType() === "doubleLong") {
      headType = "double";
      bodyType = "doubleLong";
    } else {
      headType = "single";
      bodyType = "long";
    }

    const lane = fromAuxIndex(extraLane);
    const bodyNote: RangeNote = { type: bodyType, lane, beat: actualStartBeat, endBeat: actualEndBeat };
    const isZeroLength = actualStartBeat.n * actualEndBeat.d === actualEndBeat.n * actualStartBeat.d;
    const newNotes: (PointNote | RangeNote)[] = isZeroLength
      ? [bodyNote]
      : [{ type: headType, lane, beat: actualStartBeat } as PointNote, bodyNote];
    const updatedChart: Chart = {
      ...this.chart,
      notes: [...this.chart.notes, ...newNotes],
    };
    this.chart = updatedChart;
    this.callbacks.onChartUpdate(updatedChart);
  }

  private currentRangeNoteType(): RangeNoteEntityType {
    return this._dragEntityTypeOverride ?? (this.selectedEntityType === "doubleLong" ? "doubleLong" : "long");
  }
}

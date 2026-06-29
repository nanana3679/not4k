import type { Chart, NoteEntity, RangeNote, Beat, Lane, ExtraNoteEntity } from "../../shared";
import { validateChart, beatToFloat } from "../../shared";
import { beatAdd, beatSub, beatLt, beatLte } from "../../shared";
import {
  deleteChartNotesAtIndices,
  deleteExtraNotesAtIndices,
} from "../editing/editApplication";
import { ClipboardManager } from "./ClipboardManager";
import { convertMainToExtra, convertExtraToMain, moveExtraByLane } from "./LaneConversion";
import {
  classifySelection,
  selectionBlockReason,
  filterHomogeneousSelection,
  clampTrillBeatOffset,
  translateTrillZone,
} from "./trillZoneSelection";
import type { TrillZone } from "../../shared";

export interface SelectModeCallbacks {
  onChartUpdate: (chart: Chart) => void;
  onSelectionChange: (selectedIndices: Set<number>) => void;
  yToBeat: (y: number) => Beat;
  /** Raw y-to-beat without snap grid (for box select) */
  yToBeatRaw: (y: number) => Beat;
  snapBeat: (beat: Beat) => Beat;
  /** Get the snap grid step as a Beat (= beat(4, snapDivision)) */
  getSnapStep: () => Beat;
  /** Get the maximum valid beat as float (end of last measure) */
  getMaxBeatFloat: () => number;
  xToLane: (x: number) => Lane | null;
  /** Get note index at given coordinates, or null */
  hitTestNote: (x: number, y: number) => number | null;
  /** Get selected RangeNote index whose end point is at (x,y), or null */
  hitTestNoteEnd?: (x: number, y: number) => number | null;
  /** Get event index whose end point is at (x,y), or null */
  hitTestEventEnd?: (x: number, y: number) => number | null;
  /** Get trill zone index whose end point is at (x,y), or null */
  hitTestTrillZoneEnd?: (x: number, y: number) => number | null;
  /** Get trill zone index whose selection handle is at (x,y), or null */
  hitTestTrillZoneHandle?: (x: number, y: number) => number | null;
  /** 구간 단위로 선택된 트릴존 인덱스가 바뀔 때 호출 (강조 표시용) */
  onTrillZoneSelectionChange?: (indices: Set<number>) => void;
  /** Extra lane helpers */
  xToExtraLane?: (x: number) => number | null;
  hitTestExtraNote?: (x: number, y: number) => number | null;
  onExtraNotesUpdate?: (extraNotes: ExtraNoteEntity[]) => void;
  onExtraSelectionChange?: (indices: Set<number>) => void;
  getExtraNotes?: () => ExtraNoteEntity[];
  getExtraLaneCount?: () => number;
  onViolationsChange?: (indices: Set<number>) => void;
  onWarn?: (msg: string) => void;
}

export class SelectMode {
  private chart: Chart;
  private callbacks: SelectModeCallbacks;
  private selectedIndices: Set<number> = new Set();
  private selectedExtraIndices: Set<number> = new Set();

  // Drag state
  private isDragging: boolean = false;
  private dragType: "move" | "moveExtra" | "boxSelect" | "resize" | null = null;
  private dragStartBeat: Beat | null = null;
  private dragStartLane: Lane | null = null;
  private dragStartExtraLane: number | null = null;
  private _boxEndBeat: Beat | null = null;
  private _boxEndLane: Lane | null = null;
  private _boxEndExtraLane: number | null = null;

  // Box select pixel state (for rendering)
  private _boxStartY: number = 0;
  private _boxStartLane: Lane | null = null;
  private _boxStartExtraLane: number | null = null;
  private _boxEndY: number = 0;

  // Move state
  private originalPositions: Map<
    number,
    { beat: Beat; endBeat?: Beat; lane: Lane }
  > = new Map();
  private originalExtraPositions: Map<
    number,
    { beat: Beat; endBeat?: Beat; extraLane: number }
  > = new Map();
  // 트릴 노트 단위 이동 시, 이동을 가두는 트릴 구간(이동 시작 시점 캡처). 트릴 선택이 아니면 null.
  private _trillMoveZone: TrillZone | null = null;
  // 구간 단위 선택: 선택된 트릴존 인덱스. 비어있지 않으면 "구간 단위" 선택 모드.
  private selectedZoneIndices: Set<number> = new Set();
  // 구간 단위 이동 시작 시점의 트릴존 원본 좌표 (인덱스 → 원본)
  private originalZonePositions: Map<number, TrillZone> = new Map();

  // Resize state
  private resizingEntityType: "note" | "event" | "trillZone" | null = null;
  private resizingIndex: number | null = null;
  private resizingOriginalEndBeat: Beat | null = null;
  private resizingOriginalBeat: Beat | null = null;

  // Clipboard & paste state
  private clipboardManager: ClipboardManager = new ClipboardManager();

  constructor(chart: Chart, callbacks: SelectModeCallbacks) {
    this.chart = chart;
    this.callbacks = callbacks;
  }

  setChart(chart: Chart): void {
    this.chart = chart;
    // Clear selection if indices are out of bounds
    const validIndices = new Set<number>();
    for (const idx of this.selectedIndices) {
      if (idx >= 0 && idx < chart.notes.length) {
        validIndices.add(idx);
      }
    }
    if (validIndices.size !== this.selectedIndices.size) {
      this.selectedIndices = validIndices;
      this.callbacks.onSelectionChange(new Set(this.selectedIndices));
    }

    // Validate extra selection bounds
    if (this.selectedExtraIndices.size > 0 && this.callbacks.getExtraNotes) {
      const extraNotes = this.callbacks.getExtraNotes();
      const validExtra = new Set<number>();
      for (const idx of this.selectedExtraIndices) {
        if (idx >= 0 && idx < extraNotes.length) {
          validExtra.add(idx);
        }
      }
      if (validExtra.size !== this.selectedExtraIndices.size) {
        this.selectedExtraIndices = validExtra;
        this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
      }
    }

    // Validate zone-unit selection bounds
    if (this.selectedZoneIndices.size > 0) {
      const validZones = new Set<number>();
      for (const idx of this.selectedZoneIndices) {
        if (idx >= 0 && idx < chart.trillZones.length) validZones.add(idx);
      }
      if (validZones.size !== this.selectedZoneIndices.size) {
        this.selectedZoneIndices = validZones;
        this.emitZoneSelection();
      }
    }
  }

  get selection(): ReadonlySet<number> {
    return this.selectedIndices;
  }

  /** 구간 단위로 선택된 트릴존 인덱스 */
  get selectedZones(): ReadonlySet<number> {
    return this.selectedZoneIndices;
  }

  /** 현재 선택이 구간 단위(트릴존 핸들로 선택)인지 */
  private get isZoneUnitSelection(): boolean {
    return this.selectedZoneIndices.size > 0;
  }

  private emitZoneSelection(): void {
    this.callbacks.onTrillZoneSelectionChange?.(new Set(this.selectedZoneIndices));
  }

  /** 구간 단위 선택 상태를 해제한다(노트 단위 선택으로 전환 시). */
  private clearZoneSelectionState(): void {
    if (this.selectedZoneIndices.size > 0) {
      this.selectedZoneIndices = new Set();
      this.emitZoneSelection();
    }
  }

  /**
   * 트릴존을 구간 단위로 선택한다. 구간 + 그 안의 모든 트릴노트가 한 덩어리로 선택된다.
   * 기존 노트/엑스트라 선택은 해제된다.
   */
  selectZoneUnit(zoneIndex: number): void {
    if (zoneIndex < 0 || zoneIndex >= this.chart.trillZones.length) return;
    this.selectedZoneIndices = new Set([zoneIndex]);
    // 구간에 포함된 트릴노트들을 노트 선택에 채운다(이동·삭제·복사 공용)
    const zone = this.chart.trillZones[zoneIndex];
    this.selectedIndices = new Set();
    for (let i = 0; i < this.chart.notes.length; i++) {
      const n = this.chart.notes[i];
      if (n.lane === zone.lane
        && beatToFloat(n.beat) >= beatToFloat(zone.beat)
        && beatToFloat("endBeat" in n ? (n as RangeNote).endBeat : n.beat) <= beatToFloat(zone.endBeat)) {
        this.selectedIndices.add(i);
      }
    }
    this.selectedExtraIndices.clear();
    this.callbacks.onSelectionChange(new Set(this.selectedIndices));
    this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
    this.emitZoneSelection();
  }

  /** Whether a move drag is currently in progress */
  get isMoveDragging(): boolean {
    return this.isDragging && (this.dragType === "move" || this.dragType === "moveExtra");
  }

  /** Original positions of notes being moved (available during move drag) */
  get moveOrigins(): ReadonlyMap<number, { beat: Beat; endBeat?: Beat; lane: Lane }> {
    return this.originalPositions;
  }

  /**
   * 현재 드래그(끝점 리사이즈 / 구간 단위 이동) 중인 트릴 구간 인덱스. 없으면 null.
   * hover-only 핸들을 드래그 중에는 hover 여부와 무관하게 계속 표시하기 위해 사용한다.
   */
  get draggingTrillZoneIndex(): number | null {
    if (this.dragType === "resize" && this.resizingEntityType === "trillZone") {
      return this.resizingIndex;
    }
    if (this.isMoveDragging && this.selectedZoneIndices.size === 1) {
      return [...this.selectedZoneIndices][0];
    }
    return null;
  }

  /** Whether a box select drag is currently in progress */
  get isBoxSelecting(): boolean {
    return this.isDragging && this.dragType === "boxSelect";
  }

  /** Whether paste preview is active (notes placed but not yet confirmed) */
  get isPendingPaste(): boolean {
    return this.clipboardManager.isPendingPaste;
  }

  /** Whether clipboard has data */
  get hasClipboard(): boolean {
    return this.clipboardManager.hasClipboard;
  }

  /** Current box select rectangle in pixel Y coords (for rendering) */
  get boxSelectPixelRect(): { startY: number; startLane: Lane | null; endY: number; endLane: Lane | null; startExtraLane?: number; endExtraLane?: number } | null {
    if (!this.isBoxSelecting) return null;
    // Allow box select when either main lane or extra lane is set
    if (!this._boxStartLane && this._boxStartExtraLane === null) return null;
    if (!this._boxEndLane && this._boxEndExtraLane === null) return null;
    return {
      startY: this._boxStartY,
      startLane: this._boxStartLane,
      endY: this._boxEndY,
      endLane: this._boxEndLane,
      startExtraLane: this._boxStartExtraLane ?? undefined,
      endExtraLane: this._boxEndExtraLane ?? undefined,
    };
  }

  /** Clear selection */
  clearSelection(): void {
    this.selectedIndices.clear();
    this.callbacks.onSelectionChange(new Set(this.selectedIndices));
    this.selectedExtraIndices.clear();
    this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
    if (this.selectedZoneIndices.size > 0) {
      this.selectedZoneIndices = new Set();
      this.emitZoneSelection();
    }
  }

  /** Select a specific note */
  selectNote(index: number): void {
    if (index >= 0 && index < this.chart.notes.length) {
      this.clearZoneSelectionState();
      this.selectedIndices.clear();
      this.selectedIndices.add(index);
      this.callbacks.onSelectionChange(new Set(this.selectedIndices));
    }
  }

  /** Select a specific extra note */
  selectExtraNote(index: number): void {
    const extraNotes = this.callbacks.getExtraNotes?.() ?? [];
    if (index >= 0 && index < extraNotes.length) {
      this.selectedIndices.clear();
      this.callbacks.onSelectionChange(new Set(this.selectedIndices));
      this.selectedExtraIndices.clear();
      this.selectedExtraIndices.add(index);
      this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
    }
  }

  /** Begin a touch long-press move from a main note without collapsing an existing multi-selection. */
  beginTouchMoveDragFromNote(index: number, x: number, y: number): boolean {
    if (index < 0 || index >= this.chart.notes.length) return false;

    if (!this.selectedIndices.has(index)) {
      this.selectNote(index);
    } else if (this.selectedExtraIndices.size > 0) {
      this.selectedExtraIndices.clear();
      this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
    }

    this.startMainMoveDrag(x, y);
    return this.isMoveDragging;
  }

  /** Begin a touch long-press move from an extra note without collapsing an existing multi-selection. */
  beginTouchMoveDragFromExtraNote(index: number, x: number, y: number): boolean {
    const extraNotes = this.callbacks.getExtraNotes?.() ?? [];
    if (index < 0 || index >= extraNotes.length) return false;

    if (!this.selectedExtraIndices.has(index)) {
      this.selectExtraNote(index);
    } else if (this.selectedIndices.size > 0) {
      this.selectedIndices.clear();
      this.callbacks.onSelectionChange(new Set(this.selectedIndices));
    }

    this.startExtraMoveDrag(x, y);
    return this.isMoveDragging;
  }

  /** Begin dragging the current selection from the given pointer location. */
  beginMoveDrag(x: number, y: number): void {
    if (this.selectedExtraIndices.size > 0) {
      this.startExtraMoveDrag(x, y);
      return;
    }
    this.startMainMoveDrag(x, y);
  }

  /** Begin resizing a main range note end, used by touch long-press handles. */
  beginNoteEndResizeDrag(index: number): boolean {
    const note = this.chart.notes[index];
    if (!note || !this.isRangeNote(note)) return false;

    this.selectedIndices.clear();
    this.selectedIndices.add(index);
    this.callbacks.onSelectionChange(new Set(this.selectedIndices));
    this.selectedExtraIndices.clear();
    this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
    this.startResize("note", index, note.beat, note.endBeat);
    return true;
  }

  /**
   * 동질성 규칙을 지키며 노트를 선택에 추가한다.
   * 트릴 노트는 같은 트릴존끼리만, 트릴/일반은 섞을 수 없다.
   * 막히면 토스트로 이유를 알리고 false를 반환한다(추가 안 됨).
   */
  private tryAddNoteToSelection(index: number): boolean {
    const note = this.chart.notes[index];
    if (!note) return false;
    const kind = classifySelection(this.chart.trillZones, this.chart.notes, this.selectedIndices);
    const reason = selectionBlockReason(kind, this.chart.trillZones, note);
    if (reason) {
      this.callbacks.onWarn?.(reason);
      return false;
    }
    this.selectedIndices.add(index);
    return true;
  }

  // --- Pointer events ---

  /** Handle pointer down */
  onPointerDown(x: number, y: number, shiftKey: boolean, altKey: boolean, toggleSelection = false): void {
    // During pending paste: click empty space to confirm
    if (this.clipboardManager.isPendingPaste) {
      const hitIdx = this.callbacks.hitTestNote(x, y);
      if (hitIdx === null) {
        this.confirmPlacement();
      }
      return;
    }

    // Check for endpoint resize first

    // 1. Selected RangeNote endpoints
    if (this.callbacks.hitTestNoteEnd) {
      const endHit = this.callbacks.hitTestNoteEnd(x, y);
      if (endHit !== null && this.selectedIndices.has(endHit) && this.isRangeNote(this.chart.notes[endHit])) {
        const note = this.chart.notes[endHit] as RangeNote;
        this.startResize("note", endHit, note.beat, note.endBeat);
        return;
      }
    }

    // 2. Event endpoints
    if (this.callbacks.hitTestEventEnd) {
      const evtHit = this.callbacks.hitTestEventEnd(x, y);
      if (evtHit !== null) {
        const evt = this.chart.events[evtHit];
        if (!('endBeat' in evt)) return;
        this.startResize("event", evtHit, evt.beat, evt.endBeat);
        return;
      }
    }

    // 3. Trill zone selection handle (시작=아래의 가로 중앙 박스) → 구간 단위 선택 + 핸들 드래그로 구간째 이동.
    //    이동(시작)과 리사이즈(끝)는 양 끝으로 분리된다. 길이 0 구간(시작==끝)은 이동 핸들 비활성(리사이즈만).
    if (this.callbacks.hitTestTrillZoneHandle) {
      const handleHit = this.callbacks.hitTestTrillZoneHandle(x, y);
      if (handleHit !== null) {
        this.selectZoneUnit(handleHit);
        this.beginMoveDrag(x, y);
        return;
      }
    }

    // 4. Trill zone endpoints (resize)
    if (this.callbacks.hitTestTrillZoneEnd) {
      const zoneHit = this.callbacks.hitTestTrillZoneEnd(x, y);
      if (zoneHit !== null) {
        const zone = this.chart.trillZones[zoneHit];
        this.startResize("trillZone", zoneHit, zone.beat, zone.endBeat);
        return;
      }
    }

    // Extra note hit test
    if (this.callbacks.hitTestExtraNote) {
      const extraHit = this.callbacks.hitTestExtraNote(x, y);
      if (extraHit !== null) {
        if (toggleSelection) {
          if (this.selectedExtraIndices.has(extraHit)) {
            this.selectedExtraIndices.delete(extraHit);
          } else {
            this.selectedExtraIndices.add(extraHit);
          }
        } else if (shiftKey) {
          this.selectedExtraIndices.add(extraHit);
        } else if (altKey) {
          this.selectedExtraIndices.delete(extraHit);
        } else {
          this.selectedIndices.clear();
          this.callbacks.onSelectionChange(new Set(this.selectedIndices));
          this.selectedExtraIndices.clear();
          this.selectedExtraIndices.add(extraHit);
        }
        this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
        return;
      }
    }

    const hitIndex = this.callbacks.hitTestNote(x, y);

    if (hitIndex !== null) {
      // Clicking a note → 노트 단위 선택으로 전환(구간 단위 해제)
      this.clearZoneSelectionState();
      const isAlreadySelected = this.selectedIndices.has(hitIndex);

      if (toggleSelection) {
        if (isAlreadySelected) {
          this.selectedIndices.delete(hitIndex);
          this.callbacks.onSelectionChange(new Set(this.selectedIndices));
        } else if (this.tryAddNoteToSelection(hitIndex)) {
          this.callbacks.onSelectionChange(new Set(this.selectedIndices));
        }
      } else if (shiftKey) {
        // Add to selection (동질성 규칙 적용)
        if (this.tryAddNoteToSelection(hitIndex)) {
          this.callbacks.onSelectionChange(new Set(this.selectedIndices));
        }
      } else if (altKey) {
        // Remove from selection
        this.selectedIndices.delete(hitIndex);
        this.callbacks.onSelectionChange(new Set(this.selectedIndices));
      } else if (isAlreadySelected && this.selectedIndices.size > 0) {
        // Start move drag on selected note
        this.beginMoveDrag(x, y);
      } else {
        // Select this note only
        this.selectedIndices.clear();
        this.selectedIndices.add(hitIndex);
        this.callbacks.onSelectionChange(new Set(this.selectedIndices));
        this.selectedExtraIndices.clear();
        this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
        this.beginMoveDrag(x, y);
      }
    } else {
      // Clicking empty space
      if (!shiftKey && !altKey) {
        // Clear selection and start box select
        this.clearSelection();
        this.isDragging = true;
        this.dragType = "boxSelect";
        this.dragStartBeat = this.callbacks.yToBeatRaw(y);
        this.dragStartLane = this.callbacks.xToLane(x);
        this.dragStartExtraLane = this.callbacks.xToExtraLane?.(x) ?? null;
        this._boxStartY = y;
        this._boxStartLane = this.callbacks.xToLane(x);
        this._boxStartExtraLane = this.callbacks.xToExtraLane?.(x) ?? null;
        this._boxEndY = y;
      }
    }
  }

  /** Handle pointer move */
  onPointerMove(x: number, y: number): void {
    if (!this.isDragging) return;

    if (this.dragType === "resize") {
      if (this.resizingIndex !== null && this.resizingOriginalBeat !== null) {
        const currentBeat = this.callbacks.snapBeat(this.callbacks.yToBeat(y));
        // Clamp: endBeat >= startBeat
        const newEndBeat = beatLte(currentBeat, this.resizingOriginalBeat)
          ? this.resizingOriginalBeat
          : currentBeat;

        if (this.resizingEntityType === "note") {
          const note = this.chart.notes[this.resizingIndex];
          if (this.isRangeNote(note)) {
            const newNotes = [...this.chart.notes];
            newNotes[this.resizingIndex] = { ...note, endBeat: newEndBeat } as RangeNote;
            this.chart = { ...this.chart, notes: newNotes };
          }
        } else if (this.resizingEntityType === "event") {
          const newEvents = [...this.chart.events];
          const evtToResize = newEvents[this.resizingIndex];
          if ('endBeat' in evtToResize) {
            newEvents[this.resizingIndex] = { ...evtToResize, endBeat: newEndBeat };
            this.chart = { ...this.chart, events: newEvents };
          }
        } else if (this.resizingEntityType === "trillZone") {
          const newZones = [...this.chart.trillZones];
          newZones[this.resizingIndex] = { ...newZones[this.resizingIndex], endBeat: newEndBeat };
          this.chart = { ...this.chart, trillZones: newZones };
        }

        this.callbacks.onChartUpdate(this.chart);
      }
      return;
    }

    if (this.dragType === "move") {
      const currentBeat = this.callbacks.yToBeat(y);
      const currentLane = this.callbacks.xToLane(x);

      if (
        this.dragStartBeat &&
        this.dragStartLane &&
        currentLane !== null
      ) {
        // Calculate offset
        let beatOffset = beatSub(
          this.callbacks.snapBeat(currentBeat),
          this.callbacks.snapBeat(this.dragStartBeat),
        );
        let laneOffset = currentLane - this.dragStartLane;

        // 트릴 노트 단위 이동은 구간 안으로만: 레인 변경 금지 + 박자 오프셋 클램프
        if (this._trillMoveZone) {
          laneOffset = 0;
          beatOffset = clampTrillBeatOffset(this._trillMoveZone, this.movePositionList(), beatOffset);
        }

        // Check if lane offset is valid for ALL selected notes
        for (const idx of this.selectedIndices) {
          const original = this.originalPositions.get(idx);
          if (!original) continue;
          const targetLane = original.lane + laneOffset;
          if (targetLane < 1 || targetLane > 4) return; // Block entire move
        }

        // Apply move to all selected notes (with snap)
        const newNotes = [...this.chart.notes];
        for (const idx of this.selectedIndices) {
          const original = this.originalPositions.get(idx);
          if (!original) continue;

          const newLane = (original.lane + laneOffset) as Lane;
          const newBeat = beatAdd(original.beat, beatOffset);

          if (this.isRangeNote(newNotes[idx])) {
            const rangeNote = newNotes[idx] as RangeNote;
            const duration = beatSub(
              original.endBeat!,
              original.beat
            );
            newNotes[idx] = {
              ...rangeNote,
              lane: newLane,
              beat: newBeat,
              endBeat: beatAdd(newBeat, duration),
            };
          } else {
            newNotes[idx] = {
              ...newNotes[idx],
              lane: newLane,
              beat: newBeat,
            };
          }
        }

        // Block if any note goes out of timeline bounds
        if (!this.areNotesInBounds(newNotes, this.selectedIndices)) return;

        // 구간 단위 이동이면 트릴존도 같은 오프셋으로 함께 이동(겹침/범위 검증)
        let newZones = this.chart.trillZones;
        if (this.isZoneUnitSelection) {
          newZones = this.buildMovedZones(laneOffset, beatOffset);
          if (!this.movedZonesInBounds(newZones)) return;
        }

        // Update chart with new positions (preview)
        this.chart = { ...this.chart, notes: newNotes, trillZones: newZones };
        this.callbacks.onChartUpdate(this.chart);
      }
    } else if (this.dragType === "moveExtra") {
      const currentBeat = this.callbacks.yToBeat(y);
      const currentExtraLane = this.callbacks.xToExtraLane?.(x) ?? null;

      if (
        this.dragStartBeat &&
        this.dragStartExtraLane !== null &&
        currentExtraLane !== null &&
        this.callbacks.getExtraNotes &&
        this.callbacks.onExtraNotesUpdate
      ) {
        const beatOffset = beatSub(
          this.callbacks.snapBeat(currentBeat),
          this.callbacks.snapBeat(this.dragStartBeat),
        );
        const laneOffset = currentExtraLane - this.dragStartExtraLane;
        const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;

        for (const idx of this.selectedExtraIndices) {
          const original = this.originalExtraPositions.get(idx);
          if (!original) continue;
          const targetLane = original.extraLane + laneOffset;
          if (targetLane < 1 || targetLane > extraLaneCount) return;
        }

        const extraNotes = this.callbacks.getExtraNotes();
        const newExtraNotes = [...extraNotes];
        for (const idx of this.selectedExtraIndices) {
          const original = this.originalExtraPositions.get(idx);
          const note = newExtraNotes[idx];
          if (!original || !note) continue;

          const newExtraLane = original.extraLane + laneOffset;
          const newBeat = beatAdd(original.beat, beatOffset);

          if ("endBeat" in note) {
            const duration = beatSub(original.endBeat!, original.beat);
            newExtraNotes[idx] = {
              ...note,
              extraLane: newExtraLane,
              beat: newBeat,
              endBeat: beatAdd(newBeat, duration),
            };
          } else {
            newExtraNotes[idx] = {
              ...note,
              extraLane: newExtraLane,
              beat: newBeat,
            };
          }
        }

        if (!this.areExtraNotesInBounds(newExtraNotes, this.selectedExtraIndices)) return;

        this.callbacks.onExtraNotesUpdate(newExtraNotes);
      }
    } else if (this.dragType === "boxSelect") {
      this._boxEndBeat = this.callbacks.yToBeatRaw(y);
      const lane = this.callbacks.xToLane(x);
      // Keep previous _boxEndLane when cursor is outside lane area
      if (lane !== null) {
        this._boxEndLane = lane;
      }
      const extraLane = this.callbacks.xToExtraLane?.(x) ?? null;
      if (extraLane !== null) {
        this._boxEndExtraLane = extraLane;
      }
      this._boxEndY = y;

      this.updateBoxSelection();
    }
  }

  /** Handle pointer up */
  onPointerUp(x: number, y: number): void {
    if (!this.isDragging) return;

    if (this.dragType === "resize") {
      // Validate and commit or rollback
      const errors = validateChart({
        notes: this.chart.notes,
        trillZones: this.chart.trillZones,
        events: this.chart.events,
      });
      if (errors.length > 0) {
        // Rollback: restore original endBeat
        this.rollbackResize();
      } else {
        // Commit
        this.callbacks.onChartUpdate(this.chart);
      }
      this.resizingEntityType = null;
      this.resizingIndex = null;
      this.resizingOriginalEndBeat = null;
      this.resizingOriginalBeat = null;
    } else if (this.dragType === "move") {
      // Validate and commit or rollback
      this.confirmPlacement();
    } else if (this.dragType === "moveExtra") {
      this.originalExtraPositions.clear();
    } else if (this.dragType === "boxSelect") {
      // Update end positions from final pointer position
      this._boxEndBeat = this.callbacks.yToBeatRaw(y);
      const endLane = this.callbacks.xToLane(x);
      if (endLane !== null) {
        this._boxEndLane = endLane;
      }
      const endExtraLane = this.callbacks.xToExtraLane?.(x) ?? null;
      if (endExtraLane !== null) {
        this._boxEndExtraLane = endExtraLane;
      }

      this.updateBoxSelection();
    }

    this._boxEndBeat = null;
    this._boxEndLane = null;
    this._boxEndExtraLane = null;
    this.isDragging = false;
    this.dragType = null;
    this.dragStartBeat = null;
    this.dragStartLane = null;
    this.dragStartExtraLane = null;
  }

  // --- Box select helper ---

  /** Compute selection from current box select state (shared by onPointerMove & onPointerUp) */
  private updateBoxSelection(): void {
    if (!this.dragStartBeat || !this._boxEndBeat) return;

    const startMainLane = this.dragStartLane;
    const endMainLane = this._boxEndLane;
    const startExtraLane = this.dragStartExtraLane;
    const endExtraLane = this._boxEndExtraLane;

    const hasMainLane = startMainLane !== null || endMainLane !== null;
    const hasExtraLane = startExtraLane !== null || endExtraLane !== null;

    // Need at least one lane dimension
    if (!hasMainLane && !hasExtraLane) return;

    const startFirst = beatLt(this.dragStartBeat, this._boxEndBeat);
    const minBeat = startFirst ? this.dragStartBeat : this._boxEndBeat;
    const maxBeat = startFirst ? this._boxEndBeat : this.dragStartBeat;

    // Determine if box crosses from main to extra or vice versa
    // If start is in main and end is in extra (or vice versa), main range extends to lane 4
    // and extra range starts at lane 1
    const crossesIntoExtra = (startMainLane !== null && endExtraLane !== null) ||
                              (startExtraLane !== null && endMainLane !== null);

    // Select main lane notes
    this.selectedIndices.clear();
    if (hasMainLane) {
      // When crossing into extra, include up to lane 4 on the main side
      const effectiveStartMain = startMainLane ?? (crossesIntoExtra ? 1 as Lane : null);
      const effectiveEndMain = endMainLane ?? (crossesIntoExtra ? 4 as Lane : null);

      if (effectiveStartMain !== null && effectiveEndMain !== null) {
        const minLane = Math.min(effectiveStartMain, effectiveEndMain);
        const maxLane = Math.max(effectiveStartMain, effectiveEndMain);

        for (let i = 0; i < this.chart.notes.length; i++) {
          const note = this.chart.notes[i];
          if (note.lane >= minLane && note.lane <= maxLane
              && beatSub(note.beat, minBeat).n >= 0
              && beatSub(maxBeat, note.beat).n >= 0) {
            this.selectedIndices.add(i);
          }
        }
      }
    }
    // 동질성 규칙: 박스에 트릴/일반 또는 서로 다른 구간이 섞이면 한 그룹만 남긴다.
    // (드래그 중 매 프레임 호출되므로 토스트는 띄우지 않고 조용히 한 그룹으로 정리)
    this.selectedIndices = filterHomogeneousSelection(
      this.chart.trillZones,
      this.chart.notes,
      this.selectedIndices,
    ).kept;
    this.callbacks.onSelectionChange(new Set(this.selectedIndices));

    // Select extra lane notes
    this.selectedExtraIndices.clear();
    if (hasExtraLane && this.callbacks.getExtraNotes) {
      // When crossing from main, extra range starts at lane 1
      const effectiveStartExtra = startExtraLane ?? (crossesIntoExtra ? 1 : null);
      const effectiveEndExtra = endExtraLane ?? (crossesIntoExtra ? 1 : null);

      if (effectiveStartExtra !== null && effectiveEndExtra !== null) {
        const minExtraLane = Math.min(effectiveStartExtra, effectiveEndExtra);
        const maxExtraLane = Math.max(effectiveStartExtra, effectiveEndExtra);
        const extraNotes = this.callbacks.getExtraNotes();

        for (let i = 0; i < extraNotes.length; i++) {
          const note = extraNotes[i];
          if (note.extraLane >= minExtraLane && note.extraLane <= maxExtraLane
              && beatSub(note.beat, minBeat).n >= 0
              && beatSub(maxBeat, note.beat).n >= 0) {
            this.selectedExtraIndices.add(i);
          }
        }
      }
    }
    this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
  }

  // --- Keyboard events ---

  /** Move selected notes by one snap unit */
  moveBySnap(direction: "up" | "down"): void {
    if (this.selectedExtraIndices.size > 0) {
      this.moveExtraBySnapImpl(direction);
      return;
    }

    // 구간 단위(빈 구간 포함)는 노트가 없어도 이동 가능
    if (this.selectedIndices.size === 0 && !this.isZoneUnitSelection) return;

    // Get snap unit from current snap setting (assume 1/snap beat)
    const snapStep = this.callbacks.getSnapStep();
    // Timeline: bottom = time 0, up = later time.
    // ArrowUp = increase time (add snap), ArrowDown = decrease time (subtract snap).
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);

    // 구간 단위 선택이면 구간+노트를 함께 자유 이동(상/하)
    if (this.isZoneUnitSelection) {
      this.captureNoteOrigins();
      this.captureZoneOrigins();
      this.applyZoneUnitMove(0, offset);
      return;
    }

    // 트릴 노트 단위 이동은 구간 안에서만: 한 스텝이 구간을 벗어나면 차단
    const snapTrillZone = this.trillZoneOfSelection();
    if (snapTrillZone) {
      const positions = [...this.selectedIndices]
        .map((i) => this.chart.notes[i])
        .filter((n): n is NoteEntity => Boolean(n))
        .map((n) => ({ beat: n.beat, endBeat: "endBeat" in n ? n.endBeat : undefined }));
      const clamped = clampTrillBeatOffset(snapTrillZone, positions, offset);
      if (beatToFloat(clamped) !== beatToFloat(offset)) {
        this.callbacks.onWarn?.("트릴 노트는 구간 안에서만 이동할 수 있습니다");
        return;
      }
    }

    // Store original positions
    this.originalPositions.clear();
    for (const idx of this.selectedIndices) {
      const note = this.chart.notes[idx];
      if (this.isRangeNote(note)) {
        this.originalPositions.set(idx, {
          beat: note.beat,
          endBeat: note.endBeat,
          lane: note.lane,
        });
      } else {
        this.originalPositions.set(idx, {
          beat: note.beat,
          lane: note.lane,
        });
      }
    }

    // Apply move
    const newNotes = [...this.chart.notes];
    for (const idx of this.selectedIndices) {
      const note = newNotes[idx];
      const newBeat = beatAdd(note.beat, offset);

      if (this.isRangeNote(note)) {
        const rangeNote = note as RangeNote;
        const duration = beatSub(rangeNote.endBeat, rangeNote.beat);
        newNotes[idx] = {
          ...rangeNote,
          beat: newBeat,
          endBeat: beatAdd(newBeat, duration),
        };
      } else {
        newNotes[idx] = {
          ...note,
          beat: newBeat,
        };
      }
    }

    // Block if any note goes out of timeline bounds
    if (!this.areNotesInBounds(newNotes, this.selectedIndices)) {
      this.originalPositions.clear();
      return;
    }

    this.chart = { ...this.chart, notes: newNotes };

    // Validate
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length === 0) {
      // Commit
      this.callbacks.onChartUpdate(this.chart);
      this.originalPositions.clear();
    } else {
      // Rollback
      this.rollbackMove();
    }
  }

  /** Move selected notes by one lane (event 레인을 건너뛰고 메인↔엑스트라 레인 간 이동 지원) */
  moveByLane(direction: "left" | "right"): void {
    // 엑스트라 노트가 선택된 경우
    if (this.selectedExtraIndices.size > 0) {
      this.moveExtraByLaneImpl(direction);
      return;
    }

    // 메인 노트가 선택된 경우 (구간 단위는 빈 구간도 가능)
    if (this.selectedIndices.size === 0 && !this.isZoneUnitSelection) return;

    // 구간 단위 선택이면 구간+노트를 함께 자유 이동(좌/우 레인)
    if (this.isZoneUnitSelection) {
      const laneOffset = direction === "left" ? -1 : 1;
      this.captureNoteOrigins();
      this.captureZoneOrigins();
      this.applyZoneUnitMove(laneOffset, { n: 0, d: 1 });
      return;
    }

    // 트릴 노트 단위 선택은 구간(한 레인)을 벗어날 수 없으므로 레인 이동 차단
    if (this.trillZoneOfSelection()) {
      this.callbacks.onWarn?.("트릴 노트는 구간을 벗어날 수 없어 레인 이동이 불가합니다");
      return;
    }

    const laneOffset = direction === "left" ? -1 : 1;
    const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;

    // 메인 레인 4에서 오른쪽 이동 → 엑스트라 레인 1로 변환
    if (direction === "right") {
      const allAtLane4 = [...this.selectedIndices].every(
        (idx) => this.chart.notes[idx].lane === 4,
      );
      if (allAtLane4) {
        if (extraLaneCount === 0) return; // 엑스트라 레인 없으면 차단
        this.convertMainToExtraImpl(1);
        return;
      }
    }

    // Check if all notes can move within main lanes
    for (const idx of this.selectedIndices) {
      const note = this.chart.notes[idx];
      const targetLane = note.lane + laneOffset;
      if (targetLane < 1 || targetLane > 4) return; // Block entire move
    }

    // Apply lane move
    const newNotes = [...this.chart.notes];
    for (const idx of this.selectedIndices) {
      const note = newNotes[idx];
      newNotes[idx] = { ...note, lane: (note.lane + laneOffset) as Lane };
    }

    this.chart = { ...this.chart, notes: newNotes };

    // Validate
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length === 0) {
      this.callbacks.onChartUpdate(this.chart);
    } else {
      // Rollback
      for (const idx of this.selectedIndices) {
        const note = newNotes[idx];
        newNotes[idx] = { ...note, lane: (note.lane - laneOffset) as Lane };
      }
      this.chart = { ...this.chart, notes: newNotes };
      this.callbacks.onChartUpdate(this.chart);
    }
  }

  /** 엑스트라 노트의 스냅 이동 */
  private moveExtraBySnapImpl(direction: "up" | "down"): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;

    const extraNotes = this.callbacks.getExtraNotes();
    const snapStep = this.callbacks.getSnapStep();
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);
    const maxFloat = this.callbacks.getMaxBeatFloat();
    const newExtraNotes = [...extraNotes];

    for (const idx of this.selectedExtraIndices) {
      const note = newExtraNotes[idx];
      if (!note) continue;

      const newBeat = beatAdd(note.beat, offset);
      const newBeatFloat = beatToFloat(newBeat);
      if (newBeatFloat < 0 || newBeatFloat > maxFloat) return;

      if ("endBeat" in note) {
        const duration = beatSub(note.endBeat, note.beat);
        const newEndBeat = beatAdd(newBeat, duration);
        const newEndFloat = beatToFloat(newEndBeat);
        if (newEndFloat < 0 || newEndFloat > maxFloat) return;

        newExtraNotes[idx] = {
          ...note,
          beat: newBeat,
          endBeat: newEndBeat,
        };
      } else {
        newExtraNotes[idx] = {
          ...note,
          beat: newBeat,
        };
      }
    }

    this.callbacks.onExtraNotesUpdate(newExtraNotes);
  }

  /** 엑스트라 노트의 레인 이동 */
  private moveExtraByLaneImpl(direction: "left" | "right"): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;

    const extraNotes = this.callbacks.getExtraNotes();
    const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;

    // 엑스트라 레인 1에서 왼쪽 이동 → 메인 레인 4로 변환
    if (direction === "left") {
      const allAtExtraLane1 = [...this.selectedExtraIndices].every(
        (idx) => extraNotes[idx].extraLane === 1,
      );
      if (allAtExtraLane1) {
        this.convertExtraToMainImpl(4 as Lane);
        return;
      }
    }

    moveExtraByLane(
      this.selectedExtraIndices,
      direction,
      extraLaneCount,
      this.callbacks,
    );
  }

  /** 메인 노트 → 엑스트라 노트로 변환 */
  private convertMainToExtraImpl(targetExtraLane: number): void {
    const result = convertMainToExtra(
      this.chart,
      this.selectedIndices,
      targetExtraLane,
      this.callbacks,
    );
    if (result) {
      this.chart = result.chart;
      this.selectedIndices = result.selectedIndices;
      this.selectedExtraIndices = result.selectedExtraIndices;
    }
  }

  /** 엑스트라 노트 → 메인 노트로 변환 */
  private convertExtraToMainImpl(targetLane: Lane): void {
    const result = convertExtraToMain(
      this.chart,
      this.selectedExtraIndices,
      targetLane,
      this.callbacks,
    );
    if (result) {
      this.chart = result.chart;
      this.selectedIndices = result.selectedIndices;
      this.selectedExtraIndices = result.selectedExtraIndices;
    }
  }

  /** Resize selected long note end by one snap unit */
  resizeEndBySnap(direction: "up" | "down"): void {
    if (this.selectedIndices.size === 0) return;

    // Get snap step
    const snapStep = this.callbacks.getSnapStep();
    // ArrowUp = extend end later (add snap), ArrowDown = shrink end earlier (subtract snap)
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);

    // Store original positions
    this.originalPositions.clear();
    for (const idx of this.selectedIndices) {
      const note = this.chart.notes[idx];
      if (this.isRangeNote(note)) {
        this.originalPositions.set(idx, {
          beat: note.beat,
          endBeat: note.endBeat,
          lane: note.lane,
        });
      }
    }

    // Apply resize (only to range notes, enforce start < end)
    const newNotes = [...this.chart.notes];
    let blocked = false;
    for (const idx of this.selectedIndices) {
      const note = newNotes[idx];
      if (this.isRangeNote(note)) {
        const rangeNote = note as RangeNote;
        const newEndBeat = beatAdd(rangeNote.endBeat, offset);
        // Prevent endBeat from going at or before startBeat
        if (beatLte(newEndBeat, rangeNote.beat)) {
          blocked = true;
          break;
        }
        newNotes[idx] = {
          ...rangeNote,
          endBeat: newEndBeat,
        };
      }
    }

    if (blocked) {
      this.originalPositions.clear();
      return;
    }

    this.chart = { ...this.chart, notes: newNotes };

    // Validate
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length === 0) {
      // Commit
      this.callbacks.onChartUpdate(this.chart);
      this.originalPositions.clear();
    } else {
      // Rollback
      this.rollbackMove();
    }
  }

  /** Confirm placement (Enter key or empty click) */
  confirmPlacement(): void {
    if (this.clipboardManager.isPendingPaste) {
      // Paste mode: validate, reject if violations exist (don't rollback)
      this.clipboardManager.confirmPaste(
        this.chart,
        this.callbacks,
        (chart) => {
          const errors = validateChart({
            notes: chart.notes,
            trillZones: chart.trillZones,
            events: chart.events,
          });
          return errors.map((e) => String(e));
        },
      );
      return;
    }

    if (this.originalPositions.size === 0) return;

    // Move mode: validate, rollback if invalid
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length === 0) {
      // Valid: commit
      this.callbacks.onChartUpdate(this.chart);
      this.originalPositions.clear();
      this.originalZonePositions.clear();
      this._trillMoveZone = null;
    } else {
      // Invalid: rollback
      this.rollbackMove();
    }
  }

  // ---------------------------------------------------------------------------
  // Clipboard: Copy / Cut / Paste
  // ---------------------------------------------------------------------------

  /** Copy selected notes to clipboard */
  /**
   * 복사 대상 트릴 구간을 결정한다.
   * - 구간 단위 선택: 선택된 구간들
   * - 노트 단위 트릴 선택: 그 노트들이 속한 구간(구간 단위로 승격)
   * - 그 외: 없음
   */
  private trillZonesToCopy(): Set<number> {
    if (this.isZoneUnitSelection) return new Set(this.selectedZoneIndices);
    const kind = classifySelection(this.chart.trillZones, this.chart.notes, this.selectedIndices);
    if (kind.kind === "trill" && kind.zoneIndex >= 0) return new Set([kind.zoneIndex]);
    return new Set();
  }

  copy(): number {
    return this.clipboardManager.copy(
      this.chart,
      this.selectedIndices,
      this.selectedExtraIndices,
      this.callbacks,
      this.trillZonesToCopy(),
    );
  }

  /** Cut selected notes (copy + delete) */
  cut(): number {
    if (this.clipboardManager.isPendingPaste) return 0;
    const count = this.copy();
    if (count > 0) {
      this.deleteSelected();
    }
    return count;
  }

  /** Paste clipboard at the given target beat. Returns count of pasted notes, 0 if clipboard empty. */
  paste(targetBeat: Beat): number {
    const result = this.clipboardManager.paste(
      this.chart,
      targetBeat,
      this.callbacks,
      () => this.clearSelection(),
    );
    if (result === null) return 0;

    this.chart = result.chart;
    this.selectedIndices = result.selectedIndices;
    this.selectedExtraIndices = result.selectedExtraIndices;
    return result.count;
  }

  /** Cancel pending paste — remove pasted notes, restore pre-paste state */
  cancelPaste(): void {
    this.chart = this.clipboardManager.cancelPaste(
      this.chart,
      this.callbacks,
      () => this.clearSelection(),
    );
  }

  /**
   * Move pasted notes by snap step (during pending paste).
   * Unlike normal moveBySnap, this does NOT auto-rollback on violations.
   */
  movePasteBySnap(direction: "up" | "down"): void {
    const newChart = this.clipboardManager.movePasteBySnap(
      this.chart,
      direction,
      this.callbacks,
    );
    if (newChart !== null) {
      this.chart = newChart;
    }
  }

  /**
   * Move pasted notes by lane (during pending paste).
   * Does NOT auto-rollback on violations.
   */
  movePasteByLane(direction: "left" | "right"): void {
    const newChart = this.clipboardManager.movePasteByLane(
      this.chart,
      direction,
      this.callbacks,
      (chart) => this.clipboardManager.updatePasteViolations(chart, this.callbacks),
    );
    if (newChart !== null) {
      this.chart = newChart;
    }
  }

  /** Delete selected notes */
  deleteSelected(): void {
    // 구간 단위 선택: 구간 + 안의 노트를 함께 삭제 (빈 구간도 삭제)
    if (this.isZoneUnitSelection) {
      const notes = this.chart.notes.filter((_n, i) => !this.selectedIndices.has(i));
      const trillZones = this.chart.trillZones.filter((_z, i) => !this.selectedZoneIndices.has(i));
      this.chart = { ...this.chart, notes, trillZones };
      this.clearSelection();
      this.callbacks.onChartUpdate(this.chart);
      return;
    }

    // Delete extra notes if selected
    if (this.selectedExtraIndices.size > 0 && this.callbacks.getExtraNotes && this.callbacks.onExtraNotesUpdate) {
      const extraNotes = this.callbacks.getExtraNotes();
      const newExtraNotes = deleteExtraNotesAtIndices(extraNotes, this.selectedExtraIndices);
      this.callbacks.onExtraNotesUpdate(newExtraNotes);
      this.selectedExtraIndices.clear();
      this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
    }

    if (this.selectedIndices.size === 0) return;

    this.chart = deleteChartNotesAtIndices(this.chart, this.selectedIndices);
    this.clearSelection();
    this.callbacks.onChartUpdate(this.chart);
  }

  // --- Private helpers ---

  private startMainMoveDrag(x: number, y: number): void {
    const lane = this.callbacks.xToLane(x);
    // 구간 단위(빈 구간 포함)는 노트가 없어도 이동 가능
    if (lane === null || (this.selectedIndices.size === 0 && !this.isZoneUnitSelection)) return;

    this.isDragging = true;
    this.dragType = "move";
    this.dragStartBeat = this.callbacks.yToBeat(y);
    this.dragStartLane = lane;
    this.dragStartExtraLane = null;

    this.originalPositions.clear();
    this.originalExtraPositions.clear();
    for (const idx of this.selectedIndices) {
      const note = this.chart.notes[idx];
      if (this.isRangeNote(note)) {
        this.originalPositions.set(idx, {
          beat: note.beat,
          endBeat: note.endBeat,
          lane: note.lane,
        });
      } else {
        this.originalPositions.set(idx, {
          beat: note.beat,
          lane: note.lane,
        });
      }
    }
    // 구간 단위면 이동할 트릴존 원본을 캡처(자유 이동), 노트 단위면 가둘 구간을 캡처(제약 이동).
    if (this.isZoneUnitSelection) {
      this._trillMoveZone = null;
      this.captureZoneOrigins();
    } else {
      this._trillMoveZone = this.trillZoneOfSelection();
      this.originalZonePositions.clear();
    }
  }

  /** 현재 선택이 트릴 노트 단위(같은 구간)이면 그 트릴 구간을, 아니면 null을 반환한다. */
  private trillZoneOfSelection(): TrillZone | null {
    const kind = classifySelection(this.chart.trillZones, this.chart.notes, this.selectedIndices);
    if (kind.kind !== "trill" || kind.zoneIndex < 0) return null;
    return this.chart.trillZones[kind.zoneIndex] ?? null;
  }

  /** originalPositions를 {beat, endBeat?} 배열로 변환 (클램프 계산용). */
  private movePositionList(): Array<{ beat: Beat; endBeat?: Beat }> {
    return [...this.originalPositions.values()].map((p) => ({ beat: p.beat, endBeat: p.endBeat }));
  }

  // --- 구간 단위 이동 (선택된 트릴존 + 노트를 한 덩어리로) ---

  /** 이동 시작 시점, 선택된 트릴존들의 원본 좌표를 기록한다. */
  private captureZoneOrigins(): void {
    this.originalZonePositions.clear();
    for (const idx of this.selectedZoneIndices) {
      const zone = this.chart.trillZones[idx];
      if (zone) this.originalZonePositions.set(idx, { ...zone });
    }
  }

  /** 기록된 원본 좌표에 오프셋을 적용한 새 트릴존 배열을 만든다. */
  private buildMovedZones(laneOffset: number, beatOffset: Beat): TrillZone[] {
    if (this.originalZonePositions.size === 0) return this.chart.trillZones;
    const zones = [...this.chart.trillZones];
    for (const [idx, origin] of this.originalZonePositions) {
      zones[idx] = translateTrillZone(origin, laneOffset, beatOffset);
    }
    return zones;
  }

  /** 이동된 트릴존들이 레인(1~4)·타임라인 범위 안에 있는지 검사한다. */
  private movedZonesInBounds(zones: TrillZone[]): boolean {
    const maxFloat = this.callbacks.getMaxBeatFloat();
    for (const idx of this.originalZonePositions.keys()) {
      const zone = zones[idx];
      if (!zone) continue;
      if (zone.lane < 1 || zone.lane > 4) return false;
      if (beatToFloat(zone.beat) < 0 || beatToFloat(zone.endBeat) > maxFloat) return false;
    }
    return true;
  }

  /** 기록된 원본 좌표로 트릴존을 되돌린 새 배열을 만든다. */
  private restoredZones(): TrillZone[] {
    if (this.originalZonePositions.size === 0) return this.chart.trillZones;
    const zones = [...this.chart.trillZones];
    for (const [idx, origin] of this.originalZonePositions) {
      zones[idx] = { ...origin };
    }
    return zones;
  }

  /** 선택된 노트들의 원본 좌표를 기록한다(이동용). */
  private captureNoteOrigins(): void {
    this.originalPositions.clear();
    for (const idx of this.selectedIndices) {
      const note = this.chart.notes[idx];
      if (this.isRangeNote(note)) {
        this.originalPositions.set(idx, { beat: note.beat, endBeat: note.endBeat, lane: note.lane });
      } else {
        this.originalPositions.set(idx, { beat: note.beat, lane: note.lane });
      }
    }
  }

  /**
   * 구간 단위 이동(키보드 등 단발 이동)을 적용한다.
   * originalPositions/originalZonePositions가 미리 캡처되어 있어야 한다.
   * 레인/범위/구간겹침 검증을 통과하면 커밋, 아니면 토스트 후 무변경.
   */
  private applyZoneUnitMove(laneOffset: number, beatOffset: Beat): void {
    const newNotes = [...this.chart.notes];
    for (const [idx, original] of this.originalPositions) {
      const newLane = (original.lane + laneOffset) as Lane;
      const newBeat = beatAdd(original.beat, beatOffset);
      if (this.isRangeNote(newNotes[idx])) {
        const duration = beatSub(original.endBeat!, original.beat);
        newNotes[idx] = { ...newNotes[idx], lane: newLane, beat: newBeat, endBeat: beatAdd(newBeat, duration) } as RangeNote;
      } else {
        newNotes[idx] = { ...newNotes[idx], lane: newLane, beat: newBeat };
      }
    }
    const newZones = this.buildMovedZones(laneOffset, beatOffset);

    // 노트 레인(1~4)·범위, 구간 레인·범위 검증
    let laneOk = true;
    for (const idx of this.originalPositions.keys()) {
      const l = newNotes[idx].lane;
      if (l < 1 || l > 4) { laneOk = false; break; }
    }
    if (!laneOk
      || !this.areNotesInBounds(newNotes, this.selectedIndices)
      || !this.movedZonesInBounds(newZones)) {
      this.callbacks.onWarn?.("더 이상 이동할 수 없습니다");
      this.originalPositions.clear();
      this.originalZonePositions.clear();
      return;
    }

    const candidate = { ...this.chart, notes: newNotes, trillZones: newZones };
    const errors = validateChart({
      notes: candidate.notes,
      trillZones: candidate.trillZones,
      events: candidate.events,
    });
    if (errors.length === 0) {
      this.chart = candidate;
      this.callbacks.onChartUpdate(this.chart);
    } else {
      this.callbacks.onWarn?.("다른 트릴 구간과 겹쳐 이동할 수 없습니다");
    }
    this.originalPositions.clear();
    this.originalZonePositions.clear();
  }

  private startExtraMoveDrag(x: number, y: number): void {
    const extraLane = this.callbacks.xToExtraLane?.(x) ?? null;
    if (
      extraLane === null ||
      this.selectedExtraIndices.size === 0 ||
      !this.callbacks.getExtraNotes
    ) {
      return;
    }

    const extraNotes = this.callbacks.getExtraNotes();
    this.isDragging = true;
    this.dragType = "moveExtra";
    this.dragStartBeat = this.callbacks.yToBeat(y);
    this.dragStartLane = null;
    this.dragStartExtraLane = extraLane;

    this.originalPositions.clear();
    this.originalExtraPositions.clear();
    for (const idx of this.selectedExtraIndices) {
      const note = extraNotes[idx];
      if (!note) continue;
      if ("endBeat" in note) {
        this.originalExtraPositions.set(idx, {
          beat: note.beat,
          endBeat: note.endBeat,
          extraLane: note.extraLane,
        });
      } else {
        this.originalExtraPositions.set(idx, {
          beat: note.beat,
          extraLane: note.extraLane,
        });
      }
    }
  }

  private isRangeNote(note: NoteEntity): note is RangeNote {
    return "endBeat" in note;
  }

  /** Check if all notes in the array are within timeline bounds [0, maxBeat] */
  private areNotesInBounds(notes: NoteEntity[], indices: Set<number>): boolean {
    const maxFloat = this.callbacks.getMaxBeatFloat();

    for (const idx of indices) {
      const note = notes[idx];
      const beatFloat = beatToFloat(note.beat);
      if (beatFloat < 0 || beatFloat > maxFloat) return false;
      if (this.isRangeNote(note)) {
        const endFloat = beatToFloat(note.endBeat);
        if (endFloat < 0 || endFloat > maxFloat) return false;
      }
    }
    return true;
  }

  private areExtraNotesInBounds(notes: ExtraNoteEntity[], indices: Set<number>): boolean {
    const maxFloat = this.callbacks.getMaxBeatFloat();

    for (const idx of indices) {
      const note = notes[idx];
      if (!note) continue;
      const beatFloat = beatToFloat(note.beat);
      if (beatFloat < 0 || beatFloat > maxFloat) return false;
      if ("endBeat" in note) {
        const endFloat = beatToFloat(note.endBeat);
        if (endFloat < 0 || endFloat > maxFloat) return false;
      }
    }
    return true;
  }

  private startResize(
    entityType: "note" | "event" | "trillZone",
    index: number,
    startBeat: Beat,
    endBeat: Beat,
  ): void {
    this.isDragging = true;
    this.dragType = "resize";
    this.resizingEntityType = entityType;
    this.resizingIndex = index;
    this.resizingOriginalBeat = startBeat;
    this.resizingOriginalEndBeat = endBeat;
  }

  private rollbackResize(): void {
    if (this.resizingIndex === null || this.resizingOriginalEndBeat === null) return;

    if (this.resizingEntityType === "note") {
      const newNotes = [...this.chart.notes];
      const note = newNotes[this.resizingIndex];
      if (this.isRangeNote(note)) {
        newNotes[this.resizingIndex] = { ...note, endBeat: this.resizingOriginalEndBeat } as RangeNote;
        this.chart = { ...this.chart, notes: newNotes };
      }
    } else if (this.resizingEntityType === "event") {
      const newEvents = [...this.chart.events];
      const evtToRollback = newEvents[this.resizingIndex];
      if ('endBeat' in evtToRollback) {
        newEvents[this.resizingIndex] = { ...evtToRollback, endBeat: this.resizingOriginalEndBeat };
        this.chart = { ...this.chart, events: newEvents };
      }
    } else if (this.resizingEntityType === "trillZone") {
      const newZones = [...this.chart.trillZones];
      newZones[this.resizingIndex] = { ...newZones[this.resizingIndex], endBeat: this.resizingOriginalEndBeat };
      this.chart = { ...this.chart, trillZones: newZones };
    }

    this.callbacks.onChartUpdate(this.chart);
  }

  private rollbackMove(): void {
    const newNotes = [...this.chart.notes];
    for (const [idx, original] of this.originalPositions) {
      if (this.isRangeNote(newNotes[idx])) {
        newNotes[idx] = {
          ...newNotes[idx],
          lane: original.lane,
          beat: original.beat,
          endBeat: original.endBeat!,
        } as RangeNote;
      } else {
        newNotes[idx] = {
          ...newNotes[idx],
          lane: original.lane,
          beat: original.beat,
        };
      }
    }
    // 구간 단위 이동이었다면 트릴존도 원위치로 되돌린다.
    const restoredZones = this.restoredZones();
    this.chart = { ...this.chart, notes: newNotes, trillZones: restoredZones };
    this.callbacks.onChartUpdate(this.chart);
    this.originalPositions.clear();
    this.originalZonePositions.clear();
    this._trillMoveZone = null;
  }
}

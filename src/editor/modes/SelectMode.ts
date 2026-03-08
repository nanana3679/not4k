import type { Chart, NoteEntity, RangeNote, Beat, Lane, ExtraNoteEntity } from "../../shared";
import { validateChart, beatToFloat } from "../../shared";
import { beatAdd, beatSub, beatEq, beatLte, beatGt, beatLt, beatGte } from "../../shared";

/** Clipboard data for copy/paste */
interface NoteClipboard {
  notes: NoteEntity[];
  extraNotes: ExtraNoteEntity[];
  /** Earliest beat among copied notes (relative offset anchor) */
  anchorBeat: Beat;
}

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
  private dragType: "move" | "boxSelect" | "resize" | null = null;
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

  // Resize state
  private resizingEntityType: "note" | "event" | "trillZone" | null = null;
  private resizingIndex: number | null = null;
  private resizingOriginalEndBeat: Beat | null = null;
  private resizingOriginalBeat: Beat | null = null;

  // Clipboard & paste state
  private clipboard: NoteClipboard | null = null;
  private _isPendingPaste: boolean = false;
  private prePasteNotes: NoteEntity[] | null = null;
  private prePasteExtraNotes: ExtraNoteEntity[] | null = null;
  private pastedNoteIndices: Set<number> = new Set();
  private pastedExtraNoteIndices: Set<number> = new Set();

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
  }

  get selection(): ReadonlySet<number> {
    return this.selectedIndices;
  }

  /** Whether a move drag is currently in progress */
  get isMoveDragging(): boolean {
    return this.isDragging && this.dragType === "move";
  }

  /** Original positions of notes being moved (available during move drag) */
  get moveOrigins(): ReadonlyMap<number, { beat: Beat; endBeat?: Beat; lane: Lane }> {
    return this.originalPositions;
  }

  /** Whether a box select drag is currently in progress */
  get isBoxSelecting(): boolean {
    return this.isDragging && this.dragType === "boxSelect";
  }

  /** Whether paste preview is active (notes placed but not yet confirmed) */
  get isPendingPaste(): boolean {
    return this._isPendingPaste;
  }

  /** Whether clipboard has data */
  get hasClipboard(): boolean {
    return this.clipboard !== null;
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
  }

  /** Select a specific note */
  selectNote(index: number): void {
    if (index >= 0 && index < this.chart.notes.length) {
      this.selectedIndices.clear();
      this.selectedIndices.add(index);
      this.callbacks.onSelectionChange(new Set(this.selectedIndices));
    }
  }

  // --- Pointer events ---

  /** Handle pointer down */
  onPointerDown(x: number, y: number, shiftKey: boolean, altKey: boolean): void {
    // During pending paste: click empty space to confirm
    if (this._isPendingPaste) {
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
        this.startResize("event", evtHit, evt.beat, evt.endBeat);
        return;
      }
    }

    // 3. Trill zone endpoints
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
        if (shiftKey) {
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
      // Clicking a note
      const isAlreadySelected = this.selectedIndices.has(hitIndex);

      if (shiftKey) {
        // Add to selection
        this.selectedIndices.add(hitIndex);
        this.callbacks.onSelectionChange(new Set(this.selectedIndices));
      } else if (altKey) {
        // Remove from selection
        this.selectedIndices.delete(hitIndex);
        this.callbacks.onSelectionChange(new Set(this.selectedIndices));
      } else if (isAlreadySelected && this.selectedIndices.size > 0) {
        // Start move drag on selected note
        this.isDragging = true;
        this.dragType = "move";
        this.dragStartBeat = this.callbacks.yToBeat(y);
        this.dragStartLane = this.callbacks.xToLane(x);

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
      } else {
        // Select this note only
        this.selectedIndices.clear();
        this.selectedIndices.add(hitIndex);
        this.callbacks.onSelectionChange(new Set(this.selectedIndices));
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
          newEvents[this.resizingIndex] = { ...newEvents[this.resizingIndex], endBeat: newEndBeat };
          this.chart = { ...this.chart, events: newEvents };
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
        const beatOffset = beatSub(currentBeat, this.dragStartBeat);
        const laneOffset = currentLane - this.dragStartLane;

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
          const newBeat = this.callbacks.snapBeat(
            beatAdd(original.beat, beatOffset)
          );

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

        // Update chart with new positions (preview)
        this.chart = { ...this.chart, notes: newNotes };
        this.callbacks.onChartUpdate(this.chart);
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

    const minBeat = beatSub(this.dragStartBeat, this._boxEndBeat).n < 0
      ? this.dragStartBeat : this._boxEndBeat;
    const maxBeat = beatSub(this.dragStartBeat, this._boxEndBeat).n < 0
      ? this._boxEndBeat : this.dragStartBeat;

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
    if (this.selectedIndices.size === 0) return;

    // Get snap unit from current snap setting (assume 1/snap beat)
    const snapStep = this.callbacks.getSnapStep();
    // Timeline: bottom = time 0, up = later time.
    // ArrowUp = increase time (add snap), ArrowDown = decrease time (subtract snap).
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
      this.moveExtraByLane(direction);
      return;
    }

    // 메인 노트가 선택된 경우
    if (this.selectedIndices.size === 0) return;

    const laneOffset = direction === "left" ? -1 : 1;
    const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;

    // 메인 레인 4에서 오른쪽 이동 → 엑스트라 레인 1로 변환
    if (direction === "right") {
      const allAtLane4 = [...this.selectedIndices].every(
        (idx) => this.chart.notes[idx].lane === 4,
      );
      if (allAtLane4) {
        if (extraLaneCount === 0) return; // 엑스트라 레인 없으면 차단
        this.convertMainToExtra(1);
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

  /** 엑스트라 노트의 레인 이동 */
  private moveExtraByLane(direction: "left" | "right"): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;

    const extraNotes = this.callbacks.getExtraNotes();
    const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;
    const laneOffset = direction === "left" ? -1 : 1;

    // 엑스트라 레인 1에서 왼쪽 이동 → 메인 레인 4로 변환
    if (direction === "left") {
      const allAtExtraLane1 = [...this.selectedExtraIndices].every(
        (idx) => extraNotes[idx].extraLane === 1,
      );
      if (allAtExtraLane1) {
        this.convertExtraToMain(4 as Lane);
        return;
      }
    }

    // Check if all extra notes can move within extra lanes
    for (const idx of this.selectedExtraIndices) {
      const note = extraNotes[idx];
      const targetLane = note.extraLane + laneOffset;
      if (targetLane < 1 || targetLane > extraLaneCount) return;
    }

    // Apply extra lane move
    const newExtraNotes = [...extraNotes];
    for (const idx of this.selectedExtraIndices) {
      const note = newExtraNotes[idx];
      newExtraNotes[idx] = { ...note, extraLane: note.extraLane + laneOffset };
    }

    this.callbacks.onExtraNotesUpdate(newExtraNotes);
  }

  /** 메인 노트 → 엑스트라 노트로 변환 (선택된 노트를 chart.notes에서 제거하고 extraNotes에 추가) */
  private convertMainToExtra(targetExtraLane: number): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;

    const extraNotes = this.callbacks.getExtraNotes();
    const selectedSorted = [...this.selectedIndices].sort((a, b) => a - b);

    // 선택된 메인 노트를 엑스트라 노트로 변환
    const convertedExtraNotes: ExtraNoteEntity[] = [];
    for (const idx of selectedSorted) {
      const note = this.chart.notes[idx];
      if (this.isRangeNote(note)) {
        convertedExtraNotes.push({
          type: note.type,
          extraLane: targetExtraLane,
          beat: note.beat,
          endBeat: note.endBeat,
        } as ExtraNoteEntity);
      } else {
        convertedExtraNotes.push({
          type: note.type,
          extraLane: targetExtraLane,
          beat: note.beat,
        } as ExtraNoteEntity);
      }
    }

    // 메인 노트에서 선택된 노트 제거
    const newNotes = this.chart.notes.filter(
      (_note, idx) => !this.selectedIndices.has(idx),
    );
    this.chart = { ...this.chart, notes: newNotes };
    this.callbacks.onChartUpdate(this.chart);

    // 엑스트라 노트에 추가
    const newExtraNotes = [...extraNotes, ...convertedExtraNotes];
    this.callbacks.onExtraNotesUpdate(newExtraNotes);

    // 선택 상태 전환: 메인 선택 해제, 엑스트라 선택 설정
    this.selectedIndices.clear();
    this.callbacks.onSelectionChange(new Set(this.selectedIndices));

    this.selectedExtraIndices.clear();
    const baseIdx = extraNotes.length;
    for (let i = 0; i < convertedExtraNotes.length; i++) {
      this.selectedExtraIndices.add(baseIdx + i);
    }
    this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
  }

  /** 엑스트라 노트 → 메인 노트로 변환 (선택된 노트를 extraNotes에서 제거하고 chart.notes에 추가) */
  private convertExtraToMain(targetLane: Lane): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;

    const extraNotes = this.callbacks.getExtraNotes();
    const selectedSorted = [...this.selectedExtraIndices].sort((a, b) => a - b);

    // 선택된 엑스트라 노트를 메인 노트로 변환
    const convertedMainNotes: NoteEntity[] = [];
    for (const idx of selectedSorted) {
      const note = extraNotes[idx];
      if ("endBeat" in note) {
        convertedMainNotes.push({
          type: note.type,
          lane: targetLane,
          beat: note.beat,
          endBeat: note.endBeat,
        } as NoteEntity);
      } else {
        convertedMainNotes.push({
          type: note.type,
          lane: targetLane,
          beat: note.beat,
        } as NoteEntity);
      }
    }

    // 메인 노트에 추가
    const newNotes = [...this.chart.notes, ...convertedMainNotes];
    this.chart = { ...this.chart, notes: newNotes };

    // Validate
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length > 0) {
      // Rollback: 변환 취소
      this.chart = { ...this.chart, notes: this.chart.notes.slice(0, this.chart.notes.length - convertedMainNotes.length) };
      return;
    }

    this.callbacks.onChartUpdate(this.chart);

    // 엑스트라 노트에서 선택된 노트 제거
    const newExtraNotes = extraNotes.filter(
      (_note, idx) => !this.selectedExtraIndices.has(idx),
    );
    this.callbacks.onExtraNotesUpdate(newExtraNotes);

    // 선택 상태 전환: 엑스트라 선택 해제, 메인 선택 설정
    this.selectedExtraIndices.clear();
    this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));

    this.selectedIndices.clear();
    const baseIdx = this.chart.notes.length - convertedMainNotes.length;
    for (let i = 0; i < convertedMainNotes.length; i++) {
      this.selectedIndices.add(baseIdx + i);
    }
    this.callbacks.onSelectionChange(new Set(this.selectedIndices));
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
    if (this._isPendingPaste) {
      // Paste mode: validate, reject if violations exist (don't rollback)
      const errors = validateChart({
        notes: this.chart.notes,
        trillZones: this.chart.trillZones,
        events: this.chart.events,
      });

      if (errors.length === 0) {
        // Valid: commit paste
        this._isPendingPaste = false;
        this.prePasteNotes = null;
        this.prePasteExtraNotes = null;
        this.pastedNoteIndices.clear();
        this.pastedExtraNoteIndices.clear();
        this.callbacks.onChartUpdate(this.chart);
        this.callbacks.onViolationsChange?.(new Set());
      } else {
        // Invalid: reject but keep paste state
        this.callbacks.onWarn?.(`제약 위반 ${errors.length}건 — 배치할 수 없습니다`);
      }
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
    } else {
      // Invalid: rollback
      this.rollbackMove();
    }
  }

  // ---------------------------------------------------------------------------
  // Clipboard: Copy / Cut / Paste
  // ---------------------------------------------------------------------------

  /** Copy selected notes to clipboard */
  copy(): number {
    if (this._isPendingPaste) return 0;

    const noteCount = this.selectedIndices.size;
    const extraNotes: ExtraNoteEntity[] = [];
    const extraIndices = this.selectedExtraIndices;

    if (noteCount === 0 && extraIndices.size === 0) return 0;

    // Deep copy selected notes
    const copiedNotes: NoteEntity[] = [];
    let anchorBeat: Beat | null = null;

    for (const idx of this.selectedIndices) {
      const note = { ...this.chart.notes[idx] };
      copiedNotes.push(note);
      if (anchorBeat === null || beatToFloat(note.beat) < beatToFloat(anchorBeat)) {
        anchorBeat = note.beat;
      }
    }

    // Deep copy selected extra notes
    if (extraIndices.size > 0 && this.callbacks.getExtraNotes) {
      const allExtra = this.callbacks.getExtraNotes();
      for (const idx of extraIndices) {
        const note = { ...allExtra[idx] };
        extraNotes.push(note);
        if (anchorBeat === null || beatToFloat(note.beat) < beatToFloat(anchorBeat)) {
          anchorBeat = note.beat;
        }
      }
    }

    if (anchorBeat === null) return 0;

    this.clipboard = { notes: copiedNotes, extraNotes, anchorBeat };
    return noteCount + extraNotes.length;
  }

  /** Cut selected notes (copy + delete) */
  cut(): number {
    if (this._isPendingPaste) return 0;
    const count = this.copy();
    if (count > 0) {
      this.deleteSelected();
    }
    return count;
  }

  /** Paste clipboard at the given target beat. Returns count of pasted notes, 0 if clipboard empty. */
  paste(targetBeat: Beat): number {
    if (!this.clipboard) return 0;

    // Cancel any existing pending paste first
    if (this._isPendingPaste) {
      this.cancelPaste();
    }

    const { notes: clipNotes, extraNotes: clipExtra, anchorBeat } = this.clipboard;
    if (clipNotes.length === 0 && clipExtra.length === 0) return 0;

    // Save pre-paste state for rollback
    this.prePasteNotes = [...this.chart.notes];
    this.prePasteExtraNotes = this.callbacks.getExtraNotes?.() ?? null;

    // Calculate beat offset: targetBeat - anchorBeat
    const beatOffset = beatSub(targetBeat, anchorBeat);

    // Build pasted notes to check bounds before committing
    const pastedEntries: NoteEntity[] = [];
    for (const clipNote of clipNotes) {
      const newBeat = beatAdd(clipNote.beat, beatOffset);
      if (this.isRangeNote(clipNote)) {
        const rn = clipNote as RangeNote;
        const newEndBeat = beatAdd(rn.endBeat, beatOffset);
        pastedEntries.push({ ...rn, beat: newBeat, endBeat: newEndBeat });
      } else {
        pastedEntries.push({ ...clipNote, beat: newBeat });
      }
    }

    // Bounds check: all pasted notes must be within [0, maxBeat]
    const maxFloat = this.callbacks.getMaxBeatFloat();
    for (const note of pastedEntries) {
      const bf = beatToFloat(note.beat);
      if (bf < 0 || bf > maxFloat) {
        this.callbacks.onWarn?.('붙여넣기 위치가 차트 범위를 벗어납니다');
        return 0;
      }
      if (this.isRangeNote(note)) {
        const ef = beatToFloat(note.endBeat);
        if (ef < 0 || ef > maxFloat) {
          this.callbacks.onWarn?.('붙여넣기 위치가 차트 범위를 벗어납니다');
          return 0;
        }
      }
    }

    // Clear current selection
    this.clearSelection();

    // Append pasted notes
    const newNotes = [...this.chart.notes];
    this.pastedNoteIndices.clear();

    for (const pasted of pastedEntries) {
      const idx = newNotes.length;
      newNotes.push(pasted);
      this.pastedNoteIndices.add(idx);
      this.selectedIndices.add(idx);
    }

    this.chart = { ...this.chart, notes: newNotes };

    // Paste extra notes
    this.pastedExtraNoteIndices.clear();
    if (clipExtra.length > 0 && this.callbacks.getExtraNotes && this.callbacks.onExtraNotesUpdate) {
      const extraNotes = [...this.callbacks.getExtraNotes()];
      for (const clipNote of clipExtra) {
        const newBeat = beatAdd(clipNote.beat, beatOffset);
        let pasted: ExtraNoteEntity;

        if ('endBeat' in clipNote) {
          const newEndBeat = beatAdd(clipNote.endBeat, beatOffset);
          pasted = { ...clipNote, beat: newBeat, endBeat: newEndBeat };
        } else {
          pasted = { ...clipNote, beat: newBeat };
        }

        const idx = extraNotes.length;
        extraNotes.push(pasted);
        this.pastedExtraNoteIndices.add(idx);
        this.selectedExtraIndices.add(idx);
      }

      this.callbacks.onExtraNotesUpdate(extraNotes);
      this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
    }

    // Enter pending paste mode
    this._isPendingPaste = true;

    // Update state
    this.callbacks.onSelectionChange(new Set(this.selectedIndices));
    this.callbacks.onChartUpdate(this.chart);

    // Compute and report violations
    this.updatePasteViolations();

    return clipNotes.length + clipExtra.length;
  }

  /** Cancel pending paste — remove pasted notes, restore pre-paste state */
  cancelPaste(): void {
    if (!this._isPendingPaste) return;

    // Restore regular notes
    if (this.prePasteNotes) {
      this.chart = { ...this.chart, notes: this.prePasteNotes };
      this.prePasteNotes = null;
    }

    // Restore extra notes
    if (this.prePasteExtraNotes && this.callbacks.onExtraNotesUpdate) {
      this.callbacks.onExtraNotesUpdate(this.prePasteExtraNotes);
      this.prePasteExtraNotes = null;
    }

    // Clear paste state
    this._isPendingPaste = false;
    this.pastedNoteIndices.clear();
    this.pastedExtraNoteIndices.clear();

    // Clear selection
    this.clearSelection();

    // Update
    this.callbacks.onChartUpdate(this.chart);
    this.callbacks.onViolationsChange?.(new Set());
  }

  /**
   * Move pasted notes by snap step (during pending paste).
   * Unlike normal moveBySnap, this does NOT auto-rollback on violations.
   */
  movePasteBySnap(direction: "up" | "down"): void {
    if (!this._isPendingPaste || this.pastedNoteIndices.size === 0) return;

    const snapStep = this.callbacks.getSnapStep();
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);

    const newNotes = [...this.chart.notes];
    for (const idx of this.pastedNoteIndices) {
      const note = newNotes[idx];
      const newBeat = beatAdd(note.beat, offset);

      if (this.isRangeNote(note)) {
        const rn = note as RangeNote;
        const duration = beatSub(rn.endBeat, rn.beat);
        newNotes[idx] = { ...rn, beat: newBeat, endBeat: beatAdd(newBeat, duration) };
      } else {
        newNotes[idx] = { ...note, beat: newBeat };
      }
    }

    // Bounds check
    if (!this.areNotesInBounds(newNotes, this.pastedNoteIndices)) return;

    this.chart = { ...this.chart, notes: newNotes };

    // Also move pasted extra notes
    if (this.pastedExtraNoteIndices.size > 0 && this.callbacks.getExtraNotes && this.callbacks.onExtraNotesUpdate) {
      const extraNotes = [...this.callbacks.getExtraNotes()];
      for (const idx of this.pastedExtraNoteIndices) {
        const note = extraNotes[idx];
        const newBeat = beatAdd(note.beat, offset);
        if ('endBeat' in note) {
          const duration = beatSub(note.endBeat, note.beat);
          extraNotes[idx] = { ...note, beat: newBeat, endBeat: beatAdd(newBeat, duration) };
        } else {
          extraNotes[idx] = { ...note, beat: newBeat };
        }
      }
      this.callbacks.onExtraNotesUpdate(extraNotes);
    }

    this.callbacks.onChartUpdate(this.chart);
    this.updatePasteViolations();
  }

  /**
   * Move pasted notes by lane (during pending paste).
   * Does NOT auto-rollback on violations.
   */
  movePasteByLane(direction: "left" | "right"): void {
    if (!this._isPendingPaste || this.pastedNoteIndices.size === 0) return;

    const laneOffset = direction === "left" ? -1 : 1;

    // Check bounds for all pasted notes
    for (const idx of this.pastedNoteIndices) {
      const note = this.chart.notes[idx];
      const targetLane = note.lane + laneOffset;
      if (targetLane < 1 || targetLane > 4) return;
    }

    const newNotes = [...this.chart.notes];
    for (const idx of this.pastedNoteIndices) {
      const note = newNotes[idx];
      newNotes[idx] = { ...note, lane: (note.lane + laneOffset) as Lane };
    }

    this.chart = { ...this.chart, notes: newNotes };
    this.callbacks.onChartUpdate(this.chart);
    this.updatePasteViolations();
  }

  /**
   * Find which pasted note indices violate constraints against existing notes.
   */
  private updatePasteViolations(): void {
    const violations = new Set<number>();
    const notes = this.chart.notes;
    const { trillZones, events } = this.chart;

    for (const pidx of this.pastedNoteIndices) {
      const p = notes[pidx];
      const pIsRange = this.isRangeNote(p);

      for (let i = 0; i < notes.length; i++) {
        if (i === pidx) continue;
        const other = notes[i];
        if (other.lane !== p.lane) continue;

        const otherIsRange = this.isRangeNote(other);

        // Rule 1: Duplicate position (same slot type)
        if (!pIsRange && !otherIsRange && beatEq(p.beat, other.beat)) {
          violations.add(pidx);
        }
        if (pIsRange && otherIsRange && beatEq(p.beat, other.beat)) {
          violations.add(pidx);
        }

        // Rule 2: Long note overlap
        if (otherIsRange) {
          const rn = other as RangeNote;
          const positions: Beat[] = pIsRange
            ? [p.beat, (p as RangeNote).endBeat]
            : [p.beat];
          for (const b of positions) {
            if (beatGt(b, rn.beat) && beatLt(b, rn.endBeat)) {
              violations.add(pidx);
            }
          }
        }
        if (pIsRange) {
          const rn = p as RangeNote;
          const positions: Beat[] = otherIsRange
            ? [other.beat, (other as RangeNote).endBeat]
            : [other.beat];
          for (const b of positions) {
            if (beatGt(b, rn.beat) && beatLt(b, rn.endBeat)) {
              violations.add(pidx);
            }
          }
        }
      }

      // Rule 3: Trill zone exclusive
      const isTrill = p.type === "trill" || p.type === "trillLong";
      let inZone: boolean;
      if (p.type === "trillLong" && pIsRange) {
        const rn = p as RangeNote;
        inZone = trillZones.some(
          (z) => z.lane === p.lane &&
            beatGte(p.beat, z.beat) && beatLte(p.beat, z.endBeat) &&
            beatGte(rn.endBeat, z.beat) && beatLte(rn.endBeat, z.endBeat),
        );
      } else {
        inZone = trillZones.some(
          (z) => z.lane === p.lane &&
            beatGte(p.beat, z.beat) && beatLte(p.beat, z.endBeat),
        );
      }
      if (isTrill && !inZone) violations.add(pidx);
      if (!isTrill && inZone) violations.add(pidx);

      // Rule 6: Stop zone
      for (const evt of events) {
        if (!evt.stop) continue;
        if (beatGte(p.beat, evt.beat) && beatLte(p.beat, evt.endBeat)) {
          violations.add(pidx);
        }
        if (pIsRange) {
          const rn = p as RangeNote;
          if (beatGte(rn.endBeat, evt.beat) && beatLte(rn.endBeat, evt.endBeat)) {
            violations.add(pidx);
          }
        }
      }
    }

    this.callbacks.onViolationsChange?.(violations);
  }

  /** Delete selected notes */
  deleteSelected(): void {
    // Delete extra notes if selected
    if (this.selectedExtraIndices.size > 0 && this.callbacks.getExtraNotes && this.callbacks.onExtraNotesUpdate) {
      const extraNotes = this.callbacks.getExtraNotes();
      const newExtraNotes = extraNotes.filter((_n, idx) => !this.selectedExtraIndices.has(idx));
      this.callbacks.onExtraNotesUpdate(newExtraNotes);
      this.selectedExtraIndices.clear();
      this.callbacks.onExtraSelectionChange?.(new Set(this.selectedExtraIndices));
    }

    if (this.selectedIndices.size === 0) return;

    // Create new notes array without selected indices
    const newNotes = this.chart.notes.filter(
      (_note, idx) => !this.selectedIndices.has(idx)
    );

    // Also check if any selected notes are trill zones and remove them
    const selectedNotes = Array.from(this.selectedIndices).map(
      (idx) => this.chart.notes[idx]
    );
    const trillZonesToRemove = new Set<number>();

    for (let i = 0; i < this.chart.trillZones.length; i++) {
      const zone = this.chart.trillZones[i];
      for (const note of selectedNotes) {
        // Check if this note corresponds to this trill zone
        if (
          note.lane === zone.lane &&
          beatEq(note.beat, zone.beat) &&
          this.isRangeNote(note) &&
          beatEq((note as RangeNote).endBeat, zone.endBeat)
        ) {
          trillZonesToRemove.add(i);
        }
      }
    }

    const newTrillZones = this.chart.trillZones.filter(
      (_zone, idx) => !trillZonesToRemove.has(idx)
    );

    this.chart = {
      ...this.chart,
      notes: newNotes,
      trillZones: newTrillZones,
    };
    this.clearSelection();
    this.callbacks.onChartUpdate(this.chart);
  }

  // --- Private helpers ---

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
      newEvents[this.resizingIndex] = { ...newEvents[this.resizingIndex], endBeat: this.resizingOriginalEndBeat };
      this.chart = { ...this.chart, events: newEvents };
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
    this.chart = { ...this.chart, notes: newNotes };
    this.callbacks.onChartUpdate(this.chart);
    this.originalPositions.clear();
  }
}

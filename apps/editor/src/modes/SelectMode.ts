import type { Chart, NoteEntity, RangeNote, Beat, Lane } from "@not4k/shared";
import { validateChart } from "@not4k/shared";
import { beatAdd, beatSub, beatEq, beatLte } from "@not4k/shared";

export interface SelectModeCallbacks {
  onChartUpdate: (chart: Chart) => void;
  onSelectionChange: (selectedIndices: Set<number>) => void;
  yToBeat: (y: number) => Beat;
  snapBeat: (beat: Beat) => Beat;
  /** Get the snap grid step as a Beat (= beat(4, snapDivision)) */
  getSnapStep: () => Beat;
  xToLane: (x: number) => Lane | null;
  /** Get note index at given coordinates, or null */
  hitTestNote: (x: number, y: number) => number | null;
  /** Get selected RangeNote index whose end point is at (x,y), or null */
  hitTestNoteEnd?: (x: number, y: number) => number | null;
  /** Get message index whose end point is at (x,y), or null */
  hitTestMessageEnd?: (x: number, y: number) => number | null;
  /** Get trill zone index whose end point is at (x,y), or null */
  hitTestTrillZoneEnd?: (x: number, y: number) => number | null;
}

export class SelectMode {
  private chart: Chart;
  private callbacks: SelectModeCallbacks;
  private selectedIndices: Set<number> = new Set();

  // Drag state
  private isDragging: boolean = false;
  private dragType: "move" | "boxSelect" | "resize" | null = null;
  private dragStartBeat: Beat | null = null;
  private dragStartLane: Lane | null = null;

  // Move state
  private originalPositions: Map<
    number,
    { beat: Beat; endBeat?: Beat; lane: Lane }
  > = new Map();

  // Resize state
  private resizingEntityType: "note" | "message" | "trillZone" | null = null;
  private resizingIndex: number | null = null;
  private resizingOriginalEndBeat: Beat | null = null;
  private resizingOriginalBeat: Beat | null = null;

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

  /** Clear selection */
  clearSelection(): void {
    this.selectedIndices.clear();
    this.callbacks.onSelectionChange(new Set(this.selectedIndices));
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

    // 2. Message endpoints
    if (this.callbacks.hitTestMessageEnd) {
      const msgHit = this.callbacks.hitTestMessageEnd(x, y);
      if (msgHit !== null) {
        const msg = this.chart.messages[msgHit];
        this.startResize("message", msgHit, msg.beat, msg.endBeat);
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
        this.dragStartBeat = this.callbacks.yToBeat(y);
        this.dragStartLane = this.callbacks.xToLane(x);
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
        } else if (this.resizingEntityType === "message") {
          const newMessages = [...this.chart.messages];
          newMessages[this.resizingIndex] = { ...newMessages[this.resizingIndex], endBeat: newEndBeat };
          this.chart = { ...this.chart, messages: newMessages };
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

        // Apply move to all selected notes (with snap)
        const newNotes = [...this.chart.notes];
        for (const idx of this.selectedIndices) {
          const original = this.originalPositions.get(idx);
          if (!original) continue;

          const newLane = Math.max(
            1,
            Math.min(4, original.lane + laneOffset)
          ) as Lane;
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

        // Update chart with new positions (preview)
        this.chart = { ...this.chart, notes: newNotes };
        this.callbacks.onChartUpdate(this.chart);
      }
    } else if (this.dragType === "boxSelect") {
      // Box select is handled in onPointerUp
      // Could implement preview here if needed
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
        messages: this.chart.messages,
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
      // Select notes in rectangle
      const endBeat = this.callbacks.yToBeat(y);
      const endLane = this.callbacks.xToLane(x);

      if (this.dragStartBeat && this.dragStartLane && endLane !== null) {
        // Find all notes within the box
        const minBeat =
          beatSub(this.dragStartBeat, endBeat).n < 0
            ? this.dragStartBeat
            : endBeat;
        const maxBeat =
          beatSub(this.dragStartBeat, endBeat).n < 0
            ? endBeat
            : this.dragStartBeat;
        const minLane = Math.min(this.dragStartLane, endLane);
        const maxLane = Math.max(this.dragStartLane, endLane);

        this.selectedIndices.clear();
        for (let i = 0; i < this.chart.notes.length; i++) {
          const note = this.chart.notes[i];
          if (
            note.lane >= minLane &&
            note.lane <= maxLane &&
            beatSub(note.beat, minBeat).n >= 0 && // beatGte: note.beat >= minBeat
            beatSub(maxBeat, note.beat).n >= 0 // beatLte: note.beat <= maxBeat
          ) {
            this.selectedIndices.add(i);
          }
        }
        this.callbacks.onSelectionChange(new Set(this.selectedIndices));
      }
    }

    this.isDragging = false;
    this.dragType = null;
    this.dragStartBeat = null;
    this.dragStartLane = null;
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

    this.chart = { ...this.chart, notes: newNotes };

    // Validate
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      messages: this.chart.messages,
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
      messages: this.chart.messages,
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

  /** Confirm placement (Enter key) */
  confirmPlacement(): void {
    if (this.originalPositions.size === 0) return;

    // Validate current positions
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      messages: this.chart.messages,
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

  /** Delete selected notes */
  deleteSelected(): void {
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

  private startResize(
    entityType: "note" | "message" | "trillZone",
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
    } else if (this.resizingEntityType === "message") {
      const newMessages = [...this.chart.messages];
      newMessages[this.resizingIndex] = { ...newMessages[this.resizingIndex], endBeat: this.resizingOriginalEndBeat };
      this.chart = { ...this.chart, messages: newMessages };
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

import type { Chart, NoteEntity, RangeNote, Beat, Lane } from "@not4k/shared";
import { validateChart } from "@not4k/shared";
import { beatAdd, beatSub, beatEq } from "@not4k/shared";

export interface SelectModeCallbacks {
  onChartUpdate: (chart: Chart) => void;
  onSelectionChange: (selectedIndices: Set<number>) => void;
  yToBeat: (y: number) => Beat;
  snapBeat: (beat: Beat) => Beat;
  xToLane: (x: number) => Lane | null;
  /** Get note index at given coordinates, or null */
  hitTestNote: (x: number, y: number) => number | null;
}

export class SelectMode {
  private chart: Chart;
  private callbacks: SelectModeCallbacks;
  private selectedIndices: Set<number> = new Set();

  // Drag state
  private isDragging: boolean = false;
  private dragType: "move" | "boxSelect" | null = null;
  private dragStartBeat: Beat | null = null;
  private dragStartLane: Lane | null = null;

  // Move state
  private originalPositions: Map<
    number,
    { beat: Beat; endBeat?: Beat; lane: Lane }
  > = new Map();

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
      this.callbacks.onSelectionChange(this.selectedIndices);
    }
  }

  get selection(): ReadonlySet<number> {
    return this.selectedIndices;
  }

  /** Clear selection */
  clearSelection(): void {
    this.selectedIndices.clear();
    this.callbacks.onSelectionChange(this.selectedIndices);
  }

  /** Select a specific note */
  selectNote(index: number): void {
    if (index >= 0 && index < this.chart.notes.length) {
      this.selectedIndices.clear();
      this.selectedIndices.add(index);
      this.callbacks.onSelectionChange(this.selectedIndices);
    }
  }

  // --- Pointer events ---

  /** Handle pointer down */
  onPointerDown(x: number, y: number, shiftKey: boolean, altKey: boolean): void {
    const hitIndex = this.callbacks.hitTestNote(x, y);

    if (hitIndex !== null) {
      // Clicking a note
      const isAlreadySelected = this.selectedIndices.has(hitIndex);

      if (shiftKey) {
        // Add to selection
        this.selectedIndices.add(hitIndex);
        this.callbacks.onSelectionChange(this.selectedIndices);
      } else if (altKey) {
        // Remove from selection
        this.selectedIndices.delete(hitIndex);
        this.callbacks.onSelectionChange(this.selectedIndices);
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
        this.callbacks.onSelectionChange(this.selectedIndices);
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

    if (this.dragType === "move") {
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
            !beatSub(note.beat, minBeat).n && // beatGte
            beatSub(maxBeat, note.beat).n >= 0 // beatLte
          ) {
            this.selectedIndices.add(i);
          }
        }
        this.callbacks.onSelectionChange(this.selectedIndices);
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
    const snapUnit = this.callbacks.snapBeat({ n: 1, d: 4 }); // Use quarter note as default
    const offset = direction === "up" ? beatSub({ n: 0, d: 1 }, snapUnit) : snapUnit;

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

    // Get snap unit
    const snapUnit = this.callbacks.snapBeat({ n: 1, d: 4 });
    const offset = direction === "up" ? beatSub({ n: 0, d: 1 }, snapUnit) : snapUnit;

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

    // Apply resize (only to range notes)
    const newNotes = [...this.chart.notes];
    for (const idx of this.selectedIndices) {
      const note = newNotes[idx];
      if (this.isRangeNote(note)) {
        const rangeNote = note as RangeNote;
        const newEndBeat = beatAdd(rangeNote.endBeat, offset);
        newNotes[idx] = {
          ...rangeNote,
          endBeat: newEndBeat,
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

import type { Chart, NoteEntity, RangeNote, Beat, Lane, ExtraNoteEntity } from "../../shared";
import { beatToFloat } from "../../shared";
import { beatAdd, beatSub } from "../../shared";
import { computePasteViolations } from "./violationCheck";

/** Clipboard data for copy/paste */
export interface NoteClipboard {
  notes: NoteEntity[];
  extraNotes: ExtraNoteEntity[];
  /** Earliest beat among copied notes (relative offset anchor) */
  anchorBeat: Beat;
}

export interface ClipboardCallbacks {
  getSnapStep: () => Beat;
  getMaxBeatFloat: () => number;
  getExtraNotes?: () => ExtraNoteEntity[];
  onExtraNotesUpdate?: (extraNotes: ExtraNoteEntity[]) => void;
  onExtraSelectionChange?: (indices: Set<number>) => void;
  onViolationsChange?: (indices: Set<number>) => void;
  onWarn?: (msg: string) => void;
  onChartUpdate: (chart: Chart) => void;
  onSelectionChange: (selectedIndices: Set<number>) => void;
}

export interface PasteResult {
  chart: Chart;
  selectedIndices: Set<number>;
  selectedExtraIndices: Set<number>;
  pastedNoteIndices: Set<number>;
  pastedExtraNoteIndices: Set<number>;
  count: number;
}

export interface CancelPasteResult {
  chart: Chart;
}

export class ClipboardManager {
  private clipboard: NoteClipboard | null = null;
  private _isPendingPaste = false;
  private prePasteNotes: NoteEntity[] | null = null;
  private prePasteExtraNotes: ExtraNoteEntity[] | null = null;
  private pastedNoteIndices: Set<number> = new Set();
  private pastedExtraNoteIndices: Set<number> = new Set();

  /** Whether clipboard has data */
  get hasClipboard(): boolean {
    return this.clipboard !== null;
  }

  /** Whether paste preview is active */
  get isPendingPaste(): boolean {
    return this._isPendingPaste;
  }

  /** Read-only access to pasted note indices (for violation overlay etc.) */
  get currentPastedNoteIndices(): ReadonlySet<number> {
    return this.pastedNoteIndices;
  }

  /** Read-only access to pasted extra note indices */
  get currentPastedExtraNoteIndices(): ReadonlySet<number> {
    return this.pastedExtraNoteIndices;
  }

  /**
   * Copy selected notes to clipboard.
   * Returns count of copied notes.
   */
  copy(
    chart: Chart,
    selectedIndices: ReadonlySet<number>,
    selectedExtraIndices: ReadonlySet<number>,
    callbacks: Pick<ClipboardCallbacks, "getExtraNotes">,
  ): number {
    if (this._isPendingPaste) return 0;

    const noteCount = selectedIndices.size;
    const extraNotes: ExtraNoteEntity[] = [];

    if (noteCount === 0 && selectedExtraIndices.size === 0) return 0;

    const copiedNotes: NoteEntity[] = [];
    let anchorBeat: Beat | null = null;

    for (const idx of selectedIndices) {
      const note = { ...chart.notes[idx] };
      copiedNotes.push(note);
      if (anchorBeat === null || beatToFloat(note.beat) < beatToFloat(anchorBeat)) {
        anchorBeat = note.beat;
      }
    }

    if (selectedExtraIndices.size > 0 && callbacks.getExtraNotes) {
      const allExtra = callbacks.getExtraNotes();
      for (const idx of selectedExtraIndices) {
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

  /**
   * Paste clipboard at the given target beat.
   * Returns PasteResult with updated state, or null if clipboard is empty / out of bounds.
   */
  paste(
    chart: Chart,
    targetBeat: Beat,
    callbacks: ClipboardCallbacks,
    clearSelection: () => void,
  ): PasteResult | null {
    if (!this.clipboard) return null;

    if (this._isPendingPaste) {
      this._cancelPasteInternal(chart, callbacks);
    }

    const { notes: clipNotes, extraNotes: clipExtra, anchorBeat } = this.clipboard;
    if (clipNotes.length === 0 && clipExtra.length === 0) return null;

    this.prePasteNotes = [...chart.notes];
    this.prePasteExtraNotes = callbacks.getExtraNotes?.() ?? null;

    const beatOffset = beatSub(targetBeat, anchorBeat);

    const pastedEntries: NoteEntity[] = [];
    for (const clipNote of clipNotes) {
      const newBeat = beatAdd(clipNote.beat, beatOffset);
      if (this._isRangeNote(clipNote)) {
        const rn = clipNote as RangeNote;
        const newEndBeat = beatAdd(rn.endBeat, beatOffset);
        pastedEntries.push({ ...rn, beat: newBeat, endBeat: newEndBeat });
      } else {
        pastedEntries.push({ ...clipNote, beat: newBeat });
      }
    }

    const maxFloat = callbacks.getMaxBeatFloat();
    for (const note of pastedEntries) {
      const bf = beatToFloat(note.beat);
      if (bf < 0 || bf > maxFloat) {
        callbacks.onWarn?.("붙여넣기 위치가 차트 범위를 벗어납니다");
        return null;
      }
      if (this._isRangeNote(note)) {
        const ef = beatToFloat((note as RangeNote).endBeat);
        if (ef < 0 || ef > maxFloat) {
          callbacks.onWarn?.("붙여넣기 위치가 차트 범위를 벗어납니다");
          return null;
        }
      }
    }

    clearSelection();

    const newNotes = [...chart.notes];
    this.pastedNoteIndices.clear();
    const newSelectedIndices = new Set<number>();

    for (const pasted of pastedEntries) {
      const idx = newNotes.length;
      newNotes.push(pasted);
      this.pastedNoteIndices.add(idx);
      newSelectedIndices.add(idx);
    }

    const newChart = { ...chart, notes: newNotes };

    this.pastedExtraNoteIndices.clear();
    const newSelectedExtraIndices = new Set<number>();

    if (clipExtra.length > 0 && callbacks.getExtraNotes && callbacks.onExtraNotesUpdate) {
      const extraNotes = [...callbacks.getExtraNotes()];
      for (const clipNote of clipExtra) {
        const newBeat = beatAdd(clipNote.beat, beatOffset);
        let pasted: ExtraNoteEntity;

        if ("endBeat" in clipNote) {
          const newEndBeat = beatAdd(clipNote.endBeat, beatOffset);
          pasted = { ...clipNote, beat: newBeat, endBeat: newEndBeat };
        } else {
          pasted = { ...clipNote, beat: newBeat };
        }

        const idx = extraNotes.length;
        extraNotes.push(pasted);
        this.pastedExtraNoteIndices.add(idx);
        newSelectedExtraIndices.add(idx);
      }

      callbacks.onExtraNotesUpdate(extraNotes);
      callbacks.onExtraSelectionChange?.(new Set(newSelectedExtraIndices));
    }

    this._isPendingPaste = true;

    callbacks.onSelectionChange(new Set(newSelectedIndices));
    callbacks.onChartUpdate(newChart);

    this._updatePasteViolations(newChart, callbacks);

    return {
      chart: newChart,
      selectedIndices: newSelectedIndices,
      selectedExtraIndices: newSelectedExtraIndices,
      pastedNoteIndices: new Set(this.pastedNoteIndices),
      pastedExtraNoteIndices: new Set(this.pastedExtraNoteIndices),
      count: clipNotes.length + clipExtra.length,
    };
  }

  /**
   * Cancel pending paste — remove pasted notes, restore pre-paste state.
   * Returns the restored chart.
   */
  cancelPaste(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate" | "onExtraNotesUpdate" | "onViolationsChange">,
    clearSelection: () => void,
  ): Chart {
    if (!this._isPendingPaste) return chart;
    return this._cancelPasteInternal(chart, callbacks, clearSelection);
  }

  private _cancelPasteInternal(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate" | "onExtraNotesUpdate" | "onViolationsChange">,
    clearSelection?: () => void,
  ): Chart {
    let newChart = chart;

    if (this.prePasteNotes) {
      newChart = { ...chart, notes: this.prePasteNotes };
      this.prePasteNotes = null;
    }

    if (this.prePasteExtraNotes && callbacks.onExtraNotesUpdate) {
      callbacks.onExtraNotesUpdate(this.prePasteExtraNotes);
      this.prePasteExtraNotes = null;
    }

    this._isPendingPaste = false;
    this.pastedNoteIndices.clear();
    this.pastedExtraNoteIndices.clear();

    clearSelection?.();

    callbacks.onChartUpdate(newChart);
    callbacks.onViolationsChange?.(new Set());

    return newChart;
  }

  /**
   * Move pasted notes by snap step (during pending paste).
   * Does NOT auto-rollback on violations.
   * Returns updated chart, or null if no movement applied.
   */
  movePasteBySnap(
    chart: Chart,
    direction: "up" | "down",
    callbacks: ClipboardCallbacks,
  ): Chart | null {
    if (!this._isPendingPaste || this.pastedNoteIndices.size === 0) return null;

    const snapStep = callbacks.getSnapStep();
    const offset =
      direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);

    const newNotes = [...chart.notes];
    for (const idx of this.pastedNoteIndices) {
      const note = newNotes[idx];
      const newBeat = beatAdd(note.beat, offset);

      if (this._isRangeNote(note)) {
        const rn = note as RangeNote;
        const duration = beatSub(rn.endBeat, rn.beat);
        newNotes[idx] = { ...rn, beat: newBeat, endBeat: beatAdd(newBeat, duration) };
      } else {
        newNotes[idx] = { ...note, beat: newBeat };
      }
    }

    if (!this._areNotesInBounds(newNotes, this.pastedNoteIndices, callbacks.getMaxBeatFloat())) {
      return null;
    }

    const newChart = { ...chart, notes: newNotes };

    if (
      this.pastedExtraNoteIndices.size > 0 &&
      callbacks.getExtraNotes &&
      callbacks.onExtraNotesUpdate
    ) {
      const extraNotes = [...callbacks.getExtraNotes()];
      for (const idx of this.pastedExtraNoteIndices) {
        const note = extraNotes[idx];
        const newBeat = beatAdd(note.beat, offset);
        if ("endBeat" in note) {
          const duration = beatSub(note.endBeat, note.beat);
          extraNotes[idx] = { ...note, beat: newBeat, endBeat: beatAdd(newBeat, duration) };
        } else {
          extraNotes[idx] = { ...note, beat: newBeat };
        }
      }
      callbacks.onExtraNotesUpdate(extraNotes);
    }

    callbacks.onChartUpdate(newChart);
    this._updatePasteViolations(newChart, callbacks);

    return newChart;
  }

  /**
   * Move pasted notes by lane (during pending paste).
   * Does NOT auto-rollback on violations.
   * Returns updated chart, or null if blocked.
   */
  movePasteByLane(
    chart: Chart,
    direction: "left" | "right",
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate" | "onViolationsChange" | "getSnapStep" | "getMaxBeatFloat">,
    updateViolationsFn: (chart: Chart) => void,
  ): Chart | null {
    if (!this._isPendingPaste || this.pastedNoteIndices.size === 0) return null;

    const laneOffset = direction === "left" ? -1 : 1;

    for (const idx of this.pastedNoteIndices) {
      const note = chart.notes[idx];
      const targetLane = note.lane + laneOffset;
      if (targetLane < 1 || targetLane > 4) return null;
    }

    const newNotes = [...chart.notes];
    for (const idx of this.pastedNoteIndices) {
      const note = newNotes[idx];
      newNotes[idx] = { ...note, lane: (note.lane + laneOffset) as Lane };
    }

    const newChart = { ...chart, notes: newNotes };
    callbacks.onChartUpdate(newChart);
    updateViolationsFn(newChart);

    return newChart;
  }

  /**
   * Commit pending paste. Returns true if committed, false if violations prevent it.
   */
  confirmPaste(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate" | "onViolationsChange" | "onWarn">,
    validateFn: (chart: Chart) => string[],
  ): boolean {
    if (!this._isPendingPaste) return false;

    const errors = validateFn(chart);
    if (errors.length === 0) {
      this._isPendingPaste = false;
      this.prePasteNotes = null;
      this.prePasteExtraNotes = null;
      this.pastedNoteIndices.clear();
      this.pastedExtraNoteIndices.clear();
      callbacks.onChartUpdate(chart);
      callbacks.onViolationsChange?.(new Set());
      return true;
    } else {
      callbacks.onWarn?.(`제약 위반 ${errors.length}건 — 배치할 수 없습니다`);
      return false;
    }
  }

  /**
   * Compute and report pasted note violations.
   * Called internally and exposed for SelectMode to call after movePasteByLane.
   */
  updatePasteViolations(chart: Chart, callbacks: Pick<ClipboardCallbacks, "onViolationsChange">): void {
    this._updatePasteViolations(chart, callbacks);
  }

  private _updatePasteViolations(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onViolationsChange">,
  ): void {
    const violations = computePasteViolations(chart, this.pastedNoteIndices);
    callbacks.onViolationsChange?.(violations);
  }

  private _isRangeNote(note: NoteEntity | ExtraNoteEntity): note is RangeNote {
    return "endBeat" in note;
  }

  private _areNotesInBounds(
    notes: NoteEntity[],
    indices: ReadonlySet<number>,
    maxFloat: number,
  ): boolean {
    for (const idx of indices) {
      const note = notes[idx];
      const beatFloat = beatToFloat(note.beat);
      if (beatFloat < 0 || beatFloat > maxFloat) return false;
      if (this._isRangeNote(note)) {
        const endFloat = beatToFloat((note as RangeNote).endBeat);
        if (endFloat < 0 || endFloat > maxFloat) return false;
      }
    }
    return true;
  }
}

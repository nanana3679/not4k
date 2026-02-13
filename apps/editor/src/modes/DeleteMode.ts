import type { Chart, RangeNote } from "@not4k/shared";
import { beatEq } from "@not4k/shared";

export interface DeleteModeCallbacks {
  onChartUpdate: (chart: Chart) => void;
  hitTestNote: (x: number, y: number) => number | null;
}

export class DeleteMode {
  private chart: Chart;
  private callbacks: DeleteModeCallbacks;

  constructor(chart: Chart, callbacks: DeleteModeCallbacks) {
    this.chart = chart;
    this.callbacks = callbacks;
  }

  setChart(chart: Chart): void {
    this.chart = chart;
  }

  /** Click to delete */
  onPointerDown(x: number, y: number): void {
    const result = DeleteMode.deleteNoteAtPoint(
      this.chart,
      this.callbacks.hitTestNote,
      x,
      y
    );

    if (result !== null) {
      this.chart = result;
      this.callbacks.onChartUpdate(result);
    }
  }

  /** Right-click delete (mode-independent, also called from other modes) */
  static deleteNoteAtPoint(
    chart: Chart,
    hitTestNote: (x: number, y: number) => number | null,
    x: number,
    y: number
  ): Chart | null {
    const hitIndex = hitTestNote(x, y);
    if (hitIndex === null) return null;

    const noteToDelete = chart.notes[hitIndex];

    // Create new notes array without the deleted note
    const newNotes = chart.notes.filter((_note, idx) => idx !== hitIndex);

    // Check if this note corresponds to a trill zone and remove it
    let newTrillZones = chart.trillZones;
    if (this.isRangeNote(noteToDelete)) {
      const rangeNote = noteToDelete as RangeNote;
      newTrillZones = chart.trillZones.filter((zone) => {
        return !(
          zone.lane === rangeNote.lane &&
          beatEq(zone.beat, rangeNote.beat) &&
          beatEq(zone.endBeat, rangeNote.endBeat)
        );
      });
    }

    return {
      ...chart,
      notes: newNotes,
      trillZones: newTrillZones,
    };
  }

  private static isRangeNote(note: { type: string }): boolean {
    return (
      note.type === "singleLongBody" ||
      note.type === "doubleLongBody" ||
      note.type === "trillLongBody"
    );
  }
}

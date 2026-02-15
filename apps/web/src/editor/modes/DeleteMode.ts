import type { Chart, RangeNote } from "@not4k/shared";
import { beatEq } from "@not4k/shared";

export interface DeleteModeCallbacks {
  onChartUpdate: (chart: Chart) => void;
  hitTestNote: (x: number, y: number) => number | null;
  hitTestTrillZone?: (x: number, y: number) => number | null;
  onWarn?: (message: string) => void;
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
    // Try deleting a note first
    const result = DeleteMode.deleteNoteAtPoint(
      this.chart,
      this.callbacks.hitTestNote,
      x,
      y
    );

    if (result !== null) {
      this.chart = result;
      this.callbacks.onChartUpdate(result);
      return;
    }

    // Try deleting a trill zone (only if empty)
    if (this.callbacks.hitTestTrillZone) {
      const zoneIdx = this.callbacks.hitTestTrillZone(x, y);
      if (zoneIdx !== null) {
        const zone = this.chart.trillZones[zoneIdx];
        const hasNotes = this.chart.notes.some((n) =>
          n.lane === zone.lane &&
          n.beat.n / n.beat.d >= zone.beat.n / zone.beat.d &&
          n.beat.n / n.beat.d <= zone.endBeat.n / zone.endBeat.d
        );
        if (hasNotes) {
          this.callbacks.onWarn?.('Zone contains notes — remove them first');
        } else {
          this.chart = {
            ...this.chart,
            trillZones: this.chart.trillZones.filter((_, i) => i !== zoneIdx),
          };
          this.callbacks.onChartUpdate(this.chart);
        }
      }
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
      note.type === "singleLong" ||
      note.type === "doubleLong" ||
      note.type === "trillLong"
    );
  }
}

import type { Chart, ExtraNoteEntity } from "../../shared";
import {
  deleteChartNoteAtIndex,
  deleteEmptyTrillZoneAtIndex,
  deleteExtraNoteAtIndex,
} from "../editing/editApplication";
import type { EditorMode, PointerGesture, EditResult } from "./editorMode";

export interface DeleteModeCallbacks {
  onChartUpdate: (chart: Chart) => void;
  hitTestNote: (x: number, y: number) => number | null;
  hitTestTrillZone?: (x: number, y: number) => number | null;
  hitTestExtraNote?: (x: number, y: number) => number | null;
  onExtraNotesUpdate?: (extraNotes: ExtraNoteEntity[]) => void;
  onExtraSelectionChange?: (indices: Set<number>) => void;
  getExtraNotes?: () => ExtraNoteEntity[];
  onWarn?: (message: string) => void;
}

export class DeleteMode implements EditorMode {
  private chart: Chart;
  private callbacks: DeleteModeCallbacks;

  constructor(chart: Chart, callbacks: DeleteModeCallbacks) {
    this.chart = chart;
    this.callbacks = callbacks;
  }

  setChart(chart: Chart): void {
    this.chart = chart;
  }

  /** Delete 모드는 휠 입력을 처리하지 않는다(항상 미처리 = null). */
  onWheel(): null {
    return null;
  }

  /** 통합 포인터 down 진입점. (Delete 모드는 수식자를 쓰지 않는다.) */
  handlePointerDown(gesture: PointerGesture): EditResult {
    this.onPointerDown(gesture.x, gesture.y);
    return {};
  }

  /** Delete 모드는 up에서 아무것도 하지 않는다(삭제는 down에서 끝난다). */
  handlePointerUp(): EditResult {
    return {};
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

    // Try deleting an extra note
    if (this.callbacks.hitTestExtraNote && this.callbacks.getExtraNotes && this.callbacks.onExtraNotesUpdate) {
      const extraHit = this.callbacks.hitTestExtraNote(x, y);
      if (extraHit !== null) {
        const extraNotes = this.callbacks.getExtraNotes();
        const updatedExtraNotes = deleteExtraNoteAtIndex(extraNotes, extraHit);
        if (updatedExtraNotes === null) return;
        this.callbacks.onExtraNotesUpdate(updatedExtraNotes);
        this.callbacks.onExtraSelectionChange?.(new Set());
        return;
      }
    }

    // Try deleting a trill zone (only if empty)
    if (this.callbacks.hitTestTrillZone) {
      const zoneIdx = this.callbacks.hitTestTrillZone(x, y);
      if (zoneIdx !== null) {
        const result = deleteEmptyTrillZoneAtIndex(this.chart, zoneIdx);
        if (result.blockedReason) {
          this.callbacks.onWarn?.(result.blockedReason);
        } else if (result.chart) {
          this.chart = result.chart;
          this.callbacks.onChartUpdate(result.chart);
        } else {
          return;
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
    return deleteChartNoteAtIndex(chart, hitIndex);
  }
}

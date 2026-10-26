import type { ChartDocument } from "../../shared";
import {
  deleteChartNoteAtIndex,
  deleteEmptyTrillZoneAtIndex,
  deleteRestZoneAtIndex,
} from "../editing/editApplication";
import type { EditorMode, PointerGesture, EditResult } from "./editorMode";
import type { TimelineSpace } from "../timeline/TimelineSpace";
import { bodyCompanionIndices, bodyDeletionBlockReason } from '../editing/explicitEditing';
import { deleteChartNotesAtIndices } from '../editing/editApplication';

export interface DeleteModeCallbacks {
  onChartUpdate: (chart: ChartDocument) => void;
  space: TimelineSpace;
  onWarn?: (message: string) => void;
  getSelectedNotes?: () => ReadonlySet<number>;
}

/**
 * Delete 모드 — 통합 차트(chart.notes 전체, 메인 lane 1..4 + 보조 lane 5+) 하나만 다룬다.
 * 히트테스트·삭제 인덱스가 모두 chart.notes 통합 인덱스 공간이라, 정규형 파티션이
 * 깨진 차트(통합 이동·paste 이후)에서도 클릭한 노트가 정확히 삭제된다 (RFD 0018 ④d).
 */
export class DeleteMode implements EditorMode {
  private chart: ChartDocument;
  private callbacks: DeleteModeCallbacks;

  constructor(chart: ChartDocument, callbacks: DeleteModeCallbacks) {
    this.chart = chart;
    this.callbacks = callbacks;
  }

  setChart(chart: ChartDocument): void {
    this.chart = chart;
  }

  /** Delete 모드는 휠 입력을 처리하지 않는다(항상 미처리 = null). */
  onWheel(): null {
    return null;
  }

  /** 통합 포인터 down 진입점. (Delete 모드는 수식자를 쓰지 않는다.) */
  handlePointerDown(gesture: PointerGesture): void {
    this.onPointerDown(gesture.x, gesture.y);
  }

  /** Delete 모드는 up에서 아무것도 하지 않는다(삭제는 down에서 끝난다). */
  handlePointerUp(): EditResult {
    return {};
  }

  /** Click to delete */
  onPointerDown(x: number, y: number): void {
    // Try deleting a note (메인·보조 통합 — 통합 인덱스로 chart.notes에서 제자리 삭제)
    const result = DeleteMode.deleteNoteAtPoint(
      this.chart,
      this.callbacks.space.hitTestUnifiedNote,
      x,
      y,
      this.callbacks.getSelectedNotes?.(),
      this.callbacks.onWarn,
    );

    if (result !== null) {
      this.chart = result;
      this.callbacks.onChartUpdate(result);
      return;
    }

    // 삭제 보호에 걸린 노트 뒤의 구간을 대신 지우지 않는다.
    if (this.callbacks.space.hitTestUnifiedNote(x, y) !== null) return;

    // Try deleting a trill zone (only if empty)
    const zoneIdx = this.callbacks.space.hitTestTrillZone(x, y);
    if (zoneIdx !== null) {
      const result = deleteEmptyTrillZoneAtIndex(this.chart, zoneIdx);
      if (result.blockedReason) {
        this.callbacks.onWarn?.(result.blockedReason);
      } else if (result.chart) {
        this.chart = result.chart;
        this.callbacks.onChartUpdate(result.chart);
      }
      return;
    }

    // Try deleting a rest zone (RFD 0019 — trillZone 미러, empty 가드 없음)
    const restIdx = this.callbacks.space.hitTestRestZone(x, y);
    if (restIdx !== null) {
      const result = deleteRestZoneAtIndex(this.chart, restIdx);
      if (result) {
        this.chart = result;
        this.callbacks.onChartUpdate(result);
      }
    }
  }

  /** Right-click delete (mode-independent, also called from other modes) */
  static deleteNoteAtPoint(
    chart: ChartDocument,
    hitTestNote: (x: number, y: number) => number | null,
    x: number,
    y: number,
    selected: ReadonlySet<number> = new Set(),
    onWarn?: (message: string) => void,
  ): ChartDocument | null {
    const hitIndex = hitTestNote(x, y);
    if (hitIndex === null) return null;
    if (chart.notes[hitIndex]?.type === 'body') {
      const companions = bodyCompanionIndices(chart.notes, hitIndex);
      const indices = selected.has(hitIndex)
        ? new Set([...companions].filter(index => selected.has(index))) : companions;
      const reason = bodyDeletionBlockReason(chart.notes, indices);
      if (reason) { onWarn?.(reason); return null; }
      return deleteChartNotesAtIndices(chart, indices);
    }
    return deleteChartNoteAtIndex(chart, hitIndex);
  }
}

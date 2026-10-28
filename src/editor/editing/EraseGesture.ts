import type { ChartDocument, DocumentNoteEntity } from '../../shared';
import { beatLte } from '../../shared';
import { DeleteMode } from '../modes/DeleteMode';
import { hitTestNoteAt, hitTestRestZoneAt, hitTestTrillZoneAt, isExplicitScoreNote } from '../timeline/hitTest';

interface EraseCallbacks {
  getChart: () => ChartDocument;
  getSelectedNotes: () => ReadonlySet<number>;
  onChartUpdate: (chart: ChartDocument, transaction: symbol) => void;
  /** onInterrupt는 독립 명령이 이 삭제 transaction을 먼저 확정했을 때 불린다. */
  beginTransaction: (onInterrupt: () => void) => symbol | null;
  commitTransaction: (transaction: symbol) => void;
  cancelTransaction: (transaction: symbol) => void;
  onWarn?: (message: string) => void;
}

/** pointerdown～up의 삭제 수명. 취소 뒤에도 up까지 살아 있어 재삭제를 막는다. */
export class EraseGesture {
  private active = false;
  private token: symbol | null = null;
  // Esc 취소나 독립 명령이 이 누름의 삭제를 끝냈다. 버튼을 뗄 때까지 다시 지우지 않는다.
  private stopped = false;
  private occludersByBody = new Map<DocumentNoteEntity, DocumentNoteEntity[]>();

  constructor(private callbacks: EraseCallbacks) {}

  get isActive(): boolean { return this.active; }
  get transaction(): symbol | undefined { return this.token ?? undefined; }

  begin(): boolean {
    if (this.active) return false;
    this.token = this.callbacks.beginTransaction(() => { this.stopped = true; });
    if (!this.token) return false;
    this.active = true;
    this.stopped = false;
    this.occludersByBody.clear();
    return true;
  }

  erase(lane: number, beatFloat: number): boolean {
    if (!this.active || this.stopped) return false;
    const chart = this.callbacks.getChart();
    const selected = this.callbacks.getSelectedNotes();
    const index = hitTestNoteAt(chart.notes, lane, beatFloat, undefined, selected);
    if (index === null) return false;
    const note = chart.notes[index];
    if (note.type === 'body') {
      // 노트를 지워 드러난 자리만 보호한다. 다른 위치의 바디를 직접 지우는 동작은 유지한다.
      const occluders = this.occludersByBody.get(note) ?? [];
      if (hitTestNoteAt(occluders, lane, beatFloat) !== null) return false;
    }
    const next = DeleteMode.deleteNoteAtPoint(chart, () => index, 0, 0, selected, this.callbacks.onWarn);
    if (!next || next === chart) return false;
    if (isExplicitScoreNote(note)) {
      for (const body of chart.notes) {
        if (body.type !== 'body' || body.lane !== note.lane
          || !beatLte(body.beat, note.beat) || !beatLte(note.beat, body.endBeat)) continue;
        this.occludersByBody.set(body, [...(this.occludersByBody.get(body) ?? []), note]);
      }
    }
    this.callbacks.onChartUpdate(next, this.token!);
    return true;
  }

  /**
   * Delete 모드 터치 삭제. 노트를 먼저 지우고, 그 자리에 노트가 없을 때만 빈 `trillZone`·
   * `restZone`을 같은 transaction에서 지운다. 삭제가 막힌 노트 아래 구간은 대신 지우지 않는다.
   */
  eraseNoteOrZoneAt(lane: number, beatFloat: number): boolean {
    if (this.erase(lane, beatFloat)) return true;
    if (!this.active || this.stopped) return false;
    const chart = this.callbacks.getChart();
    if (hitTestNoteAt(chart.notes, lane, beatFloat) !== null) return false;
    const next = DeleteMode.deleteZoneAtHits(
      chart,
      hitTestTrillZoneAt(chart.trillZones, lane, beatFloat),
      hitTestRestZoneAt(chart.restZones ?? [], lane, beatFloat),
      this.callbacks.onWarn,
    );
    if (!next) return false;
    this.callbacks.onChartUpdate(next, this.token!);
    return true;
  }

  cancel(): void {
    if (!this.active || this.stopped) return;
    this.stopped = true;
    this.callbacks.cancelTransaction(this.token!);
  }

  finish(): void {
    if (!this.active) return;
    if (!this.stopped) this.callbacks.commitTransaction(this.token!);
    this.active = false;
    this.token = null;
    this.stopped = false;
    this.occludersByBody.clear();
  }
}

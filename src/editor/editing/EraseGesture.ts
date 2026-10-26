import type { ChartDocument, DocumentNoteEntity } from '../../shared';
import { beatLte } from '../../shared';
import { DeleteMode } from '../modes/DeleteMode';
import { hitTestNoteAt } from '../timeline/hitTest';

interface EraseCallbacks {
  getChart: () => ChartDocument;
  getSelectedNotes: () => ReadonlySet<number>;
  onChartUpdate: (chart: ChartDocument, transaction: symbol) => void;
  beginTransaction: () => symbol | null;
  commitTransaction: (transaction: symbol) => void;
  cancelTransaction: (transaction: symbol) => void;
  onWarn?: (message: string) => void;
}

/** pointerdown～up의 삭제 수명. 취소 뒤에도 up까지 살아 있어 재삭제를 막는다. */
export class EraseGesture {
  private active = false;
  private token: symbol | null = null;
  private cancelled = false;
  private occludersByBody = new Map<DocumentNoteEntity, DocumentNoteEntity[]>();

  constructor(private callbacks: EraseCallbacks) {}

  get isActive(): boolean { return this.active; }
  get transaction(): symbol | undefined { return this.token ?? undefined; }

  begin(): boolean {
    if (this.active) return false;
    this.token = this.callbacks.beginTransaction();
    if (!this.token) return false;
    this.active = true;
    this.cancelled = false;
    this.occludersByBody.clear();
    return true;
  }

  erase(lane: number, beatFloat: number): boolean {
    if (!this.active || this.cancelled) return false;
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
    if (note.type === 'point' || note.type === 'release' || note.type === 'sustain') {
      for (const body of chart.notes) {
        if (body.type !== 'body' || body.lane !== note.lane
          || !beatLte(body.beat, note.beat) || !beatLte(note.beat, body.endBeat)) continue;
        this.occludersByBody.set(body, [...(this.occludersByBody.get(body) ?? []), note]);
      }
    }
    this.callbacks.onChartUpdate(next, this.token!);
    return true;
  }

  cancel(): void {
    if (!this.active || this.cancelled) return;
    this.cancelled = true;
    this.callbacks.cancelTransaction(this.token!);
  }

  finish(): void {
    if (!this.active) return;
    if (!this.cancelled) this.callbacks.commitTransaction(this.token!);
    this.active = false;
    this.token = null;
    this.cancelled = false;
    this.occludersByBody.clear();
  }
}

import type { Chart, NoteEntity, RangeNote, Beat, TrillZone } from "../../shared";
import { beatToFloat, isVisibleLane, isMainLane } from "../../shared";
import { beatAdd, beatSub } from "../../shared";

/**
 * Clipboard data for copy/paste.
 *
 * RFD 0018 ④: 보조 노트가 chart.notes(lane 5+)로 통합돼 노트 배열 하나가 메인·보조를
 * 모두 담는다 — 별도 extraNotes 축 없이 lane 번호만으로 구분한다.
 */
export interface NoteClipboard {
  notes: NoteEntity[];
  /** 함께 복사된 trillZone(트릴 선택 시 구간째 복사) */
  trillZones: TrillZone[];
  /** Earliest beat among copied notes/zones (relative offset anchor) */
  anchorBeat: Beat;
}

export interface ClipboardCallbacks {
  getSnapStep: () => Beat;
  getMaxBeatFloat: () => number;
  /** 현재 보조 레인 수 — 붙여넣기 이동의 레인 클램프(isVisibleLane)에 쓴다 */
  getExtraLaneCount?: () => number;
  onWarn?: (msg: string) => void;
  onChartUpdate: (chart: Chart) => void;
}

export interface PasteResult {
  chart: Chart;
  selectedIndices: Set<number>;
  pastedNoteIndices: Set<number>;
  count: number;
}

export class ClipboardManager {
  private clipboard: NoteClipboard | null = null;
  private _isPendingPaste = false;
  private prePasteNotes: NoteEntity[] | null = null;
  private prePasteZones: TrillZone[] | null = null;
  private pastedNoteIndices: Set<number> = new Set();
  private pastedZoneIndices: Set<number> = new Set();

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

  /**
   * Copy selected notes (메인·보조 통합 인덱스) to clipboard.
   * Returns count of copied notes + zones.
   */
  copy(
    chart: Chart,
    selectedIndices: ReadonlySet<number>,
    trillZoneIndices: ReadonlySet<number> = new Set(),
  ): number {
    if (this._isPendingPaste) return 0;

    if (selectedIndices.size === 0 && trillZoneIndices.size === 0) return 0;

    const copiedNotes: NoteEntity[] = [];
    let anchorBeat: Beat | null = null;

    for (const idx of selectedIndices) {
      const src = chart.notes[idx];
      if (!src) continue;
      const note = { ...src };
      copiedNotes.push(note);
      if (anchorBeat === null || beatToFloat(note.beat) < beatToFloat(anchorBeat)) {
        anchorBeat = note.beat;
      }
    }

    // trillZone도 함께 복사. 구간 시작도 anchor 후보(구간째 정렬 기준)
    const trillZones: TrillZone[] = [];
    for (const idx of trillZoneIndices) {
      const zone = chart.trillZones[idx];
      if (!zone) continue;
      trillZones.push({ ...zone });
      if (anchorBeat === null || beatToFloat(zone.beat) < beatToFloat(anchorBeat)) {
        anchorBeat = zone.beat;
      }
    }

    if (anchorBeat === null) return 0;

    this.clipboard = { notes: copiedNotes, trillZones, anchorBeat };
    return copiedNotes.length + trillZones.length;
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

    const { notes: clipNotes, trillZones: clipZones, anchorBeat } = this.clipboard;
    if (clipNotes.length === 0 && clipZones.length === 0) return null;

    this.prePasteNotes = [...chart.notes];
    this.prePasteZones = [...chart.trillZones];

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
    // trillZone 범위 검증
    for (const clipZone of clipZones) {
      const sf = beatToFloat(beatAdd(clipZone.beat, beatOffset));
      const ef = beatToFloat(beatAdd(clipZone.endBeat, beatOffset));
      if (sf < 0 || ef > maxFloat) {
        callbacks.onWarn?.("붙여넣기 위치가 차트 범위를 벗어납니다");
        return null;
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

    // trillZone도 함께 붙여넣기(같은 beatOffset, 레인 유지)
    const newZones = [...chart.trillZones];
    this.pastedZoneIndices.clear();
    for (const clipZone of clipZones) {
      const idx = newZones.length;
      newZones.push({
        ...clipZone,
        beat: beatAdd(clipZone.beat, beatOffset),
        endBeat: beatAdd(clipZone.endBeat, beatOffset),
      });
      this.pastedZoneIndices.add(idx);
    }

    const newChart = { ...chart, notes: newNotes, trillZones: newZones };

    this._isPendingPaste = true;

    callbacks.onChartUpdate(newChart);

    return {
      chart: newChart,
      selectedIndices: newSelectedIndices,
      pastedNoteIndices: new Set(this.pastedNoteIndices),
      count: clipNotes.length + clipZones.length,
    };
  }

  /**
   * Cancel pending paste — remove pasted notes, restore pre-paste state.
   * Returns the restored chart.
   */
  cancelPaste(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate">,
    clearSelection: () => void,
  ): Chart {
    if (!this._isPendingPaste) return chart;
    return this._cancelPasteInternal(chart, callbacks, clearSelection);
  }

  private _cancelPasteInternal(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate">,
    clearSelection?: () => void,
  ): Chart {
    let newChart = chart;

    if (this.prePasteNotes) {
      newChart = { ...newChart, notes: this.prePasteNotes };
      this.prePasteNotes = null;
    }

    if (this.prePasteZones) {
      newChart = { ...newChart, trillZones: this.prePasteZones };
      this.prePasteZones = null;
    }

    this._isPendingPaste = false;
    this.pastedNoteIndices.clear();
    this.pastedZoneIndices.clear();

    // 순서 주의: 차트 복원(축소 커밋 → 선택 원자 clear, §3-5 면제 경로) → 선택 해제.
    // 반대면 붙여넣은 위반 노트의 선택 해제가 §3-5 게이트에 막혀 취소가 불가능해진다.
    callbacks.onChartUpdate(newChart);

    clearSelection?.();

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

    // 붙여넣은 trillZone도 함께 이동(상/하)
    const newZones = [...chart.trillZones];
    for (const idx of this.pastedZoneIndices) {
      const zone = newZones[idx];
      newZones[idx] = {
        ...zone,
        beat: beatAdd(zone.beat, offset),
        endBeat: beatAdd(zone.endBeat, offset),
      };
    }

    const newChart = { ...chart, notes: newNotes, trillZones: newZones };
    callbacks.onChartUpdate(newChart);

    return newChart;
  }

  /**
   * Move pasted notes by lane (during pending paste).
   * Does NOT auto-rollback on violations.
   * Returns updated chart, or null if blocked.
   *
   * RFD 0018 ④: 통합 레인 이동 — 메인4↔보조5는 한 칸 연속, 클램프는 isVisibleLane
   * (1..4+extraLaneCount). trillZone은 게임 판정 대상이라 메인 레인(1..4)만.
   */
  movePasteByLane(
    chart: Chart,
    direction: "left" | "right",
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate" | "getExtraLaneCount">,
  ): Chart | null {
    if (!this._isPendingPaste || this.pastedNoteIndices.size === 0) return null;

    const laneOffset = direction === "left" ? -1 : 1;
    const extraLaneCount = callbacks.getExtraLaneCount?.() ?? 0;

    for (const idx of this.pastedNoteIndices) {
      const note = chart.notes[idx];
      if (!isVisibleLane(note.lane + laneOffset, extraLaneCount)) return null;
    }
    // 붙여넣은 trillZone은 메인 레인 범위(1..4)만
    for (const idx of this.pastedZoneIndices) {
      const targetLane = chart.trillZones[idx].lane + laneOffset;
      if (!isMainLane(targetLane)) return null;
    }

    const newNotes = [...chart.notes];
    for (const idx of this.pastedNoteIndices) {
      const note = newNotes[idx];
      newNotes[idx] = { ...note, lane: note.lane + laneOffset };
    }
    const newZones = [...chart.trillZones];
    for (const idx of this.pastedZoneIndices) {
      const zone = newZones[idx];
      newZones[idx] = { ...zone, lane: (zone.lane + laneOffset) as TrillZone["lane"] };
    }

    const newChart = { ...chart, notes: newNotes, trillZones: newZones };
    callbacks.onChartUpdate(newChart);

    return newChart;
  }

  /**
   * Commit pending paste. Returns true if committed, false if violations prevent it.
   */
  confirmPaste(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate" | "onWarn">,
    validateFn: (chart: Chart) => string[],
  ): boolean {
    if (!this._isPendingPaste) return false;

    const errors = validateFn(chart);
    if (errors.length === 0) {
      this._isPendingPaste = false;
      this.prePasteNotes = null;
      this.prePasteZones = null;
      this.pastedNoteIndices.clear();
      this.pastedZoneIndices.clear();
      callbacks.onChartUpdate(chart);
      return true;
    } else {
      callbacks.onWarn?.(`제약 위반 ${errors.length}건 — 배치할 수 없습니다`);
      return false;
    }
  }

  private _isRangeNote(note: NoteEntity): note is RangeNote {
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

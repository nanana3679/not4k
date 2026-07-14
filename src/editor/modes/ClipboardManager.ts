import type { Chart, ChartEvent, NoteEntity, RangeNote, Beat, TrillZone } from "../../shared";
import { beatToFloat, isVisibleLane, isMainLane, maxAuxLane, toAuxIndex } from "../../shared";
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
  /**
   * 선택 beat-span과 겹치는 이벤트 (RFD 0016 §3-4 D1).
   * timeSignature는 제외 — 마디 경계 이동 문제를 애초에 회피한다.
   */
  events: ChartEvent[];
  /** Earliest beat among copied notes/zones (relative offset anchor) */
  anchorBeat: Beat;
}

export interface ClipboardCallbacks {
  getSnapStep: () => Beat;
  getMaxBeatFloat: () => number;
  /** 현재 보조 레인 수 — 붙여넣기 이동의 레인 클램프(isVisibleLane)에 쓴다 */
  getExtraLaneCount?: () => number;
  /** 붙여넣기가 보조 레인 초과 시 자동 확장(RFD 0018 §8-6 D3) — 미설정이면 확장 없이 클램프만 */
  setExtraLaneCount?: (count: number) => void;
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
  private prePasteEvents: ChartEvent[] | null = null;
  // 붙여넣기 직전(D3 자동 확장 전)의 보조 레인 수 — 취소 시 확장을 되돌린다 (RFD 0018 §8-6).
  private prePasteExtraLaneCount: number | null = null;
  private pastedNoteIndices: Set<number> = new Set();
  private pastedZoneIndices: Set<number> = new Set();
  private pastedEventIndices: Set<number> = new Set();

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
    // 선택 beat-span [min, max] — 이벤트 수집 범위(endBeat가 있으면 끝까지 반영)
    let spanMax = -Infinity;

    for (const idx of selectedIndices) {
      const src = chart.notes[idx];
      if (!src) continue;
      const note = { ...src };
      copiedNotes.push(note);
      if (anchorBeat === null || beatToFloat(note.beat) < beatToFloat(anchorBeat)) {
        anchorBeat = note.beat;
      }
      const endFloat = this._isRangeNote(note)
        ? beatToFloat((note as RangeNote).endBeat)
        : beatToFloat(note.beat);
      if (endFloat > spanMax) spanMax = endFloat;
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
      const endFloat = beatToFloat(zone.endBeat);
      if (endFloat > spanMax) spanMax = endFloat;
    }

    if (anchorBeat === null) return 0;

    // 이벤트 수집 (RFD 0016 §3-4 D1) — span과 겹치는 이벤트를 담되 timeSignature는 제외
    // (마디 경계 이동 문제 회피). 시점 이벤트는 beat ∈ [min,max], 구간 이벤트는
    // [beat,endBeat]가 span과 겹침(폐구간). anchor는 notes/zones의 min 유지 — 수집
    // 이벤트는 span 안이라 상대 offset ≥ 0이다.
    const spanMin = beatToFloat(anchorBeat);
    const events: ChartEvent[] = [];
    for (const evt of chart.events) {
      if (evt.type === "timeSignature") continue;
      const startFloat = beatToFloat(evt.beat);
      const endFloat = "endBeat" in evt ? beatToFloat(evt.endBeat) : startFloat;
      if (startFloat <= spanMax && endFloat >= spanMin) {
        events.push({ ...evt });
      }
    }

    this.clipboard = { notes: copiedNotes, trillZones, events, anchorBeat };
    return copiedNotes.length + trillZones.length;
  }

  /**
   * Paste clipboard at the given target beat.
   * Returns PasteResult with updated state, or null if clipboard is empty / out of bounds.
   *
   * RFD 0018 §8-6 (D3): 붙여넣은 보조 노트가 현재 보조 레인 수를 넘으면 setExtraLaneCount로
   * 자동 확장한다(붙여넣은 노트가 숨지 않도록). 이동(클램프)·축소(숨김)와 달리 붙여넣기만 확장한다.
   */
  paste(
    chart: Chart,
    targetBeat: Beat,
    callbacks: ClipboardCallbacks,
    clearSelection: () => void,
  ): PasteResult | null {
    if (!this.clipboard) return null;

    if (this._isPendingPaste) {
      // 대기 중 재붙여넣기 = 이전 paste를 확정 취급 → D3 확장을 유지한다(§8-6 "붙여넣기만 확장").
      // 롤백 스냅샷만 폐기해, 취소 시 이전 확정 노트가 숨겨지는 것을 막는다.
      this.prePasteExtraLaneCount = null;
      this._cancelPasteInternal(chart, callbacks);
    }

    const { notes: clipNotes, trillZones: clipZones, events: clipEvents, anchorBeat } = this.clipboard;
    if (clipNotes.length === 0 && clipZones.length === 0) return null;

    this.prePasteNotes = [...chart.notes];
    this.prePasteZones = [...chart.trillZones];
    this.prePasteEvents = [...chart.events];

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

    // 이벤트도 함께 붙여넣기(같은 beatOffset 평행이동, editorLane 유지 — §3-4 D4).
    // 위반이어도 낙관 주입(place-then-fix, RFD 0017) — 커밋 게이트가 검증한다.
    const newEvents = [...chart.events];
    this.pastedEventIndices.clear();
    for (const clipEvent of clipEvents) {
      const idx = newEvents.length;
      newEvents.push(this._translateEvent(clipEvent, beatOffset));
      this.pastedEventIndices.add(idx);
    }

    const newChart = { ...chart, notes: newNotes, trillZones: newZones, events: newEvents };

    this._isPendingPaste = true;

    callbacks.onChartUpdate(newChart);
    // D3 자동 확장 — 붙여넣은 보조 노트가 현재 레인 수를 넘으면 늘린다 (RFD 0018 §8-6).
    this.expandExtraLanesForPasted(newChart, callbacks);

    return {
      chart: newChart,
      selectedIndices: newSelectedIndices,
      pastedNoteIndices: new Set(this.pastedNoteIndices),
      count: clipNotes.length + clipZones.length,
    };
  }

  /**
   * 붙여넣은 노트가 점유한 최대 보조 레인이 현재 extraLaneCount를 넘으면 확장한다.
   * setExtraLaneCount 미설정 시 no-op(확장 없이 숨김 — 옛 동작 계승).
   */
  private expandExtraLanesForPasted(chart: Chart, callbacks: ClipboardCallbacks): void {
    if (!callbacks.setExtraLaneCount || !callbacks.getExtraLaneCount) return;
    const pastedNotes: NoteEntity[] = [];
    for (const idx of this.pastedNoteIndices) {
      const n = chart.notes[idx];
      if (n) pastedNotes.push(n);
    }
    const needed = toAuxIndex(maxAuxLane(pastedNotes));
    const cur = callbacks.getExtraLaneCount();
    if (needed > cur) {
      // 확장이 실제 일어났을 때만 이전 값을 기록 — 취소 시 이 값으로만 되돌린다(§8-6).
      this.prePasteExtraLaneCount = cur;
      callbacks.setExtraLaneCount(needed);
    }
  }

  /**
   * Cancel pending paste — remove pasted notes, restore pre-paste state.
   * Returns the restored chart.
   */
  cancelPaste(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate" | "setExtraLaneCount">,
    clearSelection: () => void,
  ): Chart {
    if (!this._isPendingPaste) return chart;
    return this._cancelPasteInternal(chart, callbacks, clearSelection);
  }

  private _cancelPasteInternal(
    chart: Chart,
    callbacks: Pick<ClipboardCallbacks, "onChartUpdate" | "setExtraLaneCount">,
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

    if (this.prePasteEvents) {
      newChart = { ...newChart, events: this.prePasteEvents };
      this.prePasteEvents = null;
    }

    this._isPendingPaste = false;
    this.pastedNoteIndices.clear();
    this.pastedZoneIndices.clear();
    this.pastedEventIndices.clear();
    const restoreExtraLaneCount = this.prePasteExtraLaneCount;
    this.prePasteExtraLaneCount = null;

    // 순서 주의: 차트 복원(축소 커밋 → 선택 원자 clear, §3-5 면제 경로) → 선택 해제.
    // 반대면 붙여넣은 위반 노트의 선택 해제가 §3-5 게이트에 막혀 취소가 불가능해진다.
    callbacks.onChartUpdate(newChart);

    // 노트 복원 후 D3 자동 확장을 되돌린다 — 붙여넣기로 늘어난 보조 레인 수를 원상 복구 (§8-6).
    if (restoreExtraLaneCount !== null) callbacks.setExtraLaneCount?.(restoreExtraLaneCount);

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

    // 붙여넣은 이벤트도 함께 이동(상/하) — 레인 이동과 달리 beat 축은 이벤트도 따라간다
    const newEvents = [...chart.events];
    for (const idx of this.pastedEventIndices) {
      newEvents[idx] = this._translateEvent(newEvents[idx], offset);
    }

    const newChart = { ...chart, notes: newNotes, trillZones: newZones, events: newEvents };
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
      this.prePasteEvents = null;
      // 정상 확정은 D3 확장을 유지한다(취소만 되돌린다) — 스냅샷만 폐기.
      this.prePasteExtraLaneCount = null;
      this.pastedNoteIndices.clear();
      this.pastedZoneIndices.clear();
      this.pastedEventIndices.clear();
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

  /** 이벤트를 beat 축으로 평행이동한다(구간 이벤트는 endBeat 동반, editorLane 등 나머지 유지) */
  private _translateEvent(evt: ChartEvent, offset: Beat): ChartEvent {
    if ("endBeat" in evt) {
      return { ...evt, beat: beatAdd(evt.beat, offset), endBeat: beatAdd(evt.endBeat, offset) };
    }
    return { ...evt, beat: beatAdd(evt.beat, offset) };
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

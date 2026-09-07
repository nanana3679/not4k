import type { Chart, ChartEvent, NoteEntity, RangeNote, Beat, TrillZone, RestZone } from "../../shared";
import { beatToFloat, isVisibleLane, isMainLane, maxAuxLane, toAuxIndex } from "../../shared";
import { beatAdd, beatSub } from "../../shared";
import { translateRestZone } from "./restZoneSelection";
import type { TimelineSpace } from "../timeline/TimelineSpace";

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
   * 복사된 restZone (RFD 0019 — trillZone 축 미러). restZone 선택은 note/zone과
   * 공존하는 축이라 노트·존과 혼합 클립보드가 될 수 있다.
   * 내부 노트가 없어 구간 자체만 담는다.
   */
  restZones: RestZone[];
  /**
   * 선택 beat-span과 겹치는 이벤트 (RFD 0016 §3-4 D1).
   * timeSignature는 제외 — 마디 경계 이동 문제를 애초에 회피한다.
   */
  events: ChartEvent[];
  /** Earliest beat among copied notes/zones (relative offset anchor) */
  anchorBeat: Beat;
}

export interface ClipboardCallbacks {
  /** 좌표 공간(스냅 스텝·타임라인 범위) — TimelineSpace deep module 주입 */
  space: TimelineSpace;
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
  /** 붙여넣은 restZone 인덱스 — 호출자가 이것으로 선택을 구성한다 (RFD 0019, 공존 축) */
  pastedRestZoneIndices: Set<number>;
  count: number;
}

export class ClipboardManager {
  private clipboard: NoteClipboard | null = null;
  private _isPendingPaste = false;
  private prePasteNotes: NoteEntity[] | null = null;
  private prePasteZones: TrillZone[] | null = null;
  // 붙여넣기 직전 restZones 스냅샷 — restZone을 붙여넣었을 때만 기록·복원 (prePasteZones 미러, RFD 0019)
  private prePasteRestZones: RestZone[] | null = null;
  private prePasteEvents: ChartEvent[] | null = null;
  // 붙여넣기 직전(D3 자동 확장 전)의 보조 레인 수 — 취소 시 확장을 되돌린다 (RFD 0018 §8-6).
  private prePasteExtraLaneCount: number | null = null;
  private pastedNoteIndices: Set<number> = new Set();
  private pastedZoneIndices: Set<number> = new Set();
  private pastedRestZoneIndices: Set<number> = new Set();
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

  /** 붙여넣은 restZone 인덱스 (paste preview violation overlay용, RFD 0019) */
  get currentPastedRestZoneIndices(): ReadonlySet<number> {
    return this.pastedRestZoneIndices;
  }

  /**
   * Copy selected notes (메인·보조 통합 인덱스) to clipboard.
   * Returns count of copied notes + zones.
   */
  copy(
    chart: Chart,
    selectedIndices: ReadonlySet<number>,
    trillZoneIndices: ReadonlySet<number> = new Set(),
    restZoneIndices: ReadonlySet<number> = new Set(),
  ): number {
    if (this._isPendingPaste) return 0;

    if (selectedIndices.size === 0 && trillZoneIndices.size === 0 && restZoneIndices.size === 0) {
      return 0;
    }

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

    // restZone도 trillZone과 동형으로 복사 — 구간 시작이 anchor 후보, 끝이 span 후보 (RFD 0019)
    const restZones: RestZone[] = [];
    for (const idx of restZoneIndices) {
      const zone = (chart.restZones ?? [])[idx];
      if (!zone) continue;
      restZones.push({ ...zone });
      if (anchorBeat === null || beatToFloat(zone.beat) < beatToFloat(anchorBeat)) {
        anchorBeat = zone.beat;
      }
      const endFloat = beatToFloat(zone.endBeat);
      if (endFloat > spanMax) spanMax = endFloat;
    }

    if (anchorBeat === null) return 0;

    // 이벤트 수집 (RFD 0016 §3-4 D1) — span과 겹치는 이벤트를 담되 timeSignature는 제외
    // (마디 경계 이동 문제 회피). 시점 이벤트는 beat ∈ [min,max], 구간 이벤트는
    // [beat,endBeat]가 span과 겹침(폐구간). anchor는 notes/zones의 min 유지 — 시점 이벤트는
    // beat ≥ anchor라 offset ≥ 0이지만, span 시작에 걸친 구간 이벤트는 beat < anchor일 수
    // 있다(상대 기하는 보존되나 붙여넣기 시 음수 가능 — paste에서 범위 검증으로 거부).
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

    this.clipboard = { notes: copiedNotes, trillZones, restZones, events, anchorBeat };
    return copiedNotes.length + trillZones.length + restZones.length;
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

    const {
      notes: clipNotes,
      trillZones: clipZones,
      restZones: clipRestZones,
      events: clipEvents,
      anchorBeat,
    } = this.clipboard;
    if (clipNotes.length === 0 && clipZones.length === 0 && clipRestZones.length === 0) return null;

    this.prePasteNotes = [...chart.notes];
    this.prePasteZones = [...chart.trillZones];
    // restZone을 붙여넣을 때만 스냅샷 — 무관한 붙여넣기가 restZones 축(undefined)을 건드리지 않게
    this.prePasteRestZones = clipRestZones.length > 0 ? [...(chart.restZones ?? [])] : null;
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

    const maxFloat = callbacks.space.getMaxBeatFloat();
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
    // restZone 범위 검증 — trillZone과 동일(음수 beat·타임라인 초과 거부, RFD 0019)
    for (const clipZone of clipRestZones) {
      const sf = beatToFloat(beatAdd(clipZone.beat, beatOffset));
      const ef = beatToFloat(beatAdd(clipZone.endBeat, beatOffset));
      if (sf < 0 || ef > maxFloat) {
        callbacks.onWarn?.("붙여넣기 위치가 차트 범위를 벗어납니다");
        return null;
      }
    }
    // 이벤트 범위 검증 (RFD 0016 §3-4 D1) — span 시작에 걸친 구간 이벤트는 beat < anchor라
    // 음수로 나갈 수 있다. 노트·존과 대칭으로 범위 밖이면 붙여넣기 전체를 거부한다
    // (원자성 — 저장 파일에 음수 beat 이벤트가 남는 것을 막는다).
    for (const clipEvent of clipEvents) {
      const sf = beatToFloat(beatAdd(clipEvent.beat, beatOffset));
      if (sf < 0 || sf > maxFloat) {
        callbacks.onWarn?.("붙여넣기 위치가 차트 범위를 벗어납니다");
        return null;
      }
      if ("endBeat" in clipEvent) {
        const ef = beatToFloat(beatAdd(clipEvent.endBeat, beatOffset));
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

    // restZone도 붙여넣기(같은 beatOffset 평행이동, 레인 유지 — trillZone 미러, RFD 0019).
    // 위반(노트 겹침 등 의미 위반)이어도 낙관 주입(place-then-fix, RFD 0017).
    const newRestZones = [...(chart.restZones ?? [])];
    this.pastedRestZoneIndices.clear();
    for (const clipZone of clipRestZones) {
      const idx = newRestZones.length;
      newRestZones.push(translateRestZone(clipZone, beatOffset));
      this.pastedRestZoneIndices.add(idx);
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

    const newChart = {
      ...chart,
      notes: newNotes,
      trillZones: newZones,
      events: newEvents,
      // restZone을 붙여넣을 때만 축을 갱신 — 무관한 붙여넣기는 undefined 축을 유지한다
      ...(clipRestZones.length > 0 ? { restZones: newRestZones } : {}),
    };

    this._isPendingPaste = true;

    callbacks.onChartUpdate(newChart);
    // D3 자동 확장 — 붙여넣은 보조 노트가 현재 레인 수를 넘으면 늘린다 (RFD 0018 §8-6).
    this.expandExtraLanesForPasted(newChart, callbacks);

    return {
      chart: newChart,
      selectedIndices: newSelectedIndices,
      pastedNoteIndices: new Set(this.pastedNoteIndices),
      pastedRestZoneIndices: new Set(this.pastedRestZoneIndices),
      count: clipNotes.length + clipZones.length + clipRestZones.length,
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

    if (this.prePasteRestZones) {
      newChart = { ...newChart, restZones: this.prePasteRestZones };
      this.prePasteRestZones = null;
    }

    if (this.prePasteEvents) {
      newChart = { ...newChart, events: this.prePasteEvents };
      this.prePasteEvents = null;
    }

    this._isPendingPaste = false;
    this.pastedNoteIndices.clear();
    this.pastedZoneIndices.clear();
    this.pastedRestZoneIndices.clear();
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
    // restZone-only 붙여넣기(노트 0개)도 이동 가능해야 한다 (RFD 0019)
    if (
      !this._isPendingPaste ||
      (this.pastedNoteIndices.size === 0 && this.pastedRestZoneIndices.size === 0)
    ) {
      return null;
    }

    const snapStep = callbacks.space.getSnapStep();
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

    if (!this._areNotesInBounds(newNotes, this.pastedNoteIndices, callbacks.space.getMaxBeatFloat())) {
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

    // 붙여넣은 restZone도 함께 이동(상/하) — 범위를 벗어나면 이동 거부
    // (restZone-only 붙여넣기는 노트 범위 검사가 없어 여기서 직접 막는다, RFD 0019)
    const newRestZones = [...(chart.restZones ?? [])];
    for (const idx of this.pastedRestZoneIndices) {
      const zone = newRestZones[idx];
      newRestZones[idx] = translateRestZone(zone, offset);
    }
    const restMaxFloat = callbacks.space.getMaxBeatFloat();
    for (const idx of this.pastedRestZoneIndices) {
      const zone = newRestZones[idx];
      if (beatToFloat(zone.beat) < 0 || beatToFloat(zone.endBeat) > restMaxFloat) return null;
    }

    // 붙여넣은 이벤트도 함께 이동(상/하) — 레인 이동과 달리 beat 축은 이벤트도 따라간다
    const newEvents = [...chart.events];
    for (const idx of this.pastedEventIndices) {
      newEvents[idx] = this._translateEvent(newEvents[idx], offset);
    }
    // 이벤트가 범위를 벗어나면 이동 거부(노트 :_areNotesInBounds와 대칭, 음수 beat 저장 방지)
    const maxFloat = callbacks.space.getMaxBeatFloat();
    for (const idx of this.pastedEventIndices) {
      const evt = newEvents[idx];
      if (beatToFloat(evt.beat) < 0 || beatToFloat(evt.beat) > maxFloat) return null;
      if ("endBeat" in evt) {
        const ef = beatToFloat(evt.endBeat);
        if (ef < 0 || ef > maxFloat) return null;
      }
    }

    const newChart = {
      ...chart,
      notes: newNotes,
      trillZones: newZones,
      events: newEvents,
      ...(this.pastedRestZoneIndices.size > 0 ? { restZones: newRestZones } : {}),
    };
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
    // restZone-only 붙여넣기(노트 0개)도 이동 가능해야 한다 (RFD 0019)
    if (
      !this._isPendingPaste ||
      (this.pastedNoteIndices.size === 0 && this.pastedRestZoneIndices.size === 0)
    ) {
      return null;
    }

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
    // 붙여넣은 restZone도 가시 레인 범위(1..4)만 (RFD 0019 §4-1)
    const chartRestZones = chart.restZones ?? [];
    for (const idx of this.pastedRestZoneIndices) {
      const targetLane = chartRestZones[idx].lane + laneOffset;
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

    const newRestZones = [...chartRestZones];
    for (const idx of this.pastedRestZoneIndices) {
      const zone = newRestZones[idx];
      newRestZones[idx] = { ...zone, lane: (zone.lane + laneOffset) as RestZone["lane"] };
    }

    const newChart = {
      ...chart,
      notes: newNotes,
      trillZones: newZones,
      ...(this.pastedRestZoneIndices.size > 0 ? { restZones: newRestZones } : {}),
    };
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
      this.prePasteRestZones = null;
      this.prePasteEvents = null;
      // 정상 확정은 D3 확장을 유지한다(취소만 되돌린다) — 스냅샷만 폐기.
      this.prePasteExtraLaneCount = null;
      this.pastedNoteIndices.clear();
      this.pastedZoneIndices.clear();
      this.pastedRestZoneIndices.clear();
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

import type { Chart, NoteEntity, RangeNote, Beat } from "../../shared";
import { validateChartStructural, beatToFloat, isVisibleLane, isMainLane } from "../../shared";
import { beatAdd, beatSub, beatLt, beatLte } from "../../shared";
import {
  deleteChartNotesAtIndices,
  expandTrillPairIndices,
} from "../editing/editApplication";
import { ClipboardManager, type ClipboardCallbacks } from "./ClipboardManager";
import { resolveLongPressAction } from "./longPressRouting";
import { TOUCH_MOVE_CANCEL_PX } from "../hooks/touchGesture";
import {
  classifySelection,
  selectionBlockReason,
  clampTrillBeatOffset,
  translateTrillZone,
  selectionFromBox,
} from "./trillZoneSelection";
import { clampRestBeatOffset, translateRestZone } from "./restZoneSelection";
import type { TrillZone, RestZone } from "../../shared";
import { emptySelection, zoneContainedNoteIndices, type Selection } from "../stores/selectionSlice";
import type { TimelineSpace } from "../timeline/TimelineSpace";
import type { EditorMode, PointerGesture, EditResult, EditPreview, MoveOriginDatum } from "./editorMode";

/**
 * SelectMode 콜백 — RFD 0018 ④에서 이원 축(extraNotes)이 소멸했다.
 *
 * 보조 노트가 chart.notes(lane 5+)로 통합돼 SelectMode는 통합 차트 하나만 다룬다:
 * 선택(sel.notes)·이동·히트테스트가 전부 chart.notes 통합 인덱스·통합 lane으로 동작한다.
 * hitTestNote는 xToUnifiedLane 기반이라 보조 노트 인덱스도 반환하고, 레인 이동은
 * isVisibleLane(1..4+extraLaneCount)으로 클램프한다(메인4↔보조5 한 칸 연속).
 */
export interface SelectModeCallbacks {
  onChartUpdate: (chart: Chart) => void;
  /** 선택의 소유자(SelectionSlice)에서 현재 선택을 읽는다. 사본 저장 금지. */
  getSelection: () => Selection;
  /** 선택 전체 값을 정규화+해제 게이트(§3-5)를 지나 커밋한다. 게이트 거부 시 false. */
  setSelection: (sel: Selection) => boolean;
  /** 드래그 프리뷰 전용 — 정규화만, §3-5 게이트 미적용 (박스 프레임 등 미확정 상태). */
  setSelectionTransient: (sel: Selection) => void;
  /** 좌표 공간(변환·스냅·히트테스트) — TimelineSpace deep module 주입 */
  space: TimelineSpace;
  /** 현재 보조 레인 수 — 레인 이동 클램프(isVisibleLane)에 쓴다 */
  getExtraLaneCount?: () => number;
  /** 붙여넣기가 보조 레인 초과 시 자동 확장(RFD 0018 §8-6 D3) */
  setExtraLaneCount?: (count: number) => void;
  onWarn?: (msg: string) => void;
}

export class SelectMode implements EditorMode {
  private chart: Chart;
  private callbacks: SelectModeCallbacks;

  // Drag state
  private isDragging: boolean = false;
  private dragType: "move" | "boxSelect" | "resize" | null = null;
  private dragStartBeat: Beat | null = null;
  // 이동 앵커 레인 — 통합 lane 공간(1..4+extraLaneCount). 메인·보조 무차별.
  private dragStartLane: number | null = null;
  private _boxEndBeat: Beat | null = null;
  private _boxEndLane: number | null = null;

  // Box select pixel state (for rendering)
  private _boxStartY: number = 0;
  private _boxStartLane: number | null = null;
  private _boxEndY: number = 0;

  // Move state
  private originalPositions: Map<
    number,
    { beat: Beat; endBeat?: Beat; lane: number }
  > = new Map();
  // 트릴 노트 단위 이동 시, 이동을 가두는 trillZone(이동 시작 시점 캡처). 트릴 선택이 아니면 null.
  private _trillMoveZone: TrillZone | null = null;
  // 구간 단위 이동 시작 시점의 트릴존 원본 좌표 (인덱스 → 원본)
  private originalZonePositions: Map<number, TrillZone> = new Map();
  // restZone 이동 시작 시점의 원본 좌표 (인덱스 → 원본, RFD 0019 — trillZone 미러)
  private originalRestZonePositions: Map<number, RestZone> = new Map();

  // Resize state
  private resizingEntityType: "note" | "event" | "trillZone" | "restZone" | null = null;
  private resizingIndex: number | null = null;
  private resizingOriginalEndBeat: Beat | null = null;
  private resizingOriginalBeat: Beat | null = null;

  // Clipboard & paste state
  private clipboardManager: ClipboardManager = new ClipboardManager();

  // 박스 드래그 시작 전 선택 스냅샷 — §3-5 "전이 = 확정된 선택 변경".
  // 박스 프레임은 프리뷰(transient)로 커밋되고, 종료 시 (시작 전 → 최종) 전이 하나로 게이트한다.
  private preDragSelection: Selection | null = null;

  // 미선택 존 몸통에서 시작한 박스의 탭 후보(§6-6) — up에서 움직임이 없었으면
  // 빈 박스 확정 대신 이 존을 유닛 선택한다. 모든 종료 경로(up·cancel)에서 리셋.
  private _pendingZoneSelect: number | null = null;
  // 미선택 restZone 몸통 탭 후보 — trillZone(§6-6) 미러 (RFD 0019). down은 한 몸통만
  // 히트하므로 둘 중 하나만 산다.
  private _pendingRestZoneSelect: number | null = null;

  // 포인터가 레인 밖에 있는 동안 레인 오프셋을 고정하기 위한 마지막 유효값.
  private _lastMoveLaneOffset = 0;

  constructor(chart: Chart, callbacks: SelectModeCallbacks) {
    this.chart = chart;
    this.callbacks = callbacks;
  }

  /** 현재 선택 — 사본 금지, 선택의 소유자는 SelectionSlice다. 항상 이 getter로 읽는다. */
  private get sel(): Selection {
    return this.callbacks.getSelection();
  }

  /**
   * 선택의 일부를 병합해 한 번에 커밋한다. store 게이트가 정규화(범위 보정 +
   * 동질성 + 트릴 모드 시 zones 비움, RFD 0016)하므로,
   * 커밋 직후 this.sel은 정규화된 값을 돌려준다.
   *
   * §3-5 해제 게이트가 전이를 거부하면 false — 호출자는 이어지는 동작(이동·리사이즈
   * 시작)을 진행하면 안 된다. stale(직전) 선택을 대상으로 조작하게 되기 때문이다.
   */
  private commitSelection(partial: Partial<Selection>): boolean {
    return this.callbacks.setSelection({ ...this.sel, ...partial });
  }

  /** 박스 드래그 프레임 전용 커밋 — 프리뷰라 §3-5 게이트를 지나지 않는다(정규화만). */
  private commitSelectionTransient(partial: Partial<Selection>): void {
    this.callbacks.setSelectionTransient({ ...this.sel, ...partial });
  }

  /** 클립보드 매니저에 넘길 콜백 서브셋(통합 차트 기준). */
  private clipboardCallbacks(): ClipboardCallbacks {
    return {
      space: this.callbacks.space,
      getExtraLaneCount: this.callbacks.getExtraLaneCount,
      setExtraLaneCount: this.callbacks.setExtraLaneCount,
      onWarn: this.callbacks.onWarn,
      onChartUpdate: this.callbacks.onChartUpdate,
    };
  }

  setChart(chart: Chart): void {
    // 선택 보정(범위·동질·구간 파생)은 store 변이 액션이 같은 트랜잭션에서 수행한다
    this.chart = chart;
  }

  get selection(): ReadonlySet<number> {
    return this.sel.notes;
  }

  /** 구간 단위로 선택된 트릴존 인덱스 */
  get selectedZones(): ReadonlySet<number> {
    return this.sel.zones;
  }

  /** 유닛으로 선택된 restZone 인덱스 (RFD 0019 — note/zone과 공존하는 독립 축) */
  get selectedRestZones(): ReadonlySet<number> {
    return this.sel.restZones;
  }

  /** 선택된 구간 유닛의 내부 노트(포함 기준) — 동사 실행 시점에 파생한다 (RFD 0016 §4.2) */
  private zoneDerivedNoteIndices(): Set<number> {
    const result = new Set<number>();
    for (const zoneIndex of this.sel.zones) {
      const zone = this.chart.trillZones[zoneIndex];
      if (!zone) continue;
      for (const noteIndex of zoneContainedNoteIndices(this.chart.notes, zone)) {
        result.add(noteIndex);
      }
    }
    return result;
  }

  /**
   * 동사(이동·삭제·복사)가 조작할 전체 노트 집합 = sel.notes ∪ 구간 파생 노트.
   * 파생을 이 한 곳에 모아 동사별 구현 분산을 막는다 (RFD 0016 §6).
   */
  private effectiveNoteIndices(): Set<number> {
    const result = new Set(this.sel.notes);
    for (const noteIndex of this.zoneDerivedNoteIndices()) {
      result.add(noteIndex);
    }
    return result;
  }

  /**
   * 트릴존을 구간 유닛으로 선택한다. 기존 노트 선택은 해제된다.
   * 내부 트릴노트는 notes에 주입하지 않는다 — 이동·삭제·복사 동사가
   * 실행 시점에 zoneContainedNoteIndices로 파생한다 (RFD 0016 §4.2).
   */
  selectZoneUnit(zoneIndex: number): boolean {
    if (zoneIndex < 0 || zoneIndex >= this.chart.trillZones.length) return false;
    return this.commitSelection({
      notes: new Set(),
      zones: new Set([zoneIndex]),
      restZones: new Set(),
    });
  }

  /**
   * restZone을 유닛으로 선택한다 (RFD 0019). restZone은 note/zone과 **공존**하는
   * 독립 축이지만, 단순 클릭 선택은 다른 엔티티와 동일하게 **선택 전체 교체**다
   * (selectZoneUnit 미러 — 공존은 박스·shift 등 다축 경로에서 성립한다).
   */
  selectRestZoneUnit(index: number): boolean {
    if (index < 0 || index >= (this.chart.restZones?.length ?? 0)) return false;
    return this.commitSelection({
      notes: new Set(),
      zones: new Set(),
      restZones: new Set([index]),
    });
  }

  /** Whether a move drag is currently in progress */
  get isMoveDragging(): boolean {
    return this.isDragging && this.dragType === "move";
  }

  /** Original positions of notes being moved (available during move drag) */
  get moveOrigins(): ReadonlyMap<number, { beat: Beat; endBeat?: Beat; lane: number }> {
    return this.originalPositions;
  }

  /**
   * 현재 드래그(끝점 리사이즈 / 구간 단위 이동) 중인 trillZone 인덱스. 없으면 null.
   * hover-only 핸들을 드래그 중에는 hover 여부와 무관하게 계속 표시하기 위한 래치.
   */
  private get draggingTrillZoneIndex(): number | null {
    if (this.dragType === "resize" && this.resizingEntityType === "trillZone") {
      return this.resizingIndex;
    }
    if (this.isMoveDragging && this.sel.zones.size === 1) {
      return [...this.sel.zones][0];
    }
    return null;
  }

  /**
   * 현재 표시할 트릴존 hover 인덱스. 드래그(리사이즈/구간 이동) 중이면 그 구간을 래치해
   * 커서가 구간 밖으로 나가도 계속 표시하고, 아니면 (x,y) 위의 구간을 hover한다.
   */
  computeHoveredTrillZone(x: number, y: number): number | null {
    const latched = this.draggingTrillZoneIndex;
    if (latched !== null) return latched;
    return this.callbacks.space.hitTestTrillZone(x, y);
  }

  /**
   * 현재 드래그(끝점 리사이즈 / 유닛 이동) 중인 restZone 인덱스 (RFD 0019 —
   * draggingTrillZoneIndex 미러). 없으면 null.
   */
  private get draggingRestZoneIndex(): number | null {
    if (this.dragType === "resize" && this.resizingEntityType === "restZone") {
      return this.resizingIndex;
    }
    if (this.isMoveDragging && this.sel.restZones.size === 1) {
      return [...this.sel.restZones][0];
    }
    return null;
  }

  /**
   * 현재 표시할 restZone hover 인덱스 (computeHoveredTrillZone 미러, RFD 0019).
   * 드래그 중이면 그 restZone을 래치해 커서가 밖으로 나가도 계속 표시한다.
   */
  computeHoveredRestZone(x: number, y: number): number | null {
    const latched = this.draggingRestZoneIndex;
    if (latched !== null) return latched;
    return this.callbacks.space.hitTestRestZone(x, y);
  }

  /** Whether a box select drag is currently in progress */
  get isBoxSelecting(): boolean {
    return this.isDragging && this.dragType === "boxSelect";
  }

  /** Whether paste preview is active (notes placed but not yet confirmed) */
  get isPendingPaste(): boolean {
    return this.clipboardManager.isPendingPaste;
  }

  /** Whether clipboard has data */
  get hasClipboard(): boolean {
    return this.clipboardManager.hasClipboard;
  }

  /** Current box select rectangle in pixel Y coords (for rendering) */
  get boxSelectPixelRect(): { startY: number; startLane: number; endY: number; endLane: number } | null {
    if (!this.isBoxSelecting) return null;
    if (this._boxStartLane === null || this._boxEndLane === null) return null;
    return {
      startY: this._boxStartY,
      startLane: this._boxStartLane,
      endY: this._boxEndY,
      endLane: this._boxEndLane,
    };
  }

  /** Clear selection */
  clearSelection(): void {
    this.commitSelection({ notes: new Set(), zones: new Set(), restZones: new Set() });
  }

  /** Select a specific note. §3-5 게이트 거부 시 false. */
  selectNote(index: number): boolean {
    if (index >= 0 && index < this.chart.notes.length) {
      // 단순 클릭 선택 = 전체 교체 — zones·restZones도 함께 해제한다 (공존 축이지만 교체는 전축)
      return this.commitSelection({
        notes: this.withTrillPairs(new Set([index])),
        zones: new Set(),
        restZones: new Set(),
      });
    }
    return false;
  }

  /**
   * 트릴 쌍(trill 헤드 ↔ trillLong 바디)은 한 단위로 선택한다 — 한쪽만 이동하면
   * 배치 제약(트릴 롱 헤드 필수)에 걸려 롤백되므로, 삭제(쌍소멸)와 대칭으로
   * 선택도 쌍을 동반한다. 쌍은 정의상 동질(같은 존의 트릴 계열)이라 동질성 가드와 충돌하지 않는다.
   */
  private withTrillPairs(indices: ReadonlySet<number>): Set<number> {
    const result = new Set(indices);
    for (const paired of expandTrillPairIndices(this.chart.notes, result)) {
      result.add(paired);
    }
    return result;
  }

  /** Begin a touch long-press move from a note without collapsing an existing multi-selection. */
  beginTouchMoveDragFromNote(index: number, x: number, y: number): boolean {
    if (index < 0 || index >= this.chart.notes.length) return false;

    // 이미 선택된 노트면 혼합 선택(구간 포함)을 유지한 채 전체를 이동한다.
    // 구간 유닛의 내부(파생) 노트도 "선택된 엔티티"로 취급 — 잡아 끌면 단독 선택으로
    // 교체하지 않고 유닛째 이동한다 (RFD 0016 §4.2 실행 시점 파생).
    if (!this.sel.notes.has(index) && !this.zoneDerivedNoteIndices().has(index)) {
      // §3-5 게이트가 선택 교체를 거부하면 이동을 시작하지 않는다(stale 선택 오이동 방지)
      if (!this.selectNote(index)) return false;
    }

    this.startMainMoveDrag(x, y);
    return this.isMoveDragging;
  }

  /** Begin dragging the current selection from the given pointer location. */
  beginMoveDrag(x: number, y: number): void {
    // 이동 축은 하나다(통합 lane) — 포인터가 놓인 통합 레인이 오프셋 앵커가 된다 (RFD 0018 ④).
    this.startMainMoveDrag(x, y);
  }

  /** Begin resizing a main range note end, used by touch long-press handles. */
  beginNoteEndResizeDrag(index: number): boolean {
    const note = this.chart.notes[index];
    if (!note || !this.isRangeNote(note)) return false;

    // §3-5 게이트가 선택 교체를 거부하면 리사이즈도 시작하지 않는다
    if (!this.commitSelection({ notes: new Set([index]), zones: new Set(), restZones: new Set() })) {
      return false;
    }
    this.startResize("note", index, note.beat, note.endBeat);
    return true;
  }

  /**
   * 터치 롱프레스 발화 시, down에서 계산된 히트로 드래그 종류를 정해 시작한다.
   * 노트 끝→리사이즈 / 노트→이동 / 구간 몸통→구간 유닛 이동. 히트가 없으면 false.
   */
  beginLongPressDrag(
    x: number,
    y: number,
    hits: {
      noteEndHit: number | null;
      noteHit: number | null;
      zoneHit?: number | null;
    },
  ): boolean {
    const action = resolveLongPressAction(hits);
    if (action.kind === "resizeNoteEnd") return this.beginNoteEndResizeDrag(action.index);
    if (action.kind === "moveNote") return this.beginTouchMoveDragFromNote(action.index, x, y);
    if (action.kind === "moveZone") return this.beginTouchMoveDragFromZone(action.index, x, y);
    return false;
  }

  /**
   * trillZone 몸통 롱프레스로 구간 유닛 이동을 시작한다 (RFD 0016 §4.4).
   * 노트 롱프레스와 대칭: 미선택 구간이면 단독 선택으로 전환, 선택돼 있으면
   * 기존 혼합 선택(일반 노트·다른 구간 포함)을 유지한 채 전체를 이동한다.
   */
  beginTouchMoveDragFromZone(index: number, x: number, y: number): boolean {
    if (index < 0 || index >= this.chart.trillZones.length) return false;
    if (!this.sel.zones.has(index)) {
      // §3-5 게이트가 유닛 선택 교체를 거부하면 이동을 시작하지 않는다(stale 선택 오이동 방지)
      if (!this.selectZoneUnit(index)) return false;
    }
    this.startMainMoveDrag(x, y);
    return this.isMoveDragging;
  }

  /**
   * 동질성 규칙을 지키며 노트를 추가한 새 선택 집합을 만든다.
   * 트릴 노트는 같은 트릴존끼리만, 트릴/일반은 섞을 수 없다.
   * 막히면 토스트로 이유를 알리고 null을 반환한다(추가 안 됨).
   */
  private tryAddNoteToSelection(index: number): Set<number> | null {
    const note = this.chart.notes[index];
    if (!note) return null;
    const kind = classifySelection(this.chart.trillZones, this.chart.notes, this.sel.notes);
    const reason = selectionBlockReason(kind, this.chart.trillZones, note);
    if (reason) {
      this.callbacks.onWarn?.(reason);
      return null;
    }
    const notes = new Set(this.sel.notes);
    notes.add(index);
    return this.withTrillPairs(notes);
  }

  // --- Pointer events ---

  /** Select 모드는 휠 입력을 처리하지 않는다(항상 미처리 = null). */
  onWheel(): null {
    return null;
  }

  /** 통합 포인터 down 진입점. gesture의 shift/alt/toggle 수식자를 onPointerDown으로 운반한다. */
  handlePointerDown(gesture: PointerGesture): void {
    this.onPointerDown(gesture.x, gesture.y, gesture.shiftKey, gesture.altKey, gesture.toggleSelection);
  }

  /** 통합 포인터 up 진입점. 드래그를 커밋하고 이동/박스 프리뷰 정리를 신호한다. */
  handlePointerUp(gesture: PointerGesture): EditResult {
    this.onPointerUp(gesture.x, gesture.y);
    return { clearDragPreview: true };
  }

  onPointerDown(x: number, y: number, shiftKey: boolean, altKey: boolean, toggleSelection = false): void {
    // During pending paste: click empty space to confirm
    if (this.clipboardManager.isPendingPaste) {
      const hitIdx = this.callbacks.space.hitTestUnifiedNote(x, y);
      if (hitIdx === null) {
        this.confirmPlacement();
      }
      return;
    }

    // 드래그 진행 중엔 down 재호출을 무시한다(지연-시작 후보의 중복 시작 방지).
    if (this.isDragging) return;

    // 1. RangeNote endpoints — 끝 캡을 잡으면 리사이즈.
    {
      const endHit = this.callbacks.space.hitTestNoteEnd(x, y);
      if (endHit !== null && this.isRangeNote(this.chart.notes[endHit])) {
        const isSelected = this.sel.notes.has(endHit);
        const topmost = this.callbacks.space.hitTestUnifiedNote(x, y);
        if (isSelected || topmost === endHit) {
          if (!isSelected) {
            // §3-5 게이트가 선택 교체를 거부하면 리사이즈도 시작하지 않는다(선택 표시와 조작 대상 불일치 방지)
            if (!this.commitSelection({ notes: new Set([endHit]), zones: new Set() })) {
              return;
            }
          }
          const note = this.chart.notes[endHit] as RangeNote;
          this.startResize("note", endHit, note.beat, note.endBeat);
          return;
        }
      }
    }

    // 2. Event endpoints
    {
      const evtHit = this.callbacks.space.hitTestEventEnd(x, y);
      if (evtHit !== null) {
        const evt = this.chart.events[evtHit];
        if (!('endBeat' in evt)) return;
        this.startResize("event", evtHit, evt.beat, evt.endBeat);
        return;
      }
    }

    // 3. Trill zone endpoints (resize) — **그 구간이 이미 선택됐을 때만** 리사이즈로 잡는다.
    // 미선택 구간의 끝에 놓인 노트 클릭을 리사이즈가 가로채지 않도록(끝 노트 선택 보장, RFD 0016 §6-6).
    {
      const zoneHit = this.callbacks.space.hitTestTrillZoneEnd(x, y);
      if (zoneHit !== null && this.sel.zones.has(zoneHit)) {
        const zone = this.chart.trillZones[zoneHit];
        this.startResize("trillZone", zoneHit, zone.beat, zone.endBeat);
        return;
      }
    }

    // 4. Rest zone endpoints (resize) — trillZone 규칙 미러: **선택된 restZone만** (RFD 0019).
    {
      const restEndHit = this.callbacks.space.hitTestRestZoneEnd(x, y);
      if (restEndHit !== null && this.sel.restZones.has(restEndHit)) {
        const zone = (this.chart.restZones ?? [])[restEndHit];
        if (zone) {
          this.startResize("restZone", restEndHit, zone.beat, zone.endBeat);
          return;
        }
      }
    }

    const hitIndex = this.callbacks.space.hitTestUnifiedNote(x, y);

    if (hitIndex !== null) {
      const isAlreadySelected = this.sel.notes.has(hitIndex);
      // 구간 유닛의 내부(파생) 노트도 "선택된 엔티티"다 — 잡아 끌면 유닛째 이동하고,
      // 단독 선택으로 교체하지 않는다 (RFD 0016 §4.2 실행 시점 파생).
      const isZoneDerived = !isAlreadySelected && this.zoneDerivedNoteIndices().has(hitIndex);

      // 수식자(토글/Shift/Alt) 경로는 zones·restZones를 보존한다 — 일반 노트와 구간
      // 유닛(trillZone·restZone)은 공존하고(RFD 0016 §4.1 · RFD 0019),
      // 트릴 노트가 들어오면 게이트가 zones를 자동으로 비운다.
      if (toggleSelection) {
        if (isAlreadySelected) {
          const notes = new Set(this.sel.notes);
          notes.delete(hitIndex);
          this.commitSelection({ notes });
        } else {
          const added = this.tryAddNoteToSelection(hitIndex);
          if (added) this.commitSelection({ notes: added });
        }
      } else if (shiftKey) {
        // Add to selection (동질성 규칙 적용)
        const added = this.tryAddNoteToSelection(hitIndex);
        if (added) this.commitSelection({ notes: added });
      } else if (altKey) {
        // Remove from selection
        const notes = new Set(this.sel.notes);
        notes.delete(hitIndex);
        this.commitSelection({ notes });
      } else if ((isAlreadySelected && this.sel.notes.size > 0) || isZoneDerived) {
        // Start move drag on selected note (zones가 있으면 혼합 선택째 이동)
        this.beginMoveDrag(x, y);
      } else {
        // 단순 클릭은 선택 전체 교체(zones·restZones 포함 해제). 트릴 쌍은 클릭 선택에서도 한 단위.
        // §3-5 게이트가 교체를 거부하면 이동을 시작하지 않는다 — stale(직전 위반) 선택이
        // 새 클릭 좌표를 앵커로 조용히 이동하는 은닉 오편집을 막는다.
        const committed = this.commitSelection({
          notes: this.withTrillPairs(new Set([hitIndex])),
          zones: new Set(),
          restZones: new Set(),
        });
        if (committed) this.beginMoveDrag(x, y);
      }
    } else {
      // 노트-히트 실패 → 존 몸통이면 "클릭=선택, 선택 후 드래그=이동" (RFD 0016 §6-6).
      // 이동 필(핸들) 제거 후 존 몸통이 노트와 같은 상호작용 규칙을 따른다.
      const zoneHit = this.callbacks.space.hitTestTrillZone(x, y);
      if (zoneHit !== null) {
        if (shiftKey || toggleSelection) {
          // 구 이동 필의 shift/토글 동작 승계: zones 토글(기존 노트·restZone 선택과 공존).
          const zones = new Set(this.sel.zones);
          if (zones.has(zoneHit)) {
            zones.delete(zoneHit);
          } else {
            zones.add(zoneHit);
          }
          this.commitSelection({ zones });
          return;
        }
        if (this.sel.zones.has(zoneHit)) {
          // 이미 선택된 존 몸통 드래그 = 구간 유닛 이동 ("선택된 엔티티 위 드래그=이동" 통일)
          this.beginMoveDrag(x, y);
          return;
        }
        // 미선택 존 몸통: 탭=유닛 선택, 드래그=박스 — 박스로 시작하되 존을 기억해
        // up의 탭 판정(움직임 없음)에서 빈 박스 확정 대신 유닛 선택으로 바꾼다.
        this._pendingZoneSelect = zoneHit;
        this.startBoxSelect(x, y);
        return;
      }

      // 노트·트릴존 히트 실패 → restZone 몸통 (RFD 0019 — trillZone §6-6 미러).
      const restHit = this.callbacks.space.hitTestRestZone(x, y);
      if (restHit !== null) {
        if (shiftKey || toggleSelection) {
          // 공존 축 — restZones만 토글하고 기존 notes·zones 선택은 보존한다 (trillZone 미러).
          const restZones = new Set(this.sel.restZones);
          if (restZones.has(restHit)) {
            restZones.delete(restHit);
          } else {
            restZones.add(restHit);
          }
          this.commitSelection({ restZones });
          return;
        }
        if (this.sel.restZones.has(restHit)) {
          // 이미 선택된 restZone 몸통 드래그 = 유닛 이동 (trillZone과 동일 규칙)
          this.beginMoveDrag(x, y);
          return;
        }
        // 미선택 restZone 몸통: 탭=유닛 선택(교체), 드래그=박스(노트·존·restZone 감쌈 픽업).
        this._pendingRestZoneSelect = restHit;
        this.startBoxSelect(x, y);
        return;
      }

      // Clicking empty space
      if (!shiftKey && !altKey) {
        this.startBoxSelect(x, y);
      }
    }
  }

  /**
   * 노트 위에서 시작한 터치 드래그의 박스 승격 진입점 (RFD 0016 §4.4).
   * 빈 곳 박스와 동일하게 기존 선택을 비우고 시작한다. 진행 중 드래그가 있으면 무시.
   */
  beginBoxSelect(x: number, y: number): void {
    if (this.isDragging) return;
    this.startBoxSelect(x, y);
  }

  /** 기존 선택을 비우고 박스 셀렉트 드래그를 시작한다. */
  private startBoxSelect(x: number, y: number): void {
    // §3-5: 사전 clear·프레임 재구성은 프리뷰라 게이트를 지나지 않는다(전이 아님).
    // 시작 전 선택을 캡처해 두고, 드래그 종료 시 (시작 전 → 최종) 전이로 한 번만 게이트한다.
    this.preDragSelection = this.sel;
    this.callbacks.setSelectionTransient(emptySelection());
    this.isDragging = true;
    this.dragType = "boxSelect";
    this.dragStartBeat = this.callbacks.space.yToBeatRaw(y);
    this.dragStartLane = null;
    this._boxStartY = y;
    this._boxStartLane = this.callbacks.space.xToUnifiedLane(x);
    this._boxEndLane = this._boxStartLane;
    this._boxEndY = y;
  }

  /** Handle pointer move — 적용 후 렌더러가 PUSH할 프리뷰(박스/이동 원본)를 반환한다. */
  onPointerMove(x: number, y: number): EditResult {
    this.applyPointerMove(x, y);
    return { preview: this.buildMovePreview() };
  }

  /** 이동/박스 드래그의 현재 프리뷰를 만든다(렌더러 PUSH용). */
  private buildMovePreview(): EditPreview {
    const preview: EditPreview = {};
    if (this.isBoxSelecting) {
      const rect = this.boxSelectPixelRect;
      if (rect) preview.boxSelectRect = rect;
    }
    if (this.isMoveDragging) {
      const origins = this.moveOrigins;
      if (origins.size > 0) {
        const data: MoveOriginDatum[] = [];
        for (const [idx, pos] of origins) {
          data.push({ note: this.chart.notes[idx], beat: pos.beat, endBeat: pos.endBeat, lane: pos.lane });
        }
        preview.moveOrigins = data;
      }
    }
    return preview;
  }

  /** Handle pointer move (내부 적용 로직) */
  private applyPointerMove(x: number, y: number): void {
    if (!this.isDragging) return;

    if (this.dragType === "resize") {
      if (this.resizingIndex !== null && this.resizingOriginalBeat !== null) {
        const currentBeat = this.callbacks.space.snapBeat(this.callbacks.space.yToBeat(y));
        // Clamp: endBeat >= startBeat
        const newEndBeat = beatLte(currentBeat, this.resizingOriginalBeat)
          ? this.resizingOriginalBeat
          : currentBeat;

        let tentativeChart: Chart | null = null;
        if (this.resizingEntityType === "note") {
          const note = this.chart.notes[this.resizingIndex];
          if (this.isRangeNote(note)) {
            const newNotes = [...this.chart.notes];
            newNotes[this.resizingIndex] = { ...note, endBeat: newEndBeat } as RangeNote;
            tentativeChart = { ...this.chart, notes: newNotes };
          }
        } else if (this.resizingEntityType === "event") {
          const newEvents = [...this.chart.events];
          const evtToResize = newEvents[this.resizingIndex];
          if ('endBeat' in evtToResize) {
            newEvents[this.resizingIndex] = { ...evtToResize, endBeat: newEndBeat };
            tentativeChart = { ...this.chart, events: newEvents };
          }
        } else if (this.resizingEntityType === "trillZone") {
          const newZones = [...this.chart.trillZones];
          newZones[this.resizingIndex] = { ...newZones[this.resizingIndex], endBeat: newEndBeat };
          tentativeChart = { ...this.chart, trillZones: newZones };
        } else if (this.resizingEntityType === "restZone") {
          // restZone은 길이 0이 **구조 위반**(setChart 하드 거부, RFD 0019 Phase 2)이다 —
          // trillZone(길이 0 허용)과 달리 endBeat가 beat까지 내려앉는 프레임은 커밋하지 않는다.
          const newRestZones = [...(this.chart.restZones ?? [])];
          if (newRestZones[this.resizingIndex] && beatLt(this.resizingOriginalBeat, newEndBeat)) {
            newRestZones[this.resizingIndex] = { ...newRestZones[this.resizingIndex], endBeat: newEndBeat };
            tentativeChart = { ...this.chart, restZones: newRestZones };
          }
        }

        // 낙관적 편집(RFD 0017 §3-3): 프리뷰는 위반 위치도 그대로 표시한다.
        if (tentativeChart !== null) {
          this.chart = tentativeChart;
          this.callbacks.onChartUpdate(this.chart);
        }
      }
      return;
    }

    if (this.dragType === "move") {
      const currentBeat = this.callbacks.space.yToBeat(y);
      const currentLane = this.callbacks.space.xToUnifiedLane(x);

      if (this.dragStartBeat && this.dragStartLane !== null) {
        // Calculate offset
        let beatOffset = beatSub(
          this.callbacks.space.snapBeat(currentBeat),
          this.callbacks.space.snapBeat(this.dragStartBeat),
        );
        // 포인터가 레인 밖이면 마지막 유효 레인 오프셋을 유지하고 beat만 따라온다.
        let laneOffset =
          currentLane !== null ? currentLane - this.dragStartLane : this._lastMoveLaneOffset;
        if (currentLane !== null) this._lastMoveLaneOffset = laneOffset;

        // 트릴 노트 단위 이동은 구간 안으로만: 레인 변경 금지 + 박자 오프셋 클램프
        if (this._trillMoveZone) {
          laneOffset = 0;
          beatOffset = clampTrillBeatOffset(this._trillMoveZone, this.movePositionList(), beatOffset);
        }

        // restZone 유닛 이동(RFD 0019): 내부 노트가 없어 구간 자체만 타임라인 [0, max]에 클램프.
        // 공존 축 — 혼합 선택이면 이 클램프가 노트·존을 포함한 전체 오프셋을 함께 제한한다.
        if (this.originalRestZonePositions.size > 0) {
          const maxBeat = this.maxTimelineBeat();
          for (const origin of this.originalRestZonePositions.values()) {
            beatOffset = clampRestBeatOffset(origin, maxBeat, beatOffset);
          }
        }

        // 이동 대상 = 드래그 시작 시점에 캡처한 원본들(직접 선택 + 구간 파생 노트, RFD 0016 §4.2)
        const moveTargets = new Set(this.originalPositions.keys());

        // 통합 레인 범위 클램프 — 메인4↔보조5 한 칸 연속, 1..4+extraLaneCount (RFD 0018 ④·§8-5)
        const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;
        for (const original of this.originalPositions.values()) {
          if (!isVisibleLane(original.lane + laneOffset, extraLaneCount)) return; // Block entire move
        }

        // Apply move to all moving notes (with snap)
        const newNotes = this.buildMovedNotes(laneOffset, beatOffset);

        // Block if any note goes out of timeline bounds
        if (!this.areNotesInBounds(newNotes, moveTargets)) return;

        // 구간 유닛이 선택돼 있으면 트릴존도 같은 오프셋으로 함께 이동(겹침/범위 검증)
        let newZones = this.chart.trillZones;
        if (this.originalZonePositions.size > 0) {
          newZones = this.buildMovedZones(laneOffset, beatOffset);
          if (!this.movedZonesInBounds(newZones)) return;
        }

        // restZone 유닛 이동 적용 — beat는 위에서 클램프됐고, 레인은 1~4 밖이면 프레임 차단.
        let newRestZones = this.chart.restZones;
        if (this.originalRestZonePositions.size > 0) {
          newRestZones = this.buildMovedRestZones(laneOffset, beatOffset);
          if (!this.movedRestZonesInBounds(newRestZones)) return;
        }

        // Update chart with new positions (preview)
        this.chart = {
          ...this.chart,
          notes: newNotes,
          trillZones: newZones,
          ...(this.originalRestZonePositions.size > 0 ? { restZones: newRestZones } : {}),
        };
        this.callbacks.onChartUpdate(this.chart);
      }
    } else if (this.dragType === "boxSelect") {
      this._boxEndBeat = this.callbacks.space.yToBeatRaw(y);
      const lane = this.callbacks.space.xToUnifiedLane(x);
      // Keep previous _boxEndLane when cursor is outside lane area
      if (lane !== null) {
        this._boxEndLane = lane;
      }
      this._boxEndY = y;

      this.updateBoxSelection();
    }
  }

  /** Handle pointer up */
  onPointerUp(x: number, y: number): void {
    if (!this.isDragging) return;

    if (this.dragType === "resize") {
      // 낙관적 편집(RFD 0017): 리사이즈는 endBeat clamp라 구조 위반을 못 만들어 그대로 커밋.
      this.callbacks.onChartUpdate(this.chart);
      this.resizingEntityType = null;
      this.resizingIndex = null;
      this.resizingOriginalEndBeat = null;
      this.resizingOriginalBeat = null;
    } else if (this.dragType === "move") {
      // 통합 레인 모델 — 메인↔보조는 그냥 레인 이동이라 별도 변환·드롭 분기가 없다 (RFD 0018 ④).
      this.confirmPlacement();
    } else if (this.dragType === "boxSelect") {
      // Update end positions from final pointer position
      this._boxEndBeat = this.callbacks.space.yToBeatRaw(y);
      this._boxEndY = y; // px 기반 탭 판정(§6-6)용 — 최종 up 위치 반영
      const endLane = this.callbacks.space.xToUnifiedLane(x);
      if (endLane !== null) {
        this._boxEndLane = endLane;
      }
      this.updateBoxSelection();

      // 미선택 존/restZone 몸통 탭(움직임 없음)이면 빈 박스 확정 대신 그 유닛을 선택한다
      // (§6-6 · RFD 0019 미러). 후보는 배타적으로 하나만 산다.
      const tappedZone = this.pendingTapTarget(this._pendingZoneSelect);
      const tappedRestZone = this.pendingTapTarget(this._pendingRestZoneSelect);

      // §3-5: 프리뷰로 쌓인 박스 결과를 (드래그 시작 전 → 최종) 전이 하나로 확정한다.
      if (this.preDragSelection) {
        const finalSel: Selection = tappedZone !== null
          ? { ...this.sel, notes: new Set(), zones: new Set([tappedZone]) }
          : tappedRestZone !== null
            // restZone 탭 = 유닛 선택으로 교체 {notes:∅, zones:∅, restZones:{i}} (RFD 0019)
            ? { notes: new Set(), zones: new Set(), restZones: new Set([tappedRestZone]) }
            : this.sel;
        this.callbacks.setSelectionTransient(this.preDragSelection);
        this.callbacks.setSelection(finalSel);
        this.preDragSelection = null;
      }
    }

    this._pendingZoneSelect = null;
    this._pendingRestZoneSelect = null;
    this._boxEndBeat = null;
    this._boxEndLane = null;
    this.isDragging = false;
    this.dragType = null;
    this.dragStartBeat = null;
    this.dragStartLane = null;
  }

  /**
   * 박스 종료 시 존/restZone 몸통 탭 판정(§6-6) — 미선택 몸통에서 시작했고(pending),
   * 레인·beat 모두 움직임이 없었으면 그 인덱스를, 아니면 null을 반환한다.
   * (드래그가 일어났으면 null — 그냥 박스 결과로 확정된다.)
   */
  private pendingTapTarget(pending: number | null): number | null {
    if (pending === null) return null;
    if (this._boxStartLane === null || this._boxEndLane === null) return null;
    if (this._boxStartLane !== this._boxEndLane) return null;
    // 마우스 down↔up 미세 드리프트(1~2px, 트랙패드에서 흔함)를 흡수한다 — 정확 beat 일치(zero-slop)면
    // 탭이 쉽게 무산돼 존 선택 실패 + 기존 선택까지 통째로 해제된다. 터치와 같은 tap-slop(px)으로 판정.
    return Math.abs(this._boxEndY - this._boxStartY) <= TOUCH_MOVE_CANCEL_PX ? pending : null;
  }

  /**
   * 진행 중 드래그를 폐기한다 — editCancel(두 손가락 내비가 편집을 가로챌 때)처럼
   * 커밋 없이 끊길 때 호출한다. onPointerUp(커밋 시도)과 달리 무조건 드래그 시작
   * 시점으로 되돌린다. 드래그 중이 아니면 아무것도 하지 않는다.
   */
  cancel(): EditResult {
    if (!this.isDragging) return {};

    if (this.dragType === "resize") {
      this.rollbackResize();
      this.resizingEntityType = null;
      this.resizingIndex = null;
      this.resizingOriginalEndBeat = null;
      this.resizingOriginalBeat = null;
    } else if (this.dragType === "move") {
      this.rollbackMove();
    }
    // boxSelect는 차트를 변이하지 않지만 프리뷰(transient) 선택은 시작 전으로 복원한다(§3-5).
    if (this.dragType === "boxSelect" && this.preDragSelection) {
      this.callbacks.setSelectionTransient(this.preDragSelection);
    }
    this.preDragSelection = null;
    this._pendingZoneSelect = null;
    this._pendingRestZoneSelect = null;

    this._boxEndBeat = null;
    this._boxEndLane = null;
    this.isDragging = false;
    this.dragType = null;
    this.dragStartBeat = null;
    this.dragStartLane = null;
    return { clearDragPreview: true };
  }

  // --- Box select helper ---

  /** Compute selection from current box select state (shared by onPointerMove & onPointerUp) */
  private updateBoxSelection(): void {
    if (!this.dragStartBeat || !this._boxEndBeat) return;

    const startLane = this._boxStartLane;
    const endLane = this._boxEndLane;
    if (startLane === null || endLane === null) return;

    const startFirst = beatLt(this.dragStartBeat, this._boxEndBeat);
    const minBeat = startFirst ? this.dragStartBeat : this._boxEndBeat;
    const maxBeat = startFirst ? this._boxEndBeat : this.dragStartBeat;

    const minLane = Math.min(startLane, endLane);
    const maxLane = Math.max(startLane, endLane);
    // 앵커 없는 순수 감쌈 모델 (RFD 0016 §6-2) — 통합 인덱스(RFD 0018 ④).
    // zone·restZone 완전 감쌈=유닛 픽업(공존 축, RFD 0019), 통과=박스 안 개별 트릴,
    // 일반 노트=박스 안이면 선택. 동질성은 선택 커밋의 normalizeSelection 게이트가 처리한다.
    const { notes, zones, restZones } = selectionFromBox(
      this.chart.trillZones,
      this.chart.notes,
      this.chart.restZones ?? [],
      { minLane, maxLane, minBeat, maxBeat },
    );

    // 프레임 커밋은 프리뷰(transient) — §3-5 게이트는 드래그 종료 시 한 번만 적용된다.
    this.commitSelectionTransient({ notes, zones, restZones });
  }

  // --- Keyboard events ---

  /** Move selected notes by one snap unit */
  moveBySnap(direction: "up" | "down"): void {
    const hasMainSel =
      this.sel.notes.size > 0 || this.sel.zones.size > 0 || this.sel.restZones.size > 0;
    if (!hasMainSel) return;

    // Get snap unit from current snap setting (assume 1/snap beat)
    const snapStep = this.callbacks.space.getSnapStep();
    // Timeline: bottom = time 0, up = later time.
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);

    // restZone-only 선택(노트·존 없음): restZone만 평행이동한다 (RFD 0019)
    if (this.sel.notes.size === 0 && this.sel.zones.size === 0) {
      this.captureRestZoneOrigins();
      this.applyRestZoneMove(0, offset);
      return;
    }

    // 구간 유닛이 선택돼 있으면 구간 + 내부 파생 노트 + 일반 노트 + 선택된 restZone을
    // 같은 오프셋으로 이동 (RFD 0016 §4.2 · RFD 0019 공존)
    if (this.sel.zones.size > 0) {
      this.captureNoteOrigins(this.effectiveNoteIndices());
      this.captureZoneOrigins();
      this.captureRestZoneOrigins();
      this.applyZoneUnitMove(0, offset);
      return;
    }

    // 트릴 노트 단위 이동은 구간 안에서만: 한 스텝이 구간을 벗어나면 차단
    const snapTrillZone = this.trillZoneOfSelection();
    if (snapTrillZone) {
      const positions = [...this.sel.notes]
        .map((i) => this.chart.notes[i])
        .filter((n): n is NoteEntity => Boolean(n))
        .map((n) => ({ beat: n.beat, endBeat: "endBeat" in n ? n.endBeat : undefined }));
      const clamped = clampTrillBeatOffset(snapTrillZone, positions, offset);
      if (beatToFloat(clamped) !== beatToFloat(offset)) {
        this.callbacks.onWarn?.("트릴 노트는 구간 안에서만 이동할 수 있습니다");
        return;
      }
    }

    // Store original positions — 공존 축이라 선택된 restZone도 함께 캡처·이동 (RFD 0019)
    this.captureNoteOrigins();
    this.captureRestZoneOrigins();

    // Apply move
    const newNotes = this.buildMovedNotes(0, offset);
    const newRestZones = this.buildMovedRestZones(0, offset);

    // Block if any note/restZone goes out of timeline bounds
    if (
      !this.areNotesInBounds(newNotes, this.sel.notes) ||
      !this.movedRestZonesInBounds(newRestZones)
    ) {
      this.clearMoveOrigins();
      return;
    }

    this.chart = {
      ...this.chart,
      notes: newNotes,
      ...(this.originalRestZonePositions.size > 0 ? { restZones: newRestZones } : {}),
    };

    // 낙관적 편집(RFD 0017): 이동은 평행이동이라 구조 위반을 못 만들어 검증 없이 커밋.
    this.callbacks.onChartUpdate(this.chart);
    this.clearMoveOrigins();
  }

  /**
   * Move selected notes by one lane. 통합 레인 이동 — 메인4↔보조5는 한 칸 연속이고
   * 클램프는 isVisibleLane(1..4+extraLaneCount). 변환·이원 축은 없다 (RFD 0018 ④).
   */
  moveByLane(direction: "left" | "right"): void {
    const hasMainSel =
      this.sel.notes.size > 0 || this.sel.zones.size > 0 || this.sel.restZones.size > 0;
    if (!hasMainSel) return;

    // restZone-only 선택(노트·존 없음): restZone만 레인 이동한다(1~4 클램프, RFD 0019)
    if (this.sel.notes.size === 0 && this.sel.zones.size === 0) {
      const laneOffset = direction === "left" ? -1 : 1;
      this.captureRestZoneOrigins();
      this.applyRestZoneMove(laneOffset, { n: 0, d: 1 });
      return;
    }

    // 구간 유닛이 선택돼 있으면 구간 + 내부 파생 노트 + 일반 노트 + 선택된 restZone을
    // 전체 평행이동 (RFD 0019 공존)
    if (this.sel.zones.size > 0) {
      const laneOffset = direction === "left" ? -1 : 1;
      this.captureNoteOrigins(this.effectiveNoteIndices());
      this.captureZoneOrigins();
      this.captureRestZoneOrigins();
      this.applyZoneUnitMove(laneOffset, { n: 0, d: 1 });
      return;
    }

    // 트릴 노트 단위 선택은 구간(한 레인)을 벗어날 수 없으므로 레인 이동 차단
    if (this.trillZoneOfSelection()) {
      this.callbacks.onWarn?.("트릴 노트는 구간을 벗어날 수 없어 레인 이동이 불가합니다");
      return;
    }

    const laneOffset = direction === "left" ? -1 : 1;
    const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;

    // Check if all notes can move within visible lanes (메인·보조 통합)
    const selNotes = this.sel.notes;
    for (const idx of selNotes) {
      const note = this.chart.notes[idx];
      if (!isVisibleLane(note.lane + laneOffset, extraLaneCount)) return; // Block entire move
    }

    // 공존 축 — 선택된 restZone도 함께 레인 이동, 하나라도 레인(1~4) 밖이면 전체 차단 (RFD 0019)
    this.captureRestZoneOrigins();
    const newRestZones = this.buildMovedRestZones(laneOffset, { n: 0, d: 1 });
    if (!this.movedRestZonesInBounds(newRestZones)) {
      this.clearMoveOrigins();
      return; // Block entire move
    }

    // Apply lane move
    const newNotes = [...this.chart.notes];
    for (const idx of selNotes) {
      const note = newNotes[idx];
      newNotes[idx] = { ...note, lane: note.lane + laneOffset };
    }

    this.chart = {
      ...this.chart,
      notes: newNotes,
      ...(this.originalRestZonePositions.size > 0 ? { restZones: newRestZones } : {}),
    };

    // 낙관적 편집(RFD 0017): 레인 이동은 구조 위반을 못 만들어 검증 없이 커밋.
    this.callbacks.onChartUpdate(this.chart);
    this.clearMoveOrigins();
  }

  /** Resize selected long note end by one snap unit */
  resizeEndBySnap(direction: "up" | "down"): void {
    if (this.sel.notes.size === 0) return;

    // Get snap step
    const snapStep = this.callbacks.space.getSnapStep();
    // ArrowUp = extend end later (add snap), ArrowDown = shrink end earlier (subtract snap)
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);

    // Store original positions
    this.originalPositions.clear();
    for (const idx of this.sel.notes) {
      const note = this.chart.notes[idx];
      if (this.isRangeNote(note)) {
        this.originalPositions.set(idx, {
          beat: note.beat,
          endBeat: note.endBeat,
          lane: note.lane,
        });
      }
    }

    // Apply resize (only to range notes, enforce start < end)
    const newNotes = [...this.chart.notes];
    let blocked = false;
    for (const idx of this.sel.notes) {
      const note = newNotes[idx];
      if (this.isRangeNote(note)) {
        const rangeNote = note as RangeNote;
        const newEndBeat = beatAdd(rangeNote.endBeat, offset);
        // Prevent endBeat from going at or before startBeat
        if (beatLte(newEndBeat, rangeNote.beat)) {
          blocked = true;
          break;
        }
        newNotes[idx] = {
          ...rangeNote,
          endBeat: newEndBeat,
        };
      }
    }

    if (blocked) {
      this.originalPositions.clear();
      return;
    }

    this.chart = { ...this.chart, notes: newNotes };

    // 낙관적 편집(RFD 0017): 검증 없이 커밋.
    this.callbacks.onChartUpdate(this.chart);
    this.originalPositions.clear();
  }

  /** Confirm placement (Enter key or empty click) */
  confirmPlacement(): void {
    if (this.clipboardManager.isPendingPaste) {
      // 낙관적 편집(RFD 0017 §2): 붙여넣기 확정도 이동과 동형 — 구조 위반만 거부.
      this.clipboardManager.confirmPaste(
        this.chart,
        this.callbacks,
        (chart) => {
          const errors = validateChartStructural({
            notes: chart.notes,
            trillZones: chart.trillZones,
            restZones: chart.restZones,
            events: chart.events,
          });
          return errors.map((e) => String(e));
        },
      );
      return;
    }

    if (
      this.originalPositions.size === 0 &&
      this.originalZonePositions.size === 0 &&
      this.originalRestZonePositions.size === 0
    ) {
      return;
    }

    // Move mode: 낙관 커밋 (RFD 0017)
    this.commitMove();
  }

  /**
   * 이동 결과를 낙관 커밋한다(RFD 0017 §3-3) — 이동은 평행이동이라 구조 위반을 못 만들고,
   * 의미 위반은 transient로 허용되어 저장·플레이 게이트가 강제한다. 되돌리기는 undo.
   * (rollbackMove는 cancel(Esc) 전용으로 남는다.)
   */
  private commitMove(): void {
    this.callbacks.onChartUpdate(this.chart);
    this.clearMoveOrigins();
    this._trillMoveZone = null;
  }

  // ---------------------------------------------------------------------------
  // Clipboard: Copy / Cut / Paste
  // ---------------------------------------------------------------------------

  /**
   * 복사 대상 trillZone을 결정한다.
   * - 구간 유닛 선택(zones): 선택된 구간들 (일반 노트와 혼합 가능, RFD 0016)
   * - 노트 단위 트릴 선택: 그 노트들이 속한 구간(구간 단위로 승격)
   * - 그 외: 없음
   */
  private trillZonesToCopy(): Set<number> {
    if (this.sel.zones.size > 0) return new Set(this.sel.zones);
    const kind = classifySelection(this.chart.trillZones, this.chart.notes, this.sel.notes);
    if (kind.kind === "trill" && kind.zoneIndex >= 0) return new Set([kind.zoneIndex]);
    return new Set();
  }

  /**
   * 복사 대상 restZone = 선택된 restZones (trillZonesToCopy 미러, RFD 0019).
   * 공존 축이라 노트·존과 혼합 선택이면 클립보드에도 함께 담긴다.
   */
  private restZonesToCopy(): Set<number> {
    return new Set(this.sel.restZones);
  }

  copy(): number {
    // 구간 유닛의 내부 노트를 실행 시점에 파생해 함께 담는다 (RFD 0016 §4.2).
    // effectiveNoteIndices는 메인·보조 통합 인덱스 — 보조 노트도 chart.notes에서 복사된다 (RFD 0018 ④).
    return this.clipboardManager.copy(
      this.chart,
      this.effectiveNoteIndices(),
      this.trillZonesToCopy(),
      this.restZonesToCopy(),
    );
  }

  /** Cut selected notes (copy + delete) */
  cut(): number {
    if (this.clipboardManager.isPendingPaste) return 0;
    const count = this.copy();
    if (count > 0) {
      this.deleteSelected();
    }
    return count;
  }

  /** Paste clipboard at the given target beat. Returns count of pasted notes, 0 if clipboard empty. */
  paste(targetBeat: Beat): number {
    const result = this.clipboardManager.paste(
      this.chart,
      targetBeat,
      this.clipboardCallbacks(),
      () => this.clearSelection(),
    );
    if (result === null) return 0;

    this.chart = result.chart;
    // 차트 갱신(onChartUpdate) 후 커밋 — 붙여넣은 인덱스가 게이트 범위 보정에서 살아남는다.
    // 노트+restZone 혼합 붙여넣기는 두 공존 축을 함께 선택한다 (RFD 0019).
    this.commitSelection({
      notes: result.selectedIndices,
      restZones: new Set(result.pastedRestZoneIndices),
    });
    return result.count;
  }

  /** Cancel pending paste — remove pasted notes, restore pre-paste state */
  cancelPaste(): void {
    this.chart = this.clipboardManager.cancelPaste(
      this.chart,
      this.callbacks,
      () => this.clearSelection(),
    );
  }

  /**
   * Move pasted notes by snap step (during pending paste).
   * Unlike normal moveBySnap, this does NOT auto-rollback on violations.
   */
  movePasteBySnap(direction: "up" | "down"): void {
    const newChart = this.clipboardManager.movePasteBySnap(
      this.chart,
      direction,
      this.clipboardCallbacks(),
    );
    if (newChart !== null) {
      this.chart = newChart;
    }
  }

  /**
   * Move pasted notes by lane (during pending paste).
   * Does NOT auto-rollback on violations.
   */
  movePasteByLane(direction: "left" | "right"): void {
    const newChart = this.clipboardManager.movePasteByLane(
      this.chart,
      direction,
      this.clipboardCallbacks(),
    );
    if (newChart !== null) {
      this.chart = newChart;
    }
  }

  /** Delete selected notes */
  deleteSelected(): void {
    // restZone은 공존 축 — 선택된 restZone은 노트·존 삭제와 한 커밋으로 함께 지운다 (RFD 0019).
    // 순서 주의: 차트 커밋(setChart가 축소를 감지해 선택을 원자적으로 비움) → 해제.
    const selectedRest = this.sel.restZones;
    const withRestRemoved = (chart: Chart): Chart =>
      selectedRest.size > 0
        ? { ...chart, restZones: (chart.restZones ?? []).filter((_z, i) => !selectedRest.has(i)) }
        : chart;

    // 구간 유닛 선택: 구간 + 실행 시점 파생한 내부 노트 + 직접 선택한 일반 노트를
    // 함께 삭제 (빈 구간도 삭제, RFD 0016 §4.2)
    if (this.sel.zones.size > 0) {
      const zones = this.sel.zones;
      const noteIndices = this.effectiveNoteIndices();
      const notes = this.chart.notes.filter((_n, i) => !noteIndices.has(i));
      const trillZones = this.chart.trillZones.filter((_z, i) => !zones.has(i));
      this.chart = withRestRemoved({ ...this.chart, notes, trillZones });
      // 차트 축소 커밋이 선택을 원자적으로 비운다(setChart, §3-5 면제 경로).
      this.callbacks.onChartUpdate(this.chart);
      this.clearSelection();
      return;
    }

    if (this.sel.notes.size === 0) {
      // restZone-only 선택 삭제
      if (selectedRest.size === 0) return;
      this.chart = withRestRemoved(this.chart);
      this.callbacks.onChartUpdate(this.chart);
      this.clearSelection();
      return;
    }

    // sel.notes는 메인·보조 통합 인덱스 — deleteChartNotesAtIndices가 둘 다 삭제한다 (RFD 0018 ④).
    this.chart = withRestRemoved(deleteChartNotesAtIndices(this.chart, this.sel.notes));
    // 순서 주의: 차트 커밋 → 선택 해제. 반대면 §3-5 게이트가 위반 노트 삭제를 막는다.
    this.callbacks.onChartUpdate(this.chart);
    this.clearSelection();
  }

  // --- Private helpers ---

  private startMainMoveDrag(x: number, y: number): void {
    const lane = this.callbacks.space.xToUnifiedLane(x);
    // 구간 유닛(빈 구간 포함)·restZone이 선택돼 있으면 노트가 없어도 이동 가능
    if (
      lane === null ||
      (this.sel.notes.size === 0 && this.sel.zones.size === 0 && this.sel.restZones.size === 0)
    ) {
      return;
    }

    this.isDragging = true;
    this.dragType = "move";
    this.dragStartBeat = this.callbacks.space.yToBeat(y);
    this.dragStartLane = lane;
    this._lastMoveLaneOffset = 0;

    // 직접 선택한 notes + 구간 파생 노트를 함께 캡처 — 혼합 선택도 한 오프셋으로 움직인다 (RFD 0016 §4.2)
    this.captureNoteOrigins(this.effectiveNoteIndices());
    // 구간 유닛이 있으면 이동할 트릴존 원본을 캡처(자유 이동), 노트 단위면 가둘 구간을 캡처(제약 이동).
    if (this.sel.zones.size > 0) {
      this._trillMoveZone = null;
      this.captureZoneOrigins();
    } else {
      this._trillMoveZone = this.trillZoneOfSelection();
      this.originalZonePositions.clear();
    }
    // restZone 유닛 이동 원본 캡처 — 공존 축이라 notes·zones와 함께 캡처돼 한 오프셋으로 움직인다 (RFD 0019)
    this.captureRestZoneOrigins();
  }

  /** 현재 선택이 트릴 노트 단위(같은 구간)이면 그 trillZone을, 아니면 null을 반환한다. */
  private trillZoneOfSelection(): TrillZone | null {
    const kind = classifySelection(this.chart.trillZones, this.chart.notes, this.sel.notes);
    if (kind.kind !== "trill" || kind.zoneIndex < 0) return null;
    return this.chart.trillZones[kind.zoneIndex] ?? null;
  }

  /** originalPositions를 {beat, endBeat?} 배열로 변환 (클램프 계산용). */
  private movePositionList(): Array<{ beat: Beat; endBeat?: Beat }> {
    return [...this.originalPositions.values()].map((p) => ({ beat: p.beat, endBeat: p.endBeat }));
  }

  // --- 구간 단위 이동 (선택된 트릴존 + 노트를 한 덩어리로) ---

  /** 이동 시작 시점, 선택된 트릴존들의 원본 좌표를 기록한다. */
  private captureZoneOrigins(): void {
    this.originalZonePositions.clear();
    for (const idx of this.sel.zones) {
      const zone = this.chart.trillZones[idx];
      if (zone) this.originalZonePositions.set(idx, { ...zone });
    }
  }

  /** 기록된 원본 좌표에 오프셋을 적용한 새 트릴존 배열을 만든다. */
  private buildMovedZones(laneOffset: number, beatOffset: Beat): TrillZone[] {
    if (this.originalZonePositions.size === 0) return this.chart.trillZones;
    const zones = [...this.chart.trillZones];
    for (const [idx, origin] of this.originalZonePositions) {
      zones[idx] = translateTrillZone(origin, laneOffset, beatOffset);
    }
    return zones;
  }

  /** 이동된 트릴존들이 레인(1~4)·타임라인 범위 안에 있는지 검사한다. */
  private movedZonesInBounds(zones: TrillZone[]): boolean {
    const maxFloat = this.callbacks.space.getMaxBeatFloat();
    for (const idx of this.originalZonePositions.keys()) {
      const zone = zones[idx];
      if (!zone) continue;
      if (!isMainLane(zone.lane)) return false; // 트릴존은 메인 레인 전용 (§3-2)
      if (beatToFloat(zone.beat) < 0 || beatToFloat(zone.endBeat) > maxFloat) return false;
    }
    return true;
  }

  /** 기록된 원본 좌표로 트릴존을 되돌린 새 배열을 만든다. */
  private restoredZones(): TrillZone[] {
    if (this.originalZonePositions.size === 0) return this.chart.trillZones;
    const zones = [...this.chart.trillZones];
    for (const [idx, origin] of this.originalZonePositions) {
      zones[idx] = { ...origin };
    }
    return zones;
  }

  // --- restZone 유닛 이동 (RFD 0019 — trillZone 유닛 이동 미러, 내부 노트 파생 없음) ---

  /** 이동 시작 시점, 선택된 restZone들의 원본 좌표를 기록한다. */
  private captureRestZoneOrigins(): void {
    this.originalRestZonePositions.clear();
    const restZones = this.chart.restZones ?? [];
    for (const idx of this.sel.restZones) {
      const zone = restZones[idx];
      if (zone) this.originalRestZonePositions.set(idx, { ...zone });
    }
  }

  /**
   * 기록된 원본 좌표에 오프셋을 적용한 새 restZone 배열을 만든다.
   * beat 평행이동은 translateRestZone, 레인 이동은 여기서 얹는다(레인 검증은 호출부).
   */
  private buildMovedRestZones(laneOffset: number, beatOffset: Beat): RestZone[] {
    const restZones = [...(this.chart.restZones ?? [])];
    for (const [idx, origin] of this.originalRestZonePositions) {
      restZones[idx] = {
        ...translateRestZone(origin, beatOffset),
        lane: (origin.lane + laneOffset) as RestZone["lane"],
      };
    }
    return restZones;
  }

  /** 이동된 restZone들이 레인(1~4)·타임라인 범위 안에 있는지 검사한다 (movedZonesInBounds 미러). */
  private movedRestZonesInBounds(restZones: RestZone[]): boolean {
    const maxFloat = this.callbacks.space.getMaxBeatFloat();
    for (const idx of this.originalRestZonePositions.keys()) {
      const zone = restZones[idx];
      if (!zone) continue;
      if (!isMainLane(zone.lane)) return false; // restZone은 가시 레인 1~4 전용 (RFD 0019 §4-1)
      if (beatToFloat(zone.beat) < 0 || beatToFloat(zone.endBeat) > maxFloat) return false;
    }
    return true;
  }

  /** 기록된 원본 좌표로 restZone을 되돌린 새 배열을 만든다. */
  private restoredRestZones(): RestZone[] {
    const restZones = [...(this.chart.restZones ?? [])];
    for (const [idx, origin] of this.originalRestZonePositions) {
      restZones[idx] = { ...origin };
    }
    return restZones;
  }

  /**
   * 타임라인 최대 박(float)을 Beat로 접는다 — clampRestBeatOffset(Beat 정밀 산술)용.
   * 1/960 해상도 내림이라 클램프가 최대치를 넘어서지 않는다.
   */
  private maxTimelineBeat(): Beat {
    return { n: Math.floor(this.callbacks.space.getMaxBeatFloat() * 960), d: 960 };
  }

  /** 주어진 노트들의 원본 좌표를 기록한다(이동용). 기본값은 직접 선택한 notes. */
  private captureNoteOrigins(indices: ReadonlySet<number> = this.sel.notes): void {
    this.originalPositions.clear();
    for (const idx of indices) {
      const note = this.chart.notes[idx];
      if (!note) continue;
      if (this.isRangeNote(note)) {
        this.originalPositions.set(idx, { beat: note.beat, endBeat: note.endBeat, lane: note.lane });
      } else {
        this.originalPositions.set(idx, { beat: note.beat, lane: note.lane });
      }
    }
  }

  /** 이동 원본 기록(메인·구간·restZone)을 모두 폐기한다. */
  private clearMoveOrigins(): void {
    this.originalPositions.clear();
    this.originalZonePositions.clear();
    this.originalRestZonePositions.clear();
  }

  /** 기록된 원본 좌표에 오프셋을 적용한 새 노트 배열을 만든다. lane은 통합 lane 공간이다. */
  private buildMovedNotes(laneOffset: number, beatOffset: Beat): NoteEntity[] {
    const newNotes = [...this.chart.notes];
    for (const [idx, original] of this.originalPositions) {
      const newLane = original.lane + laneOffset;
      const newBeat = beatAdd(original.beat, beatOffset);
      if (this.isRangeNote(newNotes[idx])) {
        const duration = beatSub(original.endBeat!, original.beat);
        newNotes[idx] = {
          ...newNotes[idx],
          lane: newLane,
          beat: newBeat,
          endBeat: beatAdd(newBeat, duration),
        } as RangeNote;
      } else {
        newNotes[idx] = { ...newNotes[idx], lane: newLane, beat: newBeat };
      }
    }
    return newNotes;
  }

  /**
   * 키보드 등 단발 평행이동을 적용한다 — 구간·파생 노트·일반 노트 전체.
   * originalPositions/originalZonePositions가 미리 캡처되어 있어야 한다.
   * 레인/범위/구간겹침 검증을 통과하면 커밋, 아니면 토스트 후 무변경(no-op, RFD 0016 §4.2).
   */
  private applyZoneUnitMove(laneOffset: number, beatOffset: Beat): void {
    const newNotes = this.buildMovedNotes(laneOffset, beatOffset);
    const newZones = this.buildMovedZones(laneOffset, beatOffset);
    // 공존 축 — 선택된 restZone도 같은 오프셋으로 함께 이동한다 (RFD 0019)
    const newRestZones = this.buildMovedRestZones(laneOffset, beatOffset);

    // 노트 통합 레인·범위, 구간 레인·범위 검증 — 이동 대상은 캡처된 원본(파생 노트 포함)
    const moveTargets = new Set(this.originalPositions.keys());
    const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;
    let laneOk = true;
    for (const idx of moveTargets) {
      if (!isVisibleLane(newNotes[idx].lane, extraLaneCount)) { laneOk = false; break; }
    }

    if (!laneOk
      || !this.areNotesInBounds(newNotes, moveTargets)
      || !this.movedZonesInBounds(newZones)
      || !this.movedRestZonesInBounds(newRestZones)) {
      this.callbacks.onWarn?.("더 이상 이동할 수 없습니다");
      this.clearMoveOrigins();
      return;
    }

    const candidate = {
      ...this.chart,
      notes: newNotes,
      trillZones: newZones,
      ...(this.originalRestZonePositions.size > 0 ? { restZones: newRestZones } : {}),
    };
    // 낙관적 편집(RFD 0017): 존 이동은 평행이동이라 구조 위반을 못 만들어 검증 없이 커밋한다.
    this.chart = candidate;
    this.callbacks.onChartUpdate(this.chart);
    this.clearMoveOrigins();
  }

  /**
   * restZone 유닛의 키보드 단발 평행이동 (applyZoneUnitMove 미러, RFD 0019).
   * originalRestZonePositions가 미리 캡처되어 있어야 한다.
   * 레인(1~4)·타임라인 범위를 벗어나면 토스트 후 무변경(no-op).
   */
  private applyRestZoneMove(laneOffset: number, beatOffset: Beat): void {
    const newRestZones = this.buildMovedRestZones(laneOffset, beatOffset);
    if (!this.movedRestZonesInBounds(newRestZones)) {
      this.callbacks.onWarn?.("더 이상 이동할 수 없습니다");
      this.clearMoveOrigins();
      return;
    }

    // 낙관적 편집(RFD 0017): 평행이동은 구조 위반을 못 만들어 검증 없이 커밋한다.
    this.chart = { ...this.chart, restZones: newRestZones };
    this.callbacks.onChartUpdate(this.chart);
    this.clearMoveOrigins();
  }

  private isRangeNote(note: NoteEntity): note is RangeNote {
    return "endBeat" in note;
  }

  /** Check if all notes in the array are within timeline bounds [0, maxBeat] */
  private areNotesInBounds(notes: NoteEntity[], indices: Set<number>): boolean {
    const maxFloat = this.callbacks.space.getMaxBeatFloat();

    for (const idx of indices) {
      const note = notes[idx];
      const beatFloat = beatToFloat(note.beat);
      if (beatFloat < 0 || beatFloat > maxFloat) return false;
      if (this.isRangeNote(note)) {
        const endFloat = beatToFloat(note.endBeat);
        if (endFloat < 0 || endFloat > maxFloat) return false;
      }
    }
    return true;
  }

  private startResize(
    entityType: "note" | "event" | "trillZone" | "restZone",
    index: number,
    startBeat: Beat,
    endBeat: Beat,
  ): void {
    this.isDragging = true;
    this.dragType = "resize";
    this.resizingEntityType = entityType;
    this.resizingIndex = index;
    this.resizingOriginalBeat = startBeat;
    this.resizingOriginalEndBeat = endBeat;
  }

  private rollbackResize(): void {
    if (this.resizingIndex === null || this.resizingOriginalEndBeat === null) return;

    if (this.resizingEntityType === "note") {
      const newNotes = [...this.chart.notes];
      const note = newNotes[this.resizingIndex];
      if (this.isRangeNote(note)) {
        newNotes[this.resizingIndex] = { ...note, endBeat: this.resizingOriginalEndBeat } as RangeNote;
        this.chart = { ...this.chart, notes: newNotes };
      }
    } else if (this.resizingEntityType === "event") {
      const newEvents = [...this.chart.events];
      const evtToRollback = newEvents[this.resizingIndex];
      if ('endBeat' in evtToRollback) {
        newEvents[this.resizingIndex] = { ...evtToRollback, endBeat: this.resizingOriginalEndBeat };
        this.chart = { ...this.chart, events: newEvents };
      }
    } else if (this.resizingEntityType === "trillZone") {
      const newZones = [...this.chart.trillZones];
      newZones[this.resizingIndex] = { ...newZones[this.resizingIndex], endBeat: this.resizingOriginalEndBeat };
      this.chart = { ...this.chart, trillZones: newZones };
    } else if (this.resizingEntityType === "restZone") {
      const newRestZones = [...(this.chart.restZones ?? [])];
      if (newRestZones[this.resizingIndex]) {
        newRestZones[this.resizingIndex] = { ...newRestZones[this.resizingIndex], endBeat: this.resizingOriginalEndBeat };
        this.chart = { ...this.chart, restZones: newRestZones };
      }
    }

    this.callbacks.onChartUpdate(this.chart);
  }

  private rollbackMove(): void {
    // 원본이 없으면 차트를 건드리지 않는다 — 불필요한 emit 방지
    if (
      this.originalPositions.size === 0 &&
      this.originalZonePositions.size === 0 &&
      this.originalRestZonePositions.size === 0
    ) {
      this._trillMoveZone = null;
      return;
    }
    const newNotes = [...this.chart.notes];
    for (const [idx, original] of this.originalPositions) {
      if (this.isRangeNote(newNotes[idx])) {
        newNotes[idx] = {
          ...newNotes[idx],
          lane: original.lane,
          beat: original.beat,
          endBeat: original.endBeat!,
        } as RangeNote;
      } else {
        newNotes[idx] = {
          ...newNotes[idx],
          lane: original.lane,
          beat: original.beat,
        };
      }
    }
    // 구간(트릴존·restZone) 단위 이동이었다면 그 구간들도 원위치로 되돌린다.
    const restoredZones = this.restoredZones();
    this.chart = {
      ...this.chart,
      notes: newNotes,
      trillZones: restoredZones,
      ...(this.originalRestZonePositions.size > 0 ? { restZones: this.restoredRestZones() } : {}),
    };
    this.callbacks.onChartUpdate(this.chart);
    this.clearMoveOrigins();
    this._trillMoveZone = null;
  }
}

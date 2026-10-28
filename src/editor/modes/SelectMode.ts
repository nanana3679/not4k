import { bodyCompanionIndices, bodyDeletionBlockReason, reconcileMovedSustains, resizeExplicitBodies } from '../editing/explicitEditing';
import { editorChartErrors } from "../documentValidation";
import type { ChartDocument, DocumentNoteEntity, RangeNote, BodyNote, Beat } from "../../shared";
import { validateChartDocumentStructural, beatToFloat, isVisibleLane, isMainLane } from "../../shared";
import { beatAdd, beatSub, beatLt, beatLte } from "../../shared";
import {
  deleteChartNotesAtIndices,
  expandTrillPairIndices,
} from "../editing/editApplication";
import { ClipboardManager, type ClipboardCallbacks } from "./ClipboardManager";
import { resolveLongPressAction } from "./longPressRouting";
import { resolveGrab, type GrabTarget } from "./resolveGrab";
import { TOUCH_MOVE_CANCEL_PX } from "../hooks/touchGesture";
import { isExplicitScoreNote } from "../timeline/hitTest";
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
  onChartUpdate: (chart: ChartDocument, transaction?: symbol) => void;
  /** 선택의 소유자(SelectionSlice)에서 현재 선택을 읽는다. 사본 저장 금지. */
  getSelection: () => Selection;
  /** 선택 전체 값을 정규화해 커밋한다. */
  setSelection: (sel: Selection) => boolean;
  /** 드래그 프리뷰의 선택을 정규화한다. 취소하면 시작 전 선택을 복구한다. */
  setSelectionTransient: (sel: Selection) => void;
  /** 좌표 공간(변환·스냅·히트테스트) — TimelineSpace deep module 주입 */
  space: TimelineSpace;
  /** 현재 보조 레인 수 — 레인 이동 클램프(isVisibleLane)에 쓴다 */
  getExtraLaneCount?: () => number;
  /** 붙여넣기가 보조 레인 초과 시 자동 확장(RFD 0018 §8-6 D3) */
  setExtraLaneCount?: (count: number, transaction?: symbol) => void;
  onWarn?: (msg: string) => void;
  /** onInterrupt는 독립 명령이 이 transaction을 먼저 확정했을 때 불린다. */
  beginTransaction?: (onInterrupt: () => void) => symbol | null;
  commitTransaction?: (transaction: symbol) => void;
  cancelTransaction?: (transaction: symbol) => void;
}

export class SelectMode implements EditorMode {
  private chart: ChartDocument;
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
  private resizeOriginalNotes: DocumentNoteEntity[] | null = null;
  private transactionToken: symbol | null = null;
  private _interruptedDragCount = 0;
  private originalSustainCountByNoteIndex = new Map<number, 1 | 2>();

  // Clipboard & paste state
  private clipboardManager: ClipboardManager = new ClipboardManager();

  // 박스 드래그 취소 시 복구할 시작 전 선택.
  private preDragSelection: Selection | null = null;

  // 미선택 존 몸통에서 시작한 박스의 탭 후보(§6-6) — up에서 움직임이 없었으면
  // 빈 박스 확정 대신 이 존을 유닛 선택한다. 모든 종료 경로(up·cancel)에서 리셋.
  private _pendingZoneSelect: number | null = null;
  // 미선택 restZone 몸통 탭 후보 — trillZone(§6-6) 미러 (RFD 0019). down은 한 몸통만
  // 히트하므로 둘 중 하나만 산다.
  private _pendingRestZoneSelect: number | null = null;

  // 포인터가 레인 밖에 있는 동안 레인 오프셋을 고정하기 위한 마지막 유효값.
  private _lastMoveLaneOffset = 0;

  constructor(chart: ChartDocument, callbacks: SelectModeCallbacks) {
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
   */
  private commitSelection(partial: Partial<Selection>): boolean {
    return this.callbacks.setSelection({ ...this.sel, ...partial });
  }

  /** 박스 드래그 프레임의 선택을 정규화한다. */
  private commitSelectionTransient(partial: Partial<Selection>): void {
    this.callbacks.setSelectionTransient({ ...this.sel, ...partial });
  }

  /** 클립보드 매니저에 넘길 콜백 서브셋(통합 차트 기준). */
  private clipboardCallbacks(): ClipboardCallbacks {
    return {
      space: this.callbacks.space,
      getExtraLaneCount: this.callbacks.getExtraLaneCount,
      setExtraLaneCount: count => {
        if (this.transactionToken) this.callbacks.setExtraLaneCount?.(count, this.transactionToken);
        else this.callbacks.setExtraLaneCount?.(count);
      },
      onWarn: this.callbacks.onWarn,
      onChartUpdate: chart => this.callbacks.onChartUpdate(chart, this.transactionToken ?? undefined),
    };
  }

  setChart(chart: ChartDocument): void {
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

  /** 새 노트 선택. 범위 밖 index이면 false. */
  selectNote(index: number): boolean {
    if (index >= 0 && index < this.chart.notes.length) {
      // 단순 클릭 선택 = 전체 교체 — zones·restZones도 함께 해제한다 (공존 축이지만 교체는 전축)
      return this.commitSelection({
        notes: this.newNoteSelection(index),
        zones: new Set(),
        restZones: new Set(),
      });
    }
    return false;
  }

  /** 명시 바디 동반 선택은 진입점에서만 계산한다. */
  private newNoteSelection(index: number): Set<number> {
    return this.withTrillPairs(bodyCompanionIndices(this.chart.notes, index));
  }

  selectAll(): void {
    // 구간 유닛은 내부 트릴 노트를 대표하므로 기존 트릴 정규화를 보존한다.
    const selection = selectionFromBox(this.chart.trillZones, this.chart.notes, this.chart.restZones ?? [], {
      minLane: 1, maxLane: Infinity, minBeat: { n: 0, d: 1 }, maxBeat: { n: Number.MAX_SAFE_INTEGER, d: 1 },
    });
    this.callbacks.setSelection(selection);
  }

  private beginTransaction(): void {
    this.transactionToken = this.callbacks.beginTransaction?.(() => this.settleInterruptedInteraction()) ?? null;
  }

  /**
   * 독립 명령(G·모드 전환·Undo 등)이 이 모드의 transaction을 먼저 확정했다. 붙여넣기 대기와
   * 이동·리사이즈 드래그를 그 시점 결과로 끝내 옛 token으로 store에 쓰지 않게 한다.
   */
  private settleInterruptedInteraction(): void {
    this.transactionToken = null;
    this.clipboardManager.settlePaste();
    if (this.dragType === "move" || this.dragType === "resize") {
      this.endDragWithoutWrite();
      this._interruptedDragCount += 1;
    }
  }

  /**
   * 독립 명령이 끊은 이동·리사이즈 드래그 수. 캔버스 입력은 누름 시작 때 값과 비교해, 같은
   * 누름이 남은 후보로 새 드래그를 다시 열지 않게 한다.
   */
  get interruptedDragCount(): number {
    return this._interruptedDragCount;
  }

  /** 드래그 상태만 비운다. 차트 쓰기·transaction 종료는 호출자가 이미 끝냈다. */
  private endDragWithoutWrite(): void {
    this.resizingEntityType = null;
    this.resizingIndex = null;
    this.resizingOriginalEndBeat = null;
    this.resizingOriginalBeat = null;
    this.resizeOriginalNotes = null;
    this.clearMoveOrigins();
    this._trillMoveZone = null;
    this.isDragging = false;
    this.dragType = null;
    this.dragStartBeat = null;
    this.dragStartLane = null;
  }

  private finishTransaction(cancel = false): void {
    const token = this.transactionToken;
    if (!token) return;
    this.transactionToken = null;
    if (cancel) this.callbacks.cancelTransaction?.(token);
    else this.callbacks.commitTransaction?.(token);
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

    // 이미 선택된 노트면 혼합 선택(구간 포함)을 유지한 채 전체를 이동한다. 명시 Point·릴리즈·
    // 유지 노트도 같다(RFD 0016 §6-6). 구간 유닛의 내부(파생) 노트도 "선택된 엔티티"로 취급 —
    // 잡아 끌면 단독 선택으로 교체하지 않고 유닛째 이동한다 (RFD 0016 §4.2 실행 시점 파생).
    if (!this.sel.notes.has(index) && !this.zoneDerivedNoteIndices().has(index)) {
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

    if (!this.sel.notes.has(index) && !this.selectNote(index)) return false;
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
    const hit = hits.noteHit === null ? undefined : this.chart.notes[hits.noteHit];
    const scoreHit = isExplicitScoreNote(hit);
    const action = resolveLongPressAction(scoreHit ? { ...hits, noteEndHit: null } : hits);
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
    if (this.sel.notes.has(index)) return new Set(this.sel.notes);
    const kind = classifySelection(this.chart.trillZones, this.chart.notes, this.sel.notes);
    const reason = selectionBlockReason(kind, this.chart.trillZones, note);
    if (reason) {
      this.callbacks.onWarn?.(reason);
      return null;
    }
    const notes = new Set(this.sel.notes);
    for (const candidate of this.newNoteSelection(index)) notes.add(candidate);
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

  /**
   * 터치 탭 한 번을 (x, y)의 down+up 한 쌍으로 처리한다 — 마우스 클릭과 같은 짝이다(#154).
   *
   * 터치 탭은 뗀 시점(up)에 발화해 물리 up이 따로 오지 않는다. down만 보내면 노트 down이 연
   * 이동 드래그(beginMoveDrag)가 남아, 다음 박스 드래그의 down이 재진입 가드에 막히고 그 move가
   * 직전에 탭한 노트를 끌고 간다. 같은 좌표의 up으로 바로 닫는다(이동량 0 커밋 하나는 마우스
   * 클릭과 같다). toggleSelection에는 터치 다중선택 래치를 넘긴다 — 켜져 있으면 탭한 노트를
   * 선택에 추가/제거만 하고 드래그를 열지 않는다.
   */
  tapAt(x: number, y: number, toggleSelection: boolean): void {
    this.onPointerDown(x, y, false, false, toggleSelection);
    this.onPointerUp(x, y);
  }

  /**
   * grab 우선순위 사다리(resolveGrab)를 현재 선택·차트 사실을 주입해 실행하는 공개 seam.
   *
   * 마우스 down(onPointerDown)과 터치 select down 스케줄(useCanvasEvents →
   * scheduleFromGrabTarget)이 **글자 그대로 같은 호출**을 소비하므로 z-order·게이트 지식이
   * 두 경로로 갈라질 코드 위치가 없다(#143). sel(선택 게이트 1·3·4용)과 isRangeNote(끝캡
   * 게이트용)는 SelectMode가 소유한 사실이라 훅이 shadow하지 않도록 여기서 주입한다.
   */
  resolveGrabAt(x: number, y: number): GrabTarget {
    return resolveGrab({
      x,
      y,
      space: this.callbacks.space,
      sel: this.sel, // getSelection() 라이브 getter — 사본 금지, 캡 게이트가 이 값을 읽는다.
      isRangeNote: (i) => {
        const n = this.chart.notes[i];
        return n !== undefined && this.isRangeNote(n);
      },
    });
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

    // grab 우선순위 사다리는 resolveGrab이 단독 소유한다(#143). 마우스·터치가 같은 함수를
    // 소비하므로 z-order 변경은 그 한 곳이다. 여기 case 본문은 대상 확정 "후"의
    // 수식자(toggle/Shift/Alt)·선택 커밋·드래그 시작만 담는다 — 사다리와 독립.
    let target = this.resolveGrabAt(x, y);
    if (target.kind === 'noteEndCap' && (shiftKey || altKey || toggleSelection)) {
      target = { kind: 'note', index: target.index };
    }

    switch (target.kind) {
      case "noteEndCap": {
        // 미선택 바디 끝은 동반 선택하고, 선택된 바디 끝은 현재 set을 보존한다.
        const endHit = target.index;
        const isSelected = this.sel.notes.has(endHit);
        if (!isSelected) {
          if (!this.commitSelection({ notes: this.newNoteSelection(endHit), zones: new Set(), restZones: new Set() })) {
            return;
          }
        }
        const note = this.chart.notes[endHit] as RangeNote | BodyNote;
        this.startResize("note", endHit, note.beat, note.endBeat);
        return;
      }
      case "eventEndCap": {
        const evtHit = target.index;
        const evt = this.chart.events[evtHit];
        if (!('endBeat' in evt)) return; // 방어: hitTestEventEnd는 endBeat 있는 이벤트만 반환.
        this.startResize("event", evtHit, evt.beat, evt.endBeat);
        return;
      }
      case "trillZoneEndCap": {
        const zoneHit = target.index;
        const zone = this.chart.trillZones[zoneHit];
        this.startResize("trillZone", zoneHit, zone.beat, zone.endBeat);
        return;
      }
      case "restZoneEndCap": {
        const restEndHit = target.index;
        const zone = (this.chart.restZones ?? [])[restEndHit];
        if (zone) {
          this.startResize("restZone", restEndHit, zone.beat, zone.endBeat);
        }
        return;
      }
      case "note": {
        const hitIndex = target.index;
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
          // 선택된 노트(명시 Point·릴리즈·유지 포함)를 누르면 선택 전체를 이동한다 (RFD 0016 §6-6).
          this.beginMoveDrag(x, y);
        } else {
          // 단순 클릭은 선택 전체 교체(zones·restZones 포함 해제). 트릴 쌍은 클릭 선택에서도 한 단위.
          const committed = this.commitSelection({
            notes: this.newNoteSelection(hitIndex),
            zones: new Set(),
            restZones: new Set(),
          });
          if (committed) this.beginMoveDrag(x, y);
        }
        return;
      }
      case "trillZoneBody": {
        // 노트-히트 실패 → 존 몸통이면 "클릭=선택, 선택 후 드래그=이동" (RFD 0016 §6-6).
        // 이동 필(핸들) 제거 후 존 몸통이 노트와 같은 상호작용 규칙을 따른다.
        const zoneHit = target.index;
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
      case "restZoneBody": {
        // 노트·트릴존 히트 실패 → restZone 몸통 (RFD 0019 — trillZone §6-6 미러).
        const restHit = target.index;
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
      case "empty": {
        // Clicking empty space
        if (!shiftKey && !altKey) {
          this.startBoxSelect(x, y);
        }
        return;
      }
      default: {
        const _exhaustive: never = target;
        return _exhaustive;
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
    // 박스 프레임은 미리보기다. 취소에 대비해 시작 전 선택을 보관한다.
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

        let tentativeChart: ChartDocument | null = null;
        if (this.resizingEntityType === "note") {
          const note = this.chart.notes[this.resizingIndex];
          if (this.isRangeNote(note)) {
            const source = this.resizeOriginalNotes ?? this.chart.notes;
            const newNotes = note.type === 'body'
              ? resizeExplicitBodies(source, new Map([[this.resizingIndex, newEndBeat]]), this.sel.notes)
              : [...this.chart.notes];
            if (!newNotes) return;
            if (note.type !== 'body') newNotes[this.resizingIndex] = { ...note, endBeat: newEndBeat };
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

        // 낙관적 편집(RFD 0017 §3-3): 의미 위반은 보통 프리뷰에 반영한다.
        // 단, 추가 4의 trillZone 끝 축소로 새 트릴 구간 위반이 생기면 마지막 유효 상태를 유지한다.
        if (tentativeChart !== null) {
          if (
            this.resizingEntityType === "trillZone" &&
            introducesTrillExclusivityViolation(this.chart, tentativeChart)
          ) {
            return;
          }
          this.chart = tentativeChart;
          this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
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
        this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
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
      this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
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

      // 프리뷰로 쌓인 최종 박스 선택을 확정한다.
      if (this.preDragSelection) {
        const finalSel: Selection = tappedZone !== null
          // 트릴존 탭 = 유닛 선택으로 전체 교체 — restZones도 비운다(단순 탭=전축 교체, 리뷰 C4)
          ? { notes: new Set(), zones: new Set([tappedZone]), restZones: new Set() }
          : tappedRestZone !== null
            // restZone 탭 = 유닛 선택으로 교체 {notes:∅, zones:∅, restZones:{i}} (RFD 0019)
            ? { notes: new Set(), zones: new Set(), restZones: new Set([tappedRestZone]) }
            : this.sel;
        this.callbacks.setSelectionTransient(this.preDragSelection);
        this.callbacks.setSelection(finalSel);
        this.preDragSelection = null;
      }
    }

    this.finishTransaction();
    this.resizeOriginalNotes = null;
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
    // boxSelect 취소는 차트를 건드리지 않고 시작 전 선택만 복원한다.
    if (this.dragType === "boxSelect" && this.preDragSelection) {
      this.callbacks.setSelectionTransient(this.preDragSelection);
    }
    this.finishTransaction(true);
    this.resizeOriginalNotes = null;
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

    // 프레임 선택은 취소 가능한 프리뷰다.
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
        .filter((n): n is DocumentNoteEntity => Boolean(n))
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
    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
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
      notes: reconcileMovedSustains(newNotes, selNotes),
      ...(this.originalRestZonePositions.size > 0 ? { restZones: newRestZones } : {}),
    };

    // 낙관적 편집(RFD 0017): 레인 이동은 구조 위반을 못 만들어 검증 없이 커밋.
    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
    this.clearMoveOrigins();
  }

  /** Resize selected long note end by one snap unit */
  resizeEndBySnap(direction: "up" | "down"): void {
    if (this.sel.notes.size === 0) return;

    // Get snap step
    const snapStep = this.callbacks.space.getSnapStep();
    // ArrowUp = extend end later (add snap), ArrowDown = shrink end earlier (subtract snap)
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);

    const endsByBody = new Map<number, Beat>();
    let newNotes = [...this.chart.notes];
    for (const idx of this.sel.notes) {
      const note = this.chart.notes[idx];
      if (!this.isRangeNote(note)) continue;
      const endBeat = beatAdd(note.endBeat, offset);
      if (note.type === 'body') endsByBody.set(idx, endBeat);
      else {
        if (beatLte(endBeat, note.beat)) return;
        newNotes[idx] = { ...note, endBeat };
      }
    }
    const resized = resizeExplicitBodies(this.chart.notes, endsByBody, this.sel.notes);
    if (!resized) return;
    newNotes = newNotes.map((note, index) => this.chart.notes[index].type === 'body'
      || this.chart.notes[index].type === 'release' ? resized[index] : note);
    if (JSON.stringify(newNotes) === JSON.stringify(this.chart.notes)) return;
    this.chart = { ...this.chart, notes: newNotes };
    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
  }

  /** Confirm placement (Enter key or empty click) */
  confirmPlacement(): void {
    if (this.clipboardManager.isPendingPaste) {
      // 낙관적 편집(RFD 0017 §2): 붙여넣기 확정도 이동과 동형 — 구조 위반만 거부.
      this.clipboardManager.confirmPaste(
        this.chart,
        this.clipboardCallbacks(),
        (chart) => {
          const errors = validateChartDocumentStructural({
            notes: chart.notes,
            trillZones: chart.trillZones,
            restZones: chart.restZones,
            events: chart.events,
          });
          return errors.map((e) => String(e));
        },
      );
      this.finishTransaction();
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
    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
    this.clearMoveOrigins();
    this._trillMoveZone = null;
    this.finishTransaction();
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
    if ([...this.sel.notes].some(index => ["point", "body", "release", "sustain"].includes(this.chart.notes[index].type))) return new Set();
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
    const reason = bodyDeletionBlockReason(this.chart.notes, this.effectiveNoteIndices());
    if (reason) { this.callbacks.onWarn?.(reason); return 0; }
    const count = this.copy();
    if (count > 0) {
      this.deleteSelected();
    }
    return count;
  }

  /** Paste clipboard at the given target beat. Returns count of pasted notes, 0 if clipboard empty. */
  paste(targetBeat: Beat): number {
    if (this.isPendingPaste) this.confirmPlacement();
    this.beginTransaction();
    const result = this.clipboardManager.paste(
      this.chart,
      targetBeat,
      this.clipboardCallbacks(),
      () => this.clearSelection(),
    );
    if (result === null) { this.finishTransaction(true); return 0; }

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
      this.clipboardCallbacks(),
      () => this.clearSelection(),
    );
    this.finishTransaction(true);
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
    const reason = bodyDeletionBlockReason(this.chart.notes, this.effectiveNoteIndices());
    if (reason) { this.callbacks.onWarn?.(reason); return; }
    // restZone은 공존 축 — 선택된 restZone은 노트·존 삭제와 한 커밋으로 함께 지운다 (RFD 0019).
    // 순서 주의: 차트 커밋(setChart가 축소를 감지해 남은 선택을 재매핑) → 해제.
    const selectedRest = this.sel.restZones;
    const withRestRemoved = (chart: ChartDocument): ChartDocument =>
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
      // 차트 축소와 선택 index 보정은 store에서 함께 적용한다.
      this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
      this.clearSelection();
      return;
    }

    if (this.sel.notes.size === 0) {
      // restZone-only 선택 삭제
      if (selectedRest.size === 0) return;
      this.chart = withRestRemoved(this.chart);
      this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
      this.clearSelection();
      return;
    }

    // sel.notes는 메인·보조 통합 인덱스 — deleteChartNotesAtIndices가 둘 다 삭제한다 (RFD 0018 ④).
    this.chart = withRestRemoved(deleteChartNotesAtIndices(this.chart, this.sel.notes));
    // 차트와 선택 index를 보정한 뒤 명령의 선택을 해제한다.
    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
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

    this.beginTransaction();
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
    this.originalSustainCountByNoteIndex.clear();
    for (const idx of indices) {
      const note = this.chart.notes[idx];
      if (!note) continue;
      if (note.type === "sustain") this.originalSustainCountByNoteIndex.set(idx, note.count);
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
    this.originalSustainCountByNoteIndex.clear();
    this.originalZonePositions.clear();
    this.originalRestZonePositions.clear();
  }

  /** 기록된 원본 좌표에 오프셋을 적용한 새 노트 배열을 만든다. lane은 통합 lane 공간이다. */
  private buildMovedNotes(laneOffset: number, beatOffset: Beat): DocumentNoteEntity[] {
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
        } as RangeNote | BodyNote;
      } else {
        newNotes[idx] = { ...newNotes[idx], lane: newLane, beat: newBeat };
      }
    }
    return reconcileMovedSustains(newNotes, this.originalPositions.keys(), this.originalSustainCountByNoteIndex);
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
    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
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
    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
    this.clearMoveOrigins();
  }

  private isRangeNote(note: DocumentNoteEntity): note is RangeNote | BodyNote {
    return "endBeat" in note;
  }

  /** Check if all notes in the array are within timeline bounds [0, maxBeat] */
  private areNotesInBounds(notes: DocumentNoteEntity[], indices: Set<number>): boolean {
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
    this.beginTransaction();
    this.resizeOriginalNotes = this.chart.notes;
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
      const newNotes = [...(this.resizeOriginalNotes ?? this.chart.notes)];
      const note = newNotes[this.resizingIndex];
      if (this.isRangeNote(note)) {
        newNotes[this.resizingIndex] = { ...note, endBeat: this.resizingOriginalEndBeat } as RangeNote | BodyNote;
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

    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
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
        } as RangeNote | BodyNote;
      } else {
        newNotes[idx] = {
          ...newNotes[idx],
          lane: original.lane,
          beat: original.beat,
        };
      }
    }
    for (const [index, count] of this.originalSustainCountByNoteIndex) {
      const note = newNotes[index];
      if (note.type === 'sustain') newNotes[index] = { ...note, count };
    }
    // 구간(트릴존·restZone) 단위 이동이었다면 그 구간들도 원위치로 되돌린다.
    const restoredZones = this.restoredZones();
    this.chart = {
      ...this.chart,
      notes: newNotes,
      trillZones: restoredZones,
      ...(this.originalRestZonePositions.size > 0 ? { restZones: this.restoredRestZones() } : {}),
    };
    this.callbacks.onChartUpdate(this.chart, this.transactionToken ?? undefined);
    this.clearMoveOrigins();
    this._trillMoveZone = null;
  }
}

/** `trillZone` resize가 기존에 유효한 trill note를 구간 밖으로 내보내는 경우만 막는다. */
function introducesTrillExclusivityViolation(before: ChartDocument, after: ChartDocument): boolean {
  const violatedNoteIndices = (chart: ChartDocument): Set<number> =>
    new Set(
      editorChartErrors(chart)
        .filter((error) => error.rule === "trillExclusive")
        .flatMap((error) => (error.refs ?? []).filter((ref) => ref.kind === "note").map((ref) => ref.index)),
    );

  const previousViolations = violatedNoteIndices(before);
  return [...violatedNoteIndices(after)].some((index) => !previousViolations.has(index));
}

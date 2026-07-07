import type { Chart, NoteEntity, RangeNote, Beat, Lane, ExtraNoteEntity } from "../../shared";
import { validateChart, beatToFloat } from "../../shared";
import { beatAdd, beatSub, beatLt, beatLte } from "../../shared";
import {
  deleteChartNotesAtIndices,
  deleteExtraNotesAtIndices,
  expandTrillPairIndices,
} from "../editing/editApplication";
import { ClipboardManager } from "./ClipboardManager";
import { resolveLongPressAction } from "./longPressRouting";
import { convertMainToExtra, convertExtraToMain, moveExtraByLane } from "./LaneConversion";
import {
  classifySelection,
  selectionBlockReason,
  clampTrillBeatOffset,
  translateTrillZone,
  isTrillNote,
  trillZoneOverlapsBox,
} from "./trillZoneSelection";
import type { TrillZone } from "../../shared";
import { zoneContainedNoteIndices, type Selection } from "../stores/selectionSlice";
import type { EditorMode, PointerGesture, EditResult, EditPreview, MoveOriginDatum } from "./editorMode";

export interface SelectModeCallbacks {
  onChartUpdate: (chart: Chart) => void;
  /** 선택의 소유자(SelectionSlice)에서 현재 선택을 읽는다. 사본 저장 금지. */
  getSelection: () => Selection;
  /** 선택 전체 값을 정규화 게이트를 지나 커밋한다. */
  setSelection: (sel: Selection) => void;
  yToBeat: (y: number) => Beat;
  /** Raw y-to-beat without snap grid (for box select) */
  yToBeatRaw: (y: number) => Beat;
  snapBeat: (beat: Beat) => Beat;
  /** Get the snap grid step as a Beat (= beat(4, snapDivision)) */
  getSnapStep: () => Beat;
  /** Get the maximum valid beat as float (end of last measure) */
  getMaxBeatFloat: () => number;
  xToLane: (x: number) => Lane | null;
  /** Get note index at given coordinates, or null */
  hitTestNote: (x: number, y: number) => number | null;
  /** Get selected RangeNote index whose end point is at (x,y), or null */
  hitTestNoteEnd?: (x: number, y: number) => number | null;
  /** Get event index whose end point is at (x,y), or null */
  hitTestEventEnd?: (x: number, y: number) => number | null;
  /** Get trill zone index whose end point is at (x,y), or null */
  hitTestTrillZoneEnd?: (x: number, y: number) => number | null;
  /** Get trill zone index whose selection handle is at (x,y), or null */
  hitTestTrillZoneHandle?: (x: number, y: number) => number | null;
  /** Get trill zone index whose region contains (x,y), or null (hover 표시용) */
  hitTestTrillZone?: (x: number, y: number) => number | null;
  /** Extra lane helpers */
  xToExtraLane?: (x: number) => number | null;
  hitTestExtraNote?: (x: number, y: number) => number | null;
  onExtraNotesUpdate?: (extraNotes: ExtraNoteEntity[]) => void;
  getExtraNotes?: () => ExtraNoteEntity[];
  getExtraLaneCount?: () => number;
  onViolationsChange?: (indices: Set<number>) => void;
  onWarn?: (msg: string) => void;
}

export class SelectMode implements EditorMode {
  private chart: Chart;
  private callbacks: SelectModeCallbacks;

  // Drag state
  private isDragging: boolean = false;
  private dragType: "move" | "moveExtra" | "boxSelect" | "resize" | null = null;
  private dragStartBeat: Beat | null = null;
  private dragStartLane: Lane | null = null;
  private dragStartExtraLane: number | null = null;
  private _boxEndBeat: Beat | null = null;
  private _boxEndLane: Lane | null = null;
  private _boxEndExtraLane: number | null = null;

  // Box select pixel state (for rendering)
  private _boxStartY: number = 0;
  private _boxStartLane: Lane | null = null;
  private _boxStartExtraLane: number | null = null;
  private _boxEndY: number = 0;

  // Move state
  private originalPositions: Map<
    number,
    { beat: Beat; endBeat?: Beat; lane: Lane }
  > = new Map();
  private originalExtraPositions: Map<
    number,
    { beat: Beat; endBeat?: Beat; extraLane: number }
  > = new Map();
  // 트릴 노트 단위 이동 시, 이동을 가두는 trillZone(이동 시작 시점 캡처). 트릴 선택이 아니면 null.
  private _trillMoveZone: TrillZone | null = null;
  // 구간 단위 이동 시작 시점의 트릴존 원본 좌표 (인덱스 → 원본)
  private originalZonePositions: Map<number, TrillZone> = new Map();

  // Resize state
  private resizingEntityType: "note" | "event" | "trillZone" | null = null;
  private resizingIndex: number | null = null;
  private resizingOriginalEndBeat: Beat | null = null;
  private resizingOriginalBeat: Beat | null = null;

  // Clipboard & paste state
  private clipboardManager: ClipboardManager = new ClipboardManager();

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
   */
  private commitSelection(partial: Partial<Selection>): void {
    this.callbacks.setSelection({ ...this.sel, ...partial });
  }

  /**
   * ClipboardManager·LaneConversion은 아직 emit 콜백 시그니처(onSelectionChange 등)를
   * 요구한다. 선택 쓰기는 호출 결과값으로 commitSelection 한 번으로 대신하므로
   * 여기서는 no-op을 채운다(이행용 — 헬퍼 시그니처는 후속 슬라이스에서 정리).
   */
  private helperCallbacks() {
    return {
      ...this.callbacks,
      onSelectionChange: () => {},
      onExtraSelectionChange: () => {},
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
   * 트릴존을 구간 유닛으로 선택한다. 기존 노트/엑스트라 선택은 해제된다.
   * 내부 트릴노트는 notes에 주입하지 않는다 — 이동·삭제·복사 동사가
   * 실행 시점에 zoneContainedNoteIndices로 파생한다 (RFD 0016 §4.2).
   */
  selectZoneUnit(zoneIndex: number): void {
    if (zoneIndex < 0 || zoneIndex >= this.chart.trillZones.length) return;
    this.commitSelection({ notes: new Set(), extraNotes: new Set(), zones: new Set([zoneIndex]) });
  }

  /** Whether a move drag is currently in progress */
  get isMoveDragging(): boolean {
    return this.isDragging && (this.dragType === "move" || this.dragType === "moveExtra");
  }

  /** Original positions of notes being moved (available during move drag) */
  get moveOrigins(): ReadonlyMap<number, { beat: Beat; endBeat?: Beat; lane: Lane }> {
    return this.originalPositions;
  }

  /**
   * 현재 드래그(끝점 리사이즈 / 구간 단위 이동) 중인 trillZone 인덱스. 없으면 null.
   * hover-only 핸들을 드래그 중에는 hover 여부와 무관하게 계속 표시하기 위한 래치.
   * 훅으로 노출하지 않고 computeHoveredTrillZone 내부에서만 쓴다(getter PULL 누출 제거).
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
   * 훅이 draggingTrillZoneIndex getter를 PULL하던 것을 이 PUSH 메서드로 대체한다.
   */
  computeHoveredTrillZone(x: number, y: number): number | null {
    const latched = this.draggingTrillZoneIndex;
    if (latched !== null) return latched;
    return this.callbacks.hitTestTrillZone?.(x, y) ?? null;
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
  get boxSelectPixelRect(): { startY: number; startLane: Lane | null; endY: number; endLane: Lane | null; startExtraLane?: number; endExtraLane?: number } | null {
    if (!this.isBoxSelecting) return null;
    // Allow box select when either main lane or extra lane is set
    if (!this._boxStartLane && this._boxStartExtraLane === null) return null;
    if (!this._boxEndLane && this._boxEndExtraLane === null) return null;
    return {
      startY: this._boxStartY,
      startLane: this._boxStartLane,
      endY: this._boxEndY,
      endLane: this._boxEndLane,
      startExtraLane: this._boxStartExtraLane ?? undefined,
      endExtraLane: this._boxEndExtraLane ?? undefined,
    };
  }

  /** Clear selection */
  clearSelection(): void {
    this.commitSelection({ notes: new Set(), extraNotes: new Set(), zones: new Set() });
  }

  /** Select a specific note */
  selectNote(index: number): void {
    if (index >= 0 && index < this.chart.notes.length) {
      this.commitSelection({ notes: this.withTrillPairs(new Set([index])), zones: new Set() });
    }
  }

  /**
   * 트릴 쌍(trill 헤드 ↔ trillLong 바디)은 한 단위로 선택한다 — 한쪽만 이동하면
   * 배치 제약(트릴 롱 헤드 필수)에 걸려 롤백되므로, 삭제(쌍소멸)와 대칭으로
   * 선택도 쌍을 동반한다. 쌍은 정의상 동질(같은 존의 트릴 계열)이라 동질성 가드와 충돌하지 않는다.
   * (선택의 소유자가 store라 in-place 확장 대신 확장된 새 집합을 반환한다.)
   */
  private withTrillPairs(indices: ReadonlySet<number>): Set<number> {
    const result = new Set(indices);
    for (const paired of expandTrillPairIndices(this.chart.notes, result)) {
      result.add(paired);
    }
    return result;
  }

  /** Select a specific extra note */
  selectExtraNote(index: number): void {
    const extraNotes = this.callbacks.getExtraNotes?.() ?? [];
    if (index >= 0 && index < extraNotes.length) {
      this.commitSelection({ notes: new Set(), extraNotes: new Set([index]), zones: new Set() });
    }
  }

  /** Begin a touch long-press move from a main note without collapsing an existing multi-selection. */
  beginTouchMoveDragFromNote(index: number, x: number, y: number): boolean {
    if (index < 0 || index >= this.chart.notes.length) return false;

    // 이미 선택된 노트면 혼합 선택(엑스트라·구간 포함)을 유지한 채 전체를 이동한다 (RFD 0016 §4.2)
    if (!this.sel.notes.has(index)) {
      this.selectNote(index);
    }

    this.startMainMoveDrag(x, y);
    return this.isMoveDragging;
  }

  /** Begin a touch long-press move from an extra note without collapsing an existing multi-selection. */
  beginTouchMoveDragFromExtraNote(index: number, x: number, y: number): boolean {
    const extraNotes = this.callbacks.getExtraNotes?.() ?? [];
    if (index < 0 || index >= extraNotes.length) return false;

    // 이미 선택된 엑스트라면 혼합 선택(메인 노트·구간 포함)을 유지한 채 전체를 이동한다 (RFD 0016 §4.2)
    if (!this.sel.extraNotes.has(index)) {
      this.selectExtraNote(index);
    }

    this.startExtraMoveDrag(x, y);
    return this.isMoveDragging;
  }

  /** Begin dragging the current selection from the given pointer location. */
  beginMoveDrag(x: number, y: number): void {
    // 앵커는 포인터가 놓인 레인 축으로 정한다 — 혼합 선택에서 잡은 쪽이 레인
    // 오프셋을 소유하고, 반대 축은 beat만 동반한다 (RFD 0016 §4.2).
    if (this.callbacks.xToLane(x) !== null) {
      this.startMainMoveDrag(x, y);
      return;
    }
    this.startExtraMoveDrag(x, y);
  }

  /** Begin resizing a main range note end, used by touch long-press handles. */
  beginNoteEndResizeDrag(index: number): boolean {
    const note = this.chart.notes[index];
    if (!note || !this.isRangeNote(note)) return false;

    this.commitSelection({ notes: new Set([index]), extraNotes: new Set(), zones: new Set() });
    this.startResize("note", index, note.beat, note.endBeat);
    return true;
  }

  /**
   * 터치 롱프레스 발화 시, down에서 계산된 히트로 드래그 종류를 정해 시작한다.
   * 노트 끝→리사이즈 / 노트→이동 / 엑스트라→이동. 히트가 없으면 아무것도 안 하고 false.
   * (라우팅을 호출자에서 모드로 흡수 — begin* 프리미티브는 그대로 두고 그 위에 얹는다.)
   */
  beginLongPressDrag(
    x: number,
    y: number,
    hits: {
      noteEndHit: number | null;
      noteHit: number | null;
      extraHit: number | null;
      zoneHit?: number | null;
    },
  ): boolean {
    const action = resolveLongPressAction(hits);
    if (action.kind === "resizeNoteEnd") return this.beginNoteEndResizeDrag(action.index);
    if (action.kind === "moveNote") return this.beginTouchMoveDragFromNote(action.index, x, y);
    if (action.kind === "moveExtra") return this.beginTouchMoveDragFromExtraNote(action.index, x, y);
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
      this.selectZoneUnit(index);
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

  /** Handle pointer down */
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
      const hitIdx = this.callbacks.hitTestNote(x, y);
      if (hitIdx === null) {
        this.confirmPlacement();
      }
      return;
    }

    // 드래그 진행 중엔 down 재호출을 무시한다(지연-시작 후보의 중복 시작 방지).
    // 훅의 empty-select 후보 재생 경로는 매 move마다 onPointerDown을 재호출하는데,
    // box뿐 아니라 resize/트릴존 핸들 이동도 그 좌표에서 시작될 수 있다. 종류 무관하게
    // 진행 중 드래그면 재진입을 막아, 매 move마다 resize/move origin이 리셋되는 걸 방지한다.
    if (this.isDragging) return;

    // Check for endpoint resize first

    // 1. RangeNote endpoints — 끝 캡을 잡으면 리사이즈.
    //    이미 선택된 노트는 물론, 그 위치에서 z-order상 최상위(= hitTestNote가 가리키는)
    //    롱노트라면 미리 선택돼 있지 않아도 단독 선택으로 전환하며 바로 리사이즈한다.
    //    끝점이 겹치는 o-o- 패턴에서 다른 노트가 위에 있으면 가로채지 않는다.
    if (this.callbacks.hitTestNoteEnd) {
      const endHit = this.callbacks.hitTestNoteEnd(x, y);
      if (endHit !== null && this.isRangeNote(this.chart.notes[endHit])) {
        const isSelected = this.sel.notes.has(endHit);
        const topmost = this.callbacks.hitTestNote(x, y);
        if (isSelected || topmost === endHit) {
          if (!isSelected) {
            this.commitSelection({ notes: new Set([endHit]), extraNotes: new Set(), zones: new Set() });
          }
          const note = this.chart.notes[endHit] as RangeNote;
          this.startResize("note", endHit, note.beat, note.endBeat);
          return;
        }
      }
    }

    // 2. Event endpoints
    if (this.callbacks.hitTestEventEnd) {
      const evtHit = this.callbacks.hitTestEventEnd(x, y);
      if (evtHit !== null) {
        const evt = this.chart.events[evtHit];
        if (!('endBeat' in evt)) return;
        this.startResize("event", evtHit, evt.beat, evt.endBeat);
        return;
      }
    }

    // 3. Trill zone selection handle (시작=아래의 가로 중앙 박스) → 구간 유닛 선택 + 핸들 드래그로 구간째 이동.
    //    이동(시작)과 리사이즈(끝)는 양 끝으로 분리된다. 길이 0 구간(시작==끝)은 이동 핸들 비활성(리사이즈만).
    //    Shift/토글 수식자면 교체 대신 zones에서 해당 구간을 토글한다(다중 구간, RFD 0016).
    if (this.callbacks.hitTestTrillZoneHandle) {
      const handleHit = this.callbacks.hitTestTrillZoneHandle(x, y);
      if (handleHit !== null) {
        if (shiftKey || toggleSelection) {
          const zones = new Set(this.sel.zones);
          if (zones.has(handleHit)) {
            zones.delete(handleHit);
          } else {
            zones.add(handleHit);
          }
          this.commitSelection({ zones });
          return;
        }
        this.selectZoneUnit(handleHit);
        this.beginMoveDrag(x, y);
        return;
      }
    }

    // 4. Trill zone endpoints (resize)
    if (this.callbacks.hitTestTrillZoneEnd) {
      const zoneHit = this.callbacks.hitTestTrillZoneEnd(x, y);
      if (zoneHit !== null) {
        const zone = this.chart.trillZones[zoneHit];
        this.startResize("trillZone", zoneHit, zone.beat, zone.endBeat);
        return;
      }
    }

    // Extra note hit test
    if (this.callbacks.hitTestExtraNote) {
      const extraHit = this.callbacks.hitTestExtraNote(x, y);
      if (extraHit !== null) {
        if (toggleSelection) {
          const extraSel = new Set(this.sel.extraNotes);
          if (extraSel.has(extraHit)) {
            extraSel.delete(extraHit);
          } else {
            extraSel.add(extraHit);
          }
          this.commitSelection({ extraNotes: extraSel });
        } else if (shiftKey) {
          const extraSel = new Set(this.sel.extraNotes);
          extraSel.add(extraHit);
          this.commitSelection({ extraNotes: extraSel });
        } else if (altKey) {
          const extraSel = new Set(this.sel.extraNotes);
          extraSel.delete(extraHit);
          this.commitSelection({ extraNotes: extraSel });
        } else if (this.sel.extraNotes.has(extraHit)) {
          // 이미 선택된 엑스트라 클릭은 혼합 선택(메인 노트·구간 포함)을 유지한 채 이동 시작 (RFD 0016 §4.2)
          this.beginMoveDrag(x, y);
        } else {
          this.commitSelection({ notes: new Set(), extraNotes: new Set([extraHit]), zones: new Set() });
        }
        return;
      }
    }

    const hitIndex = this.callbacks.hitTestNote(x, y);

    if (hitIndex !== null) {
      const isAlreadySelected = this.sel.notes.has(hitIndex);

      // 수식자(토글/Shift/Alt) 경로는 zones를 보존한다 — 일반 노트와 구간 유닛은
      // 공존하고, 트릴 노트가 들어오면 게이트가 zones를 자동으로 비운다 (RFD 0016 §4.1).
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
      } else if (isAlreadySelected && this.sel.notes.size > 0) {
        // Start move drag on selected note (zones가 있으면 혼합 선택째 이동)
        this.beginMoveDrag(x, y);
      } else {
        // 단순 클릭은 선택 전체 교체(zones 포함 해제). 트릴 쌍은 클릭 선택에서도 한 단위
        this.commitSelection({
          notes: this.withTrillPairs(new Set([hitIndex])),
          extraNotes: new Set(),
          zones: new Set(),
        });
        this.beginMoveDrag(x, y);
      }
    } else {
      // Clicking empty space
      if (!shiftKey && !altKey) {
        this.startBoxSelect(x, y);
      }
    }
  }

  /**
   * 노트/엑스트라 위에서 시작한 터치 드래그의 박스 승격 진입점 (RFD 0016 §4.4).
   * 빈 곳 박스와 동일하게 기존 선택을 비우고 시작한다. 진행 중 드래그가 있으면 무시.
   */
  beginBoxSelect(x: number, y: number): void {
    if (this.isDragging) return;
    this.startBoxSelect(x, y);
  }

  /** 기존 선택을 비우고 박스 셀렉트 드래그를 시작한다. */
  private startBoxSelect(x: number, y: number): void {
    this.clearSelection();
    this.isDragging = true;
    this.dragType = "boxSelect";
    this.dragStartBeat = this.callbacks.yToBeatRaw(y);
    this.dragStartLane = this.callbacks.xToLane(x);
    this.dragStartExtraLane = this.callbacks.xToExtraLane?.(x) ?? null;
    this._boxStartY = y;
    this._boxStartLane = this.callbacks.xToLane(x);
    this._boxStartExtraLane = this.callbacks.xToExtraLane?.(x) ?? null;
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
        const currentBeat = this.callbacks.snapBeat(this.callbacks.yToBeat(y));
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
        }

        // 프리뷰도 커밋(onPointerUp)과 동일한 제약을 지킨다. 위반 상태(예: 트릴존을
        // 트릴노트 밖으로 축소, 비트릴노트를 삼키도록 확장)면 적용하지 않아 직전 유효
        // 프리뷰를 유지한다 → 프리뷰가 커밋 가능 상태를 거짓말하지 않는다.
        if (tentativeChart !== null) {
          const errors = validateChart({
            notes: tentativeChart.notes,
            trillZones: tentativeChart.trillZones,
            events: tentativeChart.events,
          });
          if (errors.length === 0) {
            this.chart = tentativeChart;
            this.callbacks.onChartUpdate(this.chart);
          }
        }
      }
      return;
    }

    if (this.dragType === "move") {
      const currentBeat = this.callbacks.yToBeat(y);
      const currentLane = this.callbacks.xToLane(x);

      if (
        this.dragStartBeat &&
        this.dragStartLane &&
        currentLane !== null
      ) {
        // Calculate offset
        let beatOffset = beatSub(
          this.callbacks.snapBeat(currentBeat),
          this.callbacks.snapBeat(this.dragStartBeat),
        );
        let laneOffset = currentLane - this.dragStartLane;

        // 트릴 노트 단위 이동은 구간 안으로만: 레인 변경 금지 + 박자 오프셋 클램프
        if (this._trillMoveZone) {
          laneOffset = 0;
          beatOffset = clampTrillBeatOffset(this._trillMoveZone, this.movePositionList(), beatOffset);
        }

        // 이동 대상 = 드래그 시작 시점에 캡처한 원본들(직접 선택 + 구간 파생 노트, RFD 0016 §4.2)
        const moveTargets = new Set(this.originalPositions.keys());

        // Check if lane offset is valid for ALL moving notes
        for (const original of this.originalPositions.values()) {
          const targetLane = original.lane + laneOffset;
          if (targetLane < 1 || targetLane > 4) return; // Block entire move
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

        // 엑스트라는 beat만 동반 — 레인 오프셋은 앵커(메인) 축에만 적용 (RFD 0016 §4.2)
        let newExtraNotes: ExtraNoteEntity[] | null = null;
        if (this.originalExtraPositions.size > 0) {
          newExtraNotes = this.buildMovedExtraNotes(0, beatOffset);
          if (
            !newExtraNotes ||
            !this.areExtraNotesInBounds(newExtraNotes, new Set(this.originalExtraPositions.keys()))
          ) {
            return; // Block entire move
          }
        }

        // Update chart with new positions (preview)
        this.chart = { ...this.chart, notes: newNotes, trillZones: newZones };
        this.callbacks.onChartUpdate(this.chart);
        if (newExtraNotes) this.callbacks.onExtraNotesUpdate?.(newExtraNotes);
      }
    } else if (this.dragType === "moveExtra") {
      const currentBeat = this.callbacks.yToBeat(y);
      const currentExtraLane = this.callbacks.xToExtraLane?.(x) ?? null;

      if (
        this.dragStartBeat &&
        this.dragStartExtraLane !== null &&
        currentExtraLane !== null &&
        this.callbacks.getExtraNotes &&
        this.callbacks.onExtraNotesUpdate
      ) {
        let beatOffset = beatSub(
          this.callbacks.snapBeat(currentBeat),
          this.callbacks.snapBeat(this.dragStartBeat),
        );
        const laneOffset = currentExtraLane - this.dragStartExtraLane;
        const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;

        // 개별 트릴 노트가 동반 선택돼 있으면 beat 오프셋을 구간 안으로 클램프(메인 앵커와 동일 규칙)
        if (this._trillMoveZone) {
          beatOffset = clampTrillBeatOffset(this._trillMoveZone, this.movePositionList(), beatOffset);
        }

        for (const original of this.originalExtraPositions.values()) {
          const targetLane = original.extraLane + laneOffset;
          if (targetLane < 1 || targetLane > extraLaneCount) return;
        }

        const newExtraNotes = this.buildMovedExtraNotes(laneOffset, beatOffset);
        if (
          !newExtraNotes ||
          !this.areExtraNotesInBounds(newExtraNotes, new Set(this.originalExtraPositions.keys()))
        ) {
          return;
        }

        // 메인 notes(+구간 파생)·zones는 beat만 동반 — 레인 오프셋은 앵커(엑스트라) 축에만 (RFD 0016 §4.2)
        let chartTouched = false;
        let newNotes = this.chart.notes;
        if (this.originalPositions.size > 0) {
          newNotes = this.buildMovedNotes(0, beatOffset);
          if (!this.areNotesInBounds(newNotes, new Set(this.originalPositions.keys()))) return;
          chartTouched = true;
        }
        let newZones = this.chart.trillZones;
        if (this.originalZonePositions.size > 0) {
          newZones = this.buildMovedZones(0, beatOffset);
          if (!this.movedZonesInBounds(newZones)) return;
          chartTouched = true;
        }

        this.callbacks.onExtraNotesUpdate(newExtraNotes);
        if (chartTouched) {
          this.chart = { ...this.chart, notes: newNotes, trillZones: newZones };
          this.callbacks.onChartUpdate(this.chart);
        }
      }
    } else if (this.dragType === "boxSelect") {
      this._boxEndBeat = this.callbacks.yToBeatRaw(y);
      const lane = this.callbacks.xToLane(x);
      // Keep previous _boxEndLane when cursor is outside lane area
      if (lane !== null) {
        this._boxEndLane = lane;
      }
      const extraLane = this.callbacks.xToExtraLane?.(x) ?? null;
      if (extraLane !== null) {
        this._boxEndExtraLane = extraLane;
      }
      this._boxEndY = y;

      this.updateBoxSelection();
    }
  }

  /** Handle pointer up */
  onPointerUp(x: number, y: number): void {
    if (!this.isDragging) return;

    if (this.dragType === "resize") {
      // Validate and commit or rollback
      const errors = validateChart({
        notes: this.chart.notes,
        trillZones: this.chart.trillZones,
        events: this.chart.events,
      });
      if (errors.length > 0) {
        // Rollback: restore original endBeat
        this.rollbackResize();
      } else {
        // Commit
        this.callbacks.onChartUpdate(this.chart);
      }
      this.resizingEntityType = null;
      this.resizingIndex = null;
      this.resizingOriginalEndBeat = null;
      this.resizingOriginalBeat = null;
    } else if (this.dragType === "move") {
      // Validate and commit or rollback
      this.confirmPlacement();
    } else if (this.dragType === "moveExtra") {
      // 메인 동반(혼합)이 있으면 변이 게이트로 chart를 검증해 커밋/롤백.
      // 엑스트라 단독이면 라이브 적용이 곧 커밋 — 원본 기록만 폐기(기존 동작).
      if (this.originalPositions.size > 0 || this.originalZonePositions.size > 0) {
        this.commitMoveOrRollback();
      } else {
        this.originalExtraPositions.clear();
        this._trillMoveZone = null;
      }
    } else if (this.dragType === "boxSelect") {
      // Update end positions from final pointer position
      this._boxEndBeat = this.callbacks.yToBeatRaw(y);
      const endLane = this.callbacks.xToLane(x);
      if (endLane !== null) {
        this._boxEndLane = endLane;
      }
      const endExtraLane = this.callbacks.xToExtraLane?.(x) ?? null;
      if (endExtraLane !== null) {
        this._boxEndExtraLane = endExtraLane;
      }

      this.updateBoxSelection();
    }

    this._boxEndBeat = null;
    this._boxEndLane = null;
    this._boxEndExtraLane = null;
    this.isDragging = false;
    this.dragType = null;
    this.dragStartBeat = null;
    this.dragStartLane = null;
    this.dragStartExtraLane = null;
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
    } else if (this.dragType === "move" || this.dragType === "moveExtra") {
      // 혼합 이동은 chart(노트·구간)와 extraNotes가 함께 라이브 적용되므로 둘 다 복원한다 (RFD 0016 §4.2)
      this.rollbackMove();
      this.rollbackMoveExtra();
    }
    // boxSelect는 차트를 변이하지 않으므로 아래 공통 정리로 충분하다.

    this._boxEndBeat = null;
    this._boxEndLane = null;
    this._boxEndExtraLane = null;
    this.isDragging = false;
    this.dragType = null;
    this.dragStartBeat = null;
    this.dragStartLane = null;
    this.dragStartExtraLane = null;
    return { clearDragPreview: true };
  }

  /**
   * 엑스트라 노트를 드래그 시작 시점 좌표로 되돌린다 — cancel과
   * 혼합 이동의 변이 게이트 거부 롤백에서 chart 복원과 함께 호출된다 (RFD 0016 §4.2).
   */
  private rollbackMoveExtra(): void {
    if (this.originalExtraPositions.size === 0) return;
    const extraNotes = this.callbacks.getExtraNotes?.();
    if (!extraNotes || !this.callbacks.onExtraNotesUpdate) {
      this.originalExtraPositions.clear();
      return;
    }
    const newExtraNotes = [...extraNotes];
    for (const [idx, original] of this.originalExtraPositions) {
      const note = newExtraNotes[idx];
      if (!note) continue;
      if ("endBeat" in note) {
        newExtraNotes[idx] = {
          ...note,
          extraLane: original.extraLane,
          beat: original.beat,
          endBeat: original.endBeat!,
        };
      } else {
        newExtraNotes[idx] = {
          ...note,
          extraLane: original.extraLane,
          beat: original.beat,
        };
      }
    }
    this.callbacks.onExtraNotesUpdate(newExtraNotes);
    this.originalExtraPositions.clear();
  }

  // --- Box select helper ---

  /** Compute selection from current box select state (shared by onPointerMove & onPointerUp) */
  private updateBoxSelection(): void {
    if (!this.dragStartBeat || !this._boxEndBeat) return;

    const startMainLane = this.dragStartLane;
    const endMainLane = this._boxEndLane;
    const startExtraLane = this.dragStartExtraLane;
    const endExtraLane = this._boxEndExtraLane;

    const hasMainLane = startMainLane !== null || endMainLane !== null;
    const hasExtraLane = startExtraLane !== null || endExtraLane !== null;

    // Need at least one lane dimension
    if (!hasMainLane && !hasExtraLane) return;

    const startFirst = beatLt(this.dragStartBeat, this._boxEndBeat);
    const minBeat = startFirst ? this.dragStartBeat : this._boxEndBeat;
    const maxBeat = startFirst ? this._boxEndBeat : this.dragStartBeat;

    // Determine if box crosses from main to extra or vice versa
    // If start is in main and end is in extra (or vice versa), main range extends to lane 4
    // and extra range starts at lane 1
    const crossesIntoExtra = (startMainLane !== null && endExtraLane !== null) ||
                              (startExtraLane !== null && endMainLane !== null);

    // Select main lane notes + trill zone units
    const notes = new Set<number>();
    const zones = new Set<number>();
    if (hasMainLane) {
      // When crossing into extra, include up to lane 4 on the main side
      // 시작이 엑스트라 쪽이면 메인 커버리지는 경계 레인(4)까지다 — 1로 두면
      // 엑스트라→메인(오른쪽→왼쪽) 드래그가 [1..끝레인]으로 뒤집혀 반대쪽만 선택된다.
      const effectiveStartMain = startMainLane ?? (crossesIntoExtra ? 4 as Lane : null);
      const effectiveEndMain = endMainLane ?? (crossesIntoExtra ? 4 as Lane : null);

      if (effectiveStartMain !== null && effectiveEndMain !== null) {
        const minLane = Math.min(effectiveStartMain, effectiveEndMain);
        const maxLane = Math.max(effectiveStartMain, effectiveEndMain);

        // 일반 노트만 개별 픽업 — 트릴 노트는 구간 유닛으로 들어온다 (RFD 0016 §4.3)
        for (let i = 0; i < this.chart.notes.length; i++) {
          const note = this.chart.notes[i];
          if (!isTrillNote(note)
              && note.lane >= minLane && note.lane <= maxLane
              && beatSub(note.beat, minBeat).n >= 0
              && beatSub(maxBeat, note.beat).n >= 0) {
            notes.add(i);
          }
        }

        // 박스와 레인·박 폐구간이 겹치는(포함 아님) trillZone은 유닛으로 선택 (RFD 0016 §4.3)
        for (let i = 0; i < this.chart.trillZones.length; i++) {
          if (trillZoneOverlapsBox(this.chart.trillZones[i], minLane, maxLane, minBeat, maxBeat)) {
            zones.add(i);
          }
        }
      }
    }

    // Select extra lane notes
    const extraNotes = new Set<number>();
    if (hasExtraLane && this.callbacks.getExtraNotes) {
      // When crossing from main, extra range starts at lane 1
      const effectiveStartExtra = startExtraLane ?? (crossesIntoExtra ? 1 : null);
      const effectiveEndExtra = endExtraLane ?? (crossesIntoExtra ? 1 : null);

      if (effectiveStartExtra !== null && effectiveEndExtra !== null) {
        const minExtraLane = Math.min(effectiveStartExtra, effectiveEndExtra);
        const maxExtraLane = Math.max(effectiveStartExtra, effectiveEndExtra);
        const allExtra = this.callbacks.getExtraNotes();

        for (let i = 0; i < allExtra.length; i++) {
          const note = allExtra[i];
          if (note.extraLane >= minExtraLane && note.extraLane <= maxExtraLane
              && beatSub(note.beat, minBeat).n >= 0
              && beatSub(maxBeat, note.beat).n >= 0) {
            extraNotes.add(i);
          }
        }
      }
    }

    // 일반 노트·구간 유닛·엑스트라는 공존 선택 가능 (RFD 0016 §4.1).
    // 범위 보정 등 정규화는 store 게이트(normalizeSelection)가 수행한다.
    this.commitSelection({ notes, extraNotes, zones });
  }

  // --- Keyboard events ---

  /** Move selected notes by one snap unit */
  moveBySnap(direction: "up" | "down"): void {
    const hasMainSel = this.sel.notes.size > 0 || this.sel.zones.size > 0;
    // 엑스트라 단독 선택일 때만 엑스트라 전용 경로 — 혼합이면 아래 메인 경로가
    // beat 오프셋을 공유해 엑스트라를 동반한다 (기존 'extraNotes 우선' 분기 제거, RFD 0016 §4.2)
    if (!hasMainSel) {
      if (this.sel.extraNotes.size > 0) this.moveExtraBySnapImpl(direction);
      return;
    }

    // Get snap unit from current snap setting (assume 1/snap beat)
    const snapStep = this.callbacks.getSnapStep();
    // Timeline: bottom = time 0, up = later time.
    // ArrowUp = increase time (add snap), ArrowDown = decrease time (subtract snap).
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);

    // 구간 유닛이 선택돼 있으면 구간 + 내부 파생 노트 + 일반 노트 + 엑스트라를 같은 오프셋으로 이동 (RFD 0016 §4.2)
    if (this.sel.zones.size > 0) {
      this.captureNoteOrigins(this.effectiveNoteIndices());
      this.captureZoneOrigins();
      this.captureExtraNoteOrigins();
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

    // Store original positions (혼합이면 엑스트라 동반분도 캡처)
    this.captureNoteOrigins();
    this.captureExtraNoteOrigins();

    // Apply move
    const newNotes = this.buildMovedNotes(0, offset);

    // Block if any note goes out of timeline bounds
    if (!this.areNotesInBounds(newNotes, this.sel.notes)) {
      this.clearMoveOrigins();
      return;
    }

    // 엑스트라는 beat만 동반 — 한 요소라도 범위 밖이면 전체 no-op (기존 bounds 정책, RFD 0016 §4.2)
    let newExtraNotes: ExtraNoteEntity[] | null = null;
    if (this.originalExtraPositions.size > 0) {
      newExtraNotes = this.buildMovedExtraNotes(0, offset);
      if (
        !newExtraNotes ||
        !this.areExtraNotesInBounds(newExtraNotes, new Set(this.originalExtraPositions.keys()))
      ) {
        this.clearMoveOrigins();
        return;
      }
    }

    this.chart = { ...this.chart, notes: newNotes };

    // Validate
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length === 0) {
      // Commit — chart와 extraNotes를 함께 확정
      this.callbacks.onChartUpdate(this.chart);
      if (newExtraNotes) this.callbacks.onExtraNotesUpdate?.(newExtraNotes);
      this.clearMoveOrigins();
    } else {
      // Rollback (엑스트라는 아직 미적용이라 원본 기록만 폐기)
      this.rollbackMove();
      this.originalExtraPositions.clear();
    }
  }

  /** Move selected notes by one lane (event 레인을 건너뛰고 메인↔엑스트라 레인 간 이동 지원) */
  moveByLane(direction: "left" | "right"): void {
    const hasMainSel = this.sel.notes.size > 0 || this.sel.zones.size > 0;
    const hasExtra = this.sel.extraNotes.size > 0;

    // 혼합 선택: 메인은 메인 레인 축, 엑스트라는 엑스트라 레인 축으로 각자 평행이동.
    // 어느 쪽이든 막히면 전체 no-op + 토스트 (RFD 0016 §4.2)
    if (hasMainSel && hasExtra) {
      this.moveMixedByLane(direction);
      return;
    }

    // 엑스트라 노트만 선택된 경우
    if (hasExtra) {
      this.moveExtraByLaneImpl(direction);
      return;
    }

    // 메인 노트가 선택된 경우 (구간 유닛은 빈 구간도 가능)
    if (!hasMainSel) return;

    // 구간 유닛이 선택돼 있으면 구간 + 내부 파생 노트 + 일반 노트를 전체 평행이동
    // (혼합 레인 이동도 동일 — 막히면 applyZoneUnitMove가 no-op + 토스트, RFD 0016 §9)
    if (this.sel.zones.size > 0) {
      const laneOffset = direction === "left" ? -1 : 1;
      this.captureNoteOrigins(this.effectiveNoteIndices());
      this.captureZoneOrigins();
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

    // 메인 레인 4에서 오른쪽 이동 → 엑스트라 레인 1로 변환
    if (direction === "right") {
      const allAtLane4 = [...this.sel.notes].every(
        (idx) => this.chart.notes[idx].lane === 4,
      );
      if (allAtLane4) {
        if (extraLaneCount === 0) return; // 엑스트라 레인 없으면 차단
        this.convertMainToExtraImpl(1);
        return;
      }
    }

    // Check if all notes can move within main lanes
    const selNotes = this.sel.notes;
    for (const idx of selNotes) {
      const note = this.chart.notes[idx];
      const targetLane = note.lane + laneOffset;
      if (targetLane < 1 || targetLane > 4) return; // Block entire move
    }

    // Apply lane move
    const newNotes = [...this.chart.notes];
    for (const idx of selNotes) {
      const note = newNotes[idx];
      newNotes[idx] = { ...note, lane: (note.lane + laneOffset) as Lane };
    }

    this.chart = { ...this.chart, notes: newNotes };

    // Validate
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length === 0) {
      this.callbacks.onChartUpdate(this.chart);
    } else {
      // Rollback
      for (const idx of selNotes) {
        const note = newNotes[idx];
        newNotes[idx] = { ...note, lane: (note.lane - laneOffset) as Lane };
      }
      this.chart = { ...this.chart, notes: newNotes };
      this.callbacks.onChartUpdate(this.chart);
    }
  }

  /**
   * 혼합 선택(메인+엑스트라)의 레인 이동 — 메인 notes(+구간 파생)·zones는 메인 레인 축,
   * 엑스트라는 엑스트라 레인 축으로 같은 방향 평행이동한다. 메인↔엑스트라 변환은 하지
   * 않으며, 어느 쪽이든 레인 범위를 벗어나면 전체 no-op + 토스트 (RFD 0016 §4.2).
   */
  private moveMixedByLane(direction: "left" | "right"): void {
    // 개별 트릴 노트 선택은 구간(한 레인)을 벗어날 수 없으므로 레인 이동 차단 — 기존 규칙 유지
    if (this.sel.zones.size === 0 && this.trillZoneOfSelection()) {
      this.callbacks.onWarn?.("트릴 노트는 구간을 벗어날 수 없어 레인 이동이 불가합니다");
      return;
    }
    const laneOffset = direction === "left" ? -1 : 1;
    this.captureNoteOrigins(this.effectiveNoteIndices());
    this.captureZoneOrigins();
    this.captureExtraNoteOrigins();
    this.applyZoneUnitMove(laneOffset, { n: 0, d: 1 });
  }

  /** 엑스트라 노트의 스냅 이동 */
  private moveExtraBySnapImpl(direction: "up" | "down"): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;

    const extraNotes = this.callbacks.getExtraNotes();
    const snapStep = this.callbacks.getSnapStep();
    const offset = direction === "up" ? snapStep : beatSub({ n: 0, d: 1 }, snapStep);
    const maxFloat = this.callbacks.getMaxBeatFloat();
    const newExtraNotes = [...extraNotes];

    for (const idx of this.sel.extraNotes) {
      const note = newExtraNotes[idx];
      if (!note) continue;

      const newBeat = beatAdd(note.beat, offset);
      const newBeatFloat = beatToFloat(newBeat);
      if (newBeatFloat < 0 || newBeatFloat > maxFloat) return;

      if ("endBeat" in note) {
        const duration = beatSub(note.endBeat, note.beat);
        const newEndBeat = beatAdd(newBeat, duration);
        const newEndFloat = beatToFloat(newEndBeat);
        if (newEndFloat < 0 || newEndFloat > maxFloat) return;

        newExtraNotes[idx] = {
          ...note,
          beat: newBeat,
          endBeat: newEndBeat,
        };
      } else {
        newExtraNotes[idx] = {
          ...note,
          beat: newBeat,
        };
      }
    }

    this.callbacks.onExtraNotesUpdate(newExtraNotes);
  }

  /** 엑스트라 노트의 레인 이동 */
  private moveExtraByLaneImpl(direction: "left" | "right"): void {
    if (!this.callbacks.getExtraNotes || !this.callbacks.onExtraNotesUpdate) return;

    const extraNotes = this.callbacks.getExtraNotes();
    const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;

    // 엑스트라 레인 1에서 왼쪽 이동 → 메인 레인 4로 변환
    if (direction === "left") {
      const allAtExtraLane1 = [...this.sel.extraNotes].every(
        (idx) => extraNotes[idx].extraLane === 1,
      );
      if (allAtExtraLane1) {
        this.convertExtraToMainImpl(4 as Lane);
        return;
      }
    }

    moveExtraByLane(
      this.sel.extraNotes,
      direction,
      extraLaneCount,
      this.callbacks,
    );
  }

  /** 메인 노트 → 엑스트라 노트로 변환 */
  private convertMainToExtraImpl(targetExtraLane: number): void {
    const result = convertMainToExtra(
      this.chart,
      this.sel.notes,
      targetExtraLane,
      this.helperCallbacks(),
    );
    if (result) {
      this.chart = result.chart;
      // 차트·엑스트라 갱신 후 커밋 — 게이트가 새 배열 기준으로 범위를 보정한다
      this.commitSelection({ notes: result.selectedIndices, extraNotes: result.selectedExtraIndices });
    }
  }

  /** 엑스트라 노트 → 메인 노트로 변환 */
  private convertExtraToMainImpl(targetLane: Lane): void {
    const result = convertExtraToMain(
      this.chart,
      this.sel.extraNotes,
      targetLane,
      this.helperCallbacks(),
    );
    if (result) {
      this.chart = result.chart;
      // 차트·엑스트라 갱신 후 커밋 — 게이트가 새 배열 기준으로 범위를 보정한다
      this.commitSelection({ notes: result.selectedIndices, extraNotes: result.selectedExtraIndices });
    }
  }

  /** Resize selected long note end by one snap unit */
  resizeEndBySnap(direction: "up" | "down"): void {
    if (this.sel.notes.size === 0) return;

    // Get snap step
    const snapStep = this.callbacks.getSnapStep();
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

    // Validate
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length === 0) {
      // Commit
      this.callbacks.onChartUpdate(this.chart);
      this.originalPositions.clear();
    } else {
      // Rollback
      this.rollbackMove();
    }
  }

  /** Confirm placement (Enter key or empty click) */
  confirmPlacement(): void {
    if (this.clipboardManager.isPendingPaste) {
      // Paste mode: validate, reject if violations exist (don't rollback)
      this.clipboardManager.confirmPaste(
        this.chart,
        this.callbacks,
        (chart) => {
          const errors = validateChart({
            notes: chart.notes,
            trillZones: chart.trillZones,
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
      this.originalExtraPositions.size === 0
    ) {
      return;
    }

    // Move mode: validate, rollback if invalid
    this.commitMoveOrRollback();
  }

  /**
   * 이동 결과를 변이 게이트(validateChart)로 검증해 커밋하거나, 위반이면
   * chart(노트·구간)와 extraNotes를 함께 드래그 시작 시점으로 롤백한다 (RFD 0016 §4.2).
   * (엑스트라는 이동 중 라이브 적용돼 있으므로 커밋 시 추가 emit이 필요 없다.)
   */
  private commitMoveOrRollback(): void {
    const errors = validateChart({
      notes: this.chart.notes,
      trillZones: this.chart.trillZones,
      events: this.chart.events,
    });

    if (errors.length === 0) {
      // Valid: commit
      this.callbacks.onChartUpdate(this.chart);
      this.clearMoveOrigins();
      this._trillMoveZone = null;
    } else {
      // Invalid: rollback (chart와 엑스트라 둘 다)
      this.rollbackMove();
      this.rollbackMoveExtra();
    }
  }

  // ---------------------------------------------------------------------------
  // Clipboard: Copy / Cut / Paste
  // ---------------------------------------------------------------------------

  /** Copy selected notes to clipboard */
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

  copy(): number {
    // 구간 유닛의 내부 노트를 실행 시점에 파생해 함께 담는다 (RFD 0016 §4.2)
    return this.clipboardManager.copy(
      this.chart,
      this.effectiveNoteIndices(),
      this.sel.extraNotes,
      this.callbacks,
      this.trillZonesToCopy(),
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
      this.helperCallbacks(),
      () => this.clearSelection(),
    );
    if (result === null) return 0;

    this.chart = result.chart;
    // 차트 갱신(onChartUpdate) 후 커밋 — 붙여넣은 인덱스가 게이트 범위 보정에서 살아남는다
    this.commitSelection({ notes: result.selectedIndices, extraNotes: result.selectedExtraIndices });
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
      this.helperCallbacks(),
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
      this.callbacks,
      (chart) => this.clipboardManager.updatePasteViolations(chart, this.callbacks),
    );
    if (newChart !== null) {
      this.chart = newChart;
    }
  }

  /** Delete selected notes */
  deleteSelected(): void {
    // Delete extra notes if selected (구간 유닛·일반 노트와 공존 가능, RFD 0016)
    if (this.sel.extraNotes.size > 0 && this.callbacks.getExtraNotes && this.callbacks.onExtraNotesUpdate) {
      const extraNotes = this.callbacks.getExtraNotes();
      const newExtraNotes = deleteExtraNotesAtIndices(extraNotes, this.sel.extraNotes);
      this.callbacks.onExtraNotesUpdate(newExtraNotes);
      this.commitSelection({ extraNotes: new Set() });
    }

    // 구간 유닛 선택: 구간 + 실행 시점 파생한 내부 노트 + 직접 선택한 일반 노트를
    // 함께 삭제 (빈 구간도 삭제, RFD 0016 §4.2)
    if (this.sel.zones.size > 0) {
      const zones = this.sel.zones;
      const noteIndices = this.effectiveNoteIndices();
      const notes = this.chart.notes.filter((_n, i) => !noteIndices.has(i));
      const trillZones = this.chart.trillZones.filter((_z, i) => !zones.has(i));
      this.chart = { ...this.chart, notes, trillZones };
      this.clearSelection();
      this.callbacks.onChartUpdate(this.chart);
      return;
    }

    if (this.sel.notes.size === 0) return;

    this.chart = deleteChartNotesAtIndices(this.chart, this.sel.notes);
    this.clearSelection();
    this.callbacks.onChartUpdate(this.chart);
  }

  // --- Private helpers ---

  private startMainMoveDrag(x: number, y: number): void {
    const lane = this.callbacks.xToLane(x);
    // 구간 유닛(빈 구간 포함)이 선택돼 있으면 노트가 없어도 이동 가능
    if (lane === null || (this.sel.notes.size === 0 && this.sel.zones.size === 0)) return;

    this.isDragging = true;
    this.dragType = "move";
    this.dragStartBeat = this.callbacks.yToBeat(y);
    this.dragStartLane = lane;
    this.dragStartExtraLane = null;

    // 직접 선택한 notes + 구간 파생 노트를 함께 캡처 — 혼합 선택도 한 오프셋으로 움직인다 (RFD 0016 §4.2)
    this.captureNoteOrigins(this.effectiveNoteIndices());
    // 엑스트라도 원본 캡처 — 혼합 선택이면 beat만 동반 이동한다 (RFD 0016 §4.2)
    this.captureExtraNoteOrigins();
    // 구간 유닛이 있으면 이동할 트릴존 원본을 캡처(자유 이동), 노트 단위면 가둘 구간을 캡처(제약 이동).
    if (this.sel.zones.size > 0) {
      this._trillMoveZone = null;
      this.captureZoneOrigins();
    } else {
      this._trillMoveZone = this.trillZoneOfSelection();
      this.originalZonePositions.clear();
    }
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
    const maxFloat = this.callbacks.getMaxBeatFloat();
    for (const idx of this.originalZonePositions.keys()) {
      const zone = zones[idx];
      if (!zone) continue;
      if (zone.lane < 1 || zone.lane > 4) return false;
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

  /** 선택된 엑스트라 노트들의 원본 좌표를 기록한다(이동용). */
  private captureExtraNoteOrigins(): void {
    this.originalExtraPositions.clear();
    const extraNotes = this.callbacks.getExtraNotes?.() ?? [];
    for (const idx of this.sel.extraNotes) {
      const note = extraNotes[idx];
      if (!note) continue;
      if ("endBeat" in note) {
        this.originalExtraPositions.set(idx, {
          beat: note.beat,
          endBeat: note.endBeat,
          extraLane: note.extraLane,
        });
      } else {
        this.originalExtraPositions.set(idx, { beat: note.beat, extraLane: note.extraLane });
      }
    }
  }

  /** 이동 원본 기록(메인·구간·엑스트라)을 모두 폐기한다. */
  private clearMoveOrigins(): void {
    this.originalPositions.clear();
    this.originalZonePositions.clear();
    this.originalExtraPositions.clear();
  }

  /** 기록된 원본 좌표에 오프셋을 적용한 새 메인 노트 배열을 만든다. */
  private buildMovedNotes(laneOffset: number, beatOffset: Beat): NoteEntity[] {
    const newNotes = [...this.chart.notes];
    for (const [idx, original] of this.originalPositions) {
      const newLane = (original.lane + laneOffset) as Lane;
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
   * 기록된 원본 좌표에 오프셋을 적용한 새 엑스트라 노트 배열을 만든다.
   * laneOffset은 엑스트라 자신의 축(extraLane)에 적용된다 (RFD 0016 §4.2).
   */
  private buildMovedExtraNotes(laneOffset: number, beatOffset: Beat): ExtraNoteEntity[] | null {
    const extraNotes = this.callbacks.getExtraNotes?.();
    if (!extraNotes) return null;
    const newExtraNotes = [...extraNotes];
    for (const [idx, original] of this.originalExtraPositions) {
      const note = newExtraNotes[idx];
      if (!note) continue;
      const newExtraLane = original.extraLane + laneOffset;
      const newBeat = beatAdd(original.beat, beatOffset);
      if ("endBeat" in note) {
        const duration = beatSub(original.endBeat!, original.beat);
        newExtraNotes[idx] = {
          ...note,
          extraLane: newExtraLane,
          beat: newBeat,
          endBeat: beatAdd(newBeat, duration),
        };
      } else {
        newExtraNotes[idx] = { ...note, extraLane: newExtraLane, beat: newBeat };
      }
    }
    return newExtraNotes;
  }

  /**
   * 키보드 등 단발 평행이동을 적용한다 — 구간·파생 노트·일반 노트·엑스트라 동반분 전체.
   * originalPositions/originalZonePositions/originalExtraPositions가 미리 캡처되어 있어야 한다.
   * laneOffset은 메인 노트·구간에는 메인 레인 축, 엑스트라에는 extraLane 축으로 각자 적용된다.
   * 레인/범위/구간겹침 검증을 통과하면 커밋, 아니면 토스트 후 무변경(no-op, RFD 0016 §4.2).
   */
  private applyZoneUnitMove(laneOffset: number, beatOffset: Beat): void {
    const newNotes = this.buildMovedNotes(laneOffset, beatOffset);
    const newZones = this.buildMovedZones(laneOffset, beatOffset);

    // 노트 레인(1~4)·범위, 구간 레인·범위 검증 — 이동 대상은 캡처된 원본(파생 노트 포함)
    const moveTargets = new Set(this.originalPositions.keys());
    let laneOk = true;
    for (const idx of moveTargets) {
      const l = newNotes[idx].lane;
      if (l < 1 || l > 4) { laneOk = false; break; }
    }

    // 엑스트라 동반분 — 레인은 엑스트라 자신의 축(1~extraLaneCount), beat는 공유 (RFD 0016 §4.2)
    let extraOk = true;
    let newExtraNotes: ExtraNoteEntity[] | null = null;
    if (this.originalExtraPositions.size > 0) {
      const extraLaneCount = this.callbacks.getExtraLaneCount?.() ?? 0;
      for (const original of this.originalExtraPositions.values()) {
        const targetLane = original.extraLane + laneOffset;
        if (targetLane < 1 || targetLane > extraLaneCount) { extraOk = false; break; }
      }
      if (extraOk) {
        newExtraNotes = this.buildMovedExtraNotes(laneOffset, beatOffset);
        extraOk = newExtraNotes !== null
          && this.areExtraNotesInBounds(newExtraNotes, new Set(this.originalExtraPositions.keys()));
      }
    }

    if (!laneOk || !extraOk
      || !this.areNotesInBounds(newNotes, moveTargets)
      || !this.movedZonesInBounds(newZones)) {
      this.callbacks.onWarn?.("더 이상 이동할 수 없습니다");
      this.clearMoveOrigins();
      return;
    }

    const candidate = { ...this.chart, notes: newNotes, trillZones: newZones };
    const errors = validateChart({
      notes: candidate.notes,
      trillZones: candidate.trillZones,
      events: candidate.events,
    });
    if (errors.length === 0) {
      this.chart = candidate;
      this.callbacks.onChartUpdate(this.chart);
      if (newExtraNotes) this.callbacks.onExtraNotesUpdate?.(newExtraNotes);
    } else {
      this.callbacks.onWarn?.("다른 트릴 구간과 겹쳐 이동할 수 없습니다");
    }
    this.clearMoveOrigins();
  }

  private startExtraMoveDrag(x: number, y: number): void {
    const extraLane = this.callbacks.xToExtraLane?.(x) ?? null;
    if (
      extraLane === null ||
      this.sel.extraNotes.size === 0 ||
      !this.callbacks.getExtraNotes
    ) {
      return;
    }

    this.isDragging = true;
    this.dragType = "moveExtra";
    this.dragStartBeat = this.callbacks.yToBeat(y);
    this.dragStartLane = null;
    this.dragStartExtraLane = extraLane;

    this.captureExtraNoteOrigins();
    // 혼합 선택이면 메인 notes(+구간 파생)·zones도 beat 동반 이동 대상으로 캡처 (RFD 0016 §4.2)
    this.captureNoteOrigins(this.effectiveNoteIndices());
    if (this.sel.zones.size > 0) {
      this._trillMoveZone = null;
      this.captureZoneOrigins();
    } else {
      this._trillMoveZone = this.trillZoneOfSelection();
      this.originalZonePositions.clear();
    }
  }

  private isRangeNote(note: NoteEntity): note is RangeNote {
    return "endBeat" in note;
  }

  /** Check if all notes in the array are within timeline bounds [0, maxBeat] */
  private areNotesInBounds(notes: NoteEntity[], indices: Set<number>): boolean {
    const maxFloat = this.callbacks.getMaxBeatFloat();

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

  private areExtraNotesInBounds(notes: ExtraNoteEntity[], indices: Set<number>): boolean {
    const maxFloat = this.callbacks.getMaxBeatFloat();

    for (const idx of indices) {
      const note = notes[idx];
      if (!note) continue;
      const beatFloat = beatToFloat(note.beat);
      if (beatFloat < 0 || beatFloat > maxFloat) return false;
      if ("endBeat" in note) {
        const endFloat = beatToFloat(note.endBeat);
        if (endFloat < 0 || endFloat > maxFloat) return false;
      }
    }
    return true;
  }

  private startResize(
    entityType: "note" | "event" | "trillZone",
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
    }

    this.callbacks.onChartUpdate(this.chart);
  }

  private rollbackMove(): void {
    // 메인 쪽 원본이 없으면(엑스트라 단독 이동 등) 차트를 건드리지 않는다 — 불필요한 emit 방지
    if (this.originalPositions.size === 0 && this.originalZonePositions.size === 0) {
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
    // 구간 단위 이동이었다면 트릴존도 원위치로 되돌린다.
    const restoredZones = this.restoredZones();
    this.chart = { ...this.chart, notes: newNotes, trillZones: restoredZones };
    this.callbacks.onChartUpdate(this.chart);
    this.originalPositions.clear();
    this.originalZonePositions.clear();
    this._trillMoveZone = null;
  }
}

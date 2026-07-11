/**
 * 선택 슬라이스 — 에디터 선택 상태의 단독 소유자.
 *
 * 소유권 헌장: 선택(notes·extraNotes·zones)의 쓰기는 이 슬라이스의 액션으로만 한다.
 * SelectMode·훅·컴포넌트에 선택 사본을 저장하지 말 것 — 사본이 남으면 소유자가
 * 다시 둘이 된다(이전에는 SelectMode private 필드가 진짜 권위였고 store는 파생
 * 캐시라, undo 후 stale 선택이 "보이지 않는 이동"을 일으킬 수 있었다).
 *
 * 게이트 의미론: 차트 변이 게이트(setChart)가 위반을 **거부**하는 것과 달리,
 * 이 게이트는 **정규화**한다 — 섞인 입력이 와도 가장 가까운 합법 값으로 접는다.
 * 선택은 휘발성 UI 상태이고, 박스 드래그 중 매 프레임 호출되는 경로에서
 * "거부"는 복구 동작이 없기 때문이다(기존 updateBoxSelection의 조용한 정리 정책 승계).
 *
 * 합법 상태(불변, RFD 0016):
 * - notes는 동질적이다 — 일반 노트들, 또는 같은 trillZone의 트릴 노트들만.
 * - zones는 선택의 독립 축이다 — 일반 notes·extraNotes와 **공존**하고,
 *   내부 노트를 notes에 주입하지 않는다(동사가 실행 시점에 파생, §4.2).
 * - notes가 트릴 노트 모드(개별 트릴 선택)이면 zones는 빈 집합이다 —
 *   개별 트릴 선택만 구간 유닛과 배타로 남는다.
 * - 모든 인덱스는 해당 배열 범위 안이다(차트 변이에 따른 보정은 변이 액션이 한다).
 */
import type { Chart, ExtraNoteEntity, NoteEntity, TrillZone, ValidationRef } from '../../shared';
import { beatToFloat, validateChart, violationsInvolving } from '../../shared';
import { showToast } from '../../shared/toast';
import { classifySelection, filterHomogeneousSelection } from '../modes/trillZoneSelection';

/** 에디터 선택 상태. 세 집합의 관계 불변은 normalizeSelection이 보장한다. */
export interface Selection {
  notes: Set<number>;
  extraNotes: Set<number>;
  zones: Set<number>;
}

export function emptySelection(): Selection {
  return { notes: new Set(), extraNotes: new Set(), zones: new Set() };
}

/**
 * 구간에 완전히 포함된(시작·끝 모두 구간 안) **트릴 타입** 노트 인덱스.
 * 이동·삭제·복사 동사가 실행 시점에 구간 유닛의 내부 노트를 파생할 때 쓴다 (RFD 0016 §4.2).
 *
 * 트릴 타입(trill·trillLong)만 파생한다 — 낙관적 편집(RFD 0017)에서 일반 노트가
 * 위반 상태로 존 범위 안에 transient 상주할 수 있는데, 그 노트는 유닛의 구성원이
 * 아니므로 유닛 이동·삭제·복사에 끌려가면 안 된다.
 */
export function zoneContainedNoteIndices(
  notes: readonly NoteEntity[],
  zone: TrillZone,
): Set<number> {
  const result = new Set<number>();
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (n.type !== 'trill' && n.type !== 'trillLong') continue;
    const endBeat = 'endBeat' in n ? n.endBeat : n.beat;
    if (
      n.lane === zone.lane &&
      beatToFloat(n.beat) >= beatToFloat(zone.beat) &&
      beatToFloat(endBeat) <= beatToFloat(zone.endBeat)
    ) {
      result.add(i);
    }
  }
  return result;
}

function setEquals(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** 세 집합이 모두 같은 원소인지. 변이 액션이 "변경 시에만" 선택을 갱신할 때 쓴다. */
export function selectionEquals(a: Selection, b: Selection): boolean {
  return (
    setEquals(a.notes, b.notes) &&
    setEquals(a.extraNotes, b.extraNotes) &&
    setEquals(a.zones, b.zones)
  );
}

function pruneBounds(indices: ReadonlySet<number>, length: number): Set<number> {
  const result = new Set<number>();
  for (const i of indices) {
    if (i >= 0 && i < length) result.add(i);
  }
  return result;
}

/**
 * 정규화 게이트 — 임의의 선택 입력을 합법 선택으로 접는다.
 * 모든 쓰기 액션이 이 함수를 지나므로, 새 쓰기 경로도 자동으로 불변을 얻는다.
 */
export function normalizeSelection(
  input: Selection,
  chart: Pick<Chart, 'notes' | 'trillZones'>,
  extraNotes: readonly ExtraNoteEntity[],
): Selection {
  const zones = pruneBounds(input.zones, chart.trillZones.length);

  // notes: 범위 보정 + 동질성 정규화 (조용히 한 그룹만 남긴다)
  const { kept } = filterHomogeneousSelection(
    chart.trillZones,
    chart.notes,
    pruneBounds(input.notes, chart.notes.length),
  );

  // 개별 트릴 노트 모드는 구간 유닛과 배타 — zones를 비운다 (RFD 0016 §4.1).
  // 일반/빈 모드면 zones는 일반 노트·extraNotes와 공존한다(내부 노트 주입 없음).
  const kind = classifySelection(chart.trillZones, chart.notes, kept);
  return {
    notes: kept,
    extraNotes: pruneBounds(input.extraNotes, extraNotes.length),
    zones: kind.kind === 'trill' ? new Set<number>() : zones,
  };
}

export interface SelectionSlice {
  selection: Selection;
  /** 전체 선택 값을 쓴다. 정규화 게이트를 지나므로 어떤 입력도 합법 상태로 착지한다. */
  setSelection: (input: Selection) => void;
  clearSelection: () => void;
  /** 보조 레인 선택만 비운다(노트·구간 선택 유지). 엑스트라 삭제·레인 수 축소 경로용. */
  clearExtraSelection: () => void;
}

/** 게이트가 읽는 외부 사실 — 선택 인덱스가 가리키는 배열들. */
interface SelectionHost {
  chart: Chart;
  extraNotes: ExtraNoteEntity[];
}

type SliceSet = (
  partial: Partial<SelectionSlice> | ((state: SelectionSlice) => Partial<SelectionSlice>),
) => void;

// §3-5 게이트 토스트 억제 — 박스 드래그처럼 매 pointer-move마다 전이가 시도되는 경로에서
// 같은 사유의 토스트가 연발되지 않게 한다(전이 거부 자체는 매번 수행).
let lastGateToastAt = 0;

function gateToast(message: string): void {
  const now = Date.now();
  if (now - lastGateToastAt < 1000) return;
  lastGateToastAt = now;
  showToast(message, 'warn');
}

export function createSelectionSlice(
  set: SliceSet,
  get: () => SelectionSlice & SelectionHost,
): SelectionSlice {
  return {
    selection: emptySelection(),

    setSelection: (input) => {
      const { chart, extraNotes, selection } = get();
      const normalized = normalizeSelection(input, chart, extraNotes);

      // 선택 해제 게이트(RFD 0017 §3-5): 이 전이에서 빠지는(removed = 현재 − 다음)
      // 노트·구간이 의미 위반에 관여한 채 남으면 전이를 거부한다 — 선택 유지 + 토스트.
      // 위반 노트를 선택에서 놓는 순간 = 편집 묶음 마무리 신호이므로 그 이탈만 봉쇄한다
      // (place-then-fix 유지: 재드래그로 해소하거나 undo로 되돌리면 통과).
      // 차트를 함께 바꾸는 경로(undo/redo·삭제·붙여넣기 취소)는 원자 set()으로 선택을
      // 쓰므로 여기를 지나지 않는다 — 탈출구는 특례가 아니라 발화 경계의 귀결이다.
      const removed: ValidationRef[] = [];
      for (const i of selection.notes) {
        if (!normalized.notes.has(i)) removed.push({ kind: 'note', index: i });
      }
      for (const i of selection.zones) {
        if (!normalized.zones.has(i)) removed.push({ kind: 'trillZone', index: i });
      }
      // removed.extraNotes는 게이트 대상이 아니다 — 엑스트라 위반은 시각화 전용(게이트 불포함).
      if (removed.length > 0) {
        const involved = violationsInvolving(
          validateChart({
            notes: chart.notes,
            trillZones: chart.trillZones,
            events: chart.events,
          }),
          removed,
        );
        if (involved.length > 0) {
          // [ZONEDRAG-DBG] 임시 진단 (병합 전 제거) — 토스트는 1초 스로틀이라 콘솔에도 남긴다
          console.warn(
            `[ZONEDRAG-DBG] §3-5 게이트 거부: removed=${removed.map((r) => `${r.kind}:${r.index}`).join(",")}` +
            ` 사유=${involved[0].message}`,
          );
          gateToast(`위반이 남아 있어 선택을 해제할 수 없습니다: ${involved[0].message}`);
          return;
        }
      }

      set({ selection: normalized });
    },
    clearSelection: () => {
      // 전체 비우기도 하나의 해제 전이 — 같은 게이트를 지난다(§3-5 단일 규칙).
      get().setSelection(emptySelection());
    },
    clearExtraSelection: () =>
      set((state) => ({
        selection: { ...state.selection, extraNotes: new Set<number>() },
      })),
  };
}

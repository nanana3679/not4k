import type { ChartDocument, Lane, DocumentNoteEntity, RangeNote } from "../../shared";
import { beatEq } from "../../shared";
import { bodyDeletionBlockReason } from './explicitEditing';

function beatFloatOf(beat: { n: number; d: number }): number {
  return beat.n / beat.d;
}

function isRangeNote(note: DocumentNoteEntity): note is RangeNote {
  return (
    note.type === "long" ||
    note.type === "doubleLong" ||
    note.type === "trillLong"
  );
}

function isMatchingRangeZone(
  zone: { lane: Lane; beat: { n: number; d: number }; endBeat: { n: number; d: number } },
  note: RangeNote,
): boolean {
  return (
    zone.lane === note.lane &&
    beatEq(zone.beat, note.beat) &&
    beatEq(zone.endBeat, note.endBeat)
  );
}

export function deleteChartNoteAtIndex(chart: ChartDocument, index: number): ChartDocument | null {
  if (index < 0 || index >= chart.notes.length) return null;
  return deleteChartNotesAtIndices(chart, new Set([index]));
}

/**
 * 트릴 쌍 확장(쌍소멸) — 트릴 롱은 헤드(trill)가 필수라(validateTrillLong, RFD 0009)
 * 헤드만 지우면 모델이 성립하지 않는다. 쌍의 어느 쪽을 지목하든 함께 지운다:
 * trill 헤드 ↔ 같은 레인·같은 박에서 시작하는 trillLong 바디.
 * (바디만 지우고 헤드를 남기는 것은 합법—단독 트릴 노트—이지만, 쌍은 생성도
 * 한 단위이므로 삭제도 한 단위로 대칭시킨다.)
 */
export function expandTrillPairIndices(
  notes: readonly DocumentNoteEntity[],
  indices: ReadonlySet<number>,
): Set<number> {
  const expanded = new Set(indices);
  for (const index of indices) {
    const note = notes[index];
    if (!note) continue;
    const pairType =
      note.type === "trillLong" ? "trill" : note.type === "trill" ? "trillLong" : null;
    if (pairType === null) continue;
    for (let i = 0; i < notes.length; i++) {
      if (expanded.has(i)) continue;
      const other = notes[i];
      if (other.type === pairType && other.lane === note.lane && beatEq(other.beat, note.beat)) {
        expanded.add(i);
      }
    }
  }
  return expanded;
}

export function deleteChartNotesAtIndices(chart: ChartDocument, indices: ReadonlySet<number>): ChartDocument {
  if (indices.size === 0) return chart;

  const expandedIndices = expandTrillPairIndices(chart.notes, indices);
  if (bodyDeletionBlockReason(chart.notes, expandedIndices)) return chart;

  const selectedNotes = Array.from(expandedIndices)
    .map((index) => chart.notes[index])
    .filter((note): note is DocumentNoteEntity => Boolean(note));

  const notes = chart.notes.filter((_note, index) => !expandedIndices.has(index));
  const trillZones = chart.trillZones.filter((zone) => (
    !selectedNotes.some((note) => isRangeNote(note) && isMatchingRangeZone(zone, note))
  ));

  return {
    ...chart,
    notes,
    trillZones,
  };
}

export function deleteEmptyTrillZoneAtIndex(
  chart: ChartDocument,
  index: number,
): { chart: ChartDocument | null; blockedReason?: string } {
  const zone = chart.trillZones[index];
  if (!zone) return { chart: null };

  const hasNotes = chart.notes.some((note) => (
    note.lane === zone.lane &&
    beatFloatOf(note.beat) >= beatFloatOf(zone.beat) &&
    beatFloatOf(note.beat) <= beatFloatOf(zone.endBeat)
  ));

  if (hasNotes) {
    return {
      chart: null,
      blockedReason: "Zone contains notes — remove them first",
    };
  }

  return {
    chart: {
      ...chart,
      trillZones: chart.trillZones.filter((_zone, zoneIndex) => zoneIndex !== index),
    },
  };
}

/**
 * restZone 삭제 (RFD 0019) — deleteEmptyTrillZoneAtIndex의 미러.
 * restZone은 내부 노트 개념이 없으므로(시각 안내 + 배치 제약 전용) empty 가드 없이
 * 해당 인덱스만 filter-out한 새 chart를 반환한다. 인덱스가 무효면 null.
 */
export function deleteRestZoneAtIndex(chart: ChartDocument, index: number): ChartDocument | null {
  const restZones = chart.restZones ?? [];
  if (!restZones[index]) return null;

  return {
    ...chart,
    restZones: restZones.filter((_zone, zoneIndex) => zoneIndex !== index),
  };
}

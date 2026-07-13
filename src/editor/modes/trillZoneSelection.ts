/**
 * 트릴존 선택 연동 — 노트 선택 시 함께 선택/이동되는 트릴존을 결정한다.
 *
 * 트릴존 자체는 별도 선택 상태를 갖지 않고, "선택된 노트와 같은 레인에서 구간이
 * 겹치는" 트릴존을 파생적으로 선택된 것으로 본다. 한 트릴존 안의 노트가 하나라도
 * 선택되면 그 트릴존도 선택된 것으로 취급한다.
 */

import type { Beat, NoteEntity, TrillZone } from "../../shared";
import { beatAdd, beatSub, beatToFloat } from "../../shared";

/** 노트가 트릴존과 같은 레인에서 구간이 겹치는지 판정한다. */
export function trillZoneOverlapsNote(zone: TrillZone, note: NoteEntity): boolean {
  if (zone.lane !== note.lane) return false;

  const zoneStart = beatToFloat(zone.beat);
  const zoneEnd = beatToFloat(zone.endBeat);
  const noteStart = beatToFloat(note.beat);
  const noteEnd = "endBeat" in note ? beatToFloat(note.endBeat) : noteStart;

  // 구간 겹침: noteStart <= zoneEnd && noteEnd >= zoneStart
  return noteStart <= zoneEnd && noteEnd >= zoneStart;
}

/**
 * 트릴존이 박스 선택 범위(레인 범위 + 박 폐구간)와 겹치는지 판정한다.
 * 겹침 의미론은 trillZoneOverlapsNote와 동일한 폐구간 겹침(포함 아님) — RFD 0016 §4.3.
 */
export function trillZoneOverlapsBox(
  zone: TrillZone,
  minLane: number,
  maxLane: number,
  minBeat: Beat,
  maxBeat: Beat,
): boolean {
  if (zone.lane < minLane || zone.lane > maxLane) return false;
  return (
    beatToFloat(zone.beat) <= beatToFloat(maxBeat) &&
    beatToFloat(zone.endBeat) >= beatToFloat(minBeat)
  );
}

/**
 * 선택된 노트들과 연동되는 트릴존 인덱스 집합을 구한다.
 * 같은 레인에서 구간이 겹치는 트릴존이 하나라도 있으면 선택에 포함한다.
 */
export function getSelectedTrillZoneIndices(
  trillZones: readonly TrillZone[],
  notes: readonly NoteEntity[],
  selectedNoteIndices: ReadonlySet<number>,
): Set<number> {
  const result = new Set<number>();
  if (selectedNoteIndices.size === 0) return result;

  for (let zoneIndex = 0; zoneIndex < trillZones.length; zoneIndex++) {
    const zone = trillZones[zoneIndex];
    for (const noteIndex of selectedNoteIndices) {
      const note = notes[noteIndex];
      if (note && trillZoneOverlapsNote(zone, note)) {
        result.add(zoneIndex);
        break;
      }
    }
  }
  return result;
}

/** 노트가 트릴 노트(trill/trillLong)인지 판정한다. */
export function isTrillNote(note: NoteEntity): boolean {
  return note.type === "trill" || note.type === "trillLong";
}

/** 트릴 노트가 속한 트릴존 인덱스를 반환한다. 트릴이 아니거나 어느 구간에도 없으면 null. */
export function trillZoneIndexOfNote(
  trillZones: readonly TrillZone[],
  note: NoteEntity,
): number | null {
  if (!isTrillNote(note)) return null;
  for (let i = 0; i < trillZones.length; i++) {
    if (trillZoneOverlapsNote(trillZones[i], note)) return i;
  }
  return null;
}

/**
 * 선택의 종류. 한 선택은 동질적이어야 한다:
 * - empty: 빈 선택
 * - normal: 트릴 이외 노트들
 * - trill: 같은 트릴존(zoneIndex)에 속한 트릴 노트들
 */
export type SelectionKind =
  | { kind: "empty" }
  | { kind: "normal" }
  | { kind: "trill"; zoneIndex: number };

/** 단일 노트가 만드는 선택 종류를 반환한다. */
export function noteSelectionKind(
  trillZones: readonly TrillZone[],
  note: NoteEntity,
): SelectionKind {
  if (!isTrillNote(note)) return { kind: "normal" };
  return { kind: "trill", zoneIndex: trillZoneIndexOfNote(trillZones, note) ?? -1 };
}

/** 현재 선택된 노트들의 종류를 판정한다(가장 먼저 발견된 노트 기준). */
export function classifySelection(
  trillZones: readonly TrillZone[],
  notes: readonly NoteEntity[],
  selectedNoteIndices: ReadonlySet<number>,
): SelectionKind {
  let result: SelectionKind = { kind: "empty" };
  let lowest = Infinity;
  for (const idx of selectedNoteIndices) {
    const note = notes[idx];
    if (note && idx < lowest) {
      lowest = idx;
      result = noteSelectionKind(trillZones, note);
    }
  }
  return result;
}

/** 현재 선택 종류에 새 노트를 추가할 수 있는지 판정한다. */
export function canAddNoteToSelection(
  currentKind: SelectionKind,
  trillZones: readonly TrillZone[],
  note: NoteEntity,
): boolean {
  if (currentKind.kind === "empty") return true;
  const candidate = noteSelectionKind(trillZones, note);
  if (currentKind.kind === "normal") return candidate.kind === "normal";
  // trill 종류: 같은 구간의 트릴 노트만
  return candidate.kind === "trill" && candidate.zoneIndex === currentKind.zoneIndex;
}

/** 추가가 막히는 이유를 한국어 토스트 문구로 반환한다. 추가 가능하면 null. */
export function selectionBlockReason(
  currentKind: SelectionKind,
  trillZones: readonly TrillZone[],
  note: NoteEntity,
): string | null {
  if (canAddNoteToSelection(currentKind, trillZones, note)) return null;
  if (isTrillNote(note) !== (currentKind.kind === "trill")) {
    return "트릴 노트와 일반 노트는 함께 선택할 수 없습니다";
  }
  return "다른 트릴 구간의 노트는 함께 선택할 수 없습니다";
}

/**
 * 후보 인덱스들을 동질적인 한 그룹으로 줄인다.
 * 가장 작은 인덱스의 노트가 그룹 종류를 정하고, 다른 종류는 제외한다.
 */
export function filterHomogeneousSelection(
  trillZones: readonly TrillZone[],
  notes: readonly NoteEntity[],
  candidateIndices: Iterable<number>,
): { kept: Set<number>; dropped: number } {
  const sorted = [...candidateIndices].sort((a, b) => a - b);
  let kind: SelectionKind = { kind: "empty" };
  const kept = new Set<number>();
  let dropped = 0;
  for (const idx of sorted) {
    const note = notes[idx];
    if (!note) continue;
    if (kind.kind === "empty") {
      kind = noteSelectionKind(trillZones, note);
      kept.add(idx);
    } else if (canAddNoteToSelection(kind, trillZones, note)) {
      kept.add(idx);
    } else {
      dropped++;
    }
  }
  return { kept, dropped };
}

/**
 * 박스 시작 앵커의 엔티티로 잠글 SelectionKind를 정한다 (RFD 0016 §6-2 첫 접촉 잠금).
 * 앵커가 트릴 노트면 그 zone의 트릴 모드, 그 외(일반 노트/빈 곳=null)면 normal.
 * 박스는 항상 normal/trill 중 하나로 잠기므로 empty는 반환하지 않는다.
 */
export function boxAnchorKind(
  trillZones: readonly TrillZone[],
  notes: readonly NoteEntity[],
  anchorNoteIndex: number | null,
): SelectionKind {
  if (anchorNoteIndex === null) return { kind: "normal" };
  const note = notes[anchorNoteIndex];
  if (!note || !isTrillNote(note)) return { kind: "normal" };
  return { kind: "trill", zoneIndex: trillZoneIndexOfNote(trillZones, note) ?? -1 };
}

/** 노트가 박스 범위(레인·박 폐구간) 안에 있는지 — 기존 박스 커밋과 동일한 판정. */
function noteInBox(
  note: NoteEntity,
  box: { minLane: number; maxLane: number; minBeat: Beat; maxBeat: Beat },
): boolean {
  return (
    note.lane >= box.minLane &&
    note.lane <= box.maxLane &&
    beatSub(note.beat, box.minBeat).n >= 0 &&
    beatSub(box.maxBeat, note.beat).n >= 0
  );
}

/**
 * 잠긴 kind에 따라 박스 범위 안 선택을 계산한다 (RFD 0016 §6-2).
 * - trill 모드: 그 zone에 속한 트릴 노트만 담고 zones는 비운다.
 * - normal 모드: 비트릴 노트 + 겹치는 trillZone 유닛(RFD 0016 §4.3).
 * empty 잠금은 도달하지 않지만(박스는 항상 normal/trill로 잠김) 방어적으로 normal로 취급한다.
 */
export function selectionFromBox(
  trillZones: readonly TrillZone[],
  notes: readonly NoteEntity[],
  box: { minLane: number; maxLane: number; minBeat: Beat; maxBeat: Beat },
  lockedKind: SelectionKind,
): { notes: Set<number>; zones: Set<number> } {
  const selectedNotes = new Set<number>();
  const selectedZones = new Set<number>();

  if (lockedKind.kind === "trill") {
    // 고아 트릴 앵커(어느 zone에도 안 속함 = zoneIndex -1): 잡을 동질 그룹이 없으므로
    // 빈 선택으로 고정한다. 서로 무관한 고아 트릴들을 한 그룹으로 합치지 않으려는 의도.
    if (lockedKind.zoneIndex < 0) return { notes: selectedNotes, zones: selectedZones };
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (
        isTrillNote(note) &&
        noteInBox(note, box) &&
        trillZoneIndexOfNote(trillZones, note) === lockedKind.zoneIndex
      ) {
        selectedNotes.add(i);
      }
    }
    return { notes: selectedNotes, zones: selectedZones };
  }

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (!isTrillNote(note) && noteInBox(note, box)) selectedNotes.add(i);
  }
  for (let i = 0; i < trillZones.length; i++) {
    if (trillZoneOverlapsBox(trillZones[i], box.minLane, box.maxLane, box.minBeat, box.maxBeat)) {
      selectedZones.add(i);
    }
  }
  return { notes: selectedNotes, zones: selectedZones };
}

/** 트릴존을 레인/박자 오프셋만큼 평행 이동한 새 트릴존을 반환한다. */
export function translateTrillZone(
  zone: TrillZone,
  laneOffset: number,
  beatOffset: { n: number; d: number },
): TrillZone {
  return {
    ...zone,
    lane: (zone.lane + laneOffset) as TrillZone["lane"],
    beat: beatAdd(zone.beat, beatOffset),
    endBeat: beatAdd(zone.endBeat, beatOffset),
  };
}

function endBeatOf(pos: { beat: Beat; endBeat?: Beat }): Beat {
  return pos.endBeat ?? pos.beat;
}

/**
 * 트릴 노트들을 구간 [zone.beat, zone.endBeat] 안에 머물게 하는 박자 오프셋을 반환한다.
 * 요청 오프셋이 구간을 벗어나면 경계까지만 허용(클램프). 여유가 없으면 0(이동 불가).
 *
 * 허용 범위:
 *   dMin = zone.beat - min(노트 시작)     (이보다 작으면 위로 벗어남)
 *   dMax = zone.endBeat - max(노트 끝)     (이보다 크면 아래로 벗어남)
 */
export function clampTrillBeatOffset(
  zone: TrillZone,
  positions: ReadonlyArray<{ beat: Beat; endBeat?: Beat }>,
  requested: Beat,
): Beat {
  if (positions.length === 0) return requested;

  let minStart = positions[0].beat;
  let maxEnd = endBeatOf(positions[0]);
  for (const pos of positions) {
    if (beatToFloat(pos.beat) < beatToFloat(minStart)) minStart = pos.beat;
    const end = endBeatOf(pos);
    if (beatToFloat(end) > beatToFloat(maxEnd)) maxEnd = end;
  }

  const dMin = beatSub(zone.beat, minStart);
  const dMax = beatSub(zone.endBeat, maxEnd);
  const reqF = beatToFloat(requested);
  const dMinF = beatToFloat(dMin);
  const dMaxF = beatToFloat(dMax);

  if (dMinF > dMaxF) return { n: 0, d: 1 }; // 구간이 노트로 가득 차 이동 여유 없음
  if (reqF < dMinF) return dMin;
  if (reqF > dMaxF) return dMax;
  return requested;
}

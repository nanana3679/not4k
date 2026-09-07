import type { NoteEntity, RangeNote, TrillZone } from "../../shared";
import { beatEq, beatGte, beatLte } from "../../shared";

export type JudgmentScoreItemKind = "head" | "release" | "holdOnly";

export interface JudgmentScoreItem {
  id: string;
  /** ScoreManager 호환 안정 ID */
  itemId: string;
  kind: JudgmentScoreItemKind;
  weight: 3;
  weight3: 3;
  timeMs: number;
  unitIndex: number;
  noteIndex: number;
  lane: number;
  startMs: number;
  endMs?: number;
  unitOrdinal?: number;
  headIndex?: number;
  predecessorIndex?: number;
  successorIndex?: number;
}

export interface CompiledJudgmentUnit {
  ordinal: number;
  noteIndex: number;
  lane: number;
  startMs: number;
  endMs: number;
  headIndex?: number;
  predecessorIndex?: number;
  successorIndex?: number;
  releaseItemId?: string;
  holdOnlyItemId?: string;
}

export interface CompiledJudgmentNote {
  noteIndex: number;
  lane: number;
  startMs: number;
  endMs?: number;
  headIndex?: number;
  predecessorIndex?: number;
  successorIndex?: number;
  units: CompiledJudgmentUnit[];
}

export interface JudgmentConnection {
  predecessorIndex: number;
  successorIndex: number;
  lane: number;
  boundaryMs: number;
  sourceUnits: number;
  targetUnits: number;
}

export interface CompiledJudgmentChart {
  readonly rawNotes: readonly NoteEntity[];
  readonly noteTimesMs: TimeInput;
  readonly noteEndTimesMs: TimeInput;
  /** Beat/lane로 귀속한 trill note의 정적 zone ordinal. 시간값에는 의존하지 않는다. */
  readonly trillZoneByNote: ReadonlyMap<number, number>;
  notes: CompiledJudgmentNote[];
  connections: JudgmentConnection[];
  items: JudgmentScoreItem[];
  /** NoteJudgmentCore/ScoreManager 어댑터가 바로 소비하는 별칭 */
  scoreItems: JudgmentScoreItem[];
  units: CompiledJudgmentUnit[];
  theoreticalWeight: number;
  /** editor test-play에서 제외된 원본 note index. 원본 index/ID는 유지한다. */
  readonly excludedNoteIndices?: ReadonlySet<number>;
}

/**
 * 에디터 test-play cursor 이전 note를 판정 chart에서 제외한다.
 * 원본 noteIndex와 score item ID를 유지하고, 제외된 연결과 시간 항목을 제거한다.
 */
export function selectCompiledJudgmentChart(chart: CompiledJudgmentChart, startTimeMs: number): CompiledJudgmentChart {
  const excluded = new Set<number>(chart.excludedNoteIndices);
  for (const note of chart.notes) if (note.startMs < startTimeMs) excluded.add(note.noteIndex);
  const included = (index: number) => !excluded.has(index);
  const notes = chart.notes.filter(note => included(note.noteIndex)).map(note => ({
    ...note,
    predecessorIndex: note.predecessorIndex !== undefined && included(note.predecessorIndex) ? note.predecessorIndex : undefined,
    successorIndex: note.successorIndex !== undefined && included(note.successorIndex) ? note.successorIndex : undefined,
    units: note.units.filter(unit => included(unit.noteIndex)).map(unit => ({
      ...unit,
      predecessorIndex: unit.predecessorIndex !== undefined && included(unit.predecessorIndex) ? unit.predecessorIndex : undefined,
      successorIndex: unit.successorIndex !== undefined && included(unit.successorIndex) ? unit.successorIndex : undefined,
    })),
  }));
  const units = notes.flatMap(note => note.units);
  const items = chart.items.filter(item => included(item.noteIndex)).map(item => ({
    ...item,
    predecessorIndex: item.predecessorIndex !== undefined && included(item.predecessorIndex) ? item.predecessorIndex : undefined,
    successorIndex: item.successorIndex !== undefined && included(item.successorIndex) ? item.successorIndex : undefined,
  }));
  const noteTimesMs = new Map<number, number>();
  const noteEndTimesMs = new Map<number, number>();
  for (const note of notes) {
    noteTimesMs.set(note.noteIndex, note.startMs);
    if (note.endMs !== undefined) noteEndTimesMs.set(note.noteIndex, note.endMs);
  }
  const connections = chart.connections.filter(connection => included(connection.predecessorIndex) && included(connection.successorIndex));
  return {
    ...chart,
    notes, units, items, scoreItems: items, connections, noteTimesMs, noteEndTimesMs,
    trillZoneByNote: new Map([...chart.trillZoneByNote].filter(([index]) => included(index))),
    theoreticalWeight: items.reduce((sum, item) => sum + item.weight, 0),
    excludedNoteIndices: excluded,
  };
}

export type TimeInput = ReadonlyMap<number, number> | readonly (number | undefined)[];

function timeAt(values: TimeInput, index: number): number | undefined {
  return Array.isArray(values) ? values[index] : (values as ReadonlyMap<number, number>).get(index);
}

function isRange(note: NoteEntity): note is RangeNote {
  return "endBeat" in note;
}

function unitCount(note: RangeNote): number {
  return note.type === "doubleLong" ? 2 : 1;
}

/**
 * 차트 Beat 관계를 한 번 계산해 판정과 렌더링이 공유할 수 있는 정적 표현으로 만든다.
 * noteTimesMs/endTimesMs는 note 배열과 같은 인덱스의 시각이며, 연결 여부에는 사용하지 않는다.
 */
export function compileJudgmentChart(
  notes: readonly NoteEntity[],
  noteTimesMs: TimeInput,
  noteEndTimesMs: TimeInput,
  trillZones: readonly TrillZone[] = [],
): CompiledJudgmentChart {
  const trillZoneByNote = new Map<number, number>();
  notes.forEach((note, noteIndex) => {
    if (note.type !== "trill" && note.type !== "trillLong") return;
    const zoneIndex = trillZones.findIndex((zone) => {
      if (zone.lane !== note.lane || !beatGte(note.beat, zone.beat) || !beatLte(note.beat, zone.endBeat)) return false;
      return note.type !== "trillLong" || (
        beatGte(note.endBeat, zone.beat) && beatLte(note.endBeat, zone.endBeat)
      );
    });
    if (zoneIndex >= 0) trillZoneByNote.set(noteIndex, zoneIndex);
  });
  const ranges = notes
    .map((note, index) => ({ note, index }))
    .filter((entry): entry is { note: RangeNote; index: number } => isRange(entry.note));
  const predecessors = new Map<number, number>();
  const successors = new Map<number, number>();

  for (const current of ranges) {
    let candidate: { index: number; startMs: number } | undefined;
    for (const previous of ranges) {
      if (previous.index === current.index || previous.note.lane !== current.note.lane) continue;
      if (!beatEq(previous.note.endBeat, current.note.beat)) continue;
      const startMs = timeAt(noteTimesMs, previous.index) ?? 0;
      if (!candidate || startMs < candidate.startMs || (startMs === candidate.startMs && previous.index < candidate.index)) {
        candidate = { index: previous.index, startMs };
      }
    }
    if (candidate) {
      predecessors.set(current.index, candidate.index);
      successors.set(candidate.index, current.index);
    }
  }

  const headIndices = new Map<number, number>();
  notes.forEach((note, index) => {
    if (isRange(note)) return;
    const range = ranges.find((entry) => entry.note.lane === note.lane && beatEq(entry.note.beat, note.beat));
    if (range) headIndices.set(range.index, index);
  });

  const compiledNotes: CompiledJudgmentNote[] = notes.map((note, noteIndex) => {
    const startMs = timeAt(noteTimesMs, noteIndex) ?? 0;
    const rangeEndMs = timeAt(noteEndTimesMs, noteIndex);
    if (!isRange(note)) return { noteIndex, lane: note.lane, startMs, units: [] };
    const endMs = rangeEndMs === undefined ? startMs : rangeEndMs;
    const predecessorIndex = predecessors.get(noteIndex);
    const successorIndex = successors.get(noteIndex);
    const count = unitCount(note);
    const releaseCount = note.holdOnly ? 0 : (successorIndex === undefined ? count : Math.max(0, count - unitCount(notes[successorIndex] as RangeNote)));
    return {
      noteIndex, lane: note.lane, startMs, endMs,
      headIndex: headIndices.get(noteIndex), predecessorIndex, successorIndex,
      units: Array.from({ length: count }, (_, ordinal) => ({
        ordinal, noteIndex, lane: note.lane, startMs, endMs,
        headIndex: headIndices.get(noteIndex), predecessorIndex, successorIndex,
        releaseItemId: releaseCount > ordinal ? `n${noteIndex}:release:${ordinal}` : undefined,
        holdOnlyItemId: note.holdOnly ? `n${noteIndex}:holdOnly:${ordinal}` : undefined,
      })),
    };
  });

  const items: JudgmentScoreItem[] = [];
  for (const [rangeIndex, headIndex] of headIndices) {
    const note = notes[rangeIndex];
    if (!isRange(note)) continue;
    const timeMs = timeAt(noteTimesMs, headIndex) ?? timeAt(noteTimesMs, rangeIndex) ?? 0;
    const headNote = notes[headIndex];
    const headCount = !isRange(headNote) && headNote.type === "double" ? 2 : 1;
    for (let ordinal = 0; ordinal < headCount; ordinal++) {
      const id = headCount === 1 ? `n${headIndex}:head` : `n${headIndex}:head:${ordinal}`;
      items.push({ id, itemId: id, kind: "head", weight: 3, weight3: 3, timeMs, noteIndex: headIndex, lane: note.lane, startMs: timeMs, unitIndex: ordinal, headIndex });
    }
  }
  notes.forEach((note, noteIndex) => {
    if (!isRange(note)) {
      if (!headIndicesHasPoint(noteIndex, notes, headIndices)) { const timeMs = timeAt(noteTimesMs, noteIndex) ?? 0; const count = note.type === "double" ? 2 : 1; for (let ordinal = 0; ordinal < count; ordinal++) { const id = count === 1 ? `n${noteIndex}:head` : `n${noteIndex}:head:${ordinal}`; items.push({ id, itemId: id, kind: "head", weight: 3, weight3: 3, timeMs, noteIndex, lane: note.lane, startMs: timeMs, unitIndex: ordinal }); } }
      return;
    }
    const source = unitCount(note);
    const next = successors.get(noteIndex);
    const target = next === undefined ? 0 : unitCount(notes[next] as RangeNote);
    const compiled = compiledNotes[noteIndex];
    if (note.holdOnly) {
      for (let ordinal = 0; ordinal < source; ordinal++) { const id = `n${noteIndex}:holdOnly:${ordinal}`; items.push({ id, itemId: id, kind: "holdOnly", weight: 3, weight3: 3, timeMs: compiled.endMs!, noteIndex, lane: note.lane, startMs: compiled.startMs, endMs: compiled.endMs, unitOrdinal: ordinal, unitIndex: ordinal, headIndex: compiled.headIndex, predecessorIndex: compiled.predecessorIndex, successorIndex: compiled.successorIndex }); }
    } else {
      const releases = next === undefined ? source : Math.max(0, source - target);
      for (let ordinal = 0; ordinal < releases; ordinal++) { const id = `n${noteIndex}:release:${ordinal}`; items.push({ id, itemId: id, kind: "release", weight: 3, weight3: 3, timeMs: compiled.endMs!, noteIndex, lane: note.lane, startMs: compiled.startMs, endMs: compiled.endMs, unitOrdinal: ordinal, unitIndex: ordinal, headIndex: compiled.headIndex, predecessorIndex: compiled.predecessorIndex, successorIndex: compiled.successorIndex }); }
    }
  });

  const connections = [...predecessors.entries()].map(([successorIndex, predecessorIndex]) => {
    const previous = notes[predecessorIndex] as RangeNote;
    const next = notes[successorIndex] as RangeNote;
    return { predecessorIndex, successorIndex, lane: next.lane, boundaryMs: timeAt(noteTimesMs, successorIndex) ?? timeAt(noteEndTimesMs, predecessorIndex) ?? 0, sourceUnits: unitCount(previous), targetUnits: unitCount(next) };
  });
  return { rawNotes: notes, noteTimesMs, noteEndTimesMs, trillZoneByNote, notes: compiledNotes, connections, items, scoreItems: items, units: compiledNotes.flatMap((note) => note.units), theoreticalWeight: items.reduce((sum, item) => sum + item.weight, 0) };
}

function headIndicesHasPoint(index: number, notes: readonly NoteEntity[], headIndices: ReadonlyMap<number, number>): boolean {
  for (const pointIndex of headIndices.values()) if (pointIndex === index) return true;
  return isRange(notes[index]);
}

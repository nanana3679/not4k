import type { Chart, NoteEntity, Lane } from "../../shared";
import { fromAuxIndex, toAuxIndex, validateChart, violationsInvolving } from "../../shared";
import {
  auxSelectionIndexToNoteIndex,
  noteIndexToAuxSelectionIndex,
} from "../auxNoteProjection";

export interface LaneConversionCallbacks {
  getExtraNotes?: () => NoteEntity[];
  onExtraNotesUpdate?: (extraNotes: NoteEntity[]) => void;
  onExtraSelectionChange?: (indices: Set<number>) => void;
  onChartUpdate: (chart: Chart) => void;
  onSelectionChange: (selectedIndices: Set<number>) => void;
}

/**
 * 선택된 메인 노트의 lane을 보조 레인으로 이동한다.
 * 성공 시 새로운 selectedIndices, selectedExtraIndices를 반환하고 콜백을 호출한다.
 */
export function convertMainToExtra(
  chart: Chart,
  selectedIndices: Set<number>,
  targetExtraLane: number,
  callbacks: LaneConversionCallbacks,
): { chart: Chart; selectedIndices: Set<number>; selectedExtraIndices: Set<number> } | null {
  const selectedSorted = [...selectedIndices].sort((a, b) => a - b);
  const targetLane = fromAuxIndex(targetExtraLane);
  if (targetLane === null) return null;

  const newNotes = [...chart.notes];
  for (const idx of selectedSorted) {
    const note = newNotes[idx];
    if (!note) return null;
    newNotes[idx] = { ...note, lane: targetLane };
  }

  const newChart = { ...chart, notes: newNotes };
  callbacks.onChartUpdate(newChart);

  const newSelectedIndices = new Set<number>();
  callbacks.onSelectionChange(newSelectedIndices);

  const newSelectedExtraIndices = new Set<number>();
  for (const noteIndex of selectedSorted) {
    const auxIndex = noteIndexToAuxSelectionIndex(newNotes, noteIndex);
    if (auxIndex !== null) newSelectedExtraIndices.add(auxIndex);
  }
  callbacks.onExtraSelectionChange?.(new Set(newSelectedExtraIndices));

  return { chart: newChart, selectedIndices: newSelectedIndices, selectedExtraIndices: newSelectedExtraIndices };
}

/**
 * 선택된 보조 노트의 lane을 메인 레인으로 이동한다.
 * 성공 시 새로운 selectedIndices, selectedExtraIndices를 반환하고 콜백을 호출한다.
 * 검증 실패 시 null을 반환한다.
 */
export function convertExtraToMain(
  chart: Chart,
  selectedExtraIndices: Set<number>,
  targetLane: Lane,
  callbacks: LaneConversionCallbacks,
): { chart: Chart; selectedIndices: Set<number>; selectedExtraIndices: Set<number> } | null {
  const selectedSorted = [...selectedExtraIndices].sort((a, b) => a - b);
  const selectedNoteIndices = new Set<number>();
  for (const auxIndex of selectedSorted) {
    const noteIndex = auxSelectionIndexToNoteIndex(chart.notes, auxIndex);
    if (noteIndex === null) return null;
    selectedNoteIndices.add(noteIndex);
  }

  const newNotes = chart.notes.map((note, index) => (
    selectedNoteIndices.has(index) ? { ...note, lane: targetLane } : note
  ));
  const newChart = { ...chart, notes: newNotes };

  // 낙관적 편집(RFD 0017): 변환되어 들어오는 노트에 연루된 위반만 차단 (국소 판정)
  // — 차트에 무관한 transient 위반이 상주해도 변환을 전역 차단하지 않는다.
  const errors = violationsInvolving(
    validateChart({
      notes: newChart.notes,
      trillZones: newChart.trillZones,
      events: newChart.events,
    }),
    [...selectedNoteIndices].map((index) => ({ kind: "note" as const, index })),
  );

  if (errors.length > 0) {
    return null;
  }

  callbacks.onChartUpdate(newChart);

  // 선택 상태 전환: 엑스트라 선택 해제, 메인 선택 설정
  const newSelectedExtraIndices = new Set<number>();
  callbacks.onExtraSelectionChange?.(newSelectedExtraIndices);

  const newSelectedIndices = selectedNoteIndices;
  callbacks.onSelectionChange(newSelectedIndices);

  return { chart: newChart, selectedIndices: newSelectedIndices, selectedExtraIndices: newSelectedExtraIndices };
}

/**
 * 선택된 엑스트라 노트를 레인 방향으로 이동한다.
 * 성공 시 새 extraNotes 배열을 반환하고 콜백을 호출한다.
 * 범위 초과 시 null을 반환한다.
 */
export function moveExtraByLane(
  selectedExtraIndices: Set<number>,
  direction: "left" | "right",
  extraLaneCount: number,
  callbacks: Pick<LaneConversionCallbacks, "getExtraNotes" | "onExtraNotesUpdate">,
): NoteEntity[] | null {
  if (!callbacks.getExtraNotes || !callbacks.onExtraNotesUpdate) return null;

  const extraNotes = callbacks.getExtraNotes();
  const laneOffset = direction === "left" ? -1 : 1;

  // Check if all extra notes can move within extra lanes
  for (const idx of selectedExtraIndices) {
    const note = extraNotes[idx];
    const currentAuxLane = toAuxIndex(note.lane);
    if (currentAuxLane === null) return null;
    const targetLane = currentAuxLane + laneOffset;
    if (targetLane < 1 || targetLane > extraLaneCount) return null;
  }

  // Apply extra lane move
  const newExtraNotes = [...extraNotes];
  for (const idx of selectedExtraIndices) {
    const note = newExtraNotes[idx];
    newExtraNotes[idx] = { ...note, lane: note.lane + laneOffset };
  }

  callbacks.onExtraNotesUpdate(newExtraNotes);
  return newExtraNotes;
}

import type { Chart, NoteEntity, RangeNote, Lane, ExtraNoteEntity } from "../../shared";
import { validateChart } from "../../shared";

export interface LaneConversionCallbacks {
  getExtraNotes?: () => ExtraNoteEntity[];
  onExtraNotesUpdate?: (extraNotes: ExtraNoteEntity[]) => void;
  onExtraSelectionChange?: (indices: Set<number>) => void;
  onChartUpdate: (chart: Chart) => void;
  onSelectionChange: (selectedIndices: Set<number>) => void;
}

/** 메인 노트인지 판별 */
function isRangeNote(note: NoteEntity | ExtraNoteEntity): note is RangeNote {
  return "endBeat" in note;
}

/**
 * 선택된 메인 노트를 엑스트라 노트로 변환한다.
 * 성공 시 새로운 selectedIndices, selectedExtraIndices를 반환하고 콜백을 호출한다.
 * 콜백 미설정 시 null을 반환한다.
 */
export function convertMainToExtra(
  chart: Chart,
  selectedIndices: Set<number>,
  targetExtraLane: number,
  callbacks: LaneConversionCallbacks,
): { chart: Chart; selectedIndices: Set<number>; selectedExtraIndices: Set<number> } | null {
  if (!callbacks.getExtraNotes || !callbacks.onExtraNotesUpdate) return null;

  const extraNotes = callbacks.getExtraNotes();
  const selectedSorted = [...selectedIndices].sort((a, b) => a - b);

  // 선택된 메인 노트를 엑스트라 노트로 변환
  const convertedExtraNotes: ExtraNoteEntity[] = [];
  for (const idx of selectedSorted) {
    const note = chart.notes[idx];
    if (isRangeNote(note)) {
      convertedExtraNotes.push({
        type: note.type,
        extraLane: targetExtraLane,
        beat: note.beat,
        endBeat: note.endBeat,
      } as ExtraNoteEntity);
    } else {
      convertedExtraNotes.push({
        type: note.type,
        extraLane: targetExtraLane,
        beat: note.beat,
      } as ExtraNoteEntity);
    }
  }

  // 메인 노트에서 선택된 노트 제거
  const newNotes = chart.notes.filter((_note, idx) => !selectedIndices.has(idx));
  const newChart = { ...chart, notes: newNotes };
  callbacks.onChartUpdate(newChart);

  // 엑스트라 노트에 추가
  const newExtraNotes = [...extraNotes, ...convertedExtraNotes];
  callbacks.onExtraNotesUpdate(newExtraNotes);

  // 선택 상태 전환: 메인 선택 해제, 엑스트라 선택 설정
  const newSelectedIndices = new Set<number>();
  callbacks.onSelectionChange(newSelectedIndices);

  const newSelectedExtraIndices = new Set<number>();
  const baseIdx = extraNotes.length;
  for (let i = 0; i < convertedExtraNotes.length; i++) {
    newSelectedExtraIndices.add(baseIdx + i);
  }
  callbacks.onExtraSelectionChange?.(new Set(newSelectedExtraIndices));

  return { chart: newChart, selectedIndices: newSelectedIndices, selectedExtraIndices: newSelectedExtraIndices };
}

/**
 * 선택된 엑스트라 노트를 메인 노트로 변환한다.
 * 성공 시 새로운 selectedIndices, selectedExtraIndices를 반환하고 콜백을 호출한다.
 * 검증 실패 시 null을 반환한다.
 */
export function convertExtraToMain(
  chart: Chart,
  selectedExtraIndices: Set<number>,
  targetLane: Lane,
  callbacks: LaneConversionCallbacks,
): { chart: Chart; selectedIndices: Set<number>; selectedExtraIndices: Set<number> } | null {
  if (!callbacks.getExtraNotes || !callbacks.onExtraNotesUpdate) return null;

  const extraNotes = callbacks.getExtraNotes();
  const selectedSorted = [...selectedExtraIndices].sort((a, b) => a - b);

  // 선택된 엑스트라 노트를 메인 노트로 변환
  const convertedMainNotes: NoteEntity[] = [];
  for (const idx of selectedSorted) {
    const note = extraNotes[idx];
    if ("endBeat" in note) {
      convertedMainNotes.push({
        type: note.type,
        lane: targetLane,
        beat: note.beat,
        endBeat: note.endBeat,
      } as NoteEntity);
    } else {
      convertedMainNotes.push({
        type: note.type,
        lane: targetLane,
        beat: note.beat,
      } as NoteEntity);
    }
  }

  // 메인 노트에 추가
  const newNotes = [...chart.notes, ...convertedMainNotes];
  const newChart = { ...chart, notes: newNotes };

  // Validate
  const errors = validateChart({
    notes: newChart.notes,
    trillZones: newChart.trillZones,
    events: newChart.events,
  });

  if (errors.length > 0) {
    return null;
  }

  callbacks.onChartUpdate(newChart);

  // 엑스트라 노트에서 선택된 노트 제거
  const newExtraNotes = extraNotes.filter((_note, idx) => !selectedExtraIndices.has(idx));
  callbacks.onExtraNotesUpdate(newExtraNotes);

  // 선택 상태 전환: 엑스트라 선택 해제, 메인 선택 설정
  const newSelectedExtraIndices = new Set<number>();
  callbacks.onExtraSelectionChange?.(newSelectedExtraIndices);

  const newSelectedIndices = new Set<number>();
  const baseIdx = newChart.notes.length - convertedMainNotes.length;
  for (let i = 0; i < convertedMainNotes.length; i++) {
    newSelectedIndices.add(baseIdx + i);
  }
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
): ExtraNoteEntity[] | null {
  if (!callbacks.getExtraNotes || !callbacks.onExtraNotesUpdate) return null;

  const extraNotes = callbacks.getExtraNotes();
  const laneOffset = direction === "left" ? -1 : 1;

  // Check if all extra notes can move within extra lanes
  for (const idx of selectedExtraIndices) {
    const note = extraNotes[idx];
    const targetLane = note.extraLane + laneOffset;
    if (targetLane < 1 || targetLane > extraLaneCount) return null;
  }

  // Apply extra lane move
  const newExtraNotes = [...extraNotes];
  for (const idx of selectedExtraIndices) {
    const note = newExtraNotes[idx];
    newExtraNotes[idx] = { ...note, extraLane: note.extraLane + laneOffset };
  }

  callbacks.onExtraNotesUpdate(newExtraNotes);
  return newExtraNotes;
}

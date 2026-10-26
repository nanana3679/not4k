import type { Chart } from "../shared/types";
import {
  assertLegacyNotes, deserializeChartDocument, parseExtraNotesDocument,
  requireLegacyChart, withAuxNotes, maxAuxLane, toAuxIndex,
} from "../shared/chart";

/** 현행 에디터 진입점. 미지원 자료를 빈 보조 데이터로 열지 않는다. */
export function loadLegacyEditorChartAsset(chartText: string, extraText: string | null): { chart: Chart; extraLaneCount: number } {
  let document = deserializeChartDocument(chartText);
  // 보조 파일 병합이 메인에 담긴 미지원 보조 항목을 가리기 전 먼저 확인한다.
  assertLegacyNotes(document.notes, "현재 에디터");
  let extraLaneCount = 0;
  try {
    // 별도 파일이 없으면 기존 메인 내장 보조 데이터로 돌아간다.
    const extra = parseExtraNotesDocument(JSON.parse(extraText || chartText));
    if (extra.extraNotes.length > 0 || extra.extraLaneCount > 0) {
      document = { ...document, notes: withAuxNotes(document.notes, extra.extraNotes) };
      extraLaneCount = Math.max(extra.extraLaneCount, toAuxIndex(maxAuxLane(document.notes)));
    }
  } catch (error) {
    // 기존 손상 JSON 보조 파일 처리는 유지하되 인식한 형식 오류는 전달한다.
    if (!(error instanceof SyntaxError)) throw error;
  }
  return { chart: requireLegacyChart(document, "현재 에디터"), extraLaneCount };
}

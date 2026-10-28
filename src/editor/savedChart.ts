/**
 * 저장 기준 — 서버에 있는 차트의 저장 직렬화(메인·보조 JSON)와 dirty 비교.
 *
 * 저장 기준은 에디터 store(`savedChartJson`)가 차트와 함께 소유한다. 페이지 컴포넌트가 마운트될 때 현재 차트로
 * 만들면 테스트 플레이에서 돌아와 다시 마운트될 때 저장하지 않은 편집이 기준이 되어 dirty 표시·나가기 확인이 사라진다.
 * 서버에서 차트를 새로 불러올 때와 저장(Save·Save As)이 성공했을 때만 정한다.
 */
import type { ChartDocument } from '../shared';
import { serializeChart, serializeExtraNotes, mainNotes, auxNotesAsExtra } from '../shared';

/** 서버에 있는 차트의 메인(`{difficulty}.json`)·보조(`{difficulty}.extra.json`) 직렬화. */
export interface SavedChartJson {
  chartJson: string;
  extraJson: string;
}

/** 저장 분리(saveChartAsset)와 같게 메인/보조를 나눠 직렬화한다 (RFD 0018 ③). */
export function toSavedChartJson(chart: ChartDocument, extraLaneCount: number): SavedChartJson {
  return {
    chartJson: serializeChart({ ...chart, notes: mainNotes(chart.notes) }),
    extraJson: serializeExtraNotes(auxNotesAsExtra(chart.notes), extraLaneCount),
  };
}

/**
 * 현재 차트·보조 레인 수가 저장 기준과 다르면 dirty다.
 * 저장 기준이 없으면(null) 서버 상태를 모르므로 dirty로 본다 — 확인 없이 나가 편집을 잃지 않게 한다.
 */
export function isChartDirty(chart: ChartDocument, extraLaneCount: number, saved: SavedChartJson | null): boolean {
  if (saved === null) return true;
  const current = toSavedChartJson(chart, extraLaneCount);
  return current.chartJson !== saved.chartJson || current.extraJson !== saved.extraJson;
}

/**
 * `savedChartJson` 만들기와 dirty 비교.
 *
 * `savedChartJson`은 마지막으로 불러오거나 저장한 차트를 Save가 쓰는 방식(메인·보조 JSON)으로 직렬화한 값이다.
 * 불러올 때는 불러온(메인·보조를 합친) 차트를 그때의 보조 레인 수로 직렬화하고, 저장(Save·Save As)이 성공하면
 * 업로드한 메인·보조 JSON으로 바꾼다. 서버에서 받은 파일 텍스트가 아니다. 예를 들어 `.extra.json`도 `extraLaneCount`도
 * 없는 차트는 보조 레인 수 기본값 2로 직렬화하므로 불러온 직후 dirty가 아니지만, Save하면 보조 레인 수 2인
 * `.extra.json`을 새로 만든다. 받은 텍스트를 그대로 비교 대상으로 쓰면 이런 차트가 불러오자마자 dirty가 된다.
 *
 * `savedChartJson`은 에디터 store가 차트와 함께 소유한다. 페이지 컴포넌트가 마운트될 때 현재 차트로 만들면 테스트
 * 플레이에서 돌아와 다시 마운트될 때 저장하지 않은 편집이 비교 대상이 되어 dirty 표시·나가기 확인이 사라진다.
 */
import type { ChartDocument } from '../shared';
import { serializeChart, serializeExtraNotes, mainNotes, auxNotesAsExtra } from '../shared';

/** Save가 쓰는 메인(`{difficulty}.json`)·보조(`{difficulty}.extra.json`) JSON 문자열. */
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
 * 현재 차트·보조 레인 수를 같은 방식으로 직렬화해 `savedChartJson`과 다르면 dirty다.
 * `savedChartJson`이 없으면(null, 아직 불러온 차트가 없음) 비교할 대상이 없으므로 dirty로 본다 — 확인 없이 나가 편집을 잃지 않게 한다.
 */
export function isChartDirty(chart: ChartDocument, extraLaneCount: number, saved: SavedChartJson | null): boolean {
  if (saved === null) return true;
  const current = toSavedChartJson(chart, extraLaneCount);
  return current.chartJson !== saved.chartJson || current.extraJson !== saved.extraJson;
}

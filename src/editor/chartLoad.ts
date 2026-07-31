import {
  deserializeChart,
  maxAuxLane,
  parseExtraNotes,
  type Chart,
} from "../shared";

export interface LoadedEditorChart {
  chart: Chart;
  extraLaneCount: number;
}

/**
 * 메인 차트와 선택적인 보조 레인 에셋을 에디터의 통합 차트로 조립한다.
 * 보조 에셋이 없으면 레거시 메인 JSON에 내장된 extraNotes를 읽는다.
 */
export function loadEditorChartAssets(
  chartText: string,
  extraText: string | null,
): LoadedEditorChart {
  let chart = deserializeChart(chartText);
  let extraLaneCount = 0;

  try {
    const extraJson = JSON.parse(extraText ?? chartText);
    const extra = parseExtraNotes(extraJson);
    chart = { ...chart, notes: [...chart.notes, ...extra.notes] };
    extraLaneCount = Math.max(extra.extraLaneCount, maxAuxLane(extra.notes));
  } catch {
    // 메인 차트는 유효하므로 보조 에셋만 무시하고 계속 연다.
  }

  return { chart, extraLaneCount };
}

/**
 * ChartIO — 차트 파일 저장/불러오기
 *
 * @not4k/shared의 직렬화 함수를 사용하여
 * 브라우저에서 JSON 파일 다운로드/업로드 처리.
 */

import { serializeChart, deserializeChart } from "@not4k/shared";
import type { Chart } from "@not4k/shared";

/** Download chart as JSON file */
export function saveChartToFile(chart: Chart, filename?: string): void {
  const json = serializeChart(chart);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? "chart.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** Load chart from JSON file (via file input) */
export async function loadChartFromFile(file: File): Promise<Chart> {
  const text = await file.text();
  return deserializeChart(text);
}

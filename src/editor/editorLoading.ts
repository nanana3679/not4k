import { getOperationLoadingSurface } from "../shared/feedback/operationFeedback";
import type { OperationLoadingSurface } from "../shared/feedback/operationFeedback";
import { deserializeChart, parseExtraNotes } from "../shared/chart/index";
import { withAuxNotes } from "../shared/chart/auxAdapter";
import {
  maxAuxLane,
  toAuxIndex,
} from "../shared/chart/laneAxis";
import type { Chart } from "../shared/types/chart";

export type EditorAudioLoadingSurface = "transparentPage" | "overlay" | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function fetchOptionalExtraChartText(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store" });
  } catch {
    throw new Error("보조 차트 가져오기 실패: 네트워크 오류");
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`보조 차트 가져오기 실패: HTTP ${response.status}`);
  }

  try {
    return await response.text();
  } catch {
    throw new Error("보조 차트 가져오기 실패: 응답 읽기 오류");
  }
}

export async function loadEditorChartAssets(
  chartUrl: string,
  extraUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<ReturnType<typeof parseEditorChartAssets>> {
  const chartFetch = fetcher(chartUrl, { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`Chart fetch failed: ${response.status}`);
    return response.text();
  });
  const extraFetch = fetchOptionalExtraChartText(extraUrl, fetcher);
  const [chartText, extraText] = await Promise.all([chartFetch, extraFetch]);
  return parseEditorChartAssets(chartText, extraText);
}

export function parseEditorChartAssets(
  chartText: string,
  extraText: string | null,
): {
  chart: Chart;
  extraLaneCount: number;
} {
  const chart = deserializeChart(chartText);
  const sourceText = extraText !== null ? extraText : chartText;

  let extraJson: unknown;
  try {
    extraJson = JSON.parse(sourceText);
  } catch {
    throw new Error("보조 차트 파싱 실패: 유효한 JSON이 아닙니다");
  }

  if (!isRecord(extraJson)) {
    throw new Error("보조 차트 파싱 실패: 최상위 값이 객체가 아닙니다");
  }

  let extra: ReturnType<typeof parseExtraNotes>;
  try {
    extra = parseExtraNotes(extraJson, { requireFileFields: extraText !== null });
  } catch {
    throw new Error("보조 차트 파싱 실패: 데이터 형식이 올바르지 않습니다");
  }

  if (extra.extraNotes.length === 0 && extra.extraLaneCount === 0) {
    return { chart, extraLaneCount: 0 };
  }

  const merged = {
    ...chart,
    notes: withAuxNotes(chart.notes, extra.extraNotes),
  };
  return {
    chart: merged,
    extraLaneCount: Math.max(extra.extraLaneCount, toAuxIndex(maxAuxLane(merged.notes))),
  };
}

export function getEditorAudioLoadingSurface(input: {
  audioLoading: boolean;
  initialAudioPending: boolean;
}): EditorAudioLoadingSurface {
  if (input.initialAudioPending) {
    return asEditorAudioSurface(getOperationLoadingSurface({
      operation: "editor.initialAudioLoad",
      running: true,
    }));
  }
  if (input.audioLoading) {
    return asEditorAudioSurface(getOperationLoadingSurface({
      operation: "editor.audioReload",
      running: true,
    }));
  }
  return asEditorAudioSurface(getOperationLoadingSurface({
    operation: "editor.audioReload",
    running: false,
  }));
}

function asEditorAudioSurface(surface: OperationLoadingSurface): EditorAudioLoadingSurface {
  if (surface === "transparentPage" || surface === "overlay") return surface;
  return null;
}

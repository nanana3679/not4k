import { getOperationLoadingSurface } from "../shared/feedback/operationFeedback";
import type { OperationLoadingSurface } from "../shared/feedback/operationFeedback";
import { deserializeChart, parseExtraNotes } from "../shared/chart/index";
import { withAuxNotes } from "../shared/chart/auxAdapter";
import {
  maxAuxLane,
  toAuxIndex,
} from "../shared/chart/laneAxis";
import type { Chart } from "../shared/types/chart";
import { useEditorStore } from "./stores";

export type EditorAudioLoadingSurface = "transparentPage" | "overlay" | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 저장소가 "객체 없음"으로 답했는지 판별한다.
 * 표준 HTTP 404와 함께, Supabase Storage가 없는 객체에 주는 HTTP 400 응답도 없음으로 본다.
 * 본문 `statusCode`가 "404"인 것만으로는 부족하다 — 버킷 없음(`NoSuchBucket`)도 "404"를 쓰기 때문이다.
 * - 배포된 형식(2026-10-18 실측): `{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}`
 * - 현재 Storage 형식: `code`·`error`가 둘 다 "NoSuchKey"
 * - `code` 없는 이전 형식: `error`가 "not_found"
 * 그 밖의 400(버킷 없음, 권한, 잘못된 요청 등)은 없음이 아니라 실패다.
 */
async function isObjectNotFound(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const body: unknown = await response.json();
    if (!isRecord(body) || String(body.statusCode) !== "404") return false;
    if (body.code !== undefined) return body.code === "NoSuchKey";
    return body.error === "not_found";
  } catch {
    return false;
  }
}

/**
 * 보조 파일(`{difficulty}.extra.json`) 본문을 가져온다.
 * 저장소에 파일이 없을 때만 null(이전 포맷 fallback)이고, 그 밖의 HTTP·네트워크·응답 읽기 오류는 거부한다.
 * 실패를 null로 바꾸면 보조 노트 없이 열린 에디터의 저장이 저장된 보조 파일을 덮어쓴다.
 */
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

  if (await isObjectNotFound(response)) return null;
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

/**
 * 차트 파일과 보조 파일을 모두 읽은 뒤에만 에디터 store에 차트를 연다.
 * 어느 쪽이든 실패하면 store를 건드리지 않고 거부한다 — activeSongId가 설정되지 않으므로 저장(handleSaveChart)도 할 수 없다.
 */
export async function loadChartIntoEditor(
  target: { songId: string; chartUrl: string; extraUrl: string },
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const loaded = await loadEditorChartAssets(target.chartUrl, target.extraUrl, fetcher);
  const store = useEditorStore.getState();
  // 로드는 게이트의 유일한 예외 통로 — 위반 차트도 열어 수리를 허용한다.
  store.loadChart(loaded.chart);
  if (loaded.extraLaneCount > 0) store.setExtraLaneCount(loaded.extraLaneCount);
  store.setActiveSongId(target.songId);
  store.resetHistory();
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

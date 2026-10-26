import type { Chart, ChartDocument } from "../shared/types";
import {
  assertLegacyNotes, deserializeChartDocument, parseExtraNotesDocument,
  requireLegacyChart, withAuxNotes, maxAuxLane, toAuxIndex, ChartFormatError,
} from "../shared/chart";

/**
 * 현행 에디터 진입점. 미지원·손상 자료를 빈 보조 데이터로 열지 않는다.
 * `extraText`가 null(별도 보조 파일 없음)일 때만 메인 내장 보조 데이터로 돌아간다.
 */
export function loadLegacyEditorChartAsset(chartText: string, extraText: string | null): { chart: Chart; extraLaneCount: number } {
  let document = deserializeChartDocument(chartText);
  // 보조 파일 병합이 메인에 담긴 미지원 보조 항목을 가리기 전 먼저 확인한다.
  assertLegacyNotes(document.notes, "현재 에디터");
  let extraLaneCount = 0;
  // chartText는 위에서 이미 JSON으로 읽혔다.
  const extra = parseExtraNotesDocument(extraText === null ? JSON.parse(chartText) : parseExtraFileJson(extraText));
  if (extra.extraNotes.length > 0 || extra.extraLaneCount > 0) {
    document = { ...document, notes: withAuxNotes(document.notes, extra.extraNotes) };
    extraLaneCount = Math.max(extra.extraLaneCount, toAuxIndex(maxAuxLane(document.notes)));
  }
  return { chart: requireLegacyChart(document, "현재 에디터"), extraLaneCount };
}

/** 지원되는 main/aux 문서를 의미 위반도 보존해 수리용으로 연다. */
export function loadEditorChartAsset(chartText: string, extraText: string | null): { chart: ChartDocument; extraLaneCount: number; hasExtraLaneCount: boolean } {
  let chart = deserializeChartDocument(chartText);
  let extraLaneCount = toAuxIndex(maxAuxLane(chart.notes));
  let hasExtraLaneCount = false;
  try {
    const extraJson = JSON.parse(extraText || chartText);
    const extra = parseExtraNotesDocument(extraJson);
    hasExtraLaneCount = extraJson.extraLaneCount !== undefined;
    if (extraText || extra.extraNotes.length > 0 || hasExtraLaneCount) {
      chart = { ...chart, notes: withAuxNotes(chart.notes, extra.extraNotes) };
    }
    extraLaneCount = Math.max(extra.extraLaneCount, toAuxIndex(maxAuxLane(chart.notes)));
  } catch (error) {
    // C1의 구형 읽기 행동: 손상 JSON만 무시한다. 인식한 형식 오류는 계속 전달한다.
    if (!(error instanceof SyntaxError)) throw error;
  }
  return { chart, extraLaneCount, hasExtraLaneCount };
}

/**
 * 성공 응답으로 받은 별도 보조 파일 본문을 JSON으로 읽는다. 빈 본문·잘린 본문은 보조 파일이 아니다.
 * 보조 없음으로 열면 다음 저장이 기존 .extra.json을 지우므로 형식 오류로 전달한다.
 */
function parseExtraFileJson(extraText: string): unknown {
  try {
    return JSON.parse(extraText);
  } catch {
    throw new ChartFormatError("보조 파일이 유효한 JSON이 아닙니다");
  }
}

/**
 * 별도 보조 파일을 읽는다. 없는 객체만 null(별도 보조 없음)로 돌려준다.
 * 권한·서버 오류나 네트워크 오류를 보조 없음으로 열면 저장이 기존 보조 파일을 지우므로 오류로 전달한다.
 */
export async function fetchEditorExtraText(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (response.ok) return response.text();
  if (await isMissingStorageObject(response)) return null;
  throw new Error(`Chart extra fetch failed: ${response.status}`);
}

/**
 * Supabase Storage는 없는 객체를 HTTP 404가 아니라 HTTP 400과 본문
 * `{"statusCode":"404","error":"not_found","code":"NoSuchKey"}`로 알린다. 다른 본문의 400은 없는 파일이 아니다.
 */
async function isMissingStorageObject(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    return false;
  }
  if (!body || typeof body !== "object") return false;
  const { statusCode, error, code } = body as Record<string, unknown>;
  return code === "NoSuchKey" || (String(statusCode) === "404" && error === "not_found");
}

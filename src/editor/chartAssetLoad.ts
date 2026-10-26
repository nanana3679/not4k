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

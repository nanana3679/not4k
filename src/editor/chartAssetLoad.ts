import type { ChartDocument } from "../shared/types";
import { resolveSongChart, type SongSharedData } from '../shared/songAssets/resolveSongChart';
import { deserializeChartDocument, parseExtraNotesDocument, extraToNote, isAuxLane, maxAuxLane, toAuxIndex, ChartFormatError } from "../shared/chart";

/** 메인·보조 파일을 합친 차트와 보조 레인 수. `hasExtraLaneCount`는 파일이 `extraLaneCount`를 직접 적었는지다. */
export interface LoadedEditorChartAsset {
  chart: ChartDocument;
  extraLaneCount: number;
  hasExtraLaneCount: boolean;
}

/**
 * 지원되는 main/aux 문서를 의미 위반도 보존해 수리용으로 연다. 미지원·손상 보조 자료를 빈 보조 데이터로 열지 않는다.
 * `extraText`가 null(별도 보조 파일 없음)일 때만 메인 내장 보조 데이터로 돌아간다.
 */
export function loadEditorChartAsset(
  chartText: string, extraText: string | null, song?: SongSharedData | null,
): LoadedEditorChartAsset {
  let chart = deserializeChartDocument(chartText);
  // chartText는 위에서 이미 JSON으로 읽혔다.
  const extraJson = extraText === null ? JSON.parse(chartText) : parseExtraFileJson(extraText);
  const extra = parseExtraNotesDocument(extraJson);
  const hasExtraLaneCount = extraJson.extraLaneCount !== undefined;
  if (extraText !== null || extra.extraNotes.length > 0 || extra.extraTrillZones.length > 0 || hasExtraLaneCount) {
    // 메인의 보조 레인(5+) 항목만 보조 자료로 교체한다. 메인 레인(1～4)만 남기면 lane 0·비정수처럼
    // 성립하지 않는 레인의 항목이 검증 전에 사라져, 위반 표시 없이 다음 저장에서 지워진다.
    chart = { ...chart, notes: [...chart.notes.filter(note => !isAuxLane(note.lane)), ...extra.extraNotes.map(note => extraToNote(note))],
      trillZones: [...chart.trillZones.filter(zone => !isAuxLane(zone.lane)), ...extra.extraTrillZones] };
  }
  const extraLaneCount = Math.max(extra.extraLaneCount, toAuxIndex(maxAuxLane([...chart.notes, ...chart.trillZones])));
  return { chart: resolveSongChart(chart, song), extraLaneCount, hasExtraLaneCount };
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
 * 별도 보조 파일을 읽는다. required가 false인 구형 경로에서만 없는 객체를 null로 돌려준다.
 * 권한·서버 오류나 네트워크 오류를 보조 없음으로 열면 저장이 기존 보조 파일을 지우므로 오류로 전달한다.
 */
export async function fetchEditorExtraText(url: string, fetchImpl: typeof fetch = fetch, required = false): Promise<string | null> {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (response.ok) return response.text();
  if (!required && await isMissingStorageObject(response)) return null;
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

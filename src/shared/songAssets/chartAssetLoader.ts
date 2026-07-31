import {
  songChartExtraPath,
  songChartExtraRevisionPath,
  songChartPath,
  songChartRevisionPath,
} from "../storage";
import { assertValidChartAssetRevision } from "./chartAssetRevision";
import type { ChartAssetTarget } from "./chartAssetPersistence";

export interface PublishedChartAssetPaths {
  chartPath: string;
  extraPath: string;
  revision: string | null;
}

export async function resolvePublishedChartAssetPaths(
  target: ChartAssetTarget,
  getPublishedRevision: (target: ChartAssetTarget) => Promise<string | null>,
): Promise<PublishedChartAssetPaths> {
  let revision: string | null;
  try {
    revision = await getPublishedRevision(target);
  } catch {
    throw new Error("차트 asset revision 가져오기 실패");
  }
  if (revision === null) {
    return {
      chartPath: songChartPath(target.songId, target.difficulty),
      extraPath: songChartExtraPath(target.songId, target.difficulty),
      revision: null,
    };
  }
  assertValidChartAssetRevision(revision);
  return {
    chartPath: songChartRevisionPath(target.songId, target.difficulty, revision),
    extraPath: songChartExtraRevisionPath(target.songId, target.difficulty, revision),
    revision,
  };
}

export async function fetchPublishedMainChartText(
  target: ChartAssetTarget,
  getPublishedRevision: (target: ChartAssetTarget) => Promise<string | null>,
  getPublicUrl: (path: string) => string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const paths = await resolvePublishedChartAssetPaths(target, getPublishedRevision);
  let response: Response;
  try {
    response = await fetcher(getPublicUrl(paths.chartPath), { cache: "no-store" });
  } catch {
    throw new Error("차트 가져오기 실패: 네트워크 오류");
  }
  if (!response.ok) {
    throw new Error(`차트 가져오기 실패: HTTP ${response.status}`);
  }
  try {
    return await response.text();
  } catch {
    throw new Error("차트 가져오기 실패: 응답 읽기 오류");
  }
}

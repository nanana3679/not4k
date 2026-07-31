import {
  songChartExtraPath,
  songChartExtraRevisionPath,
  songChartManifestPath,
  songChartPath,
  songChartRevisionPath,
} from "../storage";
import { parseChartAssetManifest } from "./chartAssetManifest";
import type { ChartAssetTarget } from "./chartAssetPersistence";

export interface PublishedChartAssetPaths {
  chartPath: string;
  extraPath: string;
  revision: string | null;
}

export async function resolvePublishedChartAssetPaths(
  target: ChartAssetTarget,
  getPublicUrl: (path: string) => string,
  fetcher: typeof fetch = fetch,
): Promise<PublishedChartAssetPaths> {
  const manifestPath = songChartManifestPath(target.songId, target.difficulty);
  let response: Response;
  try {
    response = await fetcher(getPublicUrl(manifestPath), { cache: "no-store" });
  } catch {
    throw new Error("차트 manifest 가져오기 실패: 네트워크 오류");
  }

  if (response.status === 404) {
    return {
      chartPath: songChartPath(target.songId, target.difficulty),
      extraPath: songChartExtraPath(target.songId, target.difficulty),
      revision: null,
    };
  }
  if (!response.ok) {
    throw new Error(`차트 manifest 가져오기 실패: HTTP ${response.status}`);
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new Error("차트 manifest 가져오기 실패: 응답 읽기 오류");
  }
  const manifest = parseChartAssetManifest(text);
  return {
    chartPath: songChartRevisionPath(target.songId, target.difficulty, manifest.revision),
    extraPath: songChartExtraRevisionPath(target.songId, target.difficulty, manifest.revision),
    revision: manifest.revision,
  };
}

export async function fetchPublishedMainChartText(
  target: ChartAssetTarget,
  getPublicUrl: (path: string) => string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const paths = await resolvePublishedChartAssetPaths(target, getPublicUrl, fetcher);
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

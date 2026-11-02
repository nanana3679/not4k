import { STORAGE_BUCKET, resolveChartAssetPaths } from '../shared/storage';
import { supabase } from '../supabase/client';
import type { StoredChartRow } from '../supabase/chartRows';
import { fetchSongChartSource, type LoadedSongSharedData } from '../supabase/songSharedData';
import { fetchEditorExtraText } from './chartAssetLoad';

/** 에디터가 차트를 열 때 받는 원문과 곡 행·`charts` 행. 행은 차트 저장의 대상(ID·리비전)이다. */
export interface EditorChartSource {
  chartText: string;
  /** 구형 NULL 경로의 보조 파일이 없으면 null(메인 내장 자료로 돌아간다). 명시된 경로의 누락은 오류다. */
  extraText: string | null;
  song: LoadedSongSharedData | null;
  chartRow: StoredChartRow | null;
}

/**
 * 곡 행과 `charts` 행을 먼저 읽고, 행의 `chart_path`·`chart_extra_path`(NULL이면 기존 결정적 경로)로
 * 메인·보조 JSON을 캐시 없이 받는다(RFD 0107). 차트 파일이 없거나 실패하면 로드 오류다.
 */
export async function fetchEditorChart(songId: string, difficulty: string): Promise<EditorChartSource> {
  const { song, chartRow } = await fetchSongChartSource(songId, difficulty);
  const paths = resolveChartAssetPaths(songId, difficulty, chartRow);
  const [chartText, extraText] = await Promise.all([
    fetch(publicUrl(paths.chartPath), { cache: 'no-store' }).then((res) => {
      if (!res.ok) throw new Error(`Chart fetch failed: ${res.status}`);
      return res.text();
    }),
    // 명시된 경로는 반드시 읽어야 한다. 구형 NULL 경로에서만 404·NoSuchKey를 보조 없음으로 본다.
    fetchEditorExtraText(publicUrl(paths.extraPath), fetch, chartRow?.chartExtraPath != null),
  ]);
  return { chartText, extraText, song, chartRow };
}

function publicUrl(path: string): string {
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
